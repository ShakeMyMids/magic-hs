/* MAGIC HS - codici ufficiali per la bolla simulata (js/bolla.js e js/calcolo.js), dalle fonti indicate in «fonti».
   Ricavato dalle tabelle dell'Agenzia delle Dogane e dal Reg. di esecuzione (UE) 2015/2447: se cambiano, si aggiorna dalle stesse fonti. */
(function (radice) {
  'use strict';
  var CODICI = {
"fonti":{
"imballaggi":"Agenzia delle Dogane, Allegato 2 «Codici da utilizzare per la compilazione dei formulari» (11/04/2022), tabella n. 10",
"natura":"Agenzia delle Dogane, Allegato 2 (11/04/2022), tabella n. 7; DE 99 05 000 000",
"modi":"Reg. di esecuzione (UE) 2015/2447, allegato B, codici del dato «Modo di trasporto fino alla frontiera»; ADM tabella n. 8",
"aggiunte":"Reg. di esecuzione (UE) 2015/2447, allegato B, codici del dato «Aggiunte e detrazioni» (artt. 70-72 del codice)",
"metodi":"Reg. di esecuzione (UE) 2015/2447, allegato B, codici del dato «Metodo di valutazione»",
"qualifica":"Tracciato ADM H1 EUCDM 6.2, DE 13 06 030 000 (2 = rappresentanza diretta, 3 = indiretta)",
"aereo":"Reg. di esecuzione (UE) 2015/2447, allegato 23-01 (art. 138): percentuali delle spese di trasporto aereo da comprendere nel valore in dogana, per paese di spedizione"
},
// allegato 23-01: zona -> percentuale; paese -> zone (piu' lettere: dipende dall'aeroporto di partenza, in «aeroporti»)
"aereo":{"zone":{"A":70,"B":78,"C":89,"D":33,"E":50,"F":61,"G":74,"H":27,"I":43,"J":46,"K":57,"L":70,"M":83,"N":79,"O":30,"P":15,"Q":5},"paesi":{"AE":"I","AF":"J","AL":"P","AM":"H","AO":"G","AR":"B","AS":"N","AU":"N","AZ":"H","BA":"P","BD":"J","BF":"E","BH":"I","BI":"F","BJ":"E","BN":"L","BO":"B","BR":"B","BT":"J","BW":"G","BY":"P","BZ":"B","CA":"AB","CD":"F","CF":"E","CG":"F","CH":"Q","CI":"E","CK":"N","CL":"B","CM":"E","CN":"L","CO":"B","CR":"B","CV":"E","DJ":"E","DZ":"D","EC":"B","EG":"D","ET":"E","FJ":"N","FK":"B","FM":"N","FO":"P","GA":"F","GE":"H","GH":"E","GL":"A","GM":"E","GN":"E","GQ":"F","GT":"B","GU":"N","GW":"E","GY":"B","HK":"L","HN":"B","ID":"L","IL":"H","IN":"J","IQ":"H","IR":"H","IS":"O","JO":"H","JP":"M","KE":"F","KG":"K","KH":"L","KI":"N","KM":"G","KP":"M","KR":"M","KW":"H","KZ":"K","LA":"L","LB":"H","LK":"L","LR":"E","LS":"G","LY":"D","MA":"D","MD":"P","ME":"P","MG":"G","MH":"N","MK":"P","ML":"E","MM":"L","MN":"L","MO":"L","MP":"N","MR":"E","MU":"G","MV":"L","MW":"G","MX":"B","MY":"L","MZ":"G","NA":"G","NC":"N","NE":"E","NF":"N","NG":"E","NI":"B","NO":"P","NP":"J","NR":"N","NU":"N","NZ":"N","OM":"I","PA":"B","PE":"B","PF":"N","PG":"N","PH":"L","PK":"J","PN":"N","PR":"B","PW":"N","PY":"B","QA":"I","RU":"KLMO","RW":"F","SA":"I","SB":"N","SC":"F","SD":"E","SG":"L","SH":"F","SL":"E","SN":"E","SO":"F","SR":"B","ST":"F","SV":"B","SY":"H","SZ":"G","TD":"E","TG":"E","TH":"L","TJ":"K","TK":"N","TM":"K","TN":"D","TO":"N","TR":"P","TV":"N","TW":"L","TZ":"F","UA":"O","UG":"F","US":"ABC","UY":"B","UZ":"K","VE":"B","VN":"L","VU":"N","WF":"N","WS":"N","XK":"P","XS":"P","YE":"I","ZA":"G","ZM":"G","ZW":"G"},"aeroporti":{"CA":{"A":"Gander, Halifax, Moncton, Montreal, Ottawa, Quebec, Toronto","B":"Edmonton, Vancouver, Winnipeg"},"US":{"A":"Akron, Albany, Atlanta, Baltimore, Boston, Buffalo, Charleston, Chicago, Cincinnati, Columbus, Detroit, Indianapolis, Jacksonville, Kansas City, Lexington, Louisville, Memphis, Milwaukee, Minneapolis, Nashville, New Orleans, New York, Philadelphia, Pittsburgh, St Louis, Washington DC","B":"Albuquerque, Austin, Billings, Dallas, Denver, Houston, Las Vegas, Los Angeles, Miami, Oklahoma, Phoenix, Portland, Salt Lake City, San Francisco, Seattle","C":"Anchorage, Fairbanks, Honolulu, Juneau"},"RU":{"K":"Novosibirsk, Omsk, Perm, Sverdlovsk","L":"Irkutsk, Kirensk, Krasnoyarsk","M":"Khabarovsk, Vladivostok","O":"Gorky, Samara, Mosca, Orel, Rostov, Volgograd, Voronej"}}},
"imballaggi":[
[
"AE",
"Aerosol"
],
[
"AM",
"Ampolla non protetta"
],
[
"AP",
"Ampolla protetta"
],
[
"RG",
"Anello"
],
[
"SX",
"Assortimento («set»)"
],
[
"CV",
"Astuccio"
],
[
"AT",
"Atomizzatore"
],
[
"HN",
"Attaccapanni"
],
[
"P2",
"Bacinella («pan»)"
],
[
"LE",
"Bagaglio"
],
[
"BL",
"Balla compressa"
],
[
"BN",
"Balla non compressa"
],
[
"CJ",
"Bara"
],
[
"TN",
"Barattolo di latta"
],
[
"KG",
"Barile («keg»)"
],
[
"FI",
"Barilotto («firkin»)"
],
[
"TI",
"Barilotto («tierce»)"
],
[
"BR",
"Barra"
],
[
"BZ",
"Barre in pacchi/mazzi/fasci"
],
[
"TR",
"Baule («trunk»)"
],
[
"SE",
"Baule da marinaio"
],
[
"CF",
"Baule metallico («coffer»)"
],
[
"FO",
"Bauletto («footlocker»)"
],
[
"CX",
"Bidone cilindrico"
],
[
"CD",
"Bidone con manico e beccuccio"
],
[
"CC",
"Bidone da latte"
],
[
"CI",
"Bidone di latta («canister»)"
],
[
"CA",
"Bidone rettangolare"
],
[
"OK",
"Blocco"
],
[
"BB",
"Bobina («bobbin»)"
],
[
"CL",
"Bobina («coil»)"
],
[
"RL",
"Bobina («reel»)"
],
[
"SD",
"Bobina («spindle»)"
],
[
"SO",
"Bobina («spool»)"
],
[
"GB",
"Bombola di gas"
],
[
"BG",
"Borsa («bag»)"
],
[
"BA",
"Botte («barrel»)"
],
[
"2C",
"Botte («barrel») di legno"
],
[
"QJ",
"Botte («barrel») di legno con coperchio amovibile"
],
[
"QH",
"Botte («barrel») di legno con foro di riempimento"
],
[
"BU",
"Botte («butt»)"
],
[
"CK",
"Botte («cask»)"
],
[
"HG",
"Botte («hogshead»)"
],
[
"TO",
"Botte di grande capacità"
],
[
"BS",
"Bottiglia a bulbo non protetta"
],
[
"BV",
"Bottiglia a bulbo protetta"
],
[
"BO",
"Bottiglia cilindrica non protetta"
],
[
"BQ",
"Bottiglia cilindrica protetta"
],
[
"WB",
"Bottiglia impagliata"
],
[
"CO",
"Bottiglione non protetto"
],
[
"CP",
"Bottiglione protetto"
],
[
"JG",
"Brocca («jug»)"
],
[
"PH",
"Brocca («pitcher»)"
],
[
"EN",
"Busta"
],
[
"BK",
"Canestro"
],
[
"AV",
"Capsula"
],
[
"FW",
"Carrello piatto"
],
[
"CM",
"Cartoncino («card»)"
],
[
"CT",
"Cartone"
],
[
"DK",
"Cartone per rinfuse"
],
[
"CQ",
"Cartuccia"
],
[
"GU",
"Casetta («tray») contenente articoli piatti impilati orizzontalmente"
],
[
"4A",
"Cassa («box») di acciaio"
],
[
"4B",
"Cassa («box») di alluminio"
],
[
"4D",
"Cassa («box») di legno compensato"
],
[
"4C",
"Cassa («box») di legno naturale"
],
[
"QQ",
"Cassa («box») di legno naturale a pannelli stagni alle polveri"
],
[
"QP",
"Cassa («box») di legno naturale, ordinaria"
],
[
"4F",
"Cassa («box») di legno ricostituito"
],
[
"QR",
"Cassa («box») in materiale plastico espanso"
],
[
"4G",
"Cassa («box») in pannelli di fibra"
],
[
"4H",
"Cassa («box») in plastica"
],
[
"QS",
"Cassa («box») in plastica rigida"
],
[
"BW",
"Cassa («box») per liquidi"
],
[
"TC",
"Cassa («chest») da tè"
],
[
"FC",
"Cassa («crate») da frutta"
],
[
"CB",
"Cassa («crate») della birra"
],
[
"DC",
"Cassa («crate») di cartone multistrato"
],
[
"FD",
"Cassa a gabbia"
],
[
"SC",
"Cassa bassa («shallow crate»)"
],
[
"ED",
"Cassa-paletta"
],
[
"EF",
"Cassa-paletta di cartone"
],
[
"EE",
"Cassa-paletta di legno"
],
[
"EH",
"Cassa-paletta di metallo"
],
[
"EG",
"Cassa-paletta di plastica"
],
[
"CR",
"Cassetta"
],
[
"8B",
"Cassetta («crate») di legno"
],
[
"DB",
"Cassetta («crate») di legno multistrato"
],
[
"DM",
"Cassetta («crate») di legno per rinfuse"
],
[
"DA",
"Cassetta («crate») in plastica multistrato"
],
[
"DL",
"Cassetta («crate») in plastica per rinfuse"
],
[
"MA",
"Cassetta («crate») metallica"
],
[
"LU",
"Cassetta («Lug»)"
],
[
"DY",
"Cassetta («tray») di cartone, doppio strato, senza coperchio"
],
[
"DV",
"Cassetta («tray») di cartone, monostrato, senza coperchio"
],
[
"DX",
"Cassetta («tray») di legno, doppio strato, senza coperchio"
],
[
"DT",
"Cassetta («tray») di legno, monostrato, senza coperchio"
],
[
"DW",
"Cassetta («tray») di plastica, doppio strato, senza coperchio"
],
[
"DS",
"Cassetta («tray») di plastica, monostrato, senza coperchio"
],
[
"DU",
"Cassetta («tray») di polistirolo, monostrato, senza coperchio"
],
[
"IL",
"Cassetta («tray») rigida con coperchio, impilabile (CEN TS 14482: 2002)"
],
[
"NS",
"Cassetta allungabile («nest»)"
],
[
"MC",
"Cassetta del latte"
],
[
"DH",
"Cassetta Eurobox CHEP (Commonwealth Handling Equipment Pool)"
],
[
"BC",
"Cassetta, rastrelliera per bottiglie"
],
[
"LV",
"Cassone («liftvan»)"
],
[
"TL",
"Cassone con coperchio"
],
[
"TB",
"Cassone o vagoncino («tub»)"
],
[
"AI",
"Cestello con coperchio a cerniera («clamshell»)"
],
[
"PU",
"Cestello o cassetta («tray»)"
],
[
"PJ",
"Cestello tondo"
],
[
"BI",
"Cesto («bin»)"
],
[
"HC",
"Cesto di cartone con manico"
],
[
"HB",
"Cesto di legno con manico"
],
[
"HA",
"Cesto di plastica con manico"
],
[
"CY",
"Cilindro"
],
[
"B4",
"Cintura"
],
[
"CH",
"Cofano"
],
[
"PV",
"Condotti («pipe») in pacchi/mazzi/fasci"
],
[
"PI",
"Condotto («pipe»)"
],
[
"AJ",
"Cono"
],
[
"SS",
"Contenitore («case») di acciaio"
],
[
"7B",
"Contenitore («case») di legno"
],
[
"7A",
"Contenitore automobile"
],
[
"43",
"Contenitore di grandi dimensioni flessibile per rinfuse («big bag»)"
],
[
"ZQ",
"Contenitore di grandi dimensioni per liquidi alla rinfusa, con recipiente interno di plastica rigida"
],
[
"WK",
"Contenitore di grandi dimensioni per liquidi alla rinfusa, di acciaio"
],
[
"WL",
"Contenitore di grandi dimensioni per liquidi alla rinfusa, di alluminio"
],
[
"ZR",
"Contenitore di grandi dimensioni per liquidi alla rinfusa, di materiale composito, con recipiente interno di plastica morbida"
],
[
"WM",
"Contenitore di grandi dimensioni per liquidi alla rinfusa, di metallo"
],
[
"ZK",
"Contenitore di grandi dimensioni per liquidi alla rinfusa, di plastica rigida, autoportante"
],
[
"ZJ",
"Contenitore di grandi dimensioni per liquidi alla rinfusa, di plastica rigida, con struttura"
],
[
"ZF",
"Contenitore di grandi dimensioni per merce solida alla rinfusa, di plastica rigida, autoportante"
],
[
"ZD",
"Contenitore di grandi dimensioni per merce solida alla rinfusa, di plastica rigida, con struttura"
],
[
"ZM",
"Contenitore di grandi dimensioni per merce solida alla rinfusa, in materiale composito, con recipiente interno di plastica morbida"
],
[
"ZL",
"Contenitore di grandi dimensioni per merce solida alla rinfusa, in materiale composito, con recipiente interno di plastica rigida"
],
[
"WA",
"Contenitore di grandi dimensioni per rinfuse"
],
[
"WC",
"Contenitore di grandi dimensioni per rinfuse, di acciaio"
],
[
"WG",
"Contenitore di grandi dimensioni per rinfuse, di acciaio, con riempimento e svuotamento a pressione superiore a 10 kpa (0,1 bar)"
],
[
"WD",
"Contenitore di grandi dimensioni per rinfuse, di alluminio"
],
[
"WH",
"Contenitore di grandi dimensioni per rinfuse, di alluminio, con riempimento e svuotamento a pressione superiore a 10 kpa"
],
[
"ZA",
"Contenitore di grandi dimensioni per rinfuse, di carta multifoglio"
],
[
"ZC",
"Contenitore di grandi dimensioni per rinfuse, di carta multifoglio, resistente all’acqua"
],
[
"ZX",
"Contenitore di grandi dimensioni per rinfuse, di legno compensato"
],
[
"WY",
"Contenitore di grandi dimensioni per rinfuse, di legno compensato, con rinforzo"
],
[
"ZW",
"Contenitore di grandi dimensioni per rinfuse, di legno naturale"
],
[
"WU",
"Contenitore di grandi dimensioni per rinfuse, di legno naturale, con rinforzo"
],
[
"ZY",
"Contenitore di grandi dimensioni per rinfuse, di legno ricostituito"
],
[
"WZ",
"Contenitore di grandi dimensioni per rinfuse, di legno ricostituito, con rinforzo"
],
[
"WW",
"Contenitore di grandi dimensioni per rinfuse, di materia tessile, con fodera"
],
[
"WX",
"Contenitore di grandi dimensioni per rinfuse, di materia tessile, con fodera e rivestimento interno"
],
[
"WV",
"Contenitore di grandi dimensioni per rinfuse, di materia tessile, con rivestimento interno"
],
[
"WT",
"Contenitore di grandi dimensioni per rinfuse, di materia tessile, senza fodera o rivestimento"
],
[
"ZP",
"Contenitore di grandi dimensioni per rinfuse, di materiale composito, con recipiente interno di plastica morbida, per riempimento e svuotamento a pressione"
],
[
"ZN",
"Contenitore di grandi dimensioni per rinfuse, di materiale composito, con recipiente interno di plastica rigida, per riempimento e svuotamento a pressione"
],
[
"ZU",
"Contenitore di grandi dimensioni per rinfuse, di materiale morbido"
],
[
"ZS",
"Contenitore di grandi dimensioni per rinfuse, di materiali compositi"
],
[
"WF",
"Contenitore di grandi dimensioni per rinfuse, di metallo"
],
[
"ZV",
"Contenitore di grandi dimensioni per rinfuse, di metallo diverso dall’acciaio"
],
[
"WJ",
"Contenitore di grandi dimensioni per rinfuse, di metallo, per riempimento o svuotamento a pressione superiore a 10 kpa"
],
[
"AA",
"Contenitore di grandi dimensioni per rinfuse, di plastica rigida"
],
[
"ZH",
"Contenitore di grandi dimensioni per rinfuse, di plastica rigida, autoportante, per riempimento o svuotamento a pressione"
],
[
"ZG",
"Contenitore di grandi dimensioni per rinfuse, di plastica rigida, con struttura, per riempimento e svuotamento a pressione"
],
[
"WR",
"Contenitore di grandi dimensioni per rinfuse, di plastica, con rivestimento interno e rinforzo"
],
[
"WN",
"Contenitore di grandi dimensioni per rinfuse, di plastica, senza rivestimento interno o rinforzo"
],
[
"WQ",
"Contenitore di grandi dimensioni per rinfuse, di tessuto plastico, con rinforzo"
],
[
"WP",
"Contenitore di grandi dimensioni per rinfuse, di tessuto plastico, con rivestimento interno"
],
[
"WS",
"Contenitore di grandi dimensioni per rinfuse, in film di plastica"
],
[
"ZT",
"Contenitore di grandi dimensioni per rinfuse, in pannelli di fibra"
],
[
"OU",
"Contenitore esterno"
],
[
"1F",
"Contenitore flessibile"
],
[
"FB",
"Contenitore flessibile («flexibag»)"
],
[
"FX",
"Contenitore flessibile a sacco"
],
[
"GL",
"Contenitore gallone"
],
[
"EI",
"Contenitore isotermico"
],
[
"ME",
"Contenitore metallico"
],
[
"CN",
"Contenitore senza altra precisione"
],
[
"TG",
"Contenitore serbatoio generico"
],
[
"CU",
"Coppa"
],
[
"DJ",
"Damigiana non protetta"
],
[
"DP",
"Damigiana protetta"
],
[
"ZZ",
"Definizione comune"
],
[
"TS",
"Fascio («truss»)"
],
[
"VI",
"Fiala"
],
[
"FL",
"Flacone"
],
[
"SZ",
"Fogli in pacchi/mazzi/fasci"
],
[
"ST",
"Foglio"
],
[
"SL",
"Foglio protettivo («slipsheet»)"
],
[
"SP",
"Foglio, rivestimento di plastica"
],
[
"DR",
"Fusto"
],
[
"1A",
"Fusto di acciaio"
],
[
"QB",
"Fusto di acciaio con coperchio amovibile"
],
[
"QA",
"Fusto di acciaio con coperchio non amovibile"
],
[
"1B",
"Fusto di alluminio"
],
[
"QD",
"Fusto di alluminio con coperchio amovibile"
],
[
"QC",
"Fusto di alluminio con coperchio non amovibile"
],
[
"1G",
"Fusto di cartone"
],
[
"DI",
"Fusto di ferro"
],
[
"1W",
"Fusto di legno"
],
[
"1D",
"Fusto di legno compensato"
],
[
"IH",
"Fusto di plastica"
],
[
"QG",
"Fusto di plastica con coperchio amovibile"
],
[
"QF",
"Fusto di plastica con coperchio non amovibile"
],
[
"CG",
"Gabbia"
],
[
"PF",
"Gabbia («pen»)"
],
[
"DG",
"Gabbia Eurobox CHEP (Commonwealth Handling Equipment Pool)"
],
[
"VG",
"Gas alla rinfusa (a 1 031 mbar e a 15 °C)"
],
[
"VQ",
"Gas liquefatto, alla rinfusa (a temperatura/pressione anormale)"
],
[
"DN",
"Generatore aerosol"
],
[
"JR",
"Giara"
],
[
"6H",
"Imballaggio composito, recipiente di plastica"
],
[
"YB",
"Imballaggio composito, recipiente di plastica con cassa esterna di acciaio"
],
[
"YD",
"Imballaggio composito, recipiente di plastica con cassa esterna di alluminio"
],
[
"YK",
"Imballaggio composito, recipiente di plastica con cassa esterna di cartone"
],
[
"YF",
"Imballaggio composito, recipiente di plastica con cassa esterna di legno"
],
[
"YH",
"Imballaggio composito, recipiente di plastica con cassa esterna di legno compensato"
],
[
"YM",
"Imballaggio composito, recipiente di plastica con cassa esterna di plastica rigida"
],
[
"YA",
"Imballaggio composito, recipiente di plastica con fusto esterno di acciaio"
],
[
"YC",
"Imballaggio composito, recipiente di plastica con fusto esterno di alluminio"
],
[
"YJ",
"Imballaggio composito, recipiente di plastica con fusto esterno di cartone"
],
[
"YG",
"Imballaggio composito, recipiente di plastica con fusto esterno di legno compensato"
],
[
"YL",
"Imballaggio composito, recipiente di plastica con fusto esterno di plastica"
],
[
"6P",
"Imballaggio composito, recipiente di vetro"
],
[
"YP",
"Imballaggio composito, recipiente di vetro con cassa esterna di acciaio"
],
[
"YR",
"Imballaggio composito, recipiente di vetro con cassa esterna di alluminio"
],
[
"YX",
"Imballaggio composito, recipiente di vetro con cassa esterna di cartone"
],
[
"YS",
"Imballaggio composito, recipiente di vetro con cassa esterna di legno"
],
[
"YN",
"Imballaggio composito, recipiente di vetro con fusto esterno di acciaio"
],
[
"YQ",
"Imballaggio composito, recipiente di vetro con fusto esterno di alluminio"
],
[
"YW",
"Imballaggio composito, recipiente di vetro con fusto esterno di cartone"
],
[
"YT",
"Imballaggio composito, recipiente di vetro con fusto esterno di legno compensato"
],
[
"YY",
"Imballaggio composito, recipiente di vetro con imballaggio esterno di materiale plastico espanso"
],
[
"YZ",
"Imballaggio composito, recipiente di vetro con imballaggio esterno di plastica rigida"
],
[
"YV",
"Imballaggio composito, recipiente di vetro con paniere esterno di vimini"
],
[
"IE",
"Imballaggio con finestra"
],
[
"IG",
"Imballaggio con rivestimento di carta"
],
[
"IK",
"Imballaggio di cartone con fori di presa"
],
[
"IB",
"Imballaggio di presentazione di cartone"
],
[
"IA",
"Imballaggio di presentazione di legno"
],
[
"ID",
"Imballaggio di presentazione di metallo"
],
[
"IC",
"Imballaggio di presentazione di plastica"
],
[
"VP",
"Imballaggio sottovuoto"
],
[
"SW",
"Imballaggio termoretrattile («shrinkwrapped»)"
],
[
"IF",
"Imballaggio tubolare"
],
[
"FR",
"Intelaiatura"
],
[
"SK",
"Intelaiatura di cassa"
],
[
"SV",
"Involucro di acciaio"
],
[
"KI",
"Kit"
],
[
"SM",
"Lamiera"
],
[
"PG",
"Lastra («plate»)"
],
[
"SB",
"Lastra («slab»)"
],
[
"PY",
"Lastre («plate») in pacchi/mazzi/fasci"
],
[
"UC",
"Libero (animale)"
],
[
"IZ",
"Lingotti in pacchi/mazzi/fasci"
],
[
"IN",
"Lingotto"
],
[
"VL",
"Liquidi alla rinfusa"
],
[
"LT",
"Lotto"
],
[
"SY",
"Manicotto"
],
[
"BH",
"Mazzo"
],
[
"NE",
"Merce disimballata o non imballata"
],
[
"NF",
"Merce disimballata o non imballata in un’unica unità"
],
[
"NG",
"Merce disimballata o non imballata in varie unità"
],
[
"OT",
"Octabin"
],
[
"PA",
"Pacchetto"
],
[
"BE",
"Pacco («bundle»)"
],
[
"8C",
"Pacco («bundle») di legno"
],
[
"PK",
"Pacco («package»)"
],
[
"PC",
"Pacco («parcel»)"
],
[
"PX",
"Paletta"
],
[
"AH",
"Paletta 100 × 110 cm"
],
[
"AG",
"Paletta con rivestimento termoretrattile"
],
[
"8A",
"Paletta di legno"
],
[
"PD",
"Paletta modulare, con piedini, di 80 × 100 cm"
],
[
"PE",
"Paletta modulare, con piedini, di 80 × 120 cm"
],
[
"AF",
"Paletta modulare, con piedini, di 80 × 60 cm"
],
[
"PB",
"Paletta scatola («pallet box»)"
],
[
"TW",
"Paletta «triwall»"
],
[
"OD",
"Paletta, AS 4068-1993"
],
[
"OC",
"Paletta, CHEP 100 cm x 120 cm"
],
[
"OA",
"Paletta, CHEP 40 cm x 60 cm"
],
[
"OB",
"Paletta, CHEP 80 cm x 120 cm"
],
[
"OE",
"Paletta, ISO T11"
],
[
"AL",
"Palla"
],
[
"BF",
"Pallone non protetto"
],
[
"BP",
"Pallone protetto"
],
[
"CE",
"Paniere («creel»)"
],
[
"HR",
"Paniere («hamper»)"
],
[
"BY",
"Pannelli («board») in pacchi/mazzi/fasci"
],
[
"BD",
"Pannello («board»)"
],
[
"VY",
"Particelle alla rinfusa, solide, fini («polveri»)"
],
[
"VO",
"Particelle alla rinfusa, solide, grandi («noduli»)"
],
[
"VR",
"Particelle alla rinfusa, solide, granulari («grani»)"
],
[
"FP",
"Pellicola plastica («filmpack»)"
],
[
"PP",
"Pezzo"
],
[
"OF",
"Piattaforma di peso o dimensioni non specificate"
],
[
"TE",
"Pneumatico"
],
[
"RJ",
"Rastrelliera, attaccapanni"
],
[
"MW",
"Recipiente con rivestimento di plastica"
],
[
"AC",
"Recipiente di carta"
],
[
"AB",
"Recipiente di cartone"
],
[
"AD",
"Recipiente di legno"
],
[
"MR",
"Recipiente di metallo"
],
[
"PR",
"Recipiente di plastica"
],
[
"GR",
"Recipiente di vetro"
],
[
"NT",
"Rete («net»)"
],
[
"NV",
"Rete tubolare di materiale tessile"
],
[
"NU",
"Rete tubolare di plastica"
],
[
"CW",
"Roll"
],
[
"BT",
"Rotolo («bolt»)"
],
[
"RO",
"Rotolo («roll»)"
],
[
"VS",
"Rottami metallici alla rinfusa *"
],
[
"MB",
"Sacchetto («bag») multistrato"
],
[
"PO",
"Sacchetto («pouch»)"
],
[
"SH",
"Sacchetto («sachet»)"
],
[
"44",
"Sacco («polybag»)"
],
[
"SA",
"Sacco («sack»)"
],
[
"MS",
"Sacco («sack») multifoglio"
],
[
"TT",
"Sacco da trasporto"
],
[
"5M",
"Sacco di carta"
],
[
"XJ",
"Sacco di carta multifoglio"
],
[
"XK",
"Sacco di carta multifoglio, resistente all’acqua"
],
[
"JB",
"Sacco di dimensioni molto grandi («jumbo»)"
],
[
"ZB",
"Sacco di grandi dimensioni"
],
[
"JT",
"Sacco di juta"
],
[
"5L",
"Sacco di materia tessile"
],
[
"XH",
"Sacco di materia tessile resistente all’acqua"
],
[
"XG",
"Sacco di materia tessile stagno alle polveri"
],
[
"XF",
"Sacco di materia tessile, senza fodera o rivestimento interno"
],
[
"EC",
"Sacco di plastica"
],
[
"GY",
"Sacco di tela"
],
[
"XC",
"Sacco di tessuto di materia plastica, resistente all’acqua"
],
[
"XA",
"Sacco di tessuto di materia plastica, senza fodera o rivestimento interno"
],
[
"XB",
"Sacco di tessuto di materia plastica, stagno alle polveri"
],
[
"5H",
"Sacco di tessuto di plastica"
],
[
"XD",
"Sacco in film di plastica"
],
[
"RT",
"Sacco in rete («rednet»)"
],
[
"RK",
"Scaffalatura («rack»)"
],
[
"BX",
"Scatola"
],
[
"CS",
"Scatola («case»)"
],
[
"MX",
"Scatola di fiammiferi"
],
[
"BJ",
"Secchio («bucket»)"
],
[
"PL",
"Secchio («pail»)"
],
[
"NA",
"Senza oggetto"
],
[
"TY",
"Serbatoio cilindrico"
],
[
"FE",
"Serbatoio flessibile («flexitank»)"
],
[
"TK",
"Serbatoio rettangolare"
],
[
"SI",
"Skid"
],
[
"JY",
"Tanica cilindrica"
],
[
"3A",
"Tanica di acciaio"
],
[
"QL",
"Tanica di acciaio con coperchio amovibile"
],
[
"QK",
"Tanica di acciaio con coperchio non amovibile"
],
[
"3H",
"Tanica di plastica"
],
[
"QN",
"Tanica di plastica con coperchio amovibile"
],
[
"QM",
"Tanica di plastica con coperchio non amovibile"
],
[
"JC",
"Tanica rettangolare"
],
[
"PN",
"Tavola («plank»)"
],
[
"PZ",
"Tavole («plank») in pacchi/mazzi/fasci"
],
[
"T1",
"Tavoletta"
],
[
"MT",
"Tela di sacco"
],
[
"CZ",
"Telone"
],
[
"VA",
"Tino"
],
[
"GI",
"Trave"
],
[
"GZ",
"Travi in pacchi/mazzi/fasci"
],
[
"LZ",
"Tronchi in pacchi/mazzi/fasci"
],
[
"LG",
"Tronco"
],
[
"TZ",
"Tubi («tubes») in pacchi/mazzi/fasci"
],
[
"TU",
"Tubo («tube»)"
],
[
"TV",
"Tubo a imbuto"
],
[
"TD",
"Tubo flessibile («collapsible tube»)"
],
[
"UN",
"Unità"
],
[
"SU",
"Valigia"
],
[
"VK",
"Vanpack"
],
[
"BM",
"Vaschetta"
],
[
"FT",
"Vaschetta per alimenti («foodtainer»)"
],
[
"PT",
"Vaso"
],
[
"VN",
"Veicolo"
],
[
"RD",
"Vergella"
],
[
"RZ",
"Vergelle in pacchi/mazzi/fasci"
]
],
"natura":[
[
"11",
"Vendita/acquisto a titolo definitivo, esclusi gli scambi diretti con consumatori privati"
],
[
"12",
"Scambi diretti con consumatori privati o da parte di questi (compresa la vendita a distanza)"
],
[
"21",
"Restituzione di merci"
],
[
"22",
"Sostituzione di merci restituite"
],
[
"23",
"Sostituzione (per esempio in garanzia) di merci non restituite"
],
[
"31",
"Movimenti da/verso un deposito (esclusi call-off stock e consignment stock)"
],
[
"32",
"Spedizione in visione o in prova a fini di vendita (compresi call-off stock e consignment stock)"
],
[
"33",
"Leasing finanziario"
],
[
"34",
"Trasferimento della proprietà senza corrispettivo finanziario"
],
[
"41",
"Lavorazione per conto terzi: merci che ritornano nel paese iniziale"
],
[
"42",
"Lavorazione per conto terzi: merci che non ritornano nel paese iniziale"
],
[
"51",
"Dopo una lavorazione per conto terzi: merci che ritornano nel paese iniziale"
],
[
"52",
"Dopo una lavorazione per conto terzi: merci che non ritornano nel paese iniziale"
],
[
"60",
"Particolari transazioni registrate a fini nazionali (noleggio, prestito, leasing operativo fino a 24 mesi)"
],
[
"71",
"Immissione in libera pratica con successiva spedizione in un altro Stato membro (quasi importazione)"
],
[
"72",
"Trasporto da un altro Stato membro per l'esportazione (quasi esportazione)"
],
[
"80",
"Materiali da costruzione e attrezzature in un contratto generale di costruzione o di genio civile"
],
[
"91",
"Locazione, prestito e leasing operativo per oltre 24 mesi"
],
[
"99",
"Altre transazioni (comprese le riparazioni)"
]
],
"modi":[
[
"1",
"Trasporto via mare"
],
[
"2",
"Trasporto per ferrovia"
],
[
"3",
"Trasporto su strada"
],
[
"4",
"Trasporto aereo"
],
[
"5",
"Spedizioni postali"
],
[
"7",
"Installazioni di trasporto fisse"
],
[
"8",
"Trasporto per via navigabile interna"
],
[
"9",
"Propulsione propria"
]
],
"aggiunte":[
[
"AB",
"Commissioni e spese di mediazione (escluse le commissioni di acquisto)"
],
[
"AD",
"Container e imballaggi"
],
[
"AE",
"Materiali, componenti e parti incorporati nelle merci"
],
[
"AF",
"Utensili, matrici, stampi usati per produrre le merci"
],
[
"AG",
"Materiali consumati nella produzione"
],
[
"AH",
"Lavori di ingegneria, sviluppo, arte, design eseguiti fuori dall'UE"
],
[
"AI",
"Corrispettivi (royalty) e diritti di licenza"
],
[
"AJ",
"Proventi di rivendita, cessione o utilizzazione che ritornano al venditore"
],
[
"AK",
"Trasporto, carico, movimentazione e assicurazione fino al luogo di introduzione nell'UE"
],
[
"AL",
"Pagamenti indiretti e altri pagamenti"
],
[
"AN",
"Aggiunte in base a una decisione (art. 71 Reg. 2015/2446)"
]
],
"detrazioni":[
[
"BA",
"Trasporto dopo l'arrivo nel luogo di introduzione"
],
[
"BB",
"Costruzione, installazione, montaggio, manutenzione o assistenza dopo l'importazione"
],
[
"BC",
"Dazi all'importazione e altri oneri da pagare nell'UE"
],
[
"BD",
"Oneri per interessi"
],
[
"BE",
"Diritto di riproduzione nell'UE"
],
[
"BF",
"Commissioni di acquisto"
],
[
"BG",
"Detrazioni in base a una decisione (art. 71 Reg. 2015/2446)"
]
],
"metodi":[
[
"1",
"Valore di transazione delle merci importate (art. 70 del codice)"
],
[
"2",
"Valore di transazione di merci identiche"
],
[
"3",
"Valore di transazione di merci similari"
],
[
"4",
"Metodo deduttivo"
],
[
"5",
"Metodo del valore calcolato"
],
[
"6",
"Valore basato sui dati disponibili (metodo residuale)"
]
],
"qualifica":[
[
"2",
"Rappresentanza diretta"
],
[
"3",
"Rappresentanza indiretta"
]
]
};
  if (typeof module === 'object' && module.exports) module.exports = CODICI;
  else radice.TARIC_CODICI = CODICI;
})(this);
