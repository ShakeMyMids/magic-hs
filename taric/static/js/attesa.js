/* MAGIC HS - pagina d'attesa dei dati TARIC: si apre l'app appena i dati sono pronti.
   Sul PC di un collega i dati arrivano solo dalla cartella condivisa; chi gestisce MAGIC HS può scaricarli
   di nuovo o caricare a mano l'archivio dell'estrazione. */
(function () {
  'use strict';
  var T = window.TARIC, esc = T.esc;
  var modulo = document.getElementById('modulo');
  var esito = document.getElementById('esito');
  var fase = document.getElementById('fase'), giri = 0;

  function mostra(testo, ok) { esito.innerHTML = testo ? '<p class="' + (ok ? 'esito-ok' : 'errore') + '">' + esc(testo) + '</p>' : ''; }
  function occupato(si) { var b = modulo.querySelector('button[type="submit"]'); if (b) b.disabled = si; }

  T.api('GET', '/api/io').then(function (u) {
    if (u.ruolo !== 'amministratore') return;
    document.getElementById('admin').hidden = false;
    document.getElementById('scarica').addEventListener('click', function () {
      T.api('POST', '/api/admin/dati/aggiorna', { mese: '' }).then(function (r) { mostra('Download di ' + r.mese + ' avviato.', true); }, function (e) { mostra(e.errore); });
    });
    modulo.addEventListener('submit', function (ev) {
      ev.preventDefault();
      occupato(true); mostra('Caricamento in corso…', true);
      T.api('POST', '/api/admin/dati/carica', new FormData(modulo)).then(function (r) { mostra('Archivio caricato: installazione di ' + r.mese + ' avviata.', true); },
        function (e) { mostra(e.errore); }).then(function () { occupato(false); });
    });
  });

  function controlla() {
    T.api('GET', '/api/stato', null, { resta: true }).then(function (s) {
      if (s.dati_pronti) { location.href = '/'; return; }
      if (!s.editore) {
        fase.textContent = 'I dati arrivano dalla cartella condivisa appena OneDrive li scarica. Se tarda, chiedi a chi gestisce MAGIC HS di aprirlo sul suo PC.';
        if (giri++ % 3 === 0) T.api('POST', '/api/locale/sincronizza', null, { resta: true }).catch(function () { /* riprova al giro dopo */ });
        return;
      }
      fase.textContent = s.aggiornamento ? 'In corso: ' + s.aggiornamento + '…' : 'Nessun download in corso: MAGIC HS riprova ogni dieci minuti.';
    }).then(function () { setTimeout(controlla, 4000); }, function () { setTimeout(controlla, 8000); });
  }
  controlla();
})();
