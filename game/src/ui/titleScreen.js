// The title screen over the living city: a striped sunset disc with palm silhouettes behind the
// HALCYON KEYS logo, the menu (Continue shows the save slot), a how-to-play card, the story hook
// and the cast.
import { ACCENT, DISPLAY, FONT, outlined, panel, roundRect, text } from './uiKit.js';
import { drawPortrait } from './portraits.js';
import { STORY_HOOK } from '../missions/storyMissions.js';

export const TITLE_ITEMS = ['Continue', 'New Game', 'Controls', 'Settings'];

function palm(ctx, x, y, h, lean, s) {
  ctx.strokeStyle = '#1a0b26';
  ctx.lineWidth = 7 * s;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.quadraticCurveTo(x + lean * 0.4, y - h * 0.6, x + lean, y - h);
  ctx.stroke();
  ctx.fillStyle = '#1a0b26';
  const tx = x + lean;
  const ty = y - h;
  for (let i = 0; i < 7; i += 1) {
    const a = -Math.PI / 2 + (i - 3) * 0.48;
    const len = (58 + (i % 2) * 14) * s;
    ctx.beginPath();
    ctx.moveTo(tx, ty);
    ctx.quadraticCurveTo(tx + Math.cos(a) * len * 0.6, ty + Math.sin(a) * len * 0.6 - 14 * s, tx + Math.cos(a) * len, ty + Math.sin(a) * len + 20 * s);
    ctx.quadraticCurveTo(tx + Math.cos(a) * len * 0.5, ty + Math.sin(a) * len * 0.5 + 4 * s, tx, ty + 4 * s);
    ctx.fill();
  }
}

/** The logo block centred at (cx, cy). */
export function drawLogo(ctx, cx, cy, scale, t) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(scale, scale);
  // Sun disc with horizontal cut stripes.
  const R = 128;
  ctx.save();
  ctx.beginPath();
  ctx.arc(0, -30, R, 0, Math.PI * 2);
  ctx.clip();
  const sun = ctx.createLinearGradient(0, -30 - R, 0, -30 + R);
  sun.addColorStop(0, '#ffe66d');
  sun.addColorStop(0.45, '#ff9f45');
  sun.addColorStop(0.8, '#ff4fa3');
  sun.addColorStop(1, '#b23aa8');
  ctx.fillStyle = sun;
  ctx.fillRect(-R, -30 - R, R * 2, R * 2);
  ctx.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 7; i += 1) {
    const y = -30 + 10 + i * 17;
    ctx.fillRect(-R, y, R * 2, 3 + i * 1.6);
  }
  ctx.restore();
  ctx.globalCompositeOperation = 'source-over';
  palm(ctx, -150, 70, 150, -40, 1);
  palm(ctx, 160, 70, 120, 34, 0.85);
  // HALCYON
  ctx.font = `900 96px ${DISPLAY}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 16;
  ctx.strokeStyle = '#1a0b26';
  ctx.strokeText('HALCYON', 0, 40);
  const g = ctx.createLinearGradient(0, -40, 0, 40);
  g.addColorStop(0, '#fffbe6');
  g.addColorStop(0.45, '#ffd166');
  g.addColorStop(0.55, '#ff7a3d');
  g.addColorStop(1, '#ff3d7f');
  ctx.fillStyle = g;
  ctx.fillText('HALCYON', 0, 40);
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(255,255,255,0.7)';
  ctx.strokeText('HALCYON', 0, 40);
  // KEYS in glowing script-like italic.
  ctx.save();
  ctx.translate(40, 104);
  ctx.transform(1, 0, -0.22, 1, 0, 0);
  ctx.font = `900 64px ${DISPLAY}`;
  ctx.lineWidth = 12;
  ctx.strokeStyle = '#1a0b26';
  ctx.strokeText('KEYS', 0, 0);
  ctx.shadowColor = '#3ee6d3';
  ctx.shadowBlur = 18 + Math.sin(t * 3) * 4;
  ctx.fillStyle = '#3ee6d3';
  ctx.fillText('KEYS', 0, 0);
  ctx.shadowBlur = 0;
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.fillText('KEYS', 0, -3);
  ctx.restore();
  ctx.restore();
}

/** Draw the title overlay; state = {sel, save (summary string or null), t, sub}. */
export function drawTitle(ctx, w, h, state) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const shade = ctx.createLinearGradient(0, 0, w, 0);
  shade.addColorStop(0, 'rgba(14,8,30,0.88)');
  shade.addColorStop(0.45, 'rgba(14,8,30,0.55)');
  shade.addColorStop(1, 'rgba(14,8,30,0.1)');
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, w, h);
  drawLogo(ctx, 300, 205, 0.95, state.t);
  // Menu.
  const mx = 70;
  let my = 395;
  TITLE_ITEMS.forEach((label, i) => {
    const sel = state.sel === i;
    const disabled = label === 'Continue' && !state.save;
    const hgt = label === 'Continue' ? 64 : 46;
    if (sel) {
      roundRect(ctx, mx - 16, my - 32, 420, hgt, 8);
      const g = ctx.createLinearGradient(mx, 0, mx + 420, 0);
      g.addColorStop(0, 'rgba(255,79,163,0.55)');
      g.addColorStop(1, 'rgba(255,79,163,0)');
      ctx.fillStyle = g;
      ctx.fill();
      ctx.fillStyle = ACCENT.sun;
      ctx.fillRect(mx - 16, my - 32, 5, hgt);
    }
    outlined(ctx, label.toUpperCase(), mx, my, disabled ? 'rgba(244,241,222,0.35)' : sel ? '#ffffff' : '#f4f1de', 30, 900, 'left', DISPLAY);
    if (label === 'Continue') text(ctx, state.save ?? 'No saved game yet', mx + 2, my + 22, state.save ? ACCENT.teal : 'rgba(244,241,222,0.4)', 15, 700);
    my += label === 'Continue' ? 72 : 54;
  });
  outlined(ctx, STORY_HOOK, 70, h - 40, 'rgba(244,241,222,0.92)', 16, 600, 'left', FONT);
  // How to play.
  const bx = w - 400;
  const by = 40;
  panel(ctx, bx, by, 370, 300, ACCENT.teal, 0.8);
  outlined(ctx, 'HOW TO PLAY', bx + 20, by + 34, ACCENT.teal, 18, 900, 'left', DISPLAY);
  const rows = [
    ['WASD', 'Walk / drive'], ['Mouse', 'Aim  ·  Click to shoot'], ['Shift', 'Sprint'], ['Space', 'Handbrake drift'],
    ['F', 'Enter / steal a vehicle'], ['E', 'Interact  ·  next station'], ['Q', 'Previous radio station'], ['R  1-4', 'Reload  ·  weapons'], ['M  Esc', 'City map  ·  pause'],
  ];
  rows.forEach(([k, d], i) => {
    const y = by + 66 + i * 26;
    ctx.font = `800 13px ${FONT}`;
    const kw = ctx.measureText(k).width + 14;
    roundRect(ctx, bx + 20, y - 15, kw, 20, 4);
    ctx.fillStyle = 'rgba(255,255,255,0.14)';
    ctx.fill();
    text(ctx, k, bx + 27, y, ACCENT.sun, 13, 800);
    text(ctx, d, bx + 120, y, '#f4f1de', 14, 600);
  });
  // Cast strip.
  const cast = ['dez', 'pearl', 'juno', 'mags', 'benning', 'silas'];
  const cy = h - 150;
  cast.forEach((c, i) => drawPortrait(ctx, c, w - 400 + i * 62, cy, 54));
  text(ctx, 'Dez  ·  Pearl  ·  Juno  ·  Mags  ·  Benning  ·  Silas', w - 400, cy + 76, 'rgba(244,241,222,0.75)', 13, 700);
  text(ctx, 'Enter to select  ·  arrows to move', w - 30, h - 26, 'rgba(244,241,222,0.5)', 13, 700, 'right');
}
