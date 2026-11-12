"""Test delle API: configurazione, accessi, registrazione automatica, amministrazione, IA, profilo, dati."""
from __future__ import annotations

import httpx

from conftest import FintoClaude, Sito


def iscrivi(sito: Sito, c, email: str, nome: str = "Mario Rossi", password: str = "Password-Nuova-1", **extra):
    corpo = {"nome": nome, "azienda": "Rossi Srl", "email": email, "password": password, "richiesta": "import di utensili",
             "consenso": True, "sito_web": "", "modulo": sito.modulo()}
    corpo.update(extra)
    return c.post("/api/registrazione", json=corpo)


# ------------------------------------------------------------------ configurazione iniziale
def test_primo_avvio_chiede_configurazione_con_codice(sito: Sito):
    c = sito.client()
    r = c.get("/", follow_redirects=False)
    assert r.status_code == 303 and r.headers["location"] == "/configura"
    r = c.post("/api/configurazione-iniziale", json={"codice": "SBAGLIATO", "nome": "A", "email": "a@b.it", "password": "Password-Admin-1"})
    assert r.status_code in (403, 422)
    a = sito.admin()
    io = a.get("/api/io").json()
    assert io["ruolo"] == "amministratore" and io["ia"]["limite"] is None
    # una seconda configurazione non e' possibile
    r = sito.client().post("/api/configurazione-iniziale", json={"codice": "X", "nome": "Altro", "email": "x@y.it", "password": "Password-Altra-1"})
    assert r.status_code == 409
    assert sito.client().get("/configura", follow_redirects=False).status_code == 303


def test_senza_intestazione_anti_csrf_le_modifiche_sono_rifiutate(sito: Sito):
    a = sito.admin()
    r = a.put("/api/io/preferenze", json={"paese": "CN"}, headers={"X-Taric": ""})
    assert r.status_code == 403
    r = a.put("/api/io/preferenze", json={"paese": "CN"}, headers={"Origin": "https://altro-sito.example"})
    assert r.status_code == 403
    assert a.put("/api/io/preferenze", json={"paese": "CN", "flusso": "export", "tema": "scuro"}).status_code == 200
    assert a.get("/api/io").json()["preferenze"] == {"paese": "CN", "flusso": "export", "tema": "scuro"}


def test_intestazioni_di_sicurezza(sito: Sito):
    r = sito.client().get("/accedi")
    assert "script-src 'self'" in r.headers["content-security-policy"]
    assert r.headers["x-frame-options"] == "DENY"


# ------------------------------------------------------------------ accesso
def test_accesso_errato_poi_blocco_temporaneo(sito: Sito):
    a = sito.admin()
    sito.utente(a, "luca@esempio.it")
    c = sito.client()
    for _ in range(5):
        assert c.post("/api/accedi", json={"email": "luca@esempio.it", "password": "sbagliata-123"}).status_code == 401
    r = c.post("/api/accedi", json={"email": "luca@esempio.it", "password": "Password-Utente-1"})
    assert r.status_code == 429
    # l'email inesistente da' lo stesso messaggio della password sbagliata
    r = c.post("/api/accedi", json={"email": "nessuno@esempio.it", "password": "qualcosa-123"})
    assert r.status_code == 401 and r.json()["errore"] == "Email o password non corretti."


def test_uscita_chiude_la_sessione(sito: Sito):
    a = sito.admin()
    assert a.get("/api/io").status_code == 200
    assert a.post("/api/esci").status_code == 200
    assert a.get("/api/io").status_code == 401
    assert a.get("/", follow_redirects=False).headers["location"] == "/accedi"


# ------------------------------------------------------------------ registrazione senza posta: decide l'amministratore
def test_registrazione_senza_posta_va_in_attesa_e_avvisa_admin(sito: Sito):
    a = sito.admin()
    c = sito.client()
    r = iscrivi(sito, c, "mario@rossi.it")
    assert r.status_code == 200, r.text
    assert "approvata" in r.json()["messaggio"]
    r = c.post("/api/accedi", json={"email": "mario@rossi.it", "password": "Password-Nuova-1"})
    assert r.status_code == 403 and r.json()["codice"] == "in_attesa"
    avvisi = [m for m in sito.posta_in_uscita() if m["a"] == "admin@esempio.it"]
    assert avvisi and "Mario Rossi" in avvisi[0]["oggetto"] and "NON verificata" in avvisi[0]["testo"]
    utenti = a.get("/api/admin/utenti").json()["utenti"]
    mario = next(u for u in utenti if u["email"] == "mario@rossi.it")
    assert mario["stato"] == "in_attesa" and utenti[0]["email"] == "mario@rossi.it"     # le richieste in attesa vengono prima
    assert a.post(f"/api/admin/utenti/{mario['id']}/approva").status_code == 200
    assert c.post("/api/accedi", json={"email": "mario@rossi.it", "password": "Password-Nuova-1"}).status_code == 200
    assert c.get("/api/io").json()["ia"]["limite"] == 50


def test_registrazione_rifiuta_bot_e_dati_non_validi(sito: Sito):
    sito.admin()
    c = sito.client()
    assert iscrivi(sito, c, "bot@spam.it", sito_web="http://spam").status_code == 400
    assert iscrivi(sito, c, "bot@spam.it", modulo="123.abc").status_code == 400
    r = iscrivi(sito, c, "x@spam.it", modulo=c.get("/api/registrazione/modulo").json()["modulo"])   # compilato troppo in fretta
    assert r.status_code == 400
    assert iscrivi(sito, c, "non-email").status_code == 422
    assert iscrivi(sito, c, "corta@esempio.it", password="corta").status_code == 422
    assert iscrivi(sito, c, "no-consenso@esempio.it", consenso=False).status_code == 422


def test_registrazioni_chiuse_e_domini_bloccati(sito: Sito):
    a = sito.admin()
    imp = a.get("/api/admin/impostazioni").json()
    imp.update(domini_bloccati=["spam.it"], registrazione_aperta=True)
    assert a.put("/api/admin/impostazioni", json=imp).status_code == 200
    r = iscrivi(sito, sito.client(), "x@spam.it")
    assert r.status_code == 403 and "dominio" in r.json()["errore"]
    imp["registrazione_aperta"] = False
    a.put("/api/admin/impostazioni", json=imp)
    assert iscrivi(sito, sito.client(), "y@ok.it").status_code == 403
    imp["domini_approvati"] = ["non valido!"]
    assert a.put("/api/admin/impostazioni", json=imp).status_code == 422


def test_limite_di_registrazioni_per_rete(sito: Sito):
    sito.admin()
    c = sito.client()
    esiti = [iscrivi(sito, c, f"u{i}@esempio.it").status_code for i in range(6)]
    assert esiti[:5] == [200] * 5 and esiti[5] == 429


# ------------------------------------------------------------------ registrazione con posta: il "bot" applica le regole
def test_conferma_email_e_approvazione_automatica_per_dominio(sito_con_posta: Sito):
    s = sito_con_posta
    a = s.admin()
    imp = a.get("/api/admin/impostazioni").json()
    imp["domini_approvati"] = ["azienda.it"]
    a.put("/api/admin/impostazioni", json=imp)
    c = s.client()
    assert iscrivi(s, c, "anna@azienda.it", nome="Anna").status_code == 200
    assert iscrivi(s, c, "paolo@altro.it", nome="Paolo").status_code == 200
    # finche' l'email non e' confermata non si entra
    r = c.post("/api/accedi", json={"email": "anna@azienda.it", "password": "Password-Nuova-1"})
    assert r.status_code == 403 and r.json()["codice"] == "email_da_confermare"

    def link(email: str) -> str:
        m = [x for x in s.posta_inviata if x["a"] == email and "conferma" in x["oggetto"]][-1]
        return m["testo"].split("/conferma-email#", 1)[1].split()[0]

    r = c.post("/api/conferma-email", json={"gettone": link("anna@azienda.it")})
    assert r.json()["stato"] == "attivo"
    assert c.post("/api/accedi", json={"email": "anna@azienda.it", "password": "Password-Nuova-1"}).status_code == 200
    assert any(m["a"] == "anna@azienda.it" and "attivo" in m["oggetto"] for m in s.posta_inviata)

    g = link("paolo@altro.it")
    r = s.client().post("/api/conferma-email", json={"gettone": g})
    assert r.json()["stato"] == "in_attesa"
    assert any(m["a"] == "admin@esempio.it" and "Paolo" in m["oggetto"] for m in s.posta_inviata)
    # il link si usa una volta sola
    assert s.client().post("/api/conferma-email", json={"gettone": g}).status_code == 400
    # registrarsi di nuovo con un'email gia' presente non rivela nulla
    r = iscrivi(s, s.client(), "anna@azienda.it")
    assert r.status_code == 200 and "Ti abbiamo inviato" in r.json()["messaggio"]


def test_password_dimenticata_con_posta(sito_con_posta: Sito):
    s = sito_con_posta
    a = s.admin()
    s.utente(a, "bea@esempio.it")
    c = s.client()
    r = c.post("/api/password-dimenticata", json={"email": "bea@esempio.it"})
    assert r.status_code == 200
    r2 = c.post("/api/password-dimenticata", json={"email": "nessuno@esempio.it"})
    assert r2.json()["messaggio"] == r.json()["messaggio"]
    testo = [m for m in s.posta_inviata if m["a"] == "bea@esempio.it" and "reimposta" in m["oggetto"]][-1]["testo"]
    g = testo.split("/reimposta-password#", 1)[1].split()[0]
    assert c.post("/api/reimposta-password", json={"gettone": g, "password": "Nuova-Password-99"}).json()["entrato"]
    assert s.client().post("/api/accedi", json={"email": "bea@esempio.it", "password": "Password-Utente-1"}).status_code == 401
    assert s.client().post("/api/accedi", json={"email": "bea@esempio.it", "password": "Nuova-Password-99"}).status_code == 200


# ------------------------------------------------------------------ amministrazione
def test_le_funzioni_admin_sono_riservate(sito: Sito):
    a = sito.admin()
    u = sito.utente(a, "u@esempio.it")
    for metodo, url in (("get", "/api/admin/utenti"), ("get", "/api/admin/impostazioni"), ("get", "/api/admin/dati"),
                        ("post", "/api/admin/dati/aggiorna"), ("get", "/api/admin/eventi")):
        r = getattr(u, metodo)(url, **({"json": {}} if metodo == "post" else {}))
        assert r.status_code == 403, url
        r = getattr(sito.client(), metodo)(url, **({"json": {}} if metodo == "post" else {}))
        assert r.status_code == 401, url


def test_sospensione_chiude_le_sessioni_e_protegge_se_stessi(sito: Sito):
    a = sito.admin()
    u = sito.utente(a, "u@esempio.it")
    uid = u.get("/api/io").json()["id"]
    io_admin = a.get("/api/io").json()["id"]
    assert a.post(f"/api/admin/utenti/{io_admin}/sospendi", json={"motivo": "x"}).status_code == 409
    assert a.patch(f"/api/admin/utenti/{io_admin}", json={"ruolo": "utente"}).status_code == 409
    assert a.delete(f"/api/admin/utenti/{io_admin}").status_code == 409
    assert a.post(f"/api/admin/utenti/{uid}/sospendi", json={"motivo": "fine contratto"}).status_code == 200
    assert u.get("/api/io").status_code == 401
    r = sito.client().post("/api/accedi", json={"email": "u@esempio.it", "password": "Password-Utente-1"})
    assert r.status_code == 403 and r.json()["codice"] == "sospeso"
    assert a.post(f"/api/admin/utenti/{uid}/riattiva").status_code == 200
    assert sito.client().post("/api/accedi", json={"email": "u@esempio.it", "password": "Password-Utente-1"}).status_code == 200
    eventi = [e["tipo"] for e in a.get("/api/admin/eventi").json()["eventi"]]
    assert "sospeso" in eventi and "riattivato" in eventi and "utente_creato" in eventi


def test_link_password_dall_amministratore(sito: Sito):
    a = sito.admin()
    u = sito.utente(a, "u@esempio.it")
    uid = u.get("/api/io").json()["id"]
    link = a.post(f"/api/admin/utenti/{uid}/link-password", json={}).json()["link"]
    r = sito.client().post("/api/reimposta-password", json={"gettone": link.split("#")[1], "password": "Password-Nuova-77"})
    assert r.status_code == 200
    assert u.get("/api/io").status_code == 401      # le sessioni precedenti vengono chiuse


def test_promozione_ad_amministratore_e_eliminazione(sito: Sito):
    a = sito.admin()
    u = sito.utente(a, "u@esempio.it")
    uid = u.get("/api/io").json()["id"]
    assert a.patch(f"/api/admin/utenti/{uid}", json={"ruolo": "amministratore"}).status_code == 200
    assert u.get("/api/admin/utenti").status_code == 200
    assert a.delete(f"/api/admin/utenti/{uid}").status_code == 200
    assert u.get("/api/io").status_code == 401


# ------------------------------------------------------------------ IA e limiti
def test_ia_risponde_json_e_conta_le_richieste(sito: Sito):
    a = sito.admin()
    u = sito.utente(a, "u@esempio.it", quota=2)
    sito.claude.risposte = [FintoClaude.testo('```json\n{"voci": [{"voce": "8467"}]}\n```'), FintoClaude.testo('[1, 2]')]
    r = u.post("/api/ia", json={"prompt": "trapano", "livello": "rapido"})
    assert r.status_code == 200 and r.json()["risultato"] == {"voci": [{"voce": "8467"}]}
    assert sito.claude.richieste[0]["corpo"]["model"] == "claude-haiku-5-5"
    assert sito.claude.richieste[0]["chiave"] == "chiave-di-prova"
    assert u.post("/api/ia", json={"prompt": "x", "livello": "standard"}).json()["risultato"] == [1, 2]
    assert sito.claude.richieste[1]["corpo"]["model"] == "claude-sonnet-5-5"
    r = u.post("/api/ia", json={"prompt": "terza", "livello": "rapido"})
    assert r.status_code == 429 and r.json()["codice"] == "quota_esaurita"
    assert len(sito.claude.richieste) == 2
    assert u.get("/api/io").json()["ia"]["usate"] == 2
    # l'amministratore alza il limite
    uid = u.get("/api/io").json()["id"]
    a.patch(f"/api/admin/utenti/{uid}", json={"quota_ia": 5})
    assert u.post("/api/ia", json={"prompt": "quarta", "livello": "rapido"}).status_code == 200
    uso = a.get("/api/admin/uso").json()["uso"]
    assert any(x["email"] == "u@esempio.it" and x["richieste"] == 3 for x in uso)


def test_ia_errori_della_api(sito: Sito):
    a = sito.admin()
    sito.claude.risposte = [httpx.Response(429, json={}), httpx.Response(529, json={}), httpx.Response(401, json={}),
                            FintoClaude.testo("non posso", stop="refusal"), FintoClaude.testo("niente json qui"),
                            httpx.Response(400, json={"error": {"message": "Your credit balance is too low"}})]
    codici = [a.post("/api/ia", json={"prompt": "x", "livello": "rapido"}).json()["codice"] for _ in range(6)]
    assert codici == ["rate_limited", "overloaded", "server_misconfigured", "refused", "invalid_json", "credito_esaurito"]


def test_ia_non_configurata(tmp_path, monkeypatch):
    monkeypatch.setenv("TARIC_CONFIG", str(tmp_path / "nessuno.env"))
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    s = Sito(tmp_path, {"ANTHROPIC_API_KEY": ""})
    a = s.admin()
    assert a.get("/api/io").json()["ia"]["configurata"] is False
    r = a.post("/api/ia", json={"prompt": "x", "livello": "rapido"})
    assert r.status_code == 503 and r.json()["codice"] == "not_configured"


# ------------------------------------------------------------------ profilo: storico e preferiti separati per utente
def test_storico_e_preferiti_sono_personali(sito: Sito):
    a = sito.admin()
    u1 = sito.utente(a, "uno@esempio.it")
    u2 = sito.utente(a, "due@esempio.it")
    r = u1.post("/api/storico", json={"testo": "trapano a batteria", "codice": "8467211000", "dati": {"result": {"best": {"code": "8467211000"}}}})
    sid = r.json()["id"]
    assert u1.get("/api/storico").json()["totale"] == 1
    assert u2.get("/api/storico").json()["totale"] == 0
    assert u2.get(f"/api/storico/{sid}").status_code == 404
    assert u1.get(f"/api/storico/{sid}").json()["dati"]["result"]["best"]["code"] == "8467211000"
    u2.delete(f"/api/storico/{sid}")
    assert u1.get("/api/storico").json()["totale"] == 1
    assert u1.put("/api/preferiti/8467211000", json={"nota": "trapani del cliente X"}).status_code == 200
    assert u1.put("/api/preferiti/84672110", json={}).status_code == 422
    assert u1.get("/api/preferiti").json()["voci"][0]["nota"] == "trapani del cliente X"
    assert u2.get("/api/preferiti").json()["voci"] == []
    assert u1.delete("/api/storico").json()["eliminate"] == 1


def test_cambio_password_chiude_le_altre_sessioni(sito: Sito):
    a = sito.admin()
    u = sito.utente(a, "u@esempio.it")
    altro = sito.client()
    assert altro.post("/api/accedi", json={"email": "u@esempio.it", "password": "Password-Utente-1"}).status_code == 200
    assert u.post("/api/io/password", json={"attuale": "sbagliata!!", "nuova": "Password-Nuova-2"}).status_code == 403
    assert u.post("/api/io/password", json={"attuale": "Password-Utente-1", "nuova": "Password-Nuova-2"}).status_code == 200
    assert u.get("/api/io").status_code == 200
    assert altro.get("/api/io").status_code == 401


# ------------------------------------------------------------------ dati
def test_dati_solo_con_accesso_e_percorsi_controllati(sito: Sito):
    a = sito.admin()
    sito.versione_finta()
    assert a.get("/data/2026-11-01/nomenclatura.js").status_code == 200
    assert a.get("/data/2026-11-01/m/84.js").status_code == 200
    assert sito.client().get("/data/2026-11-01/nomenclatura.js").status_code == 401
    for cattivo in ("/data/2026-11-01/../../taric.db", "/data/2026-11-01/segreto.key", "/data/..%2F..%2Ftaric.db/x", "/data/2026-11-02/nomenclatura.js"):
        assert a.get(cattivo).status_code in (404, 400), cattivo
    html = a.get("/").text
    assert 'data-dati="/data/2026-11-01/"' in html and "/data/2026-11-01/nomenclatura.js" in html


def test_senza_dati_la_home_mostra_l_attesa(sito: Sito):
    a = sito.admin()
    assert "Preparazione dei dati" in a.get("/").text
