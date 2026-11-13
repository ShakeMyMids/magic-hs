# Istruzioni per lavorare su MAGIC HS con Claude Code

Classificazione doganale (TARIC UE) ad uso interno di un'azienda: un sito con server Python (FastAPI + SQLite) e
interfaccia in JavaScript senza framework (`taric/static/`), su **Render** (`render.yaml`, `Dockerfile`, disco in
`/var/data`, `python -m taric server`). Account con email e password, approvati dall'amministratore (gli indirizzi di
`MAGIC_HS_AMMINISTRATORI` entrano subito come amministratori); un solo servizio IA a pagamento dalle variabili del server
(`GEMINI_API_KEY`), con limite mensile di classificazioni per persona (`quota_predefinita`, `utenti.quota_ia`) e tetto per
tutti (`tetto_mese`). Dati TARIC del mese dalla pre-release `dati` di GitHub. Le versioni precedenti sono nella storia di
git: programma per Windows fino al tag `v1.4.0`, sito
con posta e pagamenti fino a `v1.2.1`, cartella condivisa fino a `v1.2.2`, sito statico su GitHub Pages mai unito (PR #6).
Tutti i testi per l'utente, i commenti e i nomi sono in **italiano**.

## Struttura

- `taric/app.py`: pagine e API. Accesso: `/accedi`, `/api/registrazione` (modulo firmato, trappola `sito_web`),
  `/api/accedi`, `/api/esci`, `/api/io/password`, `/api/reimposta-password` (link dell'amministratore). Comuni: profilo,
  storico, preferiti, IA, esporta/importa. Gestione sotto `/api/admin/`: `utenti`,
  `ia`, `impostazioni`, `backup`, dati TARIC, registro. `/api/salute` per Render. Gli errori si restituiscono come
  `{"errore": "<messaggio italiano>", "codice": "<codice>"}`.
- `taric/config.py`: configurazione dalle variabili d'ambiente (`TARIC_*`, `GEMINI_API_KEY`, `MAGIC_HS_*`,
  `RENDER_EXTERNAL_URL` per `config.indirizzo`).
- `taric/db.py`: schema SQLite. Le migrazioni vanno aggiunte in coda alla lista `SCHEMA`; `PRAGMA user_version`
  dice quali sono già applicate. Le tabelle delle versioni precedenti restano.
- `taric/sicurezza.py`: sessioni (cookie `magic_hs`), password argon2, tentativi limitati (tabella `tentativi`), gettoni
  monouso (link per la password), modulo firmato.
- `taric/ia.py`: chiamate al servizio IA (Gemini, Anthropic o compatibile OpenAI, scelto con le variabili del server).
  Limiti: `limite()` per persona (amministratori senza limite), `tetto_raggiunto()` per tutti. Ogni richiesta ha
  `contesto` (parte fissa, prima: va nella cache del fornitore, per Claude con `cache_control`) e `prompt` (la merce, in
  fondo); la risposta segue `SCHEMI[...]` (strumento obbligato per Claude, `json_schema` per OpenAI, `responseSchema` per
  Gemini) con ritorno al modo semplice se il servizio la rifiuta; sovraccarico e 429 si riprovano in `_post`. L'uso del
  mese conta le classificazioni: le richieste con la stessa `operazione` (la genera `app.js` a ogni Classifica o
  Riclassifica) contano una volta; le traduzioni (`tipo`) no. Ogni fornitore ha il suo metodo che restituisce una
  `Risposta` (con `token_cache`); gli errori diventano codici comuni (`_errore_http`) con messaggi italiani in
  `app.MESSAGGI_IA`.
- `taric/dati.py`: versioni dei dati TARIC, aggiornamento, pianificatore. Prima i dati pronti della pre-release `dati`
  su GitHub (`dati-AAAA-MM-01.zip`, impronta SHA-256, `estrai_dati`, controllo del mese), altrimenti download
  dell'estrazione dalla fonte, `aggiorna.py` e installazione. `strumenti/dati_mese.py` prepara l'archivio con gli stessi
  passaggi e `.github/workflows/dati.yml` lo pubblica ogni mese.
- `taric/aggiorna.py`: genera i file di `data/` dai file Excel dell'estrazione e li controlla. Si esegue come
  sottoprocesso con `python -I`; l'installazione avviene solo con codice di uscita 0 e ultima riga `CONTROLLI OK`.
  Non indebolire i controlli per far passare un mese: se cambia il formato dei file, adegua lo script.
- `taric/backup.py`: backup del database (.zip con solo `taric.db`, API di backup di SQLite), uno al giorno dal
  pianificatore, e ripristino (`python -m taric ripristina FILE` dalla Shell di Render, poi riavvio; `taric/__main__.py`:
  controlla integrità e schema, salva prima il database attuale).
- `taric/nomenclatura_it.json`: testo ufficiale italiano della nomenclatura (estrazione del 1° luglio 2026).
- `taric/__main__.py`: `server` (porta da `$PORT`, intestazioni del proxy HTTPS), `backup`, `ripristina` (cartella dei
  dati da `$TARIC_DATI`, che il `Dockerfile` imposta in `/var/data/magic-hs/dati`).
- `taric/static/`: `index.html` (l'app; `{{DATI}}` diventa `/data/<versione>/`), `accedi.html`, `reimposta.html` e
  `js/accesso.js` (accesso, richiesta di account, nuova password), `attesa.html` con `js/attesa.js` (dati non ancora
  pronti), `js/comune.js` (chiamate API, tema, logo), `js/disegni.js` (scena con nave, gru, treno, camion e aereo, inserita
  negli elementi `data-scena`), `js/app.js` (prima pagina: ricerca per parola o codice con `cerca()` e risultati in `#risultati`, oppure con
  l'interruttore `#modo-ia` la classificazione con l'IA, scelta ricordata in `localStorage` `magic-hs.modo`; albero
  della nomenclatura; misure), `js/profilo.js`, `js/gestione.js`
  (Utenti, Intelligenza artificiale, Dati TARIC, Registro), `js/attiva-ia.js` (festa alla prima «Prova» riuscita
  dell'amministratore: `T.festaIA`, scena `T.festa()` di `disegni.js`, animazioni `.festa` in `app.css` con lo stato
  finale uguale a quello senza animazioni). Tema «porto»: blu marina e arancio dei container, colori solo nelle variabili
  di `css/app.css` (anche quelle `--d-*` delle illustrazioni). Testi brevi: niente spiegazioni ovvie nelle pagine. Le
  icone PNG si rigenerano dal logo di `icons/icona.svg`.

## Regole da rispettare

- **CSP**: niente script in linea né da altri domini, niente gestori `onclick=`. Gli eventi si agganciano in JS
  (attributi `data-act`, `data-p`, `data-g`). Gli stili negli attributi `style` sono ammessi.
- Ogni richiesta alle API che modifica qualcosa passa da `TARIC.api()`, che aggiunge l'intestazione `X-Taric: 1`
  richiesta dal server contro le richieste da altri siti (insieme al controllo dell'origine).
- Tutto il testo inserito con `innerHTML` passa da `esc()`.
- I file `data/` sono dati non fidati generati: il server li serve solo con nomi validati (`dati.RE_FILE`).
- Dentro una `db.transazione()` un'eccezione annulla tutto.
- Non mettere chiavi o file di `dati/` nel repository.

## Prove

```bash
pip install -r requirements-dev.txt
python -m pytest -q tests
```

I test usano `conftest.Sito` (il sito con l'amministratore `CAPO`, `registra`/`accedi`/`capo`/`collega`/`riavvia`; `ia=False`
ed `extra` per altri servizi IA, `versioni` per i dati già installati) con i finti servizio IA e GitHub (`FintoClaude`,
`FintoGitHub` con dati pronti e fonte); `sito_claude` è il sito con Claude. Prova nel browser (Playwright, finto servizio
IA): `tests/e2e_sito.js`, vedi la sezione «Sviluppo» del README. Dopo modifiche all'interfaccia controlla anche il telefono
(larghezza 390 px, anche in orizzontale), il tablet (810 px in verticale, 1080 in orizzontale) e il tema scuro: fino a 900 px
le sezioni sono nella barra in basso, con `(pointer:coarse)` i pulsanti sono di almeno 40-44 px e i campi a 16 px (sotto,
l'iPhone ingrandisce la pagina); niente elementi che compaiono o spariscono quando un campo prende o perde il fuoco.
