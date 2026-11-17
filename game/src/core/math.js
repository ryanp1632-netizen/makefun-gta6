// Small geometry and colour helpers shared by the simulation and the renderers.

export const TAU = Math.PI * 2;

export function clamp(v, a, b) {
  return v < a ? a : v > b ? b : v;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

/** Wrap an angle into -PI..PI. */
export function wrapAngle(a) {
  while (a > Math.PI) a -= TAU;
  while (a < -Math.PI) a += TAU;
  return a;
}

/** Move `v` toward `target` by at most `step`. */
export function approach(v, target, step) {
  return v < target ? Math.min(target, v + step) : Math.max(target, v - step);
}

export function dist(ax, ay, bx, by) {
  return Math.hypot(bx - ax, by - ay);
}

/** Distance along a unit ray (ox,oy)+(dx,dy)t to an axis-aligned box, or Infinity. */
export function rayAabb(ox, oy, dx, dy, x0, y0, x1, y1) {
  let tmin = 0;
  let tmax = Infinity;
  if (Math.abs(dx) < 1e-9) {
    if (ox < x0 || ox > x1) return Infinity;
  } else {
    let t1 = (x0 - ox) / dx;
    let t2 = (x1 - ox) / dx;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
  }
  if (Math.abs(dy) < 1e-9) {
    if (oy < y0 || oy > y1) return Infinity;
  } else {
    let t1 = (y0 - oy) / dy;
    let t2 = (y1 - oy) / dy;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
  }
  return tmax >= tmin ? tmin : Infinity;
}

/** Distance along a unit ray to a circle, or Infinity. */
export function rayCircle(ox, oy, dx, dy, cx, cy, r) {
  const fx = ox - cx;
  const fy = oy - cy;
  const b = fx * dx + fy * dy;
  const c = fx * fx + fy * fy - r * r;
  const disc = b * b - c;
  if (disc < 0) return Infinity;
  const t = -b - Math.sqrt(disc);
  return t >= 0 ? t : c < 0 ? 0 : Infinity;
}

/** Push a circle out of a box: returns {nx, ny, depth} or null when they do not touch. */
export function circleAabbPush(cx, cy, r, x0, y0, x1, y1) {
  const px = clamp(cx, x0, x1);
  const py = clamp(cy, y0, y1);
  let dx = cx - px;
  let dy = cy - py;
  const d2 = dx * dx + dy * dy;
  if (d2 > r * r) return null;
  if (d2 > 1e-6) {
    const d = Math.sqrt(d2);
    return { nx: dx / d, ny: dy / d, depth: r - d };
  }
  // Centre inside the box: leave by the nearest side.
  const left = cx - x0;
  const right = x1 - cx;
  const top = cy - y0;
  const bottom = y1 - cy;
  const m = Math.min(left, right, top, bottom);
  if (m === left) return { nx: -1, ny: 0, depth: left + r };
  if (m === right) return { nx: 1, ny: 0, depth: right + r };
  if (m === top) return { nx: 0, ny: -1, depth: top + r };
  return { nx: 0, ny: 1, depth: bottom + r };
}

/** CSS colour from an [r,g,b] array scaled by a factor (or per-channel tint) and an alpha. */
export function rgb(c, k = 1, a = 1, tint = null) {
  let r = c[0] * k;
  let g = c[1] * k;
  let b = c[2] * k;
  if (tint) {
    r *= tint[0];
    g *= tint[1];
    b *= tint[2];
  }
  r = r > 255 ? 255 : r | 0;
  g = g > 255 ? 255 : g | 0;
  b = b > 255 ? 255 : b | 0;
  return a >= 1 ? `rgb(${r},${g},${b})` : `rgba(${r},${g},${b},${a.toFixed(3)})`;
}

/** Mix two [r,g,b] colours. */
export function mixRgb(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

/** Format a cash amount as $12,345. */
export function formatCash(n) {
  const s = Math.floor(Math.abs(n)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return (n < 0 ? '-$' : '$') + s;
}
