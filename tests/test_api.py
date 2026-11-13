"""Test delle API del programma: protezioni, IA con limite mensile, profilo, storico, preferiti e file dei dati."""
from __future__ import annotations

import httpx

from conftest import PC, FintoClaude, imposta_ia


def test_senza_intestazione_anti_csrf_le_modifiche_sono_rifiutate(editore: PC):
    c = editore.entra()
    r = c.put("/api/io/preferenze", json={"paese": "CN"}, headers={"X-Taric": ""})
    assert r.status_code == 403
    r = c.put("/api/io/preferenze", json={"paese": "CN"}, headers={"Origin": "https://altro-sito.example"})
    assert r.status_code == 403
    r = c.put("/api/io/preferenze", json={"paese": "CN"}, headers={"Sec-Fetch-Site": "cross-site"})
    assert r.status_code == 403
    assert c.put("/api/io/preferenze", json={"paese": "CN", "flusso": "export", "tema": "scuro"}).status_code == 200
    assert c.get("/api/io").json()["preferenze"] == {"paese": "CN", "flusso": "export", "tema": "scuro"}
    assert c.put("/api/io/preferenze", json={"paese": "<b>"}).status_code == 422


def test_intestazioni_di_sicurezza(editore: PC):
    r = editore.client().get("/")
    assert "script-src 'self'" in r.headers["content-security-policy"]
    assert r.headers["x-frame-options"] == "DENY"
    assert editore.entra().get("/api/io").headers["cache-control"] == "no-store"


def test_ia_risponde_json_e_conta_le_richieste(ambiente):
    tmp, cond, mp = ambiente
    imposta_ia(cond, quota=2, fornitore="anthropic", chiave="chiave-di-prova")
    ed = PC(tmp, cond, "mrossi", mp, versioni=("2026-11-01",))
    collega = PC(tmp, cond, "lbianchi", mp, editore=False)
    cc = collega.entra()
    collega.claude.risposte = [FintoClaude.testo('```json\n{"voci": [{"voce": "8467"}]}\n```'), FintoClaude.testo('[1, 2]')]
    r = cc.post("/api/ia", json={"prompt": "trapano", "livello": "rapido"})
    assert r.status_code == 200 and r.json()["risultato"] == {"voci": [{"voce": "8467"}]}
    assert collega.claude.richieste[0]["corpo"]["model"] == "claude-haiku-5-5"
    assert collega.claude.richieste[0]["chiave"] == "chiave-di-prova"
    assert cc.post("/api/ia", json={"prompt": "x", "livello": "standard"}).json()["risultato"] == [1, 2]
    assert collega.claude.richieste[1]["corpo"]["model"] == "claude-sonnet-5-5"
    r = cc.post("/api/ia", json={"prompt": "terza", "livello": "rapido"})
    assert r.status_code == 429 and r.json()["codice"] == "quota_esaurita"
    assert len(collega.claude.richieste) == 2
    assert cc.get("/api/io").json()["ia"] | {"mese": ""} == {"disponibile": True, "configurata": True, "nome": "Claude (Anthropic)",
                                                             "limite": 2, "usate": 2, "mese": ""}
    # chi gestisce MAGIC HS alza il limite per tutti; il collega lo riceve al giro successivo
    ce = ed.entra()
    assert ce.get("/api/io").json()["ia"]["limite"] is None                 # chi pubblica non ha limite
    ce.put("/api/admin/locale/ia", json={"fornitore": "anthropic", "quota": 5})
    cc.post("/api/locale/sincronizza")
    assert cc.post("/api/ia", json={"prompt": "quarta", "livello": "rapido"}).status_code == 200


def test_ia_errori_della_api(editore: PC):
    c = editore.entra()
    editore.claude.risposte = [httpx.Response(429, json={}), httpx.Response(529, json={}), httpx.Response(401, json={}),
                               FintoClaude.testo("non posso", stop="refusal"), FintoClaude.testo("niente json qui"),
                               httpx.Response(400, json={"error": {"message": "Your credit balance is too low"}})]
    risposte = [c.post("/api/ia", json={"prompt": "x", "livello": "rapido"}).json() for _ in range(6)]
    assert [r["codice"] for r in risposte] == ["rate_limited", "overloaded", "server_misconfigured", "refused", "invalid_json", "credito_esaurito"]
    assert all("server" not in r["errore"] and "amministratore" not in r["errore"] for r in risposte)


def test_ia_non_configurata(ambiente):
    tmp, cond, mp = ambiente
    c = PC(tmp, cond, "mrossi", mp, versioni=("2026-11-01",)).entra()
    assert c.get("/api/io").json()["ia"]["configurata"] is False
    r = c.post("/api/ia", json={"prompt": "x", "livello": "rapido"})
    assert r.status_code == 503 and r.json()["codice"] == "not_configured"


def test_storico_e_preferiti(editore: PC):
    c = editore.entra()
    r = c.post("/api/storico", json={"testo": "trapano a batteria", "codice": "8467211000", "dati": {"result": {"best": {"code": "8467211000"}}}})
    sid = r.json()["id"]
    assert c.get("/api/storico").json()["totale"] == 1
    assert c.get(f"/api/storico/{sid}").json()["dati"]["result"]["best"]["code"] == "8467211000"
    assert c.get(f"/api/storico/{sid + 1}").status_code == 404
    assert c.post("/api/storico", json={"testo": "x", "codice": "84672", "dati": {}}).status_code == 422
    assert c.put("/api/preferiti/8467211000", json={"nota": "trapani del cliente X"}).status_code == 200
    assert c.put("/api/preferiti/84672110", json={}).status_code == 422
    assert c.get("/api/preferiti").json()["voci"][0]["nota"] == "trapani del cliente X"
    assert c.delete("/api/preferiti/8467211000").status_code == 200 and c.get("/api/preferiti").json()["voci"] == []
    assert c.delete("/api/storico").json()["eliminate"] == 1
    assert c.put("/api/io", json={"nome": "Mario Rossi", "azienda": "Rossi Srl"}).status_code == 200
    assert c.get("/api/io").json()["nome"] == "Mario Rossi"


def test_dati_solo_con_accesso_e_percorsi_controllati(editore: PC):
    c = editore.entra()
    assert c.get("/data/2026-11-01/nomenclatura.js").status_code == 200
    assert c.get("/data/2026-11-01/m/84.js").status_code == 200
    assert editore.client().get("/data/2026-11-01/nomenclatura.js").status_code == 401
    for cattivo in ("/data/2026-11-01/../../taric.db", "/data/2026-11-01/segreto.key", "/data/..%2F..%2Ftaric.db/x", "/data/2026-11-02/nomenclatura.js"):
        assert c.get(cattivo).status_code in (404, 400), cattivo
    html = c.get("/").text
    assert 'data-dati="/data/2026-11-01/"' in html and "/data/2026-11-01/nomenclatura.js" in html


def test_gestione_riservata_a_chi_pubblica(editore: PC, ambiente):
    tmp, cond, mp = ambiente
    cc = PC(tmp, cond, "lbianchi", mp, editore=False).entra()
    for metodo, url in (("GET", "/api/admin/riepilogo"), ("GET", "/api/admin/dati"), ("GET", "/api/admin/eventi"),
                        ("POST", "/api/admin/dati/aggiorna"), ("GET", "/api/admin/locale"), ("PUT", "/api/admin/locale/ia")):
        assert cc.request(metodo, url, json={}).status_code == 403, url
    ce = editore.entra()
    r = ce.get("/api/admin/riepilogo").json()
    assert r["ia"] is True and r["dati"] == "2026-11-01"
    assert ce.get("/api/admin/dati").json()["attiva"] == "2026-11-01"
