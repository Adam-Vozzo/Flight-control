// Map layouts and their artwork. Each map is a top-down scene in world units
// (origin at the centre, 400 units tall). The art is generated as an SVG
// string so it stays crisp at any screen density and can be reused for the
// menu diagrams. Everything here is pure: no DOM access.

import { TEAM } from './config.js';
import { mulberry32 } from './math.js';

const C = {
  grass: '#a5c470',
  grassStripe: '#afcb7c',
  grassDark: '#94b462',
  tuft: '#86a656',
  fieldA: '#c4cf7c',
  fieldB: '#b3c26e',
  fieldC: '#dcc98a',
  fieldLine: '#869c55',
  tree: '#5f9147',
  treeLight: '#79a85a',
  treeLine: '#2f5233',
  shadow: 'rgba(38, 58, 32, 0.24)',
  water: '#79bccf',
  waterDeep: '#4f9fbf',
  waterLine: '#3c7d95',
  concrete: '#d9d2bf',
  concreteDark: '#c7bfa9',
  concreteLine: '#958c78',
  asphalt: '#636c73',
  asphaltLine: '#454d53',
  paint: '#f6f1e3',
  road: '#8c8f8a',
  roadLine: '#5d625e',
  roofCream: '#efe5cd',
  roofTerracotta: '#cf6a4f',
  roofTeal: '#7fa3a5',
  roofLine: '#544c40',
  glass: '#2e4756',
  sand: '#edd9a3',
  sandDark: '#dcc287',
  sandLine: '#b99c62',
  foam: '#f4fbf8',
  ink: '#22303a',
};

const FONT = `font-family="Jost, Futura, 'Avenir Next', sans-serif" font-weight="700"`;

const n1 = (v) => Math.round(v * 10) / 10;
const pts = (list) => list.map(([x, y]) => `${n1(x)},${n1(y)}`).join(' ');

/** Smooth closed/open path through points (Catmull-Rom to cubic Bezier). */
function smoothPath(points, closed = false) {
  const p = points;
  const n = p.length;
  const get = (i) => (closed ? p[(i + n) % n] : p[Math.max(0, Math.min(n - 1, i))]);
  let d = `M${n1(p[0][0])},${n1(p[0][1])}`;
  const segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const p0 = get(i - 1);
    const p1 = get(i);
    const p2 = get(i + 1);
    const p3 = get(i + 2);
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += `C${n1(c1[0])},${n1(c1[1])} ${n1(c2[0])},${n1(c2[1])} ${n1(p2[0])},${n1(p2[1])}`;
  }
  return closed ? `${d}Z` : d;
}

function blob(cx, cy, r, rng, lumps = 9, wobble = 0.22) {
  const list = [];
  for (let i = 0; i < lumps; i++) {
    const a = (i / lumps) * Math.PI * 2;
    const rr = r * (1 - wobble / 2 + rng() * wobble);
    list.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]);
  }
  return smoothPath(list, true);
}

/** Runway designator from a heading in world radians (north is -y). */
export function runwayNumber(heading) {
  const deg = ((heading * 180) / Math.PI + 90 + 360) % 360;
  const n = Math.round(deg / 10) || 36;
  return String(n > 36 ? n - 36 : n).padStart(2, '0');
}

// ---------------------------------------------------------------------------
// Shared pieces

function landingZoneGeometry(z) {
  const dx = z.b.x - z.a.x;
  const dy = z.b.y - z.a.y;
  const len = Math.hypot(dx, dy);
  return { len, heading: Math.atan2(dy, dx), deg: (Math.atan2(dy, dx) * 180) / Math.PI };
}

function chevrons(team, w, x0, count, gap) {
  let s = '';
  for (let i = 0; i < count; i++) {
    const x = x0 + i * gap;
    const p = pts([[x - 7, -w / 2 + 3.5], [x, 0], [x - 7, w / 2 - 3.5]]);
    s += `<polyline points="${p}" fill="none" stroke="${C.ink}" stroke-width="6.4" stroke-linecap="round" stroke-linejoin="round"/>`;
    s += `<polyline points="${p}" fill="none" stroke="${team.fill}" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"/>`;
  }
  return s;
}

function approachLights(team, start, end, bars) {
  // Centreline lights leading in, with crossbars: points pilots at the threshold.
  let s = '';
  for (const bx of bars) {
    s += `<rect x="${-bx - 2}" y="-15" width="4" height="30" rx="2" fill="${team.fill}" stroke="${C.ink}" stroke-width="1.1"/>`;
  }
  for (let x = -start; x >= -end; x -= 12) {
    s += `<circle cx="${x}" cy="0" r="2.4" fill="${team.fill}" stroke="${C.ink}" stroke-width="1.1"/>`;
  }
  return s;
}

function runwayArt(z) {
  const team = TEAM[z.color];
  const { len: L, heading, deg } = landingZoneGeometry(z);
  const w = z.width;
  const hw = w / 2;
  const water = z.kind === 'water';
  let s = `<g transform="translate(${n1(z.a.x)} ${n1(z.a.y)}) rotate(${n1(deg)})">`;

  if (water) {
    // A buoyed water lane: lighter water, a row of buoys either side.
    s += `<rect x="-6" y="${-hw - 3}" width="${n1(L + 12)}" height="${w + 6}" rx="${hw}" fill="#9fd6df" opacity="0.55"/>`;
    s += `<line x1="16" y1="0" x2="${n1(L - 16)}" y2="0" stroke="${C.foam}" stroke-width="1.6" stroke-dasharray="10 9" opacity="0.8"/>`;
    for (let x = 0; x <= L; x += 22) {
      for (const y of [-hw - 4, hw + 4]) {
        s += `<circle cx="${n1(x)}" cy="${y}" r="3.2" fill="${team.fill}" stroke="${C.ink}" stroke-width="1.3"/>`;
        s += `<circle cx="${n1(x - 0.9)}" cy="${y - 0.9}" r="1" fill="#fff" opacity="0.8"/>`;
      }
    }
    s += chevrons(team, w, -10, 3, 9);
    s += `<text transform="translate(${n1(30)} 0) rotate(90)" ${FONT} font-size="12" fill="${C.foam}" text-anchor="middle" dominant-baseline="central" letter-spacing="0.5">${runwayNumber(heading)}W</text>`;
    return `${s}</g>`;
  }

  // Shoulder, asphalt, overruns
  s += `<rect x="-16" y="${-hw - 5}" width="${n1(L + 32)}" height="${w + 10}" rx="5" fill="${C.concrete}" stroke="${C.concreteLine}" stroke-width="1.3"/>`;
  s += `<rect x="-11" y="${-hw}" width="${n1(L + 22)}" height="${w}" rx="2" fill="${C.asphalt}"/>`;
  // Team-coloured edge lines identify the runway at a glance.
  s += `<rect x="0" y="${-hw + 1.4}" width="${n1(L)}" height="2.4" fill="${team.fill}"/>`;
  s += `<rect x="0" y="${hw - 3.8}" width="${n1(L)}" height="2.4" fill="${team.fill}"/>`;
  // Threshold piano keys at both ends
  const keys = 6;
  for (let i = 0; i < keys; i++) {
    const y = -hw + 5 + (i * (w - 10)) / (keys - 1) - 0.9;
    s += `<rect x="4" y="${n1(y)}" width="11" height="1.8" fill="${C.paint}"/>`;
    s += `<rect x="${n1(L - 15)}" y="${n1(y)}" width="11" height="1.8" fill="${C.paint}"/>`;
  }
  // Touchdown and aiming point markings
  for (const x of [52, 76]) {
    s += `<rect x="${x}" y="${-hw + 5}" width="12" height="2.4" fill="${C.paint}" opacity="0.9"/>`;
    s += `<rect x="${x}" y="${hw - 7.4}" width="12" height="2.4" fill="${C.paint}" opacity="0.9"/>`;
  }
  // Centreline
  for (let x = 98; x < L - 40; x += 18) {
    s += `<rect x="${x}" y="-0.8" width="10" height="1.6" fill="${C.paint}"/>`;
  }
  // Designators: read by pilots landing in each direction
  const fs = Math.min(13, w * 0.52);
  s += `<text transform="translate(29 0) rotate(90)" ${FONT} font-size="${n1(fs)}" fill="${C.paint}" text-anchor="middle" dominant-baseline="central">${runwayNumber(heading)}</text>`;
  s += `<text transform="translate(${n1(L - 29)} 0) rotate(-90)" ${FONT} font-size="${n1(fs)}" fill="${C.paint}" text-anchor="middle" dominant-baseline="central" opacity="0.85">${runwayNumber(heading + Math.PI)}</text>`;
  // Arrival end: chevrons and coloured approach lights
  s += chevrons(team, w, -4, 3, 9);
  s += approachLights(team, 34, 106, [58, 94]);
  return `${s}</g>`;
}

function helipadArt(z, deck = C.concrete) {
  const team = TEAM[z.color];
  let s = `<g transform="translate(${n1(z.x)} ${n1(z.y)})">`;
  s += `<circle r="${z.r + 7}" fill="${deck}" stroke="${C.concreteLine}" stroke-width="1.4"/>`;
  s += `<circle r="${z.r}" fill="#7a838a" stroke="${C.ink}" stroke-width="1.2"/>`;
  s += `<circle r="${z.r - 3.5}" fill="none" stroke="${team.fill}" stroke-width="3.4"/>`;
  s += `<text ${FONT} font-size="${n1(z.r * 0.95)}" fill="${C.paint}" text-anchor="middle" dominant-baseline="central">H</text>`;
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    s += `<circle cx="${n1(Math.cos(a) * (z.r + 3.5))}" cy="${n1(Math.sin(a) * (z.r + 3.5))}" r="1.7" fill="${team.fill}" stroke="${C.ink}" stroke-width="0.9"/>`;
  }
  return `${s}</g>`;
}

function tree(x, y, r, rng) {
  const light = r * 0.45;
  return (
    `<circle cx="${n1(x + 3)}" cy="${n1(y + 4)}" r="${n1(r)}" fill="${C.shadow}"/>` +
    `<circle cx="${n1(x)}" cy="${n1(y)}" r="${n1(r)}" fill="${C.tree}" stroke="${C.treeLine}" stroke-width="1.3"/>` +
    `<circle cx="${n1(x - r * 0.28)}" cy="${n1(y - r * 0.3)}" r="${n1(light + rng() * 1.5)}" fill="${C.treeLight}"/>`
  );
}

function palm(x, y, r, rng) {
  const rot = rng() * 360;
  const fronds = 7;
  let s = `<circle cx="${n1(x + 3)}" cy="${n1(y + 4)}" r="${n1(r * 0.8)}" fill="${C.shadow}"/>`;
  s += `<g transform="translate(${n1(x)} ${n1(y)}) rotate(${n1(rot)})">`;
  for (let i = 0; i < fronds; i++) {
    const a = (i / fronds) * 360;
    s += `<path transform="rotate(${n1(a)})" d="M0,0 Q${n1(r * 0.5)},${n1(-r * 0.32)} ${n1(r)},0 Q${n1(r * 0.5)},${n1(r * 0.32)} 0,0Z" fill="${C.tree}" stroke="${C.treeLine}" stroke-width="1.1" stroke-linejoin="round"/>`;
  }
  s += `<circle r="${n1(r * 0.18)}" fill="#8a6b43" stroke="${C.treeLine}" stroke-width="1"/>`;
  return `${s}</g>`;
}

function trees(rng, count, area, avoid, make = tree, rMin = 6, rMax = 12) {
  const list = [];
  let tries = 0;
  while (list.length < count && tries < count * 40) {
    tries++;
    const x = area.x0 + rng() * (area.x1 - area.x0);
    const y = area.y0 + rng() * (area.y1 - area.y0);
    const r = rMin + rng() * (rMax - rMin);
    if (avoid(x, y, r)) continue;
    if (list.some((t) => Math.hypot(t.x - x, t.y - y) < (t.r + r) * 0.72)) continue;
    list.push({ x, y, r });
  }
  list.sort((a, b) => a.y - b.y);
  return list.map((t) => make(t.x, t.y, t.r, rng)).join('');
}

function cluster(rng, cx, cy, spread, count, avoid, make = tree) {
  return trees(rng, count, { x0: cx - spread, x1: cx + spread, y0: cy - spread * 0.7, y1: cy + spread * 0.7 }, avoid, make);
}

function building(x, y, w, h, rot, roof, opts = {}) {
  let s = `<g transform="translate(${n1(x)} ${n1(y)}) rotate(${n1(rot)})">`;
  s += `<rect x="${n1(-w / 2 + 3)}" y="${n1(-h / 2 + 4)}" width="${w}" height="${h}" rx="2" fill="${C.shadow}"/>`;
  s += `<rect x="${n1(-w / 2)}" y="${n1(-h / 2)}" width="${w}" height="${h}" rx="2" fill="${roof}" stroke="${C.roofLine}" stroke-width="1.3"/>`;
  if (opts.ridge) {
    s += `<line x1="${n1(-w / 2 + 2)}" y1="0" x2="${n1(w / 2 - 2)}" y2="0" stroke="${C.roofLine}" stroke-width="0.9" opacity="0.6"/>`;
  }
  if (opts.ribs) {
    for (let i = 1; i < opts.ribs; i++) {
      const xx = -w / 2 + (i * w) / opts.ribs;
      s += `<line x1="${n1(xx)}" y1="${n1(-h / 2 + 1)}" x2="${n1(xx)}" y2="${n1(h / 2 - 1)}" stroke="${C.roofLine}" stroke-width="0.8" opacity="0.45"/>`;
    }
  }
  if (opts.units) {
    for (const [ux, uy] of opts.units) {
      s += `<rect x="${n1(ux - 2.5)}" y="${n1(uy - 2.5)}" width="5" height="5" rx="1" fill="${C.concreteDark}" stroke="${C.roofLine}" stroke-width="0.8"/>`;
    }
  }
  return `${s}</g>`;
}

function tower(x, y) {
  return (
    `<circle cx="${x + 3}" cy="${y + 4}" r="10" fill="${C.shadow}"/>` +
    `<circle cx="${x}" cy="${y}" r="10" fill="${C.roofCream}" stroke="${C.roofLine}" stroke-width="1.3"/>` +
    `<circle cx="${x}" cy="${y}" r="7" fill="${C.glass}" stroke="${C.roofLine}" stroke-width="1"/>` +
    `<circle cx="${x}" cy="${y}" r="3.6" fill="${C.roofCream}" stroke="${C.roofLine}" stroke-width="0.8"/>` +
    `<line x1="${x}" y1="${y - 3.6}" x2="${x}" y2="${y - 8}" stroke="${C.roofLine}" stroke-width="0.8"/>`
  );
}

function windsock(x, y, angle) {
  return (
    `<g transform="translate(${x} ${y}) rotate(${angle})">` +
    `<circle r="2" fill="${C.roofLine}"/>` +
    `<path d="M1,-3.4 L17,-1.6 L17,1.6 L1,3.4Z" fill="#f08a3c" stroke="${C.ink}" stroke-width="1"/>` +
    `<path d="M6.3,-2.8 L11.6,-2.2 L11.6,2.2 L6.3,2.8Z" fill="${C.paint}"/>` +
    `</g>`
  );
}

function car(x, y, rot, color) {
  return (
    `<g transform="translate(${n1(x)} ${n1(y)}) rotate(${rot})">` +
    `<rect x="-4.6" y="-2.4" width="9.2" height="4.8" rx="1.8" fill="${color}" stroke="${C.ink}" stroke-width="0.8"/>` +
    `<rect x="-1.6" y="-1.7" width="3.8" height="3.4" rx="0.8" fill="${C.glass}" opacity="0.75"/>` +
    `</g>`
  );
}

function tufts(rng, count, area, avoid) {
  let d = '';
  for (let i = 0; i < count; i++) {
    const x = area.x0 + rng() * (area.x1 - area.x0);
    const y = area.y0 + rng() * (area.y1 - area.y0);
    if (avoid(x, y, 4)) continue;
    d += `M${n1(x)},${n1(y)}l1.6,-3.2M${n1(x + 2.6)},${n1(y)}l0.5,-3.8M${n1(x + 4.6)},${n1(y)}l-0.9,-2.9`;
  }
  return `<path d="${d}" stroke="${C.tuft}" stroke-width="1.1" stroke-linecap="round" fill="none" opacity="0.8"/>`;
}

function field(points, fill, rows) {
  return (
    `<g><path d="${smoothPath(points, true)}" fill="${fill}" stroke="${C.fieldLine}" stroke-width="1.4"/>` +
    `<path d="${smoothPath(points, true)}" fill="url(#${rows})" opacity="0.5"/></g>`
  );
}

function road(d, width = 12) {
  return (
    `<path d="${d}" fill="none" stroke="${C.roadLine}" stroke-width="${width + 3}" stroke-linecap="round" stroke-linejoin="round"/>` +
    `<path d="${d}" fill="none" stroke="${C.road}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"/>` +
    `<path d="${d}" fill="none" stroke="${C.paint}" stroke-width="1.1" stroke-dasharray="7 7" opacity="0.75"/>`
  );
}

function taxiway(d, width = 11) {
  return (
    `<path d="${d}" fill="none" stroke="${C.concreteLine}" stroke-width="${width + 3}" stroke-linecap="round" stroke-linejoin="round"/>` +
    `<path d="${d}" fill="none" stroke="${C.asphalt}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"/>` +
    `<path d="${d}" fill="none" stroke="#e7c75d" stroke-width="0.9" stroke-linecap="round" opacity="0.8"/>`
  );
}

function defs(prefix) {
  return (
    `<defs>` +
    `<pattern id="${prefix}-rows" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(28)">` +
    `<rect width="8" height="3.2" fill="#ffffff" opacity="0.45"/></pattern>` +
    `<pattern id="${prefix}-rows2" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(-38)">` +
    `<rect width="7" height="2.6" fill="#6f7d3c" opacity="0.35"/></pattern>` +
    `<linearGradient id="${prefix}-sea" x1="0" y1="0" x2="1" y2="0.25">` +
    `<stop offset="0" stop-color="#8bd0d4"/><stop offset="0.3" stop-color="${C.water}"/><stop offset="1" stop-color="${C.waterDeep}"/>` +
    `</linearGradient>` +
    `</defs>`
  );
}

/** Returns a function that rejects points too close to runways, pads and boxes. */
function makeAvoider(zones, boxes = [], circles = []) {
  return (x, y, r) => {
    for (const z of zones) {
      if (z.kind === 'pad') {
        if (Math.hypot(x - z.x, y - z.y) < z.r + 14 + r) return true;
        continue;
      }
      const dx = z.b.x - z.a.x;
      const dy = z.b.y - z.a.y;
      const L = Math.hypot(dx, dy);
      const ux = dx / L;
      const uy = dy / L;
      const s = (x - z.a.x) * ux + (y - z.a.y) * uy;
      const l = Math.abs(-(x - z.a.x) * uy + (y - z.a.y) * ux);
      if (s > -110 && s < L + 24 && l < z.width / 2 + 14 + r) return true;
    }
    for (const b of boxes) if (x + r > b[0] && x - r < b[2] && y + r > b[1] && y - r < b[3]) return true;
    for (const c of circles) if (Math.hypot(x - c[0], y - c[1]) < c[2] + r) return true;
    return false;
  };
}

// ---------------------------------------------------------------------------
// Airfield: the classic two runways and a helipad.

const AIRFIELD_ZONES = [
  { id: 'red', kind: 'runway', color: 'red', a: { x: -190, y: 75 }, b: { x: 110, y: 0 }, width: 24 },
  { id: 'yellow', kind: 'runway', color: 'yellow', a: { x: 225, y: -80 }, b: { x: 25, y: -145 }, width: 22 },
  { id: 'blue', kind: 'pad', color: 'blue', x: -172, y: -112, r: 22 },
];

function airfieldArt(prefix) {
  const rng = mulberry32(20090312);
  const z = AIRFIELD_ZONES;
  const apron = [-6, 72, 196, 168];
  const avoid = makeAvoider(z, [apron, [150, -58, 252, -6], [-238, -150, -196, -118], [-260, 128, -140, 205]], [[-310, 140, 52]]);
  let s = defs(prefix);
  s += `<rect x="-1100" y="-800" width="2200" height="1600" fill="${C.grass}"/>`;
  s += `<g transform="rotate(-24)" fill="${C.grassStripe}" opacity="0.7">`;
  for (let i = -16; i <= 16; i++) s += `<rect x="${i * 96}" y="-1100" width="48" height="2200"/>`;
  s += `</g>`;

  // Farmland around the airfield boundary
  s += field([[-640, -330], [-330, -350], [-300, -205], [-420, -150], [-660, -170]], C.fieldA, `${prefix}-rows`);
  s += field([[-680, 40], [-420, 20], [-385, 150], [-430, 330], [-700, 320]], C.fieldC, `${prefix}-rows2`);
  s += field([[330, 150], [560, 120], [640, 330], [380, 360]], C.fieldB, `${prefix}-rows`);
  s += field([[300, -360], [620, -330], [640, -190], [330, -200]], C.fieldC, `${prefix}-rows2`);
  s += field([[-360, -190], [-260, -205], [-250, -150], [-345, -140]], C.fieldB, `${prefix}-rows`);

  // Pond
  s += `<path d="${blob(-310, 150, 44, rng, 10, 0.3)}" fill="${C.water}" stroke="${C.waterLine}" stroke-width="1.6"/>`;
  s += `<path d="M-330,140 q8,-4 16,0 M-300,162 q8,-4 16,0" stroke="#e8f6f8" stroke-width="1.4" fill="none" stroke-linecap="round" opacity="0.8"/>`;

  // Roads and car park
  s += road(smoothPath([[150, 600], [168, 300], [150, 215], [96, 180]]));
  s += road(smoothPath([[96, 180], [-60, 205], [-140, 260], [-260, 420]]), 10);
  s += `<rect x="18" y="178" width="70" height="40" rx="3" fill="${C.concreteDark}" stroke="${C.concreteLine}" stroke-width="1.2"/>`;
  for (let i = 0; i < 7; i++) s += `<line x1="${24 + i * 10}" y1="182" x2="${24 + i * 10}" y2="196" stroke="${C.paint}" stroke-width="0.9"/>`;
  const carColors = ['#e2553f', '#f4bf38', '#3e9ad6', '#efe5cd', '#7fa3a5', '#e8679c'];
  [[29, 189], [49, 189], [69, 189], [39, 207], [59, 207]].forEach(([x, y], i) => (s += car(x, y, 90, carColors[i % carColors.length])));

  // Apron, taxiways and buildings
  s += taxiway(smoothPath([[48, 26], [52, 50], [56, 80]]));
  s += taxiway(smoothPath([[112, 2], [142, 26], [152, 80]]));
  s += taxiway(smoothPath([[-108, 55], [-80, 80], [-6, 104]]));
  s += taxiway(smoothPath([[84, -132], [124, -96], [172, -64]]));
  s += `<path d="M-6,72 L196,72 L196,140 Q196,168 168,168 L-6,168Z" fill="${C.concrete}" stroke="${C.concreteLine}" stroke-width="1.4"/>`;
  for (let i = 0; i < 4; i++) {
    s += `<path d="M${18 + i * 36},74 v20 a8,8 0 0 0 8,8" fill="none" stroke="#e7c75d" stroke-width="1" opacity="0.9"/>`;
  }
  s += building(86, 140, 128, 30, 0, C.roofCream, { ridge: true, units: [[-48, -6], [-30, 6], [30, -6], [52, 6]] });
  s += building(10, 132, 26, 24, 0, C.roofTerracotta, { ridge: true });
  s += tower(180, 112);
  s += building(186, -42, 50, 30, -18, C.roofTeal, { ribs: 7 });
  s += building(230, -26, 38, 26, -18, C.roofTeal, { ribs: 5 });
  s += building(-217, -136, 34, 20, 0, C.roofTerracotta, { ridge: true });
  s += windsock(-150, 30, 20);
  s += windsock(232, -50, 200);

  // Runways and helipad
  for (const zone of z) s += zone.kind === 'pad' ? helipadArt(zone) : runwayArt(zone);
  s += taxiway(smoothPath([[-196, -112], [-216, -128]]), 9);

  // Scenery
  s += tufts(rng, 520, { x0: -560, x1: 560, y0: -260, y1: 260 }, avoid);
  s += cluster(rng, -300, -60, 70, 14, avoid);
  s += cluster(rng, 300, 40, 70, 12, avoid);
  s += cluster(rng, -60, -180, 70, 9, avoid);
  s += cluster(rng, 260, 185, 60, 8, avoid);
  s += cluster(rng, -120, 175, 60, 8, avoid);
  s += cluster(rng, 420, -100, 80, 10, avoid);
  s += cluster(rng, -440, 0, 80, 12, avoid);
  s += trees(rng, 40, { x0: -760, x1: 760, y0: -320, y1: 320 }, (x, y, r) => avoid(x, y, r) || (Math.abs(x) < 420 && Math.abs(y) < 210));
  return s;
}

// ---------------------------------------------------------------------------
// Coast: beachside resort with a seaplane lane and a helipad on the pier.

const COAST_ZONES = [
  { id: 'red', kind: 'runway', color: 'red', a: { x: -240, y: 118 }, b: { x: -72, y: -118 }, width: 24 },
  { id: 'pink', kind: 'water', color: 'pink', a: { x: 250, y: 122 }, b: { x: 214, y: -96 }, width: 26 },
  { id: 'blue', kind: 'pad', color: 'blue', x: 212, y: -156, r: 21 },
];

const SHORE = [[96, -800], [92, -260], [76, -150], [58, -40], [66, 70], [104, 168], [126, 260], [136, 800]];

function coastArt(prefix) {
  const rng = mulberry32(19570101);
  const z = COAST_ZONES;
  const sand = SHORE.map(([x, y]) => [x - 44, y]);
  const avoid = makeAvoider(z, [[-74, 120, 6, 200], [-178, -196, -116, -150]], [[-20, -70, 40], [-16, 40, 42]]);
  let s = defs(prefix);
  // Land
  s += `<rect x="-1100" y="-800" width="2200" height="1600" fill="${C.grass}"/>`;
  s += `<g transform="rotate(-24)" fill="${C.grassStripe}" opacity="0.7">`;
  for (let i = -16; i <= 16; i++) s += `<rect x="${i * 96}" y="-1100" width="48" height="2200"/>`;
  s += `</g>`;
  s += field([[-700, -320], [-420, -330], [-390, -180], [-660, -160]], C.fieldA, `${prefix}-rows`);
  s += field([[-700, 120], [-430, 150], [-420, 340], [-700, 330]], C.fieldC, `${prefix}-rows2`);

  // Beach and sea
  const shoreD = smoothPath(SHORE);
  const sandD = smoothPath(sand);
  s += `<path d="${sandD} L1100,800 L1100,-800Z" fill="${C.sand}" stroke="${C.sandLine}" stroke-width="1.4"/>`;
  s += `<path d="${shoreD} L1100,800 L1100,-800Z" fill="url(#${prefix}-sea)"/>`;
  s += `<path d="${smoothPath(SHORE.map(([x, y]) => [x + 14, y]))}" fill="none" stroke="${C.foam}" stroke-width="2.4" stroke-dasharray="14 8 4 8" stroke-linecap="round" opacity="0.85"/>`;
  s += `<path d="${shoreD}" fill="none" stroke="${C.foam}" stroke-width="4" stroke-linecap="round" opacity="0.9"/>`;
  s += `<path d="${shoreD}" fill="none" stroke="${C.waterLine}" stroke-width="1.2" opacity="0.6"/>`;
  // Wave marks
  let waves = '';
  for (let i = 0; i < 70; i++) {
    const x = 150 + rng() * 520;
    const y = -330 + rng() * 660;
    if (z.some((q) => q.kind !== 'runway' && Math.hypot(x - (q.x ?? (q.a.x + q.b.x) / 2), y - (q.y ?? (q.a.y + q.b.y) / 2)) < (q.r ? 40 : 120))) continue;
    waves += `M${n1(x)},${n1(y)} q5,-4 10,0 q5,4 10,0`;
  }
  s += `<path d="${waves}" fill="none" stroke="#e9f7f8" stroke-width="1.3" stroke-linecap="round" opacity="0.55"/>`;

  // Sailboats
  for (const [x, y, r] of [[390, 40, -30], [350, -190, 20], [440, 170, 60]]) {
    s += `<g transform="translate(${x} ${y}) rotate(${r})">`;
    s += `<path d="M-14,0 q3,-5 9,-5 h14 q5,0 7,5 q-2,5 -7,5 h-14 q-6,0 -9,-5Z" fill="${C.paint}" stroke="${C.ink}" stroke-width="1.1"/>`;
    s += `<path d="M-6,-1 L10,-1 L0,-14Z" fill="#e2553f" stroke="${C.ink}" stroke-width="1" stroke-linejoin="round"/>`;
    s += `<path d="M-18,0 q-6,-2 -14,-1 M-18,2 q-6,2 -14,3" stroke="#e9f7f8" stroke-width="1.2" fill="none" opacity="0.7"/>`;
    s += `</g>`;
  }

  // Pier out to the helipad
  s += `<rect x="70" y="-162" width="128" height="12" fill="#b88c5a" stroke="#6f5132" stroke-width="1.2"/>`;
  for (let x = 76; x < 196; x += 8) s += `<line x1="${x}" y1="-161" x2="${x}" y2="-151" stroke="#6f5132" stroke-width="0.7" opacity="0.6"/>`;
  s += helipadArt(z[2], '#c9a272');

  // Seaplane dock beside the lane, with a boat tied up
  s += `<rect x="98" y="150" width="126" height="7" fill="#b88c5a" stroke="#6f5132" stroke-width="1.1"/>`;
  s += `<rect x="216" y="140" width="10" height="26" fill="#b88c5a" stroke="#6f5132" stroke-width="1.1"/>`;
  for (let x = 104; x < 220; x += 8) s += `<line x1="${x}" y1="151" x2="${x}" y2="156" stroke="#6f5132" stroke-width="0.6" opacity="0.6"/>`;
  s += `<path d="M168,162 q4,-6 12,-6 h14 q6,0 8,6 q-2,6 -8,6 h-14 q-8,0 -12,-6Z" fill="${C.paint}" stroke="${C.ink}" stroke-width="1"/>`;
  s += `<rect x="180" y="159" width="10" height="6" rx="1.5" fill="${C.glass}" opacity="0.8"/>`;

  // Beach life: umbrellas and towels
  const umbrellaColors = [['#e2553f', C.paint], ['#f4bf38', C.paint], ['#3e9ad6', C.paint], ['#e8679c', C.paint]];
  for (let i = 0; i < 16; i++) {
    const t = 0.08 + (i / 16) * 0.8;
    const idx = Math.floor(t * (SHORE.length - 1));
    const f = t * (SHORE.length - 1) - idx;
    const x = SHORE[idx][0] + (SHORE[idx + 1][0] - SHORE[idx][0]) * f - 22 + rng() * 8;
    const y = SHORE[idx][1] + (SHORE[idx + 1][1] - SHORE[idx][1]) * f;
    if (y < -150 || y > 190) continue;
    const [a, b] = umbrellaColors[i % umbrellaColors.length];
    s += `<rect x="${n1(x - 10)}" y="${n1(y + 5)}" width="6" height="11" rx="1" fill="${b}" stroke="${C.sandLine}" stroke-width="0.8" transform="rotate(12 ${n1(x)} ${n1(y)})"/>`;
    s += `<circle cx="${n1(x + 2)}" cy="${n1(y + 3)}" r="7" fill="${C.shadow}"/>`;
    s += `<circle cx="${n1(x)}" cy="${n1(y)}" r="7" fill="${b}" stroke="${C.ink}" stroke-width="1"/>`;
    s += `<path d="M${n1(x)},${n1(y)} l0,-7 a7,7 0 0 1 6.06,3.5Z M${n1(x)},${n1(y)} l6.06,3.5 a7,7 0 0 1 -6.06,3.5Z M${n1(x)},${n1(y)} l-6.06,3.5 a7,7 0 0 1 0,-7Z" fill="${a}"/>`;
  }

  // Resort: hotels with pools and a promenade road
  s += road(smoothPath(sand.map(([x, y]) => [x - 18, y])), 10);
  s += building(-26, -70, 30, 74, 8, C.roofCream, { ridge: true, units: [[-6, -24], [6, 20]] });
  s += `<rect x="6" y="-98" width="18" height="30" rx="5" fill="#5fd0d8" stroke="${C.waterLine}" stroke-width="1.2" transform="rotate(8 15 -83)"/>`;
  s += building(-22, 44, 72, 28, -6, C.roofTerracotta, { ridge: true, units: [[-22, -5], [16, 5]] });
  s += `<path d="${blob(-30, 84, 13, rng, 8, 0.25)}" fill="#5fd0d8" stroke="${C.waterLine}" stroke-width="1.2"/>`;
  // Airport terminal by the runway
  s += `<path d="M-180,-196 L-112,-196 L-112,-150 L-180,-150Z" fill="${C.concrete}" stroke="${C.concreteLine}" stroke-width="1.3"/>`;
  s += taxiway(smoothPath([[-92, -90], [-110, -140], [-128, -160]]));
  s += building(-150, -182, 52, 20, 0, C.roofCream, { ridge: true, units: [[-16, 0], [14, 0]] });
  s += tower(-196, -164);
  s += windsock(-196, 74, 210);

  s += runwayArt(z[0]);
  s += runwayArt(z[1]);

  // Palms along the beach, trees inland
  s += trees(rng, 26, { x0: -10, x1: 70, y0: -230, y1: 230 }, (x, y, r) => avoid(x, y, r) || x > (y < 0 ? 40 : 60), palm, 8, 11);
  s += tufts(rng, 360, { x0: -560, x1: 20, y0: -260, y1: 260 }, avoid);
  s += cluster(rng, -330, -40, 70, 14, avoid);
  s += cluster(rng, -120, 160, 60, 8, avoid);
  s += cluster(rng, -300, 170, 60, 9, avoid);
  s += cluster(rng, -60, -170, 50, 6, avoid);
  s += trees(rng, 30, { x0: -760, x1: -380, y0: -320, y1: 320 }, avoid);
  return s;
}


// ---------------------------------------------------------------------------
// Carrier: open sea, an aircraft carrier with an angled deck for the fighters,
// a destroyer with a helipad, and an island airstrip for the light planes.

const CARRIER = { x: -60, y: 22, deg: -15 };
const DESTROYER = { x: 236, y: 112, deg: -15 };

function shipPoint(ship, lx, ly) {
  const t = (ship.deg * Math.PI) / 180;
  return { x: ship.x + lx * Math.cos(t) - ly * Math.sin(t), y: ship.y + lx * Math.sin(t) + ly * Math.cos(t) };
}

const CARRIER_ZONES = [
  { id: 'green', kind: 'runway', color: 'green', a: shipPoint(CARRIER, -166, 15), b: shipPoint(CARRIER, 44, -19), width: 22, deck: true },
  { id: 'blue', kind: 'pad', color: 'blue', ...shipPoint(CARRIER, 132, 13), r: 16 },
  { id: 'blue2', kind: 'pad', color: 'blue', ...shipPoint(DESTROYER, -52, 0), r: 15 },
  { id: 'yellow', kind: 'runway', color: 'yellow', a: { x: 160, y: -92 }, b: { x: 330, y: -138 }, width: 20 },
];

const CARRIER_HULL = [[-188, -40], [-70, -64], [36, -52], [112, -34], [176, -12], [192, 3], [160, 32], [60, 40], [-188, 40]];
const CARRIER_DECK = [[-182, -34], [-70, -57], [34, -46], [110, -29], [170, -9], [183, 3], [156, 27], [60, 34], [-182, 34]];
const DESTROYER_HULL = [[-76, -13], [30, -15], [62, -7], [80, 0], [62, 7], [30, 15], [-76, 13]];

function wake(len, spread, offset = 0) {
  return (
    `<path d="M${offset},-6 Q${offset - len * 0.4},-${spread * 0.4} ${offset - len},-${spread} M${offset},6 Q${offset - len * 0.4},${spread * 0.4} ${offset - len},${spread}" fill="none" stroke="#e9f7f8" stroke-width="4" stroke-linecap="round" opacity="0.45"/>` +
    `<path d="M${offset},0 L${offset - len * 0.9},0" fill="none" stroke="#e9f7f8" stroke-width="9" stroke-linecap="round" stroke-dasharray="18 14" opacity="0.28"/>`
  );
}

function carrierArt(prefix) {
  const rng = mulberry32(19631014);
  const z = CARRIER_ZONES;
  const team = TEAM.green;
  let s = defs(prefix);
  s += `<rect x="-1100" y="-800" width="2200" height="1600" fill="url(#${prefix}-ocean)"/>`;
  s += `<defs><radialGradient id="${prefix}-ocean" cx="0.45" cy="0.45" r="0.7"><stop offset="0" stop-color="#5aaed0"/><stop offset="1" stop-color="#3b88b3"/></radialGradient></defs>`;
  let waves = '';
  for (let i = 0; i < 120; i++) {
    const x = -620 + rng() * 1240;
    const y = -330 + rng() * 660;
    if (Math.hypot(x - CARRIER.x, (y - CARRIER.y) * 2.2) < 230) continue;
    if (Math.hypot((x - 245) / 1.8, y + 118) < 80) continue;
    waves += `M${n1(x)},${n1(y)} q5,-4 10,0 q5,4 10,0`;
  }
  s += `<path d="${waves}" fill="none" stroke="#e9f7f8" stroke-width="1.3" stroke-linecap="round" opacity="0.45"/>`;

  // Island airstrip
  s += `<path d="${blob(246, -116, 124, rng, 12, 0.12)}" transform="translate(246 -116) scale(1 0.56) translate(-246 116)" fill="#8fd3d5" opacity="0.8"/>`;
  s += `<path d="${blob(246, -116, 108, rng, 12, 0.12)}" transform="translate(246 -116) scale(1 0.5) translate(-246 116)" fill="${C.sand}" stroke="${C.sandLine}" stroke-width="2.6"/>`;
  s += `<path d="${blob(250, -116, 92, rng, 12, 0.14)}" transform="translate(250 -116) scale(1 0.42) translate(-250 116)" fill="${C.grass}" stroke="${C.fieldLine}" stroke-width="2.8"/>`;
  s += runwayArt(z[3]);
  s += building(300, -96, 30, 16, -15, C.roofTeal, { ribs: 4 });
  s += trees(rng, 12, { x0: 160, x1: 340, y0: -170, y1: -60 }, (x, y, r) => {
    const inIsland = ((x - 250) / 84) ** 2 + ((y + 116) / 34) ** 2 < 1;
    const dx = x - 245;
    const dy = y + 115;
    const nearRunway = Math.abs(-dx * 0.2614 - dy * 0.9652) < 22 + r;
    return !inIsland || nearRunway || (x > 280 && x < 322 && y > -108 && y < -84);
  }, palm, 7, 10);

  // Destroyer with a helipad on the stern
  s += `<g transform="translate(${DESTROYER.x} ${DESTROYER.y}) rotate(${DESTROYER.deg})">`;
  s += wake(150, 40, -76);
  s += `<polygon points="${pts(DESTROYER_HULL.map(([x, y]) => [x + 3, y + 5]))}" fill="rgba(20,40,60,0.25)"/>`;
  s += `<polygon points="${pts(DESTROYER_HULL)}" fill="#7f8a90" stroke="${C.ink}" stroke-width="1.6" stroke-linejoin="round"/>`;
  s += `<rect x="-22" y="-8" width="40" height="16" rx="3" fill="#b9c1c5" stroke="${C.ink}" stroke-width="1.2"/>`;
  s += `<rect x="-6" y="-5" width="10" height="10" rx="2" fill="#5d666c" stroke="${C.ink}" stroke-width="1"/>`;
  s += `<circle cx="10" cy="0" r="3" fill="#e9eef0" stroke="${C.ink}" stroke-width="0.9"/>`;
  s += `<circle cx="44" cy="0" r="5" fill="#9aa4a9" stroke="${C.ink}" stroke-width="1.1"/><line x1="48" y1="0" x2="64" y2="0" stroke="${C.ink}" stroke-width="2" stroke-linecap="round"/>`;
  s += `</g>`;
  s += helipadArt(z[2], '#8d989e');

  // The carrier
  s += `<g transform="translate(${CARRIER.x} ${CARRIER.y}) rotate(${CARRIER.deg})">`;
  s += wake(300, 70, -188);
  s += `<polygon points="${pts(CARRIER_HULL.map(([x, y]) => [x + 4, y + 7]))}" fill="rgba(20,40,60,0.28)"/>`;
  s += `<polygon points="${pts(CARRIER_HULL)}" fill="#59626a" stroke="${C.ink}" stroke-width="1.8" stroke-linejoin="round"/>`;
  s += `<polygon points="${pts(CARRIER_DECK)}" fill="#7b858c" stroke="#4b545a" stroke-width="1.2" stroke-linejoin="round"/>`;
  // Elevators and bow catapults
  s += `<rect x="-60" y="22" width="26" height="12" fill="#6f797f" stroke="#4b545a" stroke-width="1"/>`;
  s += `<rect x="96" y="22" width="24" height="10" fill="#6f797f" stroke="#4b545a" stroke-width="1"/>`;
  s += `<path d="M66,10 L176,2 M66,-8 L170,-9" stroke="#e7e2d4" stroke-width="1.4" stroke-dasharray="10 4" opacity="0.8"/>`;
  // Island superstructure
  s += `<rect x="30" y="26" width="5" height="5" fill="${C.shadow}"/>`;
  s += `<g><rect x="28" y="19" width="56" height="15" rx="3" fill="#c7cdd1" stroke="${C.ink}" stroke-width="1.4"/>`;
  s += `<rect x="46" y="22" width="12" height="9" rx="2" fill="#59626a" stroke="${C.ink}" stroke-width="1"/>`;
  s += `<circle cx="70" cy="26.5" r="4.6" fill="#e9eef0" stroke="${C.ink}" stroke-width="1"/><line x1="70" y1="22" x2="70" y2="31" stroke="${C.ink}" stroke-width="0.9"/>`;
  s += `<circle cx="37" cy="26.5" r="2.4" fill="${C.glass}"/></g>`;
  // Angled landing deck
  s += `<g transform="translate(-166 15) rotate(-9)">`;
  s += `<rect x="-14" y="-12" width="232" height="24" fill="#646e75"/>`;
  s += `<rect x="0" y="-10.4" width="214" height="2.2" fill="${team.fill}"/>`;
  s += `<rect x="0" y="8.2" width="214" height="2.2" fill="${team.fill}"/>`;
  for (let x = 62; x < 200; x += 18) s += `<rect x="${x}" y="-0.8" width="10" height="1.6" fill="${C.paint}"/>`;
  for (const x of [22, 30, 38, 46]) s += `<line x1="${x}" y1="-8" x2="${x}" y2="8" stroke="${C.paint}" stroke-width="1" opacity="0.85"/>`;
  s += `<rect x="40" y="-21" width="9" height="6" rx="1.5" fill="#f0b43c" stroke="${C.ink}" stroke-width="1"/>`;
  s += chevrons(team, 22, -2, 2, 8);
  s += approachLights(team, 30, 100, [56, 88]);
  s += `</g>`;
  s += `</g>`;
  s += helipadArt(z[1], '#7b858c');

  // Escort boats
  for (const [x, y, r] of [[-330, -150, -20], [420, 30, 160], [-380, 160, 10]]) {
    s += `<g transform="translate(${x} ${y}) rotate(${r})">${wake(60, 16, -14)}`;
    s += `<path d="M-14,0 q3,-6 10,-6 h14 q7,0 10,6 q-3,6 -10,6 h-14 q-7,0 -10,-6Z" fill="#9aa4a9" stroke="${C.ink}" stroke-width="1.2"/>`;
    s += `<rect x="-4" y="-3" width="10" height="6" rx="1.5" fill="#d8dde0" stroke="${C.ink}" stroke-width="0.8"/></g>`;
  }
  return s;
}

const CARRIER_DIAGRAM =
  '<rect x="-330" y="-210" width="660" height="420" fill="#a9d4e4"/>' +
  `<ellipse cx="246" cy="-116" rx="104" ry="52" fill="#e7d9a8"/>` +
  `<g transform="translate(${CARRIER.x} ${CARRIER.y}) rotate(${CARRIER.deg})"><polygon points="${pts(CARRIER_HULL)}" fill="#7b858c"/></g>` +
  `<g transform="translate(${DESTROYER.x} ${DESTROYER.y}) rotate(${DESTROYER.deg})"><polygon points="${pts(DESTROYER_HULL)}" fill="#7f8a90"/></g>`;

// ---------------------------------------------------------------------------

export const MAPS = {
  airfield: {
    id: 'airfield',
    name: 'Airfield',
    code: 'AFD',
    blurb: 'Two runways and a helipad. Where it all began.',
    traffic: [
      { type: 'light', color: 'red', w: 3 },
      { type: 'light', color: 'yellow', w: 3 },
      { type: 'heli', color: 'blue', w: 2.2 },
      { type: 'jet', color: 'red', w: 2.2, from: 25, ramp: 40 },
      { type: 'jet', color: 'yellow', w: 2.2, from: 25, ramp: 40 },
      { type: 'heavy', color: 'red', w: 1.2, from: 100, ramp: 60 },
    ],
    firstArrival: { type: 'light', color: 'red' },
    zones: AIRFIELD_ZONES,
    gates: [
      { edge: 'left', at: 0.22 },
      { edge: 'left', at: 0.78 },
      { edge: 'right', at: 0.3 },
      { edge: 'right', at: 0.74 },
      { edge: 'top', at: 0.2 },
      { edge: 'top', at: 0.52 },
      { edge: 'top', at: 0.82 },
      { edge: 'bottom', at: 0.18 },
      { edge: 'bottom', at: 0.55 },
      { edge: 'bottom', at: 0.86 },
    ],
    ground: C.grass,
    art: airfieldArt,
  },
  coast: {
    id: 'coast',
    name: 'Coast',
    code: 'CST',
    blurb: 'Seaplanes land on the water. Helicopters on the pier.',
    traffic: [
      { type: 'light', color: 'red', w: 3 },
      { type: 'seaplane', color: 'pink', w: 3.2 },
      { type: 'heli', color: 'blue', w: 2.2 },
      { type: 'jet', color: 'red', w: 2.2, from: 25, ramp: 40 },
      { type: 'heavy', color: 'red', w: 1, from: 110, ramp: 60 },
    ],
    firstArrival: { type: 'seaplane', color: 'pink' },
    zones: COAST_ZONES,
    gates: [
      { edge: 'left', at: 0.25 },
      { edge: 'left', at: 0.75 },
      { edge: 'right', at: 0.2 },
      { edge: 'right', at: 0.5 },
      { edge: 'right', at: 0.82 },
      { edge: 'top', at: 0.25 },
      { edge: 'top', at: 0.6 },
      { edge: 'bottom', at: 0.3 },
      { edge: 'bottom', at: 0.7 },
    ],
    ground: C.grass,
    art: coastArt,
    diagram: '<path d="M70,-210 C60,-120 40,-20 60,70 C80,150 105,190 115,210 L330,210 L330,-210Z" fill="#9fcfe0"/>',
  },
  carrier: {
    id: 'carrier',
    name: 'Carrier',
    code: 'CVN',
    blurb: 'Fast jets land on the angled deck. Helicopters on either ship.',
    traffic: [
      { type: 'fighter', color: 'green', w: 3.2 },
      { type: 'heli', color: 'blue', w: 2.4 },
      { type: 'light', color: 'yellow', w: 2.2 },
      { type: 'jet', color: 'yellow', w: 1.4, from: 60, ramp: 40 },
    ],
    firstArrival: { type: 'fighter', color: 'green' },
    pace: 0.92,
    zones: CARRIER_ZONES,
    gates: [
      { edge: 'left', at: 0.28 },
      { edge: 'left', at: 0.72 },
      { edge: 'right', at: 0.42 },
      { edge: 'right', at: 0.8 },
      { edge: 'top', at: 0.22 },
      { edge: 'top', at: 0.55 },
      { edge: 'bottom', at: 0.2 },
      { edge: 'bottom', at: 0.5 },
      { edge: 'bottom', at: 0.82 },
    ],
    ground: '#4a97c0',
    art: carrierArt,
    diagram: CARRIER_DIAGRAM,
  },
};

export const MAP_ORDER = ['airfield', 'coast', 'carrier'];

/** Full scene markup for a map, ready to drop into an SVG <g>. */
export function mapSVG(map, prefix = map.id) {
  return map.art(prefix);
}
