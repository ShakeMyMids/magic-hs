"""Bolla d'importazione da un PDF (sezione Bolla, «Da un PDF»): il prospetto di sintesi H1 di AIDA si legge senza IA
(taric/leggi_bolla.py in un processo a parte, PDF finto di tests/prospetto_finto.py); gli altri PDF con l'IA, che conta come
una classificazione; i dati diventano i campi di una bolla nuova (taric/bolla_pdf.py) e il PDF non si salva."""
from __future__ import annotations

import base64
import json

from conftest import FintoClaude, Sito
from prospetto_finto import pdf, prospetto
from taric import bolla_pdf as BP

PROSPETTO = base64.b64encode(prospetto()).decode()
ALTRO = base64.b64encode(pdf([[(40, 100, ("F1", 9), "Fattura commerciale n. 42")]])).decode()


def test_lettura_senza_ia_del_prospetto(tmp_path):
    e, motivo = BP.leggi_testo(prospetto(), tmp_path)
    assert motivo == "" and e is not None
    assert (e["mrn"], e["data"], e["valore_fattura"], e["qualifica"], e["consegna"], e["natura"]) == \
        ("26ITQ0B44714259R61", "29/06/2026", "1.246,33 USD", "3", "CPT TORINO IT", "11")
    assert e["esportatore"] == "FORNITORE DI PROVA INC\nUS 50703 IA WATERLOO" and e["ufficio"] == "279100 - UD MALPENSA SEZIONE\nOPERATIVA CENTRALE"
    # la sezione Documenti: l'identificativo andato a capo resta nella sua riga
    assert [(d["codice"], d["identificativo"]) for d in e["documenti"]] == \
        [("N935", "2026-US-D699417"), ("Y025", "2026-IT-AEOF 09 0146"), ("Y926", "-"), ("N740", "235-12345678")]
    assert e["scarichi"] == [{"tipo": "337", "riferimento": "26ITQ0B32378457U90", "articolo": "1"}]
    a1, a2 = e["articoli"]
    assert (a1["numero"], a1["codice"], a1["lordo"], a1["netto"], a1["regimi_aggiuntivi"], a1["origine"], a1["prezzo"]) == \
        ("1", "6403999610", "16,30", "14,50", "F15", "US", "246,33")
    assert a1["descrizione"] == "CALZATURE SPORTIVE DA UOMO CON TOMAIA\nIN PELLE E SUOLA IN GOMMA"
    assert [t["tributo"] + " " + t["importo"] + " " + t["metodo"] for t in a1["tributi"]] == ["A00 18,27 E", "B00 58,23 E"]
    assert a1["colli"] == [{"tipo": "PK", "numero": "1", "marchi": "NESSUN MARCHIO"}] and a1["aggiunte"][0]["codice"] == "AK"
    assert (a2["codice"], a2["origine"], a2["prezzo"], a2["colli"][0]["marchi"]) == ("8712003090", "CN", "1.000,00", "BIKE 1-2")
    # un PDF che non è un prospetto: il motivo, niente dati
    assert BP.leggi_testo(base64.b64decode(ALTRO), tmp_path) == (None, "non trovo «Prospetto di sintesi della dichiarazione doganale»")
    assert BP.leggi_testo(b"%PDF-1.4 rotto", tmp_path)[0] is None
    assert list(tmp_path.iterdir()) == []                         # niente resta sul disco


def test_dal_prospetto_alla_bolla(tmp_path):
    e, _ = BP.leggi_testo(prospetto(), tmp_path)
    d, avvisi = BP.dati_bolla(e)
    assert {k: d[k] for k in ("data", "valuta", "qualifica", "incoterm", "luogo", "paeseSpedizione", "provincia", "natura", "mrn",
                              "dilazione", "mezzoArrivo", "metodoPagamento", "container", "fattura", "paese")} == {
        "data": "2026-06-29", "valuta": "USD", "qualifica": "3", "incoterm": "CPT", "luogo": "TORINO IT", "paeseSpedizione": "US",
        "provincia": "TO", "natura": "11", "mrn": "26ITQ0B44714259R61", "dilazione": "", "mezzoArrivo": "40 AZ610",
        "metodoPagamento": "E", "container": "0", "fattura": "2026-US-D699417", "paese": "US"}
    assert d["ufficio"] == "279100 - UD MALPENSA SEZIONE OPERATIVA CENTRALE" and d["docTrasporto"] == {"tipo": "N740", "numero": "235-12345678"}
    assert d["scarico"] == {"tipo": "337", "riferimento": "26ITQ0B32378457U90", "articolo": "1", "colli": "", "quantita": "", "unita": ""}
    a1, a2 = d["articoli"]
    assert a1 == {"codice": "6403999610", "descrizione": "CALZATURE SPORTIVE DA UOMO CON TOMAIA IN PELLE E SUOLA IN GOMMA", "origine": "US",
                  "valore": "246,33", "netto": "14,50", "lordo": "16,30", "quantita": "1", "colliTipo": "PK", "colliNumero": "1",
                  "colliMarchi": "NESSUN MARCHIO", "regimiAggiuntivi": "F15", "documenti": ["N935", "Y900"]}
    assert (a2["valore"], a2["colliMarchi"]) == ("1.000,00", "BIKE 1-2")
    testo = " ".join(avvisi)
    assert "Documenti di testata non riportati nella bolla: Y025, Y926." in testo
    assert "Articolo 1: aggiunte e detrazioni da riportare a mano (AK 10,00)." in testo
    assert "Articolo 1, tributi nel prospetto (per confronto, MAGIC HS li ricalcola): A00 18,27; B00 58,23." in testo
    assert "il tasso di cambio è 1,0785" in testo


def test_api_prima_senza_ia_poi_con_l_ia(sito: Sito):
    capo = sito.capo()
    luca = sito.collega(capo)
    capo.patch(f"/api/admin/utenti/{sito.id_di(capo, 'luca@azienda.it')}", json={"quota_ia": 0})          # IA spenta
    # il prospetto di AIDA si legge senza IA, anche con l'IA spenta, e non conta
    r = luca.post("/api/bolle/leggi", json={"pdf": PROSPETTO})
    assert r.status_code == 200, r.text
    assert (r.json()["fonte"], r.json()["dati"]["mrn"], len(r.json()["dati"]["articoli"])) == ("testo", "26ITQ0B44714259R61", 2)
    assert sito.claude.richieste == []
    # un altro PDF: serve l'IA, che a Luca non è permessa
    r = luca.post("/api/bolle/leggi", json={"pdf": ALTRO})
    assert r.status_code == 422 and r.json()["codice"] == "serve_ia" and "prospetto di sintesi H1" in r.json()["errore"]
    assert luca.post("/api/bolle/leggi", json={"pdf": ALTRO, "ia": True}).json()["codice"] == "ia_non_autorizzata"
    assert luca.post("/api/bolle/leggi", json={"pdf": base64.b64encode(b"non sono un pdf " * 4).decode()}).json()["codice"] == "pdf_non_valido"
    assert sito.client().post("/api/bolle/leggi", json={"pdf": PROSPETTO}).status_code == 401
    # con l'IA: la richiesta ha il PDF e lo schema «bolla», e conta come una classificazione
    letto = {"tipo": "H1", "mrn": "26 it q0b44714259r61", "ufficio": "UD Genova", "data": "03/11/2026", "valuta": "cny", "esportatore": "Fornitore\nCina",
             "importatore": "Importatore", "dichiarante": "IT1", "rappresentante": "", "qualifica": "", "consegna": "FOB SHANGHAI",
             "dilazione": "", "paese_spedizione": "CN", "provincia": "ge", "mezzo_arrivo": "", "natura": "11", "metodo_pagamento": "A",
             "container": "1", "documenti": [{"codice": "N380", "identificativo": "F-1"}, {"codice": "N705", "identificativo": "BL-9"}],
             "scarichi": [], "articoli": [{"codice": "8712 00 30 90", "descrizione": "Biciclette", "origine": "CN", "prezzo": "10.000,00",
                                          "lordo": "300", "netto": "280", "quantita": "20", "regimi_aggiuntivi": "", "preferenza": "100",
                                          "documenti": [], "colli": [{"tipo": "CT", "numero": "20", "marchi": "B1-20"}], "aggiunte": [], "tributi": []}]}
    sito.claude.risposte = [FintoClaude.testo(json.dumps(letto)), FintoClaude.testo(json.dumps({**letto, "tipo": "altro"}))]
    usate = capo.get("/api/io").json()["ia"]["usate"]
    r = capo.post("/api/bolle/leggi", json={"pdf": ALTRO, "ia": True})
    assert r.status_code == 200, r.text
    d = r.json()["dati"]
    assert r.json()["fonte"] == "ia" and (d["mrn"], d["valuta"], d["incoterm"], d["luogo"], d["provincia"], d["container"]) == \
        ("26ITQ0B44714259R61", "CNY", "FOB", "SHANGHAI", "GE", "1")
    assert d["articoli"][0]["codice"] == "8712003090" and d["docTrasporto"] == {"tipo": "N705", "numero": "BL-9"} and d["fattura"] == "F-1"
    corpo = sito.claude.richieste[-1]["corpo"]
    parti = corpo["contents"][0]["parts"]
    assert parti[1] == {"inlineData": {"mimeType": "application/pdf", "data": ALTRO}} and "dichiarazione doganale" in parti[0]["text"]
    assert corpo["generationConfig"]["responseSchema"]["properties"]["articoli"]["type"] == "ARRAY"
    assert capo.get("/api/io").json()["ia"]["usate"] == usate + 1
    r = capo.post("/api/bolle/leggi", json={"pdf": ALTRO, "ia": True})
    assert r.status_code == 422 and r.json()["codice"] == "non_bolla"
    assert not any((sito.cartella / "dati" / "letture").iterdir())         # il PDF non resta
