"""Chi è online adesso (Gestione › Utenti, «Online ora»): le pagine mandano un segnale ogni minuto (POST /api/io/presenza),
il sito lo tiene in memoria per sessione (taric/presenze.py) e l'amministratore vede le persone con i dispositivi."""
from __future__ import annotations

from conftest import Sito
from taric.presenze import FERMO, FINESTRA, Presenze, dispositivo

IPHONE = ("Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 "
          "Mobile/15E148 Safari/604.1")
EDGE = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 "
        "Edg/131.0.0.0")
IPAD = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15"
ANDROID = ("Mozilla/5.0 (Linux; Android 14; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 "
           "Chrome/122.0.0.0 Safari/537.36")


def test_dispositivo_dall_user_agent():
    assert dispositivo(IPHONE) == ("telefono", "Safari su iPhone")
    assert dispositivo(EDGE) == ("computer", "Edge su Windows")
    assert dispositivo(IPAD) == ("computer", "Safari su Mac") and dispositivo(IPAD, tocco=True) == ("tablet", "Safari su iPad")
    assert dispositivo(ANDROID) == ("tablet", "Samsung Internet su Android")
    assert dispositivo(IPHONE.replace("Version/18.1", "CriOS/131.0")) == ("telefono", "Chrome su iPhone")
    assert dispositivo("Mozilla/5.0 (X11; Linux x86_64; rv:133.0) Gecko/20100101 Firefox/133.0") == ("computer", "Firefox su Linux")
    assert dispositivo("") == ("computer", "Browser sconosciuto")


def test_stati_e_scadenza():
    t = [1000.0]
    p = Presenze(lambda: t[0])
    p.segnala("s1", 7, visibile=True, fermo=0, agente=EDGE, tocco=False)
    t[0] += 60
    p.segnala("s1", 7, visibile=True, fermo=FERMO + 1, agente=EDGE, tocco=False)
    ora, voci = p.attive()
    assert voci["s1"].stato(ora) == "fermo" and ora - voci["s1"].da == 60          # la visita continua: «da» resta il primo segnale
    p.segnala("s1", 7, visibile=False, fermo=0, agente=EDGE, tocco=False)
    assert p.attive()[1]["s1"].stato(t[0]) == "sfondo"
    t[0] += FINESTRA + 1                                                            # nessun segnale: non è più online
    assert p.attive()[1] == {}
    p.segnala("s1", 7, visibile=True, fermo=10 ** 9, agente=EDGE, tocco=False)        # una visita nuova; «fermo» limitato
    assert p.attive()[1]["s1"].da == t[0]
    p.togli("s1")
    assert p.attive()[1] == {}


def test_piu_schede_dello_stesso_browser():
    """Due schede con la stessa sessione: basta una scheda davanti perché la persona sia attiva; la chiusa scade da sola."""
    t = [1000.0]
    p = Presenze(lambda: t[0])
    p.segnala("s1", 7, scheda="a", visibile=True, fermo=0, agente=EDGE, tocco=False)
    t[0] += 30
    p.segnala("s1", 7, scheda="b", visibile=False, fermo=FERMO + 100, agente=EDGE, tocco=False)
    ora, voci = p.attive()
    assert list(voci) == ["s1"] and voci["s1"].stato(ora) == "attivo" and ora - voci["s1"].da == 30
    t[0] += FINESTRA - 10                           # la scheda «a» non manda più segnali, la «b» sì
    p.segnala("s1", 7, scheda="b", visibile=False, fermo=0, agente=EDGE, tocco=False)
    t[0] += 11
    ora, voci = p.attive()
    assert list(voci["s1"].schede) == ["b"] and voci["s1"].stato(ora) == "sfondo"
    for k in range(25):                             # schede senza fine: se ne tengono al massimo 20
        p.segnala("s1", 7, scheda=f"x{k}", visibile=True, fermo=0, agente=EDGE, tocco=False)
    assert len(p.attive()[1]["s1"].schede) == 20


def test_online_per_l_amministratore(sito: Sito):
    t = [1_800_000_000.0]
    sito.app.state.presenze.orologio = lambda: t[0]
    capo = sito.capo()
    luca = sito.collega(capo)
    luca_tel = sito.accedi("luca@azienda.it")
    anna = sito.collega(capo, "Anna Verdi", "anna@altra.it")
    assert capo.get("/api/admin/online").json()["persone"] == []

    assert capo.post("/api/io/presenza", json={"visibile": True, "fermo": 0}).json() == {"ok": True}
    assert luca.post("/api/io/presenza", json={"visibile": True, "fermo": 2}, headers={"User-Agent": EDGE}).status_code == 200
    t[0] += 30
    assert luca_tel.post("/api/io/presenza", json={"visibile": False, "fermo": 0}, headers={"User-Agent": IPHONE}).status_code == 200
    assert anna.post("/api/io/presenza", json={"visibile": True, "fermo": FERMO + 60}, headers={"User-Agent": IPAD},
                     ).status_code == 200
    r = capo.get("/api/admin/online").json()
    assert [(x["nome"], x["stato"]) for x in r["persone"]] == [("Luca Bianchi", "attivo"), ("Mario Capo", "attivo"), ("Anna Verdi", "fermo")]
    lu = r["persone"][0]
    assert (lu["email"], lu["da"]) == ("luca@azienda.it", 30)
    assert [(d["tipo"], d["descrizione"], d["stato"], d["da"]) for d in lu["dispositivi"]] == \
        [("computer", "Edge su Windows", "attivo", 30), ("telefono", "Safari su iPhone", "sfondo", 0)]
    assert r["persone"][2]["dispositivi"][0]["fermo"] == FERMO + 60 and r["io"] == sito.id_di(capo, "capo@azienda.it")

    # solo l'amministratore; il segnale è una modifica (X-Taric) e chiede una sessione
    assert luca.get("/api/admin/online").status_code == 403
    assert sito.client().post("/api/io/presenza", json={}).status_code == 401
    senza = sito.client()
    senza.headers.pop("X-Taric")
    assert senza.post("/api/io/presenza", json={}).json()["codice"] == "csrf"
    assert luca.post("/api/io/presenza", json={"fermo": -1}).status_code == 422

    # chi esce, chi viene sospeso e chi non manda più segnali sparisce dall'elenco
    luca_tel.post("/api/esci")
    assert [d["tipo"] for d in capo.get("/api/admin/online").json()["persone"][0]["dispositivi"]] == ["computer"]
    assert capo.post(f"/api/admin/utenti/{sito.id_di(capo, 'anna@altra.it')}/sospendi", json={}).status_code == 200
    assert [x["nome"] for x in capo.get("/api/admin/online").json()["persone"]] == ["Luca Bianchi", "Mario Capo"]
    t[0] += FINESTRA - 29
    capo.post("/api/io/presenza", json={"visibile": True})
    assert [x["nome"] for x in capo.get("/api/admin/online").json()["persone"]] == ["Mario Capo"]
