// Prova nel browser del sito (come su Render): l'amministratore si registra ed entra, ricerca per parola o codice in
// prima pagina e interruttore dell'IA, un collega chiede l'account e aspetta l'approvazione, classificazioni con l'IA fino
// al limite mensile, link per la password, sospensione, bolla simulata con il costo del trasporto (guida finta di DHL Express
// fatta da tests/guida_finta.py con $PYTHON, predefinito python3), installazione come app, uscita, telefono, tablet e tema scuro. IA finta
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
  // Marino si presenta da solo la prima volta in ogni sezione: nelle prove le sezioni sono già viste (l'invito si prova nella Bolla)
  const nuovoContesto = b.newContext.bind(b);
  b.newContext = async (o) => {
    const c = await nuovoContesto(o);
    await c.addInitScript(() => {
      try { if (localStorage.getItem('magic-hs.aiuto-visto') === null) localStorage.setItem('magic-hs.aiuto-visto', '["classifica","nomenclatura","bolla","profilo"]'); }
      catch (e) { /* pagina senza archivio */ }
    });
    return c;
  };
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

  // il porto da toccare (js/porto.js) e il gioco «Carica la nave» (js/gioco.js)
  await capo.click('.scena-larga .t-nave', { force: true });
  ok(await capo.evaluate(() => document.querySelector('.scena-larga .t-nave').classList.contains('suona')), 'scena: toccata, la nave suona la sirena');
  await capo.keyboard.type('gioca');
  await capo.waitForSelector('.finestra.gioco');
  await capo.click('[data-g="via"]');
  await capo.waitForFunction(() => { const g = document.querySelector('[data-g="carrello"]'), b = document.querySelector('.g-freccia'); if (!g || !b) return false;
    const m = (g.getAttribute('transform') || '').match(/translate\(([-\d.]+)/), d = b.getAttribute('d').match(/M([\d.]+)/);
    return !!(m && d) && Math.abs(+m[1] - (+d[1] + 8)) < 3; }, null, { timeout: 15000, polling: 'raf' });
  await capo.keyboard.press('Space');
  await capo.waitForFunction(() => +document.querySelector('[data-g="punti"]').textContent >= 1, null, { timeout: 5000 });
  ok(true, 'gioco: si apre scrivendo «gioca», il container sganciato sul posto indicato fa punto');
  await capo.keyboard.press('Escape');
  ok(await capo.isHidden('.finestra.gioco'), 'gioco: si chiude con Esc');

  // stagioni e feste (js/calendario.js): con la data del browser spostata, la scena della pagina d'accesso cambia
  const cs = await b.newContext({ viewport: { width: 1280, height: 860 }, colorScheme: 'light' });
  const ps = await cs.newPage(); attenzione(ps, 'stagioni');
  await ps.clock.setFixedTime(new Date('2026-12-24T10:00:00'));
  await ps.goto(B + '/accedi'); await ps.waitForSelector('.scena-stretta .t-albero');
  ok(await ps.evaluate(() => ['inverno', 'natale', 'con-tema', 'tema-natale', 'con-festone'].every(c => document.documentElement.classList.contains(c)) &&
    !!document.querySelector('.barra .festone pattern') && !!document.querySelector('.logo .marchio .s-rosso') &&
    document.querySelector('.auguri:not([hidden])').textContent === 'Buon Natale!' &&
    getComputedStyle(document.querySelector('.btn.pri')).borderColor === 'rgb(161, 38, 43)' &&
    !!document.querySelector('.scena-stretta .t-albero .s-abete') && document.querySelectorAll('.scena-stretta .s-fiocchi .s-cade').length > 5 &&
    !!document.querySelector('.scena-stretta .s-neve')), 'stagioni: la vigilia di Natale abete, neve e fiocchi');
  await ps.click('.scena-stretta .t-albero', { force: true });
  ok(await ps.evaluate(() => document.querySelector('.scena-stretta .t-albero').classList.contains('scuote') &&
    document.querySelector('.scena-stretta').classList.contains('scrolla')), "stagioni: toccato, l'albero si scuote e nevica");
  await ps.clock.setFixedTime(new Date('2027-06-02T10:00:00'));
  await ps.reload(); await ps.waitForSelector('.scena-stretta .t-albero');
  ok(await ps.evaluate(() => ['estate', 'festa-nazionale', 'repubblica'].every(c => document.documentElement.classList.contains(c)) &&
    !document.documentElement.classList.contains('natale') && !document.querySelector('.s-abete') && !document.querySelector('.s-cade') &&
    !!document.querySelector('.scena-stretta .s-pavese') && !!document.querySelector('.scena-stretta .s-frecce') && !!document.querySelector('.scena-stretta .s-sole')),
    'stagioni: il 2 giugno sole, bandiere sulla gru e Frecce Tricolori');
  await cs.close();

  // stagioni e feste dal profilo: anteprima di un altro giorno, ritorno a oggi, interruttore (su questo dispositivo)
  const temaDi = (p) => p.evaluate(() => (document.documentElement.className.match(/tema-([a-z-]+)/) || [])[1] || '');
  const oggi = await capo.evaluate(() => TARIC.calendario(new Date()).tema);
  ok(await temaDi(capo) === oggi && await capo.evaluate(() => !!document.querySelector('.barra .festone')), 'stagioni: colori e festone del giorno (' + oggi + ')');
  await capo.click('#tab-profilo'); await capo.waitForSelector('[data-p="prova"]');
  await Promise.all([capo.waitForEvent('load'), capo.selectOption('[data-p="prova"]', { label: 'Natale' })]);
  await capo.waitForSelector('.anteprima');
  ok(await temaDi(capo) === 'natale' && (await capo.textContent('.anteprima')).includes('Natale (25/12/'), 'stagioni: anteprima di Natale dal profilo, con l\'avviso');
  await Promise.all([capo.waitForEvent('load'), capo.click('[data-prova="fine"]')]);
  await capo.waitForSelector('[data-p="prova"]');
  ok(await temaDi(capo) === oggi && await capo.isHidden('.anteprima'), 'stagioni: «Torna a oggi»');
  await Promise.all([capo.waitForEvent('load'), capo.uncheck('[data-p="stagioni"]')]);
  await capo.waitForSelector('[data-p="prova"]');
  ok(await capo.evaluate(() => !document.documentElement.classList.contains('con-tema') && !document.querySelector('.festone') &&
    document.querySelector('[data-p="prova"]').disabled && !document.querySelector('[data-p="stagioni"]').checked), 'stagioni: spente dal profilo, i colori di sempre');
  await Promise.all([capo.waitForEvent('load'), capo.check('[data-p="stagioni"]')]);
  await capo.waitForSelector('[data-p="prova"]');
  ok(await temaDi(capo) === oggi, 'stagioni: riaccese');
  // puntatore del mouse a forma di aereo (app.css), blu e arancio sopra ciò che si tocca; si spegne dal profilo
  const cursori = () => capo.evaluate(() => ['html', '.btn.pri:not([disabled])', 'input.campo'].map((s) => getComputedStyle(document.querySelector(s)).cursor));
  let c = await cursori();
  ok(c[0].startsWith('url("data:image/svg+xml') && c[1].startsWith('url("data:image/svg+xml') && c[0] !== c[1] && c[2] === 'text', 'puntatore: l\'aereo con il mouse, il cursore di testo nei campi');
  await capo.uncheck('[data-p="aereo"]'); c = await cursori();
  ok(c[0] === 'auto' && c[1] === 'pointer' && await capo.evaluate(() => localStorage.getItem('magic-hs.aereo') === 'no'), 'puntatore: spento dal profilo');
  await capo.check('[data-p="aereo"]');
  ok((await cursori())[0].startsWith('url('), 'puntatore: riacceso');
  await capo.click('#tab-classifica'); await pronta(capo);

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

  // calcolo degli importi e scheda stampabile
  const casi = [['10.200 % + 93.100 EUR DTN', { valore: 1000, kg: 500 }, 567.5], ['0.000 % + 25.850 EUR DTN MAX 17.900 %', { valore: 1000, kg: 1000 }, 179],
    ['6.700 % MAX 35.150 EUR DTN', { valore: 10000, kg: 100 }, 35.15], ['27.000 EUR HLT', { qta: 10, unitaQta: 'HLT' }, 270]];
  let giusti = 0;
  for (const [s, c, atteso] of casi) {
    const r = await capo.evaluate(([s, c]) => window.TARIC_DEBUG.calcola(s, Object.assign({ valore: NaN, kg: NaN, qta: NaN, unitaQta: '' }, c)), [s, c]);
    if (Math.abs((r.importo ?? -1) - atteso) < 0.005) giusti++;
  }
  const nc = await capo.evaluate(() => window.TARIC_DEBUG.calcola('6.900 % + EAR', { valore: 100, kg: 1, qta: NaN, unitaQta: '' }));
  ok(giusti === casi.length && nc.no, 'calcolo dei dazi: percentuali, per massa e quantità, minimi e massimi; il resto «non calcolabile»');
  await capo.fill('#q', '6403999610'); await capo.press('#q', 'Enter'); await capo.waitForSelector('.calcolo');
  await capo.fill('.calc[data-c="valore"]', '10.000,00');
  await capo.waitForSelector('#calc-esito >> text=Totale stimato da pagare');
  const calcolo = (await capo.textContent('#calc-esito')).replace(/\s+/g, ' ');
  ok(/800,00 €/.test(calcolo) && /2\.376,00 €/.test(calcolo) && /3\.176,00 €/.test(calcolo), 'calcolo nella scheda: dazio 8 %, IVA 22 %, totale');
  ok(await capo.isVisible('[data-act="stampa"]'), 'scheda del codice: Stampa o PDF');
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
  ok((await capo.$$('.sotto button')).length === 7, 'Utenti, IA, Dati TARIC, Ricerca, Trasporto, Segnalazioni, Registro');
  ok(await capo.isHidden('#aiuto'), 'in Gestione niente tasto dell\'aiuto');

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

  // email @dhl.com: account approvato subito, con l'IA spenta; i comandi dell'IA restano visibili ma bloccati, con il divieto
  const cd = await b.newContext({ viewport: { width: 1280, height: 860 }, colorScheme: 'light' });
  const anna = await cd.newPage(); attenzione(anna, 'anna');
  await richiedi(anna, 'Anna Verdi', 'anna.verdi@dhl.com', 'Spedizioni-2026!', '');
  await pronta(anna);
  ok(await anna.isVisible('#interruttore-ia.con-divieto') && await anna.isDisabled('#modo-ia'), '@dhl.com: dentro subito, interruttore dell\'IA bloccato');
  await anna.hover('#interruttore-ia');
  ok(await anna.isVisible('#divieto-ia >> text=Chiedere autorizzazione all\'admin per l\'utilizzo dell\'IA') && await anna.isVisible('#divieto-ia svg') &&
    (await anna.evaluate(() => getComputedStyle(document.querySelector('#interruttore-ia')).cursor)) === 'not-allowed', '@dhl.com: al passaggio del mouse divieto e messaggio');
  await anna.screenshot({ path: out + '/5c-ia-bloccata.png' });
  await anna.click('#interruttore-ia', { force: true });         // per il browser l'etichetta di un comando spento non si clicca
  ok(!(await anna.isChecked('#modo-ia')) && !(await anna.evaluate(() => document.querySelector('.domanda').classList.contains('modo-ia'))), '@dhl.com: l\'IA non si accende');
  await anna.mouse.move(5, 5);
  await cerca(anna, 'biciclette');
  ok(await anna.isVisible('#risultati [data-act="ia-bloccata"]') && await anna.isHidden('#risultati [data-act="chiedi"]'), '@dhl.com: «Classifica con l\'IA» bloccato anche nei risultati');
  await anna.click('#tab-profilo'); await anna.waitForSelector('text=Il tuo account');
  ok(await anna.isVisible('#view-profilo >> text=Chiedere autorizzazione all\'admin per l\'utilizzo dell\'IA'), '@dhl.com: nel profilo come avere l\'IA');
  await cd.close();

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

  // copia del database fuori dal server (finto archivio S3 di tests/finto_claude.py): la prima parte da sola all'avvio
  await capo.click('button[data-v="dati"]');
  await capo.waitForSelector('text=Ultima copia esterna');
  ok(await capo.isVisible('text=una alla settimana in 127.0.0.1:9100/s3/magic-hs'), 'copia esterna: destinazione e prima copia automatica');
  await capo.click('button[data-g="copia-esterna"]');
  await capo.waitForSelector('text=Copia mandata: magic-hs-copia-');
  const oggetti = (await (await fetch('http://127.0.0.1:9100/s3/')).json()).oggetti;
  ok(Object.keys(oggetti).length === 1 && Object.values(oggetti)[0] > 1000, 'copia esterna adesso: il .zip del database è nell\'archivio');

  // bolla simulata: biciclette dalla Cina con antidumping (produttore «altri», B999) in dollari (finta BCE: 1 € = 1,0867 USD)
  // la prima volta nella sezione Marino arriva da solo e chiede se spiegarla, senza bloccare la pagina
  await capo.evaluate(() => localStorage.setItem('magic-hs.aiuto-visto', '["classifica","nomenclatura","profilo"]'));
  await capo.click('#tab-bolla');
  await capo.waitForSelector('[data-b="nuova"]');
  await capo.waitForSelector('.aiuto.invito .aiuto-fumetto');
  ok((await capo.textContent('#aiuto-titolo')) === 'Ciao, sono Marino!' && (await capo.textContent('#aiuto-testo')) === 'Vuoi che ti spieghi la sezione Bolla? Bastano pochi passi.' &&
    await capo.isHidden('.aiuto-blocco') && (await capo.evaluate(() => localStorage.getItem('magic-hs.aiuto-visto'))).includes('bolla'),
    'aiuto: la prima volta nella Bolla Marino si presenta da solo, senza bloccare la pagina, e non lo rifà');
  await capo.click('[data-aiuto="avanti"]');                                   // «Sì, spiegami»
  await capo.waitForSelector('.aiuto:not(.invito)', { state: 'attached' });
  ok((await capo.textContent('.aiuto-passo')) === '1 di 5' && (await capo.textContent('#aiuto-titolo')) === 'Bolla' && !(await capo.textContent('#aiuto-testo')).startsWith('Ciao'),
    'aiuto: «Sì, spiegami» comincia la visita');
  await capo.keyboard.press('Escape'); await capo.waitForSelector('.aiuto', { state: 'detached' });
  // aiuto: Marino, il gabbiano, spiega la sezione a passi (elenco delle bolle: 5 passi), con le frecce, Esc e il tasto ?
  await capo.click('#aiuto'); await capo.waitForSelector('.aiuto .aiuto-fumetto');
  ok((await capo.textContent('#aiuto-titolo')) === 'Bolla' && (await capo.textContent('.aiuto-passo')) === '1 di 5' && await capo.isVisible('.aiuto .marino') &&
    (await capo.textContent('#aiuto-testo')).startsWith('Ciao, sono Marino!'), 'aiuto: Marino arriva, si presenta e spiega la Bolla');
  await capo.keyboard.press('ArrowRight');
  await capo.waitForSelector('.aiuto-luce:not(.senza)');                   // la luce si allarga sulla parte spiegata
  ok((await capo.textContent('#aiuto-titolo')) === 'Nuova bolla', 'aiuto: avanti con la freccia, la parte spiegata è illuminata');
  await capo.keyboard.press('Escape'); await capo.waitForSelector('.aiuto', { state: 'detached' });
  await capo.keyboard.press('?'); await capo.waitForSelector('.aiuto .aiuto-fumetto');
  for (let k = 0; k < 4; k++) await capo.click('[data-aiuto="avanti"]');
  ok((await capo.textContent('.aiuto-passo')) === '5 di 5' && (await capo.textContent('[data-aiuto="avanti"]')).includes('Fine') && await capo.isVisible('[data-aiuto="segnala"]'),
    'aiuto: l\'ultimo passo indica il tasto «?» e «Segnala un problema»');
  // segnalazione di un problema dall'ultimo passo di Marino (l'amministratore la legge più avanti, in Gestione)
  await capo.click('[data-aiuto="segnala"]'); await capo.waitForSelector('.finestra.segnala textarea');
  await capo.click('.finestra.segnala button[type=submit]');
  ok(await capo.isVisible('.finestra.segnala >> text=Scrivi qualche parola in più sul problema.'), 'segnalazione: senza testo non parte');
  await capo.fill('.finestra.segnala textarea', 'Nella bolla non trovo dove si sceglie il regime tariffario.');
  await capo.click('.finestra.segnala button[type=submit]');
  await capo.waitForSelector('.toast >> text=Segnalazione mandata');
  await capo.waitForSelector('.aiuto', { state: 'detached' });
  ok(await capo.isHidden('.finestra.segnala'), 'aiuto: Esc, il tasto ? e «Segnala un problema» aprono e chiudono Marino; la segnalazione parte');
  await capo.click('[data-b="nuova"][data-tipo="import"]');
  await capo.fill('[data-f="riferimento"]', 'Fattura di prova');
  await capo.fill('[data-f="valuta"]', 'USD'); await capo.press('[data-f="valuta"]', 'Tab');
  await capo.waitForSelector('#b-cambio >> text=1 € = 1,0867 USD');
  await capo.fill('[data-a="0"][data-f="codice"]', '8712003090');
  await capo.selectOption('[data-a="0"][data-f="origine"]', 'CN');
  await capo.fill('[data-a="0"][data-f="valore"]', '10.867,00');
  await capo.fill('[data-a="0"][data-f="netto"]', '1200');
  await capo.waitForSelector('[data-a="0"][data-f="quantita"]');
  ok(await capo.isVisible('#b-esito >> text=Scegli il codice addizionale del produttore per il dazio antidumping.'),
    'bolla: senza il codice del produttore il totale non c\'è e si dice perché');
  await capo.fill('[data-a="0"][data-f="quantita"]', '100');
  await capo.selectOption('[data-a="0"][data-addizionale]', 'B999');
  await capo.waitForSelector('#b-esito >> text=Totale da pagare');
  // 10.867 USD = 10.000,00 €; dazio 14 % = 1.400,00; antidumping 48,5 % = 4.850,00; IVA 22 % di 16.250,00 = 3.575,00
  const bolla = (await capo.innerText('#b-esito')).replace(/\s+/g, ' ');
  ok(/10\.000,00 €/.test(bolla) && /Dazio 14 % 1\.400,00 €/.test(bolla) && /Antidumping \(B999\) 48,5 % 4\.850,00 €/.test(bolla) &&
    /B00 IVA all'importazione 3\.575,00 €/.test(bolla) && /Totale da pagare 9\.825,00 €/.test(bolla), 'bolla: valore in dogana, dazio, antidumping, IVA e totale');
  // antidumping: i dati sono del primo del mese, la bolla di oggi (dopo): avviso con il link al TARIC dell'UE per codice, origine e giorno
  const taricUe = await capo.getAttribute('#b-esito .b-avvisi a[href*="dds2/taric"]', 'href');
  ok(/Dazi antidumping o compensativi: i dati TARIC sono del \d\d\/\d\d\/\d{4} e si aggiornano una volta al mese/.test(bolla) &&
    /Taric=8712003090/.test(taricUe) && /Area=CN/.test(taricUe), 'bolla: avviso sugli antidumping dei dati del mese, con il TARIC dell\'UE');
  // dati obbligatori della dichiarazione ancora vuoti (tracciato H1): non bloccano il totale e portano al campo
  await capo.click('#b-esito .b-mancanti summary');
  await capo.click('#b-esito .b-mancanti button:has-text("Importatore (DE 13 04)")');
  ok(await capo.evaluate(() => document.activeElement === document.querySelector('[data-f="destinatario"]')), 'bolla: dati obbligatori mancanti elencati, con il clic si va al campo');
  // IVA non pagata con dichiarazione d'intento: B00 liquidata e detratta con il codice 406
  await capo.selectOption('[data-a="0"][data-f="ivaNonPagata"]', '406');
  await capo.waitForSelector('#b-esito >> text=406 IVA non pagata');
  ok(/Totale da pagare 6\.250,00 €/.test((await capo.innerText('#b-esito')).replace(/\s+/g, ' ')) &&
    await capo.evaluate(() => document.querySelector('[data-a="0"][data-f="ivaMotivo"]').classList.contains('in-conflitto')), 'bolla: IVA 406 detratta dal totale, e manca il protocollo della dichiarazione');
  await capo.selectOption('[data-a="0"][data-f="ivaNonPagata"]', '');
  await capo.waitForFunction(() => !/406 IVA/.test(document.querySelector('#b-esito').innerText));
  // conflitto tra i campi: resa FOB senza il trasporto fino al confine UE; il campo del trasporto si colora
  await capo.selectOption('[data-f="incoterm"]', 'FOB');
  await capo.waitForSelector('#b-esito >> text=Conflitti tra i campi');
  ok(await capo.isVisible('#b-esito >> text=Con FOB il trasporto fino al confine UE non è nel prezzo') &&
    await capo.evaluate(() => document.querySelector('[data-f="nolo.importo"]').classList.contains('in-conflitto')), 'bolla: conflitto tra resa (FOB) e trasporto, con il campo evidenziato');
  await capo.selectOption('[data-f="incoterm"]', '');
  await capo.fill('[data-f="mittente"]', 'Fornitore di prova Ltd, Shenzhen');
  await capo.click('[data-b="salva"]'); await capo.waitForSelector('#b-msg >> text=Bolla salvata.');
  // stampa: solo il foglio della simulazione
  await capo.emulateMedia({ media: 'print' });
  await capo.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
  ok(await capo.isVisible('#bolla-stampa >> text=SIMULAZIONE') && await capo.isHidden('#b-esito') && await capo.isVisible('#bolla-stampa >> text=Totale da pagare') &&
    await capo.isVisible('#bolla-stampa >> text=Tipo di dichiarazione IM A') && await capo.isVisible('#bolla-stampa >> text=Esportatore (DE 13 01 · c. 2)'),
    'bolla: foglio stampabile con la scritta «simulazione» e i dati del tracciato H1');
  await capo.screenshot({ path: out + '/5b-bolla-stampa.png', fullPage: true });
  await capo.evaluate(() => window.dispatchEvent(new Event('afterprint')));
  await capo.emulateMedia({ media: 'screen' });
  // calcolatore del trasporto: guida finta di DHL Express (tests/guida_finta.py) caricata in Gestione › Trasporto, poi il
  // costo dalla bolla aperta e «Usa nella bolla» (quota fino al confine UE nel valore in dogana, il resto fino a destinazione)
  const guida = require('path').join(out, 'guida-dhl-finta.pdf');
  require('child_process').execFileSync(process.env.PYTHON || 'python3', [require('path').join(__dirname, 'guida_finta.py'), guida]);
  await capo.click('#tab-gestione'); await capo.click('button[data-v="trasporto"]');
  await capo.setInputFiles('form[data-g="trasporto-pdf"] input[type=file]', guida);
  await capo.click('form[data-g="trasporto-pdf"] button[type=submit]');
  await capo.waitForSelector('form[data-g="trasporto-pdf"] >> text=Tariffe in uso:', { timeout: 60000 });
  // carburante della settimana dalla pagina finta di DHL (tests/finto_claude.py), poi scritto a mano
  await capo.click('button[data-g="carburante-leggi"]');
  await capo.waitForSelector('text=Letto: Express 50 %, Economy Select 40 %.');
  ok(await capo.isVisible('.box >> text=dalla pagina di DHL') && await capo.isVisible('text=Economy Select 40 %'), 'trasporto: supplemento carburante letto dalla pagina di DHL (Express ed Economy Select)');
  await capo.click('summary >> text=Scrivi a mano');
  await capo.fill('form[data-g="carburante"] input[name=percentuale]', '35,25');
  await capo.click('form[data-g="carburante"] button[type=submit]'); await capo.waitForSelector('form[data-g="carburante"] >> text=Salvato.');
  ok(await capo.isVisible('pre.registro >> text=Zonario: 234 paesi') && await capo.isVisible('text=35,25 %') && await capo.isVisible('text=scritto a mano'),
    'trasporto: guida alle tariffe caricata e controllata, carburante scritto a mano');
  await capo.click('#tab-bolla'); await capo.click('[data-b="trasporto-bolla"]');
  await capo.waitForSelector('#sp-esito');
  ok((await capo.textContent('select[data-s="paese"] option:checked')).startsWith('Cina') && (await capo.inputValue('[data-s="carburante"]')) === '35,25',
    'trasporto: dalla bolla, con il paese d\'origine e il carburante di Gestione');
  await capo.fill('[data-c="0"][data-s="quanti"]', '2'); await capo.fill('[data-c="0"][data-s="kg"]', '8');
  await capo.fill('[data-c="0"][data-s="l"]', '60'); await capo.fill('[data-c="0"][data-s="p"]', '40'); await capo.fill('[data-c="0"][data-s="h"]', '40');
  await capo.waitForSelector('#sp-esito >> text=Trasporto DHL Express Worldwide, zona 7, 39 kg');
  ok(await capo.isVisible('#sp-esito >> text=Supplemento carburante 35,25 %') && await capo.isVisible('#sp-esito >> text=tassabile 39 kg'),
    'trasporto: peso volumetrico (2 colli 60 x 40 x 40 = 38,4 kg), prezzo della zona e carburante');
  ok((await capo.inputValue('[data-s="quota"]')) === '70' && await capo.isVisible('#sp-allegato >> text=Allegato 23-01: Cina, zona L, 70 %'),
    'trasporto: quota fino al confine UE dall\'allegato 23-01 (Cina, zona L, 70 %)');
  await capo.waitForSelector('#sp-bolla >> text=nel trasporto fino al confine UE');
  const quote = (await capo.textContent('#sp-bolla')).match(/[\d.]+,\d\d/g);
  await capo.click('[data-s="usa"]'); await capo.waitForSelector('#b-msg >> text=Trasporto DHL Express riportato');
  ok((await capo.inputValue('[data-f="nolo.importo"]')) + ' €' === quote[0].replace(/\./g, '') + ' €' && (await capo.inputValue('[data-f="inoltro.importo"]')) === quote[1].replace(/\./g, ''),
    'trasporto: «Usa nella bolla» mette la quota fino al confine UE e il resto fino a destinazione');
  await capo.screenshot({ path: out + '/5c-bolla-trasporto.png' });
  for (const f of ['nolo.importo', 'inoltro.importo', 'assicurazione.importo']) await capo.fill('[data-f="' + f + '"]', '');   // la bolla come prima
  await capo.waitForFunction(() => /Totale da pagare\s*9\.825,00 €/.test(document.querySelector('#b-esito').innerText));
  // «Aggiungi alla bolla» dalla scheda del codice; la bolla salvata si riapre dall'elenco
  await capo.click('#tab-classifica');
  await capo.fill('#q', '6403999610'); await capo.press('#q', 'Enter'); await capo.waitForSelector('[data-act="in-bolla"]');
  // misure a una data passata: prima dei dati del mese la scheda non le calcola e apre il TARIC dell'UE di quel giorno
  const oggiIso = await capo.inputValue('#data-misure');
  await capo.fill('#data-misure', '2023-05-10');
  await capo.waitForSelector('#esito >> text=per il 10/05/2023 mancano le misure finite nel frattempo');
  const hrefScheda = await capo.getAttribute('#esito a:has-text("Misure sul TARIC UE al 10/05/2023")', 'href');
  ok(/SimDate=20230510/.test(hrefScheda) && /Taric=6403999610/.test(hrefScheda) && await capo.isHidden('#esito .riep'),
    'scheda: misure a una data passata, rimando al TARIC dell\'UE di quel giorno');
  await capo.click('[data-act="data-oggi"]');
  await capo.waitForSelector('#esito .riep');
  ok((await capo.inputValue('#data-misure')) === oggiIso && await capo.isHidden('[data-act="data-oggi"]'), 'scheda: di nuovo le misure di oggi');
  await capo.click('[data-act="in-bolla"]');
  await capo.waitForSelector('[data-a="1"][data-f="codice"]');
  ok((await capo.inputValue('[data-a="1"][data-f="codice"]')) === '6403999610', 'bolla: articolo aggiunto dalla scheda del codice');
  // il caso del codice 300: preferenza Vietnam (esente) con un dazio dell'8 % scritto a mano
  await capo.selectOption('[data-a="1"][data-f="origine"]', 'VN');
  await capo.fill('[data-a="1"][data-f="valore"]', '1.086,70'); await capo.fill('[data-a="1"][data-f="netto"]', '30');
  await capo.waitForSelector('[data-a="1"][data-f="quantita"]'); await capo.fill('[data-a="1"][data-f="quantita"]', '40');
  await capo.selectOption('[data-a="1"][data-f="regime"]', '142-VN-');
  ok((await capo.textContent('[data-a="1"][data-f="regime"] option:checked')).startsWith('300 · '), 'bolla: la preferenza mostra il codice della casella 36 (300)');
  await capo.click('.articolo[data-art="1"] summary:has-text("Correzioni a mano")');
  await capo.fill('[data-a="1"][data-f="dazioManuale"]', '8');
  await capo.waitForSelector('#b-esito >> text=Dazio: hai scritto 8 % (80,00 €), ma con il codice 300 nella casella 36 il TARIC dà');
  ok(await capo.evaluate(() => document.querySelector('[data-a="1"][data-f="dazioManuale"]').classList.contains('in-conflitto')), 'bolla: codice 300 con un dazio a mano diverso dal TARIC segnalato come conflitto');
  await capo.fill('[data-a="1"][data-f="dazioManuale"]', '');
  await capo.waitForFunction(() => !document.querySelector('#b-esito .b-conflitti'));
  await capo.click('[data-b="salva"]'); await capo.waitForSelector('#b-msg >> text=Bolla salvata.');
  await capo.click('[data-b="chiudi"]');
  await capo.waitForSelector('#view-bolla >> text=Fattura di prova');
  await capo.click('[data-b="apri"]'); await capo.waitForSelector('[data-a="1"][data-f="codice"]');
  ok((await capo.inputValue('[data-a="0"][data-f="codice"]')) === '8712003090', 'bolla: salvata nel profilo e riaperta');
  // revisione di una bolla di una data passata: niente totale, in ogni articolo il TARIC dell'UE di quel giorno
  await capo.fill('[data-f="data"]', '2025-03-10');
  await capo.waitForSelector('#b-esito >> text=precedente ai dati TARIC del 01/11/2026');
  const hrefBolla = await capo.getAttribute('[data-opz="0"] a', 'href');
  ok(/SimDate=20250310/.test(hrefBolla) && /Taric=8712003090/.test(hrefBolla) && /Area=CN/.test(hrefBolla) && await capo.isHidden('#b-esito >> text=Totale da pagare'),
    'bolla con una data passata: niente totale e link al TARIC dell\'UE di quel giorno');
  ok(await capo.isVisible('#b-storico >> text=l\'archivio parte dal 01/09/2025'), 'bolla: prima dell\'archivio lo dice');
  // con una data dell'archivio: si salva e si riapre con i dati di quel mese
  await capo.fill('[data-f="data"]', '2025-10-15');
  await capo.click('#b-storico button:has-text("Ricalcola con i dati TARIC del 01/09/2025")');
  await capo.waitForSelector('#storico >> text=dati TARIC del 01/09/2025'); await pronta(capo);
  await capo.waitForSelector('[data-a="1"][data-f="codice"]');
  await capo.waitForFunction(() => !/non disponibili con i dati TARIC/.test(document.querySelector('#view-bolla').innerText) && document.querySelector('#b-esito .b-tab'));
  ok(new URL(capo.url()).searchParams.get('dati') === '2025-09-01' && (await capo.inputValue('[data-f="data"]')) === '2025-10-15' &&
    await capo.isHidden('#b-storico button') && await capo.isVisible('#b-esito >> text=8712 00 30 90'), 'bolla ricalcolata con i dati TARIC del mese passato');
  await capo.goto(B + '/#bolla'); await pronta(capo);
  await capo.waitForSelector('#view-bolla >> text=Fattura di prova');
  if (await capo.isVisible('[data-b="chiudi"]')) await capo.click('[data-b="chiudi"]');
  // esportazione: niente dazi, valore statistico in euro e documenti
  await capo.click('[data-b="nuova"][data-tipo="export"]');
  // dirham degli Emirati: la BCE non lo pubblica, il cambio si scrive a mano (1 € = 4 AED)
  await capo.fill('[data-f="valuta"]', 'aed'); await capo.press('[data-f="valuta"]', 'Tab');
  await capo.waitForSelector('[data-f="cambioManuale"]'); await capo.fill('[data-f="cambioManuale"]', '4');
  await capo.fill('[data-a="0"][data-f="codice"]', '8471300000');
  await capo.selectOption('[data-a="0"][data-f="origine"]', 'AE');
  await capo.fill('[data-a="0"][data-f="valore"]', '2500');
  await capo.waitForSelector('[data-a="0"][data-f="quantita"]'); await capo.fill('[data-a="0"][data-f="quantita"]', '4');
  await capo.waitForSelector('#b-esito >> text=Valore statistico totale');
  const esp = await capo.innerText('#b-esito');
  ok(/625,00 €/.test(esp) && /Cambio di AED scritto a mano/.test(esp), 'bolla d\'esportazione: valore statistico con un cambio scritto a mano');
  await capo.click('[data-b="chiudi"]');
  // con i dati di un mese passato (il finto GitHub ha anche settembre 2025): la scheda li apre, e si torna ai dati in uso
  await capo.goto(B + '/?codice=6403999610#classifica'); await pronta(capo);
  await capo.waitForSelector('#esito .riep');
  await capo.fill('#data-misure', '2025-10-15');
  await capo.click('#esito a:has-text("Apri i dati TARIC del 01/09/2025")');
  await capo.waitForSelector('#storico >> text=dati TARIC del 01/09/2025'); await pronta(capo);
  await capo.waitForSelector('#esito .riep');
  ok(new URL(capo.url()).searchParams.get('dati') === '2025-09-01' && (await capo.inputValue('#data-misure')) === '2025-10-15' &&
    await capo.isVisible('#esito >> text=6403 99 96 10') && await capo.isVisible('#dato >> text=01/09/2025 · archivio'),
    'mese passato: la scheda dello stesso codice con i dati di settembre 2025 al 15/10/2025');
  ok(await capo.isVisible('#esito >> text=possono esserci misure nuove che qui mancano'), 'mese passato: oltre il mese dei dati lo dice');
  await capo.screenshot({ path: out + '/5d-mese-passato.png' });
  await capo.click('#esito a:has-text("Oggi")');
  await capo.waitForSelector('#esito [data-act="in-bolla"]'); await pronta(capo);
  ok(await capo.isHidden('#storico') && !new URL(capo.url()).searchParams.get('dati'), 'mese passato: «Oggi» torna ai dati in uso con lo stesso codice');
  await capo.click('#tab-gestione');

  // la segnalazione mandata dalla Bolla: l'amministratore la legge in Gestione, risponde e la risolve; la risposta torna a chi l'ha scritta
  await capo.waitForSelector('text=C\'è una segnalazione di un problema da leggere');
  await capo.click('button[data-v="segnalazioni"]');
  await capo.waitForSelector('.segnalazione >> text=Nella bolla non trovo dove si sceglie il regime tariffario.');
  ok(await capo.isVisible('.segnalazione >> text=Mario Capo') && await capo.isVisible('.segnalazione >> text=Bolla · schermo 1280x860'),
    'segnalazioni: in Gestione con chi l\'ha mandata, la sezione e lo schermo');
  await capo.fill('form[data-g="segnalazione"] textarea[name=risposta]', 'Il regime si sceglie in ogni articolo, sotto il codice.');
  await capo.click('form[data-g="segnalazione"] button[data-stato="chiusa"]');
  await capo.waitForSelector('text=Segnalazione risolta.');
  await capo.reload(); await pronta(capo);
  await capo.waitForSelector('.toast >> text=L\'amministratore ha risposto a una tua segnalazione');
  await capo.click('#tab-profilo'); await capo.waitForSelector('.segnalazione >> text=Il regime si sceglie in ogni articolo, sotto il codice.');
  ok(await capo.isVisible('.segnalazione >> text=risposta nuova') && await capo.isVisible('.segnalazione >> text=risolta'),
    'segnalazioni: la risposta arriva a chi l\'ha scritta, con un avviso all\'apertura e nel Profilo');
  await capo.click('#tab-gestione');

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
