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
  - il piano (Gratis o Pro) con il contatore mensile delle richieste all'IA;
  - cambio della password e uscita dagli altri dispositivi.
- **Piani Gratis e Pro** (facoltativi, con Stripe):
  - Gratis: 50 richieste all'IA al mese; nomenclatura, misure e documenti senza limiti;
  - Pro: nessun limite mensile, con un tetto di sicurezza nelle 24 ore; pass da 1 giorno o 1 settimana, abbonamento mensile o annuale.
- **Registrazione automatica**:
  - chi si iscrive conferma l'email;
  - i domini che indichi vengono approvati subito, gli altri restano in attesa e ricevi un avviso;
  - le iscrizioni non confermate spariscono dopo 7 giorni.
- **Gestione** (solo amministratori):
  - utenti e richieste: approva, rifiuta, sospendi, cambia ruolo e limite IA, crea link per la password, elimina;
  - regole di registrazione;
  - piani e pagamenti: prezzi, limiti, utenti Pro, incassi, Pro concesso a mano a chi paga con bonifico;
  - dati TARIC: versioni, aggiornamento immediato, caricamento manuale, ritorno alla versione precedente;
  - uso dell'IA per utente, registro degli eventi, posta non inviata.
- **Aggiornamento mensile**: dal primo giorno di ogni mese il server scarica la nuova estrazione TARIC. La installa solo se supera tutti i controlli; altrimenti resta la versione precedente e gli amministratori ricevono un avviso.

## Avvio rapido

Per metterlo online su un server tuo vai direttamente a [Metterlo su Internet](#metterlo-su-internet): uno script fa tutto.

### Con Docker

```bash
git clone https://github.com/ShakeMyMids/magic-hs.git
cd magic-hs
cp taric.env.esempio taric.env        # scrivi la chiave dell'IA, per esempio GEMINI_API_KEY
mkdir -p dati && sudo chown 10001:10001 dati   # solo su Linux
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
| `TARIC_BACKUP_COPIE` | Backup automatici giornalieri del database da tenere (predefinito 14, `0` = spenti). |
| `TARIC_STRIPE_CHIAVE`, `TARIC_STRIPE_FIRMA_WEBHOOK` | Chiave segreta e segreto del webhook di Stripe: attivano il piano Pro a pagamento (vedi «Piani e pagamenti»). |
| `TARIC_VENDITORE`, `TARIC_VENDITORE_PIVA`, `TARIC_VENDITORE_INDIRIZZO`, `TARIC_VENDITORE_EMAIL` | I tuoi dati nelle condizioni di vendita. |
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

### Piani e pagamenti (Stripe)

Senza Stripe tutti gli utenti sono sul piano Gratis, con 50 richieste all'IA al mese. Puoi comunque concedere il Pro a mano fino a una data, per esempio a chi ti paga con bonifico, da *Gestione → Utenti → Gestisci*. Con Stripe gli utenti passano a Pro da soli, da *Profilo → Il tuo piano*.

| Pro | Prezzo predefinito | Come funziona |
|---|---|---|
| 1 giorno | 2,99 € | pagamento singolo, nessun rinnovo; se ne compri un altro la durata si somma |
| 1 settimana | 7,99 € | pagamento singolo, nessun rinnovo |
| Mensile | 14,99 € | si rinnova ogni mese finché non si disdice |
| Annuale | 149 € | si rinnova ogni anno |

Prezzi, limite del piano Gratis e tetto del Pro nelle 24 ore si cambiano in *Gestione → Piani e pagamenti*.

**Collegare Stripe**

1. Crea un account su stripe.com. Per vendere servono i dati della tua attività (partita IVA o società): chiedi al tuo commercialista come fatturare, perché Stripe non emette fatture elettroniche italiane.
2. Comincia in **modalità di prova** (sandbox): nessun addebito vero. In *Developers → API keys* copia la chiave segreta `sk_test_...`.
3. Nel file `taric.env` (sul server: `sudo magic-hs configura`) scrivi:
   ```
   TARIC_STRIPE_CHIAVE=sk_test_...
   TARIC_VENDITORE=Mario Rossi Consulenze Doganali
   TARIC_VENDITORE_PIVA=01234567890
   TARIC_VENDITORE_INDIRIZZO=Via Roma 1, 20100 Milano
   TARIC_VENDITORE_EMAIL=info@magichs.it
   ```
4. **Webhook**, perché arrivino subito rinnovi e disdette. In Stripe apri *Workbench → Webhooks → Create an event destination* e:
   - scegli gli eventi `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `invoice.paid`, `customer.subscription.updated` e `customer.subscription.deleted`;
   - come destinazione scegli *Webhook endpoint*, con indirizzo `https://tuodominio/api/stripe/webhook`;
   - copia il segreto `whsec_...` (*Reveal secret*) in `TARIC_STRIPE_FIRMA_WEBHOOK=`.

   Senza webhook i pagamenti si attivano lo stesso, quando l'utente torna sul sito; rinnovi e disdette arrivano con il controllo automatico ogni 6 ore.
5. **Portale clienti**, da cui gli abbonati cambiano carta, scaricano le ricevute e disdicono: in *Settings → Billing → Customer portal* attiva la disdetta e salva.
6. Prova un acquisto con la carta `4242 4242 4242 4242`, una scadenza futura e un CVC qualsiasi. Quando tutto funziona, rifai i passi 2-5 in modalità reale con la chiave `sk_live_...`.

Facoltativo: con `TARIC_STRIPE_TASSE=sì` l'IVA viene calcolata da Stripe Tax, che va attivato anche su Stripe ed è a pagamento.

Le condizioni di vendita sono su `https://tuodominio/condizioni`, con i tuoi dati e i prezzi correnti. Il testo, compreso quello sul diritto di recesso che l'utente accetta prima di pagare, è un punto di partenza: fallo controllare da un professionista prima di vendere.

## Metterlo su Internet

### Su un server tuo (per esempio un Cloud VPS di Aruba)

Uno script installa e configura tutto: Docker, firewall, aggiornamenti di sicurezza automatici, HTTPS e backup. Ti servono:

- un **VPS Linux** con **Ubuntu 24.04** (vanno bene anche Ubuntu 22.04 e Debian 12 o 13), con almeno **2 GB di RAM** e un **indirizzo IPv4 pubblico**: l'aggiornamento mensile dei dati usa circa 520 MB di memoria;
- un **dominio** (per esempio `magichs.it`, oppure un sottodominio come `taric.tuaazienda.it`);
- facoltativi: la chiave di Google Gemini e una casella email del tuo dominio per mandare le conferme.

**1. Il dominio.** Nel pannello DNS del dominio crea un record **A** che punta all'IPv4 del VPS. Nome `@` per il dominio principale, oppure il nome del sottodominio (es. `taric`). Di solito il record diventa attivo in pochi minuti.

**2. Le porte.** Se il pannello del VPS ha un firewall o un *security group*, lascia aperte le porte 22 (SSH), 80 e 443.

**3. L'installazione.** Collegati al server (da Windows, Mac o Linux: `ssh root@INDIRIZZO-IP` nel terminale) e lancia:

```bash
curl -fsSL https://raw.githubusercontent.com/ShakeMyMids/magic-hs/main/server/installa.sh -o installa.sh
sudo bash installa.sh
```

Lo script ti chiede il dominio, la chiave Gemini e la casella email. Per le caselle Aruba propone già il server giusto (`smtps.aruba.it`, porta 465, SSL); per saltare una domanda premi Invio. Poi:

- installa Docker, il firewall (aperte solo SSH, 80 e 443), fail2ban sugli accessi SSH e gli aggiornamenti di sicurezza automatici, più 2 GB di swap sui server con poca memoria;
- scarica MAGIC HS in `/opt/magic-hs`, scrive la configurazione in `/opt/magic-hs/taric.env` (leggibile solo dall'amministratore) e avvia il sito con il certificato HTTPS di Let's Encrypt;
- alla fine mostra l'indirizzo `https://tuodominio/configura` e il **codice** per creare il tuo account da amministratore.

I dati TARIC si scaricano da soli nei primi minuti. Puoi rilanciare lo script quando vuoi: aggiorna codice e configurazione e lascia intatti utenti e dati.

**Gestione di tutti i giorni**, sul server:

| Comando | Che cosa fa |
|---|---|
| `sudo magic-hs stato` | Come sta il sito: utenti, dati, IA, posta, disco e memoria. |
| `sudo magic-hs aggiorna` | Scarica l'ultima versione da GitHub e riavvia. |
| `sudo magic-hs configura` | Apre `taric.env` (chiave IA, posta…) e riavvia con le modifiche. |
| `sudo magic-hs dominio NUOVO` | Cambia l'indirizzo del sito. |
| `sudo magic-hs log` | Registro del sito (`magic-hs log caddy` per l'HTTPS). |
| `sudo magic-hs codice` | Codice per il primo amministratore. |
| `sudo magic-hs backup` / `ripristina FILE` | Backup del database e ripristino (vedi sotto). |
| `sudo magic-hs aiuto` | Tutti i comandi. |

### Con Docker su un server già pronto

Su un server (VPS) con Docker e un dominio che punta al server, con le porte 80 e 443 aperte:

```bash
# in taric.env:  TARIC_URL_PUBBLICO=https://taric.tuodominio.it
TARIC_DOMINIO=taric.tuodominio.it docker compose --profile https up -d
```

Su Linux la cartella `dati` deve appartenere all'utente del container: `sudo chown 10001:10001 dati`.

Caddy ottiene e rinnova da solo il certificato HTTPS e inoltra le richieste a MAGIC HS. Con un reverse proxy tuo (nginx, Traefik…), inoltra a `127.0.0.1:8000` e imposta `TARIC_PROXY_FIDATI` con l'indirizzo del proxy.

### Prima di aprire il sito ad altre persone

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
python -m taric backup                  # backup del database adesso
python -m taric ripristina FILE         # rimette un backup (a sito spento)
```

Con Docker: `docker compose exec taric python -m taric stato`. Sul server installato con lo script: `sudo magic-hs aiuto`.

## Copia di sicurezza

Il sito fa da solo un **backup del database** ogni giorno in `dati/backup` e tiene gli ultimi 14 (`TARIC_BACKUP_COPIE`; `0` li spegne). Il database contiene utenti, password cifrate, storico, preferiti, regole e registro. I dati TARIC non servono perché si riscaricano.

- **Scaricarne uno**: *Gestione → Dati TARIC → Backup del database*, dove puoi anche farne uno al momento. Ogni tanto salvane uno sul tuo computer: se il server si rompe, è la tua copia.
- **Rimetterlo**: sul server installato con lo script, `sudo magic-hs ripristina magic-hs-AAAA-MM-GG-HHMMSS.zip`. Il sito si ferma per qualche secondo, e il database di prima viene salvato in un nuovo backup. Un file dal tuo computer lo copi prima sul server, per esempio con `scp file.zip root@IP:/opt/magic-hs/dati/backup/`. Senza lo script: ferma il sito e lancia `python -m taric ripristina FILE`.
- **Spostare il sito su un altro server**: installalo sul nuovo server con lo script, poi rimetti l'ultimo backup.

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

Per la prova completa nel browser (Playwright) avvia `tests/finto_claude.py`, che imita le API di Gemini, Claude, OpenAI e Stripe, e un server con `GEMINI_API_KEY=chiave-finta`, `TARIC_IA_URL=http://127.0.0.1:9100/v1beta`, `TARIC_STRIPE_CHIAVE=sk_test_finta` e `TARIC_STRIPE_URL=http://127.0.0.1:9100/stripe/v1`, poi lancia `node tests/e2e.js http://127.0.0.1:8000 dati shots`. Le istruzioni per proseguire il lavoro con Claude Code sono in `CLAUDE.md`.

## Fonti e licenze

- **Nomenclatura e misure**: Commissione europea, DG TAXUD (dati pubblicati per il riutilizzo citando la fonte).
- **Font**: Archivo (SIL Open Font License, vedi `taric/static/fonts/`).
- **Icone**: Lucide (licenza ISC, vedi `taric/static/icons/LICENSE-lucide.txt`); si rigenerano con `strumenti/icone.py`.
- **Classificazione assistita**: il servizio IA configurato (Google Gemini, Claude di Anthropic o altro).
