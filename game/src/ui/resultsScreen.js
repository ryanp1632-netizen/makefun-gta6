// End-of-job and setback screens: JOB COMPLETE with payout, stats and the chapter list; JOB BLOWN
// with the reason; and the respawn cards for being FLATLINED (hospital) or CUFFED (precinct).
import { ACCENT, DISPLAY, FONT, outlined, panel, text } from './uiKit.js';
import { drawChapterList } from '../hud/cityMap.js';
import { drawPortrait } from './portraits.js';
import { missionById } from '../missions/missionRunner.js';
import { toKmh } from '../vehicles/vehicleModels.js';
import { formatCash } from '../core/math.js';

function stripes(ctx, w, h, color, t) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const g = ctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, 'rgba(20,8,40,0.86)');
  g.addColorStop(1, 'rgba(60,10,60,0.8)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  ctx.save();
  ctx.globalAlpha = 0.08;
  ctx.fillStyle = color;
  for (let i = -10; i < 30; i += 1) {
    const x = i * 80 + ((t * 40) % 80);
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x + 30, 0);
    ctx.lineTo(x + 30 - h * 0.6, h);
    ctx.lineTo(x - h * 0.6, h);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

/** JOB COMPLETE: title band, payout and respect, stats, then the chapter list. */
export function drawResults(ctx, w, h, game, t) {
  const r = game.missions.results;
  stripes(ctx, w, h, ACCENT.sun, t);
  const m = missionById(game.missions.completed[game.missions.completed.length - 1]);
  const pop = Math.min(1, t * 3);
  ctx.save();
  ctx.translate(w * 0.36, 120);
  ctx.scale(0.8 + pop * 0.2, 0.8 + pop * 0.2);
  outlined(ctx, 'JOB COMPLETE', 0, 0, ACCENT.sun, 64, 900, 'center', DISPLAY, '#1a0b26');
  ctx.restore();
  outlined(ctx, `CHAPTER ${r.chapter}  ·  ${r.title.toUpperCase()}`, w * 0.36, 168, '#f4f1de', 22, 800, 'center');
  const px = w * 0.36 - 260;
  panel(ctx, px, 200, 520, 380, ACCENT.sun, 0.85);
  drawPortrait(ctx, m ? m.giver : 'pearl', px + 24, 222, 96);
  outlined(ctx, 'PAYOUT', px + 140, 250, 'rgba(244,241,222,0.7)', 15, 800);
  const shown = Math.round(r.payout * Math.min(1, t * 1.5));
  outlined(ctx, formatCash(shown), px + 140, 300, ACCENT.cash, 48, 900, 'left', FONT);
  outlined(ctx, `+${r.respect} RESPECT`, px + 140, 330, ACCENT.sun, 18, 800);
  const rows = [
    ['Time', `${Math.floor(r.time / 60)}:${String(Math.floor(r.time % 60)).padStart(2, '0')}`],
    ['Accuracy', r.accuracy === null ? '-' : `${r.accuracy}%`],
    ['Takedowns', String(r.kills)],
    ['Crashes', String(r.crashes)],
    ['Top speed', `${toKmh(r.topSpeed)} km/h`],
  ];
  rows.forEach(([k, v], i) => {
    const y = 380 + i * 34;
    text(ctx, k, px + 30, y, 'rgba(244,241,222,0.75)', 17, 600);
    text(ctx, v, px + 490, y, '#ffffff', 18, 800, 'right');
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fillRect(px + 30, y + 10, 460, 1);
  });
  drawChapterList(ctx, game, w - 360, 70, 330, m ? m.id : null);
  if (t > 1) outlined(ctx, 'ENTER  continue   ·   game saved', w * 0.36, h - 40, 'rgba(244,241,222,0.85)', 16, 700, 'center');
}

/** JOB BLOWN banner (drawn over play for a few seconds). */
export function drawFailed(ctx, w, h, failed) {
  const t = failed.t;
  if (t > 4.5) return;
  const a = t < 0.3 ? t / 0.3 : t > 3.8 ? (4.5 - t) / 0.7 : 1;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = Math.max(0, a);
  ctx.fillStyle = 'rgba(30,0,10,0.55)';
  ctx.fillRect(0, h / 2 - 80, w, 150);
  outlined(ctx, 'JOB BLOWN', w / 2, h / 2, '#ff4d6a', 58, 900, 'center', DISPLAY, '#1a0b26');
  outlined(ctx, `${failed.title}  ·  ${failed.reason}`, w / 2, h / 2 + 44, '#f4f1de', 20, 700, 'center');
  ctx.restore();
}

/** The setback card: hospital or precinct, what it cost, how to continue. */
export function drawDown(ctx, w, h, cause, bill, t) {
  const arrest = cause === 'arrest';
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const k = Math.min(1, t / 1.2);
  ctx.fillStyle = arrest ? `rgba(10,20,60,${0.75 * k})` : `rgba(60,0,16,${0.75 * k})`;
  ctx.fillRect(0, 0, w, h);
  if (t < 0.6) return;
  outlined(ctx, arrest ? 'CUFFED' : 'FLATLINED', w / 2, h / 2 - 20, arrest ? '#6aa0ff' : '#ff4d6a', 80, 900, 'center', DISPLAY, '#0a0618');
  const line = arrest
    ? `HKPD Precinct 3 kept your guns and your bail: ${formatCash(bill)}`
    : `Mercy Shores Medical stitched you up. The bill: ${formatCash(bill)}`;
  outlined(ctx, line, w / 2, h / 2 + 30, '#f4f1de', 22, 700, 'center');
  if (t > 1.5) outlined(ctx, 'ENTER  get back out there', w / 2, h / 2 + 80, 'rgba(244,241,222,0.8)', 17, 700, 'center');
}
