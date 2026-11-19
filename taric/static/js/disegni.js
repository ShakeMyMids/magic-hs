/* MAGIC HS - illustrazioni a tema: le merci in viaggio per nave, aereo, treno e camion.
   T.scena(classe) restituisce la scena in due composizioni: larga (porto, gru, treno merci, camion, aereo) e compatta
   (nave, gru, camion e aereo) per i riquadri stretti, come il telefono e la pagina d'accesso; app.css ne mostra una sola
   secondo la larghezza del riquadro (container query), così niente viene tagliato. I colori vengono dal tema (variabili
   --d-* in app.css). comune.js la inserisce negli elementi con l'attributo data-scena: data-scena="vivo" anima piano
   nuvole, onde, nave e aereo e fa arrivare i mezzi; "in-viaggio" li fa viaggiare (pagina d'attesa). Con «movimento
   ridotto» nel sistema la scena resta ferma. T.festa() è la scena dell'intelligenza artificiale appena collegata.
   Ogni mezzo sta in un gruppo .t-* che js/porto.js anima quando lo si tocca (sirena e fumo della nave, carico della gru,
   giro dell'aereo, partenza di camion e treno, pioggia dalle nuvole, gabbiano dal mare); le parti nascoste (stelle col tema
   scuro, albero e luci a dicembre, fuochi a Capodanno) le mostra app.css. */
(function () {
  'use strict';
  var T = window.TARIC = window.TARIC || {};

  function cont(x, y, l, a, n) {           // container con le nervature verticali
    var h = '<rect class="d-c' + n + '" x="' + x + '" y="' + y + '" width="' + l + '" height="' + a + '" rx="1.5"/>';
    for (var k = x + 6; k < x + l - 3; k += 6) h += '<line class="d-nervo" x1="' + k + '" y1="' + (y + 3) + '" x2="' + k + '" y2="' + (y + a - 3) + '"/>';
    return h;
  }
  function ruota(x, y, r) {
    return '<circle class="d-t" cx="' + x + '" cy="' + y + '" r="' + r + '"/><circle class="d-mozzo" cx="' + x + '" cy="' + y + '" r="' + (r * 0.38) + '"/>';
  }

  /* cielo: nuvole e aereo con la scia */
  function nuvola(x, y, k) {
    var gocce = '';
    for (var g = 0; g < 5; g++) gocce += '<path class="s-goccia" style="--g:' + g + '" d="M' + (8 + g * 11) + ' 46l-3 8"/>';
    return '<g class="d-nuvola-g t-nuvola"><g transform="translate(' + x + ' ' + y + ') scale(' + k + ')">' + presa(-4, -4, 70, 44) +
      '<g class="s-pioggia">' + gocce + '</g><path class="d-nuvola" d="M0 18a14 14 0 0 1 26-7 18 18 0 0 1 33 4 11 11 0 0 1 3 22H4a10 10 0 0 1-4-19z"/></g></g>';
  }
  /* zona invisibile da toccare, per i mezzi fatti di linee sottili (js/porto.js) */
  function presa(x, y, l, a) { return '<rect class="s-presa" x="' + x + '" y="' + y + '" width="' + l + '" height="' + a + '"/>'; }
  /* parti che compaiono solo in certi momenti: stelle (tema scuro), gabbiano, fuochi */
  function stelle(punti) {
    return '<g class="s-stelle">' + punti.map(function (s, n) { return '<circle class="s-stella" style="--n:' + n + '" cx="' + s[0] + '" cy="' + s[1] + '" r="' + (n % 3 ? 1.3 : 1.9) + '"/>'; }).join('') + '</g>';
  }
  function gabbiano(y) { return '<path class="s-gabbiano" d="M0 ' + y + 'q6-7 12 0q6-7 12 0"/>'; }
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
  var aereo =
    '<g class="t-aereo">' + presa(826, 4, 136, 72) + '<g class="s-aereo"><g transform="translate(130 0) rotate(-7 770 40)">' +
    '<path class="d-t" d="M712 34h86c10 0 18 3 22 6-4 3-12 6-22 6h-86c-5 0-8-2.6-8-6s3-6 8-6z"/>' +
    '<path class="d-t" d="M748 41h22l-20 26h-12z"/><path class="d-t" d="M752 37h16l-10-15h-10z"/>' +
    '<path class="d-t" d="M706 36h12l-6-17h-9z"/><path class="d-t" d="M705 42h15l-7 10h-7z"/>' +
    '<path class="d-c1" d="M800 35.5c6 .5 12 2.5 15 4.5h-15z"/>' +
    '<circle class="d-oblo" cx="728" cy="39" r="1.6"/><circle class="d-oblo" cx="736" cy="39" r="1.6"/><circle class="d-oblo" cx="744" cy="39" r="1.6"/>' +
    '<circle class="d-oblo" cx="776" cy="39" r="1.6"/><circle class="d-oblo" cx="784" cy="39" r="1.6"/><circle class="d-oblo" cx="792" cy="39" r="1.6"/>' +
    '</g></g></g>';
  var cielo = stelle([[40, 22], [120, 48], [210, 16], [300, 40], [430, 24], [640, 30], [700, 70], [960, 26], [1110, 20], [1170, 64]]) +
    fuochi([[260, 40], [690, 34], [1010, 44]]) + nuvola(548, 26, 1) + nuvola(1040, 52, 0.86) + '<path class="d-scia" d="M560 96C650 72 750 60 846 50"/>' + aereo + gabbiano(70);
  var cieloStretto = stelle([[30, 60], [110, 22], [220, 48], [330, 18], [420, 60], [470, 26], [660, 22]]) + fuochi([[200, 36], [450, 30]]) +
    nuvola(24, 14, 0.72) + nuvola(604, 64, 0.6) + '<path class="d-scia" d="M524 58C540 50 552 42 566 34"/>' +
    '<g transform="translate(-270 -12)">' + aereo + '</g>' + gabbiano(80);

  /* mare con la nave portacontainer, banchina con la gru */
  var colonne = [3, 2, 3, 3, 2, 3, 2], colori = [1, 2, 3, 2, 1, 3, 2, 1, 3, 1, 2, 3, 2, 1, 3, 2, 3, 1, 2, 1, 2];
  var stiva = '', c = 0;
  colonne.forEach(function (n, i) {
    for (var r = 0; r < n; r++) stiva += cont(100 + i * 41, 98 - r * 17, 40, 16, colori[c++ % colori.length]);
  });
  var nave =
    '<g class="t-nave"><g class="s-nave">' + stiva +
    '<g class="s-fumo"><circle cx="70" cy="52" r="4"/><circle cx="64" cy="44" r="5.5"/><circle cx="72" cy="35" r="7"/></g>' +
    '<g class="s-sirena"><path d="M80 58q6-6 0-12"/><path d="M86 62q11-10 0-20"/><path d="M92 66q16-14 0-28"/></g>' +
    '<rect class="d-t" x="54" y="76" width="36" height="38" rx="2"/>' +
    '<rect class="d-oblo" x="59" y="82" width="26" height="5" rx="1.5"/><rect class="d-c1" x="63" y="60" width="13" height="17" rx="1.5"/>' +
    '<path class="d-t" d="M36 113h372l-15 27H58z"/><path class="d-c1" d="M47 128h354l-6 12H58z"/>' +
    '</g></g>';
  var mare =
    '<rect class="d-mare" x="0" y="138" width="430" height="40"/>' +
    '<path class="d-onda" d="M10 150q10-5 20 0t20 0 20 0 20 0M120 160q10-5 20 0t20 0 20 0M250 152q10-5 20 0t20 0 20 0 20 0M350 163q10-5 20 0t20 0"/>';
  var luci = '';
  for (var lx = 326; lx < 512; lx += 16) luci += '<circle class="s-luce d-c' + (lx % 3 ? 1 : 2) + '" style="--n:' + ((lx - 326) / 16) + '" cx="' + lx + '" cy="45" r="2.2"/>';
  var gru =
    '<g class="t-gru">' + presa(316, 16, 200, 124) + '<g class="d-gru"><path d="M446 140V40M486 140V40M446 76h40M446 108h40M446 76l40 32M446 108l40-32M318 40h196M486 40l-22-18-18 18"/></g>' +
    '<g class="s-luci">' + luci + '</g>' +
    '<g class="s-carico"><path class="d-cavo" d="M352 40v6"/><g class="s-cont">' + cont(332, 46, 40, 15, 2) + '</g></g></g>' +
    '<rect class="d-banchina" x="430" y="140" width="770" height="40"/><path class="d-suolo" d="M430 140H1200"/>';
  /* abete con le luci, a dicembre */
  function albero(x) {
    return '<g class="s-albero"><path class="s-abete" d="M' + x + ' 92l15 22h-8l12 14h-9l13 12h-46l13-12h-9l12-14h-8z"/>' +
      '<circle class="s-luce d-c1" style="--n:1" cx="' + (x - 5) + '" cy="110" r="2"/><circle class="s-luce d-c2" style="--n:3" cx="' + (x + 6) + '" cy="122" r="2"/>' +
      '<circle class="s-luce d-c1" style="--n:5" cx="' + (x - 9) + '" cy="133" r="2"/><circle class="s-luce d-c2" style="--n:7" cx="' + (x + 11) + '" cy="135" r="2"/>' +
      '<path class="s-puntale d-c1" d="M' + x + ' 84l2.4 5h5l-4 3.4 1.6 5.2-5-3.2-5 3.2 1.6-5.2-4-3.4h5z"/></g>';
  }

  /* binari con il treno merci */
  var traversine = '';
  for (var x = 498; x < 736; x += 14) traversine += '<rect class="d-traversa" x="' + x + '" y="141" width="8" height="5" rx="1"/>';
  var treno =
    traversine + '<path class="d-binario" d="M494 140H740"/>' +
    '<g class="t-treno">' + presa(514, 70, 216, 70) + '<g class="s-treno">' +
    cont(522, 103, 40, 20, 1) + cont(564, 103, 40, 20, 3) + '<rect class="d-t" x="518" y="123" width="90" height="6" rx="2"/>' +
    '<rect class="d-t" x="608" y="124" width="16" height="3"/>' +
    '<g transform="translate(-106 0)">' +
    '<g class="s-fumo"><circle cx="740" cy="92" r="3.5"/><circle cx="734" cy="84" r="5"/><circle cx="742" cy="75" r="6"/></g>' +
    '<path class="d-t" d="M730 130V104a4 4 0 0 1 4-4h62l22 16v14z"/><path class="d-oblo" d="M796 105h6l10 8h-16z"/>' +
    '<rect class="d-c1" x="734" y="118" width="82" height="4"/><rect class="d-oblo" x="744" y="106" width="12" height="7" rx="1.5"/>' +
    ruota(744, 134, 5) + ruota(762, 134, 5) + ruota(788, 134, 5) + ruota(806, 134, 5) + '</g>' +
    ruota(530, 134, 5) + ruota(546, 134, 5) + ruota(580, 134, 5) + ruota(596, 134, 5) +
    '</g></g>';

  /* strada con il camion */
  var pila = cont(1020, 124, 40, 16, 2) + cont(1062, 124, 40, 16, 1) + cont(1104, 124, 40, 16, 3) + cont(1041, 107, 40, 16, 1) + cont(1083, 107, 40, 16, 2);
  var mezzo =
    '<g class="t-camion">' + presa(784, 90, 186, 52) + '<g class="s-camion"><g transform="translate(-110 0)">' + cont(904, 95, 116, 28, 1) +
    '<rect class="d-t" x="900" y="123" width="124" height="6" rx="2"/>' +
    '<path class="d-t" d="M1026 131V102a6 6 0 0 1 6-6h20l20 17v18z"/><path class="d-oblo" d="M1036 101h14l13 11h-27z"/>' +
    '<rect class="d-c1" x="1028" y="120" width="44" height="3"/>' +
    ruota(918, 133, 7) + ruota(936, 133, 7) + ruota(1004, 133, 7) + ruota(1040, 133, 7) + ruota(1060, 133, 7) +
    '<g class="s-fumo"><circle cx="890" cy="124" r="3"/><circle cx="882" cy="119" r="4.5"/><circle cx="872" cy="112" r="5.5"/></g>' +
    '</g></g></g>';
  var camion = '<path class="d-strada" d="M756 152H1200"/>' + pila + albero(1172) + mezzo;
  var camionStretto = '<path class="d-strada" d="M500 152H700"/>' + albero(684) + '<g transform="translate(-284 0)">' + mezzo + '</g>';

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
    var onde = '';
    for (var x = 20; x < 470; x += 64) onde += 'M' + x + ' ' + (190 + (x % 3) * 6) + 'q10-5 20 0t20 0';
    return '<svg class="festa-svg" viewBox="0 0 640 220" preserveAspectRatio="xMidYMax slice" aria-hidden="true" focusable="false">' +
      '<path class="d-nuvola" d="M70 40a12 12 0 0 1 22-6 16 16 0 0 1 29 4 10 10 0 0 1 2 19H73a9 9 0 0 1-3-17z"/>' +
      '<path class="d-nuvola" d="M560 70a10 10 0 0 1 19-5 13 13 0 0 1 24 3 8 8 0 0 1 2 16h-42a8 8 0 0 1-3-14z"/>' +
      '<rect class="d-mare" x="0" y="176" width="480" height="44"/><path class="d-onda" d="' + onde + '"/>' +
      '<rect class="d-banchina" x="470" y="176" width="170" height="44"/><path class="d-suolo" d="M470 176H640"/>' +
      '<g class="d-gru"><path d="M500 176V36M548 176V36M500 80h48M500 120h48M500 80l48 40M500 120l48-40M296 36h330M548 36l-24-20-24 20"/></g>' +
      '<rect class="d-t" x="346" y="33" width="24" height="8" rx="2"/>' +
      '<path class="f-cavo" d="M358 41V98"/>' +
      '<g class="f-nave">' + stiva +
      '<g class="f-ia">' + cont(336, 98, 44, 18, 1) + stella(358, 107, 6, 'f-stella') + '</g>' +
      '<rect class="d-t" x="110" y="112" width="36" height="44" rx="2"/><rect class="d-oblo" x="115" y="118" width="26" height="5" rx="1.5"/>' +
      '<rect class="d-c1" x="119" y="94" width="13" height="19" rx="1.5"/>' +
      '<g class="f-sirena"><path d="M138 88q7-6 0-13"/><path d="M145 92q11-10 0-21"/><path d="M152 96q15-14 0-29"/></g>' +
      '<path class="d-t" d="M96 156h356l-16 30H116z"/><path class="d-c1" d="M106 172h336l-6 14H116z"/>' +
      '</g>' + scintille + '</svg>';
  };

  /* vignette per gli elenchi vuoti: T.vignetta('nave' | 'container' | 'gru' | 'faro') */
  var VIGNETTE = {
    nave: '<path class="d-onda" d="M6 52q8-4 16 0t16 0 16 0M84 56q8-4 16 0t16 0"/>' +
      '<g class="v-dondola"><path class="d-t" d="M30 38h68l-8 12H38z"/>' + cont(46, 26, 18, 11, 1) + cont(66, 26, 18, 11, 2) +
      '<rect class="d-t" x="36" y="22" width="9" height="16" rx="1.5"/><rect class="d-c1" x="38" y="14" width="5" height="8" rx="1"/></g>',
    container: '<path class="d-suolo" d="M8 58H124"/>' + cont(30, 30, 56, 26, 1) +
      '<path class="d-t v-anta" d="M86 30l18-8v34l-18 0z"/><path class="v-ombra" d="M32 33h52v4H32z"/>',
    gru: '<path class="d-suolo" d="M8 58H124"/><g class="d-gru v-gru"><path d="M86 58V14M100 58V14M86 30h14M86 44h14M86 30l14 14M86 44l14-14M40 14h72"/></g>' +
      '<g class="v-gancio"><path class="d-cavo-v" d="M54 14v14"/><path class="d-cavo-v" d="M50 28h8l-4 6z"/></g>',
    faro: '<path class="d-onda" d="M6 56q8-4 16 0t16 0M90 58q8-4 16 0t16 0"/>' +
      '<path class="d-t" d="M58 56l4-34h12l4 34z"/><rect class="d-c1" x="61" y="34" width="14" height="5"/><rect class="d-c1" x="60" y="46" width="16" height="5"/>' +
      '<rect class="d-oblo" x="63" y="14" width="10" height="8" rx="1"/><path class="d-t" d="M60 14h16l-8-7z"/>' +
      '<path class="v-luce" d="M74 18l40-10v20z"/>'
  };
  T.vignetta = function (nome) {
    return '<svg class="vignetta" viewBox="0 0 132 64" aria-hidden="true" focusable="false">' + (VIGNETTE[nome] || '') + '</svg>';
  };

  function svg(tipo, classe, larghezza, interno) {
    return '<svg class="scena-svg scena-' + tipo + (classe ? ' ' + classe : '') + '" viewBox="0 0 ' + larghezza + ' 170" preserveAspectRatio="xMidYMax meet" aria-hidden="true" focusable="false">' +
      interno + '</svg>';
  }
  T.scena = function (classe) {
    return svg('larga', classe, 1200, cielo + mare + gru + nave + treno + camion) +
      svg('stretta', classe, 700, cieloStretto + mare + gru + nave + camionStretto);
  };
})();
