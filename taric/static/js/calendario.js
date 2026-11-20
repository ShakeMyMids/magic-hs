/* MAGIC HS - stagioni e feste in tutta l'applicazione.
   T.calendario(data) dice la stagione (per mesi interi: primavera da marzo, estate da giugno, autunno da settembre,
   inverno da dicembre), le feste di quel giorno con le date italiane (Pasqua calcolata ogni anno), il tema (la festa più
   importante, altrimenti la stagione) e gli auguri. All'apertura della pagina T.oggi tiene quelli di oggi e le classi vanno
   su <html> (lo script sta nell'<head>, così i colori sono giusti dal primo disegno): la stagione, le feste, con-tema e
   tema-<nome>. app.css ne prende i colori di tutta l'app e le decorazioni (festone, motivo dello sfondo, neve sulle
   schede); js/disegni.js disegna nella scena solo le decorazioni di oggi.
   Spento dal profilo (localStorage magic-hs.stagioni = "no"); l'anteprima di un altro giorno (sessionStorage
   magic-hs.prova-giorno) vale finché resta aperta la scheda del browser. Si prova con node: tests/prova_calendario.js.
   Per lo stesso motivo qui va su <html> anche il tema chiaro o scuro scelto con il pulsante in alto (T.tema di comune.js). */
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
  /* il tema dei colori: la prima festa di questo elenco, altrimenti la stagione (Ferragosto è l'estate); le feste di un
     giorno vengono prima del Carnevale, che dura sei giorni (San Valentino o l'8 marzo possono cadere nel Carnevale) */
  var TEMI = ['capodanno', 'natale', 'san-valentino', 'mimosa', 'carnevale', 'pasqua', 'festa-nazionale', 'halloween'];
  var AUGURI = { 425: 'Buona festa della Liberazione!', 501: 'Buon primo maggio!', 602: 'Buona festa della Repubblica!' };

  function calendario(data) {
    data = data || new Date();
    var md = (data.getMonth() + 1) * 100 + data.getDate();
    var dopoPasqua = giorni(pasqua(data.getFullYear()), data);
    var feste = Object.keys(FESTE).filter(function (f) { return FESTE[f](md); });
    if (dopoPasqua >= -52 && dopoPasqua <= -47) feste.push('carnevale');  // dal giovedì grasso al martedì grasso
    if (dopoPasqua === 0 || dopoPasqua === 1) feste.push('pasqua');      // Pasqua e Pasquetta
    var ha = function (f) { return feste.indexOf(f) >= 0; };
    var stagione = STAGIONI[data.getMonth()];
    var tema = TEMI.filter(ha)[0] || stagione;
    var auguri = ha('capodanno') ? 'Buon anno!' : ha('befana') ? 'Buona Befana!' :
      ha('natale') ? (md >= 1224 && md <= 1226 ? 'Buon Natale!' : 'Buone feste!') :
      ha('san-valentino') ? 'Buon San Valentino!' : ha('mimosa') ? 'Buona festa della donna!' : ha('carnevale') ? 'Buon Carnevale!' :
      ha('pasqua') ? (dopoPasqua === 0 ? 'Buona Pasqua!' : 'Buona Pasquetta!') : ha('festa-nazionale') ? AUGURI[md] :
      ha('ferragosto') ? 'Buon Ferragosto!' : ha('halloween') ? 'Dolcetto o scherzetto?' : '';
    return { stagione: stagione, feste: feste, tema: tema, auguri: auguri };
  }

  /* giorni da provare nell'anteprima del profilo: [valore, nome, data AAAA-MM-GG] nell'anno indicato */
  function prove(anno) {
    var iso = function (d) { return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); };
    var p = pasqua(anno), martedi = new Date(anno, p.getMonth(), p.getDate() - 47);
    return [['primavera', 'Primavera', anno + '-05-20'], ['estate', 'Estate', anno + '-07-10'], ['autunno', 'Autunno', anno + '-10-15'],
      ['inverno', 'Inverno', anno + '-01-20'], ['capodanno', 'Capodanno', anno + '-01-01'], ['befana', 'Befana', anno + '-01-06'],
      ['san-valentino', 'San Valentino', anno + '-02-14'], ['carnevale', 'Carnevale', iso(martedi)], ['mimosa', 'Festa della donna', anno + '-03-08'],
      ['pasqua', 'Pasqua', iso(p)], ['liberazione', '25 aprile', anno + '-04-25'], ['lavoro', '1° maggio', anno + '-05-01'],
      ['repubblica', '2 giugno', anno + '-06-02'], ['ferragosto', 'Ferragosto', anno + '-08-15'], ['halloween', 'Halloween', anno + '-10-31'],
      ['natale', 'Natale', anno + '-12-25']];
  }

  if (typeof module !== 'undefined' && module.exports) module.exports = { calendario: calendario, pasqua: pasqua, prove: prove };
  if (typeof window === 'undefined') return;
  var T = window.TARIC = window.TARIC || {};
  T.calendario = calendario;
  T.prove = prove;

  var spento = false, prova = '';
  try { spento = localStorage.getItem('magic-hs.stagioni') === 'no'; prova = sessionStorage.getItem('magic-hs.prova-giorno') || ''; } catch (e) { /* niente archivio */ }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(prova) || spento) prova = '';
  T.oggi = spento ? { stagione: '', feste: [], tema: '', auguri: '' }
    : calendario(prova ? new Date(+prova.slice(0, 4), +prova.slice(5, 7) - 1, +prova.slice(8, 10), 12) : new Date());
  T.oggi.spento = spento;
  T.oggi.prova = prova;
  T.oggi.ha = function (festa) { return T.oggi.feste.indexOf(festa) >= 0; };
  /* interruttore e anteprima del profilo: valgono dalla pagina ricaricata */
  T.stagioni = function (accese) {
    try { if (accese) localStorage.removeItem('magic-hs.stagioni'); else localStorage.setItem('magic-hs.stagioni', 'no'); } catch (e) { /* niente archivio */ }
    location.reload();
  };
  T.provaGiorno = function (giorno) {
    try { if (giorno) sessionStorage.setItem('magic-hs.prova-giorno', giorno); else sessionStorage.removeItem('magic-hs.prova-giorno'); } catch (e) { /* niente archivio */ }
    location.reload();
  };

  /* tema scelto: localStorage magic-hs.tema (taric2.tema nelle versioni precedenti), applicato prima del primo disegno */
  var radice = document.documentElement;
  try { T.temaSalvato = localStorage.getItem('magic-hs.tema') || localStorage.getItem('taric2.tema') || 'auto'; } catch (e) { T.temaSalvato = 'auto'; }
  if (T.temaSalvato === 'chiaro' || T.temaSalvato === 'scuro') radice.setAttribute('data-theme', T.temaSalvato === 'scuro' ? 'dark' : 'light');

  if (!T.oggi.tema) return;
  [T.oggi.stagione, 'con-tema', 'tema-' + T.oggi.tema].concat(T.oggi.feste).forEach(function (c) { radice.classList.add(c); });
})();
