/* MAGIC HS - vista Gestione, per chi pubblica per i colleghi: cartella condivisa, intelligenza artificiale,
   dati TARIC, registro degli eventi. */
(function () {
  'use strict';
  var T = window.TARIC, esc = T.esc;
  var el = document.getElementById('view-gestione');
  var vista = T.viste = T.viste || {};
  var st = { sotto: 'condivisa', riep: null, dati: null, eventi: [], msg: {}, registro: null, timer: null, loc: null, cambiaChiave: false };

  var ESITI = { ok: 'riuscito', errore: 'errore', non_disponibile: 'non ancora disponibile', in_corso: 'in corso', interrotto: 'interrotto' };
  var EVENTI = {
    dati_ok: 'Dati TARIC installati', dati_errore: 'Aggiornamento dati non riuscito', dati_non_disponibile: 'Estrazione non ancora disponibile',
    dati_versione_attivata: 'Versione dati cambiata', impostazioni_ia: 'Intelligenza artificiale cambiata',
    programma_pubblicato: 'Nuova versione del programma pubblicata', editori: 'Chi può pubblicare cambiato'
  };
  var FORNITORI = [['', 'Nessuno: solo consultazione'], ['openai', 'Azure OpenAI o altro servizio compatibile OpenAI'], ['gemini', 'Google Gemini'], ['anthropic', 'Anthropic Claude']];

  function app() { return T.app; }
  function riga(dove) { var m = st.msg[dove]; return m ? '<p class="' + (m.ok ? 'esito-ok' : 'errore') + '">' + esc(m.testo) + '</p>' : ''; }
  function msg(dove, testo, ok) { st.msg[dove] = testo ? { testo: testo, ok: !!ok } : null; }
  function errore(e) { return (e && e.errore) || 'Operazione non riuscita.'; }

  vista.gestione = { mostra: function () { disegna(); carica(); } };

  function carica() {
    var chiamate = [T.api('GET', '/api/admin/riepilogo').then(function (r) { st.riep = r; })];
    if (st.sotto !== 'registro') chiamate.push(T.api('GET', '/api/admin/locale').then(function (r) { st.loc = r; }));
    if (st.sotto === 'dati') chiamate.push(T.api('GET', '/api/admin/dati').then(function (r) { st.dati = r; }));
    if (st.sotto === 'registro') chiamate.push(T.api('GET', '/api/admin/eventi?limite=300').then(function (r) { st.eventi = r.eventi; }));
    return Promise.all(chiamate).then(disegna, function (e) { el.innerHTML = '<p class="errore">' + esc(errore(e)) + '</p>'; });
  }

  /* ------------------------------------------------------------------ disegno */
  function disegna() {
    var r = st.riep, h = '';
    var schede = [['condivisa', 'Cartella condivisa', 'cartella'], ['ia', 'Intelligenza artificiale', 'scintille'], ['dati', 'Dati TARIC', 'database'], ['registro', 'Registro', 'registro']];
    h += '<div class="sotto" role="tablist">' + schede.map(function (x) {
      return '<button class="btn sm" type="button" data-g="sotto" data-v="' + x[0] + '"' + (st.sotto === x[0] ? ' aria-current="page"' : '') + '>' + T.icona(x[2]) + x[1] + '</button>';
    }).join('') + '</div>';
    if (r) h += avvisi(r);
    h += { dati: dati, registro: registro, condivisa: condivisa, ia: iaLocale }[st.sotto]();
    el.innerHTML = h;
    pianificaRinfresco();
  }

  function avvisi(r) {
    var a = [];
    if (st.loc && !st.loc.raggiungibile) a.push('Non trovo la cartella condivisa: controlla che OneDrive sia attivo e sincronizzato.');
    else if (st.loc && !st.loc.scrivibile) a.push('Da questo PC non puoi scrivere nella cartella condivisa: serve il permesso di modifica per pubblicare.');
    if (!r.ia && st.sotto !== 'ia') a.push('La classificazione assistita è spenta per tutti: scegli un servizio nella scheda Intelligenza artificiale.');
    if (!r.dati) a.push('Non ci sono ancora dati TARIC: vai su Dati TARIC.');
    return a.length ? '<div class="foglio"><div class="box"><div class="lab">' + T.icona('attenzione') + 'Da sistemare</div>' + a.map(function (t) { return '<p class="avviso">' + esc(t) + '</p>'; }).join('') + '</div></div>' : '';
  }

  /* ---------- dati TARIC ---------- */
  function dati() {
    var d = st.dati;
    if (!d) return '<p class="vuoto">Carico…</p>';
    var h = '<div class="foglio"><div class="box s8"><div class="lab">' + T.icona('database') + 'Dati in uso</div>';
    var att = d.versioni.filter(function (v) { return v.attiva; })[0];
    if (att) h += '<p class="cosa">Situazione al ' + esc(att.data.split('-').reverse().join('/')) + '</p><p class="nota">' + (att.righe || '?') + ' righe di nomenclatura, ' + (att.dichiarabili || '?') +
      ' codici dichiarabili, ' + (att.misure_import || '?') + ' misure all\'importazione e ' + (att.misure_export || '?') + ' all\'esportazione; ' + (att.righe_en || 0) + ' righe ancora in inglese.</p>' +
      (att.avvisi && att.avvisi.length ? '<p class="avviso">' + esc(att.avvisi.join(' · ')) + '</p>' : '');
    else h += '<p class="avviso">Nessun dato installato.</p>';
    if (d.in_corso) h += '<p class="esito-ok">Aggiornamento di ' + esc(d.in_corso.mese) + ' in corso: ' + esc(d.in_corso.fase) + '…</p>';
    if (st.loc) h += '<p class="nota">Pubblicati per i colleghi nella cartella condivisa: <b>' + esc(st.loc.dati.pubblicati ? st.loc.dati.pubblicati.split('-').reverse().join('/') : 'nessuno') + '</b>.</p>';
    h += (d.prossimo ? '<p class="nota">Prossimo tentativo per ' + esc(d.prossimo) + ' entro dieci minuti.</p>' : '') + '</div>';
    h += '<div class="box s4"><div class="lab">' + T.icona('aggiorna') + 'Aggiorna adesso</div><form class="modulo" data-g="aggiorna"><label>Mese (vuoto = corrente)<input class="campo" name="mese" placeholder="AAAA-MM" pattern="\\d{4}-\\d{2}"></label>' +
      '<div class="fila"><button class="btn pri" type="submit"' + (d.in_corso ? ' disabled' : '') + '>Scarica e installa</button></div>' + riga('aggiorna') + '</form></div></div>';

    h += '<div class="foglio"><div class="box"><div class="lab">' + T.icona('carica') + 'Carica a mano un\'estrazione</div><p class="nota">I file Excel del mese (CIRCABC «TARIC and Quota data and information») in un archivio .zip.</p>' +
      '<form class="modulo" data-g="carica"><div class="due"><label>Archivio .zip<input class="campo" type="file" name="file" accept=".zip,application/zip" required></label>' +
      '<label>Mese dell\'estrazione<input class="campo" name="mese" placeholder="AAAA-MM" pattern="\\d{4}-\\d{2}"></label></div>' +
      '<div class="fila"><button class="btn" type="submit"' + (d.in_corso ? ' disabled' : '') + '>Carica e installa</button></div>' + riga('carica') + '</form></div></div>';

    h += '<div class="foglio"><div class="box"><div class="lab">' + T.icona('pacco') + 'Versioni installate</div><div class="scorri"><table class="tab"><thead><tr><th>Situazione al</th><th class="n">Righe</th><th class="n">Misure import</th><th>Generata</th><th></th></tr></thead><tbody>' +
      d.versioni.map(function (v) {
        return '<tr' + (v.attiva ? ' class="evid"' : '') + '><td>' + esc(v.versione.split('-').reverse().join('/')) + (v.attiva ? ' <span class="st ok">in uso</span>' : '') + '</td><td class="n" data-l="Righe">' + (v.righe || '') + '</td><td class="n" data-l="Misure import">' + (v.misure_import || '') +
          '</td><td data-l="Generata">' + esc(T.dataOra(v.generato)) + '</td><td class="azioni"><button class="btn sm" type="button" data-g="riepilogo" data-v="' + esc(v.versione) + '">Riepilogo</button>' +
          (v.attiva ? '' : '<button class="btn sm" type="button" data-g="usa" data-v="' + esc(v.versione) + '">Usa questa</button>') + '</td></tr>';
      }).join('') + '</tbody></table></div></div></div>';

    h += '<div class="foglio"><div class="box"><div class="lab">' + T.icona('storico') + 'Ultimi aggiornamenti</div><div class="scorri"><table class="tab"><thead><tr><th>Quando</th><th>Mese</th><th>Origine</th><th>Esito</th><th>Messaggio</th><th></th></tr></thead><tbody>' +
      d.ultimi.map(function (a) {
        return '<tr><td>' + esc(T.dataOra(a.iniziato)) + '</td><td data-l="Mese">' + esc(a.mese) + '</td><td data-l="Origine">' + esc(a.origine.replace(/_/g, ' ')) + '</td><td data-l="Esito"><span class="st ' + a.esito + '">' + (ESITI[a.esito] || a.esito) + '</span></td><td>' + esc(a.messaggio) + '</td>' +
          '<td>' + (a.esito === 'errore' || a.esito === 'ok' ? '<button class="btn sm" type="button" data-g="registro-agg" data-id="' + a.id + '">Registro</button>' : '') + '</td></tr>';
      }).join('') + '</tbody></table></div>' + (d.ultimi.length ? '' : '<p class="vuoto">Nessun aggiornamento ancora.</p>') +
      (st.registro ? '<div class="lab" style="margin-top:8px">' + esc(st.registro.titolo) + '<span class="dx"><button class="link" type="button" data-g="chiudi-registro">chiudi</button></span></div><pre class="registro">' + esc(st.registro.testo) + '</pre>' : '') + '</div></div>';
    return h;
  }


  /* ---------- programma sul PC: cartella condivisa ---------- */
  function data(v) { return v ? v.split('-').reverse().join('/') : 'nessuno'; }
  function condivisa() {
    var L = st.loc;
    if (!L) return '<p class="vuoto">Carico…</p>';
    var h = '<div class="foglio"><div class="box s8"><div class="lab">' + T.icona('cartella') + 'Cartella condivisa</div>' +
      '<p class="cosa percorso">' + esc(L.condivisa) + '</p>' +
      '<p class="nota">' + (L.editore ? 'Da questo PC pubblichi per tutti.' : 'Da questo PC la cartella è in sola lettura.') + '</p>' +
      '<table class="tab compatta"><thead><tr><th></th><th>Su questo PC</th><th>Pubblicato per tutti</th></tr></thead><tbody>' +
      '<tr><td>Programma</td><td data-l="Su questo PC">' + esc(L.programma.in_uso) + '</td><td data-l="Per tutti">' + esc(L.programma.pubblicato || 'nessuno') + '</td></tr>' +
      '<tr><td>Dati TARIC</td><td data-l="Su questo PC">' + esc(data(L.dati.in_uso)) + '</td><td data-l="Per tutti">' + esc(data(L.dati.pubblicati)) + '</td></tr></tbody></table></div>';
    h += '<div class="box s4"><div class="lab">' + T.icona('utenti') + 'Aggiungere un collega</div><ol class="passi">' +
      '<li>Dagli solo il permesso di <b>lettura</b>: visitatore del sito SharePoint, o «Può visualizzare» in Teams.</li>' +
      '<li>Il collega apre la cartella su SharePoint e preme «Sincronizza».</li>' +
      '<li>Poi fa doppio clic su <b>Avvia MAGIC HS</b>.</li></ol>' +
      '<p class="nota">La modifica solo a chi pubblica: chi può modificare la cartella cambia il programma di tutti. In Teams interrompi l\'ereditarietà delle autorizzazioni.</p></div></div>';
    var ed = L.editori || [];
    h += '<div class="foglio"><div class="box"><div class="lab">' + T.icona('scudo') + 'Chi può pubblicare<span class="dx">' + ed.length + '</span></div>' +
      '<p class="nota">Nomi utente di Windows (ognuno vede il suo in Profilo); serve anche il permesso di modifica sulla cartella.</p>' +
      '<div class="elenco">' + ed.map(function (n) {
        return '<div class="voce"><div><b>' + esc(n) + '</b>' + (n === L.utente ? ' <span class="st ok">tu</span>' : '') + '</div><div class="azioni">' +
          (ed.length > 1 ? '<button class="btn sm" type="button" data-g="editore-togli" data-v="' + esc(n) + '">Togli</button>' : '') + '</div></div>';
      }).join('') + '</div>' +
      '<form class="fila" data-g="editore-aggiungi"><input class="campo" name="utente" maxlength="64" required placeholder="Nome utente di Windows del collega" aria-label="Nome utente di Windows del collega">' +
      '<button class="btn" type="submit"' + (L.editore ? '' : ' disabled') + '>' + T.icona('piu') + 'Aggiungi</button></form>' + riga('editori') + '</div></div>';
    h += '<div class="foglio"><div class="box"><div class="lab">' + T.icona('pacco') + 'Nuova versione del programma</div>' +
      '<p class="nota">Il file <b>magic-hs-windows-….zip</b> dalla pagina delle versioni su GitHub.</p>' +
      '<form class="modulo" data-g="programma"><label>Pacchetto .zip<input class="campo" type="file" name="file" accept=".zip,application/zip" required></label>' +
      '<div class="fila"><button class="btn pri" type="submit"' + (L.editore ? '' : ' disabled') + '>' + T.icona('carica') + 'Pubblica per tutti</button></div>' + riga('programma') + '</form></div></div>';
    return h;
  }

  function salvaEditori(elenco, testo) {
    T.api('PUT', '/api/admin/locale/editori', { editori: elenco }).then(function (r) {
      msg('editori', testo, true);
      if (!r.editore) { T.avviso('Non pubblichi più da questo PC: ricarico la pagina.'); setTimeout(function () { location.hash = '#classifica'; location.reload(); }, 900); }
    }, function (e) { msg('editori', errore(e)); }).then(carica);
  }

  /* ---------- programma sul PC: intelligenza artificiale per tutti ---------- */
  function iaLocale() {
    var L = st.loc;
    if (!L) return '<p class="vuoto">Carico…</p>';
    var ia = L.ia, f = ia.fornitore;
    var h = '<div class="foglio"><div class="box s8"><div class="lab">' + T.icona('scintille') + 'Intelligenza artificiale per tutti' +
      '<span class="dx"><span class="st ' + (L.attiva ? 'ok' : 'sospeso') + '">' + (L.attiva ? 'attiva' : 'spenta') + '</span></span></div>' +
      '<form class="modulo" data-g="ia-locale">' +
      '<label>Servizio<select class="campo" name="fornitore" data-g="fornitore">' + FORNITORI.map(function (x) { return '<option value="' + x[0] + '"' + (x[0] === f ? ' selected' : '') + '>' + esc(x[1]) + '</option>'; }).join('') + '</select></label>';
    if (f) {
      if (f === 'openai') h += '<label>Indirizzo del servizio<input class="campo" name="url" value="' + esc(ia.url) + '" placeholder="https://nome-risorsa.openai.azure.com/openai/v1" required></label>';
      h += '<div class="due"><label>Modello' + (f === 'openai' ? ' (per Azure: nome della distribuzione)' : ' (vuoto = predefinito)') + '<input class="campo" name="modello" value="' + esc(ia.modello) + '"' + (f === 'openai' ? ' required' : '') + '></label>' +
        '<label>Modello rapido (vuoto = lo stesso)<input class="campo" name="modello_rapido" value="' + esc(ia.modello_rapido) + '"></label></div>';
      if (ia.chiave && !st.cambiaChiave) h += '<div class="fila"><span class="nota">Chiave salvata: ' + esc(ia.chiave) + '</span><button class="btn sm" type="button" data-g="cambia-chiave">Cambia chiave</button></div>';
      else h += '<label>Chiave del servizio<input class="campo" type="password" name="chiave" autocomplete="off"' + (f === 'openai' ? '' : ' required') + '></label>';
    }
    h += '<label>Richieste all\'IA al mese per persona (vuoto = senza limite)<input class="campo" type="number" min="0" max="100000" name="quota" value="' + (L.quota === null ? '' : esc(L.quota)) + '"></label>' +
      '<div class="fila"><button class="btn pri" type="submit">Salva per tutti</button>' + (L.attiva ? '<button class="btn" type="button" data-g="prova-ia">Prova</button>' : '') + '</div>' + riga('ia') +
      (L.aggiornate ? '<p class="nota">Ultima modifica: ' + esc(T.dataOra(L.aggiornate)) + (L.da ? ', ' + esc(L.da) : '') + '.</p>' : '') + '</form></div>';
    h += '<div class="box s4"><div class="lab">' + T.icona('info') + 'Da sapere</div>' +
      '<p class="nota"><b>La chiave è leggibile da chi vede la cartella</b>: usane una dedicata, con un tetto di spesa.</p>' +
      '<p class="nota"><b>Azure OpenAI</b>: indirizzo https://&lt;risorsa&gt;.openai.azure.com/openai/v1 e nome della distribuzione come modello.</p></div></div>';
    return h;
  }

  /* ---------- registro ---------- */
  function registro() {
    var h = '<div class="foglio"><div class="box"><div class="lab">' + T.icona('registro') + 'Registro degli eventi<span class="dx">ultimi ' + st.eventi.length + '</span></div>';
    if (!st.eventi.length) return h + '<p class="vuoto">Nessun evento.</p></div></div>';
    h += '<div class="scorri"><table class="tab"><thead><tr><th>Quando · evento</th><th>Da</th><th>Dettagli</th></tr></thead><tbody>' +
      st.eventi.map(function (e) {
        return '<tr><td>' + esc(T.dataOra(e.quando)) + ' · <b>' + esc(EVENTI[e.tipo] || e.tipo) + '</b></td>' +
          '<td data-l="Da">' + esc(e.autore_nome || (e.autore_id ? '' : 'sistema')) + '</td><td data-l="Dettagli">' + esc((e.dettagli || '').slice(0, 300)) + '</td></tr>';
      }).join('') + '</tbody></table></div>';
    return h + '</div></div>';
  }

  /* ------------------------------------------------------------------ aggiornamento automatico della vista dati */
  function pianificaRinfresco() {
    clearTimeout(st.timer);
    var inCorso = (st.dati && st.dati.in_corso) || (st.riep && st.riep.aggiornamento);
    if (inCorso && !el.hidden) st.timer = setTimeout(function () { if (!el.hidden) carica(); }, 4000);
  }

  /* ------------------------------------------------------------------ azioni */
  el.addEventListener('submit', function (ev) {
    var f = ev.target, g = f.getAttribute('data-g');
    if (!g) return;
    ev.preventDefault();
    var d = new FormData(f);
    if (g === 'aggiorna') {
      T.api('POST', '/api/admin/dati/aggiorna', { mese: String(d.get('mese') || '').trim() })
        .then(function (r) { msg('aggiorna', 'Aggiornamento di ' + r.mese + ' avviato: segui l\'avanzamento qui sopra.', true); }, function (e) { msg('aggiorna', errore(e)); }).then(carica);
    } else if (g === 'ia-locale') {
      var qq = String(d.get('quota') || '').trim(), corpo2 = {
        fornitore: String(d.get('fornitore') || ''), url: String(d.get('url') || '').trim(), modello: String(d.get('modello') || '').trim(),
        modello_rapido: String(d.get('modello_rapido') || '').trim(), quota: qq === '' ? null : parseInt(qq, 10)
      };
      if (d.has('chiave')) corpo2.chiave = String(d.get('chiave') || '');
      T.api('PUT', '/api/admin/locale/ia', corpo2).then(function (r) {
        st.cambiaChiave = false;
        msg('ia', r.attiva ? 'Salvato per tutti: ' + r.ia_nome + '. Premi Prova per controllare che risponda.' : 'Salvato per tutti: classificazione assistita spenta.', true);
        return app().aggiornaIo();
      }, function (e) { msg('ia', errore(e)); }).then(carica);
    } else if (g === 'editore-aggiungi') {
      var nuovo = String(d.get('utente') || '').trim();
      salvaEditori((st.loc.editori || []).concat([nuovo]), 'Aggiunto: ' + nuovo + '.');
    } else if (g === 'programma') {
      msg('programma', 'Caricamento in corso…', true); disegna();
      T.api('POST', '/api/admin/locale/programma', d).then(function (r) { msg('programma', 'Versione ' + r.versione + ' pubblicata: i colleghi la useranno dalla prossima apertura. Su questo PC chiudi e riapri MAGIC HS.', true); },
        function (e) { msg('programma', errore(e)); }).then(carica);
    } else if (g === 'carica') {
      msg('carica', 'Caricamento in corso…', true); disegna();
      T.api('POST', '/api/admin/dati/carica', d).then(function (r) { msg('carica', 'Archivio caricato: installazione di ' + r.mese + ' avviata.', true); },
        function (e) { msg('carica', errore(e)); }).then(carica);
    }
  });

  el.addEventListener('change', function (ev) {
    var t = ev.target;
    if (t.getAttribute('data-g') === 'fornitore' && st.loc) {      // i campi dipendono dal servizio scelto
      var f = t.form, q = f && f.elements.quota ? f.elements.quota.value : '';
      var sal = st.loc.salvata || (st.loc.salvata = JSON.parse(JSON.stringify(st.loc.ia)));
      st.loc.ia = t.value === sal.fornitore ? JSON.parse(JSON.stringify(sal)) : { fornitore: t.value, url: '', modello: '', modello_rapido: '', chiave: '' };
      st.cambiaChiave = false; disegna();
      var f2 = el.querySelector('form[data-g="ia-locale"]');
      if (f2 && f2.elements.quota) f2.elements.quota.value = q;
    }
  });

  el.addEventListener('click', function (ev) {
    var b = ev.target.closest('[data-g]');
    if (!b || b.tagName === 'FORM') return;
    var g = b.getAttribute('data-g'), id = b.getAttribute('data-id'), v = b.getAttribute('data-v');
    if (g === 'sotto') { st.sotto = v; st.registro = null; disegna(); carica(); }
    else if (g === 'cambia-chiave') { st.cambiaChiave = true; disegna(); }
    else if (g === 'editore-togli') {
      if (v === st.loc.utente && !window.confirm('Togliendo te stesso non potrai più pubblicare da questo PC. Continuare?')) return;
      salvaEditori(st.loc.editori.filter(function (n) { return n !== v; }), 'Tolto: ' + v + '.');
    }
    else if (g === 'prova-ia') {
      b.disabled = true; msg('ia', 'Provo il servizio…', true); disegna();
      T.api('POST', '/api/admin/locale/ia/prova').then(function (r) { msg('ia', 'Il servizio risponde (' + r.modello + ', ' + (r.secondi < 1 ? 'in meno di un secondo' : 'in ' + String(r.secondi).replace('.', ',') + ' secondi') + ').', true); },
        function (e) { msg('ia', errore(e)); }).then(disegna);
    } else if (g === 'usa') {
      if (!window.confirm('Usare i dati del ' + v.split('-').reverse().join('/') + ' al posto di quelli attuali? Chi ha la pagina aperta la deve ricaricare.')) return;
      T.api('POST', '/api/admin/dati/attiva', { versione: v }).then(function () { T.avviso('Versione cambiata: ricarico la pagina.'); setTimeout(function () { location.reload(); }, 900); },
        function (e) { T.avviso(errore(e), 'male'); });
    } else if (g === 'riepilogo') {
      T.api('GET', '/api/admin/dati/riepilogo/' + v).then(function (r) { st.registro = { titolo: 'Riepilogo della versione ' + v, testo: r.testo || '' }; disegna(); });
    } else if (g === 'registro-agg') {
      T.api('GET', '/api/admin/dati/registro/' + id).then(function (r) { st.registro = { titolo: 'Registro dell\'aggiornamento', testo: r.testo || '(vuoto)' }; disegna(); });
    } else if (g === 'chiudi-registro') { st.registro = null; disegna(); }
  });
})();
