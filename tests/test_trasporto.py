"""Calcolatore del trasporto: lettura della guida alle tariffe di DHL Express (taric/leggi_tariffe.py, su una guida
finta generata da tests/guida_finta.py), caricamento e versioni in Gestione, supplemento carburante.
Con TARIC_PDF_DHL=<guida vera> si prova anche il PDF di DHL (i prezzi controllati sono quelli della guida 2026)."""
from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path

import pytest

from conftest import Sito
from guida_finta import rate_economy, rate_worldwide, scrivi, worldwide

LETTORE = Path(__file__).resolve().parent.parent / "taric" / "leggi_tariffe.py"
sys.path.insert(0, str(LETTORE.parent))
import leggi_tariffe as L  # noqa: E402


def leggi(pdf: Path, tmp: Path) -> tuple[int, str, dict | None]:
    out = tmp / "tariffe.json"
    out.unlink(missing_ok=True)
    p = subprocess.run([sys.executable, "-I", str(LETTORE), str(pdf), str(out)], capture_output=True, text=True, timeout=120)
    return p.returncode, p.stdout, (json.loads(out.read_text()) if out.exists() else None)


def paese(d: dict, codice: str) -> dict:
    return next(p for p in d["paesi"] if p["codice"] == codice)


def test_guida_finta(tmp_path: Path):
    codice, testo, d = leggi(scrivi(tmp_path / "guida.pdf"), tmp_path)
    assert codice == 0 and testo.strip().splitlines()[-1] == "CONTROLLI OK", testo
    assert d["titolo"] == "DHL Express, Guida ai servizi e alle tariffe 2026: Italia" and d["validita"] == "2026-01-01"
    assert d["avvisi"] == []
    # zonario: codici del TARIC e nomi italiani; il Regno Unito in zona 2 e l'Irlanda del Nord in zona 3
    assert paese(d, "IT")["zona"] == 0 and paese(d, "CN") == {"codice": "CN", "nome": "Cina", "zona": 7, "servizi": ["worldwide", "12:00", "10:30"]}
    assert (paese(d, "GB")["zona"], paese(d, "XI")["zona"], paese(d, "XI")["nome"]) == (2, 3, "Regno Unito (Irlanda del Nord)")
    assert paese(d, "TR")["nome"] == "Turchia" and paese(d, "XS")["nome"] == "Serbia"
    assert sorted(paese(d, "CH")["servizi"]) == sorted(["worldwide", "12:00", "10:30", "9:00", "economy"])
    # tabelle: le merci (non i documenti), gli scatti e il passo vero (la tabella d'esportazione dice «0,5 kg» oltre i 30)
    w = d["prodotti"]["worldwide"]
    assert w["export"]["righe"][0] == [0.5, [worldwide(0.5, z, False) for z in range(1, 10)]]
    assert [(s["da"], s["a"], s["passo"]) for s in w["export"]["scatti"]] == [(10, 20, 0.5), (20, 30, 0.5), (30, 70, 1), (70, 300, 1), (300, 3000, 1)]
    assert w["import"]["scatti"][0]["prezzi"] == [rate_worldwide(z, True)[0] for z in range(1, 10)]
    e = d["prodotti"]["economy"]
    assert [(s["da"], s["a"], s["passo"]) for s in e["export"]["scatti"]] == [(30, 70, 1), (70, 300, 5), (300, None, 5)]
    assert e["export"]["scatti"][2]["prezzi"] == [rate_economy(z, False)[2] for z in range(1, 6)]
    assert (w["export"]["unita"], e["export"]["unita"]) == (0.5, 1)
    assert d["orari"] == {"export": {"12:00": 11, "10:30": 15, "9:00": 35}, "import": {"12:00": 11, "10:30": 15, "9:00": 35}}
    assert d["limiti"]["10:30"] == {"collo_kg": 25, "colli": 10, "misure": [100, 80, 80], "spedizione_kg": 250, "pallet_kg": 0, "pallet_misure": 0}
    assert d["limiti"]["worldwide"]["pallet_misure"] == [300, 200, 160] and d["limiti"]["worldwide"]["colli"] is None
    assert d["supplementi"] == {"extra_peso": 100, "extra_misura": 20, "non_conveyable": 20, "pallet_non_sovrapponibile": 300,
                                "sabato": 40, "aree_remote": {"per_kg": 0.5, "minimo": 24}, "assicurazione": {"minimo": 11, "percentuale": 1},
                                "batterie_litio": 5}


def test_prezzi_con_gli_scatti(tmp_path: Path):
    _, _, d = leggi(scrivi(tmp_path / "guida.pdf"), tmp_path)
    tab = d["prodotti"]["worldwide"]["export"]
    r = rate_worldwide(1, False)
    assert L.prezzo(tab, 0, 7.5) == worldwide(7.5, 1, False)                       # riga della tabella
    assert L.prezzo(tab, 0, 7.2) == worldwide(7.5, 1, False)                       # alla riga sopra
    assert L.prezzo(tab, 0, 10.3) == round(worldwide(10, 1, False) + r[0], 2)      # uno scatto da 0,5 kg
    assert L.prezzo(tab, 0, 35.2) == round(worldwide(30, 1, False) + 6 * r[2], 2)  # oltre i 30: al kg
    assert L.prezzo(tab, 0, 320) == round(worldwide(70, 1, False) + 250 * r[3], 2) # attraverso due scatti
    eco = d["prodotti"]["economy"]["export"]
    re_ = rate_economy(2, False)
    assert L.prezzo(eco, 1, 320) == round(eco["righe"][-1][1][1] + 40 * re_[1] + 4 * re_[2], 2)


def test_guida_con_un_errore_non_si_installa(tmp_path: Path):
    codice, testo, d = leggi(scrivi(tmp_path / "rotta.pdf", rompi="scatto"), tmp_path)
    assert codice == 1 and d is None
    assert "DHL Express Worldwide export: lo scatto da 10" in testo
    # un file che non e' una guida
    (tmp_path / "vuoto.pdf").write_bytes(b"%PDF-1.4\n%%EOF\n")
    codice, testo, d = leggi(tmp_path / "vuoto.pdf", tmp_path)
    assert codice == 1 and d is None and "ERRORE" in testo


def test_parti_accessorie_mancanti_diventano_avvisi(tmp_path: Path):
    codice, testo, d = leggi(scrivi(tmp_path / "guida.pdf", rompi="spunte", senza_economy=True), tmp_path)
    assert codice == 0, testo
    assert all(p["servizi"] is None for p in d["paesi"]) and d["prodotti"]["economy"] == {}
    assert any("Spunte dei servizi" in a for a in d["avvisi"]) and any("Economy Select non letto" in a for a in d["avvisi"])


def test_caricamento_e_versioni(sito: Sito, tmp_path: Path):
    capo = sito.capo()
    collega = sito.collega(capo)
    assert collega.get("/api/trasporto").json() == {"tariffa": None, "carburante": None}
    pdf = scrivi(tmp_path / "guida.pdf").read_bytes()
    # solo l'amministratore carica, solo PDF
    assert collega.post("/api/admin/trasporto", files={"file": ("guida.pdf", pdf, "application/pdf")}).status_code == 403
    r = capo.post("/api/admin/trasporto", files={"file": ("guida.pdf", b"PK\x03\x04 non un pdf", "application/pdf")})
    assert r.status_code == 422 and r.json()["codice"] == "pdf_non_valido"
    r = capo.post("/api/admin/trasporto", files={"file": ("rotta.pdf", scrivi(tmp_path / "rotta.pdf", rompi="scatto").read_bytes(), "application/pdf")})
    assert r.status_code == 422 and "lo scatto da 10" in r.json()["errore"]
    r = capo.post("/api/admin/trasporto", files={"file": ("guida.pdf", pdf, "application/pdf")})
    assert r.status_code == 200, r.text
    assert r.json()["validita"] == "2026-01-01" and "Zonario: 234 paesi" in r.json()["riepilogo"]
    t = collega.get("/api/trasporto").json()["tariffa"]
    assert t["id"] == r.json()["id"] and paese(t, "CN")["zona"] == 7 and t["supplementi"]["extra_peso"] == 100
    # una seconda versione va in uso; la prima si puo' rimettere
    r2 = capo.post("/api/admin/trasporto", files={"file": ("guida.pdf", pdf, "application/pdf")})
    v = capo.get("/api/admin/trasporto").json()["versioni"]
    assert [(x["id"], x["attiva"]) for x in v] == [(r2.json()["id"], True), (r.json()["id"], False)] and v[0]["autore"] == "Mario Capo"
    assert capo.post(f"/api/admin/trasporto/{r.json()['id']}/attiva").status_code == 200
    assert collega.get("/api/trasporto").json()["tariffa"]["id"] == r.json()["id"]
    assert capo.post("/api/admin/trasporto/9999/attiva").status_code == 404
    eventi = [e["tipo"] for e in capo.get("/api/admin/eventi").json()["eventi"]]
    assert eventi.count("tariffe_trasporto") == 2 and "tariffe_trasporto_attivate" in eventi
    assert not list((sito.cartella / "dati" / "tariffe").glob("*.pdf"))          # il PDF non resta sul disco


def test_supplemento_carburante(sito: Sito, tmp_path: Path):
    capo = sito.capo()
    assert capo.get("/api/admin/riepilogo").json()["carburante_giorni"] is None          # nessuna tariffa: niente avviso
    capo.post("/api/admin/trasporto", files={"file": ("guida.pdf", scrivi(tmp_path / "g.pdf").read_bytes(), "application/pdf")})
    assert capo.get("/api/admin/riepilogo").json()["carburante_giorni"] == 999
    assert capo.put("/api/admin/trasporto/carburante", json={"percentuale": 120}).status_code == 422
    assert capo.put("/api/admin/trasporto/carburante", json={"percentuale": 30, "dal": "16/11/2026"}).status_code == 422
    r = capo.put("/api/admin/trasporto/carburante", json={"percentuale": 35.25, "dal": "2026-11-16"})
    assert r.status_code == 200, r.text
    c = sito.collega(capo).get("/api/trasporto").json()["carburante"]
    assert (c["percentuale"], c["dal"], c["autore"]) == (35.25, "2026-11-16", "Mario Capo")
    assert capo.get("/api/admin/riepilogo").json()["carburante_giorni"] >= 0
    assert any(e["tipo"] == "carburante" and e["dettagli"] == "35.25 % dal 2026-11-16" for e in capo.get("/api/admin/eventi").json()["eventi"])


@pytest.mark.skipif(not os.environ.get("TARIC_PDF_DHL"), reason="serve TARIC_PDF_DHL con la guida di DHL Express")
def test_guida_vera(tmp_path: Path):
    codice, testo, d = leggi(Path(os.environ["TARIC_PDF_DHL"]), tmp_path)
    assert codice == 0, testo
    assert len(d["paesi"]) >= 230 and d["avvisi"] == []
    w = d["prodotti"]["worldwide"]
    if d["validita"] == "2026-01-01":
        assert L.prezzo(w["export"], 0, 30) == 453.77 and L.prezzo(w["export"], 8, 35) == 1706.61
        assert L.prezzo(w["import"], 6, 26) == 991.07                               # la cella senza il punto delle migliaia
        assert paese(d, "CN")["zona"] == 7 and paese(d, "CN")["servizi"] == ["worldwide", "12:00", "10:30"]


def test_stesso_prezzo_in_python_e_in_javascript(tmp_path: Path):
    """js/trasporto.js (il calcolatore) e prezzo() di leggi_tariffe.py fanno lo stesso conto, scatti compresi."""
    _, _, d = leggi(scrivi(tmp_path / "guida.pdf"), tmp_path)
    pesi = [0.3, 0.5, 2.2, 9.9, 10.1, 15, 19.6, 20.4, 29.9, 30.2, 44.5, 70, 70.2, 123.4, 299.9, 300.4, 1000, 2999.5]
    casi = [(p, f, iz, w) for p in ("worldwide", "economy") for f in ("export", "import")
            for iz in range(len(d["prodotti"][p][f]["zone"])) for w in pesi]
    (tmp_path / "tariffe.json").write_text(json.dumps(d))
    js = Path(__file__).resolve().parent.parent / "taric" / "static" / "js" / "trasporto.js"
    script = ("const X = require(process.argv[1]); const d = require(process.argv[2]); const casi = JSON.parse(process.argv[3]);"
              "console.log(JSON.stringify(casi.map(c => X.prezzo(d.prodotti[c[0]][c[1]], c[2], c[3]))));")
    p = subprocess.run(["node", "-e", script, str(js), str(tmp_path / "tariffe.json"), json.dumps(casi)],
                       capture_output=True, text=True, timeout=60)
    assert p.returncode == 0, p.stderr
    assert json.loads(p.stdout) == [L.prezzo(d["prodotti"][c[0]][c[1]], c[2], c[3]) for c in casi]
