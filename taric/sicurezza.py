"""Sessioni del browser: dopo l'ingresso con la chiave dell'avvio (/entra) il browser tiene un cookie di sessione."""
from __future__ import annotations

import hashlib
import secrets
import sqlite3

from .db import adesso, da_iso, iso, tra

DURATA_SESSIONE_GIORNI = 30


def impronta(valore: str) -> str:
    return hashlib.sha256(valore.encode()).hexdigest()


def crea_sessione(c: sqlite3.Connection, utente_id: int, agente: str) -> tuple[str, int]:
    """Crea una sessione e restituisce (gettone per il cookie, durata in secondi)."""
    gettone = secrets.token_urlsafe(32)
    durata = DURATA_SESSIONE_GIORNI * 86400
    c.execute("INSERT INTO sessioni(id_hash, utente_id, creata, scade, ultimo_uso, ip, agente) VALUES (?, ?, ?, ?, ?, ?, ?)",
              (impronta(gettone), utente_id, iso(), tra(seconds=durata), iso(), "127.0.0.1", agente[:300]))
    c.execute("UPDATE utenti SET ultimo_accesso = ? WHERE id = ?", (iso(), utente_id))
    return gettone, durata


def utente_da_sessione(c: sqlite3.Connection, gettone: str | None) -> sqlite3.Row | None:
    if not gettone or len(gettone) > 100:
        return None
    r = c.execute("SELECT s.id_hash, s.scade, s.ultimo_uso, u.* FROM sessioni s JOIN utenti u ON u.id = s.utente_id "
                  "WHERE s.id_hash = ?", (impronta(gettone),)).fetchone()
    if r is None:
        return None
    if da_iso(r["scade"]) < adesso() or r["stato"] != "attivo":
        c.execute("DELETE FROM sessioni WHERE id_hash = ?", (r["id_hash"],))
        return None
    if (adesso() - da_iso(r["ultimo_uso"])).total_seconds() > 300:
        c.execute("UPDATE sessioni SET ultimo_uso = ? WHERE id_hash = ?", (iso(), r["id_hash"]))
    return r
