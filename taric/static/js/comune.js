/* MAGIC HS - funzioni comuni a tutte le pagine: chiamate alle API, testo sicuro, date, avvisi. */
(function () {
  'use strict';
  var T = window.TARIC = window.TARIC || {};

  T.esc = function (s) {
    return String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };
  /* 'AAAA-MM' -> «novembre 2026» ('' se non è un mese) */
  var MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
  T.meseIt = function (m) {
    var x = /^(\d{4})-(\d{2})$/.exec(m || '');
    return x && +x[2] >= 1 && +x[2] <= 12 ? MESI[+x[2] - 1] + ' ' + x[1] : '';
  };
  /* la prima riga di un testo, accorciata a n caratteri con i puntini */
  T.taglia = function (s, n) { s = String(s || '').split('\n')[0]; return s.length > n ? s.slice(0, n - 1).trim() + '…' : s; };

  /* Chiamata alle API del sito. Risolve con il JSON della risposta; in caso d'errore rifiuta con
     { stato, codice, errore }. Con una sessione scaduta torna alla pagina di accesso (salvo opzioni.resta). */
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
        if (r.status === 401 && !opzioni.resta) location.href = '/accedi';      // sessione scaduta
        throw { stato: r.status, codice: (d && d.codice) || 'errore_' + r.status, errore: (d && d.errore) || 'Errore di MAGIC HS (' + r.status + '). Riprova.' };
      });
    }, function (e) {
      if (e && e.name === 'AbortError') throw e;
      throw { stato: 0, codice: 'offline', errore: 'MAGIC HS non risponde: controlla la connessione e riprova.' };
    });
  };

  /* finestra sopra la pagina: Esc o clic fuori la chiudono, il tasto Tab resta dentro, poi si torna dove si era */
  T.finestra = function (html, idTitolo, classe) {
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
  // account con l'IA spenta (utenti.quota_ia = 0, per esempio quelli approvati in automatico per il dominio dell'email)
  T.IA_NON_AUTORIZZATA = 'Chiedere autorizzazione all\'admin per l\'utilizzo dell\'IA';
  T.icona = function (nome, classe) {
    var d = (window.TARIC_ICONE || {})[nome];
    return d ? '<svg class="ico' + (classe ? ' ' + classe : '') + '" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' + d + '</svg>' : '';
  };
  /* marchio di MAGIC HS: una nave portacontainer, i container in arancio come la casella TARIC */
  T.marchio = '<svg class="marchio" viewBox="0 0 32 32" aria-hidden="true" focusable="false"><rect class="m-fondo" width="32" height="32" rx="8"/>' +
    '<rect class="m-t" x="8.4" y="7.2" width="5.2" height="4.4" rx=".9"/><rect class="m-c" x="8.4" y="12.4" width="5.2" height="4.4" rx=".9"/><rect class="' +
    'm-t" x="14.4" y="12.4" width="5.2" height="4.4" rx=".9"/><rect class="m-r" x="20.4" y="12.4" width="5.2" height="4.4" rx=".9"/><path class="m-c" d="M4' +
    '.6 18h22.8l-2.9 6.4a1.6 1.6 0 0 1-1.46.95H8.96a1.6 1.6 0 0 1-1.46-.95z"/>' + (T.accessorio ? T.accessorio() : '') + '</svg>';   // stagioni e feste: js/disegni.js

  /* tema: auto | chiaro | scuro (la pagina usa data-theme="light"/"dark"; il primo lo mette js/calendario.js) */
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
  T.tema = function (t, soloPagina) {          // soloPagina: non lo ricorda (all'apertura della pagina)
    t = TEMI[t] ? t : 'auto';
    var r = document.documentElement;
    if (t === 'chiaro') r.setAttribute('data-theme', 'light');
    else if (t === 'scuro') r.setAttribute('data-theme', 'dark');
    else r.removeAttribute('data-theme');
    T.temaAttuale = t;
    if (!soloPagina) try { localStorage.setItem('magic-hs.tema', t); localStorage.removeItem('taric2.tema'); } catch (e) { /* nessun archivio locale */ }
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
  T.tema(T.temaSalvato || 'auto', true);            // letto da js/calendario.js nell'<head>
  /* puntatore del mouse a forma di aereo (app.css): si spegne dal profilo, su questo dispositivo */
  T.puntatoreAereo = function (acceso) {
    document.documentElement.classList.toggle('senza-aereo', !acceso);
    try { if (acceso) localStorage.removeItem('magic-hs.aereo'); else localStorage.setItem('magic-hs.aereo', 'no'); } catch (e) { /* niente archivio */ }
  };
  T.conMouse = !!(window.matchMedia && window.matchMedia('(hover: hover) and (pointer: fine)').matches);
  try { if (localStorage.getItem('magic-hs.aereo') === 'no') document.documentElement.classList.add('senza-aereo'); } catch (e) { /* niente archivio */ }
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
    stagioni();
    var b = document.getElementById('tema');
    if (b) {
      T.tema(T.temaAttuale, true);
      b.addEventListener('click', function () { T.cambiaTema({ auto: 'chiaro', chiaro: 'scuro', scuro: 'auto' }[T.temaAttuale]); });
    }
    var barra = document.querySelector('.barra');
    if (barra) {
      var segna = function () { barra.classList.toggle('staccata', window.scrollY > 4); };
      window.addEventListener('scroll', segna, { passive: true }); segna();
    }
  }
  /* stagioni e feste (js/calendario.js, js/disegni.js): il festone in cima alla barra, gli auguri dove c'è data-auguri,
     l'avviso dell'anteprima di un altro giorno */
  function stagioni() {
    var o = T.oggi || {}, barra = document.querySelector('.barra');
    var f = o.tema && barra && T.festone ? T.festone(o.tema) : '';
    if (f) {
      barra.insertAdjacentHTML('afterbegin', '<div class="festone" aria-hidden="true">' + f + '</div>');
      document.documentElement.classList.add('con-festone');
    }
    Array.prototype.forEach.call(document.querySelectorAll('[data-auguri]'), function (el) {
      if (o.tema && o.auguri) {
        var simbolo = o.ha && o.ha('befana') ? 'befana' : o.tema;        // il 6 gennaio la calza, come nella scena
        el.innerHTML = (T.ornamento ? T.ornamento(simbolo) : '') + '<span>' + T.esc(o.auguri) + '</span>';
        el.hidden = false;
      }
      el.removeAttribute('data-auguri');
    });
    var main = document.querySelector('main');
    if (o.prova && main) {
      var giorno = o.prova.split('-').reverse().join('/');
      var nome = ((T.prove ? T.prove(+o.prova.slice(0, 4)) : []).filter(function (x) { return x[2] === o.prova; })[0] || [])[1];
      main.insertAdjacentHTML('afterbegin', '<div class="anteprima" role="status">' + T.icona('scintille') + '<span>Anteprima: <b>' +
        T.esc(nome ? nome + ' (' + giorno + ')' : giorno) + '</b></span><button class="btn sm" type="button" data-prova="fine">Torna a oggi</button></div>');
    }
  }
  document.addEventListener('click', function (ev) {
    if (ev.target.closest && ev.target.closest('[data-prova="fine"]') && T.provaGiorno) T.provaGiorno('');
  });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', prepara); else prepara();
})();
