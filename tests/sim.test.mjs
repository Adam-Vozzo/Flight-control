import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  createWorld, step, spawnAircraft, startPath, extendPath, endPath, bounds, buildZones, zoneContains, approachOK,
} from '../src/sim.js';
import { MAPS } from '../src/maps.js';

const TEST_MAP = {
  id: 'test',
  zones: [
    { id: 'r1', kind: 'runway', color: 'red', a: { x: -100, y: 0 }, b: { x: 150, y: 0 }, width: 24 },
    { id: 'h1', kind: 'pad', color: 'blue', x: 0, y: -120, r: 22 },
  ],
  gates: [],
  traffic: [],
};

function quietWorld(map = TEST_MAP) {
  return createWorld({ map, aspect: 2, seed: 7, spawning: false });
}

function drawTo(world, a, points) {
  startPath(world, a);
  let snapped = false;
  for (const [x, y] of points) {
    if (extendPath(world, a, x, y)) {
      snapped = true;
      break;
    }
  }
  endPath(world, a);
  return snapped;
}

function run(world, seconds, until = () => false) {
  const steps = Math.round(seconds * 60);
  for (let i = 0; i < steps && !world.over; i++) {
    step(world);
    if (until(world)) return true;
  }
  return until(world);
}

test('runway zones only cover the threshold end', () => {
  const [r] = buildZones(TEST_MAP);
  assert.ok(zoneContains(r, -90, 0));
  assert.ok(zoneContains(r, -100, 15)); // forgiving edges
  assert.ok(!zoneContains(r, 140, 0)); // far end is not a landing zone
  assert.ok(!zoneContains(r, -90, 60));
});

test('approach must roughly follow the runway heading', () => {
  const [r] = buildZones(TEST_MAP);
  assert.ok(approachOK(r, 1, 0));
  assert.ok(approachOK(r, 1, 1)); // 45 degrees is fine
  assert.ok(!approachOK(r, 0, 1)); // straight across is not
  assert.ok(!approachOK(r, -1, 0)); // wrong way
});

test('a plane follows a drawn path onto its runway and lands', () => {
  const w = quietWorld();
  const a = spawnAircraft(w, { type: 'light', color: 'red', x: -250, y: 80, heading: 0 });
  const snapped = drawTo(w, a, [[-200, 40], [-160, 10], [-130, 0], [-80, 0]]);
  assert.equal(snapped, true);
  assert.equal(a.pathLanding.id, 'r1');
  const events = [];
  const landed = run(w, 30, (wd) => {
    events.push(...wd.events.splice(0));
    return wd.landed === 1;
  });
  assert.equal(landed, true);
  assert.ok(events.some((e) => e.type === 'land' && e.zone === 'r1'));
  run(w, 4);
  assert.equal(w.aircraft.length, 0, 'landed aircraft leave the airspace');
});

test('landing roll stays on the runway', () => {
  const w = quietWorld();
  const a = spawnAircraft(w, { type: 'heavy', color: 'red', x: -200, y: -60, heading: 0.5 });
  assert.ok(drawTo(w, a, [[-150, -20], [-110, 0], [-60, 0]]));
  const z = w.zones[0];
  run(w, 30, () => {
    if (a.state === 'landing') {
      const s = (a.x - z.ax) * z.ux + (a.y - z.ay) * z.uy;
      const l = (a.x - z.ax) * z.nx + (a.y - z.ay) * z.ny;
      assert.ok(s >= -2 && s <= z.len, `rolled to s=${s}`);
      assert.ok(Math.abs(l) <= z.width / 2, `drifted off centreline l=${l}`);
    }
    return a.done;
  });
  assert.equal(w.landed, 1);
});

test('wrong-way approaches do not lock onto the runway', () => {
  const w = quietWorld();
  const a = spawnAircraft(w, { type: 'light', color: 'red', x: 120, y: 40, heading: Math.PI });
  const snapped = drawTo(w, a, [[60, 0], [0, 0], [-95, 0], [-150, 0]]);
  assert.equal(snapped, false);
  assert.equal(a.pathLanding, null);
});

test('colours must match the landing zone', () => {
  const w = quietWorld();
  const a = spawnAircraft(w, { type: 'light', color: 'yellow', x: -250, y: 0, heading: 0 });
  assert.equal(drawTo(w, a, [[-160, 0], [-80, 0], [0, 0]]), false);
  const h = spawnAircraft(w, { type: 'heli', color: 'blue', x: -250, y: 50, heading: 0 });
  assert.equal(drawTo(w, h, [[-160, 0], [-80, 0]]), false, 'helicopters ignore runways');
});

test('helicopters land on the helipad from any direction', () => {
  const w = quietWorld();
  const h = spawnAircraft(w, { type: 'heli', color: 'blue', x: 60, y: 60, heading: 0 });
  assert.equal(drawTo(w, h, [[40, 0], [10, -100], [0, -120]]), true);
  assert.equal(run(w, 40, (wd) => wd.landed === 1), true);
});

test('aircraft on a collision course warn first, then crash', () => {
  const w = quietWorld();
  spawnAircraft(w, { type: 'light', color: 'red', x: -100, y: 120, heading: 0 });
  spawnAircraft(w, { type: 'light', color: 'yellow', x: 100, y: 120, heading: Math.PI });
  const seen = [];
  run(w, 10, (wd) => {
    seen.push(...wd.events.splice(0).map((e) => e.type));
    return wd.over;
  });
  assert.equal(w.over, true);
  assert.ok(seen.indexOf('warn-on') > -1 && seen.indexOf('warn-on') < seen.indexOf('crash'));
  assert.ok(Math.abs(w.crash.x) < 5);
});

test('landing aircraft are safe from collisions', () => {
  const w = quietWorld();
  const a = spawnAircraft(w, { type: 'light', color: 'red', x: -130, y: 0, heading: 0 });
  assert.ok(drawTo(w, a, [[-110, 0], [-90, 0]]));
  run(w, 20, () => a.state === 'landing');
  const z = w.zones[0];
  // Fly a second plane straight across the landing roll.
  spawnAircraft(w, { type: 'light', color: 'yellow', x: a.x + z.ux * 20, y: 60, heading: -Math.PI / 2 });
  run(w, 4);
  assert.equal(w.over, false);
});

test('aircraft without a path turn back at the edges', () => {
  const w = quietWorld();
  const planes = [
    spawnAircraft(w, { type: 'heavy', color: 'red', x: 0, y: 0, heading: 0.3 }),
    spawnAircraft(w, { type: 'jet', color: 'red', x: 0, y: -150, heading: -Math.PI / 2 }),
    spawnAircraft(w, { type: 'light', color: 'red', x: 300, y: 150, heading: Math.PI / 4 }),
  ];
  // Keep them apart: this test is about the edges, not separation.
  planes.forEach((p, i) => (p.radius = 0.01 * (i + 1)));
  const b = bounds(w, 0);
  for (let i = 0; i < 60 * 90; i++) {
    step(w);
    for (const p of planes) {
      assert.ok(p.x >= b.minX && p.x <= b.maxX && p.y >= b.minY && p.y <= b.maxY, `escaped at ${p.x},${p.y}`);
    }
  }
});

test('the planes keep following the finger after it overtakes them', () => {
  const w = quietWorld();
  const a = spawnAircraft(w, { type: 'jet', color: 'red', x: 0, y: 100, heading: 0 });
  startPath(w, a);
  extendPath(w, a, 20, 100);
  run(w, 2); // the plane reaches the end of the path while the finger rests
  const xBefore = a.x;
  assert.ok(a.x > 20, 'keeps flying straight while waiting for more path');
  extendPath(w, a, a.x, 40);
  run(w, 3);
  assert.ok(a.y < 80, 'turned to follow the new path');
  assert.ok(a.x >= xBefore - 1);
  endPath(w, a);
});

test('every map is self-consistent and spawns playable traffic', () => {
  for (const map of Object.values(MAPS)) {
    const zones = buildZones(map);
    for (const entry of map.traffic) {
      const ok = zones.some((z) => z.color === entry.color && z.kind === landKind(entry.type));
      assert.ok(ok, `${map.id}: no landing zone for ${entry.color} ${entry.type}`);
    }
    for (const z of zones) {
      if (z.kind === 'pad') continue;
      assert.ok(z.zoneLen > 40, `${map.id}/${z.id}: landing zone too short`);
    }
    const w = createWorld({ map, aspect: 1.9, seed: 42, separation: false });
    const kinds = new Set();
    run(w, 45, (wd) => {
      for (const a of wd.aircraft) kinds.add(`${a.color}-${a.type}`);
      return false;
    });
    assert.ok(w.arrivals >= 5, `${map.id}: only ${w.arrivals} arrivals in 45s`);
    assert.ok(kinds.size >= 2, `${map.id}: traffic lacks variety`);
  }
});

function landKind(type) {
  return { light: 'runway', jet: 'runway', heavy: 'runway', heli: 'pad', seaplane: 'water', fighter: 'runway' }[type];
}

test('every landing zone on every map can be reached and landed on', () => {
  const typeFor = { runway: ['light', 'jet', 'heavy', 'fighter'], pad: ['heli'], water: ['seaplane'] };
  for (const map of Object.values(MAPS)) {
    for (const aspect of [1.55, 2.3]) {
      for (const zone of buildZones(map)) {
        const type = typeFor[zone.kind].find((t) => map.traffic.some((e) => e.type === t && e.color === zone.color));
        assert.ok(type, `${map.id}/${zone.id}: nothing ever lands here`);
        const w = createWorld({ map, aspect, seed: 3, spawning: false, separation: false });
        const b = bounds(w, 12);
        const inside = (x, y) => [Math.min(b.maxX, Math.max(b.minX, x)), Math.min(b.maxY, Math.max(b.minY, y))];
        let start;
        let route;
        if (zone.kind === 'pad') {
          start = inside(zone.x + 70, zone.y + 40);
          route = [[zone.x, zone.y]];
        } else {
          start = inside(zone.ax - zone.ux * 90, zone.ay - zone.uy * 90);
          route = [];
          for (let s = -60; s <= 20; s += 4) route.push([zone.ax + zone.ux * s, zone.ay + zone.uy * s]);
        }
        const a = spawnAircraft(w, { type, color: zone.color, x: start[0], y: start[1], heading: zone.heading ?? 0 });
        assert.equal(drawTo(w, a, route), true, `${map.id}/${zone.id} at ${aspect}: path never locked on`);
        assert.equal(run(w, 40, (wd) => wd.landed === 1), true, `${map.id}/${zone.id} at ${aspect}: never landed`);
      }
    }
  }
});
