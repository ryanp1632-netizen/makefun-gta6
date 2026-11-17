// The radar: a pre-rendered map of the whole city (land, districts, roads, buildings) shown in a
// rotating circle around the player, with the police search zone, unit blips, mission and
// activity icons, health and armour arcs around the rim and the respect level badge.
import { districtIdAt } from '../world/districts.js';
import { missionMarkers } from '../missions/missionRunner.js';
import { activityPoints } from '../missions/sideActivities.js';
import { respectLevel } from '../progression/economy.js';
import { drawIcon, FONT, DISPLAY } from '../ui/uiKit.js';

export const MAP_SCALE = 0.15;
let mapCache = null;

const LAND = {
  heights: [96, 136, 86], mercado: [160, 128, 96], neon: [100, 102, 118], marina: [104, 146, 126], docks: [116, 116, 110],
  deco: [164, 126, 150], strand: [222, 198, 146], field: [128, 146, 96], isle: [86, 138, 86], bay: [40, 110, 130],
};

/** Render the city once into a canvas at MAP_SCALE pixels per world unit. */
export function buildMapCanvas(city) {
  if (mapCache && mapCache.city === city) return mapCache.canvas;
  const W = Math.round(city.width * MAP_SCALE);
  const H = Math.round(city.height * MAP_SCALE);
  const lowW = Math.round(W / 2);
  const lowH = Math.round(H / 2);
  const low = document.createElement('canvas');
  low.width = lowW;
  low.height = lowH;
  const lctx = low.getContext('2d');
  const img = lctx.createImageData(lowW, lowH);
  for (let j = 0; j < lowH; j += 1) {
    for (let i = 0; i < lowW; i += 1) {
      const x = ((i + 0.5) / lowW) * city.width;
      const y = ((j + 0.5) / lowH) * city.height;
      const d = city.terrain.sdf(x, y);
      let c;
      if (d > 0) {
        const k = Math.min(1, d / 400);
        c = [36 - k * 16, 118 - k * 46, 140 - k * 34];
      } else c = LAND[districtIdAt(x, y)];
      const o = (j * lowW + i) * 4;
      img.data[o] = c[0];
      img.data[o + 1] = c[1];
      img.data[o + 2] = c[2];
      img.data[o + 3] = 255;
    }
  }
  lctx.putImageData(img, 0, 0);
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(low, 0, 0, W, H);
  ctx.scale(MAP_SCALE, MAP_SCALE);
  for (const lot of city.lots) {
    if (lot.kind === 'park' || lot.kind === 'lawn') ctx.fillStyle = 'rgba(80,150,80,0.6)';
    else if (lot.kind === 'runway') ctx.fillStyle = '#4a4c52';
    else if (lot.kind === 'apron' || lot.kind === 'parking') ctx.fillStyle = 'rgba(70,72,80,0.5)';
    else continue;
    ctx.fillRect(lot.x0, lot.y0, lot.x1 - lot.x0, lot.y1 - lot.y0);
  }
  ctx.fillStyle = 'rgba(30,26,46,0.45)';
  for (const b of city.buildings) ctx.fillRect(b.x0, b.y0, b.x1 - b.x0, b.y1 - b.y0);
  for (const r of city.roads) {
    const major = r.lanes > 1 || r.kind === 'causeway';
    ctx.fillStyle = major ? '#ffe2a0' : '#ece6da';
    const w = Math.max(r.hw * 2, (major ? 3 : 2.2) / MAP_SCALE);
    if (r.vertical) ctx.fillRect(r.x0 - w / 2, r.y0 - w / 2, w, r.y1 - r.y0 + w);
    else ctx.fillRect(r.x0 - w / 2, r.y0 - w / 2, r.x1 - r.x0 + w, w);
  }
  mapCache = { city, canvas };
  return canvas;
}

function blip(ctx, x, y, r, color, ring = '#0a0618') {
  ctx.fillStyle = ring;
  ctx.beginPath();
  ctx.arc(x, y, r + 1.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

/** Draw the radar centred at (cx, cy) with radius R. */
export function drawMinimap(ctx, game, cx, cy, R) {
  const city = game.city;
  const map = buildMapCanvas(city);
  const pl = game.player;
  const focus = pl.vehicle ?? pl;
  const range = pl.vehicle ? 980 : 600;
  const m = R / range;
  const rot = pl.vehicle ? -pl.vehicle.angle - Math.PI / 2 : 0;
  const t = game.t;
  ctx.save();
  // Rim and backdrop.
  ctx.fillStyle = 'rgba(10,6,24,0.75)';
  ctx.beginPath();
  ctx.arc(cx, cy, R + 9, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.clip();
  ctx.translate(cx, cy);
  ctx.rotate(rot);
  ctx.scale(m, m);
  ctx.translate(-focus.x, -focus.y);
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(map, 0, 0, city.width, city.height);
  const w = game.wanted;
  if (w.level > 0) {
    const flash = Math.floor(t * 3) % 2 === 0;
    ctx.fillStyle = flash ? 'rgba(255,40,70,0.22)' : 'rgba(40,90,255,0.22)';
    ctx.strokeStyle = flash ? 'rgba(255,60,90,0.95)' : 'rgba(70,130,255,0.95)';
    ctx.lineWidth = 3 / m;
    ctx.beginPath();
    ctx.arc(w.zoneX, w.zoneY, w.zoneR, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
  // Blips (screen space so they stay round and readable).
  const toScreen = (x, y) => {
    const dx = (x - focus.x) * m;
    const dy = (y - focus.y) * m;
    return { x: cx + dx * Math.cos(rot) - dy * Math.sin(rot), y: cy + dx * Math.sin(rot) + dy * Math.cos(rot), d: Math.hypot(dx, dy) };
  };
  const clampEdge = (p, margin) => {
    if (p.d <= R - margin) return p;
    const k = (R - margin) / p.d;
    return { x: cx + (p.x - cx) * k, y: cy + (p.y - cy) * k, d: R, edge: true };
  };
  for (const a of activityPoints(game)) {
    const p = toScreen(a.x, a.y);
    if (p.d < R - 8) drawIcon(ctx, a.icon, p.x, p.y, 7, a.color);
  }
  for (const tape of city.collectibles) {
    if (game.economy.tapes.includes(tape.id)) continue;
    const p = toScreen(tape.x, tape.y);
    if (p.d < R - 4 && p.d < R * 0.6) blip(ctx, p.x, p.y, 2.5, '#ff7eb6');
  }
  for (const v of game.vehicles) {
    if (v.model !== 'police' || v.wrecked) continue;
    const p = toScreen(v.x, v.y);
    if (p.d < R - 4) blip(ctx, p.x, p.y, 4, Math.floor(t * 6 + v.id) % 2 ? '#ff3b5c' : '#3b7bff');
  }
  for (const ped of game.peds) {
    if (ped.dead || !ped.hostile) continue;
    const p = toScreen(ped.x, ped.y);
    if (p.d < R - 4) blip(ctx, p.x, p.y, 3, ped.team === 'police' ? '#6aa0ff' : '#ff4d4d');
  }
  if (game.heli) {
    const p = toScreen(game.heli.x, game.heli.y);
    if (p.d < R - 4) drawIcon(ctx, 'H', p.x, p.y, 6, '#6aa0ff');
  }
  for (const mk of missionMarkers(game)) {
    if (mk.small) continue;
    const p = clampEdge(toScreen(mk.x, mk.y), 8);
    if (mk.kind === 'contact') drawIcon(ctx, mk.letter, p.x, p.y, 9, mk.color);
    else blip(ctx, p.x, p.y, mk.kind === 'checkpoint2' ? 4 : 6, mk.color);
  }
  if (game.activity && game.activity.kind === 'taxi') {
    const p = clampEdge(toScreen(game.activity.x, game.activity.y), 8);
    blip(ctx, p.x, p.y, 6, '#ffd166');
  }
  // Player arrow.
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(pl.vehicle ? -Math.PI / 2 : pl.angle);
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#0a0618';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(9, 0);
  ctx.lineTo(-6, -6);
  ctx.lineTo(-3, 0);
  ctx.lineTo(-6, 6);
  ctx.closePath();
  ctx.stroke();
  ctx.fill();
  ctx.restore();
  // North marker on the rim.
  const n = { x: cx + Math.cos(rot - Math.PI / 2) * R, y: cy + Math.sin(rot - Math.PI / 2) * R };
  drawIcon(ctx, 'N', n.x, n.y, 8, '#f4f1de');
  // Health (left) and armour (right) arcs.
  ctx.lineCap = 'round';
  ctx.lineWidth = 6;
  ctx.strokeStyle = 'rgba(255,255,255,0.12)';
  ctx.beginPath();
  ctx.arc(cx, cy, R + 4, Math.PI * 0.6, Math.PI * 1.4);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy, R + 4, Math.PI * 1.6, Math.PI * 2.4);
  ctx.stroke();
  const hp = Math.max(0, pl.hp) / 100;
  ctx.strokeStyle = hp < 0.3 && Math.floor(t * 4) % 2 ? '#ff4d4d' : '#5cf08a';
  ctx.beginPath();
  ctx.arc(cx, cy, R + 4, Math.PI * 1.4 - Math.PI * 0.8 * hp, Math.PI * 1.4);
  ctx.stroke();
  if (pl.armor > 0) {
    ctx.strokeStyle = '#5ab4ff';
    ctx.beginPath();
    ctx.arc(cx, cy, R + 4, Math.PI * 1.6, Math.PI * 1.6 + Math.PI * 0.8 * (pl.armor / 100));
    ctx.stroke();
  }
  ctx.lineCap = 'butt';
  // Respect badge.
  const rl = respectLevel(game.economy.xp);
  const bx = cx + R * 0.86;
  const by = cy - R * 0.86;
  ctx.fillStyle = '#1a1030';
  ctx.beginPath();
  ctx.arc(bx, by, 17, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.15)';
  ctx.lineWidth = 4;
  ctx.stroke();
  ctx.strokeStyle = '#ffd166';
  ctx.beginPath();
  ctx.arc(bx, by, 17, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * rl.ratio);
  ctx.stroke();
  ctx.fillStyle = '#ffd166';
  ctx.font = `900 15px ${DISPLAY}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(rl.level), bx, by + 1);
  ctx.font = `800 9px ${FONT}`;
  ctx.fillText('RESPECT', bx + 30, by - 12);
}
