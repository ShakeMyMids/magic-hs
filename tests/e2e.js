/* Collaudo end-to-end nel browser: configurazione, gestione utenti, classificazione, profilo, registrazione.
   Uso: node tests/e2e.js http://127.0.0.1:8765 <cartella dati> <cartella screenshot>
   Richiede un server collegato al finto servizio IA di tests/finto_claude.py (vedi README, sezione Sviluppo). */
const { chromium } = require(process.env.PLAYWRIGHT || '/opt/npm-tools/node_modules/playwright');
const fs = require('fs');
const path = require('path');
const [base, dati, out] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const errori = [];
let passi = 0;
function ok(cond, cosa) { if (!cond) throw new Error('FALLITO: ' + cosa); passi++; console.log('  ok', cosa); }

async function nuovaPagina(browser, opzioni) {
  const ctx = await browser.newContext(Object.assign({ viewport: { width: 1180, height: 860 } }, opzioni || {}));
  const p = await ctx.newPage();
  p.on('pageerror', e => errori.push('pageerror: ' + e.message));
  p.on('console', m => { if (m.type() === 'error' && !/401|403|429|Failed to load resource/.test(m.text())) errori.push('console: ' + m.text()); });
  return p;
}
const testo = async (p, sel) => (await p.textContent(sel)) || '';

(async () => {
  const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });

  console.log('1. configurazione iniziale');
  const a = await nuovaPagina(browser);
  await a.goto(base + '/');
  ok(a.url().endsWith('/configura'), 'il primo accesso porta alla configurazione');
  const codice = fs.readFileSync(path.join(dati, 'codice-configurazione.txt'), 'utf8').trim();
  await a.fill('[name=codice]', 'SBAGLIATO');
  await a.fill('[name=nome]', 'Simone Amministratore'); await a.fill('[name=email]', 'admin@esempio.it');
  await a.fill('[name=password]', 'Password-Admin-1'); await a.fill('[name=ripeti]', 'Password-Admin-1');
  await a.click('button[type=submit]'); await a.waitForSelector('#esito .errore');
  ok((await testo(a, '#esito')).includes('Codice di configurazione non corretto'), 'codice sbagliato rifiutato');
  await a.fill('[name=codice]', codice);
  await a.click('button[type=submit]');
  await a.waitForURL(/#gestione$/); await a.waitForSelector('#view-gestione .sotto');
  ok(await a.isVisible('#tab-gestione'), 'scheda Gestione visibile all\'amministratore');
  ok((await testo(a, '#chi-nome')) === 'Simone Amministratore', 'nome nell\'intestazione');
  await a.waitForSelector('#view-gestione .avviso');
  ok((await testo(a, '#view-gestione')).includes('La posta non è configurata'), 'avviso posta non configurata');
  await a.screenshot({ path: out + '/01-gestione.png', fullPage: true });

  console.log('2. nuovo utente creato dall\'amministratore');
  await a.fill('form[data-g=crea] [name=nome]', 'Luca Bianchi'); await a.fill('form[data-g=crea] [name=email]', 'luca@esempio.it');
  await a.fill('form[data-g=crea] [name=quota]', '10');
  await a.click('form[data-g=crea] button[type=submit]');
  await a.waitForSelector('.link-pronto input');
  const link = await a.inputValue('.link-pronto input');
  ok(/\/reimposta-password#/.test(link), 'link per la password mostrato');
  const l = await nuovaPagina(browser);
  await l.goto(link);
  ok(!l.url().includes('#'), 'il gettone sparisce dalla barra degli indirizzi');
  await l.fill('[name=password]', 'Password-Luca-1'); await l.fill('[name=ripeti]', 'Password-Luca-1');
  await l.click('button[type=submit]');
  await l.waitForURL(base + '/'); await l.waitForSelector('#chi-nome:text("Luca Bianchi")');
  ok(await l.isHidden('#tab-gestione'), 'Gestione nascosta all\'utente');
  ok((await testo(l, '#ia-nome')).length > 3, 'nome del servizio IA nel piè di pagina (' + (await testo(l, '#ia-nome')).trim() + ')');

  console.log("3. classificazione con l'IA (finta) e storico");
  ok((await testo(l, '#esito')).includes('Esempio') || (await testo(l, '#esito')).length > 0, 'esempio al primo utilizzo');
  await l.fill('#q', 'scarpe da ginnastica con tomaia in pelle');
  await l.click('#vai');
  await l.waitForFunction(() => document.querySelector('.timbro') && document.querySelector('.timbro').textContent.includes('Proposta'), null, { timeout: 15000 });
  const cel = (await l.$$eval('.cel .v', els => els.map(e => e.textContent.replace(/\s/g, '')))).join('');
  ok(cel === '6403999610', 'codice proposto 6403 99 96 10 (' + cel + ')');
  await l.waitForSelector('.riep', { timeout: 15000 });
  ok((await testo(l, '#esito')).includes('Misure TARIC al'), 'misure caricate dal server');
  await l.click('[data-act=preferito]');
  await l.waitForSelector('[data-act=preferito][aria-pressed=true]');
  ok(true, 'aggiunto ai preferiti');
  await l.screenshot({ path: out + '/02-classifica.png', fullPage: false });
  // risposta a una domanda: nuova richiesta con le informazioni aggiunte
  await l.click('[data-act=pick][data-k="0"][data-n="0"]');
  await l.click('[data-act=riclassifica]');
  await l.waitForFunction(() => document.querySelector('.timbro') && /confidenza alta/.test(document.querySelector('.timbro').textContent), null, { timeout: 15000 });
  ok(true, 'riclassificazione dopo la risposta');

  console.log('4. profilo: storico, preferiti, preferenze, uso IA');
  await l.click('#tab-profilo');
  await l.waitForSelector('#view-profilo .voce');
  const prof = await testo(l, '#view-profilo');
  ok(prof.includes('scarpe da ginnastica con tomaia in pelle'), 'classificazione nello storico');
  ok(/\b[3-6] su 10 richieste/.test(prof.replace(/(\d{4})(\d)/g, "$1 $2")), "contatore richieste IA");
  ok(prof.includes('6403 99 96 10'), 'preferito con codice');
  await l.fill('form[data-p=nota] [name=nota]', 'cliente Rossi, articolo 455');
  await l.click('form[data-p=nota] button');
  await l.waitForSelector('.toast:text("Nota salvata.")');
  await l.selectOption('select[name=paese]', 'CN');
  await l.waitForSelector('.toast:text("Preferenza salvata.")');
  await l.screenshot({ path: out + '/03-profilo.png', fullPage: true });
  await l.click('[data-p=apri-storico]');
  await l.waitForSelector('#view-classifica:not([hidden]) .timbro');
  ok((await l.inputValue('#paese')) === 'CN', 'il paese preferito vale nel risultato');
  ok((await testo(l, '#esito')).includes('Cina'), 'misure per la Cina');
  // ricarico la pagina: preferiti e paese restano (sono sul server)
  await l.reload(); await l.waitForSelector('#chi-nome:text("Luca Bianchi")');
  await l.fill('#q', '6403 99 96 10'); await l.click('#vai');
  await l.waitForSelector('[data-act=preferito][aria-pressed=true]');
  ok((await l.inputValue('#paese')) === 'CN', 'preferenze conservate dopo il ricaricamento');

  console.log('5. nomenclatura e limite IA');
  await l.click('#tab-nomenclatura'); await l.fill('#nq', 'biciclette'); await l.waitForTimeout(500);
  ok((await l.$$('.trow:not(.info)')).length > 3, 'ricerca nella nomenclatura');

  console.log('6. registrazione automatica e approvazione');
  const r = await nuovaPagina(browser, { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  await r.goto(base + '/accedi');
  await r.waitForSelector('#link-registrati:not([hidden])');
  await r.click('#link-registrati');
  await r.waitForURL(/registrati/);
  await r.fill('[name=nome]', 'Giulia Verdi'); await r.fill('[name=azienda]', 'Verdi Import Srl'); await r.fill('[name=email]', 'giulia@verdi.it');
  await r.fill('[name=password]', 'Password-Giulia-1'); await r.fill('[name=ripeti]', 'Password-Giulia-1');
  await r.fill('[name=richiesta]', 'Classificazione di ricambi auto');
  await r.check('[name=consenso]');
  await r.waitForTimeout(3300);   // il modulo firmato vale solo dopo qualche secondo (contro i bot)
  await r.screenshot({ path: out + '/04-registrati-mobile.png', fullPage: true });
  await r.click('button[type=submit]');
  await r.waitForSelector('#esito .esito-ok');
  ok((await testo(r, '#esito')).includes('amministratore'), 'richiesta registrata, in attesa');
  await r.goto(base + '/accedi');
  await r.fill('[name=email]', 'giulia@verdi.it'); await r.fill('[name=password]', 'Password-Giulia-1');
  await r.click('button[type=submit]'); await r.waitForSelector('#esito .errore');
  ok((await testo(r, '#esito')).includes('in attesa di approvazione'), 'non entra prima dell\'approvazione');
  await a.reload(); await a.waitForSelector('[data-g=approva]');
  ok((await testo(a, '#view-gestione')).includes('Giulia Verdi'), 'richiesta visibile all\'amministratore');
  await a.click('[data-g=approva]');
  await a.waitForSelector('.esito-ok:text("Richiesta approvata")');
  await r.click('button[type=submit]');
  await r.waitForURL(base + '/');
  await r.waitForSelector('#chi-nome:text("Giulia Verdi")');
  ok(true, 'dopo l\'approvazione entra');
  await r.screenshot({ path: out + '/05-classifica-mobile.png', fullPage: false });

  console.log('7. gestione: regole, dati, uso, registro, posta, limite');
  await a.click('[data-g=sotto][data-v=regole]'); await a.waitForSelector('form[data-g=regole]');
  await a.fill('[name=domini_approvati]', 'esempio.it\nverdi.it');
  await a.click('form[data-g=regole] button[type=submit]'); await a.waitForSelector('.esito-ok:text("Regole salvate.")');
  await a.click('[data-g=sotto][data-v=dati]'); await a.waitForSelector('text=Versioni installate');
  ok((await testo(a, '#view-gestione')).includes('Situazione al 01/11/2026'), 'versione dati in uso');
  await a.click('[data-g=riepilogo]'); await a.waitForSelector('pre.registro');
  ok((await testo(a, 'pre.registro')).includes('Verifica riga per riga: superata'), 'riepilogo della versione');
  await a.screenshot({ path: out + '/06-dati.png', fullPage: true });
  await a.click('[data-g=sotto][data-v=uso]'); await a.waitForSelector('text=Token in');
  ok((await testo(a, '#view-gestione')).includes('luca@esempio.it'), 'uso IA per utente');
  await a.click('[data-g=sotto][data-v=registro]'); await a.waitForSelector('#view-gestione table.tab td');
  const reg = await testo(a, '#view-gestione');
  ok(reg.includes('Approvato') && reg.includes('Nuova registrazione') && reg.includes('Utente creato'), 'registro eventi');
  await a.click('[data-g=sotto][data-v=posta]'); await a.waitForSelector('#view-gestione details');
  ok((await testo(a, '#view-gestione')).includes('nuova richiesta di accesso da Giulia Verdi'), 'email in uscita visibile');
  // limite IA dell'utente a 0: niente classificazione assistita
  await a.click('[data-g=sotto][data-v=utenti]'); await a.waitForSelector('[data-g=apri]');
  await a.waitForTimeout(300);
  await a.locator('tbody tr', { hasText: 'luca@esempio.it' }).locator('[data-g=apri]').click();
  await a.waitForSelector('form[data-g=modifica]');
  await a.fill('form[data-g=modifica] [name=quota]', '0'); await a.click('form[data-g=modifica] button[type=submit]');
  await a.waitForSelector('.esito-ok:text("Modifiche salvate.")');
  await l.goto(base + '/#classifica'); await l.reload(); await l.waitForSelector('#msg .avviso');
  ok((await testo(l, '#msg')).includes('non è abilitata per il tuo account'), 'limite IA a zero applicato');

  console.log('8. uscita e accesso errato');
  await l.click('#esci'); await l.waitForURL(/accedi/);
  await l.fill('[name=email]', 'luca@esempio.it'); await l.fill('[name=password]', 'sbagliata-xyz');
  await l.click('button[type=submit]'); await l.waitForSelector('#esito .errore');
  ok((await testo(l, '#esito')).includes('Email o password non corretti'), 'messaggio di accesso errato');
  const anon = await nuovaPagina(browser);   // contesto nuovo: niente cache del browser
  const resp = await anon.goto(base + '/data/2026-11-01/nomenclatura.js');
  ok(resp.status() === 401, 'dati non accessibili senza sessione');

  console.log('9. telefono, tema scuro');
  const m = await nuovaPagina(browser, { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, colorScheme: 'dark' });
  await m.goto(base + '/accedi');
  await m.fill('[name=email]', 'admin@esempio.it'); await m.fill('[name=password]', 'Password-Admin-1'); await m.click('button[type=submit]');
  await m.waitForURL(base + '/'); await m.waitForSelector('#chi-nome:text("Simone")');
  ok(await m.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'nessuno scorrimento orizzontale su telefono');
  await m.screenshot({ path: out + '/07-mobile-scuro.png', fullPage: false });
  await m.click('#tab-gestione'); await m.waitForSelector('#view-gestione .sotto');
  await m.waitForTimeout(400);
  await m.screenshot({ path: out + '/08-gestione-mobile.png', fullPage: true });
  await m.click('#tab-profilo'); await m.waitForSelector('#view-profilo form');
  await m.screenshot({ path: out + '/09-profilo-mobile.png', fullPage: true });

  await browser.close();
  console.log(`\n${passi} controlli superati`);
  if (errori.length) { console.log('ERRORI NEL BROWSER:\n' + errori.join('\n')); process.exit(1); }
  console.log('nessun errore nel browser');
})().catch(e => { console.error(e); console.log('ERRORI NEL BROWSER:\n' + errori.join('\n')); process.exit(1); });
