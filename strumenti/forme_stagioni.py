"""Forme delle stagioni e delle feste per taric/static/css/app.css: maschere SVG in data URI (motivo dello sfondo e
simbolo delle schede per ogni tema, neve sopra le schede, forme della pioggia di benvenuto). Sono maschere: il colore lo
mettono le variabili del tema in app.css. Il blocco sta in app.css tra «forme: inizio» e «forme: fine».
Uso: python strumenti/forme_stagioni.py           (scrive il blocco in app.css)
     python strumenti/forme_stagioni.py --stampa  (lo mostra soltanto; tests/test_forme.py controlla che coincida)"""
from __future__ import annotations

import math
import sys
from pathlib import Path
from urllib.parse import quote

CSS = Path(__file__).resolve().parent.parent / "taric" / "static" / "css" / "app.css"
INIZIO, FINE = "/* forme: inizio */\n", "\n/* forme: fine */"

def svg(w, h, corpo):
    s = f"<svg xmlns='http://www.w3.org/2000/svg' width='{w}' height='{h}' viewBox='0 0 {w} {h}'>{corpo}</svg>"
    return 'url("data:image/svg+xml,' + quote(s, safe=" =:/,'.-()") + '")'

f = lambda v: f"{v:.1f}".rstrip('0').rstrip('.')
def cuore(x, y, s):
    return (f"<path d='M{f(x)} {f(y+s*.9)}C{f(x-s*1.6)} {f(y-s*.1)} {f(x-s*.6)} {f(y-s*1.3)} {f(x)} {f(y-s*.35)}"
            f"C{f(x+s*.6)} {f(y-s*1.3)} {f(x+s*1.6)} {f(y-s*.1)} {f(x)} {f(y+s*.9)}Z'/>")
def stella4(x, y, r):
    q = r * .2
    return (f"<path d='M{f(x)} {f(y-r)}Q{f(x+q)} {f(y-q)} {f(x+r)} {f(y)}Q{f(x+q)} {f(y+q)} {f(x)} {f(y+r)}"
            f"Q{f(x-q)} {f(y+q)} {f(x-r)} {f(y)}Q{f(x-q)} {f(y-q)} {f(x)} {f(y-r)}Z'/>")
def fiocco(x, y, r):
    d = ''
    for a in range(6):
        g = a * math.pi / 3 + math.pi / 2
        c, s = math.cos(g), math.sin(g)
        d += f"M{f(x)} {f(y)}L{f(x+c*r)} {f(y+s*r)}"
        bx, by = x + c * r * .6, y + s * r * .6
        for v in (-1, 1):
            h = g + v * math.pi / 4
            d += f"M{f(bx)} {f(by)}l{f(math.cos(h)*r*.32)} {f(math.sin(h)*r*.32)}"
    return f"<path d='{d}' stroke='black' stroke-width='{f(r*.2)}' stroke-linecap='round' fill='none'/>"
def foglia(x, y, s, rot):
    return (f"<g transform='rotate({rot} {f(x)} {f(y)})'><path d='M{f(x)} {f(y-s)}C{f(x+s*.75)} {f(y-s*.5)} {f(x+s*.8)} {f(y+s*.4)} {f(x)} {f(y+s)}"
            f"C{f(x-s*.8)} {f(y+s*.4)} {f(x-s*.75)} {f(y-s*.5)} {f(x)} {f(y-s)}Z'/><path d='M{f(x)} {f(y+s)}l0 {f(s*.35)}' stroke='black' stroke-width='{f(s*.14)}'/></g>")
def petalo(x, y, s, rot):
    return f"<ellipse cx='{f(x)}' cy='{f(y)}' rx='{f(s)}' ry='{f(s*.55)}' transform='rotate({rot} {f(x)} {f(y)})'/>"
def fiore(x, y, r):
    h = ''.join(f"<circle cx='{f(x+math.cos(a*2*math.pi/5-math.pi/2)*r)}' cy='{f(y+math.sin(a*2*math.pi/5-math.pi/2)*r)}' r='{f(r*.78)}'/>" for a in range(5))
    return h
def uovo(x, y, k, rot=0):
    return (f"<path transform='rotate({rot} {f(x)} {f(y)})' d='M{f(x)} {f(y-5*k)}C{f(x+3.6*k)} {f(y-5*k)} {f(x+4*k)} {f(y+1.6*k)} {f(x+3.8*k)} {f(y+2.4*k)}"
            f"C{f(x+3.4*k)} {f(y+5.4*k)} {f(x-3.4*k)} {f(y+5.4*k)} {f(x-3.8*k)} {f(y+2.4*k)}C{f(x-4*k)} {f(y+1.6*k)} {f(x-3.6*k)} {f(y-5*k)} {f(x)} {f(y-5*k)}Z'/>")
def pipistrello(x, y, k):
    q = lambda dx, dy: f"{f(x+dx*k)} {f(y+dy*k)}"
    return (f"<path d='M{q(-9,0)}Q{q(-6,-5)} {q(-2,-2)}L{q(0,-4)}L{q(2,-2)}Q{q(6,-5)} {q(9,0)}Q{q(6,-1)} {q(5,2)}Q{q(3,0)} {q(1,2)}L{q(0,3)}"
            f"L{q(-1,2)}Q{q(-3,0)} {q(-5,2)}Q{q(-6,-1)} {q(-9,0)}Z'/>")
def zucca(x, y, k):
    return (f"<ellipse cx='{f(x)}' cy='{f(y)}' rx='{f(9.6*k)}' ry='{f(6.6*k)}'/><path d='M{f(x-.8*k)} {f(y-6*k)}l{f(.6*k)} {f(-3.4*k)}h{f(1.8*k)}l{f(-.4*k)} {f(3.4*k)}z'/>")
def abete(x, y, k):
    return f"<path d='M{f(x)} {f(y-9*k)}l{f(5*k)} {f(6*k)}h{f(-2.4*k)}l{f(4.2*k)} {f(5*k)}h{f(-2.8*k)}l{f(4.4*k)} {f(5.2*k)}H{f(x-8.4*k)}l{f(4.4*k)} {f(-5.2*k)}h{f(-2.8*k)}l{f(4.2*k)} {f(-5*k)}h{f(-2.4*k)}z'/><rect x='{f(x-1.3*k)}' y='{f(y+7*k)}' width='{f(2.6*k)}' height='{f(2.4*k)}'/>"
def pompon(x, y, k):
    return ''.join(f"<circle cx='{f(x+dx*k)}' cy='{f(y+dy*k)}' r='{f(r*k)}'/>" for dx, dy, r in [(0,0,2.4),(-3.4,2.4,2),(3,2.6,2.1),(-.6,4.8,1.9),(2.4,-2.4,1.7)])
def coriandolo(x, y, k, rot):
    return f"<rect x='{f(x-2*k)}' y='{f(y-1.3*k)}' width='{f(4*k)}' height='{f(2.6*k)}' transform='rotate({rot} {f(x)} {f(y)})'/>"
def filante(x, y, k):
    return f"<path d='M{f(x)} {f(y)}q{f(4*k)} {f(-3*k)} {f(8*k)} 0t{f(8*k)} 0 {f(8*k)} 0' fill='none' stroke='black' stroke-width='{f(1.4*k)}' stroke-linecap='round'/>"
def vela(x, y, k):
    return (f"<path d='M{f(x)} {f(y-9*k)}V{f(y)}H{f(x-6*k)}Z'/><path d='M{f(x+1.2*k)} {f(y-7*k)}V{f(y)}H{f(x+5*k)}Z'/>"
            f"<path d='M{f(x-8*k)} {f(y+1.2*k)}H{f(x+7*k)}L{f(x+5*k)} {f(y+4*k)}H{f(x-6*k)}Z'/>")
def onda(x, y, k):
    return f"<path d='M{f(x)} {f(y)}q{f(3*k)} {f(-2.6*k)} {f(6*k)} 0t{f(6*k)} 0 {f(6*k)} 0' fill='none' stroke='black' stroke-width='{f(1.5*k)}' stroke-linecap='round'/>"
def sole(x, y, k):
    d = ''.join(f"M{f(x+math.cos(a*math.pi/4)*6*k)} {f(y+math.sin(a*math.pi/4)*6*k)}L{f(x+math.cos(a*math.pi/4)*8.6*k)} {f(y+math.sin(a*math.pi/4)*8.6*k)}" for a in range(8))
    return f"<circle cx='{f(x)}' cy='{f(y)}' r='{f(4*k)}'/><path d='{d}' stroke='black' stroke-width='{f(1.4*k)}' stroke-linecap='round'/>"
def coccarda(x, y, k):
    return f"<circle cx='{f(x)}' cy='{f(y)}' r='{f(6*k)}' fill='none' stroke='black' stroke-width='{f(2.2*k)}'/><circle cx='{f(x)}' cy='{f(y)}' r='{f(2*k)}'/>"
def maschera(x, y, k):
    return (f"<path fill-rule='evenodd' d='M{f(x-9.5*k)} {f(y-3.5*k)}Q{f(x)} {f(y-7.5*k)} {f(x+9.5*k)} {f(y-3.5*k)}Q{f(x+10*k)} {f(y+4*k)} {f(x+3.6*k)} {f(y+4*k)}"
            f"Q{f(x+1.4*k)} {f(y+4*k)} {f(x)} {f(y+1.4*k)}Q{f(x-1.4*k)} {f(y+4*k)} {f(x-3.6*k)} {f(y+4*k)}Q{f(x-10*k)} {f(y+4*k)} {f(x-9.5*k)} {f(y-3.5*k)}Z"
            f"M{f(x-6.4*k)} {f(y-1.4*k)}Q{f(x-4.4*k)} {f(y-3*k)} {f(x-2.2*k)} {f(y-1.4*k)}Q{f(x-4.4*k)} {f(y+.4*k)} {f(x-6.4*k)} {f(y-1.4*k)}Z"
            f"M{f(x+2.2*k)} {f(y-1.4*k)}Q{f(x+4.4*k)} {f(y-3*k)} {f(x+6.4*k)} {f(y-1.4*k)}Q{f(x+4.4*k)} {f(y+.4*k)} {f(x+2.2*k)} {f(y-1.4*k)}Z'/>")

# motivi dello sfondo, riquadri di 260 x 260
M = 260
motivi = {
  'inverno': fiocco(40, 46, 13) + fiocco(170, 30, 8) + fiocco(212, 150, 15) + fiocco(92, 200, 10) + fiocco(118, 112, 6) + fiocco(20, 140, 7),
  'natale': abete(46, 52, 1.6) + fiocco(172, 36, 9) + stella4(214, 148, 9) + fiocco(96, 206, 11) + stella4(116, 110, 6) + abete(204, 226, 1.1) + fiocco(24, 150, 7),
  'capodanno': stella4(42, 44, 12) + stella4(176, 30, 7) + stella4(212, 150, 14) + stella4(94, 202, 9) + stella4(118, 112, 5) + stella4(24, 150, 6) + stella4(150, 236, 5),
  'san-valentino': cuore(44, 46, 9) + cuore(176, 32, 5.6) + cuore(212, 150, 10.4) + cuore(94, 204, 7) + cuore(120, 112, 4.4) + cuore(24, 150, 5),
  'carnevale': maschera(52, 48, 1.4) + coriandolo(170, 30, 2, 20) + filante(180, 140, 2.2) + coriandolo(96, 200, 2.2, -30) + coriandolo(130, 110, 1.6, 50)
               + coriandolo(30, 150, 1.8, 10) + filante(30, 236, 1.6) + coriandolo(226, 210, 2, 70),
  'mimosa': pompon(46, 46, 2.2) + pompon(176, 30, 1.4) + pompon(212, 150, 2.4) + pompon(96, 204, 1.7) + pompon(120, 112, 1.1) + pompon(24, 150, 1.3),
  'pasqua': uovo(44, 46, 2.4, -14) + fiore(176, 32, 4) + uovo(212, 150, 2.8, 18) + fiore(96, 206, 5) + uovo(120, 112, 1.5, 8) + fiore(24, 150, 3.4),
  'festa-nazionale': coccarda(44, 46, 2.2) + stella4(176, 32, 7) + coccarda(212, 150, 2.6) + stella4(94, 204, 9) + coccarda(120, 112, 1.3) + stella4(24, 150, 5),
  'halloween': pipistrello(48, 44, 2.2) + zucca(176, 34, 1.2) + pipistrello(212, 150, 2.6) + zucca(96, 206, 1.5) + pipistrello(122, 112, 1.3) + stella4(24, 150, 5),
  'primavera': fiore(44, 46, 6) + petalo(176, 30, 6, 30) + fiore(212, 150, 7) + petalo(96, 206, 7, -20) + fiore(120, 112, 4) + petalo(24, 150, 5, 60),
  'estate': vela(48, 52, 2) + onda(150, 30, 2) + sole(212, 150, 2.2) + onda(70, 206, 2.4) + vela(130, 120, 1.3) + onda(10, 150, 1.6),
  'autunno': foglia(44, 46, 14, -24) + foglia(176, 32, 9, 38) + foglia(212, 150, 16, 12) + foglia(94, 204, 11, -50) + foglia(120, 112, 7, 70) + foglia(24, 150, 8, 20),
}
# ornamenti delle schede, 24 x 24
orn = {
  'inverno': fiocco(12, 12, 10.4), 'natale': abete(12, 11, 1.25), 'capodanno': stella4(12, 12, 11), 'san-valentino': cuore(12, 12, 7),
  'carnevale': maschera(12, 12, 1.15), 'mimosa': pompon(11, 10, 2), 'pasqua': uovo(12, 12.6, 2.1),
  'festa-nazionale': "<circle cx='12' cy='12' r='11'/>", 'halloween': zucca(12, 13.4, 1.15), 'primavera': fiore(12, 12, 5.6) ,
  'estate': sole(12, 12, 1.3), 'autunno': foglia(12, 11, 9.6, 30),
}
neve = "<path d='M0 4Q8 0 16 3T32 3T48 3T64 4V7Q60 11 56 8Q52 12 46 8.6Q42 10.6 38 8.4Q32 12 26 8.6Q20 11 16 8.4Q10 12 6 8.6Q3 10 0 8Z'/>"
forme = {'fiocchi': fiocco(12, 12, 10.6), 'stelle': stella4(12, 12, 11), 'cuori': cuore(12, 12, 7), 'petali': petalo(12, 12, 10, 20), 'foglie': foglia(12, 11, 9.6, 0)}



def blocco() -> str:
    righe = [":root{--cappello:" + svg(64, 12, neve) + "}"]
    for tema in motivi:
        righe.append(f".tema-{tema}{{--motivo:{svg(M, M, motivi[tema])};--ornamento:{svg(24, 24, orn[tema])}}}")
    for nome, c in forme.items():
        righe.append(f".p-{nome}{{--forma:{svg(24, 24, c)}}}")
    return "\n".join(righe)


def nel_css(testo: str) -> str:
    """il blocco come sta ora in app.css"""
    return testo.split(INIZIO, 1)[1].split(FINE, 1)[0]


if __name__ == "__main__":
    if "--stampa" in sys.argv:
        print(blocco())
    else:
        testo = CSS.read_text(encoding="utf-8")
        CSS.write_text(testo.replace(INIZIO + nel_css(testo) + FINE, INIZIO + blocco() + FINE), encoding="utf-8")
        print("app.css aggiornato")
