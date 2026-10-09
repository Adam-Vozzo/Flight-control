// Generates the app icons (SVG + PNG sizes) from the game's own artwork.
// Usage: node scripts/make-icons.mjs
// The PNGs are rendered with Playwright's Chromium, which is not a regular
// dependency: npm i --no-save playwright && npx playwright install chromium

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { aircraftG } from '../src/art.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'icons');
mkdirSync(out, { recursive: true });

const INK = '#22303a';
const RED = '#e2553f';

/** The icon scene on a 512 square; `pad` shrinks it into the maskable safe zone. */
function iconSVG({ pad = 0 } = {}) {
  const s = (512 - pad * 2) / 512;
  let stripes = '';
  for (let i = -6; i <= 10; i++) stripes += `<rect x="${i * 72}" y="-300" width="36" height="1200" fill="#afcb7c"/>`;
  const runway = `
    <g transform="translate(176 430) rotate(-18)">
      <rect x="-70" y="-38" width="600" height="76" rx="8" fill="#d9d2bf" stroke="#958c78" stroke-width="3"/>
      <rect x="-60" y="-29" width="580" height="58" fill="#636c73"/>
      <rect x="0" y="-25" width="520" height="6" fill="${RED}"/>
      <rect x="0" y="19" width="520" height="6" fill="${RED}"/>
      ${[0, 1, 2, 3].map((i) => `<rect x="${120 + i * 64}" y="-3" width="36" height="6" fill="#f6f1e3"/>`).join('')}
      ${[0, 1, 2, 3, 4, 5].map((i) => `<rect x="14" y="${-17 + i * 6.8 - 1.7}" width="40" height="3.4" fill="#f6f1e3"/>`).join('')}
      ${[0, 1, 2].map((i) => {
        const x = -46 + i * 20;
        const p = `${x - 14},-17 ${x},0 ${x - 14},17`;
        return `<polyline points="${p}" fill="none" stroke="${INK}" stroke-width="14" stroke-linecap="round" stroke-linejoin="round"/>`
          + `<polyline points="${p}" fill="none" stroke="${RED}" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>`;
      }).join('')}
    </g>`;
  const route = 'M300,206 C214,250 84,262 70,350 C60,418 120,450 214,418';
  const plane = aircraftG('light', 'red', { x: 0, y: 0, rot: 0, scale: 1 });
  const silhouette = plane.replace(/fill="[^"]*"/g, 'fill="#000"').replace(/stroke="[^"]*"/g, 'stroke="none"');
  const shadow = `<g opacity="0.2" transform="translate(358 214) rotate(152) scale(5.4)">${silhouette}</g>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <rect width="512" height="512" fill="#a5c470"/>
  <g transform="translate(${pad} ${pad}) scale(${s})">
    <g transform="rotate(-24 256 256)">${stripes}</g>
    ${runway}
    <path d="${route}" fill="none" stroke="${INK}" stroke-width="15" stroke-dasharray="14 22" stroke-linecap="round" opacity="0.6"/>
    <path d="${route}" fill="none" stroke="#fbf5e6" stroke-width="8" stroke-dasharray="14 22" stroke-linecap="round"/>
    ${shadow}
    <g transform="translate(336 186) rotate(152) scale(5.4)">${plane}</g>
  </g>
</svg>`;
}

writeFileSync(join(out, 'icon.svg'), iconSVG());
writeFileSync(join(out, 'icon-maskable.svg'), iconSVG({ pad: 52 }));

const { chromium } = await import('playwright');
const browser = await chromium.launch();
const page = await browser.newPage();
const shots = [
  ['icon-192.png', iconSVG(), 192],
  ['icon-512.png', iconSVG(), 512],
  ['apple-touch-icon.png', iconSVG(), 180],
  ['icon-maskable-512.png', iconSVG({ pad: 52 }), 512],
];
for (const [name, svg, size] of shots) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<html><body style="margin:0">${svg.replace('width="512" height="512"', `width="${size}" height="${size}"`)}</body></html>`);
  await page.screenshot({ path: join(out, name), clip: { x: 0, y: 0, width: size, height: size } });
}
await browser.close();
console.log('icons written to', out);
