"""Cambio doganale del mese per la bolla simulata, dai cambi di riferimento della Banca centrale europea.

Regola (art. 146 del Reg. di esecuzione UE 2015/2447, per gli Stati con l'euro): per tutto un mese si usa il cambio
pubblicato dalla BCE il penultimo mercoledi' del mese precedente; se quel giorno non c'e' un cambio, l'ultimo pubblicato
prima. La BCE esprime i cambi in unita' di valuta per 1 euro (per esempio 1,0867 USD).

I cambi presi si tengono nella tabella cambi_doganali: per un mese passato non cambiano piu'. Il servizio della BCE si
interroga con un indirizzo come
  https://data-api.ecb.europa.eu/service/data/EXR/D.USD.EUR.SP00.A?startPeriod=2026-10-07&endPeriod=2026-10-21&format=csvdata
che risponde in CSV con, tra le altre, le colonne TIME_PERIOD e OBS_VALUE (MAGIC_HS_BCE_URL cambia l'indirizzo di base,
per le prove)."""
from __future__ import annotations

import csv
import datetime as dt
import io
import logging
import re
from decimal import Decimal, InvalidOperation
from typing import Any

import httpx

from .db import Database, iso

log = logging.getLogger("taric.valute")
RE_VALUTA = re.compile(r"^[A-Z]{3}$")
MESI = ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"]


class ErroreCambio(Exception):
    def __init__(self, stato: int, messaggio: str, codice: str):
        super().__init__(messaggio)
        self.stato, self.messaggio, self.codice = stato, messaggio, codice


def giorno_cambio(mese: str) -> dt.date:
    """Il penultimo mercoledi' del mese che precede `mese` ('AAAA-MM')."""
    anno, m = int(mese[:4]), int(mese[5:7])
    primo = dt.date(anno, m, 1)
    ultimo_prec = primo - dt.timedelta(days=1)
    ultimo_mercoledi = ultimo_prec - dt.timedelta(days=(ultimo_prec.weekday() - 2) % 7)
    return ultimo_mercoledi - dt.timedelta(days=7)


def data_it(d: dt.date) -> str:
    return d.strftime("%d/%m/%Y")


class CambiDoganali:
    def __init__(self, db: Database, url: str, client: httpx.Client | None = None):
        self.db = db
        self.url = url.rstrip("/")
        self.client = client or httpx.Client(timeout=httpx.Timeout(20, connect=10))

    def _dalla_bce(self, valuta: str, rif: dt.date) -> tuple[Decimal, dt.date]:
        params = {"startPeriod": (rif - dt.timedelta(days=14)).isoformat(), "endPeriod": rif.isoformat(), "format": "csvdata"}
        try:
            r = self.client.get(f"{self.url}/D.{valuta}.EUR.SP00.A", params=params, headers={"Accept": "text/csv"})
        except httpx.HTTPError as e:
            raise ErroreCambio(503, f"La BCE non risponde ({type(e).__name__}): riprova tra poco.", "bce_non_raggiungibile") from None
        if r.status_code == 404:
            raise ErroreCambio(404, f"La BCE non pubblica un cambio di riferimento per {valuta}: per questa valuta il cambio "
                                    "doganale va preso dall'Agenzia delle Dogane.", "valuta_non_quotata")
        if r.status_code != 200:
            raise ErroreCambio(503, f"La BCE risponde {r.status_code}: riprova tra poco.", "bce_non_raggiungibile")
        migliore: tuple[dt.date, Decimal] | None = None
        for riga in csv.DictReader(io.StringIO(r.text)):
            try:
                giorno = dt.date.fromisoformat((riga.get("TIME_PERIOD") or "").strip())
                tasso = Decimal((riga.get("OBS_VALUE") or "").strip())
            except (ValueError, InvalidOperation):
                continue
            if giorno <= rif and tasso > 0 and tasso.is_finite() and (migliore is None or giorno > migliore[0]):
                migliore = (giorno, tasso)
        if migliore is None:
            raise ErroreCambio(404, f"La BCE non ha pubblicato cambi di {valuta} nei giorni prima del {data_it(rif)}.", "valuta_non_quotata")
        return migliore[1], migliore[0]

    def tasso(self, valuta: str, giorno: dt.date, oggi: dt.date | None = None) -> dict[str, Any]:
        """Il cambio doganale di `valuta` per il mese di `giorno` (data della bolla)."""
        valuta = valuta.strip().upper()
        if not RE_VALUTA.match(valuta):
            raise ErroreCambio(422, "Valuta non valida: usa il codice di tre lettere (per esempio USD).", "valuta")
        mese = giorno.strftime("%Y-%m")
        rif = giorno_cambio(mese)
        nome_mese = f"{MESI[giorno.month - 1]} {giorno.year}"
        if valuta == "EUR":
            return {"valuta": "EUR", "mese": mese, "tasso": 1.0, "testo": "1", "giorno": None, "riferimento": rif.isoformat(), "fonte": ""}
        with self.db.connessione() as c:
            r = c.execute("SELECT tasso, giorno FROM cambi_doganali WHERE valuta = ? AND mese = ?", (valuta, mese)).fetchone()
        if r is None:
            if rif > (oggi or dt.date.today()):
                raise ErroreCambio(409, f"Il cambio doganale di {nome_mese} si fissa il {data_it(rif)}: fino ad allora non si conosce.",
                                   "cambio_non_fissato")
            tasso, preso_il = self._dalla_bce(valuta, rif)
            with self.db.transazione() as c:
                c.execute("INSERT OR REPLACE INTO cambi_doganali(valuta, mese, tasso, giorno, preso) VALUES (?, ?, ?, ?, ?)",
                          (valuta, mese, str(tasso), preso_il.isoformat(), iso()))
            log.info("cambio doganale %s %s: %s (BCE, %s)", valuta, mese, tasso, preso_il)
            testo, giorno_bce = str(tasso), preso_il.isoformat()
        else:
            testo, giorno_bce = r["tasso"], r["giorno"]
        return {"valuta": valuta, "mese": mese, "tasso": float(testo), "testo": testo, "giorno": giorno_bce,
                "riferimento": rif.isoformat(), "fonte": f"BCE, cambio di riferimento del {data_it(dt.date.fromisoformat(giorno_bce))}"}


__all__ = ["CambiDoganali", "ErroreCambio", "giorno_cambio"]
