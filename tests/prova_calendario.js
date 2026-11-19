/* Prove di taric/static/js/calendario.js (stagioni e feste della scena del porto), con node e senza librerie:
     node tests/prova_calendario.js */
'use strict';
const assert = require('assert');
const { calendario, pasqua, prove } = require('../taric/static/js/calendario.js');

let n = 0;
function prova(nome, f) { f(); n++; console.log('ok: ' + nome); }
const giorno = (s) => { const [a, m, g] = s.split('-').map(Number); return new Date(a, m - 1, g, 12); };
const feste = (s) => calendario(giorno(s)).feste.slice().sort();
const iso = (d) => [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-');

prova('Pasqua negli anni noti', () => {
  const noti = { 2024: '2024-03-31', 2025: '2025-04-20', 2026: '2026-04-05', 2027: '2027-03-28', 2028: '2028-04-16',
    2029: '2029-04-01', 2030: '2030-04-21', 2038: '2038-04-25', 2285: '2285-03-22', 1943: '1943-04-25' };
  Object.keys(noti).forEach((a) => assert.strictEqual(iso(pasqua(+a)), noti[a], a));
});

prova('stagioni per mesi interi', () => {
  const attese = { '2026-01-15': 'inverno', '2026-02-28': 'inverno', '2026-03-01': 'primavera', '2026-05-31': 'primavera',
    '2026-06-01': 'estate', '2026-08-31': 'estate', '2026-09-01': 'autunno', '2026-11-30': 'autunno', '2026-12-01': 'inverno' };
  Object.keys(attese).forEach((d) => assert.strictEqual(calendario(giorno(d)).stagione, attese[d], d));
});

prova('Natale fino all\'Epifania, Capodanno dal 31 dicembre al 2 gennaio', () => {
  assert.deepStrictEqual(feste('2026-11-30'), []);
  assert.deepStrictEqual(feste('2026-12-01'), ['natale']);
  assert.deepStrictEqual(feste('2026-12-31'), ['capodanno', 'natale']);
  assert.deepStrictEqual(feste('2027-01-02'), ['capodanno', 'natale']);
  assert.deepStrictEqual(feste('2027-01-03'), ['natale']);
  assert.deepStrictEqual(feste('2027-01-06'), ['befana', 'natale']);
  assert.deepStrictEqual(feste('2027-01-07'), []);
});

prova('feste a data fissa', () => {
  assert.deepStrictEqual(feste('2027-02-14'), ['san-valentino']);
  assert.deepStrictEqual(feste('2027-03-08'), ['mimosa']);
  assert.deepStrictEqual(feste('2027-04-25'), ['festa-nazionale']);
  assert.deepStrictEqual(feste('2027-05-01'), ['festa-nazionale']);
  assert.deepStrictEqual(feste('2027-06-02'), ['festa-nazionale', 'repubblica']);
  assert.deepStrictEqual(feste('2027-08-15'), ['ferragosto']);
  assert.deepStrictEqual(feste('2026-10-31'), ['halloween']);
  assert.deepStrictEqual(feste('2026-11-19'), []);
});

prova('Carnevale dal giovedì al martedì grasso, Pasqua e Pasquetta', () => {
  // 2027: Pasqua il 28 marzo, giovedì grasso 4 febbraio, martedì grasso 9 febbraio
  assert.deepStrictEqual(feste('2027-02-03'), []);
  assert.deepStrictEqual(feste('2027-02-04'), ['carnevale']);
  assert.deepStrictEqual(feste('2027-02-09'), ['carnevale']);
  assert.deepStrictEqual(feste('2027-02-10'), []);
  assert.deepStrictEqual(feste('2027-03-27'), []);
  assert.deepStrictEqual(feste('2027-03-28'), ['pasqua']);
  assert.deepStrictEqual(feste('2027-03-29'), ['pasqua']);
  assert.deepStrictEqual(feste('2027-03-30'), []);
  // 2038: Pasqua il 25 aprile, insieme alla festa della Liberazione; 2024: carnevale fino al 13 febbraio, poi San Valentino
  assert.deepStrictEqual(feste('2038-04-25'), ['festa-nazionale', 'pasqua']);
  assert.deepStrictEqual(feste('2024-02-13'), ['carnevale']);
  assert.deepStrictEqual(feste('2024-02-14'), ['san-valentino']);
});

prova('ore della giornata e cambio dell\'ora legale non spostano il giorno', () => {
  assert.deepStrictEqual(calendario(new Date(2027, 2, 29, 0, 5)).feste, ['pasqua']);       // Pasquetta, appena dopo mezzanotte
  assert.deepStrictEqual(calendario(new Date(2027, 2, 29, 23, 55)).feste, ['pasqua']);
  assert.deepStrictEqual(calendario(new Date(2027, 2, 30, 0, 1)).feste, []);
});

prova('tema dei colori e auguri del giorno', () => {
  const c = (s) => { const x = calendario(giorno(s)); return [x.tema, x.auguri]; };
  assert.deepStrictEqual(c('2026-11-19'), ['autunno', '']);
  assert.deepStrictEqual(c('2026-12-10'), ['natale', 'Buone feste!']);
  assert.deepStrictEqual(c('2026-12-25'), ['natale', 'Buon Natale!']);
  assert.deepStrictEqual(c('2026-12-31'), ['capodanno', 'Buon anno!']);
  assert.deepStrictEqual(c('2027-01-06'), ['natale', 'Buona Befana!']);
  assert.deepStrictEqual(c('2027-01-07'), ['inverno', '']);
  assert.deepStrictEqual(c('2027-02-14'), ['san-valentino', 'Buon San Valentino!']);
  assert.deepStrictEqual(c('2027-02-09'), ['carnevale', 'Buon Carnevale!']);
  assert.deepStrictEqual(c('2027-03-08'), ['mimosa', 'Buona festa della donna!']);
  assert.deepStrictEqual(c('2027-03-28'), ['pasqua', 'Buona Pasqua!']);
  assert.deepStrictEqual(c('2027-03-29'), ['pasqua', 'Buona Pasquetta!']);
  assert.deepStrictEqual(c('2027-04-25'), ['festa-nazionale', 'Buona festa della Liberazione!']);
  assert.deepStrictEqual(c('2027-05-01'), ['festa-nazionale', 'Buon primo maggio!']);
  assert.deepStrictEqual(c('2027-06-02'), ['festa-nazionale', 'Buona festa della Repubblica!']);
  assert.deepStrictEqual(c('2027-07-10'), ['estate', '']);
  assert.deepStrictEqual(c('2027-08-15'), ['estate', 'Buon Ferragosto!']);
  assert.deepStrictEqual(c('2026-10-31'), ['halloween', 'Dolcetto o scherzetto?']);
});

prova('i giorni dell\'anteprima cadono davvero nella festa o nella stagione che dicono', () => {
  // le stagioni in giorni senza feste; per le feste, la festa c'è (il tema può essere un'altra festa dello stesso giorno)
  const stagioni = ['primavera', 'estate', 'autunno', 'inverno'];
  const attese = { capodanno: 'capodanno', befana: 'befana', 'san-valentino': 'san-valentino', carnevale: 'carnevale', mimosa: 'mimosa',
    pasqua: 'pasqua', liberazione: 'festa-nazionale', lavoro: 'festa-nazionale', repubblica: 'repubblica', ferragosto: 'ferragosto',
    halloween: 'halloween', natale: 'natale' };
  for (let anno = 2025; anno <= 2060; anno++) {
    const lista = prove(anno);
    assert.deepStrictEqual(lista.map((x) => x[0]).sort(), stagioni.concat(Object.keys(attese)).sort());
    lista.forEach(([valore, nome, data]) => {
      assert.ok(nome && /^\d{4}-\d{2}-\d{2}$/.test(data), valore);
      const c = calendario(giorno(data));
      if (stagioni.includes(valore)) assert.ok(c.tema === valore && !c.feste.length, valore + ' ' + data);
      else assert.ok(c.feste.includes(attese[valore]), valore + ' ' + data);
    });
  }
  // 2038: l'8 marzo cade a Carnevale e vince la festa di un giorno; Pasqua il 25 aprile vince sulla Liberazione
  assert.deepStrictEqual([calendario(giorno('2038-03-08')).tema, calendario(giorno('2038-03-08')).auguri], ['mimosa', 'Buona festa della donna!']);
  assert.strictEqual(calendario(giorno('2038-03-07')).tema, 'carnevale');
  assert.strictEqual(calendario(giorno('2038-04-25')).tema, 'pasqua');
});

prova('i colori di ogni tema si leggono sulle schede, chiare e scure (contrasto WCAG AA)', () => {
  const css = require('fs').readFileSync(require('path').join(__dirname, '..', 'taric', 'static', 'css', 'app.css'), 'utf8');
  const lum = (h) => { const c = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
  const contrasto = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
  const temi = [...css.matchAll(/\.tema-([a-z-]+)\{--tema-chiaro:(#[0-9a-f]{6});--tema-scuro:(#[0-9a-f]{6})/g)];
  assert.strictEqual(temi.length, 12);
  const carta = css.match(/--carta:(#[0-9a-f]{6})/)[1], cartaScura = css.match(/--fondo:#0d151e; --carta:(#[0-9a-f]{6})/)[1];
  const su = css.match(/--su-accento:(#[0-9a-f]{6})/)[1], suScuro = '#0a1119';
  temi.forEach(([, nome, chiaro, scuro]) => {
    assert.ok(contrasto(chiaro, carta) >= 4.5 && contrasto(chiaro, su) >= 4.5, nome + ' chiaro');
    assert.ok(contrasto(scuro, cartaScura) >= 4.5 && contrasto(scuro, suScuro) >= 4.5, nome + ' scuro');
  });
  const { calendario: cal } = require('../taric/static/js/calendario.js');
  const nomi = temi.map((t) => t[1]);
  for (let d = new Date(2027, 0, 1); d.getFullYear() === 2027; d.setDate(d.getDate() + 1)) assert.ok(nomi.includes(cal(d).tema), String(d));
});

console.log(n + ' prove superate');
