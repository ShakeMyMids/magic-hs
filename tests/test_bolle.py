"""Bolla simulata lato server: cambio doganale del mese (taric/valute.py) e bolle salvate nel profilo."""
from __future__ import annotations

import datetime as dt

from conftest import Sito
from taric.valute import giorno_cambio


def test_giorno_del_cambio():
    # penultimo mercoledì del mese precedente (gli stessi casi di tests/prova_calcolo.js)
    assert giorno_cambio("2026-11") == dt.date(2026, 10, 21)
    assert giorno_cambio("2026-01") == dt.date(2025, 12, 24)
    assert giorno_cambio("2026-03") == dt.date(2026, 2, 18)
    assert giorno_cambio("2027-01") == dt.date(2026, 12, 23)
    assert giorno_cambio("2026-09") == dt.date(2026, 8, 19)
    for anno in range(2024, 2031):
        for mese in range(1, 13):
            g = giorno_cambio(f"{anno}-{mese:02d}")
            assert g.weekday() == 2 and (g + dt.timedelta(days=7)).month == g.month and (g + dt.timedelta(days=14)).month != g.month


def test_cambio_del_mese(sito: Sito):
    c = sito.capo()
    r = c.get("/api/cambio", params={"valuta": "usd", "data": "2026-11-14"})
    assert r.status_code == 200, r.text
    assert r.json() == {"valuta": "USD", "mese": "2026-11", "tasso": 1.0867, "testo": "1.0867", "giorno": "2026-10-21",
                        "riferimento": "2026-10-21", "fonte": "BCE, cambio di riferimento del 21/10/2026"}
    req = sito.bce.richieste[-1]
    assert req.url.path.endswith("/D.USD.EUR.SP00.A") and req.url.params["format"] == "csvdata"
    assert req.url.params["endPeriod"] == "2026-10-21"
    # stesso mese: dalla memoria, senza chiedere di nuovo alla BCE
    n = len(sito.bce.richieste)
    assert c.get("/api/cambio", params={"valuta": "USD", "data": "2026-11-30"}).json()["tasso"] == 1.0867
    assert len(sito.bce.richieste) == n
    # ottobre: il penultimo mercoledì di settembre è il 23
    assert c.get("/api/cambio", params={"valuta": "USD", "data": "2026-10-01"}).json()["giorno"] == "2026-09-23"
    assert c.get("/api/cambio", params={"valuta": "EUR", "data": "2026-11-14"}).json()["tasso"] == 1.0


def test_cambio_del_giorno_prima_se_quel_mercoledi_manca(sito: Sito):
    c = sito.capo()
    del sito.bce.cambi["USD"]["2026-10-21"]                 # per esempio un giorno di chiusura
    r = c.get("/api/cambio", params={"valuta": "USD", "data": "2026-11-02"}).json()
    assert (r["tasso"], r["giorno"], r["riferimento"]) == (1.0835, "2026-10-20", "2026-10-21")


def test_cambio_non_ancora_pubblicato_il_giorno_stesso(sito: Sito, tmp_path):
    # il penultimo mercoledì, prima delle 16, la BCE ha solo il cambio del giorno avanti: non si prende e non si tiene
    import httpx
    from taric.db import Database
    from taric.valute import CambiDoganali, ErroreCambio
    del sito.bce.cambi["USD"]["2026-10-21"]
    cambi = CambiDoganali(Database(tmp_path / "prova.db"), "https://bce.test/EXR", httpx.Client(transport=httpx.MockTransport(sito.bce)))
    try:
        cambi.tasso("USD", dt.date(2026, 11, 3), oggi=dt.date(2026, 10, 21))
        raise AssertionError("doveva fermarsi")
    except ErroreCambio as e:
        assert (e.stato, e.codice) == (409, "cambio_non_fissato") and "si fissa oggi, 21/10/2026" in e.messaggio
    sito.bce.cambi["USD"]["2026-10-21"] = "1.1234"         # pubblicato nel pomeriggio
    assert cambi.tasso("USD", dt.date(2026, 11, 3), oggi=dt.date(2026, 10, 21))["tasso"] == 1.1234
    # il giorno dopo, se quel mercoledì la BCE non ha pubblicato, vale il cambio più recente (art. 146, par. 2)
    del sito.bce.cambi["USD"]["2026-09-23"]
    assert cambi.tasso("USD", dt.date(2026, 10, 3), oggi=dt.date(2026, 9, 24))["giorno"] == "2026-09-22"


def test_cambio_periodo_senza_cambi(sito: Sito):
    c = sito.capo()
    sito.bce.cambi["CNY"] = {}
    r = c.get("/api/cambio", params={"valuta": "CNY", "data": "2026-11-14"})
    assert r.status_code == 404 and r.json()["codice"] == "valuta_non_quotata" and "prima del 21/10/2026" in r.json()["errore"]


def test_cambio_errori(sito: Sito):
    c = sito.capo()
    r = c.get("/api/cambio", params={"valuta": "XAU", "data": "2026-11-14"})
    assert r.status_code == 404 and r.json()["codice"] == "valuta_non_quotata" and "Banca d'Italia" in r.json()["errore"]
    r = c.get("/api/cambio", params={"valuta": "USD", "data": "2099-03-10"})
    assert r.status_code == 409 and r.json()["codice"] == "cambio_non_fissato" and "si fissa il 18/02/2099" in r.json()["errore"]
    assert c.get("/api/cambio", params={"valuta": "US", "data": "2026-11-14"}).status_code == 422
    assert c.get("/api/cambio", params={"valuta": "USD", "data": "14/11/2026"}).json()["codice"] == "data"
    sito.bce.guasto = True
    r = c.get("/api/cambio", params={"valuta": "CNY", "data": "2026-11-14"})
    assert r.status_code == 503 and r.json()["codice"] == "bce_non_raggiungibile"
    sito.bce.guasto = False
    assert c.get("/api/cambio", params={"valuta": "CNY", "data": "2026-11-14"}).json()["tasso"] == 7.7341
    assert sito.client().get("/api/cambio", params={"valuta": "USD", "data": "2026-11-14"}).status_code == 401


BOLLA = {"data": "2026-11-14", "valuta": "USD", "nolo": {"importo": "550", "valuta": "USD"},
         "articoli": [{"codice": "8712003000", "origine": "CN", "valore": "11000", "addizionali": ["B999"]},
                      {"codice": "6403999610", "origine": "VN", "valore": "5500", "regime": "142-VN-"}]}


def test_bolle_salvate(sito: Sito):
    capo = sito.capo()
    luca = sito.collega(capo)
    r = luca.post("/api/bolle", json={"tipo": "import", "riferimento": " Fattura 118/2026 ", "dati": BOLLA})
    assert r.status_code == 200, r.text
    bid = r.json()["id"]
    voci = luca.get("/api/bolle").json()["voci"]
    assert [(v["id"], v["tipo"], v["riferimento"], v["data"], v["articoli"]) for v in voci] == [(bid, "import", "Fattura 118/2026", "2026-11-14", 2)]
    assert luca.get(f"/api/bolle/{bid}").json()["dati"] == BOLLA
    # modifica
    nuova = {**BOLLA, "articoli": BOLLA["articoli"][:1]}
    assert luca.put(f"/api/bolle/{bid}", json={"riferimento": "Fattura 118", "dati": nuova}).status_code == 200
    assert luca.get(f"/api/bolle/{bid}").json()["riferimento"] == "Fattura 118"
    assert luca.get("/api/bolle").json()["voci"][0]["articoli"] == 1
    # le bolle sono personali: l'amministratore non le vede e non le tocca
    assert capo.get("/api/bolle").json()["voci"] == []
    assert capo.get(f"/api/bolle/{bid}").status_code == 404
    assert capo.put(f"/api/bolle/{bid}", json={"dati": {}}).status_code == 404
    assert capo.delete(f"/api/bolle/{bid}").status_code == 404
    # esportazione
    e = luca.post("/api/bolle", json={"tipo": "export", "dati": {"data": "2026-11-14", "articoli": []}}).json()["id"]
    assert [v["tipo"] for v in luca.get("/api/bolle").json()["voci"]] == ["export", "import"]
    assert luca.delete(f"/api/bolle/{e}").status_code == 200
    assert luca.get(f"/api/bolle/{e}").status_code == 404
    # errori
    assert luca.post("/api/bolle", json={"tipo": "transito", "dati": {}}).status_code == 422
    r = luca.post("/api/bolle", json={"tipo": "import", "dati": {"articoli": [{}] * 100}})
    assert r.status_code == 413 and r.json()["codice"] == "troppo_grande"
    assert sito.client().get("/api/bolle").status_code == 401
    # eliminando l'account si eliminano anche le sue bolle
    uid = sito.id_di(capo, "luca@azienda.it")
    assert capo.delete(f"/api/admin/utenti/{uid}").status_code == 200
    with sito.app.state.db.connessione() as c:
        assert c.execute("SELECT COUNT(*) FROM bolle").fetchone()[0] == 0
