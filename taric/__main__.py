"""Riga di comando di MAGIC HS sul PC, per chi fa assistenza: backup e ripristino del database dell'utente.

  python -m taric backup                 salva subito un backup del database
  python -m taric ripristina FILE        rimette il database di un backup (.zip o .db), a MAGIC HS chiuso

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


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="python -m taric", description="MAGIC HS: backup e ripristino del database del PC")
    ap.add_argument("--cartella", default="", help="cartella dell'utente (predefinita: %%LOCALAPPDATA%%\\MAGIC HS)")
    sub = ap.add_subparsers(dest="comando", required=True)
    sub.add_parser("backup", help="backup del database adesso")
    rp = sub.add_parser("ripristina", help="ripristina un backup (a MAGIC HS chiuso)")
    rp.add_argument("file")
    a = ap.parse_args(argv)
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
