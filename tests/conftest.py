"""Strumenti comuni dei test: finti servizi esterni (IA e GitHub) e un «PC» con MAGIC HS."""
from __future__ import annotations

import hashlib
import io
import json
import zipfile
from pathlib import Path

import httpx
import pytest
from fastapi.testclient import TestClient

from taric.app import crea_app
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


def zip_dei_dati(versione: str, cartella: Path, diversi: dict[str, str] | None = None) -> bytes:
    """Archivio dei dati pronti di un mese, come lo pubblica il flusso «Dati TARIC» (diversi: file da aggiungere o cambiare)."""
    d = dati_finti(cartella, versione)
    b = io.BytesIO()
    with zipfile.ZipFile(b, "w") as z:
        for f in sorted(d.rglob("*")):
            if f.is_file():
                z.write(f, f.relative_to(d).as_posix())
        for nome, testo in (diversi or {}).items():
            z.writestr(nome, testo)
    return b.getvalue()


def sha(b: bytes) -> str:
    return "sha256:" + hashlib.sha256(b).hexdigest()


class FintoGitHub:
    """Finta GitHub: ultima versione del programma con il suo pacchetto per Windows, pagina «dati» con i dati pronti dei
    mesi (dati={"AAAA-MM": archivio}) ed estrazioni della fonte (fonte={"AAAA-MM": archivio}). Quello che manca risponde
    404 (con errore=... tutto risponde con quell'errore): i test non si collegano mai a GitHub o alla fonte vera."""

    def __init__(self, versione: str = "", pacchetto: bytes = b"", digest: str | None = None, errore: int = 0,
                 dati: dict[str, bytes] | None = None, digest_dati: dict[str, str] | None = None, fonte: dict[str, bytes] | None = None):
        self.versione, self.pacchetto, self.errore = versione, pacchetto, errore
        self.digest = digest if digest is not None else sha(pacchetto)
        self.dati, self.digest_dati, self.fonte = dati or {}, digest_dati or {}, fonte or {}
        self.richieste: list[str] = []

    def __call__(self, request: httpx.Request) -> httpx.Response:
        self.richieste.append(str(request.url))
        p = request.url.path
        if self.errore:
            return httpx.Response(self.errore, json={"message": "errore"})
        if p.endswith("/releases/tags/dati") and self.dati:
            return httpx.Response(200, json={"tag_name": "dati", "prerelease": True, "assets": [
                {"name": f"dati-{m}-01.zip", "size": len(b), "digest": self.digest_dati.get(m, sha(b)),
                 "browser_download_url": f"https://github.com/ShakeMyMids/magic-hs/releases/download/dati/dati-{m}-01.zip"}
                for m, b in self.dati.items()]})
        if "/releases/download/dati/dati-" in p:
            m = p.rsplit("dati-", 1)[1][:7]
            return httpx.Response(200, content=self.dati[m]) if m in self.dati else httpx.Response(404)
        if "/eu-taric-" in p:                                   # fonte dell'estrazione (config.fonte_url)
            m = p.rsplit("eu-taric-", 1)[1][:7]
            return httpx.Response(200, content=self.fonte[m]) if m in self.fonte else httpx.Response(404)
        if not self.versione:
            return httpx.Response(404, json={"message": "Not Found"})
        nome = f"magic-hs-windows-{self.versione}.zip"
        if p.endswith("/releases/latest"):
            return httpx.Response(200, json={
                "tag_name": f"v{self.versione}", "draft": False, "prerelease": False, "published_at": "2026-11-20T10:00:00Z",
                "html_url": f"https://github.com/ShakeMyMids/magic-hs/releases/tag/v{self.versione}",
                "assets": [{"name": f"MAGIC-HS-{self.versione}.zip", "size": 1, "browser_download_url": "https://example.invalid/x"},
                           {"name": nome, "size": len(self.pacchetto), "digest": self.digest,
                            "browser_download_url": f"https://github.com/ShakeMyMids/magic-hs/releases/download/v{self.versione}/{nome}"}]})
        if p.endswith("/" + nome):
            return httpx.Response(200, content=self.pacchetto)
        return httpx.Response(404)


def pacchetto(versione: str, interna: str = "", altri: dict[str, bytes | str] | None = None) -> bytes:
    """Pacchetto del programma per Windows (finto ma valido); interna = versione scritta dentro, altri = file in piu'."""
    b = io.BytesIO()
    with zipfile.ZipFile(b, "w") as z:
        z.writestr("python/pythonw.exe", b"MZ")
        z.writestr("python/Lib/site-packages/taric/__init__.py", f'"""MAGIC HS"""\n__version__ = "{interna or versione}"\n')
        z.writestr("Avvia MAGIC HS.cmd", "@echo off\r\n")
        for nome, contenuto in (altri or {}).items():
            z.writestr(nome, contenuto)
    return b.getvalue()


class PC:
    """Un PC con MAGIC HS: la cartella dell'utente (dati, programma), finti IA e GitHub. Il nome e' anche il nome utente
    di Windows. versioni = dati TARIC gia' installati; ia = servizio IA salvato come dalla pagina Impostazioni;
    avvio = cartella di «Avvia MAGIC HS.cmd»."""

    def __init__(self, tmp: Path, mp: pytest.MonkeyPatch, nome: str = "mrossi", versioni: tuple[str, ...] = (),
                 ia: dict[str, str] | None = None, extra: dict[str, str] | None = None, github: FintoGitHub | None = None,
                 avvio: Path | None = None):
        self.cartella = tmp / nome
        for v in versioni:                                    # dati gia' installati su questo PC prima dell'avvio
            dati_finti(self.cartella / "dati" / "taric" / "versioni", v)
            (self.cartella / "dati" / "taric" / "attiva.txt").write_text(v)
        self.cfg = carica({"TARIC_DATI": str(self.cartella / "dati"), "TARIC_PORTA": "8765", "TARIC_PROGRAMMI": str(self.cartella / "programma"),
                           **({"TARIC_AVVIO": str(avvio)} if avvio else {}), **(extra or {})})
        self.claude = FintoClaude()
        self.github = github or FintoGitHub()
        web = httpx.Client(transport=httpx.MockTransport(self.github), follow_redirects=True)
        with mp.context() as m:
            m.setenv("USERNAME", nome)
            self.app = crea_app(self.cfg, httpx.Client(transport=httpx.MockTransport(self.claude)), pianificatore=False,
                                chiave_ingresso=CHIAVE, istanza="prova", client_aggiornamenti=web, client_dati=web)
        self.attese: list[float] = []
        self.app.state.ia.attendi = self.attese.append          # i nuovi tentativi non aspettano davvero
        self.fermato = False

        def ferma() -> None:
            self.fermato = True
        self.app.state.ferma = ferma
        if ia is not None:
            r = self.entra().put("/api/admin/locale/ia", json=ia)
            assert r.status_code == 200, r.text

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
def ambiente(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> tuple[Path, pytest.MonkeyPatch]:
    monkeypatch.setenv("TARIC_CONFIG", str(tmp_path / "nessuno.env"))
    for k in ("ANTHROPIC_API_KEY", "GEMINI_API_KEY", "GOOGLE_API_KEY", "TARIC_IA_FORNITORE", "TARIC_IA_URL", "TARIC_IA_CHIAVE",
              "TARIC_IA_MODELLO", "TARIC_IA_MODELLO_RAPIDO", "TARIC_MODELLO", "TARIC_MODELLO_RAPIDO", "TARIC_DATI", "TARIC_AVVIO",
              "TARIC_PROGRAMMI", "TARIC_DATI_URL", "TARIC_AGGIORNAMENTI_URL", "TARIC_FONTE_URL"):
        monkeypatch.delenv(k, raising=False)
    return tmp_path, monkeypatch


@pytest.fixture
def pc(ambiente) -> PC:
    """Un PC con i dati di novembre 2026 e Claude come servizio IA."""
    tmp, mp = ambiente
    return PC(tmp, mp, versioni=("2026-11-01",), ia={"fornitore": "anthropic", "chiave": "chiave-di-prova"})
