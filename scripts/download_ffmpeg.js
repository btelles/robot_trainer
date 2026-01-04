const ffbinaries = require('ffbinaries');
const fs = require('fs');
const path = require('path');

const platforms = [
  { code: 'windows-64', dir: 'win' },
  { code: 'linux-64', dir: 'linux' },
  { code: 'osx-64', dir: 'mac' }
];

const baseDest = path.join(__dirname, '../src/bin');

async function download() {
  for (const p of platforms) {
    const dest = path.join(baseDest, p.dir);
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true });
    }
    console.log(`Downloading ffmpeg for ${p.code}...`);
    await new Promise((resolve) => {
      ffbinaries.downloadBinaries(['ffmpeg'], { destination: dest, platform: p.code, quiet: true }, () => {
        console.log(`Downloaded ${p.code}`);
        resolve();
      });
    });
  }
}

download();
