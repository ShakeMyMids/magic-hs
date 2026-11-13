/* MAGIC HS - pagine d'accesso del sito: accedi, richiedi un account (in attesa finché l'amministratore non lo
   approva), nuova password dal link preparato dall'amministratore (il gettone è dopo il # e non arriva al server
   con la pagina). */
(function () {
  'use strict';
  var T = window.TARIC, esc = T.esc;
  var esito = document.getElementById('esito');
  function mostra(testo, ok) { esito.innerHTML = testo ? '<p class="' + (ok ? 'esito-ok' : 'errore') + '">' + esc(testo) + '</p>' : ''; }
  function occupato(f, si) { var b = f.querySelector('button[type="submit"]'); if (b) b.disabled = si; }
  function valori(f) { var d = new FormData(f), o = {}; d.forEach(function (v, k) { o[k] = typeof v === 'string' ? v : ''; }); return o; }

  /* ------------------------------------------------------------------ accedi e richiedi un account */
  var accedi = document.getElementById('accedi'), richiedi = document.getElementById('richiedi'), modulo = '';
  if (accedi) {
    var scheda = function (quale) {
      accedi.hidden = quale !== 'accedi'; richiedi.hidden = quale !== 'richiedi'; mostra('');
      Array.prototype.forEach.call(document.querySelectorAll('[data-a]'), function (b) {
        if (b.getAttribute('data-a') === quale) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
      });
      var primo = (quale === 'accedi' ? accedi : richiedi).querySelector('input:not([type=checkbox])');
      if (primo) primo.focus();
    };
    document.querySelector('.sotto').addEventListener('click', function (ev) {
      var b = ev.target.closest('[data-a]'); if (b) scheda(b.getAttribute('data-a'));
    });
    // modulo firmato dal server (contro i bot); dice anche se le registrazioni sono aperte
    T.api('GET', '/api/modulo', null, { resta: true }).then(function (r) {
      modulo = r.modulo;
      if (!r.registrazione_aperta) {
        document.getElementById('richiedi-nota').textContent = 'Le registrazioni sono chiuse: chiedi all\'amministratore di MAGIC HS.';
        richiedi.querySelector('button[type="submit"]').disabled = true;
      }
    }, function () { /* riprova all'invio */ });
    if (location.hash === '#richiedi') scheda('richiedi'); else accedi.elements.email.focus();
    window.addEventListener('hashchange', function () { scheda(location.hash === '#richiedi' ? 'richiedi' : 'accedi'); });

    accedi.addEventListener('submit', function (ev) {
      ev.preventDefault();
      var v = valori(accedi);
      if (!v.email || !v.password) { mostra('Inserisci email e password.'); return; }
      occupato(accedi, true); mostra('');
      T.api('POST', '/api/accedi', { email: v.email, password: v.password, ricordami: accedi.elements.ricordami.checked }, { resta: true })
        .then(function () { location.href = '/'; }, function (e) { mostra(e.errore); occupato(accedi, false); });
    });

    richiedi.addEventListener('submit', function (ev) {
      ev.preventDefault();
      var v = valori(richiedi);
      if (String(v.nome || '').trim().length < 2) { mostra('Scrivi nome e cognome.'); return; }
      if (!v.email) { mostra('Scrivi la tua email.'); return; }
      if (String(v.password || '').length < 10) { mostra('La password deve avere almeno 10 caratteri.'); return; }
      occupato(richiedi, true); mostra('Invio la richiesta…', true);
      var invia = function () {
        return T.api('POST', '/api/registrazione', { nome: v.nome, azienda: v.azienda || '', email: v.email, password: v.password,
          richiesta: v.richiesta || '', sito_web: v.sito_web || '', modulo: modulo }, { resta: true });
      };
      (modulo ? Promise.resolve() : T.api('GET', '/api/modulo', null, { resta: true }).then(function (r) { modulo = r.modulo; }))
        .then(invia).then(function (r) {
          if (r.stato === 'attivo') { location.href = '/'; return; }        // amministratore: entra subito
          richiedi.reset(); richiedi.hidden = true;
          mostra('Richiesta inviata. Quando l\'amministratore la approva puoi accedere con la tua email e la password scelta.', true);
        }, function (e) { mostra(e.errore); occupato(richiedi, false); });
    });
  }

  /* ------------------------------------------------------------------ nuova password dal link dell'amministratore */
  var reimposta = document.getElementById('reimposta');
  if (reimposta) {
    var gettone = location.hash.slice(1);
    if (!gettone) { mostra('Link incompleto: copialo per intero dal messaggio dell\'amministratore.'); reimposta.hidden = true; }
    else history.replaceState(null, '', location.pathname);           // il gettone non resta nella barra degli indirizzi
    reimposta.addEventListener('submit', function (ev) {
      ev.preventDefault();
      var v = valori(reimposta);
      if (String(v.password || '').length < 10) { mostra('La password deve avere almeno 10 caratteri.'); return; }
      if (v.password !== v.ripeti) { mostra('Le due password non coincidono.'); return; }
      occupato(reimposta, true);
      T.api('POST', '/api/reimposta-password', { gettone: gettone, password: v.password }, { resta: true }).then(function (r) {
        if (r.entrato) { location.href = '/'; return; }
        reimposta.hidden = true; mostra('Password salvata. Potrai accedere quando l\'amministratore riattiva il tuo account.', true);
      }, function (e) { mostra(e.errore); occupato(reimposta, false); });
    });
  }
})();
