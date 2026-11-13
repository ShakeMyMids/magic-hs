"""Prova lenta con un'estrazione TARIC vera (circa un minuto). Si esegue solo se TARIC_ZIP_PROVA indica
l'archivio .zip di un mese, per esempio quello scaricato da github.com/rousseauxy/taric-opendata/releases."""
from __future__ import annotations

import os
import time
import zipfile
from pathlib import Path

import pytest

from conftest import Sito

ZIP = os.environ.get("TARIC_ZIP_PROVA", "")
pytestmark = pytest.mark.skipif(not ZIP or not Path(ZIP).is_file(), reason="TARIC_ZIP_PROVA non impostato")


@pytest.fixture
def sito(ambiente) -> Sito:
    """Il sito ancora senza dati."""
    tmp, mp = ambiente
    return Sito(tmp, mp, versioni=())


def test_caricamento_manuale_installa_la_versione(sito: Sito):
    a = sito.capo()
    mese = Path(ZIP).stem[-7:]                       # eu-taric-AAAA-MM.zip
    with open(ZIP, "rb") as f:
        r = a.post("/api/admin/dati/carica", files={"file": ("estrazione.zip", f, "application/zip")}, data={"mese": mese})
    assert r.status_code == 200, r.text
    for _ in range(300):
        d = a.get("/api/admin/dati").json()
        if not d["in_corso"] and d["ultimi"] and d["ultimi"][0]["esito"] != "in_corso":
            break
        time.sleep(1)
    assert d["ultimi"][0]["esito"] == "ok", d["ultimi"][0]
    assert d["attiva"] == f"{mese}-01"
    assert "Verifica riga per riga: superata" in a.get(f"/api/admin/dati/riepilogo/{mese}-01").text
    assert a.get(f"/data/{mese}-01/m/84.js").status_code == 200


def test_mese_sbagliato_non_installa_nulla(sito: Sito, tmp_path: Path):
    mese = Path(ZIP).stem[-7:]
    anno, m = map(int, mese.split("-"))
    altro = f"{anno + (m == 12)}-{m % 12 + 1:02d}"   # mese successivo: il file dei cambi lo smentisce
    r = sito.app.state.dati.esegui(altro, "prova", archivio=_copia(ZIP, tmp_path))
    assert r["esito"] == "errore" and "mese" in r["messaggio"]
    assert sito.app.state.dati.attiva() is None


def test_archivio_senza_excel_rifiutato(sito: Sito, tmp_path: Path):
    z = tmp_path / "vuoto.zip"
    with zipfile.ZipFile(z, "w") as f:
        f.writestr("../../fuori.txt", "x")
    r = sito.app.state.dati.esegui("2026-11", "prova", archivio=z)
    assert r["esito"] == "errore" and "xlsx" in r["messaggio"]
    assert not (tmp_path / "fuori.txt").exists()


def _copia(src: str, cartella: Path) -> Path:
    dest = cartella / "copia.zip"
    dest.write_bytes(Path(src).read_bytes())
    return dest
