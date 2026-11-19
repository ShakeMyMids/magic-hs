/* Prove di taric/static/js/calendario.js (stagioni e feste della scena del porto), con node e senza librerie:
     node tests/prova_calendario.js */
'use strict';
const assert = require('assert');
const { calendario, pasqua } = require('../taric/static/js/calendario.js');

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

console.log(n + ' prove superate');
