from __future__ import annotations

import hashlib
import hmac
import json
import time
from pathlib import Path

import httpx
import pytest
from fastapi.testclient import TestClient

from taric.app import crea_app
from taric.config import carica


class FintoClaude:
    """Finto servizio IA: risponde nel formato di chi chiama (Anthropic, Gemini o compatibile OpenAI).
    Nei test si preparano le risposte: testo(...) per una risposta riuscita, oppure un httpx.Response grezzo."""

    def __init__(self) -> None:
        self.richieste: list[dict] = []
        self.risposte: list = []

    def __call__(self, request: httpx.Request) -> httpx.Response:
        corpo = json.loads(request.content)
        self.richieste.append({"url": str(request.url), "corpo": corpo, "intestazioni": dict(request.headers),
                               "chiave": request.headers.get("x-api-key") or request.headers.get("x-goog-api-key") or request.headers.get("authorization")})
        r = self.risposte.pop(0) if self.risposte else FintoClaude.testo('{"merce": "prova", "voci": [{"voce": "8467", "motivo": "utensile"}]}')
        if isinstance(r, httpx.Response):
            return r
        _, testo, stop = r
        url = str(request.url)
        if ":generateContent" in url:
            motivo = {"refusal": "SAFETY", "end_turn": "STOP"}.get(stop, stop)
            return httpx.Response(200, json={"candidates": [{"content": {"role": "model", "parts": [{"text": "ragiono...", "thought": True}, {"text": testo}]},
                                                             "finishReason": motivo}],
                                             "usageMetadata": {"promptTokenCount": 120, "candidatesTokenCount": 30, "thoughtsTokenCount": 50}})
        if url.endswith("/chat/completions"):
            motivo = {"refusal": "content_filter", "end_turn": "stop"}.get(stop, stop)
            return httpx.Response(200, json={"choices": [{"message": {"role": "assistant", "content": testo}, "finish_reason": motivo}],
                                             "usage": {"prompt_tokens": 120, "completion_tokens": 30}})
        return httpx.Response(200, json={"content": [{"type": "text", "text": testo}], "stop_reason": stop,
                                         "usage": {"input_tokens": 120, "output_tokens": 30}})

    @staticmethod
    def testo(t: str, stop: str = "end_turn") -> tuple:
        return ("testo", t, stop)


class Sito:
    def __init__(self, tmp: Path, extra: dict[str, str] | None = None):
        self.tmp = tmp
        valori = {"TARIC_DATI": str(tmp / "dati"), "ANTHROPIC_API_KEY": "chiave-di-prova", "TARIC_AGGIORNAMENTO_AUTOMATICO": "no"}
        valori.update(extra or {})
        self.cfg = carica(valori)
        self.claude = FintoClaude()
        self.app = crea_app(self.cfg, httpx.Client(transport=httpx.MockTransport(self.claude)), pianificatore=False)
        self.posta_inviata: list[dict] = []
        if self.cfg.posta_configurata:
            def finto_invio(msg, destinatario, oggetto, testo):
                self.posta_inviata.append({"a": destinatario, "oggetto": oggetto, "testo": testo})
            self.app.state.posta._spedisci = finto_invio
            orig = self.app.state.posta.invia
            self.app.state.posta.invia = lambda d, o, t, attendi=False: orig(d, o, t, attendi=True)

    def client(self) -> TestClient:
        return TestClient(self.app, headers={"X-Taric": "1"})

    def modulo(self) -> str:
        t = str(int(time.time()) - 10)
        return t + "." + hmac.new(self.cfg.segreto, b"modulo:" + t.encode(), hashlib.sha256).hexdigest()[:32]

    def codice(self) -> str:
        return (self.cfg.dati / "codice-configurazione.txt").read_text().strip()

    def admin(self, email: str = "admin@esempio.it", password: str = "Password-Admin-1") -> TestClient:
        c = self.client()
        r = c.post("/api/configurazione-iniziale", json={"codice": self.codice(), "nome": "Amministratore", "email": email, "password": password})
        assert r.status_code == 200, r.text
        return c

    def utente(self, admin: TestClient, email: str, password: str = "Password-Utente-1", quota: int | None = None) -> TestClient:
        r = admin.post("/api/admin/utenti", json={"nome": "Utente " + email.split("@")[0], "email": email, "quota_ia": quota})
        assert r.status_code == 200, r.text
        gettone = r.json()["link"].split("#", 1)[1]
        c = self.client()
        r = c.post("/api/reimposta-password", json={"gettone": gettone, "password": password})
        assert r.status_code == 200 and r.json()["entrato"], r.text
        return c

    def posta_in_uscita(self) -> list[dict]:
        return self.app.state.posta.in_uscita(200)

    def versione_finta(self, versione: str = "2026-11-01") -> None:
        d = self.cfg.dati / "taric" / "versioni" / versione
        (d / "m").mkdir(parents=True, exist_ok=True)
        (d / "nomenclatura.js").write_text('window.TARIC_DATA={"meta":{}};\n')
        (d / "m" / "84.js").write_text('window.TARIC_M=window.TARIC_M||{};\n')
        (d / "versione.json").write_text(json.dumps({"data": versione}))
        self.app.state.dati.imposta_attiva(versione)


@pytest.fixture
def sito(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Sito:
    monkeypatch.setenv("TARIC_CONFIG", str(tmp_path / "nessuno.env"))
    for k in ("ANTHROPIC_API_KEY", "GEMINI_API_KEY", "GOOGLE_API_KEY", "TARIC_IA_FORNITORE", "TARIC_IA_URL", "TARIC_IA_CHIAVE",
              "TARIC_IA_MODELLO", "TARIC_IA_MODELLO_RAPIDO", "TARIC_SMTP_HOST", "TARIC_SMTP_MITTENTE", "TARIC_DATI"):
        monkeypatch.delenv(k, raising=False)
    return Sito(tmp_path)


@pytest.fixture
def sito_con_posta(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Sito:
    monkeypatch.setenv("TARIC_CONFIG", str(tmp_path / "nessuno.env"))
    for k in ("GEMINI_API_KEY", "GOOGLE_API_KEY", "TARIC_IA_FORNITORE"):
        monkeypatch.delenv(k, raising=False)
    return Sito(tmp_path, {"TARIC_SMTP_HOST": "smtp.esempio.it", "TARIC_SMTP_MITTENTE": "TARIC <taric@esempio.it>"})
