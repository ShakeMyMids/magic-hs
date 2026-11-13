"""Dati TARIC del sito: pronti da GitHub (pagina «dati») o preparati dal server dalla fonte, primo avvio senza dati,
estrazione sicura degli archivi e archivio del mese per il flusso «Dati TARIC» (strumenti/dati_mese.py)."""
from __future__ import annotations

import re
import sys
import zipfile
from datetime import datetime
from pathlib import Path

import pytest

from taric.dati import estrai_dati

from conftest import FintoGitHub, Sito, dati_finti, zip_dei_dati

RADICE = Path(__file__).resolve().parents[1]


def a_dicembre(sito: Sito, mp: pytest.MonkeyPatch) -> None:
    mp.setattr(sito.app.state.dati, "_ora_locale", lambda: datetime(2026, 12, 3, 9, 0))


def test_dati_pronti_da_github(ambiente):
    tmp, mp = ambiente
    archivio = zip_dei_dati("2026-12-01", tmp / "origine", {"programma.exe": "no", "../fuori.js": "no", "m/1.js": "no"})
    gh = FintoGitHub(dati={"2026-12": archivio})
    sito = Sito(tmp, mp, github=gh)
    dati = sito.app.state.dati
    a_dicembre(sito, mp)
    assert dati.da_fare() == "2026-12"
    dati.controlla_mese()
    assert sito.attiva() == "2026-12-01"
    ultimo = dati.ultimi(1)[0]
    assert ultimo["esito"] == "ok" and ultimo["messaggio"].endswith("Dati pronti da GitHub."), ultimo
    v = dati.versioni / "2026-12-01"
    assert sorted(f.relative_to(v).as_posix() for f in v.rglob("*") if f.is_file()) == ["m/84.js", "nomenclatura.js", "riepilogo.txt", "versione.json"]
    assert not any("eu-taric" in u for u in gh.richieste)            # la fonte non serve
    assert not list(dati.lavoro.iterdir()) and not (tmp / "fuori.js").exists()
    assert dati.da_fare() is None
    assert "2026-12-01" in sito.capo().get("/").text


@pytest.mark.parametrize("caso", ["impronta", "altro_mese", "non_zip", "senza_pagina", "senza_mese", "github_giu"])
def test_dati_pronti_sbagliati_o_mancanti_si_preparano_dalla_fonte(ambiente, caso):
    """Se i dati pronti non ci sono o non vanno bene si scarica l'estrazione dalla fonte (qui non ancora disponibile)."""
    tmp, mp = ambiente
    buono = zip_dei_dati("2026-12-01", tmp / "origine")
    gh = {
        "impronta": FintoGitHub(dati={"2026-12": buono}, digest_dati={"2026-12": "sha256:" + "0" * 64}),
        "altro_mese": FintoGitHub(dati={"2026-12": zip_dei_dati("2026-11-01", tmp / "origine2")}),
        "non_zip": FintoGitHub(dati={"2026-12": b"PK\x03\x04 non finito"}),
        "senza_pagina": FintoGitHub(),
        "senza_mese": FintoGitHub(dati={"2026-11": buono}),
        "github_giu": FintoGitHub(errore=503),
    }[caso]
    sito = Sito(tmp, mp, github=gh)
    dati = sito.app.state.dati
    r = dati.esegui("2026-12", "automatico")
    assert r["esito"] == ("errore" if caso == "github_giu" else "non_disponibile"), r
    assert any("eu-taric-2026-12" in u for u in gh.richieste)        # ha provato la fonte
    assert sito.attiva() == "2026-11-01" and not (dati.versioni / "2026-12-01").exists()
    assert not list(dati.lavoro.iterdir())


def test_primo_avvio_senza_dati(ambiente):
    tmp, mp = ambiente
    gh = FintoGitHub(dati={"2026-11": zip_dei_dati("2026-11-01", tmp / "origine")})
    sito = Sito(tmp, mp, versioni=(), github=gh)
    c = sito.capo()
    assert "Preparazione dei dati" in c.get("/").text
    assert c.get("/api/stato").json() == {"dati_pronti": False, "aggiornamento": None}
    a_dicembre(sito, mp)
    sito.app.state.dati.controlla_mese()                 # dicembre non c'e' ancora: si parte da novembre
    assert sito.attiva() == "2026-11-01" and c.get("/api/stato").json()["dati_pronti"]


def test_estrazione_sicura_dei_dati(tmp_path: Path):
    archivio = tmp_path / "dati.zip"
    with zipfile.ZipFile(archivio, "w") as z:
        z.writestr("nomenclatura.js", "ok")
        z.writestr("m/84.js", "ok")
        z.writestr("../fuori.js", "no")
        z.writestr("m/../../fuori2.js", "no")
        z.writestr("programma.exe", "no")
        z.writestr("m/1.js", "no")
    estrai_dati(archivio, tmp_path / "dest")
    trovati = sorted(p.relative_to(tmp_path / "dest").as_posix() for p in (tmp_path / "dest").rglob("*") if p.is_file())
    assert trovati == ["m/84.js", "nomenclatura.js"]
    assert not (tmp_path / "fuori.js").exists()


def test_non_riscarica_un_mese_gia_installato(ambiente):
    """Se l'amministratore torna alla versione precedente, il pianificatore non reinstalla da solo quella nuova."""
    tmp, mp = ambiente
    sito = Sito(tmp, mp)
    dati = sito.app.state.dati
    a_dicembre(sito, mp)
    assert dati.da_fare() == "2026-12"
    dati_finti(dati.versioni, "2026-12-01")
    assert dati.da_fare() is None
    assert Sito(tmp, mp, nome="altro", extra={"TARIC_SCARICA_DATI": "0"}).app.state.dati.da_fare() is None


def test_dati_del_mese_per_github(ambiente, monkeypatch):
    """strumenti/dati_mese.py (flusso «Dati TARIC»): archivio con i soli file dei dati, codici d'uscita per il flusso."""
    sys.path.insert(0, str(RADICE / "strumenti"))
    try:
        import dati_mese
    finally:
        sys.path.pop(0)
    from taric.dati import GestoreDati

    tmp, _ = ambiente
    esiti: list[str] = []

    def esegui(self, mese, origine, archivio=None, autore_id=None):
        esiti.append(f"{mese} {origine} {self.cfg.dati_url!r}")
        if mese == "2027-01":
            return {"esito": "non_disponibile", "messaggio": "non ancora"}
        d = dati_finti(self.versioni, f"{mese}-01")
        (d / "estraneo.txt").write_text("no")
        return {"esito": "ok", "messaggio": "fatto"}
    monkeypatch.setattr(GestoreDati, "esegui", esegui)
    uscita = tmp / "dist" / "dati-2026-12-01.zip"
    assert dati_mese.main(["2026-12", str(uscita)]) == 0
    assert esiti == ["2026-12 github ''"]                         # sempre dalla fonte, mai dai dati pronti
    with zipfile.ZipFile(uscita) as z:
        assert sorted(z.namelist()) == ["m/84.js", "nomenclatura.js", "riepilogo.txt", "versione.json"]
    assert dati_mese.main(["2027-01", str(tmp / "x.zip")]) == 2 and not (tmp / "x.zip").exists()
    assert dati_mese.main([]) == 1


def test_file_dei_dati_con_a_capo_unix():
    """aggiorna.py scrive i file con «\\n» su ogni sistema (i controlli finali verificano che i .js finiscano con ";\\n")."""
    testo = (RADICE / "taric" / "aggiorna.py").read_text(encoding="utf-8")
    aperture = re.findall(r'open\([^\n]*"w"[^\n]*\)', testo)
    assert aperture and all('newline="\\n"' in a for a in aperture), aperture
