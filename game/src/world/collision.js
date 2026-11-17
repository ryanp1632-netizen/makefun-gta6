// Spatial queries against the static city: which buildings and roads are near a point, pushing
// circles out of walls, water tests that respect bridges, and ray casts for bullets and sight.
import { circleAabbPush, rayAabb } from '../core/math.js';

const CELL = 256;
let stamp = 1;

/** Bucket every building and road of the city into a coarse grid. */
export function buildSpatialIndex(city) {
  const cols = Math.ceil(city.width / CELL);
  const rows = Math.ceil(city.height / CELL);
  const bcells = Array.from({ length: cols * rows }, () => []);
  const rcells = Array.from({ length: cols * rows }, () => []);
  function add(cells, item, x0, y0, x1, y1) {
    const i0 = Math.max(0, Math.floor(x0 / CELL));
    const i1 = Math.min(cols - 1, Math.floor(x1 / CELL));
    const j0 = Math.max(0, Math.floor(y0 / CELL));
    const j1 = Math.min(rows - 1, Math.floor(y1 / CELL));
    for (let j = j0; j <= j1; j += 1) for (let i = i0; i <= i1; i += 1) cells[j * cols + i].push(item);
  }
  for (const b of city.buildings) {
    b.q = 0;
    add(bcells, b, b.x0, b.y0, b.x1, b.y1);
  }
  for (const r of city.roads) {
    r.rx0 = r.x0 - r.hw;
    r.ry0 = r.y0 - r.hw;
    r.rx1 = r.x1 + r.hw;
    r.ry1 = r.y1 + r.hw;
    add(rcells, r, r.rx0, r.ry0, r.rx1, r.ry1);
  }
  city.index = { cols, rows, bcells, rcells };
}

/** Buildings whose footprint may overlap the rectangle (each once). */
export function buildingsInRect(city, x0, y0, x1, y1, out = []) {
  const { cols, rows, bcells } = city.index;
  stamp += 1;
  out.length = 0;
  const i0 = Math.max(0, Math.floor(x0 / CELL));
  const i1 = Math.min(cols - 1, Math.floor(x1 / CELL));
  const j0 = Math.max(0, Math.floor(y0 / CELL));
  const j1 = Math.min(rows - 1, Math.floor(y1 / CELL));
  for (let j = j0; j <= j1; j += 1) {
    for (let i = i0; i <= i1; i += 1) {
      const cell = bcells[j * cols + i];
      for (let k = 0; k < cell.length; k += 1) {
        const b = cell[k];
        if (b.q === stamp) continue;
        b.q = stamp;
        if (b.x1 >= x0 && b.x0 <= x1 && b.y1 >= y0 && b.y0 <= y1) out.push(b);
      }
    }
  }
  return out;
}

/** The road under (x, y), intersections included, or null. */
export function roadAt(city, x, y) {
  const { cols, rows, rcells } = city.index;
  const i = Math.floor(x / CELL);
  const j = Math.floor(y / CELL);
  if (i < 0 || j < 0 || i >= cols || j >= rows) return null;
  const cell = rcells[j * cols + i];
  for (let k = 0; k < cell.length; k += 1) {
    const r = cell[k];
    if (x >= r.rx0 && x <= r.rx1 && y >= r.ry0 && y <= r.ry1) return r;
  }
  return null;
}

/** Deep water that is not under a road or bridge deck. */
export function isWater(city, x, y) {
  return city.terrain.sdf(x, y) > 4 && roadAt(city, x, y) === null;
}

const scratch = [];
const scratch2 = [];

/**
 * Push a circle out of every solid building it overlaps. Returns the corrected position and the
 * strongest contact normal ({x, y, hit, nx, ny, depth}).
 */
export function pushOutOfBuildings(city, x, y, r) {
  const list = buildingsInRect(city, x - r, y - r, x + r, y + r, scratch2);
  let hit = false;
  let nx = 0;
  let ny = 0;
  let depth = 0;
  for (const b of list) {
    if (!b.solid) continue;
    const c = circleAabbPush(x, y, r, b.x0, b.y0, b.x1, b.y1);
    if (c) {
      x += c.nx * c.depth;
      y += c.ny * c.depth;
      if (c.depth > depth) {
        depth = c.depth;
        nx = c.nx;
        ny = c.ny;
      }
      hit = true;
    }
  }
  return { x, y, hit, nx, ny, depth };
}

/** Distance along a unit ray to the first solid building (capped at maxD). */
export function raycastBuildings(city, ox, oy, dx, dy, maxD) {
  const ex = ox + dx * maxD;
  const ey = oy + dy * maxD;
  const list = buildingsInRect(city, Math.min(ox, ex), Math.min(oy, ey), Math.max(ox, ex), Math.max(oy, ey), scratch);
  let best = maxD;
  for (const b of list) {
    if (!b.solid || b.h < 12) continue;
    const t = rayAabb(ox, oy, dx, dy, b.x0, b.y0, b.x1, b.y1);
    if (t < best) best = t;
  }
  return best;
}

/** Whether nothing solid stands between two points. */
export function hasLineOfSight(city, ax, ay, bx, by) {
  const d = Math.hypot(bx - ax, by - ay);
  if (d < 1) return true;
  return raycastBuildings(city, ax, ay, (bx - ax) / d, (by - ay) / d, d) >= d - 1;
}
