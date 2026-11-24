"""Un «Prospetto di sintesi della dichiarazione doganale di importazione H1» finto, come lo stampa AIDA: ogni testo nella
sua posizione (un oggetto di testo per casella, come i generatori di report), etichette piccole in corsivo, alcune su due
righe («Num.» sopra «A93», «Natura» sopra «transaz.»), valori anche spezzati in più pezzi o su più righe, cornici delle
caselle. Dati inventati. Serve alle prove di taric/leggi_bolla.py (tests/test_bolla_pdf.py) e alla prova nel browser.
Uso: python tests/prospetto_finto.py USCITA.pdf [--altro]"""
from __future__ import annotations

import sys
from pathlib import Path

ALTEZZA = 842.0
F_ETICHETTA, F_VALORE, F_TITOLO = ("F2", 6.5), ("F1", 8.5), ("F3", 10.5)


def e(x: float, y: float, testo: str) -> tuple:          # etichetta (y dall'alto, in punti)
    return (x, y, F_ETICHETTA, testo)


def v(x: float, y: float, testo: str) -> tuple:          # valore
    return (x, y, F_VALORE, testo)


def t(x: float, y: float, testo: str) -> tuple:          # titolo
    return (x, y, F_TITOLO, testo)


def testata() -> list[tuple]:
    return [
        t(150, 70, "Prospetto di sintesi della dichiarazione doganale di importazione H1"),
        v(230, 84, "MRN:"), v(255, 84, "26ITQ0B44714259R61"), v(360, 84, "Ver.:"), v(382, 84, "0"),
        v(230, 96, "Generato il: 07/07/2026 09:41:49"),
        e(32, 120, "Ufficio"), v(32, 131, "279100 - UD MALPENSA SEZIONE"), v(32, 140, "OPERATIVA CENTRALE"),
        e(170, 120, "Data dichiarazione"), v(170, 131, "29/06/2026"),
        e(260, 120, "Data accettazione"), v(260, 131, "29/06/2026"),
        v(420, 150, "26ITQ0B44714259R61"),                                   # il testo sotto il codice a barre
        e(32, 152, "Totale colli"), v(32, 163, "3"), e(95, 152, "Totale massa lorda"), v(95, 163, "41,30"),
        e(170, 152, "Valore fattura"), v(170, 163, "1.246,33 USD"), e(260, 152, "Tasso di cambio"), v(260, 163, "1,0785"),
        e(300, 180, "Svincolo"), v(300, 191, "QD7ARJ"), e(360, 180, "Data svincolo"), v(360, 191, "29/06/2026"),
        e(440, 180, "Num. A93"), v(440, 191, "484828"), e(500, 180, "Anno A93"), v(500, 191, "2026"),
        t(32, 205, "Dettagli Dichiarazione"),
        e(300, 200, "Totale Articoli"), v(300, 211, "2"), e(360, 200, "Data rilascio"), e(440, 200, "Num. Quiet."), e(500, 200, "Data Quiet."),
        e(32, 226, "Esportatore"), v(32, 237, "FORNITORE DI PROVA INC"), v(32, 246, "US"), v(60, 246, "50703"), v(110, 246, "IA WATERLOO"),
        e(300, 226, "Importatore"), v(300, 237, "IMPORTATORE DI PROVA SRL"), v(300, 246, "10098"), v(340, 246, "RIVOLI"),
        e(32, 262, "Dichiarante"), v(32, 273, "IT01234567890"), e(300, 262, "Rappresentante indiretto"), v(300, 273, "IT01234567890"),
        e(32, 286, "Condizioni di consegna"), v(32, 297, "CPT"), v(80, 297, "TORINO"), v(140, 297, "IT"),
        e(300, 286, "Dilazione di pagamento"), v(300, 297, "*********"),
        e(32, 310, "Paese di sped."), v(32, 321, "US"), e(85, 310, "Paese di dest."), v(85, 321, "IT"),
        e(140, 310, "Provincia dest."), v(140, 321, "TO"), e(300, 310, "Id. Mezzo all'arrivo"), v(300, 321, "40 AZ610"),
        e(440, 310, "Natura transazione"), v(440, 321, "11"),
        e(32, 338, "Aggiunte / Detrazioni"), e(32, 348, "Codice"), e(95, 348, "Descrizione"), e(480, 348, "Importo"),
        e(32, 372, "Documenti"), e(32, 382, "Codice"), e(75, 382, "Identificativo"), e(170, 382, "Autorità Emitt."), e(230, 382, "Data Validità"),
        e(290, 382, "Unità di misura"), e(350, 382, "Quantità"), e(410, 382, "Codice Valuta"), e(480, 382, "Importo"),
        v(32, 393, "N935"), v(75, 393, "2026-US-D699417"),
        v(32, 403, "Y025"), v(75, 403, "2026-IT-AEOF"), v(75, 411, "09 0146"),                      # identificativo su due righe
        v(32, 421, "Y926"), v(75, 421, "-"),
        v(32, 431, "N740"), v(75, 431, "235-12345678"),
        e(32, 448, "Scarichi"), e(32, 458, "Tipo"), e(75, 458, "Riferimento"), e(250, 458, "Art."), e(300, 458, "Num. imb."),
        e(360, 458, "Quantità"), e(420, 458, "Unità"),
        v(32, 469, "337"), v(75, 469, "26ITQ0B32378457U90"), v(250, 469, "1"),
    ]


def articolo(n: int, a: dict) -> list[tuple]:
    out = [
        t(32, 75, f"Dettagli Articolo n° {n}"),
        e(190, 62, "Regime"), v(190, 75, "4000"), e(240, 62, "Cod.Svincolo"), e(300, 62, "Data svincolo"),
        e(360, 62, "Num."), e(360, 69, "A93"), e(400, 62, "Anno"), e(400, 69, "A93"), e(440, 62, "Data"), e(440, 69, "rilascio"),
        e(480, 62, "Num."), e(480, 69, "Quietanza"), e(530, 62, "Data"), e(530, 69, "quietanza"),
        e(32, 92, "Codice merce"), v(32, 103, a["codice"]), e(190, 92, "Massa lorda"), v(190, 103, a["lordo"]),
        e(240, 92, "Massa netta"), v(240, 103, a["netto"]), e(300, 92, "Unità supplementare"), v(300, 103, a["quantita"]),
        e(420, 92, "Regimi aggiuntivi"), v(420, 103, a["regimi"]), e(500, 92, "Container"), v(500, 103, "0"),
        e(32, 118, "Descrizione merce"), *[v(32, 129 + 9 * k, r) for k, r in enumerate(a["descrizione"])],
        e(420, 118, "Preferenze"), v(420, 129, a["preferenza"]), e(500, 118, "Contingente"),
        e(32, 152, "Paese di"), e(32, 159, "sped."), v(32, 171, "US"), e(75, 152, "Paese di"), e(75, 159, "dest."), v(75, 171, "IT"),
        e(118, 152, "Prov. dest."), v(118, 171, "TO"), e(160, 152, "Paese di orig."), v(160, 171, a["origine"]),
        e(220, 152, "Paese orig pref"), e(290, 152, "Natura"), e(290, 159, "transaz."), v(290, 171, "11"),
        e(340, 152, "Prezzo art."), v(340, 171, a["prezzo"]), e(420, 152, "Valore stat."), v(420, 171, a["statistico"]),
        e(32, 188, "Aggiunte / Detrazioni"), e(32, 198, "Codice"), e(95, 198, "Descrizione"), e(480, 198, "Importo"),
        *[x for k, g in enumerate(a["aggiunte"]) for x in (v(32, 209 + 10 * k, g[0]), v(95, 209 + 10 * k, g[1]), v(480, 209 + 10 * k, g[2]))],
        e(32, 232, "Liquidazione"), e(32, 242, "Tributo"), e(95, 242, "Imponibile"), e(160, 242, "Quantità"), e(215, 242, "Unità di misura"),
        e(290, 242, "Aliquota"), e(350, 242, "Importo"), e(420, 242, "Metodo pag."),
        *[x for k, r in enumerate(a["tributi"]) for x in (v(32, 253 + 10 * k, r[0]), v(95, 253 + 10 * k, r[1]), v(290, 253 + 10 * k, r[2]),
                                                         v(350, 253 + 10 * k, r[3]), v(420, 253 + 10 * k, "E"))],
        e(32, 280, "Scarichi"), e(32, 290, "Tipo"), e(75, 290, "Riferimento"), e(250, 290, "Art."), e(300, 290, "Num. imb."),
        e(360, 290, "Quantità"), e(420, 290, "Unità"),
        e(32, 314, "Documenti"), e(32, 324, "Codice"), e(75, 324, "Identificativo"), e(170, 324, "Data"), e(230, 324, "Uni. Mis."),
        e(290, 324, "Quantità"), e(350, 324, "Codice valuta"), e(480, 324, "Importo"),
        *[x for k, d in enumerate(a["documenti"]) for x in (v(32, 335 + 10 * k, d[0]), v(75, 335 + 10 * k, d[1]))],
        e(32, 362, "Colli"), e(32, 372, "Tipo imb."), e(95, 372, "Numero imb."), e(160, 372, "Marchi spedizione"),
        v(32, 383, a["colli"][0]), v(95, 383, a["colli"][1]), v(160, 383, a["colli"][2]),
    ]
    return out


ARTICOLI = [
    {"codice": "6403999610", "lordo": "16,30", "netto": "14,50", "quantita": "1", "regimi": "F15", "preferenza": "100",
     "descrizione": ["CALZATURE SPORTIVE DA UOMO CON TOMAIA", "IN PELLE E SUOLA IN GOMMA"], "origine": "US", "prezzo": "246,33",
     "statistico": "228,40", "aggiunte": [("AK", "SPESE DI TRASPORTO", "10,00")],
     "tributi": [("A00", "228,40", "8,00", "18,27"), ("B00", "264,67", "22,00", "58,23")],
     "documenti": [("N935", "2026-US-D699417"), ("Y900", "-")], "colli": ("PK", "1", "NESSUN MARCHIO")},
    {"codice": "8712003090", "lordo": "25,00", "netto": "22,00", "quantita": "2", "regimi": "", "preferenza": "100",
     "descrizione": ["BICICLETTE"], "origine": "CN", "prezzo": "1.000,00", "statistico": "927,21", "aggiunte": [],
     "tributi": [("A00", "927,21", "14,00", "129,81")], "documenti": [("N935", "2026-US-D699417")], "colli": ("CT", "2", "BIKE 1-2")},
]


def pdf(pagine: list[list[tuple]]) -> bytes:
    """Un PDF minimo: Helvetica, Helvetica-Oblique (etichette) e Helvetica-Bold (titoli), WinAnsi, testi in esadecimale."""
    oggetti: list[bytes] = []

    def aggiungi(b: bytes) -> int:
        oggetti.append(b)
        return len(oggetti)

    font = {n: aggiungi(f"<< /Type /Font /Subtype /Type1 /BaseFont /{b} /Encoding /WinAnsiEncoding >>".encode())
            for n, b in (("F1", "Helvetica"), ("F2", "Helvetica-Oblique"), ("F3", "Helvetica-Bold"))}
    radice_pagine = len(oggetti) + 1 + 2 * len(pagine) + 1          # numero dell'oggetto /Pages, scritto per ultimo
    figli = []
    for elementi in pagine:
        flusso = [b"0.6 w 28 40 540 760 re S"]                        # una cornice, come le caselle
        for x, y, (f, dim), testo in elementi:
            esa = testo.encode("cp1252").hex().upper()
            flusso.append(f"BT /{f} {dim} Tf 1 0 0 1 {x} {ALTEZZA - y:.1f} Tm <{esa}> Tj ET".encode())
        dati = b"\n".join(flusso)
        c = aggiungi(b"<< /Length %d >>\nstream\n" % len(dati) + dati + b"\nendstream")
        risorse = " ".join(f"/{n} {i} 0 R" for n, i in font.items())
        figli.append(aggiungi(f"<< /Type /Page /Parent {radice_pagine} 0 R /MediaBox [0 0 595 842] "
                              f"/Resources << /Font << {risorse} >> >> /Contents {c} 0 R >>".encode()))
    aggiungi(b"<< /Type /Catalog /Pages %d 0 R >>" % radice_pagine)
    catalogo = len(oggetti)
    pagine_id = aggiungi(f"<< /Type /Pages /Kids [{' '.join(f'{i} 0 R' for i in figli)}] /Count {len(figli)} >>".encode())
    assert pagine_id == radice_pagine
    out, posizioni = bytearray(b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n"), []
    for i, o in enumerate(oggetti, start=1):
        posizioni.append(len(out))
        out += b"%d 0 obj\n" % i + o + b"\nendobj\n"
    xref = len(out)
    out += b"xref\n0 %d\n0000000000 65535 f \n" % (len(oggetti) + 1) + b"".join(b"%010d 00000 n \n" % p for p in posizioni)
    out += b"trailer\n<< /Size %d /Root %d 0 R >>\nstartxref\n%d\n%%%%EOF\n" % (len(oggetti) + 1, catalogo, xref)
    return bytes(out)


def prospetto() -> bytes:
    return pdf([testata()] + [articolo(n, a) for n, a in enumerate(ARTICOLI, start=1)])


if __name__ == "__main__":
    # con --altro un PDF che non è un prospetto (si legge solo con l'IA)
    altro = pdf([[(40, 100, F_VALORE, "Fattura commerciale n. 42")]])
    Path(sys.argv[1]).write_bytes(altro if "--altro" in sys.argv else prospetto())
    print("scritto", sys.argv[1])
