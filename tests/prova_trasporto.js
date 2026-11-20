/* Prove del calcolo del trasporto (taric/static/js/trasporto.js): node tests/prova_trasporto.js
   La tariffa qui è piccola e inventata, con la stessa forma di quella che legge taric/leggi_tariffe.py; che il calcolo
   dei prezzi sia lo stesso del lettore Python lo controlla tests/test_trasporto.py sulla guida finta. */
'use strict';
const assert = require('assert');
const X = require('../taric/static/js/trasporto.js');

let n = 0;
function prova(nome, f) { f(); n++; console.log('ok: ' + nome); }
const uguale = (a, b) => assert.deepStrictEqual(a, b);

// zone 1-2; fino a 2 kg ogni mezzo kg, poi scatti per 0,5 kg fino a 10 e per kg oltre (come Worldwide)
const W = { zone: [1, 2], unita: 0.5, righe: [[0.5, [40, 60]], [1, [45, 70]], [1.5, [50, 80]], [2, [55, 90]], [10, [135, 250]]],
  scatti: [{ da: 2, a: 10, passo: 0.5, prezzi: [5, 10] }, { da: 10, a: null, passo: 1, prezzi: [8, 16] }] };
const E = { zone: [1], unita: 1, righe: [[1, [50]], [5, [70]]], scatti: [{ da: 5, a: null, passo: 5, prezzi: [20] }] };
const T = {
  paesi: [{ codice: 'IT', nome: 'Italia', zona: 0, servizi: null }, { codice: 'CN', nome: 'Cina', zona: 2, servizi: ['worldwide', '12:00'] },
    { codice: 'CH', nome: 'Svizzera', zona: 1, servizi: ['worldwide', '12:00', '10:30', '9:00', 'economy'] }, { codice: 'BR', nome: 'Brasile', zona: 2, servizi: null }],
  prodotti: { worldwide: { export: W, import: W }, economy: { import: E } },
  orari: { import: { '12:00': 11, '10:30': 15, '9:00': 35 } },
  limiti: { worldwide: { collo_kg: 70, colli: null, misure: [120, 80, 80], spedizione_kg: 3000, pallet_kg: 1000, pallet_misure: [300, 200, 160] },
    '10:30': { collo_kg: 25, colli: 10, misure: [100, 80, 80], spedizione_kg: 250, pallet_kg: 0, pallet_misure: 0 } },
  supplementi: { extra_peso: 100, extra_misura: 20, non_conveyable: 20, pallet_non_sovrapponibile: 300, sabato: 40,
    aree_remote: { per_kg: 0.5, minimo: 24 }, assicurazione: { minimo: 11, percentuale: 1 }, batterie_litio: 5 }
};
const collo = (kg, l, p, h, extra) => Object.assign({ quanti: 1, kg: kg, l: l, p: p, h: h }, extra || {});
const chiedi = (extra) => X.calcola(T, Object.assign({ flusso: 'import', paese: 1, servizio: 'worldwide', colli: [collo(3, 30, 20, 10)], carburante: '' }, extra));

prova('prezzo: righe della tabella, riga sopra e scatti', () => {
  uguale([X.prezzo(W, 0, 0.2), X.prezzo(W, 0, 1.5), X.prezzo(W, 0, 1.2), X.prezzo(W, 0, 2.4), X.prezzo(W, 0, 10)], [40, 50, 50, 60, 135]);
  uguale(X.prezzo(W, 1, 12.3), 250 + 3 * 16);                     // oltre i 10: al kg, 12,3 -> 13
  uguale(X.prezzo(E, 0, 7), 70 + 20);                             // per 5 kg: 7 -> 10
  uguale([X.pesoDiTariffa(W, 1.2), X.pesoDiTariffa(W, 2.4), X.pesoDiTariffa(W, 12.3), X.pesoDiTariffa(E, 7)], [1.5, 2.5, 13, 10]);
});

prova('pesi: volumetrico per collo (L x P x A / 5000), arrotondato al mezzo kg, sommato', () => {
  const p = X.pesi([collo(2, 50, 40, 30, { quanti: 2 }), collo(7.2, 10, 10, 10), collo('', 10, 10, 10)], 0.5);
  // 50x40x30/5000 = 12 kg volumetrici per collo; 7,2 kg reali -> 7,5
  uguale([p.numero, p.reale, p.volumetrico, p.tassabile], [3, 11.2, 24.2, 31.5]);
  uguale(X.pesi([collo(0.3)], 1).tassabile, 1);                   // Economy Select: al kg
});

prova('spedizione semplice dalla Cina con il carburante', () => {
  const r = chiedi({ carburante: '35' });
  // 3 kg reali, 1,2 volumetrici: 3 kg = 2 kg + 2 scatti da 0,5 (zona 2: 90 + 2 x 10)
  uguale(r.blocchi, []);
  uguale(r.voci.map(v => [v.nome, v.importo]), [['Trasporto DHL Express Worldwide, zona 2, 3 kg', 110], ['Supplemento carburante 35 %', 38.5]]);
  uguale([r.trasporto, r.assicurazione, r.totale], [148.5, 0, 148.5]);
  const s = chiedi({});
  assert(s.avvisi.some(a => /carburante non indicato/.test(a)) && s.totale === 110);
});

prova('servizi a orario, disponibilità per paese ed Economy Select', () => {
  let r = chiedi({ servizio: '12:00', carburante: 10 });
  uguale(r.voci.map(v => v.importo), [110, 11, 12.1]);           // il carburante anche sul servizio a orario
  r = chiedi({ servizio: '9:00' });
  uguale(r.blocchi, ['DHL Express 9:00 non è disponibile per Cina (zonario della guida).']);
  r = chiedi({ paese: 3, servizio: '9:00' });                     // spunte non lette: si calcola, con l'avviso
  assert(!r.blocchi.length && /non controllata/.test(r.avvisi[0]));
  r = chiedi({ paese: 2, servizio: 'economy', colli: [collo(7, 10, 10, 10)] });
  uguale(r.voci[0].importo, 90);
  r = chiedi({ paese: 1, servizio: 'economy' });
  uguale(r.blocchi, ['DHL Economy Select non è disponibile per Cina (zonario della guida).']);
  uguale(chiedi({ flusso: 'export', paese: 2, servizio: 'economy' }).blocchi, ['DHL Economy Select: prezzi d\'esportazione non presenti nella guida caricata.']);
  uguale(chiedi({ paese: 0 }).blocchi, ['Italia è nella zona nazionale: le spedizioni nazionali non sono nel calcolatore.']);
});

prova('supplementi dai colli: extra peso, extra misura, nastro e pallet non sovrapponibile', () => {
  const r = chiedi({ carburante: 20, colli: [collo(30, 40, 40, 40), collo(10, 110, 40, 30), collo(75, 100, 80, 70, { pallet: true, nonSovrapponibile: true }),
    collo(5, 20, 20, 20, { quanti: 2, nonNastro: true })] });
  uguale(r.blocchi, []);
  const nomi = r.voci.map(v => v.nome.replace(/ \(.*\)/, '') + ' ' + v.importo);
  // 30 kg -> nastro; 110 cm -> extra misura (non anche nastro); pallet di 75 kg -> extra peso e non sovrapponibile;
  // due colli con imballo non in cartone -> nastro
  assert(nomi.includes('Collo extra misura × 1 100') || nomi.some(x => /^Collo extra misura 100$/.test(x)), nomi);
  assert(nomi.some(x => /^Collo extra misura 20$/.test(x)) && nomi.some(x => /^Collo non trasportabile su nastro × 3 60$/.test(x)), nomi);
  assert(nomi.some(x => /^Pallet non sovrapponibile 300$/.test(x)), nomi);
  // carburante su trasporto e supplementi
  const base = r.voci.filter(v => v.carburante).reduce((s, v) => s + v.importo, 0);
  uguale(r.carburante.importo, X.cent(base * 0.2));
});

prova('opzioni: sabato, aree remote (0,50 €/kg, almeno 24 €), batterie, assicurazione (1 %, almeno 11 €)', () => {
  let r = chiedi({ carburante: 10, sabato: true, areeRemote: true, batterie: true, assicurazione: '500' });
  uguale(r.voci.map(v => v.importo), [110, 40, 24, 5, 17.4, 11]);   // carburante su 110 + 40 + 24, non sulle batterie
  uguale([r.trasporto, r.assicurazione, r.totale], [196.4, 11, 207.4]);
  r = chiedi({ areeRemote: true, assicurazione: '2500', colli: [collo(60, 10, 10, 10)] });
  uguale(r.voci.filter(v => /remota|Assicurazione/.test(v.nome)).map(v => v.importo), [30, 25]);
});

prova('limiti del servizio: peso e misure dei colli, pallet, numero di colli', () => {
  uguale(chiedi({ colli: [collo(80, 50, 50, 50)] }).blocchi, ['Riga 1: collo oltre il massimo di 70 kg per DHL Express Worldwide: mettilo su un pallet.']);
  uguale(chiedi({ colli: [collo(10, 130, 50, 50)] }).blocchi, ['Riga 1: collo oltre le misure massime di 120 x 80 x 80 cm per DHL Express Worldwide.']);
  uguale(chiedi({ paese: 2, servizio: '10:30', colli: [collo(30, 50, 50, 50, { pallet: true })] }).blocchi, ['Riga 1: DHL Express 10:30 non accetta pallet.']);
  uguale(chiedi({ paese: 2, servizio: '10:30', colli: [collo(2, 10, 10, 10, { quanti: 11 })] }).blocchi, ['Al massimo 10 colli per spedizione con DHL Express 10:30.']);
  uguale(chiedi({ colli: [] }).blocchi, ['Indica almeno un collo con il suo peso.']);
  uguale(X.calcola(null, {}).blocchi[0], 'Non ci sono ancora tariffe di trasporto: l\'amministratore carica la guida di DHL Express in Gestione.');
});

prova('bolla d\'importazione: quota fino al confine UE e resto fino a destinazione', () => {
  uguale(X.quotaBolla(148.5, 70), { confine: 103.95, destinazione: 44.55 });
  uguale(X.quotaBolla(100, 0), { confine: 0, destinazione: 100 });
});

console.log(n + ' prove superate');
