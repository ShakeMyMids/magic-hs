"""Supplemento carburante di DHL Express della settimana, per il calcolatore del trasporto: si legge dalla pagina pubblica
dei supplementi di DHL Express Italia (MAGIC_HS_CARBURANTE_URL; vuota = solo a mano). La pagina ha una tabella per
gruppo di servizi, con una riga per settimana («Novembre 16-22, 2026 | 50.00%», anche la settimana dopo):
- «Servizi Internazionali Time Definite»: DHL Express Worldwide, 12:00, 10:30 e 9:00 (indice del carburante per aerei);
- «Servizi Day Definite Intra-Europe»: DHL Economy Select (indice del gasolio).
Vale la riga della settimana in corso (giorno italiano). Il pianificatore controlla una volta al giorno e, a settimana
finita, subito; dopo un errore riprova dopo 6 ore. Se la pagina cambia o non risponde resta l'ultimo valore, Gestione lo
dice e l'amministratore lo puo' scrivere a mano (vale fino alla domenica della sua settimana, poi si torna alla pagina). La pagina e' un dato non fidato: si tengono solo date e percentuali
controllate."""
from __future__ import annotations

import datetime as dt
import html
import logging
import re
from typing import Any
from zoneinfo import ZoneInfo

import httpx

from .config import Config
from .db import Database, da_iso, iso

log = logging.getLogger("taric.carburante")

MESI = ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto", "settembre", "ottobre",
        "novembre", "dicembre"]
# titolo della tabella nella pagina (in minuscolo, solo lettere) -> chiave del supplemento
TABELLE = {"serviziinternazionalitimedefinite": "percentuale", "servizidaydefiniteintraeurope": "economy"}
SETTIMANA = re.compile(r"^([a-z]+)\s+(\d{1,2})(?:,\s*(\d{4}))?\s*[-–]\s*(?:([a-z]+)\s+)?(\d{1,2}),\s*(\d{4})$")
PERCENTUALE = re.compile(r"^(\d{1,2}(?:[.,]\d{1,2})?)\s*%$")


class ErroreCarburante(Exception):
    pass


def righe_di_testo(pagina: str) -> list[str]:
    testo = re.sub(r"<(script|style)\b.*?</\1>", " ", pagina, flags=re.S | re.I)
    testo = html.unescape(re.sub(r"<[^>]+>", "\n", testo))
    return [r.strip() for r in testo.splitlines() if r.strip()]


def settimana(s: str) -> tuple[dt.date, dt.date] | None:
    """«Novembre 16-22, 2026», «Ottobre 26-Novembre 1, 2026», «Dicembre 28, 2026-Gennaio 3, 2027» -> (dal, al)."""
    m = SETTIMANA.match(s.strip().lower())
    if not m or m.group(1) not in MESI or (m.group(4) and m.group(4) not in MESI):
        return None
    m1, m2 = MESI.index(m.group(1)) + 1, MESI.index(m.group(4) or m.group(1)) + 1
    a2 = int(m.group(6))
    a1 = int(m.group(3)) if m.group(3) else (a2 - 1 if m1 > m2 else a2)
    try:
        dal, al = dt.date(a1, m1, int(m.group(2))), dt.date(a2, m2, int(m.group(5)))
    except ValueError:
        return None
    return (dal, al) if 0 <= (al - dal).days <= 13 else None


def leggi(pagina: str) -> dict[str, list[tuple[dt.date, dt.date, float]]]:
    """Le settimane di ogni tabella: {"percentuale": [(dal, al, 50.0), ...], "economy": [...]}."""
    righe = righe_di_testo(pagina)
    out: dict[str, list[tuple[dt.date, dt.date, float]]] = {}
    for i, r in enumerate(righe):
        chiave = TABELLE.get(re.sub(r"[^a-z]", "", r.lower()))
        if not chiave or chiave in out:
            continue
        valori: list[tuple[dt.date, dt.date, float]] = []
        j = i + 1
        while j < len(righe) and j < i + 60:
            sett = settimana(righe[j])
            if sett and j + 1 < len(righe) and (m := PERCENTUALE.match(righe[j + 1])):
                valori.append((sett[0], sett[1], float(m.group(1).replace(",", "."))))
                j += 2
            elif valori:
                break                                       # fine della tabella
            else:
                j += 1                                      # intestazioni della tabella
        if valori:
            out[chiave] = valori
    return out


def in_vigore(valori: list[tuple[dt.date, dt.date, float]], oggi: dt.date) -> tuple[dt.date, dt.date, float] | None:
    return next((v for v in valori if v[0] <= oggi <= v[1]), None)


class Carburante:
    def __init__(self, cfg: Config, db: Database, client: httpx.Client | None = None):
        self.cfg, self.db = cfg, db
        self.client = client or httpx.Client(timeout=30, follow_redirects=True,
                                             headers={"User-Agent": "MAGIC-HS (uso interno)", "Accept-Language": "it-IT,it"})

    def oggi(self) -> dt.date:
        return dt.datetime.now(ZoneInfo(self.cfg.fuso)).date()

    def stato(self) -> dict[str, Any]:
        with self.db.connessione() as c:
            imp = self.db.impostazioni(c)
        return {"attivo": bool(self.cfg.carburante_url), "fonte": self.cfg.carburante_url, **(imp["carburante_auto"] or {})}

    def aggiorna(self) -> dict[str, Any]:
        """Legge la pagina e salva il supplemento della settimana in corso; ErroreCarburante se non si puo'."""
        if not self.cfg.carburante_url:
            raise ErroreCarburante("lettura automatica spenta (MAGIC_HS_CARBURANTE_URL vuota)")
        try:
            r = self.client.get(self.cfg.carburante_url)
        except httpx.HTTPError as e:
            raise ErroreCarburante(f"pagina di DHL non raggiungibile ({type(e).__name__})") from None
        if r.status_code != 200 or len(r.content) > 8 * 1024 * 1024:
            raise ErroreCarburante(f"la pagina di DHL ha risposto {r.status_code}")
        tabelle, oggi = leggi(r.text), self.oggi()
        express = in_vigore(tabelle.get("percentuale", []), oggi)
        if express is None:
            raise ErroreCarburante("nella pagina di DHL non c'è il supplemento dei servizi internazionali di questa settimana")
        economy = in_vigore(tabelle.get("economy", []), oggi)
        valore = {"percentuale": express[2], "economy": economy[2] if economy else None, "dal": express[0].isoformat(),
                  "al": express[1].isoformat(), "aggiornato": iso(), "autore": "", "fonte": "dhl"}
        with self.db.transazione() as c:
            prima = self.db.impostazioni(c)["carburante"] or {}
            self.db.salva_impostazioni(c, {"carburante": valore, "carburante_auto": {"esito": "ok", "tentato": iso(), "riuscito": iso(), "messaggio": ""}})
            if (prima.get("percentuale"), prima.get("economy"), prima.get("dal")) != (valore["percentuale"], valore["economy"], valore["dal"]):
                self.db.evento(c, "carburante", dettagli=f"{valore['percentuale']:g} %" + (f" (Economy Select {valore['economy']:g} %)" if economy else "")
                               + f" dal {valore['dal']}, dalla pagina di DHL")
        return valore

    def da_fare(self) -> bool:
        if not self.cfg.carburante_url:
            return False
        with self.db.connessione() as c:
            imp = self.db.impostazioni(c)
        auto, attuale = imp["carburante_auto"] or {}, imp["carburante"] or {}
        ora = dt.datetime.now(dt.timezone.utc)

        def ore_da(chiave: str) -> float:
            try:
                return (ora - da_iso(auto[chiave])).total_seconds() / 3600
            except (KeyError, ValueError, TypeError):
                return 1e9
        if auto.get("esito") == "errore" and ore_da("tentato") < 6:
            return False                                    # dopo un errore si riprova dopo 6 ore
        finita = str(attuale.get("al") or "") < self.oggi().isoformat()
        if attuale.get("fonte") == "mano" and not finita:
            return False                                    # scritto a mano: vale fino alla fine della sua settimana
        return finita or ore_da("riuscito") >= 24

    def automatica(self) -> None:
        """Compito del pianificatore."""
        if not self.da_fare():
            return
        try:
            v = self.aggiorna()
            log.info("supplemento carburante di DHL: %s %%", v["percentuale"])
        except ErroreCarburante as e:
            log.warning("supplemento carburante non aggiornato: %s", e)
            with self.db.transazione() as c:
                auto = self.db.impostazioni(c)["carburante_auto"] or {}
                self.db.salva_impostazioni(c, {"carburante_auto": {**auto, "esito": "errore", "tentato": iso(), "messaggio": str(e)}})


__all__ = ["Carburante", "ErroreCarburante", "in_vigore", "leggi", "settimana"]
