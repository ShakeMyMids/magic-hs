"""Classificazione da foto e PDF della merce (Classifica, tasto con la macchina fotografica): fino a 3 allegati vanno al
servizio IA tra il contesto e la merce, nel formato di ciascun fornitore; il server ne controlla formato e dimensione, li
conta come una classificazione e non li salva da nessuna parte. Con gli allegati la risposta dice anche il testo letto e
le merci diverse che si vedono (schemi voci_foto e scelta_foto)."""
from __future__ import annotations

import base64

import httpx

from conftest import FintoClaude, Sito
from test_fornitori_ia import CONTESTO, VOCI, sito_con_ia

# inizio di un file JPEG con un segno riconoscibile nei dati (che non deve finire nel database)
JPEG = b"\xff\xd8\xff\xe0\x00\x10JFIF\x00" + b"SEGNO-DELLA-FOTO" * 8 + b"\xff\xd9"
FOTO = {"tipo": "image/jpeg", "dati": base64.b64encode(JPEG).decode()}
PNG = b"\x89PNG\r\n\x1a\n" + b"\0" * 100
PDF = {"tipo": "application/pdf", "dati": base64.b64encode(b"%PDF-1.7\n" + b"SCHEDA-TECNICA " * 10 + b"\n%%EOF").decode()}
VOCI_FOTO = '{"merce": "scarpe", "letto": "Upper: leather", "merci": [], "voci": [{"voce": "6403", "motivo": "cuoio"}], "non_classificabile": null}'


def richiesta(**altro) -> dict:
    return {"contesto": CONTESTO, "prompt": "MERCE: nella foto", "livello": "rapido", "schema": "voci_foto", "operazione": "foto-1",
            "allegati": [FOTO], **altro}


def test_gemini_allegati_tra_contesto_e_merce(ambiente):
    s, a = sito_con_ia(ambiente, fornitore="gemini", chiave="g")
    s.claude.risposte = [FintoClaude.testo(VOCI_FOTO)]
    assert a.post("/api/ia", json=richiesta(allegati=[FOTO, PDF])).status_code == 200
    q = s.claude.richieste[-1]["corpo"]
    assert q["contents"][0]["parts"] == [{"text": CONTESTO}, {"inlineData": {"mimeType": "image/jpeg", "data": FOTO["dati"]}},
                                         {"inlineData": {"mimeType": "application/pdf", "data": PDF["dati"]}}, {"text": "MERCE: nella foto"}]
    schema = q["generationConfig"]["responseSchema"]
    assert schema["propertyOrdering"][:3] == ["merce", "letto", "merci"] and schema["properties"]["merci"]["items"] == {"type": "STRING"}


def test_claude_foto_e_pdf_dopo_il_contesto_in_cache(ambiente):
    s, a = sito_con_ia(ambiente, fornitore="anthropic", chiave="k")
    s.claude.risposte = [FintoClaude.testo(VOCI_FOTO), FintoClaude.testo(VOCI)]
    assert a.post("/api/ia", json=richiesta(allegati=[FOTO, PDF])).status_code == 200
    q = s.claude.richieste[-1]["corpo"]
    blocchi = q["messages"][0]["content"]
    assert blocchi[0]["cache_control"] == {"type": "ephemeral"} and blocchi[0]["text"] == CONTESTO
    assert blocchi[1] == {"type": "image", "source": {"type": "base64", "media_type": "image/jpeg", "data": FOTO["dati"]}}
    assert blocchi[2] == {"type": "document", "source": {"type": "base64", "media_type": "application/pdf", "data": PDF["dati"]}}
    assert blocchi[3] == {"type": "text", "text": "MERCE: nella foto"}
    assert q["tools"][0]["input_schema"]["required"] == ["merce", "letto", "merci", "voci", "non_classificabile"]
    # senza contesto e con la vecchia «immagine» (pagine aperte prima dell'aggiornamento): la foto e poi la merce
    assert a.post("/api/ia", json=richiesta(contesto="", allegati=[], immagine=FOTO, schema="voci")).status_code == 200
    assert [b["type"] for b in s.claude.richieste[-1]["corpo"]["messages"][0]["content"]] == ["image", "text"]


def test_openai_foto_come_indirizzo_data_e_pdf_come_file(ambiente):
    s, a = sito_con_ia(ambiente, fornitore="openai", url="https://api.openai.com/v1", modello="gpt-prova", chiave="o")
    s.claude.risposte = [FintoClaude.testo(VOCI_FOTO)]
    assert a.post("/api/ia", json=richiesta(allegati=[FOTO, PDF])).status_code == 200
    parti = s.claude.richieste[-1]["corpo"]["messages"][1]["content"]
    assert parti == [{"type": "text", "text": CONTESTO},
                     {"type": "image_url", "image_url": {"url": "data:image/jpeg;base64," + FOTO["dati"]}},
                     {"type": "file", "file": {"filename": "allegato-2.pdf", "file_data": "data:application/pdf;base64," + PDF["dati"]}},
                     {"type": "text", "text": "MERCE: nella foto"}]


def test_allegati_controllati_e_mai_salvati(sito: Sito):
    capo = sito.capo()
    sito.claude.risposte = [FintoClaude.testo(VOCI_FOTO)] * 3
    errore = lambda allegati, **x: capo.post("/api/ia", json=richiesta(allegati=allegati, **x)).json().get("codice")
    # formato, base64, primi byte, dimensione e numero: la richiesta non arriva al servizio
    assert errore([{"tipo": "image/gif", "dati": FOTO["dati"]}]) == "dati_non_validi"
    assert errore([{"tipo": "image/jpeg", "dati": "non è base64!" * 3}]) == "allegato_non_valido"
    assert errore([{"tipo": "image/jpeg", "dati": base64.b64encode(PNG).decode()}]) == "allegato_non_valido"
    assert errore([{"tipo": "application/pdf", "dati": FOTO["dati"]}]) == "allegato_non_valido"           # non è un PDF
    assert errore([{"tipo": "image/png", "dati": base64.b64encode(PNG).decode()}]) is None                # PNG vero: va
    assert errore([{"tipo": "image/jpeg", "dati": base64.b64encode(JPEG[:3] + b"x" * (3 * 1024 * 1024)).decode()}]) == "allegato_non_valido"
    assert errore([{"tipo": "application/pdf", "dati": base64.b64encode(b"%PDF-" + b"x" * (5 * 1024 * 1024)).decode()}]) == "allegato_non_valido"
    assert errore([{"tipo": "image/jpeg", "dati": "A" * 7_100_000}]) == "dati_non_validi"
    assert errore([FOTO] * 4) == "dati_non_validi"
    assert errore([FOTO] * 3, immagine=FOTO) == "bad_request"
    grande = {"tipo": "application/pdf", "dati": base64.b64encode(b"%PDF-" + b"x" * (5 * 1024 * 1024 - 10)).decode()}
    foto_grande = {"tipo": "image/jpeg", "dati": base64.b64encode(JPEG[:3] + b"x" * (3 * 1024 * 1024 - 10)).decode()}
    r = capo.post("/api/ia", json=richiesta(allegati=[grande, foto_grande, FOTO]))
    assert r.status_code == 413 and r.json()["codice"] == "allegati_troppo_grandi" and "8 MB" in r.json()["errore"]
    r = capo.post("/api/ia", json=richiesta(allegati=[{"tipo": "image/jpeg", "dati": "QUJD" * 10}]))
    assert r.status_code == 422 and "PDF" in r.json()["errore"]
    # una traduzione non porta allegati
    assert capo.post("/api/ia", json=richiesta(tipo="traduzione", schema="traduzione")).json()["codice"] == "bad_request"
    assert capo.post("/api/ia", json=richiesta(allegati=[FOTO, FOTO, PDF])).status_code == 200
    assert len(sito.claude.richieste) == 2
    # gli allegati non restano: né nel database né nel registro
    file_db = list((sito.cartella / "dati").glob("taric.db*"))          # anche il -wal, non ancora riportato nel database
    assert file_db
    for f in file_db:
        b = f.read_bytes()
        assert b"SEGNO-DELLA-FOTO" not in b and b"SCHEDA-TECNICA" not in b and FOTO["dati"][:40].encode() not in b
    assert "SEGNO" not in str(capo.get("/api/admin/eventi").json())


def test_foto_conta_come_una_classificazione(sito: Sito):
    capo = sito.capo()
    luca = sito.collega(capo)
    capo.patch(f"/api/admin/utenti/{sito.id_di(capo, 'luca@azienda.it')}", json={"quota_ia": 1})
    sito.claude.risposte = [FintoClaude.testo(VOCI_FOTO)] * 4
    # voci, poi (scelta la merce tra quelle della foto) di nuovo voci, scelta e ricontrollo: la stessa classificazione
    for schema in ("voci_foto", "voci_foto", "scelta_foto", "scelta_foto"):
        assert luca.post("/api/ia", json=richiesta(schema=schema)).status_code == 200
    assert luca.get("/api/io").json()["ia"]["usate"] == 1
    r = luca.post("/api/ia", json=richiesta(operazione="foto-2"))
    assert r.status_code == 429 and r.json()["codice"] == "quota_esaurita"
    # IA spenta per l'account: niente foto
    capo.patch(f"/api/admin/utenti/{sito.id_di(capo, 'luca@azienda.it')}", json={"quota_ia": 0})
    assert luca.post("/api/ia", json=richiesta(operazione="foto-3")).json()["codice"] == "ia_non_autorizzata"


def test_servizio_che_non_accetta_gli_allegati(ambiente):
    s, a = sito_con_ia(ambiente, fornitore="openai", url="https://api.groq.com/openai/v1", modello="solo-testo", chiave="o")
    no = lambda: httpx.Response(400, json={"error": {"message": "image input is not supported for this model"}})
    s.claude.risposte = [no(), no(), no()]                # schema, json, niente: sempre rifiutata
    r = a.post("/api/ia", json=richiesta())
    assert r.status_code == 422 and r.json()["codice"] == "allegato_non_accettato" and "a parole" in r.json()["errore"]
    # un PDF troppo lungo per il modello
    s.claude.risposte = [httpx.Response(400, json={"error": {"message": "This model's maximum context length is 128000 tokens"}})]
    r = a.post("/api/ia", json=richiesta(allegati=[PDF], operazione="pdf-1"))
    assert r.status_code == 413 and r.json()["codice"] == "pdf_troppo_lungo" and "pagine" in r.json()["errore"]
    # senza allegati lo stesso errore resta quello generico
    s.claude.risposte = [no(), no(), no()]
    assert a.post("/api/ia", json=richiesta(allegati=[], operazione="t-2", schema="voci")).json()["codice"] == "upstream_error"


def test_condividi_senza_service_worker(sito: Sito):
    """«Condividi → MAGIC HS» quando il service worker non c'è ancora: si torna alla pagina, che lo dice."""
    r = sito.client().post("/condividi", files={"foto": ("a.jpg", JPEG, "image/jpeg")}, follow_redirects=False)
    assert r.status_code == 303 and r.headers["location"] == "/?condivisa=0#classifica"
