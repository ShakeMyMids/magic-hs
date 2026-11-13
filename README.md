# MAGIC HS

Programma per Windows per cercare le voci doganali in modo più rapido di AIDA, ad uso interno dell'azienda. Descrivi la merce a parole: l'intelligenza artificiale (Gemini, Claude, Azure OpenAI o un altro modello a scelta) propone il codice a 10 cifre con le alternative e fa le domande che servono per scegliere. MAGIC HS mostra dazi, misure e documenti richiesti per ogni paese, presi dai dati ufficiali TARIC dell'Unione europea.

Ognuno lo esegue sul proprio PC, senza server né installazione: il programma, i dati del mese e le impostazioni arrivano da una cartella condivisa di SharePoint (o di Teams) che OneDrive sincronizza sui PC. Chi gestisce MAGIC HS aggiorna tutti dal suo PC.

> Strumento non ufficiale e senza valore legale: prima di dichiarare verifica sempre codice e misure su AIDA o sul TARIC dell'UE.

## Che cosa fa

- **Classifica**: dalla descrizione della merce l'IA individua le voci candidate. Poi sceglie il codice confrontandolo con il testo ufficiale della nomenclatura, che è in italiano. Le domande affinano la scelta.
- **Nomenclatura**: albero e ricerca per parola o per codice, senza intelligenza artificiale.
- **Misure per paese**: dazi (anche preferenziali, antidumping e contingenti), condizioni, certificati e documenti del riquadro 44 e unità supplementari. Valgono per importazione ed esportazione.
- **Profilo**, che resta sul PC di ciascuno:
  - storico delle classificazioni, che si riaprono con tutti i dettagli;
  - voci preferite con una nota;
  - paese, flusso e tema predefiniti;
  - richieste all'IA usate nel mese.
- **Gestione**, per chi pubblica per i colleghi:
  - cartella condivisa: chi può pubblicare, nuove versioni del programma;
  - intelligenza artificiale per tutti, con il limite mensile per persona;
  - dati TARIC: versioni, aggiornamento immediato, caricamento manuale, ritorno alla versione precedente;
  - registro degli eventi.
- **Aggiornamento mensile**: a ogni inizio mese il PC di chi gestisce MAGIC HS scarica la nuova estrazione TARIC, la installa solo se supera tutti i controlli e la pubblica nella cartella; i colleghi la ricevono da OneDrive.

## Installazione con SharePoint e OneDrive

### Prima volta (chi gestisce MAGIC HS)

1. Dalla pagina delle versioni del progetto su GitHub scarica `MAGIC-HS-cartella-<versione>.zip`. Prima di estrarlo: tasto destro > Proprietà > spunta «Annulla blocco» (così Windows non chiede conferme per il file di avvio).
2. Su SharePoint apri la raccolta documenti di un sito (o i file di un canale di Teams) e premi **Sincronizza**; poi estrai la cartella **MAGIC HS** nella cartella sincronizzata che compare in Esplora file. Non usare il tuo OneDrive personale: per aggiungere il collegamento a una cartella condivisa OneDrive chiede ai colleghi il permesso di modifica (vedi il punto 6). La raccolta non deve chiedere l'estrazione dei file (check-out) né avere colonne obbligatorie, altrimenti OneDrive la sincronizza in sola lettura anche per te.
3. Fai doppio clic su **Avvia MAGIC HS**: il programma si copia sul PC (circa un minuto la prima volta) e si apre nel browser.
4. In alto compare «Chi gestisce MAGIC HS?»: premi **Gestisco io MAGIC HS**. Il tuo nome utente di Windows entra nell'elenco di chi può pubblicare (Gestione > Cartella condivisa, dove puoi aggiungere altri). Se nella cartella mancano i dati del mese, il programma li scarica dalla fonte, li controlla e li pubblica.
5. In Gestione > Intelligenza artificiale scegli il servizio IA per tutti (facoltativo: senza IA restano nomenclatura, misure, ricerca per codice, storico e preferiti).
6. Dai ai colleghi **solo il permesso di lettura** sulla cartella: chi può modificarla può sostituire il programma che parte sui PC di tutti, quindi la modifica va solo a chi è in «Chi può pubblicare». In un sito di SharePoint i colleghi sono *visitatori* (Lettura) e chi pubblica è *membro* (Modifica). In un canale di Teams i membri hanno la modifica: sulla cartella **MAGIC HS** scegli «Gestisci accesso», interrompi l'ereditarietà delle autorizzazioni e lascia ai colleghi solo «Può visualizzare».

### Colleghi

I colleghi aprono la cartella **MAGIC HS** sul sito di SharePoint (o nei file del canale di Teams) e premono **Sincronizza**; poi doppio clic su **Avvia MAGIC HS** nella cartella sincronizzata (conviene un collegamento sul desktop). Storico, preferiti e uso dell'IA restano sul loro PC, in `%LOCALAPPDATA%\MAGIC HS`.

### Passare da una cartella di OneDrive a una in sola lettura

Copia l'intera cartella **MAGIC HS** (con `programma\`, `dati\` e `impostazioni.json`, che conserva l'elenco di chi pubblica) nella raccolta di SharePoint, dai i permessi come al punto 6 e fai sincronizzare la nuova cartella ai colleghi, che rifanno il collegamento sul desktop. Storico e preferiti non si perdono: restano sul PC, qualunque sia la cartella. Quando tutti usano la nuova cartella, togli la condivisione di quella vecchia.

### Aggiornamenti dal PC di chi gestisce MAGIC HS

- *Dati TARIC*: a ogni inizio mese, quando chi gestisce MAGIC HS lo apre, il programma scarica la nuova estrazione, la controlla e la pubblica in `dati\` della cartella; i colleghi la ricevono da OneDrive (il programma controlla la cartella ogni dieci minuti). Da Gestione > Dati TARIC si può anche caricare a mano un'estrazione o tornare alla versione precedente, per tutti.
- *Programma*: scarica `magic-hs-windows-<versione>.zip` dalla pagina delle versioni e caricalo in Gestione > Cartella condivisa. Ognuno passa alla nuova versione quando riapre MAGIC HS; finché OneDrive non l'ha scaricata si continua con quella già copiata sul PC.
- *Intelligenza artificiale*: vedi [Intelligenza artificiale](#intelligenza-artificiale).

### Come funziona

«Avvia MAGIC HS.cmd» copia `programma\magic-hs-<versione>.zip` (Python per Windows con le librerie e MAGIC HS, nessuna installazione) in `%LOCALAPPDATA%\MAGIC HS\programma` e lancia `taric.programma`. Pubblica chi è nell'elenco `editori` di `impostazioni.json` (nomi utente di Windows) e può scrivere nella cartella; gli altri non scrivono mai nella cartella. L'elenco non protegge da chi ha il permesso di modifica (potrebbe cambiare a mano i file): la protezione è dare ai colleghi solo la lettura. Il programma ascolta solo su 127.0.0.1, accetta solo il browser aperto dall'avvio (chiave casuale nella cartella dell'utente), tiene una sola copia per utente e si chiude da solo dopo mezz'ora senza uso. Usa i certificati di Windows, quindi funziona anche dietro i proxy aziendali che ispezionano HTTPS (un proxy con script di configurazione automatica può invece bloccare IA e download dei dati). Se il PC aziendale blocca i programmi copiati nella cartella dell'utente, serve l'IT.

### Costruire i file

Da Linux, macOS o Windows: `python strumenti/pacchetto_windows.py` crea in `dist/` il pacchetto e la cartella da estrarre; con `--dati …/versioni/AAAA-MM-01` la cartella include anche i dati di un mese. Il flusso GitHub *Programma per Windows* li costruisce e li prova su Windows a ogni modifica; li pubblica nella pagina delle versioni per i tag `v*`, oppure quando lo avvii a mano (Actions > Programma per Windows > Run workflow, con «pubblica» spuntato): la versione è quella scritta in `taric/__init__.py`.

## Intelligenza artificiale

Si sceglie in *Gestione → Intelligenza artificiale* e vale per tutti i colleghi. Senza IA restano nomenclatura, misure, ricerca per codice, storico e preferiti.

| Servizio | Note |
|---|---|
| **Azure OpenAI** dell'azienda | Scegli «compatibile OpenAI», indirizzo `https://<risorsa>.openai.azure.com/openai/v1`, chiave della risorsa e nome della distribuzione come modello. I dati restano nel contratto Azure dell'azienda. |
| **Google Gemini** | Chiave da [Google AI Studio](https://aistudio.google.com). Modelli predefiniti `gemini-3.5-flash-lite` (ricerca delle voci) e `gemini-3.7-flash` (scelta del codice). Costa pochi centesimi a classificazione. I [termini dell'API Gemini](https://ai.google.dev/terms) chiedono il servizio a pagamento per applicazioni usate da persone nell'Unione europea: attiva la fatturazione sul progetto della chiave. |
| **Claude** (Anthropic) | Chiave dalla [Console di Anthropic](https://console.anthropic.com), solo a consumo e separata dall'abbonamento a Claude. |
| **Altri compatibili OpenAI**: Groq, Mistral, OpenRouter, OpenAI, Ollama… | Indirizzo, modello ed eventuale chiave. Con Ollama il modello gira su un computer dell'azienda, senza inviare dati fuori, ma serve un computer potente. |

Ogni persona ha un limite mensile di richieste, uguale per tutti (vuoto = nessun limite); chi pubblica non ha limite. Una classificazione usa di solito 2 o 3 richieste. Il pulsante *Prova* controlla subito chiave, indirizzo e modello. **La chiave è leggibile da chi vede la cartella condivisa**: usa una chiave dedicata a MAGIC HS e imposta un tetto di spesa nella console del servizio. **Copilot di Microsoft 365** non si può usare da un programma senza la licenza Microsoft 365 Copilot per ogni persona e una registrazione fatta dall'IT; il Copilot Chat gratuito non ha un collegamento per i programmi.

## Dati TARIC

- **Fonte**: le estrazioni mensili della Commissione europea (DG TAXUD), gruppo CIRCABC «TARIC and Quota data and information». Il PC di chi gestisce MAGIC HS le scarica dalla copia pubblicata dal progetto [taric-opendata](https://github.com/rousseauxy/taric-opendata); la fonte si cambia con `TARIC_FONTE_URL` in `%LOCALAPPDATA%\MAGIC HS\taric.env`.
- **Controlli prima dell'installazione**: file e colonne attesi, mese dell'estrazione, numeri plausibili, nessun calo forte rispetto al mese prima, coerenza della nomenclatura e rilettura di ogni riga generata. Il riepilogo di ogni versione è in *Gestione → Dati TARIC*.
- **Italiano**: la nomenclatura usa il testo ufficiale italiano dell'ultima estrazione che lo contiene (oggi quella del 1° luglio 2026). Le righe create o modificate dopo restano in inglese con la sigla EN e si possono tradurre con Claude. Quando un'estrazione contiene di nuovo `Nomenclature IT.xlsx`, il testo italiano si aggiorna da solo.
- **Se la fonte non funziona**: carica a mano l'archivio .zip con i file Excel del mese (*Gestione → Dati TARIC → Carica a mano*).
- **Fuori dal TARIC**: IVA, accise e misure nazionali; per quelle resta AIDA.

## Dati sul PC e copia di sicurezza

Storico, preferiti, preferenze e uso dell'IA stanno in `%LOCALAPPDATA%\MAGIC HS\dati\taric.db`; in `%LOCALAPPDATA%\MAGIC HS` c'è anche `registro.txt`, utile se qualcosa non funziona. Il programma fa da solo un backup del database al giorno in `dati\backup` e tiene gli ultimi 7.

Per rimettere un backup (per esempio dopo un guasto), con MAGIC HS chiuso:

```bat
"%LOCALAPPDATA%\MAGIC HS\programma\<versione>\python\python.exe" -I -m taric ripristina "%LOCALAPPDATA%\MAGIC HS\dati\backup\magic-hs-AAAA-MM-GG-HHMMSS.zip"
```

Il database di prima viene salvato in un nuovo backup. `-m taric backup` ne fa uno al momento; `--cartella` indica la cartella di un altro utente.

## Sicurezza in breve

- **Solo dal PC**: il programma ascolta solo su 127.0.0.1 e controlla l'indirizzo di ogni richiesta, contro i siti che provano a raggiungerlo con un altro nome.
- **Ingresso**: il browser entra solo dall'avvio, con una chiave casuale scritta nella cartella dell'utente di Windows; poi tiene un cookie di sessione `HttpOnly`/`SameSite`.
- **Richieste**: protezione contro le richieste da altri siti (intestazione dedicata e controllo dell'origine) e Content-Security-Policy senza script esterni o in linea.
- **Cartella condivisa**: pubblica solo chi è nell'elenco e può scrivere; i colleghi hanno solo la lettura, perché chi può scrivere può cambiare il programma di tutti. Gli archivi ricevuti si estraggono con nomi e dimensioni controllati.
- **Archivi caricati**: trattati come non fidati, con estrazione dei soli `.xlsx`, limiti di dimensione e nessun percorso.
- **Font**: locali (licenza SIL OFL), quindi nessun servizio di terzi caricato dalle pagine.

## Sviluppo

```bash
pip install -r requirements-dev.txt
python -m pytest -q tests                       # programma, cartella condivisa, IA, dati, backup
TARIC_ZIP_PROVA=eu-taric-2026-11.zip python -m pytest -q tests/test_dati_reali.py   # con un'estrazione vera (circa un minuto)
```

Il programma si avvia anche su Linux o macOS per le prove: `python -m taric.programma --condivisa <cartella> --cartella <pc> --senza-browser`, con una cartella che contiene i dati pubblicati. Per la prova nel browser (Playwright) avvia anche `tests/finto_claude.py`, che imita le API di Gemini, Claude e dei servizi compatibili OpenAI, e poi `node tests/e2e_locale.js <pc>/istanza.json shots-locale`. Le istruzioni per proseguire il lavoro con Claude Code sono in `CLAUDE.md`.

## Fonti e licenze

- **Nomenclatura e misure**: Commissione europea, DG TAXUD (dati pubblicati per il riutilizzo citando la fonte).
- **Font**: Archivo (SIL Open Font License, vedi `taric/static/fonts/`).
- **Icone**: Lucide (licenza ISC, vedi `taric/static/icons/LICENSE-lucide.txt`); si rigenerano con `strumenti/icone.py`.
- **Classificazione assistita**: il servizio IA configurato (Google Gemini, Claude di Anthropic o altro).
