"""Applicazione web MAGIC HS (FastAPI): pagine, API di accesso, profilo, IA e amministrazione."""
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
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, AsyncIterator, Literal, Optional
from zoneinfo import ZoneInfo

import httpx
from fastapi import Depends, FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.exceptions import RequestValidationError
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse, PlainTextResponse, RedirectResponse, Response
from fastapi.staticfiles import StaticFiles
from starlette.concurrency import run_in_threadpool
from pydantic import BaseModel, Field

from . import __version__
from . import sicurezza as S
from .backup import Backup, ErroreBackup
from .condivisa import RE_UTENTE, Condivisa, ErroreCondivisa, editori, ia_da_impostazioni, utente_windows
from .config import Config
from .dati import GestoreDati
from .db import Database, iso
from .ia import ErroreIA, ServizioIA, mese_corrente
from .pagamenti import PIANI, ErrorePagamento, Pagamenti
from .posta import Posta
from .registrazioni import Registrazioni

log = logging.getLogger("taric")
STATIC = Path(__file__).with_name("static")
EMAIL_LOCALE = "utente@magic-hs.locale"          # l'unico utente del programma sul PC
# pagine e funzioni del sito che nel programma sul PC non servono (accesso, registrazione, pagamenti)
SOLO_SITO = ("/accedi", "/registrati", "/conferma-email", "/password-dimenticata", "/reimposta-password", "/configura",
             "/condizioni", "/api/registrazione", "/api/conferma-email", "/api/accedi", "/api/esci", "/api/password-dimenticata",
             "/api/reimposta-password", "/api/configurazione-iniziale", "/api/stripe/", "/api/pagamento/", "/api/io/password",
             "/api/io/esci-ovunque", "/api/admin/utenti", "/api/admin/pagamenti", "/api/admin/posta", "/api/admin/backup")
RE_CODICE = re.compile(r"^\d{10}$")
RE_DOMINIO = re.compile(r"^(?=.{3,253}$)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$")
RE_AREA = re.compile(r"^[A-Z0-9]{2,4}$")

CSP = ("default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; "
       "connect-src 'self'; manifest-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'; object-src 'none'")

MESSAGGI_IA = {
    "not_configured": "La classificazione assistita non è attiva su questo server: manca la chiave del servizio di intelligenza artificiale.",
    "quota_esaurita": "Hai esaurito le richieste all'IA di questo mese. Chiedi all'amministratore di aumentare il limite.",
    "rate_limited": "Troppe richieste in questo momento. Riprova tra un minuto.",
    "limite_giornaliero": "Il servizio di intelligenza artificiale ha raggiunto il suo limite di oggi (succede con i piani gratuiti). Riprova domani o avvisa l'amministratore.",
    "overloaded": "Il servizio di intelligenza artificiale è sovraccarico. Riprova tra qualche minuto.",
    "credito_esaurito": "Il servizio di intelligenza artificiale richiede la fatturazione attiva o ha esaurito il credito. Avvisa l'amministratore.",
    "regione_non_supportata": "Il servizio di intelligenza artificiale non è disponibile dal paese del server senza fatturazione attiva. Avvisa l'amministratore.",
    "server_misconfigured": "Il server non riesce a usare il servizio di intelligenza artificiale (chiave o modello non validi). Avvisa l'amministratore.",
    "refused": "L'IA non ha elaborato questa richiesta. Prova a descrivere la merce in un altro modo.",
    "empty_completion": "L'IA non ha restituito una risposta. Prova a riformulare la descrizione.",
    "invalid_json": "La risposta non era leggibile. Riprova.",
    "prompt_too_large": "La richiesta è troppo lunga. Accorcia la descrizione e riprova.",
    "upstream_timeout": "L'IA ha impiegato troppo tempo a rispondere. Riprova.",
    "upstream_error": "Errore temporaneo nel collegamento con il servizio di intelligenza artificiale. Riprova tra poco.",
    "bad_request": "Richiesta non valida.",
    "tetto_giornaliero": "Hai raggiunto il tetto di sicurezza delle richieste all'IA nelle ultime 24 ore. Riprova più tardi; se ti serve di più scrivi all'amministratore.",
}


class Errore(HTTPException):
    def __init__(self, stato: int, messaggio: str, codice: str = ""):
        super().__init__(stato, messaggio)
        self.codice = codice


# ------------------------------------------------------------------ modelli delle richieste
class Accesso(BaseModel):
    email: str = Field(max_length=254)
    password: str = Field(max_length=200)
    ricordami: bool = True


class Iscrizione(BaseModel):
    nome: str = Field(min_length=2, max_length=100)
    azienda: str = Field(default="", max_length=150)
    email: str = Field(max_length=254)
    password: str = Field(max_length=200)
    richiesta: str = Field(default="", max_length=1000)
    consenso: bool
    sito_web: str = Field(default="", max_length=200)     # trappola per i bot: deve restare vuoto
    modulo: str = Field(max_length=100)


class Gettone(BaseModel):
    gettone: str = Field(max_length=100)


class NuovaPassword(BaseModel):
    gettone: str = Field(max_length=100)
    password: str = Field(max_length=200)


class SoloEmail(BaseModel):
    email: str = Field(max_length=254)


class ConfigurazioneIniziale(BaseModel):
    codice: str = Field(max_length=40)
    nome: str = Field(min_length=2, max_length=100)
    email: str = Field(max_length=254)
    password: str = Field(max_length=200)


class Profilo(BaseModel):
    nome: str = Field(min_length=2, max_length=100)
    azienda: str = Field(default="", max_length=150)


class Preferenze(BaseModel):
    paese: str = Field(default="", max_length=4)
    flusso: Literal["import", "export"] = "import"
    tema: Literal["auto", "chiaro", "scuro"] = "auto"


class CambioPassword(BaseModel):
    attuale: str = Field(max_length=200)
    nuova: str = Field(max_length=200)


class VoceStorico(BaseModel):
    testo: str = Field(min_length=1, max_length=2000)
    codice: str = Field(default="", max_length=10)
    dati: dict[str, Any]


class Nota(BaseModel):
    nota: str = Field(default="", max_length=500)


class RichiestaIA(BaseModel):
    prompt: str = Field(min_length=1, max_length=400_000)
    livello: Literal["rapido", "standard"] = "standard"


class NuovoUtente(BaseModel):
    nome: str = Field(min_length=2, max_length=100)
    email: str = Field(max_length=254)
    azienda: str = Field(default="", max_length=150)
    ruolo: Literal["utente", "amministratore"] = "utente"
    quota_ia: Optional[int] = Field(default=None, ge=0, le=100000)


class ModificaUtente(BaseModel):
    nome: Optional[str] = Field(default=None, min_length=2, max_length=100)
    azienda: Optional[str] = Field(default=None, max_length=150)
    ruolo: Optional[Literal["utente", "amministratore"]] = None
    quota_ia: Optional[int] = Field(default=None, ge=0, le=100000)


class Motivo(BaseModel):
    motivo: str = Field(default="", max_length=500)
    invia: bool = False


class Prezzi(BaseModel):
    # centesimi di euro; Stripe non accetta pagamenti sotto 0,50 EUR (0 = piano non in vendita)
    giorno: int = Field(ge=0, le=1_000_000)
    settimana: int = Field(ge=0, le=1_000_000)
    mese: int = Field(ge=0, le=1_000_000)
    anno: int = Field(ge=0, le=10_000_000)


class Impostazioni(BaseModel):
    # si salvano solo i campi inviati: le regole di registrazione e i piani hanno moduli separati
    registrazione_aperta: Optional[bool] = None
    approva_tutti: Optional[bool] = None
    domini_approvati: Optional[list[str]] = Field(default=None, max_length=200)
    domini_bloccati: Optional[list[str]] = Field(default=None, max_length=500)
    quota_predefinita: Optional[int] = Field(default=None, ge=0, le=100000)
    massimo_in_attesa: Optional[int] = Field(default=None, ge=1, le=10000)
    prezzi: Optional[Prezzi] = None
    pro_tetto_giorno: Optional[int] = Field(default=None, ge=0, le=100000)


class Acquisto(BaseModel):
    piano: Literal["giorno", "settimana", "mese", "anno"]
    rinuncia_recesso: bool = False


class ConcessionePro(BaseModel):
    fino: Optional[str] = Field(default=None, pattern=r"^\d{4}-\d{2}-\d{2}$")   # None = togli la concessione


class RitornoPagamento(BaseModel):
    sessione: str = Field(min_length=3, max_length=255)


class Mese(BaseModel):
    mese: str = Field(default="", pattern=r"^(\d{4}-\d{2})?$")


class Versione(BaseModel):
    versione: str = Field(pattern=r"^\d{4}-\d{2}-01$")


class ImpostazioniIA(BaseModel):
    """Servizio IA per tutti i colleghi (programma sul PC), salvato nella cartella condivisa."""
    fornitore: Literal["", "gemini", "anthropic", "openai"] = ""
    chiave: Optional[str] = Field(default=None, max_length=500)       # None = tiene quella salvata
    url: str = Field(default="", max_length=300)
    modello: str = Field(default="", max_length=120)
    modello_rapido: str = Field(default="", max_length=120)
    quota: Optional[int] = Field(default=None, ge=0, le=100000)       # richieste al mese per persona; None = senza limite


class ChiaveIstanza(BaseModel):
    chiave: str = Field(max_length=200)


class Editori(BaseModel):
    editori: list[str] = Field(min_length=1, max_length=50)


# ------------------------------------------------------------------ applicazione
def crea_app(cfg: Config, client_ia: httpx.Client | None = None, pianificatore: bool = True,
             client_stripe: httpx.Client | None = None, chiave_ingresso: str = "", istanza: str = "") -> FastAPI:
    """Crea l'applicazione. Con cfg.locale e' il programma sul PC (vedi programma.py): un solo utente, che entra
    con la chiave dell'avvio (chiave_ingresso), e versioni, dati e impostazioni dalla cartella condivisa."""
    db = Database(cfg.dati / "taric.db")
    posta = Posta(cfg)
    reg = Registrazioni(db, posta)
    ia = ServizioIA(cfg, db, client_ia)
    pag = Pagamenti(cfg, db, client_stripe)
    ia.pro = pag.pro_attivo
    dati = GestoreDati(cfg, db, posta)
    copie = Backup(cfg.dati, cfg.backup_copie)
    locale = cfg.locale
    condivisa = Condivisa(cfg.condivisa) if locale and cfg.condivisa else None
    utente_pc = utente_windows() if locale else ""
    # programma sul PC: pubblica per tutti solo chi e' nell'elenco degli editori e puo' scrivere nella cartella
    ruolo_pc: dict[str, Any] = {"editore": False, "puo_gestire": False, "editori": [], "scrivibile": None}
    cookie = "magic_hs_locale" if locale else S.COOKIE_SESSIONE

    def editore() -> bool:
        return bool(ruolo_pc["editore"])

    def scrivibile() -> bool:
        """Prova di scrittura nella cartella, una volta sola: ogni prova crea e cancella un file su OneDrive."""
        if ruolo_pc["scrivibile"] is None:
            ruolo_pc["scrivibile"] = bool(condivisa and condivisa.scrivibile())
        return bool(ruolo_pc["scrivibile"])

    # ------------------------------------------------------------------ programma sul PC: cartella condivisa
    def applica_impostazioni() -> None:
        """Servizio IA e limite mensile scelti dall'editore (impostazioni.json della cartella condivisa)."""
        imp = condivisa.impostazioni() if condivisa else {}
        if not imp:
            return
        cfg.imposta_ia(ia_da_impostazioni(imp))
        quota = imp.get("quota", 50)
        if quota is not None and not (isinstance(quota, int) and quota >= 0):
            quota = 50
        with db.transazione() as c:
            if db.impostazioni(c)["quota_predefinita"] != quota:
                db.salva_impostazioni(c, {"quota_predefinita": quota})

    def pubblica(v: str) -> None:
        if condivisa is not None:
            condivisa.pubblica_dati(v, dati.versioni / v)

    def aggiorna_ruolo() -> None:
        """Rilegge l'elenco degli editori: chi viene aggiunto o tolto cambia ruolo entro un giro del pianificatore."""
        if condivisa is None:
            return
        elenco = editori(condivisa.impostazioni())
        e = utente_pc in elenco and scrivibile()
        ruolo_pc.update(editore=e, editori=elenco, puo_gestire=not elenco and scrivibile())
        cfg.scarica_dati = e                    # i dati arrivano dalla cartella: li scarica dalla fonte solo chi pubblica
        dati.dopo_installazione = pubblica if e else None
        with db.transazione() as c:
            c.execute("UPDATE utenti SET ruolo = ? WHERE email = ? AND ruolo != ?",
                      ("amministratore" if e else "utente", EMAIL_LOCALE, "amministratore" if e else "utente"))

    def allinea_dati() -> None:
        """L'editore pubblica la versione dei dati installata sul suo PC se e' piu' recente di quella nella cartella;
        tutti gli altri (e l'editore, se qualcuno ha pubblicato dopo di lui) installano quella della cartella."""
        if condivisa is None or not condivisa.raggiungibile() or not dati._lock.acquire(blocking=False):
            return
        try:
            att, pubb = dati.attiva(), condivisa.dati_pubblicati()
            if editore() and att and (not pubb or att > pubb or (att == pubb and not (condivisa.dati / f"{att}.zip").is_file())):
                condivisa.pubblica_dati(att, dati.versioni / att)
            elif condivisa.ricevi_dati(dati.versioni, dati.imposta_attiva, att):
                dati._pota()
        except (OSError, ErroreCondivisa):
            log.exception("allineamento dei dati con la cartella condivisa")
        finally:
            dati._lock.release()

    if locale:
        cfg.scarica_dati = False
        with db.transazione() as c:
            nome = (os.environ.get("USERNAME") or os.environ.get("USER") or "").strip()[:100]
            c.execute("INSERT INTO utenti(email, nome, ruolo, stato, email_confermata, creato, aggiornato) "
                      "VALUES (?, ?, 'utente', 'attivo', 1, ?, ?) ON CONFLICT(email) DO UPDATE SET stato = 'attivo'",
                      (EMAIL_LOCALE, nome if len(nome) >= 2 else "Utente", iso(), iso()))
        aggiorna_ruolo()
        applica_impostazioni()
        allinea_dati()

    @asynccontextmanager
    async def vita(_app: FastAPI) -> AsyncIterator[None]:
        if pianificatore:
            if locale:
                dati.avvia_pianificatore(reg, copie, ogni_ciclo=[aggiorna_ruolo, applica_impostazioni, allinea_dati], attesa=600)
            else:
                dati.avvia_pianificatore(reg, copie, [pag.sincronizza_scadenze])
        yield
        dati.ferma()

    app = FastAPI(title="MAGIC HS", docs_url=None, redoc_url=None, openapi_url=None, lifespan=vita)
    app.state.cfg, app.state.db, app.state.posta, app.state.dati, app.state.ia, app.state.reg = cfg, db, posta, dati, ia, reg
    app.state.pagamenti = pag
    app.state.condivisa = condivisa
    app.state.ultimo_contatto = time.monotonic()      # programma sul PC: si chiude da solo dopo un periodo senza richieste
    app.state.ferma = lambda: None                    # programma sul PC: lo imposta programma.py
    codice_file = cfg.dati / "codice-configurazione.txt"

    def ci_sono_admin(c: sqlite3.Connection) -> bool:
        return c.execute("SELECT 1 FROM utenti WHERE ruolo = 'amministratore' AND stato = 'attivo' LIMIT 1").fetchone() is not None

    def codice_configurazione() -> str:
        if not codice_file.exists():
            codice_file.write_text(secrets.token_hex(3).upper() + "-" + secrets.token_hex(3).upper(), encoding="utf-8")
            try:
                codice_file.chmod(0o600)
            except OSError:
                pass
        return codice_file.read_text(encoding="utf-8").strip()

    with db.connessione() as c0:
        if not locale and not ci_sono_admin(c0):
            host = "localhost" if cfg.host in ("0.0.0.0", "::", "") else cfg.host
            log.warning("NESSUN AMMINISTRATORE: apri %s/configura e inserisci il codice %s",
                        cfg.url_pubblico or f"http://{host}:{cfg.porta}", codice_configurazione())

    # ------------------------------------------------------------------ utilita'
    def base_url(request: Request) -> str:
        return cfg.url_pubblico or str(request.base_url).rstrip("/")

    def ip(request: Request) -> str:
        return request.client.host if request.client else ""

    def cookie_sicuro(request: Request) -> bool:
        return cfg.cookie_sicuro == "si" or (cfg.cookie_sicuro == "auto" and request.url.scheme == "https")

    def imposta_cookie(resp: Response, request: Request, gettone: str, durata: int, ricordami: bool) -> None:
        resp.set_cookie(cookie, gettone, max_age=durata if ricordami else None, httponly=True,
                        secure=cookie_sicuro(request), samesite="lax", path="/")

    def utente_corrente(request: Request) -> sqlite3.Row | None:
        with db.connessione() as c:
            return S.utente_da_sessione(c, request.cookies.get(cookie))

    def richiede_utente(request: Request) -> sqlite3.Row:
        u = utente_corrente(request)
        if u is None:
            raise Errore(401, "Sessione scaduta: accedi di nuovo.", "non_autenticato")
        return u

    def richiede_admin(u: sqlite3.Row = Depends(richiede_utente)) -> sqlite3.Row:
        if u["ruolo"] != "amministratore":
            raise Errore(403, "Questa funzione è riservata agli amministratori.", "vietato")
        return u

    def json_ok(**kw: Any) -> dict[str, Any]:
        return {"ok": True, **kw}

    # ------------------------------------------------------------------ middleware: intestazioni di sicurezza e CSRF
    host_locali = {f"127.0.0.1:{cfg.porta}", f"localhost:{cfg.porta}"}

    @app.middleware("http")
    async def protezioni(request: Request, call_next: Any) -> Response:
        if locale:
            # solo dal PC stesso e con il suo indirizzo (contro i siti che puntano a 127.0.0.1 con un altro nome)
            if request.headers.get("host", "") not in host_locali:
                return PlainTextResponse("Richiesta non consentita.", status_code=403)
            app.state.ultimo_contatto = time.monotonic()
            if request.url.path.startswith(SOLO_SITO):
                if request.url.path.startswith("/api/"):
                    return JSONResponse({"errore": "Funzione non disponibile nel programma sul PC.", "codice": "non_disponibile"}, status_code=404)
                return RedirectResponse("/", 303)
        if (request.url.path.startswith("/api/") and request.method not in ("GET", "HEAD", "OPTIONS")
                and request.url.path != "/api/stripe/webhook"):
            origine = request.headers.get("origin")
            atteso = f"{request.url.scheme}://{request.url.netloc}"
            if request.headers.get("x-taric") != "1" or (origine and origine != atteso and origine != cfg.url_pubblico):
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
        if locale:
            if utente_corrente(request) is None:
                return pagina("locale.html")
        else:
            with db.connessione() as c:
                if not ci_sono_admin(c):
                    return RedirectResponse("/configura", 303)
            if utente_corrente(request) is None:
                return RedirectResponse("/accedi", 303)
        v = dati.attiva()
        if v is None:
            return pagina("attesa.html")
        html = (STATIC / "index.html").read_text(encoding="utf-8").replace("{{DATI}}", f"/data/{v}/")
        return HTMLResponse(html, headers={"Cache-Control": "no-cache"})

    for _nome in ("accedi", "registrati", "conferma-email", "password-dimenticata", "reimposta-password"):
        def _vista(_n: str = _nome) -> FileResponse:
            return pagina(f"{_n}.html")
        app.get(f"/{_nome}", include_in_schema=False)(_vista)

    @app.get("/condizioni", include_in_schema=False)
    def condizioni() -> HTMLResponse:
        """Condizioni di vendita del piano Pro, con i dati del venditore (taric.env) e i prezzi del pannello."""
        from html import escape
        with db.connessione() as c:
            imp = db.impostazioni(c)
        def e(x: str) -> str:
            return escape(x, quote=True)
        def euro(cent: int) -> str:
            return f"{cent / 100:.2f}".replace(".", ",") + " €"
        nomi = {"giorno": "Pro 1 giorno", "settimana": "Pro 1 settimana", "mese": "Pro mensile, al mese", "anno": "Pro annuale, all'anno"}
        prezzi = "".join(f"<li>{nomi[k]}: <b>{euro(int(v))}</b></li>" for k, v in imp["prezzi"].items() if k in nomi and int(v) > 0)
        email = cfg.venditore_email
        valori = {
            "{{VENDITORE}}": e(cfg.venditore or "Il gestore di questo sito (dati da completare in taric.env)"),
            "{{PIVA}}": f", partita IVA {e(cfg.venditore_piva)}" if cfg.venditore_piva else "",
            "{{INDIRIZZO}}": f", {e(cfg.venditore_indirizzo)}" if cfg.venditore_indirizzo else "",
            "{{EMAIL}}": f'<a href="mailto:{e(email)}">{e(email)}</a>' if email else "l'indirizzo indicato dall'amministratore",
            "{{GRATUITO}}": str(int(imp["quota_predefinita"])),
            "{{TETTO}}": str(int(imp["pro_tetto_giorno"])) if int(imp["pro_tetto_giorno"]) else "un numero ragionevole di",
            "{{PREZZI}}": prezzi or "<li>Al momento il piano Pro non è in vendita.</li>",
            "{{DATA}}": e(cfg.extra.get("TARIC_CONDIZIONI_DATA", "") or "giorno della pubblicazione"),
        }
        html = (STATIC / "condizioni.html").read_text(encoding="utf-8")
        for k, v in valori.items():
            html = html.replace(k, v)
        return HTMLResponse(html, headers={"Cache-Control": "no-cache"})

    @app.get("/configura", include_in_schema=False)
    def configura() -> Response:
        with db.connessione() as c:
            if ci_sono_admin(c):
                return RedirectResponse("/accedi", 303)
        return pagina("configura.html")

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

    # ------------------------------------------------------------------ stato pubblico (per le pagine di accesso)
    @app.get("/api/stato")
    def stato() -> dict[str, Any]:
        with db.connessione() as c:
            imp = db.impostazioni(c)
            configurato = ci_sono_admin(c)
        return {"configurato": configurato, "registrazione_aperta": bool(imp["registrazione_aperta"]),
                "posta": posta.configurata, "dati_pronti": dati.attiva() is not None,
                "aggiornamento": (dati.in_corso or {}).get("fase"), "locale": locale, "editore": editore()}

    # ------------------------------------------------------------------ programma sul PC: ingresso e chiusura
    if locale:
        @app.get("/entra", include_in_schema=False)
        def entra(request: Request, k: str = "") -> Response:
            """Indirizzo aperto dall'avvio nel browser: la chiave e' nel file dell'istanza, leggibile solo dall'utente di Windows."""
            if not chiave_ingresso or not hmac.compare_digest(k.encode(), chiave_ingresso.encode()):
                return pagina("locale.html")
            resp = RedirectResponse("/", 303)
            if utente_corrente(request) is None:
                with db.transazione() as c:
                    uid = c.execute("SELECT id FROM utenti WHERE email = ?", (EMAIL_LOCALE,)).fetchone()["id"]
                    gettone, durata = S.crea_sessione(c, uid, "127.0.0.1", request.headers.get("user-agent", ""), True)
                imposta_cookie(resp, request, gettone, durata, True)
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

        @app.post("/api/locale/sincronizza")
        def locale_sincronizza(u: sqlite3.Row = Depends(richiede_utente)) -> dict[str, Any]:
            """Controlla subito la cartella condivisa (pagina d'attesa dei dati)."""
            aggiorna_ruolo()
            applica_impostazioni()
            allinea_dati()
            return json_ok(dati=dati.attiva())

        @app.post("/api/locale/gestisco-io")
        def locale_gestisco_io(u: sqlite3.Row = Depends(richiede_utente)) -> dict[str, Any]:
            """Il primo editore: chi ha creato la cartella lo dice una volta dal suo PC."""
            if condivisa is None or not condivisa.raggiungibile():
                raise Errore(409, "Non trovo la cartella condivisa.", "condivisa")
            imp = condivisa.impostazioni()
            if editori(imp):
                raise Errore(409, "MAGIC HS ha già chi lo gestisce: chiedigli di aggiungerti in Gestione, «Cartella condivisa».", "editori")
            if not scrivibile():
                raise Errore(409, "Da questo PC non puoi scrivere nella cartella condivisa: serve il permesso di modifica.", "condivisa")
            if not RE_UTENTE.match(utente_pc):
                raise Errore(409, "Non riesco a leggere il tuo nome utente di Windows.", "utente")
            try:
                condivisa.salva_impostazioni({**imp, "editori": [utente_pc]})
            except OSError as e:
                raise Errore(409, f"Non riesco a scrivere nella cartella condivisa: {e}", "condivisa")
            aggiorna_ruolo()
            allinea_dati()
            if dati.da_fare():                             # cartella senza i dati del mese: si scaricano subito
                threading.Thread(target=dati.controlla_mese, name="taric-primo-mese", daemon=True).start()
            with db.transazione() as c:
                db.evento(c, "editori", autore_id=u["id"], dettagli=utente_pc)
            return json_ok(editore=editore())

    # ------------------------------------------------------------------ configurazione iniziale
    @app.post("/api/configurazione-iniziale")
    def configurazione_iniziale(body: ConfigurazioneIniziale, request: Request) -> Response:
        email = S.normalizza_email(body.email)
        with db.transazione() as c:
            gia = ci_sono_admin(c)
            troppi = S.conta(c, "configura-ip:" + ip(request), 3600) >= 10
            codice_ok = not gia and not troppi and hmac.compare_digest(body.codice.strip().upper(), codice_configurazione())
            if not gia and not troppi and not codice_ok:
                S.registra(c, "configura-ip:" + ip(request))
        if gia:
            raise Errore(409, "Il sito è già configurato.", "gia_configurato")
        if troppi:
            raise Errore(429, "Troppi tentativi: riprova tra un'ora.", "troppi_tentativi")
        if not codice_ok:
            raise Errore(403, "Codice di configurazione non corretto. Lo trovi nel registro del server all'avvio.", "codice")
        with db.transazione() as c:
            if ci_sono_admin(c):
                raise Errore(409, "Il sito è già configurato.", "gia_configurato")
            if not S.email_valida(email):
                raise Errore(422, "Indirizzo email non valido.", "email")
            if (p := S.problema_password(body.password, email)):
                raise Errore(422, p, "password")
            c.execute("DELETE FROM utenti WHERE email = ?", (email,))
            uid = c.execute("INSERT INTO utenti(email, nome, hash_password, ruolo, stato, email_confermata, creato, aggiornato) "
                            "VALUES (?, ?, ?, 'amministratore', 'attivo', 1, ?, ?)",
                            (email, body.nome.strip(), S.hash_password(body.password), iso(), iso())).lastrowid
            db.evento(c, "configurazione_iniziale", uid, uid, email)
            gettone, durata = S.crea_sessione(c, uid, ip(request), request.headers.get("user-agent", ""), True)
        codice_file.unlink(missing_ok=True)
        resp = JSONResponse(json_ok())
        imposta_cookie(resp, request, gettone, durata, True)
        return resp

    # ------------------------------------------------------------------ registrazione
    @app.get("/api/registrazione/modulo")
    def modulo() -> dict[str, str]:
        return {"modulo": S.firma_modulo(cfg.segreto)}

    @app.post("/api/registrazione")
    def registrazione(body: Iscrizione, request: Request) -> dict[str, Any]:
        email = S.normalizza_email(body.email)
        if body.sito_web or not S.verifica_modulo(cfg.segreto, body.modulo):
            raise Errore(400, "Il modulo è scaduto o non è valido: ricarica la pagina e riprova.", "modulo")
        if not body.consenso:
            raise Errore(422, "Per registrarti devi accettare le condizioni d'uso.", "consenso")
        if not S.email_valida(email):
            raise Errore(422, "Indirizzo email non valido.", "email")
        if (p := S.problema_password(body.password, email, body.nome)):
            raise Errore(422, p, "password")
        chiave = "registrazione-ip:" + ip(request)
        with db.transazione() as c:
            troppi = S.conta(c, chiave, 3600) >= 5
            if not troppi:
                S.registra(c, chiave)
        if troppi:
            raise Errore(429, "Troppe registrazioni da questa rete: riprova più tardi.", "troppi_tentativi")
        with db.transazione() as c:
            esito = reg.iscrivi(c, body.nome.strip(), body.azienda.strip(), email, body.password, body.richiesta.strip(), base_url(request))
        if not esito["ok"]:
            raise Errore(403, esito["errore"], "registrazione")
        return esito

    @app.post("/api/conferma-email")
    def conferma_email(body: Gettone, request: Request) -> dict[str, Any]:
        with db.transazione() as c:
            esito = reg.conferma(c, body.gettone.strip(), base_url(request))
        if not esito["ok"]:
            raise Errore(400, esito["errore"], "gettone")
        return esito

    # ------------------------------------------------------------------ accesso e uscita
    @app.post("/api/accedi")
    def accedi(body: Accesso, request: Request) -> Response:
        email = S.normalizza_email(body.email)
        k_email, k_ip = "accesso-email:" + email, "accesso-ip:" + ip(request)
        # i tentativi falliti vanno salvati prima di rispondere con l'errore (fuori dalla transazione che verrebbe annullata)
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
        with db.transazione() as c:
            u = c.execute("SELECT * FROM utenti WHERE id = ?", (u["id"],)).fetchone()
            if u["stato"] != "attivo":
                messaggi = {"email_da_confermare": "Conferma prima il tuo indirizzo: apri il link che ti abbiamo inviato via email.",
                            "in_attesa": "La tua richiesta è in attesa di approvazione da parte dell'amministratore.",
                            "sospeso": "Il tuo account è sospeso. Contatta l'amministratore.",
                            "rifiutato": "La tua richiesta di accesso non è stata accolta."}
                raise Errore(403, messaggi.get(u["stato"], "Account non attivo."), u["stato"])
            S.azzera(c, k_email)
            if S.da_rifare(u["hash_password"]):
                c.execute("UPDATE utenti SET hash_password = ? WHERE id = ?", (S.hash_password(body.password), u["id"]))
            gettone, durata = S.crea_sessione(c, u["id"], ip(request), request.headers.get("user-agent", ""), body.ricordami)
            db.evento(c, "accesso", u["id"], u["id"], ip(request))
        resp = JSONResponse(json_ok())
        imposta_cookie(resp, request, gettone, durata, body.ricordami)
        return resp

    @app.post("/api/esci")
    def esci(request: Request) -> Response:
        with db.transazione() as c:
            S.chiudi_sessione(c, request.cookies.get(cookie))
        resp = JSONResponse(json_ok())
        resp.delete_cookie(cookie, path="/")
        return resp

    @app.post("/api/password-dimenticata")
    def password_dimenticata(body: SoloEmail, request: Request) -> dict[str, Any]:
        email = S.normalizza_email(body.email)
        if not posta.configurata:
            return json_ok(messaggio="Questo server non può inviare email: chiedi all'amministratore un link per reimpostare la password.")
        with db.transazione() as c:
            if S.conta(c, "reimposta-ip:" + ip(request), 3600) >= 10 or S.conta(c, "reimposta-email:" + email, 3600) >= 3:
                raise Errore(429, "Troppe richieste: riprova più tardi.", "troppi_tentativi")
            S.registra(c, "reimposta-ip:" + ip(request))
            S.registra(c, "reimposta-email:" + email)
        with db.transazione() as c:
            u = c.execute("SELECT * FROM utenti WHERE email = ? AND stato = 'attivo'", (email,)).fetchone()
            if u is not None:
                g = S.crea_gettone(c, u["id"], "reimposta_password", 2)
                posta.invia(email, "MAGIC HS: reimposta la password",
                            f"Ciao {u['nome']},\n\nper scegliere una nuova password apri questo link (vale 2 ore):\n"
                            f"{base_url(request)}/reimposta-password#{g}\n\nSe non l'hai chiesto tu, ignora questo messaggio: "
                            "la password attuale resta valida.")
                db.evento(c, "richiesta_reimpostazione", u["id"])
        return json_ok(messaggio="Se l'indirizzo è registrato riceverai un'email con il link per scegliere una nuova password.")

    @app.post("/api/reimposta-password")
    def reimposta_password(body: NuovaPassword, request: Request) -> Response:
        with db.transazione() as c:
            r = c.execute("SELECT utente_id FROM gettoni WHERE hash = ? AND scopo = 'reimposta_password'", (S.impronta(body.gettone.strip()),)).fetchone()
            u = c.execute("SELECT * FROM utenti WHERE id = ?", (r["utente_id"],)).fetchone() if r else None
            if u is not None and (p := S.problema_password(body.password, u["email"], u["nome"])):
                raise Errore(422, p, "password")
            uid = S.usa_gettone(c, body.gettone.strip(), "reimposta_password")
            if uid is None or u is None:
                raise Errore(400, "Il link non è valido o è scaduto. Chiedine uno nuovo.", "gettone")
            c.execute("UPDATE utenti SET hash_password = ?, aggiornato = ? WHERE id = ?", (S.hash_password(body.password), iso(), uid))
            S.chiudi_tutte(c, uid)
            S.azzera(c, "accesso-email:" + u["email"])
            db.evento(c, "password_reimpostata", uid, uid)
            attivo = u["stato"] == "attivo"
            if attivo:
                gettone, durata = S.crea_sessione(c, uid, ip(request), request.headers.get("user-agent", ""), True)
        resp = JSONResponse(json_ok(entrato=attivo))
        if attivo:
            imposta_cookie(resp, request, gettone, durata, True)
        return resp

    # ------------------------------------------------------------------ profilo
    def descrivi_utente(c: sqlite3.Connection, u: sqlite3.Row) -> dict[str, Any]:
        lim = ia.limite(c, u)
        v = dati.attiva()
        try:
            pref = json.loads(u["preferenze"] or "{}")
        except ValueError:
            pref = {}
        return {"id": u["id"], "nome": u["nome"], "email": u["email"], "azienda": u["azienda"], "ruolo": u["ruolo"],
                "preferenze": {"paese": pref.get("paese", ""), "flusso": pref.get("flusso", "import"), "tema": pref.get("tema", "auto")},
                "ia": {"disponibile": ia.disponibile and lim != 0, "configurata": ia.disponibile, "nome": cfg.ia_nome, "limite": lim,
                       "usate": ia.usate(c, u["id"]), "mese": mese_corrente(), "tetto_giorno": ia.tetto(c, u)},
                "piano": {**pag.stato(c, u["id"]), "pagamenti": pag.attivi},
                "dati": {"versione": v, "aggiornamento": (dati.in_corso or {}).get("fase")},
                "locale": {"editore": editore(), "versione": __version__, "utente": utente_pc,
                           "puo_gestire": bool(ruolo_pc["puo_gestire"])} if locale else None}

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

    @app.post("/api/io/password")
    def cambia_password(body: CambioPassword, request: Request, u: sqlite3.Row = Depends(richiede_utente)) -> dict[str, Any]:
        if not S.verifica_password(u["hash_password"], body.attuale):
            raise Errore(403, "La password attuale non è corretta.", "credenziali")
        if (p := S.problema_password(body.nuova, u["email"], u["nome"])):
            raise Errore(422, p, "password")
        with db.transazione() as c:
            c.execute("UPDATE utenti SET hash_password = ?, aggiornato = ? WHERE id = ?", (S.hash_password(body.nuova), iso(), u["id"]))
            S.chiudi_tutte(c, u["id"], tranne=request.cookies.get(cookie))
            db.evento(c, "password_cambiata", u["id"], u["id"])
        return json_ok()

    @app.post("/api/io/esci-ovunque")
    def esci_ovunque(request: Request, u: sqlite3.Row = Depends(richiede_utente)) -> dict[str, Any]:
        with db.transazione() as c:
            S.chiudi_tutte(c, u["id"], tranne=request.cookies.get(cookie))
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
            return JSONResponse(ia.chiedi(u, body.prompt, body.livello))
        except ErroreIA as e:
            messaggio = MESSAGGI_IA.get(e.codice, MESSAGGI_IA["upstream_error"])
            if locale:
                messaggio = messaggio.replace(" su questo server", "").replace("Il server non riesce", "MAGIC HS non riesce") \
                    .replace("all'amministratore", "a chi gestisce MAGIC HS").replace("l'amministratore", "chi gestisce MAGIC HS")
            if e.codice == "quota_esaurita" and pag.attivi and u["quota_ia"] != 0:
                messaggio = ("Hai usato tutte le richieste gratuite all'IA di questo mese. Con il piano Pro sono illimitate: "
                             "lo attivi da Profilo, «Il tuo piano». Nomenclatura e misure restano consultabili.")
            return JSONResponse({"errore": messaggio, "codice": e.codice}, status_code=e.stato_http)

    # ------------------------------------------------------------------ piani e pagamenti
    def errore_pagamento(e: ErrorePagamento) -> Errore:
        return Errore(e.stato, e.messaggio, e.codice)

    @app.get("/api/piani")
    def piani(u: sqlite3.Row = Depends(richiede_utente)) -> dict[str, Any]:
        with db.connessione() as c:
            imp = db.impostazioni(c)
            mio = pag.stato(c, u["id"])
        return {"attivi": pag.attivi, "prova": pag.modalita_prova, "gratuito": imp["quota_predefinita"], "tetto_giorno": imp["pro_tetto_giorno"],
                "piani": [{"id": k, "nome": v["nome"], "abbonamento": v["abbonamento"], "prezzo": int(imp["prezzi"].get(k) or 0)}
                          for k, v in PIANI.items()],
                "mio": mio}

    @app.post("/api/pagamento/inizia")
    def inizia_pagamento(body: Acquisto, request: Request, u: sqlite3.Row = Depends(richiede_utente)) -> dict[str, Any]:
        if not body.rinuncia_recesso:
            raise Errore(422, "Per attivare subito il piano conferma la richiesta di esecuzione immediata.", "recesso")
        with db.transazione() as c:
            if S.conta(c, f"pagamento:{u['id']}", 3600) >= 30:
                raise Errore(429, "Troppi tentativi di pagamento: riprova tra un'ora.", "troppi")
            S.registra(c, f"pagamento:{u['id']}")
            imp = db.impostazioni(c)
        try:
            url = pag.inizia(u, body.piano, imp["prezzi"], base_url(request))
        except ErrorePagamento as e:
            raise errore_pagamento(e)
        with db.transazione() as c:
            db.evento(c, "pagamento_avviato", u["id"], u["id"],
                      f"{PIANI[body.piano]['nome']}; esecuzione immediata richiesta e rinuncia al recesso confermata")
        return json_ok(url=url)

    @app.post("/api/pagamento/conferma")
    def conferma_pagamento(body: RitornoPagamento, u: sqlite3.Row = Depends(richiede_utente)) -> dict[str, Any]:
        try:
            esito = pag.conferma(u["id"], body.sessione)
        except ErrorePagamento as e:
            raise errore_pagamento(e)
        with db.connessione() as c:
            return json_ok(esito=esito, piano=pag.stato(c, u["id"]))

    @app.post("/api/pagamento/gestisci")
    def gestisci_abbonamento(request: Request, u: sqlite3.Row = Depends(richiede_utente)) -> dict[str, Any]:
        try:
            return json_ok(url=pag.portale(u["id"], base_url(request)))
        except ErrorePagamento as e:
            raise errore_pagamento(e)

    @app.post("/api/stripe/webhook")
    async def stripe_webhook(request: Request) -> JSONResponse:
        if not pag.attivi or not cfg.stripe_firma:
            return JSONResponse({"errore": "Pagamenti non configurati.", "codice": "pagamenti_spenti"}, status_code=503)
        corpo = await request.body()
        if len(corpo) > 1_000_000:
            return JSONResponse({"errore": "Evento troppo grande.", "codice": "evento"}, status_code=413)
        try:
            esito = await run_in_threadpool(pag.webhook, corpo, request.headers.get("stripe-signature", ""))
        except ErrorePagamento as e:
            log.warning("webhook Stripe rifiutato: %s", e.messaggio)
            return JSONResponse({"errore": e.messaggio, "codice": e.codice}, status_code=e.stato)
        return JSONResponse({"ok": True, "esito": esito})

    # ------------------------------------------------------------------ amministrazione
    def conta_admin(c: sqlite3.Connection) -> int:
        return c.execute("SELECT COUNT(*) FROM utenti WHERE ruolo = 'amministratore' AND stato = 'attivo'").fetchone()[0]

    def utente_o_404(c: sqlite3.Connection, uid: int) -> sqlite3.Row:
        r = c.execute("SELECT * FROM utenti WHERE id = ?", (uid,)).fetchone()
        if r is None:
            raise Errore(404, "Utente inesistente.", "non_trovato")
        return r

    def link_password(c: sqlite3.Connection, uid: int, ore: float, request: Request) -> str:
        return f"{base_url(request)}/reimposta-password#{S.crea_gettone(c, uid, 'reimposta_password', ore)}"

    @app.get("/api/admin/riepilogo")
    def admin_riepilogo(a: sqlite3.Row = Depends(richiede_admin)) -> dict[str, Any]:
        with db.connessione() as c:
            stati = {r["stato"]: r["n"] for r in c.execute("SELECT stato, COUNT(*) AS n FROM utenti GROUP BY stato")}
            mese = mese_corrente()
            uso = c.execute("SELECT COUNT(*) AS n, COALESCE(SUM(token_in), 0) AS tin, COALESCE(SUM(token_out), 0) AS tout "
                            "FROM uso_ia WHERE mese = ?", (mese,)).fetchone()
        return {"utenti": stati, "posta": posta.configurata, "ia": ia.disponibile, "ia_nome": cfg.ia_nome, "ia_fornitore": cfg.ia_fornitore,
                "modelli": [cfg.modello_rapido, cfg.modello],
                "dati": dati.attiva(), "aggiornamento": dati.in_corso, "uso_mese": dict(uso), "mese": mese,
                "url_pubblico": cfg.url_pubblico}

    @app.get("/api/admin/utenti")
    def admin_utenti(a: sqlite3.Row = Depends(richiede_admin)) -> dict[str, Any]:
        mese = mese_corrente()
        with db.connessione() as c:
            righe = c.execute(
                "SELECT u.*, (SELECT COUNT(*) FROM sessioni s WHERE s.utente_id = u.id AND s.scade > ?) AS sessioni, "
                "(SELECT COUNT(*) FROM uso_ia x WHERE x.utente_id = u.id AND x.mese = ? AND (x.esito = 'ok' OR x.token_in > 0)) AS usate "
                "FROM utenti u ORDER BY CASE u.stato WHEN 'in_attesa' THEN 0 WHEN 'email_da_confermare' THEN 1 ELSE 2 END, u.nome",
                (iso(), mese)).fetchall()
            out = []
            for r in righe:
                d = {k: r[k] for k in ("id", "nome", "email", "azienda", "richiesta", "ruolo", "stato", "email_confermata", "quota_ia",
                                       "motivo_stato", "creato", "ultimo_accesso", "sessioni", "usate")}
                d["limite"] = ia.limite(c, r)
                d["password_impostata"] = r["hash_password"] is not None
                st = pag.stato(c, r["id"])
                d["pro"] = {"fino": st["fino"], "origine": st["origine"], "manuale_fino": st["manuale_fino"]} if st["pro"] or st["manuale_fino"] else None
                out.append(d)
        return {"utenti": out, "mese": mese}

    @app.post("/api/admin/utenti")
    def admin_crea(body: NuovoUtente, request: Request, a: sqlite3.Row = Depends(richiede_admin)) -> dict[str, Any]:
        email = S.normalizza_email(body.email)
        if not S.email_valida(email):
            raise Errore(422, "Indirizzo email non valido.", "email")
        with db.transazione() as c:
            if c.execute("SELECT 1 FROM utenti WHERE email = ?", (email,)).fetchone():
                raise Errore(409, "Esiste già un utente con questa email.", "duplicato")
            uid = c.execute("INSERT INTO utenti(email, nome, azienda, ruolo, stato, quota_ia, creato, aggiornato) "
                            "VALUES (?, ?, ?, ?, 'attivo', ?, ?, ?)",
                            (email, body.nome.strip(), body.azienda.strip(), body.ruolo, body.quota_ia, iso(), iso())).lastrowid
            link = link_password(c, uid, 168, request)
            db.evento(c, "utente_creato", uid, a["id"], f"{email} ({body.ruolo})")
        posta.invia(email, "MAGIC HS: il tuo account",
                    f"Ciao {body.nome.strip()},\n\n{a['nome']} ha creato per te un account su MAGIC HS.\n"
                    f"Scegli la tua password da questo link (vale 7 giorni):\n{link}")
        return json_ok(id=uid, link=link, inviata=posta.configurata)

    @app.patch("/api/admin/utenti/{uid}")
    def admin_modifica(uid: int, body: ModificaUtente, a: sqlite3.Row = Depends(richiede_admin)) -> dict[str, Any]:
        campi = body.model_fields_set
        with db.transazione() as c:
            u = utente_o_404(c, uid)
            if "ruolo" in campi and body.ruolo and body.ruolo != u["ruolo"]:
                if uid == a["id"]:
                    raise Errore(409, "Non puoi cambiare il tuo ruolo.", "se_stesso")
                c.execute("UPDATE utenti SET ruolo = ? WHERE id = ?", (body.ruolo, uid))
                db.evento(c, "ruolo", uid, a["id"], body.ruolo)
            if "quota_ia" in campi:
                c.execute("UPDATE utenti SET quota_ia = ? WHERE id = ?", (body.quota_ia, uid))
                db.evento(c, "quota_ia", uid, a["id"], "predefinita" if body.quota_ia is None else str(body.quota_ia))
            if "nome" in campi and body.nome:
                c.execute("UPDATE utenti SET nome = ? WHERE id = ?", (body.nome.strip(), uid))
            if "azienda" in campi and body.azienda is not None:
                c.execute("UPDATE utenti SET azienda = ? WHERE id = ?", (body.azienda.strip(), uid))
            c.execute("UPDATE utenti SET aggiornato = ? WHERE id = ?", (iso(), uid))
        return json_ok()

    @app.post("/api/admin/utenti/{uid}/{azione}")
    def admin_azione(uid: int, azione: Literal["approva", "rifiuta", "sospendi", "riattiva", "link-password", "esci-ovunque"],
                     request: Request, body: Motivo | None = None, a: sqlite3.Row = Depends(richiede_admin)) -> dict[str, Any]:
        body = body or Motivo()
        with db.transazione() as c:
            u = utente_o_404(c, uid)
            if uid == a["id"] and azione in ("rifiuta", "sospendi"):
                raise Errore(409, "Non puoi sospendere il tuo account.", "se_stesso")
            if azione == "approva":
                err = reg.approva(c, uid, a["id"], base_url(request))
            elif azione == "rifiuta":
                err = reg.rifiuta(c, uid, a["id"], body.motivo.strip())
            elif azione == "sospendi":
                err = reg.sospendi(c, uid, a["id"], body.motivo.strip())
            elif azione == "riattiva":
                if u["hash_password"] is None:
                    err = "L'utente non ha ancora una password: mandagli un link per impostarla."
                else:
                    c.execute("UPDATE utenti SET stato = 'attivo', motivo_stato = '', aggiornato = ? WHERE id = ?", (iso(), uid))
                    db.evento(c, "riattivato", uid, a["id"])
                    err = None
            elif azione == "link-password":
                link = link_password(c, uid, 72, request)
                db.evento(c, "link_password", uid, a["id"], "inviato via email" if body.invia else "consegnato a mano")
                if body.invia:
                    posta.invia(u["email"], "MAGIC HS: imposta la password",
                                f"Ciao {u['nome']},\n\nper scegliere una nuova password apri questo link (vale 3 giorni):\n{link}")
                return json_ok(link=link, inviata=body.invia and posta.configurata)
            else:
                S.chiudi_tutte(c, uid)
                db.evento(c, "sessioni_chiuse", uid, a["id"])
                err = None
            if err:
                raise Errore(409, err, "azione")
        return json_ok()

    @app.delete("/api/admin/utenti/{uid}")
    def admin_elimina(uid: int, a: sqlite3.Row = Depends(richiede_admin)) -> dict[str, Any]:
        if uid == a["id"]:
            raise Errore(409, "Non puoi eliminare il tuo account.", "se_stesso")
        try:
            pag.annulla_abbonamento(uid)          # niente addebiti per un account che non esiste piu'
        except ErrorePagamento:
            raise Errore(502, "Non riesco ad annullare l'abbonamento su Stripe: annullalo dalla dashboard di Stripe e riprova.", "stripe")
        with db.transazione() as c:
            u = utente_o_404(c, uid)
            c.execute("DELETE FROM utenti WHERE id = ?", (uid,))
            db.evento(c, "utente_eliminato", None, a["id"], f"{u['email']} ({u['nome']})")
        return json_ok()

    @app.put("/api/admin/utenti/{uid}/pro")
    def admin_concedi_pro(uid: int, body: ConcessionePro, a: sqlite3.Row = Depends(richiede_admin)) -> dict[str, Any]:
        fino = None
        if body.fino:
            try:
                giorno = datetime.strptime(body.fino, "%Y-%m-%d")
            except ValueError:
                raise Errore(422, "Data non valida.", "data")
            # fino alla fine di quel giorno, ora italiana
            fino = (giorno + timedelta(days=1)).replace(tzinfo=ZoneInfo(cfg.fuso)).astimezone(timezone.utc)
            if fino <= datetime.now(timezone.utc):
                raise Errore(422, "La data deve essere nel futuro.", "data")
        with db.transazione() as c:
            utente_o_404(c, uid)
            pag.concedi_manuale(c, uid, fino)
            db.evento(c, "pro_manuale", uid, a["id"], f"Pro concesso fino al {body.fino}" if fino else "concessione del Pro tolta")
            return json_ok(piano=pag.stato(c, uid))

    @app.get("/api/admin/pagamenti")
    def admin_pagamenti(a: sqlite3.Row = Depends(richiede_admin)) -> dict[str, Any]:
        with db.connessione() as c:
            out = pag.elenco(c)
            imp = db.impostazioni(c)
        out.update({"attivi": pag.attivi, "prova": pag.modalita_prova, "webhook": bool(cfg.stripe_firma), "tasse": cfg.stripe_tasse,
                    "venditore": bool(cfg.venditore and cfg.venditore_email), "prezzi": imp["prezzi"],
                    "gratuito": imp["quota_predefinita"], "tetto_giorno": imp["pro_tetto_giorno"],
                    "webhook_url": (cfg.url_pubblico or "").rstrip("/") + "/api/stripe/webhook" if cfg.url_pubblico else ""})
        return out

    @app.get("/api/admin/impostazioni")
    def admin_impostazioni(a: sqlite3.Row = Depends(richiede_admin)) -> dict[str, Any]:
        with db.connessione() as c:
            return db.impostazioni(c)

    @app.put("/api/admin/impostazioni")
    def admin_salva_impostazioni(body: Impostazioni, a: sqlite3.Row = Depends(richiede_admin)) -> dict[str, Any]:
        def pulisci(lista: list[str]) -> list[str]:
            out = []
            for d in lista:
                d = d.strip().lower().lstrip("@")
                if not d:
                    continue
                if not RE_DOMINIO.match(d):
                    raise Errore(422, f"Dominio non valido: {d}", "dominio")
                if d not in out:
                    out.append(d)
            return out
        valori = body.model_dump(exclude_none=True)
        if body.domini_approvati is not None:
            valori["domini_approvati"] = pulisci(body.domini_approvati)
        if body.domini_bloccati is not None:
            valori["domini_bloccati"] = pulisci(body.domini_bloccati)
        for k, v in (valori.get("prezzi") or {}).items():
            if 0 < v < 50:
                raise Errore(422, "Un prezzo deve essere almeno 0,50 € (oppure 0 per non vendere quel piano).", "prezzo")
        with db.transazione() as c:
            db.salva_impostazioni(c, valori)
            db.evento(c, "impostazioni", autore_id=a["id"], dettagli=json.dumps(valori, ensure_ascii=False))
        return json_ok(impostazioni=valori)

    @app.get("/api/admin/eventi")
    def admin_eventi(limite: int = 200, a: sqlite3.Row = Depends(richiede_admin)) -> dict[str, Any]:
        with db.connessione() as c:
            righe = c.execute("SELECT e.*, u.email AS utente_email, u.nome AS utente_nome, x.nome AS autore_nome FROM eventi e "
                              "LEFT JOIN utenti u ON u.id = e.utente_id LEFT JOIN utenti x ON x.id = e.autore_id "
                              "ORDER BY e.id DESC LIMIT ?", (max(1, min(limite, 1000)),)).fetchall()
        return {"eventi": [dict(r) for r in righe]}

    @app.get("/api/admin/posta")
    def admin_posta(a: sqlite3.Row = Depends(richiede_admin)) -> dict[str, Any]:
        return {"configurata": posta.configurata, "messaggi": posta.in_uscita()}

    @app.get("/api/admin/uso")
    def admin_uso(a: sqlite3.Row = Depends(richiede_admin)) -> dict[str, Any]:
        with db.connessione() as c:
            righe = c.execute("SELECT x.mese, x.utente_id, u.nome, u.email, COUNT(*) AS richieste, "
                              "SUM(CASE WHEN x.esito = 'ok' THEN 1 ELSE 0 END) AS riuscite, SUM(x.token_in) AS token_in, "
                              "SUM(x.token_out) AS token_out FROM uso_ia x LEFT JOIN utenti u ON u.id = x.utente_id "
                              "GROUP BY x.mese, x.utente_id ORDER BY x.mese DESC, richieste DESC LIMIT 500").fetchall()
        return {"uso": [dict(r) for r in righe]}

    @app.get("/api/admin/dati")
    def admin_dati(a: sqlite3.Row = Depends(richiede_admin)) -> dict[str, Any]:
        return {"attiva": dati.attiva(), "versioni": dati.elenco(), "in_corso": dati.in_corso, "ultimi": dati.ultimi(),
                "automatico": cfg.aggiornamento_automatico, "fonte": cfg.fonte_url, "prossimo": dati.da_fare(),
                "backup": copie.elenco(), "backup_copie": cfg.backup_copie}

    @app.post("/api/admin/backup")
    def admin_crea_backup(a: sqlite3.Row = Depends(richiede_admin)) -> dict[str, Any]:
        try:
            f = copie.crea()
        except ErroreBackup as e:
            raise Errore(409, f"Backup non riuscito: {e}.", "backup")
        with db.transazione() as c:
            db.evento(c, "backup_creato", autore_id=a["id"], dettagli=f.name)
        return json_ok(nome=f.name)

    @app.get("/api/admin/backup/{nome}")
    def admin_scarica_backup(nome: str, a: sqlite3.Row = Depends(richiede_admin)) -> FileResponse:
        f = copie.file(nome)
        if f is None:
            raise Errore(404, "Backup non trovato.", "non_trovato")
        with db.transazione() as c:
            db.evento(c, "backup_scaricato", autore_id=a["id"], dettagli=nome)
        return FileResponse(f, media_type="application/zip", filename=nome)

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
        if editore() and condivisa is not None:
            try:
                condivisa.pubblica_dati(body.versione, dati.versioni / body.versione)
            except (OSError, ErroreCondivisa) as e:
                raise Errore(409, f"Versione in uso su questo PC, ma non riesco a pubblicarla nella cartella condivisa: {e}", "condivisa")
        with db.transazione() as c:
            db.evento(c, "dati_versione_attivata", autore_id=a["id"], dettagli=body.versione)
        return json_ok()

    # ------------------------------------------------------------------ programma sul PC: pannello dell'editore
    if locale:
        def serve_editore() -> Condivisa:
            if condivisa is None or not editore():
                raise Errore(409, "Da questo PC non si può scrivere nella cartella condivisa.", "condivisa")
            return condivisa

        @app.get("/api/admin/locale")
        def admin_locale(a: sqlite3.Row = Depends(richiede_admin)) -> dict[str, Any]:
            imp = condivisa.impostazioni() if condivisa else {}
            ia_imp = imp.get("ia") if isinstance(imp.get("ia"), dict) else {}
            chiave = str(ia_imp.get("chiave") or "")
            return {"condivisa": str(cfg.condivisa or ""), "raggiungibile": bool(condivisa and condivisa.raggiungibile()),
                    "editore": editore(), "scrivibile": scrivibile(), "utente": utente_pc, "editori": editori(imp),
                    "programma": {"in_uso": __version__, "pubblicato": condivisa.versione_programma() if condivisa else ""},
                    "dati": {"in_uso": dati.attiva() or "", "pubblicati": condivisa.dati_pubblicati() if condivisa else ""},
                    "ia": {"fornitore": str(ia_imp.get("fornitore") or ""), "url": str(ia_imp.get("url") or ""),
                           "modello": str(ia_imp.get("modello") or ""), "modello_rapido": str(ia_imp.get("modello_rapido") or ""),
                           "chiave": ("…" + chiave[-4:]) if len(chiave) > 8 else ("impostata" if chiave else "")},
                    "attiva": ia.disponibile, "ia_nome": cfg.ia_nome,
                    "quota": imp.get("quota", 50) if imp else 50, "aggiornate": imp.get("aggiornate", ""), "da": imp.get("da", "")}

        @app.put("/api/admin/locale/ia")
        def admin_locale_ia(body: ImpostazioniIA, a: sqlite3.Row = Depends(richiede_admin)) -> dict[str, Any]:
            cond = serve_editore()
            imp = cond.impostazioni()
            vecchia = imp.get("ia") if isinstance(imp.get("ia"), dict) else {}
            chiave = str(vecchia.get("chiave") or "") if body.chiave is None else body.chiave.strip()
            url = body.url.strip().rstrip("/")
            if url and not re.match(r"^https?://[^\s/]+(/\S*)?$", url):
                raise Errore(422, "Indirizzo del servizio non valido: deve iniziare con https://.", "url")
            if body.fornitore == "openai" and not url:
                raise Errore(422, "Indica l'indirizzo del servizio (per Azure OpenAI: https://<risorsa>.openai.azure.com/openai/v1).", "url")
            if body.fornitore == "openai" and not body.modello.strip():
                raise Errore(422, "Indica il modello (per Azure OpenAI: il nome della distribuzione).", "modello")
            if body.fornitore in ("gemini", "anthropic") and not chiave:
                raise Errore(422, "Inserisci la chiave del servizio.", "chiave")
            nuove = {**imp, "ia": {"fornitore": body.fornitore, "chiave": chiave if body.fornitore else "",
                                   "url": url if body.fornitore else "", "modello": body.modello.strip() if body.fornitore else "",
                                   "modello_rapido": body.modello_rapido.strip() if body.fornitore else ""},
                     "quota": body.quota, "aggiornate": iso(), "da": a["nome"]}
            try:
                cond.salva_impostazioni(nuove)
            except OSError as e:
                raise Errore(409, f"Non riesco a scrivere nella cartella condivisa: {e}", "condivisa")
            applica_impostazioni()
            with db.transazione() as c:
                db.evento(c, "impostazioni_ia", autore_id=a["id"], dettagli=body.fornitore or "nessuna")
            return json_ok(attiva=ia.disponibile, ia_nome=cfg.ia_nome)

        @app.put("/api/admin/locale/editori")
        def admin_locale_editori(body: Editori, a: sqlite3.Row = Depends(richiede_admin)) -> dict[str, Any]:
            cond = serve_editore()
            elenco: list[str] = []
            for x in body.editori:
                n = x.strip().lower()
                if not RE_UTENTE.match(n):
                    raise Errore(422, f"Nome utente di Windows non valido: «{x.strip()[:64]}».", "editori")
                if n not in elenco:
                    elenco.append(n)
            try:
                cond.salva_impostazioni({**cond.impostazioni(), "editori": elenco})
            except OSError as e:
                raise Errore(409, f"Non riesco a scrivere nella cartella condivisa: {e}", "condivisa")
            aggiorna_ruolo()
            with db.transazione() as c:
                db.evento(c, "editori", autore_id=a["id"], dettagli=", ".join(elenco))
            return json_ok(editori=elenco, editore=editore())

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

        @app.post("/api/admin/locale/programma")
        async def admin_locale_programma(file: UploadFile = File(...), a: sqlite3.Row = Depends(richiede_admin)) -> dict[str, Any]:
            cond = serve_editore()
            dest = dati.lavoro / f"programma-{secrets.token_hex(6)}.zip"
            try:
                totale = 0
                with open(dest, "wb") as f:
                    while blocco := await file.read(1 << 20):
                        totale += len(blocco)
                        if totale > 400 * 1024 * 1024:
                            raise Errore(413, "File troppo grande (massimo 400 MB).", "troppo_grande")
                        f.write(blocco)
                versione = await run_in_threadpool(cond.pubblica_programma, dest)
            except ErroreCondivisa as e:
                raise Errore(422, f"Il file non va bene: {e}.", "pacchetto")
            except OSError as e:
                raise Errore(409, f"Non riesco a scrivere nella cartella condivisa: {e}", "condivisa")
            finally:
                dest.unlink(missing_ok=True)
            with db.transazione() as c:
                db.evento(c, "programma_pubblicato", autore_id=a["id"], dettagli=versione)
            return json_ok(versione=versione)

    return app


__all__ = ["crea_app", "EMAIL_LOCALE"]
