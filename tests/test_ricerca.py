"""Ricerca per parole: parole cercate senza risultati (anonime) e sinonimi aggiunti dall'amministratore, controllati sulla
nomenclatura del mese."""
from __future__ import annotations

import json

from conftest import Sito

RIGHE = "\n".join([
    "8427000000n21Carrelli-elevatori; altri carrelli di movimentazione muniti di un dispositivo di sollevamento",
    "8427100000L32Carrelli semoventi con motore elettrico",
    "9404000000n21Supporti per letti; oggetti letterecci e simili, per esempio materassi, cuscini",
])


def con_nomenclatura(sito: Sito) -> None:
    f = sito.cartella / "dati" / "taric" / "versioni" / "2026-11-01" / "nomenclatura.js"
    f.write_text("window.TARIC_DATA=" + json.dumps({"meta": {}, "righe": RIGHE}) + ";\n", encoding="utf-8")


def test_parole_senza_risultati_e_sinonimi(sito: Sito):
    con_nomenclatura(sito)
    capo = sito.capo()
    luca = sito.collega(capo)
    for testo in ("Muletto", "muletto ", "ab", "1234", "muletto"):
        assert luca.post("/api/ricerche-vuote", json={"testo": testo}).status_code == 200
    assert luca.get("/api/admin/ricerca").status_code == 403
    r = capo.get("/api/admin/ricerca").json()
    assert [(v["testo"], v["volte"]) for v in r["vuote"]] == [("muletto", 3)]          # anonime, senza chi ha cercato
    assert set(r["vuote"][0]) == {"testo", "volte", "prima", "ultima"}
    # il sinonimo deve portare a parole che esistono nella nomenclatura del mese
    r = capo.put("/api/admin/sinonimi/muletto", json={"termini": ["transpallet"]})
    assert r.status_code == 422 and "«transpallet»" in r.json()["errore"]
    assert capo.put("/api/admin/sinonimi/due parole", json={"termini": ["carrelli"]}).status_code == 422
    assert luca.put("/api/admin/sinonimi/muletto", json={"termini": ["carrelli"]}).status_code == 403
    r = capo.put("/api/admin/sinonimi/Muletto", json={"termini": ["carrelli", "Carrelli-elevatori", "carrelli"]}).json()
    assert r["parola"] == "muletto" and r["termini"] == ["carrelli", "carrelli elevatori"]
    assert luca.get("/api/sinonimi").json()["sinonimi"] == {"muletto": ["carrelli", "carrelli elevatori"]}
    r = capo.get("/api/admin/ricerca").json()
    assert r["vuote"] == [] and r["sinonimi"][0]["autore"] == "Mario Capo"           # la parola ha trovato posto
    assert "sinonimo" in [e["tipo"] for e in capo.get("/api/admin/eventi").json()["eventi"]]
    assert capo.delete("/api/admin/sinonimi/muletto").json()["tolti"] == 1
    assert luca.get("/api/sinonimi").json()["sinonimi"] == {}
    luca.post("/api/ricerche-vuote", json={"testo": "transpallet"})
    assert capo.delete("/api/admin/ricerche-vuote").json()["tolte"] == 1


def test_ricerca_lato_server_come_app_js():
    from taric.ricerca import piano, presente
    testi = [piano(x) for x in RIGHE.split("\n")]
    assert presente(testi, "carrelli") and presente(testi, "carrello") and presente(testi, "Materasso")
    assert presente(testi, "oggetti letterecci") and not presente(testi, "letterecci oggetti") and not presente(testi, "arrelli")
