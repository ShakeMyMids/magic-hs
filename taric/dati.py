"""Dati TARIC: versioni installate, aggiornamento mensile (automatico, manuale o da archivio caricato)
e pianificatore. Ogni versione sta in dati/taric/versioni/AAAA-MM-01; quella in uso e' scritta in attiva.txt
e cambia solo dopo che lo script di generazione ha superato tutti i controlli."""
from __future__ import annotations

import json
import logging
import os
import re
import secrets
import shutil
import subprocess
import sys
import threading
import time
import zipfile
from datetime import datetime
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo

import httpx

from .config import Config
from .db import Database, adesso, da_iso, iso, tra
from .posta import Posta

log = logging.getLogger("taric.dati")

AGGIORNA = Path(__file__).with_name("aggiorna.py")
TABELLA_IT = Path(__file__).with_name("nomenclatura_it.json")
RE_VERSIONE = re.compile(r"^\d{4}-\d{2}-01$")
RE_FILE = re.compile(r"^(?:nomenclatura|rif|note)\.js$|^m/\d\d\.js$|^versione\.json$|^riepilogo\.txt$")
VERSIONI_TENUTE = 3
MAX_ZIP = 300 * 1024 * 1024
MAX_ESTRATTO = 1536 * 1024 * 1024


class GestoreDati:
    def __init__(self, cfg: Config, db: Database, posta: Posta):
        self.cfg, self.db, self.posta = cfg, db, posta
        self.base = cfg.dati / "taric"
        self.versioni = self.base / "versioni"
        self.lavoro = self.base / "lavoro"
        self.it = self.base / "nomenclatura_it.json"
        for d in (self.versioni, self.lavoro):
            d.mkdir(parents=True, exist_ok=True)
        if not self.it.exists():
            shutil.copyfile(TABELLA_IT, self.it)
        for vecchio in self.lavoro.iterdir():          # resti di un aggiornamento interrotto
            shutil.rmtree(vecchio, ignore_errors=True)
        self._lock = threading.Lock()
        self.in_corso: dict[str, Any] | None = None
        self._fermo = threading.Event()
        with db.connessione() as c:   # un aggiornamento rimasto "in corso" e' stato interrotto da un riavvio
            c.execute("UPDATE aggiornamenti SET esito = 'interrotto', finito = ? WHERE esito = 'in_corso'", (iso(),))

    # ------------------------------------------------------------------ versioni
    def attiva(self) -> str | None:
        f = self.base / "attiva.txt"
        try:
            v = f.read_text(encoding="utf-8").strip()
        except OSError:
            return None
        return v if RE_VERSIONE.match(v) and (self.versioni / v / "nomenclatura.js").is_file() else None

    def imposta_attiva(self, versione: str) -> None:
        if not RE_VERSIONE.match(versione) or not (self.versioni / versione / "nomenclatura.js").is_file():
            raise ValueError("versione inesistente")
        tmp = self.base / f"attiva.{secrets.token_hex(4)}.tmp"
        tmp.write_text(versione, encoding="utf-8")
        os.replace(tmp, self.base / "attiva.txt")

    def file(self, versione: str, percorso: str) -> Path | None:
        if not RE_VERSIONE.match(versione) or not RE_FILE.match(percorso):
            return None
        p = self.versioni / versione / percorso
        return p if p.is_file() else None

    def info_versione(self, versione: str) -> dict[str, Any]:
        try:
            return json.loads((self.versioni / versione / "versione.json").read_text(encoding="utf-8"))
        except (OSError, ValueError):
            return {"data": versione}

    def elenco(self) -> list[dict[str, Any]]:
        att = self.attiva()
        out = []
        for d in sorted(self.versioni.iterdir(), reverse=True):
            if d.is_dir() and RE_VERSIONE.match(d.name) and (d / "nomenclatura.js").is_file():
                info = self.info_versione(d.name)
                info["versione"] = d.name
                info["attiva"] = d.name == att
                out.append(info)
        return out

    def _pota(self) -> None:
        att = self.attiva()
        nomi = sorted((d.name for d in self.versioni.iterdir() if d.is_dir() and RE_VERSIONE.match(d.name)), reverse=True)
        for n in nomi[VERSIONI_TENUTE:]:
            if n != att:
                shutil.rmtree(self.versioni / n, ignore_errors=True)

    # ------------------------------------------------------------------ aggiornamento
    def avvia(self, mese: str, origine: str, archivio: Path | None = None, autore_id: int | None = None) -> bool:
        """Avvia l'aggiornamento in un thread; False se ce n'e' gia' uno in corso."""
        if not self._lock.acquire(blocking=False):
            if archivio:
                archivio.unlink(missing_ok=True)
            return False
        self.in_corso = {"mese": mese, "origine": origine, "iniziato": iso(), "fase": "avvio"}
        threading.Thread(target=self._esegui_con_lock, args=(mese, origine, archivio, autore_id), daemon=True).start()
        return True

    def esegui(self, mese: str, origine: str, archivio: Path | None = None, autore_id: int | None = None) -> dict[str, Any]:
        """Aggiornamento sincrono (riga di comando e test)."""
        with self._lock:
            self.in_corso = {"mese": mese, "origine": origine, "iniziato": iso(), "fase": "avvio"}
            try:
                return self._esegui(mese, origine, archivio, autore_id)
            finally:
                self.in_corso = None

    def _esegui_con_lock(self, *a: Any) -> None:
        try:
            self._esegui(*a)
        except Exception:  # pragma: no cover - gia' registrato in _esegui
            log.exception("aggiornamento non riuscito")
        finally:
            self.in_corso = None
            self._lock.release()

    def _fase(self, testo: str) -> None:
        if self.in_corso is not None:
            self.in_corso["fase"] = testo
        log.info("aggiornamento dati: %s", testo)

    def _esegui(self, mese: str, origine: str, archivio: Path | None, autore_id: int | None) -> dict[str, Any]:
        if not re.match(r"^\d{4}-\d{2}$", mese):
            raise ValueError("mese non valido")
        with self.db.transazione() as c:
            agg_id = c.execute("INSERT INTO aggiornamenti(iniziato, mese, origine) VALUES (?, ?, ?)", (iso(), mese, origine)).lastrowid
        cartella = self.lavoro / f"{mese}-{secrets.token_hex(4)}"
        (cartella / "xlsx").mkdir(parents=True)
        esito, messaggio, registro = "errore", "", ""
        try:
            zip_path = cartella / "estrazione.zip"
            if archivio is not None:
                shutil.move(str(archivio), zip_path)
            else:
                self._fase("scarico l'estrazione del mese")
                if not self._scarica(self.cfg.fonte_url.format(mese=mese), zip_path):
                    esito, messaggio = "non_disponibile", f"L'estrazione di {mese} non è ancora disponibile alla fonte."
                    return self._chiudi(agg_id, esito, messaggio, registro, mese, autore_id)
            self._fase("estraggo i file Excel")
            self._estrai(zip_path, cartella / "xlsx")
            zip_path.unlink(missing_ok=True)
            it_lavoro = cartella / "nomenclatura_it.json"
            shutil.copyfile(self.it, it_lavoro)
            att = self.attiva()
            cmd = [sys.executable, "-I", str(AGGIORNA), "--src", str(cartella / "xlsx"), "--out", str(cartella / "out" / "data"),
                   "--it", str(it_lavoro), "--data", f"{mese}-01"]
            if att and att <= f"{mese}-01":
                cmd += ["--prec", str(self.versioni / att / "versione.json")]
            self._fase("genero e controllo i dati (circa un minuto)")
            p = subprocess.run(cmd, capture_output=True, text=True, timeout=1800, cwd=cartella)
            registro = (p.stdout + ("\n" + p.stderr if p.stderr else ""))[-12000:]
            righe = [r for r in p.stdout.splitlines() if r.strip()]
            if p.returncode != 0 or not righe or righe[-1].strip() != "CONTROLLI OK":
                falliti = [r.strip() for r in p.stdout.splitlines() if r.strip().startswith(("-", "ERRORE"))]
                messaggio = "Controlli non superati: " + ("; ".join(falliti)[:600] or f"codice di uscita {p.returncode}")
                return self._chiudi(agg_id, "errore", messaggio, registro, mese, autore_id)
            self._fase("installo la nuova versione")
            out = cartella / "out" / "data"
            (out / "pubblica.json").unlink(missing_ok=True)
            riepilogo = cartella / "out" / "riepilogo.txt"
            if riepilogo.exists():
                shutil.copyfile(riepilogo, out / "riepilogo.txt")
            dest = self.versioni / f"{mese}-01"
            if dest.exists():
                vecchia = dest.with_name(dest.name + ".vecchia-" + secrets.token_hex(3))
                os.replace(dest, vecchia)
                shutil.rmtree(vecchia, ignore_errors=True)
            os.replace(out, dest)
            info = self.info_versione(dest.name)
            if info.get("it_aggiornato"):
                os.replace(it_lavoro, self.it)
            if att is None or dest.name >= att:
                self.imposta_attiva(dest.name)
            self._pota()
            messaggio = (f"Installati i dati TARIC di {mese}: {info.get('righe', '?')} righe, {info.get('dichiarabili', '?')} codici "
                         f"dichiarabili, {info.get('misure_import', '?')} misure all'importazione.")
            if info.get("avvisi"):
                messaggio += " Avvisi: " + "; ".join(info["avvisi"])[:600]
            return self._chiudi(agg_id, "ok", messaggio, registro, mese, autore_id)
        except subprocess.TimeoutExpired:
            return self._chiudi(agg_id, "errore", "La generazione dei dati ha superato il tempo massimo.", registro, mese, autore_id)
        except Exception as e:
            log.exception("aggiornamento dati %s", mese)
            return self._chiudi(agg_id, "errore", f"{type(e).__name__}: {e}"[:600], registro, mese, autore_id)
        finally:
            shutil.rmtree(cartella, ignore_errors=True)

    def _chiudi(self, agg_id: int, esito: str, messaggio: str, registro: str, mese: str, autore_id: int | None) -> dict[str, Any]:
        with self.db.transazione() as c:
            c.execute("UPDATE aggiornamenti SET finito = ?, esito = ?, messaggio = ?, registro = ? WHERE id = ?",
                      (iso(), esito, messaggio, registro, agg_id))
            self.db.evento(c, "dati_" + esito, autore_id=autore_id, dettagli=f"{mese}: {messaggio}")
            amministratori = [r["email"] for r in c.execute("SELECT email FROM utenti WHERE ruolo = 'amministratore' AND stato = 'attivo'")]
        avvisa = esito == "ok" or esito == "errore" or (esito == "non_disponibile" and self._giorno_locale() >= 8 and autore_id is None)
        if avvisa:
            oggetto = {"ok": f"MAGIC HS: dati di {mese} installati", "errore": f"MAGIC HS: aggiornamento dei dati di {mese} NON riuscito",
                       "non_disponibile": f"MAGIC HS: l'estrazione di {mese} non è ancora disponibile"}[esito]
            testo = messaggio + ("\n\nLa pagina continua a usare i dati della versione precedente. Dal pannello di amministrazione puoi "
                                 "riprovare o caricare a mano l'archivio dell'estrazione." if esito != "ok" else "")
            if esito == "errore" and registro:
                testo += "\n\nUltime righe del registro:\n" + "\n".join(registro.splitlines()[-25:])
            for a in amministratori:
                self.posta.invia(a, oggetto, testo)
        log.info("aggiornamento %s: %s - %s", mese, esito, messaggio)
        return {"esito": esito, "messaggio": messaggio}

    def _scarica(self, url: str, dest: Path) -> bool:
        with httpx.Client(timeout=httpx.Timeout(120, connect=20), follow_redirects=True) as cl:
            with cl.stream("GET", url) as r:
                if r.status_code == 404:
                    return False
                r.raise_for_status()
                totale = 0
                with open(dest, "wb") as f:
                    for blocco in r.iter_bytes(1 << 20):
                        totale += len(blocco)
                        if totale > MAX_ZIP:
                            raise ValueError("archivio troppo grande")
                        f.write(blocco)
        return True

    @staticmethod
    def _estrai(zip_path: Path, dest: Path) -> None:
        """Estrae solo i file .xlsx, senza sottocartelle, con limiti di numero e dimensione (archivio non fidato)."""
        with zipfile.ZipFile(zip_path) as z:
            membri = [i for i in z.infolist() if not i.is_dir() and i.filename.lower().endswith(".xlsx")]
            if not membri:
                raise ValueError("l'archivio non contiene file .xlsx")
            if len(membri) > 100 or sum(i.file_size for i in membri) > MAX_ESTRATTO:
                raise ValueError("archivio con troppi file o troppo grande una volta estratto")
            for i in membri:
                nome = Path(i.filename.replace("\\", "/")).name
                if not nome or nome.startswith("."):
                    continue
                with z.open(i) as sorgente, open(dest / nome, "wb") as f:
                    copiati = 0
                    while blocco := sorgente.read(1 << 20):
                        copiati += len(blocco)
                        if copiati > i.file_size + 1024:
                            raise ValueError("dimensione del file nell'archivio non coerente")
                        f.write(blocco)

    # ------------------------------------------------------------------ pianificatore
    def _ora_locale(self) -> datetime:
        try:
            return datetime.now(ZoneInfo(self.cfg.fuso))
        except Exception:
            return datetime.now()

    def _giorno_locale(self) -> int:
        return self._ora_locale().day

    def da_fare(self) -> str | None:
        """Mese da aggiornare adesso secondo le regole automatiche, oppure None."""
        ora = self._ora_locale()
        mese = ora.strftime("%Y-%m")
        att = self.attiva()
        if att and att[:7] >= mese:
            return None
        if att and not self.cfg.aggiornamento_automatico:
            return None
        with self.db.connessione() as c:
            tentativi = c.execute("SELECT esito, finito FROM aggiornamenti WHERE mese = ? ORDER BY id DESC", (mese,)).fetchall()
        errori = sum(1 for t in tentativi if t["esito"] == "errore")
        if errori >= 3:
            return None                       # dopo tre errori nello stesso mese decide l'amministratore
        if tentativi and tentativi[0]["finito"]:
            attesa_ore = 6 if tentativi[0]["esito"] == "errore" else 3
            if (adesso() - da_iso(tentativi[0]["finito"])).total_seconds() < attesa_ore * 3600:
                return None
        return mese

    def avvia_pianificatore(self, registrazioni: Any) -> None:
        def ciclo() -> None:
            ultima_pulizia = 0.0
            self._fermo.wait(10)
            while not self._fermo.is_set():
                try:
                    if time.time() - ultima_pulizia > 6 * 3600:
                        with self.db.transazione() as c:
                            registrazioni.pulizia(c)
                        ultima_pulizia = time.time()
                    mese = self.da_fare()
                    if mese and self.in_corso is None:
                        if self.attiva() is None:
                            # primo avvio: se il mese corrente non c'e' ancora, si parte da quello precedente
                            r = self.esegui(mese, "automatico")
                            if r["esito"] == "non_disponibile":
                                ora = self._ora_locale()
                                prec = f"{ora.year - (ora.month == 1)}-{(ora.month - 2) % 12 + 1:02d}"
                                self.esegui(prec, "automatico")
                        else:
                            self.esegui(mese, "automatico")
                except Exception:
                    log.exception("pianificatore")
                self._fermo.wait(1800)
        threading.Thread(target=ciclo, name="taric-pianificatore", daemon=True).start()

    def ferma(self) -> None:
        self._fermo.set()

    def ultimi(self, limite: int = 20) -> list[dict[str, Any]]:
        with self.db.connessione() as c:
            return [dict(r) for r in c.execute(
                "SELECT id, iniziato, finito, mese, origine, esito, messaggio FROM aggiornamenti ORDER BY id DESC LIMIT ?", (limite,))]

    def registro(self, agg_id: int) -> str:
        with self.db.connessione() as c:
            r = c.execute("SELECT registro FROM aggiornamenti WHERE id = ?", (agg_id,)).fetchone()
        return r["registro"] if r else ""


__all__ = ["GestoreDati", "tra"]
