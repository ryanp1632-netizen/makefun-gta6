// The in-game HUD: radar with health, armour and respect; clock, cash, wanted stars and the
// escape meter; weapon and ammo; the mission objective panel with timer; the speedometer and
// radio station when driving; the district banner, notices, prompts and the dialogue box.
import { drawMinimap } from './minimap.js';
import { drawPortrait } from '../ui/portraits.js';
import { CAST } from '../missions/storyMissions.js';
import { DISTRICTS } from '../world/districts.js';
import { formatClock } from '../world/dayNight.js';
import { WEAPONS } from '../combat/weapons.js';
import { toKmh } from '../vehicles/vehicleModels.js';
import { forwardSpeed } from '../vehicles/drivingPhysics.js';
import { formatCash } from '../core/math.js';
import { ACCENT, DISPLAY, FONT, drawWeaponIcon, outlined, panel, roundRect, starPath, text, wrap } from '../ui/uiKit.js';

function drawStars(ctx, game, xRight, y) {
  const w = game.wanted;
  const t = game.t;
  for (let i = 0; i < 5; i += 1) {
    const x = xRight - (4 - i) * 30 - 13;
    const on = i < w.level;
    const flashing = on && (w.flashT > 0 || !w.seen) && Math.floor(t * 4) % 2 === 0;
    starPath(ctx, x, y, 13);
    ctx.fillStyle = on ? (flashing ? '#fff3b0' : '#ffd166') : 'rgba(255,255,255,0.12)';
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = 'rgba(10,6,24,0.9)';
    ctx.stroke();
  }
  if (w.level > 0) {
    const label = w.seen ? 'SPOTTED' : 'EVADING';
    const k = w.seen ? 0 : Math.min(1, w.evadeT / Math.max(1, w.evadeNeed));
    outlined(ctx, label, xRight, y + 32, w.seen ? '#ff6b7a' : '#9fd8ff', 12, 800, 'right');
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.fillRect(xRight - 90, y + 37, 90, 4);
    ctx.fillStyle = '#9fd8ff';
    ctx.fillRect(xRight - 90, y + 37, 90 * k, 4);
  }
}

function drawWeaponPanel(ctx, game, x, y) {
  const pl = game.player;
  const w = WEAPONS[pl.weapon];
  const slot = pl.ammo[pl.weapon];
  panel(ctx, x, y, 210, 62, ACCENT.coral);
  drawWeaponIcon(ctx, pl.weapon, x + 18, y + 30, 70, '#f4f1de');
  outlined(ctx, w.name.toUpperCase(), x + 198, y + 22, '#f4f1de', 13, 700, 'right');
  const reloading = pl.reloadT > 0;
  outlined(ctx, reloading ? 'RELOAD' : String(slot.mag), x + 150, y + 51, reloading ? ACCENT.sun : '#ffffff', reloading ? 18 : 26, 800, 'right');
  outlined(ctx, `/ ${slot.reserve}`, x + 198, y + 51, 'rgba(244,241,222,0.7)', 15, 700, 'right');
}

function drawObjective(ctx, game, x, y) {
  const s = game.missions;
  const race = s.race && !s.race.story ? s.race : null;
  const active = s.active;
  const taxi = game.activity && game.activity.kind === 'taxi' ? game.activity : null;
  if (!active && !race && !taxi) return;
  let title;
  let objective;
  let progress = '';
  let timer = null;
  let color = ACCENT.sun;
  if (active) {
    title = `CHAPTER ${active.chapter}  ·  ${active.title.toUpperCase()}`;
    objective = s.objective || active.blurb;
    progress = s.progress;
    timer = s.timer;
  } else if (race) {
    title = `STREET RACE  ·  ${race.name.toUpperCase()}`;
    objective = race.started ? `Checkpoint ${race.next} / ${race.points.length - 1}` : 'Line up at the start';
    progress = race.started ? `Position ${race.place ?? 1} / ${race.racers.length + 1}` : '';
    color = ACCENT.pink;
  } else {
    title = `KEYCAB SHIFT  ·  FARE ${taxi.fares + 1}`;
    objective = taxi.stage === 'pickup' ? 'Pick up the fare waiting at the yellow marker' : 'Drop the fare off before the meter runs out';
    timer = taxi.stage === 'dropoff' ? taxi.timer : null;
  }
  ctx.font = `600 16px ${FONT}`;
  const lines = wrap(ctx, objective, 330);
  const h = 54 + lines.length * 21 + (progress ? 22 : 0);
  panel(ctx, x, y, 372, h, color);
  outlined(ctx, title, x + 18, y + 26, color, 14, 800, 'left', FONT);
  lines.forEach((ln, i) => text(ctx, ln, x + 18, y + 52 + i * 21, '#f4f1de', 16, 600));
  if (progress) text(ctx, progress, x + 18, y + 52 + lines.length * 21 + 2, ACCENT.teal, 14, 700);
  if (timer !== null) {
    const m = Math.floor(Math.max(0, timer) / 60);
    const sec = Math.floor(Math.max(0, timer) % 60);
    const urgent = timer < 20;
    panel(ctx, x + 380, y, 96, 46, urgent ? '#ff4d4d' : ACCENT.sun);
    outlined(ctx, `${m}:${String(sec).padStart(2, '0')}`, x + 432, y + 33, urgent && Math.floor(game.t * 4) % 2 ? '#ff6b6b' : '#ffffff', 26, 800, 'center', FONT);
  }
}

function drawSpeedo(ctx, game, cx, cy, radio) {
  const v = game.player.vehicle;
  const R = 70;
  const kmh = Math.abs(toKmh(forwardSpeed(v)));
  const max = toKmh(v.spec.maxSpeed) * 1.1;
  ctx.save();
  ctx.fillStyle = 'rgba(10,6,24,0.72)';
  ctx.beginPath();
  ctx.arc(cx, cy, R + 8, 0, Math.PI * 2);
  ctx.fill();
  const a0 = Math.PI * 0.75;
  const a1 = Math.PI * 2.25;
  ctx.lineWidth = 9;
  ctx.strokeStyle = 'rgba(255,255,255,0.12)';
  ctx.beginPath();
  ctx.arc(cx, cy, R - 6, a0, a1);
  ctx.stroke();
  const k = Math.min(1, kmh / max);
  const g = ctx.createLinearGradient(cx - R, cy, cx + R, cy);
  g.addColorStop(0, ACCENT.teal);
  g.addColorStop(0.6, ACCENT.sun);
  g.addColorStop(1, ACCENT.coral);
  ctx.strokeStyle = g;
  ctx.beginPath();
  ctx.arc(cx, cy, R - 6, a0, a0 + (a1 - a0) * k);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(244,241,222,0.6)';
  ctx.lineWidth = 2;
  for (let i = 0; i <= 10; i += 1) {
    const a = a0 + ((a1 - a0) * i) / 10;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * (R - 16), cy + Math.sin(a) * (R - 16));
    ctx.lineTo(cx + Math.cos(a) * (R - 22), cy + Math.sin(a) * (R - 22));
    ctx.stroke();
  }
  const na = a0 + (a1 - a0) * k;
  ctx.strokeStyle = '#ff4f6a';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx + Math.cos(na) * (R - 12), cy + Math.sin(na) * (R - 12));
  ctx.stroke();
  ctx.fillStyle = '#ff4f6a';
  ctx.beginPath();
  ctx.arc(cx, cy, 5, 0, Math.PI * 2);
  ctx.fill();
  outlined(ctx, String(kmh), cx, cy + 32, '#ffffff', 28, 800, 'center');
  text(ctx, 'KM/H', cx, cy + 46, 'rgba(244,241,222,0.7)', 10, 700, 'center');
  outlined(ctx, forwardSpeed(v) < -5 ? 'R' : String(v.gear), cx + 34, cy - 14, ACCENT.sun, 16, 800, 'center');
  ctx.restore();
  // Vehicle name and condition.
  const health = Math.max(0, v.hp / v.spec.hp);
  outlined(ctx, v.spec.name.toUpperCase(), cx, cy - R - 16, '#f4f1de', 13, 800, 'center');
  ctx.fillStyle = 'rgba(255,255,255,0.15)';
  ctx.fillRect(cx - 50, cy - R - 10, 100, 4);
  ctx.fillStyle = health > 0.5 ? '#5cf08a' : health > 0.25 ? ACCENT.sun : '#ff4d4d';
  ctx.fillRect(cx - 50, cy - R - 10, 100 * health, 4);
  if (radio) {
    const w = 220;
    const x = cx - w / 2 - 40;
    const y = cy - R - 74;
    panel(ctx, x, y, w + 40, 40, radio.color);
    text(ctx, 'RADIO', x + 16, y + 16, 'rgba(244,241,222,0.6)', 10, 800);
    outlined(ctx, radio.name, x + 16, y + 33, radio.color, 15, 800);
    // Little equaliser bars.
    for (let i = 0; i < 5; i += 1) {
      const hh = 6 + Math.abs(Math.sin(game.t * (3 + i) + i)) * 14;
      ctx.fillStyle = radio.color;
      ctx.fillRect(x + w + 10 + i * 5, y + 32 - hh, 3, hh);
    }
  }
}

function drawDistrictBanner(ctx, game, w, h) {
  const t = game.districtT;
  if (t > 4.5 || !game.district) return;
  const d = DISTRICTS[game.district];
  const a = t < 0.5 ? t / 0.5 : t > 3.5 ? (4.5 - t) : 1;
  ctx.save();
  ctx.globalAlpha = Math.max(0, a);
  const y = h - (game.dialogue.current ? 230 : 120);
  const slide = (1 - Math.min(1, t * 2)) * 30;
  outlined(ctx, d.name.toUpperCase(), w / 2, y + slide, d.accent, 46, 900, 'center', DISPLAY, 'rgba(10,6,24,0.9)');
  ctx.fillStyle = d.accent;
  ctx.fillRect(w / 2 - 120, y + 12, 240, 3);
  outlined(ctx, d.tagline, w / 2, y + 38, '#f4f1de', 18, 600, 'center');
  ctx.restore();
}

function drawDialogue(ctx, game, w, h) {
  const d = game.dialogue.current;
  if (!d) return;
  const cast = CAST[d.who];
  const bw = Math.min(720, w - 520);
  const x = (w - bw) / 2;
  const y = h - 138;
  panel(ctx, x, y, bw, 112, cast.color, 0.82);
  drawPortrait(ctx, d.who, x + 14, y + 12, 88);
  outlined(ctx, cast.name.toUpperCase(), x + 118, y + 32, cast.color, 17, 800);
  text(ctx, cast.role, x + 118 + ctx.measureText(cast.name.toUpperCase()).width + 12, y + 32, 'rgba(244,241,222,0.55)', 13, 600);
  ctx.font = `600 18px ${FONT}`;
  const shown = d.text.slice(0, Math.floor(game.dialogue.t * 60));
  wrap(ctx, shown, bw - 140).slice(0, 3).forEach((ln, i) => text(ctx, ln, x + 118, y + 60 + i * 23, '#ffffff', 18, 600));
}

function drawNotices(ctx, game, x, y) {
  let yy = y;
  for (const n of game.notices) {
    const a = n.t < 0.3 ? n.t / 0.3 : n.t > 4 ? 5 - n.t : 1;
    ctx.save();
    ctx.globalAlpha = Math.max(0, a);
    outlined(ctx, n.text, x, yy, n.color, n.big ? 20 : 16, 800);
    ctx.restore();
    yy += n.big ? 28 : 23;
  }
}

/** Draw the whole HUD over the world. */
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
  drawMinimap(ctx, game, 128, h - 128, 96);
  // Top right: clock, cash, stars, weapon.
  const right = w - 26;
  outlined(ctx, `${formatClock(game.clock)}`, right, 40, '#f4f1de', 22, 800, 'right');
  text(ctx, `DAY ${game.clock.day}`, right - 74, 40, 'rgba(244,241,222,0.6)', 13, 800, 'right');
  outlined(ctx, formatCash(game.economy.cash), right, 80, ACCENT.cash, 34, 900, 'right', FONT);
  drawStars(ctx, game, right, 112);
  drawWeaponPanel(ctx, game, right - 210, 158);
  drawObjective(ctx, game, 24, 24);
  if (pl.vehicle) drawSpeedo(ctx, game, w - 110, h - 104, radio);
  drawDistrictBanner(ctx, game, w, h);
  drawNotices(ctx, game, 26, h - 300);
  if (game.prompt && !game.dialogue.current) {
    ctx.font = `700 17px ${FONT}`;
    const tw = ctx.measureText(game.prompt.text).width + 40;
    panel(ctx, (w - tw) / 2, h - 86, tw, 40, ACCENT.sun);
    const key = game.prompt.text.slice(0, 1);
    roundRect(ctx, (w - tw) / 2 + 14, h - 76, 22, 22, 4);
    ctx.fillStyle = ACCENT.sun;
    ctx.fill();
    text(ctx, key, (w - tw) / 2 + 25, h - 59, '#1a1030', 15, 900, 'center');
    text(ctx, game.prompt.text.slice(1).trim(), (w - tw) / 2 + 44, h - 60, '#f4f1de', 16, 700);
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
  ctx.lineWidth = 2;
  ctx.shadowColor = 'rgba(0,0,0,0.8)';
  ctx.shadowBlur = 3;
  const g = 5 + spread;
  ctx.beginPath();
  ctx.moveTo(x - g - 7, y);
  ctx.lineTo(x - g, y);
  ctx.moveTo(x + g, y);
  ctx.lineTo(x + g + 7, y);
  ctx.moveTo(x, y - g - 7);
  ctx.lineTo(x, y - g);
  ctx.moveTo(x, y + g);
  ctx.lineTo(x, y + g + 7);
  ctx.stroke();
  ctx.fillStyle = ACCENT.coral;
  ctx.fillRect(x - 1.5, y - 1.5, 3, 3);
  ctx.restore();
}
