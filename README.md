# MAGIC HS

Sito per cercare le voci doganali in modo più rapido di AIDA, ad uso interno dell'azienda. Descrivi la merce a parole: l'intelligenza artificiale (Google Gemini) propone il codice a 10 cifre con le alternative e fa le domande che servono per scegliere. MAGIC HS mostra dazi, misure e documenti richiesti per ogni paese, presi dai dati ufficiali TARIC dell'Unione europea.

Il sito gira su **Render**. Entra solo chi ha un account **approvato dall'amministratore**. L'intelligenza artificiale usa **una sola chiave a pagamento**, inserita dall'amministratore su Render e mai visibile ai browser, con un limite mensile di classificazioni per persona. I dati TARIC del mese arrivano da soli.

> Strumento non ufficiale e senza valore legale: prima di dichiarare verifica sempre codice e misure su AIDA o sul TARIC dell'UE.

## Che cosa fa

- **Classifica** (prima pagina): si cerca per parola o per codice nella nomenclatura, senza intelligenza artificiale; i risultati compaiono mentre scrivi e «Usa» apre la scheda del codice. In cima vengono le voci che contengono le parole così come sono scritte, poi quelle con le sole radici o con un sinonimo. Le parole d'uso comune trovano anche i termini della nomenclatura (per esempio «scarpe» le «calzature», «divano» i «mobili per sedersi», «router» gli apparecchi di routing): l'elenco è in `taric/static/js/sinonimi.js`, e l'amministratore ne aggiunge altri da *Gestione → Ricerca*. Con l'interruttore **Usa l'IA** si descrive invece la merce: l'IA individua le voci candidate e sceglie il codice confrontandolo con il testo ufficiale della nomenclatura, che è in italiano; le domande affinano la scelta. Ogni dispositivo ricorda la scelta dell'interruttore.
- **Archivio aziendale**: sopra i risultati della nomenclatura compaiono le merci **già classificate in azienda**, con il codice scelto e chi l'ha fatto. Se si chiede all'IA una descrizione già classificata, MAGIC HS propone di riprendere quella classificazione, senza una nuova richiesta e senza consumare il limite del mese. Chi preferisce non condividere le proprie toglie la spunta nel Profilo.
- **Scheda del codice**: descrizione, percorso nella nomenclatura e misure; il **calcolo degli importi** dà una stima di dazio e IVA dal valore in dogana, dalla massa e dalle quantità (le misure che dipendono da condizioni o da prezzi d'entrata restano «non calcolabili»). **Stampa o PDF** prepara un foglio pulito, con data e versione dei dati, da allegare alla pratica.
- **Nomenclatura**: l'albero delle sezioni, dei capitoli e delle voci, da sfogliare.
- **Bolla** simulata, d'importazione o d'esportazione, con più articoli (anche con «Aggiungi alla bolla» dalla scheda del codice): valore in dogana, dazio, antidumping e compensativi, IVA, documenti della casella 44 e riepilogo; si salva nel profilo e si stampa come foglio «simulazione». Le regole sono più sotto, in *Bolla simulata*.
- **Telefono e tablet**: le sezioni passano nella barra in basso, i pulsanti sono grandi per il dito e la pagina si adatta anche in orizzontale.
- **Installa** (in alto, e nel Profilo): crea il collegamento sul desktop del computer o l'icona sulla schermata Home del telefono, e MAGIC HS si apre come un'app nella sua finestra. Con Chrome, Edge e i telefoni Android il tasto apre la finestra d'installazione del browser; su iPhone e iPad, Safari per Mac e Firefox mostra i passi da fare.
- **Misure per paese**: dazi (anche preferenziali, antidumping e contingenti), condizioni, certificati e documenti del riquadro 44 e unità supplementari. Valgono per importazione ed esportazione.
- **Profilo**, nel proprio account (si ritrova da qualsiasi PC):
  - storico delle classificazioni, che si riaprono con tutti i dettagli;
  - voci preferite con una nota; quando arrivano i dati del mese e un preferito cambia (dazio, misure, descrizione, codice soppresso) compare un puntino sulla scheda e il preferito mostra cosa è cambiato;
  - paese, flusso e tema predefiniti, e la scelta di condividere le proprie classificazioni con i colleghi;
  - classificazioni con l'IA del mese, rispetto al proprio limite;
  - password, uscita dagli altri dispositivi, esportazione e importazione di storico e preferiti.
- **Gestione**, per l'amministratore:
  - **Utenti**: richieste di account da approvare (con il messaggio di chi la chiede), limite personale, link per reimpostare la password, amministratori, sospensione ed eliminazione;
  - **Intelligenza artificiale**: stato e prova del servizio, limite mensile per persona, tetto mensile per tutti, registrazioni aperte o chiuse, uso del mese per persona;
  - **Dati TARIC**: versioni, aggiornamento immediato, caricamento manuale, ritorno alla versione precedente, copia del database (anche fuori da Render, vedi sotto);
  - **Ricerca**: le parole cercate senza risultati (quante volte, quando), da trasformare in **sinonimi** che valgono subito per tutti; un sinonimo si accetta solo se i termini esistono nella nomenclatura;
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
- **Copie di sicurezza**: il server fa ogni giorno un backup del database sul suo disco, e Render tiene istantanee automatiche del disco. Una copia da tenere altrove si scarica da *Gestione → Dati TARIC → Copia del database*. Meglio ancora, il server può mandarne una **ogni settimana fuori da Render**, in un archivio compatibile S3 (vedi *Copia fuori da Render*). Per rimetterne una: dalla *Shell* del servizio su Render, `python -m taric ripristina FILE` controlla il backup e lo mette da parte; poi *Manual Deploy → Restart service*: al riavvio il sito rimette il database (quello attuale finisce prima in un nuovo backup), così nessuna modifica fatta nel frattempo va persa a metà.
- **Copia fuori da Render** (consigliata; pochi centesimi al mese):
  1. crea un contenitore privato (bucket) in un servizio compatibile S3: per esempio [Backblaze B2](https://www.backblaze.com/cloud-storage) (*Buckets → Create a Bucket*, privato) o Cloudflare R2;
  2. crea una chiave che possa scrivere solo in quel contenitore (B2: *Application Keys → Add a New Application Key*, accesso *Read and Write* al solo bucket);
  3. su Render, in *Environment*, aggiungi `MAGIC_HS_COPIA_URL` (l'indirizzo del contenitore, per B2 `https://s3.<regione>.backblazeb2.com/<bucket>`, per R2 `https://<account>.r2.cloudflarestorage.com/<bucket>`), `MAGIC_HS_COPIA_CHIAVE` (l'identificativo della chiave) e `MAGIC_HS_COPIA_SEGRETO` (la chiave segreta). La regione si ricava dall'indirizzo; se serve, indicala in `MAGIC_HS_COPIA_REGIONE`.

  Dopo il riavvio la prima copia parte entro dieci minuti, poi una alla settimana: `magic-hs-copia-1.zip` … `magic-hs-copia-8.zip`, che si sovrascrivono a giro (restano le ultime 8 settimane). L'esito e il tasto *Manda fuori adesso* sono in *Gestione → Dati TARIC → Copia del database*; se l'invio non riesce, il motivo compare lì e in *Da sistemare*, e il server riprova dopo 6 ore. Per rimettere una di queste copie si usa `python -m taric ripristina` come per le altre.
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

## Bolla simulata

Serve a preparare e controllare una bolla prima di farla in AIDA. **Non è una dichiarazione** e non sostituisce AIDA. I calcoli sono in `taric/static/js/calcolo.js` e hanno prove automatiche (`tests/prova_calcolo.js`).

- **Misure del giorno della bolla**: si usano quelle valide alla data prevista, per l'origine (o la destinazione) di ogni articolo. Le misure del commercio elettronico (dazio da 3 € e tassa di gestione) non toccano la bolla ordinaria e restano fuori.
- **Cambio doganale**: per tutto un mese vale il cambio pubblicato dalla BCE il penultimo mercoledì del mese precedente; se quel giorno la BCE non lo pubblica, il più recente pubblicato prima (art. 146 del Reg. UE 2015/2447, art. 53 del Reg. UE 952/2013). È lo stesso dell'elenco mensile dell'Agenzia delle Dogane (*Cambi doganali*). Il server lo prende dalla BCE e lo tiene; il penultimo mercoledì lo prende solo dopo la pubblicazione, nel pomeriggio. Nella bolla e nel foglio stampato compaiono il tasso e il giorno. Per le valute che la BCE non pubblica l'Agenzia delle Dogane indica il cambio giornaliero della Banca d'Italia.
- **Valore in dogana** di ogni articolo: prezzo in fattura, più trasporto e assicurazione fino al confine UE (se non sono già nel prezzo), più gli altri elementi da aggiungere, meno quelli da togliere, al cambio del mese. Trasporto e assicurazione si ripartiscono sugli articoli in base al valore o alla massa lorda, al centesimo: la somma delle quote è esattamente il totale. Il luogo d'introduzione è il porto di primo arrivo per il mare e l'ufficio doganale di entrata per strada e ferrovia (art. 137 del Reg. UE 2015/2447); per il trasporto aereo la quota da indicare è quella dell'allegato 23-01 dello stesso regolamento (art. 138).
- **Dazio**: quello dei paesi terzi, oppure la riduzione scelta (preferenza con la prova dell'origine, sospensione, contingente se ancora disponibile). Una misura senza dazio scritto vale 0 %, come nel TARIC.
- **Antidumping, compensativi e dazi addizionali**: si sceglie il codice addizionale del produttore; vale solo la misura che lo contiene. Il documento D008 (fattura commerciale conforme) e gli altri documenti che cambiano il dazio si spuntano nell'articolo.
- **IVA**: sulla somma di valore in dogana, dazi e spese dal confine UE fino a destinazione indicate nel documento di trasporto (art. 69 del DPR 633/1972); aliquota scelta per articolo (22, 10, 5, 4 % o non dovuta).
- **Arrotondamento**: al centesimo per articolo e per tributo (la metà per eccesso); un tributo dovuto sotto il centesimo vale comunque un centesimo (istruzioni dell'Agenzia delle Dogane per la casella 47); i totali sono le somme.
- **Documenti (casella 44)**: per ogni controllo (CITES, prodotti della foca, gas fluorurati…) si vede quali documenti bastano; si spuntano quelli che si presentano.
- **Il totale non compare** finché qualcosa non è certo: prezzo d'entrata o altre soglie, componenti agricole, codice del produttore non scelto, cambio non ancora fissato, divieti. Ogni blocco dice cosa manca o cosa verificare.
- **Fuori dalla simulazione**: accise, misure nazionali, saldo dei contingenti, misure cambiate dopo la data dei dati TARIC, validità della prova dell'origine.

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
- **Chiavi** (IA e copia esterna): solo nelle variabili del servizio su Render, mai nei browser né nel repository. La copia esterna è firmata (AWS Signature V4) e va solo su HTTPS.
- **Dati di ciascuno**: i preferiti e le bolle simulate si vedono solo dal proprio account. Le classificazioni sono condivise con i colleghi nell'archivio aziendale (descrizione, codice, risultato e nome di chi l'ha fatta), a meno di togliere la spunta nel Profilo; quelle fatte prima di questa funzione restano personali. L'amministratore vede l'uso dell'IA e le parole cercate senza risultati, senza sapere chi le ha cercate.
- **Archivi caricati** e dati TARIC scaricati: trattati come non fidati, con nomi e dimensioni controllati; i dati si installano solo se superano i controlli.
- **Chi può modificare il repository** su GitHub può cambiare il sito: proteggi l'account con l'autenticazione a due fattori.
- **Font**: locali (licenza SIL OFL), quindi nessun servizio di terzi caricato dalle pagine.

## Sviluppo

```bash
pip install -r requirements-dev.txt
python -m pytest -q tests                       # sito, IA, dati, backup, ricerca, archivio, copia esterna, bolle
node tests/prova_calcolo.js                     # calcoli della bolla e degli importi
TARIC_ZIP_PROVA=eu-taric-2026-11.zip python -m pytest -q tests/test_dati_reali.py   # con un'estrazione vera (circa un minuto)
```

Il sito si avvia anche in locale: `TARIC_DATI=prova/dati MAGIC_HS_AMMINISTRATORI=tu@azienda.it python -m taric server --porta 8810`, poi `http://localhost:8810`. Con Docker, come su Render: `docker build -t magic-hs .` e poi `docker run -p 10000:10000 -e PORT=10000 -v $PWD/disco:/var/data magic-hs`.

Prova nel browser (Playwright), la stessa che GitHub esegue a ogni modifica:
1. prendi i dati di un mese dalla pagina `dati` (oppure preparali con `python strumenti/dati_mese.py AAAA-MM dati-AAAA-MM-01.zip`);
2. `tests/sito_di_prova.sh dati-AAAA-MM-01.zip prova-sito` avvia i finti servizio IA, GitHub, BCE e archivio S3 (`tests/finto_claude.py`) e il sito sulla porta 8810, e aspetta i dati;
3. lancia `node tests/e2e_sito.js http://localhost:8810 shots-sito`.

Le istruzioni per proseguire il lavoro con Claude Code sono in `CLAUDE.md`.

## Fonti e licenze

- **Nomenclatura e misure**: Commissione europea, DG TAXUD (dati pubblicati per il riutilizzo citando la fonte).
- **Font**: Archivo (SIL Open Font License, vedi `taric/static/fonts/`).
- **Icone**: Lucide (licenza ISC, vedi `taric/static/icons/LICENSE-lucide.txt`); si rigenerano con `strumenti/icone.py`.
- **Classificazione assistita**: Google Gemini (o il servizio impostato sul server).
