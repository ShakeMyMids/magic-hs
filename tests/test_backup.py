"""Backup e ripristino del database del sito (account, storico, preferiti, preferenze)."""
from __future__ import annotations

import os
import sqlite3
import time
import zipfile
from pathlib import Path

import pytest

from taric.__main__ import main
from taric.backup import Backup, ErroreBackup

from conftest import Sito


def storico(db: Path) -> list[str]:
    c = sqlite3.connect(db)
    try:
        return sorted(r[0] for r in c.execute("SELECT testo FROM storico"))
    finally:
        c.close()


def classifica(c, testo: str) -> None:
    assert c.post("/api/storico", json={"testo": testo, "codice": "8467211000", "dati": {}}).status_code == 200


def test_ripristino_rimette_il_database_e_salva_quello_di_prima(sito: Sito, tmp_path: Path):
    c = sito.capo()
    classifica(c, "trapano")
    b = Backup(sito.cfg.dati)
    salvato = b.crea()
    classifica(c, "dopo il backup")
    db = sito.cfg.dati / "taric.db"
    assert "dopo il backup" in storico(db)
    esito = b.ripristina(salvato)
    assert esito.startswith("1 classificazioni nello storico") and "precedente" in esito
    assert storico(db) == ["trapano"]
    # il database di prima del ripristino e' nel backup piu' recente
    ultimo = b.file(b.elenco()[0]["nome"])
    with zipfile.ZipFile(ultimo) as z:
        (tmp_path / "prima.db").write_bytes(z.read("taric.db"))
    assert "dopo il backup" in storico(tmp_path / "prima.db")
    # dopo il ripristino il sito funziona con il database rimesso
    assert c.get("/api/storico").json()["voci"][0]["testo"] == "trapano"


def test_ripristino_rifiuta_file_sbagliati(sito: Sito, tmp_path: Path):
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


def test_riga_di_comando(sito: Sito, capsys: pytest.CaptureFixture[str]):
    c = sito.capo()
    classifica(c, "trapano")
    dati = sito.cfg.dati                    # come TARIC_DATI su Render: dentro c'e' taric.db
    assert main(["--dati", str(dati), "backup"]) == 0
    salvato = capsys.readouterr().out.strip().split(": ", 1)[1]
    assert Path(salvato).is_file() and Path(salvato).parent == dati / "backup"
    classifica(c, "dopo il backup")
    assert main(["--dati", str(dati), "ripristina", salvato]) == 0
    assert "Database ripristinato (1 classificazioni" in capsys.readouterr().out
    assert [v["testo"] for v in c.get("/api/storico").json()["voci"]] == ["trapano"]        # il sito usa subito quello rimesso
    assert main(["--dati", str(dati), "ripristina", str(dati / "manca.zip")]) == 1
    assert "file non trovato" in capsys.readouterr().out


def test_ripristino_a_sito_acceso_al_prossimo_avvio(sito: Sito, capsys: pytest.CaptureFixture[str], monkeypatch: pytest.MonkeyPatch):
    """Dalla Shell di Render il sito e' acceso: il backup si controlla subito e si rimette al riavvio."""
    import taric.__main__ as cli
    c = sito.capo()
    classifica(c, "trapano")
    dati = sito.cfg.dati
    salvato = Backup(dati).crea()
    classifica(c, "dopo il backup")
    monkeypatch.setattr(cli, "sito_acceso", lambda d: True)
    assert main(["--dati", str(dati), "ripristina", str(salvato)]) == 0
    assert "al prossimo avvio" in capsys.readouterr().out
    assert (dati / "ripristino-in-attesa.db").is_file()
    assert "dopo il backup" in storico(dati / "taric.db")              # niente cambia finche' il sito e' acceso
    sito.riavvia()
    c = sito.accedi("capo@azienda.it")
    assert [v["testo"] for v in c.get("/api/storico").json()["voci"]] == ["trapano"]
    assert not (dati / "ripristino-in-attesa.db").exists()
    # un backup sbagliato non arriva nemmeno a essere messo da parte
    (dati / "rotto.db").write_bytes(b"non e' un database" * 100)
    assert main(["--dati", str(dati), "ripristina", str(dati / "rotto.db")]) == 1
    assert not (dati / "ripristino-in-attesa.db").exists()


def test_sito_acceso_dal_pid(tmp_path: Path):
    import subprocess
    import sys
    from taric.__main__ import sito_acceso
    assert not sito_acceso(tmp_path)
    p = subprocess.Popen([sys.executable, "-c", "import time; time.sleep(30)", "taric"])
    try:
        (tmp_path / "server.pid").write_text(str(p.pid))
        assert sito_acceso(tmp_path)
    finally:
        p.kill()
        p.wait()
    assert not sito_acceso(tmp_path)                                     # processo finito
    (tmp_path / "server.pid").write_text("non un numero")
    assert not sito_acceso(tmp_path)
