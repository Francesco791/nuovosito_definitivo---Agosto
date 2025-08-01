const fs = require('fs');
const http = require('http');
const https = require('https');
const { execSync } = require('child_process');
const { parseStringPromise } = require('xml2js');

const xmlUrl = "http://partner.miogest.com/agenzie/vella.xml";
const TEMPLATE_PATH = './template.html';
const OUTPUT_PATH = './index.html';

function fetchXML(url) {
  return new Promise((resolve, reject) => {
    const isHttps = url.startsWith('https');
    const httpModule = isHttps ? https : http;
    
    const options = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'application/xml, text/xml, */*',
        'Accept-Language': 'it-IT,it;q=0.9,en;q=0.8',
        'Accept-Encoding': 'gzip, deflate',
        'Connection': 'keep-alive',
        'Cache-Control': 'no-cache'
      },
      timeout: 30000
    };

    const req = httpModule.get(url, options, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchXML(res.headers.location).then(resolve).catch(reject);
      }
      
      if (res.statusCode !== 200) {
        reject(new Error(`Status Code: ${res.statusCode}`));
        return;
      }

      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    });

    req.on('error', reject);
    req.setTimeout(30000);
  });
}

// FUNZIONE MIGLIORATA per estrarre caratteristiche dall'annuncio + descrizione
function estraiCaratteristiche(annuncio) {
  const get = (tag) => annuncio[tag]?.[0] || '';
  const caratteristiche = [];
  
  // Campi da analizzare (tutti in lowercase per confronto)
  const titolo = get('Titolo').toLowerCase();
  const descrizione = get('Descrizione').toLowerCase();
  const panorama = get('Scheda_Panorama').toLowerCase();
  const giardino = get('Scheda_Giardino').toLowerCase();
  const balconi = get('Scheda_Balconi').toLowerCase();
  const terrazzi = get('Scheda_Terrazzi').toLowerCase();
  const mqGiardino = parseInt(get('MqGiardino')) || 0;
  const mqTerrazzo = parseInt(get('MqTerrazzo')) || 0;
  const mqBalconi = parseInt(get('MqBalconi')) || 0;
  const postiAuto = parseInt(get('PostiAuto')) || 0;

  // Testo completo per ricerca avanzata
  const testoCompleto = `${titolo} ${descrizione} ${panorama} ${giardino} ${balconi} ${terrazzi}`;

  // === VISTA LAGO ===
  const vistaTermini = ['vista', 'lago', 'panorama', 'aperta', 'mozzafiato', 'panoramic'];
  if (vistaTermini.some(termine => testoCompleto.includes(termine)) || 
      panorama.includes('vista') || panorama.includes('lago') || panorama.includes('aperta')) {
    caratteristiche.push('vista_lago');
  }

  // === ATTICO ===
  const atticoTermini = ['attico', 'penthouse', 'ultimo piano'];
  if (atticoTermini.some(termine => testoCompleto.includes(termine))) {
    caratteristiche.push('attico');
  }

  // === GIARDINO ===
  const giardinoTermini = ['giardino', 'verde', 'privato verde', 'spazio verde'];
  if (giardino === 'privato' || 
      mqGiardino > 0 || 
      giardinoTermini.some(termine => testoCompleto.includes(termine))) {
    caratteristiche.push('giardino');
  }

  // === PISCINA ===
  const piscinaTermini = ['piscina', 'pool', 'vasca', 'idromassaggio'];
  if (piscinaTermini.some(termine => testoCompleto.includes(termine))) {
    caratteristiche.push('piscina');
  }

  // === IN COSTRUZIONE ===
  const costruzioneTermini = [
    'costruzione', 'nuovo', 'nuova costruzione', 'in costruzione', 
    'di nuova costruzione', 'nascer', 'nasce', 'progett', 'realizzazione',
    'cantiere', 'edificio nuovo', 'immobile nuovo'
  ];
  if (costruzioneTermini.some(termine => testoCompleto.includes(termine))) {
    caratteristiche.push('costruzione');
  }

  // === DA RISTRUTTURARE ===
  const ristrutturareTermini = [
    'ristruttur', 'ristrutt', 'da ristrutturare', 'da rinnovare', 
    'da sistemare', 'da rimettere', 'completamente da', 'completare',
    'rinnovare', 'sistemare', 'riattare'
  ];
  if (ristrutturareTermini.some(termine => testoCompleto.includes(termine))) {
    caratteristiche.push('ristrutturare');
  }

  // === ALTRE CARATTERISTICHE ESISTENTI ===
  // Terrazzo
  if (mqTerrazzo > 0 || 
      terrazzi !== 'no' ||
      testoCompleto.includes('terrazzo') ||
      testoCompleto.includes('terrazza')) {
    caratteristiche.push('terrazzo');
  }

  // Box/Garage
  if (postiAuto > 0 || 
      testoCompleto.includes('garage') || 
      testoCompleto.includes('box') ||
      testoCompleto.includes('posto auto')) {
    caratteristiche.push('box');
  }

  const caratteristicheStr = caratteristiche.join(',');
  console.log(`🏷️ Caratteristiche estratte: ${caratteristicheStr}`);
  
  return caratteristicheStr;
}

// FUNZIONE MIGLIORATA per determinare la tipologia dell'immobile
function determinaTipologia(annuncio) {
  const get = (tag) => annuncio[tag]?.[0] || '';
  const titolo = get('Titolo').toLowerCase();
  const descrizione = get('Descrizione').toLowerCase();
  const tipologia = get('Tipologia').toLowerCase();
  const categoria = get('Categoria');
  
  // Testo completo per analisi
  const testoCompleto = `${titolo} ${descrizione}`;
  
  // === APPARTAMENTO ===
  const appartamentoTermini = ['appartamento', 'attico', 'penthouse', 'bilocale', 'trilocale', 'quadrilocale'];
  if (appartamentoTermini.some(termine => testoCompleto.includes(termine))) {
    return 'appartamento';
  }
  
  // === CASA ===
  const casaTermini = ['villa', 'casa', 'unifamiliare', 'bifamiliare', 'residenza', 'dimora'];
  if (casaTermini.some(termine => testoCompleto.includes(termine))) {
    return 'casa';
  }
  
  // === TERRENO ===
  const terrenoTermini = ['terreno', 'lotto', 'area edificabile', 'superficie'];
  if (terrenoTermini.some(termine => testoCompleto.includes(termine))) {
    return 'terreno';
  }
  
  // === COMMERCIALE ===  
  const commercialeTermini = ['ufficio', 'commerciale', 'negozio', 'locale', 'attività', 'business'];
  if (commercialeTermini.some(termine => testoCompleto.includes(termine))) {
    return 'commerciale';
  }

  // Mappatura basata sulla tipologia XML (fallback)
  if (tipologia === 'v') return 'casa'; // Villa
  if (tipologia === 'a') return 'appartamento'; // Appartamento  
  if (tipologia === 'u') return 'commerciale'; // Ufficio
  
  // Mappatura basata sui codici categoria (fallback)
  const catNum = parseInt(categoria) || 0;
  if ([26, 32, 33, 18].includes(catNum)) return 'appartamento';
  if ([28, 48, 119, 82].includes(catNum)) return 'casa';
  if ([93].includes(catNum)) return 'terreno';
  if ([1, 37].includes(catNum)) return 'commerciale';
  
  // Fallback finale: appartamento
  return 'appartamento';
}

// Estrai il link dell'annuncio dalle LandingPages
function estraiLinkLandingPage(annuncio, index) {
  const get = (tag) => annuncio[tag]?.[0] || '';
  
  // Debug: ispeziona LandingPages per il primo annuncio
  if (index === 0) {
    console.log('\n🔍 === ANALISI LANDING PAGES ===');
    const landingPages = annuncio.LandingPages?.[0];
    console.log('📋 LandingPages tipo:', typeof landingPages);
    console.log('📋 LandingPages valore:', JSON.stringify(landingPages, null, 2));
  }
  
  let link = '';
  
  // Prova a estrarre da LandingPages
  const landingPages = annuncio.LandingPages?.[0];
  if (landingPages && typeof landingPages === 'object') {
    // NUOVO: Gestisci la struttura corretta con campo '_'
    if (landingPages.Url && Array.isArray(landingPages.Url) && landingPages.Url[0]) {
      const urlObj = landingPages.Url[0];
      if (typeof urlObj === 'object' && urlObj._) {
        // Struttura: { _: 'url', '$': { lingua: 'it' } }
        link = urlObj._;
      } else if (typeof urlObj === 'string') {
        // Struttura semplice: ['url']
        link = urlObj;
      }
    }
    
    // Prova altri possibili campi se Url non funziona
    if (!link && landingPages.Link && Array.isArray(landingPages.Link) && landingPages.Link[0]) {
      const linkObj = landingPages.Link[0];
      if (typeof linkObj === 'object' && linkObj._) {
        link = linkObj._;
      } else if (typeof linkObj === 'string') {
        link = linkObj;
      }
    }
  }
  
  // Fallback: prova altri campi standard
  if (!link) {
    link = get('Url') || get('Link') || get('UrlAnnuncio') || '';
  }
  
  // Se ancora non trovato, genera link con codice annuncio
  if (!link) {
    const codice = get('Codice');
    const annuncioId = get('AnnuncioId');
    
    if (codice) {
      // Link diretto al sito con codice
      link = `https://porpoise-helicon-zwed.squarespace.com/proprieta?codice=${codice}`;
    } else if (annuncioId) {
      // Link con ID annuncio
      link = `https://porpoise-helicon-zwed.squarespace.com/proprieta?id=${annuncioId}`;
    } else {
      // Link generico alla sezione proprietà
      link = 'https://porpoise-helicon-zwed.squarespace.com/proprieta';
    }
  }
  
  return link;
}

function generateCard(annuncio, index) {
  const get = (tag) => annuncio[tag]?.[0] || '';
  
  // Estrai tutti i campi
  const foto = get('Foto') || 'https://via.placeholder.com/400x250/6E5C4F/ffffff?text=Immagine+non+disponibile';
  const titolo = get('Titolo') || 'Immobile senza titolo';
  const comune = get('Comune') || 'Località non specificata';
  const regione = get('Regione') || '';
  const provincia = get('Provincia') || '';
  const prezzo = get('Prezzo') || '0';
  const valuta = get('Valuta') || 'CHF';
  const descrizione = get('Descrizione') || 'Descrizione non disponibile';
  const contratto = (get('Offerta') === 'si' ? 'vendita' : 'affitto').toLowerCase();
  
  // NUOVO: Estrai link dalle LandingPages
  const linkAnnuncio = estraiLinkLandingPage(annuncio, index);
  
  // Dati tecnici
  const mq = get('Mq') || '0';
  const vani = get('Vani') || '0';
  const camere = get('Camere') || '0';
  const bagni = get('Bagni') || '0';
  const categoria = get('Categoria') || '';
  const tipologiaImmobile = determinaTipologia(annuncio);
  const caratteristiche = estraiCaratteristiche(annuncio);
  
  // Formatta il prezzo
  const prezzoNum = parseInt(prezzo) || 0;
  const prezzoFormattato = prezzoNum > 0 
    ? `${valuta} ${prezzoNum.toLocaleString('it-CH')}` 
    : 'Prezzo su richiesta';

  const descrizioneShort = descrizione.length > 150
    ? descrizione.substring(0, 150) + '...'
    : descrizione;

  console.log(`✅ Card ${index + 1}: "${titolo}" - ${comune} - ${prezzoFormattato}`);
  console.log(`🏠 Tipologia: ${tipologiaImmobile} | Caratteristiche: ${caratteristiche}`);
  console.log(`🔗 Link: ${linkAnnuncio}`);

  return `
    <div class="property-card" data-lat="${property.Latitudine}" data-lon="${property.Longitudine}" 
         data-contratto="${contratto}"
         data-categoria="${tipologiaImmobile}"
         data-categoria-codici="${categoria}"
         data-caratteristiche="${caratteristiche}"
         data-comune="${comune.toLowerCase()}"
         data-regione="${regione.toLowerCase()}"
         data-provincia="${provincia.toLowerCase()}"
         data-prezzo="${prezzo}"
         data-mq="${mq}"
         data-vani="${vani}"
         data-camere="${camere}"
         data-bagni="${bagni}"
         data-titolo="${titolo.toLowerCase()}"
         data-descrizione="${descrizione.toLowerCase()}">
      <div class="property-image">
        <img src="${foto}" alt="${titolo}" onerror="this.src='https://via.placeholder.com/400x250/6E5C4F/ffffff?text=Immagine+non+disponibile'">
      </div>
      <div class="property-details">
        <div class="property-title">${titolo}</div>
        <div class="property-location">${comune}${regione ? ', ' + regione : ''}</div>
        <div class="property-price">${prezzoFormattato}</div>
        <div class="property-specs">${mq} m² • ${vani} vani • ${camere} camere • ${bagni} bagni</div>
        <div class="property-description">${descrizioneShort}</div>
        <div class="property-buttons">
          <a class="view-button" href="${linkAnnuncio}" target="_blank">
            Vedi Dettagli
          </a>
          <a class="contact-button" href="https://porpoise-helicon-zwed.squarespace.com/proprieta2025#block-cb204e945f5df288b86a" target="_top">
            Contattaci
          </a>
        </div>
      </div>
    </div>
  `;
}

(async () => {
  try {
    console.log("📥 Scarico il feed XML...");
    const xmlData = await fetchXML(xmlUrl);

    console.log("📦 Parsing del feed...");
    const parsed = await parseStringPromise(xmlData);
    const annunci = parsed.Annunci?.Annuncio || [];

    console.log(`🧱 Trovati ${annunci.length} annunci nel feed`);

    if (!annunci.length) {
      console.log('⚠️ Nessun annuncio trovato nel feed XML.');
      process.exit(1);
    }

    console.log(`🏗️ Genero ${annunci.length} card complete con caratteristiche migliorate...`);
    const cardsHtml = annunci.map(generateCard).filter(Boolean).join('\n');

    console.log("🧩 Carico il template...");
    const template = fs.readFileSync(TEMPLATE_PATH, 'utf8');
    const output = template.replace('<!-- PROPERTIES_CARDS -->', cardsHtml);

    fs.writeFileSync(OUTPUT_PATH, output, 'utf8');
    console.log('✅ index.html generato con successo!');

    // Statistiche dettagliate
    const tipi = {};
    const caratteristicheStats = {};
    
    annunci.forEach(annuncio => {
      const tipo = determinaTipologia(annuncio);
      tipi[tipo] = (tipi[tipo] || 0) + 1;
      
      const caratteristiche = estraiCaratteristiche(annuncio).split(',').filter(c => c.trim());
      caratteristiche.forEach(char => {
        caratteristicheStats[char] = (caratteristicheStats[char] || 0) + 1;
      });
    });
    
    console.log('\n📊 Statistiche immobili per tipologia:');
    Object.entries(tipi).forEach(([tipo, count]) => {
      console.log(`  ${tipo}: ${count} immobili`);
    });
    
    console.log('\n🏷️ Statistiche caratteristiche:');
    Object.entries(caratteristicheStats)
      .sort(([,a], [,b]) => b - a)
      .forEach(([char, count]) => {
        if (char) console.log(`  ${char}: ${count} immobili`);
      });

    // Commit & push
    console.log("\n🔁 Controllo modifiche...");
    try {
      execSync('git config user.name "github-actions[bot]"');
      execSync('git config user.email "github-actions[bot]@users.noreply.github.com"');
      execSync('git add index.html');

      try {
        execSync('git diff --cached --quiet');
        console.log("🟢 Nessuna modifica da committare.");
      } catch {
        console.log("📝 Committo le modifiche...");
        execSync(`git commit -m "🔄 Aggiornamento automatico del ${new Date().toLocaleString('it-IT')} - Caratteristiche migliorate"`);
        console.log("🚀 Eseguo push...");
        execSync('git push');
        console.log("✅ Push completato con successo!");
      }
    } catch (gitError) {
      console.log("⚠️ Errore Git (ignorato):", gitError.message);
    }

  } catch (err) {
    console.error('❌ Errore durante la generazione:', err.message);
    
    // Fallback: mantieni il file esistente
    if (fs.existsSync(OUTPUT_PATH)) {
      console.log("🔄 Errore nel feed, mantengo l'index.html esistente");
      process.exit(0);
    } else {
      process.exit(1);
    }
  }
})();