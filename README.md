# MAGIC HS

Sito per cercare le voci doganali in modo più rapido di AIDA. Descrivi la merce a parole: l'intelligenza artificiale (Gemini, Claude o un altro modello a tua scelta) propone il codice a 10 cifre con le alternative e fa le domande che servono per scegliere. Il sito mostra dazi, misure e documenti richiesti per ogni paese, presi dai dati ufficiali TARIC dell'Unione europea.

È un sito completo con server proprio: account con email e password, registrazione automatica, profili e pannello di amministrazione. I dati si aggiornano da soli ogni mese. Puoi farlo girare sul tuo computer oggi e su un server con un dominio domani, con Docker o con Python.

> Strumento non ufficiale e senza valore legale: prima di dichiarare verifica sempre codice e misure su AIDA o sul TARIC dell'UE.

## Che cosa fa

- **Classifica**: dalla descrizione della merce l'IA individua le voci candidate. Poi sceglie il codice confrontandolo con il testo ufficiale della nomenclatura, che è in italiano. Le domande affinano la scelta.
- **Nomenclatura**: albero e ricerca per parola o per codice, senza intelligenza artificiale.
- **Misure per paese**: dazi (anche preferenziali, antidumping e contingenti), condizioni, certificati e documenti del riquadro 44 e unità supplementari. Valgono per importazione ed esportazione.
- **Profilo**:
  - storico delle classificazioni, che si riaprono con tutti i dettagli;
  - voci preferite con una nota;
  - paese, flusso e tema predefiniti;
  - contatore mensile delle richieste all'IA;
  - cambio della password e uscita dagli altri dispositivi.
- **Registrazione automatica**:
  - chi si iscrive conferma l'email;
  - i domini che indichi vengono approvati subito, gli altri restano in attesa e ricevi un avviso;
  - le iscrizioni non confermate spariscono dopo 7 giorni.
- **Gestione** (solo amministratori):
  - utenti e richieste: approva, rifiuta, sospendi, cambia ruolo e limite IA, crea link per la password, elimina;
  - regole di registrazione;
  - dati TARIC: versioni, aggiornamento immediato, caricamento manuale, ritorno alla versione precedente;
  - uso dell'IA per utente, registro degli eventi, posta non inviata.
- **Aggiornamento mensile**: dal primo giorno di ogni mese il server scarica la nuova estrazione TARIC. La installa solo se supera tutti i controlli; altrimenti resta la versione precedente e gli amministratori ricevono un avviso.

## Avvio rapido

### Con Docker (consigliato su un server)

```bash
git clone https://github.com/ShakeMyMids/magic-hs.git
cd magic-hs
cp taric.env.esempio taric.env        # scrivi la chiave dell'IA, per esempio GEMINI_API_KEY
docker compose up -d
docker compose logs taric | grep "NESSUN AMMINISTRATORE"
```

Apri <http://localhost:8000>. Al primo avvio:

1. Il sito ti porta a **Configurazione iniziale**. Il codice da inserire è nella riga «NESSUN AMMINISTRATORE» del registro e nel file `dati/codice-configurazione.txt`.
2. Crei il tuo account da amministratore.
3. Il server scarica e controlla i dati TARIC del mese. Ci vuole circa un minuto e la pagina si apre da sola.

Database, dati TARIC e posta non inviata stanno nella cartella `dati/`.

### Senza Docker (Windows, Mac o Linux)

Serve Python 3.11 o successivo (provato con 3.13).

```bash
python -m venv .venv
# Windows:      .venv\Scripts\activate
# Mac / Linux:  source .venv/bin/activate
pip install -r requirements.txt
copy taric.env.esempio taric.env      # su Mac/Linux: cp taric.env.esempio taric.env
python -m taric
```

Il sito è su <http://127.0.0.1:8000>. Il primo avvio funziona come sopra.

## Configurazione

Tutto si imposta nel file `taric.env` (modello commentato: `taric.env.esempio`) o con variabili d'ambiente. Le principali:

| Variabile | A che cosa serve |
|---|---|
| `GEMINI_API_KEY` oppure `ANTHROPIC_API_KEY` | Chiave del servizio di intelligenza artificiale. Senza chiave il resto del sito funziona. Altri servizi: vedi sotto. |
| `TARIC_URL_PUBBLICO` | Indirizzo del sito (es. `https://taric.tuodominio.it`), usato nei link delle email. |
| `TARIC_SMTP_HOST`, `_PORTA`, `_UTENTE`, `_PASSWORD`, `_MITTENTE`, `_SICUREZZA` | Server di posta per conferme, avvisi e «password dimenticata». |
| `TARIC_DATI` | Cartella dei dati (predefinita `dati`). |
| `TARIC_HOST`, `TARIC_PORTA` | Dove ascolta il server (predefiniti `127.0.0.1` e `8000`). |
| `TARIC_PROXY_FIDATI` | Indirizzi dei reverse proxy da cui accettare `X-Forwarded-*`. |
| `TARIC_AGGIORNAMENTO_AUTOMATICO` | `si` o `no`. |
| `TARIC_IA_FORNITORE`, `TARIC_IA_MODELLO_RAPIDO`, `TARIC_IA_MODELLO`, `TARIC_IA_URL`, `TARIC_IA_CHIAVE` | Scelta esplicita del servizio IA e dei modelli. |

Dopo una modifica di `taric.env` riavvia il server (`docker compose restart` oppure ferma e rilancia `python -m taric`).

### Intelligenza artificiale: quale scegliere e quanto costa

Il sito funziona con tre tipi di servizio. Basta una chiave in `taric.env`; con più chiavi vince Gemini, salvo `TARIC_IA_FORNITORE`.

| Servizio | Come si attiva | Note |
|---|---|---|
| **Google Gemini** (consigliato) | `GEMINI_API_KEY`, chiave da [Google AI Studio](https://aistudio.google.com) | Modelli predefiniti `gemini-3.5-flash-lite` (ricerca delle voci) e `gemini-3.7-flash` (scelta del codice). C'è un piano gratuito con limiti giornalieri bassi, adatto a provare da soli. A pagamento costa pochi centesimi a classificazione. |
| **Claude** (Anthropic) | `ANTHROPIC_API_KEY`, chiave dalla [Console di Anthropic](https://console.anthropic.com) | Solo a consumo, separato dall'abbonamento a Claude. |
| **Compatibile OpenAI**: Groq, Mistral, OpenRouter, OpenAI, Ollama… | `TARIC_IA_FORNITORE=openai`, `TARIC_IA_URL`, `TARIC_IA_MODELLO`, `TARIC_IA_CHIAVE` | Alcuni hanno piani gratuiti con modelli aperti, di solito meno precisi su un compito come questo. Con Ollama il modello gira sul tuo computer, gratis e senza inviare dati fuori, ma serve un computer potente. |

Due cose da sapere su Gemini gratuito:

- **Uso da parte di altre persone**: i [termini dell'API Gemini](https://ai.google.dev/terms) permettono solo il servizio a pagamento quando l'applicazione è offerta a utenti nell'Unione europea, in Svizzera o nel Regno Unito. Per aprire il sito ad altri attiva quindi la fatturazione sul progetto Google Cloud della chiave. Il piano gratuito resta per le tue prove.
- **Limiti**: sono giornalieri e li vedi in AI Studio. Quando finiscono, il sito avvisa che il limite di oggi è raggiunto.

In ogni caso ogni utente ha un limite mensile di richieste. Il valore predefinito per i nuovi utenti si cambia in *Gestione → Regole di registrazione*, quello di ciascuno in *Gestione → Utenti*. Gli amministratori non hanno limite, salvo che tu ne imposti uno. Una classificazione usa di solito 2 o 3 richieste. Gli utenti non vedono mai la chiave: le chiamate le fa il server. Nella console del servizio scelto conviene impostare un tetto di spesa.

### Posta

Senza server SMTP il sito funziona lo stesso, con due differenze:

- le email restano in *Gestione → Posta*, da dove puoi copiare i link e mandarli tu;
- le registrazioni aspettano sempre la tua approvazione, perché senza email l'indirizzo non si può verificare.

Con la posta configurata la registrazione automatica è completa: conferma dell'indirizzo, approvazione per dominio, avvisi e «password dimenticata».

## Metterlo su Internet

Su un server (VPS) con Docker e un dominio che punta al server, con le porte 80 e 443 aperte:

```bash
# in taric.env:  TARIC_URL_PUBBLICO=https://taric.tuodominio.it
TARIC_DOMINIO=taric.tuodominio.it docker compose --profile https up -d
```

Caddy ottiene e rinnova da solo il certificato HTTPS e inoltra le richieste a MAGIC HS. Con un reverse proxy tuo (nginx, Traefik…), inoltra a `127.0.0.1:8000` e imposta `TARIC_PROXY_FIDATI` con l'indirizzo del proxy.

Prima di aprire il sito ad altre persone:

- Pubblica un'informativa privacy: diventi titolare dei dati degli utenti (nome, email, azienda, storico).
- Decidi le regole di registrazione: domini approvati, registrazione aperta o chiusa, limite IA predefinito.
- Imposta un tetto di spesa nella console del servizio IA (Google Cloud, Console di Anthropic…).

## Dati TARIC

- **Fonte**: le estrazioni mensili della Commissione europea (DG TAXUD), gruppo CIRCABC «TARIC and Quota data and information». Le scarica automaticamente dalla copia pubblicata dal progetto [taric-opendata](https://github.com/rousseauxy/taric-opendata); la fonte si cambia con `TARIC_FONTE_URL`.
- **Controlli prima dell'installazione**: file e colonne attesi, mese dell'estrazione, numeri plausibili, nessun calo forte rispetto al mese prima, coerenza della nomenclatura e rilettura di ogni riga generata. Il riepilogo di ogni versione è in *Gestione → Dati TARIC*.
- **Italiano**: la nomenclatura usa il testo ufficiale italiano dell'ultima estrazione che lo contiene (oggi quella del 1° luglio 2026). Le righe create o modificate dopo restano in inglese con la sigla EN e si possono tradurre con Claude. Quando un'estrazione contiene di nuovo `Nomenclature IT.xlsx`, il testo italiano si aggiorna da solo.
- **Se la fonte non funziona**: carica a mano l'archivio .zip con i file Excel del mese (*Gestione → Dati TARIC → Carica a mano*).
- **Fuori dal TARIC**: IVA, accise e misure nazionali; per quelle resta AIDA.

## Comandi

```bash
python -m taric                         # avvia il sito
python -m taric crea-admin              # crea un amministratore dal terminale
python -m taric link-password EMAIL     # link per reimpostare la password di un utente
python -m taric aggiorna-dati [AAAA-MM] # scarica e installa i dati del mese
python -m taric stato                   # riepilogo di utenti, dati e configurazione
```

Con Docker: `docker compose exec taric python -m taric stato`.

## Copia di sicurezza

Basta copiare la cartella `dati/`, a sito fermo oppure con `sqlite3 dati/taric.db ".backup copia.db"`. Gli elementi importanti sono:

- `taric.db`: utenti, storico, preferiti, registro;
- `segreto.key`;
- `taric/nomenclatura_it.json`.

Le versioni dei dati TARIC si possono rigenerare.

## Sicurezza in breve

- **Password**: salvate con Argon2.
- **Sessioni**: cookie `HttpOnly`/`SameSite`, che su HTTPS diventano anche `Secure`. La sessione dura 30 giorni con «resta collegato», 12 ore senza.
- **Accesso**: blocco temporaneo dopo 5 password errate; limiti a registrazioni e richieste di nuova password.
- **Richieste**: protezione contro le richieste da altri siti (intestazione dedicata e controllo dell'origine) e Content-Security-Policy senza script esterni o in linea.
- **Link via email**: monouso e a scadenza, nella parte `#` dell'indirizzo, che non arriva ai server.
- **Archivi caricati**: trattati come non fidati, con estrazione dei soli `.xlsx`, limiti di dimensione e nessun percorso.
- **Font**: locali (licenza SIL OFL), quindi nessun servizio di terzi caricato dalle pagine.

## Sviluppo

```bash
pip install -r requirements-dev.txt
python -m pytest -q tests                       # API, accessi, registrazione, amministrazione, IA, dati
TARIC_ZIP_PROVA=eu-taric-2026-11.zip python -m pytest -q tests/test_dati_reali.py   # con un'estrazione vera (circa un minuto)
```

Per la prova completa nel browser (Playwright) avvia `tests/finto_claude.py`, che imita le API di Gemini, Claude e OpenAI, e un server con `GEMINI_API_KEY=chiave-finta` e `TARIC_IA_URL=http://127.0.0.1:9100/v1beta`, poi lancia `node tests/e2e.js http://127.0.0.1:8000 dati shots`. Le istruzioni per proseguire il lavoro con Claude Code sono in `CLAUDE.md`.

## Fonti e licenze

- **Nomenclatura e misure**: Commissione europea, DG TAXUD (dati pubblicati per il riutilizzo citando la fonte).
- **Font**: Archivo e Courier Prime (SIL Open Font License, vedi `taric/static/fonts/`).
- **Classificazione assistita**: il servizio IA configurato (Google Gemini, Claude di Anthropic o altro).
