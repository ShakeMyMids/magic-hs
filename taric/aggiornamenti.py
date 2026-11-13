"""Nuove versioni del programma dalla pagina delle versioni di GitHub, per chi gestisce MAGIC HS.

Solo il PC di chi pubblica chiede a GitHub l'ultima versione (al massimo ogni sei ore, oppure quando lo chiede dal
pannello). Se è più recente di quella pubblicata nella cartella condivisa, Gestione mostra «Aggiorna per tutti»:
il pacchetto magic-hs-windows-<versione>.zip si scarica, si controlla (dimensione, impronta SHA-256 indicata da
GitHub, struttura e versione in condivisa.versione_pacchetto) e si pubblica come se fosse stato caricato a mano.
"""
from __future__ import annotations

import hashlib
import logging
import re
import threading
import time
from pathlib import Path
from typing import Any

import httpx

from . import __version__

log = logging.getLogger("taric.aggiornamenti")

RE_TAG = re.compile(r"^v?(\d{1,4}(?:\.\d{1,4}){1,3})$")
MAX_PACCHETTO = 400 * 1024 * 1024
OGNI = 6 * 3600                 # secondi tra un controllo automatico e l'altro


class ErroreAggiornamento(Exception):
    pass


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


__all__ = ["Aggiornamenti", "ErroreAggiornamento", "chiave", "piu_recente"]
