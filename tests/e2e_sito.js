// Prova nel browser del sito (come su Render): l'amministratore si registra ed entra, ricerca per parola o codice in
// prima pagina e interruttore dell'IA, un collega chiede l'account e aspetta l'approvazione, classificazioni con l'IA fino
// al limite mensile, link per la password, sospensione, installazione come app, uscita, telefono, tablet e tema scuro. IA finta
// (tests/finto_claude.py) come servizio unico del server.
// Uso: python tests/finto_claude.py 9100 dati-AAAA-MM-01.zip &
//      TARIC_DATI=P MAGIC_HS_AMMINISTRATORI=capo@azienda.it TARIC_IA_FORNITORE=openai TARIC_IA_URL=http://127.0.0.1:9100/v1 \
//        TARIC_IA_MODELLO=finto-modello TARIC_IA_CHIAVE=chiave-finta TARIC_DATI_URL=http://127.0.0.1:9100/github/releases/tags/dati \
//        python -m taric server --porta 8810 &
//      node tests/e2e_sito.js http://localhost:8810 cartella-schermate
const { chromium, devices } = require(process.env.PLAYWRIGHT || 'playwright');
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
  if (!(await p.isChecked('#modo-ia'))) await p.click('#interruttore-ia');       // classificazione con l'IA accesa
  await p.fill('#q', testo); await p.click('#vai');
}
async function cerca(p, testo) {
  await p.fill('#q', testo);
  await p.waitForSelector('#risultati[data-q="' + testo + '"] .trow.ris');
}
async function senzaScorrimento(p) { return p.evaluate(() => document.documentElement.scrollWidth <= innerWidth); }
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

  // installazione come app: manifest e service worker a posto per Chromium, tasto con le istruzioni
  const sw = await capo.evaluate(() => navigator.serviceWorker.ready.then(r => r.active && r.active.scriptURL));
  const cdp = await ca.newCDPSession(capo);
  const inst = await cdp.send('Page.getInstallabilityErrors');
  ok(/\/sw\.js$/.test(sw || '') && !inst.installabilityErrors.length, 'installabile come app (service worker attivo, nessun errore)');
  await capo.click('#installa'); await capo.waitForSelector('.finestra.installa');
  ok(await capo.isVisible('.finestra.installa >> text=Installa pagina come app'), 'Installa: istruzioni per il computer');
  await capo.click('.finestra.installa .btn.pri');

  // prima pagina: ricerca per parola o codice, senza IA
  ok(!(await capo.isChecked('#modo-ia')) && (await capo.textContent('#titolo-q')) === 'Che merce cerchi?' && (await capo.textContent('#vai')).trim() === 'Cerca',
    'prima pagina: ricerca per parole, IA spenta');
  await cerca(capo, 'bicicletta');
  ok((await capo.$$('#risultati .trow.ris')).length > 3 && await capo.isVisible('#risultati >> text=Biciclette con cuscinetti a sfere'), 'risultati per parola sotto la casella');
  await cerca(capo, 'divano');
  ok(await capo.isVisible('#risultati >> text=mobili per sedersi'), 'sinonimi: «divano» trova i mobili per sedersi');
  await cerca(capo, 'scarpe di pelle');
  ok(await capo.isVisible('#risultati >> text=Calzature con suole esterne di cuoio'), 'sinonimi e parole vuote: «scarpe di pelle» trova le calzature di cuoio');
  await cerca(capo, 'bicicletta');
  await capo.click('#risultati .trow.ris.L button[data-act="usa"]');
  await capo.waitForSelector('.timbro >> text=Scelta manuale');
  ok(await capo.isVisible('#risultati .link.indietro') && !(await capo.isVisible('#risultati .trow.ris')), 'Usa: scheda del codice, risultati ridotti');
  await capo.click('#risultati .link.indietro');
  await capo.waitForSelector('#risultati .trow.ris');
  ok(true, 'torna ai risultati');
  await capo.fill('#q', '8712'); await capo.press('#q', 'Enter');
  await capo.waitForSelector('#esito >> text=Sottovoci');
  ok(true, 'codice digitato: si apre con le sottovoci');
  await capo.fill('#q', 'qwzxj'); await capo.waitForSelector('#risultati >> text=Nessun risultato');
  await capo.press('#q', 'Enter');                                       // la ricerca vuota arriva all'amministratore
  ok(await capo.isVisible('#risultati [data-act="chiedi"]'), "nessun risultato: proposta di classificare con l'IA");
  await capo.click('#interruttore-ia');
  ok((await capo.textContent('#titolo-q')) === 'Che merce devi classificare?' && (await capo.textContent('#vai')).trim() === 'Classifica' && await capo.isHidden('#risultati'),
    "interruttore: classificazione con l'IA");
  await capo.reload(); await pronta(capo);
  ok(await capo.isChecked('#modo-ia'), 'interruttore ricordato sul dispositivo');
  await capo.click('#interruttore-ia');
  ok(!(await capo.isChecked('#modo-ia')), 'di nuovo ricerca per parole');
  await capo.click('#tab-gestione');
  await capo.waitForSelector('button[data-g="u-apri"]');
  ok((await capo.$$('button[data-g="u-apri"]')).length === 1 && await capo.isVisible('td >> text=capo@azienda.it'), 'in Utenti c\'è l\'amministratore');
  ok((await capo.$$('.sotto button')).length === 5, 'Utenti, IA, Dati TARIC, Ricerca, Registro');

  // parole cercate senza risultati e sinonimo aggiunto dall'amministratore
  await capo.click('button[data-v="ricerca"]');
  await capo.waitForSelector('text=«qwzxj»');
  ok(true, 'Ricerca: la parola senza risultati arriva in Gestione');
  await capo.fill('form[data-g="sinonimo"][data-parola=""] input[name="parola"]', 'muletto');
  await capo.fill('form[data-g="sinonimo"][data-parola=""] input[name="termini"]', 'zxqvwk');
  await capo.click('form[data-g="sinonimo"][data-parola=""] button[type=submit]');
  await capo.waitForSelector('text=Nella nomenclatura non c\'è: «zxqvwk»');
  ok(true, 'sinonimo con un termine che non esiste: rifiutato');
  await capo.fill('form[data-g="sinonimo"][data-parola=""] input[name="termini"]', 'carrelli');
  await capo.click('form[data-g="sinonimo"][data-parola=""] button[type=submit]');
  await capo.waitForSelector('text=Sinonimo salvato');
  await capo.click('#tab-classifica'); await cerca(capo, 'muletto');
  ok(await capo.isVisible('#risultati >> text=Carrelli-elevatori'), 'il sinonimo aggiunto vale subito: «muletto» trova i carrelli elevatori');
  await capo.fill('#q', ''); await capo.click('#tab-gestione'); await capo.click('button[data-v="utenti"]');
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

  // archivio aziendale: quello che ha classificato Luca lo ritrova l'amministratore, e non lo rifà con l'IA
  await capo.click('#tab-classifica'); await capo.reload(); await pronta(capo);
  if (await capo.isChecked('#modo-ia')) await capo.click('#interruttore-ia');
  await cerca(capo, 'scarpe sportive');
  ok(await capo.isVisible('#risultati >> text=Già classificate in azienda') && await capo.isVisible('#risultati .arch >> text=Luca Bianchi'),
    'archivio aziendale: le classificazioni dei colleghi nella ricerca per parole');
  const usate = async () => (await capo.evaluate(() => fetch('/api/io').then(r => r.json()))).ia.usate;
  const prima = await usate();
  await capo.click('#interruttore-ia'); await capo.fill('#q', 'Scarpe sportive di pelle'); await capo.click('#vai');
  await capo.waitForSelector('.gia >> text=Già classificata da Luca Bianchi');
  await capo.click('[data-act="riusa"]');
  await capo.waitForSelector('.timbro >> text=Proposta');
  ok(await usate() === prima, 'descrizione già classificata: ripresa senza una nuova richiesta all\'IA');
  await capo.click('#interruttore-ia'); await capo.fill('#q', ''); await capo.click('#tab-gestione');

  // password dimenticata: link preparato dall'amministratore
  await capo.click('button[data-v="utenti"]');
  // selettore stabile: la tabella si ridisegna quando arrivano i dati, un riferimento all'elemento si perderebbe
  await capo.click('tr:has-text("luca@azienda.it") button[data-g="u-apri"]');
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
  await cerca(q, 'scarpe');
  await q.screenshot({ path: out + '/8-tel-cerca.png' });
  ok(await q.isHidden('.domanda .scena'), "telefono: l'illustrazione lascia posto ai risultati");
  await q.goto(B + '/#gestione'); await q.waitForSelector('button[data-g="u-apri"]');
  await q.screenshot({ path: out + '/9-tel-utenti.png', fullPage: true });
  ok(await senzaScorrimento(q), 'telefono: niente scorrimento di lato');

  // iPhone: icona sulla schermata Home
  const ci = await b.newContext({ ...devices['iPhone 13'] });
  const ip = await ci.newPage(); attenzione(ip, 'iphone');
  await accedi(ip, 'capo@azienda.it', 'Porto-Container-42'); await pronta(ip);
  await ip.click('#installa'); await ip.waitForSelector('.finestra.installa');
  ok(await ip.isVisible('.finestra.installa >> text=Aggiungi alla schermata Home'), 'Installa su iPhone: istruzioni per la schermata Home');
  await ip.screenshot({ path: out + '/11-iphone-installa.png' });
  ok(await senzaScorrimento(ip), 'iPhone: niente scorrimento di lato');
  await ci.close();

  // senza rete il service worker mostra un avviso invece dell'errore del browser
  await ca.setOffline(true);
  await capo.goto(B + '/');
  ok(await capo.isVisible('text=Non c\'è connessione'), 'senza rete: avviso di MAGIC HS');
  await ca.setOffline(false);
  await capo.goto(B + '/'); await pronta(capo);

  // tablet in verticale e in orizzontale
  for (const [nome, w, h] of [['tablet', 810, 1080], ['tablet-orizzontale', 1080, 810]]) {
    const ct = await b.newContext({ viewport: { width: w, height: h }, isMobile: true, hasTouch: true, colorScheme: 'light' });
    const tp = await ct.newPage(); attenzione(tp, nome);
    await accedi(tp, 'capo@azienda.it', 'Porto-Container-42'); await pronta(tp);
    await cerca(tp, 'bicicletta');
    await tp.screenshot({ path: out + '/10-' + nome + '.png' });
    for (const v of ['classifica', 'nomenclatura', 'profilo', 'gestione']) {
      await tp.goto(B + '/#' + v); await tp.waitForTimeout(400);
      ok(await senzaScorrimento(tp), nome + ': ' + v + ' senza scorrimento di lato');
    }
    await ct.close();
  }

  // uscita
  await capo.click('#esci');
  await capo.waitForSelector('#accedi');
  ok(capo.url().endsWith('/accedi'), 'Esci: di nuovo alla pagina d\'accesso');
  await b.close();
  console.log(errori.length ? 'ERRORI:\n' + errori.join('\n') : 'tutto ok');
  process.exit(errori.length ? 1 : 0);
})();
