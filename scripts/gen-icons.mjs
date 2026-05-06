// Generate PNG PWA icons from public/icon.svg.
//
// Run with `npm run gen-icons`. Output goes to public/icons/, which the
// vite-plugin-pwa manifest references at build time.

import { readFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const source = resolve(root, 'public/icon.svg');
const outDir = resolve(root, 'public/icons');

const sizes = [192, 256, 384, 512];

const svg = readFileSync(source);
mkdirSync(outDir, { recursive: true });

for (const size of sizes) {
  const out = resolve(outDir, `icon-${size}.png`);
  await sharp(svg, { density: size })
    .resize(size, size)
    .png({ compressionLevel: 9 })
    .toFile(out);
  console.log(`wrote ${out}`);
}

// Apple touch icon (180x180 is the standard size iOS looks for)
const apple = resolve(root, 'public/apple-touch-icon.png');
await sharp(svg, { density: 256 })
  .resize(180, 180)
  .png({ compressionLevel: 9 })
  .toFile(apple);
console.log(`wrote ${apple}`);
