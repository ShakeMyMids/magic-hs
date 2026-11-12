# TARIC 2.0 - immagine del server
FROM python:3.13-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    TARIC_DATI=/dati \
    TARIC_HOST=0.0.0.0 \
    TARIC_PORTA=8000 \
    TARIC_CONFIG=/dati/taric.env

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY taric ./taric

# utente senza privilegi; i dati (database, versioni TARIC, posta non inviata) stanno nel volume /dati
RUN useradd --system --uid 10001 --home-dir /dati taric && mkdir -p /dati && chown taric /dati
USER taric
VOLUME ["/dati"]
EXPOSE 8000

HEALTHCHECK --interval=60s --timeout=5s --start-period=20s --retries=3 \
  CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/api/stato', timeout=4).status == 200 else 1)"

CMD ["python", "-m", "taric"]
