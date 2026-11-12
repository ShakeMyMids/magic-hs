"""Backup e ripristino del database."""
from __future__ import annotations

import io
import os
import sqlite3
import time
import zipfile
from pathlib import Path

import pytest

from taric.__main__ import main
from taric.backup import Backup, ErroreBackup

from conftest import Sito


def utenti(db: Path) -> list[str]:
    c = sqlite3.connect(db)
    try:
        return sorted(r[0] for r in c.execute("SELECT email FROM utenti"))
    finally:
        c.close()


def test_backup_dal_pannello_e_download(sito: Sito):
    a = sito.admin()
    sito.utente(a, "mario@esempio.it")
    d = a.get("/api/admin/dati").json()
    assert d["backup"] == [] and d["backup_copie"] == 14
    r = a.post("/api/admin/backup")
    assert r.status_code == 200, r.text
    nome = r.json()["nome"]
    assert a.get("/api/admin/dati").json()["backup"][0]["nome"] == nome
    r = a.get(f"/api/admin/backup/{nome}")
    assert r.status_code == 200 and r.headers["content-type"] == "application/zip"
    assert "attachment" in r.headers["content-disposition"]
    with zipfile.ZipFile(io.BytesIO(r.content)) as z:
        assert z.namelist() == ["taric.db"]
        (sito.tmp / "copia.db").write_bytes(z.read("taric.db"))
    assert utenti(sito.tmp / "copia.db") == ["admin@esempio.it", "mario@esempio.it"]
    # niente percorsi strani, niente accesso per chi non e' amministratore
    assert a.get("/api/admin/backup/..%2Ftaric.db").status_code == 404
    assert a.get("/api/admin/backup/taric.db").status_code == 404
    u = sito.utente(a, "luigi@esempio.it")
    assert u.get(f"/api/admin/backup/{nome}").status_code == 403
    assert u.post("/api/admin/backup").status_code == 403
    assert sito.client().get(f"/api/admin/backup/{nome}").status_code == 401
    tipi = [e["tipo"] for e in a.get("/api/admin/eventi").json()["eventi"]]
    assert "backup_creato" in tipi and "backup_scaricato" in tipi


def test_ripristino_rimette_il_database_e_salva_quello_di_prima(sito: Sito):
    a = sito.admin()
    sito.utente(a, "mario@esempio.it")
    b = Backup(sito.cfg.dati)
    salvato = b.crea()
    sito.utente(a, "dopo@esempio.it")
    db = sito.cfg.dati / "taric.db"
    assert "dopo@esempio.it" in utenti(db)
    esito = b.ripristina(salvato)
    assert esito.startswith("2 utenti") and "precedente" in esito
    assert utenti(db) == ["admin@esempio.it", "mario@esempio.it"]
    # il database di prima del ripristino e' nel backup piu' recente
    ultimo = b.file(b.elenco()[0]["nome"])
    with zipfile.ZipFile(ultimo) as z:
        (sito.tmp / "prima.db").write_bytes(z.read("taric.db"))
    assert "dopo@esempio.it" in utenti(sito.tmp / "prima.db")
    # dopo il ripristino il sito funziona con il database rimesso
    r = sito.client().post("/api/accedi", json={"email": "admin@esempio.it", "password": "Password-Admin-1"})
    assert r.status_code == 200


def test_ripristino_rifiuta_file_sbagliati(sito: Sito, tmp_path: Path):
    sito.admin()
    b = Backup(sito.cfg.dati)
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
    assert not list(sito.cfg.dati.glob(".ripristino-*"))


def test_backup_automatico_una_volta_al_giorno_e_pulizia(sito: Sito):
    sito.admin()
    b = Backup(sito.cfg.dati, copie=3)
    assert b.da_fare()
    for _ in range(5):
        f = b.crea()
    assert len(b.elenco()) == 3 and b.elenco()[0]["nome"] == f.name
    assert not b.da_fare()
    ieri = time.time() - 24 * 3600
    os.utime(f, (ieri, ieri))
    assert b.da_fare()
    assert not Backup(sito.cfg.dati, copie=0).da_fare()
    assert oct(f.stat().st_mode & 0o777) == "0o600"


def test_riga_di_comando(sito: Sito, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]):
    sito.admin()
    monkeypatch.setenv("TARIC_DATI", str(sito.cfg.dati))
    assert main(["backup"]) == 0
    salvato = capsys.readouterr().out.strip().split(": ", 1)[1]
    assert Path(salvato).is_file()
    assert main(["ripristina", salvato]) == 0
    assert "Database ripristinato (1 utenti" in capsys.readouterr().out
    assert main(["ripristina", str(sito.tmp / "manca.zip")]) == 1
