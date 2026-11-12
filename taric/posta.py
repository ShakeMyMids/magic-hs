"""Invio delle email. Senza server SMTP configurato i messaggi restano nella cartella dati/posta,
visibili all'amministratore nel pannello (cosi' i link si possono comunque recapitare a mano)."""
from __future__ import annotations

import json
import logging
import secrets
import smtplib
import ssl
import threading
from email.message import EmailMessage
from email.utils import formatdate, make_msgid
from pathlib import Path

from .config import Config
from .db import adesso

log = logging.getLogger("taric.posta")


class Posta:
    def __init__(self, cfg: Config):
        self.cfg = cfg
        self.cartella = cfg.dati / "posta"
        self.cartella.mkdir(parents=True, exist_ok=True)

    @property
    def configurata(self) -> bool:
        return self.cfg.posta_configurata

    def invia(self, destinatario: str, oggetto: str, testo: str, attendi: bool = False) -> None:
        msg = EmailMessage()
        msg["From"] = self.cfg.smtp_mittente or "TARIC 2.0 <noreply@localhost>"
        msg["To"] = destinatario
        msg["Subject"] = oggetto
        msg["Date"] = formatdate(localtime=False)
        msg["Message-ID"] = make_msgid(domain="taric.local")
        msg.set_content(testo + "\n\n--\nTARIC 2.0 - messaggio automatico, non rispondere.\n")
        if not self.configurata:
            self._in_uscita(msg, destinatario, oggetto, testo, "non inviata: posta non configurata")
            return
        t = threading.Thread(target=self._spedisci, args=(msg, destinatario, oggetto, testo), daemon=True)
        t.start()
        if attendi:
            t.join(60)

    def _spedisci(self, msg: EmailMessage, destinatario: str, oggetto: str, testo: str) -> None:
        c = self.cfg
        try:
            if c.smtp_sicurezza == "ssl":
                s = smtplib.SMTP_SSL(c.smtp_host, c.smtp_porta, timeout=30, context=ssl.create_default_context())
            else:
                s = smtplib.SMTP(c.smtp_host, c.smtp_porta, timeout=30)
                if c.smtp_sicurezza == "starttls":
                    s.starttls(context=ssl.create_default_context())
            with s:
                if c.smtp_utente:
                    s.login(c.smtp_utente, c.smtp_password)
                s.send_message(msg)
            log.info("email inviata a %s: %s", destinatario, oggetto)
        except Exception as e:  # la consegna non deve mai bloccare il sito
            log.error("invio email a %s non riuscito: %s", destinatario, e)
            self._in_uscita(msg, destinatario, oggetto, testo, f"invio non riuscito: {type(e).__name__}: {e}")

    def _in_uscita(self, msg: EmailMessage, destinatario: str, oggetto: str, testo: str, stato: str) -> None:
        nome = adesso().strftime("%Y%m%d-%H%M%S-") + secrets.token_hex(3)
        (self.cartella / (nome + ".eml")).write_bytes(bytes(msg))
        (self.cartella / (nome + ".json")).write_text(json.dumps(
            {"quando": adesso().strftime("%Y-%m-%dT%H:%M:%SZ"), "a": destinatario, "oggetto": oggetto, "testo": testo, "stato": stato},
            ensure_ascii=False), encoding="utf-8")
        log.warning("email per %s salvata in %s (%s)", destinatario, self.cartella, stato)
        self._pota()

    def _pota(self, massimo: int = 300) -> None:
        file = sorted(self.cartella.glob("*.json"))
        for f in file[:-massimo]:
            f.unlink(missing_ok=True)
            f.with_suffix(".eml").unlink(missing_ok=True)

    def in_uscita(self, limite: int = 50) -> list[dict]:
        out = []
        for f in sorted(self.cartella.glob("*.json"), reverse=True)[:limite]:
            try:
                d = json.loads(f.read_text(encoding="utf-8"))
                d["id"] = f.stem
                out.append(d)
            except (OSError, ValueError):
                continue
        return out


def percorso_posta(cfg: Config) -> Path:
    return cfg.dati / "posta"
