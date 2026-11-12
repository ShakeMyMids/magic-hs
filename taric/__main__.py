"""Riga di comando di MAGIC HS.

  python -m taric                         avvia il sito
  python -m taric crea-admin              crea un amministratore (chiede email, nome e password)
  python -m taric link-password EMAIL     stampa un link per reimpostare la password di un utente
  python -m taric aggiorna-dati [AAAA-MM] scarica e installa i dati TARIC del mese (senza avviare il sito)
  python -m taric stato                   riepilogo di utenti, dati e configurazione
  python -m taric backup                  salva subito un backup del database in dati/backup
  python -m taric ripristina FILE         rimette il database di un backup (.zip o .db) - a sito SPENTO
"""
from __future__ import annotations

import argparse
import getpass
import logging
import sys

from . import sicurezza as S
from .config import carica
from .db import Database, iso


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="python -m taric", description="MAGIC HS")
    sub = ap.add_subparsers(dest="comando")
    sub.add_parser("avvia", help="avvia il sito (predefinito)")
    sub.add_parser("crea-admin", help="crea un amministratore")
    lp = sub.add_parser("link-password", help="link per reimpostare la password")
    lp.add_argument("email")
    ad = sub.add_parser("aggiorna-dati", help="scarica e installa i dati TARIC")
    ad.add_argument("mese", nargs="?", default="")
    sub.add_parser("stato", help="riepilogo")
    sub.add_parser("backup", help="backup del database")
    rp = sub.add_parser("ripristina", help="ripristina un backup (a sito spento)")
    rp.add_argument("file")
    a = ap.parse_args(argv)
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    logging.getLogger("httpx").setLevel(logging.WARNING)      # gli indirizzi firmati dei download non servono nel registro
    cfg = carica()

    if a.comando in (None, "avvia"):
        import uvicorn

        from .app import crea_app
        app = crea_app(cfg)
        print(f"MAGIC HS in ascolto su http://{cfg.host}:{cfg.porta}  (dati in {cfg.dati})", flush=True)
        uvicorn.run(app, host=cfg.host, port=cfg.porta, proxy_headers=True, forwarded_allow_ips=cfg.proxy_fidati,
                    log_level="info", server_header=False)
        return 0

    if a.comando in ("backup", "ripristina"):
        from pathlib import Path

        from .backup import Backup, ErroreBackup
        b = Backup(cfg.dati, cfg.backup_copie)
        try:
            if a.comando == "backup":
                print(f"Backup salvato: {b.crea()}")
            else:
                print(f"Database ripristinato ({b.ripristina(Path(a.file))}).")
        except ErroreBackup as e:
            print(f"Errore: {e}.")
            return 1
        return 0

    db = Database(cfg.dati / "taric.db")
    if a.comando == "crea-admin":
        email = S.normalizza_email(input("Email: "))
        if not S.email_valida(email):
            print("Email non valida.")
            return 1
        nome = input("Nome: ").strip() or email
        pw = getpass.getpass("Password (almeno 10 caratteri): ")
        if (p := S.problema_password(pw, email)):
            print(p)
            return 1
        if pw != getpass.getpass("Ripeti la password: "):
            print("Le password non coincidono.")
            return 1
        with db.transazione() as c:
            c.execute("INSERT INTO utenti(email, nome, hash_password, ruolo, stato, email_confermata, creato, aggiornato) "
                      "VALUES (?, ?, ?, 'amministratore', 'attivo', 1, ?, ?) ON CONFLICT(email) DO UPDATE SET "
                      "hash_password = excluded.hash_password, ruolo = 'amministratore', stato = 'attivo'",
                      (email, nome, S.hash_password(pw), iso(), iso()))
            db.evento(c, "admin_da_riga_di_comando", dettagli=email)
        (cfg.dati / "codice-configurazione.txt").unlink(missing_ok=True)
        print(f"Amministratore {email} pronto.")
        return 0

    if a.comando == "link-password":
        with db.transazione() as c:
            u = c.execute("SELECT id FROM utenti WHERE email = ?", (S.normalizza_email(a.email),)).fetchone()
            if u is None:
                print("Utente inesistente.")
                return 1
            g = S.crea_gettone(c, u["id"], "reimposta_password", 72)
        base = cfg.url_pubblico or f"http://{cfg.host}:{cfg.porta}"
        print(f"{base}/reimposta-password#{g}")
        return 0

    if a.comando == "aggiorna-dati":
        from .dati import GestoreDati
        from .posta import Posta
        g = GestoreDati(cfg, db, Posta(cfg))
        mese = a.mese or g._ora_locale().strftime("%Y-%m")
        r = g.esegui(mese, "riga_di_comando")
        print(f"{r['esito']}: {r['messaggio']}")
        return 0 if r["esito"] == "ok" else 1

    if a.comando == "stato":
        from .dati import GestoreDati
        from .posta import Posta
        g = GestoreDati(cfg, db, Posta(cfg))
        with db.connessione() as c:
            for r in c.execute("SELECT ruolo, stato, COUNT(*) AS n FROM utenti GROUP BY ruolo, stato"):
                print(f"utenti {r['ruolo']:<15} {r['stato']:<20} {r['n']}")
        print("dati attivi:", g.attiva() or "nessuno")
        print("IA:", f"{cfg.ia_nome}, modelli {cfg.modello_rapido} e {cfg.modello}" if cfg.ia_disponibile
              else "NON configurata (imposta GEMINI_API_KEY, ANTHROPIC_API_KEY o TARIC_IA_FORNITORE=openai)")
        print("posta:", "configurata" if cfg.posta_configurata else "NON configurata (le email restano in dati/posta)")
        return 0
    return 1


if __name__ == "__main__":
    sys.exit(main())
