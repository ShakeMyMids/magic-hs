# Istruzioni per lavorare su MAGIC HS con Claude Code

Classificazione doganale (TARIC UE) ad uso interno di un'azienda: server Python (FastAPI + SQLite) e interfaccia in
JavaScript senza framework (`taric/static/`), in due modalità dello stesso `app.py`:
- **sito** (la forma principale, `cfg.server`, `python -m taric server`) su **Render** (`render.yaml`, `Dockerfile`, disco
  in `/var/data`): account con email e password, approvati dall'amministratore (gli indirizzi di `MAGIC_HS_AMMINISTRATORI`
  entrano subito come amministratori); un solo servizio IA a pagamento dalle variabili del server (`GEMINI_API_KEY`), con
  limite mensile di classificazioni per persona (`quota_predefinita`, `utenti.quota_ia`) e tetto per tutti (`tetto_mese`);
- **programma per Windows** (in ritiro, ultima versione 1.4.0): server locale su 127.0.0.1, un solo utente, IA scelta da
  ognuno con la chiave protetta da Windows. Resta finché i colleghi non passano al sito (Profilo › Esporta / Importa).
Dati TARIC del mese dalla pre-release `dati` di GitHub. Le versioni precedenti sono nella storia di git: sito con posta e
pagamenti fino a `v1.2.1`, cartella condivisa fino a `v1.2.2`, sito statico su GitHub Pages mai unito (PR #6). Tutti i
testi per l'utente, i commenti e i nomi sono in **italiano**.

## Struttura

- `taric/app.py`: rotte e API comuni (profilo, storico, preferiti, IA, esporta/importa, dati TARIC e registro sotto
  `/api/admin/`) e, a blocchi `if server:` / `if not server:`, quelle di una sola modalità. Sito: `/accedi`,
  `/api/registrazione` (modulo firmato, trappola `sito_web`), `/api/accedi`, `/api/esci`, `/api/io/password`,
  `/api/reimposta-password` (link dell'amministratore), `/api/admin/utenti`, `/api/admin/ia`, `/api/admin/impostazioni`,
  `/api/admin/backup`, `/api/salute` per Render. Programma: `/entra`, `/api/locale/*`, `/api/admin/locale*` (IA del PC,
  aggiornamenti). `descrivi_utente` dice `server` all'interfaccia. Gli errori si restituiscono come
  `{"errore": "<messaggio italiano>", "codice": "<codice>"}`.
- `taric/db.py`: schema SQLite. Le migrazioni vanno aggiunte in coda alla lista `SCHEMA`; `PRAGMA user_version`
  dice quali sono già applicate. Le tabelle della vecchia versione sito restano, per i database già creati sui PC.
- `taric/sicurezza.py`: sessioni (cookie `magic_hs` nel sito, `magic_hs_locale` nel programma), password argon2 (solo
  sito), tentativi limitati (tabella `tentativi`), gettoni monouso (link per la password), modulo firmato.
- `taric/ia.py`: chiamate al servizio IA (Gemini, Anthropic o compatibile OpenAI, scelto in Impostazioni e applicato con
  `config.imposta_ia`; nel sito dalle variabili d'ambiente). Limiti: `limite()` per persona (amministratori senza
  limite), `tetto_raggiunto()` per tutti. Ogni richiesta ha `contesto` (parte fissa, prima: va nella cache del fornitore, per Claude
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
- Sito su Render: `render.yaml` (Blueprint: servizio Docker, disco, `GEMINI_API_KEY` e `MAGIC_HS_AMMINISTRATORI` da
  inserire su Render, controllo `/api/salute`), `Dockerfile` (`TARIC_DATI=/var/data/magic-hs/dati`), `taric/__main__.py`
  (`server`: porta da `$PORT`, intestazioni del proxy HTTPS). `config.indirizzo` da `RENDER_EXTERNAL_URL`.
- `js/attiva-ia.js` (sito e programma): festa dell'IA collegata (`T.festaIA`, scena `T.festa()` di `disegni.js`,
  animazioni `.festa` in `app.css` con lo stato finale uguale a quello senza animazioni): nel sito alla prima «Prova»
  riuscita dell'amministratore, nel programma quando una chiave nuova risponde.
- `taric/static/`: `index.html` (l'app; `{{DATI}}` diventa `/data/<versione>/`), `accedi.html`, `reimposta.html` e
  `js/accesso.js` (sito: accesso, richiesta di account, nuova password), `locale.html` (programma: aperta senza la chiave
  dell'avvio), `attesa.html` con `js/attesa.js` (dati non ancora pronti), `js/comune.js` (chiamate API, tema, logo),
  `js/disegni.js` (scena con nave, gru, treno, camion e aereo, inserita negli elementi `data-scena`), `js/app.js`
  (classificazione, nomenclatura, misure; `T.server` dopo `/api/io`), `js/profilo.js`, `js/gestione.js` (sito: Gestione con
  Utenti, IA unica, Dati TARIC, Registro; programma: Impostazioni con IA, dati, programma, registro). Tema «porto»: blu marina e arancio dei
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
```

I test usano `conftest.Sito` (il sito con l'amministratore `CAPO`, `registra`/`accedi`/`collega`) e `conftest.PC` (un PC con
la sua cartella), con i finti servizio IA e GitHub (`FintoClaude`, `FintoGitHub` con programma, dati pronti e fonte). Nel
browser: `tests/e2e_sito.js` per il sito e `tests/e2e_locale.js` per il programma (vedi README, «Sviluppo»). Prova nel browser (Playwright, finto servizio IA): vedi la sezione «Sviluppo» del README. Il programma per Windows si prova
anche con Wine: estrai `dist/MAGIC-HS-*.zip`, copia il pacchetto estratto in `%LOCALAPPDATA%\MAGIC HS\programma\<versione>`
e lancia l'avvio con `MAGIC_HS_SENZA_BROWSER=1 wine cmd /c "…\Avvia MAGIC HS.cmd"`. Dopo modifiche all'interfaccia
controlla anche il telefono (larghezza 390 px) e il tema scuro.
