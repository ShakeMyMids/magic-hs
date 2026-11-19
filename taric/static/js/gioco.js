/* MAGIC HS - «Carica la nave», un gioco per la pausa caffè (T.gioco(), da js/porto.js: tre tocchi sulla gru della scena
   o «gioca» scritto fuori dai campi). La gru scorre sul braccio con un container: si sgancia (tocco, clic, spazio o Invio)
   e deve cadere sul posto indicato della nave. Preso: un punto, due se è proprio al centro; mancato: finisce in mare e
   si perde un container di riserva (sono tre). Ogni dieci container la nave salpa (cinque punti in più) e ne arriva
   un'altra; la gru accelera un poco a ogni carico. Il record resta nel dispositivo (localStorage). Disegno in SVG con i
   colori del tema (--d-* di app.css); le posizioni sono in pixel interi, così i bordi restano netti. */
(function () {
  'use strict';
  var T = window.TARIC = window.TARIC || {};
  function esc(s) { return T.esc ? T.esc(s) : String(s); }          // comune.js arriva dopo
  var L = 600, A = 320;                           // spazio del disegno
  var POSTI = 8, LP = 50, X0 = 100;               // posti sulla nave: larghezza e inizio
  var LC = 44, HC = 22;                           // container
  var PONTE = 236, BRACCIO = 34, APPESO = 64;     // altezza del ponte, del braccio della gru e del container appeso
  var PER_NAVE = 10, RISERVA = 3, TOLLERANZA = 16, CENTRO = 4;
  var CHIAVE = 'magic-hs.gioco';

  function record() { try { return parseInt(localStorage.getItem(CHIAVE), 10) || 0; } catch (e) { return 0; } }
  function salvaRecord(n) { try { localStorage.setItem(CHIAVE, String(n)); } catch (e) { /* niente archivio */ } }
  function cont(x, y, n, classe) {
    var h = '<g class="' + (classe || '') + '" transform="translate(' + x + ' ' + y + ')"><rect class="d-c' + n + '" width="' + LC + '" height="' + HC + '" rx="2"/>';
    for (var k = 6; k < LC - 3; k += 6) h += '<line class="d-nervo" x1="' + k + '" y1="4" x2="' + k + '" y2="' + (HC - 4) + '"/>';
    return h + '</g>';
  }
  function centroPosto(i) { return X0 + i * LP + LP / 2; }

  T.gioco = function () {
    if (document.querySelector('.finestra.gioco')) return;
    var f = T.finestra(
      '<div class="lab">' + T.icona('container') + '<span id="gioco-titolo">Carica la nave</span><span class="dx">' +
        '<button class="tasto-ico" type="button" data-f="chiudi" aria-label="Chiudi il gioco">' + T.icona('chiudi') + '</button></span></div>' +
      '<div class="g-conti"><span>Punti <b data-g="punti">0</b></span><span>Record <b data-g="record">' + record() + '</b></span>' +
        '<span class="g-riserva" data-g="riserva" aria-label="Container di riserva: ' + RISERVA + '"></span></div>' +
      '<div class="g-campo" data-g="campo"><svg class="g-svg" viewBox="0 0 ' + L + ' ' + A + '" aria-hidden="true" focusable="false">' +
        '<rect class="g-cielo" width="' + L + '" height="' + A + '"/>' +
        '<path class="d-nuvola" d="M470 64a12 12 0 0 1 22-6 16 16 0 0 1 29 4 10 10 0 0 1 2 19h-50a9 9 0 0 1-3-17z"/>' +
        '<g class="d-gru"><path d="M10 ' + BRACCIO + 'H590M24 ' + BRACCIO + 'V' + (BRACCIO - 14) + 'M576 ' + BRACCIO + 'V' + (BRACCIO - 14) + '"/></g>' +
        '<g data-g="nave"></g>' +
        '<g data-g="bersaglio" class="g-bersaglio"></g>' +
        '<g data-g="carrello"><rect class="d-t" x="-16" y="' + (BRACCIO - 6) + '" width="32" height="12" rx="3"/>' +
          '<path class="g-cavo" data-g="cavo" d="M0 ' + (BRACCIO + 6) + 'V' + APPESO + '"/><g data-g="appeso"></g></g>' +
        '<g data-g="cade"></g><g data-g="spruzzi"></g>' +
        '<rect class="d-mare" y="270" width="' + L + '" height="50"/>' +
        '<path class="d-onda" d="M20 286q10-5 20 0t20 0M150 296q10-5 20 0t20 0 20 0M330 284q10-5 20 0t20 0M480 298q10-5 20 0t20 0"/>' +
      '</svg><div class="g-scritta" data-g="scritta" aria-hidden="true"></div>' +
      '<div class="g-velo" data-g="velo"><p class="g-titolo">Carica la nave</p><p>Sgancia il container sul posto indicato: tocca, clicca o premi spazio.</p>' +
        '<button class="btn pri" type="button" data-g="via">' + T.icona('container') + 'Inizia</button></div></div>' +
      '<div class="fila"><button class="btn" type="button" data-g="sgancia" disabled>' + T.icona('giu') + 'Sgancia</button>' +
        '<span class="nota" data-g="annuncio" aria-live="polite"></span></div>', 'gioco-titolo', 'gioco');
    var el = f.el, $ = function (k) { return el.querySelector('[data-g="' + k + '"]'); };
    var s = null, raf = 0, prima = 0;

    function nuovaNave() {
      s.pile = []; for (var i = 0; i < POSTI; i++) s.pile.push([]);
      s.caricati = 0; s.naveX = 0; s.salpa = 0; s.arriva = 1;
      disegnaNave(); nuovoBersaglio();
    }
    function disegnaNave() {
      var h = '<g data-g="scafo"><path class="d-t" d="M70 ' + PONTE + 'H530l-24 34H96z"/><path class="d-c1" d="M84 ' + (PONTE + 18) + 'H520l-12 16H96z"/>' +
        '<rect class="d-t" x="44" y="' + (PONTE - 50) + '" width="46" height="50" rx="3"/><rect class="d-oblo" x="51" y="' + (PONTE - 42) + '" width="32" height="7" rx="2"/>' +
        '<rect class="d-c1" x="57" y="' + (PONTE - 72) + '" width="16" height="22" rx="2"/>';
      s.pile.forEach(function (p, i) { p.forEach(function (c, r) { h += cont(centroPosto(i) - LC / 2, PONTE - HC * (r + 1), c); }); });
      $('nave').innerHTML = h + '</g>';
    }
    function nuovoBersaglio() {
      var liberi = [];
      s.pile.forEach(function (p, i) { if (p.length < 3 && i !== s.bersaglio) liberi.push(i); });
      if (!liberi.length) s.pile.forEach(function (p, i) { if (p.length < 3) liberi.push(i); });
      s.bersaglio = liberi[Math.floor(Math.random() * liberi.length)];
      var x = centroPosto(s.bersaglio), y = PONTE - HC * (s.pile[s.bersaglio].length + 1);
      $('bersaglio').innerHTML = '<rect class="g-posto" x="' + (x - LC / 2 - 2) + '" y="' + (y - 2) + '" width="' + (LC + 4) + '" height="' + (HC + 4) + '" rx="3"/>' +
        '<path class="g-freccia" d="M' + (x - 8) + ' ' + (y - 22) + 'h16l-8 10z"/>';
      s.colore = 1 + Math.floor(Math.random() * 3);
    }
    function riserva() {
      var r = $('riserva');
      r.innerHTML = Array.apply(null, Array(RISERVA)).map(function (_, k) { return '<i class="' + (k < s.riserva ? 'si' : 'no') + '"></i>'; }).join('');
      r.setAttribute('aria-label', 'Container di riserva: ' + s.riserva);
    }
    function scritta(testo, classe) {
      var w = $('scritta');
      w.textContent = testo; w.className = 'g-scritta ' + (classe || '');
      void w.offsetWidth; w.classList.add('vai');
    }
    function annuncia(t) { $('annuncio').textContent = t; }
    function inizia() {
      s = { punti: 0, riserva: RISERVA, x: 40, verso: 1, velocita: 150, cade: null, fine: false };
      nuovaNave(); riserva();
      $('punti').textContent = '0'; $('velo').hidden = true; $('sgancia').disabled = false; annuncia('');
      prima = 0; cancelAnimationFrame(raf); raf = requestAnimationFrame(passo);
      $('campo').focus({ preventScroll: true });
    }
    function sgancia() {
      if (!s || s.fine || s.cade || s.salpa || s.arriva) return;
      s.cade = { x: Math.round(s.x), y: APPESO, v: 0, colore: s.colore };
      $('cavo').setAttribute('d', 'M0 ' + (BRACCIO + 6) + 'V' + (BRACCIO + 14));
    }
    function preso(perfetto) {
      var p = s.pile[s.bersaglio];
      p.push(s.cade.colore);
      s.cade = null; $('cade').innerHTML = '';
      s.punti += perfetto ? 2 : 1; s.caricati += 1;
      s.velocita = Math.min(430, s.velocita * 1.06);
      scritta(perfetto ? 'Al centro! +2' : '+1', perfetto ? 'oro' : '');
      annuncia('Caricato. Punti ' + s.punti + '.');
      if (s.caricati >= PER_NAVE) { s.punti += 5; s.salpa = 1; $('bersaglio').innerHTML = ''; scritta('Nave piena: salpa! +5', 'oro'); annuncia('Nave piena, cinque punti in più. Punti ' + s.punti + '.'); }
      else { disegnaNave(); nuovoBersaglio(); }
      $('punti').textContent = s.punti;
    }
    function inMare() {
      var x = s.cade.x;
      s.cade = null; $('cade').innerHTML = '';
      $('spruzzi').innerHTML = '<g class="g-spruzzo" transform="translate(' + x + ' 272)"><circle r="5" cx="-14" cy="-6"/><circle r="7" cy="-12"/><circle r="5" cx="14" cy="-6"/></g>';
      s.riserva -= 1; riserva();
      if (s.riserva <= 0) finisci();
      else { scritta('Splash!'); annuncia('In mare. Riserva ' + s.riserva + '.'); }
    }
    function finisci() {
      s.fine = true; $('sgancia').disabled = true;
      var r = record(), nuovo = s.punti > r;
      if (nuovo) { salvaRecord(s.punti); $('record').textContent = s.punti; }
      $('velo').innerHTML = '<p class="g-titolo">' + (nuovo ? 'Nuovo record!' : 'Fine turno') + '</p><p><b>' + s.punti + '</b> ' + (s.punti === 1 ? 'punto' : 'punti') +
        (nuovo ? '' : ' · record ' + esc(r)) + '</p><button class="btn pri" type="button" data-g="via">' + T.icona('aggiorna') + 'Gioca ancora</button>';
      $('velo').hidden = false;
      annuncia('Fine turno: ' + s.punti + ' punti' + (nuovo ? ', nuovo record.' : '.'));
      setTimeout(function () { var b = $('via'); if (b) b.focus(); }, 30);
    }
    function passo(t) {
      if (!document.contains(el)) return;
      var dt = prima ? Math.min(0.05, (t - prima) / 1000) : 0; prima = t;
      if (!s.fine) {
        // nave che salpa e nave che arriva
        if (s.salpa) {
          s.naveX += 260 * dt;
          if (s.naveX > L) { nuovaNave(); s.naveX = -L; s.arriva = 1; }
        } else if (s.arriva) {
          s.naveX = s.naveX < 0 ? Math.min(0, s.naveX + 420 * dt) : 0;
          if (s.naveX === 0) s.arriva = 0;
        }
        var nx = Math.round(s.naveX);
        $('nave').setAttribute('transform', 'translate(' + nx + ' 0)');
        $('bersaglio').setAttribute('transform', 'translate(' + nx + ' 0)');
        // gru
        s.x += s.verso * s.velocita * dt;
        if (s.x > L - 34) { s.x = L - 34; s.verso = -1; } else if (s.x < 34) { s.x = 34; s.verso = 1; }
        $('carrello').setAttribute('transform', 'translate(' + Math.round(s.x) + ' 0)');
        if (!s.cade) $('cavo').setAttribute('d', 'M0 ' + (BRACCIO + 6) + 'V' + APPESO);
        var chiave = s.cade || s.salpa || s.arriva ? 0 : s.colore;            // il container appeso si ridisegna solo se cambia
        if (chiave !== s.appeso) { s.appeso = chiave; $('appeso').innerHTML = chiave ? cont(-LC / 2, APPESO, chiave) : ''; }
        // container che cade
        if (s.cade) {
          s.cade.v += 1500 * dt; s.cade.y += s.cade.v * dt;
          var fondo = PONTE - HC * (s.pile[s.bersaglio].length + 1), dx = Math.abs(s.cade.x - centroPosto(s.bersaglio));
          if (s.cade.y >= fondo && dx <= TOLLERANZA) preso(dx <= CENTRO);
          else if (s.cade.y >= 262) inMare();
          else $('cade').innerHTML = cont(s.cade.x - LC / 2, Math.round(s.cade.y), s.cade.colore);
        }
      }
      raf = requestAnimationFrame(passo);
    }

    el.addEventListener('click', function (ev) {
      if (ev.target.closest('[data-g="via"]')) { inizia(); return; }
      if (ev.target.closest('[data-g="sgancia"]')) { sgancia(); return; }
    });
    $('campo').addEventListener('pointerdown', function (ev) {
      if (ev.target.closest('button')) return;
      ev.preventDefault(); sgancia();
    });
    $('campo').setAttribute('tabindex', '0');
    el.addEventListener('keydown', function (ev) {
      if ((ev.key === ' ' || ev.key === 'Enter') && !(ev.target.closest && ev.target.closest('button'))) { ev.preventDefault(); sgancia(); }
    });
    document.addEventListener('visibilitychange', function () { prima = 0; });
    setTimeout(function () { var b = $('via'); if (b) b.focus(); }, 30);
    return f;
  };
})();
