# MAGIC HS

Sito per cercare le voci doganali in modo più rapido di AIDA, ad uso interno dell'azienda. Descrivi la merce a parole: l'intelligenza artificiale (Google Gemini) propone il codice a 10 cifre con le alternative e fa le domande che servono per scegliere. MAGIC HS mostra dazi, misure e documenti richiesti per ogni paese, presi dai dati ufficiali TARIC dell'Unione europea.

Il sito gira su **Render**. Entra solo chi ha un account **approvato dall'amministratore** (le email @dhl.com sono approvate subito, con l'IA spenta). L'intelligenza artificiale usa **una sola chiave a pagamento**, inserita dall'amministratore su Render e mai visibile ai browser, con un limite mensile di classificazioni per persona. I dati TARIC del mese arrivano da soli.

## Che cosa fa

- **Classifica** (prima pagina): si cerca per parola o per codice nella nomenclatura, senza intelligenza artificiale; i risultati compaiono mentre scrivi e «Usa» apre la scheda del codice. In cima vengono le voci che contengono le parole così come sono scritte, poi quelle con le sole radici o con un sinonimo. Le parole d'uso comune trovano anche i termini della nomenclatura (per esempio «scarpe» le «calzature», «divano» i «mobili per sedersi», «router» gli apparecchi di routing): l'elenco è in `taric/static/js/sinonimi.js`, e l'amministratore ne aggiunge altri da *Gestione → Ricerca*. Con l'interruttore **Usa l'IA** si descrive invece la merce: l'IA individua le voci candidate e sceglie il codice confrontandolo con il testo ufficiale della nomenclatura, che è in italiano; le domande affinano la scelta. Ogni dispositivo ricorda la scelta dell'interruttore.
- **Da foto o PDF** (tasto con la macchina fotografica nella casella di Classifica): fino a **3 allegati**, per esempio la merce, la sua etichetta e la scheda tecnica del fornitore in PDF.
  - Sul telefono si scatta una foto o si scelgono una o più foto dalla galleria; sul computer si scelgono i file. Si possono anche trascinare sulla scheda, incollare nella casella o, con l'app installata su Android, mandare da un'altra app con **Condividi → MAGIC HS** (galleria, WhatsApp, posta; l'eventuale testo condiviso va nella casella).
  - La descrizione diventa facoltativa, ma conviene scrivere quello che non si vede (materiale, composizione, uso).
  - L'IA dice **che cosa vede** e, nel risultato, che cosa ha **letto** negli allegati (composizione, materiali, modello, origine): resta nello storico e nella stampa. Con **Correggi** la sua descrizione passa nella casella, da sistemare prima di classificare di nuovo.
  - Se negli allegati ci sono **merci diverse** e non se n'è indicata una, l'IA chiede quale classificare; la scelta continua la stessa classificazione.
  - Il browser rimpicciolisce le foto (lato lungo di 1280 pixel, di solito qualche decina di KB) e avvisa se una è **molto scura o sfocata**, senza bloccare. I PDF vanno interi, fino a 5 MB: meglio solo le pagine che descrivono la merce.
  - Gli allegati restano anche per «Riclassifica» finché non li si toglie. Conta come una classificazione del mese; chi ha l'IA spenta vede il tasto bloccato.
- **Archivio aziendale**: sopra i risultati della nomenclatura compaiono le merci **già classificate in azienda**, con il codice scelto e chi l'ha fatto. Se si chiede all'IA una descrizione già classificata, MAGIC HS propone di riprendere quella classificazione, senza una nuova richiesta e senza consumare il limite del mese. Chi preferisce non condividere le proprie toglie la spunta nel Profilo.
- **Scheda del codice**: descrizione, percorso nella nomenclatura e misure, a oggi o alla **data delle misure** scelta nella scheda; il **calcolo degli importi** dà una stima di dazio e IVA dal valore in dogana, dalla massa e dalle quantità (le misure che dipendono da condizioni o da prezzi d'entrata restano «non calcolabili»). **Stampa o PDF** prepara un foglio pulito, con data e versione dei dati, da allegare alla pratica.
- **Nomenclatura**: l'albero delle sezioni, dei capitoli e delle voci, da sfogliare.
- **Bolla** simulata, d'importazione o d'esportazione, con più articoli (anche con «Aggiungi alla bolla» dalla scheda del codice): valore in dogana, dazio, antidumping e compensativi, IVA, documenti della casella 44 e riepilogo; si salva nel profilo e si stampa: l'importazione come il **prospetto di sintesi della dichiarazione H1** di AIDA (intestazione, poi un foglio «Dettagli Articolo» per articolo, con la scritta «simulazione» e senza stemma), l'esportazione come foglio «simulazione». **Da un PDF**: si trascina sulla sezione, o si sceglie, il PDF di una dichiarazione d'importazione e MAGIC HS compila una bolla nuova da controllare e salvare. Le regole sono più sotto, in *Bolla simulata*.
- **Costo di spedizione** (nella sezione Bolla): costo indicativo di una spedizione con DHL Express, in importazione o in esportazione, dal paese, dal servizio e dai colli (peso e misure), anche senza una bolla. Dalla bolla d'importazione riporta trasporto e assicurazione nei campi giusti. Le regole sono più sotto, in *Costo di spedizione*.
- **Aiuto** (tasto «?» in alto, o il tasto ? della tastiera): arriva in volo **Marino**, il gabbiano marinaio, e spiega a passi la sezione aperta (Classifica, Nomenclatura, Bolla con la bolla aperta o il calcolatore del trasporto, Profilo): illumina una parte della pagina alla volta e la racconta nel fumetto, con Avanti e Indietro (anche con le frecce) ed Esc per chiudere. Spiega solo quello che c'è nella pagina in quel momento; in Gestione non c'è. La prima volta che si apre una sezione Marino arriva da solo e chiede se spiegarla (una volta per sezione, su ogni dispositivo; l'invito non blocca la pagina). Anche nella pagina d'accesso: la prima volta su ogni dispositivo si presenta e presenta l'app, poi con il tasto «?».
- **Segnala un problema** (in fondo alla pagina, nel Profilo e nell'ultimo passo di Marino): si scrive cosa non va e la segnalazione arriva all'amministratore, con la sezione, il codice aperto, lo schermo e il browser. La risposta torna nel Profilo, con un avviso all'apertura del sito, e porta il volto di chi l'ha scritta: l'avatar di Simone, l'autore, o le iniziali degli altri amministratori.
- **Simone, l'autore**: il suo avatar firma il fondo delle pagine («Fatto da Simone»), Marino lo presenta nella pagina d'accesso, sta sulla banchina della scena tra le gambe della gru (toccato, saluta) ed è il gruista di «Carica la nave»: esulta ai container presi, scuote la testa a quelli in mare e festeggia il record. L'autore è il primo indirizzo di `MAGIC_HS_AMMINISTRATORI` (o quello di `MAGIC_HS_AUTORE`).
- **Telefono e tablet**: le sezioni passano nella barra in basso, i pulsanti sono grandi per il dito e la pagina si adatta anche in orizzontale.
- **Installa** (in alto, e nel Profilo): crea il collegamento sul desktop del computer o l'icona sulla schermata Home del telefono, e MAGIC HS si apre come un'app nella sua finestra. Con Chrome, Edge e i telefoni Android il tasto apre la finestra d'installazione del browser; su iPhone e iPad, Safari per Mac e Firefox mostra i passi da fare.
- **Misure per paese**: dazi (anche preferenziali, antidumping e contingenti), condizioni, certificati e documenti del riquadro 44 e unità supplementari. Valgono per importazione ed esportazione.
- **Profilo**, nel proprio account (si ritrova da qualsiasi PC):
  - storico delle classificazioni, che si riaprono con tutti i dettagli;
  - voci preferite con una nota; quando arrivano i dati del mese e un preferito cambia (dazio, misure, descrizione, codice soppresso) compare un puntino sulla scheda e il preferito mostra cosa è cambiato;
  - paese, flusso e tema predefiniti, e la scelta di condividere le proprie classificazioni con i colleghi;
  - classificazioni con l'IA del mese, rispetto al proprio limite;
  - password, uscita dagli altri dispositivi, esportazione e importazione di storico e preferiti; l'azienda si vede ma la cambia l'amministratore.
- **Gestione**, per l'amministratore:
  - **Utenti**: richieste di account da approvare (con il messaggio di chi la chiede), azienda, limite personale, link per reimpostare la password, «Disconnetti» (chiude le sessioni su tutti i dispositivi), amministratori, sospensione ed eliminazione;
  - **Aziende**: le persone con la stessa azienda (maiuscole e spazi a parte) formano un gruppo. Per ogni azienda: limite di classificazioni con l'IA al mese **per persona** oppure IA spenta, che vale per chi c'è e per chi entra dopo (all'approvazione o quando gli si cambia azienda; il limite di una persona si può poi cambiare da solo); «Disconnetti tutti», «Sospendi tutti», «Riattiva tutti» (gli amministratori restano come sono); nuovo nome, o unione con un'altra azienda scrivendone il nome. L'azienda la sceglie chi chiede l'account e poi la cambia solo l'amministratore;
  - **Intelligenza artificiale**: stato e prova del servizio, limite mensile per persona, tetto mensile per tutti, registrazioni aperte o chiuse, domini delle email approvate subito, uso del mese per persona;
  - **Dati TARIC**: versioni, aggiornamento immediato, caricamento manuale, ritorno alla versione precedente, copia del database (anche fuori da Render, vedi sotto);
  - **Ricerca**: le parole cercate senza risultati (quante volte, quando), da trasformare in **sinonimi** che valgono subito per tutti; un sinonimo si accetta solo se i termini esistono nella nomenclatura;
  - **Trasporto**: guida alle tariffe di DHL Express in PDF (si legge e si controlla), versioni caricate, supplemento carburante della settimana (letto da solo dalla pagina di DHL, o scritto a mano);
  - **Segnalazioni**: i problemi segnalati, con chi li ha mandati e da dove; si risponde, si segnano come risolti o si riaprono (la risposta la vede chi ha scritto). Le segnalazioni da leggere compaiono tra le cose *Da sistemare* e con un puntino sulla scheda Gestione; quelle risolte da più di due anni si cancellano da sole;
  - **Registro** degli eventi.

## Curiosità nel porto

Per chi ha un minuto, senza togliere niente al lavoro:

- **La scena si tocca**: la nave suona la sirena e sbuffa, la gru appoggia il container sulla nave, l'aereo fa un giro, il camion parte e torna, il treno fa manovra, le nuvole piovono e dal mare si alza un gabbiano. Ogni animazione finisce dov'era cominciata.
- **«Carica la nave»**: tre tocchi veloci sulla gru (oppure «gioca» scritto fuori dai campi) aprono un piccolo gioco. Si sgancia il container sul posto indicato con un tocco, un clic, la barra spaziatrice o Invio; ogni dieci container la nave salpa. Il record resta nel dispositivo. Lo propongono anche le pagine d'attesa (account da approvare, dati in preparazione).
- **Parole segrete**, scritte fuori dai campi: «nave» fa suonare le sirene, «festa» accende i fuochi, «magic» fa salpare il logo (come cinque tocchi sul logo).
- **Stagioni e feste**: tutta l'app segue il calendario (`js/calendario.js`).
  - I colori cambiano con la stagione o con la festa del giorno: pulsanti, collegamenti, scheda attiva, logo, aloni e un motivo leggero sullo sfondo (fiocchi, foglie, fiori, cuori, coccarde...). Sempre leggibili, anche con il tema scuro.
  - In cima alla barra c'è un festone: luci a Natale, stelle a Capodanno, bandierine tricolori nelle feste nazionali, bandiere nautiche d'estate, ghiaccioli d'inverno, foglie d'autunno e così via. Il logo porta un accessorio (cappello di Babbo Natale, bandierina, sole, neve...), le schede principali un simbolo, d'inverno c'è la neve sopra le schede.
  - Gli auguri del giorno nella prima pagina e nell'accesso; all'apertura, una volta al giorno, cadono sulla pagina fiocchi, foglie, petali, cuori, stelle o coriandoli.
  - Dal **Profilo** si possono spegnere su un dispositivo («Colori e decorazioni delle stagioni e delle feste») e si può vedere l'anteprima di ogni festa o stagione («Anteprima di stagioni e feste», finché resta aperta la scheda del browser).
  - Nella scena: in primavera l'albero della banchina fiorisce e cadono petali; d'estate c'è il sole; d'autunno le foglie diventano gialle e rosse e cadono; d'inverno la neve sui container, sulla banchina e sui rami. Toccando l'albero, si scuote e cade quello della stagione.
  - Natale (fino all'Epifania): l'abete e le luci sulla gru; Capodanno (dal 31 dicembre al 2 gennaio): i fuochi; Befana: la calza appesa alla gru.
  - San Valentino: cuori dal fumaiolo; Carnevale (dal giovedì al martedì grasso): coriandoli e stelle filanti; 8 marzo: l'albero fiorisce di mimosa; Pasqua e Pasquetta: le uova sulla banchina.
  - 25 aprile, 1° maggio e 2 giugno: bandierine sulla gru e il tricolore a poppa; il 2 giugno la scia dell'aereo è quella delle Frecce Tricolori. Ferragosto: l'ombrellone; Halloween: la zucca e i pipistrelli.
  - Con il tema scuro, le stelle e le finestre accese (e niente sole).
- **Puntatore a forma di aereo** con il mouse: blu marina, arancio sopra collegamenti e pulsanti; la punta è il punto che clicca. Si spegne dal Profilo su un dispositivo; non compare con il contrasto elevato o i colori forzati del sistema.
- **Codici recenti** sotto la casella di ricerca, quando è vuota (gli ultimi aperti su questo dispositivo), e vignette disegnate negli elenchi vuoti.

Con «movimento ridotto» attivo nel sistema le animazioni durano un istante.

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
   Le email dei domini scelti in *Gestione → Intelligenza artificiale* (all'inizio solo dhl.com, esatto: non i sottodomini) entrano subito, con l'IA spenta: l'interruttore «Usa l'IA» e i pulsanti dell'IA restano visibili ma bloccati, con il divieto e la scritta «Chiedere autorizzazione all'admin per l'utilizzo dell'IA». Per dargliela: *Utenti → Modifica*, limite vuoto (predefinito) o un numero. Il sito non manda email, quindi non può verificare che l'indirizzo esista davvero: chi conosce il dominio può entrare con un indirizzo inventato. Se succede, sospendi l'account; per chiudere la porta togli il dominio dall'elenco.

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
- foto e PDF vanno tra la parte fissa e la merce, così la cache resta valida; con Gemini una foto di 1280 pixel vale circa un migliaio di token in più per richiesta, un PDF qualche centinaio di token per pagina. Gemini e Claude leggono immagini e PDF; tra i servizi compatibili OpenAI servono modelli che li leggano, altrimenti la classificazione da allegati dice che il servizio non li ha accettati (quella a parole funziona come prima).

*Gestione → Intelligenza artificiale* mostra classificazioni, richieste e token del mese (con la parte letta dalla cache) per tutti e per persona. La spesa esatta è nella fatturazione di Google Cloud.

## Costo di spedizione (DHL Express)

Un costo **indicativo**, con i prezzi pubblici di listino della «Guida ai servizi e alle tariffe» di DHL Express: niente sconti contrattuali.

- **Tariffe**: l'amministratore carica il PDF della guida in *Gestione → Trasporto*. Il server lo legge in un processo a parte (`taric/leggi_tariffe.py`) e lo controlla: zonario completo con l'Italia in zona 0, prezzi di tutte le zone che crescono con il peso, scatti coerenti con le righe della tabella. Se qualcosa non torna il PDF si rifiuta e resta la tariffa di prima; le parti accessorie che non si leggono (Economy Select, limiti, supplementi, spunte dei servizi per paese) diventano avvisi. Quando DHL pubblica la guida nuova basta caricarla; le versioni precedenti si possono rimettere. Il PDF non resta sul server: restano i dati letti, nel database.
- **Dalla guida**: zona di ogni paese e servizi disponibili (DHL Express Worldwide, 12:00, 10:30, 9:00, Economy Select); prezzi delle merci in importazione e in esportazione, con gli scatti oltre le righe della tabella (nella guida 2026 la tabella d'esportazione oltre i 30 kg dice «per ogni 0,5 kg», ma i prezzi sono per kg: il passo vero si ricava dai prezzi); costo dei servizi a orario; limiti di peso e misure; supplementi a prezzo fisso.
- **Peso**: per ogni collo il maggiore tra peso reale e volumetrico (lunghezza × larghezza × altezza in cm / 5000), arrotondato al mezzo kg (Economy Select: al kg); la spedizione paga la somma, con gli arrotondamenti della tabella.
- **Supplementi**: dai colli si ricavano collo extra misura (peso tassabile oltre 70 kg; lato oltre 100 cm o secondo lato oltre 80 cm), collo non trasportabile su nastro (da 25 a 70 kg, o imballo non in cartone) e pallet non sovrapponibile; si scelgono consegna al sabato, aree remote, batterie al litio e assicurazione (1 % del valore, almeno 11 €).
- **Carburante**: DHL lo cambia ogni settimana. Il server lo legge da solo ogni giorno dalla [pagina dei supplementi di DHL Express Italia](https://mydhl.express.dhl/it/it/ship/surcharges.html): il valore della settimana in corso per i servizi internazionali (Worldwide e servizi a orario) e quello di Economy Select, che ha il suo. In *Gestione → Trasporto* si vede la settimana e quando è stato letto, con «Leggi adesso»; se la pagina non risponde o cambia forma resta l'ultimo valore, Gestione mostra l'errore e si riprova dopo 6 ore. Si può anche scrivere a mano: vale fino alla domenica della sua settimana. Con `MAGIC_HS_CARBURANTE_URL` vuota la lettura automatica è spenta. Dopo 7 giorni senza aggiornamenti compare tra le cose *Da sistemare*; nel calcolatore si può cambiare. Si applica al trasporto, ai servizi a orario e ai supplementi legati al trasporto, non all'assicurazione e alle merci pericolose.
- **Nella bolla d'importazione** «Calcola trasporto e assicurazione con DHL Express» apre il calcolatore con il paese e i colli della bolla. «Usa nella bolla» mette nel trasporto fino al confine UE (valore in dogana) la quota indicata: per il trasporto aereo la percentuale dell'allegato 23-01 del Reg. (UE) 2015/2447 per il paese di partenza, già proposta dalla tabella dell'allegato (per Stati Uniti, Canada e Russia dipende dall'aeroporto di partenza, che si sceglie; per i paesi che non sono nella tabella, come il Regno Unito, si scrive). Il resto va tra le spese fino a destinazione (base IVA), l'assicurazione nel suo campo.
- **Non comprende**: dazi, IVA e oneri di sdoganamento, Demand Surcharge e situazioni di emergenza, supplementi per paesi a rischio, merci pericolose (salvo le batterie al litio), sconti contrattuali; le spedizioni nazionali.

## Misure a una data passata

Ogni estrazione mensile del TARIC (Commissione europea, DG TAXUD) contiene solo le misure valide dal suo giorno in poi: quelle finite prima e i codici cessati non ci sono. Per una data passata servono quindi i dati di quel mese.

- **Archivio dei mesi**: i dati di ogni mese restano nella pagina «dati» delle versioni su GitHub. Quelli da luglio 2025, il primo mese che la Commissione tiene su CIRCABC, si preparano con il flusso *Actions → Dati TARIC dei mesi passati → Run workflow* (`strumenti/dati_storici.py`, con gli stessi controlli dei dati del mese); i mesi già pubblicati si saltano.
- **Nella scheda del codice**, con una data precedente ai dati in uso, compare *Apri i dati TARIC del …*: la pagina si riapre con i dati del mese più recente non successivo a quel giorno, sullo stesso codice, paese e flusso. In cima a ogni sezione un avviso ricorda che sono dati di un mese passato, con *Torna ai dati in uso*. Ricerca, nomenclatura, misure e bolla usano quei dati.
- **Nella bolla**, con una data precedente ai dati in uso, *Ricalcola con i dati TARIC del …* salva la bolla e la riapre con i dati di quel mese.
- Per un giorno oltre il mese dei dati aperti la scheda avvisa che possono mancare le misure nuove. Per una data prima di luglio 2025 resta il TARIC dell'UE, che si apre già impostato su quel giorno.
- Il server scarica un mese la prima volta che serve (circa 1,2 MB) e lo tiene in `dati/taric/archivio`, senza estrarlo. Il testo italiano della nomenclatura è quello dell'estrazione di gennaio o luglio più recente, ma non successiva al mese; le righe cambiate dopo restano in inglese.

## Bolla simulata

Serve a preparare e controllare una bolla prima di farla in AIDA. I calcoli sono in `taric/static/js/calcolo.js` e hanno prove automatiche (`tests/prova_calcolo.js`).

- **Dati della dichiarazione**: ogni campo porta il suo riferimento, il dato (DE) e la casella del vecchio DAU. Per l'importazione sono quelli del tracciato H1 dell'Agenzia delle Dogane nella versione EUCDM 6.2, obbligatoria dal 13 luglio 2026 (allegato B dei Reg. UE 2015/2446 e 2015/2447, come modificati dai Reg. 2021/234 e 2021/235); per l'esportazione quelli della colonna B1 dell'allegato B del Reg. 2015/2446. I codici delle liste (natura della transazione, modo di trasporto, imballaggi, aggiunte e detrazioni, metodo di valutazione, rappresentanza) sono in `taric/static/js/codici-dogana.js`, dalle tabelle dei codici dell'Agenzia delle Dogane.
- **Dati obbligatori da completare**: i dati che la dichiarazione richiede ma che non cambiano i tributi (soggetti, natura della transazione, modo di trasporto, container, ubicazione delle merci, documento di trasporto, fattura N380, provincia e paese di spedizione, colli con tipo, numero e marchi, descrizione, masse, codici di aggiunte e detrazioni; all'esportazione l'ufficio di uscita) sono elencati sotto il riepilogo; con un clic si va al campo. Non bloccano il totale.

- **Misure del giorno della bolla**: si usano quelle valide alla data prevista, per l'origine (o la destinazione) di ogni articolo. Per una data precedente ai dati TARIC del mese il totale non si calcola e ogni articolo apre il TARIC dell'UE a quel giorno (vedi *Misure a una data passata*). Le misure del commercio elettronico (dazio da 3 € e tassa di gestione) non toccano la bolla ordinaria e restano fuori.
- **Cambio doganale**: per tutto un mese vale il cambio pubblicato dalla BCE il penultimo mercoledì del mese precedente; se quel giorno la BCE non lo pubblica, il più recente pubblicato prima (art. 146 del Reg. UE 2015/2447, art. 53 del Reg. UE 952/2013). È lo stesso dell'elenco mensile dell'Agenzia delle Dogane (*Cambi doganali*). Il server lo prende dalla BCE e lo tiene; il penultimo mercoledì lo prende solo dopo la pubblicazione, nel pomeriggio. Nella bolla e nel foglio stampato compaiono il tasso e il giorno. Per le valute che la BCE non pubblica l'Agenzia delle Dogane indica il cambio giornaliero della Banca d'Italia.
- **Valore in dogana** di ogni articolo: prezzo in fattura, più trasporto e assicurazione fino al confine UE (se non sono già nel prezzo), più gli altri elementi da aggiungere, meno quelli da togliere, al cambio del mese. Trasporto e assicurazione si ripartiscono sugli articoli in base al valore o alla massa lorda, al centesimo: la somma delle quote è esattamente il totale. Il luogo d'introduzione è il porto di primo arrivo per il mare e l'ufficio doganale di entrata per strada e ferrovia (art. 137 del Reg. UE 2015/2447); per il trasporto aereo la quota da indicare è quella dell'allegato 23-01 dello stesso regolamento (art. 138).
- **Dazio**: quello dei paesi terzi, oppure la riduzione scelta (preferenza con la prova dell'origine, sospensione, contingente se ancora disponibile). Una misura senza dazio scritto vale 0 %, come nel TARIC.
- **Antidumping, compensativi e dazi addizionali**: si sceglie il codice addizionale del produttore; vale solo la misura che lo contiene. Il documento D008 (fattura commerciale conforme) e gli altri documenti che cambiano il dazio si spuntano nell'articolo. I dati TARIC sono quelli del primo del mese: per una bolla di un giorno dopo, se ci sono antidumping o compensativi, un avviso ricorda che un dazio nuovo o cambiato nel frattempo non c'è e porta al TARIC dell'UE per quel codice, origine e giorno.
- **IVA (B00)**: sulla somma di valore in dogana, dazi e spese dal confine UE fino a destinazione indicate nel documento di trasporto (art. 69 del DPR 633/1972); aliquota scelta per articolo (22, 10, 5, 4 % o esente o non imponibile, con la norma). Se l'IVA è liquidata ma non pagata si sceglie il codice: 406 per la dichiarazione d'intento (art. 8, primo comma, lett. c, DPR 633/1972, con protocollo e data) o 407 per oro e argento; l'importo, uguale alla B00, si detrae dal totale da pagare e si dichiara in valore assoluto (circolare ADM 22/2022).
- **Valore statistico (casella 46)**: valore in dogana più le spese dal confine UE al confine italiano; per l'esportazione quello al confine italiano (più sotto).
- **Metodo e indicatori di valutazione (DE 14 10, 14 07)**: la simulazione calcola solo il metodo 1, valore di transazione (art. 70 del Reg. UE 952/2013); con un altro metodo il totale non compare. Gli indicatori (venditore e acquirente collegati, restrizioni, condizioni, proventi di rivendita) formano il codice di quattro cifre e ricordano cosa verificare.
- **Tasso di cambio del contratto (DE 14 09)**: se le parti l'hanno fissato si scrive e sostituisce il cambio doganale; in testata va il documento 26AO (avviso ADM del 29/07/2026).
- **Arrotondamento**: al centesimo per articolo e per tributo (la metà per eccesso); un tributo dovuto sotto il centesimo vale comunque un centesimo (istruzioni dell'Agenzia delle Dogane per la casella 47); i totali sono le somme.
- **Documenti (casella 44)**: per ogni controllo (CITES, prodotti della foca, gas fluorurati…) si vede quali documenti bastano; si spuntano quelli che si presentano.
- **Codici**: per ogni articolo la bolla indica il codice della casella 36 (preferenza: 100 dazio paesi terzi, 110 sospensione, 120 contingente, 2xx SPG, 3xx altre preferenze come 300 e 320, 4xx unione doganale) e quello di ogni tributo della casella 47 (A00 dazio, anche per i dazi addizionali, A30/A35 antidumping, A40/A45 compensativi, B00 IVA, 406/407 IVA non pagata), dall'allegato B del Reg. UE 2015/2447 e dalla tabella dei tributi dell'Agenzia delle Dogane. Le varianti con certificato (x18, x25, x28, x50) non si ricavano dalle misure: quando un contingente chiede un certificato la bolla lo ricorda.
- **Soggetti e resa**: esportatore (casella 2), venditore e acquirente se diversi (DE 13 08, 13 09), importatore o destinatario (casella 8), dichiarante e rappresentante con la qualifica, diretta o indiretta (casella 14), e Incoterm con il luogo (casella 20); vanno sul foglio stampato. All'importazione è il prospetto di sintesi H1. Ci sono anche i suoi dati che non servono ai calcoli: in «Dichiarazione e pagamento» ufficio doganale, **MRN** (dopo l'accettazione: 18 caratteri, anno, paese e 14 lettere o cifre; nella stampa con il **codice a barre** Code 128, come in AIDA), dilazione di pagamento (casella 48) e metodo di pagamento (casella 47, colonna MP, con i codici dell'allegato B del Reg. 2015/2447); l'identità del mezzo all'arrivo (casella 18); lo **scarico** (documento precedente, DE 12 01, per esempio 337 con l'MRN della custodia temporanea); i regimi aggiuntivi di ogni articolo (DE 11 10). Restano vuote solo le caselle che esistono dopo l'accettazione (svincolo, A93, quietanza); quello che la simulazione usa in più (venditore, acquirente, modo di trasporto, ubicazione, cambio, metodo e indicatori di valutazione, spese di trasporto) e il riepilogo dei tributi sono in «Altri dati della simulazione». All'esportazione il foglio riporta tipo di dichiarazione (EX A) e regime (10 00).
- **A mano, solo dove serve**: il cambio, per le valute che la BCE non pubblica (per le Dogane vale il cambio giornaliero della Banca d'Italia); l'aliquota del dazio e l'importo di antidumping e altri dazi, che sostituiscono il calcolo e risultano «inserito a mano». Al posto di un dazio non calcolabile (prezzo d'entrata) restano «non verificati».
- **Conflitti tra i campi**: la bolla li elenca in alto e colora il campo, senza bloccare il totale. Per esempio:
  - un dazio scritto a mano diverso da quello del TARIC per il codice della casella 36 (codice 300 con la preferenza a 0 % e dazio all'8 %);
  - la resa e il trasporto (FOB senza trasporto fino al confine, CIF o DAP con il trasporto aggiunto);
  - massa netta maggiore della lorda;
  - origine o destinazione nell'Unione;
  - IVA esente o non imponibile senza la norma, codice 406 senza gli estremi della dichiarazione d'intento;
  - indicatore dei proventi di rivendita senza l'aggiunta AJ, tasso del contratto con la fattura in euro;
  - codici addizionali che non valgono più per codice, origine e data;
  - una data della bolla precedente ai dati TARIC.

  Ricorda anche quando una preferenza farebbe risparmiare o, al contrario, non cambia niente.
- **Esportazione**: il valore statistico è quello al confine italiano: si aggiunge il trasporto fino al confine se non è nel prezzo, si toglie quello oltre il confine se è compreso.
- **Il totale non compare** finché qualcosa non è certo: prezzo d'entrata o altre soglie, componenti agricole, codice del produttore non scelto, cambio non ancora fissato, divieti. Ogni blocco dice cosa manca o cosa verificare.
- **Fuori dalla simulazione**: accise, misure nazionali, saldo dei contingenti, misure cambiate dopo la data dei dati TARIC, validità della prova dell'origine.

- **Da un PDF**: nella sezione Bolla si trascina il PDF (su qualsiasi punto della sezione) o lo si sceglie nel riquadro «Da un PDF», fino a 5 MB. Il PDF non si salva da nessuna parte.
  - Il **prospetto di sintesi H1** stampato da AIDA si legge **senza IA**, gratis e subito, anche da chi ha l'IA spenta: MAGIC HS riconosce le caselle dalle etichette e le sezioni a righe (documenti, scarichi, liquidazione, colli), un foglio «Dettagli Articolo» per articolo.
  - Gli **altri PDF** (altri formati, scansioni) si leggono **con l'IA**, dopo la conferma: conta come una classificazione del mese.
  - Nasce una **bolla d'importazione nuova** (quella aperta non si tocca), da controllare e salvare: soggetti, consegna, paesi, ufficio, MRN, documenti di trasporto e fattura, scarico, metodo di pagamento e, per ogni articolo, codice, descrizione, origine, prezzo, masse, quantità, colli, regimi aggiuntivi e documenti. In alto l'elenco di quello che va controllato a mano: aggiunte e detrazioni, altri documenti di testata, il tasso di cambio del prospetto (MAGIC HS usa il cambio doganale del mese), la preferenza se non è 100, gli importi dei tributi del prospetto per confronto (MAGIC HS li ricalcola).

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
- **Foto e PDF della merce**: il server li manda al servizio IA e li scarta subito; non li scrive nel database, nello storico o nel registro. Nello storico e nell'archivio aziendale resta solo il testo: quello scritto o, se manca, la merce che l'IA ha visto (con «Foto:» o «Scheda PDF:» davanti), e quello che ha letto negli allegati. Con «Condividi → MAGIC HS» i file passano dall'app alla pagina solo nella memoria del telefono. Il servizio IA tratta gli allegati come il resto della richiesta, secondo i suoi termini: meglio non fotografare persone o documenti con dati di clienti.
- **Dati di ciascuno**: i preferiti e le bolle simulate si vedono solo dal proprio account. Le classificazioni sono condivise con i colleghi nell'archivio aziendale (descrizione, codice, risultato e nome di chi l'ha fatta), a meno di togliere la spunta nel Profilo; quelle fatte prima di questa funzione restano personali. L'amministratore vede l'uso dell'IA e le parole cercate senza risultati, senza sapere chi le ha cercate.
- **Archivi caricati** e dati TARIC scaricati: trattati come non fidati, con nomi e dimensioni controllati; i dati si installano solo se superano i controlli.
- **Chi può modificare il repository** su GitHub può cambiare il sito: proteggi l'account con l'autenticazione a due fattori.
- **Font**: locali (licenza SIL OFL), quindi nessun servizio di terzi caricato dalle pagine.

## Sviluppo

```bash
pip install -r requirements-dev.txt
python -m pytest -q tests                       # sito, IA, dati, backup, ricerca, archivio, copia esterna, bolle
node tests/prova_calcolo.js                     # calcoli della bolla e degli importi
node tests/prova_calendario.js                  # stagioni e feste (Pasqua, Carnevale, auguri, contrasto dei colori)
node tests/prova_trasporto.js                   # costo di spedizione (pesi, scatti, supplementi, carburante)
node tests/prova_codice128.js                   # codice a barre dell'MRN (Code 128)
TARIC_PDF_DHL=guida-dhl-2026.pdf python -m pytest -q tests/test_trasporto.py   # con la guida vera di DHL Express
TARIC_ZIP_PROVA=eu-taric-2026-11.zip python -m pytest -q tests/test_dati_reali.py   # con un'estrazione vera (circa un minuto)
```

Il sito si avvia anche in locale: `TARIC_DATI=prova/dati MAGIC_HS_AMMINISTRATORI=tu@azienda.it python -m taric server --porta 8810`, poi `http://localhost:8810`. Con Docker, come su Render: `docker build -t magic-hs .` e poi `docker run -p 10000:10000 -e PORT=10000 -v $PWD/disco:/var/data magic-hs`.

Prova nel browser (Playwright), la stessa che GitHub esegue a ogni modifica:
1. prendi i dati di un mese dalla pagina `dati` (oppure preparali con `python strumenti/dati_mese.py AAAA-MM dati-AAAA-MM-01.zip`);
2. `tests/sito_di_prova.sh dati-AAAA-MM-01.zip prova-sito` avvia i finti servizio IA, GitHub, BCE, archivio S3 e pagina del carburante di DHL (`tests/finto_claude.py`) e il sito sulla porta 8810, e aspetta i dati;
3. lancia `node tests/e2e_sito.js http://localhost:8810 shots-sito`.

Le istruzioni per proseguire il lavoro con Claude Code sono in `CLAUDE.md`.

## Fonti e licenze

- **Nomenclatura e misure**: Commissione europea, DG TAXUD (dati pubblicati per il riutilizzo citando la fonte).
- **Font**: Archivo (SIL Open Font License, vedi `taric/static/fonts/`).
- **Icone**: Lucide (licenza ISC, vedi `taric/static/icons/LICENSE-lucide.txt`); si rigenerano con `strumenti/icone.py`.
- **Classificazione assistita**: Google Gemini (o il servizio impostato sul server).
