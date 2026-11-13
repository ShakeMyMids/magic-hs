"""Riga di comando di MAGIC HS: il sito e, per chi fa assistenza, backup e ripristino del database.

  python -m taric server                 avvia il sito (Render: porta da $PORT, dati in $TARIC_DATI)
  python -m taric backup                 salva subito un backup del database
  python -m taric ripristina FILE        rimette il database di un backup (.zip o .db), a MAGIC HS chiuso

Sul server di Render (Shell del servizio): python -m taric --cartella /var/data/magic-hs backup

Su Windows si usa il Python del programma, per esempio:
  "%LOCALAPPDATA%\\MAGIC HS\\programma\\<versione>\\python\\python.exe" -I -m taric ripristina FILE
La cartella predefinita e' quella dell'utente di Windows (%LOCALAPPDATA%\\MAGIC HS); --cartella ne indica un'altra.
Il programma si avvia invece con «Avvia MAGIC HS.cmd» (taric.programma).
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

from .backup import Backup, ErroreBackup
from .programma import Blocco, cartella_utente


def avvia_server(porta: int, host: str) -> int:
    """Il sito: account con approvazione, IA unica (GEMINI_API_KEY), dati TARIC; dietro il proxy HTTPS di Render."""
    import logging
    import os

    import uvicorn

    from .app import crea_app
    from .config import carica

    porta = porta or int(os.environ.get("PORT") or 8000)
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s", force=True)
    logging.getLogger("httpx").setLevel(logging.WARNING)
    cfg = carica({"TARIC_SERVER": "1", "TARIC_PORTA": str(porta)})
    logging.getLogger("taric").info("MAGIC HS sito: dati in %s, IA %s, amministratori %d", cfg.dati,
                                    cfg.ia_nome if cfg.ia_disponibile else "spenta", len(cfg.amministratori))
    uvicorn.run(crea_app(cfg), host=host, port=porta, proxy_headers=True, forwarded_allow_ips="*",
                log_config=None, access_log=False, server_header=False)
    return 0


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="python -m taric", description="MAGIC HS: sito, backup e ripristino del database")
    ap.add_argument("--cartella", default="", help="cartella dell'utente (predefinita: %%LOCALAPPDATA%%\\MAGIC HS)")
    sub = ap.add_subparsers(dest="comando", required=True)
    sv = sub.add_parser("server", help="avvia il sito")
    sv.add_argument("--porta", type=int, default=0, help="porta (predefinita: $PORT oppure 8000)")
    sv.add_argument("--host", default="0.0.0.0")
    sub.add_parser("backup", help="backup del database adesso")
    rp = sub.add_parser("ripristina", help="ripristina un backup (a MAGIC HS chiuso)")
    rp.add_argument("file")
    a = ap.parse_args(argv)
    if a.comando == "server":
        return avvia_server(a.porta, a.host)
    cartella = Path(a.cartella) if a.cartella else cartella_utente()
    b = Backup(cartella / "dati")
    try:
        if a.comando == "backup":
            print(f"Backup salvato: {b.crea()}")
            return 0
        blocco = Blocco(cartella / "istanza.lock")
        if cartella.is_dir() and not blocco.prendi():
            print("MAGIC HS è aperto: chiudilo (pulsante in alto a destra) e riprova.")
            return 1
        try:
            print(f"Database ripristinato ({b.ripristina(Path(a.file))}).")
        finally:
            blocco.lascia()
    except ErroreBackup as e:
        print(f"Errore: {e}.")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
