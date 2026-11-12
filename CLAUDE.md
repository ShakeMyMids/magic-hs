# Istruzioni per lavorare su MAGIC HS con Claude Code

Sito per la classificazione doganale (TARIC UE): server Python (FastAPI + SQLite), interfaccia in JavaScript
senza framework. Tutti i testi per l'utente, i commenti e i nomi sono in **italiano**.

## Struttura

- `taric/app.py`: rotte e API (accesso, registrazione, profilo, storico, preferiti, IA, amministrazione).
  Gli errori si restituiscono come `{"errore": "<messaggio italiano>", "codice": "<codice>"}`.
- `taric/db.py`: schema SQLite. Le migrazioni vanno aggiunte in coda alla lista `SCHEMA`; `PRAGMA user_version`
  dice quali sono già applicate. Le impostazioni modificabili dal pannello sono in `IMPOSTAZIONI_PREDEFINITE`.
- `taric/sicurezza.py`: password (Argon2), sessioni, gettoni monouso, limiti ai tentativi, moduli firmati.
- `taric/registrazioni.py`: la procedura automatica delle registrazioni (conferma email, regole, avvisi, pulizia).
- `taric/ia.py`: chiamate al servizio IA (Gemini, Anthropic o compatibile OpenAI, scelto in `config._ia`) con limite
  mensile per utente. Ogni fornitore ha il suo metodo che restituisce una `Risposta`; gli errori diventano codici comuni
  (`_errore_http`) con messaggi italiani in `app.MESSAGGI_IA`.
- `taric/dati.py`: versioni dei dati TARIC, aggiornamento (download, estrazione sicura, `aggiorna.py`, installazione), pianificatore.
- `taric/aggiorna.py`: genera i file di `data/` dai file Excel dell'estrazione e li controlla. Si esegue come
  sottoprocesso con `python -I`; l'installazione avviene solo con codice di uscita 0 e ultima riga `CONTROLLI OK`.
  Non indebolire i controlli per far passare un mese: se cambia il formato dei file, adegua lo script.
- `taric/backup.py`: backup del database (.zip con solo `taric.db`, API di backup di SQLite), uno al giorno dal
  pianificatore, e ripristino a sito spento (controlla integrità e schema, salva prima il database attuale).
- `taric/programma.py`: programma per Windows sul PC (`pythonw -I -m taric.programma --condivisa <cartella>`): una copia per
  utente (blocco su file e `istanza.json` in `%LOCALAPPDATA%\MAGIC HS`), porta su 127.0.0.1, browser con chiave d'ingresso
  (`/entra?k=`), chiusura dopo l'inattività. Con `TARIC_LOCALE` l'app ha un solo utente, controlla l'host e spegne le
  funzioni del sito (`app.SOLO_SITO`).
- `taric/condivisa.py`: cartella condivisa (OneDrive) del programma: pubblica (programma, dati, `impostazioni.json` con l'IA
  per tutti) solo chi è nell'elenco `editori` (nomi utente di Windows) e può scrivere; gli altri ricevono e non scrivono mai.
  Per il collegamento OneDrive serve il permesso di modifica, quindi la scrittura da sola non distingue l'editore. Il primo
  editore lo indica «Gestisco io MAGIC HS». I file possono arrivare in ordine qualsiasi: chi legge controlla.
- `windows/`: `Avvia MAGIC HS.cmd` (solo ASCII, niente blocchi tra parentesi: i percorsi possono contenere `( ) &`) e
  `LEGGIMI.txt`; `strumenti/pacchetto_windows.py` costruisce i pacchetti (Python di python-build-standalone + librerie
  Windows), il flusso `.github/workflows/windows.yml` li prova su Windows e li pubblica per i tag `v*`.
- `taric/pagamenti.py`: piano Pro con Stripe (pass senza rinnovo, abbonamenti, concessioni manuali). Checkout con `price_data`,
  webhook firmato e idempotente (colonna `pagamenti.evento`), conferma al ritorno, rilettura periodica degli abbonamenti.
  Nei test una finta API di Stripe (`conftest.FintoStripe`; `tests/finto_claude.py` per il browser).
- `server/installa.sh` e `server/magic-hs`: installazione su un VPS Ubuntu/Debian (Docker, firewall, HTTPS con Caddy)
  e comandi di gestione. Devono restare idempotenti e passare `shellcheck -S style`; i messaggi sono in italiano.
- `taric/nomenclatura_it.json`: testo ufficiale italiano della nomenclatura (estrazione del 1° luglio 2026).
- `taric/static/`: `index.html` (l'app; `{{DATI}}` diventa `/data/<versione>/`), pagine di accesso, `js/comune.js`
  (chiamate API), `js/app.js` (classificazione, nomenclatura, misure), `js/profilo.js`, `js/gestione.js`, `js/accesso.js`.

## Regole da rispettare

- **CSP**: niente script in linea né da altri domini, niente gestori `onclick=`. Gli eventi si agganciano in JS
  (attributi `data-act`, `data-p`, `data-g`). Gli stili negli attributi `style` sono ammessi.
- Ogni richiesta alle API che modifica qualcosa passa da `TARIC.api()`, che aggiunge l'intestazione `X-Taric: 1`
  richiesta dal server contro le richieste da altri siti.
- Tutto il testo inserito con `innerHTML` passa da `esc()`.
- I file `data/` sono dati non fidati generati: il server li serve solo con nomi validati (`dati.RE_FILE`).
- Dentro una `db.transazione()` un'eccezione annulla tutto: i contatori dei tentativi falliti vanno salvati
  in una transazione separata prima di rispondere con l'errore (vedi `accedi`).
- Non mettere chiavi o file di `dati/` nel repository.

## Prove

```bash
pip install -r requirements-dev.txt
python -m pytest -q tests
```

Prova nel browser (Playwright, finto servizio IA): vedi la sezione «Sviluppo» del README. Il programma per Windows si prova
anche con Wine: estrai `dist/MAGIC-HS-cartella-*.zip`, copia il pacchetto estratto in `%LOCALAPPDATA%\MAGIC HS\programma\<versione>`
e lancia l'avvio con `MAGIC_HS_SENZA_BROWSER=1 wine cmd /c "…\Avvia MAGIC HS.cmd"`. Dopo modifiche all'interfaccia
controlla anche il telefono (larghezza 390 px) e il tema scuro.
