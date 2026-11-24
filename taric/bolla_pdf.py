"""Bolla simulata da un PDF (sezione Bolla, «Da un PDF»; POST /api/bolle/leggi): i dati letti dal prospetto di sintesi H1
diventano i campi di una bolla d'importazione nuova, da controllare e salvare.

Due modi di leggere, con lo stesso risultato («estratto»: i dati così come sono scritti):
- senza IA, leggi_testo(): taric/leggi_bolla.py in un processo a parte (il PDF è un dato non fidato), solo per il prospetto
  di sintesi H1 di AIDA in PDF digitale; gratis, anche per chi ha l'IA spenta;
- con l'IA (schema «bolla» di taric/ia.py, CONTESTO e PROMPT qui sotto): qualsiasi dichiarazione, anche scansionata; conta
  come una classificazione del mese.
dati_bolla() porta l'estratto nella forma dei dati della bolla (js/bolla.js) e dice in «avvisi» quello che non riporta
(aggiunte e detrazioni, altri documenti, importi dei tributi del prospetto, che MAGIC HS ricalcola).
"""
from __future__ import annotations

import json
import re
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Any

LETTORE = Path(__file__).with_name("leggi_bolla.py")
INCOTERM = {"EXW", "FCA", "FAS", "FOB", "CFR", "CIF", "CPT", "CIP", "DAP", "DPU", "DDP"}
# documenti di trasporto della bolla (js/bolla.js, DOC_TRASPORTO) e fatture
DOC_TRASPORTO = {"N705", "N714", "N740", "N741", "N730", "N720", "N722", "N703", "N704", "N710", "N750", "N760", "N785", "N787"}
FATTURE = ("N380", "N935")
RE_MRN = re.compile(r"\d{2}[A-Z]{2}[A-Z0-9]{14}")

CONTESTO = (
    "Sei un esperto di dichiarazioni doganali dell'Unione europea. Nel PDF allegato c'è una dichiarazione doganale: per esempio il "
    "prospetto di sintesi della dichiarazione H1 stampato da AIDA, un DAU o la stampa di uno spedizioniere. Riporta i dati richiesti "
    "così come sono scritti, senza inventare niente: stringa vuota o elenco vuoto per quello che non c'è.\n"
    "- tipo: \"H1\" per un'importazione (immissione in libera pratica), \"EX\" per un'esportazione, \"altro\" se non è una "
    "dichiarazione doganale.\n"
    "- data: data della dichiarazione, GG/MM/AAAA. valuta: codice di 3 lettere della valuta della fattura.\n"
    "- esportatore, importatore, dichiarante, rappresentante: come scritti (nome, indirizzo, EORI), righe separate da \\n. "
    "qualifica: \"2\" se il rappresentante è diretto, \"3\" se è indiretto, \"\" se non è indicato.\n"
    "- consegna: condizioni di consegna, cioè Incoterm e luogo (per esempio \"CPT TORINO IT\").\n"
    "- paese_spedizione e origine: codici ISO di 2 lettere. provincia: sigla di 2 lettere. natura: codice della natura della "
    "transazione. metodo_pagamento: lettera del metodo di pagamento dei tributi. container: \"1\" o \"0\".\n"
    "- documenti: codice di 4 caratteri (per esempio N935, N740, Y900) e identificativo. scarichi: documento precedente (tipo, "
    "riferimento, articolo, numero di imballaggi, quantità, unità).\n"
    "- articoli, uno per ogni articolo: codice merce (solo cifre), descrizione, paese d'origine, prezzo dell'articolo (il numero, "
    "senza valuta), massa lorda e netta in kg, quantità in unità supplementari (il numero), regimi aggiuntivi, preferenza (codice "
    "di 3 cifre), documenti, colli (tipo di imballaggio, numero, marchi), aggiunte e detrazioni (codice e importo), tributi "
    "(codice del tributo, per esempio A00 o B00, e importo).\n"
    "Scrivi i numeri come sono scritti, con la virgola decimale.")
PROMPT = "Leggi la dichiarazione doganale allegata e restituisci i suoi dati nel formato richiesto."


# ------------------------------------------------------------------ lettura senza IA
def leggi_testo(pdf: bytes, cartella: Path) -> tuple[dict[str, Any] | None, str]:
    """I dati del prospetto letti da leggi_bolla.py, oppure None e il motivo."""
    cartella.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(dir=cartella) as t:
        entrata, uscita = Path(t) / "bolla.pdf", Path(t) / "bolla.json"
        entrata.write_bytes(pdf)
        try:
            p = subprocess.run([sys.executable, "-I", "-X", "utf8", str(LETTORE), str(entrata), str(uscita)],
                               capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=60, cwd=t)
        except subprocess.TimeoutExpired:
            return None, "la lettura ha superato il tempo massimo"
        righe = [r.strip() for r in p.stdout.splitlines() if r.strip()]
        if p.returncode != 0 or not righe or righe[-1] != "CONTROLLI OK" or not uscita.is_file():
            motivi = [r[2:] for r in righe if r.startswith("- ")]
            return None, "; ".join(motivi)[:300] or "PDF non leggibile"
        return json.loads(uscita.read_text(encoding="utf-8")), ""


# ------------------------------------------------------------------ dall'estratto alla bolla
def _t(v: Any, n: int = 300) -> str:
    """Testo pulito: righe senza spazi doppi, al massimo n caratteri."""
    righe = [re.sub(r"\s+", " ", r).strip() for r in str(v if v is not None else "").splitlines()]
    return "\n".join(r for r in righe if r)[:n]


def _una_riga(v: Any, n: int = 300) -> str:
    return _t(v, n * 2).replace("\n", " ")[:n]


def _numero(v: Any) -> str:
    """Il numero scritto (anche «1.000,00 USD» o «1 pa»): solo le cifre e i separatori, come lo legge js/calcolo.js."""
    m = re.search(r"\d[\d.,]*", str(v or ""))
    return m.group(0).rstrip(".,") if m else ""


def _paese(v: Any) -> str:
    m = re.search(r"\b([A-Z]{2})\b", str(v or "").upper())
    return m.group(1) if m else ""


def _data(v: Any) -> str:
    s = str(v or "")
    m = re.search(r"(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})", s)
    if m:
        return f"{m.group(3)}-{int(m.group(2)):02d}-{int(m.group(1)):02d}"
    m = re.search(r"(\d{4})-(\d{2})-(\d{2})", s)
    return m.group(0) if m else ""


def _codice_documento(v: Any) -> str:
    s = re.sub(r"\s+", "", str(v or "")).upper()
    return s if re.fullmatch(r"[A-Z0-9]{4}", s) else ""


def dati_bolla(e: dict[str, Any]) -> tuple[dict[str, Any], list[str]]:
    """I campi della bolla (forma di js/bolla.js, solo quelli letti) e gli avvisi su quello che non si è riportato."""
    avvisi: list[str] = []
    articoli_letti = [a for a in (e.get("articoli") or []) if isinstance(a, dict)][:99]
    lista = lambda x: [y for y in (x or []) if isinstance(y, dict)]
    d: dict[str, Any] = {"tipo": "import"}
    d["data"] = _data(e.get("data"))
    valuta = str(e.get("valuta") or "").strip().upper()
    if not re.fullmatch(r"[A-Z]{3}", valuta):
        m = re.search(r"\b([A-Z]{3})\b", str(e.get("valore_fattura") or "").upper())
        valuta = m.group(1) if m else "EUR"
    d["valuta"] = valuta
    for campo, chiave in (("mittente", "esportatore"), ("destinatario", "importatore"), ("dichiarante", "dichiarante"),
                          ("rappresentante", "rappresentante")):
        d[campo] = _t(e.get(chiave))
    d["qualifica"] = str(e.get("qualifica") or "") if str(e.get("qualifica") or "") in ("2", "3") else ""
    if d["rappresentante"] and not d["qualifica"]:
        avvisi.append("Il rappresentante non dice se è diretto o indiretto: scegli la qualifica.")
    consegna = _una_riga(e.get("consegna"), 120).split(" ")
    if consegna and consegna[0].upper() in INCOTERM:
        d["incoterm"], d["luogo"] = consegna[0].upper(), " ".join(consegna[1:])[:80]
    elif consegna and consegna[0]:
        avvisi.append(f"Condizioni di consegna «{' '.join(consegna)}» senza un Incoterm riconosciuto: scegline uno.")
    d["paeseSpedizione"] = _paese(e.get("paese_spedizione"))
    d["provincia"] = _paese(e.get("provincia"))
    d["natura"] = (re.findall(r"\d+", str(e.get("natura") or "")) or [""])[0][:2]
    d["ufficio"] = _una_riga(e.get("ufficio"), 120)
    mrn = re.sub(r"\s+", "", str(e.get("mrn") or "")).upper()
    d["mrn"] = (RE_MRN.search(mrn).group(0) if RE_MRN.search(mrn) else mrn)[:24]
    dilazione = _una_riga(e.get("dilazione"), 70)
    d["dilazione"] = "" if set(dilazione) <= {"*", " "} else dilazione            # AIDA la nasconde con gli asterischi
    d["mezzoArrivo"] = _una_riga(e.get("mezzo_arrivo"), 40)
    metodo = str(e.get("metodo_pagamento") or "").strip().upper()
    if not metodo:
        metodo = next((str(t.get("metodo") or "").strip().upper() for a in articoli_letti for t in lista(a.get("tributi")) if t.get("metodo")), "")
    d["metodoPagamento"] = metodo[:1] if re.fullmatch(r"[A-Z]", metodo[:1] or "-") else ""
    container = str(e.get("container") or next((a.get("container") for a in articoli_letti if a.get("container")), "") or "").strip()
    d["container"] = container if container in ("0", "1") else ""
    # documenti di testata: la fattura e il documento di trasporto; gli altri si dicono
    altri = []
    d["fattura"], d["docTrasporto"] = "", {"tipo": "", "numero": ""}
    for doc in lista(e.get("documenti")):
        cod, ident = _codice_documento(doc.get("codice")), _una_riga(doc.get("identificativo"), 70)
        ident = "" if ident in ("-", "—") else ident
        if cod in FATTURE and not d["fattura"]:
            d["fattura"] = ident
        elif cod in DOC_TRASPORTO and not d["docTrasporto"]["tipo"]:
            d["docTrasporto"] = {"tipo": cod, "numero": ident}
        elif cod:
            altri.append(cod)
    if altri:
        avvisi.append("Documenti di testata non riportati nella bolla: " + ", ".join(altri) + ".")
    scarichi = lista(e.get("scarichi"))
    s0 = scarichi[0] if scarichi else {}
    d["scarico"] = {"tipo": _una_riga(s0.get("tipo"), 4), "riferimento": _una_riga(s0.get("riferimento"), 70),
                    "articolo": _numero(s0.get("articolo"))[:5], "colli": _numero(s0.get("colli"))[:8],
                    "quantita": _numero(s0.get("quantita"))[:16], "unita": _una_riga(s0.get("unita"), 8)}
    if len(scarichi) > 1:
        avvisi.append(f"Il prospetto ha {len(scarichi)} scarichi: nella bolla c'è il primo.")
    # articoli
    d["articoli"] = []
    for n, a in enumerate(articoli_letti, start=1):
        colli = lista(a.get("colli"))
        c0 = colli[0] if colli else {}
        codici_doc = [c for c in (_codice_documento(x.get("codice")) for x in lista(a.get("documenti"))) if c]
        art = {"codice": re.sub(r"\D", "", str(a.get("codice") or ""))[:10], "descrizione": _una_riga(a.get("descrizione"), 512),
               "origine": _paese(a.get("origine")), "valore": _numero(a.get("prezzo")), "netto": _numero(a.get("netto")),
               "lordo": _numero(a.get("lordo")), "quantita": _numero(a.get("quantita")),
               "colliTipo": _una_riga(c0.get("tipo"), 2).upper(), "colliNumero": _numero(c0.get("numero")),
               "colliMarchi": _una_riga(c0.get("marchi"), 512), "regimiAggiuntivi": _una_riga(a.get("regimi_aggiuntivi"), 40).upper(),
               "documenti": list(dict.fromkeys(codici_doc))[:30]}
        d["articoli"].append(art)
        aggiunte = [f"{_una_riga(g.get('codice'), 4)} {_una_riga(g.get('importo'), 20)}".strip() for g in lista(a.get("aggiunte"))]
        if aggiunte:
            avvisi.append(f"Articolo {n}: aggiunte e detrazioni da riportare a mano ({'; '.join(aggiunte)}).")
        pref = re.sub(r"\D", "", str(a.get("preferenza") or ""))
        if pref and pref != "100":
            avvisi.append(f"Articolo {n}: nel prospetto la preferenza è {pref}; MAGIC HS sceglie il regime dalle misure, controllalo.")
        tributi = [f"{_una_riga(t.get('tributo'), 10).split(' ')[0]} {_numero(t.get('importo'))}" for t in lista(a.get("tributi")) if t.get("importo")]
        if tributi:
            avvisi.append(f"Articolo {n}, tributi nel prospetto (per confronto, MAGIC HS li ricalcola): {'; '.join(tributi)}.")
    if lista(e.get("aggiunte")):
        avvisi.append("Aggiunte e detrazioni di testata da riportare a mano: " +
                      "; ".join(f"{_una_riga(g.get('codice'), 4)} {_una_riga(g.get('importo'), 20)}" for g in lista(e.get("aggiunte"))) + ".")
    tasso = _numero(e.get("tasso"))
    if tasso and valuta != "EUR":
        avvisi.append(f"Nel prospetto il tasso di cambio è {tasso}: MAGIC HS usa il cambio doganale del mese della data della bolla.")
    d["paese"] = next((a["origine"] for a in d["articoli"] if a["origine"]), "")
    return d, avvisi
