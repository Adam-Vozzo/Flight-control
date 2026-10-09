// Bundles the game into one self-contained HTML file (scripts, styles and
// fonts inlined), for hosts that only take a single page.
//
//   node scripts/build-single.mjs              -> dist/flight-control.html (full document)
//   node scripts/build-single.mjs --fragment   -> dist/flight-control.fragment.html
//                                                 (no <html>/<head>/<body>, for embedding)

import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const fragment = process.argv.includes('--fragment');

const result = await build({
  entryPoints: [join(root, 'src/main.js')],
  bundle: true,
  format: 'iife',
  minify: true,
  target: ['es2020', 'safari14'],
  write: false,
  legalComments: 'none',
});
const js = result.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');

let css = readFileSync(join(root, 'css/style.css'), 'utf8');
css = css.replace(/url\('\.\.\/fonts\/([^']+)'\)/g, (_, file) => {
  const data = readFileSync(join(root, 'fonts', file)).toString('base64');
  return `url(data:font/woff2;base64,${data})`;
});

const html = readFileSync(join(root, 'index.html'), 'utf8');
const start = html.indexOf('<!--app-->');
const end = html.indexOf('<!--/app-->');
if (start < 0 || end < 0) throw new Error('index.html is missing the <!--app--> markers');
const app = html.slice(start + '<!--app-->'.length, end).trim();
const icon = `data:image/svg+xml;base64,${readFileSync(join(root, 'icons/icon.svg')).toString('base64')}`;

const flags = 'window.FLIGHT_CONTROL_NO_SW=true;window.FLIGHT_CONTROL_EMBEDDED=true;';
const body = `${app}\n<script>${flags}</script>\n<script>${js}</script>`;

const out = fragment
  ? `<title>Flight Control</title>\n<style>${css}</style>\n${body}\n`
  : `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Flight Control</title>
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, user-scalable=no">
<meta name="theme-color" content="#a5c470">
<meta name="color-scheme" content="light">
<link rel="icon" href="${icon}">
<style>${css}</style>
</head>
<body>
${body}
</body>
</html>
`;

mkdirSync(join(root, 'dist'), { recursive: true });
const file = join(root, 'dist', fragment ? 'flight-control.fragment.html' : 'flight-control.html');
writeFileSync(file, out);
console.log(`${file} (${Math.round(out.length / 1024)} KB)`);
