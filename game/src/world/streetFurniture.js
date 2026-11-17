// Street furniture for the generated city, laid out after the buildings and landmarks with its own
// random stream (so the city, the story venues and the traffic stay exactly as they were): traffic
// signals on mast arms at the junctions, bus shelters with lit adverts and benches along the
// sidewalks, fire hydrants and litter bins, roadside billboards on the parking lots, and the beach
// kit of Coral Strand (snack kiosks, sun loungers and surfboards planted in the sand). Every brand
// on a sign is invented for Halcyon Keys. The 3D city meshes draw all of it; nothing collides.
import { createRandom } from '../core/random.js';
import { SIDEWALK } from './roadGraph.js';
import { districtIdAt } from './districts.js';

/** Invented brands for adverts, shelters and billboards. */
export const AD_BRANDS = [
  ['BRISA COLA', '#e63946'], ['SUNWAVE SPF', '#ffb703'], ['NEONADE', '#3ee6ff'], ['MANGO RUSH', '#ff8c42'],
  ['KOI KOI SUSHI', '#ff4fa3'], ['TIDAL GIN', '#2ec4b6'], ['ORCA MOBILE', '#3a86ff'], ['PALMCO', '#06d6a0'],
  ['FLAMINGO FM', '#ff7eb6'], ['GULF GOLD', '#ffd166'], ['TACO TIDE', '#f77f00'], ['HALO JUICE', '#9b5de5'],
];

const KIOSKS = [['COCO SHACK', '#ffd166'], ['SHAVE ICE', '#3ee6ff'], ['SURF RENTAL', '#ff7eb6'], ['FISH TACOS', '#ff8c42']];
const BOARD_COLORS = ['#ff4f6a', '#3ee6ff', '#ffd166', '#7dff9a', '#ff7eb6', '#ffffff', '#b26bff', '#ff8c42'];

function nearAny(list, x, y, r) {
  for (const p of list) if (Math.abs(p.x - x) < r && Math.abs(p.y - y) < r) return true;
  return false;
}

/** Fill city.furniture: signals, shelters, benches, hydrants, bins, billboards, beach kit. */
export function furnishStreets(city) {
  const rng = createRandom(city.seed * 4241 + 17);
  const sdf = city.terrain.sdf;
  const f = { signals: [], shelters: [], benches: [], hydrants: [], bins: [], billboards: [], kiosks: [], boards: [], loungers: [] };
  city.furniture = f;
  // Traffic signals: four mast arms at every junction of two through roads on land.
  for (const n of city.nodes) {
    if (n.edges.length < 4 || sdf(n.x, n.y) > -40) continue;
    let hwV = 0;
    let hwH = 0;
    for (const id of n.edges) {
      const e = city.edges[id];
      if (Math.abs(e.dx) < 0.5) hwV = Math.max(hwV, e.hw);
      else hwH = Math.max(hwH, e.hw);
    }
    const cx = hwV + 7;
    const cy = hwH + 7;
    const phase = (n.id % 2) === 0;
    // Each pole stands on a corner and reaches across the road leg beside it, heads facing traffic.
    f.signals.push({ x: n.x - cx, y: n.y - cy, ax: 1, ay: 0, len: hwV * 1.25, face: -Math.PI / 2, green: phase });
    f.signals.push({ x: n.x + cx, y: n.y + cy, ax: -1, ay: 0, len: hwV * 1.25, face: Math.PI / 2, green: phase });
    f.signals.push({ x: n.x + cx, y: n.y - cy, ax: 0, ay: 1, len: hwH * 1.25, face: 0, green: !phase });
    f.signals.push({ x: n.x - cx, y: n.y + cy, ax: 0, ay: -1, len: hwH * 1.25, face: Math.PI, green: !phase });
  }
  // Sidewalk furniture along every road edge in the busy districts.
  const busy = new Set(['deco', 'strand', 'neon', 'mercado', 'marina']);
  for (const e of city.edges) {
    const na = city.nodes[e.a];
    const nb = city.nodes[e.b];
    const d = districtIdAt(e.mx, e.my);
    if (!busy.has(d) || e.bridge) continue;
    const start = na.hw + 50;
    const end = e.len - nb.hw - 50;
    const rx = -e.dy;
    const ry = e.dx;
    const major = e.road.kind === 'avenue' || e.road.kind === 'boulevard' || e.road.kind === 'highway';
    for (let s = start + rng.range(10, 60); s < end; s += rng.range(150, 230)) {
      const side = rng.sign();
      const off = (e.hw + SIDEWALK * 0.72) * side;
      const x = na.x + e.dx * s + rx * off;
      const y = na.y + e.dy * s + ry * off;
      if (sdf(x, y) > -26 || nearAny(city.trees, x, y, 11) || nearAny(city.lamps, x, y, 12)) continue;
      // Facing the road: the outward normal points back across the sidewalk.
      const face = Math.atan2(-ry * side, -rx * side);
      const r = rng.next();
      if (major && r < 0.32 && !nearAny(f.shelters, x, y, 300)) {
        const [text, color] = rng.pick(AD_BRANDS);
        f.shelters.push({ x, y, angle: face, along: Math.atan2(e.dy, e.dx), text, color });
      } else if (r < 0.62) f.benches.push({ x, y, angle: face });
      else if (r < 0.8) f.bins.push({ x, y });
      else f.hydrants.push({ x: x - rx * side * 4, y: y - ry * side * 4 });
    }
  }
  // Roadside billboards on the parking lots, facing the nearest road.
  for (const lot of city.lots) {
    if (lot.kind !== 'parking' || rng.chance(0.35)) continue;
    const w = lot.x1 - lot.x0;
    const h = lot.y1 - lot.y0;
    if (w < 90 && h < 90) continue;
    const blk = city.blocks.find((b) => lot.x0 >= b.x0 - 1 && lot.x1 <= b.x1 + 1 && lot.y0 >= b.y0 - 1 && lot.y1 <= b.y1 + 1);
    if (!blk) continue;
    const gaps = [[lot.y0 - blk.y0, 'n'], [blk.y1 - lot.y1, 's'], [lot.x0 - blk.x0, 'w'], [blk.x1 - lot.x1, 'e']].sort((a, b) => a[0] - b[0]);
    const edge = gaps[0][1];
    const [text, color] = rng.pick(AD_BRANDS);
    const cx = (lot.x0 + lot.x1) / 2;
    const cy = (lot.y0 + lot.y1) / 2;
    const p = edge === 'n' ? { x: cx, y: lot.y0 + 10, angle: -Math.PI / 2 } : edge === 's' ? { x: cx, y: lot.y1 - 10, angle: Math.PI / 2 } : edge === 'w' ? { x: lot.x0 + 10, y: cy, angle: Math.PI } : { x: lot.x1 - 10, y: cy, angle: 0 };
    f.billboards.push({ ...p, w: Math.min(110, (edge === 'n' || edge === 's' ? w : h) * 0.8), text, color });
  }
  // Strand Boulevard: big boards on the beach side, angled to face the northbound drivers.
  const strand = city.roads.find((r) => r.kind === 'boulevard');
  if (strand) {
    let i = 0;
    for (let y = strand.y0 + 300; y < strand.y1 - 200; y += 560) {
      const x = strand.x0 + strand.hw + SIDEWALK + 34;
      if (sdf(x, y) > -60) continue;
      const [text, color] = AD_BRANDS[(i * 5 + 3) % AD_BRANDS.length];
      i += 1;
      f.billboards.push({ x, y, angle: Math.PI / 2 + 0.38, w: 104, text, color });
    }
  }
  // Coral Strand: snack kiosks, loungers and surfboards between the umbrellas.
  let k = 0;
  for (let y = 520; y < 3300; y += 380) {
    let x = 5372;
    while (sdf(x, y) < -120 && x < 5600) x += 6;
    x = Math.max(5372, x - 70);
    if (sdf(x, y) > -40 || nearAny(city.umbrellas, x, y, 20)) continue;
    const [text, color] = KIOSKS[k % KIOSKS.length];
    k += 1;
    f.kiosks.push({ x, y, angle: Math.PI, text, color });
  }
  for (const u of city.umbrellas) {
    if (rng.chance(0.35)) {
      const a = u.angle + Math.PI * 0.6;
      f.loungers.push({ x: u.x + Math.cos(a) * 15, y: u.y + Math.sin(a) * 15, angle: u.angle + Math.PI / 2, color: u.c1 });
    }
    if (rng.chance(0.12)) {
      const a = u.angle - Math.PI * 0.7;
      f.boards.push({ x: u.x + Math.cos(a) * 18, y: u.y + Math.sin(a) * 18, angle: rng.range(0, 6.28), lean: rng.range(-0.18, 0.18), color: rng.pick(BOARD_COLORS) });
    }
  }
  return f;
}
