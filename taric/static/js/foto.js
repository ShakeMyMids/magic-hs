/* MAGIC HS - foto della merce per la classificazione con l'IA (Classifica, tasto con la macchina fotografica).
   T.foto.prepara(file) legge l'immagine scelta (fotocamera, galleria, file trascinato o incollato) e la rimpicciolisce in un
   JPEG con il lato lungo di al massimo LATO pixel: si invia in fretta e costa poco, e le scritte delle etichette restano
   leggibili. L'immagine si legge come «data:» perché la CSP non ammette gli indirizzi «blob:». Non si salva da nessuna parte:
   resta nella pagina finché non la si toglie e il server la passa al servizio IA senza scriverla. */
(function () {
  'use strict';
  var T = window.TARIC;
  var LATO = 1280, QUALITA = 0.85, MASSIMO_FILE = 40 * 1024 * 1024;
  var IMMAGINE = /\.(jpe?g|png|webp|gif|bmp|heic|heif|avif)$/i;

  function errore(testo) { var e = new Error(testo); e.errore = testo; return e; }

  /* disegna l'immagine in una tela di w x h; quando si riduce molto si dimezza a passi, così i dettagli non si sgranano */
  function riduci(img, w, h) {
    var fonte = img, fw = img.naturalWidth, fh = img.naturalHeight;
    while (fw / 2 >= w * 1.5) {
      var mezza = document.createElement('canvas');
      mezza.width = Math.round(fw / 2); mezza.height = Math.round(fh / 2);
      mezza.getContext('2d').drawImage(fonte, 0, 0, mezza.width, mezza.height);
      fonte = mezza; fw = mezza.width; fh = mezza.height;
    }
    var tela = document.createElement('canvas');
    tela.width = w; tela.height = h;
    var g = tela.getContext('2d');
    g.fillStyle = '#ffffff';                    // le parti trasparenti (PNG) diventano bianche nel JPEG, non nere
    g.fillRect(0, 0, w, h);
    g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
    g.drawImage(fonte, 0, 0, w, h);
    return tela;
  }

  /* -> Promise di { tipo, dati (base64), url (data:), larghezza, altezza, peso (byte) }; in caso di problemi un errore
     con il messaggio per l'utente */
  function prepara(file) {
    return new Promise(function (ok, ko) {
      if (!file || !(/^image\//.test(file.type || '') || IMMAGINE.test(file.name || ''))) { ko(errore('Scegli un\'immagine: una foto JPEG, PNG o WebP.')); return; }
      if (file.size > MASSIMO_FILE) { ko(errore('Immagine troppo grande: al massimo 40 MB.')); return; }
      var lettore = new FileReader();
      lettore.onerror = function () { ko(errore('Non riesco a leggere l\'immagine. Riprova.')); };
      lettore.onload = function () {
        var img = new Image();
        img.onerror = function () { ko(errore('Questo formato d\'immagine non si apre nel browser: usa una foto JPEG, PNG o WebP.')); };
        img.onload = function () {
          var w0 = img.naturalWidth, h0 = img.naturalHeight;
          if (!w0 || !h0) { ko(errore('L\'immagine è vuota.')); return; }
          var k = Math.min(1, LATO / Math.max(w0, h0)), w = Math.max(1, Math.round(w0 * k)), h = Math.max(1, Math.round(h0 * k));
          var url;
          try { url = riduci(img, w, h).toDataURL('image/jpeg', QUALITA); } catch (e) { url = ''; }
          if (url.indexOf('data:image/jpeg;base64,') !== 0) { ko(errore('Non riesco a preparare l\'immagine in questo browser.')); return; }
          var dati = url.slice(url.indexOf(',') + 1);
          ok({ tipo: 'image/jpeg', dati: dati, url: url, larghezza: w, altezza: h, peso: Math.round(dati.length * 3 / 4) });
        };
        img.src = String(lettore.result || '');
      };
      lettore.readAsDataURL(file);
    });
  }

  T.foto = { prepara: prepara, LATO: LATO };
})();
