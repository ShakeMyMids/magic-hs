/* MAGIC HS - vista Gestione, per l'amministratore: utenti (richieste da approvare, limiti, link per la password),
   intelligenza artificiale unica (stato, prova, limiti, uso per persona), dati TARIC con la copia del database, ricerca
   (parole cercate senza risultati e sinonimi aggiunti), registro. */
(function () {
  'use strict';
  var T = window.TARIC, esc = T.esc;
  var el = document.getElementById('view-gestione');
  var vista = T.viste = T.viste || {};
  var st = { sotto: 'utenti', riep: null, dati: null, eventi: [], msg: {}, registro: null, timer: null, modelli: [], utenti: null, iaS: null,
             aperto: 0, link: null, ricerca: null, sinonimoPer: '', bozza: null };

  var ESITI = { ok: 'riuscito', errore: 'errore', non_disponibile: 'non ancora disponibile', in_corso: 'in corso', interrotto: 'interrotto' };
  var EVENTI = {
    dati_ok: 'Dati TARIC installati', dati_errore: 'Aggiornamento dati non riuscito', dati_non_disponibile: 'Estrazione non ancora disponibile',
    dati_versione_attivata: 'Versione dati cambiata', impostazioni_ia: 'Intelligenza artificiale cambiata',
    registrazione: 'Richiesta di account', approvato: 'Account approvato', rifiutato: 'Richiesta rifiutata', sospeso: 'Account sospeso',
    riattivato: 'Account riattivato', link_password: 'Link per la password', password_cambiata: 'Password cambiata',
    password_reimpostata: 'Password reimpostata', accesso_bloccato: 'Accesso bloccato (password errate)', utente_eliminato: 'Account eliminato',
    ruolo: 'Ruolo cambiato', quota_ia: 'Limite personale cambiato', impostazioni_sito: 'Limiti e registrazioni cambiati',
    backup_scaricato: 'Copia del database scaricata', sessioni_chiuse: 'Uscita da tutti i dispositivi',
    sinonimo: 'Sinonimo aggiunto', sinonimo_tolto: 'Sinonimo tolto'
  };
  function numero(n) { return Number(n || 0).toLocaleString('it-IT'); }

  function app() { return T.app; }
  function riga(dove) { var m = st.msg[dove]; return m ? '<p class="' + (m.ok ? 'esito-ok' : 'errore') + '">' + esc(m.testo) + '</p>' : ''; }
  function msg(dove, testo, ok) { st.msg[dove] = testo ? { testo: testo, ok: !!ok } : null; }
  function errore(e) { return (e && e.errore) || 'Operazione non riuscita.'; }

  vista.gestione = { mostra: function () { disegna(); carica(); } };

  function carica() {
    var chiamate = [T.api('GET', '/api/admin/riepilogo').then(function (r) { st.riep = r; segnaRichieste(r); })];
    if (st.sotto === 'utenti' || st.sotto === 'ia') chiamate.push(T.api('GET', '/api/admin/utenti').then(function (r) { st.utenti = r; }));
    if (st.sotto === 'ia') chiamate.push(T.api('GET', '/api/admin/ia').then(function (r) { st.iaS = r; }));
    if (st.sotto === 'dati') chiamate.push(T.api('GET', '/api/admin/dati').then(function (r) { st.dati = r; }));
    if (st.sotto === 'ricerca') chiamate.push(T.api('GET', '/api/admin/ricerca').then(function (r) { st.ricerca = r; }));
    if (st.sotto === 'registro') chiamate.push(T.api('GET', '/api/admin/eventi?limite=300').then(function (r) { st.eventi = r.eventi; }));
    return Promise.all(chiamate).then(disegna, function (e) { el.innerHTML = '<p class="errore">' + esc(errore(e)) + '</p>'; });
  }

  /* ------------------------------------------------------------------ disegno */
  function disegna() {
    var r = st.riep, h = '';
    var schede = [['utenti', 'Utenti', 'utenti'], ['ia', 'Intelligenza artificiale', 'scintille'], ['dati', 'Dati TARIC', 'database'], ['ricerca', 'Ricerca', 'cerca'], ['registro', 'Registro', 'registro']];
    h += '<div class="sotto" role="tablist">' + schede.map(function (x) {
      return '<button class="btn sm" type="button" data-g="sotto" data-v="' + x[0] + '"' + (st.sotto === x[0] ? ' aria-current="page"' : '') + '>' + T.icona(x[2]) + x[1] + '</button>';
    }).join('') + '</div>';
    if (r) h += avvisi(r);
    h += { dati: dati, registro: registro, ia: ia, utenti: utenti, ricerca: ricerca }[st.sotto]();
    el.innerHTML = h;
    pianificaRinfresco();
  }

  function avvisi(r) {
    var a = [], h = '';
    if (r.in_attesa && st.sotto !== 'utenti') a.push(r.in_attesa === 1 ? 'C\'è una richiesta di account da approvare: vai su Utenti.' : 'Ci sono ' + r.in_attesa + ' richieste di account da approvare: vai su Utenti.');
    if (!r.ia && st.sotto !== 'ia') a.push('La classificazione assistita è spenta: inserisci la chiave di Gemini nel servizio su Render (vedi Intelligenza artificiale).');
    if (!r.dati) a.push('Non ci sono ancora dati TARIC: vai su Dati TARIC.');
    if (a.length) h += '<div class="foglio"><div class="box"><div class="lab">' + T.icona('attenzione') + 'Da sistemare</div>' + a.map(function (t) { return '<p class="avviso">' + esc(t) + '</p>'; }).join('') + '</div></div>';
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
    if (d.in_corso) h += '<p class="esito-ok">Aggiornamento di ' + esc(d.in_corso.mese) + ' in corso: ' + esc(d.in_corso.fase) + '…</p>';
    h += '<p class="nota">A ogni inizio mese arrivano da soli, pronti da GitHub; se non ci sono ancora li prepara il server.</p>';
    h += (d.prossimo ? '<p class="nota">Prossimo tentativo per ' + esc(d.prossimo) + ' entro dieci minuti.</p>' : '') + '</div>';
    h += '<div class="box s4"><div class="lab">' + T.icona('aggiorna') + 'Aggiorna adesso</div><form class="modulo" data-g="aggiorna"><label>Mese (vuoto = corrente)<input class="campo" name="mese" placeholder="AAAA-MM" pattern="\\d{4}-\\d{2}"></label>' +
      '<div class="fila"><button class="btn pri" type="submit"' + (d.in_corso ? ' disabled' : '') + '>Scarica e installa</button></div>' + riga('aggiorna') + '</form></div></div>';

    h += '<div class="foglio"><div class="box"><div class="lab">' + T.icona('scarica') + 'Copia del database</div>' +
      '<p class="nota">Account, storico, preferiti e uso dell\'IA di tutti. Il server ne fa una al giorno sul suo disco; scaricane una ogni tanto da tenere altrove.</p>' +
      '<div class="fila"><a class="btn sm" href="/api/admin/backup" download>' + T.icona('scarica') + 'Scarica la copia</a></div></div></div>';

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
    return '<div class="foglio"><div class="box"><div class="lab">' + T.icona('pacco') + 'Versioni installate</div><div class="scorri"><table class="tab"><thead><tr><th>Situazione al</th><th class="n">Righe</th><th class="n">Misure import</th><th>Generata</th><th></th></tr></thead><tbody>' +
      d.versioni.map(function (v) {
        return '<tr' + (v.attiva ? ' class="evid"' : '') + '><td>' + esc(v.versione.split('-').reverse().join('/')) + (v.attiva ? ' <span class="st ok">in uso</span>' : '') + '</td><td class="n" data-l="Righe">' + (v.righe || '') + '</td><td class="n" data-l="Misure import">' + (v.misure_import || '') +
          '</td><td data-l="Generata">' + esc(T.dataOra(v.generato)) + '</td><td class="azioni"><button class="btn sm" type="button" data-g="riepilogo" data-v="' + esc(v.versione) + '">Riepilogo</button>' +
          (v.attiva ? '' : '<button class="btn sm" type="button" data-g="usa" data-v="' + esc(v.versione) + '">Usa questa</button>') + '</td></tr>';
      }).join('') + '</tbody></table></div></div></div>';
  }

  function meseIt(m) {
    var nomi = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
    var x = /^(\d{4})-(\d{2})$/.exec(m || ''); return x ? nomi[+x[2] - 1] + ' ' + x[1] : '';
  }


  /* ---------- utenti ---------- */
  var STATI = { in_attesa: ['da approvare', 'sospeso'], attivo: ['attivo', 'ok'], sospeso: ['sospeso', 'errore'], rifiutato: ['rifiutato', 'errore'] };
  function persona(x) {
    return '<b>' + esc(x.nome) + '</b>' + (x.ruolo === 'amministratore' ? ' <span class="st ok">amministratore</span>' : '') +
      '<div class="nota">' + esc(x.email) + (x.azienda ? ' · ' + esc(x.azienda) : '') + '</div>';
  }
  function limiteDi(x) { return x.limite === null ? 'senza limite' : (x.limite === 0 ? 'IA spenta' : x.limite + ' al mese'); }

  function utenti() {
    var U = st.utenti;
    if (!U) return '<p class="vuoto">Carico…</p>';
    var attesa = U.utenti.filter(function (x) { return x.stato === 'in_attesa'; }), altri = U.utenti.filter(function (x) { return x.stato !== 'in_attesa'; });
    var h = '';
    if (attesa.length) {
      h += '<div class="foglio"><div class="box invito"><div class="lab">' + T.icona('nuovo-utente') + 'Da approvare<span class="dx">' + attesa.length + '</span></div><div class="elenco">' +
        attesa.map(function (x) {
          return '<div class="voce"><div>' + persona(x) + (x.richiesta ? '<p class="nota">«' + esc(x.richiesta) + '»</p>' : '') +
            '<div class="nota">Richiesta del ' + esc(T.dataOra(x.creato)) + '</div></div>' +
            '<div class="azioni"><button class="btn sm pri" type="button" data-g="u-approva" data-id="' + x.id + '">' + T.icona('spunta') + 'Approva</button>' +
            '<button class="btn sm" type="button" data-g="u-rifiuta" data-id="' + x.id + '">Rifiuta</button></div></div>';
        }).join('') + '</div></div></div>';
    }
    h += '<div class="foglio"><div class="box"><div class="lab">' + T.icona('utenti') + 'Persone<span class="dx">' + altri.length + '</span></div>' + riga('utenti');
    if (!altri.length) h += '<p class="vuoto">Ancora nessuno: chi si registra compare qui da approvare.</p>';
    else {
      h += '<div class="scorri"><table class="tab"><thead><tr><th>Persona</th><th>Stato</th><th class="n">IA a ' + esc(meseIt(U.mese)) + '</th><th>Ultimo accesso</th><th></th></tr></thead><tbody>' +
        altri.map(function (x) {
          var s = STATI[x.stato] || [x.stato, ''], aperto = st.aperto === x.id;
          var r = '<tr' + (aperto ? ' class="evid"' : '') + '><td>' + persona(x) + '</td><td data-l="Stato"><span class="st ' + s[1] + '">' + s[0] + '</span></td>' +
            '<td class="n" data-l="IA">' + numero(x.uso.classificazioni) + (x.limite !== null ? ' / ' + numero(x.limite) : '') + '</td>' +
            '<td data-l="Ultimo accesso">' + esc(x.ultimo_accesso ? T.dataOra(x.ultimo_accesso) : 'mai') + '</td>' +
            '<td class="azioni"><button class="btn sm" type="button" data-g="u-apri" data-id="' + x.id + '" aria-expanded="' + aperto + '">' + (aperto ? 'Chiudi' : 'Modifica') + '</button></td></tr>';
          if (aperto) r += '<tr class="dettaglio"><td colspan="5">' + dettaglioUtente(x, U.io) + '</td></tr>';
          return r;
        }).join('') + '</tbody></table></div>';
    }
    return h + '<p class="nota">Chi si registra dalla pagina d\'accesso resta in attesa finché non lo approvi. Password dimenticata: prepara un link e mandalo alla persona.</p></div></div>';
  }

  function dettaglioUtente(x, io) {
    var me = x.id === io, h = '<div class="pannello">';
    h += '<form class="fila" data-g="u-limite" data-id="' + x.id + '"><label class="corto">Classificazioni con l\'IA al mese' +
      '<input class="campo" type="number" min="0" max="100000" name="quota" value="' + (x.quota_ia === null ? '' : esc(x.quota_ia)) + '" placeholder="predefinito"></label>' +
      '<button class="btn sm" type="submit">Salva</button><span class="nota">Ora: ' + esc(limiteDi(x)) + (x.quota_ia === null ? ' (predefinito)' : '') + '. Vuoto = predefinito, 0 = IA spenta.</span></form>';
    h += '<div class="fila"><button class="btn sm" type="button" data-g="u-link" data-id="' + x.id + '">' + T.icona('chiave') + 'Link per la password</button>';
    if (!me && !x.fisso) {
      h += x.ruolo === 'amministratore' ? '<button class="btn sm" type="button" data-g="u-ruolo" data-id="' + x.id + '" data-v="utente">Togli amministratore</button>'
        : '<button class="btn sm" type="button" data-g="u-ruolo" data-id="' + x.id + '" data-v="amministratore">Rendi amministratore</button>';
      h += x.stato === 'attivo' ? '<button class="btn sm" type="button" data-g="u-sospendi" data-id="' + x.id + '">Sospendi</button>'
        : '<button class="btn sm" type="button" data-g="u-riattiva" data-id="' + x.id + '">Riattiva</button>';
      h += '<button class="btn sm" type="button" data-g="u-elimina" data-id="' + x.id + '">' + T.icona('cestino') + 'Elimina</button>';
    }
    h += '</div>';
    if (st.link && st.link.id === x.id) h += '<div class="fila"><input class="campo" readonly value="' + esc(st.link.link) + '" aria-label="Link per la password" data-g="link-campo">' +
      '<button class="btn sm pri" type="button" data-g="u-copia">' + T.icona('copia') + 'Copia</button></div>' +
      '<p class="nota">Mandalo a ' + esc(x.nome) + ': vale 3 giorni e una volta sola.</p>';
    if (x.motivo_stato) h += '<p class="nota">Motivo: ' + esc(x.motivo_stato) + '</p>';
    return h + '</div>';
  }

  /* ---------- intelligenza artificiale unica ---------- */
  function ia() {
    var A = st.iaS, U = st.utenti;
    if (!A) return '<p class="vuoto">Carico…</p>';
    var h = '<div class="foglio"><div class="box s7"><div class="lab">' + T.icona('scintille') + 'Intelligenza artificiale' +
      '<span class="dx"><span class="st ' + (A.attiva ? 'ok' : 'sospeso') + '">' + (A.attiva ? 'attiva' : 'spenta') + '</span></span></div>';
    if (A.attiva) h += '<p class="cosa">' + esc(A.ia_nome) + '</p><p class="nota">Modelli: ' + esc(A.modelli.principale) +
      (A.modelli.rapido !== A.modelli.principale ? ', e ' + esc(A.modelli.rapido) + ' per la ricerca delle voci' : '') + '.</p>' +
      '<div class="fila"><button class="btn" type="button" data-g="s-prova">Prova</button><button class="btn" type="button" data-g="s-modelli">Elenco dei modelli</button></div>';
    else h += '<ol class="passi"><li>Su Google AI Studio, nel progetto con la <b>fatturazione attiva</b>, crea una chiave API.</li>' +
      '<li>Su Render apri il servizio <b>magic-hs</b> › <b>Environment</b> e aggiungi <b>GEMINI_API_KEY</b> con la chiave.</li>' +
      '<li>Salva: il servizio si riavvia da solo. Poi torna qui e premi Prova.</li></ol>';
    if (st.modelli.length) h += '<p class="nota">Modelli disponibili: ' + esc(st.modelli.join(', ')) + '. Per cambiarli: TARIC_IA_MODELLO e TARIC_IA_MODELLO_RAPIDO su Render.</p>';
    h += riga('ia') + '<p class="nota">La chiave sta solo nel servizio su Render: non arriva mai ai browser.</p></div>';

    h += '<div class="box s5"><div class="lab">' + T.icona('regole') + 'Limiti e registrazioni</div><form class="modulo" data-g="s-limiti">' +
      '<label>Classificazioni con l\'IA al mese per persona<input class="campo" type="number" min="0" max="100000" name="quota_predefinita" value="' + (A.quota_predefinita === null ? '' : esc(A.quota_predefinita)) + '" placeholder="vuoto = senza limite"></label>' +
      '<label>Tetto al mese per tutti insieme<input class="campo" type="number" min="0" max="10000000" name="tetto_mese" value="' + (A.tetto_mese === null ? '' : esc(A.tetto_mese)) + '" placeholder="vuoto = nessun tetto"></label>' +
      '<label class="spunta"><input type="checkbox" name="registrazione_aperta"' + (A.registrazione_aperta ? ' checked' : '') + '> Si possono chiedere nuovi account</label>' +
      '<div class="fila"><button class="btn pri" type="submit">Salva</button></div>' + riga('limiti') +
      '<p class="nota">Gli amministratori non hanno limite personale; per una persona si cambia in Utenti › Modifica.</p></form></div></div>';

    var u = A.uso || {}, cache = u.token_in ? Math.round(u.token_cache / u.token_in * 100) : 0;
    h += '<div class="foglio"><div class="box"><div class="lab">' + T.icona('grafico') + 'Uso a ' + esc(meseIt(u.mese)) + '</div>' +
      '<p class="cosa">' + numero(u.classificazioni) + (u.classificazioni === 1 ? ' classificazione' : ' classificazioni') + (A.tetto_mese !== null ? ' su ' + numero(A.tetto_mese) : '') + '</p>' +
      '<p class="nota">' + numero(u.richieste) + ' richieste, ' + numero(u.token_in) + ' token in ingresso' + (u.token_in ? ' (' + cache + '% dalla cache, che costano molto meno)' : '') +
      ' e ' + numero(u.token_out) + ' in uscita. La spesa esatta è nella <a href="https://console.cloud.google.com/billing" target="_blank" rel="noopener">fatturazione di Google Cloud</a>, dove conviene impostare un budget con avvisi.</p>';
    var chi = U ? U.utenti.filter(function (x) { return x.uso.richieste; }).sort(function (a, b) { return b.uso.classificazioni - a.uso.classificazioni; }) : [];
    if (chi.length) h += '<div class="scorri"><table class="tab"><thead><tr><th>Persona</th><th class="n">Classificazioni</th><th class="n">Limite</th><th class="n">Richieste</th><th class="n">Token</th></tr></thead><tbody>' +
      chi.map(function (x) {
        return '<tr><td>' + esc(x.nome) + '</td><td class="n" data-l="Classificazioni">' + numero(x.uso.classificazioni) + '</td><td class="n" data-l="Limite">' + esc(limiteDi(x)) +
          '</td><td class="n" data-l="Richieste">' + numero(x.uso.richieste) + '</td><td class="n" data-l="Token">' + numero(x.uso.token_in + x.uso.token_out) + '</td></tr>';
      }).join('') + '</tbody></table></div>';
    return h + '</div></div>';
  }

  /* puntino sulla scheda Gestione quando ci sono richieste da approvare */
  function segnaRichieste(r) {
    var tab = document.getElementById('tab-gestione');
    if (!tab) return;
    tab.classList.toggle('novita', !!r.in_attesa);
    if (r.in_attesa) tab.title = r.in_attesa === 1 ? 'Una richiesta di account da approvare' : r.in_attesa + ' richieste di account da approvare'; else tab.removeAttribute('title');
  }
  T.segnaRichieste = function () { T.api('GET', '/api/admin/riepilogo').then(segnaRichieste, function () { /* niente puntino */ }); };

  function azioneUtente(id, azione, corpo, fatto) {
    return T.api('POST', '/api/admin/utenti/' + id + '/' + azione, corpo || null).then(function (r) { msg('utenti', fatto, true); return r; },
      function (e) { msg('utenti', errore(e)); }).then(function (r) { carica(); return r; });
  }
  function azione(g, b, id, v) {
    var x = st.utenti && st.utenti.utenti.filter(function (u) { return String(u.id) === String(id); })[0];
    if (g === 'u-apri') { st.aperto = st.aperto === +id ? 0 : +id; st.link = null; disegna(); }
    else if (g === 'u-approva') azioneUtente(id, 'approva', null, 'Approvato: ' + (x ? x.nome : '') + ' può accedere.');
    else if (g === 'u-rifiuta') {
      var mr = window.prompt('Rifiutare la richiesta di ' + (x ? x.nome : '') + '? Motivo (facoltativo, solo per il registro):', '');
      if (mr !== null) azioneUtente(id, 'rifiuta', { motivo: mr }, 'Richiesta rifiutata.');
    } else if (g === 'u-sospendi') {
      var ms = window.prompt('Sospendere ' + (x ? x.nome : '') + '? Non potrà più accedere finché non lo riattivi. Motivo (facoltativo):', '');
      if (ms !== null) azioneUtente(id, 'sospendi', { motivo: ms }, 'Account sospeso.');
    } else if (g === 'u-riattiva') azioneUtente(id, 'riattiva', null, 'Account riattivato.');
    else if (g === 'u-link') {
      b.disabled = true;
      T.api('POST', '/api/admin/utenti/' + id + '/link-password').then(function (r) { st.link = { id: +id, link: r.link }; disegna(); },
        function (e) { msg('utenti', errore(e)); disegna(); });
    } else if (g === 'u-copia') { var c = el.querySelector('[data-g="link-campo"]'); if (c) T.copia(c.value); }
    else if (g === 'u-ruolo') {
      T.api('PATCH', '/api/admin/utenti/' + id, { ruolo: v }).then(function () { msg('utenti', v === 'amministratore' ? 'Ora è amministratore.' : 'Non è più amministratore.', true); },
        function (e) { msg('utenti', errore(e)); }).then(carica);
    } else if (g === 'u-elimina') {
      if (!window.confirm('Eliminare l\'account di ' + (x ? x.nome : '') + ' con il suo storico e i preferiti? Non si può annullare.')) return true;
      T.api('DELETE', '/api/admin/utenti/' + id).then(function () { st.aperto = 0; msg('utenti', 'Account eliminato.', true); }, function (e) { msg('utenti', errore(e)); }).then(carica);
    } else if (g === 's-prova') {
      b.disabled = true; msg('ia', 'Provo il servizio…', true); disegna();
      var rapida;
      T.api('POST', '/api/admin/ia/prova').then(function (r) { rapida = r; return T.api('POST', '/api/admin/ia/prova?livello=standard'); }).then(function (r) {
        msg('ia', 'Il servizio risponde (' + rapida.modello + (r.modello !== rapida.modello ? ' e ' + r.modello : '') + ').', true);
        var chiave = 'magic-hs.festa:' + st.iaS.ia_nome + ':' + r.modello;
        try { if (!localStorage.getItem(chiave) && T.festaIA) { localStorage.setItem(chiave, '1'); T.festaIA({ nome: st.iaS.ia_nome, secondi: Math.max(rapida.secondi, r.secondi) }); } }
        catch (e) { /* senza archivio del browser niente festa */ }
      }, function (e) { msg('ia', (rapida ? 'Il modello rapido risponde, il principale no: ' : '') + errore(e)); }).then(disegna);
    } else if (g === 'r-sinonimo') { st.sinonimoPer = st.sinonimoPer === v ? '' : v; disegna(); var f = el.querySelector('form[data-g="sinonimo"] input[name="termini"]'); if (f) f.focus(); }
    else if (g === 'r-togli' || g === 'r-svuota') {
      if (g === 'r-svuota' && !window.confirm('Svuotare l\'elenco delle parole senza risultati?')) return true;
      T.api('DELETE', '/api/admin/ricerche-vuote' + (g === 'r-togli' ? '?testo=' + encodeURIComponent(v) : '')).then(carica, function (e) { msg('ricerca', errore(e)); disegna(); });
    } else if (g === 's-togli') {
      T.api('DELETE', '/api/admin/sinonimi/' + encodeURIComponent(v)).then(function () { msg('ricerca', 'Sinonimo tolto.', true); if (app()) app().caricaSinonimi(); return carica(); },
        function (e) { msg('ricerca', errore(e)); disegna(); });
    } else if (g === 's-modelli') {
      b.disabled = true;
      T.api('POST', '/api/admin/ia/modelli').then(function (r) { st.modelli = r.modelli || []; if (!st.modelli.length) msg('ia', 'Il servizio non ha indicato modelli.', true); },
        function (e) { msg('ia', errore(e)); }).then(disegna);
    } else return false;
    return true;
  }
  function modulo(g, f, d) {
    if (g === 'u-limite') {
      var q = String(d.get('quota') || '').trim();
      T.api('PATCH', '/api/admin/utenti/' + f.getAttribute('data-id'), { quota_ia: q === '' ? null : parseInt(q, 10) })
        .then(function () { msg('utenti', 'Limite salvato.', true); }, function (e) { msg('utenti', errore(e)); }).then(carica);
    } else if (g === 'sinonimo') {
      var parola = f.getAttribute('data-parola') || String(d.get('parola') || '').trim();
      var termini = String(d.get('termini') || '').split(',').map(function (x) { return x.trim(); }).filter(Boolean);
      st.bozza = { form: f.getAttribute('data-parola'), parola: String(d.get('parola') || ''), termini: String(d.get('termini') || '') };
      T.api('PUT', '/api/admin/sinonimi/' + encodeURIComponent(parola), { termini: termini }).then(function (r) {
        st.sinonimoPer = ''; st.bozza = null; msg('ricerca', 'Sinonimo salvato: «' + r.parola + '» trova anche ' + r.termini.map(function (x) { return '«' + x + '»'; }).join(', ') + '.', true);
        if (app()) app().caricaSinonimi();
      }, function (e) { msg('ricerca', errore(e)); }).then(carica);
    } else if (g === 's-limiti') {
      var qp = String(d.get('quota_predefinita') || '').trim(), tm = String(d.get('tetto_mese') || '').trim();
      T.api('PUT', '/api/admin/impostazioni', { quota_predefinita: qp === '' ? null : parseInt(qp, 10), tetto_mese: tm === '' ? null : parseInt(tm, 10),
        registrazione_aperta: !!d.get('registrazione_aperta') }).then(function () { msg('limiti', 'Salvato.', true); return app().aggiornaIo(); },
        function (e) { msg('limiti', errore(e)); }).then(carica);
    } else return false;
    return true;
  }

  /* ---------- ricerca: parole senza risultati e sinonimi aggiunti ---------- */
  function formSinonimo(parola) {
    var b = st.bozza && st.bozza.form === parola ? st.bozza : { parola: '', termini: '' };      // dopo un errore i campi restano
    return '<form class="fila" data-g="sinonimo" data-parola="' + esc(parola) + '">' +
      (parola ? '' : '<input class="campo corto" name="parola" required maxlength="40" placeholder="parola, per esempio muletto" aria-label="Parola" value="' + esc(b.parola) + '">') +
      '<input class="campo" name="termini" required maxlength="300" placeholder="termini della nomenclatura, separati da virgole" aria-label="Termini della nomenclatura" value="' + esc(b.termini) + '">' +
      '<button class="btn sm pri" type="submit">Salva</button></form>';
  }
  function ricerca() {
    var R = st.ricerca;
    if (!R) return '<p class="vuoto">Carico…</p>';
    var h = '<div class="foglio"><div class="box s7"><div class="lab">' + T.icona('domanda') + 'Parole cercate senza risultati<span class="dx">' + R.vuote.length + '</span></div>' + riga('ricerca');
    if (!R.vuote.length) h += '<p class="vuoto">Nessuna: ogni ricerca ha trovato qualcosa.</p>';
    else {
      h += '<div class="elenco">' + R.vuote.map(function (v) {
        var aperto = st.sinonimoPer === v.testo;
        return '<div class="voce"><div><b>«' + esc(v.testo) + '»</b><div class="nota">' + v.volte + (v.volte === 1 ? ' volta' : ' volte') + ', l\'ultima il ' + esc(T.dataOra(v.ultima)) + '</div>' +
          (aperto ? formSinonimo(v.testo) : '') + '</div>' +
          '<div class="azioni"><button class="btn sm" type="button" data-g="r-sinonimo" data-v="' + esc(v.testo) + '">' + T.icona('piu') + 'Sinonimo</button>' +
          '<button class="btn sm" type="button" data-g="r-togli" data-v="' + esc(v.testo) + '">Togli</button></div></div>';
      }).join('') + '</div>';
      h += '<div class="fila"><button class="btn sm" type="button" data-g="r-svuota">Svuota l\'elenco</button></div>';
    }
    h += '<p class="nota">Senza nome di chi ha cercato. Con un sinonimo la parola trova le voci della nomenclatura: usa i termini del testo ufficiale (per «muletto»: «carrelli»).</p></div>';
    h += '<div class="box s5"><div class="lab">' + T.icona('libro') + 'Sinonimi aggiunti<span class="dx">' + R.sinonimi.length + '</span></div>' +
      (R.sinonimi.length ? '<div class="elenco">' + R.sinonimi.map(function (s) {
        return '<div class="voce"><div><b>' + esc(s.parola) + '</b> → ' + esc(s.termini.join(', ')) + '<div class="nota">' + esc(s.autore) + (s.autore ? ', ' : '') + esc(T.dataOra(s.quando, true)) + '</div></div>' +
          '<div class="azioni"><button class="btn sm" type="button" data-g="s-togli" data-v="' + esc(s.parola) + '">' + T.icona('cestino') + 'Togli</button></div></div>';
      }).join('') + '</div>' : '<p class="vuoto">Ancora nessuno.</p>') +
      '<div class="lab" style="margin-top:6px">Nuovo sinonimo</div>' + formSinonimo('') +
      '<p class="nota">Valgono per tutti, insieme a quelli già pronti.</p></div></div>';
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
    if (modulo(g, f, d)) return;
    if (g === 'aggiorna') {
      T.api('POST', '/api/admin/dati/aggiorna', { mese: String(d.get('mese') || '').trim() })
        .then(function (r) { msg('aggiorna', 'Aggiornamento di ' + r.mese + ' avviato: segui l\'avanzamento qui sopra.', true); }, function (e) { msg('aggiorna', errore(e)); }).then(carica);
    } else if (g === 'carica') {
      msg('carica', 'Caricamento in corso…', true); disegna();
      T.api('POST', '/api/admin/dati/carica', d).then(function (r) { msg('carica', 'Archivio caricato: installazione di ' + r.mese + ' avviata.', true); },
        function (e) { msg('carica', errore(e)); }).then(carica);
    }
  });

  el.addEventListener('click', function (ev) {
    var b = ev.target.closest('[data-g]');
    if (!b || b.tagName === 'FORM') return;
    var g = b.getAttribute('data-g'), id = b.getAttribute('data-id'), v = b.getAttribute('data-v');
    if (g === 'sotto') { st.sotto = v; st.registro = null; st.link = null; disegna(); carica(); }
    else if (azione(g, b, id, v)) { /* utenti e IA */ }
    else if (g === 'usa') {
      if (!window.confirm('Usare i dati del ' + v.split('-').reverse().join('/') + ' al posto di quelli attuali? Vale per tutti.')) return;
      T.api('POST', '/api/admin/dati/attiva', { versione: v }).then(function () { T.avviso('Versione cambiata: ricarico la pagina.'); setTimeout(function () { location.reload(); }, 900); },
        function (e) { T.avviso(errore(e), 'male'); });
    } else if (g === 'riepilogo') {
      T.api('GET', '/api/admin/dati/riepilogo/' + v).then(function (r) { st.registro = { titolo: 'Riepilogo della versione ' + v.split('-').reverse().join('/'), testo: r.testo || '' }; disegna(); });
    } else if (g === 'registro-agg') {
      T.api('GET', '/api/admin/dati/registro/' + id).then(function (r) { st.registro = { titolo: 'Registro dell\'aggiornamento', testo: r.testo || '(vuoto)' }; disegna(); });
    } else if (g === 'chiudi-registro') { st.registro = null; disegna(); }
  });
})();
