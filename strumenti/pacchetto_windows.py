"""Costruisce il programma per Windows di MAGIC HS (si può eseguire anche da Linux o macOS).

    python strumenti/pacchetto_windows.py [--uscita dist]

Produce in dist/:
  MAGIC-HS-<versione>.zip            la cartella «MAGIC HS» da scaricare ed estrarre su ogni PC (avvio, istruzioni
                                     e programma); i dati TARIC li scarica il programma al primo avvio
  magic-hs-windows-<versione>.zip    Python per Windows con le librerie e MAGIC HS: è il file che i programmi già
                                     installati scaricano da soli dalla pagina delle versioni. Contiene anche avvio e
                                     istruzioni, che la versione 1.2 copiava nella vecchia cartella condivisa

Python viene da python-build-standalone (https://github.com/astral-sh/python-build-standalone, licenza nel
pacchetto); il file scaricato si controlla con l'impronta SHA-256 scritta qui sotto.
"""
from __future__ import annotations

import argparse
import compileall
import hashlib
import os
import re
import shutil
import subprocess
import sys
import tarfile
import urllib.request
import zipfile
from pathlib import Path

RADICE = Path(__file__).resolve().parents[1]
PYTHON_VERSIONE = "3.13"
PYTHON_URL = ("https://github.com/astral-sh/python-build-standalone/releases/download/20261110/"
              "cpython-3.13.18%2B20261110-x86_64-pc-windows-msvc-install_only_stripped.tar.gz")
PYTHON_SHA256 = "2e0fed09d48989f64c9305da9ff2d37a41c0d13ab2aa6283405b2b620dfbf805"
EXTRA = ["truststore==0.10.5", "colorama==0.4.6"]   # certificati di Windows (proxy aziendali); colori della console di click
# parti di Python che MAGIC HS non usa
TOGLI = ["tcl", "include", "libs", "Scripts", "Lib/test", "Lib/idlelib", "Lib/tkinter", "Lib/turtledemo", "Lib/ensurepip",
         "Lib/venv", "Lib/pydoc_data", "Lib/site-packages/pip", "DLLs/_tkinter.pyd", "DLLs/tcl86t.dll", "DLLs/tk86t.dll"]
TOGLI_DLL = re.compile(r"^_test.*\.pyd$|^_ctypes_test\.pyd$")
DATA_ZIP = (2026, 1, 1, 0, 0, 0)          # data fissa nei file zip: stesso contenuto, stesso archivio


def versione_programma() -> str:
    m = re.search(r'^__version__\s*=\s*"([^"]+)"', (RADICE / "taric" / "__init__.py").read_text(encoding="utf-8"), re.M)
    if not m:
        sys.exit("versione non trovata in taric/__init__.py")
    return m.group(1)


def scarica_python(cache: Path) -> Path:
    cache.mkdir(parents=True, exist_ok=True)
    f = cache / f"python-{PYTHON_SHA256[:12]}.tar.gz"
    if not f.exists():
        print("scarico", PYTHON_URL)
        tmp = f.with_suffix(".tmp")
        with urllib.request.urlopen(PYTHON_URL, timeout=300) as r, open(tmp, "wb") as out:
            shutil.copyfileobj(r, out)
        tmp.rename(f)
    impronta = hashlib.sha256(f.read_bytes()).hexdigest()
    if impronta != PYTHON_SHA256:
        f.unlink()
        sys.exit(f"impronta SHA-256 di Python sbagliata: {impronta}")
    return f


def prepara_python(archivio: Path, dest: Path) -> Path:
    with tarfile.open(archivio) as t:
        t.extractall(dest, filter="data")
    py = dest / "python"
    for nome in TOGLI:
        p = py / nome
        if p.is_dir():
            shutil.rmtree(p)
        elif p.exists():
            p.unlink()
    for f in (py / "DLLs").iterdir():
        if TOGLI_DLL.match(f.name):
            f.unlink()
    for d in list(py.rglob("pip-*.dist-info")):
        shutil.rmtree(d)
    return py


def installa_librerie(py: Path) -> None:
    sito = py / "Lib" / "site-packages"
    cmd = [sys.executable, "-m", "pip", "install", "--quiet", "--disable-pip-version-check", "--no-compile", "--no-warn-conflicts",
           "--target", str(sito), "--platform", "win_amd64", "--python-version", PYTHON_VERSIONE, "--implementation", "cp",
           "--only-binary=:all:", "-r", str(RADICE / "requirements.txt"), *EXTRA]
    subprocess.run(cmd, check=True)
    for d in sito.glob("*.dist-info"):           # restano solo licenze e metadati essenziali
        for f in d.iterdir():
            if f.name == "RECORD" or f.suffix == ".pyc":
                f.unlink()
    bin_ = sito / "bin"
    if bin_.exists():
        shutil.rmtree(bin_)
    taric = sito / "taric"
    shutil.copytree(RADICE / "taric", taric, ignore=shutil.ignore_patterns("__pycache__", "*.pyc"))
    # file compilati senza controllo della data: lo zip arrotonda gli orari e Python li ricompilerebbe al primo avvio
    compileall.compile_dir(str(sito), quiet=1, workers=0, invalidation_mode=compileall.py_compile.PycInvalidationMode.UNCHECKED_HASH,
                           ddir="site-packages")


def aggiungi(z: zipfile.ZipFile, nome: str, dati: bytes) -> None:
    info = zipfile.ZipInfo(nome, DATA_ZIP)
    info.compress_type = zipfile.ZIP_DEFLATED
    info.external_attr = 0o644 << 16
    z.writestr(info, dati, compresslevel=9)


def testo_windows(f: Path) -> bytes:
    """File di testo per Windows: a capo CRLF (l'avvio .cmd deve essere solo ASCII)."""
    t = f.read_text(encoding="utf-8").replace("\r\n", "\n").replace("\n", "\r\n")
    if f.suffix == ".cmd":
        t.encode("ascii")                      # errore se ci sono lettere accentate
        return t.encode("ascii")
    return "﻿".encode() + t.encode("utf-8")


def crea_pacchetto(py: Path, dest: Path) -> None:
    with zipfile.ZipFile(dest, "w") as z:
        aggiungi(z, "Avvia MAGIC HS.cmd", testo_windows(RADICE / "windows" / "Avvia MAGIC HS.cmd"))
        aggiungi(z, "LEGGIMI.txt", testo_windows(RADICE / "windows" / "LEGGIMI.txt"))
        for f in sorted(py.rglob("*")):
            if f.is_file():
                aggiungi(z, "python/" + f.relative_to(py).as_posix(), f.read_bytes())


def crea_cartella(pacchetto: Path, versione: str, dest: Path) -> None:
    base = "MAGIC HS/"
    with zipfile.ZipFile(dest, "w") as z:
        aggiungi(z, base + "Avvia MAGIC HS.cmd", testo_windows(RADICE / "windows" / "Avvia MAGIC HS.cmd"))
        aggiungi(z, base + "LEGGIMI.txt", testo_windows(RADICE / "windows" / "LEGGIMI.txt"))
        aggiungi(z, base + "programma/versione.txt", f"{versione}\r\n".encode())
        info = zipfile.ZipInfo(base + f"programma/magic-hs-{versione}.zip", DATA_ZIP)
        info.compress_type = zipfile.ZIP_STORED                # gia' compresso
        z.writestr(info, pacchetto.read_bytes())


def main() -> int:
    ap = argparse.ArgumentParser(description="Programma per Windows di MAGIC HS")
    ap.add_argument("--uscita", default=str(RADICE / "dist"))
    ap.add_argument("--cache", default=str(Path.home() / ".cache" / "magic-hs"))
    a = ap.parse_args()
    versione = versione_programma()
    uscita = Path(a.uscita)
    lavoro = uscita / "lavoro"
    if lavoro.exists():
        shutil.rmtree(lavoro)
    lavoro.mkdir(parents=True)
    py = prepara_python(scarica_python(Path(a.cache)), lavoro)
    installa_librerie(py)
    pacchetto = uscita / f"magic-hs-windows-{versione}.zip"
    crea_pacchetto(py, pacchetto)
    cartella = uscita / f"MAGIC-HS-{versione}.zip"
    crea_cartella(pacchetto, versione, cartella)
    shutil.rmtree(lavoro)
    for f in (pacchetto, cartella):
        print(f"{f.name}: {f.stat().st_size / 1048576:.1f} MB, sha256 {hashlib.sha256(f.read_bytes()).hexdigest()}")
    return 0


if __name__ == "__main__":
    os.umask(0o022)
    sys.exit(main())
