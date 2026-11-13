"""Test dei fornitori IA: scelta da configurazione, formato delle chiamate a Gemini e ai servizi compatibili OpenAI,
traduzione degli errori (limite giornaliero del piano gratuito, chiave non valida, paese non supportato...).
Il servizio lo sceglie chi gestisce MAGIC HS e arriva dalla cartella condivisa (impostazioni.json)."""
from __future__ import annotations

import json

import httpx
import pytest

from conftest import PC, FintoClaude, imposta_ia
from taric.config import carica


@pytest.fixture
def pulito(tmp_path, monkeypatch):
    monkeypatch.setenv("TARIC_CONFIG", str(tmp_path / "nessuno.env"))
    for k in ("ANTHROPIC_API_KEY", "GEMINI_API_KEY", "GOOGLE_API_KEY", "TARIC_IA_FORNITORE", "TARIC_IA_URL", "TARIC_IA_CHIAVE",
              "TARIC_IA_MODELLO", "TARIC_IA_MODELLO_RAPIDO", "TARIC_MODELLO", "TARIC_MODELLO_RAPIDO"):
        monkeypatch.delenv(k, raising=False)
    return tmp_path


def cfg(tmp, **v):
    return carica({"TARIC_DATI": str(tmp / "dati"), **v})


def pc_con_ia(ambiente, **ia: str):
    """Chi gestisce MAGIC HS con il servizio IA indicato; restituisce (PC, client già entrato)."""
    tmp, cond, mp = ambiente
    imposta_ia(cond, **ia)
    pc = PC(tmp, cond, "mrossi", mp, versioni=("2026-11-01",))
    return pc, pc.entra()


def test_scelta_del_fornitore(pulito):
    assert cfg(pulito).ia_disponibile is False
    c = cfg(pulito, GEMINI_API_KEY="g")
    assert (c.ia_fornitore, c.modello_rapido, c.modello, c.ia_nome) == ("gemini", "gemini-3.5-flash-lite", "gemini-3.7-flash", "Gemini (Google)")
    assert cfg(pulito, GEMINI_API_KEY="g", ANTHROPIC_API_KEY="a").ia_fornitore == "gemini"
    c = cfg(pulito, GEMINI_API_KEY="g", ANTHROPIC_API_KEY="a", TARIC_IA_FORNITORE="anthropic")
    assert (c.ia_fornitore, c.ia_chiave, c.modello) == ("anthropic", "a", "claude-sonnet-5-5")
    c = cfg(pulito, GEMINI_API_KEY="g", TARIC_IA_MODELLO="gemini-3.6-flash")
    assert (c.modello, c.modello_rapido) == ("gemini-3.6-flash", "gemini-3.5-flash-lite")
    # compatibile OpenAI: serve almeno indirizzo e modello; la chiave e' facoltativa (Ollama in locale)
    assert cfg(pulito, TARIC_IA_FORNITORE="openai", TARIC_IA_URL="http://localhost:11434/v1").ia_disponibile is False
    c = cfg(pulito, TARIC_IA_FORNITORE="openai", TARIC_IA_URL="http://localhost:11434/v1/", TARIC_IA_MODELLO="qwen3:14b")
    assert c.ia_disponibile and c.ia_url == "http://localhost:11434/v1" and c.modello_rapido == "qwen3:14b"


def test_gemini_chiamate_e_risposte(ambiente):
    s, a = pc_con_ia(ambiente, fornitore="gemini", chiave="chiave-gemini")
    assert a.get("/api/io").json()["ia"]["nome"] == "Gemini (Google)"
    s.claude.risposte = [FintoClaude.testo('{"voci": [{"voce": "6403"}]}'), FintoClaude.testo('{"migliore": {"codice": "6403999610"}}')]
    assert a.post("/api/ia", json={"prompt": "scarpe", "livello": "rapido"}).json()["risultato"] == {"voci": [{"voce": "6403"}]}
    r = a.post("/api/ia", json={"prompt": "scegli", "livello": "standard"}).json()
    assert r["risultato"]["migliore"]["codice"] == "6403999610"
    assert r["uso"] == {"token_in": 120, "token_out": 80}           # i token di ragionamento si contano
    q1, q2 = s.claude.richieste
    assert q1["url"].endswith("/v1beta/models/gemini-3.5-flash-lite:generateContent")
    assert q2["url"].endswith("/v1beta/models/gemini-3.7-flash:generateContent")
    assert q1["intestazioni"]["x-goog-api-key"] == "chiave-gemini" and "key=" not in q1["url"]
    assert q1["corpo"]["generationConfig"]["responseMimeType"] == "application/json"
    assert "JSON" in q1["corpo"]["systemInstruction"]["parts"][0]["text"]
    assert q1["corpo"]["contents"][0]["parts"][0]["text"] == "scarpe"


def test_gemini_errori(ambiente):
    s, a = pc_con_ia(ambiente, fornitore="gemini", chiave="chiave-gemini")
    errore = lambda stato, msg, st="": httpx.Response(stato, json={"error": {"code": stato, "message": msg, "status": st}})
    s.claude.risposte = [
        errore(429, "Quota exceeded for metric: generate_content_free_tier_requests, limit: 20, quotaId: GenerateRequestsPerDayPerProjectPerModel-FreeTier", "RESOURCE_EXHAUSTED"),
        errore(429, "Quota exceeded: GenerateRequestsPerMinutePerProjectPerModel-FreeTier", "RESOURCE_EXHAUSTED"),
        errore(400, "API key not valid. Please pass a valid API key.", "INVALID_ARGUMENT"),
        errore(400, "User location is not supported for the API use.", "FAILED_PRECONDITION"),
        errore(404, "models/gemini-9 is not found for API version v1beta", "NOT_FOUND"),
        errore(503, "The model is overloaded. Please try again later.", "UNAVAILABLE"),
        httpx.Response(200, json={"promptFeedback": {"blockReason": "SAFETY"}, "usageMetadata": {"promptTokenCount": 10}}),
        FintoClaude.testo("non posso", stop="SAFETY"),
    ]
    codici = [a.post("/api/ia", json={"prompt": "x", "livello": "rapido"}).json().get("codice") for _ in range(8)]
    assert codici == ["limite_giornaliero", "rate_limited", "server_misconfigured", "regione_non_supportata",
                      "server_misconfigured", "overloaded", "refused", "refused"]
    r = a.post("/api/ia", json={"prompt": "x", "livello": "rapido"})          # dopo gli errori il servizio torna a rispondere
    assert r.status_code == 200


def test_messaggio_limite_giornaliero(ambiente):
    s, a = pc_con_ia(ambiente, fornitore="gemini", chiave="k")
    s.claude.risposte = [httpx.Response(429, json={"error": {"message": "quotaId: GenerateRequestsPerDayPerProjectPerModel-FreeTier"}})]
    r = a.post("/api/ia", json={"prompt": "x", "livello": "rapido"})
    assert r.status_code == 429 and "limite di oggi" in r.json()["errore"]


def test_compatibile_openai_groq_o_ollama(ambiente):
    s, a = pc_con_ia(ambiente, fornitore="openai", url="https://api.groq.com/openai/v1", modello="openai/gpt-oss-120b", chiave="chiave-groq")
    s.claude.risposte = [FintoClaude.testo('{"ok": 1}'),
                         httpx.Response(400, json={"error": {"message": "response_format is not supported"}}), FintoClaude.testo('{"ok": 2}')]
    assert a.post("/api/ia", json={"prompt": "x", "livello": "rapido"}).json()["risultato"] == {"ok": 1}
    q = s.claude.richieste[0]
    assert q["url"] == "https://api.groq.com/openai/v1/chat/completions"
    assert q["intestazioni"]["authorization"] == "Bearer chiave-groq"
    assert q["corpo"]["model"] == "openai/gpt-oss-120b" and q["corpo"]["response_format"] == {"type": "json_object"}
    assert q["corpo"]["messages"][0]["role"] == "system"
    # un servizio che non conosce la modalita' JSON: si riprova senza
    assert a.post("/api/ia", json={"prompt": "y", "livello": "standard"}).json()["risultato"] == {"ok": 2}
    assert "response_format" not in s.claude.richieste[-1]["corpo"]


def test_ollama_senza_chiave(ambiente):
    s, a = pc_con_ia(ambiente, fornitore="openai", url="http://localhost:11434/v1", modello="qwen3:14b")
    assert a.post("/api/ia", json={"prompt": "x", "livello": "rapido"}).status_code == 200
    assert "authorization" not in s.claude.richieste[0]["intestazioni"]
    assert json.loads(json.dumps(s.claude.richieste[0]["corpo"]))["model"] == "qwen3:14b"
