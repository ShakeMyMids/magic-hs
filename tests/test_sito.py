"""Sito (modalita' server, su Render): account con approvazione dell'amministratore, accesso con password, IA unica con
limiti mensili, gestione degli utenti, protezioni, copia del database e avvio vero del server."""
from __future__ import annotations

import io
import os
import subprocess
import sys
import time
import zipfile
from pathlib import Path

import httpx
import pytest

from conftest import CAPO, INDIRIZZO, Sito

RADICE = Path(__file__).resolve().parents[1]


# ------------------------------------------------------------------ pagine e accesso
def test_pagine_del_sito(sito: Sito):
    c = sito.client()
    r = c.get("/", follow_redirects=False)
    assert r.status_code == 303 and r.headers["location"] == "/accedi"
    r = c.get("/accedi")
    assert r.status_code == 200 and "Richiedi un account" in r.text and 'name="sito_web"' in r.text
    assert "Scegli una nuova password" in c.get("/reimposta-password").text
    assert c.get("/api/io").status_code == 401 and c.get("/api/io").json()["errore"] == "Sessione scaduta: accedi di nuovo."
    assert c.get("/api/salute").json()["ok"] is True
    assert c.get("/data/2026-11-01/nomenclatura.js").status_code == 401
    assert "Strict-Transport-Security" in r.headers


def test_file_statici_con_impronta_e_compressi(sito: Sito):
    """Dopo un aggiornamento il browser prende i file nuovi (?v=impronta), e i file grandi viaggiano compressi."""
    import re
    c = sito.client()
    pagina = c.get("/accedi").text
    m = re.search(r'src="(/static/js/accesso\.js\?v=([0-9a-f]{12}))"', pagina)
    assert m and 'href="/static/css/app.css?v=' in pagina
    r = c.get(m.group(1))
    assert r.status_code == 200 and "immutable" in r.headers["cache-control"]
    assert c.get("/static/js/accesso.js").headers["cache-control"] == "no-cache"
    home = sito.capo().get("/").text
    v = re.search(r'src="/static/js/app\.js\?v=([0-9a-f]{12})"', home).group(1)
    r = c.get(f"/static/js/app.js?v={v}", headers={"Accept-Encoding": "gzip"})
    assert r.headers.get("content-encoding") == "gzip" and "function cerca(" in r.text
    import hashlib
    assert hashlib.sha256((Path(__file__).resolve().parents[1] / "taric/static/js/app.js").read_bytes()).hexdigest()[:12] == v


def test_installabile_come_app(sito: Sito):
    """Collegamento sul desktop o icona sul telefono: manifest e service worker raggiungibili anche prima dell'accesso."""
    c = sito.client()
    m = c.get("/manifest.webmanifest")
    assert m.status_code == 200 and m.headers["content-type"].startswith("application/manifest+json")
    m = m.json()
    assert (m["id"], m["start_url"], m["scope"], m["display"]) == ("/", "/", "/", "standalone") and m["name"] == "MAGIC HS"
    taglie = {i["sizes"] for i in m["icons"] if i["type"] == "image/png"}
    assert {"192x192", "512x512"} <= taglie
    for i in m["icons"]:
        assert c.get(i["src"]).status_code == 200, i["src"]
    sw = c.get("/sw.js")
    assert sw.status_code == 200 and sw.headers["content-type"].startswith("text/javascript") and sw.headers["cache-control"] == "no-cache"
    assert "addEventListener('fetch'" in sw.text and "caches." not in sw.text          # niente copie che invecchiano
    pagina = sito.capo().get("/").text
    assert 'id="installa"' in pagina and "/static/js/installa.js" in pagina and 'rel="manifest"' in pagina


def test_registrazione_e_approvazione(sito: Sito):
    capo = sito.capo()                                        # email di MAGIC_HS_AMMINISTRATORI: entra subito
    io_ = capo.get("/api/io").json()
    assert io_["ruolo"] == "amministratore" and io_["email"] == CAPO
    assert io_["ia"]["limite"] is None and io_["ia"]["configurata"]
    assert "/data/2026-11-01/" in capo.get("/").text

    c, r = sito.registra("Luca Bianchi", "Luca@Azienda.it", richiesta="ufficio import")
    assert r["stato"] == "in_attesa" and "magic_hs" not in c.cookies
    r = sito.client().post("/api/accedi", json={"email": "luca@azienda.it", "password": "Porto-Container-42"})
    assert r.status_code == 403 and r.json()["codice"] == "in_attesa"
    riep = capo.get("/api/admin/riepilogo").json()
    assert riep["in_attesa"] == 1
    voce = capo.get("/api/admin/utenti").json()["utenti"][0]
    assert (voce["email"], voce["stato"], voce["richiesta"], voce["limite"]) == ("luca@azienda.it", "in_attesa", "ufficio import", 50)
    assert capo.post(f"/api/admin/utenti/{voce['id']}/approva").json()["ok"]
    luca = sito.accedi("luca@azienda.it")
    io_ = luca.get("/api/io").json()
    assert io_["ruolo"] == "utente" and io_["ia"]["limite"] == 50
    for metodo, url in (("GET", "/api/admin/utenti"), ("GET", "/api/admin/ia"), ("PUT", "/api/admin/impostazioni"),
                        ("POST", f"/api/admin/utenti/{voce['id']}/approva"), ("GET", "/api/admin/backup"), ("POST", "/api/admin/dati/aggiorna")):
        assert luca.request(metodo, url, json={}).status_code == 403, url
    eventi = [e["tipo"] for e in capo.get("/api/admin/eventi").json()["eventi"]]
    assert "registrazione" in eventi and "approvato" in eventi


@pytest.mark.parametrize("caso,codice", [("doppio", "esiste"), ("email", "email"), ("password", "password"), ("bot", "modulo"), ("modulo", "modulo")])
def test_registrazioni_rifiutate(sito: Sito, caso: str, codice: str):
    sito.registra("Luca Bianchi", "luca@azienda.it")
    c = sito.client()
    dati = {"nome": "Altra Persona", "email": "altra@azienda.it", "password": "Porto-Container-42", "modulo": sito.modulo(c)}
    dati.update({"doppio": {"email": "LUCA@azienda.it"}, "email": {"email": "non-una-email"}, "password": {"password": "corta"},
                 "bot": {"sito_web": "https://spam.example"}, "modulo": {"modulo": "123.falso"}}[caso])
    r = c.post("/api/registrazione", json=dati)
    assert r.status_code in (400, 409, 422) and r.json()["codice"] == codice, r.text


def test_registrazioni_chiuse_e_troppe(sito: Sito):
    capo = sito.capo()
    assert capo.put("/api/admin/impostazioni", json={"registrazione_aperta": False}).status_code == 200
    assert sito.client().get("/api/modulo").json()["registrazione_aperta"] is False
    _, r = sito.registra("Luca Bianchi", "luca@azienda.it")
    assert r["stato_http"] == 403 and r["codice"] == "chiuse"
    capo.put("/api/admin/impostazioni", json={"registrazione_aperta": True})
    esiti = [sito.registra(f"Persona {k}", f"p{k}@azienda.it")[1]["stato_http"] for k in range(6)]
    assert esiti.count(429) >= 1 and esiti[0] == 200                  # al massimo 5 registrazioni all'ora dalla stessa rete


def test_password_sbagliata_e_blocco(sito: Sito):
    capo = sito.capo()
    c = sito.client()
    for _ in range(5):
        assert c.post("/api/accedi", json={"email": CAPO, "password": "sbagliata-123"}).json()["codice"] == "credenziali"
    r = c.post("/api/accedi", json={"email": CAPO, "password": "Porto-Container-42"})
    assert r.status_code == 429 and r.json()["codice"] == "troppi_tentativi"
    assert "accesso_bloccato" in [e["tipo"] for e in capo.get("/api/admin/eventi").json()["eventi"]]


def test_link_password_e_cambio(sito: Sito):
    capo = sito.capo()
    luca = sito.collega(capo)
    uid = sito.id_di(capo, "luca@azienda.it")
    link = capo.post(f"/api/admin/utenti/{uid}/link-password").json()["link"]
    assert link.startswith(INDIRIZZO + "/reimposta-password#")
    gettone = link.split("#", 1)[1]
    nuovo = sito.client()
    assert nuovo.post("/api/reimposta-password", json={"gettone": gettone, "password": "corta"}).json()["codice"] == "password"
    r = nuovo.post("/api/reimposta-password", json={"gettone": gettone, "password": "Nuova-Password-2026"})
    assert r.status_code == 200 and r.json()["entrato"] and nuovo.get("/api/io").json()["email"] == "luca@azienda.it"
    assert luca.get("/api/io").status_code == 401                         # le altre sessioni si chiudono
    assert sito.client().post("/api/reimposta-password", json={"gettone": gettone, "password": "Altra-Password-2026"}).json()["codice"] == "gettone"
    assert sito.client().post("/api/accedi", json={"email": "luca@azienda.it", "password": "Porto-Container-42"}).status_code == 401
    # cambio della password dal profilo
    assert nuovo.post("/api/io/password", json={"attuale": "sbagliata", "nuova": "Terza-Password-2026"}).status_code == 403
    altro = sito.accedi("luca@azienda.it", "Nuova-Password-2026")
    assert nuovo.post("/api/io/password", json={"attuale": "Nuova-Password-2026", "nuova": "Terza-Password-2026"}).status_code == 200
    assert altro.get("/api/io").status_code == 401 and nuovo.get("/api/io").status_code == 200
    sito.accedi("luca@azienda.it", "Terza-Password-2026")
    assert nuovo.post("/api/esci").status_code == 200 and nuovo.get("/api/io").status_code == 401


def test_sospendere_ruoli_ed_eliminare(sito: Sito):
    capo = sito.capo()
    luca = sito.collega(capo)
    uid, io_capo = sito.id_di(capo, "luca@azienda.it"), sito.id_di(capo, CAPO)
    assert capo.post(f"/api/admin/utenti/{uid}/sospendi", json={"motivo": "ha lasciato l'ufficio"}).status_code == 200
    assert luca.get("/api/io").status_code == 401
    r = sito.client().post("/api/accedi", json={"email": "luca@azienda.it", "password": "Porto-Container-42"})
    assert r.status_code == 403 and r.json()["codice"] == "sospeso"
    assert capo.post(f"/api/admin/utenti/{uid}/riattiva").status_code == 200
    luca = sito.accedi("luca@azienda.it")
    # un secondo amministratore, che poi torna utente
    assert capo.patch(f"/api/admin/utenti/{uid}", json={"ruolo": "amministratore"}).status_code == 200
    assert luca.get("/api/admin/utenti").status_code == 200
    assert luca.post(f"/api/admin/utenti/{io_capo}/sospendi").status_code == 409             # l'amministratore fisso resta
    assert luca.patch(f"/api/admin/utenti/{io_capo}", json={"ruolo": "utente"}).status_code == 409
    assert capo.patch(f"/api/admin/utenti/{io_capo}", json={"ruolo": "utente"}).status_code == 409
    capo.patch(f"/api/admin/utenti/{uid}", json={"ruolo": "utente"})
    assert luca.get("/api/admin/utenti").status_code == 403
    assert capo.delete(f"/api/admin/utenti/{io_capo}").status_code == 409
    assert capo.delete(f"/api/admin/utenti/{uid}").status_code == 200
    assert luca.get("/api/io").status_code == 401 and [x["email"] for x in capo.get("/api/admin/utenti").json()["utenti"]] == [CAPO]


def test_amministratore_dalle_variabili(ambiente):
    tmp, mp = ambiente
    sito = Sito(tmp, mp)
    capo = sito.capo()
    sito.collega(capo, "Anna Verdi", "anna@azienda.it")
    sito.riavvia(MAGIC_HS_AMMINISTRATORI=f"{CAPO}, anna@azienda.it")            # aggiunta su Render
    assert sito.accedi("anna@azienda.it").get("/api/io").json()["ruolo"] == "amministratore"


# ------------------------------------------------------------------ IA unica con i limiti
def chiedi(c, op: str, **kw):
    return c.post("/api/ia", json={"prompt": "trapano", "livello": "rapido", "operazione": op, **kw})


def test_ia_unica_con_limite_personale_e_tetto(sito: Sito):
    capo = sito.capo()
    luca = sito.collega(capo)
    uid = sito.id_di(capo, "luca@azienda.it")
    capo.put("/api/admin/impostazioni", json={"quota_predefinita": 1})
    assert chiedi(luca, "a").status_code == 200 and chiedi(luca, "a", livello="standard").status_code == 200
    r = chiedi(luca, "b")
    assert r.status_code == 429 and r.json()["codice"] == "quota_esaurita" and "amministratore" in r.json()["errore"]
    assert sito.claude.richieste[0]["chiave"] == "chiave-gemini-server"                     # la chiave del server
    assert sito.claude.richieste[0]["url"].endswith("/models/gemini-3.5-flash-lite:generateContent")
    io_ = luca.get("/api/io").json()["ia"]
    assert (io_["usate"], io_["limite"], io_["disponibile"]) == (1, 1, True)               # «disponibile»: il limite lo dice /api/ia
    # eccezione per una persona
    assert capo.patch(f"/api/admin/utenti/{uid}", json={"quota_ia": 3}).status_code == 200
    assert chiedi(luca, "b").status_code == 200
    assert capo.patch(f"/api/admin/utenti/{uid}", json={"quota_ia": 0}).status_code == 200
    assert luca.get("/api/io").json()["ia"]["disponibile"] is False
    capo.patch(f"/api/admin/utenti/{uid}", json={"quota_ia": None})
    # l'amministratore non ha limite personale, il tetto mensile vale per tutti
    for k in range(3):
        assert chiedi(capo, f"c{k}").status_code == 200
    capo.put("/api/admin/impostazioni", json={"quota_predefinita": None, "tetto_mese": 5})
    assert chiedi(luca, "d").status_code == 429 and chiedi(luca, "d").json()["codice"] == "tetto_raggiunto"
    assert chiedi(capo, "e").json()["codice"] == "tetto_raggiunto" and capo.get("/api/io").json()["ia"]["tetto"] is True
    assert chiedi(luca, "a").status_code == 200                       # la stessa classificazione puo' finire
    ia = capo.get("/api/admin/ia").json()
    assert ia["attiva"] and ia["fornitore"] == "gemini" and ia["uso"]["classificazioni"] == 5 and ia["tetto_mese"] == 5
    uso = {x["email"]: x["uso"]["classificazioni"] for x in capo.get("/api/admin/utenti").json()["utenti"]}
    assert uso == {CAPO: 3, "luca@azienda.it": 2}


def test_ia_spenta_e_prova(ambiente):
    tmp, mp = ambiente
    sito = Sito(tmp, mp, ia=False)
    capo = sito.capo()
    assert capo.get("/api/admin/ia").json()["attiva"] is False
    r = capo.post("/api/admin/ia/prova")
    assert r.status_code == 503 and "GEMINI_API_KEY" in r.json()["errore"]
    sito.riavvia(GEMINI_API_KEY="chiave-gemini-server")
    capo = sito.accedi(CAPO)
    assert capo.post("/api/admin/ia/prova").json()["modello"] == "gemini-3.5-flash-lite"
    assert capo.post("/api/admin/ia/prova?livello=standard").json()["modello"] == "gemini-3.7-flash"
    assert capo.post("/api/admin/ia/modelli").json()["modelli"] == ["gemini-3.7-flash"]


# ------------------------------------------------------------------ dati delle persone, protezioni, copia del database
def test_storico_e_preferiti_separati(sito: Sito):
    capo = sito.capo()
    luca = sito.collega(capo)
    sid = luca.post("/api/storico", json={"testo": "trapano", "codice": "8467211000", "dati": {"x": 1}}).json()["id"]
    luca.put("/api/preferiti/8467211000", json={"nota": "di Luca"})
    assert capo.get(f"/api/storico/{sid}").status_code == 404 and capo.get("/api/storico").json()["totale"] == 0
    assert capo.get("/api/preferiti").json()["voci"] == [] and capo.delete(f"/api/storico/{sid}").status_code == 200
    assert luca.get("/api/storico").json()["totale"] == 1


# file di Profilo › I tuoi dati › Esporta
ESPORTATO = {"formato": "magic-hs", "versione": 1, "esportato": "2026-11-12T10:00:00+00:00",
                 "profilo": {"nome": "Luca", "azienda": ""}, "preferenze": {"paese": "CN", "flusso": "import", "tema": "auto"},
                 "preferiti": [{"codice": "6403999610", "nota": "cliente X", "quando": "2026-11-10T09:00:00+00:00"}],
                 "storico": [{"quando": "2026-11-11T09:00:00+00:00", "testo": "scarpe", "codice": "6403999610", "dati": {"result": 2}},
                             {"quando": "2026-11-10T09:00:00+00:00", "testo": "trapano", "codice": "8467211000", "dati": {"result": 1}}]}


def test_esporta_e_importa(sito: Sito):
    capo = sito.capo()
    luca = sito.collega(capo)
    r = luca.post("/api/io/importa", json=ESPORTATO).json()
    assert (r["storico"], r["preferiti"]) == (2, 1) and luca.get("/api/preferiti").json()["voci"][0]["nota"] == "cliente X"
    assert luca.post("/api/io/importa", json=ESPORTATO).json()["storico"] == 0          # niente doppioni
    assert [v["testo"] for v in luca.get("/api/storico").json()["voci"]] == ["scarpe", "trapano"]
    r = capo.post("/api/io/importa", json=luca.get("/api/io/esporta").json()).json()    # da un account all'altro
    assert (r["storico"], r["preferiti"]) == (2, 1)
    assert capo.post("/api/io/importa", json={"formato": "altro", "storico": [], "preferiti": []}).json()["codice"] == "formato"


def test_csrf_origine_e_cookie(sito: Sito):
    capo = sito.capo()
    assert capo.put("/api/io/preferenze", json={"tema": "scuro"}, headers={"X-Taric": ""}).status_code == 403
    assert capo.put("/api/io/preferenze", json={"tema": "scuro"}, headers={"Origin": "https://altro.example"}).status_code == 403
    assert capo.put("/api/io/preferenze", json={"tema": "scuro"}, headers={"Origin": INDIRIZZO}).status_code == 200
    c = sito.client()
    r = c.post("/api/accedi", json={"email": CAPO, "password": "Porto-Container-42"})
    cookie = r.headers["set-cookie"].lower()
    assert "secure" in cookie and "httponly" in cookie and "samesite=lax" in cookie
    r = sito.client("http://localhost:10000").post("/api/accedi", json={"email": CAPO, "password": "Porto-Container-42", "ricordami": False})
    assert "secure" not in r.headers["set-cookie"].lower() and "max-age" not in r.headers["set-cookie"].lower()


def test_copia_del_database(sito: Sito):
    capo = sito.capo()
    r = capo.get("/api/admin/backup")
    assert r.status_code == 200 and r.headers["content-type"] == "application/zip"
    with zipfile.ZipFile(io.BytesIO(r.content)) as z:
        assert z.namelist() == ["taric.db"]
    assert "backup_scaricato" in [e["tipo"] for e in capo.get("/api/admin/eventi").json()["eventi"]]


# ------------------------------------------------------------------ avvio vero, come su Render
def test_server_vero(tmp_path: Path):
    porta = 18000 + os.getpid() % 1000
    env = {**os.environ, "TARIC_DATI": str(tmp_path / "dati"), "PORT": str(porta), "TARIC_SCARICA_DATI": "0", "TARIC_DATI_URL": "",
           "TARIC_CONFIG": str(tmp_path / "nessuno.env"), "MAGIC_HS_AMMINISTRATORI": CAPO}
    env.pop("GEMINI_API_KEY", None)
    p = subprocess.Popen([sys.executable, "-m", "taric", "server"], cwd=RADICE, env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
    try:
        fine = time.monotonic() + 30
        while time.monotonic() < fine:
            try:
                r = httpx.get(f"http://127.0.0.1:{porta}/api/salute", timeout=1, trust_env=False)
                if r.status_code == 200:
                    break
            except httpx.HTTPError:
                time.sleep(0.3)
        else:
            raise AssertionError("il server non risponde")
        r = httpx.get(f"http://127.0.0.1:{porta}/", trust_env=False, headers={"x-forwarded-proto": "https"})
        assert r.status_code == 303 and r.headers["location"] == "/accedi"
        assert (tmp_path / "dati" / "taric.db").is_file() and (tmp_path / "dati" / "segreto-moduli.key").is_file()
    finally:
        p.terminate()
        uscita = p.communicate(timeout=20)[0]
    assert "MAGIC HS sito" in uscita and "amministratori 1" in uscita, uscita


def test_render_e_docker():
    """render.yaml e Dockerfile: disco persistente, controllo di salute, chiave e amministratori da inserire su Render."""
    import yaml
    s = yaml.safe_load((RADICE / "render.yaml").read_text())["services"][0]
    assert (s["runtime"], s["healthCheckPath"], s["disk"]["mountPath"]) == ("docker", "/api/salute", "/var/data")
    chiavi = {v["key"]: v for v in s["envVars"]}
    assert chiavi["GEMINI_API_KEY"]["sync"] is False and chiavi["MAGIC_HS_AMMINISTRATORI"]["sync"] is False
    d = (RADICE / "Dockerfile").read_text()
    assert "TARIC_DATI=/var/data/" in d and 'CMD ["python", "-m", "taric", "server"]' in d
    assert all("value" not in v for k, v in chiavi.items() if k in ("GEMINI_API_KEY", "MAGIC_HS_AMMINISTRATORI"))   # niente segreti nel file
