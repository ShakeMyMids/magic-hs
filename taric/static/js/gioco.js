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
    for (var k = 5; k < LC - 4; k += 5) h += '<line class="d-nervo" x1="' + k + '" y1="3" x2="' + k + '" y2="' + (HC - 3) + '"/>';
    return h + '<rect class="d-porta" x="' + (LC - 3) + '" width="3" height="' + HC + '"/><rect class="d-lucido" width="' + LC + '" height="1.5"/></g>';
  }
  function centroPosto(i) { return X0 + i * LP + LP / 2; }
  /* la cabina del gruista accanto al carrello: dentro c'è Simone, l'autore (js/disegni.js) */
  function cabina() {
    if (!T.autoreTesta) return '';
    return '<g class="g-cabina" data-g="cabina"><rect class="d-t" x="16" y="' + (BRACCIO - 4) + '" width="26" height="25" rx="3"/>' +
      '<rect class="g-vetro" x="19" y="' + (BRACCIO - 1) + '" width="20" height="18" rx="2"/>' +
      '<g class="g-simone"><g class="av-piccola" transform="translate(19.2 ' + (BRACCIO - 2.6) + ') scale(.165)">' + T.autoreTesta() + '</g></g></g>';
  }

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
        '<g data-g="carrello"><rect class="d-t" x="-16" y="' + (BRACCIO - 6) + '" width="32" height="12" rx="3"/>' + cabina() +
          '<path class="g-cavo" data-g="cavo" d="M0 ' + (BRACCIO + 6) + 'V' + APPESO + '"/><g data-g="appeso"></g></g>' +
        '<g data-g="cade"></g><g data-g="spruzzi"></g>' +
        '<rect class="d-mare" y="270" width="' + L + '" height="50"/>' +
        '<path class="d-onda" d="M22 284h22M110 296h34M210 288h18M300 300h30M392 286h22M480 296h34M560 284h20"/>' +
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
      // la stessa nave della scena (js/disegni.js): plancia e fumaiolo a poppa, prua slanciata, fascia arancio sulla linea d'acqua
      var P = PONTE, fin = function (x1, x2, y) { var f = ''; for (var x = x1; x <= x2; x += 8) f += '<rect class="d-oblo" x="' + x + '" y="' + y + '" width="5" height="4"/>'; return f; };
      var h = '<g data-g="scafo">' +
        '<rect class="d-t" x="50" y="' + (P - 36) + '" width="46" height="36"/>' + fin(55, 87, P - 30) + fin(55, 87, P - 18) +
        '<rect class="d-t" x="55" y="' + (P - 52) + '" width="36" height="16"/>' + fin(59, 83, P - 46) +
        '<rect class="d-t" x="46" y="' + (P - 59) + '" width="54" height="7"/><rect class="d-oblo" x="50" y="' + (P - 57) + '" width="46" height="3"/>' +
        '<path class="d-t" d="M58 ' + (P - 59) + 'L60 ' + (P - 80) + 'H74V' + (P - 59) + 'Z"/><path class="d-c1" d="M59.4 ' + (P - 74) + 'H74V' + (P - 69) + 'H58.9Z"/>' +
        '<path class="d-albero" d="M92 ' + (P - 59) + 'V' + (P - 76) + 'M86 ' + (P - 71) + 'h12M528 ' + P + 'V' + (P - 16) + 'M523 ' + (P - 12) + 'h10"/>' +
        '<path class="d-t" d="M44 ' + P + 'H512Q532 ' + (P - 1) + ' 540 ' + (P + 8) + 'L526 ' + (P + 38) + 'H58Q48 ' + (P + 36) + ' 45 ' + (P + 20) + 'Z"/>' +
        '<path class="d-ombra-s" d="M44.6 ' + (P + 12) + 'H536.7L533.8 ' + (P + 20) + 'H45Z"/><path class="d-c1" d="M45 ' + (P + 20) + 'H533.8L531 ' + (P + 27) + 'H47Z"/>' +
        '<path class="d-filo" d="M46 ' + (P + 0.6) + 'H512Q528 ' + P + ' 536 ' + (P + 5) + '"/><circle class="d-ombra-s" cx="526" cy="' + (P + 9) + '" r="2.6"/>';
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
    function gruista(classe) {                     // Simone nella cabina: esulta o scuote la testa
      var c = $('cabina');
      if (!c) return;
      c.classList.remove('esulta', 'peccato'); void c.getBoundingClientRect(); c.classList.add(classe);
    }
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
      gruista('esulta');
      annuncia('Caricato. Punti ' + s.punti + '.');
      if (s.caricati >= PER_NAVE) { s.punti += 5; s.salpa = 1; $('bersaglio').innerHTML = ''; scritta('Nave piena: salpa! +5', 'oro'); annuncia('Nave piena, cinque punti in più. Punti ' + s.punti + '.'); }
      else { disegnaNave(); nuovoBersaglio(); }
      $('punti').textContent = s.punti;
    }
    function inMare() {
      var x = s.cade.x;
      s.cade = null; $('cade').innerHTML = '';
      $('spruzzi').innerHTML = '<g class="g-spruzzo" transform="translate(' + x + ' 272)"><circle r="5" cx="-14" cy="-6"/><circle r="7" cy="-12"/><circle r="5" cx="14" cy="-6"/></g>';
      s.riserva -= 1; riserva(); gruista('peccato');
      if (s.riserva <= 0) finisci();
      else { scritta('Splash!'); annuncia('In mare. Riserva ' + s.riserva + '.'); }
    }
    function finisci() {
      s.fine = true; $('sgancia').disabled = true;
      var r = record(), nuovo = s.punti > r;
      if (nuovo) { salvaRecord(s.punti); $('record').textContent = s.punti; }
      $('velo').innerHTML = (nuovo && T.autore ? '<div class="g-autore">' + T.autore({ esulta: true }) + '</div>' : '') +
        '<p class="g-titolo">' + (nuovo ? 'Nuovo record!' : 'Fine turno') + '</p><p><b>' + s.punti + '</b> ' + (s.punti === 1 ? 'punto' : 'punti') +
        (nuovo ? '' : ' · record ' + esc(r)) + '</p><button class="btn pri" type="button" data-g="via">' + T.icona('aggiorna') + 'Gioca ancora</button>';
      $('velo').hidden = false;
      annuncia('Fine turno: ' + s.punti + ' punti' + (nuovo ? ', nuovo record.' : '.'));
      setTimeout(function () { var b = $('via'); if (b) b.focus(); }, 30);
    }
    function passo(t) {
      if (!document.contains(el)) return;
      var dt = prima ? Math.min(0.05, (t - prima) / 1000) : 0; prima = t;     // al ritorno su una scheda nascosta, al massimo 50 ms
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
    setTimeout(function () { var b = $('via'); if (b) b.focus(); }, 30);
    return f;
  };
})();
