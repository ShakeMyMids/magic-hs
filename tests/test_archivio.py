"""Archivio aziendale: le classificazioni condivise dai colleghi si ritrovano nella ricerca e, se identiche, si riprendono
senza chiamare di nuovo l'IA. Ognuno sceglie nel Profilo se condividere le sue."""
from __future__ import annotations

from conftest import Sito

RISULTATO = {"q": "scarpe sportive di pelle", "result": {"best": {"code": "6403999610"}}, "sel": "6403999610"}


def salva(c, testo: str, codice: str, ia: bool = True) -> int:
    dati = dict(RISULTATO, q=testo) if ia else {"sel": codice}
    r = c.post("/api/storico", json={"testo": testo, "codice": codice, "dati": dati})
    assert r.status_code == 200, r.text
    return r.json()["id"]


def test_archivio_aziendale(sito: Sito):
    capo = sito.capo()
    luca = sito.collega(capo)
    assert luca.get("/api/io").json()["preferenze"]["condividi"] is True               # condivise salvo scelta diversa
    s1 = salva(luca, "Scarpe sportive di pelle", "6403999610")
    salva(luca, "scarpe  sportive di pelle", "6403999610")                             # stessa descrizione: un solo gruppo
    salva(luca, "codice scelto a mano", "8467211000", ia=False)
    voci = capo.get("/api/archivio").json()["voci"]
    assert [(v["codice"], v["chi"], v["volte"], v["ia"]) for v in voci] == [("8467211000", "Luca Bianchi", 1, False), ("6403999610", "Luca Bianchi", 2, True)]
    r = capo.get(f"/api/archivio/{s1}").json()
    assert r["codice"] == "6403999610" and r["dati"]["result"]["best"]["code"] == "6403999610"
    # chi non vuole condividere: le sue nuove classificazioni restano solo sue
    assert luca.put("/api/io/preferenze", json={"paese": "CN", "condividi": False}).status_code == 200
    assert luca.get("/api/io").json()["preferenze"] == {"paese": "CN", "flusso": "import", "tema": "auto", "condividi": False}
    s2 = salva(luca, "trapano a percussione", "8467211000")
    assert all(v["testo"] != "trapano a percussione" for v in capo.get("/api/archivio").json()["voci"])
    assert capo.get(f"/api/archivio/{s2}").status_code == 404
    mie = luca.get("/api/archivio").json()["voci"]
    assert any(v["testo"] == "trapano a percussione" and v["chi"] == "tu" for v in mie)
    assert luca.get(f"/api/archivio/{s2}").status_code == 200
    # le preferenze senza «condividi» non la cambiano
    luca.put("/api/io/preferenze", json={"paese": "", "flusso": "export", "tema": "scuro"})
    assert luca.get("/api/io").json()["preferenze"]["condividi"] is False
    assert sito.client().get("/api/archivio").status_code == 401
