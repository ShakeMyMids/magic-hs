"""Applicazione web MAGIC HS (FastAPI): pagine, API di accesso, profilo, IA e amministrazione."""
from __future__ import annotations

import hmac
import json
import logging
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

from . import sicurezza as S
from .backup import Backup, ErroreBackup
from .config import Config
from .dati import GestoreDati
from .db import Database, iso
from .ia import ErroreIA, ServizioIA, mese_corrente
from .posta import Posta
from .registrazioni import Registrazioni

log = logging.getLogger("taric")
STATIC = Path(__file__).with_name("static")
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


class Impostazioni(BaseModel):
    registrazione_aperta: bool
    approva_tutti: bool
    domini_approvati: list[str] = Field(max_length=200)
    domini_bloccati: list[str] = Field(max_length=500)
    quota_predefinita: int = Field(ge=0, le=100000)
    massimo_in_attesa: int = Field(ge=1, le=10000)


class Mese(BaseModel):
    mese: str = Field(default="", pattern=r"^(\d{4}-\d{2})?$")


class Versione(BaseModel):
    versione: str = Field(pattern=r"^\d{4}-\d{2}-01$")


# ------------------------------------------------------------------ applicazione
def crea_app(cfg: Config, client_ia: httpx.Client | None = None, pianificatore: bool = True) -> FastAPI:
    db = Database(cfg.dati / "taric.db")
    posta = Posta(cfg)
    reg = Registrazioni(db, posta)
    ia = ServizioIA(cfg, db, client_ia)
    dati = GestoreDati(cfg, db, posta)
    copie = Backup(cfg.dati, cfg.backup_copie)

    @asynccontextmanager
    async def vita(_app: FastAPI) -> AsyncIterator[None]:
        if pianificatore:
            dati.avvia_pianificatore(reg, copie)
        yield
        dati.ferma()

    app = FastAPI(title="MAGIC HS", docs_url=None, redoc_url=None, openapi_url=None, lifespan=vita)
    app.state.cfg, app.state.db, app.state.posta, app.state.dati, app.state.ia, app.state.reg = cfg, db, posta, dati, ia, reg
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
        if not ci_sono_admin(c0):
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
        resp.set_cookie(S.COOKIE_SESSIONE, gettone, max_age=durata if ricordami else None, httponly=True,
                        secure=cookie_sicuro(request), samesite="lax", path="/")

    def utente_corrente(request: Request) -> sqlite3.Row | None:
        with db.connessione() as c:
            return S.utente_da_sessione(c, request.cookies.get(S.COOKIE_SESSIONE))

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
    @app.middleware("http")
    async def protezioni(request: Request, call_next: Any) -> Response:
        if request.url.path.startswith("/api/") and request.method not in ("GET", "HEAD", "OPTIONS"):
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
                "aggiornamento": (dati.in_corso or {}).get("fase")}

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
            S.chiudi_sessione(c, request.cookies.get(S.COOKIE_SESSIONE))
        resp = JSONResponse(json_ok())
        resp.delete_cookie(S.COOKIE_SESSIONE, path="/")
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
                       "usate": ia.usate(c, u["id"]), "mese": mese_corrente()},
                "dati": {"versione": v, "aggiornamento": (dati.in_corso or {}).get("fase")}}

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
            S.chiudi_tutte(c, u["id"], tranne=request.cookies.get(S.COOKIE_SESSIONE))
            db.evento(c, "password_cambiata", u["id"], u["id"])
        return json_ok()

    @app.post("/api/io/esci-ovunque")
    def esci_ovunque(request: Request, u: sqlite3.Row = Depends(richiede_utente)) -> dict[str, Any]:
        with db.transazione() as c:
            S.chiudi_tutte(c, u["id"], tranne=request.cookies.get(S.COOKIE_SESSIONE))
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
            return JSONResponse({"errore": MESSAGGI_IA.get(e.codice, MESSAGGI_IA["upstream_error"]), "codice": e.codice},
                                status_code=e.stato_http)

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
        with db.transazione() as c:
            u = utente_o_404(c, uid)
            c.execute("DELETE FROM utenti WHERE id = ?", (uid,))
            db.evento(c, "utente_eliminato", None, a["id"], f"{u['email']} ({u['nome']})")
        return json_ok()

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
        valori = body.model_dump()
        valori["domini_approvati"] = pulisci(body.domini_approvati)
        valori["domini_bloccati"] = pulisci(body.domini_bloccati)
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
        with db.transazione() as c:
            db.evento(c, "dati_versione_attivata", autore_id=a["id"], dettagli=body.versione)
        return json_ok()

    return app


__all__ = ["crea_app"]
