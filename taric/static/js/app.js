(function () {
'use strict';
var T = window.TARIC;
var BASE_DATI = document.documentElement.getAttribute('data-dati') || 'data/';

/* ================================================================
   Data: official TARIC nomenclature (rows in tree order)
   row = code(10) + flag(g|n|L) + hierPos/2 + level(hex) + description
   ================================================================ */
var D = window.TARIC_DATA || { meta: { data_riferimento: '', righe: 0, dichiarabili: 0 }, righe: '', unita: {} };
var LINES = D.righe ? D.righe.split('\n') : [];
var N = LINES.length;
var CODE = new Array(N), FLAG = new Array(N), DESC = new Array(N);
var INGL = new Uint8Array(N);   // 1 = row still in English (created or changed after the Italian extraction)
var HP = new Uint8Array(N), LVL = new Uint8Array(N);
var PARENT = new Int32Array(N), END = new Int32Array(N);
var byCode = new Map();
(function parse() {
  var st = [];
  for (var i = 0; i < N; i++) {
    var l = LINES[i];
    CODE[i] = l.slice(0, 10); FLAG[i] = l[10];
    HP[i] = (l.charCodeAt(11) - 48) * 2; LVL[i] = parseInt(l[12], 16);
    INGL[i] = l.charCodeAt(13) === 1 ? 1 : 0;
    DESC[i] = l.slice(INGL[i] ? 14 : 13).replace(/\x1f/g, '\n');
    while (st.length && LVL[st[st.length - 1]] >= LVL[i]) END[st.pop()] = i;
    PARENT[i] = st.length ? st[st.length - 1] : -1;
    st.push(i);
    if (FLAG[i] !== 'g') byCode.set(CODE[i], i);
  }
  while (st.length) END[st.pop()] = N;
  LINES = null;
})();

var DATA_ISO = D.meta.data_riferimento || '';
var DATA_IT = DATA_ISO ? DATA_ISO.split('-').reverse().join('/') : 'n.d.';
var IT_DATA = D.meta.it_data ? D.meta.it_data.split('-').reverse().join('/') : '';
var N_EN = D.meta.righe_en || 0;

function kids(i) { var o = []; for (var j = i + 1; j < END[i]; j = END[j]) o.push(j); return o; }
function pathOf(i) { var p = []; for (var j = i; j >= 0; j = PARENT[j]) p.push(j); return p.reverse(); }
function grp(c) { var p = [c.slice(0, 4)]; for (var k = 4; k < c.length; k += 2) p.push(c.slice(k, k + 2)); return p.join(' '); }
function showCode(i) { if (FLAG[i] === 'g') return ''; return FLAG[i] === 'L' ? grp(CODE[i]) : grp(CODE[i].slice(0, HP[i])); }
function isLeaf(i) { return FLAG[i] === 'L'; }
function headingIdx(h) { var i = byCode.get(h + '000000'); return (i !== undefined && HP[i] === 4) ? i : -1; }

/* ---------- section titles (editorial, for navigation only: the extraction has no section rows) ---------- */
var SEZIONI = [
  ['I', 'Animali vivi e prodotti del regno animale', 1, 5],
  ['II', 'Prodotti del regno vegetale', 6, 14],
  ['III', 'Grassi e oli animali, vegetali o di origine microbica; cere', 15, 15],
  ['IV', 'Prodotti delle industrie alimentari; bevande e alcolici; tabacchi', 16, 24],
  ['V', 'Prodotti minerali', 25, 27],
  ['VI', 'Prodotti delle industrie chimiche o delle industrie connesse', 28, 38],
  ['VII', 'Materie plastiche e gomma, e loro lavori', 39, 40],
  ['VIII', 'Pelli, cuoio, pelli da pellicceria; oggetti da viaggio e borse', 41, 43],
  ['IX', 'Legno, sughero, lavori di intreccio', 44, 46],
  ['X', 'Paste di legno, carta e cartone, prodotti dell\'editoria', 47, 49],
  ['XI', 'Materie tessili e loro manufatti', 50, 63],
  ['XII', 'Calzature, cappelli, ombrelli, piume, fiori artificiali', 64, 67],
  ['XIII', 'Lavori di pietre, gesso, cemento; prodotti ceramici; vetro', 68, 70],
  ['XIV', 'Perle, pietre preziose, metalli preziosi; minuterie di fantasia; monete', 71, 71],
  ['XV', 'Metalli comuni e loro lavori', 72, 83],
  ['XVI', 'Macchine e apparecchi, materiale elettrico e loro parti', 84, 85],
  ['XVII', 'Materiale da trasporto', 86, 89],
  ['XVIII', 'Ottica, misura, strumenti medici, orologeria, strumenti musicali', 90, 92],
  ['XIX', 'Armi, munizioni e loro parti ed accessori', 93, 93],
  ['XX', 'Merci e prodotti diversi', 94, 96],
  ['XXI', 'Oggetti d\'arte, da collezione o di antichità', 97, 97],
  ['—', 'Codici speciali della nomenclatura combinata', 98, 99]
];
var UNITA_IT = {
  'p/st': 'numero di pezzi', '100 p/st': 'centinaia di pezzi', '1 000 p/st': 'migliaia di pezzi', 'pa': 'numero di paia',
  'l': 'litri', 'l alc. 100 %': 'litri di alcole puro (100 %)', 'm': 'metri', 'm2': 'metri quadrati', 'm3': 'metri cubi',
  '1 000 m³': 'migliaia di metri cubi', 'g': 'grammi', 'kg/net eda': 'chilogrammi di peso netto sgocciolato',
  'kg 90 % sdt': 'chilogrammi di sostanza secca al 90 %', 'kg N': 'chilogrammi di azoto', 'kg P2O5': 'chilogrammi di anidride fosforica',
  'kg K2O': 'chilogrammi di ossido di potassio', 'kg KOH': 'chilogrammi di idrossido di potassio', 'kg NaOH': 'chilogrammi di idrossido di sodio',
  'kg H2O2': 'chilogrammi di perossido di idrogeno', 'kg U': 'chilogrammi di uranio', 'kg met.am.': 'chilogrammi di metilammine',
  'gi F/S': 'grammi di isotopi fissili', 'c/k': 'carati (1 carato metrico = 0,2 g)', 'ce/el': 'numero di elementi',
  'ct/l': 'portata in tonnellate', 'TJ': 'terajoule (potere calorifico superiore)', '1 000 kWh': 'migliaia di kWh',
  't CO2 eq.': 'tonnellate di CO₂ equivalente'
};
/* chapter titles are upper case in the official text: shown in sentence case */
function titolo(s) { return (s && s === s.toUpperCase()) ? s.charAt(0) + s.slice(1).toLowerCase() : s; }
function descOf(i) { return LVL[i] === 0 ? titolo(DESC[i]) : DESC[i]; }
function tagEN(i) { return INGL[i] ? '<span class="en" title="Riga creata o modificata dopo il ' + IT_DATA + ': il testo ufficiale italiano non è ancora disponibile">EN</span>' : ''; }

var FREQUENTI = ['CN', 'US', 'GB', 'CH', 'TR', 'JP', 'KR', 'IN', 'VN', 'TW'];

/* ================================================================
   State
   ================================================================ */
var state = {
  view: 'classifica',
  ai: 'wait',          // wait | ok | no
  aiMotivo: '',
  utente: null,        // risposta di /api/io
  preferiti: {},       // codice -> { nota }
  q: '', answers: [], heads: [],
  result: null,        // normalized AI result
  sel: null,           // { code, idx }
  picks: {}, extra: '',
  busy: null, error: '', warn: '',
  country: '', flow: 'import',
  trad: {},            // row index -> italian text
  tradBusy: false,
  qmsg: '', nq: '', open: {}, secOpen: {}, flash: -1,
  anima: false
};
var ctl = null, tick = null, sampleFn = null;

/* ================================================================
   Helpers
   ================================================================ */
function $(s) { return document.querySelector(s); }
function esc(s) { return String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function str(x, max) { var s = (typeof x === 'string' || typeof x === 'number') ? String(x).trim() : ''; return max && s.length > max ? s.slice(0, max) : s; }
function digits(x) { return String(x === null || x === undefined ? '' : x).replace(/\D/g, ''); }
function resolve(raw) {
  var c = digits(raw); if (c.length < 2) return null;
  if (c.length > 10) c = c.slice(0, 10);
  if (c.length % 2) c = c.slice(0, c.length - 1);
  var full = (c + '0000000000').slice(0, 10);
  var i = byCode.get(full);
  return { code: full, idx: i === undefined ? -1 : i };
}
function confLabel(n) { return n >= 80 ? 'alta' : n >= 55 ? 'media' : 'bassa'; }
function oggi() { var d = new Date(); return '' + d.getFullYear() + ('0' + (d.getMonth() + 1)).slice(-2) + ('0' + d.getDate()).slice(-2); }

/* ================================================================
   AI: prompts and calls
   ================================================================ */
function infoBlock() {
  if (!state.answers.length) return '';
  return '\nINFORMAZIONI GIÀ FORNITE DALL\'UTENTE:\n' + state.answers.map(function (a) { return '- ' + a.q + ' → ' + a.a; }).join('\n') + '\n';
}
/* ogni richiesta ha una parte fissa (contesto: istruzioni e testo ufficiale, riusata dalla cache del fornitore)
   e una parte che cambia (prompt: la merce e le risposte dell'utente), messa in fondo */
function merceBlock() { return 'MERCE DA CLASSIFICARE:\n«' + state.q + '»\n' + infoBlock(); }
function promptVoci() {
  return {
    contesto: 'Sei un esperto di classificazione doganale dell\'Unione europea (Sistema Armonizzato, Nomenclatura Combinata, TARIC).\n\n' +
      'Compito: indica le voci del Sistema Armonizzato a 4 cifre in cui la merce descritta alla fine potrebbe rientrare, dalla più probabile alla meno probabile. ' +
      'Includi anche le voci concorrenti realistiche (altro materiale, altra funzione, parti e accessori, assortimenti), perché la scelta finale verrà fatta in un secondo passaggio sul testo ufficiale. Da 1 a 5 voci, senza doppioni.\n\n' +
      'Rispondi solo con un oggetto JSON in questa forma:\n' +
      '{"merce":"riformulazione breve e precisa della merce, in italiano","voci":[{"voce":"8467","motivo":"massimo 10 parole"}],"non_classificabile":null}\n\n' +
      'Se il testo non descrive una merce, restituisci "voci":[] e scrivi in "non_classificabile" una frase che dice all\'utente che cosa manca.',
    prompt: merceBlock()
  };
}
function headingBlock(hi) {
  var base = LVL[hi], out = [];
  var cap = PARENT[hi] >= 0 ? pathOf(hi)[0] : -1;
  if (cap >= 0) out.push('CAPITOLO ' + CODE[cap].slice(0, 2) + ' — ' + DESC[cap]);
  for (var j = hi; j < END[hi]; j++) {
    var depth = LVL[j] - base, dash = '';
    for (var k = 0; k < depth; k++) dash += '- ';
    out.push((FLAG[j] === 'g' ? '..........' : CODE[j]) + (FLAG[j] === 'L' ? '*' : ' ') + ' ' + dash + DESC[j].replace(/\n/g, ' / '));
  }
  return out.join('\n');
}
function promptScelta(heads) {
  var blocks = [], used = 0, skipped = [];
  heads.forEach(function (h) {
    var hi = headingIdx(h); if (hi < 0) return;
    var b = headingBlock(hi);
    if (used + b.length > 150000 && blocks.length) { skipped.push(h); return; }
    used += b.length; blocks.push(b);
  });
  var contesto = 'Sei un esperto di classificazione doganale dell\'Unione europea. Classifichi secondo le Regole generali per l\'interpretazione della Nomenclatura Combinata (da 1 a 6), ' +
    'le note di sezione e di capitolo e la prassi consolidata (note esplicative, informazioni tariffarie vincolanti). La merce da classificare è descritta alla fine.\n\n' +
    'NOMENCLATURA UFFICIALE (TARIC dell\'UE, situazione al ' + DATA_IT + '; testo ufficiale in italiano' + (N_EN ? ', tranne alcune righe recenti rimaste in inglese' : '') + ').\n' +
    'Ogni riga: codice a 10 cifre, trattini che indicano il livello, descrizione. L\'asterisco dopo il codice indica un codice dichiarabile. ' +
    'Le righe che iniziano con puntini sono titoli intermedi senza codice proprio.\n\n' +
    blocks.join('\n\n') + '\n\n' +
    'COMPITO\n' +
    '1. Scegli il codice dichiarabile più adatto alla merce. Usa esclusivamente codici che compaiono qui sopra con l\'asterisco, scritti con 10 cifre senza spazi. ' +
    'Se mancano informazioni, proponi comunque il codice più probabile per la merce nella sua forma più comune e abbassa la confidenza.\n' +
    '2. Indica da 0 a 4 alternative realistiche, anch\'esse con asterisco, ciascuna con la condizione concreta in cui sarebbe quella corretta.\n' +
    '3. Se per scegliere tra i rami mancano caratteristiche della merce (materiale, composizione, peso, dimensioni, potenza, uso, confezione, destinatario), formula da 1 a 3 domande. ' +
    'Ogni domanda deve corrispondere a una distinzione che esiste davvero nel testo ufficiale qui sopra e proporre da 2 a 5 risposte brevi che coprano tutti i casi. ' +
    'Non chiedere ciò che l\'utente ha già indicato. Se non manca nulla, "domande": [].\n' +
    '4. Se nessuna delle voci fornite è adatta e ritieni corretta un\'altra voce a 4 cifre, elencala in "altre_voci"; altrimenti "altre_voci": [].\n' +
    '5. Scrivi tutto in italiano, tranne i codici.\n\n' +
    'Rispondi solo con un oggetto JSON in questa forma:\n' +
    '{"merce":"...","migliore":{"codice":"0000000000","descrizione_it":"che cosa comprende il codice, in italiano","motivazione":"da 1 a 3 frasi che richiamano i termini della voce e delle sottovoci","confidenza":0},' +
    '"alternative":[{"codice":"0000000000","descrizione_it":"...","quando":"scegli questa se ...","confidenza":0}],' +
    '"domande":[{"domanda":"...","opzioni":["...","..."],"perche":"quale distinzione risolve"}],"altre_voci":[]}\n' +
    '"confidenza" è un intero da 0 a 100.';
  return { contesto: contesto, prompt: merceBlock() };
}
function normResult(r) {
  r = (r && typeof r === 'object') ? r : {};
  var out = { merce: str(r.merce, 300), best: null, alts: [], domande: [], attenzione: [], altre: [] };
  var b = r.migliore || r.risultato || null;
  function cand(o) {
    if (!o || typeof o !== 'object') return null;
    var c = digits(o.codice); if (c.length < 4) return null;
    c = (c + '0000000000').slice(0, 10);
    var n = Number(o.confidenza); if (!isFinite(n)) n = 0;
    if (n > 0 && n <= 1) n = n * 100;
    return { code: c, it: str(o.descrizione_it, 500), why: str(o.motivazione, 900), when: str(o.quando, 400), conf: Math.max(0, Math.min(100, Math.round(n))) };
  }
  out.best = cand(b);
  var seen = {}; if (out.best) seen[out.best.code] = 1;
  (Array.isArray(r.alternative) ? r.alternative : []).forEach(function (a) {
    var c = cand(a); if (c && !seen[c.code] && out.alts.length < 4) { seen[c.code] = 1; out.alts.push(c); }
  });
  (Array.isArray(r.domande) ? r.domande : []).forEach(function (d) {
    if (!d || typeof d !== 'object' || out.domande.length >= 3) return;
    var q = str(d.domanda, 300);
    var opts = (Array.isArray(d.opzioni) ? d.opzioni : []).map(function (o) { return str(o, 120); }).filter(Boolean).slice(0, 6);
    if (q && opts.length >= 2) out.domande.push({ q: q, opts: opts, why: str(d.perche, 300) });
  });
  (Array.isArray(r.attenzione) ? r.attenzione : []).forEach(function (a) { var s = str(a, 400); if (s && out.attenzione.length < 4) out.attenzione.push(s); });
  (Array.isArray(r.altre_voci) ? r.altre_voci : []).forEach(function (h) { var c = digits(h).slice(0, 4); if (c.length === 4 && headingIdx(c) >= 0 && out.altre.indexOf(c) < 0) out.altre.push(c); });
  return out;
}
var ERR = {
  offline: 'Server non raggiungibile: controlla la connessione e riprova.',
  invalid_json: 'La risposta non era leggibile. Premi di nuovo Classifica.',
  prompt_too_large: 'La descrizione è troppo lunga. Accorciala e riprova.',
  upstream_error: 'Errore temporaneo del servizio. Riprova tra poco.'
};
function errMsg(e) { return (e && e.message) || ERR[e && e.code] || ERR.upstream_error; }

/* l'IA risponde tramite il server, che custodisce la chiave e conta le classificazioni del mese */
function nuovaOperazione() { return 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
function creaIA() {
  return {
    /* p = { contesto, prompt } oppure solo il testo; opts: modelTier, schema, operazione, tipo, signal */
    json: function (p, opts) {
      opts = opts || {};
      var corpo = typeof p === 'string' ? { prompt: p } : { prompt: p.prompt, contesto: p.contesto || '' };
      corpo.livello = opts.modelTier === 'quick' ? 'rapido' : 'standard';
      if (opts.schema) corpo.schema = opts.schema;
      corpo.operazione = opts.operazione || '';
      corpo.tipo = opts.tipo || 'classifica';
      return T.api('POST', '/api/ia', corpo, { signal: opts.signal })
        .then(function (r) { return r.risultato; }, function (e) {
          if (e && e.name === 'AbortError') throw { code: 'cancelled' };
          throw { code: (e && e.codice) || 'upstream_error', message: e && e.errore };
        });
    }
  };
}
function impostaIA() {
  var u = state.utente, ia = u && u.ia, intanto = ' Intanto puoi sfogliare la nomenclatura e aprire un codice scrivendone le cifre.';
  sampleFn = null; state.ai = 'no';
  if (!ia || !ia.configurata) state.aiMotivo = 'La classificazione assistita non è attiva: ' +
    (u && u.ruolo === 'amministratore' ? 'inserisci la chiave di Gemini nel servizio su Render (Gestione, «Intelligenza artificiale»).'
      : 'la deve attivare l\'amministratore di MAGIC HS.') + intanto;
  else if (ia.tetto) state.aiMotivo = 'Questo mese le classificazioni con l\'IA sono finite per tutti: chiedi all\'amministratore.' + intanto;
  else if (ia.limite === 0) state.aiMotivo = 'La classificazione assistita non è abilitata per il tuo account: chiedi all\'amministratore.' + intanto;
  else if (ia.limite !== null && ia.usate >= ia.limite) state.aiMotivo = 'Hai usato tutte le ' + ia.limite + ' classificazioni con l\'IA di questo mese: ' +
    'per averne altre chiedi all\'amministratore. Nomenclatura e misure restano consultabili.';
  else { sampleFn = creaIA(); state.ai = 'ok'; state.aiMotivo = ''; }
}
function aggiornaIo() {
  return T.api('GET', '/api/io').then(function (u) { state.utente = u; impostaIA(); renderMsg(); return u; }, function () { return state.utente; });
}
function salvaStorico() {
  var r = state.result;
  if (!r || !r.best) return;
  T.api('POST', '/api/storico', { testo: state.q, codice: r.best.code, dati: { q: state.q, answers: state.answers, heads: state.heads, result: r } })
    .then(function (x) { if (T.viste && T.viste.profilo) T.viste.profilo.daRicaricare = true; return x; }, function () { /* lo storico non è indispensabile */ });
}
var prefT = null;
function salvaPreferenze() {
  if (!state.utente) return;
  var p = state.utente.preferenze;
  p.paese = state.country || ''; p.flusso = state.flow;
  clearTimeout(prefT);
  prefT = setTimeout(function () { T.api('PUT', '/api/io/preferenze', p).catch(function () { /* riprova alla prossima modifica */ }); }, 500);
}

function setBusy(step, note) {
  if (!state.busy) state.busy = { t0: Date.now() };
  state.busy.step = step; state.busy.note = note;
  renderStato();
  if (!tick) tick = setInterval(renderStato, 1000);
}
function clearBusy() { state.busy = null; if (tick) { clearInterval(tick); tick = null; } renderStato(); }

function classifica(soloScelta) {
  if (state.busy) return;
  state.error = ''; state.warn = '';
  var qEl = $('#q'); state.q = qEl.value.trim().replace(/\s+/g, ' ');
  if (!state.q) { state.error = 'Scrivi che cosa devi classificare.'; renderMsg(); qEl.focus(); return; }
  // a typed code opens that code directly, without the AI
  if (/^[\d\s.]+$/.test(state.q) && digits(state.q).length >= 2) {
    var r = resolve(state.q);
    state.result = null; state.answers = []; state.heads = []; state.picks = {}; state.trad = {};
    state.sel = r; state.anima = true; renderAll(); return;
  }
  if (!sampleFn) { state.error = state.ai === 'wait' ? 'Attendi un istante: sto caricando il tuo profilo.' : state.aiMotivo; renderMsg(); return; }
  if (state.q.length > 2000) { state.error = ERR.prompt_too_large; renderMsg(); return; }

  ctl = new AbortController();
  var signal = ctl.signal;
  var heads = soloScelta ? state.heads.slice() : [];
  if (!soloScelta) { state.answers = []; state.result = null; state.sel = null; state.picks = {}; state.trad = {}; renderEsito(); renderFornite(); }
  renderMsg();
  if (soloScelta) { var top = $('#q'); if (top.scrollIntoView) top.scrollIntoView({ behavior: 'smooth', block: 'center' }); }

  var p = Promise.resolve(), op = nuovaOperazione();       // una classificazione: più richieste, conta una volta sola
  if (!heads.length) {
    setBusy(1, 'Individuo le voci candidate');
    p = sampleFn.json(promptVoci(), { modelTier: 'quick', schema: 'voci', operazione: op, signal: signal }).then(function (r1) {
      r1 = (r1 && typeof r1 === 'object') ? r1 : {};
      (Array.isArray(r1.voci) ? r1.voci : []).forEach(function (v) {
        var h = digits(v && typeof v === 'object' ? v.voce : v).slice(0, 4);
        if (h.length === 4 && headingIdx(h) >= 0 && heads.indexOf(h) < 0 && heads.length < 5) heads.push(h);
      });
      if (!heads.length) { var why = str(r1.non_classificabile, 300); throw { code: 'no_heads', message: why || 'Non ho trovato una voce doganale per questa descrizione. Aggiungi che cos\'è, di che materiale è fatto e a che cosa serve.' }; }
      state.heads = heads;
    });
  }
  p.then(function () {
    setBusy(2, 'Confronto con il testo ufficiale delle voci ' + heads.join(', '));
    return sampleFn.json(promptScelta(heads), { schema: 'scelta', operazione: op, signal: signal });
  }).then(function (r2) {
    var res = normResult(r2);
    var nuove = res.altre.filter(function (h) { return heads.indexOf(h) < 0; }).slice(0, 3);
    if (!nuove.length) return res;
    heads = heads.concat(nuove); state.heads = heads;
    setBusy(3, 'Aggiungo le voci ' + nuove.join(', ') + ' e ricontrollo');
    return sampleFn.json(promptScelta(heads), { schema: 'scelta', operazione: op, signal: signal }).then(normResult);
  }).then(function (res) {
    if (!res.best) throw { code: 'invalid_json' };
    state.result = res; state.picks = {}; state.extra = '';
    state.sel = { code: res.best.code, idx: byCode.has(res.best.code) ? byCode.get(res.best.code) : -1 };
    state.anima = true;
    salvaStorico();
    clearBusy(); renderAll(); aggiornaIo();
    var e = $('#esito'); if (e && e.scrollIntoView) e.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }).catch(function (e) {
    clearBusy();
    if (e && e.code === 'cancelled') { renderAll(); return; }
    aggiornaIo();          // classificazioni usate e motivo per cui l'IA non è disponibile
    state.error = (e && e.code === 'no_heads') ? e.message : errMsg(e);
    renderAll();
  });
}
function ferma() { if (ctl) ctl.abort(); }

function traduci() {
  if (!sampleFn || state.tradBusy || !state.sel || state.sel.idx < 0) return;
  var perc = pathOf(state.sel.idx);
  var rows = perc.filter(function (j) { return INGL[j] && !state.trad[j]; });
  if (!rows.length) return;
  var c2 = new AbortController();
  state.tradBusy = true; renderEsito();
  var contesto = perc.filter(function (j) { return !INGL[j]; }).map(function (j) { return descOf(j).replace(/\n/g, ' '); }).join(' > ');
  var testo = rows.map(function (j, k) { return (k + 1) + '. ' + DESC[j].replace(/\n/g, ' '); }).join('\n');
  sampleFn.json('Traduci dall\'inglese all\'italiano, con la terminologia della Nomenclatura Combinata dell\'UE, queste ' + rows.length + ' descrizioni doganali. ' +
    'Restituisci solo un oggetto JSON {"traduzioni": [...]} con ' + rows.length + ' stringhe, nello stesso ordine, senza numerazione.\n\n' +
    (contesto ? 'Contesto (voci superiori, già in italiano): ' + contesto + '\n\n' : '') + testo,
    { modelTier: 'quick', schema: 'traduzione', tipo: 'traduzione', operazione: nuovaOperazione(), signal: c2.signal })
    .then(function (a) {
      if (a && !Array.isArray(a)) a = a.traduzioni;
      if (Array.isArray(a) && a.length === rows.length) rows.forEach(function (j, k) { state.trad[j] = str(a[k], 1500); });
      else state.warn = 'Traduzione non riuscita. Riprova.';
    })
    .catch(function (e) { if (!e || e.code !== 'cancelled') state.warn = errMsg(e); })
    .then(function () { state.tradBusy = false; renderEsito(); });
}

/* ================================================================
   Measures: official TARIC extraction (duties, conditions, documents)
   chapter file = { s: [strings], l: [legal bases], m: {code: rows}, x: {code: rows} }
   row = [type, area, dutyIdx, start, end, addCode, orderNo, legalIdx, exclusions, footnotes, condIdx, redInd?]
   ================================================================ */
var RIF = window.TARIC_RIF || { data: '', aree: {}, gruppi: {}, cert: {}, add: {}, tipi: {} };
var MIS = window.TARIC_M = window.TARIC_M || {};
var NOTE = window.TARIC_NOTE || null;
var statoCap = {}, noteChieste = false, GR = {};

function membro(g, p) {
  var s = GR[g];
  if (!s) { s = GR[g] = {}; (RIF.gruppi[g] || '').split(' ').forEach(function (c) { if (c) s[c] = 1; }); }
  return !!s[p];
}
function caricaScript(src, fatto) {
  var s = document.createElement('script');
  s.src = src; s.onload = function () { fatto(true); }; s.onerror = function () { fatto(false); };
  document.head.appendChild(s);
}
function chiediCapitolo(ch) {
  if (MIS[ch]) return 'ok';
  if (statoCap[ch]) return statoCap[ch];
  statoCap[ch] = 'attesa';
  caricaScript(BASE_DATI + 'm/' + ch + '.js', function (ok) { statoCap[ch] = (ok && MIS[ch]) ? 'ok' : 'errore'; renderEsito(); });
  if (!NOTE && !noteChieste) {
    noteChieste = true;
    caricaScript(BASE_DATI + 'note.js', function (ok) { NOTE = window.TARIC_NOTE || null; if (ok && NOTE) renderEsito(); });
  }
  return 'attesa';
}
function oggiNum() { return parseInt(oggi(), 10); }
function dataIt(n) { var s = String(n); return s.slice(6, 8) + '/' + s.slice(4, 6) + '/' + s.slice(0, 4); }

/* measure types: Italian labels written for this page (the extraction names them in English only) */
var TIPI_IT = {
  103: 'Dazio paesi terzi', 105: 'Dazio non preferenziale per uso finale', 106: 'Dazio dell\'unione doganale',
  107: 'Dazio doganale sulle spedizioni di modico valore', 109: 'Unità supplementare', 110: 'Unità supplementare all\'importazione',
  112: 'Sospensione tariffaria autonoma', 115: 'Sospensione autonoma per uso finale',
  117: 'Sospensione per merci destinate a navi, imbarcazioni e piattaforme', 119: 'Sospensione tariffaria per l\'aeronavigabilità',
  122: 'Contingente tariffario non preferenziale', 123: 'Contingente tariffario non preferenziale per uso finale',
  141: 'Sospensione preferenziale', 142: 'Preferenza tariffaria', 143: 'Contingente tariffario preferenziale',
  145: 'Preferenza per uso finale', 146: 'Contingente tariffario preferenziale per uso finale', 147: 'Contingente dell\'unione doganale',
  277: 'Divieto di importazione', 278: 'Divieto di esportazione', 410: 'Controllo veterinario', 415: 'Controllo ufficiale sui vegetali',
  464: 'Sottovoce soggetta alle disposizioni sull\'uso finale', 465: 'Restrizione all\'immissione in libera pratica',
  467: 'Restrizione all\'esportazione', 473: 'Autorizzazione di esportazione', 474: 'Immissione in libera pratica con limitazione quantitativa',
  475: 'Restrizione all\'immissione in libera pratica', 476: 'Restrizione all\'esportazione', 478: 'Autorizzazione di esportazione per beni a duplice uso',
  479: 'Controllo all\'esportazione delle sostanze chimiche pericolose', 481: 'Sottovoce soggetta a restrizioni all\'importazione',
  482: 'Sottovoce soggetta a restrizioni legali (massa netta per unità supplementare)', 483: 'Sottovoce soggetta a restrizioni legali (prezzo unitario)',
  484: 'Sottovoce soggetta a restrizioni fisiche (massa netta per unità supplementare)', 485: 'Sottovoce soggetta a restrizioni all\'esportazione',
  488: 'Prezzo unitario', 489: 'Prezzo rappresentativo', 490: 'Valore forfettario all\'importazione',
  495: 'Sottovoce soggetta a restrizioni legali (massa netta dichiarata)', 496: 'Sottovoce soggetta a restrizioni legali (unità supplementare dichiarata)',
  551: 'Dazio antidumping provvisorio', 552: 'Dazio antidumping definitivo', 553: 'Dazio compensativo provvisorio', 554: 'Dazio compensativo definitivo',
  555: 'Dazio antidumping o compensativo con riscossione in sospeso', 561: 'Avviso di apertura di un procedimento antidumping o antisovvenzioni',
  564: 'Registrazione antidumping o antisovvenzioni', 565: 'Riesame antidumping o antisovvenzioni', 566: 'Antidumping o antisovvenzioni: rilevazione statistica',
  570: 'Dazio antidumping o compensativo: controllo', 651: 'Cauzione basata sul prezzo rappresentativo', 652: 'Dazio addizionale basato sul prezzo CIF',
  653: 'Cauzione basata sul prezzo rappresentativo, ridotta per contingente', 654: 'Dazio addizionale basato sul prezzo CIF, ridotto per contingente',
  695: 'Dazi addizionali', 696: 'Dazi addizionali', 705: 'Divieto di importazione di merci per tortura e repressione',
  706: 'Divieto di esportazione di merci per tortura e repressione', 707: 'Controllo all\'importazione', 708: 'Restrizione all\'esportazione di merci per tortura e repressione',
  709: 'Controllo all\'esportazione', 710: 'Controllo all\'importazione CITES', 711: 'Controllo all\'importazione di beni e tecnologie soggetti a restrizioni',
  712: 'Controllo all\'importazione delle specie esotiche invasive', 713: 'Controllo all\'importazione di OGM e prodotti che li contengono',
  714: 'Controllo all\'importazione', 715: 'Controllo all\'esportazione CITES', 716: 'Controllo all\'esportazione di prodotti della pesca',
  717: 'Controllo all\'esportazione di beni e tecnologie soggetti a restrizioni', 718: 'Controllo all\'esportazione dei beni di lusso',
  719: 'Controllo sulla pesca illegale, non dichiarata e non regolamentata', 722: 'Restrizione all\'immissione in libera pratica di alimenti e mangimi',
  724: 'Controllo all\'importazione dei gas fluorurati a effetto serra', 725: 'Controllo all\'esportazione delle sostanze che riducono lo strato di ozono',
  726: 'Controllo all\'importazione delle sostanze che riducono lo strato di ozono', 728: 'Controllo all\'importazione dei beni di lusso',
  730: 'Conformità ai controlli pre-esportazione', 731: 'Controllo all\'importazione', 732: 'Controllo all\'importazione',
  734: 'Controllo all\'importazione dei beni culturali', 735: 'Controllo all\'esportazione dei beni culturali', 736: 'Controllo all\'esportazione',
  737: 'Controllo all\'esportazione', 738: 'Restrizione su beni dell\'elenco comune delle attrezzature militari',
  740: 'Controllo all\'esportazione di pellicce di cane e di gatto', 745: 'Controllo all\'importazione di pellicce di cane e di gatto',
  746: 'Controllo all\'importazione dei prodotti derivati dalla foca', 747: 'Controllo all\'importazione di legname con licenza FLEGT',
  748: 'Controllo all\'importazione del mercurio', 749: 'Controllo all\'esportazione del mercurio', 750: 'Controllo all\'importazione dei prodotti biologici',
  751: 'Controllo all\'esportazione dei rifiuti', 755: 'Controllo all\'importazione dei rifiuti', 760: 'Controllo all\'importazione',
  761: 'Controllo all\'importazione REACH', 762: 'Controllo all\'importazione', 763: 'Controllo all\'importazione', 764: 'Controllo all\'importazione',
  765: 'Controllo all\'esportazione dei gas fluorurati a effetto serra', 766: 'Controllo all\'esportazione', 767: 'Controllo all\'esportazione',
  768: 'Controllo all\'esportazione', 769: 'Controllo all\'importazione degli inquinanti organici persistenti',
  770: 'Controllo all\'importazione di legname con licenza FLEGT (Ghana)', 775: 'Meccanismo di adeguamento del carbonio alle frontiere (CBAM)',
  780: 'Controllo all\'esportazione', 781: 'Controllo all\'esportazione', 800: 'Tassa di gestione dell\'Unione'
};
var CATEGORIE = [
  { id: 'base', nome: 'Dazio di base', tipi: [103, 105] },
  { id: 'rid', nome: 'Preferenze, sospensioni e contingenti', tipi: [142, 145, 141, 106, 147, 143, 146, 112, 115, 117, 119, 122, 123] },
  { id: 'dif', nome: 'Difesa commerciale e dazi addizionali', tipi: [552, 551, 554, 553, 555, 695, 696, 652, 654, 651, 653, 570, 564, 565, 566, 561] },
  { id: 'prz', nome: 'Prezzi e valori di riferimento', tipi: [488, 489, 490] },
  { id: 'alt', nome: 'Vendite a distanza e spedizioni di modico valore', tipi: [107, 800] }
];
var CAT_DI = {};
CATEGORIE.forEach(function (c) { c.tipi.forEach(function (t, k) { CAT_DI[t] = { id: c.id, ord: k }; }); });
function catDi(t) { return CAT_DI[t] ? CAT_DI[t].id : ((t === 109 || t === 110) ? 'um' : 'ctl'); }
var DAZI_EXTRA = [551, 552, 553, 554, 555, 695, 696, 652, 654];

var AZIONI = {
  '01': 'si applica l\'importo indicato', '04': 'immissione in libera pratica non consentita', '05': 'esportazione non consentita',
  '06': 'importazione non consentita', '07': 'misura non applicabile', '08': 'sottovoce dichiarata non ammessa',
  '09': 'non consentita dopo il controllo', '10': 'dichiarazione da correggere (casella 33, 37, 38, 41 o 46)',
  '24': 'immissione in libera pratica consentita', '25': 'esportazione consentita', '26': 'importazione consentita',
  '27': 'la misura si applica', '28': 'sottovoce dichiarata ammessa', '29': 'consentita dopo il controllo'
};
var COND_IT = {
  A: 'Documento antidumping o compensativo', B: 'Certificato, licenza o documento', C: 'Certificato, licenza o documento',
  D: 'Certificato, licenza o documento', E: 'Quantità o prezzo unitario dichiarato', F: 'Prezzo netto franco frontiera',
  H: 'Certificato, licenza o documento', I: 'Quantità o prezzo unitario dichiarato', J: 'Massa netta dichiarata',
  L: 'Prezzo CIF', M: 'Prezzo dichiarato', Q: 'Certificato o licenza vidimati', R: 'Massa netta per unità supplementare',
  S: 'Prezzo per unità supplementare', U: 'Valore in dogana per unità', V: 'Prezzo all\'importazione (prezzo d\'entrata)',
  X: 'Unità supplementare dichiarata', Y: 'Altre condizioni'
};
var UM = {
  DTN: '100 kg', TNE: 't', KGM: 'kg', GRM: 'g', HLT: 'hl', LTR: 'l', LPA: 'l di alcole puro', ASV: '% vol', MIL: '1000 pezzi', CEN: '100 pezzi',
  NAR: 'pezzo', NPR: 'paio', MTK: 'm²', MTQ: 'm³', MTR: 'm', HMT: '100 m', DAP: '10 t polarizzate', TCE: 't CO₂ eq.', KSD: 'kg 90 % s.s.',
  KNI: 'kg N', KPO: 'kg K₂O', KPP: 'kg P₂O₅', KPH: 'kg KOH', KSH: 'kg NaOH', KNS: 'kg H₂O₂', KUR: 'kg U', KMA: 'kg metilammine',
  GFI: 'g isotopi fissili', CCT: 't di portata', CTM: 'carato', NCL: 'elemento', TJO: 'TJ', MWH: '1000 kWh'
};
var QUAL = {
  A: 'di alcole totale', C: '(migliaia)', E: 'peso netto sgocciolato', G: 'lordo', I: 'di biodiesel', M: 'di sostanza secca',
  P: 'di materia lattica', R: 'qualità tipo', S: 'di zucchero greggio', T: 'di materia lattica secca', Z: 'per 1 % di saccarosio'
};
var PAROLE = {
  MAX: 'max', MIN: 'min', NIHIL: 'nessun dazio', EA: 'elemento agricolo', EAR: 'elemento agricolo ridotto',
  ADSZ: 'dazio add. zucchero', ADSZR: 'dazio add. zucchero ridotto', ADFM: 'dazio add. farina', ADFMR: 'dazio add. farina ridotto'
};
/* supplementary units: TARIC measurement code -> customs abbreviation used in box 41 */
var UNITA_SUP = {
  NAR: 'p/st', NPR: 'pa', MIL: '1 000 p/st', CEN: '100 p/st', LTR: 'l', LPA: 'l alc. 100 %', MTR: 'm', MTK: 'm2', MTQ: 'm3', 'MTQ C': '1 000 m³',
  GRM: 'g', 'KGM E': 'kg/net eda', KSD: 'kg 90 % sdt', KNI: 'kg N', KPP: 'kg P2O5', KPO: 'kg K2O', KPH: 'kg KOH', KSH: 'kg NaOH',
  KNS: 'kg H2O2', KUR: 'kg U', KMA: 'kg met.am.', GFI: 'gi F/S', CTM: 'c/k', NCL: 'ce/el', CCT: 'ct/l', TJO: 'TJ', MWH: '1 000 kWh', TCE: 't CO2 eq.'
};

function num(s) { return parseFloat(String(s).replace(/,/g, '')); }
function nIt(v, min, max) { try { return v.toLocaleString('it-IT', { minimumFractionDigits: min, maximumFractionDigits: max }); } catch (e) { return String(v); } }
function unita(u, q) {
  if (u === 'ASV' && q === 'X') return '% vol/hl';
  var s = UM[u] || u;
  if (q) s += ' ' + (QUAL[q] || q);
  return s;
}
function isNum(x) { return /^[\d,]*\.?\d+$/.test(x); }
/* "12.800 % + 176.800 EUR DTN" -> "12,8 % + 176,80 EUR/100 kg" ; unknown tokens are passed through untouched */
function fmtDazio(str) {
  var t = String(str || '').replace(/\+/g, ' + ').trim().split(/\s+/), out = [], i = 0;
  if (t.length === 1 && t[0] === '') return '';
  while (i < t.length) {
    var x = t[i];
    if (isNum(x)) {
      var v = num(x), nx = t[i + 1];
      if (nx === '%') { out.push(nIt(v, 0, 3) + ' %'); i += 2; continue; }
      if (nx === 'EUR' || nx === 'EUC') {
        var u = t[i + 2], q = t[i + 3], s = nIt(v, 2, 3) + ' EUR'; i += 2;
        if (u && /^[A-Z]{3}$/.test(u) && !PAROLE[u]) {
          i++;
          if (q && /^[A-Z]$/.test(q)) i++; else q = '';
          s += '/' + unita(u, q);
        }
        out.push(s); continue;
      }
      out.push(nIt(v, 0, 3)); i++; continue;
    }
    out.push(PAROLE[x] || x); i++;
  }
  return out.join(' ');
}
/* condition list, as written in the Duty column: "B cert: C-644 (29):; B (09):" */
function parseCond(txt) {
  var out = [];
  String(txt || '').replace(/^Cond:\s*/, '').split(';').forEach(function (p) {
    p = p.trim(); if (!p) return;
    var m = /^([A-Z]{1,2}) (.*?)\((\d\d)\):(.*)$/.exec(p);
    if (!m) { out.push({ tipo: '?', raw: p, cert: '', soglia: '', az: '', dazio: '' }); return; }
    var mid = m[2].trim(), c = /^cert: (\S)-(\S{3})$/.exec(mid);
    out.push({ tipo: m[1], cert: c ? c[1] + c[2] : '', soglia: c ? '' : mid, az: m[3], dazio: m[4].trim() });
  });
  return out;
}
function condDi(m) { return /^Cond:/.test(m.duty) ? m.duty : m.cond; }
function effetto(p) { return p.dazio ? fmtDazio(p.dazio) : (AZIONI[p.az] || ('esito ' + p.az + ' (vedi TARIC)')); }
function fmtSoglia(s, tipo) {
  var m = /^([\d.,]+)\s*(EUR|EUC)?\s*\/?\s*([A-Z]{3})?(?:\s([A-Z]))?$/.exec(s);
  if (!m) return s;
  var v = num(m[1]);
  var t = m[2] ? nIt(v, 2, 3) + ' EUR' + (m[3] ? '/' + unita(m[3], m[4]) : '') : nIt(v, 0, 3) + (m[3] ? ' ' + unita(m[3], m[4]) : '');
  return (/^[EI]/.test(tipo) ? 'fino a ' : 'da ') + t;
}
/* one-line reading of the duty of a measure */
function sintesi(m) {
  var d = m.duty;
  if (!/^Cond:/.test(d)) return fmtDazio(d);
  var vals = [], conCert = null, senza = null, soglie = false;
  parseCond(d).forEach(function (p) {
    if (p.soglia) soglie = true;
    if (!p.dazio) return;
    if (vals.indexOf(p.dazio) < 0) vals.push(p.dazio);
    if (p.cert && conCert === null) conCert = p.dazio;
    if (!p.cert && !p.soglia) senza = p.dazio;
  });
  if (!vals.length) return '';
  if (vals.length === 1) return fmtDazio(vals[0]);
  if (soglie) return 'variabile';
  var cs = certDi(m);
  if (conCert !== null && senza !== null && vals.length === 2) return fmtDazio(conCert) + ' con ' + (cs.length === 1 ? cs[0] : 'documento') + ', altrimenti ' + fmtDazio(senza);
  return 'variabile';
}
function zero(d) { return !d || /^NIHIL$/.test(d.trim()) || /^0(\.0+)? (%|EUR)/.test(d.trim()); }
/* true when the duty is due whatever is declared (not only in a special case such as a given document code) */
function sempreDovuto(m) {
  if (!/^Cond:/.test(m.duty)) return !zero(m.duty);
  var senza = null, tutti = true;
  parseCond(m.duty).forEach(function (p) { if (!p.cert && !p.soglia) senza = p.dazio; if (zero(p.dazio)) tutti = false; });
  return senza !== null ? !zero(senza) : tutti;
}
function percentuali(m) {
  var out = [], re = /([\d.,]*\.?\d+) %/g, x;
  while ((x = re.exec(m.duty))) out.push(num(x[1]));
  return out;
}
function certDi(m) { var o = []; parseCond(condDi(m)).forEach(function (p) { if (p.cert && o.indexOf(p.cert) < 0) o.push(p.cert); }); return o; }

/* measures that apply to nomenclature row i (the row and its ancestors) for one country and one flow, today */
function misure(i, flow, paese) {
  var C = MIS[CODE[i].slice(0, 2)];
  if (!C) return null;
  var tab = (flow === 'export' ? C.x : C.m) || {}, og = oggiNum(), out = [], altri = 0;
  pathOf(i).forEach(function (j) {
    if (FLAG[j] === 'g') return;
    var rows = tab[CODE[j]];
    if (!rows) return;
    for (var k = 0; k < rows.length; k++) {
      var r = rows[k];
      if (r[4] && r[4] < og) continue;
      var o = String(r[1]), ex = r[8] ? String(r[8]).split(' ') : null, rel;
      if (paese) {
        if (ex && ex.indexOf(paese) >= 0) continue;
        if (o === paese) rel = 2; else if (o === '1011') rel = 0; else if (membro(o, paese)) rel = 1; else continue;
      } else if (o === '1011' || o === '1008') rel = 0;
      else { altri++; continue; }
      out.push({ t: r[0], o: o, rel: rel, duty: C.s[r[2]] || '', da: r[3], a: r[4], add: r[5] ? String(r[5]) : '', ord: r[6] ? String(r[6]) : '',
        legal: C.l[r[7]] || '', note: r[9] ? String(r[9]).split(' ') : [], cond: r[10] ? C.s[r[10]] : '', red: r[11] || '', liv: j, fut: r[3] > og });
    }
  });
  return { righe: out, altri: altri };
}
function unitaSupplementare(i) {
  var C = MIS[CODE[i].slice(0, 2)];
  if (!C) return undefined;
  var og = oggiNum(), trovata = null;
  [C.m || {}, C.x || {}].forEach(function (tab) {
    pathOf(i).forEach(function (j) {
      if (FLAG[j] === 'g' || !tab[CODE[j]]) return;
      tab[CODE[j]].forEach(function (r) {
        if ((r[0] === 109 || r[0] === 110) && String(r[1]) === '1011' && r[3] <= og && !(r[4] && r[4] < og)) trovata = C.s[r[2]];
      });
    });
  });
  return trovata;
}

/* ---------- rendering of measures ---------- */
function nomeArea(o) { return o === '1011' ? 'tutti i paesi (erga omnes)' : (RIF.aree[o] || o); }
function fmtContingente(o) { o = String(o); return o.length === 6 ? o.slice(0, 2) + '.' + o.slice(2) : o; }
function fmtLegale(l) {
  return String(l || '').replace(/^Regulation /, 'Reg. ').replace(/^Decision /, 'Dec. ').replace(/^Information /, 'Informazione ')
    .replace(/^Accession act /, 'Atto di adesione ').replace(/^Draft /, 'Bozza ');
}
function taglia(s, n) { s = String(s || '').split('\n')[0]; return s.length > n ? s.slice(0, n - 1).trim() + '…' : s; }
function metaDi(m) {
  var a = [(state.flow === 'export' ? 'destinazione: ' : 'origine: ') + nomeArea(m.o)];
  if (m.fut) a.push('dal ' + dataIt(m.da));
  if (m.a) a.push('fino al ' + dataIt(m.a));
  if (m.ord) a.push('contingente n. ' + fmtContingente(m.ord));
  if (m.add) a.push('codice addizionale ' + m.add + (RIF.add[m.add] ? ': ' + taglia(RIF.add[m.add], 110) : ''));
  if (m.red) a.push('indicatore di riduzione ' + m.red);
  a.push('definita sul codice ' + showCode(m.liv));
  return a;
}
function htmlCond(m) {
  var txt = condDi(m);
  if (!txt) return '';
  var gruppi = [], ix = {};
  parseCond(txt).forEach(function (p) {
    if (ix[p.tipo] === undefined) { ix[p.tipo] = gruppi.length; gruppi.push({ tipo: p.tipo, parti: [] }); }
    gruppi[ix[p.tipo]].parti.push(p);
  });
  var piu = gruppi.length > 1;
  return (piu ? '<p class="ct"><b>Vanno soddisfatte tutte le ' + gruppi.length + ' condizioni che seguono.</b></p>' : '') + gruppi.map(function (g, gk) {
    var certs = g.parti.filter(function (p) { return p.cert; });
    var soglie = g.parti.filter(function (p) { return p.soglia; });
    var resto = g.parti.filter(function (p) { return !p.cert && !p.soglia; });
    var h = piu ? '<p class="ct cn">Condizione ' + (gk + 1) + ' di ' + gruppi.length + '</p>' : '';
    if (certs.length) {
      var eff = certs.map(effetto), uguali = eff.every(function (e) { return e === eff[0]; });
      h += '<p class="ct">' + (certs.length > 1 ? 'Con uno di questi documenti' : 'Con questo documento') + (uguali ? ': <b>' + esc(eff[0]) + '</b>' : '') + '</p><ul class="docs">' +
        certs.map(function (p, k) {
          return '<li><span class="cc">' + esc(p.cert) + '</span><span>' + esc(RIF.cert[p.cert] || 'Documento ' + p.cert) + (!uguali ? ' <b>→ ' + esc(eff[k]) + '</b>' : '') + '</span></li>';
        }).join('') + '</ul>';
    }
    if (soglie.length) {
      h += '<p class="ct">' + esc(COND_IT[g.tipo.charAt(0)] || ('Condizione ' + g.tipo)) + '</p><ul class="docs sg">' +
        soglie.map(function (p) { return '<li><span class="cc">' + esc(fmtSoglia(p.soglia, g.tipo)) + '</span><span>' + esc(effetto(p)) + '</span></li>'; }).join('') + '</ul>';
    }
    resto.forEach(function (p) {
      h += '<p class="ct">' + (p.raw ? esc(p.raw) : ((certs.length ? 'Senza documento' : 'Negli altri casi') + ': <b>' + esc(effetto(p)) + '</b>')) + '</p>';
    });
    return '<div class="cond">' + h + '</div>';
  }).join('');
}
function htmlPiu(rows) {
  var leg = [], note = [];
  rows.forEach(function (m) {
    var l = fmtLegale(m.legal); if (l && leg.indexOf(l) < 0) leg.push(l);
    m.note.forEach(function (c) { if (note.indexOf(c) < 0) note.push(c); });
  });
  if (!leg.length && !note.length) return '';
  var h = '<details class="piu"><summary>Base giuridica' + (note.length ? ' e note (' + note.length + ')' : '') + '</summary>';
  if (leg.length) h += '<p class="notaT">' + esc(leg.slice(0, 8).join(' · ')) + (leg.length > 8 ? ' e altre ' + (leg.length - 8) : '') + '</p>';
  note.slice(0, 10).forEach(function (c) { h += '<p class="notaT"><span class="cc">' + esc(c) + '</span> ' + esc(NOTE ? (NOTE[c] || '') : 'Carico il testo della nota…') + '</p>'; });
  if (note.length > 10) h += '<p class="notaT">Altre ' + (note.length - 10) + ' note nella scheda TARIC.</p>';
  return h + '</details>';
}
function ordinaRighe(rows) {
  return rows.slice().sort(function (a, b) {
    var ra = /999$/.test(a.add) ? 0 : 1, rb = /999$/.test(b.add) ? 0 : 1;
    return ra - rb || String(a.add).localeCompare(String(b.add)) || String(a.ord).localeCompare(String(b.ord)) || a.da - b.da;
  });
}
function rigaCompatta(m) {
  var et = m.add ? taglia(RIF.add[m.add], 140) : '', extra = [];
  if (m.ord) extra.push('contingente n. ' + fmtContingente(m.ord));
  if (m.fut) extra.push('dal ' + dataIt(m.da));
  if (m.a) extra.push('fino al ' + dataIt(m.a));
  var txt = [et].concat(extra).filter(Boolean).join(' · ');
  return '<div class="rc" data-t="' + esc((m.add + ' ' + txt).toLowerCase()) + '"><span class="cc">' + esc(m.add || '–') + '</span><span>' + esc(txt || 'senza codice addizionale') + '</span><b>' + esc(sintesi(m)) + '</b></div>';
}
function elencoRighe(rows, idx) {
  var n = rows.length, righe = ordinaRighe(rows).map(rigaCompatta).join('');
  if (n <= 6) return '<div class="righe">' + righe + '</div>';
  return '<details class="piu"><summary>Mostra le ' + n + ' righe</summary>' +
    (n > 12 ? '<input class="campo filtro" id="filtro-' + idx + '" type="search" autocomplete="off" placeholder="Filtra per nome o codice" aria-label="Filtra le righe">' : '') +
    '<div class="righe">' + righe + '</div></details>';
}
function htmlGruppo(g, idx) {
  var att = g.rows.filter(function (m) { return !m.fut; }), fut = g.rows.filter(function (m) { return m.fut; });
  var testa = '<div class="mt">' + esc(TIPI_IT[g.t] || RIF.tipi[g.t] || ('Misura ' + g.t)) + ' <span class="mc">' + g.t + '</span></div>';
  var inArrivo = '';
  if (att.length && fut.length) {
    var primo = Math.min.apply(null, fut.map(function (m) { return m.da; }));
    inArrivo = '<details class="piu"><summary>In arrivo dal ' + dataIt(primo) + ': ' + fut.length + (fut.length === 1 ? ' riga' : ' righe') + '</summary><div class="righe">' + ordinaRighe(fut).map(rigaCompatta).join('') + '</div></details>';
  }
  var vive = att.length ? att : fut;
  if (vive.length === 1) {
    var m = vive[0];
    return '<div class="mis">' + testa + '<div class="md">' + esc(sintesi(m)) + '</div>' +
      '<div class="mm">' + metaDi(m).map(function (x) { return '<span>' + esc(x) + '</span>'; }).join('') + '</div>' +
      '<div class="corpo">' + htmlCond(m) + inArrivo + htmlPiu(g.rows) + '</div></div>';
  }
  var perc = [];
  vive.forEach(function (m) { percentuali(m).forEach(function (v) { perc.push(v); }); });
  var lo = Math.min.apply(null, perc), hi = Math.max.apply(null, perc);
  var range = perc.length ? (lo === hi ? nIt(lo, 0, 3) + ' %' : 'da ' + nIt(lo, 0, 3) + ' a ' + nIt(hi, 0, 3) + ' %') : '';
  var cert = [];
  vive.forEach(function (m) { certDi(m).forEach(function (c) { if (cert.indexOf(c) < 0) cert.push(c); }); });
  var docs = cert.length ? '<div class="cond"><p class="ct">Documenti citati nelle condizioni</p><ul class="docs">' + cert.slice(0, 12).map(function (c) {
    return '<li><span class="cc">' + esc(c) + '</span><span>' + esc(RIF.cert[c] || 'Documento ' + c) + '</span></li>';
  }).join('') + '</ul></div>' : '';
  return '<div class="mis">' + testa + '<div class="md">' + esc(range) + '</div>' +
    '<div class="mm"><span>' + esc((state.flow === 'export' ? 'destinazione: ' : 'origine: ') + nomeArea(g.o)) + '</span><span>' + vive.length + ' righe' + (att.length ? '' : ' in arrivo') + ', distinte per codice addizionale, contingente o periodo</span></div>' +
    '<div class="corpo">' + elencoRighe(vive, idx) + inArrivo + docs + htmlPiu(g.rows) + '</div></div>';
}
function raggruppa(list) {
  var map = {}, ord = [];
  list.forEach(function (m) {
    var k = m.t + '|' + m.o;
    if (!map[k]) { map[k] = { t: m.t, o: m.o, rel: m.rel, rows: [] }; ord.push(map[k]); }
    map[k].rows.push(m);
  });
  ord.sort(function (a, b) {
    var ca = CAT_DI[a.t], cb = CAT_DI[b.t];
    return ((ca ? ca.ord : a.t) - (cb ? cb.ord : b.t)) || (b.rel - a.rel) || String(a.o).localeCompare(String(b.o));
  });
  return ord;
}
function elencoPaesi() {
  return (RIF.gruppi['1008'] || '').split(' ').filter(Boolean).map(function (c) { return [RIF.aree[c] || c, c]; })
    .sort(function (a, b) { return a[0].localeCompare(b[0], 'it'); });
}
function boxMisure(sel) {
  var i = sel.idx, code = sel.code, c = state.country, exp = state.flow === 'export';
  var paesi = elencoPaesi(), freq = FREQUENTI.filter(function (x) { return RIF.aree[x]; });
  var opt = '<option value="">Tutti i paesi</option><optgroup label="Più frequenti">' +
    freq.map(function (x) { return '<option value="' + x + '"' + (x === c ? ' selected' : '') + '>' + esc(RIF.aree[x]) + ' (' + x + ')</option>'; }).join('') +
    '</optgroup><optgroup label="Tutti">' +
    paesi.map(function (p) { return '<option value="' + p[1] + '"' + (p[1] === c && freq.indexOf(c) < 0 ? ' selected' : '') + '>' + esc(p[0]) + ' (' + p[1] + ')</option>'; }).join('') + '</optgroup>';
  var dichiarabile = i >= 0 && isLeaf(i);
  var iso = c === 'XS' ? 'RS' : c;
  var uTaric = 'https://ec.europa.eu/taxation_customs/dds2/taric/measures.jsp?Lang=it&SimDate=' + oggi() + '&Area=' + c + '&MeasType=&StartPub=&EndPub=&MeasText=&GoodsText=&op=&Taric=' + code + '&search_text=goods&textSearch=&LangDescr=it&OrderNum=&Regulation=&measStartDat=&measEndDat=';
  var uA2M = c ? 'https://trade.ec.europa.eu/access-to-markets/it/results?product=' + code + (exp ? '&origin=IT&destination=' + iso : '&origin=' + iso + '&destination=IT') : '';
  var links = dichiarabile ? '<div class="fila"><span class="et">Verifica sulla fonte</span>' +
    '<a class="btn sm" href="' + esc(uTaric) + '" target="_blank" rel="noopener">TARIC UE</a>' +
    (uA2M ? '<a class="btn sm" href="' + esc(uA2M) + '" target="_blank" rel="noopener">Access2Markets</a>' : '') +
    '<a class="btn sm" href="https://aidaonline7.adm.gov.it/nsitaricinternet/" target="_blank" rel="noopener">AIDA per IVA e accise</a></div>' : '';

  var h47 = '', h44 = '', n44 = 0;
  var st = i >= 0 ? chiediCapitolo(code.slice(0, 2)) : 'nessuno';
  if (st === 'nessuno') h47 = h44 = '<p class="nota">Il codice non è nella nomenclatura: nessuna misura da mostrare.</p>';
  else if (st === 'attesa') h47 = h44 = '<p class="nota">Carico le misure del capitolo ' + esc(code.slice(0, 2)) + '…</p>';
  else if (st === 'errore') h47 = h44 = '<p class="errore">Non riesco a caricare le misure del capitolo ' + esc(code.slice(0, 2)) + '. Ricarica la pagina.</p>';
  else {
    var res = misure(i, state.flow, c), cat = {}, gid = 0;
    res.righe.forEach(function (m) { var k = catDi(m.t); (cat[k] = cat[k] || []).push(m); });
    /* summary */
    if (!exp) {
      var base = (cat.base || []).filter(function (m) { return m.t === 103 && !m.fut; });
      var pref = (cat.rid || []).filter(function (m) { return [142, 145, 141, 106].indexOf(m.t) >= 0 && !m.fut && m.rel > 0; });
      var extra = (cat.dif || []).filter(function (m) { return DAZI_EXTRA.indexOf(m.t) >= 0 && !m.fut; });
      var t1 = base.length === 1 ? (sintesi(base[0]) || 'vedi sotto') : (base.length ? 'vedi sotto' : 'non indicato');
      pref.sort(function (x, y) { var px = percentuali(x), py = percentuali(y); return (px.length ? px[0] : 1e9) - (py.length ? py[0] : 1e9); });
      var t2 = !c ? 'scegli un paese' : (pref.length ? (sintesi(pref[0]) || 'vedi sotto') : 'nessuna');
      var t3 = !c ? 'scegli un paese' : (extra.some(sempreDovuto) ? 'sì, vedi sotto' : (extra.length ? 'solo in casi particolari' : 'nessuno'));
      h47 += '<div class="riep">' +
        '<div class="tile"><span class="tv">' + esc(t1) + '</span><span class="tk">Dazio paesi terzi</span></div>' +
        '<div class="tile"><span class="tv">' + esc(t2) + '</span><span class="tk">Preferenza' + (c && pref.length ? ' ' + esc(nomeArea(pref[0].o)) : '') + '</span></div>' +
        '<div class="tile"><span class="tv">' + esc(t3) + '</span><span class="tk">Antidumping e dazi addizionali</span></div></div>';
    }
    CATEGORIE.forEach(function (K) {
      var list = cat[K.id];
      if (!list || !list.length) return;
      h47 += '<div class="cat"><h3>' + esc(K.nome) + '</h3>' +
        (K.id === 'alt' ? '<p class="nota">Riguardano le vendite a distanza a clienti nell\'Unione; il dazio da 3 EUR solo le spedizioni fino a 150 EUR. Non toccano le altre importazioni.</p>' : '') +
        raggruppa(list).map(function (g) { return htmlGruppo(g, gid++); }).join('') + '</div>';
    });
    if (res.righe.some(function (m) { return m.ord && catDi(m.t) !== 'ctl'; })) h47 += '<p class="nota">I contingenti valgono fino a esaurimento: il saldo residuo non è compreso in questi dati.</p>';
    if (exp && !h47) h47 = '<p class="nota">Il TARIC non prevede dazi all\'esportazione per questo codice' + (c ? ' verso ' + esc(nomeArea(c)) : '') + '.</p>';
    if (!exp && !(cat.base || []).length && !(cat.rid || []).length) h47 += '<p class="nota">Nessun dazio definito a questo livello della nomenclatura.</p>';
    var ctl = raggruppa(cat.ctl || []);
    n44 = ctl.length;
    h44 = ctl.length ? '<div class="cat">' + ctl.map(function (g) { return htmlGruppo(g, gid++); }).join('') + '</div>'
      : '<p class="nota">Nessun divieto, restrizione o controllo TARIC ' + (c ? 'per ' + esc(nomeArea(c)) : 'valido per tutti i paesi') + ' su questo codice.</p>';
    var avvisi = '';
    if (!dichiarabile) avvisi += '<p class="avviso">Vedi solo le misure definite a questo livello e ai livelli superiori. Per il quadro completo scegli un codice dichiarabile.</p>';
    if (!c && res.altri) avvisi += '<p class="avviso">Altre ' + res.altri + ' misure valgono solo per singoli paesi o gruppi di paesi: scegli il paese nella casella 34.</p>';
    h47 = avvisi + h47;
  }
  return '<div class="foglio" style="margin-top:18px">' +
    '<div class="box s4"><div class="lab"><b>34</b> ' + (exp ? 'Paese di destinazione' : 'Paese d\'origine') + '</div>' +
    '<select class="campo" id="paese" aria-label="Paese">' + opt + '</select>' +
    '<div class="fila"><button class="chip" type="button" data-act="flusso" data-f="import" aria-pressed="' + (!exp) + '">Importazione</button>' +
    '<button class="chip" type="button" data-act="flusso" data-f="export" aria-pressed="' + exp + '">Esportazione</button></div></div>' +
    '<div class="box s8"><div class="lab">' + T.icona('percento') + 'Misure TARIC al ' + dataIt(oggiNum()) + '</div>' + links + '</div>' +
    '<div class="box"><div class="lab"><b>47</b> Calcolo delle imposizioni <span class="dx">' + (exp ? 'esportazione' : 'dazi all\'importazione') + '</span></div>' + h47 + '</div>' +
    '<div class="box"><div class="lab"><b>44</b> Documenti presentati, certificati e autorizzazioni <span class="dx">' + (n44 ? n44 + (n44 === 1 ? ' misura' : ' misure') + ' di controllo' : 'divieti, restrizioni e controlli') + '</span></div>' + h44 + '</div>' +
    '</div>';
}

/* ================================================================
   Rendering
   ================================================================ */
function renderStato() {
  var el = $('#stato'), b = state.busy;
  $('#vai').disabled = !!b; $('#ferma').hidden = !b;
  $('#avanza').hidden = !b;
  if (!b) { el.innerHTML = ''; return; }
  var s = Math.round((Date.now() - b.t0) / 1000);
  el.innerHTML = T.icona('attesa') + '<span>' + esc(b.note) + '… ' + s + ' s</span>';
}
function renderMsg() {
  var h = '';
  if (state.error) h += '<p class="errore">' + esc(state.error) + '</p>';
  var ia = state.utente && state.utente.ia;
  if (state.ai === 'no' && !state.error && state.aiMotivo) h += '<p class="avviso">' + esc(state.aiMotivo) + '</p>';
  if (state.ai === 'ok' && ia && ia.limite && ia.usate >= ia.limite * 0.8) h += '<p class="nota">Classificazioni con l\'IA questo mese: ' + ia.usate + ' su ' + ia.limite + '.</p>';
  $('#msg').innerHTML = h;
}
function renderFornite() {
  var el = $('#fornite');
  if (!state.answers.length) { el.hidden = true; el.innerHTML = ''; return; }
  el.hidden = false;
  el.innerHTML = '<span class="et">Dettagli forniti</span>' + state.answers.map(function (a, k) {
    return '<button class="chip" type="button" data-act="togli" data-k="' + k + '" title="Togli questo dettaglio">' + esc(a.a) + ' ×</button>';
  }).join('');
}
function celle(sel) {
  var i = sel.idx, c = sel.code, nc, ta, manca = false;
  if (i >= 0 && !isLeaf(i)) {
    var a = i; while (a >= 0 && FLAG[a] === 'g') a = PARENT[a];
    var sig = a >= 0 ? CODE[a].slice(0, HP[a]) : '';
    nc = grp((sig + '········').slice(0, 8)); ta = sig.length >= 10 ? sig.slice(8, 10) : '··'; manca = true;
  } else { nc = grp(c.slice(0, 8)); ta = c.slice(8, 10); }
  var k = 0;
  function typed(s) { return s.split('').map(function (ch) { return ch === ' ' ? '<span class="sp"> </span>' : '<i style="--i:' + (k++) + '">' + esc(ch) + '</i>'; }).join(''); }
  return '<div class="c33">' +
    '<div class="cel' + (manca ? ' manca' : '') + '"><span class="v">' + typed(nc) + '</span><span class="k">Nomenclatura combinata</span></div>' +
    '<div class="cel' + (manca ? ' manca' : '') + '"><span class="v">' + typed(ta) + '</span><span class="k">TARIC</span></div>' +
    '</div>';
}
function ruolo(sel) {
  var r = state.result;
  if (!r) return { nome: 'Scelta manuale', cand: null };
  if (r.best && r.best.code === sel.code) return { nome: 'Proposta', cand: r.best, best: true };
  for (var k = 0; k < r.alts.length; k++) if (r.alts[k].code === sel.code) return { nome: 'Alternativa', cand: r.alts[k] };
  return { nome: 'Scelta manuale', cand: null };
}
function rigaPerc(j, fine) {
  var dash = '', d = LVL[j] - 1; for (var k = 0; k < d; k++) dash += '– ';
  var t = state.trad[j];
  return '<div class="riga' + (fine ? ' fine' : '') + '"><span class="cod">' + esc(showCode(j)) + '</span>' +
    '<span class="txt"><span class="tr">' + dash + '</span>' + esc(descOf(j)) + tagEN(j) + '</span>' +
    (t ? '<span class="trad">' + esc(t) + '</span>' : '') + '</div>';
}
function renderEsito() {
  var el = $('#esito'), sel = state.sel, r = state.result;
  if (!sel) { el.innerHTML = ''; return; }
  var i = sel.idx, role = ruolo(sel), cand = role.cand, h = '';
  /* l'arrivo del risultato si anima una volta; se nel frattempo la scheda si ridisegna (per esempio arrivano
     le misure del capitolo) l'animazione riprende dal punto in cui era, grazie al ritardo negativo --t */
  if (state.anima) { state.animaT0 = Date.now(); state.anima = false; }
  var trascorso = state.animaT0 ? Date.now() - state.animaT0 : Infinity;

  /* --- box 33 --- */
  h += '<div class="foglio' + (trascorso < 1800 ? ' anima" style="--t:-' + trascorso + 'ms' : '') + '">';
  h += '<div class="box s8 principale"><div class="lab"><b>33</b> Codice delle merci' +
    (r && r.merce ? '<span class="dx">' + esc(r.merce) + '</span>' : '') + '</div>';
  h += '<div class="testa33">' + celle(sel) +
    '<div class="timbro">' + T.icona(role.best ? 'timbro' : role.nome === 'Alternativa' ? 'domanda' : 'matita') + '<span>' + esc(role.nome) + (cand ? '<small>confidenza ' + confLabel(cand.conf) + '</small>' : '') + '</span></div></div>';
  if (i < 0) h += '<p class="errore">Il codice ' + esc(grp(sel.code)) + ' non esiste nella nomenclatura incorporata (situazione al ' + DATA_IT + '). Può essere stato introdotto dopo quella data oppure essere sbagliato: verificalo su AIDA.</p>';
  else if (!isLeaf(i)) h += '<p class="avviso">Questa voce non è dichiarabile così: scegli una delle sottovoci qui sotto.</p>';
  if (cand && cand.it) h += '<p class="cosa">' + esc(cand.it) + '</p>';
  if (cand && cand.why) h += '<p class="perche"><b>Perché.</b> ' + esc(cand.why) + '</p>';
  if (cand && !role.best && cand.when) h += '<p class="perche"><b>Quando.</b> ' + esc(cand.when) + '</p>';
  h += '<div class="fila"><button class="btn sm" type="button" data-act="copia" data-c="' + esc(sel.code) + '">' + T.icona('copia') + 'Copia codice</button>' +
    (i >= 0 ? '<button class="btn sm" type="button" data-act="apri" data-i="' + i + '">' + T.icona('libro') + 'Vedi nella nomenclatura</button>' : '') +
    (i >= 0 && isLeaf(i) ? '<button class="btn sm" type="button" data-act="preferito" data-c="' + esc(sel.code) + '" aria-pressed="' + (state.preferiti[sel.code] ? 'true' : 'false') + '">' + T.icona('stella') + (state.preferiti[sel.code] ? 'Nei preferiti' : 'Aggiungi ai preferiti') + '</button>' : '') + '</div>';
  var fineCod = (D.fine && D.fine[sel.code]) || 0;
  if (i >= 0 && fineCod) h += '<p class="avviso">' + (fineCod < oggiNum() ? 'Questo codice ha cessato di valere il ' : 'Questo codice cessa di valere il ') + dataIt(fineCod) + '.</p>';
  h += '</div>';

  /* --- box 41 --- */
  var capSt = i >= 0 ? chiediCapitolo(sel.code.slice(0, 2)) : 'nessuno';
  var uc = (capSt === 'ok' && i >= 0) ? unitaSupplementare(i) : undefined;
  h += '<div class="box s4"><div class="lab"><b>41</b> Unità supplementari</div>';
  if (i < 0 || !isLeaf(i)) h += '<p class="nota">Disponibile per i codici dichiarabili.</p>';
  else if (capSt === 'attesa') h += '<p class="nota">Carico…</p>';
  else if (capSt !== 'ok') h += '<p class="nota">Non disponibile.</p>';
  else if (!uc) h += '<p class="cosa">Nessuna</p><p class="nota">Si dichiara solo la massa netta.</p>';
  else { var us = UNITA_SUP[uc.trim()] || uc.trim(); h += '<p class="cosa">' + esc(us) + '</p><p class="nota">' + esc(UNITA_IT[us] || '') + '</p>'; }
  h += '<div class="lab" style="margin-top:6px">Stato del codice</div>';
  h += i < 0 ? '<p class="nota">Non trovato.</p>' : isLeaf(i) ? '<p class="nota">Dichiarabile.</p>' : '<p class="nota">Voce intermedia con ' + kids(i).length + ' sottovoci.</p>';
  h += '</div>';

  /* --- path --- */
  if (i >= 0) {
    var p = pathOf(i);
    var inEN = p.filter(function (j) { return INGL[j]; });
    var daTradurre = inEN.some(function (j) { return !state.trad[j]; });
    h += '<div class="box"><div class="lab">' + T.icona('albero') + 'Percorso nella nomenclatura' + (inEN.length ? ' <span class="dx">le righe EN non hanno ancora il testo italiano</span>' : '') + '</div><div class="perc">' +
      p.map(function (j, k) { return rigaPerc(j, k === p.length - 1); }).join('') + '</div>';
    if (state.warn) h += '<p class="avviso">' + esc(state.warn) + '</p>';
    if (sampleFn && daTradurre) h += '<div class="fila"><button class="btn sm" type="button" data-act="traduci"' + (state.tradBusy ? ' disabled' : '') + '>' + T.icona('globo') + (state.tradBusy ? 'Traduco…' : 'Traduci le righe in inglese') + '</button><span class="nota">Traduzione automatica, non ufficiale.</span></div>';
    if (!isLeaf(i)) {
      h += '<div class="lab" style="margin-top:6px">Sottovoci</div><div class="lista">' + kids(i).map(function (j) {
        return '<button class="alt" type="button" data-act="scegli" data-i="' + j + '"><span class="cod">' + esc(showCode(j)) + '</span><span class="it txt">' + esc(DESC[j]) + tagEN(j) + '</span><span class="pill ' + (isLeaf(j) ? 'alta' : 'bassa') + '">' + (isLeaf(j) ? 'dichiarabile' : (FLAG[j] === 'g' ? 'gruppo' : 'voce')) + '</span></button>';
      }).join('') + '</div>';
    }
    h += '</div>';
  }

  /* --- alternatives and questions --- */
  if (r) {
    var tutte = [r.best].concat(r.alts);
    h += '<div class="box s7"><div class="lab">' + T.icona('regole') + 'Voci a confronto</div><div class="lista">' + tutte.map(function (a, k) {
      var ai = byCode.has(a.code) ? byCode.get(a.code) : -1;
      return '<button class="alt" type="button" data-act="alt" data-c="' + esc(a.code) + '" aria-pressed="' + (a.code === sel.code) + '">' +
        '<span class="cod">' + esc(grp(a.code)) + '</span><span class="it">' + esc(a.it || (ai >= 0 ? DESC[ai] : '')) + '</span>' +
        '<span class="pill ' + (k === 0 ? 'prop' : confLabel(a.conf)) + '">' + (k === 0 ? 'proposta' : confLabel(a.conf)) + '</span>' +
        (k > 0 && a.when ? '<span class="quando">' + esc(a.when) + '</span>' : '') +
        (ai < 0 ? '<span class="quando" style="color:var(--rosso)">Codice non presente nella nomenclatura incorporata.</span>' : '') + '</button>';
    }).join('') + '</div></div>';

    h += '<div class="box s5"><div class="lab">' + T.icona('domanda') + 'Domande per affinare</div>';
    if (r.domande.length) {
      h += r.domande.map(function (d, k) {
        return '<div class="dom"><p class="q">' + esc(d.q) + '</p><div class="fila">' + d.opts.map(function (o, n) {
          return '<button class="chip" type="button" data-act="pick" data-k="' + k + '" data-n="' + n + '" aria-pressed="' + (state.picks[k] === n) + '">' + esc(o) + '</button>';
        }).join('') + '</div>' + (d.why ? '<p class="nota">' + esc(d.why) + '</p>' : '') + '</div>';
      }).join('');
    } else h += '<p class="nota">Con le informazioni date non servono altre domande.</p>';
    if (state.qmsg) h += '<p class="avviso">' + esc(state.qmsg) + '</p>';
    h += '<div class="fila"><input class="campo" id="extra" type="text" autocomplete="off" placeholder="Altro dettaglio utile (facoltativo)" value="' + esc(state.extra) + '">' +
      '<button class="btn" type="button" data-act="riclassifica"' + (sampleFn ? '' : ' disabled') + '>' + T.icona('aggiorna') + 'Riclassifica</button></div>';
    h += '</div>';
  }
  h += '</div>';

  h += boxMisure(sel);
  el.innerHTML = h;
}

/* ---------- nomenclature browser ---------- */
var LOW = null;
/* search form of a text: lower case, no accents, words separated by single spaces, a space at both ends */
function piano(s) { return ' ' + s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim() + ' '; }
function cerca(q) {
  var out = [], d = digits(q);
  if (/^[\d\s.]+$/.test(q) && d.length >= 2) {
    for (var i = 0; i < N && out.length < 150; i++) if (FLAG[i] !== 'g' && CODE[i].indexOf(d) === 0 && (HP[i] >= d.length || isLeaf(i))) out.push(i);
    return out;
  }
  if (!LOW) { LOW = new Array(N); for (var k = 0; k < N; k++) LOW[k] = piano(DESC[k]); }
  var toks = piano(q).trim().split(' ').filter(function (t) { return t.length > 1; });
  if (!toks.length) return out;
  // singular and plural share a stem: for longer words the final vowel is dropped ("bicicletta" also finds "biciclette",
  // "orologio" finds "orologi", "fungo" finds "funghi")
  var rad = toks.map(function (t) { return (t.length >= 4 && /^[a-z]+$/.test(t)) ? t.replace(/[aeio]$/, '') : t; });
  var forma = rad.map(function (r) { return new RegExp(' ' + r + '(?:[aeio]|io|h[ei])? '); });
  var hits = [];
  for (var j = 0; j < N; j++) {
    var t = LOW[j], ok = true, sc = 0;
    for (var m = 0; m < toks.length; m++) {
      var pos = t.indexOf(' ' + toks[m] + ' '), mm;                                  // the word itself
      if (pos < 0) {
        if ((pos = t.indexOf(' ' + toks[m])) >= 0) sc += 1;                           // beginning of a word
        else if ((mm = forma[m].exec(t))) { pos = mm.index; sc += 1; }                // same word, other ending
        else if ((pos = t.indexOf(' ' + rad[m])) >= 0) sc += 3;                       // same stem, longer word
        else if ((pos = t.indexOf(rad[m])) >= 0) sc += 5;                             // inside a word
        else { ok = false; break; }
      }
      if (pos > 0) sc += 2;
    }
    if (ok) hits.push([sc + HP[j] / 2 + Math.min(t.length, 200) / 40, j]);
  }
  hits.sort(function (a, b) { return a[0] - b[0] || a[1] - b[1]; });
  return hits.slice(0, 150).map(function (x) { return x[1]; });
}
function trow(i, depth, ctx) {
  var leaf = isLeaf(i), hasKids = END[i] > i + 1, open = !!state.open[i];
  var act = leaf ? 'usa' : (ctx ? 'apri' : (hasKids ? 'toggle' : ''));
  return '<div class="trow ' + FLAG[i] + (state.flash === i ? ' acceso' : '') + '" style="--d:' + depth + '" data-act="' + act + '" data-i="' + i + '" id="r' + i + '">' +
    '<span class="car">' + (hasKids && !ctx ? (open ? '▾' : '▸') : '') + '</span>' +
    '<span class="cod">' + esc(showCode(i)) + '</span>' +
    '<span class="txt">' + esc(descOf(i)) + tagEN(i) + '</span>' +
    (leaf ? '<button class="btn sm" type="button" data-act="usa" data-i="' + i + '">Usa</button>' : (ctx ? '<button class="btn sm" type="button" data-act="apri" data-i="' + i + '">Apri</button>' : '<span></span>')) +
    (ctx ? '<span class="ctx">' + esc(ctx) + '</span>' : '') + '</div>';
}
function renderNom() {
  var el = $('#albero'), q = state.nq.trim(), out = [];
  if (q) {
    var res = cerca(q), testuale = !/^[\d\s.]+$/.test(q);
    var ponte = (testuale && sampleFn) ? '<button class="btn sm" type="button" data-act="chiedi">Classifica con l\'IA</button>' : '';
    if (!res.length) out.push('<div class="trow info" style="--d:0"><span class="txt nota">Nessun risultato. ' +
      (testuale ? 'La nomenclatura usa termini suoi (per esempio «foratrici» per i trapani): prova un\'altra parola' + (ponte ? ' oppure fai classificare la merce all\'IA.' : ' oppure descrivi la merce nella scheda Classifica.') : 'Controlla le cifre del codice.') + '</span>' + ponte + '</div>');
    res.forEach(function (i) {
      var p = pathOf(i), ctx = p.length > 1 ? p.slice(0, -1).filter(function (j) { return LVL[j] <= 1; }).map(function (j) { return showCode(j) + ' ' + descOf(j); }).join(' › ') : '';
      out.push(trow(i, 0, ctx || ' '));
    });
    if (res.length === 150) out.push('<div class="trow info" style="--d:0"><span class="txt nota">Mostro i primi 150 risultati: aggiungi una parola o qualche cifra.</span></div>');
    else if (res.length && ponte) out.push('<div class="trow info" style="--d:0"><span class="txt nota">Non trovi la voce? La nomenclatura usa termini suoi: puoi far classificare «' + esc(q) + '» all\'IA.</span>' + ponte + '</div>');
  } else {
    SEZIONI.forEach(function (s, k) {
      var open = !!state.secOpen[k];
      out.push('<button class="sez" type="button" data-act="sez" data-k="' + k + '" aria-expanded="' + open + '"><span class="car">' + (open ? '▾' : '▸') + '</span><span class="num">' + s[0] + '</span><span>' + esc(s[1]) + ' <span class="tr">· capitoli ' + (s[2] === s[3] ? s[2] : s[2] + '–' + s[3]) + '</span></span></button>');
      if (!open) return;
      for (var c = s[2]; c <= s[3]; c++) { var ci = byCode.get(('0' + c).slice(-2) + '00000000'); if (ci !== undefined) node(ci, 0); }
    });
  }
  function node(i, depth) { out.push(trow(i, depth, '')); if (state.open[i]) kids(i).forEach(function (j) { node(j, depth + 1); }); }
  el.innerHTML = out.join('');
  if (state.flash >= 0) { var r = document.getElementById('r' + state.flash); if (r && r.scrollIntoView) r.scrollIntoView({ block: 'center' }); state.flash = -1; }
}
function apriNellAlbero(i) {
  var p = pathOf(i);
  p.forEach(function (j) { if (j !== i || END[i] > i + 1) state.open[j] = true; });
  var cap = parseInt(CODE[p[0]].slice(0, 2), 10);
  SEZIONI.forEach(function (s, k) { if (cap >= s[2] && cap <= s[3]) state.secOpen[k] = true; });
  state.nq = ''; $('#nq').value = ''; state.flash = i;
  vista('nomenclatura');
}

/* ---------- views ---------- */
var VISTE = ['classifica', 'nomenclatura', 'profilo', 'gestione'];
function vista(v) {
  if (VISTE.indexOf(v) < 0 || (v === 'gestione' && !(state.utente && state.utente.ruolo === 'amministratore'))) v = 'classifica';
  state.view = v;
  VISTE.forEach(function (n) {
    var sez = $('#view-' + n), prima = sez.hidden;
    sez.hidden = n !== v;
    if (n === v && prima && state.avviato) { sez.classList.remove('entra'); void sez.offsetWidth; sez.classList.add('entra'); }
    var a = $('#tab-' + n); if (n === v) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
  try { var cur = location.hash.replace('#', ''); if (cur !== v && (cur || v !== 'classifica')) location.hash = v; } catch (e) { /* hash non scrivibile */ }
  if (v === 'nomenclatura') renderNom();
  var m = T.viste && T.viste[v];
  if (m && m.mostra) m.mostra();
}
function renderAll() { renderStato(); renderMsg(); renderFornite(); renderEsito(); if (state.view === 'nomenclatura') renderNom(); }

/* ================================================================
   Events
   ================================================================ */
document.addEventListener('click', function (ev) {
  var t = ev.target.closest('[data-act]'); if (!t) return;
  var act = t.getAttribute('data-act'), i = parseInt(t.getAttribute('data-i'), 10);
  if (!act) return;
  if ((act === 'togli' || act === 'riclassifica' || act === 'chiedi') && state.busy) return;
  else if (act === 'togli') { state.answers.splice(parseInt(t.getAttribute('data-k'), 10), 1); renderFornite(); classifica(true); }
  else if (act === 'copia') {
    var c = t.getAttribute('data-c'), done = function (ok) { t.textContent = ok ? 'Copiato' : c; setTimeout(function () { t.textContent = 'Copia codice'; }, 1600); };
    try { navigator.clipboard.writeText(c).then(function () { done(true); }, function () { done(false); }); } catch (e) { done(false); }
  }
  else if (act === 'alt') { var cc = t.getAttribute('data-c'); state.sel = { code: cc, idx: byCode.has(cc) ? byCode.get(cc) : -1 }; state.warn = ''; renderEsito(); }
  else if (act === 'scegli') { state.sel = { code: CODE[i], idx: i }; state.warn = ''; renderEsito(); }
  else if (act === 'pick') { var k = t.getAttribute('data-k'), n = parseInt(t.getAttribute('data-n'), 10); var ex = $('#extra'); if (ex) state.extra = ex.value; if (state.picks[k] === n) delete state.picks[k]; else state.picks[k] = n; state.qmsg = ''; renderEsito(); }
  else if (act === 'riclassifica') {
    var e2 = $('#extra'); state.extra = e2 ? e2.value.trim() : '';
    var add = [];
    (state.result ? state.result.domande : []).forEach(function (d, k2) { if (state.picks[k2] !== undefined) add.push({ q: d.q, a: d.opts[state.picks[k2]] }); });
    if (state.extra) add.push({ q: 'Dettaglio aggiunto', a: state.extra.slice(0, 400) });
    if (!add.length) { state.qmsg = 'Scegli almeno una risposta o scrivi un dettaglio.'; renderEsito(); return; }
    state.qmsg = ''; state.answers = state.answers.concat(add); renderFornite(); classifica(true);
  }
  else if (act === 'traduci') traduci();
  else if (act === 'preferito') {
    var pc = t.getAttribute('data-c'), cera = state.preferiti[pc];
    if (cera) delete state.preferiti[pc]; else state.preferiti[pc] = { nota: '' };
    renderEsito();
    (cera ? T.api('DELETE', '/api/preferiti/' + pc) : T.api('PUT', '/api/preferiti/' + pc, { nota: '' })).then(function () {
      T.avviso(cera ? 'Tolto dai preferiti.' : 'Aggiunto ai preferiti: trovi la nota e l\'elenco nel Profilo.');
      if (T.viste && T.viste.profilo) T.viste.profilo.daRicaricare = true;
    }, function (e) {
      if (cera) state.preferiti[pc] = cera; else delete state.preferiti[pc];
      renderEsito(); T.avviso(e.errore || 'Operazione non riuscita.', 'male');
    });
  }
  else if (act === 'chiedi') { var tq = state.nq.trim(); if (tq) { vista('classifica'); $('#q').value = tq; classifica(false); } }
  else if (act === 'flusso') { state.flow = t.getAttribute('data-f'); renderEsito(); salvaPreferenze(); }
  else if (act === 'sez') { var s = t.getAttribute('data-k'); state.secOpen[s] = !state.secOpen[s]; renderNom(); }
  else if (act === 'toggle') { state.open[i] = !state.open[i]; renderNom(); }
  else if (act === 'usa') { ev.stopPropagation(); state.sel = { code: CODE[i], idx: i }; state.result = null; state.answers = []; state.heads = []; state.trad = {}; state.anima = true; vista('classifica'); renderAll(); var es = $('#esito'); if (es.scrollIntoView) es.scrollIntoView({ block: 'start' }); }
  else if (act === 'apri') { ev.stopPropagation(); apriNellAlbero(i); }
});
document.addEventListener('change', function (ev) { if (ev.target && ev.target.id === 'paese') { state.country = ev.target.value; renderEsito(); salvaPreferenze(); } });
document.addEventListener('input', function (ev) {
  var t = ev.target;
  if (!t || !t.classList || !t.classList.contains('filtro')) return;
  var q = t.value.trim().toLowerCase(), box = t.parentNode.querySelector('.righe');
  if (!box) return;
  Array.prototype.forEach.call(box.children, function (r) { r.hidden = !!q && (r.getAttribute('data-t') || '').indexOf(q) < 0; });
});
$('#vai').addEventListener('click', function () { classifica(false); });
$('#ferma').addEventListener('click', ferma);
$('#q').addEventListener('keydown', function (ev) { if (ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); classifica(false); } });
document.addEventListener('keydown', function (ev) {
  if (ev.key === 'Enter' && ev.target && ev.target.id === 'extra') { ev.preventDefault(); var b = document.querySelector('[data-act="riclassifica"]'); if (b) b.click(); }
});
var nqT = null;
$('#nq').addEventListener('input', function (ev) { state.nq = ev.target.value; clearTimeout(nqT); nqT = setTimeout(renderNom, 140); });
$('#nq-x').addEventListener('click', function () { state.nq = ''; $('#nq').value = ''; renderNom(); });
window.addEventListener('hashchange', function () { var v = location.hash.replace('#', '') || 'classifica'; if (v !== state.view) vista(v); });

/* ================================================================
   Boot
   ================================================================ */
function ripristina(d) {
  $('#q').value = str(d.q, 2000); state.q = $('#q').value;
  state.answers = Array.isArray(d.answers) ? d.answers : [];
  state.heads = Array.isArray(d.heads) ? d.heads : [];
  state.result = (d.result && typeof d.result === 'object') ? d.result : null;
  state.picks = {}; state.trad = {}; state.error = ''; state.warn = ''; state.extra = '';
  var c = state.result && state.result.best ? digits(state.result.best.code) : digits(d.sel);
  state.sel = c ? { code: c, idx: byCode.has(c) ? byCode.get(c) : -1 } : null;
  state.anima = true;
}
function start() {
  var m = D.meta, txt = 'Dati TARIC al ' + DATA_IT;
  // the extraction of each month is expected within the first days: after the 9th, older data is flagged
  var ora = new Date(), att = ora.getDate() < 10 ? new Date(ora.getFullYear(), ora.getMonth() - 1, 1) : ora;
  var atteso = att.getFullYear() + '-' + ('0' + (att.getMonth() + 1)).slice(-2);
  if (DATA_ISO && DATA_ISO.slice(0, 7) < atteso) { txt += ' · manca l\'aggiornamento di questo mese'; $('#dato').classList.add('tardi'); }
  $('#dato').innerHTML = T.icona('calendario') + esc(txt);
  $('#fonte').textContent = 'Dati TARIC dell\'UE (DG TAXUD) al ' + DATA_IT + '.';
  if (!N) { state.error = 'Non riesco a caricare la nomenclatura. Ricarica la pagina.'; }
  if (state.country && !RIF.aree[state.country]) state.country = '';
  vista(location.hash.replace('#', '') || 'classifica');
  renderAll();
  state.avviato = true;
}
window.TARIC_DEBUG = { misure: misure, fmtDazio: fmtDazio, parseCond: parseCond, sintesi: sintesi, indice: function (c) { return byCode.get(c); }, stato: state, render: renderEsito };

/* funzioni usate dalle viste Profilo e Gestione */
T.app = {
  esiste: function (c) { return byCode.has(c); },
  descrizione: function (c) { var i = byCode.has(c) ? byCode.get(c) : -1; return i < 0 ? '' : descOf(i); },
  percorso: function (c) { var i = byCode.has(c) ? byCode.get(c) : -1; return i < 0 ? [] : pathOf(i).map(function (j) { return descOf(j); }); },
  paesi: elencoPaesi,
  dati: function () { return { iso: DATA_ISO, it: DATA_IT }; },
  utente: function () { return state.utente; },
  aggiornaIo: aggiornaIo,
  preferiti: state.preferiti,
  vista: vista,
  apriCodice: function (c) {
    state.sel = { code: c, idx: byCode.has(c) ? byCode.get(c) : -1 };
    state.result = null; state.answers = []; state.heads = []; state.trad = {}; state.anima = true;
    vista('classifica'); renderAll(); var e = $('#esito'); if (e.scrollIntoView) e.scrollIntoView({ block: 'start' });
  },
  apriClassificazione: function (d) {
    ripristina(d); vista('classifica'); renderAll(); renderFornite(); var e = $('#esito'); if (e.scrollIntoView) e.scrollIntoView({ block: 'start' });
  },
  preferenze: function (p) {
    state.country = p.paese || ''; state.flow = p.flusso === 'export' ? 'export' : 'import';
    T.tema(p.tema); renderEsito();
  }
};

/* tema scelto dal pulsante in alto: lo ricorda anche il profilo */
document.addEventListener('taric:tema', function (ev) {
  var u = state.utente;
  if (!u) return;
  u.preferenze.tema = ev.detail;
  T.api('PUT', '/api/io/preferenze', { paese: u.preferenze.paese || '', flusso: u.preferenze.flusso || 'import', tema: ev.detail }).catch(function () { /* resta solo su questo dispositivo */ });
});

/* esce dall'account */
$('#esci').addEventListener('click', function () {
  T.api('POST', '/api/esci', null, { resta: true }).then(vaiAllAccesso, vaiAllAccesso);
});
function vaiAllAccesso() { location.href = '/accedi'; }

/* si parte quando tutta la pagina è caricata (anche profilo.js e gestione.js) */
function avvia() {
  T.api('GET', '/api/io').then(function (u) {
    state.utente = u;
    $('#chi-nome').textContent = u.nome;
    $('#chi-iniziali').textContent = String(u.nome || '').trim().split(/\s+/).slice(0, 2).map(function (p) { return p.charAt(0); }).join('').toUpperCase();
    $('#chi-iniziali').parentNode.title = u.nome + (u.email ? ' · ' + u.email : '');
    $('#tab-gestione').hidden = u.ruolo !== 'amministratore';
    if (u.ruolo === 'amministratore' && T.segnaRichieste) T.segnaRichieste();      // puntino sulla scheda Gestione per le richieste da approvare
    T.tema(u.preferenze.tema);
    state.country = u.preferenze.paese || '';
    state.flow = u.preferenze.flusso === 'export' ? 'export' : 'import';
    impostaIA();
    return T.api('GET', '/api/preferiti').then(function (r) { r.voci.forEach(function (v) { state.preferiti[v.codice] = { nota: v.nota }; }); }, function () { /* niente preferiti */ });
  }).then(function () { start(); }, function () { /* sessione scaduta: comune.js torna alla pagina iniziale */ });
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', avvia); else avvia();
})();
