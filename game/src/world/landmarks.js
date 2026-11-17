// Named places the story and side activities use: the safehouse, gun shop, hospital, precinct,
// bank, respray garages, the property for sale, mission venues and the hidden Sunset Tapes.
// Each claims a generated building (giving it a sign) and a door point on the sidewalk.
import { SIDEWALK } from './roadGraph.js';
import { districtIdAt } from './districts.js';

/** Where a building's door meets the street: the middle of its side nearest a road. */
export function doorPoint(b) {
  const blk = b.block;
  if (!blk) return { x: (b.x0 + b.x1) / 2, y: b.y1 + 16 };
  const d = [b.y0 - blk.y0, blk.y1 - b.y1, b.x0 - blk.x0, blk.x1 - b.x1];
  const i = d.indexOf(Math.min(...d));
  const cx = (b.x0 + b.x1) / 2;
  const cy = (b.y0 + b.y1) / 2;
  const o = SIDEWALK * 0.5;
  if (i === 0) return { x: cx, y: blk.y0 - o, side: 'n' };
  if (i === 1) return { x: cx, y: blk.y1 + o, side: 's' };
  if (i === 2) return { x: blk.x0 - o, y: cy, side: 'w' };
  return { x: blk.x1 + o, y: cy, side: 'e' };
}

function claim(city, rng, district, info, pred = () => true, sortKey = null) {
  let list = city.buildings.filter((b) => b.district === district && b.block && !b.poi && b.style !== 'container' && pred(b));
  if (list.length === 0) list = city.buildings.filter((b) => b.block && !b.poi && b.style !== 'container');
  let b;
  if (sortKey) {
    list.sort((p, q) => sortKey(q) - sortKey(p));
    b = list[0];
  } else b = list[Math.floor(rng.next() * list.length)];
  const door = doorPoint(b);
  b.poi = info.kind;
  if (info.sign) b.sign = { text: info.sign, color: info.color, edge: door.side ?? 's' };
  return { kind: info.kind, label: info.label, x: door.x, y: door.y, building: b, color: info.color };
}

const area = (b) => (b.x1 - b.x0) * (b.y1 - b.y0);

export function placeLandmarks(city, rng) {
  const P = city.pois;
  P.safehouse = claim(city, rng, 'marina', { kind: 'safehouse', label: "Pearl's Bait & Tackle (safehouse)", sign: "PEARL'S BAIT & TACKLE", color: '#5ad8ff' }, (b) => b.y0 > 1900 && b.y1 < 3100);
  P.gunshop = claim(city, rng, 'mercado', { kind: 'gunshop', label: 'Reef & Trigger (weapons)', sign: 'REEF & TRIGGER', color: '#ff6a4f' });
  P.hospital = claim(city, rng, 'neon', { kind: 'hospital', label: 'Mercy Shores Medical', sign: 'MERCY SHORES', color: '#ff5a6e' }, (b) => area(b) > 9000);
  P.police = claim(city, rng, 'mercado', { kind: 'police', label: 'HKPD Precinct 3', sign: 'HKPD PRECINCT 3', color: '#5aa0ff' }, (b) => area(b) > 5000);
  P.bank = claim(city, rng, 'neon', { kind: 'bank', label: 'Halcyon Trust Bank', sign: 'HALCYON TRUST', color: '#ffe14f' }, (b) => area(b) > 8000);
  P.penthouse = claim(city, rng, 'neon', { kind: 'property', label: 'The Azure Penthouse (for sale)', sign: 'THE AZURE', color: '#3ee6ff' }, () => true, (b) => (b.top ? b.top.h : b.h));
  P.respray1 = claim(city, rng, 'docks', { kind: 'respray', label: 'Fresh Coat Respray', sign: 'FRESH COAT', color: '#7dff6a' }, (b) => b.style === 'warehouse');
  P.respray2 = claim(city, rng, 'deco', { kind: 'respray', label: 'Fresh Coat Respray', sign: 'FRESH COAT', color: '#7dff6a' });
  P.respray3 = claim(city, rng, 'heights', { kind: 'respray', label: 'Fresh Coat Respray', sign: 'FRESH COAT', color: '#7dff6a' });
  P.club = claim(city, rng, 'neon', { kind: 'club', label: 'Club Voltage', sign: 'CLUB VOLTAGE', color: '#ff4fd8' });
  P.warehouse = claim(city, rng, 'docks', { kind: 'venue', label: 'Undertow warehouse', sign: 'PIER 9 STORAGE', color: '#ffcf3f' }, (b) => b.style === 'warehouse');
  P.hotel = claim(city, rng, 'deco', { kind: 'venue', label: 'Hotel Coralie', sign: 'HOTEL CORALIE', color: '#ff7eb6' });
  const mb = city.grid.marketBlock ?? city.blocks[0];
  P.market = { kind: 'venue', label: 'Old Mercado market', x: (mb.x0 + mb.x1) / 2, y: mb.y0 - SIDEWALK * 0.5 };
  P.hangar = { kind: 'venue', label: 'Keystone hangar 1', x: 4760, y: 4110 };
  P.mansion = { kind: 'venue', label: 'Grieve estate gate', x: 4190, y: 1226 };
  // Sunset Tapes: two or three hidden on the sidewalks of every district.
  const want = { heights: 3, mercado: 3, neon: 3, marina: 2, docks: 3, deco: 3, strand: 2, field: 1 };
  const taken = {};
  let guard = 0;
  while (city.collectibles.length < 20 && guard < 4000) {
    guard += 1;
    const e = city.edges[Math.floor(rng.next() * city.edges.length)];
    const along = rng.range(e.hw + 40, Math.max(e.hw + 41, e.len - e.hw - 40));
    const side = rng.chance(0.5) ? 1 : -1;
    const off = (e.hw + SIDEWALK * 0.5) * side;
    const a = city.nodes[e.a];
    const x = a.x + e.dx * along - e.dy * off;
    const y = a.y + e.dy * along + e.dx * off;
    const d = districtIdAt(x, y);
    if (!want[d] || (taken[d] ?? 0) >= want[d] || city.terrain.sdf(x, y) > -20) continue;
    if (city.collectibles.some((c) => Math.hypot(c.x - x, c.y - y) < 500)) continue;
    taken[d] = (taken[d] ?? 0) + 1;
    city.collectibles.push({ id: city.collectibles.length, x, y, district: d });
  }
}
