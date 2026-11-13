"""Applicazione MAGIC HS sul PC (FastAPI): pagine, profilo, storico, preferiti, IA, dati TARIC e impostazioni.

La avvia programma.py su 127.0.0.1. C'e' un solo utente, che entra con la chiave dell'avvio (chiave_ingresso) e decide
tutto da se': servizio IA (chiave protetta da Windows, segreti.py), dati TARIC (pronti da GitHub o preparati qui,
dati.py), nuove versioni del programma (da GitHub, installate da sole: aggiornamenti.py).
"""
from __future__ import annotations

import hmac
import json
import logging
import os
import re
import secrets
import sqlite3
import threading
import time
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any, AsyncIterator, Literal, Optional

import httpx
from fastapi import Depends, FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.exceptions import RequestValidationError
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse, PlainTextResponse, RedirectResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from . import __version__
from . import sicurezza as S
from .aggiornamenti import Aggiornamenti, ErroreAggiornamento, piu_recente, segna_attuale
from .backup import Backup
from .config import Config
from .dati import GestoreDati
from .db import Database, iso
from .ia import ErroreIA, ServizioIA, mese_corrente
from .segreti import ia_della_vecchia_cartella, proteggi, svela

log = logging.getLogger("taric")
STATIC = Path(__file__).with_name("static")
EMAIL_LOCALE = "utente@magic-hs.locale"          # l'unico utente del programma sul PC
COOKIE = "magic_hs_locale"
RE_CODICE = re.compile(r"^\d{10}$")
RE_AREA = re.compile(r"^[A-Z0-9]{2,4}$")

CSP = ("default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; "
       "connect-src 'self'; manifest-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'; object-src 'none'")

MESSAGGI_IA = {
    "not_configured": "La classificazione assistita non è attiva: manca la chiave del servizio di intelligenza artificiale.",
    "quota_esaurita": "La classificazione assistita è spenta.",
    "rate_limited": "Troppe richieste in questo momento. Riprova tra un minuto.",
    "limite_giornaliero": "Il servizio di intelligenza artificiale ha raggiunto il suo limite di oggi (succede con i piani gratuiti). Riprova domani.",
    "overloaded": "Il servizio di intelligenza artificiale è sovraccarico. Riprova tra qualche minuto.",
    "credito_esaurito": "Il servizio di intelligenza artificiale richiede la fatturazione attiva o ha esaurito il credito: controlla nella console del servizio.",
    "regione_non_supportata": "Il servizio di intelligenza artificiale non è disponibile dal tuo paese senza fatturazione attiva.",
    "server_misconfigured": "MAGIC HS non riesce a usare il servizio di intelligenza artificiale: controlla chiave e modello in Impostazioni.",
    "refused": "L'IA non ha elaborato questa richiesta. Prova a descrivere la merce in un altro modo.",
    "empty_completion": "L'IA non ha restituito una risposta. Prova a riformulare la descrizione.",
    "invalid_json": "La risposta non era leggibile. Riprova.",
    "prompt_too_large": "La richiesta è troppo lunga. Accorcia la descrizione e riprova.",
    "upstream_timeout": "L'IA ha impiegato troppo tempo a rispondere. Riprova.",
    "upstream_error": "Errore temporaneo nel collegamento con il servizio di intelligenza artificiale. Riprova tra poco.",
    "bad_request": "Richiesta non valida.",
}


class Errore(HTTPException):
    def __init__(self, stato: int, messaggio: str, codice: str = ""):
        super().__init__(stato, messaggio)
        self.codice = codice


# ------------------------------------------------------------------ modelli delle richieste
class Profilo(BaseModel):
    nome: str = Field(min_length=2, max_length=100)
    azienda: str = Field(default="", max_length=150)


class Preferenze(BaseModel):
    paese: str = Field(default="", max_length=4)
    flusso: Literal["import", "export"] = "import"
    tema: Literal["auto", "chiaro", "scuro"] = "auto"


class VoceStorico(BaseModel):
    testo: str = Field(min_length=1, max_length=2000)
    codice: str = Field(default="", max_length=10)
    dati: dict[str, Any]


class Nota(BaseModel):
    nota: str = Field(default="", max_length=500)


class RichiestaIA(BaseModel):
    prompt: str = Field(min_length=1, max_length=400_000)          # parte che cambia: merce e risposte dell'utente
    contesto: str = Field(default="", max_length=400_000)          # parte uguale tra le richieste: va nella cache del fornitore
    livello: Literal["rapido", "standard"] = "standard"
    schema_risposta: Optional[Literal["voci", "scelta", "traduzione"]] = Field(default=None, alias="schema")
    operazione: str = Field(default="", max_length=40, pattern=r"^[A-Za-z0-9_-]*$")   # una classificazione = piu' richieste
    tipo: Literal["classifica", "traduzione"] = "classifica"


class Mese(BaseModel):
    mese: str = Field(default="", pattern=r"^(\d{4}-\d{2})?$")


class Versione(BaseModel):
    versione: str = Field(pattern=r"^\d{4}-\d{2}-01$")


class ImpostazioniIA(BaseModel):
    """Servizio IA scelto su questo PC (la chiave si salva protetta da Windows)."""
    fornitore: Literal["", "gemini", "anthropic", "openai"] = ""
    chiave: Optional[str] = Field(default=None, max_length=500)       # None = tiene quella salvata
    url: str = Field(default="", max_length=300)
    modello: str = Field(default="", max_length=120)
    modello_rapido: str = Field(default="", max_length=120)


class ChiaveIstanza(BaseModel):
    chiave: str = Field(max_length=200)


# ------------------------------------------------------------------ applicazione
def crea_app(cfg: Config, client_ia: httpx.Client | None = None, pianificatore: bool = True, chiave_ingresso: str = "",
             istanza: str = "", client_aggiornamenti: httpx.Client | None = None, client_dati: httpx.Client | None = None) -> FastAPI:
    """Crea l'applicazione del PC (vedi programma.py): un solo utente, che entra con la chiave dell'avvio (chiave_ingresso)."""
    db = Database(cfg.dati / "taric.db")
    ia = ServizioIA(cfg, db, client_ia)
    dati = GestoreDati(cfg, db, client_dati)
    copie = Backup(cfg.dati, cfg.backup_copie)
    agg = Aggiornamenti(cfg.aggiornamenti_url, client_aggiornamenti)
    programma: dict[str, str] = {"pronta": "", "errore": ""}      # versione nuova gia' installata per il prossimo avvio
    installazione = threading.Lock()                               # pianificatore e pagina Impostazioni non installano insieme

    # ------------------------------------------------------------------ servizio IA di questo PC
    def ia_salvata() -> dict[str, Any]:
        with db.connessione() as c:
            v = db.impostazioni(c)["ia"]
        return v if isinstance(v, dict) else {}

    def applica_ia() -> None:
        """Usa il servizio IA salvato su questo PC (finche' non se ne salva uno restano le variabili TARIC_*, per le prove)."""
        v = ia_salvata()
        if not v.get("impostato"):
            return
        cfg.imposta_ia({"TARIC_IA_FORNITORE": v.get("fornitore") or "nessuno", "TARIC_IA_CHIAVE": svela(str(v.get("chiave") or ""), cfg.dati),
                        "TARIC_IA_URL": v.get("url") or "", "TARIC_IA_MODELLO": v.get("modello") or "",
                        "TARIC_IA_MODELLO_RAPIDO": v.get("modello_rapido") or ""})

    def salva_ia(fornitore: str, chiave: str, url: str, modello: str, modello_rapido: str, autore: str) -> None:
        valore = {"fornitore": fornitore, "chiave": proteggi(chiave, cfg.dati) if fornitore else "", "url": url if fornitore else "",
                  "modello": modello if fornitore else "", "modello_rapido": modello_rapido if fornitore else "",
                  "impostato": True, "aggiornate": iso(), "da": autore}
        with db.transazione() as c:
            db.salva_impostazioni(c, {"ia": valore})
        applica_ia()

    def importa_vecchia_cartella() -> None:
        """Una volta sola: il servizio IA scelto nella vecchia cartella condivisa (versioni fino alla 1.2) diventa quello del PC."""
        if ia_salvata().get("impostato") or cfg.avvio is None:
            return
        v = ia_della_vecchia_cartella(cfg.avvio)
        if v is None:
            return
        salva_ia(v["fornitore"], v["chiave"], v["url"], v["modello"], v["modello_rapido"], "cartella condivisa")
        with db.transazione() as c:
            db.evento(c, "impostazioni_ia", dettagli=f"{v['fornitore']}: importato dalla cartella condivisa")
        log.info("servizio IA importato dalla vecchia cartella condivisa")

    # ------------------------------------------------------------------ nuove versioni del programma (da GitHub)
    def aggiorna_programma(forza: bool = False) -> dict[str, Any]:
        """Se su GitHub c'e' una versione piu' recente, la installa per il prossimo avvio (al massimo un controllo ogni sei ore)."""
        if cfg.programmi is None:
            return {"errore": "aggiornamenti spenti"}
        info = agg.ultima(forza)
        v = info.get("versione", "")
        if not v or not piu_recente(v, __version__) or programma["pronta"] == v:
            return info
        with installazione:
            if programma["pronta"] == v:
                return info
            try:
                if (cfg.programmi / v / "python" / "pythonw.exe").is_file():      # gia' scaricata in un avvio precedente
                    segna_attuale(cfg.programmi, v)
                    programma["pronta"] = v
                else:
                    programma["pronta"] = agg.installa(info, cfg.programmi, dati.lavoro)
                    with db.transazione() as c:
                        db.evento(c, "programma_pubblicato", dettagli=f"{v} da GitHub, pronta per il prossimo avvio")
                programma["errore"] = ""
            except (ErroreAggiornamento, OSError) as e:
                programma["errore"] = str(e)
                log.warning("aggiornamento del programma non riuscito: %s", e)
        return info

    with db.transazione() as c:
        nome = (os.environ.get("USERNAME") or os.environ.get("USER") or "").strip()[:100]
        c.execute("INSERT INTO utenti(email, nome, ruolo, stato, email_confermata, creato, aggiornato) "
                  "VALUES (?, ?, 'amministratore', 'attivo', 1, ?, ?) ON CONFLICT(email) DO UPDATE SET stato = 'attivo', ruolo = 'amministratore', quota_ia = NULL",
                  (EMAIL_LOCALE, nome if len(nome) >= 2 else "Utente", iso(), iso()))
    importa_vecchia_cartella()
    applica_ia()

    @asynccontextmanager
    async def vita(_app: FastAPI) -> AsyncIterator[None]:
        if pianificatore:
            dati.avvia_pianificatore(copie, ogni_ciclo=[aggiorna_programma], attesa=600)
        yield
        dati.ferma()

    app = FastAPI(title="MAGIC HS", docs_url=None, redoc_url=None, openapi_url=None, lifespan=vita)
    app.state.cfg, app.state.db, app.state.dati, app.state.ia = cfg, db, dati, ia
    app.state.aggiorna_programma = aggiorna_programma
    app.state.ultimo_contatto = time.monotonic()      # il programma si chiude da solo dopo un periodo senza richieste
    app.state.ferma = lambda: None                    # lo imposta programma.py

    # ------------------------------------------------------------------ utilita'
    def utente_corrente(request: Request) -> sqlite3.Row | None:
        with db.connessione() as c:
            return S.utente_da_sessione(c, request.cookies.get(COOKIE))

    def richiede_utente(request: Request) -> sqlite3.Row:
        u = utente_corrente(request)
        if u is None:
            raise Errore(401, "Sessione scaduta: riapri MAGIC HS dal suo collegamento.", "non_autenticato")
        return u

    def richiede_admin(u: sqlite3.Row = Depends(richiede_utente)) -> sqlite3.Row:
        if u["ruolo"] != "amministratore":
            raise Errore(403, "Funzione non disponibile.", "vietato")
        return u

    def json_ok(**kw: Any) -> dict[str, Any]:
        return {"ok": True, **kw}

    # ------------------------------------------------------------------ middleware: intestazioni di sicurezza e CSRF
    host_locali = {f"127.0.0.1:{cfg.porta}", f"localhost:{cfg.porta}"}

    @app.middleware("http")
    async def protezioni(request: Request, call_next: Any) -> Response:
        # solo dal PC stesso e con il suo indirizzo (contro i siti che puntano a 127.0.0.1 con un altro nome)
        if request.headers.get("host", "") not in host_locali:
            return PlainTextResponse("Richiesta non consentita.", status_code=403)
        app.state.ultimo_contatto = time.monotonic()
        if request.url.path.startswith("/api/") and request.method not in ("GET", "HEAD", "OPTIONS"):
            origine = request.headers.get("origin")
            atteso = f"{request.url.scheme}://{request.url.netloc}"
            if request.headers.get("x-taric") != "1" or (origine and origine != atteso):
                return JSONResponse({"errore": "Richiesta non consentita.", "codice": "csrf"}, status_code=403)
            if request.headers.get("sec-fetch-site") not in (None, "same-origin", "none"):
                return JSONResponse({"errore": "Richiesta non consentita.", "codice": "csrf"}, status_code=403)
        resp: Response = await call_next(request)
        resp.headers.setdefault("Content-Security-Policy", CSP)
        resp.headers["X-Content-Type-Options"] = "nosniff"
        resp.headers["Referrer-Policy"] = "same-origin"
        resp.headers["X-Frame-Options"] = "DENY"
        resp.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=(), payment=()"
        resp.headers["Cross-Origin-Opener-Policy"] = "same-origin"
        if request.url.path.startswith("/api/"):
            resp.headers["Cache-Control"] = "no-store"
        return resp

    @app.exception_handler(Errore)
    async def _errore(request: Request, e: Errore) -> JSONResponse:
        return JSONResponse({"errore": e.detail, "codice": e.codice}, status_code=e.status_code)

    @app.exception_handler(RequestValidationError)
    async def _validazione(request: Request, e: RequestValidationError) -> JSONResponse:
        campi = sorted({str(x.get("loc", ["", ""])[-1]) for x in e.errors()})
        return JSONResponse({"errore": "Dati non validi: controlla " + ", ".join(campi) + ".", "codice": "dati_non_validi"}, status_code=422)

    # ------------------------------------------------------------------ pagine
    def pagina(nome: str) -> FileResponse:
        return FileResponse(STATIC / nome, media_type="text/html", headers={"Cache-Control": "no-cache"})

    @app.get("/", include_in_schema=False)
    def home(request: Request) -> Response:
        if utente_corrente(request) is None:
            return pagina("locale.html")
        v = dati.attiva()
        if v is None:
            return pagina("attesa.html")
        html = (STATIC / "index.html").read_text(encoding="utf-8").replace("{{DATI}}", f"/data/{v}/")
        return HTMLResponse(html, headers={"Cache-Control": "no-cache"})

    @app.get("/manifest.webmanifest", include_in_schema=False)
    def manifest() -> FileResponse:
        return FileResponse(STATIC / "manifest.webmanifest", media_type="application/manifest+json")

    @app.get("/data/{versione}/{percorso:path}", include_in_schema=False)
    def file_dati(versione: str, percorso: str, request: Request) -> Response:
        if utente_corrente(request) is None:
            return PlainTextResponse("Accesso richiesto.", status_code=401)
        f = dati.file(versione, percorso)
        if f is None:
            return PlainTextResponse("Non trovato.", status_code=404)
        tipo = "text/javascript" if f.suffix == ".js" else ("application/json" if f.suffix == ".json" else "text/plain")
        return FileResponse(f, media_type=tipo, headers={"Cache-Control": "private, max-age=31536000, immutable"})

    app.mount("/static", StaticFiles(directory=STATIC), name="static")

    # ------------------------------------------------------------------ stato (pagina d'attesa dei dati)
    @app.get("/api/stato")
    def stato() -> dict[str, Any]:
        return {"dati_pronti": dati.attiva() is not None, "aggiornamento": (dati.in_corso or {}).get("fase")}

    # ------------------------------------------------------------------ ingresso e chiusura
    @app.get("/entra", include_in_schema=False)
    def entra(request: Request, k: str = "") -> Response:
        """Indirizzo aperto dall'avvio nel browser: la chiave e' nel file dell'istanza, leggibile solo dall'utente di Windows."""
        if not chiave_ingresso or not hmac.compare_digest(k.encode(), chiave_ingresso.encode()):
            return pagina("locale.html")
        resp = RedirectResponse("/", 303)
        if utente_corrente(request) is None:
            with db.transazione() as c:
                uid = c.execute("SELECT id FROM utenti WHERE email = ?", (EMAIL_LOCALE,)).fetchone()["id"]
                gettone, durata = S.crea_sessione(c, uid, request.headers.get("user-agent", ""))
            resp.set_cookie(COOKIE, gettone, max_age=durata, httponly=True, samesite="lax", path="/")
        return resp

    @app.get("/api/locale/ping")
    def locale_ping() -> dict[str, Any]:
        return {"app": "magic-hs", "istanza": istanza, "versione": __version__}

    @app.post("/api/locale/ferma")
    def locale_ferma(body: ChiaveIstanza) -> dict[str, Any]:
        """Chiamata da un avvio di una versione diversa del programma, che prende il posto di questa."""
        if not chiave_ingresso or not hmac.compare_digest(body.chiave.encode(), chiave_ingresso.encode()):
            raise Errore(403, "Chiave non valida.", "vietato")
        app.state.ferma()
        return json_ok()

    @app.post("/api/locale/chiudi")
    def locale_chiudi(u: sqlite3.Row = Depends(richiede_utente)) -> dict[str, Any]:
        app.state.ferma()
        return json_ok()

    # ------------------------------------------------------------------ profilo
    def descrivi_utente(c: sqlite3.Connection, u: sqlite3.Row) -> dict[str, Any]:
        lim = ia.limite(c, u)
        try:
            pref = json.loads(u["preferenze"] or "{}")
        except ValueError:
            pref = {}
        return {"id": u["id"], "nome": u["nome"], "azienda": u["azienda"], "ruolo": u["ruolo"],
                "preferenze": {"paese": pref.get("paese", ""), "flusso": pref.get("flusso", "import"), "tema": pref.get("tema", "auto")},
                "ia": {"disponibile": ia.disponibile and lim != 0, "configurata": ia.disponibile, "nome": cfg.ia_nome, "limite": lim,
                       "usate": ia.usate(c, u["id"]), "mese": mese_corrente()},
                "dati": {"versione": dati.attiva(), "aggiornamento": (dati.in_corso or {}).get("fase")},
                "programma": {"versione": __version__, "pronta": programma["pronta"]}}

    @app.get("/api/io")
    def io(u: sqlite3.Row = Depends(richiede_utente)) -> dict[str, Any]:
        with db.connessione() as c:
            return descrivi_utente(c, u)

    @app.put("/api/io")
    def modifica_io(body: Profilo, u: sqlite3.Row = Depends(richiede_utente)) -> dict[str, Any]:
        with db.transazione() as c:
            c.execute("UPDATE utenti SET nome = ?, azienda = ?, aggiornato = ? WHERE id = ?", (body.nome.strip(), body.azienda.strip(), iso(), u["id"]))
        return json_ok()

    @app.put("/api/io/preferenze")
    def preferenze(body: Preferenze, u: sqlite3.Row = Depends(richiede_utente)) -> dict[str, Any]:
        paese = body.paese.strip().upper()
        if paese and not RE_AREA.match(paese):
            raise Errore(422, "Paese non valido.", "paese")
        with db.transazione() as c:
            c.execute("UPDATE utenti SET preferenze = ? WHERE id = ?",
                      (json.dumps({"paese": paese, "flusso": body.flusso, "tema": body.tema}), u["id"]))
        return json_ok()

    # ------------------------------------------------------------------ storico
    @app.get("/api/storico")
    def storico(limite: int = 50, prima: int = 0, u: sqlite3.Row = Depends(richiede_utente)) -> dict[str, Any]:
        limite = max(1, min(limite, 100))
        with db.connessione() as c:
            righe = c.execute("SELECT id, quando, testo, codice FROM storico WHERE utente_id = ? AND (? = 0 OR id < ?) ORDER BY id DESC LIMIT ?",
                              (u["id"], prima, prima, limite)).fetchall()
            totale = c.execute("SELECT COUNT(*) FROM storico WHERE utente_id = ?", (u["id"],)).fetchone()[0]
        return {"voci": [dict(r) for r in righe], "totale": totale}

    @app.get("/api/storico/{sid}")
    def voce_storico(sid: int, u: sqlite3.Row = Depends(richiede_utente)) -> dict[str, Any]:
        with db.connessione() as c:
            r = c.execute("SELECT * FROM storico WHERE id = ? AND utente_id = ?", (sid, u["id"])).fetchone()
        if r is None:
            raise Errore(404, "Classificazione non trovata.", "non_trovato")
        return {"id": r["id"], "quando": r["quando"], "testo": r["testo"], "codice": r["codice"], "dati": json.loads(r["dati"])}

    @app.post("/api/storico")
    def salva_storico(body: VoceStorico, u: sqlite3.Row = Depends(richiede_utente)) -> dict[str, Any]:
        if body.codice and not RE_CODICE.match(body.codice):
            raise Errore(422, "Codice non valido.", "codice")
        testo_dati = json.dumps(body.dati, ensure_ascii=False)
        if len(testo_dati) > 200_000:
            raise Errore(413, "Classificazione troppo grande da salvare.", "troppo_grande")
        with db.transazione() as c:
            sid = c.execute("INSERT INTO storico(utente_id, quando, testo, codice, dati) VALUES (?, ?, ?, ?, ?)",
                            (u["id"], iso(), body.testo.strip(), body.codice, testo_dati)).lastrowid
            c.execute("DELETE FROM storico WHERE utente_id = ? AND id NOT IN (SELECT id FROM storico WHERE utente_id = ? ORDER BY id DESC LIMIT 500)",
                      (u["id"], u["id"]))
        return json_ok(id=sid)

    @app.delete("/api/storico/{sid}")
    def cancella_voce(sid: int, u: sqlite3.Row = Depends(richiede_utente)) -> dict[str, Any]:
        with db.transazione() as c:
            c.execute("DELETE FROM storico WHERE id = ? AND utente_id = ?", (sid, u["id"]))
        return json_ok()

    @app.delete("/api/storico")
    def svuota_storico(u: sqlite3.Row = Depends(richiede_utente)) -> dict[str, Any]:
        with db.transazione() as c:
            n = c.execute("DELETE FROM storico WHERE utente_id = ?", (u["id"],)).rowcount
        return json_ok(eliminate=n)

    # ------------------------------------------------------------------ preferiti
    @app.get("/api/preferiti")
    def preferiti(u: sqlite3.Row = Depends(richiede_utente)) -> dict[str, Any]:
        with db.connessione() as c:
            righe = c.execute("SELECT codice, nota, quando FROM preferiti WHERE utente_id = ? ORDER BY quando DESC", (u["id"],)).fetchall()
        return {"voci": [dict(r) for r in righe]}

    @app.put("/api/preferiti/{codice}")
    def salva_preferito(codice: str, body: Nota, u: sqlite3.Row = Depends(richiede_utente)) -> dict[str, Any]:
        if not RE_CODICE.match(codice):
            raise Errore(422, "Codice non valido.", "codice")
        with db.transazione() as c:
            if c.execute("SELECT COUNT(*) FROM preferiti WHERE utente_id = ?", (u["id"],)).fetchone()[0] >= 1000:
                raise Errore(409, "Hai già 1000 preferiti: eliminane qualcuno.", "troppi")
            c.execute("INSERT INTO preferiti(utente_id, codice, nota, quando) VALUES (?, ?, ?, ?) "
                      "ON CONFLICT(utente_id, codice) DO UPDATE SET nota = excluded.nota", (u["id"], codice, body.nota.strip(), iso()))
        return json_ok()

    @app.delete("/api/preferiti/{codice}")
    def cancella_preferito(codice: str, u: sqlite3.Row = Depends(richiede_utente)) -> dict[str, Any]:
        with db.transazione() as c:
            c.execute("DELETE FROM preferiti WHERE utente_id = ? AND codice = ?", (u["id"], codice))
        return json_ok()

    # ------------------------------------------------------------------ IA
    @app.post("/api/ia")
    def chiedi_ia(body: RichiestaIA, u: sqlite3.Row = Depends(richiede_utente)) -> Response:
        try:
            return JSONResponse(ia.chiedi(u, body.prompt, body.livello, contesto=body.contesto, schema=body.schema_risposta,
                                          operazione=body.operazione, tipo=body.tipo))
        except ErroreIA as e:
            return JSONResponse({"errore": MESSAGGI_IA.get(e.codice, MESSAGGI_IA["upstream_error"]), "codice": e.codice}, status_code=e.stato_http)

    # ------------------------------------------------------------------ impostazioni del PC
    @app.get("/api/admin/riepilogo")
    def admin_riepilogo(a: sqlite3.Row = Depends(richiede_admin)) -> dict[str, Any]:
        return {"ia": ia.disponibile, "ia_nome": cfg.ia_nome, "dati": dati.attiva(), "aggiornamento": dati.in_corso}

    @app.get("/api/admin/eventi")
    def admin_eventi(limite: int = 200, a: sqlite3.Row = Depends(richiede_admin)) -> dict[str, Any]:
        with db.connessione() as c:
            righe = c.execute("SELECT e.*, x.nome AS autore_nome FROM eventi e LEFT JOIN utenti x ON x.id = e.autore_id "
                              "ORDER BY e.id DESC LIMIT ?", (max(1, min(limite, 1000)),)).fetchall()
        return {"eventi": [dict(r) for r in righe]}

    @app.get("/api/admin/dati")
    def admin_dati(a: sqlite3.Row = Depends(richiede_admin)) -> dict[str, Any]:
        return {"attiva": dati.attiva(), "versioni": dati.elenco(), "in_corso": dati.in_corso, "ultimi": dati.ultimi(),
                "automatico": cfg.aggiornamento_automatico, "fonte": cfg.fonte_url, "prossimo": dati.da_fare()}

    @app.get("/api/admin/dati/registro/{agg_id}")
    def admin_registro(agg_id: int, a: sqlite3.Row = Depends(richiede_admin)) -> PlainTextResponse:
        return PlainTextResponse(dati.registro(agg_id))

    @app.get("/api/admin/dati/riepilogo/{versione}")
    def admin_riepilogo_versione(versione: str, a: sqlite3.Row = Depends(richiede_admin)) -> PlainTextResponse:
        f = dati.file(versione, "riepilogo.txt")
        return PlainTextResponse(f.read_text(encoding="utf-8") if f else "Riepilogo non disponibile.")

    def mese_richiesto(m: str) -> str:
        return m or dati._ora_locale().strftime("%Y-%m")

    @app.post("/api/admin/dati/aggiorna")
    def admin_aggiorna(body: Mese, a: sqlite3.Row = Depends(richiede_admin)) -> dict[str, Any]:
        mese = mese_richiesto(body.mese)
        if not dati.avvia(mese, "manuale", autore_id=a["id"]):
            raise Errore(409, "C'è già un aggiornamento in corso.", "in_corso")
        return json_ok(mese=mese)

    @app.post("/api/admin/dati/carica")
    async def admin_carica(file: UploadFile = File(...), mese: str = Form(""), a: sqlite3.Row = Depends(richiede_admin)) -> dict[str, Any]:
        if mese and not re.match(r"^\d{4}-\d{2}$", mese):
            raise Errore(422, "Mese non valido (formato AAAA-MM).", "mese")
        mese = mese_richiesto(mese)
        dest = dati.lavoro / f"caricato-{secrets.token_hex(6)}.zip"
        totale = 0
        with open(dest, "wb") as f:
            while blocco := await file.read(1 << 20):
                totale += len(blocco)
                if totale > 300 * 1024 * 1024:
                    f.close()
                    dest.unlink(missing_ok=True)
                    raise Errore(413, "Archivio troppo grande (massimo 300 MB).", "troppo_grande")
                f.write(blocco)
        if not dati.avvia(mese, "caricamento", archivio=dest, autore_id=a["id"]):
            raise Errore(409, "C'è già un aggiornamento in corso.", "in_corso")
        return json_ok(mese=mese)

    @app.post("/api/admin/dati/attiva")
    def admin_attiva(body: Versione, a: sqlite3.Row = Depends(richiede_admin)) -> dict[str, Any]:
        try:
            dati.imposta_attiva(body.versione)
        except ValueError:
            raise Errore(404, "Versione non disponibile.", "non_trovato")
        with db.transazione() as c:
            db.evento(c, "dati_versione_attivata", autore_id=a["id"], dettagli=body.versione)
        return json_ok()

    @app.get("/api/admin/locale")
    def admin_locale(a: sqlite3.Row = Depends(richiede_admin)) -> dict[str, Any]:
        v = ia_salvata()
        chiave = svela(str(v.get("chiave") or ""), cfg.dati)
        with db.connessione() as c:
            uso = {**ia.uso_mese(c), "mese": mese_corrente()}
        return {"ia": {"fornitore": str(v.get("fornitore") or ""), "url": str(v.get("url") or ""), "modello": str(v.get("modello") or ""),
                       "modello_rapido": str(v.get("modello_rapido") or ""),
                       "chiave": ("…" + chiave[-4:]) if len(chiave) > 8 else ("impostata" if chiave else ""),
                       "chiave_illeggibile": bool(v.get("chiave")) and not chiave},
                "attiva": ia.disponibile, "ia_nome": cfg.ia_nome, "fornitore_attivo": cfg.ia_fornitore,
                "modelli_in_uso": {"rapido": cfg.modello_rapido, "principale": cfg.modello} if ia.disponibile else None,
                "uso": uso, "aggiornate": v.get("aggiornate", ""),
                "programma": {"in_uso": __version__, "pronta": programma["pronta"], "errore": programma["errore"]}}

    @app.put("/api/admin/locale/ia")
    def admin_locale_ia(body: ImpostazioniIA, a: sqlite3.Row = Depends(richiede_admin)) -> dict[str, Any]:
        chiave = svela(str(ia_salvata().get("chiave") or ""), cfg.dati) if body.chiave is None else body.chiave.strip()
        url = body.url.strip().rstrip("/")
        if url and not re.match(r"^https?://[^\s/]+(/\S*)?$", url):
            raise Errore(422, "Indirizzo del servizio non valido: deve iniziare con https://.", "url")
        if body.fornitore == "openai" and not url:
            raise Errore(422, "Indica l'indirizzo del servizio (per Azure OpenAI: https://<risorsa>.openai.azure.com/openai/v1).", "url")
        if body.fornitore == "openai" and not body.modello.strip():
            raise Errore(422, "Indica il modello (per Azure OpenAI: il nome della distribuzione).", "modello")
        if body.fornitore in ("gemini", "anthropic") and not chiave:
            raise Errore(422, "Inserisci la chiave del servizio.", "chiave")
        try:
            salva_ia(body.fornitore, chiave, url, body.modello.strip(), body.modello_rapido.strip(), a["nome"])
        except OSError as e:
            raise Errore(500, f"Non riesco a proteggere la chiave su questo PC: {e}", "chiave")
        with db.transazione() as c:
            db.evento(c, "impostazioni_ia", autore_id=a["id"], dettagli=body.fornitore or "nessuna")
        return json_ok(attiva=ia.disponibile, ia_nome=cfg.ia_nome)

    @app.post("/api/admin/locale/ia/modelli")
    def admin_locale_modelli(a: sqlite3.Row = Depends(richiede_admin)) -> dict[str, Any]:
        """Modelli offerti dal servizio salvato (suggerimenti per i campi «Modello»)."""
        try:
            return json_ok(modelli=ia.modelli())
        except ErroreIA as e:
            raise Errore(e.stato_http, "Non riesco a leggere l'elenco dei modelli: controlla chiave e indirizzo, oppure scrivi il nome a mano.", e.codice)

    @app.post("/api/admin/locale/ia/prova")
    def admin_locale_prova(a: sqlite3.Row = Depends(richiede_admin)) -> dict[str, Any]:
        try:
            return json_ok(**ia.prova())
        except ErroreIA as e:
            messaggio = {
                "not_configured": "Nessun servizio IA impostato: scegline uno e salva.",
                "server_misconfigured": "Il servizio rifiuta la chiave o non trova il modello: controlla chiave, indirizzo e nome del modello.",
                "upstream_error": "Non riesco a raggiungere il servizio: controlla l'indirizzo e, se in azienda c'è un proxy, chiedi all'IT.",
            }.get(e.codice) or MESSAGGI_IA.get(e.codice, MESSAGGI_IA["upstream_error"])
            raise Errore(e.stato_http, messaggio, e.codice)

    @app.get("/api/admin/locale/aggiornamento")
    def admin_aggiornamento(forza: bool = False, a: sqlite3.Row = Depends(richiede_admin)) -> dict[str, Any]:
        """Ultima versione su GitHub; se e' piu' recente la installa per il prossimo avvio."""
        info = aggiorna_programma(forza)
        return {"in_uso": __version__, "ultima": info.get("versione", ""), "data": info.get("data", ""), "pagina": info.get("pagina", ""),
                "pronta": programma["pronta"], "errore": programma["errore"] or info.get("errore", "")}

    return app


__all__ = ["crea_app", "EMAIL_LOCALE"]
