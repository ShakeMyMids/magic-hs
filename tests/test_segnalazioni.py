"""Segnalazioni di problemi: chi usa il sito le manda, l'amministratore le legge in Gestione, risponde e le risolve;
chi le ha mandate vede la risposta nel profilo."""
from __future__ import annotations

from conftest import Sito

CONTESTO = {"indirizzo": "/#classifica", "codice": "6403999610", "schermo": "390x844", "browser": "Mozilla/5.0 (iPhone)", "versione": "2026-11-01"}


def test_segnalazione_e_risposta(sito: Sito):
    capo = sito.capo()
    luca = sito.collega(capo)
    assert capo.get("/api/admin/riepilogo").json()["segnalazioni"] == 0
    # chi segnala: testo e contesto, dentro i limiti
    assert luca.post("/api/segnalazioni", json={"testo": "no"}).status_code == 422
    assert luca.post("/api/segnalazioni", json={"testo": "     ciao     "}).status_code == 422
    assert luca.post("/api/segnalazioni", json={"testo": "x" * 2001}).status_code == 422
    assert luca.post("/api/segnalazioni", json={"testo": "Il dazio esce sbagliato", "contesto": {"browser": "x" * 301}}).status_code == 422
    r = luca.post("/api/segnalazioni", json={"testo": "Il dazio delle scarpe dal Vietnam esce sbagliato", "sezione": "classifica", "contesto": CONTESTO})
    assert r.status_code == 200, r.text
    sid = r.json()["id"]
    assert sito.client().post("/api/segnalazioni", json={"testo": "Senza account"}).status_code == 401
    # l'amministratore la vede (con chi l'ha mandata e il contesto); i colleghi no
    assert luca.get("/api/admin/segnalazioni").status_code == 403
    assert capo.get("/api/admin/riepilogo").json()["segnalazioni"] == 1
    v = capo.get("/api/admin/segnalazioni").json()["voci"]
    assert [(x["id"], x["autore"], x["email"], x["sezione"], x["stato"], x["contesto"]) for x in v] == \
        [(sid, "Luca Bianchi", "luca@azienda.it", "classifica", "aperta", CONTESTO)]
    mie = luca.get("/api/segnalazioni").json()["voci"]
    assert [(x["testo"], x["stato"], x["risposta"]) for x in mie] == [("Il dazio delle scarpe dal Vietnam esce sbagliato", "aperta", "")]
    assert "contesto" not in mie[0] and "email" not in mie[0]
    assert luca.get("/api/io").json()["risposte"] == 0
    # risposta e risolta: l'autore la trova come nuova finche' non apre il profilo
    assert capo.put(f"/api/admin/segnalazioni/{sid}", json={"stato": "sospesa"}).status_code == 422
    assert capo.put("/api/admin/segnalazioni/999", json={"stato": "chiusa"}).status_code == 404
    r = capo.put(f"/api/admin/segnalazioni/{sid}", json={"stato": "chiusa", "risposta": "Mancava il codice 142 nella casella 36: ora è spiegato."})
    assert r.status_code == 200, r.text
    assert capo.get("/api/admin/riepilogo").json()["segnalazioni"] == 0
    assert capo.get("/api/admin/segnalazioni").json()["voci"][0]["chiusa_da"] == "Mario Capo"
    assert luca.get("/api/io").json()["risposte"] == 1
    mie = luca.get("/api/segnalazioni").json()["voci"]
    assert (mie[0]["stato"], mie[0]["risposta"], mie[0]["letta"]) == ("chiusa", "Mancava il codice 142 nella casella 36: ora è spiegato.", False)
    # chi ha risposto: l'autore (il primo di MAGIC_HS_AMMINISTRATORI) con il suo avatar
    assert mie[0]["risposta_di"] == {"nome": "Mario Capo", "autore": True}
    assert luca.post("/api/segnalazioni/lette").status_code == 200
    assert luca.get("/api/io").json()["risposte"] == 0
    # riaperta senza cambiare la risposta: niente di nuovo per l'autore; nel registro gli eventi
    capo.put(f"/api/admin/segnalazioni/{sid}", json={"stato": "aperta", "risposta": "Mancava il codice 142 nella casella 36: ora è spiegato."})
    assert luca.get("/api/io").json()["risposte"] == 0
    tipi = [e["tipo"] for e in capo.get("/api/admin/eventi").json()["eventi"]]
    assert {"segnalazione", "segnalazione_risolta", "segnalazione_riaperta"} <= set(tipi)
    # eliminata
    assert capo.delete(f"/api/admin/segnalazioni/{sid}").status_code == 200
    assert capo.delete(f"/api/admin/segnalazioni/{sid}").status_code == 404
    assert luca.get("/api/segnalazioni").json()["voci"] == []


def test_segnalazioni_limitate_e_account_eliminato(sito: Sito):
    capo = sito.capo()
    luca = sito.collega(capo)
    for k in range(10):
        assert luca.post("/api/segnalazioni", json={"testo": f"Problema numero {k}"}).status_code == 200
    r = luca.post("/api/segnalazioni", json={"testo": "Problema numero 11"})
    assert r.status_code == 429 and r.json()["codice"] == "troppe"
    assert capo.post("/api/segnalazioni", json={"testo": "Anche l'amministratore può segnalare"}).status_code == 200
    # l'account eliminato: le segnalazioni restano, senza autore
    uid = next(x["id"] for x in capo.get("/api/admin/utenti").json()["utenti"] if x["email"] == "luca@azienda.it")
    assert capo.delete(f"/api/admin/utenti/{uid}").status_code == 200
    v = capo.get("/api/admin/segnalazioni").json()["voci"]
    assert len(v) == 11 and sum(1 for x in v if x["autore"] == "") == 10


def test_risposta_di_un_altro_amministratore(sito: Sito):
    capo = sito.capo()
    luca = sito.collega(capo)
    anna = sito.collega(capo, "Anna Neri", "anna@azienda.it")
    sid = anna.post("/api/segnalazioni", json={"testo": "Non trovo il tasto Stampa"}).json()["id"]
    assert anna.get("/api/segnalazioni").json()["voci"][0]["risposta_di"] is None
    capo.patch(f"/api/admin/utenti/{sito.id_di(capo, 'luca@azienda.it')}", json={"ruolo": "amministratore"})
    luca.put(f"/api/admin/segnalazioni/{sid}", json={"stato": "aperta", "risposta": "È in alto, accanto a Copia codice."})
    assert anna.get("/api/segnalazioni").json()["voci"][0]["risposta_di"] == {"nome": "Luca Bianchi", "autore": False}
    # chiusa dall'autore senza cambiare la risposta: la risposta resta di Luca
    capo.put(f"/api/admin/segnalazioni/{sid}", json={"stato": "chiusa", "risposta": "È in alto, accanto a Copia codice."})
    assert anna.get("/api/segnalazioni").json()["voci"][0]["risposta_di"]["nome"] == "Luca Bianchi"
    # MAGIC_HS_AUTORE sceglie l'autore
    sito.riavvia(MAGIC_HS_AUTORE="luca@azienda.it")
    anna = sito.accedi("anna@azienda.it")
    assert anna.get("/api/segnalazioni").json()["voci"][0]["risposta_di"] == {"nome": "Luca Bianchi", "autore": True}
