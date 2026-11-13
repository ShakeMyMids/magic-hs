# MAGIC HS, versione sito (Render: vedi render.yaml). Il database e i dati TARIC stanno sul disco montato in /var/data.
FROM python:3.13-slim

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1 \
    TARIC_DATI=/var/data/magic-hs/dati
WORKDIR /app
COPY requirements.txt .
RUN pip install -r requirements.txt
COPY taric ./taric

# il disco di Render si monta all'avvio in /var/data (di root): la cartella dei dati la crea il server
EXPOSE 10000
CMD ["python", "-m", "taric", "server"]
