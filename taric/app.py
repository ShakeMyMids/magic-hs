"""Il sito MAGIC HS (FastAPI): pagine, account, profilo, storico, preferiti, IA, dati TARIC e gestione.

Si avvia con «python -m taric server» (su Render: render.yaml, Dockerfile). Account con email e password; chi si
registra resta in attesa finche' un amministratore non lo approva (gli indirizzi di MAGIC_HS_AMMINISTRATORI entrano
subito come amministratori). Un solo servizio IA, con la chiave nelle variabili d'ambiente del server (GEMINI_API_KEY),
un limite mensile di classificazioni per persona e un tetto mensile per tutti. Storico e preferiti sono nell'account.
"""
from __future__ import annotations

import hashlib
import json
import logging
import os
import re
import secrets
import sqlite3
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any, AsyncIterator, Literal, Optional

import httpx
from fastapi import Depends, FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.exceptions import RequestValidationError
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse, PlainTextResponse, RedirectResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from starlette.middleware.gzip import GZipMiddleware

from . import __version__
from . import sicurezza as S
from .backup import Backup, ErroreBackup
from .cambi import cambi
from .config import Config
from .dati import RE_VERSIONE, GestoreDati
from .db import Database, iso
from .ia import ErroreIA, ServizioIA, mese_corrente
from .ricerca import RE_PAROLA, piano, presente, testi_nomenclatura

log = logging.getLogger("taric")
STATIC = Path(__file__).with_name("static")
COOKIE = "magic_hs"
RE_CODICE = re.compile(r"^\d{10}$")
RE_STATICO = re.compile(r'(src|href)="/static/([A-Za-z0-9_./-]+)"')
RE_AREA = re.compile(r"^[A-Z0-9]{2,4}$")

CSP = ("default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; "
       "connect-src 'self'; manifest-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'; object-src 'none'")

MESSAGGI_IA = {
    "not_configured": "La classificazione assistita non è attiva: manca la chiave del servizio di intelligenza artificiale.",
    "quota_esaurita": "Hai usato tutte le classificazioni con l'IA di questo mese: per averne altre chiedi all'amministratore.",
    "tetto_raggiunto": "Questo mese le classificazioni con l'IA sono finite per tutti: chiedi all'amministratore.",
    "rate_limited": "Troppe richieste in questo momento. Riprova tra un minuto.",
    "limite_giornaliero": "Il servizio di intelligenza artificiale ha raggiunto il suo limite di oggi (succede con i piani gratuiti). Riprova domani.",
    "overloaded": "Il servizio di intelligenza artificiale è sovraccarico. Riprova tra qualche minuto.",
    "credito_esaurito": "Il servizio di intelligenza artificiale richiede la fatturazione attiva o ha esaurito il credito: controlla nella console del servizio.",
    "regione_non_supportata": "Il servizio di intelligenza artificiale non è disponibile dal tuo paese senza fatturazione attiva.",
    "server_misconfigured": "MAGIC HS non riesce a usare il servizio di intelligenza artificiale: avvisa l'amministratore.",
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
    condividi: Optional[bool] = None            # classificazioni nell'archivio aziendale (None = lascia com'e')


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


# ricerca per parole: parole senza risultati e sinonimi aggiunti dall'amministratore
class RicercaVuota(BaseModel):
    testo: str = Field(min_length=1, max_length=200)


class Sinonimo(BaseModel):
    termini: list[str] = Field(min_length=1, max_length=6)


# account, accesso e gestione degli utenti
class Iscrizione(BaseModel):
    nome: str = Field(min_length=2, max_length=100)
    azienda: str = Field(default="", max_length=150)
    email: str = Field(max_length=254)
    password: str = Field(max_length=200)
    richiesta: str = Field(default="", max_length=1000)          # messaggio per l'amministratore
    sito_web: str = Field(default="", max_length=200)            # trappola per i bot: deve restare vuoto
    modulo: str = Field(max_length=100)


class Accesso(BaseModel):
    email: str = Field(max_length=254)
    password: str = Field(max_length=200)
    ricordami: bool = True


class CambioPassword(BaseModel):
    attuale: str = Field(max_length=200)
    nuova: str = Field(max_length=200)


class NuovaPassword(BaseModel):
    gettone: str = Field(max_length=100)
    password: str = Field(max_length=200)


class ModificaUtente(BaseModel):
    nome: Optional[str] = Field(default=None, min_length=2, max_length=100)
    azienda: Optional[str] = Field(default=None, max_length=150)
    ruolo: Optional[Literal["utente", "amministratore"]] = None
    quota_ia: Optional[int] = Field(default=None, ge=0, le=100000)     # None (inviato) = limite predefinito


class Motivo(BaseModel):
    motivo: str = Field(default="", max_length=500)


class ImpostazioniSito(BaseModel):
    quota_predefinita: Optional[int] = Field(default=None, ge=0, le=100000)
    tetto_mese: Optional[int] = Field(default=None, ge=0, le=10_000_000)
    registrazione_aperta: Optional[bool] = None


def segreto_moduli(cartella: Path) -> bytes:
    """Segreto per firmare il modulo di registrazione, salvato nella cartella dei dati (sul disco del server)."""
    f = cartella / "segreto-moduli.key"
    if not f.exists():
        f.write_text(secrets.token_hex(32), encoding="utf-8")
        try:
            f.chmod(0o600)
        except OSError:
            pass
    return f.read_text(encoding="utf-8").strip().encode()


# ------------------------------------------------------------------ applicazione
def crea_app(cfg: Config, client_ia: httpx.Client | None = None, pianificatore: bool = True,
             client_dati: httpx.Client | None = None) -> FastAPI:
    """Crea il sito: client_ia e client_dati sostituiscono, nelle prove, i servizi esterni."""
    try:                                   # backup preparato a sito acceso con «python -m taric ripristina»
        rimesso = Backup(cfg.dati).applica_in_attesa()
        if rimesso:
            log.warning("database ripristinato all'avvio: %s", rimesso)
    except ErroreBackup as e:
        log.error("ripristino all'avvio non riuscito: %s", e)
    db = Database(cfg.dati / "taric.db")
    ia = ServizioIA(cfg, db, client_ia)
    dati = GestoreDati(cfg, db, client_dati)
    copie = Backup(cfg.dati, cfg.backup_copie)

    segreto = segreto_moduli(cfg.dati)
    with db.transazione() as c:       # gli indirizzi di MAGIC_HS_AMMINISTRATORI sono sempre amministratori attivi
        for email in sorted(cfg.amministratori):
            c.execute("UPDATE utenti SET ruolo = 'amministratore', stato = 'attivo' WHERE email = ? AND hash_password IS NOT NULL", (email,))
    if not cfg.amministratori:
        log.warning("nessun amministratore: indica la tua email in MAGIC_HS_AMMINISTRATORI e registrati")

    @asynccontextmanager
    async def vita(_app: FastAPI) -> AsyncIterator[None]:
        pid = cfg.dati / "server.pid"           # per «python -m taric ripristina»: il sito e' acceso
        pid.write_text(str(os.getpid()))
        if pianificatore:
            dati.avvia_pianificatore(copie, attesa=600)
        yield
        dati.ferma()
        pid.unlink(missing_ok=True)

    app = FastAPI(title="MAGIC HS", docs_url=None, redoc_url=None, openapi_url=None, lifespan=vita)
    app.state.cfg, app.state.db, app.state.dati, app.state.ia = cfg, db, dati, ia
    # file compressi (la nomenclatura del mese pesa circa 2 MB, compressa un quarto)
    app.add_middleware(GZipMiddleware, minimum_size=1000, compresslevel=6)

    # ------------------------------------------------------------------ utilita'
    def utente_corrente(request: Request) -> sqlite3.Row | None:
        with db.connessione() as c:
            return S.utente_da_sessione(c, request.cookies.get(COOKIE))

    def richiede_utente(request: Request) -> sqlite3.Row:
        u = utente_corrente(request)
        if u is None:
            raise Errore(401, "Sessione scaduta: accedi di nuovo.", "non_autenticato")
        return u

    def richiede_admin(u: sqlite3.Row = Depends(richiede_utente)) -> sqlite3.Row:
        if u["ruolo"] != "amministratore":
            raise Errore(403, "Funzione riservata all'amministratore.", "vietato")
        return u

    def ip(request: Request) -> str:
        return (request.client.host if request.client else "")[:64]

    def base_url(request: Request) -> str:
        return cfg.indirizzo or str(request.base_url).rstrip("/")

    def imposta_cookie(resp: Response, request: Request, gettone: str, durata: int, ricordami: bool = True) -> None:
        resp.set_cookie(COOKIE, gettone, max_age=durata if ricordami else None, httponly=True,
                        secure=request.url.scheme == "https", samesite="lax", path="/")

    def json_ok(**kw: Any) -> dict[str, Any]:
        return {"ok": True, **kw}

    # ------------------------------------------------------------------ middleware: intestazioni di sicurezza e CSRF
    @app.middleware("http")
    async def protezioni(request: Request, call_next: Any) -> Response:
        if request.url.path.startswith("/api/") and request.method not in ("GET", "HEAD", "OPTIONS"):
            origine = request.headers.get("origin")
            atteso = f"{request.url.scheme}://{request.url.netloc}"
            if request.headers.get("x-taric") != "1" or (origine and origine != atteso and origine != cfg.indirizzo):
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
        if request.url.scheme == "https":
            resp.headers["Strict-Transport-Security"] = "max-age=31536000"
        if request.url.path.startswith("/api/"):
            resp.headers["Cache-Control"] = "no-store"
        elif request.url.path.startswith("/static/"):
            # con l'impronta del contenuto (?v=) il file non cambia mai: il browser lo tiene; senza, lo ricontrolla
            resp.headers["Cache-Control"] = "public, max-age=31536000, immutable" if request.query_params.get("v") else "no-cache"
        return resp

    @app.exception_handler(Errore)
    async def _errore(request: Request, e: Errore) -> JSONResponse:
        return JSONResponse({"errore": e.detail, "codice": e.codice}, status_code=e.status_code)

    @app.exception_handler(RequestValidationError)
    async def _validazione(request: Request, e: RequestValidationError) -> JSONResponse:
        campi = sorted({str(x.get("loc", ["", ""])[-1]) for x in e.errors()})
        return JSONResponse({"errore": "Dati non validi: controlla " + ", ".join(campi) + ".", "codice": "dati_non_validi"}, status_code=422)

    # ------------------------------------------------------------------ pagine
    impronte: dict[tuple[str, int], str] = {}

    def impronta(rel: str) -> str:
        """Prime cifre dello SHA-256 di un file statico: cambia quando cambia il file."""
        f = STATIC / rel
        try:
            chiave = (rel, f.stat().st_mtime_ns)
        except OSError:
            return ""
        if chiave not in impronte:
            impronte[chiave] = hashlib.sha256(f.read_bytes()).hexdigest()[:12]
        return impronte[chiave]

    def con_impronte(html: str) -> str:
        """/static/x.js -> /static/x.js?v=impronta: dopo un aggiornamento il browser prende i file nuovi, mai un misto."""
        def sostituisci(m: re.Match[str]) -> str:
            v = impronta(m.group(2))
            return f'{m.group(1)}="/static/{m.group(2)}' + (f'?v={v}"' if v else '"')
        return RE_STATICO.sub(sostituisci, html)

    def pagina(nome: str) -> HTMLResponse:
        return HTMLResponse(con_impronte((STATIC / nome).read_text(encoding="utf-8")), headers={"Cache-Control": "no-cache"})

    @app.get("/", include_in_schema=False)
    def home(request: Request) -> Response:
        if utente_corrente(request) is None:
            return RedirectResponse("/accedi", 303)
        v = dati.attiva()
        if v is None:
            return pagina("attesa.html")
        html = (STATIC / "index.html").read_text(encoding="utf-8").replace("{{DATI}}", f"/data/{v}/")
        return HTMLResponse(con_impronte(html), headers={"Cache-Control": "no-cache"})

    @app.get("/manifest.webmanifest", include_in_schema=False)
    def manifest() -> FileResponse:
        return FileResponse(STATIC / "manifest.webmanifest", media_type="application/manifest+json")

    @app.get("/sw.js", include_in_schema=False)
    def service_worker() -> FileResponse:
        """Service worker per installare il sito come app: alla radice, perche' valga per tutte le pagine, e sempre
        ricontrollato, cosi' una nuova versione arriva subito."""
        return FileResponse(STATIC / "sw.js", media_type="text/javascript", headers={"Cache-Control": "no-cache"})

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

    @app.get("/api/salute", include_in_schema=False)
    def salute() -> dict[str, Any]:
        """Controllo di Render: il servizio risponde e il database si apre."""
        with db.connessione() as c:
            c.execute("SELECT 1").fetchone()
        return {"ok": True, "versione": __version__}

    # ------------------------------------------------------------------ account, accesso, gestione degli utenti
    @app.get("/accedi", include_in_schema=False)
    def pagina_accedi(request: Request) -> Response:
        return RedirectResponse("/", 303) if utente_corrente(request) is not None else pagina("accedi.html")

    @app.get("/reimposta-password", include_in_schema=False)
    def pagina_reimposta() -> Response:
        return pagina("reimposta.html")

    @app.get("/api/modulo")
    def modulo() -> dict[str, Any]:
        with db.connessione() as c:
            aperta = bool(db.impostazioni(c)["registrazione_aperta"])
        return {"modulo": S.firma_modulo(segreto), "registrazione_aperta": aperta}

    @app.post("/api/registrazione")
    def registrazione(body: Iscrizione, request: Request) -> Response:
        email = S.normalizza_email(body.email)
        if body.sito_web or not S.verifica_modulo(segreto, body.modulo):
            raise Errore(400, "Il modulo è scaduto o non è valido: ricarica la pagina e riprova.", "modulo")
        if not S.email_valida(email):
            raise Errore(422, "Indirizzo email non valido.", "email")
        if (problema := S.problema_password(body.password, email)):
            raise Errore(422, problema, "password")
        chiave = "registrazione-ip:" + ip(request)
        with db.transazione() as c:
            troppi = S.conta(c, chiave, 3600) >= 5
            if not troppi:
                S.registra(c, chiave)
        if troppi:
            raise Errore(429, "Troppe registrazioni da questa rete: riprova più tardi.", "troppi_tentativi")
        amministratore = email in cfg.amministratori
        with db.transazione() as c:
            if not amministratore and not db.impostazioni(c)["registrazione_aperta"]:
                raise Errore(403, "Le registrazioni sono chiuse: chiedi all'amministratore di MAGIC HS.", "chiuse")
            if c.execute("SELECT 1 FROM utenti WHERE email = ?", (email,)).fetchone():
                raise Errore(409, "Esiste già un account con questa email: accedi, oppure chiedi all'amministratore un link per la password.", "esiste")
            uid = c.execute(
                "INSERT INTO utenti(email, nome, azienda, richiesta, hash_password, ruolo, stato, email_confermata, creato, aggiornato) "
                "VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?)",
                (email, body.nome.strip(), body.azienda.strip(), body.richiesta.strip(), S.hash_password(body.password),
                 "amministratore" if amministratore else "utente", "attivo" if amministratore else "in_attesa", iso(), iso())).lastrowid
            db.evento(c, "registrazione", uid, uid, f"{email}" + (" (amministratore)" if amministratore else ""))
            if amministratore:
                gettone, durata = S.crea_sessione(c, uid, request.headers.get("user-agent", ""), ip(request))
        resp = JSONResponse(json_ok(stato="attivo" if amministratore else "in_attesa"))
        if amministratore:
            imposta_cookie(resp, request, gettone, durata)
        return resp

    @app.post("/api/accedi")
    def accedi(body: Accesso, request: Request) -> Response:
        email = S.normalizza_email(body.email)
        k_email, k_ip = "accesso-email:" + email, "accesso-ip:" + ip(request)
        # i tentativi falliti si salvano prima di rispondere con l'errore (fuori dalla transazione che verrebbe annullata)
        with db.transazione() as c:
            bloccato = S.conta(c, k_email, 900) >= 5 or S.conta(c, k_ip, 900) >= 30
            u = None if bloccato else c.execute("SELECT * FROM utenti WHERE email = ?", (email,)).fetchone()
            sbagliata = not bloccato and not S.verifica_password(u["hash_password"] if u else None, body.password)
            if sbagliata:
                S.registra(c, k_email)
                S.registra(c, k_ip)
                if u is not None and S.conta(c, k_email, 900) == 5:
                    db.evento(c, "accesso_bloccato", u["id"], dettagli=f"5 password errate da {ip(request)}")
        if bloccato:
            raise Errore(429, "Troppi tentativi non riusciti: riprova tra 15 minuti.", "troppi_tentativi")
        if sbagliata or u is None:
            raise Errore(401, "Email o password non corretti.", "credenziali")
        messaggi = {"in_attesa": "La tua richiesta è in attesa di approvazione: quando l'amministratore la approva puoi accedere.",
                    "sospeso": "Il tuo account è sospeso: chiedi all'amministratore di MAGIC HS.",
                    "rifiutato": "La tua richiesta di accesso non è stata accolta."}
        if u["stato"] != "attivo":
            raise Errore(403, messaggi.get(u["stato"], "Account non attivo."), u["stato"])
        with db.transazione() as c:
            S.azzera(c, k_email)
            if S.da_rifare(u["hash_password"]):
                c.execute("UPDATE utenti SET hash_password = ? WHERE id = ?", (S.hash_password(body.password), u["id"]))
            gettone, durata = S.crea_sessione(c, u["id"], request.headers.get("user-agent", ""), ip(request), body.ricordami)
        resp = JSONResponse(json_ok())
        imposta_cookie(resp, request, gettone, durata, body.ricordami)
        return resp

    @app.post("/api/esci")
    def esci(request: Request) -> Response:
        with db.transazione() as c:
            S.chiudi_sessione(c, request.cookies.get(COOKIE))
        resp = JSONResponse(json_ok())
        resp.delete_cookie(COOKIE, path="/")
        return resp

    @app.post("/api/io/password")
    def cambia_password(body: CambioPassword, request: Request, u: sqlite3.Row = Depends(richiede_utente)) -> dict[str, Any]:
        if not S.verifica_password(u["hash_password"], body.attuale):
            raise Errore(403, "La password attuale non è corretta.", "credenziali")
        if (problema := S.problema_password(body.nuova, u["email"])):
            raise Errore(422, problema, "password")
        with db.transazione() as c:
            c.execute("UPDATE utenti SET hash_password = ?, aggiornato = ? WHERE id = ?", (S.hash_password(body.nuova), iso(), u["id"]))
            S.chiudi_tutte(c, u["id"], tranne=request.cookies.get(COOKIE))
            db.evento(c, "password_cambiata", u["id"], u["id"])
        return json_ok()

    @app.post("/api/io/esci-ovunque")
    def esci_ovunque(request: Request, u: sqlite3.Row = Depends(richiede_utente)) -> dict[str, Any]:
        with db.transazione() as c:
            S.chiudi_tutte(c, u["id"], tranne=request.cookies.get(COOKIE))
        return json_ok()

    @app.post("/api/reimposta-password")
    def reimposta_password(body: NuovaPassword, request: Request) -> Response:
        """Link monouso preparato dall'amministratore (Gestione > Utenti): nuova password e accesso."""
        with db.transazione() as c:
            r = c.execute("SELECT utente_id FROM gettoni WHERE hash = ? AND scopo = 'reimposta_password'", (S.impronta(body.gettone.strip()),)).fetchone()
            u = c.execute("SELECT * FROM utenti WHERE id = ?", (r["utente_id"],)).fetchone() if r else None
            if u is not None and (problema := S.problema_password(body.password, u["email"])):
                raise Errore(422, problema, "password")
            uid = S.usa_gettone(c, body.gettone.strip(), "reimposta_password")
            if uid is None or u is None:
                raise Errore(400, "Il link non è valido o è scaduto: chiedine uno nuovo all'amministratore.", "gettone")
            c.execute("UPDATE utenti SET hash_password = ?, aggiornato = ? WHERE id = ?", (S.hash_password(body.password), iso(), uid))
            S.chiudi_tutte(c, uid)
            S.azzera(c, "accesso-email:" + u["email"])
            db.evento(c, "password_reimpostata", uid, uid)
            attivo = u["stato"] == "attivo"
            if attivo:
                gettone, durata = S.crea_sessione(c, uid, request.headers.get("user-agent", ""), ip(request))
        resp = JSONResponse(json_ok(entrato=attivo))
        if attivo:
            imposta_cookie(resp, request, gettone, durata)
        return resp

    # ---------------------------------------------------------------- gestione degli utenti
    def utente_o_404(c: sqlite3.Connection, uid: int) -> sqlite3.Row:
        r = c.execute("SELECT * FROM utenti WHERE id = ?", (uid,)).fetchone()
        if r is None:
            raise Errore(404, "Utente inesistente.", "non_trovato")
        return r

    @app.get("/api/admin/utenti")
    def admin_utenti(a: sqlite3.Row = Depends(richiede_admin)) -> dict[str, Any]:
        mese = mese_corrente()
        with db.connessione() as c:
            uso = {r["utente_id"]: dict(r) for r in c.execute(
                "SELECT utente_id, COUNT(DISTINCT CASE WHEN tipo = 'classifica' AND operazione != '' AND (esito = 'ok' OR token_in > 0) "
                "THEN operazione END) AS classificazioni, COUNT(*) AS richieste, COALESCE(SUM(token_in), 0) AS token_in, "
                "COALESCE(SUM(token_out), 0) AS token_out FROM uso_ia WHERE mese = ? GROUP BY utente_id", (mese,))}
            out = []
            for r in c.execute("SELECT * FROM utenti ORDER BY CASE stato WHEN 'in_attesa' THEN 0 ELSE 1 END, nome").fetchall():
                d = {k: r[k] for k in ("id", "nome", "email", "azienda", "richiesta", "ruolo", "stato", "quota_ia", "motivo_stato",
                                       "creato", "ultimo_accesso")}
                d["limite"] = ia.limite(c, r)
                d["uso"] = uso.get(r["id"], {"classificazioni": 0, "richieste": 0, "token_in": 0, "token_out": 0})
                d["fisso"] = r["email"] in cfg.amministratori            # amministratore da MAGIC_HS_AMMINISTRATORI
                out.append(d)
        return {"utenti": out, "mese": mese, "io": a["id"]}

    @app.patch("/api/admin/utenti/{uid}")
    def admin_modifica(uid: int, body: ModificaUtente, a: sqlite3.Row = Depends(richiede_admin)) -> dict[str, Any]:
        campi = body.model_fields_set
        with db.transazione() as c:
            u = utente_o_404(c, uid)
            if "ruolo" in campi and body.ruolo and body.ruolo != u["ruolo"]:
                if uid == a["id"] or u["email"] in cfg.amministratori:
                    raise Errore(409, "Questo ruolo non si può cambiare da qui.", "ruolo")
                c.execute("UPDATE utenti SET ruolo = ? WHERE id = ?", (body.ruolo, uid))
                db.evento(c, "ruolo", uid, a["id"], body.ruolo)
            if "quota_ia" in campi:
                c.execute("UPDATE utenti SET quota_ia = ? WHERE id = ?", (body.quota_ia, uid))
                db.evento(c, "quota_ia", uid, a["id"], "predefinito" if body.quota_ia is None else str(body.quota_ia))
            if "nome" in campi and body.nome:
                c.execute("UPDATE utenti SET nome = ? WHERE id = ?", (body.nome.strip(), uid))
            if "azienda" in campi and body.azienda is not None:
                c.execute("UPDATE utenti SET azienda = ? WHERE id = ?", (body.azienda.strip(), uid))
            c.execute("UPDATE utenti SET aggiornato = ? WHERE id = ?", (iso(), uid))
        return json_ok()

    @app.post("/api/admin/utenti/{uid}/{azione}")
    def admin_azione(uid: int, azione: Literal["approva", "rifiuta", "sospendi", "riattiva", "link-password", "esci-ovunque"],
                     request: Request, body: Optional[Motivo] = None, a: sqlite3.Row = Depends(richiede_admin)) -> dict[str, Any]:
        motivo = (body.motivo if body else "").strip()
        with db.transazione() as c:
            u = utente_o_404(c, uid)
            if (uid == a["id"] or u["email"] in cfg.amministratori) and azione in ("rifiuta", "sospendi"):
                raise Errore(409, "Non puoi sospendere questo account.", "se_stesso")
            if azione in ("approva", "riattiva"):
                if u["hash_password"] is None:
                    raise Errore(409, "L'utente non ha una password: prepara un link per impostarla.", "senza_password")
                c.execute("UPDATE utenti SET stato = 'attivo', motivo_stato = '', aggiornato = ? WHERE id = ?", (iso(), uid))
                db.evento(c, "approvato" if azione == "approva" else "riattivato", uid, a["id"], u["email"])
            elif azione in ("rifiuta", "sospendi"):
                c.execute("UPDATE utenti SET stato = ?, motivo_stato = ?, aggiornato = ? WHERE id = ?",
                          ("rifiutato" if azione == "rifiuta" else "sospeso", motivo, iso(), uid))
                S.chiudi_tutte(c, uid)
                db.evento(c, "rifiutato" if azione == "rifiuta" else "sospeso", uid, a["id"], motivo)
            elif azione == "link-password":
                link = f"{base_url(request)}/reimposta-password#{S.crea_gettone(c, uid, 'reimposta_password', 72)}"
                db.evento(c, "link_password", uid, a["id"], u["email"])
                return json_ok(link=link)
            else:
                S.chiudi_tutte(c, uid)
                db.evento(c, "sessioni_chiuse", uid, a["id"])
        return json_ok()

    @app.delete("/api/admin/utenti/{uid}")
    def admin_elimina(uid: int, a: sqlite3.Row = Depends(richiede_admin)) -> dict[str, Any]:
        with db.transazione() as c:
            u = utente_o_404(c, uid)
            if uid == a["id"] or u["email"] in cfg.amministratori:
                raise Errore(409, "Non puoi eliminare questo account.", "se_stesso")
            c.execute("DELETE FROM utenti WHERE id = ?", (uid,))
            db.evento(c, "utente_eliminato", None, a["id"], f"{u['email']} ({u['nome']})")
        return json_ok()

    # ---------------------------------------------------------------- intelligenza artificiale e regole del sito
    @app.get("/api/admin/ia")
    def admin_ia(a: sqlite3.Row = Depends(richiede_admin)) -> dict[str, Any]:
        with db.connessione() as c:
            imp = db.impostazioni(c)
            uso = {**ia.uso_mese(c), "mese": mese_corrente()}
            in_attesa = c.execute("SELECT COUNT(*) FROM utenti WHERE stato = 'in_attesa'").fetchone()[0]
        return {"attiva": ia.disponibile, "ia_nome": cfg.ia_nome, "fornitore": cfg.ia_fornitore,
                "modelli": {"rapido": cfg.modello_rapido, "principale": cfg.modello} if ia.disponibile else None,
                "uso": uso, "quota_predefinita": imp["quota_predefinita"], "tetto_mese": imp["tetto_mese"],
                "registrazione_aperta": imp["registrazione_aperta"], "in_attesa": in_attesa}

    @app.put("/api/admin/impostazioni")
    def admin_impostazioni(body: ImpostazioniSito, a: sqlite3.Row = Depends(richiede_admin)) -> dict[str, Any]:
        valori = {k: getattr(body, k) for k in body.model_fields_set}
        with db.transazione() as c:
            db.salva_impostazioni(c, valori)
            db.evento(c, "impostazioni_sito", autore_id=a["id"], dettagli=json.dumps(valori, ensure_ascii=False))
        return json_ok()

    @app.post("/api/admin/ia/prova")
    def admin_ia_prova(livello: Literal["rapido", "standard"] = "rapido", a: sqlite3.Row = Depends(richiede_admin)) -> dict[str, Any]:
        return prova_ia(livello)

    @app.post("/api/admin/ia/modelli")
    def admin_ia_modelli(a: sqlite3.Row = Depends(richiede_admin)) -> dict[str, Any]:
        return elenco_modelli()

    @app.get("/api/admin/backup")
    def admin_backup(a: sqlite3.Row = Depends(richiede_admin)) -> FileResponse:
        """Copia del database da tenere fuori dal server (account, storico, preferiti, uso dell'IA)."""
        f = copie.crea()
        with db.transazione() as c:
            db.evento(c, "backup_scaricato", autore_id=a["id"], dettagli=f.name)
        return FileResponse(f, media_type="application/zip", filename=f.name)

    # ------------------------------------------------------------------ profilo
    def descrivi_utente(c: sqlite3.Connection, u: sqlite3.Row) -> dict[str, Any]:
        lim = ia.limite(c, u)
        tetto = ia.tetto_raggiunto(c)
        try:
            pref = json.loads(u["preferenze"] or "{}")
        except ValueError:
            pref = {}
        return {"id": u["id"], "nome": u["nome"], "email": u["email"], "azienda": u["azienda"], "ruolo": u["ruolo"],
                "preferenze": {"paese": pref.get("paese", ""), "flusso": pref.get("flusso", "import"), "tema": pref.get("tema", "auto"),
                               "condividi": pref.get("condividi", True) is not False},
                "ia": {"disponibile": ia.disponibile and lim != 0 and not tetto, "configurata": ia.disponibile, "nome": cfg.ia_nome, "limite": lim,
                       "usate": ia.usate(c, u["id"]), "mese": mese_corrente(), "tetto": tetto},
                "dati": {"versione": dati.attiva(), "aggiornamento": (dati.in_corso or {}).get("fase")}}

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
            pref = json.loads(c.execute("SELECT preferenze FROM utenti WHERE id = ?", (u["id"],)).fetchone()[0] or "{}")
            pref.update({"paese": paese, "flusso": body.flusso, "tema": body.tema})
            if body.condividi is not None:
                pref["condividi"] = body.condividi
            c.execute("UPDATE utenti SET preferenze = ? WHERE id = ?", (json.dumps(pref), u["id"]))
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
        condivisa = json.loads(u["preferenze"] or "{}").get("condividi", True) is not False      # archivio aziendale
        with db.transazione() as c:
            sid = c.execute("INSERT INTO storico(utente_id, quando, testo, codice, dati, condivisa) VALUES (?, ?, ?, ?, ?, ?)",
                            (u["id"], iso(), body.testo.strip(), body.codice, testo_dati, int(condivisa))).lastrowid
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

    # ------------------------------------------------------------------ esporta e importa
    @app.get("/api/io/esporta")
    def esporta(u: sqlite3.Row = Depends(richiede_utente)) -> dict[str, Any]:
        with db.connessione() as c:
            io_ = descrivi_utente(c, u)
            storico_ = [{"quando": r["quando"], "testo": r["testo"], "codice": r["codice"], "dati": json.loads(r["dati"])}
                        for r in c.execute("SELECT quando, testo, codice, dati FROM storico WHERE utente_id = ? ORDER BY id DESC", (u["id"],))]
            preferiti_ = [dict(r) for r in c.execute("SELECT codice, nota, quando FROM preferiti WHERE utente_id = ? ORDER BY quando DESC", (u["id"],))]
        return {"formato": "magic-hs", "versione": 1, "esportato": iso(), "profilo": {"nome": io_["nome"], "azienda": io_["azienda"]},
                "preferenze": io_["preferenze"], "preferiti": preferiti_, "storico": storico_}

    @app.post("/api/io/importa")
    def importa(body: dict[str, Any], u: sqlite3.Row = Depends(richiede_utente)) -> dict[str, Any]:
        if body.get("formato") != "magic-hs" or not isinstance(body.get("storico"), list) or not isinstance(body.get("preferiti"), list):
            raise Errore(422, "Il file non è un'esportazione di MAGIC HS.", "formato")
        nuove = np = 0
        with db.transazione() as c:
            visti = {(r["quando"], r["testo"]) for r in c.execute("SELECT quando, testo FROM storico WHERE utente_id = ?", (u["id"],))}
            # l'esportazione va dalla più recente: dalla più vecchia, a parità d'orario nello stesso ordine
            for v in sorted((v for v in reversed(body["storico"]) if isinstance(v, dict)), key=lambda v: str(v.get("quando") or "")):
                testo, dati_ = str(v.get("testo") or "").strip()[:2000], v.get("dati")
                quando = str(v.get("quando") or iso())[:40]
                if not testo or not isinstance(dati_, dict) or (quando, testo) in visti:
                    continue
                codice = str(v.get("codice") or "")
                c.execute("INSERT INTO storico(utente_id, quando, testo, codice, dati) VALUES (?, ?, ?, ?, ?)",
                          (u["id"], quando, testo, codice if RE_CODICE.match(codice) else "", json.dumps(dati_, ensure_ascii=False)[:200_000]))
                visti.add((quando, testo))
                nuove += 1
            c.execute("DELETE FROM storico WHERE utente_id = ? AND id NOT IN (SELECT id FROM storico WHERE utente_id = ? ORDER BY quando DESC LIMIT 500)",
                      (u["id"], u["id"]))
            for p in body["preferiti"]:
                codice = str((p or {}).get("codice") or "") if isinstance(p, dict) else ""
                if not RE_CODICE.match(codice):
                    continue
                if c.execute("SELECT COUNT(*) FROM preferiti WHERE utente_id = ?", (u["id"],)).fetchone()[0] >= 1000:
                    break
                np += c.execute("INSERT INTO preferiti(utente_id, codice, nota, quando) VALUES (?, ?, ?, ?) ON CONFLICT(utente_id, codice) DO NOTHING",
                                (u["id"], codice, str(p.get("nota") or "").strip()[:500], str(p.get("quando") or iso())[:40])).rowcount
        return json_ok(storico=nuove, preferiti=np)

    # ------------------------------------------------------------------ preferiti: cosa e' cambiato con i dati del mese
    @app.get("/api/preferiti/cambi")
    def cambi_preferiti(u: sqlite3.Row = Depends(richiede_utente)) -> dict[str, Any]:
        """Differenze tra la versione dei dati in uso e la precedente installata, per i codici preferiti."""
        att = dati.attiva()
        nomi = sorted(d.name for d in dati.versioni.iterdir() if d.is_dir() and RE_VERSIONE.match(d.name) and (d / "nomenclatura.js").is_file()) \
            if dati.versioni.is_dir() else []
        prec = max((n for n in nomi if att and n < att), default=None)
        if not att or not prec:
            return {"da": prec, "a": att, "cambi": {}}
        with db.connessione() as c:
            codici = [r[0] for r in c.execute("SELECT codice FROM preferiti WHERE utente_id = ?", (u["id"],))]
        try:
            diff = cambi(dati.versioni / prec, dati.versioni / att, codici)
        except (OSError, ValueError, KeyError, IndexError) as e:          # file dei dati inattesi: niente avvisi, il resto funziona
            log.warning("confronto dei preferiti %s -> %s non riuscito: %s", prec, att, e)
            diff = {}
        return {"da": prec, "a": att, "cambi": diff}

    # ------------------------------------------------------------------ archivio aziendale: classificazioni gia' fatte
    @app.get("/api/archivio")
    def archivio(u: sqlite3.Row = Depends(richiede_utente)) -> dict[str, Any]:
        """Le classificazioni con codice condivise dai colleghi (e le proprie), raggruppate per descrizione e codice: la
        ricerca per parole le propone per prime e prima di chiamare l'IA si riprende quella identica."""
        gruppi: dict[tuple[str, str], dict[str, Any]] = {}
        with db.connessione() as c:
            righe = c.execute(
                "SELECT s.id, s.testo, s.codice, s.quando, s.utente_id, u.nome, json_extract(s.dati, '$.result') IS NOT NULL AS ia "
                "FROM storico s JOIN utenti u ON u.id = s.utente_id "
                "WHERE s.codice != '' AND (s.condivisa = 1 OR s.utente_id = ?) ORDER BY s.id DESC LIMIT 5000", (u["id"],))
            for r in righe:
                chiave = (piano(r["testo"]).strip(), r["codice"])
                g = gruppi.get(chiave)
                if g is None:
                    if len(gruppi) >= 2000:
                        continue
                    gruppi[chiave] = {"id": r["id"], "testo": r["testo"], "codice": r["codice"], "quando": r["quando"],
                                      "chi": "tu" if r["utente_id"] == u["id"] else r["nome"], "volte": 1, "ia": bool(r["ia"])}
                else:
                    g["volte"] += 1
        return {"voci": list(gruppi.values())}

    @app.get("/api/archivio/{sid}")
    def voce_archivio(sid: int, u: sqlite3.Row = Depends(richiede_utente)) -> dict[str, Any]:
        """Una classificazione dell'archivio, completa: si riapre senza una nuova richiesta all'IA."""
        with db.connessione() as c:
            r = c.execute("SELECT testo, codice, quando, dati FROM storico WHERE id = ? AND (condivisa = 1 OR utente_id = ?)", (sid, u["id"])).fetchone()
        if r is None:
            raise Errore(404, "Classificazione non trovata.", "non_trovata")
        return {"testo": r["testo"], "codice": r["codice"], "quando": r["quando"], "dati": json.loads(r["dati"])}

    # ------------------------------------------------------------------ ricerca per parole: sinonimi e parole senza risultati
    @app.get("/api/sinonimi")
    def sinonimi(u: sqlite3.Row = Depends(richiede_utente)) -> dict[str, Any]:
        """Sinonimi aggiunti in Gestione: si sommano a quelli di js/sinonimi.js."""
        with db.connessione() as c:
            return {"sinonimi": {r["parola"]: json.loads(r["termini"]) for r in c.execute("SELECT parola, termini FROM sinonimi ORDER BY parola")}}

    @app.post("/api/ricerche-vuote")
    def ricerca_vuota(body: RicercaVuota, u: sqlite3.Row = Depends(richiede_utente)) -> dict[str, Any]:
        """Una ricerca per parole senza risultati, senza dire chi l'ha fatta: l'amministratore ne ricava i sinonimi."""
        testo = piano(body.testo).strip()[:80]
        if len(testo) < 3 or not re.search(r"[a-z]", testo):
            return json_ok()
        adesso = iso()
        with db.transazione() as c:
            c.execute("INSERT INTO ricerche_vuote(testo, volte, prima, ultima) VALUES (?, 1, ?, ?) "
                      "ON CONFLICT(testo) DO UPDATE SET volte = volte + 1, ultima = excluded.ultima", (testo, adesso, adesso))
            c.execute("DELETE FROM ricerche_vuote WHERE testo NOT IN (SELECT testo FROM ricerche_vuote ORDER BY ultima DESC LIMIT 1000)")
        return json_ok()

    @app.get("/api/admin/ricerca")
    def admin_ricerca(a: sqlite3.Row = Depends(richiede_admin)) -> dict[str, Any]:
        with db.connessione() as c:
            vuote = [dict(r) for r in c.execute("SELECT testo, volte, prima, ultima FROM ricerche_vuote ORDER BY volte DESC, ultima DESC LIMIT 200")]
            sin = [{"parola": r["parola"], "termini": json.loads(r["termini"]), "quando": r["quando"], "autore": r["nome"] or ""}
                   for r in c.execute("SELECT s.parola, s.termini, s.quando, u.nome FROM sinonimi s LEFT JOIN utenti u ON u.id = s.autore_id ORDER BY s.parola")]
        return {"vuote": vuote, "sinonimi": sin}

    @app.put("/api/admin/sinonimi/{parola}")
    def metti_sinonimo(parola: str, body: Sinonimo, a: sqlite3.Row = Depends(richiede_admin)) -> dict[str, Any]:
        chiave = piano(parola).strip()
        if not RE_PAROLA.fullmatch(chiave) or len(chiave) < 2 or len(chiave) > 40:
            raise Errore(422, "Il sinonimo vale per una sola parola, come «muletto».", "parola")
        termini = list(dict.fromkeys(piano(x).strip() for x in body.termini if piano(x).strip()))
        if not termini or any(len(x) > 60 for x in termini):
            raise Errore(422, "Scrivi uno o più termini della nomenclatura, separati da virgole.", "termini")
        v = dati.attiva()
        if v:                               # ogni termine deve portare a qualcosa, come i sinonimi di js/sinonimi.js
            testi = testi_nomenclatura(dati.versioni / v / "nomenclatura.js")
            mancano = [x for x in termini if not presente(testi, x)]
            if mancano:
                raise Errore(422, "Nella nomenclatura non c'è: " + ", ".join(f"«{x}»" for x in mancano) + ". Usa le parole del testo ufficiale.", "termini")
        with db.transazione() as c:
            c.execute("INSERT INTO sinonimi(parola, termini, autore_id, quando) VALUES (?, ?, ?, ?) "
                      "ON CONFLICT(parola) DO UPDATE SET termini = excluded.termini, autore_id = excluded.autore_id, quando = excluded.quando",
                      (chiave, json.dumps(termini, ensure_ascii=False), a["id"], iso()))
            c.execute("DELETE FROM ricerche_vuote WHERE testo = ?", (chiave,))
            db.evento(c, "sinonimo", autore_id=a["id"], dettagli=f"{chiave} -> {', '.join(termini)}")
        return json_ok(parola=chiave, termini=termini)

    @app.delete("/api/admin/sinonimi/{parola}")
    def togli_sinonimo(parola: str, a: sqlite3.Row = Depends(richiede_admin)) -> dict[str, Any]:
        with db.transazione() as c:
            n = c.execute("DELETE FROM sinonimi WHERE parola = ?", (piano(parola).strip(),)).rowcount
            if n:
                db.evento(c, "sinonimo_tolto", autore_id=a["id"], dettagli=piano(parola).strip())
        return json_ok(tolti=n)

    @app.delete("/api/admin/ricerche-vuote")
    def svuota_ricerche(testo: str = "", a: sqlite3.Row = Depends(richiede_admin)) -> dict[str, Any]:
        with db.transazione() as c:
            if testo:
                n = c.execute("DELETE FROM ricerche_vuote WHERE testo = ?", (piano(testo).strip(),)).rowcount
            else:
                n = c.execute("DELETE FROM ricerche_vuote").rowcount
        return json_ok(tolte=n)

    # ------------------------------------------------------------------ IA
    @app.post("/api/ia")
    def chiedi_ia(body: RichiestaIA, u: sqlite3.Row = Depends(richiede_utente)) -> Response:
        try:
            return JSONResponse(ia.chiedi(u, body.prompt, body.livello, contesto=body.contesto, schema=body.schema_risposta,
                                          operazione=body.operazione, tipo=body.tipo))
        except ErroreIA as e:
            return JSONResponse({"errore": MESSAGGI_IA.get(e.codice, MESSAGGI_IA["upstream_error"]), "codice": e.codice}, status_code=e.stato_http)

    # ------------------------------------------------------------------ prova del servizio IA ed elenco dei modelli
    def prova_ia(livello: str) -> dict[str, Any]:
        try:
            return json_ok(**ia.prova(livello))
        except ErroreIA as e:
            messaggio = {
                "not_configured": "Nessun servizio IA impostato: inserisci GEMINI_API_KEY nelle variabili del servizio su Render.",
                "server_misconfigured": "Il servizio rifiuta la chiave o non trova il modello: controlla chiave, indirizzo e nome del modello.",
                "upstream_error": "Non riesco a raggiungere il servizio: controlla l'indirizzo e, se in azienda c'è un proxy, chiedi all'IT.",
            }.get(e.codice) or MESSAGGI_IA.get(e.codice, MESSAGGI_IA["upstream_error"])
            raise Errore(e.stato_http, messaggio, e.codice)

    def elenco_modelli() -> dict[str, Any]:
        try:
            return json_ok(modelli=ia.modelli())
        except ErroreIA as e:
            raise Errore(e.stato_http, "Non riesco a leggere l'elenco dei modelli: controlla chiave e indirizzo, oppure scrivi il nome a mano.", e.codice)

    # ------------------------------------------------------------------ gestione: dati TARIC e registro
    @app.get("/api/admin/riepilogo")
    def admin_riepilogo(a: sqlite3.Row = Depends(richiede_admin)) -> dict[str, Any]:
        with db.connessione() as c:
            in_attesa = c.execute("SELECT COUNT(*) FROM utenti WHERE stato = 'in_attesa'").fetchone()[0]
        return {"ia": ia.disponibile, "ia_nome": cfg.ia_nome, "dati": dati.attiva(), "aggiornamento": dati.in_corso, "in_attesa": in_attesa}

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

    return app


__all__ = ["crea_app"]
