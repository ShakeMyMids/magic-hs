"""Finti servizi esterni per le prove dell'interfaccia (nessuna chiamata reale).
- IA: risponde nei formati di Anthropic (/v1/messages), Gemini (/v1beta/models/<modello>:generateContent) e compatibile
  OpenAI (/v1/chat/completions).
- Stripe (/stripe/v1/...): pagine di pagamento, abbonamenti e portale clienti; aprendo /paga/<sessione> il pagamento
  risulta fatto e si torna al sito come dopo un pagamento vero.
Uso: python tests/finto_claude.py 9100, poi un server con GEMINI_API_KEY=chiave-finta TARIC_IA_URL=http://127.0.0.1:9100/v1beta
TARIC_STRIPE_CHIAVE=sk_test_finta TARIC_STRIPE_URL=http://127.0.0.1:9100/stripe/v1"""
import json
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qsl, quote, urlsplit

STRIPE = {"sessioni": {}, "abbonamenti": {}, "n": 0}
BLOCCO = threading.Lock()


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
    # ------------------------------------------------------------------ finto Stripe
    def _stripe(self, metodo: str) -> None:
        if self.headers.get("authorization") != "Bearer sk_test_finta":
            self._json(401, {"error": {"message": "Invalid API Key provided"}})
            return
        dati = dict(parse_qsl(self.rfile.read(int(self.headers.get("content-length", 0) or 0)).decode()))
        percorso = urlsplit(self.path).path.removeprefix("/stripe/v1")
        with BLOCCO:
            if metodo == "POST" and percorso == "/checkout/sessions":
                STRIPE["n"] += 1
                sid = f"cs_test_finta_{STRIPE['n']}"
                STRIPE["sessioni"][sid] = {
                    "id": sid, "object": "checkout.session", "url": f"http://127.0.0.1:{self.server.server_port}/paga/{sid}",
                    "mode": dati["mode"], "status": "open", "payment_status": "unpaid", "client_reference_id": dati.get("client_reference_id"),
                    "metadata": {k[9:-1]: v for k, v in dati.items() if k.startswith("metadata[")}, "customer": dati.get("customer"),
                    "amount_total": int(dati["line_items[0][price_data][unit_amount]"]), "currency": "eur", "subscription": None,
                    "success_url": dati["success_url"], "cancel_url": dati["cancel_url"]}
                self._json(200, STRIPE["sessioni"][sid])
            elif metodo == "GET" and percorso.startswith("/checkout/sessions/"):
                s = STRIPE["sessioni"].get(percorso.rsplit("/", 1)[1])
                self._json(200, s) if s else self._json(404, {"error": {"message": "No such checkout session"}})
            elif percorso.startswith("/subscriptions/"):
                sub = STRIPE["abbonamenti"].get(percorso.rsplit("/", 1)[1])
                if sub and metodo == "DELETE":
                    sub.update(status="canceled", ended_at=int(time.time()))
                self._json(200, sub) if sub else self._json(404, {"error": {"message": "No such subscription"}})
            elif metodo == "POST" and percorso == "/billing_portal/sessions":
                self._json(200, {"url": f"http://127.0.0.1:{self.server.server_port}/portale?torna={quote(dati['return_url'], safe='')}"})
            else:
                self._json(404, {"error": {"message": "sconosciuto"}})

    def do_GET(self):  # noqa: N802
        u = urlsplit(self.path)
        if u.path.startswith("/stripe/v1/"):
            self._stripe("GET")
        elif u.path.startswith("/paga/"):
            with BLOCCO:
                s = STRIPE["sessioni"].get(u.path.rsplit("/", 1)[1])
                if s is None:
                    self._json(404, {"errore": "sessione sconosciuta"})
                    return
                s.update(status="complete", payment_status="paid", customer=s["customer"] or "cus_" + s["id"])
                if s["mode"] == "subscription":
                    sub = "sub_" + s["id"]
                    STRIPE["abbonamenti"][sub] = {"id": sub, "object": "subscription", "status": "active", "customer": s["customer"],
                                                  "metadata": dict(s["metadata"]), "cancel_at_period_end": False, "cancel_at": None,
                                                  "current_period_end": int(time.time()) + (365 if s["metadata"].get("piano") == "anno" else 30) * 86400}
                    s["subscription"] = sub
            self._vai(s["success_url"].replace("{CHECKOUT_SESSION_ID}", s["id"]))
        elif u.path == "/portale":
            self._vai(dict(parse_qsl(u.query)).get("torna", "/"))
        else:
            self._json(404, {"errore": "sconosciuto"})

    def do_DELETE(self):  # noqa: N802
        self._stripe("DELETE")

    def _vai(self, dove: str) -> None:
        self.send_response(302)
        self.send_header("location", dove)
        self.send_header("content-length", "0")
        self.end_headers()

    # ------------------------------------------------------------------ finta IA
    def do_POST(self):  # noqa: N802
        if self.path.startswith("/stripe/v1/"):
            self._stripe("POST")
            return
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
