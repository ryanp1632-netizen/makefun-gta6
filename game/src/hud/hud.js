// The in-game HUD, laid out so every corner reads at a glance even in a small thumbnail:
//   top left      the story panel (chapter, objective in big type, STAGE n/m bar, NEXT line,
//                 timer) and, during a chase, the HKPD response list (call signs, distance, state);
//   top right     clock, cash, wanted stars with IN SIGHT / EVADING and the weapon slot bar;
//   bottom left   the radar, the district name, health, armour and respect bars;
//   bottom right  (driving) radio station and track, vehicle name and condition, big speed;
//   bottom centre the dialogue box with the speaker's portrait, prompts above it;
//   top centre    notices, and the district banner for a moment on arrival; during a street
//                 race the race board (place, lap, checkpoint, time, gap to the nearest rival)
//                 with the standings under the story panel and the start countdown mid-screen.
import { drawMinimap } from './minimap.js';
import { drawPortrait } from '../ui/portraits.js';
import { CAST } from '../missions/storyMissions.js';
import { raceLap, stageProgress } from '../missions/missionRunner.js';
import { describeResponse } from '../police/policeDispatch.js';
import { DISTRICTS } from '../world/districts.js';
import { WEAPONS, WEAPON_ORDER } from '../combat/weapons.js';
import { toKmh } from '../vehicles/vehicleModels.js';
import { forwardSpeed } from '../vehicles/drivingPhysics.js';
import { respectLevel } from '../progression/economy.js';
import { formatCash, formatClock } from '../core/math.js';
import { ACCENT, DISPLAY, FONT, chip, drawWeaponIcon, meter, outlined, panel, roundRect, starPath, text, wrap } from '../ui/uiKit.js';

const INK = '#f4f1de';
const DIM = 'rgba(244,241,222,0.62)';
const STATE_COLORS = { RAMMING: '#ff4d5e', PURSUIT: '#ff8c42', ROADBLOCK: '#ffd166', SPOTLIGHT: '#fff3b0', SWEEPING: '#9fd8ff', SEARCHING: '#7f8aa8', 'ON FOOT': '#5ab4ff', ENGAGING: '#ff6b7a' };

const ORDINAL = ['1ST', '2ND', '3RD', '4TH', '5TH', '6TH'];

function timerText(t) {
  const v = Math.max(0, t);
  return `${Math.floor(v / 60)}:${String(Math.floor(v % 60)).padStart(2, '0')}`;
}

/** Race time as m:ss.cc. */
function raceTime(t) {
  const v = Math.max(0, t);
  return `${Math.floor(v / 60)}:${(v % 60).toFixed(2).padStart(5, '0')}`;
}

/**
 * Top centre during a race: the place in huge type, then lap, checkpoint and time, and under them
 * the gap to the rival just ahead (or just behind when leading). Returns the bottom edge.
 */
function drawRaceBoard(ctx, game, w, h) {
  const race = game.missions.race;
  if (!race) return 0;
  if (!race.started) {
    if (race.countdown < 3) {
      const n = Math.ceil(race.countdown);
      const k = 1 + (n - race.countdown) * 0.35;
      outlined(ctx, String(n), w / 2, h * 0.42, ACCENT.sun, Math.round(120 * k), 900, 'center', DISPLAY, 'rgba(10,6,24,0.9)');
      outlined(ctx, 'GET READY', w / 2, h * 0.42 + 48, '#ffffff', 24, 900, 'center');
    }
    return 0;
  }
  if (race.time < 1.2) outlined(ctx, 'GO!', w / 2, h * 0.42, ACCENT.cash, 120, 900, 'center', DISPLAY, 'rgba(10,6,24,0.9)');
  const W = 430;
  const H = 112;
  const x = (w - W) / 2;
  const y = 14;
  panel(ctx, x, y, W, H, ACCENT.pink, 0.84);
  const total = race.racers.length + 1;
  const lead = race.place === 1;
  const ord = ORDINAL[race.place - 1] ?? `${race.place}TH`;
  outlined(ctx, ord, x + 20, y + 72, lead ? ACCENT.sun : '#ffffff', 58, 900, 'left', DISPLAY, 'rgba(10,6,24,0.95)');
  ctx.font = `900 58px ${DISPLAY}`;
  const ow = ctx.measureText(ord).width;
  outlined(ctx, `/ ${total}`, x + 26 + ow, y + 70, DIM, 24, 900, 'left', DISPLAY);
  const cols = [
    ['LAP', `${raceLap(race)}/${race.laps}`],
    ['CHECKPOINT', `${Math.min(race.next, race.points.length - 1)}/${race.points.length - 1}`],
    ['TIME', raceTime(race.time)],
  ];
  const cx0 = x + W - 230;
  cols.forEach(([label, value], i) => {
    const cx = cx0 + [0, 62, 152][i];
    text(ctx, label, cx, y + 32, DIM, 11, 900);
    outlined(ctx, value, cx, y + 60, '#ffffff', i === 2 ? 22 : 24, 900, 'left', FONT);
  });
  if (race.gap) {
    const ahead = race.gap.s > 0;
    const s = Math.abs(race.gap.s);
    const label = ahead ? `${race.gap.name} ${s.toFixed(2)} s AHEAD - REEL THEM IN` : `${s.toFixed(2)} s CLEAR OF ${race.gap.name}`;
    ctx.font = `900 13px ${FONT}`;
    const cw = ctx.measureText(label).width + 30;
    chip(ctx, `${ahead ? '▼' : '▲'} ${label}`, x + (W - cw) / 2, y + 82, ahead ? '#ff4d5e' : ACCENT.cash, '#120c24', 13, 22);
  }
  return y + H;
}

/** Under the story panel during a race: everyone in order with the gap to the player. */
function drawStandings(ctx, game, x, y) {
  const race = game.missions.race;
  if (!race || !race.started || !race.standings.length) return y;
  const rows = race.standings;
  const W = 396;
  const h = 40 + rows.length * 27;
  panel(ctx, x, y, W, h, ACCENT.pink, 0.8);
  outlined(ctx, 'STANDINGS', x + 18, y + 26, INK, 15, 900);
  text(ctx, race.name.toUpperCase(), x + W - 16, y + 26, DIM, 12, 800, 'right');
  rows.forEach((r, i) => {
    const ry = y + 38 + i * 27;
    if (r.you) {
      ctx.fillStyle = 'rgba(255,107,90,0.22)';
      ctx.fillRect(x + 10, ry, W - 20, 25);
    } else if (i % 2 === 0) {
      ctx.fillStyle = 'rgba(255,255,255,0.04)';
      ctx.fillRect(x + 10, ry, W - 20, 25);
    }
    outlined(ctx, String(r.pos), x + 24, ry + 19, r.pos === 1 ? ACCENT.sun : INK, 16, 900, 'center');
    roundRect(ctx, x + 40, ry + 5, 8, 15, 3);
    ctx.fillStyle = r.color;
    ctx.fill();
    text(ctx, r.you ? 'YOU  ·  DEZ' : r.name, x + 58, ry + 18, r.you ? '#ffffff' : INK, 15, 800);
    const gap = r.you ? (r.pos === 1 ? 'LEADER' : '') : r.wrecked ? 'WRECKED' : `${r.gap > 0 ? '+' : '-'}${Math.abs(r.gap).toFixed(2)} s`;
    text(ctx, gap, x + W - 18, ry + 18, r.wrecked ? '#ff7a7a' : r.gap > 0 ? '#ff8c8c' : '#8dffb0', 14, 800, 'right');
  });
  return y + h;
}

/** Top left: the story job (or race / taxi shift) with stage progress, next step and timer. */
function drawStoryPanel(ctx, game, x, y) {
  const s = game.missions;
  const race = s.race && !s.race.story ? s.race : null;
  const active = s.active;
  const taxi = game.activity && game.activity.kind === 'taxi' ? game.activity : null;
  if (!active && !race && !taxi) return y;
  const W = 396;
  let tag;
  let title;
  let objective;
  let status = '';
  let timer = null;
  let prog = null;
  let next = '';
  let color = ACCENT.sun;
  if (active) {
    tag = `CH ${active.chapter}`;
    title = active.title.toUpperCase();
    objective = s.objective || active.blurb;
    status = s.progress;
    timer = s.timer;
    prog = stageProgress(game);
    next = prog ? prog.next : '';
  } else if (race) {
    tag = 'RACE';
    title = race.name.toUpperCase();
    objective = race.started ? `Hit checkpoint ${race.next} of ${race.points.length - 1} - stay ahead of the pack` : 'Line up at the start gate';
    status = race.started ? `${ORDINAL[race.place - 1]} of ${race.racers.length + 1}  ·  lap ${raceLap(race)} / ${race.laps}` : '';
    prog = { stage: Math.max(1, race.next), total: race.points.length - 1 };
    next = race.prize ? `Win $${race.prize.toLocaleString('en-US')} and respect` : '';
    color = ACCENT.pink;
  } else {
    tag = 'TAXI';
    title = `KEYCAB SHIFT  ·  FARE ${taxi.fares + 1}`;
    objective = taxi.stage === 'pickup' ? 'Pick up the fare at the yellow marker' : 'Drop the fare off before the meter runs out';
    timer = taxi.stage === 'dropoff' ? taxi.timer : null;
    prog = { stage: taxi.stage === 'pickup' ? 1 : 2, total: 2 };
    next = taxi.stage === 'pickup' ? 'Drive the fare to the drop-off' : 'Collect the fare';
  }
  ctx.font = `800 21px ${FONT}`;
  const lines = wrap(ctx, objective, W - 40).slice(0, 2);
  const h = 54 + lines.length * 26 + (prog ? 30 : 0) + (next ? 24 : 0) + (status ? 22 : 0) + 6;
  panel(ctx, x, y, W, h, color, 0.8);
  const tw = chip(ctx, tag, x + 16, y + 13, color, '#1a1030', 13, 22);
  outlined(ctx, title, x + 24 + tw, y + 31, color, 17, 900, 'left', FONT);
  if (timer !== null) {
    const urgent = timer < 20;
    const tx = x + W - 14;
    roundRect(ctx, tx - 84, y + 9, 84, 30, 8);
    ctx.fillStyle = urgent ? 'rgba(255,60,80,0.9)' : 'rgba(255,209,102,0.16)';
    ctx.fill();
    // A little stopwatch.
    ctx.strokeStyle = urgent ? '#ffffff' : ACCENT.sun;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(tx - 68, y + 25, 7, 0, Math.PI * 2);
    ctx.moveTo(tx - 68, y + 25);
    ctx.lineTo(tx - 68, y + 20);
    ctx.stroke();
    outlined(ctx, timerText(timer), tx - 8, y + 33, '#ffffff', 21, 900, 'right', FONT);
  }
  let yy = y + 50;
  lines.forEach((ln) => {
    yy += 26;
    outlined(ctx, ln, x + 18, yy - 4, '#ffffff', 21, 800, 'left', FONT, 'rgba(10,6,24,0.6)');
  });
  if (status) {
    yy += 22;
    text(ctx, status, x + 18, yy - 4, ACCENT.teal, 15, 800);
  }
  if (prog) {
    yy += 10;
    text(ctx, `STAGE ${prog.stage}/${prog.total}`, x + 18, yy + 13, INK, 13, 900);
    const bx = x + 108;
    const bw = W - 126;
    const n = Math.max(1, prog.total);
    const gap = 4;
    const sw = (bw - gap * (n - 1)) / n;
    for (let i = 0; i < n; i += 1) {
      roundRect(ctx, bx + i * (sw + gap), yy + 3, sw, 10, 3);
      const done = i < prog.stage - 1;
      const cur = i === prog.stage - 1;
      ctx.fillStyle = done ? color : cur ? (Math.floor(game.t * 3) % 2 ? '#ffffff' : color) : 'rgba(255,255,255,0.14)';
      ctx.fill();
    }
    yy += 20;
  }
  if (next) {
    yy += 24;
    text(ctx, 'NEXT', x + 18, yy - 6, color, 13, 900);
    ctx.font = `700 15px ${FONT}`;
    let nx = next;
    while (ctx.measureText(nx).width > W - 80 && nx.length > 4) nx = `${nx.slice(0, -2)}…`;
    text(ctx, nx, x + 62, yy - 6, DIM, 15, 700);
  }
  return y + h;
}

function unitIcon(ctx, kind, x, y, color, t) {
  ctx.fillStyle = color;
  ctx.beginPath();
  if (kind === 'air') {
    ctx.ellipse(x, y, 7, 3.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(x - 11, y - 6, 22, 1.6);
    ctx.fillRect(x - 12, y - 1, 6, 1.6);
  } else if (kind === 'foot') {
    ctx.arc(x, y - 4, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(x - 3, y - 1, 6, 8);
  } else {
    roundRect(ctx, x - 9, y - 3, 18, 7, 2);
    ctx.fill();
    ctx.fillRect(x - 5, y - 6, 10, 4);
    ctx.fillStyle = Math.floor(t * 4 + x) % 2 ? '#ff3b5c' : '#3b7bff';
    ctx.fillRect(x - 3, y - 8, 6, 2);
  }
}

/** Under the story panel during a chase: every unit after you, nearest first. */
function drawResponsePanel(ctx, game, x, y) {
  const units = describeResponse(game);
  if (!units.length) return y;
  const rows = units.slice(0, 5);
  const W = 396;
  const h = 40 + rows.length * 27 + (units.length > rows.length ? 18 : 0);
  panel(ctx, x, y, W, h, '#3b7bff', 0.8);
  const flash = Math.floor(game.t * 4) % 2 === 0;
  ctx.fillStyle = flash ? '#ff3b5c' : '#3b7bff';
  ctx.beginPath();
  ctx.arc(x + 24, y + 20, 5, 0, Math.PI * 2);
  ctx.fill();
  outlined(ctx, 'HKPD RESPONSE', x + 36, y + 26, INK, 15, 900);
  text(ctx, `${units.length} UNIT${units.length > 1 ? 'S' : ''}  ·  CODE ${game.wanted.level}`, x + W - 16, y + 26, DIM, 13, 800, 'right');
  rows.forEach((u, i) => {
    const ry = y + 40 + i * 27;
    if (i % 2 === 0) {
      ctx.fillStyle = 'rgba(255,255,255,0.04)';
      ctx.fillRect(x + 10, ry, W - 20, 25);
    }
    unitIcon(ctx, u.kind, x + 28, ry + 13, u.kind === 'air' ? '#9fd8ff' : '#dfe6ff', game.t + i * 0.5);
    text(ctx, u.sign, x + 48, ry + 18, '#ffffff', 15, 800);
    text(ctx, `${Math.round(u.d / 9)} m`, x + 222, ry + 18, DIM, 14, 700, 'right');
    const c = STATE_COLORS[u.state] ?? '#9aa3ad';
    ctx.font = `900 12px ${FONT}`;
    const cw = ctx.measureText(u.state).width + 18;
    chip(ctx, u.state, x + W - 16 - cw, ry + 3, c, '#120c24', 12, 19);
  });
  if (units.length > rows.length) text(ctx, `+${units.length - rows.length} more units in the search zone`, x + 18, y + h - 8, DIM, 12, 700);
  return y + h;
}

/** Top right: clock, cash, wanted stars and their state, the weapon slot bar. */
function drawStatusCorner(ctx, game, w) {
  const right = w - 22;
  const pl = game.player;
  outlined(ctx, formatClock(game.clock), right, 38, INK, 24, 900, 'right');
  ctx.font = `900 24px ${FONT}`;
  const cw = ctx.measureText(formatClock(game.clock)).width;
  text(ctx, `DAY ${game.clock.day}`, right - cw - 12, 37, DIM, 13, 800, 'right');
  outlined(ctx, formatCash(game.economy.cash), right, 82, ACCENT.cash, 38, 900, 'right', FONT);
  // Wanted stars and the state tag.
  const wl = game.wanted;
  for (let i = 0; i < 5; i += 1) {
    const x = right - (4 - i) * 34 - 15;
    const on = i < wl.level;
    const flashing = on && (wl.flashT > 0 || !wl.seen) && Math.floor(game.t * 4) % 2 === 0;
    starPath(ctx, x, 114, 15);
    ctx.fillStyle = on ? (flashing ? '#fff3b0' : '#ffd166') : 'rgba(255,255,255,0.13)';
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = 'rgba(10,6,24,0.9)';
    ctx.stroke();
  }
  if (wl.level > 0) {
    const label = wl.seen ? 'IN SIGHT' : 'EVADING';
    ctx.font = `900 12px ${FONT}`;
    const tw = ctx.measureText(label).width + 18;
    chip(ctx, label, right - tw, 136, wl.seen ? '#ff4d5e' : '#5ab4ff', '#120c24', 12, 20);
    const k = wl.seen ? 1 : Math.min(1, wl.evadeT / Math.max(1, wl.evadeNeed));
    text(ctx, wl.seen ? 'search zone follows you' : `lose them  ${Math.round(k * 100)}%`, right - tw - 10, 151, DIM, 12, 700, 'right');
    if (!wl.seen) meter(ctx, right - 160, 160, 160, 5, k, '#5ab4ff');
  }
  // Weapon slot bar: every slot, ammo under each, the current one raised and lit.
  const slotW = 62;
  const gap = 6;
  const n = WEAPON_ORDER.length;
  const x0 = right - n * slotW - (n - 1) * gap;
  const y0 = 172;
  WEAPON_ORDER.forEach((id, i) => {
    const wpn = WEAPONS[id];
    const x = x0 + i * (slotW + gap);
    const cur = pl.weapon === id;
    const owned = !!pl.owned[id];
    const yy = cur ? y0 - 4 : y0;
    roundRect(ctx, x, yy, slotW, 58, 8);
    ctx.fillStyle = cur ? 'rgba(255,107,90,0.92)' : 'rgba(18,12,36,0.78)';
    ctx.fill();
    ctx.strokeStyle = cur ? '#ffffff' : 'rgba(255,255,255,0.14)';
    ctx.lineWidth = cur ? 2 : 1;
    ctx.stroke();
    text(ctx, String(wpn.slot), x + 7, yy + 14, cur ? '#1a1030' : DIM, 11, 900);
    ctx.save();
    ctx.globalAlpha = owned ? 1 : 0.25;
    drawWeaponIcon(ctx, id, x + 9, yy + 28, 44, cur ? '#1a1030' : INK);
    ctx.restore();
    const slot = pl.ammo[id];
    const ammo = wpn.melee ? '∞' : owned ? (cur && pl.reloadT > 0 ? 'RELOAD' : `${slot.mag}/${slot.reserve}`) : 'LOCKED';
    text(ctx, ammo, x + slotW / 2, yy + 52, cur ? '#1a1030' : owned ? INK : 'rgba(244,241,222,0.35)', ammo.length > 6 ? 10 : 12, 900, 'center');
  });
  const wn = WEAPONS[pl.weapon];
  text(ctx, wn.name.toUpperCase(), right, y0 + 76, INK, 13, 900, 'right');
}

/** Bottom left: the district under the radar, health, armour and respect bars. */
function drawVitals(ctx, game, cx, h) {
  const pl = game.player;
  const d = DISTRICTS[game.district] ?? null;
  if (d) {
    ctx.font = `900 13px ${FONT}`;
    const label = d.name.toUpperCase();
    const tw = ctx.measureText(label).width + 26;
    roundRect(ctx, cx - tw / 2, h - 90, tw, 22, 11);
    ctx.fillStyle = 'rgba(18,12,36,0.92)';
    ctx.fill();
    ctx.strokeStyle = d.accent;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    text(ctx, label, cx, h - 74, d.accent, 13, 900, 'center');
  }
  const x = 16;
  const W = 236;
  panel(ctx, x, h - 62, W, 52, null, 0.8);
  const hp = Math.max(0, pl.hp) / 100;
  const low = hp < 0.3 && Math.floor(game.t * 4) % 2;
  // Health: a cross; armour: a shield.
  ctx.fillStyle = low ? '#ff4d4d' : '#5cf08a';
  ctx.fillRect(x + 12, h - 51, 10, 3);
  ctx.fillRect(x + 15.5, h - 54.5, 3, 10);
  meter(ctx, x + 28, h - 54, 84, 9, hp, low ? '#ff4d4d' : '#5cf08a');
  ctx.fillStyle = '#5ab4ff';
  ctx.beginPath();
  ctx.moveTo(x + 124, h - 55);
  ctx.lineTo(x + 132, h - 55);
  ctx.lineTo(x + 132, h - 50);
  ctx.lineTo(x + 128, h - 45);
  ctx.lineTo(x + 124, h - 50);
  ctx.closePath();
  ctx.fill();
  meter(ctx, x + 138, h - 54, 86, 9, pl.armor / 100, '#5ab4ff');
  const rl = respectLevel(game.economy.xp);
  text(ctx, `RESPECT`, x + 12, h - 22, ACCENT.sun, 12, 900);
  ctx.font = `900 16px ${DISPLAY}`;
  outlined(ctx, String(rl.level), x + 76, h - 21, ACCENT.sun, 17, 900, 'left', DISPLAY);
  meter(ctx, x + 96, h - 31, 128, 9, rl.ratio, ACCENT.sun);
  text(ctx, `${rl.into} / ${rl.need}`, x + 224, h - 14, DIM, 10, 800, 'right');
}

/** Bottom right when driving: radio and track, vehicle and condition, a big speed readout. */
function drawDriving(ctx, game, w, h, radio) {
  const v = game.player.vehicle;
  const W = 300;
  const x = w - W - 18;
  if (radio) {
    const ry = h - 236;
    panel(ctx, x, ry, W, 58, radio.color, 0.82);
    // A small speaker/note glyph.
    ctx.fillStyle = radio.color;
    ctx.beginPath();
    ctx.arc(x + 24, ry + 36, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(x + 27, ry + 16, 2.5, 20);
    ctx.fillRect(x + 27, ry + 16, 9, 3);
    outlined(ctx, radio.name, x + 44, ry + 25, radio.color, 15, 900);
    if (radio.track) {
      ctx.font = `700 14px ${FONT}`;
      let line = `${radio.track.title}  —  ${radio.track.artist}`;
      while (ctx.measureText(line).width > W - 96 && line.length > 6) line = `${line.slice(0, -2)}…`;
      text(ctx, line, x + 44, ry + 46, INK, 14, 700);
    }
    for (let i = 0; i < 5; i += 1) {
      const hh = 5 + Math.abs(Math.sin(game.t * (3 + i) + i)) * 18;
      ctx.fillStyle = radio.color;
      ctx.fillRect(x + W - 40 + i * 6, ry + 44 - hh, 4, hh);
    }
  }
  const y = h - 170;
  panel(ctx, x, y, W, 152, ACCENT.coral, 0.82);
  const kmh = Math.abs(toKmh(forwardSpeed(v)));
  const max = toKmh(v.spec.maxSpeed) * 1.1;
  const health = Math.max(0, v.hp / v.spec.hp);
  outlined(ctx, v.spec.name.toUpperCase(), x + 18, y + 28, INK, 16, 900);
  text(ctx, 'CONDITION', x + 18, y + 50, DIM, 11, 900);
  meter(ctx, x + 92, y + 41, 96, 10, health, health > 0.5 ? '#5cf08a' : health > 0.25 ? ACCENT.sun : '#ff4d4d');
  text(ctx, `${Math.round(health * 100)}%`, x + 196, y + 50, INK, 12, 900);
  // The big number.
  outlined(ctx, String(kmh), x + W - 64, y + 118, '#ffffff', 68, 900, 'right', DISPLAY);
  text(ctx, 'KM/H', x + W - 58, y + 100, DIM, 13, 900);
  const reverse = forwardSpeed(v) < -5;
  roundRect(ctx, x + W - 56, y + 104, 36, 22, 6);
  ctx.fillStyle = 'rgba(255,209,102,0.18)';
  ctx.fill();
  text(ctx, reverse ? 'R' : `G${v.gear}`, x + W - 38, y + 121, ACCENT.sun, 14, 900, 'center');
  // Speed bar with ticks along the bottom.
  const bx = x + 18;
  const bw = W - 36;
  const k = Math.min(1, kmh / max);
  roundRect(ctx, bx, y + 134, bw, 8, 4);
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  ctx.fill();
  const g = ctx.createLinearGradient(bx, 0, bx + bw, 0);
  g.addColorStop(0, ACCENT.teal);
  g.addColorStop(0.6, ACCENT.sun);
  g.addColorStop(1, ACCENT.coral);
  roundRect(ctx, bx, y + 134, Math.max(8, bw * k), 8, 4);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.fillStyle = 'rgba(10,6,24,0.6)';
  for (let i = 1; i < 10; i += 1) ctx.fillRect(bx + (bw * i) / 10, y + 134, 1.5, 8);
}

function drawDistrictBanner(ctx, game, w) {
  const t = game.districtT;
  if (t > 2.6 || !game.district) return;
  const d = DISTRICTS[game.district];
  const a = t < 0.35 ? t / 0.35 : t > 2 ? (2.6 - t) / 0.6 : 1;
  ctx.save();
  ctx.globalAlpha = Math.max(0, a);
  const y = 150 + (1 - Math.min(1, t * 3)) * 14;
  outlined(ctx, d.name.toUpperCase(), w / 2, y, d.accent, 40, 900, 'center', DISPLAY, 'rgba(10,6,24,0.9)');
  ctx.fillStyle = d.accent;
  ctx.fillRect(w / 2 - 110, y + 10, 220, 3);
  outlined(ctx, d.tagline, w / 2, y + 34, INK, 16, 700, 'center');
  ctx.restore();
}

function drawDialogue(ctx, game, w, h) {
  const d = game.dialogue.current;
  if (!d) return;
  const cast = CAST[d.who];
  const bw = Math.min(660, w - 620);
  const x = (w - bw) / 2;
  const y = h - 132;
  panel(ctx, x, y, bw, 116, cast.color, 0.86);
  roundRect(ctx, x + 12, y + 12, 92, 92, 10);
  ctx.fillStyle = cast.color;
  ctx.fill();
  drawPortrait(ctx, d.who, x + 14, y + 14, 88);
  outlined(ctx, cast.name.toUpperCase(), x + 120, y + 32, cast.color, 18, 900);
  ctx.font = `900 18px ${FONT}`;
  text(ctx, cast.role.toUpperCase(), x + 128 + ctx.measureText(cast.name.toUpperCase()).width, y + 31, DIM, 12, 800);
  ctx.font = `700 19px ${FONT}`;
  const shown = d.text.slice(0, Math.floor(game.dialogue.t * 60));
  wrap(ctx, shown, bw - 140).slice(0, 3).forEach((ln, i) => text(ctx, ln, x + 120, y + 60 + i * 24, '#ffffff', 19, 700));
}

function drawNotices(ctx, game, w, y0 = 40) {
  let yy = y0;
  for (const n of game.notices) {
    const a = n.t < 0.3 ? n.t / 0.3 : n.t > 4 ? 5 - n.t : 1;
    ctx.save();
    ctx.globalAlpha = Math.max(0, a);
    outlined(ctx, n.text, w / 2, yy, n.color, n.big ? 22 : 17, 900, 'center');
    ctx.restore();
    yy += n.big ? 30 : 24;
  }
}

/** Draw the whole HUD over the world. radio = { name, color, track } while driving. */
export function drawHud(ctx, game, w, h, radio) {
  const pl = game.player;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  // Hurt flash.
  if (pl.hurtT > 0 || pl.hp < 30) {
    const k = Math.max(pl.hurtT * 1.6, pl.hp < 30 ? 0.35 + Math.sin(game.t * 5) * 0.1 : 0);
    const g = ctx.createRadialGradient(w / 2, h / 2, h * 0.3, w / 2, h / 2, h * 0.85);
    g.addColorStop(0, 'rgba(200,0,30,0)');
    g.addColorStop(1, `rgba(200,0,30,${Math.min(0.6, k)})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }
  const mx = 134;
  drawMinimap(ctx, game, mx, h - 196, 94);
  drawVitals(ctx, game, mx, h);
  drawStatusCorner(ctx, game, w);
  const below = drawStoryPanel(ctx, game, 18, 18);
  const standings = drawStandings(ctx, game, 18, below + 10);
  drawResponsePanel(ctx, game, 18, standings > below ? standings + 10 : below + 10);
  if (pl.vehicle) drawDriving(ctx, game, w, h, radio);
  const board = drawRaceBoard(ctx, game, w, h);
  drawDistrictBanner(ctx, game, w);
  drawNotices(ctx, game, w, board ? board + 30 : 40);
  if (game.prompt && !game.dialogue.current) {
    ctx.font = `700 17px ${FONT}`;
    const tw = ctx.measureText(game.prompt.text).width + 40;
    panel(ctx, (w - tw) / 2, h - 86, tw, 40, ACCENT.sun);
    const key = game.prompt.text.slice(0, 1);
    roundRect(ctx, (w - tw) / 2 + 14, h - 76, 22, 22, 4);
    ctx.fillStyle = ACCENT.sun;
    ctx.fill();
    text(ctx, key, (w - tw) / 2 + 25, h - 59, '#1a1030', 15, 900, 'center');
    text(ctx, game.prompt.text.slice(1).trim(), (w - tw) / 2 + 44, h - 60, INK, 16, 700);
  }
  drawDialogue(ctx, game, w, h);
}

/** The crosshair at the mouse when on foot (with a lock ring when aim assist holds a target). */
export function drawCrosshair(ctx, x, y, spread, reloading, locked = false) {
  ctx.save();
  if (locked) {
    ctx.strokeStyle = 'rgba(255,90,100,0.95)';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(x, y, 15 + spread, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.strokeStyle = reloading ? ACCENT.sun : '#ffffff';
  ctx.lineWidth = 2.5;
  ctx.shadowColor = 'rgba(0,0,0,0.85)';
  ctx.shadowBlur = 4;
  const g = 6 + spread;
  ctx.beginPath();
  ctx.moveTo(x - g - 9, y);
  ctx.lineTo(x - g, y);
  ctx.moveTo(x + g, y);
  ctx.lineTo(x + g + 9, y);
  ctx.moveTo(x, y - g - 9);
  ctx.lineTo(x, y - g);
  ctx.moveTo(x, y + g);
  ctx.lineTo(x, y + g + 9);
  ctx.stroke();
  ctx.fillStyle = ACCENT.coral;
  ctx.fillRect(x - 2, y - 2, 4, 4);
  ctx.restore();
}
