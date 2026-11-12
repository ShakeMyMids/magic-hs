"""Programma per Windows: avvia MAGIC HS sul PC, lo apre nel browser e si chiude da solo quando non serve più.

Lo lancia «Avvia MAGIC HS.cmd» dalla cartella condivisa (OneDrive), dopo aver copiato il programma sul PC:

    pythonw.exe -I -m taric.programma --condivisa "<cartella condivisa>"

- Una sola copia per utente di Windows: se è già aperta, apre solo il browser; se è aperta una versione diversa,
  le chiede di chiudersi e prende il suo posto.
- Ascolta solo su 127.0.0.1, su una porta libera (di solito sempre la stessa, così il browser ricorda il tema).
- Il browser entra con una chiave casuale scritta in istanza.json, nella cartella dell'utente (%LOCALAPPDATA%).
- Si chiude dopo un periodo senza richieste (la pagina aperta ne manda una ogni due minuti).
- Registro in %LOCALAPPDATA%\\MAGIC HS\\registro.txt; gli errori d'avvio compaiono in una finestra di Windows.

Dati del PC (storico, preferiti, uso dell'IA, dati TARIC ricevuti) in %LOCALAPPDATA%\\MAGIC HS\\dati.
"""
from __future__ import annotations

import argparse
import json
import logging
import logging.handlers
import os
import secrets
import shutil
import socket
import sys
import threading
import time
import webbrowser
from pathlib import Path
from typing import Any

import httpx

from . import __version__

log = logging.getLogger("taric.programma")
PORTA_PREFERITA = 8765
INATTIVITA = 30 * 60          # secondi senza richieste prima di chiudersi


def cartella_utente() -> Path:
    base = os.environ.get("LOCALAPPDATA") or str(Path.home() / ".local" / "share")
    return Path(base) / "MAGIC HS"


def avviso(testo: str) -> None:
    """Messaggio per chi ha fatto doppio clic: con pythonw non c'è una console."""
    log.error(testo)
    if sys.platform == "win32":
        try:
            import ctypes
            ctypes.windll.user32.MessageBoxW(None, testo, "MAGIC HS", 0x10 | 0x40000)    # icona d'errore, in primo piano
            return
        except Exception:
            pass
    print(testo, file=sys.stderr)


def _prepara_registro(cartella: Path, console: bool) -> None:
    # con pythonw.exe stdout e stderr non esistono: chi ci scrive (uvicorn, warnings) non deve fallire
    for nome in ("stdout", "stderr"):
        if getattr(sys, nome) is None:
            setattr(sys, nome, open(os.devnull, "w", encoding="utf-8"))
    gestori: list[logging.Handler] = [logging.handlers.RotatingFileHandler(
        cartella / "registro.txt", maxBytes=1_000_000, backupCount=2, encoding="utf-8")]
    if console:
        gestori.append(logging.StreamHandler(sys.stderr))
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s", handlers=gestori, force=True)
    logging.getLogger("httpx").setLevel(logging.WARNING)


class Blocco:
    """Blocco esclusivo su un file, rilasciato dal sistema anche se il programma si chiude male."""

    def __init__(self, percorso: Path):
        self.percorso = percorso
        self._f: Any = None

    def prendi(self) -> bool:
        f = open(self.percorso, "a+b")
        try:
            if sys.platform == "win32":
                import msvcrt
                f.seek(0)
                msvcrt.locking(f.fileno(), msvcrt.LK_NBLCK, 1)
            else:
                import fcntl
                fcntl.flock(f.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        except OSError:
            f.close()
            return False
        self._f = f
        return True

    def lascia(self) -> None:
        if self._f is not None:
            self._f.close()
            self._f = None


class Istanza:
    """File istanza.json: porta, chiave d'ingresso e versione della copia in funzione."""

    def __init__(self, percorso: Path):
        self.percorso = percorso

    def leggi(self) -> dict[str, Any] | None:
        try:
            d = json.loads(self.percorso.read_text(encoding="utf-8"))
            return d if isinstance(d, dict) and isinstance(d.get("porta"), int) else None
        except (OSError, ValueError):
            return None

    def scrivi(self, dati: dict[str, Any]) -> None:
        tmp = self.percorso.with_suffix(".tmp")
        tmp.write_text(json.dumps(dati), encoding="utf-8")
        os.replace(tmp, self.percorso)

    def cancella_se(self, istanza: str) -> None:
        d = self.leggi()
        if d and d.get("istanza") == istanza:
            self.percorso.unlink(missing_ok=True)


def _url(info: dict[str, Any], percorso: str) -> str:
    return f"http://127.0.0.1:{info['porta']}{percorso}"


def risponde(info: dict[str, Any]) -> dict[str, Any] | None:
    """Risposta di /api/locale/ping della copia indicata nel file, se è proprio lei."""
    try:
        r = httpx.get(_url(info, "/api/locale/ping"), timeout=2, trust_env=False)
        d = r.json() if r.status_code == 200 else None
    except (httpx.HTTPError, ValueError):
        return None
    if isinstance(d, dict) and d.get("app") == "magic-hs" and d.get("istanza") == info.get("istanza"):
        return d
    return None


def chiedi_chiusura(info: dict[str, Any]) -> None:
    try:
        httpx.post(_url(info, "/api/locale/ferma"), json={"chiave": info.get("chiave", "")}, headers={"x-taric": "1"},
                   timeout=5, trust_env=False)
    except httpx.HTTPError:
        pass


def apri_browser(info: dict[str, Any], senza_browser: bool) -> None:
    url = _url(info, f"/entra?k={info['chiave']}")
    if senza_browser:
        log.info("pronto su %s", _url(info, "/"))
        return
    if not webbrowser.open(url):
        avviso(f"Non riesco ad aprire il browser. Apri a mano questo indirizzo:\n\n{_url(info, '/')}")


def apri_porta(preferita: int) -> socket.socket:
    """Socket in ascolto su 127.0.0.1: la porta preferita se è libera, altrimenti una delle successive o una qualsiasi."""
    for porta in [preferita, *range(preferita + 1, preferita + 20), 0]:
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        if hasattr(socket, "SO_EXCLUSIVEADDRUSE"):            # Windows: nessun altro programma puo' usare la stessa porta
            s.setsockopt(socket.SOL_SOCKET, socket.SO_EXCLUSIVEADDRUSE, 1)
        try:
            s.bind(("127.0.0.1", porta))
            s.listen(100)
            return s
        except OSError:
            s.close()
    raise OSError("nessuna porta libera su 127.0.0.1")


def pulisci_versioni(cartella: Path) -> None:
    """Toglie dal PC le versioni del programma che non servono più (tiene quella in uso e la precedente)."""
    radice = cartella / "programma"
    try:
        in_uso = Path(sys.executable).resolve().parents[1]
    except (IndexError, OSError):
        return
    if in_uso.parent != radice.resolve():
        return                                   # non e' il programma installato dall'avvio (prove, sviluppo)
    for d in radice.glob("*.tmp"):
        shutil.rmtree(d, ignore_errors=True)
    altre = sorted((d for d in radice.iterdir() if d.is_dir() and d.resolve() != in_uso), key=lambda d: d.stat().st_mtime, reverse=True)
    for d in altre[1:]:
        shutil.rmtree(d, ignore_errors=True)


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="python -m taric.programma", description="MAGIC HS sul PC")
    ap.add_argument("--condivisa", required=True, help="cartella condivisa (OneDrive) con programma, dati e impostazioni")
    ap.add_argument("--cartella", default="", help="cartella dei dati di questo utente (predefinita: %%LOCALAPPDATA%%\\MAGIC HS)")
    ap.add_argument("--porta", type=int, default=0, help="porta preferita (predefinita: l'ultima usata o 8765)")
    ap.add_argument("--inattivita", type=int, default=INATTIVITA, help="secondi senza richieste prima di chiudersi")
    ap.add_argument("--senza-browser", action="store_true", help="non aprire il browser (prove)")
    ap.add_argument("--console", action="store_true", help="scrivi il registro anche sulla console")
    a = ap.parse_args(argv)
    a.senza_browser = a.senza_browser or os.environ.get("MAGIC_HS_SENZA_BROWSER") == "1"     # prove automatiche
    cartella = Path(a.cartella) if a.cartella else cartella_utente()
    try:
        # certificati di Windows (anche quelli aziendali dei proxy che ispezionano HTTPS) per IA e download dei dati
        import truststore
        truststore.inject_into_ssl()
    except ImportError:
        pass
    try:
        cartella.mkdir(parents=True, exist_ok=True)
        _prepara_registro(cartella, a.console)
    except OSError as e:
        avviso(f"MAGIC HS non riesce a usare la cartella {cartella}:\n{e}")
        return 1
    try:
        return avvia(a, cartella)
    except Exception as e:
        log.exception("avvio non riuscito")
        avviso(f"MAGIC HS non si è avviato: {e}\n\nI dettagli sono nel file {cartella / 'registro.txt'}.")
        return 1


def avvia(a: argparse.Namespace, cartella: Path) -> int:
    condivisa = Path(a.condivisa)
    if not condivisa.is_dir():
        avviso(f"Non trovo la cartella condivisa:\n{condivisa}\n\nControlla che OneDrive sia attivo e la cartella sincronizzata.")
        return 1
    istanza_file = Istanza(cartella / "istanza.json")
    blocco = Blocco(cartella / "istanza.lock")

    # una copia e' gia' in funzione (o si sta avviando): si usa quella, se e' la stessa versione
    scadenza, chiesto = time.monotonic() + 40, False
    while not blocco.prendi():
        info = istanza_file.leggi()
        stato = risponde(info) if info else None
        if info and stato:
            if stato.get("versione") == __version__:
                apri_browser(info, a.senza_browser)
                return 0
            if not chiesto:
                log.info("chiudo la versione %s per avviare la %s", stato.get("versione"), __version__)
                chiedi_chiusura(info)
                chiesto = True
        if time.monotonic() > scadenza:
            avviso("MAGIC HS risulta già aperto ma non risponde.\n\nAspetta un minuto e riprova; se non basta, riavvia il computer.")
            return 1
        time.sleep(0.3)

    try:
        return _servi(a, cartella, condivisa, istanza_file)
    finally:
        blocco.lascia()


def _servi(a: argparse.Namespace, cartella: Path, condivisa: Path, istanza_file: Istanza) -> int:
    import uvicorn

    from .app import crea_app
    from .config import carica

    pulisci_versioni(cartella)
    precedente = istanza_file.leggi() or {}
    sock = apri_porta(a.porta or int(precedente.get("porta") or PORTA_PREFERITA))
    porta = sock.getsockname()[1]
    chiave, istanza = secrets.token_urlsafe(32), secrets.token_hex(8)
    os.environ["TARIC_CONFIG"] = str(cartella / "taric.env")       # facoltativo, per configurazioni particolari
    cfg = carica({
        "TARIC_DATI": str(cartella / "dati"), "TARIC_LOCALE": "1", "TARIC_CONDIVISA": str(condivisa),
        "TARIC_HOST": "127.0.0.1", "TARIC_PORTA": str(porta), "TARIC_COOKIE_SICURO": "no", "TARIC_URL_PUBBLICO": "",
        "TARIC_STRIPE_CHIAVE": "", "TARIC_BACKUP_COPIE": "7", "TARIC_SMTP_HOST": "",
    })
    app = crea_app(cfg, chiave_ingresso=chiave, istanza=istanza)
    # connessioni tenute aperte a lungo: con un solo utente costano poco ed evitano che il browser riusi una
    # connessione proprio mentre il server la chiude
    server = uvicorn.Server(uvicorn.Config(app, log_config=None, access_log=False, server_header=False, lifespan="on",
                                           timeout_graceful_shutdown=10, timeout_keep_alive=75))

    def ferma() -> None:
        server.should_exit = True
    app.state.ferma = ferma
    info = {"porta": porta, "chiave": chiave, "istanza": istanza, "versione": __version__, "pid": os.getpid()}
    istanza_file.scrivi(info)
    log.info("MAGIC HS %s su http://127.0.0.1:%s (cartella condivisa %s)", __version__, porta, condivisa)

    def quando_pronto() -> None:
        for _ in range(600):
            if server.started:
                apri_browser(info, a.senza_browser)
                return
            if server.should_exit:
                return
            time.sleep(0.1)
        avviso("MAGIC HS non riesce ad avviarsi: dettagli nel file registro.txt.")

    def sorveglia() -> None:
        while not server.should_exit:
            time.sleep(min(30, max(1, a.inattivita // 4)))
            ferma_dati = app.state.dati.in_corso is not None            # un aggiornamento dei dati non va interrotto
            if server.started and not ferma_dati and time.monotonic() - app.state.ultimo_contatto > a.inattivita:
                log.info("nessuna richiesta da %s: mi chiudo", f"{a.inattivita // 60} minuti" if a.inattivita >= 120 else f"{a.inattivita} secondi")
                ferma()

    threading.Thread(target=quando_pronto, name="taric-browser", daemon=True).start()
    threading.Thread(target=sorveglia, name="taric-inattivita", daemon=True).start()
    try:
        server.run(sockets=[sock])
    finally:
        istanza_file.cancella_se(istanza)
        sock.close()
    log.info("MAGIC HS chiuso")
    return 0


if __name__ == "__main__":
    sys.exit(main())
