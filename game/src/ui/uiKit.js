// Shared drawing helpers for the HUD and menus: fonts, glassy panels, outlined text, the wanted
// star, map icons and weapon silhouettes, all drawn with canvas paths.

export const FONT = '"Bahnschrift", "Segoe UI", Arial, sans-serif';
export const DISPLAY = '"Arial Black", "Bahnschrift", Impact, sans-serif';
export const ACCENT = { coral: '#ff6b5a', teal: '#3ee6d3', sun: '#ffd166', pink: '#ff4fa3', violet: '#b26bff', cash: '#7dff9a' };

export function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** A dark translucent panel with a thin highlight edge and an optional accent stripe. */
export function panel(ctx, x, y, w, h, accent = null, alpha = 0.72) {
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.45)';
  ctx.shadowBlur = 14;
  ctx.shadowOffsetY = 4;
  roundRect(ctx, x, y, w, h, 10);
  const g = ctx.createLinearGradient(x, y, x, y + h);
  g.addColorStop(0, `rgba(30,22,52,${alpha})`);
  g.addColorStop(1, `rgba(12,10,26,${alpha + 0.08})`);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.restore();
  ctx.strokeStyle = 'rgba(255,255,255,0.14)';
  ctx.lineWidth = 1;
  roundRect(ctx, x + 0.5, y + 0.5, w - 1, h - 1, 10);
  ctx.stroke();
  if (accent) {
    ctx.fillStyle = accent;
    roundRect(ctx, x, y + 8, 4, h - 16, 2);
    ctx.fill();
  }
}

/** Text with a dark outline so it reads over anything. */
export function outlined(ctx, text, x, y, fill, size, weight = 700, align = 'left', font = FONT, stroke = 'rgba(10,6,24,0.85)') {
  ctx.font = `${weight} ${size}px ${font}`;
  ctx.textAlign = align;
  ctx.textBaseline = 'alphabetic';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = stroke;
  ctx.lineWidth = Math.max(2, size * 0.16);
  ctx.strokeText(text, x, y);
  ctx.fillStyle = fill;
  ctx.fillText(text, x, y);
}

export function text(ctx, str, x, y, fill, size, weight = 600, align = 'left', font = FONT) {
  ctx.font = `${weight} ${size}px ${font}`;
  ctx.textAlign = align;
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = fill;
  ctx.fillText(str, x, y);
}

/** Word-wrap `str` to `width`; returns lines. */
export function wrap(ctx, str, width) {
  const words = str.split(' ');
  const lines = [];
  let line = '';
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > width && line) {
      lines.push(line);
      line = w;
    } else line = test;
  }
  if (line) lines.push(line);
  return lines;
}

export function starPath(ctx, x, y, r) {
  ctx.beginPath();
  for (let i = 0; i < 10; i += 1) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r * 0.45 : r;
    if (i === 0) ctx.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    else ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath();
}

/** Map / minimap icons by name, drawn in a circle of radius r. */
export function drawIcon(ctx, icon, x, y, r, color) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = 'rgba(10,6,24,0.85)';
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(1.5, r * 0.16);
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  const k = r * 0.55;
  ctx.beginPath();
  switch (icon) {
    case 'house':
      ctx.moveTo(-k, 0);
      ctx.lineTo(0, -k);
      ctx.lineTo(k, 0);
      ctx.lineTo(k * 0.7, 0);
      ctx.lineTo(k * 0.7, k);
      ctx.lineTo(-k * 0.7, k);
      ctx.lineTo(-k * 0.7, 0);
      ctx.closePath();
      ctx.fill();
      break;
    case 'gun':
      ctx.fillRect(-k, -k * 0.35, k * 2, k * 0.55);
      ctx.fillRect(-k * 0.2, 0, k * 0.5, k * 0.9);
      break;
    case 'spray':
      ctx.fillRect(-k * 0.4, -k * 0.4, k * 0.8, k * 1.4);
      ctx.fillRect(-k * 0.15, -k, k * 0.3, k * 0.6);
      ctx.arc(k * 0.6, -k * 0.8, k * 0.2, 0, Math.PI * 2);
      ctx.fill();
      break;
    case 'cross':
      ctx.fillRect(-k * 0.3, -k, k * 0.6, k * 2);
      ctx.fillRect(-k, -k * 0.3, k * 2, k * 0.6);
      break;
    case 'badge':
      starPath(ctx, 0, 0, k);
      ctx.fill();
      break;
    case 'flag':
      ctx.fillRect(-k * 0.7, -k, k * 0.2, k * 2);
      for (let i = 0; i < 3; i += 1) for (let j = 0; j < 2; j += 1) if ((i + j) % 2 === 0) ctx.fillRect(-k * 0.5 + i * k * 0.5, -k + j * k * 0.5, k * 0.5, k * 0.5);
      ctx.strokeRect(-k * 0.5, -k, k * 1.5, k);
      break;
    case 'star':
      starPath(ctx, 0, 0, k * 1.05);
      ctx.fill();
      break;
    case 'tape':
      ctx.fillRect(-k, -k * 0.6, k * 2, k * 1.2);
      ctx.fillStyle = 'rgba(10,6,24,0.85)';
      ctx.beginPath();
      ctx.arc(-k * 0.45, 0, k * 0.25, 0, Math.PI * 2);
      ctx.arc(k * 0.45, 0, k * 0.25, 0, Math.PI * 2);
      ctx.fill();
      break;
    default:
      ctx.font = `900 ${Math.round(r * 1.1)}px ${DISPLAY}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(icon, 0, r * 0.06);
  }
  ctx.restore();
}

/** A weapon silhouette facing right, about w wide. */
export function drawWeaponIcon(ctx, id, x, y, w, color = '#f4f1de') {
  ctx.save();
  ctx.translate(x, y);
  const s = w / 100;
  ctx.scale(s, s);
  ctx.fillStyle = color;
  ctx.beginPath();
  if (id === 'pistol') {
    ctx.rect(20, -14, 62, 16);
    ctx.moveTo(28, 2);
    ctx.lineTo(48, 2);
    ctx.lineTo(42, 34);
    ctx.lineTo(24, 34);
    ctx.closePath();
    ctx.rect(46, 2, 10, 10);
  } else if (id === 'smg') {
    ctx.rect(14, -12, 70, 18);
    ctx.rect(84, -6, 12, 6);
    ctx.rect(40, 6, 10, 30);
    ctx.rect(22, 6, 12, 20);
    ctx.rect(0, -8, 16, 8);
  } else if (id === 'shotgun') {
    ctx.rect(30, -10, 70, 9);
    ctx.rect(36, -1, 44, 7);
    ctx.moveTo(30, -10);
    ctx.lineTo(0, -4);
    ctx.lineTo(0, 12);
    ctx.lineTo(30, 4);
    ctx.closePath();
  } else {
    ctx.rect(20, -12, 72, 14);
    ctx.rect(92, -7, 10, 5);
    ctx.rect(40, 2, 9, 26);
    ctx.rect(56, 2, 8, 16);
    ctx.moveTo(20, -12);
    ctx.lineTo(-2, -6);
    ctx.lineTo(-2, 10);
    ctx.lineTo(20, 2);
    ctx.closePath();
    ctx.rect(36, -20, 26, 6);
  }
  ctx.fill();
  ctx.restore();
}
