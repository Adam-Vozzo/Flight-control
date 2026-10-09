// Boots the game: wires the simulation, renderer, input, sound and menus.

import { MAPS, MAP_ORDER, mapSVG } from './maps.js';
import { createWorld, step, zoneAccepts, worldWidth, bounds } from './sim.js';
import { SIM, TEAM, INK } from './config.js';
import { Renderer } from './render.js';
import { computeView, readSafeArea, screenAspect, svgMatrix, toScreen } from './view.js';
import { PathInput } from './input.js';
import { Sound } from './audio.js';
import { haptic, hapticsAvailable, setHaptics } from './haptics.js';
import { loadStore, saveStore } from './storage.js';
import { aircraftG } from './art.js';
import { clamp, easeInOutCubic } from './math.js';

const $ = (id) => document.getElementById(id);

const els = {
  app: $('app'),
  camera: $('camera'),
  canvas: $('fx'),
  probe: $('safe-probe'),
  hud: $('hud'),
  hudScore: document.querySelector('.hud-score'),
  score: $('score'),
  ff: $('btn-ff'),
  pause: $('btn-pause'),
  toast: $('toast'),
  strips: $('strips'),
  overScore: $('over-score'),
  overBest: $('over-best'),
  overRecord: $('over-record'),
  installTip: $('install-tip'),
};

const screens = {
  title: $('screen-title'),
  pause: $('screen-pause'),
  over: $('screen-over'),
  help: $('screen-help'),
};

const store = loadStore();
const sound = new Sound();
sound.sfxOn = store.sound;
sound.musicOn = store.music;
setHaptics(store.haptics);

const renderer = new Renderer(els.canvas);
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

const state = {
  mode: 'title', // title | playing | paused | crashing | over
  world: null,
  mapId: MAPS[store.lastMap] ? store.lastMap : 'airfield',
  shownMap: null,
  speed: 1,
  acc: 0,
  last: performance.now(),
  crashAt: 0,
  vw: innerWidth,
  vh: innerHeight,
  safe: { t: 0, r: 0, b: 0, l: 0 },
  view: null,
  matrix: '',
  tutorial: null,
  afterHelp: null,
  toastTimer: 0,
  dirty: true,
  avoid: [],
  wakeLock: null,
  crashPlace: '',
};

// ---------------------------------------------------------------- input

const input = new PathInput(els.canvas, {
  world: () => state.world,
  view: () => state.view,
  enabled: () => state.mode === 'playing',
  onGrab() {
    sound.play('grab');
    haptic('grab');
  },
  onPathStart() {},
  onSnap() {
    haptic('snap');
  },
  onRelease() {},
});

// ---------------------------------------------------------------- device

async function keepAwake(on) {
  try {
    if (on && !state.wakeLock && navigator.wakeLock) {
      const lock = await navigator.wakeLock.request('screen');
      state.wakeLock = lock;
      lock.addEventListener('release', () => {
        if (state.wakeLock === lock) state.wakeLock = null;
      });
    } else if (!on && state.wakeLock) {
      const lock = state.wakeLock;
      state.wakeLock = null;
      await lock.release();
    }
  } catch {
    state.wakeLock = null;
  }
}

/** Screen rectangles that arrival badges should keep clear of. */
function measureHud() {
  if (els.hud.hidden) {
    state.avoid = [];
    return;
  }
  state.avoid = [els.hudScore, els.ff, els.pause].map((el) => {
    const r = el.getBoundingClientRect();
    return { x0: r.left, y0: r.top, x1: r.right, y1: r.bottom };
  });
}

// ---------------------------------------------------------------- world

function currentAspect() {
  return screenAspect(state.vw, state.vh, state.safe);
}

function showMap(id) {
  if (state.shownMap === id) return;
  els.camera.innerHTML = mapSVG(MAPS[id]);
  state.shownMap = id;
}

function startAttract() {
  showMap(state.mapId);
  const w = createWorld({ map: MAPS[state.mapId], aspect: currentAspect(), attract: true });
  // Warm up so the title opens with traffic already in the air.
  for (let i = 0; i < 60 * 9; i++) step(w, SIM.step);
  w.events.length = 0;
  state.world = w;
  state.dirty = true;
}

function startGame(id) {
  sound.unlock();
  state.mapId = id;
  store.lastMap = id;
  saveStore(store);
  if (!store.helpSeen && !store.tutorial) {
    store.helpSeen = true;
    saveStore(store);
    showHelp(() => beginGame(id));
    return;
  }
  beginGame(id);
}

function beginGame(id) {
  showMap(id);
  input.releaseAll();
  renderer.clearFx();
  state.world = createWorld({ map: MAPS[id], aspect: currentAspect() });
  state.mode = 'playing';
  state.speed = 1;
  state.acc = 0;
  state.last = performance.now();
  state.tutorial = store.tutorial ? null : { stage: 'draw' };
  setFastForward(false);
  setScreen(null);
  els.hud.hidden = false;
  els.score.textContent = '0';
  measureHud();
  hideToast();
  sound.setWarning(false);
  sound.setDuck(0.8);
  sound.play('start');
  keepAwake(true);
}

function toTitle() {
  keepAwake(false);
  input.releaseAll();
  sound.setWarning(false);
  sound.setDuck(1);
  state.mode = 'title';
  els.hud.hidden = true;
  hideToast();
  renderer.clearFx();
  refreshStrips();
  startAttract();
  setScreen('title');
}

function pause() {
  if (state.mode !== 'playing') return;
  state.mode = 'paused';
  keepAwake(false);
  input.releaseAll();
  sound.setWarning(false);
  sound.setDuck(0.3);
  setScreen('pause');
  $('btn-resume').focus({ preventScroll: true });
}

function resume() {
  if (state.mode !== 'paused') return;
  state.mode = 'playing';
  state.last = performance.now();
  setScreen(null);
  keepAwake(true);
  sound.setDuck(0.8);
  if (state.world.warn) sound.setWarning(true);
}

function onCrash(t) {
  state.mode = 'crashing';
  state.crashAt = t;
  const p = toScreen(state.view, state.world.crash.x, state.world.crash.y);
  state.crashPlace = state.vw > state.vh
    ? (p.x < state.vw / 2 ? 'right' : 'left')
    : (p.y < state.vh / 2 ? 'bottom' : 'top');
  keepAwake(false);
  input.releaseAll();
  hideToast();
  sound.setWarning(false);
  sound.play('crash');
  sound.setDuck(0.3);
  haptic('crash');
  els.hud.hidden = true;
  setTimeout(showGameOver, 1600);
}

function showGameOver() {
  if (state.mode !== 'crashing') return;
  const w = state.world;
  const id = state.mapId;
  const prev = store.best[id] || 0;
  const record = w.landed > prev;
  if (record) store.best[id] = w.landed;
  store.played = (store.played || 0) + 1;
  saveStore(store);
  els.overScore.textContent = String(w.landed);
  const where = MAPS[id].name;
  els.overBest.textContent = record && prev > 0 ? `${where} · previous best ${prev}` : `${where} · best ${Math.max(prev, w.landed)}`;
  els.overRecord.hidden = !record;
  // Keep the wreck in view: the report goes on the other side of the screen.
  screens.over.dataset.place = state.crashPlace || '';
  state.mode = 'over';
  setScreen('over');
  if (record) sound.play('record');
  $('btn-again').focus({ preventScroll: true });
}

function setFastForward(on) {
  state.speed = on ? 2 : 1;
  els.ff.setAttribute('aria-pressed', String(on));
}

// ---------------------------------------------------------------- events

function handleEvents(w, t) {
  if (!w.events.length) return;
  const events = w.events.splice(0);
  if (w.attract) return;
  for (const ev of events) {
    switch (ev.type) {
      case 'incoming':
        sound.play('incoming');
        break;
      case 'snap':
        sound.play('snap');
        renderer.addFx({ kind: 'flash', zone: ev.zone, t0: t, life: 0.7 });
        renderer.addFx({ kind: 'ripple', x: ev.x, y: ev.y, color: ev.color, t0: t, life: 0.6 });
        if (state.tutorial && state.tutorial.stage === 'draw') {
          state.tutorial.stage = 'land';
          showToast('Cleared to land. It will touch down on its own.', 3200);
        }
        break;
      case 'land':
        sound.play('land');
        renderer.addFx({ kind: 'score', x: ev.x, y: ev.y, text: '+1', t0: t, life: 1.2 });
        bumpScore(w.landed);
        if (state.tutorial) {
          state.tutorial = null;
          store.tutorial = true;
          saveStore(store);
          showToast('Nice landing. Keep them coming, and keep them apart.', 3600);
        }
        break;
      case 'warn-on':
        sound.setWarning(true);
        break;
      case 'warn-off':
        sound.setWarning(false);
        break;
      case 'crash':
        onCrash(t);
        break;
      default:
        break;
    }
  }
}

function bumpScore(n) {
  els.score.textContent = String(n);
  els.hudScore.classList.remove('bump');
  void els.hudScore.offsetWidth;
  els.hudScore.classList.add('bump');
}

// ---------------------------------------------------------------- tutorial

const NOUNS = { light: 'plane', jet: 'jet', heavy: 'jumbo jet', heli: 'helicopter', seaplane: 'seaplane', fighter: 'fighter jet' };

const KIND_WORDS = {
  runway: (c) => `the ${c} runway`,
  pad: (c) => `the ${c} helipad`,
  water: (c) => `the ${c} water lane`,
};

function tutorialHint(w) {
  const tut = state.tutorial;
  if (!tut || tut.stage !== 'draw') return null;
  const a = w.aircraft.find((p) => p.state === 'flying' && !p.pathLanding && !p.drawing);
  if (!a) return null;
  const z = w.zones.find((q) => zoneAccepts(q, a));
  if (!z) return null;
  if (tut.shownFor !== a.id) {
    tut.shownFor = a.id;
    const swatch = `<span class="swatch" style="background:${TEAM[a.color].fill}"></span>`;
    const what = NOUNS[a.type];
    showToast(`Touch the ${swatch}${a.color} ${what}, then drag a path to ${KIND_WORDS[z.kind](`${swatch}${a.color}`)}.`, 0);
  }
  const b = bounds(w, 16);
  const inside = (p) => ({ x: clamp(p.x, b.minX, b.maxX), y: clamp(p.y, b.minY, b.maxY) });
  let points;
  if (z.kind === 'pad') points = [{ x: a.x, y: a.y }, { x: z.x, y: z.y }];
  else points = [{ x: a.x, y: a.y }, inside({ x: z.ax - z.ux * 55, y: z.ay - z.uy * 55 }), { x: z.ax + z.ux * 30, y: z.ay + z.uy * 30 }];
  return { points };
}

// ---------------------------------------------------------------- frame

function updateView(t) {
  const w = state.world;
  let zoom = 1;
  let fx = 0;
  let fy = 0;
  if (w.crash && (state.mode === 'crashing' || state.mode === 'over')) {
    const k = reducedMotion ? 1 : easeInOutCubic(clamp((t - state.crashAt) / 1.2, 0, 1));
    zoom = 1 + 0.45 * k;
    // Ease the wreck into the half of the screen the report card leaves free.
    const v = computeView({ vw: state.vw, vh: state.vh, safe: state.safe, W: w.W, H: w.H, zoom });
    const r = v.rect;
    let tx = r.x + r.w / 2;
    let ty = r.y + r.h / 2;
    if (state.crashPlace === 'right') tx = r.x + r.w * 0.27;
    else if (state.crashPlace === 'left') tx = r.x + r.w * 0.73;
    else if (state.crashPlace === 'bottom') ty = r.y + r.h * 0.28;
    else if (state.crashPlace === 'top') ty = r.y + r.h * 0.72;
    const det = v.a * v.d - v.b * v.c;
    const dx = tx - (r.x + r.w / 2);
    const dy = ty - (r.y + r.h / 2);
    const mx = (w.W / 2) * (1 - 1 / zoom) + 60;
    const my = (w.H / 2) * (1 - 1 / zoom) + 60;
    fx = clamp(w.crash.x - (v.d * dx - v.c * dy) / det, -mx, mx) * k;
    fy = clamp(w.crash.y - (-v.b * dx + v.a * dy) / det, -my, my) * k;
  }
  state.view = computeView({ vw: state.vw, vh: state.vh, safe: state.safe, W: w.W, H: w.H, zoom, focusX: fx, focusY: fy });
  const m = svgMatrix(state.view);
  if (m !== state.matrix) {
    els.camera.setAttribute('transform', m);
    state.matrix = m;
  }
}

function highlightZones(w) {
  const held = input.held();
  if (!held.length) return null;
  const ids = new Set();
  for (const a of held) for (const z of w.zones) if (zoneAccepts(z, a)) ids.add(z.id);
  return ids;
}

function frame(now) {
  requestAnimationFrame(frame);
  const t = now / 1000;
  const dt = Math.min(0.1, (now - state.last) / 1000);
  state.last = now;
  const w = state.world;
  if (!w) return;

  const running = state.mode === 'playing' || state.mode === 'title';
  if (running) {
    state.acc += dt * (state.mode === 'playing' ? state.speed : 1);
    let n = 0;
    while (state.acc >= SIM.step && n < 16) {
      step(w, SIM.step);
      state.acc -= SIM.step;
      n++;
      if (w.over) break;
    }
    if (n >= 16) state.acc = 0;
    handleEvents(w, t);
  }

  if (state.mode === 'paused' && !state.dirty) return;
  updateView(t);
  renderer.render(w, state.view, t, {
    highlight: state.mode === 'playing' ? highlightZones(w) : null,
    hint: state.mode === 'playing' ? tutorialHint(w) : null,
    crashAge: w.crash ? t - state.crashAt : 0,
    avoid: state.mode === 'playing' ? state.avoid : null,
  });
  state.dirty = false;
}

// ---------------------------------------------------------------- screens

function setScreen(name) {
  for (const [key, el] of Object.entries(screens)) el.hidden = key !== name;
  els.app.classList.toggle('is-title', name === 'title');
}

function showToast(html, ms = 2500) {
  clearTimeout(state.toastTimer);
  els.toast.innerHTML = html;
  els.toast.hidden = false;
  if (ms > 0) state.toastTimer = setTimeout(hideToast, ms);
}

function hideToast() {
  clearTimeout(state.toastTimer);
  els.toast.hidden = true;
}

function showHelp(after) {
  state.afterHelp = after || null;
  setScreen('help');
  $('btn-help-done').focus({ preventScroll: true });
}

function closeHelp() {
  const after = state.afterHelp;
  if (after) {
    after();
    state.afterHelp = null;
  } else {
    setScreen(state.mode === 'paused' ? 'pause' : 'title');
  }
}

const STRIP_COLOR = { airfield: 'var(--yellow)', coast: 'var(--blue)', carrier: 'var(--green)' };

function diagramSVG(map) {
  const zones = map.zones;
  let s = '<svg viewBox="-330 -210 660 420" aria-hidden="true">';
  s += '<rect x="-330" y="-210" width="660" height="420" rx="26" fill="#cfdca8"/>';
  if (map.diagram) s += map.diagram;
  for (const z of zones) {
    const team = TEAM[z.color];
    if (z.kind === 'pad') {
      s += `<circle cx="${z.x}" cy="${z.y}" r="${z.r + 8}" fill="${team.fill}" stroke="${INK}" stroke-width="7"/>`;
      continue;
    }
    const dx = z.b.x - z.a.x;
    const dy = z.b.y - z.a.y;
    const L = Math.hypot(dx, dy);
    const ux = dx / L;
    const uy = dy / L;
    if (z.kind === 'water') {
      s += `<line x1="${z.a.x}" y1="${z.a.y}" x2="${z.b.x}" y2="${z.b.y}" stroke="${team.fill}" stroke-width="22" stroke-dasharray="26 16" stroke-linecap="round"/>`;
    } else {
      s += `<line x1="${z.a.x}" y1="${z.a.y}" x2="${z.b.x}" y2="${z.b.y}" stroke="${INK}" stroke-width="${z.width + 12}"/>`;
      s += `<line x1="${z.a.x}" y1="${z.a.y}" x2="${z.b.x}" y2="${z.b.y}" stroke="${team.fill}" stroke-width="${z.width - 6}" stroke-dasharray="${L * 0.35} ${L}"/>`;
    }
    // Arrow showing the landing direction
    const tip = { x: z.a.x - ux * 18, y: z.a.y - uy * 18 };
    const back = { x: tip.x - ux * 46, y: tip.y - uy * 46 };
    const nx = -uy;
    const ny = ux;
    s += `<path d="M${tip.x},${tip.y} L${back.x + nx * 26},${back.y + ny * 26} L${back.x - nx * 26},${back.y - ny * 26}Z" fill="${team.fill}" stroke="${INK}" stroke-width="7" stroke-linejoin="round"/>`;
  }
  return `${s}</svg>`;
}

function refreshStrips() {
  els.strips.innerHTML = MAP_ORDER.map((id, i) => {
    const m = MAPS[id];
    const best = store.best[id] || 0;
    return `<li><button class="strip" type="button" data-map="${id}" style="--strip-color:${STRIP_COLOR[id] || 'var(--red)'}" aria-label="Fly ${m.name}. Best ${best}.">
      <span class="strip-band" aria-hidden="true"></span>
      <span class="strip-diagram" aria-hidden="true">${diagramSVG(m)}</span>
      <span class="strip-main"><span class="strip-code">${m.code} ${String(i + 1).padStart(2, '0')}</span><span class="strip-name">${m.name}</span><span class="strip-blurb">${m.blurb}</span></span>
      <span class="strip-best" aria-hidden="true"><span>Best</span><b>${best}</b></span>
      <span class="strip-go" aria-hidden="true">Fly</span>
    </button></li>`;
  }).join('');
}

function buildHelpArt() {
  const grass = '#b9d18a';
  $('help-art-1').innerHTML = `<svg viewBox="0 0 160 70" aria-hidden="true">
    <rect width="160" height="70" fill="${grass}"/>
    <path d="M38,44 C70,48 84,14 128,22" fill="none" stroke="rgba(34,48,58,.6)" stroke-width="4.6" stroke-dasharray="5 7" stroke-linecap="round"/>
    <path d="M38,44 C70,48 84,14 128,22" fill="none" stroke="#ffb3a3" stroke-width="2.5" stroke-dasharray="5 7" stroke-linecap="round"/>
    ${aircraftG('light', 'red', { x: 30, y: 43, rot: 4, scale: 0.95 })}
    <circle cx="128" cy="22" r="8" fill="rgba(251,245,230,.6)" stroke="${INK}" stroke-width="2"/>
  </svg>`;
  $('help-art-2').innerHTML = `<svg viewBox="0 0 160 70" aria-hidden="true">
    <rect width="160" height="70" fill="${grass}"/>
    <rect x="44" y="23" width="130" height="22" fill="#d9d2bf" stroke="#958c78" stroke-width="1.2"/>
    <rect x="48" y="26" width="130" height="16" fill="#636c73"/>
    <rect x="52" y="27.4" width="130" height="2" fill="${TEAM.red.fill}"/><rect x="52" y="38.6" width="130" height="2" fill="${TEAM.red.fill}"/>
    <polyline points="38,28 45,34 38,40" fill="none" stroke="${INK}" stroke-width="5.6" stroke-linecap="round" stroke-linejoin="round"/>
    <polyline points="38,28 45,34 38,40" fill="none" stroke="${TEAM.red.fill}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
    ${aircraftG('light', 'red', { x: 18, y: 34, rot: 0, scale: 0.8 })}
    <circle cx="130" cy="58" r="0" fill="none"/>
  </svg>`;
  $('help-art-3').innerHTML = `<svg viewBox="0 0 160 70" aria-hidden="true">
    <rect width="160" height="70" fill="${grass}"/>
    <circle cx="60" cy="35" r="24" fill="rgba(232,64,45,.14)" stroke="rgba(34,48,58,.55)" stroke-width="4.4"/>
    <circle cx="60" cy="35" r="24" fill="none" stroke="#e8402d" stroke-width="2.4"/>
    <circle cx="100" cy="35" r="24" fill="rgba(232,64,45,.14)" stroke="rgba(34,48,58,.55)" stroke-width="4.4"/>
    <circle cx="100" cy="35" r="24" fill="none" stroke="#e8402d" stroke-width="2.4"/>
    ${aircraftG('light', 'yellow', { x: 60, y: 35, rot: 0, scale: 0.95 })}
    ${aircraftG('jet', 'red', { x: 100, y: 35, rot: 180, scale: 0.85 })}
  </svg>`;
}

function buildLogoPlane() {
  const g = $('logo-plane');
  const plane = aircraftG('light', 'red', { scale: 1.25 });
  if (reducedMotion) {
    g.innerHTML = `<g transform="translate(300 86) rotate(-28)">${plane}</g>`;
    return;
  }
  g.innerHTML = `${plane}<animateMotion dur="7s" repeatCount="indefinite" rotate="auto" keyPoints="0;1" keyTimes="0;1" calcMode="linear"><mpath href="#logo-route" xlink:href="#logo-route"/></animateMotion>`;
}

function syncToggles() {
  const canBuzz = hapticsAvailable();
  document.querySelectorAll('.toggle[data-setting]').forEach((btn) => {
    const key = btn.dataset.setting;
    btn.setAttribute('aria-pressed', String(Boolean(store[key])));
    if (key === 'haptics') btn.hidden = !canBuzz;
  });
}

function toggleSetting(key) {
  store[key] = !store[key];
  saveStore(store);
  if (key === 'sound') sound.setSfx(store.sound);
  if (key === 'music') {
    sound.unlock();
    sound.setMusic(store.music);
  }
  if (key === 'haptics') {
    setHaptics(store.haptics);
    if (store.haptics) haptic('snap');
  }
  syncToggles();
}

// ---------------------------------------------------------------- wiring

function onResize() {
  state.vw = innerWidth;
  state.vh = innerHeight;
  state.safe = readSafeArea(els.probe);
  renderer.resize(state.vw, state.vh, Math.min(3, window.devicePixelRatio || 1));
  measureHud();
  state.dirty = true;
  // Title traffic reshapes with the screen; a game in progress keeps its airspace.
  if (state.mode === 'title' && state.world && Math.abs(worldWidth(currentAspect()) - state.world.W) > 2) startAttract();
}

function bind() {
  addEventListener('resize', onResize);
  addEventListener('orientationchange', () => setTimeout(onResize, 250));
  if (window.visualViewport) visualViewport.addEventListener('resize', onResize);

  document.addEventListener('pointerdown', () => sound.unlock(), { capture: true });
  // Keep Safari from treating drags on the airspace as scrolls, zooms,
  // text selection or an edge swipe back.
  $('stage').addEventListener('touchstart', (e) => e.preventDefault(), { passive: false });
  $('stage').addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
  document.addEventListener('gesturestart', (e) => e.preventDefault());
  document.addEventListener('dblclick', (e) => e.preventDefault());

  els.strips.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-map]');
    if (!btn || state.mode !== 'title' || screens.title.classList.contains('leaving')) return;
    sound.play('tap');
    screens.title.classList.add('leaving');
    setTimeout(() => {
      screens.title.classList.remove('leaving');
      startGame(btn.dataset.map);
    }, reducedMotion ? 0 : 180);
  });

  els.pause.addEventListener('click', () => {
    sound.play('tap');
    pause();
  });
  els.ff.addEventListener('click', () => {
    sound.play('tap');
    setFastForward(state.speed === 1);
  });
  $('btn-resume').addEventListener('click', () => {
    sound.play('tap');
    resume();
  });
  $('btn-restart').addEventListener('click', () => {
    sound.play('tap');
    beginGame(state.mapId);
  });
  $('btn-quit').addEventListener('click', () => {
    sound.play('tap');
    toTitle();
  });
  $('btn-again').addEventListener('click', () => {
    sound.play('tap');
    beginGame(state.mapId);
  });
  $('btn-menu').addEventListener('click', () => {
    sound.play('tap');
    toTitle();
  });
  $('btn-help').addEventListener('click', () => {
    sound.play('tap');
    showHelp(null);
  });
  $('btn-help-done').addEventListener('click', () => {
    sound.play('tap');
    closeHelp();
  });
  document.querySelectorAll('.toggle[data-setting]').forEach((btn) => {
    btn.addEventListener('click', () => {
      toggleSetting(btn.dataset.setting);
      sound.play('tap');
    });
  });

  addEventListener('keydown', (e) => {
    if (e.key === 'Escape' || e.key === 'p' || e.key === 'P' || (e.key === ' ' && state.mode === 'playing')) {
      if (state.mode === 'playing') pause();
      else if (state.mode === 'paused') resume();
      e.preventDefault();
    } else if ((e.key === 'f' || e.key === 'F') && state.mode === 'playing') {
      setFastForward(state.speed === 1);
    }
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      pause();
      sound.suspend();
    } else {
      sound.resume();
      state.last = performance.now();
    }
  });
  addEventListener('pagehide', () => pause());
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator) || !/^https?:$/.test(location.protocol) || window.FLIGHT_CONTROL_NO_SW) return;
  if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') return;
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

function showInstallTip() {
  const ua = navigator.userAgent;
  const ios = /iPhone|iPad|iPod/.test(ua) || (ua.includes('Macintosh') && 'ontouchend' in document);
  const standalone = navigator.standalone === true
    || matchMedia('(display-mode: standalone)').matches
    || matchMedia('(display-mode: fullscreen)').matches;
  els.installTip.hidden = !(ios && !standalone && !window.FLIGHT_CONTROL_EMBEDDED);
}

function boot() {
  onResize();
  showInstallTip();
  refreshStrips();
  buildHelpArt();
  buildLogoPlane();
  syncToggles();
  startAttract();
  setScreen('title');
  bind();
  requestAnimationFrame(frame);
  registerServiceWorker();
  // Fonts change the runway numbers' metrics; redraw once they arrive.
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => (state.dirty = true));
}

// Exposed for automated tests.
window.__flightControl = { state, store, MAPS, beginGame, pause, resume, toTitle };

// When embedded in a host that hot-swaps the page, come back on the same airport.
const hot = window.claude?.hot;
try {
  hot?.snapshot(() => ({ mapId: state.mapId }));
} catch {
  /* host without snapshots */
}
const start = (data) => {
  if (data && MAPS[data.mapId]) state.mapId = data.mapId;
  boot();
};
if (hot?.ready) hot.ready(start);
else start(hot?.data ?? {});
