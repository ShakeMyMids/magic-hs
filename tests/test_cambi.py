"""Avvisi sui preferiti: differenze tra la versione dei dati in uso e la precedente (taric/cambi.py)."""
from __future__ import annotations

import json
from pathlib import Path

from conftest import Sito, dati_finti

NOMENCLATURA = {
    "2026-10-01": ["6400000000n10CALZATURE", "6401000000L21Calzature impermeabili", "6403000000n21Calzature con tomaia di cuoio",
                   "6403999610L52da uomo"],
    "2026-11-01": ["6400000000n10CALZATURE", "6403000000n21Calzature con tomaia di cuoio naturale", "6403999610L52da uomo"],
}
# [tipo, origine, dazio, inizio, fine, addizionale, contingente, base, esclusi, note, condizioni]
MISURE = {
    "2026-10-01": {"s": ["", "3.000 %"], "m": {"6403000000": [[103, "1011", 1, 20050101, 0, 0, 0, 0, 0, 0, 0]],
                                              "6403999610": [[142, "CH", 0, 20050101, 0, 0, 0, 0, 0, 0, 0]]}, "x": {}},
    "2026-11-01": {"s": ["", "4.500 %", "17.000 %"], "m": {"6403000000": [[103, "1011", 1, 20050101, 0, 0, 0, 0, 0, 0, 0],
                                                                          [552, "CN", 2, 20261101, 0, "C999", 0, 0, 0, 0, 0]],
                                                           "6403999610": [[142, "CH", 0, 20050101, 0, 0, 0, 0, 0, 0, 0]]}, "x": {}},
}


def versione(base: Path, v: str) -> None:
    d = dati_finti(base, v)
    (d / "nomenclatura.js").write_text("window.TARIC_DATA=" + json.dumps({"meta": {}, "righe": "\n".join(NOMENCLATURA[v])}) + ";\n")
    (d / "m" / "64.js").write_text('window.TARIC_M=window.TARIC_M||{};window.TARIC_M["64"]=' + json.dumps({**MISURE[v], "l": []}) + ";\n")


def test_preferiti_cambiati(ambiente):
    tmp, mp = ambiente
    sito = Sito(tmp, mp)
    base = sito.cartella / "dati" / "taric" / "versioni"
    for v in NOMENCLATURA:
        versione(base, v)
    capo = sito.capo()
    assert capo.get("/api/preferiti/cambi").json()["cambi"] == {}                      # nessun preferito
    for codice in ("6403999610", "6401000000"):
        capo.put(f"/api/preferiti/{codice}", json={"nota": ""})
    r = capo.get("/api/preferiti/cambi").json()
    assert (r["da"], r["a"]) == ("2026-10-01", "2026-11-01")
    assert r["cambi"]["6401000000"] == {"sparito": True, "misure": []}
    c = r["cambi"]["6403999610"]
    assert c["descrizione"] is None                                                     # cambia la voce sopra, non la sua
    per_tipo = {m["tipo"]: m for m in c["misure"]}
    assert set(per_tipo) == {103, 552}                                                  # la preferenza svizzera non cambia
    assert [x["dazio"] for x in per_tipo[103]["prima"]] == ["3.000 %"] and [x["dazio"] for x in per_tipo[103]["dopo"]] == ["4.500 %"]
    assert per_tipo[552]["prima"] == [] and per_tipo[552]["dopo"][0]["dazio"] == "17.000 %" and per_tipo[552]["origine"] == "CN"
    assert per_tipo[552]["addizionale"] == "C999" and per_tipo[552]["dopo"][0]["dal"] == 20261101


def test_preferiti_senza_versione_precedente(sito: Sito):
    capo = sito.capo()
    capo.put("/api/preferiti/6403999610", json={"nota": ""})
    r = capo.get("/api/preferiti/cambi").json()
    assert r == {"da": None, "a": "2026-11-01", "cambi": {}}
