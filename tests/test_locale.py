"""Programma per Windows sul PC, in uso autonomo: ingresso con la chiave dell'avvio, dati TARIC pronti da GitHub (o
preparati sul PC), servizio IA scelto da ognuno con la chiave protetta, nuove versioni installate da sole, avvio e
chiusura dopo l'inattività."""
from __future__ import annotations

import base64
import json
import os
import subprocess
import sys
import time
import zipfile
from datetime import datetime
from pathlib import Path

import httpx
import pytest

from taric import __version__, segreti
from taric.dati import estrai_dati

from conftest import CHIAVE, PC, FintoClaude, FintoGitHub, dati_finti, pacchetto, sha, zip_dei_dati

RADICE = Path(__file__).resolve().parents[1]
CLAUDE = {"fornitore": "anthropic", "chiave": "chiave-di-prova"}


# ------------------------------------------------------------------ ingresso e protezioni
def test_ingresso_solo_con_la_chiave_dell_avvio(ambiente):
    tmp, mp = ambiente
    pc = PC(tmp, mp, versioni=("2026-11-01",))
    c = pc.client()
    r = c.get("/")
    assert r.status_code == 200 and "Avvia MAGIC HS" in r.text            # senza sessione: come aprire il programma
    assert c.get("/api/io").status_code == 401
    r = c.get("/entra?k=sbagliata", follow_redirects=False)
    assert r.status_code == 200 and "magic_hs_locale" not in r.cookies
    c = pc.entra()
    io_ = c.get("/api/io").json()
    assert io_["ruolo"] == "amministratore" and io_["nome"] == "mrossi"   # l'utente del PC decide tutto da sé
    assert io_["programma"] == {"versione": __version__, "pronta": ""}
    assert "email" not in io_ and "piano" not in io_ and "locale" not in io_
    assert "/data/2026-11-01/" in c.get("/").text
    # aprire di nuovo il programma non crea un'altra sessione
    c.get(f"/entra?k={CHIAVE}", follow_redirects=False)
    with pc.app.state.db.connessione() as conn:
        assert conn.execute("SELECT COUNT(*) FROM sessioni").fetchone()[0] == 1


def test_solo_dal_pc_con_il_suo_indirizzo(ambiente):
    tmp, mp = ambiente
    pc = PC(tmp, mp)
    assert pc.client("http://localhost:8765").get("/api/locale/ping").json()["app"] == "magic-hs"
    for base in ("http://sito-malevolo.example:8765", "http://127.0.0.1:9999"):
        assert pc.client(base).get("/api/locale/ping").status_code == 403


def test_niente_funzioni_del_vecchio_sito_ne_della_cartella_condivisa(ambiente):
    """Accesso con password, registrazione, pagamenti, utenti e posta non esistono più; nemmeno la pubblicazione
    nella cartella condivisa (sincronizzazione, chi pubblica, programma per tutti)."""
    tmp, mp = ambiente
    c = PC(tmp, mp).entra()
    for pagina in ("/accedi", "/registrati", "/configura", "/condizioni", "/static/js/accesso.js"):
        assert c.get(pagina, follow_redirects=False).status_code == 404, pagina
    for metodo, url in (("POST", "/api/accedi"), ("POST", "/api/registrazione"), ("GET", "/api/admin/utenti"),
                        ("POST", "/api/pagamento/inizia"), ("POST", "/api/io/password"), ("GET", "/api/admin/backup/x.zip"),
                        ("GET", "/api/piani"), ("GET", "/api/admin/posta"), ("POST", "/api/stripe/webhook"),
                        ("POST", "/api/locale/sincronizza"), ("POST", "/api/locale/gestisco-io"), ("PUT", "/api/admin/locale/editori"),
                        ("POST", "/api/admin/locale/programma"), ("POST", "/api/admin/locale/aggiorna-programma")):
        assert c.request(metodo, url, json={}).status_code in (404, 405), url


def test_chiusura_dal_browser_e_da_una_nuova_versione(ambiente):
    tmp, mp = ambiente
    pc = PC(tmp, mp)
    c = pc.client()
    assert c.post("/api/locale/ferma", json={"chiave": "sbagliata"}).status_code == 403
    assert c.post("/api/locale/chiudi").status_code == 401
    assert not pc.fermato
    assert c.post("/api/locale/ferma", json={"chiave": CHIAVE}).status_code == 200 and pc.fermato
    pc.fermato = False
    assert pc.entra().post("/api/locale/chiudi").status_code == 200 and pc.fermato


def test_ogni_richiesta_tiene_vivo_il_programma(ambiente):
    tmp, mp = ambiente
    pc = PC(tmp, mp)
    pc.app.state.ultimo_contatto = 0
    pc.client().get("/api/locale/ping")
    assert time.monotonic() - pc.app.state.ultimo_contatto < 5


# ------------------------------------------------------------------ dati TARIC
def a_dicembre(pc: PC, mp: pytest.MonkeyPatch) -> None:
    mp.setattr(pc.app.state.dati, "_ora_locale", lambda: datetime(2026, 12, 3, 9, 0))


def test_dati_pronti_da_github(ambiente):
    tmp, mp = ambiente
    archivio = zip_dei_dati("2026-12-01", tmp / "origine", {"programma.exe": "no", "../fuori.js": "no", "m/1.js": "no"})
    gh = FintoGitHub(dati={"2026-12": archivio})
    pc = PC(tmp, mp, versioni=("2026-11-01",), github=gh)
    dati = pc.app.state.dati
    a_dicembre(pc, mp)
    assert dati.da_fare() == "2026-12"
    dati.controlla_mese()
    assert pc.attiva() == "2026-12-01"
    ultimo = dati.ultimi(1)[0]
    assert ultimo["esito"] == "ok" and ultimo["messaggio"].endswith("Dati pronti da GitHub."), ultimo
    v = dati.versioni / "2026-12-01"
    assert sorted(f.relative_to(v).as_posix() for f in v.rglob("*") if f.is_file()) == ["m/84.js", "nomenclatura.js", "riepilogo.txt", "versione.json"]
    assert not any("eu-taric" in u for u in gh.richieste)            # la fonte non serve
    assert not list(dati.lavoro.iterdir()) and not (tmp / "fuori.js").exists()
    assert dati.da_fare() is None
    assert "2026-12-01" in pc.entra().get("/").text


@pytest.mark.parametrize("caso", ["impronta", "altro_mese", "non_zip", "senza_pagina", "senza_mese", "github_giu"])
def test_dati_pronti_sbagliati_o_mancanti_si_preparano_sul_pc(ambiente, caso):
    """Se i dati pronti non ci sono o non vanno bene si scarica l'estrazione dalla fonte (qui non ancora disponibile)."""
    tmp, mp = ambiente
    buono = zip_dei_dati("2026-12-01", tmp / "origine")
    gh = {
        "impronta": FintoGitHub(dati={"2026-12": buono}, digest_dati={"2026-12": "sha256:" + "0" * 64}),
        "altro_mese": FintoGitHub(dati={"2026-12": zip_dei_dati("2026-11-01", tmp / "origine2")}),
        "non_zip": FintoGitHub(dati={"2026-12": b"PK\x03\x04 non finito"}),
        "senza_pagina": FintoGitHub(),
        "senza_mese": FintoGitHub(dati={"2026-11": buono}),
        "github_giu": FintoGitHub(errore=503),
    }[caso]
    pc = PC(tmp, mp, versioni=("2026-11-01",), github=gh)
    dati = pc.app.state.dati
    r = dati.esegui("2026-12", "automatico")
    assert r["esito"] == ("errore" if caso == "github_giu" else "non_disponibile"), r
    assert any("eu-taric-2026-12" in u for u in gh.richieste)        # ha provato la fonte
    assert pc.attiva() == "2026-11-01" and not (dati.versioni / "2026-12-01").exists()
    assert not list(dati.lavoro.iterdir())


def test_primo_avvio_senza_dati(ambiente):
    tmp, mp = ambiente
    gh = FintoGitHub(dati={"2026-11": zip_dei_dati("2026-11-01", tmp / "origine")})
    pc = PC(tmp, mp, github=gh)
    c = pc.entra()
    assert "Preparazione dei dati" in c.get("/").text
    assert c.get("/api/stato").json() == {"dati_pronti": False, "aggiornamento": None}
    a_dicembre(pc, mp)
    pc.app.state.dati.controlla_mese()                 # dicembre non c'e' ancora: si parte da novembre
    assert pc.attiva() == "2026-11-01" and c.get("/api/stato").json()["dati_pronti"]


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


def test_non_riscarica_un_mese_gia_installato(ambiente):
    """Se l'utente torna alla versione precedente, il pianificatore non reinstalla da solo quella nuova."""
    tmp, mp = ambiente
    pc = PC(tmp, mp, versioni=("2026-11-01",))
    dati = pc.app.state.dati
    a_dicembre(pc, mp)
    assert dati.da_fare() == "2026-12"
    dati_finti(dati.versioni, "2026-12-01")
    assert dati.da_fare() is None
    assert PC(tmp, mp, nome="lbianchi", extra={"TARIC_SCARICA_DATI": "0"}).app.state.dati.da_fare() is None


def test_dati_del_mese_per_github(ambiente, monkeypatch):
    """strumenti/dati_mese.py (flusso «Dati TARIC»): archivio con i soli file dei dati, codici d'uscita per il flusso."""
    sys.path.insert(0, str(RADICE / "strumenti"))
    try:
        import dati_mese
    finally:
        sys.path.pop(0)
    from taric.dati import GestoreDati

    tmp, _ = ambiente
    esiti: list[str] = []

    def esegui(self, mese, origine, archivio=None, autore_id=None):
        esiti.append(f"{mese} {origine} {self.cfg.dati_url!r}")
        if mese == "2027-01":
            return {"esito": "non_disponibile", "messaggio": "non ancora"}
        d = dati_finti(self.versioni, f"{mese}-01")
        (d / "estraneo.txt").write_text("no")
        return {"esito": "ok", "messaggio": "fatto"}
    monkeypatch.setattr(GestoreDati, "esegui", esegui)
    uscita = tmp / "dist" / "dati-2026-12-01.zip"
    assert dati_mese.main(["2026-12", str(uscita)]) == 0
    assert esiti == ["2026-12 github ''"]                         # sempre dalla fonte, mai dai dati pronti
    with zipfile.ZipFile(uscita) as z:
        assert sorted(z.namelist()) == ["m/84.js", "nomenclatura.js", "riepilogo.txt", "versione.json"]
    assert dati_mese.main(["2027-01", str(tmp / "x.zip")]) == 2 and not (tmp / "x.zip").exists()
    assert dati_mese.main([]) == 1


# ------------------------------------------------------------------ intelligenza artificiale di questo PC
def file_del_pc(pc: PC) -> bytes:
    return b"".join(f.read_bytes() for f in pc.cartella.rglob("*") if f.is_file())


def test_ia_scelta_sul_pc_con_la_chiave_protetta(ambiente):
    tmp, mp = ambiente
    pc = PC(tmp, mp, versioni=("2026-11-01",))
    c = pc.entra()
    assert c.get("/api/io").json()["ia"]["configurata"] is False
    r = c.put("/api/admin/locale/ia", json={"fornitore": "openai", "url": "", "modello": "gpt", "chiave": "k"})
    assert r.status_code == 422 and r.json()["codice"] == "url"
    r = c.put("/api/admin/locale/ia", json={"fornitore": "gemini", "chiave": ""})
    assert r.status_code == 422 and r.json()["codice"] == "chiave"
    r = c.put("/api/admin/locale/ia", json={"fornitore": "openai", "url": "https://risorsa.openai.azure.com/openai/v1/",
                                          "modello": "gpt-classifica", "chiave": "chiave-segreta-1234"})
    assert r.status_code == 200 and r.json()["attiva"], r.text
    assert pc.cfg.ia_fornitore == "openai" and pc.cfg.ia_url == "https://risorsa.openai.azure.com/openai/v1"
    assert pc.cfg.ia_chiave == "chiave-segreta-1234" and pc.cfg.modello == pc.cfg.modello_rapido == "gpt-classifica"
    assert b"chiave-segreta" not in file_del_pc(pc)                  # mai in chiaro sul disco
    with pc.app.state.db.connessione() as conn:
        salvata = pc.app.state.db.impostazioni(conn)["ia"]["chiave"]
    assert salvata.startswith("locale:")                             # su Windows: "dpapi:"
    loc = c.get("/api/admin/locale").json()
    assert loc["ia"]["chiave"] == "…1234" and not loc["ia"]["chiave_illeggibile"] and "chiave-segreta" not in json.dumps(loc)
    assert "quota" not in loc and loc["attiva"] and loc["aggiornate"]
    # salvare senza chiave tiene quella di prima
    assert c.put("/api/admin/locale/ia", json={"fornitore": "openai", "url": "https://risorsa.openai.azure.com/openai/v1",
                                             "modello": "gpt-4", "modello_rapido": "gpt-mini"}).status_code == 200
    assert pc.cfg.ia_chiave == "chiave-segreta-1234" and (pc.cfg.modello, pc.cfg.modello_rapido) == ("gpt-4", "gpt-mini")
    # riaprendo il programma il servizio resta quello scelto
    altro = PC(tmp, mp)
    assert altro.cfg.ia_chiave == "chiave-segreta-1234" and altro.cfg.modello == "gpt-4"
    # spenta: la chiave sparisce
    assert c.put("/api/admin/locale/ia", json={"fornitore": ""}).status_code == 200
    assert c.get("/api/io").json()["ia"]["configurata"] is False and not pc.cfg.ia_chiave
    with pc.app.state.db.connessione() as conn:
        assert pc.app.state.db.impostazioni(conn)["ia"]["chiave"] == ""
    eventi = [e["tipo"] for e in c.get("/api/admin/eventi").json()["eventi"]]
    assert eventi.count("impostazioni_ia") == 3


def test_chiave_non_leggibile_su_un_altro_pc(ambiente):
    """Database copiato su un altro PC o utente: la chiave non si legge, l'IA risulta spenta e si chiede di reinserirla."""
    tmp, mp = ambiente
    pc = PC(tmp, mp, ia=CLAUDE)
    assert pc.cfg.ia_disponibile
    (pc.cfg.dati / "segreto-ia.key").write_text("un altro segreto")
    pc2 = PC(tmp, mp)
    assert not pc2.cfg.ia_disponibile
    loc = pc2.entra().get("/api/admin/locale").json()
    assert loc["ia"]["fornitore"] == "anthropic" and loc["ia"]["chiave"] == "" and loc["ia"]["chiave_illeggibile"]


def test_protezione_della_chiave(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    # fuori da Windows: segreto casuale nella cartella dei dati, con controllo d'integrita'
    p = segreti.proteggi("sk-123", tmp_path)
    assert p.startswith("locale:") and "sk-123" not in p and segreti.svela(p, tmp_path) == "sk-123"
    assert segreti.proteggi("", tmp_path) == "" and segreti.svela("", tmp_path) == ""
    manomessa = p[:-6] + ("A" if p[-6] != "A" else "B") + p[-5:]
    assert segreti.svela(manomessa, tmp_path) == "" and segreti.svela("locale:%%%", tmp_path) == ""
    assert segreti.svela(p, tmp_path / "altro") == ""
    # su Windows: protezione dati di Windows (qui simulata), niente segreto nella cartella
    monkeypatch.setattr(segreti.sys, "platform", "win32")

    def finta_dpapi(dati: bytes, cifra: bool) -> bytes:
        if cifra:
            return b"W" + dati[::-1]
        if not dati.startswith(b"W"):
            raise OSError(13, "dati non validi")
        return dati[1:][::-1]
    monkeypatch.setattr(segreti, "_dpapi", finta_dpapi)
    w = segreti.proteggi("sk-456", tmp_path / "win")
    assert w.startswith("dpapi:") and segreti.svela(w, tmp_path / "win") == "sk-456"
    assert not (tmp_path / "win").exists()
    assert segreti.svela("dpapi:" + base64.b64encode(b"altro utente").decode(), tmp_path) == ""


@pytest.mark.skipif(sys.platform != "win32", reason="solo su Windows")
def test_protezione_dati_di_windows_vera(tmp_path: Path):
    p = segreti.proteggi("sk-windows-789", tmp_path)
    assert p.startswith("dpapi:") and "sk-windows" not in p and segreti.svela(p, tmp_path) == "sk-windows-789"


VECCHIA = {"sale": "sale9", "editori": ["mrossi"], "quota": 50,
           "ia": {"fornitore": "openai", "url": "https://risorsa.openai.azure.com/openai/v1", "modello": "gpt-classifica",
                  "modello_rapido": "", "chiave_cifrata": "mhs1:CNz-2R7UDLmT1RJBUPqxlFTJaaaeMgypgyXLn6j2XwmmR-02tFr-vSELmNeavw=="}}


def test_servizio_ia_importato_una_volta_dalla_vecchia_cartella(ambiente):
    """Chi avvia dalla vecchia cartella condivisa (fino alla 1.2) ritrova il servizio IA che c'era, poi decide da sé."""
    tmp, mp = ambiente
    vecchia = tmp / "OneDrive - Azienda (Italia)" / "MAGIC HS"
    vecchia.mkdir(parents=True)
    (vecchia / "impostazioni.json").write_text(json.dumps(VECCHIA), encoding="utf-8")
    pc = PC(tmp, mp, avvio=vecchia)
    assert (pc.cfg.ia_fornitore, pc.cfg.ia_chiave, pc.cfg.modello) == ("openai", "sk-vecchia-123", "gpt-classifica")
    c = pc.entra()
    assert c.get("/api/io").json()["ia"]["limite"] is None              # nessun limite mensile: decide l'utente
    assert any("importato" in (e["dettagli"] or "") for e in c.get("/api/admin/eventi").json()["eventi"])
    # spento dall'utente: non si reimporta al prossimo avvio
    c.put("/api/admin/locale/ia", json={"fornitore": ""})
    assert not PC(tmp, mp, avvio=vecchia).cfg.ia_disponibile
    # chiave ancora in chiaro (cartelle molto vecchie), cartella senza impostazioni, file rovinato
    (vecchia / "impostazioni.json").write_text(json.dumps({"ia": {"fornitore": "anthropic", "chiave": "sk-in-chiaro"}}))
    assert PC(tmp, mp, nome="lbianchi", avvio=vecchia).cfg.ia_chiave == "sk-in-chiaro"
    assert not PC(tmp, mp, nome="ccolombo", avvio=tmp / "manca").cfg.ia_disponibile
    (vecchia / "impostazioni.json").write_text("{rotto")
    assert not PC(tmp, mp, nome="gverdi", avvio=vecchia).cfg.ia_disponibile


def test_limite_mensile_dei_database_di_prima_non_vale_piu(ambiente):
    tmp, mp = ambiente
    pc = PC(tmp, mp, ia=CLAUDE)
    with pc.app.state.db.transazione() as conn:
        conn.execute("UPDATE utenti SET quota_ia = 0, ruolo = 'utente'")
    c = PC(tmp, mp).entra()
    io_ = c.get("/api/io").json()
    assert io_["ruolo"] == "amministratore" and io_["ia"]["limite"] is None and io_["ia"]["disponibile"]
    assert c.post("/api/ia", json={"prompt": "ciao", "livello": "rapido", "operazione": "x"}).status_code == 200


def test_prova_del_servizio_e_azure(ambiente):
    tmp, mp = ambiente
    pc = PC(tmp, mp, versioni=("2026-11-01",))
    c = pc.entra()
    assert c.post("/api/admin/locale/ia/prova").json()["codice"] == "not_configured"
    c.put("/api/admin/locale/ia", json={"fornitore": "openai", "url": "https://risorsa.openai.azure.com/openai/v1",
                                        "modello": "gpt-classifica", "chiave": "chiave-azure"})
    # i modelli recenti di Azure/OpenAI rifiutano max_tokens: si riprova con max_completion_tokens
    pc.claude.risposte = [httpx.Response(400, json={"error": {"message": "Unsupported parameter: 'max_tokens' is not supported with this model. "
                                                                        "Use 'max_completion_tokens' instead."}}),
                          FintoClaude.testo('{"ok": true}')]
    r = c.post("/api/admin/locale/ia/prova")
    assert r.status_code == 200 and r.json()["risposta"] == {"ok": True}, r.text
    prima, seconda = pc.claude.richieste[-2:]
    assert "max_tokens" in prima["corpo"] and "max_completion_tokens" in seconda["corpo"] and "max_tokens" not in seconda["corpo"]
    assert seconda["intestazioni"]["api-key"] == "chiave-azure" and seconda["url"].endswith("/openai/v1/chat/completions")
    with pc.app.state.db.connessione() as conn:                # la prova non conta come classificazione
        assert conn.execute("SELECT COUNT(*) FROM uso_ia").fetchone()[0] == 0
    pc.claude.risposte = [httpx.Response(401, json={"error": {"message": "Access denied due to invalid subscription key"}})]
    r = c.post("/api/admin/locale/ia/prova")
    assert r.status_code == 503 and "rifiuta la chiave" in r.json()["errore"]


# ------------------------------------------------------------------ nuove versioni del programma, da GitHub
def scaricati(gh: FintoGitHub) -> int:
    return sum(1 for u in gh.richieste if u.endswith(f"/magic-hs-windows-{gh.versione}.zip"))


def test_nuova_versione_installata_da_sola(ambiente):
    tmp, mp = ambiente
    gh = FintoGitHub("9.9.9", pacchetto("9.9.9", altri={"LEGGIMI.txt": "nuovo"}))
    pc = PC(tmp, mp, versioni=("2026-11-01",), github=gh)
    c = pc.entra()
    r = c.get("/api/admin/locale/aggiornamento").json()
    assert r["in_uso"] == __version__ and r["ultima"] == "9.9.9" and r["pronta"] == "9.9.9" and r["errore"] == "", r
    assert r["pagina"].endswith("/v9.9.9")
    prog = pc.cartella / "programma"
    assert (prog / "9.9.9" / "python" / "pythonw.exe").read_bytes() == b"MZ"
    assert (prog / "attuale.txt").read_bytes() == b"9.9.9\r\n"                     # «Avvia MAGIC HS.cmd» la usa dalla prossima volta
    assert sorted(x.name for x in prog.iterdir()) == ["9.9.9", "attuale.txt"]
    assert sorted(x.name for x in (prog / "9.9.9").iterdir()) == ["python"]        # solo il programma
    assert c.get("/api/io").json()["programma"]["pronta"] == "9.9.9"
    assert any(e["tipo"] == "programma_pubblicato" and "GitHub" in e["dettagli"] for e in c.get("/api/admin/eventi").json()["eventi"])
    assert not list(pc.app.state.dati.lavoro.iterdir())                            # niente resti del download
    n = len(gh.richieste)
    c.get("/api/admin/locale/aggiornamento")
    assert len(gh.richieste) == n                                                  # GitHub al massimo ogni sei ore
    c.get("/api/admin/locale/aggiornamento?forza=true")
    assert len(gh.richieste) == n + 1 and scaricati(gh) == 1                       # e non si riscarica
    # se la versione c'e' gia' sul PC (scaricata in un avvio precedente) la si indica senza riscaricarla
    (prog / "attuale.txt").write_text("1.0.0\r\n")
    r = PC(tmp, mp, github=gh).entra().get("/api/admin/locale/aggiornamento").json()
    assert r["pronta"] == "9.9.9" and (prog / "attuale.txt").read_bytes() == b"9.9.9\r\n" and scaricati(gh) == 1


def test_aggiornamento_dal_pianificatore(ambiente):
    tmp, mp = ambiente
    gh = FintoGitHub("9.9.9", pacchetto("9.9.9"))
    pc = PC(tmp, mp, versioni=("2026-11-01",), github=gh, extra={"TARIC_SCARICA_DATI": "0"})
    pc.app.state.dati.avvia_pianificatore(attesa=3600, ogni_ciclo=[pc.app.state.aggiorna_programma])   # come all'avvio vero
    try:
        fine = time.monotonic() + 30
        while time.monotonic() < fine and not (pc.cartella / "programma" / "attuale.txt").exists():
            time.sleep(0.2)
    finally:
        pc.app.state.dati.ferma()
    assert (pc.cartella / "programma" / "attuale.txt").read_bytes() == b"9.9.9\r\n"


def test_aggiornamento_rifiuta_pacchetti_sbagliati(ambiente):
    tmp, mp = ambiente
    buono = pacchetto("9.9.9")
    casi = [
        (FintoGitHub("9.9.9", buono, digest="sha256:" + "0" * 64), "non corrisponde"),          # impronta diversa
        (FintoGitHub("9.9.9", pacchetto("9.9.9", interna="9.9.8")), "versione attesa"),
        (FintoGitHub("9.9.9", b"non e' uno zip", digest=""), "non leggibile"),
        (FintoGitHub("9.9.9", pacchetto("9.9.9", altri={"python/../../fuori.txt": "no"})), "percorso non valido"),
        (FintoGitHub("9.9.9", buono, digest=sha(buono + b"x")), "non corrisponde"),
    ]
    for k, (gh, messaggio) in enumerate(casi):
        pc = PC(tmp, mp, nome=f"pc{k}", github=gh)
        r = pc.entra().get("/api/admin/locale/aggiornamento").json()
        assert r["pronta"] == "" and messaggio in r["errore"], (k, r)
        prog = pc.cartella / "programma"
        assert not prog.exists() or not list(prog.iterdir()), k
        assert not list(pc.app.state.dati.lavoro.iterdir()) and not (tmp / "fuori.txt").exists()
    # GitHub non raggiungibile o senza versioni: si continua a lavorare, con un messaggio
    for k, gh in enumerate((FintoGitHub(errore=503), FintoGitHub(), FintoGitHub(errore=403))):
        r = PC(tmp, mp, nome=f"giu{k}", github=gh).entra().get("/api/admin/locale/aggiornamento").json()
        assert r["pronta"] == "" and r["errore"]
    assert "troppe richieste" in r["errore"]
    # una versione piu' vecchia di quella in uso non si installa; senza cartella dei programmi non si controlla nulla
    gh = FintoGitHub("0.0.1", pacchetto("0.0.1"))
    r = PC(tmp, mp, nome="vecchia", github=gh).entra().get("/api/admin/locale/aggiornamento").json()
    assert r["ultima"] == "0.0.1" and r["pronta"] == "" and r["errore"] == "" and scaricati(gh) == 0
    gh = FintoGitHub("9.9.9", buono)
    r = PC(tmp, mp, nome="spento", github=gh, extra={"TARIC_PROGRAMMI": ""}).entra().get("/api/admin/locale/aggiornamento").json()
    assert r["pronta"] == "" and r["errore"] and gh.richieste == []


def test_confronto_delle_versioni():
    from taric.aggiornamenti import chiave, piu_recente
    assert piu_recente("1.2.10", "1.2.9") and piu_recente("v2.0", "1.9.9") and not piu_recente("1.2.2", "1.2.2")
    assert chiave("1.3.0-prova") is None and not piu_recente("1.3.0-prova", "1.2.0") and piu_recente("1.2.3", "sviluppo")


def test_pulizia_delle_versioni_sul_pc(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    """Restano la versione in uso, quella pronta per il prossimo avvio e quella della cartella di avvio."""
    from taric.programma import pulisci_versioni
    radice = tmp_path / "pc" / "programma"
    for v in ("1.2.2", "1.3.0", "1.4.0", "1.5.0", "1.6.0.ab12.tmp"):
        (radice / v / "python").mkdir(parents=True)
    (radice / "attuale.txt").write_bytes(b"1.5.0\r\n")
    avvio = tmp_path / "MAGIC HS"
    (avvio / "programma").mkdir(parents=True)
    (avvio / "programma" / "versione.txt").write_bytes(b"1.3.0\r\n")
    monkeypatch.setattr(sys, "executable", str(radice / "1.4.0" / "python" / "pythonw.exe"))
    pulisci_versioni(tmp_path / "pc", avvio)
    assert sorted(d.name for d in radice.iterdir()) == ["1.3.0", "1.4.0", "1.5.0", "attuale.txt"]
    monkeypatch.setattr(sys, "executable", str(tmp_path / "altro" / "python" / "python.exe"))
    pulisci_versioni(tmp_path / "pc")                          # non installato dall'avvio (prove): non tocca nulla
    assert len(list(radice.iterdir())) == 4


# ------------------------------------------------------------------ avvio vero, con il server in ascolto
def avvia(tmp: Path, *altri: str) -> subprocess.Popen:
    env = {**os.environ, "TARIC_SCARICA_DATI": "0", "TARIC_AGGIORNAMENTI_URL": "", "TARIC_DATI_URL": ""}    # niente rete
    return subprocess.Popen([sys.executable, "-m", "taric.programma", "--cartella", str(tmp / "pc"), "--senza-browser", "--console", *altri],
                            cwd=RADICE, env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)


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
    tmp, mp = ambiente
    dati_finti(tmp / "pc" / "dati" / "taric" / "versioni", "2026-11-01")
    (tmp / "pc" / "dati" / "taric" / "attiva.txt").write_text("2026-11-01")
    cartella_avvio = tmp / "Download" / "MAGIC HS (copia) & altro"          # cartella qualsiasi, anche senza impostazioni
    cartella_avvio.mkdir(parents=True)
    primo = avvia(tmp, "--avvio", str(cartella_avvio), "--inattivita", "6")
    try:
        info = aspetta_istanza(tmp)
        base = f"http://127.0.0.1:{info['porta']}"
        with httpx.Client(base_url=base, trust_env=False, follow_redirects=False) as c:
            r = c.get(f"/entra?k={info['chiave']}")
            assert r.status_code == 303
            assert c.get("/api/io").json()["dati"]["versione"] == "2026-11-01"
        # secondo doppio clic (anche da un avvio della 1.2, con --condivisa): usa la copia gia' aperta e finisce subito
        secondo = avvia(tmp, "--condivisa", str(cartella_avvio))
        assert secondo.wait(30) == 0
        assert "pronto su" in (secondo.stdout.read() if secondo.stdout else "")
        # senza richieste si chiude da solo e toglie il file dell'istanza
        assert primo.wait(40) == 0
        assert not (tmp / "pc" / "istanza.json").exists()
    finally:
        if primo.poll() is None:
            primo.kill()
    registro = (tmp / "pc" / "registro.txt").read_text(encoding="utf-8")
    assert f"avviato da {cartella_avvio}" in registro and "mi chiudo" in registro


def test_file_di_avvio_per_windows():
    testo = (RADICE / "windows" / "Avvia MAGIC HS.cmd").read_bytes().decode("ascii")      # solo ASCII
    righe = [r.strip() for r in testo.splitlines() if r.strip() and not r.strip().lower().startswith("rem ")]
    # niente blocchi tra parentesi: un percorso come «Download (vecchi)» li romperebbe
    assert not any(r.endswith("(") or r.startswith(")") for r in righe)
    etichette = {r[1:] for r in righe if r.startswith(":")}
    salti = {r.split("goto ", 1)[1].split()[0] for r in righe if "goto " in r}
    assert salti and salti <= etichette
    assert '-I -m taric.programma --avvio "%CARTELLA%"' in testo
    assert "pythonw.exe" in testo and 'set "CARTELLA=%CARTELLA:~0,-1%"' in testo     # niente \ prima delle virgolette
    assert '"%LOCALE%\\attuale.txt"' in testo                     # la versione scaricata dal programma
    assert "OneDrive" not in testo and "condivisa" not in testo.lower()


def test_file_dei_dati_con_a_capo_uguali_su_windows():
    """Su Windows i file aperti in modalità testo scrivono \\r\\n: aggiorna.py deve produrre gli stessi file ovunque
    (i controlli finali verificano che i .js finiscano con ";\\n")."""
    import re
    testo = (RADICE / "taric" / "aggiorna.py").read_text(encoding="utf-8")
    aperture = re.findall(r'open\([^\n]*"w"[^\n]*\)', testo)
    assert aperture and all('newline="\\n"' in a for a in aperture), aperture
