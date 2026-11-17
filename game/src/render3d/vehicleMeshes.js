// Low-poly 3D vehicles built by code from each model's dimensions: an extruded side profile for
// the body (two-tone where the livery needs it), a narrower glass greenhouse with a painted roof
// and pillars, wheels that steer, and model details: the coupe's wing and stripes, the muscle
// car's scoop, the van's box, the pickup's open bed, the taxi sign, the police push bar and light
// bar, the motorbike and its rider. Bodies are cached per model and paint and moved into place
// each frame with roll and pitch from the physics; lamps and light bars are emitted live. The
// HKPD helicopter (pod, canopy, tail, skids, spinning rotors, searchlight) is here too.
import { MeshBuilder, MAT, frame, hexRgb } from './meshBuilder.js';
import { clamp } from '../core/math.js';
import { atlasEntry } from './textAtlas.js';

const templates = new Map();
let wheelTemplate = null;

/** Clip a convex X-Y polygon to xa <= x <= xb. */
function clipX(poly, xa, xb) {
  const clip = (pts, keep, edge) => {
    const out = [];
    for (let i = 0; i < pts.length; i += 1) {
      const p = pts[i];
      const q = pts[(i + 1) % pts.length];
      const pin = keep(p);
      const qin = keep(q);
      if (pin) out.push(p);
      if (pin !== qin) {
        const t = (edge - p[0]) / (q[0] - p[0]);
        out.push([edge, p[1] + (q[1] - p[1]) * t]);
      }
    }
    return out;
  };
  return clip(clip(poly, (p) => p[0] >= xa, xa), (p) => p[0] <= xb, xb);
}

const SHAPES = {
  coupe: { body: (L) => [[-L / 2, 2.4], [L / 2, 2.4], [L / 2, 5.0], [L / 2 - 7, 7.2], [-L / 2 + 1, 8.0], [-L / 2, 6.6]], belt: 7.4, roof: 11.6, inset: 0.84 },
  sedan: { body: (L) => [[-L / 2, 2.6], [L / 2, 2.6], [L / 2, 6.4], [L / 2 - 4, 8.3], [-L / 2 + 1.5, 8.7], [-L / 2, 7.2]], belt: 8.4, roof: 13.6, inset: 0.84 },
  muscle: { body: (L) => [[-L / 2, 2.6], [L / 2, 2.6], [L / 2, 7.0], [L / 2 - 3, 8.6], [-L / 2 + 1.5, 8.9], [-L / 2, 7.4]], belt: 8.6, roof: 12.6, inset: 0.82 },
  van: { body: (L) => [[-L / 2, 2.9], [L / 2, 2.9], [L / 2, 9.0], [L / 2 - 2, 10.2], [-L / 2, 10.2]], belt: 10.2, roof: 21, inset: 0.97 },
  pickup: { body: (L) => [[-L / 2, 3.0], [L / 2, 3.0], [L / 2, 8.2], [L / 2 - 4, 9.8], [-L / 2, 10.0]], belt: 9.8, roof: 16, inset: 0.86 },
};
SHAPES.taxi = SHAPES.sedan;
SHAPES.police = SHAPES.sedan;

function rgb01(c, k = 1) {
  return [(c[0] / 255) * k, (c[1] / 255) * k, (c[2] / 255) * k];
}

function cabin(mb, x0, x1, xr0, xr1, y0, y1, hw, paint) {
  // Greenhouse: base x0 (rear) .. x1 (front) at belt y0, roof xr0 .. xr1 at y1, half width hw.
  const tw = hw * 0.9;
  mb.color(0.1, 0.13, 0.17).mat(MAT.GLASS);
  mb.quad(x1, y0, -hw, x1, y0, hw, xr1, y1, tw, xr1, y1, -tw);
  mb.quad(x0, y0, hw, x0, y0, -hw, xr0, y1, -tw, xr0, y1, tw);
  for (const s of [-1, 1]) mb.quad(x0, y0, hw * s, x1, y0, hw * s, xr1, y1, tw * s, xr0, y1, tw * s);
  mb.color(...paint).mat(MAT.PAINT);
  mb.quad(xr0, y1, -tw, xr1, y1, -tw, xr1, y1, tw, xr0, y1, tw);
  // Pillars: B-pillar and the window frame line.
  const mid = (x0 + x1) / 2 - 1;
  const midr = (xr0 + xr1) / 2 - 1;
  for (const s of [-1, 1]) {
    mb.quad(mid - 1, y0, (hw + 0.05) * s, mid + 1, y0, (hw + 0.05) * s, midr + 1, y1, (tw + 0.05) * s, midr - 1, y1, (tw + 0.05) * s);
  }
}

function buildCar(model, paint, spec, wreck) {
  const mb = new MeshBuilder(1024, 2048);
  const L = spec.length;
  const W = spec.width;
  const hw = W / 2;
  const sh = SHAPES[model];
  const base = wreck ? [0.1, 0.09, 0.085] : rgb01(hexRgb(paint));
  const prof = sh.body(L);
  const dark = wreck ? base : [0.06, 0.06, 0.07];
  // Lower body; the police livery is black at both ends with white doors.
  if (model === 'police' && !wreck) {
    const cuts = [[-L, -L * 0.29, dark], [-L * 0.29, L * 0.21, [0.95, 0.95, 0.94]], [L * 0.21, L, dark]];
    for (const [a, b, c] of cuts) {
      mb.color(...c).mat(MAT.PAINT);
      mb.extrude(clipX(prof, a, b), -hw, hw);
    }
    mb.color(0.18, 0.42, 0.9).mat(MAT.PAINT);
    for (const s of [-1, 1]) mb.quad(-L * 0.29, 5.2, (hw + 0.08) * s, L * 0.21, 5.2, (hw + 0.08) * s, L * 0.21, 6.6, (hw + 0.08) * s, -L * 0.29, 6.6, (hw + 0.08) * s);
    const e = atlasEntry(sharedAtlas.atlas, 'HKPD');
    mb.color(0.1, 0.1, 0.12).color2(0.95, 0.95, 0.94).mat(MAT.SIGN, 1);
    for (const s of [-1, 1]) {
      const z = (hw + 0.12) * s;
      const xa = s > 0 ? -L * 0.22 : L * 0.14;
      const xb = s > 0 ? L * 0.14 : -L * 0.22;
      mb.quad(xa, 8.0, z, xb, 8.0, z, xb, 6.9, z, xa, 6.9, z, e.u0, e.v0, e.u1, e.v1);
    }
  } else {
    mb.color(...base).mat(MAT.PAINT);
    mb.extrude(prof, -hw, hw);
  }
  // Bumpers and a dark sill line.
  mb.color(0.12, 0.12, 0.13).mat(MAT.PLAIN);
  mb.box(L / 2 - 0.6, 2.2, -hw + 1, L / 2 + 0.8, 4.4, hw - 1);
  mb.box(-L / 2 - 0.8, 2.2, -hw + 1, -L / 2 + 0.6, 4.4, hw - 1);
  for (const s of [-1, 1]) mb.quad(-L / 2 + 2, 2.7, (hw + 0.05) * s, L / 2 - 2, 2.7, (hw + 0.05) * s, L / 2 - 2, 3.6, (hw + 0.05) * s, -L / 2 + 2, 3.6, (hw + 0.05) * s);
  const roofPaint = model === 'police' && !wreck ? [0.95, 0.95, 0.94] : model === 'muscle' ? base : base;
  const [cf, cr] = spec.cabin;
  if (model === 'van') {
    const xf = L / 2 - 9;
    mb.color(...base).mat(MAT.PAINT);
    mb.box(-L / 2, sh.belt, -hw * 0.98, xf, sh.roof, hw * 0.98, 'b');
    mb.color(0.1, 0.13, 0.17).mat(MAT.GLASS);
    mb.quad(xf, sh.roof, -hw * 0.9, xf, sh.roof, hw * 0.9, L / 2 - 2, sh.belt + 0.2, hw * 0.94, L / 2 - 2, sh.belt + 0.2, -hw * 0.94);
    mb.color(...base).mat(MAT.PAINT);
    for (const s of [-1, 1]) mb.poly([[xf, sh.belt, hw * 0.94 * s], [L / 2 - 2, sh.belt, hw * 0.94 * s], [xf, sh.roof, hw * 0.94 * s]]);
    mb.color(0.1, 0.13, 0.17).mat(MAT.GLASS);
    for (const s of [-1, 1]) mb.quad(xf - 8, sh.belt + 3, (hw * 0.98 + 0.1) * s, xf - 0.5, sh.belt + 3, (hw * 0.98 + 0.1) * s, xf - 0.5, sh.roof - 3, (hw * 0.98 + 0.1) * s, xf - 8, sh.roof - 3, (hw * 0.98 + 0.1) * s);
    mb.color(0.92, 0.92, 0.9).mat(MAT.PLAIN);
    for (const s of [-1, 1]) mb.quad(-L / 2 + 4, sh.belt + 4, (hw * 0.98 + 0.12) * s, xf - 12, sh.belt + 4, (hw * 0.98 + 0.12) * s, xf - 12, sh.belt + 6, (hw * 0.98 + 0.12) * s, -L / 2 + 4, sh.belt + 6, (hw * 0.98 + 0.12) * s);
  } else if (model === 'pickup') {
    const x1 = cf * L;
    const x0 = cr * L;
    cabin(mb, x0, x1, x0 + 1, x1 - 6, sh.belt, sh.roof, hw * sh.inset, base);
    mb.color(0.13, 0.13, 0.14).mat(MAT.PLAIN);
    mb.quad(-L / 2 + 1, sh.belt + 0.1, -hw + 1.5, x0 - 1, sh.belt + 0.1, -hw + 1.5, x0 - 1, sh.belt + 0.1, hw - 1.5, -L / 2 + 1, sh.belt + 0.1, hw - 1.5);
    mb.color(...base).mat(MAT.PAINT);
    mb.box(-L / 2, sh.belt, -hw, x0 - 1, sh.belt + 3.2, -hw + 1.4);
    mb.box(-L / 2, sh.belt, hw - 1.4, x0 - 1, sh.belt + 3.2, hw);
    mb.box(-L / 2, sh.belt, -hw, -L / 2 + 1.4, sh.belt + 3.2, hw);
  } else {
    const x1 = cf * L;
    const x0 = cr * L;
    cabin(mb, x0, x1, x0 + 4.5, x1 - 7.5, sh.belt - 0.1, sh.roof, hw * sh.inset, roofPaint);
  }
  if (!wreck) {
    if (model === 'coupe') {
      mb.color(0.96, 0.96, 0.95).mat(MAT.PAINT);
      for (const z of [-2.6, 1.2]) {
        mb.quad(L / 2 - 6.8, 7.25, z, L / 2 - 0.2, 5.1, z, L / 2 - 0.2, 5.1, z + 1.4, L / 2 - 6.8, 7.25, z + 1.4);
        mb.quad(cr * L + 4.5, sh.roof + 0.05, z, cf * L - 7.5, sh.roof + 0.05, z, cf * L - 7.5, sh.roof + 0.05, z + 1.4, cr * L + 4.5, sh.roof + 0.05, z + 1.4);
      }
      mb.color(0.08, 0.08, 0.09).mat(MAT.PAINT);
      mb.box(-L / 2 + 0.5, 11, -hw + 0.8, -L / 2 + 5, 11.8, hw - 0.8);
      for (const s of [-1, 1]) mb.box(-L / 2 + 2, 7.8, s * 5 - 0.5, -L / 2 + 3.5, 11, s * 5 + 0.5);
    } else if (model === 'muscle') {
      mb.color(0.07, 0.07, 0.08).mat(MAT.PAINT);
      mb.box(L * 0.12, 8.5, -3, L * 0.32, 10.3, 3);
      for (const z of [-3.2, 1.6]) mb.quad(L / 2 - 3, 8.65, z, cf * L, 8.65, z, cf * L, 8.65, z + 1.6, L / 2 - 3, 8.65, z + 1.6);
    } else if (model === 'taxi') {
      mb.color(0.08, 0.08, 0.09).mat(MAT.PLAIN);
      for (let i = 0; i < 10; i += 1) {
        for (const s of [-1, 1]) {
          const x = -L * 0.3 + i * 2.4;
          const y = i % 2 ? 6.3 : 5.3;
          mb.quad(x, y, (hw + 0.06) * s, x + 1.2, y, (hw + 0.06) * s, x + 1.2, y + 1, (hw + 0.06) * s, x, y + 1, (hw + 0.06) * s);
        }
      }
    } else if (model === 'police') {
      mb.color(0.1, 0.1, 0.11).mat(MAT.METAL);
      mb.box(L / 2 + 0.6, 2.6, -hw + 2.5, L / 2 + 2.2, 6.4, hw - 2.5);
    }
  }
  // Tail-light housings and headlight lenses (unlit look; the live glow is drawn on top).
  mb.color(0.45, 0.05, 0.07).mat(MAT.PLAIN);
  for (const s of [-1, 1]) mb.box(-L / 2 - 0.3, 5.6, s * (hw - 3.6) - 2.2, -L / 2 + 0.2, 7.2, s * (hw - 3.6) + 2.2);
  return mb;
}

function buildBike(paint) {
  const mb = new MeshBuilder(512, 1024);
  const c = rgb01(hexRgb(paint));
  mb.color(...c).mat(MAT.PAINT);
  mb.box(-4, 5, -2.2, 7, 9, 2.2);
  mb.color(0.15, 0.15, 0.17).mat(MAT.PLAIN);
  mb.box(-10, 8, -2, -2, 9.6, 2);
  mb.color(0.6, 0.62, 0.66).mat(MAT.METAL);
  mb.tube(7, 9, 0, 10.5, 4, 0, 0.7, 0.7, 5);
  mb.box(8.2, 11, -4.5, 9, 11.8, 4.5);
  mb.tube(8.6, 9, 0, 8.6, 11.4, 0, 0.6, 0.6, 5);
  mb.color(...c).mat(MAT.PAINT);
  mb.box(7.5, 8.5, -2, 11, 11, 2);
  return mb;
}

function buildWheel() {
  const mb = new MeshBuilder(256, 512);
  mb.color(0.05, 0.05, 0.055).mat(MAT.PLAIN);
  mb.tube(0, 0, -1.6, 0, 0, 1.6, 1, 1, 10, false);
  mb.color(0.62, 0.64, 0.68).mat(MAT.METAL);
  mb.tube(0, 0, 1.55, 0, 0, 1.7, 0.6, 0.6, 10, true);
  mb.tube(0, 0, -1.55, 0, 0, -1.7, 0.6, 0.6, 10, true);
  return mb;
}

const sharedAtlas = { atlas: null };

/** The cached body for a model and paint (wrecks share one charred look). */
export function vehicleTemplate(model, paint, spec, wreck, atlas) {
  sharedAtlas.atlas = atlas;
  const key = `${model}|${wreck ? 'wreck' : paint}`;
  let t = templates.get(key);
  if (!t) {
    t = model === 'bike' ? buildBike(wreck ? '#2a2522' : paint) : buildCar(model, paint, spec, wreck);
    templates.set(key, t);
  }
  return t;
}

/** Body roll / pitch smoothing kept per vehicle id between frames. */
const motion = new Map();

/** Append one vehicle (body, wheels, lamps, light bar, rider) for this frame; lod 1 drops the wheels. */
export function appendVehicle(mb, v, t, night, atlas, dt = 1 / 60, lod = 0) {
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
  m.spin += (fwd / 4.3) * dt;
  const isBike = v.model === 'bike';
  const lean = isBike ? clamp(-v.steer * clamp(Math.abs(fwd) / 300, 0, 1) * 0.45, -0.45, 0.45) : 0;
  const body = frame(v.x, isBike ? 0 : 0.4, v.y, v.angle, m.pitch, isBike ? lean : m.roll);
  mb.append(vehicleTemplate(v.model, v.paint, spec, v.wrecked, atlas), body);
  // Wheels.
  if (!wheelTemplate) wheelTemplate = buildWheel();
  const ca = Math.cos(v.angle);
  const sa = Math.sin(v.angle);
  const wr = isBike ? 3.6 : v.model === 'van' || v.model === 'pickup' ? 4.7 : 4.3;
  const axles = lod > 0 ? [] : isBike ? [[9.5, 0], [-9.5, 0]] : [[L * 0.32, -(hw - 1.6)], [L * 0.32, hw - 1.6], [-L * 0.31, -(hw - 1.6)], [-L * 0.31, hw - 1.6]];
  if (lod > 0 && !isBike) {
    // Far away the wheels are four dark blocks under the body.
    mb.xform(body);
    mb.color(0.05, 0.05, 0.055).mat(MAT.PLAIN);
    mb.box(L * 0.32 - wr, 0, -hw + 0.2, L * 0.32 + wr, wr * 1.6, hw - 0.2, 't');
    mb.box(-L * 0.31 - wr, 0, -hw + 0.2, -L * 0.31 + wr, wr * 1.6, hw - 0.2, 't');
    mb.xform(null);
  }
  for (let i = 0; i < axles.length; i += 1) {
    const [ax, az] = axles[i];
    const wx = v.x + ca * ax - sa * az;
    const wz = v.y + sa * ax + ca * az;
    const steer = ax > 0 ? v.steer * 0.42 : 0;
    const f = frame(wx, wr, wz, v.angle + steer, -m.spin, isBike ? lean : 0);
    // Scale the unit wheel to radius wr (rotation columns carry the radius, width stays 1).
    const s = new Float32Array(f);
    for (let c = 0; c < 6; c += 1) s[c] *= wr;
    s[6] *= isBike ? 0.5 : 1;
    s[7] *= isBike ? 0.5 : 1;
    s[8] *= isBike ? 0.5 : 1;
    mb.append(wheelTemplate, s);
  }
  if (v.wrecked) return;
  // Live lamps: headlights, tail lights (bright when braking), the police light bar.
  mb.xform(body);
  const lightsOn = v.lightsOn || (night > 0.3 && !!v.driver);
  const head = lightsOn ? 210 : 26;
  mb.color(1, 0.95, 0.84).color2(0.85, 0.86, 0.86).mat(MAT.EMIT, head, 0);
  if (isBike) mb.box(10.8, 9, -1, 11.6, 10.6, 1, '');
  else for (const s of [-1, 1]) mb.box(L / 2 - 0.2, 5.4, s * (hw - 3.6) - 2.0, L / 2 + 0.45, 6.9, s * (hw - 3.6) + 2.0, '');
  const tail = v.braking ? 255 : lightsOn ? 110 : 20;
  mb.color(1, 0.08, 0.1).color2(0.5, 0.05, 0.07).mat(MAT.EMIT, tail, 0);
  if (isBike) mb.box(-10.5, 9, -0.8, -10, 10, 0.8, '');
  else for (const s of [-1, 1]) mb.box(-L / 2 - 0.55, 5.8, s * (hw - 3.6) - 2.0, -L / 2 - 0.25, 7.0, s * (hw - 3.6) + 2.0, '');
  if (v.model === 'taxi') {
    mb.color(1, 0.88, 0.45).color2(0.98, 0.9, 0.6).mat(MAT.EMIT, night > 0.3 ? 140 : 20, 0);
    mb.box(-2.5, 13.6, -4.5, 3, 16.4, 4.5, 'b');
  }
  if (v.model === 'police') {
    const phase = Math.floor(t * 8 + v.id) % 2;
    const on = v.siren;
    mb.color(0.12, 0.12, 0.14).mat(MAT.METAL);
    mb.box(-3, 13.6, -hw + 2.2, 3, 14.6, hw - 2.2);
    mb.color(1, 0.12, 0.16).color2(0.4, 0.05, 0.07).mat(MAT.EMIT, on && phase ? 255 : on ? 60 : 10, 0);
    mb.box(-2.6, 14.6, -hw + 2.4, 2.6, 16.6, -0.6);
    mb.color(0.15, 0.4, 1).color2(0.05, 0.1, 0.4).mat(MAT.EMIT, on && !phase ? 255 : on ? 60 : 10, 0);
    mb.box(-2.6, 14.6, 0.6, 2.6, 16.6, hw - 2.4);
    mb.color(1, 1, 1).color2(0.7, 0.7, 0.7).mat(MAT.EMIT, on ? 120 : 10, 0);
    mb.box(-2, 14.6, -0.6, 2, 16, 0.6);
  }
  if (isBike && v.driver) {
    const player = v.driver === 'player';
    mb.color(...(player ? [1, 0.42, 0.35] : [0.23, 0.29, 0.35])).mat(MAT.PLAIN);
    mb.box(-6, 10, -2.6, 0, 17, 2.6);
    mb.color(...(player ? [0.11, 0.12, 0.14] : [0.9, 0.9, 0.9])).mat(MAT.PAINT);
    mb.box(-2.6, 17, -2, 1.4, 21, 2);
    mb.color(0.2, 0.2, 0.25).mat(MAT.PLAIN);
    mb.box(-4, 4, -3, 2, 10, -1.2);
    mb.box(-4, 4, 1.2, 2, 10, 3);
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
