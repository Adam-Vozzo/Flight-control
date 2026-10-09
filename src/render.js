// Draws everything that moves: flight paths, aircraft and their shadows,
// warnings, arrival badges and effects. The static scenery lives in an SVG
// layer underneath and shares the same world-to-screen transform.

import { TEAM, INK, CREAM } from './config.js';
import { buildArt, drawAircraft, drawSprite } from './art.js';
import { toScreen } from './view.js';
import { clamp, easeOutCubic, easeOutBack, TAU } from './math.js';

const WARN_RED = '#e8402d';

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.art = buildArt();
    this.dpr = 1;
    this.fx = [];
  }

  resize(vw, vh, dpr) {
    this.dpr = dpr;
    this.canvas.width = Math.round(vw * dpr);
    this.canvas.height = Math.round(vh * dpr);
    this.canvas.style.width = `${vw}px`;
    this.canvas.style.height = `${vh}px`;
  }

  addFx(fx) {
    this.fx.push(fx);
  }

  clearFx() {
    this.fx.length = 0;
  }

  /**
   * @param now  real-time clock in seconds (animations keep running on game over)
   * @param opts highlight: Set of zone ids to glow, hint: tutorial ghost path,
   *             crashAge: seconds since the collision
   */
  render(world, view, now, opts = {}) {
    const { ctx, dpr } = this;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    if (!world) return;
    ctx.setTransform(view.a * dpr, view.b * dpr, view.c * dpr, view.d * dpr, view.e * dpr, view.f * dpr);

    this.drawBoundary(world, view);
    if (opts.highlight) for (const z of world.zones) if (opts.highlight.has(z.id)) this.drawZoneGlow(z, now);
    this.drawZoneFlashes(world, now);
    for (const a of world.aircraft) if (a.path.length) this.drawPath(a);
    if (opts.hint) this.drawHint(opts.hint, now);

    const landing = world.aircraft.filter((a) => a.state === 'landing');
    const flying = world.aircraft.filter((a) => a.state !== 'landing');
    for (const a of landing) {
      if (a.land.zone.kind === 'water') this.drawWake(a);
      this.drawShadow(a);
      this.drawPlane(a, now);
    }
    for (const a of flying) this.drawShadow(a);
    for (const a of flying) {
      if (a.pathLanding) this.drawHalo(a, now);
      this.drawPlane(a, now);
    }
    for (const a of flying) if (a.warn) this.drawWarning(a, now);
    for (const inc of world.incoming) this.drawIncoming(world, inc, now, view, opts.avoid);
    if (world.crash) this.drawCrash(world, opts.crashAge ?? 0);
    this.drawWorldFx(now);

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.drawScreenFx(view, now);
  }

  // -------------------------------------------------------------------------

  drawBoundary(world, view) {
    // Darken whatever scenery shows beyond the airspace (notch strips,
    // letterboxing) so the edge planes turn back at is visible.
    const { ctx } = this;
    const W = world.W / 2;
    const H = world.H / 2;
    const big = 4000;
    ctx.beginPath();
    ctx.rect(-big, -big, big * 2, big * 2);
    ctx.rect(-W, -H, W * 2, H * 2);
    ctx.fillStyle = 'rgba(24, 38, 30, 0.2)';
    ctx.fill('evenodd');
    if (view.fit < 0.35) return;
    ctx.beginPath();
    ctx.rect(-W, -H, W * 2, H * 2);
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = 'rgba(251, 245, 230, 0.35)';
    ctx.setLineDash([2, 6]);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  zoneOutline(z, pad) {
    const { ctx } = this;
    ctx.beginPath();
    if (z.kind === 'pad') {
      ctx.arc(z.x, z.y, z.r + pad, 0, TAU);
      return;
    }
    const hw = z.width / 2 + pad;
    const s0 = -pad - 4;
    const s1 = z.zoneLen + pad;
    const corners = [
      [s0, -hw], [s1, -hw], [s1, hw], [s0, hw],
    ].map(([s, l]) => [z.ax + z.ux * s + z.nx * l, z.ay + z.uy * s + z.ny * l]);
    ctx.moveTo(corners[0][0], corners[0][1]);
    for (let i = 1; i < 4; i++) ctx.lineTo(corners[i][0], corners[i][1]);
    ctx.closePath();
  }

  drawZoneGlow(z, now) {
    const { ctx } = this;
    const team = TEAM[z.color];
    const pulse = 0.5 + 0.5 * Math.sin(now * 5);
    this.zoneOutline(z, 7);
    ctx.fillStyle = hexA(team.fill, 0.16 + 0.12 * pulse);
    ctx.fill();
    ctx.lineJoin = 'round';
    ctx.lineWidth = 3.4;
    ctx.strokeStyle = 'rgba(34, 48, 58, 0.45)';
    ctx.stroke();
    ctx.lineWidth = 1.8;
    ctx.setLineDash([6, 5]);
    ctx.lineDashOffset = -now * 18;
    ctx.strokeStyle = CREAM;
    ctx.stroke();
    ctx.setLineDash([]);
  }

  drawZoneFlashes(world, now) {
    const { ctx } = this;
    for (const f of this.fx) {
      if (f.kind !== 'flash') continue;
      const k = (now - f.t0) / 0.7;
      if (k < 0 || k > 1) continue;
      const z = world.zones.find((q) => q.id === f.zone);
      if (!z) continue;
      this.zoneOutline(z, 7 + k * 8);
      ctx.fillStyle = hexA(TEAM[z.color].fill, 0.45 * (1 - k));
      ctx.fill();
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = `rgba(251, 245, 230, ${0.9 * (1 - k)})`;
      ctx.stroke();
    }
  }

  drawPath(a) {
    const { ctx } = this;
    const team = TEAM[a.color];
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    for (const p of a.path) ctx.lineTo(p.x, p.y);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.setLineDash([5, 7]);
    ctx.lineDashOffset = a.pathTravel;
    ctx.lineWidth = 4.6;
    ctx.strokeStyle = 'rgba(34, 48, 58, 0.6)';
    ctx.stroke();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = a.pathLanding ? CREAM : team.tint;
    ctx.stroke();
    ctx.setLineDash([]);
    if (!a.pathLanding) {
      const end = a.path[a.path.length - 1];
      ctx.beginPath();
      ctx.arc(end.x, end.y, 3.3, 0, TAU);
      ctx.fillStyle = team.tint;
      ctx.fill();
      ctx.lineWidth = 1.3;
      ctx.strokeStyle = INK;
      ctx.stroke();
    }
  }

  drawHint(hint, now) {
    const { ctx } = this;
    const pts = hint.points;
    if (pts.length < 2) return;
    ctx.save();
    ctx.globalAlpha = 0.85;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (const p of pts) ctx.lineTo(p.x, p.y);
    ctx.setLineDash([3, 7]);
    ctx.lineDashOffset = -now * 16;
    ctx.lineCap = 'round';
    ctx.lineWidth = 2.2;
    ctx.strokeStyle = CREAM;
    ctx.stroke();
    ctx.setLineDash([]);
    // A fingertip that keeps tracing the route.
    const lens = [0];
    for (let i = 1; i < pts.length; i++) lens.push(lens[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
    const total = lens[lens.length - 1];
    const cycle = (now % 2.6) / 2.6;
    const k = clamp(cycle / 0.8, 0, 1);
    const dist = easeOutCubic(k) * total;
    let i = 1;
    while (i < pts.length - 1 && lens[i] < dist) i++;
    const seg = lens[i] - lens[i - 1] || 1;
    const f = clamp((dist - lens[i - 1]) / seg, 0, 1);
    const x = pts[i - 1].x + (pts[i].x - pts[i - 1].x) * f;
    const y = pts[i - 1].y + (pts[i].y - pts[i - 1].y) * f;
    const fade = cycle < 0.8 ? 1 : 1 - (cycle - 0.8) / 0.2;
    ctx.globalAlpha = 0.9 * fade;
    ctx.beginPath();
    ctx.arc(x, y, 9, 0, TAU);
    ctx.fillStyle = 'rgba(251, 245, 230, 0.55)';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = INK;
    ctx.stroke();
    ctx.restore();
  }

  scaleOf(a) {
    return 0.7 + 0.3 * a.alt;
  }

  drawShadow(a) {
    const { ctx } = this;
    const sprite = this.art[a.type].shadow;
    const k = a.alt;
    ctx.save();
    ctx.translate(a.x + 1 + 4 * k, a.y + 1.5 + 6 * k);
    ctx.rotate(a.rot);
    ctx.globalAlpha = (0.2 + 0.08 * (1 - k)) * a.alpha;
    drawSprite(ctx, sprite, this.scaleOf(a));
    ctx.restore();
  }

  drawHalo(a, now) {
    const { ctx } = this;
    ctx.save();
    ctx.translate(a.x, a.y);
    ctx.rotate(a.rot);
    ctx.globalAlpha = 0.85 + 0.15 * Math.sin(now * 4);
    drawSprite(ctx, this.art[a.type].halo, this.scaleOf(a));
    ctx.restore();
  }

  drawPlane(a, now) {
    const { ctx } = this;
    const s = this.scaleOf(a);
    ctx.save();
    ctx.translate(a.x, a.y);
    ctx.rotate(a.rot);
    ctx.scale(s, s);
    ctx.globalAlpha = a.alpha;
    drawAircraft(ctx, this.art[a.type], a.color, now + a.id * 0.37, 0.25 + 0.75 * a.alt);
    ctx.restore();
  }

  drawWake(a) {
    const { ctx } = this;
    const k = clamp(1 - a.alt * 1.4, 0, 1) * a.alpha;
    if (k <= 0) return;
    ctx.save();
    ctx.translate(a.x, a.y);
    ctx.rotate(a.rot);
    ctx.globalAlpha = 0.7 * k;
    ctx.strokeStyle = '#f4fbf8';
    ctx.lineCap = 'round';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    for (const side of [-1, 1]) {
      ctx.moveTo(4, side * 6.5);
      ctx.quadraticCurveTo(-10, side * 9, -26, side * 15);
    }
    ctx.stroke();
    ctx.restore();
  }

  drawWarning(a, now) {
    const { ctx } = this;
    const pulse = 0.5 + 0.5 * Math.sin(now * 14);
    const r = a.radius * 1.45 + 8 + pulse * 1.5;
    ctx.beginPath();
    ctx.arc(a.x, a.y, r, 0, TAU);
    ctx.fillStyle = `rgba(232, 64, 45, ${0.1 + 0.08 * pulse})`;
    ctx.fill();
    ctx.lineWidth = 4.6;
    ctx.strokeStyle = 'rgba(34, 48, 58, 0.55)';
    ctx.stroke();
    ctx.lineWidth = 2.6;
    ctx.strokeStyle = WARN_RED;
    ctx.stroke();
  }

  drawIncoming(world, inc, now, view, avoid) {
    const { ctx } = this;
    const team = TEAM[inc.color];
    const inset = 18;
    let x = clamp(inc.x + inc.nx * inset, -world.W / 2 + inset, world.W / 2 - inset);
    let y = clamp(inc.y + inc.ny * inset, -world.H / 2 + inset, world.H / 2 - inset);
    // Slide the badge inwards, out from under the score and buttons.
    if (avoid && avoid.length) {
      const pad = 20 * view.s + 4;
      for (let i = 0; i < 40; i++) {
        const p = toScreen(view, x, y);
        const hit = avoid.some((r) => p.x > r.x0 - pad && p.x < r.x1 + pad && p.y > r.y0 - pad && p.y < r.y1 + pad);
        if (!hit) break;
        x += inc.nx * 4;
        y += inc.ny * 4;
      }
    }
    const remain = inc.total > 0 ? clamp(inc.timer / inc.total, 0, 1) : 0;
    const appear = easeOutBack(clamp((1 - remain) * inc.total / 0.35, 0, 1));
    const r = 12.5 * appear;
    if (r <= 0.5) return;

    const ph = (now * 1.3) % 1;
    ctx.beginPath();
    ctx.arc(x, y, r + 3 + ph * 14, 0, TAU);
    ctx.lineWidth = 2;
    ctx.strokeStyle = hexA(team.fill, 0.8 * (1 - ph));
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.fillStyle = team.fill;
    ctx.fill();
    ctx.lineWidth = 1.8;
    ctx.strokeStyle = INK;
    ctx.stroke();

    if (remain > 0) {
      ctx.beginPath();
      ctx.arc(x, y, r + 3.6, -Math.PI / 2, -Math.PI / 2 + TAU * remain);
      ctx.lineCap = 'round';
      ctx.lineWidth = 4;
      ctx.strokeStyle = 'rgba(34, 48, 58, 0.55)';
      ctx.stroke();
      ctx.lineWidth = 2;
      ctx.strokeStyle = CREAM;
      ctx.stroke();
    }

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(inc.heading);
    drawSprite(ctx, this.art[inc.type].icon, (0.42 * appear * 23) / this.art[inc.type].design.extent);
    ctx.restore();
  }

  drawCrash(world, age) {
    const { ctx } = this;
    const { x, y } = world.crash;
    // Pulsing red rings around the wreckage
    for (let i = 0; i < 3; i++) {
      const k = ((age * 0.9 + i / 3) % 1);
      ctx.beginPath();
      ctx.arc(x, y, 20 + k * 46, 0, TAU);
      ctx.lineWidth = 3 * (1 - k) + 0.5;
      ctx.strokeStyle = hexA(WARN_RED, 0.85 * (1 - k));
      ctx.stroke();
    }
    // Smoke puffs drift away
    const puffs = 7;
    for (let i = 0; i < puffs; i++) {
      const ang = (i / puffs) * TAU + 0.4;
      const k = clamp(age / 1.6, 0, 1);
      const d = 8 + easeOutCubic(k) * (18 + (i % 3) * 7);
      const r = 6 + easeOutCubic(k) * (6 + (i % 2) * 3);
      ctx.beginPath();
      ctx.arc(x + Math.cos(ang) * d, y + Math.sin(ang) * d, r, 0, TAU);
      ctx.fillStyle = `rgba(110, 112, 108, ${0.75 * (1 - k * 0.6)})`;
      ctx.fill();
      ctx.lineWidth = 1.2;
      ctx.strokeStyle = `rgba(34, 48, 58, ${0.6 * (1 - k * 0.6)})`;
      ctx.stroke();
    }
    // Starburst
    const pop = easeOutBack(clamp(age / 0.35, 0, 1));
    const wobble = 1 + 0.06 * Math.sin(age * 18);
    star(ctx, x, y, 12, 26 * pop * wobble, 13 * pop * wobble, age * 0.4);
    ctx.fillStyle = '#f59a2c';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = INK;
    ctx.stroke();
    star(ctx, x, y, 10, 15 * pop * wobble, 8 * pop * wobble, -age * 0.6);
    ctx.fillStyle = '#fde68a';
    ctx.fill();
  }

  drawWorldFx(now) {
    const { ctx } = this;
    this.fx = this.fx.filter((f) => now - f.t0 < (f.life ?? 1.2));
    for (const f of this.fx) {
      if (f.kind !== 'ripple') continue;
      const k = (now - f.t0) / (f.life ?? 0.6);
      ctx.beginPath();
      ctx.arc(f.x, f.y, 6 + easeOutCubic(k) * 26, 0, TAU);
      ctx.lineWidth = 2.5 * (1 - k) + 0.5;
      ctx.strokeStyle = hexA(TEAM[f.color]?.fill ?? CREAM, 1 - k);
      ctx.stroke();
    }
  }

  drawScreenFx(view, now) {
    const { ctx } = this;
    for (const f of this.fx) {
      if (f.kind !== 'score') continue;
      const k = (now - f.t0) / (f.life ?? 1.2);
      const p = toScreen(view, f.x, f.y);
      const lift = easeOutCubic(k) * 34;
      const size = 20 * (0.7 + 0.3 * easeOutBack(clamp(k * 4, 0, 1)));
      ctx.globalAlpha = k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3;
      ctx.font = `800 ${size}px Jost, Futura, "Avenir Next", system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineJoin = 'round';
      ctx.lineWidth = 4.5;
      ctx.strokeStyle = INK;
      ctx.strokeText(f.text, p.x, p.y - 18 - lift);
      ctx.fillStyle = CREAM;
      ctx.fillText(f.text, p.x, p.y - 18 - lift);
      ctx.globalAlpha = 1;
    }
  }
}

function star(ctx, x, y, points, r1, r2, rot) {
  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? r1 : r2;
    const a = rot + (i / (points * 2)) * TAU;
    const px = x + Math.cos(a) * r;
    const py = y + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

function hexA(hex, alpha) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${clamp(alpha, 0, 1)})`;
}
