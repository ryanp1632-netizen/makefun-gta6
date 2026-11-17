// Seeded randomness. Everything the simulation rolls goes through createRandom so a seed always
// replays the same city, the same traffic and the same screenshot frame; renderers use the
// stateless hash helpers so drawing never disturbs the simulation's stream.

/** A small, fast PRNG (mulberry32) with helpers for ranges, picks and chances. */
export function createRandom(seed) {
  let state = (seed >>> 0) || 0x9e3779b9;
  function next() {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  return {
    next,
    range: (a, b) => a + (b - a) * next(),
    int: (a, b) => a + Math.floor(next() * (b - a + 1)),
    pick: (list) => list[Math.floor(next() * list.length)],
    chance: (p) => next() < p,
    sign: () => (next() < 0.5 ? -1 : 1),
  };
}

/** A stable 0..1 hash of two integers and a seed (no state). */
export function hash2(x, y, seed = 0) {
  let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(seed | 0, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** A stable 0..1 hash of one integer. */
export function hash1(n, seed = 0) {
  return hash2(n, n * 31 + 7, seed);
}

/** Smooth value noise in 0..1, period-free, for coastlines and ground texture. */
export function valueNoise(x, y, seed = 0) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi, seed);
  const b = hash2(xi + 1, yi, seed);
  const c = hash2(xi, yi + 1, seed);
  const d = hash2(xi + 1, yi + 1, seed);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

/** Two octaves of value noise, centred on zero (-1..1). */
export function fractalNoise(x, y, seed = 0) {
  return (valueNoise(x, y, seed) * 0.66 + valueNoise(x * 2.7, y * 2.7, seed + 17) * 0.34) * 2 - 1;
}
