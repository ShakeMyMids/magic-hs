/* MAGIC HS - funzioni comuni a tutte le pagine: chiamate alle API, testo sicuro, date, avvisi. */
(function () {
  'use strict';
  var T = window.TARIC = window.TARIC || {};

  T.esc = function (s) {
    return String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };

  /* Chiamata alle API del server. Risolve con il JSON della risposta; in caso d'errore rifiuta con
     { stato, codice, errore }. Con una sessione scaduta porta alla pagina di accesso (salvo opzioni.resta). */
  T.api = function (metodo, url, corpo, opzioni) {
    opzioni = opzioni || {};
    var init = { method: metodo, credentials: 'same-origin', headers: { 'X-Taric': '1', 'Accept': 'application/json' }, signal: opzioni.signal };
    if (corpo instanceof FormData) init.body = corpo;
    else if (corpo !== undefined && corpo !== null) { init.headers['Content-Type'] = 'application/json'; init.body = JSON.stringify(corpo); }
    return fetch(url, init).then(function (r) {
      var tipo = r.headers.get('content-type') || '';
      var leggi = tipo.indexOf('application/json') >= 0 ? r.json() : r.text().then(function (t) { return { testo: t }; });
      return leggi.catch(function () { return {}; }).then(function (d) {
        if (r.ok) return d;
        if (r.status === 401 && !opzioni.resta) {
          location.href = '/accedi?torna=' + encodeURIComponent(location.pathname + location.hash);
        }
        throw { stato: r.status, codice: (d && d.codice) || 'errore_' + r.status, errore: (d && d.errore) || 'Errore del server (' + r.status + '). Riprova.' };
      });
    }, function (e) {
      if (e && e.name === 'AbortError') throw e;
      throw { stato: 0, codice: 'offline', errore: 'Server non raggiungibile: controlla la connessione e riprova.' };
    });
  };

  T.dataOra = function (iso, soloData) {
    if (!iso) return '';
    var d = new Date(iso);
    if (isNaN(d)) return iso;
    var o = soloData ? { day: '2-digit', month: '2-digit', year: 'numeric' } : { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' };
    return d.toLocaleString('it-IT', o);
  };

  T.grp = function (c) { c = String(c || ''); return [c.slice(0, 4), c.slice(4, 6), c.slice(6, 8), c.slice(8, 10)].filter(Boolean).join(' '); };

  /* breve avviso in basso, che sparisce da solo */
  T.avviso = function (testo, tipo) {
    var box = document.getElementById('avvisi');
    if (!box) { box = document.createElement('div'); box.id = 'avvisi'; box.setAttribute('role', 'status'); box.setAttribute('aria-live', 'polite'); document.body.appendChild(box); }
    var el = document.createElement('div');
    el.className = 'toast' + (tipo ? ' ' + tipo : '');
    el.textContent = testo;
    box.appendChild(el);
    setTimeout(function () { el.classList.add('via'); }, 3800);
    setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 4400);
  };

  T.copia = function (testo) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(testo).then(function () { T.avviso('Copiato.'); }, function () { T.avviso('Copia non riuscita: selezionalo a mano.', 'male'); });
    }
    T.avviso('Copia non disponibile in questo browser.', 'male');
    return Promise.resolve();
  };

  /* tema: auto | chiaro | scuro (la pagina usa data-theme="light"/"dark") */
  T.tema = function (t) {
    var r = document.documentElement;
    if (t === 'chiaro') r.setAttribute('data-theme', 'light');
    else if (t === 'scuro') r.setAttribute('data-theme', 'dark');
    else r.removeAttribute('data-theme');
    try { localStorage.setItem('taric2.tema', t || 'auto'); } catch (e) { /* nessun archivio locale */ }
  };
  try { T.tema(localStorage.getItem('taric2.tema') || 'auto'); } catch (e) { /* nessun archivio locale */ }
})();
