"""Backup e ripristino del database (utenti, storico, preferiti, impostazioni, registro).

Un backup e' un archivio .zip con dentro solo "taric.db", copiato con l'API di backup di SQLite:
la copia e' coerente anche se il sito sta scrivendo. I dati TARIC non servono (si riscaricano),
la chiave segreta nemmeno (se manca se ne crea una nuova).
"""
from __future__ import annotations

import logging
import os
import re
import secrets
import shutil
import sqlite3
import time
import zipfile
from datetime import datetime
from pathlib import Path
from typing import Any

log = logging.getLogger("taric.backup")

NOME_DB = "taric.db"
RE_BACKUP = re.compile(r"^magic-hs-\d{4}-\d{2}-\d{2}-\d{6}\.zip$")
MASSIMO_DB = 4 * 1024 ** 3            # 4 GB: oltre, l'archivio non viene accettato in ripristino


class ErroreBackup(Exception):
    pass


def istantanea(sorgente: Path, dest: Path) -> None:
    """Copia coerente del database in un unico file (senza -wal)."""
    src = sqlite3.connect(sorgente, timeout=30)
    try:
        out = sqlite3.connect(dest)
        try:
            src.backup(out)
            out.execute("PRAGMA journal_mode = DELETE")
        finally:
            out.close()
    finally:
        src.close()


def controlla_db(percorso: Path) -> str:
    """Verifica che il file sia un database MAGIC HS integro; restituisce una descrizione breve."""
    from .db import SCHEMA
    try:
        c = sqlite3.connect(percorso)
        try:
            if c.execute("PRAGMA integrity_check").fetchone()[0] != "ok":
                raise ErroreBackup("il database nel backup e' danneggiato")
            versione = c.execute("PRAGMA user_version").fetchone()[0]
            tabelle = {r[0] for r in c.execute("SELECT name FROM sqlite_master WHERE type = 'table'")}
            if not {"utenti", "impostazioni", "storico"} <= tabelle:
                raise ErroreBackup("il file non e' un database di MAGIC HS")
            if versione > len(SCHEMA):
                raise ErroreBackup("il backup viene da una versione piu' recente di MAGIC HS: aggiorna prima il sito")
            n = c.execute("SELECT COUNT(*) FROM utenti").fetchone()[0]
        finally:
            c.close()
    except sqlite3.DatabaseError as e:
        raise ErroreBackup(f"il file non e' un database valido ({e})") from None
    return f"{n} utenti"


class Backup:
    def __init__(self, dati: Path, copie: int = 14):
        self.dati = dati
        self.db = dati / NOME_DB
        self.cartella = dati / "backup"
        self.copie = copie

    # ------------------------------------------------------------ elenco
    def elenco(self) -> list[dict[str, Any]]:
        if not self.cartella.is_dir():
            return []
        out = []
        for p in sorted(self.cartella.iterdir(), reverse=True):
            if RE_BACKUP.match(p.name) and p.is_file():
                st = p.stat()
                out.append({"nome": p.name, "dimensione": st.st_size,
                            "creato": datetime.fromtimestamp(st.st_mtime).astimezone().isoformat(timespec="seconds")})
        return out

    def file(self, nome: str) -> Path | None:
        if not RE_BACKUP.match(nome):
            return None
        p = self.cartella / nome
        return p if p.is_file() else None

    # ------------------------------------------------------------ creazione
    def crea(self) -> Path:
        if not self.db.exists():
            raise ErroreBackup("non c'e' ancora un database da salvare")
        self.cartella.mkdir(mode=0o700, parents=True, exist_ok=True)
        nome = f"magic-hs-{datetime.now():%Y-%m-%d-%H%M%S}.zip"
        dest = self.cartella / nome
        while dest.exists():                                   # due backup nello stesso secondo
            time.sleep(1)
            dest = self.cartella / f"magic-hs-{datetime.now():%Y-%m-%d-%H%M%S}.zip"
        tmp = self.cartella / f".in-corso-{secrets.token_hex(4)}"
        tmp.mkdir()
        try:
            copia = tmp / NOME_DB
            istantanea(self.db, copia)
            parziale = tmp / "backup.zip"
            with zipfile.ZipFile(parziale, "w", zipfile.ZIP_DEFLATED, compresslevel=6) as z:
                z.write(copia, NOME_DB)
            os.chmod(parziale, 0o600)
            os.replace(parziale, dest)
        finally:
            shutil.rmtree(tmp, ignore_errors=True)
        self.pota()
        return dest

    def pota(self) -> None:
        tieni = max(self.copie, 1)
        for vecchio in self.elenco()[tieni:]:
            (self.cartella / vecchio["nome"]).unlink(missing_ok=True)

    def da_fare(self, ore: float = 23) -> bool:
        """Backup automatico: uno al giorno, se attivo e se c'e' un database."""
        if self.copie <= 0 or not self.db.exists():
            return False
        ultimi = self.elenco()
        if not ultimi:
            return True
        p = self.cartella / ultimi[0]["nome"]
        return time.time() - p.stat().st_mtime > ore * 3600

    # ------------------------------------------------------------ ripristino (a sito fermo)
    def ripristina(self, archivio: Path) -> str:
        """Sostituisce il database con quello del backup. Va eseguito con il sito spento.
        Il database attuale viene prima salvato in un nuovo backup."""
        if not archivio.is_file():
            raise ErroreBackup(f"file non trovato: {archivio}")
        self.dati.mkdir(parents=True, exist_ok=True)
        nuovo = self.dati / f".ripristino-{secrets.token_hex(4)}.db"
        try:
            if zipfile.is_zipfile(archivio):
                with zipfile.ZipFile(archivio) as z:
                    voci = [i for i in z.infolist() if not i.is_dir()]
                    if len(voci) != 1 or voci[0].filename != NOME_DB:
                        raise ErroreBackup("l'archivio deve contenere solo il file taric.db")
                    if voci[0].file_size > MASSIMO_DB:
                        raise ErroreBackup("database troppo grande")
                    with z.open(voci[0]) as src, open(nuovo, "wb") as out:
                        shutil.copyfileobj(src, out, 1 << 20)
            else:
                if archivio.stat().st_size > MASSIMO_DB:
                    raise ErroreBackup("database troppo grande")
                shutil.copyfile(archivio, nuovo)
            descrizione = controlla_db(nuovo)
            prima = self.crea().name if self.db.exists() else None
            for suffisso in ("-wal", "-shm"):
                Path(f"{self.db}{suffisso}").unlink(missing_ok=True)
            os.chmod(nuovo, 0o600)
            os.replace(nuovo, self.db)
        finally:
            for f in (nuovo, Path(f"{nuovo}-wal"), Path(f"{nuovo}-shm")):
                f.unlink(missing_ok=True)
        log.info("database ripristinato da %s", archivio.name)
        return descrizione + (f"; il database precedente e' salvato in backup/{prima}" if prima else "")


__all__ = ["Backup", "ErroreBackup", "controlla_db", "istantanea"]
