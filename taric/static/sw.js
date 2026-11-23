/* MAGIC HS - service worker minimo, servito come /sw.js: serve a installare il sito come app (collegamento sul desktop o
   icona sul telefono, vedi js/installa.js). Non conserva niente: pagine e dati arrivano sempre dal server, così dopo un
   aggiornamento non restano versioni vecchie. Se manca la rete, al posto dell'errore del browser mostra un avviso.
   «Condividi → MAGIC HS» da un'altra app (share_target del manifest, Android): foto, PDF e testo arrivano con un POST su
   /condividi; si apre /?condivisa=1 e, quando la pagina li chiede (messaggio «condivisa?»), le si passano. Restano solo in
   memoria, per al massimo due minuti, e al server vanno solo se si classifica. */
'use strict';

var SENZA_RETE = '<!DOCTYPE html><html lang="it"><head><meta charset="utf-8">' +
  '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><meta name="color-scheme" content="light dark">' +
  '<title>MAGIC HS</title><style>' +
  'body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;box-sizing:border-box;background:#e1e6eb;color:#17222e;' +
  'font:16px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif}' +
  'main{max-width:420px;padding:28px;border-radius:18px;background:#eef1f4;border:1px solid #cfd7df}' +
  'h1{margin:0 0 8px;font-size:22px}b{color:#1b5584}a{display:inline-block;margin-top:14px;padding:10px 18px;border-radius:12px;' +
  'background:#1b5584;color:#f3f6f9;text-decoration:none;font-weight:600}' +
  '@media (prefers-color-scheme:dark){body{background:#0d151e;color:#e2e9f0}main{background:#141e29;border-color:#243241}' +
  'b{color:#7fb8e6}a{background:#7fb8e6;color:#0a1119}}' +
  '</style></head><body><main><h1>MAGIC <b>HS</b></h1><p>Non c\'è connessione: MAGIC HS si apre appena torna la rete.</p>' +
  '<a href="/">Riprova</a></main></body></html>';

self.addEventListener('install', function () { self.skipWaiting(); });
self.addEventListener('activate', function (ev) { ev.waitUntil(self.clients.claim()); });
var condivisa = null, lascia = null;          // i file condivisi in attesa che la pagina li chieda

self.addEventListener('fetch', function (ev) {
  if (ev.request.method === 'POST' && new URL(ev.request.url).pathname === '/condividi') {
    condivisa = ev.request.formData().then(function (d) {
      var file = d.getAll('allegati').filter(function (f) { return f && typeof f !== 'string'; });
      var testo = ['titolo', 'testo', 'link'].map(function (k) { return String(d.get(k) || '').trim(); }).filter(Boolean).join(' ');
      return { file: file, testo: testo };
    }, function () { return { file: [], testo: '' }; });
    ev.respondWith(Response.redirect(new URL('/?condivisa=1#classifica', self.location.href).href, 303));
    ev.waitUntil(new Promise(function (fatto) {        // il service worker resta sveglio finché la pagina non li prende
      if (lascia) lascia();
      lascia = fatto;
      setTimeout(function () { if (lascia === fatto) { condivisa = null; lascia = null; } fatto(); }, 120000);
    }));
    return;
  }
  if (ev.request.mode !== 'navigate') return;          // file, dati e API: li gestisce il browser come sempre
  ev.respondWith(fetch(ev.request).catch(function () {
    return new Response(SENZA_RETE, { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
  }));
});
self.addEventListener('message', function (ev) {
  if (!ev.data || ev.data.tipo !== 'condivisa?' || !ev.source) return;
  var c = condivisa, fatto = lascia;
  condivisa = null; lascia = null;
  ev.waitUntil((c || Promise.resolve({ file: [], testo: '' })).then(function (d) {
    ev.source.postMessage({ tipo: 'condivisa', file: d.file, testo: d.testo });
    if (fatto) fatto();
  }));
});
