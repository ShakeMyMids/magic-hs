# Istruzioni per lavorare su MAGIC HS con Claude Code

Programma per Windows per la classificazione doganale (TARIC UE), ad uso interno di un'azienda: server Python locale
(FastAPI + SQLite) su 127.0.0.1, aperto nel browser, interfaccia in JavaScript senza framework. Si distribuisce e si
aggiorna da una cartella condivisa (SharePoint sincronizzato da OneDrive). Non c'è più una versione sito con account,
registrazione, posta e pagamenti: è nella storia di git fino al tag `v1.2.1`. Tutti i testi per l'utente, i commenti e
i nomi sono in **italiano**.

## Struttura

- `taric/app.py`: rotte e API (ingresso con la chiave dell'avvio, profilo, storico, preferiti, IA, Gestione per chi
  pubblica). Un solo utente (`EMAIL_LOCALE`), amministratore quando è editore. Gli errori si restituiscono come
  `{"errore": "<messaggio italiano>", "codice": "<codice>"}`.
- `taric/db.py`: schema SQLite. Le migrazioni vanno aggiunte in coda alla lista `SCHEMA`; `PRAGMA user_version`
  dice quali sono già applicate. Le tabelle della vecchia versione sito restano, per i database già creati sui PC.
- `taric/sicurezza.py`: sessioni del browser (cookie dopo `/entra`).
- `taric/ia.py`: chiamate al servizio IA (Gemini, Anthropic o compatibile OpenAI, scelto in `config._ia` da
  `condivisa.ia_da_impostazioni`) con limite mensile per persona. Ogni fornitore ha il suo metodo che restituisce una `Risposta`; gli errori diventano codici comuni
  (`_errore_http`) con messaggi italiani in `app.MESSAGGI_IA`.
- `taric/dati.py`: versioni dei dati TARIC, aggiornamento (download, estrazione sicura, `aggiorna.py`, installazione), pianificatore.
- `taric/aggiorna.py`: genera i file di `data/` dai file Excel dell'estrazione e li controlla. Si esegue come
  sottoprocesso con `python -I`; l'installazione avviene solo con codice di uscita 0 e ultima riga `CONTROLLI OK`.
  Non indebolire i controlli per far passare un mese: se cambia il formato dei file, adegua lo script.
- `taric/backup.py`: backup del database (.zip con solo `taric.db`, API di backup di SQLite), uno al giorno dal
  pianificatore, e ripristino a MAGIC HS chiuso (`python -m taric ripristina`, `taric/__main__.py`: controlla
  integrità e schema, salva prima il database attuale).
- `taric/programma.py`: programma per Windows sul PC (`pythonw -I -m taric.programma --condivisa <cartella>`): una copia per
  utente (blocco su file e `istanza.json` in `%LOCALAPPDATA%\MAGIC HS`), porta su 127.0.0.1, browser con chiave d'ingresso
  (`/entra?k=`), chiusura dopo l'inattività. L'app accetta solo richieste con host `127.0.0.1`/`localhost` e la sua porta.
- `taric/condivisa.py`: cartella condivisa del programma (raccolta di SharePoint o Teams sincronizzata da OneDrive): pubblica
  (programma, dati, `impostazioni.json` con l'IA per tutti) solo chi è nell'elenco `editori` (nomi utente di Windows) e può
  scrivere; gli altri ricevono e non scrivono mai. I colleghi hanno solo la lettura: chi può scrivere può cambiare il programma
  di tutti, l'elenco non lo impedisce. Il primo editore lo indica «Gestisco io MAGIC HS». I file possono arrivare in ordine
  qualsiasi: chi legge controlla.
- `windows/`: `Avvia MAGIC HS.cmd` (solo ASCII, niente blocchi tra parentesi: i percorsi possono contenere `( ) &`) e
  `LEGGIMI.txt`; `strumenti/pacchetto_windows.py` costruisce i pacchetti (Python di python-build-standalone + librerie
  Windows), il flusso `.github/workflows/windows.yml` li prova su Windows e li pubblica per i tag `v*`.
- `taric/nomenclatura_it.json`: testo ufficiale italiano della nomenclatura (estrazione del 1° luglio 2026).
- `taric/static/`: `index.html` (l'app; `{{DATI}}` diventa `/data/<versione>/`), `locale.html` (aperta senza la chiave
  dell'avvio), `attesa.html` con `js/attesa.js` (dati non ancora pronti), `js/comune.js` (chiamate API), `js/app.js`
  (classificazione, nomenclatura, misure), `js/profilo.js`, `js/gestione.js`.

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

I test usano `conftest.PC` (un PC con la sua cartella dati, collegato a una cartella condivisa di prova) e
`conftest.FintoClaude`. Prova nel browser (Playwright, finto servizio IA): vedi la sezione «Sviluppo» del README. Il programma per Windows si prova
anche con Wine: estrai `dist/MAGIC-HS-cartella-*.zip`, copia il pacchetto estratto in `%LOCALAPPDATA%\MAGIC HS\programma\<versione>`
e lancia l'avvio con `MAGIC_HS_SENZA_BROWSER=1 wine cmd /c "…\Avvia MAGIC HS.cmd"`. Dopo modifiche all'interfaccia
controlla anche il telefono (larghezza 390 px) e il tema scuro.
