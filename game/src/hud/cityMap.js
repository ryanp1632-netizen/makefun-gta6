// The full-screen city map (M): every district named in its own colour, landmarks and activities
// as icons with a legend, the current job and Sunset Tapes, police and the player, plus the
// story chapter list and progress totals.
import { buildMapCanvas } from './minimap.js';
import { DISTRICTS } from '../world/districts.js';
import { MISSIONS, CAST } from '../missions/storyMissions.js';
import { missionMarkers, nextMission } from '../missions/missionRunner.js';
import { activityPoints } from '../missions/sideActivities.js';
import { respectLevel } from '../progression/economy.js';
import { drawPortrait } from '../ui/portraits.js';
import { ACCENT, DISPLAY, FONT, drawIcon, outlined, panel, text } from '../ui/uiKit.js';
import { formatCash } from '../core/math.js';

const LABELS = {
  heights: [2250, 1080], mercado: [1480, 2470], neon: [2700, 2050], marina: [3560, 3020], docks: [2250, 3820],
  deco: [4830, 2050], strand: [5470, 1350], field: [5250, 4420], isle: [4200, 880],
};

const CROP = { x0: 560, y0: 220, x1: 6220, y1: 4660 };

/** Draw the chapter list panel (also used by the results screen). */
export function drawChapterList(ctx, game, x, y, w, highlight = null) {
  const done = game.missions.completed;
  const next = nextMission(game);
  const rowH = 58;
  panel(ctx, x, y, w, 52 + MISSIONS.length * rowH, ACCENT.sun, 0.8);
  outlined(ctx, 'STORY', x + 18, y + 32, ACCENT.sun, 18, 900, 'left', DISPLAY);
  text(ctx, `${done.length} / ${MISSIONS.length} jobs`, x + w - 16, y + 31, 'rgba(244,241,222,0.6)', 13, 700, 'right');
  MISSIONS.forEach((m, i) => {
    const ry = y + 46 + i * rowH;
    const isDone = done.includes(m.id);
    const isNext = next && next.id === m.id;
    if (isNext || m.id === highlight) {
      ctx.fillStyle = 'rgba(255,209,102,0.12)';
      ctx.fillRect(x + 6, ry, w - 12, rowH - 6);
    }
    ctx.globalAlpha = isDone || isNext ? 1 : 0.45;
    drawPortrait(ctx, m.giver, x + 14, ry + 5, 42);
    outlined(ctx, `${m.chapter}. ${m.title.toUpperCase()}`, x + 66, ry + 22, isDone ? ACCENT.teal : isNext ? ACCENT.sun : '#f4f1de', 15, 800);
    text(ctx, isDone ? 'Complete' : isNext ? `Next - see ${CAST[m.giver].name}` : 'Locked', x + 66, ry + 41, 'rgba(244,241,222,0.7)', 12, 600);
    if (isDone) text(ctx, formatCash(m.payout), x + w - 16, ry + 22, ACCENT.cash, 13, 800, 'right');
    ctx.globalAlpha = 1;
  });
}

export function drawCityMap(ctx, game, w, h) {
  const city = game.city;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const bg = ctx.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0, '#120c26');
  bg.addColorStop(1, '#0a0716');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);
  const leftW = 270;
  const rightW = 232;
  const areaX = leftW + 30;
  const areaW = w - leftW - rightW - 56;
  const areaY = 86;
  const areaH = h - areaY - 56;
  const s = Math.min(areaW / (CROP.x1 - CROP.x0), areaH / (CROP.y1 - CROP.y0));
  const mw = (CROP.x1 - CROP.x0) * s;
  const mh = (CROP.y1 - CROP.y0) * s;
  const mx = areaX + (areaW - mw) / 2;
  const my = areaY + (areaH - mh) / 2;
  const toMap = (x, y) => ({ x: mx + (x - CROP.x0) * s, y: my + (y - CROP.y0) * s });
  outlined(ctx, 'HALCYON KEYS', 26, 52, ACCENT.coral, 30, 900, 'left', DISPLAY);
  const titleW = ctx.measureText('HALCYON KEYS').width;
  outlined(ctx, 'CITY MAP', 26 + titleW + 16, 52, '#f4f1de', 20, 800, 'left');
  text(ctx, 'M / Esc  close', w - 26, 50, 'rgba(244,241,222,0.6)', 14, 700, 'right');
  // The map itself.
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
  ctx.strokeStyle = 'rgba(255,255,255,0.2)';
  ctx.lineWidth = 1;
  ctx.strokeRect(mx + 0.5, my + 0.5, mw - 1, mh - 1);
  // Grid ticks.
  ctx.fillStyle = 'rgba(244,241,222,0.35)';
  ctx.font = `700 10px ${FONT}`;
  for (let i = 0; i < 6; i += 1) {
    ctx.fillText(String.fromCharCode(65 + i), mx + (mw * (i + 0.5)) / 6, my - 6);
    ctx.fillText(String(i + 1), mx - 12, my + (mh * (i + 0.5)) / 6);
  }
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
  for (const tape of city.collectibles) {
    if (game.economy.tapes.includes(tape.id)) continue;
    const p = toMap(tape.x, tape.y);
    drawIcon(ctx, 'tape', p.x, p.y, 5.5, '#ff7eb6');
  }
  for (const a of activityPoints(game)) {
    const p = toMap(a.x, a.y);
    drawIcon(ctx, a.icon, p.x, p.y, 9, a.color);
  }
  for (const mk of missionMarkers(game)) {
    if (mk.small) continue;
    const p = toMap(mk.x, mk.y);
    if (mk.kind === 'contact') {
      drawIcon(ctx, mk.letter, p.x, p.y, 12, mk.color);
      outlined(ctx, mk.label.toUpperCase(), p.x, p.y - 17, mk.color, 12, 800, 'center');
    } else drawIcon(ctx, '!', p.x, p.y, 10, mk.color);
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
  for (const [id, [x, y]] of Object.entries(LABELS)) {
    const d = DISTRICTS[id];
    const p = toMap(x, y);
    ctx.font = `900 15px ${FONT}`;
    const tw = ctx.measureText(d.name.toUpperCase()).width + 16;
    ctx.fillStyle = 'rgba(10,6,24,0.62)';
    ctx.beginPath();
    ctx.roundRect(p.x - tw / 2, p.y - 15, tw, 21, 10);
    ctx.fill();
    outlined(ctx, d.name.toUpperCase(), p.x, p.y + 1, d.accent, 15, 900, 'center', FONT, 'rgba(10,6,24,0.95)');
  }
  const pl = game.player;
  const f = pl.vehicle ?? pl;
  const pp = toMap(f.x, f.y);
  ctx.save();
  ctx.translate(pp.x, pp.y);
  ctx.rotate(pl.vehicle ? pl.vehicle.angle : pl.angle);
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
  // Chapters (left) and legend (right).
  drawChapterList(ctx, game, 20, 86, leftW - 10);
  const lx = w - rightW - 18;
  const legend = [
    ['you', '#ffffff', 'You are here'], ['P', ACCENT.sun, 'Story contact'], ['!', ACCENT.sun, 'Job objective'], ['house', '#5ad8ff', 'Safehouse'],
    ['gun', '#ff6a4f', 'Weapons'], ['spray', '#7dff6a', 'Respray (clears heat)'], ['flag', '#ff7eb6', 'Street race'], ['star', '#3ee6ff', 'Property'],
    ['cross', '#ff5a6e', 'Hospital'], ['badge', '#5aa0ff', 'Police'], ['tape', '#ff7eb6', 'Sunset Tape'],
  ];
  panel(ctx, lx, 86, rightW, 66 + legend.length * 30, ACCENT.teal, 0.8);
  outlined(ctx, 'LEGEND', lx + 18, 118, ACCENT.teal, 18, 900, 'left', DISPLAY);
  legend.forEach(([icon, color, label], i) => {
    const y = 148 + i * 30;
    if (icon === 'you') {
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.moveTo(lx + 34, y);
      ctx.lineTo(lx + 22, y - 7);
      ctx.lineTo(lx + 25, y);
      ctx.lineTo(lx + 22, y + 7);
      ctx.fill();
    } else drawIcon(ctx, icon, lx + 28, y, 10, color);
    text(ctx, label, lx + 48, y + 5, '#f4f1de', 14, 600);
  });
  const rl = respectLevel(game.economy.xp);
  const sy = 86 + 66 + legend.length * 30 + 14;
  panel(ctx, lx, sy, rightW, 116, ACCENT.pink, 0.8);
  text(ctx, `Cash  ${formatCash(game.economy.cash)}`, lx + 18, sy + 30, ACCENT.cash, 15, 800);
  text(ctx, `Respect level ${rl.level}`, lx + 18, sy + 54, ACCENT.sun, 15, 800);
  text(ctx, `Sunset Tapes  ${game.economy.tapes.length} / ${city.collectibles.length}`, lx + 18, sy + 78, '#ff7eb6', 15, 800);
  text(ctx, `Properties  ${Object.values(game.economy.properties).filter(Boolean).length} / 2`, lx + 18, sy + 102, '#3ee6ff', 15, 800);
}
