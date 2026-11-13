// Prova nel browser del programma sul PC, in uso autonomo: primo avvio senza dati (arrivano dal finto GitHub), IA scelta
// in Impostazioni, nuova versione scaricata da sola, classificazione, telefono e tema scuro, chiusura.
// Uso: python tests/finto_claude.py 9100 dati-AAAA-MM-01.zip &
//      TARIC_AGGIORNAMENTI_URL=http://127.0.0.1:9100/github/releases/latest TARIC_DATI_URL=http://127.0.0.1:9100/github/releases/tags/dati \
//        python -m taric.programma --cartella P --senza-browser &
//      poi  node tests/e2e_locale.js P/istanza.json cartella-schermate
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const fs = require('fs');
const istanza = process.argv[2] || '/tmp/loc/istanza.json';
const out = process.argv[3] || 'shots-locale';
fs.mkdirSync(out, { recursive: true });
const info = JSON.parse(fs.readFileSync(istanza, 'utf8'));
const B = 'http://127.0.0.1:' + info.porta;
let errori = [];
function ok(c, m) { if (!c) { errori.push(m); console.log('ERRORE: ' + m); } else console.log('ok: ' + m); }
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1280, height: 860 }, colorScheme: 'light' });
  const p = await ctx.newPage();
  p.on('pageerror', e => errori.push('errore JS: ' + e.message));
  p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errori.push('console: ' + m.text()); });
  await p.goto(B + '/');
  ok(await p.isVisible('text=Apri MAGIC HS dal suo collegamento'), 'senza chiave: pagina con le istruzioni');
  await p.goto(B + '/entra?k=' + info.chiave);
  // primo avvio: i dati arrivano da GitHub (forse sono gia' pronti), poi la pagina si apre da sola
  if (await p.isVisible('text=Preparazione dei dati TARIC')) { await p.screenshot({ path: out + '/0-attesa.png' }); ok(true, 'pagina d\'attesa dei dati'); }
  await p.waitForSelector('#vai', { timeout: 60000 });
  await p.waitForFunction(() => document.getElementById('dato').textContent.length > 0);
  ok(await p.isVisible('#tab-gestione') && (await p.textContent('#tab-gestione')).trim() === 'Impostazioni', 'scheda Impostazioni');
  ok((await p.inputValue('#q')) === '' && (await p.innerHTML('#esito')).trim() === '', 'all\'apertura nessuna ricerca d\'esempio');
  ok(!(await p.$('#esempi')) && !(await p.$('[data-act="prova"]')) && !(await p.$('#gestisco-io')), 'nessun suggerimento, nessuna proposta di gestione');
  ok((await p.getAttribute('#esci', 'title')) === 'Chiudi MAGIC HS', 'pulsante Chiudi al posto di Esci');
  await p.fill('#q', 'trapano'); await p.click('#vai');
  await p.waitForSelector('text=scegli un servizio di intelligenza artificiale in Impostazioni');
  ok(true, 'senza IA: dove sceglierla');
  await p.screenshot({ path: out + '/1-classifica-senza-ia.png' });
  await p.fill('#q', '');
  // la nuova versione si scarica da sola: puntino sulla scheda Impostazioni
  await p.waitForFunction(() => document.getElementById('tab-gestione').classList.contains('novita'), null, { timeout: 30000 });
  ok(true, 'puntino sulla scheda Impostazioni: nuova versione pronta');
  await p.click('#tab-gestione');
  await p.waitForSelector('form[data-g="ia-locale"]');
  ok(!(await p.isVisible('text=cartella condivisa')) && !(await p.isVisible('text=colleghi')) && !(await p.isVisible('text=per tutti')), 'niente cartella condivisa né colleghi');
  ok(await p.isVisible('text=MAGIC HS 9.9.9 è pronto'), 'avviso: chiudi e riapri per la nuova versione');
  await p.selectOption('select[name=fornitore]', 'openai');
  await p.waitForSelector('input[name=url]');
  ok(!(await p.$('input[name=quota]')), 'niente limite mensile');
  await p.fill('input[name=url]', 'http://127.0.0.1:9100/v1');
  await p.fill('input[name=modello]', 'finto-modello');
  await p.fill('input[name=chiave]', 'chiave-finta-1234');
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
  ok(await p.isVisible('text=La chiave resta su questo PC'), 'nota sulla chiave protetta');
  await p.click('button[data-g="prova-ia"]');
  await p.waitForSelector('text=Il servizio risponde', { timeout: 15000 });
  await p.click('button[data-g="modelli-ia"]');
  await p.waitForSelector('text=2 modelli disponibili');
  ok(await p.$$eval('#modelli-ia option', o => o.map(x => x.value).join(',')) === 'finto-modello,finto-modello-rapido', 'elenco dei modelli dal servizio');
  ok(await p.isVisible('text=Uso su questo PC'), 'uso del mese');
  await p.screenshot({ path: out + '/2-ia.png', fullPage: true });
  await p.click('button[data-v="programma"]');
  await p.waitForSelector('text=È pronta la versione 9.9.9');
  ok(await p.isVisible('text=MAGIC HS ' + info.versione), 'versione in uso');
  await p.screenshot({ path: out + '/3-programma.png', fullPage: true });
  await p.click('button[data-v="dati"]');
  await p.waitForSelector('text=Dati in uso');
  ok(await p.isVisible('text=arrivano da soli, pronti da GitHub'), 'dati del mese da GitHub');
  ok(await p.isVisible('td >> text=Dati pronti da GitHub'), 'primo aggiornamento dai dati pronti');
  await p.screenshot({ path: out + '/4-dati.png', fullPage: true });
  await p.click('button[data-v="registro"]');
  await p.waitForSelector('text=Nuova versione del programma scaricata');
  ok(await p.isVisible('text=Intelligenza artificiale cambiata'), 'registro degli eventi');
  // classificazione con il servizio appena scelto
  await p.click('#tab-classifica');
  await p.fill('#q', 'trapano a percussione elettrico'); await p.click('#vai');
  await p.waitForFunction(() => document.querySelector('.timbro') && document.querySelector('.timbro').textContent.includes('Proposta'), null, { timeout: 20000 });
  ok(true, 'classificazione con l\'IA');
  await p.click('#tab-profilo');
  await p.waitForSelector('text=Il tuo nome');
  ok(!(await p.isVisible('text=Cambia password')), 'niente password nel profilo');
  ok(!(await p.isVisible('text=limite')), 'nessun limite mensile nel profilo');
  await p.waitForSelector('.voce >> text=trapano a percussione elettrico', { timeout: 8000 });
  ok(await p.isVisible('text=1 classificazione a'), 'la classificazione è nello storico e conta una volta sola');
  await p.screenshot({ path: out + '/5-profilo.png', fullPage: true });
  // riaperto dopo una classificazione: ancora nessun campo compilato né ricerche recenti proposte
  await p.goto(B + '/'); await p.waitForSelector('#vai');
  await p.waitForFunction(() => document.getElementById('dato').textContent.length > 0);
  ok((await p.inputValue('#q')) === '' && (await p.innerHTML('#esito')).trim() === '' && !(await p.$('[data-act="prova"]')), 'riaperto: casella vuota, niente recenti');
  await p.screenshot({ path: out + '/5b-classifica-vuota.png' });
  // telefono, tema scuro
  const t = await b.newContext({ viewport: { width: 390, height: 844 }, colorScheme: 'dark', deviceScaleFactor: 2 });
  const q = await t.newPage();
  q.on('pageerror', e => errori.push('errore JS (tel): ' + e.message));
  await q.goto(B + '/entra?k=' + info.chiave);
  await q.waitForSelector('#tab-gestione:not([hidden])', { state: 'attached' });
  await q.goto(B + '/#gestione'); await q.waitForSelector('form[data-g="ia-locale"]');
  await q.screenshot({ path: out + '/6-tel-ia.png', fullPage: true });
  await q.click('button[data-v="programma"]'); await q.waitForSelector('text=È pronta la versione 9.9.9');
  await q.screenshot({ path: out + '/7-tel-programma.png', fullPage: true });
  // chiusura dal pulsante
  await p.click('#esci');
  await p.waitForSelector('text=MAGIC HS è chiuso');
  ok(await p.isVisible('text=Puoi chiudere questa scheda'), 'chiuso dal pulsante');
  await p.screenshot({ path: out + '/8-chiuso.png' });
  // l'altra scheda si accorge che il programma non c'è più
  await new Promise(r => setTimeout(r, 2500));
  await q.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await q.waitForSelector('text=MAGIC HS è chiuso', { timeout: 8000 });
  ok(await q.isVisible('text=non lo usavi da un po'), 'scheda aperta: avviso di programma chiuso');
  await q.screenshot({ path: out + '/9-tel-chiuso.png' });
  await b.close();
  console.log(errori.length ? 'ERRORI:\n' + errori.join('\n') : 'tutto ok');
  process.exit(errori.length ? 1 : 0);
})();
