/* MAGIC HS - pagine di accesso, registrazione, conferma email, recupero password, configurazione e attesa dati. */
(function () {
  'use strict';
  var T = window.TARIC, esc = T.esc;
  var pagina = document.body.getAttribute('data-pagina');
  var modulo = document.getElementById('modulo');
  var esito = document.getElementById('esito');

  function mostra(testo, ok) { esito.innerHTML = testo ? '<p class="' + (ok ? 'esito-ok' : 'errore') + '">' + esc(testo) + '</p>' : ''; }
  function occupato(si) { if (!modulo) return; var b = modulo.querySelector('button[type="submit"]'); if (b) b.disabled = si; }
  function campo(n) { return modulo.elements[n]; }
  function valore(n) { var c = campo(n); return c ? String(c.value || '').trim() : ''; }
  function gettone() { var g = location.hash.replace(/^#/, ''); return g; }
  function nascondiGettone() { try { history.replaceState(null, '', location.pathname); } catch (e) { /* non importante */ } }
  function destinazione() {
    var t = new URLSearchParams(location.search).get('torna') || '/';
    return (t.charAt(0) === '/' && t.charAt(1) !== '/' && t.charAt(1) !== '\\') ? t : '/';
  }
  function controllaPassword() {
    var p = campo('password').value, r = campo('ripeti');
    if (p.length < 10) return 'La password deve avere almeno 10 caratteri.';
    if (r && p !== r.value) return 'Le due password non coincidono.';
    return '';
  }
  function invio(fn) {
    if (!modulo) return;
    modulo.addEventListener('submit', function (ev) {
      ev.preventDefault();
      mostra('');
      fn();
    });
  }

  if (pagina === 'accedi') {
    T.api('GET', '/api/stato', null, { resta: true }).then(function (s) {
      if (!s.configurato) { location.href = '/configura'; return; }
      document.getElementById('link-registrati').hidden = !s.registrazione_aperta;
    }, function () { /* il modulo funziona comunque */ });
    invio(function () {
      if (!valore('email') || !campo('password').value) { mostra('Scrivi email e password.'); return; }
      occupato(true);
      T.api('POST', '/api/accedi', { email: valore('email'), password: campo('password').value, ricordami: campo('ricordami').checked }, { resta: true })
        .then(function () { location.href = destinazione(); }, function (e) { occupato(false); mostra(e.errore); campo('password').select(); });
    });
  }

  if (pagina === 'registrati') {
    var chiediModulo = function () {
      return T.api('GET', '/api/registrazione/modulo', null, { resta: true }).then(function (r) { campo('modulo').value = r.modulo; });
    };
    T.api('GET', '/api/stato', null, { resta: true }).then(function (s) {
      if (!s.registrazione_aperta) {
        modulo.hidden = true; document.getElementById('intro').hidden = true;
        mostra('Le registrazioni sono chiuse: chiedi un account all\'amministratore del sito.');
      } else if (!s.posta) {
        document.getElementById('intro').textContent = 'Compila il modulo: la richiesta arriva all\'amministratore, che attiverà il tuo account.';
      }
    });
    chiediModulo();
    invio(function () {
      if (valore('nome').length < 2) { mostra('Scrivi nome e cognome.'); return; }
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(valore('email'))) { mostra('Scrivi un indirizzo email valido.'); return; }
      var p = controllaPassword(); if (p) { mostra(p); return; }
      if (!campo('consenso').checked) { mostra('Per registrarti devi spuntare la casella del consenso.'); return; }
      occupato(true);
      T.api('POST', '/api/registrazione', {
        nome: valore('nome'), azienda: valore('azienda'), email: valore('email'), password: campo('password').value,
        richiesta: valore('richiesta'), consenso: true, sito_web: campo('sito_web').value, modulo: campo('modulo').value
      }, { resta: true }).then(function (r) {
        modulo.hidden = true; document.getElementById('intro').hidden = true; mostra(r.messaggio, true);
      }, function (e) {
        occupato(false); mostra(e.errore);
        if (e.codice === 'modulo') chiediModulo();
      });
    });
  }

  if (pagina === 'conferma-email') {
    var g = gettone();
    nascondiGettone();
    if (!g) mostra('Il link è incompleto: aprilo di nuovo dall\'email, senza modificarlo.');
    else T.api('POST', '/api/conferma-email', { gettone: g }, { resta: true }).then(function (r) { mostra(r.messaggio, true); }, function (e) { mostra(e.errore); });
  }

  if (pagina === 'password-dimenticata') {
    invio(function () {
      if (!valore('email')) { mostra('Scrivi la tua email.'); return; }
      occupato(true);
      T.api('POST', '/api/password-dimenticata', { email: valore('email') }, { resta: true })
        .then(function (r) { modulo.hidden = true; mostra(r.messaggio, true); }, function (e) { occupato(false); mostra(e.errore); });
    });
  }

  if (pagina === 'reimposta-password') {
    var g2 = gettone();
    nascondiGettone();
    if (!g2) { modulo.hidden = true; mostra('Il link è incompleto: aprilo di nuovo dal messaggio ricevuto, senza modificarlo.'); }
    invio(function () {
      var p = controllaPassword(); if (p) { mostra(p); return; }
      occupato(true);
      T.api('POST', '/api/reimposta-password', { gettone: g2, password: campo('password').value }, { resta: true }).then(function (r) {
        if (r.entrato) { location.href = '/'; return; }
        modulo.hidden = true; mostra('Password salvata. Potrai accedere quando il tuo account sarà attivo.', true);
      }, function (e) { occupato(false); mostra(e.errore); });
    });
  }

  if (pagina === 'configura') {
    invio(function () {
      var p = controllaPassword(); if (p) { mostra(p); return; }
      occupato(true);
      T.api('POST', '/api/configurazione-iniziale', { codice: valore('codice'), nome: valore('nome'), email: valore('email'), password: campo('password').value }, { resta: true })
        .then(function () { location.href = '/#gestione'; }, function (e) { occupato(false); mostra(e.errore); });
    });
  }

  if (pagina === 'attesa') {
    var fase = document.getElementById('fase'), giri = 0;
    document.getElementById('esci').addEventListener('click', function () {
      function via() { location.href = '/accedi'; }
      T.api('POST', '/api/esci', null, { resta: true }).then(via, via);
    });
    T.api('GET', '/api/io').then(function (u) {
      if (u.ruolo !== 'amministratore') return;
      document.getElementById('admin').hidden = false;
      document.getElementById('scarica').addEventListener('click', function () {
        T.api('POST', '/api/admin/dati/aggiorna', { mese: '' }).then(function (r) { mostra('Download di ' + r.mese + ' avviato.', true); }, function (e) { mostra(e.errore); });
      });
      invio(function () {
        occupato(true); mostra('Caricamento in corso…', true);
        T.api('POST', '/api/admin/dati/carica', new FormData(modulo)).then(function (r) { mostra('Archivio caricato: installazione di ' + r.mese + ' avviata.', true); },
          function (e) { mostra(e.errore); }).then(function () { occupato(false); });
      });
    });
    var controlla = function () {
      T.api('GET', '/api/stato', null, { resta: true }).then(function (s) {
        if (s.dati_pronti) { location.href = '/'; return; }
        if (s.locale) document.getElementById('esci').hidden = true;
        if (s.locale && !s.editore) {
          // programma sul PC di un collega: i dati arrivano solo dalla cartella condivisa
          fase.textContent = 'I dati TARIC arrivano dalla cartella condivisa di OneDrive. Se l\'hai aggiunta da poco, aspetta che OneDrive finisca di scaricarla: ' +
            'la pagina si apre da sola. Se l\'attesa si prolunga, chiedi a chi gestisce MAGIC HS di aprirlo sul suo PC per pubblicare i dati.';
          if (giri++ % 3 === 0) T.api('POST', '/api/locale/sincronizza', null, { resta: true }).catch(function () { /* riprova al giro dopo */ });
          return;
        }
        if (s.aggiornamento) fase.textContent = 'In corso: ' + s.aggiornamento + '…';
        else fase.textContent = 'Nessun download in corso in questo momento. Il server riprova da solo ogni mezz\'ora' +
          (document.getElementById('admin').hidden ? '; se l\'attesa si prolunga avvisa l\'amministratore.' : ', oppure usa i pulsanti qui sotto.');
      }).then(function () { setTimeout(controlla, 4000); }, function () { setTimeout(controlla, 8000); });
    };
    controlla();
  }
})();
