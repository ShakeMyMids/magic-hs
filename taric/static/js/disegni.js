/* MAGIC HS - illustrazioni a tema: le merci in viaggio per nave, aereo, treno e camion.
   T.scena(classe) restituisce la scena in due composizioni: larga (porto, gru, treno merci, camion, aereo) e compatta
   (nave, gru, camion e aereo) per i riquadri stretti, come il telefono e la pagina d'accesso; app.css ne mostra una sola
   secondo la larghezza del riquadro (container query), così niente viene tagliato. I colori vengono dal tema (variabili
   --d-* in app.css). comune.js la inserisce negli elementi con l'attributo data-scena: data-scena="vivo" anima piano
   nuvole, onde, nave e aereo e fa arrivare i mezzi; "in-viaggio" li fa viaggiare (pagina d'attesa). Con «movimento
   ridotto» nel sistema la scena resta ferma. T.festa() è la scena dell'intelligenza artificiale appena collegata.
   Ogni mezzo sta in un gruppo .t-* che js/porto.js anima quando lo si tocca (sirena e fumo della nave, carico della gru,
   giro dell'aereo, partenza di camion e treno, pioggia dalle nuvole, gabbiano dal mare, l'albero che si scuote); le parti
   nascoste (stelle col tema scuro, luci sulla gru a dicembre, fuochi) le mostra app.css.
   Stagioni e feste (T.oggi di js/calendario.js): nella scena ci sono solo le decorazioni di oggi, vedi «stagioni e feste». */
(function () {
  'use strict';
  var T = window.TARIC = window.TARIC || {};
  var OGGI = T.oggi || { stagione: '', feste: [], ha: function () { return false; } };
  var INVERNO = OGGI.stagione === 'inverno';

  /* ---------------------------------------------------------------- pezzi comuni
     Scala: i container da 20 piedi sulla nave (32 x 13), quelli da 40 sui carri e sul camion, più vicini e quindi più
     grandi. Le forme diritte sono rect (bordi netti, app.css), le curve e le diagonali sono path. */
  function cont(x, y, l, a, n) {           // container: corpo, nervature, porte a un'estremità, luce sul bordo alto
    var h = '<rect class="d-c' + n + '" x="' + x + '" y="' + y + '" width="' + l + '" height="' + a + '" rx="1"/>';
    var passo = a > 18 ? 5 : 4;
    for (var k = x + passo; k < x + l - 4; k += passo) h += '<line class="d-nervo" x1="' + k + '" y1="' + (y + 2) + '" x2="' + k + '" y2="' + (y + a - 2) + '"/>';
    return h + '<rect class="d-porta" x="' + (x + l - 3) + '" y="' + y + '" width="3" height="' + a + '"/><rect class="d-lucido" x="' + x + '" y="' + y + '" width="' + l + '" height="1.5"/>';
  }
  function ruota(x, y, r) {
    return '<circle class="d-t" cx="' + x + '" cy="' + y + '" r="' + r + '"/><circle class="d-mozzo" cx="' + x + '" cy="' + y + '" r="' + (r * 0.42).toFixed(1) + '"/>';
  }
  function carrello(x, y) {                 // carrello ferroviario a due assi
    return '<rect class="d-t" x="' + x + '" y="' + y + '" width="18" height="3" rx="1"/>' + ruota(x + 4, y + 5, 3.2) + ruota(x + 14, y + 5, 3.2);
  }

  /* ---------------------------------------------------------------- cielo: nuvole e aereo cargo con la scia */
  function nuvola(x, y, k) {
    var gocce = '';
    for (var g = 0; g < 5; g++) gocce += '<path class="s-goccia" style="--g:' + g + '" d="M' + (10 + g * 10) + ' 30l-3 8"/>';
    return '<g class="d-nuvola-g t-nuvola"><g transform="translate(' + x + ' ' + y + ') scale(' + k + ')">' + presa(-4, -4, 74, 40) +
      '<g class="s-pioggia">' + gocce + '</g>' +
      '<path class="d-nuvola" d="M6 26a9 9 0 0 1 3-17 12 12 0 0 1 21-5 15 15 0 0 1 26 6 9 9 0 0 1 8 16z"/>' +
      '<path class="d-nuvola-ombra" d="M6 26h58a9 9 0 0 0 2-5c-6 2-14 2-20 0-7 2-16 2-23 0-6 2-13 2-17 0a8 8 0 0 0 0 5z"/></g></g>';
  }
  /* zona invisibile da toccare, per i mezzi fatti di linee sottili (js/porto.js) */
  function presa(x, y, l, a) { return '<rect class="s-presa" x="' + x + '" y="' + y + '" width="' + l + '" height="' + a + '"/>'; }
  /* parti che compaiono solo in certi momenti: stelle (tema scuro), gabbiano, fuochi */
  function stelle(punti) {
    return '<g class="s-stelle">' + punti.map(function (s, n) { return '<circle class="s-stella" style="--n:' + n + '" cx="' + s[0] + '" cy="' + s[1] + '" r="' + (n % 3 ? 1.2 : 1.7) + '"/>'; }).join('') + '</g>';
  }
  function gabbiano(y) { return '<path class="s-gabbiano" d="M0 ' + y + 'q5-6 10-1q5-5 10 1"/>'; }
  function fuochi(centri) {
    return '<g class="s-fuochi">' + centri.map(function (c, n) {
      var raggi = '';
      for (var a = 0; a < 12; a++) {
        var r = a * Math.PI / 6, x1 = c[0] + Math.cos(r) * 9, y1 = c[1] + Math.sin(r) * 9, x2 = c[0] + Math.cos(r) * 28, y2 = c[1] + Math.sin(r) * 28;
        raggi += '<path d="M' + x1.toFixed(1) + ' ' + y1.toFixed(1) + 'L' + x2.toFixed(1) + ' ' + y2.toFixed(1) + '"/>';
      }
      return '<g class="s-fuoco d-c' + (n % 2 ? 2 : 1) + '" style="--n:' + n + '">' + raggi + '</g>';
    }).join('') + '</g>';
  }
  /* ---------------------------------------------------------------- stagioni e feste: solo quelle di oggi
     Inverno: neve sui container, sulla banchina e sui tetti; estate: il sole (di giorno); l'albero della stagione (l'abete a
     Natale); dal cielo cadono petali, foglie, neve o i coriandoli di Carnevale. Le feste nella zona comune alle due
     composizioni (nave, gru, banchina) e nel cielo. Colori nelle variabili --d-* di app.css. */
  function neve(x, y, l) {                  // neve sopra una superficie piana larga l, in cima a y
    return INVERNO ? '<rect class="s-neve" x="' + x + '" y="' + (y - 1.6) + '" width="' + l + '" height="2.6" rx="1.2"/>' : '';
  }
  function sole(x, y) {
    if (OGGI.stagione !== 'estate') return '';
    var raggi = '';
    for (var a = 0; a < 8; a++) {
      var r = a * Math.PI / 4 + Math.PI / 8;
      raggi += 'M' + (x + Math.cos(r) * 14).toFixed(1) + ' ' + (y + Math.sin(r) * 14).toFixed(1) + 'L' + (x + Math.cos(r) * 18.5).toFixed(1) + ' ' + (y + Math.sin(r) * 18.5).toFixed(1);
    }
    return '<g class="s-sole"><path class="s-raggi" d="' + raggi + '"/><circle cx="' + x + '" cy="' + y + '" r="10"/></g>';
  }
  var CADONO = { inverno: 'fiocchi', primavera: 'petali', autunno: 'foglie' };
  function cadono(larghezza) {              // in cima a tutto, partono appena sopra il bordo
    var tipo = OGGI.ha('carnevale') ? 'coriandoli' : CADONO[OGGI.stagione];
    if (!tipo) return '';
    var h = '<g class="s-cadono s-' + tipo + '">', quanti = Math.round(larghezza / 70);
    for (var i = 0; i < quanti; i++) {
      var x = Math.round(((i * 0.618034) % 1) * (larghezza - 24) + 12), forma;
      if (tipo === 'fiocchi') forma = '<circle cx="' + x + '" cy="-6" r="' + (1.3 + (i % 3) * 0.5) + '"/>';
      else if (tipo === 'coriandoli') forma = '<rect class="s-col' + (i % 5) + '" x="' + x + '" y="-8" width="3.4" height="3.4"/>';
      else if (tipo === 'petali') forma = '<path d="M' + x + ' -6q2.6-2.4 5.2 0q-2.6 2.4-5.2 0z"/>';
      else forma = '<path class="s-col' + (i % 2) + '" d="M' + x + ' -6q4-3.4 8 0q-4 3.4-8 0z"/>';
      h += '<g class="s-cade" style="--n:' + i + ';--v:' + ((i * 3) % 5) + '">' + forma + '</g>';
    }
    return h + '</g>';
  }
  /* bandierine appese sotto una fune da (x1, y1) a (x2, y2), dalla frazione da alla frazione a */
  function bandierine(x1, y1, x2, y2, da, a, quante) {
    var h = '', COL = ['d-c1', 's-verde', 'd-c2', 's-giallo', 's-rosso', 's-bianco'];
    for (var i = 0; i < quante; i++) {
      var t0 = da + (a - da) * i / quante, t1 = t0 + (a - da) / quante * 0.72;
      var p = [x1 + (x2 - x1) * t0, y1 + (y2 - y1) * t0, x1 + (x2 - x1) * t1, y1 + (y2 - y1) * t1];
      h += '<path class="' + COL[i % COL.length] + '" d="M' + p[0].toFixed(1) + ' ' + p[1].toFixed(1) + 'L' + p[2].toFixed(1) + ' ' + p[3].toFixed(1) +
        'L' + ((p[0] + p[2]) / 2).toFixed(1) + ' ' + ((p[1] + p[3]) / 2 + 6).toFixed(1) + 'Z"/>';
    }
    return h;
  }
  function cuore(x, y, s) {
    return '<path d="M' + x + ' ' + (y + s * 0.9) + 'C' + (x - s * 1.6) + ' ' + (y - s * 0.1) + ' ' + (x - s * 0.6) + ' ' + (y - s * 1.3) + ' ' + x + ' ' + (y - s * 0.35) +
      'C' + (x + s * 0.6) + ' ' + (y - s * 1.3) + ' ' + (x + s * 1.6) + ' ' + (y - s * 0.1) + ' ' + x + ' ' + (y + s * 0.9) + 'Z"/>';
  }
  function pipistrelli(punti) {
    if (!OGGI.ha('halloween')) return '';
    return '<g class="s-pipistrelli">' + punti.map(function (q, n) {
      var x = q[0], y = q[1];
      return '<path style="--n:' + n + '" d="M' + (x - 9) + ' ' + y + 'Q' + (x - 6) + ' ' + (y - 5) + ' ' + (x - 2) + ' ' + (y - 2) + 'L' + x + ' ' + (y - 4) + 'L' + (x + 2) + ' ' + (y - 2) +
        'Q' + (x + 6) + ' ' + (y - 5) + ' ' + (x + 9) + ' ' + y + 'Q' + (x + 6) + ' ' + (y - 1) + ' ' + (x + 5) + ' ' + (y + 2) + 'Q' + (x + 3) + ' ' + y + ' ' + (x + 1) + ' ' + (y + 2) +
        'L' + x + ' ' + (y + 3) + 'L' + (x - 1) + ' ' + (y + 2) + 'Q' + (x - 3) + ' ' + y + ' ' + (x - 5) + ' ' + (y + 2) + 'Q' + (x - 6) + ' ' + (y - 1) + ' ' + (x - 9) + ' ' + y + 'Z"/>';
    }).join('') + '</g>';
  }
  /* la scia dell'aereo; il 2 giugno sono le Frecce Tricolori */
  function scia(d) {
    if (!OGGI.ha('repubblica')) return '<path class="d-scia" d="' + d + '"/>';
    return '<g class="s-frecce"><path class="s-fondo" d="' + d + '"/><path class="s-verde" transform="translate(0 -3.2)" d="' + d + '"/><path class="s-bianco" d="' + d + '"/>' +
      '<path class="s-rosso" transform="translate(0 3.2)" d="' + d + '"/></g>';
  }

  /* aereo cargo visto di fianco, muso a destra (coordinate proprie: fusoliera lunga 132) */
  function aereo(x, y, k) {
    return '<g class="t-aereo"><g transform="translate(' + x + ' ' + y + ') rotate(-6) scale(' + k + ')">' + presa(-12, -26, 152, 56) + '<g class="s-aereo">' +
      '<path class="d-t" d="M8 3 L-2 -20 H8 Q11 -20 13 -17 L28 3 Z"/><path class="d-c1" d="M1 -17 H8 Q10 -17 11.5 -15 L14 -11 H3.5 Z"/>' +
      '<path class="d-t d-lontano-ala" d="M14 9 L2 17 H10 L26 10 Z"/>' +
      '<path class="d-t" d="M4 10 Q2 3 12 1.6 L104 1 Q124 1 134 8 Q126 13.5 106 13.5 H22 Q10 13.5 4 10 Z"/>' +
      '<path class="d-c1" d="M20 8.6 H122 Q118 9.8 112 10.2 H22 Z"/>' +
      '<path class="d-oblo" d="M114 3.4 H122 Q127 4.6 129.5 7 H114 Z"/>' +
      '<path class="d-porta-a" d="M92 3.5 H101 V10.5 H92 Z"/>' +
      '<path class="d-t" d="M60 10 L40 26 H52 L80 11 Z"/>' +
      '<path class="d-t" d="M44 18 H60 Q65 18 65 21.5 Q65 25 60 25 H44 Q41 21.5 44 18 Z"/><path class="d-c3" d="M60.5 18.6 Q64 19 64 21.5 Q64 24 60.5 24.4 Z"/>' +
      '</g></g></g>';
  }
  var cielo = stelle([[40, 22], [120, 48], [210, 16], [300, 30], [430, 18], [640, 30], [720, 64], [990, 74], [1110, 20], [1170, 54]]) +
    fuochi([[250, 34], [690, 30], [1010, 40]]) + sole(1150, 28) + nuvola(600, 22, 1) + nuvola(1060, 46, 0.86) + nuvola(170, 14, 0.62) +
    pipistrelli([[236, 40], [262, 24], [720, 22]]) + scia('M590 100C680 80 770 62 836 48') + aereo(842, 34, 1) + gabbiano(70);
  var cieloStretto = stelle([[30, 60], [110, 22], [220, 48], [330, 18], [420, 60], [470, 26], [660, 22]]) + fuochi([[200, 32], [450, 26]]) +
    sole(200, 26) + nuvola(18, 12, 0.7) + nuvola(626, 80, 0.5) + pipistrelli([[240, 30], [266, 16]]) +
    scia('M566 70C570 60 574 52 580 44') + aereo(584, 30, 0.72) + gabbiano(80);

  /* ---------------------------------------------------------------- lontano: profilo del porto dietro la banchina */
  function lontano(da, a) {
    var h = '<g class="d-lontano">', x = da, alti = [16, 24, 12, 28, 18, 10, 22, 14], k = 0;
    while (x < a) { var l = 26 + (k * 13) % 30, t = alti[k % alti.length]; h += '<rect x="' + x + '" y="' + (140 - t) + '" width="' + Math.min(l, a - x) + '" height="' + t + '"/>'; x += l + 6; k++; }
    return h + '</g>';
  }


  /* ---------------------------------------------------------------- mare, nave portacontainer, banchina e gru */
  /* nave: plancia e fumaiolo a poppa (sinistra), otto file di container sui boccaporti, prua slanciata a destra.
     Lo scafo scende sotto la linea dell'acqua: lo copre il mare davanti (marePrima). */
  var FILE = [104, 138, 177, 211, 250, 284, 323, 357], ALTE = [3, 3, 2, 3, 2, 3, 1, 2];
  var COLORI = [1, 2, 3, 2, 1, 3, 1, 3, 2, 3, 2, 1, 2, 1, 3, 1, 2, 3, 2, 1, 3];
  var stiva = '', ci = 0;
  [[102, 172], [175, 245], [248, 318], [321, 391]].forEach(function (b) { stiva += '<rect class="d-boccaporto" x="' + b[0] + '" y="101" width="' + (b[1] - b[0]) + '" height="3"/>'; });
  FILE.forEach(function (x, i) {
    for (var r = 0; r < ALTE[i]; r++) stiva += cont(x, 101 - 13 * (r + 1), 32, 13, COLORI[ci++ % COLORI.length]);
    stiva += neve(x, 101 - 13 * ALTE[i], 32);
  });
  var finestre = function (x1, x2, y) { var h = ''; for (var x = x1; x <= x2; x += 7) h += '<rect class="d-oblo" x="' + x + '" y="' + y + '" width="4" height="3"/>'; return h; };
  var nave =
    '<g class="t-nave"><g class="s-nave">' +
    '<g class="s-fumo"><circle cx="56" cy="30" r="3.5"/><circle cx="51" cy="22" r="5"/><circle cx="58" cy="12" r="6.5"/></g>' +
    '<g class="s-sirena"><path d="M88 41q5-5 0-10"/><path d="M93 44q9-8 0-16"/><path d="M98 47q13-12 0-22"/></g>' +
    (OGGI.ha('san-valentino') ? '<g class="s-cuori">' + cuore(57, 27, 3) + cuore(51, 18, 3.6) + cuore(59, 8, 4.2) + '</g>' : '') +
    (OGGI.ha('festa-nazionale') ? '<path class="d-albero" d="M30 104V81"/><rect class="s-verde" x="26" y="82" width="4" height="8"/>' +
      '<rect class="s-bianco" x="22" y="82" width="4" height="8"/><rect class="s-rosso" x="18" y="82" width="4" height="8"/>' : '') +
    stiva +
    '<rect class="d-t" x="40" y="76" width="56" height="28"/>' + finestre(45, 87, 81) + finestre(45, 87, 90) +
    '<rect class="d-t" x="46" y="60" width="44" height="16"/>' + finestre(50, 84, 66) +
    '<rect class="d-t" x="36" y="53" width="64" height="7"/><rect class="d-oblo" x="40" y="55" width="56" height="3"/>' +
    '<rect class="d-t" x="44" y="51" width="48" height="2"/>' + neve(44, 51, 48) +
    '<path class="d-t" d="M47 53L49 34H63L63 53Z"/><path class="d-c1" d="M48.5 39H63V43.5H48Z"/><path class="d-ombra-s" d="M49 34H63V36.5H48.8Z"/>' +
    '<path class="d-albero" d="M84 51V36M79 40h10M398 104V88M394 92h8"/>' +
    '<path class="d-t" d="M384 104L392 96h4v8z"/>' +
    '<path class="d-t" d="M24 104H392Q410 103 418 110L406 148H34Q28 146 26 132Z"/>' +
    '<path class="d-ombra-s" d="M25 121H414L411.4 130H26Z"/>' +
    '<path class="d-c1" d="M25.7 130H411.4L408.6 138H27.6Z"/>' +
    '<path class="d-filo" d="M26 104.6H392Q406 104 413 108"/>' +
    '<circle class="d-ombra-s" cx="402" cy="114" r="2.2"/>' +
    '</g></g>';
  var mareDietro = '<rect class="d-mare" x="0" y="136" width="460" height="34"/>';
  var marePrima =
    '<rect class="d-mare" x="0" y="141" width="460" height="29"/>' +
    '<path class="d-schiuma" d="M38 141H406M406 141q8-3 14 1"/>' +
    '<path class="d-onda" d="M12 151h18M58 158h30M126 149h14M176 160h26M240 152h20M300 162h34M372 150h16M420 158h22"/>';
  var banchina =
    '<rect class="d-banchina" x="460" y="140" width="740" height="30"/><path class="d-suolo" d="M460 140H1200"/>' + neve(460, 140.4, 740) +
    '<rect class="d-muro" x="456" y="140" width="5" height="30"/><rect class="d-t" x="453" y="146" width="4" height="8" rx="1"/><rect class="d-t" x="453" y="158" width="4" height="8" rx="1"/>' +
    '<path class="d-t" d="M463 140v-3a3 3 0 0 1 6 0v3z"/>';
  /* gru di banchina: due gambe con il portale, braccio a traliccio sopra la nave, carrello con la cabina e il container
     agganciato allo spreader; la sala macchine sul retro. s-carico è la parte che cala (js/porto.js, app.css) */
  var reticolo = 'M290 40';
  for (var rx = 290; rx < 470; rx += 12) reticolo += 'L' + (rx + 6) + ' 34L' + (rx + 12) + ' 40';
  var luci = '';
  for (var lx = 296; lx < 470; lx += 16) luci += '<circle class="s-luce d-c' + (lx % 3 ? 1 : 2) + '" style="--n:' + ((lx - 296) / 16) + '" cx="' + lx + '" cy="44" r="2"/>';
  function festeGru() {
    var h = '';
    if (OGGI.ha('festa-nazionale')) h += '<g class="s-pavese">' + bandierine(499, 10, 292, 34, 0.06, 0.74, 15) + bandierine(499, 10, 560, 34, 0.1, 0.86, 5) + '</g>';
    if (OGGI.ha('carnevale')) {
      h += '<g class="s-filanti">' + [[300, 26, 1], [312, 18, 2], [372, 30, 3], [392, 20, 1], [420, 28, 2], [446, 16, 3], [458, 24, 1]].map(function (f) {
        var d = 'M' + f[0] + ' 40', y = 40;
        while (y < 40 + f[1]) { d += 'q3 2.5 0 5t0 5'; y += 10; }
        return '<path class="s-col' + f[2] + '" d="' + d + '"/>';
      }).join('') + '</g>';
    }
    if (OGGI.ha('befana')) h += '<path class="d-albero" d="M552 40V43"/><path class="s-rosso" d="M547 46H556V53Q556 55 558 55.5L561 56.3Q563 57 562.5 59Q562 60.6 559.5 60.2L551 58.6Q547 57.8 547 54Z"/>' +
      '<rect class="s-bianco" x="546" y="43" width="11" height="3.4" rx="1"/>';
    return h;
  }
  var gru =
    '<g class="t-gru">' + presa(276, 6, 290, 134) +
    '<g class="d-gru">' +
    '<path class="g-sottile" d="' + reticolo + '"/>' +
    '<path class="g-forte" d="M476 140V36M522 140V36M476 96H522"/>' +
    '<path class="g-medio" d="M280 34H562M290 40H562M280 34L290 40M476 34L499 10L522 34"/>' +
    '<path class="g-sottile" d="M476 96L522 40M522 96L476 40M499 10L292 34M499 10L560 34"/>' +
    '</g>' +
    '<rect class="d-t" x="466" y="134" width="20" height="6" rx="1.5"/><rect class="d-t" x="512" y="134" width="20" height="6" rx="1.5"/>' +
    '<rect class="d-c1" x="477" y="95" width="44" height="2"/>' +
    '<rect class="d-t" x="528" y="22" width="34" height="12" rx="1"/><rect class="d-c1" x="528" y="29" width="34" height="2"/>' + neve(528, 22, 34) +
    '<g class="s-luci">' + luci + '</g>' + festeGru() +
    '<g class="s-carico"><rect class="d-t" x="330" y="40" width="18" height="4"/><rect class="d-t" x="334" y="44" width="10" height="7"/>' +
      '<rect class="d-oblo" x="336" y="46" width="6" height="3"/>' +
      '<path class="d-cavo" d="M333 44V60M345 44V60"/>' +
      '<g class="s-cont"><rect class="d-t" x="321" y="60" width="36" height="2"/>' + cont(323, 62, 32, 13, 2) + '</g></g>' +
    '</g>';
  function festeBanchina() {               // tra le gambe della gru, comune alle due composizioni
    if (OGGI.ha('pasqua')) {
      return '<g class="s-uova"><ellipse class="d-c1" cx="491" cy="135" rx="3.6" ry="5"/><path class="s-bianco-t" d="M487.6 135H494.4"/>' +
        '<ellipse class="s-giallo" cx="507" cy="135" rx="3.6" ry="5"/><path class="s-bianco-t" d="M503.6 133.4H510.4M503.8 136.6H510.2"/>' +
        '<ellipse class="d-c2" cx="499" cy="134" rx="4.2" ry="6"/><path class="s-bianco-t" d="M495.5 133.5l1.2-1.2 1.2 1.2 1.2-1.2 1.2 1.2 1.2-1.2 1.2 1.2"/></g>';
    }
    if (OGGI.ha('ferragosto')) {
      var spicchi = '', xs = [484, 491.5, 499, 506.5, 514];
      for (var i = 0; i < 4; i++) spicchi += '<path class="' + (i % 2 ? 's-bianco' : 'd-c1') + '" d="M499 101L' + xs[i] + ' 110Q' + ((xs[i] + xs[i + 1]) / 2) + ' 112.4 ' + xs[i + 1] + ' 110Z"/>';
      return '<g class="s-ombrellone"><path class="d-albero" d="M499 140V102"/>' + spicchi + '</g>';
    }
    if (OGGI.ha('halloween')) {
      return '<g class="s-zucca"><path class="s-zucca-c" d="M499 128C491 127 489 131 489.5 134C490 138 494 140 499 140C504 140 508 138 508.5 134C509 131 507 127 499 128Z"/>' +
        '<path class="s-spicchio" d="M495 128.6Q492.5 134 495 139.6M503 128.6Q505.5 134 503 139.6"/><path class="s-gambo" d="M498.4 128.4l.4-3.6h1.8l-.4 3.6z"/>' +
        '<path class="s-lume" d="M493.6 132.6l2.2-2.8 2.2 2.8zM500.2 132.6l2.2-2.8 2.2 2.8zM494 135.2h10.4l-1.6 2.4-1.7-1.1-1.9 1.2-1.9-1.2-1.7 1.1z"/></g>';
    }
    return '';
  }
  /* l'albero della banchina: l'abete con le luci a Natale, altrimenti un albero che cambia con la stagione (fiori in
     primavera, gialli di mimosa l'8 marzo; chioma piena d'estate; foglie gialle e rosse d'autunno; rami spogli e neve
     d'inverno). Si scuote quando lo si tocca (js/porto.js). */
  function albero(x) {
    var h = '';
    if (OGGI.ha('natale')) h = abete(x);
    else if (OGGI.stagione) {
      var s = OGGI.stagione;
      var ramo = function (punti) { return 'M' + punti.map(function (q) { return (x + q[0]) + ' ' + q[1]; }).join('L'); };
      h = '<g class="s-pianta s-' + s + '"><path class="s-tronco" d="M' + x + ' 140V112"/>' +
        '<path class="s-rami" d="' + ramo([[0, 128], [-9, 117], [-15, 109]]) + ramo([[-9, 117], [-11, 107]]) + ramo([[0, 123], [10, 111], [16, 103]]) +
        ramo([[10, 111], [8, 101]]) + ramo([[0, 116], [-4, 104], [-8, 96]]) + ramo([[0, 114], [3, 101], [2, 93]]) + ramo([[-4, 104], [-1, 97]]) + '"/>';
      if (s === 'inverno') {
        h += '<path class="s-neve-r" d="M' + (x - 17) + ' 108.6l3.6 .6M' + (x - 13) + ' 106.2l3.4 .2M' + (x + 14) + ' 102.4l3.6 .4M' + (x + 6.4) + ' 100.4l3.4 .2M' +
          (x - 10) + ' 95.6l3.6 .4M' + (x + 0.4) + ' 92.6l3.4 .2M' + (x - 13) + ' 115.8l3.6 .6M' + (x + 6) + ' 109.8l3.6 .4"/>';
      } else {
        h += '<g class="s-chioma"><circle class="s-f1" cx="' + (x - 8) + '" cy="112" r="9"/><circle class="s-f2" cx="' + (x + 9) + '" cy="109" r="10"/><circle class="s-f3" cx="' + (x + 1) + '" cy="100" r="11"/></g>';
        if (s === 'primavera') {
          var mimosa = OGGI.ha('mimosa'), punti = [[-12, 110], [-5, 115], [-2, 104], [4, 95], [7, 103], [12, 111], [15, 105], [-7, 98], [1, 110]];
          h += '<g class="s-fiori' + (mimosa ? ' s-mimosa' : '') + '">' + punti.map(function (q) {
            return '<circle cx="' + (x + q[0]) + '" cy="' + q[1] + '" r="' + (mimosa ? 2.3 : 1.7) + '"/>';
          }).join('') + '</g>';
        }
      }
      h += '</g>';
    }
    return h ? '<g class="t-albero">' + presa(x - 22, 84, 44, 56) + '<g class="s-scuote">' + h + '</g></g>' : '';
  }
  /* abete con le luci, a Natale */
  function abete(x) {
    return '<g class="s-albero"><path class="s-abete" d="M' + x + ' 96l13 18h-7l11 13h-8l12 13h-42l12-13h-8l11-13h-7z"/>' +
      '<circle class="s-luce d-c1" style="--n:1" cx="' + (x - 4) + '" cy="112" r="1.8"/><circle class="s-luce d-c2" style="--n:3" cx="' + (x + 5) + '" cy="123" r="1.8"/>' +
      '<circle class="s-luce d-c1" style="--n:5" cx="' + (x - 8) + '" cy="135" r="1.8"/><circle class="s-luce d-c2" style="--n:7" cx="' + (x + 10) + '" cy="136" r="1.8"/>' +
      '<path class="s-puntale d-c1" d="M' + x + ' 88l2.2 4.6h4.6l-3.7 3 1.4 4.8-4.5-2.9-4.5 2.9 1.4-4.8-3.7-3h4.6z"/></g>';
  }

  /* ---------------------------------------------------------------- binari con il treno: locomotiva e due carri pianale */
  var traversine = '';
  for (var tx = 574; tx < 800; tx += 10) traversine += '<rect class="d-traversa" x="' + tx + '" y="141" width="6" height="3" rx="1"/>';
  function pianale(x, n) {
    return cont(x + 2, 115, 56, 12, n) + neve(x + 2, 115, 56) + '<rect class="d-t" x="' + x + '" y="127" width="60" height="3"/>' + carrello(x + 2, 130) + carrello(x + 40, 130);
  }
  var treno =
    traversine + '<path class="d-binario" d="M570 140H800"/>' +
    '<g class="t-treno">' + presa(600, 92, 196, 50) + '<g class="s-treno">' +
    '<g class="s-fumo"><circle cx="742" cy="96" r="3"/><circle cx="736" cy="88" r="4.5"/><circle cx="744" cy="79" r="5.5"/></g>' +
    pianale(604, 3) + '<rect class="d-t" x="664" y="127" width="4" height="2"/>' + pianale(668, 1) + '<rect class="d-t" x="728" y="127" width="4" height="2"/>' +
    '<rect class="d-t" x="736" y="100" width="22" height="4" rx="1"/>' + neve(736, 100, 22) +
    '<path class="d-t" d="M731 130V109Q731 104 736 104H778L791 114Q793 116 793 119V130Z"/>' +
    '<path class="d-oblo" d="M778 107.5L788 115H778Z"/><rect class="d-oblo" x="762" y="108" width="11" height="6" rx="1"/>' +
    '<rect class="d-c1" x="731" y="121" width="62" height="3"/><path class="d-filo" d="M734 117H758"/>' +
    carrello(736, 130) + carrello(770, 130) +
    '</g></g>';

  /* ---------------------------------------------------------------- strada con il camion (trattore e semirimorchio) */
  var pila = '';
  [[1036, 127, 2], [1070, 127, 1], [1104, 127, 3], [1053, 114, 1], [1087, 114, 3], [1070, 101, 2]].forEach(function (p) { pila += cont(p[0], p[1], 32, 13, p[2]); });
  [[1036, 127, 17], [1119, 127, 17], [1053, 114, 17], [1102, 114, 17], [1070, 101, 32]].forEach(function (p) { pila += neve(p[0], p[1], p[2]); });
  function camion(x, k) {
    var su = (151 * (1 - k)).toFixed(1);
    return '<g class="t-camion"><g transform="translate(' + x + ' ' + su + ') scale(' + k + ')">' + presa(-4, 96, 160, 58) + '<g class="s-camion">' +
      '<g class="s-fumo"><circle cx="104" cy="96" r="3"/><circle cx="98" cy="88" r="4.5"/><circle cx="106" cy="79" r="5.5"/></g>' +
      cont(0, 110, 100, 24, 1) + neve(0, 110, 100) +
      '<rect class="d-t" x="0" y="134" width="104" height="4"/><rect class="d-t" x="74" y="138" width="3" height="7"/>' +
      ruota(16, 145, 6) + ruota(31, 145, 6) +
      '<rect class="d-t" x="103" y="100" width="3" height="22" rx="1"/>' +
      '<rect class="d-t" x="104" y="135" width="46" height="4"/>' +
      '<path class="d-t" d="M108 136V114Q108 107 115 107H136Q145 107 148 116L150 128V136Z"/>' +
      '<path class="d-oblo" d="M136 110.5Q142 110.5 144 117L145.5 125H136Z"/><rect class="d-oblo" x="118" y="111" width="13" height="9" rx="1.5"/>' +
      '<rect class="d-c1" x="108" y="128" width="42" height="3"/><path class="d-filo" d="M133 110V133"/>' +
      '<rect class="d-t" x="146" y="131" width="6" height="8" rx="1"/><rect class="d-c3" x="125" y="139" width="9" height="4" rx="1"/>' +
      ruota(118, 145, 6) + ruota(141, 145, 6) +
      '</g></g></g>';
  }
  var camionLargo = '<path class="d-strada" d="M800 160H1200"/>' + pila + albero(1176) + camion(846, 1);
  var camionStretto = '<path class="d-strada" d="M530 160H700"/>' + albero(678) + camion(534, 0.78);

  /* festa per l'intelligenza artificiale collegata (js/attiva-ia.js): la gru cala sulla nave un container con le
     scintille, che si illumina; la nave suona la sirena e salpa. Le animazioni sono in app.css (.festa) */
  function stella(x, y, r, classe, stile) {
    return '<path class="' + classe + '"' + (stile ? ' style="' + stile + '"' : '') + ' d="M' + x + ' ' + (y - r) + 'Q' + x + ' ' + y + ' ' + (x + r) + ' ' + y +
      'Q' + x + ' ' + y + ' ' + x + ' ' + (y + r) + 'Q' + x + ' ' + y + ' ' + (x - r) + ' ' + y + 'Q' + x + ' ' + y + ' ' + x + ' ' + (y - r) + 'z"/>';
  }
  T.festa = function () {
    var stiva = '', k = 0, col = [2, 3, 1, 2, 3, 2, 1, 3, 2, 1, 3, 2, 3, 1, 2];
    for (var i = 0; i < 6; i++) {
      for (var r = 0; r < 3; r++) {
        if (r === 2 && (i === 2 || i === 4)) continue;          // la casella 4 in alto è per il container dell'IA
        stiva += cont(152 + i * 46, 138 - r * 20, 44, 18, col[k++ % col.length]);
      }
    }
    var scintille = '';
    [[0, -46], [33, -33], [48, 0], [33, 33], [0, 40], [-33, 33], [-48, 0], [-33, -33]].forEach(function (d, n) {
      scintille += stella(358, 107, n % 2 ? 4 : 6, 'f-scintilla ' + (n % 2 ? 'd-c2' : 'd-c1'), '--dx:' + d[0] + 'px;--dy:' + d[1] + 'px');
    });
    var finestre = function (x1, x2, y) { var h = ''; for (var x = x1; x <= x2; x += 8) h += '<rect class="d-oblo" x="' + x + '" y="' + y + '" width="5" height="3.5"/>'; return h; };
    var reticolo = 'M306 36';
    for (var rx = 306; rx < 494; rx += 14) reticolo += 'L' + (rx + 7) + ' 30L' + (rx + 14) + ' 36';
    return '<svg class="festa-svg" viewBox="0 0 640 220" preserveAspectRatio="xMidYMax slice" aria-hidden="true" focusable="false">' +
      '<path class="d-nuvola" d="M70 40a12 12 0 0 1 22-6 16 16 0 0 1 29 4 10 10 0 0 1 2 19H73a9 9 0 0 1-3-17z"/>' +
      '<path class="d-nuvola" d="M560 70a10 10 0 0 1 19-5 13 13 0 0 1 24 3 8 8 0 0 1 2 16h-42a8 8 0 0 1-3-14z"/>' +
      '<rect class="d-mare" x="0" y="174" width="482" height="46"/>' +
      '<rect class="d-banchina" x="482" y="176" width="158" height="44"/><path class="d-suolo" d="M482 176H640"/><rect class="d-muro" x="478" y="176" width="5" height="44"/>' +
      '<g class="d-gru"><path class="g-sottile" d="' + reticolo + '"/>' +
        '<path class="g-forte" d="M500 176V32M548 176V32M500 124H548"/>' +
        '<path class="g-medio" d="M296 30H628M306 36H628M296 30L306 36M500 30L524 6L548 30"/>' +
        '<path class="g-sottile" d="M500 124L548 38M548 124L500 38M524 6L308 30M524 6L626 30"/></g>' +
      '<rect class="d-t" x="490" y="170" width="20" height="6" rx="1.5"/><rect class="d-t" x="538" y="170" width="20" height="6" rx="1.5"/>' +
      '<rect class="d-c1" x="501" y="123" width="46" height="2"/>' +
      '<rect class="d-t" x="590" y="17" width="38" height="13" rx="1"/><rect class="d-c1" x="590" y="25" width="38" height="2"/>' +
      '<rect class="d-t" x="346" y="36" width="24" height="5"/><rect class="d-t" x="351" y="41" width="14" height="7"/><rect class="d-oblo" x="354" y="43" width="8" height="3"/>' +
      '<path class="f-cavo" d="M358 48V98"/>' +
      '<g class="f-nave">' + stiva +
      '<g class="f-ia">' + cont(336, 98, 44, 18, 1) + stella(358, 107, 6, 'f-stella') + '</g>' +
      '<rect class="d-t" x="104" y="122" width="46" height="34"/>' + finestre(109, 141, 128) + finestre(109, 141, 139) +
      '<rect class="d-t" x="109" y="106" width="36" height="16"/>' + finestre(113, 137, 112) +
      '<rect class="d-t" x="98" y="99" width="58" height="7"/><rect class="d-oblo" x="102" y="101" width="50" height="3"/>' +
      '<path class="d-t" d="M112 99L114 80H128L128 99Z"/><path class="d-c1" d="M113.5 85H128V89.5H113Z"/><path class="d-ombra-s" d="M114 80H128V82.5H113.8Z"/>' +
      '<path class="d-albero" d="M146 99V84M141 88h10M444 156V142M440 146h8"/>' +
      '<g class="f-sirena"><path d="M150 88q7-6 0-13"/><path d="M157 92q11-10 0-21"/><path d="M164 96q15-14 0-29"/></g>' +
      '<path class="d-t" d="M94 156H432Q450 155 458 162L446 198H106Q98 196 96 182Z"/>' +
      '<path class="d-ombra-s" d="M95 172H454L451.6 180H95.5Z"/><path class="d-c1" d="M95.5 180H451.6L449.4 188H97Z"/>' +
      '<path class="d-filo" d="M96 156.6H432Q446 156 453 160"/><circle class="d-ombra-s" cx="444" cy="166" r="2.4"/>' +
      '</g>' +
      '<rect class="d-mare" x="0" y="190" width="482" height="30"/>' +
      '<path class="d-schiuma" d="M100 190H446M446 190q9-3 16 1"/>' +
      '<path class="d-onda" d="M20 202h22M84 210h34M170 200h18M236 212h30M320 203h24M396 211h30"/>' +
      scintille + '</svg>';
  };

  /* vignette per gli elenchi vuoti: T.vignetta('nave' | 'container' | 'gru' | 'faro') */
  var VIGNETTE = {
    nave: '<rect class="d-mare" x="4" y="45" width="124" height="13" rx="3"/>' +
      '<g class="v-dondola">' + cont(41, 26, 14, 10, 1) + cont(56, 26, 14, 10, 2) + cont(71, 26, 14, 10, 3) + cont(86, 26, 14, 10, 1) +
        cont(56, 16, 14, 10, 3) + cont(71, 16, 14, 10, 1) +
        '<rect class="d-t" x="25" y="25" width="13" height="11"/><rect class="d-t" x="22" y="21" width="19" height="4"/><rect class="d-oblo" x="24" y="22.2" width="15" height="1.6"/>' +
        '<path class="d-t" d="M26 21L27 14H32V21Z"/><path class="d-c1" d="M26.6 16H32V18H26.3Z"/>' +
        '<path class="d-t" d="M20 36H98Q106 35.6 110 40L104 50H27Q22 49 21 43Z"/><path class="d-c1" d="M21.4 43H107L105.6 46H22.6Z"/></g>' +
      '<rect class="d-mare" x="4" y="48" width="124" height="10" rx="3"/><path class="d-schiuma" d="M28 48H103M103 48q4-1.5 7 .5"/><path class="d-onda" d="M14 54h10M60 55h16M110 53h8"/>',
    container: '<path class="d-suolo" d="M8 58H124"/>' + cont(30, 30, 56, 26, 1) +
      '<path class="d-t v-anta" d="M86 30l18-8v34l-18 0z"/><path class="v-ombra" d="M32 33h52v4H32z"/>',
    gru: '<path class="d-suolo" d="M8 58H124"/><g class="d-gru v-gru"><path class="g-sottile" d="M34 17L37 14L40 17L43 14L46 17L49 14L52 17L55 14L58 17L61 14L64 17L67 14L70 17L73 14L76 17L79 14L82 17"/>' +
        '<path class="g-forte" d="M84 58V12M102 58V12M84 40H102"/><path class="g-medio" d="M30 14H116M34 17H116M30 14L34 17M84 14L93 4L102 14"/>' +
        '<path class="g-sottile" d="M84 40L102 18M102 40L84 18M93 4L34 14M93 4L114 14"/></g>' +
      '<rect class="d-t" x="104" y="8" width="12" height="6" rx="1"/><rect class="d-t" x="80" y="56" width="8" height="2"/><rect class="d-t" x="98" y="56" width="8" height="2"/>' +
      '<rect class="d-t" x="46" y="17" width="10" height="3"/>' +
      '<g class="v-gancio"><path class="d-cavo-v" d="M49 20v10M53 20v10"/><rect class="d-t" x="42" y="30" width="18" height="1.5"/>' + cont(43, 31.5, 16, 8, 2) + '</g>',
    faro: '<rect class="d-mare" x="4" y="52" width="124" height="8" rx="3"/><path class="d-onda" d="M14 56h10M96 57h14"/>' +
      '<path class="d-t" d="M48 56q6-6 14-4 6-4 14 0 6-1 10 4z"/>' +
      '<path class="d-t" d="M58 56l4-34h12l4 34z"/><rect class="d-c1" x="61" y="34" width="14" height="5"/><rect class="d-c1" x="60" y="46" width="16" height="5"/>' +
      '<rect class="d-oblo" x="63" y="14" width="10" height="8" rx="1"/><path class="d-t" d="M60 14h16l-8-7z"/>' +
      '<path class="v-luce" d="M74 18l40-10v20z"/>'
  };
  T.vignetta = function (nome) {
    var o = OGGI.tema && ORNAMENTI[OGGI.tema] ? '<g class="v-ornamento" transform="translate(112 1) scale(.78)">' + ORNAMENTI[OGGI.tema] + '</g>' : '';
    return '<svg class="vignetta" viewBox="0 0 132 64" aria-hidden="true" focusable="false">' + (VIGNETTE[nome] || '') + o + '</svg>';
  };

  /* ---------------------------------------------------------------- stagioni e feste nel resto dell'app (js/calendario.js)
     T.ornamento(tema): il simbolo della festa o della stagione (24 x 24), per gli auguri e le vignette; T.festone(tema): la
     striscia in cima alla barra (un motivo ripetuto: luci, bandierine, ghiaccioli...); T.accessorio(tema): l'aggiunta al
     logo (cappello di Babbo Natale, bandierina, neve...), nelle coordinate del marchio di js/comune.js (32 x 32). */
  function giro(cx, cy, n, r1, r2, sfasa) {      // raggi da r1 a r2 attorno a un centro
    var d = '';
    for (var a = 0; a < n; a++) {
      var r = a * 2 * Math.PI / n + (sfasa || 0), c = Math.cos(r), s = Math.sin(r);
      d += 'M' + (cx + c * r1).toFixed(1) + ' ' + (cy + s * r1).toFixed(1) + 'L' + (cx + c * r2).toFixed(1) + ' ' + (cy + s * r2).toFixed(1);
    }
    return d;
  }
  function stellina(x, y, r, classe) {           // stella a quattro punte
    return '<path class="' + classe + '" d="M' + x + ' ' + (y - r) + 'Q' + (x + r * 0.18) + ' ' + (y - r * 0.18) + ' ' + (x + r) + ' ' + y + 'Q' + (x + r * 0.18) + ' ' + (y + r * 0.18) + ' ' + x + ' ' + (y + r) +
      'Q' + (x - r * 0.18) + ' ' + (y + r * 0.18) + ' ' + (x - r) + ' ' + y + 'Q' + (x - r * 0.18) + ' ' + (y - r * 0.18) + ' ' + x + ' ' + (y - r) + 'Z"/>';
  }
  function fiore(x, y, r, classe) {
    var h = '';
    for (var a = 0; a < 5; a++) { var g = a * 2 * Math.PI / 5 - Math.PI / 2; h += '<circle class="' + classe + '" cx="' + (x + Math.cos(g) * r).toFixed(1) + '" cy="' + (y + Math.sin(g) * r).toFixed(1) + '" r="' + (r * 0.82).toFixed(1) + '"/>'; }
    return h + '<circle class="s-giallo" cx="' + x + '" cy="' + y + '" r="' + (r * 0.62).toFixed(1) + '"/>';
  }
  function uovo(x, y, k, classe, fascia) {
    return '<path class="' + classe + '" d="M' + x + ' ' + (y - 5 * k) + 'C' + (x + 3.6 * k) + ' ' + (y - 5 * k) + ' ' + (x + 4 * k) + ' ' + (y + 1.6 * k) + ' ' + (x + 3.8 * k) + ' ' + (y + 2.4 * k) +
      'C' + (x + 3.4 * k) + ' ' + (y + 5.4 * k) + ' ' + (x - 3.4 * k) + ' ' + (y + 5.4 * k) + ' ' + (x - 3.8 * k) + ' ' + (y + 2.4 * k) + 'C' + (x - 4 * k) + ' ' + (y + 1.6 * k) + ' ' + (x - 3.6 * k) + ' ' + (y - 5 * k) + ' ' + x + ' ' + (y - 5 * k) + 'Z"/>' +
      (fascia ? '<path class="s-bianco-t" d="M' + (x - 3.6 * k) + ' ' + (y + 0.6 * k) + 'l' + (1.2 * k) + ' ' + (-1.2 * k) + ' ' + (1.2 * k) + ' ' + (1.2 * k) + ' ' + (1.2 * k) + ' ' + (-1.2 * k) + ' ' + (1.2 * k) + ' ' + (1.2 * k) + ' ' + (1.2 * k) + ' ' + (-1.2 * k) + ' ' + (1.2 * k) + ' ' + (1.2 * k) + '"/>' : '');
  }
  function zucca(x, y, k) {
    return '<path class="s-zucca-c" d="M' + x + ' ' + (y - 6 * k) + 'C' + (x - 8 * k) + ' ' + (y - 7 * k) + ' ' + (x - 10 * k) + ' ' + (y - 2 * k) + ' ' + (x - 9.6 * k) + ' ' + (y + 0.6 * k) +
      'C' + (x - 9 * k) + ' ' + (y + 5.4 * k) + ' ' + (x - 4.6 * k) + ' ' + (y + 6.4 * k) + ' ' + x + ' ' + (y + 6.4 * k) + 'C' + (x + 4.6 * k) + ' ' + (y + 6.4 * k) + ' ' + (x + 9 * k) + ' ' + (y + 5.4 * k) + ' ' + (x + 9.6 * k) + ' ' + (y + 0.6 * k) +
      'C' + (x + 10 * k) + ' ' + (y - 2 * k) + ' ' + (x + 8 * k) + ' ' + (y - 7 * k) + ' ' + x + ' ' + (y - 6 * k) + 'Z"/>' +
      '<path class="s-spicchio" d="M' + (x - 4 * k) + ' ' + (y - 5.4 * k) + 'Q' + (x - 6.6 * k) + ' ' + y + ' ' + (x - 4 * k) + ' ' + (y + 6 * k) + 'M' + (x + 4 * k) + ' ' + (y - 5.4 * k) + 'Q' + (x + 6.6 * k) + ' ' + y + ' ' + (x + 4 * k) + ' ' + (y + 6 * k) + '"/>' +
      '<path class="s-gambo" d="M' + (x - 0.8 * k) + ' ' + (y - 5.8 * k) + 'l' + (0.6 * k) + ' ' + (-3.4 * k) + 'h' + (1.8 * k) + 'l' + (-0.4 * k) + ' ' + (3.4 * k) + 'z"/>' +
      '<path class="s-lume" d="M' + (x - 5.4 * k) + ' ' + (y - 0.4 * k) + 'l' + (2 * k) + ' ' + (-2.6 * k) + ' ' + (2 * k) + ' ' + (2.6 * k) + 'zM' + (x + 1.4 * k) + ' ' + (y - 0.4 * k) + 'l' + (2 * k) + ' ' + (-2.6 * k) + ' ' + (2 * k) + ' ' + (2.6 * k) + 'zM' +
      (x - 5 * k) + ' ' + (y + 2 * k) + 'h' + (10 * k) + 'l' + (-1.6 * k) + ' ' + (2.2 * k) + '-' + (1.6 * k) + ' ' + (-1 * k) + '-' + (1.8 * k) + ' ' + (1.1 * k) + '-' + (1.8 * k) + ' ' + (-1.1 * k) + '-' + (1.6 * k) + ' ' + (1 * k) + 'z"/>';
  }
  function pipistrello(x, y, k) {
    var q = function (dx, dy) { return (x + dx * k).toFixed(1) + ' ' + (y + dy * k).toFixed(1); };
    return '<path class="o-pipistrello" d="M' + q(-9, 0) + 'Q' + q(-6, -5) + ' ' + q(-2, -2) + 'L' + q(0, -4) + 'L' + q(2, -2) + 'Q' + q(6, -5) + ' ' + q(9, 0) + 'Q' + q(6, -1) + ' ' + q(5, 2) +
      'Q' + q(3, 0) + ' ' + q(1, 2) + 'L' + q(0, 3) + 'L' + q(-1, 2) + 'Q' + q(-3, 0) + ' ' + q(-5, 2) + 'Q' + q(-6, -1) + ' ' + q(-9, 0) + 'Z"/>';
  }
  var ORNAMENTI = {
    primavera: fiore(12, 12, 4.6, 's-fiore-o'),
    estate: '<path class="o-raggi" d="' + giro(12, 12, 8, 8, 11, Math.PI / 8) + '"/><circle class="s-giallo" cx="12" cy="12" r="5.6"/>',
    autunno: '<path class="s-foglia-o" d="M12 2.5C18 6 19.5 12.5 12 21.5C4.5 12.5 6 6 12 2.5Z"/><path class="o-venatura" d="M12 6.5V22M12 11.5l3-2.4M12 15l-3.2-2.6M12 18.2l2.8-2.2"/>',
    inverno: '<path class="o-fiocco" d="' + giro(12, 12, 6, 0, 9.6, Math.PI / 2) + (function () {
      var d = '';
      for (var a = 0; a < 6; a++) {
        var r = a * Math.PI / 3 + Math.PI / 2, x = 12 + Math.cos(r) * 6.2, y = 12 + Math.sin(r) * 6.2;
        [-1, 1].forEach(function (v) { var g = r + v * Math.PI / 4; d += 'M' + x.toFixed(1) + ' ' + y.toFixed(1) + 'l' + (Math.cos(g) * 3).toFixed(1) + ' ' + (Math.sin(g) * 3).toFixed(1); });
      }
      return d;
    })() + '"/>',
    natale: '<path class="s-abete-o" d="M12 3.4l5.2 6.2h-2.6l4.2 5.2h-2.9l4.6 5.4H3.5l4.6-5.4H5.2l4.2-5.2H6.8z"/><rect class="s-tronco-o" x="10.6" y="20.2" width="2.8" height="2.6"/>' +
      '<circle class="s-rosso" cx="9.6" cy="12.6" r="1.3"/><circle class="d-c2" cx="14.4" cy="16.6" r="1.3"/><circle class="s-giallo" cx="8.6" cy="18" r="1.2"/>' + stellina(12, 3, 2.6, 's-giallo'),
    befana: '<path class="s-rosso" d="M7.6 6h8.4v8q0 1.4 1.2 2.1l2.6 1.4q2 1.1 1.1 3-.9 1.6-2.9 1L10.6 19.4Q7.6 18.4 7.6 15.4z"/><rect class="s-bianco-o" x="6.6" y="2.6" width="10.4" height="4.2" rx="1.6"/>',
    capodanno: '<path class="o-scintille" d="' + giro(12, 12, 8, 5, 10.5) + '"/>' + stellina(12, 12, 4.4, 's-oro'),
    'san-valentino': cuore(12, 12, 6.6).replace('<path ', '<path class="s-cuore-o" '),
    carnevale: '<path class="s-maschera" d="M2.5 8.5Q12 4.5 21.5 8.5Q22 16 15.6 16Q13.4 16 12 13.4Q10.6 16 8.4 16Q2 16 2.5 8.5Z"/>' +
      '<path class="o-occhi" d="M5.6 10.6Q7.6 9 9.8 10.6Q7.6 12.4 5.6 10.6ZM14.2 10.6Q16.4 9 18.4 10.6Q16.4 12.4 14.2 10.6Z"/><circle class="s-giallo" cx="12" cy="7.4" r="1.2"/>' +
      '<path class="o-filante" d="M21 9q2.2 3-.4 5.4t-.2 5.6"/>',
    mimosa: '<path class="o-stelo" d="M5 21C9 15 13 10 19 4M10.2 14.6l-3.4-1.4M13.6 10.6l-1.2-3.6M15.6 8.2l3.8 1"/>' +
      [[17.6, 4.6], [19.8, 7.2], [15.2, 5.6], [12, 6], [13.4, 8.6], [6.4, 12.4], [8.6, 11.4], [20.2, 10.4]].map(function (q) { return '<circle class="s-mimosa-o" cx="' + q[0] + '" cy="' + q[1] + '" r="1.9"/>'; }).join(''),
    pasqua: uovo(12, 12.4, 1.75, 's-uovo-o', true),
    'festa-nazionale': '<circle class="s-rosso" cx="12" cy="12" r="10"/><circle class="s-bianco" cx="12" cy="12" r="6.8"/><circle class="s-verde" cx="12" cy="12" r="3.6"/>',
    halloween: zucca(12, 13.4, 1)
  };
  T.ornamento = function (tema, classe) {
    var o = ORNAMENTI[tema];
    return o ? '<svg class="ornamento' + (classe ? ' ' + classe : '') + '" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' + o + '</svg>' : '';
  };

  /* festone: un riquadro del motivo, largo 60 e alto 20; la corda scende a festoni tra un riquadro e l'altro */
  var CORDA = '<path class="f-corda" d="M0 2Q30 11 60 2"/>';
  function suCorda(x) { var t = x / 60; return 2 * (1 - t) * (1 - t) + 22 * t * (1 - t) + 2 * t * t; }   // altezza della corda in x
  function appesi(xs, fatto) { return xs.map(function (x, n) { return fatto(x, suCorda(x), n); }).join(''); }
  var FESTONI = {
    natale: CORDA + appesi([12, 30, 48], function (x, y, n) {
      return '<rect class="f-attacco" x="' + (x - 1.3) + '" y="' + (y - 0.4) + '" width="2.6" height="2.4" rx=".6"/><ellipse class="f-luce ' + ['s-rosso', 's-oro', 'd-c2'][n] + '" cx="' + x + '" cy="' + (y + 5) + '" rx="2.5" ry="3.4"/>';
    }),
    capodanno: CORDA + appesi([12, 32, 48], function (x, y, n) {
      var giu = [8, 4, 9][n];
      return '<path class="f-filo" d="M' + x + ' ' + y + 'V' + (y + giu) + '"/>' + stellina(x, y + giu + 3, [3.6, 2.6, 3.2][n], n === 1 ? 's-argento' : 's-oro');
    }),
    'san-valentino': CORDA + appesi([12, 30, 48], function (x, y, n) { return cuore(x, y + 4.6, n === 1 ? 2.6 : 3.4).replace('<path ', '<path class="' + (n === 1 ? 's-rosa' : 's-cuore-o') + '" '); }),
    carnevale: '<path class="f-filante s-col1" d="M0 4q7.5-4 15 0t15 0 15 0 15 0"/><path class="f-filante s-col2" d="M0 10q7.5 4 15 0t15 0 15 0 15 0"/>' +
      '<path class="f-filante s-col3" d="M0 15q7.5-3 15 0t15 0 15 0 15 0"/>' +
      [[6, 7, 1], [22, 13, 4], [37, 6, 0], [51, 12, 2], [29, 2, 3]].map(function (c) { return '<rect class="f-coriandolo s-col' + c[2] + '" x="' + c[0] + '" y="' + c[1] + '" width="2.6" height="2.6"/>'; }).join(''),
    mimosa: '<path class="f-stelo" d="M0 5Q15 1 30 5T60 5"/>' + [[8, 7], [22, 6.4], [38, 7], [52, 6.4]].map(function (q, n) {
      return '<ellipse class="s-foglia-v" cx="' + (q[0] + 4) + '" cy="' + (q[1] - 2.6) + '" rx="3" ry="1.3" transform="rotate(-24 ' + (q[0] + 4) + ' ' + (q[1] - 2.6) + ')"/>' +
        '<circle class="s-mimosa-o" cx="' + q[0] + '" cy="' + (q[1] + 3) + '" r="2.1"/><circle class="s-mimosa-o" cx="' + (q[0] - 2.6) + '" cy="' + (q[1] + 6) + '" r="1.8"/><circle class="s-mimosa-o" cx="' + (q[0] + 2) + '" cy="' + (q[1] + 6.6) + '" r="1.7"/>';
    }).join(''),
    pasqua: CORDA + appesi([12, 30, 48], function (x, y, n) { return '<path class="f-filo" d="M' + x + ' ' + y + 'v1.6"/>' + uovo(x, y + 6.4, 0.78, ['s-uovo-o', 's-foglia-v', 's-giallo'][n], n !== 1); }),
    'festa-nazionale': CORDA + appesi([4, 22, 40], function (x, y, n) {
      var y2 = suCorda(x + 13);
      return '<path class="' + ['s-verde', 's-bianco-o', 's-rosso'][n] + '" d="M' + x + ' ' + y.toFixed(1) + 'L' + (x + 13) + ' ' + y2.toFixed(1) + 'L' + (x + 6.5) + ' ' + ((y + y2) / 2 + 9).toFixed(1) + 'Z"/>';
    }),
    halloween: CORDA + appesi([15, 45], function (x, y, n) {
      return n ? '<path class="f-filo" d="M' + x + ' ' + y + 'v2"/>' + zucca(x, y + 7.6, 0.5) : pipistrello(x, y + 4, 0.62);
    }),
    primavera: '<path class="f-stelo" d="M0 7Q15 2 30 7T60 7"/>' + '<ellipse class="s-foglia-v" cx="8" cy="3.6" rx="3.2" ry="1.4" transform="rotate(-28 8 3.6)"/>' +
      '<ellipse class="s-foglia-v" cx="37" cy="10.4" rx="3.2" ry="1.4" transform="rotate(24 37 10.4)"/>' + fiore(20, 6.4, 2.4, 's-fiore-o') + fiore(50, 8, 2.4, 's-fiore-o'),
    estate: CORDA + appesi([5, 20, 35, 49], function (x, y, n) {   // bandiere di segnalazione nautica
      var col = ['d-c2', 's-giallo', 's-rosso', 's-bianco-o'][n];
      return '<rect class="' + col + '" x="' + x + '" y="' + (y + 0.6).toFixed(1) + '" width="8" height="8"/>' +
        (n === 0 ? '<rect class="s-bianco" x="' + (x + 2.6) + '" y="' + (y + 3.2).toFixed(1) + '" width="2.8" height="2.8"/>' : n === 2 ? '<path class="f-croce" d="M' + x + ' ' + (y + 4.6).toFixed(1) + 'h8M' + (x + 4) + ' ' + (y + 0.6).toFixed(1) + 'v8"/>' : n === 3 ? '<rect class="d-c2" x="' + (x + 2) + '" y="' + (y + 2.6).toFixed(1) + '" width="4" height="4"/>' : '');
    }),
    autunno: CORDA + appesi([12, 30, 48], function (x, y, n) {
      return '<path class="' + ['s-foglia-o', 's-foglia-r', 's-foglia-o'][n] + '" transform="rotate(' + [-18, 12, -6][n] + ' ' + x + ' ' + y + ')" d="M' + x + ' ' + y + 'C' + (x + 4) + ' ' + (y + 3) + ' ' + (x + 4.6) + ' ' + (y + 7) + ' ' + x + ' ' + (y + 11) + 'C' + (x - 4.6) + ' ' + (y + 7) + ' ' + (x - 4) + ' ' + (y + 3) + ' ' + x + ' ' + y + 'Z"/>';
    }),
    inverno: '<path class="f-ghiacciolo" d="M0 0H60V2.6Q55 4 50 2.6Q45 4.4 40 2.6Q35 4 30 2.6Q25 4.4 20 2.6Q15 4 10 2.6Q5 4.4 0 2.6Z"/>' +
      [[5, 9], [13, 5], [22, 13], [31, 6.5], [40, 11], [48, 4.5], [55, 8]].map(function (g) { return '<path class="f-ghiacciolo" d="M' + (g[0] - 2.2) + ' 2.6L' + g[0] + ' ' + (2.6 + g[1]) + 'L' + (g[0] + 2.2) + ' 2.6Z"/>'; }).join('')
  };
  FESTONI.befana = FESTONI.natale; FESTONI.ferragosto = FESTONI.estate;
  T.festone = function (tema) {
    var m = FESTONI[tema];
    if (!m) return '';
    return '<svg class="festone-svg" width="100%" height="20" aria-hidden="true" focusable="false"><defs><pattern id="festone-motivo" width="60" height="20" patternUnits="userSpaceOnUse">' +
      m + '</pattern></defs><rect width="100%" height="20" fill="url(#festone-motivo)"/></svg>';
  };

  /* aggiunta al logo (marchio 32 x 32 di js/comune.js, disegnata anche fuori dal riquadro) */
  var ACCESSORI = {
    natale: '<path class="s-rosso" d="M15 5.2Q19 -4.4 28.6 -5.2Q33.6 -5 33.4 1.6L30 5.6Z"/><rect class="s-bianco-o" x="13.6" y="3.4" width="19" height="4.4" rx="2.2" transform="rotate(-6 23 5.6)"/>' +
      '<circle class="s-bianco-o" cx="33.6" cy="2.4" r="2.6"/>',
    capodanno: '<path class="s-oro" d="M21 5.4L27.4 -9L31.8 4.4Z" transform="rotate(14 26 0)"/><path class="f-croce" d="M23.6 -1.4l5 1.6M25.4 -5.4l3.8 1.2" transform="rotate(14 26 0)"/>' +
      '<circle class="s-argento" cx="30.6" cy="-8.2" r="1.8"/>' + stellina(35, 8, 2.6, 's-oro'),
    'san-valentino': '<g class="a-contorno">' + cuore(28.6, 2, 4.6).replace('<path ', '<path class="s-cuore-o" ') + '</g>',
    carnevale: '<path class="s-maschera" d="M21 5.4L27.4 -9L31.8 4.4Z" transform="rotate(14 26 0)"/><circle class="s-giallo" cx="26.6" cy="-1.6" r="1.2"/><circle class="s-col0" cx="28.6" cy="2.4" r="1.1"/>' +
      '<circle class="s-giallo" cx="30.6" cy="-8.2" r="1.9"/>',
    mimosa: '<path class="o-stelo" d="M23 7C26 3 28.6 0 33 -3.4"/>' + [[32.6, -3], [30.6, -4.8], [34.4, -0.6], [29.6, -1], [31.6, 0.8], [27, 1.8]].map(function (q) { return '<circle class="s-mimosa-o" cx="' + q[0] + '" cy="' + q[1] + '" r="1.7"/>'; }).join(''),
    pasqua: '<g class="a-contorno">' + uovo(29, 1.6, 1.05, 's-uovo-o', true) + '</g>',
    'festa-nazionale': '<path class="a-asta" d="M27 9V-9"/><rect class="s-verde" x="27" y="-9" width="3.2" height="6.4"/><rect class="s-bianco-o" x="30.2" y="-9" width="3.2" height="6.4"/><rect class="s-rosso" x="33.4" y="-9" width="3.2" height="6.4"/>',
    halloween: '<path class="s-strega" d="M16.6 5.4Q24 -1 25.6 -8.6Q28 -4 31.6 4.2Z"/><ellipse class="s-strega" cx="24.4" cy="5.2" rx="10.6" ry="2"/><path class="s-zucca-c" d="M19.6 3.2Q24 1.6 30 2.8L30.6 4.2Q24.6 3 19.2 4.6Z"/>',
    primavera: '<g class="a-contorno">' + fiore(29, 2.6, 3, 's-fiore-o') + '</g>',
    estate: '<path class="o-raggi" d="' + giro(29, 2.6, 8, 5.6, 8, Math.PI / 8) + '"/><circle class="s-giallo a-bordo" cx="29" cy="2.6" r="4"/>',
    autunno: '<path class="s-foglia-o a-bordo" transform="rotate(32 29 2)" d="M29 -4.6C33 -2 34 2.6 29 8.6C24 2.6 25 -2 29 -4.6Z"/><path class="o-venatura" transform="rotate(32 29 2)" d="M29 -2V9"/>',
    inverno: '<path class="s-neve-l" d="M.6 7Q.4 .2 8 .2H24Q31.6 .2 31.4 7Q29 4.6 26.2 6.4Q23.4 3.6 20 5.8Q16.6 3.4 13 5.6Q9.6 3.4 6.6 5.8Q3.4 4.2 .6 7Z"/>'
  };
  ACCESSORI.befana = ACCESSORI.natale; ACCESSORI.ferragosto = ACCESSORI.estate;
  T.accessorio = function () { return ACCESSORI[OGGI.tema] || ''; };

  function svg(tipo, classe, larghezza, interno) {
    return '<svg class="scena-svg scena-' + tipo + (classe ? ' ' + classe : '') + '" viewBox="0 0 ' + larghezza + ' 170" preserveAspectRatio="xMidYMax meet" aria-hidden="true" focusable="false">' +
      interno + '</svg>';
  }
  T.scena = function (classe) {
    return svg('larga', classe, 1200, cielo + lontano(600, 1000) + lontano(1150, 1200) + mareDietro + banchina + nave + marePrima + gru + festeBanchina() +
        treno + camionLargo + cadono(1200)) +
      svg('stretta', classe, 700, cieloStretto + lontano(580, 700) + mareDietro + banchina + nave + marePrima + gru + festeBanchina() + camionStretto + cadono(700));
  };
})();
