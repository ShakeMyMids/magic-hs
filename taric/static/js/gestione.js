/* MAGIC HS - vista Impostazioni di questo PC: intelligenza artificiale, dati TARIC, versione del programma,
   registro degli eventi. Nella versione sito (T.web) restano intelligenza artificiale e dati TARIC: i dati e le
   versioni arrivano con il sito. */
(function () {
  'use strict';
  var T = window.TARIC, esc = T.esc;
  var el = document.getElementById('view-gestione');
  var vista = T.viste = T.viste || {};
  var st = { sotto: 'ia', riep: null, dati: null, eventi: [], msg: {}, registro: null, timer: null, loc: null, cambiaChiave: false,
             agg: null, modelli: [] };

  var ESITI = { ok: 'riuscito', errore: 'errore', non_disponibile: 'non ancora disponibile', in_corso: 'in corso', interrotto: 'interrotto' };
  var EVENTI = {
    dati_ok: 'Dati TARIC installati', dati_errore: 'Aggiornamento dati non riuscito', dati_non_disponibile: 'Estrazione non ancora disponibile',
    dati_versione_attivata: 'Versione dati cambiata', impostazioni_ia: 'Intelligenza artificiale cambiata',
    programma_pubblicato: 'Nuova versione del programma scaricata', editori: 'Chi può pubblicare cambiato'
  };
  var FORNITORI = [['', 'Nessuno: solo consultazione'], ['openai', 'Azure OpenAI o altro servizio compatibile OpenAI'], ['gemini', 'Google Gemini'], ['anthropic', 'Anthropic Claude']];
  /* modelli predefiniti (come in config.FORNITORI): [principale, rapido] */
  var PREDEFINITI = { gemini: ['gemini-3.7-flash', 'gemini-3.5-flash-lite'], anthropic: ['claude-sonnet-5-5', 'claude-haiku-5-5'] };
  var CONSOLE = { gemini: ['Google AI Studio', 'https://aistudio.google.com/usage'], anthropic: ['Console di Anthropic', 'https://console.anthropic.com/usage'] };
  function numero(n) { return Number(n || 0).toLocaleString('it-IT'); }

  function app() { return T.app; }
  function riga(dove) { var m = st.msg[dove]; return m ? '<p class="' + (m.ok ? 'esito-ok' : 'errore') + '">' + esc(m.testo) + '</p>' : ''; }
  function msg(dove, testo, ok) { st.msg[dove] = testo ? { testo: testo, ok: !!ok } : null; }
  function errore(e) { return (e && e.errore) || 'Operazione non riuscita.'; }

  vista.gestione = { mostra: function () { disegna(); carica(); } };

  function carica() {
    var chiamate = [T.api('GET', '/api/admin/riepilogo').then(function (r) { st.riep = r; })];
    if (st.sotto === 'ia') chiamate.push(T.api('GET', '/api/admin/locale').then(function (r) { st.loc = r; }));
    if (st.sotto === 'dati') chiamate.push(T.api('GET', '/api/admin/dati').then(function (r) { st.dati = r; }));
    if (st.sotto === 'registro') chiamate.push(T.api('GET', '/api/admin/eventi?limite=300').then(function (r) { st.eventi = r.eventi; }));
    if (st.sotto === 'programma' && !st.agg) controllaVersioni(false);     // a parte: GitHub può essere lento
    return Promise.all(chiamate).then(disegna, function (e) { el.innerHTML = '<p class="errore">' + esc(errore(e)) + '</p>'; });
  }

  /* ------------------------------------------------------------------ disegno */
  function disegna() {
    var r = st.riep, h = '';
    var schede = [['ia', 'Intelligenza artificiale', 'scintille'], ['dati', 'Dati TARIC', 'database'], ['programma', 'Programma', 'pacco'], ['registro', 'Registro', 'registro']];
    if (T.web) schede = schede.slice(0, 2);
    h += '<div class="sotto" role="tablist">' + schede.map(function (x) {
      return '<button class="btn sm" type="button" data-g="sotto" data-v="' + x[0] + '"' + (st.sotto === x[0] ? ' aria-current="page"' : '') + '>' + T.icona(x[2]) + x[1] + '</button>';
    }).join('') + '</div>';
    if (r) h += avvisi(r);
    h += { dati: dati, registro: registro, programma: programma, ia: iaLocale }[st.sotto]();
    el.innerHTML = h;
    pianificaRinfresco();
  }

  function avvisi(r) {
    var a = [], h = '';
    if (!r.ia && st.sotto !== 'ia') a.push('La classificazione assistita è spenta: scegli un servizio nella scheda Intelligenza artificiale.');
    if (!r.dati) a.push('Non ci sono ancora dati TARIC: vai su Dati TARIC.');
    if (a.length) h += '<div class="foglio"><div class="box"><div class="lab">' + T.icona('attenzione') + 'Da sistemare</div>' + a.map(function (t) { return '<p class="avviso">' + esc(t) + '</p>'; }).join('') + '</div></div>';
    if (st.agg && st.agg.pronta && st.sotto !== 'programma') h += '<div class="foglio"><div class="box"><div class="lab">' + T.icona('pacco') + 'Novità</div>' +
      '<p class="esito-ok">MAGIC HS ' + esc(st.agg.pronta) + ' è pronto: chiudi e riapri MAGIC HS per usarlo.</p></div></div>';
    return h;
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
    if (T.web) return h + '<p class="nota">Arrivano da soli con il sito, a ogni inizio mese.</p></div></div>' + versioniDati(d);
    if (d.in_corso) h += '<p class="esito-ok">Aggiornamento di ' + esc(d.in_corso.mese) + ' in corso: ' + esc(d.in_corso.fase) + '…</p>';
    h += '<p class="nota">A ogni inizio mese arrivano da soli, pronti da GitHub; se non ci sono ancora li prepara questo PC.</p>';
    h += (d.prossimo ? '<p class="nota">Prossimo tentativo per ' + esc(d.prossimo) + ' entro dieci minuti.</p>' : '') + '</div>';
    h += '<div class="box s4"><div class="lab">' + T.icona('aggiorna') + 'Aggiorna adesso</div><form class="modulo" data-g="aggiorna"><label>Mese (vuoto = corrente)<input class="campo" name="mese" placeholder="AAAA-MM" pattern="\\d{4}-\\d{2}"></label>' +
      '<div class="fila"><button class="btn pri" type="submit"' + (d.in_corso ? ' disabled' : '') + '>Scarica e installa</button></div>' + riga('aggiorna') + '</form></div></div>';

    h += '<div class="foglio"><div class="box"><div class="lab">' + T.icona('carica') + 'Carica a mano un\'estrazione</div><p class="nota">I file Excel del mese (CIRCABC «TARIC and Quota data and information») in un archivio .zip.</p>' +
      '<form class="modulo" data-g="carica"><div class="due"><label>Archivio .zip<input class="campo" type="file" name="file" accept=".zip,application/zip" required></label>' +
      '<label>Mese dell\'estrazione<input class="campo" name="mese" placeholder="AAAA-MM" pattern="\\d{4}-\\d{2}"></label></div>' +
      '<div class="fila"><button class="btn" type="submit"' + (d.in_corso ? ' disabled' : '') + '>Carica e installa</button></div>' + riga('carica') + '</form></div></div>';

    h += versioniDati(d);

    h += '<div class="foglio"><div class="box"><div class="lab">' + T.icona('storico') + 'Ultimi aggiornamenti</div><div class="scorri"><table class="tab"><thead><tr><th>Quando</th><th>Mese</th><th>Origine</th><th>Esito</th><th>Messaggio</th><th></th></tr></thead><tbody>' +
      d.ultimi.map(function (a) {
        return '<tr><td>' + esc(T.dataOra(a.iniziato)) + '</td><td data-l="Mese">' + esc(a.mese) + '</td><td data-l="Origine">' + esc(a.origine.replace(/_/g, ' ')) + '</td><td data-l="Esito"><span class="st ' + a.esito + '">' + (ESITI[a.esito] || a.esito) + '</span></td><td>' + esc(a.messaggio) + '</td>' +
          '<td>' + (a.esito === 'errore' || a.esito === 'ok' ? '<button class="btn sm" type="button" data-g="registro-agg" data-id="' + a.id + '">Registro</button>' : '') + '</td></tr>';
      }).join('') + '</tbody></table></div>' + (d.ultimi.length ? '' : '<p class="vuoto">Nessun aggiornamento ancora.</p>') +
      registroAperto() + '</div></div>';
    return h;
  }
  function registroAperto() {
    return st.registro ? '<div class="lab" style="margin-top:8px">' + esc(st.registro.titolo) + '<span class="dx"><button class="link" type="button" data-g="chiudi-registro">chiudi</button></span></div><pre class="registro">' + esc(st.registro.testo) + '</pre>' : '';
  }
  function versioniDati(d) {
    return '<div class="foglio"><div class="box"><div class="lab">' + T.icona('pacco') + (T.web ? 'Versioni sul sito' : 'Versioni installate') + '</div><div class="scorri"><table class="tab"><thead><tr><th>Situazione al</th><th class="n">Righe</th><th class="n">Misure import</th><th>Generata</th><th></th></tr></thead><tbody>' +
      d.versioni.map(function (v) {
        return '<tr' + (v.attiva ? ' class="evid"' : '') + '><td>' + esc(v.versione.split('-').reverse().join('/')) + (v.attiva ? ' <span class="st ok">in uso</span>' : '') + '</td><td class="n" data-l="Righe">' + (v.righe || '') + '</td><td class="n" data-l="Misure import">' + (v.misure_import || '') +
          '</td><td data-l="Generata">' + esc(T.dataOra(v.generato)) + '</td><td class="azioni"><button class="btn sm" type="button" data-g="riepilogo" data-v="' + esc(v.versione) + '">Riepilogo</button>' +
          (v.attiva ? '' : '<button class="btn sm" type="button" data-g="usa" data-v="' + esc(v.versione) + '">Usa questa</button>') + '</td></tr>';
      }).join('') + '</tbody></table></div>' + (T.web ? registroAperto() : '') + '</div></div>';
  }


  /* ---------- versione del programma: le nuove si scaricano da sole da GitHub ---------- */
  function programma() {
    var A = st.agg, h = '<div class="foglio"><div class="box"><div class="lab">' + T.icona('pacco') + 'Versione del programma</div>';
    if (!A) return h + '<p class="nota">Controllo le versioni…</p></div></div>';
    h += '<p class="cosa">MAGIC HS ' + esc(A.in_uso) + '</p>';
    if (A.pronta) h += '<p class="esito-ok">È pronta la versione ' + esc(A.pronta) + ': chiudi e riapri MAGIC HS per usarla.</p>';
    else if (A.errore) h += '<p class="avviso">Non riesco ad aggiornare: ' + esc(A.errore) + '.</p>';
    else if (A.ultima) h += '<p class="nota">È la più recente. Le nuove versioni si scaricano da sole da GitHub.</p>';
    if (A.pagina) h += '<p class="nota"><a href="' + esc(A.pagina) + '" target="_blank" rel="noopener">Pagina delle versioni</a></p>';
    if (!A.pronta) h += '<div class="fila"><button class="btn sm" type="button" data-g="controlla-versioni">' + T.icona('aggiorna') + 'Controlla adesso</button></div>';
    return h + riga('programma') + '</div></div>';
  }

  function controllaVersioni(forza) {
    return T.api('GET', '/api/admin/locale/aggiornamento' + (forza ? '?forza=true' : '')).then(function (r) { st.agg = r; },
      function (e) { st.agg = { errore: errore(e) }; }).then(function () { segnaNovita(); if (st.sotto === 'programma' && !el.hidden) disegna(); });
  }
  function segnaNovita() {
    var t = document.getElementById('tab-gestione');
    if (t) { t.classList.toggle('novita', !!(st.agg && st.agg.pronta)); if (st.agg && st.agg.pronta) t.title = 'MAGIC HS ' + st.agg.pronta + ' è pronto: chiudi e riapri'; else t.removeAttribute('title'); }
  }
  T.controllaVersioni = controllaVersioni;

  /* ---------- intelligenza artificiale di questo PC ---------- */
  function iaLocale() {
    var L = st.loc;
    if (!L) return '<p class="vuoto">Carico…</p>';
    var ia = L.ia, f = ia.fornitore, def = PREDEFINITI[f] || ['', ''];
    var h = '<div class="foglio"><div class="box"><div class="lab">' + T.icona('scintille') + 'Intelligenza artificiale' +
      '<span class="dx"><span class="st ' + (L.attiva ? 'ok' : 'sospeso') + '">' + (L.attiva ? 'attiva' : 'spenta') + '</span></span></div>';
    if (L.attiva && L.modelli_in_uso) h += '<p class="nota">In uso: ' + esc(L.modelli_in_uso.principale) +
      (L.modelli_in_uso.rapido && L.modelli_in_uso.rapido !== L.modelli_in_uso.principale ? ', e ' + esc(L.modelli_in_uso.rapido) + ' per la ricerca delle voci' : '') + '.</p>';
    h += '<form class="modulo" data-g="ia-locale">' +
      '<label>Servizio<select class="campo" name="fornitore" data-g="fornitore">' + FORNITORI.map(function (x) { return '<option value="' + x[0] + '"' + (x[0] === f ? ' selected' : '') + '>' + esc(x[1]) + '</option>'; }).join('') + '</select></label>';
    if (f) {
      if (f === 'openai') h += '<label>Indirizzo del servizio<input class="campo" name="url" value="' + esc(ia.url) + '" placeholder="https://nome-risorsa.openai.azure.com/openai/v1" required></label>';
      var elenco = (st.modelli.length && f === L.fornitore_attivo ? st.modelli : def.filter(Boolean));
      h += '<datalist id="modelli-ia">' + elenco.map(function (m) { return '<option value="' + esc(m) + '"></option>'; }).join('') + '</datalist>' +
        '<div class="due"><label>Modello' + (f === 'openai' ? ' (per Azure: nome della distribuzione)' : '') + '<input class="campo" name="modello" list="modelli-ia" autocomplete="off" value="' + esc(ia.modello) + '"' +
        (def[0] ? ' placeholder="predefinito: ' + esc(def[0]) + '"' : '') + (f === 'openai' ? ' required' : '') + '></label>' +
        '<label>Modello per la ricerca delle voci (più rapido)<input class="campo" name="modello_rapido" list="modelli-ia" autocomplete="off" value="' + esc(ia.modello_rapido) + '"' +
        ' placeholder="' + esc(def[1] ? 'predefinito: ' + def[1] : 'vuoto = lo stesso') + '"></label></div>';
      if (ia.chiave && !st.cambiaChiave) h += '<div class="fila"><span class="nota">Chiave salvata: ' + esc(ia.chiave) + '</span><button class="btn sm" type="button" data-g="cambia-chiave">Cambia chiave</button></div>';
      else h += '<label>Chiave del servizio<input class="campo" type="password" name="chiave" autocomplete="off"' + (f === 'openai' ? '' : ' required') + '></label>';
    }
    if (ia.chiave_illeggibile) h += '<p class="avviso">La chiave salvata non si può leggere con questo utente di Windows: inseriscila di nuovo.</p>';
    h += '<div class="fila"><button class="btn pri" type="submit">Salva</button>' +
      (L.attiva ? '<button class="btn" type="button" data-g="prova-ia">Prova</button><button class="btn" type="button" data-g="modelli-ia">Elenco dei modelli</button>' : '') + '</div>' + riga('ia') +
      (L.aggiornate ? '<p class="nota">Ultima modifica: ' + esc(T.dataOra(L.aggiornate)) + '.</p>' : '') + '</form></div></div>';

    var u = L.uso || {}, cons = CONSOLE[L.fornitore_attivo];
    var cache = u.token_in ? Math.round(u.token_cache / u.token_in * 100) : 0;
    h += '<div class="foglio"><div class="box s6"><div class="lab">' + T.icona('grafico') + (T.web ? 'Uso in questo browser' : 'Uso su questo PC') + '<span class="dx">' + esc(meseIt(u.mese)) + '</span></div>' +
      '<p class="cosa">' + numero(u.classificazioni) + (u.classificazioni === 1 ? ' classificazione' : ' classificazioni') + '</p>' +
      '<p class="nota">' + numero(u.richieste) + ' richieste, ' + numero(u.token_in) + ' token in ingresso' + (u.token_in ? ' (' + cache + '% dalla cache, che costano molto meno)' : '') +
      ' e ' + numero(u.token_out) + ' in uscita. La spesa è nella console del servizio' +
      (cons ? ' (<a href="' + esc(cons[1]) + '" target="_blank" rel="noopener">' + esc(cons[0]) + '</a>)' : '') + ', dove conviene impostare un tetto di spesa.</p></div>' +
      '<div class="box s6"><div class="lab">' + T.icona('info') + 'Da sapere</div>' +
      (T.web ? '<p class="nota"><b>La chiave resta in questo browser</b> e va direttamente al servizio scelto, senza passare da altri server. Usane una dedicata a MAGIC HS, con un tetto di spesa.</p>' +
        '<p class="nota"><b>Senza costi</b>: con Ollama il modello gira sul tuo PC (indirizzo http://localhost:11434/v1, servizio «compatibile OpenAI»), avviato con OLLAMA_ORIGINS=' + esc(location.origin) + ' perché accetti le richieste di questo sito. Senza IA restano nomenclatura, misure, storico e preferiti.</p>'
        : '<p class="nota"><b>La chiave resta su questo PC</b>, protetta da Windows: solo il tuo utente la può leggere.</p>' +
        '<p class="nota"><b>Senza costi</b>: con Ollama il modello gira sul tuo PC (indirizzo http://localhost:11434/v1, servizio «compatibile OpenAI»). Senza IA restano nomenclatura, misure, storico e preferiti.</p>') +
      '<p class="nota"><b>Azure OpenAI</b>: indirizzo https://&lt;risorsa&gt;.openai.azure.com/openai/v1 e nome della distribuzione come modello.</p></div></div>';
    return h;
  }
  function meseIt(m) {
    var nomi = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
    var x = /^(\d{4})-(\d{2})$/.exec(m || ''); return x ? nomi[+x[2] - 1] + ' ' + x[1] : '';
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
      var corpo2 = {
        fornitore: String(d.get('fornitore') || ''), url: String(d.get('url') || '').trim(), modello: String(d.get('modello') || '').trim(),
        modello_rapido: String(d.get('modello_rapido') || '').trim()
      };
      if (d.has('chiave')) corpo2.chiave = String(d.get('chiave') || '');
      T.api('PUT', '/api/admin/locale/ia', corpo2).then(function (r) {
        st.cambiaChiave = false;
        msg('ia', r.attiva ? 'Salvato: ' + r.ia_nome + '. Premi Prova per controllare che risponda.' : 'Salvato: classificazione assistita spenta.', true);
        return app().aggiornaIo();
      }, function (e) { msg('ia', errore(e)); }).then(carica);
    } else if (g === 'carica') {
      msg('carica', 'Caricamento in corso…', true); disegna();
      T.api('POST', '/api/admin/dati/carica', d).then(function (r) { msg('carica', 'Archivio caricato: installazione di ' + r.mese + ' avviata.', true); },
        function (e) { msg('carica', errore(e)); }).then(carica);
    }
  });

  el.addEventListener('change', function (ev) {
    var t = ev.target;
    if (t.getAttribute('data-g') === 'fornitore' && st.loc) {      // i campi dipendono dal servizio scelto
      var sal = st.loc.salvata || (st.loc.salvata = JSON.parse(JSON.stringify(st.loc.ia)));
      st.loc.ia = t.value === sal.fornitore ? JSON.parse(JSON.stringify(sal)) : { fornitore: t.value, url: '', modello: '', modello_rapido: '', chiave: '' };
      st.cambiaChiave = false; disegna();
    }
  });

  el.addEventListener('click', function (ev) {
    var b = ev.target.closest('[data-g]');
    if (!b || b.tagName === 'FORM') return;
    var g = b.getAttribute('data-g'), id = b.getAttribute('data-id'), v = b.getAttribute('data-v');
    if (g === 'sotto') { st.sotto = v; st.registro = null; disegna(); carica(); }
    else if (g === 'cambia-chiave') { st.cambiaChiave = true; disegna(); }
    else if (g === 'controlla-versioni') { b.disabled = true; msg('programma', ''); st.agg = null; disegna(); controllaVersioni(true); }
    else if (g === 'modelli-ia') {
      b.disabled = true; msg('ia', 'Leggo l\'elenco dei modelli…', true); disegna();
      T.api('POST', '/api/admin/locale/ia/modelli').then(function (r) {
        st.modelli = r.modelli || [];
        msg('ia', st.modelli.length ? st.modelli.length + ' modelli disponibili: li trovi tra i suggerimenti dei campi Modello.' : 'Il servizio non ha indicato modelli: scrivi il nome a mano.', true);
      }, function (e) { msg('ia', errore(e)); }).then(disegna);
    }
    else if (g === 'prova-ia') {
      b.disabled = true; msg('ia', 'Provo il servizio…', true); disegna();
      T.api('POST', '/api/admin/locale/ia/prova').then(function (r) { msg('ia', 'Il servizio risponde (' + r.modello + ', ' + (r.secondi < 1 ? 'in meno di un secondo' : 'in ' + String(r.secondi).replace('.', ',') + ' secondi') + ').', true); },
        function (e) { msg('ia', errore(e)); }).then(disegna);
    } else if (g === 'usa') {
      if (!window.confirm('Usare i dati del ' + v.split('-').reverse().join('/') + ' al posto di quelli ' + (T.web ? 'in uso? Vale per questo browser.' : 'attuali?'))) return;
      T.api('POST', '/api/admin/dati/attiva', { versione: v }).then(function () { T.avviso('Versione cambiata: ricarico la pagina.'); setTimeout(function () { location.reload(); }, 900); },
        function (e) { T.avviso(errore(e), 'male'); });
    } else if (g === 'riepilogo') {
      T.api('GET', '/api/admin/dati/riepilogo/' + v).then(function (r) { st.registro = { titolo: 'Riepilogo della versione ' + v.split('-').reverse().join('/'), testo: r.testo || '' }; disegna(); });
    } else if (g === 'registro-agg') {
      T.api('GET', '/api/admin/dati/registro/' + id).then(function (r) { st.registro = { titolo: 'Registro dell\'aggiornamento', testo: r.testo || '(vuoto)' }; disegna(); });
    } else if (g === 'chiudi-registro') { st.registro = null; disegna(); }
  });
})();
