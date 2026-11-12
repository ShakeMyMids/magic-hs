"""La procedura automatica delle registrazioni (il "bot"): iscrizione, conferma dell'email,
regole di approvazione, avvisi e pulizia. L'amministratore puo' sempre intervenire a mano."""
from __future__ import annotations

import sqlite3
from typing import Any

from . import sicurezza as S
from .db import Database, iso, tra
from .posta import Posta

ORE_CONFERMA = 48
GIORNI_PULIZIA_NON_CONFERMATI = 7
GIORNI_PULIZIA_RIFIUTATI = 90


class Registrazioni:
    def __init__(self, db: Database, posta: Posta):
        self.db = db
        self.posta = posta

    # ------------------------------------------------------------------ iscrizione
    def iscrivi(self, c: sqlite3.Connection, nome: str, azienda: str, email: str, password: str, richiesta: str,
                base_url: str) -> dict[str, Any]:
        imp = self.db.impostazioni(c)
        if not imp["registrazione_aperta"]:
            return {"ok": False, "errore": "Le registrazioni sono chiuse. Chiedi un account all'amministratore."}
        dom = S.dominio(email)
        if dom in imp["domini_bloccati"]:
            return {"ok": False, "errore": "Le registrazioni da questo dominio non sono accettate."}
        in_attesa = c.execute("SELECT COUNT(*) FROM utenti WHERE stato IN ('in_attesa', 'email_da_confermare')").fetchone()[0]
        if in_attesa >= imp["massimo_in_attesa"]:
            return {"ok": False, "errore": "Ci sono già molte richieste in attesa. Riprova più tardi."}

        con_email = self.posta.configurata
        messaggio = ("Ti abbiamo inviato un'email: apri il link che contiene per confermare l'indirizzo. "
                     "Se non la trovi, controlla nella posta indesiderata."
                     if con_email else
                     "Richiesta registrata. Riceverai l'accesso quando un amministratore l'avrà approvata.")
        esistente = c.execute("SELECT * FROM utenti WHERE email = ?", (email,)).fetchone()
        if esistente is not None:
            # stessa risposta di un'iscrizione nuova: non si rivela quali indirizzi sono registrati
            if esistente["stato"] == "email_da_confermare" and con_email:
                self._manda_conferma(c, esistente, base_url)
            elif con_email:
                self.posta.invia(email, "MAGIC HS: tentativo di registrazione",
                                 f"Ciao {esistente['nome']},\n\nqualcuno ha chiesto di registrarsi a MAGIC HS con questo indirizzo, "
                                 f"che ha già un account.\nSe hai dimenticato la password puoi reimpostarla qui:\n"
                                 f"{base_url}/password-dimenticata\n\nSe non sei stato tu, ignora questo messaggio.")
            self.db.evento(c, "registrazione_duplicata", esistente["id"], dettagli=email)
            return {"ok": True, "messaggio": messaggio}

        stato = "email_da_confermare" if con_email else "in_attesa"
        cur = c.execute(
            "INSERT INTO utenti(email, nome, azienda, richiesta, hash_password, stato, creato, aggiornato, quota_ia) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL)",
            (email, nome, azienda, richiesta, S.hash_password(password), stato, iso(), iso()))
        uid = cur.lastrowid
        self.db.evento(c, "registrazione", uid, dettagli=f"{email} ({azienda or 'nessuna azienda'})")
        utente = c.execute("SELECT * FROM utenti WHERE id = ?", (uid,)).fetchone()
        if con_email:
            self._manda_conferma(c, utente, base_url)
        else:
            # senza posta l'indirizzo non si puo' verificare: niente approvazione automatica, decide l'amministratore
            self._metti_in_attesa(c, utente, base_url, verificata=False)
        return {"ok": True, "messaggio": messaggio}

    def _manda_conferma(self, c: sqlite3.Connection, utente: sqlite3.Row, base_url: str) -> None:
        g = S.crea_gettone(c, utente["id"], "conferma_email", ORE_CONFERMA)
        self.posta.invia(utente["email"], "MAGIC HS: conferma il tuo indirizzo email",
                         f"Ciao {utente['nome']},\n\nper completare la registrazione a MAGIC HS apri questo link "
                         f"(vale {ORE_CONFERMA} ore):\n{base_url}/conferma-email#{g}\n\n"
                         "Se non hai chiesto tu la registrazione, ignora questo messaggio.")

    # ------------------------------------------------------------------ conferma dell'email e regole
    def conferma(self, c: sqlite3.Connection, gettone: str, base_url: str) -> dict[str, Any]:
        uid = S.usa_gettone(c, gettone, "conferma_email")
        if uid is None:
            return {"ok": False, "errore": "Il link non è valido o è scaduto. Registrati di nuovo per riceverne uno nuovo."}
        utente = c.execute("SELECT * FROM utenti WHERE id = ?", (uid,)).fetchone()
        if utente is None or utente["stato"] != "email_da_confermare":
            return {"ok": True, "stato": utente["stato"] if utente else "", "messaggio": "Indirizzo già confermato."}
        c.execute("UPDATE utenti SET email_confermata = 1, aggiornato = ? WHERE id = ?", (iso(), uid))
        self.db.evento(c, "email_confermata", uid)
        imp = self.db.impostazioni(c)
        dom = S.dominio(utente["email"])
        if imp["approva_tutti"] or dom in imp["domini_approvati"]:
            self._attiva(c, utente, None, base_url, motivo="dominio approvato" if dom in imp["domini_approvati"] else "approvazione automatica")
            return {"ok": True, "stato": "attivo", "messaggio": "Indirizzo confermato e account attivato: ora puoi accedere."}
        self._metti_in_attesa(c, utente, base_url, verificata=True)
        return {"ok": True, "stato": "in_attesa",
                "messaggio": "Indirizzo confermato. La richiesta è in attesa di approvazione: riceverai un'email quando sarà attiva."}

    def _metti_in_attesa(self, c: sqlite3.Connection, utente: sqlite3.Row, base_url: str, verificata: bool) -> None:
        c.execute("UPDATE utenti SET stato = 'in_attesa', aggiornato = ? WHERE id = ?", (iso(), utente["id"]))
        self.db.evento(c, "in_attesa", utente["id"], dettagli="email confermata" if verificata else "email non verificata")
        if verificata:
            self.posta.invia(utente["email"], "MAGIC HS: richiesta ricevuta",
                             f"Ciao {utente['nome']},\n\nla tua richiesta di accesso a MAGIC HS è stata ricevuta ed è in attesa "
                             "di approvazione. Riceverai un'email quando l'account sarà attivo.")
        amministratori = c.execute("SELECT email FROM utenti WHERE ruolo = 'amministratore' AND stato = 'attivo'").fetchall()
        for a in amministratori:
            self.posta.invia(a["email"], f"MAGIC HS: nuova richiesta di accesso da {utente['nome']}",
                             f"Nuova richiesta di accesso a MAGIC HS.\n\nNome: {utente['nome']}\nEmail: {utente['email']}"
                             f" ({'confermata' if verificata else 'NON verificata: la posta del server non è configurata'})\n"
                             f"Azienda: {utente['azienda'] or '-'}\nUso previsto: {utente['richiesta'] or '-'}\n\n"
                             f"Approva o rifiuta dal pannello: {base_url}/#amministrazione")

    def _attiva(self, c: sqlite3.Connection, utente: sqlite3.Row, autore_id: int | None, base_url: str, motivo: str) -> None:
        c.execute("UPDATE utenti SET stato = 'attivo', motivo_stato = '', aggiornato = ? WHERE id = ?", (iso(), utente["id"]))
        self.db.evento(c, "approvato" if autore_id else "approvato_automaticamente", utente["id"], autore_id, motivo)
        self.posta.invia(utente["email"], "MAGIC HS: il tuo account è attivo",
                         f"Ciao {utente['nome']},\n\nil tuo account MAGIC HS è attivo. Accedi qui con l'email e la password "
                         f"che hai scelto:\n{base_url}/accedi")

    # ------------------------------------------------------------------ azioni dell'amministratore
    def approva(self, c: sqlite3.Connection, uid: int, autore_id: int, base_url: str) -> str | None:
        u = c.execute("SELECT * FROM utenti WHERE id = ?", (uid,)).fetchone()
        if u is None:
            return "Utente inesistente."
        if u["stato"] == "attivo":
            return None
        if u["hash_password"] is None:
            return "L'utente non ha ancora scelto una password: mandagli un link per impostarla."
        self._attiva(c, u, autore_id, base_url, motivo="approvato dall'amministratore")
        return None

    def rifiuta(self, c: sqlite3.Connection, uid: int, autore_id: int, motivo: str) -> str | None:
        u = c.execute("SELECT * FROM utenti WHERE id = ?", (uid,)).fetchone()
        if u is None:
            return "Utente inesistente."
        c.execute("UPDATE utenti SET stato = 'rifiutato', motivo_stato = ?, aggiornato = ? WHERE id = ?", (motivo, iso(), uid))
        S.chiudi_tutte(c, uid)
        self.db.evento(c, "rifiutato", uid, autore_id, motivo)
        if u["email_confermata"] or self.posta.configurata:
            self.posta.invia(u["email"], "MAGIC HS: richiesta non accolta",
                             f"Ciao {u['nome']},\n\nla tua richiesta di accesso a MAGIC HS non è stata accolta."
                             + (f"\nMotivo: {motivo}" if motivo else ""))
        return None

    def sospendi(self, c: sqlite3.Connection, uid: int, autore_id: int, motivo: str) -> str | None:
        c.execute("UPDATE utenti SET stato = 'sospeso', motivo_stato = ?, aggiornato = ? WHERE id = ?", (motivo, iso(), uid))
        S.chiudi_tutte(c, uid)
        self.db.evento(c, "sospeso", uid, autore_id, motivo)
        return None

    # ------------------------------------------------------------------ pulizia periodica
    def pulizia(self, c: sqlite3.Connection) -> dict[str, int]:
        out = {}
        out["non_confermati"] = c.execute("DELETE FROM utenti WHERE stato = 'email_da_confermare' AND creato < ?",
                                          (tra(days=-GIORNI_PULIZIA_NON_CONFERMATI),)).rowcount
        out["rifiutati"] = c.execute("DELETE FROM utenti WHERE stato = 'rifiutato' AND aggiornato < ?",
                                     (tra(days=-GIORNI_PULIZIA_RIFIUTATI),)).rowcount
        out["sessioni"] = c.execute("DELETE FROM sessioni WHERE scade < ?", (iso(),)).rowcount
        out["gettoni"] = c.execute("DELETE FROM gettoni WHERE scade < ? OR usato IS NOT NULL", (tra(days=-1),)).rowcount
        import time
        out["tentativi"] = c.execute("DELETE FROM tentativi WHERE quando < ?", (time.time() - 86400,)).rowcount
        out["eventi"] = c.execute("DELETE FROM eventi WHERE quando < ?", (tra(days=-730),)).rowcount
        if out["non_confermati"] or out["rifiutati"]:
            self.db.evento(c, "pulizia", dettagli=f"eliminate {out['non_confermati']} registrazioni non confermate e "
                                                  f"{out['rifiutati']} richieste rifiutate da tempo")
        return out
