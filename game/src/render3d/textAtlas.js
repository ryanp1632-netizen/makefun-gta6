// One canvas of white lettering for every sign, billboard and painted marking in the 3D city
// (hotel names, brands, the precinct, helipad H's). The shaders use its alpha as a mask and tint
// it with the sign's neon colour, so one entry serves every colour the text appears in.
const CELL_W = 512;
const CELL_H = 64;
const COLS = 4;
const ROWS = 32;

export function createTextAtlas() {
  const canvas = document.createElement('canvas');
  canvas.width = CELL_W * COLS;
  canvas.height = CELL_H * ROWS;
  const ctx = canvas.getContext('2d');
  return { canvas, ctx, entries: new Map(), next: 0, dirty: true };
}

/** The atlas rectangle for `text` (uv 0..1) and its aspect ratio (width / height of the lettering). */
export function atlasEntry(atlas, text) {
  let e = atlas.entries.get(text);
  if (e) return e;
  if (atlas.next >= COLS * ROWS) return atlas.entries.values().next().value;
  const i = atlas.next++;
  const cx = (i % COLS) * CELL_W;
  const cy = Math.floor(i / COLS) * CELL_H;
  const ctx = atlas.ctx;
  let size = 46;
  ctx.font = `900 ${size}px "Arial Black", "Bahnschrift", Arial, sans-serif`;
  let w = ctx.measureText(text).width;
  if (w > CELL_W - 30) {
    size = Math.floor(size * ((CELL_W - 30) / w));
    ctx.font = `900 ${size}px "Arial Black", "Bahnschrift", Arial, sans-serif`;
    w = ctx.measureText(text).width;
  }
  ctx.save();
  ctx.beginPath();
  ctx.rect(cx, cy, CELL_W, CELL_H);
  ctx.clip();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(255,255,255,0.55)';
  ctx.shadowBlur = 7;
  ctx.fillStyle = '#ffffff';
  ctx.fillText(text, cx + CELL_W / 2, cy + CELL_H / 2 + 2);
  ctx.shadowBlur = 0;
  ctx.fillText(text, cx + CELL_W / 2, cy + CELL_H / 2 + 2);
  ctx.restore();
  const pad = Math.max(8, (CELL_W - w) / 2 - 10);
  e = {
    u0: (cx + pad) / atlas.canvas.width, u1: (cx + CELL_W - pad) / atlas.canvas.width,
    v0: cy / atlas.canvas.height, v1: (cy + CELL_H) / atlas.canvas.height,
    aspect: (CELL_W - pad * 2) / CELL_H,
  };
  atlas.entries.set(text, e);
  atlas.dirty = true;
  return e;
}
