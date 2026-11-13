/* MAGIC HS - collegamento sul desktop o icona sul telefono: il sito si installa come un'app (manifest.webmanifest e
   /sw.js). Con Chrome, Edge e i browser Android il tasto apre la finestra d'installazione del browser; altrove
   (iPhone e iPad, Safari sul Mac, Firefox) mostra i passi da fare. Gli elementi con data-installa aprono l'installazione
   e restano nascosti quando MAGIC HS è già aperto come app. */
(function () {
  'use strict';
  var T = window.TARIC;
  var richiesta = null;                       // evento beforeinstallprompt, quando il browser sa installare da solo

  T.installata = function () {
    try { if (window.matchMedia('(display-mode: standalone)').matches || window.matchMedia('(display-mode: window-controls-overlay)').matches) return true; }
    catch (e) { /* browser senza display-mode */ }
    return window.navigator.standalone === true;
  };

  function mostra() {
    var si = !T.installata();
    Array.prototype.forEach.call(document.querySelectorAll('[data-installa]'), function (el) { el.hidden = !si; });
  }

  /* dove si trova chi apre la pagina, per dare i passi giusti */
  function dispositivo() {
    var ua = navigator.userAgent || '';
    if (/iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) return 'ios';
    if (/Android/.test(ua)) return 'android';
    if (/Edg\//.test(ua)) return 'edge';
    if (/Firefox\//.test(ua)) return 'firefox';
    if (/Safari\//.test(ua) && !/Chrome|Chromium|CriOS/.test(ua)) return 'safari';
    return 'chrome';
  }
  var PASSI = {
    ios: ['Tocca <b>Condividi</b> ' + T.icona('condividi') + ' (in basso sull\'iPhone, in alto sull\'iPad).',
          'Scegli <b>Aggiungi alla schermata Home</b>: se non la vedi, scorri l\'elenco.',
          'Tocca <b>Aggiungi</b>: l\'icona di MAGIC HS compare tra le app.'],
    android: ['Apri il menu del browser <b>⋮</b> in alto a destra.',
              'Scegli <b>Installa app</b> oppure <b>Aggiungi a schermata Home</b>.',
              'Conferma: l\'icona di MAGIC HS compare tra le app.'],
    chrome: ['Apri il menu <b>⋮</b> in alto a destra di Chrome.',
             'Scegli <b>Trasmetti, salva e condividi</b> › <b>Installa pagina come app</b> (oppure premi l\'icona d\'installazione a destra nella barra degli indirizzi).',
             'Conferma con <b>Installa</b>: MAGIC HS si apre in una sua finestra e lo trovi tra i programmi del computer.'],
    edge: ['Apri il menu <b>…</b> in alto a destra di Edge.',
           'Scegli <b>App</b> › <b>Installa questo sito come app</b>.',
           'Conferma con <b>Installa</b> e spunta <b>Crea collegamento sul desktop</b>.'],
    safari: ['Nel menu <b>File</b> di Safari scegli <b>Aggiungi al Dock</b>.',
             'Conferma con <b>Aggiungi</b>: MAGIC HS compare nel Dock e tra le applicazioni.'],
    firefox: ['Trascina il <b>lucchetto</b> a sinistra dell\'indirizzo sul desktop: diventa un collegamento a MAGIC HS.',
              'Per averlo come app, con la sua finestra, apri MAGIC HS con Chrome o Edge e premi di nuovo <b>Installa</b>.']
  };

  function istruzioni(dove) {
    var telefono = dove === 'ios' || dove === 'android';
    var w = T.finestra('<div class="lab" id="installa-titolo">' + T.icona('installa') + (telefono ? 'Icona sul telefono' : 'Collegamento sul desktop') +
      '<span class="dx"><button class="tasto-ico" type="button" data-f="chiudi" aria-label="Chiudi">' + T.icona('chiudi') + '</button></span></div>' +
      '<ol class="passi">' + PASSI[dove].map(function (p) { return '<li>' + p + '</li>'; }).join('') + '</ol>' +
      '<p class="nota">MAGIC HS si apre come un\'app, con la sua icona; l\'accesso resta lo stesso.</p>' +
      '<div class="fila"><button class="btn pri" type="button" data-f="chiudi">Ho capito</button></div>', 'installa-titolo', 'installa');
    var b = w.el.querySelector('.btn.pri'); if (b) b.focus();
  }

  T.installa = function () {
    if (!richiesta) { istruzioni(dispositivo()); return; }
    var r = richiesta; richiesta = null;            // la finestra del browser si può aprire una volta sola
    r.prompt();
    r.userChoice.then(function (scelta) {
      if (scelta && scelta.outcome === 'accepted') T.avviso('MAGIC HS è installato: lo trovi tra le app del dispositivo.');
    }, function () { /* niente */ });
  };

  window.addEventListener('beforeinstallprompt', function (ev) { ev.preventDefault(); richiesta = ev; mostra(); });
  window.addEventListener('appinstalled', function () { richiesta = null; mostra(); });
  document.addEventListener('click', function (ev) {
    var b = ev.target.closest && ev.target.closest('[data-installa]');
    if (b) { ev.preventDefault(); T.installa(); }
  });
  try { window.matchMedia('(display-mode: standalone)').addEventListener('change', mostra); } catch (e) { /* browser vecchio */ }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mostra); else mostra();

  /* service worker minimo (/sw.js): serve all'installazione e, senza rete, mostra un avviso invece dell'errore del browser */
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () { navigator.serviceWorker.register('/sw.js').catch(function () { /* senza: si usa nel browser */ }); });
  }
  T.mostraInstalla = mostra;
  T.dispositivo = dispositivo;
})();
