// Prova nel browser della versione sito: niente programma sul PC, tutto nel browser. IA finta su un altro indirizzo
// (chiamate dal browser con CORS, come i servizi veri), storico e preferiti che restano dopo il ricaricamento,
// esporta e importa, i tre fornitori, uso senza rete (service worker), telefono e tema scuro.
// Uso: python strumenti/sito.py --uscita P/magic-hs dati-AAAA-MM-01.zip
//      python tests/finto_claude.py 9100 &      python -m http.server 8800 --bind 127.0.0.1 --directory P &
//      node tests/e2e_sito.js http://localhost:8800/magic-hs/ cartella-schermate
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const fs = require('fs');
const SITO = process.argv[2] || 'http://localhost:8800/magic-hs/';
const out = process.argv[3] || 'shots-sito';
const IA = 'http://127.0.0.1:9100';
fs.mkdirSync(out, { recursive: true });
let errori = [];
function ok(c, m) { if (!c) { errori.push(m); console.log('ERRORE: ' + m); } else console.log('ok: ' + m); }
async function ricarica(p) {
  await p.reload();
  await p.waitForFunction(() => document.getElementById('dato') && document.getElementById('dato').textContent.length > 0);
}
async function classifica(p, testo) {
  await p.click('#tab-classifica');
  await p.fill('#q', testo); await p.click('#vai');
  await p.waitForFunction(() => document.querySelector('.timbro') && document.querySelector('.timbro').textContent.includes('Proposta'), null, { timeout: 30000 });
}
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1280, height: 860 }, colorScheme: 'light', acceptDownloads: true });
  const p = await ctx.newPage();
  p.on('pageerror', e => errori.push('errore JS: ' + e.message));
  p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errori.push('console: ' + m.text()); });
  p.on('dialog', d => d.accept());

  // apertura: niente chiave d'ingresso, niente pulsante Chiudi
  await p.goto(SITO);
  await p.waitForSelector('#vai');
  await p.waitForFunction(() => document.getElementById('dato').textContent.length > 0);
  ok((await p.textContent('#tab-gestione')).trim() === 'Impostazioni' && await p.isVisible('#tab-gestione'), 'scheda Impostazioni');
  ok(await p.isHidden('#esci'), 'nessun pulsante Chiudi nel sito');
  ok((await p.textContent('#chi-nome')) === 'Utente', 'nome predefinito');
  ok((await p.inputValue('#q')) === '' && (await p.innerHTML('#esito')).trim() === '', 'all\'apertura nessuna ricerca d\'esempio');
  await p.fill('#q', 'trapano'); await p.click('#vai');
  await p.waitForSelector('text=scegli un servizio di intelligenza artificiale in Impostazioni');
  ok(true, 'senza IA: dove sceglierla');
  await p.screenshot({ path: out + '/1-classifica.png' });

  // impostazioni: servizio compatibile OpenAI su un altro indirizzo
  await p.click('#tab-gestione');
  await p.waitForSelector('form[data-g="ia-locale"]');
  ok((await p.$$('.sotto button')).length === 2 && !(await p.isVisible('text=Registro')), 'solo IA e dati TARIC nelle impostazioni');
  ok(await p.isVisible('text=La chiave resta in questo browser'), 'nota sulla chiave nel browser');
  await p.selectOption('select[name=fornitore]', 'openai');
  await p.fill('input[name=url]', IA + '/v1');
  await p.fill('input[name=modello]', 'finto-modello');
  await p.fill('input[name=chiave]', 'chiave-sbagliata-1234');
  await p.click('form[data-g="ia-locale"] button[type=submit]');
  await p.waitForSelector('text=Salvato: ');
  await p.click('button[data-g="prova-ia"]');
  await p.waitForSelector('text=Il servizio rifiuta la chiave', { timeout: 15000 });
  ok(true, 'chiave sbagliata: messaggio chiaro');
  await p.click('button[data-g="cambia-chiave"]');
  await p.fill('input[name=chiave]', 'chiave-finta');
  await p.click('form[data-g="ia-locale"] button[type=submit]');
  await p.waitForSelector('text=Salvato: ');
  ok(await p.isVisible('text=Chiave salvata: …inta'), 'chiave mascherata');
  await p.click('button[data-g="prova-ia"]');
  await p.waitForSelector('text=Il servizio risponde', { timeout: 15000 });
  await p.click('button[data-g="modelli-ia"]');
  await p.waitForSelector('text=2 modelli disponibili');
  ok(true, 'prova del servizio ed elenco dei modelli dal browser');
  await p.screenshot({ path: out + '/2-ia.png', fullPage: true });
  await p.click('button[data-v="dati"]');
  await p.waitForSelector('text=Versioni sul sito');
  ok(await p.isVisible('text=Arrivano da soli con il sito'), 'dati dal sito');
  await p.click('button[data-g="riepilogo"]');
  await p.waitForSelector('pre.registro');
  ok((await p.textContent('pre.registro')).length > 100, 'riepilogo della versione');
  await p.screenshot({ path: out + '/3-dati.png', fullPage: true });

  // classificazione, preferito, storico
  await classifica(p, 'trapano a percussione elettrico');
  ok(true, 'classificazione con l\'IA dal browser');
  await p.click('button[data-act="preferito"]');
  await p.waitForSelector('button[data-act="preferito"][aria-pressed="true"]');
  await p.click('#tab-profilo');
  await p.waitForSelector('.voce >> text=trapano a percussione elettrico', { timeout: 8000 });
  ok(await p.isVisible('text=1 classificazione a'), 'uso del mese nel profilo');
  // tutto resta dopo il ricaricamento
  await ricarica(p);
  await p.click('#tab-profilo');
  await p.waitForSelector('.voce >> text=trapano a percussione elettrico', { timeout: 8000 });
  ok((await p.$$('[data-p="togli-preferito"]')).length === 1, 'storico e preferito restano nel browser');
  await p.fill('input[name=nome]', 'Mario Rossi'); await p.click('form[data-p="salva-account"] button[type=submit]');
  await p.waitForSelector('text=Dati salvati.');
  // esporta, svuota, importa
  const [scarico] = await Promise.all([p.waitForEvent('download'), p.click('button[data-p="esporta"]')]);
  const file = out + '/esportazione.json';
  await scarico.saveAs(file);
  const esportato = JSON.parse(fs.readFileSync(file, 'utf8'));
  ok(esportato.formato === 'magic-hs' && esportato.storico.length === 1 && esportato.preferiti.length === 1 && esportato.profilo.nome === 'Mario Rossi', 'esportazione');
  await p.click('button[data-p="svuota"]');
  await p.waitForSelector('text=Ancora nessuna classificazione.');
  await p.click('button[data-p="togli-preferito"]');
  await p.waitForSelector('text=Nessuna voce preferita.');
  await p.setInputFiles('input[data-p="importa"]', file);
  await p.waitForSelector('text=Importate 1 classificazione e 1 preferito.');
  await p.waitForSelector('.voce >> text=trapano a percussione elettrico');
  ok((await p.$$('[data-p="togli-preferito"]')).length === 1, 'importazione di storico e preferiti');
  await p.setInputFiles('input[data-p="importa"]', file);
  await p.waitForSelector('text=Importate 0 classificazioni e 0 preferiti.');
  ok(true, 'importare due volte non duplica');
  await p.screenshot({ path: out + '/4-profilo.png', fullPage: true });

  // gli altri due fornitori, con la risposta nello strumento (Claude) e nello schema (Gemini)
  for (const [nome, ia] of [['Claude', { fornitore: 'anthropic', chiave: 'chiave-finta', url: IA + '/v1/messages' }],
                            ['Gemini', { fornitore: 'gemini', chiave: 'chiave-finta', url: IA + '/v1beta' }]]) {
    await p.evaluate(v => localStorage.setItem('magic-hs.ia', JSON.stringify(v)), ia);
    await ricarica(p);
    await classifica(p, 'scarpe sportive ' + nome);
    ok(true, 'classificazione con ' + nome);
  }

  // senza rete: l'app si apre lo stesso (service worker)
  const pronto = await p.evaluate(() => navigator.serviceWorker.ready.then(r => !!r.active));
  ok(pronto, 'service worker attivo');
  await ricarica(p);                // ora i dati passano dal service worker
  await p.waitForTimeout(500);
  await ctx.setOffline(true);
  await ricarica(p);
  await p.waitForFunction(() => document.getElementById('dato').textContent.length > 0);
  await p.click('#tab-nomenclatura'); await p.fill('#nq', '8467');
  await p.waitForSelector('#albero >> text=8467');
  ok(true, 'senza rete: app e nomenclatura disponibili');
  await ctx.setOffline(false);

  // telefono e tema scuro
  const t = await b.newContext({ viewport: { width: 390, height: 844 }, colorScheme: 'dark', deviceScaleFactor: 2 });
  const q = await t.newPage();
  q.on('pageerror', e => errori.push('errore JS (tel): ' + e.message));
  await q.goto(SITO + '#gestione'); await q.waitForSelector('form[data-g="ia-locale"]');
  await q.screenshot({ path: out + '/5-tel-ia.png', fullPage: true });
  await q.goto(SITO + '#profilo'); await q.waitForSelector('text=I tuoi dati');
  await q.screenshot({ path: out + '/6-tel-profilo.png', fullPage: true });
  await b.close();
  console.log(errori.length ? 'ERRORI:\n' + errori.join('\n') : 'tutto ok');
  process.exit(errori.length ? 1 : 0);
})();
