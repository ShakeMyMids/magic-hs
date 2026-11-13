# MAGIC HS

Programma per Windows per cercare le voci doganali in modo più rapido di AIDA, ad uso interno dell'azienda. Descrivi la merce a parole: l'intelligenza artificiale (Gemini, Claude, Azure OpenAI o un altro modello a scelta) propone il codice a 10 cifre con le alternative e fa le domande che servono per scegliere. MAGIC HS mostra dazi, misure e documenti richiesti per ogni paese, presi dai dati ufficiali TARIC dell'Unione europea.

Ognuno lo usa sul proprio PC in autonomia, senza server, installazione né costi: il programma e i dati TARIC del mese arrivano da soli dalla [pagina delle versioni](https://github.com/ShakeMyMids/magic-hs/releases) del progetto su GitHub, e ognuno sceglie il proprio servizio di intelligenza artificiale (o nessuno). Nessuno deve gestire nulla per gli altri.

> Strumento non ufficiale e senza valore legale: prima di dichiarare verifica sempre codice e misure su AIDA o sul TARIC dell'UE.

## Che cosa fa

- **Classifica**: dalla descrizione della merce l'IA individua le voci candidate. Poi sceglie il codice confrontandolo con il testo ufficiale della nomenclatura, che è in italiano. Le domande affinano la scelta.
- **Nomenclatura**: albero e ricerca per parola o per codice, senza intelligenza artificiale.
- **Misure per paese**: dazi (anche preferenziali, antidumping e contingenti), condizioni, certificati e documenti del riquadro 44 e unità supplementari. Valgono per importazione ed esportazione.
- **Profilo**, che resta sul PC di ciascuno:
  - storico delle classificazioni, che si riaprono con tutti i dettagli;
  - voci preferite con una nota;
  - paese, flusso e tema predefiniti;
  - classificazioni con l'IA del mese.
- **Impostazioni** del PC:
  - intelligenza artificiale: servizio, chiave (protetta da Windows), prova, elenco dei modelli, uso del mese;
  - dati TARIC: versioni, aggiornamento immediato, caricamento manuale, ritorno alla versione precedente;
  - versione del programma;
  - registro degli eventi.
- **Aggiornamenti da soli**: a ogni inizio mese GitHub prepara i dati TARIC con gli stessi controlli del programma e ogni PC li scarica (pochi MB); le nuove versioni del programma si scaricano e si preparano da sole per l'apertura successiva.

## Installazione

### Su ogni PC

1. Dalla [pagina delle versioni](https://github.com/ShakeMyMids/magic-hs/releases/latest) scarica `MAGIC-HS-<versione>.zip` (l'altro file, `magic-hs-windows-<versione>.zip`, è quello che il programma usa per aggiornarsi). Prima di estrarlo: tasto destro > Proprietà > spunta «Annulla blocco», così Windows non chiede conferme per il file di avvio.
2. Estrai la cartella **MAGIC HS** dove vuoi, per esempio in Documenti.
3. Fai doppio clic su **Avvia MAGIC HS**: il programma si copia sul PC, scarica i dati TARIC del mese (circa un minuto la prima volta) e si apre nel browser. Conviene un collegamento sul desktop.
4. Facoltativo: in *Impostazioni → Intelligenza artificiale* scegli il servizio e inserisci la chiave (vedi [Intelligenza artificiale](#intelligenza-artificiale)). Senza IA restano nomenclatura, misure, ricerca per codice, storico e preferiti.

Storico, preferiti, preferenze e servizio IA restano sul PC di ciascuno, in `%LOCALAPPDATA%\MAGIC HS`.

### Aggiornamenti

Non c'è niente da fare:

- *Programma*: MAGIC HS chiede a GitHub l'ultima versione al massimo ogni sei ore. Se è più recente la scarica, ne controlla dimensione e impronta SHA-256 e la prepara in `%LOCALAPPDATA%\MAGIC HS\programma`; si usa dalla volta successiva che si apre MAGIC HS (in *Impostazioni → Programma* compare «È pronta la versione …» e la scheda ha un puntino arancio). La cartella estratta non va aggiornata.
- *Dati TARIC*: a ogni inizio mese il flusso GitHub «Dati TARIC» prepara i dati del mese con gli stessi controlli del programma e li pubblica nella pagina [dati](https://github.com/ShakeMyMids/magic-hs/releases/tag/dati); ogni PC li scarica e li controlla. Se non ci sono ancora, il PC scarica l'estrazione dalla fonte e la prepara da sé. Da *Impostazioni → Dati TARIC* si può anche aggiornare subito, caricare a mano un'estrazione o tornare alla versione precedente.
- *Dietro un proxy che blocca GitHub*: i dati si caricano a mano; per il programma basta scaricare il nuovo `MAGIC-HS-<versione>.zip` ed estrarlo al posto della vecchia cartella.

### Chi usava la cartella condivisa (versioni fino alla 1.2)

Chi pubblicava preme un'ultima volta **Aggiorna per tutti** in *Gestione → Cartella condivisa*: nella cartella arrivano la nuova versione e il nuovo file di avvio. Da lì ognuno va da solo: il programma si aggiorna da GitHub, i dati del mese arrivano da GitHub e il servizio IA scelto nella cartella viene copiato **una volta** sul PC di ognuno, che poi lo può cambiare o spegnere. Se non volete che i colleghi continuino a usare la chiave aziendale, prima di aggiornare spegnete l'IA in *Gestione → Intelligenza artificiale* (oppure togliete `impostazioni.json` dalla cartella).

La cartella condivisa può restare come punto di avvio, anche in sola lettura (il programma non ci scrive più), oppure si può smettere di usarla: ognuno scarica `MAGIC-HS-<versione>.zip` come sopra. Storico e preferiti non si perdono, perché stanno sul PC.

### Come funziona

«Avvia MAGIC HS.cmd» copia `programma\magic-hs-<versione>.zip` (Python per Windows con le librerie e MAGIC HS, nessuna installazione) in `%LOCALAPPDATA%\MAGIC HS\programma\<versione>` e lancia `taric.programma`; se in `attuale.txt` c'è una versione più recente scaricata dal programma, usa quella. Nella cartella di avvio non scrive mai nessuno. Il programma ascolta solo su 127.0.0.1, accetta solo il browser aperto dall'avvio (chiave casuale nella cartella dell'utente), tiene una sola copia per utente e si chiude da solo dopo mezz'ora senza uso. Usa i certificati di Windows, quindi funziona anche dietro i proxy aziendali che ispezionano HTTPS (un proxy con script di configurazione automatica può invece bloccare IA e download dei dati). Se il PC aziendale blocca i programmi copiati nella cartella dell'utente, serve l'IT.

### Costruire i file

Da Linux, macOS o Windows: `python strumenti/pacchetto_windows.py` crea in `dist/` la cartella da scaricare (`MAGIC-HS-<versione>.zip`) e il pacchetto per gli aggiornamenti (`magic-hs-windows-<versione>.zip`). Il flusso GitHub *Programma per Windows* li costruisce e li prova su un vero Windows a ogni modifica: primo avvio da una cartella in sola lettura, dati del mese, chiave IA protetta da Windows, passaggio a una versione scaricata, chiusura.

**Pubblicare una nuova versione**: basta unire a `main` una modifica che cambia `__version__` in `taric/__init__.py`. Il flusso prova i pacchetti su Windows e crea da solo la pagina della versione (tag `v<versione>`) con i due file; da lì ogni PC la scarica da solo. Una versione già pubblicata non viene toccata. Le versioni non solo numeriche (per esempio `1.3.0-prova`) escono come *pre-release* e MAGIC HS non le propone. Per ripubblicare i file di una versione: Actions > Programma per Windows > Run workflow, con «pubblica» spuntato.

**Dati del mese**: il flusso *Dati TARIC* (`.github/workflows/dati.yml`) gira ogni giorno dall'1 al 12 del mese finché il mese non è pubblicato; usa `strumenti/dati_mese.py`, cioè gli stessi passaggi e controlli del programma, e tiene gli ultimi tre mesi nella pre-release `dati`. Si può lanciare a mano (Actions > Dati TARIC > Run workflow, con il mese). GitHub sospende i flussi pianificati di un progetto senza modifiche da 60 giorni: nel frattempo i PC preparano i dati da soli, e il flusso si riattiva con Actions > Dati TARIC > Enable workflow.

**Costi**: nessuno. Il progetto è pubblico, quindi i flussi di GitHub Actions e le pagine delle versioni sono gratuiti; ogni PC scarica pochi MB al mese.

## Intelligenza artificiale

Ognuno la sceglie sul suo PC, in *Impostazioni → Intelligenza artificiale*. Senza IA restano nomenclatura, misure, ricerca per codice, storico e preferiti.

| Servizio | Note |
|---|---|
| **Ollama**, sul proprio PC | Gratis e senza inviare dati fuori: scegli «compatibile OpenAI», indirizzo `http://localhost:11434/v1` e il modello installato (per esempio `qwen3:14b`), senza chiave. Serve un PC con molta memoria; le risposte sono più lente e meno precise di quelle dei servizi in cloud. |
| **Azure OpenAI** dell'azienda | Scegli «compatibile OpenAI», indirizzo `https://<risorsa>.openai.azure.com/openai/v1`, chiave della risorsa e nome della distribuzione come modello. I dati restano nel contratto Azure dell'azienda. |
| **Google Gemini** | Chiave da [Google AI Studio](https://aistudio.google.com). Modelli predefiniti `gemini-3.5-flash-lite` (ricerca delle voci) e `gemini-3.7-flash` (scelta del codice). Costa pochi centesimi a classificazione. I [termini dell'API Gemini](https://ai.google.dev/terms) chiedono il servizio a pagamento per applicazioni usate da persone nell'Unione europea: attiva la fatturazione sul progetto della chiave. |
| **Claude** (Anthropic) | Chiave dalla [Console di Anthropic](https://console.anthropic.com), solo a consumo e separata dall'abbonamento a Claude. |
| **Altri compatibili OpenAI**: Groq, Mistral, OpenRouter, OpenAI… | Indirizzo, modello ed eventuale chiave. |

**Modelli**: i campi «Modello» suggeriscono quelli predefiniti; con *Elenco dei modelli* MAGIC HS chiede al servizio quelli disponibili per la chiave salvata. *Prova* controlla subito chiave, indirizzo e modello.

**Costi e affidabilità**:
- ogni richiesta mette prima la parte che non cambia (istruzioni e testo ufficiale delle voci, spesso decine di migliaia di token) e in fondo la merce: i servizi la riusano dalla loro cache, a una frazione del prezzo, nel ricontrollo e in *Riclassifica* (Claude con la cache esplicita, OpenAI, Azure OpenAI e Gemini da soli);
- la risposta segue uno schema JSON imposto al modello (strumento obbligato per Claude, `json_schema` per i compatibili OpenAI, `responseSchema` per Gemini), così la «risposta non leggibile» diventa rara; se un servizio non accetta lo schema, MAGIC HS riprova senza;
- quando il servizio è sovraccarico o limita le richieste al minuto, MAGIC HS riprova da solo fino a due volte, aspettando quanto indica il servizio (al massimo 20 secondi).

*Impostazioni → Intelligenza artificiale → Uso su questo PC* mostra classificazioni, richieste e token del mese, con la parte letta dalla cache. Una classificazione conta una volta sola anche se fa 2 o 3 richieste al servizio; le traduzioni delle righe in inglese non contano. La spesa è nella console del servizio, dove conviene impostare un tetto di spesa.

**La chiave** resta sul PC: si salva nel database protetta da Windows (DPAPI), quindi la può leggere solo l'utente di Windows che l'ha inserita, su quel PC. Un backup del database portato su un altro PC non la porta con sé: lì va inserita di nuovo. **Copilot di Microsoft 365** non si può usare da un programma senza la licenza Microsoft 365 Copilot per ogni persona e una registrazione fatta dall'IT; il Copilot Chat gratuito non ha un collegamento per i programmi.

## Dati TARIC

- **Fonte**: le estrazioni mensili della Commissione europea (DG TAXUD), gruppo CIRCABC «TARIC and Quota data and information». Il flusso *Dati TARIC* (e, se serve, ogni PC) le scarica dalla copia pubblicata dal progetto [taric-opendata](https://github.com/rousseauxy/taric-opendata); sul PC la fonte si cambia con `TARIC_FONTE_URL` in `%LOCALAPPDATA%\MAGIC HS\taric.env`.
- **Controlli prima dell'installazione**: file e colonne attesi, mese dell'estrazione, numeri plausibili, nessun calo forte rispetto al mese prima, coerenza della nomenclatura e rilettura di ogni riga generata. Il riepilogo di ogni versione è in *Impostazioni → Dati TARIC*.
- **Italiano**: la nomenclatura usa il testo ufficiale italiano dell'ultima estrazione che lo contiene (oggi quella del 1° luglio 2026). Le righe create o modificate dopo restano in inglese con la sigla EN e si possono tradurre con Claude. Quando un'estrazione contiene di nuovo `Nomenclature IT.xlsx`, il testo italiano si aggiorna da solo.
- **Se la fonte non funziona**: carica a mano l'archivio .zip con i file Excel del mese (*Impostazioni → Dati TARIC → Carica a mano*).
- **Fuori dal TARIC**: IVA, accise e misure nazionali; per quelle resta AIDA.

## Dati sul PC e copia di sicurezza

Storico, preferiti, preferenze, servizio IA e uso dell'IA stanno in `%LOCALAPPDATA%\MAGIC HS\dati\taric.db`; in `%LOCALAPPDATA%\MAGIC HS` c'è anche `registro.txt`, utile se qualcosa non funziona. Il programma fa da solo un backup del database al giorno in `dati\backup` e tiene gli ultimi 7.

Per rimettere un backup (per esempio dopo un guasto), con MAGIC HS chiuso:

```bat
"%LOCALAPPDATA%\MAGIC HS\programma\<versione>\python\python.exe" -I -m taric ripristina "%LOCALAPPDATA%\MAGIC HS\dati\backup\magic-hs-AAAA-MM-GG-HHMMSS.zip"
```

Il database di prima viene salvato in un nuovo backup. La chiave dell'IA si legge solo con lo stesso utente di Windows sullo stesso PC: su un PC nuovo va inserita di nuovo. `-m taric backup` ne fa uno al momento; `--cartella` indica la cartella di un altro utente.

## Sicurezza in breve

- **Solo dal PC**: il programma ascolta solo su 127.0.0.1 e controlla l'indirizzo di ogni richiesta, contro i siti che provano a raggiungerlo con un altro nome.
- **Ingresso**: il browser entra solo dall'avvio, con una chiave casuale scritta nella cartella dell'utente di Windows; poi tiene un cookie di sessione `HttpOnly`/`SameSite`.
- **Richieste**: protezione contro le richieste da altri siti (intestazione dedicata e controllo dell'origine) e Content-Security-Policy senza script esterni o in linea.
- **Aggiornamenti**: programma e dati arrivano solo dalla pagina delle versioni del progetto su GitHub, con controllo di dimensione e impronta SHA-256, e si estraggono con nomi e dimensioni controllati; i dati si installano solo se superano i controlli. Chi può pubblicare versioni nel progetto può cambiare il programma di tutti: proteggi l'account GitHub con l'autenticazione a due fattori.
- **Chiave dell'IA**: protetta da Windows (DPAPI) per l'utente che l'ha inserita; non è mai in chiaro sul disco.
- **Archivi caricati**: trattati come non fidati, con estrazione dei soli `.xlsx`, limiti di dimensione e nessun percorso.
- **Font**: locali (licenza SIL OFL), quindi nessun servizio di terzi caricato dalle pagine.

## Sviluppo

```bash
pip install -r requirements-dev.txt
python -m pytest -q tests                       # programma, aggiornamenti, IA, dati, backup
TARIC_ZIP_PROVA=eu-taric-2026-11.zip python -m pytest -q tests/test_dati_reali.py   # con un'estrazione vera (circa un minuto)
```

Il programma si avvia anche su Linux o macOS per le prove: `python -m taric.programma --cartella <pc> --senza-browser` (fuori da Windows la chiave dell'IA si cifra con un segreto nella cartella dei dati). Per la prova nel browser (Playwright) prepara i dati di un mese con `python strumenti/dati_mese.py AAAA-MM dati-AAAA-MM-01.zip`, avvia `python tests/finto_claude.py 9100 dati-AAAA-MM-01.zip` (imita GitHub e le API di Gemini, Claude e dei servizi compatibili OpenAI), poi il programma con `TARIC_AGGIORNAMENTI_URL=http://127.0.0.1:9100/github/releases/latest` e `TARIC_DATI_URL=http://127.0.0.1:9100/github/releases/tags/dati` su una cartella vuota, e infine `node tests/e2e_locale.js <pc>/istanza.json shots-locale`. Le istruzioni per proseguire il lavoro con Claude Code sono in `CLAUDE.md`.

## Fonti e licenze

- **Nomenclatura e misure**: Commissione europea, DG TAXUD (dati pubblicati per il riutilizzo citando la fonte).
- **Font**: Archivo (SIL Open Font License, vedi `taric/static/fonts/`).
- **Icone**: Lucide (licenza ISC, vedi `taric/static/icons/LICENSE-lucide.txt`); si rigenerano con `strumenti/icone.py`.
- **Classificazione assistita**: il servizio IA configurato (Google Gemini, Claude di Anthropic o altro).
