// Multi-touch path drawing. Each finger can grab one aircraft; dragging out
// of the aircraft starts a new flight path that grows as the finger moves.

import { canControl, startPath, extendPath, endPath } from './sim.js';
import { toWorld } from './view.js';

export class PathInput {
  /**
   * @param el     element receiving pointer events
   * @param host   { world(), view(), enabled(), onGrab(a), onPathStart(a), onSnap(a), onRelease(a) }
   */
  constructor(el, host) {
    this.el = el;
    this.host = host;
    this.active = new Map();
    el.addEventListener('pointerdown', (e) => this.down(e));
    el.addEventListener('pointermove', (e) => this.move(e));
    el.addEventListener('pointerup', (e) => this.up(e));
    el.addEventListener('pointercancel', (e) => this.up(e));
    el.addEventListener('lostpointercapture', (e) => this.up(e));
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  /** Aircraft currently held by a finger. */
  held() {
    return [...this.active.values()].map((s) => s.a);
  }

  releaseAll() {
    for (const s of this.active.values()) endPath(this.host.world(), s.a);
    this.active.clear();
  }

  pick(world, view, p) {
    // At least ~26 CSS px of reach, more for big aircraft.
    const reach = Math.max(22, 26 / view.s);
    let best = null;
    let bestScore = Infinity;
    for (const a of world.aircraft) {
      if (!canControl(world, a)) continue;
      const d = Math.hypot(a.x - p.x, a.y - p.y) - a.radius * 0.6;
      if (d < reach && d < bestScore) {
        best = a;
        bestScore = d;
      }
    }
    return best;
  }

  down(e) {
    if (!this.host.enabled()) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const world = this.host.world();
    const view = this.host.view();
    const p = toWorld(view, e.clientX, e.clientY);
    const a = this.pick(world, view, p);
    if (!a) return;
    e.preventDefault();
    for (const [id, s] of this.active) {
      if (s.a === a) {
        endPath(world, a);
        this.active.delete(id);
      }
    }
    // The old path stays until the finger actually drags out of the aircraft,
    // so a stray tap never cancels a landing.
    this.active.set(e.pointerId, { a, out: false });
    try {
      this.el.setPointerCapture(e.pointerId);
    } catch {
      /* synthetic events */
    }
    this.host.onGrab(a);
  }

  move(e) {
    const s = this.active.get(e.pointerId);
    if (!s) return;
    e.preventDefault();
    const world = this.host.world();
    const view = this.host.view();
    const a = s.a;
    if (!canControl(world, a) || !this.host.enabled()) {
      this.finish(e.pointerId);
      return;
    }
    const events = typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : null;
    const list = events && events.length ? events : [e];
    for (const ev of list) {
      const p = toWorld(view, ev.clientX, ev.clientY);
      if (!s.out) {
        if (Math.hypot(p.x - a.x, p.y - a.y) < a.radius + 5) continue;
        s.out = true;
        startPath(world, a);
        this.host.onPathStart(a);
      }
      if (extendPath(world, a, p.x, p.y)) {
        this.host.onSnap(a);
        this.finish(e.pointerId);
        return;
      }
    }
  }

  up(e) {
    if (!this.active.has(e.pointerId)) return;
    this.finish(e.pointerId);
  }

  finish(id) {
    const s = this.active.get(id);
    if (!s) return;
    this.active.delete(id);
    endPath(this.host.world(), s.a);
    this.host.onRelease(s.a);
  }
}
