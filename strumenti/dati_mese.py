"""Prepara i dati TARIC di un mese, pronti per i PC: python strumenti/dati_mese.py AAAA-MM file-di-uscita.zip

Scarica l'estrazione dalla fonte e la elabora con gli stessi passaggi e controlli del programma (dati.GestoreDati,
aggiorna.py); se tutto va bene scrive l'archivio con i file dei dati (dati.RE_FILE). Lo usa il flusso GitHub «Dati
TARIC» (.github/workflows/dati.yml), che lo pubblica nella pagina «dati»: i PC lo scaricano da li'.
Codice di uscita: 0 = archivio scritto, 2 = estrazione del mese non ancora disponibile alla fonte, 1 = errore.
"""
from __future__ import annotations

import sys
import tempfile
import zipfile
from pathlib import Path

RADICE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(RADICE))

from taric.config import carica          # noqa: E402
from taric.dati import RE_FILE, GestoreDati   # noqa: E402
from taric.db import Database            # noqa: E402


def main(argv: list[str]) -> int:
    if len(argv) != 2:
        print(__doc__)
        return 1
    mese, uscita = argv[0], Path(argv[1])
    with tempfile.TemporaryDirectory() as tmp:
        cfg = carica({"TARIC_DATI": tmp, "TARIC_DATI_URL": "", "TARIC_AGGIORNAMENTI_URL": ""})   # sempre dalla fonte
        dati = GestoreDati(cfg, Database(Path(tmp) / "taric.db"))
        r = dati.esegui(mese, "github")
        print(f"{r['esito']}: {r['messaggio']}")
        if r["esito"] == "non_disponibile":
            return 2
        if r["esito"] != "ok":
            print(dati.registro(dati.ultimi(1)[0]["id"])[-4000:])
            return 1
        cartella = dati.versioni / f"{mese}-01"
        uscita.parent.mkdir(parents=True, exist_ok=True)
        with zipfile.ZipFile(uscita, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as z:
            for f in sorted(cartella.rglob("*")):
                nome = f.relative_to(cartella).as_posix()
                if f.is_file() and RE_FILE.match(nome):
                    z.write(f, nome)
    print(f"scritto {uscita} ({uscita.stat().st_size // 1024} KB)")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
