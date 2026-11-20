/* MAGIC HS - costo di una spedizione con la guida alle tariffe di DHL Express caricata in Gestione (letta da
   taric/leggi_tariffe.py), senza pagina: window.TARIC_TRASPORTO nel browser e modulo di node (tests/prova_trasporto.js).

   Peso: per ogni collo il maggiore tra peso reale e volumetrico (L x P x A in cm / 5000), arrotondato all'unità della
   tabella (mezzo kg per Express, 1 kg per Economy Select); la spedizione paga la somma. Prezzo: la riga della tabella
   per la zona del paese, oppure la riga più vicina sotto più gli scatti (per esempio «per ogni 0,5 kg oltre i 10»), come
   prezzo() di leggi_tariffe.py. Si aggiungono il costo del servizio a orario, i supplementi che si ricavano da pesi e
   misure dei colli, quelli scelti (sabato, aree remote, batterie al litio, assicurazione) e il supplemento carburante
   della settimana su trasporto e supplementi legati al trasporto. Quello che manca o non vale diventa un blocco con il
   motivo; il costo è comunque indicativo (prezzi pubblici di listino). */
(function (radice) {
  'use strict';

  /* centesimi interi, la metà per eccesso, senza gli errori della virgola mobile */
  function cent(v) { return Math.round(Number((v * 100).toPrecision(15))) / 100; }
  function num(v) { var n = typeof v === 'number' ? v : parseFloat(String(v === undefined || v === null ? '' : v).replace(/\s/g, '').replace(',', '.')); return isFinite(n) ? n : NaN; }
  var NOMI = { worldwide: 'DHL Express Worldwide', '12:00': 'DHL Express 12:00', '10:30': 'DHL Express 10:30', '9:00': 'DHL Express 9:00', economy: 'DHL Economy Select' };
  var EPS = 1e-9;

  /* prezzo della zona di indice iz per un peso; null se il peso è oltre la tabella */
  function prezzo(tab, iz, peso) {
    var righe = tab.righe;
    if (peso <= righe[0][0]) return righe[0][1][iz];
    var base = null;
    righe.forEach(function (r) { if (r[0] <= peso + EPS) base = r; });
    if (Math.abs(base[0] - peso) < EPS) return base[1][iz];
    var totale = base[1][iz], cur = base[0];
    while (cur < peso - EPS) {
      var s = null;
      tab.scatti.forEach(function (x) { if (!s && x.da - EPS <= cur && cur < (x.a === null ? Infinity : x.a) - EPS) s = x; });
      if (!s) {
        var dopo = righe.filter(function (r) { return r[0] > cur; });
        return dopo.length ? dopo[0][1][iz] : null;
      }
      var fino = Math.min(peso, s.a === null ? Infinity : s.a), passi = Math.ceil((fino - cur) / s.passo - EPS);
      totale += passi * s.prezzi[iz];
      cur += passi * s.passo;
    }
    return cent(totale);
  }

  /* il peso su cui si paga davvero: la riga della tabella o lo scatto sopra (30,2 kg con gli scatti al kg -> 31 kg) */
  function pesoDiTariffa(tab, peso) {
    var righe = tab.righe;
    if (peso <= righe[0][0]) return righe[0][0];
    var base = null;
    righe.forEach(function (r) { if (r[0] <= peso + EPS) base = r; });
    var cur = base[0];
    while (cur < peso - EPS) {
      var s = null;
      tab.scatti.forEach(function (x) { if (!s && x.da - EPS <= cur && cur < (x.a === null ? Infinity : x.a) - EPS) s = x; });
      if (!s) { var dopo = righe.filter(function (r) { return r[0] > cur; }); return dopo.length ? dopo[0][0] : null; }
      cur += Math.ceil((Math.min(peso, s.a === null ? Infinity : s.a) - cur) / s.passo - EPS) * s.passo;
    }
    return cent(cur);
  }

  /* pesi dei colli: colli = [{quanti, kg, l, p, h, pallet, nonSovrapponibile, nonNastro}] (kg per collo, misure in cm) */
  function pesi(colli, unita) {
    var out = { pezzi: [], reale: 0, volumetrico: 0, tassabile: 0, numero: 0 };
    (colli || []).forEach(function (c, i) {
      var q = Math.max(0, Math.floor(num(c.quanti) || 0)), kg = num(c.kg), mis = [num(c.l), num(c.p), num(c.h)];
      if (!q || !(kg > 0)) return;
      var conMisure = mis.every(function (x) { return x > 0; });
      var vol = conMisure ? mis[0] * mis[1] * mis[2] / 5000 : 0;
      var tass = Math.ceil(Math.max(kg, vol) / unita - EPS) * unita;
      var lati = conMisure ? mis.slice().sort(function (a, b) { return b - a; }) : null;
      out.pezzi.push({ riga: i, quanti: q, kg: kg, volumetrico: cent(vol), tassabile: tass, lati: lati, pallet: !!c.pallet,
        nonSovrapponibile: !!c.nonSovrapponibile, nonNastro: !!c.nonNastro });
      out.reale += kg * q; out.volumetrico += vol * q; out.tassabile += tass * q; out.numero += q;
    });
    out.reale = cent(out.reale); out.volumetrico = cent(out.volumetrico); out.tassabile = cent(out.tassabile);
    return out;
  }

  /* Costo di una spedizione.
     r = {flusso: 'export'|'import', paese: indice in tariffa.paesi, servizio: 'worldwide'|'12:00'|'10:30'|'9:00'|'economy',
          colli: [...], assicurazione: valore della merce in euro (vuoto = senza), sabato, areeRemote, batterie: true/false,
          carburante: percentuale (vuoto = non indicato)}
     Risultato: {blocchi, avvisi, paese, zona, pesi, voci: [{nome, importo, carburante}], carburante: {percentuale, base,
     importo} | null, trasporto (senza assicurazione), assicurazione, totale} - gli importi sono null finché c'è un blocco. */
  function calcola(tariffa, r) {
    var out = { blocchi: [], avvisi: [], paese: null, zona: null, pesi: null, voci: [], carburante: null, trasporto: null, assicurazione: 0, totale: null };
    function b(t) { out.blocchi.push(t); }
    if (!tariffa) { b('Non ci sono ancora tariffe di trasporto: l\'amministratore carica la guida di DHL Express in Gestione.'); return out; }
    var flusso = r.flusso === 'export' ? 'export' : 'import', servizio = NOMI[r.servizio] ? r.servizio : 'worldwide';
    var p = tariffa.paesi[+r.paese];
    if (!p) { b('Scegli il paese ' + (flusso === 'import' ? 'di partenza.' : 'di destinazione.')); return out; }
    out.paese = p; out.zona = p.zona;
    if (p.zona === 0) { b(p.nome + ' è nella zona nazionale: le spedizioni nazionali non sono nel calcolatore.'); return out; }
    var prodotto = servizio === 'economy' ? 'economy' : 'worldwide', tab = ((tariffa.prodotti || {})[prodotto] || {})[flusso];
    if (!tab) { b(NOMI[servizio] + ': prezzi ' + (flusso === 'import' ? 'd\'importazione' : 'd\'esportazione') + ' non presenti nella guida caricata.'); return out; }
    if (Array.isArray(p.servizi)) {
      if (p.servizi.indexOf(servizio) < 0) { b(NOMI[servizio] + ' non è disponibile per ' + p.nome + ' (zonario della guida).'); return out; }
    } else if (servizio !== 'worldwide') out.avvisi.push('Disponibilità di ' + NOMI[servizio] + ' per ' + p.nome + ' non controllata: verifica su dct.dhl.com.');
    var iz = tab.zone.indexOf(p.zona);
    if (iz < 0) { b(NOMI[servizio] + ' non ha prezzi per la zona ' + p.zona + ' (' + p.nome + ').'); return out; }

    var P = out.pesi = pesi(r.colli, tab.unita || 0.5);
    if (!P.numero) { b('Indica almeno un collo con il suo peso.'); return out; }
    var lim = (tariffa.limiti || {})[servizio], sup = tariffa.supplementi || {};
    if (lim) {
      if (lim.colli && P.numero > lim.colli) b('Al massimo ' + lim.colli + ' colli per spedizione con ' + NOMI[servizio] + '.');
      if (lim.spedizione_kg && P.reale > lim.spedizione_kg) b('Peso della spedizione oltre il massimo di ' + lim.spedizione_kg + ' kg per ' + NOMI[servizio] + '.');
      P.pezzi.forEach(function (x) {
        var nome = 'Riga ' + (x.riga + 1) + ': ';
        if (x.pallet) {
          if (lim.pallet_kg === 0) b(nome + NOMI[servizio] + ' non accetta pallet.');
          else {
            if (lim.pallet_kg && x.kg > lim.pallet_kg) b(nome + 'pallet oltre il massimo di ' + lim.pallet_kg + ' kg.');
            if (Array.isArray(lim.pallet_misure) && x.lati && x.lati.some(function (v, k) { return v > lim.pallet_misure[k]; }))
              b(nome + 'pallet oltre le misure massime di ' + lim.pallet_misure.join(' x ') + ' cm.');
          }
        } else {
          if (lim.collo_kg && x.kg > lim.collo_kg) b(nome + 'collo oltre il massimo di ' + lim.collo_kg + ' kg per ' + NOMI[servizio] + (lim.pallet_kg ? ': mettilo su un pallet.' : '.'));
          if (Array.isArray(lim.misure) && x.lati && x.lati.some(function (v, k) { return v > lim.misure[k]; }))
            b(nome + 'collo oltre le misure massime di ' + lim.misure.join(' x ') + ' cm per ' + NOMI[servizio] + '.');
        }
      });
    }
    var base = prezzo(tab, iz, P.tassabile);
    if (base === null) b('Peso tassabile di ' + P.tassabile + ' kg oltre la tabella di ' + NOMI[servizio] + '.');
    var orario = 0;
    if (servizio === '12:00' || servizio === '10:30' || servizio === '9:00') {
      orario = ((tariffa.orari || {})[flusso] || {})[servizio];
      if (orario === undefined) { b('Costo di ' + NOMI[servizio] + ' non presente nella guida caricata.'); orario = 0; }
    }
    if (out.blocchi.length) return out;

    function voce(nome, importo, carb) { if (importo > 0) out.voci.push({ nome: nome, importo: cent(importo), carburante: !!carb }); }
    function manca(nome) { out.avvisi.push('Supplemento «' + nome + '» non presente nella guida caricata: non compreso.'); }
    out.pesoTariffa = pesoDiTariffa(tab, P.tassabile);
    voce('Trasporto ' + NOMI[prodotto] + ', zona ' + p.zona + ', ' + String(out.pesoTariffa).replace('.', ',') + ' kg', base, true);
    voce('Consegna entro le ' + servizio, orario, true);
    // supplementi dai pesi e dalle misure dei colli (per collo, anche i pallet)
    var conta = { peso: 0, misura: 0, nastro: 0, pallet: 0 };
    P.pezzi.forEach(function (x) {
      var extraPeso = x.tassabile > 70, extraMisura = !extraPeso && !!x.lati && (x.lati[0] > 100 || x.lati[1] > 80);
      if (extraPeso) conta.peso += x.quanti;
      else if (extraMisura) conta.misura += x.quanti;
      else if ((x.kg >= 25 && x.kg <= 70) || x.nonNastro) conta.nastro += x.quanti;
      if (x.pallet && x.nonSovrapponibile && x.kg >= 25) conta.pallet += x.quanti;
    });
    [['peso', 'extra_peso', 'Collo extra misura (peso tassabile oltre 70 kg)'], ['misura', 'extra_misura', 'Collo extra misura (lato oltre 100 cm o secondo lato oltre 80 cm)'],
      ['nastro', 'non_conveyable', 'Collo non trasportabile su nastro (da 25 a 70 kg, o imballo non in cartone)'], ['pallet', 'pallet_non_sovrapponibile', 'Pallet non sovrapponibile']].forEach(function (x) {
      if (!conta[x[0]]) return;
      if (sup[x[1]] === undefined) { manca(x[2]); return; }
      voce(x[2] + (conta[x[0]] > 1 ? ' × ' + conta[x[0]] : ''), sup[x[1]] * conta[x[0]], true);
    });
    if (r.sabato) { if (sup.sabato === undefined) manca('consegna al sabato'); else voce('Consegna al sabato', sup.sabato, true); }
    if (r.areeRemote) {
      if (!sup.aree_remote) manca('aree remote');
      else voce('Ritiro o consegna in area remota', Math.max(sup.aree_remote.minimo, sup.aree_remote.per_kg * P.tassabile), true);
    }
    if (r.batterie) { if (sup.batterie_litio === undefined) manca('batterie al litio'); else voce('Batterie al litio con dispositivo separato', sup.batterie_litio, false); }
    // carburante: sul trasporto e sui supplementi legati al trasporto (non su assicurazione e merci pericolose)
    var perc = num(r.carburante);
    var baseCarb = out.voci.filter(function (v) { return v.carburante; }).reduce(function (s, v) { return s + v.importo; }, 0);
    if (perc >= 0) {
      out.carburante = { percentuale: perc, base: cent(baseCarb), importo: cent(baseCarb * perc / 100) };
      voce('Supplemento carburante ' + String(perc).replace('.', ',') + ' %', out.carburante.importo, false);
    } else out.avvisi.push('Supplemento carburante non indicato: il costo non lo comprende.');
    out.trasporto = cent(out.voci.reduce(function (s, v) { return s + v.importo; }, 0));
    var valore = num(r.assicurazione);
    if (valore > 0) {
      if (!sup.assicurazione) manca('assicurazione');
      else {
        out.assicurazione = cent(Math.max(sup.assicurazione.minimo, valore * sup.assicurazione.percentuale / 100));
        out.voci.push({ nome: 'Assicurazione (' + String(sup.assicurazione.percentuale).replace('.', ',') + ' % del valore, almeno ' + String(sup.assicurazione.minimo).replace('.', ',') + ' €)', importo: out.assicurazione, carburante: false });
      }
    }
    out.totale = cent(out.trasporto + out.assicurazione);
    return out;
  }

  /* nella bolla d'importazione: la quota del trasporto fino al confine UE (per l'aereo la percentuale dell'allegato 23-01
     del Reg. UE 2015/2447) va nel valore in dogana, il resto tra le spese fino a destinazione (base IVA) */
  function quotaBolla(trasporto, percentuale) {
    var confine = cent(trasporto * percentuale / 100);
    return { confine: confine, destinazione: cent(trasporto - confine) };
  }

  var API = { prezzo: prezzo, pesoDiTariffa: pesoDiTariffa, pesi: pesi, calcola: calcola, quotaBolla: quotaBolla, NOMI: NOMI, cent: cent };
  if (typeof module === 'object' && module.exports) module.exports = API;
  else radice.TARIC_TRASPORTO = API;
})(this);
