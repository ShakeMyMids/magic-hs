"""Chiamate all'intelligenza artificiale per conto degli utenti, con limite mensile per utente.
La chiave resta sul server; il browser manda solo il testo della richiesta.

Fornitori supportati (TARIC_IA_FORNITORE):
  gemini     API di Google Gemini (generateContent)
  anthropic  API Messages di Anthropic (Claude)
  openai     qualsiasi servizio compatibile con OpenAI Chat Completions: Groq, Mistral, OpenRouter,
             OpenAI, Ollama in locale... (TARIC_IA_URL = indirizzo base, per esempio https://api.groq.com/openai/v1)
"""
from __future__ import annotations

import json
import logging
import sqlite3
import threading
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any, Callable
from urllib.parse import urlsplit

import httpx

from .config import Config
from .db import Database, adesso, iso

log = logging.getLogger("taric.ia")

MASSIMO_CARATTERI = 400_000
TOKEN_MASSIMI = {"rapido": 4096, "standard": 16384}   # margine per i modelli che "ragionano" prima di rispondere
ISTRUZIONI = ("Rispondi esclusivamente con un unico valore JSON valido (oggetto o array) che rispetta il formato "
              "richiesto, senza testo prima o dopo e senza blocchi di codice. Scrivi i testi in italiano.")


class ErroreIA(Exception):
    def __init__(self, codice: str, stato_http: int = 502, dettaglio: str = ""):
        super().__init__(codice)
        self.codice = codice
        self.stato_http = stato_http
        self.dettaglio = dettaglio
        self.corpo = ""                   # inizio della risposta d'errore del servizio, se c'e'


@dataclass
class Risposta:
    testo: str
    token_in: int
    token_out: int
    rifiutata: bool = False
    troncata: bool = False


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


def _errore_http(r: httpx.Response, modello: str) -> ErroreIA:
    """Traduce le risposte d'errore dei tre fornitori in codici comuni."""
    e = _codice_http(r, modello)
    e.corpo = r.text[:800]
    return e


def _codice_http(r: httpx.Response, modello: str) -> ErroreIA:
    testo = r.text[:800]
    basso = testo.lower()
    log.error("servizio IA: HTTP %s %s", r.status_code, testo[:400])
    if "api key" in basso or "api_key" in basso or "unauthenticated" in basso or r.status_code == 401:
        return ErroreIA("server_misconfigured", 503, "chiave non valida")
    if "billing" in basso or "credit balance" in basso or "spend limit" in basso or "insufficient_quota" in basso or "payment" in basso:
        return ErroreIA("credito_esaurito", 503)
    if "location is not supported" in basso or "not available in your country" in basso:
        return ErroreIA("regione_non_supportata", 503)
    if r.status_code == 404 or ("model" in basso and ("not found" in basso or "does not exist" in basso)):
        return ErroreIA("server_misconfigured", 503, f"modello {modello} non disponibile")
    if r.status_code == 403:
        return ErroreIA("server_misconfigured", 503, "permesso negato")
    if r.status_code == 429:
        # Gemini indica nel testo se il limite superato e' quello giornaliero (tipico del piano gratuito)
        if "perday" in basso or "per day" in basso or "daily" in basso:
            return ErroreIA("limite_giornaliero", 429)
        return ErroreIA("rate_limited", 429)
    if r.status_code in (500, 502, 503, 504, 529):
        return ErroreIA("overloaded", 503)
    if "too long" in basso or "too many tokens" in basso or "exceeds the maximum" in basso or "context length" in basso:
        return ErroreIA("prompt_too_large", 413)
    return ErroreIA("upstream_error", 502)


class ServizioIA:
    def __init__(self, cfg: Config, db: Database, client: httpx.Client | None = None):
        self.cfg = cfg
        self.db = db
        self.client = client or httpx.Client(timeout=httpx.Timeout(180, connect=15))
        self._in_corso: dict[int, int] = {}
        self._lock = threading.Lock()
        # piano Pro dell'utente (lo imposta l'applicazione con i pagamenti): richieste illimitate entro il tetto delle 24 ore
        self.pro: Callable[[sqlite3.Connection, int], bool] = lambda c, uid: False

    @property
    def disponibile(self) -> bool:
        return self.cfg.ia_disponibile

    # ------------------------------------------------------------------ quota
    def limite(self, c: sqlite3.Connection, utente: sqlite3.Row) -> int | None:
        """Richieste al mese consentite; None = senza limite mensile (amministratori e piano Pro).
        Un limite personale 0 spegne l'IA per quell'utente anche se ha il Pro."""
        if utente["quota_ia"] == 0:
            return 0
        if utente["ruolo"] == "amministratore" and utente["quota_ia"] is None:
            return None
        if self.pro(c, int(utente["id"])):
            return None
        if utente["quota_ia"] is not None:
            return int(utente["quota_ia"])
        q = self.db.impostazioni(c)["quota_predefinita"]
        return None if q is None else int(q)            # None: senza limite (programma locale, se lo sceglie l'editore)

    def tetto(self, c: sqlite3.Connection, utente: sqlite3.Row) -> int | None:
        """Tetto di sicurezza delle richieste nelle ultime 24 ore per il piano Pro (contro l'uso automatico)."""
        if utente["ruolo"] == "amministratore" or not self.pro(c, int(utente["id"])):
            return None
        return int(self.db.impostazioni(c)["pro_tetto_giorno"]) or None

    @staticmethod
    def usate_24h(c: sqlite3.Connection, utente_id: int) -> int:
        return c.execute("SELECT COUNT(*) FROM uso_ia WHERE utente_id = ? AND quando >= ? AND (esito = 'ok' OR token_in > 0)",
                         (utente_id, iso(datetime.now(timezone.utc) - timedelta(hours=24)))).fetchone()[0]

    @staticmethod
    def usate(c: sqlite3.Connection, utente_id: int, mese: str | None = None) -> int:
        # contano le richieste arrivate al servizio (quelle che consumano quota o credito), anche se la risposta non era utilizzabile
        return c.execute("SELECT COUNT(*) FROM uso_ia WHERE utente_id = ? AND mese = ? AND (esito = 'ok' OR token_in > 0)",
                         (utente_id, mese or mese_corrente())).fetchone()[0]

    # ------------------------------------------------------------------ chiamata
    def prova(self) -> dict[str, Any]:
        """Breve richiesta di prova al servizio configurato (pannello del programma locale); non consuma la quota."""
        if not self.disponibile:
            raise ErroreIA("not_configured", 503)
        chiama = {"gemini": self._gemini, "anthropic": self._anthropic, "openai": self._openai}[self.cfg.ia_fornitore]
        inizio = adesso()
        r = chiama(self.cfg.modello_rapido, 'Rispondi con questo oggetto JSON: {"ok": true}', 1024)
        if r.rifiutata:
            raise ErroreIA("refused", 422)
        valore = estrai_json(r.testo) if r.testo.strip() else None
        if valore is None:
            raise ErroreIA("empty_completion", 502)
        return {"risposta": valore, "secondi": round((adesso() - inizio).total_seconds(), 1),
                "modello": self.cfg.modello_rapido, "token_in": r.token_in, "token_out": r.token_out}

    def chiedi(self, utente: sqlite3.Row, prompt: str, livello: str) -> dict[str, Any]:
        if not self.disponibile:
            raise ErroreIA("not_configured", 503)
        if livello not in TOKEN_MASSIMI or not isinstance(prompt, str) or not prompt.strip():
            raise ErroreIA("bad_request", 400)
        if len(prompt) > MASSIMO_CARATTERI:
            raise ErroreIA("prompt_too_large", 413)
        uid = int(utente["id"])
        with self.db.connessione() as c:
            lim = self.limite(c, utente)
            if lim is not None and self.usate(c, uid) >= lim:
                raise ErroreIA("quota_esaurita", 429)
            tetto = self.tetto(c, utente)
            if tetto is not None and self.usate_24h(c, uid) >= tetto:
                raise ErroreIA("tetto_giornaliero", 429)
        with self._lock:
            if self._in_corso.get(uid, 0) >= 2:
                raise ErroreIA("rate_limited", 429)
            self._in_corso[uid] = self._in_corso.get(uid, 0) + 1
        modello = self.cfg.modello_rapido if livello == "rapido" else self.cfg.modello
        esito, tin, tout = "errore", 0, 0
        try:
            chiama = {"gemini": self._gemini, "anthropic": self._anthropic, "openai": self._openai}[self.cfg.ia_fornitore]
            r = chiama(modello, prompt, TOKEN_MASSIMI[livello])
            tin, tout = r.token_in, r.token_out
            if r.rifiutata:
                esito = "rifiutata"
                raise ErroreIA("refused", 422)
            if not r.testo.strip():
                esito = "vuota"
                raise ErroreIA("empty_completion", 502)
            try:
                valore = estrai_json(r.testo)
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

    def _post(self, url: str, corpo: dict[str, Any], intestazioni: dict[str, str], modello: str) -> dict[str, Any]:
        try:
            r = self.client.post(url, json=corpo, headers=intestazioni)
        except httpx.TimeoutException:
            raise ErroreIA("upstream_timeout", 504)
        except httpx.HTTPError as e:
            log.error("servizio IA non raggiungibile: %s", e)
            raise ErroreIA("upstream_error", 502)
        if r.status_code != 200:
            raise _errore_http(r, modello)
        try:
            return r.json()
        except ValueError:
            raise ErroreIA("upstream_error", 502)

    # ------------------------------------------------------------------ Google Gemini
    def _gemini(self, modello: str, prompt: str, token_massimi: int) -> Risposta:
        corpo = {
            "systemInstruction": {"parts": [{"text": ISTRUZIONI}]},
            "contents": [{"role": "user", "parts": [{"text": prompt}]}],
            "generationConfig": {"responseMimeType": "application/json", "maxOutputTokens": token_massimi},
        }
        d = self._post(f"{self.cfg.ia_url}/models/{modello}:generateContent", corpo,
                       {"x-goog-api-key": self.cfg.ia_chiave, "content-type": "application/json"}, modello)
        uso = d.get("usageMetadata") or {}
        tin = int(uso.get("promptTokenCount") or 0)
        tout = int(uso.get("candidatesTokenCount") or 0) + int(uso.get("thoughtsTokenCount") or 0)
        if (d.get("promptFeedback") or {}).get("blockReason"):
            return Risposta("", tin, tout, rifiutata=True)
        cand = (d.get("candidates") or [{}])[0]
        motivo = cand.get("finishReason", "")
        testo = "".join(p.get("text", "") for p in (cand.get("content") or {}).get("parts") or [] if not p.get("thought"))
        return Risposta(testo, tin, tout, rifiutata=motivo in ("SAFETY", "PROHIBITED_CONTENT", "BLOCKLIST", "SPII", "RECITATION"),
                        troncata=motivo == "MAX_TOKENS")

    # ------------------------------------------------------------------ Anthropic (Claude)
    def _anthropic(self, modello: str, prompt: str, token_massimi: int) -> Risposta:
        corpo = {"model": modello, "max_tokens": token_massimi, "system": ISTRUZIONI, "messages": [{"role": "user", "content": prompt}]}
        d = self._post(self.cfg.ia_url, corpo, {"x-api-key": self.cfg.ia_chiave, "anthropic-version": "2023-06-01",
                                                 "content-type": "application/json"}, modello)
        uso = d.get("usage") or {}
        testo = "".join(b.get("text", "") for b in d.get("content") or [] if b.get("type") == "text")
        return Risposta(testo, int(uso.get("input_tokens") or 0), int(uso.get("output_tokens") or 0),
                        rifiutata=d.get("stop_reason") == "refusal", troncata=d.get("stop_reason") == "max_tokens")

    # ------------------------------------------------------------------ compatibili OpenAI (Groq, Mistral, OpenRouter, Ollama...)
    def _openai(self, modello: str, prompt: str, token_massimi: int) -> Risposta:
        corpo: dict[str, Any] = {"model": modello, "max_tokens": token_massimi, "response_format": {"type": "json_object"},
                                 "messages": [{"role": "system", "content": ISTRUZIONI}, {"role": "user", "content": prompt}]}
        intestazioni = {"content-type": "application/json"}
        if self.cfg.ia_chiave:
            intestazioni["authorization"] = f"Bearer {self.cfg.ia_chiave}"
            if urlsplit(self.cfg.ia_url).hostname and str(urlsplit(self.cfg.ia_url).hostname).endswith(".azure.com"):
                intestazioni["api-key"] = self.cfg.ia_chiave     # Azure OpenAI accetta la chiave anche in questa intestazione
        url = f"{self.cfg.ia_url}/chat/completions"
        for _ in range(3):
            try:
                d = self._post(url, corpo, intestazioni, modello)
                break
            except ErroreIA as e:
                if e.codice != "upstream_error":
                    raise
                if "max_tokens" in corpo and "max_completion_tokens" in e.corpo:
                    corpo["max_completion_tokens"] = corpo.pop("max_tokens")   # modelli recenti di OpenAI e Azure
                elif "response_format" in corpo:
                    del corpo["response_format"]        # alcuni servizi non conoscono la modalita' JSON: si riprova senza
                else:
                    raise
        uso = d.get("usage") or {}
        scelta = (d.get("choices") or [{}])[0]
        testo = (scelta.get("message") or {}).get("content") or ""
        return Risposta(testo, int(uso.get("prompt_tokens") or 0), int(uso.get("completion_tokens") or 0),
                        rifiutata=scelta.get("finish_reason") == "content_filter", troncata=scelta.get("finish_reason") == "length")
