// Maps the world onto the screen. The airspace is always wider than it is
// tall; in portrait the whole scene is turned a quarter so the long axis
// runs down the screen. The world sits inside the device safe area so no
// aircraft can hide under a notch or the home indicator.

export function readSafeArea(probe) {
  const cs = getComputedStyle(probe);
  const px = (v) => parseFloat(v) || 0;
  return { t: px(cs.paddingTop), r: px(cs.paddingRight), b: px(cs.paddingBottom), l: px(cs.paddingLeft) };
}

export function isPortrait(vw, vh, safe) {
  return vh - safe.t - safe.b > (vw - safe.l - safe.r) * 1.02;
}

/** Aspect ratio (long side / short side) of the usable screen area. */
export function screenAspect(vw, vh, safe) {
  const w = vw - safe.l - safe.r;
  const h = vh - safe.t - safe.b;
  return Math.max(w, h) / Math.max(1, Math.min(w, h));
}

export function computeView({ vw, vh, safe, W, H, zoom = 1, focusX = 0, focusY = 0 }) {
  const rect = { x: safe.l, y: safe.t, w: vw - safe.l - safe.r, h: vh - safe.t - safe.b };
  const portrait = rect.h > rect.w * 1.02;
  const rot = portrait ? -Math.PI / 2 : 0;
  const spanX = portrait ? H : W;
  const spanY = portrait ? W : H;
  const fit = Math.min(rect.w / spanX, rect.h / spanY);
  const s = fit * zoom;
  const cos = Math.cos(rot);
  const sin = Math.sin(rot);
  const a = s * cos;
  const b = s * sin;
  const c = -s * sin;
  const d = s * cos;
  const cx = rect.x + rect.w / 2;
  const cy = rect.y + rect.h / 2;
  return {
    a, b, c, d,
    e: cx - (a * focusX + c * focusY),
    f: cy - (b * focusX + d * focusY),
    s, fit, rot, portrait, rect, vw, vh,
  };
}

export function toScreen(v, x, y) {
  return { x: v.a * x + v.c * y + v.e, y: v.b * x + v.d * y + v.f };
}

export function toWorld(v, X, Y) {
  const det = v.a * v.d - v.b * v.c;
  const dx = X - v.e;
  const dy = Y - v.f;
  return { x: (v.d * dx - v.c * dy) / det, y: (-v.b * dx + v.a * dy) / det };
}

export function svgMatrix(v) {
  const r = (n) => Math.round(n * 10000) / 10000;
  return `matrix(${r(v.a)} ${r(v.b)} ${r(v.c)} ${r(v.d)} ${r(v.e)} ${r(v.f)})`;
}
