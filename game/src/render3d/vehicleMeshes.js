// Low-poly 3D vehicles built by code from each model's dimensions. A car body is a side profile
// swept along its length in strips, with real wheel arches cut into the sides (dark wheel wells,
// flared lips), a chamfered shoulder, bumpers, grille, door lines and mirrors. On top sits a
// greenhouse of painted pillars and roof around see-through glass (drawn in the effects pass) so
// the seats, dashboard, steering wheel and the driver show through the windscreen. Wheels have
// tyres, sidewalls, five-spoke rims and hubs, and they spin and steer. Model details: the coupe's
// wing, intakes and stripes, the muscle car's scoop and racing stripes, the van's tall box, the
// pickup's bed, the KeyCab roof sign, the HKPD livery, push bar and light bar. Bodies are cached
// per model and paint and moved into place each frame with roll and pitch from the physics;
// lamps, light bars and drivers are emitted live. The HKPD helicopter lives here too.
import { MeshBuilder, MAT, frame, hexRgb } from './meshBuilder.js';
import { clamp } from '../core/math.js';
import { atlasEntry } from './textAtlas.js';

/** Effects-pass shape id of see-through glass (FX_FS shape 8). */
const FX_GLASS = 8;
const GLASS_TINT = [0.07, 0.09, 0.12];

const templates = new Map();
let wheelTemplate = null;
const sharedAtlas = { atlas: null };

/**
 * Body shapes. prof: the top line rear to front as [x / length, y]; sill: bottom of the sides;
 * cab: greenhouse [base rear, base front, roof rear, roof front] as fractions of the length;
 * roof: roof height; wr: wheel radius; flare: flared arch lips; tail: tail-lamp band override.
 */
const SHAPES = {
  coupe: { prof: [[-0.5, 6.4], [-0.46, 8.3], [-0.3, 8.5], [-0.05, 8.25], [0.15, 8.05], [0.36, 7.6], [0.5, 5.5]], sill: 1.8, cab: [-0.31, 0.17, -0.17, -0.02], roof: 11.8, wr: 3.6, flare: true, doors: 1 },
  sedan: { prof: [[-0.5, 6.8], [-0.46, 8.8], [-0.27, 9.0], [0.18, 8.7], [0.42, 7.8], [0.5, 6.4]], sill: 2.2, cab: [-0.29, 0.2, -0.19, 0.06], roof: 13.6, wr: 3.6, doors: 2 },
  muscle: { prof: [[-0.5, 7.2], [-0.46, 9.1], [-0.26, 9.2], [0.18, 9.1], [0.44, 8.8], [0.5, 7.4]], sill: 2.3, cab: [-0.31, 0.1, -0.2, -0.03], roof: 12.8, wr: 3.9, flare: true, doors: 1 },
  van: { prof: [[-0.5, 20.4], [-0.48, 21], [0.2, 21], [0.34, 12.4], [0.47, 10.9], [0.5, 9.6]], sill: 2.7, roof: 21, wr: 4.2, tail: [5.2, 10.4], doors: 0 },
  pickup: { prof: [[-0.5, 9.4], [-0.48, 9.9], [0.0, 10.1], [0.25, 9.9], [0.44, 9.3], [0.5, 7.9]], sill: 2.9, cab: [-0.13, 0.22, -0.09, 0.09], roof: 16.4, wr: 4.3, doors: 1 },
};
SHAPES.taxi = SHAPES.sedan;
SHAPES.police = SHAPES.sedan;

/** Wheel radius per model (the bike's are smaller). */
function wheelRadius(model) {
  return model === 'bike' ? 3.3 : (SHAPES[model] ?? SHAPES.sedan).wr;
}

function rgb01(c, k = 1) {
  return [(c[0] / 255) * k, (c[1] / 255) * k, (c[2] / 255) * k];
}

/** Linear interpolation along a [x, y] polyline sorted by x. */
function lineAt(pts, x) {
  if (x <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i += 1) {
    if (x <= pts[i][0]) {
      const a = pts[i - 1];
      const b = pts[i];
      return a[1] + ((b[1] - a[1]) * (x - a[0])) / (b[0] - a[0] || 1);
    }
  }
  return pts[pts.length - 1][1];
}

/**
 * Sweep the lower body: sides (with arch cut-outs), shoulder chamfer, top deck, front and rear
 * faces, wheel wells and flared lips. colorAt(x) gives the paint per strip (two-tone liveries).
 * Returns the body's top line function for the details that sit on it.
 */
function bodyShell(mb, sh, L, hw, colorAt, dark) {
  const prof = sh.prof.map(([x, y]) => [x * L, y]);
  const wr = sh.wr;
  const cy = wr - 0.4;
  const R = wr + 0.75;
  const arches = [L * 0.32, -L * 0.31];
  const ch = 1.0;
  const inset = 0.9;
  const archAt = (x) => {
    for (const ax of arches) if (Math.abs(x - ax) <= R + 1e-6) return ax;
    return null;
  };
  const topAt = (x) => {
    let y = lineAt(prof, x);
    const ax = archAt(x);
    if (ax !== null) y = Math.max(y, cy + Math.sqrt(Math.max(0, R * R - (x - ax) ** 2)) + 1.2);
    return y;
  };
  const bottomAt = (x) => {
    const ax = archAt(x);
    return ax === null ? sh.sill : cy + Math.sqrt(Math.max(0, R * R - (x - ax) ** 2));
  };
  const xs = prof.map((p) => p[0]);
  for (const ax of arches) {
    xs.push(ax - R - 0.02, ax + R + 0.02);
    for (let i = 0; i <= 8; i += 1) xs.push(ax - R * Math.cos((i / 8) * Math.PI));
  }
  xs.sort((a, b) => a - b);
  const X = [];
  for (const x of xs) if (x >= -L / 2 && x <= L / 2 && (X.length === 0 || x - X[X.length - 1] > 0.004)) X.push(x);
  for (let i = 0; i + 1 < X.length; i += 1) {
    const xa = X[i];
    const xb = X[i + 1];
    const xm = (xa + xb) / 2;
    const ya = bottomAt(xa);
    const yb = bottomAt(xb);
    const ta = topAt(xa);
    const tb = topAt(xb);
    const c = colorAt(xm);
    mb.color(...c).mat(MAT.PAINT);
    for (const s of [-1, 1]) {
      const z = hw * s;
      mb.quad(xa, ya, z, xb, yb, z, xb, tb - ch, z, xa, ta - ch, z);
      mb.quad(xa, ta - ch, z, xb, tb - ch, z, xb, tb, z * inset, xa, ta, z * inset);
    }
    mb.quad(xa, ta, -hw * inset, xb, tb, -hw * inset, xb, tb, hw * inset, xa, ta, hw * inset);
    const inArch = archAt(xm) !== null && xb - xa > 0.05;
    if (inArch) {
      // Wheel well: a dark tunnel behind the arch edge, with a flared lip in the paint.
      mb.color(0.035, 0.035, 0.04).mat(MAT.PLAIN);
      for (const s of [-1, 1]) mb.quad(xa, ya, hw * s, xb, yb, hw * s, xb, yb, (hw - 3.6) * s, xa, ya, (hw - 3.6) * s);
      if (sh.flare) {
        const ax = archAt(xm);
        const ra = Math.hypot(xa - ax, ya - cy);
        const rb = Math.hypot(xb - ax, yb - cy);
        const k = 1.0;
        const pa = [ax + ((xa - ax) / ra) * (ra + k), cy + ((ya - cy) / ra) * (ra + k)];
        const pb = [ax + ((xb - ax) / rb) * (rb + k), cy + ((yb - cy) / rb) * (rb + k)];
        mb.color(c[0] * 0.8, c[1] * 0.8, c[2] * 0.8).mat(MAT.PAINT);
        for (const s of [-1, 1]) mb.quad(xa, ya, (hw + 0.55) * s, xb, yb, (hw + 0.55) * s, pb[0], pb[1], (hw + 0.05) * s, pa[0], pa[1], (hw + 0.05) * s);
      }
    } else if (xb - xa > 0.05) {
      // Dark rocker panel along the bottom of the sides.
      mb.color(dark[0], dark[1], dark[2]).mat(MAT.PLAIN);
      for (const s of [-1, 1]) {
        const z = (hw + 0.04) * s;
        mb.quad(xa, ya, z, xb, yb, z, xb, yb + 1.1, z, xa, ya + 1.1, z);
      }
    }
  }
  // Front and rear faces.
  for (const end of [-1, 1]) {
    const x = (L / 2) * end;
    const t = topAt(x);
    const c = colorAt(x - end * 0.5);
    mb.color(...c).mat(MAT.PAINT);
    mb.poly([[x, sh.sill, -hw], [x, sh.sill, hw], [x, t - ch, hw], [x, t, hw * inset], [x, t, -hw * inset], [x, t - ch, -hw]]);
  }
  // Inner wheel-well backs so the arches never show daylight.
  mb.color(0.03, 0.03, 0.035).mat(MAT.PLAIN);
  for (const ax of arches) {
    for (const s of [-1, 1]) {
      const pts = [];
      for (let i = 0; i <= 8; i += 1) {
        const a = (i / 8) * Math.PI;
        pts.push([ax - R * Math.cos(a), cy + R * Math.sin(a), (hw - 3.6) * s]);
      }
      mb.poly(pts);
    }
  }
  return { topAt, ch, inset, cy, R, arches };
}

/** The greenhouse (pillars, roof, trims) and the glass panels (into `glass`, effects or lit). */
function greenhouse(mb, glass, glassFx, sh, L, hw, topAt, roofPaint, pillarPaint) {
  const [c0, c1, r0, r1] = sh.cab;
  const x0 = c0 * L;
  const x1 = c1 * L;
  const xr0 = r0 * L;
  const xr1 = r1 * L;
  const b0 = topAt(x0);
  const b1 = topAt(x1);
  const R = sh.roof;
  const hb = hw * 0.86;
  const hr = hw * 0.7;
  const baseY = (x) => b0 + ((b1 - b0) * (x - x0)) / (x1 - x0);
  // Glass panels.
  if (glassFx) glass.color(...GLASS_TINT).mat(FX_GLASS);
  else glass.color(0.09, 0.12, 0.16).mat(MAT.GLASS);
  glass.quad(x1, b1, -hb, x1, b1, hb, xr1, R, hr, xr1, R, -hr);
  glass.quad(x0, b0, hb, x0, b0, -hb, xr0, R, -hr, xr0, R, hr);
  for (const s of [-1, 1]) glass.quad(x0, b0, hb * s, x1, b1, hb * s, xr1, R, hr * s, xr0, R, hr * s);
  // Roof panel with a little thickness.
  mb.color(...roofPaint).mat(MAT.PAINT);
  mb.box(xr0 - 0.4, R - 0.7, -hr - 0.35, xr1 + 0.4, R + 0.15, hr + 0.35);
  // Pillars on the side planes (just outside the glass).
  const pillar = (xa, xb, xra, xrb, s, col) => {
    mb.color(...col).mat(MAT.PAINT);
    const zb = (hb + 0.08) * s;
    const zr = (hr + 0.38) * s;
    mb.quad(xa, baseY(xa), zb, xb, baseY(xb), zb, xrb, R - 0.4, zr, xra, R - 0.4, zr);
  };
  for (const s of [-1, 1]) {
    pillar(x1 - 1.6, x1, xr1 - 0.9, xr1, s, pillarPaint);
    const xm = x0 + (x1 - x0) * (sh.doors === 1 ? 0.42 : 0.52);
    const xmr = xr0 + (xr1 - xr0) * (sh.doors === 1 ? 0.42 : 0.52);
    pillar(xm - 0.8, xm + 0.8, xmr - 0.7, xmr + 0.7, s, pillarPaint);
    pillar(x0, x0 + 3.4, xr0, xr0 + 1.6, s, roofPaint);
    // Window sill trim and the mirror.
    mb.color(0.05, 0.05, 0.06).mat(MAT.METAL);
    mb.quad(x0 + 1, baseY(x0 + 1) - 0.05, (hb + 0.1) * s, x1 - 1, baseY(x1 - 1) - 0.05, (hb + 0.1) * s, x1 - 1, baseY(x1 - 1) + 0.45, (hb + 0.06) * s, x0 + 1, baseY(x0 + 1) + 0.45, (hb + 0.06) * s);
    mb.color(...pillarPaint).mat(MAT.PAINT);
    mb.box(x1 - 2.6, b1 + 0.1, (hb + 0.2) * s - 0.9, x1 - 1.0, b1 + 1.5, (hb + 0.2) * s + 0.9 + s * 0.9, '');
  }
  // Inside: dashboard, seat backs and headrests, steering wheel.
  mb.color(0.06, 0.06, 0.07).mat(MAT.PLAIN);
  mb.box(x1 - 4.2, b1 - 1.2, -hb * 0.95, x1 - 0.4, b1 + 0.7, hb * 0.95);
  const seatX = (xr0 + xr1) / 2 - 2.6;
  const headTop = R - 1.0;
  for (const s of [-1, 1]) {
    mb.color(0.1, 0.09, 0.1).mat(MAT.PLAIN);
    mb.box(seatX - 1.5, baseY(seatX) - 2, s * hb * 0.45 - 2.1, seatX + 0.2, headTop - 2.4, s * hb * 0.45 + 2.1);
    mb.box(seatX - 1.2, headTop - 2.3, s * hb * 0.45 - 1.3, seatX + 0.1, headTop - 0.3, s * hb * 0.45 + 1.3);
  }
  const wx = seatX + 5.6;
  const wz = -hb * 0.45;
  const wy = baseY(wx) + 1.0;
  mb.color(0.04, 0.04, 0.05).mat(MAT.PLAIN);
  mb.tube(wx, wy, wz, wx + 0.5, wy + 0.5, wz, 1.5, 1.5, 9, false);
  return { seatX, seatZ: hb * 0.45, headTop, belt: baseY(seatX), wheelX: wx, wheelY: wy };
}

function buildCar(model, paint, spec, wreck) {
  const mb = new MeshBuilder(2048, 4096);
  const fx = new MeshBuilder(64, 128);
  const opaque = new MeshBuilder(64, 128);
  const L = spec.length;
  const W = spec.width;
  const hw = W / 2;
  const sh = SHAPES[model];
  const base = wreck ? [0.09, 0.08, 0.075] : rgb01(hexRgb(paint));
  const black = [0.05, 0.05, 0.06];
  const white = [0.95, 0.95, 0.94];
  const police = model === 'police' && !wreck;
  const colorAt = police ? (x) => (x < -L * 0.29 || x > L * 0.21 ? black : white) : () => base;
  const dark = wreck ? base : [0.06, 0.06, 0.07];
  const shell = bodyShell(mb, sh, L, hw, colorAt, dark);
  const topAt = shell.topAt;
  const info = { L, hw, wr: sh.wr, roof: sh.roof, seat: null, glass: fx, glassOpaque: opaque };
  // Bumpers, grille, number plates and exhausts.
  const plastic = model === 'coupe' || model === 'muscle' ? [base[0] * 0.75, base[1] * 0.75, base[2] * 0.75] : [0.13, 0.13, 0.14];
  mb.color(...(wreck ? base : plastic)).mat(MAT.PAINT);
  mb.box(L / 2 - 0.8, sh.sill - 0.4, -hw + 0.4, L / 2 + 1.0, sh.sill + 1.9, hw - 0.4);
  mb.box(-L / 2 - 1.0, sh.sill - 0.4, -hw + 0.4, -L / 2 + 0.8, sh.sill + 1.9, hw - 0.4);
  const front = topAt(L / 2);
  const headY1 = front - 0.7;
  const headY0 = headY1 - 1.4;
  mb.color(0.03, 0.03, 0.035).mat(MAT.PLAIN);
  mb.quad(L / 2 + 0.04, sh.sill + 2.0, -hw * 0.42, L / 2 + 0.04, sh.sill + 2.0, hw * 0.42, L / 2 + 0.04, Math.max(sh.sill + 2.6, headY0 - 0.2), hw * 0.42, L / 2 + 0.04, Math.max(sh.sill + 2.6, headY0 - 0.2), -hw * 0.42);
  mb.color(0.95, 0.94, 0.86).mat(MAT.PLAIN);
  mb.quad(-L / 2 - 1.04, sh.sill + 0.1, -3, -L / 2 - 1.04, sh.sill + 0.1, 3, -L / 2 - 1.04, sh.sill + 1.6, 3, -L / 2 - 1.04, sh.sill + 1.6, -3);
  mb.color(0.5, 0.52, 0.55).mat(MAT.METAL);
  if (model === 'coupe' || model === 'muscle') for (const z of [-hw * 0.55, hw * 0.55]) mb.tube(-L / 2 - 0.4, sh.sill + 0.3, z, -L / 2 - 1.6, sh.sill + 0.3, z, 0.7, 0.7, 7, true);
  // Door lines and handles.
  if (sh.doors) {
    const [c0, c1] = sh.cab ?? [-0.3, 0.2];
    const cuts = sh.doors === 1 ? [c1 * L - 1, c0 * L + (c1 - c0) * L * 0.42] : [c1 * L - 1, (c0 + (c1 - c0) * 0.52) * L, c0 * L + 1.5];
    mb.color(0.04, 0.04, 0.05).mat(MAT.PLAIN);
    for (const x of cuts) {
      for (const s of [-1, 1]) {
        const z = (hw + 0.05) * s;
        mb.quad(x - 0.15, sh.sill + 1.2, z, x + 0.15, sh.sill + 1.2, z, x + 0.15, topAt(x) - 1.3, z, x - 0.15, topAt(x) - 1.3, z);
      }
    }
    mb.color(0.7, 0.72, 0.75).mat(MAT.METAL);
    for (let i = 0; i + 1 < cuts.length; i += 1) {
      const x = cuts[i] - 3.2;
      for (const s of [-1, 1]) mb.box(x - 1, topAt(x) - 2.6, s * (hw + 0.02) - 0.15, x + 0.6, topAt(x) - 2.0, s * (hw + 0.02) + 0.15, '');
    }
  }
  // Tail-lamp housings (the live glow is drawn on top).
  const rear = topAt(-L / 2);
  const tail = sh.tail ?? [rear - 2.4, rear - 1.0];
  mb.color(0.32, 0.03, 0.05).mat(MAT.PLAIN);
  mb.box(-L / 2 - 0.25, tail[0] - 0.2, -hw + 0.8, -L / 2 + 0.1, tail[1] + 0.2, hw - 0.8);
  info.lamps = { headY0, headY1, tail, front: L / 2, rear: -L / 2 };
  if (model === 'van') {
    // Tall box body: the windscreen on the slope, cab windows, rear door seam and a roof rack.
    const xf = L * 0.2;
    const xw = L * 0.34;
    const g = (b) => (b === fx ? b.color(...GLASS_TINT).mat(FX_GLASS) : b.color(0.09, 0.12, 0.16).mat(MAT.GLASS));
    for (const b of [fx, opaque]) {
      g(b);
      b.quad(xw + 0.25, 12.6, -hw * 0.82, xw + 0.25, 12.6, hw * 0.82, xf + 0.6, 20.6, hw * 0.8, xf + 0.6, 20.6, -hw * 0.8);
      for (const s of [-1, 1]) b.quad(xf - 8, 12, (hw + 0.1) * s, xf + 1.5, 12, (hw + 0.1) * s, xf + 1.5, 19, (hw + 0.1) * s, xf - 8, 19, (hw + 0.1) * s);
    }
    mb.color(0.04, 0.04, 0.05).mat(MAT.PLAIN);
    mb.quad(-L / 2 - 0.05, sh.sill + 1, -0.2, -L / 2 - 0.05, sh.sill + 1, 0.2, -L / 2 - 0.05, 20, 0.2, -L / 2 - 0.05, 20, -0.2);
    for (const s of [-1, 1]) mb.quad(-L * 0.1, sh.sill + 1.2, (hw + 0.05) * s, -L * 0.1 + 0.3, sh.sill + 1.2, (hw + 0.05) * s, -L * 0.1 + 0.3, 20, (hw + 0.05) * s, -L * 0.1, 20, (hw + 0.05) * s);
    if (!wreck) {
      mb.color(0.92, 0.92, 0.9).mat(MAT.PLAIN);
      for (const s of [-1, 1]) mb.quad(-L / 2 + 4, 13, (hw + 0.08) * s, xf - 12, 13, (hw + 0.08) * s, xf - 12, 15.4, (hw + 0.08) * s, -L / 2 + 4, 15.4, (hw + 0.08) * s);
      mb.color(0.2, 0.21, 0.23).mat(MAT.METAL);
      for (const z of [-hw * 0.7, hw * 0.7]) mb.box(-L * 0.42, 21, z - 0.5, L * 0.12, 22, z + 0.5);
      for (let x = -L * 0.38; x < L * 0.1; x += 7) mb.box(x - 0.4, 21.6, -hw * 0.7, x + 0.4, 22.2, hw * 0.7);
    }
    info.seat = { seatX: xf - 3, seatZ: hw * 0.45, headTop: 19.6, belt: 13, wheelX: xf + 2, wheelY: 13.5 };
    info.hidden = true;
  } else {
    const roofPaint = police ? white : wreck ? base : model === 'taxi' ? base : base;
    const pillarPaint = police ? black : wreck ? base : model === 'coupe' ? black : base;
    info.seat = greenhouse(mb, fx, true, sh, L, hw, topAt, roofPaint, pillarPaint);
    greenhouse(new MeshBuilder(256, 512), opaque, false, sh, L, hw, topAt, roofPaint, pillarPaint);
  }
  if (model === 'pickup') {
    // Open bed behind the cab: floor, side rails and the tailgate.
    const xb = sh.cab[0] * L - 0.6;
    const bed = topAt(-L / 2);
    mb.color(0.1, 0.1, 0.11).mat(MAT.PLAIN);
    mb.quad(-L / 2 + 1.2, bed - 3.2, -hw + 1.3, xb, bed - 3.2, -hw + 1.3, xb, bed - 3.2, hw - 1.3, -L / 2 + 1.2, bed - 3.2, hw - 1.3);
    mb.color(...base).mat(MAT.PAINT);
    mb.box(-L / 2, bed, -hw, xb, bed + 2.6, -hw + 1.3);
    mb.box(-L / 2, bed, hw - 1.3, xb, bed + 2.6, hw);
    mb.box(-L / 2, bed, -hw, -L / 2 + 1.2, bed + 2.6, hw);
    mb.box(xb - 1, bed, -hw, xb, bed + 2.6, hw);
    mb.color(0.2, 0.2, 0.22).mat(MAT.METAL);
    mb.box(xb - 0.6, bed + 2.6, -hw + 0.6, xb + 0.6, bed + 5.6, -hw + 1.6);
    mb.box(xb - 0.6, bed + 2.6, hw - 1.6, xb + 0.6, bed + 5.6, hw - 0.6);
    mb.box(xb - 0.6, bed + 5.0, -hw + 0.6, xb + 0.6, bed + 5.8, hw - 0.6);
  }
  if (!wreck) {
    if (model === 'coupe') {
      // Racing stripes over the hood and roof, side intakes and a rear wing on struts.
      mb.color(0.97, 0.97, 0.96).mat(MAT.PAINT);
      for (const z of [-2.8, 1.2]) {
        let xa = sh.cab[1] * L;
        for (let i = 0; i < 4; i += 1) {
          const xb = xa + (L / 2 - 0.2 - sh.cab[1] * L) / 4;
          mb.quad(xa, topAt(xa) + 0.04, z, xb, topAt(xb) + 0.04, z, xb, topAt(xb) + 0.04, z + 1.6, xa, topAt(xa) + 0.04, z + 1.6);
          xa = xb;
        }
        mb.quad(sh.cab[2] * L, sh.roof + 0.2, z, sh.cab[3] * L, sh.roof + 0.2, z, sh.cab[3] * L, sh.roof + 0.2, z + 1.6, sh.cab[2] * L, sh.roof + 0.2, z + 1.6);
      }
      mb.color(0.03, 0.03, 0.035).mat(MAT.PLAIN);
      for (const s of [-1, 1]) mb.quad(-L * 0.24, sh.sill + 2.2, (hw + 0.06) * s, -L * 0.36, sh.sill + 2.2, (hw + 0.06) * s, -L * 0.34, topAt(-L * 0.3) - 1.8, (hw + 0.06) * s, -L * 0.26, topAt(-L * 0.3) - 1.8, (hw + 0.06) * s);
      const deck = topAt(-L / 2 + 3);
      mb.color(0.05, 0.05, 0.06).mat(MAT.PAINT);
      for (const s of [-1, 1]) mb.box(-L / 2 + 2.2, deck - 0.2, s * 5.2 - 0.5, -L / 2 + 3.8, deck + 3.2, s * 5.2 + 0.5);
      mb.box(-L / 2 - 0.2, deck + 3.0, -hw + 0.3, -L / 2 + 5.4, deck + 3.8, hw - 0.3);
      for (const s of [-1, 1]) mb.box(-L / 2 - 0.2, deck + 1.8, s * (hw - 0.3) - 0.25, -L / 2 + 5.4, deck + 4.6, s * (hw - 0.3) + 0.25);
    } else if (model === 'muscle') {
      mb.color(0.05, 0.05, 0.06).mat(MAT.PAINT);
      mb.box(L * 0.14, topAt(L * 0.2) - 0.2, -3.2, L * 0.33, topAt(L * 0.2) + 1.9, 3.2);
      mb.color(0.97, 0.97, 0.96).mat(MAT.PAINT);
      for (const z of [-3.4, 1.6]) {
        mb.quad(sh.cab[1] * L, topAt(sh.cab[1] * L) + 0.05, z, L / 2 - 0.3, topAt(L / 2 - 0.3) + 0.05, z, L / 2 - 0.3, topAt(L / 2 - 0.3) + 0.05, z + 1.8, sh.cab[1] * L, topAt(sh.cab[1] * L) + 0.05, z + 1.8);
        mb.quad(sh.cab[2] * L, sh.roof + 0.2, z, sh.cab[3] * L, sh.roof + 0.2, z, sh.cab[3] * L, sh.roof + 0.2, z + 1.8, sh.cab[2] * L, sh.roof + 0.2, z + 1.8);
        mb.quad(-L / 2 + 0.4, topAt(-L / 2 + 0.4) + 0.05, z, sh.cab[0] * L, topAt(sh.cab[0] * L) + 0.05, z, sh.cab[0] * L, topAt(sh.cab[0] * L) + 0.05, z + 1.8, -L / 2 + 0.4, topAt(-L / 2 + 0.4) + 0.05, z + 1.8);
      }
      mb.color(0.05, 0.05, 0.06).mat(MAT.PAINT);
      mb.box(-L / 2 + 0.2, topAt(-L / 2 + 1) - 0.1, -hw + 1.2, -L / 2 + 2.4, topAt(-L / 2 + 1) + 0.9, hw - 1.2);
    } else if (model === 'taxi') {
      // Checker band along the doors.
      mb.color(0.07, 0.07, 0.08).mat(MAT.PLAIN);
      for (let i = 0; i < 12; i += 1) {
        for (const s of [-1, 1]) {
          const x = -L * 0.3 + i * 2.2;
          const y = i % 2 ? 6.1 : 5.2;
          mb.quad(x, y, (hw + 0.06) * s, x + 1.1, y, (hw + 0.06) * s, x + 1.1, y + 0.9, (hw + 0.06) * s, x, y + 0.9, (hw + 0.06) * s);
        }
      }
    } else if (police) {
      // Blue stripe, HKPD on the doors, a push bar on the nose and the unit number on the roof.
      mb.color(0.15, 0.38, 0.95).mat(MAT.PAINT);
      for (const s of [-1, 1]) mb.quad(-L * 0.29, 4.4, (hw + 0.07) * s, L * 0.21, 4.4, (hw + 0.07) * s, L * 0.21, 5.4, (hw + 0.07) * s, -L * 0.29, 5.4, (hw + 0.07) * s);
      const e = atlasEntry(sharedAtlas.atlas, 'HKPD');
      mb.color(0.08, 0.1, 0.2).color2(0.95, 0.95, 0.94).mat(MAT.SIGN, 1);
      for (const s of [-1, 1]) {
        const z = (hw + 0.12) * s;
        const xa = s > 0 ? -L * 0.22 : L * 0.15;
        const xb = s > 0 ? L * 0.15 : -L * 0.22;
        mb.quad(xa, 7.9, z, xb, 7.9, z, xb, 6.0, z, xa, 6.0, z, e.u0, e.v0, e.u1, e.v1);
      }
      mb.color(0.08, 0.08, 0.09).mat(MAT.METAL);
      mb.box(L / 2 + 1.0, sh.sill - 0.2, -hw + 2.6, L / 2 + 2.4, sh.sill + 4.4, -hw + 3.6);
      mb.box(L / 2 + 1.0, sh.sill - 0.2, hw - 3.6, L / 2 + 2.4, sh.sill + 4.4, hw - 2.6);
      mb.box(L / 2 + 1.4, sh.sill + 0.6, -hw + 2.6, L / 2 + 2.6, sh.sill + 1.6, hw - 2.6);
      mb.box(L / 2 + 1.4, sh.sill + 3.0, -hw + 2.6, L / 2 + 2.6, sh.sill + 4.0, hw - 2.6);
      mb.color(0.8, 0.82, 0.86).mat(MAT.METAL);
      mb.box(sh.cab[1] * L - 2.4, topAt(sh.cab[1] * L) + 0.4, -hw * 0.86 - 1.2, sh.cab[1] * L - 0.8, topAt(sh.cab[1] * L) + 1.6, -hw * 0.86, '');
    }
  }
  if (wreck) {
    fx.reset();
    opaque.reset();
  }
  return { mb, info };
}

function buildBike(paint) {
  const mb = new MeshBuilder(1024, 2048);
  const c = rgb01(hexRgb(paint));
  // Engine and frame.
  mb.color(0.14, 0.14, 0.16).mat(MAT.METAL);
  mb.box(-3.5, 3.4, -1.9, 4, 7.4, 1.9);
  mb.color(0.55, 0.57, 0.6).mat(MAT.METAL);
  mb.tube(-9.5, 3.3, 0, -2, 7.5, 0, 0.55, 0.55, 6);
  mb.tube(-2, 7.5, 0, 6.5, 9.6, 0, 0.6, 0.6, 6);
  mb.tube(9.5, 3.3, -1.3, 7.2, 11.2, -1.3, 0.45, 0.45, 6);
  mb.tube(9.5, 3.3, 1.3, 7.2, 11.2, 1.3, 0.45, 0.45, 6);
  mb.tube(-1, 4, 2.1, -11, 5.6, 2.3, 0.7, 0.5, 6, true);
  // Tank, seat, tail and fairing in the paint.
  mb.color(...c).mat(MAT.PAINT);
  mb.box(-1.5, 7.4, -2.3, 5.6, 10.4, 2.3);
  mb.box(-11.2, 7.6, -1.6, -6.4, 9.6, 1.6);
  mb.poly([[5, 8, -2.5], [10.6, 8.8, -2.2], [9.6, 13, -1.6], [5.6, 11.6, -2.2]]);
  mb.poly([[5, 8, 2.5], [10.6, 8.8, 2.2], [9.6, 13, 1.6], [5.6, 11.6, 2.2]]);
  mb.quad(10.6, 8.8, -2.2, 10.6, 8.8, 2.2, 9.6, 13, 1.6, 9.6, 13, -1.6);
  mb.color(0.06, 0.06, 0.07).mat(MAT.PLAIN);
  mb.box(-7, 8.6, -1.8, -1.2, 10.2, 1.8);
  mb.color(0.15, 0.18, 0.22).mat(MAT.GLASS);
  mb.quad(9.6, 13, -1.5, 9.6, 13, 1.5, 8.2, 15, 1.2, 8.2, 15, -1.2);
  mb.color(0.12, 0.12, 0.13).mat(MAT.METAL);
  mb.box(6.6, 11.2, -4.4, 7.4, 11.9, 4.4);
  return { mb, info: { L: 28, hw: 5, wr: 3.3, lamps: null, glass: null, glassOpaque: null } };
}

/** A cheap unit wheel for the middle distance: an octagonal tyre with flat silver discs. */
function buildWheelLow() {
  const mb = new MeshBuilder(128, 256);
  const N = 8;
  mb.color(0.045, 0.045, 0.05).mat(MAT.PLAIN);
  mb.tube(0, 0, -1.6, 0, 0, 1.6, 1, 1, N, false);
  mb.color(0.62, 0.64, 0.68).mat(MAT.METAL);
  for (const s of [-1, 1]) mb.poly(Array.from({ length: N }, (_, i) => [Math.cos((i / N) * Math.PI * 2) * 0.66, Math.sin((i / N) * Math.PI * 2) * 0.66, 1.62 * s]));
  return mb;
}

/** A distant car: the body profile as one prism, a roof block and dark glass (a few dozen verts). */
function buildLowCar(model, paint, spec, wreck) {
  const mb = new MeshBuilder(128, 256);
  const L = spec.length;
  const hw = spec.width / 2;
  const sh = SHAPES[model];
  const base = wreck ? [0.09, 0.08, 0.075] : rgb01(hexRgb(paint));
  const prof = sh.prof.map(([x, y]) => [x * L, y]);
  const outline = [[-L / 2, sh.sill], [L / 2, sh.sill], ...prof.slice().reverse()];
  mb.color(...base).mat(MAT.PAINT);
  mb.extrude(outline, -hw, hw);
  if (sh.cab) {
    const [c0, c1, r0, r1] = sh.cab;
    const b0 = lineAt(prof, c0 * L);
    const b1 = lineAt(prof, c1 * L);
    mb.color(0.09, 0.12, 0.16).mat(MAT.GLASS);
    mb.extrude([[c0 * L, b0], [c1 * L, b1], [r1 * L, sh.roof], [r0 * L, sh.roof]], -hw * 0.82, hw * 0.82);
    mb.color(...(model === 'police' && !wreck ? [0.95, 0.95, 0.94] : base)).mat(MAT.PAINT);
    mb.box(r0 * L, sh.roof - 0.2, -hw * 0.72, r1 * L, sh.roof + 0.3, hw * 0.72, 'b');
  }
  return mb;
}

/** A unit wheel (radius 1, 3.2 wide along Z): tyre, sidewalls, five-spoke rims and hubs. */
function buildWheel() {
  const mb = new MeshBuilder(1024, 2048);
  const N = 12;
  mb.color(0.045, 0.045, 0.05).mat(MAT.PLAIN);
  mb.tube(0, 0, -1.6, 0, 0, 1.6, 1, 1, N, false);
  for (const s of [-1, 1]) {
    const z = 1.6 * s;
    // Sidewall ring.
    mb.color(0.06, 0.06, 0.065).mat(MAT.PLAIN);
    for (let i = 0; i < N; i += 1) {
      const a0 = (i / N) * Math.PI * 2;
      const a1 = ((i + 1) / N) * Math.PI * 2;
      mb.quad(Math.cos(a0) * 0.68, Math.sin(a0) * 0.68, z, Math.cos(a1) * 0.68, Math.sin(a1) * 0.68, z, Math.cos(a1), Math.sin(a1), z, Math.cos(a0), Math.sin(a0), z);
    }
    // Dark rim well, then the rim lip, five spokes and the hub.
    mb.color(0.07, 0.07, 0.08).mat(MAT.PLAIN);
    mb.poly(Array.from({ length: N }, (_, i) => [Math.cos((i / N) * Math.PI * 2) * 0.68, Math.sin((i / N) * Math.PI * 2) * 0.68, z * 0.97]));
    mb.color(0.72, 0.74, 0.78).mat(MAT.METAL);
    mb.tube(0, 0, z * 0.9, 0, 0, z * 1.01, 0.7, 0.7, N, false);
    for (let k = 0; k < 5; k += 1) {
      const a = (k / 5) * Math.PI * 2;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      const w = 0.09;
      mb.quad(-sa * w + ca * 0.14, ca * w + sa * 0.14, z * 1.01, sa * w + ca * 0.14, -ca * w + sa * 0.14, z * 1.01, sa * w * 1.6 + ca * 0.66, -ca * w * 1.6 + sa * 0.66, z * 1.01, -sa * w * 1.6 + ca * 0.66, ca * w * 1.6 + sa * 0.66, z * 1.01);
    }
    mb.poly(Array.from({ length: 8 }, (_, i) => [Math.cos((i / 8) * Math.PI * 2) * 0.2, Math.sin((i / 8) * Math.PI * 2) * 0.2, z * 1.03]));
  }
  return mb;
}

/** The cached body for a model and paint (wrecks share one charred look). */
export function vehicleTemplate(model, paint, spec, wreck, atlas) {
  sharedAtlas.atlas = atlas;
  const key = `${model}|${wreck ? 'wreck' : paint}`;
  let t = templates.get(key);
  if (!t) {
    t = model === 'bike' ? buildBike(wreck ? '#2a2522' : paint) : buildCar(model, paint, spec, wreck);
    t.low = model === 'bike' ? t.mb : buildLowCar(model, paint, spec, wreck);
    templates.set(key, t);
  }
  return t;
}

const DRIVER_SKINS = ['#f1c27d', '#e0ac69', '#c68642', '#8d5524', '#ffdbac', '#a0673c'];
const DRIVER_SHIRTS = ['#ff6b6b', '#4ecdc4', '#ffe66d', '#f7fff7', '#1a535c', '#ff9f1c', '#9b5de5', '#00bbf9', '#f15bb5', '#2ec4b6'];
const DRIVER_HAIR = ['#1b1b1b', '#3b2416', '#7a4a22', '#c9a15a', '#e8e0d0', '#b23a48'];

/** Who is at the wheel: the player, an officer, a crew member or a civilian (by vehicle id). */
function driverLook(v) {
  const d = v.driver;
  if (d === 'player') return { skin: '#c68642', shirt: '#ff6b5a', hair: '#1b1b1b', shades: true };
  if (d && d.team === 'police') return { skin: '#e0ac69', shirt: '#2a4d8f', hair: '#1b1b1b', hat: '#14213d' };
  if (d && d.team === 'gang') return { skin: '#a0673c', shirt: '#14b8a6', hair: '#1b1b1b', hat: '#0f766e' };
  if (d && d.look) return d.look;
  const i = v.id * 7 + 3;
  return { skin: DRIVER_SKINS[i % 6], shirt: DRIVER_SHIRTS[(i >> 1) % 10], hair: DRIVER_HAIR[(i >> 2) % 6] };
}

function hex01(h) {
  const c = hexRgb(h);
  return [c[0] / 255, c[1] / 255, c[2] / 255];
}

/** A seated figure: torso, shoulders, arms to the wheel, head with hair or cap (and shades). */
function seatedPerson(mb, seat, z, look, steer, withWheel) {
  const skin = hex01(look.skin);
  const shirt = hex01(look.shirt);
  const x = seat.seatX + 1.2;
  const top = seat.headTop;
  const headH = 2.9;
  const h0 = top - headH;
  mb.color(...shirt).mat(MAT.PLAIN);
  mb.box(x - 1.3, seat.belt - 3, z - 2.1, x + 1.5, h0 - 0.5, z + 2.1);
  mb.box(x - 1.1, h0 - 1.4, z - 2.6, x + 1.3, h0 - 0.3, z + 2.6);
  if (withWheel) {
    for (const s of [-1, 1]) {
      const wz = z + s * 1.2 + steer * s * 0.3;
      mb.tube(x + 0.4, h0 - 1, z + s * 2.2, seat.wheelX - 0.2, seat.wheelY + 0.4, wz, 0.55, 0.5, 5, false);
    }
  }
  mb.color(...skin);
  mb.box(x - 0.6, h0 - 0.5, z - 0.6, x + 0.6, h0 + 0.1, z + 0.6);
  mb.box(x - 1.2, h0, z - 1.15, x + 1.3, top - 0.2, z + 1.15);
  if (look.hat) {
    mb.color(...hex01(look.hat));
    mb.box(x - 1.35, top - 1.0, z - 1.3, x + 1.4, top, z + 1.3);
    mb.box(x + 1.0, top - 1.0, z - 1.2, x + 2.4, top - 0.6, z + 1.2);
  } else {
    mb.color(...hex01(look.hair ?? '#1b1b1b'));
    mb.box(x - 1.35, top - 0.9, z - 1.25, x + 1.0, top + 0.15, z + 1.25);
    mb.box(x - 1.35, h0 + 0.4, z - 1.25, x - 0.7, top - 0.5, z + 1.25);
  }
  if (look.shades) {
    mb.color(0.02, 0.02, 0.03).mat(MAT.METAL);
    mb.box(x + 1.25, top - 1.5, z - 1.1, x + 1.45, top - 0.9, z + 1.1, '');
  }
}

/** Body roll / pitch smoothing kept per vehicle id between frames. */
const motion = new Map();

let wheelLow = null;

/**
 * Append one vehicle for this frame: body, wheels, lamps, light bar, driver and (into `glassMB`,
 * the effects buffer) its see-through glass. lod 1 (middle distance) uses solid glass, simple
 * wheels and no driver; lod 2 (far away) a low-poly silhouette.
 */
export function appendVehicle(mb, v, t, night, atlas, dt = 1 / 60, lod = 0, glassMB = null) {
  const spec = v.spec;
  const L = spec.length;
  const W = spec.width;
  const hw = W / 2;
  const fwd = v.vx * Math.cos(v.angle) + v.vy * Math.sin(v.angle);
  let m = motion.get(v.id);
  if (!m) {
    m = { roll: 0, pitch: 0, spin: 0, seen: 0 };
    motion.set(v.id, m);
  }
  const k = Math.min(1, dt * 6);
  const rollT = v.wrecked ? 0.05 : clamp((v.slip ?? 0) * 0.00022 + v.steer * clamp(Math.abs(fwd) / 600, 0, 1) * 0.05, -0.085, 0.085);
  const pitchT = v.wrecked ? -0.02 : v.braking && Math.abs(fwd) > 20 ? -0.03 : v.input.throttle > 0 && Math.abs(fwd) < spec.maxSpeed * 0.7 ? 0.018 : 0;
  m.roll += (rollT - m.roll) * k;
  m.pitch += (pitchT - m.pitch) * k;
  const isBike = v.model === 'bike';
  const wr = wheelRadius(v.model);
  m.spin += (fwd / wr) * dt;
  const lean = isBike ? clamp(-v.steer * clamp(Math.abs(fwd) / 300, 0, 1) * 0.45, -0.45, 0.45) : 0;
  const body = frame(v.x, isBike ? 0 : 0.4, v.y, v.angle, m.pitch, isBike ? lean : m.roll);
  const tpl = vehicleTemplate(v.model, v.paint, spec, v.wrecked, atlas);
  const info = tpl.info;
  if (lod >= 2) {
    mb.append(tpl.low, body);
    if (v.wrecked) return;
  } else {
    mb.append(tpl.mb, body);
    const near = lod === 0 && glassMB;
    if (info.glass) {
      if (near && info.glass.vcount) glassMB.append(info.glass, body);
      else if (!near && info.glassOpaque.vcount) mb.append(info.glassOpaque, body);
    }
  }
  // Wheels: detailed up close, octagons in the middle distance, none far away.
  if (!wheelTemplate) {
    wheelTemplate = buildWheel();
    wheelLow = buildWheelLow();
  }
  const wheelMesh = lod === 0 ? wheelTemplate : wheelLow;
  const ca = Math.cos(v.angle);
  const sa = Math.sin(v.angle);
  const axles = lod >= 2 ? [] : isBike ? [[9.5, 0], [-9.5, 0]] : [[L * 0.32, -(hw - 1.9)], [L * 0.32, hw - 1.9], [-L * 0.31, -(hw - 1.9)], [-L * 0.31, hw - 1.9]];
  for (let i = 0; i < axles.length; i += 1) {
    const [ax, az] = axles[i];
    const wx = v.x + ca * ax - sa * az;
    const wz = v.y + sa * ax + ca * az;
    const steer = ax > 0 ? v.steer * 0.42 : 0;
    const f = frame(wx, wr, wz, v.angle + steer, -m.spin, isBike ? lean : 0);
    // Scale the unit wheel to radius wr (rotation columns carry the radius, width stays 1).
    const s = new Float32Array(f);
    for (let c = 0; c < 6; c += 1) s[c] *= wr;
    const wk = isBike ? 0.45 : v.model === 'muscle' && ax < 0 ? 1.12 : 1;
    s[6] *= wk;
    s[7] *= wk;
    s[8] *= wk;
    mb.append(wheelMesh, s);
  }
  if (v.wrecked) return;
  mb.xform(body);
  // The driver (and a partner in police cruisers), seen through the glass.
  if (lod === 0 && v.driver && info.seat && !info.hidden) {
    const look = driverLook(v);
    seatedPerson(mb, info.seat, -info.seat.seatZ, look, v.steer, true);
    if (v.model === 'police' && v.crew !== 0) seatedPerson(mb, info.seat, info.seat.seatZ, { ...look, skin: '#8d5524' }, 0, false);
  }
  // Live lamps: headlights, tail lights (bright when braking), the taxi sign, the police light bar.
  const lightsOn = v.lightsOn || (night > 0.3 && !!v.driver);
  const head = lightsOn ? 230 : 40;
  const lp = info.lamps;
  if (isBike) {
    mb.color(1, 0.95, 0.84).color2(0.85, 0.86, 0.86).mat(MAT.EMIT, head, 0);
    mb.box(10.4, 10.6, -1, 11, 12, 1, '');
    mb.color(1, 0.08, 0.1).color2(0.5, 0.05, 0.07).mat(MAT.EMIT, v.braking ? 255 : lightsOn ? 120 : 40, 0);
    mb.box(-11.6, 8, -0.9, -11.1, 9, 0.9, '');
  } else {
    mb.color(1, 0.95, 0.84).color2(0.86, 0.88, 0.9).mat(MAT.EMIT, head, 0);
    for (const s of [-1, 1]) mb.box(lp.front - 0.3, lp.headY0, s * (hw - 1.4) - (s > 0 ? 4.2 : 0), lp.front + 0.3, lp.headY1, s * (hw - 1.4) + (s < 0 ? 4.2 : 0), '');
    const tail = v.braking ? 255 : lightsOn ? 140 : 55;
    mb.color(1, 0.06, 0.08).color2(0.55, 0.04, 0.06).mat(MAT.EMIT, tail, 0);
    const [ty0, ty1] = lp.tail;
    if (v.model === 'van') {
      for (const s of [-1, 1]) mb.box(lp.rear - 0.4, ty0, s * (hw - 0.6) - (s > 0 ? 2 : 0), lp.rear + 0.1, ty1, s * (hw - 0.6) + (s < 0 ? 2 : 0), '');
    } else {
      for (const s of [-1, 1]) mb.box(lp.rear - 0.45, ty0, s * (hw - 1.0) - (s > 0 ? 4.6 : 0), lp.rear + 0.1, ty1, s * (hw - 1.0) + (s < 0 ? 4.6 : 0), '');
      mb.color(1, 0.06, 0.08).color2(0.45, 0.04, 0.06).mat(MAT.EMIT, tail * 0.45, 0);
      mb.box(lp.rear - 0.35, ty0 + 0.35, -hw + 5.6, lp.rear, ty1 - 0.35, hw - 5.6, '');
    }
  }
  if (v.model === 'taxi') {
    const sign = atlasEntry(atlas, 'KEYCAB');
    const y0 = info.roof + 0.15;
    mb.color(0.1, 0.1, 0.1).mat(MAT.PLAIN);
    mb.box(-3.2, y0, -1.2, 3.6, y0 + 0.5, 1.2);
    mb.color(1, 0.84, 0.25).color2(0.98, 0.86, 0.3).mat(MAT.EMIT, night > 0.3 ? 120 : 30, 0);
    mb.box(-3, y0 + 0.5, -4.2, 3.4, y0 + 3.6, 4.2, 'b');
    mb.color(0.05, 0.05, 0.05).color2(1, 0.84, 0.25).mat(MAT.SIGN, 1);
    for (const s of [-1, 1]) {
      const z = 4.25 * s;
      const xa = s > 0 ? -2.8 : 3.2;
      const xb = s > 0 ? 3.2 : -2.8;
      mb.quad(xa, y0 + 3.3, z, xb, y0 + 3.3, z, xb, y0 + 0.8, z, xa, y0 + 0.8, z, sign.u0, sign.v0, sign.u1, sign.v1);
    }
  }
  if (v.model === 'police') {
    const phase = Math.floor(t * 8 + v.id) % 2;
    const on = v.siren;
    const y0 = info.roof + 0.15;
    mb.color(0.1, 0.1, 0.12).mat(MAT.METAL);
    mb.box(-2.6, y0, -hw + 2.0, 2.6, y0 + 1.1, hw - 2.0);
    mb.color(1, 0.1, 0.14).color2(0.45, 0.05, 0.07).mat(MAT.EMIT, on && phase ? 255 : on ? 70 : 14, 0);
    mb.box(-2.3, y0 + 1.1, -hw + 2.2, 2.3, y0 + 3.1, -0.7);
    mb.color(0.12, 0.38, 1).color2(0.05, 0.1, 0.45).mat(MAT.EMIT, on && !phase ? 255 : on ? 70 : 14, 0);
    mb.box(-2.3, y0 + 1.1, 0.7, 2.3, y0 + 3.1, hw - 2.2);
    mb.color(1, 1, 1).color2(0.75, 0.75, 0.75).mat(MAT.EMIT, on ? 140 : 12, 0);
    mb.box(-1.6, y0 + 1.1, -0.7, 1.6, y0 + 2.5, 0.7);
    // Grille strobes.
    mb.color(phase ? 1 : 0.15, phase ? 0.12 : 0.35, phase ? 0.15 : 1).color2(0.3, 0.3, 0.3).mat(MAT.EMIT, on ? 200 : 0, 0);
    mb.box(lp.front + 0.3, info.wr + 0.6, -3.2, lp.front + 0.6, info.wr + 1.4, -1.4, '');
    mb.color(phase ? 0.15 : 1, phase ? 0.35 : 0.12, phase ? 1 : 0.15).color2(0.3, 0.3, 0.3).mat(MAT.EMIT, on ? 200 : 0, 0);
    mb.box(lp.front + 0.3, info.wr + 0.6, 1.4, lp.front + 0.6, info.wr + 1.4, 3.2, '');
  }
  if (isBike && v.driver) {
    // The rider: legs on the pegs, leaning into the bars, helmet with a dark visor.
    const look = driverLook(v);
    const shirt = hex01(look.shirt);
    mb.color(0.18, 0.18, 0.22).mat(MAT.PLAIN);
    for (const s of [-1, 1]) {
      mb.box(-6, 8.6, s * 2.4 - 0.9, 0.5, 10.4, s * 2.4 + 0.9);
      mb.box(-0.5, 3.6, s * 2.4 - 0.8, 1.2, 10, s * 2.4 + 0.8);
    }
    mb.color(...shirt).mat(MAT.PLAIN);
    mb.xform(frame(v.x, isBike ? 0 : 0.4, v.y, v.angle, m.pitch - 0.42, lean));
    mb.box(-4.4, 9.2, -2.3, -0.8, 16, 2.3);
    mb.xform(body);
    for (const s of [-1, 1]) mb.tube(-0.6, 15.2, s * 2.4, 6.8, 12.2, s * 3.6, 0.65, 0.55, 5, false);
    mb.color(...(v.driver === 'player' ? [0.1, 0.1, 0.12] : [0.95, 0.95, 0.95])).mat(MAT.PAINT);
    mb.box(-0.8, 15.6, -1.8, 2.8, 19.2, 1.8);
    mb.color(0.05, 0.06, 0.08).mat(MAT.GLASS);
    mb.box(2.8, 16.4, -1.5, 3.0, 18.2, 1.5, '');
  }
  mb.xform(null);
}

/** Forget smoothing state for vehicles that no longer exist. */
export function pruneVehicleMotion(vehicles) {
  if (motion.size < 400) return;
  const alive = new Set(vehicles.map((v) => v.id));
  for (const id of motion.keys()) if (!alive.has(id)) motion.delete(id);
}

let heliTemplate = null;

function buildHeli(atlas) {
  const mb = new MeshBuilder(2048, 4096);
  const navy = [0.09, 0.14, 0.28];
  mb.color(...navy).mat(MAT.PAINT);
  mb.blob(0, 0, 0, 17, 8.5, 8.5, 3, 0, 6, 10);
  mb.color(0.1, 0.14, 0.2).mat(MAT.GLASS);
  mb.blob(9, 1.5, 0, 9.5, 6.4, 7.2, 5, 0, 5, 10);
  mb.color(0.95, 0.95, 0.94).mat(MAT.PAINT);
  for (const s of [-1, 1]) mb.quad(-12, -1.5, 8.2 * s, 6, -1.5, 8.2 * s, 6, 0.6, 8.2 * s, -12, 0.6, 8.2 * s);
  const e = atlasEntry(atlas, 'HKPD');
  mb.color(0.95, 0.95, 0.94).color2(0.09, 0.14, 0.28).mat(MAT.SIGN, 1);
  mb.quad(-11, 5.5, 7.4, -1, 5.5, 7.4, -1, 2.2, 8.0, -11, 2.2, 8.0, e.u0, e.v0, e.u1, e.v1);
  mb.quad(-1, 5.5, -7.4, -11, 5.5, -7.4, -11, 2.2, -8.0, -1, 2.2, -8.0, e.u0, e.v0, e.u1, e.v1);
  mb.color(...navy).mat(MAT.PAINT);
  mb.tube(-10, 2, 0, -46, 5, 0, 3, 1.3, 8, true);
  mb.poly([[-40, 5, 0], [-48, 5, 0], [-50, 17, 0], [-45, 17, 0]]);
  mb.box(-44, 4.4, -7, -40, 5.4, 7);
  mb.color(0.2, 0.22, 0.25).mat(MAT.METAL);
  for (const s of [-1, 1]) {
    mb.box(-12, -10.5, 7 * s - 0.8, 14, -9.5, 7 * s + 0.8);
    mb.box(-6, -10, 6 * s - 0.5, -4.6, -5, 6 * s + 0.5);
    mb.box(6, -10, 6 * s - 0.5, 7.4, -5, 6 * s + 0.5);
  }
  mb.tube(0, 7.5, 0, 0, 12, 0, 1.6, 1.2, 6, true);
  mb.box(-6, 7, -4, 6, 9, 4);
  mb.color(0.15, 0.15, 0.17).mat(MAT.METAL);
  mb.box(11, -8.5, -2, 15, -5.5, 2);
  return mb;
}

/** The helicopter at altitude `alt` with spinning rotors and blinking beacons. */
export function appendHeli(mb, h, alt, t, atlas) {
  if (!heliTemplate) heliTemplate = buildHeli(atlas);
  const sp = Math.hypot(h.vx, h.vy);
  const pitch = -clamp(sp / 520, 0, 1) * 0.16;
  const f = frame(h.x, alt, h.y, h.angle, pitch, Math.sin(t * 0.7) * 0.03);
  mb.append(heliTemplate, f);
  mb.xform(f);
  mb.color(0.12, 0.12, 0.13).mat(MAT.METAL);
  for (let i = 0; i < 4; i += 1) {
    const a = h.rotor + (i * Math.PI) / 2;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    const bx = ca * 44;
    const bz = sa * 44;
    const px = -sa * 1.6;
    const pz = ca * 1.6;
    mb.quad(px, 12.2, pz, bx + px, 12.4, bz + pz, bx - px, 12.4, bz - pz, -px, 12.2, -pz);
  }
  const ta = h.rotor * 2.3;
  mb.quad(-46 + Math.cos(ta) * 7, 8 + Math.sin(ta) * 7, 1.8, -46 - Math.cos(ta) * 7, 8 - Math.sin(ta) * 7, 1.8, -46 - Math.cos(ta) * 7 + 0.9, 8 - Math.sin(ta) * 7, 1.8, -46 + Math.cos(ta) * 7 + 0.9, 8 + Math.sin(ta) * 7, 1.8);
  const blink = Math.sin(t * 9) > 0;
  mb.color(1, 0.15, 0.15).color2(0.4, 0.1, 0.1).mat(MAT.EMIT, blink ? 255 : 30, 0);
  mb.box(-49, 16.5, -0.8, -47, 18.5, 0.8, '');
  mb.color(0.3, 0.45, 1).color2(0.1, 0.1, 0.4).mat(MAT.EMIT, blink ? 30 : 255, 0);
  mb.box(-2, -9, -1, 2, -7.5, 1, '');
  mb.color(1, 1, 0.92).color2(1, 1, 1).mat(MAT.EMIT, 255, 0);
  mb.box(15, -8, -1.6, 15.6, -6, 1.6, '');
  mb.xform(null);
  return f;
}
