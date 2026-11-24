// Prove del codice a barre Code 128 dell'MRN (taric/static/js/codice128.js): tabella dei simboli, carattere di controllo,
// sequenza delle barre di un MRN letta da un lettore vero (zxing-cpp) quando è stata scritta, disegno SVG.
// Uso: node tests/prova_codice128.js
'use strict';
const assert = require('assert');
const C = require('../taric/static/js/codice128.js');
let n = 0;
function prova(nome, f) { f(); n++; console.log('ok: ' + nome); }

prova('esempio classico «PJJ123C»: start B, valori dei caratteri, controllo 55 (somma pesata 879 modulo 103), stop', () => {
  assert.deepStrictEqual(C.valori('PJJ123C'), [104, 48, 42, 42, 17, 18, 19, 35, 55, 106]);
});

prova('ogni simbolo: 3 barre e 3 spazi da 1 a 4 moduli, 11 moduli; lo stop 13; tutti diversi', () => {
  const visti = new Set();
  for (let c = 32; c <= 127; c++) {
    const s = C.moduli(String.fromCharCode(c)).slice(6, 12);          // le 6 larghezze del carattere, dopo lo start
    assert.strictEqual(s.reduce((a, b) => a + b, 0), 11);
    assert.ok(s.every(w => w >= 1 && w <= 4));
    visti.add(s.join(''));
  }
  assert.strictEqual(visti.size, 96);
  const tutto = C.moduli('A');
  assert.strictEqual(tutto.length, 6 * 3 + 7);                         // start, carattere, controllo, stop
  assert.strictEqual(tutto.slice(-7).reduce((a, b) => a + b, 0), 13);
});

prova('MRN di 18 caratteri: 20 simboli e lo stop, barre lette da zxing-cpp come «26ITQ0B44714259R61»', () => {
  const m = C.moduli('26ITQ0B44714259R61');
  assert.strictEqual(m.reduce((a, b) => a + b, 0), 11 * 20 + 13);
  assert.strictEqual(m.join(''), '2112142232112231122313112133112113311231221311232212312212313121311232212212312232112132123211222311312231121232213122122331112');
});

prova('caratteri fuori dal set B: niente codice; SVG con le barre e le zone di rispetto', () => {
  assert.strictEqual(C.moduli('è'), null);
  assert.strictEqual(C.svg('à'), '');
  const s = C.svg('26ITQ0B44714259R61', 40);
  assert.strictEqual((s.match(/<rect /g) || []).length, 20 * 3 + 4);   // 3 barre per simbolo, 4 nello stop
  assert.ok(/viewBox="0 0 253 40"/.test(s) && /fill="currentColor"/.test(s) && /aria-label="Codice a barre 26ITQ0B44714259R61"/.test(s));
});

console.log(n + ' prove superate');
