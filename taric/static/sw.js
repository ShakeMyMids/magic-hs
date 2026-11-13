/* MAGIC HS - service worker della versione sito (lo completa strumenti/sito.py): l'app si apre anche senza rete e i
   dati TARIC restano nel browser.
   - pagine e programma: prima la rete, così si usa sempre la versione pubblicata; la copia salvata se la rete manca;
   - dati TARIC (dati/<versione>/, non cambiano mai): prima la copia salvata; quelle dei mesi tolti dal sito si cancellano;
   - le chiamate ai servizi di intelligenza artificiale (altri indirizzi) non passano da qui. */
'use strict';
var VERSIONE = 'sviluppo';              // i valori li scrive strumenti/sito.py
var GUSCIO = [/*GUSCIO*/];
var VERSIONI_DATI = [/*VERSIONI_DATI*/];
var CACHE = 'magic-hs-' + VERSIONE, CACHE_DATI = 'magic-hs-dati';
var BASE = new URL('./', self.location.href).pathname;       // cartella del sito, per esempio /magic-hs/

self.addEventListener('install', function (ev) {
  ev.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(GUSCIO); }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (ev) {
  ev.waitUntil(caches.keys().then(function (nomi) {
    return Promise.all(nomi.filter(function (n) { return n.indexOf('magic-hs-') === 0 && n !== CACHE && n !== CACHE_DATI; })
      .map(function (n) { return caches.delete(n); }));
  }).then(function () {
    return caches.open(CACHE_DATI).then(function (c) {
      return c.keys().then(function (richieste) {
        return Promise.all(richieste.filter(function (r) {
          var m = /\/dati\/(\d{4}-\d{2}-01)\//.exec(new URL(r.url).pathname);
          return !m || VERSIONI_DATI.indexOf(m[1]) < 0;
        }).map(function (r) { return c.delete(r); }));
      });
    });
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('fetch', function (ev) {
  var r = ev.request, u = new URL(r.url);
  if (r.method !== 'GET' || u.origin !== self.location.origin || u.pathname.indexOf(BASE) !== 0) return;
  if (u.pathname.indexOf(BASE + 'dati/') === 0) {
    ev.respondWith(caches.open(CACHE_DATI).then(function (c) {
      return c.match(r).then(function (salvata) {
        return salvata || fetch(r).then(function (risposta) { if (risposta.ok) c.put(r, risposta.clone()); return risposta; });
      });
    }));
    return;
  }
  ev.respondWith(fetch(r).then(function (risposta) {
    if (risposta.ok && risposta.type === 'basic') { var copia = risposta.clone(); caches.open(CACHE).then(function (c) { c.put(r, copia); }); }
    return risposta;
  }).catch(function () {
    return caches.match(r, { ignoreSearch: true }).then(function (salvata) { return salvata || caches.match(BASE); });
  }));
});
