// Prove dell'IA della versione sito (taric/static/js/ia.js) con un finto fetch: formato delle chiamate ai tre fornitori,
// schemi e ritorno al modo semplice, nuovi tentativi, traduzione degli errori. Uso: node --test tests/ia_web.test.js
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const IA = require('../taric/static/js/ia.js');

function finto(risposte) {
  const chiamate = [];
  const f = async (url, init) => {
    chiamate.push({ url, init, corpo: init && init.body ? JSON.parse(init.body) : null, intest: (init && init.headers) || {} });
    const r = risposte.shift();
    if (r instanceof Error) throw r;
    if (!r) return new Response('{}', { status: 500 });
    return new Response(typeof r.corpo === 'string' ? r.corpo : JSON.stringify(r.corpo), { status: r.stato || 200, headers: r.intest || {} });
  };
  return { f, chiamate };
}
function servizio(risposte) {
  const x = finto(risposte), attese = [];
  const s = new IA.Servizio({ fetch: x.f, attendi: (n) => { attese.push(n); } });
  return { s, chiamate: x.chiamate, attese };
}
const CLAUDE = IA.configura({ fornitore: 'anthropic', chiave: 'sk-ant' });
const GEMINI = IA.configura({ fornitore: 'gemini', chiave: 'g-key' });
const OPENAI = IA.configura({ fornitore: 'openai', url: 'https://risorsa.openai.azure.com/openai/v1/', modello: 'gpt-classifica', chiave: 'az' });

test('configurazione come config._ia', () => {
  assert.deepStrictEqual([GEMINI.modello_rapido, GEMINI.modello, GEMINI.nome, GEMINI.disponibile], ['gemini-3.5-flash-lite', 'gemini-3.7-flash', 'Gemini (Google)', true]);
  assert.strictEqual(CLAUDE.url, 'https://api.anthropic.com/v1/messages');
  assert.strictEqual(IA.configura({ fornitore: 'anthropic' }).disponibile, false);
  assert.strictEqual(IA.configura({ fornitore: 'openai', url: 'http://localhost:11434/v1' }).disponibile, false);
  const ollama = IA.configura({ fornitore: 'openai', url: 'http://localhost:11434/v1/', modello: 'qwen3:14b' });
  assert.deepStrictEqual([ollama.disponibile, ollama.url, ollama.modello_rapido, ollama.nome], [true, 'http://localhost:11434/v1', 'qwen3:14b', 'qwen3:14b']);
  assert.strictEqual(IA.configura({ fornitore: 'altro' }).fornitore, '');
});

test('schema per Gemini e lettura del JSON', () => {
  const s = IA.schemaGemini(IA.SCHEMI.voci);
  assert.deepStrictEqual(s.properties.non_classificabile, { nullable: true, type: 'STRING' });
  assert.deepStrictEqual(s.propertyOrdering, ['merce', 'voci', 'non_classificabile']);
  assert.strictEqual(s.properties.voci.items.type, 'OBJECT');
  assert.ok(!('additionalProperties' in s));
  assert.deepStrictEqual(IA.estraiJson('```json\n{"a": [1, "}"]}\n```'), { a: [1, '}'] });
  assert.deepStrictEqual(IA.estraiJson('Ecco: {"x": "a\\"b{"} fine'), { x: 'a"b{' });
  assert.throws(() => IA.estraiJson('niente'), (e) => e.codice === 'invalid_json');
});

test('Claude: contesto in cache, risposta nello strumento, chiamata dal browser', async () => {
  const { s, chiamate } = servizio([{ corpo: { content: [{ type: 'tool_use', name: 'risposta', input: { ok: 1 } }], stop_reason: 'tool_use',
    usage: { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 90, cache_creation_input_tokens: 0 } } }]);
  const r = await s.chiedi(CLAUDE, { prompt: 'merce', contesto: 'voci ufficiali', livello: 'standard', schema: 'scelta' });
  assert.deepStrictEqual(r.risultato, { ok: 1 });
  assert.deepStrictEqual([r.tin, r.tout, r.tcache, r.modello], [100, 5, 90, 'claude-sonnet-5-5']);
  const c = chiamate[0];
  assert.strictEqual(c.url, 'https://api.anthropic.com/v1/messages');
  assert.strictEqual(c.intest['anthropic-dangerous-direct-browser-access'], 'true');
  assert.strictEqual(c.intest['x-api-key'], 'sk-ant');
  assert.deepStrictEqual(c.corpo.messages[0].content[0].cache_control, { type: 'ephemeral' });
  assert.strictEqual(c.corpo.messages[0].content[1].text, 'merce');
  assert.deepStrictEqual(c.corpo.tool_choice, { type: 'tool', name: 'risposta' });
});

test('Claude senza strumento se il servizio non lo accetta', async () => {
  const { s, chiamate } = servizio([{ stato: 400, corpo: { error: { message: 'tools: unsupported' } } },
                                    { corpo: { content: [{ type: 'text', text: '{"ok": true}' }], stop_reason: 'end_turn', usage: {} } }]);
  const r = await s.chiedi(CLAUDE, { prompt: 'x', livello: 'rapido', schema: 'voci' });
  assert.deepStrictEqual(r.risultato, { ok: true });
  assert.ok(chiamate[0].corpo.tools && !chiamate[1].corpo.tools && chiamate[1].corpo.model === 'claude-haiku-5-5');
});

test('Gemini: schema, contesto prima della merce, pensieri esclusi, ritorno senza schema', async () => {
  const { s, chiamate } = servizio([{ stato: 400, corpo: { error: { message: 'Invalid JSON payload: responseSchema' } } },
    { corpo: { candidates: [{ content: { parts: [{ text: 'penso', thought: true }, { text: '{"v": 1}' }] }, finishReason: 'STOP' }],
               usageMetadata: { promptTokenCount: 120, candidatesTokenCount: 30, thoughtsTokenCount: 50, cachedContentTokenCount: 100 } } }]);
  const r = await s.chiedi(GEMINI, { prompt: 'merce', contesto: 'ctx', livello: 'rapido', schema: 'voci' });
  assert.deepStrictEqual(r.risultato, { v: 1 });
  assert.deepStrictEqual([r.tin, r.tout, r.tcache], [120, 80, 100]);
  assert.strictEqual(chiamate[0].url, 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent');
  assert.deepStrictEqual(chiamate[0].corpo.contents[0].parts.map((p) => p.text), ['ctx', 'merce']);
  assert.ok(chiamate[0].corpo.generationConfig.responseSchema && !chiamate[1].corpo.generationConfig.responseSchema);
  assert.strictEqual(chiamate[0].intest['x-goog-api-key'], 'g-key');
});

test('compatibili OpenAI: json_schema, poi max_completion_tokens, poi json_object; Azure con api-key', async () => {
  const { s, chiamate } = servizio([
    { stato: 400, corpo: { error: { message: "Unsupported parameter: 'max_tokens'. Use 'max_completion_tokens' instead." } } },
    { stato: 400, corpo: { error: { message: 'response_format json_schema not supported' } } },
    { corpo: { choices: [{ message: { content: '{"ok": 2}' }, finish_reason: 'stop' }], usage: { prompt_tokens: 50, completion_tokens: 7, prompt_tokens_details: { cached_tokens: 40 } } } }]);
  const r = await s.chiedi(OPENAI, { prompt: 'merce', contesto: 'ctx', livello: 'standard', schema: 'scelta' });
  assert.deepStrictEqual([r.risultato, r.tin, r.tcache], [{ ok: 2 }, 50, 40]);
  assert.strictEqual(chiamate[0].url, 'https://risorsa.openai.azure.com/openai/v1/chat/completions');
  assert.strictEqual(chiamate[0].corpo.response_format.type, 'json_schema');
  assert.ok('max_completion_tokens' in chiamate[1].corpo && !('max_tokens' in chiamate[1].corpo));
  assert.strictEqual(chiamate[2].corpo.response_format.type, 'json_object');
  assert.strictEqual(chiamate[2].corpo.messages[1].content, 'ctx\n\nmerce');
  assert.deepStrictEqual([chiamate[0].intest['api-key'], chiamate[0].intest.authorization], ['az', 'Bearer az']);
});

test('nuovi tentativi: attesa indicata dal servizio, poi crescente; troppo lunga si dice subito', async () => {
  let x = servizio([{ stato: 529, corpo: {} }, { stato: 429, corpo: {}, intest: { 'retry-after': '7' } },
                    { corpo: { content: [{ type: 'text', text: '{"ok": 1}' }], usage: {} } }]);
  assert.deepStrictEqual((await x.s.chiedi(CLAUDE, { prompt: 'x', livello: 'rapido' })).risultato, { ok: 1 });
  assert.deepStrictEqual(x.attese, [2, 7]);
  x = servizio([{ stato: 429, corpo: {}, intest: { 'retry-after': '120' } }]);
  await assert.rejects(x.s.chiedi(CLAUDE, { prompt: 'x', livello: 'rapido' }), (e) => e.codice === 'rate_limited');
  assert.deepStrictEqual(x.attese, []);
  x = servizio([{ stato: 429, corpo: '{"error": {"details": [{"retryDelay": "3s"}]}}' }, { stato: 503, corpo: {} }, { stato: 503, corpo: {} }]);
  await assert.rejects(x.s.chiedi(GEMINI, { prompt: 'x', livello: 'rapido' }), (e) => e.codice === 'overloaded');
  assert.deepStrictEqual(x.attese, [3, 4]);
  x = servizio([new TypeError('Failed to fetch'), new TypeError('Failed to fetch'), new TypeError('Failed to fetch')]);
  await assert.rejects(x.s.chiedi(OPENAI, { prompt: 'x', livello: 'rapido' }), (e) => e.codice === 'irraggiungibile');
  assert.strictEqual(x.chiamate.length, 3);
});

test('errori dei servizi in codici comuni', async () => {
  const casi = [
    [{ stato: 401, corpo: { error: { message: 'invalid x-api-key' } } }, 'server_misconfigured'],
    [{ stato: 400, corpo: { error: { message: 'Your credit balance is too low' } } }, 'credito_esaurito'],
    [{ stato: 400, corpo: { error: { message: 'User location is not supported for the API use.' } } }, 'regione_non_supportata'],
    [{ stato: 404, corpo: { error: { message: 'model: claude-x not found' } } }, 'server_misconfigured'],
    [{ stato: 429, corpo: { error: { message: 'Quota exceeded: GenerateRequestsPerDayPerProjectPerModel' } } }, 'limite_giornaliero'],
    [{ stato: 400, corpo: { error: { message: 'prompt is too long: 300000 tokens' } } }, 'prompt_too_large'],
    [{ corpo: { content: [{ type: 'text', text: 'non posso' }], stop_reason: 'refusal', usage: { input_tokens: 5 } } }, 'refused'],
    [{ corpo: { content: [{ type: 'text', text: 'niente json' }], usage: {} } }, 'invalid_json'],
    [{ corpo: { content: [], usage: {} } }, 'empty_completion'],
  ];
  for (const [risposta, codice] of casi) {
    const { s } = servizio([risposta]);
    await assert.rejects(s.chiedi(CLAUDE, { prompt: 'x', livello: 'rapido' }), (e) => e.codice === codice, codice);
  }
  const { s } = servizio([]);
  await assert.rejects(s.chiedi(IA.configura({}), { prompt: 'x' }), (e) => e.codice === 'not_configured');
  await assert.rejects(s.chiedi(CLAUDE, { prompt: ' ', livello: 'rapido' }), (e) => e.codice === 'bad_request');
});

test('prova ed elenco dei modelli', async () => {
  let x = servizio([{ corpo: { choices: [{ message: { content: '{"ok": true}' } }], usage: { prompt_tokens: 3, completion_tokens: 2 } } }]);
  const r = await x.s.prova(OPENAI);
  assert.deepStrictEqual([r.risposta, r.modello], [{ ok: true }, 'gpt-classifica']);
  x = servizio([{ corpo: { content: [{ type: 'text', text: '{"ok": true}' }], usage: {} } }]);
  assert.strictEqual((await x.s.prova(CLAUDE, 'standard')).modello, 'claude-sonnet-5-5');
  assert.strictEqual(x.chiamate[0].corpo.model, 'claude-sonnet-5-5');
  x = servizio([{ corpo: { models: [{ name: 'models/gemini-3.7-flash', supportedGenerationMethods: ['generateContent'] },
                                    { name: 'models/text-embedding-9', supportedGenerationMethods: ['embedContent'] }] } }]);
  assert.deepStrictEqual(await x.s.modelli(GEMINI), ['gemini-3.7-flash']);
  assert.strictEqual(x.chiamate[0].url, 'https://generativelanguage.googleapis.com/v1beta/models?pageSize=200');
  x = servizio([{ corpo: { data: [{ id: 'claude-sonnet-5-5' }, { id: 'claude-haiku-5-5' }, { id: 'claude-haiku-5-5' }] } }]);
  assert.deepStrictEqual(await x.s.modelli(CLAUDE), ['claude-haiku-5-5', 'claude-sonnet-5-5']);
  assert.strictEqual(x.chiamate[0].url, 'https://api.anthropic.com/v1/models?limit=100');
});
