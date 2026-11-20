/* MAGIC HS - «Segnala un problema» (link in fondo alla pagina, nel Profilo e nell'ultimo passo di Marino): finestra con il
   testo; insieme mando dove si trovava chi scrive (sezione, codice aperto, misura dello schermo, browser, dati in uso), che
   l'amministratore legge in Gestione › Segnalazioni. La risposta arriva nel Profilo («Segnalazioni»); all'apertura del sito
   un avviso dice se ce n'è una nuova («risposte» di /api/io, in js/app.js). */
(function () {
  'use strict';
  var T = window.TARIC, esc = T.esc;
  var SEZIONI = { classifica: 'Classifica', nomenclatura: 'Nomenclatura', bolla: 'Bolla', profilo: 'Profilo', gestione: 'Gestione' };

  function contesto() {
    var s = document.querySelector('main > section[id^="view-"]:not([hidden])'), sezione = s ? s.id.slice(5) : '';
    var cod = sezione === 'classifica' ? document.querySelector('#esito [data-act="copia"]') : null;
    return { sezione: sezione, contesto: {
      indirizzo: (location.pathname + location.search + location.hash).slice(0, 300),
      codice: cod ? String(cod.getAttribute('data-c') || '').slice(0, 20) : '',
      schermo: (window.innerWidth + 'x' + window.innerHeight).slice(0, 20),
      browser: String(navigator.userAgent || '').slice(0, 300),
      versione: String(document.documentElement.getAttribute('data-attivi') || '').slice(0, 40) } };
  }

  T.segnala = function () {
    if (document.querySelector('.velo')) return;
    var c = contesto();
    var w = T.finestra('<div class="lab" id="segnala-titolo">' + T.icona('attenzione') + 'Segnala un problema' +
      '<span class="dx"><button class="tasto-ico" type="button" data-f="chiudi" aria-label="Chiudi">' + T.icona('chiudi') + '</button></span></div>' +
      '<form class="modulo" novalidate><label>Cosa non va?<textarea class="campo" name="testo" rows="5" maxlength="2000" ' +
      'placeholder="Per esempio: cercando «muletto» non trovo niente"></textarea></label>' +
      '<p class="nota">Con il testo mando anche la sezione (' + esc(SEZIONI[c.sezione] || '–') + ')' + (c.contesto.codice ? ', il codice aperto' : '') +
      ', la misura dello schermo e il browser. La risposta la trovi nel Profilo.</p><p class="errore" hidden></p>' +
      '<div class="fila"><button class="btn pri" type="submit">' + T.icona('spunta') + 'Manda</button>' +
      '<button class="btn" type="button" data-f="chiudi">Annulla</button></div></form>', 'segnala-titolo', 'segnala');
    var f = w.el.querySelector('form'), t = f.querySelector('textarea'), e = f.querySelector('.errore'), b = f.querySelector('[type="submit"]');
    t.focus();
    f.addEventListener('submit', function (ev) {
      ev.preventDefault();
      var testo = t.value.trim();
      if (testo.length < 5) { e.textContent = 'Scrivi qualche parola in più sul problema.'; e.hidden = false; t.focus(); return; }
      b.disabled = true; e.hidden = true;
      T.api('POST', '/api/segnalazioni', { testo: testo, sezione: c.sezione, contesto: c.contesto }).then(function () {
        w.chiudi();
        T.avviso('Segnalazione mandata, grazie! La risposta la trovi nel Profilo.');
        if (T.viste && T.viste.profilo) T.viste.profilo.daRicaricare = true;
      }, function (err) { b.disabled = false; e.textContent = (err && err.errore) || 'Segnalazione non mandata: riprova.'; e.hidden = false; });
    });
  };
  document.addEventListener('click', function (ev) { if (ev.target.closest && ev.target.closest('[data-segnala]')) T.segnala(); });
})();
