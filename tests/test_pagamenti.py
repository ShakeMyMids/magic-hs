"""Piani Gratis e Pro: pass, abbonamenti, webhook di Stripe, tetto giornaliero, concessioni dell'amministratore."""
from __future__ import annotations

import time
from datetime import date, datetime, timedelta, timezone

from conftest import FintoStripe, Sito
from fastapi.testclient import TestClient

from taric.db import da_iso


def ore_da_ora(iso_testo: str) -> float:
    return (da_iso(iso_testo) - datetime.now(timezone.utc)).total_seconds() / 3600


def compra(s: Sito, u: TestClient, piano: str) -> str:
    r = u.post("/api/pagamento/inizia", json={"piano": piano, "rinuncia_recesso": True})
    assert r.status_code == 200, r.text
    return r.json()["url"].rsplit("/", 1)[1]


def webhook(s: Sito, tipo: str, oggetto: dict, **kw) -> object:
    corpo, firma = FintoStripe.evento(tipo, oggetto, **kw)
    # Stripe non manda l'intestazione X-Taric: il webhook deve funzionare senza
    return TestClient(s.app).post("/api/stripe/webhook", content=corpo, headers={"Stripe-Signature": firma, "Content-Type": "application/json"})


def test_senza_stripe_resta_il_piano_gratuito(sito: Sito):
    a = sito.admin()
    u = sito.utente(a, "mario@esempio.it")
    io = u.get("/api/io").json()
    assert io["ia"]["limite"] == 50 and io["piano"]["pro"] is False and io["piano"]["pagamenti"] is False
    p = u.get("/api/piani").json()
    assert p["attivi"] is False and p["gratuito"] == 50 and [x["prezzo"] for x in p["piani"]] == [299, 799, 1499, 14900]
    r = u.post("/api/pagamento/inizia", json={"piano": "mese", "rinuncia_recesso": True})
    assert r.status_code == 503 and r.json()["codice"] == "pagamenti_spenti"


def test_pass_di_un_giorno_attivo_al_ritorno_e_senza_doppioni(sito_pagamenti: Sito):
    s = sito_pagamenti
    a = s.admin()
    u = s.utente(a, "mario@esempio.it")
    assert u.post("/api/pagamento/inizia", json={"piano": "giorno"}).json()["codice"] == "recesso"
    sid = compra(s, u, "giorno")
    par = s.stripe.sessioni[sid]["parametri"]
    assert par["mode"] == "payment" and par["line_items[0][price_data][unit_amount]"] == "299"
    assert par["customer_email"] == "mario@esempio.it" and par["customer_creation"] == "always"
    assert par["success_url"] == "https://magichs.esempio.it/?pagamento={CHECKOUT_SESSION_ID}#profilo"
    assert par["metadata[piano]"] == "giorno" and "recurring" not in str(par)
    # pagina abbandonata: niente Pro
    assert u.post("/api/pagamento/conferma", json={"sessione": sid}).json()["esito"] == "non concluso"
    s.stripe.paga(sid)
    r = u.post("/api/pagamento/conferma", json={"sessione": sid}).json()
    assert r["piano"]["pro"] is True and r["piano"]["origine"] == "pass" and 23.9 < ore_da_ora(r["piano"]["fino"]) <= 24
    # arriva anche il webhook della stessa sessione: il pass non si allunga e l'incasso non raddoppia
    assert webhook(s, "checkout.session.completed", s.stripe.sessioni[sid]).json()["esito"] == "pass attivato"
    io = u.get("/api/io").json()
    assert ore_da_ora(io["piano"]["fino"]) <= 24 and io["ia"]["limite"] is None and io["ia"]["tetto_giorno"] == 150
    assert a.get("/api/admin/pagamenti").json()["incasso_mese"] == 299
    # lo stesso evento ripetuto da Stripe viene ignorato
    corpo, firma = FintoStripe.evento("checkout.session.completed", s.stripe.sessioni[sid], eid="evt_ripetuto")
    for _ in range(2):
        r = TestClient(s.app).post("/api/stripe/webhook", content=corpo, headers={"Stripe-Signature": firma})
    assert r.json()["esito"] == "già elaborato"


def test_pass_settimanali_si_sommano_e_non_si_conferma_un_pagamento_altrui(sito_pagamenti: Sito):
    s = sito_pagamenti
    a = s.admin()
    u = s.utente(a, "mario@esempio.it")
    altro = s.utente(a, "luigi@esempio.it")
    for _ in range(2):
        sid = compra(s, u, "settimana")
        s.stripe.paga(sid)
        assert altro.post("/api/pagamento/conferma", json={"sessione": sid}).status_code == 403
        u.post("/api/pagamento/conferma", json={"sessione": sid})
    fino = u.get("/api/io").json()["piano"]["fino"]
    assert 14 * 24 - 0.2 < ore_da_ora(fino) <= 14 * 24
    # il secondo pagamento riusa il cliente Stripe creato dal primo
    assert s.stripe.sessioni["cs_test_2"]["parametri"]["customer"] == "cus_cs_test_1"
    assert u.post("/api/pagamento/conferma", json={"sessione": "pi_falso"}).status_code == 422


def test_abbonamento_mensile_rinnovo_disdetta_e_chiusura(sito_pagamenti: Sito):
    s = sito_pagamenti
    a = s.admin()
    u = s.utente(a, "mario@esempio.it")
    sid = compra(s, u, "mese")
    par = s.stripe.sessioni[sid]["parametri"]
    assert par["mode"] == "subscription" and par["line_items[0][price_data][recurring][interval]"] == "month"
    assert par["subscription_data[metadata][utente_id]"] == str(u.get("/api/io").json()["id"])
    sess = s.stripe.paga(sid, giorni=30)
    assert webhook(s, "checkout.session.completed", sess).json()["esito"] == "abbonamento avviato"
    sub = s.stripe.abbonamenti[sess["subscription"]]
    io = u.get("/api/io").json()["piano"]
    assert io["pro"] and io["origine"] == "abbonamento" and io["abbonamento"]["piano"] == "mese" and io["gestibile"]
    assert 31 * 24 - 0.2 < ore_da_ora(io["fino"]) <= 31 * 24          # un giorno di margine per il rinnovo
    # un secondo abbonamento non si puo' aprire
    r = u.post("/api/pagamento/inizia", json={"piano": "anno", "rinuncia_recesso": True})
    assert r.status_code == 409 and r.json()["codice"] == "abbonamento_attivo"
    # prima fattura e rinnovo: l'incasso conta gli importi
    webhook(s, "invoice.paid", {"id": "in_1", "subscription": sub["id"], "amount_paid": 1499, "currency": "eur", "billing_reason": "subscription_create"})
    sub["current_period_end"] += 30 * 86400
    webhook(s, "invoice.paid", {"id": "in_2", "subscription": sub["id"], "amount_paid": 1499, "currency": "eur", "billing_reason": "subscription_cycle"})
    assert 61 * 24 - 0.2 < ore_da_ora(u.get("/api/io").json()["piano"]["fino"]) <= 61 * 24
    pag = a.get("/api/admin/pagamenti").json()
    assert pag["incasso_mese"] == 2998 and {m["tipo"] for m in pag["movimenti"]} >= {"abbonamento", "rinnovo"}
    assert pag["pro"][0]["email"] == "mario@esempio.it"
    # portale clienti per carta e disdetta
    assert u.post("/api/pagamento/gestisci").json()["url"] == "https://billing.stripe.test/cus_cs_test_1"
    # disdetta a fine periodo: resta Pro fino alla scadenza, senza margine
    sub["cancel_at_period_end"] = True
    webhook(s, "customer.subscription.updated", sub)
    io = u.get("/api/io").json()["piano"]
    assert io["pro"] and io["abbonamento"]["rinnovo_annullato"] and 60 * 24 - 0.2 < ore_da_ora(io["fino"]) <= 60 * 24
    # chiusura: il Pro finisce
    sub.update(status="canceled", ended_at=int(time.time()))
    webhook(s, "customer.subscription.deleted", sub)
    io = u.get("/api/io").json()
    assert io["piano"]["pro"] is False and io["ia"]["limite"] == 50


def test_rinnovo_letto_da_stripe_anche_senza_webhook(sito_pagamenti: Sito):
    s = sito_pagamenti
    a = s.admin()
    u = s.utente(a, "mario@esempio.it")
    sid = compra(s, u, "anno")
    sess = s.stripe.paga(sid, giorni=1)
    u.post("/api/pagamento/conferma", json={"sessione": sid})
    assert ore_da_ora(u.get("/api/io").json()["piano"]["fino"]) < 49
    s.stripe.abbonamenti[sess["subscription"]]["current_period_end"] += 365 * 86400
    assert s.app.state.pagamenti.sincronizza_scadenze() == 1
    assert ore_da_ora(u.get("/api/io").json()["piano"]["fino"]) > 365 * 24


def test_firma_del_webhook(sito_pagamenti: Sito):
    s = sito_pagamenti
    s.admin()
    c = TestClient(s.app)
    oggetto = {"id": "cs_x", "object": "checkout.session"}
    corpo, firma = FintoStripe.evento("checkout.session.completed", oggetto, segreto="whsec_sbagliato")
    assert c.post("/api/stripe/webhook", content=corpo, headers={"Stripe-Signature": firma}).status_code == 400
    corpo, firma = FintoStripe.evento("checkout.session.completed", oggetto, quando=int(time.time()) - 3600)
    assert c.post("/api/stripe/webhook", content=corpo, headers={"Stripe-Signature": firma}).json()["codice"] == "firma"
    assert c.post("/api/stripe/webhook", content=corpo).status_code == 400
    corpo, firma = FintoStripe.evento("checkout.session.completed", oggetto)
    assert c.post("/api/stripe/webhook", content=corpo + b" ", headers={"Stripe-Signature": firma}).status_code == 400
    # le altre API continuano a chiedere l'intestazione contro le richieste da altri siti
    assert c.post("/api/pagamento/inizia", json={"piano": "giorno", "rinuncia_recesso": True}).status_code == 403


def test_limite_gratuito_e_tetto_del_pro(sito_pagamenti: Sito):
    s = sito_pagamenti
    a = s.admin()
    # salvare solo alcune impostazioni non cancella le altre
    assert a.put("/api/admin/impostazioni", json={"quota_predefinita": 2, "pro_tetto_giorno": 3}).status_code == 200
    imp = a.get("/api/admin/impostazioni").json()
    assert imp["quota_predefinita"] == 2 and imp["registrazione_aperta"] is True and imp["prezzi"]["mese"] == 1499
    u = s.utente(a, "mario@esempio.it")
    for _ in range(2):
        assert u.post("/api/ia", json={"prompt": "trapano", "livello": "rapido"}).status_code == 200
    r = u.post("/api/ia", json={"prompt": "trapano", "livello": "rapido"})
    assert r.status_code == 429 and r.json()["codice"] == "quota_esaurita" and "piano Pro" in r.json()["errore"]
    s.stripe.paga(sid := compra(s, u, "giorno"))
    u.post("/api/pagamento/conferma", json={"sessione": sid})
    # con il Pro niente limite mensile, ma il tetto delle 24 ore conta anche le richieste di prima
    assert u.post("/api/ia", json={"prompt": "trapano", "livello": "rapido"}).status_code == 200
    r = u.post("/api/ia", json={"prompt": "trapano", "livello": "rapido"})
    assert r.status_code == 429 and r.json()["codice"] == "tetto_giornaliero"
    # un limite personale 0 spegne l'IA anche con il Pro
    uid = u.get("/api/io").json()["id"]
    a.patch(f"/api/admin/utenti/{uid}", json={"quota_ia": 0})
    assert u.get("/api/io").json()["ia"]["disponibile"] is False


def test_amministratore_concede_il_pro_e_cambia_i_prezzi(sito_pagamenti: Sito):
    s = sito_pagamenti
    a = s.admin()
    u = s.utente(a, "mario@esempio.it")
    uid = u.get("/api/io").json()["id"]
    domani = (date.today() + timedelta(days=1)).isoformat()
    r = a.put(f"/api/admin/utenti/{uid}/pro", json={"fino": domani})
    assert r.status_code == 200 and r.json()["piano"]["origine"] == "manuale"
    assert u.get("/api/io").json()["ia"]["limite"] is None
    elenco = {x["email"]: x for x in a.get("/api/admin/utenti").json()["utenti"]}
    assert elenco["mario@esempio.it"]["pro"]["manuale_fino"]
    assert a.put(f"/api/admin/utenti/{uid}/pro", json={"fino": "2020-01-01"}).status_code == 422
    assert a.put(f"/api/admin/utenti/{uid}/pro", json={"fino": None}).json()["piano"]["pro"] is False
    assert u.put(f"/api/admin/utenti/{uid}/pro", json={"fino": domani}).status_code == 403
    # prezzi: almeno 0,50 euro, oppure 0 per togliere il piano dalla vendita
    nuovi = {"giorno": 30, "settimana": 799, "mese": 1499, "anno": 14900}
    assert a.put("/api/admin/impostazioni", json={"prezzi": nuovi}).json()["codice"] == "prezzo"
    nuovi.update(giorno=0, mese=1999)
    assert a.put("/api/admin/impostazioni", json={"prezzi": nuovi}).status_code == 200
    assert [x["prezzo"] for x in u.get("/api/piani").json()["piani"]] == [0, 799, 1999, 14900]
    r = u.post("/api/pagamento/inizia", json={"piano": "giorno", "rinuncia_recesso": True})
    assert r.status_code == 409 and r.json()["codice"] == "piano"
    assert s.stripe.sessioni == {}
    stato = a.get("/api/admin/pagamenti").json()
    assert stato["attivi"] and stato["prova"] and stato["webhook"] and stato["webhook_url"] == "https://magichs.esempio.it/api/stripe/webhook"


def test_eliminare_un_utente_chiude_il_suo_abbonamento(sito_pagamenti: Sito):
    s = sito_pagamenti
    a = s.admin()
    u = s.utente(a, "mario@esempio.it")
    uid = u.get("/api/io").json()["id"]
    sess = s.stripe.paga(compra(s, u, "mese"))
    u.post("/api/pagamento/conferma", json={"sessione": sess["id"]})
    assert a.delete(f"/api/admin/utenti/{uid}").status_code == 200
    assert s.stripe.abbonamenti[sess["subscription"]]["status"] == "canceled"
    assert ("DELETE", f"/subscriptions/{sess['subscription']}", {}) in s.stripe.chiamate
