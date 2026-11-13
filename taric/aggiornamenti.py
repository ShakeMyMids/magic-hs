"""Nuove versioni del programma dalla pagina delle versioni di GitHub, installate da sole su ogni PC.

Il programma chiede a GitHub l'ultima versione (al massimo ogni sei ore, oppure quando lo si chiede da Impostazioni).
Se e' piu' recente di quella in uso, scarica magic-hs-windows-<versione>.zip, lo controlla (dimensione, impronta SHA-256
indicata da GitHub, struttura e versione) e lo estrae in %LOCALAPPDATA%\\MAGIC HS\\programma\\<versione>, scrivendo
la versione in attuale.txt: «Avvia MAGIC HS.cmd» la usa dalla volta successiva. Non serve scrivere nella cartella da cui
si avvia MAGIC HS, che puo' anche essere in sola lettura.
"""
from __future__ import annotations

import hashlib
import logging
import os
import re
import secrets
import shutil
import threading
import time
import zipfile
from pathlib import Path
from typing import Any

import httpx

from . import __version__

log = logging.getLogger("taric.aggiornamenti")

RE_TAG = re.compile(r"^v?(\d{1,4}(?:\.\d{1,4}){1,3})$")
RE_VERSIONE_PROGRAMMA = re.compile(r"^[0-9A-Za-z][0-9A-Za-z.\-]{0,39}$")
MAX_ESTRATTO = 1024 * 1024 * 1024
MAX_PACCHETTO = 400 * 1024 * 1024
OGNI = 6 * 3600                 # secondi tra un controllo automatico e l'altro


class ErroreAggiornamento(Exception):
    pass


def versione_pacchetto(archivio: Path) -> str:
    """Versione di un pacchetto del programma per Windows; ErroreAggiornamento se il file non è un pacchetto valido."""
    try:
        with zipfile.ZipFile(archivio) as z:
            nomi = set(z.namelist())
            if "python/pythonw.exe" not in nomi or "python/Lib/site-packages/taric/__init__.py" not in nomi:
                raise ErroreAggiornamento("non è un pacchetto di MAGIC HS per Windows")
            testo = z.read("python/Lib/site-packages/taric/__init__.py").decode("utf-8", "replace")
            if z.testzip() is not None:
                raise ErroreAggiornamento("archivio danneggiato")
    except (zipfile.BadZipFile, OSError) as e:
        raise ErroreAggiornamento(f"archivio non leggibile ({e})")
    m = re.search(r'^__version__\s*=\s*"([^"]+)"', testo, re.M)
    if not m or not RE_VERSIONE_PROGRAMMA.match(m.group(1)):
        raise ErroreAggiornamento("versione del programma non trovata nel pacchetto")
    return m.group(1)


def estrai_pacchetto(archivio: Path, dest: Path) -> None:
    """Estrae il pacchetto (solo la cartella python/, senza percorsi fuori da dest) in dest, che non deve esistere."""
    dest.mkdir(parents=True)
    radice = dest.resolve()
    with zipfile.ZipFile(archivio) as z:
        membri = [i for i in z.infolist() if not i.is_dir() and i.filename.startswith("python/")]
        if sum(i.file_size for i in membri) > MAX_ESTRATTO:
            raise ErroreAggiornamento("pacchetto troppo grande una volta estratto")
        for i in membri:
            nome = i.filename.replace("\\", "/")
            f = (dest / nome).resolve()
            if ".." in nome.split("/") or ":" in nome or not str(f).startswith(str(radice) + os.sep):
                raise ErroreAggiornamento("percorso non valido nel pacchetto")
            f.parent.mkdir(parents=True, exist_ok=True)
            with z.open(i) as sorgente, open(f, "wb") as uscita:
                shutil.copyfileobj(sorgente, uscita, 1 << 20)


def installa_pacchetto(archivio: Path, programmi: Path) -> str:
    """Installa un pacchetto controllato in programmi/<versione> e lo indica in attuale.txt per il prossimo avvio."""
    versione = versione_pacchetto(archivio)
    dest = programmi / versione
    if not (dest / "python" / "pythonw.exe").is_file():
        tmp = programmi / f"{versione}.{secrets.token_hex(3)}.tmp"
        try:
            estrai_pacchetto(archivio, tmp)
            if dest.exists():
                shutil.rmtree(dest, ignore_errors=True)
            os.replace(tmp, dest)
        finally:
            shutil.rmtree(tmp, ignore_errors=True)
    segna_attuale(programmi, versione)
    return versione


def segna_attuale(programmi: Path, versione: str) -> None:
    """Scrive in attuale.txt la versione che «Avvia MAGIC HS.cmd» usera' dalla prossima volta."""
    nuovo = programmi / f"attuale.{secrets.token_hex(3)}.tmp"
    nuovo.write_bytes(f"{versione}\r\n".encode())        # a capo di Windows, per «set /p» dell'avvio
    os.replace(nuovo, programmi / "attuale.txt")


def chiave(versione: str) -> tuple[int, ...] | None:
    """Versione confrontabile (1.2.10 > 1.2.9); None se non è nella forma numerica delle versioni pubblicate."""
    m = RE_TAG.match(versione or "")
    return tuple(int(x) for x in m.group(1).split(".")) if m else None


def piu_recente(nuova: str, rispetto: str) -> bool:
    a, b = chiave(nuova), chiave(rispetto)
    if a is None:
        return False
    return b is None or a > b


class Aggiornamenti:
    def __init__(self, url: str, client: httpx.Client | None = None):
        self.url = url
        self.client = client or httpx.Client(timeout=httpx.Timeout(30, connect=10), follow_redirects=True,
                                             headers={"user-agent": f"MAGIC-HS/{__version__}"})
        self._ultima: dict[str, Any] | None = None
        self._quando = 0.0
        self._lock = threading.Lock()

    def ultima(self, forza: bool = False) -> dict[str, Any]:
        """Ultima versione pubblicata su GitHub: {versione, url, dimensione, sha256, pagina, data} oppure {errore}."""
        if not self.url:
            return {"errore": "controllo delle versioni spento"}
        with self._lock:
            if not forza and self._ultima is not None and time.monotonic() - self._quando < OGNI:
                return self._ultima
            try:
                self._ultima = self._leggi()
            except ErroreAggiornamento as e:
                self._ultima = {"errore": str(e)}
            self._quando = time.monotonic()
            return self._ultima

    def _leggi(self) -> dict[str, Any]:
        try:
            r = self.client.get(self.url, headers={"accept": "application/vnd.github+json"}, timeout=15)
        except httpx.HTTPError as e:
            log.warning("controllo delle versioni non riuscito: %s", e)
            raise ErroreAggiornamento("GitHub non risponde: controlla la connessione o il proxy aziendale")
        if r.status_code in (403, 429):        # limite di richieste all'API per indirizzo (molti PC dietro la stessa rete)
            raise ErroreAggiornamento("GitHub ha ricevuto troppe richieste da questa rete: riprovo più tardi")
        if r.status_code != 200:
            raise ErroreAggiornamento(f"GitHub risponde con l'errore {r.status_code}")
        try:
            d = r.json()
        except ValueError:
            raise ErroreAggiornamento("risposta di GitHub non leggibile")
        m = RE_TAG.match(str(d.get("tag_name") or ""))
        if not m or d.get("draft") or d.get("prerelease"):
            raise ErroreAggiornamento("nessuna versione pubblicata")
        versione = m.group(1)
        nome = f"magic-hs-windows-{versione}.zip"
        asset = next((a for a in d.get("assets") or [] if isinstance(a, dict) and a.get("name") == nome), None)
        url = str((asset or {}).get("browser_download_url") or "")
        if asset is None or not (url.startswith("https://") or url.startswith("http://127.0.0.1:")):   # 127.0.0.1: prove
            raise ErroreAggiornamento(f"la versione {versione} non ha ancora il pacchetto per Windows")
        digest = str(asset.get("digest") or "")
        return {"versione": versione, "url": url, "dimensione": int(asset.get("size") or 0),
                "sha256": digest[7:].lower() if digest.startswith("sha256:") else "",
                "pagina": str(d.get("html_url") or ""), "data": str(d.get("published_at") or "")}

    def installa(self, info: dict[str, Any], programmi: Path, lavoro: Path) -> str:
        """Scarica, controlla e installa la versione indicata da ultima(); restituisce la versione installata."""
        lavoro.mkdir(parents=True, exist_ok=True)
        programmi.mkdir(parents=True, exist_ok=True)
        dest = lavoro / f"programma-{secrets.token_hex(6)}.zip"
        try:
            self.scarica(info, dest)
            if versione_pacchetto(dest) != info["versione"]:
                raise ErroreAggiornamento("il pacchetto non contiene la versione attesa")
            return installa_pacchetto(dest, programmi)
        finally:
            dest.unlink(missing_ok=True)

    def scarica(self, info: dict[str, Any], dest: Path) -> None:
        """Scarica il pacchetto indicato da ultima() e ne controlla dimensione e impronta."""
        h = hashlib.sha256()
        totale = 0
        try:
            with self.client.stream("GET", info["url"], timeout=httpx.Timeout(120, connect=15)) as r:
                if r.status_code != 200:
                    raise ErroreAggiornamento(f"download non riuscito (errore {r.status_code})")
                with open(dest, "wb") as f:
                    for blocco in r.iter_bytes(1 << 20):
                        totale += len(blocco)
                        if totale > MAX_PACCHETTO:
                            raise ErroreAggiornamento("pacchetto troppo grande")
                        h.update(blocco)
                        f.write(blocco)
        except httpx.HTTPError as e:
            log.warning("download del pacchetto non riuscito: %s", e)
            raise ErroreAggiornamento("download interrotto: riprova")
        if info.get("dimensione") and totale != info["dimensione"]:
            raise ErroreAggiornamento("pacchetto incompleto: riprova")
        if info.get("sha256") and h.hexdigest() != info["sha256"]:
            raise ErroreAggiornamento("il pacchetto scaricato non corrisponde a quello pubblicato")


__all__ = ["Aggiornamenti", "ErroreAggiornamento", "chiave", "installa_pacchetto", "piu_recente", "segna_attuale", "versione_pacchetto"]
