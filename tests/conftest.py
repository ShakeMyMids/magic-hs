"""Strumenti comuni dei test: finto servizio IA e un «PC» con MAGIC HS collegato a una cartella condivisa di prova."""
from __future__ import annotations

import hashlib
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
    """Finto servizio IA: risponde nel formato di chi chiama (Anthropic, Gemini o compatibile OpenAI), anche con lo
    strumento obbligato di Claude, ed elenca i modelli. Nei test si preparano le risposte: testo(...) per una risposta
    riuscita, oppure un httpx.Response grezzo. cache = token che il finto servizio dichiara letti dalla sua cache."""

    def __init__(self) -> None:
        self.richieste: list[dict] = []
        self.risposte: list = []
        self.cache = 0

    def __call__(self, request: httpx.Request) -> httpx.Response:
        url = str(request.url)
        if request.method == "GET":
            self.richieste.append({"url": url, "corpo": None, "intestazioni": dict(request.headers), "chiave": None})
            if "generativelanguage" in url or "/v1beta/" in url:
                return httpx.Response(200, json={"models": [{"name": "models/gemini-3.7-flash", "supportedGenerationMethods": ["generateContent"]},
                                                            {"name": "models/text-embedding-9", "supportedGenerationMethods": ["embedContent"]}]})
            return httpx.Response(200, json={"data": [{"id": "claude-sonnet-5-5"}, {"id": "claude-haiku-5-5"}]})
        corpo = json.loads(request.content)
        self.richieste.append({"url": url, "corpo": corpo, "intestazioni": dict(request.headers),
                               "chiave": request.headers.get("x-api-key") or request.headers.get("x-goog-api-key") or request.headers.get("authorization")})
        r = self.risposte.pop(0) if self.risposte else FintoClaude.testo('{"merce": "prova", "voci": [{"voce": "8467", "motivo": "utensile"}], "non_classificabile": null}')
        if isinstance(r, httpx.Response):
            return r
        _, testo, stop = r
        if ":generateContent" in url:
            motivo = {"refusal": "SAFETY", "end_turn": "STOP"}.get(stop, stop)
            return httpx.Response(200, json={"candidates": [{"content": {"role": "model", "parts": [{"text": "ragiono...", "thought": True}, {"text": testo}]},
                                                             "finishReason": motivo}],
                                             "usageMetadata": {"promptTokenCount": 120, "candidatesTokenCount": 30, "thoughtsTokenCount": 50,
                                                               "cachedContentTokenCount": self.cache}})
        if url.endswith("/chat/completions"):
            motivo = {"refusal": "content_filter", "end_turn": "stop"}.get(stop, stop)
            return httpx.Response(200, json={"choices": [{"message": {"role": "assistant", "content": testo}, "finish_reason": motivo}],
                                             "usage": {"prompt_tokens": 120, "completion_tokens": 30, "prompt_tokens_details": {"cached_tokens": self.cache}}})
        uso = {"input_tokens": 120 - self.cache, "output_tokens": 30, "cache_read_input_tokens": self.cache, "cache_creation_input_tokens": 0}
        try:
            valore = json.loads(testo)
        except ValueError:
            valore = None
        if corpo.get("tools") and isinstance(valore, dict) and stop != "refusal":
            return httpx.Response(200, json={"content": [{"type": "tool_use", "id": "toolu_1", "name": corpo["tools"][0]["name"], "input": valore}],
                                             "stop_reason": "tool_use", "usage": uso})
        return httpx.Response(200, json={"content": [{"type": "text", "text": testo}], "stop_reason": stop, "usage": uso})

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


class FintoGitHub:
    """Finta pagina delle versioni di GitHub: ultima versione e download del pacchetto per Windows.
    Senza versione (o con errore=...) risponde con un errore: i test non si collegano mai al GitHub vero."""

    def __init__(self, versione: str = "", pacchetto: bytes = b"", digest: str | None = None, errore: int = 0):
        self.versione, self.pacchetto, self.errore = versione, pacchetto, errore
        self.digest = digest if digest is not None else "sha256:" + hashlib.sha256(pacchetto).hexdigest()
        self.richieste: list[str] = []

    def __call__(self, request: httpx.Request) -> httpx.Response:
        self.richieste.append(str(request.url))
        if self.errore or not self.versione:
            return httpx.Response(self.errore or 404, json={"message": "Not Found"})
        nome = f"magic-hs-windows-{self.versione}.zip"
        if request.url.path.endswith("/releases/latest"):
            return httpx.Response(200, json={
                "tag_name": f"v{self.versione}", "draft": False, "prerelease": False, "published_at": "2026-11-20T10:00:00Z",
                "html_url": f"https://github.com/ShakeMyMids/magic-hs/releases/tag/v{self.versione}",
                "assets": [{"name": f"MAGIC-HS-cartella-{self.versione}.zip", "size": 1, "browser_download_url": "https://example.invalid/x"},
                           {"name": nome, "size": len(self.pacchetto), "digest": self.digest,
                            "browser_download_url": f"https://github.com/ShakeMyMids/magic-hs/releases/download/v{self.versione}/{nome}"}]})
        if request.url.path.endswith("/" + nome):
            return httpx.Response(200, content=self.pacchetto)
        return httpx.Response(404)


class PC:
    """Un PC con MAGIC HS. Il nome e' anche il nome utente di Windows. editore=True lo mette nell'elenco di chi
    pubblica; il PC puo' scrivere nella cartella, tranne con sola_lettura=True (il caso dei colleghi: raccolta di
    SharePoint sincronizzata con il solo permesso di lettura)."""

    def __init__(self, tmp: Path, condivisa: Path, nome: str, mp: pytest.MonkeyPatch, editore: bool = True,
                 versioni: tuple[str, ...] = (), sola_lettura: bool = False, extra: dict[str, str] | None = None,
                 github: FintoGitHub | None = None):
        self.cartella = tmp / nome
        if editore:
            imposta_editori(condivisa, *dict.fromkeys(editori(Condivisa(condivisa).impostazioni()) + [nome]))
        for v in versioni:                                    # dati gia' installati su questo PC prima dell'avvio
            dati_finti(self.cartella / "dati" / "taric" / "versioni", v)
            (self.cartella / "dati" / "taric" / "attiva.txt").write_text(v)
        self.cfg = carica({"TARIC_DATI": str(self.cartella / "dati"), "TARIC_CONDIVISA": str(condivisa), "TARIC_PORTA": "8765", **(extra or {})})
        self.claude = FintoClaude()
        self.github = github or FintoGitHub()
        with mp.context() as m:
            m.setenv("USERNAME", nome)
            if sola_lettura:
                m.setattr(Condivisa, "scrivibile", lambda self: False)
            self.app = crea_app(self.cfg, httpx.Client(transport=httpx.MockTransport(self.claude)), pianificatore=False,
                                chiave_ingresso=CHIAVE, istanza="prova",
                                client_aggiornamenti=httpx.Client(transport=httpx.MockTransport(self.github), follow_redirects=True))
        self.attese: list[float] = []
        self.app.state.ia.attendi = self.attese.append          # i nuovi tentativi non aspettano davvero
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
