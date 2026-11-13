"""Configurazione di MAGIC HS sul PC.

La imposta programma.py (cartella dei dati, porta, cartella dei programmi). Per casi particolari si possono aggiungere
variabili d'ambiente TARIC_* o un file indicato da TARIC_CONFIG (programma.py usa ``taric.env`` nella cartella
dell'utente, se esiste): per esempio TARIC_FONTE_URL o TARIC_FUSO. Le variabili d'ambiente hanno la precedenza sul file.
Il servizio IA lo sceglie ognuno in Impostazioni: e' salvato nel database del PC (app.applica_ia).
"""
from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path


def _leggi_file(percorso: Path) -> dict[str, str]:
    valori: dict[str, str] = {}
    if not percorso.is_file():
        return valori
    for riga in percorso.read_text(encoding="utf-8").splitlines():
        riga = riga.strip()
        if not riga or riga.startswith("#") or "=" not in riga:
            continue
        chiave, valore = riga.split("=", 1)
        valore = valore.strip()
        if len(valore) >= 2 and valore[0] == valore[-1] and valore[0] in "\"'":
            valore = valore[1:-1]
        elif " #" in valore:                      # commento in fondo alla riga
            valore = valore.split(" #", 1)[0].rstrip()
        valori[chiave.strip()] = valore
    return valori


def _bool(v: str | None, predefinito: bool) -> bool:
    if v is None or v == "":
        return predefinito
    return v.strip().lower() in ("1", "si", "sì", "true", "yes", "on")


@dataclass
class Config:
    dati: Path
    porta: int = 8765
    ia_fornitore: str = ""                 # gemini | anthropic | openai ("" = IA spenta)
    ia_chiave: str = ""
    ia_url: str = ""
    modello_rapido: str = ""
    modello: str = ""
    fonte_url: str = "https://github.com/rousseauxy/taric-opendata/releases/download/eu-{mese}/eu-taric-{mese}.zip"
    aggiornamento_automatico: bool = True
    fuso: str = "Europe/Rome"
    backup_copie: int = 7                  # backup automatici del database da tenere (0 = nessun backup automatico)
    avvio: Path | None = None              # cartella di «Avvia MAGIC HS.cmd» (per importare le impostazioni della vecchia cartella condivisa)
    programmi: Path | None = None          # %LOCALAPPDATA%\\MAGIC HS\\programma: dove si installano le nuove versioni (None = nessun aggiornamento)
    scarica_dati: bool = True              # prende da solo i dati TARIC del mese
    aggiornamenti_url: str = "https://api.github.com/repos/ShakeMyMids/magic-hs/releases/latest"   # "" = niente controllo
    dati_url: str = "https://api.github.com/repos/ShakeMyMids/magic-hs/releases/tags/dati"        # dati pronti; "" = sempre in locale
    extra: dict[str, str] = field(default_factory=dict)

    @property
    def ia_disponibile(self) -> bool:
        if self.ia_fornitore == "openai":           # servizi compatibili OpenAI; Ollama in locale non vuole chiave
            return bool(self.ia_url and self.modello)
        return self.ia_fornitore in ("gemini", "anthropic") and bool(self.ia_chiave)

    @property
    def ia_nome(self) -> str:
        return {"gemini": "Gemini (Google)", "anthropic": "Claude (Anthropic)"}.get(self.ia_fornitore, self.modello or "")

    def imposta_ia(self, valori: dict[str, str]) -> None:
        """Cambia il servizio IA mentre il programma è in funzione (scelta in Impostazioni)."""
        self.ia_fornitore, self.ia_chiave, self.ia_url, self.modello_rapido, self.modello = _ia(valori)


# modelli e indirizzi predefiniti per fornitore: (rapido, principale, url)
FORNITORI = {
    "gemini": ("gemini-3.5-flash-lite", "gemini-3.7-flash", "https://generativelanguage.googleapis.com/v1beta"),
    "anthropic": ("claude-haiku-5-5", "claude-sonnet-5-5", "https://api.anthropic.com/v1/messages"),
    "openai": ("", "", ""),
}


def _ia(v: dict[str, str]) -> tuple[str, str, str, str, str]:
    """Sceglie il servizio IA: TARIC_IA_FORNITORE se indicato, altrimenti la prima chiave trovata (Gemini, poi Claude)."""
    gemini = v.get("GEMINI_API_KEY") or v.get("GOOGLE_API_KEY") or ""
    anthropic = v.get("ANTHROPIC_API_KEY", "")
    chiave = v.get("TARIC_IA_CHIAVE", "")
    fornitore = v.get("TARIC_IA_FORNITORE", "").strip().lower()
    if not fornitore:
        fornitore = "gemini" if gemini else "anthropic" if anthropic else "openai" if v.get("TARIC_IA_URL") else ""
    if fornitore not in FORNITORI:
        fornitore = ""
    if not chiave:
        chiave = {"gemini": gemini, "anthropic": anthropic}.get(fornitore, "")
    rapido, principale, url = FORNITORI.get(fornitore, ("", "", ""))
    principale = v.get("TARIC_IA_MODELLO") or v.get("TARIC_MODELLO") or principale
    rapido = v.get("TARIC_IA_MODELLO_RAPIDO") or v.get("TARIC_MODELLO_RAPIDO") or rapido or principale
    url = (v.get("TARIC_IA_URL") or url).rstrip("/")
    return fornitore, chiave, url, rapido, principale


def carica(sovrascrivi: dict[str, str] | None = None) -> Config:
    file_conf = Path(os.environ.get("TARIC_CONFIG", "taric.env"))
    v = _leggi_file(file_conf)
    v.update({k: val for k, val in os.environ.items() if k.startswith(("TARIC_", "ANTHROPIC_", "GEMINI_", "GOOGLE_API_KEY"))})
    if sovrascrivi:
        v.update(sovrascrivi)

    dati = Path(v.get("TARIC_DATI", "dati")).resolve()
    dati.mkdir(parents=True, exist_ok=True)
    ia = _ia(v)
    return Config(
        dati=dati,
        porta=int(v.get("TARIC_PORTA", "8765")),
        ia_fornitore=ia[0], ia_chiave=ia[1], ia_url=ia[2], modello_rapido=ia[3], modello=ia[4],
        fonte_url=v.get("TARIC_FONTE_URL", Config.fonte_url),
        aggiornamento_automatico=_bool(v.get("TARIC_AGGIORNAMENTO_AUTOMATICO"), True),
        scarica_dati=_bool(v.get("TARIC_SCARICA_DATI"), True),
        fuso=v.get("TARIC_FUSO", "Europe/Rome"),
        backup_copie=max(0, int(v.get("TARIC_BACKUP_COPIE", "7") or 7)),
        avvio=Path(v["TARIC_AVVIO"]) if v.get("TARIC_AVVIO") else None,
        programmi=Path(v["TARIC_PROGRAMMI"]) if v.get("TARIC_PROGRAMMI") else None,
        aggiornamenti_url=v.get("TARIC_AGGIORNAMENTI_URL", Config.aggiornamenti_url).strip(),
        dati_url=v.get("TARIC_DATI_URL", Config.dati_url).strip(),
        extra=v,
    )
