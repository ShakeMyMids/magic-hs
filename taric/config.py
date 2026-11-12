"""Configurazione di TARIC 2.0.

I valori arrivano dalle variabili d'ambiente e, se esiste, dal file indicato da TARIC_CONFIG
(predefinito: ``taric.env`` nella cartella da cui si avvia il server). Le variabili d'ambiente
hanno la precedenza sul file. Vedi ``taric.env.esempio`` per l'elenco commentato.
"""
from __future__ import annotations

import os
import secrets
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
    host: str = "127.0.0.1"
    porta: int = 8000
    url_pubblico: str = ""                 # es. https://taric.miaazienda.it (per i link nelle email)
    proxy_fidati: str = "127.0.0.1"        # indirizzi dei reverse proxy da cui accettare X-Forwarded-*
    cookie_sicuro: str = "auto"            # auto | si | no
    segreto: bytes = b""
    anthropic_key: str = ""
    anthropic_url: str = "https://api.anthropic.com/v1/messages"
    modello_rapido: str = "claude-haiku-5-5"
    modello: str = "claude-sonnet-5-5"
    smtp_host: str = ""
    smtp_porta: int = 587
    smtp_utente: str = ""
    smtp_password: str = ""
    smtp_mittente: str = ""
    smtp_sicurezza: str = "starttls"       # starttls | ssl | nessuna
    fonte_url: str = "https://github.com/rousseauxy/taric-opendata/releases/download/eu-{mese}/eu-taric-{mese}.zip"
    aggiornamento_automatico: bool = True
    fuso: str = "Europe/Rome"
    extra: dict[str, str] = field(default_factory=dict)

    @property
    def ia_disponibile(self) -> bool:
        return bool(self.anthropic_key)

    @property
    def posta_configurata(self) -> bool:
        return bool(self.smtp_host and self.smtp_mittente)


def carica(sovrascrivi: dict[str, str] | None = None) -> Config:
    file_conf = Path(os.environ.get("TARIC_CONFIG", "taric.env"))
    v = _leggi_file(file_conf)
    v.update({k: val for k, val in os.environ.items() if k.startswith(("TARIC_", "ANTHROPIC_"))})
    if sovrascrivi:
        v.update(sovrascrivi)

    dati = Path(v.get("TARIC_DATI", "dati")).resolve()
    dati.mkdir(parents=True, exist_ok=True)

    # chiave segreta per firmare i moduli: dalla configurazione o generata una volta nella cartella dati
    segreto = v.get("TARIC_SEGRETO", "").encode()
    if not segreto:
        f = dati / "segreto.key"
        if not f.exists():
            f.write_text(secrets.token_urlsafe(48), encoding="utf-8")
            try:
                f.chmod(0o600)
            except OSError:
                pass
        segreto = f.read_text(encoding="utf-8").strip().encode()

    return Config(
        dati=dati,
        host=v.get("TARIC_HOST", "127.0.0.1"),
        porta=int(v.get("TARIC_PORTA", "8000")),
        url_pubblico=v.get("TARIC_URL_PUBBLICO", "").rstrip("/"),
        proxy_fidati=v.get("TARIC_PROXY_FIDATI", "127.0.0.1"),
        cookie_sicuro=v.get("TARIC_COOKIE_SICURO", "auto").lower(),
        segreto=segreto,
        anthropic_key=v.get("ANTHROPIC_API_KEY", ""),
        anthropic_url=v.get("TARIC_ANTHROPIC_URL", "https://api.anthropic.com/v1/messages"),
        modello_rapido=v.get("TARIC_MODELLO_RAPIDO", "claude-haiku-5-5"),
        modello=v.get("TARIC_MODELLO", "claude-sonnet-5-5"),
        smtp_host=v.get("TARIC_SMTP_HOST", ""),
        smtp_porta=int(v.get("TARIC_SMTP_PORTA", "587")),
        smtp_utente=v.get("TARIC_SMTP_UTENTE", ""),
        smtp_password=v.get("TARIC_SMTP_PASSWORD", ""),
        smtp_mittente=v.get("TARIC_SMTP_MITTENTE", ""),
        smtp_sicurezza=v.get("TARIC_SMTP_SICUREZZA", "starttls").lower(),
        fonte_url=v.get("TARIC_FONTE_URL", Config.fonte_url),
        aggiornamento_automatico=_bool(v.get("TARIC_AGGIORNAMENTO_AUTOMATICO"), True),
        fuso=v.get("TARIC_FUSO", "Europe/Rome"),
        extra=v,
    )
