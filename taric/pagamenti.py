"""Piano Pro e pagamenti con Stripe.

Due modi di pagare:
- pass senza rinnovo (1 giorno, 1 settimana): Checkout in modalita' "payment"; ogni pass allunga la scadenza;
- abbonamenti che si rinnovano (mensile, annuale): Checkout in modalita' "subscription"; la scadenza segue il periodo
  pagato su Stripe e si gestisce (annullamento, carta) dal portale clienti di Stripe.
In piu' l'amministratore puo' concedere il Pro a mano fino a una data (per chi paga con bonifico).

Stripe comunica i pagamenti con un webhook firmato: la firma si verifica con il segreto whsec_..., ogni evento
si elabora una volta sola (tabella pagamenti, colonna evento). Gli abbonamenti si rileggono sempre dall'API con una
versione fissa, cosi' il formato non dipende dalla versione impostata sull'account Stripe.
"""
from __future__ import annotations

import hashlib
import hmac
import json
import logging
import sqlite3
import time
from datetime import datetime, timedelta, timezone
from typing import Any
from urllib.parse import urlencode

import httpx

from .config import Config
from .db import Database, adesso, da_iso, iso

log = logging.getLogger("taric.pagamenti")

STRIPE_VERSIONE = "2024-06-20"
TOLLERANZA_FIRMA = 300                       # secondi

PIANI: dict[str, dict[str, Any]] = {
    "giorno": {"nome": "Pro 1 giorno", "abbonamento": False, "durata": timedelta(days=1)},
    "settimana": {"nome": "Pro 1 settimana", "abbonamento": False, "durata": timedelta(days=7)},
    "mese": {"nome": "Pro mensile", "abbonamento": True, "intervallo": "month"},
    "anno": {"nome": "Pro annuale", "abbonamento": True, "intervallo": "year"},
}
STATI_ATTIVI = ("active", "trialing", "past_due")


class ErrorePagamento(Exception):
    def __init__(self, messaggio: str, stato: int = 400, codice: str = "pagamento"):
        super().__init__(messaggio)
        self.messaggio, self.stato, self.codice = messaggio, stato, codice


def appiattisci(dati: dict[str, Any], prefisso: str = "") -> list[tuple[str, str]]:
    """Parametri annidati nel formato dei moduli di Stripe: a[b][0][c]=valore."""
    out: list[tuple[str, str]] = []
    for k, v in dati.items():
        chiave = f"{prefisso}[{k}]" if prefisso else str(k)
        if isinstance(v, dict):
            out += appiattisci(v, chiave)
        elif isinstance(v, (list, tuple)):
            for i, x in enumerate(v):
                out += appiattisci(x, f"{chiave}[{i}]") if isinstance(x, dict) else [(f"{chiave}[{i}]", str(x))]
        elif isinstance(v, bool):
            out.append((chiave, "true" if v else "false"))
        elif v is not None:
            out.append((chiave, str(v)))
    return out


def verifica_firma(corpo: bytes, intestazione: str, segreto: str, ora: float | None = None) -> None:
    """Controlla l'intestazione Stripe-Signature (t=..., v1=...); solleva ErrorePagamento se non valida."""
    t, firme = "", []
    for pezzo in (intestazione or "").split(","):
        k, _, v = pezzo.strip().partition("=")
        if k == "t":
            t = v
        elif k == "v1":
            firme.append(v)
    if not segreto or not t or not firme:
        raise ErrorePagamento("Firma del webhook mancante.", 400, "firma")
    try:
        ts = int(t)
    except ValueError:
        raise ErrorePagamento("Firma del webhook non valida.", 400, "firma") from None
    if abs((ora if ora is not None else time.time()) - ts) > TOLLERANZA_FIRMA:
        raise ErrorePagamento("Firma del webhook scaduta.", 400, "firma")
    atteso = hmac.new(segreto.encode(), t.encode() + b"." + corpo, hashlib.sha256).hexdigest()
    if not any(hmac.compare_digest(atteso, f) for f in firme):
        raise ErrorePagamento("Firma del webhook non valida.", 400, "firma")


def _da_epoca(x: Any) -> datetime | None:
    try:
        return datetime.fromtimestamp(int(x), tz=timezone.utc)
    except (TypeError, ValueError):
        return None


class Pagamenti:
    def __init__(self, cfg: Config, db: Database, client: httpx.Client | None = None):
        self.cfg, self.db = cfg, db
        self.client = client or httpx.Client(timeout=httpx.Timeout(30, connect=10))

    @property
    def attivi(self) -> bool:
        return bool(self.cfg.stripe_chiave)

    @property
    def modalita_prova(self) -> bool:
        return self.cfg.stripe_chiave.startswith(("sk_test_", "rk_test_"))

    # ------------------------------------------------------------------ stato del piano
    @staticmethod
    def riga(c: sqlite3.Connection, uid: int) -> sqlite3.Row | None:
        return c.execute("SELECT * FROM abbonamenti WHERE utente_id = ?", (uid,)).fetchone()

    def stato(self, c: sqlite3.Connection, uid: int) -> dict[str, Any]:
        """Piano dell'utente: pro, fino a quando e da dove arriva (abbonamento, pass o concessione manuale)."""
        r = self.riga(c, uid)
        ora = adesso()
        fonti = []
        if r is not None:
            for origine, col in (("abbonamento", "abb_fino"), ("pass", "pass_fino"), ("manuale", "manuale_fino")):
                if r[col] and da_iso(r[col]) > ora:
                    fonti.append((da_iso(r[col]), origine))
        fino, origine = max(fonti) if fonti else (None, None)
        abb = None
        if r is not None and r["abb_id"]:
            abb = {"piano": r["abb_piano"], "stato": r["abb_stato"], "fino": r["abb_fino"],
                   "rinnovo_annullato": bool(r["abb_annullato"]), "attivo": r["abb_stato"] in STATI_ATTIVI}
        return {"pro": fino is not None, "fino": iso(fino) if fino else None, "origine": origine, "abbonamento": abb,
                "manuale_fino": r["manuale_fino"] if r is not None else None,
                "gestibile": bool(r is not None and r["cliente_stripe"] and self.attivi)}

    def pro_attivo(self, c: sqlite3.Connection, uid: int) -> bool:
        r = self.riga(c, uid)
        if r is None:
            return False
        ora = iso()
        return any(r[col] and r[col] > ora for col in ("abb_fino", "pass_fino", "manuale_fino"))

    @staticmethod
    def _assicura_riga(c: sqlite3.Connection, uid: int) -> None:
        c.execute("INSERT INTO abbonamenti(utente_id, aggiornato) VALUES (?, ?) ON CONFLICT(utente_id) DO NOTHING", (uid, iso()))

    def concedi_manuale(self, c: sqlite3.Connection, uid: int, fino: datetime | None) -> None:
        self._assicura_riga(c, uid)
        c.execute("UPDATE abbonamenti SET manuale_fino = ?, aggiornato = ? WHERE utente_id = ?", (iso(fino) if fino else None, iso(), uid))

    # ------------------------------------------------------------------ chiamate a Stripe
    def _stripe(self, metodo: str, percorso: str, dati: dict[str, Any] | None = None) -> dict[str, Any]:
        if not self.attivi:
            raise ErrorePagamento("I pagamenti non sono attivi su questo server.", 503, "pagamenti_spenti")
        try:
            intest = {"Authorization": f"Bearer {self.cfg.stripe_chiave}", "Stripe-Version": STRIPE_VERSIONE}
            corpo_richiesta = None
            if dati:
                corpo_richiesta = urlencode(appiattisci(dati)).encode()
                intest["Content-Type"] = "application/x-www-form-urlencoded"
            r = self.client.request(metodo, self.cfg.stripe_url + percorso, content=corpo_richiesta, headers=intest)
        except httpx.HTTPError as e:
            log.error("Stripe non raggiungibile: %s", e)
            raise ErrorePagamento("Il servizio di pagamento non risponde. Riprova tra poco.", 502, "stripe") from None
        try:
            corpo = r.json()
        except ValueError:
            corpo = {}
        if r.status_code >= 400:
            dettaglio = ((corpo.get("error") or {}).get("message") or r.text)[:300]
            log.error("Stripe %s %s: %s %s", metodo, percorso, r.status_code, dettaglio)
            if "portal" in percorso and "configuration" in dettaglio.lower():
                raise ErrorePagamento("Il portale clienti di Stripe non è ancora configurato: l'amministratore deve salvarne "
                                      "le impostazioni nella dashboard di Stripe.", 503, "portale")
            raise ErrorePagamento("Il servizio di pagamento ha rifiutato la richiesta. Riprova o avvisa l'amministratore.", 502, "stripe")
        return corpo

    def inizia(self, utente: sqlite3.Row, piano: str, prezzi: dict[str, int], base: str) -> str:
        """Crea la pagina di pagamento di Stripe e ne restituisce l'indirizzo."""
        if piano not in PIANI:
            raise ErrorePagamento("Piano sconosciuto.", 422, "piano")
        info = PIANI[piano]
        importo = int(prezzi.get(piano) or 0)
        if importo < 50:
            raise ErrorePagamento("Questo piano non è in vendita.", 409, "piano")
        uid = int(utente["id"])
        with self.db.connessione() as c:
            r = self.riga(c, uid)
        if info["abbonamento"] and r is not None and r["abb_id"] and r["abb_stato"] in STATI_ATTIVI:
            raise ErrorePagamento("Hai già un abbonamento attivo: lo cambi o lo annulli da «Gestisci abbonamento».", 409, "abbonamento_attivo")
        prezzo: dict[str, Any] = {"currency": "eur", "unit_amount": importo, "product_data": {"name": f"MAGIC HS {info['nome']}"}}
        if info["abbonamento"]:
            prezzo["recurring"] = {"interval": info["intervallo"]}
        if self.cfg.stripe_tasse:
            prezzo["tax_behavior"] = "inclusive"
        meta = {"utente_id": uid, "piano": piano}
        p: dict[str, Any] = {
            "mode": "subscription" if info["abbonamento"] else "payment",
            "line_items": [{"price_data": prezzo, "quantity": 1}],
            "success_url": f"{base}/?pagamento={{CHECKOUT_SESSION_ID}}#profilo",
            "cancel_url": f"{base}/?pagamento=annullato#profilo",
            "client_reference_id": uid,
            "metadata": meta,
            "locale": "it",
            "allow_promotion_codes": True,
        }
        if info["abbonamento"]:
            p["subscription_data"] = {"metadata": meta}
        else:
            p["payment_intent_data"] = {"metadata": meta}
        if r is not None and r["cliente_stripe"]:
            p["customer"] = r["cliente_stripe"]
            if self.cfg.stripe_tasse:
                p["customer_update"] = {"address": "auto", "name": "auto"}
        else:
            p["customer_email"] = utente["email"]
            if not info["abbonamento"]:
                p["customer_creation"] = "always"
        if self.cfg.stripe_tasse:
            p["automatic_tax"] = {"enabled": True}
            p["tax_id_collection"] = {"enabled": True}
        s = self._stripe("POST", "/checkout/sessions", p)
        if not s.get("url"):
            raise ErrorePagamento("Il servizio di pagamento non ha restituito la pagina di pagamento.", 502, "stripe")
        return str(s["url"])

    def portale(self, uid: int, base: str) -> str:
        with self.db.connessione() as c:
            r = self.riga(c, uid)
        if r is None or not r["cliente_stripe"]:
            raise ErrorePagamento("Non risultano pagamenti con carta per il tuo account.", 404, "nessun_cliente")
        s = self._stripe("POST", "/billing_portal/sessions", {"customer": r["cliente_stripe"], "return_url": f"{base}/#profilo"})
        return str(s["url"])

    def annulla_abbonamento(self, uid: int) -> bool:
        """Chiude subito l'abbonamento (per esempio prima di eliminare l'utente). Restituisce True se c'era."""
        with self.db.connessione() as c:
            r = self.riga(c, uid)
        if r is None or not r["abb_id"] or r["abb_stato"] not in STATI_ATTIVI or not self.attivi:
            return False
        self._stripe("DELETE", f"/subscriptions/{r['abb_id']}")
        return True

    def conferma(self, uid: int, sessione: str) -> str:
        """Al ritorno dalla pagina di pagamento: rilegge la sessione da Stripe e attiva il piano senza aspettare
        il webhook (che resta comunque la via principale e non fa doppioni)."""
        if not sessione.startswith("cs_") or len(sessione) > 255:
            raise ErrorePagamento("Pagamento non riconosciuto.", 422, "sessione")
        s = self._stripe("GET", f"/checkout/sessions/{sessione}")
        if self._utente(s) != uid:
            raise ErrorePagamento("Questo pagamento non è del tuo account.", 403, "sessione")
        if s.get("status") != "complete":
            return "non concluso"
        return self._checkout(f"ritorno:{sessione}", "ritorno", s)

    def sincronizza_scadenze(self) -> int:
        """Rilegge da Stripe gli abbonamenti vicini alla scadenza: i rinnovi arrivano anche se il webhook non funziona."""
        if not self.attivi:
            return 0
        limite = iso(adesso() + timedelta(days=3))
        with self.db.connessione() as c:
            ids = [r["abb_id"] for r in c.execute(
                "SELECT abb_id FROM abbonamenti WHERE abb_id IS NOT NULL AND abb_stato IN ('active', 'trialing', 'past_due') "
                "AND (abb_fino IS NULL OR abb_fino < ?)", (limite,))]
        fatti = 0
        for sub in ids:
            try:
                self.sincronizza(sub)
                fatti += 1
            except ErrorePagamento as e:
                log.warning("sincronizzazione abbonamento %s: %s", sub, e.messaggio)
        return fatti

    # ------------------------------------------------------------------ webhook
    def webhook(self, corpo: bytes, firma: str) -> str:
        verifica_firma(corpo, firma, self.cfg.stripe_firma)
        try:
            ev = json.loads(corpo)
            eid, tipo, ogg = str(ev["id"]), str(ev["type"]), ev["data"]["object"]
        except (ValueError, KeyError, TypeError):
            raise ErrorePagamento("Evento non leggibile.", 400, "evento") from None
        with self.db.connessione() as c:
            if c.execute("SELECT 1 FROM pagamenti WHERE evento = ?", (eid,)).fetchone():
                return "già elaborato"
        if tipo in ("checkout.session.completed", "checkout.session.async_payment_succeeded"):
            return self._checkout(eid, tipo, ogg)
        if tipo in ("invoice.paid", "invoice.payment_succeeded"):
            sub = ogg.get("subscription") or (((ogg.get("parent") or {}).get("subscription_details") or {}).get("subscription"))
            if isinstance(sub, dict):
                sub = sub.get("id")
            uid, piano = self.sincronizza(str(sub)) if sub else (None, "")
            rinnovo = ogg.get("billing_reason") == "subscription_cycle"
            self._registra(eid, uid, "rinnovo" if rinnovo else "abbonamento", piano, int(ogg.get("amount_paid") or 0),
                           ogg.get("currency") or "eur", str(ogg.get("id") or ""), "fattura pagata")
            return "abbonamento aggiornato"
        if tipo.startswith("customer.subscription."):
            uid, piano = self.sincronizza(str(ogg.get("id")))
            self._registra(eid, uid, "stato_abbonamento", piano, 0, "eur", str(ogg.get("id") or ""), tipo.rsplit(".", 1)[-1])
            return "abbonamento aggiornato"
        self._registra(eid, None, "ignorato", "", 0, "eur", "", tipo)
        return "ignorato"

    def _registra(self, eid: str, uid: int | None, tipo: str, piano: str, importo: int, valuta: str, rif: str, dettagli: str) -> None:
        with self.db.transazione() as c:
            if uid is not None and not c.execute("SELECT 1 FROM utenti WHERE id = ?", (uid,)).fetchone():
                uid = None
            c.execute("INSERT INTO pagamenti(quando, evento, utente_id, tipo, piano, importo, valuta, riferimento, dettagli) "
                      "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(evento) DO NOTHING",
                      (iso(), eid, uid, tipo, piano, importo, valuta, rif, dettagli[:500]))

    @staticmethod
    def _utente(ogg: dict[str, Any]) -> int | None:
        meta = ogg.get("metadata") or {}
        for v in (meta.get("utente_id"), ogg.get("client_reference_id")):
            try:
                return int(v)
            except (TypeError, ValueError):
                continue
        return None

    def _checkout(self, eid: str, tipo: str, s: dict[str, Any]) -> str:
        uid = self._utente(s)
        piano = str((s.get("metadata") or {}).get("piano") or "")
        cliente = s.get("customer") if isinstance(s.get("customer"), str) else None
        if uid is None:
            self._registra(eid, None, "ignorato", piano, 0, "eur", str(s.get("id") or ""), "pagamento senza utente")
            return "senza utente"
        if s.get("mode") == "subscription":
            with self.db.transazione() as c:
                if c.execute("SELECT 1 FROM utenti WHERE id = ?", (uid,)).fetchone():
                    self._assicura_riga(c, uid)
                    if cliente:
                        c.execute("UPDATE abbonamenti SET cliente_stripe = ? WHERE utente_id = ?", (cliente, uid))
            sub = s.get("subscription")
            if sub:
                self.sincronizza(str(sub))
            self._registra(eid, uid, "abbonamento_avviato", piano, 0, s.get("currency") or "eur", str(s.get("id") or ""), "pagina di pagamento completata")
            return "abbonamento avviato"
        if s.get("payment_status") != "paid" or piano not in PIANI or PIANI[piano]["abbonamento"]:
            self._registra(eid, uid, "in_attesa", piano, 0, s.get("currency") or "eur", str(s.get("id") or ""), f"pagamento {s.get('payment_status')}")
            return "pagamento non ancora concluso"
        sid = str(s.get("id") or "")
        with self.db.transazione() as c:
            gia = c.execute("SELECT 1 FROM pagamenti WHERE riferimento = ? AND tipo = 'pass'", (sid,)).fetchone()
            esiste = c.execute("SELECT 1 FROM utenti WHERE id = ?", (uid,)).fetchone()
            if not gia and esiste:
                self._assicura_riga(c, uid)
                r = self.riga(c, uid)
                base = max(adesso(), da_iso(r["pass_fino"])) if r["pass_fino"] else adesso()
                c.execute("UPDATE abbonamenti SET pass_fino = ?, cliente_stripe = COALESCE(?, cliente_stripe), aggiornato = ? WHERE utente_id = ?",
                          (iso(base + PIANI[piano]["durata"]), cliente, iso(), uid))
                Database.evento(c, "pro_pass", uid, None, f"{PIANI[piano]['nome']} fino al {iso(base + PIANI[piano]['durata'])}")
            c.execute("INSERT INTO pagamenti(quando, evento, utente_id, tipo, piano, importo, valuta, riferimento, dettagli) "
                      "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(evento) DO NOTHING",
                      (iso(), eid, uid if esiste else None, "doppione" if gia else "pass", piano, 0 if gia else int(s.get("amount_total") or 0),
                       s.get("currency") or "eur", sid, "già registrato" if gia else "pass attivato"))
        return "pass attivato"

    def sincronizza(self, sub_id: str) -> tuple[int | None, str]:
        """Rilegge l'abbonamento da Stripe e aggiorna la scadenza del Pro dell'utente."""
        sub = self._stripe("GET", f"/subscriptions/{sub_id}")
        uid = self._utente(sub)
        piano = str((sub.get("metadata") or {}).get("piano") or "")
        if not piano:
            try:
                piano = {"month": "mese", "year": "anno"}.get(sub["items"]["data"][0]["price"]["recurring"]["interval"], "")
            except (KeyError, IndexError, TypeError):
                piano = ""
        stato = str(sub.get("status") or "")
        fine = _da_epoca(sub.get("current_period_end"))
        if fine is None:
            try:
                fine = _da_epoca(sub["items"]["data"][0]["current_period_end"])
            except (KeyError, IndexError, TypeError):
                fine = None
        annullato = bool(sub.get("cancel_at_period_end") or sub.get("cancel_at"))
        ora = adesso()
        if stato in ("active", "trialing") and fine:
            fino = fine if annullato else fine + timedelta(days=1)       # un giorno di margine per il rinnovo
        elif stato == "past_due" and fine:
            fino = fine + timedelta(days=3)                              # Stripe riprova l'addebito
        else:
            fino = min(ora, fine) if fine else ora
        with self.db.transazione() as c:
            if uid is None or not c.execute("SELECT 1 FROM utenti WHERE id = ?", (uid,)).fetchone():
                r0 = c.execute("SELECT utente_id FROM abbonamenti WHERE abb_id = ?", (sub_id,)).fetchone()
                uid = r0["utente_id"] if r0 else None
            if uid is None:
                return None, piano
            self._assicura_riga(c, uid)
            r = self.riga(c, uid)
            # un evento vecchio di un abbonamento chiuso non deve cancellarne uno nuovo e attivo
            if r["abb_id"] and r["abb_id"] != sub_id and r["abb_stato"] in STATI_ATTIVI and stato not in STATI_ATTIVI:
                return uid, piano
            cliente = sub.get("customer") if isinstance(sub.get("customer"), str) else None
            prima = r["abb_stato"]
            c.execute("UPDATE abbonamenti SET abb_id = ?, abb_piano = ?, abb_stato = ?, abb_fino = ?, abb_annullato = ?, "
                      "cliente_stripe = COALESCE(?, cliente_stripe), aggiornato = ? WHERE utente_id = ?",
                      (sub_id, piano, stato, iso(fino), int(annullato), cliente, iso(), uid))
            if prima != stato:
                Database.evento(c, "pro_abbonamento", uid, None, f"{PIANI.get(piano, {}).get('nome', 'abbonamento')}: {stato}")
        return uid, piano

    # ------------------------------------------------------------------ amministrazione
    def elenco(self, c: sqlite3.Connection) -> dict[str, Any]:
        ora = iso()
        pro = c.execute(
            "SELECT a.*, u.nome, u.email FROM abbonamenti a JOIN utenti u ON u.id = a.utente_id "
            "WHERE a.abb_fino > ? OR a.pass_fino > ? OR a.manuale_fino > ? ORDER BY u.nome", (ora, ora, ora)).fetchall()
        attivi = []
        for r in pro:
            st = self.stato(c, r["utente_id"])
            attivi.append({"id": r["utente_id"], "nome": r["nome"], "email": r["email"], "fino": st["fino"], "origine": st["origine"],
                           "abbonamento": st["abbonamento"]})
        movimenti = [dict(r) for r in c.execute(
            "SELECT p.quando, p.tipo, p.piano, p.importo, p.valuta, p.dettagli, u.nome, u.email FROM pagamenti p "
            "LEFT JOIN utenti u ON u.id = p.utente_id WHERE p.importo > 0 OR p.tipo IN ('stato_abbonamento', 'in_attesa') "
            "ORDER BY p.id DESC LIMIT 200")]
        mese = adesso().strftime("%Y-%m")
        incasso = c.execute("SELECT COALESCE(SUM(importo), 0) FROM pagamenti WHERE substr(quando, 1, 7) = ? AND importo > 0", (mese,)).fetchone()[0]
        return {"pro": attivi, "movimenti": movimenti, "incasso_mese": incasso}


__all__ = ["ErrorePagamento", "PIANI", "Pagamenti", "appiattisci", "verifica_firma"]
