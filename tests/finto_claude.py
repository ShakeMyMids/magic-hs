"""Finti servizi esterni per le prove dell'interfaccia (nessuna chiamata reale):
- IA: risponde nei formati di Anthropic (/v1/messages), Gemini (/v1beta/models/<modello>:generateContent) e compatibile
  OpenAI (/v1/chat/completions); accetta solo la chiave «chiave-finta».
- GitHub: /github/releases/latest con la versione 9.9.9 e il suo pacchetto per Windows (finto ma valido).
Uso: python tests/finto_claude.py 9100, poi il programma con TARIC_AGGIORNAMENTI_URL=http://127.0.0.1:9100/github/releases/latest
e in Gestione > Intelligenza artificiale «compatibile OpenAI» con indirizzo http://127.0.0.1:9100/v1 (vedi tests/e2e_locale.js)."""
import hashlib
import io
import json
import sys
import zipfile
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer


def pacchetto(versione: str) -> bytes:
    b = io.BytesIO()
    with zipfile.ZipFile(b, "w") as z:
        z.writestr("python/pythonw.exe", b"MZ")
        z.writestr("python/Lib/site-packages/taric/__init__.py", f'__version__ = "{versione}"\n')
        z.writestr("Avvia MAGIC HS.cmd", "@echo off\r\n")
        z.writestr("LEGGIMI.txt", f"MAGIC HS {versione}\r\n")
    return b.getvalue()


NUOVA = "9.9.9"
PACCHETTO = pacchetto(NUOVA)


def rispondi(prompt: str) -> object:
    if prompt.startswith("Traduci dall"):
        n = prompt.count("\n") and len([r for r in prompt.split("\n") if r[:1].isdigit() and ". " in r[:5]])
        return [f"Traduzione di prova {i + 1}" for i in range(n)]
    if "Compito: indica le voci" in prompt:
        if "asdf" in prompt:
            return {"merce": "", "voci": [], "non_classificabile": "Il testo non descrive una merce."}
        return {"merce": "Scarpe sportive", "voci": [{"voce": "6403", "motivo": "tomaia in cuoio"}, {"voce": "6404", "motivo": "tomaia tessile"}],
                "non_classificabile": None}
    if "INFORMAZIONI GIÀ FORNITE" not in prompt:
        return {"merce": "Scarpe da ginnastica con tomaia in pelle",
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


class Gestore(BaseHTTPRequestHandler):
    # ------------------------------------------------------------------ finto GitHub
    def do_GET(self):  # noqa: N802
        base = f"http://127.0.0.1:{self.server.server_port}/github"
        nome = f"magic-hs-windows-{NUOVA}.zip"
        if self.path == "/github/releases/latest":
            self._json(200, {"tag_name": "v" + NUOVA, "draft": False, "prerelease": False, "published_at": "2026-11-20T10:00:00Z",
                             "html_url": base + "/releases/v" + NUOVA,
                             "assets": [{"name": nome, "size": len(PACCHETTO), "browser_download_url": base + "/" + nome,
                                         "digest": "sha256:" + hashlib.sha256(PACCHETTO).hexdigest()}]})
        elif self.path == "/github/" + nome:
            self.send_response(200)
            self.send_header("content-type", "application/octet-stream")
            self.send_header("content-length", str(len(PACCHETTO)))
            self.end_headers()
            self.wfile.write(PACCHETTO)
        else:
            self._json(404, {"message": "Not Found"})

    # ------------------------------------------------------------------ finta IA
    def do_POST(self):  # noqa: N802
        corpo = json.loads(self.rfile.read(int(self.headers.get("content-length", 0))))
        chiave = self.headers.get("x-api-key") or self.headers.get("x-goog-api-key") or (self.headers.get("authorization") or "").replace("Bearer ", "")
        if chiave != "chiave-finta":
            self._json(401, {"error": {"message": "API key not valid"}})
            return
        if ":generateContent" in self.path:
            prompt = corpo["contents"][0]["parts"][0]["text"]
            testo = json.dumps(rispondi(prompt), ensure_ascii=False)
            self._json(200, {"candidates": [{"content": {"role": "model", "parts": [{"text": testo}]}, "finishReason": "STOP"}],
                             "usageMetadata": {"promptTokenCount": len(prompt) // 4, "candidatesTokenCount": len(testo) // 4}})
        elif self.path.endswith("/chat/completions"):
            prompt = corpo["messages"][-1]["content"]
            testo = json.dumps(rispondi(prompt), ensure_ascii=False)
            self._json(200, {"choices": [{"message": {"role": "assistant", "content": testo}, "finish_reason": "stop"}],
                             "usage": {"prompt_tokens": len(prompt) // 4, "completion_tokens": len(testo) // 4}})
        else:
            prompt = corpo["messages"][0]["content"]
            testo = json.dumps(rispondi(prompt), ensure_ascii=False)
            self._json(200, {"content": [{"type": "text", "text": testo}], "stop_reason": "end_turn", "model": corpo["model"],
                             "usage": {"input_tokens": len(prompt) // 4, "output_tokens": len(testo) // 4}})

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
    ThreadingHTTPServer(("127.0.0.1", int(sys.argv[1] if len(sys.argv) > 1 else 9100)), Gestore).serve_forever()
