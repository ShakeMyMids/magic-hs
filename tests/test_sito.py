"""Versione sito (strumenti/sito.py): pagine con percorsi relativi e Content-Security-Policy, programma del browser al
posto del server, dati dei mesi controllati, service worker e manifesto; esporta e importa del programma per Windows."""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

import pytest

from conftest import PC, zip_dei_dati

RADICE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(RADICE / "strumenti"))
import sito  # noqa: E402

RIF = {"rif.js": "window.TARIC_RIF={};\n"}


def archivio(tmp: Path, versione: str, diversi: dict[str, str] | None = None, nome: str = "") -> Path:
    f = tmp / (nome or f"dati-{versione}.zip")
    f.write_bytes(zip_dei_dati(versione, tmp / "origine" / versione, {**RIF, **(diversi or {})}))
    return f


def test_sito_costruito(tmp_path: Path):
    uscita = tmp_path / "pagine" / "magic-hs"
    archivi = [archivio(tmp_path, "2026-10-01"), archivio(tmp_path, "2026-11-01", {"programma.exe": "no", "../fuori.js": "no"})]
    assert sito.main(["--uscita", str(uscita), *map(str, archivi)]) == 0
    # dati: solo i file ammessi, mese controllato, dal più recente
    assert sorted(f.relative_to(uscita / "dati").as_posix() for f in (uscita / "dati").rglob("*") if f.is_file()) == [
        f"{v}/{n}" for v in ("2026-10-01", "2026-11-01") for n in ("m/84.js", "nomenclatura.js", "riepilogo.txt", "rif.js", "versione.json")]
    assert not (tmp_path / "fuori.js").exists()
    config = json.loads(re.match(r"^window\.TARIC_SITO = (.*);\n$", (uscita / "config.js").read_text(), re.S).group(1))
    assert [v["versione"] for v in config["versioni"]] == ["2026-11-01", "2026-10-01"]
    from taric import __version__
    assert config["programma"] == __version__
    # pagina: percorsi relativi (il sito sta in una sottocartella), CSP, programma del browser prima di app.js
    html = (uscita / "index.html").read_text()
    assert "{{" not in html and not re.search(r'(?:src|href)="/', html)
    assert f'<meta http-equiv="Content-Security-Policy" content="{sito.CSP}">' in html and "script-src 'self';" in sito.CSP
    script = re.findall(r'<script src="([^"]+)"></script>', html)
    assert script.index("config.js") < script.index("static/js/ia.js") < script.index("static/js/web.js") < script.index("static/js/app.js")
    assert 'data-dati=""' in html
    for f in ("static/js/web.js", "static/js/ia.js", "static/css/app.css", "static/fonts/archivo-latin-wdth-normal.woff2", ".nojekyll"):
        assert (uscita / f).is_file(), f
    for f in ("attesa.html", "locale.html", "static/js/attesa.js", "static/index.html", "static/sw.js"):
        assert not (uscita / f).exists(), f
    man = json.loads((uscita / "manifest.webmanifest").read_text())
    assert man["start_url"] == man["scope"] == "./" and all(not i["src"].startswith("/") for i in man["icons"])
    sw = (uscita / "sw.js").read_text()
    assert "/*" not in sw.split("\n", 6)[-1] and "'sviluppo'" not in sw and 'var VERSIONI_DATI = ["2026-11-01", "2026-10-01"];' in sw
    guscio = json.loads(re.search(r"var GUSCIO = (\[.*?\]);", sw).group(1))
    assert "static/js/web.js" in guscio and "index.html" in guscio and all((uscita / g).exists() for g in guscio if g != "./")
    # si ricostruisce sopra il sito di prima; la versione del service worker cambia con il contenuto (qui config.js)
    vecchia = re.search(r"var VERSIONE = (\"[0-9a-f]+\")", sw).group(1)
    assert sito.main(["--uscita", str(uscita), str(archivi[1])]) == 0
    assert not (uscita / "dati" / "2026-10-01").exists()
    assert re.search(r"var VERSIONE = (\"[0-9a-f]+\")", (uscita / "sw.js").read_text()).group(1) != vecchia     # i browser si aggiornano


@pytest.mark.parametrize("caso", ["nome", "mese", "senza_rif", "non_zip", "nessuno"])
def test_sito_rifiuta_dati_sbagliati(tmp_path: Path, caso: str, capsys: pytest.CaptureFixture[str]):
    a = {
        "nome": lambda: [archivio(tmp_path, "2026-11-01", nome="novembre.zip")],
        "mese": lambda: [archivio(tmp_path, "2026-10-01", nome="dati-2026-11-01.zip")],
        "senza_rif": lambda: [_senza_rif(tmp_path)],
        "non_zip": lambda: [_scrivi(tmp_path / "dati-2026-11-01.zip", b"PK non finito")],
        "nessuno": lambda: [],
    }[caso]()
    uscita = tmp_path / "uscita"
    if caso == "nessuno":
        with pytest.raises(sito.ErroreSito):
            sito.costruisci(a, uscita)
        return
    assert sito.main(["--uscita", str(uscita), *map(str, a)]) == 1
    assert "errore:" in capsys.readouterr().err


def _scrivi(f: Path, b: bytes) -> Path:
    f.write_bytes(b)
    return f


def _senza_rif(tmp: Path) -> Path:
    f = tmp / "dati-2026-11-01.zip"
    f.write_bytes(zip_dei_dati("2026-11-01", tmp / "origine-senza-rif"))
    return f


def test_sito_non_cancella_cartelle_estranee(tmp_path: Path):
    estranea = tmp_path / "documenti"
    estranea.mkdir()
    (estranea / "importante.txt").write_text("non toccare")
    with pytest.raises(sito.ErroreSito):
        sito.costruisci([archivio(tmp_path, "2026-11-01")], estranea)
    assert (estranea / "importante.txt").read_text() == "non toccare"


def test_esporta_e_importa_dal_programma_per_windows(ambiente):
    """Chi passa al sito si porta dietro storico e preferiti (stesso formato di js/web.js), e viceversa."""
    tmp, mp = ambiente
    a = PC(tmp, mp, versioni=("2026-11-01",)).entra()
    a.put("/api/io", json={"nome": "Mario Rossi", "azienda": "Rossi Srl"})
    for testo, codice in (("trapano", "8467211000"), ("scarpe", "")):
        a.post("/api/storico", json={"testo": testo, "codice": codice, "dati": {"result": {"best": {"code": codice}}}})
    a.put("/api/preferiti/8467211000", json={"nota": "cliente X"})
    d = a.get("/api/io/esporta").json()
    assert d["formato"] == "magic-hs" and d["versione"] == 1 and d["profilo"] == {"nome": "Mario Rossi", "azienda": "Rossi Srl"}
    assert [v["testo"] for v in d["storico"]] == ["scarpe", "trapano"] and d["storico"][1]["dati"]["result"]["best"]["code"] == "8467211000"
    assert d["preferiti"][0]["codice"] == "8467211000" and d["preferiti"][0]["nota"] == "cliente X"

    b = PC(tmp, mp, nome="lbianchi").entra()
    d["storico"].append({"testo": "senza dati", "quando": "2026-11-01T10:00:00Z"})            # voci rovinate: saltate
    d["preferiti"].append({"codice": "84672", "nota": "codice non valido"})
    r = b.post("/api/io/importa", json=d).json()
    assert (r["storico"], r["preferiti"]) == (2, 1)
    assert b.post("/api/io/importa", json=d).json() | {"ok": True} == {"ok": True, "storico": 0, "preferiti": 0}     # niente doppioni
    voci = b.get("/api/storico").json()["voci"]
    assert [v["testo"] for v in voci] == ["scarpe", "trapano"]
    assert b.get(f"/api/storico/{voci[1]['id']}").json()["dati"]["result"]["best"]["code"] == "8467211000"
    assert b.get("/api/preferiti").json()["voci"][0]["nota"] == "cliente X"
    r = b.post("/api/io/importa", json={"formato": "altro", "storico": [], "preferiti": []})
    assert r.status_code == 422 and r.json()["codice"] == "formato"
