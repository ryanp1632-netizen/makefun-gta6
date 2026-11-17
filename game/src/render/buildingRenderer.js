// True 2.5D buildings: each roof is the footprint scaled away from the view centre by the camera
// perspective, the walls facing the camera are drawn between footprint and roof, shaded by the
// sun and covered in floors of windows that light up at night. Roofs carry pitched tiles, AC
// units, pools, helipads, billboards and neon signs. Long sun shadows are drawn on the ground.
import { heightScale } from './camera.js';
import { clamp, mixRgb, rgb } from '../core/math.js';
import { hash2 } from '../core/random.js';

const WARM = [255, 168, 96];
const LIT = [[255, 214, 140], [255, 236, 190], [190, 226, 255], [255, 190, 120]];

function hull(points) {
  points.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower = [];
  for (const p of points) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper = [];
  for (let i = points.length - 1; i >= 0; i -= 1) {
    const p = points[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  upper.pop();
  lower.pop();
  return lower.concat(upper);
}

function shadowRect(ctx, x0, y0, x1, y1, sx, sy) {
  const pts = hull([[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0 + sx, y0 + sy], [x1 + sx, y0 + sy], [x1 + sx, y1 + sy], [x0 + sx, y1 + sy]]);
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i += 1) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.closePath();
}

/** Sun shadows of buildings and trees as one soft-edged union on the ground. */
export function drawShadows(ctx, buildings, trees, light) {
  const sx = light.shadowX;
  const sy = light.shadowY;
  ctx.beginPath();
  for (const b of buildings) {
    shadowRect(ctx, b.x0, b.y0, b.x1, b.y1, sx * b.h, sy * b.h);
    if (b.top) shadowRect(ctx, b.top.x0, b.top.y0, b.top.x1, b.top.y1, sx * b.top.h, sy * b.top.h);
  }
  for (const t of trees) {
    const k = t.kind === 'palm' ? t.h : t.h * 0.7;
    const cx = t.x + sx * k;
    const cy = t.y + sy * k;
    if (t.kind === 'palm') {
      // A star of frond shadows rather than a disc.
      const n = 7;
      const rot = (t.seed % 628) / 100;
      ctx.moveTo(cx + Math.cos(rot) * t.r, cy + Math.sin(rot) * t.r);
      for (let i = 1; i <= n * 2; i += 1) {
        const a = rot + (i * Math.PI) / n;
        const rr = i % 2 ? t.r * 0.32 : t.r;
        ctx.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
      }
      ctx.closePath();
    } else {
      ctx.moveTo(cx + t.r * 0.95, cy);
      ctx.ellipse(cx, cy, t.r * 0.95, t.r * 0.8, 0, 0, Math.PI * 2);
    }
    if (t.kind === 'palm') {
      ctx.moveTo(t.x + 1.5, t.y);
      ctx.lineTo(cx + 1.5, cy);
      ctx.lineTo(cx - 1.5, cy);
      ctx.lineTo(t.x - 1.5, t.y);
      ctx.closePath();
    }
  }
  const tone = light.warm > 0.3 ? '40,30,110' : '28,24,60';
  ctx.fillStyle = `rgba(${tone},${light.shadowAlpha * 0.6})`;
  ctx.strokeStyle = `rgba(${tone},${light.shadowAlpha * 0.35})`;
  ctx.lineWidth = 8;
  ctx.lineJoin = 'round';
  ctx.stroke();
  ctx.fill();
  ctx.fillStyle = `rgba(${tone},${light.shadowAlpha * 0.75})`;
  ctx.fill();
}

/** Map a w x h local box onto a parallelogram: top-left at `tl`, bottom edge from bl to br. */
function quadTransform(ctx, bl, br, tl, w, h) {
  ctx.transform((br.x - bl.x) / w, (br.y - bl.y) / w, (bl.x - tl.x) / h, (bl.y - tl.y) / h, tl.x, tl.y);
}

function P(cam, x, y, h) {
  const f = heightScale(h);
  return { x: cam.x + (x - cam.x) * f, y: cam.y + (y - cam.y) * f };
}

function faceLight(nx, ny, light) {
  return clamp(nx * light.toSunX + ny * light.toSunY, 0, 1);
}

function wallColor(base, lit, light, k = 1) {
  const c = mixRgb(base, WARM, lit * light.warm * 0.42);
  return rgb(c, (0.6 + 0.42 * lit) * k, 1, light.ambient);
}

/** Draw the windows of one wall from p0 to p1 (ground points), up to height h. */
function drawWindows(ctx, b, cam, light, p0x, p0y, p1x, p1y, h, face, nx, ny) {
  const style = b.style;
  const len = Math.hypot(p1x - p0x, p1y - p0y);
  const lit = faceLight(nx, ny, light);
  const night = light.night;
  if (style === 'container' || style === 'lifeguard') {
    ctx.strokeStyle = 'rgba(0,0,0,0.22)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let s = 4; s < len; s += 4) {
      const t = s / len;
      const x = p0x + (p1x - p0x) * t;
      const y = p0y + (p1y - p0y) * t;
      const a = P(cam, x, y, 1);
      const c = P(cam, x, y, h - 1);
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(c.x, c.y);
    }
    ctx.stroke();
    return;
  }
  const floorH = style === 'tower' ? 12 : style === 'warehouse' || style === 'hangar' ? 999 : 14;
  const spacing = style === 'tower' ? 11 : style === 'villa' || style === 'marina' ? 24 : 17;
  const floors = Math.floor((h - 4) / floorH);
  const cols = Math.max(1, Math.floor(len / spacing));
  if (style === 'warehouse' || style === 'hangar') {
    ctx.strokeStyle = 'rgba(0,0,0,0.12)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let s = 3; s < len; s += 5) {
      const t = s / len;
      const x = p0x + (p1x - p0x) * t;
      const y = p0y + (p1y - p0y) * t;
      const a = P(cam, x, y, 0);
      const c = P(cam, x, y, h);
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(c.x, c.y);
    }
    ctx.stroke();
    // A roller door in the middle of the wall.
    const t0 = 0.35;
    const t1 = 0.65;
    const q = [P(cam, p0x + (p1x - p0x) * t0, p0y + (p1y - p0y) * t0, 0), P(cam, p0x + (p1x - p0x) * t1, p0y + (p1y - p0y) * t1, 0), P(cam, p0x + (p1x - p0x) * t1, p0y + (p1y - p0y) * t1, h * 0.6), P(cam, p0x + (p1x - p0x) * t0, p0y + (p1y - p0y) * t0, h * 0.6)];
    ctx.fillStyle = rgb([110, 116, 122], 0.7 + lit * 0.3, 1, light.ambient);
    ctx.beginPath();
    q.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    ctx.fill();
    return;
  }
  if (style === 'tower') {
    // Glass curtain wall: continuous floor bands that catch the sky.
    const glass = b.glass ?? [70, 120, 160];
    let sky = mixRgb(glass, [170, 215, 240], 0.22);
    sky = mixRgb(sky, [255, 178, 110], lit * light.warm * 0.62);
    if (night > 0.5) sky = [18, 26, 44];
    ctx.fillStyle = rgb(sky, 0.92 + lit * 0.25, 1, night > 0.5 ? null : light.ambient);
    ctx.beginPath();
    for (let k = 0; k < floors; k += 1) {
      const h0 = k * floorH + 3.5;
      const h1 = h0 + floorH - 5;
      const a = P(cam, p0x, p0y, h0);
      const c = P(cam, p1x, p1y, h0);
      const d = P(cam, p1x, p1y, h1);
      const e = P(cam, p0x, p0y, h1);
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(c.x, c.y);
      ctx.lineTo(d.x, d.y);
      ctx.lineTo(e.x, e.y);
      ctx.closePath();
    }
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.18)';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    for (let j = 1; j < cols; j += 1) {
      const t = j / cols;
      const x = p0x + (p1x - p0x) * t;
      const y = p0y + (p1y - p0y) * t;
      const a = P(cam, x, y, 3);
      const c = P(cam, x, y, floors * floorH);
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(c.x, c.y);
    }
    ctx.stroke();
    if (night < 0.25) return;
  }
  // Individual windows: dark by day, a share of them lit by night.
  const dark = rgb(style === 'deco' ? [60, 90, 110] : [52, 70, 88], 0.8 + lit * 0.3, 1, light.ambient);
  const pathDark = new Path2D();
  const lits = [new Path2D(), new Path2D(), new Path2D(), new Path2D()];
  const winW = style === 'villa' || style === 'marina' ? 0.6 : style === 'tower' ? 0.8 : 0.45;
  const winH = style === 'tower' ? 0.7 : 0.55;
  for (let k = 0; k < floors; k += 1) {
    const h0 = k * floorH + floorH * 0.28;
    const h1 = h0 + floorH * winH;
    for (let j = 0; j < cols; j += 1) {
      const t0 = (j + 0.5 - winW / 2) / cols;
      const t1 = (j + 0.5 + winW / 2) / cols;
      const hv = hash2(b.seed + face * 977 + k, j, 7);
      const isLit = night > 0.25 && hv < 0.18 + night * 0.25;
      if (style === 'tower' && !isLit) continue;
      const path = isLit ? lits[Math.floor(hv * 97) % 4] : pathDark;
      const ax = p0x + (p1x - p0x) * t0;
      const ay = p0y + (p1y - p0y) * t0;
      const bx = p0x + (p1x - p0x) * t1;
      const by = p0y + (p1y - p0y) * t1;
      const a = P(cam, ax, ay, h0);
      const c = P(cam, bx, by, h0);
      const d = P(cam, bx, by, h1);
      const e = P(cam, ax, ay, h1);
      path.moveTo(a.x, a.y);
      path.lineTo(c.x, c.y);
      path.lineTo(d.x, d.y);
      path.lineTo(e.x, e.y);
      path.closePath();
    }
  }
  ctx.fillStyle = dark;
  ctx.fill(pathDark);
  if (night > 0.25) {
    const a = clamp((night - 0.25) * 1.6, 0, 1);
    for (let i = 0; i < 4; i += 1) {
      ctx.fillStyle = rgb(LIT[i], 1, a);
      ctx.fill(lits[i]);
    }
  }
  if (style === 'oldtown' && night < 0.6) {
    // Painted shutters beside each window.
    ctx.strokeStyle = rgb(b.seed % 2 ? [40, 120, 110] : [60, 90, 150], 0.9, 0.8, light.ambient);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let k = 0; k < floors; k += 1) {
      const h0 = k * floorH + floorH * 0.28;
      for (let j = 0; j < cols; j += 1) {
        for (const tt of [(j + 0.5 - winW / 2 - 0.06) / cols, (j + 0.5 + winW / 2 + 0.06) / cols]) {
          const x = p0x + (p1x - p0x) * tt;
          const y = p0y + (p1y - p0y) * tt;
          const a = P(cam, x, y, h0);
          const c = P(cam, x, y, h0 + floorH * winH);
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(c.x, c.y);
        }
      }
    }
    ctx.stroke();
  }
}

function drawWalls(ctx, b, R, h, cam, light) {
  const faces = [];
  if (cam.x < R.x0) faces.push([R.x0, R.y1, R.x0, R.y0, -1, 0, 0]);
  if (cam.x > R.x1) faces.push([R.x1, R.y0, R.x1, R.y1, 1, 0, 1]);
  if (cam.y < R.y0) faces.push([R.x0, R.y0, R.x1, R.y0, 0, -1, 2]);
  if (cam.y > R.y1) faces.push([R.x1, R.y1, R.x0, R.y1, 0, 1, 3]);
  for (const [ax, ay, bx, by, nx, ny, face] of faces) {
    const lit = faceLight(nx, ny, light);
    const a = P(cam, ax, ay, h);
    const c = P(cam, bx, by, h);
    ctx.fillStyle = wallColor(b.wall, lit, light, nx !== 0 ? 0.92 : 1);
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx, by);
    ctx.lineTo(c.x, c.y);
    ctx.lineTo(a.x, a.y);
    ctx.closePath();
    ctx.fill();
    // Ambient occlusion at the foot of the wall and a lit cornice at the top.
    const g = ctx.createLinearGradient((ax + bx) / 2, (ay + by) / 2, (a.x + c.x) / 2, (a.y + c.y) / 2);
    g.addColorStop(0, 'rgba(0,0,0,0.28)');
    g.addColorStop(0.25, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(255,255,255,0.06)');
    ctx.fillStyle = g;
    ctx.fill();
    if (h > 14) drawWindows(ctx, b, cam, light, ax, ay, bx, by, h, face, nx, ny);
    if (b.trim) {
      ctx.fillStyle = rgb(b.trim, 0.75 + lit * 0.3, 1, light.ambient);
      for (const [h0, h1] of [[h - 6, h - 2], [3, 6]]) {
        const p = P(cam, ax, ay, h0);
        const q = P(cam, bx, by, h0);
        const r = P(cam, bx, by, h1);
        const s = P(cam, ax, ay, h1);
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(q.x, q.y);
        ctx.lineTo(r.x, r.y);
        ctx.lineTo(s.x, s.y);
        ctx.fill();
      }
    }
  }
}

function roofRect(cam, R, h) {
  const f = heightScale(h);
  return { x0: cam.x + (R.x0 - cam.x) * f, y0: cam.y + (R.y0 - cam.y) * f, x1: cam.x + (R.x1 - cam.x) * f, y1: cam.y + (R.y1 - cam.y) * f, f };
}

function drawRoof(ctx, b, R, h, cam, light, t) {
  const rr = roofRect(cam, R, h);
  const w = rr.x1 - rr.x0;
  const hh = rr.y1 - rr.y0;
  const amb = light.ambient;
  const type = R === b ? b.roofType : 'flat';
  if (type === 'hip') {
    const peak = Math.min(R.x1 - R.x0, R.y1 - R.y0) * 0.35;
    const along = R.x1 - R.x0 >= R.y1 - R.y0;
    const inset = Math.min(R.x1 - R.x0, R.y1 - R.y0) / 2;
    const cx = (R.x0 + R.x1) / 2;
    const cy = (R.y0 + R.y1) / 2;
    const r0 = along ? P(cam, R.x0 + inset, cy, h + peak) : P(cam, cx, R.y0 + inset, h + peak);
    const r1 = along ? P(cam, R.x1 - inset, cy, h + peak) : P(cam, cx, R.y1 - inset, h + peak);
    const c00 = { x: rr.x0, y: rr.y0 };
    const c10 = { x: rr.x1, y: rr.y0 };
    const c11 = { x: rr.x1, y: rr.y1 };
    const c01 = { x: rr.x0, y: rr.y1 };
    const faces = along
      ? [[[c00, c10, r1, r0], 0, -1], [[c10, c11, r1], 1, 0], [[c11, c01, r0, r1], 0, 1], [[c01, c00, r0], -1, 0]]
      : [[[c00, c10, r0], 0, -1], [[c10, c11, r1, r0], 1, 0], [[c11, c01, r1], 0, 1], [[c01, c00, r0, r1], -1, 0]];
    for (const [pts, nx, ny] of faces) {
      const lit = faceLight(nx, ny, light);
      ctx.fillStyle = rgb(mixRgb(b.roof, WARM, lit * light.warm * 0.35), 0.72 + lit * 0.42, 1, amb);
      ctx.beginPath();
      pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      ctx.closePath();
      ctx.fill();
    }
    // Tile courses: lines parallel to the eaves.
    ctx.strokeStyle = 'rgba(60,20,10,0.22)';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    for (let s = 0.2; s < 1; s += 0.2) {
      ctx.moveTo(c00.x + (r0.x - c00.x) * s, c00.y + (r0.y - c00.y) * s);
      ctx.lineTo(c10.x + (r1.x - c10.x) * s, c10.y + (r1.y - c10.y) * s);
      ctx.lineTo(c11.x + (r1.x - c11.x) * s, c11.y + (r1.y - c11.y) * s);
      ctx.lineTo(c01.x + (r0.x - c01.x) * s, c01.y + (r0.y - c01.y) * s);
      ctx.closePath();
    }
    ctx.stroke();
    ctx.strokeStyle = rgb(b.roof, 0.55, 1, amb);
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(r0.x, r0.y);
    ctx.lineTo(r1.x, r1.y);
    for (const c of [c00, c10, c11, c01]) {
      const r = Math.hypot(c.x - r0.x, c.y - r0.y) < Math.hypot(c.x - r1.x, c.y - r1.y) ? r0 : r1;
      ctx.moveTo(c.x, c.y);
      ctx.lineTo(r.x, r.y);
    }
    ctx.stroke();
    return;
  }
  if (type === 'arch') {
    const g = ctx.createLinearGradient(rr.x0, rr.y0, rr.x0, rr.y1);
    g.addColorStop(0, rgb(b.roof, 1.15, 1, amb));
    g.addColorStop(0.5, rgb(b.roof, 0.95, 1, amb));
    g.addColorStop(1, rgb(b.roof, 0.6, 1, amb));
    ctx.fillStyle = g;
    ctx.fillRect(rr.x0, rr.y0, w, hh);
    ctx.strokeStyle = 'rgba(0,0,0,0.15)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = rr.x0 + 10; x < rr.x1; x += 12) {
      ctx.moveTo(x, rr.y0);
      ctx.lineTo(x, rr.y1);
    }
    ctx.stroke();
    return;
  }
  ctx.fillStyle = rgb(b.roof, 0.95, 1, amb);
  ctx.fillRect(rr.x0, rr.y0, w, hh);
  if (type === 'corrugated' || type === 'container') {
    ctx.strokeStyle = type === 'container' ? 'rgba(0,0,0,0.2)' : 'rgba(0,0,0,0.12)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    const horizontal = w > hh;
    const step = type === 'container' ? 3.5 * rr.f : 6 * rr.f;
    if (horizontal) for (let x = rr.x0 + step; x < rr.x1; x += step) {
      ctx.moveTo(x, rr.y0);
      ctx.lineTo(x, rr.y1);
    }
    else for (let y = rr.y0 + step; y < rr.y1; y += step) {
      ctx.moveTo(rr.x0, y);
      ctx.lineTo(rr.x1, y);
    }
    ctx.stroke();
    ctx.strokeStyle = 'rgba(0,0,0,0.3)';
    ctx.strokeRect(rr.x0 + 0.5, rr.y0 + 0.5, w - 1, hh - 1);
    if (type === 'container') {
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.fillRect(rr.x0, rr.y0, w, Math.min(3, hh * 0.2));
    }
  } else {
    // Flat roof: parapet rim and a lighter membrane.
    const p = Math.min(4 * rr.f, w * 0.12, hh * 0.12);
    ctx.fillStyle = rgb(b.roof, 1.08, 1, amb);
    ctx.fillRect(rr.x0 + p, rr.y0 + p, w - p * 2, hh - p * 2);
    ctx.strokeStyle = rgb(b.roof, 0.7, 1, amb);
    ctx.lineWidth = 1;
    ctx.strokeRect(rr.x0 + p, rr.y0 + p, w - p * 2, hh - p * 2);
    if (b.style === 'control') {
      ctx.fillStyle = rgb([120, 200, 230], 1, 1, light.night > 0.5 ? null : amb);
      ctx.fillRect(rr.x0, rr.y0, w, hh);
      ctx.fillStyle = rgb([70, 80, 90], 1, 1, amb);
      ctx.fillRect(rr.x0 + w * 0.2, rr.y0 + hh * 0.2, w * 0.6, hh * 0.6);
    }
  }
  if (R === (b.top ?? b)) drawRoofDetails(ctx, b, h, cam, light, t, rr.f);
}

function drawRoofDetails(ctx, b, h, cam, light, t, f) {
  const amb = light.ambient;
  const sx = light.shadowX * 3;
  const sy = light.shadowY * 3;
  ctx.save();
  ctx.translate(cam.x * (1 - f), cam.y * (1 - f));
  ctx.scale(f, f);
  for (const d of b.details) {
    switch (d.k) {
      case 'ac':
        ctx.fillStyle = 'rgba(0,0,0,0.25)';
        ctx.fillRect(d.x + sx, d.y + sy, d.w, d.h);
        ctx.fillStyle = rgb([196, 200, 204], 1, 1, amb);
        ctx.fillRect(d.x, d.y, d.w, d.h);
        ctx.fillStyle = rgb([120, 126, 132], 1, 1, amb);
        ctx.beginPath();
        ctx.arc(d.x + d.w / 2, d.y + d.h / 2, Math.min(d.w, d.h) * 0.32, 0, Math.PI * 2);
        ctx.fill();
        break;
      case 'tank':
        ctx.fillStyle = 'rgba(0,0,0,0.25)';
        ctx.beginPath();
        ctx.arc(d.x + sx * 2, d.y + sy * 2, d.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = rgb([170, 150, 120], 1, 1, amb);
        ctx.beginPath();
        ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = rgb([110, 90, 70], 1, 1, amb);
        ctx.lineWidth = 1;
        ctx.stroke();
        break;
      case 'antenna':
        ctx.strokeStyle = rgb([80, 84, 90], 1, 1, amb);
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(d.x, d.y);
        ctx.lineTo(d.x + sx * 4, d.y + sy * 4);
        ctx.stroke();
        if (light.night > 0.3 && Math.sin(t * 3 + d.x) > 0) {
          ctx.fillStyle = '#ff3b3b';
          ctx.beginPath();
          ctx.arc(d.x, d.y, 2, 0, Math.PI * 2);
          ctx.fill();
        }
        break;
      case 'solar':
        ctx.fillStyle = rgb([40, 60, 110], 1, 1, amb);
        ctx.fillRect(d.x0, d.y0, d.x1 - d.x0, d.y1 - d.y0);
        ctx.strokeStyle = 'rgba(160,190,255,0.35)';
        ctx.lineWidth = 0.7;
        ctx.beginPath();
        for (let x = d.x0 + 6; x < d.x1; x += 6) {
          ctx.moveTo(x, d.y0);
          ctx.lineTo(x, d.y1);
        }
        ctx.moveTo(d.x0, (d.y0 + d.y1) / 2);
        ctx.lineTo(d.x1, (d.y0 + d.y1) / 2);
        ctx.stroke();
        break;
      case 'skylight':
        ctx.fillStyle = light.night > 0.4 ? 'rgba(255,220,150,0.85)' : rgb([150, 200, 220], 1, 1, amb);
        ctx.fillRect(d.x, d.y, d.w, d.h);
        break;
      case 'heli':
        ctx.fillStyle = rgb([70, 74, 80], 1, 1, amb);
        ctx.beginPath();
        ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#f2c230';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(d.x, d.y, d.r * 0.85, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = '#f4f4f0';
        ctx.font = `bold ${Math.round(d.r)}px Arial, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('H', d.x, d.y + 1);
        if (light.night > 0.3) {
          ctx.fillStyle = Math.sin(t * 4) > 0 ? '#7dff6a' : '#2f8a2a';
          for (let i = 0; i < 8; i += 1) {
            const a = (i / 8) * Math.PI * 2;
            ctx.fillRect(d.x + Math.cos(a) * d.r - 1.5, d.y + Math.sin(a) * d.r - 1.5, 3, 3);
          }
        }
        break;
      case 'pool': {
        ctx.fillStyle = rgb([236, 230, 216], 1, 1, amb);
        ctx.fillRect(d.x0 - 3, d.y0 - 3, d.x1 - d.x0 + 6, d.y1 - d.y0 + 6);
        const g = ctx.createLinearGradient(d.x0, d.y0, d.x1, d.y1);
        g.addColorStop(0, light.night > 0.5 ? '#3fe0ff' : '#8af3f3');
        g.addColorStop(1, light.night > 0.5 ? '#0a6fa0' : '#19a7cc');
        ctx.fillStyle = g;
        ctx.fillRect(d.x0, d.y0, d.x1 - d.x0, d.y1 - d.y0);
        ctx.strokeStyle = 'rgba(255,255,255,0.5)';
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        const yy = (d.y0 + d.y1) / 2 + Math.sin(t * 2 + d.x0) * 2;
        ctx.moveTo(d.x0 + 3, yy);
        ctx.quadraticCurveTo((d.x0 + d.x1) / 2, yy - 3, d.x1 - 3, yy);
        ctx.stroke();
        break;
      }
      case 'lounger':
        ctx.fillStyle = rgb([250, 250, 246], 1, 1, amb);
        ctx.fillRect(d.x, d.y, 14, 6);
        ctx.fillStyle = rgb([255, 120, 140], 1, 1, amb);
        ctx.fillRect(d.x + 10, d.y, 4, 6);
        break;
      case 'garden':
        ctx.fillStyle = rgb([84, 150, 70], 1, 1, amb);
        ctx.fillRect(d.x0, d.y0, d.x1 - d.x0, d.y1 - d.y0);
        ctx.fillStyle = rgb([50, 110, 50], 1, 1, amb);
        for (let i = 0; i < 6; i += 1) {
          ctx.beginPath();
          ctx.arc(d.x0 + hash2(b.seed, i, 1) * (d.x1 - d.x0), d.y0 + hash2(b.seed, i, 2) * (d.y1 - d.y0), 4, 0, Math.PI * 2);
          ctx.fill();
        }
        break;
      default:
        break;
    }
  }
  ctx.restore();
  for (const d of b.details) if (d.k === 'billboard') drawStandingPanel(ctx, cam, d.x0, d.y0 + 20, d.x1, d.y0 + 20, d.x0, d.y0, h, 20, d.text, d.color, light, true);
}

/**
 * A sign panel tilted up off a roof: its bottom edge runs from (ax,ay) to (bx,by) at height h,
 * its top edge sits over (tx,ty) a little higher, so the text reads upright from above.
 */
function drawStandingPanel(ctx, cam, ax, ay, bx, by, tx, ty, h, tall, text, color, light, billboard) {
  const bl = P(cam, ax, ay, h);
  const br = P(cam, bx, by, h);
  const tl = P(cam, tx, ty, h + tall * 0.6);
  const len = Math.hypot(bx - ax, by - ay);
  ctx.save();
  quadTransform(ctx, bl, br, tl, len, tall);
  const neon = light.neon;
  if (billboard) {
    ctx.fillStyle = rgb([30, 32, 38], 1, 1, light.ambient);
    ctx.fillRect(-1, -1, len + 2, tall + 2);
    const g = ctx.createLinearGradient(0, 0, len, tall);
    g.addColorStop(0, color);
    g.addColorStop(1, '#1a1030');
    ctx.fillStyle = g;
    ctx.globalAlpha = 0.65 + neon * 0.35;
    ctx.fillRect(1, 1, len - 2, tall - 2);
    ctx.globalAlpha = 1;
  } else {
    ctx.fillStyle = 'rgba(18,10,32,0.82)';
    ctx.fillRect(0, 0, len, tall);
    ctx.strokeStyle = color;
    ctx.globalAlpha = 0.5 + neon * 0.5;
    ctx.lineWidth = 1;
    ctx.strokeRect(1, 1, len - 2, tall - 2);
    ctx.globalAlpha = 1;
  }
  const size = Math.min(tall * 0.72, (len / Math.max(4, text.length)) * 1.55);
  ctx.font = `900 ${size.toFixed(1)}px "Arial Black", "Bahnschrift", Arial, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  if (neon > 0.05) {
    ctx.shadowColor = color;
    ctx.shadowBlur = 10 * neon;
  }
  ctx.fillStyle = billboard ? '#ffffff' : neon > 0.3 ? '#ffffff' : color;
  ctx.fillText(text, len / 2, tall / 2 + 1, len - 4);
  if (!billboard && neon > 0.3) {
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = color;
    ctx.fillText(text, len / 2, tall / 2 + 1, len - 4);
  }
  ctx.restore();
}

function drawSign(ctx, b, cam, light) {
  const s = b.sign;
  const R = b.top ?? b;
  const h = b.top ? b.top.h : b.h;
  const m = 3;
  const horizontal = s.edge === 'n' || s.edge === 's';
  const len = horizontal ? R.x1 - R.x0 - m * 2 : R.y1 - R.y0 - m * 2;
  const depth = horizontal ? R.y1 - R.y0 : R.x1 - R.x0;
  const tall = Math.min(26, Math.max(12, len * 0.2), depth * 0.45);
  // Bottom edge (a -> b, the reading direction) and the top-left corner t, inside the roof.
  let q;
  if (s.edge === 's') q = [R.x0 + m, R.y1 - 2, R.x1 - m, R.y1 - 2, R.x0 + m, R.y1 - 2 - tall];
  else if (s.edge === 'n') q = [R.x0 + m, R.y0 + 2 + tall, R.x1 - m, R.y0 + 2 + tall, R.x0 + m, R.y0 + 2];
  else if (s.edge === 'w') q = [R.x0 + 2 + tall, R.y1 - m, R.x0 + 2 + tall, R.y0 + m, R.x0 + 2, R.y1 - m];
  else q = [R.x1 - 2 - tall, R.y0 + m, R.x1 - 2 - tall, R.y1 - m, R.x1 - 2, R.y0 + m];
  drawStandingPanel(ctx, cam, q[0], q[1], q[2], q[3], q[4], q[5], h, tall, s.text, s.color, light, false);
}

/** Draw one building (podium + tower when it has one), its roof and signage. */
export function drawBuilding(ctx, b, cam, light, t) {
  drawWalls(ctx, b, b, b.h, cam, light);
  drawRoof(ctx, b, b, b.h, cam, light, t);
  if (b.top) {
    drawWalls(ctx, b, b.top, b.top.h, cam, light);
    drawRoof(ctx, b, b.top, b.top.h, cam, light, t);
  }
  if (b.sign) drawSign(ctx, b, cam, light);
}

/** Squared distance from the view centre, for far-to-near ordering of tall things. */
export function depthKey(o, cam) {
  const cx = o.x0 !== undefined ? (o.x0 + o.x1) / 2 : o.x;
  const cy = o.y0 !== undefined ? (o.y0 + o.y1) / 2 : o.y;
  return (cx - cam.x) ** 2 + (cy - cam.y) ** 2;
}
