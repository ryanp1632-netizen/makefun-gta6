// Procedural surface textures (asphalt, pavers, sand, grass, cobbles, planks), painted pixel by
// pixel once at start-up and used as tiling patterns when the ground chunks are drawn.
import { hash2, valueNoise } from '../core/random.js';

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function paint(size, fn) {
  const c = makeCanvas(size, size);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const [r, g, b, a = 255] = fn(x, y);
      const i = (y * size + x) * 4;
      img.data[i] = r;
      img.data[i + 1] = g;
      img.data[i + 2] = b;
      img.data[i + 3] = a;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

/** Tileable noise: wraps by sampling a torus of value noise. */
function tileNoise(x, y, size, freq, seed) {
  const u = x / size;
  const v = y / size;
  const a = valueNoise(u * freq, v * freq, seed);
  const b = valueNoise((u - 1) * freq, v * freq, seed);
  const c = valueNoise(u * freq, (v - 1) * freq, seed);
  const d = valueNoise((u - 1) * freq, (v - 1) * freq, seed);
  return a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v;
}

/** Build every texture once; returns canvases keyed by name. */
export function makeTextures() {
  const asphalt = paint(128, (x, y) => {
    const n = tileNoise(x, y, 128, 8, 3) * 14 + hash2(x, y, 1) * 10;
    const speck = hash2(x, y, 9) > 0.985 ? 18 : 0;
    const v = 48 + n + speck;
    return [v, v + 2, v + 7];
  });
  const pavers = paint(64, (x, y) => {
    const edge = x % 16 === 0 || y % 16 === 0;
    const n = hash2(Math.floor(x / 16), Math.floor(y / 16), 4) * 14 + hash2(x, y, 5) * 6;
    const v = edge ? -26 : n - 8;
    return [255 + v, 255 + v, 255 + v, 255];
  });
  const sand = paint(128, (x, y) => {
    const ripple = Math.sin((x * 0.6 + y * 0.25) + tileNoise(x, y, 128, 6, 8) * 9) * 4;
    const n = hash2(x, y, 11) * 16 + ripple;
    return [232 + n * 0.5, 210 + n * 0.5, 160 + n * 0.4];
  });
  const grass = paint(128, (x, y) => {
    const n = tileNoise(x, y, 128, 10, 21) * 30 + hash2(x, y, 22) * 18;
    return [80 + n * 0.5, 140 + n, 66 + n * 0.4];
  });
  const cobble = paint(64, (x, y) => {
    const row = Math.floor(y / 8);
    const cx = Math.floor((x + (row % 2) * 5) / 10);
    const lx = (x + (row % 2) * 5) % 10;
    const ly = y % 8;
    const edge = lx === 0 || ly === 0;
    const n = hash2(cx, row, 31) * 30;
    const v = edge ? 150 : 196 + n * 0.6 - 10;
    return [v + 8, v - 4, v - 22];
  });
  const planks = paint(64, (x, y) => {
    const board = Math.floor(y / 8);
    const seam = y % 8 === 0 || (x + board * 23) % 64 === 0;
    const n = hash2(board, Math.floor(x / 3), 41) * 18;
    const v = seam ? 92 : 150 + n;
    return [v, v * 0.72, v * 0.48];
  });
  const terracotta = paint(32, (x, y) => {
    const row = Math.floor(y / 6);
    const ly = y % 6;
    const lx = (x + (row % 2) * 4) % 8;
    const shade = ly < 1 ? -40 : lx < 1 ? -24 : 10 - ly * 4;
    return [190 + shade, 92 + shade * 0.6, 58 + shade * 0.4];
  });
  return { asphalt, pavers, sand, grass, cobble, planks, terracotta };
}
