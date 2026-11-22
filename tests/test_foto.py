"""Classificazione dalla foto della merce (Classifica, tasto con la macchina fotografica): la foto va al servizio IA tra il
contesto e la merce, nel formato di ciascun fornitore; il server ne controlla formato e dimensione, la conta come una
classificazione e non la salva da nessuna parte."""
from __future__ import annotations

import base64

import httpx

from conftest import FintoClaude, Sito
from test_fornitori_ia import CONTESTO, VOCI, sito_con_ia

# inizio di un file JPEG con un segno riconoscibile nei dati (che non deve finire nel database)
JPEG = b"\xff\xd8\xff\xe0\x00\x10JFIF\x00" + b"SEGNO-DELLA-FOTO" * 8 + b"\xff\xd9"
FOTO = {"tipo": "image/jpeg", "dati": base64.b64encode(JPEG).decode()}
PNG = b"\x89PNG\r\n\x1a\n" + b"\0" * 100


def richiesta(**altro) -> dict:
    return {"contesto": CONTESTO, "prompt": "MERCE: nella foto", "livello": "rapido", "schema": "voci", "operazione": "foto-1",
            "immagine": FOTO, **altro}


def test_gemini_foto_tra_contesto_e_merce(ambiente):
    s, a = sito_con_ia(ambiente, fornitore="gemini", chiave="g")
    s.claude.risposte = [FintoClaude.testo(VOCI)]
    assert a.post("/api/ia", json=richiesta()).status_code == 200
    parti = s.claude.richieste[-1]["corpo"]["contents"][0]["parts"]
    assert parti == [{"text": CONTESTO}, {"inlineData": {"mimeType": "image/jpeg", "data": FOTO["dati"]}}, {"text": "MERCE: nella foto"}]


def test_claude_foto_dopo_il_contesto_in_cache(ambiente):
    s, a = sito_con_ia(ambiente, fornitore="anthropic", chiave="k")
    s.claude.risposte = [FintoClaude.testo(VOCI), FintoClaude.testo(VOCI)]
    assert a.post("/api/ia", json=richiesta()).status_code == 200
    blocchi = s.claude.richieste[-1]["corpo"]["messages"][0]["content"]
    assert blocchi[0]["cache_control"] == {"type": "ephemeral"} and blocchi[0]["text"] == CONTESTO
    assert blocchi[1] == {"type": "image", "source": {"type": "base64", "media_type": "image/jpeg", "data": FOTO["dati"]}}
    assert blocchi[2] == {"type": "text", "text": "MERCE: nella foto"}
    # senza contesto: la foto e poi la merce
    assert a.post("/api/ia", json=richiesta(contesto="")).status_code == 200
    assert [b["type"] for b in s.claude.richieste[-1]["corpo"]["messages"][0]["content"]] == ["image", "text"]


def test_openai_foto_come_indirizzo_data(ambiente):
    s, a = sito_con_ia(ambiente, fornitore="openai", url="https://api.openai.com/v1", modello="gpt-prova", chiave="o")
    s.claude.risposte = [FintoClaude.testo(VOCI)]
    assert a.post("/api/ia", json=richiesta()).status_code == 200
    parti = s.claude.richieste[-1]["corpo"]["messages"][1]["content"]
    assert parti == [{"type": "text", "text": CONTESTO},
                     {"type": "image_url", "image_url": {"url": "data:image/jpeg;base64," + FOTO["dati"]}},
                     {"type": "text", "text": "MERCE: nella foto"}]


def test_foto_controllata_e_mai_salvata(sito: Sito):
    capo = sito.capo()
    sito.claude.risposte = [FintoClaude.testo(VOCI), FintoClaude.testo(VOCI)]
    errore = lambda **x: capo.post("/api/ia", json=richiesta(**x)).json().get("codice")
    # formato, base64, primi byte e dimensione: la richiesta non arriva al servizio
    assert errore(immagine={"tipo": "image/gif", "dati": FOTO["dati"]}) == "dati_non_validi"
    assert errore(immagine={"tipo": "image/jpeg", "dati": "non è base64!" * 3}) == "immagine_non_valida"
    assert errore(immagine={"tipo": "image/jpeg", "dati": base64.b64encode(PNG).decode()}) == "immagine_non_valida"
    assert errore(immagine={"tipo": "image/png", "dati": base64.b64encode(PNG).decode()}) is None        # PNG vero: va
    assert errore(immagine={"tipo": "image/jpeg", "dati": base64.b64encode(JPEG[:3] + b"x" * (3 * 1024 * 1024)).decode()}) == "immagine_non_valida"
    assert errore(immagine={"tipo": "image/jpeg", "dati": "A" * 4_300_000}) == "dati_non_validi"
    r = capo.post("/api/ia", json=richiesta(immagine={"tipo": "image/jpeg", "dati": "QUJD" * 10}))
    assert r.status_code == 422 and "foto" in r.json()["errore"]
    # una traduzione non porta foto
    assert capo.post("/api/ia", json=richiesta(tipo="traduzione", schema="traduzione")).json()["codice"] == "bad_request"
    assert capo.post("/api/ia", json=richiesta()).status_code == 200
    assert len(sito.claude.richieste) == 2
    # la foto non resta: né nel database né nel registro
    file_db = list((sito.cartella / "dati").glob("taric.db*"))          # anche il -wal, non ancora riportato nel database
    assert file_db
    for f in file_db:
        assert b"SEGNO-DELLA-FOTO" not in f.read_bytes() and FOTO["dati"][:40].encode() not in f.read_bytes()
    assert "SEGNO" not in str(capo.get("/api/admin/eventi").json())


def test_foto_conta_come_una_classificazione(sito: Sito):
    capo = sito.capo()
    luca = sito.collega(capo)
    capo.patch(f"/api/admin/utenti/{sito.id_di(capo, 'luca@azienda.it')}", json={"quota_ia": 1})
    sito.claude.risposte = [FintoClaude.testo(VOCI)] * 3
    for schema in ("voci", "scelta", "scelta"):                      # voci, scelta e ricontrollo con la stessa foto
        assert luca.post("/api/ia", json=richiesta(schema=schema)).status_code == 200
    assert luca.get("/api/io").json()["ia"]["usate"] == 1
    r = luca.post("/api/ia", json=richiesta(operazione="foto-2"))
    assert r.status_code == 429 and r.json()["codice"] == "quota_esaurita"
    # IA spenta per l'account: niente foto
    capo.patch(f"/api/admin/utenti/{sito.id_di(capo, 'luca@azienda.it')}", json={"quota_ia": 0})
    assert luca.post("/api/ia", json=richiesta(operazione="foto-3")).json()["codice"] == "ia_non_autorizzata"


def test_servizio_che_non_accetta_la_foto(ambiente):
    s, a = sito_con_ia(ambiente, fornitore="openai", url="https://api.groq.com/openai/v1", modello="solo-testo", chiave="o")
    no = lambda: httpx.Response(400, json={"error": {"message": "image input is not supported for this model"}})
    s.claude.risposte = [no(), no(), no()]                # schema, json, niente: sempre rifiutata
    r = a.post("/api/ia", json=richiesta())
    assert r.status_code == 422 and r.json()["codice"] == "immagine_non_accettata" and "a parole" in r.json()["errore"]
    # senza foto lo stesso errore resta quello generico
    s.claude.risposte = [no(), no(), no()]
    assert a.post("/api/ia", json=richiesta(immagine=None, operazione="t-2")).json()["codice"] == "upstream_error"
