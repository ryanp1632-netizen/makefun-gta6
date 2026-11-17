// The islands of Halcyon Keys and the districts drawn over them: where each one lies, what it is
// called, and the palette, building heights and lot style the city generator gives its blocks.

export const WORLD_W = 6400;
export const WORLD_H = 4800;

/** Rounded-rectangle islands; the coastline is their outline bent by seeded noise. */
export const ISLANDS = [
  { id: 'main', name: 'Halcyon Key', x0: 700, y0: 500, x1: 3900, y1: 4300, r: 260 },
  { id: 'barrier', name: 'Coral Key', x0: 4480, y0: 300, x1: 5660, y1: 3420, r: 260 },
  { id: 'field', name: 'Keystone Key', x0: 4320, y0: 3760, x1: 6160, y1: 4580, r: 220 },
  { id: 'isle', name: 'Grieve Isle', x0: 4040, y0: 960, x1: 4360, y1: 1440, r: 150 },
];

export const DISTRICTS = {
  heights: {
    name: 'Palmetto Heights', tagline: 'Hillside villas over the bay', accent: '#7ee081', style: 'villa',
    ground: [104, 158, 80], walk: [216, 210, 194],
    walls: [[246, 241, 230], [236, 222, 200], [250, 248, 242], [228, 212, 186], [214, 228, 236]],
    roofs: [[196, 98, 64], [92, 98, 108], [232, 230, 222], [178, 84, 60], [120, 132, 140]],
    heights: [18, 34], lot: [150, 230], setback: 26,
  },
  mercado: {
    name: 'Old Mercado', tagline: 'Market lanes and terracotta', accent: '#ffb347', style: 'oldtown',
    ground: [194, 170, 130], walk: [206, 188, 162],
    walls: [[234, 198, 152], [216, 152, 112], [242, 216, 172], [204, 124, 98], [238, 182, 122], [226, 208, 186]],
    roofs: [[186, 86, 54], [170, 74, 48], [204, 108, 66], [152, 68, 46], [194, 116, 70]],
    heights: [20, 48], lot: [70, 120], setback: 2,
  },
  neon: {
    name: 'Neon Mile', tagline: 'Downtown never sleeps', accent: '#ff4fd8', style: 'tower',
    ground: [120, 124, 134], walk: [172, 176, 190],
    walls: [[64, 96, 140], [40, 118, 140], [100, 82, 146], [156, 164, 180], [212, 198, 176], [58, 70, 98], [230, 226, 218]],
    roofs: [[86, 150, 160], [196, 112, 84], [232, 228, 220], [112, 102, 146], [150, 160, 172], [70, 84, 104], [214, 176, 92]],
    heights: [80, 320], lot: [120, 210], setback: 8,
  },
  marina: {
    name: 'Pelican Marina', tagline: 'Yachts, bait and bad deals', accent: '#5ad8ff', style: 'marina',
    ground: [148, 188, 118], walk: [222, 218, 206],
    walls: [[246, 246, 240], [204, 222, 234], [238, 232, 216], [180, 214, 222]],
    roofs: [[70, 122, 162], [232, 232, 228], [62, 102, 132], [212, 120, 90]],
    heights: [18, 44], lot: [100, 170], setback: 10,
  },
  docks: {
    name: 'Bayline Docks', tagline: 'Containers, cranes, contraband', accent: '#ffcf3f', style: 'docks',
    ground: [150, 150, 142], walk: [170, 170, 164],
    walls: [[152, 158, 162], [178, 152, 122], [122, 132, 142], [140, 120, 100]],
    roofs: [[122, 128, 132], [152, 158, 162], [98, 112, 118], [134, 106, 86]],
    heights: [26, 46], lot: [150, 240], setback: 10,
  },
  deco: {
    name: 'Deco Row', tagline: 'Pastel hotels and neon nights', accent: '#ff7eb6', style: 'deco',
    ground: [140, 190, 122], walk: [238, 216, 208],
    walls: [[255, 198, 208], [172, 228, 216], [255, 234, 172], [204, 192, 250], [255, 216, 172], [182, 222, 255]],
    roofs: [[242, 238, 228], [232, 222, 212], [222, 230, 236]],
    heights: [36, 100], lot: [110, 170], setback: 6,
  },
  strand: {
    name: 'Coral Strand', tagline: 'Sand, surf and sunburn', accent: '#ffd166', style: 'beach',
    ground: [238, 216, 164], walk: [240, 226, 200],
    walls: [[255, 214, 190], [190, 236, 226], [255, 240, 196]],
    roofs: [[240, 236, 226], [232, 222, 212]],
    heights: [30, 70], lot: [110, 170], setback: 6,
  },
  field: {
    name: 'Keystone Field', tagline: 'Private strip, no questions', accent: '#9be564', style: 'airfield',
    ground: [150, 172, 102], walk: [190, 190, 184],
    walls: [[202, 202, 198], [172, 178, 182], [214, 206, 190]],
    roofs: [[140, 146, 150], [120, 126, 132], [168, 170, 172]],
    heights: [22, 44], lot: [180, 260], setback: 14,
  },
  isle: {
    name: 'Grieve Isle', tagline: 'Private property. Turn back.', accent: '#e05050', style: 'estate',
    ground: [92, 166, 88], walk: [226, 220, 206],
    walls: [[248, 246, 240], [236, 230, 220]],
    roofs: [[184, 86, 56], [62, 64, 70]],
    heights: [26, 40], lot: [200, 300], setback: 30,
  },
  bay: {
    name: 'Halcyon Bay', tagline: 'Open water', accent: '#3ee6d3', style: 'water',
    ground: [60, 170, 190], walk: [200, 200, 200], walls: [[200, 200, 200]], roofs: [[200, 200, 200]],
    heights: [20, 30], lot: [100, 200], setback: 10,
  },
};

/** Which district a world point belongs to (by region; water outside the islands is the bay). */
export function districtIdAt(x, y) {
  if (x >= 4440 && x <= 5700 && y >= 260 && y <= 3480) return x >= 5180 ? 'strand' : 'deco';
  if (y >= 3700 && x >= 4280 && x <= 6200 && y <= 4620) return 'field';
  if (x >= 4000 && x <= 4400 && y >= 920 && y <= 1480) return 'isle';
  if (x >= 640 && x <= 3960 && y >= 440 && y <= 4360) {
    if (y < 1650) return 'heights';
    if (y > 3300) return 'docks';
    if (x >= 3300) return 'marina';
    if (x < 2200) return 'mercado';
    return 'neon';
  }
  return 'bay';
}
