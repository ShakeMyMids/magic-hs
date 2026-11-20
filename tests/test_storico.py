"""Misure a una data passata: i dati TARIC dei mesi passati si prendono da GitHub (pagina «dati») quando servono, restano
in dati/taric/archivio e il server ne serve i file direttamente dall'archivio (taric/dati.py, /api/dati/storico)."""
from __future__ import annotations

import json
import zipfile
import io

from conftest import FintoGitHub, Sito, zip_dei_dati


def con_dati(ambiente, **mesi: bytes) -> Sito:
    tmp, mp = ambiente
    return Sito(tmp, mp, github=FintoGitHub(dati={m[1:].replace("_", "-"): b for m, b in mesi.items()}))


def scaricati(sito: Sito) -> list[str]:
    return [u for u in sito.github.richieste if "/releases/download/" in u]


def test_mese_passato_preso_da_github_e_servito_dall_archivio(ambiente):
    tmp, _ = ambiente
    sito = con_dati(ambiente, m2025_09=zip_dei_dati("2025-09-01", tmp / "o1"), m2026_11=zip_dei_dati("2026-11-01", tmp / "o2"))
    capo = sito.capo()
    # dalla data dei dati in uso in poi valgono quelli
    assert capo.get("/api/dati/storico", params={"data": "2026-11-20"}).json() == {"versione": "2026-11-01", "attuale": True}
    assert capo.get("/api/dati/storico", params={"data": "2027-01-01"}).json()["attuale"] is True
    # prima: il mese piu' recente non successivo, scaricato e tenuto
    r = capo.get("/api/dati/storico", params={"data": "2025-10-15"})
    assert r.status_code == 200, r.text
    assert r.json() == {"versione": "2025-09-01", "attuale": False, "giorni": 44}
    assert (sito.cartella / "dati" / "taric" / "archivio" / "dati-2025-09-01.zip").is_file()
    assert len(scaricati(sito)) == 1
    assert capo.get("/api/dati/storico", params={"data": "2025-09-01"}).json()["versione"] == "2025-09-01"
    assert len(scaricati(sito)) == 1                                   # la seconda volta dall'archivio
    # i file si servono senza estrarli, solo con i nomi ammessi
    r = capo.get("/data/2025-09-01/nomenclatura.js")
    assert r.status_code == 200 and "2025-09-01" in r.text and r.headers["content-type"].startswith("text/javascript")
    assert "immutable" in r.headers["cache-control"]
    assert capo.get("/data/2025-09-01/versione.json").json() == {"data": "2025-09-01"}
    assert capo.get("/data/2025-09-01/m/84.js").status_code == 200
    for nome in ("m/85.js", "programma.exe", "../taric.db", "m/../../x.js"):
        assert capo.get(f"/data/2025-09-01/{nome}").status_code == 404, nome
    assert sito.client().get("/data/2025-09-01/nomenclatura.js").status_code == 401
    # l'app con i dati di quel mese
    html = capo.get("/", params={"dati": "2025-09-01"}).text
    assert 'src="/data/2025-09-01/nomenclatura.js?v=' in html and 'data-attivi="2026-11-01"' in html
    assert f'data-v="{sito.app.state.dati.impronta("2025-09-01")}"' in html and "{{V}}" not in html     # impronta dei file dei dati
    assert 'data-attivi="2026-11-01"' in capo.get("/").text and "/data/2026-11-01/" in capo.get("/").text
    for altro in ("2024-01-01", "2025-09-1", "../x"):
        r = capo.get("/", params={"dati": altro}, follow_redirects=False)
        assert r.status_code == 303 and r.headers["location"] == "/", altro


def test_mese_passato_che_non_c_e(ambiente):
    tmp, _ = ambiente
    sito = con_dati(ambiente, m2025_07=zip_dei_dati("2025-07-01", tmp / "o1"), m2026_11=zip_dei_dati("2026-11-01", tmp / "o2"))
    capo = sito.capo()
    r = capo.get("/api/dati/storico", params={"data": "2024-03-10"})
    assert r.status_code == 404 and r.json()["codice"] == "storico_non_disponibile"
    assert r.json()["errore"] == "MAGIC HS non ha i dati TARIC del 10/03/2024: l'archivio parte dal 01/07/2025."
    assert capo.get("/api/dati/storico", params={"data": "10/03/2024"}).status_code == 422
    assert sito.client().get("/api/dati/storico", params={"data": "2025-08-01"}).status_code == 401
    assert not scaricati(sito)


def test_mese_passato_scaricato_male_non_si_tiene(ambiente):
    tmp, mp = ambiente
    buono = zip_dei_dati("2025-09-01", tmp / "o1")
    altro_mese = zip_dei_dati("2025-08-01", tmp / "o2")
    for caso, gh in {
        "impronta": FintoGitHub(dati={"2025-09": buono}, digest_dati={"2025-09": "sha256:" + "0" * 64}),
        "altro_mese": FintoGitHub(dati={"2025-09": altro_mese}),
        "non_zip": FintoGitHub(dati={"2025-09": b"PK\x03\x04 non finito"}),
    }.items():
        sito = Sito(tmp, mp, github=gh, nome=caso)
        capo = sito.capo()
        r = capo.get("/api/dati/storico", params={"data": "2025-09-20"})
        assert r.status_code == 503 and r.json()["codice"] == "storico_non_raggiungibile", caso
        assert not list((sito.cartella / "dati" / "taric" / "archivio").iterdir()), caso
        assert capo.get("/", params={"dati": "2025-09-01"}, follow_redirects=False).status_code == 303


def test_github_non_risponde(ambiente):
    tmp, mp = ambiente
    sito = Sito(tmp, mp, github=FintoGitHub(errore=500), versioni=("2026-10-01", "2026-11-01"))
    capo = sito.capo()
    # i mesi gia' sul server restano consultabili; per gli altri si dice di riprovare
    assert capo.get("/api/dati/storico", params={"data": "2026-10-31"}).json() == {"versione": "2026-10-01", "attuale": False, "giorni": 30}
    r = capo.get("/api/dati/storico", params={"data": "2026-09-30"})
    assert r.status_code == 503 and r.json()["codice"] == "storico_non_raggiungibile"


def test_archivio_con_file_in_piu_o_troppo_grande(ambiente):
    tmp, mp = ambiente
    con_extra = zip_dei_dati("2025-09-01", tmp / "o1", {"programma.exe": "no", "../fuori.js": "no"})
    b = io.BytesIO()
    with zipfile.ZipFile(b, "w") as z:
        z.writestr("versione.json", json.dumps({"data": "2025-10-01"}))
        z.writestr("nomenclatura.js", "x")
        for k in range(501):
            z.writestr(f"note-{k}.txt", "x")
    sito = Sito(tmp, mp, github=FintoGitHub(dati={"2025-09": con_extra, "2025-10": b.getvalue()}))
    capo = sito.capo()
    assert capo.get("/api/dati/storico", params={"data": "2025-09-10"}).json()["versione"] == "2025-09-01"
    assert capo.get("/data/2025-09-01/programma.exe").status_code == 404      # i file in piu' non si servono mai
    assert capo.get("/api/dati/storico", params={"data": "2025-10-10"}).status_code == 503
