// Land and water: a signed distance to the coast (negative on land) built from the rounded
// island shapes plus seeded noise, so the shoreline is organic but the same for every seed run.
import { fractalNoise } from '../core/random.js';
import { ISLANDS } from './districts.js';

function roundBox(px, py, island) {
  const cx = (island.x0 + island.x1) / 2;
  const cy = (island.y0 + island.y1) / 2;
  const hw = (island.x1 - island.x0) / 2;
  const hh = (island.y1 - island.y0) / 2;
  const r = island.r;
  const qx = Math.abs(px - cx) - hw + r;
  const qy = Math.abs(py - cy) - hh + r;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
}

/** The terrain of one seed: sdf(x, y) is the distance to the coast, negative on land. */
export function createTerrain(seed) {
  const s = seed * 131 + 7;
  function sdf(x, y) {
    let d = Infinity;
    for (let i = 0; i < ISLANDS.length; i += 1) {
      const v = roundBox(x, y, ISLANDS[i]);
      if (v < d) d = v;
    }
    if (d > 260) return d;
    return d + fractalNoise(x / 420, y / 420, s) * 46 + fractalNoise(x / 95, y / 95, s + 3) * 12;
  }
  function islandAt(x, y) {
    for (const island of ISLANDS) if (x >= island.x0 - 60 && x <= island.x1 + 60 && y >= island.y0 - 60 && y <= island.y1 + 60) return island;
    return null;
  }
  return { seed, sdf, islandAt };
}
