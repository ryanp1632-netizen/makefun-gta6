// Palms with layered fronds, round shade trees, street lamps, beach umbrellas and towels, moored
// boats and the freighter, parked planes and dock cranes. Tall props lean with the same
// perspective as the buildings; crowns are cached sprites re-tinted when the light changes.
import { heightScale } from './camera.js';
import { hash1 } from '../core/random.js';
import { rgb } from '../core/math.js';

const SPRITE = 64;
const spriteCache = { key: '', palms: [], trees: [] };

function makeCanvas(n) {
  const c = document.createElement('canvas');
  c.width = n;
  c.height = n;
  return c;
}

function paintPalm(variant, amb) {
  const c = makeCanvas(SPRITE);
  const ctx = c.getContext('2d');
  ctx.translate(SPRITE / 2, SPRITE / 2);
  const fronds = 7 + (variant % 3);
  const base = [[46, 120, 52], [62, 146, 60], [88, 172, 70]];
  for (let layer = 0; layer < 3; layer += 1) {
    for (let i = 0; i < fronds; i += 1) {
      const a = (i / fronds) * Math.PI * 2 + layer * 0.45 + variant * 0.7;
      const len = (29 - layer * 4) * (0.85 + hash1(i * 7 + variant * 31 + layer) * 0.2);
      const bend = 0.35 + hash1(i + variant * 13) * 0.25;
      ctx.save();
      ctx.rotate(a);
      ctx.fillStyle = rgb(base[layer], 1, 1, amb);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(len * 0.5, -len * 0.28, len, len * bend * 0.4);
      ctx.quadraticCurveTo(len * 0.5, len * 0.12, 0, 0);
      ctx.fill();
      ctx.strokeStyle = rgb([30, 80, 34], 1, 0.6, amb);
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(len * 0.5, -len * 0.08, len, len * bend * 0.4);
      ctx.stroke();
      ctx.restore();
    }
  }
  ctx.fillStyle = rgb([110, 80, 40], 1, 1, amb);
  ctx.beginPath();
  ctx.arc(0, 0, 3.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = rgb([90, 140, 60], 1, 1, amb);
  ctx.beginPath();
  ctx.arc(-2, 1, 2, 0, Math.PI * 2);
  ctx.arc(2, 1.5, 2, 0, Math.PI * 2);
  ctx.fill();
  return c;
}

function paintTree(variant, amb) {
  const c = makeCanvas(SPRITE);
  const ctx = c.getContext('2d');
  ctx.translate(SPRITE / 2, SPRITE / 2);
  const tones = [[40, 104, 50], [58, 132, 58], [86, 160, 70], [120, 186, 90]];
  for (let layer = 0; layer < 4; layer += 1) {
    ctx.fillStyle = rgb(tones[layer], 1, 1, amb);
    const n = 7 - layer;
    for (let i = 0; i < n; i += 1) {
      const a = (i / n) * Math.PI * 2 + variant + layer;
      const d = (16 - layer * 4) * (0.7 + hash1(i * 3 + variant * 17 + layer) * 0.4);
      ctx.beginPath();
      ctx.arc(Math.cos(a) * d - layer * 1.5, Math.sin(a) * d - layer * 1.5, 13 - layer * 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  return c;
}

function sprites(light) {
  const a = light.ambient;
  const key = `${a[0].toFixed(2)},${a[1].toFixed(2)},${a[2].toFixed(2)}`;
  if (spriteCache.key !== key) {
    spriteCache.key = key;
    spriteCache.palms = [0, 1, 2, 3].map((v) => paintPalm(v, a));
    spriteCache.trees = [0, 1, 2].map((v) => paintTree(v, a));
  }
  return spriteCache;
}

function proj(cam, x, y, h) {
  const f = heightScale(h);
  return { x: cam.x + (x - cam.x) * f, y: cam.y + (y - cam.y) * f, f };
}

/** A palm (trunk leaning with perspective, layered crown) or a round shade tree. */
export function drawTree(ctx, tree, cam, light, t) {
  const s = sprites(light);
  const top = proj(cam, tree.x, tree.y, tree.h);
  const sway = Math.sin(t * 1.3 + tree.seed) * 0.05;
  if (tree.kind === 'palm') {
    const mid = proj(cam, tree.x + 3, tree.y + 2, tree.h * 0.5);
    ctx.strokeStyle = rgb([128, 98, 66], 1, 1, light.ambient);
    ctx.lineWidth = 3.4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(tree.x, tree.y);
    ctx.quadraticCurveTo(mid.x, mid.y, top.x, top.y);
    ctx.stroke();
    ctx.strokeStyle = rgb([92, 68, 44], 1, 0.7, light.ambient);
    ctx.lineWidth = 3.6;
    ctx.setLineDash([1.2, 3]);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.lineCap = 'butt';
    const img = s.palms[tree.seed % 4];
    const size = (tree.r / 28) * SPRITE * top.f;
    ctx.save();
    ctx.translate(top.x, top.y);
    ctx.rotate((tree.seed % 628) / 100 + sway);
    ctx.drawImage(img, -size / 2, -size / 2, size, size);
    ctx.restore();
  } else {
    const img = s.trees[tree.seed % 3];
    const size = (tree.r / 22) * SPRITE * top.f;
    ctx.save();
    ctx.translate(top.x, top.y);
    ctx.rotate((tree.seed % 628) / 100);
    ctx.drawImage(img, -size / 2, -size / 2, size, size);
    ctx.restore();
  }
}

/** A street lamp: a pole leaning with perspective and an arm reaching over the road. */
export function drawLamp(ctx, lamp, cam, light) {
  const top = proj(cam, lamp.x, lamp.y, 34);
  const head = proj(cam, lamp.x + lamp.ax * 12, lamp.y + lamp.ay * 12, 34);
  ctx.strokeStyle = rgb([70, 74, 80], 1, 1, light.ambient);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(lamp.x, lamp.y);
  ctx.lineTo(top.x, top.y);
  ctx.lineTo(head.x, head.y);
  ctx.stroke();
  ctx.fillStyle = light.night > 0.35 ? '#fff3c4' : rgb([90, 94, 100], 1, 1, light.ambient);
  ctx.beginPath();
  ctx.ellipse(head.x, head.y, 4, 2.6, Math.atan2(lamp.ay, lamp.ax), 0, Math.PI * 2);
  ctx.fill();
}

/** Beach towels and sunbathers (ground level). */
export function drawTowel(ctx, u) {
  if (!u.towel) return;
  const x = u.x + Math.cos(u.angle) * 16;
  const y = u.y + Math.sin(u.angle) * 16;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(u.angle + Math.PI / 2);
  ctx.fillStyle = rgb([0, 0, 0], 1, 0.12);
  ctx.fillRect(-6, -12, 14, 26);
  ctx.fillStyle = u.towel;
  ctx.fillRect(-7, -13, 14, 26);
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.fillRect(-7, -13, 14, 3);
  ctx.fillRect(-7, 10, 14, 3);
  if (u.person) {
    const skins = ['#f1c27d', '#e0ac69', '#c68642', '#8d5524', '#ffdbac'];
    ctx.fillStyle = skins[u.skin];
    ctx.beginPath();
    ctx.ellipse(0, -1, 3.2, 8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(0, -10, 2.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = u.c1;
    ctx.fillRect(-3.2, 0, 6.4, 3.4);
  }
  ctx.restore();
}

/** A striped beach umbrella on a short pole. */
export function drawUmbrella(ctx, u, cam, light) {
  const top = proj(cam, u.x, u.y, 14);
  const r = u.r * top.f;
  ctx.strokeStyle = 'rgba(240,240,240,0.9)';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(u.x, u.y);
  ctx.lineTo(top.x, top.y);
  ctx.stroke();
  for (let i = 0; i < 8; i += 1) {
    ctx.fillStyle = rgb(i % 2 ? hex(u.c2) : hex(u.c1), 1, 1, light.ambient);
    ctx.beginPath();
    ctx.moveTo(top.x, top.y);
    ctx.arc(top.x, top.y, r, u.angle + (i * Math.PI) / 4, u.angle + ((i + 1) * Math.PI) / 4);
    ctx.closePath();
    ctx.fill();
  }
  ctx.fillStyle = 'rgba(0,0,0,0.12)';
  ctx.beginPath();
  ctx.arc(top.x + r * 0.2, top.y + r * 0.2, r * 0.75, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(top.x, top.y, 1.6, 0, Math.PI * 2);
  ctx.fill();
}

const hexCache = new Map();
function hex(h) {
  let v = hexCache.get(h);
  if (!v) {
    const n = Number.parseInt(h.slice(1), 16);
    v = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    hexCache.set(h, v);
  }
  return v;
}

/** Boats: speedboats, yachts, sailboats and the container freighter, bobbing on the water. */
export function drawBoat(ctx, b, light, t) {
  const amb = light.ambient;
  const bob = Math.sin(t * 1.2 + b.seed) * 0.03;
  ctx.save();
  ctx.translate(b.x, b.y);
  ctx.rotate(b.angle + bob);
  const L = b.len;
  const W = b.kind === 'ship' ? 70 : L * (b.kind === 'sail' ? 0.32 : 0.36);
  ctx.fillStyle = 'rgba(0,40,60,0.3)';
  hullPath(ctx, L, W, 5, 6);
  ctx.fill();
  if (b.drift) {
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-L * 0.5, -W * 0.3);
    ctx.lineTo(-L * 1.3, -W * 0.9);
    ctx.moveTo(-L * 0.5, W * 0.3);
    ctx.lineTo(-L * 1.3, W * 0.9);
    ctx.stroke();
  }
  ctx.fillStyle = rgb(hex(b.color), 1, 1, amb);
  hullPath(ctx, L, W, 0, 0);
  ctx.fill();
  ctx.strokeStyle = rgb(hex(b.accent), 1, 1, amb);
  ctx.lineWidth = b.kind === 'ship' ? 5 : 1.6;
  ctx.stroke();
  if (b.kind === 'ship') {
    const colors = [[196, 64, 52], [40, 96, 170], [230, 140, 40], [40, 140, 110], [170, 170, 176]];
    for (let i = 0; i < 9; i += 1) {
      for (let j = 0; j < 3; j += 1) {
        ctx.fillStyle = rgb(colors[(i * 3 + j * 2 + 1) % 5], 1, 1, amb);
        ctx.fillRect(-L * 0.38 + i * 30, -W * 0.36 + j * 16, 27, 14);
      }
    }
    ctx.fillStyle = rgb([236, 236, 230], 1, 1, amb);
    ctx.fillRect(-L * 0.46, -W * 0.34, 34, W * 0.68);
    ctx.fillStyle = rgb([40, 50, 60], 1, 1, amb);
    ctx.fillRect(-L * 0.44, -W * 0.25, 10, W * 0.5);
  } else if (b.kind === 'sail') {
    ctx.fillStyle = rgb([250, 250, 246], 1, 1, amb);
    ctx.beginPath();
    ctx.moveTo(L * 0.15, 0);
    ctx.lineTo(-L * 0.35, W * 0.9);
    ctx.lineTo(-L * 0.35, 0);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = rgb([90, 90, 90], 1, 1, amb);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(L * 0.15, 0);
    ctx.lineTo(-L * 0.4, 0);
    ctx.stroke();
  } else {
    ctx.fillStyle = rgb([60, 90, 120], 1, 1, amb);
    ctx.fillRect(-L * 0.05, -W * 0.3, L * 0.16, W * 0.6);
    ctx.fillStyle = rgb(b.kind === 'yacht' ? [244, 244, 240] : hex(b.accent), 1, 1, amb);
    ctx.fillRect(-L * 0.35, -W * 0.3, L * 0.3, W * 0.6);
    if (b.kind === 'yacht') {
      ctx.fillStyle = rgb([50, 70, 90], 1, 1, amb);
      ctx.fillRect(-L * 0.28, -W * 0.18, L * 0.18, W * 0.36);
    }
  }
  ctx.restore();
}

function hullPath(ctx, L, W, ox, oy) {
  ctx.beginPath();
  ctx.moveTo(L * 0.5 + ox, oy);
  ctx.quadraticCurveTo(L * 0.25 + ox, -W * 0.5 + oy, -L * 0.1 + ox, -W * 0.5 + oy);
  ctx.lineTo(-L * 0.5 + ox, -W * 0.45 + oy);
  ctx.lineTo(-L * 0.5 + ox, W * 0.45 + oy);
  ctx.lineTo(-L * 0.1 + ox, W * 0.5 + oy);
  ctx.quadraticCurveTo(L * 0.25 + ox, W * 0.5 + oy, L * 0.5 + ox, oy);
  ctx.closePath();
}

/** A parked plane seen from above. */
export function drawPlane(ctx, p, light) {
  const amb = light.ambient;
  const s = p.span;
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(p.angle);
  for (const [ox, oy, col] of [[8, 10, 'rgba(0,0,0,0.25)'], [0, 0, null]]) {
    ctx.fillStyle = col ?? rgb(hex(p.color), 1, 1, amb);
    ctx.beginPath();
    ctx.ellipse(ox, oy, s * 0.5, s * 0.07, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(ox + s * 0.08, oy);
    ctx.lineTo(ox - s * (p.jet ? 0.12 : 0.02), oy - s * 0.5);
    ctx.lineTo(ox - s * (p.jet ? 0.2 : 0.1), oy - s * 0.5);
    ctx.lineTo(ox - s * 0.12, oy);
    ctx.lineTo(ox - s * (p.jet ? 0.2 : 0.1), oy + s * 0.5);
    ctx.lineTo(ox - s * (p.jet ? 0.12 : 0.02), oy + s * 0.5);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(ox - s * 0.36, oy);
    ctx.lineTo(ox - s * 0.46, oy - s * 0.17);
    ctx.lineTo(ox - s * 0.5, oy - s * 0.17);
    ctx.lineTo(ox - s * 0.47, oy);
    ctx.lineTo(ox - s * 0.5, oy + s * 0.17);
    ctx.lineTo(ox - s * 0.46, oy + s * 0.17);
    ctx.closePath();
    ctx.fill();
  }
  ctx.fillStyle = rgb(hex(p.accent), 1, 1, amb);
  ctx.fillRect(-s * 0.45, -s * 0.02, s * 0.85, s * 0.04);
  ctx.fillStyle = rgb([40, 60, 80], 1, 1, amb);
  ctx.beginPath();
  ctx.ellipse(s * 0.4, 0, s * 0.05, s * 0.04, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** A ship-to-shore crane: four legs on the quay, a gantry and a boom out over the water. */
export function drawCrane(ctx, c, cam, light) {
  const amb = light.ambient;
  const legs = [[-26, -30], [26, -30], [26, 30], [-26, 30]].map(([dx, dy]) => ({ g: { x: c.x + dx, y: c.y + dy }, t: proj(cam, c.x + dx, c.y + dy, c.h) }));
  ctx.strokeStyle = rgb([230, 120, 40], 0.9, 1, amb);
  ctx.lineWidth = 5;
  ctx.beginPath();
  for (const l of legs) {
    ctx.moveTo(l.g.x, l.g.y);
    ctx.lineTo(l.t.x, l.t.y);
  }
  ctx.stroke();
  const boomA = proj(cam, c.x + 70, c.y, c.h + 6);
  const boomB = proj(cam, c.x - 210, c.y, c.h + 6);
  ctx.lineWidth = 9;
  ctx.strokeStyle = rgb([240, 140, 50], 1, 1, amb);
  ctx.beginPath();
  ctx.moveTo(boomA.x, boomA.y);
  ctx.lineTo(boomB.x, boomB.y);
  ctx.stroke();
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(legs[0].t.x, legs[0].t.y);
  ctx.lineTo(legs[1].t.x, legs[1].t.y);
  ctx.lineTo(legs[2].t.x, legs[2].t.y);
  ctx.lineTo(legs[3].t.x, legs[3].t.y);
  ctx.closePath();
  ctx.stroke();
  const cab = proj(cam, c.x - 60, c.y, c.h + 8);
  ctx.fillStyle = rgb([60, 70, 80], 1, 1, amb);
  ctx.fillRect(cab.x - 9, cab.y - 7, 18, 14);
  if (light.night > 0.3) {
    ctx.fillStyle = '#ff3b3b';
    ctx.beginPath();
    ctx.arc(boomB.x, boomB.y, 3, 0, Math.PI * 2);
    ctx.fill();
  }
}
