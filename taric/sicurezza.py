"""Password, sessioni, gettoni monouso, limiti ai tentativi e firma dei moduli."""
from __future__ import annotations

import hashlib
import hmac
import re
import secrets
import sqlite3
import time

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError, VerifyMismatchError

from .db import adesso, da_iso, iso, tra

_ph = PasswordHasher()
# hash fittizio: si verifica anche quando l'utente non esiste, cosi' i tempi di risposta non rivelano quali email sono registrate
_HASH_FITTIZIO = _ph.hash(secrets.token_urlsafe(16))

COOKIE_SESSIONE = "taric_sessione"
DURATA_SESSIONE_GIORNI = 30
DURATA_SESSIONE_BREVE_ORE = 12          # senza "ricordami"
RE_EMAIL = re.compile(r"^[^@\s<>\"',;]{1,64}@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$")


def normalizza_email(email: str) -> str:
    return (email or "").strip().lower()


def email_valida(email: str) -> bool:
    return len(email) <= 254 and bool(RE_EMAIL.match(email))


def dominio(email: str) -> str:
    return email.rsplit("@", 1)[-1].lower() if "@" in email else ""


def problema_password(password: str, email: str = "", nome: str = "") -> str | None:
    """Messaggio d'errore se la password non va bene, altrimenti None."""
    if len(password) < 10:
        return "La password deve avere almeno 10 caratteri."
    if len(password) > 200:
        return "La password è troppo lunga (massimo 200 caratteri)."
    basso = password.lower()
    if email and (basso == email.lower() or basso == email.split("@")[0].lower()):
        return "La password non può essere uguale all'indirizzo email."
    if len(set(password)) < 5:
        return "La password è troppo semplice: usa caratteri più vari."
    if basso in {"password123", "1234567890", "qwertyuiop", "taric12345", "passwordpassword"}:
        return "Questa password è troppo comune."
    return None


def hash_password(password: str) -> str:
    return _ph.hash(password)


def verifica_password(hash_salvato: str | None, password: str) -> bool:
    try:
        return _ph.verify(hash_salvato or _HASH_FITTIZIO, password) and hash_salvato is not None
    except (VerifyMismatchError, VerificationError, InvalidHashError):
        return False


def da_rifare(hash_salvato: str) -> bool:
    try:
        return _ph.check_needs_rehash(hash_salvato)
    except InvalidHashError:
        return True


def impronta(valore: str) -> str:
    return hashlib.sha256(valore.encode()).hexdigest()


# ------------------------------------------------------------------ sessioni
def crea_sessione(c: sqlite3.Connection, utente_id: int, ip: str, agente: str, ricordami: bool) -> tuple[str, int]:
    """Crea una sessione e restituisce (gettone per il cookie, durata in secondi)."""
    gettone = secrets.token_urlsafe(32)
    durata = DURATA_SESSIONE_GIORNI * 86400 if ricordami else DURATA_SESSIONE_BREVE_ORE * 3600
    c.execute("INSERT INTO sessioni(id_hash, utente_id, creata, scade, ultimo_uso, ip, agente) VALUES (?, ?, ?, ?, ?, ?, ?)",
              (impronta(gettone), utente_id, iso(), tra(seconds=durata), iso(), ip[:64], agente[:300]))
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


def chiudi_sessione(c: sqlite3.Connection, gettone: str | None) -> None:
    if gettone:
        c.execute("DELETE FROM sessioni WHERE id_hash = ?", (impronta(gettone),))


def chiudi_tutte(c: sqlite3.Connection, utente_id: int, tranne: str | None = None) -> None:
    if tranne:
        c.execute("DELETE FROM sessioni WHERE utente_id = ? AND id_hash != ?", (utente_id, impronta(tranne)))
    else:
        c.execute("DELETE FROM sessioni WHERE utente_id = ?", (utente_id,))


# ------------------------------------------------------------------ gettoni monouso (link via email)
def crea_gettone(c: sqlite3.Connection, utente_id: int, scopo: str, ore: float) -> str:
    c.execute("DELETE FROM gettoni WHERE utente_id = ? AND scopo = ?", (utente_id, scopo))
    g = secrets.token_urlsafe(32)
    c.execute("INSERT INTO gettoni(hash, utente_id, scopo, scade) VALUES (?, ?, ?, ?)", (impronta(g), utente_id, scopo, tra(hours=ore)))
    return g


def usa_gettone(c: sqlite3.Connection, gettone: str, scopo: str) -> int | None:
    """Restituisce l'utente del gettone e lo consuma; None se non valido, scaduto o gia' usato."""
    if not gettone or len(gettone) > 100:
        return None
    r = c.execute("SELECT utente_id, scade, usato FROM gettoni WHERE hash = ? AND scopo = ?", (impronta(gettone), scopo)).fetchone()
    if r is None or r["usato"] or da_iso(r["scade"]) < adesso():
        return None
    c.execute("UPDATE gettoni SET usato = ? WHERE hash = ?", (iso(), impronta(gettone)))
    return int(r["utente_id"])


# ------------------------------------------------------------------ limiti ai tentativi
def conta(c: sqlite3.Connection, chiave: str, finestra_s: float) -> int:
    return c.execute("SELECT COUNT(*) FROM tentativi WHERE chiave = ? AND quando > ?", (chiave, time.time() - finestra_s)).fetchone()[0]


def registra(c: sqlite3.Connection, chiave: str) -> None:
    c.execute("INSERT INTO tentativi(chiave, quando) VALUES (?, ?)", (chiave, time.time()))


def azzera(c: sqlite3.Connection, chiave: str) -> None:
    c.execute("DELETE FROM tentativi WHERE chiave = ?", (chiave,))


# ------------------------------------------------------------------ moduli firmati (contro i bot elementari)
def firma_modulo(segreto: bytes) -> str:
    t = str(int(time.time()))
    return t + "." + hmac.new(segreto, b"modulo:" + t.encode(), hashlib.sha256).hexdigest()[:32]


def verifica_modulo(segreto: bytes, valore: str, minimo_s: float = 3, massimo_s: float = 7200) -> bool:
    try:
        t, firma = (valore or "").split(".", 1)
        attesa = hmac.new(segreto, b"modulo:" + t.encode(), hashlib.sha256).hexdigest()[:32]
        eta = time.time() - int(t)
    except ValueError:
        return False
    return hmac.compare_digest(firma, attesa) and minimo_s <= eta <= massimo_s
