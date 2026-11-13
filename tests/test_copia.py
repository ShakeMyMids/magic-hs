"""Copia del database fuori da Render (taric/copia.py): firma S3, invio settimanale, Gestione."""
from __future__ import annotations

import datetime as dt
import hashlib
import io
import sqlite3
import zipfile

import httpx
from conftest import CAPO, FintoS3, Sito
from taric.backup import Backup
from taric.config import carica
from taric.copia import CopiaEsterna, firma_s3, regione_da_url
from taric.db import Database

URL = "https://s3.eu-central-003.backblazeb2.com/magic-hs"
VARIABILI = {"MAGIC_HS_COPIA_URL": URL, "MAGIC_HS_COPIA_CHIAVE": "CHIAVE-B2", "MAGIC_HS_COPIA_SEGRETO": "segreto/di+prova"}


def test_firma_come_la_documentazione_aws():
    # esempio «GET Object» della documentazione di AWS Signature Version 4 (Amazon S3)
    h = firma_s3("GET", "https://examplebucket.s3.amazonaws.com/test.txt", "us-east-1", "AKIAIOSFODNN7EXAMPLE",
                 "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY", hashlib.sha256(b"").hexdigest(),
                 dt.datetime(2013, 5, 24, tzinfo=dt.timezone.utc), {"Range": "bytes=0-9"})
    assert h["Authorization"] == (
        "AWS4-HMAC-SHA256 Credential=AKIAIOSFODNN7EXAMPLE/20130524/us-east-1/s3/aws4_request, "
        "SignedHeaders=host;range;x-amz-content-sha256;x-amz-date, "
        "Signature=f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41")
    assert h["x-amz-date"] == "20130524T000000Z" and "host" not in h


def test_firma_come_botocore():
    # firme calcolate con botocore (la libreria di AWS) per gli stessi PUT
    corpo = b"PK\x03\x04 finto zip" * 50
    adesso = dt.datetime(2026, 11, 13, 21, 30, 5, tzinfo=dt.timezone.utc)
    for url, regione, attesa in (
            ("https://s3.eu-central-003.backblazeb2.com/magic-hs/magic-hs-copia-3.zip", "eu-central-003",
             "55657bb7e46d7d60ba6eb865ecc56db15e84842a9764279fe5edb16e595acddd"),
            ("https://abc123.r2.cloudflarestorage.com/backup%20aziendali/magic-hs-copia-3.zip", "auto",
             "7cbd148423ec0fd9aeeccca1f43b5dc4eb63411010c0683c6a3841b24704b181")):
        h = firma_s3("PUT", url, regione, "KEYID", "SEGRETO/xyz+", hashlib.sha256(corpo).hexdigest(), adesso,
                     {"content-type": "application/zip"})
        assert h["Authorization"].endswith("Signature=" + attesa), url


def test_regione_dall_indirizzo():
    assert regione_da_url(URL) == "eu-central-003"
    assert regione_da_url("https://archivio.s3.eu-south-1.amazonaws.com") == "eu-south-1"
    assert regione_da_url("https://s3.eu-central-2.wasabisys.com/magic") == "eu-central-2"
    assert regione_da_url("https://abc123.r2.cloudflarestorage.com/magic-hs") == "auto"
    assert regione_da_url("https://archivio.esempio.it/magic") == "us-east-1"


def test_configurazione(ambiente):
    cfg = carica({**VARIABILI, "MAGIC_HS_COPIA_URL": URL + "/"})
    assert cfg.copia_url == URL and cfg.copia_chiave == "CHIAVE-B2"
    assert "segreto" not in repr(cfg).split("extra=")[0]           # la chiave segreta non finisce nei log
    assert CopiaEsterna(cfg, None).regione == "eu-central-003"     # type: ignore[arg-type]
    assert CopiaEsterna(carica({**VARIABILI, "MAGIC_HS_COPIA_REGIONE": "eu-west-1"}), None).regione == "eu-west-1"  # type: ignore[arg-type]


def test_spenta_senza_variabili(sito: Sito):
    capo = sito.capo()
    s = capo.get("/api/admin/dati").json()["copia_esterna"]
    assert s["attiva"] is False and s["problema"] == "" and s["riuscita"] is None
    r = capo.post("/api/admin/copia-esterna")
    assert r.status_code == 409 and r.json()["codice"] == "copia_spenta"
    sito.riavvia(MAGIC_HS_COPIA_URL=URL, MAGIC_HS_COPIA_CHIAVE="CHIAVE-B2")
    capo = sito.accedi(CAPO)
    s = capo.get("/api/admin/dati").json()["copia_esterna"]
    assert not s["attiva"] and "MAGIC_HS_COPIA_SEGRETO" in s["problema"]
    assert capo.get("/api/admin/riepilogo").json()["copia_esterna"] == "spenta"
    sito.riavvia(MAGIC_HS_COPIA_URL="http://s3.esempio.it/magic", MAGIC_HS_COPIA_SEGRETO="x")
    capo = sito.accedi(CAPO)
    assert "https://" in capo.post("/api/admin/copia-esterna").json()["errore"]
    assert not sito.s3.richieste


def test_copia_adesso_da_gestione(sito: Sito):
    capo = sito.capo()
    luca = sito.collega(capo)
    assert luca.post("/api/admin/copia-esterna").status_code == 403
    capo.put("/api/preferiti/6403999610", json={"nota": "scarpe"})
    giornalieri = sorted((sito.cartella / "dati" / "backup").glob("*.zip"))
    sito.riavvia(**VARIABILI)
    capo = sito.accedi(CAPO)

    r = capo.post("/api/admin/copia-esterna")
    assert r.status_code == 200, r.text
    s = r.json()
    assert s["esito"] == "ok" and s["destinazione"] == URL.split("//")[1] and s["riuscita"]
    settimana = dt.datetime.now(dt.timezone.utc).isocalendar()[1]
    percorso = f"/magic-hs/magic-hs-copia-{settimana % 8 + 1}.zip"
    assert s["oggetto"] == percorso.rsplit("/", 1)[1] and list(sito.s3.oggetti) == [percorso]
    req = sito.s3.richieste[-1]
    assert req.headers["content-type"] == "application/zip" and "segreto" not in str(req.headers)

    # nell'archivio c'e' il database vero, con il preferito di prima
    with zipfile.ZipFile(io.BytesIO(sito.s3.oggetti[percorso])) as z:
        assert z.namelist() == ["taric.db"]
        f = sito.cartella / "da-controllare.db"
        f.write_bytes(z.read("taric.db"))
    c = sqlite3.connect(f)
    assert c.execute("SELECT codice FROM preferiti").fetchall() == [("6403999610",)]
    c.close()
    # nessun file in piu' sul disco: i backup giornalieri restano quelli di prima
    assert sorted((sito.cartella / "dati" / "backup").glob("*.zip")) == giornalieri
    assert not list((sito.cartella / "dati" / "copia-esterna").iterdir())

    eventi = capo.get("/api/admin/eventi").json()["eventi"]
    assert eventi[0]["tipo"] == "copia_esterna" and eventi[0]["dettagli"].endswith(percorso)
    assert capo.get("/api/admin/dati").json()["copia_esterna"]["esito"] == "ok"
    assert capo.get("/api/admin/riepilogo").json()["copia_esterna"] == ""


def test_errori_spiegati(sito: Sito):
    capo = sito.capo()
    sito.riavvia(**{**VARIABILI, "MAGIC_HS_COPIA_SEGRETO": "sbagliato"})
    capo = sito.accedi(CAPO)
    r = capo.post("/api/admin/copia-esterna")
    assert r.status_code == 502 and r.json()["codice"] == "copia_non_riuscita"
    assert "MAGIC_HS_COPIA_SEGRETO" in r.json()["errore"] and "SignatureDoesNotMatch" in r.json()["errore"]
    s = capo.get("/api/admin/dati").json()["copia_esterna"]
    assert s["esito"] == "errore" and s["riuscita"] is None and "sbagliato" not in s["messaggio"]
    assert capo.get("/api/admin/riepilogo").json()["copia_esterna"] == "errore"
    assert capo.get("/api/admin/eventi").json()["eventi"][0]["tipo"] == "copia_esterna_errore"

    sito.riavvia(**VARIABILI)
    capo = sito.accedi(CAPO)
    sito.s3.guasto = "NoSuchBucket"
    assert "non esiste" in capo.post("/api/admin/copia-esterna").json()["errore"]
    sito.s3.guasto = ""
    assert capo.post("/api/admin/copia-esterna").json()["esito"] == "ok"


def test_una_alla_settimana_e_nuovo_tentativo_dopo_sei_ore(sito: Sito):
    sito.capo()
    sito.riavvia(**VARIABILI)
    copie = Backup(sito.cfg.dati)
    fuori = CopiaEsterna(sito.cfg, sito.app.state.db, httpx.Client(transport=httpx.MockTransport(sito.s3)))
    ora = dt.datetime.now(dt.timezone.utc)
    assert fuori.da_fare(ora)                                    # mai fatta
    sito.s3.guasto = "AccessDenied"
    fuori.automatica(copie)
    assert fuori.stato()["esito"] == "errore" and "permesso di scrivere" in fuori.stato()["messaggio"]
    assert not fuori.da_fare(ora + dt.timedelta(hours=5))        # dopo un errore si aspetta
    assert fuori.da_fare(ora + dt.timedelta(hours=7))
    sito.s3.guasto = ""
    fuori.esegui(copie)                                          # come dal tasto in Gestione
    assert fuori.stato()["esito"] == "ok" and len(sito.s3.oggetti) == 1
    assert not fuori.da_fare(ora + dt.timedelta(days=6))
    assert fuori.da_fare(ora + dt.timedelta(days=7, minutes=1))
    assert not CopiaEsterna(carica({"TARIC_DATI": str(sito.cfg.dati)}), sito.app.state.db).da_fare()   # spenta


def test_nomi_a_rotazione(ambiente, tmp_path):
    cfg = carica({**VARIABILI, "TARIC_DATI": str(tmp_path / "dati")})
    s3 = FintoS3()
    fuori = CopiaEsterna(cfg, Database(cfg.dati / "taric.db"), httpx.Client(transport=httpx.MockTransport(s3)))
    inizio = dt.datetime(2026, 1, 5, 10, tzinfo=dt.timezone.utc)          # lunedi' della settimana 2
    nomi = [fuori.invia(b"zip", inizio + dt.timedelta(weeks=i)) for i in range(10)]
    assert len(set(nomi)) == 8 and nomi[8] == nomi[0] and nomi[9] == nomi[1]
