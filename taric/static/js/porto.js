/* MAGIC HS - il porto da toccare: piccole sorprese sopra la scena di js/disegni.js, in tutte le pagine che la mostrano.
   - Toccando i mezzi: la nave suona la sirena e sbuffa, la gru appoggia il container sulla nave, l'aereo fa un giro,
     il camion parte e torna, il treno fa manovra, le nuvole piovono, dal mare si alza un gabbiano; l'albero si scuote e
     dal cielo cade quello della stagione (petali, foglie, neve, coriandoli a Carnevale).
   - Tre tocchi veloci sulla gru aprono il gioco «Carica la nave» (js/gioco.js).
   - Parole scritte fuori dai campi: «gioca» apre il gioco, «nave» fa suonare le navi, «festa» accende i fuochi,
     «magic» fa salpare il logo; cinque tocchi sul logo fanno lo stesso.
   - Stagioni e feste: js/calendario.js (classi su <html>) e js/disegni.js.
   Ogni gesto aggiunge una classe per la durata dell'animazione (in app.css) e poi la toglie: alla fine tutto è dov'era.
   Con «movimento ridotto» le animazioni durano un istante. */
(function () {
  'use strict';
  var T = window.TARIC = window.TARIC || {};

  /* aggiunge la classe per la durata dell'animazione; un secondo tocco nel frattempo non la riavvia */
  function anima(el, classe, ms) {
    if (!el || el.classList.contains(classe)) return;
    el.classList.add(classe);
    setTimeout(function () { el.classList.remove(classe); }, ms);
  }
  function scenaVisibile() {
    return Array.prototype.filter.call(document.querySelectorAll('.scena-svg'), function (s) { return s.getBoundingClientRect().width > 0; })[0] || null;
  }
  T.porto = {
    sirena: function () { Array.prototype.forEach.call(document.querySelectorAll('.t-nave'), function (n) { anima(n, 'suona', 1900); }); },
    fuochi: function () { var s = scenaVisibile(); if (s) anima(s, 'fuochi', 2800); },
    salpa: function () { var m = document.querySelector('.logo .marchio'); if (m) anima(m, 'salpa', 2600); }
  };

  var tocchiGru = [];
  var GESTI = { 't-nave': ['suona', 1900], 't-gru': ['cala', 2900], 't-aereo': ['gira', 1900], 't-camion': ['parte', 3500],
    't-treno': ['fischia', 2100], 't-nuvola': ['piove', 2400], 't-albero': ['scuote', 1300] };
  document.addEventListener('click', function (ev) {
    var svg = ev.target.closest ? ev.target.closest('.scena-svg') : null;
    if (svg) {
      var t = ev.target.closest('.t-nave,.t-gru,.t-aereo,.t-camion,.t-treno,.t-nuvola,.t-albero');
      if (t) {
        var nome = Object.keys(GESTI).filter(function (k) { return t.classList.contains(k); })[0];
        anima(t, GESTI[nome][0], GESTI[nome][1]);
        if (nome === 't-albero') anima(svg, 'scrolla', 10000);
        if (nome === 't-gru') {
          var ora = Date.now();
          tocchiGru = tocchiGru.filter(function (x) { return ora - x < 1600; }).concat(ora);
          if (tocchiGru.length >= 3 && T.gioco) { tocchiGru = []; T.gioco(); }
        }
      } else if (ev.target.classList.contains('d-mare') || ev.target.classList.contains('d-onda')) anima(svg, 'gabbiano', 4300);
      return;
    }
    if (ev.target.closest && ev.target.closest('[data-gioca]') && T.gioco) { T.gioco(); return; }   // «mentre aspetti»
    var logo = ev.target.closest ? ev.target.closest('.logo') : null;
    if (logo) {
      var adesso = Date.now();
      logo._tocchi = (logo._tocchi || []).filter(function (x) { return adesso - x < 2500; }).concat(adesso);
      if (logo._tocchi.length >= 5) { logo._tocchi = []; T.porto.salpa(); }
    }
  });

  // parole scritte fuori dai campi
  var scritto = '';
  var PAROLE = { gioca: function () { if (T.gioco) T.gioco(); }, nave: T.porto.sirena, festa: T.porto.fuochi, magic: T.porto.salpa };
  document.addEventListener('keydown', function (ev) {
    var t = ev.target;
    if (ev.ctrlKey || ev.metaKey || ev.altKey || !ev.key || ev.key.length !== 1) return;
    if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
    if (document.querySelector('.velo')) return;                          // c'è una finestra aperta (anche il gioco)
    scritto = (scritto + ev.key.toLowerCase()).slice(-8);
    Object.keys(PAROLE).forEach(function (p) {
      if (scritto.slice(-p.length) === p) { scritto = ''; PAROLE[p](); }
    });
  });

  // per chi apre gli strumenti per sviluppatori
  try {
    console.log('%c⚓ MAGIC HS %c Dietro le quinte c\'è un porto: tocca i mezzi della scena, o scrivi «gioca» fuori dai campi.',
      'background:#1b5584;color:#fff;font-weight:700;padding:3px 8px;border-radius:6px', 'color:#e9772e');
  } catch (e) { /* niente console */ }
})();
