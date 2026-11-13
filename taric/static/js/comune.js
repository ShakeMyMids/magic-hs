/* MAGIC HS - funzioni comuni a tutte le pagine: chiamate alle API, testo sicuro, date, avvisi. */
(function () {
  'use strict';
  var T = window.TARIC = window.TARIC || {};

  T.esc = function (s) {
    return String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };

  /* Chiamata alle API del programma. Risolve con il JSON della risposta; in caso d'errore rifiuta con
     { stato, codice, errore }. Con una sessione scaduta torna alla pagina iniziale (salvo opzioni.resta). */
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
        if (r.status === 401 && !opzioni.resta) location.href = '/';      // sessione scaduta: la pagina iniziale spiega come riaprire
        throw { stato: r.status, codice: (d && d.codice) || 'errore_' + r.status, errore: (d && d.errore) || 'Errore di MAGIC HS (' + r.status + '). Riprova.' };
      });
    }, function (e) {
      if (e && e.name === 'AbortError') throw e;
      if (T.alOffline) T.alOffline();            // forse il programma si è chiuso
      throw { stato: 0, codice: 'offline', errore: 'MAGIC HS non risponde: se l\'hai chiuso, riaprilo da «Avvia MAGIC HS».' };
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

  /* icone (js/icone.js): T.icona('cerca') restituisce l'SVG da inserire nel testo HTML */
  T.icona = function (nome, classe) {
    var d = (window.TARIC_ICONE || {})[nome];
    return d ? '<svg class="ico' + (classe ? ' ' + classe : '') + '" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' + d + '</svg>' : '';
  };
  /* marchio di MAGIC HS: una nave portacontainer, i container in arancio come la casella TARIC */
  T.marchio = '<svg class="marchio" viewBox="0 0 32 32" aria-hidden="true" focusable="false"><rect class="m-fondo" width="32" height="32" rx="8"/>' +
    '<rect class="m-t" x="8.4" y="7.2" width="5.2" height="4.4" rx=".9"/><rect class="m-c" x="8.4" y="12.4" width="5.2" height="4.4" rx=".9"/><rect class="' +
    'm-t" x="14.4" y="12.4" width="5.2" height="4.4" rx=".9"/><rect class="m-r" x="20.4" y="12.4" width="5.2" height="4.4" rx=".9"/><path class="m-c" d="M4' +
    '.6 18h22.8l-2.9 6.4a1.6 1.6 0 0 1-1.46.95H8.96a1.6 1.6 0 0 1-1.46-.95z"/>' + '</svg>';

  /* tema: auto | chiaro | scuro (la pagina usa data-theme="light"/"dark") */
  var TEMI = { auto: ['auto', 'Tema: come il dispositivo'], chiaro: ['sole', 'Tema chiaro'], scuro: ['luna', 'Tema scuro'] };
  function scuroAttivo() {
    var a = document.documentElement.getAttribute('data-theme');
    return a ? a === 'dark' : !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
  }
  function coloreBarra() {
    var m = document.querySelector('meta[name="theme-color"]');
    if (m) m.setAttribute('content', getComputedStyle(document.documentElement).getPropertyValue('--fondo').trim() || (scuroAttivo() ? '#0d151e' : '#e1e6eb'));
  }
  T.temaAttuale = 'auto';
  T.tema = function (t) {
    t = TEMI[t] ? t : 'auto';
    var r = document.documentElement;
    if (t === 'chiaro') r.setAttribute('data-theme', 'light');
    else if (t === 'scuro') r.setAttribute('data-theme', 'dark');
    else r.removeAttribute('data-theme');
    T.temaAttuale = t;
    try { localStorage.setItem('taric2.tema', t); } catch (e) { /* nessun archivio locale */ }
    coloreBarra();
    var b = document.getElementById('tema');
    if (b) { b.innerHTML = T.icona(TEMI[t][0]); b.title = TEMI[t][1] + ' (tocca per cambiare)'; b.setAttribute('aria-label', TEMI[t][1] + ': tocca per cambiare'); }
  };
  /* cambio di tema dal pulsante: dissolvenza dove il browser la sa fare */
  T.cambiaTema = function (t) {
    var fermo = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (document.startViewTransition && !fermo) document.startViewTransition(function () { T.tema(t); });
    else T.tema(t);
    document.dispatchEvent(new CustomEvent('taric:tema', { detail: t }));
  };
  try { T.tema(localStorage.getItem('taric2.tema') || 'auto'); } catch (e) { T.tema('auto'); }
  if (window.matchMedia) {
    var mq = window.matchMedia('(prefers-color-scheme: dark)');
    if (mq.addEventListener) mq.addEventListener('change', coloreBarra);
  }

  function prepara() {
    Array.prototype.forEach.call(document.querySelectorAll('[data-ico]'), function (el) {
      el.insertAdjacentHTML('afterbegin', T.icona(el.getAttribute('data-ico')));
      el.removeAttribute('data-ico');
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-scena]'), function (el) {     // js/disegni.js
      if (T.scena) el.insertAdjacentHTML('afterbegin', T.scena(el.getAttribute('data-scena')));
      el.removeAttribute('data-scena');
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-marchio]'), function (el) {
      el.insertAdjacentHTML('afterbegin', T.marchio);
      el.removeAttribute('data-marchio');
    });
    var b = document.getElementById('tema');
    if (b) {
      T.tema(T.temaAttuale);
      b.addEventListener('click', function () { T.cambiaTema({ auto: 'chiaro', chiaro: 'scuro', scuro: 'auto' }[T.temaAttuale]); });
    }
    var barra = document.querySelector('.barra');
    if (barra) {
      var segna = function () { barra.classList.toggle('staccata', window.scrollY > 4); };
      window.addEventListener('scroll', segna, { passive: true }); segna();
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', prepara); else prepara();
})();
