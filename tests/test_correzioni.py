"""Errori trovati nella revisione del programma e corretti: ogni prova rifà il caso che prima andava storto."""
from __future__ import annotations

import os
import sqlite3
from pathlib import Path

import pytest

import taric.db as modulo_db
from conftest import CAPO, Sito, dati_finti
from taric.db import Database


def test_importa_salta_le_voci_troppo_grandi(sito: Sito):
    # prima i dati venivano tagliati a 200 000 caratteri: JSON rotto, poi esporta e «Apri» fallivano
    capo = sito.capo()
    grande = {"result": {"x": "a" * 250_000}}
    voci = [{"quando": "2026-01-01T00:00:00Z", "testo": "troppo grande", "codice": "", "dati": grande},
            {"quando": "2026-01-02T00:00:00Z", "testo": "giusta", "codice": "8712003000", "dati": {"q": "bicicletta"}}]
    r = capo.post("/api/io/importa", json={"formato": "magic-hs", "storico": voci, "preferiti": []})
    assert r.status_code == 200, r.text
    elenco = capo.get("/api/storico").json()["voci"]
    assert [v["testo"] for v in elenco] == ["giusta"]
    assert capo.get(f"/api/storico/{elenco[0]['id']}").status_code == 200
    assert capo.get("/api/io/esporta").status_code == 200


def test_traduzioni_non_aprono_classificazioni_oltre_il_limite(sito: Sito):
    capo = sito.capo()
    luca = sito.collega(capo)
    assert capo.put("/api/admin/impostazioni", json={"quota_predefinita": 1}).status_code == 200
    assert luca.post("/api/ia", json={"prompt": "x", "livello": "rapido", "operazione": "a"}).status_code == 200
    assert luca.post("/api/ia", json={"prompt": "x", "livello": "rapido", "operazione": "b"}).json()["codice"] == "quota_esaurita"
    # una «traduzione» con lo schema di una classificazione non passa; a limite raggiunto le traduzioni non si fanno
    r = luca.post("/api/ia", json={"prompt": "x", "livello": "standard", "operazione": "t", "tipo": "traduzione", "schema": "scelta"})
    assert r.status_code == 400
    r = luca.post("/api/ia", json={"prompt": "x", "livello": "standard", "operazione": "t", "tipo": "traduzione", "schema": "traduzione"})
    assert r.status_code == 429 and r.json()["codice"] == "quota_esaurita"
    # e una classificazione con l'operazione di una traduzione non salta il limite
    assert luca.post("/api/ia", json={"prompt": "x", "livello": "rapido", "operazione": "t"}).json()["codice"] == "quota_esaurita"
    # Gestione conta le classificazioni come il limite
    uso = next(u for u in capo.get("/api/admin/utenti").json()["utenti"] if u["email"] == "luca@azienda.it")
    assert uso["uso"]["classificazioni"] == 1


def test_amministratore_promosso_da_un_dominio_automatico_senza_limite(sito: Sito):
    capo = sito.capo()
    anna, r = sito.registra("Anna Verdi", "anna.verdi@dhl.com")
    assert r["stato"] == "attivo"
    assert anna.get("/api/io").json()["ia"]["limite"] == 0
    uid = sito.id_di(capo, "anna.verdi@dhl.com")
    assert capo.patch(f"/api/admin/utenti/{uid}", json={"ruolo": "amministratore"}).status_code == 200
    io_ = anna.get("/api/io").json()
    assert io_["ruolo"] == "amministratore" and io_["ia"]["limite"] is None and io_["ia"]["disponibile"]
    assert anna.post("/api/ia", json={"prompt": "x", "livello": "rapido", "operazione": "a"}).status_code == 200


def test_tetto_conta_anche_gli_account_eliminati(sito: Sito):
    capo = sito.capo()
    luca = sito.collega(capo)
    assert luca.post("/api/ia", json={"prompt": "x", "livello": "rapido", "operazione": "a"}).status_code == 200
    uid = sito.id_di(capo, "luca@azienda.it")
    assert capo.delete(f"/api/admin/utenti/{uid}").status_code == 200
    assert capo.get("/api/admin/ia").json()["uso"]["classificazioni"] == 1
    assert capo.put("/api/admin/impostazioni", json={"tetto_mese": 1}).status_code == 200
    assert capo.get("/api/io").json()["ia"]["tetto"] is True


def test_nota_di_un_preferito_con_mille_preferiti(sito: Sito):
    capo = sito.capo()
    with sito.app.state.db.transazione() as c:
        uid = c.execute("SELECT id FROM utenti WHERE email = ?", (CAPO,)).fetchone()[0]
        c.executemany("INSERT INTO preferiti(utente_id, codice, nota, quando) VALUES (?, ?, '', '2026-11-01T00:00:00Z')",
                      [(uid, str(1000000000 + i)) for i in range(1000)])
    r = capo.put("/api/preferiti/1000000000", json={"nota": "nuova nota"})
    assert r.status_code == 200, r.text
    assert capo.put("/api/preferiti/2000000000", json={"nota": ""}).json()["codice"] == "troppi"


def test_copia_scaricata_non_toglie_i_backup_giornalieri(sito: Sito):
    capo = sito.capo()
    backup = sito.cartella / "dati" / "backup"
    backup.mkdir(parents=True, exist_ok=True)
    for g in range(1, 8):                  # sette backup giornalieri, quanti ne tiene il sito
        (backup / f"magic-hs-2026-11-0{g}-030000.zip").write_bytes(b"PK")
    prima = sorted(p.name for p in backup.iterdir())
    r = capo.get("/api/admin/backup")
    assert r.status_code == 200 and r.content[:2] == b"PK"
    assert sorted(p.name for p in backup.iterdir()) == prima
    assert not list((sito.cartella / "dati" / "backup-scaricati").glob("*.zip"))      # il file inviato non resta


def test_impronta_dei_dati_cambia_con_una_nuova_installazione(sito: Sito):
    capo = sito.capo()
    f = sito.cartella / "dati" / "taric" / "versioni" / "2026-11-01" / "versione.json"
    prima = sito.app.state.dati.impronta("2026-11-01")
    assert prima and f'data-v="{prima}"' in capo.get("/").text and f"nomenclatura.js?v={prima}" in capo.get("/").text
    st = f.stat()
    os.utime(f, ns=(st.st_atime_ns, st.st_mtime_ns + 5_000_000_000))
    dopo = sito.app.state.dati.impronta("2026-11-01")
    assert dopo != prima and f'data-v="{dopo}"' in capo.get("/").text


def test_installare_un_mese_passato_lo_tiene(ambiente, tmp_path: Path):
    tmp, mp = ambiente
    sito = Sito(tmp, mp, versioni=("2026-09-01", "2026-10-01", "2026-11-01"))
    nuova = dati_finti(tmp_path / "lavoro", "2025-01-01")
    info = sito.app.state.dati._installa(nuova, "2025-01", sito.attiva())
    assert info and (sito.cartella / "dati" / "taric" / "versioni" / "2025-01-01" / "versione.json").is_file()
    assert sito.attiva() == "2026-11-01"


def test_modulo_con_caratteri_non_ascii(sito: Sito):
    c = sito.client()
    t, firma = sito.modulo(c).split(".", 1)
    r = c.post("/api/registrazione", json={"nome": "Luca", "email": "luca@azienda.it", "password": "Porto-Container-42",
                                           "modulo": f"{t}.{firma[:-1]}è"})
    assert 400 <= r.status_code < 500 and r.json().get("codice"), r.text


def test_migrazione_interrotta_non_lascia_lo_schema_a_meta(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    percorso = tmp_path / "taric.db"
    Database(percorso)
    monkeypatch.setattr(modulo_db, "SCHEMA", modulo_db.SCHEMA + ["CREATE TABLE prova_a(x);\nCREATE TABLE prova_b(y;"])
    with pytest.raises(sqlite3.Error):
        Database(percorso)
    c = sqlite3.connect(percorso)
    assert c.execute("PRAGMA user_version").fetchone()[0] == len(modulo_db.SCHEMA) - 1
    assert c.execute("SELECT COUNT(*) FROM sqlite_master WHERE name = 'prova_a'").fetchone()[0] == 0
    c.close()


def test_nome_fatto_di_spazi(sito: Sito):
    capo = sito.capo()
    assert capo.put("/api/io", json={"nome": "   ", "azienda": ""}).json()["codice"] == "nome"
    assert capo.put("/api/io", json={"nome": "  Mario   Rossi ", "azienda": ""}).status_code == 200
    assert capo.get("/api/io").json()["nome"] == "Mario Rossi"
    _, r = sito.registra("  ", "luca@azienda.it")
    assert r["stato_http"] == 422 and r["codice"] == "nome"


def test_password_attuale_con_tentativi_limitati(sito: Sito):
    capo = sito.capo()
    for _ in range(5):
        assert capo.post("/api/io/password", json={"attuale": "sbagliata", "nuova": "Nuova-Password-99"}).status_code == 403
    r = capo.post("/api/io/password", json={"attuale": "Porto-Container-42", "nuova": "Nuova-Password-99"})
    assert r.status_code == 429 and r.json()["codice"] == "troppi_tentativi"


def test_caricamento_con_mese_sbagliato_o_aggiornamento_in_corso(sito: Sito):
    capo = sito.capo()
    file = {"file": ("estrazione.zip", b"PK\x05\x06" + b"\0" * 18, "application/zip")}
    assert capo.post("/api/admin/dati/carica", files=file, data={"mese": "2026-13"}).json()["codice"] == "mese"
    assert capo.post("/api/admin/dati/aggiorna", json={"mese": "2026-00"}).json()["codice"] == "mese"
    dati = sito.app.state.dati
    assert dati._lock.acquire(blocking=False)                # un aggiornamento in corso
    try:
        assert capo.post("/api/admin/dati/carica", files=file, data={"mese": "2026-11"}).json()["codice"] == "in_corso"
    finally:
        dati._lock.release()
    assert not list(dati.lavoro.glob("caricato-*.zip"))      # l'archivio non resta sul disco


def test_importa_con_orari_strani(sito: Sito):
    capo = sito.capo()
    r = capo.post("/api/io/importa", json={"formato": "magic-hs", "storico": [{"quando": "ieri sera", "testo": "x", "dati": {}}],
                                          "preferiti": [{"codice": "8712003000", "quando": {"giorno": 1}}]})
    assert r.status_code == 200 and r.json()["storico"] == 1 and r.json()["preferiti"] == 1
    assert capo.get("/api/storico").json()["voci"][0]["quando"].endswith("Z")
    assert capo.get("/api/preferiti").json()["voci"][0]["quando"].endswith("Z")


def test_bolla_troppo_grande(sito: Sito):
    capo = sito.capo()
    r = capo.post("/api/bolle", json={"tipo": "import", "dati": {"articoli": [{}] * 100}})
    assert r.status_code == 413 and "99 articoli" in r.json()["errore"]
    r = capo.post("/api/bolle", json={"tipo": "import", "dati": {"articoli": [{"note": "x" * 310_000}]}})
    assert r.status_code == 413 and "99 articoli" not in r.json()["errore"]
    assert capo.post("/api/bolle", json={"tipo": "import", "dati": {"articoli": "non un elenco"}}).status_code == 200


def test_segreto_dei_moduli_leggibile_solo_dal_servizio(sito: Sito):
    f = sito.cartella / "dati" / "segreto-moduli.key"
    assert f.is_file() and (f.stat().st_mode & 0o777) == 0o600 and len(f.read_text().strip()) == 64


def test_risposta_troncata_dell_ia(sito_claude: Sito):
    capo = sito_claude.capo()
    from conftest import FintoClaude
    sito_claude.claude.risposte = [FintoClaude.testo('{"merce": "scarpe", "voci": [{"voce": "6403", "mot', stop="max_tokens")]
    r = capo.post("/api/ia", json={"prompt": "x", "livello": "rapido", "operazione": "a"}).json()
    assert r["codice"] == "risposta_troncata" and "troppo lunga" in r["errore"]


def test_preferiti_dazio_nel_primo_testo_del_capitolo(ambiente):
    """In m/CC.js il testo 0 e' un dazio vero (il primo del capitolo): prima risultava vuoto e, con i testi in un altro
    ordine il mese dopo, un dazio rimasto uguale sembrava cambiato."""
    import json
    tmp, mp = ambiente
    sito = Sito(tmp, mp)
    base = sito.cartella / "dati" / "taric" / "versioni"
    righe = "\n".join(["6400000000n10CALZATURE", "6403999610L52da uomo"])
    misure = {"2026-10-01": {"s": ["0.000 %", "8.000 %"], "m": {"6403999610": [[103, "1011", 1, 20050101, 0, 0, 0, 0, 0, 0, 0],
                                                                            [142, "CH", 0, 20050101, 0, 0, 0, 0, 0, 0, 0]]}, "x": {}, "l": []},
              "2026-11-01": {"s": ["8.000 %", "0.000 %"], "m": {"6403999610": [[103, "1011", 0, 20050101, 0, 0, 0, 0, 0, 0, 0],
                                                                            [142, "CH", 1, 20050101, 0, 0, 0, 0, 0, 0, 0]]}, "x": {}, "l": []}}
    for v, m in misure.items():
        d = dati_finti(base, v)
        (d / "nomenclatura.js").write_text("window.TARIC_DATA=" + json.dumps({"meta": {}, "righe": righe}) + ";\n")
        (d / "m" / "64.js").write_text('window.TARIC_M=window.TARIC_M||{};window.TARIC_M["64"]=' + json.dumps(m) + ";\n")
    capo = sito.capo()
    capo.put("/api/preferiti/6403999610", json={"nota": ""})
    assert capo.get("/api/preferiti/cambi").json()["cambi"] == {}            # stessi dazi, solo in un altro ordine
