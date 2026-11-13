"""Test delle API comuni: protezioni, IA con il conteggio delle classificazioni, profilo, storico, preferiti e file dei dati.
Qui chi usa il sito e' l'amministratore (senza limite mensile): i limiti per persona sono in test_sito.py."""
from __future__ import annotations

import httpx

from conftest import FintoClaude, Sito


def test_senza_intestazione_anti_csrf_le_modifiche_sono_rifiutate(sito_claude: Sito):
    c = sito_claude.capo()
    r = c.put("/api/io/preferenze", json={"paese": "CN"}, headers={"X-Taric": ""})
    assert r.status_code == 403
    r = c.put("/api/io/preferenze", json={"paese": "CN"}, headers={"Origin": "https://altro-sito.example"})
    assert r.status_code == 403
    r = c.put("/api/io/preferenze", json={"paese": "CN"}, headers={"Sec-Fetch-Site": "cross-site"})
    assert r.status_code == 403
    assert c.put("/api/io/preferenze", json={"paese": "CN", "flusso": "export", "tema": "scuro"}).status_code == 200
    assert c.get("/api/io").json()["preferenze"] == {"paese": "CN", "flusso": "export", "tema": "scuro"}
    assert c.put("/api/io/preferenze", json={"paese": "<b>"}).status_code == 422


def test_intestazioni_di_sicurezza(sito_claude: Sito):
    r = sito_claude.client().get("/accedi")
    assert "script-src 'self'" in r.headers["content-security-policy"]
    assert r.headers["x-frame-options"] == "DENY"
    assert sito_claude.capo().get("/api/io").headers["cache-control"] == "no-store"


def test_ia_risponde_json_e_conta_le_classificazioni(sito_claude: Sito):
    c = sito_claude.capo()
    sito_claude.claude.risposte = [FintoClaude.testo('```json\n{"voci": [{"voce": "8467"}]}\n```'), FintoClaude.testo('[1, 2]')]
    r = c.post("/api/ia", json={"prompt": "trapano", "livello": "rapido", "operazione": "cl-1"})
    assert r.status_code == 200 and r.json()["risultato"] == {"voci": [{"voce": "8467"}]}
    assert sito_claude.claude.richieste[0]["corpo"]["model"] == "claude-haiku-5-5"
    assert sito_claude.claude.richieste[0]["chiave"] == "chiave-di-prova"
    assert c.post("/api/ia", json={"prompt": "x", "livello": "standard", "operazione": "cl-1"}).json()["risultato"] == [1, 2]
    assert sito_claude.claude.richieste[1]["corpo"]["model"] == "claude-sonnet-5-5"
    assert c.get("/api/io").json()["ia"] | {"mese": ""} == {"disponibile": True, "configurata": True, "nome": "Claude (Anthropic)",
                                                            "limite": None, "usate": 1, "mese": "", "tetto": False}
    for k in range(3):                                                    # nessun limite mensile
        assert c.post("/api/ia", json={"prompt": "x", "livello": "rapido", "operazione": f"cl-{k + 2}"}).status_code == 200
    assert c.post("/api/ia", json={"prompt": "x", "livello": "rapido", "operazione": "tr-1", "tipo": "traduzione"}).status_code == 200
    assert c.get("/api/io").json()["ia"]["usate"] == 4                    # le traduzioni non contano


def test_ia_errori_della_api(sito_claude: Sito):
    c = sito_claude.capo()
    occupato, sovraccarico = httpx.Response(429, json={}), httpx.Response(529, json={})
    sito_claude.claude.risposte = [occupato, occupato, occupato, sovraccarico, sovraccarico, sovraccarico, httpx.Response(401, json={}),
                               FintoClaude.testo("non posso", stop="refusal"), FintoClaude.testo("niente json qui"),
                               httpx.Response(400, json={"error": {"message": "Your credit balance is too low"}})]
    risposte = [c.post("/api/ia", json={"prompt": "x", "livello": "rapido", "operazione": f"op{k}"}).json() for k in range(6)]
    assert [r["codice"] for r in risposte] == ["rate_limited", "overloaded", "server_misconfigured", "refused", "invalid_json", "credito_esaurito"]
    assert all("server" not in r["errore"] for r in risposte)
    assert sito_claude.attese == [2.0, 4.0, 2.0, 4.0]          # due nuovi tentativi, con attesa crescente, prima di arrendersi


def test_ia_riprova_da_sola(sito_claude: Sito):
    c = sito_claude.capo()
    sito_claude.claude.risposte = [httpx.Response(529, json={}), httpx.Response(429, json={}, headers={"retry-after": "7"}),
                               FintoClaude.testo('{"ok": 1}')]
    r = c.post("/api/ia", json={"prompt": "x", "livello": "rapido", "operazione": "a"})
    assert r.status_code == 200 and r.json()["risultato"] == {"ok": 1}
    assert sito_claude.attese == [2.0, 7.0]                       # rispettata l'attesa indicata dal servizio
    # un limite con un'attesa troppo lunga si dice subito, senza bloccare la pagina
    sito_claude.claude.risposte = [httpx.Response(429, json={}, headers={"retry-after": "120"})]
    assert c.post("/api/ia", json={"prompt": "x", "livello": "rapido", "operazione": "b"}).json()["codice"] == "rate_limited"
    assert len(sito_claude.attese) == 2


def test_ia_non_configurata(ambiente):
    tmp, mp = ambiente
    c = Sito(tmp, mp, ia=False).capo()
    assert c.get("/api/io").json()["ia"]["configurata"] is False
    r = c.post("/api/ia", json={"prompt": "x", "livello": "rapido"})
    assert r.status_code == 503 and r.json()["codice"] == "not_configured"


def test_storico_e_preferiti(sito_claude: Sito):
    c = sito_claude.capo()
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


def test_dati_solo_con_accesso_e_percorsi_controllati(sito_claude: Sito):
    c = sito_claude.capo()
    assert c.get("/data/2026-11-01/nomenclatura.js").status_code == 200
    assert c.get("/data/2026-11-01/m/84.js").status_code == 200
    assert sito_claude.client().get("/data/2026-11-01/nomenclatura.js").status_code == 401
    for cattivo in ("/data/2026-11-01/../../taric.db", "/data/2026-11-01/segreto.key", "/data/..%2F..%2Ftaric.db/x", "/data/2026-11-02/nomenclatura.js"):
        assert c.get(cattivo).status_code in (404, 400), cattivo
    html = c.get("/").text
    assert 'data-dati="/data/2026-11-01/"' in html and "/data/2026-11-01/nomenclatura.js" in html


def test_gestione_solo_con_la_sessione(sito_claude: Sito):
    cc = sito_claude.client()
    for metodo, url in (("GET", "/api/admin/riepilogo"), ("GET", "/api/admin/dati"), ("GET", "/api/admin/eventi"),
                        ("POST", "/api/admin/dati/aggiorna"), ("GET", "/api/admin/ia"), ("POST", "/api/admin/ia/prova"),
                        ("GET", "/api/admin/utenti"), ("GET", "/api/admin/backup")):
        assert cc.request(metodo, url, json={}).status_code == 401, url
    ce = sito_claude.capo()
    r = ce.get("/api/admin/riepilogo").json()
    assert r["ia"] is True and r["dati"] == "2026-11-01"
    assert ce.get("/api/admin/dati").json()["attiva"] == "2026-11-01"


def test_la_stessa_classificazione_non_all_infinito(sito_claude: Sito):
    """Freno contro una pagina che ripete le richieste senza fine (ia.RICHIESTE_PER_CLASSIFICAZIONE)."""
    from taric.ia import RICHIESTE_PER_CLASSIFICAZIONE
    c = sito_claude.capo()
    for _ in range(RICHIESTE_PER_CLASSIFICAZIONE):
        assert c.post("/api/ia", json={"prompt": "x", "livello": "rapido", "operazione": "cl-1"}).status_code == 200
    assert c.post("/api/ia", json={"prompt": "x", "livello": "rapido", "operazione": "cl-1"}).json()["codice"] == "rate_limited"


def test_uso_del_mese_in_gestione(sito_claude: Sito):
    c = sito_claude.capo()
    sito_claude.claude.cache = 100
    for op in ("a", "a", "b"):
        c.post("/api/ia", json={"prompt": "x", "livello": "rapido", "operazione": op})
    uso = c.get("/api/admin/ia").json()["uso"]
    assert uso["classificazioni"] == 2 and uso["richieste"] == 3 and uso["token_in"] == 360 and uso["token_cache"] == 300
