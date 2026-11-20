"""Aziende (taric/aziende.py): il campo azienda fa da gruppo; regole comuni (limite IA per persona o IA spenta) per chi c'è e
per chi entra dopo; disconnessione, sospensione e riattivazione di tutti; nuovo nome e unione; l'azienda la cambia solo
l'amministratore."""
from __future__ import annotations

from conftest import Sito
from fastapi.testclient import TestClient


def entra(sito: Sito, capo: TestClient, nome: str, email: str, azienda: str) -> TestClient:
    _, r = sito.registra(nome, email, azienda=azienda)
    assert r["stato"] == "in_attesa", r
    assert capo.post(f"/api/admin/utenti/{sito.id_di(capo, email)}/approva").status_code == 200
    return sito.accedi(email)


def utente(capo: TestClient, email: str) -> dict:
    return next(x for x in capo.get("/api/admin/utenti").json()["utenti"] if x["email"] == email)


def azienda(capo: TestClient, nome: str) -> dict:
    return next(x for x in capo.get("/api/admin/aziende").json()["aziende"] if x["nome"] == nome)


def test_regole_azioni_e_nomi(sito: Sito):
    capo = sito.capo()
    luca = entra(sito, capo, "Luca Bianchi", "luca@alfa.it", "Alfa Srl")
    entra(sito, capo, "Anna Neri", "anna@alfa.it", "  alfa   SRL ")
    entra(sito, capo, "Bruno Verdi", "bruno@beta.it", "Beta")
    assert luca.get("/api/admin/aziende").status_code == 403
    r = capo.get("/api/admin/aziende").json()
    assert [(x["nome"], len(x["persone"]), x["regole"]) for x in r["aziende"]] == [("Alfa Srl", 2, None), ("Beta", 1, None)]
    assert r["senza_azienda"] == 1                                            # l'amministratore
    # limite per persona: per chi c'è e per chi entra dopo; il limite di una persona si cambia ancora da solo
    assert capo.put("/api/admin/aziende/regole", json={"azienda": "ALFA srl", "quota_ia": 5}).json()["persone"] == 2
    assert [utente(capo, e)["limite"] for e in ("luca@alfa.it", "anna@alfa.it", "bruno@beta.it")] == [5, 5, 50]   # Beta: il predefinito
    entra(sito, capo, "Carla Gialli", "carla@alfa.it", "alfa srl")
    assert utente(capo, "carla@alfa.it")["limite"] == 5
    assert capo.patch(f"/api/admin/utenti/{sito.id_di(capo, 'anna@alfa.it')}", json={"quota_ia": 9}).status_code == 200
    assert utente(capo, "anna@alfa.it")["limite"] == 9
    assert azienda(capo, "Alfa Srl")["regole"]["quota_ia"] == 5
    # cambio di azienda in Gestione: prende le regole della nuova; l'amministratore non ha limiti
    bruno = sito.id_di(capo, "bruno@beta.it")
    assert capo.patch(f"/api/admin/utenti/{bruno}", json={"azienda": " Alfa  SRL "}).status_code == 200
    assert (utente(capo, "bruno@beta.it")["azienda"], utente(capo, "bruno@beta.it")["limite"]) == ("Alfa SRL", 5)
    io = sito.id_di(capo, "capo@azienda.it")
    capo.patch(f"/api/admin/utenti/{io}", json={"azienda": "Alfa Srl"})
    assert capo.put("/api/admin/aziende/regole", json={"azienda": "Alfa Srl", "ia": False}).json()["persone"] == 4
    assert [utente(capo, e)["limite"] for e in ("luca@alfa.it", "anna@alfa.it", "carla@alfa.it", "capo@azienda.it")] == [0, 0, 0, None]
    assert luca.get("/api/io").json()["ia"]["disponibile"] is False
    capo.put("/api/admin/aziende/regole", json={"azienda": "Alfa Srl", "quota_ia": None, "ia": True})
    assert utente(capo, "luca@alfa.it")["quota_ia"] is None                   # torna al limite predefinito
    # disconnetti, sospendi e riattiva tutti: gli amministratori no
    assert capo.post("/api/admin/aziende/azione", json={"azienda": "alfa srl", "azione": "disconnetti"}).json()["persone"] == 4   # entrati tutti
    assert luca.get("/api/io").status_code == 401 and capo.get("/api/io").status_code == 200
    assert capo.post("/api/admin/aziende/azione", json={"azienda": "Alfa Srl", "azione": "sospendi"}).json()["persone"] == 4
    assert utente(capo, "luca@alfa.it")["stato"] == "sospeso" and utente(capo, "capo@azienda.it")["stato"] == "attivo"
    assert sito.client().post("/api/accedi", json={"email": "luca@alfa.it", "password": "Porto-Container-42"}).status_code != 200
    assert capo.post("/api/admin/aziende/azione", json={"azienda": "Alfa Srl", "azione": "riattiva"}).json()["persone"] == 4
    sito.accedi("luca@alfa.it")
    assert capo.post("/api/admin/aziende/azione", json={"azienda": "Nessuna", "azione": "sospendi"}).status_code == 404
    tipi = {e["tipo"] for e in capo.get("/api/admin/eventi").json()["eventi"]}
    assert {"azienda", "azienda_regole", "azienda_disconnessa", "azienda_sospesa", "azienda_riattivata"} <= tipi


def test_nuovo_nome_e_unione(sito: Sito):
    capo = sito.capo()
    entra(sito, capo, "Luca Bianchi", "luca@alfa.it", "Alfa")
    entra(sito, capo, "Bruno Verdi", "bruno@beta.it", "Beta")
    entra(sito, capo, "Dario Blu", "dario@delta.it", "Delta")
    capo.put("/api/admin/aziende/regole", json={"azienda": "Alfa", "quota_ia": 7})
    assert capo.put("/api/admin/aziende/nome", json={"azienda": "Alfa", "nome": "  "}).status_code == 422
    # nuovo nome: le regole lo seguono
    r = capo.put("/api/admin/aziende/nome", json={"azienda": "alfa", "nome": "Alfa Logistica"}).json()
    assert (r["nome"], r["unite"]) == ("Alfa Logistica", False)
    assert azienda(capo, "Alfa Logistica")["regole"]["quota_ia"] == 7 and utente(capo, "luca@alfa.it")["azienda"] == "Alfa Logistica"
    # un'azienda senza regole entra in una con regole: valgono quelle, anche per chi arriva
    assert capo.put("/api/admin/aziende/nome", json={"azienda": "Beta", "nome": "alfa logistica"}).json()["unite"] is True
    a = azienda(capo, "alfa logistica")
    assert len(a["persone"]) == 2 and a["regole"]["quota_ia"] == 7 and utente(capo, "bruno@beta.it")["limite"] == 7
    # un'azienda con regole entra in una senza: le regole valgono per tutti
    capo.put("/api/admin/aziende/nome", json={"azienda": "alfa logistica", "nome": "Delta"})
    assert [x["nome"] for x in capo.get("/api/admin/aziende").json()["aziende"]] == ["Delta"]
    assert [utente(capo, e)["limite"] for e in ("luca@alfa.it", "bruno@beta.it", "dario@delta.it")] == [7, 7, 7]
    assert "azienda_rinominata" in {e["tipo"] for e in capo.get("/api/admin/eventi").json()["eventi"]}


def test_azienda_solo_dall_amministratore(sito: Sito):
    capo = sito.capo()
    luca = entra(sito, capo, "Luca Bianchi", "luca@alfa.it", "Alfa")
    capo.put("/api/admin/aziende/regole", json={"azienda": "Alfa", "quota_ia": 3})
    # dal profilo si cambia il nome, non l'azienda (che fa da gruppo e porta le regole)
    assert luca.put("/api/io", json={"nome": "Luca B.", "azienda": "Beta"}).status_code == 200
    io = luca.get("/api/io").json()
    assert (io["nome"], io["azienda"], io["ia"]["limite"]) == ("Luca B.", "Alfa", 3)
    # disconnessione di una persona da Gestione
    assert capo.post(f"/api/admin/utenti/{sito.id_di(capo, 'luca@alfa.it')}/esci-ovunque").status_code == 200
    assert luca.get("/api/io").status_code == 401
