/* MAGIC HS - illustrazioni a tema: le merci in viaggio per nave, aereo, treno e camion.
   T.scena(classe) restituisce l'SVG della scena (porto, gru, treno merci, camion e aereo); i colori vengono dal
   tema (variabili --d-* in app.css). comune.js la inserisce negli elementi con l'attributo data-scena; con
   data-scena="in-viaggio" i mezzi si muovono (pagina d'attesa), salvo «movimento ridotto» nel sistema. */
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
  var cielo =
    '<path class="d-nuvola" d="M548 44a14 14 0 0 1 26-7 18 18 0 0 1 33 4 11 11 0 0 1 3 22h-58a10 10 0 0 1-4-19z"/>' +
    '<path class="d-nuvola" d="M1040 70a12 12 0 0 1 22-6 16 16 0 0 1 29 4 10 10 0 0 1 2 19h-50a9 9 0 0 1-3-17z"/>' +
    '<path class="d-scia" d="M560 96C650 72 750 60 846 50"/>' +
    '<g class="s-aereo"><g transform="translate(130 0) rotate(-7 770 40)">' +
    '<path class="d-t" d="M712 34h86c10 0 18 3 22 6-4 3-12 6-22 6h-86c-5 0-8-2.6-8-6s3-6 8-6z"/>' +
    '<path class="d-t" d="M748 41h22l-20 26h-12z"/><path class="d-t" d="M752 37h16l-10-15h-10z"/>' +
    '<path class="d-t" d="M706 36h12l-6-17h-9z"/><path class="d-t" d="M705 42h15l-7 10h-7z"/>' +
    '<path class="d-c1" d="M800 35.5c6 .5 12 2.5 15 4.5h-15z"/>' +
    '<circle class="d-oblo" cx="728" cy="39" r="1.6"/><circle class="d-oblo" cx="736" cy="39" r="1.6"/><circle class="d-oblo" cx="744" cy="39" r="1.6"/>' +
    '<circle class="d-oblo" cx="776" cy="39" r="1.6"/><circle class="d-oblo" cx="784" cy="39" r="1.6"/><circle class="d-oblo" cx="792" cy="39" r="1.6"/>' +
    '</g></g>';

  /* mare con la nave portacontainer, banchina con la gru */
  var colonne = [3, 2, 3, 3, 2, 3, 2], colori = [1, 2, 3, 2, 1, 3, 2, 1, 3, 1, 2, 3, 2, 1, 3, 2, 3, 1, 2, 1, 2];
  var stiva = '', c = 0;
  colonne.forEach(function (n, i) {
    for (var r = 0; r < n; r++) stiva += cont(100 + i * 41, 98 - r * 17, 40, 16, colori[c++ % colori.length]);
  });
  var nave =
    '<g class="s-nave">' + stiva +
    '<rect class="d-t" x="54" y="76" width="36" height="38" rx="2"/>' +
    '<rect class="d-oblo" x="59" y="82" width="26" height="5" rx="1.5"/><rect class="d-c1" x="63" y="60" width="13" height="17" rx="1.5"/>' +
    '<path class="d-t" d="M36 113h372l-15 27H58z"/><path class="d-c1" d="M47 128h354l-6 12H58z"/>' +
    '</g>';
  var mare =
    '<rect class="d-mare" x="0" y="138" width="430" height="40"/>' +
    '<path class="d-onda" d="M10 150q10-5 20 0t20 0 20 0 20 0M120 160q10-5 20 0t20 0 20 0M250 152q10-5 20 0t20 0 20 0 20 0M350 163q10-5 20 0t20 0"/>';
  var gru =
    '<g class="d-gru"><path d="M446 140V40M486 140V40M446 76h40M446 108h40M446 76l40 32M446 108l40-32M318 40h196M486 40l-22-18-18 18"/>' +
    '<path class="d-cavo" d="M352 40v6"/></g>' + cont(332, 46, 40, 15, 2) +
    '<rect class="d-banchina" x="430" y="140" width="770" height="40"/><path class="d-suolo" d="M430 140H1200"/>';

  /* binari con il treno merci */
  var traversine = '';
  for (var x = 498; x < 736; x += 14) traversine += '<rect class="d-traversa" x="' + x + '" y="141" width="8" height="5" rx="1"/>';
  var treno =
    traversine + '<path class="d-binario" d="M494 140H740"/>' +
    '<g class="s-treno">' +
    cont(522, 103, 40, 20, 1) + cont(564, 103, 40, 20, 3) + '<rect class="d-t" x="518" y="123" width="90" height="6" rx="2"/>' +
    '<rect class="d-t" x="608" y="124" width="16" height="3"/>' +
    '<g transform="translate(-106 0)">' +
    '<path class="d-t" d="M730 130V104a4 4 0 0 1 4-4h62l22 16v14z"/><path class="d-oblo" d="M796 105h6l10 8h-16z"/>' +
    '<rect class="d-c1" x="734" y="118" width="82" height="4"/><rect class="d-oblo" x="744" y="106" width="12" height="7" rx="1.5"/>' +
    ruota(744, 134, 5) + ruota(762, 134, 5) + ruota(788, 134, 5) + ruota(806, 134, 5) + '</g>' +
    ruota(530, 134, 5) + ruota(546, 134, 5) + ruota(580, 134, 5) + ruota(596, 134, 5) +
    '</g>';

  /* strada con il camion */
  var camion =
    '<path class="d-strada" d="M756 152H1200"/>' +
    cont(1020, 124, 40, 16, 2) + cont(1062, 124, 40, 16, 1) + cont(1104, 124, 40, 16, 3) + cont(1041, 107, 40, 16, 1) + cont(1083, 107, 40, 16, 2) +
    '<g class="s-camion"><g transform="translate(-110 0)">' + cont(904, 95, 116, 28, 1) +
    '<rect class="d-t" x="900" y="123" width="124" height="6" rx="2"/>' +
    '<path class="d-t" d="M1026 131V102a6 6 0 0 1 6-6h20l20 17v18z"/><path class="d-oblo" d="M1036 101h14l13 11h-27z"/>' +
    '<rect class="d-c1" x="1028" y="120" width="44" height="3"/>' +
    ruota(918, 133, 7) + ruota(936, 133, 7) + ruota(1004, 133, 7) + ruota(1040, 133, 7) + ruota(1060, 133, 7) +
    '</g></g>';

  T.scena = function (classe) {
    return '<svg class="scena-svg' + (classe ? ' ' + classe : '') + '" viewBox="0 0 1200 170" preserveAspectRatio="xMidYMax slice" aria-hidden="true" focusable="false">' +
      cielo + mare + gru + nave + treno + camion + '</svg>';
  };
})();
