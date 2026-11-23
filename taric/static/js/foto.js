/* MAGIC HS - allegati della classificazione con l'IA (Classifica, tasto con la macchina fotografica): foto della merce o
   dell'etichetta e schede tecniche in PDF, fino a 3. T.foto.prepara(file) legge il file scelto (fotocamera, galleria, file
   trascinato, incollato o condiviso da un'altra app):
   - una foto diventa un JPEG con il lato lungo di al massimo LATO pixel: si invia in fretta e costa poco, e le scritte delle
     etichette restano leggibili. Intanto si guarda se è troppo scura o sfocata (avviso, non blocca);
   - un PDF resta com'è, fino a 5 MB.
   I file si leggono come «data:» perché la CSP non ammette gli indirizzi «blob:». Non si salvano da nessuna parte: restano
   nella pagina finché non li si toglie e il server li passa al servizio IA senza scriverli. */
(function () {
  'use strict';
  var T = window.TARIC;
  var LATO = 1280, QUALITA = 0.85, MASSIMO_FILE = 40 * 1024 * 1024, MASSIMO_PDF = 5 * 1024 * 1024;
  var IMMAGINE = /\.(jpe?g|png|webp|gif|bmp|heic|heif|avif)$/i;
  // sotto queste soglie la foto è «scura» (95° percentile della luminosità, 0-255) o «sfocata» (varianza del laplaciano
  // nel riquadro più nitido, a contrasto pieno): la foto si usa lo stesso, l'avviso suggerisce di rifarla. Tarate su scatti
  // di 3000 px ridotti a 1280 (una pagina di testo e un oggetto liscio, con e senza rumore e luce): una sfocatura di 12 px
  // (5 px nella foto inviata) è sotto per tutti e due, una di 3 px no; si preferisce qualche avviso in meno a uno di troppo
  var SCURA = 70, SFOCATA = 100;

  function errore(testo) { var e = new Error(testo); e.errore = testo; return e; }
  function ePdf(file) { return file && (file.type === 'application/pdf' || /\.pdf$/i.test(file.name || '')); }

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

  /* luminosità (95° percentile) e nitidezza (varianza del laplaciano, la più alta tra riquadri di circa 160 px: basta una
     parte nitida, per esempio l'etichetta, perché la foto vada bene) della foto già rimpicciolita. La nitidezza si misura
     a contrasto pieno (tra il 5° e il 95° percentile), così una foto poco contrastata ma a fuoco non sembra sfocata */
  function misura(tela) {
    var w = tela.width, h = tela.height, px;
    try { px = tela.getContext('2d').getImageData(0, 0, w, h).data; } catch (e) { return null; }
    var n = w * h, lum = new Float32Array(n), ist = new Uint32Array(256), i, j;
    for (i = 0, j = 0; i < n; i++, j += 4) { var l = 0.299 * px[j] + 0.587 * px[j + 1] + 0.114 * px[j + 2]; lum[i] = l; ist[l | 0]++; }
    var somma = 0, luce = 255, buio = -1;
    for (i = 0; i < 256; i++) { somma += ist[i]; if (buio < 0 && somma >= n * 0.05) buio = i; if (somma >= n * 0.95) { luce = i; break; } }
    var scala = 255 / Math.max(32, luce - buio);
    var nx = Math.max(1, Math.round(w / 160)), ny = Math.max(1, Math.round(h / 160)), nitidezza = 0;
    for (var ty = 0; ty < ny; ty++) {
      for (var tx = 0; tx < nx; tx++) {
        var x0 = Math.max(1, Math.floor(tx * w / nx)), x1 = Math.min(w - 1, Math.floor((tx + 1) * w / nx));
        var y0 = Math.max(1, Math.floor(ty * h / ny)), y1 = Math.min(h - 1, Math.floor((ty + 1) * h / ny));
        var s = 0, s2 = 0, m = 0;
        for (var y = y0; y < y1; y++) {
          for (var x = x0, k = y * w + x0; x < x1; x++, k++) {
            var lap = lum[k - 1] + lum[k + 1] + lum[k - w] + lum[k + w] - 4 * lum[k];
            s += lap; s2 += lap * lap; m++;
          }
        }
        if (m) { var v = s2 / m - (s / m) * (s / m); if (v > nitidezza) nitidezza = v; }
      }
    }
    return { luce: luce, nitidezza: Math.round(nitidezza * scala * scala) };
  }

  function leggi(file) {
    return new Promise(function (ok, ko) {
      var lettore = new FileReader();
      lettore.onerror = function () { ko(errore('Non riesco a leggere il file. Riprova.')); };
      lettore.onload = function () { ok(String(lettore.result || '')); };
      lettore.readAsDataURL(file);
    });
  }

  function preparaPdf(file) {
    if (file.size > MASSIMO_PDF) return Promise.reject(errore('PDF troppo grande (al massimo 5 MB): salva solo le pagine che descrivono la merce.'));
    return leggi(file).then(function (url) {
      var dati = url.slice(url.indexOf(',') + 1), testa = '';
      try { testa = atob(dati.slice(0, 1368)); } catch (e) { testa = ''; }
      if (testa.indexOf('%PDF-') < 0) throw errore('Questo file non è un PDF leggibile.');
      return { tipo: 'application/pdf', dati: dati, nome: file.name || 'documento.pdf', peso: Math.round(dati.length * 3 / 4), avviso: '' };
    });
  }

  function preparaFoto(file) {
    if (file.size > MASSIMO_FILE) return Promise.reject(errore('Immagine troppo grande: al massimo 40 MB.'));
    return leggi(file).then(function (sorgente) {
      return new Promise(function (ok, ko) {
        var img = new Image();
        img.onerror = function () { ko(errore('Questo formato d\'immagine non si apre nel browser: usa una foto JPEG, PNG o WebP.')); };
        img.onload = function () {
          var w0 = img.naturalWidth, h0 = img.naturalHeight;
          if (!w0 || !h0) { ko(errore('L\'immagine è vuota.')); return; }
          var k = Math.min(1, LATO / Math.max(w0, h0)), w = Math.max(1, Math.round(w0 * k)), h = Math.max(1, Math.round(h0 * k));
          var tela, url;
          try { tela = riduci(img, w, h); url = tela.toDataURL('image/jpeg', QUALITA); } catch (e) { url = ''; }
          if (url.indexOf('data:image/jpeg;base64,') !== 0) { ko(errore('Non riesco a preparare l\'immagine in questo browser.')); return; }
          var dati = url.slice(url.indexOf(',') + 1), q = misura(tela);
          ok({ tipo: 'image/jpeg', dati: dati, url: url, nome: file.name || '', larghezza: w, altezza: h, peso: Math.round(dati.length * 3 / 4),
            misura: q, avviso: !q ? '' : q.luce < SCURA ? 'scura' : q.nitidezza < SFOCATA ? 'sfocata' : '' });
        };
        img.src = sorgente;
      });
    });
  }

  /* -> Promise di { tipo, dati (base64), nome, peso (byte), avviso ('' | 'scura' | 'sfocata') e, per le foto, url (data:),
     larghezza, altezza }; in caso di problemi un errore con il messaggio per l'utente */
  function prepara(file) {
    if (!file) return Promise.reject(errore('Nessun file.'));
    if (ePdf(file)) return preparaPdf(file);
    if (!(/^image\//.test(file.type || '') || IMMAGINE.test(file.name || ''))) return Promise.reject(errore('Allega una foto (JPEG, PNG o WebP) o un PDF.'));
    return preparaFoto(file);
  }

  T.foto = { prepara: prepara, misura: misura, LATO: LATO, MASSIMI: 3, SCURA: SCURA, SFOCATA: SFOCATA };
})();
