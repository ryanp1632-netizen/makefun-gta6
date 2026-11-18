// The pause screen (Esc / P, or M straight to the map): a header with the game's name, four tabs
// and how much of the game is complete, a footer of key hints (resume, switch tab, controls,
// abandon the job, quit), and the tabs themselves:
//   MAP       the city map with the GPS route, every activity and venue, with progress, respect
//             and the current job on the left and the legend and story chapters on the right;
//   STATS     completion broken down by part, lifetime statistics and the respect rank;
//   STORY     the seven chapters with their contacts and payouts, and the cast;
//   SETTINGS  volumes and camera shake (adjusted in place) and the controls at a glance.
import { ACCENT, DISPLAY, FONT, chip, drawIcon, meter, outlined, panel, roundRect, text, wrap } from './uiKit.js';
import { drawPortrait } from './portraits.js';
import { drawChapterList, drawJobCard, drawLegend, drawMapView } from '../hud/cityMap.js';
import { completionParts, completionPercent } from '../progression/completion.js';
import { LEVELS, RANKS, respectLevel, unlocksAt } from '../progression/economy.js';
import { CAST, MISSIONS, RACE_ROUTES, STORY_HOOK } from '../missions/storyMissions.js';
import { nextMission } from '../missions/missionRunner.js';
import { SETTING_ROWS } from '../save/settings.js';
import { toKmh } from '../vehicles/vehicleModels.js';
import { formatCash, formatClock } from '../core/math.js';

export const PAUSE_TABS = ['MAP', 'STATS', 'STORY', 'SETTINGS'];

const INK = '#f4f1de';
const DIM = 'rgba(244,241,222,0.62)';

const km = (units) => `${(units / 9000).toFixed(1)} km`;

function playTime(game) {
  const s = (game.playtime ?? 0) + game.t;
  const hrs = Math.floor(s / 3600);
  const min = Math.floor((s % 3600) / 60);
  return hrs > 0 ? `${hrs} h ${String(min).padStart(2, '0')} m` : `${min} min`;
}

/** The headline numbers the MAP and STATS tabs share: [icon, label, value, colour]. */
function keyStats(game) {
  const eco = game.economy;
  const st = game.stats;
  return [
    ['P', 'STORY JOBS', `${game.missions.completed.length}/${MISSIONS.length}`, ACCENT.sun],
    ['$', 'CASH', formatCash(eco.cash), ACCENT.cash],
    ['tape', 'SUNSET TAPES', `${eco.tapes.length}/${game.city.collectibles.length}`, '#ff7eb6'],
    ['flag', 'RACES WON', `${st.racesWon}`, '#ff4fd8'],
    ['car', 'KEYCAB FARES', `${st.fares}`, '#ffd23f'],
    ['star', 'PROPERTIES', `${Object.values(eco.properties).filter(Boolean).length}/${Object.keys(eco.properties).length}`, '#3ee6ff'],
    ['badge', 'COPS ESCAPED', `${st.copsEscaped}`, '#5aa0ff'],
    ['route', 'DISTANCE DRIVEN', km(st.driven ?? 0), ACCENT.coral],
  ];
}

/** One stat tile: icon, small label, big value. */
function tile(ctx, x, y, w, h, icon, label, value, color, big = 22) {
  roundRect(ctx, x, y, w, h, 8);
  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  ctx.fill();
  ctx.fillStyle = color;
  ctx.fillRect(x, y + 8, 3, h - 16);
  if (icon === 'route') {
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x + 12, y + 22);
    ctx.lineTo(x + 18, y + 12);
    ctx.lineTo(x + 24, y + 18);
    ctx.lineTo(x + 30, y + 9);
    ctx.stroke();
  } else drawIcon(ctx, icon, x + 21, y + 17, 9, color);
  text(ctx, label, x + 36, y + 21, DIM, 11, 900);
  outlined(ctx, value, x + 12, y + h - 11, '#ffffff', big, 900, 'left', FONT);
}

/** Respect: level, rank title, the bar to the next level and what it unlocks. Returns height. */
function drawRank(ctx, game, x, y, w) {
  const rl = respectLevel(game.economy.xp);
  const h = 112;
  panel(ctx, x, y, w, h, ACCENT.sun, 0.84);
  text(ctx, 'RESPECT', x + 18, y + 24, DIM, 12, 900);
  outlined(ctx, `LVL ${rl.level}`, x + 18, y + 52, ACCENT.sun, 24, 900, 'left', DISPLAY);
  ctx.font = `900 24px ${DISPLAY}`;
  const lw = ctx.measureText(`LVL ${rl.level}`).width;
  outlined(ctx, RANKS[rl.level - 1].toUpperCase(), x + 30 + lw, y + 50, '#ffffff', 17, 900);
  meter(ctx, x + 18, y + 62, w - 36, 12, rl.ratio, ACCENT.sun);
  const maxed = rl.level >= LEVELS.length;
  text(ctx, maxed ? 'MAX RANK' : `${rl.into.toLocaleString('en-US')} / ${rl.need.toLocaleString('en-US')}`, x + w - 18, y + 24, DIM, 12, 800, 'right');
  const un = maxed ? [] : unlocksAt(rl.level + 1);
  const nextLine = maxed ? 'The Keys are yours' : `NEXT  ${RANKS[rl.level].toUpperCase()}${un.length ? `  ·  ${un.join(', ')}` : ''}`;
  ctx.font = `800 13px ${FONT}`;
  let ln = nextLine;
  while (ctx.measureText(ln).width > w - 36 && ln.length > 6) ln = `${ln.slice(0, -2)}…`;
  text(ctx, ln, x + 18, y + 96, ACCENT.coral, 13, 800);
  return h;
}

function header(ctx, game, w, tab) {
  const g = ctx.createLinearGradient(0, 0, 0, 78);
  g.addColorStop(0, 'rgba(14,9,32,0.96)');
  g.addColorStop(1, 'rgba(14,9,32,0.78)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, 76);
  ctx.fillStyle = ACCENT.coral;
  ctx.fillRect(0, 75, w, 2);
  outlined(ctx, 'HALCYON KEYS', 24, 44, ACCENT.coral, 28, 900, 'left', DISPLAY);
  text(ctx, `PAUSED  ·  DAY ${game.clock.day}  ${formatClock(game.clock)}  ·  ${playTime(game)} played`, 26, 64, DIM, 12, 800);
  // Tabs, with Q and E either side.
  const tw = Math.max(96, Math.min(128, (w - 720) / 4));
  const total = PAUSE_TABS.length * tw + (PAUSE_TABS.length - 1) * 8;
  const tx0 = Math.max(316, w / 2 - total / 2 - 40);
  chip(ctx, 'Q', tx0 - 34, 26, 'rgba(255,255,255,0.18)', INK, 13, 24);
  PAUSE_TABS.forEach((name, i) => {
    const x = tx0 + i * (tw + 8);
    const on = PAUSE_TABS[tab] === name;
    roundRect(ctx, x, 16, tw, 44, 10);
    ctx.fillStyle = on ? ACCENT.coral : 'rgba(255,255,255,0.07)';
    ctx.fill();
    ctx.strokeStyle = on ? '#ffffff' : 'rgba(255,255,255,0.18)';
    ctx.lineWidth = on ? 2 : 1;
    ctx.stroke();
    text(ctx, name, x + tw / 2, 45, on ? '#1a1030' : INK, 17, 900, 'center');
  });
  chip(ctx, 'E', tx0 + total + 10, 26, 'rgba(255,255,255,0.18)', INK, 13, 24);
  // Completion headline.
  const pct = completionPercent(game);
  const right = w - 24;
  outlined(ctx, `${pct}%`, right, 52, ACCENT.sun, 44, 900, 'right', DISPLAY, 'rgba(10,6,24,0.95)');
  ctx.font = `900 44px ${DISPLAY}`;
  const pw = ctx.measureText(`${pct}%`).width;
  text(ctx, 'COMPLETE', right - pw - 12, 34, INK, 15, 900, 'right');
  meter(ctx, right - pw - 120, 44, 108, 8, pct / 100, ACCENT.sun);
}

function footer(ctx, game, w, h, tab) {
  ctx.fillStyle = 'rgba(14,9,32,0.9)';
  ctx.fillRect(0, h - 38, w, 38);
  const hints = [['ESC', 'Resume'], ['Q / E', 'Switch tab'], ['C', 'Controls'], ['J', game.missions.active ? 'Abandon job' : 'No job running'], ['X', 'Quit to title']];
  if (PAUSE_TABS[tab] === 'SETTINGS') hints.splice(2, 0, ['↑ ↓ ← →', 'Adjust']);
  let x = 22;
  for (const [k, label] of hints) {
    const cw = chip(ctx, k, x, h - 30, 'rgba(255,255,255,0.16)', INK, 12, 22);
    const dim = k === 'J' && !game.missions.active;
    text(ctx, label, x + cw + 8, h - 14, dim ? 'rgba(244,241,222,0.35)' : INK, 14, 700);
    ctx.font = `700 14px ${FONT}`;
    x += cw + 8 + ctx.measureText(label).width + 26;
  }
  text(ctx, 'Progress saves at the safehouse and after every job', w - 22, h - 14, DIM, 13, 700, 'right');
}

function mapTab(ctx, game, w, h) {
  const top = 90;
  const bottom = h - 48;
  const colW = Math.max(230, Math.min(290, Math.round(w * 0.215)));
  // Left: progress tiles, respect, the current job.
  const lx = 16;
  const stats = keyStats(game);
  const ph = 42 + 4 * 60;
  panel(ctx, lx, top, colW, ph, ACCENT.coral, 0.84);
  outlined(ctx, 'PROGRESS', lx + 18, top + 28, ACCENT.coral, 15, 900, 'left', DISPLAY);
  text(ctx, `${completionPercent(game)}% complete`, lx + colW - 16, top + 27, DIM, 12, 800, 'right');
  const tw = (colW - 36) / 2;
  stats.forEach(([icon, label, value, color], i) => {
    const big = value.length > 8 ? 18 : 22;
    tile(ctx, lx + 14 + (i % 2) * (tw + 8), top + 40 + Math.floor(i / 2) * 60, tw, 54, icon, label, value, color, big);
  });
  let y = top + ph + 10;
  y += drawRank(ctx, game, lx, y, colW) + 10;
  if (bottom - y > 120) drawJobCard(ctx, game, lx, y, colW);
  // Right: legend and the chapters.
  const rx = w - colW - 16;
  const lh = drawLegend(ctx, rx, top, colW, 2, 24);
  const rowH = Math.max(36, Math.min(46, Math.floor((bottom - top - lh - 10 - 52) / MISSIONS.length)));
  drawChapterList(ctx, game, rx, top + lh + 10, colW, null, rowH);
  // The map between them.
  drawMapView(ctx, game, lx + colW + 12, top, w - 2 * colW - 56, bottom - top);
}

function statsTab(ctx, game, w, h) {
  const top = 90;
  const st = game.stats;
  const eco = game.economy;
  // Left: completion ring and its parts.
  const lw = Math.min(400, w * 0.33);
  const lh = h - top - 50;
  panel(ctx, 16, top, lw, lh, ACCENT.sun, 0.86);
  outlined(ctx, 'COMPLETION', 34, top + 30, ACCENT.sun, 16, 900, 'left', DISPLAY);
  const pct = completionPercent(game);
  const cx = 16 + lw / 2;
  const cy = top + 130;
  ctx.lineWidth = 16;
  ctx.strokeStyle = 'rgba(255,255,255,0.1)';
  ctx.beginPath();
  ctx.arc(cx, cy, 78, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = ACCENT.sun;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(cx, cy, 78, -Math.PI / 2, -Math.PI / 2 + (Math.PI * 2 * pct) / 100);
  ctx.stroke();
  ctx.lineCap = 'butt';
  outlined(ctx, `${pct}%`, cx, cy + 16, '#ffffff', 44, 900, 'center', DISPLAY);
  completionParts(game).forEach((p, i) => {
    const y = top + 236 + i * 46;
    text(ctx, p.label, 34, y, INK, 15, 800);
    ctx.font = `800 15px ${FONT}`;
    text(ctx, `worth ${p.weight}%`, 42 + ctx.measureText(p.label).width, y, DIM, 11, 800);
    text(ctx, `${Math.min(p.have, p.total)} / ${p.total}`, 16 + lw - 18, y, ACCENT.sun, 15, 900, 'right');
    meter(ctx, 34, y + 9, lw - 52, 9, p.have / Math.max(1, p.total), p.have >= p.total ? ACCENT.teal : ACCENT.sun);
  });
  // Right: every lifetime stat as tiles, then the rank.
  const gx = 16 + lw + 14;
  const gw = w - gx - 16;
  panel(ctx, gx, top, gw, lh - 124, ACCENT.teal, 0.86);
  outlined(ctx, 'LIFETIME STATS', gx + 18, top + 30, ACCENT.teal, 16, 900, 'left', DISPLAY);
  const acc = st.shots > 0 ? `${Math.round((st.hits / st.shots) * 100)}%` : '-';
  const all = [
    ...keyStats(game),
    ['$', 'TOTAL EARNED', formatCash(eco.earned), ACCENT.cash],
    ['flag', 'RACES RUN', `${st.racesRun}`, '#ff4fd8'],
    ['badge', 'TOP HEAT', `${'★'.repeat(st.maxWanted) || '-'}`, ACCENT.sun],
    ['route', 'ON FOOT', km(Math.max(0, st.distance - (st.driven ?? 0))), '#9be564'],
    ['car', 'TOP SPEED', `${toKmh(st.topSpeed)} km/h`, ACCENT.coral],
    ['gun', 'TAKEDOWNS', `${st.kills}`, '#ff6a4f'],
    ['gun', 'ACCURACY', acc, '#ff6a4f'],
    ['cross', 'CRASHES', `${st.crashes}`, '#ff5a6e'],
    ['!', 'JOBS BLOWN', `${st.jobsFailed}`, '#ff7a7a'],
    ['house', 'GARAGE', `${eco.garage.length} cars`, '#5ad8ff'],
    ['note', 'RACE ROUTES', `${(eco.races ?? []).length}/${Object.keys(RACE_ROUTES).length}`, '#ff7eb6'],
    ['P', 'DAYS IN THE KEYS', `${game.clock.day}`, INK],
  ];
  const cols = gw > 760 ? 4 : 3;
  const cw = (gw - 28 - (cols - 1) * 10) / cols;
  const ch = Math.min(64, (lh - 124 - 60 - (Math.ceil(all.length / cols) - 1) * 8) / Math.ceil(all.length / cols));
  all.forEach(([icon, label, value, color], i) => {
    tile(ctx, gx + 14 + (i % cols) * (cw + 10), top + 48 + Math.floor(i / cols) * (ch + 8), cw, ch, icon, label, value, color, value.length > 9 ? 18 : 22);
  });
  drawRank(ctx, game, gx, top + lh - 112, gw);
}

function storyTab(ctx, game, w, h) {
  const top = 90;
  const lw = Math.min(700, w * 0.56);
  const done = game.missions.completed;
  const next = nextMission(game);
  const rowH = Math.min(84, (h - top - 50 - 60) / MISSIONS.length);
  panel(ctx, 16, top, lw, 60 + MISSIONS.length * rowH, ACCENT.sun, 0.86);
  outlined(ctx, 'THE STORY SO FAR', 34, top + 32, ACCENT.sun, 18, 900, 'left', DISPLAY);
  text(ctx, `${done.length} / ${MISSIONS.length} jobs  ·  ${formatCash(MISSIONS.filter((m) => done.includes(m.id)).reduce((s, m) => s + m.payout, 0))} earned`, 16 + lw - 18, top + 31, DIM, 13, 800, 'right');
  MISSIONS.forEach((m, i) => {
    const y = top + 50 + i * rowH;
    const isDone = done.includes(m.id);
    const live = game.missions.active && game.missions.active.id === m.id;
    const isNext = next && next.id === m.id;
    if (live || isNext) {
      ctx.fillStyle = 'rgba(255,209,102,0.13)';
      ctx.fillRect(22, y, lw - 12, rowH - 6);
    }
    ctx.globalAlpha = isDone || isNext ? 1 : 0.5;
    drawPortrait(ctx, m.giver, 30, y + 4, rowH - 14);
    outlined(ctx, `${m.chapter}. ${m.title.toUpperCase()}`, 30 + rowH, y + 24, isDone ? ACCENT.teal : isNext ? ACCENT.sun : INK, 18, 900);
    text(ctx, `${CAST[m.giver].name.toUpperCase()}  ·  ${isDone ? 'COMPLETE' : live ? 'IN PROGRESS' : isNext ? 'NEXT' : 'LOCKED'}`, 30 + rowH, y + 42, live ? ACCENT.coral : DIM, 11, 900);
    ctx.font = `600 13px ${FONT}`;
    const lines = wrap(ctx, m.blurb, lw - rowH - 150);
    const ln = lines.length > 1 ? `${lines[0].replace(/[,.]?\s*\S*$/, '')}…` : lines[0];
    text(ctx, ln, 30 + rowH, y + 60, 'rgba(244,241,222,0.8)', 13, 600);
    text(ctx, formatCash(m.payout), 16 + lw - 18, y + 24, isDone ? ACCENT.cash : DIM, 16, 900, 'right');
    text(ctx, `+${m.respect} respect`, 16 + lw - 18, y + 42, DIM, 12, 700, 'right');
    ctx.globalAlpha = 1;
  });
  // The cast.
  const cx = 16 + lw + 14;
  const cw = w - cx - 16;
  const ids = Object.keys(CAST);
  const cardH = Math.min(118, (h - top - 50 - 120) / Math.ceil(ids.length / 2));
  panel(ctx, cx, top, cw, 110 + Math.ceil(ids.length / 2) * (cardH + 8), ACCENT.pink, 0.86);
  outlined(ctx, 'THE CAST', cx + 18, top + 32, ACCENT.pink, 18, 900, 'left', DISPLAY);
  ctx.font = `italic 700 14px ${FONT}`;
  wrap(ctx, STORY_HOOK, cw - 36).slice(0, 3).forEach((ln, i) => text(ctx, ln, cx + 18, top + 58 + i * 18, INK, 14, 700));
  const half = (cw - 38) / 2;
  ids.forEach((id, i) => {
    const x = cx + 14 + (i % 2) * (half + 10);
    const y = top + 106 + Math.floor(i / 2) * (cardH + 8);
    roundRect(ctx, x, y, half, cardH, 8);
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.fill();
    const ps = cardH - 16;
    roundRect(ctx, x + 8, y + 8, ps, ps, 8);
    ctx.fillStyle = CAST[id].color;
    ctx.fill();
    drawPortrait(ctx, id, x + 10, y + 10, ps - 4);
    outlined(ctx, CAST[id].name.toUpperCase(), x + ps + 18, y + 32, CAST[id].color, 14, 900);
    text(ctx, CAST[id].role, x + ps + 18, y + 52, DIM, 13, 700);
  });
}

function settingsTab(ctx, game, w, h, sel, settings) {
  const top = 90;
  const sw = Math.min(560, w * 0.44);
  const sh = 90 + SETTING_ROWS.length * 58 + 110;
  panel(ctx, 16, top, sw, sh, ACCENT.teal, 0.88);
  outlined(ctx, 'SOUND & CAMERA', 34, top + 32, ACCENT.teal, 18, 900, 'left', DISPLAY);
  SETTING_ROWS.forEach((row, i) => {
    const ry = top + 66 + i * 58;
    const active = i === sel;
    if (active) {
      roundRect(ctx, 26, ry - 8, sw - 20, 48, 8);
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      ctx.fill();
      ctx.fillStyle = ACCENT.teal;
      ctx.fillRect(26, ry - 8, 4, 48);
    }
    text(ctx, row.label, 44, ry + 22, active ? '#ffffff' : INK, 17, active ? 900 : 700);
    const v = settings[row.key];
    const bx = 16 + sw - 290;
    meter(ctx, bx, ry + 12, 210, 10, Math.min(1, v), active ? ACCENT.teal : 'rgba(62,230,211,0.6)');
    text(ctx, row.key === 'shake' ? (v === 0 ? 'OFF' : `${Math.round(v * 100)}%`) : `${Math.round(v * 100)}`, 16 + sw - 22, ry + 22, ACCENT.sun, 15, 900, 'right');
  });
  const iy = top + 66 + SETTING_ROWS.length * 58 + 10;
  text(ctx, `Camera view: ${settings.view === 'classic' ? 'classic top-down' : '3D chase / over the shoulder'}  (V in play)`, 34, iy + 10, INK, 14, 700);
  text(ctx, 'Saves: the safehouse, the penthouse and every finished job', 34, iy + 34, DIM, 13, 700);
  text(ctx, 'Settings are remembered on this computer', 34, iy + 56, DIM, 13, 700);
  // Controls at a glance.
  const cx = 16 + sw + 14;
  const cw = w - cx - 16;
  const groups = [
    ['ON FOOT', [['W A S D', 'Move'], ['Mouse', 'Aim'], ['Click', 'Shoot'], ['Shift', 'Sprint'], ['R', 'Reload'], ['0-4', 'Weapons'], ['F', 'Steal a car'], ['E', 'Interact']]],
    ['DRIVING', [['W / S', 'Gas / brake'], ['A / D', 'Steer'], ['Space', 'Handbrake'], ['F', 'Get out'], ['Q / E', 'Radio'], ['Click', 'Drive-by'], ['E at marker', 'Race, respray, taxi'], ['V', 'Camera']]],
  ];
  panel(ctx, cx, top, cw, sh, ACCENT.sun, 0.88);
  outlined(ctx, 'CONTROLS', cx + 18, top + 32, ACCENT.sun, 18, 900, 'left', DISPLAY);
  const colW = (cw - 36) / 2;
  groups.forEach(([title, rows], c) => {
    const gx = cx + 18 + c * colW;
    text(ctx, title, gx, top + 64, ACCENT.teal, 14, 900);
    rows.forEach(([k, d], i) => {
      const ry = top + 94 + i * 34;
      const kw = chip(ctx, k, gx, ry - 16, 'rgba(255,255,255,0.15)', ACCENT.sun, 12, 22);
      text(ctx, d, gx + kw + 10, ry, INK, 14, 700);
    });
  });
}

/**
 * Draw the pause screen over the (dimmed) world. state = { tab, setSel, settings }.
 */
export function drawPauseScreen(ctx, game, w, h, state) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const tab = state.tab ?? 0;
  ctx.fillStyle = PAUSE_TABS[tab] === 'MAP' ? 'rgba(12,8,28,0.72)' : 'rgba(12,8,28,0.66)';
  ctx.fillRect(0, 0, w, h);
  const name = PAUSE_TABS[tab];
  if (name === 'MAP') mapTab(ctx, game, w, h);
  else if (name === 'STATS') statsTab(ctx, game, w, h);
  else if (name === 'STORY') storyTab(ctx, game, w, h);
  else settingsTab(ctx, game, w, h, state.setSel ?? 0, state.settings);
  header(ctx, game, w, tab);
  footer(ctx, game, w, h, tab);
}
