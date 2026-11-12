/* MAGIC HS - vista Profilo: account, preferenze, uso dell'IA, storico, preferiti, sicurezza. */
(function () {
  'use strict';
  var T = window.TARIC, esc = T.esc;
  var el = document.getElementById('view-profilo');
  var st = { storico: [], totale: 0, finito: false, preferiti: [], filtro: '', caricato: false, msg: {}, piani: null, scelta: 'mese', invio: false };
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
      T.api('GET', '/api/piani').then(function (r) { st.piani = r; }, function () { st.piani = null; }),
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
    var p = io.preferenze, ia = io.ia, h = '';

    h += piano(io);

    h += '<div class="foglio"><div class="box"><div class="lab">' + T.icona('utente') + 'Il tuo account<span class="dx">' + esc(io.ruolo === 'amministratore' ? 'amministratore' : 'utente') + '</span></div>' +
      '<form class="modulo" data-p="salva-account"><div class="due">' +
      '<label>Nome e cognome<input class="campo" name="nome" required minlength="2" maxlength="100" value="' + esc(io.nome) + '"></label>' +
      '<label>Azienda<input class="campo" name="azienda" maxlength="150" value="' + esc(io.azienda) + '"></label></div>' +
      '<label>Email (per cambiarla chiedi all\'amministratore)<input class="campo" value="' + esc(io.email) + '" disabled></label>' +
      '<div class="fila"><button class="btn pri" type="submit">Salva</button></div>' + riga('account') + '</form></div></div>';


    var paesi = app().paesi();
    h += '<div class="foglio"><div class="box"><div class="lab">' + T.icona('gestione') + 'Preferenze</div><div class="modulo"><div class="due">' +
      '<label>Paese d\'origine predefinito<select class="campo" data-p="pref" name="paese"><option value="">Nessuno: tutti i paesi terzi</option>' +
      paesi.map(function (x) { return '<option value="' + esc(x[1]) + '"' + (x[1] === p.paese ? ' selected' : '') + '>' + esc(x[0]) + '</option>'; }).join('') + '</select></label>' +
      '<label>Flusso predefinito<select class="campo" data-p="pref" name="flusso"><option value="import"' + (p.flusso !== 'export' ? ' selected' : '') + '>Importazione</option><option value="export"' + (p.flusso === 'export' ? ' selected' : '') + '>Esportazione</option></select></label>' +
      '<label>Tema<select class="campo" data-p="pref" name="tema"><option value="auto"' + (p.tema === 'auto' ? ' selected' : '') + '>Come il dispositivo</option><option value="chiaro"' + (p.tema === 'chiaro' ? ' selected' : '') + '>Chiaro</option><option value="scuro"' + (p.tema === 'scuro' ? ' selected' : '') + '>Scuro</option></select></label>' +
      '</div><p class="nota">Il paese e il flusso si aggiornano anche quando li cambi nel risultato di una classificazione.</p></div></div></div>';

    h += '<div class="foglio"><div class="box"><div class="lab">' + T.icona('storico') + 'Storico delle classificazioni<span class="dx">' + st.totale + ' salvate</span></div>';
    if (!st.caricato) h += '<p class="vuoto">Carico…</p>';
    else if (!st.storico.length) h += '<p class="vuoto">Ancora nessuna classificazione: quelle che fai nella scheda Classifica vengono salvate qui.</p>';
    else {
      h += '<div class="fila"><input class="campo" type="search" data-p="filtro" placeholder="Filtra per descrizione o codice" value="' + esc(st.filtro) + '"></div><div class="elenco" id="elenco-storico">' + righeStorico() + '</div>';
      h += '<div class="fila">' + (st.finito ? '' : '<button class="btn sm" type="button" data-p="altre">Mostra le precedenti</button>') +
        '<button class="btn sm" type="button" data-p="svuota">Svuota lo storico</button></div>';
    }
    h += '</div></div>';

    h += '<div class="foglio"><div class="box"><div class="lab">' + T.icona('stella') + 'Voci preferite<span class="dx">' + st.preferiti.length + '</span></div>';
    if (!st.caricato) h += '<p class="vuoto">Carico…</p>';
    else if (!st.preferiti.length) h += '<p class="vuoto">Nessuna voce preferita. Nel risultato di una classificazione premi «Aggiungi ai preferiti».</p>';
    else h += '<div class="elenco">' + st.preferiti.map(rigaPreferito).join('') + '</div>';
    h += '</div></div>';

    h += '<div class="foglio"><div class="box s8"><div class="lab">' + T.icona('chiave') + 'Cambia password</div>' +
      '<form class="modulo" data-p="password"><div class="due">' +
      '<label>Password attuale<input class="campo" type="password" name="attuale" autocomplete="current-password" required></label>' +
      '<label>Nuova password (almeno 10 caratteri)<input class="campo" type="password" name="nuova" autocomplete="new-password" required minlength="10"></label></div>' +
      '<div class="fila"><button class="btn pri" type="submit">Cambia password</button></div>' + riga('password') + '</form></div>' +
      '<div class="box s4"><div class="lab">' + T.icona('lucchetto') + 'Dispositivi</div><p class="nota">Se hai usato MAGIC HS su un computer non tuo, chiudi le altre sessioni: resterai collegato solo qui.</p>' +
      '<div class="fila"><button class="btn" type="button" data-p="esci-ovunque">Esci dagli altri dispositivi</button></div>' + riga('dispositivi') + '</div></div>';

    el.innerHTML = h;
  }

  /* ------------------------------------------------------------------ piano Gratis / Pro */
  var NOMI = { giorno: '1 giorno', settimana: '1 settimana', mese: 'Mensile', anno: 'Annuale' };
  var NOTE = { giorno: 'pagamento singolo, nessun rinnovo', settimana: 'pagamento singolo, nessun rinnovo', mese: 'si rinnova ogni mese, disdici quando vuoi', anno: 'si rinnova ogni anno' };
  function euro(c) { return (c / 100).toFixed(c % 100 ? 2 : 0).replace('.', ',') + ' €'; }
  function giorno(iso, meno) { var d = new Date(iso); if (meno) d = new Date(d.getTime() - meno * 86400000); return T.dataOra(d.toISOString(), true); }

  function piano(io) {
    var pi = io.piano || {}, ia = io.ia, ab = pi.abbonamento, offerte = st.piani && st.piani.attivi, h = '';
    var admin = io.ruolo === 'amministratore' && ia.limite === null && !pi.pro;
    h += '<div class="foglio"><div class="box piano' + (pi.pro ? ' e-pro' : '') + '"><div class="lab">' + T.icona(pi.pro ? 'timbro' : 'scintille') + 'Il tuo piano' +
      '<span class="dx"><span class="marca ' + (pi.pro ? 'pro' : 'gratis') + '">' + (pi.pro ? 'Pro' : admin ? 'Amministratore' : 'Gratis') + '</span></span></div>';
    if (!ia.configurata) h += '<p class="nota">La classificazione assistita non è attiva su questo server; nomenclatura e misure sono consultabili senza limiti.</p>';
    else if (pi.pro) {
      if (pi.origine === 'abbonamento' && ab) {
        h += '<p class="cosa">Pro ' + (ab.piano === 'anno' ? 'annuale' : 'mensile') + ': ' + (ab.rinnovo_annullato ? 'disdetto, resta attivo fino al ' + giorno(pi.fino) : 'si rinnova il ' + giorno(pi.fino, 1)) + '</p>';
        if (ab.stato === 'past_due') h += '<p class="avviso">L\'ultimo addebito non è riuscito: aggiorna la carta da «Gestisci abbonamento», altrimenti il Pro si ferma tra pochi giorni.</p>';
      } else if (pi.origine === 'manuale') h += '<p class="cosa">Pro concesso dall\'amministratore fino al ' + giorno(pi.fino) + '</p>';
      else h += '<p class="cosa">Pro attivo fino al ' + esc(T.dataOra(pi.fino)) + '</p>';
      h += '<p class="nota">Richieste all\'IA senza limite mensile (' + ia.usate + ' a ' + esc(meseIt(ia.mese)) + ')' +
        (ia.tetto_giorno ? ', con un tetto di sicurezza di ' + ia.tetto_giorno + ' nelle 24 ore' : '') + '. Nomenclatura e misure sono sempre illimitate.</p>';
      if (pi.gestibile && ab) h += '<div class="fila"><button class="btn" type="button" data-p="gestisci">' + T.icona('gestione') + 'Gestisci abbonamento e fatture</button>' +
        '<span class="nota">Carta, ricevute e disdetta, sulla pagina sicura di Stripe.</span></div>' + riga('gestisci');
    } else if (admin) {
      h += '<p class="cosa">' + ia.usate + ' richieste a ' + esc(meseIt(ia.mese)) + '</p><p class="nota">Come amministratore usi l\'IA senza limiti.</p>';
    } else {
      var perc = ia.limite ? Math.min(100, Math.round(ia.usate / ia.limite * 100)) : 100;
      h += '<p class="cosa">' + ia.usate + ' di ' + ia.limite + ' richieste all\'IA usate a ' + esc(meseIt(ia.mese)) + '</p>' +
        '<div class="metro' + (perc >= 100 ? ' pieno' : '') + '"><i style="width:' + perc + '%"></i></div>' +
        '<p class="nota">Una classificazione usa di solito 2 o 3 richieste e il conteggio riparte il primo del mese. Nomenclatura, misure e documenti sono sempre illimitati.</p>';
      if (!offerte) h += '<p class="nota">Per avere richieste illimitate chiedi all\'amministratore.</p>';
    }
    var conAbbonamento = ab && ab.attivo;
    if (offerte && ia.configurata && !conAbbonamento && !admin) h += offerta(pi);
    return h + '</div></div>';
  }

  function offerta(pi) {
    var P = st.piani, vendibili = P.piani.filter(function (x) { return x.prezzo > 0; });
    if (!vendibili.length) return '';
    if (!vendibili.some(function (x) { return x.id === st.scelta; })) st.scelta = vendibili[vendibili.length > 2 ? 2 : 0].id;
    var mese = P.piani.filter(function (x) { return x.id === 'mese'; })[0];
    var h = '<form class="offerta" data-p="paga"><p class="titolo-offerta">' + (pi.pro ? 'Prolunga il Pro' : 'Passa a Pro: richieste all\'IA senza limite mensile') + '</p>' +
      '<div class="tagli" role="radiogroup" aria-label="Durata del piano Pro">';
    vendibili.forEach(function (x) {
      var extra = '';
      if (x.id === 'anno' && mese && mese.prezzo) {
        var risparmio = Math.round(100 - x.prezzo / (mese.prezzo * 12) * 100);
        extra = risparmio >= 5 ? '<span class="t-badge">−' + risparmio + '%</span>' : '';
      }
      h += '<label class="taglio' + (st.scelta === x.id ? ' scelto' : '') + '"><input type="radio" name="piano" value="' + x.id + '"' + (st.scelta === x.id ? ' checked' : '') + '>' +
        '<span class="t-nome">' + NOMI[x.id] + extra + '</span><span class="t-prezzo">' + euro(x.prezzo) + (x.abbonamento ? '<small>' + (x.id === 'anno' ? '/anno' : '/mese') + '</small>' : '') + '</span>' +
        '<span class="t-nota">' + (x.id === 'anno' ? euro(Math.round(x.prezzo / 12)) + ' al mese, ' : '') + NOTE[x.id] + '</span></label>';
    });
    h += '</div><label class="spunta"><input type="checkbox" name="recesso"> Chiedo che il Pro si attivi subito, prima della fine dei 14 giorni previsti per il recesso, e prendo atto che, una volta che il servizio è stato interamente fornito, perdo il diritto di recesso.</label>' +
      '<div class="fila"><button class="btn pri" type="submit"' + (st.invio ? ' disabled' : '') + '>' + T.icona('lucchetto') + (st.invio ? 'Apro la pagina di pagamento…' : 'Vai al pagamento') + '</button>' +
      '<span class="nota">Paghi con carta sulla pagina sicura di Stripe: i dati della carta non passano da MAGIC HS. <a href="/condizioni" target="_blank" rel="noopener">Condizioni di vendita</a></span></div>' +
      (P.prova ? '<p class="avviso">Pagamenti in modalità di prova: nessun addebito vero. Per provare usa la carta 4242 4242 4242 4242, una scadenza futura e un CVC qualsiasi.</p>' : '') +
      riga('paga') + '</form>';
    return h;
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
    } else if (azione === 'password') {
      T.api('POST', '/api/io/password', { attuale: dati.get('attuale'), nuova: dati.get('nuova') }).then(function () {
        messaggio('password', 'Password cambiata. Le altre sessioni sono state chiuse.', true);
      }, function (e) { messaggio('password', e.errore); }).then(disegna);
    } else if (azione === 'paga') {
      if (!dati.get('recesso')) { messaggio('paga', 'Per continuare conferma la richiesta di attivazione immediata.'); disegna(); return; }
      st.invio = true; messaggio('paga', ''); disegna();
      T.api('POST', '/api/pagamento/inizia', { piano: String(dati.get('piano') || st.scelta), rinuncia_recesso: true }).then(function (r) {
        window.location.href = r.url;
      }, function (e) { st.invio = false; messaggio('paga', e.errore); disegna(); });
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
    if (ev.target.name === 'piano' && ev.target.type === 'radio') {
      st.scelta = ev.target.value;
      Array.prototype.forEach.call(el.querySelectorAll('.taglio'), function (t) { t.classList.toggle('scelto', t.querySelector('input').checked); });
      return;
    }
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
    } else if (azione === 'gestisci') {
      b.disabled = true;
      T.api('POST', '/api/pagamento/gestisci').then(function (r) { window.location.href = r.url; },
        function (e) { b.disabled = false; messaggio('gestisci', e.errore); disegna(); });
    } else if (azione === 'esci-ovunque') {
      T.api('POST', '/api/io/esci-ovunque').then(function () { messaggio('dispositivi', 'Fatto: le altre sessioni sono chiuse.', true); disegna(); },
        function (e) { messaggio('dispositivi', e.errore); disegna(); });
    }
  });
})();
