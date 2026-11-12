#!/usr/bin/env python3
"""MAGIC HS - rigenera i dati della pagina dall'estrazione mensile TARIC (file Excel DG TAXUD).

Uso mensile:
  python3 -I aggiorna.py --src <cartella con gli .xlsx del mese> --out <cartella data/ da pubblicare> \
      --it <nomenclatura_it.json> --data AAAA-MM-01 [--prec <versione.json pubblicata>]

Crea solo la tabella italiana (quando si ha un nuovo "Nomenclature IT.xlsx"):
  python3 -I aggiorna.py --crea-it <Nomenclature IT.xlsx> --en <Nomenclature EN.xlsx della stessa estrazione> \
      --it <nomenclatura_it.json da scrivere> --data AAAA-MM-01

Scrive in --out: nomenclatura.js, rif.js, note.js, m/<capitolo>.js, versione.json e, solo se tutti i controlli
passano, pubblica.json (elenco "as"/"path" dei file per publish_files; pubblica.json stesso non va pubblicato).
Si pubblica solo se il codice di uscita e' 0 e l'ultima riga stampata e' "CONTROLLI OK".
Se in --src c'e' "Nomenclature IT.xlsx", la tabella italiana (--it) viene rigenerata da quel file.
"""
import argparse, collections, datetime, hashlib, json, os, re, sys, warnings

import openpyxl

warnings.simplefilter("ignore")

RICHIESTI = ["Nomenclature EN", "Declarable codes", "Duties Import 01-99", "Duties Export 01-99", "Measure conditions",
             "Measure exclusions", "Measure footnotes", "Footnotes descriptions", "Box 44 codes of the SAD",
             "Geographical areas description", "Geographical areas composition", "Additional codes descriptions"]

# Colonne attese (controllo di struttura: se DG TAXUD cambia i file, lo script si ferma invece di pubblicare dati sbagliati)
ATTESE = {
    "Nomenclature EN": ["Goods code", "Start date", "End date", "Language", "Hier. Pos.", "Indent", "Description", "Descr. start date"],
    "Declarable codes": ["Goods code", "Start date", "Decl. start date", "IS_LEAF", "End date"],
    "Duties Import 01-99": ["Goods code", "Add code", "Order No.", "Start date", "End date", "RED_IND", "Origin", "Measure type", "Legal base", "Duty", "Origin code", "Meas. type code"],
    "Duties Export 01-99": ["Goods code", "Add code", "Order No.", "Start date", "End date", "RED_IND", "Destination", "Measure type", "Legal base", "Duty", "Dest. code", "Meas. type code"],
    "Measure conditions": ["Goods code", "Add code", "Order No.", "Start date", "End date", "Origin code", "Meas. type code", "Meas. cond", "Sequence", "Certificate", "Cond. amount", "Mon. unit", "Meas. unit", "Meas. unit qual", "Meas. action"],
    "Measure exclusions": ["Goods code", "Add code", "Order No.", "Start date", "End date", "Origin", "Measure type", "Excluded country code", "Origin code", "Meas. type code", "Excluded country"],
    "Measure footnotes": ["Goods code", "Add code", "Order No.", "Origin code", "Start date", "End date", "Meas. type code", "Origin", "Measure type", "Footnote"],
    "Footnotes descriptions": ["Footnote", "Language", "Description", "Start date", "Descr. start date", "End date"],
    "Box 44 codes of the SAD": ["Certificate code", "Language", "Description", "Start date", "Description start date", "End date"],
    "Geographical areas description": ["Or./Dest.", "Language", "Abbrev.", "Description", "Start date", "Descr. start date", "End date"],
    "Geographical areas composition": ["Country group", "Start date", "Language", "Abbrev.", "Country group descr.", "Member country", "Abbrev.", "Description", "Mbship start date", "Mbship end date", "End date"],
    "Additional codes descriptions": ["Add code", "Language", "Description", "Start date", "Descr. start date", "End date"],
}
ATTESE["Nomenclature IT"] = ATTESE["Nomenclature EN"]

SUP = str.maketrans("0123456789-+n", "⁰¹²³⁴⁵⁶⁷⁸⁹⁻⁺ⁿ")
SUB = str.maketrans("0123456789-+n", "₀₁₂₃₄₅₆₇₈₉₋₊ₙ")


def righe(path, nome=None):
    """Righe del primo foglio (senza intestazione). Con `nome` verifica che le colonne siano quelle attese."""
    wb = openpyxl.load_workbook(path, read_only=True)
    ws = wb.worksheets[0]
    ws.reset_dimensions()
    it = ws.iter_rows(values_only=True)
    testa = [str(h).strip() if h is not None else "" for h in next(it)]
    attese = ATTESE.get(nome)
    if attese and testa[:len(attese)] != attese:
        raise SystemExit(f"ERRORE: colonne cambiate nel file '{nome}'.\n  attese: {attese}\n  trovate: {testa}\nNON PUBBLICARE.")
    return [tuple(r) for r in it]


def t(v):
    """Valore di cella -> testo senza spazi ai bordi ('' se vuoto); i numeri interi senza '.0'."""
    if v is None:
        return ""
    if isinstance(v, float) and v == int(v):
        return str(int(v))
    return str(v).strip()


def pulisci(s):
    """Marcatori di testo TARIC -> testo semplice."""
    if s is None:
        return ""
    s = str(s).replace("\r", "").replace(chr(0xAD), "").replace(chr(0x2028), "\n").replace(chr(0x2029), "\n")
    s = s.replace("!x!", "×").replace("!o!", "°").replace("!1!", "\n").replace("!<=!", "≤").replace("!>=!", "≥")
    s = re.sub(r"\$(.)", lambda m: m.group(1).translate(SUP), s)
    s = re.sub(r"@(.)", lambda m: m.group(1).translate(SUB), s)
    s = re.sub(r"(?<![A-Za-z0-9])_([^_\n]+?)_(?![A-Za-z0-9])", r"\1", s)
    s = s.replace("|", " ").replace("\xa0", " ").replace("\t", " ")
    s = re.sub(r'<a\s+[^>]*href="([^"]+)"[^>]*>(.*?)</a>',
               lambda m: m.group(2) if m.group(1) in m.group(2) else f"{m.group(2)} ({m.group(1)})", s, flags=re.I | re.S)
    s = re.sub(r"<\s*/?\s*(P|p|BR|br)\s*/?\s*>", "\n", s)
    s = re.sub(r"</?[A-Za-z][^>]{0,200}>", "", s)
    out = [re.sub(r" {2,}", " ", l).strip() for l in s.split("\n")]
    out = [l for l in out if l]
    out = [re.sub(r"^[-–—]+\s*", "– ", l) if re.match(r"^[-–—]", l) else l for l in out]
    return "\n".join(out)


def amg(v):
    """'gg-mm-aaaa' (o data) -> intero aaaammgg; 0 se vuoto."""
    if not v:
        return 0
    if isinstance(v, (datetime.datetime, datetime.date)):
        return v.year * 10000 + v.month * 100 + v.day
    s = str(v)[:10]
    return int(s[6:10] + s[3:5] + s[0:2])


def h8(s):
    """Impronta di un testo, insensibile a maiuscole e spaziatura (cosi' i ritocchi solo formali non contano come modifica)."""
    s = re.sub(r"[\s|]+", " ", s).strip().lower()
    return hashlib.md5(s.encode("utf-8")).hexdigest()[:8]


def scrivi_js(cartella, nome, variabile, oggetto):
    js = variabile + "=" + json.dumps(oggetto, ensure_ascii=False, separators=(",", ":")) + ";\n"
    with open(os.path.join(cartella, nome), "w", encoding="utf-8") as f:
        f.write(js)
    return len(js.encode("utf-8"))


def crea_tabella_it(xlsx_it, xlsx_en, data, dest):
    """Tabella italiana: per ogni riga il testo ufficiale italiano e l'impronta del testo inglese della stessa estrazione.
    Al momento dell'aggiornamento mensile il testo italiano si usa solo se il testo inglese corrente ha la stessa impronta
    (cioe' la voce non e' cambiata da allora)."""
    en = {t(r[0]): t(r[6]) for r in righe(xlsx_en, "Nomenclature EN")}
    tab, senza = {}, 0
    for r in righe(xlsx_it, "Nomenclature IT"):
        k = t(r[0])
        if t(r[3]) and t(r[3]) != "IT":
            raise SystemExit(f"ERRORE: il file italiano contiene righe in lingua {t(r[3])}. NON PUBBLICARE.")
        if k in en and t(r[6]):
            tab[k] = [t(r[6]), h8(en[k])]
        else:
            senza += 1
    if len(tab) < 20000:
        raise SystemExit(f"ERRORE: tabella italiana troppo piccola ({len(tab)} righe). NON PUBBLICARE.")
    with open(dest, "w", encoding="utf-8") as f:
        json.dump({"data": data, "righe": tab}, f, ensure_ascii=False, separators=(",", ":"))
    return len(tab), senza


def verifica(out, data, capitoli_attesi):
    """Rilegge dal disco ogni file generato e ne controlla ogni valore (forma dei file, codici, date, indici, testi).
    Restituisce (problemi, avvisi, righe del riepilogo, numero di valori controllati)."""
    prob, avv, rip = [], [], []
    n = collections.Counter(); domini = collections.Counter(); con_tag = []
    TAG = re.compile(r"<[A-Za-z/!]"); CTL = re.compile("[\\x00-\\x09\\x0b-\\x1e\\x7f\\u2028\\u2029]")
    AREA, NOTA = "[A-Z0-9]{2,4}", "[A-Z0-9]{3,8}"
    R_RIGA = re.compile("\\d{10}[gnL][1-5][0-9a-f]\\x01?[^\\x00-\\x1e\\x7f\\u2028\\u2029]*")
    R_AREE = re.compile(f"{AREA}( {AREA})*"); R_NOTE = re.compile(f"{NOTA}( {NOTA})*"); R_AREA = re.compile(AREA)

    def segnala(msg):
        if len(prob) < 40:
            prob.append(msg)

    def testo(dove, v):
        n["valori"] += 1
        if not isinstance(v, str) or CTL.search(v):
            return segnala(f"{dove}: testo con caratteri non ammessi")
        if TAG.search(v) and len(con_tag) < 5:
            con_tag.append(dove)
        for d in re.findall(r"https?://([^/\s)\"']+)", v):
            domini[d.lower().rstrip(".,;")] += 1

    def carica(nome, prefisso):
        b = open(os.path.join(out, nome), "rb").read()
        try:
            txt = b.decode("utf-8")
            if not (txt.startswith(prefisso) and txt.endswith(";\n")):
                raise ValueError("non comincia o non finisce come previsto")
            return json.loads(txt[len(prefisso):-2]), b
        except ValueError as e:
            segnala(f"{nome}: {e}")
            return None, b

    def voce(nome, b, descr):
        n["file"] += 1
        rip.append(f"{nome:<16}{len(b):>9} byte  sha256 {hashlib.sha256(b).hexdigest()}  {descr}")

    N, b = carica("nomenclatura.js", "window.TARIC_DATA=")
    linee = []
    if N is not None:
        linee = str(N.get("righe", "")).split("\n")
        brutte = [l[:13] for l in linee if not R_RIGA.fullmatch(l)]
        if brutte:
            segnala(f"nomenclatura.js: {len(brutte)} righe non conformi, per esempio {brutte[:3]}")
        for l in linee:
            testo("nomenclatura.js", l[13:].lstrip("\x01").replace("\x1f", "\n"))
        fine = N.get("fine", {})
        if not all(re.fullmatch(r"\d{10}", k) and type(v) is int and 19000101 <= v <= 21001231 for k, v in fine.items()):
            segnala("nomenclatura.js: date di fine validita' non conformi")
        m = N.get("meta", {})
        if m.get("data_riferimento") != data or m.get("righe") != len(linee):
            segnala("nomenclatura.js: intestazione incoerente con il contenuto")
        n["valori"] += len(fine)
        voce("nomenclatura.js", b, f"{len(linee)} righe, {sum(1 for l in linee if l[10:11] == 'L')} dichiarabili, "
             f"{sum(1 for l in linee if l[13:14] == chr(1))} in inglese, {len(fine)} con data di fine")
    Rf, b = carica("rif.js", "window.TARIC_RIF=")
    if Rf is not None:
        for sez in ("aree", "gruppi", "cert", "add", "tipi"):
            d = Rf.get(sez)
            if not isinstance(d, dict) or not d:
                segnala(f"rif.js: manca la sezione {sez}")
                continue
            for k, v in d.items():
                if not re.fullmatch("[A-Z0-9]{1,4}", k):
                    segnala(f"rif.js: chiave non valida in {sez}: {k!r}")
                testo(f"rif.js {sez} {k}", v)
        voce("rif.js", b, ", ".join(f"{len(Rf.get(z) or {})} {nome}" for z, nome in (("aree", "aree e paesi"), ("gruppi", "gruppi di paesi"),
             ("cert", "certificati"), ("add", "codici addizionali"), ("tipi", "tipi di misura"))))
    T, b = carica("note.js", "window.TARIC_NOTE=")
    if T is not None:
        for k, v in T.items():
            if not re.fullmatch(NOTA, k):
                segnala(f"note.js: chiave non valida {k!r}")
            testo(f"note.js {k}", v)
        voce("note.js", b, f"{len(T)} note")
    campioni = []
    nomi = sorted(os.listdir(os.path.join(out, "m")))
    if [x[:2] for x in nomi] != sorted(capitoli_attesi) or not all(re.fullmatch(r"\d\d\.js", x) for x in nomi):
        segnala("cartella m/: i file non corrispondono ai capitoli della nomenclatura")
    for nome in nomi:
        c = nome[:2]
        M, b = carica("m/" + nome, 'window.TARIC_M=window.TARIC_M||{};window.TARIC_M["' + c + '"]=')
        if M is None:
            continue
        if not (isinstance(M, dict) and sorted(M) == ["l", "m", "s", "x"]):
            segnala(f"m/{nome}: struttura inattesa")
            continue
        for v in M["s"]:
            testo(f"m/{nome} dazi e condizioni", v)
        for v in M["l"]:
            testo(f"m/{nome} basi giuridiche", v)
        ns, nl = len(M["s"]), len(M["l"]); tipi = collections.Counter(); nr = [0, 0]
        for k, fl in enumerate(("m", "x")):
            for cod, rr in M[fl].items():
                if not (re.fullmatch(r"\d{10}", cod) and cod[:2] == c and isinstance(rr, list)):
                    segnala(f"m/{nome}: codice non valido {cod!r}")
                    continue
                for r in rr:
                    nr[k] += 1
                    ok = (isinstance(r, list) and len(r) in (11, 12) and type(r[0]) is int and 100 <= r[0] <= 999
                          and isinstance(r[1], str) and R_AREA.fullmatch(r[1]) and type(r[2]) is int and 0 <= r[2] < ns
                          and type(r[3]) is int and 19000101 <= r[3] <= 21001231 and type(r[4]) is int and (r[4] == 0 or 19000101 <= r[4] <= 21001231)
                          and (r[5] == 0 or (isinstance(r[5], str) and re.fullmatch("[A-Z0-9]{4}", r[5])))
                          and (r[6] == 0 or (isinstance(r[6], str) and re.fullmatch(r"\d{6}", r[6])))
                          and type(r[7]) is int and 0 <= r[7] < nl
                          and (r[8] == 0 or (isinstance(r[8], str) and R_AREE.fullmatch(r[8])))
                          and (r[9] == 0 or (isinstance(r[9], str) and R_NOTE.fullmatch(r[9])))
                          and type(r[10]) is int and 0 <= r[10] < ns
                          and (len(r) == 11 or (isinstance(r[11], str) and re.fullmatch("[A-Z0-9]{1,3}", r[11]))))
                    if not ok:
                        segnala(f"m/{nome} {cod}: misura non conforme {str(r)[:90]}")
                    else:
                        tipi[r[0]] += 1
                        if fl == "m" and len(campioni) < 12 and c in ("01", "09", "22", "29", "39", "61", "64", "72", "84", "85", "87", "95") and not any(x[0][:2] == c for x in campioni):
                            campioni.append((cod, r, M["s"][r[2]]))
        n["valori"] += 11 * (nr[0] + nr[1]); n["misure"] += nr[0] + nr[1]
        voce("m/" + nome, b, f"codici con misure {len(M['m'])} import/{len(M['x'])} export, misure {nr[0]}/{nr[1]}, tipi piu' frequenti "
             + (", ".join(f"{tp} ({q})" for tp, q in tipi.most_common(3)) or "nessuno"))
    if con_tag:
        avv.append(f"testi con possibili marcatori HTML rimasti (la pagina li mostra come testo): {', '.join(con_tag)}")
    estranei = sorted(d for d in domini if not (d == "europa.eu" or d.endswith(".europa.eu")))
    if estranei:
        avv.append(f"indirizzi web non europa.eu citati nei testi: {', '.join(estranei[:8])}")
    testa = [f"MAGIC HS - riepilogo dei file generati, situazione al {data}",
             f"Verifica riga per riga: {'superata' if not prob else 'NON superata'} ({n['file']} file riletti dal disco, {n['valori']} valori controllati, {n['misure']} misure).",
             "Ogni file e' un'assegnazione JavaScript di soli dati (JSON): nessun codice eseguibile, nessun marcatore HTML nei testi"
             + (" salvo gli avvisi sotto." if con_tag else "."),
             "Indirizzi web citati nei testi (note e descrizioni ufficiali): " + (", ".join(f"{d} ({q})" for d, q in domini.most_common(12)) or "nessuno"), "",
             "FILE (nome, dimensione, impronta, contenuto)"]
    coda = ["", "CAMPIONI DELLA NOMENCLATURA (codice dichiarabile, descrizione)"]
    foglie = [l for l in linee if l[10:11] == "L"]
    passo = max(1, len(foglie) // 12)
    coda += [f"  {l[:10]}  {l[13:].lstrip(chr(1)).replace(chr(0x1f), ' / ')[:110]}" for l in foglie[passo // 2::passo][:12]]
    coda += ["", "CAMPIONI DELLE MISURE ALL'IMPORTAZIONE (codice, tipo di misura, origine, dazio, inizio)"]
    tn, an = (Rf or {}).get("tipi", {}), (Rf or {}).get("aree", {})
    coda += [f"  {cod}  {r[0]} {tn.get(str(r[0]), '?')}; {r[1]} {an.get(r[1], '?')[:40]}; {dz[:70] or '(nessun importo)'}; dal {r[3]}" for cod, r, dz in campioni]
    return prob, avv, testa + rip + coda, n["valori"]


def cond_testo(rr):
    """Righe di 'Measure conditions' di una misura -> stessa grammatica della colonna Duty."""
    parti = []
    for r in sorted(rr, key=lambda r: (t(r[7]), int(float(r[8] or 0)))):
        lettera, cert, importo, mon, um, qual, azione = t(r[7]), t(r[9]), r[10], t(r[11]), t(r[12]), t(r[13]), t(r[14])
        p = f"{lettera} "
        if cert:
            p += f"cert: {cert[0]}-{cert[1:]} "
        elif importo is not None and str(importo) != "":
            p += f"{float(importo):.3f}" + (f" {mon}" if mon else "") + (f"/{um}" if um else "") + (f" {qual}" if qual else "")
        p += f"({azione.zfill(2)}):"
        parti.append(p)
    return "; ".join(parti)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--src"); ap.add_argument("--out"); ap.add_argument("--it", required=True)
    ap.add_argument("--data", required=True); ap.add_argument("--prec")
    ap.add_argument("--crea-it"); ap.add_argument("--en")
    a = ap.parse_args()
    assert re.match(r"^\d{4}-\d{2}-\d{2}$", a.data), "--data deve essere AAAA-MM-GG"

    if a.crea_it:
        n, senza = crea_tabella_it(a.crea_it, a.en, a.data, a.it)
        print(f"tabella italiana scritta: {n} righe (estrazione {a.data}); {senza} righe italiane senza corrispondente inglese")
        return 0

    src, out = a.src, a.out
    presenti = {n[:-5] for n in os.listdir(src) if n.lower().endswith(".xlsx")}
    mancanti = [n for n in RICHIESTI if n not in presenti]
    if mancanti:
        print("ERRORE: mancano i file:", mancanti)
        return 1
    os.makedirs(os.path.join(out, "m"), exist_ok=True)
    D = {n: righe(os.path.join(src, n + ".xlsx"), n) for n in RICHIESTI}
    problemi = []
    it_aggiornato = False
    if "Nomenclature IT" in presenti:
        n, _ = crea_tabella_it(os.path.join(src, "Nomenclature IT.xlsx"), os.path.join(src, "Nomenclature EN.xlsx"), a.data, a.it)
        it_aggiornato = True
        print(f"trovato Nomenclature IT.xlsx nel mese: tabella italiana rigenerata ({n} righe)")
    if not os.path.exists(a.it):
        print("ERRORE: manca la tabella italiana (--it). NON PUBBLICARE.")
        return 1
    IT = json.load(open(a.it, encoding="utf-8"))

    # ------------------------------------------------------------ nomenclatura
    recs = []
    for r in D["Nomenclature EN"]:
        gc, sd, ed, hpos, indent, desc = t(r[0]), r[1], r[2], r[4], r[5], r[6]
        if not re.fullmatch(r"\d{10} \d{2}", gc) or t(hpos) not in ("2", "4", "6", "8", "10"):
            raise SystemExit(f"ERRORE: riga della nomenclatura non valida: codice {gc!r}, cifre significative {t(hpos)!r}. NON PUBBLICARE.")
        codice, suf = gc.split(" ")
        hp = int(float(hpos)); ind = (indent or "").count("-")
        livello = 0 if hp == 2 else (1 if (hp == 4 and ind == 0) else ind + 1)
        it = IT["righe"].get(gc)
        # testo italiano solo se la voce non e' cambiata dall'estrazione italiana; altrimenti inglese, segnato con \x01
        testo = pulisci(it[0]) if (it and it[1] == h8(t(desc))) else "\x01" + pulisci(desc)
        recs.append([codice, suf, hp, livello, testo, amg(ed), amg(sd)])
    n = len(recs)
    avvisi = []
    if any(recs[i][0] + recs[i][1] < recs[i - 1][0] + recs[i - 1][1] for i in range(1, n)):
        problemi.append("nomenclatura non ordinata")
    # Il livello di ogni riga viene dal rientro ("- - -"). Nei file ufficiali capita qualche rientro sbagliato
    # (esempio reale: 8414 59 35 50 nell'estrazione di luglio 2026): il file "Declarable codes" dice quali codici
    # sono dichiarabili, e un codice dichiarabile non puo' avere righe sotto di se'.
    dich = {t(x[0]): t(x[3]) for x in D["Declarable codes"]}

    def ufficiale(i):
        k = recs[i][0] + " " + recs[i][1]
        return (dich[k] == "1") if (recs[i][1] == "80" and k in dich) else None
    riparate = []
    for i in range(n - 1):
        if ufficiale(i) is True and recs[i + 1][3] > recs[i][3]:
            riparate.append(recs[i][0]); recs[i][3] = recs[i + 1][3]
    salti = [recs[i][0] for i in range(1, n) if recs[i][3] > recs[i - 1][3] + 1]
    foglia = [(i == n - 1) or recs[i + 1][3] <= recs[i][3] for i in range(n)]
    diversi = [i for i in range(n) if ufficiale(i) is not None and ufficiale(i) != foglia[i]]
    for i in diversi:                    # resta valido cio' che dice il file ufficiale
        foglia[i] = ufficiale(i)
    if riparate:
        avvisi.append(f"rientro corretto con il file dei codici dichiarabili: {', '.join(riparate[:10])}")
    if salti:
        avvisi.append(f"salto di livello nella nomenclatura a: {', '.join(salti[:10])}")
    if diversi:
        avvisi.append(f"stato 'dichiarabile' preso dal file ufficiale per: {', '.join(recs[i][0] for i in diversi[:10])}")
    if len(riparate) + len(salti) + len(diversi) > 10:
        problemi.append(f"troppe anomalie nella struttura della nomenclatura ({len(riparate)} rientri, {len(salti)} salti, {len(diversi)} stati diversi)")
    linee, fine = [], {}
    for i, (codice, suf, hp, livello, testo, f_, _) in enumerate(recs):
        flag = "g" if suf != "80" else ("L" if foglia[i] else "n")
        linee.append(f"{codice}{flag}{hp // 2}{livello:x}{testo.replace(chr(10), chr(0x1f))}")
        if f_ and suf == "80":
            fine[codice] = f_
    codici80 = {r[0] for r in recs if r[1] == "80"}
    n_dich = sum(1 for i in range(n) if foglia[i] and recs[i][1] == "80")
    n_en = sum(1 for r in recs if r[4].startswith("\x01"))
    scrivi_js(out, "nomenclatura.js", "window.TARIC_DATA", {
        "meta": {"fonte": "Commissione europea, DG TAXUD - estrazione mensile TARIC", "data_riferimento": a.data, "lingua": "it",
                 "it_data": IT.get("data", ""), "righe": n, "righe_en": n_en, "dichiarabili": n_dich},
        "righe": "\n".join(linee), "fine": fine})
    max_inizio = max(r[6] for r in recs)

    # ------------------------------------------------------------ misure
    # chiave di una misura nei diversi file: codice merce, codice addizionale, numero d'ordine, data d'inizio, origine, tipo
    def chiave(merce, add, ordine, inizio, origine, tipo):
        return (t(merce), t(add), t(ordine), amg(inizio), t(origine), t(tipo))
    conds = collections.defaultdict(list)
    for r in D["Measure conditions"]:
        conds[chiave(r[0], r[1], r[2], r[3], r[5], r[6])].append(r)
    escl = collections.defaultdict(list)
    for r in D["Measure exclusions"]:
        # nel file ufficiale le due intestazioni "excluded country" sono scambiate: il codice e' quello corto
        cod = t(r[10]) if (t(r[10]) and len(t(r[10])) <= 4) else t(r[7])
        escl[chiave(r[0], r[1], r[2], r[3], r[8], r[9])].append(cod)
    note = collections.defaultdict(list)
    for r in D["Measure footnotes"]:
        note[chiave(r[0], r[1], r[2], r[4], r[3], r[6])].append(t(r[9]))

    capitoli = collections.defaultdict(lambda: {"s": [], "si": {}, "l": [], "li": {}, "m": collections.defaultdict(list), "x": collections.defaultdict(list)})
    tipi, u_note, u_add, u_cert, u_aree = {}, set(), set(), set(), set()
    orfane, conta = collections.Counter(), collections.Counter()

    def interna(ch, tab, idx, val):
        if val not in ch[idx]:
            ch[idx][val] = len(ch[tab]); ch[tab].append(val)
        return ch[idx][val]

    for flusso, nome in (("m", "Duties Import 01-99"), ("x", "Duties Export 01-99")):
        for r in D[nome]:
            g, ac, ordine, sd, ed, red, legale, dazio = t(r[0]), t(r[1]), t(r[2]), r[3], r[4], t(r[5]), t(r[8]), t(r[9])
            ocod, tcod = t(r[10]), t(r[11])
            tipi[tcod] = t(r[7])
            if g not in codici80:
                orfane[flusso] += 1
                continue
            k = chiave(g, ac, ordine, sd, ocod, tcod)
            ch = capitoli[g[:2]]
            dazio = re.sub(r"\s+", " ", dazio)
            ctesto = cond_testo(conds[k]) if k in conds else ""
            fn = sorted(set(note.get(k, [])))
            ex = sorted(set(escl.get(k, [])))
            u_note.update(fn); u_aree.add(ocod); u_aree.update(ex)
            if ac:
                u_add.add(ac)
            for txt in (dazio, ctesto):
                for c in re.findall(r"cert: (\S)-(\S{3})", txt):
                    u_cert.add(c[0] + c[1])
            riga = [int(tcod), ocod, interna(ch, "s", "si", dazio), amg(sd), amg(ed), ac or 0, ordine or 0,
                    interna(ch, "l", "li", legale), " ".join(ex) if ex else 0, " ".join(fn) if fn else 0,
                    interna(ch, "s", "si", ctesto) if ctesto else 0]
            if red:
                riga.append(red)
            ch[flusso][g].append(riga)
            conta[flusso] += 1

    for r in recs:                      # ogni capitolo della nomenclatura ha il suo file, anche se senza misure
        if r[3] == 0:
            capitoli[r[0][:2]]
    for c, ch in sorted(capitoli.items()):
        for flusso in ("m", "x"):
            for g in ch[flusso]:
                ch[flusso][g].sort(key=lambda r: (r[0], str(r[1]), r[3], str(r[5]), str(r[6])))
        ogg = {"s": ch["s"], "l": ch["l"], "m": ch["m"], "x": ch["x"]}
        js = f'window.TARIC_M=window.TARIC_M||{{}};window.TARIC_M["{c}"]=' + json.dumps(ogg, ensure_ascii=False, separators=(",", ":")) + ";\n"
        with open(os.path.join(out, "m", c + ".js"), "w", encoding="utf-8") as f:
            f.write(js)

    # ------------------------------------------------------------ tabelle di riferimento
    def per_lingua(rr, lingua, val=2):
        return {t(r[0]): pulisci(r[val]) for r in rr if t(r[1]) == lingua}
    geo_it = per_lingua(D["Geographical areas description"], "IT", 3); geo_en = per_lingua(D["Geographical areas description"], "EN", 3)
    membri = collections.defaultdict(set)
    for r in D["Geographical areas composition"]:
        membri[t(r[0])].add(t(r[5]))
    cert_it = per_lingua(D["Box 44 codes of the SAD"], "IT"); cert_en = per_lingua(D["Box 44 codes of the SAD"], "EN")
    add_it = per_lingua(D["Additional codes descriptions"], "IT"); add_en = per_lingua(D["Additional codes descriptions"], "EN")
    fn_it = per_lingua(D["Footnotes descriptions"], "IT"); fn_en = per_lingua(D["Footnotes descriptions"], "EN")
    scegli = lambda it, en, k: it.get(k) or en.get(k) or ""
    aree = {k: scegli(geo_it, geo_en, k) for k in sorted(set(geo_it) | set(geo_en) | u_aree)}
    scrivi_js(out, "rif.js", "window.TARIC_RIF", {
        "data": a.data, "aree": aree, "gruppi": {k: " ".join(sorted(v)) for k, v in sorted(membri.items())},
        "cert": {k: scegli(cert_it, cert_en, k) for k in sorted(set(cert_it) | u_cert)},
        "add": {k: scegli(add_it, add_en, k) for k in sorted(u_add)}, "tipi": dict(sorted(tipi.items()))})
    scrivi_js(out, "note.js", "window.TARIC_NOTE", {k: scegli(fn_it, fn_en, k) for k in sorted(u_note)})

    # ------------------------------------------------------------ controlli di coerenza
    def controlla(ok, msg):
        if not ok:
            problemi.append(msg)
    controlla(20000 <= n <= 40000, f"righe nomenclatura fuori intervallo: {n}")
    controlla(max(r[3] for r in recs) <= 15, "livelli di rientro oltre 15: il formato dei dati non li rappresenta")
    controlla(n_dich >= 12000, f"pochi codici dichiarabili: {n_dich}")
    controlla(conta["m"] >= 100000, f"poche misure all'importazione: {conta['m']}")
    controlla(conta["x"] >= 5000, f"poche misure all'esportazione: {conta['x']}")
    controlla(95 <= len(capitoli) <= 99, f"numero di capitoli inatteso: {len(capitoli)}")
    controlla(orfane["m"] + orfane["x"] <= 2000, f"troppe misure su codici assenti dalla nomenclatura: {dict(orfane)}")
    controlla("1011" in membri and "1008" in membri and len(membri["1008"]) >= 150, "gruppi di paesi 1011/1008 mancanti o incompleti")
    controlla(sum(1 for k in u_cert if cert_it.get(k)) >= 0.9 * max(1, len(u_cert)), "molti certificati senza descrizione italiana")
    controlla(sum(1 for k in u_aree if aree.get(k)) >= 0.98 * max(1, len(u_aree)), "aree geografiche senza nome")
    controlla("103" in tipi and "142" in tipi, "tipi di misura 103/142 assenti")
    rif = int(a.data.replace("-", ""))
    controlla(rif - 20000 <= max_inizio <= rif + 7, f"date della nomenclatura incoerenti con --data {a.data}: ultima voce creata il {max_inizio}")
    # il file dei cambi doganali porta il mese dell'estrazione: i cambi piu' recenti partono dal primo giorno di quel mese
    cambi = os.path.join(src, "CCT Exchange rates.xlsx")
    if os.path.exists(cambi):
        mese = max((amg(r[2]) for r in righe(cambi) if r[2]), default=0) // 100
        controlla(mese == rif // 100, f"il file scaricato e' del mese {mese}, non di {rif // 100} (--data {a.data})")
    else:
        avvisi.append("file dei cambi assente: mese dell'estrazione non verificato")
    controlla(n_en <= 0.25 * n, f"troppe voci rimaste in inglese: {n_en} su {n}")
    variazioni = {}
    if a.prec and os.path.exists(a.prec):
        prec = json.load(open(a.prec, encoding="utf-8"))
        controlla(a.data >= prec.get("data", ""), f"i dati nuovi ({a.data}) sono piu' vecchi di quelli pubblicati ({prec.get('data')})")
        for campo, valore in (("righe", n), ("dichiarabili", n_dich), ("misure_import", conta["m"]), ("misure_export", conta["x"])):
            if prec.get(campo):
                controlla(valore >= 0.85 * prec[campo], f"{campo} cala di oltre il 15%: {prec[campo]} -> {valore}")
                variazioni[campo] = valore - prec[campo]
        variazioni["rispetto_a"] = prec.get("data", "")

    versione = {"data": a.data, "generato": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"), "righe": n, "dichiarabili": n_dich,
                "righe_it": n - n_en, "righe_en": n_en, "it_data": IT.get("data", ""), "misure_import": conta["m"], "misure_export": conta["x"],
                "capitoli": len(capitoli), "it_aggiornato": it_aggiornato, "avvisi": avvisi, "variazioni": variazioni}
    with open(os.path.join(out, "versione.json"), "w", encoding="utf-8") as f:
        json.dump(versione, f, ensure_ascii=False, indent=1)
    elenco = [{"as": "data/" + nome, "path": os.path.abspath(os.path.join(out, nome))} for nome in ("nomenclatura.js", "rif.js", "note.js", "versione.json")]
    elenco += [{"as": "data/m/" + f_, "path": os.path.abspath(os.path.join(out, "m", f_))} for f_ in sorted(os.listdir(os.path.join(out, "m")))]
    if it_aggiornato:
        elenco.append({"as": "tools/nomenclatura_it.json", "path": os.path.abspath(a.it)})
    da_pubblicare = os.path.join(out, "pubblica.json")
    if os.path.exists(da_pubblicare):
        os.remove(da_pubblicare)
    prob_v, avv_v, righe_riepilogo, n_valori = verifica(out, a.data, {r[0][:2] for r in recs if r[3] == 0})
    problemi += prob_v
    avvisi += avv_v
    riepilogo = os.path.join(os.path.dirname(os.path.abspath(out)), "riepilogo.txt")
    with open(riepilogo, "w", encoding="utf-8") as f:
        f.write("\n".join(righe_riepilogo) + "\n")
    if avv_v:                               # gli avvisi della verifica entrano anche nel file di versione
        versione["avvisi"] = avvisi
        with open(os.path.join(out, "versione.json"), "w", encoding="utf-8") as f:
            json.dump(versione, f, ensure_ascii=False, indent=1)

    print(json.dumps(versione, ensure_ascii=False))
    for av in avvisi:
        print("AVVISO:", av)
    print(f"VERIFICA dei file generati: {n_valori} valori riletti dal disco e controllati, {len(prob_v)} problemi. Riepilogo da leggere: {riepilogo}")
    # campione di cio' che verrebbe pubblicato: una voce dichiarabile per alcuni capitoli, con le sue misure all'importazione
    for cap in ("01", "22", "64", "84"):
        i = next((i for i in range(n) if recs[i][0][:2] == cap and recs[i][1] == "80" and foglia[i]), None)
        if i is not None:
            mis = capitoli[cap]["m"].get(recs[i][0], [])
            print(f"CAMPIONE {recs[i][0]}: {recs[i][4].lstrip(chr(1))[:70]!r}; misure proprie all'importazione: {len(mis)}"
                  + (f", per esempio tipo {mis[0][0]} origine {mis[0][1]} dazio {capitoli[cap]['s'][mis[0][2]]!r}" if mis else ""))
    if problemi:
        print("CONTROLLI FALLITI - NON PUBBLICARE:")
        for p in problemi:
            print("  -", p)
        return 1
    with open(da_pubblicare, "w", encoding="utf-8") as f:
        json.dump(elenco, f, separators=(",", ":"))
    print(f"file da pubblicare: {len(elenco)} (elenco in {da_pubblicare})")
    print("CONTROLLI OK")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except SystemExit:
        raise
    except Exception as e:                      # qualunque imprevisto: niente pubblicazione
        print(f"ERRORE imprevisto: {type(e).__name__}: {e}. NON PUBBLICARE.")
        sys.exit(1)
