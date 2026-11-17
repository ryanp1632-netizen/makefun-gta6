// How tall the 3D city stands: the simulation's building heights are stretched per style into
// whole floors (towers rise into a skyline, hotels gain floors, houses stay low), shared by the
// city meshes, the camera's collision and the helicopter's safe altitude. The sea sits just
// below the street plane.

export const WATER_Y = -3;

/** Floor height and window spacing per facade style (kept in step with the shader). */
export const FLOOR = { 0: [27, 11], 1: [30, 19], 2: [29, 21], 3: [32, 30] };

/** Facade styles (a_mat.y when the material is a facade). */
export const FACADE = { TOWER: 0, DECO: 1, OLDTOWN: 2, VILLA: 3, WAREHOUSE: 4, RIBS: 5, PLAIN: 6, SHOPS: 7 };

const SCALE = { tower: 2.1, deco: 1.75, oldtown: 1.35, villa: 1.45, marina: 1.4, warehouse: 1.3, container: 1.05, lifeguard: 1, hangar: 1.5, control: 1.6 };
export const STYLE = { tower: FACADE.TOWER, deco: FACADE.DECO, oldtown: FACADE.OLDTOWN, villa: FACADE.VILLA, marina: FACADE.VILLA, warehouse: FACADE.WAREHOUSE, hangar: FACADE.WAREHOUSE, container: FACADE.RIBS };

function snapFloors(h, style) {
  const f = FLOOR[style];
  if (!f) return h;
  const n = Math.max(1, Math.round((h - f[0] * 0.3) / f[0]));
  return n * f[0] + f[0] * 0.3;
}

/** 3D heights of a building: its base (or podium) and the tower on top (or null). */
export function buildingHeights(b) {
  if (b.h3) return b.h3;
  const style = STYLE[b.style] ?? FACADE.PLAIN;
  const k = SCALE[b.style] ?? 1.35;
  if (b.top) {
    const base = snapFloors(b.h * 1.5, style);
    b.h3 = { base, top: Math.max(snapFloors(b.top.h * k, style), base + 80) };
  } else b.h3 = { base: snapFloors(b.h * k, style), top: null };
  return b.h3;
}

export function roofHeight(b) {
  const h = buildingHeights(b);
  return h.top ?? h.base;
}
