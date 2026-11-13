# Istruzioni per lavorare su MAGIC HS con Claude Code

Classificazione doganale (TARIC UE) ad uso interno di un'azienda, in due forme con la stessa interfaccia in JavaScript
senza framework (`taric/static/`):
- **sito** (la forma principale) su GitHub Pages, <https://shakemymids.github.io/magic-hs/>: solo file statici costruiti da
  `strumenti/sito.py`; quello che fa il server lo fa il browser (`js/web.js`, `js/ia.js`), installabile come app;
- **programma per Windows**: server Python locale (FastAPI + SQLite) su 127.0.0.1, aperto nel browser.
Ognuno lo usa in autonomia e senza costi: programma, sito e dati TARIC del mese arrivano da GitHub (progetto pubblico),
il servizio IA lo sceglie ognuno per sé. Non c'è più una versione sito con account, registrazione, posta
e pagamenti (storia di git fino al tag `v1.2.1`), né la cartella condivisa con chi pubblica per i colleghi (fino alla
1.2.2: il programma ne importa una volta sola il servizio IA). Tutti i testi per l'utente, i commenti e i nomi sono in
**italiano**.

## Struttura

- `taric/app.py`: rotte e API (ingresso con la chiave dell'avvio, profilo, storico, preferiti, IA, Impostazioni del PC
  sotto `/api/admin/`). Un solo utente (`EMAIL_LOCALE`), sempre amministratore e senza limite mensile. Servizio IA
  salvato nelle impostazioni del database (`salva_ia`/`applica_ia`); nuove versioni installate da `aggiorna_programma`
  (pianificatore e pagina Programma). Gli errori si restituiscono come `{"errore": "<messaggio italiano>", "codice": "<codice>"}`.
- `taric/db.py`: schema SQLite. Le migrazioni vanno aggiunte in coda alla lista `SCHEMA`; `PRAGMA user_version`
  dice quali sono già applicate. Le tabelle della vecchia versione sito restano, per i database già creati sui PC.
- `taric/sicurezza.py`: sessioni del browser (cookie dopo `/entra`).
- `taric/ia.py`: chiamate al servizio IA (Gemini, Anthropic o compatibile OpenAI, scelto in Impostazioni e applicato con
  `config.imposta_ia`). Ogni richiesta ha `contesto` (parte fissa, prima: va nella cache del fornitore, per Claude
  con `cache_control`) e `prompt` (la merce, in fondo); la risposta segue `SCHEMI[...]` (strumento obbligato per Claude,
  `json_schema` per OpenAI, `responseSchema` per Gemini) con ritorno al modo semplice se il servizio la rifiuta; sovraccarico
  e 429 si riprovano in `_post`. L'uso del mese conta le classificazioni: le richieste con la stessa `operazione` (la
  genera `app.js` a ogni Classifica o Riclassifica) contano una volta; le traduzioni (`tipo`) no. Ogni fornitore ha il suo
  metodo che restituisce una `Risposta` (con `token_cache`); gli errori diventano codici comuni (`_errore_http`) con
  messaggi italiani in `app.MESSAGGI_IA`.
- `taric/segreti.py`: chiave dell'IA protetta da Windows (DPAPI, `dpapi:`), fuori da Windows con un segreto nella
  cartella dei dati (`locale:`); lettura una tantum di `impostazioni.json` della vecchia cartella condivisa (`mhs1:`).
- `taric/dati.py`: versioni dei dati TARIC, aggiornamento, pianificatore. Prima i dati pronti della pre-release `dati`
  su GitHub (`dati-AAAA-MM-01.zip`, impronta SHA-256, `estrai_dati`, controllo del mese), altrimenti download
  dell'estrazione dalla fonte, `aggiorna.py` e installazione. `strumenti/dati_mese.py` prepara l'archivio con gli stessi
  passaggi e `.github/workflows/dati.yml` lo pubblica ogni mese.
- `taric/aggiorna.py`: genera i file di `data/` dai file Excel dell'estrazione e li controlla. Si esegue come
  sottoprocesso con `python -I`; l'installazione avviene solo con codice di uscita 0 e ultima riga `CONTROLLI OK`.
  Non indebolire i controlli per far passare un mese: se cambia il formato dei file, adegua lo script.
- `taric/backup.py`: backup del database (.zip con solo `taric.db`, API di backup di SQLite), uno al giorno dal
  pianificatore, e ripristino a MAGIC HS chiuso (`python -m taric ripristina`, `taric/__main__.py`: controlla
  integrità e schema, salva prima il database attuale).
- `taric/programma.py`: programma per Windows sul PC (`pythonw -I -m taric.programma --avvio <cartella dell'avvio>`, anche
  `--condivisa` per gli avvii della 1.2): una copia per utente (blocco su file e `istanza.json` in `%LOCALAPPDATA%\MAGIC HS`),
  porta su 127.0.0.1, browser con chiave d'ingresso (`/entra?k=`), chiusura dopo l'inattività, pulizia delle versioni
  vecchie (tiene quella in uso, quella di `attuale.txt` e quella della cartella dell'avvio). L'app accetta solo richieste
  con host `127.0.0.1`/`localhost` e la sua porta. Nella cartella dell'avvio non si scrive mai (può essere in sola lettura).
- `windows/`: `Avvia MAGIC HS.cmd` (solo ASCII, niente blocchi tra parentesi: i percorsi possono contenere `( ) &`; copia
  il pacchetto della cartella in `%LOCALAPPDATA%\MAGIC HS\programma\<versione>` e usa la versione di `attuale.txt` se c'è) e
  `LEGGIMI.txt`; `strumenti/pacchetto_windows.py` costruisce `MAGIC-HS-<versione>.zip` (la cartella da scaricare) e
  `magic-hs-windows-<versione>.zip` (per gli aggiornamenti; contiene anche avvio e LEGGIMI, che la 1.2 copiava nella
  cartella condivisa). Il flusso `.github/workflows/windows.yml` li prova su Windows e li pubblica da solo quando su `main`
  arriva una `__version__` senza pagina (oppure per i tag `v*` o a mano). Per pubblicare una versione basta cambiare `__version__`.
- `taric/aggiornamenti.py`: ultima versione da GitHub (`releases/latest`, al massimo ogni sei ore), download del pacchetto con
  controllo di dimensione e SHA-256, estrazione della sola cartella `python/` in `programma/<versione>` e scrittura di
  `attuale.txt` (CRLF, per `set /p`): si usa dal prossimo avvio. Nei test `conftest.FintoGitHub`: mai GitHub vero.
- `taric/nomenclatura_it.json`: testo ufficiale italiano della nomenclatura (estrazione del 1° luglio 2026).
- Sito: `js/web.js` risponde alle stesse richieste di `TARIC.api()` che nel programma arrivano a `app.py` (profilo,
  preferenze, storico in IndexedDB, preferiti, Impostazioni ridotte a IA e dati, esporta/importa) e sceglie i dati del mese
  da `config.js`; `js/ia.js` è il porting di `ia.py` (stessi schemi, nuovi tentativi, codici d'errore; Claude con
  `anthropic-dangerous-direct-browser-access`). **Una modifica alle API in `app.py` va riportata in `web.js`** (e
  viceversa). `T.web` vale nel sito: nasconde ciò che riguarda il programma (Chiudi, scheda Programma, Registro).
  `sw.js` (completato da `sito.py`): prima la rete per le pagine, prima la copia salvata per `dati/<versione>/`.
  `strumenti/sito.py` rende relativi i percorsi, mette la CSP nella pagina e i dati degli ultimi mesi in `dati/`;
  `.github/workflows/sito.yml` lo pubblica su GitHub Pages (anche dopo ogni mese nuovo di `dati.yml`).
- `taric/static/`: `index.html` (l'app; `{{DATI}}` diventa `/data/<versione>/`), `locale.html` (aperta senza la chiave
  dell'avvio), `attesa.html` con `js/attesa.js` (dati non ancora pronti), `js/comune.js` (chiamate API, tema, logo),
  `js/disegni.js` (scena con nave, gru, treno, camion e aereo, inserita negli elementi `data-scena`), `js/app.js`
  (classificazione, nomenclatura, misure), `js/profilo.js`, `js/gestione.js` (vista Impostazioni: IA, dati, programma, registro). Tema «porto»: blu marina e arancio dei
  container, colori solo nelle variabili di `css/app.css` (anche quelle `--d-*` delle illustrazioni). Testi brevi: niente
  spiegazioni ovvie nelle pagine. Le icone PNG si rigenerano dal logo di `icons/icona.svg`.

## Regole da rispettare

- **CSP**: niente script in linea né da altri domini, niente gestori `onclick=`. Gli eventi si agganciano in JS
  (attributi `data-act`, `data-p`, `data-g`). Gli stili negli attributi `style` sono ammessi.
- Ogni richiesta alle API che modifica qualcosa passa da `TARIC.api()`, che aggiunge l'intestazione `X-Taric: 1`
  richiesta dal programma contro le richieste da altri siti.
- Tutto il testo inserito con `innerHTML` passa da `esc()`.
- I file `data/` sono dati non fidati generati: il server li serve solo con nomi validati (`dati.RE_FILE`).
- Dentro una `db.transazione()` un'eccezione annulla tutto.
- Non mettere chiavi o file di `dati/` nel repository.

## Prove

```bash
pip install -r requirements-dev.txt
python -m pytest -q tests
node --test tests/ia_web.test.js
```

I test usano `conftest.PC` (un PC con la sua cartella, finti servizio IA e GitHub: `FintoClaude`, `FintoGitHub` con
programma, dati pronti e fonte). L'IA del sito si prova con `node --test tests/ia_web.test.js`; il sito intero nel browser
con `tests/e2e_sito.js` (vedi README, «Sviluppo»). Prova nel browser (Playwright, finto servizio IA): vedi la sezione «Sviluppo» del README. Il programma per Windows si prova
anche con Wine: estrai `dist/MAGIC-HS-*.zip`, copia il pacchetto estratto in `%LOCALAPPDATA%\MAGIC HS\programma\<versione>`
e lancia l'avvio con `MAGIC_HS_SENZA_BROWSER=1 wine cmd /c "…\Avvia MAGIC HS.cmd"`. Dopo modifiche all'interfaccia
controlla anche il telefono (larghezza 390 px) e il tema scuro.
