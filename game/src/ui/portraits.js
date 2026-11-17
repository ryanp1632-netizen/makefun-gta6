// Code-drawn portraits of the cast for dialogue boxes, the title screen and the chapter list:
// a coloured backdrop, shoulders and outfit, face, hair and each character's signature details.

const FACES = {
  dez: { skin: '#b97a4a', hair: '#1b1b1b', shirt: '#ff6b5a', bg: ['#ff8a5c', '#5a1d4a'], hairStyle: 'fade', stubble: true, pattern: '#ffe66d' },
  pearl: { skin: '#7a4a2a', hair: '#d9d4cc', shirt: '#2a9d8f', bg: ['#5ad8ff', '#13324a'], hairStyle: 'afro', glasses: true, earrings: '#ffd166' },
  juno: { skin: '#e8b98a', hair: '#ff4fa3', shirt: '#1d1f24', bg: ['#ff4fa3', '#3a1040'], hairStyle: 'bob', aviators: true },
  mags: { skin: '#c68642', hair: '#2b1a10', shirt: '#ffb347', bg: ['#ffb347', '#4a2a10'], hairStyle: 'bun', bandana: '#e63946' },
  benning: { skin: '#e0ac69', hair: '#5a4630', shirt: '#2a4d8f', bg: ['#5aa0ff', '#0d1a3a'], hairStyle: 'cap', mustache: true },
  silas: { skin: '#e8c39e', hair: '#e8e4dc', shirt: '#f4f1de', bg: ['#e05050', '#2a0a14'], hairStyle: 'slick', scar: true, chain: true },
};

function roundRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Draw `who`'s portrait in a size x size square at (x, y). */
export function drawPortrait(ctx, who, x, y, size) {
  const f = FACES[who] ?? FACES.dez;
  const s = size / 100;
  ctx.save();
  roundRectPath(ctx, x, y, size, size, 10 * s);
  ctx.clip();
  const g = ctx.createLinearGradient(x, y, x + size, y + size);
  g.addColorStop(0, f.bg[0]);
  g.addColorStop(1, f.bg[1]);
  ctx.fillStyle = g;
  ctx.fillRect(x, y, size, size);
  // Sunburst stripes behind the head.
  ctx.globalAlpha = 0.14;
  ctx.fillStyle = '#ffffff';
  for (let i = 0; i < 10; i += 1) {
    ctx.beginPath();
    ctx.moveTo(x + 50 * s, y + 45 * s);
    const a0 = (i / 10) * Math.PI * 2;
    ctx.arc(x + 50 * s, y + 45 * s, 90 * s, a0, a0 + 0.3);
    ctx.closePath();
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.translate(x, y);
  ctx.scale(s, s);
  // Shoulders and outfit.
  ctx.fillStyle = f.shirt;
  ctx.beginPath();
  ctx.moveTo(8, 100);
  ctx.quadraticCurveTo(14, 70, 50, 68);
  ctx.quadraticCurveTo(86, 70, 92, 100);
  ctx.closePath();
  ctx.fill();
  if (f.pattern) {
    ctx.fillStyle = f.pattern;
    for (const [px, py] of [[24, 88], [36, 80], [66, 82], [78, 92], [56, 94], [44, 96]]) {
      ctx.beginPath();
      ctx.arc(px, py, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  if (who === 'benning') {
    ctx.fillStyle = '#ffd166';
    ctx.beginPath();
    ctx.moveTo(30, 84);
    ctx.lineTo(34, 78);
    ctx.lineTo(38, 84);
    ctx.lineTo(34, 90);
    ctx.closePath();
    ctx.fill();
  }
  if (f.chain) {
    ctx.strokeStyle = '#ffd166';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(50, 70, 14, 0.3, Math.PI - 0.3);
    ctx.stroke();
  }
  // Neck and head.
  ctx.fillStyle = f.skin;
  ctx.fillRect(42, 56, 16, 16);
  ctx.beginPath();
  ctx.ellipse(50, 42, 19, 23, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,0.12)';
  ctx.beginPath();
  ctx.ellipse(58, 44, 10, 20, 0, -Math.PI / 2, Math.PI / 2);
  ctx.fill();
  // Hair.
  ctx.fillStyle = f.hair;
  if (f.hairStyle === 'afro') {
    ctx.beginPath();
    ctx.arc(50, 28, 27, Math.PI * 0.9, Math.PI * 2.1);
    ctx.fill();
    for (const [hx, hy] of [[28, 34], [72, 34], [34, 16], [66, 16], [50, 10]]) {
      ctx.beginPath();
      ctx.arc(hx, hy, 10, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (f.hairStyle === 'bob') {
    ctx.beginPath();
    ctx.moveTo(28, 52);
    ctx.quadraticCurveTo(24, 14, 50, 16);
    ctx.quadraticCurveTo(78, 14, 72, 52);
    ctx.lineTo(66, 52);
    ctx.quadraticCurveTo(68, 28, 50, 26);
    ctx.quadraticCurveTo(32, 28, 34, 52);
    ctx.closePath();
    ctx.fill();
  } else if (f.hairStyle === 'bun') {
    ctx.beginPath();
    ctx.ellipse(50, 26, 20, 11, 0, Math.PI, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(50, 12, 8, 0, Math.PI * 2);
    ctx.fill();
  } else if (f.hairStyle === 'slick') {
    ctx.beginPath();
    ctx.ellipse(50, 26, 20, 12, -0.15, Math.PI, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(30, 24, 6, 14);
  } else if (f.hairStyle === 'fade') {
    ctx.beginPath();
    ctx.ellipse(50, 25, 19, 10, 0, Math.PI, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 0.5;
    ctx.fillRect(31, 25, 4, 14);
    ctx.fillRect(65, 25, 4, 14);
    ctx.globalAlpha = 1;
  }
  if (f.hairStyle === 'cap') {
    ctx.fillStyle = '#14213d';
    ctx.beginPath();
    ctx.ellipse(50, 24, 22, 12, 0, Math.PI, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(28, 22, 44, 6);
    ctx.fillStyle = '#ffd166';
    ctx.fillRect(46, 15, 8, 6);
  }
  if (f.bandana) {
    ctx.fillStyle = f.bandana;
    ctx.fillRect(31, 24, 38, 7);
  }
  // Eyes, brows, mouth.
  ctx.fillStyle = '#1b1b1b';
  ctx.beginPath();
  ctx.ellipse(42, 42, 2.4, 2.8, 0, 0, Math.PI * 2);
  ctx.ellipse(58, 42, 2.4, 2.8, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = f.hairStyle === 'afro' ? '#cfc8bc' : '#2b1a10';
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.moveTo(37, 36);
  ctx.lineTo(46, 35);
  ctx.moveTo(54, 35);
  ctx.lineTo(63, 36);
  ctx.stroke();
  ctx.strokeStyle = '#6a2a2a';
  ctx.lineWidth = 2;
  ctx.beginPath();
  if (who === 'silas') {
    ctx.moveTo(43, 55);
    ctx.quadraticCurveTo(52, 52, 58, 56);
  } else {
    ctx.moveTo(44, 54);
    ctx.quadraticCurveTo(50, 58, 56, 54);
  }
  ctx.stroke();
  if (f.stubble) {
    ctx.fillStyle = 'rgba(30,20,10,0.35)';
    ctx.beginPath();
    ctx.ellipse(50, 56, 14, 8, 0, 0, Math.PI);
    ctx.fill();
  }
  if (f.mustache) {
    ctx.fillStyle = '#5a4630';
    ctx.fillRect(42, 49, 16, 4);
  }
  if (f.glasses) {
    ctx.strokeStyle = '#ffd166';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(42, 42, 6, 0, Math.PI * 2);
    ctx.arc(58, 42, 6, 0, Math.PI * 2);
    ctx.moveTo(48, 42);
    ctx.lineTo(52, 42);
    ctx.stroke();
  }
  if (f.aviators) {
    ctx.fillStyle = 'rgba(40,20,60,0.85)';
    ctx.beginPath();
    ctx.ellipse(41, 43, 7, 5, 0, 0, Math.PI * 2);
    ctx.ellipse(59, 43, 7, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.fillRect(37, 40, 4, 2);
    ctx.fillRect(55, 40, 4, 2);
  }
  if (f.earrings) {
    ctx.fillStyle = f.earrings;
    ctx.beginPath();
    ctx.arc(31, 50, 3, 0, Math.PI * 2);
    ctx.arc(69, 50, 3, 0, Math.PI * 2);
    ctx.fill();
  }
  if (f.scar) {
    ctx.strokeStyle = '#a04040';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(60, 32);
    ctx.lineTo(66, 50);
    ctx.stroke();
  }
  ctx.restore();
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 2;
  roundRectPath(ctx, x + 1, y + 1, size - 2, size - 2, 10 * s);
  ctx.stroke();
}
