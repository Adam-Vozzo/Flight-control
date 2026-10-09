// Tuning for the whole game. World units are roughly CSS pixels on a phone:
// the short side of the airspace is always WORLD_H units tall.

export const WORLD_H = 400;
// The airspace keeps the screen's aspect ratio inside this range; anything
// wider or squarer is letterboxed with extra scenery.
export const MIN_ASPECT = 1.55;
export const MAX_ASPECT = 2.3;

export const INK = '#22303a';
export const CREAM = '#fbf5e6';

// Livery colours. `fill` paints the aircraft and landing zone, `shade` is used
// for wing undersides and details, `tint` for paths drawn on the ground.
export const TEAM = {
  red: { fill: '#e2553f', shade: '#b23f2c', tint: '#ffb3a3', name: 'red' },
  yellow: { fill: '#f4bf38', shade: '#c38f17', tint: '#ffe08a', name: 'yellow' },
  blue: { fill: '#3e9ad6', shade: '#276fa3', tint: '#a8dbff', name: 'blue' },
  pink: { fill: '#e8679c', shade: '#b04373', tint: '#ffb7d4', name: 'pink' },
};

export const AIRCRAFT = {
  light: { label: 'Light plane', speed: 21, radius: 10.5, land: 'runway', landTime: 2.0 },
  jet: { label: 'Jet', speed: 28, radius: 13, land: 'runway', landTime: 2.1 },
  heavy: { label: 'Jumbo', speed: 33, radius: 16, land: 'runway', landTime: 2.3 },
  heli: { label: 'Helicopter', speed: 15, radius: 11.5, land: 'pad', landTime: 1.9 },
  seaplane: { label: 'Seaplane', speed: 20, radius: 11, land: 'water', landTime: 2.2 },
};

export const SIM = {
  step: 1 / 60,
  edgeMargin: 8, // aircraft centres stay this far inside the airspace
  edgeTurnZone: 22, // start turning back this far from the edge
  turnRate: 2.6, // rad/s when turning back from an edge
  pathSpacing: 5, // distance between recorded path points
  maxPathPoints: 1600,
  pathInset: 10, // drawn paths are clamped this far inside the airspace
  zonePad: 9, // forgiveness around landing zones while drawing
  approachTol: (80 * Math.PI) / 180, // max angle between approach and runway heading
  alignDist: 26, // runway distance used to line up after the path snaps
  incomingTime: 3.0, // seconds an arrival is announced before it appears
  warnExtra: 30, // proximity warning starts this far before contact
  gateClearance: 80, // no arrivals while something is this close to the gate
  gateCooldown: 4,
};

export const DIFFICULTY = {
  firstSpawn: 0.6,
  intervalStart: 6.2,
  intervalEnd: 2.3,
  rampSeconds: 300,
  maxStart: 3,
  maxEnd: 18,
  maxEvery: 16, // seconds per extra simultaneous aircraft
};
