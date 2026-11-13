"""Finti servizi esterni per le prove dell'interfaccia (nessuna chiamata reale):
- IA: risponde nei formati di Anthropic (/v1/messages, con lo strumento «risposta» come tool_use), Gemini
  (/v1beta/models/<modello>:generateContent) e compatibile OpenAI (/v1/chat/completions); accetta solo la chiave
  «chiave-finta».
- GitHub: la pagina /github/releases/tags/dati con i dati pronti indicati sulla riga di comando (archivi
  dati-AAAA-MM-01.zip, per esempio fatti con strumenti/dati_mese.py).
Uso: python tests/finto_claude.py 9100 [dati-AAAA-MM-01.zip ...], poi il sito con TARIC_IA_FORNITORE=openai,
TARIC_IA_URL=http://127.0.0.1:9100/v1, TARIC_IA_CHIAVE=chiave-finta e TARIC_DATI_URL=http://127.0.0.1:9100/github/releases/tags/dati
(vedi README, «Sviluppo», e tests/e2e_sito.js)."""
import hashlib
import json
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

DATI: dict[str, bytes] = {}            # nome dell'archivio -> contenuto


def rispondi(prompt: str) -> object:
    if prompt.startswith("Traduci dall"):
        n = prompt.count("\n") and len([r for r in prompt.split("\n") if r[:1].isdigit() and ". " in r[:5]])
        return {"traduzioni": [f"Traduzione di prova {i + 1}" for i in range(n)]}
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
            prompt = "\n\n".join(p["text"] for p in corpo["contents"][0]["parts"])
            testo = json.dumps(rispondi(prompt), ensure_ascii=False)
            self._json(200, {"candidates": [{"content": {"role": "model", "parts": [{"text": testo}]}, "finishReason": "STOP"}],
                             "usageMetadata": {"promptTokenCount": len(prompt) // 4, "candidatesTokenCount": len(testo) // 4}})
        elif self.path.endswith("/chat/completions"):
            prompt = corpo["messages"][-1]["content"]
            testo = json.dumps(rispondi(prompt), ensure_ascii=False)
            self._json(200, {"choices": [{"message": {"role": "assistant", "content": testo}, "finish_reason": "stop"}],
                             "usage": {"prompt_tokens": len(prompt) // 4, "completion_tokens": len(testo) // 4}})
        else:
            contenuto = corpo["messages"][0]["content"]
            prompt = contenuto if isinstance(contenuto, str) else "\n\n".join(b["text"] for b in contenuto)
            risposta = rispondi(prompt)
            testo = json.dumps(risposta, ensure_ascii=False)
            uso = {"input_tokens": len(prompt) // 4, "output_tokens": len(testo) // 4,
                   "cache_read_input_tokens": len(contenuto[0]["text"]) // 4 if isinstance(contenuto, list) else 0}
            if corpo.get("tools"):
                self._json(200, {"content": [{"type": "tool_use", "id": "toolu_1", "name": "risposta", "input": risposta}],
                                 "stop_reason": "tool_use", "model": corpo["model"], "usage": uso})
            else:
                self._json(200, {"content": [{"type": "text", "text": testo}], "stop_reason": "end_turn", "model": corpo["model"], "usage": uso})

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
    ThreadingHTTPServer(("127.0.0.1", int(sys.argv[1] if len(sys.argv) > 1 else 9100)), Gestore).serve_forever()
