"""Riga di comando di MAGIC HS: il sito e, per chi fa assistenza, backup e ripristino del database.

  python -m taric server                 avvia il sito (Render: porta da $PORT, dati in $TARIC_DATI)
  python -m taric backup                 salva subito un backup del database
  python -m taric ripristina FILE        rimette il database di un backup (.zip o .db); poi va riavviato il sito

Sul server di Render (Shell del servizio) la cartella dei dati e' gia' in $TARIC_DATI; --dati ne indica un'altra.
"""
from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

from .backup import Backup, ErroreBackup


def avvia_server(porta: int, host: str) -> int:
    """Il sito: account con approvazione, IA unica (GEMINI_API_KEY), dati TARIC; dietro il proxy HTTPS di Render."""
    import logging

    import uvicorn

    from .app import crea_app
    from .config import carica

    porta = porta or int(os.environ.get("PORT") or 8000)
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s", force=True)
    logging.getLogger("httpx").setLevel(logging.WARNING)
    cfg = carica({"TARIC_PORTA": str(porta)})
    logging.getLogger("taric").info("MAGIC HS sito: dati in %s, IA %s, amministratori %d", cfg.dati,
                                    cfg.ia_nome if cfg.ia_disponibile else "spenta", len(cfg.amministratori))
    uvicorn.run(crea_app(cfg), host=host, port=porta, proxy_headers=True, forwarded_allow_ips="*",
                log_config=None, access_log=False, server_header=False)
    return 0


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="python -m taric", description="MAGIC HS: sito, backup e ripristino del database")
    ap.add_argument("--dati", default="", help="cartella dei dati (predefinita: $TARIC_DATI oppure ./dati)")
    sub = ap.add_subparsers(dest="comando", required=True)
    sv = sub.add_parser("server", help="avvia il sito")
    sv.add_argument("--porta", type=int, default=0, help="porta (predefinita: $PORT oppure 8000)")
    sv.add_argument("--host", default="0.0.0.0")
    sub.add_parser("backup", help="backup del database adesso")
    rp = sub.add_parser("ripristina", help="ripristina un backup (poi riavvia il sito)")
    rp.add_argument("file")
    a = ap.parse_args(argv)
    if a.dati:
        os.environ["TARIC_DATI"] = a.dati
    if a.comando == "server":
        return avvia_server(a.porta, a.host)
    b = Backup(Path(os.environ.get("TARIC_DATI") or "dati"))
    try:
        if a.comando == "backup":
            print(f"Backup salvato: {b.crea()}")
        else:
            print(f"Database ripristinato ({b.ripristina(Path(a.file))}). Riavvia il sito (su Render: Manual Deploy > Restart service).")
    except ErroreBackup as e:
        print(f"Errore: {e}.")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
