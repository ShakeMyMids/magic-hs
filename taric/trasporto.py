"""Tariffe del calcolatore del trasporto (sezione Bolla): la «Guida ai servizi e alle tariffe» di DHL Express caricata
dall'amministratore in Gestione, letta e controllata da leggi_tariffe.py in un processo a parte (il PDF e' un dato non
fidato), e il supplemento carburante della settimana, che DHL pubblica a parte e che l'amministratore scrive a mano.

Ogni PDF che supera i controlli diventa una versione nella tabella tariffe_trasporto e va subito in uso; le versioni
precedenti restano e si possono rimettere. Il PDF non si conserva: i dati letti sono nel database (e quindi nei backup)."""
from __future__ import annotations

import json
import subprocess
import sys
import tempfile
import threading
from pathlib import Path
from typing import Any

from .db import Database, iso

LETTORE = Path(__file__).with_name("leggi_tariffe.py")
MASSIMO_PDF = 50 * 1024 * 1024


class ErroreTariffe(Exception):
    def __init__(self, messaggio: str, codice: str = "pdf_non_valido", registro: str = ""):
        super().__init__(messaggio)
        self.messaggio, self.codice, self.registro = messaggio, codice, registro


class Tariffe:
    def __init__(self, db: Database, cartella: Path):
        self.db = db
        self.cartella = cartella
        self.cartella.mkdir(parents=True, exist_ok=True)
        self._caricamento = threading.Lock()
        self._in_uso: tuple[int, dict[str, Any]] | None = None       # (id, dati) della versione in uso, letta una volta

    # ------------------------------------------------------------ lettura del PDF
    def leggi_pdf(self, pdf: Path) -> tuple[dict[str, Any], str]:
        """I dati letti dal PDF e il riepilogo; ErroreTariffe se il PDF non supera i controlli."""
        with tempfile.TemporaryDirectory(dir=self.cartella) as t:
            uscita = Path(t) / "tariffe.json"
            try:
                p = subprocess.run([sys.executable, "-I", "-X", "utf8", str(LETTORE), str(pdf), str(uscita)],
                                   capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=180, cwd=t)
            except subprocess.TimeoutExpired:
                raise ErroreTariffe("La lettura del PDF ha superato il tempo massimo.") from None
            righe = [r.rstrip() for r in p.stdout.splitlines() if r.strip()]
            registro = "\n".join(righe)[-8000:]
            if p.returncode != 0 or not righe or righe[-1] != "CONTROLLI OK" or not uscita.is_file():
                motivi = [r.lstrip("- ").strip() for r in righe if r.startswith(("- ", "ERRORE lettura"))]
                raise ErroreTariffe("Il PDF non è una guida alle tariffe di DHL Express leggibile: "
                                    + ("; ".join(motivi)[:600] or f"codice di uscita {p.returncode}") + ".", registro=registro)
            dati = json.loads(uscita.read_text(encoding="utf-8"))
        return dati, "\n".join(r for r in righe[:-1] if not r.startswith("avviso: "))

    def carica(self, pdf: Path, autore_id: int | None) -> dict[str, Any]:
        """Legge il PDF e, se va bene, lo installa come nuova versione in uso."""
        if not self._caricamento.acquire(blocking=False):
            raise ErroreTariffe("C'è già un caricamento in corso: riprova tra poco.", "in_corso")
        try:
            dati, riepilogo = self.leggi_pdf(pdf)
            with self.db.transazione() as c:
                c.execute("UPDATE tariffe_trasporto SET attiva = 0")
                vid = c.execute("INSERT INTO tariffe_trasporto(caricata, autore_id, titolo, validita, dati, riepilogo, attiva) "
                                "VALUES (?, ?, ?, ?, ?, ?, 1)",
                                (iso(), autore_id, dati["titolo"], dati.get("validita") or "",
                                 json.dumps(dati, ensure_ascii=False, separators=(",", ":")), riepilogo)).lastrowid
                self.db.evento(c, "tariffe_trasporto", autore_id=autore_id,
                               dettagli=f"{dati['titolo']}, validità {dati.get('validita') or 'non indicata'}")
            self._in_uso = None
            return {"id": vid, "titolo": dati["titolo"], "validita": dati.get("validita") or "", "avvisi": dati.get("avvisi", []),
                    "riepilogo": riepilogo}
        finally:
            self._caricamento.release()

    # ------------------------------------------------------------ versioni
    def in_uso(self) -> dict[str, Any] | None:
        """I dati della versione in uso (con id e data di caricamento), None se non c'e' ancora una tariffa."""
        with self.db.connessione() as c:
            r = c.execute("SELECT id, caricata FROM tariffe_trasporto WHERE attiva = 1").fetchone()
            if r is None:
                return None
            if self._in_uso is None or self._in_uso[0] != r["id"]:
                dati = json.loads(c.execute("SELECT dati FROM tariffe_trasporto WHERE id = ?", (r["id"],)).fetchone()["dati"])
                self._in_uso = (r["id"], {**dati, "id": r["id"], "caricata": r["caricata"]})
            return self._in_uso[1]

    def versioni(self) -> list[dict[str, Any]]:
        with self.db.connessione() as c:
            righe = c.execute("SELECT t.id, t.caricata, t.titolo, t.validita, t.riepilogo, t.attiva, "
                              "json_extract(t.dati, '$.avvisi') AS avvisi, u.nome AS autore "
                              "FROM tariffe_trasporto t LEFT JOIN utenti u ON u.id = t.autore_id ORDER BY t.id DESC").fetchall()
        return [{**dict(r), "attiva": bool(r["attiva"]), "avvisi": json.loads(r["avvisi"] or "[]")} for r in righe]

    def imposta_attiva(self, vid: int, autore_id: int | None) -> None:
        with self.db.transazione() as c:
            r = c.execute("SELECT titolo, validita FROM tariffe_trasporto WHERE id = ?", (vid,)).fetchone()
            if r is None:
                raise ErroreTariffe("Versione delle tariffe non trovata.", "non_trovato")
            c.execute("UPDATE tariffe_trasporto SET attiva = (id = ?)", (vid,))
            self.db.evento(c, "tariffe_trasporto_attivate", autore_id=autore_id,
                           dettagli=f"{r['titolo']}, validità {r['validita'] or 'non indicata'}")
        self._in_uso = None


__all__ = ["ErroreTariffe", "MASSIMO_PDF", "Tariffe"]
