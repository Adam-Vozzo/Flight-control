// Aircraft artwork: top-down, flat colour with ink outlines, nose pointing
// along +x. Every part is plain SVG path data so the same drawings feed the
// canvas (via Path2D) and the DOM (menus, how-to cards, icons).

import { TEAM, INK, CREAM } from './config.js';

const GLASS = '#2e4756';
const GLASS_LIGHT = '#cde8ef';
const METAL = '#d7dcde';

/** Closed outline symmetric about y=0 from its top half (start and end on the axis). */
function sym(start, segs) {
  const pts = [start];
  let d = `M${start[0]},${start[1]}`;
  for (const s of segs) {
    if (s.length === 2) d += `L${s[0]},${s[1]}`;
    else if (s.length === 4) d += `Q${s[0]},${s[1]} ${s[2]},${s[3]}`;
    else d += `C${s[0]},${s[1]} ${s[2]},${s[3]} ${s[4]},${s[5]}`;
    pts.push([s[s.length - 2], s[s.length - 1]]);
  }
  const m = (x, y) => `${x},${-y}`;
  for (let i = segs.length - 1; i >= 0; i--) {
    const s = segs[i];
    const prev = pts[i];
    if (s.length === 2) d += `L${m(prev[0], prev[1])}`;
    else if (s.length === 4) d += `Q${m(s[0], s[1])} ${m(prev[0], prev[1])}`;
    else d += `C${m(s[2], s[3])} ${m(s[0], s[1])} ${m(prev[0], prev[1])}`;
  }
  return `${d}Z`;
}

/** A path plus its reflection across y=0 (for paired wings, engines, floats). */
function pair(d) {
  let i = 0;
  const flipped = d.replace(/-?\d*\.?\d+/g, (num) => {
    const v = parseFloat(num);
    return i++ % 2 === 1 ? String(-v) : num;
  });
  return `${d} ${flipped}`;
}

function pill(x0, x1, y, r) {
  return `M${x0 + r},${y - r} L${x1 - r},${y - r} Q${x1},${y - r} ${x1},${y} Q${x1},${y + r} ${x1 - r},${y + r} L${x0 + r},${y + r} Q${x0},${y + r} ${x0},${y} Q${x0},${y - r} ${x0 + r},${y - r} Z`;
}

// fill: body | shade | cream | glass | glassLight | metal
// sil: part of the silhouette used for shadows, halos and icons
// lw: outline width (0 = no outline)
const DESIGNS = {
  light: {
    extent: 19,
    parts: [
      { d: sym([-8.6, 0], [[-9.6, -6.9], [-9.8, -7.9, -10.8, -7.9], [-12.8, -7.9], [-13.7, -7.9, -13.6, -6.9], [-13.3, 0]]), fill: 'body', sil: true },
      { d: sym([13.2, 0], [[13.2, -2.7, 11.8, -3.7, 8.6, -3.7], [2, -3.7], [-2.2, -3.5, -8, -2.1, -12.6, -1.35], [-14.1, -1.15, -14.1, 0]]), fill: 'body', sil: true },
      { d: sym([13.2, 0], [[13.2, -2.7, 11.8, -3.7, 9.6, -3.7], [9.6, 0]]), fill: 'cream', lw: 1 },
      { d: 'M0.7,-2.7 L-1.8,-2.3 L-1.8,2.3 L0.7,2.7 Z', fill: 'glass', lw: 0.9 },
      { d: 'M-9.2,-0.55 L-14.3,-0.45 L-14.3,0.45 L-9.2,0.55 Z', fill: 'shade', lw: 0.9 },
      { d: 'M6.9,-15.6 L6.9,15.6 Q6.9,17.3 5.2,17.3 L2.4,17.3 Q0.7,17.3 0.7,15.6 L0.7,-15.6 Q0.7,-17.3 2.4,-17.3 L5.2,-17.3 Q6.9,-17.3 6.9,-15.6 Z', fill: 'body', sil: true },
      { d: pair('M1.4,-13.9 L6.2,-13.9 L6.2,-11.9 L1.4,-11.9 Z'), fill: 'cream', lw: 0 },
      { d: 'M6.9,-3.1 L8.7,-2.5 Q9.5,0 8.7,2.5 L6.9,3.1 Z', fill: 'glass', lw: 0.9 },
    ],
    prop: { x: 13.9, r: 7 },
  },
  jet: {
    extent: 23,
    parts: [
      { d: pair(pill(-2.4, 7.6, -8.5, 1.8)), fill: 'metal', sil: true },
      { d: pair('M7.6,-2.4 L-4.6,-17.3 Q-5.2,-18 -6.2,-18 L-8.4,-18 Q-9.3,-18 -9.1,-17.1 L-3.4,-2.4 Z'), fill: 'body', sil: true },
      { d: pair('M-12.4,-1.9 L-17.2,-8.3 Q-17.6,-8.8 -18.3,-8.8 L-19.6,-8.8 Q-20.4,-8.8 -20.2,-8 L-17.6,-1.9 Z'), fill: 'body', sil: true },
      { d: sym([18.8, 0], [[18.8, -1.95, 17.3, -2.85, 14.5, -2.85], [-13, -2.85], [-16.4, -2.85, -18.8, -1.7, -20.3, 0]]), fill: 'body', sil: true },
      { d: sym([15.2, 0], [[14.8, -1, 13.4, -1], [-13.8, -0.85], [-15.6, -0.7, -15.8, 0]]), fill: 'cream', lw: 0 },
      { d: 'M-13.6,0 L-20.6,-0.75 L-21.3,0 L-20.6,0.75 Z', fill: 'shade', lw: 0.9 },
      { d: 'M16.2,-2.3 Q18.3,-1.6 18.45,0 Q18.3,1.6 16.2,2.3 L15.7,1.6 Q16.9,0 15.7,-1.6 Z', fill: 'glass', lw: 0.8 },
    ],
  },
  heavy: {
    extent: 29,
    parts: [
      { d: pair(pill(-0.5, 8.5, -9.8, 2)), fill: 'metal', sil: true },
      { d: pair(pill(-6, 2.5, -17, 2)), fill: 'metal', sil: true },
      { d: pair('M9.5,-3.4 L-8,-23 Q-8.7,-23.8 -9.8,-23.8 L-12.4,-23.8 Q-13.5,-23.8 -13.2,-22.8 L-5.5,-3.4 Z'), fill: 'body', sil: true },
      { d: pair('M-16,-2.4 L-22.6,-10.6 Q-23.1,-11.2 -24,-11.2 L-25.6,-11.2 Q-26.6,-11.2 -26.3,-10.2 L-22.8,-2.4 Z'), fill: 'body', sil: true },
      { d: sym([24.5, 0], [[24.5, -2.6, 22.6, -3.7, 18.5, -3.7], [-17, -3.7], [-21.4, -3.7, -24.6, -2.2, -26.4, 0]]), fill: 'body', sil: true },
      { d: sym([21.6, 0], [[21.6, -1.7, 20, -2.4, 17, -2.4], [12, -2.4, 8, -2, 6.5, 0]]), fill: 'cream', lw: 0.9 },
      { d: sym([5, 0], [[4.6, -0.9, 3.2, -0.9], [-18.5, -0.8], [-20.2, -0.7, -20.4, 0]]), fill: 'cream', lw: 0 },
      { d: 'M-18,0 L-26.8,-0.9 L-27.6,0 L-26.8,0.9 Z', fill: 'shade', lw: 0.9 },
      { d: 'M21.9,-2.6 Q24.1,-1.8 24.25,0 Q24.1,1.8 21.9,2.6 L21.4,1.9 Q22.7,0 21.4,-1.9 Z', fill: 'glass', lw: 0.8 },
    ],
  },
  heli: {
    extent: 24,
    parts: [
      { d: pair(pill(-7.75, 9.4, -6.65, 0.75)), fill: 'metal', sil: true, lw: 1 },
      { d: 'M-5,-1.6 L-21.4,-0.95 L-21.4,0.95 L-5,1.6 Z', fill: 'body', sil: true },
      { d: 'M-15.8,-4.6 Q-15.8,-5.2 -16.5,-5.2 L-17.6,-5.2 Q-18.3,-5.2 -18.3,-4.6 L-18.3,4.6 Q-18.3,5.2 -17.6,5.2 L-16.5,5.2 Q-15.8,5.2 -15.8,4.6 Z', fill: 'body', sil: true, lw: 1.2 },
      { d: 'M-19.6,-0.7 L-23.2,-0.55 L-23.2,0.55 L-19.6,0.7 Z', fill: 'shade', lw: 0.9 },
      { d: sym([10.8, 0], [[10.8, -4.5, 7.2, -6.3, 2, -6.3], [-3.6, -6.3, -7.8, -4.1, -7.8, 0]]), fill: 'body', sil: true },
      { d: sym([10.8, 0], [[10.8, -4.5, 7.2, -6.3, 4.4, -6.3], [5.6, -3.2, 5.6, 0]]), fill: 'glassLight', lw: 1.1 },
      { d: 'M1.2,-2.7 L-4.6,-2.7 Q-7.3,-2.7 -7.3,0 Q-7.3,2.7 -4.6,2.7 L1.2,2.7 Q3,2.7 3,0 Q3,-2.7 1.2,-2.7 Z', fill: 'shade', lw: 1 },
    ],
    rotor: { r: 18, tail: { x: -21.6, y: 1.9, r: 3.2 } },
  },
  seaplane: {
    extent: 21,
    parts: [
      { d: pair('M14.4,-6.4 C14.4,-7.8 12.4,-8.2 10.2,-8.2 L-7.8,-7.9 Q-10.6,-7.6 -10.6,-6.4 Q-10.6,-5.2 -7.8,-4.9 L10.2,-4.6 C12.4,-4.6 14.4,-5 14.4,-6.4 Z'), fill: 'cream', sil: true, lw: 1.3 },
      { d: sym([-9.4, 0], [[-10.5, -7.6], [-10.7, -8.6, -11.8, -8.6], [-14, -8.6], [-15, -8.6, -14.9, -7.6], [-14.6, 0]]), fill: 'body', sil: true },
      { d: sym([14.2, 0], [[14.2, -2.9, 12.7, -4, 9.3, -4], [2.2, -4], [-2.4, -3.8, -8.8, -2.3, -13.8, -1.45], [-15.4, -1.25, -15.4, 0]]), fill: 'body', sil: true },
      { d: sym([14.2, 0], [[14.2, -2.9, 12.7, -4, 10.4, -4], [10.4, 0]]), fill: 'cream', lw: 1 },
      { d: 'M0.8,-2.9 L-1.9,-2.5 L-1.9,2.5 L0.8,2.9 Z', fill: 'glass', lw: 0.9 },
      { d: 'M-10,-0.6 L-15.6,-0.5 L-15.6,0.5 L-10,0.6 Z', fill: 'shade', lw: 0.9 },
      { d: 'M7.4,-16.8 L7.4,16.8 Q7.4,18.6 5.6,18.6 L2.6,18.6 Q0.8,18.6 0.8,16.8 L0.8,-16.8 Q0.8,-18.6 2.6,-18.6 L5.6,-18.6 Q7.4,-18.6 7.4,-16.8 Z', fill: 'body', sil: true },
      { d: pair('M1.4,-15 L6.8,-15 L6.8,-12.8 L1.4,-12.8 Z'), fill: 'cream', lw: 0 },
      { d: 'M7.4,-3.4 L9.4,-2.7 Q10.3,0 9.4,2.7 L7.4,3.4 Z', fill: 'glass', lw: 0.9 },
    ],
    prop: { x: 14.9, r: 7.4 },
  },
  fighter: {
    extent: 19,
    parts: [
      { d: pair('M-11.2,-2.3 L-15.4,-7 Q-15.7,-7.4 -16.3,-7.4 L-17.3,-7.4 Q-17.9,-7.4 -17.7,-6.8 L-16.2,-2.3 Z'), fill: 'body', sil: true },
      { d: pair('M6,-2.5 L-7.4,-11.6 Q-8,-12 -8.8,-12 L-11.6,-12 Q-12.4,-12 -12.2,-11.2 L-10.8,-2.5 Z'), fill: 'body', sil: true },
      { d: pair('M-4.7,-9.6 L-11.6,-9.6 L-11.4,-8.2 L-2.6,-8.2 Z'), fill: 'cream', lw: 0 },
      { d: sym([18, 0], [[16.4, -1, 13.2, -1.9, 9, -2.4], [-13.5, -2.5], [-16.2, -2.2], [-16.6, 0]]), fill: 'body', sil: true },
      { d: pair('M-8.6,-1.4 L-15.2,-3.6 L-15.8,-3 L-9.2,-0.9 Z'), fill: 'shade', lw: 0.9 },
      { d: 'M-16.6,-1.5 L-18.2,-1.2 L-18.2,1.2 L-16.6,1.5 Z', fill: 'glass', lw: 0.8 },
      { d: sym([12, 0], [[11, -1.35, 8.6, -1.7, 5.8, -1.4], [4.6, -0.9, 4.6, 0]]), fill: 'glassLight', lw: 1 },
    ],
  },
};

export const AIRCRAFT_TYPES = Object.keys(DESIGNS);

function paint(fill, team) {
  switch (fill) {
    case 'body': return team.fill;
    case 'shade': return team.shade;
    case 'cream': return CREAM;
    case 'glass': return GLASS;
    case 'glassLight': return GLASS_LIGHT;
    case 'metal': return METAL;
    default: return fill;
  }
}

// ---------------------------------------------------------------------------
// Canvas

const SPRITE_RES = 5; // sprite pixels per world unit

function makeCanvas(w, h) {
  if (typeof OffscreenCanvas !== 'undefined') {
    try {
      return new OffscreenCanvas(w, h);
    } catch {
      /* fall through */
    }
  }
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function makeSprite(design, paths, mode) {
  const pad = mode === 'halo' ? 4 : 1;
  const ext = design.extent + pad;
  const size = Math.ceil(ext * 2 * SPRITE_RES);
  const canvas = makeCanvas(size, size);
  const ctx = canvas.getContext('2d');
  ctx.translate(size / 2, size / 2);
  ctx.scale(SPRITE_RES, SPRITE_RES);
  ctx.lineJoin = 'round';
  const color = mode === 'shadow' ? '#000' : mode === 'halo' ? CREAM : '#fff';
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  design.parts.forEach((part, i) => {
    if (!part.sil) return;
    ctx.fill(paths[i]);
    if (mode === 'halo') {
      ctx.lineWidth = 5.5;
      ctx.stroke(paths[i]);
    } else if (mode === 'icon') {
      ctx.lineWidth = 1.2;
      ctx.stroke(paths[i]);
    }
  });
  if (design.rotor && mode !== 'icon') {
    ctx.globalAlpha = mode === 'shadow' ? 0.3 : 0.9;
    ctx.beginPath();
    ctx.arc(0, 0, design.rotor.r + (mode === 'halo' ? 2.5 : 0), 0, Math.PI * 2);
    ctx.fill();
  }
  return { canvas, half: size / 2, res: SPRITE_RES };
}

/** Build Path2D objects and silhouette sprites. Browser only. */
export function buildArt() {
  const out = {};
  for (const [type, design] of Object.entries(DESIGNS)) {
    const paths = design.parts.map((p) => new Path2D(p.d));
    out[type] = {
      design,
      paths,
      shadow: makeSprite(design, paths, 'shadow'),
      halo: makeSprite(design, paths, 'halo'),
      icon: makeSprite(design, paths, 'icon'),
    };
  }
  return out;
}

/**
 * Draw an aircraft centred at the current origin, nose along +x.
 * `t` is a clock in seconds for props and rotors; `spin` scales rotor speed.
 */
export function drawAircraft(ctx, art, color, t, spin = 1) {
  const team = TEAM[color];
  const { design, paths } = art;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.strokeStyle = INK;
  design.parts.forEach((part, i) => {
    ctx.fillStyle = paint(part.fill, team);
    ctx.fill(paths[i]);
    const lw = part.lw ?? 1.5;
    if (lw > 0) {
      ctx.lineWidth = lw;
      ctx.stroke(paths[i]);
    }
  });
  if (design.prop) {
    const { x, r } = design.prop;
    const flicker = 0.75 + 0.25 * Math.sin(t * 50);
    ctx.fillStyle = `rgba(34, 48, 58, ${0.26 * flicker})`;
    ctx.beginPath();
    ctx.ellipse(x, 0, 0.9, r, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = CREAM;
    ctx.beginPath();
    ctx.arc(x - 0.6, 0, 1.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 0.8;
    ctx.stroke();
  }
  if (design.rotor) {
    const { r, tail } = design.rotor;
    ctx.fillStyle = 'rgba(251, 245, 230, 0.16)';
    ctx.strokeStyle = 'rgba(34, 48, 58, 0.3)';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = 'rgba(34, 48, 58, 0.35)';
    ctx.beginPath();
    ctx.ellipse(tail.x, tail.y, tail.r, 0.7, 0, 0, Math.PI * 2);
    ctx.fill();
    const a = t * 11 * spin;
    ctx.save();
    ctx.rotate(a);
    ctx.fillStyle = '#3b4650';
    ctx.strokeStyle = INK;
    ctx.lineWidth = 0.8;
    for (let k = 0; k < 2; k++) {
      ctx.rotate(Math.PI / 2);
      ctx.beginPath();
      ctx.roundRect ? ctx.roundRect(-r, -0.85, r * 2, 1.7, 0.85) : ctx.rect(-r, -0.85, r * 2, 1.7);
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
    ctx.fillStyle = INK;
    ctx.beginPath();
    ctx.arc(0, 0, 1.7, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** Draw a pre-rendered silhouette sprite centred at the current origin. */
export function drawSprite(ctx, sprite, scale = 1) {
  const k = scale / sprite.res;
  ctx.scale(k, k);
  ctx.drawImage(sprite.canvas, -sprite.half, -sprite.half);
}

// ---------------------------------------------------------------------------
// DOM

/** Aircraft as an SVG <g> placed at (x, y), heading `rot` degrees. */
export function aircraftG(type, color, { x = 0, y = 0, rot = 0, scale = 1, extra = '' } = {}) {
  return `<g transform="translate(${x} ${y}) rotate(${rot}) scale(${scale})" stroke-linejoin="round"${extra}>${aircraftBody(type, color)}</g>`;
}

function aircraftBody(type, color) {
  const design = DESIGNS[type];
  const team = TEAM[color];
  let body = '';
  for (const part of design.parts) {
    const lw = part.lw ?? 1.5;
    body += `<path d="${part.d}" fill="${paint(part.fill, team)}"${lw > 0 ? ` stroke="${INK}" stroke-width="${lw}"` : ''}/>`;
  }
  if (design.prop) {
    body += `<ellipse cx="${design.prop.x}" cy="0" rx="0.9" ry="${design.prop.r}" fill="rgba(34,48,58,0.28)"/>`;
    body += `<circle cx="${design.prop.x - 0.6}" cy="0" r="1.3" fill="${CREAM}" stroke="${INK}" stroke-width="0.8"/>`;
  }
  if (design.rotor) {
    const r = design.rotor.r;
    body += `<circle r="${r}" fill="rgba(251,245,230,0.25)" stroke="rgba(34,48,58,0.35)" stroke-width="0.8"/>`;
    body += `<g transform="rotate(30)"><rect x="${-r}" y="-0.85" width="${r * 2}" height="1.7" rx="0.85" fill="#3b4650" stroke="${INK}" stroke-width="0.8"/>`;
    body += `<rect x="-0.85" y="${-r}" width="1.7" height="${r * 2}" rx="0.85" fill="#3b4650" stroke="${INK}" stroke-width="0.8"/></g>`;
    body += `<circle r="1.7" fill="${INK}"/>`;
  }
  return body;
}

/** Standalone SVG markup for an aircraft (menus and illustrations). */
export function aircraftSVG(type, color, { size = 48, rotate = -90, title = '' } = {}) {
  const e = DESIGNS[type].extent;
  const label = title ? `<title>${title}</title>` : '';
  const aria = title ? `role="img" aria-label="${title}"` : 'aria-hidden="true"';
  return `<svg viewBox="${-e} ${-e} ${e * 2} ${e * 2}" width="${size}" height="${size}" ${aria} stroke-linejoin="round">${label}<g transform="rotate(${rotate})">${aircraftBody(type, color)}</g></svg>`;
}
