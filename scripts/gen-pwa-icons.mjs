// Generates PWA icons from resources/icon.png into src/renderer/public/icons/.
// Run: npm run gen:pwa-icons  (regenerate + commit the PNGs when the icon changes)
import sharp from 'sharp';
import { mkdirSync } from 'fs';
import { join } from 'path';

const SRC = 'resources/icon.png';
const OUT = 'src/renderer/public/icons';
const BG = { r: 0x0a, g: 0x0b, b: 0x11, alpha: 1 }; // Obsidian surface base

mkdirSync(OUT, { recursive: true });

const transparent = { r: 0, g: 0, b: 0, alpha: 0 };

async function plain(size, name) {
  await sharp(SRC)
    .resize(size, size, { fit: 'contain', background: transparent })
    .png()
    .toFile(join(OUT, name));
}

// Maskable: icon centered with ~10% safe-zone padding on the theme background.
async function maskable(size, name) {
  const inner = Math.round(size * 0.8);
  const icon = await sharp(SRC)
    .resize(inner, inner, { fit: 'contain', background: transparent })
    .png()
    .toBuffer();
  await sharp({ create: { width: size, height: size, channels: 4, background: BG } })
    .composite([{ input: icon, gravity: 'center' }])
    .png()
    .toFile(join(OUT, name));
}

await plain(192, 'icon-192.png');
await plain(512, 'icon-512.png');
await plain(180, 'apple-touch-icon-180.png');
await maskable(512, 'icon-maskable-512.png');

console.log('PWA icons generated in', OUT);
