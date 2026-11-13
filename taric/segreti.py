"""Chiave del servizio IA sul PC: protetta da Windows e leggibile solo dall'utente che l'ha salvata.

Su Windows si usa la protezione dati di Windows (DPAPI, CryptProtectData con l'utente corrente): un altro utente o un
altro PC non la può decifrare, nemmeno copiando il database. Fuori da Windows (prove e sviluppo) la chiave si cifra con
un segreto casuale nella cartella dei dati: non protegge da chi legge quella cartella, serve solo a non scriverla in chiaro.

Qui c'e' anche la lettura delle impostazioni della vecchia cartella condivisa (fino alla versione 1.2), per importare una
volta il servizio IA scelto da chi gestiva MAGIC HS: la chiave li' era cifrata con un segreto del programma e il «sale»
della cartella (oppure, prima ancora, in chiaro).
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import logging
import secrets
import sys
from pathlib import Path
from typing import Any

log = logging.getLogger("taric.segreti")


# ------------------------------------------------------------------ cifratura di supporto (flusso SHA-256 + HMAC)
def _flusso(k: bytes, nonce: bytes, n: int) -> bytes:
    out, i = b"", 0
    while len(out) < n:
        out += hashlib.sha256(k + nonce + i.to_bytes(4, "big")).digest()
        i += 1
    return out[:n]


def _cifra(k: bytes, testo: str) -> str:
    nonce, dati = secrets.token_bytes(16), testo.encode()
    cifrato = bytes(a ^ b for a, b in zip(dati, _flusso(k, nonce, len(dati))))
    return base64.urlsafe_b64encode(nonce + cifrato + hmac.new(k, nonce + cifrato, hashlib.sha256).digest()[:16]).decode()


def _decifra(k: bytes, testo: str) -> str:
    try:
        b = base64.urlsafe_b64decode(testo.encode())
    except ValueError:
        return ""
    if len(b) < 32 or not hmac.compare_digest(b[-16:], hmac.new(k, b[:-16], hashlib.sha256).digest()[:16]):
        return ""
    nonce, cifrato = b[:16], b[16:-16]
    try:
        return bytes(a ^ c for a, c in zip(cifrato, _flusso(k, nonce, len(cifrato)))).decode()
    except UnicodeDecodeError:
        return ""


# ------------------------------------------------------------------ DPAPI (solo Windows)
def _dpapi(dati: bytes, cifra: bool) -> bytes:
    import ctypes
    from ctypes import wintypes

    class BLOB(ctypes.Structure):
        _fields_ = [("cbData", wintypes.DWORD), ("pbData", ctypes.POINTER(ctypes.c_char))]

    buf = ctypes.create_string_buffer(dati, len(dati))
    ingresso, uscita = BLOB(len(dati), ctypes.cast(buf, ctypes.POINTER(ctypes.c_char))), BLOB()
    crypt32, kernel32 = ctypes.windll.crypt32, ctypes.windll.kernel32
    funzione = crypt32.CryptProtectData if cifra else crypt32.CryptUnprotectData
    # niente finestre (CRYPTPROTECT_UI_FORBIDDEN): il programma gira senza console
    ok = funzione(ctypes.byref(ingresso), "MAGIC HS" if cifra else None, None, None, None, 0x1, ctypes.byref(uscita))
    if not ok:
        raise OSError(ctypes.GetLastError(), "protezione dati di Windows non riuscita")
    try:
        return ctypes.string_at(uscita.pbData, uscita.cbData)
    finally:
        kernel32.LocalFree(uscita.pbData)


def _segreto_locale(cartella: Path) -> bytes:
    f = cartella / "segreto-ia.key"
    if not f.exists():
        cartella.mkdir(parents=True, exist_ok=True)
        f.write_text(secrets.token_hex(32), encoding="utf-8")
        try:
            f.chmod(0o600)
        except OSError:
            pass
    return hashlib.sha256(f.read_text(encoding="utf-8").strip().encode()).digest()


def proteggi(chiave: str, cartella: Path) -> str:
    """La chiave protetta, da salvare nel database del PC ("" se la chiave e' vuota)."""
    if not chiave:
        return ""
    if sys.platform == "win32":
        return "dpapi:" + base64.b64encode(_dpapi(chiave.encode(), True)).decode()
    return "locale:" + _cifra(_segreto_locale(cartella), chiave)


def svela(protetta: str, cartella: Path) -> str:
    """La chiave in chiaro; "" se non si puo' leggere (per esempio database copiato da un altro utente di Windows)."""
    try:
        if protetta.startswith("dpapi:") and sys.platform == "win32":
            return _dpapi(base64.b64decode(protetta[6:]), False).decode()
        if protetta.startswith("locale:"):
            return _decifra(_segreto_locale(cartella), protetta[7:])
    except (OSError, ValueError, UnicodeDecodeError):
        log.warning("chiave del servizio IA non leggibile su questo PC")
    return ""


# ------------------------------------------------------------------ vecchia cartella condivisa (fino alla 1.2)
_SEGRETO_CARTELLA = b"MAGIC HS / chiave del servizio IA / v1"


def ia_della_vecchia_cartella(cartella: Path) -> dict[str, str] | None:
    """Servizio IA scelto nella vecchia cartella condivisa (impostazioni.json), con la chiave in chiaro; None se non c'e'."""
    try:
        imp = json.loads((cartella / "impostazioni.json").read_text(encoding="utf-8-sig"))
    except (OSError, ValueError):
        return None
    ia: Any = imp.get("ia") if isinstance(imp, dict) else None
    if not isinstance(ia, dict) or not ia.get("fornitore"):
        return None
    cifrata = str(ia.get("chiave_cifrata") or "")
    if cifrata.startswith("mhs1:"):
        chiave = _decifra(hashlib.sha256(_SEGRETO_CARTELLA + str(imp.get("sale") or "").encode()).digest(), cifrata[5:])
    else:
        chiave = str(ia.get("chiave") or "").strip()
    return {"fornitore": str(ia.get("fornitore") or ""), "url": str(ia.get("url") or ""), "modello": str(ia.get("modello") or ""),
            "modello_rapido": str(ia.get("modello_rapido") or ""), "chiave": chiave}


__all__ = ["ia_della_vecchia_cartella", "proteggi", "svela"]
