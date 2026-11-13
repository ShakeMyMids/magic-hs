// Prova nel browser del sito (modalità server, come su Render): l'amministratore si registra ed entra, un collega chiede
// l'account e aspetta l'approvazione, classificazioni fino al limite mensile, link per la password, sospensione, uscita,
// telefono e tema scuro. IA finta (tests/finto_claude.py) come servizio unico del server.
// Uso: python tests/finto_claude.py 9100 dati-AAAA-MM-01.zip &
//      TARIC_DATI=P MAGIC_HS_AMMINISTRATORI=capo@azienda.it TARIC_IA_FORNITORE=openai TARIC_IA_URL=http://127.0.0.1:9100/v1 \
//        TARIC_IA_MODELLO=finto-modello TARIC_IA_CHIAVE=chiave-finta TARIC_DATI_URL=http://127.0.0.1:9100/github/releases/tags/dati \
//        python -m taric server --porta 8810 &
//      node tests/e2e_sito.js http://localhost:8810 cartella-schermate
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const fs = require('fs');
const B = process.argv[2] || 'http://localhost:8810';
const out = process.argv[3] || 'shots-sito';
fs.mkdirSync(out, { recursive: true });
const errori = [];
function ok(c, m) { if (!c) { errori.push(m); console.log('ERRORE: ' + m); } else console.log('ok: ' + m); }
function attenzione(p, nome) {
  p.on('pageerror', e => errori.push(nome + ' errore JS: ' + e.message));
  p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errori.push(nome + ' console: ' + m.text()); });
  p.on('dialog', d => d.accept(''));
}
async function pronta(p) { await p.waitForFunction(() => document.getElementById('dato') && document.getElementById('dato').textContent.length > 0, null, { timeout: 30000 }); }
async function classifica(p, testo) {
  await p.click('#tab-classifica');
  await p.fill('#q', testo); await p.click('#vai');
}
async function richiedi(p, nome, email, password, messaggio) {
  await p.goto(B + '/accedi#richiedi');
  await p.waitForSelector('#richiedi:not([hidden])');
  await p.fill('#richiedi input[name=nome]', nome);
  await p.fill('#richiedi input[name=email]', email);
  await p.fill('#richiedi input[name=password]', password);
  if (messaggio) await p.fill('#richiedi textarea[name=richiesta]', messaggio);
  await p.waitForTimeout(3300);                       // il modulo firmato vale dopo qualche secondo (contro i bot)
  await p.click('#richiedi button[type=submit]');
}
async function accedi(p, email, password) {
  await p.goto(B + '/accedi');
  await p.fill('#accedi input[name=email]', email);
  await p.fill('#accedi input[name=password]', password);
  await p.click('#accedi button[type=submit]');
}

(async () => {
  const b = await chromium.launch();
  const ca = await b.newContext({ viewport: { width: 1280, height: 860 }, colorScheme: 'light' });
  const capo = await ca.newPage(); attenzione(capo, 'capo');

  // pagina d'accesso; l'amministratore (MAGIC_HS_AMMINISTRATORI) si registra ed entra subito
  await capo.goto(B + '/');
  await capo.waitForSelector('#accedi');
  ok(capo.url().endsWith('/accedi'), 'senza account: pagina d\'accesso');
  await capo.screenshot({ path: out + '/0-accedi.png' });
  await richiedi(capo, 'Mario Capo', 'capo@azienda.it', 'Porto-Container-42');
  await pronta(capo);
  ok(await capo.isVisible('#tab-gestione') && (await capo.textContent('#tab-gestione')).trim() === 'Gestione', 'amministratore dentro, scheda Gestione');
  ok((await capo.getAttribute('#esci', 'title')) === 'Esci', 'pulsante Esci');
  await capo.click('#tab-gestione');
  await capo.waitForSelector('button[data-g="u-apri"]');
  ok((await capo.$$('button[data-g="u-apri"]')).length === 1 && await capo.isVisible('td >> text=capo@azienda.it'), 'in Utenti c\'è l\'amministratore');
  ok((await capo.$$('.sotto button')).length === 4, 'Utenti, IA, Dati TARIC, Registro');
  await capo.click('button[data-v="ia"]');
  await capo.waitForSelector('form[data-g="s-limiti"]');
  ok(await capo.isVisible('text=finto-modello'), 'IA unica del server attiva');
  await capo.click('button[data-g="s-prova"]');
  await capo.waitForSelector('.finestra.festa', { timeout: 20000 });
  await capo.waitForTimeout(5000);
  await capo.screenshot({ path: out + '/1-festa.png' });
  await capo.click('.festa [data-f="chiudi"]');
  await capo.fill('input[name=quota_predefinita]', '2');
  await capo.click('form[data-g="s-limiti"] button[type=submit]');
  await capo.waitForSelector('form[data-g="s-limiti"] >> text=Salvato.');
  ok(true, 'limite mensile per persona: 2');
  await capo.screenshot({ path: out + '/2-ia.png', fullPage: true });

  // un collega chiede l'account e aspetta
  const cl = await b.newContext({ viewport: { width: 1280, height: 860 }, colorScheme: 'light' });
  const luca = await cl.newPage(); attenzione(luca, 'luca');
  await richiedi(luca, 'Luca Bianchi', 'luca@azienda.it', 'Spedizioni-2026!', 'Ufficio import');
  await luca.waitForSelector('text=Richiesta inviata');
  await accedi(luca, 'luca@azienda.it', 'Spedizioni-2026!');
  await luca.waitForSelector('text=in attesa di approvazione');
  ok(true, 'richiesta in attesa: non entra');
  await luca.screenshot({ path: out + '/3-in-attesa.png' });

  // l'amministratore approva
  await capo.reload(); await pronta(capo);
  await capo.waitForFunction(() => document.getElementById('tab-gestione').classList.contains('novita'));
  ok(true, 'puntino sulla Gestione per la richiesta');
  await capo.click('#tab-gestione'); await capo.click('button[data-v="utenti"]');
  await capo.waitForSelector('text=Da approvare');
  ok(await capo.isVisible('text=«Ufficio import»'), 'messaggio della richiesta');
  await capo.screenshot({ path: out + '/4-da-approvare.png', fullPage: true });
  await capo.click('button[data-g="u-approva"]');
  await capo.waitForSelector('text=Approvato: Luca Bianchi');

  // il collega entra e classifica fino al limite
  await accedi(luca, 'luca@azienda.it', 'Spedizioni-2026!');
  await pronta(luca);
  ok(await luca.isHidden('#tab-gestione'), 'niente Gestione per i colleghi');
  for (const t of ['trapano a percussione elettrico', 'scarpe sportive di pelle']) {
    await classifica(luca, t);
    await luca.waitForFunction(() => document.querySelector('.timbro') && document.querySelector('.timbro').textContent.includes('Proposta'), null, { timeout: 30000 });
    await luca.waitForTimeout(400);
  }
  ok(true, 'due classificazioni con l\'IA del server');
  await classifica(luca, 'bicicletta elettrica');
  await luca.waitForSelector('text=Hai usato tutte le 2 classificazioni');
  ok(true, 'limite mensile raggiunto: messaggio chiaro');
  await luca.click('#tab-profilo');
  await luca.waitForSelector('text=Il tuo account');
  ok(await luca.isVisible('text=2 di 2 classificazioni') && await luca.isVisible('text=luca@azienda.it'), 'profilo con account e uso');
  await luca.screenshot({ path: out + '/5-profilo.png', fullPage: true });

  // password dimenticata: link preparato dall'amministratore
  await capo.click('button[data-v="utenti"]'); await capo.waitForSelector('button[data-g="u-apri"]');
  const righe = await capo.$$('button[data-g="u-apri"]');
  for (const r of righe) { const tr = await r.evaluateHandle(e => e.closest('tr')); if ((await tr.evaluate(e => e.textContent)).includes('luca@azienda.it')) { await r.click(); break; } }
  await capo.click('button[data-g="u-link"]');
  await capo.waitForSelector('[data-g="link-campo"]');
  const link = await capo.inputValue('[data-g="link-campo"]');
  ok(link.indexOf('/reimposta-password#') > 0, 'link per la password');
  await capo.screenshot({ path: out + '/6-utente.png', fullPage: true });
  const nuova = await (await b.newContext()).newPage(); attenzione(nuova, 'reimposta');
  await nuova.goto(link.replace(/^https?:\/\/[^/]+/, B));
  await nuova.fill('input[name=password]', 'Nuova-Password-2026'); await nuova.fill('input[name=ripeti]', 'Nuova-Password-2026');
  await nuova.click('#reimposta button[type=submit]');
  await pronta(nuova);
  ok(!nuova.url().includes('#'), 'nuova password ed entrato');

  // sospensione: il collega esce
  await capo.click('button[data-g="u-sospendi"]');
  await capo.waitForSelector('text=Account sospeso.');
  await nuova.reload();
  await nuova.waitForSelector('#accedi');
  ok(true, 'sospeso: torna alla pagina d\'accesso');

  // telefono e tema scuro
  const t = await b.newContext({ viewport: { width: 390, height: 844 }, colorScheme: 'dark', deviceScaleFactor: 2 });
  const q = await t.newPage(); attenzione(q, 'tel');
  await q.goto(B + '/accedi'); await q.waitForSelector('#accedi');
  await q.screenshot({ path: out + '/7-tel-accedi.png', fullPage: true });
  await accedi(q, 'capo@azienda.it', 'Porto-Container-42'); await pronta(q);
  await q.goto(B + '/#gestione'); await q.waitForSelector('button[data-g="u-apri"]');
  await q.screenshot({ path: out + '/8-tel-utenti.png', fullPage: true });

  // uscita
  await capo.click('#esci');
  await capo.waitForSelector('#accedi');
  ok(capo.url().endsWith('/accedi'), 'Esci: di nuovo alla pagina d\'accesso');
  await b.close();
  console.log(errori.length ? 'ERRORI:\n' + errori.join('\n') : 'tutto ok');
  process.exit(errori.length ? 1 : 0);
})();
