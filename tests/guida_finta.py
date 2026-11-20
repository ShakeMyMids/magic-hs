"""Guida ai servizi e alle tariffe di DHL Express finta, in PDF, per le prove del calcolatore del trasporto
(tests/test_trasporto.py e la prova nel browser, che la carica da Gestione). Ha la stessa struttura della guida vera
(zonario con le spunte dei servizi, tabelle con i blocchi dei documenti e delle merci, scatti, servizi a orario, limiti,
supplementi), ma prezzi inventati e coerenti, cosi' le prove non dipendono dal PDF di DHL.

Prezzi (zona z, peso w): Worldwide esportazione fino a 10 kg 40 + 5z + 9w(1 + z/10); da 10 a 30 kg scatti per 0,5 kg di
6 + z/4 e 6,5 + z/5; da 30 kg in su per kg 9 + z e, oltre i 70, 16 + z (nella tabella scritti «per ogni 0,5 kg», come
nella guida del 2026). Importazione: gli stessi piu' il 10 %. Economy Select (zone 1-5): fino a 30 kg 50 + 4z + 3w, poi per
kg 2,5 + z/10, oltre i 70 per 5 kg 18 + z, oltre i 300 per 5 kg 22 + z.
Uso: python tests/guida_finta.py guida.pdf"""
from __future__ import annotations

import sys
import zlib
from pathlib import Path

ALTEZZA = 842
# nomi del zonario (come li scrive DHL, in inglese) con la zona e i servizi oltre a Worldwide
PAESI = [("Italy", "0", "12 1030 9 es"), ("San Marino", "0", "es"), ("Vatican City", "0", ""),
         ("China, People's Republic", "7", "12 1030"), ("United States of America", "8", "12 1030"),
         ("Switzerland", "5", "12 1030 9 es"), ("United Kingdom", "2/3*", "12 1030 9 es"), ("Türkiye", "5", "12 es"),
         ("Germany", "1", "12 1030 9 es"), ("France", "1", "12 1030 es"), ("Japan", "7", "12"), ("India", "7", "12"),
         ("Bahrain", "7", "12 1030 es"), ("Australia", "8", "12 1030 9"), ("Norway", "5", "12 es"), ("Brazil", "8", "12")]
ALTRI = ["Albania", "Algeria", "American Samoa", "Andorra", "Angola", "Anguilla", "Antigua", "Argentina", "Armenia", "Aruba",
         "Austria", "Azerbaijan", "Bahamas", "Bangladesh", "Barbados", "Belarus", "Belgium", "Belize", "Benin", "Bermuda",
         "Bhutan", "Bolivia", "Bonaire", "Bosnia and Herzegovina", "Botswana", "Brunei", "Bulgaria", "Burkina Faso", "Burundi",
         "Cambodia", "Cameroon", "Canada", "Canary Islands, The", "Cape Verde", "Cayman Islands", "Central African Republic",
         "Chad", "Chile", "Colombia", "Comoros", "Congo", "Congo, Democratic Rep. of", "Cook Islands", "Costa Rica",
         "Cote d'Ivoire", "Croatia", "Cuba", "Curacao", "Cyprus", "Czech Republic, The", "Denmark", "Djibouti", "Dominica",
         "Dominican Republic", "Ecuador", "Egypt", "El Salvador", "Eritrea", "Estonia", "Eswatini", "Ethiopia",
         "Falkland Islands", "Faroe Islands", "Fiji", "Finland", "French Guiana", "Gabon", "Gambia", "Georgia", "Ghana",
         "Gibraltar", "Greece", "Greenland", "Grenada", "Guadeloupe", "Guam", "Guatemala", "Guernsey", "Guinea Republic",
         "Guinea-Bissau", "Guinea-Equatorial", "Guyana (British)", "Haiti", "Honduras", "Hong Kong SAR China", "Hungary",
         "Iceland", "Indonesia", "Iran, Islamic Rep. of", "Iraq", "Ireland, Rep. of", "Israel", "Jamaica", "Jersey", "Jordan",
         "Kazakhstan", "Kenya", "Kiribati", "Korea, D.P.R. of (North)", "Korea, Rep. of (South)", "Kosovo", "Kuwait",
         "Kyrgyzstan", "Lao P.D.R.", "Latvia", "Lebanon", "Lesotho", "Liberia", "Libya", "Liechtenstein", "Lithuania",
         "Luxembourg", "Macau SAR China", "Madagascar", "Malawi", "Malaysia", "Maldives", "Mali", "Malta", "Marshall Islands",
         "Martinique", "Mauritania", "Mauritius", "Mayotte", "Mexico", "Micronesia, Fed. States of", "Moldova, Rep. of",
         "Monaco", "Mongolia", "Montenegro, Rep. of", "Montserrat", "Morocco", "Mozambique", "Myanmar", "Namibia",
         "Nauru, Rep. of", "Nepal", "Netherlands, The", "Nevis", "New Caledonia", "New Zealand", "Nicaragua", "Niger",
         "Nigeria", "Niue", "North Macedonia", "Northern Mariana Islands", "Oman", "Pakistan", "Palau", "Panama",
         "Papua New Guinea", "Paraguay", "Peru", "Philippines, The", "Poland", "Portugal", "Puerto Rico", "Qatar",
         "Reunion, Island of", "Romania", "Russian Federation, The", "Rwanda", "Samoa", "Sao Tome & Principe", "Saudi Arabia",
         "Senegal", "Serbia, Rep. of", "Seychelles", "Sierra Leone", "Singapore", "Slovakia", "Slovenia", "Solomon Islands",
         "Somalia Hargeisa", "Somalia Mogadishu", "South Africa", "South Sudan", "Spain", "Sri Lanka", "St. Barthelemy",
         "St. Eustatius", "St. Helena", "St. Kitts", "St. Lucia", "St. Maarten", "St. Vincent", "Sudan", "Suriname", "Sweden",
         "Syria", "Tahiti", "Taiwan, China", "Tajikistan", "Tanzania", "Thailand", "Timor-Leste", "Togo", "Tonga",
         "Trinidad and Tobago", "Tunisia", "Turkmenistan", "Turks and Caicos Islands", "Tuvalu", "Uganda", "Ukraine",
         "United Arab Emirates", "Uruguay", "Uzbekistan", "Vanuatu", "Venezuela", "Vietnam", "Virgin Islands (British)",
         "Virgin Islands (US)", "Yemen, Rep. of", "Zambia", "Zimbabwe"]


def it(v: float) -> str:
    """1015.7 -> «1.015,70»"""
    s = f"{v:,.2f}"
    return s.replace(",", "X").replace(".", ",").replace("X", ".")


def peso(w: float) -> str:
    return f"{w:g}".replace(".", ",")


class Pdf:
    def __init__(self) -> None:
        self.pagine: list[tuple[list[tuple[float, float, str, float]], list[tuple[float, float]]]] = []

    def pagina(self) -> tuple[list, list]:
        self.pagine.append(([], []))
        return self.pagine[-1]

    def scrivi(self, percorso: Path) -> None:
        oggetti: list[bytes] = []

        def aggiungi(b: bytes) -> int:
            oggetti.append(b)
            return len(oggetti)
        font = aggiungi(b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>")
        immagine = aggiungi(b"<< /Type /XObject /Subtype /Image /Width 1 /Height 1 /ColorSpace /DeviceGray "
                            b"/BitsPerComponent 8 /Length 1 >>\nstream\n\x00\nendstream")
        pagine_id = len(oggetti) + 1 + 2 * len(self.pagine)
        figli = []
        for testi, spunte in self.pagine:
            flusso = []
            for x, y, t, dim in testi:
                s = t.encode("cp1252").replace(b"\\", b"\\\\").replace(b"(", b"\\(").replace(b")", b"\\)")
                flusso.append(b"BT /F1 %.1f Tf %.1f %.1f Td (" % (dim, x, y) + s + b") Tj ET")
            for x, y in spunte:
                flusso.append(b"q 4.3 0 0 4.5 %.1f %.1f cm /Im0 Do Q" % (x, y))
            dati = zlib.compress(b"\n".join(flusso))
            cont = aggiungi(b"<< /Length %d /Filter /FlateDecode >>\nstream\n" % len(dati) + dati + b"\nendstream")
            figli.append(aggiungi(b"<< /Type /Page /Parent %d 0 R /MediaBox [0 0 595 842] /Contents %d 0 R "
                                  b"/Resources << /Font << /F1 %d 0 R >> /XObject << /Im0 %d 0 R >> >> >>"
                                  % (pagine_id, cont, font, immagine)))
        assert aggiungi(b"<< /Type /Pages /Kids [" + b" ".join(b"%d 0 R" % f for f in figli) + b"] /Count %d >>"
                        % len(figli)) == pagine_id
        radice = aggiungi(b"<< /Type /Catalog /Pages %d 0 R >>" % pagine_id)
        out = bytearray(b"%PDF-1.7\n")
        posizioni = []
        for n, o in enumerate(oggetti, start=1):
            posizioni.append(len(out))
            out += b"%d 0 obj\n" % n + o + b"\nendobj\n"
        xref = len(out)
        out += b"xref\n0 %d\n0000000000 65535 f \n" % (len(oggetti) + 1)
        out += b"".join(b"%010d 00000 n \n" % p for p in posizioni)
        out += b"trailer\n<< /Size %d /Root %d 0 R >>\nstartxref\n%d\n%%%%EOF\n" % (len(oggetti) + 1, radice, xref)
        percorso.write_bytes(bytes(out))


def intestazione(testi: list, n: int) -> None:
    testi.append((40, 816, f"{n}   DHL Express Guida ai Servizi e alle Tariffe 2026: Italia", 7))
    testi.append((40, 790, "ZONE E TARIFFE", 16))


def fattore(imp: bool) -> float:
    return 1.1 if imp else 1.0


def rate_worldwide(z: int, imp: bool) -> list[float]:
    """Gli scatti della zona: oltre i 10 e oltre i 20 (per 0,5 kg), 30-70 e oltre i 70 (per kg)."""
    return [round(v * fattore(imp), 2) for v in (6 + z / 4, 6.5 + z / 5, 9 + z, 16 + z)]


def worldwide(w: float, z: int, imp: bool) -> float:
    r = rate_worldwide(z, imp)
    if w <= 10:
        return round((40 + 5 * z + 9 * w * (1 + z / 10)) * fattore(imp), 2)
    if w <= 20:
        return round(worldwide(10, z, imp) + (w - 10) * 2 * r[0], 2)
    if w <= 30:
        return round(worldwide(20, z, imp) + (w - 20) * 2 * r[1], 2)
    if w <= 70:
        return round(worldwide(30, z, imp) + (w - 30) * r[2], 2)
    return round(worldwide(70, z, imp) + (w - 70) * r[3], 2)


def rate_economy(z: int, imp: bool) -> list[float]:
    """Oltre i 30 (per kg), oltre i 70 e oltre i 300 (per 5 kg)."""
    return [round(v * fattore(imp), 2) for v in (2.5 + z / 10, 18 + z, 22 + z)]


def economy(w: float, z: int, imp: bool) -> float:
    r = rate_economy(z, imp)
    if w <= 30:
        return round((50 + 4 * z + 3 * w) * fattore(imp), 2)
    if w <= 70:
        return round(economy(30, z, imp) + (w - 30) * r[0], 2)
    return round(economy(70, z, imp) + (w - 70) / 5 * r[1], 2)


def tabella(pdf: Pdf, n: int, flusso: str, prodotto: str, rompi: str = "") -> int:
    """Una pagina di tariffe; restituisce il numero della pagina successiva."""
    imp = flusso == "import"
    testi, _ = pdf.pagina()
    intestazione(testi, n)
    titolo = "Tariffe di importazione per zona e per prodotto" if imp else "Tariffe di esportazione per zona e per prodotto"
    nome = ("DHL EXPRESS WORLDWIDE" + (" IMPORT" if imp else "")) if prodotto == "worldwide" else ("DHL ECONOMY SELECT" + (" IMPORT" if imp else ""))
    testi += [(40, 760, titolo, 8), (40, 745, nome, 14)]
    zone = range(1, 10) if prodotto == "worldwide" else range(1, 6)
    y = 725
    riga = lambda etichetta, valori: (testi.append((40, y, etichetta, 7)),
                                      [testi.append((110 + 52 * i, y, v, 7)) for i, v in enumerate(valori)])
    riga("Peso in kg", [f"Zona {z}" for z in zone])
    y -= 11
    prezzo = worldwide if prodotto == "worldwide" else economy
    if prodotto == "worldwide":
        testi.append((40, y, "Documenti solo fino a 2 kg", 7))
        y -= 10
        for w in (0.5, 1, 1.5, 2):
            riga(peso(w), [it(prezzo(w, z, imp) - 5) for z in zone])
            y -= 10
        testi.append((40, y, "Documenti solo fino a 2 kg", 7))         # la guida del 2026 ripete l'etichetta
        y -= 10
        pesi = [x / 2 for x in range(1, 21)] + list(range(11, 31)) + [40, 50, 60, 70]
    else:
        testi.append((40, y, "Documenti e materiale non documentale a partire da 1 kg", 7))
        y -= 10
        pesi = list(range(1, 31)) + [40, 50, 60, 70, 80, 90, 100]
    for w in pesi:
        valori = [prezzo(w, z, imp) for z in zone]
        if rompi == "scatto" and w == 15:
            valori[0] += 3
        riga(peso(w), [it(v) for v in valori])
        y -= 10
    if prodotto == "worldwide":
        testi.append((40, y, "Per ogni 0,5 kg aggiuntivo", 7)); y -= 10
        riga("Oltre i 10", [it(rate_worldwide(z, imp)[0]) for z in zone]); y -= 10
        riga("Oltre i 20", [it(rate_worldwide(z, imp)[1]) for z in zone]); y -= 10
        testi.append((40, y, "Per ogni 0,5 kg aggiuntivo" if not imp else "Per ogni 1 kg aggiuntivo", 7)); y -= 10
        riga("30,1 - 70,0", [it(rate_worldwide(z, imp)[2]) for z in zone]); y -= 10
        riga("70,1 - 300,0", [it(rate_worldwide(z, imp)[3]) for z in zone]); y -= 10
        riga("300,1 - 3.000*", [it(rate_worldwide(z, imp)[3]) for z in zone]); y -= 14
        for ora, euro in (("12:00", 11), ("10:30", 15), ("9:00", 35)):
            testi.append((40, y, f"DHL Express {ora} – Consegna entro le ore {ora} del primo giorno lavorativo disponibile.", 7)); y -= 10
            testi.append((40, y, f"Aggiungere {euro} € al costo di DHL Express Worldwide {'Import' if imp else 'Export'}.", 7)); y -= 12
    else:
        testi.append((40, y, "Per ogni 1 kg aggiuntivo", 7)); y -= 10
        riga("Oltre i 30", [it(rate_economy(z, imp)[0]) for z in zone]); y -= 10
        testi.append((40, y, "Per ogni 5 kg aggiuntivo", 7)); y -= 10
        riga("Oltre i 70", [it(rate_economy(z, imp)[1]) for z in zone]); y -= 10
        riga("Oltre i 300*", [it(rate_economy(z, imp)[2]) for z in zone]); y -= 10
    return n + 1


def scrivi(percorso: Path, rompi: str = "", senza_economy: bool = False) -> Path:
    pdf = Pdf()
    n = 1
    testi, _ = pdf.pagina()
    testi += [(40, 700, "GUIDA AI SERVIZI E ALLE TARIFFE 2026", 20), (40, 670, "ITALIA", 14)]
    n += 1
    # limiti dei servizi
    testi, _ = pdf.pagina()
    intestazione(testi, n)
    testi.append((40, 740, "Panoramica dei servizi internazionali DHL", 9))
    righe = [("Peso massimo per collo (non su pallet)", ["70 kg", "70 kg", "25 kg", "70 kg"]),
             ("Numero massimo colli per spedizione", ["–", "10", "10", "–"]),
             ("Dimensione massima per collo (L x L x A)**", ["120 x 80 x 80 cm", "120 x 80 x 80 cm", "100 x 80 x 80 cm", "120 x 80 x 80 cm"]),
             ("Peso totale massimo per spedizione", ["3.000 kg", "300 kg", "250 kg", "1.000 kg"]),
             ("Peso massimo per pallet", ["1.000 kg", "Pallet non accettabili", "Pallet non accettabili", "1.000 kg"]),
             ("Dimensione massima per pallet (L x L x A)", ["300 x 200 x 160 cm", "Pallet non accettabili", "Pallet non accettabili", "300 x 200 x 180 cm"])]
    y = 720
    for etichetta, celle in righe:
        testi.append((40, y, etichetta, 7))
        for i, c in enumerate(celle):
            testi.append((230 + 90 * i, y, c, 7))
        y -= 12
    n += 1
    # servizi opzionali e supplementi
    testi, _ = pdf.pagina()
    intestazione(testi, n)
    testi += [(40, 740, "SUPPLEMENTI", 14), (40, 725, "Supplementi", 7), (300, 725, "Metodo di addebito", 7), (420, 725, "Costo", 7)]
    y = 712

    def voce(etichetta: str, metodo: str, costo: list[str], prima: str = "") -> None:
        nonlocal y
        if prima:
            testi.append((420, y, prima, 7)); y -= 9
        testi.extend([(40, y, etichetta, 7), (300, y, metodo, 7), (420, y, costo[0], 7)])
        y -= 9
        for c in costo[1:]:
            testi.append((420, y, c, 7)); y -= 9
        y -= 3
    voce("Consegna al Sabato", "Per spedizione", ["International: 40 €", "Domestic: 16 €"])
    voce("Assicurazione", "Sul valore della", ["11 € o 1% sul valore della merce se maggiore"])
    voce("Pallet Non Sovrapponibile", "Per pallet", ["International: 300 €", "Domestic: 150 €"])
    voce("Collo Extra Misura (Peso)", "Per collo", ["International: 100 €", "Domestic: 50 €"])
    voce("Collo Extra Misura (Dimensione)", "Per collo", ["International: 20 €", "Domestic: 12 €"])
    voce("Non-Conveyable Piece", "Per collo", ["International: 20 €", "Domestic: 12 €"])
    voce("Consegna Aree Remote", "Per spedizione", ["tassabile di 24 € a spedizione", "Domestic: 8 € a spedizione"],
         prima="International: 0,50 € al kg con un minimo")
    voce("Lithium Ion PI966, Section II", "Per spedizione", ["5 €"])
    n += 1
    # zonario con le spunte
    paesi = PAESI + [(p, str(1 + (i * 7) % 9), "es" if i % 5 == 0 else "") for i, p in enumerate(ALTRI)]
    colonne = {"": 206.5, "12": 283.6, "1030": 360.7, "9": 437.8, "es": 514.9}
    for inizio in range(0, len(paesi), 64):
        testi, spunte = pdf.pagina()
        intestazione(testi, n)
        testi += [(40, 760, "CAPACITÀ DI SERVIZIO E ZONARIO", 12), (42, 628, "Paese/Territorio", 6.5), (165, 628, "Zona", 6.5),
                  (190, 628, "DHL Express Worldwide", 6.5), (265, 628, "DHL Express 12:00", 6.5), (340, 628, "DHL Express 10:30", 6.5),
                  (420, 628, "DHL Express 9:00", 6.5), (490, 628, "DHL Economy Select", 6.5)]
        y = 610.3
        for nome, zona, servizi in paesi[inizio:inizio + 64]:
            testi += [(42.5, y, nome, 6.5), (170, y, zona, 6.5)]
            spunte.append((colonne[""], y))
            if rompi != "spunte":
                for s in servizi.split():
                    spunte.append((colonne[s], y))
            y -= 8.8
        n += 1
    for flusso in ("export", "import"):
        n = tabella(pdf, n, flusso, "worldwide", rompi if flusso == "export" else "")
    if not senza_economy:
        for flusso in ("export", "import"):
            n = tabella(pdf, n, flusso, "economy")
    testi, _ = pdf.pagina()
    testi += [(40, 200, "DHL Express (Italy) srl", 7), (40, 150, "Validità: 1° gennaio 2026", 7), (40, 140, "Ad uso pubblico", 7)]
    pdf.scrivi(percorso)
    return percorso


if __name__ == "__main__":
    scrivi(Path(sys.argv[1]))
