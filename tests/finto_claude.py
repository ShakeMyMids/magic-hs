"""Finti servizi esterni per le prove dell'interfaccia (nessuna chiamata reale):
- IA: risponde nei formati di Anthropic (/v1/messages, con lo strumento «risposta» come tool_use), Gemini
  (/v1beta/models/<modello>:generateContent) e compatibile OpenAI (/v1/chat/completions); accetta solo la chiave
  «chiave-finta».
- GitHub: la pagina /github/releases/tags/dati con i dati pronti indicati sulla riga di comando (archivi
  dati-AAAA-MM-01.zip, per esempio fatti con strumenti/dati_mese.py) e, per la prova dei mesi passati, una loro copia
  datata settembre 2025 (MESE_PASSATO).
- Cambi della BCE per la bolla simulata: /bce/D.<VALUTA>.EUR.SP00.A?startPeriod=...&endPeriod=...&format=csvdata, in CSV
  con le colonne TIME_PERIOD e OBS_VALUE, un cambio fisso per ogni giorno feriale (USD 1.0867, CNY 7.7341, GBP 0.8712);
  le altre valute rispondono 404 come la BCE (MAGIC_HS_BCE_URL=http://127.0.0.1:9100/bce).
- Pagina dei supplementi di DHL Express con il carburante della settimana: /dhl/surcharges.html
  (MAGIC_HS_CARBURANTE_URL=http://127.0.0.1:9100/dhl/surcharges.html), 50 % per i servizi internazionali e 40 % per Economy Select.
- Archivio S3 per la copia esterna del database: PUT e GET sotto /s3/ (MAGIC_HS_COPIA_URL=http://127.0.0.1:9100/s3/magic-hs),
  accetta solo la chiave «chiave-s3-finta» e il contenuto con l'impronta dichiarata; GET /s3/ elenca gli oggetti.
Uso: python tests/finto_claude.py 9100 [dati-AAAA-MM-01.zip ...], poi il sito con TARIC_IA_FORNITORE=openai,
TARIC_IA_URL=http://127.0.0.1:9100/v1, TARIC_IA_CHIAVE=chiave-finta e TARIC_DATI_URL=http://127.0.0.1:9100/github/releases/tags/dati
(vedi README, «Sviluppo», e tests/e2e_sito.js)."""
import datetime
import hashlib
import io
import json
import re
import sys
import zipfile
from urllib.parse import parse_qs, urlsplit
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

DATI: dict[str, bytes] = {}            # nome dell'archivio -> contenuto
MESE_PASSATO = "2025-09-01"


def come_mese(b: bytes, versione: str) -> bytes:
    """Lo stesso archivio dei dati come se fosse di un altro mese: cambiano versione.json e la data della nomenclatura."""
    entra, esce = zipfile.ZipFile(io.BytesIO(b)), io.BytesIO()
    with zipfile.ZipFile(esce, "w", zipfile.ZIP_DEFLATED) as z:
        for i in entra.infolist():
            d = entra.read(i)
            if i.filename == "versione.json":
                d = json.dumps({**json.loads(d), "data": versione}).encode()
            elif i.filename == "nomenclatura.js":
                d = re.sub(rb'"data_riferimento":"\d{4}-\d{2}-\d{2}"', f'"data_riferimento":"{versione}"'.encode(), d, count=1)
            z.writestr(i.filename, d)
    return esce.getvalue()
S3: dict[str, bytes] = {}              # percorso -> contenuto (copia esterna del database)
CAMBI = {"USD": "1.0867", "CNY": "7.7341", "GBP": "0.8712"}


MESI_IT = ["Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno", "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre"]


def pagina_carburante(oggi: datetime.date, express: float = 50.0, economy: float = 40.0) -> str:
    """La pagina dei supplementi di DHL Express come la pubblica DHL (/dhl/surcharges.html, MAGIC_HS_CARBURANTE_URL): una
    tabella per gruppo di servizi, una riga per settimana, dalla prossima alle precedenti; questa settimana vale express
    (servizi internazionali) ed economy (Day Definite Intra-Europe), le altre 0,25 in meno."""
    lunedi = oggi - datetime.timedelta(days=oggi.weekday())

    def sett(d: datetime.date) -> str:
        f = d + datetime.timedelta(days=6)
        if d.year != f.year:
            return f"{MESI_IT[d.month - 1]} {d.day}, {d.year}-{MESI_IT[f.month - 1]} {f.day}, {f.year}"
        return f"{MESI_IT[d.month - 1]} {d.day}-" + (f"{MESI_IT[f.month - 1]} " if f.month != d.month else "") + f"{f.day}, {f.year}"

    def tabella(titolo: str, valore: float) -> str:
        righe = "".join(f"<tr><td><div class=\"v2-p\">{sett(lunedi + datetime.timedelta(days=7 * k))}</div></td>"
                        f"<td><div class=\"v2-p\">{valore - (0 if k == 0 else 0.25):.2f}%</div></td></tr>" for k in (1, 0, -1, -2, -3))
        return (f"<div class=\"v2-p\"><strong>{titolo}</strong></div><table><tbody><tr><th><strong>Data di entrata in vigore</strong></th>"
                f"<th><strong>Supplementi</strong></th></tr>{righe}</tbody></table><div>Di Più Sui {titolo} Supplemento Carburante</div>")
    return ("<!DOCTYPE html><html lang=\"it-IT\"><head><title>Servizi opzionali</title><script>var x = \"Novembre 1-7, 2026\";</script>"
            "</head><body><h2>Supplemento Carburante</h2><p>DHL implementerà aggiornamenti settimanali del supplemento carburante</p>"
            + tabella("Servizi Internazionali Time Definite", express) + tabella("Servizi Nazionali Time Definite", 30.0)
            + tabella("Servizi Day Definite Intra-Europe", economy) + "</body></html>")


def cambi_bce(percorso: str) -> tuple[int, str]:
    parti = urlsplit(percorso)
    valuta = parti.path.rsplit("/", 1)[-1].split(".")[1]
    q = parse_qs(parti.query)
    da, a = datetime.date.fromisoformat(q["startPeriod"][0]), datetime.date.fromisoformat(q["endPeriod"][0])
    if valuta not in CAMBI:
        return 404, "No results found."
    righe = ["KEY,FREQ,CURRENCY,CURRENCY_DENOM,EXR_TYPE,EXR_SUFFIX,TIME_PERIOD,OBS_VALUE"]
    g = da
    while g <= a:
        if g.weekday() < 5:
            righe.append(f"EXR.D.{valuta}.EUR.SP00.A,D,{valuta},EUR,SP00,A,{g.isoformat()},{CAMBI[valuta]}")
        g += datetime.timedelta(days=1)
    return 200, "\n".join(righe) + "\n"


def rispondi(prompt: str, foto: bool = False) -> object:
    if prompt.startswith("Traduci dall"):
        n = prompt.count("\n") and len([r for r in prompt.split("\n") if r[:1].isdigit() and ". " in r[:5]])
        return {"traduzioni": [f"Traduzione di prova {i + 1}" for i in range(n)]}
    if "Compito: indica le voci" in prompt:
        if "asdf" in prompt:
            return {"merce": "", "voci": [], "non_classificabile": "Il testo non descrive una merce."}
        return {"merce": "Scarpa sportiva bianca vista nella foto" if foto else "Scarpe sportive",
                "voci": [{"voce": "6403", "motivo": "tomaia in cuoio"}, {"voce": "6404", "motivo": "tomaia tessile"}], "non_classificabile": None}
    if "INFORMAZIONI GIÀ FORNITE" not in prompt:
        return {"merce": "Scarpa da ginnastica bianca con tomaia in pelle, dalla foto" if foto else "Scarpe da ginnastica con tomaia in pelle",
                "migliore": {"codice": "6403 99 96 10", "descrizione_it": "Calzature per lo sport con tomaia di cuoio, da uomo.",
                             "motivazione": "Suola di gomma e tomaia di cuoio naturale: voce 6403.", "confidenza": 62},
                "alternative": [{"codice": "6403999810", "descrizione_it": "Le stesse calzature, da donna", "quando": "Se è un modello da donna.", "confidenza": 40},
                                {"codice": "6404110000", "descrizione_it": "Calzature sportive con tomaia tessile", "quando": "Se la tomaia è tessile.", "confidenza": 20}],
                "domande": [{"domanda": "A chi sono destinate?", "opzioni": ["Uomo", "Donna", "Bambino"], "perche": "Distingue le sottovoci."}],
                "altre_voci": []}
    return {"merce": "Scarpe da ginnastica con tomaia in pelle, da uomo",
            "migliore": {"codice": "6403999610", "descrizione_it": "Calzature per lo sport con tomaia di cuoio, da uomo.",
                         "motivazione": "Risposta: uomo.", "confidenza": 88},
            "alternative": [], "domande": [], "altre_voci": []}


def jpeg_valido(dati: str) -> bool:
    """La foto della merce arriva come JPEG in base64 (rimpicciolita dal browser, js/foto.js)."""
    import base64
    try:
        b = base64.b64decode(dati, validate=True)
    except ValueError:
        return False
    return b[:3] == b"\xff\xd8\xff" and b[-2:] == b"\xff\xd9"


def testo_e_foto(parti: list, testo: str, immagine) -> tuple[str, bool | None]:
    """Il testo delle parti di un messaggio e se c'è una foto (None = foto non valida)."""
    foto = [immagine(x) for x in parti if immagine(x) is not None]
    return "\n\n".join(x[testo] for x in parti if testo in x), (None if not all(jpeg_valido(f) for f in foto) else bool(foto))


class Gestore(BaseHTTPRequestHandler):
    # ------------------------------------------------------------------ finto GitHub
    def do_GET(self):  # noqa: N802
        base = f"http://127.0.0.1:{self.server.server_port}/github"
        if self.path == "/github/releases/tags/dati":
            self._json(200, {"tag_name": "dati", "prerelease": True, "assets": [
                {"name": n, "size": len(b), "digest": "sha256:" + hashlib.sha256(b).hexdigest(), "browser_download_url": base + "/dati/" + n}
                for n, b in DATI.items()]})
        elif self.path.startswith("/github/dati/") and self.path[13:] in DATI:
            b = DATI[self.path[13:]]
            self.send_response(200)
            self.send_header("content-type", "application/octet-stream")
            self.send_header("content-length", str(len(b)))
            self.end_headers()
            self.wfile.write(b)
        elif self.path == "/dhl/surcharges.html":
            b = pagina_carburante(datetime.date.today()).encode()
            self.send_response(200)
            self.send_header("content-type", "text/html; charset=utf-8")
            self.send_header("content-length", str(len(b)))
            self.end_headers()
            self.wfile.write(b)
        elif self.path.startswith("/bce/"):
            stato, testo = cambi_bce(self.path)
            b = testo.encode()
            self.send_response(stato)
            self.send_header("content-type", "text/csv")
            self.send_header("content-length", str(len(b)))
            self.end_headers()
            self.wfile.write(b)
        elif self.path == "/s3/":
            self._json(200, {"oggetti": {k: len(v) for k, v in S3.items()}})
        elif self.path in S3:
            self.send_response(200)
            self.send_header("content-length", str(len(S3[self.path])))
            self.end_headers()
            self.wfile.write(S3[self.path])
        elif self.path == "/v1/models":
            if (self.headers.get("authorization") or "") != "Bearer chiave-finta":
                self._json(401, {"error": {"message": "API key not valid"}})
            else:
                self._json(200, {"data": [{"id": "finto-modello"}, {"id": "finto-modello-rapido"}]})
        else:
            self._json(404, {"message": "Not Found"})

    # ------------------------------------------------------------------ finta IA
    def do_POST(self):  # noqa: N802
        corpo = json.loads(self.rfile.read(int(self.headers.get("content-length", 0))))
        chiave = self.headers.get("x-api-key") or self.headers.get("x-goog-api-key") or (self.headers.get("authorization") or "").replace("Bearer ", "")
        if not chiave.startswith("chiave-finta"):         # «chiave-finta», anche con un seguito (guida di Gemini)
            self._json(401, {"error": {"message": "API key not valid"}})
            return
        if ":generateContent" in self.path:
            prompt, foto = testo_e_foto(corpo["contents"][0]["parts"], "text", lambda x: (x.get("inlineData") or {}).get("data"))
            if foto is None:
                self._json(400, {"error": {"code": 400, "message": "Unable to process input image."}})
                return
            testo = json.dumps(rispondi(prompt, foto), ensure_ascii=False)
            self._json(200, {"candidates": [{"content": {"role": "model", "parts": [{"text": testo}]}, "finishReason": "STOP"}],
                             "usageMetadata": {"promptTokenCount": len(prompt) // 4, "candidatesTokenCount": len(testo) // 4}})
        elif self.path.endswith("/chat/completions"):
            contenuto = corpo["messages"][-1]["content"]
            prompt, foto = (contenuto, False) if isinstance(contenuto, str) else testo_e_foto(
                contenuto, "text", lambda x: (x.get("image_url") or {}).get("url", "").removeprefix("data:image/jpeg;base64,") or None)
            if foto is None:
                self._json(400, {"error": {"message": "Invalid image."}})
                return
            testo = json.dumps(rispondi(prompt, foto), ensure_ascii=False)
            self._json(200, {"choices": [{"message": {"role": "assistant", "content": testo}, "finish_reason": "stop"}],
                             "usage": {"prompt_tokens": len(prompt) // 4, "completion_tokens": len(testo) // 4}})
        else:
            contenuto = corpo["messages"][0]["content"]
            prompt, foto = (contenuto, False) if isinstance(contenuto, str) else testo_e_foto(
                contenuto, "text", lambda x: (x.get("source") or {}).get("data"))
            if foto is None:
                self._json(400, {"error": {"type": "invalid_request_error", "message": "Could not process image"}})
                return
            risposta = rispondi(prompt, foto)
            testo = json.dumps(risposta, ensure_ascii=False)
            uso = {"input_tokens": len(prompt) // 4, "output_tokens": len(testo) // 4,
                   "cache_read_input_tokens": len(contenuto[0].get("text", "")) // 4 if isinstance(contenuto, list) else 0}
            if corpo.get("tools"):
                self._json(200, {"content": [{"type": "tool_use", "id": "toolu_1", "name": "risposta", "input": risposta}],
                                 "stop_reason": "tool_use", "model": corpo["model"], "usage": uso})
            else:
                self._json(200, {"content": [{"type": "text", "text": testo}], "stop_reason": "end_turn", "model": corpo["model"], "usage": uso})

    # ------------------------------------------------------------------ finto archivio S3
    def do_PUT(self):  # noqa: N802
        corpo = self.rfile.read(int(self.headers.get("content-length", 0)))
        firma = self.headers.get("authorization") or ""
        if not self.path.startswith("/s3/") or not firma.startswith("AWS4-HMAC-SHA256 Credential=chiave-s3-finta/"):
            self._xml(403, "InvalidAccessKeyId")
        elif self.headers.get("x-amz-content-sha256") != hashlib.sha256(corpo).hexdigest():
            self._xml(400, "XAmzContentSHA256Mismatch")
        else:
            S3[self.path] = corpo
            self.send_response(200)
            self.send_header("content-length", "0")
            self.end_headers()

    def _xml(self, stato: int, codice: str) -> None:
        b = f"<Error><Code>{codice}</Code><Message>finto S3</Message></Error>".encode()
        self.send_response(stato)
        self.send_header("content-type", "application/xml")
        self.send_header("content-length", str(len(b)))
        self.end_headers()
        self.wfile.write(b)

    def _json(self, stato: int, dati: object) -> None:
        b = json.dumps(dati).encode()
        self.send_response(stato)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(b)))
        self.end_headers()
        self.wfile.write(b)

    def log_message(self, *a):  # silenzio
        pass


if __name__ == "__main__":
    for f in sys.argv[2:]:
        DATI[Path(f).name] = Path(f).read_bytes()
    if DATI and f"dati-{MESE_PASSATO}.zip" not in DATI:
        DATI[f"dati-{MESE_PASSATO}.zip"] = come_mese(next(iter(DATI.values())), MESE_PASSATO)
    ThreadingHTTPServer(("127.0.0.1", int(sys.argv[1] if len(sys.argv) > 1 else 9100)), Gestore).serve_forever()
