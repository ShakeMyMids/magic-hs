"""Programma per Windows sul PC: ingresso con la chiave dell'avvio, cartella condivisa (dati, programma,
impostazioni dell'IA) e avvio con chiusura dopo l'inattività."""
from __future__ import annotations

import io
import json
import subprocess
import sys
import time
import zipfile
from pathlib import Path

import httpx
import pytest
from fastapi.testclient import TestClient

from taric.app import crea_app
from taric.condivisa import Condivisa, ErroreCondivisa, editori, estrai_dati, versione_pacchetto
from taric.config import carica

from conftest import FintoClaude

RADICE = Path(__file__).resolve().parents[1]
CHIAVE = "chiave-di-ingresso-di-prova"


def dati_finti(cartella: Path, versione: str, testo: str = "") -> Path:
    d = cartella / versione
    (d / "m").mkdir(parents=True, exist_ok=True)
    (d / "nomenclatura.js").write_text(f'window.TARIC_DATA={{"meta":{{}}}};/*{testo or versione}*/\n')
    (d / "m" / "84.js").write_text("window.TARIC_M=window.TARIC_M||{};\n")
    (d / "versione.json").write_text(json.dumps({"data": versione}))
    (d / "riepilogo.txt").write_text("riepilogo\n")
    return d


def imposta_editori(condivisa: Path, *nomi: str) -> None:
    c = Condivisa(condivisa)
    c.salva_impostazioni({**c.impostazioni(), "editori": list(nomi)})


class PC:
    """Un PC con MAGIC HS. Il nome e' anche il nome utente di Windows. editore=True lo mette nell'elenco di chi
    pubblica; tutti possono scrivere nella cartella (OneDrive chiede il permesso di modifica per il collegamento),
    tranne con sola_lettura=True (raccolta di SharePoint sincronizzata in sola lettura)."""

    def __init__(self, tmp: Path, condivisa: Path, nome: str, mp: pytest.MonkeyPatch, editore: bool = True,
                 versioni: tuple[str, ...] = (), sola_lettura: bool = False):
        self.cartella = tmp / nome
        if editore:
            imposta_editori(condivisa, *dict.fromkeys(editori(Condivisa(condivisa).impostazioni()) + [nome]))
        for v in versioni:                                    # dati gia' installati su questo PC prima dell'avvio
            dati_finti(self.cartella / "dati" / "taric" / "versioni", v)
            (self.cartella / "dati" / "taric" / "attiva.txt").write_text(v)
        self.cfg = carica({"TARIC_DATI": str(self.cartella / "dati"), "TARIC_LOCALE": "1", "TARIC_CONDIVISA": str(condivisa),
                           "TARIC_HOST": "127.0.0.1", "TARIC_PORTA": "8765"})
        self.claude = FintoClaude()
        with mp.context() as m:
            m.setenv("USERNAME", nome)
            if sola_lettura:
                m.setattr(Condivisa, "scrivibile", lambda self: False)
            self.app = crea_app(self.cfg, httpx.Client(transport=httpx.MockTransport(self.claude)), pianificatore=False,
                                chiave_ingresso=CHIAVE, istanza="prova")
        self.fermato = False

        def ferma() -> None:
            self.fermato = True
        self.app.state.ferma = ferma

    def client(self, base: str = "http://127.0.0.1:8765") -> TestClient:
        return TestClient(self.app, base_url=base, headers={"X-Taric": "1"})

    def entra(self) -> TestClient:
        c = self.client()
        r = c.get(f"/entra?k={CHIAVE}", follow_redirects=False)
        assert r.status_code == 303 and "magic_hs_locale" in r.cookies
        return c

    def attiva(self) -> str | None:
        return self.app.state.dati.attiva()


@pytest.fixture
def ambiente(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> tuple[Path, Path, pytest.MonkeyPatch]:
    monkeypatch.setenv("TARIC_CONFIG", str(tmp_path / "nessuno.env"))
    for k in ("ANTHROPIC_API_KEY", "GEMINI_API_KEY", "GOOGLE_API_KEY", "TARIC_IA_FORNITORE", "TARIC_IA_URL", "TARIC_IA_CHIAVE",
              "TARIC_IA_MODELLO", "TARIC_IA_MODELLO_RAPIDO", "TARIC_SMTP_HOST", "TARIC_DATI"):
        monkeypatch.delenv(k, raising=False)
    condivisa = tmp_path / "OneDrive - Azienda" / "MAGIC HS"
    condivisa.mkdir(parents=True)
    return tmp_path, condivisa, monkeypatch


# ------------------------------------------------------------------ ingresso e protezioni
def test_ingresso_solo_con_la_chiave_dell_avvio(ambiente):
    tmp, cond, mp = ambiente
    pc = PC(tmp, cond, "editore", mp, versioni=("2026-11-01",))
    c = pc.client()
    r = c.get("/")
    assert r.status_code == 200 and "Avvia MAGIC HS" in r.text            # senza sessione: come aprire il programma
    assert c.get("/api/io").status_code == 401
    r = c.get("/entra?k=sbagliata", follow_redirects=False)
    assert r.status_code == 200 and "magic_hs_locale" not in r.cookies
    c = pc.entra()
    io_ = c.get("/api/io").json()
    assert io_["locale"]["editore"] and io_["locale"]["utente"] == "editore" and io_["ruolo"] == "amministratore"
    assert io_["email"] == "utente@magic-hs.locale"
    assert "/data/2026-11-01/" in c.get("/").text
    # aprire di nuovo il programma non crea un'altra sessione
    c.get(f"/entra?k={CHIAVE}", follow_redirects=False)
    with pc.app.state.db.connessione() as conn:
        assert conn.execute("SELECT COUNT(*) FROM sessioni").fetchone()[0] == 1


def test_solo_dal_pc_con_il_suo_indirizzo(ambiente):
    tmp, cond, mp = ambiente
    pc = PC(tmp, cond, "editore", mp)
    assert pc.client("http://localhost:8765").get("/api/locale/ping").json()["app"] == "magic-hs"
    for base in ("http://sito-malevolo.example:8765", "http://127.0.0.1:9999"):
        assert pc.client(base).get("/api/locale/ping").status_code == 403


def test_funzioni_del_sito_spente(ambiente):
    tmp, cond, mp = ambiente
    c = PC(tmp, cond, "editore", mp).entra()
    for pagina in ("/accedi", "/registrati", "/configura", "/condizioni"):
        r = c.get(pagina, follow_redirects=False)
        assert r.status_code == 303 and r.headers["location"] == "/"
    for metodo, url in (("POST", "/api/accedi"), ("POST", "/api/registrazione"), ("GET", "/api/admin/utenti"),
                        ("POST", "/api/pagamento/inizia"), ("POST", "/api/io/password"), ("GET", "/api/admin/backup/x.zip")):
        r = c.request(metodo, url, json={})
        assert r.status_code == 404 and r.json()["codice"] == "non_disponibile", url


def test_chiusura_dal_browser_e_da_una_nuova_versione(ambiente):
    tmp, cond, mp = ambiente
    pc = PC(tmp, cond, "editore", mp)
    c = pc.client()
    assert c.post("/api/locale/ferma", json={"chiave": "sbagliata"}).status_code == 403
    assert c.post("/api/locale/chiudi").status_code == 401
    assert not pc.fermato
    assert c.post("/api/locale/ferma", json={"chiave": CHIAVE}).status_code == 200 and pc.fermato
    pc.fermato = False
    assert pc.entra().post("/api/locale/chiudi").status_code == 200 and pc.fermato


def test_ogni_richiesta_tiene_vivo_il_programma(ambiente):
    tmp, cond, mp = ambiente
    pc = PC(tmp, cond, "editore", mp)
    pc.app.state.ultimo_contatto = 0
    pc.client().get("/api/locale/ping")
    assert time.monotonic() - pc.app.state.ultimo_contatto < 5


# ------------------------------------------------------------------ dati TARIC dalla cartella condivisa
def test_l_editore_pubblica_e_i_colleghi_ricevono(ambiente):
    tmp, cond, mp = ambiente
    editore = PC(tmp, cond, "editore", mp, versioni=("2026-11-01",))
    assert (cond / "dati" / "attiva.txt").read_text().strip() == "2026-11-01"
    assert (cond / "dati" / "2026-11-01.zip").is_file()
    collega = PC(tmp, cond, "collega", mp, editore=False)
    assert collega.attiva() == "2026-11-01" and not collega.cfg.scarica_dati and editore.cfg.scarica_dati
    assert (collega.cfg.dati / "taric" / "versioni" / "2026-11-01" / "m" / "84.js").is_file()
    ce, cc = editore.entra(), collega.entra()
    assert cc.get("/api/io").json()["ruolo"] == "utente"
    assert cc.get("/api/admin/locale").status_code == 403

    # nuovo mese installato sul PC dell'editore: va nella cartella e arriva al collega
    dati_finti(editore.cfg.dati / "taric" / "versioni", "2026-12-01")
    editore.app.state.dati.imposta_attiva("2026-12-01")
    assert ce.post("/api/locale/sincronizza").json()["dati"] == "2026-12-01"
    assert (cond / "dati" / "attiva.txt").read_text().strip() == "2026-12-01"
    assert cc.post("/api/locale/sincronizza").json()["dati"] == "2026-12-01"

    # l'editore torna alla versione precedente: anche i colleghi tornano indietro
    assert ce.post("/api/admin/dati/attiva", json={"versione": "2026-11-01"}).status_code == 200
    assert (cond / "dati" / "attiva.txt").read_text().strip() == "2026-11-01"
    assert cc.post("/api/locale/sincronizza").json()["dati"] == "2026-11-01"
    assert ce.get("/api/admin/locale").json()["dati"] == {"in_uso": "2026-11-01", "pubblicati": "2026-11-01"}


def test_aggiornamento_installato_viene_pubblicato(ambiente):
    tmp, cond, mp = ambiente
    editore = PC(tmp, cond, "editore", mp, versioni=("2026-11-01",))
    dati = editore.app.state.dati
    dati_finti(dati.versioni, "2026-12-01")
    dati.imposta_attiva("2026-12-01")
    assert dati.dopo_installazione is not None
    dati.dopo_installazione("2026-12-01")                    # come alla fine di un aggiornamento riuscito
    assert (cond / "dati" / "attiva.txt").read_text().strip() == "2026-12-01"
    collega = PC(tmp, cond, "collega", mp, editore=False)
    assert collega.app.state.dati.dopo_installazione is None and collega.attiva() == "2026-12-01"


def test_dati_non_ancora_arrivati_o_danneggiati(ambiente):
    tmp, cond, mp = ambiente
    PC(tmp, cond, "editore", mp, versioni=("2026-11-01",))
    collega = PC(tmp, cond, "collega", mp, editore=False)
    cc = collega.entra()
    # OneDrive ha consegnato attiva.txt ma non ancora l'archivio: resta la versione di prima
    (cond / "dati" / "attiva.txt").write_text("2026-12-01\n")
    assert cc.post("/api/locale/sincronizza").json()["dati"] == "2026-11-01"
    # archivio a meta'
    (cond / "dati" / "2026-12-01.zip").write_bytes(b"PK\x03\x04 non finito")
    assert cc.post("/api/locale/sincronizza").json()["dati"] == "2026-11-01"
    # archivio con dati di un altro mese
    (cond / "dati" / "2026-12-01.zip").write_bytes((cond / "dati" / "2026-11-01.zip").read_bytes())
    assert cc.post("/api/locale/sincronizza").json()["dati"] == "2026-11-01"
    assert not (collega.cfg.dati / "taric" / "versioni" / "2026-12-01").exists()


def test_collega_senza_dati_vede_la_pagina_d_attesa(ambiente):
    tmp, cond, mp = ambiente
    collega = PC(tmp, cond, "collega", mp, editore=False)
    c = collega.entra()
    assert "Preparazione dei dati" in c.get("/").text
    stato = c.get("/api/stato").json()
    assert stato["locale"] and not stato["editore"] and not stato["dati_pronti"]
    assert collega.app.state.dati.da_fare() is None          # i colleghi non scaricano dalla fonte


def test_estrazione_sicura_dei_dati(tmp_path: Path):
    archivio = tmp_path / "dati.zip"
    with zipfile.ZipFile(archivio, "w") as z:
        z.writestr("nomenclatura.js", "ok")
        z.writestr("m/84.js", "ok")
        z.writestr("../fuori.js", "no")
        z.writestr("m/../../fuori2.js", "no")
        z.writestr("programma.exe", "no")
        z.writestr("m/1.js", "no")
    estrai_dati(archivio, tmp_path / "dest")
    trovati = sorted(p.relative_to(tmp_path / "dest").as_posix() for p in (tmp_path / "dest").rglob("*") if p.is_file())
    assert trovati == ["m/84.js", "nomenclatura.js"]
    assert not (tmp_path / "fuori.js").exists()


# ------------------------------------------------------------------ intelligenza artificiale per tutti
def test_impostazioni_ia_per_tutti(ambiente):
    tmp, cond, mp = ambiente
    editore = PC(tmp, cond, "editore", mp, versioni=("2026-11-01",))
    ce = editore.entra()
    assert ce.get("/api/io").json()["ia"]["configurata"] is False
    r = ce.put("/api/admin/locale/ia", json={"fornitore": "openai", "url": "", "modello": "gpt", "chiave": "k"})
    assert r.status_code == 422 and r.json()["codice"] == "url"
    r = ce.put("/api/admin/locale/ia", json={"fornitore": "gemini", "chiave": ""})
    assert r.status_code == 422 and r.json()["codice"] == "chiave"
    r = ce.put("/api/admin/locale/ia", json={"fornitore": "openai", "url": "https://risorsa.openai.azure.com/openai/v1/",
                                           "modello": "gpt-classifica", "chiave": "chiave-segreta-1234", "quota": 5})
    assert r.status_code == 200 and r.json()["attiva"], r.text
    imp = json.loads((cond / "impostazioni.json").read_text())
    assert imp["ia"]["url"] == "https://risorsa.openai.azure.com/openai/v1" and imp["quota"] == 5
    loc = ce.get("/api/admin/locale").json()
    assert loc["ia"]["chiave"] == "…1234" and "chiave-segreta" not in json.dumps(loc)
    # salvare senza chiave tiene quella di prima
    assert ce.put("/api/admin/locale/ia", json={"fornitore": "openai", "url": "https://risorsa.openai.azure.com/openai/v1",
                                              "modello": "gpt-classifica", "quota": 5}).status_code == 200
    assert json.loads((cond / "impostazioni.json").read_text())["ia"]["chiave"] == "chiave-segreta-1234"

    collega = PC(tmp, cond, "collega", mp, editore=False)
    io_ = collega.entra().get("/api/io").json()["ia"]
    assert io_["configurata"] and io_["limite"] == 5
    assert collega.cfg.ia_fornitore == "openai" and collega.cfg.modello == collega.cfg.modello_rapido == "gpt-classifica"
    assert collega.entra().put("/api/admin/locale/ia", json={"fornitore": ""}).status_code == 403

    # senza limite mensile, poi IA spenta per tutti (e la chiave sparisce dalla cartella)
    assert ce.put("/api/admin/locale/ia", json={"fornitore": "openai", "url": "https://risorsa.openai.azure.com/openai/v1",
                                              "modello": "gpt-classifica", "quota": None}).status_code == 200
    cc = collega.entra()
    assert cc.post("/api/locale/sincronizza").status_code == 200 and cc.get("/api/io").json()["ia"]["limite"] is None
    assert ce.put("/api/admin/locale/ia", json={"fornitore": "", "quota": 50}).status_code == 200
    assert json.loads((cond / "impostazioni.json").read_text())["ia"]["chiave"] == ""
    cc.post("/api/locale/sincronizza")
    assert cc.get("/api/io").json()["ia"]["configurata"] is False


def test_prova_del_servizio_e_azure(ambiente):
    tmp, cond, mp = ambiente
    editore = PC(tmp, cond, "editore", mp, versioni=("2026-11-01",))
    ce = editore.entra()
    assert ce.post("/api/admin/locale/ia/prova").json()["codice"] == "not_configured"
    ce.put("/api/admin/locale/ia", json={"fornitore": "openai", "url": "https://risorsa.openai.azure.com/openai/v1",
                                         "modello": "gpt-classifica", "chiave": "chiave-azure"})
    # i modelli recenti di Azure/OpenAI rifiutano max_tokens: si riprova con max_completion_tokens
    editore.claude.risposte = [httpx.Response(400, json={"error": {"message": "Unsupported parameter: 'max_tokens' is not supported with this model. "
                                                                            "Use 'max_completion_tokens' instead."}}),
                               FintoClaude.testo('{"ok": true}')]
    r = ce.post("/api/admin/locale/ia/prova")
    assert r.status_code == 200 and r.json()["risposta"] == {"ok": True}, r.text
    prima, seconda = editore.claude.richieste[-2:]
    assert "max_tokens" in prima["corpo"] and "max_completion_tokens" in seconda["corpo"] and "max_tokens" not in seconda["corpo"]
    assert seconda["intestazioni"]["api-key"] == "chiave-azure" and seconda["url"].endswith("/openai/v1/chat/completions")
    with editore.app.state.db.connessione() as c:              # la prova non consuma la quota di nessuno
        assert c.execute("SELECT COUNT(*) FROM uso_ia").fetchone()[0] == 0
    editore.claude.risposte = [httpx.Response(401, json={"error": {"message": "Access denied due to invalid subscription key"}})]
    r = ce.post("/api/admin/locale/ia/prova")
    assert r.status_code == 503 and "rifiuta la chiave" in r.json()["errore"]


# ------------------------------------------------------------------ nuove versioni del programma
def pacchetto(cartella: Path, versione: str, avvio: str = "@echo off\r\n") -> Path:
    f = cartella / f"magic-hs-windows-{versione}.zip"
    with zipfile.ZipFile(f, "w") as z:
        z.writestr("python/pythonw.exe", b"MZ")
        z.writestr("python/Lib/site-packages/taric/__init__.py", f'"""MAGIC HS"""\n__version__ = "{versione}"\n')
        z.writestr("Avvia MAGIC HS.cmd", avvio)
    return f


def test_pubblicazione_del_programma(ambiente):
    tmp, cond, mp = ambiente
    editore = PC(tmp, cond, "editore", mp, versioni=("2026-11-01",))
    ce = editore.entra()
    for v in ("1.1.0", "1.2.0", "1.3.0"):
        with open(pacchetto(tmp, v, f"rem {v}\r\n"), "rb") as f:
            r = ce.post("/api/admin/locale/programma", files={"file": (f"magic-hs-windows-{v}.zip", f, "application/zip")})
        assert r.status_code == 200 and r.json()["versione"] == v, r.text
        time.sleep(0.02)
    assert (cond / "programma" / "versione.txt").read_bytes() == b"1.3.0\r\n"
    assert sorted(f.name for f in (cond / "programma").glob("*.zip")) == ["magic-hs-1.2.0.zip", "magic-hs-1.3.0.zip"]
    assert (cond / "Avvia MAGIC HS.cmd").read_bytes() == b"rem 1.3.0\r\n"
    assert ce.get("/api/admin/locale").json()["programma"]["pubblicato"] == "1.3.0"
    r = ce.post("/api/admin/locale/programma", files={"file": ("altro.zip", io.BytesIO(b"non e' uno zip"), "application/zip")})
    assert r.status_code == 422 and r.json()["codice"] == "pacchetto"
    vuoto = tmp / "vuoto.zip"
    with zipfile.ZipFile(vuoto, "w") as z:
        z.writestr("leggimi.txt", "niente")
    with pytest.raises(ErroreCondivisa):
        versione_pacchetto(vuoto)
    assert (cond / "programma" / "versione.txt").read_bytes() == b"1.3.0\r\n"


# ------------------------------------------------------------------ avvio vero, con il server in ascolto
def avvia(tmp: Path, cond: Path, *altri: str) -> subprocess.Popen:
    return subprocess.Popen([sys.executable, "-m", "taric.programma", "--condivisa", str(cond), "--cartella", str(tmp / "pc"),
                             "--senza-browser", "--console", *altri], cwd=RADICE, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)


def aspetta_istanza(tmp: Path, secondi: float = 20) -> dict:
    fine = time.monotonic() + secondi
    while time.monotonic() < fine:
        try:
            info = json.loads((tmp / "pc" / "istanza.json").read_text())
            if httpx.get(f"http://127.0.0.1:{info['porta']}/api/locale/ping", timeout=1, trust_env=False).status_code == 200:
                return info
        except (OSError, ValueError, httpx.HTTPError):
            pass
        time.sleep(0.2)
    raise AssertionError("il programma non si e' avviato")


def test_avvio_una_sola_copia_e_chiusura_da_solo(ambiente):
    tmp, cond, mp = ambiente
    Condivisa(cond).pubblica_dati("2026-11-01", dati_finti(tmp / "origine", "2026-11-01"))
    primo = avvia(tmp, cond, "--inattivita", "6")
    try:
        info = aspetta_istanza(tmp)
        base = f"http://127.0.0.1:{info['porta']}"
        with httpx.Client(base_url=base, trust_env=False, follow_redirects=False) as c:
            r = c.get(f"/entra?k={info['chiave']}")
            assert r.status_code == 303
            assert c.get("/api/io").json()["dati"]["versione"] == "2026-11-01"
        # secondo doppio clic: usa la copia gia' aperta e finisce subito
        secondo = avvia(tmp, cond)
        assert secondo.wait(30) == 0
        assert "pronto su" in (secondo.stdout.read() if secondo.stdout else "")
        # senza richieste si chiude da solo e toglie il file dell'istanza
        assert primo.wait(40) == 0
        assert not (tmp / "pc" / "istanza.json").exists()
    finally:
        if primo.poll() is None:
            primo.kill()
    registro = (tmp / "pc" / "registro.txt").read_text(encoding="utf-8")
    assert "dati 2026-11-01 ricevuti dalla cartella condivisa" in registro and "mi chiudo" in registro


def test_avvio_senza_cartella_condivisa(tmp_path: Path):
    r = subprocess.run([sys.executable, "-m", "taric.programma", "--condivisa", str(tmp_path / "manca"), "--cartella", str(tmp_path / "pc"),
                        "--senza-browser"], cwd=RADICE, capture_output=True, text=True, timeout=30)
    assert r.returncode == 1 and "Non trovo la cartella condivisa" in r.stderr


def test_file_di_avvio_per_windows():
    testo = (RADICE / "windows" / "Avvia MAGIC HS.cmd").read_bytes().decode("ascii")      # solo ASCII
    righe = [r.strip() for r in testo.splitlines() if r.strip() and not r.strip().lower().startswith("rem ")]
    # niente blocchi tra parentesi: un percorso come «OneDrive - Azienda (Italia)» li romperebbe
    assert not any(r.endswith("(") or r.startswith(")") for r in righe)
    etichette = {r[1:] for r in righe if r.startswith(":")}
    salti = {r.split("goto ", 1)[1].split()[0] for r in righe if "goto " in r}
    assert salti and salti <= etichette
    assert '-I -m taric.programma --condivisa "%CONDIVISA%"' in testo
    assert "pythonw.exe" in testo and 'set "CONDIVISA=%CONDIVISA:~0,-1%"' in testo   # niente \ prima delle virgolette


# ------------------------------------------------------------------ chi pubblica
def test_collega_con_permesso_di_modifica_non_pubblica(ambiente):
    tmp, cond, mp = ambiente
    PC(tmp, cond, "mrossi", mp, versioni=("2026-11-01",))
    prima = sorted(p.relative_to(cond).as_posix() for p in cond.rglob("*"))
    collega = PC(tmp, cond, "lbianchi", mp, editore=False)          # puo' scrivere, ma non e' nell'elenco
    assert sorted(p.relative_to(cond).as_posix() for p in cond.rglob("*")) == prima     # non ha scritto niente
    c = collega.entra()
    io_ = c.get("/api/io").json()
    assert io_["ruolo"] == "utente" and not io_["locale"]["editore"] and not io_["locale"]["puo_gestire"]
    assert io_["locale"]["utente"] == "lbianchi" and not collega.cfg.scarica_dati
    assert collega.app.state.dati.dopo_installazione is None
    assert c.post("/api/locale/gestisco-io").status_code == 409
    assert c.put("/api/admin/locale/editori", json={"editori": ["lbianchi"]}).status_code == 403


def test_il_primo_editore_lo_dice_dal_suo_pc(ambiente):
    tmp, cond, mp = ambiente
    Condivisa(cond).pubblica_dati("2026-11-01", dati_finti(tmp / "kit", "2026-11-01"))     # cartella appena estratta
    pc = PC(tmp, cond, "mrossi", mp, editore=False)
    c = pc.entra()
    io_ = c.get("/api/io").json()
    assert io_["locale"]["puo_gestire"] and not io_["locale"]["editore"] and io_["dati"]["versione"] == "2026-11-01"
    r = c.post("/api/locale/gestisco-io")
    assert r.status_code == 200 and r.json()["editore"], r.text
    assert editori(Condivisa(cond).impostazioni()) == ["mrossi"]
    io_ = c.get("/api/io").json()
    assert io_["ruolo"] == "amministratore" and io_["locale"]["editore"] and not io_["locale"]["puo_gestire"]
    assert pc.cfg.scarica_dati and pc.app.state.dati.dopo_installazione is not None
    assert c.post("/api/locale/gestisco-io").status_code == 409          # c'e' gia' chi gestisce
    altro = PC(tmp, cond, "lbianchi", mp, editore=False).entra()
    assert not altro.get("/api/io").json()["locale"]["puo_gestire"]


def test_cartella_in_sola_lettura(ambiente):
    tmp, cond, mp = ambiente
    PC(tmp, cond, "mrossi", mp, versioni=("2026-11-01",))
    imposta_editori(cond, "mrossi", "lbianchi")
    pc = PC(tmp, cond, "lbianchi", mp, editore=False, sola_lettura=True)       # nell'elenco ma senza permesso di scrittura
    io_ = pc.entra().get("/api/io").json()
    assert not io_["locale"]["editore"] and pc.attiva() == "2026-11-01"


def test_editori_aggiunti_e_tolti(ambiente):
    tmp, cond, mp = ambiente
    ed = PC(tmp, cond, "mrossi", mp, versioni=("2026-11-01",))
    collega = PC(tmp, cond, "lbianchi", mp, editore=False)
    ce, cc = ed.entra(), collega.entra()
    loc = ce.get("/api/admin/locale").json()
    assert loc["editori"] == ["mrossi"] and loc["utente"] == "mrossi" and loc["scrivibile"]
    assert ce.put("/api/admin/locale/editori", json={"editori": ["mrossi", "a/b"]}).status_code == 422
    assert ce.put("/api/admin/locale/editori", json={"editori": []}).status_code == 422
    r = ce.put("/api/admin/locale/editori", json={"editori": ["mrossi", " LBianchi "]})
    assert r.status_code == 200 and r.json()["editori"] == ["mrossi", "lbianchi"]
    cc.post("/api/locale/sincronizza")                                       # come al giro successivo del pianificatore
    assert cc.get("/api/io").json()["locale"]["editore"] and cc.get("/api/admin/locale").status_code == 200
    # chi si toglie dall'elenco smette subito di pubblicare
    r = ce.put("/api/admin/locale/editori", json={"editori": ["lbianchi"]})
    assert r.status_code == 200 and r.json()["editore"] is False
    assert ce.get("/api/admin/locale").status_code == 403 and ce.get("/api/io").json()["ruolo"] == "utente"


def test_messaggi_ia_nel_programma_sul_pc(ambiente):
    tmp, cond, mp = ambiente
    ed = PC(tmp, cond, "mrossi", mp, versioni=("2026-11-01",))
    ce = ed.entra()
    ce.put("/api/admin/locale/ia", json={"fornitore": "openai", "url": "https://esempio.it/v1", "modello": "m", "chiave": "k", "quota": 0})
    collega = PC(tmp, cond, "lbianchi", mp, editore=False)
    r = collega.entra().post("/api/ia", json={"prompt": "ciao", "livello": "rapido"})
    assert r.status_code == 429 and "chi gestisce MAGIC HS" in r.json()["errore"] and "amministratore" not in r.json()["errore"]


def test_non_riscarica_un_mese_gia_installato(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    """Se l'amministratore torna alla versione precedente, il pianificatore non reinstalla da solo quella nuova."""
    from datetime import datetime

    from conftest import Sito
    monkeypatch.setenv("TARIC_CONFIG", str(tmp_path / "nessuno.env"))
    sito = Sito(tmp_path, {"TARIC_AGGIORNAMENTO_AUTOMATICO": "si"})
    dati = sito.app.state.dati
    monkeypatch.setattr(dati, "_ora_locale", lambda: datetime(2026, 12, 5, 9, 0))
    sito.versione_finta("2026-11-01")
    assert dati.da_fare() == "2026-12"
    sito.versione_finta("2026-12-01")
    sito.app.state.dati.imposta_attiva("2026-11-01")
    assert dati.da_fare() is None
