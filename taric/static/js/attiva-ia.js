/* MAGIC HS - attivare l'intelligenza artificiale, nel sito e nel programma per Windows:
   - T.guidaGemini(): guida alla chiave gratuita di Google Gemini (Google AI Studio), con il campo per incollarla:
     «Collega» la salva e prova subito il modello rapido e quello principale;
   - T.festaIA({nome, secondi}): la festa quando un servizio IA risponde per la prima volta (scena di T.festa() in
     disegni.js: la gru carica sulla nave il container dell'IA). Con «movimento ridotto» si vede subito la scena finale. */
(function () {
  'use strict';
  var T = window.TARIC, esc = T.esc;
  var STUDIO = 'https://aistudio.google.com/apikey', TERMINI = 'https://ai.google.dev/gemini-api/terms';

  /* finestra sopra la pagina: Esc o clic fuori la chiudono, il tasto Tab resta dentro, poi si torna dove si era */
  function finestra(html, idTitolo, classe) {
    var prima = document.activeElement, velo = document.createElement('div');
    velo.className = 'velo';
    velo.innerHTML = '<div class="finestra ' + classe + '" role="dialog" aria-modal="true" aria-labelledby="' + idTitolo + '">' + html + '</div>';
    document.body.appendChild(velo);
    document.documentElement.classList.add('con-finestra');
    var f = velo.firstChild;
    function chiudi() {
      if (!velo.parentNode) return;
      velo.parentNode.removeChild(velo);
      document.documentElement.classList.remove('con-finestra');
      document.removeEventListener('keydown', tasti, true);
      if (prima && prima.focus && document.contains(prima)) prima.focus();
    }
    function tasti(ev) {
      if (ev.key === 'Escape') { ev.preventDefault(); chiudi(); return; }
      if (ev.key !== 'Tab') return;
      var el = Array.prototype.filter.call(f.querySelectorAll('a[href],button:not([disabled]),input:not([disabled])'), function (x) { return x.offsetParent !== null; });
      if (!el.length) return;
      if (ev.shiftKey && document.activeElement === el[0]) { ev.preventDefault(); el[el.length - 1].focus(); }
      else if (!ev.shiftKey && document.activeElement === el[el.length - 1]) { ev.preventDefault(); el[0].focus(); }
    }
    document.addEventListener('keydown', tasti, true);
    velo.addEventListener('mousedown', function (ev) { if (ev.target === velo) chiudi(); });
    f.addEventListener('click', function (ev) { if (ev.target.closest('[data-f="chiudi"]')) chiudi(); });
    return { el: f, chiudi: chiudi };
  }

  /* ------------------------------------------------------------------ guida alla chiave gratuita di Gemini */
  T.guidaGemini = function () {
    var f = finestra(
      '<div class="lab">' + T.icona('scintille') + '<span id="guida-titolo">Chiave gratuita di Google Gemini</span>' +
        '<span class="dx"><button class="tasto-ico" type="button" data-f="chiudi" aria-label="Chiudi la guida">' + T.icona('chiudi') + '</button></span></div>' +
      '<p class="nota">Con una chiave di Google Gemini, MAGIC HS propone il codice partendo dalla descrizione della merce. Si crea gratis in un paio di minuti con un account Google.</p>' +
      '<ol class="passi">' +
        '<li><b>Apri Google AI Studio</b> e accedi con il tuo account Google.' +
          '<div class="fila"><a class="btn sm" href="' + STUDIO + '" target="_blank" rel="noopener">' + T.icona('link') + 'Apri Google AI Studio</a></div></li>' +
        '<li>Premi <b>Create API key</b> (in italiano «Crea chiave API»). Se te lo chiede, accetta i termini e tieni il progetto proposto.</li>' +
        '<li><b>Copia la chiave</b> e incollala qui: MAGIC HS la salva e prova subito che funzioni.' +
          '<form class="fila" data-f="collega"><input class="campo" type="password" name="chiave" autocomplete="off" spellcheck="false" placeholder="Incolla la chiave" aria-label="Chiave di Google Gemini" required>' +
          '<button class="btn pri" type="submit">' + T.icona('scintille') + 'Collega</button></form><div data-f="esito" role="status" aria-live="polite"></div></li>' +
      '</ol>' +
      '<div class="da-sapere">' +
        '<p class="nota"><b>Gratis, con dei limiti</b> di richieste al minuto e al giorno: se li superi MAGIC HS te lo dice, e basta riprovare più tardi.</p>' +
        '<p class="nota"><b>In Europa</b> i <a href="' + TERMINI + '" target="_blank" rel="noopener">termini dell\'API Gemini</a> chiedono il piano a pagamento a chi rende disponibile un\'applicazione a persone dell\'Unione europea, della Svizzera o del Regno Unito: per l\'uso in azienda chiedi conferma a chi segue contratti e privacy. Il piano a pagamento si attiva nello stesso progetto di AI Studio, costa pochi centesimi a classificazione e accetta un tetto di spesa.</p>' +
        '<p class="nota"><b>La chiave è personale</b>: non condividerla. ' + (T.web ? 'Resta in questo browser.' : 'Resta su questo PC, protetta da Windows.') + '</p>' +
      '</div>', 'guida-titolo', 'guida');
    var modulo = f.el.querySelector('[data-f="collega"]'), esito = f.el.querySelector('[data-f="esito"]');
    var campo = modulo.elements.chiave, tasto = modulo.querySelector('button');
    function mostra(testo, ok) { esito.innerHTML = testo ? '<p class="' + (ok ? 'esito-ok' : 'errore') + '">' + esc(testo) + '</p>' : ''; }
    modulo.addEventListener('submit', function (ev) {
      ev.preventDefault();
      var chiave = String(campo.value || '').replace(/\s+/g, '');
      if (chiave.length < 20) { mostra('La chiave sembra incompleta: copiala di nuovo per intero da Google AI Studio.'); campo.focus(); return; }
      tasto.disabled = true; mostra('Collego e provo…', true);
      var rapida;
      T.api('PUT', '/api/admin/locale/ia', { fornitore: 'gemini', chiave: chiave, url: '', modello: '', modello_rapido: '' })
        .then(function () { return T.api('POST', '/api/admin/locale/ia/prova'); })
        .then(function (r) { rapida = r; return T.api('POST', '/api/admin/locale/ia/prova?livello=standard'); })
        .then(function (r) {
          f.chiudi();
          avvisaCambio();
          T.festaIA({ nome: 'Gemini (Google)', secondi: Math.max(rapida.secondi || 0, r.secondi || 0) });
        }, function (e) {
          tasto.disabled = false; avvisaCambio();
          var testo = (e && e.errore) || 'Collegamento non riuscito.';
          if (rapida) testo = 'La chiave funziona, ma il modello principale non risponde: ' + testo + ' In Impostazioni puoi sceglierne un altro con «Elenco dei modelli».';
          else if (e && e.codice === 'server_misconfigured') testo = 'Google non accetta questa chiave: copiala di nuovo per intero da Google AI Studio.';
          mostra(testo);
        });
    });
    setTimeout(function () { var a = f.el.querySelector('a.btn'); if (a) a.focus(); }, 30);
  };
  function avvisaCambio() {               // Classifica e Impostazioni si aggiornano
    if (T.app && T.app.aggiornaIo) T.app.aggiornaIo();
    document.dispatchEvent(new CustomEvent('taric:ia'));
  }

  /* ------------------------------------------------------------------ festa: intelligenza artificiale collegata */
  T.festaIA = function (info) {
    info = info || {};
    var s = info.secondi ? String(info.secondi).replace('.', ',') : '';
    var f = finestra(
      '<div class="festa-scena">' + (T.festa ? T.festa() : '') + '</div>' +
      '<div class="festa-testo">' +
        '<span class="timbro">' + T.icona('scintille') + '<span>IA attiva<small>' + esc(info.nome || 'Servizio collegato') + '</small></span></span>' +
        '<h2 id="festa-titolo">Intelligenza artificiale collegata</h2>' +
        '<p class="nota">' + esc(info.nome || 'Il servizio') + ' ha risposto' + (s ? ' in ' + esc(s) + ' secondi' : '') +
          ': descrivi una merce e MAGIC HS ti propone il codice, con le alternative e le domande che servono.</p>' +
        '<div class="fila"><button class="btn pri" type="button" data-f="classifica">' + T.icona('bacchetta') + 'Classifica una merce</button>' +
        '<button class="btn" type="button" data-f="chiudi">Chiudi</button></div>' +
      '</div>', 'festa-titolo', 'festa');
    f.el.querySelector('[data-f="classifica"]').addEventListener('click', function () {
      f.chiudi();
      if (location.hash !== '#classifica') location.hash = '#classifica';
      setTimeout(function () { var q = document.getElementById('q'); if (q) q.focus(); }, 60);
    });
    setTimeout(function () { f.el.querySelector('[data-f="classifica"]').focus(); }, 30);
    return f;
  };
})();
