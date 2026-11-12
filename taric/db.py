"""Database SQLite: schema, connessioni, impostazioni e registro degli eventi."""
from __future__ import annotations

import json
import sqlite3
import threading
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Iterator

SCHEMA = [
    # versione 1
    """
    CREATE TABLE utenti (
        id INTEGER PRIMARY KEY,
        email TEXT NOT NULL UNIQUE COLLATE NOCASE,
        nome TEXT NOT NULL,
        azienda TEXT NOT NULL DEFAULT '',
        richiesta TEXT NOT NULL DEFAULT '',
        hash_password TEXT,
        ruolo TEXT NOT NULL DEFAULT 'utente' CHECK (ruolo IN ('utente', 'amministratore')),
        stato TEXT NOT NULL CHECK (stato IN ('email_da_confermare', 'in_attesa', 'attivo', 'sospeso', 'rifiutato')),
        email_confermata INTEGER NOT NULL DEFAULT 0,
        quota_ia INTEGER,
        preferenze TEXT NOT NULL DEFAULT '{}',
        motivo_stato TEXT NOT NULL DEFAULT '',
        creato TEXT NOT NULL,
        aggiornato TEXT NOT NULL,
        ultimo_accesso TEXT
    );
    CREATE TABLE sessioni (
        id_hash TEXT PRIMARY KEY,
        utente_id INTEGER NOT NULL REFERENCES utenti(id) ON DELETE CASCADE,
        creata TEXT NOT NULL,
        scade TEXT NOT NULL,
        ultimo_uso TEXT NOT NULL,
        ip TEXT NOT NULL DEFAULT '',
        agente TEXT NOT NULL DEFAULT ''
    );
    CREATE INDEX sessioni_utente ON sessioni(utente_id);
    CREATE TABLE gettoni (
        hash TEXT PRIMARY KEY,
        utente_id INTEGER NOT NULL REFERENCES utenti(id) ON DELETE CASCADE,
        scopo TEXT NOT NULL CHECK (scopo IN ('conferma_email', 'reimposta_password')),
        scade TEXT NOT NULL,
        usato TEXT
    );
    CREATE TABLE tentativi (
        id INTEGER PRIMARY KEY,
        chiave TEXT NOT NULL,
        quando REAL NOT NULL
    );
    CREATE INDEX tentativi_chiave ON tentativi(chiave, quando);
    CREATE TABLE eventi (
        id INTEGER PRIMARY KEY,
        quando TEXT NOT NULL,
        tipo TEXT NOT NULL,
        utente_id INTEGER,
        autore_id INTEGER,
        dettagli TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE impostazioni (
        chiave TEXT PRIMARY KEY,
        valore TEXT NOT NULL
    );
    CREATE TABLE uso_ia (
        id INTEGER PRIMARY KEY,
        utente_id INTEGER REFERENCES utenti(id) ON DELETE SET NULL,
        quando TEXT NOT NULL,
        mese TEXT NOT NULL,
        livello TEXT NOT NULL,
        modello TEXT NOT NULL,
        token_in INTEGER NOT NULL DEFAULT 0,
        token_out INTEGER NOT NULL DEFAULT 0,
        esito TEXT NOT NULL
    );
    CREATE INDEX uso_ia_mese ON uso_ia(utente_id, mese);
    CREATE TABLE storico (
        id INTEGER PRIMARY KEY,
        utente_id INTEGER NOT NULL REFERENCES utenti(id) ON DELETE CASCADE,
        quando TEXT NOT NULL,
        testo TEXT NOT NULL,
        codice TEXT NOT NULL DEFAULT '',
        dati TEXT NOT NULL
    );
    CREATE INDEX storico_utente ON storico(utente_id, id);
    CREATE TABLE preferiti (
        utente_id INTEGER NOT NULL REFERENCES utenti(id) ON DELETE CASCADE,
        codice TEXT NOT NULL,
        nota TEXT NOT NULL DEFAULT '',
        quando TEXT NOT NULL,
        PRIMARY KEY (utente_id, codice)
    );
    CREATE TABLE aggiornamenti (
        id INTEGER PRIMARY KEY,
        iniziato TEXT NOT NULL,
        finito TEXT,
        mese TEXT NOT NULL,
        origine TEXT NOT NULL,
        esito TEXT NOT NULL DEFAULT 'in_corso',
        messaggio TEXT NOT NULL DEFAULT '',
        registro TEXT NOT NULL DEFAULT ''
    );
    """,
]

IMPOSTAZIONI_PREDEFINITE: dict[str, Any] = {
    "registrazione_aperta": True,        # il modulo di registrazione e' disponibile
    "approva_tutti": False,              # True: ogni email confermata diventa subito un account attivo
    "domini_approvati": [],              # email di questi domini (confermate) diventano attive subito
    "domini_bloccati": [],               # registrazioni da questi domini rifiutate
    "quota_predefinita": 200,            # richieste IA al mese per utente (0 = IA spenta per i nuovi utenti)
    "massimo_in_attesa": 200,            # oltre questo numero di richieste in attesa le nuove vengono respinte
}


def adesso() -> datetime:
    return datetime.now(timezone.utc)


def iso(d: datetime | None = None) -> str:
    return (d or adesso()).strftime("%Y-%m-%dT%H:%M:%SZ")


def da_iso(s: str) -> datetime:
    return datetime.strptime(s, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)


def tra(**kw: float) -> str:
    return iso(adesso() + timedelta(**kw))


class Database:
    def __init__(self, percorso: Path):
        self.percorso = percorso
        self._lock = threading.Lock()
        with self.connessione() as c:
            versione = c.execute("PRAGMA user_version").fetchone()[0]
            for n, sql in enumerate(SCHEMA[versione:], start=versione + 1):
                c.executescript(sql)
                c.execute(f"PRAGMA user_version = {n}")

    @contextmanager
    def connessione(self) -> Iterator[sqlite3.Connection]:
        c = sqlite3.connect(self.percorso, timeout=15, isolation_level=None, check_same_thread=False)
        c.row_factory = sqlite3.Row
        c.execute("PRAGMA foreign_keys = ON")
        c.execute("PRAGMA journal_mode = WAL")
        c.execute("PRAGMA busy_timeout = 15000")
        try:
            yield c
        finally:
            c.close()

    @contextmanager
    def transazione(self) -> Iterator[sqlite3.Connection]:
        with self.connessione() as c:
            c.execute("BEGIN IMMEDIATE")
            try:
                yield c
            except BaseException:
                c.execute("ROLLBACK")
                raise
            c.execute("COMMIT")

    # ------------------------------------------------------------ impostazioni
    def impostazioni(self, c: sqlite3.Connection) -> dict[str, Any]:
        out = dict(IMPOSTAZIONI_PREDEFINITE)
        for r in c.execute("SELECT chiave, valore FROM impostazioni"):
            if r["chiave"] in out:
                out[r["chiave"]] = json.loads(r["valore"])
        return out

    def salva_impostazioni(self, c: sqlite3.Connection, valori: dict[str, Any]) -> None:
        for k, val in valori.items():
            if k in IMPOSTAZIONI_PREDEFINITE:
                c.execute("INSERT INTO impostazioni(chiave, valore) VALUES (?, ?) "
                          "ON CONFLICT(chiave) DO UPDATE SET valore = excluded.valore", (k, json.dumps(val)))

    # ------------------------------------------------------------ registro eventi
    @staticmethod
    def evento(c: sqlite3.Connection, tipo: str, utente_id: int | None = None, autore_id: int | None = None,
               dettagli: str = "") -> None:
        c.execute("INSERT INTO eventi(quando, tipo, utente_id, autore_id, dettagli) VALUES (?, ?, ?, ?, ?)",
                  (iso(), tipo, utente_id, autore_id, dettagli[:2000]))
