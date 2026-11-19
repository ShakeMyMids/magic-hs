/* MAGIC HS - stagioni e feste per la scena del porto.
   T.calendario(data) dice la stagione (per mesi interi: primavera da marzo, estate da giugno, autunno da settembre,
   inverno da dicembre) e le feste di quel giorno, con le date italiane (Pasqua calcolata ogni anno). All'apertura della
   pagina T.oggi tiene quelle di oggi e le loro classi vanno su <html>: js/disegni.js disegna solo le decorazioni di oggi,
   app.css usa le classi per i colori del cielo e per le parti nascoste (luci sulla gru, fuochi).
   Si prova con node: tests/prova_calendario.js. */
(function () {
  'use strict';

  /* domenica di Pasqua (calendario gregoriano, algoritmo di Meeus, Jones e Butcher) */
  function pasqua(anno) {
    var a = anno % 19, b = Math.floor(anno / 100), c = anno % 100, d = Math.floor(b / 4), e = b % 4,
      f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30,
      i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451),
      n = h + l - 7 * m + 114;
    return new Date(anno, Math.floor(n / 31) - 1, (n % 31) + 1);
  }
  /* giorni di calendario da a a b (senza le ore, anche al cambio dell'ora legale) */
  function giorni(a, b) {
    return Math.round((Date.UTC(b.getFullYear(), b.getMonth(), b.getDate()) - Date.UTC(a.getFullYear(), a.getMonth(), a.getDate())) / 864e5);
  }
  var STAGIONI = ['inverno', 'inverno', 'primavera', 'primavera', 'primavera', 'estate', 'estate', 'estate', 'autunno', 'autunno', 'autunno', 'inverno'];
  var FESTE = {                                    // a data fissa, mese * 100 + giorno
    'capodanno': function (md) { return md >= 1231 || md <= 102; },
    'natale': function (md) { return md >= 1201 || md <= 106; },          // fino all'Epifania
    'befana': function (md) { return md === 106; },
    'san-valentino': function (md) { return md === 214; },
    'mimosa': function (md) { return md === 308; },                       // festa della donna
    'festa-nazionale': function (md) { return md === 425 || md === 501 || md === 602; },
    'repubblica': function (md) { return md === 602; },
    'ferragosto': function (md) { return md === 815; },
    'halloween': function (md) { return md === 1031; }
  };

  function calendario(data) {
    data = data || new Date();
    var md = (data.getMonth() + 1) * 100 + data.getDate();
    var dopoPasqua = giorni(pasqua(data.getFullYear()), data);
    var feste = Object.keys(FESTE).filter(function (f) { return FESTE[f](md); });
    if (dopoPasqua >= -52 && dopoPasqua <= -47) feste.push('carnevale');  // dal giovedì grasso al martedì grasso
    if (dopoPasqua === 0 || dopoPasqua === 1) feste.push('pasqua');      // Pasqua e Pasquetta
    return { stagione: STAGIONI[data.getMonth()], feste: feste };
  }

  if (typeof module !== 'undefined' && module.exports) module.exports = { calendario: calendario, pasqua: pasqua };
  if (typeof window === 'undefined') return;
  var T = window.TARIC = window.TARIC || {};
  T.calendario = calendario;
  T.oggi = calendario();
  T.oggi.ha = function (festa) { return T.oggi.feste.indexOf(festa) >= 0; };
  var radice = document.documentElement;
  radice.classList.add(T.oggi.stagione);
  T.oggi.feste.forEach(function (f) { radice.classList.add(f); });
})();
