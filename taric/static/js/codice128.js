/* MAGIC HS - codice a barre Code 128 (ISO/IEC 15417) per l'MRN nel prospetto di sintesi H1 della bolla (js/bolla.js).
   Set B per tutto il testo (caratteri ASCII da 32 a 127): l'MRN ha lettere e cifre. Ogni simbolo è fatto di 3 barre e 3
   spazi, larghi da 1 a 4 moduli, 11 moduli in tutto; il carattere di controllo è la somma pesata modulo 103; lo stop ha 13
   moduli. Nella pagina window.TARIC_CODICE128, in node modulo (si prova con node tests/prova_codice128.js). */
(function (radice) {
  'use strict';
  // larghezze (barra, spazio, barra, spazio, barra, spazio) dei valori da 0 a 105; 106 è lo stop (7 elementi)
  var SIMBOLI = ('212222 222122 222221 121223 121322 131222 122213 122312 132212 221213 221312 231212 112232 122132 122231 113222 ' +
    '123122 123221 223211 221132 221231 213212 223112 312131 311222 321122 321221 312212 322112 322211 212123 212321 232121 111323 ' +
    '131123 131321 112313 132113 132311 211313 231113 231311 112133 112331 132131 113123 113321 133121 313121 211331 231131 213113 ' +
    '213311 213131 311123 311321 331121 312113 312311 332111 314111 221411 431111 111224 111422 121124 121421 141122 141221 112214 ' +
    '112412 122114 122411 142112 142211 241211 221114 413111 241112 134111 111242 121142 121241 114212 124112 124211 411212 421112 ' +
    '421211 212141 214121 412121 111143 111341 131141 114113 114311 411113 411311 113141 114131 311141 411131 211412 211214 211232 ' +
    '2331112').split(' ');
  var START_B = 104, STOP = 106;

  /* valori dei simboli: start B, un valore per carattere, controllo, stop; null se il testo ha caratteri fuori dal set B */
  function valori(testo) {
    var v = [START_B], somma = START_B;
    for (var i = 0; i < testo.length; i++) {
      var c = testo.charCodeAt(i);
      if (c < 32 || c > 127) return null;
      v.push(c - 32); somma += (c - 32) * (i + 1);
    }
    v.push(somma % 103, STOP);
    return v;
  }
  /* larghezze in moduli, alternando barra e spazio a partire da una barra (senza zone di rispetto) */
  function moduli(testo) {
    var v = valori(String(testo));
    if (!v) return null;
    return v.map(function (x) { return SIMBOLI[x]; }).join('').split('').map(Number);
  }
  /* il disegno SVG: barre del colore del testo (currentColor), zone di rispetto di 10 moduli ai lati */
  function svg(testo, altezza) {
    var m = moduli(testo);
    if (!m) return '';
    var h = altezza || 40, x = 10, barre = '';
    m.forEach(function (w, k) { if (k % 2 === 0) barre += '<rect x="' + x + '" y="0" width="' + w + '" height="' + h + '"/>'; x += w; });
    return '<svg class="codice128" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + (x + 10) + ' ' + h + '" preserveAspectRatio="none" ' +
      'shape-rendering="crispEdges" fill="currentColor" role="img" aria-label="Codice a barre ' + String(testo).replace(/[<>&"]/g, '') + '">' + barre + '</svg>';
  }

  var C128 = { valori: valori, moduli: moduli, svg: svg };
  if (typeof module !== 'undefined' && module.exports) module.exports = C128;
  else radice.TARIC_CODICE128 = C128;
})(this);
