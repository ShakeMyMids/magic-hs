"""Costruisce la versione sito di MAGIC HS: file statici per GitHub Pages o qualsiasi altro hosting (Cloudflare Pages...).

    python strumenti/sito.py --uscita _sito dati-2026-11-01.zip [dati-2026-10-01.zip ...]

- pagina e programma da taric/static, con i percorsi resi relativi (il sito può stare in una sottocartella, come
  https://<utente>.github.io/magic-hs/) e la Content-Security-Policy scritta nella pagina;
- js/web.js e js/ia.js al posto del server del programma per Windows: storico e preferiti nel browser, IA chiamata
  direttamente con la chiave della persona;
- i dati TARIC dei mesi indicati (archivi della pagina «dati», preparati da strumenti/dati_mese.py) in dati/<versione>/,
  estratti con gli stessi controlli del programma; config.js elenca le versioni;
- il service worker (sw.js) per aprire l'app anche senza rete, il manifesto per installarla come app.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import shutil
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path

RADICE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(RADICE))

from taric import __version__                     # noqa: E402
from taric.dati import RE_VERSIONE, estrai_dati   # noqa: E402

STATICI = RADICE / "taric" / "static"
NOME_ARCHIVIO = re.compile(r"^dati-(\d{4}-\d{2}-01)\.zip$")
# solo il programma del sito: le pagine del programma per Windows (attesa, apertura senza chiave) non servono
ESCLUSI = {"index.html", "attesa.html", "locale.html", "manifest.webmanifest", "sw.js", "js/attesa.js"}
CSP = ("default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; "
       # servizi IA scelti da ognuno: qualsiasi indirizzo https, oppure Ollama sul PC
       "connect-src 'self' https: http://localhost:* http://127.0.0.1:*; manifest-src 'self'; worker-src 'self'; "
       "base-uri 'none'; form-action 'self'; object-src 'none'")


class ErroreSito(Exception):
    pass


def sostituisci(testo: str, vecchio: str, nuovo: str) -> str:
    if testo.count(vecchio) != 1:
        raise ErroreSito(f"index.html non ha la forma attesa: {vecchio!r}")
    return testo.replace(vecchio, nuovo)


def pagina() -> str:
    t = (STATICI / "index.html").read_text(encoding="utf-8")
    t = sostituisci(t, '<html lang="it" data-dati="{{DATI}}">', '<html lang="it" data-dati="">')
    t = sostituisci(t, '<meta charset="utf-8">', f'<meta charset="utf-8">\n<meta http-equiv="Content-Security-Policy" content="{CSP}">')
    t = sostituisci(t, '<script src="{{DATI}}nomenclatura.js"></script>\n<script src="{{DATI}}rif.js"></script>\n',
                    # web.js sceglie la versione dei dati e carica nomenclatura e riferimenti prima di app.js
                    '<script src="config.js"></script>\n<script src="/static/js/ia.js"></script>\n<script src="/static/js/web.js"></script>\n')
    t = t.replace('="/static/', '="static/').replace('href="/manifest.webmanifest"', 'href="manifest.webmanifest"')
    if "{{" in t or re.search(r'(?:src|href)="/', t):
        raise ErroreSito("index.html contiene ancora percorsi del programma per Windows")
    return t


def manifesto() -> str:
    m = json.loads((STATICI / "manifest.webmanifest").read_text(encoding="utf-8"))
    m.update({"id": "./", "start_url": "./", "scope": "./"})
    for icona in m.get("icons", []):
        icona["src"] = icona["src"].lstrip("/")
    return json.dumps(m, ensure_ascii=False, indent=2) + "\n"


def dati(archivi: list[Path], dest: Path) -> list[dict]:
    """Estrae e controlla i dati dei mesi; restituisce le informazioni delle versioni (versione.json), dalla più recente."""
    versioni: dict[str, dict] = {}
    for a in archivi:
        m = NOME_ARCHIVIO.match(a.name)
        if not m:
            raise ErroreSito(f"{a.name}: atteso dati-AAAA-MM-01.zip")
        v = m.group(1)
        with tempfile.TemporaryDirectory() as tmp:
            cartella = Path(tmp) / v
            try:
                estrai_dati(a, cartella)
                info = json.loads((cartella / "versione.json").read_text(encoding="utf-8"))
            except Exception as e:      # archivio non leggibile o incompleto: il sito non si pubblica
                raise ErroreSito(f"{a.name}: {e}") from e
            if info.get("data") != v or not (cartella / "nomenclatura.js").is_file() or not (cartella / "rif.js").is_file():
                raise ErroreSito(f"{a.name}: non contiene i dati di {v}")
            shutil.copytree(cartella, dest / v)
        info = {k: info[k] for k in ("data", "righe", "dichiarabili", "misure_import", "misure_export", "righe_en", "avvisi", "generato") if k in info}
        versioni[v] = {"versione": v, **info}
    if not versioni:
        raise ErroreSito("servono i dati di almeno un mese")
    return [versioni[v] for v in sorted(versioni, reverse=True)]


def costruisci(archivi: list[Path], uscita: Path) -> dict:
    if uscita.exists():
        if any(uscita.iterdir()) and not (uscita / ".nojekyll").exists():
            raise ErroreSito(f"{uscita} non è vuota e non è un sito costruito da qui: non la cancello")
        shutil.rmtree(uscita)
    (uscita / "dati").mkdir(parents=True)
    for f in sorted(STATICI.rglob("*")):
        rel = f.relative_to(STATICI).as_posix()
        if f.is_file() and rel not in ESCLUSI and "__pycache__" not in rel:
            (uscita / "static" / rel).parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(f, uscita / "static" / rel)
    versioni = dati(archivi, uscita / "dati")
    sito = {"programma": __version__, "costruito": datetime.now(timezone.utc).isoformat(timespec="seconds"), "versioni": versioni}
    (uscita / "config.js").write_text("window.TARIC_SITO = " + json.dumps(sito, ensure_ascii=False) + ";\n", encoding="utf-8")
    (uscita / "index.html").write_text(pagina(), encoding="utf-8")
    (uscita / "manifest.webmanifest").write_text(manifesto(), encoding="utf-8")
    (uscita / ".nojekyll").write_text("")
    guscio = ["./", "index.html", "config.js", "manifest.webmanifest"] + sorted(
        f.relative_to(uscita).as_posix() for f in (uscita / "static").rglob("*") if f.is_file() and f.suffix != ".txt")
    impronta = hashlib.sha256()
    for nome in guscio[1:]:
        impronta.update(nome.encode() + b"\0" + (uscita / nome).read_bytes())
    sw = (STATICI / "sw.js").read_text(encoding="utf-8")
    for segnaposto, valore in (("'sviluppo'", json.dumps(impronta.hexdigest()[:16])), ("[/*GUSCIO*/]", json.dumps(guscio)),
                               ("[/*VERSIONI_DATI*/]", json.dumps([v["versione"] for v in versioni]))):
        sw = sostituisci(sw, segnaposto, valore)
    (uscita / "sw.js").write_text(sw, encoding="utf-8")
    return sito


def main(argv: list[str]) -> int:
    ap = argparse.ArgumentParser(description="Versione sito di MAGIC HS")
    ap.add_argument("--uscita", default=str(RADICE / "_sito"))
    ap.add_argument("archivi", nargs="+", help="archivi dati-AAAA-MM-01.zip della pagina «dati»")
    a = ap.parse_args(argv)
    try:
        sito = costruisci([Path(x) for x in a.archivi], Path(a.uscita))
    except ErroreSito as e:
        print(f"errore: {e}", file=sys.stderr)
        return 1
    print(f"sito di MAGIC HS {sito['programma']} in {a.uscita}: dati " + ", ".join(v["versione"] for v in sito["versioni"]))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))


__all__ = ["CSP", "ErroreSito", "RE_VERSIONE", "costruisci"]
