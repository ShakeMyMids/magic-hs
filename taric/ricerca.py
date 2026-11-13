"""Ricerca per parole lato server, con le stesse regole di app.js (piano, radice, parola intera o con un'altra desinenza):
serve a controllare che un sinonimo aggiunto in Gestione porti a parole che esistono davvero nella nomenclatura."""
from __future__ import annotations

import json
import re
import unicodedata
from functools import lru_cache
from pathlib import Path

RE_PAROLA = re.compile(r"[a-z0-9]+")


def piano(s: str) -> str:
    """Come piano() di app.js: minuscole, senza accenti, parole separate da uno spazio, uno spazio ai due lati."""
    s = "".join(c for c in unicodedata.normalize("NFD", s.lower()) if unicodedata.category(c) != "Mn")
    return " " + re.sub(r"[^a-z0-9]+", " ", s).strip() + " "


def radice(t: str) -> str:
    """Singolare e plurale insieme: per le parole lunghe si toglie la vocale finale (come radice() di app.js)."""
    return re.sub(r"[aeio]$", "", t) if len(t) >= 4 and re.fullmatch(r"[a-z]+", t) else t


def presente(testi: list[str], termine: str) -> bool:
    """Come un sinonimo in app.js: espressione cosi' com'e', oppure parola intera, inizio di parola o stessa parola con
    un'altra desinenza. testi: descrizioni gia' passate da piano()."""
    termine = piano(termine).strip()
    if not termine:
        return False
    if " " in termine:
        return any(" " + termine in t for t in testi)
    forma = re.compile(" " + radice(termine) + r"(?:[aeio]|io|h[ei])? ")
    return any(" " + termine in t or forma.search(t) for t in testi)


@lru_cache(maxsize=2)
def _testi(percorso: str, _mtime: float) -> tuple[str, ...]:
    testo = Path(percorso).read_text(encoding="utf-8")
    d = json.loads(testo[testo.index("{"):testo.rindex("}") + 1])
    out = []
    for riga in d.get("righe", "").split("\n"):
        if len(riga) > 13:
            out.append(piano(riga[14 if riga[13] == "\x01" else 13:].replace("\x1f", " ")))
    return tuple(out)


def testi_nomenclatura(percorso: Path) -> list[str]:
    """Descrizioni (gia' «piane») di nomenclatura.js di una versione dei dati, tenute in memoria finche' il file non cambia."""
    return list(_testi(str(percorso), percorso.stat().st_mtime))


__all__ = ["RE_PAROLA", "piano", "presente", "radice", "testi_nomenclatura"]
