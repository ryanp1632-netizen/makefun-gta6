// Overlay menus: pause, settings sliders, the controls card, and the list menus for the
// Reef & Trigger counter, the safehouse (save, sleep, garage), the garage and the penthouse sale.
import { ACCENT, DISPLAY, FONT, outlined, panel, roundRect, text } from './uiKit.js';
import { SETTING_ROWS } from '../save/settings.js';
import { formatCash } from '../core/math.js';

export const PAUSE_ITEMS = ['Resume', 'City Map', 'Settings', 'Controls', 'Abandon Job', 'Quit to Title'];

function dim(ctx, w, h, a = 0.65) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = `rgba(10,6,24,${a})`;
  ctx.fillRect(0, 0, w, h);
}

/** A vertical list menu with a title, item rows (label, right-hand note, disabled) and a footer. */
export function drawListMenu(ctx, w, h, title, items, sel, footer = '', accent = ACCENT.pink, subtitle = '') {
  dim(ctx, w, h, 0.55);
  const bw = 560;
  const rowH = 46;
  const bh = 110 + items.length * rowH + (footer ? 30 : 0);
  const x = (w - bw) / 2;
  const y = Math.max(30, (h - bh) / 2);
  panel(ctx, x, y, bw, bh, accent, 0.88);
  outlined(ctx, title, x + 30, y + 48, accent, 28, 900, 'left', DISPLAY);
  if (subtitle) text(ctx, subtitle, x + bw - 26, y + 46, 'rgba(244,241,222,0.65)', 14, 700, 'right');
  items.forEach((it, i) => {
    const ry = y + 76 + i * rowH;
    const active = i === sel;
    if (active) {
      roundRect(ctx, x + 18, ry, bw - 36, rowH - 6, 6);
      ctx.fillStyle = 'rgba(255,255,255,0.1)';
      ctx.fill();
      ctx.fillStyle = accent;
      ctx.fillRect(x + 18, ry, 4, rowH - 6);
    }
    const color = it.disabled ? 'rgba(244,241,222,0.38)' : active ? '#ffffff' : '#f4f1de';
    text(ctx, it.label, x + 36, ry + 27, color, 18, active ? 800 : 600);
    if (it.note) text(ctx, it.note, x + bw - 36, ry + 27, it.noteColor ?? (it.disabled ? 'rgba(244,241,222,0.38)' : ACCENT.sun), 16, 700, 'right');
  });
  if (footer) text(ctx, footer, x + 30, y + bh - 22, 'rgba(244,241,222,0.6)', 14, 600);
}

export function drawPause(ctx, w, h, sel, game) {
  const items = PAUSE_ITEMS.map((label) => ({ label, disabled: label === 'Abandon Job' && !game.missions.active }));
  drawListMenu(ctx, w, h, 'PAUSED', items, sel, 'Progress saves at the safehouse and after every job.', ACCENT.pink, game.missions.active ? `On the job: ${game.missions.active.title}` : '');
}

export function drawSettings(ctx, w, h, sel, settings) {
  dim(ctx, w, h, 0.55);
  const bw = 560;
  const bh = 120 + SETTING_ROWS.length * 56 + 40;
  const x = (w - bw) / 2;
  const y = (h - bh) / 2;
  panel(ctx, x, y, bw, bh, ACCENT.teal, 0.9);
  outlined(ctx, 'SETTINGS', x + 30, y + 48, ACCENT.teal, 28, 900, 'left', DISPLAY);
  SETTING_ROWS.forEach((row, i) => {
    const ry = y + 86 + i * 56;
    const active = i === sel;
    text(ctx, row.label, x + 36, ry + 24, active ? '#ffffff' : '#f4f1de', 18, active ? 800 : 600);
    const v = settings[row.key];
    const sx = x + 280;
    const sw = 220;
    roundRect(ctx, sx, ry + 12, sw, 10, 5);
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.fill();
    roundRect(ctx, sx, ry + 12, sw * Math.min(1, v), 10, 5);
    ctx.fillStyle = active ? ACCENT.teal : 'rgba(62,230,211,0.6)';
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(sx + sw * Math.min(1, v), ry + 17, active ? 9 : 7, 0, Math.PI * 2);
    ctx.fill();
    text(ctx, row.key === 'shake' ? (v === 0 ? 'OFF' : `${Math.round(v * 100)}%`) : `${Math.round(v * 100)}`, x + bw - 30, ry + 24, ACCENT.sun, 15, 800, 'right');
  });
  text(ctx, 'Left / right to adjust  ·  Esc to go back', x + 30, y + bh - 22, 'rgba(244,241,222,0.6)', 14, 600);
}

export function drawControls(ctx, w, h) {
  dim(ctx, w, h, 0.6);
  const bw = 760;
  const bh = 470;
  const x = (w - bw) / 2;
  const y = (h - bh) / 2;
  panel(ctx, x, y, bw, bh, ACCENT.sun, 0.9);
  outlined(ctx, 'CONTROLS', x + 30, y + 48, ACCENT.sun, 28, 900, 'left', DISPLAY);
  const cols = [
    ['ON FOOT', [['W A S D', 'Move'], ['Mouse', 'Aim'], ['Left click', 'Shoot'], ['Shift', 'Sprint'], ['R', 'Reload'], ['1-4 / wheel', 'Switch weapon'], ['F', 'Enter or steal a vehicle'], ['E', 'Interact (shops, safehouse)']]],
    ['DRIVING', [['W / S', 'Throttle / brake & reverse'], ['A / D', 'Steer'], ['Space', 'Handbrake (drift)'], ['F', 'Get out'], ['Q / E', 'Radio station'], ['Click', 'Drive-by (pistol, SMG)'], ['E at a marker', 'Respray, race, taxi shift']]],
  ];
  cols.forEach(([title, rows], c) => {
    const cx = x + 30 + c * 370;
    text(ctx, title, cx, y + 92, ACCENT.teal, 16, 900);
    rows.forEach(([k, d], i) => {
      const ry = y + 126 + i * 36;
      ctx.font = `800 14px ${FONT}`;
      const kw = ctx.measureText(k).width + 16;
      roundRect(ctx, cx, ry - 17, kw, 24, 5);
      ctx.fillStyle = 'rgba(255,255,255,0.14)';
      ctx.fill();
      text(ctx, k, cx + 8, ry, ACCENT.sun, 14, 800);
      text(ctx, d, cx + kw + 12, ry, '#f4f1de', 15, 600);
    });
  });
  text(ctx, 'M  city map   ·   Esc  pause   ·   Enter  skip dialogue', x + 30, y + bh - 24, 'rgba(244,241,222,0.65)', 14, 700);
}

/** Rows for the shop menu from economy.shopItems. */
export function shopRows(items, cash) {
  return items.map((it) => ({
    label: it.label,
    note: it.locked ? `Respect ${it.need}` : it.owned ? 'Owned' : formatCash(it.price),
    disabled: it.locked || it.price > cash,
    noteColor: it.locked ? '#ff7eb6' : it.price > cash ? '#ff7a7a' : ACCENT.cash,
  }));
}
