/* MAGIC HS - vista Bolla: simulazione di una bolla d'importazione (immissione in libera pratica) o d'esportazione, con
   più articoli, salvata nel profilo (/api/bolle) e stampabile. I calcoli sono in js/calcolo.js (TARIC_CALCOLO), le
   misure del giorno della bolla vengono da app.js (T.app.misureBolla), il cambio doganale del mese da /api/cambio.
   I campi non si ridisegnano mentre si scrive: si aggiornano solo le parti calcolate (opzioni dell'articolo e risultati). */
(function () {
  'use strict';
  var T = window.TARIC, esc = T.esc, K = window.TARIC_CALCOLO;
  var el = document.getElementById('view-bolla');
  var vista = T.viste = T.viste || {};
  var st = { elenco: null, b: null, cambi: {}, msg: '', msgOk: false, salvata: true, timer: 0, ultimo: null, calcolatore: null };
  var VALUTE = ['EUR', 'USD', 'CNY', 'GBP', 'CHF', 'JPY', 'TRY', 'INR', 'KRW', 'HKD', 'CAD', 'AUD', 'SGD', 'THB', 'MYR', 'IDR', 'PHP',
    'PLN', 'CZK', 'HUF', 'RON', 'SEK', 'NOK', 'DKK', 'ISK', 'ILS', 'MXN', 'BRL', 'ZAR', 'NZD'];
  var IVA = [[22, '22 %'], [10, '10 %'], [5, '5 %'], [4, '4 %'], [0, 'esente o non imponibile']];
  // IVA liquidata (B00) ma non pagata: si detrae con il codice (tabella dei tributi ADM; circolare ADM 22/2022)
  var IVA_NON_PAGATA = [['', 'pagata'], ['406', '406 · non pagata: dichiarazione d\'intento (art. 8, primo comma, lett. c, DPR 633/72)'],
    ['407', '407 · non pagata: oro o argento (art. 70, quinto comma, DPR 633/72; art. 3, comma 10, L. 7/2000)']];
  var C = window.TARIC_CODICI || { imballaggi: [], natura: [], modi: [], aggiunte: [], detrazioni: [], metodi: [], qualifica: [], pagamento: [] };
  // tipi di documento precedente più usati negli scarichi (DE 12 01): si può scriverne un altro
  var DOC_PRECEDENTI = [['337', 'Dichiarazione di custodia temporanea'], ['355', 'Dichiarazione sommaria di entrata']];
  // documenti di trasporto (codici della banca dati TARIC, DE 12 05)
  var DOC_TRASPORTO = ['N705', 'N714', 'N740', 'N741', 'N730', 'N720', 'N722', 'N703', 'N704', 'N710', 'N750', 'N760', 'N785', 'N787'];
  /* riferimenti dei campi: dato (DE) e casella del vecchio DAU. Importazione: tracciato ADM della H1 in versione EUCDM 6.2
     (obbligatoria dal 13 luglio 2026); esportazione: allegato B del Reg. delegato (UE) 2015/2446, colonna B1. */
  var RIF_IMP = { valuta: 'DE 14 05 · c. 22', tassoContratto: 'DE 14 09 · c. 23', mittente: 'DE 13 01 · c. 2', venditore: 'DE 13 08 · c. 2',
    destinatario: 'DE 13 04 · c. 8', acquirente: 'DE 13 09 · c. 8', dichiarante: 'DE 13 05 · c. 14', rappresentante: 'DE 13 06 · c. 14',
    qualifica: 'DE 13 06 030', incoterm: 'DE 14 01 · c. 20', luogo: 'DE 14 01 036/037', modoTrasporto: 'DE 19 03 · c. 25', container: 'DE 19 01 · c. 19',
    natura: 'DE 99 05 · c. 24', paeseSpedizione: 'DE 16 06 · c. 15a', provincia: 'DE 16 04 · c. 17b', ubicazione: 'DE 16 15 · c. 30',
    docTrasporto: 'DE 12 05', fattura: 'DE 12 03 · c. 44', nolo: 'DE 14 04, codice AK · c. 45', metodo: 'DE 14 10 · c. 43', indicatori: 'DE 14 07 · c. 45',
    statSpese: 'DE 99 06 · c. 46', codice: 'DE 18 09 · c. 33', origine: 'DE 16 08 · c. 34a', originePref: 'DE 16 09 · c. 34b', descrizione: 'DE 18 05 · c. 31',
    valore: 'DE 14 08 · c. 42', netto: 'DE 18 01 · c. 38', lordo: 'DE 18 04 · c. 35', quantita: 'DE 18 02 · c. 41', colli: 'DE 18 06 · c. 31',
    regime: 'DE 14 11 · c. 36', addizionali: 'DE 18 09 059 · c. 33', iva: 'DE 14 03, codice B00 · c. 47', aggiunte: 'DE 14 04 · c. 45',
    documenti: 'DE 12 03 · c. 44', statistico: 'DE 99 06 · c. 46', contingente: 'DE 99 01 · c. 39',
    dilazione: 'c. 48', mezzoArrivo: 'c. 18', metodoPagamento: 'c. 47, colonna MP', scarico: 'DE 12 01 · c. 40', regimiAggiuntivi: 'DE 11 10 · c. 37' };
  var RIF_EXP = { valuta: 'DE 4/10 · c. 22', mittente: 'DE 3/1 · c. 2', destinatario: 'DE 3/9 · c. 8', dichiarante: 'DE 3/17 · c. 14',
    rappresentante: 'DE 3/19 · c. 14', qualifica: 'DE 3/21', incoterm: 'DE 4/1 · c. 20', luogo: 'DE 4/1', modoTrasporto: 'DE 7/4 · c. 25',
    container: 'DE 7/2 · c. 19', natura: 'DE 8/5 · c. 24', ubicazione: 'DE 5/23 · c. 30', uscita: 'DE 5/12 · c. 29', fattura: 'DE 2/3 · c. 44',
    trasporto: 'DE 8/6 · c. 46', codice: 'DE 6/14 · c. 33', origine: 'DE 5/8 · c. 17a', descrizione: 'DE 6/8 · c. 31', valore: 'DE 4/14 · c. 42',
    netto: 'DE 6/1 · c. 38', lordo: 'DE 6/5 · c. 35', quantita: 'DE 6/2 · c. 41', colli: 'DE 6/9-6/11 · c. 31', documenti: 'DE 2/3 · c. 44',
    statistico: 'DE 8/6 · c. 46' };
  /* il testo di ogni etichetta in un solo elemento, così i campi della stessa riga stanno in basso alla stessa altezza */
  function allinea(h) { return h.replace(/<label( class="largo")?>([\s\S]*?)(?=<input|<select|<textarea|<span class="con-valuta")/g, '<label$1><span class="et-c">$2</span>'); }
  function rif(k) { return (imp() ? RIF_IMP : RIF_EXP)[k] || ''; }
  function de(k) { var r = rif(k); return r ? ' <span class="de">' + esc(r) + '</span>' : ''; }
  function scelta(f, lista, valore, vuota, attr) {
    return '<select class="campo" data-f="' + f + '"' + (attr || '') + '>' + (vuota !== undefined ? '<option value="">' + esc(vuota) + '</option>' : '') +
      lista.map(function (x) { return '<option value="' + esc(x[0]) + '"' + (String(valore || '') === String(x[0]) ? ' selected' : '') + '>' + esc(x[0] + ' · ' + x[1]) + '</option>'; }).join('') + '</select>';
  }
  var INCOTERM = [['EXW', 'franco fabbrica'], ['FCA', 'franco vettore'], ['FAS', 'franco lungo bordo'], ['FOB', 'franco a bordo'],
    ['CFR', 'costo e nolo'], ['CIF', 'costo, assicurazione e nolo'], ['CPT', 'trasporto pagato fino a'], ['CIP', 'trasporto e assicurazione pagati fino a'],
    ['DAP', 'reso al luogo di destinazione'], ['DPU', 'reso al luogo di destinazione scaricato'], ['DDP', 'reso sdoganato']];
  function completa(d) {                    // bolle salvate prima dei campi nuovi
    ['nolo', 'assicurazione', 'inoltro', 'trasporto', 'oltre', 'statSpese'].forEach(function (x) { d[x] = d[x] || { importo: '', valuta: 'EUR' }; });
    d.docTrasporto = d.docTrasporto || { tipo: '', numero: '' };
    d.scarico = d.scarico || { tipo: '', riferimento: '', articolo: '', colli: '', quantita: '', unita: '' };
    d.indicatori = d.indicatori || {};
    d.metodo = d.metodo || '1';
    d.articoli = d.articoli || [];
    return d;
  }

  function app() { return T.app; }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function oggiIso() { var d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function dati() { return st.b.dati; }
  function imp() { return st.b.tipo === 'import'; }
  function giorno() { var g = parseInt(String(dati().data || '').replace(/-/g, ''), 10); return g > 19000101 ? g : 0; }
  function mese() { return String(dati().data || '').slice(0, 7); }
  function euro(v) { return v === null || v === undefined || isNaN(v) ? '–' : app().euro(v); }
  function dataIt(s) { return s ? s.slice(8, 10) + '/' + s.slice(5, 7) + '/' + s.slice(0, 4) : ''; }
  function nIt(v, dec) { try { return Number(v).toLocaleString('it-IT', { minimumFractionDigits: dec || 0, maximumFractionDigits: dec === undefined ? 3 : dec }); } catch (e) { return String(v); } }
  function prima(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }

  function nuovoArticolo(paese) {
    return { codice: '', descrizione: '', origine: paese || '', valore: '', aggiunte: '', deduzioni: '', netto: '', lordo: '', quantita: '', quantitaDazio: '',
      regime: 'base', addizionali: [], documenti: [], iva: 22, ivaMotivo: '', ivaNonPagata: '', dazioManuale: '', altriManuale: '',
      codAggiunte: '', codDeduzioni: '', colliNumero: '', colliTipo: '', colliMarchi: '', regimiAggiuntivi: '' };
  }
  function nuovaBolla(tipo) {
    return { id: null, tipo: tipo, riferimento: '', dati: { data: oggiIso(), valuta: 'EUR', nolo: { importo: '', valuta: 'EUR' }, assicurazione: { importo: '', valuta: 'EUR' },
      ripartizione: 'valore', inoltro: { importo: '', valuta: 'EUR' }, trasporto: { importo: '', valuta: 'EUR' }, oltre: { importo: '', valuta: 'EUR' },
      statSpese: { importo: '', valuta: 'EUR' }, paese: '', mittente: '', venditore: '', destinatario: '', acquirente: '', dichiarante: '',
      rappresentante: '', qualifica: '', incoterm: '', luogo: '', cambioManuale: '', tassoContratto: '', paeseSpedizione: '', provincia: '',
      modoTrasporto: '', container: '', natura: '11', ubicazione: '', uscita: '', docTrasporto: { tipo: '', numero: '' }, fattura: '',
      metodo: '1', indicatori: {}, articoli: [], ufficio: '', mrn: '', dilazione: '', metodoPagamento: '', mezzoArrivo: '',
      scarico: { tipo: '', riferimento: '', articolo: '', colli: '', quantita: '', unita: '' } } };
  }

  vista.bolla = {
    mostra: function () {
      if (!st.elenco) caricaElenco();
      // aperta da «Ricalcola con i dati TARIC del …»: /?dati=AAAA-MM-01&bolla=N#bolla
      var q = (function () { try { return new URLSearchParams(location.search).get('bolla'); } catch (e) { return null; } })();
      if (q && /^\d+$/.test(q) && !st.daIndirizzo) { st.daIndirizzo = true; apri(q); }
      disegna();
    },
    /* le misure di un capitolo sono arrivate: ricalcola */
    capitolo: function () { if (st.b && !el.hidden) { disegnaOpzioniTutte(); calcola(); } },
    /* «Aggiungi alla bolla» dalla scheda del codice */
    aggiungi: function (codice, paese, flusso) {
      var tipo = flusso === 'export' ? 'export' : 'import';
      st.calcolatore = null;
      if (st.b && st.b.tipo !== tipo && !st.salvata &&
          !window.confirm('La bolla aperta ha modifiche non salvate: aprire una nuova ' + (tipo === 'export' ? 'esportazione' : 'importazione') + ' lo stesso?')) return false;
      if (!st.b || st.b.tipo !== tipo) { st.b = nuovaBolla(tipo); st.salvata = true; }
      var a = nuovoArticolo(paese || dati().paese);
      a.codice = codice;
      var vuoto = dati().articoli.filter(function (x) { return !x.codice; })[0];
      if (vuoto) { vuoto.codice = codice; if (paese) vuoto.origine = paese; } else dati().articoli.push(a);
      st.salvata = false;
      st.msg = 'Articolo ' + app().grp(codice) + ' aggiunto alla bolla.'; st.msgOk = true;
      if (!el.hidden) disegna();
      return true;
    }
  };

  /* ------------------------------------------------------------------ elenco e salvataggio */
  function caricaElenco() {
    return T.api('GET', '/api/bolle').then(function (r) { st.elenco = r.voci; if (!st.b && !st.calcolatore) disegna(); }, function () { st.elenco = []; });
  }
  function apri(id) {
    T.api('GET', '/api/bolle/' + id).then(function (r) {
      st.b = { id: r.id, tipo: r.tipo, riferimento: r.riferimento, dati: completa(r.dati) };
      st.salvata = true; st.msg = ''; disegna(); caricaCambio();
    }, function (e) { st.msg = e.errore || 'Bolla non disponibile.'; st.msgOk = false; disegna(); });
  }
  function salva() {
    var corpo = { riferimento: st.b.riferimento || '', dati: dati() };
    var p = st.b.id ? T.api('PUT', '/api/bolle/' + st.b.id, corpo) : T.api('POST', '/api/bolle', { tipo: st.b.tipo, riferimento: corpo.riferimento, dati: corpo.dati });
    return p.then(function (r) { st.b.id = r.id; st.salvata = true; messaggio('Bolla salvata.', true); caricaElenco(); },
      function (e) { messaggio(e.errore || 'Bolla non salvata.', false); });
  }
  function messaggio(t, ok) { st.msg = t; st.msgOk = ok; var m = el.querySelector('#b-msg'); if (m) m.innerHTML = rigaMsg(); }
  function rigaMsg() { return st.msg ? '<p class="' + (st.msgOk ? 'esito-ok' : 'errore') + '">' + esc(st.msg) + '</p>' : ''; }

  /* ------------------------------------------------------------------ cambio doganale */
  function chiaveCambio() { return dati().valuta + '|' + mese(); }
  function caricaCambio() {
    if (!st.b || dati().valuta === 'EUR' || !giorno()) { disegnaCambio(); calcola(); return; }
    var k = chiaveCambio();
    if (st.cambi[k]) { disegnaCambio(); calcola(); return; }
    st.cambi[k] = { attesa: true };
    disegnaCambio();
    T.api('GET', '/api/cambio?valuta=' + encodeURIComponent(dati().valuta) + '&data=' + encodeURIComponent(dati().data))
      .then(function (r) { st.cambi[k] = r; }, function (e) { st.cambi[k] = { errore: e.errore || 'Cambio non disponibile.', codice: e.codice || '' }; })
      .then(function () { disegnaCambio(); calcola(); });
  }
  function cambioAttuale() { return st.b && dati().valuta !== 'EUR' ? st.cambi[chiaveCambio()] : null; }
  function disegnaCambio() {
    var c = el.querySelector('#b-cambio');
    if (!c) return;
    var v = dati().valuta, r = cambioAttuale();
    if (v === 'EUR') c.innerHTML = '<p class="nota">Valori in euro: nessun cambio.</p>';
    else if (!r || r.attesa) c.innerHTML = '<p class="nota">Cerco il cambio doganale…</p>';
    else if (r.errore && r.codice === 'valuta_non_quotata') c.innerHTML = '<p class="avviso">' + esc(r.errore) + '</p><div class="b-campi">' +
      '<label><span class="et-c">Cambio scritto a mano: 1 € = … ' + esc(v) + '</span><input class="campo" data-f="cambioManuale" value="' + esc(dati().cambioManuale || '') + '" inputmode="decimal" autocomplete="off" placeholder="per esempio 4,0712"></label></div>';
    else if (r.errore) c.innerHTML = '<p class="errore">' + esc(r.errore) + ' <button class="link" type="button" data-b="riprova-cambio">Riprova</button></p>';
    else c.innerHTML = '<p class="esito-ok">1 € = ' + esc(nIt(r.tasso, 4)) + ' ' + esc(v) + ' · cambio doganale di ' + esc(meseIt(r.mese)) + ' (' + esc(r.fonte) + ')</p>';
  }
  var meseIt = T.meseIt;

  /* ------------------------------------------------------------------ misure e calcolo */
  // le estrazioni del TARIC hanno solo le misure valide dal loro giorno in poi: per una data precedente ai dati non si calcola
  function giornoDati() { return parseInt(String(app().dati().iso || '').replace(/-/g, ''), 10) || 0; }
  /* data della bolla fuori dal mese dei dati aperti: il tasto per ricalcolarla con i dati TARIC di quel mese */
  function fuoriMese() { return giorno() > 0 && (passato() || (app().storico() && giorno() >= app().giornoMeseDopo())); }
  function disegnaStorico() {
    var c = el.querySelector('#b-storico');
    if (!c) return;
    if (!fuoriMese()) { c.innerHTML = ''; return; }
    var s = app().storicoPer(giorno(), disegnaStorico);
    if (s.attesa) c.innerHTML = '<p class="nota">Cerco i dati TARIC di quel mese…</p>';
    else if (s.errore) c.innerHTML = '<p class="nota">' + esc(s.errore) + '</p>';
    else if (s.versione === app().dati().iso) c.innerHTML = '';
    else c.innerHTML = '<div class="fila"><button class="btn pri" type="button" data-b="storico" data-v="' + esc(s.attuale ? '' : s.versione) + '">' + T.icona('calendario') +
      (s.attuale ? 'Ricalcola con i dati TARIC in uso' : 'Ricalcola con i dati TARIC del ' + esc(dataIt(s.versione))) + '</button><span class="nota">La bolla si salva e si riapre con quei dati.</span></div>';
  }
  function passato() { return giorno() > 0 && giorno() < giornoDati(); }
  function misure(a) {
    var paese = a.origine || dati().paese;
    if (!giorno()) return { errore: 'Indica la data della bolla.' };
    if (passato()) return { passato: true, errore: 'Misure del ' + dataIt(dati().data) + ' non disponibili con i dati TARIC del ' + app().dati().it + '.' };
    return app().misureBolla(a.codice, imp() ? 'import' : 'export', paese, giorno());
  }
  function contesto() {
    var cambi = {}, r = cambioAttuale(), man = K.numeroIt(dati().cambioManuale), contr = K.numeroIt(dati().tassoContratto);
    if (dati().valuta !== 'EUR' && contr > 0) cambi[dati().valuta] = { tasso: contr, contratto: true };     // DE 14 09, con il 26AO
    else if (r && r.tasso) cambi[dati().valuta] = { tasso: r.tasso };
    else if (r && r.codice === 'valuta_non_quotata' && man > 0) cambi[dati().valuta] = { tasso: man, manuale: true };
    return { misure: misure, cambi: cambi, dataDati: app().dati().iso, fmtDazio: function (d) { return d ? app().fmtDazio(d) : 'esente'; },
      nomeMisura: function (m) { return app().tipoMisura(m.t); } };
  }
  function calcola() {
    clearTimeout(st.timer);
    if (!st.b) return;
    var ctx = contesto();
    st.ultimo = imp() ? K.calcolaImport(dati(), ctx) : K.calcolaExport(dati(), ctx);
    var e = el.querySelector('#b-esito');
    if (e) e.innerHTML = imp() ? esitoImport(st.ultimo) : esitoExport(st.ultimo);
    segnaConflitti(st.ultimo);
    var s = el.querySelector('#b-stato');
    if (s) s.textContent = st.salvata ? '' : 'modifiche non salvate';
  }
  function piuTardi() { clearTimeout(st.timer); st.timer = setTimeout(calcola, 250); }

  /* ------------------------------------------------------------------ disegno */
  function disegna() {
    if (st.calcolatore) { calcolatore(); return; }
    if (!st.b) { el.innerHTML = elenco(); return; }
    var h = '<div class="bolla-barra fila"><button class="btn sm" type="button" data-b="chiudi">' + T.icona('indietro') + 'Le bolle</button>' +
      '<h2 class="bolla-titolo">' + (imp() ? 'Bolla d\'importazione' : 'Bolla d\'esportazione') + '<span class="st ambra">simulazione</span></h2>' +
      '<span class="dx fila"><span id="b-stato" class="nota"></span>' +
      '<button class="btn sm pri" type="button" data-b="salva">' + T.icona('spunta') + 'Salva</button>' +
      '<button class="btn sm" type="button" data-b="stampa">' + T.icona('documento') + 'Stampa o PDF</button>' +
      '<button class="btn sm" type="button" data-b="duplica">' + T.icona('copia') + 'Duplica</button>' +
      (st.b.id ? '<button class="btn sm" type="button" data-b="elimina">' + T.icona('cestino') + 'Elimina</button>' : '') + '</span></div>' +
      '<div id="b-msg">' + rigaMsg() + '</div>';
    h += '<div class="foglio"><div class="box"><div class="lab">' + T.icona('documento') + 'Intestazione</div>' + intestazione() + '</div></div>';
    h += '<div id="b-articoli">' + dati().articoli.map(articolo).join('') + '</div>';
    h += '<div class="fila"><button class="btn" type="button" data-b="aggiungi">' + T.icona('piu') + 'Aggiungi un articolo</button></div>';
    h += '<div class="foglio"><div class="box"><div class="lab">' + T.icona(imp() ? 'percento' : 'pacco') + (imp() ? 'Tributi <span class="de">DE 14 03 · c. 47</span>' : 'Riepilogo') + '</div><div id="b-esito"></div></div></div>';
    h += '<div id="bolla-stampa" class="solo-stampa"></div>';
    el.innerHTML = allinea(h);
    disegnaCambio();
    disegnaStorico();
    disegnaOpzioniTutte();
    calcola();
  }

  function elenco() {
    var h = '<div class="foglio"><div class="box"><div class="lab">' + T.icona('pacco') + 'Bolla simulata</div>' +
      '<p class="nota">Prepara una bolla con più articoli e i dati TARIC del ' + esc(app().dati().it) + ': valore in dogana, dazi, antidumping, IVA e documenti. ' +
      'Quello che non si può calcolare con certezza resta in evidenza, senza stime.</p>' + rigaMsg() +
      '<div class="fila"><button class="btn pri" type="button" data-b="nuova" data-tipo="import">' + T.icona('piu') + 'Nuova importazione</button>' +
      '<button class="btn" type="button" data-b="nuova" data-tipo="export">' + T.icona('piu') + 'Nuova esportazione</button></div></div></div>';
    h += '<div class="foglio"><div class="box"><div class="lab">' + T.icona('nave') + 'Costo di spedizione</div>' +
      '<p class="nota">Costo indicativo di una spedizione con DHL Express, da peso e misure dei colli, anche senza una bolla.</p>' +
      '<div class="fila"><button class="btn" type="button" data-b="trasporto">' + T.icona('nave') + 'Calcola il trasporto</button></div></div></div>';
    var L = st.elenco;
    h += '<div class="foglio"><div class="box"><div class="lab">' + T.icona('storico') + 'Le tue bolle<span class="dx">' + (L ? L.length : '') + '</span></div>';
    if (!L) h += '<p class="vuoto">Carico…</p>';
    else if (!L.length) h += '<p class="vuoto illustrato">' + (T.vignetta ? T.vignetta('gru') : '') + 'Nessuna bolla salvata.</p>';
    else h += '<div class="scorri"><table class="tab"><thead><tr><th>Riferimento</th><th>Tipo</th><th>Data</th><th class="n">Articoli</th><th>Modificata</th><th></th></tr></thead><tbody>' +
      L.map(function (v) {
        return '<tr><td>' + esc(v.riferimento || 'senza riferimento') + '</td><td data-l="Tipo">' + (v.tipo === 'import' ? 'importazione' : 'esportazione') + '</td>' +
          '<td data-l="Data">' + esc(dataIt(v.data || '')) + '</td><td class="n" data-l="Articoli">' + (v.articoli || 0) + '</td><td data-l="Modificata">' + esc(T.dataOra(v.modificata)) + '</td>' +
          '<td class="azioni"><button class="btn sm" type="button" data-b="apri" data-id="' + v.id + '">Apri</button>' +
          '<button class="btn sm" type="button" data-b="elimina-elenco" data-id="' + v.id + '">Elimina</button></td></tr>';
      }).join('') + '</tbody></table></div>';
    return h + '</div></div>';
  }

  function testo(etichetta, f, valore) {
    return '<label>' + etichetta + '<textarea class="campo" rows="2" maxlength="300" data-f="' + f + '" placeholder="nome, indirizzo, EORI">' + esc(valore || '') + '</textarea></label>';
  }
  function campo(etichetta, f, valore, extra) {
    return '<label>' + etichetta + '<input class="campo" data-f="' + f + '" value="' + esc(valore === undefined || valore === null ? '' : valore) + '"' + (extra || '') + '></label>';
  }
  function opzioniPaesi(scelto) {
    var fr = app().frequenti(), tutti = app().paesi();
    return '<option value="">scegli…</option><optgroup label="Più frequenti">' +
      fr.map(function (x) { return '<option value="' + esc(x) + '"' + (x === scelto ? ' selected' : '') + '>' + esc(app().nomeArea(x)) + ' (' + esc(x) + ')</option>'; }).join('') +
      '</optgroup><optgroup label="Tutti">' +
      tutti.map(function (p) { return '<option value="' + esc(p[1]) + '"' + (p[1] === scelto && fr.indexOf(scelto) < 0 ? ' selected' : '') + '>' + esc(p[0]) + ' (' + esc(p[1]) + ')</option>'; }).join('') + '</optgroup>';
  }
  function sceltaValuta(f, x) {
    var v = dati().valuta;
    return '<select class="campo corto" data-f="' + f + '">' + (v === 'EUR' ? ['EUR'] : ['EUR', v]).map(function (c) {
      return '<option' + ((x.valuta || 'EUR') === c ? ' selected' : '') + '>' + esc(c) + '</option>';
    }).join('') + '</select>';
  }
  function intestazione() {
    var d = dati(), h = '<div class="b-campi">' +
      campo('Riferimento interno (pratica)', 'riferimento', st.b.riferimento, ' maxlength="120" autocomplete="off"') +
      '<label>Data prevista della bolla<input class="campo" type="date" data-f="data" value="' + esc(d.data || '') + '"></label>' +
      '<label>Valuta della fattura' + de('valuta') + '<input class="campo" data-f="valuta" list="b-valute" value="' + esc(d.valuta) + '" maxlength="3" autocomplete="off" autocapitalize="characters"></label>' +
      '<datalist id="b-valute">' + VALUTE.map(function (c) { return '<option value="' + c + '"></option>'; }).join('') + '</datalist>' +
      '<label>' + (imp() ? 'Origine predefinita' : 'Destinazione predefinita') + '<select class="campo" data-f="paese">' + opzioniPaesi(d.paese) + '</select></label></div>' +
      '<div id="b-cambio"></div><div id="b-storico"></div>';
    if (imp() && (d.valuta !== 'EUR' || String(d.tassoContratto || '').trim()))
      h += '<div class="b-campi">' + campo('Tasso fissato dal contratto: 1 € = … ' + esc(d.valuta) + de('tassoContratto'), 'tassoContratto', d.tassoContratto,
        ' inputmode="decimal" autocomplete="off" placeholder="vuoto: cambio doganale del mese"') + '</div>';
    // i dati del prospetto di sintesi H1 che non servono ai calcoli: ufficio, MRN (con il codice a barre nella stampa), pagamento
    if (imp()) h += '<details class="piu b-sez" open><summary>Dichiarazione e pagamento</summary><div class="b-campi">' +
      campo('Ufficio doganale', 'ufficio', d.ufficio, ' maxlength="120" autocomplete="off" placeholder="codice e nome dell\'ufficio"') +
      campo('MRN, dopo l\'accettazione', 'mrn', d.mrn, ' maxlength="24" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="18 caratteri, nella stampa con il codice a barre"') +
      campo('Dilazione di pagamento' + de('dilazione'), 'dilazione', d.dilazione, ' maxlength="70" autocomplete="off" placeholder="autorizzazione o conto"') +
      '<label>Metodo di pagamento' + de('metodoPagamento') + '<input class="campo" data-f="metodoPagamento" list="b-pagamento" value="' + esc(d.metodoPagamento || '') +
        '" maxlength="1" autocomplete="off" autocapitalize="characters" placeholder="per esempio E"></label>' +
      '<datalist id="b-pagamento">' + (C.pagamento || []).map(function (x) { return '<option value="' + esc(x[0]) + '">' + esc(x[0] + ' · ' + x[1]) + '</option>'; }).join('') + '</datalist>' +
      '</div></details>';
    // soggetti
    h += '<details class="piu b-sez" open><summary>Soggetti</summary><div class="b-campi">' +
      testo('Esportatore' + de('mittente'), 'mittente', d.mittente) +
      (imp() ? testo('Venditore, se diverso dall\'esportatore' + de('venditore'), 'venditore', d.venditore) : '') +
      testo((imp() ? 'Importatore' : 'Destinatario') + de('destinatario'), 'destinatario', d.destinatario) +
      (imp() ? testo('Acquirente, se diverso dall\'importatore' + de('acquirente'), 'acquirente', d.acquirente) : '') +
      testo('Dichiarante' + de('dichiarante'), 'dichiarante', d.dichiarante) +
      testo('Rappresentante doganale, se c\'è' + de('rappresentante'), 'rappresentante', d.rappresentante) +
      '<label>Qualifica del rappresentante' + de('qualifica') + scelta('qualifica', C.qualifica, d.qualifica, 'nessun rappresentante') + '</label></div></details>';
    // consegna, trasporto, documenti
    h += '<details class="piu b-sez" open><summary>Consegna, trasporto e documenti</summary><div class="b-campi">' +
      '<label>Condizioni di consegna' + de('incoterm') + '<select class="campo" data-f="incoterm"><option value="">non indicate</option>' + INCOTERM.map(function (x) {
        return '<option value="' + x[0] + '"' + (d.incoterm === x[0] ? ' selected' : '') + '>' + x[0] + ' · ' + x[1] + '</option>';
      }).join('') + '</select></label>' +
      campo('Luogo convenuto (UN/LOCODE o località)' + de('luogo'), 'luogo', d.luogo, ' maxlength="80" autocomplete="off"') +
      '<label>Modo di trasporto alla frontiera' + de('modoTrasporto') + scelta('modoTrasporto', C.modi, d.modoTrasporto, 'scegli…') + '</label>' +
      '<label>Container' + de('container') + scelta('container', [['0', 'merci non in container'], ['1', 'merci in container']], d.container, 'scegli…') + '</label>' +
      '<label class="largo">Natura della transazione' + de('natura') + scelta('natura', C.natura, d.natura, 'scegli…') + '</label>' +
      (imp() ? '<label>Paese di spedizione' + de('paeseSpedizione') + '<select class="campo" data-f="paeseSpedizione">' + opzioniPaesi(d.paeseSpedizione) + '</select></label>' +
        campo('Provincia di destinazione (sigla, SM per San Marino)' + de('provincia'), 'provincia', d.provincia, ' maxlength="2" autocomplete="off" autocapitalize="characters"') : '') +
      campo('Ubicazione delle merci' + de('ubicazione'), 'ubicazione', d.ubicazione, ' maxlength="120" autocomplete="off" placeholder="luogo autorizzato, magazzino, porto…"') +
      (imp() ? '' : campo('Ufficio di uscita (codice)' + de('uscita'), 'uscita', d.uscita, ' maxlength="8" autocomplete="off" autocapitalize="characters"')) +
      (imp() ? '<label>Documento di trasporto' + de('docTrasporto') + '<select class="campo" data-f="docTrasporto.tipo"><option value="">scegli…</option>' + DOC_TRASPORTO.map(function (c) {
        return '<option value="' + c + '"' + (d.docTrasporto.tipo === c ? ' selected' : '') + '>' + esc(c + ' · ' + (app().certificato(c) || '')) + '</option>';
      }).join('') + '</select></label>' + campo('Numero del documento di trasporto', 'docTrasporto.numero', d.docTrasporto.numero, ' maxlength="70" autocomplete="off"') : '') +
      (imp() ? campo('Identità del mezzo all\'arrivo' + de('mezzoArrivo'), 'mezzoArrivo', d.mezzoArrivo, ' maxlength="40" autocomplete="off" placeholder="tipo e identificativo, per esempio 40 AZ610"') : '') +
      campo('Fattura commerciale N380, numero' + de('fattura'), 'fattura', d.fattura, ' maxlength="70" autocomplete="off"') + '</div></details>';
    if (imp()) {
      var sc = d.scarico || {};
      h += '<details class="piu b-sez"' + (sc.tipo || sc.riferimento ? ' open' : '') + '><summary>Scarico (documento precedente)</summary><div class="b-campi">' +
        '<label>Tipo' + de('scarico') + '<input class="campo" data-f="scarico.tipo" list="b-precedenti" value="' + esc(sc.tipo || '') + '" maxlength="4" autocomplete="off" autocapitalize="characters" placeholder="per esempio 337"></label>' +
        '<datalist id="b-precedenti">' + DOC_PRECEDENTI.map(function (x) { return '<option value="' + x[0] + '">' + esc(x[0] + ' · ' + x[1]) + '</option>'; }).join('') + '</datalist>' +
        campo('Riferimento', 'scarico.riferimento', sc.riferimento, ' maxlength="70" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="per esempio l\'MRN della custodia temporanea"') +
        campo('Articolo', 'scarico.articolo', sc.articolo, ' maxlength="5" inputmode="numeric" autocomplete="off"') +
        campo('Numero di imballaggi', 'scarico.colli', sc.colli, ' maxlength="8" inputmode="numeric" autocomplete="off"') +
        campo('Quantità', 'scarico.quantita', sc.quantita, ' maxlength="16" inputmode="decimal" autocomplete="off"') +
        campo('Unità', 'scarico.unita', sc.unita, ' maxlength="8" autocomplete="off" placeholder="per esempio KGM"') + '</div></details>';
    }
    // valore
    if (!imp()) {
      h += '<details class="piu b-sez" open><summary>Valore statistico</summary><div class="b-campi">' +
        '<label>Trasporto e assicurazione fino al confine' + de('trasporto') + '<span class="con-valuta"><input class="campo" data-f="trasporto.importo" inputmode="decimal" autocomplete="off" value="' + esc(d.trasporto.importo) + '" placeholder="0,00">' + sceltaValuta('trasporto.valuta', d.trasporto) + '</span></label>' +
        '<label>Spese oltre il confine comprese nel prezzo<span class="con-valuta"><input class="campo" data-f="oltre.importo" inputmode="decimal" autocomplete="off" value="' + esc(d.oltre.importo) + '" placeholder="0,00">' + sceltaValuta('oltre.valuta', d.oltre) + '</span></label>' +
        '<label>Ripartizione sugli articoli<select class="campo" data-f="ripartizione"><option value="valore"' + (d.ripartizione !== 'massa' ? ' selected' : '') + '>in base al valore</option>' +
        '<option value="massa"' + (d.ripartizione === 'massa' ? ' selected' : '') + '>in base alla massa lorda</option></select></label></div>' +
        '<p class="nota">Valore statistico franco confine italiano: più il trasporto fino al confine se non è nel prezzo, meno quello oltre il confine se è compreso.</p></details>';
    } else {
      var ind = d.indicatori || {};
      var spunta = function (k, testoI) { return '<label class="spunta doc"><input type="checkbox" data-f="indicatori.' + k + '"' + (ind[k] ? ' checked' : '') + '> ' + esc(testoI) + '</label>'; };
      h += '<details class="piu b-sez" open><summary>Valore in dogana e spese</summary><div class="b-campi">' +
        '<label>Trasporto fino al confine UE' + de('nolo') + '<span class="con-valuta"><input class="campo" data-f="nolo.importo" inputmode="decimal" autocomplete="off" value="' + esc(d.nolo.importo) + '" placeholder="0,00">' + sceltaValuta('nolo.valuta', d.nolo) + '</span></label>' +
        '<label>Assicurazione fino al confine UE' + de('nolo') + '<span class="con-valuta"><input class="campo" data-f="assicurazione.importo" inputmode="decimal" autocomplete="off" value="' + esc(d.assicurazione.importo) + '" placeholder="0,00">' + sceltaValuta('assicurazione.valuta', d.assicurazione) + '</span></label>' +
        '<label>Ripartizione sugli articoli<select class="campo" data-f="ripartizione"><option value="valore"' + (d.ripartizione !== 'massa' ? ' selected' : '') + '>in base al valore</option>' +
        '<option value="massa"' + (d.ripartizione === 'massa' ? ' selected' : '') + '>in base alla massa lorda</option></select></label>' +
        '<label>Spese dal confine UE a destinazione (base IVA)<span class="con-valuta"><input class="campo" data-f="inoltro.importo" inputmode="decimal" autocomplete="off" value="' + esc(d.inoltro.importo) + '" placeholder="0,00">' + sceltaValuta('inoltro.valuta', d.inoltro) + '</span></label>' +
        '<label>Spese dal confine UE al confine italiano (solo valore statistico)' + de('statSpese') + '<span class="con-valuta"><input class="campo" data-f="statSpese.importo" inputmode="decimal" autocomplete="off" value="' + esc(d.statSpese.importo) + '" placeholder="0,00">' + sceltaValuta('statSpese.valuta', d.statSpese) + '</span></label>' +
        '<label>Metodo di valutazione' + de('metodo') + scelta('metodo', C.metodi, d.metodo) + '</label></div>' +
        '<div class="fila"><button class="btn sm" type="button" data-b="trasporto-bolla">' + T.icona('nave') + 'Calcola trasporto e assicurazione con DHL Express</button></div>' +
        '<p class="et">Indicatori di valutazione' + de('indicatori') + '</p><div class="b-doc">' +
        spunta('collegati', 'Acquirente e venditore sono collegati') + spunta('restrizioni', 'Restrizioni per la cessione o l\'utilizzazione delle merci') +
        spunta('condizioni', 'Vendita o prezzo subordinati a condizioni o prestazioni') + spunta('proventi', 'Una parte dei proventi di rivendita ritorna al venditore') + '</div>' +
        '<p class="nota">Trasporto e assicurazione fino al luogo d\'introduzione nell\'UE entrano nel valore in dogana (aggiunta AK) se non sono già nel prezzo; le spese fino a destinazione solo nella base dell\'IVA.</p></details>';
    }
    return h + '<datalist id="b-imballaggi">' + C.imballaggi.map(function (x) { return '<option value="' + esc(x[0]) + '">' + esc(x[1]) + '</option>'; }).join('') + '</datalist>';
  }

  function articolo(a, k) {
    var f = function (nome) { return 'data-a="' + k + '" data-f="' + nome + '"'; };
    var v = function (nome) { return esc(a[nome] === undefined || a[nome] === null ? '' : a[nome]); };
    var h = '<div class="foglio"><div class="box articolo" data-art="' + k + '"><div class="lab">' + T.icona('container') + 'Articolo ' + (k + 1) +
      '<span class="dx"><button class="link" type="button" data-b="togli" data-a="' + k + '">togli</button></span></div><div class="b-campi">' +
      '<label>Codice merce' + de('codice') + '<input class="campo codice" ' + f('codice') + ' value="' + v('codice') + '" inputmode="numeric" maxlength="13" autocomplete="off" placeholder="10 cifre"></label>' +
      '<label>' + (imp() ? 'Paese d\'origine' : 'Paese di destinazione') + de('origine') + '<select class="campo" ' + f('origine') + '>' + opzioniPaesi(a.origine) + '</select></label>' +
      '<label class="largo">Descrizione delle merci' + de('descrizione') + '<input class="campo" ' + f('descrizione') + ' value="' + v('descrizione') + '" maxlength="512" autocomplete="off" placeholder="denominazione commerciale abituale"></label>' +
      '<label>' + (imp() ? 'Prezzo dell\'articolo' : 'Valore') + ' (' + esc(dati().valuta) + ')' + de('valore') + '<input class="campo" ' + f('valore') + ' value="' + v('valore') + '" inputmode="decimal" autocomplete="off"></label>' +
      '<label>Massa netta in kg' + de('netto') + '<input class="campo" ' + f('netto') + ' value="' + v('netto') + '" inputmode="decimal" autocomplete="off"></label>' +
      '<label>Massa lorda in kg' + de('lordo') + '<input class="campo" ' + f('lordo') + ' value="' + v('lordo') + '" inputmode="decimal" autocomplete="off"></label>' +
      '<label>Colli: numero' + de('colli') + '<input class="campo" ' + f('colliNumero') + ' value="' + v('colliNumero') + '" inputmode="numeric" autocomplete="off"></label>' +
      '<label>Colli: tipo di imballaggio<input class="campo" ' + f('colliTipo') + ' value="' + v('colliTipo') + '" list="b-imballaggi" maxlength="2" autocomplete="off" autocapitalize="characters" placeholder="per esempio CT, PX"></label>' +
      '<label class="largo">Colli: marchi e numeri<input class="campo" ' + f('colliMarchi') + ' value="' + v('colliMarchi') + '" maxlength="512" autocomplete="off"></label>' +
      (imp() ? '<label>Regimi aggiuntivi' + de('regimiAggiuntivi') + '<input class="campo" ' + f('regimiAggiuntivi') + ' value="' + v('regimiAggiuntivi') +
        '" maxlength="40" autocomplete="off" autocapitalize="characters" placeholder="codici di 3 caratteri"></label>' : '') +
      '</div><div class="b-desc nota" data-desc="' + k + '"></div><div class="b-opz" data-opz="' + k + '"></div>';
    if (imp()) h += '<details class="piu"' + (a.aggiunte || a.deduzioni ? ' open' : '') + '><summary>Altri elementi del valore in dogana</summary><div class="b-campi">' +
      '<label>Da aggiungere (' + esc(dati().valuta) + ')' + de('aggiunte') + '<input class="campo" ' + f('aggiunte') + ' value="' + v('aggiunte') + '" inputmode="decimal" autocomplete="off"></label>' +
      '<label>Codice dell\'aggiunta' + '<select class="campo" ' + f('codAggiunte') + '><option value="">scegli…</option>' + C.aggiunte.filter(function (x) { return x[0] !== 'AK'; }).map(function (x) {
        return '<option value="' + x[0] + '"' + (a.codAggiunte === x[0] ? ' selected' : '') + '>' + esc(x[0] + ' · ' + x[1]) + '</option>'; }).join('') + '</select></label>' +
      '<label>Da togliere (' + esc(dati().valuta) + ')<input class="campo" ' + f('deduzioni') + ' value="' + v('deduzioni') + '" inputmode="decimal" autocomplete="off"></label>' +
      '<label>Codice della detrazione' + '<select class="campo" ' + f('codDeduzioni') + '><option value="">scegli…</option>' + C.detrazioni.map(function (x) {
        return '<option value="' + x[0] + '"' + (a.codDeduzioni === x[0] ? ' selected' : '') + '>' + esc(x[0] + ' · ' + x[1]) + '</option>'; }).join('') + '</select></label></div></details>' +
      '<details class="piu"' + (a.dazioManuale || a.altriManuale ? ' open' : '') + '><summary>Correzioni a mano</summary><div class="b-campi">' +
      '<label>Aliquota del dazio (%)<input class="campo" ' + f('dazioManuale') + ' value="' + v('dazioManuale') + '" inputmode="decimal" autocomplete="off" placeholder="vuoto: quella del TARIC"></label>' +
      '<label>Antidumping e altri dazi (€)<input class="campo" ' + f('altriManuale') + ' value="' + v('altriManuale') + '" inputmode="decimal" autocomplete="off" placeholder="vuoto: quelli del TARIC"></label></div>' +
      '<p class="nota">Quello che scrivi qui sostituisce il calcolo e sul foglio risulta «inserito a mano»; se il TARIC dà un altro importo la bolla lo segnala.</p></details>';
    return h + '</div></div>';
  }

  /* la parte dell'articolo che dipende dalle misure: quantità, regime, codici addizionali, IVA, documenti */
  function disegnaOpzioniTutte() { dati().articoli.forEach(function (a, k) { disegnaOpzioni(k); }); }
  function disegnaOpzioni(k) {
    var box = el.querySelector('[data-opz="' + k + '"]'), desc = el.querySelector('[data-desc="' + k + '"]'), a = dati().articoli[k];
    if (!box || !a) return;
    var M = a.codice ? misure(a) : null, g = giorno();
    if (desc) {
      var perc = M && M.descrizione ? app().percorso(String(a.codice).replace(/\D/g, '')) : [];
      desc.textContent = perc.length > 1 ? perc[perc.length - 2] + ' › ' + perc[perc.length - 1] : (M && M.descrizione ? M.descrizione : (M && M.errore && a.codice ? M.errore : ''));
    }
    if (M && M.passato && /^\d{10}$/.test(String(a.codice || ''))) {
      box.innerHTML = '<div class="fila"><a class="btn sm" href="' + esc(app().urlTaric(a.codice, a.origine || dati().paese, g)) + '" target="_blank" rel="noopener">' +
        T.icona('link') + 'Misure sul TARIC UE al ' + esc(dataIt(dati().data)) + '</a></div>';
      return;
    }
    if (!M || M.errore) { box.innerHTML = ''; return; }
    var h = '<div class="b-campi">';
    if (M.unitaSup || M.unitaQta) {
      h += '<label>' + (M.unitaSup ? 'Unità supplementari: ' + esc(M.unitaSupNome) + de('quantita') : 'Quantità per il dazio: ' + esc(M.unitaQtaNome)) +
        '<input class="campo" data-a="' + k + '" data-f="quantita" value="' + esc(a.quantita || '') + '" inputmode="decimal" autocomplete="off"></label>';
      if (K.quantitaSeparata(M))
        h += '<label>Quantità per il dazio: ' + esc(M.unitaQtaNome) + '<input class="campo" data-a="' + k + '" data-f="quantitaDazio" value="' + esc(a.quantitaDazio || '') + '" inputmode="decimal" autocomplete="off"></label>';
    }
    if (imp()) {
      var reg = K.regimi(M.righe, g), trovato = false;
      h += '<label class="largo">Preferenza' + de('regime') + '<select class="campo" data-a="' + k + '" data-f="regime">' + reg.map(function (r) {
        var sel = r.id === (a.regime || 'base'); if (sel) trovato = true;
        return '<option value="' + esc(r.id) + '"' + (sel ? ' selected' : '') + '>' + esc((r.preferenza ? r.preferenza + ' · ' : '') + nomeRegime(r)) + '</option>';
      }).join('') + (trovato ? '' : '<option value="' + esc(a.regime) + '" selected>regime scelto non più valido: scegline un altro</option>') + '</select></label>';
      // un codice addizionale per famiglia (antidumping, compensativo, addizionale): quello del produttore
      K.famiglie(M.righe, g).forEach(function (fa) {
        if (!fa.codici.length) return;
        h += sceltaCodice(k, a, 'Codice addizionale del produttore: ' + (fa.famiglia === 'addizionale' ? 'dazio addizionale' : fa.famiglia), fa.misure);
      });
      // codici addizionali del dazio scelto (per esempio 2500 o 2501 per le sostanze farmaceutiche)
      var regScelto = reg.filter(function (r) { return r.id === (a.regime || 'base'); })[0];
      var conCodice = regScelto ? regScelto.misure.filter(function (m) { return m.add; }) : [];
      if (conCodice.length) h += sceltaCodice(k, a, 'Codice addizionale del dazio', conCodice);
      var aliq = Number(a.iva === undefined ? 22 : a.iva);
      h += '<label>IVA' + de('iva') + '<select class="campo" data-a="' + k + '" data-f="iva">' + IVA.map(function (x) {
        return '<option value="' + x[0] + '"' + (aliq === x[0] ? ' selected' : '') + '>' + x[1] + '</option>';
      }).join('') + '</select></label>';
      if (aliq === 0) h += '<label class="largo">Norma dell\'esenzione o della non imponibilità<input class="campo" data-a="' + k + '" data-f="ivaMotivo" value="' + esc(a.ivaMotivo || '') + '" maxlength="200" autocomplete="off" placeholder="per esempio art. 68 DPR 633/72"></label>';
      else h += '<label class="largo">Pagamento dell\'IVA<select class="campo" data-a="' + k + '" data-f="ivaNonPagata">' + IVA_NON_PAGATA.map(function (x) {
        return '<option value="' + x[0] + '"' + ((a.ivaNonPagata || '') === x[0] ? ' selected' : '') + '>' + esc(x[1]) + '</option>';
      }).join('') + '</select></label>' + (a.ivaNonPagata === '406' ? '<label class="largo">Dichiarazione d\'intento: protocollo e data<input class="campo" data-a="' + k + '" data-f="ivaMotivo" value="' + esc(a.ivaMotivo || '') + '" maxlength="200" autocomplete="off" placeholder="protocollo di ricevuta dell\'Agenzia delle Entrate"></label>' : '');
      // codici addizionali scelti prima che non valgono più (cambiati codice, origine o data)
      var validi = {};
      M.righe.forEach(function (m) { if (m.add && K.valida(m, g)) validi[m.add] = true; });
      var vecchi = (a.addizionali || []).filter(function (c) { return !validi[c]; });
      if (vecchi.length) h += '<p class="nota largo">Codici addizionali non più validi: ' + vecchi.map(function (c) {
        return '<b>' + esc(c) + '</b> <button class="link" type="button" data-b="togli-cod" data-a="' + k + '" data-c="' + esc(c) + '">togli</button>';
      }).join(' · ') + '</p>';
    }
    h += '</div>' + documenti(a, k, M, g);
    box.innerHTML = allinea(h);
  }
  function sceltaCodice(k, a, etichetta, misureConCodice) {
    var codici = misureConCodice.map(function (m) { return m.add; });
    var scelto = codici.filter(function (c) { return (a.addizionali || []).indexOf(c) >= 0; })[0] || '';
    return '<label class="largo">' + esc(etichetta) + '<select class="campo" data-a="' + k + '" data-addizionale="' + esc(codici.join(' ')) + '"><option value="">scegli…</option>' +
      misureConCodice.map(function (m) {
        return '<option value="' + esc(m.add) + '"' + (m.add === scelto ? ' selected' : '') + '>' + esc(m.add + ' · ' + taglia(app().addizionale(m.add) || '', 60) + ' · ' + dazioBreve(m.duty)) + '</option>';
      }).join('') + '</select></label>';
  }
  var taglia = T.taglia;
  function dazioBreve(d) {
    if (!d) return 'esente';
    if (/^Cond:/.test(d)) {
      var p = K.parseCond(d).filter(function (x) { return x.dazio; });
      return p.map(function (x) { return (x.cert ? 'con ' + x.cert + ' ' : 'altrimenti ') + app().fmtDazio(x.dazio); }).join(', ');
    }
    return app().fmtDazio(d);
  }
  function nomeRegime(r) {
    var m = r.misure[0];
    if (r.id === 'base') return 'Dazio paesi terzi' + (m ? ': ' + dazioBreve(m.duty) : ': non indicato');
    return app().tipoMisura(r.tipo) + ' · ' + app().nomeArea(r.origine) + (r.contingente ? ' · contingente ' + r.contingente.slice(0, 2) + '.' + r.contingente.slice(2) : '') +
      ': ' + (m ? dazioBreve(m.duty) : '');
  }

  /* documenti della casella 44: quelli che cambiano i dazi e quelli chiesti dalle misure di controllo */
  function documenti(a, k, M, g) {
    var docs = a.documenti || [], visti = {}, gruppi = [];
    function casella(c) {
      if (visti[c]) return '';
      visti[c] = true;
      var on = docs.indexOf(c) >= 0;
      return '<label class="spunta doc"><input type="checkbox" data-a="' + k + '" data-doc="' + esc(c) + '"' + (on ? ' checked' : '') + '> <b>' + esc(c) + '</b> ' + esc(taglia(app().certificato(c), 110)) + '</label>';
    }
    // documenti che cambiano un dazio (D008 dell'antidumping, Y155 dei dazi addizionali, C990 per le navi…): solo quelli
    // del regime scelto e delle misure aggiuntive che valgono per il produttore scelto
    var perDazi = [], rilevanti = [];
    if (imp()) {
      K.regimi(M.righe, g).forEach(function (r) { if (r.id === (a.regime || 'base')) rilevanti = rilevanti.concat(r.misure); });
      K.famiglie(M.righe, g).forEach(function (fa) {
        fa.gruppi.forEach(function (gr) { gr.misure.forEach(function (m) { if (!m.add || (a.addizionali || []).indexOf(m.add) >= 0) rilevanti.push(m); }); });
      });
    }
    rilevanti.forEach(function (m) {
      K.parseCond((/^Cond:/.test(m.duty) ? m.duty : '') + ';' + (m.cond || '')).forEach(function (p) { if (p.cert && perDazi.indexOf(p.cert) < 0) perDazi.push(p.cert); });
    });
    var h = '';
    if (perDazi.length) h += '<div class="b-doc"><p class="et">Documenti che cambiano i dazi</p>' + perDazi.map(casella).join('') + '</div>';
    K.controlli(M.righe, g, docs).forEach(function (x) { gruppi.push(x); });
    if (gruppi.length) {
      var mancano = gruppi.filter(function (x) { return x.esito === 'manca' || x.esito === 'vietata'; }).length;
      h += '<details class="piu b-controlli"' + (mancano ? ' open' : '') + '><summary>Documenti e controlli' + de('documenti') +
        (mancano ? ' · <span class="st errore">' + mancano + ' da sistemare</span>' : ' · <span class="st ok">a posto</span>') + '</summary>' +
        gruppi.map(function (x) {
          var m = x.misura, testa = '<p class="et">' + esc(app().tipoMisura(m.t)) + (m.o !== '1011' ? ' · ' + esc(app().nomeArea(m.o)) : '') +
            ' <span class="st ' + ({ ok: 'ok', manca: 'errore', vietata: 'errore', da_verificare: 'ambra' }[x.esito] || 'ambra') + '">' +
            ({ ok: 'a posto', manca: 'manca un documento', vietata: imp() ? 'importazione vietata' : 'esportazione vietata', da_verificare: 'da verificare' }[x.esito] || x.esito) + '</span></p>';
          return '<div class="b-doc">' + testa + x.gruppi.map(function (gr) {
            if (gr.esito === 'soglia') return '<p class="nota">Dipende da quantità o prezzi dichiarati: verifica su AIDA.</p>';
            if (!gr.alternative.length) return '';
            return '<div class="b-alt">' + (gr.alternative.length > 1 ? '<span class="nota">uno di questi:</span>' : '') + gr.alternative.map(casella).join('') + '</div>';
          }).join('') + '</div>';
        }).join('') + '</details>';
    }
    return h;
  }

  /* ------------------------------------------------------------------ risultati */
  function blocchiHtml(R) {
    if (!R.blocchi.length) return '';
    return '<div class="b-blocchi"><p class="et">' + T.icona('attenzione') + 'Da completare o verificare prima del totale</p><ul>' +
      R.blocchi.map(function (b) { return '<li>' + (b.articolo ? '<b>Articolo ' + b.articolo + '</b>: ' : '') + esc(b.testo) + '</li>'; }).join('') + '</ul></div>';
  }
  function conflittiHtml(R) {
    if (!R.conflitti || !R.conflitti.length) return '';
    return '<div class="b-conflitti"><p class="et">' + T.icona('attenzione') + 'Conflitti tra i campi<span class="dx">' + R.conflitti.length + '</span></p><ul>' +
      R.conflitti.map(function (c) { return '<li>' + (c.articolo ? '<b>Articolo ' + c.articolo + '</b>: ' : '<b>Intestazione</b>: ') + esc(c.testo) + '</li>'; }).join('') + '</ul></div>';
  }
  /* dati obbligatori della dichiarazione ancora vuoti: non cambiano il calcolo, ma senza AIDA rifiuta la bolla */
  function mancantiHtml(R) {
    var L = R.mancanti || [];
    if (!L.length) return '';
    return '<details class="piu b-mancanti"><summary>' + T.icona('documento') + 'Dati obbligatori da completare · <span class="st ambra">' + L.length + '</span></summary><ul>' +
      L.map(function (m) {
        return '<li><button class="link" type="button" data-b="vai" data-a="' + (m.articolo ? m.articolo - 1 : '') + '" data-c="' + esc(m.campo || '') + '">' +
          (m.articolo ? 'Articolo ' + m.articolo + ': ' : '') + esc(m.testo) + '</button></li>';
      }).join('') + '</ul><p class="nota">Non cambiano i tributi, ma la dichiarazione li richiede.</p></details>';
  }
  function vaiAlCampo(k, campo) {
    var sel = k !== '' ? '[data-a="' + k + '"][data-f="' + campo + '"]' : '[data-f="' + campo + '"]:not([data-a])', x = el.querySelector(sel);
    if (!x) return;
    for (var p = x.parentNode; p && p !== el; p = p.parentNode) if (p.tagName === 'DETAILS') p.open = true;
    x.scrollIntoView({ block: 'center' });
    x.focus({ preventScroll: true });
  }
  /* bordo rosso sui campi in conflitto */
  function segnaConflitti(R) {
    Array.prototype.forEach.call(el.querySelectorAll('.in-conflitto'), function (x) { x.classList.remove('in-conflitto'); });
    ((R && R.conflitti) || []).forEach(function (c) {
      if (!c.campo) return;
      var sel = c.articolo ? (c.campo === 'addizionali' ? '[data-a="' + (c.articolo - 1) + '"][data-addizionale]' : '[data-a="' + (c.articolo - 1) + '"][data-f="' + c.campo + '"]')
        : '[data-f="' + c.campo + '"]:not([data-a])';
      Array.prototype.forEach.call(el.querySelectorAll(sel), function (x) { x.classList.add('in-conflitto'); });
    });
  }
  /* il TARIC dell'UE per il codice, l'origine e il giorno della bolla (per i dazi che i dati del mese non hanno ancora) */
  function linkTaric(r) {
    var a = dati().articoli[r.n - 1] || {};
    return ' <a href="' + esc(app().urlTaric(String(a.codice || '').replace(/\D/g, ''), a.origine || dati().paese || '', giorno())) +
      '" target="_blank" rel="noopener">' + T.icona('link') + 'TARIC dell\'UE</a>';
  }
  function avvertenzeHtml(R) {
    var av = (R.avvisi || []).map(function (a) { return '<li><b>Intestazione</b>: ' + esc(a.testo) + '</li>'; });
    R.articoli.forEach(function (r) { r.avvertenze.forEach(function (t) { av.push('<li><b>Articolo ' + r.n + '</b>: ' + esc(prima(t)) + (t === r.verificaTaric ? linkTaric(r) : '') + '</li>'); }); });
    return av.length ? '<div class="b-avvisi"><p class="et">Da tenere presente</p><ul>' + av.join('') + '</ul></div>' : '';
  }
  function nomeTributo(t) {
    var nome = t.tipo === 'altri dazi' ? 'Antidumping e altri dazi' : prima(t.tipo);
    return (t.codice ? t.codice + ' ' : '') + nome + (t.misura && t.misura.add ? ' (' + t.misura.add + ')' : '') + (t.manuale ? ' · a mano' : '');
  }
  function aliquotaTributo(t) { return t.manuale ? (t.aliquotaManuale || 'importo a mano') : (t.espressione ? app().fmtDazio(t.espressione) : 'esente'); }
  function esitoImport(R) {
    var h = blocchiHtml(R) + conflittiHtml(R);
    if (!R.articoli.length) return h + '<p class="vuoto">Aggiungi un articolo.</p>';
    h += '<div class="scorri"><table class="tab b-tab"><thead><tr><th>Art.</th><th>Codice</th><th class="n">Valore in dogana</th><th>Tributi</th><th class="n">Base IVA</th><th class="n">IVA (B00)</th></tr></thead><tbody>' +
      R.articoli.map(function (r) {
        return '<tr' + (r.completo ? '' : ' class="incompleto"') + '><td>' + r.n + '</td><td data-l="Codice">' + esc(r.codice ? app().grp(String(r.codice).replace(/\D/g, '')) : '–') +
          (r.preferenza ? '<span class="piccolo">preferenza ' + esc(r.preferenza) + '</span>' : '') + '</td>' +
          '<td class="n" data-l="Valore in dogana">' + euro(r.valoreDogana) + (r.quotaNolo ? '<span class="piccolo">di cui trasporto e assicurazione ' + euro(r.quotaNolo) + '</span>' : '') + '</td>' +
          '<td data-l="Tributi">' + (r.tributi.length ? r.tributi.map(function (t) {
            return '<div class="b-trib' + (t.manuale ? ' manuale' : '') + '"><span>' + esc(nomeTributo(t)) + ' <span class="piccolo">' + esc(aliquotaTributo(t)) + '</span></span><b>' + euro(t.importo) + '</b></div>';
          }).join('') : '–') + '</td>' +
          '<td class="n" data-l="Base IVA">' + euro(r.baseIva) + '</td><td class="n" data-l="IVA">' + (r.iva === null || r.iva === undefined ? '–' : euro(r.iva) + '<span class="piccolo">' +
            (r.aliquota ? r.aliquota + ' %' : 'esente o non imponibile') + (r.ivaNonPagata ? ' · non pagata, ' + esc(r.ivaNonPagata.codice) : '') + '</span>') + '</td></tr>';
      }).join('') + '</tbody></table></div>';
    var T0 = R.totali;
    if (T0) {
      h += '<table class="tab b-totali"><tbody><tr><td>Valore in dogana</td><td class="n">' + euro(T0.valoreDogana) + '</td></tr>' +
        Object.keys(T0.dazi).map(function (k) { return '<tr><td>' + esc(prima(k)) + '</td><td class="n">' + euro(T0.dazi[k]) + '</td></tr>'; }).join('') +
        '<tr><td>B00 IVA all\'importazione</td><td class="n">' + euro(T0.iva) + '</td></tr>' +
        Object.keys(T0.ivaNonPagata || {}).map(function (c) { return '<tr><td>' + esc(c) + ' IVA non pagata (' + (c === '406' ? 'dichiarazione d\'intento' : 'oro o argento') + ')</td><td class="n">− ' + euro(T0.ivaNonPagata[c]) + '</td></tr>'; }).join('') +
        '<tr class="evid"><td><b>Totale da pagare</b></td><td class="n"><b>' + euro(T0.totale) + '</b></td></tr>' +
        '<tr><td>Valore statistico' + de('statistico') + '</td><td class="n">' + euro(T0.valoreStatistico) + '</td></tr></tbody></table>';
    } else h += '<p class="nota">Il totale compare quando tutti gli articoli sono completi e calcolabili.</p>';
    return h + mancantiHtml(R) + avvertenzeHtml(R);
  }
  function esitoExport(R) {
    var h = blocchiHtml(R) + conflittiHtml(R);
    if (!R.articoli.length) return h + '<p class="vuoto">Aggiungi un articolo.</p>';
    h += '<div class="scorri"><table class="tab b-tab"><thead><tr><th>Art.</th><th>Codice</th><th class="n">Valore statistico</th><th>Documenti</th></tr></thead><tbody>' +
      R.articoli.map(function (r) {
        var c = r.controlli || [], mancano = c.filter(function (x) { return x.esito === 'manca' || x.esito === 'vietata'; }).length;
        return '<tr' + (r.completo ? '' : ' class="incompleto"') + '><td>' + r.n + '</td><td data-l="Codice">' + esc(r.codice ? app().grp(String(r.codice).replace(/\D/g, '')) : '–') + '</td>' +
          '<td class="n" data-l="Valore statistico">' + euro(r.valore) + (r.quotaAggiunta ? '<span class="piccolo">più trasporto fino al confine ' + euro(r.quotaAggiunta) + '</span>' : '') +
          (r.quotaTolta ? '<span class="piccolo">meno spese oltre il confine ' + euro(r.quotaTolta) + '</span>' : '') + '</td><td data-l="Documenti">' + (!c.length ? 'nessun controllo' : mancano ? mancano + ' da sistemare' : 'a posto') + '</td></tr>';
      }).join('') + '</tbody></table></div>';
    if (R.totali) h += '<table class="tab b-totali"><tbody><tr class="evid"><td><b>Valore statistico totale</b></td><td class="n"><b>' + euro(R.totali.valore) + '</b></td></tr></tbody></table>';
    h += '<p class="nota">All\'esportazione il TARIC non prevede dazi: contano i divieti, le licenze e i documenti di ogni articolo.</p>';
    return h + mancantiHtml(R) + avvertenzeHtml(R);
  }

  /* ------------------------------------------------------------------ stampa */
  function nomeDi(lista, c) { var x = (lista || []).filter(function (y) { return String(y[0]) === String(c); })[0]; return x ? x[0] + ' · ' + x[1] : (c || ''); }
  function baseTributo(t, r) {
    var e = String(t.espressione || '');
    if (t.manuale || !e || /^[\d.,\s]+%$/.test(e.trim())) return euro(r.valoreDogana);
    return /%/.test(e) ? euro(r.valoreDogana) + ' e quantità' : 'quantità';
  }
  function elencoStampa(classe, titolo, voci) {
    return voci && voci.length ? '<div class="' + classe + '"><b>' + esc(titolo) + '</b><ul>' + voci.map(function (x) {
      return '<li>' + (x.articolo ? 'Articolo ' + x.articolo + ': ' : '') + esc(x.testo) + '</li>'; }).join('') + '</ul></div>' : '';
  }
  function problemiStampa(R) {
    return elencoStampa('b-st-conflitti', 'Conflitti da risolvere', R.conflitti) + elencoStampa('b-st-mancanti', 'Dati obbligatori ancora vuoti', R.mancanti);
  }
  function riepilogoStampa(R) {
    if (imp() && R.totali) {
      var T0 = R.totali;
      return '<div class="b-st-art"><h2>Riepilogo</h2><table class="tab"><tbody><tr><th>Valore in dogana</th><td class="n">' + euro(T0.valoreDogana) + '</td></tr>' +
        Object.keys(T0.dazi).map(function (k) { return '<tr><th>' + esc(prima(k)) + '</th><td class="n">' + euro(T0.dazi[k]) + '</td></tr>'; }).join('') +
        '<tr><th>B00 IVA all\'importazione</th><td class="n">' + euro(T0.iva) + '</td></tr>' +
        Object.keys(T0.ivaNonPagata || {}).map(function (k) { return '<tr><th>' + esc(k) + ' IVA non pagata (si detrae)</th><td class="n">− ' + euro(T0.ivaNonPagata[k]) + '</td></tr>'; }).join('') +
        '<tr><th>Totale da pagare</th><td class="n"><b>' + euro(T0.totale) + '</b></td></tr>' +
        '<tr><th>Valore statistico (DE 99 06 · c. 46)</th><td class="n">' + euro(T0.valoreStatistico) + '</td></tr></tbody></table></div>';
    }
    if (!imp() && R.totali) return '<div class="b-st-art"><h2>Riepilogo</h2><table class="tab"><tbody><tr><th>Valore statistico totale</th><td class="n"><b>' + euro(R.totali.valore) + '</b></td></tr></tbody></table></div>';
    return '<p class="b-st-sim">Simulazione incompleta: ' + (R.blocchi.length === 1 ? '1 punto' : R.blocchi.length + ' punti') + ' da completare o verificare (vedi le note degli articoli).</p>';
  }
  function piedeStampa() {
    return '<p class="b-st-piede">Calcolata da MAGIC HS il ' + esc(dataIt(oggiIso())) + ' con i dati TARIC al ' + esc(app().dati().it) + '. Riferimenti: ' +
      (imp() ? 'dati (DE) del tracciato H1 dell\'Agenzia delle Dogane, versione EUCDM 6.2' : 'dati (DE) dell\'allegato B del Reg. delegato (UE) 2015/2446, colonna B1') +
      '; c. = casella del DAU. Non comprende accise, misure nazionali e saldo dei contingenti; le misure cambiate dopo quella data non ci sono. Verifica sempre su AIDA prima di dichiarare.</p>';
  }
  function noteArticolo(r) {
    var note = r.blocchi.concat(r.avvertenze);          // i conflitti sono già in alto
    (r.controlli || []).forEach(function (x) { if (x.esito === 'da_verificare') note.push(app().tipoMisura(x.misura.t) + ': da verificare su AIDA'); });
    return note.length ? '<ul class="b-st-note">' + note.map(function (t) { return '<li>' + esc(prima(t)) + '</li>'; }).join('') + '</ul>' : '';
  }

  /* importazione: il «Prospetto di sintesi della dichiarazione doganale di importazione H1» come quello che si stampa da
     AIDA (intestazione, poi un foglio «Dettagli Articolo» per articolo, con le stesse caselle e sezioni), senza stemma né
     codice a barre e con la scritta SIMULAZIONE su ogni pagina. I dati che esistono solo dopo l'accettazione (MRN, svincolo,
     A93, quietanza) e quelli che la simulazione non chiede restano vuoti; quelli che chiede in più vanno in «Altri dati». */
  // MRN: anno (2 cifre), paese (2 lettere), 14 lettere o cifre; lo controlla anche js/calcolo.js
  var RE_MRN = /^\d{2}[A-Z]{2}[A-Z0-9]{14}$/;
  function prospettoH1() {
    var R = st.ultimo, d = dati(), cb = contesto().cambi[d.valuta], c = cambioAttuale();
    if (!R) return '';
    var arts = d.articoli, dt = d.docTrasporto || {};
    function testo(v) { return v === null || v === undefined ? '' : esc(String(v)).replace(/\n/g, '<br>'); }
    function cella(et, v, span, cls) {
      return '<td' + (span > 1 ? ' colspan="' + span + '"' : '') + (cls ? ' class="' + cls + '"' : '') + '><span class="ps-et">' + esc(et) + '</span><span class="ps-v">' + testo(v) + '</span></td>';
    }
    function tabella(n, righe) { return '<table class="ps"><colgroup>' + new Array(n + 1).join('<col>') + '</colgroup><tbody>' + righe.join('') + '</tbody></table>'; }
    function tr() { return '<tr>' + Array.prototype.join.call(arguments, '') + '</tr>'; }
    /* una sezione a righe (Aggiunte / Detrazioni, Documenti, Scarichi, Liquidazione, Colli): colonne [etichetta, larghezza, numero?] */
    function sezione(n, titolo, colonne, righe) {
      var td = function (k, v) { var x = colonne[k]; return '<td' + (x[1] > 1 ? ' colspan="' + x[1] + '"' : '') + (x[2] ? ' class="n"' : '') + '>' + testo(v) + '</td>'; };
      return '<tr class="ps-sez"><td colspan="' + n + '">' + esc(titolo) + '</td></tr><tr class="ps-th">' + colonne.map(function (x, k) { return td(k, x[0]); }).join('') + '</tr>' +
        (righe.length ? righe : [colonne.map(function () { return ''; })]).map(function (r) { return '<tr class="ps-r">' + r.map(function (v, k) { return td(k, v); }).join('') + '</tr>'; }).join('');
    }
    function numero(v, min) { var x = K.numeroIt(v); return v === '' || v === undefined || isNaN(x) ? (v || '') : x.toLocaleString('it-IT', { minimumFractionDigits: min, maximumFractionDigits: Math.max(min, 3) }); }
    function totale(k) { var t = 0, n = 0; arts.forEach(function (a) { var x = K.numeroIt(a[k]); if (x > 0) { t += x; n++; } }); return n ? t : null; }
    var colli = totale('colliNumero'), lordo = totale('lordo'), fattura = totale('valore'), ora = new Date();
    var rappresentante = d.qualifica === '2' ? 'Rappresentante diretto' : d.qualifica === '3' ? 'Rappresentante indiretto' : 'Rappresentante';
    var mrn = String(d.mrn || '').replace(/\s+/g, '').toUpperCase(), c128 = window.TARIC_CODICE128;
    var barre = RE_MRN.test(mrn) && c128 ? c128.svg(mrn, 40) : '', sc = d.scarico || {}, mp = d.metodoPagamento || '';
    var docTestata = (R.documentiTestata || []).map(function (x) { return [x.codice, x.numero, '', '', '', '', '', '']; });
    if (dt.tipo || dt.numero) docTestata.push([dt.tipo || '', dt.numero || '', '', '', '', '', '', '']);

    var h = '<div class="ps-filigrana" aria-hidden="true">SIMULAZIONE</div><div class="ps-testa"><p class="b-st-sim">SIMULAZIONE · non è una dichiarazione doganale</p>' +
      '<h1>Prospetto di sintesi della dichiarazione doganale di importazione H1</h1>' +
      '<p>MRN: ' + (mrn ? '<b>' + esc(mrn) + '</b>' : '—') + ' &nbsp; Ver.: —</p><p>Generato il: ' + esc(dataIt(oggiIso())) + ' ' + pad(ora.getHours()) + ':' + pad(ora.getMinutes()) + ':' + pad(ora.getSeconds()) +
      ' da MAGIC HS, dati TARIC al ' + esc(app().dati().it) + (st.b.riferimento ? ' · Riferimento: <b>' + esc(st.b.riferimento) + '</b>' : '') + '</p></div>';
    // le prime due righe con il codice a barre dell'MRN a destra, come nel prospetto di AIDA
    h += tabella(10, [
      tr(cella('Ufficio', d.ufficio, 3), cella('Data dichiarazione', dataIt(d.data), 2), cella('Data accettazione', '', 2),
        '<td colspan="3" rowspan="2" class="ps-codice">' + (barre ? barre + '<small>' + esc(mrn) + '</small>' : '') + '</td>'),
      tr(cella('Totale colli', colli === null ? '' : nIt(colli, 0), 1), cella('Totale massa lorda', lordo === null ? '' : nIt(lordo, 2), 2),
        cella('Valore fattura', fattura === null ? '' : nIt(fattura, 2) + ' ' + d.valuta, 2), cella('Tasso di cambio', d.valuta === 'EUR' ? '' : cb ? nIt(cb.tasso, 4) : '', 2))
    ]).replace('<table class="ps">', '<table class="ps ps-su">');
    h += tabella(8, [
      '<tr><td colspan="4" rowspan="2" class="ps-titolo">Dettagli Dichiarazione</td>' + cella('Svincolo', '') + cella('Data svincolo', '') + cella('Num. A93', '') + cella('Anno A93', '') + '</tr>',
      tr(cella('Totale Articoli', arts.length), cella('Data rilascio', ''), cella('Num. Quiet.', ''), cella('Data Quiet.', '')),
      tr(cella('Esportatore', d.mittente, 4), cella('Importatore', d.destinatario, 4)),
      tr(cella('Dichiarante', d.dichiarante, 4), cella(rappresentante, d.rappresentante, 4)),
      tr(cella('Condizioni di consegna', d.incoterm ? d.incoterm + (d.luogo ? ' ' + d.luogo : '') : '', 4), cella('Dilazione di pagamento', d.dilazione, 4)),
      tr(cella('Paese di sped.', d.paeseSpedizione), cella('Paese di dest.', 'IT'), cella('Provincia dest.', d.provincia, 2), cella('Id. Mezzo all\'arrivo', d.mezzoArrivo, 2),
        cella('Natura transazione', d.natura, 2)),
      sezione(8, 'Aggiunte / Detrazioni', [['Codice', 1], ['Descrizione', 5], ['Importo', 2, true]], []),
      sezione(8, 'Documenti', [['Codice', 1], ['Identificativo', 1], ['Autorità Emitt.', 1], ['Data Validità', 1], ['Unità di misura', 1], ['Quantità', 1], ['Codice Valuta', 1], ['Importo', 1, true]], docTestata),
      sezione(8, 'Scarichi', [['Tipo', 1], ['Riferimento', 3], ['Art.', 1], ['Num. imb.', 1], ['Quantità', 1, true], ['Unità', 1]],
        sc.tipo || sc.riferimento ? [[sc.tipo, sc.riferimento, sc.articolo, sc.colli, sc.quantita, sc.unita]] : [])
    ]);
    // quello che la simulazione usa e il prospetto non ha
    var cambio = d.valuta === 'EUR' ? '' : !cb ? d.valuta + ', cambio mancante' : '1 € = ' + nIt(cb.tasso, 4) + ' ' + d.valuta +
      (cb.contratto ? ', tasso del contratto (DE 14 09, documento 26AO)' : cb.manuale ? ', scritto a mano' : c && c.fonte ? ', cambio doganale (' + c.fonte + ')' : '');
    var altri = [['Venditore', d.venditore], ['Acquirente', d.acquirente], ['Qualifica del rappresentante', d.qualifica ? nomeDi(C.qualifica, d.qualifica) : ''],
      ['Modo di trasporto alla frontiera', d.modoTrasporto ? nomeDi(C.modi, d.modoTrasporto) : ''], ['Ubicazione delle merci', d.ubicazione], ['Cambio', cambio],
      ['Metodo di valutazione', nomeDi(C.metodi, R.metodo)], ['Indicatori di valutazione', R.indicatori],
      ['Trasporto e assicurazione fino al confine UE', euro(R.noloEur) + ' (ripartiti in base ' + (d.ripartizione === 'massa' ? 'alla massa lorda' : 'al valore') + ')'],
      ['Spese dal confine UE a destinazione (base IVA)', euro(R.inoltroEur)], ['Spese fino al confine italiano (valore statistico)', R.statEur ? euro(R.statEur) : '']]
      .filter(function (x) { return x[1]; });
    h += '<div class="b-st-art"><h2>Altri dati della simulazione</h2><table class="tab"><tbody>' +
      altri.map(function (x) { return '<tr><th>' + esc(x[0]) + '</th><td>' + testo(x[1]) + '</td></tr>'; }).join('') + '</tbody></table></div>' + problemiStampa(R) +
      riepilogoStampa(R) + piedeStampa();

    R.articoli.forEach(function (r) {
      var a = arts[r.n - 1] || {}, paese = a.origine || d.paese, pref = r.preferenza && /^[23]/.test(r.preferenza);
      var reg = r.regime || {}, aggiunte = [];
      if (r.quotaNolo) aggiunte.push(['AK', nomeDi(C.aggiunte, 'AK').replace(/^AK · /, ''), euro(r.quotaNolo)]);
      if (K.numeroIt(a.aggiunte) > 0) aggiunte.push([a.codAggiunte || '', a.codAggiunte ? nomeDi(C.aggiunte, a.codAggiunte).replace(/^\w+ · /, '') : 'codice mancante', a.aggiunte + ' ' + d.valuta]);
      if (K.numeroIt(a.deduzioni) > 0) aggiunte.push([a.codDeduzioni || '', a.codDeduzioni ? nomeDi(C.detrazioni, a.codDeduzioni).replace(/^\w+ · /, '') : 'codice mancante', a.deduzioni + ' ' + d.valuta]);
      var tributi = r.tributi.map(function (t) { return [nomeTributo(t), baseTributo(t, r), '', '', aliquotaTributo(t), euro(t.importo), mp]; });
      if (r.iva !== null && r.iva !== undefined) {
        tributi.push(['B00 IVA' + (r.aliquota === 0 && a.ivaMotivo ? ' (' + a.ivaMotivo + ')' : ''), euro(r.baseIva), '', '', (r.aliquota || 0) + ' %', euro(r.iva), mp]);
        if (r.ivaNonPagata) tributi.push([r.ivaNonPagata.codice + ' IVA non pagata, si detrae', euro(r.iva), '', '', '', '− ' + euro(r.ivaNonPagata.importo), mp]);
      }
      h += '<section class="ps-foglio">' + tabella(12, [
        '<tr><td colspan="4" class="ps-titolo">Dettagli Articolo n° ' + r.n + '</td>' + cella('Regime', '4000') + cella('Cod. Svincolo', '') + cella('Data svincolo', '') +
          cella('Num. A93', '') + cella('Anno A93', '') + cella('Data rilascio', '') + cella('Num. Quietanza', '') + cella('Data quietanza', '') + '</tr>',
        tr(cella('Codice merce', r.codice ? String(r.codice).replace(/\D/g, '') : '', 3), cella('Massa lorda', numero(a.lordo, 2), 2), cella('Massa netta', numero(a.netto, 2), 2),
          cella('Unità supplementare', r.unitaSup ? (a.quantita || '') + ' ' + r.unitaSup : '', 2), cella('Regimi aggiuntivi', a.regimiAggiuntivi, 2), cella('Container', d.container, 1)),
        tr(cella('Descrizione merce', a.descrizione, 8), cella('Preferenze', r.preferenza || '', 2), cella('Contingente', reg.contingente ? reg.contingente.slice(0, 2) + '.' + reg.contingente.slice(2) : '', 2)),
        tr(cella('Paese di sped.', d.paeseSpedizione), cella('Paese di dest.', 'IT'), cella('Prov. dest.', d.provincia), cella('Paese di orig.', paese, 2),
          cella('Paese orig pref', pref ? paese : '', 2), cella('Natura transaz.', d.natura), cella('Prezzo art.', a.valore ? numero(a.valore, 2) + ' ' + d.valuta : '', 2),
          cella('Valore stat.', r.valoreStatistico === null || r.valoreStatistico === undefined ? '' : euro(r.valoreStatistico), 2)),
        sezione(12, 'Aggiunte / Detrazioni', [['Codice', 2], ['Descrizione', 7], ['Importo', 3, true]], aggiunte),
        sezione(12, 'Liquidazione', [['Tributo', 2], ['Imponibile', 2, true], ['Quantità', 1, true], ['Unità di misura', 2], ['Aliquota', 2], ['Importo', 2, true], ['Metodo pag.', 1]], tributi),
        sezione(12, 'Scarichi', [['Tipo', 2], ['Riferimento', 4], ['Art.', 1], ['Num. imb.', 2], ['Quantità', 2, true], ['Unità', 1]], []),
        sezione(12, 'Documenti', [['Codice', 2], ['Identificativo', 3], ['Data', 1], ['Uni. Mis.', 1], ['Quantità', 2, true], ['Codice valuta', 2], ['Importo', 1, true]],
          (a.documenti || []).map(function (x) { return [x, '', '', '', '', '', '']; })),
        sezione(12, 'Colli', [['Tipo imb.', 2], ['Numero imb.', 2], ['Marchi spedizione', 8]],
          a.colliTipo || a.colliNumero || a.colliMarchi ? [[a.colliTipo || '', a.colliNumero || '', a.colliMarchi || '']] : [])
      ]) + noteArticolo(r) + '</section>';
    });
    return h;
  }
  function documentoStampa() {
    var R = st.ultimo, d = dati(), c = cambioAttuale();
    if (!R) return '';
    var riga = function (k, etichetta, valore) { return valore ? [etichetta + (rif(k) ? ' (' + rif(k) + ')' : ''), valore] : null; };
    var tabella = function (righe) {
      righe = righe.filter(Boolean);
      return righe.length ? '<table class="tab"><tbody>' + righe.map(function (x) { return '<tr><th>' + esc(x[0]) + '</th><td>' + esc(x[1]).replace(/\n/g, '<br>') + '</td></tr>'; }).join('') + '</tbody></table>' : '';
    };
    var cb = contesto().cambi[d.valuta];
    var h = '<div class="b-st-testa"><p class="b-st-sim">SIMULAZIONE · non è una dichiarazione doganale</p>' +
      '<h1>' + (imp() ? 'Bolla d\'importazione simulata (immissione in libera pratica e in consumo)' : 'Bolla d\'esportazione simulata') + '</h1>' +
      '<p>' + (imp() ? 'Tipo di dichiarazione IM A (DE 11 01-11 02 · c. 1) · Regime 40 00 (DE 11 09 · c. 37) · tracciato H1, EUCDM 6.2'
        : 'Tipo di dichiarazione EX A (DE 1/1-1/2 · c. 1) · Regime 10 00 (DE 1/10 · c. 37) · tracciato B1') + '</p>' +
      '<p>' + (st.b.riferimento ? 'Riferimento: <b>' + esc(st.b.riferimento) + '</b> · ' : '') + 'Data prevista: <b>' + esc(dataIt(d.data)) + '</b> · Dati TARIC al ' + esc(app().dati().it) + '</p></div>';
    var cambio = d.valuta === 'EUR' ? 'EUR, nessun cambio' : !cb ? d.valuta + ', cambio mancante'
      : d.valuta + ' · 1 € = ' + nIt(cb.tasso, 4) + ' ' + d.valuta + (cb.contratto ? ' · tasso fissato dal contratto (DE 14 09 · c. 23), documento 26AO' : cb.manuale ? ' · cambio scritto a mano (la BCE non pubblica questa valuta)' : c && c.fonte ? ' · cambio doganale (' + c.fonte + ')' : '');
    var dt = d.docTrasporto || {};
    var testata = R.documentiTestata || [];
    var righe = [
      riga('mittente', 'Esportatore', d.mittente), imp() ? riga('venditore', 'Venditore', d.venditore) : null,
      riga('destinatario', imp() ? 'Importatore' : 'Destinatario', d.destinatario), imp() ? riga('acquirente', 'Acquirente', d.acquirente) : null,
      riga('dichiarante', 'Dichiarante', d.dichiarante),
      riga('rappresentante', 'Rappresentante', d.rappresentante ? d.rappresentante + (d.qualifica ? '\nrappresentanza ' + nomeDi(C.qualifica, d.qualifica) : '') : ''),
      riga('valuta', 'Valuta della fattura', cambio),
      riga('incoterm', 'Condizioni di consegna', d.incoterm ? d.incoterm + (d.luogo ? ' ' + d.luogo : '') : ''),
      riga('modoTrasporto', 'Modo di trasporto alla frontiera', d.modoTrasporto ? nomeDi(C.modi, d.modoTrasporto) : ''),
      riga('container', 'Container', d.container === '1' ? '1 · sì' : d.container === '0' ? '0 · no' : ''),
      riga('natura', 'Natura della transazione', d.natura ? nomeDi(C.natura, d.natura) : ''),
      imp() ? riga('paeseSpedizione', 'Paese di spedizione', d.paeseSpedizione ? app().nomeArea(d.paeseSpedizione) + ' (' + d.paeseSpedizione + ')' : '') : null,
      imp() ? riga('provincia', 'Provincia di destinazione', d.provincia) : null,
      riga('ubicazione', 'Ubicazione delle merci', d.ubicazione),
      !imp() ? riga('uscita', 'Ufficio di uscita', d.uscita) : null,
      imp() ? riga('docTrasporto', 'Documento di trasporto', dt.tipo || dt.numero ? (dt.tipo || '–') + ' ' + (dt.numero || '') : '') : null,
      riga('fattura', 'Documenti di testata', testata.map(function (x) { return x.codice + ' ' + x.numero; }).join('\n'))
    ];
    if (imp()) righe.push(
      riga('metodo', 'Metodo di valutazione', nomeDi(C.metodi, R.metodo)),
      riga('indicatori', 'Indicatori di valutazione', R.indicatori),
      riga('nolo', 'Trasporto e assicurazione fino al confine UE', euro(R.noloEur) + ' (ripartiti in base ' + (d.ripartizione === 'massa' ? 'alla massa lorda' : 'al valore') + ')'),
      ['Spese dal confine UE a destinazione (base IVA)', euro(R.inoltroEur)],
      R.statEur ? riga('statSpese', 'Spese fino al confine italiano (valore statistico)', euro(R.statEur)) : null);
    else if (R.aggiuntaEur || R.toltaEur) righe.push(riga('trasporto', 'Trasporto fino al confine aggiunto / spese oltre il confine tolte', euro(R.aggiuntaEur) + ' / ' + euro(R.toltaEur)));
    h += '<div class="b-st-art"><h2>Intestazione</h2>' + tabella(righe) + '</div>' + problemiStampa(R);
    R.articoli.forEach(function (r) {
      var a = d.articoli[r.n - 1] || {}, paese = a.origine || d.paese;
      var pref = imp() && r.preferenza && /^[23]/.test(r.preferenza);
      var righe = [
        riga('codice', 'Codice merce', r.codice ? app().grp(String(r.codice).replace(/\D/g, '')) : '–'),
        riga('descrizione', 'Descrizione delle merci', a.descrizione),
        riga('colli', 'Colli', a.colliNumero || a.colliTipo || a.colliMarchi ? [a.colliNumero, a.colliTipo ? nomeDi(C.imballaggi, a.colliTipo) : '', a.colliMarchi ? 'marchi: ' + a.colliMarchi : ''].filter(Boolean).join(' · ') : ''),
        riga('origine', imp() ? 'Paese d\'origine' : 'Paese di destinazione', paese ? app().nomeArea(paese) + ' (' + paese + ')' : '–'),
        pref ? riga('originePref', 'Origine preferenziale', app().nomeArea(paese) + ' (' + paese + ')') : null,
        riga('lordo', 'Massa lorda', (a.lordo || '–') + ' kg'), riga('netto', 'Massa netta', (a.netto || '–') + ' kg'),
        r.unitaSup ? riga('quantita', 'Unità supplementari', (a.quantita || '–') + ' ' + r.unitaSup) : null
      ];
      if (imp()) {
        righe.push(riga('regime', 'Preferenza', r.regime ? (r.preferenza ? r.preferenza + ' · ' : '') + nomeRegime(r.regime) : '–'));
        if ((a.addizionali || []).length) righe.push(riga('addizionali', 'Codici addizionali', a.addizionali.join(', ')));
        righe.push(riga('valore', 'Prezzo dell\'articolo', a.valore ? a.valore + ' ' + d.valuta : '–'));
        if (r.quotaNolo) righe.push(['Aggiunta AK, trasporto e assicurazione (DE 14 04)', euro(r.quotaNolo)]);
        if (K.numeroIt(a.aggiunte) > 0) righe.push(['Aggiunta ' + (a.codAggiunte || '(codice mancante)') + ' (DE 14 04)', a.aggiunte + ' ' + d.valuta]);
        if (K.numeroIt(a.deduzioni) > 0) righe.push(['Detrazione ' + (a.codDeduzioni || '(codice mancante)') + ' (DE 14 04)', a.deduzioni + ' ' + d.valuta]);
        righe.push(['Valore in dogana', euro(r.valoreDogana)], riga('statistico', 'Valore statistico', euro(r.valoreStatistico)));
      } else righe.push(riga('valore', 'Valore', a.valore ? a.valore + ' ' + d.valuta : '–'), riga('statistico', 'Valore statistico', euro(r.valore)));
      if ((a.documenti || []).length) righe.push(riga('documenti', 'Documenti dichiarati', a.documenti.join(', ')));
      h += '<div class="b-st-art"><h2>Articolo ' + r.n + '</h2>' + tabella(righe);
      if (imp() && (r.tributi.length || (r.iva !== null && r.iva !== undefined))) {
        h += '<table class="tab"><thead><tr><th>Tributo (DE 14 03 039 · c. 47)</th><th>Base</th><th>Aliquota</th><th class="n">Importo</th></tr></thead><tbody>' +
          r.tributi.map(function (t) { return '<tr><td>' + esc(nomeTributo(t)) + (t.manuale ? ' (inserito a mano)' : '') + '</td><td>' + esc(baseTributo(t, r)) + '</td><td>' + esc(aliquotaTributo(t)) + '</td><td class="n">' + euro(t.importo) + '</td></tr>'; }).join('');
        if (r.iva !== null && r.iva !== undefined) {
          h += '<tr><td>B00 IVA' + (r.aliquota === 0 ? ' (esente o non imponibile' + (a.ivaMotivo ? ': ' + esc(a.ivaMotivo) : '') + ')' : '') + '</td><td>' + euro(r.baseIva) + '</td><td>' + (r.aliquota ? r.aliquota + ' %' : '0 %') + '</td><td class="n">' + euro(r.iva) + '</td></tr>';
          if (r.ivaNonPagata) h += '<tr><td>' + esc(r.ivaNonPagata.codice) + ' IVA non pagata, si detrae' + (r.ivaNonPagata.codice === '406' && a.ivaMotivo ? ' (dichiarazione d\'intento ' + esc(a.ivaMotivo) + ')' : '') +
            '</td><td>' + euro(r.iva) + '</td><td>–</td><td class="n">' + euro(r.ivaNonPagata.importo) + '</td></tr>';
        }
        h += '</tbody></table>';
      }
      h += noteArticolo(r) + '</div>';
    });
    h += riepilogoStampa(R) + piedeStampa();
    return h;
  }
  window.addEventListener('beforeprint', function () {
    if (el.hidden || !st.b || st.calcolatore) return;
    calcola();
    var s = el.querySelector('#bolla-stampa');
    if (s) s.innerHTML = imp() ? prospettoH1() : documentoStampa();
    document.body.classList.add('stampa-bolla');
  });
  window.addEventListener('afterprint', function () { document.body.classList.remove('stampa-bolla'); });

  /* ------------------------------------------------------------------ calcolatore del trasporto (js/spedizione.js) */
  function calcolatore() {
    el.innerHTML = '<div id="b-spedizione"></div>';
    var daBolla = st.calcolatore.bolla && st.b && imp(), o = { chiudi: function () { st.calcolatore = null; disegna(); window.scrollTo(0, 0); } };
    if (daBolla) {
      var arts = dati().articoli, kg = 0, colli = 0;
      arts.forEach(function (a) { var l = K.numeroIt(a.lordo), c = K.numeroIt(a.colliNumero); if (l > 0) kg += l; if (c > 0) colli += c; });
      o.bolla = { paese: dati().paese || (arts[0] && arts[0].origine) || '', kg: kg, colli: colli };
      o.usa = function (q) {
        var it = function (v) { return v ? Number(v).toFixed(2).replace('.', ',') : ''; };      // gli importi già al centesimo
        dati().nolo = { importo: it(q.confine), valuta: 'EUR' };
        dati().inoltro = { importo: it(q.destinazione), valuta: 'EUR' };
        dati().assicurazione = { importo: it(q.assicurazione), valuta: 'EUR' };
        st.salvata = false; st.calcolatore = null;
        st.msg = 'Trasporto DHL Express riportato: ' + app().euro(q.confine) + ' fino al confine UE (' + String(q.quota).replace('.', ',') + ' %), ' + app().euro(q.destinazione) +
          ' fino a destinazione' + (q.assicurazione ? ', ' + app().euro(q.assicurazione) + ' di assicurazione' : '') + '.';
        st.msgOk = true;
        disegna(); window.scrollTo(0, 0);
      };
    }
    if (T.spedizione) T.spedizione.apri(el.firstChild, o);
  }

  /* ------------------------------------------------------------------ eventi */
  function imposta(path, valore) {
    if (path === 'riferimento') { st.b.riferimento = valore; return; }
    var p = path.split('.'), o = dati();
    if (p.length === 2) { o[p[0]] = o[p[0]] || {}; o[p[0]][p[1]] = valore; } else o[path] = valore;
  }
  el.addEventListener('input', function (ev) {
    var t = ev.target, f = t.getAttribute('data-f');
    if (!st.b || !f || t.tagName === 'SELECT' || t.type === 'date' || t.type === 'checkbox' || f === 'valuta') return;      // la valuta vale a fine scrittura
    var k = t.getAttribute('data-a');
    if (k !== null) dati().articoli[+k][f] = t.value; else imposta(f, t.value);
    st.salvata = false;
    if (f === 'codice') { var a = dati().articoli[+k], c = t.value.replace(/\D/g, ''); if (c.length === 10 || !c) { a.codice = c; disegnaOpzioni(+k); } }
    piuTardi();
  });
  el.addEventListener('change', function (ev) {
    var t = ev.target;
    if (!st.b) return;
    var k = t.getAttribute('data-a'), f = t.getAttribute('data-f');
    st.salvata = false;
    if (t.hasAttribute('data-doc')) {
      var a = dati().articoli[+k], c = t.getAttribute('data-doc');
      a.documenti = (a.documenti || []).filter(function (x) { return x !== c; });
      if (t.checked) a.documenti.push(c);
      disegnaOpzioni(+k); calcola(); return;
    }
    if (t.hasAttribute('data-addizionale')) {
      var b = dati().articoli[+k], gruppo = t.getAttribute('data-addizionale').split(' ');
      b.addizionali = (b.addizionali || []).filter(function (x) { return gruppo.indexOf(x) < 0; });
      if (t.value) {
        b.addizionali.push(t.value);
        // lo stesso produttore anche nelle altre famiglie che hanno il suo codice e non ne hanno ancora uno scelto
        Array.prototype.forEach.call(el.querySelectorAll('[data-a="' + k + '"][data-addizionale]'), function (s) {
          var cod = s.getAttribute('data-addizionale').split(' ');
          if (s !== t && cod.indexOf(t.value) >= 0 && !cod.some(function (c) { return b.addizionali.indexOf(c) >= 0; })) b.addizionali.push(t.value);
        });
      }
      disegnaOpzioni(+k); calcola(); return;
    }
    if (!f) return;
    var v = f === 'iva' ? Number(t.value) : t.type === 'checkbox' ? t.checked : t.value;
    if (k !== null) {
      var art = dati().articoli[+k];
      art[f] = f === 'codice' ? String(v).replace(/\D/g, '') : v;
      if (f === 'codice') t.value = art.codice;
      if (f === 'codice' || f === 'origine' || f === 'regime' || f === 'iva' || f === 'ivaNonPagata') disegnaOpzioni(+k);
      calcola(); return;
    }
    if (f === 'valuta') {
      v = String(v).trim().toUpperCase();
      if (!/^[A-Z]{3}$/.test(v)) { t.value = dati().valuta; messaggio('Valuta: scrivi il codice di tre lettere (per esempio USD).', false); return; }
      t.value = v;
    }
    imposta(f, v);
    if (f === 'valuta') {                                   // le spese seguono la valuta della fattura o restano in euro
      ['nolo', 'assicurazione', 'inoltro', 'trasporto', 'oltre', 'statSpese'].forEach(function (x) {
        var s = dati()[x] = dati()[x] || { importo: '', valuta: 'EUR' };
        if (s.valuta !== 'EUR' || (x !== 'inoltro' && x !== 'statSpese' && !String(s.importo || '').trim())) s.valuta = v;   // spese ancora vuote: in valuta
      });
      disegna(); caricaCambio(); return;
    }
    if (f === 'data') { disegnaOpzioniTutte(); disegnaStorico(); caricaCambio(); return; }
    if (f === 'paese') { disegnaOpzioniTutte(); }
    calcola();
  });
  el.addEventListener('click', function (ev) {
    var b = ev.target.closest('[data-b]');
    if (!b) return;
    var azione = b.getAttribute('data-b'), id = b.getAttribute('data-id');
    if (azione === 'nuova') { st.b = nuovaBolla(b.getAttribute('data-tipo')); dati().articoli.push(nuovoArticolo('')); st.salvata = true; st.msg = ''; disegna(); }
    else if (azione === 'apri') apri(id);
    else if (azione === 'elimina-elenco' || azione === 'elimina') {
      var bid = azione === 'elimina' ? st.b.id : id;
      if (!window.confirm('Eliminare questa bolla?')) return;
      T.api('DELETE', '/api/bolle/' + bid).then(function () {
        if (st.b && st.b.id === +bid) st.b = null;
        st.msg = 'Bolla eliminata.'; st.msgOk = true; return caricaElenco();
      }, function (e) { st.msg = e.errore || 'Non eliminata.'; st.msgOk = false; }).then(disegna);
    }
    else if (azione === 'chiudi') {
      if (!st.salvata && !window.confirm('Ci sono modifiche non salvate: chiudere lo stesso?')) return;
      st.b = null; st.msg = ''; disegna(); caricaElenco();
    }
    else if (azione === 'salva') salva();
    else if (azione === 'stampa') window.print();
    else if (azione === 'duplica') {
      var rc = String(st.b.riferimento || '').trim().slice(0, 112);         // con « (copia)» resta nei 120 caratteri del server
      st.b = { id: null, tipo: st.b.tipo, riferimento: (rc ? rc + ' ' : '') + '(copia)', dati: JSON.parse(JSON.stringify(dati())) };
      st.salvata = false; st.msg = 'Copia non ancora salvata.'; st.msgOk = true; disegna();
    }
    else if (azione === 'aggiungi') { dati().articoli.push(nuovoArticolo(dati().paese)); st.salvata = false; disegna(); var u = el.querySelectorAll('.articolo'); if (u.length) u[u.length - 1].querySelector('.codice').focus(); }
    else if (azione === 'togli') { dati().articoli.splice(+b.getAttribute('data-a'), 1); st.salvata = false; disegna(); }
    else if (azione === 'vai') vaiAlCampo(b.getAttribute('data-a'), b.getAttribute('data-c'));
    else if (azione === 'storico') {
      var v = b.getAttribute('data-v');
      b.disabled = true;
      salva().then(function () {
        b.disabled = false;
        if (st.b && st.b.id && st.salvata) location.href = app().urlStorico(v, 0, { bolla: st.b.id }) + '#bolla';
      });
    }
    else if (azione === 'riprova-cambio') { delete st.cambi[chiaveCambio()]; caricaCambio(); }
    else if (azione === 'trasporto') { st.calcolatore = { bolla: false }; disegna(); window.scrollTo(0, 0); }
    else if (azione === 'trasporto-bolla') { st.calcolatore = { bolla: true }; disegna(); window.scrollTo(0, 0); }
    else if (azione === 'togli-cod') {
      var ar = dati().articoli[+b.getAttribute('data-a')], cod = b.getAttribute('data-c');
      ar.addizionali = (ar.addizionali || []).filter(function (x) { return x !== cod; });
      st.salvata = false; disegnaOpzioni(+b.getAttribute('data-a')); calcola();
    }
  });
  window.addEventListener('beforeunload', function (ev) { if (st.b && !st.salvata) { ev.preventDefault(); ev.returnValue = ''; } });
  T.bolla = { stato: function () { return st; } };                 // per le prove nel browser
})();
