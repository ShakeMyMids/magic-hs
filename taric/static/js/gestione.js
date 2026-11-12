/* TARIC 2.0 - vista Gestione (amministratori): utenti e richieste, regole di registrazione, dati TARIC,
   uso dell'IA, registro degli eventi, posta non inviata. */
(function () {
  'use strict';
  var T = window.TARIC, esc = T.esc;
  var el = document.getElementById('view-gestione');
  var vista = T.viste = T.viste || {};
  var st = { sotto: 'utenti', riep: null, utenti: [], imp: null, dati: null, uso: [], eventi: [], posta: null, aperto: null,
             link: {}, msg: {}, registro: null, timer: null };

  var STATI = { attivo: 'attivo', in_attesa: 'in attesa', email_da_confermare: 'email da confermare', sospeso: 'sospeso', rifiutato: 'rifiutato' };
  var ESITI = { ok: 'riuscito', errore: 'errore', non_disponibile: 'non ancora disponibile', in_corso: 'in corso', interrotto: 'interrotto' };
  var EVENTI = {
    registrazione: 'Nuova registrazione', registrazione_duplicata: 'Registrazione con email già presente', email_confermata: 'Email confermata',
    in_attesa: 'Richiesta in attesa', approvato: 'Approvato', approvato_automaticamente: 'Approvato automaticamente', rifiutato: 'Rifiutato',
    sospeso: 'Sospeso', riattivato: 'Riattivato', accesso: 'Accesso', accesso_bloccato: 'Accesso bloccato (password errate)',
    password_reimpostata: 'Password reimpostata', password_cambiata: 'Password cambiata', richiesta_reimpostazione: 'Richiesta nuova password',
    link_password: 'Link password creato', utente_creato: 'Utente creato', utente_eliminato: 'Utente eliminato', ruolo: 'Ruolo cambiato',
    quota_ia: 'Limite IA cambiato', sessioni_chiuse: 'Sessioni chiuse', impostazioni: 'Regole modificate', configurazione_iniziale: 'Configurazione iniziale',
    admin_da_riga_di_comando: 'Amministratore da riga di comando', pulizia: 'Pulizia automatica', dati_ok: 'Dati TARIC installati',
    dati_errore: 'Aggiornamento dati non riuscito', dati_non_disponibile: 'Estrazione non ancora disponibile', dati_versione_attivata: 'Versione dati cambiata'
  };

  function app() { return T.app; }
  function io() { return app().utente(); }
  function riga(dove) { var m = st.msg[dove]; return m ? '<p class="' + (m.ok ? 'esito-ok' : 'errore') + '">' + esc(m.testo) + '</p>' : ''; }
  function msg(dove, testo, ok) { st.msg[dove] = testo ? { testo: testo, ok: !!ok } : null; }
  function errore(e) { return (e && e.errore) || 'Operazione non riuscita.'; }

  vista.gestione = { mostra: function () { disegna(); carica(); } };

  function carica() {
    var chiamate = [T.api('GET', '/api/admin/riepilogo').then(function (r) { st.riep = r; })];
    if (st.sotto === 'utenti') chiamate.push(T.api('GET', '/api/admin/utenti').then(function (r) { st.utenti = r.utenti; }));
    if (st.sotto === 'regole') chiamate.push(T.api('GET', '/api/admin/impostazioni').then(function (r) { st.imp = r; }));
    if (st.sotto === 'dati') chiamate.push(T.api('GET', '/api/admin/dati').then(function (r) { st.dati = r; }));
    if (st.sotto === 'uso') chiamate.push(T.api('GET', '/api/admin/uso').then(function (r) { st.uso = r.uso; }));
    if (st.sotto === 'registro') chiamate.push(T.api('GET', '/api/admin/eventi?limite=300').then(function (r) { st.eventi = r.eventi; }));
    if (st.sotto === 'posta') chiamate.push(T.api('GET', '/api/admin/posta').then(function (r) { st.posta = r; }));
    return Promise.all(chiamate).then(disegna, function (e) { el.innerHTML = '<p class="errore">' + esc(errore(e)) + '</p>'; });
  }

  /* ------------------------------------------------------------------ disegno */
  function disegna() {
    var r = st.riep, h = '';
    var attesa = r ? (r.utenti.in_attesa || 0) : 0;
    h += '<div class="sotto" role="tablist">' + [['utenti', 'Utenti' + (attesa ? '<span class="conta">' + attesa + '</span>' : '')], ['regole', 'Regole di registrazione'],
      ['dati', 'Dati TARIC'], ['uso', 'Uso dell\'IA'], ['registro', 'Registro'], ['posta', 'Posta']].map(function (x) {
      return '<button class="btn sm" type="button" data-g="sotto" data-v="' + x[0] + '"' + (st.sotto === x[0] ? ' aria-current="page"' : '') + '>' + x[1] + '</button>';
    }).join('') + '</div>';
    if (r) h += avvisi(r);
    h += { utenti: utenti, regole: regole, dati: dati, uso: uso, registro: registro, posta: posta }[st.sotto]();
    el.innerHTML = h;
    pianificaRinfresco();
  }

  function avvisi(r) {
    var a = [];
    if (!r.ia) a.push('La classificazione assistita è spenta: imposta ANTHROPIC_API_KEY nella configurazione del server e riavvialo.');
    if (!r.posta) a.push('La posta non è configurata: le email (conferme, avvisi, link) restano nella scheda Posta e le nuove registrazioni aspettano sempre la tua approvazione, perché l\'indirizzo non si può verificare.');
    if (!r.dati) a.push('Non ci sono ancora dati TARIC installati: vai su Dati TARIC.');
    if (!r.url_pubblico) a.push('L\'indirizzo pubblico del sito non è impostato (TARIC_URL_PUBBLICO): nei link delle email uso l\'indirizzo da cui stai navigando.');
    return a.length ? '<div class="foglio"><div class="box"><div class="lab">Da sistemare</div>' + a.map(function (t) { return '<p class="avviso">' + esc(t) + '</p>'; }).join('') + '</div></div>' : '';
  }

  /* ---------- utenti ---------- */
  function utenti() {
    var h = '', attesa = st.utenti.filter(function (u) { return u.stato === 'in_attesa' || u.stato === 'email_da_confermare'; });
    var altri = st.utenti.filter(function (u) { return attesa.indexOf(u) < 0; });
    h += '<div class="foglio"><div class="box"><div class="lab">Richieste di accesso<span class="dx">' + attesa.length + '</span></div>';
    if (!attesa.length) h += '<p class="vuoto">Nessuna richiesta in attesa.</p>';
    attesa.forEach(function (u) {
      h += '<div class="voce"><div><b>' + esc(u.nome) + '</b> · ' + esc(u.email) + ' <span class="st ' + u.stato + '">' + STATI[u.stato] + '</span>' +
        (u.azienda ? '<br>' + esc(u.azienda) : '') + (u.richiesta ? '<br><span class="nota">Uso previsto: ' + esc(u.richiesta) + '</span>' : '') +
        '<div class="m">Richiesta del ' + esc(T.dataOra(u.creato)) + (u.email_confermata ? ' · email confermata' : (u.stato === 'in_attesa' ? ' · email NON verificata' : '')) + '</div></div>' +
        '<div class="azioni">' + (u.stato === 'in_attesa' ? '<button class="btn sm pri" type="button" data-g="approva" data-id="' + u.id + '">Approva</button>' : '') +
        '<button class="btn sm" type="button" data-g="rifiuta" data-id="' + u.id + '">Rifiuta</button></div></div>';
    });
    h += riga('richieste') + '</div></div>';

    h += '<div class="foglio"><div class="box"><div class="lab">Utenti<span class="dx">' + altri.length + '</span></div><div class="scorri"><table class="tab"><thead><tr>' +
      '<th>Utente</th><th>Stato</th><th>Ruolo</th><th class="n">IA questo mese</th><th>Ultimo accesso</th><th></th></tr></thead><tbody>';
    altri.forEach(function (u) {
      var aperto = st.aperto === u.id;
      h += '<tr' + (aperto ? ' class="evid"' : '') + '><td><b>' + esc(u.nome) + '</b><span class="piccolo">' + esc(u.email) + (u.azienda ? ' · ' + esc(u.azienda) : '') + '</span></td>' +
        '<td data-l="Stato"><span class="st ' + u.stato + '">' + STATI[u.stato] + '</span>' + (u.motivo_stato ? '<span class="piccolo">' + esc(u.motivo_stato) + '</span>' : '') +
        (!u.password_impostata ? '<span class="piccolo">password non ancora scelta</span>' : '') + '</td>' +
        '<td data-l="Ruolo">' + (u.ruolo === 'amministratore' ? 'amministratore' : 'utente') + '</td>' +
        '<td class="n" data-l="IA questo mese">' + u.usate + ' / ' + (u.limite === null ? '∞' : u.limite) + '<span class="piccolo">' + (u.limite === null ? 'senza limite' : (u.quota_ia === null ? 'predefinito' : 'personalizzato')) + '</span></td>' +
        '<td data-l="Ultimo accesso">' + esc(u.ultimo_accesso ? T.dataOra(u.ultimo_accesso) : 'mai') + (u.sessioni ? '<span class="piccolo">' + (u.sessioni === 1 ? '1 sessione aperta' : u.sessioni + ' sessioni aperte') + '</span>' : '') + '</td>' +
        '<td><button class="btn sm" type="button" data-g="apri" data-id="' + u.id + '" aria-expanded="' + aperto + '">' + (aperto ? 'Chiudi' : 'Gestisci') + '</button></td></tr>';
      if (aperto) h += '<tr class="evid dettaglio"><td colspan="6">' + pannelloUtente(u) + '</td></tr>';
    });
    h += '</tbody></table></div>' + riga('utenti') + '</div></div>';

    h += '<div class="foglio"><div class="box"><div class="lab">Nuovo utente</div>' +
      '<form class="modulo" data-g="crea"><div class="due"><label>Nome e cognome<input class="campo" name="nome" required minlength="2"></label>' +
      '<label>Email<input class="campo" name="email" type="email" required></label><label>Azienda<input class="campo" name="azienda"></label>' +
      '<label>Ruolo<select class="campo" name="ruolo"><option value="utente">Utente</option><option value="amministratore">Amministratore</option></select></label>' +
      '<label>Limite IA al mese (vuoto = predefinito)<input class="campo" name="quota" type="number" min="0" max="100000"></label></div>' +
      '<p class="nota">L\'utente riceve un link per scegliere la password (valido 7 giorni).' + (st.riep && !st.riep.posta ? ' Senza posta configurata il link compare qui: consegnalo tu.' : '') + '</p>' +
      '<div class="fila"><button class="btn pri" type="submit">Crea utente</button></div>' + riga('crea') + linkPronto('crea') + '</form></div></div>';
    return h;
  }

  function pannelloUtente(u) {
    var me = io() && io().id === u.id;
    var h = '<div class="modulo" style="max-width:none">';
    h += '<form class="fila" data-g="modifica" data-id="' + u.id + '"><label>Ruolo<select class="campo" name="ruolo"' + (me ? ' disabled' : '') + '>' +
      '<option value="utente"' + (u.ruolo === 'utente' ? ' selected' : '') + '>Utente</option><option value="amministratore"' + (u.ruolo === 'amministratore' ? ' selected' : '') + '>Amministratore</option></select></label>' +
      '<label>Limite IA al mese (vuoto = predefinito)<input class="campo" name="quota" type="number" min="0" max="100000" value="' + (u.quota_ia === null ? '' : u.quota_ia) + '"></label>' +
      '<button class="btn sm pri" type="submit">Salva</button></form>';
    h += '<div class="azioni">' +
      '<button class="btn sm" type="button" data-g="link" data-id="' + u.id + '">Link per la password</button>' +
      (st.riep && st.riep.posta ? '<button class="btn sm" type="button" data-g="link-email" data-id="' + u.id + '">Manda il link via email</button>' : '') +
      '<button class="btn sm" type="button" data-g="sessioni" data-id="' + u.id + '">Chiudi le sue sessioni</button>' +
      (me ? '' : (u.stato === 'attivo' ? '<button class="btn sm" type="button" data-g="sospendi" data-id="' + u.id + '">Sospendi</button>' : '<button class="btn sm" type="button" data-g="riattiva" data-id="' + u.id + '">Riattiva</button>') +
        '<button class="btn sm" type="button" data-g="elimina" data-id="' + u.id + '">Elimina</button>') + '</div>';
    h += linkPronto(u.id) + '<p class="nota">Registrato il ' + esc(T.dataOra(u.creato)) + (u.richiesta ? ' · uso previsto: ' + esc(u.richiesta) : '') + '</p></div>';
    return h;
  }

  function linkPronto(chiave) {
    var l = st.link[chiave];
    if (!l) return '';
    return '<div class="link-pronto"><input class="campo" readonly value="' + esc(l.link) + '" aria-label="Link"><button class="btn sm" type="button" data-g="copia" data-t="' + esc(l.link) + '">Copia</button>' +
      '<span class="nota">' + (l.inviata ? 'Inviato anche via email.' : 'Consegnalo alla persona (vale ' + l.durata + ').') + '</span></div>';
  }

  /* ---------- regole ---------- */
  function regole() {
    var i = st.imp;
    if (!i) return '<p class="vuoto">Carico…</p>';
    return '<div class="foglio"><div class="box"><div class="lab">Registrazione automatica</div>' +
      '<p class="nota">Chi si iscrive conferma l\'indirizzo con il link ricevuto via email. Poi: se il dominio dell\'email è tra quelli approvati (o se «approva tutti» è attivo) l\'account si attiva subito; altrimenti la richiesta resta in attesa e ricevi un avviso. Le iscrizioni non confermate spariscono dopo 7 giorni, quelle rifiutate dopo 90.</p>' +
      '<form class="modulo" data-g="regole">' +
      '<label class="spunta"><input type="checkbox" name="registrazione_aperta"' + (i.registrazione_aperta ? ' checked' : '') + '> Registrazione aperta dalla pagina di accesso</label>' +
      '<label class="spunta"><input type="checkbox" name="approva_tutti"' + (i.approva_tutti ? ' checked' : '') + '> Approva subito tutte le email confermate (sconsigliato su un sito pubblico)</label>' +
      '<div class="due"><label>Domini approvati automaticamente (uno per riga, es. miaazienda.it)<textarea class="campo" name="domini_approvati" rows="4">' + esc(i.domini_approvati.join('\n')) + '</textarea></label>' +
      '<label>Domini bloccati<textarea class="campo" name="domini_bloccati" rows="4">' + esc(i.domini_bloccati.join('\n')) + '</textarea></label>' +
      '<label>Richieste all\'IA al mese per i nuovi utenti (0 = IA spenta)<input class="campo" type="number" name="quota_predefinita" min="0" max="100000" value="' + i.quota_predefinita + '"></label>' +
      '<label>Massimo di richieste in attesa<input class="campo" type="number" name="massimo_in_attesa" min="1" max="10000" value="' + i.massimo_in_attesa + '"></label></div>' +
      (st.riep && !st.riep.posta ? '<p class="avviso">Con la posta non configurata gli indirizzi non si possono verificare: domini approvati e «approva tutti» non si applicano e ogni richiesta aspetta te.</p>' : '') +
      '<div class="fila"><button class="btn pri" type="submit">Salva le regole</button></div>' + riga('regole') + '</form></div></div>';
  }

  /* ---------- dati TARIC ---------- */
  function dati() {
    var d = st.dati;
    if (!d) return '<p class="vuoto">Carico…</p>';
    var h = '<div class="foglio"><div class="box s8"><div class="lab">Dati in uso</div>';
    var att = d.versioni.filter(function (v) { return v.attiva; })[0];
    if (att) h += '<p class="cosa">Situazione al ' + esc(att.data.split('-').reverse().join('/')) + '</p><p class="nota">' + (att.righe || '?') + ' righe di nomenclatura, ' + (att.dichiarabili || '?') +
      ' codici dichiarabili, ' + (att.misure_import || '?') + ' misure all\'importazione e ' + (att.misure_export || '?') + ' all\'esportazione; ' + (att.righe_en || 0) + ' righe ancora in inglese.</p>' +
      (att.avvisi && att.avvisi.length ? '<p class="avviso">' + esc(att.avvisi.join(' · ')) + '</p>' : '');
    else h += '<p class="avviso">Nessun dato installato.</p>';
    if (d.in_corso) h += '<p class="esito-ok">Aggiornamento di ' + esc(d.in_corso.mese) + ' in corso: ' + esc(d.in_corso.fase) + '…</p>';
    h += '<p class="nota">' + (d.automatico ? 'Aggiornamento automatico attivo: dal giorno 1 a ogni inizio mese il server controlla la fonte e installa la nuova estrazione dopo i controlli.' : 'Aggiornamento automatico spento (TARIC_AGGIORNAMENTO_AUTOMATICO).') +
      (d.prossimo ? ' Prossimo tentativo per ' + esc(d.prossimo) + ' entro mezz\'ora.' : '') + '</p></div>';
    h += '<div class="box s4"><div class="lab">Aggiorna adesso</div><form class="modulo" data-g="aggiorna"><label>Mese (vuoto = corrente)<input class="campo" name="mese" placeholder="AAAA-MM" pattern="\\d{4}-\\d{2}"></label>' +
      '<div class="fila"><button class="btn pri" type="submit"' + (d.in_corso ? ' disabled' : '') + '>Scarica e installa</button></div>' + riga('aggiorna') + '</form></div></div>';

    h += '<div class="foglio"><div class="box"><div class="lab">Carica a mano un\'estrazione</div><p class="nota">Se la fonte automatica non funziona: scarica dal gruppo CIRCABC «TARIC and Quota data and information» i file Excel del mese, mettili in un archivio .zip e caricalo qui. Valgono gli stessi controlli.</p>' +
      '<form class="modulo" data-g="carica"><div class="due"><label>Archivio .zip<input class="campo" type="file" name="file" accept=".zip,application/zip" required></label>' +
      '<label>Mese dell\'estrazione<input class="campo" name="mese" placeholder="AAAA-MM" pattern="\\d{4}-\\d{2}"></label></div>' +
      '<div class="fila"><button class="btn" type="submit"' + (d.in_corso ? ' disabled' : '') + '>Carica e installa</button></div>' + riga('carica') + '</form></div></div>';

    h += '<div class="foglio"><div class="box"><div class="lab">Versioni installate</div><div class="scorri"><table class="tab"><thead><tr><th>Situazione al</th><th class="n">Righe</th><th class="n">Misure import</th><th>Generata</th><th></th></tr></thead><tbody>' +
      d.versioni.map(function (v) {
        return '<tr' + (v.attiva ? ' class="evid"' : '') + '><td>' + esc(v.versione.split('-').reverse().join('/')) + (v.attiva ? ' <span class="st ok">in uso</span>' : '') + '</td><td class="n" data-l="Righe">' + (v.righe || '') + '</td><td class="n" data-l="Misure import">' + (v.misure_import || '') +
          '</td><td data-l="Generata">' + esc(T.dataOra(v.generato)) + '</td><td class="azioni"><button class="btn sm" type="button" data-g="riepilogo" data-v="' + esc(v.versione) + '">Riepilogo</button>' +
          (v.attiva ? '' : '<button class="btn sm" type="button" data-g="usa" data-v="' + esc(v.versione) + '">Usa questa</button>') + '</td></tr>';
      }).join('') + '</tbody></table></div></div></div>';

    h += '<div class="foglio"><div class="box"><div class="lab">Ultimi aggiornamenti</div><div class="scorri"><table class="tab"><thead><tr><th>Quando</th><th>Mese</th><th>Origine</th><th>Esito</th><th>Messaggio</th><th></th></tr></thead><tbody>' +
      d.ultimi.map(function (a) {
        return '<tr><td>' + esc(T.dataOra(a.iniziato)) + '</td><td data-l="Mese">' + esc(a.mese) + '</td><td data-l="Origine">' + esc(a.origine.replace(/_/g, ' ')) + '</td><td data-l="Esito"><span class="st ' + a.esito + '">' + (ESITI[a.esito] || a.esito) + '</span></td><td>' + esc(a.messaggio) + '</td>' +
          '<td>' + (a.esito === 'errore' || a.esito === 'ok' ? '<button class="btn sm" type="button" data-g="registro-agg" data-id="' + a.id + '">Registro</button>' : '') + '</td></tr>';
      }).join('') + '</tbody></table></div>' + (d.ultimi.length ? '' : '<p class="vuoto">Nessun aggiornamento ancora.</p>') +
      (st.registro ? '<div class="lab" style="margin-top:8px">' + esc(st.registro.titolo) + '<span class="dx"><button class="link" type="button" data-g="chiudi-registro">chiudi</button></span></div><pre class="registro">' + esc(st.registro.testo) + '</pre>' : '') + '</div></div>';
    return h;
  }

  /* ---------- uso dell'IA ---------- */
  function uso() {
    var r = st.riep, h = '<div class="foglio"><div class="box"><div class="lab">Uso dell\'IA</div>';
    if (r) h += '<p class="nota">Modelli: ' + esc(r.modelli.join(' (rapido) e ')) + '. Questo mese: ' + r.uso_mese.n + ' richieste, ' + (r.uso_mese.tin || 0).toLocaleString('it-IT') + ' token in ingresso e ' +
      (r.uso_mese.tout || 0).toLocaleString('it-IT') + ' in uscita. Il costo effettivo lo vedi nella Console di Anthropic, dove conviene impostare anche un limite di spesa mensile.</p>';
    if (!st.uso.length) h += '<p class="vuoto">Nessuna richiesta finora.</p>';
    else h += '<div class="scorri"><table class="tab"><thead><tr><th>Mese</th><th>Utente</th><th class="n">Richieste</th><th class="n">Riuscite</th><th class="n">Token in</th><th class="n">Token out</th></tr></thead><tbody>' +
      st.uso.map(function (x) {
        return '<tr><td>' + esc(x.mese) + '</td><td>' + esc(x.nome || 'utente eliminato') + '<span class="piccolo">' + esc(x.email || '') + '</span></td><td class="n" data-l="Richieste">' + x.richieste + '</td><td class="n" data-l="Riuscite">' + x.riuscite +
          '</td><td class="n" data-l="Token in">' + (x.token_in || 0).toLocaleString('it-IT') + '</td><td class="n" data-l="Token out">' + (x.token_out || 0).toLocaleString('it-IT') + '</td></tr>';
      }).join('') + '</tbody></table></div>';
    return h + '</div></div>';
  }

  /* ---------- registro ---------- */
  function registro() {
    var h = '<div class="foglio"><div class="box"><div class="lab">Registro degli eventi<span class="dx">ultimi ' + st.eventi.length + '</span></div>';
    if (!st.eventi.length) return h + '<p class="vuoto">Nessun evento.</p></div></div>';
    h += '<div class="scorri"><table class="tab"><thead><tr><th>Quando · evento</th><th>Utente</th><th>Da</th><th>Dettagli</th></tr></thead><tbody>' +
      st.eventi.map(function (e) {
        return '<tr><td>' + esc(T.dataOra(e.quando)) + ' · <b>' + esc(EVENTI[e.tipo] || e.tipo) + '</b></td><td data-l="Utente">' + esc(e.utente_nome || '') + '<span class="piccolo">' + esc(e.utente_email || '') + '</span></td>' +
          '<td data-l="Da">' + esc(e.autore_nome || (e.autore_id ? '' : 'sistema')) + '</td><td data-l="Dettagli">' + esc((e.dettagli || '').slice(0, 300)) + '</td></tr>';
      }).join('') + '</tbody></table></div>';
    return h + '</div></div>';
  }

  /* ---------- posta ---------- */
  function posta() {
    var p = st.posta, h = '<div class="foglio"><div class="box"><div class="lab">Posta non inviata</div>';
    if (!p) return h + '<p class="vuoto">Carico…</p></div></div>';
    h += '<p class="nota">' + (p.configurata ? 'La posta è configurata: qui compaiono solo i messaggi il cui invio non è riuscito.' :
      'La posta non è configurata (variabili TARIC_SMTP_*): ogni email resta qui. Puoi copiare i link e mandarli tu.') + '</p>';
    if (!p.messaggi.length) h += '<p class="vuoto">Nessun messaggio.</p>';
    p.messaggi.forEach(function (m) {
      h += '<details><summary>' + esc(T.dataOra(m.quando)) + ' · ' + esc(m.a) + ' · ' + esc(m.oggetto) + '</summary><p class="nota">' + esc(m.stato) + '</p><pre class="registro">' + esc(m.testo) + '</pre></details>';
    });
    return h + '</div></div>';
  }

  /* ------------------------------------------------------------------ aggiornamento automatico della vista dati */
  function pianificaRinfresco() {
    clearTimeout(st.timer);
    var inCorso = (st.dati && st.dati.in_corso) || (st.riep && st.riep.aggiornamento);
    if (inCorso && !el.hidden) st.timer = setTimeout(function () { if (!el.hidden) carica(); }, 4000);
  }

  /* ------------------------------------------------------------------ azioni */
  function azione(id, verbo, corpo, dove, okTesto) {
    return T.api('POST', '/api/admin/utenti/' + id + '/' + verbo, corpo || {}).then(function (r) { msg(dove, okTesto, true); return r; },
      function (e) { msg(dove, errore(e)); });
  }

  el.addEventListener('submit', function (ev) {
    var f = ev.target, g = f.getAttribute('data-g');
    if (!g) return;
    ev.preventDefault();
    var d = new FormData(f);
    if (g === 'crea') {
      var quota = String(d.get('quota') || '').trim();
      T.api('POST', '/api/admin/utenti', { nome: d.get('nome'), email: d.get('email'), azienda: d.get('azienda'), ruolo: d.get('ruolo'), quota_ia: quota === '' ? null : parseInt(quota, 10) })
        .then(function (r) { st.link.crea = { link: r.link, inviata: r.inviata, durata: '7 giorni' }; msg('crea', 'Utente creato.', true); f.reset(); },
          function (e) { msg('crea', errore(e)); }).then(carica);
    } else if (g === 'modifica') {
      var id = f.getAttribute('data-id'), q = String(d.get('quota') || '').trim(), corpo = { quota_ia: q === '' ? null : parseInt(q, 10) };
      if (d.get('ruolo')) corpo.ruolo = d.get('ruolo');
      T.api('PATCH', '/api/admin/utenti/' + id, corpo).then(function () { msg('utenti', 'Modifiche salvate.', true); }, function (e) { msg('utenti', errore(e)); }).then(carica);
    } else if (g === 'regole') {
      function righe(n) { return String(d.get(n) || '').split(/[\s,;]+/).map(function (x) { return x.trim(); }).filter(Boolean); }
      T.api('PUT', '/api/admin/impostazioni', {
        registrazione_aperta: !!d.get('registrazione_aperta'), approva_tutti: !!d.get('approva_tutti'),
        domini_approvati: righe('domini_approvati'), domini_bloccati: righe('domini_bloccati'),
        quota_predefinita: parseInt(d.get('quota_predefinita'), 10) || 0, massimo_in_attesa: parseInt(d.get('massimo_in_attesa'), 10) || 1
      }).then(function (r) { st.imp = r.impostazioni; msg('regole', 'Regole salvate.', true); }, function (e) { msg('regole', errore(e)); }).then(disegna);
    } else if (g === 'aggiorna') {
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
    if (g === 'sotto') { st.sotto = v; st.registro = null; disegna(); carica(); }
    else if (g === 'apri') { var n = parseInt(id, 10); st.aperto = st.aperto === n ? null : n; disegna(); }
    else if (g === 'approva') azione(id, 'approva', {}, 'richieste', 'Richiesta approvata: l\'utente è stato avvisato.').then(carica);
    else if (g === 'rifiuta') {
      var motivo = window.prompt('Motivo del rifiuto (facoltativo, viene comunicato alla persona):', '');
      if (motivo === null) return;
      azione(id, 'rifiuta', { motivo: motivo }, 'richieste', 'Richiesta rifiutata.').then(carica);
    } else if (g === 'sospendi') {
      var m2 = window.prompt('Motivo della sospensione (resta nel registro):', '');
      if (m2 === null) return;
      azione(id, 'sospendi', { motivo: m2 }, 'utenti', 'Utente sospeso: le sue sessioni sono state chiuse.').then(carica);
    } else if (g === 'riattiva') azione(id, 'riattiva', {}, 'utenti', 'Utente riattivato.').then(carica);
    else if (g === 'sessioni') azione(id, 'esci-ovunque', {}, 'utenti', 'Sessioni chiuse.').then(carica);
    else if (g === 'link' || g === 'link-email') {
      azione(id, 'link-password', { invia: g === 'link-email' }, 'utenti', '').then(function (r) {
        if (r) st.link[parseInt(id, 10)] = { link: r.link, inviata: r.inviata, durata: '3 giorni' }; disegna();
      });
    } else if (g === 'elimina') {
      var u = st.utenti.filter(function (x) { return String(x.id) === id; })[0];
      if (!u || !window.confirm('Eliminare definitivamente ' + u.nome + ' (' + u.email + ')? Storico e preferiti andranno persi.')) return;
      T.api('DELETE', '/api/admin/utenti/' + id).then(function () { st.aperto = null; msg('utenti', 'Utente eliminato.', true); }, function (e) { msg('utenti', errore(e)); }).then(carica);
    } else if (g === 'copia') T.copia(b.getAttribute('data-t'));
    else if (g === 'usa') {
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
