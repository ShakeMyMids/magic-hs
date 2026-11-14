/* MAGIC HS - vista Bolla: simulazione di una bolla d'importazione (immissione in libera pratica) o d'esportazione, con
   più articoli, salvata nel profilo (/api/bolle) e stampabile. I calcoli sono in js/calcolo.js (TARIC_CALCOLO), le
   misure del giorno della bolla vengono da app.js (T.app.misureBolla), il cambio doganale del mese da /api/cambio.
   I campi non si ridisegnano mentre si scrive: si aggiornano solo le parti calcolate (opzioni dell'articolo e risultati). */
(function () {
  'use strict';
  var T = window.TARIC, esc = T.esc, K = window.TARIC_CALCOLO;
  var el = document.getElementById('view-bolla');
  var vista = T.viste = T.viste || {};
  var st = { elenco: null, b: null, cambi: {}, msg: '', msgOk: false, salvata: true, timer: 0, ultimo: null };
  var VALUTE = ['EUR', 'USD', 'CNY', 'GBP', 'CHF', 'JPY', 'TRY', 'INR', 'KRW', 'HKD', 'CAD', 'AUD', 'SGD', 'THB', 'MYR', 'IDR', 'PHP',
    'PLN', 'CZK', 'HUF', 'RON', 'SEK', 'NOK', 'DKK', 'ISK', 'ILS', 'MXN', 'BRL', 'ZAR', 'NZD'];
  var IVA = [[22, '22 %'], [10, '10 %'], [5, '5 %'], [4, '4 %'], [0, 'non dovuta']];

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
      regime: 'base', addizionali: [], documenti: [], iva: 22 };
  }
  function nuovaBolla(tipo) {
    return { id: null, tipo: tipo, riferimento: '', dati: { data: oggiIso(), valuta: 'EUR', nolo: { importo: '', valuta: 'EUR' }, assicurazione: { importo: '', valuta: 'EUR' },
      ripartizione: 'valore', inoltro: { importo: '', valuta: 'EUR' }, paese: '', articoli: [] } };
  }

  vista.bolla = {
    mostra: function () { if (!st.elenco) caricaElenco(); disegna(); },
    /* le misure di un capitolo sono arrivate: ricalcola */
    capitolo: function () { if (st.b && !el.hidden) { disegnaOpzioniTutte(); calcola(); } },
    /* «Aggiungi alla bolla» dalla scheda del codice */
    aggiungi: function (codice, paese, flusso) {
      var tipo = flusso === 'export' ? 'export' : 'import';
      if (!st.b || st.b.tipo !== tipo) { st.b = nuovaBolla(tipo); st.salvata = true; }
      var a = nuovoArticolo(paese || dati().paese);
      a.codice = codice;
      var vuoto = dati().articoli.filter(function (x) { return !x.codice; })[0];
      if (vuoto) { vuoto.codice = codice; if (paese) vuoto.origine = paese; } else dati().articoli.push(a);
      st.salvata = false;
      st.msg = 'Articolo ' + app().grp(codice) + ' aggiunto alla bolla.'; st.msgOk = true;
      if (!el.hidden) disegna();
    }
  };

  /* ------------------------------------------------------------------ elenco e salvataggio */
  function caricaElenco() {
    return T.api('GET', '/api/bolle').then(function (r) { st.elenco = r.voci; if (!st.b) disegna(); }, function () { st.elenco = []; });
  }
  function apri(id) {
    T.api('GET', '/api/bolle/' + id).then(function (r) {
      st.b = { id: r.id, tipo: r.tipo, riferimento: r.riferimento, dati: r.dati };
      dati().articoli = dati().articoli || [];
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
      .then(function (r) { st.cambi[k] = r; }, function (e) { st.cambi[k] = { errore: e.errore || 'Cambio non disponibile.' }; })
      .then(function () { disegnaCambio(); calcola(); });
  }
  function cambioAttuale() { return st.b && dati().valuta !== 'EUR' ? st.cambi[chiaveCambio()] : null; }
  function disegnaCambio() {
    var c = el.querySelector('#b-cambio');
    if (!c) return;
    var v = dati().valuta, r = cambioAttuale();
    if (v === 'EUR') c.innerHTML = '<p class="nota">Valori in euro: nessun cambio.</p>';
    else if (!r || r.attesa) c.innerHTML = '<p class="nota">Cerco il cambio doganale…</p>';
    else if (r.errore) c.innerHTML = '<p class="errore">' + esc(r.errore) + ' <button class="link" type="button" data-b="riprova-cambio">Riprova</button></p>';
    else c.innerHTML = '<p class="esito-ok">1 € = ' + esc(nIt(r.tasso, 4)) + ' ' + esc(v) + ' · cambio doganale di ' + esc(meseIt(r.mese)) + ' (' + esc(r.fonte) + ')</p>';
  }
  function meseIt(m) {
    var nomi = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
    return /^\d{4}-\d{2}$/.test(m || '') ? nomi[+m.slice(5, 7) - 1] + ' ' + m.slice(0, 4) : '';
  }

  /* ------------------------------------------------------------------ misure e calcolo */
  function misure(a) {
    var paese = a.origine || dati().paese;
    if (!giorno()) return { errore: 'Indica la data della bolla.' };
    return app().misureBolla(a.codice, imp() ? 'import' : 'export', paese, giorno());
  }
  function contesto() {
    var cambi = {}, r = cambioAttuale();
    if (r && r.tasso) cambi[dati().valuta] = { tasso: r.tasso };
    return { misure: misure, cambi: cambi, nomeMisura: function (m) { return app().tipoMisura(m.t); } };
  }
  function calcola() {
    clearTimeout(st.timer);
    if (!st.b) return;
    var ctx = contesto();
    st.ultimo = imp() ? K.calcolaImport(dati(), ctx) : K.calcolaExport(dati(), ctx);
    var e = el.querySelector('#b-esito');
    if (e) e.innerHTML = imp() ? esitoImport(st.ultimo) : esitoExport(st.ultimo);
    var s = el.querySelector('#b-stato');
    if (s) s.textContent = st.salvata ? '' : 'modifiche non salvate';
  }
  function piuTardi() { clearTimeout(st.timer); st.timer = setTimeout(calcola, 250); }

  /* ------------------------------------------------------------------ disegno */
  function disegna() {
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
    h += '<div class="foglio"><div class="box"><div class="lab">' + T.icona(imp() ? 'percento' : 'pacco') + (imp() ? 'Tributi (casella 47)' : 'Riepilogo') + '</div><div id="b-esito"></div></div></div>';
    h += '<div id="bolla-stampa" class="solo-stampa"></div>';
    el.innerHTML = h;
    disegnaCambio();
    disegnaOpzioniTutte();
    calcola();
  }

  function elenco() {
    var h = '<div class="foglio"><div class="box"><div class="lab">' + T.icona('pacco') + 'Bolla simulata</div>' +
      '<p class="nota">Prepara una bolla con più articoli e i dati TARIC del ' + esc(app().dati().it) + ': valore in dogana, dazi, antidumping, IVA e documenti. ' +
      'Quello che non si può calcolare con certezza resta in evidenza, senza stime.</p>' + rigaMsg() +
      '<div class="fila"><button class="btn pri" type="button" data-b="nuova" data-tipo="import">' + T.icona('piu') + 'Nuova importazione</button>' +
      '<button class="btn" type="button" data-b="nuova" data-tipo="export">' + T.icona('piu') + 'Nuova esportazione</button></div></div></div>';
    var L = st.elenco;
    h += '<div class="foglio"><div class="box"><div class="lab">' + T.icona('storico') + 'Le tue bolle<span class="dx">' + (L ? L.length : '') + '</span></div>';
    if (!L) h += '<p class="vuoto">Carico…</p>';
    else if (!L.length) h += '<p class="vuoto">Nessuna bolla salvata.</p>';
    else h += '<div class="scorri"><table class="tab"><thead><tr><th>Riferimento</th><th>Tipo</th><th>Data</th><th class="n">Articoli</th><th>Modificata</th><th></th></tr></thead><tbody>' +
      L.map(function (v) {
        return '<tr><td>' + esc(v.riferimento || 'senza riferimento') + '</td><td data-l="Tipo">' + (v.tipo === 'import' ? 'importazione' : 'esportazione') + '</td>' +
          '<td data-l="Data">' + esc(dataIt(v.data || '')) + '</td><td class="n" data-l="Articoli">' + (v.articoli || 0) + '</td><td data-l="Modificata">' + esc(T.dataOra(v.modificata)) + '</td>' +
          '<td class="azioni"><button class="btn sm" type="button" data-b="apri" data-id="' + v.id + '">Apri</button>' +
          '<button class="btn sm" type="button" data-b="elimina-elenco" data-id="' + v.id + '">Elimina</button></td></tr>';
      }).join('') + '</tbody></table></div>';
    return h + '</div></div>';
  }

  function campo(etichetta, f, valore, extra) {
    return '<label>' + etichetta + '<input class="campo" data-f="' + f + '" value="' + esc(valore === undefined || valore === null ? '' : valore) + '"' + (extra || '') + '></label>';
  }
  function opzioniPaesi(scelto) {
    var fr = app().frequenti(), tutti = app().paesi();
    return '<option value="">scegli…</option><optgroup label="Più frequenti">' +
      fr.map(function (x) { return '<option value="' + x + '"' + (x === scelto ? ' selected' : '') + '>' + esc(app().nomeArea(x)) + ' (' + x + ')</option>'; }).join('') +
      '</optgroup><optgroup label="Tutti">' +
      tutti.map(function (p) { return '<option value="' + p[1] + '"' + (p[1] === scelto && fr.indexOf(scelto) < 0 ? ' selected' : '') + '>' + esc(p[0]) + ' (' + p[1] + ')</option>'; }).join('') + '</optgroup>';
  }
  function sceltaValuta(f, x) {
    var v = dati().valuta;
    return '<select class="campo corto" data-f="' + f + '">' + (v === 'EUR' ? ['EUR'] : ['EUR', v]).map(function (c) {
      return '<option' + ((x.valuta || 'EUR') === c ? ' selected' : '') + '>' + c + '</option>';
    }).join('') + '</select>';
  }
  function intestazione() {
    var d = dati(), h = '<div class="b-campi">' +
      campo('Riferimento (fattura, pratica)', 'riferimento', st.b.riferimento, ' maxlength="120" autocomplete="off"') +
      '<label>Data prevista della bolla<input class="campo" type="date" data-f="data" value="' + esc(d.data || '') + '"></label>' +
      '<label>Valuta della fattura<select class="campo" data-f="valuta">' + VALUTE.map(function (c) { return '<option' + (d.valuta === c ? ' selected' : '') + '>' + c + '</option>'; }).join('') +
      (VALUTE.indexOf(d.valuta) < 0 ? '<option selected>' + esc(d.valuta) + '</option>' : '') + '</select></label>' +
      '<label>' + (imp() ? 'Origine predefinita' : 'Destinazione') + '<select class="campo" data-f="paese">' + opzioniPaesi(d.paese) + '</select></label></div>' +
      '<div id="b-cambio"></div>';
    if (imp()) {
      h += '<div class="b-campi">' +
        '<label>Trasporto fino al confine UE<span class="con-valuta"><input class="campo" data-f="nolo.importo" inputmode="decimal" autocomplete="off" value="' + esc(d.nolo.importo) + '" placeholder="0,00">' + sceltaValuta('nolo.valuta', d.nolo) + '</span></label>' +
        '<label>Assicurazione fino al confine UE<span class="con-valuta"><input class="campo" data-f="assicurazione.importo" inputmode="decimal" autocomplete="off" value="' + esc(d.assicurazione.importo) + '" placeholder="0,00">' + sceltaValuta('assicurazione.valuta', d.assicurazione) + '</span></label>' +
        '<label>Ripartizione sugli articoli<select class="campo" data-f="ripartizione"><option value="valore"' + (d.ripartizione !== 'massa' ? ' selected' : '') + '>in base al valore</option>' +
        '<option value="massa"' + (d.ripartizione === 'massa' ? ' selected' : '') + '>in base alla massa lorda</option></select></label>' +
        '<label>Spese dal confine UE a destinazione<span class="con-valuta"><input class="campo" data-f="inoltro.importo" inputmode="decimal" autocomplete="off" value="' + esc(d.inoltro.importo) + '" placeholder="0,00">' + sceltaValuta('inoltro.valuta', d.inoltro) + '</span></label></div>' +
        '<p class="nota">Trasporto e assicurazione fino al confine UE entrano nel valore in dogana se non sono già nel prezzo (per esempio franco fabbrica o FOB); le spese fino a destinazione solo nella base dell\'IVA.</p>';
    }
    return h;
  }

  function articolo(a, k) {
    var f = function (nome) { return 'data-a="' + k + '" data-f="' + nome + '"'; };
    var v = function (nome) { return esc(a[nome] === undefined || a[nome] === null ? '' : a[nome]); };
    var h = '<div class="foglio"><div class="box articolo" data-art="' + k + '"><div class="lab">' + T.icona('container') + 'Articolo ' + (k + 1) +
      '<span class="dx"><button class="link" type="button" data-b="togli" data-a="' + k + '">togli</button></span></div><div class="b-campi">' +
      '<label>Codice (casella 33)<input class="campo codice" ' + f('codice') + ' value="' + v('codice') + '" inputmode="numeric" maxlength="13" autocomplete="off" placeholder="10 cifre"></label>' +
      '<label>' + (imp() ? 'Origine (casella 34)' : 'Destinazione') + '<select class="campo" ' + f('origine') + '>' + opzioniPaesi(a.origine) + '</select></label>' +
      '<label class="largo">Descrizione della merce<input class="campo" ' + f('descrizione') + ' value="' + v('descrizione') + '" maxlength="300" autocomplete="off"></label>' +
      '<label>' + (imp() ? 'Prezzo in fattura' : 'Valore') + ' (' + esc(dati().valuta) + ')<input class="campo" ' + f('valore') + ' value="' + v('valore') + '" inputmode="decimal" autocomplete="off"></label>' +
      '<label>Massa netta in kg (casella 38)<input class="campo" ' + f('netto') + ' value="' + v('netto') + '" inputmode="decimal" autocomplete="off"></label>' +
      '<label>Massa lorda in kg (casella 35)<input class="campo" ' + f('lordo') + ' value="' + v('lordo') + '" inputmode="decimal" autocomplete="off"></label>' +
      '</div><div class="b-desc nota" data-desc="' + k + '"></div><div class="b-opz" data-opz="' + k + '"></div>';
    if (imp()) h += '<details class="piu"><summary>Altri elementi del valore in dogana</summary><div class="b-campi">' +
      '<label>Da aggiungere (' + esc(dati().valuta) + ')<input class="campo" ' + f('aggiunte') + ' value="' + v('aggiunte') + '" inputmode="decimal" autocomplete="off" placeholder="commissioni, imballaggi, diritti di licenza…"></label>' +
      '<label>Da togliere (' + esc(dati().valuta) + ')<input class="campo" ' + f('deduzioni') + ' value="' + v('deduzioni') + '" inputmode="decimal" autocomplete="off" placeholder="trasporto dopo il confine UE compreso nel prezzo…"></label></div></details>';
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
    if (!M || M.errore) { box.innerHTML = ''; return; }
    var h = '<div class="b-campi">';
    if (M.unitaSup || M.unitaQta) {
      h += '<label>' + (M.unitaSup ? 'Unità supplementari (casella 41): ' + esc(M.unitaSupNome) : 'Quantità per il dazio: ' + esc(M.unitaQtaNome)) +
        '<input class="campo" data-a="' + k + '" data-f="quantita" value="' + esc(a.quantita || '') + '" inputmode="decimal" autocomplete="off"></label>';
      if (M.unitaQta && M.unitaSupCodice && M.unitaQta !== M.unitaSupCodice)
        h += '<label>Quantità per il dazio: ' + esc(M.unitaQtaNome) + '<input class="campo" data-a="' + k + '" data-f="quantitaDazio" value="' + esc(a.quantitaDazio || '') + '" inputmode="decimal" autocomplete="off"></label>';
    }
    if (imp()) {
      var reg = K.regimi(M.righe, g), trovato = false;
      h += '<label class="largo">Regime tariffario (casella 36)<select class="campo" data-a="' + k + '" data-f="regime">' + reg.map(function (r) {
        var sel = r.id === (a.regime || 'base'); if (sel) trovato = true;
        return '<option value="' + esc(r.id) + '"' + (sel ? ' selected' : '') + '>' + esc(nomeRegime(r)) + '</option>';
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
      h += '<label>IVA<select class="campo" data-a="' + k + '" data-f="iva">' + IVA.map(function (x) {
        return '<option value="' + x[0] + '"' + (Number(a.iva === undefined ? 22 : a.iva) === x[0] ? ' selected' : '') + '>' + x[1] + '</option>';
      }).join('') + '</select></label>';
    }
    h += '</div>' + documenti(a, k, M, g);
    box.innerHTML = h;
  }
  function sceltaCodice(k, a, etichetta, misureConCodice) {
    var codici = misureConCodice.map(function (m) { return m.add; });
    var scelto = codici.filter(function (c) { return (a.addizionali || []).indexOf(c) >= 0; })[0] || '';
    return '<label class="largo">' + esc(etichetta) + '<select class="campo" data-a="' + k + '" data-addizionale="' + esc(codici.join(' ')) + '"><option value="">scegli…</option>' +
      misureConCodice.map(function (m) {
        return '<option value="' + esc(m.add) + '"' + (m.add === scelto ? ' selected' : '') + '>' + esc(m.add + ' · ' + taglia(app().addizionale(m.add) || '', 60) + ' · ' + dazioBreve(m.duty)) + '</option>';
      }).join('') + '</select></label>';
  }
  function taglia(s, n) { s = String(s || '').split('\n')[0]; return s.length > n ? s.slice(0, n - 1).trim() + '…' : s; }
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
      h += '<details class="piu b-controlli"' + (mancano ? ' open' : '') + '><summary>Documenti e controlli (casella 44)' +
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
  function avvertenzeHtml(R) {
    var av = [];
    R.articoli.forEach(function (r) { r.avvertenze.forEach(function (t) { av.push('<li><b>Articolo ' + r.n + '</b>: ' + esc(prima(t)) + '</li>'); }); });
    return av.length ? '<div class="b-avvisi"><p class="et">Da tenere presente</p><ul>' + av.join('') + '</ul></div>' : '';
  }
  function nomeTributo(t) { return prima(t.tipo) + (t.misura && t.misura.add ? ' (' + t.misura.add + ')' : ''); }
  function esitoImport(R) {
    var h = blocchiHtml(R);
    if (!R.articoli.length) return h + '<p class="vuoto">Aggiungi un articolo.</p>';
    h += '<div class="scorri"><table class="tab b-tab"><thead><tr><th>Art.</th><th>Codice</th><th class="n">Valore in dogana</th><th>Tributi</th><th class="n">Base IVA</th><th class="n">IVA</th></tr></thead><tbody>' +
      R.articoli.map(function (r) {
        return '<tr' + (r.completo ? '' : ' class="incompleto"') + '><td>' + r.n + '</td><td data-l="Codice">' + esc(r.codice ? app().grp(String(r.codice).replace(/\D/g, '')) : '–') + '</td>' +
          '<td class="n" data-l="Valore in dogana">' + euro(r.valoreDogana) + (r.quotaNolo ? '<span class="piccolo">di cui trasporto e assicurazione ' + euro(r.quotaNolo) + '</span>' : '') + '</td>' +
          '<td data-l="Tributi">' + (r.tributi.length ? r.tributi.map(function (t) {
            return '<div class="b-trib"><span>' + esc(nomeTributo(t)) + ' <span class="piccolo">' + esc(t.espressione ? app().fmtDazio(t.espressione) : 'esente') + '</span></span><b>' + euro(t.importo) + '</b></div>';
          }).join('') : '–') + '</td>' +
          '<td class="n" data-l="Base IVA">' + euro(r.baseIva) + '</td><td class="n" data-l="IVA">' + (r.iva === null || r.iva === undefined ? '–' : euro(r.iva) + '<span class="piccolo">' + (r.aliquota ? r.aliquota + ' %' : 'non dovuta') + '</span>') + '</td></tr>';
      }).join('') + '</tbody></table></div>';
    var T0 = R.totali;
    if (T0) {
      h += '<table class="tab b-totali"><tbody><tr><td>Valore in dogana</td><td class="n">' + euro(T0.valoreDogana) + '</td></tr>' +
        Object.keys(T0.dazi).map(function (k) { return '<tr><td>' + esc(prima(k)) + '</td><td class="n">' + euro(T0.dazi[k]) + '</td></tr>'; }).join('') +
        '<tr><td>IVA all\'importazione</td><td class="n">' + euro(T0.iva) + '</td></tr>' +
        '<tr class="evid"><td><b>Totale tributi</b></td><td class="n"><b>' + euro(T0.totale) + '</b></td></tr></tbody></table>';
    } else h += '<p class="nota">Il totale compare quando tutti gli articoli sono completi e calcolabili.</p>';
    return h + avvertenzeHtml(R);
  }
  function esitoExport(R) {
    var h = blocchiHtml(R);
    if (!R.articoli.length) return h + '<p class="vuoto">Aggiungi un articolo.</p>';
    h += '<div class="scorri"><table class="tab b-tab"><thead><tr><th>Art.</th><th>Codice</th><th class="n">Valore statistico</th><th>Documenti</th></tr></thead><tbody>' +
      R.articoli.map(function (r) {
        var c = r.controlli || [], mancano = c.filter(function (x) { return x.esito === 'manca' || x.esito === 'vietata'; }).length;
        return '<tr' + (r.completo ? '' : ' class="incompleto"') + '><td>' + r.n + '</td><td data-l="Codice">' + esc(r.codice ? app().grp(String(r.codice).replace(/\D/g, '')) : '–') + '</td>' +
          '<td class="n" data-l="Valore statistico">' + euro(r.valore) + '</td><td data-l="Documenti">' + (!c.length ? 'nessun controllo' : mancano ? mancano + ' da sistemare' : 'a posto') + '</td></tr>';
      }).join('') + '</tbody></table></div>';
    if (R.totali) h += '<table class="tab b-totali"><tbody><tr class="evid"><td><b>Valore statistico totale</b></td><td class="n"><b>' + euro(R.totali.valore) + '</b></td></tr></tbody></table>';
    h += '<p class="nota">All\'esportazione il TARIC non prevede dazi: contano i divieti, le licenze e i documenti di ogni articolo.</p>';
    return h + avvertenzeHtml(R);
  }

  /* ------------------------------------------------------------------ stampa */
  function documentoStampa() {
    var R = st.ultimo, d = dati(), c = cambioAttuale();
    if (!R) return '';
    var h = '<div class="b-st-testa"><p class="b-st-sim">SIMULAZIONE · non è una dichiarazione doganale e non ha valore legale</p>' +
      '<h1>' + (imp() ? 'Bolla d\'importazione simulata (immissione in libera pratica)' : 'Bolla d\'esportazione simulata') + '</h1>' +
      '<p>' + (st.b.riferimento ? 'Riferimento: <b>' + esc(st.b.riferimento) + '</b> · ' : '') + 'Data prevista: <b>' + esc(dataIt(d.data)) + '</b> · Dati TARIC al ' + esc(app().dati().it) +
      ' · Valuta: ' + esc(d.valuta) + (c && c.tasso ? ' · Cambio: 1 € = ' + esc(nIt(c.tasso, 4)) + ' ' + esc(d.valuta) + ' (' + esc(c.fonte) + ')' : '') + '</p>';
    if (imp()) h += '<p>Trasporto e assicurazione fino al confine UE: ' + euro(R.noloEur) + ' (ripartiti in base ' + (d.ripartizione === 'massa' ? 'alla massa lorda' : 'al valore') + ') · Spese fino a destinazione: ' + euro(R.inoltroEur) + '</p>';
    h += '</div>';
    R.articoli.forEach(function (r) {
      var a = d.articoli[r.n - 1] || {};
      var righe = [
        ['Codice (33)', r.codice ? app().grp(String(r.codice).replace(/\D/g, '')) : '–'],
        [imp() ? 'Origine (34)' : 'Destinazione', a.origine || d.paese ? app().nomeArea(a.origine || d.paese) + ' (' + (a.origine || d.paese) + ')' : '–'],
        ['Massa lorda (35) / netta (38)', (a.lordo || '–') + ' kg / ' + (a.netto || '–') + ' kg'],
      ];
      if (a.descrizione) righe.splice(2, 0, ['Merce', a.descrizione]);
      if (r.unitaSup) righe.push(['Unità supplementari (41)', (a.quantita || '–') + ' ' + r.unitaSup]);
      if (imp()) {
        righe.push(['Regime tariffario (36)', r.regime ? nomeRegime(r.regime) : '–']);
        if ((a.addizionali || []).length) righe.push(['Codici addizionali', a.addizionali.join(', ')]);
        righe.push(['Valore in dogana', euro(r.valoreDogana) + (r.quotaNolo ? ' (di cui trasporto e assicurazione ' + euro(r.quotaNolo) + ')' : '')]);
      } else righe.push(['Valore statistico (46)', euro(r.valore)]);
      if ((a.documenti || []).length) righe.push(['Documenti dichiarati (44)', a.documenti.join(', ')]);
      h += '<div class="b-st-art"><h2>Articolo ' + r.n + '</h2><table class="tab"><tbody>' + righe.map(function (x) { return '<tr><th>' + esc(x[0]) + '</th><td>' + esc(x[1]) + '</td></tr>'; }).join('') + '</tbody></table>';
      if (imp() && r.tributi.length) h += '<table class="tab"><thead><tr><th>Tributo (47)</th><th>Base</th><th>Aliquota</th><th class="n">Importo</th></tr></thead><tbody>' +
        r.tributi.map(function (t) { return '<tr><td>' + esc(nomeTributo(t)) + '</td><td>valore in dogana</td><td>' + esc(t.espressione ? app().fmtDazio(t.espressione) : 'esente') + '</td><td class="n">' + euro(t.importo) + '</td></tr>'; }).join('') +
        (r.iva !== null && r.iva !== undefined ? '<tr><td>IVA</td><td>' + euro(r.baseIva) + '</td><td>' + (r.aliquota ? r.aliquota + ' %' : 'non dovuta') + '</td><td class="n">' + euro(r.iva) + '</td></tr>' : '') + '</tbody></table>';
      var note = r.blocchi.concat(r.avvertenze);
      (r.controlli || []).forEach(function (x) { if (x.esito === 'da_verificare') note.push(app().tipoMisura(x.misura.t) + ': da verificare su AIDA'); });
      if (note.length) h += '<ul class="b-st-note">' + note.map(function (t) { return '<li>' + esc(prima(t)) + '</li>'; }).join('') + '</ul>';
      h += '</div>';
    });
    if (imp() && R.totali) h += '<div class="b-st-art"><h2>Riepilogo</h2><table class="tab"><tbody><tr><th>Valore in dogana</th><td class="n">' + euro(R.totali.valoreDogana) + '</td></tr>' +
      Object.keys(R.totali.dazi).map(function (k) { return '<tr><th>' + esc(prima(k)) + '</th><td class="n">' + euro(R.totali.dazi[k]) + '</td></tr>'; }).join('') +
      '<tr><th>IVA all\'importazione</th><td class="n">' + euro(R.totali.iva) + '</td></tr><tr><th>Totale tributi</th><td class="n"><b>' + euro(R.totali.totale) + '</b></td></tr></tbody></table></div>';
    else if (!imp() && R.totali) h += '<div class="b-st-art"><h2>Riepilogo</h2><table class="tab"><tbody><tr><th>Valore statistico totale</th><td class="n"><b>' + euro(R.totali.valore) + '</b></td></tr></tbody></table></div>';
    else h += '<p class="b-st-sim">Simulazione incompleta: ' + R.blocchi.length + ' punti da completare o verificare (vedi le note degli articoli).</p>';
    h += '<p class="b-st-piede">Calcolata da MAGIC HS il ' + esc(dataIt(oggiIso())) + ' con i dati TARIC al ' + esc(app().dati().it) + '. Non comprende accise, misure nazionali e saldo dei contingenti; ' +
      'le misure cambiate dopo quella data non ci sono. Verifica sempre su AIDA prima di dichiarare.</p>';
    return h;
  }
  window.addEventListener('beforeprint', function () {
    if (el.hidden || !st.b) return;
    calcola();
    var s = el.querySelector('#bolla-stampa');
    if (s) s.innerHTML = documentoStampa();
    document.body.classList.add('stampa-bolla');
  });
  window.addEventListener('afterprint', function () { document.body.classList.remove('stampa-bolla'); });

  /* ------------------------------------------------------------------ eventi */
  function imposta(path, valore) {
    if (path === 'riferimento') { st.b.riferimento = valore; return; }
    var p = path.split('.'), o = dati();
    if (p.length === 2) { o[p[0]] = o[p[0]] || {}; o[p[0]][p[1]] = valore; } else o[path] = valore;
  }
  el.addEventListener('input', function (ev) {
    var t = ev.target, f = t.getAttribute('data-f');
    if (!st.b || !f || t.tagName === 'SELECT' || t.type === 'date') return;
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
    var v = f === 'iva' ? Number(t.value) : t.value;
    if (k !== null) {
      var art = dati().articoli[+k];
      art[f] = f === 'codice' ? String(v).replace(/\D/g, '') : v;
      if (f === 'codice') t.value = art.codice;
      if (f === 'codice' || f === 'origine' || f === 'regime') disegnaOpzioni(+k);
      calcola(); return;
    }
    imposta(f, v);
    if (f === 'valuta') {                                   // le spese seguono la valuta della fattura o restano in euro
      ['nolo', 'assicurazione', 'inoltro'].forEach(function (x) {
        var s = dati()[x];
        if (s.valuta !== 'EUR' || (x !== 'inoltro' && !String(s.importo || '').trim())) s.valuta = v;   // nolo e assicurazione ancora vuoti: in valuta
      });
      disegna(); caricaCambio(); return;
    }
    if (f === 'data') { disegnaOpzioniTutte(); caricaCambio(); return; }
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
    else if (azione === 'duplica') { st.b = { id: null, tipo: st.b.tipo, riferimento: (st.b.riferimento ? st.b.riferimento + ' ' : '') + '(copia)', dati: JSON.parse(JSON.stringify(dati())) }; st.salvata = false; st.msg = 'Copia non ancora salvata.'; st.msgOk = true; disegna(); }
    else if (azione === 'aggiungi') { dati().articoli.push(nuovoArticolo(dati().paese)); st.salvata = false; disegna(); var u = el.querySelectorAll('.articolo'); if (u.length) u[u.length - 1].querySelector('.codice').focus(); }
    else if (azione === 'togli') { dati().articoli.splice(+b.getAttribute('data-a'), 1); st.salvata = false; disegna(); }
    else if (azione === 'riprova-cambio') { delete st.cambi[chiaveCambio()]; caricaCambio(); }
  });
  window.addEventListener('beforeunload', function (ev) { if (st.b && !st.salvata) { ev.preventDefault(); ev.returnValue = ''; } });
  T.bolla = { stato: function () { return st; } };                 // per le prove nel browser
})();
