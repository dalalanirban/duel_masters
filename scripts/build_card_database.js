const fs = require('fs');
const path = require('path');
const https = require('https');

const RAW_URL = 'https://raw.githubusercontent.com/Latepate64/duel-masters-json/master/DuelMastersCards.json';
const RAW_CACHE_PATH = path.resolve('data/raw_cards.json');

const SETS_METADATA = [
  { id: 'DM-01', code: 'DM-01', name: 'Base Set', fullName: 'DM-01 Base Set', cardCount: 120, superRares: 10, regularCards: 110 },
  { id: 'DM-02', code: 'DM-02', name: 'Evo-Crushinators of Doom', fullName: 'DM-02 Evo-Crushinators of Doom', cardCount: 60, superRares: 5, regularCards: 55 },
  { id: 'DM-03', code: 'DM-03', name: 'Rampage of the Super Warriors', fullName: 'DM-03 Rampage of the Super Warriors', cardCount: 60, superRares: 5, regularCards: 55 },
  { id: 'DM-04', code: 'DM-04', name: 'Shadowclash of Blinding Night', fullName: 'DM-04 Shadowclash of Blinding Night', cardCount: 60, superRares: 5, regularCards: 55 },
  { id: 'DM-05', code: 'DM-05', name: 'Survivors of the Megapocalypse', fullName: 'DM-05 Survivors of the Megapocalypse', cardCount: 60, superRares: 5, regularCards: 55 },
  { id: 'DM-06', code: 'DM-06', name: 'Stomp-A-Trons of Invincible Wrath', fullName: 'DM-06 Stomp-A-Trons of Invincible Wrath', cardCount: 120, superRares: 10, regularCards: 110 },
  { id: 'DM-07', code: 'DM-07', name: 'Thundercharge of Ultra Destruction', fullName: 'DM-07 Thundercharge of Ultra Destruction', cardCount: 60, superRares: 5, regularCards: 55 },
  { id: 'DM-08', code: 'DM-08', name: 'Epic Dragons of Hyperchaos', fullName: 'DM-08 Epic Dragons of Hyperchaos', cardCount: 60, superRares: 5, regularCards: 55 },
  { id: 'DM-09', code: 'DM-09', name: 'Fatal Brood of Infinite Ruin', fullName: 'DM-09 Fatal Brood of Infinite Ruin', cardCount: 60, superRares: 5, regularCards: 55 },
  { id: 'DM-10', code: 'DM-10', name: 'Shockwaves of the Shattered Rainbow', fullName: 'DM-10 Shockwaves of the Shattered Rainbow', cardCount: 120, superRares: 10, regularCards: 110 },
  { id: 'DM-11', code: 'DM-11', name: 'Blastosplosion of Gigantic Rage', fullName: 'DM-11 Blastosplosion of Gigantic Rage', cardCount: 60, superRares: 5, regularCards: 55 },
  { id: 'DM-12', code: 'DM-12', name: 'Thrash of the Hybrid Megacreatures', fullName: 'DM-12 Thrash of the Hybrid Megacreatures', cardCount: 60, superRares: 5, regularCards: 55 }
];

function downloadRawData(url, dest) {
  return new Promise((resolve, reject) => {
    if (fs.existsSync(dest) && fs.statSync(dest).size > 1000) {
      return resolve(JSON.parse(fs.readFileSync(dest, 'utf8')));
    }
    console.log(`Downloading raw data from ${url}...`);
    https.get(url, (res) => {
      if (res.statusCode !== 200) {
        return reject(new Error(`Failed to fetch raw card data: HTTP ${res.statusCode}`));
      }
      let rawData = '';
      res.on('data', (chunk) => { rawData += chunk; });
      res.on('end', () => {
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.writeFileSync(dest, rawData, 'utf8');
        console.log(`Saved raw data to ${dest}`);
        resolve(JSON.parse(rawData));
      });
    }).on('error', reject);
  });
}

function cleanText(text) {
  if (!text) return '';
  return text
    .replace(/Ãœ/g, 'Ü')
    .replace(/â€”/g, '—')
    .replace(/Â´/g, "'")
    .replace(/―/g, '—')
    .trim();
}

function checkBlocker(cardType, text) {
  if (cardType === 'Spell') return false;
  if (!/blocker/i.test(text)) return false;

  const lines = text.split('\n');
  for (const line of lines) {
    if (/^\s*(?:[a-zA-Z\s]+)?blocker\b/i.test(line)) {
      if (!/(?:destroy|return|tap|attack only|choose)\b[^\n]*blocker/i.test(line)) {
        return true;
      }
    }
  }

  if (/(?:Survivor|Wave striker|Silent skill)[^\n:]*:\s*(?:[a-zA-Z\s]+)?blocker\b/i.test(text)) {
    return true;
  }

  const textWithoutParens = text.replace(/\([^\)]*\)/g, '');
  if ((/this creature (?:gets|has)\s+(?:[a-zA-Z0-9\+\s]*\band\s+has\s+)?[\"\']?(?:[a-zA-Z\s]+)?blocker\b/i.test(textWithoutParens) ||
       /and has [\"\']?(?:[a-zA-Z\s]+)?blocker\b/i.test(textWithoutParens)) &&
      !/(?:each of your other|creatures? that have?|opponent's creature)/i.test(textWithoutParens)) {
    return true;
  }

  return false;
}

function getBreakerCount(cardType, text) {
  if (cardType === 'Spell') return 1;
  const textWithoutParens = text.replace(/\([^\)]*\)/g, '');

  if (/(?:^|\n|\.\s+|:\s*|\—\s*)triple breaker\b/i.test(textWithoutParens) ||
      /this creature [^\n.]*\bhas\s+[\"\']?triple breaker/i.test(textWithoutParens)) {
    return 3;
  }

  if (/(?:^|\n|\.\s+|:\s*|\—\s*)double breaker\b/i.test(textWithoutParens) ||
      /this creature [^\n.]*\b(?:has|gets)\s+[\"\']?double breaker/i.test(textWithoutParens) ||
      (/has\s+[\"\']?double breaker/i.test(textWithoutParens) && !/(?:one of your|each of your other)/i.test(textWithoutParens))) {
    return 2;
  }

  return 1;
}

function checkSlayer(cardType, text) {
  if (cardType === 'Spell') return false;
  if (!/slayer/i.test(text)) return false;

  const lines = text.split('\n');
  for (const line of lines) {
    if (/^\s*(?:[a-zA-Z\s]+)?slayer\b/i.test(line)) {
      return true;
    }
  }

  if (/(?:Survivor|Wave striker|Silent skill)[^\n:]*:\s*(?:[a-zA-Z\s]+)?slayer\b/i.test(text)) {
    return true;
  }

  const textWithoutParens = text.replace(/\([^\)]*\)/g, '');
  if (/this creature gets "slayer"|Each creature in the battle zone has "slayer"/i.test(textWithoutParens)) {
    return true;
  }

  return false;
}

function checkSpeedAttacker(cardType, text) {
  if (cardType === 'Spell') return false;
  if (!/speed attacker/i.test(text)) return false;

  const lines = text.split('\n');
  for (const line of lines) {
    if (/^\s*(?:[a-zA-Z\s]+)?speed attacker\b/i.test(line)) {
      return true;
    }
  }

  if (/(?:Survivor|Wave striker|Silent skill)[^\n:]*:\s*(?:[a-zA-Z\s]+)?speed attacker\b/i.test(text)) {
    return true;
  }

  const textWithoutParens = text.replace(/\([^\)]*\)/g, '');
  if (/Each of your creatures in the battle zone has "speed attacker\."/i.test(textWithoutParens)) {
    return true;
  }

  return false;
}

async function buildDatabase() {
  console.log('--- Duel Masters Card Database Builder (DM-01 to DM-12) ---');

  const rawJson = await downloadRawData(RAW_URL, RAW_CACHE_PATH);
  const rawCards = rawJson.cards || rawJson;

  // 1. Process DM-01 preserving canonical data & local image mappings
  const existingDm01Path = path.resolve('data/cards/dm01.json');
  let dm01Cards = [];
  if (fs.existsSync(existingDm01Path)) {
    console.log('Loading existing DM-01 dataset...');
    const existing = JSON.parse(fs.readFileSync(existingDm01Path, 'utf8'));
    dm01Cards = existing.map(c => {
      const cardType = c.type;
      const text = cleanText(c.rulesText || '');
      return {
        ...c,
        name: cleanText(c.name),
        rulesText: text,
        flavorText: c.flavorText ? cleanText(c.flavorText) : null,
        isEvolution: false,
        isSurvivor: false,
        isCharger: false,
        isMultiCiv: false,
        isBlocker: checkBlocker(cardType, text),
        breakerCount: getBreakerCount(cardType, text),
        isSlayer: checkSlayer(cardType, text),
        isSpeedAttacker: checkSpeedAttacker(cardType, text)
      };
    });
  } else {
    throw new Error('data/cards/dm01.json must exist to preserve canonical DM-01 data!');
  }

  // Calculate cumulative card offset for each set for image URLs
  let cumulativeOffset = 0;
  const setOffsets = {};
  for (const set of SETS_METADATA) {
    setOffsets[set.id] = cumulativeOffset;
    cumulativeOffset += set.cardCount;
  }

  const allSetsCards = {
    'DM-01': dm01Cards
  };

  // 2. Process DM-02 through DM-12
  for (const set of SETS_METADATA.slice(1)) {
    console.log(`Processing ${set.id}: ${set.name}...`);
    const setPrefix = set.id.replace('-', '');
    const setSlug = setPrefix.toLowerCase();
    const setCards = [];

    for (const card of rawCards) {
      if (!card.printings) continue;

      for (const printing of card.printings) {
        if (!printing.set || !printing.set.startsWith(set.id)) continue;

        let printId = printing.id;
        // Fix known upstream data typo in DM-07 Curious Eye
        if (set.id === 'DM-07' && card.name === 'Curious Eye' && printId === '3/55') {
          printId = '20/55';
        }

        const isSuperRare = printId.startsWith('S');
        const numMatch = printId.match(/(\d+)/);
        if (!numMatch) {
          throw new Error(`Unable to parse collector number from ${printId} on card ${card.name}`);
        }
        const num = parseInt(numMatch[1], 10);

        let id;
        if (isSuperRare) {
          id = `${setPrefix}-S${String(num).padStart(2, '0')}`;
        } else {
          id = `${setPrefix}-${String(num).padStart(3, '0')}`;
        }

        const civilizations = card.civilizations || [];
        const isMultiCiv = civilizations.length > 1;
        const text = cleanText(card.text || '');
        const cardName = cleanText(card.name);

        const isShieldTrigger = /shield trigger/i.test(text);

        let cardType = 'Creature';
        if (card.type === 'Spell') {
          cardType = 'Spell';
        } else if (
          (card.type && card.type.includes('Evolution')) ||
          /evolution\s*(?:—|-|–)\s*put on/i.test(text) ||
          /vortex evolution/i.test(text)
        ) {
          cardType = 'Evolution Creature';
        }

        // Spells must never be Evolution creatures
        const isEvolution = cardType === 'Evolution Creature';
        const isBlocker = checkBlocker(cardType, text);
        const isSlayer = checkSlayer(cardType, text);
        const isSpeedAttacker = checkSpeedAttacker(cardType, text);
        const isSurvivor = Boolean(/survivor/i.test(text) || (card.subtypes && card.subtypes.includes('Survivor')));
        const isCharger = Boolean(/charger\b/i.test(cardName) || /charger\b/i.test(text));

        let power = null;
        if (cardType !== 'Spell' && card.power !== undefined && card.power !== null) {
          power = parseInt(String(card.power).replace('+', ''), 10);
        }

        const paMatch = text.match(/power attacker\s*(\+\d+)/i) || text.match(/(\+\d+)\s*power attacker/i);
        const powerAttackerBonus = paMatch ? parseInt(paMatch[1].replace('+', ''), 10) : 0;

        const breakerCount = getBreakerCount(cardType, text);

        // Image URL mapping: Super Rares first, then regular cards
        const offset = setOffsets[set.id];
        const imgIndex = isSuperRare ? (offset + num) : (offset + set.superRares + num);
        const imageUrl = `https://img.duelmasters.us/${String(imgIndex).padStart(4, '0')}.webp`;

        // Check if local cached image exists
        const localRelPath = `cards/${setSlug}/${id.toLowerCase()}.webp`;
        const localFullPath = path.resolve(`web/public/${localRelPath}`);
        const imageAssetPath = fs.existsSync(localFullPath) ? localRelPath : null;

        setCards.push({
          id,
          name: cardName,
          set: set.id,
          collectorNumber: printId,
          civilizations,
          type: cardType,
          manaCost: card.cost,
          manaNumber: 1,
          power,
          races: card.subtypes || [],
          isShieldTrigger,
          isBlocker,
          isSlayer,
          isSpeedAttacker,
          isEvolution,
          isSurvivor,
          isCharger,
          isMultiCiv,
          powerAttackerBonus,
          breakerCount,
          rulesText: text,
          flavorText: printing.flavor ? cleanText(printing.flavor) : null,
          rarity: printing.rarity,
          illustrator: cleanText(printing.illustrator) || null,
          imageUrl,
          imageAssetPath
        });
      }
    }

    // Sort set cards: 1..N ascending, then S1..SN ascending
    setCards.sort((a, b) => {
      const getOrderKey = (c) => {
        const isS = c.id.includes('-S');
        const n = parseInt(c.id.split('-')[1].replace('S', ''), 10);
        return isS ? 10000 + n : n;
      };
      return getOrderKey(a) - getOrderKey(b);
    });

    allSetsCards[set.id] = setCards;
  }

  // 3. Validation & Sanity Checking
  console.log('\n--- Validation ---');
  let totalCardsCount = 0;
  const compiledCards = [];

  const requiredFields = [
    'id', 'name', 'set', 'collectorNumber', 'civilizations', 'type',
    'manaCost', 'manaNumber', 'power', 'races', 'isShieldTrigger',
    'isBlocker', 'isSlayer', 'isSpeedAttacker', 'isEvolution',
    'isSurvivor', 'isCharger', 'isMultiCiv', 'powerAttackerBonus',
    'breakerCount', 'rulesText', 'flavorText', 'rarity', 'illustrator',
    'imageUrl', 'imageAssetPath'
  ];

  for (const set of SETS_METADATA) {
    const cards = allSetsCards[set.id];
    console.log(`${set.id} (${set.name}): ${cards.length} cards (expected: ${set.cardCount})`);
    if (cards.length !== set.cardCount) {
      throw new Error(`Mismatch in ${set.id}: got ${cards.length}, expected ${set.cardCount}`);
    }

    for (const card of cards) {
      for (const field of requiredFields) {
        if (card[field] === undefined) {
          throw new Error(`Card ${card.id} (${card.name}) has undefined field: ${field}`);
        }
      }
      compiledCards.push(card);
    }

    totalCardsCount += cards.length;
  }

  console.log(`\nTotal verified cards across all 12 sets: ${totalCardsCount}`);

  // 4. Output Generation
  console.log('\n--- Writing Output Files ---');
  const dataCardsDir = path.resolve('data/cards');
  const webDataDir = path.resolve('web/src/data');
  fs.mkdirSync(dataCardsDir, { recursive: true });
  fs.mkdirSync(webDataDir, { recursive: true });

  // Per-set JSON files
  for (const set of SETS_METADATA) {
    const setSlug = set.id.replace('-', '').toLowerCase();
    const dataPath = path.join(dataCardsDir, `${setSlug}.json`);
    const webPath = path.join(webDataDir, `${setSlug}.json`);
    const cardsJson = JSON.stringify(allSetsCards[set.id], null, 2);

    fs.writeFileSync(dataPath, cardsJson, 'utf8');
    fs.writeFileSync(webPath, cardsJson, 'utf8');
    console.log(`Wrote ${set.id} -> ${dataPath} & ${webPath}`);
  }

  // Sets metadata manifest
  const setsManifest = SETS_METADATA.map(s => ({
    id: s.id,
    code: s.code,
    name: s.name,
    fullName: s.fullName,
    cardCount: s.cardCount
  }));
  const setsJson = JSON.stringify(setsManifest, null, 2);
  fs.writeFileSync(path.join(dataCardsDir, 'sets.json'), setsJson, 'utf8');
  fs.writeFileSync(path.join(webDataDir, 'sets.json'), setsJson, 'utf8');
  console.log('Wrote sets.json to data/cards/sets.json & web/src/data/sets.json');

  // Master all_cards.json
  const allCardsJson = JSON.stringify(compiledCards, null, 2);
  fs.writeFileSync(path.join(webDataDir, 'all_cards.json'), allCardsJson, 'utf8');
  console.log(`Wrote compiled cards (${compiledCards.length} cards) to web/src/data/all_cards.json`);

  console.log('\nDatabase generation completed successfully!');
}

buildDatabase().catch((err) => {
  console.error('Build database failed:', err);
  process.exit(1);
});
