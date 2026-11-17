// Builds Halcyon Keys from a seed: a jittered avenue grid per island joined by causeways, the
// blocks between the roads split into lots, and each lot filled the way its district builds
// (towers, pastel hotels, terracotta lanes, villas, warehouses, container yards).
import { DISTRICTS, districtIdAt, WORLD_H, WORLD_W } from './districts.js';
import { buildRoadGraph, LANE_W, SIDEWALK } from './roadGraph.js';
import { createTerrain } from './terrain.js';
import { placeLandmarks } from './landmarks.js';
import { furnishStreets } from './streetFurniture.js';
import { dressCoast, dressStreets, buildAirfield, buildIsle, traceCoast } from './cityDressing.js';
import { buildSpatialIndex } from './collision.js';
import { createRandom } from '../core/random.js';
import { clamp } from '../core/math.js';
import { CAR_PAINT } from '../vehicles/vehicleModels.js';

/** Generate the whole city for `seed`. */
export function generateCity(seed) {
  const rng = createRandom(seed * 7919 + 101);
  const city = {
    seed, width: WORLD_W, height: WORLD_H, terrain: createTerrain(seed),
    roads: [], nodes: [], edges: [], blocks: [], lots: [], buildings: [], trees: [], lamps: [],
    umbrellas: [], piers: [], boats: [], planes: [], parked: [], coast: [], pois: {}, collectibles: [], grid: null,
  };
  planRoads(city, rng);
  buildRoadGraph(city);
  planBlocks(city);
  for (const block of city.blocks) {
    const first = city.buildings.length;
    fillBlock(city, block, rng);
    for (let i = first; i < city.buildings.length; i += 1) city.buildings[i].block = block;
  }
  dressStreets(city, rng);
  dressCoast(city, rng);
  buildAirfield(city, rng);
  buildIsle(city, rng);
  traceCoast(city);
  city.buildings.forEach((b, i) => {
    b.id = i;
  });
  buildSpatialIndex(city);
  placeLandmarks(city, rng);
  furnishStreets(city);
  return city;
}

export const BRANDS = ['SUNWAVE', 'TIDAL GIN', 'NEONADE', 'MANGO RUSH', 'KEYCAB', 'GULF GOLD', 'BRISA COLA', 'PALMCO', 'REEFLINE', 'ORCA MOBILE', 'HALO JUICE', 'SALT & SON', 'FLAMINGO FM', 'KOI KOI'];
export const HOTELS = ['HOTEL CORALIE', 'THE SEABREEZE', 'STARLITE', 'AZURE ARMS', 'PALOMA GRAND', 'LA MAREA', 'MOONRAY', 'THE FLORETTE', 'CASA LUNA', 'NOVA BAY', 'THE BELMAR', 'GLORIETTA'];
export const NEON = ['#ff4fd8', '#3ee6ff', '#ffe14f', '#7dff6a', '#ff6a4f', '#b26bff', '#ff8fd0'];

const snap = (v) => Math.round(v / 32) * 32;

function spread(a, b, n, rng, jitter) {
  const out = [a];
  for (let i = 1; i < n; i += 1) out.push(snap(a + ((b - a) * i) / n + rng.range(-jitter, jitter)));
  out.push(b);
  return out;
}

function closestIndex(list, v) {
  let best = 1;
  for (let i = 1; i < list.length - 1; i += 1) if (Math.abs(list[i] - v) < Math.abs(list[best] - v)) best = i;
  return best;
}

function planRoads(city, rng) {
  const xs = spread(896, 3712, 7, rng, 40);
  const ys = spread(672, 4128, 9, rng, 40);
  ys[closestIndex(ys, 1184)] = 1184;
  ys[closestIndex(ys, 2592)] = 2592;
  const bxs = [4672, 4976, 5248];
  const bys = ys.filter((y) => y >= 600 && y <= 3260);
  const mercadoTop = ys.find((y) => y >= 1650);
  const mercadoBottom = [...ys].reverse().find((y) => y <= 3300);
  const mids = [];
  for (let i = 0; i + 1 < xs.length; i += 1) {
    if (xs[i + 1] <= 2240 && xs[i + 1] - xs[i] > 300) mids.push(snap((xs[i] + xs[i + 1]) / 2));
  }
  city.grid = { xs, ys, bxs, bys, mids, mercadoTop, mercadoBottom, avenueX: xs[3], avenueY: ys[5] };
  const roads = city.roads;
  function add(x0, y0, x1, y1, lanes, kind, name) {
    roads.push({ id: roads.length, x0, y0, x1, y1, lanes, hw: lanes * LANE_W, vertical: x0 === x1, kind, name });
  }
  const last = xs.length - 1;
  xs.forEach((x, i) => {
    const lanes = i === last || i === 3 ? 2 : 1;
    add(x, ys[0], x, ys[ys.length - 1], lanes, i === last ? 'highway' : lanes === 2 ? 'avenue' : 'street', i === last ? 'Bayshore Highway' : i === 3 ? 'Halcyon Avenue' : `${i + 1}th Street`);
  });
  ys.forEach((y, j) => {
    let x1 = xs[last];
    let kind = j === 5 ? 'avenue' : 'street';
    if (y === 1184 || y === 2592) {
      x1 = bxs[2];
      kind = 'causeway';
    }
    if (j === ys.length - 1) {
      x1 = 4480;
      kind = 'causeway';
    }
    add(xs[0], y, x1, y, j === 5 || y === 2592 ? 2 : 1, kind, y === 1184 ? 'Grieve Causeway' : y === 2592 ? 'Halcyon Causeway' : j === ys.length - 1 ? 'Keystone Causeway' : `Calle ${j + 1}`);
  });
  for (const x of mids) add(x, mercadoTop, x, mercadoBottom, 1, 'lane', 'Mercado Lane');
  bxs.forEach((x, i) => add(x, bys[0], x, bys[bys.length - 1], i === 2 ? 2 : 1, i === 2 ? 'boulevard' : 'street', i === 2 ? 'Strand Boulevard' : 'Coral Street'));
  for (const y of bys) if (y !== 1184 && y !== 2592) add(bxs[0], y, bxs[2], y, 1, 'street', 'Deco Cross');
  add(bxs[1], bys[bys.length - 1], bxs[1], 3904, 1, 'causeway', 'Strand Causeway');
  add(4480, 3904, 5984, 3904, 1, 'street', 'Airfield Road');
  add(4480, 3904, 4480, 4128, 1, 'street', 'Airfield Road');
}

function halfWidthAtX(city, x) {
  let hw = LANE_W;
  for (const r of city.roads) if (r.vertical && r.x0 === x) hw = Math.max(hw, r.hw);
  return hw;
}

function halfWidthAtY(city, y) {
  let hw = LANE_W;
  for (const r of city.roads) if (!r.vertical && r.y0 === y) hw = Math.max(hw, r.hw);
  return hw;
}

function planBlocks(city) {
  const { xs, ys, bxs, bys, mids, mercadoTop, mercadoBottom } = city.grid;
  function addBlock(xa, xb, ya, yb) {
    const x0 = xa + halfWidthAtX(city, xa) + SIDEWALK;
    const x1 = xb - halfWidthAtX(city, xb) - SIDEWALK;
    const y0 = ya + halfWidthAtY(city, ya) + SIDEWALK;
    const y1 = yb - halfWidthAtY(city, yb) - SIDEWALK;
    if (x1 - x0 < 60 || y1 - y0 < 60) return;
    const cx = (x0 + x1) / 2;
    const cy = (y0 + y1) / 2;
    city.blocks.push({ id: city.blocks.length, x0, y0, x1, y1, cx, cy, district: districtIdAt(cx, cy) });
  }
  for (let j = 0; j + 1 < ys.length; j += 1) {
    const band = [...xs];
    if (ys[j] >= mercadoTop && ys[j + 1] <= mercadoBottom) band.push(...mids);
    band.sort((a, b) => a - b);
    for (let i = 0; i + 1 < band.length; i += 1) addBlock(band[i], band[i + 1], ys[j], ys[j + 1]);
  }
  for (let j = 0; j + 1 < bys.length; j += 1) for (let i = 0; i + 1 < bxs.length; i += 1) addBlock(bxs[i], bxs[i + 1], bys[j], bys[j + 1]);
}

/** Split a rectangle into lots no longer than `max` on a side. */
function splitRect(r, min, max, rng, out) {
  const w = r.x1 - r.x0;
  const h = r.y1 - r.y0;
  if (w > max && w >= h && w >= min * 2) {
    const s = snap(r.x0 + w * rng.range(0.38, 0.62));
    splitRect({ x0: r.x0, y0: r.y0, x1: s, y1: r.y1 }, min, max, rng, out);
    splitRect({ x0: s, y0: r.y0, x1: r.x1, y1: r.y1 }, min, max, rng, out);
  } else if (h > max && h >= min * 2) {
    const s = snap(r.y0 + h * rng.range(0.38, 0.62));
    splitRect({ x0: r.x0, y0: r.y0, x1: r.x1, y1: s }, min, max, rng, out);
    splitRect({ x0: r.x0, y0: s, x1: r.x1, y1: r.y1 }, min, max, rng, out);
  } else out.push(r);
  return out;
}

function addLot(city, r, kind, district, extra = {}) {
  const lot = { x0: r.x0, y0: r.y0, x1: r.x1, y1: r.y1, kind, district, seed: city.lots.length * 7 + 3, ...extra };
  city.lots.push(lot);
  return lot;
}

/** Create a building on footprint r. */
export function addBuilding(city, r, h, style, district, rng, extra = {}) {
  const d = DISTRICTS[district];
  const b = {
    x0: r.x0, y0: r.y0, x1: r.x1, y1: r.y1, h, style, district, solid: true,
    wall: rng.pick(d.walls), roof: rng.pick(d.roofs), trim: null, roofType: 'flat',
    seed: Math.floor(rng.next() * 1e9), details: [], sign: null, top: null, poi: null, ...extra,
  };
  city.buildings.push(b);
  return b;
}

function addTree(city, x, y, kind, rng, scale = 1) {
  if (kind === 'palm') city.trees.push({ kind, x, y, h: rng.range(34, 62) * scale, r: rng.range(17, 25) * scale, seed: Math.floor(rng.next() * 1e6) });
  else city.trees.push({ kind, x, y, h: rng.range(14, 26) * scale, r: rng.range(16, 26) * scale, seed: Math.floor(rng.next() * 1e6) });
}

/** Parking stalls in a lot, with parked cars in some of them. */
function fillParking(city, lot, rng, fill = 0.55) {
  const horizontal = lot.x1 - lot.x0 >= lot.y1 - lot.y0;
  lot.horizontal = horizontal;
  const models = ['sedan', 'sedan', 'coupe', 'van', 'pickup', 'taxi', 'bike', 'sedan'];
  if (horizontal) {
    for (let x = lot.x0 + 18; x + 14 < lot.x1; x += 28) {
      for (const [y, a] of [[lot.y0 + 30, Math.PI / 2], [lot.y1 - 30, -Math.PI / 2]]) {
        if (lot.y1 - lot.y0 < 130 && a < 0) continue;
        if (rng.chance(fill)) city.parked.push({ model: rng.pick(models), color: rng.pick(CAR_PAINT), x, y, angle: a + rng.range(-0.05, 0.05) });
      }
    }
  } else {
    for (let y = lot.y0 + 18; y + 14 < lot.y1; y += 28) {
      for (const [x, a] of [[lot.x0 + 30, 0], [lot.x1 - 30, Math.PI]]) {
        if (lot.x1 - lot.x0 < 130 && a > 1) continue;
        if (rng.chance(fill)) city.parked.push({ model: rng.pick(models), color: rng.pick(CAR_PAINT), x, y, angle: a + rng.range(-0.05, 0.05) });
      }
    }
  }
}

function inset(r, m) {
  return { x0: r.x0 + m, y0: r.y0 + m, x1: r.x1 - m, y1: r.y1 - m };
}

/** Rooftop clutter: AC units, tanks, antennas, solar, skylights. */
function roofClutter(b, rng, count, kinds) {
  const R = b.top ?? b;
  const w = R.x1 - R.x0;
  const h = R.y1 - R.y0;
  for (let i = 0; i < count; i += 1) {
    const kind = rng.pick(kinds);
    const x = R.x0 + 10 + rng.next() * Math.max(1, w - 20);
    const y = R.y0 + 10 + rng.next() * Math.max(1, h - 20);
    if (kind === 'ac') b.details.push({ k: 'ac', x, y, w: rng.range(8, 14), h: rng.range(8, 12) });
    else if (kind === 'tank') b.details.push({ k: 'tank', x, y, r: rng.range(5, 8) });
    else if (kind === 'antenna') b.details.push({ k: 'antenna', x, y });
    else if (kind === 'solar' && w > 50 && h > 40) {
      const sw = Math.min(w * 0.4, 60);
      const sh = Math.min(h * 0.3, 30);
      const sx = clamp(x, R.x0 + 6, R.x1 - sw - 6);
      const sy = clamp(y, R.y0 + 6, R.y1 - sh - 6);
      b.details.push({ k: 'solar', x0: sx, y0: sy, x1: sx + sw, y1: sy + sh });
    } else if (kind === 'skylight') b.details.push({ k: 'skylight', x, y, w: rng.range(10, 18), h: rng.range(6, 10) });
  }
}

function pickSignEdge(b, block) {
  const d = [b.y0 - block.y0, block.y1 - b.y1, b.x0 - block.x0, block.x1 - b.x1];
  const i = d.indexOf(Math.min(...d));
  return ['n', 's', 'w', 'e'][i];
}

function fillBlock(city, block, rng) {
  const d = DISTRICTS[block.district];
  const style = d.style === 'beach' ? 'deco' : d.style;
  const district = block.district;
  const lots = splitRect(block, d.lot[0], d.lot[1], rng, []);
  const marketBlock = style === 'oldtown' && !city.grid.marketBlock && block.cx > 1500 && block.cy > 2100;
  if (marketBlock) {
    city.grid.marketBlock = block;
    addLot(city, block, 'market', district);
    for (let i = 0; i < 6; i += 1) addTree(city, block.x0 + rng.range(20, block.x1 - block.x0 - 20), block.y0 + rng.range(20, block.y1 - block.y0 - 20), rng.chance(0.5) ? 'palm' : 'tree', rng);
    block.special = 'market';
    return;
  }
  const parkBlock = (style === 'tower' || style === 'deco') && rng.chance(0.08);
  if (parkBlock) {
    addLot(city, block, 'park', district);
    const n = Math.floor(((block.x1 - block.x0) * (block.y1 - block.y0)) / 9000);
    for (let i = 0; i < n; i += 1) addTree(city, rng.range(block.x0 + 16, block.x1 - 16), rng.range(block.y0 + 16, block.y1 - 16), rng.chance(0.55) ? 'tree' : 'palm', rng);
    block.special = 'park';
    return;
  }
  for (const lot of lots) {
    const r = rng.next();
    if (style === 'tower') {
      if (r < 0.1) {
        addLot(city, lot, 'plaza', district);
        addTree(city, (lot.x0 + lot.x1) / 2, (lot.y0 + lot.y1) / 2, 'palm', rng, 1.1);
      } else if (r < 0.2) {
        const p = addLot(city, inset(lot, 4), 'parking', district);
        fillParking(city, p, rng, 0.6);
      } else {
        addLot(city, lot, 'paving', district);
        const centre = Math.hypot((lot.x0 + lot.x1) / 2 - 2900, (lot.y0 + lot.y1) / 2 - 2500);
        const t = clamp(1 - centre / 1100, 0, 1);
        const height = 70 + (90 + 170 * t) * rng.range(0.45, 1);
        const fp = inset(lot, d.setback);
        const b = addBuilding(city, fp, height, 'tower', district, rng);
        if (height > 140 && fp.x1 - fp.x0 > 90 && fp.y1 - fp.y0 > 90) {
          b.top = { ...inset(fp, rng.range(12, 22)), h: height };
          b.h = rng.range(26, 40);
        }
        const R = b.top ?? b;
        if (height > 200 && R.x1 - R.x0 > 70 && R.y1 - R.y0 > 70 && rng.chance(0.5)) {
          b.details.push({ k: 'heli', x: (R.x0 + R.x1) / 2, y: (R.y0 + R.y1) / 2, r: Math.min(R.x1 - R.x0, R.y1 - R.y0) * 0.32 });
        } else if (rng.chance(0.35)) {
          const bw = Math.min(R.x1 - R.x0 - 12, 80);
          b.details.push({ k: 'billboard', x0: R.x0 + 6, y0: R.y0 + 6, x1: R.x0 + 6 + bw, y1: R.y0 + 20, text: rng.pick(BRANDS), color: rng.pick(NEON) });
          roofClutter(b, rng, 3, ['ac', 'tank', 'ac']);
        } else roofClutter(b, rng, rng.int(3, 6), ['ac', 'ac', 'tank', 'antenna', 'solar']);
        if (rng.chance(0.4)) b.sign = { text: rng.pick(BRANDS), color: rng.pick(NEON), edge: pickSignEdge(b, block) };
        b.glass = rng.pick([[40, 130, 190], [30, 104, 146], [56, 160, 172], [78, 112, 186], [116, 92, 172], [40, 150, 150]]);
      }
    } else if (style === 'deco') {
      if (r < 0.12) {
        const p = addLot(city, inset(lot, 4), 'parking', district);
        fillParking(city, p, rng, 0.6);
      } else {
        addLot(city, lot, 'paving', district);
        const b = addBuilding(city, inset(lot, d.setback), rng.range(d.heights[0], d.heights[1]), 'deco', district, rng);
        b.trim = rng.pick([[255, 120, 160], [60, 190, 200], [255, 170, 80], [140, 110, 220], [255, 255, 255]]);
        if (rng.chance(0.45) && b.x1 - b.x0 > 60 && b.y1 - b.y0 > 50) {
          const px = b.x0 + (b.x1 - b.x0) * 0.3;
          b.details.push({ k: 'pool', x0: px, y0: b.y0 + 12, x1: b.x1 - 12, y1: b.y0 + 12 + (b.y1 - b.y0) * 0.35 });
          b.details.push({ k: 'lounger', x: b.x0 + 14, y: b.y0 + 16 }, { k: 'lounger', x: b.x0 + 14, y: b.y0 + 30 });
        }
        roofClutter(b, rng, rng.int(1, 3), ['ac', 'ac', 'tank']);
        if (rng.chance(0.65)) b.sign = { text: rng.pick(HOTELS), color: rng.pick(NEON), edge: pickSignEdge(b, block) };
      }
    } else if (style === 'oldtown') {
      if (r < 0.08) {
        addLot(city, lot, 'courtyard', district);
        addTree(city, (lot.x0 + lot.x1) / 2, (lot.y0 + lot.y1) / 2, 'tree', rng, 1.2);
      } else {
        addLot(city, lot, 'paving', district);
        const b = addBuilding(city, inset(lot, d.setback), rng.range(d.heights[0], d.heights[1]), 'oldtown', district, rng);
        b.roofType = rng.chance(0.72) ? 'hip' : 'flat';
        if (b.roofType === 'flat') {
          roofClutter(b, rng, 2, ['tank', 'ac', 'antenna']);
          if (rng.chance(0.4)) b.details.push({ k: 'garden', x0: b.x0 + 6, y0: b.y0 + 6, x1: (b.x0 + b.x1) / 2, y1: (b.y0 + b.y1) / 2 });
        }
        if (rng.chance(0.18)) b.sign = { text: rng.pick(['CAFE ORO', 'LA PALMA', 'MERCADO', 'CERVECERIA', 'BODEGA 9', 'FARMACIA']), color: rng.pick(NEON), edge: pickSignEdge(b, block) };
      }
    } else if (style === 'villa') {
      addLot(city, lot, 'lawn', district);
      const fp = inset(lot, d.setback);
      const wv = fp.x1 - fp.x0;
      const hv = fp.y1 - fp.y0;
      const main = { x0: fp.x0, y0: fp.y0, x1: fp.x0 + wv * rng.range(0.55, 0.8), y1: fp.y0 + hv * rng.range(0.5, 0.7) };
      const b = addBuilding(city, main, rng.range(d.heights[0], d.heights[1]), 'villa', district, rng);
      b.roofType = rng.chance(0.6) ? 'hip' : 'flat';
      if (b.roofType === 'flat') roofClutter(b, rng, 2, ['solar', 'ac']);
      addLot(city, { x0: main.x0 + 10, y0: main.y1 + 12, x1: Math.min(fp.x1, main.x0 + 10 + wv * 0.5), y1: Math.min(lot.y1 - 12, main.y1 + 12 + hv * 0.28) }, 'pool', district);
      for (let i = 0; i < 3; i += 1) addTree(city, rng.range(lot.x0 + 10, lot.x1 - 10), rng.range(main.y1 + 6, lot.y1 - 8), rng.chance(0.6) ? 'palm' : 'tree', rng);
      if (rng.chance(0.55)) city.parked.push({ model: rng.pick(['coupe', 'sedan', 'pickup']), color: rng.pick(CAR_PAINT), x: fp.x1 - 16, y: (lot.y0 + lot.y1) / 2, angle: Math.PI / 2 });
    } else if (style === 'marina') {
      if (r < 0.3) {
        const p = addLot(city, inset(lot, 4), 'parking', district);
        fillParking(city, p, rng, 0.5);
      } else {
        addLot(city, lot, 'paving', district);
        const b = addBuilding(city, inset(lot, d.setback), rng.range(d.heights[0], d.heights[1]), 'marina', district, rng);
        b.roofType = rng.chance(0.4) ? 'hip' : 'flat';
        if (b.roofType === 'flat') roofClutter(b, rng, 3, ['ac', 'solar', 'tank']);
        addTree(city, lot.x0 + 8, lot.y0 + 8, 'palm', rng);
      }
    } else if (style === 'docks') {
      if (r < 0.45) {
        addLot(city, lot, 'yard', district);
        containerRows(city, inset(lot, 10), district, rng);
      } else if (r < 0.85) {
        addLot(city, lot, 'yard', district);
        const b = addBuilding(city, inset(lot, d.setback), rng.range(d.heights[0], d.heights[1]), 'warehouse', district, rng);
        b.roofType = 'corrugated';
        roofClutter(b, rng, 3, ['skylight', 'skylight', 'ac']);
        if (rng.chance(0.3)) b.sign = { text: rng.pick(['BAYLINE FREIGHT', 'GULFSTAR', 'KEYS COLD STORE', 'PIER 9']), color: rng.pick(NEON), edge: pickSignEdge(b, block) };
      } else {
        const p = addLot(city, inset(lot, 4), 'parking', district);
        fillParking(city, p, rng, 0.5);
      }
    } else {
      addLot(city, lot, 'lawn', district);
      const b = addBuilding(city, inset(lot, d.setback), rng.range(d.heights[0], d.heights[1]), 'marina', district, rng);
      roofClutter(b, rng, 2, ['ac', 'tank']);
    }
  }
}

const CONTAINER_COLORS = [[196, 64, 52], [40, 96, 170], [230, 140, 40], [40, 140, 110], [170, 170, 176], [130, 60, 120], [220, 196, 60]];

/** Stacks of shipping containers (solid, short buildings) in rows. */
export function containerRows(city, r, district, rng) {
  const horizontal = r.x1 - r.x0 > r.y1 - r.y0;
  const L = 62;
  const W = 24;
  if (horizontal) {
    for (let y = r.y0; y + W <= r.y1; y += W + (rng.chance(0.3) ? 26 : 3)) {
      for (let x = r.x0; x + L <= r.x1; x += L + 4) {
        if (rng.chance(0.15)) continue;
        const b = addBuilding(city, { x0: x, y0: y, x1: x + L, y1: y + W }, rng.chance(0.4) ? 44 : 22, 'container', district, rng);
        b.roofType = 'container';
        b.wall = rng.pick(CONTAINER_COLORS);
        b.roof = b.wall;
      }
    }
  } else {
    for (let x = r.x0; x + W <= r.x1; x += W + (rng.chance(0.3) ? 26 : 3)) {
      for (let y = r.y0; y + L <= r.y1; y += L + 4) {
        if (rng.chance(0.15)) continue;
        const b = addBuilding(city, { x0: x, y0: y, x1: x + W, y1: y + L }, rng.chance(0.4) ? 44 : 22, 'container', district, rng);
        b.roofType = 'container';
        b.wall = rng.pick(CONTAINER_COLORS);
        b.roof = b.wall;
      }
    }
  }
}

export { addLot, addTree, fillParking };
