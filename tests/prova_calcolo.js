/* Prove di taric/static/js/calcolo.js (bolla simulata e calcolo degli importi), con node e senza librerie:
     node tests/prova_calcolo.js
   I casi riprendono misure vere del TARIC (novembre 2026); gli importi attesi sono calcolati a mano nei commenti. */
'use strict';
const assert = require('assert');
const K = require('../taric/static/js/calcolo.js');

let n = 0;
function prova(nome, f) { f(); n++; console.log('ok: ' + nome); }
const uguale = (a, b, msg) => assert.deepStrictEqual(a, b, msg);

/* misura nel formato di misure() di app.js */
function M(t, o, duty, extra) { return Object.assign({ t: t, o: o, duty: duty, da: 20200101, a: 0, add: '', ord: '', legal: 'R1', cond: '' }, extra || {}); }

prova('numeri scritti all\'italiana', () => {
  uguale(K.numeroIt('12.500,50'), 12500.5);
  uguale(K.numeroIt('12500,5'), 12500.5);
  uguale(K.numeroIt('12.500'), 12500);          // il punto separa le migliaia
  uguale(K.numeroIt('1.250.000'), 1250000);
  uguale(K.numeroIt('2.5'), 2.5);
  uguale(K.numeroIt(' 0,75 '), 0.75);
  assert(isNaN(K.numeroIt('')) && isNaN(K.numeroIt('-3')) && isNaN(K.numeroIt('abc')) && isNaN(K.numeroIt(null)));
});

prova('arrotondamento al centesimo senza errori di virgola mobile', () => {
  uguale(K.arrotonda(1.005), 1.01);
  uguale(K.arrotonda(2.675), 2.68);
  uguale(K.arrotonda(0.125), 0.13);
  uguale(K.arrotonda(1451.3338), 1451.33);
  uguale(K.arrotonda(-1.005), -1.01);
  uguale(K.somma([0.1, 0.2]), 0.3);
});

prova('ripartizione al centesimo: la somma delle parti è il totale', () => {
  uguale(K.ripartisci(100, [1, 1, 1]), [33.34, 33.33, 33.33]);
  uguale(K.ripartisci(550, [11000, 5500]), [366.67, 183.33]);
  uguale(K.ripartisci(200, [11000, 5500]), [133.33, 66.67]);
  uguale(K.ripartisci(0.05, [1, 2]), [0.02, 0.03]);
  uguale(K.ripartisci(10, [0, 0]), [5, 5]);
  uguale(K.ripartisci(0, [3, 4]), [0, 0]);
  for (let i = 0; i < 200; i++) {
    const pesi = Array.from({ length: 1 + (i % 7) }, (_, k) => ((i * 37 + k * 101) % 997) / 7);
    const tot = ((i * 7919) % 100000) / 100;
    uguale(K.somma(K.ripartisci(tot, pesi)), tot, 'ripartizione ' + i);
  }
});

prova('dazi: percentuali, massa, quantità, minimi e massimi, esenti', () => {
  const c = { valore: 10000, kg: 1200, qta: 100, unitaQta: 'NAR' };
  uguale(K.calcolaDazio('14.000 %', c), { importo: 1400 });
  uguale(K.calcolaDazio('12.800 % + 176.800 EUR DTN', c), { importo: 1280 + 2121.6 });
  uguale(K.calcolaDazio('8.000 % MIN 1.000 EUR DTN MAX 2.000 EUR DTN', { valore: 100, kg: 1000 }), { importo: 10 });
  uguale(K.calcolaDazio('8.000 % MIN 1.000 EUR DTN MAX 2.000 EUR DTN', { valore: 100000, kg: 1000 }), { importo: 20 });
  uguale(K.calcolaDazio('2.500 EUR NAR', c), { importo: 250 });
  uguale(K.calcolaDazio('2.500 EUR MIL', { qta: 4000, unitaQta: 'MIL' }), { importo: 10 });
  uguale(K.calcolaDazio('', c), { importo: 0, esente: true });
  uguale(K.calcolaDazio('NIHIL', c), { importo: 0 });
  uguale(K.calcolaDazio('3.000 % + EA MAX 18.700 % + ADSZ', c).no, 'contiene un elemento agricolo o un dazio addizionale variabile');
  uguale(K.calcolaDazio('10.000 EUR DTN', { valore: 5 }), { manca: 'kg' });
  uguale(K.calcolaDazio('10.000 EUR NAR', { valore: 5, qta: 3, unitaQta: 'NPR' }), { manca: 'qta' });
  assert(K.calcolaDazio('Cond: A cert: D-008 (01):0.000 %', c).no);
});

prova('condizioni: documento dichiarato, condizione predefinita, soglie, più gruppi', () => {
  const ad = 'Cond: A cert: D-008 (01):19.200 % ; A (01):48.500 %';
  let g = K.valutaCondizioni(ad, ['D008']).gruppi;
  uguale([g.length, g[0].esito, g[0].dazio, g[0].cert], [1, 'importo', '19.200 %', 'D008']);
  g = K.valutaCondizioni(ad, []).gruppi;
  uguale([g[0].esito, g[0].dazio, g[0].cert, g[0].alternative], ['importo', '48.500 %', '', ['D008']]);
  g = K.valutaCondizioni('Cond: V 35.400 EUR/DTN(01):16.000 % ; V 0.000 EUR/DTN(01):16.000 % + 7.100 EUR DTN', []).gruppi;
  uguale(g[0].esito, 'soglia');
  // controllo con più gruppi: servono tutti
  const ctl = 'Cond: Y cert: Y-152 (29):; Y cert: Y-986 (29):; Y (09):; YA cert: Y-123 (29):; YA (09):';
  g = K.valutaCondizioni(ctl, ['Y152']).gruppi;
  uguale(g.map(x => x.esito), ['consentita', 'vietata']);
  uguale(g[1].alternative, ['Y123']);
  g = K.valutaCondizioni(ctl, ['Y-986', 'Y123']).gruppi;               // anche con il trattino
  uguale(g.map(x => x.esito), ['consentita', 'consentita']);
  g = K.valutaCondizioni('B cert: C-990 (27):; B (07):', []).gruppi;
  uguale(g[0].esito, 'non_si_applica');
  g = K.valutaCondizioni('B cert: C-990 (27):; B (07):', ['C990']).gruppi;
  uguale(g[0].esito, 'si_applica');
  g = K.valutaCondizioni('B cert: C-990 (27):', []).gruppi;
  uguale(g[0].esito, 'nessuna');
});

prova('giorno del cambio doganale: penultimo mercoledì del mese precedente', () => {
  uguale(K.giornoCambio('2026-11'), '2026-10-21');    // mercoledì di ottobre 2026: 7, 14, 21, 28
  uguale(K.giornoCambio('2026-01'), '2025-12-24');    // dicembre 2025: 3, 10, 17, 24, 31
  uguale(K.giornoCambio('2026-03'), '2026-02-18');    // febbraio 2026: 4, 11, 18, 25
  uguale(K.giornoCambio('2027-01'), '2026-12-23');    // dicembre 2026: 2, 9, 16, 23, 30
  uguale(K.giornoCambio('2026-09'), '2026-08-19');    // agosto 2026: 5, 12, 19, 26
});

/* ---------------------------------------------------------------- bolla d'importazione */
// Biciclette 8712 00 30 00 dalla Cina: dazio 14 %, antidumping 48,5 % (B999) o per produttore (B772 con D008: 19,2 %)
const BICI = [
  M(109, '1011', 'NAR'),
  M(103, '1011', '14.000 %'),
  M(107, '1011', '3.000 EUR', { cond: 'B cert: C-127 (27):; B (06):' }),
  M(800, '1011', '2.000 EUR', { cond: 'B cert: Y-126 (27):; B (07):' }),
  M(552, 'CN', '48.500 %', { add: 'C453', legal: 'R2020/966' }),                // Universal Cycle Corporation
  M(552, 'CN', 'Cond: A cert: D-008 (01):19.200 % ; A (01):48.500 %', { add: 'B772', legal: 'R2025/2146' }),
  M(552, 'CN', '48.500 %', { add: 'B999', legal: 'R2025/2146' }),               // altri produttori
  M(552, 'CN', 'NIHIL', { add: 'C329', legal: 'R2025/2146' }),                  // Giant
  M(724, '1011', 'Cond: Y cert: Y-152 (29):; Y cert: Y-986 (29):; Y (09):')
];
// Calzature 6403 99 96 10 dal Vietnam: dazio 8 %, preferenza (misura senza dazio: esente), sospensione per le navi con C990
const SCARPE = [
  M(109, '1011', 'NPR'),
  M(103, '1011', '8.000 %'),
  M(117, '1011', '', { cond: 'B cert: C-990 (27):; B (07):' }),
  M(142, 'VN', '')
];
// Arance 0805 10 22 dal Marocco in dicembre: dazio con prezzo d'entrata (non calcolabile qui)
const ARANCE = [
  M(103, '1011', 'Cond: V 35.400 EUR/DTN(01):16.000 % ; V 0.000 EUR/DTN(01):16.000 % + 7.100 EUR DTN', { da: 20261201, a: 20261231 }),
  M(103, '1011', '16.000 %', { da: 20261016, a: 20261130 }),
  M(142, 'MA', '', { da: 20260601, a: 20261130 }),
  M(695, '1011', 'Cond: B cert: Y-155 (01):50.000 % ; B (01):0.000 %')
];
const MISURE = { '8712003000': { righe: BICI, unitaSup: 'p/st' }, '6403999610': { righe: SCARPE, unitaSup: 'pa' }, '0805102200': { righe: ARANCE, unitaSup: '' } };
const ctx = { misure: a => MISURE[a.codice] || { errore: 'Codice ' + a.codice + ' non trovato.' }, cambi: { USD: { tasso: 1.1 } } };

function bolla(articoli, extra) {
  return Object.assign({ data: '2026-11-14', valuta: 'USD', nolo: { importo: '550', valuta: 'USD' }, assicurazione: { importo: '55', valuta: 'USD' },
    ripartizione: 'valore', inoltro: { importo: '200', valuta: 'EUR' }, articoli: articoli }, extra || {});
}
const BICI_ART = { codice: '8712003000', origine: 'CN', valore: '11.000,00', netto: '1200', lordo: '1300', quantita: '100', addizionali: ['B999'], iva: 22 };
const SCARPE_ART = { codice: '6403999610', origine: 'VN', valore: '5500', netto: '300', lordo: '320', quantita: '400', regime: '142-VN-', iva: 22 };

prova('regimi tariffari: dazio paesi terzi, preferenza e sospensione con le loro avvertenze', () => {
  const r = K.regimi(SCARPE, 20261114);
  uguale(r.map(x => x.id), ['base', '117-1011-', '142-VN-']);
  uguale(r[2].avvertenze, ['serve la prova dell\'origine preferenziale']);
  const q = K.regimi([M(103, '1011', '20.000 %'), M(143, 'CA', '', { ord: '094002' })], 20261114);
  uguale(q[1].avvertenze, ['serve la prova dell\'origine preferenziale', 'solo se il contingente n. 09.4002 ha ancora disponibilità']);
});

prova('bolla: biciclette dalla Cina (antidumping B999) e scarpe dal Vietnam con preferenza, in dollari', () => {
  const r = K.calcolaImport(bolla([BICI_ART, SCARPE_ART]), ctx);
  uguale(r.blocchi, []);
  // nolo + assicurazione = 605 USD = 550,00 EUR, ripartiti sul valore 11000 : 5500 -> 366,67 e 183,33
  uguale(r.noloEur, 550);
  const [a, b] = r.articoli;
  uguale([a.prezzo, a.quotaNolo, a.valoreDogana], [10000, 366.67, 10366.67]);
  // dazio 14 % di 10366,67 = 1451,3338 -> 1451,33; antidumping 48,5 % = 5027,83495 -> 5027,83
  uguale(a.tributi.map(t => [t.tipo, t.importo]), [['dazio', 1451.33], ['antidumping', 5027.83]]);
  // base IVA = 10366,67 + 1451,33 + 5027,83 + 133,33 (inoltro) = 16979,16; IVA 22 % = 3735,4152 -> 3735,42
  uguale([a.quotaInoltro, a.baseIva, a.iva], [133.33, 16979.16, 3735.42]);
  uguale([b.prezzo, b.quotaNolo, b.valoreDogana], [5000, 183.33, 5183.33]);
  uguale(b.tributi.map(t => [t.tipo, t.importo]), [['dazio', 0]]);
  uguale([b.quotaInoltro, b.baseIva, b.iva], [66.67, 5250, 1155]);
  assert(b.avvertenze.indexOf('serve la prova dell\'origine preferenziale') >= 0);
  uguale(r.totali, { valoreDogana: 15550, dazi: { dazio: 1451.33, antidumping: 5027.83 }, iva: 4890.42, totale: 11369.58 });
  // le misure di sole vendite a distanza (107, 800) non entrano
  assert(!a.tributi.some(t => t.misura.t === 107 || t.misura.t === 800));
  // documenti: la misura 724 chiede Y152 o Y986
  const ctl = a.controlli.filter(x => x.misura.t === 724)[0];
  uguale([ctl.esito, ctl.gruppi[0].alternative], ['manca', ['Y152', 'Y986']]);
});

prova('bolla: codice addizionale da scegliere e documento D008 del produttore', () => {
  let r = K.calcolaImport(bolla([Object.assign({}, BICI_ART, { addizionali: [] })]), ctx);
  assert(r.totali === null);
  uguale(r.blocchi.map(x => x.testo), ['Scegli il codice addizionale del produttore per il dazio antidumping.']);   // una volta sola
  // il codice di un regolamento esclude l'altro: C453 (Reg. 2020/966) da solo, senza il «B999 altri» del 2025
  r = K.calcolaImport(bolla([Object.assign({}, BICI_ART, { addizionali: ['C453'] })], { nolo: {}, assicurazione: {}, inoltro: {} }), ctx);
  uguale(r.articoli[0].tributi.map(t => [t.tipo, t.misura.add, t.importo]), [['dazio', '', 1400], ['antidumping', 'C453', 4850]]);
  r = K.calcolaImport(bolla([Object.assign({}, BICI_ART, { addizionali: ['C453', 'B999'] })], { nolo: {}, assicurazione: {}, inoltro: {} }), ctx);
  uguale(r.blocchi.map(x => x.testo), ['Indica un solo codice addizionale del produttore per il dazio antidumping.']);
  uguale(K.famiglie(BICI, 20261114).map(f => [f.famiglia, f.codici]), [['antidumping', ['C453', 'B772', 'B999', 'C329']]]);
  r = K.calcolaImport(bolla([Object.assign({}, BICI_ART, { addizionali: ['B772'], documenti: ['D008'] })], { nolo: {}, assicurazione: {}, inoltro: {} }), ctx);
  // valore 10000,00 EUR: dazio 1400,00, antidumping 19,2 % = 1920,00, IVA 22 % di 13320,00 = 2930,40
  uguale(r.articoli[0].tributi.map(t => t.importo), [1400, 1920]);
  uguale(r.totali, { valoreDogana: 10000, dazi: { dazio: 1400, antidumping: 1920 }, iva: 2930.4, totale: 6250.4 });
  r = K.calcolaImport(bolla([Object.assign({}, BICI_ART, { addizionali: ['B772'] })], { nolo: {}, assicurazione: {}, inoltro: {} }), ctx);
  uguale(r.articoli[0].tributi[1].importo, 4850);                       // senza D008: 48,5 %
  r = K.calcolaImport(bolla([Object.assign({}, BICI_ART, { addizionali: ['C329'] })], { nolo: {}, assicurazione: {}, inoltro: {} }), ctx);
  uguale(r.articoli[0].tributi[1].importo, 0);                          // NIHIL
});

prova('bolla: quello che non si può calcolare blocca il totale con il motivo', () => {
  // prezzo d'entrata a dicembre
  let r = K.calcolaImport(bolla([{ codice: '0805102200', origine: 'MA', valore: '1000', netto: '900', iva: 4 }], { data: '2026-12-10' }), ctx);
  assert(r.totali === null);
  uguale(r.blocchi[0].testo, 'Dazio: non calcolabile qui (dipende da un prezzo o da una quantità (prezzo d\'entrata o soglia)).');
  // a novembre il dazio è il 16 % senza condizioni; il dazio addizionale 695 senza Y155 è 0 %
  r = K.calcolaImport(bolla([{ codice: '0805102200', origine: 'MA', valore: '1100', netto: '900', iva: 4 }], { nolo: {}, assicurazione: {}, inoltro: {} }), ctx);
  uguale(r.articoli[0].tributi.map(t => [t.tipo, t.importo]), [['dazio', 160], ['dazio addizionale', 0]]);
  uguale(r.articoli[0].iva, 46.4);                                      // 4 % di 1160,00
  // regime non valido alla data (la preferenza MA finisce il 30 novembre)
  r = K.calcolaImport(bolla([{ codice: '0805102200', origine: 'MA', valore: '1100', netto: '900', regime: '142-MA-' }], { data: '2026-12-10' }), ctx);
  assert(r.blocchi.some(x => /non vale per questa origine o questa data/.test(x.testo)));
  // cambio mancante, codice sconosciuto, valore mancante, quantità mancante
  r = K.calcolaImport(bolla([Object.assign({}, BICI_ART, { quantita: '' }), { codice: '9999999999', valore: '1' }], { valuta: 'CNY' }), ctx);
  uguale(r.blocchi[0].testo, 'Manca il cambio doganale di CNY per il mese della bolla.');
  assert(r.blocchi.some(x => x.articolo === 1 && x.testo === 'Dazio: manca il valore in dogana.'));
  // spese in una valuta senza cambio
  const s = K.calcolaImport(bolla([BICI_ART], { inoltro: { importo: '100', valuta: 'GBP' } }), ctx);
  uguale(s.blocchi.map(x => x.testo), ['Spese di inoltro fino a destinazione: importo non valido o cambio mancante.']);
  assert(r.blocchi.some(x => x.articolo === 2 && x.testo === 'Codice 9999999999 non trovato.'));
  assert(r.blocchi.some(x => x.articolo === 1 && /unità supplementari \(p\/st\)/.test(x.testo)));
  // sospensione per le navi solo con C990
  r = K.calcolaImport(bolla([Object.assign({}, SCARPE_ART, { regime: '117-1011-' })], { nolo: {}, assicurazione: {}, inoltro: {} }), ctx);
  uguale(r.blocchi[0].testo, 'Per «questa riduzione» serve uno di questi documenti: C990.');
  r = K.calcolaImport(bolla([Object.assign({}, SCARPE_ART, { regime: '117-1011-', documenti: ['C990'] })], { nolo: {}, assicurazione: {}, inoltro: {} }), ctx);
  uguale(r.articoli[0].tributi[0].importo, 0);
});

prova('bolla: divieto d\'importazione senza condizioni', () => {
  const ctx2 = { misure: () => ({ righe: [M(103, '1011', '5.000 %'), M(277, 'KP', '')] }), cambi: {}, nomeMisura: m => 'divieto (' + m.t + ')' };
  const r = K.calcolaImport({ data: '2026-11-14', valuta: 'EUR', articoli: [{ codice: '1', valore: '100' }] }, ctx2);
  uguale(r.blocchi.map(x => x.testo), ['Importazione vietata per questa origine: divieto (277).']);
});

prova('bolla d\'esportazione: valore statistico in euro e documenti', () => {
  const ctxE = { misure: () => ({ righe: [M(109, '1011', 'NAR'), M(717, '1011', 'Cond: Y cert: Y-920 (25):; Y cert: X-002 (25):; Y (05):')], unitaSup: 'p/st' }), cambi: { USD: { tasso: 1.08 } } };
  let r = K.calcolaExport({ data: '2026-11-14', valuta: 'USD', articoli: [{ codice: '8471300000', valore: '10.800', quantita: '10' }] }, ctxE);
  uguale(r.totali, { valore: 10000 });
  uguale(r.articoli[0].controlli[0].esito, 'manca');
  r = K.calcolaExport({ data: '2026-11-14', valuta: 'USD', articoli: [{ codice: '8471300000', valore: '10.800', quantita: '10', documenti: ['Y920'] }] }, ctxE);
  uguale(r.articoli[0].controlli[0].esito, 'ok');
  const ctxV = { misure: () => ({ righe: [M(278, 'KP', '')] }), cambi: {} };
  r = K.calcolaExport({ data: '2026-11-14', valuta: 'EUR', articoli: [{ codice: '1', valore: '5' }] }, ctxV);
  assert(r.totali === null && /vietata/.test(r.blocchi[0].testo));
});

console.log(n + ' prove superate');
