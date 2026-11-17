// Every vehicle is drawn by code: a painted body with a highlight along the roofline, tinted
// glass, lights, mirrors and model details (coupe spoiler, taxi sign, pickup bed, van roof,
// police livery, motorbike). Bodies are cached as sprites per model and paint; brake lights,
// headlights, light bars, damage and fire are drawn live on top.
import { VEHICLE_MODELS } from '../vehicles/vehicleModels.js';
import { rgb } from '../core/math.js';

const S = 3;
const cache = new Map();

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function hexRgb(h) {
  const n = Number.parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** The car outline (facing +x), shared by the sprite and the damage overlay. */
export function bodyPath(ctx, L, W) {
  const hl = L / 2;
  const hw = W / 2;
  ctx.beginPath();
  ctx.moveTo(hl - 5, -hw + 0.8);
  ctx.quadraticCurveTo(hl, -hw + 1.5, hl, -hw + 5);
  ctx.lineTo(hl, hw - 5);
  ctx.quadraticCurveTo(hl, hw - 1.5, hl - 5, hw - 0.8);
  ctx.lineTo(-hl + 4, hw);
  ctx.quadraticCurveTo(-hl, hw, -hl, hw - 4);
  ctx.lineTo(-hl, -hw + 4);
  ctx.quadraticCurveTo(-hl, -hw, -hl + 4, -hw);
  ctx.closePath();
}

function glass(ctx, x0, x1, hw, taper, front) {
  ctx.beginPath();
  if (front) {
    ctx.moveTo(x0, -hw + taper);
    ctx.lineTo(x0, hw - taper);
    ctx.lineTo(x1, hw);
    ctx.lineTo(x1, -hw);
  } else {
    ctx.moveTo(x0, -hw);
    ctx.lineTo(x0, hw);
    ctx.lineTo(x1, hw - taper);
    ctx.lineTo(x1, -hw + taper);
  }
  ctx.closePath();
  const g = ctx.createLinearGradient(x0, 0, x1, 0);
  g.addColorStop(0, '#1d2a3a');
  g.addColorStop(1, '#4a6a88');
  ctx.fillStyle = g;
  ctx.fill();
}

function paintCar(ctx, model, paint) {
  const m = VEHICLE_MODELS[model];
  const L = m.length;
  const W = m.width;
  const hl = L / 2;
  const hw = W / 2;
  const base = hexRgb(paint);
  // Tyres peeking out from under the body.
  ctx.fillStyle = '#141414';
  for (const x of [hl * 0.62, -hl * 0.62]) {
    ctx.fillRect(x - 4.5, -hw - 0.8, 9, 3);
    ctx.fillRect(x - 4.5, hw - 2.2, 9, 3);
  }
  bodyPath(ctx, L, W);
  const g = ctx.createLinearGradient(0, -hw, 0, hw);
  g.addColorStop(0, rgb(base, 0.62));
  g.addColorStop(0.3, rgb(base, 1.0));
  g.addColorStop(0.5, rgb(base, 1.18));
  g.addColorStop(0.7, rgb(base, 1.0));
  g.addColorStop(1, rgb(base, 0.58));
  ctx.fillStyle = g;
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.55)';
  ctx.lineWidth = 0.7;
  ctx.stroke();
  if (model === 'police') {
    ctx.save();
    bodyPath(ctx, L, W);
    ctx.clip();
    ctx.fillStyle = '#16181d';
    ctx.fillRect(hl * 0.42, -hw, hl, W);
    ctx.fillRect(-hl, -hw, hl * 0.42, W);
    ctx.fillStyle = '#2f6fdf';
    ctx.fillRect(-hl * 0.55, -hw, hl * 0.95, 1.6);
    ctx.fillRect(-hl * 0.55, hw - 1.6, hl * 0.95, 1.6);
    ctx.restore();
  }
  const [cf, cr] = m.cabin;
  const front = cf * L;
  const rear = cr * L;
  if (model === 'van') {
    glass(ctx, front, front - 6, hw - 2, 2, true);
    ctx.fillStyle = rgb(base, 1.1);
    roundRect(ctx, -hl + 1.5, -hw + 1.5, front - 6 + hl - 1.5, W - 3, 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.12)';
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    for (let x = -hl + 6; x < front - 8; x += 5) {
      ctx.moveTo(x, -hw + 3);
      ctx.lineTo(x, hw - 3);
    }
    ctx.stroke();
    ctx.fillStyle = '#e8e8e2';
    ctx.font = 'bold 4px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
  } else if (model === 'pickup') {
    glass(ctx, front, front - 5, hw - 2.5, 2, true);
    ctx.fillStyle = rgb(base, 1.08);
    ctx.fillRect(rear + 3, -hw + 2.5, front - 5 - rear - 3, W - 5);
    glass(ctx, rear + 3, rear, hw - 2.5, 1.5, false);
    ctx.fillStyle = '#2a2a2c';
    ctx.fillRect(-hl + 2, -hw + 2.2, rear - 2 + hl - 2, W - 4.4);
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    for (let y = -hw + 4.5; y < hw - 3; y += 3) {
      ctx.moveTo(-hl + 3, y);
      ctx.lineTo(rear - 1, y);
    }
    ctx.stroke();
  } else if (model !== 'bike') {
    glass(ctx, front, front - 7, hw - 2, 2.5, true);
    ctx.fillStyle = rgb(model === 'police' ? [246, 246, 244] : base, 1.12);
    roundRect(ctx, rear + 4, -hw + 2.6, front - 7 - rear - 4, W - 5.2, 2);
    ctx.fill();
    glass(ctx, rear + 4, rear, hw - 2, 2, false);
    ctx.fillStyle = 'rgba(20,30,40,0.75)';
    ctx.fillRect(rear + 4, -hw + 1.2, front - 7 - rear - 4, 1.4);
    ctx.fillRect(rear + 4, hw - 2.6, front - 7 - rear - 4, 1.4);
    ctx.strokeStyle = 'rgba(0,0,0,0.18)';
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    ctx.moveTo(hl - 2, -hw * 0.45);
    ctx.lineTo(front + 1, -hw * 0.35);
    ctx.moveTo(hl - 2, hw * 0.45);
    ctx.lineTo(front + 1, hw * 0.35);
    ctx.stroke();
  }
  if (model === 'coupe' || model === 'muscle') {
    ctx.fillStyle = model === 'coupe' ? 'rgba(255,255,255,0.85)' : 'rgba(10,10,10,0.75)';
    ctx.fillRect(front + 1, -2.4, hl - front - 2, 1.6);
    ctx.fillRect(front + 1, 0.8, hl - front - 2, 1.6);
    ctx.fillRect(-hl + 1, -2.4, rear + hl - 1, 1.6);
    ctx.fillRect(-hl + 1, 0.8, rear + hl - 1, 1.6);
    ctx.fillStyle = '#18181a';
    ctx.fillRect(-hl + 0.5, -hw + 1, 2.4, W - 2);
  }
  if (model === 'taxi') {
    ctx.fillStyle = '#16181d';
    for (let x = -hl + 4; x < hl - 6; x += 4) {
      ctx.fillRect(x, -hw + 0.2, 2, 1.2);
      ctx.fillRect(x + 2, hw - 1.4, 2, 1.2);
    }
    ctx.fillStyle = '#fff6c8';
    roundRect(ctx, -3, -4.5, 6, 9, 1);
    ctx.fill();
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 0.5;
    ctx.stroke();
  }
  if (model === 'police') {
    ctx.fillStyle = '#20232a';
    roundRect(ctx, -2.5, -hw + 3, 5, W - 6, 1);
    ctx.fill();
  }
  // Lamps and mirrors.
  ctx.fillStyle = '#fffbe6';
  roundRect(ctx, hl - 2.4, -hw + 1.8, 2, 3.6, 0.8);
  ctx.fill();
  roundRect(ctx, hl - 2.4, hw - 5.4, 2, 3.6, 0.8);
  ctx.fill();
  ctx.fillStyle = '#7a1018';
  ctx.fillRect(-hl + 0.2, -hw + 1.6, 1.6, 4);
  ctx.fillRect(-hl + 0.2, hw - 5.6, 1.6, 4);
  ctx.fillStyle = rgb(base, 0.7);
  ctx.fillRect(front - 4, -hw - 1.6, 2.4, 1.8);
  ctx.fillRect(front - 4, hw - 0.2, 2.4, 1.8);
}

function paintBike(ctx, paint) {
  const base = hexRgb(paint);
  ctx.fillStyle = '#141414';
  roundRect(ctx, 6, -1.8, 8, 3.6, 1.5);
  ctx.fill();
  roundRect(ctx, -14, -2, 8, 4, 1.5);
  ctx.fill();
  ctx.fillStyle = rgb(base, 1);
  roundRect(ctx, -6, -3.4, 14, 6.8, 3);
  ctx.fill();
  ctx.fillStyle = rgb(base, 1.3);
  ctx.fillRect(-1, -1.2, 7, 2.4);
  ctx.fillStyle = '#26262a';
  roundRect(ctx, -9, -2.6, 8, 5.2, 2);
  ctx.fill();
  ctx.strokeStyle = '#9aa0a6';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(8, -5);
  ctx.lineTo(8, 5);
  ctx.stroke();
  ctx.fillStyle = '#fffbe6';
  ctx.beginPath();
  ctx.arc(12.5, 0, 1.4, 0, Math.PI * 2);
  ctx.fill();
}

/** The cached sprite for a model in a paint (drawn facing +x at S px per unit). */
export function vehicleSprite(model, paint) {
  const key = `${model}|${paint}`;
  let c = cache.get(key);
  if (c) return c;
  const m = VEHICLE_MODELS[model];
  c = document.createElement('canvas');
  c.width = Math.ceil((m.length + 10) * S);
  c.height = Math.ceil((m.width + 10) * S);
  const ctx = c.getContext('2d');
  ctx.setTransform(S, 0, 0, S, c.width / 2, c.height / 2);
  if (model === 'bike') paintBike(ctx, paint);
  else paintCar(ctx, model, paint);
  cache.set(key, c);
  return c;
}

/** The soft ground shadow of a vehicle, offset away from the sun. */
export function drawVehicleShadow(ctx, v, light) {
  const m = v.spec;
  ctx.save();
  ctx.translate(v.x + light.shadowX * 6, v.y + light.shadowY * 6);
  ctx.rotate(v.angle);
  ctx.fillStyle = `rgba(20,18,40,${0.28 + light.shadowAlpha * 0.3})`;
  roundRect(ctx, -m.length / 2 - 1, -m.width / 2 - 1, m.length + 2, m.width + 2, 5);
  ctx.fill();
  ctx.restore();
}

/** A vehicle with its live overlays (brake lights, light bar, rider, damage). */
export function drawVehicle(ctx, v, light, t) {
  const m = v.spec;
  const sprite = vehicleSprite(v.model, v.paint);
  ctx.save();
  ctx.translate(v.x, v.y);
  ctx.rotate(v.angle);
  ctx.drawImage(sprite, -sprite.width / S / 2, -sprite.height / S / 2, sprite.width / S, sprite.height / S);
  const hl = m.length / 2;
  const hw = m.width / 2;
  const damage = 1 - v.hp / m.hp;
  if (v.wrecked) {
    ctx.fillStyle = 'rgba(24,20,18,0.82)';
    bodyPath(ctx, m.length, m.width);
    ctx.fill();
  } else if (damage > 0.3) {
    ctx.fillStyle = `rgba(30,24,20,${Math.min(0.55, (damage - 0.3) * 0.9)})`;
    for (let i = 0; i < 4; i += 1) {
      ctx.beginPath();
      ctx.arc(Math.sin(v.id * 3 + i * 2.1) * hl * 0.7, Math.cos(v.id * 5 + i) * hw * 0.6, 3 + i, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  if (!v.wrecked) {
    if (v.braking || light.night > 0.3) {
      ctx.fillStyle = v.braking ? '#ff2a2a' : 'rgba(255,60,60,0.8)';
      ctx.fillRect(-hl - 0.4, -hw + 1.4, 2, 4.4);
      ctx.fillRect(-hl - 0.4, hw - 5.8, 2, 4.4);
    }
    if (light.night > 0.3 && v.lightsOn) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(hl - 2, -hw + 1.8, 2.4, 3.6);
      ctx.fillRect(hl - 2, hw - 5.4, 2.4, 3.6);
    }
    if (v.model === 'police') {
      const phase = Math.floor(t * 8 + v.id) % 2;
      const on = v.siren;
      ctx.fillStyle = on && phase ? '#ff2d3c' : on ? '#7a1018' : '#5a1218';
      ctx.fillRect(-2.5, -hw + 3, 5, (m.width - 6) / 2);
      ctx.fillStyle = on && !phase ? '#2d7bff' : on ? '#0d2a66' : '#0d2a66';
      ctx.fillRect(-2.5, 0, 5, (m.width - 6) / 2);
    }
    if (v.model === 'taxi' && light.night > 0.3) {
      ctx.fillStyle = '#ffe680';
      ctx.fillRect(-3, -4.5, 6, 9);
    }
  }
  if (v.model === 'bike' && v.driver) {
    ctx.fillStyle = v.driver === 'player' ? '#ff6b5a' : '#3a4a5a';
    ctx.beginPath();
    ctx.ellipse(-3, 0, 4, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = v.driver === 'player' ? '#1d1f24' : '#e8e8e8';
    ctx.beginPath();
    ctx.arc(0.5, 0, 3.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(120,180,255,0.6)';
    ctx.fillRect(2, -1.8, 1.6, 3.6);
  }
  ctx.restore();
}
