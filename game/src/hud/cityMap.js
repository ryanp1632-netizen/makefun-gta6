// The city map and its companions, used by the pause screen's MAP tab (M or Esc in play): every
// district named in its own colour, story venues and activities as icons, the GPS route to the
// current objective, Sunset Tapes, the police search zone and units, and the player; plus the
// legend, the story chapter list (also on the JOB COMPLETE screen) and the current job card.
import { buildMapCanvas } from './minimap.js';
import { DISTRICTS } from '../world/districts.js';
import { MISSIONS, CAST } from '../missions/storyMissions.js';
import { missionMarkers, nextMission, stageProgress } from '../missions/missionRunner.js';
import { activityPoints } from '../missions/sideActivities.js';
import { drawPortrait } from '../ui/portraits.js';
import { ACCENT, DISPLAY, FONT, drawIcon, outlined, panel, text, wrap } from '../ui/uiKit.js';
import { gpsRoute, strokeRoute } from './gpsRoute.js';
import { formatCash } from '../core/math.js';

const LABELS = {
  heights: [2250, 1080], mercado: [1480, 2470], neon: [2700, 2050], marina: [3560, 3020], docks: [2250, 3820],
  deco: [4830, 2050], strand: [5470, 1350], field: [5250, 4420], isle: [4200, 880],
};

const CROP = { x0: 600, y0: 240, x1: 6200, y1: 4640 };

/** Story venues shown on the map: [poi, icon, name, colour]. */
const LANDMARKS = [
  ['club', 'note', 'CLUB VOLTAGE', '#ff4fd8'], ['bank', '$', 'HALCYON TRUST', '#ffe14f'], ['hotel', 'H', 'HOTEL CORALIE', '#ff7eb6'],
  ['warehouse', 'anchor', 'PIER 9', '#ffcf3f'], ['mansion', 'crown', 'GRIEVE ESTATE', '#ff6b6b'], ['hangar', 'plane', 'HANGAR 1', '#9be564'],
  ['market', 'basket', '', '#ffb347'],
];

/** What the map's icons mean: [icon, colour, label]. */
export const LEGEND = [
  ['you', '#ffffff', 'You'], ['P', ACCENT.sun, 'Story contact'], ['!', ACCENT.sun, 'Objective'], ['house', '#5ad8ff', 'Safehouse'],
  ['gun', '#ff6a4f', 'Weapons'], ['spray', '#7dff6a', 'Respray'], ['flag', '#ff7eb6', 'Street race'], ['star', '#3ee6ff', 'Property'],
  ['cross', '#ff5a6e', 'Hospital'], ['badge', '#5aa0ff', 'Police'], ['tape', '#ff7eb6', 'Sunset Tape'], ['route', '#ffd166', 'GPS route'],
];

function playerArrow(ctx, x, y, angle, size = 1) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.scale(size, size);
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#0a0618';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(11, 0);
  ctx.lineTo(-7, -7);
  ctx.lineTo(-3, 0);
  ctx.lineTo(-7, 7);
  ctx.closePath();
  ctx.stroke();
  ctx.fill();
  ctx.restore();
}

/** The legend as a panel of `cols` columns; returns its height. */
export function drawLegend(ctx, x, y, w, cols = 2, rowH = 25) {
  const rows = Math.ceil(LEGEND.length / cols);
  const h = 44 + rows * rowH;
  panel(ctx, x, y, w, h, ACCENT.teal, 0.82);
  outlined(ctx, 'LEGEND', x + 18, y + 28, ACCENT.teal, 15, 900, 'left', DISPLAY);
  const cw = (w - 24) / cols;
  LEGEND.forEach(([icon, color, label], i) => {
    const cx = x + 14 + (i % cols) * cw;
    const cy = y + 50 + Math.floor(i / cols) * rowH;
    if (icon === 'you') playerArrow(ctx, cx + 12, cy, 0, 0.85);
    else if (icon === 'route') {
      ctx.fillStyle = color;
      ctx.fillRect(cx + 2, cy - 2.5, 20, 5);
    } else drawIcon(ctx, icon, cx + 12, cy, 8.5, color);
    text(ctx, label, cx + 28, cy + 5, '#f4f1de', 13, 700);
  });
  return h;
}

/**
 * The map fitted into (x, y, w, h): water, districts and roads, the police zone, tapes,
 * activities, mission markers, named venues, the GPS route, police units, district names and the
 * player. Returns the rectangle the map image actually covers.
 */
export function drawMapView(ctx, game, x, y, w, h) {
  const city = game.city;
  const s = Math.min(w / (CROP.x1 - CROP.x0), h / (CROP.y1 - CROP.y0));
  const mw = (CROP.x1 - CROP.x0) * s;
  const mh = (CROP.y1 - CROP.y0) * s;
  const mx = x + (w - mw) / 2;
  const my = y + (h - mh) / 2;
  const toMap = (px, py) => ({ x: mx + (px - CROP.x0) * s, y: my + (py - CROP.y0) * s });
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.6)';
  ctx.shadowBlur = 24;
  ctx.fillStyle = '#123c52';
  ctx.fillRect(mx, my, mw, mh);
  ctx.restore();
  const map = buildMapCanvas(city);
  const ms = map.width / city.width;
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(map, CROP.x0 * ms, CROP.y0 * ms, (CROP.x1 - CROP.x0) * ms, (CROP.y1 - CROP.y0) * ms, mx, my, mw, mh);
  ctx.strokeStyle = 'rgba(255,255,255,0.25)';
  ctx.lineWidth = 1;
  ctx.strokeRect(mx + 0.5, my + 0.5, mw - 1, mh - 1);
  // Grid references along the edges.
  ctx.fillStyle = 'rgba(244,241,222,0.45)';
  ctx.font = `700 10px ${FONT}`;
  ctx.textAlign = 'center';
  for (let i = 0; i < 6; i += 1) {
    ctx.fillText(String.fromCharCode(65 + i), mx + (mw * (i + 0.5)) / 6, my + 12);
    ctx.fillText(String(i + 1), mx + 8, my + (mh * (i + 0.5)) / 6);
  }
  ctx.textAlign = 'left';
  const w2 = game.wanted;
  if (w2.level > 0) {
    const p = toMap(w2.zoneX, w2.zoneY);
    ctx.fillStyle = 'rgba(255,40,70,0.2)';
    ctx.strokeStyle = 'rgba(255,60,90,0.9)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(p.x, p.y, w2.zoneR * s, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  // The GPS route under the icons.
  const route = gpsRoute(game);
  if (route) {
    ctx.save();
    ctx.translate(mx - CROP.x0 * s, my - CROP.y0 * s);
    ctx.scale(s, s);
    strokeRoute(ctx, route, 5 / s);
    ctx.restore();
  }
  for (const tape of city.collectibles) {
    if (game.economy.tapes.includes(tape.id)) continue;
    const p = toMap(tape.x, tape.y);
    drawIcon(ctx, 'tape', p.x, p.y, 5.5, '#ff7eb6');
  }
  for (const a of activityPoints(game)) {
    const p = toMap(a.x, a.y);
    drawIcon(ctx, a.icon, p.x, p.y, 9, a.color);
  }
  for (const [key, icon, label, color] of LANDMARKS) {
    const poi = city.pois[key];
    if (!poi) continue;
    const p = toMap(poi.x, poi.y);
    drawIcon(ctx, icon, p.x, p.y, 9.5, color);
    if (label) outlined(ctx, label, p.x, p.y + 21, color, 10, 900, 'center');
  }
  for (const mk of missionMarkers(game)) {
    if (mk.small || mk.kind === 'checkpoint2') continue;
    const p = toMap(mk.x, mk.y);
    if (mk.kind === 'contact') {
      drawIcon(ctx, mk.letter, p.x, p.y, 12, mk.color);
      outlined(ctx, mk.label.toUpperCase(), p.x, p.y - 17, mk.color, 12, 800, 'center');
    } else drawIcon(ctx, '!', p.x, p.y, 11, mk.color);
  }
  for (const v of game.vehicles) {
    if (v.model !== 'police' || v.wrecked || v.ai === 'parked') continue;
    const p = toMap(v.x, v.y);
    ctx.fillStyle = Math.floor(game.t * 6 + v.id) % 2 ? '#ff3b5c' : '#3b7bff';
    ctx.beginPath();
    ctx.arc(p.x, p.y, 3.5, 0, Math.PI * 2);
    ctx.fill();
  }
  // District names last, on dark pills, so no icon hides them.
  const big = mw > 560;
  for (const [id, [lx, ly]] of Object.entries(LABELS)) {
    const d = DISTRICTS[id];
    const p = toMap(lx, ly);
    const size = big ? 15 : 13;
    ctx.font = `900 ${size}px ${FONT}`;
    const tw = ctx.measureText(d.name.toUpperCase()).width + 16;
    ctx.fillStyle = 'rgba(10,6,24,0.66)';
    ctx.beginPath();
    ctx.roundRect(p.x - tw / 2, p.y - size, tw, size + 6, 10);
    ctx.fill();
    outlined(ctx, d.name.toUpperCase(), p.x, p.y + 1, d.accent, size, 900, 'center', FONT, 'rgba(10,6,24,0.95)');
  }
  const pl = game.player;
  const f = pl.vehicle ?? pl;
  const pp = toMap(f.x, f.y);
  // A pulsing ring so "you are here" reads at any size.
  ctx.strokeStyle = 'rgba(255,255,255,0.85)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(pp.x, pp.y, 15 + Math.sin(game.t * 4) * 2, 0, Math.PI * 2);
  ctx.stroke();
  playerArrow(ctx, pp.x, pp.y, pl.vehicle ? pl.vehicle.angle : pl.angle, 1.25);
  return { x: mx, y: my, w: mw, h: mh, route };
}

/** The active job (or the next one) with its stage bar and the route length; returns its height. */
export function drawJobCard(ctx, game, x, y, w) {
  const s = game.missions;
  const m = s.active ?? nextMission(game);
  if (!m) return 0;
  const prog = s.active ? stageProgress(game) : null;
  const route = gpsRoute(game);
  const h = 138;
  panel(ctx, x, y, w, h, ACCENT.coral, 0.85);
  outlined(ctx, s.active ? 'CURRENT JOB' : 'NEXT JOB', x + 18, y + 26, ACCENT.coral, 14, 900, 'left', DISPLAY);
  text(ctx, `CH ${m.chapter}`, x + w - 16, y + 25, 'rgba(244,241,222,0.6)', 12, 900, 'right');
  outlined(ctx, m.title.toUpperCase(), x + 18, y + 50, '#ffffff', 18, 900);
  ctx.font = `700 13px ${FONT}`;
  const obj = s.active ? s.objective || m.blurb : `See ${CAST[m.giver].name}`;
  wrap(ctx, obj, w - 36).slice(0, 2).forEach((ln, i) => text(ctx, ln, x + 18, y + 71 + i * 17, 'rgba(244,241,222,0.85)', 13, 700));
  if (prog) {
    const n = prog.total;
    const bw = w - 36;
    for (let i = 0; i < n; i += 1) {
      ctx.fillStyle = i < prog.stage - 1 ? ACCENT.sun : i === prog.stage - 1 ? '#ffffff' : 'rgba(255,255,255,0.15)';
      ctx.fillRect(x + 18 + (i * bw) / n, y + 106, bw / n - 4, 8);
    }
    text(ctx, `STAGE ${prog.stage}/${n}`, x + 18, y + 130, ACCENT.sun, 12, 900);
  }
  if (route) text(ctx, `GPS  ${Math.round(route.length / 9)} m`, x + w - 16, y + 130, route.color, 13, 900, 'right');
  return h;
}

/**
 * The chapter list panel (pause screen, JOB COMPLETE screen): portrait, title, status and payout
 * for each job. Returns its height.
 */
export function drawChapterList(ctx, game, x, y, w, highlight = null, rowH = 58) {
  const done = game.missions.completed;
  const next = nextMission(game);
  const compact = rowH < 50;
  const pr = rowH - (compact ? 10 : 16);
  const h = 52 + MISSIONS.length * rowH;
  panel(ctx, x, y, w, h, ACCENT.sun, 0.82);
  outlined(ctx, 'STORY', x + 18, y + 32, ACCENT.sun, 18, 900, 'left', DISPLAY);
  text(ctx, `${done.length} / ${MISSIONS.length} jobs`, x + w - 16, y + 31, 'rgba(244,241,222,0.65)', 13, 800, 'right');
  MISSIONS.forEach((m, i) => {
    const ry = y + 46 + i * rowH;
    const isDone = done.includes(m.id);
    const isNext = next && next.id === m.id;
    if (isNext || m.id === highlight) {
      ctx.fillStyle = 'rgba(255,209,102,0.14)';
      ctx.fillRect(x + 6, ry, w - 12, rowH - 4);
    }
    ctx.globalAlpha = isDone || isNext ? 1 : 0.5;
    drawPortrait(ctx, m.giver, x + 14, ry + (rowH - 4 - pr) / 2, pr);
    const tx = x + 22 + pr;
    outlined(ctx, `${m.chapter}. ${m.title.toUpperCase()}`, tx, ry + (compact ? 18 : 22), isDone ? ACCENT.teal : isNext ? ACCENT.sun : '#f4f1de', compact ? 14 : 15, 800);
    const live = game.missions.active && game.missions.active.id === m.id;
    text(ctx, isDone ? 'Complete' : live ? 'In progress' : isNext ? `Next - see ${CAST[m.giver].name}` : 'Locked', tx, ry + (compact ? 35 : 41), live ? ACCENT.coral : 'rgba(244,241,222,0.72)', 12, live ? 800 : 600);
    text(ctx, formatCash(m.payout), x + w - 14, ry + (compact ? 18 : 22), isDone ? ACCENT.cash : 'rgba(244,241,222,0.45)', 13, 800, 'right');
    if (isDone) text(ctx, '✓', x + w - 14, ry + (compact ? 35 : 41), ACCENT.teal, 14, 900, 'right');
    ctx.globalAlpha = 1;
  });
  return h;
}
