/* MAGIC HS - intelligenza artificiale chiamata dal browser (versione sito). È la stessa logica di taric/ia.py:
   Gemini, Claude o un servizio compatibile OpenAI, con la chiave della persona; contesto prima (va nella cache del
   fornitore) e merce in fondo; risposta con schema JSON (strumento obbligato per Claude, json_schema per OpenAI,
   responseSchema per Gemini) e ritorno al modo semplice se il servizio non lo accetta; sovraccarico e limite al minuto
   si riprovano da soli. Gli errori diventano gli stessi codici del programma per Windows (app.MESSAGGI_IA).
   Si carica anche in Node per le prove (tests/ia_web.test.js). */
(function (radice) {
  'use strict';

  var TOKEN_MASSIMI = { rapido: 4096, standard: 16384 };
  var ISTRUZIONI = 'Rispondi esclusivamente con un unico valore JSON valido che rispetta il formato richiesto, senza testo ' +
    'prima o dopo e senza blocchi di codice. Scrivi i testi in italiano.';
  var TENTATIVI = 2, ATTESA_MASSIMA = 20, TEMPO_MASSIMO = 180;     // secondi
  /* modelli e indirizzi predefiniti per fornitore: [rapido, principale, indirizzo] (come config.FORNITORI) */
  var FORNITORI = {
    gemini: ['gemini-3.5-flash-lite', 'gemini-3.7-flash', 'https://generativelanguage.googleapis.com/v1beta'],
    anthropic: ['claude-haiku-5-5', 'claude-sonnet-5-5', 'https://api.anthropic.com/v1/messages'],
    openai: ['', '', '']
  };

  /* ------------------------------------------------------------------ schemi delle risposte */
  var S = { type: 'string' }, I = { type: 'integer' };
  function oggetto(campi) { return { type: 'object', properties: campi, required: Object.keys(campi), additionalProperties: false }; }
  function elenco(voce) { return { type: 'array', items: voce }; }
  var SCHEMI = {
    voci: oggetto({ merce: S, voci: elenco(oggetto({ voce: S, motivo: S })), non_classificabile: { type: ['string', 'null'] } }),
    scelta: oggetto({
      merce: S,
      migliore: oggetto({ codice: S, descrizione_it: S, motivazione: S, confidenza: I }),
      alternative: elenco(oggetto({ codice: S, descrizione_it: S, quando: S, confidenza: I })),
      domande: elenco(oggetto({ domanda: S, opzioni: elenco(S), perche: S })),
      altre_voci: elenco(S)
    }),
    traduzione: oggetto({ traduzioni: elenco(S) }),
    prova: oggetto({ ok: { type: 'boolean' } })
  };
  function copia(x) { return JSON.parse(JSON.stringify(x)); }

  /* lo schema nella forma di responseSchema di Gemini (tipi in maiuscolo, nullable, niente additionalProperties) */
  function schemaGemini(s) {
    var out = {}, tipo = s.type;
    if (Array.isArray(tipo)) { out.nullable = tipo.indexOf('null') >= 0; tipo = tipo.filter(function (t) { return t !== 'null'; })[0]; }
    out.type = String(tipo).toUpperCase();
    if (s.properties) {
      out.properties = {};
      Object.keys(s.properties).forEach(function (k) { out.properties[k] = schemaGemini(s.properties[k]); });
      out.required = (s.required || []).slice();
      out.propertyOrdering = Object.keys(s.properties);
    }
    if (s.items) out.items = schemaGemini(s.items);
    return out;
  }

  /* ------------------------------------------------------------------ configurazione (come config._ia) */
  function configura(v) {
    v = v || {};
    var f = String(v.fornitore || '').toLowerCase();
    if (!FORNITORI[f]) f = '';
    var def = FORNITORI[f] || ['', '', ''];
    var principale = String(v.modello || '').trim() || def[1];
    var c = {
      fornitore: f, chiave: String(v.chiave || '').trim(), url: String(v.url || def[2] || '').trim().replace(/\/+$/, ''),
      modello: principale, modello_rapido: String(v.modello_rapido || '').trim() || def[0] || principale
    };
    c.disponibile = f === 'openai' ? !!(c.url && c.modello) : (f === 'gemini' || f === 'anthropic') && !!c.chiave;
    c.nome = { gemini: 'Gemini (Google)', anthropic: 'Claude (Anthropic)' }[f] || c.modello || '';
    return c;
  }

  /* ------------------------------------------------------------------ errori */
  function ErroreIA(codice, stato, dettaglio) {
    this.codice = codice; this.stato = stato || 502; this.dettaglio = dettaglio || '';
    this.corpo = ''; this.statoServizio = 0; this.attesa = null;
  }
  function errore(codice, stato, dettaglio) { return new ErroreIA(codice, stato, dettaglio); }

  function attesaSuggerita(intestazioni, testo) {
    var v = intestazioni && intestazioni.get ? (intestazioni.get('retry-after') || '') : '';
    if (/^\d+(\.\d+)?$/.test(v)) return parseFloat(v);
    var m = /"retryDelay"\s*:\s*"(\d+(?:\.\d+)?)s"/.exec(String(testo || '').slice(0, 4000));     // Gemini
    return m ? parseFloat(m[1]) : null;
  }

  /* traduce le risposte d'errore dei tre fornitori in codici comuni */
  function codiceHttp(stato, testo, modello) {
    var basso = String(testo || '').slice(0, 800).toLowerCase();
    if (basso.indexOf('api key') >= 0 || basso.indexOf('api_key') >= 0 || basso.indexOf('unauthenticated') >= 0 || stato === 401) return errore('server_misconfigured', 503, 'chiave non valida');
    if (/billing|credit balance|spend limit|insufficient_quota|payment/.test(basso)) return errore('credito_esaurito', 503);
    if (basso.indexOf('location is not supported') >= 0 || basso.indexOf('not available in your country') >= 0) return errore('regione_non_supportata', 503);
    if (stato === 404 || (basso.indexOf('model') >= 0 && (basso.indexOf('not found') >= 0 || basso.indexOf('does not exist') >= 0))) return errore('server_misconfigured', 503, 'modello ' + modello + ' non disponibile');
    if (stato === 403) return errore('server_misconfigured', 503, 'permesso negato');
    if (stato === 429) return (/perday|per day|daily/.test(basso)) ? errore('limite_giornaliero', 429) : errore('rate_limited', 429);
    if ([500, 502, 503, 504, 529].indexOf(stato) >= 0) return errore('overloaded', 503);
    if (/too long|too many tokens|exceeds the maximum|context length/.test(basso)) return errore('prompt_too_large', 413);
    return errore('upstream_error', 502);
  }
  function erroreHttp(stato, testo, intestazioni, modello) {
    var e = codiceHttp(stato, testo, modello);
    e.corpo = String(testo || '').slice(0, 800); e.statoServizio = stato; e.attesa = attesaSuggerita(intestazioni, testo);
    return e;
  }
  /* il servizio non accetta lo schema, lo strumento o il formato JSON richiesto: si riprova senza */
  function rifiutaFormato(e) { return (e.statoServizio === 400 || e.statoServizio === 422) && e.codice === 'upstream_error'; }

  /* primo valore JSON completo nel testo (tollera blocchi ``` e testo attorno) */
  function estraiJson(testo) {
    var t = String(testo || '').trim();
    if (t.indexOf('```') === 0) { t = t.indexOf('\n') >= 0 ? t.slice(t.indexOf('\n') + 1) : ''; var k = t.lastIndexOf('```'); if (k >= 0) t = t.slice(0, k); }
    for (var i = 0; i < t.length; i++) {
      var ch = t.charAt(i);
      if (ch !== '{' && ch !== '[') continue;
      var fine = fineJson(t, i);
      if (fine > 0) { try { return JSON.parse(t.slice(i, fine)); } catch (x) { /* si prova dal carattere dopo */ } }
    }
    throw errore('invalid_json');
  }
  function fineJson(t, i) {                  // fine del valore che inizia in i (parentesi bilanciate, fuori dalle stringhe)
    var prof = 0, str = false, esc = false;
    for (var j = i; j < t.length; j++) {
      var c = t.charAt(j);
      if (str) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') str = false; continue; }
      if (c === '"') str = true;
      else if (c === '{' || c === '[') prof++;
      else if (c === '}' || c === ']') { prof--; if (prof === 0) return j + 1; }
    }
    return -1;
  }

  /* ------------------------------------------------------------------ chiamate */
  function Servizio(opzioni) {
    opzioni = opzioni || {};
    this.fetch = opzioni.fetch || (typeof fetch === 'function' ? fetch.bind(radice) : null);
    this.attendi = opzioni.attendi || function (s) { return new Promise(function (ok) { setTimeout(ok, s * 1000); }); };
  }

  /* POST al servizio; sovraccarico, limite al minuto ed errori di rete si riprovano da soli (al massimo TENTATIVI volte) */
  Servizio.prototype.post = function (url, corpo, intestazioni, modello, segnale) {
    var self = this, n = 0;
    function giro() {
      var ctrl = typeof AbortController === 'function' ? new AbortController() : null, scaduto = false;
      var timer = ctrl ? setTimeout(function () { scaduto = true; ctrl.abort(); }, TEMPO_MASSIMO * 1000) : null;
      if (segnale && ctrl) { if (segnale.aborted) ctrl.abort(); else segnale.addEventListener('abort', function () { ctrl.abort(); }); }
      return self.fetch(url, { method: 'POST', headers: intestazioni, body: JSON.stringify(corpo), signal: ctrl ? ctrl.signal : undefined })
        .then(function (r) {
          clearTimeout(timer);
          return r.text().then(function (testo) {
            if (r.status === 200) {
              try { return JSON.parse(testo); } catch (x) { throw errore('upstream_error', 502); }
            }
            var e = erroreHttp(r.status, testo, r.headers, modello);
            if (e.codice !== 'rate_limited' && e.codice !== 'overloaded') throw e;
            return riprova(e);
          });
        }, function (x) {
          clearTimeout(timer);
          if (segnale && segnale.aborted) throw { name: 'AbortError' };
          if (scaduto) throw errore('upstream_timeout', 504);         // dopo minuti d'attesa non conviene riprovare
          return riprova(errore('irraggiungibile', 502));              // rete, indirizzo sbagliato o servizio che non accetta il browser
        });
    }
    function riprova(e) {
      var attesa = e.attesa !== null ? e.attesa : 2 * Math.pow(2, n);
      if (n >= TENTATIVI || attesa > ATTESA_MASSIMA) throw e;
      n++;
      return Promise.resolve(self.attendi(attesa)).then(giro);
    }
    return giro();
  };

  Servizio.prototype.chiama = function (cfg, modello, contesto, prompt, tokenMassimi, schema, segnale) {
    var f = { gemini: this.gemini, anthropic: this.anthropic, openai: this.openai }[cfg.fornitore];
    if (!f) return Promise.reject(errore('not_configured', 503));
    return f.call(this, cfg, modello, contesto, prompt, tokenMassimi, schema, segnale);
  };

  /* ---------- Google Gemini */
  Servizio.prototype.gemini = function (cfg, modello, contesto, prompt, tokenMassimi, schema, segnale) {
    var self = this;
    var parti = (contesto ? [{ text: contesto }] : []).concat([{ text: prompt }]);
    var corpo = {
      systemInstruction: { parts: [{ text: ISTRUZIONI }] },
      contents: [{ role: 'user', parts: parti }],
      generationConfig: { responseMimeType: 'application/json', maxOutputTokens: tokenMassimi }
    };
    if (schema) corpo.generationConfig.responseSchema = schemaGemini(SCHEMI[schema]);
    var url = cfg.url + '/models/' + modello + ':generateContent';
    var intest = { 'x-goog-api-key': cfg.chiave, 'content-type': 'application/json' };
    return self.post(url, corpo, intest, modello, segnale).catch(function (e) {
      if (!(schema && rifiutaFormato(e))) throw e;
      delete corpo.generationConfig.responseSchema;
      return self.post(url, corpo, intest, modello, segnale);
    }).then(function (d) {
      var uso = d.usageMetadata || {};
      var tin = +uso.promptTokenCount || 0, tout = (+uso.candidatesTokenCount || 0) + (+uso.thoughtsTokenCount || 0), tcache = +uso.cachedContentTokenCount || 0;
      if ((d.promptFeedback || {}).blockReason) return { testo: '', tin: tin, tout: tout, tcache: tcache, rifiutata: true };
      var cand = (d.candidates || [{}])[0] || {}, motivo = cand.finishReason || '';
      var testo = ((cand.content || {}).parts || []).filter(function (p) { return !p.thought; }).map(function (p) { return p.text || ''; }).join('');
      return { testo: testo, tin: tin, tout: tout, tcache: tcache, rifiutata: ['SAFETY', 'PROHIBITED_CONTENT', 'BLOCKLIST', 'SPII', 'RECITATION'].indexOf(motivo) >= 0 };
    });
  };

  /* ---------- Anthropic (Claude) */
  Servizio.prototype.anthropic = function (cfg, modello, contesto, prompt, tokenMassimi, schema, segnale) {
    var self = this;
    // il contesto (istruzioni e testo ufficiale delle voci) va in cache: le richieste successive lo rileggono a poco prezzo
    var contenuto = contesto ? [{ type: 'text', text: contesto, cache_control: { type: 'ephemeral' } }, { type: 'text', text: prompt }] : prompt;
    var corpo = { model: modello, max_tokens: tokenMassimi, system: ISTRUZIONI, messages: [{ role: 'user', content: contenuto }] };
    if (schema) {      // risposta obbligata nello strumento: il JSON segue lo schema
      corpo.tools = [{ name: 'risposta', description: 'Restituisce la risposta nel formato richiesto.', input_schema: copia(SCHEMI[schema]) }];
      corpo.tool_choice = { type: 'tool', name: 'risposta' };
    }
    var intest = { 'x-api-key': cfg.chiave, 'anthropic-version': '2023-06-01', 'content-type': 'application/json',
                   'anthropic-dangerous-direct-browser-access': 'true' };       // chiamata dal browser con la chiave della persona
    return self.post(cfg.url, corpo, intest, modello, segnale).catch(function (e) {
      if (!(schema && rifiutaFormato(e))) throw e;
      delete corpo.tools; delete corpo.tool_choice;
      return self.post(cfg.url, corpo, intest, modello, segnale);
    }).then(function (d) {
      var uso = d.usage || {}, letti = +uso.cache_read_input_tokens || 0, scritti = +uso.cache_creation_input_tokens || 0;
      var blocchi = d.content || [], strumento = blocchi.filter(function (b) { return b.type === 'tool_use'; })[0];
      var testo = strumento ? JSON.stringify(strumento.input) : blocchi.filter(function (b) { return b.type === 'text'; }).map(function (b) { return b.text || ''; }).join('');
      return { testo: testo, tin: (+uso.input_tokens || 0) + letti + scritti, tout: +uso.output_tokens || 0, tcache: letti, rifiutata: d.stop_reason === 'refusal' };
    });
  };

  /* ---------- compatibili OpenAI (Azure, Groq, Mistral, OpenRouter, Ollama...) */
  Servizio.prototype.openai = function (cfg, modello, contesto, prompt, tokenMassimi, schema, segnale) {
    var self = this;
    var testoUtente = contesto ? contesto + '\n\n' + prompt : prompt;      // prefisso uguale: cache automatica del servizio
    var formati = [{ type: 'json_object' }, null];
    if (schema) formati.unshift({ type: 'json_schema', json_schema: { name: schema, strict: true, schema: copia(SCHEMI[schema]) } });
    var corpo = { model: modello, max_tokens: tokenMassimi, messages: [{ role: 'system', content: ISTRUZIONI }, { role: 'user', content: testoUtente }] };
    var intest = { 'content-type': 'application/json' };
    if (cfg.chiave) {
      intest.authorization = 'Bearer ' + cfg.chiave;
      if (/\.azure\.com$/i.test(nomeHost(cfg.url))) intest['api-key'] = cfg.chiave;      // Azure OpenAI
    }
    var url = cfg.url + '/chat/completions', k = 0;
    function prova() {
      if (formati[k] === null) delete corpo.response_format; else corpo.response_format = formati[k];
      return self.post(url, corpo, intest, modello, segnale).catch(function (e) {
        if (!rifiutaFormato(e)) throw e;
        if ('max_tokens' in corpo && e.corpo.indexOf('max_completion_tokens') >= 0) {     // modelli recenti di OpenAI e Azure
          corpo.max_completion_tokens = corpo.max_tokens; delete corpo.max_tokens;
        } else if (k + 1 < formati.length) k++;          // il servizio non conosce questo formato di risposta: si prova il successivo
        else throw e;
        return prova();
      });
    }
    return prova().then(function (d) {
      var uso = d.usage || {}, scelta = (d.choices || [{}])[0] || {};
      return { testo: (scelta.message || {}).content || '', tin: +uso.prompt_tokens || 0, tout: +uso.completion_tokens || 0,
               tcache: +((uso.prompt_tokens_details || {}).cached_tokens) || 0, rifiutata: scelta.finish_reason === 'content_filter' };
    });
  };
  function nomeHost(u) { var m = /^https?:\/\/([^/:?#]+)/i.exec(u || ''); return m ? m[1] : ''; }

  /* ---------- richiesta completa: risposta JSON letta e controllata */
  Servizio.prototype.chiedi = function (cfg, richiesta, segnale) {
    var livello = richiesta.livello || 'standard', schema = richiesta.schema || null;
    if (!cfg.disponibile) return Promise.reject(errore('not_configured', 503));
    if (!TOKEN_MASSIMI[livello] || (schema && !SCHEMI[schema]) || !String(richiesta.prompt || '').trim()) return Promise.reject(errore('bad_request', 400));
    var modello = livello === 'rapido' ? cfg.modello_rapido : cfg.modello;
    return this.chiama(cfg, modello, richiesta.contesto || '', richiesta.prompt, TOKEN_MASSIMI[livello], schema, segnale).then(function (r) {
      r.modello = modello;
      if (r.rifiutata) { r.esito = 'rifiutata'; throw conUso(errore('refused', 422), r); }
      if (!String(r.testo).trim()) { r.esito = 'vuota'; throw conUso(errore('empty_completion', 502), r); }
      try { r.risultato = estraiJson(r.testo); } catch (e) { r.esito = 'json_non_valido'; throw conUso(e, r); }
      r.esito = 'ok';
      return r;
    });
  };
  function conUso(e, r) { e.uso = r; return e; }

  /* breve richiesta di prova (pagina Impostazioni), con il modello rapido o con il principale; non conta come classificazione */
  Servizio.prototype.prova = function (cfg, livello) {
    if (!cfg.disponibile) return Promise.reject(errore('not_configured', 503));
    var inizio = Date.now(), modello = livello === 'standard' ? cfg.modello : cfg.modello_rapido;
    return this.chiama(cfg, modello, '', 'Rispondi con questo oggetto JSON: {"ok": true}', 1024, 'prova').then(function (r) {
      if (r.rifiutata) throw errore('refused', 422);
      if (!String(r.testo).trim()) throw errore('empty_completion', 502);
      return { risposta: estraiJson(r.testo), secondi: Math.round((Date.now() - inizio) / 100) / 10, modello: modello, token_in: r.tin, token_out: r.tout };
    });
  };

  /* modelli offerti dal servizio (suggerimenti per i campi «Modello») */
  Servizio.prototype.modelli = function (cfg) {
    if (!cfg.disponibile) return Promise.reject(errore('not_configured', 503));
    var url, intest = {};
    if (cfg.fornitore === 'gemini') { url = cfg.url + '/models?pageSize=200'; intest['x-goog-api-key'] = cfg.chiave; }
    else if (cfg.fornitore === 'anthropic') {
      url = cfg.url.replace(/\/messages$/, '') + '/models?limit=100';
      intest = { 'x-api-key': cfg.chiave, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' };
    } else { url = cfg.url + '/models'; if (cfg.chiave) intest.authorization = 'Bearer ' + cfg.chiave; }
    return this.fetch(url, { headers: intest }).then(function (r) {
      return r.text().then(function (testo) {
        if (r.status !== 200) throw erroreHttp(r.status, testo, r.headers, '');
        var d; try { d = JSON.parse(testo); } catch (x) { throw errore('upstream_error', 502); }
        var nomi = cfg.fornitore === 'gemini'
          ? (d.models || []).filter(function (m) { return (m.supportedGenerationMethods || []).indexOf('generateContent') >= 0; }).map(function (m) { return String(m.name || '').replace(/^models\//, ''); })
          : (d.data || []).map(function (m) { return String(m.id || ''); });
        var visti = {};
        return nomi.filter(function (n) { if (!n || n.length > 120 || visti[n]) return false; visti[n] = 1; return true; }).sort();
      });
    }, function () { throw errore('irraggiungibile', 502); });
  };

  var IA = { Servizio: Servizio, configura: configura, schemaGemini: schemaGemini, estraiJson: estraiJson, SCHEMI: SCHEMI,
             FORNITORI: FORNITORI, TOKEN_MASSIMI: TOKEN_MASSIMI, ErroreIA: ErroreIA };
  radice.TARIC = radice.TARIC || {};
  radice.TARIC.IA = IA;
  if (typeof module === 'object' && module.exports) module.exports = IA;
})(typeof window !== 'undefined' ? window : globalThis);
