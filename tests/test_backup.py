"""Backup e ripristino del database del PC (storico, preferiti, preferenze)."""
from __future__ import annotations

import os
import sqlite3
import time
import zipfile
from pathlib import Path

import pytest

from taric.__main__ import main
from taric.backup import Backup, ErroreBackup
from taric.programma import Blocco

from conftest import PC


def storico(db: Path) -> list[str]:
    c = sqlite3.connect(db)
    try:
        return sorted(r[0] for r in c.execute("SELECT testo FROM storico"))
    finally:
        c.close()


def classifica(c, testo: str) -> None:
    assert c.post("/api/storico", json={"testo": testo, "codice": "8467211000", "dati": {}}).status_code == 200


def test_ripristino_rimette_il_database_e_salva_quello_di_prima(editore: PC, tmp_path: Path):
    c = editore.entra()
    classifica(c, "trapano")
    b = Backup(editore.cfg.dati)
    salvato = b.crea()
    classifica(c, "dopo il backup")
    db = editore.cfg.dati / "taric.db"
    assert "dopo il backup" in storico(db)
    esito = b.ripristina(salvato)
    assert esito.startswith("1 classificazioni nello storico") and "precedente" in esito
    assert storico(db) == ["trapano"]
    # il database di prima del ripristino e' nel backup piu' recente
    ultimo = b.file(b.elenco()[0]["nome"])
    with zipfile.ZipFile(ultimo) as z:
        (tmp_path / "prima.db").write_bytes(z.read("taric.db"))
    assert "dopo il backup" in storico(tmp_path / "prima.db")
    # dopo il ripristino il programma funziona con il database rimesso
    assert c.get("/api/storico").json()["voci"][0]["testo"] == "trapano"


def test_ripristino_rifiuta_file_sbagliati(editore: PC, tmp_path: Path):
    b = Backup(editore.cfg.dati)
    altro = tmp_path / "altro.zip"
    with zipfile.ZipFile(altro, "w") as z:
        z.writestr("taric.db", b"x")
        z.writestr("../fuori.txt", b"x")
    with pytest.raises(ErroreBackup, match="solo il file taric.db"):
        b.ripristina(altro)
    finto = tmp_path / "finto.zip"
    with zipfile.ZipFile(finto, "w") as z:
        z.writestr("taric.db", b"questo non e' un database" * 100)
    with pytest.raises(ErroreBackup, match="non e' un database"):
        b.ripristina(finto)
    estraneo = tmp_path / "estraneo.db"
    c = sqlite3.connect(estraneo)
    c.execute("CREATE TABLE x (y)")
    c.close()
    with pytest.raises(ErroreBackup, match="non e' un database di MAGIC HS"):
        b.ripristina(estraneo)
    with pytest.raises(ErroreBackup, match="non trovato"):
        b.ripristina(tmp_path / "manca.zip")
    assert b.elenco() == []                     # nessun tentativo fallito tocca il database o i backup
    assert not list(editore.cfg.dati.glob(".ripristino-*"))


def test_backup_automatico_una_volta_al_giorno_e_pulizia(editore: PC):
    b = Backup(editore.cfg.dati, copie=3)
    assert b.da_fare()
    for _ in range(5):
        f = b.crea()
    assert len(b.elenco()) == 3 and b.elenco()[0]["nome"] == f.name
    assert not b.da_fare()
    ieri = time.time() - 24 * 3600
    os.utime(f, (ieri, ieri))
    assert b.da_fare()
    assert not Backup(editore.cfg.dati, copie=0).da_fare()
    assert oct(f.stat().st_mode & 0o777) == "0o600"


def test_riga_di_comando(editore: PC, capsys: pytest.CaptureFixture[str]):
    c = editore.entra()
    classifica(c, "trapano")
    cartella = editore.cartella                  # come %LOCALAPPDATA%\MAGIC HS: dentro c'e' dati\taric.db
    assert main(["--cartella", str(cartella), "backup"]) == 0
    salvato = capsys.readouterr().out.strip().split(": ", 1)[1]
    assert Path(salvato).is_file()
    # con MAGIC HS aperto (blocco dell'istanza preso) il ripristino si rifiuta
    aperto = Blocco(cartella / "istanza.lock")
    assert aperto.prendi()
    try:
        assert main(["--cartella", str(cartella), "ripristina", salvato]) == 1
        assert "MAGIC HS è aperto" in capsys.readouterr().out
    finally:
        aperto.lascia()
    assert main(["--cartella", str(cartella), "ripristina", salvato]) == 0
    assert "Database ripristinato (1 classificazioni" in capsys.readouterr().out
    assert main(["--cartella", str(cartella), "ripristina", str(cartella / "manca.zip")]) == 1
