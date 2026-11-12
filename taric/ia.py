"""Chiamate a Claude (API di Anthropic) per conto degli utenti, con limite mensile per utente.
La chiave API resta sul server; il browser manda solo il testo della richiesta."""
from __future__ import annotations

import json
import logging
import sqlite3
import threading
from typing import Any

import httpx

from .config import Config
from .db import Database, adesso, iso

log = logging.getLogger("taric.ia")

MASSIMO_CARATTERI = 400_000
TOKEN_MASSIMI = {"rapido": 2048, "standard": 8192}
ISTRUZIONI = ("Rispondi esclusivamente con un unico valore JSON valido (oggetto o array) che rispetta il formato "
              "richiesto, senza testo prima o dopo e senza blocchi di codice. Scrivi i testi in italiano.")


class ErroreIA(Exception):
    def __init__(self, codice: str, stato_http: int = 502, dettaglio: str = ""):
        super().__init__(codice)
        self.codice = codice
        self.stato_http = stato_http
        self.dettaglio = dettaglio


def mese_corrente() -> str:
    return adesso().strftime("%Y-%m")


def estrai_json(testo: str) -> Any:
    """Primo valore JSON completo nel testo (tollera blocchi ``` e testo attorno)."""
    t = testo.strip()
    if t.startswith("```"):
        t = t.split("\n", 1)[1] if "\n" in t else ""
        t = t.rsplit("```", 1)[0]
    dec = json.JSONDecoder()
    for i, ch in enumerate(t):
        if ch in "{[":
            try:
                valore, _ = dec.raw_decode(t[i:])
                return valore
            except ValueError:
                continue
    raise ErroreIA("invalid_json")


class ServizioIA:
    def __init__(self, cfg: Config, db: Database, client: httpx.Client | None = None):
        self.cfg = cfg
        self.db = db
        self.client = client or httpx.Client(timeout=httpx.Timeout(180, connect=15))
        self._in_corso: dict[int, int] = {}
        self._lock = threading.Lock()

    @property
    def disponibile(self) -> bool:
        return self.cfg.ia_disponibile

    # ------------------------------------------------------------------ quota
    def limite(self, c: sqlite3.Connection, utente: sqlite3.Row) -> int | None:
        """Richieste al mese consentite; None = senza limite (amministratori)."""
        if utente["ruolo"] == "amministratore" and utente["quota_ia"] is None:
            return None
        if utente["quota_ia"] is not None:
            return int(utente["quota_ia"])
        return int(self.db.impostazioni(c)["quota_predefinita"])

    @staticmethod
    def usate(c: sqlite3.Connection, utente_id: int, mese: str | None = None) -> int:
        # contano le richieste arrivate a Claude (quelle che consumano credito), anche se la risposta non era utilizzabile
        return c.execute("SELECT COUNT(*) FROM uso_ia WHERE utente_id = ? AND mese = ? AND (esito = 'ok' OR token_in > 0)",
                         (utente_id, mese or mese_corrente())).fetchone()[0]

    # ------------------------------------------------------------------ chiamata
    def chiedi(self, utente: sqlite3.Row, prompt: str, livello: str) -> dict[str, Any]:
        if not self.disponibile:
            raise ErroreIA("not_configured", 503)
        if livello not in TOKEN_MASSIMI:
            raise ErroreIA("bad_request", 400)
        if not isinstance(prompt, str) or not prompt.strip():
            raise ErroreIA("bad_request", 400)
        if len(prompt) > MASSIMO_CARATTERI:
            raise ErroreIA("prompt_too_large", 413)
        uid = int(utente["id"])
        with self.db.connessione() as c:
            lim = self.limite(c, utente)
            if lim is not None and self.usate(c, uid) >= lim:
                raise ErroreIA("quota_esaurita", 429)
        with self._lock:
            if self._in_corso.get(uid, 0) >= 2:
                raise ErroreIA("rate_limited", 429)
            self._in_corso[uid] = self._in_corso.get(uid, 0) + 1
        modello = self.cfg.modello_rapido if livello == "rapido" else self.cfg.modello
        esito, tin, tout = "errore", 0, 0
        try:
            risposta = self._chiama(modello, prompt, TOKEN_MASSIMI[livello])
            uso = risposta.get("usage") or {}
            tin, tout = int(uso.get("input_tokens") or 0), int(uso.get("output_tokens") or 0)
            if risposta.get("stop_reason") == "refusal":
                esito = "rifiutata"
                raise ErroreIA("refused", 422)
            testo = "".join(b.get("text", "") for b in risposta.get("content") or [] if b.get("type") == "text")
            if not testo.strip():
                esito = "vuota"
                raise ErroreIA("empty_completion", 502)
            try:
                valore = estrai_json(testo)
            except ErroreIA:
                esito = "json_non_valido"
                raise
            esito = "ok"
            return {"risultato": valore, "uso": {"token_in": tin, "token_out": tout}}
        finally:
            with self._lock:
                self._in_corso[uid] = max(0, self._in_corso.get(uid, 1) - 1)
            with self.db.connessione() as c:
                c.execute("INSERT INTO uso_ia(utente_id, quando, mese, livello, modello, token_in, token_out, esito) "
                          "VALUES (?, ?, ?, ?, ?, ?, ?, ?)", (uid, iso(), mese_corrente(), livello, modello, tin, tout, esito))

    def _chiama(self, modello: str, prompt: str, token_massimi: int) -> dict[str, Any]:
        corpo = {"model": modello, "max_tokens": token_massimi, "system": ISTRUZIONI,
                 "messages": [{"role": "user", "content": prompt}]}
        intestazioni = {"x-api-key": self.cfg.anthropic_key, "anthropic-version": "2023-06-01", "content-type": "application/json"}
        try:
            r = self.client.post(self.cfg.anthropic_url, json=corpo, headers=intestazioni)
        except httpx.TimeoutException:
            raise ErroreIA("upstream_timeout", 504)
        except httpx.HTTPError as e:
            log.error("API Anthropic non raggiungibile: %s", e)
            raise ErroreIA("upstream_error", 502)
        if r.status_code == 200:
            try:
                return r.json()
            except ValueError:
                raise ErroreIA("upstream_error", 502)
        testo = r.text[:500]
        log.error("API Anthropic: HTTP %s %s", r.status_code, testo)
        if r.status_code in (401, 403):
            raise ErroreIA("server_misconfigured", 503, "chiave API non valida o senza permessi")
        if r.status_code == 404:
            raise ErroreIA("server_misconfigured", 503, f"modello {modello} non disponibile")
        if r.status_code == 429:
            raise ErroreIA("rate_limited", 429)
        if r.status_code in (500, 502, 503, 529):
            raise ErroreIA("overloaded", 503)
        basso = testo.lower()
        if "credit balance" in basso or "spend limit" in basso or "billing" in basso:
            raise ErroreIA("credito_esaurito", 503)
        if "too long" in basso or "too many tokens" in basso:
            raise ErroreIA("prompt_too_large", 413)
        raise ErroreIA("upstream_error", 502)
