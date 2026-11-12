/* MAGIC HS - vista Gestione (amministratori): utenti e richieste, regole di registrazione, piani e pagamenti,
   dati TARIC, uso dell'IA, registro degli eventi, posta non inviata.
   Nel programma sul PC (chi pubblica per i colleghi): cartella condivisa, intelligenza artificiale, dati TARIC, registro. */
(function () {
  'use strict';
  var T = window.TARIC, esc = T.esc;
  var el = document.getElementById('view-gestione');
  var vista = T.viste = T.viste || {};
  var st = { sotto: 'utenti', riep: null, utenti: [], imp: null, dati: null, uso: [], eventi: [], posta: null, aperto: null,
             link: {}, msg: {}, registro: null, timer: null, pag: null, loc: null, cambiaChiave: false };

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
    dati_errore: 'Aggiornamento dati non riuscito', dati_non_disponibile: 'Estrazione non ancora disponibile', dati_versione_attivata: 'Versione dati cambiata',
    backup_creato: 'Backup creato', backup_scaricato: 'Backup scaricato', pagamento_avviato: 'Pagina di pagamento aperta',
    pro_pass: 'Pro: pass pagato', pro_abbonamento: 'Pro: abbonamento', pro_manuale: 'Pro concesso a mano',
    impostazioni_ia: 'Intelligenza artificiale cambiata', programma_pubblicato: 'Nuova versione del programma pubblicata'
  };
  var FORNITORI = [['', 'Nessuno: solo consultazione'], ['openai', 'Azure OpenAI o altro servizio compatibile OpenAI'], ['gemini', 'Google Gemini'], ['anthropic', 'Anthropic Claude']];
  var MOVIMENTI = { pass: 'Pass', abbonamento: 'Abbonamento: prima fattura', rinnovo: 'Rinnovo', stato_abbonamento: 'Abbonamento', in_attesa: 'Pagamento in attesa' };
  var PIANI = { giorno: '1 giorno', settimana: '1 settimana', mese: 'mensile', anno: 'annuale' };
  function euro(c) { return (c / 100).toFixed(2).replace('.', ',') + ' €'; }

  function app() { return T.app; }
  function io() { return app().utente(); }
  function riga(dove) { var m = st.msg[dove]; return m ? '<p class="' + (m.ok ? 'esito-ok' : 'errore') + '">' + esc(m.testo) + '</p>' : ''; }
  function msg(dove, testo, ok) { st.msg[dove] = testo ? { testo: testo, ok: !!ok } : null; }
  function errore(e) { return (e && e.errore) || 'Operazione non riuscita.'; }

  /* programma sul PC: niente utenti, registrazioni, pagamenti e posta; ci sono la cartella condivisa e l'IA */
  function locale() { var u = io(); return !!(u && u.locale); }
  var SCHEDE_LOCALI = ['condivisa', 'ia', 'dati', 'registro'];

  vista.gestione = { mostra: function () { if (locale() && SCHEDE_LOCALI.indexOf(st.sotto) < 0) st.sotto = 'condivisa'; disegna(); carica(); } };

  function carica() {
    var chiamate = [T.api('GET', '/api/admin/riepilogo').then(function (r) { st.riep = r; })];
    if (locale() && (st.sotto === 'condivisa' || st.sotto === 'ia' || st.sotto === 'dati')) chiamate.push(T.api('GET', '/api/admin/locale').then(function (r) { st.loc = r; }));
    if (st.sotto === 'utenti') chiamate.push(T.api('GET', '/api/admin/utenti').then(function (r) { st.utenti = r.utenti; }));
    if (st.sotto === 'regole') chiamate.push(T.api('GET', '/api/admin/impostazioni').then(function (r) { st.imp = r; }));
    if (st.sotto === 'pagamenti') chiamate.push(T.api('GET', '/api/admin/pagamenti').then(function (r) { st.pag = r; }));
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
    var schede = locale() ? [['condivisa', 'Cartella condivisa', 'cartella'], ['ia', 'Intelligenza artificiale', 'scintille'], ['dati', 'Dati TARIC', 'database'], ['registro', 'Registro', 'registro']]
      : [['utenti', 'Utenti' + (attesa ? '<span class="conta">' + attesa + '</span>' : ''), 'utenti'], ['regole', 'Regole di registrazione', 'regole'],
        ['pagamenti', 'Piani e pagamenti', 'timbro'], ['dati', 'Dati TARIC', 'database'], ['uso', 'Uso dell\'IA', 'grafico'], ['registro', 'Registro', 'registro'], ['posta', 'Posta', 'posta']];
    h += '<div class="sotto" role="tablist">' + schede.map(function (x) {
      return '<button class="btn sm" type="button" data-g="sotto" data-v="' + x[0] + '"' + (st.sotto === x[0] ? ' aria-current="page"' : '') + '>' + T.icona(x[2]) + x[1] + '</button>';
    }).join('') + '</div>';
    if (r) h += avvisi(r);
    h += { utenti: utenti, regole: regole, pagamenti: pagamenti, dati: dati, uso: uso, registro: registro, posta: posta, condivisa: condivisa, ia: iaLocale }[st.sotto]();
    el.innerHTML = h;
    pianificaRinfresco();
  }

  function avvisi(r) {
    var a = [];
    if (locale()) {
      if (st.loc && !st.loc.raggiungibile) a.push('Non trovo la cartella condivisa: controlla che OneDrive sia attivo e sincronizzato.');
      else if (st.loc && !st.loc.editore) a.push('Da questo PC non puoi scrivere nella cartella condivisa, quindi non puoi pubblicare.');
      if (!r.ia && st.sotto !== 'ia') a.push('La classificazione assistita è spenta per tutti: scegli un servizio nella scheda Intelligenza artificiale.');
      if (!r.dati) a.push('Non ci sono ancora dati TARIC: vai su Dati TARIC.');
      return a.length ? '<div class="foglio"><div class="box"><div class="lab">' + T.icona('attenzione') + 'Da sistemare</div>' + a.map(function (t) { return '<p class="avviso">' + esc(t) + '</p>'; }).join('') + '</div></div>' : '';
    }
    if (!r.ia) a.push('La classificazione assistita è spenta: imposta GEMINI_API_KEY (oppure ANTHROPIC_API_KEY o un servizio compatibile OpenAI) nella configurazione del server e riavvialo.');
    if (!r.posta) a.push('La posta non è configurata: le email (conferme, avvisi, link) restano nella scheda Posta e le nuove registrazioni aspettano sempre la tua approvazione, perché l\'indirizzo non si può verificare.');
    if (!r.dati) a.push('Non ci sono ancora dati TARIC installati: vai su Dati TARIC.');
    if (!r.url_pubblico) a.push('L\'indirizzo pubblico del sito non è impostato (TARIC_URL_PUBBLICO): nei link delle email uso l\'indirizzo da cui stai navigando.');
    return a.length ? '<div class="foglio"><div class="box"><div class="lab">' + T.icona('attenzione') + 'Da sistemare</div>' + a.map(function (t) { return '<p class="avviso">' + esc(t) + '</p>'; }).join('') + '</div></div>' : '';
  }

  /* ---------- utenti ---------- */
  function utenti() {
    var h = '', attesa = st.utenti.filter(function (u) { return u.stato === 'in_attesa' || u.stato === 'email_da_confermare'; });
    var altri = st.utenti.filter(function (u) { return attesa.indexOf(u) < 0; });
    h += '<div class="foglio"><div class="box"><div class="lab">' + T.icona('nuovo-utente') + 'Richieste di accesso<span class="dx">' + attesa.length + '</span></div>';
    if (!attesa.length) h += '<p class="vuoto">Nessuna richiesta in attesa.</p>';
    attesa.forEach(function (u) {
      h += '<div class="voce"><div><b>' + esc(u.nome) + '</b> · ' + esc(u.email) + ' <span class="st ' + u.stato + '">' + STATI[u.stato] + '</span>' +
        (u.azienda ? '<br>' + esc(u.azienda) : '') + (u.richiesta ? '<br><span class="nota">Uso previsto: ' + esc(u.richiesta) + '</span>' : '') +
        '<div class="m">Richiesta del ' + esc(T.dataOra(u.creato)) + (u.email_confermata ? ' · email confermata' : (u.stato === 'in_attesa' ? ' · email NON verificata' : '')) + '</div></div>' +
        '<div class="azioni">' + (u.stato === 'in_attesa' ? '<button class="btn sm pri" type="button" data-g="approva" data-id="' + u.id + '">Approva</button>' : '') +
        '<button class="btn sm" type="button" data-g="rifiuta" data-id="' + u.id + '">Rifiuta</button></div></div>';
    });
    h += riga('richieste') + '</div></div>';

    h += '<div class="foglio"><div class="box"><div class="lab">' + T.icona('utenti') + 'Utenti<span class="dx">' + altri.length + '</span></div><div class="scorri"><table class="tab"><thead><tr>' +
      '<th>Utente</th><th>Stato</th><th>Ruolo</th><th class="n">IA questo mese</th><th>Ultimo accesso</th><th></th></tr></thead><tbody>';
    altri.forEach(function (u) {
      var aperto = st.aperto === u.id;
      h += '<tr' + (aperto ? ' class="evid"' : '') + '><td><b>' + esc(u.nome) + '</b><span class="piccolo">' + esc(u.email) + (u.azienda ? ' · ' + esc(u.azienda) : '') + '</span></td>' +
        '<td data-l="Stato"><span class="st ' + u.stato + '">' + STATI[u.stato] + '</span>' + (u.motivo_stato ? '<span class="piccolo">' + esc(u.motivo_stato) + '</span>' : '') +
        (!u.password_impostata ? '<span class="piccolo">password non ancora scelta</span>' : '') + '</td>' +
        '<td data-l="Ruolo">' + (u.ruolo === 'amministratore' ? 'amministratore' : 'utente') + '</td>' +
        '<td class="n" data-l="IA questo mese">' + (u.pro && u.pro.fino ? '<span class="marca pro">Pro</span> ' : '') + u.usate + ' / ' + (u.limite === null ? '∞' : u.limite) +
        '<span class="piccolo">' + (u.pro && u.pro.fino ? 'Pro fino al ' + esc(T.dataOra(u.pro.fino, true)) : u.limite === null ? 'senza limite' : (u.quota_ia === null ? 'piano Gratis' : 'personalizzato')) + '</span></td>' +
        '<td data-l="Ultimo accesso">' + esc(u.ultimo_accesso ? T.dataOra(u.ultimo_accesso) : 'mai') + (u.sessioni ? '<span class="piccolo">' + (u.sessioni === 1 ? '1 sessione aperta' : u.sessioni + ' sessioni aperte') + '</span>' : '') + '</td>' +
        '<td><button class="btn sm" type="button" data-g="apri" data-id="' + u.id + '" aria-expanded="' + aperto + '">' + (aperto ? 'Chiudi' : 'Gestisci') + '</button></td></tr>';
      if (aperto) h += '<tr class="evid dettaglio"><td colspan="6">' + pannelloUtente(u) + '</td></tr>';
    });
    h += '</tbody></table></div>' + riga('utenti') + '</div></div>';

    h += '<div class="foglio"><div class="box"><div class="lab">' + T.icona('piu') + 'Nuovo utente</div>' +
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
    var mf = u.pro && u.pro.manuale_fino ? new Date(new Date(u.pro.manuale_fino).getTime() - 1000) : null;
    var mfVal = mf ? mf.getFullYear() + '-' + ('0' + (mf.getMonth() + 1)).slice(-2) + '-' + ('0' + mf.getDate()).slice(-2) : '';
    h += '<form class="fila" data-g="pro" data-id="' + u.id + '"><label>Pro concesso a mano fino al (per chi paga con bonifico)<input class="campo" type="date" name="fino" value="' + mfVal + '" required></label>' +
      '<button class="btn sm pri" type="submit">' + (mfVal ? 'Cambia la data' : 'Concedi il Pro') + '</button>' +
      (mfVal ? '<button class="btn sm" type="button" data-g="pro-togli" data-id="' + u.id + '">Togli</button>' : '') + '</form>';
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
    return '<div class="foglio"><div class="box"><div class="lab">' + T.icona('regole') + 'Registrazione automatica</div>' +
      '<p class="nota">Chi si iscrive conferma l\'indirizzo con il link ricevuto via email. Poi: se il dominio dell\'email è tra quelli approvati (o se «approva tutti» è attivo) l\'account si attiva subito; altrimenti la richiesta resta in attesa e ricevi un avviso. Le iscrizioni non confermate spariscono dopo 7 giorni, quelle rifiutate dopo 90.</p>' +
      '<form class="modulo" data-g="regole">' +
      '<label class="spunta"><input type="checkbox" name="registrazione_aperta"' + (i.registrazione_aperta ? ' checked' : '') + '> Registrazione aperta dalla pagina di accesso</label>' +
      '<label class="spunta"><input type="checkbox" name="approva_tutti"' + (i.approva_tutti ? ' checked' : '') + '> Approva subito tutte le email confermate (sconsigliato su un sito pubblico)</label>' +
      '<div class="due"><label>Domini approvati automaticamente (uno per riga, es. miaazienda.it)<textarea class="campo" name="domini_approvati" rows="4">' + esc(i.domini_approvati.join('\n')) + '</textarea></label>' +
      '<label>Domini bloccati<textarea class="campo" name="domini_bloccati" rows="4">' + esc(i.domini_bloccati.join('\n')) + '</textarea></label>' +
      '<label>Massimo di richieste in attesa<input class="campo" type="number" name="massimo_in_attesa" min="1" max="10000" value="' + i.massimo_in_attesa + '"></label></div>' +
      (st.riep && !st.riep.posta ? '<p class="avviso">Con la posta non configurata gli indirizzi non si possono verificare: domini approvati e «approva tutti» non si applicano e ogni richiesta aspetta te.</p>' : '') +
      '<div class="fila"><button class="btn pri" type="submit">Salva le regole</button></div>' + riga('regole') + '</form></div></div>';
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
    if (locale() && st.loc) h += '<p class="nota">Pubblicati per i colleghi nella cartella condivisa: <b>' + esc(st.loc.dati.pubblicati ? st.loc.dati.pubblicati.split('-').reverse().join('/') : 'nessuno') + '</b>.</p>';
    if (locale()) h += '<p class="nota">A ogni inizio mese, quando MAGIC HS è aperto su questo PC, scarica la nuova estrazione dalla fonte, la controlla e la pubblica da solo nella cartella condivisa; i colleghi la ricevono da OneDrive.' +
      (d.prossimo ? ' Prossimo tentativo per ' + esc(d.prossimo) + ' entro mezz\'ora.' : '') + '</p></div>';
    else h += '<p class="nota">' + (d.automatico ? 'Aggiornamento automatico attivo: dal giorno 1 a ogni inizio mese il server controlla la fonte e installa la nuova estrazione dopo i controlli.' : 'Aggiornamento automatico spento (TARIC_AGGIORNAMENTO_AUTOMATICO).') +
      (d.prossimo ? ' Prossimo tentativo per ' + esc(d.prossimo) + ' entro mezz\'ora.' : '') + '</p></div>';
    h += '<div class="box s4"><div class="lab">' + T.icona('aggiorna') + 'Aggiorna adesso</div><form class="modulo" data-g="aggiorna"><label>Mese (vuoto = corrente)<input class="campo" name="mese" placeholder="AAAA-MM" pattern="\\d{4}-\\d{2}"></label>' +
      '<div class="fila"><button class="btn pri" type="submit"' + (d.in_corso ? ' disabled' : '') + '>Scarica e installa</button></div>' + riga('aggiorna') + '</form></div></div>';

    h += '<div class="foglio"><div class="box"><div class="lab">' + T.icona('carica') + 'Carica a mano un\'estrazione</div><p class="nota">Se la fonte automatica non funziona: scarica dal gruppo CIRCABC «TARIC and Quota data and information» i file Excel del mese, mettili in un archivio .zip e caricalo qui. Valgono gli stessi controlli.</p>' +
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

    if (locale()) return h;
    var bk = d.backup || [];
    h += '<div class="foglio"><div class="box"><div class="lab">' + T.icona('scarica') + 'Backup del database</div><p class="nota">Il backup contiene utenti, password (cifrate), storico, preferiti, regole e registro; i dati TARIC non servono perché si riscaricano. ' +
      (d.backup_copie ? 'Il server ne fa uno da solo ogni giorno e tiene gli ultimi ' + d.backup_copie + '.' : 'Il backup automatico è spento (TARIC_BACKUP_COPIE=0).') +
      ' Ogni tanto scaricane uno sul tuo computer: se il server si rompe, è la tua copia.</p>' +
      '<div class="fila"><button class="btn pri" type="button" data-g="backup">' + T.icona('scarica') + 'Fai un backup adesso</button></div>' + riga('backup');
    if (bk.length) h += '<div class="scorri"><table class="tab"><thead><tr><th>Creato</th><th class="n">Dimensione</th><th></th></tr></thead><tbody>' +
      bk.map(function (x) {
        return '<tr><td>' + esc(T.dataOra(x.creato)) + '</td><td class="n" data-l="Dimensione">' + esc(peso(x.dimensione)) + '</td><td class="azioni"><a class="btn sm" href="/api/admin/backup/' + encodeURIComponent(x.nome) + '" download>' + T.icona('scarica') + 'Scarica</a></td></tr>';
      }).join('') + '</tbody></table></div>';
    else h += '<p class="vuoto">Ancora nessun backup.</p>';
    return h + '</div></div>';
  }

  function peso(n) { return n >= 1048576 ? (n / 1048576).toFixed(1).replace('.', ',') + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB'; }

  /* ---------- programma sul PC: cartella condivisa ---------- */
  function data(v) { return v ? v.split('-').reverse().join('/') : 'nessuno'; }
  function condivisa() {
    var L = st.loc;
    if (!L) return '<p class="vuoto">Carico…</p>';
    var h = '<div class="foglio"><div class="box s8"><div class="lab">' + T.icona('cartella') + 'Cartella condivisa</div>' +
      '<p class="cosa percorso">' + esc(L.condivisa) + '</p>' +
      '<p class="nota">' + (L.editore ? 'Da questo PC puoi pubblicare: quello che metti qui (nuove versioni del programma, dati del mese, intelligenza artificiale) arriva ai colleghi tramite OneDrive.' :
        'Da questo PC la cartella è in sola lettura.') + '</p>' +
      '<table class="tab compatta"><thead><tr><th></th><th>Su questo PC</th><th>Pubblicato per tutti</th></tr></thead><tbody>' +
      '<tr><td>Programma</td><td data-l="Su questo PC">' + esc(L.programma.in_uso) + '</td><td data-l="Per tutti">' + esc(L.programma.pubblicato || 'nessuno') + '</td></tr>' +
      '<tr><td>Dati TARIC</td><td data-l="Su questo PC">' + esc(data(L.dati.in_uso)) + '</td><td data-l="Per tutti">' + esc(data(L.dati.pubblicati)) + '</td></tr></tbody></table></div>';
    h += '<div class="box s4"><div class="lab">' + T.icona('utenti') + 'Aggiungere un collega</div><ol class="passi">' +
      '<li>In OneDrive condividi la cartella con il collega, con il solo permesso di visualizzazione.</li>' +
      '<li>Il collega apre la cartella condivisa sul sito di OneDrive e sceglie «Aggiungi collegamento a I miei file».</li>' +
      '<li>Sul suo PC fa doppio clic su <b>Avvia MAGIC HS</b> nella cartella (la prima volta ci vuole un minuto). Per comodità può creare un collegamento sul desktop.</li></ol></div></div>';
    h += '<div class="foglio"><div class="box"><div class="lab">' + T.icona('pacco') + 'Nuova versione del programma</div>' +
      '<p class="nota">Scarica il file <b>magic-hs-windows-….zip</b> dalla pagina delle versioni di MAGIC HS su GitHub e caricalo qui: va nella cartella condivisa e i colleghi la usano dalla prossima volta che aprono MAGIC HS. Su questo PC chiudi e riapri MAGIC HS.</p>' +
      '<form class="modulo" data-g="programma"><label>Pacchetto .zip<input class="campo" type="file" name="file" accept=".zip,application/zip" required></label>' +
      '<div class="fila"><button class="btn pri" type="submit"' + (L.editore ? '' : ' disabled') + '>' + T.icona('carica') + 'Pubblica per tutti</button></div>' + riga('programma') + '</form></div></div>';
    return h;
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
      '<p class="nota">Le impostazioni vanno nella cartella condivisa e valgono per tutti i colleghi. <b>La chiave è leggibile da chi ha accesso alla cartella</b>: usa una chiave dedicata a MAGIC HS e imposta un tetto di spesa sul servizio.</p>' +
      '<p class="nota">Con <b>Azure OpenAI</b> dell\'azienda: indirizzo https://&lt;risorsa&gt;.openai.azure.com/openai/v1, chiave della risorsa e nome della distribuzione come modello.</p>' +
      '<p class="nota"><b>Copilot di Microsoft 365</b> non si può collegare direttamente: per i programmi serve la licenza Microsoft 365 Copilot per ogni persona e una registrazione fatta dall\'IT.</p>' +
      '<p class="nota">Senza servizio IA MAGIC HS resta utilizzabile: nomenclatura, misure, ricerca per codice, storico e preferiti.</p></div></div>';
    return h;
  }

  /* ---------- uso dell'IA ---------- */
  function uso() {
    var r = st.riep, h = '<div class="foglio"><div class="box"><div class="lab">' + T.icona('grafico') + 'Uso dell\'IA</div>';
    if (r) h += '<p class="nota">' + (r.ia ? 'Servizio: ' + esc(r.ia_nome) + ', modelli ' + esc(r.modelli.join(' (rapido) e ')) + '. ' : 'Nessun servizio IA configurato. ') +
      'Questo mese: ' + r.uso_mese.n + ' richieste, ' + (r.uso_mese.tin || 0).toLocaleString('it-IT') + ' token in ingresso e ' +
      (r.uso_mese.tout || 0).toLocaleString('it-IT') + ' in uscita. Costi e limiti effettivi li vedi nella console del fornitore (Google AI Studio, Console di Anthropic…), dove conviene impostare anche un tetto di spesa.</p>';
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
    var h = '<div class="foglio"><div class="box"><div class="lab">' + T.icona('registro') + 'Registro degli eventi<span class="dx">ultimi ' + st.eventi.length + '</span></div>';
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
    var p = st.posta, h = '<div class="foglio"><div class="box"><div class="lab">' + T.icona('posta') + 'Posta non inviata</div>';
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

  /* ---------- piani e pagamenti ---------- */
  function pagamenti() {
    var p = st.pag;
    if (!p) return '<p class="vuoto">Carico…</p>';
    var h = '<div class="foglio"><div class="box s7"><div class="lab">' + T.icona('lucchetto') + 'Stripe</div>';
    if (p.attivi) h += '<p class="esito-ok">Pagamenti attivi' + (p.prova ? ' in modalità di prova: nessun addebito vero (carta di prova 4242 4242 4242 4242).' : ' con addebiti reali.') + '</p>';
    else h += '<p class="avviso">Pagamenti spenti: nel file taric.env del server manca la chiave TARIC_STRIPE_CHIAVE. Senza, gli utenti restano sul piano Gratis e puoi concedere il Pro a mano dalla scheda Utenti.</p>';
    if (p.attivi && !p.webhook) h += '<p class="avviso">Manca il segreto del webhook (TARIC_STRIPE_FIRMA_WEBHOOK). I pagamenti si attivano comunque al ritorno dell\'utente, ma disdette e rinnovi arrivano solo con il controllo automatico ogni 6 ore.' +
      (p.webhook_url ? ' Indirizzo da registrare su Stripe: ' + esc(p.webhook_url) : '') + '</p>';
    if (p.attivi && !p.venditore) h += '<p class="avviso">Mancano i tuoi dati di venditore nelle condizioni di vendita: imposta almeno TARIC_VENDITORE e TARIC_VENDITORE_EMAIL in taric.env.</p>';
    if (p.attivi) h += '<p class="nota">IVA ' + (p.tasse ? 'calcolata da Stripe Tax.' : 'inclusa nei prezzi (Stripe Tax spento).') + ' Ricevute, rimborsi e contestazioni si gestiscono dalla dashboard di Stripe.</p>';
    h += '<p class="nota">Le <a href="/condizioni" target="_blank" rel="noopener">condizioni di vendita</a> sono un testo di partenza: falle controllare da un professionista prima di vendere.</p>';
    h += '</div><div class="box s5"><div class="lab">' + T.icona('grafico') + 'Questo mese</div><p class="tv">' + euro(p.incasso_mese) + '</p><p class="tk">incassati (lordi, prima delle commissioni di Stripe)</p>' +
      '<p class="tv">' + p.pro.length + '</p><p class="tk">' + (p.pro.length === 1 ? 'utente Pro attivo' : 'utenti Pro attivi') + '</p></div></div>';

    var pr = p.prezzi;
    function campo(id, nome) { return '<label>' + nome + '<input class="campo" name="' + id + '" inputmode="decimal" value="' + (pr[id] / 100).toFixed(2).replace('.', ',') + '"></label>'; }
    h += '<div class="foglio"><div class="box"><div class="lab">' + T.icona('regole') + 'Piani e prezzi</div>' +
      '<p class="nota">Prezzi in euro, IVA inclusa. Stripe non accetta pagamenti sotto 0,50 €; con 0 il piano non è in vendita. I prezzi nuovi valgono per i nuovi acquisti: gli abbonamenti già attivi mantengono il loro prezzo.</p>' +
      '<form class="modulo" data-g="piani" style="max-width:none"><div class="due">' +
      '<label>Piano Gratis: richieste all\'IA al mese (vale per chi non ha un limite personale; 0 = IA spenta)<input class="campo" type="number" name="gratuito" min="0" max="100000" value="' + p.gratuito + '"></label>' +
      '<label>Piano Pro: tetto di sicurezza nelle 24 ore (0 = nessun tetto)<input class="campo" type="number" name="tetto" min="0" max="100000" value="' + p.tetto_giorno + '"></label></div>' +
      '<div class="due">' + campo('giorno', 'Pro 1 giorno') + campo('settimana', 'Pro 1 settimana') + campo('mese', 'Pro mensile') + campo('anno', 'Pro annuale') + '</div>' +
      '<div class="fila"><button class="btn pri" type="submit">Salva piani e prezzi</button></div>' + riga('piani') + '</form></div></div>';

    h += '<div class="foglio"><div class="box"><div class="lab">' + T.icona('utenti') + 'Utenti Pro<span class="dx">' + p.pro.length + '</span></div>';
    if (!p.pro.length) h += '<p class="vuoto">Ancora nessun utente Pro.</p>';
    else h += '<div class="scorri"><table class="tab"><thead><tr><th>Utente</th><th>Fino al</th><th>Come</th></tr></thead><tbody>' +
      p.pro.map(function (x) {
        var come = x.origine === 'abbonamento' && x.abbonamento ? 'abbonamento ' + (PIANI[x.abbonamento.piano] || '') + (x.abbonamento.rinnovo_annullato ? ', disdetto' : '') + (x.abbonamento.stato === 'past_due' ? ', addebito non riuscito' : '')
          : x.origine === 'manuale' ? 'concesso a mano' : 'pass';
        return '<tr><td><b>' + esc(x.nome) + '</b><span class="piccolo">' + esc(x.email) + '</span></td><td data-l="Fino al">' + esc(T.dataOra(x.fino)) + '</td><td data-l="Come">' + esc(come) + '</td></tr>';
      }).join('') + '</tbody></table></div>';
    h += '</div></div>';

    h += '<div class="foglio"><div class="box"><div class="lab">' + T.icona('registro') + 'Movimenti</div>';
    if (!p.movimenti.length) h += '<p class="vuoto">Nessun pagamento ancora.</p>';
    else h += '<div class="scorri"><table class="tab"><thead><tr><th>Quando</th><th>Utente</th><th>Cosa</th><th class="n">Importo</th></tr></thead><tbody>' +
      p.movimenti.map(function (m) {
        var cosa = (MOVIMENTI[m.tipo] || m.tipo) + (m.piano ? ' ' + (PIANI[m.piano] || m.piano) : '') + (m.tipo === 'stato_abbonamento' ? ': ' + m.dettagli : '');
        return '<tr><td>' + esc(T.dataOra(m.quando)) + '</td><td data-l="Utente">' + esc(m.nome || 'utente eliminato') + (m.email ? '<span class="piccolo">' + esc(m.email) + '</span>' : '') + '</td>' +
          '<td data-l="Cosa">' + esc(cosa) + '</td><td class="n" data-l="Importo">' + (m.importo ? esc(euro(m.importo)) : '') + '</td></tr>';
      }).join('') + '</tbody></table></div>';
    return h + '</div></div>';
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
        massimo_in_attesa: parseInt(d.get('massimo_in_attesa'), 10) || 1
      }).then(function (r) { st.imp = r.impostazioni; msg('regole', 'Regole salvate.', true); }, function (e) { msg('regole', errore(e)); }).then(disegna);
    } else if (g === 'piani') {
      function cent(n) { var v = String(d.get(n) || '0').replace(/\s|€/g, '').replace(',', '.'); var x = Math.round(parseFloat(v) * 100); return isNaN(x) ? -1 : x; }
      var prezzi = { giorno: cent('giorno'), settimana: cent('settimana'), mese: cent('mese'), anno: cent('anno') };
      if (Object.keys(prezzi).some(function (k) { return prezzi[k] < 0; })) { msg('piani', 'Scrivi i prezzi in euro, per esempio 14,99.'); disegna(); return; }
      T.api('PUT', '/api/admin/impostazioni', { quota_predefinita: parseInt(d.get('gratuito'), 10) || 0, pro_tetto_giorno: parseInt(d.get('tetto'), 10) || 0, prezzi: prezzi })
        .then(function () { msg('piani', 'Piani e prezzi salvati.', true); }, function (e) { msg('piani', errore(e)); }).then(carica);
    } else if (g === 'pro') {
      T.api('PUT', '/api/admin/utenti/' + f.getAttribute('data-id') + '/pro', { fino: String(d.get('fino') || '') })
        .then(function () { msg('utenti', 'Piano Pro concesso.', true); }, function (e) { msg('utenti', errore(e)); }).then(carica);
    } else if (g === 'aggiorna') {
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
    else if (g === 'prova-ia') {
      b.disabled = true; msg('ia', 'Provo il servizio…', true); disegna();
      T.api('POST', '/api/admin/locale/ia/prova').then(function (r) { msg('ia', 'Il servizio risponde (' + r.modello + ', ' + String(r.secondi).replace('.', ',') + ' secondi).', true); },
        function (e) { msg('ia', errore(e)); }).then(disegna);
    }
    else if (g === 'backup') {
      b.disabled = true;
      T.api('POST', '/api/admin/backup').then(function () { msg('backup', 'Backup creato: lo trovi qui sotto.', true); }, function (e) { msg('backup', errore(e)); }).then(carica);
    }
    else if (g === 'pro-togli') {
      T.api('PUT', '/api/admin/utenti/' + id + '/pro', { fino: null }).then(function () { msg('utenti', 'Concessione del Pro tolta.', true); },
        function (e) { msg('utenti', errore(e)); }).then(carica);
    }
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
