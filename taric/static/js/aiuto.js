/* MAGIC HS - Marino, il gabbiano marinaio dell'aiuto. Con il tasto «?» della barra (o il tasto ? fuori dai campi) arriva in
   volo e spiega la sezione aperta a passi: illumina una parte della pagina alla volta e la racconta nel fumetto, con
   Indietro, Avanti e Chiudi (anche con le frecce e con Esc). Gestione no: lì il tasto non c'è. La prima volta che si apre
   una sezione arriva da solo e chiede se spiegarla (invito che non blocca la pagina, una volta per sezione e dispositivo).
   Nella pagina d'accesso (accedi.html, vista «accesso») si presenta e presenta l'app, nello stesso modo.
   I passi di ogni vista sono in PASSI: «e» trova l'elemento da illuminare nella pagina com'è adesso; se non c'è il passo
   si salta (il primo e l'ultimo parlano senza indicare niente). I colori del disegno sono le variabili --g-* di app.css;
   con il movimento ridotto Marino compare e sparisce senza volare. */
(function () {
  'use strict';
  var T = window.TARIC, esc = T.esc;
  var tasto = document.getElementById('aiuto');
  if (!tasto) return;
  var aperto = null;            // { el, passi, i, prima, ultimoPosto }

  /* ------------------------------------------------------------------ il gabbiano (in piedi; .vola: ali alzate) */
  var MARINO = '<svg class="marino" viewBox="0 0 100 110" aria-hidden="true" focusable="false">' +
    '<g class="mr-zampe"><path class="mr-gamba" d="M43 88 L42 100M57 88 L57 100"/>' +
    '<path d="M34 103.5 Q36 99 42 99.5 Q48 99 50 103.5 L46 102.5 L42 104 L38 102.5 Z"/><path d="M49 103.5 Q51 99 57 99.5 Q63 99 65 103.5 L61 102.5 L57 104 L53 102.5 Z"/></g>' +
    '<g class="mr-ala-su mr-dietro"><path class="mr-ala" d="M52 58 C53 42 51 26 46 10 L41 20 L45 21 L39 32 L44 33 L40 44 L46 45 L45 55 Z"/></g>' +
    '<path class="mr-punta" d="M24 70 L6 77 L9 82 L27 79 Z"/>' +
    '<path class="mr-bianco" d="M52 46 C70 47 79 61 77 74 C75 87 63 93 49 93 C33 93 21 84 21 71 C21 57 34 46 52 46 Z"/>' +
    '<path class="mr-ombra" d="M73 70 C72 83 62 90 49 90 C60 86 69 80 73 70 Z"/>' +
    '<g class="mr-ala-giu"><path class="mr-ala" d="M27 63 C35 55 52 57 58 67 C61 77 51 86 35 84 C25 83 19 74 27 63 Z"/>' +
    '<path class="mr-punta" d="M27 75 C20 79 13 82 7 83 C13 76 20 72 28 70 Z"/></g>' +
    '<g class="mr-ala-su mr-davanti"><path class="mr-ala" d="M44 62 C42 44 34 24 16 6 L11 18 L15 19.5 L7 30 L12 31.5 L6 42 L13 42.5 L11 53 L19 52 L23 62 C30 66 38 66 44 62 Z"/>' +
    '<path class="mr-punta" d="M16 6 C18.5 9 20 12 21 15 L15 19.5 L11 18 Z"/></g>' +
    '<path class="mr-colletto" d="M42 51 L54 59 L67 49 L66 57 L54 66 L43 59 Z"/><circle class="mr-nodo" cx="54" cy="61" r="3.2"/>' +
    '<g class="mr-testa"><circle class="mr-bianco" cx="58" cy="35" r="17"/><ellipse class="mr-guancia" cx="65" cy="43" rx="3.6" ry="2.3"/>' +
    '<g class="mr-occhio"><circle class="mr-pupilla" cx="63" cy="32" r="3.4"/><circle class="mr-luce" cx="64.3" cy="30.8" r="1.1"/></g>' +
    '<path class="mr-becco mr-becco-giu" d="M71 41 Q80 41 85 42 Q79 46.5 72 44.5 Z"/><path class="mr-becco" d="M70 36 Q82 35 91 39.5 Q82 41.5 71 41.5 Z"/>' +
    '<circle class="mr-macchia" cx="83" cy="42.6" r="1.5"/>' +
    '<g class="mr-berretto" transform="rotate(-8 58 22)"><path class="mr-cappello" d="M43 25 Q40 13 58 11 Q77 11 75 23 Z"/>' +
    '<path class="mr-banda" d="M42.5 22 L75.5 21 L76 27 L43 28 Z"/><path class="mr-visiera" d="M61 27 Q73 26 80 30 Q70 32 60 30.5 Z"/>' +
    '<circle class="mr-stemma" cx="58" cy="24.5" r="2"/></g></g></svg>';
  T.marino = function () { return MARINO; };

  /* ------------------------------------------------------------------ dove siamo e cosa c'è nella pagina */
  var ACCESSO = document.body.getAttribute('data-pagina') === 'accedi';          // pagina d'accesso: Marino presenta l'app
  function sezione() { return ACCESSO ? document.querySelector('main') : document.querySelector('main > section[id^="view-"]:not([hidden])'); }
  function vista() { if (ACCESSO) return 'accesso'; var s = sezione(); return s ? s.id.slice(5) : ''; }
  function visibile(e) { return !!(e && e.isConnected && e.getClientRects().length && !e.closest('[hidden]')); }
  function q(sel) { var s = sezione(), e = s && s.querySelector(sel); return visibile(e) ? e : null; }
  function tutti(sel) { var s = sezione(); return s ? Array.prototype.filter.call(s.querySelectorAll(sel), visibile) : []; }
  /* il riquadro (.box) con l'etichetta che comincia così (senza il numero della casella davanti, per esempio «33») */
  function box(re) {
    var L = tutti('.box > .lab');
    for (var k = 0; k < L.length; k++) if (re.test(L[k].textContent.replace(/^\s*\d+\s*/, ''))) return L[k].parentNode;
    return null;
  }
  function riq(re) { return function () { return box(re); }; }
  function sel(s) { return function () { return q(s); }; }

  /* ------------------------------------------------------------------ i passi di ogni vista */
  var FINE = { t: 'Quando vuoi', d: 'Se hai un dubbio premi «?»: torno io. Se qualcosa non funziona, scrivilo all\'amministratore. Buon lavoro!',
    e: function () { return visibile(tasto) ? tasto : null; } };
  var PASSI = {
    classifica: function () {
      var dom = document.querySelector('.domanda'), ia = !!(dom && dom.classList.contains('modo-ia'));
      var sw = document.getElementById('interruttore-ia'), conIA = visibile(sw), bloccata = !!(sw && sw.classList.contains('con-divieto'));
      var proposta = !!q('#esito .principale .perche'), archivio = tutti('#risultati .lab').some(function (l) { return /azienda/.test(l.textContent); });
      return [
        { t: 'Classifica', d: 'Qui trovi il codice TARIC di una merce: cercalo con una parola o con un codice' +
          (conIA ? ', oppure fatti aiutare dall\'IA.' : '.') },
        ia ? { t: 'Descrivi la merce', d: 'Descrivila come a un collega: cos\'è, di che materiale, a cosa serve. Poi premi «Classifica».', e: sel('.cerca-merce') }
          : { t: 'Cerca', d: 'Scrivi una parola, come «scarpe di cuoio», o le prime cifre di un codice e premi «Cerca». Conosco anche i sinonimi.', e: sel('.cerca-merce') },
        { t: 'Usa l\'IA', d: bloccata ? 'Con questo interruttore l\'IA propone il codice dalla tua descrizione. Per usarla chiedi l\'autorizzazione all\'amministratore.'
          : 'Accendilo per descrivere la merce a parole tue: l\'IA propone il codice, spiega perché e fa domande per essere più precisa.', e: sel('#interruttore-ia') },
        { t: 'Da foto o PDF', d: bloccata ? 'Con questo tasto l\'IA riconosce la merce da foto o schede tecniche. Per usarlo chiedi l\'autorizzazione all\'amministratore.'
          : 'Fotografa la merce e la sua etichetta, o allega la scheda tecnica in PDF: fino a 3 file, anche trascinati, incollati o condivisi da un\'altra app. ' +
            'L\'IA dice che cosa vede e legge, poi propone il codice. Scrivi accanto quello che non si vede, come il materiale.', e: sel('#foto-posto') },
        { t: 'Codici recenti', d: 'Gli ultimi codici che hai aperto: un tocco e li riapri.', e: sel('#recenti') },
        { t: 'Risultati', d: (archivio ? 'In alto le merci già classificate in azienda, poi le voci della nomenclatura' : 'Le voci della nomenclatura che corrispondono') +
          ': tocca quella giusta per aprirne la scheda.', e: sel('#risultati .ris-box') },
        { t: 'Il codice', d: (proposta ? 'La proposta dell\'IA, con il perché. ' : '') + 'Qui ci sono le 10 cifre e i comandi per copiare il codice, stamparlo, ' +
          'salvarlo tra i preferiti o portarlo in una bolla.', e: sel('#esito .principale') },
        { t: 'Voci a confronto', d: 'Le altre voci che l\'IA ha considerato: toccane una per vederla al posto della proposta.', e: riq(/^Voci a confronto/) },
        { t: 'Domande per affinare', d: 'Rispondi alle domande o aggiungi un dettaglio e premi «Riclassifica»: la proposta diventa più precisa.', e: riq(/^Domande per affinare/) },
        { t: 'Percorso', d: 'Dove si trova il codice nella nomenclatura, dalla sezione in giù. Se il codice non è dichiarabile così, scegli qui una sottovoce.',
          e: riq(/^Percorso nella nomenclatura/) },
        { t: 'Paese e flusso', d: 'Scegli il paese e se importi o esporti: le misure qui sotto cambiano di conseguenza.', e: riq(/^Paese/) },
        { t: 'Data delle misure', d: 'Le misure sono quelle in vigore a questa data: cambiala per vedere quelle di un altro giorno, anche passato.', e: riq(/^Misure TARIC/) },
        { t: 'Dazi e imposizioni', d: 'Dazi e altre misure per il paese scelto, con le loro condizioni.', e: riq(/^Calcolo delle imposizioni/) },
        { t: 'Calcolo degli importi', d: 'Scrivi valore e quantità: calcolo dazi e IVA. Quello che non si può calcolare con certezza resta in evidenza.', e: sel('#esito .calcolo') },
        { t: 'Documenti', d: 'Certificati, licenze e controlli richiesti per questa merce, con le condizioni.', e: riq(/^Documenti presentati/) },
        FINE
      ];
    },
    nomenclatura: function () {
      var dati = T.app && T.app.dati ? T.app.dati().it : '';
      return [
        { t: 'Nomenclatura', d: 'Qui c\'è tutta la nomenclatura TARIC' + (dati ? ' del ' + dati : '') + ', dalle sezioni fino ai codici a 10 cifre.' },
        { t: 'Il codice da cui arrivi', d: 'Ecco il codice che hai aperto dalla scheda, al suo posto nella nomenclatura.', e: sel('#albero .trow.acceso') },
        { t: 'Sezioni', d: 'Tocca una sezione per vederne i capitoli, poi le voci: la freccia ▸ vuol dire che dentro c\'è altro.', e: sel('#albero .sez') },
        { t: 'Codici dichiarabili', d: 'Sui codici dichiarabili c\'è «Usa»: apre la scheda con le misure e i dazi.', e: sel('#albero .trow .btn') },
        FINE
      ];
    },
    bolla: function () {
      if (q('#b-spedizione')) return [
        { t: 'Costo di spedizione', d: 'Qui calcoli il costo indicativo di una spedizione con DHL Express, con i prezzi di listino.' },
        { t: 'Mancano le tariffe', d: 'L\'amministratore deve ancora caricare la guida alle tariffe di DHL Express in Gestione.', e: sel('#b-spedizione .vuoto') },
        { t: 'Spedizione', d: 'Importazione o esportazione, paese e servizio. Il supplemento carburante della settimana è già scritto.', e: riq(/^Spedizione DHL Express/) },
        { t: 'Colli', d: 'Peso e misure di ogni collo: si paga il maggiore tra peso reale e volumetrico.', e: riq(/^Colli/) },
        { t: 'Servizi e supplementi', d: 'Assicurazione e servizi in più, solo se servono.', e: riq(/^Servizi e supplementi/) },
        { t: 'Costo', d: 'Il costo voce per voce e il totale. Se manca qualcosa, te lo dico qui.', e: riq(/^Costo$/) },
        { t: 'Nella bolla', d: 'Con la quota fino al confine UE, «Usa nella bolla» riporta trasporto e assicurazione nei campi giusti.', e: riq(/^Nella bolla/) },
        FINE
      ];
      if (q('[data-b="salva"]')) {
        var imp = /importazione/.test((q('.bolla-titolo') || {}).textContent || '');
        return [
          { t: imp ? 'Bolla d\'importazione' : 'Bolla d\'esportazione', d: 'Una bolla simulata: compila dall\'alto in basso e ' +
            (imp ? 'dazi e IVA si calcolano mentre scrivi.' : 'il riepilogo si aggiorna mentre scrivi.') },
          { t: 'Salva e stampa', d: 'Salva la bolla, stampala o fanne un PDF, oppure duplicala per una spedizione simile.', e: sel('.bolla-barra .dx') },
          { t: 'Intestazione', d: 'Riferimento, data, valuta e paese. Se la valuta non è l\'euro uso il cambio doganale del mese.', e: riq(/^Intestazione/) },
          { t: 'Dati della dichiarazione', d: 'Soggetti, consegna, trasporto e valore: apri le parti che ti servono. Ogni campo ha il suo riferimento (DE e casella).',
            e: sel('details.b-sez') },
          { t: 'Trasporto', d: 'Non sai quanto costa il trasporto? Calcolalo con le tariffe di DHL Express e riportalo qui.', e: sel('[data-b="trasporto-bolla"]') },
          { t: 'Articoli', d: 'Codice, origine, valore e masse di ogni articolo. Puoi aggiungerlo anche dalla scheda di un codice, con «Aggiungi alla bolla».',
            e: sel('#b-articoli .articolo') },
          { t: 'Più articoli', d: 'Aggiungi un articolo per ogni codice della spedizione.', e: sel('[data-b="aggiungi"]') },
          { t: imp ? 'Tributi' : 'Riepilogo', d: (imp ? 'Dazi, IVA e totale da pagare. ' : '') + 'Quello che manca o non torna è elencato qui: tocca una riga per andare al campo.',
            e: function () { var e = q('#b-esito'); return e ? e.closest('.box') : null; } },
          FINE
        ];
      }
      return [
        { t: 'Bolla', d: 'Qui simuli una bolla doganale con i dati TARIC del mese, e calcoli il costo di una spedizione.' },
        { t: 'Nuova bolla', d: 'Comincia una bolla d\'importazione o d\'esportazione: valore in dogana, dazi, IVA e documenti.', e: riq(/^Bolla simulata/) },
        { t: 'Da un PDF', d: 'Trascina qui il prospetto di sintesi H1 di AIDA, o sceglilo: compilo io una bolla d\'importazione nuova, da controllare e salvare. ' +
          'Gli altri PDF li leggo con l\'IA.', e: sel('.b-pdf-zona') },
        { t: 'Costo di spedizione', d: 'Il costo indicativo di una spedizione con DHL Express, anche senza bolla.', e: riq(/^Costo di spedizione/) },
        { t: 'Le tue bolle', d: 'Le bolle che hai salvato: riaprile o eliminale. Le vedi solo tu.', e: riq(/^Le tue bolle/) },
        FINE
      ];
    },
    accesso: function () {
      return [
        { t: 'MAGIC HS', d: 'Il sito dell\'azienda per classificare le merci in dogana: trovi il codice TARIC a 10 cifre cercando per parola ' +
          'o per codice, oppure descrivendo o fotografando la merce per l\'intelligenza artificiale.' },
        { t: 'Tutto per la dogana', d: 'Per ogni codice: dazi, antidumping, IVA, certificati e documenti richiesti, per il paese e il giorno che scegli. ' +
          'Poi puoi simulare una bolla doganale e calcolare il costo di una spedizione con DHL Express.', e: sel('.scena') },
        { t: 'Accedi', d: 'Se hai già un account, entra con la tua email e la password.', e: function () { return q('#accedi') || q('[data-a="accedi"]'); } },
        { t: 'Richiedi un account', d: 'Se non ce l\'hai, chiedilo qui: l\'amministratore approva la richiesta e poi entri con la tua email.', e: sel('[data-a="richiedi"]') },
        { t: 'Chi l\'ha fatto', d: 'MAGIC HS l\'ha costruito ' + (T.AUTORE || 'Simone') + ': se ti serve qualcosa o hai un\'idea, scrivi a ' + (T.AUTORE || 'Simone') + '.',
          e: function () { var f = document.querySelector('.firma'); return visibile(f) ? f : null; } },
        { t: 'Ci vediamo dentro', d: 'Una volta dentro premi «?» in ogni sezione: ti spiego io come funziona.', e: function () { return visibile(tasto) ? tasto : null; } }
      ];
    },
    profilo: function () {
      return [
        { t: 'Profilo', d: 'Qui ci sono il tuo account, le preferenze e quello che hai classificato.' },
        { t: 'Classificazioni con l\'IA', d: 'Quante classificazioni con l\'IA hai fatto questo mese.', e: riq(/^Classificazione assistita/) },
        { t: 'Account e password', d: 'Nome, azienda e password. «Esci dagli altri dispositivi» chiude le sessioni aperte altrove.', e: riq(/^Il tuo account/) },
        { t: 'Preferenze', d: 'Paese e flusso proposti nelle schede, tema chiaro o scuro, decorazioni delle feste e puntatore a forma di aereo.', e: riq(/^Preferenze/) },
        { t: 'Storico', d: 'Le tue classificazioni, da riaprire quando vuoi. Se le condividi, i colleghi le ritrovano cercando.', e: riq(/^Storico delle classificazioni/) },
        { t: 'Preferiti', d: 'I codici salvati con «Aggiungi ai preferiti»: ti avviso quando cambiano con i dati nuovi.', e: riq(/^Voci preferite/) },
        { t: 'App', d: 'Installa MAGIC HS sul computer o sul telefono, come un\'app.', e: riq(/^MAGIC HS come app/) },
        { t: 'Segnalazioni', d: 'Qualcosa non funziona o manca? Scrivilo all\'amministratore: qui trovi le sue risposte.', e: riq(/^Segnalazioni/) },
        { t: 'I tuoi dati', d: 'Esporta storico, preferiti e preferenze in un file, o importali da un altro account.', e: riq(/^I tuoi dati/) },
        FINE
      ];
    }
  };

  /* ------------------------------------------------------------------ apertura e chiusura */
  function ridotto() { return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); }
  /* Marino arriva: per la visita (aria-modal, il fuoco nel fumetto) o per l'invito della prima volta (non blocca niente) */
  function crea(v, invito) {
    var el = document.createElement('div');
    el.className = 'aiuto arriva' + (invito ? ' invito' : '');
    el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', invito ? 'false' : 'true');
    el.setAttribute('aria-labelledby', 'aiuto-titolo'); el.setAttribute('aria-describedby', 'aiuto-testo');
    el.innerHTML = '<div class="aiuto-blocco"></div><div class="aiuto-luce senza"></div>' +
      '<div class="aiuto-posto"><div class="aiuto-gabbiano vola">' + MARINO + '</div>' +
      '<div class="aiuto-fumetto"><div class="aiuto-testa"><b id="aiuto-titolo"></b><span class="aiuto-passo"></span>' +
      '<button class="tasto-ico" type="button" data-aiuto="chiudi" aria-label="Chiudi l\'aiuto">' + T.icona('chiudi') + '</button></div>' +
      '<p id="aiuto-testo" aria-live="polite"></p>' +
      '<div class="fila"><button class="link" type="button" data-aiuto="segnala" hidden>' + T.icona('attenzione') + 'Segnala un problema</button>' +
      '<button class="btn sm" type="button" data-aiuto="no" hidden>No, grazie</button>' +
      '<button class="btn sm" type="button" data-aiuto="indietro">' + T.icona('indietro') + 'Indietro</button>' +
      '<button class="btn sm pri" type="button" data-aiuto="avanti"></button></div></div></div>';
    document.body.appendChild(el);
    aperto = { el: el, passi: [], i: -1, prima: document.activeElement, vista: v, invito: invito };
    var g = el.querySelector('.aiuto-gabbiano');
    function atterra() { g.classList.remove('vola'); el.classList.remove('arriva'); }
    g.addEventListener('animationend', function f(ev) { if (ev.target === g) { g.removeEventListener('animationend', f); atterra(); } });
    setTimeout(atterra, ridotto() ? 0 : 1400);             // se l'animazione non parte (scheda in secondo piano)
  }
  function apri() {
    var v = vista();
    if (!PASSI[v] || document.querySelector('.velo')) return;
    if (aperto && aperto.invito) { inizia(false); return; }
    if (aperto) return;
    crea(v, false);
    inizia(true);
  }
  /* la visita: con il saluto se Marino non si è già presentato nell'invito */
  function inizia(saluto) {
    var a = aperto, passi = PASSI[a.vista]().filter(function (p, k, tuttiPassi) { return !p.e || k === tuttiPassi.length - 1 || p.e(); });
    if (saluto) passi[0] = { t: passi[0].t, d: 'Ciao, sono Marino! ' + passi[0].d };
    a.passi = passi; a.invito = false;
    a.el.classList.remove('invito'); a.el.setAttribute('aria-modal', 'true');
    a.el.querySelector('[data-aiuto="no"]').hidden = true;
    document.documentElement.classList.add('con-aiuto');
    vai(0);
    a.el.querySelector('[data-aiuto="avanti"]').focus({ preventScroll: true });
    requestAnimationFrame(segui);
  }

  /* la prima volta che si apre una sezione (su questo dispositivo) Marino arriva da solo e chiede se spiegarla; l'invito
     non blocca la pagina e non prende il fuoco. Le sezioni già viste sono in localStorage magic-hs.aiuto-visto. */
  var NOMI = { classifica: 'Classifica', nomenclatura: 'Nomenclatura', bolla: 'Bolla', profilo: 'Profilo' }, CHIAVE = 'magic-hs.aiuto-visto', attesaInvito = 0;
  function pronta() { return ACCESSO || !!(T.app && T.app.utente && T.app.utente()); }
  function giaViste() {
    try { var l = JSON.parse(localStorage.getItem(CHIAVE) || '[]'); return Array.isArray(l) ? l : []; } catch (e) { return null; }   // null: senza archivio, niente inviti
  }
  function segnaVista(v) {
    var l = giaViste();
    if (!l || l.indexOf(v) >= 0) return;
    l.push(v);
    try { localStorage.setItem(CHIAVE, JSON.stringify(l)); } catch (e) { /* senza archivio */ }
  }
  function invita(v) {
    crea(v, true);
    segnaVista(v);
    var el = aperto.el;
    el.querySelector('#aiuto-titolo').textContent = 'Ciao, sono Marino!';
    el.querySelector('#aiuto-testo').textContent = v === 'accesso' ? 'Sono il gabbiano di MAGIC HS. Vuoi che ti presenti l\'app? Bastano pochi passi.'
      : 'Vuoi che ti spieghi la sezione ' + NOMI[v] + '? Bastano pochi passi.';
    el.querySelector('[data-aiuto="indietro"]').hidden = true;
    el.querySelector('[data-aiuto="no"]').hidden = false;
    el.querySelector('[data-aiuto="avanti"]').innerHTML = T.icona('spunta') + (v === 'accesso' ? 'Sì, presentamela' : 'Sì, spiegami');
  }
  function forseInvita() {
    clearTimeout(attesaInvito);
    var v = vista(), l = giaViste();
    if (!PASSI[v] || !l || l.indexOf(v) >= 0) return;
    attesaInvito = setTimeout(function () {
      if (vista() !== v || aperto) return;
      // pagina non ancora pronta, una finestra aperta o la scheda del browser in secondo piano: si riprova tra poco
      if (document.querySelector('.velo') || document.hidden || !pronta()) { forseInvita(); return; }
      invita(v);
    }, 1500);
  }
  function chiudi() {
    if (!aperto) return;
    var a = aperto, el = a.el;
    aperto = null;
    document.documentElement.classList.remove('con-aiuto');
    if (a.prima && a.prima.focus && document.contains(a.prima)) a.prima.focus({ preventScroll: true });
    if (ridotto()) { el.remove(); return; }
    el.classList.add('parte');
    el.querySelector('.aiuto-gabbiano').classList.add('vola');
    setTimeout(function () { el.remove(); }, 700);
  }

  /* ------------------------------------------------------------------ un passo */
  function vai(i) {
    var a = aperto, n = a.passi.length;
    if (i < 0 || i >= n) return;
    a.i = i; a.fermo = 0; a.target = null;
    var p = a.passi[i], el = a.el;
    el.querySelector('#aiuto-titolo').textContent = p.t;
    el.querySelector('.aiuto-passo').textContent = (i + 1) + ' di ' + n;
    el.querySelector('#aiuto-testo').textContent = p.d;
    el.querySelector('[data-aiuto="indietro"]').hidden = i === 0;
    el.querySelector('[data-aiuto="segnala"]').hidden = i !== n - 1 || !T.segnala;
    el.querySelector('[data-aiuto="avanti"]').innerHTML = i === n - 1 ? T.icona('spunta') + 'Fine' : 'Avanti' + T.icona('indietro', 'gira');
    var g = el.querySelector('.aiuto-gabbiano');
    if (i > 0) { g.classList.remove('salta', 'parla'); void g.offsetWidth; g.classList.add('salta', 'parla'); }
    var t = bersaglio();
    if (t) scorri(t);
    illumina();
  }
  function bersaglio() {
    var a = aperto, p = a.passi[a.i];
    if (!p.e) return null;
    if (!a.target || !visibile(a.target)) a.target = p.e();      // la pagina si può ridisegnare: si ritrova
    return a.target;
  }
  function fisso(e) {
    for (; e && e !== document.body; e = e.parentElement) { var s = getComputedStyle(e).position; if (s === 'fixed' || s === 'sticky') return true; }
    return false;
  }
  /* porta l'elemento nello spazio libero tra la barra in alto (se resta ferma) e il fumetto */
  function scorri(t) {
    if (fisso(t)) return;
    var barra = document.querySelector('.barra'), alto = barra && getComputedStyle(barra).position === 'sticky' ? barra.getBoundingClientRect().bottom : 0;
    var posto = aperto.el.querySelector('.aiuto-posto'), basso = window.innerHeight - posto.offsetHeight - margineBasso() - 16;
    var r = t.getBoundingClientRect(), spazio = basso - alto - 16;
    var cima = r.height <= spazio ? alto + 8 + (spazio - r.height) / 2 : alto + 12;
    window.scrollBy({ top: r.top - cima, behavior: ridotto() ? 'auto' : 'smooth' });
  }
  function margineBasso() {
    var s = document.querySelector('.schede');
    return s && getComputedStyle(s).position === 'fixed' ? window.innerHeight - s.getBoundingClientRect().top : 0;
  }

  /* ------------------------------------------------------------------ luce e posto del fumetto, a ogni fotogramma */
  function segui() {
    if (!aperto) return;
    illumina();
    requestAnimationFrame(segui);
  }
  function illumina() {
    var a = aperto, luce = a.el.querySelector('.aiuto-luce'), t = bersaglio();
    if (!t) luce.classList.add('senza');
    else {
      var r = t.getBoundingClientRect(), m = 6;
      luce.classList.remove('senza');
      luce.style.top = (r.top - m) + 'px'; luce.style.left = (r.left - m) + 'px';
      luce.style.width = (r.width + 2 * m) + 'px'; luce.style.height = (r.height + 2 * m) + 'px';
      // fumetto in basso; in alto se copre l'elemento (deciso a pagina ferma, per non saltare durante lo scorrimento)
      var y = Math.round(window.scrollY);
      if (y === a.y) a.fermo++; else { a.fermo = 0; a.y = y; }
      if (a.fermo === 6) {
        var posto = a.el.querySelector('.aiuto-posto'), h = posto.offsetHeight, vh = window.innerHeight, barra = document.querySelector('.barra');
        var su = Math.max(0, barra ? barra.getBoundingClientRect().bottom : 0) + 12, giu = vh - margineBasso() - h - 12;
        var copreGiu = r.bottom > giu && r.top < vh, copreSu = r.top < su + h;
        posto.style.setProperty('--aiuto-alto', su + 'px');
        posto.classList.toggle('in-alto', copreGiu && !copreSu);
      }
    }
  }

  /* ------------------------------------------------------------------ eventi */
  tasto.addEventListener('click', apri);
  document.addEventListener('click', function (ev) {
    if (!aperto) return;
    var b = ev.target.closest('[data-aiuto]');
    if (!b) return;
    var k = b.getAttribute('data-aiuto');
    if (k === 'chiudi' || k === 'no') chiudi();
    else if (k === 'segnala') { chiudi(); if (T.segnala) T.segnala(); }
    else if (aperto.invito) { if (k === 'avanti') inizia(false); }                    // «Sì, spiegami»
    else if (k === 'indietro') vai(aperto.i - 1);
    else if (k === 'avanti') { if (aperto.i === aperto.passi.length - 1) chiudi(); else vai(aperto.i + 1); }
  });
  document.addEventListener('keydown', function (ev) {
    if (!aperto || aperto.invito) {                               // l'invito non prende i tasti, tranne Esc e ?
      var t = ev.target, campo = t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
      if (ev.key === '?' && !ev.ctrlKey && !ev.metaKey && !ev.altKey && !campo && visibile(tasto)) { ev.preventDefault(); apri(); }
      else if (aperto && ev.key === 'Escape' && !campo) { ev.preventDefault(); chiudi(); }
      return;
    }
    if (ev.key === 'Escape') { ev.preventDefault(); chiudi(); }
    else if (ev.key === 'ArrowRight') { ev.preventDefault(); if (aperto.i < aperto.passi.length - 1) vai(aperto.i + 1); }
    else if (ev.key === 'ArrowLeft') { ev.preventDefault(); vai(aperto.i - 1); }
    else if (ev.key === 'Tab') {                                  // il fuoco resta nel fumetto
      var b = Array.prototype.filter.call(aperto.el.querySelectorAll('button'), visibile);
      if (!b.length) return;
      if (ev.shiftKey && document.activeElement === b[0]) { ev.preventDefault(); b[b.length - 1].focus(); }
      else if (!ev.shiftKey && document.activeElement === b[b.length - 1]) { ev.preventDefault(); b[0].focus(); }
      else if (!aperto.el.contains(document.activeElement)) { ev.preventDefault(); b[0].focus(); }
    }
  }, true);
  /* il tasto c'è in tutte le sezioni tranne Gestione; cambiando sezione Marino se ne va (e nella nuova, la prima volta, si presenta) */
  function aggiorna() { var v = vista(); tasto.hidden = !PASSI[v]; if (aperto && aperto.vista !== v) chiudi(); forseInvita(); }
  var osserva = new MutationObserver(aggiorna);
  Array.prototype.forEach.call(document.querySelectorAll('main > section[id^="view-"]'), function (s) { osserva.observe(s, { attributes: true, attributeFilter: ['hidden'] }); });
  aggiorna();
})();
