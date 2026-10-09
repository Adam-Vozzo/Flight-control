// The game simulation. Pure data in, pure data out: no DOM access here, so
// the rules can be unit-tested in Node and replayed from a seed.
//
// World coordinates: origin at the centre of the airspace, +x east, +y south.
// Headings are radians measured from +x towards +y.

import { AIRCRAFT, SIM, DIFFICULTY, WORLD_H, MIN_ASPECT, MAX_ASPECT } from './config.js';
import {
  clamp, lerp, smoothstep, angleDiff, mulberry32, randRange, weightedPick, cubic, easeOutCubic,
} from './math.js';

// ---------------------------------------------------------------------------
// Landing zones

export function buildZones(map) {
  return map.zones.map((z) => {
    if (z.kind === 'pad') return { ...z };
    const dx = z.b.x - z.a.x;
    const dy = z.b.y - z.a.y;
    const len = Math.hypot(dx, dy);
    const ux = dx / len;
    const uy = dy / len;
    return {
      ...z,
      ax: z.a.x, ay: z.a.y, bx: z.b.x, by: z.b.y,
      len, ux, uy, nx: -uy, ny: ux,
      heading: Math.atan2(uy, ux),
      // Only the threshold end of a runway accepts arrivals.
      zoneLen: z.zoneLen ?? Math.min(len * 0.5, len - 80),
    };
  });
}

export function zoneContains(z, x, y, pad = SIM.zonePad) {
  if (z.kind === 'pad') return Math.hypot(x - z.x, y - z.y) <= z.r + pad;
  const rx = x - z.ax;
  const ry = y - z.ay;
  const s = rx * z.ux + ry * z.uy;
  const l = rx * z.nx + ry * z.ny;
  return s >= -pad - 6 && s <= z.zoneLen && Math.abs(l) <= z.width / 2 + pad;
}

export const zoneAccepts = (z, a) => z.color === a.color && z.kind === AIRCRAFT[a.type].land;

/** Runways must be approached from the threshold end, roughly along the arrows. */
export function approachOK(z, dx, dy) {
  if (z.kind === 'pad') return true;
  const d = Math.hypot(dx, dy);
  if (d < 1e-6) return false;
  return (dx * z.ux + dy * z.uy) / d >= Math.cos(SIM.approachTol);
}

// ---------------------------------------------------------------------------
// World

export function worldWidth(aspect) {
  return Math.round(WORLD_H * clamp(aspect, MIN_ASPECT, MAX_ASPECT));
}

export function createWorld({ map, aspect = 1.95, seed, attract = false, spawning = true, separation = !attract }) {
  const s = seed ?? (Math.random() * 2 ** 32) >>> 0;
  return {
    map,
    W: worldWidth(aspect),
    H: WORLD_H,
    seed: s,
    rng: mulberry32(s),
    t: 0,
    aircraft: [],
    incoming: [],
    landed: 0,
    nextId: 1,
    spawning,
    spawnClock: attract ? 0.2 : DIFFICULTY.firstSpawn,
    arrivals: 0,
    gateLast: new Map(),
    zones: buildZones(map),
    over: false,
    crash: null,
    attract,
    separation,
    warn: false,
    events: [],
  };
}

export function bounds(world, inset = SIM.edgeMargin) {
  return {
    minX: -world.W / 2 + inset,
    maxX: world.W / 2 - inset,
    minY: -world.H / 2 + inset,
    maxY: world.H / 2 - inset,
  };
}

export function gatePoint(world, gate) {
  const { W, H } = world;
  switch (gate.edge) {
    case 'left': return { x: -W / 2, y: -H / 2 + gate.at * H, nx: 1, ny: 0 };
    case 'right': return { x: W / 2, y: -H / 2 + gate.at * H, nx: -1, ny: 0 };
    case 'top': return { x: -W / 2 + gate.at * W, y: -H / 2, nx: 0, ny: 1 };
    default: return { x: -W / 2 + gate.at * W, y: H / 2, nx: 0, ny: -1 };
  }
}

/** True while the aircraft can be grabbed: in the air and on screen. */
export function canControl(world, a) {
  if (world.over || (a.state !== 'flying' && a.state !== 'entering')) return false;
  return Math.abs(a.x) <= world.W / 2 + 2 && Math.abs(a.y) <= world.H / 2 + 2;
}

function makeAircraft(world, { type, color, x, y, heading, speedJitter = true }) {
  const spec = AIRCRAFT[type];
  return {
    id: world.nextId++,
    type,
    color,
    x,
    y,
    heading,
    rot: heading,
    speed: spec.speed * (speedJitter ? randRange(world.rng, 0.94, 1.06) : 1),
    radius: spec.radius,
    path: [],
    pathTravel: 0,
    pathLanding: null,
    drawing: false,
    state: 'entering',
    turnTarget: null,
    turnDir: 0,
    land: null,
    alt: 1,
    alpha: 1,
    warn: false,
    age: 0,
    done: false,
  };
}

/** Put an aircraft straight into the airspace (tests, tutorial, debug). */
export function spawnAircraft(world, opts) {
  const a = makeAircraft(world, { speedJitter: false, ...opts });
  a.state = 'flying';
  world.aircraft.push(a);
  return a;
}

// ---------------------------------------------------------------------------
// Arrivals

function trafficWeight(entry, t) {
  if (t < (entry.from ?? 0)) return 0;
  const ramp = entry.ramp ?? 0;
  return entry.w * (ramp > 0 ? smoothstep(entry.from ?? 0, (entry.from ?? 0) + ramp, t) : 1);
}

function spawnInterval(world) {
  if (world.attract) return randRange(world.rng, 2.6, 4.2);
  const t = world.t;
  const base = lerp(DIFFICULTY.intervalStart, DIFFICULTY.intervalEnd, smoothstep(0, DIFFICULTY.rampSeconds, t));
  // A roomier airspace (wider screens) gets a little more traffic.
  const room = clamp(Math.sqrt((world.W * world.H) / (780 * WORLD_H)), 0.88, 1.12);
  return ((base * (world.map.pace ?? 1)) / room) * randRange(world.rng, 0.85, 1.15);
}

export function maxAircraft(world) {
  if (world.attract) return 6;
  const n = DIFFICULTY.maxStart + Math.floor(world.t / DIFFICULTY.maxEvery);
  return clamp(n, DIFFICULTY.maxStart, DIFFICULTY.maxEnd);
}

function gateClear(world, gate) {
  const p = gatePoint(world, gate);
  return world.aircraft.every(
    (a) => a.state === 'landing' || Math.hypot(a.x - p.x, a.y - p.y) > SIM.gateClearance,
  );
}

function chooseGate(world) {
  const open = [];
  world.map.gates.forEach((g, i) => {
    const last = world.gateLast.get(i);
    if (last !== undefined && world.t - last < SIM.gateCooldown) return;
    if (world.incoming.some((inc) => inc.gate === i)) return;
    if (!gateClear(world, g)) return;
    open.push(i);
  });
  if (!open.length) return -1;
  return open[Math.floor(world.rng() * open.length)];
}

function scheduleArrival(world) {
  const gi = chooseGate(world);
  if (gi < 0) return false;
  const first = world.arrivals === 0 && !world.attract ? world.map.firstArrival : null;
  const pick = first ?? weightedPick(world.rng, world.map.traffic, (e) => trafficWeight(e, world.t));
  if (!pick) return false;

  const p = gatePoint(world, world.map.gates[gi]);
  const tx = randRange(world.rng, -world.W * 0.25, world.W * 0.25);
  const ty = randRange(world.rng, -world.H * 0.25, world.H * 0.25);
  const inward = Math.atan2(p.ny, p.nx);
  const heading = inward + clamp(angleDiff(inward, Math.atan2(ty - p.y, tx - p.x)), -0.85, 0.85);
  const time = world.attract ? 0 : SIM.incomingTime;

  world.arrivals++;
  world.incoming.push({
    gate: gi,
    type: pick.type,
    color: pick.color,
    x: p.x,
    y: p.y,
    nx: p.nx,
    ny: p.ny,
    heading,
    timer: time,
    total: time,
  });
  world.gateLast.set(gi, world.t);
  if (!world.attract) world.events.push({ type: 'incoming', color: pick.color, x: p.x, y: p.y });
  return true;
}

function launch(world, inc) {
  const back = AIRCRAFT[inc.type].radius + 12;
  const a = makeAircraft(world, {
    type: inc.type,
    color: inc.color,
    x: inc.x - inc.nx * back,
    y: inc.y - inc.ny * back,
    heading: inc.heading,
  });
  world.aircraft.push(a);
  world.gateLast.set(inc.gate, world.t);
}

function updateArrivals(world, dt) {
  if (world.spawning) {
    world.spawnClock -= dt;
    if (world.spawnClock <= 0) {
      const live = world.aircraft.filter((a) => a.state !== 'landing').length + world.incoming.length;
      if (live < maxAircraft(world) && scheduleArrival(world)) world.spawnClock = spawnInterval(world);
      else world.spawnClock = 0.5;
    }
  }
  for (let i = world.incoming.length - 1; i >= 0; i--) {
    const inc = world.incoming[i];
    inc.timer -= dt;
    if (inc.timer > 0) continue;
    // Hold the arrival at the edge until its entry point is clear.
    if (!gateClear(world, world.map.gates[inc.gate])) {
      inc.timer = 0;
      continue;
    }
    world.incoming.splice(i, 1);
    launch(world, inc);
  }
}

// ---------------------------------------------------------------------------
// Flight paths (called by the input layer)

export function startPath(world, a) {
  a.path.length = 0;
  a.pathTravel = 0;
  a.pathLanding = null;
  a.drawing = true;
  a.turnTarget = null;
}

export function endPath(world, a) {
  a.drawing = false;
}

/** Direction of travel over the last ~24 units of a path ending at p. */
function approachVector(a, p) {
  let need = 24;
  let prev = p;
  for (let i = a.path.length - 2; i >= 0 && need > 0; i--) {
    const q = a.path[i];
    need -= Math.hypot(prev.x - q.x, prev.y - q.y);
    prev = q;
  }
  if (need > 0) prev = { x: a.x, y: a.y };
  let dx = p.x - prev.x;
  let dy = p.y - prev.y;
  if (Math.hypot(dx, dy) < 3) {
    dx = Math.cos(a.heading);
    dy = Math.sin(a.heading);
  }
  const d = Math.hypot(dx, dy);
  return { x: dx / d, y: dy / d };
}

function findLandingZone(world, a, p) {
  for (const z of world.zones) {
    if (!zoneAccepts(z, a) || !zoneContains(z, p.x, p.y)) continue;
    const v = approachVector(a, p);
    if (approachOK(z, v.x, v.y)) return z;
  }
  return null;
}

function snapToZone(world, a, z, p) {
  if (z.kind === 'pad') {
    const d = Math.hypot(z.x - p.x, z.y - p.y);
    const n = Math.max(1, Math.ceil(d / SIM.pathSpacing));
    for (let i = 1; i <= n; i++) a.path.push({ x: lerp(p.x, z.x, i / n), y: lerp(p.y, z.y, i / n) });
  } else {
    // Curve from where the path met the runway onto its centreline.
    const s = clamp((p.x - z.ax) * z.ux + (p.y - z.ay) * z.uy, 0, z.zoneLen);
    const sq = Math.min(s + SIM.alignDist, z.len - 50);
    const q = { x: z.ax + z.ux * sq, y: z.ay + z.uy * sq };
    const v = approachVector(a, p);
    const k = Math.hypot(q.x - p.x, q.y - p.y) * 0.45;
    const c1 = { x: p.x + v.x * k, y: p.y + v.y * k };
    const c2 = { x: q.x - z.ux * k, y: q.y - z.uy * k };
    for (let i = 1; i <= 8; i++) a.path.push(cubic(p, c1, c2, q, i / 8));
  }
  a.pathLanding = z;
  a.drawing = false;
  world.events.push({ type: 'snap', id: a.id, zone: z.id, color: a.color, x: p.x, y: p.y });
}

/**
 * Extend the path being drawn for `a` towards (x, y). Returns true when the
 * path reaches a matching landing zone and locks in.
 */
export function extendPath(world, a, x, y) {
  if (!a.drawing) return false;
  const b = bounds(world, SIM.pathInset);
  x = clamp(x, b.minX, b.maxX);
  y = clamp(y, b.minY, b.maxY);
  const last = a.path.length ? a.path[a.path.length - 1] : { x: a.x, y: a.y };
  const dx = x - last.x;
  const dy = y - last.y;
  const d = Math.hypot(dx, dy);
  if (d < SIM.pathSpacing) return false;
  const n = Math.floor(d / SIM.pathSpacing);
  for (let i = 1; i <= n; i++) {
    if (a.path.length >= SIM.maxPathPoints) return false;
    const t = (i * SIM.pathSpacing) / d;
    const p = { x: last.x + dx * t, y: last.y + dy * t };
    a.path.push(p);
    const z = findLandingZone(world, a, p);
    if (z) {
      snapToZone(world, a, z, p);
      return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// Flying

function steerAtEdges(world, a, dt) {
  const b = bounds(world);
  const zone = SIM.edgeTurnZone;
  if (a.turnTarget === null) {
    const cx = Math.cos(a.heading);
    const cy = Math.sin(a.heading);
    let tx = cx;
    let ty = cy;
    let hit = false;
    if ((a.x > b.maxX - zone && cx > 0) || (a.x < b.minX + zone && cx < 0)) {
      tx = -cx;
      hit = true;
    }
    if ((a.y > b.maxY - zone && cy > 0) || (a.y < b.minY + zone && cy < 0)) {
      ty = -cy;
      hit = true;
    }
    if (hit) {
      const target = Math.atan2(ty, tx);
      let d = angleDiff(a.heading, target);
      if (Math.abs(d) > Math.PI - 0.05) {
        // Head-on to the edge: turn towards the middle of the airspace.
        d = cx * -a.y - cy * -a.x >= 0 ? 1 : -1;
      }
      a.turnTarget = target;
      a.turnDir = Math.sign(d) || 1;
    }
  }
  if (a.turnTarget !== null) {
    const d = angleDiff(a.heading, a.turnTarget);
    const max = SIM.turnRate * dt;
    if (Math.abs(d) <= max) {
      a.heading = a.turnTarget;
      a.turnTarget = null;
    } else {
      a.heading += a.turnDir * max;
    }
  }
}

function beginLanding(world, a) {
  const z = a.pathLanding;
  a.state = 'landing';
  a.land = { zone: z, t: 0, dur: AIRCRAFT[a.type].landTime, v0: a.speed };
  a.pathLanding = null;
  a.path.length = 0;
  a.warn = false;
  a.turnTarget = null;
  world.landed++;
  world.events.push({ type: 'land', id: a.id, x: a.x, y: a.y, color: a.color, kind: z.kind, zone: z.id });
}

function updateLanding(world, a, dt) {
  const L = a.land;
  const z = L.zone;
  L.t += dt / L.dur;
  const k = Math.min(1, L.t);
  if (z.kind === 'pad') {
    const f = Math.min(1, dt * 3);
    a.x = lerp(a.x, z.x, f);
    a.y = lerp(a.y, z.y, f);
  } else {
    a.heading += angleDiff(a.heading, z.heading) * Math.min(1, dt * 6);
    const v = L.v0 * lerp(1, 0.22, easeOutCubic(k));
    a.x += Math.cos(a.heading) * v * dt;
    a.y += Math.sin(a.heading) * v * dt;
  }
  a.alt = 1 - smoothstep(0, 0.6, k);
  a.alpha = 1 - smoothstep(0.75, 1, k);
  a.rot += angleDiff(a.rot, a.heading) * Math.min(1, dt * 10);
  if (L.t >= 1) a.done = true;
}

function updateAircraft(world, a, dt) {
  a.age += dt;
  if (a.state === 'landing') {
    updateLanding(world, a, dt);
    return;
  }

  let remaining = a.speed * dt;
  let followed = false;
  while (remaining > 1e-9 && a.path.length) {
    followed = true;
    const p = a.path[0];
    const dx = p.x - a.x;
    const dy = p.y - a.y;
    const d = Math.hypot(dx, dy);
    if (d < 1e-6) {
      a.path.shift();
      continue;
    }
    a.heading = Math.atan2(dy, dx);
    if (d <= remaining) {
      a.x = p.x;
      a.y = p.y;
      remaining -= d;
      a.pathTravel += d;
      a.path.shift();
    } else {
      a.x += (dx / d) * remaining;
      a.y += (dy / d) * remaining;
      a.pathTravel += remaining;
      remaining = 0;
    }
  }
  if (followed) a.turnTarget = null;

  if (!a.path.length && a.pathLanding && !a.drawing) {
    beginLanding(world, a);
    return;
  }

  if (remaining > 0) {
    if (a.state === 'flying') steerAtEdges(world, a, dt);
    a.x += Math.cos(a.heading) * remaining;
    a.y += Math.sin(a.heading) * remaining;
    if (a.drawing) a.pathTravel += remaining;
  }

  const b = bounds(world);
  if (a.state === 'entering') {
    if (a.x >= b.minX && a.x <= b.maxX && a.y >= b.minY && a.y <= b.maxY) a.state = 'flying';
  } else {
    a.x = clamp(a.x, b.minX - 2, b.maxX + 2);
    a.y = clamp(a.y, b.minY - 2, b.maxY + 2);
  }

  a.rot += angleDiff(a.rot, a.heading) * Math.min(1, dt * 12);

  if (world.attract && a.state === 'flying' && !a.path.length && !a.pathLanding) autopilot(world, a);
}

/** Title-screen traffic: fly a tidy approach to a random matching zone. */
function autopilot(world, a) {
  const zones = world.zones.filter((z) => zoneAccepts(z, a));
  if (!zones.length) return;
  const z = zones[Math.floor(world.rng() * zones.length)];
  const p0 = { x: a.x, y: a.y };
  const p1 = { x: a.x + Math.cos(a.heading) * 90, y: a.y + Math.sin(a.heading) * 90 };
  let p2;
  const tail = [];
  if (z.kind === 'pad') {
    p2 = { x: z.x, y: z.y };
  } else {
    p2 = { x: z.ax - z.ux * 70, y: z.ay - z.uy * 70 };
    for (let s = -60; s <= 12; s += 6) tail.push({ x: z.ax + z.ux * s, y: z.ay + z.uy * s });
  }
  startPath(world, a);
  const pts = [];
  for (let i = 1; i <= 40; i++) {
    const t = i / 40;
    const u = 1 - t;
    pts.push({
      x: u * u * p0.x + 2 * u * t * p1.x + t * t * p2.x,
      y: u * u * p0.y + 2 * u * t * p1.y + t * t * p2.y,
    });
  }
  for (const p of pts.concat(tail)) if (extendPath(world, a, p.x, p.y)) break;
  a.drawing = false;
  // Don't let a failed approach loop forever: drop it and try again later.
  if (!a.pathLanding) a.path.length = Math.min(a.path.length, 30);
}

// ---------------------------------------------------------------------------
// Separation

function crash(world, a, b) {
  world.over = true;
  world.crash = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, ids: [a.id, b.id], t: world.t };
  a.crashed = true;
  b.crashed = true;
  a.drawing = false;
  b.drawing = false;
  if (world.warn) {
    world.warn = false;
    world.events.push({ type: 'warn-off' });
  }
  world.events.push({ type: 'crash', x: world.crash.x, y: world.crash.y });
}

function checkSeparation(world) {
  const live = world.aircraft.filter((a) => a.state === 'flying' || a.state === 'entering');
  for (const a of live) a.warn = false;
  let any = false;
  for (let i = 0; i < live.length; i++) {
    const a = live[i];
    for (let j = i + 1; j < live.length; j++) {
      const b = live[j];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d2 = dx * dx + dy * dy;
      const rr = a.radius + b.radius;
      if (d2 < rr * rr) {
        crash(world, a, b);
        return;
      }
      const w = rr + SIM.warnExtra;
      if (d2 < w * w) {
        a.warn = true;
        b.warn = true;
        any = true;
      }
    }
  }
  if (any !== world.warn) {
    world.warn = any;
    world.events.push({ type: any ? 'warn-on' : 'warn-off' });
  }
}

export function step(world, dt = SIM.step) {
  if (world.over) return;
  world.t += dt;
  updateArrivals(world, dt);
  for (const a of world.aircraft) updateAircraft(world, a, dt);
  if (world.aircraft.some((a) => a.done)) world.aircraft = world.aircraft.filter((a) => !a.done);
  if (world.separation) checkSeparation(world);
}
