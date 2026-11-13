"""Sinonimi della ricerca per parole (taric/static/js/sinonimi.js): file leggibile, una parola per chiave e ogni termine
presente nel testo ufficiale italiano della nomenclatura (taric/nomenclatura_it.json), cercato come fa app.js."""
from __future__ import annotations

import json
import re
from pathlib import Path

from taric.ricerca import piano, presente

RADICE = Path(__file__).resolve().parents[1]
STATICO = RADICE / "taric" / "static"


def sinonimi() -> dict[str, list[str]]:
    testo = (STATICO / "js" / "sinonimi.js").read_text(encoding="utf-8")
    corpo = testo[testo.index("window.TARIC_SINONIMI = {") + len("window.TARIC_SINONIMI = "):testo.rindex("}") + 1]
    corpo = "\n".join(r for r in corpo.splitlines() if not r.strip().startswith("//"))
    doppie: list[str] = []

    def senza_doppie(coppie):
        visti = {}
        for k, v in coppie:
            if k in visti:
                doppie.append(k)
            visti[k] = v
        return visti
    d = json.loads(corpo, object_pairs_hook=senza_doppie)
    assert not doppie, doppie
    return d


def test_sinonimi_validi_e_presenti_nella_nomenclatura():
    d = sinonimi()
    assert len(d) >= 100
    testi = [piano(v[0]) for v in json.loads((RADICE / "taric" / "nomenclatura_it.json").read_text(encoding="utf-8"))["righe"].values()]
    mancano = []
    for chiave, termini in d.items():
        assert re.fullmatch(r"[a-z0-9]+", piano(chiave).strip()), f"una sola parola come chiave: {chiave!r}"
        assert isinstance(termini, list) and termini and all(isinstance(x, str) and x.strip() for x in termini), chiave
        mancano += [f"{chiave} -> {x}" for x in termini if not presente(testi, x)]
    assert not mancano, mancano


def test_sinonimi_caricati_prima_della_ricerca():
    pagina = (STATICO / "index.html").read_text(encoding="utf-8")
    assert pagina.index("/static/js/sinonimi.js") < pagina.index("/static/js/app.js")
    assert "window.TARIC_SINONIMI" in (STATICO / "js" / "app.js").read_text(encoding="utf-8")
