"""Database SQLite del sito: schema, connessioni, impostazioni e registro degli eventi.

Lo schema conserva le tabelle delle versioni precedenti (abbonamenti, pagamenti...): le migrazioni si aggiungono sempre
in coda a SCHEMA, cosi' un database esistente resta valido."""
from __future__ import annotations

import json
import sqlite3
import threading
import time
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
    # versione 2: piano Pro (pass, abbonamenti Stripe, concessioni manuali) e pagamenti ricevuti
    """
    CREATE TABLE abbonamenti (
        utente_id INTEGER PRIMARY KEY REFERENCES utenti(id) ON DELETE CASCADE,
        cliente_stripe TEXT,
        pass_fino TEXT,
        manuale_fino TEXT,
        abb_id TEXT,
        abb_piano TEXT,
        abb_stato TEXT,
        abb_fino TEXT,
        abb_annullato INTEGER NOT NULL DEFAULT 0,
        aggiornato TEXT NOT NULL
    );
    CREATE UNIQUE INDEX abbonamenti_abb ON abbonamenti(abb_id) WHERE abb_id IS NOT NULL;
    CREATE TABLE pagamenti (
        id INTEGER PRIMARY KEY,
        quando TEXT NOT NULL,
        evento TEXT UNIQUE,
        utente_id INTEGER REFERENCES utenti(id) ON DELETE SET NULL,
        tipo TEXT NOT NULL,
        piano TEXT NOT NULL DEFAULT '',
        importo INTEGER NOT NULL DEFAULT 0,
        valuta TEXT NOT NULL DEFAULT 'eur',
        riferimento TEXT NOT NULL DEFAULT '',
        dettagli TEXT NOT NULL DEFAULT ''
    );
    CREATE INDEX pagamenti_riferimento ON pagamenti(riferimento);
    """,
    # versione 3: il limite mensile conta le classificazioni (piu' richieste con la stessa operazione) e i token dalla cache
    """
    ALTER TABLE uso_ia ADD COLUMN operazione TEXT NOT NULL DEFAULT '';
    ALTER TABLE uso_ia ADD COLUMN tipo TEXT NOT NULL DEFAULT '';
    ALTER TABLE uso_ia ADD COLUMN token_cache INTEGER NOT NULL DEFAULT 0;
    CREATE INDEX uso_ia_operazione ON uso_ia(utente_id, operazione);
    """,
    # versione 4: parole cercate senza risultati (anonime), sinonimi aggiunti in Gestione, archivio aziendale (storico condiviso)
    """
    CREATE TABLE ricerche_vuote (
        testo TEXT PRIMARY KEY,
        volte INTEGER NOT NULL DEFAULT 1,
        prima TEXT NOT NULL,
        ultima TEXT NOT NULL
    );
    CREATE TABLE sinonimi (
        parola TEXT PRIMARY KEY,
        termini TEXT NOT NULL,
        autore_id INTEGER REFERENCES utenti(id) ON DELETE SET NULL,
        quando TEXT NOT NULL
    );
    ALTER TABLE storico ADD COLUMN condivisa INTEGER NOT NULL DEFAULT 0;
    CREATE INDEX storico_condivisa ON storico(condivisa, id);
    """,
]

IMPOSTAZIONI_PREDEFINITE: dict[str, Any] = {
    # limite mensile di classificazioni per chi non e' amministratore (None = senza limite)
    "quota_predefinita": 50,
    # tetto di classificazioni al mese per tutti insieme (None = nessuno) e registrazioni aperte
    "tetto_mese": None,
    "registrazione_aperta": True,
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
                val = json.loads(r["valore"])
                if isinstance(out[r["chiave"]], dict) and isinstance(val, dict):
                    val = {**out[r["chiave"]], **val}
                out[r["chiave"]] = val
        return out

    def salva_impostazioni(self, c: sqlite3.Connection, valori: dict[str, Any]) -> None:
        for k, val in valori.items():
            if k in IMPOSTAZIONI_PREDEFINITE:
                c.execute("INSERT INTO impostazioni(chiave, valore) VALUES (?, ?) "
                          "ON CONFLICT(chiave) DO UPDATE SET valore = excluded.valore", (k, json.dumps(val)))

    def pulizia(self) -> None:
        """Sessioni e link scaduti, tentativi di accesso vecchi, registro degli eventi piu' vecchio di due anni."""
        with self.transazione() as c:
            c.execute("DELETE FROM sessioni WHERE scade < ?", (iso(),))
            c.execute("DELETE FROM eventi WHERE quando < ?", (tra(days=-730),))
            c.execute("DELETE FROM gettoni WHERE scade < ?", (iso(),))
            c.execute("DELETE FROM tentativi WHERE quando < ?", (time.time() - 86400,))

    # ------------------------------------------------------------ registro eventi
    @staticmethod
    def evento(c: sqlite3.Connection, tipo: str, utente_id: int | None = None, autore_id: int | None = None,
               dettagli: str = "") -> None:
        c.execute("INSERT INTO eventi(quando, tipo, utente_id, autore_id, dettagli) VALUES (?, ?, ?, ?, ?)",
                  (iso(), tipo, utente_id, autore_id, dettagli[:2000]))
