"""Sinonimi della ricerca per parole (taric/static/js/sinonimi.js): file leggibile, una parola per chiave e ogni termine
presente nel testo ufficiale italiano della nomenclatura (taric/nomenclatura_it.json), cercato come fa app.js."""
from __future__ import annotations

import json
import re
import unicodedata
from pathlib import Path

RADICE = Path(__file__).resolve().parents[1]
STATICO = RADICE / "taric" / "static"


def piano(s: str) -> str:
    """Come piano() di app.js: minuscole, senza accenti, parole separate da uno spazio, uno spazio ai due lati."""
    s = "".join(c for c in unicodedata.normalize("NFD", s.lower()) if unicodedata.category(c) != "Mn")
    return " " + re.sub(r"[^a-z0-9]+", " ", s).strip() + " "


def radice(t: str) -> str:
    return re.sub(r"[aeio]$", "", t) if len(t) >= 4 and re.fullmatch(r"[a-z]+", t) else t


def trovato(testi: list[str], termine: str) -> bool:
    """Come parolaCercata(termine, true) di app.js: espressione cosi' com'e', oppure parola intera, inizio di parola o
    stessa parola con un'altra desinenza."""
    if " " in termine:
        return any(" " + termine in t for t in testi)
    forma = re.compile(" " + radice(termine) + r"(?:[aeio]|io|h[ei])? ")
    return any(" " + termine in t or forma.search(t) for t in testi)


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
        mancano += [f"{chiave} -> {x}" for x in termini if not trovato(testi, piano(x).strip())]
    assert not mancano, mancano


def test_sinonimi_caricati_prima_della_ricerca():
    pagina = (STATICO / "index.html").read_text(encoding="utf-8")
    assert pagina.index("/static/js/sinonimi.js") < pagina.index("/static/js/app.js")
    assert "window.TARIC_SINONIMI" in (STATICO / "js" / "app.js").read_text(encoding="utf-8")
