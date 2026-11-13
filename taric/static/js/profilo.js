/* MAGIC HS - vista Profilo: nome, preferenze, uso dell'IA, storico, preferiti (tutto resta su questo PC). */
(function () {
  'use strict';
  var T = window.TARIC, esc = T.esc;
  var el = document.getElementById('view-profilo');
  var st = { storico: [], totale: 0, finito: false, preferiti: [], filtro: '', caricato: false, msg: {} };
  var vista = T.viste = T.viste || {};

  function $(s) { return el.querySelector(s); }
  function app() { return T.app; }
  function u() { return app().utente(); }
  function messaggio(dove, testo, ok) { st.msg[dove] = testo ? { testo: testo, ok: !!ok } : null; }
  function riga(dove) { var m = st.msg[dove]; return m ? '<p class="' + (m.ok ? 'esito-ok' : 'errore') + '">' + esc(m.testo) + '</p>' : ''; }

  function carica() {
    st.caricato = true; st.finito = false;
    return Promise.all([
      T.api('GET', '/api/storico?limite=50').then(function (r) { st.storico = r.voci; st.totale = r.totale; st.finito = r.voci.length >= r.totale; }),
      T.api('GET', '/api/preferiti').then(function (r) { st.preferiti = r.voci; }),
      app().aggiornaIo()
    ]).then(disegna, function (e) { el.innerHTML = '<p class="errore">' + esc(e.errore || 'Profilo non disponibile.') + '</p>'; });
  }

  vista.profilo = {
    daRicaricare: false,
    mostra: function () {
      if (!u()) return;
      if (!st.caricato || vista.profilo.daRicaricare) { vista.profilo.daRicaricare = false; disegna(); carica(); }
      else disegna();
    }
  };

  /* ------------------------------------------------------------------ disegno */
  function disegna() {
    var io = u(); if (!io) return;
    var p = io.preferenze, h = '';

    h += usoIA(io);

    h += '<div class="foglio"><div class="box"><div class="lab">' + T.icona('utente') + 'Il tuo nome' +
      '<span class="dx">' + (io.locale.editore ? 'gestisci MAGIC HS' : '') + '</span></div>' +
      '<form class="modulo" data-p="salva-account"><div class="due">' +
      '<label>Nome e cognome<input class="campo" name="nome" required minlength="2" maxlength="100" value="' + esc(io.nome) + '"></label>' +
      '<label>Azienda<input class="campo" name="azienda" maxlength="150" value="' + esc(io.azienda) + '"></label></div>' +
      '<p class="nota">Nome utente di Windows: <b>' + esc(io.locale.utente || '?') + '</b></p>' +
      '<div class="fila"><button class="btn pri" type="submit">Salva</button></div>' + riga('account') + '</form></div></div>';


    var paesi = app().paesi();
    h += '<div class="foglio"><div class="box"><div class="lab">' + T.icona('gestione') + 'Preferenze</div><div class="modulo"><div class="due">' +
      '<label>Paese d\'origine predefinito<select class="campo" data-p="pref" name="paese"><option value="">Nessuno: tutti i paesi terzi</option>' +
      paesi.map(function (x) { return '<option value="' + esc(x[1]) + '"' + (x[1] === p.paese ? ' selected' : '') + '>' + esc(x[0]) + '</option>'; }).join('') + '</select></label>' +
      '<label>Flusso predefinito<select class="campo" data-p="pref" name="flusso"><option value="import"' + (p.flusso !== 'export' ? ' selected' : '') + '>Importazione</option><option value="export"' + (p.flusso === 'export' ? ' selected' : '') + '>Esportazione</option></select></label>' +
      '<label>Tema<select class="campo" data-p="pref" name="tema"><option value="auto"' + (p.tema === 'auto' ? ' selected' : '') + '>Come il dispositivo</option><option value="chiaro"' + (p.tema === 'chiaro' ? ' selected' : '') + '>Chiaro</option><option value="scuro"' + (p.tema === 'scuro' ? ' selected' : '') + '>Scuro</option></select></label>' +
      '</div></div></div></div>';

    h += '<div class="foglio"><div class="box"><div class="lab">' + T.icona('storico') + 'Storico delle classificazioni<span class="dx">' + st.totale + ' salvate</span></div>';
    if (!st.caricato) h += '<p class="vuoto">Carico…</p>';
    else if (!st.storico.length) h += '<p class="vuoto">' + T.icona('nave') + 'Ancora nessuna classificazione.</p>';
    else {
      h += '<div class="fila"><input class="campo" type="search" data-p="filtro" placeholder="Filtra per descrizione o codice" value="' + esc(st.filtro) + '"></div><div class="elenco" id="elenco-storico">' + righeStorico() + '</div>';
      h += '<div class="fila">' + (st.finito ? '' : '<button class="btn sm" type="button" data-p="altre">Mostra le precedenti</button>') +
        '<button class="btn sm" type="button" data-p="svuota">Svuota lo storico</button></div>';
    }
    h += '</div></div>';

    h += '<div class="foglio"><div class="box"><div class="lab">' + T.icona('stella') + 'Voci preferite<span class="dx">' + st.preferiti.length + '</span></div>';
    if (!st.caricato) h += '<p class="vuoto">Carico…</p>';
    else if (!st.preferiti.length) h += '<p class="vuoto">' + T.icona('container') + 'Nessuna voce preferita.</p>';
    else h += '<div class="elenco">' + st.preferiti.map(rigaPreferito).join('') + '</div>';
    h += '</div></div>';

    el.innerHTML = h;
  }

  /* ------------------------------------------------------------------ uso dell'IA */
  function usoIA(io) {
    var ia = io.ia, h = '<div class="foglio"><div class="box piano"><div class="lab">' + T.icona('scintille') + 'Classificazione assistita</div>';
    if (!ia.configurata) h += '<p class="nota">Non è attiva: ' + (io.locale.editore ? 'scegli un servizio in Gestione, «Intelligenza artificiale».' : 'chi gestisce MAGIC HS non ha ancora scelto un servizio.') + '</p>';
    else if (ia.limite === null) h += '<p class="cosa">' + ia.usate + ' richieste a ' + esc(meseIt(ia.mese)) + '</p><p class="nota">Senza limite mensile.</p>';
    else {
      var perc = ia.limite ? Math.min(100, Math.round(ia.usate / ia.limite * 100)) : 100;
      h += '<p class="cosa">' + ia.usate + ' di ' + ia.limite + ' richieste all\'IA usate a ' + esc(meseIt(ia.mese)) + '</p>' +
        '<div class="metro' + (perc >= 100 ? ' pieno' : '') + '"><i style="width:' + perc + '%"></i></div>' +
        '<p class="nota">Il conteggio riparte il primo del mese.</p>';
    }
    return h + '</div></div>';
  }

  function meseIt(m) {
    var nomi = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
    var x = /^(\d{4})-(\d{2})$/.exec(m || ''); return x ? nomi[+x[2] - 1] + ' ' + x[1] : '';
  }
  function righeStorico() {
    var f = st.filtro.toLowerCase().replace(/\s+/g, '');
    var vis = st.storico.filter(function (v) { return !f || (v.testo + v.codice).toLowerCase().replace(/\s+/g, '').indexOf(f) >= 0; });
    if (!vis.length) return '<p class="vuoto">Nessuna classificazione corrisponde al filtro.</p>';
    return vis.map(function (v) {
      var d = v.codice ? app().descrizione(v.codice) : '';
      return '<div class="voce"><div class="t">' + esc(v.testo) + '</div><div class="azioni">' +
        '<button class="btn sm" type="button" data-p="apri-storico" data-id="' + v.id + '">Apri</button>' +
        '<button class="btn sm" type="button" data-p="cancella-storico" data-id="' + v.id + '" aria-label="Elimina questa classificazione">Elimina</button></div>' +
        '<div class="m"><span class="cod">' + esc(T.grp(v.codice)) + '</span> ' + esc(d.slice(0, 90)) + ' · ' + esc(T.dataOra(v.quando)) + '</div></div>';
    }).join('');
  }
  function rigaPreferito(v) {
    var d = app().descrizione(v.codice), perc = app().percorso(v.codice);
    var titolo = perc.length > 1 ? perc[perc.length - 2] + ' › ' + d : d;
    return '<div class="voce"><div><span class="cod">' + esc(T.grp(v.codice)) + '</span> <span class="t">' + esc((titolo || 'codice non presente nei dati attuali').slice(0, 160)) + '</span></div>' +
      '<div class="azioni"><button class="btn sm" type="button" data-p="apri-codice" data-c="' + esc(v.codice) + '">Apri</button>' +
      '<button class="btn sm" type="button" data-p="togli-preferito" data-c="' + esc(v.codice) + '">Togli</button></div>' +
      '<form class="fila" data-p="nota" data-c="' + esc(v.codice) + '"><input class="campo" name="nota" maxlength="500" placeholder="Nota personale (cliente, articolo, osservazioni)" value="' + esc(v.nota) + '">' +
      '<button class="btn sm" type="submit">Salva nota</button></form></div>';
  }

  /* ------------------------------------------------------------------ azioni */
  el.addEventListener('submit', function (ev) {
    var f = ev.target, azione = f.getAttribute('data-p');
    if (!azione) return;
    ev.preventDefault();
    var dati = new FormData(f);
    if (azione === 'salva-account') {
      T.api('PUT', '/api/io', { nome: dati.get('nome'), azienda: dati.get('azienda') }).then(function () {
        messaggio('account', 'Dati salvati.', true); document.getElementById('chi-nome').textContent = dati.get('nome');
        return app().aggiornaIo();
      }, function (e) { messaggio('account', e.errore); }).then(disegna);
    } else if (azione === 'nota') {
      var c = f.getAttribute('data-c'), nota = String(dati.get('nota') || '');
      T.api('PUT', '/api/preferiti/' + c, { nota: nota }).then(function () {
        st.preferiti.forEach(function (v) { if (v.codice === c) v.nota = nota; });
        if (app().preferiti[c]) app().preferiti[c].nota = nota;
        T.avviso('Nota salvata.');
      }, function (e) { T.avviso(e.errore, 'male'); });
    }
  });

  el.addEventListener('change', function (ev) {
    if (ev.target.getAttribute('data-p') !== 'pref') return;
    var io = u(), p = { paese: io.preferenze.paese, flusso: io.preferenze.flusso, tema: io.preferenze.tema };
    p[ev.target.name] = ev.target.value;
    T.api('PUT', '/api/io/preferenze', p).then(function () {
      io.preferenze = p; app().preferenze(p); T.avviso('Preferenza salvata.');
    }, function (e) { T.avviso(e.errore, 'male'); });
  });

  el.addEventListener('input', function (ev) {
    if (ev.target.getAttribute('data-p') !== 'filtro') return;
    st.filtro = ev.target.value;
    var box = document.getElementById('elenco-storico'); if (box) box.innerHTML = righeStorico();
  });

  el.addEventListener('click', function (ev) {
    var b = ev.target.closest('[data-p]');
    if (!b || b.tagName === 'FORM' || b.tagName === 'INPUT' || b.tagName === 'SELECT') return;
    var azione = b.getAttribute('data-p'), id = b.getAttribute('data-id'), c = b.getAttribute('data-c');
    if (azione === 'apri-storico') {
      T.api('GET', '/api/storico/' + id).then(function (r) { app().apriClassificazione(r.dati); }, function (e) { T.avviso(e.errore, 'male'); });
    } else if (azione === 'cancella-storico') {
      T.api('DELETE', '/api/storico/' + id).then(function () {
        st.storico = st.storico.filter(function (v) { return String(v.id) !== id; }); st.totale--; disegna();
      }, function (e) { T.avviso(e.errore, 'male'); });
    } else if (azione === 'svuota') {
      if (!window.confirm('Eliminare tutte le ' + st.totale + ' classificazioni salvate? Non si possono recuperare.')) return;
      T.api('DELETE', '/api/storico').then(function () { st.storico = []; st.totale = 0; st.finito = true; disegna(); T.avviso('Storico svuotato.'); },
        function (e) { T.avviso(e.errore, 'male'); });
    } else if (azione === 'altre') {
      var ultimo = st.storico.length ? st.storico[st.storico.length - 1].id : 0;
      T.api('GET', '/api/storico?limite=50&prima=' + ultimo).then(function (r) {
        st.storico = st.storico.concat(r.voci); st.finito = st.storico.length >= r.totale || !r.voci.length; disegna();
      });
    } else if (azione === 'apri-codice') {
      app().apriCodice(c);
    } else if (azione === 'togli-preferito') {
      T.api('DELETE', '/api/preferiti/' + c).then(function () {
        st.preferiti = st.preferiti.filter(function (v) { return v.codice !== c; }); delete app().preferiti[c]; disegna();
      }, function (e) { T.avviso(e.errore, 'male'); });
    }
  });
})();
