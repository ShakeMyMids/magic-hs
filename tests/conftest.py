"""Strumenti comuni dei test: finti servizi esterni (IA e GitHub) e il sito MAGIC HS come su Render."""
from __future__ import annotations

import hashlib
import io
import json
import zipfile
from pathlib import Path

import httpx
import pytest
from fastapi.testclient import TestClient

from taric import sicurezza as S
from taric.app import crea_app
from taric.config import carica


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
    """Finta GitHub: pagina «dati» con i dati pronti dei mesi (dati={"AAAA-MM": archivio}) ed estrazioni della fonte
    (fonte={"AAAA-MM": archivio}). Quello che manca risponde 404 (con errore=... tutto risponde con quell'errore): i test
    non si collegano mai a GitHub o alla fonte vera."""

    def __init__(self, errore: int = 0, dati: dict[str, bytes] | None = None, digest_dati: dict[str, str] | None = None,
                 fonte: dict[str, bytes] | None = None):
        self.errore = errore
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
        return httpx.Response(404)


@pytest.fixture
def ambiente(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> tuple[Path, pytest.MonkeyPatch]:
    monkeypatch.setenv("TARIC_CONFIG", str(tmp_path / "nessuno.env"))
    for k in ("ANTHROPIC_API_KEY", "GEMINI_API_KEY", "GOOGLE_API_KEY", "TARIC_IA_FORNITORE", "TARIC_IA_URL", "TARIC_IA_CHIAVE",
              "TARIC_IA_MODELLO", "TARIC_IA_MODELLO_RAPIDO", "TARIC_MODELLO", "TARIC_MODELLO_RAPIDO", "TARIC_DATI",
              "TARIC_DATI_URL", "TARIC_FONTE_URL", "TARIC_SCARICA_DATI",
              "MAGIC_HS_AMMINISTRATORI", "MAGIC_HS_INDIRIZZO", "RENDER_EXTERNAL_URL"):
        monkeypatch.delenv(k, raising=False)
    return tmp_path, monkeypatch


INDIRIZZO = "https://magic-hs.onrender.com"
CAPO = "capo@azienda.it"


class Sito:
    """Il sito come su Render, con finti IA e GitHub. L'amministratore e' CAPO (MAGIC_HS_AMMINISTRATORI); ia=True mette
    la chiave di Gemini nelle variabili del server (altri servizi: extra con TARIC_IA_*); versioni = dati TARIC gia'
    installati (novembre 2026); nome = cartella del servizio."""

    def __init__(self, tmp: Path, mp: pytest.MonkeyPatch, ia: bool = True, extra: dict[str, str] | None = None,
                 versioni: tuple[str, ...] = ("2026-11-01",), github: FintoGitHub | None = None, nome: str = "render"):
        self.cartella = tmp / nome
        for v in versioni:
            dati_finti(self.cartella / "dati" / "taric" / "versioni", v)
            (self.cartella / "dati" / "taric" / "attiva.txt").write_text(v)
        self.claude = FintoClaude()
        self.github = github or FintoGitHub()
        self.attese: list[float] = []
        originale = S.verifica_modulo          # nelle prove il modulo si invia subito (niente attesa minima contro i bot)
        mp.setattr(S, "verifica_modulo", lambda segreto, valore, minimo_s=3, massimo_s=7200: originale(segreto, valore, 0, massimo_s))
        self.extra = {"TARIC_DATI": str(self.cartella / "dati"), "MAGIC_HS_AMMINISTRATORI": CAPO,
                      "MAGIC_HS_INDIRIZZO": INDIRIZZO, **({"GEMINI_API_KEY": "chiave-gemini-server"} if ia else {}), **(extra or {})}
        self.mp = mp
        self.riavvia()

    def riavvia(self, **extra: str) -> None:
        """Come un nuovo avvio del servizio (per esempio dopo aver cambiato le variabili su Render)."""
        self.extra.update(extra)
        self.cfg = carica(self.extra)
        web = httpx.Client(transport=httpx.MockTransport(self.github), follow_redirects=True)
        self.app = crea_app(self.cfg, httpx.Client(transport=httpx.MockTransport(self.claude)), pianificatore=False, client_dati=web)
        self.app.state.ia.attendi = self.attese.append          # i nuovi tentativi non aspettano davvero

    def client(self, base: str = INDIRIZZO) -> TestClient:
        return TestClient(self.app, base_url=base, headers={"X-Taric": "1"})

    def modulo(self, c: TestClient) -> str:
        return c.get("/api/modulo").json()["modulo"]

    def registra(self, nome: str, email: str, password: str = "Porto-Container-42", **altro: str) -> tuple[TestClient, dict]:
        c = self.client()
        r = c.post("/api/registrazione", json={"nome": nome, "email": email, "password": password, "modulo": self.modulo(c), **altro})
        return c, {"stato_http": r.status_code, **r.json()}

    def accedi(self, email: str, password: str = "Porto-Container-42") -> TestClient:
        c = self.client()
        r = c.post("/api/accedi", json={"email": email, "password": password})
        assert r.status_code == 200, r.text
        return c

    def capo(self) -> TestClient:
        c, r = self.registra("Mario Capo", CAPO)
        assert r["stato"] == "attivo", r
        return c

    def collega(self, capo: TestClient, nome: str = "Luca Bianchi", email: str = "luca@azienda.it") -> TestClient:
        """Un collega registrato e approvato dall'amministratore, gia' entrato."""
        _, r = self.registra(nome, email)
        assert r["stato"] == "in_attesa", r
        uid = next(x["id"] for x in capo.get("/api/admin/utenti").json()["utenti"] if x["email"] == email)
        assert capo.post(f"/api/admin/utenti/{uid}/approva").status_code == 200
        return self.accedi(email)

    def id_di(self, capo: TestClient, email: str) -> int:
        return next(x["id"] for x in capo.get("/api/admin/utenti").json()["utenti"] if x["email"] == email)

    def attiva(self) -> str | None:
        return self.app.state.dati.attiva()


@pytest.fixture
def sito(ambiente) -> Sito:
    tmp, mp = ambiente
    return Sito(tmp, mp)


@pytest.fixture
def sito_claude(ambiente) -> Sito:
    """Il sito con Claude (ANTHROPIC_API_KEY) come servizio IA."""
    tmp, mp = ambiente
    return Sito(tmp, mp, ia=False, extra={"ANTHROPIC_API_KEY": "chiave-di-prova"})
