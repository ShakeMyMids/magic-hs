"""Genera taric/static/js/icone.js dalle icone Lucide (licenza ISC)."""
import json, re, sys
from pathlib import Path

SRC = Path(sys.argv[1])          # cartella icons di lucide-static
DEST = Path(sys.argv[2])
MAPPA = {
    "cerca": "search", "bacchetta": "wand-sparkles", "albero": "list-tree", "utente": "circle-user-round",
    "gestione": "settings-2", "sole": "sun", "luna": "moon", "auto": "sun-moon", "esci": "log-out", "copia": "copy",
    "stella": "star", "libro": "book-open", "spunta": "check", "chiudi": "x", "giu": "chevron-down", "destra": "chevron-right",
    "storico": "history", "scarica": "download", "carica": "upload", "aggiorna": "refresh-cw", "posta": "mail",
    "attenzione": "triangle-alert", "info": "info", "documento": "file-text", "percento": "percent", "globo": "globe",
    "pacco": "package", "importa": "arrow-down-to-line", "esporta": "arrow-up-from-line", "cestino": "trash-2",
    "chiave": "key-round", "utenti": "users", "database": "database", "registro": "scroll-text", "attesa": "loader-circle",
    "ferma": "circle-stop", "domanda": "circle-help", "timbro": "badge-check", "link": "link", "grafico": "chart-column",
    "regole": "list-checks", "lucchetto": "lock", "filtro": "funnel", "nota": "notebook-pen", "calendario": "calendar",
    "scintille": "sparkles", "indietro": "arrow-left", "piu": "plus", "matita": "pencil", "nuovo-utente": "user-plus",
    "scudo": "shield-check", "fatto": "circle-check-big", "nave": "ship", "spegni": "power", "cartella": "folder-sync",
    "computer": "monitor",
}
out = {}
for nome, lucide in MAPPA.items():
    s = (SRC / f"{lucide}.svg").read_text()
    interno = re.search(r"<svg[^>]*>(.*)</svg>", s, re.S).group(1)
    interno = re.sub(r"\s*\n\s*", "", interno).replace(" />", "/>")
    out[nome] = interno
righe = ",\n".join(f"  {json.dumps(k)}: {json.dumps(v)}" for k, v in out.items())
DEST.write_text(
    "/* MAGIC HS - icone da Lucide (https://lucide.dev), licenza ISC: vedi icons/LICENSE-lucide.txt.\n"
    "   File generato: per aggiungere un'icona modifica la tabella in strumenti/icone.py e rigeneralo. */\n"
    "window.TARIC_ICONE = {\n" + righe + "\n};\n", encoding="utf-8")
print(len(out), "icone,", DEST.stat().st_size, "byte")
