/* MAGIC HS - calcoli della scheda del codice e della bolla simulata, senza pagina: si provano con node
   (tests/prova_calcolo.js). Nel browser diventa window.TARIC_CALCOLO.

   Regola generale: meglio nessun numero che uno sbagliato. Ogni importo che dipende da qualcosa che qui non si conosce
   (prezzo d'entrata, componenti agricole, soglie, codici addizionali non scelti, cambi non fissati) diventa un blocco
   con il motivo, e il totale della bolla resta vuoto finché ce n'è uno. */
(function (radice) {
  'use strict';

  /* ------------------------------------------------------------------ numeri */
  var PAROLE = {
    MAX: 'max', MIN: 'min', NIHIL: 'nessun dazio', EA: 'elemento agricolo', EAR: 'elemento agricolo ridotto',
    ADSZ: 'dazio add. zucchero', ADSZR: 'dazio add. zucchero ridotto', ADFM: 'dazio add. farina', ADFMR: 'dazio add. farina ridotto'
  };
  var MASSA = { DTN: 0.01, KGM: 1, TNE: 0.001, GRM: 1000 };          // quante unità per kg
  var QUANTITA = { MIL: 0.001, CEN: 0.01 };                          // per 1000 e per 100 pezzi
  var NON_CALCOLABILI = { EA: 1, EAR: 1, ADSZ: 1, ADSZR: 1, ADFM: 1, ADFMR: 1 };

  function num(s) { return parseFloat(String(s).replace(/,/g, '')); }
  function isNum(x) { return /^[\d,]*\.?\d+$/.test(x); }
  /* numero scritto all'italiana: «12.500,50», «12500,5», «12500.5»; NaN se vuoto, negativo o non valido */
  function numeroIt(s) {
    s = String(s === undefined || s === null ? '' : s).trim().replace(/\s/g, '');
    if (!s) return NaN;
    if (s.indexOf(',') >= 0) s = s.replace(/\./g, '').replace(',', '.');
    else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');     // 12.500 = dodicimilacinquecento
    var v = Number(s);
    return isFinite(v) && v >= 0 ? v : NaN;
  }
  /* centesimi interi, arrotondati al più vicino (la metà si allontana dallo zero), senza gli errori della virgola mobile
     (1,005 * 100 = 100,49999… diventa 101) */
  function cent(v) { var x = Number((Math.abs(v) * 100).toPrecision(15)); return (v < 0 ? -1 : 1) * Math.round(x); }
  function arrotonda(v) { return cent(v) / 100; }
  /* importo di un tributo (casella 47): al centesimo, la metà per eccesso; un importo sotto il centesimo diventa comunque
     un centesimo (istruzioni dell'Agenzia delle Dogane per la compilazione delle dichiarazioni, casella 47) */
  function tributo(v) { var c = cent(v); return (c === 0 && v > 0 ? 1 : c) / 100; }
  function somma(lista) { return lista.reduce(function (s, v) { return s + cent(v); }, 0) / 100; }

  /* Ripartisce un importo (euro, al centesimo) in proporzione ai pesi; la somma delle parti è esattamente il totale
     (metodo dei resti più grandi). Pesi tutti a zero: parti uguali. */
  function ripartisci(totale, pesi) {
    var tc = cent(totale), n = pesi.length, tot = pesi.reduce(function (s, p) { return s + (p > 0 ? p : 0); }, 0);
    if (!n) return [];
    var quote = pesi.map(function (p) { return tot > 0 ? (p > 0 ? p : 0) / tot : 1 / n; });
    var parti = quote.map(function (q) { return Math.floor(Number((tc * q).toPrecision(15))); });
    var resto = tc - parti.reduce(function (s, p) { return s + p; }, 0);
    var ordine = quote.map(function (q, i) { return { i: i, r: Number((tc * q).toPrecision(15)) - parti[i] }; })
      .sort(function (a, b) { return b.r - a.r || a.i - b.i; });
    for (var k = 0; k < resto; k++) parti[ordine[k % n].i] += 1;
    return parti.map(function (p) { return p / 100; });
  }

  /* ------------------------------------------------------------------ dazi */
  var opzioni = { nomeUnita: function (u, q) { return u + (q ? ' ' + q : ''); } };

  /* Importo di un'espressione di dazio senza condizioni: percentuali, importi per massa (DTN, KGM, TNE, GRM) o per
     quantità, somme con «+», minimi (MIN) e massimi (MAX). c = {valore, kg, qta, unitaQta}.
     Un'espressione vuota è una misura senza dazio: esente (0 %), come nel TARIC.
     Restituisce {importo} oppure {manca: 'valore'|'kg'|'qta'} oppure {no: motivo}. */
  function calcolaDazio(str, c) {
    var t = String(str || '').replace(/\+/g, ' + ').trim().split(/\s+/), parti = { base: [], MIN: [], MAX: [] }, dove = 'base', i = 0;
    if (!t[0]) return { importo: 0, esente: true };
    if (/^Cond:/.test(str)) return { no: 'dipende dalle condizioni o dai documenti' };
    while (i < t.length) {
      var x = t[i];
      if (x === '+') { i++; continue; }
      if (x === 'MIN' || x === 'MAX') { dove = x; i++; continue; }
      if (x === 'NIHIL') { parti[dove].push({ v: 0, tipo: '%' }); i++; continue; }
      if (NON_CALCOLABILI[x]) return { no: 'contiene un elemento agricolo o un dazio addizionale variabile' };
      if (!isNum(x)) return { no: 'espressione non prevista' };
      var v = num(x), nx = t[i + 1];
      if (nx === '%') { parti[dove].push({ v: v, tipo: '%' }); i += 2; continue; }
      if (nx !== 'EUR' && nx !== 'EUC') return { no: 'espressione non prevista' };
      var u = t[i + 2], q = t[i + 3];
      if (!u || !/^[A-Z]{3}$/.test(u) || PAROLE[u]) return { no: 'importo per spedizione, non per merce' };
      if (q && /^[A-Z]$/.test(q)) return { no: 'dipende da ' + opzioni.nomeUnita(u, q) };
      parti[dove].push({ v: v, tipo: 'eur', u: u });
      i += 3;
    }
    var manca = '';
    function calcola(lista) {
      return lista.reduce(function (s, p) {
        if (p.tipo === '%') { if (isNaN(c.valore)) { manca = manca || 'valore'; return s; } return s + c.valore * p.v / 100; }
        if (MASSA[p.u]) { if (isNaN(c.kg)) { manca = manca || 'kg'; return s; } return s + p.v * c.kg * MASSA[p.u]; }
        if (isNaN(c.qta) || c.unitaQta !== p.u) { manca = manca || 'qta'; return s; }
        return s + p.v * c.qta * (QUANTITA[p.u] || 1);
      }, 0);
    }
    var tot = calcola(parti.base);
    if (parti.MIN.length) tot = Math.max(tot, calcola(parti.MIN));
    if (parti.MAX.length) tot = Math.min(tot, calcola(parti.MAX));
    return manca ? { manca: manca } : { importo: tributo(tot) };
  }
  /* l'unità di quantità che servirebbe (pezzi, paia, litri...), se una delle espressioni ne usa una */
  function unitaQuantita(stringhe) {
    for (var k = 0; k < stringhe.length; k++) {
      var m = /\b(?:EUR|EUC) ([A-Z]{3})\b(?! [A-Z]\b)/g, x;
      while ((x = m.exec(stringhe[k] || ''))) if (!MASSA[x[1]] && !PAROLE[x[1]]) return x[1];
    }
    return '';
  }

  /* ------------------------------------------------------------------ condizioni */
  /* elenco delle condizioni, come nella colonna del dazio: "A cert: D-008 (01):19.200 % ; A (01):48.500 %" */
  function parseCond(txt) {
    var out = [];
    String(txt || '').replace(/^Cond:\s*/, '').split(';').forEach(function (p) {
      p = p.trim(); if (!p) return;
      var m = /^([A-Z]{1,2}) (.*?)\((\d\d)\):(.*)$/.exec(p);
      if (!m) { out.push({ tipo: '?', raw: p, cert: '', soglia: '', az: '', dazio: '' }); return; }
      var mid = m[2].trim(), c = /^cert: (\S)-(\S{3})$/.exec(mid);
      out.push({ tipo: m[1], cert: c ? c[1] + c[2] : '', soglia: c ? '' : mid, az: m[3], dazio: m[4].trim() });
    });
    return out;
  }
  var ESITI_AZIONE = {
    '01': 'importo', '27': 'si_applica', '07': 'non_si_applica',
    '24': 'consentita', '25': 'consentita', '26': 'consentita', '28': 'consentita', '29': 'consentita',
    '04': 'vietata', '05': 'vietata', '06': 'vietata', '08': 'vietata', '09': 'vietata', '10': 'da_correggere'
  };
  /* Valuta un elenco di condizioni con i documenti dichiarati (codici come «D008», «Y900»).
     Per ogni gruppo (lettera della condizione) vale la prima condizione soddisfatta, nell'ordine del TARIC: un
     documento se è dichiarato, la condizione senza documento sempre. Le soglie (prezzi, quantità) qui non si valutano.
     Risultato: {gruppi: [{tipo, esito, az, dazio, cert, alternative: [codici dei documenti del gruppo]}]} dove esito è
     importo | si_applica | non_si_applica | consentita | vietata | da_correggere | soglia | ignota. */
  function valutaCondizioni(txt, documenti) {
    var voci = parseCond(txt), gruppi = [], per = {};
    var ha = {}; (documenti || []).forEach(function (d) { ha[String(d).replace('-', '')] = true; });
    voci.forEach(function (v) {
      var k = v.tipo === '?' ? '?' : v.tipo;
      if (!per[k]) { per[k] = { tipo: k, voci: [] }; gruppi.push(per[k]); }
      per[k].voci.push(v);
    });
    return {
      gruppi: gruppi.map(function (g) {
        var alternative = g.voci.filter(function (v) { return v.cert; }).map(function (v) { return v.cert; });
        var r = { tipo: g.tipo, esito: 'ignota', az: '', dazio: '', cert: '', alternative: alternative };
        if (g.tipo === '?') return r;
        for (var k = 0; k < g.voci.length; k++) {
          var v = g.voci[k];
          if (v.soglia) { r.esito = 'soglia'; return r; }
          if (v.cert && !ha[v.cert]) continue;
          r.az = v.az; r.dazio = v.dazio; r.cert = v.cert; r.esito = ESITI_AZIONE[v.az] || 'ignota';
          return r;
        }
        r.esito = 'nessuna';           // nessuna condizione soddisfatta e nessuna senza documento
        return r;
      })
    };
  }

  /* ------------------------------------------------------------------ tipi di misura nella bolla */
  // riduzioni che si chiedono nella dichiarazione al posto del dazio paesi terzi (103)
  var RIDUZIONI = [112, 115, 117, 119, 122, 123, 141, 142, 143, 145, 146, 147, 106];
  var PREFERENZIALI = { 141: 1, 142: 1, 143: 1, 145: 1, 146: 1 };
  var CONTINGENTI = { 122: 1, 123: 1, 143: 1, 146: 1, 147: 1 };
  var USO_FINALE = { 105: 1, 115: 1, 123: 1, 145: 1, 146: 1 };
  /* codici della casella 36 (D.E. 4/17, allegato B del Reg. UE 2015/2447): prima cifra 1 erga omnes, 2 SPG, 3 altre
     preferenze, 4 unioni doganali; ultime due 00 nessun caso particolare, 10 sospensione, 19 sospensione con certificato
     AESA (aeronavigabilità), 20 contingente. Le varianti con certificato (18, 25, 28, 50) non si ricavano dalle misure. */
  var GRUPPI_SPG = { 2005: 1, 2020: 1, 2027: 1 };                     // SPG: EBA, regime generale, SPG+
  var CASO_PREFERENZA = { 103: '00', 112: '10', 115: '10', 117: '10', 119: '19', 122: '20', 123: '20',
    141: '10', 142: '00', 143: '20', 145: '00', 146: '20', 106: '00', 147: '20' };
  function codicePreferenza(tipo, origine) {
    var caso = CASO_PREFERENZA[tipo];
    if (!caso) return '';
    var prima = tipo === 106 || tipo === 147 ? '4' : PREFERENZIALI[tipo] ? (GRUPPI_SPG[origine] ? '2' : '3') : '1';
    return prima + caso;
  }
  /* codici del tipo di tributo (D.E. 4/3): A00 dazio, A30/A35 antidumping definitivo/provvisorio, A40/A45 compensativo
     definitivo/provvisorio, B00 IVA; i dazi addizionali (695, 696) non hanno un codice proprio nell'elenco */
  var CODICE_TRIBUTO = { 551: 'A35', 552: 'A30', 553: 'A45', 554: 'A40' };
  function codiceTributo(t) {
    if (t.tipo === 'dazio') return 'A00';
    if (t.tipo === 'IVA') return 'B00';
    return t.misura ? (CODICE_TRIBUTO[t.misura.t] || '') : '';
  }
  var UE = 'AT BE BG CY CZ DE DK EE ES FI FR GR HR HU IE IT LT LU LV MT NL PL PT RO SE SI SK'.split(' ');
  /* Incoterms 2020: chi paga il trasporto principale */
  var INCOTERM = { EXW: 'aggiungi', FCA: 'aggiungi', FAS: 'aggiungi', FOB: 'aggiungi',
    CFR: 'compreso', CPT: 'compreso', CIF: 'compreso', CIP: 'compreso', DAP: 'oltre', DPU: 'oltre', DDP: 'oltre' };
  var EUROF = (function () { try { return new Intl.NumberFormat('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: 'always' }); } catch (e) { return null; } })();
  function euroTesto(v) { return (EUROF ? EUROF.format(v) : v.toFixed(2).replace('.', ',')) + ' €'; }
  function vuoto(s) { return s === undefined || s === null || String(s).trim() === ''; }

  // dazi che si aggiungono: antidumping e compensativi (provvisori e definitivi), dazi addizionali
  var AGGIUNTIVI = { 551: 'antidumping provvisorio', 552: 'antidumping', 553: 'compensativo provvisorio', 554: 'compensativo', 695: 'dazio addizionale', 696: 'dazio addizionale' };
  /* famiglie di dazi aggiuntivi: per ognuna si dichiara un solo codice addizionale, quello del produttore; una misura
     con codici addizionali vale solo se il codice dichiarato è tra i suoi (per esempio per le biciclette cinesi C453
     del Reg. 2020/966 oppure B772…B999 e C329 del Reg. 2025/2146: scelto uno, l'altra misura non si applica) */
  var FAMIGLIA = { 551: 'antidumping', 552: 'antidumping', 553: 'compensativo', 554: 'compensativo', 695: 'addizionale', 696: 'addizionale' };
  var NOME_FAMIGLIA = { antidumping: 'il dazio antidumping', compensativo: 'il dazio compensativo', addizionale: 'il dazio addizionale' };
  var NON_CALCOLABILI_TIPI = { 651: 'cauzione basata sul prezzo rappresentativo', 652: 'dazio addizionale basato sul prezzo CIF', 653: 'cauzione basata sul prezzo rappresentativo', 654: 'dazio addizionale basato sul prezzo CIF' };
  // misure di sole vendite a distanza o spedizioni di modico valore: non toccano la bolla ordinaria
  var SOLO_E_COMMERCE = { 107: 1, 800: 1 };
  var NON_MISURE_DI_CONTROLLO = { 103: 1, 105: 1, 106: 1, 107: 1, 109: 1, 110: 1, 112: 1, 115: 1, 117: 1, 119: 1, 122: 1, 123: 1, 141: 1, 142: 1, 143: 1, 145: 1, 146: 1, 147: 1,
    488: 1, 489: 1, 490: 1, 551: 1, 552: 1, 553: 1, 554: 1, 555: 1, 561: 1, 564: 1, 565: 1, 566: 1, 570: 1, 651: 1, 652: 1, 653: 1, 654: 1, 695: 1, 696: 1, 800: 1 };

  /* misura valida nel giorno g (AAAAMMGG) */
  function valida(m, g) { return m.da <= g && !(m.a && m.a < g); }

  /* Il dazio di una misura (anche condizionato dai documenti) con i valori dell'articolo.
     Restituisce {importo, espressione, cert} o {no}/{manca}. */
  function dazioMisura(m, documenti, c) {
    var espr = m.duty;
    var cert = '';
    if (/^Cond:/.test(espr)) {
      var v = valutaCondizioni(espr, documenti);
      if (v.gruppi.length !== 1) return { no: 'dipende da più gruppi di condizioni' };
      var g = v.gruppi[0];
      if (g.esito === 'soglia') return { no: 'dipende da un prezzo o da una quantità (prezzo d\'entrata o soglia)' };
      if (g.esito !== 'importo') return { no: 'condizione non prevista' };
      espr = g.dazio; cert = g.cert;
    }
    var r = calcolaDazio(espr, c);
    r.espressione = espr; r.cert = cert;
    return r;
  }
  /* la misura vale solo con un documento (colonna delle condizioni, per esempio C990 per le navi)? */
  function applicabile(m, documenti) {
    if (!m.cond) return { ok: true };
    var v = valutaCondizioni(m.cond, documenti), ok = true, servono = [];
    v.gruppi.forEach(function (g) {
      if (g.esito === 'non_si_applica' || g.esito === 'vietata' || g.esito === 'nessuna') { ok = false; servono = servono.concat(g.alternative); }
      else if (g.esito === 'soglia' || g.esito === 'ignota') { ok = false; servono.push('?'); }
    });
    return { ok: ok, servono: servono };
  }

  /* Le scelte di regime tariffario per un articolo all'importazione: il dazio paesi terzi e le riduzioni che si possono
     chiedere per l'origine e il giorno (preferenze, sospensioni, contingenti). righe = misure valide (come misure() di
     app.js, già filtrate per origine). */
  function regimi(righe, giorno) {
    var out = [], visti = {};
    var base = righe.filter(function (m) { return m.t === 103 && valida(m, giorno); });
    out.push({ id: 'base', tipo: 103, misure: base, origine: '1011', contingente: '', avvertenze: [] });
    righe.forEach(function (m) {
      if (RIDUZIONI.indexOf(m.t) < 0 || !valida(m, giorno)) return;
      var id = m.t + '-' + m.o + '-' + (m.ord || '');
      if (!visti[id]) { visti[id] = { id: id, tipo: m.t, misure: [], origine: m.o, contingente: m.ord || '', avvertenze: [] }; out.push(visti[id]); }
      visti[id].misure.push(m);
    });
    out.forEach(function (r) {
      r.preferenza = r.id === 'base' ? '100' : codicePreferenza(r.tipo, r.origine);
      if (PREFERENZIALI[r.tipo]) r.avvertenze.push('serve la prova dell\'origine preferenziale');
      if (CONTINGENTI[r.tipo] && r.misure.some(function (m) { return /cert:/.test(m.cond || ''); }))
        r.avvertenze.push('il contingente chiede un certificato: il codice della casella 36 può essere ' + r.preferenza.charAt(0) + '25 invece di ' + r.preferenza + ', verifica');
      if (r.tipo === 106) r.avvertenze.push('serve il documento di circolazione dell\'unione doganale');
      if (CONTINGENTI[r.tipo]) r.avvertenze.push('solo se il contingente ' + (r.contingente ? 'n. ' + r.contingente.slice(0, 2) + '.' + r.contingente.slice(2) + ' ' : '') + 'ha ancora disponibilità');
      if (USO_FINALE[r.tipo]) r.avvertenze.push('serve l\'autorizzazione all\'uso finale');
    });
    return out;
  }

  /* Gruppi di dazi aggiuntivi (antidumping, compensativi, addizionali) per l'origine e il giorno. Se le righe hanno
     codici addizionali diversi, chi compila deve scegliere il proprio (quello del produttore). */
  function gruppiAggiuntivi(righe, giorno) {
    var per = {}, out = [];
    righe.forEach(function (m) {
      if (!valida(m, giorno) || !(AGGIUNTIVI[m.t] || NON_CALCOLABILI_TIPI[m.t] || m.t === 555)) return;
      var k = m.t + '|' + m.legal;
      if (!per[k]) { per[k] = { tipo: m.t, legale: m.legal, misure: [] }; out.push(per[k]); }
      per[k].misure.push(m);
    });
    out.forEach(function (g) { g.codici = g.misure.filter(function (m) { return m.add; }).map(function (m) { return m.add; }); g.famiglia = FAMIGLIA[g.tipo] || ''; });
    return out;
  }
  /* le famiglie (antidumping, compensativo, addizionale) con i codici addizionali di tutte le loro misure */
  function famiglie(righe, giorno) {
    var per = {}, out = [];
    gruppiAggiuntivi(righe, giorno).forEach(function (g) {
      if (!g.famiglia) return;
      var f = per[g.famiglia];
      if (!f) { f = per[g.famiglia] = { famiglia: g.famiglia, nome: NOME_FAMIGLIA[g.famiglia], gruppi: [], codici: [], misure: [] }; out.push(f); }
      f.gruppi.push(g);
      g.misure.forEach(function (m) { if (m.add && f.codici.indexOf(m.add) < 0) { f.codici.push(m.add); f.misure.push(m); } });
    });
    return out;
  }

  /* misure di controllo (divieti, licenze, certificati): per ognuna, i gruppi di condizioni con l'esito */
  function controlli(righe, giorno, documenti) {
    return righe.filter(function (m) { return valida(m, giorno) && !NON_MISURE_DI_CONTROLLO[m.t]; }).map(function (m) {
      var testo = /^Cond:/.test(m.duty) ? m.duty : m.cond;
      var esito = 'vietata', gruppi = [];
      if (!testo) esito = (m.t === 277 || m.t === 278 || m.t === 705 || m.t === 706) ? 'vietata' : 'da_verificare';
      else {
        gruppi = valutaCondizioni(testo, documenti).gruppi;
        var e = gruppi.map(function (g) { return g.esito; });
        if (e.some(function (x) { return x === 'vietata' || x === 'nessuna'; })) esito = 'manca';
        else if (e.some(function (x) { return x === 'soglia' || x === 'ignota' || x === 'da_correggere'; })) esito = 'da_verificare';
        else esito = 'ok';
      }
      return { misura: m, esito: esito, gruppi: gruppi };
    });
  }

  /* ------------------------------------------------------------------ bolla */
  function euroDa(importo, valuta, cambi) {
    if (isNaN(importo)) return NaN;
    if (!valuta || valuta === 'EUR') return importo;
    var t = cambi && cambi[valuta];
    return t && t.tasso > 0 ? importo / t.tasso : NaN;          // la BCE dà le unità di valuta per 1 euro
  }

  /* Calcola una bolla d'importazione.
     bolla = {data: 'AAAA-MM-GG', valuta, nolo: {importo, valuta}, assicurazione: {importo, valuta},
              ripartizione: 'valore'|'massa', inoltro: {importo, valuta}, articoli: [...]}
     articolo = {codice, origine, valore (in valuta della fattura), aggiunte, deduzioni (stessa valuta), netto, lordo,
                 quantita, regime (id di regimi()), addizionali: [codici], documenti: [codici], iva: 22|10|5|4|0}
     ctx = {misure: function (articolo) -> {righe, unitaQta, unitaSup} | {errore}, cambi: {USD: {tasso, ...}}}
     Ogni importo è in euro al centesimo. Risultato: {articoli: [...], totali, blocchi: [{articolo, testo}]} */
  function calcolaImport(bolla, ctx) {
    var giorno = parseInt(String(bolla.data || '').replace(/-/g, ''), 10);
    var blocchi = [], conflitti = [], avvisi = [], arts = bolla.articoli || [];
    var nomeMisura = ctx.nomeMisura || function (m) { return 'misura ' + m.t; };
    var fmtDazio = ctx.fmtDazio || function (d) { return d || 'esente'; };
    function blocca(n, testo) { blocchi.push({ articolo: n, testo: testo }); }
    function conflitto(n, testo, campo) { conflitti.push({ articolo: n, testo: testo, campo: campo || '' }); }
    controlliTestata(bolla, ctx, giorno, conflitto, avvisi, 'import');
    if (!(giorno > 19000101)) blocca(0, 'Indica la data della bolla.');
    var cambi = ctx.cambi || {};
    var valutaF = bolla.valuta || 'EUR';
    if (valutaF !== 'EUR' && !(cambi[valutaF] && cambi[valutaF].tasso > 0)) blocca(0, 'Manca il cambio doganale di ' + valutaF + ' per il mese della bolla.');
    function conv(x, quale) {
      var testo = x && x.importo !== undefined && x.importo !== null ? String(x.importo).trim() : '';
      if (!testo) return 0;                                         // spesa non indicata: nessuna
      var e = euroDa(numeroIt(testo), (x && x.valuta) || valutaF, cambi);
      if (isNaN(e)) { blocca(0, quale + ': importo non valido o cambio mancante.'); return 0; }
      return e;
    }
    var soloNolo = conv(bolla.nolo, 'Trasporto fino al confine UE'), soloAss = conv(bolla.assicurazione, 'Assicurazione');
    var noloEur = soloNolo + soloAss;
    var inoltroEur = conv(bolla.inoltro, 'Spese di inoltro fino a destinazione');
    /* Incoterm (casella 20) e spese: il trasporto fino al confine UE va nel valore solo se non è già nel prezzo */
    var inc = INCOTERM[bolla.incoterm], conNolo = soloNolo > 0, conAss = soloAss > 0;
    if (inc === 'aggiungi' && !conNolo) conflitto(0, 'Con ' + bolla.incoterm + ' il trasporto fino al confine UE non è nel prezzo: va aggiunto, ma il campo è vuoto.', 'nolo.importo');
    if (inc === 'compreso' && conNolo) conflitto(0, 'Con ' + bolla.incoterm + ' il trasporto fino al luogo convenuto è già nel prezzo: aggiungendolo lo conti due volte.', 'nolo.importo');
    if ((bolla.incoterm === 'CIF' || bolla.incoterm === 'CIP') && conAss) conflitto(0, 'Con ' + bolla.incoterm + ' anche l\'assicurazione è già nel prezzo: aggiungendola la conti due volte.', 'assicurazione.importo');
    if (inc === 'oltre' && (conNolo || conAss)) conflitto(0, 'Con ' + bolla.incoterm + ' il prezzo comprende il trasporto fino a destinazione: non va aggiunto.', 'nolo.importo');
    if (inc === 'oltre' || inc === 'compreso') avvisi.push({ articolo: 0, testo: 'Con ' + bolla.incoterm + ', se il luogo convenuto è oltre il confine UE, la parte di trasporto dopo il confine indicata a parte in fattura si toglie dal valore (campo «Da togliere» degli articoli).' });
    if (bolla.incoterm === 'DDP') avvisi.push({ articolo: 0, testo: 'Con DDP il prezzo può comprendere dazi e IVA all\'importazione, che non fanno parte del valore in dogana: se ci sono, toglili.' });

    var valoriF = arts.map(function (a) { return numeroIt(a.valore); });
    var pesi = bolla.ripartizione === 'massa' ? arts.map(function (a) { var v = numeroIt(a.lordo); return isNaN(v) ? numeroIt(a.netto) : v; }) : valoriF;
    if (bolla.ripartizione === 'massa' && pesi.some(function (p) { return isNaN(p); }) && (noloEur || inoltroEur)) blocca(0, 'Per ripartire le spese in base alla massa serve la massa lorda di ogni articolo.');
    var quoteNolo = ripartisci(noloEur, pesi.map(function (p) { return isNaN(p) ? 0 : p; }));
    var quoteInoltro = ripartisci(inoltroEur, pesi.map(function (p) { return isNaN(p) ? 0 : p; }));

    var out = arts.map(function (a, k) {
      var n = k + 1, r = { n: n, codice: a.codice, tributi: [], avvertenze: [], blocchi: [], conflitti: [] };
      function b(testo) { if (r.blocchi.indexOf(testo) < 0) { r.blocchi.push(testo); blocca(n, testo); } }
      function cf(testo, campo) { r.conflitti.push(testo); conflitto(n, testo, campo); }
      controlliArticolo(a, cf, 'import');
      var M = ctx.misure(a);
      if (!M || M.errore) { b(M && M.errore ? M.errore : 'Misure del codice non disponibili.'); return r; }
      if (isNaN(valoriF[k])) b('Indica il valore in fattura.');
      var agg = numeroIt(a.aggiunte), ded = numeroIt(a.deduzioni);
      var valoreF = (isNaN(valoriF[k]) ? 0 : valoriF[k]) + (isNaN(agg) ? 0 : agg) - (isNaN(ded) ? 0 : ded);
      var valoreEur = euroDa(valoreF, valutaF, cambi);
      r.prezzo = isNaN(valoreEur) ? null : arrotonda(valoreEur);
      r.quotaNolo = quoteNolo[k] || 0;
      r.valoreDogana = isNaN(valoreEur) ? null : arrotonda(valoreEur + r.quotaNolo);
      if (r.valoreDogana !== null && r.valoreDogana < 0) b('Il valore in dogana risulta negativo: controlla deduzioni e importi.');
      // quantità per i dazi per unità: le unità supplementari, o una quantità a parte se il dazio usa un'altra unità
      var qta = M.unitaQta && M.unitaSupCodice && M.unitaQta !== M.unitaSupCodice ? numeroIt(a.quantitaDazio) : numeroIt(a.quantita);
      var c = { valore: r.valoreDogana === null ? NaN : r.valoreDogana, kg: numeroIt(a.netto), qta: qta, unitaQta: M.unitaQta || '' };
      var docs = a.documenti || [];

      /* regime tariffario: dazio paesi terzi o una riduzione */
      var tutti = regimi(M.righe, giorno), scelto = null;
      tutti.forEach(function (x) { if (x.id === (a.regime || 'base')) scelto = x; });
      r.regimi = tutti;
      if (!scelto) { b('Il regime tariffario scelto non vale per questa origine o questa data: scegline un altro.'); scelto = tutti[0]; }
      r.regime = scelto;
      r.preferenza = scelto.preferenza;
      var dazioBase = null, bloccoDazio = '', bloccoAggiuntivi = [];
      if (!scelto.misure.length) b('Per questo codice non c\'è un dazio paesi terzi nei dati.');
      else {
        var conCod = scelto.misure.filter(function (m) { return m.add && (a.addizionali || []).indexOf(m.add) >= 0; });
        var cand = conCod.length ? conCod : scelto.misure.filter(function (m) { return !m.add; });
        if (cand.length !== 1) b(cand.length ? 'Più misure di dazio valgono insieme: verifica su AIDA.' : 'Scegli il codice addizionale del dazio.');
        else {
          var m0 = cand[0], ap = applicabile(m0, docs);
          if (!ap.ok) b('Per «' + (scelto.id === 'base' ? 'dazio paesi terzi' : 'questa riduzione') + '» serve uno di questi documenti: ' + ap.servono.join(', ') + '.');
          else {
            var d0 = dazioMisura(m0, docs, c);
            if (d0.importo !== undefined) { dazioBase = d0.importo; r.tributi.push({ tipo: 'dazio', misura: m0, espressione: d0.espressione, importo: d0.importo }); }
            else bloccoDazio = 'Dazio: ' + (d0.manca ? MANCA[d0.manca] + '.' : 'non calcolabile qui (' + d0.no + ').');
          }
          r.avvertenze = r.avvertenze.concat(scelto.avvertenze);
        }
      }

      /* antidumping, compensativi, addizionali */
      var fam = {};
      famiglie(M.righe, giorno).forEach(function (f) { fam[f.famiglia] = f; });
      gruppiAggiuntivi(M.righe, giorno).forEach(function (g) {
        if (g.tipo === 555) { r.avvertenze.push('Dazio antidumping o compensativo con riscossione sospesa (' + g.legale + '): non si paga, ma verifica se serve una garanzia.'); return; }
        var ba = function (testo) { if (bloccoAggiuntivi.indexOf(testo) < 0) bloccoAggiuntivi.push(testo); };
        if (NON_CALCOLABILI_TIPI[g.tipo]) { ba('C\'è un ' + NON_CALCOLABILI_TIPI[g.tipo] + ': non calcolabile qui, verifica su AIDA.'); return; }
        var f = fam[g.famiglia], scelti = f.codici.filter(function (c) { return (a.addizionali || []).indexOf(c) >= 0; });
        if (scelti.length > 1) { b('Indica un solo codice addizionale del produttore per ' + f.nome + '.'); return; }
        var conCodice = g.misure.filter(function (m) { return m.add && m.add === scelti[0]; });
        var senza = g.misure.filter(function (m) { return !m.add; });
        if (!conCodice.length && !scelti.length && g.codici.length) { ba('Scegli il codice addizionale del produttore per ' + f.nome + '.'); return; }
        var scelte = conCodice.length ? conCodice : senza;
        if (!scelte.length) return;                               // misura per altri produttori: non si applica
        if (scelte.length > 1) { ba('Più misure valgono insieme per ' + f.nome + ' (' + g.legale + '): verifica su AIDA.'); return; }
        var m = scelte[0], ap2 = applicabile(m, docs);
        if (!ap2.ok) return;                                      // la misura vale solo con un documento non dichiarato
        var d = dazioMisura(m, docs, c);
        if (d.importo !== undefined) r.tributi.push({ tipo: AGGIUNTIVI[g.tipo], misura: m, espressione: d.espressione, importo: d.importo });
        else ba(AGGIUNTIVI[g.tipo].charAt(0).toUpperCase() + AGGIUNTIVI[g.tipo].slice(1) + ': ' + (d.manca ? MANCA[d.manca] + '.' : 'non calcolabile qui (' + d.no + ').'));
      });

      /* correzioni a mano: sostituiscono il calcolo, ma se il TARIC dà un altro importo è un conflitto */
      var tar = r.tributi.filter(function (x) { return x.tipo === 'dazio'; })[0];
      if (!vuoto(a.dazioManuale)) {
        var pm = numeroIt(a.dazioManuale);
        if (isNaN(pm)) b('Dazio a mano: aliquota non valida.');
        else if (r.valoreDogana === null) b('Dazio a mano: manca il valore in dogana.');
        else {
          var im = tributo(r.valoreDogana * pm / 100), testoPm = String(a.dazioManuale).trim().replace('.', ',') + ' %';
          if (tar && Math.abs(tar.importo - im) >= 0.005)
            cf('Dazio: hai scritto ' + testoPm + ' (' + euroTesto(im) + '), ma con il codice ' + r.preferenza + ' nella casella 36 il TARIC dà ' + fmtDazio(tar.espressione) + ' (' + euroTesto(tar.importo) + ').', 'dazioManuale');
          if (bloccoDazio) r.avvertenze.push('Dazio inserito a mano al posto di quello non calcolabile qui: non verificato.');
          r.tributi = r.tributi.filter(function (x) { return x.tipo !== 'dazio'; });
          r.tributi.unshift({ tipo: 'dazio', manuale: true, espressione: '', aliquotaManuale: testoPm, importo: im, tariffa: tar || null });
          dazioBase = im; bloccoDazio = '';
        }
      }
      if (bloccoDazio) b(bloccoDazio);
      if (!vuoto(a.altriManuale)) {
        var am = numeroIt(a.altriManuale);
        if (isNaN(am)) b('Antidumping e altri dazi a mano: importo non valido.');
        else {
          var calcolati = r.tributi.filter(function (x) { return x.tipo !== 'dazio'; }), sc = somma(calcolati.map(function (x) { return x.importo; }));
          if (!bloccoAggiuntivi.length && Math.abs(sc - am) >= 0.005)
            cf('Antidumping e altri dazi: hai scritto ' + euroTesto(am) + ', ma il TARIC dà ' + euroTesto(sc) + '.', 'altriManuale');
          if (bloccoAggiuntivi.length) r.avvertenze.push('Antidumping e altri dazi inseriti a mano al posto di quelli non calcolabili qui: non verificati.');
          r.tributi = r.tributi.filter(function (x) { return x.tipo === 'dazio'; });
          r.tributi.push({ tipo: 'altri dazi', manuale: true, espressione: '', importo: tributo(am), calcolati: calcolati });
          bloccoAggiuntivi = [];
        }
      }
      bloccoAggiuntivi.forEach(b);
      r.tributi.forEach(function (x) { x.codice = codiceTributo(x); });

      /* preferenze: utile o inutile? */
      if (r.valoreDogana !== null && tar && !tar.manuale) {
        if (scelto.id === 'base') {
          tutti.forEach(function (x) {
            if (!(PREFERENZIALI[x.tipo] || x.tipo === 106) || CONTINGENTI[x.tipo] || USO_FINALE[x.tipo]) return;
            var mp = x.misure.filter(function (m) { return !m.add && !m.cond; })[0];
            var dp = mp ? dazioMisura(mp, docs, c) : null;
            if (dp && dp.importo !== undefined && dp.importo < tar.importo)
              r.avvertenze.push('Con il codice ' + x.preferenza + ' nella casella 36 (origine preferenziale, con la prova dell\'origine) il dazio sarebbe ' + euroTesto(dp.importo) + ' invece di ' + euroTesto(tar.importo) + '.');
          });
        } else if (PREFERENZIALI[scelto.tipo] || scelto.tipo === 106) {
          var mb = (tutti[0].misure || []).filter(function (m) { return !m.add && !m.cond; })[0], db = mb ? dazioMisura(mb, docs, c) : null;
          if (db && db.importo === 0) r.avvertenze.push('Il dazio paesi terzi è già esente: la preferenza (codice ' + r.preferenza + ') non cambia il dazio.');
        }
      }
      // codici addizionali che non valgono più per codice, origine e data
      var validi = {};
      M.righe.forEach(function (m) { if (m.add && valida(m, giorno)) validi[m.add] = true; });
      (a.addizionali || []).forEach(function (cod) { if (!validi[cod]) cf('Il codice addizionale ' + cod + ' non vale per questo codice, origine e data: toglilo.', 'addizionali'); });

      /* IVA all'importazione: valore in dogana + dazi + spese di inoltro fino a destinazione */
      r.quotaInoltro = quoteInoltro[k] || 0;
      var dazi = somma(r.tributi.map(function (t) { return t.importo; }));
      r.dazi = dazi;
      var aliquota = a.iva === undefined || a.iva === '' ? 22 : Number(a.iva);
      if (r.valoreDogana !== null && dazioBase !== null) {
        r.baseIva = arrotonda(r.valoreDogana + dazi + r.quotaInoltro);
        r.iva = tributo(r.baseIva * aliquota / 100);
      } else { r.baseIva = null; r.iva = null; }
      r.aliquota = aliquota;
      if (aliquota === 0 && vuoto(a.ivaMotivo)) cf('IVA non dovuta: indica il motivo (per esempio dichiarazione d\'intento).', 'ivaMotivo');
      r.unitaSup = M.unitaSup || '';
      if (r.unitaSup && isNaN(numeroIt(a.quantita))) b('Indica la quantità in unità supplementari (' + r.unitaSup + ').');
      r.controlli = controlli(M.righe, giorno, docs);
      r.controlli.forEach(function (x) {
        if (x.esito === 'vietata') b('Importazione vietata per questa origine: ' + nomeMisura(x.misura) + '.');
        if (x.esito === 'manca') r.avvertenze.push('Manca un documento per: ' + nomeMisura(x.misura) + '.');
      });
      r.completo = !r.blocchi.length;
      return r;
    });

    var completo = !blocchi.length;
    var tot = { valoreDogana: 0, dazi: {}, iva: 0, totale: 0 };
    if (completo) {
      tot.valoreDogana = somma(out.map(function (r) { return r.valoreDogana; }));
      out.forEach(function (r) { r.tributi.forEach(function (t) { tot.dazi[t.tipo] = somma([tot.dazi[t.tipo] || 0, t.importo]); }); });
      tot.iva = somma(out.map(function (r) { return r.iva; }));
      tot.totale = somma(Object.keys(tot.dazi).map(function (k) { return tot.dazi[k]; }).concat([tot.iva]));
    }
    return { articoli: out, totali: completo ? tot : null, blocchi: blocchi, conflitti: conflitti, avvisi: avvisi,
      noloEur: arrotonda(noloEur), inoltroEur: arrotonda(inoltroEur) };
  }

  /* conflitti dell'intestazione comuni alle due bolle: data rispetto ai dati TARIC, cambio scritto a mano */
  function controlliTestata(bolla, ctx, giorno, conflitto, avvisi, flusso) {
    var dati = parseInt(String(ctx.dataDati || '').replace(/-/g, ''), 10);
    if (giorno > 19000101 && dati > 19000101) {
      if (giorno < dati) conflitto(0, 'La data della bolla è precedente ai dati TARIC del ' + dataIt(dati) + ': le misure finite prima di quel giorno non ci sono. Per una data passata verifica su AIDA.', 'data');
      else if (giorno - dati > 200) avvisi.push({ articolo: 0, testo: 'La data della bolla è oltre il mese dei dati TARIC (' + dataIt(dati) + '): fino ad allora le misure possono cambiare.' });
    }
    var v = bolla.valuta || 'EUR', cb = (ctx.cambi || {})[v];
    if (cb && cb.manuale) avvisi.push({ articolo: 0, testo: 'Cambio di ' + v + ' scritto a mano (la BCE non lo pubblica): per le Dogane vale il cambio giornaliero della Banca d\'Italia.' });
    if (flusso === 'export' && UE.indexOf(bolla.paese) >= 0) conflitto(0, 'La destinazione predefinita è un paese dell\'Unione: non è un\'esportazione.', 'paese');
  }
  function dataIt(n) { var s = String(n); return s.slice(6, 8) + '/' + s.slice(4, 6) + '/' + s.slice(0, 4); }
  /* conflitti tra i campi di un articolo che non dipendono dalle misure */
  function controlliArticolo(a, cf, flusso) {
    var netto = numeroIt(a.netto), lordo = numeroIt(a.lordo);
    if (!isNaN(netto) && !isNaN(lordo) && netto > lordo) cf('La massa netta (casella 38) supera la massa lorda (casella 35).', 'netto');
    if (UE.indexOf(a.origine) >= 0) cf(flusso === 'import' ? 'L\'origine è un paese dell\'Unione: la merce di origine UE non si importa come merce estera, controlla l\'origine.' : 'La destinazione è un paese dell\'Unione: non è un\'esportazione.', 'origine');
  }
  var MANCA = { valore: 'manca il valore in dogana', kg: 'indica la massa netta', qta: 'indica la quantità' };

  /* Bolla d'esportazione: niente tributi; valore statistico in euro (prezzo più trasporto e assicurazione fino al confine
     italiano, meno le spese oltre il confine comprese nel prezzo), documenti e restrizioni per articolo. */
  function calcolaExport(bolla, ctx) {
    var giorno = parseInt(String(bolla.data || '').replace(/-/g, ''), 10), blocchi = [], conflitti = [], avvisi = [], cambi = ctx.cambi || {}, valutaF = bolla.valuta || 'EUR';
    var nomeMisura = ctx.nomeMisura || function (m) { return 'misura ' + m.t; };
    var arts = bolla.articoli || [];
    function conflitto(n, testo, campo) { conflitti.push({ articolo: n, testo: testo, campo: campo || '' }); }
    if (!(giorno > 19000101)) blocchi.push({ articolo: 0, testo: 'Indica la data della bolla.' });
    if (valutaF !== 'EUR' && !(cambi[valutaF] && cambi[valutaF].tasso > 0)) blocchi.push({ articolo: 0, testo: 'Manca il cambio doganale di ' + valutaF + ' per il mese della bolla.' });
    controlliTestata(bolla, ctx, giorno, conflitto, avvisi, 'export');
    function conv(x, quale) {
      var testo = x && x.importo !== undefined && x.importo !== null ? String(x.importo).trim() : '';
      if (!testo) return 0;
      var e = euroDa(numeroIt(testo), (x && x.valuta) || valutaF, cambi);
      if (isNaN(e)) { blocchi.push({ articolo: 0, testo: quale + ': importo non valido o cambio mancante.' }); return 0; }
      return e;
    }
    var aggEur = conv(bolla.trasporto, 'Trasporto e assicurazione fino al confine'), dedEur = conv(bolla.oltre, 'Spese oltre il confine');
    var inc = INCOTERM[bolla.incoterm];
    if (bolla.incoterm === 'EXW' && !aggEur) conflitto(0, 'Con EXW il trasporto fino al confine non è nel prezzo: va aggiunto al valore statistico, ma il campo è vuoto.', 'trasporto.importo');
    if ((inc === 'compreso' || inc === 'oltre') && !dedEur) conflitto(0, 'Con ' + bolla.incoterm + ' il prezzo comprende il trasporto oltre il confine: va tolto dal valore statistico, ma il campo è vuoto.', 'oltre.importo');
    if ((inc === 'compreso' || inc === 'oltre') && aggEur) conflitto(0, 'Con ' + bolla.incoterm + ' il trasporto è già nel prezzo: aggiungendolo lo conti due volte.', 'trasporto.importo');
    var valoriF = arts.map(function (a) { return numeroIt(a.valore); });
    var pesi = bolla.ripartizione === 'massa' ? arts.map(function (a) { var v = numeroIt(a.lordo); return isNaN(v) ? numeroIt(a.netto) : v; }) : valoriF;
    if (bolla.ripartizione === 'massa' && pesi.some(function (p) { return isNaN(p); }) && (aggEur || dedEur)) blocchi.push({ articolo: 0, testo: 'Per ripartire le spese in base alla massa serve la massa lorda di ogni articolo.' });
    var qa = ripartisci(aggEur, pesi.map(function (p) { return isNaN(p) ? 0 : p; })), qd = ripartisci(dedEur, pesi.map(function (p) { return isNaN(p) ? 0 : p; }));
    var out = arts.map(function (a, k) {
      var n = k + 1, r = { n: n, codice: a.codice, avvertenze: [], blocchi: [], conflitti: [] };
      function b(t) { r.blocchi.push(t); blocchi.push({ articolo: n, testo: t }); }
      function cf(testo, campo) { r.conflitti.push(testo); conflitto(n, testo, campo); }
      controlliArticolo(a, cf, 'export');
      var M = ctx.misure(a);
      if (!M || M.errore) { b(M && M.errore ? M.errore : 'Misure del codice non disponibili.'); return r; }
      var v = euroDa(numeroIt(a.valore), valutaF, cambi);
      if (isNaN(numeroIt(a.valore))) b('Indica il valore.');
      r.prezzo = isNaN(v) ? null : arrotonda(v);
      r.quotaAggiunta = qa[k] || 0; r.quotaTolta = qd[k] || 0;
      r.valore = isNaN(v) ? null : arrotonda(v + r.quotaAggiunta - r.quotaTolta);
      if (r.valore !== null && r.valore < 0) b('Il valore statistico risulta negativo: controlla le spese.');
      r.unitaSup = M.unitaSup || '';
      if (r.unitaSup && isNaN(numeroIt(a.quantita))) b('Indica la quantità in unità supplementari (' + r.unitaSup + ').');
      r.controlli = controlli(M.righe, giorno, a.documenti || []);
      r.controlli.forEach(function (x) {
        if (x.esito === 'vietata') b('Esportazione vietata per questa destinazione: ' + nomeMisura(x.misura) + '.');
        if (x.esito === 'manca') r.avvertenze.push('Manca un documento per: ' + nomeMisura(x.misura) + '.');
      });
      r.completo = !r.blocchi.length;
      return r;
    });
    var completo = !blocchi.length;
    return { articoli: out, blocchi: blocchi, conflitti: conflitti, avvisi: avvisi, aggiuntaEur: arrotonda(aggEur), toltaEur: arrotonda(dedEur),
      totali: completo ? { valore: somma(out.map(function (r) { return r.valore; })) } : null };
  }

  /* ------------------------------------------------------------------ cambio doganale */
  /* Il giorno in cui la BCE fissa il cambio usato per un mese: il penultimo mercoledì del mese precedente
     (art. 146 del Reg. UE 2015/2447). mese = 'AAAA-MM' -> 'AAAA-MM-GG' */
  function giornoCambio(mese) {
    var a = parseInt(mese.slice(0, 4), 10), m = parseInt(mese.slice(5, 7), 10) - 1;   // mese della bolla, 0-11
    var pa = m === 0 ? a - 1 : a, pm = m === 0 ? 11 : m - 1;                             // mese precedente
    var ultimo = new Date(Date.UTC(pa, pm + 1, 0));
    var d = ultimo.getUTCDate() - ((ultimo.getUTCDay() - 3 + 7) % 7);                     // ultimo mercoledì
    d -= 7;                                                                               // penultimo
    return pa + '-' + String(pm + 1).padStart(2, '0') + '-' + String(d).padStart(2, '0');
  }

  var API = {
    PAROLE: PAROLE, MASSA: MASSA, QUANTITA: QUANTITA, NON_CALCOLABILI: NON_CALCOLABILI, AGGIUNTIVI: AGGIUNTIVI, SOLO_E_COMMERCE: SOLO_E_COMMERCE,
    opzioni: opzioni, num: num, isNum: isNum, numeroIt: numeroIt, cent: cent, arrotonda: arrotonda, tributo: tributo, somma: somma, ripartisci: ripartisci,
    calcolaDazio: calcolaDazio, unitaQuantita: unitaQuantita, parseCond: parseCond, valutaCondizioni: valutaCondizioni,
    regimi: regimi, gruppiAggiuntivi: gruppiAggiuntivi, famiglie: famiglie, controlli: controlli, calcolaImport: calcolaImport, calcolaExport: calcolaExport,
    giornoCambio: giornoCambio, euroDa: euroDa, valida: valida, codicePreferenza: codicePreferenza, codiceTributo: codiceTributo, UE: UE, INCOTERM: INCOTERM
  };
  if (typeof module === 'object' && module.exports) module.exports = API;
  else radice.TARIC_CALCOLO = API;
})(this);
