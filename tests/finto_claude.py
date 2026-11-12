"""Finto server dell'API Messages di Anthropic per le prove dell'interfaccia (nessuna chiamata reale).
Uso: python tests/finto_claude.py 9100   -> http://127.0.0.1:9100/v1/messages"""
import json
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer


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
    def do_POST(self):  # noqa: N802
        corpo = json.loads(self.rfile.read(int(self.headers.get("content-length", 0))))
        if self.headers.get("x-api-key") != "chiave-finta":
            self._json(401, {"type": "error", "error": {"type": "authentication_error", "message": "invalid x-api-key"}})
            return
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
