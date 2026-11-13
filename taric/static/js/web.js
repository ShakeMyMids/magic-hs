/* MAGIC HS - versione sito: quello che nel programma per Windows fa il server sul PC, qui lo fa il browser.
   Risponde alle stesse richieste di TARIC.api() (vedi taric/app.py): profilo, preferenze e preferiti restano nel
   browser (localStorage), lo storico in IndexedDB; l'intelligenza artificiale si chiama direttamente con la chiave
   della persona (js/ia.js). Carica anche i dati TARIC del mese scelto: config.js (scritto da strumenti/sito.py)
   elenca le versioni pubblicate sul sito. */
(function () {
  'use strict';
  var T = window.TARIC, IA = T.IA;
  var SITO = window.TARIC_SITO || { versioni: [] };
  var P = 'magic-hs.';                      // prefisso delle chiavi nel browser
  var RICHIESTE_PER_CLASSIFICAZIONE = 6, MASSIMO_STORICO = 500, MASSIMO_PREFERITI = 1000;
  T.web = true;

  if (window.top !== window.self) {         // mai dentro la cornice di un altro sito
    document.documentElement.style.display = 'none';
    try { window.top.location = window.self.location.href; } catch (e) { /* resta nascosto */ }
  }

  /* ------------------------------------------------------------------ archivio semplice (localStorage) */
  var memoria = {};
  function leggi(k, predefinito) {
    try { var v = localStorage.getItem(P + k); return v === null ? predefinito : JSON.parse(v); }
    catch (e) { return k in memoria ? memoria[k] : predefinito; }
  }
  function scrivi(k, v) {
    memoria[k] = v;
    try { localStorage.setItem(P + k, JSON.stringify(v)); } catch (e) { throw errore(507, 'Il browser non lascia salvare altro: libera spazio o esporta e svuota lo storico.', 'spazio'); }
  }
  function adesso() { return new Date().toISOString(); }
  function meseCorrente() { var d = new Date(); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2); }
  function errore(stato, testo, codice) { return { stato: stato, codice: codice || 'errore_' + stato, errore: testo }; }

  /* ------------------------------------------------------------------ dati TARIC: versione scelta o la più recente */
  var versioni = (SITO.versioni || []).map(function (v) { return v.versione; }).sort().reverse();
  function versioneInUso() { var v = leggi('versione', ''); return versioni.indexOf(v) >= 0 ? v : (versioni[0] || ''); }
  var DATI = versioneInUso();
  if (DATI && document.readyState === 'loading') {
    var base = 'dati/' + DATI + '/';
    document.documentElement.setAttribute('data-dati', base);
    // i dati servono ad app.js prima che parta: si caricano subito dopo questo script, nell'ordine della pagina
    document.write('<script src="' + base + 'nomenclatura.js"><\/script><script src="' + base + 'rif.js"><\/script>');
  }

  /* ------------------------------------------------------------------ storico (IndexedDB, con riserva in memoria) */
  var db = null, dbPronto = new Promise(function (ok) {
    try {
      var r = indexedDB.open('magic-hs', 1);
      r.onupgradeneeded = function () { r.result.createObjectStore('storico', { keyPath: 'id', autoIncrement: true }); };
      r.onsuccess = function () { db = r.result; ok(); };
      r.onerror = r.onblocked = function () { ok(); };
    } catch (e) { ok(); }
  });
  var storicoMem = [], idMem = 0;
  function operazione(modo, fare) {
    return dbPronto.then(function () {
      if (!db) return fare(null);
      return new Promise(function (ok, ko) {
        var tx = db.transaction('storico', modo), risultato;
        Promise.resolve(fare(tx.objectStore('storico'))).then(function (x) { risultato = x; }, ko);
        tx.oncomplete = function () { ok(risultato); };
        tx.onerror = tx.onabort = function () { ko(errore(500, 'Il browser non riesce a salvare lo storico.', 'archivio')); };
      });
    });
  }
  function richiesta(r) { return new Promise(function (ok, ko) { r.onsuccess = function () { ok(r.result); }; r.onerror = function () { ko(r.error); }; }); }
  function tuttoStorico() {          // dal più recente
    return operazione('readonly', function (s) {
      if (!s) return storicoMem.slice().reverse();
      return richiesta(s.getAll()).then(function (v) { return v.reverse(); });
    });
  }
  function aggiungiStorico(voce) {
    return operazione('readwrite', function (s) {
      if (!s) { voce.id = ++idMem; storicoMem.push(voce); storicoMem = storicoMem.slice(-MASSIMO_STORICO); return voce.id; }
      return richiesta(s.add(voce)).then(function (id) {
        return richiesta(s.getAllKeys()).then(function (k) {
          k.slice(0, Math.max(0, k.length - MASSIMO_STORICO)).forEach(function (x) { s.delete(x); });
          return id;
        });
      });
    });
  }

  /* ------------------------------------------------------------------ profilo */
  function profilo() { var p = leggi('profilo', {}); return { nome: p.nome || 'Utente', azienda: p.azienda || '' }; }
  function preferenze() {
    var p = leggi('preferenze', {});
    return { paese: p.paese || '', flusso: p.flusso === 'export' ? 'export' : 'import', tema: ['auto', 'chiaro', 'scuro'].indexOf(p.tema) >= 0 ? p.tema : 'auto' };
  }
  function iaSalvata() { return leggi('ia', {}); }
  function iaCfg() { return IA.configura(iaSalvata()); }
  function uso() { var u = leggi('uso', {}); return u.mese === meseCorrente() ? u : { mese: meseCorrente(), ops: {}, richieste: 0, token_in: 0, token_out: 0, token_cache: 0 }; }
  function classificazioni(u) { return Object.keys(u.ops).filter(function (k) { return u.ops[k].conta; }).length; }
  function infoVersione(v) { return (SITO.versioni || []).filter(function (x) { return x.versione === v; })[0] || null; }

  function io() {
    var p = profilo(), c = iaCfg();
    return { id: 1, nome: p.nome, azienda: p.azienda, ruolo: 'amministratore', preferenze: preferenze(),
             ia: { disponibile: c.disponibile, configurata: c.disponibile, nome: c.nome, limite: null, usate: classificazioni(uso()), mese: meseCorrente() },
             dati: { versione: DATI || null, aggiornamento: null }, programma: { versione: SITO.programma || '', pronta: '' } };
  }

  /* ------------------------------------------------------------------ IA */
  var servizio = new IA.Servizio(), inCorso = 0;
  var MESSAGGI = {
    not_configured: 'La classificazione assistita non è attiva: scegli un servizio di intelligenza artificiale in Impostazioni.',
    rate_limited: 'Troppe richieste in questo momento. Riprova tra un minuto.',
    limite_giornaliero: 'Il servizio di intelligenza artificiale ha raggiunto il suo limite di oggi (succede con i piani gratuiti). Riprova domani.',
    overloaded: 'Il servizio di intelligenza artificiale è sovraccarico. Riprova tra qualche minuto.',
    credito_esaurito: 'Il servizio di intelligenza artificiale richiede la fatturazione attiva o ha esaurito il credito: controlla nella console del servizio.',
    regione_non_supportata: 'Il servizio di intelligenza artificiale non è disponibile dal tuo paese senza fatturazione attiva.',
    server_misconfigured: 'Il servizio di intelligenza artificiale rifiuta la chiave o non trova il modello: controlla in Impostazioni.',
    irraggiungibile: 'Non riesco a raggiungere il servizio di intelligenza artificiale: controlla la connessione e, in Impostazioni, l\'indirizzo del servizio.',
    refused: 'L\'IA non ha elaborato questa richiesta. Prova a descrivere la merce in un altro modo.',
    empty_completion: 'L\'IA non ha restituito una risposta. Prova a riformulare la descrizione.',
    invalid_json: 'La risposta non era leggibile. Riprova.',
    prompt_too_large: 'La richiesta è troppo lunga. Accorcia la descrizione e riprova.',
    upstream_timeout: 'L\'IA ha impiegato troppo tempo a rispondere. Riprova.',
    upstream_error: 'Errore temporaneo nel collegamento con il servizio di intelligenza artificiale. Riprova tra poco.',
    bad_request: 'Richiesta non valida.'
  };
  function erroreIA(e, messaggi) {
    if (e && e.name === 'AbortError') throw e;
    var c = (e && e.codice) || 'upstream_error';
    return errore((e && e.stato) || 502, (messaggi && messaggi[c]) || MESSAGGI[c] || MESSAGGI.upstream_error, c);
  }
  function registraUso(corpo, r) {
    var u = uso(), op = String(corpo.operazione || '');
    u.richieste++; u.token_in += r.tin || 0; u.token_out += r.tout || 0; u.token_cache += r.tcache || 0;
    if (op && (corpo.tipo || 'classifica') === 'classifica') {
      var o = u.ops[op] || (u.ops[op] = { n: 0, conta: false });
      o.n++;
      if (r.esito === 'ok' || r.tin > 0) o.conta = true;      // conta se ha raggiunto il servizio
    }
    try { scrivi('uso', u); } catch (e) { /* l'uso del mese non è indispensabile */ }
  }
  function chiediIA(corpo, segnale) {
    var cfg = iaCfg(), u = uso(), op = String(corpo.operazione || '');
    if (!cfg.disponibile) return Promise.reject(errore(503, MESSAGGI.not_configured, 'not_configured'));
    if ((corpo.tipo || 'classifica') === 'classifica' && op && u.ops[op] && u.ops[op].n >= RICHIESTE_PER_CLASSIFICAZIONE) return Promise.reject(errore(429, MESSAGGI.rate_limited, 'rate_limited'));
    if (inCorso >= 2) return Promise.reject(errore(429, MESSAGGI.rate_limited, 'rate_limited'));
    inCorso++;
    return servizio.chiedi(cfg, corpo, segnale).then(function (r) {
      inCorso--; registraUso(corpo, r);
      return { risultato: r.risultato, uso: { token_in: r.tin, token_out: r.tout, token_cache: r.tcache } };
    }, function (e) {
      inCorso--;
      if (e && e.uso) registraUso(corpo, e.uso);
      throw erroreIA(e);
    });
  }
  var MESSAGGI_PROVA = {
    not_configured: 'Nessun servizio IA impostato: scegline uno e salva.',
    server_misconfigured: 'Il servizio rifiuta la chiave o non trova il modello: controlla chiave, indirizzo e nome del modello.',
    irraggiungibile: 'Non riesco a raggiungere il servizio: controlla l\'indirizzo. Alcuni servizi (per esempio Ollama) vanno impostati per accettare richieste da questo sito.'
  };

  /* ------------------------------------------------------------------ esporta e importa (stesso formato del programma per Windows) */
  function esporta() {
    return tuttoStorico().then(function (st) {
      return { formato: 'magic-hs', versione: 1, esportato: adesso(), profilo: profilo(), preferenze: preferenze(),
               preferiti: elencoPreferiti(),
               storico: st.map(function (v) { return { quando: v.quando, testo: v.testo, codice: v.codice, dati: v.dati }; }) };
    });
  }
  function importa(d) {
    if (!d || d.formato !== 'magic-hs' || !Array.isArray(d.storico) || !Array.isArray(d.preferiti)) return Promise.reject(errore(422, 'Il file non è un\'esportazione di MAGIC HS.', 'formato'));
    var pref = leggi('preferiti', {}), np = 0;
    d.preferiti.forEach(function (p) {
      if (p && /^\d{10}$/.test(p.codice) && Object.keys(pref).length < MASSIMO_PREFERITI) {
        if (!pref[p.codice]) np++;
        pref[p.codice] = { nota: String(p.nota || '').slice(0, 500), quando: p.quando || adesso() };
      }
    });
    scrivi('preferiti', pref);
    if (d.profilo && String(d.profilo.nome || '').trim().length >= 2 && profilo().nome === 'Utente') scrivi('profilo', { nome: String(d.profilo.nome).slice(0, 100), azienda: String(d.profilo.azienda || '').slice(0, 150) });
    return tuttoStorico().then(function (gia) {
      var visti = {}; gia.forEach(function (v) { visti[v.quando + '|' + v.testo] = 1; });
      // l'esportazione va dalla più recente: si inserisce dalla più vecchia (a parità d'orario nello stesso ordine)
      var nuove = d.storico.slice().reverse().filter(function (v) { return v && typeof v.testo === 'string' && v.dati && typeof v.dati === 'object' && !visti[v.quando + '|' + v.testo]; })
        .map(function (v, i) { return [v, i]; }).sort(function (a, b) { return String(a[0].quando).localeCompare(String(b[0].quando)) || a[1] - b[1]; })
        .map(function (x) { return x[0]; });
      return nuove.reduce(function (p, v) {
        return p.then(function () { return aggiungiStorico({ quando: String(v.quando || adesso()), testo: v.testo.slice(0, 2000), codice: /^\d{10}$/.test(v.codice) ? v.codice : '', dati: v.dati }); });
      }, Promise.resolve()).then(function () { return { ok: true, storico: nuove.length, preferiti: np }; });
    });
  }
  function elencoPreferiti() {
    var pref = leggi('preferiti', {});
    return Object.keys(pref).map(function (c) { return { codice: c, nota: pref[c].nota || '', quando: pref[c].quando || '' }; })
      .sort(function (a, b) { return String(b.quando).localeCompare(String(a.quando)); });
  }

  /* ------------------------------------------------------------------ le «API» */
  function rotta(metodo, percorso, q, corpo, opzioni) {
    var m;
    if (percorso === '/api/io') {
      if (metodo === 'GET') return io();
      var nome = String((corpo || {}).nome || '').trim(), az = String((corpo || {}).azienda || '').trim();
      if (nome.length < 2 || nome.length > 100 || az.length > 150) throw errore(422, 'Il nome deve avere da 2 a 100 caratteri.', 'nome');
      scrivi('profilo', { nome: nome, azienda: az }); return { ok: true };
    }
    if (percorso === '/api/io/preferenze' && metodo === 'PUT') {
      var p = corpo || {}, paese = String(p.paese || '').trim().toUpperCase();
      if (paese && !/^[A-Z0-9]{2,4}$/.test(paese)) throw errore(422, 'Paese non valido.', 'paese');
      scrivi('preferenze', { paese: paese, flusso: p.flusso === 'export' ? 'export' : 'import', tema: ['auto', 'chiaro', 'scuro'].indexOf(p.tema) >= 0 ? p.tema : 'auto' });
      return { ok: true };
    }
    if (percorso === '/api/io/esporta') return esporta();
    if (percorso === '/api/io/importa' && metodo === 'POST') return importa(corpo);
    // storico
    if (percorso === '/api/storico') {
      if (metodo === 'GET') {
        var limite = Math.max(1, Math.min(+q.get('limite') || 50, 100)), prima = +q.get('prima') || 0;
        return tuttoStorico().then(function (st) {
          return { voci: st.filter(function (v) { return !prima || v.id < prima; }).slice(0, limite).map(function (v) { return { id: v.id, quando: v.quando, testo: v.testo, codice: v.codice }; }), totale: st.length };
        });
      }
      if (metodo === 'POST') {
        var c = corpo || {};
        if (c.codice && !/^\d{10}$/.test(c.codice)) throw errore(422, 'Codice non valido.', 'codice');
        if (!String(c.testo || '').trim()) throw errore(422, 'Descrizione mancante.', 'testo');
        if (JSON.stringify(c.dati || {}).length > 200000) throw errore(413, 'Classificazione troppo grande da salvare.', 'troppo_grande');
        return aggiungiStorico({ quando: adesso(), testo: String(c.testo).trim().slice(0, 2000), codice: c.codice || '', dati: c.dati || {} }).then(function (id) { return { ok: true, id: id }; });
      }
      if (metodo === 'DELETE') {
        return tuttoStorico().then(function (st) {
          return operazione('readwrite', function (s) { if (s) s.clear(); else storicoMem = []; }).then(function () { return { ok: true, eliminate: st.length }; });
        });
      }
    }
    if ((m = /^\/api\/storico\/(\d+)$/.exec(percorso))) {
      var id = +m[1];
      if (metodo === 'GET') {
        return operazione('readonly', function (s) { return s ? richiesta(s.get(id)) : storicoMem.filter(function (v) { return v.id === id; })[0]; }).then(function (v) {
          if (!v) throw errore(404, 'Classificazione non trovata.', 'non_trovato');
          return v;
        });
      }
      if (metodo === 'DELETE') return operazione('readwrite', function (s) { if (s) s.delete(id); else storicoMem = storicoMem.filter(function (v) { return v.id !== id; }); }).then(function () { return { ok: true }; });
    }
    // preferiti
    if (percorso === '/api/preferiti' && metodo === 'GET') return { voci: elencoPreferiti() };
    if ((m = /^\/api\/preferiti\/([^/]+)$/.exec(percorso))) {
      var cod = decodeURIComponent(m[1]), pref = leggi('preferiti', {});
      if (metodo === 'PUT') {
        if (!/^\d{10}$/.test(cod)) throw errore(422, 'Codice non valido.', 'codice');
        if (!pref[cod] && Object.keys(pref).length >= MASSIMO_PREFERITI) throw errore(409, 'Hai già 1000 preferiti: eliminane qualcuno.', 'troppi');
        pref[cod] = { nota: String((corpo || {}).nota || '').trim().slice(0, 500), quando: (pref[cod] && pref[cod].quando) || adesso() };
        scrivi('preferiti', pref); return { ok: true };
      }
      if (metodo === 'DELETE') { delete pref[cod]; scrivi('preferiti', pref); return { ok: true }; }
    }
    // intelligenza artificiale
    if (percorso === '/api/ia' && metodo === 'POST') return chiediIA(corpo || {}, opzioni.signal);
    // impostazioni
    if (percorso === '/api/admin/riepilogo') { var cf = iaCfg(); return { ia: cf.disponibile, ia_nome: cf.nome, dati: DATI || null, aggiornamento: null }; }
    if (percorso === '/api/admin/locale' && metodo === 'GET') {
      var v = iaSalvata(), k = String(v.chiave || ''), cfg = iaCfg(), u = uso();
      return { ia: { fornitore: v.fornitore || '', url: v.url || '', modello: v.modello || '', modello_rapido: v.modello_rapido || '',
                     chiave: k.length > 8 ? '…' + k.slice(-4) : (k ? 'impostata' : ''), chiave_illeggibile: false },
               attiva: cfg.disponibile, ia_nome: cfg.nome, fornitore_attivo: cfg.fornitore,
               modelli_in_uso: cfg.disponibile ? { rapido: cfg.modello_rapido, principale: cfg.modello } : null,
               uso: { classificazioni: classificazioni(u), richieste: u.richieste, token_in: u.token_in, token_cache: u.token_cache, token_out: u.token_out, mese: u.mese },
               aggiornate: v.aggiornate || '' };
    }
    if (percorso === '/api/admin/locale/ia' && metodo === 'PUT') return salvaIA(corpo || {});
    if (percorso === '/api/admin/locale/ia/modelli' && metodo === 'POST') {
      return servizio.modelli(iaCfg()).then(function (l) { return { ok: true, modelli: l }; }, function (e) {
        throw errore(e.stato || 502, 'Non riesco a leggere l\'elenco dei modelli: controlla chiave e indirizzo, oppure scrivi il nome a mano.', e.codice);
      });
    }
    if (percorso === '/api/admin/locale/ia/prova' && metodo === 'POST') {
      return servizio.prova(iaCfg(), q.get('livello') === 'standard' ? 'standard' : 'rapido').then(function (r) { r.ok = true; return r; }, function (e) { throw erroreIA(e, MESSAGGI_PROVA); });
    }
    if (percorso === '/api/admin/dati' && metodo === 'GET') {
      return { attiva: DATI, versioni: versioni.map(function (x) { var i = infoVersione(x) || {}; return Object.assign({}, i, { versione: x, attiva: x === DATI }); }),
               in_corso: null, ultimi: [], prossimo: null };
    }
    if (percorso === '/api/admin/dati/attiva' && metodo === 'POST') {
      var vv = (corpo || {}).versione;
      if (versioni.indexOf(vv) < 0) throw errore(404, 'Versione non disponibile.', 'non_trovato');
      scrivi('versione', vv === versioni[0] ? '' : vv); return { ok: true };
    }
    if ((m = /^\/api\/admin\/dati\/riepilogo\/(\d{4}-\d{2}-01)$/.exec(percorso))) {
      return fetch('dati/' + m[1] + '/riepilogo.txt').then(function (r) { return r.ok ? r.text() : 'Riepilogo non disponibile.'; }, function () { return 'Riepilogo non disponibile.'; })
        .then(function (t) { return { testo: t }; });
    }
    throw errore(404, 'Funzione non disponibile nella versione sito.', 'non_trovato');
  }

  function salvaIA(c) {
    var prima = iaSalvata(), f = String(c.fornitore || '');
    if (['', 'gemini', 'anthropic', 'openai'].indexOf(f) < 0) throw errore(422, 'Servizio non valido.', 'fornitore');
    var chiave = c.chiave === undefined || c.chiave === null ? String(prima.chiave || '') : String(c.chiave).trim();
    var url = String(c.url || '').trim().replace(/\/+$/, '');
    if (url && !/^https?:\/\/[^\s/]+(\/\S*)?$/.test(url)) throw errore(422, 'Indirizzo del servizio non valido: deve iniziare con https://.', 'url');
    if (f === 'openai' && !url) throw errore(422, 'Indica l\'indirizzo del servizio (per Azure OpenAI: https://<risorsa>.openai.azure.com/openai/v1).', 'url');
    if (f === 'openai' && !String(c.modello || '').trim()) throw errore(422, 'Indica il modello (per Azure OpenAI: il nome della distribuzione).', 'modello');
    if ((f === 'gemini' || f === 'anthropic') && !chiave) throw errore(422, 'Inserisci la chiave del servizio.', 'chiave');
    if (chiave.length > 500) throw errore(422, 'Chiave troppo lunga.', 'chiave');
    var v = f ? { fornitore: f, chiave: chiave, url: f === 'openai' ? url : (prima.fornitore === f ? prima.url || '' : ''),
                  modello: String(c.modello || '').trim().slice(0, 120), modello_rapido: String(c.modello_rapido || '').trim().slice(0, 120), aggiornate: adesso() }
              : { aggiornate: adesso() };
    scrivi('ia', v);
    var cfg = iaCfg();
    return { ok: true, attiva: cfg.disponibile, ia_nome: cfg.nome };
  }

  T.api = function (metodo, url, corpo, opzioni) {
    opzioni = opzioni || {};
    var u = new URL(url, location.href);
    return Promise.resolve().then(function () { return rotta(metodo, u.pathname.replace(/^.*?(\/api\/)/, '/api/'), u.searchParams, corpo, opzioni); })
      .then(function (r) { return r; }, function (e) {
        if (e && e.name === 'AbortError') throw e;
        if (e && e.errore) throw e;
        if (typeof console !== 'undefined') console.warn('MAGIC HS:', e);
        throw errore(500, 'Operazione non riuscita nel browser. Riprova.', 'errore');
      });
  };

  /* ------------------------------------------------------------------ app installabile e senza rete */
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    window.addEventListener('load', function () { navigator.serviceWorker.register('sw.js').catch(function () { /* funziona anche senza */ }); });
  }
})();
