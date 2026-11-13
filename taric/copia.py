"""Copia del database fuori da Render: una volta alla settimana un backup va in un archivio compatibile S3 (Backblaze B2,
Cloudflare R2, Amazon S3, Wasabi...), cosi' un guasto del disco o del servizio non porta via anche le copie.

Si attiva con le variabili d'ambiente del servizio (su Render: Environment):
  MAGIC_HS_COPIA_URL       indirizzo del contenitore (bucket), eventualmente con una cartella, per esempio
                           https://s3.eu-central-003.backblazeb2.com/magic-hs
  MAGIC_HS_COPIA_CHIAVE    identificativo della chiave di accesso (con il permesso di scrivere nel contenitore)
  MAGIC_HS_COPIA_SEGRETO   chiave segreta
  MAGIC_HS_COPIA_REGIONE   regione; facoltativa se si legge dall'indirizzo (s3.<regione>.…, Cloudflare R2: auto)
Le copie si chiamano magic-hs-copia-1.zip ... magic-hs-copia-8.zip e si sovrascrivono a giro: restano le ultime 8
settimane. Se l'invio non riesce si riprova dopo 6 ore. La richiesta e' firmata con AWS Signature Version 4, senza
librerie in piu'; il backup si scrive in un file a parte, fuori dall'elenco dei backup giornalieri."""
from __future__ import annotations

import datetime as dt
import hashlib
import hmac
import json
import logging
import re
import secrets
from typing import Any
from urllib.parse import quote, urlsplit

import httpx

from .config import Config
from .db import Database, da_iso, iso

log = logging.getLogger("taric.copia")
OGNI = dt.timedelta(days=7)              # una copia alla settimana
RIPROVA = dt.timedelta(hours=6)          # dopo un errore
GIRO = 8                                 # nomi a rotazione: restano le ultime 8 copie

# codici d'errore S3 piu' comuni -> cosa controllare
SPIEGAZIONI = {
    "InvalidAccessKeyId": "chiave di accesso sconosciuta: controlla MAGIC_HS_COPIA_CHIAVE",
    "SignatureDoesNotMatch": "chiave segreta sbagliata: controlla MAGIC_HS_COPIA_SEGRETO",
    "AuthorizationHeaderMalformed": "regione sbagliata: controlla MAGIC_HS_COPIA_REGIONE",
    "NoSuchBucket": "il contenitore indicato in MAGIC_HS_COPIA_URL non esiste",
    "AccessDenied": "la chiave non ha il permesso di scrivere nel contenitore",
    "InvalidBucketName": "nome del contenitore non valido in MAGIC_HS_COPIA_URL",
}


def _hmac(chiave: bytes, testo: str) -> bytes:
    return hmac.new(chiave, testo.encode(), hashlib.sha256).digest()


def firma_s3(metodo: str, url: str, regione: str, chiave: str, segreto: str, impronta_corpo: str,
             adesso: dt.datetime, intestazioni: dict[str, str] | None = None) -> dict[str, str]:
    """Intestazioni di una richiesta S3 firmata (AWS Signature Version 4, servizio «s3»); l'url ha il percorso gia'
    codificato, come lo invia httpx. Restituisce le intestazioni da mandare (senza host, che mette httpx)."""
    parti = urlsplit(url)
    data_ora = adesso.astimezone(dt.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    giorno = data_ora[:8]
    da_firmare = {k.lower(): " ".join(str(v).split()) for k, v in (intestazioni or {}).items()}
    da_firmare.update({"host": parti.netloc, "x-amz-content-sha256": impronta_corpo, "x-amz-date": data_ora})
    nomi = sorted(da_firmare)
    canonica = "\n".join([
        metodo, quote(parti.path or "/", safe="/~-._%"),
        "&".join(sorted(parti.query.split("&"))) if parti.query else "",
        "".join(f"{n}:{da_firmare[n]}\n" for n in nomi), ";".join(nomi), impronta_corpo])
    ambito = f"{giorno}/{regione}/s3/aws4_request"
    stringa = "\n".join(["AWS4-HMAC-SHA256", data_ora, ambito, hashlib.sha256(canonica.encode()).hexdigest()])
    k = _hmac(_hmac(_hmac(_hmac(("AWS4" + segreto).encode(), giorno), regione), "s3"), "aws4_request")
    firma = hmac.new(k, stringa.encode(), hashlib.sha256).hexdigest()
    return {**{n: da_firmare[n] for n in nomi if n != "host"},
            "Authorization": f"AWS4-HMAC-SHA256 Credential={chiave}/{ambito}, SignedHeaders={';'.join(nomi)}, Signature={firma}"}


def regione_da_url(url: str) -> str:
    """La regione scritta nell'indirizzo: s3.<regione>.backblazeb2.com, <bucket>.s3.<regione>.amazonaws.com,
    s3.<regione>.wasabisys.com; Cloudflare R2 vuole «auto». Altrimenti us-east-1, il valore predefinito di S3."""
    host = (urlsplit(url).hostname or "").lower()
    if host.endswith(".r2.cloudflarestorage.com"):
        return "auto"
    m = re.search(r"(?:^|\.)s3[.-]([a-z]{2}(?:-[a-z]+)+-\d{1,3})\.", host)
    return m.group(1) if m else "us-east-1"


def indirizzo_valido(url: str) -> bool:
    """https, oppure http solo sul computer stesso (per esempio MinIO nelle prove)."""
    p = urlsplit(url)
    return bool(p.hostname) and (p.scheme == "https" or (p.scheme == "http" and p.hostname in ("localhost", "127.0.0.1")))


def _spiega(codice_http: int, testo: str) -> str:
    codice = re.search(r"<Code>([^<]{1,80})</Code>", testo)
    messaggio = re.search(r"<Message>([^<]{1,300})</Message>", testo)
    c = codice.group(1) if codice else ""
    if c in SPIEGAZIONI:
        return f"{SPIEGAZIONI[c]} (risposta {codice_http} {c})"
    dettaglio = c + (": " + messaggio.group(1) if messaggio else "") if c else " ".join(testo.split())[:200]
    return f"il servizio di archiviazione risponde {codice_http}" + (f" ({dettaglio})" if dettaglio else "")


class CopiaEsterna:
    def __init__(self, cfg: Config, db: Database, client: httpx.Client | None = None):
        self.url, self.chiave, self.segreto = cfg.copia_url, cfg.copia_chiave, cfg.copia_segreto
        self.regione = cfg.copia_regione or regione_da_url(self.url)
        self.cartella = cfg.dati / "copia-esterna"
        self.db = db
        self.client = client or httpx.Client(timeout=httpx.Timeout(300, connect=15))

    @property
    def configurata(self) -> bool:
        return bool(self.url or self.chiave or self.segreto)

    @property
    def attiva(self) -> bool:
        return bool(self.url and self.chiave and self.segreto) and indirizzo_valido(self.url)

    def problema(self) -> str:
        """Perche' la copia non e' attiva pur essendo configurata ("" = nessun problema)."""
        if not self.configurata or self.attiva:
            return ""
        mancano = [n for n, v in (("MAGIC_HS_COPIA_URL", self.url), ("MAGIC_HS_COPIA_CHIAVE", self.chiave),
                                  ("MAGIC_HS_COPIA_SEGRETO", self.segreto)) if not v]
        if mancano:
            return "Manca " + ", ".join(mancano) + " nelle variabili del servizio."
        return "MAGIC_HS_COPIA_URL deve cominciare con https://."

    def _letto(self) -> dict[str, Any]:
        with self.db.connessione() as c:
            r = c.execute("SELECT valore FROM impostazioni WHERE chiave = 'copia_esterna'").fetchone()
        try:
            return json.loads(r[0]) if r else {}
        except ValueError:
            return {}

    def stato(self) -> dict[str, Any]:
        s = self._letto()
        return {"attiva": self.attiva, "problema": self.problema(),
                "destinazione": self.url.split("//", 1)[-1] if self.attiva else "",
                "tentata": s.get("tentata"), "riuscita": s.get("riuscita"), "esito": s.get("esito"),
                "messaggio": s.get("messaggio", ""), "oggetto": s.get("oggetto", "")}

    def _segna(self, **kw: Any) -> None:
        s = self._letto()
        s.update(kw)
        with self.db.transazione() as c:
            c.execute("INSERT INTO impostazioni(chiave, valore) VALUES ('copia_esterna', ?) "
                      "ON CONFLICT(chiave) DO UPDATE SET valore = excluded.valore", (json.dumps(s),))

    def da_fare(self, adesso: dt.datetime | None = None) -> bool:
        """Una copia alla settimana; dopo un errore si riprova passate 6 ore."""
        if not self.attiva:
            return False
        adesso = adesso or dt.datetime.now(dt.timezone.utc)
        s = self._letto()
        if s.get("esito") == "errore" and s.get("tentata") and adesso - da_iso(s["tentata"]) < RIPROVA:
            return False
        return not s.get("riuscita") or adesso - da_iso(s["riuscita"]) >= OGNI

    def invia(self, archivio: bytes, adesso: dt.datetime | None = None) -> str:
        """Carica un backup (.zip) nel contenitore; restituisce il nome usato. Solleva RuntimeError se non riesce."""
        adesso = adesso or dt.datetime.now(dt.timezone.utc)
        nome = f"magic-hs-copia-{adesso.isocalendar()[1] % GIRO + 1}.zip"
        url = f"{self.url}/{nome}"
        intest = firma_s3("PUT", url, self.regione, self.chiave, self.segreto, hashlib.sha256(archivio).hexdigest(), adesso,
                          {"content-type": "application/zip"})
        try:
            r = self.client.put(url, content=archivio, headers=intest)
        except httpx.HTTPError as e:
            raise RuntimeError(f"il servizio di archiviazione non risponde ({type(e).__name__})") from None
        if r.status_code >= 300:
            raise RuntimeError(_spiega(r.status_code, r.text[:4000]))
        return nome

    def esegui(self, backup: Any) -> dict[str, Any]:
        """Scrive un backup del database in un file a parte, lo manda fuori e segna l'esito (Gestione › Dati TARIC)."""
        if not self.attiva:
            return self.stato()
        self.cartella.mkdir(mode=0o700, parents=True, exist_ok=True)
        f = self.cartella / f"copia-{secrets.token_hex(4)}.zip"
        try:
            backup.scrivi(f)
            dimensione = f.stat().st_size
            nome = self.invia(f.read_bytes())
        except Exception as e:                       # qualunque problema: si riprova dopo RIPROVA
            log.warning("copia esterna non riuscita: %s", e)
            self._segna(tentata=iso(), esito="errore", messaggio=str(e)[:400])
        else:
            log.info("copia esterna: %s (%d byte)", nome, dimensione)
            ora = iso()
            self._segna(tentata=ora, riuscita=ora, esito="ok", messaggio="", oggetto=nome, dimensione=dimensione)
        finally:
            f.unlink(missing_ok=True)
        return self.stato()

    def automatica(self, backup: Any) -> None:
        """Compito del pianificatore."""
        if self.da_fare():
            self.esegui(backup)


__all__ = ["CopiaEsterna", "firma_s3", "regione_da_url"]
