"""Prepara i dati TARIC dei mesi passati dall'archivio della Commissione europea (DG TAXUD) su CIRCABC, pronti per il sito:

  python strumenti/dati_storici.py AAAA-MM [AAAA-MM ...] --uscita cartella

Per ogni mese, in ordine: scarica dalla cartella del mese su CIRCABC i file che servono (le tabelle di taric/aggiorna.py,
il testo italiano della nomenclatura quando c'e', i cambi), li elabora con gli stessi passaggi e controlli del sito
(dati.GestoreDati, aggiorna.py) e scrive cartella/dati-AAAA-MM-01.zip, come strumenti/dati_mese.py. I mesi si fanno in
ordine con lo stesso testo italiano: quello dei mesi che hanno «Nomenclature IT» (gennaio e luglio) vale per i successivi.
Lo usa il flusso «Dati TARIC dei mesi passati» (.github/workflows/dati-storici.yml), che li pubblica nella pagina «dati».
CIRCABC ha le estrazioni da luglio 2025; dalle sessioni di sviluppo non si raggiunge, da GitHub si'. Accesso come ospite.
Codice di uscita: 0 = tutti i mesi scritti, 1 = almeno un mese non riuscito (gli altri restano scritti).
"""
from __future__ import annotations

import argparse
import base64
import re
import sys
import tempfile
import time
import xml.etree.ElementTree as ET
import zipfile
from datetime import datetime
from pathlib import Path

import httpx

RADICE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(RADICE))

from taric.config import carica                       # noqa: E402
from taric.dati import RE_FILE, GestoreDati, nome_ufficiale   # noqa: E402
from taric.db import Database                         # noqa: E402

BASE = "https://circabc.europa.eu/service/api/node/workspace/SpacesStore"
LIBRERIA = "64db9d0f-e7c9-4084-afe9-f47e70e53c10"      # dati TARIC del gruppo «TARIC & Quota Data and Information»
ATOM = "{http://www.w3.org/2005/Atom}"
MESI_EN = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]
CLIENT = httpx.Client(timeout=httpx.Timeout(300, connect=30), follow_redirects=True,
                      headers={"Authorization": "Basic " + base64.b64encode(b"guest:").decode(), "User-Agent": "MAGIC-HS dati dei mesi passati"})


def scarica(url: str) -> bytes:
    for n in range(4):
        try:
            r = CLIENT.get(url)
            r.raise_for_status()
            return r.content
        except httpx.HTTPError:
            if n == 3:
                raise
            time.sleep(10 * 2 ** n)
    raise AssertionError


def figli(nodo: str) -> list[dict]:
    """Le voci di una cartella di CIRCABC: titolo, identificativo e data dell'ultimo caricamento."""
    out = []
    for e in ET.fromstring(scarica(f"{BASE}/{nodo}/children")).iter(ATOM + "entry"):
        sé = next((l.get("href", "") for l in e.findall(ATOM + "link") if l.get("rel") == "self"), "")
        m = re.search(r"SpacesStore/i/([0-9a-f-]{36})", sé)
        quando = (e.findtext(ATOM + "updated") or "").strip()
        out.append({"titolo": (e.findtext(ATOM + "title") or "").strip(), "id": m.group(1) if m else None, "aggiornato": quando})
    return out


def data_zip(iso: str) -> tuple[int, int, int, int, int, int]:
    try:
        d = datetime.fromisoformat(iso.replace("Z", "+00:00"))
        return (d.year, d.month, d.day, d.hour, d.minute, d.second)
    except ValueError:
        return (1980, 1, 1, 0, 0, 0)


def estrazione(mese: str, dest: Path) -> list[str]:
    """Scarica in un archivio .zip i file del mese che servono, con i loro nomi e date su CIRCABC (dati._estrai
    sceglie poi il nome ufficiale e, se un file c'e' due volte, il caricato per ultimo). Restituisce i nomi."""
    anno, m = mese.split("-")
    cartella_anno = next((v for v in figli(LIBRERIA) if v["titolo"] == anno), None)
    if cartella_anno is None:
        raise SystemExit(f"{mese}: l'anno {anno} non c'e' su CIRCABC")
    cartella = next((v for v in figli(cartella_anno["id"]) if re.match(rf"^{m}\b", v["titolo"])), None)
    if cartella is None:
        raise SystemExit(f"{mese}: il mese non c'e' su CIRCABC ({MESI_EN[int(m) - 1]} {anno})")
    nomi = []
    with zipfile.ZipFile(dest, "w", zipfile.ZIP_DEFLATED) as z:
        for f in figli(cartella["id"]):
            if f["id"] and nome_ufficiale(f["titolo"]):
                info = zipfile.ZipInfo(f["titolo"], date_time=data_zip(f["aggiornato"]))
                info.compress_type = zipfile.ZIP_DEFLATED
                z.writestr(info, scarica(f"{BASE}/{f['id']}/content"))
                nomi.append(f["titolo"])
    return nomi


def scrivi(cartella: Path, uscita: Path) -> None:
    uscita.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(uscita, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        for f in sorted(cartella.rglob("*")):
            nome = f.relative_to(cartella).as_posix()
            if f.is_file() and RE_FILE.match(nome):
                z.write(f, nome)


def main(argv: list[str]) -> int:
    a = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    a.add_argument("mesi", nargs="+", help="mesi AAAA-MM")
    a.add_argument("--uscita", required=True, type=Path)
    a = a.parse_args(argv)
    mesi = sorted(set(a.mesi))
    if any(not re.fullmatch(r"\d{4}-\d{2}", m) for m in mesi):
        print("Mesi non validi: scrivili come AAAA-MM.")
        return 1
    falliti = []
    with tempfile.TemporaryDirectory() as tmp:
        cfg = carica({"TARIC_DATI": tmp, "TARIC_DATI_URL": "", "TARIC_AGGIORNAMENTI_URL": ""})
        dati = GestoreDati(cfg, Database(Path(tmp) / "taric.db"))
        for mese in mesi:
            print(f"\n=== {mese}")
            try:
                archivio = Path(tmp) / f"circabc-{mese}.zip"
                print("file:", ", ".join(estrazione(mese, archivio)))
                r = dati.esegui(mese, "circabc", archivio=archivio)
            except (SystemExit, httpx.HTTPError, OSError) as e:
                print(f"errore: {e}")
                falliti.append(mese)
                continue
            print(f"{r['esito']}: {r['messaggio']}")
            if r["esito"] != "ok":
                print(dati.registro(dati.ultimi(1)[0]["id"])[-4000:])
                falliti.append(mese)
                continue
            uscita = a.uscita / f"dati-{mese}-01.zip"
            scrivi(dati.versioni / f"{mese}-01", uscita)
            print(f"scritto {uscita} ({uscita.stat().st_size // 1024} KB)")
            sys.stdout.flush()
    if falliti:
        print("\nMesi non riusciti: " + ", ".join(falliti))
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
