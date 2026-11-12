"""Configurazione di MAGIC HS.

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
    ia_fornitore: str = ""                 # gemini | anthropic | openai ("" = IA spenta)
    ia_chiave: str = ""
    ia_url: str = ""
    modello_rapido: str = ""
    modello: str = ""
    smtp_host: str = ""
    smtp_porta: int = 587
    smtp_utente: str = ""
    smtp_password: str = ""
    smtp_mittente: str = ""
    smtp_sicurezza: str = "starttls"       # starttls | ssl | nessuna
    fonte_url: str = "https://github.com/rousseauxy/taric-opendata/releases/download/eu-{mese}/eu-taric-{mese}.zip"
    aggiornamento_automatico: bool = True
    fuso: str = "Europe/Rome"
    backup_copie: int = 14                 # backup automatici del database da tenere (0 = nessun backup automatico)
    stripe_chiave: str = ""                # chiave segreta Stripe (sk_live_... o sk_test_...): senza, i piani a pagamento sono spenti
    stripe_firma: str = ""                 # segreto di firma del webhook (whsec_...)
    stripe_tasse: bool = False             # calcolo automatico dell'IVA con Stripe Tax (va attivato anche su Stripe)
    stripe_url: str = "https://api.stripe.com/v1"   # da cambiare solo per le prove
    venditore: str = ""                    # chi vende il piano Pro (nome o ragione sociale): compare nelle condizioni di vendita
    venditore_piva: str = ""
    venditore_indirizzo: str = ""
    venditore_email: str = ""
    locale: bool = False                   # programma per Windows sul PC: un solo utente, senza accesso (vedi programma.py)
    condivisa: Path | None = None          # cartella condivisa (OneDrive) da cui il programma riceve versioni, dati e impostazioni
    scarica_dati: bool = True              # scarica da solo i dati TARIC dalla fonte (spento sui PC che li ricevono dalla cartella)
    extra: dict[str, str] = field(default_factory=dict)

    @property
    def ia_disponibile(self) -> bool:
        if self.ia_fornitore == "openai":           # servizi compatibili OpenAI; Ollama in locale non vuole chiave
            return bool(self.ia_url and self.modello)
        return self.ia_fornitore in ("gemini", "anthropic") and bool(self.ia_chiave)

    @property
    def ia_nome(self) -> str:
        return {"gemini": "Gemini (Google)", "anthropic": "Claude (Anthropic)"}.get(self.ia_fornitore, self.modello or "")

    @property
    def posta_configurata(self) -> bool:
        return bool(self.smtp_host and self.smtp_mittente)

    def imposta_ia(self, valori: dict[str, str]) -> None:
        """Cambia il servizio IA mentre il programma è in funzione (impostazioni della cartella condivisa)."""
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

    ia = _ia(v)
    return Config(
        dati=dati,
        host=v.get("TARIC_HOST", "127.0.0.1"),
        porta=int(v.get("TARIC_PORTA", "8000")),
        url_pubblico=v.get("TARIC_URL_PUBBLICO", "").rstrip("/"),
        proxy_fidati=v.get("TARIC_PROXY_FIDATI", "127.0.0.1"),
        cookie_sicuro=v.get("TARIC_COOKIE_SICURO", "auto").lower(),
        segreto=segreto,
        ia_fornitore=ia[0], ia_chiave=ia[1], ia_url=ia[2], modello_rapido=ia[3], modello=ia[4],
        smtp_host=v.get("TARIC_SMTP_HOST", ""),
        smtp_porta=int(v.get("TARIC_SMTP_PORTA", "587")),
        smtp_utente=v.get("TARIC_SMTP_UTENTE", ""),
        smtp_password=v.get("TARIC_SMTP_PASSWORD", ""),
        smtp_mittente=v.get("TARIC_SMTP_MITTENTE", ""),
        smtp_sicurezza=v.get("TARIC_SMTP_SICUREZZA", "starttls").lower(),
        fonte_url=v.get("TARIC_FONTE_URL", Config.fonte_url),
        aggiornamento_automatico=_bool(v.get("TARIC_AGGIORNAMENTO_AUTOMATICO"), True),
        fuso=v.get("TARIC_FUSO", "Europe/Rome"),
        backup_copie=max(0, int(v.get("TARIC_BACKUP_COPIE", "14") or 14)),
        stripe_chiave=v.get("TARIC_STRIPE_CHIAVE", "").strip(),
        stripe_firma=v.get("TARIC_STRIPE_FIRMA_WEBHOOK", "").strip(),
        stripe_tasse=_bool(v.get("TARIC_STRIPE_TASSE"), False),
        stripe_url=v.get("TARIC_STRIPE_URL", "https://api.stripe.com/v1").rstrip("/"),
        venditore=v.get("TARIC_VENDITORE", "").strip(),
        venditore_piva=v.get("TARIC_VENDITORE_PIVA", "").strip(),
        venditore_indirizzo=v.get("TARIC_VENDITORE_INDIRIZZO", "").strip(),
        venditore_email=v.get("TARIC_VENDITORE_EMAIL", "").strip(),
        locale=_bool(v.get("TARIC_LOCALE"), False),
        condivisa=Path(v["TARIC_CONDIVISA"]) if v.get("TARIC_CONDIVISA") else None,
        scarica_dati=_bool(v.get("TARIC_SCARICA_DATI"), True),
        extra=v,
    )
