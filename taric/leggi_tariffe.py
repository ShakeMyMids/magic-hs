#!/usr/bin/env python3
"""MAGIC HS - legge la «Guida ai servizi e alle tariffe» di DHL Express (PDF) per il calcolatore del trasporto.

Uso (il server lo esegue come sottoprocesso, come aggiorna.py):
  python3 -I leggi_tariffe.py GUIDA.pdf USCITA.json

Prende dal PDF: validita', zonario (paese -> zona e servizi disponibili, dalle spunte), prezzi delle merci di DHL Express
Worldwide e DHL Economy Select all'esportazione e all'importazione con gli scatti oltre le righe della tabella, il costo
dei servizi a orario (12:00, 10:30, 9:00), i limiti di peso e misure e i supplementi a prezzo fisso. Le tariffe dei
documenti e quelle nazionali non servono (la bolla riguarda merci da e verso l'estero) e non si leggono.

Controlli: zonario completo con l'Italia in zona 0, ogni tabella con tutte le zone, prezzi che crescono con il peso e
scatti coerenti con le righe della tabella (cosi' si ricava anche il passo vero: nel PDF del 2026 la tabella
d'esportazione oltre i 30 kg dice «per ogni 0,5 kg», ma i prezzi sono per kg). Se manca una parte essenziale (zonario,
Worldwide) i dati non si installano; le parti accessorie che non si riescono a leggere (Economy Select, limiti,
supplementi, spunte dei servizi) diventano avvisi e il calcolatore lo dice.
Scrive USCITA.json; i dati si installano solo con codice di uscita 0 e ultima riga stampata «CONTROLLI OK».
Solo libreria standard e pypdf: il PDF e' un dato non fidato e si legge in un processo a parte."""
from __future__ import annotations

import json
import logging
import math
import re
import sys
import unicodedata

from pypdf import PdfReader

logging.getLogger("pypdf").setLevel(logging.ERROR)          # «Rotated text discovered» e simili

SERVIZI = ["worldwide", "12:00", "10:30", "9:00", "economy"]       # colonne delle spunte del zonario, in ordine
MESI = ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto", "settembre", "ottobre",
        "novembre", "dicembre"]

# nome del paese nel PDF (in inglese, senza spazi, accenti e segni) -> codice dei paesi del TARIC e nome italiano
PAESI = {
    "albania": ("AL", "Albania"), "algeria": ("DZ", "Algeria"), "americansamoa": ("AS", "Samoa americane"),
    "andorra": ("AD", "Andorra"), "angola": ("AO", "Angola"), "anguilla": ("AI", "Anguilla"),
    "antigua": ("AG", "Antigua e Barbuda"), "argentina": ("AR", "Argentina"), "armenia": ("AM", "Armenia"),
    "aruba": ("AW", "Aruba"), "australia": ("AU", "Australia"), "austria": ("AT", "Austria"),
    "azerbaijan": ("AZ", "Azerbaigian"), "bahamas": ("BS", "Bahamas"), "bahrain": ("BH", "Bahrein"),
    "bangladesh": ("BD", "Bangladesh"), "barbados": ("BB", "Barbados"), "belarus": ("BY", "Bielorussia"),
    "belgium": ("BE", "Belgio"), "belize": ("BZ", "Belize"), "benin": ("BJ", "Benin"), "bermuda": ("BM", "Bermuda"),
    "bhutan": ("BT", "Bhutan"), "bolivia": ("BO", "Bolivia"), "bonaire": ("BQ", "Bonaire"),
    "bosniaandherzegovina": ("BA", "Bosnia ed Erzegovina"), "botswana": ("BW", "Botswana"), "brazil": ("BR", "Brasile"),
    "brunei": ("BN", "Brunei"), "bulgaria": ("BG", "Bulgaria"), "burkinafaso": ("BF", "Burkina Faso"),
    "burundi": ("BI", "Burundi"), "cambodia": ("KH", "Cambogia"), "cameroon": ("CM", "Camerun"),
    "canada": ("CA", "Canada"), "canaryislandsthe": ("IC", "Isole Canarie"), "capeverde": ("CV", "Capo Verde"),
    "caymanislands": ("KY", "Isole Cayman"), "centralafricanrepublic": ("CF", "Repubblica Centrafricana"),
    "chad": ("TD", "Ciad"), "chile": ("CL", "Cile"), "chinapeoplesrepublic": ("CN", "Cina"),
    "colombia": ("CO", "Colombia"), "comoros": ("KM", "Comore"), "congo": ("CG", "Congo"),
    "congodemocraticrepof": ("CD", "Repubblica democratica del Congo"), "cookislands": ("CK", "Isole Cook"),
    "costarica": ("CR", "Costa Rica"), "cotedivoire": ("CI", "Costa d'Avorio"), "croatia": ("HR", "Croazia"),
    "cuba": ("CU", "Cuba"), "curacao": ("CW", "Curaçao"), "cyprus": ("CY", "Cipro"),
    "czechrepublicthe": ("CZ", "Repubblica Ceca"), "denmark": ("DK", "Danimarca"), "djibouti": ("DJ", "Gibuti"),
    "dominica": ("DM", "Dominica"), "dominicanrepublic": ("DO", "Repubblica Dominicana"), "ecuador": ("EC", "Ecuador"),
    "egypt": ("EG", "Egitto"), "elsalvador": ("SV", "El Salvador"), "eritrea": ("ER", "Eritrea"),
    "estonia": ("EE", "Estonia"), "eswatini": ("SZ", "Eswatini"), "ethiopia": ("ET", "Etiopia"),
    "falklandislands": ("FK", "Isole Falkland"), "faroeislands": ("FO", "Isole Fær Øer"), "fiji": ("FJ", "Figi"),
    "finland": ("FI", "Finlandia"), "france": ("FR", "Francia"), "frenchguiana": ("GF", "Guyana francese"),
    "gabon": ("GA", "Gabon"), "gambia": ("GM", "Gambia"), "georgia": ("GE", "Georgia"), "germany": ("DE", "Germania"),
    "ghana": ("GH", "Ghana"), "gibraltar": ("GI", "Gibilterra"), "greece": ("GR", "Grecia"),
    "greenland": ("GL", "Groenlandia"), "grenada": ("GD", "Grenada"), "guadeloupe": ("GP", "Guadalupa"),
    "guam": ("GU", "Guam"), "guatemala": ("GT", "Guatemala"), "guernsey": ("GG", "Guernsey"),
    "guinearepublic": ("GN", "Guinea"), "guineabissau": ("GW", "Guinea-Bissau"),
    "guineaequatorial": ("GQ", "Guinea equatoriale"), "guyanabritish": ("GY", "Guyana"), "haiti": ("HT", "Haiti"),
    "honduras": ("HN", "Honduras"), "hongkongsarchina": ("HK", "Hong Kong"), "hungary": ("HU", "Ungheria"),
    "iceland": ("IS", "Islanda"), "india": ("IN", "India"), "indonesia": ("ID", "Indonesia"),
    "iranislamicrepof": ("IR", "Iran"), "iraq": ("IQ", "Iraq"), "irelandrepof": ("IE", "Irlanda"),
    "israel": ("IL", "Israele"), "italy": ("IT", "Italia"), "jamaica": ("JM", "Giamaica"),
    "japan": ("JP", "Giappone"), "jersey": ("JE", "Jersey"), "jordan": ("JO", "Giordania"),
    "kazakhstan": ("KZ", "Kazakhstan"), "kenya": ("KE", "Kenya"), "kiribati": ("KI", "Kiribati"),
    "koreadprofnorth": ("KP", "Corea del Nord"), "korearepofsouth": ("KR", "Corea del Sud"),
    "kosovo": ("XK", "Kosovo"), "kuwait": ("KW", "Kuwait"), "kyrgyzstan": ("KG", "Kirghizistan"),
    "laopdr": ("LA", "Laos"), "latvia": ("LV", "Lettonia"), "lebanon": ("LB", "Libano"), "lesotho": ("LS", "Lesotho"),
    "liberia": ("LR", "Liberia"), "libya": ("LY", "Libia"), "liechtenstein": ("LI", "Liechtenstein"),
    "lithuania": ("LT", "Lituania"), "luxembourg": ("LU", "Lussemburgo"), "macausarchina": ("MO", "Macao"),
    "madagascar": ("MG", "Madagascar"), "malawi": ("MW", "Malawi"), "malaysia": ("MY", "Malaysia"),
    "maldives": ("MV", "Maldive"), "mali": ("ML", "Mali"), "malta": ("MT", "Malta"),
    "marshallislands": ("MH", "Isole Marshall"), "martinique": ("MQ", "Martinica"), "mauritania": ("MR", "Mauritania"),
    "mauritius": ("MU", "Mauritius"), "mayotte": ("YT", "Mayotte"), "mexico": ("MX", "Messico"),
    "micronesiafedstatesof": ("FM", "Micronesia"), "moldovarepof": ("MD", "Moldova"), "monaco": ("MC", "Monaco"),
    "mongolia": ("MN", "Mongolia"), "montenegrorepof": ("ME", "Montenegro"), "montserrat": ("MS", "Montserrat"),
    "morocco": ("MA", "Marocco"), "mozambique": ("MZ", "Mozambico"), "myanmar": ("MM", "Myanmar"),
    "namibia": ("NA", "Namibia"), "naururepof": ("NR", "Nauru"), "nepal": ("NP", "Nepal"),
    "netherlandsthe": ("NL", "Paesi Bassi"), "nevis": ("KN", "Nevis"), "newcaledonia": ("NC", "Nuova Caledonia"),
    "newzealand": ("NZ", "Nuova Zelanda"), "nicaragua": ("NI", "Nicaragua"), "niger": ("NE", "Niger"),
    "nigeria": ("NG", "Nigeria"), "niue": ("NU", "Niue"), "northmacedonia": ("MK", "Macedonia del Nord"),
    "northernmarianaislands": ("MP", "Isole Marianne settentrionali"), "norway": ("NO", "Norvegia"),
    "oman": ("OM", "Oman"), "pakistan": ("PK", "Pakistan"), "palau": ("PW", "Palau"), "panama": ("PA", "Panama"),
    "papuanewguinea": ("PG", "Papua Nuova Guinea"), "paraguay": ("PY", "Paraguay"), "peru": ("PE", "Perù"),
    "philippinesthe": ("PH", "Filippine"), "poland": ("PL", "Polonia"), "portugal": ("PT", "Portogallo"),
    "puertorico": ("PR", "Porto Rico"), "qatar": ("QA", "Qatar"), "reunionislandof": ("RE", "Riunione"),
    "romania": ("RO", "Romania"), "russianfederationthe": ("RU", "Russia"), "rwanda": ("RW", "Ruanda"),
    "samoa": ("WS", "Samoa"), "sanmarino": ("SM", "San Marino"), "saotomeprincipe": ("ST", "São Tomé e Príncipe"),
    "saudiarabia": ("SA", "Arabia Saudita"), "senegal": ("SN", "Senegal"), "serbiarepof": ("XS", "Serbia"),
    "seychelles": ("SC", "Seychelles"), "sierraleone": ("SL", "Sierra Leone"), "singapore": ("SG", "Singapore"),
    "slovakia": ("SK", "Slovacchia"), "slovenia": ("SI", "Slovenia"), "solomonislands": ("SB", "Isole Salomone"),
    "somaliahargeisa": ("SO", "Somalia (Hargeisa)"), "somaliamogadishu": ("SO", "Somalia (Mogadiscio)"),
    "southafrica": ("ZA", "Sudafrica"), "southsudan": ("SS", "Sud Sudan"), "spain": ("ES", "Spagna"),
    "srilanka": ("LK", "Sri Lanka"), "stbarthelemy": ("BL", "Saint-Barthélemy"), "steustatius": ("BQ", "Sint Eustatius"),
    "sthelena": ("SH", "Sant'Elena"), "stkitts": ("KN", "Saint Kitts"), "stlucia": ("LC", "Santa Lucia"),
    "stmaarten": ("SX", "Sint Maarten"), "stvincent": ("VC", "Saint Vincent e Grenadine"), "sudan": ("SD", "Sudan"),
    "suriname": ("SR", "Suriname"), "sweden": ("SE", "Svezia"), "switzerland": ("CH", "Svizzera"),
    "syria": ("SY", "Siria"), "tahiti": ("PF", "Tahiti (Polinesia francese)"), "taiwanchina": ("TW", "Taiwan"),
    "tajikistan": ("TJ", "Tagikistan"), "tanzania": ("TZ", "Tanzania"), "thailand": ("TH", "Thailandia"),
    "timorleste": ("TL", "Timor Est"), "togo": ("TG", "Togo"), "tonga": ("TO", "Tonga"),
    "trinidadandtobago": ("TT", "Trinidad e Tobago"), "tunisia": ("TN", "Tunisia"), "turkiye": ("TR", "Turchia"),
    "turkmenistan": ("TM", "Turkmenistan"), "turksandcaicosislands": ("TC", "Isole Turks e Caicos"),
    "tuvalu": ("TV", "Tuvalu"), "uganda": ("UG", "Uganda"), "ukraine": ("UA", "Ucraina"),
    "unitedarabemirates": ("AE", "Emirati Arabi Uniti"), "unitedkingdom": ("GB", "Regno Unito"),
    "unitedstatesofamerica": ("US", "Stati Uniti"), "uruguay": ("UY", "Uruguay"), "uzbekistan": ("UZ", "Uzbekistan"),
    "vanuatu": ("VU", "Vanuatu"), "vaticancity": ("VA", "Città del Vaticano"), "venezuela": ("VE", "Venezuela"),
    "vietnam": ("VN", "Vietnam"), "virginislandsbritish": ("VG", "Isole Vergini britanniche"),
    "virginislandsus": ("VI", "Isole Vergini americane"), "yemenrepof": ("YE", "Yemen"), "zambia": ("ZM", "Zambia"),
    "zimbabwe": ("ZW", "Zimbabwe"),
}
# altri nomi possibili nelle guide future
for _alias, _nome in {"czechia": "czechrepublicthe", "czechrepublic": "czechrepublicthe", "turkey": "turkiye",
                      "netherlands": "netherlandsthe", "philippines": "philippinesthe", "russia": "russianfederationthe",
                      "russianfederation": "russianfederationthe", "canaryislands": "canaryislandsthe",
                      "chinapeoplesrepof": "chinapeoplesrepublic", "china": "chinapeoplesrepublic",
                      "hongkong": "hongkongsarchina", "macau": "macausarchina", "taiwan": "taiwanchina",
                      "unitedstates": "unitedstatesofamerica", "usa": "unitedstatesofamerica", "serbia": "serbiarepof",
                      "montenegro": "montenegrorepof", "moldova": "moldovarepof", "ireland": "irelandrepof",
                      "korearepof": "korearepofsouth", "southkorea": "korearepofsouth", "iran": "iranislamicrepof",
                      "reunion": "reunionislandof", "laos": "laopdr", "yemen": "yemenrepof", "nauru": "naururepof",
                      "swaziland": "eswatini", "macedonia": "northmacedonia", "ivorycoast": "cotedivoire",
                      "bruneidarussalam": "brunei", "vatican": "vaticancity"}.items():
    PAESI.setdefault(_alias, PAESI[_nome])


def compatto(s: str, segni: str = ":%€°/,.") -> str:
    """Testo per i confronti: minuscolo, senza accenti e spazi (il PDF spezza le parole: «Assicura zione»); restano le
    cifre con virgole e punti e i segni indicati."""
    s = unicodedata.normalize("NFKD", s.lower())
    return re.sub(r"[^a-z0-9" + re.escape(segni) + "]", "", "".join(c for c in s if not unicodedata.combining(c)))


def chiave_paese(nome: str) -> str:
    """«China, People's Republic» -> «chinapeoplesrepublic», «Türkiye» -> «turkiye»."""
    return compatto(nome, "")


def numero(s: str) -> float:
    """«1.015,71» -> 1015.71; «0,5» -> 0.5; «3.000» -> 3000."""
    s = s.strip().rstrip("*").replace(" ", "")
    if "," in s:
        s = s.replace(".", "").replace(",", ".")
    elif re.fullmatch(r"\d{1,3}(\.\d{3})+", s):
        s = s.replace(".", "")
    return float(s)


class Pagina:
    def __init__(self, n: int, testo: str, immagini: list[tuple[float, float]]):
        self.n = n
        self.righe = [r.rstrip() for r in testo.splitlines()]
        self.compatto = compatto(testo)
        self.immagini = immagini          # (x, y) delle immagini piccole: le spunte del zonario


def leggi_pagine(percorso: str) -> list[Pagina]:
    lettore = PdfReader(percorso)
    out = []
    for n, p in enumerate(lettore.pages, start=1):
        immagini: list[tuple[float, float]] = []

        def visita(op, args, cm, tm, immagini=immagini):
            if op == b"Do" and 2 < cm[0] < 20 and 2 < cm[3] < 20:          # le spunte, non le cornici a tutta pagina
                immagini.append((round(cm[4], 1), round(cm[5], 1)))
        p.extract_text(visitor_operand_before=visita)
        out.append(Pagina(n, p.extract_text(extraction_mode="layout"), immagini))
    return out


# ------------------------------------------------------------------ zonario
RIGA_PAESE = re.compile(r"^\s?(\S.*?)\s{2,}(\d|\d/\d\*?)\s*$")


def zonario(pagine: list[Pagina], avvisi: list[str]) -> list[dict]:
    paesi: list[dict] = []
    sconosciuti = []
    spunte_lette = True
    colonne = None
    pagine_z = [p for p in pagine if "paese/territorio" in p.compatto and "zona" in p.compatto]
    # colonne delle spunte: le x delle immagini di tutte le pagine del zonario, raggruppate
    xs = sorted({round(x) for p in pagine_z for x, _ in p.immagini})
    gruppi: list[list[int]] = []
    for x in xs:
        if gruppi and x - gruppi[-1][-1] <= 4:
            gruppi[-1].append(x)
        else:
            gruppi.append([x])
    if len(gruppi) == len(SERVIZI):
        colonne = [sum(g) / len(g) for g in gruppi]
    else:
        spunte_lette = False
    for p in pagine_z:
        righe = []
        for r in p.righe:
            m = RIGA_PAESE.match(r)
            if m and not re.search(r"\d{3}", m.group(1)):
                righe.append((m.group(1).strip(), m.group(2)))
        servizi_riga: list[list[str] | None] = [None] * len(righe)
        if colonne:
            per_colonna: dict[int, list[float]] = {}
            for x, y in p.immagini:
                k = min(range(len(colonne)), key=lambda i: abs(colonne[i] - x))
                per_colonna.setdefault(k, []).append(y)
            ww = sorted(per_colonna.get(0, []), reverse=True)        # Worldwide raggiunge tutti i paesi: una spunta per riga
            if len(ww) == len(righe):
                servizi_riga = [["worldwide"] for _ in righe]
                for k, ys in per_colonna.items():
                    if k == 0:
                        continue
                    for y in ys:
                        i = min(range(len(ww)), key=lambda j: abs(ww[j] - y))
                        if abs(ww[i] - y) < 2.5:
                            servizi_riga[i].append(SERVIZI[k])
                        else:
                            spunte_lette = False
            else:
                spunte_lette = False
        for (nome, zona), servizi in zip(righe, servizi_riga):
            chiave = chiave_paese(nome)
            codice, nome_it = PAESI.get(chiave, ("", ""))
            if not codice:
                sconosciuti.append(re.sub(r"\s+", " ", nome))
            if "/" in zona:                                          # Regno Unito: zona 2, Irlanda del Nord zona 3
                z1, z2 = (int(z) for z in zona.rstrip("*").split("/"))
                paesi.append({"codice": codice, "nome": nome_it or nome, "zona": z1, "servizi": servizi})
                if chiave == "unitedkingdom":
                    paesi.append({"codice": "XI", "nome": "Regno Unito (Irlanda del Nord)", "zona": z2, "servizi": servizi})
                continue
            paesi.append({"codice": codice, "nome": nome_it or nome, "zona": int(zona), "servizi": servizi})
    if sconosciuti:
        avvisi.append("Paesi del zonario non riconosciuti (restano con il nome del PDF): " + ", ".join(sconosciuti))
    if paesi and (not spunte_lette or any(p["servizi"] is None for p in paesi)):
        avvisi.append("Spunte dei servizi del zonario non lette: la disponibilità di 12:00, 10:30, 9:00 ed Economy Select "
                      "per paese non è controllata.")
        for p in paesi:
            p["servizi"] = None
    return paesi


# ------------------------------------------------------------------ tabelle dei prezzi
# un prezzo: «47,21», «1.015,71» e anche «1485,82» (nel PDF del 2026 una cella non ha il punto delle migliaia)
PREZZO = r"\d+(?:\.\d{3})*,\d{2}"
RIGA_PREZZI = re.compile(r"^\s*(\d{1,4}(?:,\d)?)\s+((?:" + PREZZO + r"\s*)+)$")
RIGA_SCATTO = re.compile(r"^\s*(Oltre\s+i\s+[\d.,]+\*?|[\d.,]+\s*-\s*[\d.,]+\*?)\s+((?:" + PREZZO + r"\s*)+)$", re.I)


def prezzi(testo: str) -> list[float]:
    return [numero(x) for x in testo.split()]


def tabella(pagine: list[Pagina]) -> dict | None:
    """Le righe e gli scatti delle merci di un prodotto (le pagine sono quelle del prodotto, in ordine)."""
    zone: list[int] = []
    blocchi: list[list[tuple[float, list[float]]]] = []
    scatti: list[dict] = []
    passo_gruppo = None
    gruppo = 0
    for p in pagine:
        for r in p.righe:
            if not zone and re.search(r"Peso\s+in\s+kg", r) and "Zona" in r:
                zone = [int(z) for z in re.findall(r"Zona\s+(\d+)", r)]
                continue
            c = compatto(r)
            m = re.match(r"perogni([\d,]+)kgaggiuntivo", c)
            if m:
                passo_gruppo = numero(m.group(1))
                gruppo += 1
                continue
            m = RIGA_SCATTO.match(r)
            if m and zone:
                pr = prezzi(m.group(2))
                if len(pr) != len(zone):
                    raise ValueError(f"pagina {p.n}: scatto con {len(pr)} prezzi invece di {len(zone)}: {r.strip()}")
                lim = m.group(1)
                if lim.lower().startswith("oltre"):
                    da, a = numero(lim.split()[-1]), None
                else:
                    x, y = (numero(v) for v in lim.split("-"))
                    da, a = math.floor(x), y
                scatti.append({"da": da, "a": a, "passo": passo_gruppo, "gruppo": gruppo, "prezzi": pr})
                continue
            m = RIGA_PREZZI.match(r)
            if m and zone:
                peso, pr = numero(m.group(1)), prezzi(m.group(2))
                if len(pr) != len(zone):
                    continue                                        # numeri di pagina e altre righe che non sono prezzi
                if not blocchi or peso <= blocchi[-1][-1][0]:
                    blocchi.append([])                              # nuovo blocco: prima i documenti, poi le merci
                blocchi[-1].append((peso, pr))
    if not zone or not blocchi:
        return None
    righe = blocchi[-1]                                             # le merci sono l'ultimo blocco
    for i, s in enumerate(scatti):                                  # «Oltre i 10» vale fino allo scatto dopo
        if s["a"] is None and i + 1 < len(scatti) and scatti[i + 1]["da"] > s["da"]:
            s["a"] = scatti[i + 1]["da"]
    return {"zone": zone, "righe": [[w, pr] for w, pr in righe], "scatti": scatti, "unita": min(righe[0][0], 1.0)}


def prezzo(tab: dict, iz: int, peso: float) -> float | None:
    """Prezzo della zona di indice iz per un peso: la riga della tabella, altrimenti la riga piu' vicina sotto piu' gli
    scatti (lo stesso calcolo di js/trasporto.js). None se il peso e' oltre la tabella."""
    righe = tab["righe"]
    if peso <= righe[0][0]:
        return righe[0][1][iz]
    base = max((r for r in righe if r[0] <= peso + 1e-9), key=lambda r: r[0])
    if abs(base[0] - peso) < 1e-9:
        return base[1][iz]
    totale, cur = base[1][iz], base[0]
    while cur < peso - 1e-9:
        s = next((s for s in tab["scatti"] if s["da"] - 1e-9 <= cur < (s["a"] if s["a"] is not None else math.inf) - 1e-9), None)
        if s is None:
            dopo = [r for r in righe if r[0] > cur]
            return dopo[0][1][iz] if dopo else None
        fino = min(peso, s["a"] if s["a"] is not None else math.inf)
        passi = math.ceil((fino - cur) / s["passo"] - 1e-9)
        totale += passi * s["prezzi"][iz]
        cur += passi * s["passo"]
    return round(totale, 2)


def controlla_tabella(nome: str, tab: dict, errori: list[str]) -> None:
    zone, righe = tab["zone"], tab["righe"]
    if zone != list(range(1, len(zone) + 1)):
        errori.append(f"{nome}: zone non consecutive {zone}")
    pesi = [r[0] for r in righe]
    if pesi != sorted(set(pesi)):
        errori.append(f"{nome}: pesi non in ordine")
    if pesi[-1] < 30:
        errori.append(f"{nome}: la tabella finisce a {pesi[-1]} kg")
    for iz, z in enumerate(zone):
        col = [r[1][iz] for r in righe]
        if any(v <= 0 for v in col) or any(b <= a for a, b in zip(col, col[1:])):
            errori.append(f"{nome}: i prezzi della zona {z} non crescono con il peso")
    # passo vero di ogni scatto: quello che rende i prezzi della tabella uguali al calcolo con gli scatti
    for s in tab["scatti"]:
        s["verificato"] = False
        dentro = [w for w in pesi if s["da"] < w <= (s["a"] if s["a"] is not None else math.inf)]
        if not dentro:
            continue
        for passo in [s["passo"], 0.5, 1.0, 5.0]:
            if passo is None:
                continue
            s["passo"] = passo
            prova = {"righe": [r for r in righe if r[0] <= s["da"]], "scatti": [s]}
            if all(abs(prezzo(prova, iz, w) - next(r[1][iz] for r in righe if r[0] == w)) < 0.011
                   for w in dentro for iz in range(len(zone))):
                s["verificato"] = True
                break
        else:
            errori.append(f"{nome}: lo scatto da {s['da']} kg non torna con i prezzi della tabella")
    for s in tab["scatti"]:                                         # oltre le righe: il passo verificato del gruppo
        if not s["verificato"]:
            fratelli = [t for t in tab["scatti"] if t["gruppo"] == s["gruppo"] and t["verificato"]]
            if fratelli:
                s["passo"] = fratelli[0]["passo"]
        if not s["passo"] or s["passo"] <= 0:
            errori.append(f"{nome}: passo mancante per lo scatto da {s['da']} kg")
    for s in tab["scatti"]:
        s.pop("verificato", None)
        s.pop("gruppo", None)
        if any(v <= 0 for v in s["prezzi"]):
            errori.append(f"{nome}: scatto da {s['da']} kg con prezzi non validi")


def prodotti(pagine: list[Pagina], errori: list[str], avvisi: list[str]) -> dict:
    per: dict[tuple[str, str], list[Pagina]] = {}
    for p in pagine:
        for flusso, chiave in (("export", "tariffediesportazioneperzona"), ("import", "tariffediimportazioneperzona")):
            if chiave not in p.compatto:
                continue
            # il prodotto e' nel titolo subito dopo «Tariffe di ... per zona e per prodotto»
            i = next(i for i, r in enumerate(p.righe) if chiave in compatto(r))
            titolo = compatto(" ".join(p.righe[i + 1:i + 4]))
            prodotto = "economy" if "economyselect" in titolo else "worldwide" if "worldwide" in titolo else ""
            if prodotto:
                per.setdefault((prodotto, flusso), []).append(p)
    out: dict[str, dict] = {"worldwide": {}, "economy": {}}
    for prodotto in out:
        for flusso in ("export", "import"):
            nome = f"{'DHL Express Worldwide' if prodotto == 'worldwide' else 'DHL Economy Select'} {flusso}"
            pg = per.get((prodotto, flusso))
            try:
                tab = tabella(pg) if pg else None
            except ValueError as e:
                tab = None
                (errori if prodotto == "worldwide" else avvisi).append(f"{nome}: {e}")
            if tab is None:
                (errori if prodotto == "worldwide" else avvisi).append(f"{nome}: tabella non trovata nel PDF")
                continue
            prima = len(errori)
            controlla_tabella(nome, tab, errori)
            if prodotto == "economy" and len(errori) > prima:       # Economy Select e' accessorio: si toglie e basta
                avvisi.extend(errori[prima:])
                del errori[prima:]
                continue
            out[prodotto][flusso] = tab
    return out


# ------------------------------------------------------------------ servizi a orario, limiti, supplementi, validita'
def orari(pagine: list[Pagina]) -> dict:
    out: dict[str, dict[str, float]] = {}
    for p in pagine:
        for m in re.finditer(r"dhlexpress(\d{1,2}:\d{2}).{0,200}?aggiungere([\d,]+)€alcostodidhlexpressworldwide(export|import)",
                             p.compatto):
            out.setdefault(m.group(3), {})[m.group(1)] = numero(m.group(2))
    return out


ETICHETTE_LIMITI = {
    "pesomassimopercollo": "collo_kg", "numeromassimocolli": "colli", "dimensionemassimapercollo": "misure",
    "pesototalemassimoperspedizione": "spedizione_kg", "pesomassimoperpallet": "pallet_kg",
    "dimensionemassimaperpallet": "pallet_misure",
}
COLONNE_LIMITI = [["worldwide"], ["12:00"], ["10:30", "9:00"], ["economy"]]


def limiti(pagine: list[Pagina], avvisi: list[str]) -> dict:
    out: dict[str, dict] = {}
    p = next((p for p in pagine if "panoramicadeiserviziinternazionali" in p.compatto), None)
    if p is None:
        avvisi.append("Limiti di peso e misure dei servizi non trovati: il calcolatore non li controlla.")
        return out
    for r in p.righe:
        c = compatto(r)
        chiave = next((v for k, v in ETICHETTE_LIMITI.items() if c.startswith(k)), None)
        if not chiave:
            continue
        celle = re.split(r"\s{2,}", r.strip())[1:]
        if chiave in ("misure", "pallet_misure"):
            celle = [x for x in celle if re.search(r"\d+\s*x\s*\d+\s*x\s*\d+", x) or "nonaccettabil" in compatto(x)]
        else:
            celle = [x for x in celle if re.search(r"\d|–|-", x) or "nonaccettabil" in compatto(x)]
        if len(celle) != len(COLONNE_LIMITI):
            continue
        for servizi, cella in zip(COLONNE_LIMITI, celle):
            if "nonaccettabil" in compatto(cella):
                val: object = 0                                     # pallet non accettati
            elif chiave in ("misure", "pallet_misure"):
                val = sorted((int(v) for v in re.findall(r"\d+", cella)), reverse=True)[:3]
            elif re.fullmatch(r"[–-]", cella.strip()):
                val = None                                          # nessun limite
            else:
                val = numero(re.sub(r"[^\d.,]", "", cella))
                val = int(val) if val == int(val) else val
            for s in servizi:
                out.setdefault(s, {})[chiave] = val
    if not out or any(len(v) < len(ETICHETTE_LIMITI) for v in out.values()):
        avvisi.append("Limiti di peso e misure dei servizi letti solo in parte: il calcolatore controlla quelli trovati.")
    return out


def supplementi(pagine: list[Pagina], avvisi: list[str]) -> dict:
    """I costi delle tabelle «Servizi opzionali» e «Supplementi» (le pagine con la colonna «Metodo di addebito»);
    per i supplementi che hanno due prezzi vale quello «International»."""
    righe = [r for p in pagine if "metododiaddebito" in p.compatto for r in p.righe]
    cc = [compatto(r) for r in righe]
    out: dict[str, object] = {}

    def intorno(etichetta: str, cerca: str) -> str:
        """Il testo della riga con l'etichetta e di quelle vicine (le celle lunghe vanno a capo) in cui c'e' «cerca»."""
        for i, c in enumerate(cc):
            if etichetta in c:
                t = "".join(cc[max(0, i - 1):i + 2]) if "international" not in c else c + "".join(cc[i + 1:i + 2])
                if re.search(cerca, t):
                    return t
        return ""

    def internazionale(etichetta: str) -> float | None:
        m = re.search(r"international:([\d,]+)€", intorno(etichetta, r"international:[\d,]+€"))
        return numero(m.group(1)) if m else None

    for chiave, etichetta in (("extra_peso", "colloextramisurapeso"), ("extra_misura", "colloextramisuradimensione"),
                              ("non_conveyable", "nonconveyablepiece"), ("pallet_non_sovrapponibile", "palletnonsovrapponibile"),
                              ("sabato", "consegnaalsabato")):
        v = internazionale(etichetta)
        if v is not None:
            out[chiave] = v
    t = intorno("consegnaareeremote", r"international:[\d,]+€alkg")
    m = re.search(r"international:([\d,]+)€alkg.*?minimo.*?([\d,]+)€", t)
    if m:
        out["aree_remote"] = {"per_kg": numero(m.group(1)), "minimo": numero(m.group(2))}
    t = intorno("assicurazione", r"€o[\d,]+%")
    m = re.search(r"([\d,]+)€o([\d,]+)%", t)
    if m:
        out["assicurazione"] = {"minimo": numero(m.group(1)), "percentuale": numero(m.group(2))}
    t = intorno("lithiumionpi966", r"lithiumionpi966.*?[\d,]+€")
    m = re.search(r"lithiumionpi966.*?([\d,]+)€", t)
    if m:
        out["batterie_litio"] = numero(m.group(1))
    mancano = [k for k in ("extra_peso", "extra_misura", "non_conveyable", "pallet_non_sovrapponibile", "sabato",
                           "aree_remote", "assicurazione", "batterie_litio") if k not in out]
    if mancano:
        avvisi.append("Supplementi non trovati nel PDF (il calcolatore non li offre): " + ", ".join(mancano))
    return out


def validita(pagine: list[Pagina], avvisi: list[str]) -> tuple[str, str]:
    data, titolo = "", ""
    for p in pagine:
        m = re.search(r"validita:(\d{1,2})°?([a-z]+)(\d{4})", p.compatto)
        if m and m.group(2) in MESI and not data:
            data = f"{m.group(3)}-{MESI.index(m.group(2)) + 1:02d}-{int(m.group(1)):02d}"
        t = re.search(r"guidaaiserviziealletariffe(\d{4}):?(italia)?", p.compatto)
        if t and not titolo:
            titolo = f"DHL Express, Guida ai servizi e alle tariffe {t.group(1)}" + (": Italia" if t.group(2) else "")
    if not data:
        avvisi.append("Data di validità non trovata nel PDF.")
    return data, titolo or "DHL Express, Guida ai servizi e alle tariffe"


def leggi(percorso: str) -> tuple[dict, list[str], list[str]]:
    errori: list[str] = []
    avvisi: list[str] = []
    pagine = leggi_pagine(percorso)
    paesi = zonario(pagine, avvisi)
    if len(paesi) < 200:
        errori.append(f"zonario: {len(paesi)} paesi letti (ne servono almeno 200)")
    italia = [p for p in paesi if p["codice"] == "IT"]
    if not italia or italia[0]["zona"] != 0:
        errori.append("zonario: l'Italia non è in zona 0")
    prod = prodotti(pagine, errori, avvisi)
    for flusso in ("export", "import"):
        tab = prod["worldwide"].get(flusso)
        if tab:
            mancano = sorted({p["zona"] for p in paesi if p["zona"]} - set(tab["zone"]))
            if mancano:
                errori.append(f"DHL Express Worldwide {flusso}: mancano i prezzi delle zone {mancano}")
    if not prod["economy"]:
        avvisi.append("DHL Economy Select non letto: il calcolatore offre solo DHL Express.")
    o = orari(pagine)
    if not o:
        avvisi.append("Costi dei servizi a orario (12:00, 10:30, 9:00) non trovati: il calcolatore non li offre.")
    data, titolo = validita(pagine, avvisi)
    dati = {"titolo": titolo, "validita": data, "valuta": "EUR", "paesi": paesi, "prodotti": prod, "orari": o,
            "limiti": limiti(pagine, avvisi), "supplementi": supplementi(pagine, avvisi), "avvisi": avvisi}
    return dati, errori, avvisi


NOMI_SUPPLEMENTI = {"extra_peso": "collo extra misura (peso)", "extra_misura": "collo extra misura (dimensione)",
                    "non_conveyable": "collo non trasportabile su nastro", "pallet_non_sovrapponibile": "pallet non sovrapponibile",
                    "sabato": "consegna al sabato", "aree_remote": "aree remote", "assicurazione": "assicurazione",
                    "batterie_litio": "batterie al litio"}


def riepilogo(d: dict) -> list[str]:
    valida = "/".join(reversed(d["validita"].split("-"))) if d["validita"] else ""
    out = [f"{d['titolo']}, " + (f"valida dal {valida}" if valida else "validità non indicata"),
           f"Zonario: {len(d['paesi'])} paesi, zone da {min(p['zona'] for p in d['paesi'])} a {max(p['zona'] for p in d['paesi'])}"]
    for prodotto, nome in (("worldwide", "DHL Express Worldwide"), ("economy", "DHL Economy Select")):
        for flusso, tab in d["prodotti"].get(prodotto, {}).items():
            fino = max((s["a"] or 0) for s in tab["scatti"]) if tab["scatti"] else tab["righe"][-1][0]
            out.append(f"{nome} {flusso}: {len(tab['righe'])} righe fino a {tab['righe'][-1][0]:g} kg, "
                       f"{len(tab['scatti'])} scatti fino a {fino:g} kg, zone 1-{len(tab['zone'])}")
    for flusso, v in d["orari"].items():
        out.append(f"Servizi a orario {flusso}: " + ", ".join(f"{k} +{x:g} €" for k, x in v.items()))
    out.append("Supplementi: " + (", ".join(NOMI_SUPPLEMENTI.get(k, k) for k in d["supplementi"]) or "nessuno"))
    return out


def main(argv: list[str]) -> int:
    if len(argv) != 3:
        print("uso: leggi_tariffe.py GUIDA.pdf USCITA.json")
        return 2
    try:
        dati, errori, avvisi = leggi(argv[1])
    except Exception as e:                                          # PDF illeggibile: non si installa niente
        print(f"ERRORE lettura del PDF: {type(e).__name__}: {e}"[:500])
        return 1
    for r in riepilogo(dati) if not errori else []:
        print(r)
    for a in avvisi:
        print("avviso: " + a)
    if errori:
        print("ERRORE controlli non superati:")
        for e in errori:
            print("- " + e)
        return 1
    with open(argv[2], "w", encoding="utf-8") as f:
        json.dump(dati, f, ensure_ascii=False, separators=(",", ":"))
    print("CONTROLLI OK")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
