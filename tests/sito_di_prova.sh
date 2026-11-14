#!/usr/bin/env bash
# Avvia il sito di prova per tests/e2e_sito.js: finto servizio IA, finta GitHub e finto archivio S3 per la copia esterna
# del database (tests/finto_claude.py) sulla porta 9100,
# sito sulla 8810 con i dati del mese presi dall'archivio indicato. Aspetta che i dati siano installati.
# Uso: tests/sito_di_prova.sh dati-AAAA-MM-01.zip cartella-nuova      (poi: node tests/e2e_sito.js http://localhost:8810 schermate)
set -euo pipefail
ZIP="$1"; CARTELLA="$2"
RADICE="$(cd "$(dirname "$0")/.." && pwd)"
mkdir -p "$CARTELLA"
python "$RADICE/tests/finto_claude.py" 9100 "$ZIP" > "$CARTELLA/finto.log" 2>&1 &
TARIC_CONFIG="$CARTELLA/nessuno.env" TARIC_DATI="$CARTELLA/dati" MAGIC_HS_AMMINISTRATORI=capo@azienda.it \
TARIC_IA_FORNITORE=openai TARIC_IA_URL=http://127.0.0.1:9100/v1 TARIC_IA_MODELLO=finto-modello TARIC_IA_CHIAVE=chiave-finta \
TARIC_DATI_URL=http://127.0.0.1:9100/github/releases/tags/dati TARIC_FONTE_URL="http://127.0.0.1:9100/fonte/{mese}.zip" \
MAGIC_HS_COPIA_URL=http://127.0.0.1:9100/s3/magic-hs MAGIC_HS_COPIA_CHIAVE=chiave-s3-finta MAGIC_HS_COPIA_SEGRETO=segreto-finto \
MAGIC_HS_BCE_URL=http://127.0.0.1:9100/bce \
PYTHONPATH="$RADICE" python -m taric server --porta 8810 > "$CARTELLA/sito.log" 2>&1 &
for _ in $(seq 120); do
  if curl -sf http://127.0.0.1:8810/api/stato | grep -q '"dati_pronti":true'; then echo "sito di prova pronto"; exit 0; fi
  sleep 1
done
echo "il sito di prova non e' pronto:"; tail -20 "$CARTELLA/sito.log"; exit 1
