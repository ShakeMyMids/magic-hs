"""Strumenti comuni dei test: finto servizio IA e un «PC» con MAGIC HS collegato a una cartella condivisa di prova."""
from __future__ import annotations

import json
from pathlib import Path

import httpx
import pytest
from fastapi.testclient import TestClient

from taric.app import crea_app
from taric.condivisa import Condivisa, editori
from taric.config import carica

CHIAVE = "chiave-di-ingresso-di-prova"


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


def dati_finti(cartella: Path, versione: str, testo: str = "") -> Path:
    d = cartella / versione
    (d / "m").mkdir(parents=True, exist_ok=True)
    (d / "nomenclatura.js").write_text(f'window.TARIC_DATA={{"meta":{{}}}};/*{testo or versione}*/\n')
    (d / "m" / "84.js").write_text("window.TARIC_M=window.TARIC_M||{};\n")
    (d / "versione.json").write_text(json.dumps({"data": versione}))
    (d / "riepilogo.txt").write_text("riepilogo\n")
    return d


def imposta_editori(condivisa: Path, *nomi: str) -> None:
    c = Condivisa(condivisa)
    c.salva_impostazioni({**c.impostazioni(), "editori": list(nomi)})


def imposta_ia(condivisa: Path, quota: int | None = 50, **ia: str) -> None:
    """Servizio IA per tutti, come lo salva chi gestisce MAGIC HS (fornitore, chiave, url, modello, modello_rapido)."""
    c = Condivisa(condivisa)
    c.salva_impostazioni({**c.impostazioni(), "ia": ia, "quota": quota})


class PC:
    """Un PC con MAGIC HS. Il nome e' anche il nome utente di Windows. editore=True lo mette nell'elenco di chi
    pubblica; il PC puo' scrivere nella cartella, tranne con sola_lettura=True (il caso dei colleghi: raccolta di
    SharePoint sincronizzata con il solo permesso di lettura)."""

    def __init__(self, tmp: Path, condivisa: Path, nome: str, mp: pytest.MonkeyPatch, editore: bool = True,
                 versioni: tuple[str, ...] = (), sola_lettura: bool = False, extra: dict[str, str] | None = None):
        self.cartella = tmp / nome
        if editore:
            imposta_editori(condivisa, *dict.fromkeys(editori(Condivisa(condivisa).impostazioni()) + [nome]))
        for v in versioni:                                    # dati gia' installati su questo PC prima dell'avvio
            dati_finti(self.cartella / "dati" / "taric" / "versioni", v)
            (self.cartella / "dati" / "taric" / "attiva.txt").write_text(v)
        self.cfg = carica({"TARIC_DATI": str(self.cartella / "dati"), "TARIC_CONDIVISA": str(condivisa), "TARIC_PORTA": "8765", **(extra or {})})
        self.claude = FintoClaude()
        with mp.context() as m:
            m.setenv("USERNAME", nome)
            if sola_lettura:
                m.setattr(Condivisa, "scrivibile", lambda self: False)
            self.app = crea_app(self.cfg, httpx.Client(transport=httpx.MockTransport(self.claude)), pianificatore=False,
                                chiave_ingresso=CHIAVE, istanza="prova")
        self.fermato = False

        def ferma() -> None:
            self.fermato = True
        self.app.state.ferma = ferma

    def client(self, base: str = "http://127.0.0.1:8765") -> TestClient:
        return TestClient(self.app, base_url=base, headers={"X-Taric": "1"})

    def entra(self) -> TestClient:
        c = self.client()
        r = c.get(f"/entra?k={CHIAVE}", follow_redirects=False)
        assert r.status_code == 303 and "magic_hs_locale" in r.cookies
        return c

    def attiva(self) -> str | None:
        return self.app.state.dati.attiva()


@pytest.fixture
def ambiente(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> tuple[Path, Path, pytest.MonkeyPatch]:
    monkeypatch.setenv("TARIC_CONFIG", str(tmp_path / "nessuno.env"))
    for k in ("ANTHROPIC_API_KEY", "GEMINI_API_KEY", "GOOGLE_API_KEY", "TARIC_IA_FORNITORE", "TARIC_IA_URL", "TARIC_IA_CHIAVE",
              "TARIC_IA_MODELLO", "TARIC_IA_MODELLO_RAPIDO", "TARIC_MODELLO", "TARIC_MODELLO_RAPIDO", "TARIC_DATI"):
        monkeypatch.delenv(k, raising=False)
    condivisa = tmp_path / "OneDrive - Azienda" / "MAGIC HS"
    condivisa.mkdir(parents=True)
    return tmp_path, condivisa, monkeypatch


@pytest.fixture
def editore(ambiente) -> PC:
    """Chi gestisce MAGIC HS, con i dati di novembre 2026 e Claude come servizio IA per tutti."""
    tmp, cond, mp = ambiente
    imposta_ia(cond, fornitore="anthropic", chiave="chiave-di-prova")
    return PC(tmp, cond, "mrossi", mp, versioni=("2026-11-01",))
