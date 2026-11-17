// Set dressing that makes the generated grid feel like a coastal city: palms and lamps along the
// streets, marina piers with moored boats, a beach of umbrellas and lifeguard huts, a container
// port with cranes and a freighter, the Keystone airstrip, the private isle, and the shoreline
// samples the renderer animates foam along.
import { addBuilding, addLot, addTree, containerRows } from './cityGenerator.js';
import { CAR_PAINT } from '../vehicles/vehicleModels.js';
import { districtIdAt } from './districts.js';
import { SIDEWALK } from './roadGraph.js';

const UMBRELLA_COLORS = [['#ff5a5f', '#fff4e6'], ['#2ec4b6', '#ffffff'], ['#ffbf00', '#ff6b35'], ['#3a86ff', '#ffffff'], ['#ff7eb6', '#ffe5ec'], ['#06d6a0', '#fffcf2']];
const BOAT_COLORS = ['#ffffff', '#f4f1ea', '#e9f1f7', '#1f3b57', '#c0392b', '#ffffff'];

function onAnyRoad(city, x, y, pad = 0) {
  for (const r of city.roads) {
    if (x >= r.x0 - r.hw - pad && x <= r.x1 + r.hw + pad && y >= r.y0 - r.hw - pad && y <= r.y1 + r.hw + pad) return true;
  }
  return false;
}

function inAnyBlock(city, x, y, pad = 0) {
  for (const b of city.blocks) if (x >= b.x0 - pad && x <= b.x1 + pad && y >= b.y0 - pad && y <= b.y1 + pad) return true;
  return false;
}

/** Street lamps on every road and palm rows along the showpiece boulevards. */
export function dressStreets(city, rng) {
  const sdf = city.terrain.sdf;
  for (const e of city.edges) {
    const na = city.nodes[e.a];
    const nb = city.nodes[e.b];
    const start = na.hw + 30;
    const end = e.len - nb.hw - 30;
    if (end - start < 20) continue;
    const ax = na.x;
    const ay = na.y;
    const rx = -e.dy;
    const ry = e.dx;
    let side = 1;
    for (let s = start + 30; s < end; s += 200) {
      const off = (e.hw + 5) * side;
      const x = ax + e.dx * s + rx * off;
      const y = ay + e.dy * s + ry * off;
      city.lamps.push({ x, y, ax: -rx * side, ay: -ry * side });
      side = -side;
    }
    const district = districtIdAt(e.mx, e.my);
    const kind = e.road.kind;
    const palmy = kind === 'highway' || kind === 'avenue' || kind === 'boulevard' || district === 'deco' || district === 'strand' || district === 'marina' || district === 'heights';
    if (!palmy) continue;
    for (let s = start + 20; s < end; s += rng.range(68, 96)) {
      for (const sd of [-1, 1]) {
        const off = (e.hw + SIDEWALK - 6) * sd;
        const x = ax + e.dx * s + rx * off;
        const y = ay + e.dy * s + ry * off;
        if (sdf(x, y) < -24 && !onAnyRoad(city, x, y, 4)) addTree(city, x, y, 'palm', rng, kind === 'boulevard' || kind === 'highway' ? 1.15 : 1);
      }
    }
  }
}

function coastX(city, y, from, step, limit) {
  let x = from;
  for (let i = 0; i < limit; i += 1) {
    if (city.terrain.sdf(x, y) > 0) return x;
    x += step;
  }
  return null;
}

function addPier(city, rng, y, cx, dir) {
  const x0 = dir > 0 ? cx - 40 : cx - 170;
  const x1 = dir > 0 ? cx + 170 : cx + 40;
  city.piers.push({ x0, y0: y - 7, x1, y1: y + 7 });
  for (let s = 40; s < 165; s += 48) {
    for (const side of [-1, 1]) {
      if (!rng.chance(0.72)) continue;
      const len = rng.range(30, 54);
      city.boats.push({
        x: cx + dir * s, y: y + side * (len < 40 ? 20 : 26), angle: dir > 0 ? 0 : Math.PI, len,
        kind: rng.pick(['yacht', 'speed', 'sail', 'speed']), color: rng.pick(BOAT_COLORS), accent: rng.pick(CAR_PAINT), seed: Math.floor(rng.next() * 1e6),
      });
    }
  }
}

/** Piers, boats, beach umbrellas, lifeguard huts, coastal palms and the docks' quay. */
export function dressCoast(city, rng) {
  const sdf = city.terrain.sdf;
  for (let y = 1720; y < 3220; y += 230) {
    if (Math.abs(y - 2592) < 100) continue;
    const cx = coastX(city, y, 3790, 4, 120);
    if (cx !== null) addPier(city, rng, y, cx, 1);
  }
  for (let y = 820; y < 3150; y += 250) {
    if (Math.abs(y - 1184) < 100 || Math.abs(y - 2592) < 100) continue;
    const cx = coastX(city, y, 4600, -4, 120);
    if (cx !== null) addPier(city, rng, y, cx, -1);
  }
  // Coral Strand: a long beach of umbrellas and towels east of the boulevard.
  for (let y = 420; y < 3360; y += 30) {
    for (let x = 5352; x < 5640; x += 38) {
      const px = x + rng.range(-10, 10);
      const py = y + rng.range(-8, 8);
      const d = sdf(px, py);
      if (d > -46 || d < -330 || !rng.chance(0.3)) continue;
      const colors = rng.pick(UMBRELLA_COLORS);
      city.umbrellas.push({ x: px, y: py, r: rng.range(12, 16), c1: colors[0], c2: colors[1], angle: rng.range(0, 6.28), towel: rng.chance(0.7) ? rng.pick(['#ff5a5f', '#3a86ff', '#ffd166', '#06d6a0', '#ff7eb6', '#ffffff']) : null, person: rng.chance(0.4), skin: rng.int(0, 4) });
    }
  }
  for (let y = 640; y < 3300; y += 540) {
    const cx = coastX(city, y, 5360, 4, 120);
    if (cx === null) continue;
    const b = addBuilding(city, { x0: cx - 110, y0: y - 9, x1: cx - 92, y1: y + 9 }, 26, 'lifeguard', 'strand', rng);
    b.wall = [255, 214, 102];
    b.roof = [255, 90, 95];
  }
  for (let y = 360; y < 3380; y += rng.range(46, 70)) {
    const x = 5336 + rng.range(-6, 12);
    if (sdf(x, y) < -30) addTree(city, x, y, 'palm', rng, 1.1);
  }
  // Coastal greenery around the rest of the islands.
  for (let i = 0; i < 1400; i += 1) {
    const x = rng.range(640, 6200);
    const y = rng.range(260, 4620);
    const d = sdf(x, y);
    if (d > -28 || d < -170) continue;
    const district = districtIdAt(x, y);
    if (district === 'docks' || district === 'field' || district === 'strand' || district === 'bay') continue;
    if (onAnyRoad(city, x, y, 34) || inAnyBlock(city, x, y, 26)) continue;
    addTree(city, x, y, district === 'heights' && rng.chance(0.5) ? 'tree' : 'palm', rng);
  }
  // Bayline Docks: a container quay along the south shore, cranes and a moored freighter.
  const quayY0 = city.grid.ys[city.grid.ys.length - 1] + 30 + SIDEWALK;
  containerRows(city, { x0: 1200, y0: quayY0 + 6, x1: 2800, y1: quayY0 + 34 }, 'docks', rng);
  city.cranes = [];
  for (let y = 3480; y < 4080; y += 270) {
    const cx = coastX(city, y, 840, -4, 80);
    if (cx !== null) city.cranes.push({ x: cx + 40, y, h: 150, angle: Math.PI, seed: Math.floor(rng.next() * 1e6) });
  }
  const shipX = (coastX(city, 3760, 840, -4, 100) ?? 700) - 70;
  city.boats.push({ x: shipX, y: 3760, angle: Math.PI / 2, len: 430, kind: 'ship', color: '#24384f', accent: '#c0392b', seed: 99 });
  // A few boats out on the open water.
  for (let i = 0; i < 18; i += 1) {
    const x = rng.range(3950, 4450);
    const y = rng.range(300, 3700);
    if (sdf(x, y) < 40 || Math.abs(y - 1184) < 90 || Math.abs(y - 2592) < 90) continue;
    city.boats.push({ x, y, angle: rng.range(0, 6.28), len: rng.range(30, 46), kind: rng.pick(['speed', 'sail', 'yacht']), color: rng.pick(BOAT_COLORS), accent: rng.pick(CAR_PAINT), seed: i, drift: true });
  }
}

/** The Keystone airstrip: runway, apron, hangars, control tower and parked planes. */
export function buildAirfield(city, rng) {
  addLot(city, { x0: 4560, y0: 3956, x1: 6040, y1: 4176 }, 'apron', 'field');
  addLot(city, { x0: 4600, y0: 4196, x1: 5960, y1: 4316 }, 'runway', 'field');
  for (const x of [4660, 4920, 5180]) {
    const b = addBuilding(city, { x0: x, y0: 3966, x1: x + 200, y1: 4070 }, 40, 'hangar', 'field', rng);
    b.roofType = 'arch';
    b.wall = [196, 200, 204];
    b.roof = [176, 184, 190];
  }
  const tower = addBuilding(city, { x0: 5600, y0: 3972, x1: 5640, y1: 4012 }, 118, 'control', 'field', rng);
  tower.wall = [222, 222, 214];
  tower.roof = [60, 70, 80];
  const ops = addBuilding(city, { x0: 5680, y0: 3966, x1: 5860, y1: 4040 }, 30, 'marina', 'field', rng);
  ops.sign = { text: 'KEYSTONE AIR', color: '#9be564', edge: 's' };
  city.planes.push({ x: 5480, y: 4120, angle: Math.PI, color: '#f4f4f4', accent: '#e63946', span: 70 });
  city.planes.push({ x: 5900, y: 4110, angle: Math.PI * 0.9, color: '#ffffff', accent: '#3a86ff', span: 56 });
  city.planes.push({ x: 4790, y: 4122, angle: 0.15, color: '#1d1f24', accent: '#ffd166', span: 90, jet: true });
  for (let i = 0; i < 40; i += 1) {
    const x = rng.range(4500, 6060);
    const y = rng.range(4330, 4520);
    if (city.terrain.sdf(x, y) < -30) addTree(city, x, y, rng.chance(0.5) ? 'palm' : 'tree', rng, 0.9);
  }
}

/** Grieve Isle: the rival boss's walled estate in the middle of the bay. */
export function buildIsle(city, rng) {
  addLot(city, { x0: 4100, y0: 1236, x1: 4300, y1: 1372 }, 'lawn', 'isle');
  const b = addBuilding(city, { x0: 4128, y0: 1252, x1: 4250, y1: 1316 }, 38, 'villa', 'isle', rng);
  b.roofType = 'hip';
  b.wall = [248, 246, 240];
  b.roof = [58, 60, 68];
  addLot(city, { x0: 4140, y0: 1324, x1: 4230, y1: 1356 }, 'pool', 'isle');
  addLot(city, { x0: 4110, y0: 1010, x1: 4290, y1: 1140 }, 'lawn', 'isle');
  addLot(city, { x0: 4160, y0: 1030, x1: 4240, y1: 1110 }, 'helipad', 'isle');
  for (let i = 0; i < 16; i += 1) {
    const x = rng.range(4070, 4330);
    const y = rng.range(990, 1420);
    if (city.terrain.sdf(x, y) < -14 && Math.abs(y - 1184) > 50 && !(x > 4120 && x < 4260 && y > 1244 && y < 1360) && !(x > 4150 && x < 4250 && y > 1020 && y < 1120)) addTree(city, x, y, 'palm', rng);
  }
}

/** Sample the shoreline (away from bridges) for the animated foam, bucketed for view queries. */
export function traceCoast(city) {
  const sdf = city.terrain.sdf;
  const step = 14;
  const CELL = 256;
  const cols = Math.ceil(city.width / CELL);
  const rows = Math.ceil(city.height / CELL);
  const cells = Array.from({ length: cols * rows }, () => []);
  for (let y = 200; y < city.height - 100; y += step) {
    for (let x = 500; x < city.width - 100; x += step) {
      const d = sdf(x, y);
      if (d < -7 || d > 7) continue;
      if (onAnyRoad(city, x, y, 6)) continue;
      const gx = sdf(x + 4, y) - sdf(x - 4, y);
      const gy = sdf(x, y + 4) - sdf(x, y - 4);
      const l = Math.hypot(gx, gy) || 1;
      const p = { x: x - (gx / l) * d, y: y - (gy / l) * d, nx: gx / l, ny: gy / l, phase: (x * 0.013 + y * 0.021) % 6.28 };
      cells[Math.floor(p.y / CELL) * cols + Math.floor(p.x / CELL)].push(p);
    }
  }
  city.coastCells = { cols, rows, cells, CELL };
}
