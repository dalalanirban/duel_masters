const fs = require('fs');
const path = require('path');
const https = require('https');

const outDir = path.resolve('web/public/cards/dm01');
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

const cards = JSON.parse(fs.readFileSync('data/cards/dm01.json', 'utf8'));

console.log(`Starting download of ${cards.length} card images...`);

function downloadImage(url, dest) {
  return new Promise((resolve, reject) => {
    if (fs.existsSync(dest) && fs.statSync(dest).size > 1000) {
      return resolve({ cached: true });
    }
    const file = fs.createWriteStream(dest);
    https.get(url, { rejectUnauthorized: false }, (res) => {
      if (res.statusCode !== 200) {
        file.close();
        fs.unlinkSync(dest);
        return reject(new Error(`Status ${res.statusCode} for ${url}`));
      }
      res.pipe(file);
      file.on('finish', () => {
        file.close(() => resolve({ cached: false }));
      });
    }).on('error', (err) => {
      file.close();
      if (fs.existsSync(dest)) fs.unlinkSync(dest);
      reject(err);
    });
  });
}

async function run() {
  let count = 0;
  for (const card of cards) {
    if (!card.imageUrl) continue;
    const dest = path.join(outDir, `${card.id.toLowerCase()}.webp`);
    try {
      const res = await downloadImage(card.imageUrl, dest);
      count++;
      if (count % 20 === 0 || count === cards.length) {
        console.log(`Downloaded ${count} / ${cards.length} cards...`);
      }
    } catch (e) {
      console.error(`Failed ${card.name} (${card.id}):`, e.message);
    }
  }
  console.log(`Finished! Downloaded ${count} card images to ${outDir}`);
}

run();
