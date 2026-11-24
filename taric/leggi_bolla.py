"""Lettura senza IA del «Prospetto di sintesi della dichiarazione doganale di importazione H1» stampato da AIDA, per
compilare una bolla simulata (POST /api/bolle/leggi, taric/bolla_pdf.py). Il PDF è un dato non fidato: si legge in un
processo a parte, come leggi_tariffe.py:

    python -I leggi_bolla.py PROSPETTO.pdf USCITA.json

Scrive in USCITA.json i dati letti così come sono scritti (taric/bolla_pdf.py li porta nella forma della bolla) e, se il PDF
è un prospetto H1 riconosciuto, come ultima riga «CONTROLLI OK»; altrimenti esce con 2 e scrive il motivo («- ...»).

Come legge: pypdf (modo «layout») dà ogni testo con la posizione d'inizio e di fine e l'altezza; tutte le misure sono in
altezze di testo, così vale per ogni scala e per l'asse verticale capovolto (i PDF stampati dai browser). Le etichette note
del prospetto, anche spezzate su due righe («Num.» sopra «A93»), sono le caselle: il valore di una casella è il testo sotto
l'etichetta, fino all'etichetta successiva a destra e alla riga di etichette sotto. Le sezioni a righe (Aggiunte / Detrazioni,
Documenti, Scarichi, Liquidazione, Colli) si leggono per colonne, dalle intestazioni. Un foglio «Dettagli Articolo n° N» per
articolo, anche più d'uno per pagina.
"""
from __future__ import annotations

import json
import re
import sys
import unicodedata

from pypdf import PdfReader
from pypdf._text_extraction import _layout_mode        # testi con posizione e larghezza (versione di pypdf fissata)
from pypdf.generic import ContentStream


def piano(s: str) -> str:
    """Per confrontare le etichette: minuscole, senza accenti, spazi e segni."""
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]", "", s)


class Pezzo:
    def __init__(self, x: float, x2: float, y: float, h: float, testo: str):
        self.x, self.x2, self.y, self.h, self.testo = x, max(x2, x), y, h or 1.0, testo.strip()

    def __repr__(self) -> str:
        return f"Pezzo({self.x:.0f},{self.y:.0f},{self.testo!r})"


class Etichetta:
    def __init__(self, campo: str | None, testo: str, x: float, x2: float, y: float, y_fine: float, h: float):
        self.campo, self.testo, self.x, self.x2, self.y, self.y_fine, self.h = campo, testo, x, x2, y, y_fine, h


# etichette delle caselle: testo semplificato -> campo (None: casella che non serve, ma limita le altre)
TESTATA = {
    "ufficio": "ufficio", "datadichiarazione": "data", "dataaccettazione": None, "totalecolli": None, "totalemassalorda": None,
    "valorefattura": "valore_fattura", "tassodicambio": "tasso", "svincolo": None, "datasvincolo": None, "numa93": None,
    "annoa93": None, "totalearticoli": None, "datarilascio": None, "numquiet": None, "dataquiet": None,
    "dettaglidichiarazione": None, "esportatore": "esportatore", "importatore": "importatore", "dichiarante": "dichiarante",
    "rappresentanteindiretto": "rappresentante", "rappresentantediretto": "rappresentante", "rappresentante": "rappresentante",
    "condizionidiconsegna": "consegna", "dilazionedipagamento": "dilazione", "paesedisped": "paese_spedizione",
    "paesedidest": None, "provinciadest": "provincia", "idmezzoallarrivo": "mezzo_arrivo", "naturatransazione": "natura",
}
ARTICOLO = {
    "regime": "regime", "codsvincolo": None, "datasvincolo": None, "numa93": None, "annoa93": None, "datarilascio": None,
    "numquietanza": None, "dataquietanza": None, "codicemerce": "codice", "massalorda": "lordo", "massanetta": "netto",
    "unitasupplementare": "quantita", "regimiaggiuntivi": "regimi_aggiuntivi", "container": "container",
    "descrizionemerce": "descrizione", "preferenze": "preferenza", "contingente": None, "paesedisped": None, "paesedidest": None,
    "provdest": None, "paesediorig": "origine", "paeseorigpref": "origine_preferenziale", "naturatransaz": None,
    "prezzoart": "prezzo", "valorestat": "statistico",
}
# sezioni a righe: titolo semplificato -> (nome, colonne: intestazione semplificata -> chiave)
SEZIONI = {
    "aggiuntedetrazioni": ("aggiunte", {"codice": "codice", "descrizione": "descrizione", "importo": "importo"}),
    "documenti": ("documenti", {"codice": "codice", "identificativo": "identificativo", "autoritaemitt": "autorita", "datavalidita": "data",
                                "data": "data", "unitadimisura": "unita", "unimis": "unita", "quantita": "quantita",
                                "codicevaluta": "valuta", "importo": "importo"}),
    "scarichi": ("scarichi", {"tipo": "tipo", "riferimento": "riferimento", "art": "articolo", "numimb": "colli", "quantita": "quantita",
                              "unita": "unita"}),
    "liquidazione": ("tributi", {"tributo": "tributo", "imponibile": "imponibile", "quantita": "quantita", "unitadimisura": "unita",
                                 "aliquota": "aliquota", "importo": "importo", "metodopag": "metodo"}),
    "colli": ("colli", {"tipoimb": "tipo", "numeroimb": "numero", "marchispedizione": "marchi"}),
}
TITOLO_ARTICOLO = re.compile(r"dettagli\s*articolo\s*n\W*\s*(\d+)", re.I)
MRN = re.compile(r"\d{2}[A-Z]{2}[A-Z0-9]{14}")


# ------------------------------------------------------------------ testi con la posizione
def pezzi_pagina(pagina) -> list[Pezzo]:
    contenuto = pagina.get("/Contents")
    if contenuto is None:
        return []
    ops = iter(ContentStream(contenuto.get_object(), pagina.pdf, "bytes").operations)
    gruppi = _layout_mode.text_show_operations(ops, pagina._layout_mode_fonts(), True, None)
    out = []
    for g in gruppi:
        testo = str(g.get("text") or "").replace("\xa0", " ")
        if not testo.strip():
            continue
        giu = -float(g["ty"]) * (g.get("flip_sort") or 1)            # cresce verso il basso, con l'asse normale o capovolto
        out.append(Pezzo(float(g["tx"]), float(g["displaced_tx"]), giu, float(g.get("font_height") or g.get("font_size") or 1), testo))
    return out


def righe(pezzi: list[Pezzo]) -> list[list[Pezzo]]:
    """I pezzi raggruppati per riga (stessa altezza), da sinistra a destra."""
    out: list[list[Pezzo]] = []
    for p in sorted(pezzi, key=lambda p: (p.y, p.x)):
        if out and abs(out[-1][0].y - p.y) < 0.35 * max(p.h, out[-1][0].h):
            out[-1].append(p)
        else:
            out.append([p])
    return [sorted(r, key=lambda p: p.x) for r in out]


def testo_di(pezzi: list[Pezzo]) -> str:
    return "\n".join(" ".join(p.testo for p in r) for r in righe(pezzi)).strip()


# ------------------------------------------------------------------ etichette, caselle e sezioni
def trova_etichette(pezzi: list[Pezzo], noti: dict[str, str | None]) -> tuple[list[Etichetta], set[int]]:
    """Le etichette note tra i pezzi: intere, in più pezzi sulla stessa riga o su due righe. Restituisce anche i pezzi usati."""
    usati: set[int] = set()
    out: list[Etichetta] = []
    ordine = sorted(range(len(pezzi)), key=lambda i: (pezzi[i].y, pezzi[i].x))
    for i in ordine:                                                   # intere
        n = piano(pezzi[i].testo)
        if n in noti:
            p = pezzi[i]
            out.append(Etichetta(noti[n], p.testo, p.x, p.x2, p.y, p.y, p.h)); usati.add(i)
    for i in ordine:                                                   # spezzate: accanto o sotto
        if i in usati:
            continue
        p = pezzi[i]
        for j in ordine:
            if j == i or j in usati:
                continue
            q = pezzi[j]
            accanto = abs(q.y - p.y) < 0.35 * p.h and 0 <= q.x - p.x2 < 1.2 * p.h
            sotto = abs(q.x - p.x) < 0.6 * p.h and 0.4 * p.h < q.y - p.y < 1.7 * p.h
            if (accanto or sotto) and piano(p.testo + q.testo) in noti:
                out.append(Etichetta(noti[piano(p.testo + q.testo)], p.testo + " " + q.testo, p.x, max(p.x2, q.x2), p.y, q.y if sotto else p.y, p.h))
                usati.update((i, j))
                break
    return out, usati


def leggi_sezioni(pezzi: list[Pezzo], esclusi: set[int]) -> tuple[dict[str, list[dict]], set[int], list[float]]:
    """Le sezioni a righe: titolo, riga delle intestazioni, righe fino al titolo successivo. Restituisce le righe lette, i
    pezzi usati e l'altezza dei titoli (limitano le caselle sopra)."""
    titoli = [(i, SEZIONI[piano(p.testo)]) for i, p in enumerate(pezzi) if i not in esclusi and piano(p.testo) in SEZIONI]
    titoli.sort(key=lambda t: pezzi[t[0]].y)
    out: dict[str, list[dict]] = {}
    usati: set[int] = set()
    cime: list[float] = []
    for k, (i, (nome, colonne)) in enumerate(titoli):
        t = pezzi[i]
        fine = pezzi[titoli[k + 1][0]].y if k + 1 < len(titoli) else float("inf")
        sotto = [j for j, p in enumerate(pezzi) if j not in esclusi and j != i and t.y + 0.3 * t.h < p.y < fine - 0.3 * t.h]
        rr = righe([pezzi[j] for j in sotto])
        if not rr:
            continue
        intest = [p for p in rr[0] if piano(p.testo) in colonne]
        if len(intest) < min(2, len(colonne)):
            continue                                                   # non è una sezione (un «Documenti» qualunque)
        cime.append(t.y)
        usati.add(i)
        usati.update(j for j, q in enumerate(pezzi) if q in rr[0])
        # la tabella finisce a un salto grande, a un testo che attraversa più colonne o a un testo di un'altra grandezza
        # (una nota, un titolo, un altro riquadro)
        inizi = sorted(h.x for h in intest)
        tabella = [rr[0]]
        for r in rr[1:]:
            salto = r[0].y - tabella[-1][0].y > 2.6 * max(p.h for p in r)
            largo = any(sum(1 for x in inizi if p.x + 0.5 * p.h < x < p.x2) >= 2 for p in r)
            diverso = len(tabella) > 1 and any(abs(p.h - tabella[1][0].h) > 0.15 * tabella[1][0].h for p in r)
            if salto or largo or diverso:
                break
            tabella.append(r)
            usati.update(j for j, q in enumerate(pezzi) if q in r)
        rr = tabella
        # la colonna di un valore: quella con l'intestazione più vicina (valori allineati a sinistra o a destra)
        def colonna(p: Pezzo) -> str:
            c = (p.x + p.x2) / 2
            return colonne[piano(min(intest, key=lambda h: 0 if h.x <= c <= h.x2 else min(abs(c - h.x), abs(c - h.x2))).testo)]
        prima = colonne[piano(min(intest, key=lambda h: h.x).testo)]
        voci: list[dict] = []
        for r in rr[1:]:
            riga: dict[str, str] = {}
            for p in r:
                ch = colonna(p)
                riga[ch] = (riga[ch] + " " + p.testo) if ch in riga else p.testo
            if not riga.get(prima) and voci:                            # seguito della riga di prima (testo a capo)
                for ch, val in riga.items():
                    voci[-1][ch] = (voci[-1].get(ch, "") + " " + val).strip()
            elif riga:
                voci.append(riga)
        out[nome] = out.get(nome, []) + voci
    return out, usati, cime


def leggi_caselle(pezzi: list[Pezzo], noti: dict[str, str | None]) -> tuple[dict[str, str], dict[str, list[dict]], list[Etichetta]]:
    etichette, usati = trova_etichette(pezzi, noti)
    sezioni, in_sezione, cime = leggi_sezioni(pezzi, usati)
    usati |= in_sezione
    valori: dict[str, str] = {}
    for e in etichette:
        if e.campo is None:
            continue
        stessa = [f.x for f in etichette if f is not e and abs(f.y - e.y) < 0.6 * e.h and f.x > e.x + 0.5 * e.h]
        destra = min(stessa) if stessa else float("inf")
        sotto = [f.y for f in etichette if f.y > e.y_fine + 0.6 * e.h and f.x < destra - 0.3 * e.h and f.x2 > e.x - 0.5 * e.h] + \
                [c for c in cime if c > e.y_fine + 0.6 * e.h]
        fondo = min(sotto) if sotto else e.y_fine + 6 * e.h
        dentro = [p for i, p in enumerate(pezzi) if i not in usati and e.x - 0.6 * e.h <= p.x < destra - 0.3 * e.h
                  and e.y_fine + 0.3 * e.h < p.y < fondo - 0.3 * e.h]
        if dentro and e.campo not in valori:
            valori[e.campo] = testo_di(dentro)
        if e.campo == "rappresentante":
            valori["qualifica"] = "3" if "indirett" in e.testo.lower() else "2" if "dirett" in e.testo.lower() else ""
    return valori, sezioni, etichette


# ------------------------------------------------------------------ il prospetto
def leggi(percorso: str) -> tuple[dict, str]:
    """I dati del prospetto e, se non è un prospetto H1 riconosciuto, il motivo."""
    lettore = PdfReader(percorso)
    if len(lettore.pages) > 200:
        return {}, "il PDF ha troppe pagine"
    pagine = [pezzi_pagina(p) for p in lettore.pages]
    tutto = " ".join(p.testo for pp in pagine for p in pp)
    semplice = piano(tutto)
    if "prospettodisintesi" not in semplice:
        return {}, "non trovo «Prospetto di sintesi della dichiarazione doganale»"
    if "esportazione" in semplice and "importazione" not in semplice:
        return {}, "è un prospetto d'esportazione: per ora si leggono solo le importazioni (H1)"
    out: dict = {"tipo": "H1", "articoli": []}
    # MRN: il testo dopo «MRN» (anche con le lettere spaziate sotto il codice a barre)
    for pp in pagine[:1]:
        for r in righe(pp):
            testo = " ".join(p.testo for p in r)
            m = re.search(r"MRN\W*([0-9A-Z ]{18,40})", testo)
            if m:
                trovato = MRN.search(m.group(1).replace(" ", ""))
                if trovato:
                    out["mrn"] = trovato.group(0)
                    break
    # i fogli degli articoli (anche più d'uno per pagina); la testata è quello che c'è prima del primo
    inizi = [(n, p) for n, pp in enumerate(pagine) for p in pp if TITOLO_ARTICOLO.search(p.testo)]
    testata = [p for p in pagine[0] if not inizi or inizi[0][0] > 0 or p.y < inizi[0][1].y - 3 * inizi[0][1].h]
    valori, sezioni, etichette = leggi_caselle(testata, TESTATA)
    if len(etichette) < 6:
        return {}, "non trovo le caselle del prospetto (Esportatore, Importatore, Dichiarante…)"
    out.update(valori)
    out["documenti"] = sezioni.get("documenti", [])
    out["scarichi"] = sezioni.get("scarichi", [])
    out["aggiunte"] = sezioni.get("aggiunte", [])
    for k, (n, t) in enumerate(inizi):
        dopo = inizi[k + 1] if k + 1 < len(inizi) else None
        fine = dopo[1].y - 3 * dopo[1].h if dopo and dopo[0] == n else float("inf")
        pezzi = [p for p in pagine[n] if t.y - 3 * t.h <= p.y < fine and p is not t]
        valori, sezioni, _ = leggi_caselle(pezzi, ARTICOLO)
        a = dict(valori)
        a["numero"] = TITOLO_ARTICOLO.search(t.testo).group(1)
        for nome in ("aggiunte", "tributi", "scarichi", "documenti", "colli"):
            a[nome] = sezioni.get(nome, [])
        out["articoli"].append(a)
    if not out["articoli"]:
        return out, "non trovo i fogli «Dettagli Articolo»"
    return out, ""


def main(argv: list[str]) -> int:
    if len(argv) != 3:
        print("uso: leggi_bolla.py PROSPETTO.pdf USCITA.json")
        return 2
    try:
        dati, motivo = leggi(argv[1])
    except Exception as e:                                             # PDF illeggibile
        print(f"- PDF illeggibile ({type(e).__name__})"[:300])
        return 2
    if motivo:
        print("- " + motivo)
        return 2
    with open(argv[2], "w", encoding="utf-8") as f:
        json.dump(dati, f, ensure_ascii=False)
    print(f"{len(dati['articoli'])} articoli")
    print("CONTROLLI OK")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
