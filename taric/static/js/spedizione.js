/* MAGIC HS - calcolatore del costo di spedizione con DHL Express, nella sezione Bolla: da solo («Calcola il trasporto»
   nella pagina delle bolle) o da una bolla d'importazione, dove «Usa nella bolla» mette la quota fino al confine UE nel
   valore in dogana, il resto tra le spese fino a destinazione e l'assicurazione. I conti sono in js/trasporto.js
   (TARIC_TRASPORTO); la tariffa e il supplemento carburante vengono da /api/trasporto (caricati in Gestione › Trasporto).
   T.spedizione.apri(contenitore, {bolla: {paese, colli, kg}, usa: function (quote), chiudi: function ()}). */
(function () {
  'use strict';
  var T = window.TARIC, esc = T.esc, X = window.TARIC_TRASPORTO;
  var AEREO = (window.TARIC_CODICI || {}).aereo || { zone: {}, paesi: {}, aeroporti: {} };     // allegato 23-01 (js/codici-dogana.js)
  var dati = null, attesa = null;                     // risposta di /api/trasporto, letta una volta per pagina
  var st = { flusso: 'import', paese: '', servizio: 'worldwide', colli: [nuovoCollo()], sabato: false, areeRemote: false, batterie: false,
    assicurazione: '', carburante: '', carburanteMano: false, quota: '', zonaAerea: '' };
  var el = null, opz = {}, timer = 0, ultimo = null;

  function nuovoCollo() { return { quanti: '1', kg: '', l: '', p: '', h: '', pallet: false, nonSovrapponibile: false, nonNastro: false }; }
  function app() { return T.app; }
  function euro(v) { return v === null || v === undefined || isNaN(v) ? '–' : app().euro(v); }
  function nIt(v) { return String(v).replace('.', ','); }
  function dataIt(s) { return s ? s.slice(8, 10) + '/' + s.slice(5, 7) + '/' + s.slice(0, 4) : ''; }

  function carica() {
    if (dati) return Promise.resolve(dati);
    if (!attesa) attesa = T.api('GET', '/api/trasporto').then(function (r) { dati = r; attesa = null; return r; }, function (e) { attesa = null; throw e; });
    return attesa;
  }

  T.spedizione = {
    /* dopo un caricamento in Gestione: la prossima apertura rilegge la tariffa */
    dimentica: function () { dati = null; },
    apri: function (contenitore, o) {
      el = contenitore; opz = o || {};
      el.innerHTML = '<p class="vuoto">Carico le tariffe…</p>';
      carica().then(function () {
        if (opz.bolla) prepara(opz.bolla);
        if (!st.carburanteMano) st.carburante = carburanteDelServizio();
        disegna();
      }, function (e) { el.innerHTML = '<p class="errore">' + esc((e && e.errore) || 'Tariffe non disponibili.') + '</p>'; });
    }
  };

  /* dalla bolla d'importazione: paese d'origine e colli (numero e massa lorda degli articoli) */
  function prepara(b) {
    st.flusso = 'import';
    var t = dati.tariffa;
    if (t && b.paese) {
      var i = t.paesi.findIndex(function (p) { return p.codice === b.paese && p.zona; });
      if (i >= 0) st.paese = String(i);
    }
    st.zonaAerea = ''; st.quota = quotaAllegato();
    if (b.kg > 0) {
      var n = Math.max(1, Math.round(b.colli || 1));
      st.colli = [Object.assign(nuovoCollo(), { quanti: String(n), kg: nIt(Math.round(b.kg / n * 10) / 10) })];
    }
  }

  /* ------------------------------------------------------------------ disegno */
  function disegna() {
    var t = dati.tariffa, h = '<div class="bolla-barra fila"><button class="btn sm" type="button" data-s="chiudi">' + T.icona('indietro') +
      (opz.bolla ? 'Torna alla bolla' : 'Le bolle') + '</button><h2 class="bolla-titolo">Costo di spedizione<span class="st ambra">indicativo</span></h2></div>';
    if (!t) {
      el.innerHTML = h + '<div class="foglio"><div class="box"><p class="vuoto illustrato">' + (T.vignetta ? T.vignetta('nave') : '') +
        'Non ci sono ancora tariffe: l\'amministratore carica la guida alle tariffe di DHL Express in Gestione › Trasporto.</p></div></div>';
      return;
    }
    var paesi = t.paesi.map(function (p, i) { return [i, p]; }).filter(function (x) { return x[1].zona > 0; })
      .sort(function (a, b) { return a[1].nome.localeCompare(b[1].nome, 'it'); });
    h += '<div class="foglio"><div class="box"><div class="lab">' + T.icona('nave') + 'Spedizione DHL Express</div><div class="b-campi">' +
      '<label>Spedizione<select class="campo" data-s="flusso"><option value="import"' + (st.flusso === 'import' ? ' selected' : '') + '>Importazione in Italia</option>' +
      '<option value="export"' + (st.flusso === 'export' ? ' selected' : '') + '>Esportazione dall\'Italia</option></select></label>' +
      '<label><span id="sp-et-paese">' + (st.flusso === 'import' ? 'Paese di partenza' : 'Paese di destinazione') + '</span><select class="campo" data-s="paese"><option value="">scegli…</option>' +
      paesi.map(function (x) { return '<option value="' + x[0] + '"' + (String(x[0]) === st.paese ? ' selected' : '') + '>' + esc(x[1].nome) + ' · zona ' + x[1].zona + '</option>'; }).join('') +
      '</select></label><label>Servizio<select class="campo" data-s="servizio" id="sp-servizio">' + opzioniServizio() + '</select></label>' +
      '<label>Supplemento carburante (%)<input class="campo" data-s="carburante" inputmode="decimal" autocomplete="off" value="' + esc(st.carburante) + '" placeholder="per esempio 35"></label></div>' +
      notaCarburante() + '</div></div>';
    h += '<div class="foglio"><div class="box"><div class="lab">' + T.icona('container') + 'Colli</div><div id="sp-colli">' + righeColli() + '</div>' +
      '<div class="fila"><button class="btn sm" type="button" data-s="aggiungi">' + T.icona('piu') + 'Aggiungi colli</button></div>' +
      '<p class="nota">Peso volumetrico di ogni collo: lunghezza × larghezza × altezza in cm / 5000. Si paga il maggiore tra peso reale e volumetrico.</p></div></div>';
    h += '<div class="foglio"><div class="box"><div class="lab">' + T.icona('regole') + 'Servizi e supplementi</div><div class="b-campi">' +
      '<label>Valore da assicurare (€)<input class="campo" data-s="assicurazione" inputmode="decimal" autocomplete="off" value="' + esc(st.assicurazione) + '" placeholder="vuoto: senza assicurazione"></label></div>' +
      '<div class="sp-scelte">' + spunta('sabato', 'Consegna al sabato') + spunta('areeRemote', 'Ritiro o consegna in un\'area remota') +
      spunta('batterie', 'Batterie al litio con dispositivo separato') + '</div></div></div>';
    h += '<div class="foglio"><div class="box"><div class="lab">' + T.icona('percento') + 'Costo</div><div id="sp-esito"></div></div></div>';
    if (opz.bolla) h += '<div class="foglio"><div class="box"><div class="lab">' + T.icona('pacco') + 'Nella bolla d\'importazione</div><div class="b-campi">' +
      '<label id="sp-aeroporto"' + (allegato().zone.length > 1 ? '' : ' hidden') + '>Aeroporto di partenza<select class="campo" data-s="zonaAerea">' + opzioniAeroporto() + '</select></label>' +
      '<label>Quota del trasporto fino al confine UE (%)<input class="campo" data-s="quota" inputmode="decimal" autocomplete="off" value="' + esc(st.quota) + '" placeholder="0-100"></label></div>' +
      '<p class="nota" id="sp-allegato">' + esc(testoAllegato()) + '</p>' +
      '<p class="nota">Per il trasporto aereo è la percentuale dell\'allegato 23-01 del Reg. (UE) 2015/2447 per il paese di partenza: entra nel valore in dogana. ' +
      'Il resto va tra le spese fino a destinazione, nella base dell\'IVA; l\'assicurazione nel suo campo.</p><p class="nota" id="sp-bolla"></p>' +
      '<div class="fila"><button class="btn pri" type="button" data-s="usa" disabled>' + T.icona('spunta') + 'Usa nella bolla</button></div></div></div>';
    el.innerHTML = h;
    calcola();
  }
  /* il paese della tariffa scelto (nessuno con il campo vuoto: +'' sarebbe 0, l'Italia) */
  function paeseScelto() { return dati && dati.tariffa && st.paese !== '' ? dati.tariffa.paesi[+st.paese] || null : null; }
  /* allegato 23-01: le zone del paese di partenza (più di una per Stati Uniti, Canada e Russia: dipende dall'aeroporto) */
  function allegato() {
    var p = paeseScelto();
    return { paese: p, zone: p ? AEREO.paesi[p.codice] || '' : '', aeroporti: p ? AEREO.aeroporti[p.codice] || {} : {} };
  }
  function quotaAllegato() {
    var a = allegato(), z = a.zone.length === 1 ? a.zone : (a.zone.indexOf(st.zonaAerea) >= 0 ? st.zonaAerea : '');
    return z && st.zonaAerea !== '-' ? nIt(AEREO.zone[z]) : '';
  }
  function testoAllegato() {
    var a = allegato();
    if (!a.paese) return '';
    if (!a.zone) return a.paese.nome + ' non è nella tabella dell\'allegato 23-01: scrivi la quota.';
    if (a.zone.length > 1) return 'Allegato 23-01: per ' + a.paese.nome + ' la quota dipende dall\'aeroporto di partenza.';
    return 'Allegato 23-01: ' + a.paese.nome + ', zona ' + a.zone + ', ' + nIt(AEREO.zone[a.zone]) + ' %.';
  }
  function opzioniAeroporto() {
    var a = allegato();
    return '<option value="">scegli…</option>' + a.zone.split('').map(function (z) {
      return '<option value="' + z + '"' + (z === st.zonaAerea ? ' selected' : '') + '>' + esc('Zona ' + z + ', ' + nIt(AEREO.zone[z]) + ' %: ' + (a.aeroporti[z] || '')) + '</option>';
    }).join('') + '<option value="-"' + (st.zonaAerea === '-' ? ' selected' : '') + '>un altro aeroporto: scrivo la quota</option>';
  }
  /* dopo il cambio di paese o di aeroporto: quota suggerita e campi aggiornati */
  function aggiornaAllegato() {
    st.quota = quotaAllegato();
    var l = el.querySelector('#sp-aeroporto'), q = el.querySelector('[data-s="quota"]'), n = el.querySelector('#sp-allegato');
    if (!l) return;
    l.hidden = allegato().zone.length < 2;
    l.querySelector('select').innerHTML = opzioniAeroporto();
    q.value = st.quota;
    n.textContent = testoAllegato();
  }
  function spunta(k, testo) { return '<label class="spunta doc"><input type="checkbox" data-s="' + k + '"' + (st[k] ? ' checked' : '') + '> ' + esc(testo) + '</label>'; }
  /* supplemento della settimana per il servizio scelto: Economy Select ha il suo (indice del gasolio), gli altri quello
     dei servizi internazionali; vuoto se manca, e il calcolo lo dice */
  function carburanteDelServizio() {
    var c = dati.carburante;
    if (!c) return '';
    if (st.servizio === 'economy') return c.economy === null || c.economy === undefined ? '' : nIt(c.economy);
    return nIt(c.percentuale);
  }
  function notaCarburante() {
    var c = dati.carburante, t = dati.tariffa;
    var testo = 'Tariffe pubbliche di listino: ' + t.titolo + (t.validita ? ', valide dal ' + dataIt(t.validita) : '') + '. ';
    if (!c) testo += 'Il supplemento carburante della settimana non è stato indicato in Gestione: scrivilo qui.';
    else {
      testo += 'Carburante ' + (c.fonte === 'dhl' ? 'della settimana dal ' + dataIt(c.dal) + ' al ' + dataIt(c.al) + ', dalla pagina di DHL' : 'indicato in Gestione dal ' + dataIt(c.dal)) +
        ': Express ' + nIt(c.percentuale) + '\u00a0%' + (c.economy === null || c.economy === undefined ? '' : ', Economy Select ' + nIt(c.economy) + '\u00a0%') + '.';
    }
    return '<p class="nota" id="sp-nota">' + esc(testo) + '</p>';
  }
  function opzioniServizio() {
    var p = paeseScelto(), disp = p && Array.isArray(p.servizi) ? p.servizi : null;
    return ['worldwide', '12:00', '10:30', '9:00', 'economy'].map(function (s) {
      var no = disp && disp.indexOf(s) < 0;
      return '<option value="' + s + '"' + (s === st.servizio ? ' selected' : '') + (no ? ' disabled' : '') + '>' + esc(X.NOMI[s] + (no ? ' (non disponibile)' : '')) + '</option>';
    }).join('');
  }
  function righeColli() {
    return '<div class="sp-colli">' + st.colli.map(function (c, k) {
      var f = function (nome, et, extra) {
        return '<label>' + et + '<input class="campo" data-c="' + k + '" data-s="' + nome + '" value="' + esc(c[nome]) + '" inputmode="decimal" autocomplete="off"' + (extra || '') + '></label>';
      };
      var s = function (nome, et, nascosto) {
        return '<label class="spunta doc"' + (nascosto ? ' hidden' : '') + '><input type="checkbox" data-c="' + k + '" data-s="' + nome + '"' + (c[nome] ? ' checked' : '') + '> ' + esc(et) + '</label>';
      };
      return '<div class="sp-collo" data-riga="' + k + '"><div class="sp-numero"><b>' + (k + 1) + '</b>' + (st.colli.length > 1 ? '<button class="link" type="button" data-s="togli" data-c="' + k + '">togli</button>' : '') + '</div>' +
        '<div class="sp-misure">' + f('quanti', 'Colli uguali', ' inputmode="numeric"') + f('kg', 'Peso di un collo (kg)') + f('l', 'Lunghezza (cm)') + f('p', 'Larghezza (cm)') + f('h', 'Altezza (cm)') + '</div>' +
        '<div class="sp-scelte">' + s('pallet', 'Su pallet') + s('nonSovrapponibile', 'Pallet non sovrapponibile', !c.pallet) + s('nonNastro', 'Imballo non in cartone o forma irregolare') + '</div></div>';
    }).join('') + '</div>';
  }

  /* ------------------------------------------------------------------ calcolo */
  function calcola() {
    clearTimeout(timer);
    var e = el && el.querySelector('#sp-esito');
    if (!e) return;
    var R = ultimo = X.calcola(dati.tariffa, { flusso: st.flusso, paese: st.paese === '' ? -1 : +st.paese, servizio: st.servizio, colli: st.colli,
      assicurazione: st.assicurazione, sabato: st.sabato, areeRemote: st.areeRemote, batterie: st.batterie, carburante: st.carburante });
    var h = '';
    if (R.blocchi.length) h += '<div class="b-blocchi"><p class="et">' + T.icona('attenzione') + 'Da completare</p><ul>' +
      R.blocchi.map(function (b) { return '<li>' + esc(b) + '</li>'; }).join('') + '</ul></div>';
    else {
      h += '<table class="tab b-totali sp-voci"><tbody>' + R.voci.map(function (v) { return '<tr><td>' + esc(v.nome) + '</td><td class="n">' + euro(v.importo) + '</td></tr>'; }).join('') +
        '<tr class="evid"><td><b>Totale indicativo</b></td><td class="n"><b>' + euro(R.totale) + '</b></td></tr></tbody></table>';
    }
    if (R.pesi && R.pesi.numero) h += '<p class="nota">' + R.pesi.numero + (R.pesi.numero === 1 ? ' collo' : ' colli') + ': peso reale ' + esc(nIt(R.pesi.reale)) +
      ' kg, volumetrico ' + esc(nIt(R.pesi.volumetrico)) + ' kg, tassabile ' + esc(nIt(R.pesi.tassabile)) + ' kg' +
      (R.pesoTariffa && R.pesoTariffa !== R.pesi.tassabile ? ' (si paga come ' + esc(nIt(R.pesoTariffa)) + ' kg)' : '') + (R.zona ? ' · zona ' + R.zona : '') + '.</p>';
    if (R.avvisi.length) h += '<div class="b-avvisi"><ul>' + R.avvisi.map(function (a) { return '<li>' + esc(a) + '</li>'; }).join('') + '</ul></div>';
    h += '<p class="nota">Non comprende dazi, IVA e oneri di sdoganamento, Demand Surcharge e situazioni di emergenza, supplementi per paesi a rischio, ' +
      'merci pericolose e sconti contrattuali.</p>';
    e.innerHTML = h;
    disegnaBolla();
  }
  function quotaValida() { var q = parseFloat(String(st.quota).replace(',', '.')); return q >= 0 && q <= 100 ? q : NaN; }
  /* anteprima e tasto: si aggiornano senza ridisegnare il tasto (un clic iniziato non si perde) */
  function disegnaBolla() {
    var b = el.querySelector('#sp-bolla'), usa = el.querySelector('[data-s="usa"]');
    if (!b) return;
    var R = ultimo, q = quotaValida(), pronto = R && !R.blocchi.length && !isNaN(q);
    if (pronto) {
      var Q = X.quotaBolla(R.trasporto, q);
      b.textContent = euro(Q.confine) + ' nel trasporto fino al confine UE, ' + euro(Q.destinazione) + ' tra le spese fino a destinazione' +
        (R.assicurazione ? ', ' + euro(R.assicurazione) + ' di assicurazione' : '') + '.';
    } else b.textContent = R && !R.blocchi.length ? 'Scrivi la quota fino al confine UE per riportare il costo nella bolla.' : '';
    usa.disabled = !pronto;
  }

  /* ------------------------------------------------------------------ eventi (il contenitore cambia: si ascolta il documento) */
  function dentro(ev) { return el && ev.target && el.contains(ev.target) && ev.target.closest('[data-s]'); }
  document.addEventListener('input', function (ev) {
    var t = dentro(ev);
    if (!t || t.tagName === 'SELECT' || t.type === 'checkbox') return;
    var k = t.getAttribute('data-s'), c = t.getAttribute('data-c');
    if (c !== null) st.colli[+c][k] = t.value; else st[k] = t.value;
    if (k === 'carburante') st.carburanteMano = t.value.trim() !== '';    // scritto a mano: resta anche cambiando servizio
    clearTimeout(timer); timer = setTimeout(calcola, 200);
  });
  document.addEventListener('change', function (ev) {
    var t = dentro(ev);
    if (!t || (t.tagName === 'INPUT' && t.type !== 'checkbox')) return;        // i campi di testo li segue già «input»
    var k = t.getAttribute('data-s'), c = t.getAttribute('data-c'), v = t.type === 'checkbox' ? t.checked : t.value;
    if (c !== null) {
      st.colli[+c][k] = v;
      if (k === 'pallet') { var r = el.querySelector('[data-riga="' + c + '"] [data-s="nonSovrapponibile"]'); if (r) r.closest('label').hidden = !v; }
    } else st[k] = v;
    if (k === 'flusso') { var et = el.querySelector('#sp-et-paese'); if (et) et.textContent = v === 'import' ? 'Paese di partenza' : 'Paese di destinazione'; }
    if (k === 'zonaAerea') { aggiornaAllegato(); }
    if (k === 'paese') {
      st.zonaAerea = ''; aggiornaAllegato();
      var p = paeseScelto();
      if (p && Array.isArray(p.servizi) && p.servizi.indexOf(st.servizio) < 0) st.servizio = 'worldwide';
      var s = el.querySelector('#sp-servizio'); if (s) s.innerHTML = opzioniServizio();
    }
    if ((k === 'paese' || k === 'servizio') && !st.carburanteMano) {
      st.carburante = carburanteDelServizio();
      var f = el.querySelector('[data-s="carburante"]'); if (f) f.value = st.carburante;
    }
    calcola();
  });
  document.addEventListener('click', function (ev) {
    var t = dentro(ev);
    if (!t || t.tagName !== 'BUTTON') return;
    var k = t.getAttribute('data-s');
    if (k === 'chiudi' && opz.chiudi) opz.chiudi();
    else if (k === 'aggiungi') { st.colli.push(nuovoCollo()); el.querySelector('#sp-colli').innerHTML = righeColli(); calcola(); var u = el.querySelectorAll('.sp-collo'); u[u.length - 1].querySelector('[data-s="kg"]').focus(); }
    else if (k === 'togli') { st.colli.splice(+t.getAttribute('data-c'), 1); el.querySelector('#sp-colli').innerHTML = righeColli(); calcola(); }
    else if (k === 'usa' && opz.usa && ultimo && !ultimo.blocchi.length && !isNaN(quotaValida())) {
      var Q = X.quotaBolla(ultimo.trasporto, quotaValida());
      opz.usa({ confine: Q.confine, destinazione: Q.destinazione, assicurazione: ultimo.assicurazione, quota: quotaValida(), totale: ultimo.totale });
    }
  });
})();
