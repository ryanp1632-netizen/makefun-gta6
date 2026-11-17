// The ground layer, cached in 512-unit chunks: a per-pixel terrain pass (water shading by depth,
// sand, district soil) under a vector pass of sidewalks, lots, roads, bridges, markings and piers.
// Skid marks are painted straight into the cached chunks so they persist. Shore foam and water
// glints are animated on top every frame.
import { LANE_W, SIDEWALK } from '../world/roadGraph.js';
import { DISTRICTS, districtIdAt } from '../world/districts.js';
import { hash2, valueNoise } from '../core/random.js';
import { rgb } from '../core/math.js';
import { makeTextures } from './textures.js';

export const CHUNK = 512;
const RES = 4;
const PAD = 2;
const MAX_CHUNKS = 56;

export function createGroundCache(city) {
  return { city, tex: makeTextures(), chunks: new Map(), tick: 0, skids: [] };
}

function terrainColor(city, x, y) {
  const sdf = city.terrain.sdf(x, y);
  if (sdf > 0) {
    const k = Math.pow(Math.min(1, sdf / 300), 0.55);
    const n = valueNoise(x / 70, y / 70, 77) * 12 - 6 + valueNoise(x / 19, y / 23, 78) * 6;
    let r = 92 + (10 - 92) * k + n;
    let g = 224 + (98 - 224) * k + n;
    let b = 212 + (146 - 212) * k + n * 0.6;
    if (sdf < 14) {
      const f = (1 - sdf / 14) * 0.45;
      r += (226 - r) * f;
      g += (250 - g) * f;
      b += (242 - b) * f;
    }
    return [r, g, b];
  }
  const id = districtIdAt(x, y);
  const depth = -sdf;
  const sandW = id === 'strand' ? 9999 : id === 'docks' ? 0 : id === 'field' ? 18 : 26 + valueNoise(x / 220, y / 220, 5) * 46;
  const n = valueNoise(x / 46, y / 46, 12) * 16 - 8 + (hash2(x | 0, y | 0, 3) - 0.5) * 6;
  if (depth < sandW) {
    if (depth < 9) return [200 + n, 176 + n, 128 + n];
    return [238 + n, 216 + n, 164 + n];
  }
  if (id === 'docks' && depth < 24) return depth < 4 ? [70, 70, 72] : [172 + n, 170 + n, 162 + n];
  const g = DISTRICTS[id].ground;
  const m = valueNoise(x / 160, y / 160, 15) * 18 - 9;
  return [g[0] + n + m, g[1] + n + m * 1.2, g[2] + n + m * 0.5];
}

function buildTerrain(city, wx, wy, size) {
  const n = Math.ceil(size / RES) + 2;
  const c = document.createElement('canvas');
  c.width = n;
  c.height = n;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(n, n);
  for (let j = 0; j < n; j += 1) {
    for (let i = 0; i < n; i += 1) {
      const col = terrainColor(city, wx + (i - 1) * RES, wy + (j - 1) * RES);
      const k = (j * n + i) * 4;
      img.data[k] = col[0];
      img.data[k + 1] = col[1];
      img.data[k + 2] = col[2];
      img.data[k + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return { canvas: c, n };
}

const overlaps = (o, x0, y0, x1, y1) => o.x1 >= x0 && o.x0 <= x1 && o.y1 >= y0 && o.y0 <= y1;

function buildChunk(cache, cx, cy) {
  const city = cache.city;
  const size = CHUNK + PAD * 2;
  const wx = cx * CHUNK - PAD;
  const wy = cy * CHUNK - PAD;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const terrain = buildTerrain(city, wx, wy, size);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(terrain.canvas, 0.5, 0.5, terrain.n - 1, terrain.n - 1, -RES * 0.5, -RES * 0.5, (terrain.n - 1) * RES, (terrain.n - 1) * RES);
  ctx.translate(-wx, -wy);
  const t = cache.tex;
  const pats = {};
  for (const key of Object.keys(t)) pats[key] = ctx.createPattern(t[key], 'repeat');
  const x0 = wx - 80;
  const y0 = wy - 80;
  const x1 = wx + size + 80;
  const y1 = wy + size + 80;
  for (const b of city.blocks) if (overlaps({ x0: b.x0 - SIDEWALK, y0: b.y0 - SIDEWALK, x1: b.x1 + SIDEWALK, y1: b.y1 + SIDEWALK }, x0, y0, x1, y1)) drawBlockBase(ctx, b, pats);
  for (const lot of city.lots) if (overlaps(lot, x0, y0, x1, y1)) drawLot(ctx, lot, pats);
  for (const p of city.piers) if (overlaps(p, x0, y0, x1, y1)) drawPier(ctx, p, pats);
  for (const r of city.roads) if (overlaps({ x0: r.x0 - r.hw - 30, y0: r.y0 - r.hw - 30, x1: r.x1 + r.hw + 30, y1: r.y1 + r.hw + 30 }, x0, y0, x1, y1)) drawRoad(ctx, city, r, pats);
  for (const e of city.edges) {
    const minx = Math.min(e.mx - e.len / 2, e.mx + e.len / 2) - 70;
    const miny = Math.min(e.my - e.len / 2, e.my + e.len / 2) - 70;
    if (overlaps({ x0: minx, y0: miny, x1: minx + e.len + 140, y1: miny + e.len + 140 }, x0, y0, x1, y1)) drawMarkings(ctx, city, e);
  }
  for (const s of cache.skids) if (s.x0 > x0 && s.x0 < x1 && s.y0 > y0 && s.y0 < y1) strokeSkid(ctx, s);
  return { canvas, wx, wy, used: cache.tick };
}

function drawBlockBase(ctx, b, pats) {
  const d = DISTRICTS[b.district];
  const x = b.x0 - SIDEWALK;
  const y = b.y0 - SIDEWALK;
  const w = b.x1 - b.x0 + SIDEWALK * 2;
  const h = b.y1 - b.y0 + SIDEWALK * 2;
  ctx.fillStyle = rgb(d.walk);
  ctx.fillRect(x, y, w, h);
  ctx.globalCompositeOperation = 'multiply';
  ctx.fillStyle = pats.pavers;
  ctx.fillRect(x, y, w, h);
  ctx.globalCompositeOperation = 'source-over';
  ctx.strokeStyle = 'rgba(40,40,46,0.45)';
  ctx.lineWidth = 2.5;
  ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 3, y + 3, w - 6, h - 6);
  ctx.fillStyle = rgb(d.ground, 0.92);
  ctx.fillRect(b.x0, b.y0, b.x1 - b.x0, b.y1 - b.y0);
}

function fountain(ctx, cx, cy, r) {
  ctx.fillStyle = '#d9d2c3';
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * 0.85);
  g.addColorStop(0, '#bff6f2');
  g.addColorStop(1, '#2fb7c4');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.82, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#e8e2d4';
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.22, 0, Math.PI * 2);
  ctx.fill();
}

function drawLot(ctx, lot, pats) {
  const d = DISTRICTS[lot.district];
  const x = lot.x0;
  const y = lot.y0;
  const w = lot.x1 - lot.x0;
  const h = lot.y1 - lot.y0;
  const k = lot.kind;
  if (k === 'paving' || k === 'plaza') {
    ctx.fillStyle = rgb(d.walk, k === 'plaza' ? 1.02 : 0.95);
    ctx.fillRect(x, y, w, h);
    ctx.globalCompositeOperation = 'multiply';
    ctx.fillStyle = pats.pavers;
    ctx.fillRect(x, y, w, h);
    ctx.globalCompositeOperation = 'source-over';
    if (k === 'plaza') {
      fountain(ctx, x + w / 2, y + h / 2, Math.min(w, h) * 0.2);
      ctx.fillStyle = '#7a5a3a';
      for (let i = 0; i < 4; i += 1) {
        const a = (i * Math.PI) / 2 + 0.4;
        const r = Math.min(w, h) * 0.34;
        ctx.fillRect(x + w / 2 + Math.cos(a) * r - 7, y + h / 2 + Math.sin(a) * r - 2.5, 14, 5);
      }
    }
  } else if (k === 'lawn' || k === 'park') {
    ctx.fillStyle = pats.grass;
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    for (let i = 0; i < w; i += 28) ctx.fillRect(x + i, y, 14, h);
    if (k === 'lawn') {
      ctx.strokeStyle = 'rgba(30,86,40,0.85)';
      ctx.lineWidth = 6;
      ctx.strokeRect(x + 4, y + 4, w - 8, h - 8);
    } else {
      ctx.strokeStyle = '#e2d3ae';
      ctx.lineWidth = 9;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(x, y + h * 0.2);
      ctx.quadraticCurveTo(x + w * 0.5, y + h * 0.75, x + w, y + h * 0.35);
      ctx.moveTo(x + w * 0.3, y);
      ctx.quadraticCurveTo(x + w * 0.45, y + h * 0.5, x + w * 0.7, y + h);
      ctx.stroke();
      ctx.lineCap = 'butt';
      const px = x + w * 0.72;
      const py = y + h * 0.7;
      const g = ctx.createRadialGradient(px, py, 4, px, py, Math.min(w, h) * 0.16);
      g.addColorStop(0, '#5fd6d0');
      g.addColorStop(1, '#2a9fb0');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(px, py, Math.min(w, h) * 0.18, Math.min(w, h) * 0.12, 0.4, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (k === 'parking') {
    ctx.fillStyle = pats.asphalt;
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = 'rgba(240,240,232,0.8)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    if (lot.horizontal) {
      for (let sx = x + 4; sx <= lot.x1 - 4; sx += 28) {
        ctx.moveTo(sx, y + 4);
        ctx.lineTo(sx, y + 54);
        if (h >= 130) {
          ctx.moveTo(sx, lot.y1 - 54);
          ctx.lineTo(sx, lot.y1 - 4);
        }
      }
    } else {
      for (let sy = y + 4; sy <= lot.y1 - 4; sy += 28) {
        ctx.moveTo(x + 4, sy);
        ctx.lineTo(x + 54, sy);
        if (w >= 130) {
          ctx.moveTo(lot.x1 - 54, sy);
          ctx.lineTo(lot.x1 - 4, sy);
        }
      }
    }
    ctx.stroke();
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    for (let i = 0; i < 6; i += 1) {
      ctx.beginPath();
      ctx.ellipse(x + hash2(lot.seed, i, 1) * w, y + hash2(lot.seed, i, 2) * h, 6 + hash2(lot.seed, i, 3) * 8, 4, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (k === 'yard') {
    ctx.fillStyle = '#9c9b94';
    ctx.fillRect(x, y, w, h);
    ctx.globalCompositeOperation = 'multiply';
    ctx.fillStyle = pats.asphalt;
    ctx.globalAlpha = 0.35;
    ctx.fillRect(x, y, w, h);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = 'rgba(240,200,60,0.75)';
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 5, y + 5, w - 10, h - 10);
  } else if (k === 'market') {
    ctx.fillStyle = pats.cobble;
    ctx.fillRect(x, y, w, h);
    fountain(ctx, x + w / 2, y + h / 2, 26);
    const colors = [['#e63946', '#fff1e6'], ['#2a9d8f', '#f1faee'], ['#f4a261', '#fff'], ['#457b9d', '#f1faee'], ['#e9c46a', '#8d5524'], ['#ff7eb6', '#fff']];
    let n = 0;
    for (let sy = y + 16; sy + 24 < lot.y1 - 10; sy += 46) {
      for (let sx = x + 14; sx + 32 < lot.x1 - 10; sx += 44) {
        n += 1;
        if (Math.hypot(sx + 16 - (x + w / 2), sy + 12 - (y + h / 2)) < 50) continue;
        const [c1, c2] = colors[n % colors.length];
        ctx.fillStyle = 'rgba(0,0,0,0.25)';
        ctx.fillRect(sx + 5, sy + 5, 32, 24);
        for (let s = 0; s < 4; s += 1) {
          ctx.fillStyle = s % 2 ? c2 : c1;
          ctx.fillRect(sx + s * 8, sy, 8, 24);
        }
        ctx.fillStyle = 'rgba(0,0,0,0.18)';
        ctx.fillRect(sx, sy + 11, 32, 2);
      }
    }
  } else if (k === 'pool') {
    ctx.fillStyle = '#e9e1d0';
    ctx.fillRect(x, y, w, h);
    const g = ctx.createLinearGradient(x, y, x + w, y + h);
    g.addColorStop(0, '#7ff0f0');
    g.addColorStop(1, '#1aa6c8');
    ctx.fillStyle = g;
    ctx.fillRect(x + 6, y + 6, w - 12, h - 12);
    ctx.strokeStyle = 'rgba(255,255,255,0.6)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i < 4; i += 1) {
      const yy = y + 10 + ((h - 20) * (i + 0.5)) / 4;
      ctx.moveTo(x + 10, yy);
      ctx.bezierCurveTo(x + w * 0.3, yy - 3, x + w * 0.6, yy + 3, x + w - 10, yy);
    }
    ctx.stroke();
  } else if (k === 'courtyard') {
    ctx.fillStyle = pats.terracotta;
    ctx.fillRect(x, y, w, h);
  } else if (k === 'runway') {
    ctx.fillStyle = pats.asphalt;
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = '#f2f2ea';
    const cy = y + h / 2;
    for (let sx = x + 120; sx < lot.x1 - 120; sx += 70) ctx.fillRect(sx, cy - 2, 40, 4);
    ctx.fillRect(x + 6, y + 6, w - 12, 3);
    ctx.fillRect(x + 6, lot.y1 - 9, w - 12, 3);
    for (const ex of [x + 16, lot.x1 - 76]) for (let i = 0; i < 8; i += 1) ctx.fillRect(ex, y + 14 + i * 12.5, 60, 6);
    ctx.font = 'bold 34px "Bahnschrift", Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.save();
    ctx.translate(x + 110, cy);
    ctx.rotate(Math.PI / 2);
    ctx.fillText('09', 0, 0);
    ctx.restore();
    ctx.save();
    ctx.translate(lot.x1 - 110, cy);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText('27', 0, 0);
    ctx.restore();
  } else if (k === 'apron') {
    ctx.fillStyle = '#b5b4ac';
    ctx.fillRect(x, y, w, h);
    ctx.globalCompositeOperation = 'multiply';
    ctx.fillStyle = pats.pavers;
    ctx.fillRect(x, y, w, h);
    ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = '#f2c230';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x, y + h - 40);
    ctx.lineTo(lot.x1, y + h - 40);
    for (const sx of [4760, 5020, 5280, 5480, 5900]) {
      ctx.moveTo(sx, y + h - 40);
      ctx.quadraticCurveTo(sx, y + 120, sx + 30, y + 112);
    }
    ctx.stroke();
  } else if (k === 'helipad') {
    ctx.fillStyle = '#8f9396';
    ctx.beginPath();
    ctx.arc(x + w / 2, y + h / 2, Math.min(w, h) / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#f2c230';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 40px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('H', x + w / 2, y + h / 2 + 2);
  }
}

function drawPier(ctx, p, pats) {
  ctx.fillStyle = 'rgba(0,40,60,0.3)';
  ctx.fillRect(p.x0 + 6, p.y0 + 8, p.x1 - p.x0, p.y1 - p.y0);
  ctx.fillStyle = pats.planks;
  ctx.fillRect(p.x0, p.y0, p.x1 - p.x0, p.y1 - p.y0);
  ctx.fillStyle = '#5b4632';
  for (let x = p.x0 + 6; x < p.x1; x += 30) {
    ctx.fillRect(x, p.y0 - 2, 4, 4);
    ctx.fillRect(x, p.y1 - 2, 4, 4);
  }
}

/** Find the stretches of a road's centre line that cross open water. */
function bridgeSpans(city, r) {
  const spans = [];
  const len = r.vertical ? r.y1 - r.y0 : r.x1 - r.x0;
  let start = -1;
  for (let s = 0; s <= len; s += 12) {
    const x = r.vertical ? r.x0 : r.x0 + s;
    const y = r.vertical ? r.y0 + s : r.y0;
    const wet = city.terrain.sdf(x, y) > -r.hw * 0.4;
    if (wet && start < 0) start = s;
    if ((!wet || s + 12 > len) && start >= 0) {
      spans.push([start - 10, s + 10]);
      start = -1;
    }
  }
  return spans;
}

function spanRect(r, a, b) {
  return r.vertical ? { x: r.x0 - r.hw, y: r.y0 + a, w: r.hw * 2, h: b - a } : { x: r.x0 + a, y: r.y0 - r.hw, w: b - a, h: r.hw * 2 };
}

function drawRoad(ctx, city, r, pats) {
  const spans = r.spans ?? (r.spans = bridgeSpans(city, r));
  for (const [a, b] of spans) {
    const s = spanRect(r, a, b);
    ctx.fillStyle = 'rgba(0,50,70,0.35)';
    ctx.fillRect(s.x + 16, s.y + 22, s.w, s.h);
    ctx.fillStyle = 'rgba(30,60,70,0.55)';
    for (let t = 40; t < b - a; t += 110) {
      if (r.vertical) ctx.fillRect(s.x + 10, s.y + t, s.w + 12, 10);
      else ctx.fillRect(s.x + t, s.y + 12, 10, s.h + 14);
    }
  }
  const x = r.x0 - r.hw;
  const y = r.y0 - r.hw;
  const w = r.x1 - r.x0 + r.hw * 2;
  const h = r.y1 - r.y0 + r.hw * 2;
  ctx.fillStyle = pats.asphalt;
  ctx.fillRect(x, y, w, h);
  if (r.kind === 'highway' || r.kind === 'causeway') {
    ctx.fillStyle = 'rgba(0,0,0,0.08)';
    ctx.fillRect(x, y, w, h);
  }
  // Tyre-worn lane centres.
  ctx.fillStyle = 'rgba(0,0,0,0.07)';
  for (let l = -r.lanes; l < r.lanes; l += 1) {
    const off = (l + 0.5) * LANE_W;
    for (const o of [-7, 7]) {
      if (r.vertical) ctx.fillRect(r.x0 + off + o - 2, r.y0, 4, r.y1 - r.y0);
      else ctx.fillRect(r.x0, r.y0 + off + o - 2, r.x1 - r.x0, 4);
    }
  }
  for (const [a, b] of spans) {
    const s = spanRect(r, a, b);
    ctx.fillStyle = '#d8d4cc';
    if (r.vertical) {
      ctx.fillRect(s.x - 6, s.y, 6, s.h);
      ctx.fillRect(s.x + s.w, s.y, 6, s.h);
    } else {
      ctx.fillRect(s.x, s.y - 6, s.w, 6);
      ctx.fillRect(s.x, s.y + s.h, s.w, 6);
    }
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    for (let t = 0; t < b - a; t += 24) {
      if (r.vertical) {
        ctx.fillRect(s.x - 6, s.y + t, 6, 2);
        ctx.fillRect(s.x + s.w, s.y + t, 6, 2);
      } else {
        ctx.fillRect(s.x + t, s.y - 6, 2, 6);
        ctx.fillRect(s.x + t, s.y + s.h, 2, 6);
      }
    }
  }
}

function drawMarkings(ctx, city, e) {
  const a = city.nodes[e.a];
  const b = city.nodes[e.b];
  const s0 = a.hw + (a.edges.length > 2 ? 22 : 4);
  const s1 = e.len - b.hw - (b.edges.length > 2 ? 22 : 4);
  const nx = -e.dy;
  const ny = e.dx;
  function line(off, from, to, dash, color, width) {
    if (to <= from) return;
    ctx.setLineDash(dash);
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(a.x + e.dx * from + nx * off, a.y + e.dy * from + ny * off);
    ctx.lineTo(a.x + e.dx * to + nx * off, a.y + e.dy * to + ny * off);
    ctx.stroke();
  }
  if (e.lanes === 1) line(0, s0, s1, [16, 14], '#e9c74a', 2);
  else {
    line(-2.5, s0, s1, [], '#e9c74a', 1.8);
    line(2.5, s0, s1, [], '#e9c74a', 1.8);
    line(-LANE_W, s0, s1, [14, 16], 'rgba(245,245,240,0.85)', 1.8);
    line(LANE_W, s0, s1, [14, 16], 'rgba(245,245,240,0.85)', 1.8);
  }
  if (e.road.kind === 'highway' || e.road.kind === 'causeway' || e.road.kind === 'boulevard') {
    line(-e.hw + 4, s0, s1, [], 'rgba(245,245,240,0.7)', 1.5);
    line(e.hw - 4, s0, s1, [], 'rgba(245,245,240,0.7)', 1.5);
  }
  ctx.setLineDash([]);
  // Crosswalks and stop lines at real intersections.
  for (const [node, sign, base] of [[a, 1, 0], [b, -1, e.len]]) {
    if (node.edges.length < 3) continue;
    if (city.terrain.sdf(node.x, node.y) > -30) continue;
    const s = base + sign * (node.hw + 4);
    ctx.fillStyle = 'rgba(246,246,240,0.9)';
    for (let off = -e.hw + 4; off < e.hw - 4; off += 8) {
      const cx = a.x + e.dx * s + nx * (off + 2.5);
      const cy = a.y + e.dy * s + ny * (off + 2.5);
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(Math.atan2(e.dy, e.dx));
      ctx.fillRect(0, -2.5, 13 * sign, 5);
      ctx.restore();
    }
    const stop = base + sign * (node.hw + 20);
    const side = sign;
    ctx.strokeStyle = 'rgba(246,246,240,0.9)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    const sx = a.x + e.dx * stop;
    const sy = a.y + e.dy * stop;
    // Traffic approaching this node drives on the right of its travel direction (toward -sign).
    ctx.moveTo(sx + nx * 2 * -side, sy + ny * 2 * -side);
    ctx.lineTo(sx + nx * (e.hw - 3) * -side, sy + ny * (e.hw - 3) * -side);
    ctx.stroke();
  }
}

function strokeSkid(ctx, s) {
  ctx.strokeStyle = `rgba(22,22,24,${s.a})`;
  ctx.lineWidth = s.w;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(s.x0, s.y0);
  ctx.lineTo(s.x1, s.y1);
  ctx.stroke();
  ctx.lineCap = 'butt';
}

/** Lay a persistent skid mark (painted into any cached chunk under it). */
export function paintSkid(cache, x0, y0, x1, y1, alpha = 0.35, width = 3.2) {
  const s = { x0, y0, x1, y1, a: alpha, w: width };
  cache.skids.push(s);
  if (cache.skids.length > 5000) cache.skids.splice(0, 500);
  const key = `${Math.floor(x0 / CHUNK)},${Math.floor(y0 / CHUNK)}`;
  const c = cache.chunks.get(key);
  if (c) {
    const ctx = c.canvas.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, -c.wx, -c.wy);
    strokeSkid(ctx, s);
  }
}

/** Draw the cached ground under the view, building at most `budget` missing chunks. */
export function drawGround(ctx, cache, view, budget = 2) {
  cache.tick += 1;
  const cx0 = Math.floor(view.x0 / CHUNK);
  const cy0 = Math.floor(view.y0 / CHUNK);
  const cx1 = Math.floor(view.x1 / CHUNK);
  const cy1 = Math.floor(view.y1 / CHUNK);
  for (let cy = cy0; cy <= cy1; cy += 1) {
    for (let cx = cx0; cx <= cx1; cx += 1) {
      const key = `${cx},${cy}`;
      let c = cache.chunks.get(key);
      if (!c && budget > 0) {
        c = buildChunk(cache, cx, cy);
        cache.chunks.set(key, c);
        budget -= 1;
      }
      if (c) {
        c.used = cache.tick;
        ctx.drawImage(c.canvas, c.wx, c.wy);
      } else {
        ctx.fillStyle = '#1e8fae';
        ctx.fillRect(cx * CHUNK, cy * CHUNK, CHUNK, CHUNK);
      }
    }
  }
  if (cache.chunks.size > MAX_CHUNKS) {
    const list = [...cache.chunks.entries()].sort((p, q) => p[1].used - q[1].used);
    for (let i = 0; i < list.length - MAX_CHUNKS; i += 1) cache.chunks.delete(list[i][0]);
  }
}

/** Animated surf along the coastline and sun glints on open water. */
export function drawWaterFx(ctx, city, view, t, light) {
  const cc = city.coastCells;
  const i0 = Math.max(0, Math.floor(view.x0 / cc.CELL));
  const i1 = Math.min(cc.cols - 1, Math.floor(view.x1 / cc.CELL));
  const j0 = Math.max(0, Math.floor(view.y0 / cc.CELL));
  const j1 = Math.min(cc.rows - 1, Math.floor(view.y1 / cc.CELL));
  ctx.lineCap = 'round';
  for (let pass = 0; pass < 2; pass += 1) {
    ctx.beginPath();
    for (let j = j0; j <= j1; j += 1) {
      for (let i = i0; i <= i1; i += 1) {
        for (const p of cc.cells[j * cc.cols + i]) {
          const wave = Math.sin(t * 1.4 + p.phase) * 0.5 + 0.5;
          const off = pass === 0 ? 2 + wave * 9 : 14 + wave * 10;
          const len = pass === 0 ? 9 : 5 + wave * 4;
          const x = p.x + p.nx * off;
          const y = p.y + p.ny * off;
          ctx.moveTo(x - p.ny * len, y + p.nx * len);
          ctx.lineTo(x + p.ny * len, y - p.nx * len);
        }
      }
    }
    ctx.strokeStyle = pass === 0 ? 'rgba(255,255,255,0.62)' : 'rgba(255,255,255,0.28)';
    ctx.lineWidth = pass === 0 ? 4 : 2.5;
    ctx.stroke();
  }
  ctx.lineCap = 'butt';
  // Glints: a sparse, twinkling field on deeper water, tinted by the sun.
  const G = 44;
  const glint = light.warm > 0.4 ? '255,214,150' : light.night > 0.6 ? '200,220,255' : '255,255,255';
  ctx.fillStyle = `rgba(${glint},0.7)`;
  for (let gy = Math.floor(view.y0 / G) * G; gy < view.y1; gy += G) {
    for (let gx = Math.floor(view.x0 / G) * G; gx < view.x1; gx += G) {
      const h = hash2(gx / G, gy / G, 404);
      if (h > 0.16) continue;
      const tw = Math.sin(t * (1.5 + h * 8) + h * 40);
      if (tw < 0.55) continue;
      const x = gx + hash2(gx, gy, 1) * G;
      const y = gy + hash2(gx, gy, 2) * G;
      if (city.terrain.sdf(x, y) < 30) continue;
      ctx.fillRect(x - 5 * tw, y, 10 * tw, 1.6);
    }
  }
}
