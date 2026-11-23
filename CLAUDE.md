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
  `/api/accedi`, `/api/esci`, `/api/io/password`, `/api/reimposta-password` (link dell'amministratore); le email dei domini
  dell'impostazione `domini_automatici` (predefinito `dhl.com`) entrano subito con `quota_ia = 0` (IA spenta, codice
  `ia_non_autorizzata`, testo `T.IA_NON_AUTORIZZATA` di `comune.js`; i comandi dell'IA restano visibili, bloccati con `.con-divieto`). Comuni: profilo,
  storico (colonna `condivisa` dalla preferenza `condividi`), preferiti (`/api/preferiti/cambi`: differenze con la versione
  precedente dei dati, da `taric/cambi.py`), archivio aziendale (`/api/archivio`), sinonimi (`/api/sinonimi`), parole senza
  risultati (`/api/ricerche-vuote`, anonime), bolle simulate (`/api/bolle`, personali) e cambio doganale del mese
  (`/api/cambio`), tariffa del trasporto (`/api/trasporto`), segnalazioni di problemi (`/api/segnalazioni`, le proprie con la
  risposta, `lette`; `risposte` di `/api/io` conta quelle nuove), IA, esporta/importa. Gestione sotto `/api/admin/`: `utenti`,
  `aziende` (`regole`, `azione` disconnetti/sospendi/riattiva, `nome` per rinominare o unire), `ia`, `impostazioni`, `backup`,
  `copia-esterna`, dati TARIC (con lo stato della copia esterna), `ricerca` e `sinonimi`,
  `trasporto` (PDF delle tariffe, versioni, `trasporto/carburante` a mano, `trasporto/carburante/aggiorna`), `segnalazioni`
  (risposta, `stato` aperta/chiusa, eliminazione; quelle aperte nel `riepilogo`), registro. `/api/salute` per Render. Middleware: compressione gzip e cache lunga per i file con `?v=`. Gli errori si restituiscono come
  `{"errore": "<messaggio italiano>", "codice": "<codice>"}`.
- `taric/config.py`: configurazione dalle variabili d'ambiente (`TARIC_*`, `GEMINI_API_KEY`, `MAGIC_HS_*`,
  `RENDER_EXTERNAL_URL` per `config.indirizzo`, `MAGIC_HS_COPIA_*` per la copia esterna, `MAGIC_HS_BCE_URL` per i cambi,
  `MAGIC_HS_CARBURANTE_URL` per il carburante di DHL, vuota = solo a mano; `autore`: `MAGIC_HS_AUTORE`, altrimenti il primo indirizzo
  di `MAGIC_HS_AMMINISTRATORI`, le cui risposte alle segnalazioni hanno l'avatar di Simone).
- `taric/valute.py`: cambio doganale del mese per la bolla (penultimo mercoledì del mese precedente, art. 146 Reg. UE
  2015/2447), dalla BCE in CSV (`TIME_PERIOD`, `OBS_VALUE`), tenuto nella tabella `cambi_doganali`.
- `taric/ricerca.py`: le regole della ricerca di `app.js` (`piano`, `radice`) lato server, per controllare che i termini
  di un sinonimo esistano nella nomenclatura (`presente`). `taric/cambi.py`: cosa cambia per un codice tra due versioni.
- `taric/aziende.py`: il campo `azienda` degli utenti fa da gruppo (`chiave`: minuscole, spazi ridotti); le regole nella tabella
  `aziende` (`quota_ia`, `ia`) si scrivono in `utenti.quota_ia` di chi c'è (`applica`, non gli amministratori) e di chi entra dopo
  (approvazione, cambio di azienda in Gestione); `/api/io` non cambia più l'azienda (la cambia l'amministratore).
- `taric/copia.py`: copia settimanale del database in un archivio compatibile S3 (firma AWS Signature V4 con httpx, senza
  librerie in più; nomi a rotazione su 8 settimane; dopo un errore si riprova dopo 6 ore; esito in `impostazioni`
  `copia_esterna`). Il pianificatore la chiama tra i suoi `compiti`; il backup si scrive con `Backup.scrivi` in un file a
  parte, fuori dall'elenco dei backup giornalieri.
- `taric/trasporto.py` e `taric/leggi_tariffe.py`: tariffe del calcolatore del trasporto. Il PDF della «Guida ai servizi e
  alle tariffe» di DHL Express caricato in Gestione si legge con `python -I leggi_tariffe.py` (solo pypdf, sottoprocesso
  come `aggiorna.py`, ultima riga `CONTROLLI OK`): zonario con codici del TARIC e nomi italiani (`PAESI`, il Regno Unito
  2/3 diventa GB e XI), spunte dei servizi (immagini, dalla loro posizione), tabelle delle merci con gli scatti e il passo
  vero ricavato dai prezzi, orari, limiti, supplementi. Non indebolire i controlli: le parti essenziali bloccano, quelle
  accessorie diventano `avvisi`. Versioni nella tabella `tariffe_trasporto` (una `attiva`), carburante della settimana in
  `impostazioni` `carburante` (`percentuale` per Worldwide e servizi a orario, `economy` per Economy Select, `dal`/`al`,
  `fonte` `dhl` o `mano`; a mano vale fino alla domenica). `taric/carburante.py` lo legge dalla pagina pubblica dei
  supplementi di DHL Express Italia (tabelle «Servizi Internazionali Time Definite» e «Servizi Day Definite Intra-Europe»,
  righe «Novembre 16-22, 2026 | 50.00%»): il pianificatore lo chiama una volta al giorno se c'è una tariffa (`da_fare`,
  dopo un errore aspetta 6 ore), esito in `impostazioni` `carburante_auto`. `prezzo()` di `leggi_tariffe.py` e quello di `js/trasporto.js` devono fare lo stesso conto
  (lo prova `tests/test_trasporto.py`).
- `taric/db.py`: schema SQLite. Le migrazioni vanno aggiunte in coda alla lista `SCHEMA`; `PRAGMA user_version`
  dice quali sono già applicate. Le tabelle delle versioni precedenti restano.
- `taric/sicurezza.py`: sessioni (cookie `magic_hs`), password argon2, tentativi limitati (tabella `tentativi`), gettoni
  monouso (link per la password), modulo firmato.
- `taric/ia.py`: chiamate al servizio IA (Gemini, Anthropic o compatibile OpenAI, scelto con le variabili del server).
  Limiti: `limite()` per persona (amministratori senza limite), `tetto_raggiunto()` per tutti. Ogni richiesta ha
  `contesto` (parte fissa, prima: va nella cache del fornitore, per Claude con `cache_control`) e `prompt` (la merce, in
  fondo); fino a 3 allegati (`Allegato.da`: foto JPEG, PNG o WebP fino a 3 MB e PDF fino a 5 MB in base64, primi byte, 8 MB in
  tutto; `allegato_non_valido`, `allegati_troppo_grandi`) vanno tra i due, solo nelle classificazioni, e non si scrivono da
  nessuna parte; se il servizio li rifiuta l'errore è `allegato_non_accettato` (`pdf_troppo_lungo` per il contesto finito);
  con gli allegati gli schemi sono `voci_foto` e `scelta_foto` (in più `letto` e, al primo passo, `merci`); la risposta segue `SCHEMI[...]` (strumento obbligato per Claude, `json_schema` per OpenAI, `responseSchema` per
  Gemini) con ritorno al modo semplice se il servizio la rifiuta; sovraccarico e 429 si riprovano in `_post`. L'uso del
  mese conta le classificazioni: le richieste con la stessa `operazione` (la genera `app.js` a ogni Classifica o
  Riclassifica) contano una volta; le traduzioni (`tipo`) no, ma rispettano limite e tetto. Ogni fornitore ha il suo
  metodo che restituisce una `Risposta` (con `token_cache`); gli errori diventano codici comuni (`_errore_http`, una
  risposta interrotta per lunghezza è `risposta_troncata`) con messaggi italiani in `app.MESSAGGI_IA`.
- `taric/dati.py`: versioni dei dati TARIC, aggiornamento, pianificatore; mesi passati (`versione_per`, `pubblicati`,
  `archiviata`, `contenuto`): scaricati dalla pagina «dati» quando servono (`/api/dati/storico?data=`), tenuti come zip in
  `dati/taric/archivio` e serviti da lì; `/?dati=AAAA-MM-01` apre l'app con quei dati (`data-attivi` dice quelli in uso,
  `STORICO` in `app.js`, con `giorno`, `codice`, `paese`, `flusso`, `bolla` nell'indirizzo); `nome_ufficiale` uniforma i nomi
  dei file dell'estrazione (su CIRCABC con maiuscole, spazi, «(1)» e plurali diversi). `strumenti/dati_storici.py` prepara i
  mesi passati da CIRCABC (da luglio 2025) e `.github/workflows/dati-storici.yml` li pubblica. Prima i dati pronti della pre-release `dati`
  su GitHub (`dati-AAAA-MM-01.zip`, impronta SHA-256, `estrai_dati`, controllo del mese), altrimenti download
  dell'estrazione dalla fonte, `aggiorna.py` e installazione. `strumenti/dati_mese.py` prepara l'archivio con gli stessi
  passaggi e `.github/workflows/dati.yml` lo pubblica ogni mese.
- `taric/aggiorna.py`: genera i file di `data/` dai file Excel dell'estrazione e li controlla. Si esegue come
  sottoprocesso con `python -I`; l'installazione avviene solo con codice di uscita 0 e ultima riga `CONTROLLI OK`.
  Non indebolire i controlli per far passare un mese: se cambia il formato dei file, adegua lo script (le intestazioni
  equivalenti già viste nelle estrazioni passate sono in `VARIANTI`).
- `taric/backup.py`: backup del database (.zip con solo `taric.db`, API di backup di SQLite), uno al giorno dal
  pianificatore (quello scaricato da Gestione si scrive in `backup-scaricati`, fuori dall'elenco, e si cancella dopo
  l'invio), e ripristino (`python -m taric ripristina FILE` dalla Shell di Render: a sito acceso, riconosciuto da
  `dati/server.pid`, il backup va in `ripristino-in-attesa.db` e si rimette al riavvio; `taric/__main__.py`:
  controlla integrità e schema, salva prima il database attuale).
- `taric/nomenclatura_it.json`: testo ufficiale italiano della nomenclatura (estrazione del 1° luglio 2026).
- `taric/__main__.py`: `server` (porta da `$PORT`, intestazioni del proxy HTTPS), `backup`, `ripristina` (cartella dei
  dati da `$TARIC_DATI`, che il `Dockerfile` imposta in `/var/data/magic-hs/dati`).
- `taric/static/`: `index.html` (l'app; `{{DATI}}` diventa `/data/<versione>/` e `{{V}}` l'impronta dei file di quella
  versione, `dati.impronta()`, in `data-v` e nei `?v=` di `fileDati()` di `app.js`), `accedi.html`, `reimposta.html` e
  `js/accesso.js` (accesso, richiesta di account, nuova password), `attesa.html` con `js/attesa.js` (dati non ancora
  pronti), `js/comune.js` (chiamate API, tema, logo, finestre `T.finestra`, mesi in parole `T.meseIt`, testi accorciati `T.taglia`), `js/installa.js` (tasto Installa: finestra
  d'installazione del browser con `beforeinstallprompt`, altrimenti i passi per iPhone/iPad, Safari, Firefox; registra
  `sw.js`, servito come `/sw.js`, che non conserva niente e senza rete mostra solo un avviso; riceve anche «Condividi → MAGIC HS»
  dallo `share_target` del manifest, POST `/condividi`: tiene i file in memoria finché la pagina `/?condivisa=1` non li chiede
  con il messaggio `condivisa?`; senza service worker il server rimanda a `/?condivisa=0`), `js/disegni.js` (Simone, l'autore: `T.AUTORE`, busto `T.autore({esulta})` e testa `T.autoreTesta` con le variabili `--av-*`,
  firma negli elementi `data-autore` inserita da `comune.js`, figura `.t-simone` sulla banchina che saluta, cabina del gioco; scena con nave, gru, treno, camion e aereo, inserita
  negli elementi `data-scena`: due composizioni, larga e compatta, scelte in `app.css` con una container query sulla
  larghezza del riquadro, così sul telefono niente viene tagliato; `data-scena="vivo"` la anima piano), `js/app.js` (prima pagina: ricerca per parola o codice con `cerca()`, che ignora le parole vuote e usa i sinonimi di
  `js/sinonimi.js`, e risultati in `#risultati`, oppure con
  l'interruttore `#modo-ia` la classificazione con l'IA, scelta ricordata in `localStorage` `magic-hs.modo`; anche da foto e
  PDF: tasto `#foto` nella casella e «+» tra gli allegati (con `#foto-file`, `multiple`), file trascinati sulla `.domanda`,
  incollati in `#q` o condivisi da un'altra app (`riceviCondivisa`), preparati da `js/foto.js` (`T.foto.prepara`: foto in JPEG
  con il lato lungo di 1280 px e `avviso` «scura» o «sfocata» da `misura()`, PDF interi fino a 5 MB, letti come `data:` per la
  CSP), in `state.allegati` (al massimo `T.foto.MASSIMI`) e mandati con ogni richiesta della classificazione; in `#foto-merce`
  miniature, quello che l'IA vede (`state.fotoVista`) con «Correggi», il testo letto (`state.fotoLetto`, nel risultato
  `letto`) e, se negli allegati ci sono più merci (`state.fotoMerci`), la scelta, che continua la stessa operazione
  (`state.sospesa`); nello storico solo il testo (`Foto: …` o `Scheda PDF: …`, `dati.foto`); sopra i
  risultati l'archivio aziendale e, prima di chiedere all'IA una descrizione già classificata, la proposta di riprenderla;
  le ricerche senza risultati vanno a `/api/ricerche-vuote`; albero della nomenclatura; misure con il calcolo degli
  importi e la stampa, stili `@media print` in fondo ad `app.css`; data delle misure della scheda in `state.dataMisure` con
  `giornoMisure()`: prima della data dei dati (`primaDeiDati`) niente misure e link `urlTaric()` al TARIC dell'UE a quel giorno,
  perché le estrazioni mensili non contengono le misure finite; `misureBolla()` per la bolla, che per le date passate fa lo stesso), `js/calcolo.js` (calcoli
  senza pagina, `window.TARIC_CALCOLO` e modulo di node: dazi, condizioni con i documenti, regimi, codice addizionale del
  produttore per famiglia, ripartizione al centesimo, `calcolaImport`/`calcolaExport`; ogni cosa incerta diventa un blocco
  con il motivo, mai una stima; i `conflitti` tra i campi (con il `campo` da evidenziare) non bloccano il totale; codici della
  casella 36 con `codicePreferenza` e della 47 con `codiceTributo`; `verificaTaric` dell'articolo con antidumping o compensativi
  in una bolla dopo la data dei dati (`ctx.dataDati`), che `bolla.js` completa con il link al TARIC dell'UE; `datiMancanti` elenca i dati obbligatori vuoti del tracciato H1
  EUCDM 6.2 o della colonna B1, senza bloccare; si prova con `node tests/prova_calcolo.js`), `js/codici-dogana.js` (liste di codici delle
  tabelle ADM: imballaggi, natura della transazione, modi di trasporto, aggiunte e detrazioni, metodi, rappresentanza; `aereo`:
  allegato 23-01 del Reg. UE 2015/2447, zone A-Q con la percentuale e zone per paese, più di una per US, CA e RU secondo
  l'aeroporto),
  `js/trasporto.js` (costo di spedizione senza pagina, `window.TARIC_TRASPORTO` e modulo di node: pesi, prezzo con gli scatti,
  supplementi dai colli, carburante, `quotaBolla`; si prova con `node tests/prova_trasporto.js`), `js/spedizione.js` (calcolatore
  nella sezione Bolla, `T.spedizione.apri`: da solo o dalla bolla d'importazione con «Usa nella bolla» e la quota
  proposta dall'allegato 23-01; il carburante del servizio scelto finché non si scrive a mano), `js/bolla.js`
  (sezione Bolla: elenco, intestazione, articoli, tributi, documenti della casella 44, riferimenti DE e casella di ogni campo in
  `RIF_IMP`/`RIF_EXP`, foglio `#bolla-stampa` con `body.stampa-bolla`), `js/profilo.js` (anche gli avvisi
  sui preferiti cambiati), `js/gestione.js`
  (Utenti con azienda e «Disconnetti», Aziende, Intelligenza artificiale, Dati TARIC con la copia del database, Ricerca, Trasporto,
  Segnalazioni, Registro), `js/porto.js` (la scena si tocca:
  gruppi `.t-*` di `disegni.js` animati per la durata di una classe; tre tocchi sulla gru o «gioca» scritto fuori dai campi aprono
  il gioco; «nave», «festa», «magic» e cinque tocchi sul logo; l'albero si scuote e fa cadere quello della stagione; `[data-gioca]`
  nelle pagine d'attesa; pioggia di benvenuto `.pioggia`, una volta al giorno), `js/calendario.js` (nell'`<head>` di ogni pagina:
  `T.calendario(data)` con stagione per mesi interi, feste italiane con Pasqua calcolata, `tema` (la festa più importante,
  altrimenti la stagione) e `auguri`; `T.oggi` e le classi su `<html>`: stagione, feste, `con-tema`, `tema-<nome>`; spento da
  `localStorage` `magic-hs.stagioni`, anteprima di un giorno da `sessionStorage` `magic-hs.prova-giorno`, tutti e due dal
  profilo; mette su `<html>` anche il tema chiaro o scuro scelto, `localStorage` `magic-hs.tema`, prima del primo disegno). In `app.css` ogni `tema-*` ha l'accento chiaro e scuro (`--tema-chiaro`, `--tema-scuro`, controllati per il contrasto
  da `node tests/prova_calendario.js`) e un secondo colore `--tema-2`; le forme (motivo dello sfondo, simbolo delle schede,
  neve, pioggia) sono maschere SVG generate da `strumenti/forme_stagioni.py` tra «forme: inizio» e «forme: fine»
  (`tests/test_forme.py`). `disegni.js` disegna nella scena solo le decorazioni di oggi e dà `T.ornamento` (auguri, vignette),
  `T.festone` (striscia in cima alla barra) e `T.accessorio` (logo); `comune.js` li inserisce con `data-auguri` e
  l'avviso dell'anteprima), `js/gioco.js` (`T.gioco()`, «Carica la nave»: SVG con le variabili `--d-*`, record in `localStorage`
  `magic-hs.gioco`), `T.vignetta()` di `disegni.js` per gli elenchi vuoti, codici recenti di `app.js` (`magic-hs.recenti`),
  `js/aiuto.js` (Marino, il gabbiano marinaio dell'aiuto: tasto `#aiuto` «?» nella barra, nascosto in Gestione, o il tasto ?; visita a passi della sezione aperta con `PASSI[vista]`, ogni passo con `t`, `d` ed `e` che trova l'elemento da illuminare, spesso il `.box` dalla sua `.lab` con `box(/^…/)`: i passi senza elemento si saltano, quindi se cambi un'etichetta o un riquadro controlla i passi; luce `.aiuto-luce` e fumetto `.aiuto-posto` seguiti a ogni fotogramma; nella pagina d'accesso (`accedi.html`, `data-pagina="accedi"`) la vista `accesso`, che presenta l'app; la prima volta in una sezione l'invito `.aiuto.invito`
  (niente velo né fuoco; sezioni già viste in `localStorage` `magic-hs.aiuto-visto`, che `tests/e2e_sito.js` riempie in ogni contesto); disegno SVG con le classi `mr-*` e i colori `--g-*`; le prove sono in `tests/e2e_sito.js`),
  `js/segnala.js` (`T.segnala()`, finestra «Segnala un problema» aperta dagli elementi `[data-segnala]` e dall'ultimo passo di
  Marino: testo e contesto, cioè sezione, codice aperto, schermo, browser, dati in uso; tabella `segnalazioni` con `letta` per la
  risposta nuova; Gestione › Segnalazioni in `gestione.js`, «Segnalazioni» nel profilo),
  `js/attiva-ia.js` (festa alla prima «Prova» riuscita
  dell'amministratore: `T.festaIA`, scena `T.festa()` di `disegni.js`, animazioni `.festa` in `app.css` con lo stato
  finale uguale a quello senza animazioni). Tema «porto»: blu marina e arancio dei container, colori solo nelle variabili
  di `css/app.css` (anche quelle `--d-*` delle illustrazioni). Puntatore del mouse: l'aereo `--aereo`/`--aereo-via` (con
  `(hover:hover) and (pointer:fine)`, non con il contrasto elevato o i colori forzati, spento dal profilo con la classe
  `senza-aereo` e `localStorage` `magic-hs.aereo`): nelle regole si scrive `cursor:var(--mano,pointer)` o `var(--freccia,default)`. Testi brevi: niente spiegazioni ovvie nelle pagine. Le
  icone PNG si rigenerano dal logo di `icons/icona.svg`.

## Regole da rispettare

- **Consegna**: finito un lavoro, commit e push su un ramo nuovo, poi senza chiedere si apre la PR e, quando le prove di
  GitHub (`test` e `browser`) sono passate, si fa il merge in `main`.
- **CSP**: niente script in linea né da altri domini, niente gestori `onclick=`. Gli eventi si agganciano in JS
  (attributi `data-act`, `data-p`, `data-g`). Gli stili negli attributi `style` sono ammessi.
- Ogni richiesta alle API che modifica qualcosa passa da `TARIC.api()`, che aggiunge l'intestazione `X-Taric: 1`
  richiesta dal server contro le richieste da altri siti (insieme al controllo dell'origine).
- Tutto il testo inserito con `innerHTML` passa da `esc()`.
- I file `data/` sono dati non fidati generati: il server li serve solo con nomi validati (`dati.RE_FILE`).
- Le pagine HTML passano da `con_impronte()` in `app.py`: i link a `/static/` ricevono `?v=<impronta>` e una cache lunga.
  Non scrivere a mano altri indirizzi di file statici senza passare da lì.
- Dentro una `db.transazione()` un'eccezione annulla tutto.
- Non mettere chiavi o file di `dati/` nel repository.

## Prove

```bash
pip install -r requirements-dev.txt
python -m pytest -q tests
node tests/prova_calcolo.js
node tests/prova_calendario.js
node tests/prova_trasporto.js
```

`tests/test_trasporto.py` usa la guida finta di `tests/guida_finta.py` (stessa struttura del PDF di DHL, prezzi inventati);
con `TARIC_PDF_DHL=<guida vera>` prova anche il PDF di DHL, che non va nel repository.
`tests/test_correzioni.py` raccoglie le prove dei difetti trovati nella revisione completa del programma (una per difetto).
`tests/test_sinonimi.py` controlla che ogni termine di `js/sinonimi.js` esista nel testo italiano della nomenclatura:
per un nuovo sinonimo scegli parole o espressioni del testo ufficiale. I test usano `conftest.Sito` (il sito con l'amministratore `CAPO`, `registra`/`accedi`/`capo`/`collega`/`riavvia`; `ia=False`
ed `extra` per altri servizi IA, `versioni` per i dati già installati) con i finti servizio IA e GitHub (`FintoClaude`,
`FintoGitHub` con dati pronti e fonte, `FintoS3` per la copia esterna, che ricalcola la firma, `FintoBCE` per i cambi, `FintoDHL` per la pagina del carburante);
`sito_claude` è il sito
con Claude. `tests/test_copia.py` controlla la firma con l'esempio della documentazione AWS e con firme calcolate da
botocore. Prova nel browser (Playwright, finto servizio
IA): `tests/sito_di_prova.sh` e `tests/e2e_sito.js`, che GitHub esegue a ogni modifica (job `browser` di
`.github/workflows/test.yml`); vedi la sezione «Sviluppo» del README. Dopo modifiche all'interfaccia controlla anche il telefono
(larghezza 390 px, anche in orizzontale), il tablet (810 px in verticale, 1080 in orizzontale) e il tema scuro: fino a 900 px
le sezioni sono nella barra in basso, con `(pointer:coarse)` i pulsanti sono di almeno 40-44 px e i campi a 16 px (sotto,
l'iPhone ingrandisce la pagina); niente elementi che compaiono o spariscono quando un campo prende o perde il fuoco.
