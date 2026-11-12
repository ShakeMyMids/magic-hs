"""Cartella condivisa del programma per Windows (per esempio una cartella di OneDrive aziendale).

Chi può scrivere nella cartella (l'«editore») pubblica qui programma, dati TARIC e impostazioni; i colleghi la
ricevono da OneDrive in sola lettura e il programma ne copia il contenuto sul proprio PC. Struttura:

    Avvia MAGIC HS.cmd                  avvio (doppio clic)
    LEGGIMI.txt
    programma/versione.txt              versione del programma da usare
    programma/magic-hs-<versione>.zip   Python, librerie e programma per Windows
    dati/attiva.txt                     versione dei dati TARIC da usare (AAAA-MM-01)
    dati/<AAAA-MM-01>.zip               file generati da aggiorna.py
    impostazioni.json                   servizio IA e limite mensile, scritti dall'editore

OneDrive può consegnare i file in un ordine qualsiasi e tenerli bloccati mentre li carica: chi legge controlla
che i file siano completi e, se non lo sono, riprova al giro successivo; chi scrive passa da un file temporaneo
e ritenta la sostituzione.
"""
from __future__ import annotations

import json
import logging
import os
import re
import secrets
import shutil
import time
import zipfile
from pathlib import Path
from typing import Any, Callable

from .dati import RE_FILE, RE_VERSIONE

log = logging.getLogger("taric.condivisa")

RE_VERSIONE_PROGRAMMA = re.compile(r"^[0-9A-Za-z][0-9A-Za-z.\-]{0,39}$")
NOME_AVVIO = "Avvia MAGIC HS.cmd"
VERSIONI_DATI_TENUTE = 3
VERSIONI_PROGRAMMA_TENUTE = 2
MAX_DATI = 200 * 1024 * 1024          # dati di un mese una volta estratti (oggi circa 12 MB)
CAMPI_IA = ("fornitore", "chiave", "url", "modello", "modello_rapido")


class ErroreCondivisa(Exception):
    pass


def sostituisci(origine: Path, dest: Path, tentativi: int = 12) -> None:
    """os.replace che ritenta: su Windows OneDrive o un antivirus possono tenere aperto il file per qualche istante."""
    for n in range(tentativi):
        try:
            os.replace(origine, dest)
            return
        except PermissionError:
            if n == tentativi - 1:
                raise
            time.sleep(0.25 * (n + 1))


def scrivi_testo(dest: Path, testo: str) -> None:
    tmp = dest.with_name(f".{dest.name}.{secrets.token_hex(4)}.tmp")
    tmp.write_text(testo, encoding="utf-8", newline="\n")
    sostituisci(tmp, dest)


def leggi_riga(f: Path) -> str:
    try:
        return f.read_text(encoding="utf-8-sig").strip().splitlines()[0].strip()
    except (OSError, IndexError, UnicodeDecodeError):
        return ""


def estrai_dati(archivio: Path, dest: Path) -> None:
    """Estrae un archivio di dati TARIC: solo i nomi ammessi dal server (dati.RE_FILE) e con limiti di dimensione."""
    dest.mkdir(parents=True)
    with zipfile.ZipFile(archivio) as z:
        membri = [i for i in z.infolist() if not i.is_dir()]
        if len(membri) > 500 or sum(i.file_size for i in membri) > MAX_DATI:
            raise ErroreCondivisa("archivio dei dati troppo grande")
        for i in membri:
            nome = i.filename.replace("\\", "/")
            if not RE_FILE.match(nome):
                continue
            f = dest / nome
            f.parent.mkdir(parents=True, exist_ok=True)
            with z.open(i) as sorgente, open(f, "wb") as uscita:
                copiati = 0
                while blocco := sorgente.read(1 << 20):
                    copiati += len(blocco)
                    if copiati > i.file_size + 1024:
                        raise ErroreCondivisa("dimensione di un file nell'archivio non coerente")
                    uscita.write(blocco)


def versione_pacchetto(archivio: Path) -> str:
    """Versione di un pacchetto del programma per Windows; ErroreCondivisa se il file non è un pacchetto valido."""
    try:
        with zipfile.ZipFile(archivio) as z:
            nomi = set(z.namelist())
            if "python/pythonw.exe" not in nomi or "python/Lib/site-packages/taric/__init__.py" not in nomi:
                raise ErroreCondivisa("non è un pacchetto di MAGIC HS per Windows")
            testo = z.read("python/Lib/site-packages/taric/__init__.py").decode("utf-8", "replace")
            if z.testzip() is not None:
                raise ErroreCondivisa("archivio danneggiato")
    except (zipfile.BadZipFile, OSError) as e:
        raise ErroreCondivisa(f"archivio non leggibile ({e})")
    m = re.search(r'^__version__\s*=\s*"([^"]+)"', testo, re.M)
    if not m or not RE_VERSIONE_PROGRAMMA.match(m.group(1)):
        raise ErroreCondivisa("versione del programma non trovata nel pacchetto")
    return m.group(1)


class Condivisa:
    def __init__(self, percorso: Path):
        self.percorso = percorso
        self.programma = percorso / "programma"
        self.dati = percorso / "dati"
        self.file_impostazioni = percorso / "impostazioni.json"

    def raggiungibile(self) -> bool:
        return self.percorso.is_dir()

    def scrivibile(self) -> bool:
        """True se da questo PC si può pubblicare (permesso di scrittura sulla cartella)."""
        prova = self.percorso / f".prova-scrittura-{secrets.token_hex(4)}"
        try:
            prova.write_bytes(b"")
            prova.unlink()
            return True
        except OSError:
            return False

    # ------------------------------------------------------------------ programma
    def versione_programma(self) -> str:
        v = leggi_riga(self.programma / "versione.txt")
        return v if RE_VERSIONE_PROGRAMMA.match(v) else ""

    def pubblica_programma(self, pacchetto: Path) -> str:
        """Copia nella cartella un pacchetto del programma e lo indica come versione da usare. Restituisce la versione."""
        versione = versione_pacchetto(pacchetto)
        self.programma.mkdir(parents=True, exist_ok=True)
        dest = self.programma / f"magic-hs-{versione}.zip"
        tmp = self.programma / f".{dest.name}.{secrets.token_hex(4)}.tmp"
        shutil.copyfile(pacchetto, tmp)
        sostituisci(tmp, dest)
        # il file di avvio può cambiare tra una versione e l'altra: quello nuovo sta nel pacchetto
        with zipfile.ZipFile(pacchetto) as z:
            if NOME_AVVIO in z.namelist():
                tmp_avvio = self.percorso / f".avvio.{secrets.token_hex(4)}.tmp"
                tmp_avvio.write_bytes(z.read(NOME_AVVIO))
                sostituisci(tmp_avvio, self.percorso / NOME_AVVIO)
        scrivi_testo(self.programma / "versione.txt", versione + "\r\n")       # a capo di Windows, per «set /p» dell'avvio
        pacchetti = sorted(self.programma.glob("magic-hs-*.zip"), key=lambda f: f.stat().st_mtime, reverse=True)
        for vecchio in pacchetti[VERSIONI_PROGRAMMA_TENUTE:]:
            if vecchio != dest:
                vecchio.unlink(missing_ok=True)
        return versione

    # ------------------------------------------------------------------ dati TARIC
    def dati_pubblicati(self) -> str:
        v = leggi_riga(self.dati / "attiva.txt")
        return v if RE_VERSIONE.match(v) else ""

    def pubblica_dati(self, versione: str, cartella: Path) -> None:
        """Mette nella cartella i dati di una versione installata sul PC e la indica come versione da usare."""
        if not RE_VERSIONE.match(versione) or not (cartella / "nomenclatura.js").is_file():
            raise ErroreCondivisa("versione dei dati non valida")
        self.dati.mkdir(parents=True, exist_ok=True)
        dest = self.dati / f"{versione}.zip"
        tmp = self.dati / f".{versione}.{secrets.token_hex(4)}.tmp"
        try:
            with zipfile.ZipFile(tmp, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as z:
                for f in sorted(cartella.rglob("*")):
                    nome = f.relative_to(cartella).as_posix()
                    if f.is_file() and RE_FILE.match(nome):
                        z.write(f, nome)
            sostituisci(tmp, dest)
        finally:
            tmp.unlink(missing_ok=True)
        scrivi_testo(self.dati / "attiva.txt", versione + "\n")
        archivi = sorted((f for f in self.dati.glob("*.zip") if RE_VERSIONE.match(f.stem)), reverse=True)
        for vecchio in archivi[VERSIONI_DATI_TENUTE:]:
            if vecchio.stem != versione:
                vecchio.unlink(missing_ok=True)
        log.info("dati %s pubblicati nella cartella condivisa", versione)

    def ricevi_dati(self, versioni: Path, imposta_attiva: Callable[[str], None], attiva: str | None) -> str:
        """Installa sul PC la versione dei dati indicata nella cartella, se manca. Restituisce la versione da usare
        ("" se la cartella non ne indica una o se l'archivio non è ancora arrivato da OneDrive)."""
        v = self.dati_pubblicati()
        if not v:
            return ""
        if not (versioni / v / "nomenclatura.js").is_file():
            archivio = self.dati / f"{v}.zip"
            if not archivio.is_file():
                log.info("dati %s indicati nella cartella ma l'archivio non c'è ancora", v)
                return ""
            tmp = versioni.parent / "lavoro" / f"ricevuti-{secrets.token_hex(4)}"
            try:
                estrai_dati(archivio, tmp)
                info = json.loads((tmp / "versione.json").read_text(encoding="utf-8"))
                if info.get("data") != v or not (tmp / "nomenclatura.js").is_file():
                    raise ErroreCondivisa("l'archivio non contiene i dati attesi")
                dest = versioni / v
                if dest.exists():
                    shutil.rmtree(dest)
                os.replace(tmp, dest)
                log.info("dati %s ricevuti dalla cartella condivisa", v)
            except (OSError, ValueError, zipfile.BadZipFile, ErroreCondivisa) as e:
                log.warning("dati %s non ancora utilizzabili: %s", v, e)
                return ""
            finally:
                shutil.rmtree(tmp, ignore_errors=True)
        if attiva != v:
            imposta_attiva(v)
        return v

    # ------------------------------------------------------------------ impostazioni
    def impostazioni(self) -> dict[str, Any]:
        """Impostazioni scritte dall'editore; {} se il file non c'è o non si legge."""
        try:
            d = json.loads(self.file_impostazioni.read_text(encoding="utf-8-sig"))
        except (OSError, ValueError):
            return {}
        return d if isinstance(d, dict) else {}

    def salva_impostazioni(self, imp: dict[str, Any]) -> None:
        scrivi_testo(self.file_impostazioni, json.dumps(imp, ensure_ascii=False, indent=2) + "\n")


def ia_da_impostazioni(imp: dict[str, Any]) -> dict[str, str]:
    """Valori della configurazione (come in taric.env) per il servizio IA scelto dall'editore."""
    ia = imp.get("ia") if isinstance(imp.get("ia"), dict) else {}
    v = {k: str(ia.get(k) or "").strip() for k in CAMPI_IA}
    return {"TARIC_IA_FORNITORE": v["fornitore"] or "nessuno", "TARIC_IA_CHIAVE": v["chiave"], "TARIC_IA_URL": v["url"],
            "TARIC_IA_MODELLO": v["modello"], "TARIC_IA_MODELLO_RAPIDO": v["modello_rapido"]}


__all__ = ["Condivisa", "ErroreCondivisa", "estrai_dati", "ia_da_impostazioni", "versione_pacchetto", "NOME_AVVIO"]
