// Lighting: a half-resolution light buffer filled with the ambient colour of the hour, with
// headlight cones, street lamps, neon spill, fires, muzzle flashes, police strobes and the
// helicopter searchlight added on top, then multiplied over the street-level scene. A second,
// additive pass adds lens glows (lamps, tail lights, light bars) that read even by day.
import { P_FIRE, P_FLASH } from './particles.js';

const SCALE = 0.5;

export function createLighting() {
  const canvas = document.createElement('canvas');
  return { canvas, ctx: canvas.getContext('2d') };
}

function glow(ctx, x, y, r, color, alpha) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, `rgba(${color},${alpha})`);
  g.addColorStop(1, `rgba(${color},0)`);
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
}

/** Fill the light buffer for this frame and multiply it over the scene drawn so far. */
export function applyLighting(ctx, lighting, cam, light, scene, view) {
  const a = light.ambient;
  if (a[0] > 0.985 && a[1] > 0.985 && a[2] > 0.985) return;
  const L = lighting.ctx;
  const w = Math.ceil(cam.w * SCALE);
  const h = Math.ceil(cam.h * SCALE);
  if (lighting.canvas.width !== w || lighting.canvas.height !== h) {
    lighting.canvas.width = w;
    lighting.canvas.height = h;
  }
  L.setTransform(1, 0, 0, 1, 0, 0);
  L.globalCompositeOperation = 'source-over';
  L.fillStyle = `rgb(${Math.round(a[0] * 255)},${Math.round(a[1] * 255)},${Math.round(a[2] * 255)})`;
  L.fillRect(0, 0, w, h);
  const z = cam.zoom * SCALE;
  L.setTransform(z, 0, 0, z, w / 2 - (cam.x + cam.shakeX) * z, h / 2 - (cam.y + cam.shakeY) * z);
  L.globalCompositeOperation = 'lighter';
  const n = light.night;
  if (n > 0.05) {
    for (const lamp of scene.lamps) glow(L, lamp.x + lamp.ax * 14, lamp.y + lamp.ay * 14, 105, '255,196,120', 0.5 * n);
    for (const b of scene.buildings) {
      if (!b.sign) continue;
      const cx = (b.x0 + b.x1) / 2;
      const cy = (b.y0 + b.y1) / 2;
      glow(L, cx, cy, Math.max(b.x1 - b.x0, b.y1 - b.y0) * 0.8, hexTriplet(b.sign.color), 0.2 * light.neon);
    }
    for (const v of scene.vehicles) {
      if (!v.lightsOn || v.wrecked) continue;
      const ca = Math.cos(v.angle);
      const sa = Math.sin(v.angle);
      const fx = v.x + ca * v.spec.length * 0.5;
      const fy = v.y + sa * v.spec.length * 0.5;
      const reach = v.model === 'bike' ? 150 : 210;
      const g = L.createRadialGradient(fx, fy, 4, fx, fy, reach);
      g.addColorStop(0, `rgba(255,244,214,${0.75 * n})`);
      g.addColorStop(1, 'rgba(255,244,214,0)');
      L.fillStyle = g;
      L.beginPath();
      L.moveTo(fx - sa * 6, fy + ca * 6);
      L.arc(fx, fy, reach, v.angle - 0.42, v.angle + 0.42);
      L.lineTo(fx + sa * 6, fy - ca * 6);
      L.closePath();
      L.fill();
      glow(L, v.x - ca * v.spec.length * 0.5, v.y - sa * v.spec.length * 0.5, 34, '255,40,40', 0.45 * n);
    }
    for (const m of scene.markers) glow(L, m.x, m.y, 90, m.rgb, 0.5 * n);
  }
  for (const v of scene.vehicles) {
    if (v.model !== 'police' || !v.siren || v.wrecked) continue;
    const red = Math.floor(scene.t * 8 + v.id) % 2 === 0;
    glow(L, v.x, v.y, 150, red ? '255,40,60' : '40,110,255', 0.75);
  }
  for (const p of scene.particles) {
    if (p.kind === P_FIRE) glow(L, p.x, p.y, p.size * 6, '255,150,60', 0.25 * (p.life / p.max));
    else if (p.kind === P_FLASH) glow(L, p.x, p.y, p.size * 6, '255,220,150', 0.8 * (p.life / p.max));
  }
  if (scene.searchlight) {
    const s = scene.searchlight;
    const g = L.createRadialGradient(s.x, s.y, 0, s.x, s.y, s.r);
    g.addColorStop(0, 'rgba(255,255,240,0.95)');
    g.addColorStop(0.7, 'rgba(255,255,240,0.7)');
    g.addColorStop(1, 'rgba(255,255,240,0)');
    L.fillStyle = g;
    L.beginPath();
    L.arc(s.x, s.y, s.r, 0, Math.PI * 2);
    L.fill();
  }
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = 'multiply';
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(lighting.canvas, 0, 0, cam.w, cam.h);
  ctx.restore();
}

const tripletCache = new Map();
function hexTriplet(hex) {
  let v = tripletCache.get(hex);
  if (!v) {
    const n = Number.parseInt(hex.slice(1), 16);
    v = `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
    tripletCache.set(hex, v);
  }
  return v;
}

/** Coloured strobe light thrown on the ground by police light bars (visible by day too). */
export function drawGroundStrobes(ctx, scene) {
  ctx.globalCompositeOperation = 'lighter';
  for (const v of scene.vehicles) {
    if (v.model !== 'police' || !v.siren || v.wrecked) continue;
    const red = Math.floor(scene.t * 8 + v.id) % 2 === 0;
    glow(ctx, v.x, v.y, 70, red ? '255,30,50' : '30,90,255', 0.38);
  }
  ctx.globalCompositeOperation = 'source-over';
}

/** Additive lens glows above the buildings: lamps, light bars, head and tail lights. */
export function drawLensGlows(ctx, scene, light) {
  ctx.globalCompositeOperation = 'lighter';
  const n = light.night;
  for (const v of scene.vehicles) {
    if (v.wrecked) continue;
    const ca = Math.cos(v.angle);
    const sa = Math.sin(v.angle);
    const hl = v.spec.length / 2;
    const hw = v.spec.width / 2 - 3;
    if (v.model === 'police' && v.siren) {
      const red = Math.floor(scene.t * 8 + v.id) % 2 === 0;
      glow(ctx, v.x + sa * (red ? 4 : -4), v.y - ca * (red ? 4 : -4), 20, red ? '255,60,70' : '70,140,255', 0.75);
    }
    if (n > 0.3 && v.lightsOn) {
      for (const s of [-1, 1]) {
        glow(ctx, v.x + ca * hl - sa * hw * s, v.y + sa * hl + ca * hw * s, 9, '255,250,230', 0.8 * n);
        glow(ctx, v.x - ca * hl - sa * hw * s, v.y - sa * hl + ca * hw * s, 7, '255,40,40', 0.6 * n);
      }
    } else if (v.braking) {
      for (const s of [-1, 1]) glow(ctx, v.x - ca * hl - sa * hw * s, v.y - sa * hl + ca * hw * s, 7, '255,40,40', 0.7);
    }
  }
  if (n > 0.3) for (const lamp of scene.lamps) glow(ctx, lamp.x + lamp.ax * 12, lamp.y + lamp.ay * 12, 16, '255,220,160', 0.5 * n);
  ctx.globalCompositeOperation = 'source-over';
}
