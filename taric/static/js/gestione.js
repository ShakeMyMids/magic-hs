/* MAGIC HS - vista Gestione, per l'amministratore: utenti (richieste da approvare, chi è online, limiti, link per la password),
   intelligenza artificiale unica (stato, prova, limiti, uso per persona), dati TARIC con la copia del database, ricerca
   (parole cercate senza risultati e sinonimi aggiunti), registro. */
(function () {
  'use strict';
  var T = window.TARIC, esc = T.esc;
  var el = document.getElementById('view-gestione');
  var vista = T.viste = T.viste || {};
  var st = { aziende: null, azienda: '', sotto: 'utenti', riep: null, dati: null, eventi: [], msg: {}, registro: null, timer: null, modelli: [], utenti: null, iaS: null,
             aperto: 0, link: null, ricerca: null, sinonimoPer: '', bozza: null, trasporto: null, online: null, timerOnline: null };

  var ESITI = { ok: 'riuscito', errore: 'errore', non_disponibile: 'non ancora disponibile', in_corso: 'in corso', interrotto: 'interrotto' };
  var EVENTI = {
    dati_ok: 'Dati TARIC installati', dati_errore: 'Aggiornamento dati non riuscito', dati_non_disponibile: 'Estrazione non ancora disponibile',
    dati_versione_attivata: 'Versione dati cambiata', impostazioni_ia: 'Intelligenza artificiale cambiata',
    registrazione: 'Richiesta di account', approvato: 'Account approvato', rifiutato: 'Richiesta rifiutata', sospeso: 'Account sospeso',
    riattivato: 'Account riattivato', link_password: 'Link per la password', password_cambiata: 'Password cambiata',
    password_reimpostata: 'Password reimpostata', accesso_bloccato: 'Accesso bloccato (password errate)', utente_eliminato: 'Account eliminato',
    ruolo: 'Ruolo cambiato', quota_ia: 'Limite personale cambiato', impostazioni_sito: 'Limiti e registrazioni cambiati',
    backup_scaricato: 'Copia del database scaricata', sessioni_chiuse: 'Uscita da tutti i dispositivi',
    copia_esterna: 'Copia del database mandata fuori', copia_esterna_errore: 'Copia esterna non riuscita',
    sinonimo: 'Sinonimo aggiunto', sinonimo_tolto: 'Sinonimo tolto', tariffe_trasporto: 'Tariffe di trasporto caricate',
    tariffe_trasporto_attivate: 'Tariffe di trasporto cambiate', carburante: 'Supplemento carburante cambiato',
    segnalazione: 'Problema segnalato', segnalazione_risolta: 'Segnalazione risolta', segnalazione_riaperta: 'Segnalazione riaperta',
    azienda: 'Azienda cambiata', azienda_regole: 'Regole dell\'azienda', azienda_disconnessa: 'Azienda disconnessa', azienda_sospesa: 'Azienda sospesa',
    azienda_riattivata: 'Azienda riattivata', azienda_rinominata: 'Azienda rinominata'
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
    if (st.sotto === 'utenti') chiamate.push(T.api('GET', '/api/admin/online').then(function (r) { st.online = r; }, function () { /* al prossimo giro */ }));
    if (st.sotto === 'aziende') chiamate.push(T.api('GET', '/api/admin/aziende').then(function (r) { st.aziende = r; }));
    if (st.sotto === 'ia') chiamate.push(T.api('GET', '/api/admin/ia').then(function (r) { st.iaS = r; }));
    if (st.sotto === 'dati') chiamate.push(T.api('GET', '/api/admin/dati').then(function (r) { st.dati = r; }));
    if (st.sotto === 'ricerca') chiamate.push(T.api('GET', '/api/admin/ricerca').then(function (r) { st.ricerca = r; }));
    if (st.sotto === 'trasporto') chiamate.push(T.api('GET', '/api/admin/trasporto').then(function (r) { st.trasporto = r; }));
    if (st.sotto === 'segnalazioni') chiamate.push(T.api('GET', '/api/admin/segnalazioni').then(function (r) { st.segnalazioni = r.voci; }));
    if (st.sotto === 'registro') chiamate.push(T.api('GET', '/api/admin/eventi?limite=300').then(function (r) { st.eventi = r.eventi; }));
    return Promise.all(chiamate).then(disegna, function (e) { el.innerHTML = '<p class="errore">' + esc(errore(e)) + '</p>'; });
  }

  /* ------------------------------------------------------------------ disegno */
  function disegna() {
    var r = st.riep, h = '';
    var schede = [['utenti', 'Utenti', 'utenti'], ['aziende', 'Aziende', 'container'], ['ia', 'Intelligenza artificiale', 'scintille'], ['dati', 'Dati TARIC', 'database'], ['ricerca', 'Ricerca', 'cerca'], ['trasporto', 'Trasporto', 'nave'], ['segnalazioni', 'Segnalazioni', 'attenzione'], ['registro', 'Registro', 'registro']];
    h += '<div class="sotto" role="group" aria-label="Parti della gestione">' + schede.map(function (x) {
      return '<button class="btn sm" type="button" data-g="sotto" data-v="' + x[0] + '"' + (st.sotto === x[0] ? ' aria-current="page"' : '') + '>' + T.icona(x[2]) + x[1] + '</button>';
    }).join('') + '</div>';
    if (r) h += avvisi(r);
    h += { dati: dati, registro: registro, ia: ia, utenti: utenti, aziende: aziende, ricerca: ricerca, trasporto: trasporto, segnalazioni: segnalazioni }[st.sotto]();
    el.innerHTML = h;
    pianificaRinfresco();
    giroOnline();
  }

  function avvisi(r) {
    var a = [], h = '';
    if (r.in_attesa && st.sotto !== 'utenti') a.push(r.in_attesa === 1 ? 'C\'è una richiesta di account da approvare: vai su Utenti.' : 'Ci sono ' + r.in_attesa + ' richieste di account da approvare: vai su Utenti.');
    if (r.segnalazioni && st.sotto !== 'segnalazioni') a.push(r.segnalazioni === 1 ? 'C\'è una segnalazione di un problema da leggere: vai su Segnalazioni.'
      : 'Ci sono ' + r.segnalazioni + ' segnalazioni di problemi da leggere: vai su Segnalazioni.');
    if (!r.ia && st.sotto !== 'ia') a.push('La classificazione assistita è spenta: inserisci la chiave di Gemini nel servizio su Render (vedi Intelligenza artificiale).');
    if (!r.dati) a.push('Non ci sono ancora dati TARIC: vai su Dati TARIC.');
    if (r.copia_esterna && st.sotto !== 'dati') a.push(r.copia_esterna === 'errore' ? 'L\'ultima copia del database fuori da Render non è riuscita: vedi Dati TARIC.' : 'La copia del database fuori da Render è spenta: manca qualcosa nelle variabili MAGIC_HS_COPIA_* (vedi Dati TARIC).');
    if (r.carburante_giorni > 7 && st.sotto !== 'trasporto') a.push(r.carburante_giorni === 999 ? 'Manca il supplemento carburante di DHL Express per il calcolatore del trasporto (vedi Trasporto).'
      : 'Il supplemento carburante del calcolatore del trasporto è di ' + r.carburante_giorni + ' giorni fa: DHL lo cambia ogni settimana (vedi Trasporto).');
    if (a.length) h += '<div class="foglio"><div class="box"><div class="lab">' + T.icona('attenzione') + 'Da sistemare</div>' + a.map(function (t) { return '<p class="avviso">' + esc(t) + '</p>'; }).join('') + '</div></div>';
    return h;
  }

  /* ---------- dati TARIC ---------- */
  function dati() {
    var d = st.dati;
    if (!d) return '<p class="vuoto">Carico…</p>';
    var h = '<div class="foglio"><div class="box s8"><div class="lab">' + T.icona('database') + 'Dati in uso</div>';
    var att = d.versioni.filter(function (v) { return v.attiva; })[0];
    if (att) h += '<p class="cosa">Situazione al ' + esc(String(att.data || att.versione).split('-').reverse().join('/')) + '</p><p class="nota">' + esc(att.righe || '?') + ' righe di nomenclatura, ' + esc(att.dichiarabili || '?') +
      ' codici dichiarabili, ' + esc(att.misure_import || '?') + ' misure all\'importazione e ' + esc(att.misure_export || '?') + ' all\'esportazione; ' + esc(att.righe_en || 0) + ' righe ancora in inglese.</p>' +
      (att.avvisi && att.avvisi.length ? '<p class="avviso">' + esc(att.avvisi.join(' · ')) + '</p>' : '');
    else h += '<p class="avviso">Nessun dato installato.</p>';
    if (d.in_corso) h += '<p class="esito-ok">Aggiornamento di ' + esc(nomeMese(d.in_corso.mese)) + ' in corso: ' + esc(d.in_corso.fase) + '…</p>';
    h += '<p class="nota">A ogni inizio mese arrivano da soli, pronti da GitHub; se non ci sono ancora li prepara il server.</p>';
    h += (d.prossimo ? '<p class="nota">Prossimo tentativo per ' + esc(nomeMese(d.prossimo)) + ' entro dieci minuti.</p>' : '') + '</div>';
    h += '<div class="box s4"><div class="lab">' + T.icona('aggiorna') + 'Aggiorna adesso</div><form class="modulo" data-g="aggiorna"><label>Mese (vuoto = corrente)<input class="campo" name="mese" placeholder="AAAA-MM" pattern="\\d{4}-\\d{2}"></label>' +
      '<div class="fila"><button class="btn pri" type="submit"' + (d.in_corso ? ' disabled' : '') + '>Scarica e installa</button></div>' + riga('aggiorna') + '</form></div></div>';

    h += copiaDatabase(d.copia_esterna || {});

    h += '<div class="foglio"><div class="box"><div class="lab">' + T.icona('carica') + 'Carica a mano un\'estrazione</div><p class="nota">I file Excel del mese (CIRCABC «TARIC and Quota data and information») in un archivio .zip.</p>' +
      '<form class="modulo" data-g="carica"><div class="due"><label>Archivio .zip<input class="campo" type="file" name="file" accept=".zip,application/zip" required></label>' +
      '<label>Mese dell\'estrazione<input class="campo" name="mese" placeholder="AAAA-MM" pattern="\\d{4}-\\d{2}"></label></div>' +
      '<div class="fila"><button class="btn" type="submit"' + (d.in_corso ? ' disabled' : '') + '>Carica e installa</button></div>' + riga('carica') + '</form></div></div>';

    h += versioniDati(d);

    h += '<div class="foglio"><div class="box"><div class="lab">' + T.icona('storico') + 'Ultimi aggiornamenti</div><div class="scorri"><table class="tab"><thead><tr><th>Quando</th><th>Mese</th><th>Origine</th><th>Esito</th><th>Messaggio</th><th></th></tr></thead><tbody>' +
      d.ultimi.map(function (a) {
        return '<tr><td>' + esc(T.dataOra(a.iniziato)) + '</td><td data-l="Mese">' + esc(nomeMese(a.mese)) + '</td><td data-l="Origine">' + esc(a.origine.replace(/_/g, ' ')) + '</td><td data-l="Esito"><span class="st ' + esc(a.esito) + '">' + esc(ESITI[a.esito] || a.esito) + '</span></td><td>' + esc(a.messaggio) + '</td>' +
          '<td>' + (a.esito === 'errore' || a.esito === 'ok' ? '<button class="btn sm" type="button" data-g="registro-agg" data-id="' + a.id + '">Registro</button>' : '') + '</td></tr>';
      }).join('') + '</tbody></table></div>' + (d.ultimi.length ? '' : '<p class="vuoto">Nessun aggiornamento ancora.</p>') +
      registroAperto() + '</div></div>';
    return h;
  }
  /* copia del database: sul disco del server ogni giorno, fuori da Render ogni settimana (MAGIC_HS_COPIA_*) */
  function copiaDatabase(c) {
    var h = '<div class="foglio"><div class="box"><div class="lab">' + T.icona('scarica') + 'Copia del database</div>' +
      '<p class="nota">Account, storico, preferiti e uso dell\'IA di tutti. Il server ne fa una al giorno sul suo disco' +
      (c.attiva ? ' e una alla settimana in <b>' + esc(c.destinazione) + '</b>.' : '; scaricane una ogni tanto da tenere altrove.') + '</p>';
    if (c.attiva && c.esito === 'errore') h += '<p class="errore">Invio del ' + esc(T.dataOra(c.tentata)) + ' non riuscito: ' + esc(c.messaggio) + '. Si riprova da solo dopo 6 ore.</p>';
    if (c.attiva && c.riuscita) h += '<p class="esito-ok">Ultima copia esterna: ' + esc(T.dataOra(c.riuscita)) + ' (' + esc(c.oggetto) + ')</p>';
    else if (c.attiva && !c.tentata) h += '<p class="nota">La prima copia esterna parte entro dieci minuti.</p>';
    if (c.problema) h += '<p class="avviso">Copia esterna spenta. ' + esc(c.problema) + '</p>';
    else if (!c.attiva) h += '<p class="nota">Per mandarne una alla settimana fuori da Render (Backblaze B2, Cloudflare R2, Amazon S3…) imposta le variabili <code>MAGIC_HS_COPIA_*</code> del servizio, come spiega il README.</p>';
    return h + '<div class="fila"><a class="btn sm" href="/api/admin/backup" download>' + T.icona('scarica') + 'Scarica la copia</a>' +
      (c.attiva ? '<button class="btn sm" type="button" data-g="copia-esterna"' + (st.copiaInCorso ? ' disabled' : '') + '>' + T.icona('carica') + (st.copiaInCorso ? 'Invio in corso…' : 'Manda fuori adesso') + '</button>' : '') +
      '</div>' + riga('copia') + '</div></div>';
  }
  function registroAperto() {
    return st.registro ? '<div class="lab" style="margin-top:8px">' + esc(st.registro.titolo) + '<span class="dx"><button class="link" type="button" data-g="chiudi-registro">chiudi</button></span></div><pre class="registro">' + esc(st.registro.testo) + '</pre>' : '';
  }
  function versioniDati(d) {
    return '<div class="foglio"><div class="box"><div class="lab">' + T.icona('pacco') + 'Versioni installate</div><div class="scorri"><table class="tab"><thead><tr><th>Situazione al</th><th class="n">Righe</th><th class="n">Misure import</th><th>Generata</th><th></th></tr></thead><tbody>' +
      d.versioni.map(function (v) {
        return '<tr' + (v.attiva ? ' class="evid"' : '') + '><td>' + esc(v.versione.split('-').reverse().join('/')) + (v.attiva ? ' <span class="st ok">in uso</span>' : '') + '</td><td class="n" data-l="Righe">' + esc(v.righe || '') + '</td><td class="n" data-l="Misure import">' + esc(v.misure_import || '') +
          '</td><td data-l="Generata">' + esc(T.dataOra(v.generato)) + '</td><td class="azioni"><button class="btn sm" type="button" data-g="riepilogo" data-v="' + esc(v.versione) + '">Riepilogo</button>' +
          (v.attiva ? '' : '<button class="btn sm" type="button" data-g="usa" data-v="' + esc(v.versione) + '">Usa questa</button>') + '</td></tr>';
      }).join('') + '</tbody></table></div></div></div>';
  }

  var meseIt = T.meseIt;
  function nomeMese(m) { return meseIt(m) || m || ''; }          // «2026-11» -> «novembre 2026»

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
    h += '<div class="foglio"><div class="box" id="g-online" aria-live="polite">' + online() + '</div></div>';
    h += '<div class="foglio"><div class="box"><div class="lab">' + T.icona('utenti') + 'Persone<span class="dx">' + altri.length + '</span></div>' + riga('utenti');
    if (!altri.length) h += '<p class="vuoto">Ancora nessuno: chi si registra compare qui da approvare.</p>';
    else {
      h += '<div class="scorri"><table class="tab"><thead><tr><th>Persona</th><th>Stato</th><th class="n">IA a ' + esc(meseIt(U.mese)) + '</th><th>Ultimo accesso</th><th></th></tr></thead><tbody>' +
        altri.map(function (x) {
          var s = STATI[x.stato] || [x.stato, ''], aperto = st.aperto === x.id;
          var r = '<tr' + (aperto ? ' class="evid"' : '') + '><td>' + persona(x) + '</td><td data-l="Stato"><span class="st ' + s[1] + '">' + esc(s[0]) + '</span></td>' +
            '<td class="n" data-l="IA">' + (x.limite === 0 && !x.uso.classificazioni ? '<span class="nota">spenta</span>' : numero(x.uso.classificazioni) + (x.limite !== null ? ' / ' + numero(x.limite) : '')) + '</td>' +
            '<td data-l="Ultimo accesso" data-uid="' + x.id + '">' + ultimoAccesso(x) + '</td>' +
            '<td class="azioni"><button class="btn sm" type="button" data-g="u-apri" data-id="' + x.id + '" aria-expanded="' + aperto + '">' + (aperto ? 'Chiudi' : 'Modifica') + '</button></td></tr>';
          if (aperto) r += '<tr class="dettaglio"><td colspan="5">' + dettaglioUtente(x, U.io) + '</td></tr>';
          return r;
        }).join('') + '</tbody></table></div>';
    }
    var note = {};
    U.utenti.forEach(function (x) { var n = String(x.azienda || '').trim(); if (n) note[n.toLowerCase()] = note[n.toLowerCase()] || n; });
    h += '<datalist id="aziende-note">' + Object.keys(note).sort().map(function (k) { return '<option value="' + esc(note[k]) + '">'; }).join('') + '</datalist>';
    return h + '<p class="nota">Chi si registra dalla pagina d\'accesso resta in attesa finché non lo approvi. Password dimenticata: prepara un link e mandalo alla persona.</p></div></div>';
  }

  function dettaglioUtente(x, io) {
    var me = x.id === io, h = '<div class="pannello">';
    h += '<form class="fila" data-g="u-limite" data-id="' + x.id + '"><label class="corto">Classificazioni con l\'IA al mese' +
      '<input class="campo" type="number" min="0" max="100000" name="quota" value="' + (x.quota_ia === null ? '' : esc(x.quota_ia)) + '" placeholder="predefinito"></label>' +
      '<button class="btn sm" type="submit">Salva</button><span class="nota">Ora: ' + esc(limiteDi(x)) + (x.quota_ia === null ? ' (predefinito)' : '') + '. Vuoto = predefinito, 0 = IA spenta.</span></form>';
    h += '<form class="fila" data-g="u-azienda" data-id="' + x.id + '"><label class="corto">Azienda<input class="campo largo" name="azienda" maxlength="150" list="aziende-note" value="' +
      esc(x.azienda) + '" placeholder="nessuna"></label><button class="btn sm" type="submit">Salva</button>' +
      '<span class="nota">Chi cambia azienda ne prende le regole (vedi Aziende).</span></form>';
    h += '<div class="fila"><button class="btn sm" type="button" data-g="u-link" data-id="' + x.id + '">' + T.icona('chiave') + 'Link per la password</button>';
    if (!me) h += '<button class="btn sm" type="button" data-g="u-esci" data-id="' + x.id + '">' + T.icona('esci') + 'Disconnetti</button>';
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
      '<label>Email approvate subito, con l\'IA spenta<input class="campo" name="domini_automatici" value="' + esc((A.domini_automatici || []).join(', ')) + '" placeholder="nessun dominio" autocomplete="off" autocapitalize="none" spellcheck="false"></label>' +
      '<div class="fila"><button class="btn pri" type="submit">Salva</button></div>' + riga('limiti') +
      '<p class="nota">Domini dopo la @, separati da virgole. Per dare l\'IA a una persona: Utenti › Modifica, limite vuoto o un numero. Gli amministratori non hanno limite personale.</p></form></div></div>';

    var u = A.uso || {}, cache = u.token_in ? Math.round(u.token_cache / u.token_in * 100) : 0;
    h += '<div class="foglio"><div class="box"><div class="lab">' + T.icona('grafico') + 'Uso a ' + esc(meseIt(u.mese)) + '</div>' +
      '<p class="cosa">' + numero(u.classificazioni) + (u.classificazioni === 1 ? ' classificazione' : ' classificazioni') + (A.tetto_mese !== null ? ' su ' + numero(A.tetto_mese) : '') + '</p>' +
      '<p class="nota">' + numero(u.richieste) + ' richieste, ' + numero(u.token_in) + ' token in ingresso' + (u.token_in ? ' (' + cache + '% dalla cache, che costano molto meno)' : '') +
      ' e ' + numero(u.token_out) + ' in uscita. La spesa esatta è nella ' + (A.fornitore === 'gemini' || !A.fornitore
        ? '<a href="https://console.cloud.google.com/billing" target="_blank" rel="noopener">fatturazione di Google Cloud</a>' : 'fatturazione del servizio IA') +
      ', dove conviene impostare un budget con avvisi.</p>';
    var chi = U ? U.utenti.filter(function (x) { return x.uso.richieste; }).sort(function (a, b) { return b.uso.classificazioni - a.uso.classificazioni; }) : [];
    if (chi.length) h += '<div class="scorri"><table class="tab"><thead><tr><th>Persona</th><th class="n">Classificazioni</th><th class="n">Limite</th><th class="n">Richieste</th><th class="n">Token</th></tr></thead><tbody>' +
      chi.map(function (x) {
        return '<tr><td>' + esc(x.nome) + '</td><td class="n" data-l="Classificazioni">' + numero(x.uso.classificazioni) + '</td><td class="n" data-l="Limite">' + esc(limiteDi(x)) +
          '</td><td class="n" data-l="Richieste">' + numero(x.uso.richieste) + '</td><td class="n" data-l="Token">' + numero(x.uso.token_in + x.uso.token_out) + '</td></tr>';
      }).join('') + '</tbody></table></div>';
    return h + '</div></div>';
  }

  /* ---------- chi è online adesso: si aggiorna da solo ogni 15 secondi (solo il riquadro e la colonna «Ultimo accesso») ---------- */
  var STATI_ONLINE = {
    attivo: ['attivo', 'ok', 'Ha la pagina davanti e l\'ha usata negli ultimi minuti'],
    fermo: ['fermo', 'ambra', 'Ha la pagina davanti ma non la tocca da un po\''],
    sfondo: ['in secondo piano', '', 'MAGIC HS è aperto in un\'altra scheda o dietro un\'altra app']
  };
  function durata(s) {
    var m = Math.floor((s || 0) / 60), o = Math.floor(m / 60);
    if (m < 1) return 'poco';
    if (m < 60) return m + ' min';
    return (o === 1 ? '1 ora' : o + ' ore') + (m % 60 ? ' e ' + (m % 60) + ' min' : '');
  }
  function statoOnline(d) {
    var s = STATI_ONLINE[d.stato] || STATI_ONLINE.sfondo;
    return '<span class="st ' + s[1] + '" title="' + esc(s[2]) + '">' + esc(s[0] + (d.stato === 'fermo' ? ' da ' + durata(d.fermo) : '')) + '</span>';
  }
  function online() {
    var O = st.online, h = '<div class="lab">' + T.icona('online') + 'Online ora' + (O ? '<span class="dx">' + O.persone.length + '</span>' : '') + '</div>';
    if (!O) return h + '<p class="vuoto">Carico…</p>';
    if (!O.persone.length) return h + '<p class="vuoto">Nessuno in questo momento.</p>';
    return h + '<div class="elenco">' + O.persone.map(function (x) {
      var piu = x.dispositivi.length > 1;
      return '<div class="voce online"><div><b>' + esc(x.nome) + '</b>' + (x.id === O.io ? ' <span class="nota">(tu)</span>' : '') +
        '<div class="nota">' + esc(x.email) + (x.azienda ? ' · ' + esc(x.azienda) : '') + '</div>' +
        '<ul class="dispositivi">' + x.dispositivi.map(function (d) {
          return '<li>' + T.icona(d.tipo) + '<span>' + esc(d.descrizione) + (piu ? ' · ' + esc((STATI_ONLINE[d.stato] || STATI_ONLINE.sfondo)[0]) : '') +
            ' · da ' + esc(durata(d.da)) + '</span></li>';
        }).join('') + '</ul></div><div class="azioni">' + statoOnline(x.dispositivi[0]) + '</div></div>';
    }).join('') + '</div>';
  }
  function ultimoAccesso(x) {
    var on = st.online && st.online.persone.some(function (p) { return p.id === x.id; });
    return on ? '<span class="st ok">online</span>' : esc(x.ultimo_accesso ? T.dataOra(x.ultimo_accesso) : 'mai');
  }
  function mostraOnline() {
    var box = document.getElementById('g-online');
    if (box) box.innerHTML = online();
    Array.prototype.forEach.call(el.querySelectorAll('td[data-uid]'), function (td) {
      var x = st.utenti && st.utenti.utenti.filter(function (u) { return String(u.id) === td.getAttribute('data-uid'); })[0];
      if (x) td.innerHTML = ultimoAccesso(x);
    });
  }
  function aggiornaOnline() {
    return T.api('GET', '/api/admin/online', null, { resta: true }).then(function (r) { st.online = r; mostraOnline(); }, function () { /* al prossimo giro */ });
  }
  function giroOnline() {          // finché si vede Gestione › Utenti
    clearTimeout(st.timerOnline);
    if (el.hidden || st.sotto !== 'utenti' || document.visibilityState === 'hidden') return;
    st.timerOnline = setTimeout(function () { if (!el.hidden && st.sotto === 'utenti') aggiornaOnline().then(giroOnline); }, 15000);
  }
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible' && !el.hidden && st.sotto === 'utenti') aggiornaOnline().then(giroOnline);
  });

  /* puntino sulla scheda Gestione quando ci sono richieste da approvare o segnalazioni da leggere */
  function segnaRichieste(r) {
    var tab = document.getElementById('tab-gestione');
    if (!tab) return;
    var t = [];
    if (r.in_attesa) t.push(r.in_attesa === 1 ? 'una richiesta di account da approvare' : r.in_attesa + ' richieste di account da approvare');
    if (r.segnalazioni) t.push(r.segnalazioni === 1 ? 'una segnalazione da leggere' : r.segnalazioni + ' segnalazioni da leggere');
    tab.classList.toggle('novita', t.length > 0);
    if (t.length) tab.title = t.join(', ').charAt(0).toUpperCase() + t.join(', ').slice(1); else tab.removeAttribute('title');
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
    } else if (g === 'u-esci') {
      if (!window.confirm('Disconnettere ' + (x ? x.nome : '') + ' da tutti i dispositivi? Dovrà rientrare con la password.')) return true;
      azioneUtente(id, 'esci-ovunque', null, (x ? x.nome : 'La persona') + ' è stato disconnesso da tutti i dispositivi.');
    } else if (g === 'az-apri') {
      st.azienda = st.azienda === v ? '' : v; disegna();
    } else if (g === 'az-disconnetti' || g === 'az-sospendi' || g === 'az-riattiva') {
      var az = (st.aziende && st.aziende.aziende || []).filter(function (a) { return a.chiave === v; })[0], nomeAz = az ? az.nome : v;
      var cosa = { 'az-disconnetti': ['disconnetti', 'Disconnettere tutte le persone di ' + nomeAz + '? Dovranno rientrare con la password.'],
        'az-sospendi': ['sospendi', 'Sospendere tutte le persone di ' + nomeAz + '? Non potranno accedere finché non le riattivi.'],
        'az-riattiva': ['riattiva', 'Riattivare le persone sospese di ' + nomeAz + '?'] }[g];
      if (!window.confirm(cosa[1] + ' Gli amministratori restano come sono.')) return true;
      T.api('POST', '/api/admin/aziende/azione', { azienda: v, azione: cosa[0] }).then(function (r) {
        msg('aziende', nomeAz + ': ' + ({ disconnetti: 'disconnesse', sospendi: 'sospese', riattiva: 'riattivate' }[cosa[0]]) + ' ' + personeTesto(r.persone) + '.', true);
      }, function (e) { msg('aziende', errore(e)); }).then(carica);
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
    } else if (g === 'carburante-leggi') {
      st.carburanteInCorso = true; msg('carburante-leggi', 'Leggo la pagina di DHL…', true); disegna();
      T.api('POST', '/api/admin/trasporto/carburante/aggiorna').then(function (r) {
        var c = r.carburante;
        msg('carburante-leggi', 'Letto: Express ' + String(c.percentuale).replace('.', ',') + ' %' + (c.economy !== null ? ', Economy Select ' + String(c.economy).replace('.', ',') + ' %' : '') + '.', true);
        if (T.spedizione) T.spedizione.dimentica();
      }, function (e) { msg('carburante-leggi', errore(e)); }).then(function () { st.carburanteInCorso = false; return carica(); });
    } else if (g === 'segnalazione-elimina') {
      if (!window.confirm('Eliminare questa segnalazione? Non si può annullare.')) return true;
      T.api('DELETE', '/api/admin/segnalazioni/' + id).then(function () { msg('segnalazioni', 'Segnalazione eliminata.', true); },
        function (e) { msg('segnalazioni', errore(e)); }).then(carica);
    } else if (g === 'trasporto-usa') {
      T.api('POST', '/api/admin/trasporto/' + id + '/attiva').then(function () { msg('trasporto-pdf', 'Tariffa cambiata.', true); if (T.spedizione) T.spedizione.dimentica(); },
        function (e) { msg('trasporto-pdf', errore(e)); }).then(carica);
    } else if (g === 's-modelli') {
      b.disabled = true;
      T.api('POST', '/api/admin/ia/modelli').then(function (r) { st.modelli = r.modelli || []; if (!st.modelli.length) msg('ia', 'Il servizio non ha indicato modelli.', true); },
        function (e) { msg('ia', errore(e)); }).then(disegna);
    } else return false;
    return true;
  }
  function modulo(g, f, d, premuto) {
    if (g === 'u-azienda') {
      T.api('PATCH', '/api/admin/utenti/' + f.getAttribute('data-id'), { azienda: String(d.get('azienda') || '') })
        .then(function () { msg('utenti', 'Azienda salvata.', true); }, function (e) { msg('utenti', errore(e)); }).then(carica);
      return true;
    }
    if (g === 'az-regole') {
      var qa = String(d.get('quota') || '').trim(), spenta = !!d.get('spenta'), chiave = f.getAttribute('data-v');
      T.api('PUT', '/api/admin/aziende/regole', { azienda: chiave, quota_ia: qa === '' ? null : parseInt(qa, 10), ia: !spenta }).then(function (r) {
        msg('aziende', 'Regole salvate per ' + personeTesto(r.persone) + ' (e per chi entra dopo).', true);
      }, function (e) { msg('aziende', errore(e)); }).then(carica);
      return true;
    }
    if (g === 'az-nome') {
      T.api('PUT', '/api/admin/aziende/nome', { azienda: f.getAttribute('data-v'), nome: String(d.get('nome') || '') }).then(function (r) {
        st.azienda = r.nome.toLowerCase().split(/\s+/).join(' ');
        msg('aziende', r.unite ? 'Aziende unite in «' + r.nome + '».' : 'Nuovo nome: «' + r.nome + '».', true);
      }, function (e) { msg('aziende', errore(e)); }).then(carica);
      return true;
    }
    if (g === 'segnalazione') {
      var stato = premuto && premuto.getAttribute('data-stato') === 'aperta' ? 'aperta' : 'chiusa', prima = f.getAttribute('data-stato');
      T.api('PUT', '/api/admin/segnalazioni/' + f.getAttribute('data-id'), { stato: stato, risposta: String(d.get('risposta') || '') }).then(function () {
        msg('segnalazioni', stato === prima ? 'Risposta salvata.' : stato === 'chiusa' ? 'Segnalazione risolta.' : 'Segnalazione riaperta.', true);
      }, function (e) { msg('segnalazioni', errore(e)); }).then(carica);
      return true;
    }
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
    } else if (g === 'trasporto-pdf') {
      st.trasportoInCorso = true; msg('trasporto-pdf', 'Leggo e controllo il PDF…', true); disegna();
      T.api('POST', '/api/admin/trasporto', d).then(function (r) {
        msg('trasporto-pdf', 'Tariffe in uso: ' + r.titolo + (r.avvisi.length ? ' (con ' + r.avvisi.length + (r.avvisi.length === 1 ? ' avviso)' : ' avvisi)') : '') + '.', true);
        if (T.spedizione) T.spedizione.dimentica();
      }, function (e) { msg('trasporto-pdf', errore(e)); }).then(function () { st.trasportoInCorso = false; return carica(); });
    } else if (g === 'carburante') {
      var perc = parseFloat(String(d.get('percentuale') || '').replace(',', '.')), eco = String(d.get('economy') || '').trim();
      var ecoN = eco === '' ? null : parseFloat(eco.replace(',', '.'));
      if (!(perc >= 0 && perc <= 100) || (ecoN !== null && !(ecoN >= 0 && ecoN <= 100))) { msg('carburante', 'Scrivi percentuali tra 0 e 100.'); disegna(); return true; }
      T.api('PUT', '/api/admin/trasporto/carburante', { percentuale: perc, economy: ecoN, dal: String(d.get('dal') || '') }).then(function () {
        msg('carburante', 'Salvato.', true); if (T.spedizione) T.spedizione.dimentica();
      }, function (e) { msg('carburante', errore(e)); }).then(carica);
    } else if (g === 's-limiti') {
      var qp = String(d.get('quota_predefinita') || '').trim(), tm = String(d.get('tetto_mese') || '').trim();
      var dom = String(d.get('domini_automatici') || '').split(/[\s,;]+/).map(function (x) { return x.trim(); }).filter(Boolean);
      T.api('PUT', '/api/admin/impostazioni', { quota_predefinita: qp === '' ? null : parseInt(qp, 10), tetto_mese: tm === '' ? null : parseInt(tm, 10),
        registrazione_aperta: !!d.get('registrazione_aperta'), domini_automatici: dom }).then(function () { msg('limiti', 'Salvato.', true); return app().aggiornaIo(); },
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
    if (!R.vuote.length) h += '<p class="vuoto illustrato">' + (T.vignetta ? T.vignetta('faro') : '') + 'Nessuna: ogni ricerca ha trovato qualcosa.</p>';
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

  /* ---------- trasporto: guida alle tariffe di DHL Express e supplemento carburante ---------- */
  function dataIt(s) { return s ? String(s).slice(0, 10).split('-').reverse().join('/') : ''; }
  function trasporto() {
    var R = st.trasporto;
    if (!R) return '<p class="vuoto">Carico…</p>';
    var V = R.versioni, att = V.filter(function (v) { return v.attiva; })[0], c = R.carburante;
    var h = '<div class="foglio"><div class="box s7"><div class="lab">' + T.icona('nave') + 'Tariffe DHL Express</div>';
    if (att) h += '<p class="cosa">' + esc(att.titolo) + '</p><p class="nota">Valide dal ' + esc(dataIt(att.validita) || '(data non indicata)') +
      ' · caricate il ' + esc(T.dataOra(att.caricata)) + (att.autore ? ' da ' + esc(att.autore) : '') + '</p>' +
      (att.avvisi.length ? att.avvisi.map(function (x) { return '<p class="avviso">' + esc(x) + '</p>'; }).join('') : '') +
      '<pre class="registro">' + esc(att.riepilogo) + '</pre>';
    else h += '<p class="nota">Nessuna tariffa: carica la «Guida ai servizi e alle tariffe» di DHL Express in PDF.</p>';
    h += '<form class="modulo" data-g="trasporto-pdf"><label>Guida alle tariffe in PDF<input class="campo" type="file" name="file" accept=".pdf,application/pdf" required></label>' +
      '<div class="fila"><button class="btn pri" type="submit"' + (st.trasportoInCorso ? ' disabled' : '') + '>' + T.icona('carica') + (st.trasportoInCorso ? 'Leggo il PDF…' : 'Carica e controlla') + '</button></div>' +
      riga('trasporto-pdf') + '</form><p class="nota">Il PDF si legge e si controlla (zone, prezzi, scatti): se qualcosa non torna resta la tariffa di prima. Quando DHL pubblica la guida nuova, caricala qui.</p></div>';
    var vecchio = R.carburante_giorni > 7, auto = R.carburante_auto || {}, pc = function (v) { return esc(String(v).replace('.', ',')) + '\u00a0%'; };
    h += '<div class="box s5"><div class="lab">' + T.icona('percento') + 'Supplemento carburante</div>';
    if (c) h += '<p class="cosa">' + pc(c.percentuale) + '</p><p class="nota">Express (Worldwide e servizi a orario)' +
      (c.economy !== null && c.economy !== undefined ? ' · Economy Select ' + pc(c.economy) : '') + '</p><p class="nota">' +
      (c.fonte === 'dhl' ? 'Settimana dal ' + esc(dataIt(c.dal)) + ' al ' + esc(dataIt(c.al)) + ', dalla pagina di DHL (letta il ' + esc(T.dataOra(c.aggiornato)) + ').'
        : 'Dal ' + esc(dataIt(c.dal)) + ', scritto a mano' + (c.autore ? ' da ' + esc(c.autore) : '') + '.') + '</p>' +
      (vecchio ? '<p class="avviso">Della settimana del ' + esc(dataIt(c.dal)) + ': DHL lo cambia ogni settimana.</p>' : '');
    else h += '<p class="avviso">Non ancora indicato: il calcolatore lo chiede a chi lo usa.</p>';
    if (!auto.attivo) h += '<p class="nota">Lettura automatica spenta (MAGIC_HS_CARBURANTE_URL vuota): scrivilo a mano.</p>';
    else {
      if (auto.esito === 'errore') h += '<p class="avviso">Lettura del ' + esc(T.dataOra(auto.tentato)) + ' non riuscita: ' + esc(auto.messaggio || '') + '. Resta il valore di prima; riprovo tra 6 ore.</p>';
      h += '<p class="nota">Si aggiorna da solo ogni giorno dalla pagina dei supplementi di DHL Express Italia.</p>' +
        '<div class="fila"><button class="btn" type="button" data-g="carburante-leggi"' + (st.carburanteInCorso ? ' disabled' : '') + '>' + T.icona('aggiorna') + 'Leggi adesso</button></div>';
    }
    h += riga('carburante-leggi') + '<details class="piu"' + (auto.attivo && auto.esito !== 'errore' && !st.msg.carburante ? '' : ' open') + '><summary>Scrivi a mano</summary>' +
      '<form class="modulo" data-g="carburante"><div class="due"><label>Express (%)<input class="campo" name="percentuale" inputmode="decimal" autocomplete="off" required placeholder="per esempio 35,25"></label>' +
      '<label>Economy Select (%)<input class="campo" name="economy" inputmode="decimal" autocomplete="off" placeholder="facoltativo"></label></div>' +
      '<label>Valido dal<input class="campo" type="date" name="dal"></label><div class="fila"><button class="btn" type="submit">Salva</button></div>' + riga('carburante') +
      '</form>' + (auto.attivo ? '<p class="nota">Il valore scritto a mano vale fino alla domenica della sua settimana, poi torna quello della pagina di DHL.</p>' : '') + '</details></div></div>';
    if (V.length > 1) h += '<div class="foglio"><div class="box"><div class="lab">' + T.icona('storico') + 'Tariffe caricate</div><div class="scorri"><table class="tab"><thead><tr><th>Guida</th><th>Valida dal</th><th>Caricata</th><th></th></tr></thead><tbody>' +
      V.map(function (v) {
        return '<tr' + (v.attiva ? ' class="evid"' : '') + '><td>' + esc(v.titolo) + (v.attiva ? ' <span class="st ok">in uso</span>' : '') + '</td><td data-l="Valida dal">' + esc(dataIt(v.validita)) +
          '</td><td data-l="Caricata">' + esc(T.dataOra(v.caricata)) + '</td><td class="azioni">' + (v.attiva ? '' : '<button class="btn sm" type="button" data-g="trasporto-usa" data-id="' + esc(v.id) + '">Usa questa</button>') + '</td></tr>';
      }).join('') + '</tbody></table></div></div></div>';
    return h;
  }

  /* ---------- aziende: gruppi di persone con lo stesso campo azienda, regole comuni e azioni su tutti (taric/aziende.py) ---------- */
  function personeTesto(n) { return n === 1 ? '1 persona' : n + ' persone'; }
  function regoleTesto(r) {
    if (!r) return 'nessuna regola';
    return !r.ia ? 'IA spenta' : r.quota_ia === null ? 'limite predefinito' : r.quota_ia + ' al mese per persona';
  }
  function aziende() {
    var A = st.aziende;
    if (!A) return '<p class="vuoto">Carico…</p>';
    var h = '<div class="foglio"><div class="box"><div class="lab">' + T.icona('container') + 'Aziende<span class="dx">' + A.aziende.length + '</span></div>' + riga('aziende');
    if (!A.aziende.length) h += '<p class="vuoto illustrato">' + (T.vignetta ? T.vignetta('container') : '') + 'Nessuna azienda: scrivila nella scheda di una persona, in Utenti.</p>';
    else {
      h += '<div class="scorri"><table class="tab"><thead><tr><th>Azienda</th><th class="n">Persone</th><th class="n">IA a ' + esc(meseIt(A.mese)) + '</th><th>Regole</th><th></th></tr></thead><tbody>' +
        A.aziende.map(function (a) {
          var aperta = st.azienda === a.chiave, sosp = a.persone.filter(function (p) { return p.stato === 'sospeso'; }).length;
          var r = '<tr' + (aperta ? ' class="evid"' : '') + '><td><b>' + esc(a.nome) + '</b></td><td class="n" data-l="Persone">' + a.persone.length +
            (sosp ? ' <span class="nota">(' + sosp + (sosp === 1 ? ' sospesa)' : ' sospese)') + '</span>' : '') + '</td><td class="n" data-l="IA">' + numero(a.classificazioni) + '</td>' +
            '<td data-l="Regole">' + (a.regole ? '<span class="st ' + (a.regole.ia ? 'ok' : 'sospeso') + '">' + esc(regoleTesto(a.regole)) + '</span>' : '<span class="nota">nessuna</span>') + '</td>' +
            '<td class="azioni"><button class="btn sm" type="button" data-g="az-apri" data-v="' + esc(a.chiave) + '" aria-expanded="' + aperta + '">' + (aperta ? 'Chiudi' : 'Gestisci') + '</button></td></tr>';
          if (aperta) r += '<tr class="dettaglio"><td colspan="5">' + dettaglioAzienda(a) + '</td></tr>';
          return r;
        }).join('') + '</tbody></table></div>';
    }
    if (A.senza_azienda) h += '<p class="nota">' + personeTesto(A.senza_azienda) + ' senza azienda: scrivila nella loro scheda, in Utenti.</p>';
    return h + '<p class="nota">Le persone con la stessa azienda (maiuscole e spazi a parte) formano un gruppo. Le regole valgono per chi c\'è e per chi entra dopo; ' +
      'il limite di una persona si può poi cambiare in Utenti. Gli amministratori non hanno limiti e le azioni su tutti li lasciano come sono.</p></div></div>';
  }
  function dettaglioAzienda(a) {
    var r = a.regole, v = esc(a.chiave), h = '<div class="pannello">';
    h += '<form class="fila" data-g="az-regole" data-v="' + v + '"><label class="corto">Classificazioni con l\'IA al mese, per persona' +
      '<input class="campo" type="number" min="0" max="100000" name="quota" value="' + (r && r.quota_ia !== null ? esc(r.quota_ia) : '') + '" placeholder="predefinito"></label>' +
      '<label class="spunta"><input type="checkbox" name="spenta"' + (r && !r.ia ? ' checked' : '') + '> IA spenta per tutta l\'azienda</label>' +
      '<button class="btn sm pri" type="submit">' + T.icona('spunta') + 'Applica a tutti</button></form>';
    h += '<div class="fila"><button class="btn sm" type="button" data-g="az-disconnetti" data-v="' + v + '">' + T.icona('esci') + 'Disconnetti tutti</button>' +
      '<button class="btn sm" type="button" data-g="az-sospendi" data-v="' + v + '">Sospendi tutti</button>' +
      '<button class="btn sm" type="button" data-g="az-riattiva" data-v="' + v + '">Riattiva tutti</button></div>';
    h += '<form class="fila" data-g="az-nome" data-v="' + v + '"><label class="corto">Nuovo nome<input class="campo largo" name="nome" maxlength="150" required value="' + esc(a.nome) + '"></label>' +
      '<button class="btn sm" type="submit">Rinomina</button><span class="nota">Con il nome di un\'altra azienda, le due si uniscono.</span></form>';
    if (a.persone.length) h += '<ul class="az-persone">' + a.persone.map(function (p) {
      var s = STATI[p.stato] || [p.stato, ''];
      return '<li><b>' + esc(p.nome) + '</b> <span class="nota">' + esc(p.email) + '</span> ' + (p.ruolo === 'amministratore' ? '<span class="st ok">amministratore</span> ' : '') +
        (p.stato !== 'attivo' ? '<span class="st ' + s[1] + '">' + esc(s[0]) + '</span> ' : '') +
        '<span class="nota">IA: ' + numero(p.classificazioni) + (p.limite === null ? '' : ' / ' + (p.limite === 0 ? 'spenta' : numero(p.limite))) + '</span></li>';
    }).join('') + '</ul>';
    else h += '<p class="nota">Nessuna persona per ora: le regole varranno per chi entra.</p>';
    return h + '</div>';
  }

  /* ---------- segnalazioni di problemi dagli utenti (js/segnala.js): risposta, risolta o riaperta ---------- */
  var SEZIONI = { classifica: 'Classifica', nomenclatura: 'Nomenclatura', bolla: 'Bolla', profilo: 'Profilo', gestione: 'Gestione' };
  function browserBreve(ua) {
    var b = /Edg\//.test(ua) ? 'Edge' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'browser';
    var so = /iPhone|iPad/.test(ua) ? 'iPhone o iPad' : /Android/.test(ua) ? 'Android' : /Windows/.test(ua) ? 'Windows' : /Mac OS X/.test(ua) ? 'Mac' : /Linux/.test(ua) ? 'Linux' : '';
    return b + (so ? ' su ' + so : '');
  }
  function segnalazioni() {
    var V = st.segnalazioni;
    if (!V) return '<p class="vuoto">Carico…</p>';
    var aperte = V.filter(function (x) { return x.stato === 'aperta'; }).length;
    var h = '<div class="foglio"><div class="box"><div class="lab">' + T.icona('attenzione') + 'Segnalazioni<span class="dx">' + (aperte ? aperte + ' da leggere' : 'nessuna da leggere') + '</span></div>' + riga('segnalazioni');
    if (!V.length) h += '<p class="vuoto illustrato">' + (T.vignetta ? T.vignetta('gru') : '') + 'Nessuna segnalazione.</p>';
    else h += '<div class="elenco">' + V.map(rigaSegnalazione).join('') + '</div>';
    return h + '</div></div>';
  }
  function rigaSegnalazione(v) {
    var c = v.contesto || {}, aperta = v.stato === 'aperta';
    var dove = [SEZIONI[v.sezione] || v.sezione, c.codice ? 'codice ' + c.codice : '', c.schermo ? 'schermo ' + c.schermo : ''].filter(Boolean).join(' · ');
    return '<div class="voce segnalazione' + (aperta ? ' nuova' : '') + '"><div>' +
      '<span class="m">' + esc(T.dataOra(v.creata)) + ' · ' + esc(v.autore || 'account eliminato') + (v.email ? ' (' + esc(v.email) + ')' : '') + '</span> ' +
      (aperta ? '<span class="st in_attesa">da leggere</span>' : '<span class="st ok">risolta</span>') +
      '<p class="t">' + esc(v.testo) + '</p>' +
      '<p class="m">' + esc(dove) + (c.browser ? ' · <span title="' + esc(c.browser) + '">' + esc(browserBreve(c.browser)) + '</span>' : '') +
      (v.chiusa ? ' · risolta il ' + esc(T.dataOra(v.chiusa)) + (v.chiusa_da ? ' da ' + esc(v.chiusa_da) : '') : '') + '</p>' +
      '<form class="modulo" data-g="segnalazione" data-id="' + esc(v.id) + '" data-stato="' + esc(v.stato) + '">' +
      '<label>Risposta (la vede chi l\'ha mandata, nel suo profilo)<textarea class="campo" name="risposta" rows="2" maxlength="2000">' + esc(v.risposta) + '</textarea></label>' +
      '<div class="fila">' + (aperta ? '<button class="btn sm pri" type="submit" data-stato="chiusa">' + T.icona('spunta') + 'Risolta</button>' +
        '<button class="btn sm" type="submit" data-stato="aperta">Salva la risposta</button>'
        : '<button class="btn sm" type="submit" data-stato="chiusa">Salva la risposta</button><button class="btn sm" type="submit" data-stato="aperta">Riapri</button>') +
      '<button class="btn sm" type="button" data-g="segnalazione-elimina" data-id="' + esc(v.id) + '">' + T.icona('cestino') + 'Elimina</button></div></form></div></div>';
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
    if (modulo(g, f, d, ev.submitter)) return;
    if (g === 'aggiorna') {
      T.api('POST', '/api/admin/dati/aggiorna', { mese: String(d.get('mese') || '').trim() })
        .then(function (r) { msg('aggiorna', 'Aggiornamento di ' + nomeMese(r.mese) + ' avviato: segui l\'avanzamento qui sopra.', true); }, function (e) { msg('aggiorna', errore(e)); }).then(carica);
    } else if (g === 'carica') {
      msg('carica', 'Caricamento in corso…', true); disegna();
      T.api('POST', '/api/admin/dati/carica', d).then(function (r) { msg('carica', 'Archivio caricato: installazione di ' + nomeMese(r.mese) + ' avviata.', true); },
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
      T.api('GET', '/api/admin/dati/riepilogo/' + v).then(function (r) { st.registro = { titolo: 'Riepilogo della versione ' + v.split('-').reverse().join('/'), testo: r.testo || '' }; disegna(); },
        function (e) { T.avviso(errore(e), 'male'); });
    } else if (g === 'registro-agg') {
      T.api('GET', '/api/admin/dati/registro/' + id).then(function (r) { st.registro = { titolo: 'Registro dell\'aggiornamento', testo: r.testo || '(vuoto)' }; disegna(); },
        function (e) { T.avviso(errore(e), 'male'); });
    } else if (g === 'chiudi-registro') { st.registro = null; disegna(); }
    else if (g === 'copia-esterna') {
      st.copiaInCorso = true; msg('copia'); disegna();
      T.api('POST', '/api/admin/copia-esterna').then(function (r) { msg('copia', 'Copia mandata: ' + r.oggetto + '.', true); },
        function (e) { msg('copia', errore(e)); }).then(function () { st.copiaInCorso = false; return carica(); });
    }
  });
})();
