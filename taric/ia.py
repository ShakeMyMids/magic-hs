"""Chiamate all'intelligenza artificiale, con limite mensile di classificazioni per persona scelto da chi gestisce
MAGIC HS. La chiave resta nel programma; il browser manda solo il testo della richiesta.

Fornitori supportati (scelti in Gestione, vedi config._ia):
  gemini     API di Google Gemini (generateContent)
  anthropic  API Messages di Anthropic (Claude)
  openai     qualsiasi servizio compatibile con OpenAI Chat Completions: Azure OpenAI, Groq, Mistral, OpenRouter,
             OpenAI, Ollama in locale... (indirizzo base, per esempio https://api.groq.com/openai/v1)

Ogni richiesta ha due parti: il «contesto», uguale tra una richiesta e l'altra della stessa classificazione (istruzioni e
testo ufficiale delle voci, anche 40.000 token) e il «prompt» con la merce e le risposte dell'utente, messo in fondo.
Così i fornitori riusano il contesto dalla loro cache (Claude con cache_control, OpenAI e Gemini da soli) e
«Riclassifica» costa molto meno. La risposta segue uno schema JSON imposto al modello (SCHEMI): strumento obbligato per
Claude, json_schema per i compatibili OpenAI, responseSchema per Gemini; se un servizio non lo accetta si riprova
senza. Sovraccarico e limiti al minuto si riprovano da soli (TENTATIVI, con l'attesa che il servizio indica).
"""
from __future__ import annotations

import copy
import json
import logging
import re
import sqlite3
import threading
import time
from dataclasses import dataclass
from typing import Any, Callable
from urllib.parse import urlsplit

import httpx

from .config import Config
from .db import Database, adesso, iso

log = logging.getLogger("taric.ia")

MASSIMO_CARATTERI = 400_000
TOKEN_MASSIMI = {"rapido": 4096, "standard": 16384}   # margine per i modelli che "ragionano" prima di rispondere
ISTRUZIONI = ("Rispondi esclusivamente con un unico valore JSON valido che rispetta il formato richiesto, senza testo "
              "prima o dopo e senza blocchi di codice. Scrivi i testi in italiano.")
TENTATIVI = 2                     # nuovi tentativi dopo sovraccarico o limite al minuto
ATTESA_MASSIMA = 20               # secondi: oltre, meglio dirlo subito all'utente
RICHIESTE_PER_CLASSIFICAZIONE = 6  # voci candidate, scelta, ricontrollo, con margine

# ------------------------------------------------------------------ schemi delle risposte
_S, _I = {"type": "string"}, {"type": "integer"}


def _oggetto(**campi: Any) -> dict[str, Any]:
    return {"type": "object", "properties": campi, "required": list(campi), "additionalProperties": False}


def _elenco(voce: dict[str, Any]) -> dict[str, Any]:
    return {"type": "array", "items": voce}


SCHEMI: dict[str, dict[str, Any]] = {
    "voci": _oggetto(merce=_S, voci=_elenco(_oggetto(voce=_S, motivo=_S)), non_classificabile={"type": ["string", "null"]}),
    "scelta": _oggetto(
        merce=_S,
        migliore=_oggetto(codice=_S, descrizione_it=_S, motivazione=_S, confidenza=_I),
        alternative=_elenco(_oggetto(codice=_S, descrizione_it=_S, quando=_S, confidenza=_I)),
        domande=_elenco(_oggetto(domanda=_S, opzioni=_elenco(_S), perche=_S)),
        altre_voci=_elenco(_S)),
    "traduzione": _oggetto(traduzioni=_elenco(_S)),
    "prova": _oggetto(ok={"type": "boolean"}),
}


def schema_gemini(s: dict[str, Any]) -> dict[str, Any]:
    """Lo schema nella forma di responseSchema di Gemini (tipi in maiuscolo, nullable, niente additionalProperties)."""
    out: dict[str, Any] = {}
    tipo = s.get("type")
    if isinstance(tipo, list):
        out["nullable"] = "null" in tipo
        tipo = next(t for t in tipo if t != "null")
    out["type"] = str(tipo).upper()
    if "properties" in s:
        out["properties"] = {k: schema_gemini(v) for k, v in s["properties"].items()}
        out["required"] = list(s.get("required", []))
        out["propertyOrdering"] = list(s["properties"])
    if "items" in s:
        out["items"] = schema_gemini(s["items"])
    return out


class ErroreIA(Exception):
    def __init__(self, codice: str, stato_http: int = 502, dettaglio: str = ""):
        super().__init__(codice)
        self.codice = codice
        self.stato_http = stato_http
        self.dettaglio = dettaglio
        self.corpo = ""                   # inizio della risposta d'errore del servizio, se c'e'
        self.stato_servizio = 0           # codice HTTP della risposta del servizio (0 = nessuna risposta)
        self.attesa: float | None = None  # secondi suggeriti dal servizio prima di riprovare


@dataclass
class Risposta:
    testo: str
    token_in: int                 # tutti i token in ingresso, compresi quelli letti dalla cache
    token_out: int
    rifiutata: bool = False
    troncata: bool = False
    token_cache: int = 0          # token in ingresso letti dalla cache del fornitore (costano molto meno)


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


def _attesa_suggerita(r: httpx.Response) -> float | None:
    v = r.headers.get("retry-after", "")
    if v.replace(".", "", 1).isdigit():
        return float(v)
    m = re.search(r'"retryDelay"\s*:\s*"(\d+(?:\.\d+)?)s"', r.text[:4000])        # Gemini
    return float(m.group(1)) if m else None


def _errore_http(r: httpx.Response, modello: str) -> ErroreIA:
    """Traduce le risposte d'errore dei tre fornitori in codici comuni."""
    e = _codice_http(r, modello)
    e.corpo = r.text[:800]
    e.stato_servizio = r.status_code
    e.attesa = _attesa_suggerita(r)
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


def _rifiuta_formato(e: ErroreIA) -> bool:
    """Il servizio non accetta lo schema, lo strumento o il formato JSON richiesto: si riprova senza."""
    return e.stato_servizio in (400, 422) and e.codice == "upstream_error"


class ServizioIA:
    def __init__(self, cfg: Config, db: Database, client: httpx.Client | None = None):
        self.cfg = cfg
        self.db = db
        self.client = client or httpx.Client(timeout=httpx.Timeout(180, connect=15))
        self._in_corso: dict[int, int] = {}
        self._lock = threading.Lock()
        self.attendi: Callable[[float], None] = time.sleep      # nei test non si aspetta davvero

    @property
    def disponibile(self) -> bool:
        return self.cfg.ia_disponibile

    # ------------------------------------------------------------------ limite mensile (in classificazioni)
    def limite(self, c: sqlite3.Connection, utente: sqlite3.Row) -> int | None:
        """Classificazioni al mese consentite; None = senza limite mensile. Chi pubblica (amministratore) non ha limite;
        per gli altri vale il limite scelto da chi gestisce MAGIC HS (0 = IA spenta)."""
        if utente["quota_ia"] is not None:
            return int(utente["quota_ia"])
        if utente["ruolo"] == "amministratore":
            return None
        q = self.db.impostazioni(c)["quota_predefinita"]
        return None if q is None else int(q)

    @staticmethod
    def usate(c: sqlite3.Connection, utente_id: int, mese: str | None = None) -> int:
        """Classificazioni del mese che hanno raggiunto il servizio (anche se la risposta non era utilizzabile).
        Le richieste registrate prima delle classificazioni (tipo vuoto) contano una ciascuna; le traduzioni no."""
        r = c.execute("SELECT COUNT(DISTINCT CASE WHEN operazione != '' THEN operazione END) AS ops, "
                      "COALESCE(SUM(CASE WHEN operazione = '' THEN 1 ELSE 0 END), 0) AS vecchie FROM uso_ia "
                      "WHERE utente_id = ? AND mese = ? AND tipo IN ('', 'classifica') AND (esito = 'ok' OR token_in > 0)",
                      (utente_id, mese or mese_corrente())).fetchone()
        return int(r["ops"]) + int(r["vecchie"])

    @staticmethod
    def uso_mese(c: sqlite3.Connection, mese: str | None = None) -> dict[str, int]:
        """Uso del mese su questo PC: classificazioni, richieste e token (per Gestione)."""
        r = c.execute("SELECT COUNT(*) AS richieste, COALESCE(SUM(token_in), 0) AS token_in, COALESCE(SUM(token_cache), 0) AS token_cache, "
                      "COALESCE(SUM(token_out), 0) AS token_out FROM uso_ia WHERE mese = ?", (mese or mese_corrente(),)).fetchone()
        utenti = [x[0] for x in c.execute("SELECT DISTINCT utente_id FROM uso_ia WHERE mese = ? AND utente_id IS NOT NULL", (mese or mese_corrente(),))]
        return {"classificazioni": sum(ServizioIA.usate(c, u, mese) for u in utenti), "richieste": int(r["richieste"]),
                "token_in": int(r["token_in"]), "token_cache": int(r["token_cache"]), "token_out": int(r["token_out"])}

    # ------------------------------------------------------------------ chiamate
    def _chiama(self, modello: str, contesto: str, prompt: str, token_massimi: int, schema: str | None) -> Risposta:
        f = {"gemini": self._gemini, "anthropic": self._anthropic, "openai": self._openai}[self.cfg.ia_fornitore]
        return f(modello, contesto, prompt, token_massimi, schema)

    def prova(self) -> dict[str, Any]:
        """Breve richiesta di prova al servizio configurato (pannello Gestione); non consuma la quota."""
        if not self.disponibile:
            raise ErroreIA("not_configured", 503)
        inizio = adesso()
        r = self._chiama(self.cfg.modello_rapido, "", 'Rispondi con questo oggetto JSON: {"ok": true}', 1024, "prova")
        if r.rifiutata:
            raise ErroreIA("refused", 422)
        valore = estrai_json(r.testo) if r.testo.strip() else None
        if valore is None:
            raise ErroreIA("empty_completion", 502)
        return {"risposta": valore, "secondi": round((adesso() - inizio).total_seconds(), 1),
                "modello": self.cfg.modello_rapido, "token_in": r.token_in, "token_out": r.token_out}

    def chiedi(self, utente: sqlite3.Row, prompt: str, livello: str, contesto: str = "", schema: str | None = None,
               operazione: str = "", tipo: str = "classifica") -> dict[str, Any]:
        if not self.disponibile:
            raise ErroreIA("not_configured", 503)
        if livello not in TOKEN_MASSIMI or tipo not in ("classifica", "traduzione") or (schema and schema not in SCHEMI) \
                or not isinstance(prompt, str) or not prompt.strip():
            raise ErroreIA("bad_request", 400)
        if len(prompt) + len(contesto) > MASSIMO_CARATTERI:
            raise ErroreIA("prompt_too_large", 413)
        uid = int(utente["id"])
        with self.db.connessione() as c:
            lim = self.limite(c, utente)
            if lim == 0:
                raise ErroreIA("quota_esaurita", 429)
            if tipo == "classifica":
                gia = c.execute("SELECT COUNT(*) FROM uso_ia WHERE utente_id = ? AND operazione = ? AND operazione != ''",
                                (uid, operazione)).fetchone()[0]
                if gia >= RICHIESTE_PER_CLASSIFICAZIONE:
                    raise ErroreIA("rate_limited", 429)
                if not gia and lim is not None and self.usate(c, uid) >= lim:
                    raise ErroreIA("quota_esaurita", 429)
        with self._lock:
            if self._in_corso.get(uid, 0) >= 2:
                raise ErroreIA("rate_limited", 429)
            self._in_corso[uid] = self._in_corso.get(uid, 0) + 1
        modello = self.cfg.modello_rapido if livello == "rapido" else self.cfg.modello
        esito, tin, tout, tcache = "errore", 0, 0, 0
        try:
            r = self._chiama(modello, contesto, prompt, TOKEN_MASSIMI[livello], schema)
            tin, tout, tcache = r.token_in, r.token_out, r.token_cache
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
            return {"risultato": valore, "uso": {"token_in": tin, "token_out": tout, "token_cache": tcache}}
        finally:
            with self._lock:
                self._in_corso[uid] = max(0, self._in_corso.get(uid, 1) - 1)
            with self.db.connessione() as c:
                c.execute("INSERT INTO uso_ia(utente_id, quando, mese, livello, modello, token_in, token_out, esito, operazione, tipo, token_cache) "
                          "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                          (uid, iso(), mese_corrente(), livello, modello, tin, tout, esito, operazione[:40], tipo, tcache))

    def _post(self, url: str, corpo: dict[str, Any], intestazioni: dict[str, str], modello: str) -> dict[str, Any]:
        """POST al servizio; sovraccarico, limite al minuto ed errori di rete si riprovano da soli (al massimo TENTATIVI volte)."""
        for n in range(TENTATIVI + 1):
            try:
                r = self.client.post(url, json=corpo, headers=intestazioni)
            except httpx.TimeoutException:
                raise ErroreIA("upstream_timeout", 504)          # dopo minuti d'attesa non conviene riprovare
            except httpx.HTTPError as e:
                log.error("servizio IA non raggiungibile: %s", e)
                errore = ErroreIA("upstream_error", 502)
            else:
                if r.status_code == 200:
                    try:
                        return r.json()
                    except ValueError:
                        raise ErroreIA("upstream_error", 502)
                errore = _errore_http(r, modello)
                if errore.codice not in ("rate_limited", "overloaded"):
                    raise errore
            attesa = errore.attesa if errore.attesa is not None else 2.0 * (2 ** n)
            if n == TENTATIVI or attesa > ATTESA_MASSIMA:
                raise errore
            log.info("servizio IA: %s, nuovo tentativo tra %.0f s", errore.codice, attesa)
            self.attendi(attesa)
        raise ErroreIA("upstream_error", 502)   # non si arriva qui

    # ------------------------------------------------------------------ Google Gemini
    def _gemini(self, modello: str, contesto: str, prompt: str, token_massimi: int, schema: str | None) -> Risposta:
        parti = ([{"text": contesto}] if contesto else []) + [{"text": prompt}]
        corpo: dict[str, Any] = {
            "systemInstruction": {"parts": [{"text": ISTRUZIONI}]},
            "contents": [{"role": "user", "parts": parti}],
            "generationConfig": {"responseMimeType": "application/json", "maxOutputTokens": token_massimi},
        }
        if schema:
            corpo["generationConfig"]["responseSchema"] = schema_gemini(SCHEMI[schema])
        url = f"{self.cfg.ia_url}/models/{modello}:generateContent"
        intestazioni = {"x-goog-api-key": self.cfg.ia_chiave, "content-type": "application/json"}
        try:
            d = self._post(url, corpo, intestazioni, modello)
        except ErroreIA as e:
            if not (schema and _rifiuta_formato(e)):
                raise
            del corpo["generationConfig"]["responseSchema"]
            d = self._post(url, corpo, intestazioni, modello)
        uso = d.get("usageMetadata") or {}
        tin = int(uso.get("promptTokenCount") or 0)
        tout = int(uso.get("candidatesTokenCount") or 0) + int(uso.get("thoughtsTokenCount") or 0)
        tcache = int(uso.get("cachedContentTokenCount") or 0)
        if (d.get("promptFeedback") or {}).get("blockReason"):
            return Risposta("", tin, tout, rifiutata=True, token_cache=tcache)
        cand = (d.get("candidates") or [{}])[0]
        motivo = cand.get("finishReason", "")
        testo = "".join(p.get("text", "") for p in (cand.get("content") or {}).get("parts") or [] if not p.get("thought"))
        return Risposta(testo, tin, tout, rifiutata=motivo in ("SAFETY", "PROHIBITED_CONTENT", "BLOCKLIST", "SPII", "RECITATION"),
                        troncata=motivo == "MAX_TOKENS", token_cache=tcache)

    # ------------------------------------------------------------------ Anthropic (Claude)
    def _anthropic(self, modello: str, contesto: str, prompt: str, token_massimi: int, schema: str | None) -> Risposta:
        # il contesto (istruzioni e testo ufficiale delle voci) va in cache: le richieste successive lo rileggono a poco prezzo
        contenuto: Any = ([{"type": "text", "text": contesto, "cache_control": {"type": "ephemeral"}}, {"type": "text", "text": prompt}]
                          if contesto else prompt)
        corpo: dict[str, Any] = {"model": modello, "max_tokens": token_massimi, "system": ISTRUZIONI,
                                 "messages": [{"role": "user", "content": contenuto}]}
        if schema:      # risposta obbligata nello strumento: il JSON segue lo schema
            corpo["tools"] = [{"name": "risposta", "description": "Restituisce la risposta nel formato richiesto.", "input_schema": SCHEMI[schema]}]
            corpo["tool_choice"] = {"type": "tool", "name": "risposta"}
        intestazioni = {"x-api-key": self.cfg.ia_chiave, "anthropic-version": "2023-06-01", "content-type": "application/json"}
        try:
            d = self._post(self.cfg.ia_url, corpo, intestazioni, modello)
        except ErroreIA as e:
            if not (schema and _rifiuta_formato(e)):
                raise
            corpo.pop("tools"), corpo.pop("tool_choice")
            d = self._post(self.cfg.ia_url, corpo, intestazioni, modello)
        uso = d.get("usage") or {}
        letti, scritti = int(uso.get("cache_read_input_tokens") or 0), int(uso.get("cache_creation_input_tokens") or 0)
        tin = int(uso.get("input_tokens") or 0) + letti + scritti
        blocchi = d.get("content") or []
        strumento = next((b for b in blocchi if b.get("type") == "tool_use"), None)
        testo = json.dumps(strumento.get("input"), ensure_ascii=False) if strumento is not None else \
            "".join(b.get("text", "") for b in blocchi if b.get("type") == "text")
        return Risposta(testo, tin, int(uso.get("output_tokens") or 0), rifiutata=d.get("stop_reason") == "refusal",
                        troncata=d.get("stop_reason") == "max_tokens", token_cache=letti)

    # ------------------------------------------------------------------ compatibili OpenAI (Azure, Groq, Mistral, OpenRouter, Ollama...)
    def _openai(self, modello: str, contesto: str, prompt: str, token_massimi: int, schema: str | None) -> Risposta:
        testo_utente = f"{contesto}\n\n{prompt}" if contesto else prompt      # prefisso uguale: cache automatica del servizio
        formati: list[dict[str, Any] | None] = [{"type": "json_object"}, None]
        if schema:
            formati.insert(0, {"type": "json_schema", "json_schema": {"name": schema, "strict": True, "schema": copy.deepcopy(SCHEMI[schema])}})
        corpo: dict[str, Any] = {"model": modello, "max_tokens": token_massimi,
                                 "messages": [{"role": "system", "content": ISTRUZIONI}, {"role": "user", "content": testo_utente}]}
        intestazioni = {"content-type": "application/json"}
        if self.cfg.ia_chiave:
            intestazioni["authorization"] = f"Bearer {self.cfg.ia_chiave}"
            if urlsplit(self.cfg.ia_url).hostname and str(urlsplit(self.cfg.ia_url).hostname).endswith(".azure.com"):
                intestazioni["api-key"] = self.cfg.ia_chiave     # Azure OpenAI accetta la chiave anche in questa intestazione
        url = f"{self.cfg.ia_url}/chat/completions"
        k = 0
        while True:
            if formati[k] is None:
                corpo.pop("response_format", None)
            else:
                corpo["response_format"] = formati[k]
            try:
                d = self._post(url, corpo, intestazioni, modello)
                break
            except ErroreIA as e:
                if not _rifiuta_formato(e):
                    raise
                if "max_tokens" in corpo and "max_completion_tokens" in e.corpo:
                    corpo["max_completion_tokens"] = corpo.pop("max_tokens")   # modelli recenti di OpenAI e Azure
                elif k + 1 < len(formati):
                    k += 1          # il servizio non conosce questo formato di risposta: si prova il successivo
                else:
                    raise
        uso = d.get("usage") or {}
        scelta = (d.get("choices") or [{}])[0]
        testo = (scelta.get("message") or {}).get("content") or ""
        return Risposta(testo, int(uso.get("prompt_tokens") or 0), int(uso.get("completion_tokens") or 0),
                        rifiutata=scelta.get("finish_reason") == "content_filter", troncata=scelta.get("finish_reason") == "length",
                        token_cache=int((uso.get("prompt_tokens_details") or {}).get("cached_tokens") or 0))

    # ------------------------------------------------------------------ elenco dei modelli (suggerimenti in Gestione)
    def modelli(self) -> list[str]:
        if not self.disponibile:
            raise ErroreIA("not_configured", 503)
        f = self.cfg.ia_fornitore
        if f == "gemini":
            url, intest = f"{self.cfg.ia_url}/models?pageSize=200", {"x-goog-api-key": self.cfg.ia_chiave}
        elif f == "anthropic":
            url = re.sub(r"/messages$", "", self.cfg.ia_url) + "/models?limit=100"
            intest = {"x-api-key": self.cfg.ia_chiave, "anthropic-version": "2023-06-01"}
        else:
            url, intest = f"{self.cfg.ia_url}/models", ({"authorization": f"Bearer {self.cfg.ia_chiave}"} if self.cfg.ia_chiave else {})
        try:
            r = self.client.get(url, headers=intest, timeout=20)
        except httpx.HTTPError:
            raise ErroreIA("upstream_error", 502)
        if r.status_code != 200:
            raise _errore_http(r, "")
        try:
            d = r.json()
        except ValueError:
            raise ErroreIA("upstream_error", 502)
        if f == "gemini":
            nomi = [str(m.get("name", "")).removeprefix("models/") for m in d.get("models") or []
                    if "generateContent" in (m.get("supportedGenerationMethods") or [])]
        else:
            nomi = [str(m.get("id", "")) for m in d.get("data") or []]
        return sorted({n for n in nomi if n and len(n) <= 120})
