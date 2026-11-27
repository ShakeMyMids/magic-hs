"""Chi ha MAGIC HS aperto in questo momento (Gestione › Utenti, «Online ora»).

Le pagine dell'app mandano un segnale (POST /api/io/presenza) all'apertura, ogni minuto e quando la scheda passa in primo o
in secondo piano: se la scheda si vede, da quanti secondi la persona non tocca né scrive, se lo schermo è a sfioramento.
Le presenze stanno in memoria, una per sessione (un browser) con le sue schede, e ogni scheda vale FINESTRA secondi dal
suo ultimo segnale: dopo un riavvio del sito si ricompongono al segnale seguente. Niente si scrive nel database e non si tiene quale pagina si guarda.
"""
from __future__ import annotations

import threading
import time
from dataclasses import dataclass
from typing import Callable

FINESTRA = 150          # secondi dall'ultimo segnale (uno al minuto): con due segnali persi la persona non è più online
FERMO = 300             # secondi senza tocchi né tasti dopo i quali chi ha la scheda davanti è «fermo»
ORDINE = {"attivo": 0, "fermo": 1, "sfondo": 2}


@dataclass
class Scheda:
    visto: float        # ultimo segnale
    gesto: float        # ultimo tocco, clic o tasto
    visibile: bool


@dataclass
class Presenza:
    utente_id: int
    da: float           # primo segnale di questa visita
    tipo: str           # telefono, tablet, computer
    descrizione: str    # «Chrome su Windows»
    schede: dict[str, Scheda]

    @property
    def gesto(self) -> float:
        return max(x.gesto for x in self.schede.values())

    def stato(self, ora: float) -> str:
        """attivo o fermo se una scheda si vede (fermo: nessun tocco da FERMO secondi in nessuna scheda), altrimenti sfondo."""
        if not any(x.visibile for x in self.schede.values()):
            return "sfondo"
        return "attivo" if ora - self.gesto < FERMO else "fermo"


def dispositivo(agente: str, tocco: bool = False) -> tuple[str, str]:
    """(tipo, descrizione) dall'intestazione User-Agent; l'iPad si presenta come un Mac, lo dice lo schermo a sfioramento."""
    a = agente or ""
    if "iPhone" in a:
        tipo, sistema = "telefono", "iPhone"
    elif "iPad" in a or ("Macintosh" in a and tocco):
        tipo, sistema = "tablet", "iPad"
    elif "Android" in a:
        tipo, sistema = ("telefono" if "Mobile" in a else "tablet"), "Android"
    elif "Windows" in a:
        tipo, sistema = "computer", "Windows"
    elif "Macintosh" in a:
        tipo, sistema = "computer", "Mac"
    elif "CrOS" in a:
        tipo, sistema = "computer", "Chromebook"
    elif "Linux" in a:
        tipo, sistema = "computer", "Linux"
    else:
        tipo, sistema = "computer", ""
    browser = next((nome for segno, nome in (("Edg", "Edge"), ("OPR/", "Opera"), ("SamsungBrowser", "Samsung Internet"),
                                             ("Firefox/", "Firefox"), ("FxiOS", "Firefox"), ("CriOS", "Chrome"),
                                             ("Chrome/", "Chrome"), ("Safari/", "Safari")) if segno in a), "")
    descrizione = f"{browser} su {sistema}" if browser and sistema else (browser or sistema or "Browser sconosciuto")
    return tipo, descrizione


class Presenze:
    def __init__(self, orologio: Callable[[], float] = time.time) -> None:
        self.orologio = orologio
        self._voci: dict[str, Presenza] = {}
        self._lock = threading.Lock()

    def segnala(self, sessione: str, utente_id: int, *, scheda: str = "", visibile: bool, fermo: float, agente: str, tocco: bool) -> None:
        ora = self.orologio()
        gesto = ora - max(0.0, min(float(fermo), 7 * 86400.0))
        tipo, descrizione = dispositivo(agente, tocco)
        with self._lock:
            self._pulisci(ora)
            p = self._voci.get(sessione)
            if p is None or p.utente_id != utente_id:
                p = self._voci[sessione] = Presenza(utente_id, ora, tipo, descrizione, {})
            if scheda not in p.schede and len(p.schede) >= 20:          # un browser con troppe schede: si dimentica la più vecchia
                del p.schede[min(p.schede, key=lambda k: p.schede[k].visto)]
            p.schede[scheda] = Scheda(ora, gesto, visibile)
            p.tipo, p.descrizione = tipo, descrizione

    def togli(self, sessione: str) -> None:
        with self._lock:
            self._voci.pop(sessione, None)

    def attive(self) -> tuple[float, dict[str, Presenza]]:
        """(adesso, presenze per sessione) di chi ha mandato un segnale negli ultimi FINESTRA secondi."""
        ora = self.orologio()
        with self._lock:
            self._pulisci(ora)
            return ora, dict(self._voci)

    def _pulisci(self, ora: float) -> None:
        for k, p in list(self._voci.items()):
            p.schede = {s: x for s, x in p.schede.items() if ora - x.visto <= FINESTRA}
            if not p.schede:
                del self._voci[k]
