/**
 * scripts/generate-icons.mjs
 * Generates PNG icons required for PWA installability from the project's SVG favicon.
 *
 * Usage: node scripts/generate-icons.mjs
 * Requires: sharp  (pnpm add -D sharp)
 *
 * Outputs:
 *   public/icons/icon-192.png  — standard Android home screen icon
 *   public/icons/icon-512.png  — high-res splashscreen / Play Store icon
 *   public/icons/icon-maskable-512.png — maskable icon (safe-zone centered)
 */

import sharp from 'sharp';
import { readFileSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const srcSvg = join(root, 'public', 'favicon.svg');
const outDir = join(root, 'public', 'icons');

mkdirSync(outDir, { recursive: true });

// Read SVG and override media-query colours so icons are always dark-on-white
const svgRaw = readFileSync(srcSvg, 'utf8');
// Force fill to emerald-600 (#059669) for brand consistency in icons
const brandSvg = svgRaw
  .replace(/path \{ fill: #000; \}/, 'path { fill: #059669; }')
  .replace(/@media.*?\}/s, ''); // remove dark-mode media query

const svgBuf = Buffer.from(brandSvg);

const sizes = [
  { name: 'icon-192.png', size: 192, bg: '#ffffff', padding: 0 },
  { name: 'icon-512.png', size: 512, bg: '#ffffff', padding: 0 },
  // Maskable: icon centered in 80% safe zone on white background
  { name: 'icon-maskable-512.png', size: 512, bg: '#ffffff', padding: 102 },
];

for (const { name, size, bg, padding } of sizes) {
  const iconSize = size - padding * 2;
  await sharp(svgBuf)
    .resize(iconSize, iconSize)
    .flatten({ background: bg })
    .extend({
      top: padding,
      bottom: padding,
      left: padding,
      right: padding,
      background: bg,
    })
    .png()
    .toFile(join(outDir, name));
  console.log(`✓ Generated public/icons/${name} (${size}x${size})`);
}
