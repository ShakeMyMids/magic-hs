"""Aziende: il campo azienda degli utenti fa da gruppo (stessa azienda = stesso nome a meno di maiuscole e spazi).
Le regole di un'azienda (limite di classificazioni con l'IA al mese per persona, oppure IA spenta) si scrivono nel limite
personale di chi c'è e di chi entra dopo (approvazione, cambio di azienda in Gestione); poi il limite di una persona si
può ancora cambiare da solo. Gli amministratori non hanno limiti e le azioni di gruppo li saltano. L'azienda la sceglie
chi chiede l'account e poi la cambia solo l'amministratore."""
from __future__ import annotations

import sqlite3
from collections import Counter


def nome_pulito(nome: str | None) -> str:
    return " ".join((nome or "").split())


def chiave(nome: str | None) -> str:
    """«  DHL  express » e «Dhl Express» sono la stessa azienda."""
    return nome_pulito(nome).casefold()


def regole(c: sqlite3.Connection, k: str) -> sqlite3.Row | None:
    return c.execute("SELECT * FROM aziende WHERE chiave = ?", (k,)).fetchone() if k else None


def quota(r: sqlite3.Row) -> int | None:
    """Il limite personale che le regole danno: 0 con l'IA spenta, altrimenti il limite (None = quello predefinito)."""
    return 0 if not r["ia"] else r["quota_ia"]


def membri(c: sqlite3.Connection, k: str) -> list[sqlite3.Row]:
    if not k:
        return []
    return [u for u in c.execute("SELECT * FROM utenti ORDER BY nome").fetchall() if chiave(u["azienda"]) == k]


def nome_di(persone: list[sqlite3.Row]) -> str:
    """Il nome dell'azienda come lo scrivono i più (a parità, in ordine alfabetico)."""
    conti = Counter(nome_pulito(u["azienda"]) for u in persone)
    return min(conti.items(), key=lambda x: (-x[1], x[0]))[0] if conti else ""


def applica(c: sqlite3.Connection, r: sqlite3.Row | None, persone: list[sqlite3.Row]) -> int:
    """Scrive il limite delle regole nelle persone (non negli amministratori); restituisce quante."""
    if r is None:
        return 0
    n = 0
    for u in persone:
        if u["ruolo"] != "amministratore":
            c.execute("UPDATE utenti SET quota_ia = ? WHERE id = ?", (quota(r), u["id"]))
            n += 1
    return n


__all__ = ["applica", "chiave", "membri", "nome_di", "nome_pulito", "quota", "regole"]
