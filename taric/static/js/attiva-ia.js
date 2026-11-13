/* MAGIC HS - festa per l'intelligenza artificiale collegata:
   T.festaIA({nome, secondi}) quando il servizio IA risponde alla prima prova (scena di T.festa() in disegni.js: la gru
   carica sulla nave il container dell'IA). Con «movimento ridotto» si vede subito la scena finale. */
(function () {
  'use strict';
  var T = window.TARIC, esc = T.esc;

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
