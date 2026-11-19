"""Le forme delle stagioni e delle feste in app.css sono quelle che genera strumenti/forme_stagioni.py."""
from __future__ import annotations

import importlib.util
from pathlib import Path

RADICE = Path(__file__).resolve().parent.parent


def test_forme_in_app_css_aggiornate():
    spec = importlib.util.spec_from_file_location("forme_stagioni", RADICE / "strumenti" / "forme_stagioni.py")
    forme = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(forme)
    testo = (RADICE / "taric" / "static" / "css" / "app.css").read_text(encoding="utf-8")
    assert forme.nel_css(testo) == forme.blocco(), "esegui: python strumenti/forme_stagioni.py"
    for tema in ("inverno", "natale", "capodanno", "san-valentino", "carnevale", "mimosa", "pasqua", "festa-nazionale",
                 "halloween", "primavera", "estate", "autunno"):
        assert f".tema-{tema}{{--motivo:url(" in testo and f".tema-{tema}{{--tema-chiaro:" in testo, tema
