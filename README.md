# MAGIC HS

Sito per cercare le voci doganali in modo più rapido di AIDA, ad uso interno dell'azienda. Descrivi la merce a parole: l'intelligenza artificiale (Google Gemini) propone il codice a 10 cifre con le alternative e fa le domande che servono per scegliere. MAGIC HS mostra dazi, misure e documenti richiesti per ogni paese, presi dai dati ufficiali TARIC dell'Unione europea.

Il sito gira su **Render**. Entra solo chi ha un account **approvato dall'amministratore**. L'intelligenza artificiale usa **una sola chiave a pagamento**, inserita dall'amministratore su Render e mai visibile ai browser, con un limite mensile di classificazioni per persona. I dati TARIC del mese arrivano da soli.

> Strumento non ufficiale e senza valore legale: prima di dichiarare verifica sempre codice e misure su AIDA o sul TARIC dell'UE.

## Che cosa fa

- **Classifica** (prima pagina): si cerca per parola o per codice nella nomenclatura, senza intelligenza artificiale; i risultati compaiono mentre scrivi e «Usa» apre la scheda del codice. Le parole d'uso comune trovano anche i termini della nomenclatura (per esempio «scarpe» le «calzature», «divano» i «mobili per sedersi», «router» gli apparecchi di routing): l'elenco è in `taric/static/js/sinonimi.js` e si allunga con una riga per parola. Con l'interruttore **Usa l'IA** si descrive invece la merce: l'IA individua le voci candidate e sceglie il codice confrontandolo con il testo ufficiale della nomenclatura, che è in italiano; le domande affinano la scelta. Ogni dispositivo ricorda la scelta dell'interruttore.
- **Nomenclatura**: l'albero delle sezioni, dei capitoli e delle voci, da sfogliare.
- **Telefono e tablet**: le sezioni passano nella barra in basso, i pulsanti sono grandi per il dito e la pagina si adatta anche in orizzontale.
- **Installa** (in alto, e nel Profilo): crea il collegamento sul desktop del computer o l'icona sulla schermata Home del telefono, e MAGIC HS si apre come un'app nella sua finestra. Con Chrome, Edge e i telefoni Android il tasto apre la finestra d'installazione del browser; su iPhone e iPad, Safari per Mac e Firefox mostra i passi da fare.
- **Misure per paese**: dazi (anche preferenziali, antidumping e contingenti), condizioni, certificati e documenti del riquadro 44 e unità supplementari. Valgono per importazione ed esportazione.
- **Profilo**, nel proprio account (si ritrova da qualsiasi PC):
  - storico delle classificazioni, che si riaprono con tutti i dettagli;
  - voci preferite con una nota;
  - paese, flusso e tema predefiniti;
  - classificazioni con l'IA del mese, rispetto al proprio limite;
  - password, uscita dagli altri dispositivi, esportazione e importazione di storico e preferiti.
- **Gestione**, per l'amministratore:
  - **Utenti**: richieste di account da approvare (con il messaggio di chi la chiede), limite personale, link per reimpostare la password, amministratori, sospensione ed eliminazione;
  - **Intelligenza artificiale**: stato e prova del servizio, limite mensile per persona, tetto mensile per tutti, registrazioni aperte o chiuse, uso del mese per persona;
  - **Dati TARIC**: versioni, aggiornamento immediato, caricamento manuale, ritorno alla versione precedente, copia del database;
  - **Registro** degli eventi.

## Sito su Render

### Prima volta (amministratore)

1. **Chiave di Gemini.** In [Google AI Studio](https://aistudio.google.com/apikey) crea una chiave API in un progetto con la **fatturazione attiva**. È il piano a pagamento: costa pochi centesimi a classificazione. In [Google Cloud → Fatturazione → Budget e avvisi](https://console.cloud.google.com/billing) imposta un budget mensile con gli avvisi via email.
2. **Servizio su Render.** In Render scegli **New → Blueprint** e collega il repository `ShakeMyMids/magic-hs`. Render legge `render.yaml` e propone il servizio **magic-hs**:
   - Docker, piano Starter, Francoforte;
   - un disco da 1 GB in `/var/data`, dove stanno database e dati TARIC;
   - controllo di salute su `/api/salute`.

   Ti chiede due valori:
   - `GEMINI_API_KEY`: la chiave del punto 1;
   - `MAGIC_HS_AMMINISTRATORI`: la tua email (più email separate da virgole).

   Conferma con **Apply**. Costo indicativo: istanza Starter più pochi centesimi al mese per il disco.
3. **Il tuo account.** Apri l'indirizzo che Render mostra (per esempio `https://magic-hs.onrender.com`), premi **Richiedi un account** e usa la stessa email di `MAGIC_HS_AMMINISTRATORI`: entri subito come amministratore. In *Gestione → Intelligenza artificiale* premi **Prova**: se il servizio risponde, parte la festa con la nave.
4. **I colleghi.** Manda loro l'indirizzo. Ognuno preme *Richiedi un account*. Sulla scheda *Gestione* compare un puntino arancio e in *Gestione → Utenti* approvi le richieste. Chi non è approvato non entra.

Se vuoi un indirizzo tuo (per esempio `magic-hs.azienda.it`), aggiungilo in Render → *Settings → Custom Domains*.

### Ogni giorno

- **Limiti**: in *Gestione → Intelligenza artificiale* scegli quante classificazioni al mese può fare ogni persona (predefinito 50; vuoto = senza limite) e un tetto mensile per tutti insieme. Per una persona si cambia in *Utenti → Modifica*: vuoto = predefinito, 0 = IA spenta. Gli amministratori non hanno limite personale; il tetto vale per tutti. Una classificazione conta una volta sola anche se fa 2 o 3 richieste al servizio; le traduzioni delle righe in inglese non contano.
- **Password dimenticata**: *Gestione → Utenti → Modifica → Link per la password*. Il link vale 3 giorni e una volta sola; mandalo alla persona. Il sito non manda email.
- **Registrazioni**: si possono chiudere in *Gestione → Intelligenza artificiale* (casella «Si possono chiedere nuovi account»). Gli indirizzi di `MAGIC_HS_AMMINISTRATORI` possono sempre registrarsi.
- **Aggiornamenti**: ogni modifica unita a `main` si pubblica da sola su Render (`autoDeploy`). Durante il riavvio il sito resta irraggiungibile per qualche secondo. I dati TARIC del mese il server li scarica da solo dalla pagina `dati` del progetto. Se non ci sono ancora, li prepara lui dalla fonte.
- **Copie di sicurezza**: il server fa ogni giorno un backup del database sul suo disco, e Render tiene istantanee automatiche del disco. Una copia da tenere altrove si scarica da *Gestione → Dati TARIC → Copia del database*. Per rimetterne una: dalla *Shell* del servizio su Render, `python -m taric ripristina FILE` (il database attuale finisce prima in un nuovo backup), poi *Manual Deploy → Restart service*.
- **Cambiare modello o chiave**: su Render, in *Environment*, modifica `GEMINI_API_KEY`, `TARIC_IA_MODELLO` (scelta del codice, predefinito `gemini-3.7-flash`) o `TARIC_IA_MODELLO_RAPIDO` (ricerca delle voci, predefinito `gemini-3.5-flash-lite`). Il servizio si riavvia da solo. *Elenco dei modelli* in Gestione mostra quelli disponibili per la chiave.

### Come funziona

`python -m taric server` avvia il server Python (FastAPI e SQLite):
- account con email e password (argon2), registrazione con modulo firmato e trappola per i bot, tentativi limitati (5 password errate per email in 15 minuti, 5 registrazioni all'ora per rete);
- sessioni con cookie `HttpOnly`, `Secure` e `SameSite`;
- un solo servizio IA dalle variabili d'ambiente;
- database SQLite sul disco di Render.

Render termina l'HTTPS e passa le richieste al server, che legge l'indirizzo pubblico da `RENDER_EXTERNAL_URL`.

## Intelligenza artificiale

Il servizio è unico per tutti e lo paga l'amministratore: **Google Gemini** a pagamento (`GEMINI_API_KEY`). Il server sa usare anche Claude di Anthropic (`ANTHROPIC_API_KEY`) o un servizio compatibile OpenAI come Azure OpenAI (`TARIC_IA_FORNITORE=openai`, `TARIC_IA_URL`, `TARIC_IA_CHIAVE`, `TARIC_IA_MODELLO`), sempre dalle variabili su Render.

**Costi e affidabilità**:
- ogni richiesta mette prima la parte che non cambia (istruzioni e testo ufficiale delle voci, spesso decine di migliaia di token) e in fondo la merce: il servizio la riusa dalla sua cache, a una frazione del prezzo, nel ricontrollo e in *Riclassifica*;
- la risposta segue uno schema JSON imposto al modello (`responseSchema` per Gemini, strumento obbligato per Claude, `json_schema` per i compatibili OpenAI), così la «risposta non leggibile» diventa rara; se il servizio non accetta lo schema, MAGIC HS riprova senza;
- quando il servizio è sovraccarico o limita le richieste al minuto, MAGIC HS riprova da solo fino a due volte, aspettando quanto indica il servizio (al massimo 20 secondi).

*Gestione → Intelligenza artificiale* mostra classificazioni, richieste e token del mese (con la parte letta dalla cache) per tutti e per persona. La spesa esatta è nella fatturazione di Google Cloud.

## Dati TARIC

- **Fonte**: le estrazioni mensili della Commissione europea (DG TAXUD), gruppo CIRCABC «TARIC and Quota data and information». Il flusso GitHub *Dati TARIC* (`.github/workflows/dati.yml`) prepara ogni mese i dati con gli stessi controlli del sito (`strumenti/dati_mese.py`) e li pubblica nella pre-release `dati`; il server li scarica da lì. Altrimenti scarica l'estrazione dalla copia pubblicata dal progetto [taric-opendata](https://github.com/rousseauxy/taric-opendata) e la prepara lui.
- **Controlli prima dell'installazione**:
  - file e colonne attesi;
  - mese dell'estrazione;
  - numeri plausibili e nessun calo forte rispetto al mese prima;
  - coerenza della nomenclatura e rilettura di ogni riga generata.

  Il riepilogo di ogni versione è in *Gestione → Dati TARIC*.
- **Italiano**: la nomenclatura usa il testo ufficiale italiano dell'ultima estrazione che lo contiene (oggi quella del 1° luglio 2026). Le righe create o modificate dopo restano in inglese con la sigla EN e si possono tradurre con l'IA. Quando un'estrazione contiene di nuovo `Nomenclature IT.xlsx`, il testo italiano si aggiorna da solo.
- **Se la fonte non funziona**: carica a mano l'archivio .zip con i file Excel del mese (*Gestione → Dati TARIC → Carica a mano*).
- **Fuori dal TARIC**: IVA, accise e misure nazionali; per quelle resta AIDA.
- GitHub sospende i flussi pianificati dei progetti senza attività da 60 giorni. *Dati TARIC* si riattiva da solo a ogni giro; se fosse sospeso: *Actions → Dati TARIC → Enable workflow*. Intanto il server prepara i dati da sé.

## Sicurezza in breve

- **Accesso**: solo account approvati; password con argon2; tentativi limitati; link per la password monouso e a scadenza, preparati dall'amministratore.
- **Richieste**:
  - protezione contro le richieste da altri siti (intestazione dedicata e controllo dell'origine);
  - Content-Security-Policy senza script esterni o in linea;
  - HSTS e cookie `Secure` su HTTPS;
  - nessuna pagina dentro la cornice di altri siti.
- **Chiave dell'IA**: solo nelle variabili del servizio su Render, mai nei browser né nel repository.
- **Dati di ciascuno**: storico e preferiti si vedono solo dal proprio account; l'amministratore vede l'uso dell'IA, non le classificazioni.
- **Archivi caricati** e dati TARIC scaricati: trattati come non fidati, con nomi e dimensioni controllati; i dati si installano solo se superano i controlli.
- **Chi può modificare il repository** su GitHub può cambiare il sito: proteggi l'account con l'autenticazione a due fattori.
- **Font**: locali (licenza SIL OFL), quindi nessun servizio di terzi caricato dalle pagine.

## Sviluppo

```bash
pip install -r requirements-dev.txt
python -m pytest -q tests                       # sito, IA, dati, backup
TARIC_ZIP_PROVA=eu-taric-2026-11.zip python -m pytest -q tests/test_dati_reali.py   # con un'estrazione vera (circa un minuto)
```

Il sito si avvia anche in locale: `TARIC_DATI=prova/dati MAGIC_HS_AMMINISTRATORI=tu@azienda.it python -m taric server --porta 8810`, poi `http://localhost:8810`. Con Docker, come su Render: `docker build -t magic-hs .` e poi `docker run -p 10000:10000 -e PORT=10000 -v $PWD/disco:/var/data magic-hs`.

Prova nel browser (Playwright):
1. prepara i dati di un mese con `python strumenti/dati_mese.py AAAA-MM dati-AAAA-MM-01.zip`;
2. avvia `python tests/finto_claude.py 9100 dati-AAAA-MM-01.zip`, che imita la pagina `dati` di GitHub e le API di Gemini, Claude e dei servizi compatibili OpenAI;
3. avvia il sito con `TARIC_IA_FORNITORE=openai TARIC_IA_URL=http://127.0.0.1:9100/v1 TARIC_IA_MODELLO=finto-modello TARIC_IA_CHIAVE=chiave-finta TARIC_DATI_URL=http://127.0.0.1:9100/github/releases/tags/dati MAGIC_HS_AMMINISTRATORI=capo@azienda.it python -m taric server --porta 8810`;
4. lancia `node tests/e2e_sito.js http://localhost:8810 shots-sito`.

Le istruzioni per proseguire il lavoro con Claude Code sono in `CLAUDE.md`.

## Fonti e licenze

- **Nomenclatura e misure**: Commissione europea, DG TAXUD (dati pubblicati per il riutilizzo citando la fonte).
- **Font**: Archivo (SIL Open Font License, vedi `taric/static/fonts/`).
- **Icone**: Lucide (licenza ISC, vedi `taric/static/icons/LICENSE-lucide.txt`); si rigenerano con `strumenti/icone.py`.
- **Classificazione assistita**: Google Gemini (o il servizio impostato sul server).
