// Camera-facing effects for the 3D view, rebuilt every frame from the simulation: tyre smoke
// and exhaust as soft puffs, fire, sparks, muzzle flashes and explosion bursts as additive
// billboards, bullet tracers as glowing streaks, shock rings, splashes, blood and debris, plus
// skid marks on the asphalt, mission beacons (light columns and pulsing rings), the helicopter's
// rotor blur and searchlight cone, headlight beams at night and lens flares on light bars,
// lamps and tail lights.
import { MAT } from './meshBuilder.js';
import { P_BLOOD, P_DEBRIS, P_FIRE, P_FLASH, P_RING, P_SMOKE, P_SPARK, P_SPLASH, P_TRACER, P_TYRE } from '../render/particles.js';

const SH = { SOFT: 0, SOLID: 1, RING: 3, PUFF: 4, BEAM: 6, DISC: 7 };

function setFx(mb, shape, k, additive, seed = 0) {
  mb.mat(shape, Math.min(255, Math.round(k * 21.25)), additive ? 1 : 0, seed);
}

/** A camera-facing square of half-size s at (x, y, z). */
function sprite(mb, cam, x, y, z, s) {
  const R = cam.right;
  const U = cam.up;
  const rx = R[0] * s;
  const ry = R[1] * s;
  const rz = R[2] * s;
  const ux = U[0] * s;
  const uy = U[1] * s;
  const uz = U[2] * s;
  mb.quad(x - rx - ux, y - ry - uy, z - rz - uz, x + rx - ux, y + ry - uy, z + rz - uz, x + rx + ux, y + ry + uy, z + rz + uz, x - rx + ux, y - ry + uy, z - rz + uz, 0, 0, 1, 1);
}

/** A flat square on the ground (rings, glows, spots). */
function groundQuad(mb, x, y, z, s) {
  mb.quad(x - s, y, z - s, x + s, y, z - s, x + s, y, z + s, x - s, y, z + s, 0, 0, 1, 1);
}

/** A streak from a to b, w wide, turned to face the camera. */
function streak(mb, cam, ax, ay, az, bx, by, bz, w) {
  const dx = bx - ax;
  const dy = by - ay;
  const dz = bz - az;
  const vx = cam.x - (ax + bx) / 2;
  const vy = cam.y - (ay + by) / 2;
  const vz = cam.z - (az + bz) / 2;
  let sx = dy * vz - dz * vy;
  let sy = dz * vx - dx * vz;
  let sz = dx * vy - dy * vx;
  const l = Math.hypot(sx, sy, sz) || 1;
  sx = (sx / l) * w;
  sy = (sy / l) * w;
  sz = (sz / l) * w;
  mb.quad(ax - sx, ay - sy, az - sz, bx - sx, by - sy, bz - sz, bx + sx, by + sy, bz + sz, ax + sx, ay + sy, az + sz, 0, 0, 1, 1);
}

/** A cone (open both ends) from apex point a (radius ra) to base point b (radius rb). */
function cone(mb, ax, ay, az, bx, by, bz, ra, rb, sides = 14) {
  let dx = bx - ax;
  let dy = by - ay;
  let dz = bz - az;
  const len = Math.hypot(dx, dy, dz) || 1;
  dx /= len;
  dy /= len;
  dz /= len;
  let ux = Math.abs(dy) < 0.9 ? -dz : 1;
  let uy = Math.abs(dy) < 0.9 ? 0 : 0;
  let uz = Math.abs(dy) < 0.9 ? dx : 0;
  if (Math.abs(dy) >= 0.9) {
    ux = dy * 0 - dz * 0;
    uy = dz * 1 - dx * 0;
    uz = dx * 0 - dy * 1;
  }
  let l = Math.hypot(ux, uy, uz) || 1;
  ux /= l;
  uy /= l;
  uz /= l;
  const wx = dy * uz - dz * uy;
  const wy = dz * ux - dx * uz;
  const wz = dx * uy - dy * ux;
  l = 0;
  mb.ensure((sides + 1) * 2, sides * 6);
  const base = mb.vcount;
  for (let i = 0; i <= sides; i += 1) {
    const a = (i / sides) * Math.PI * 2;
    const nx = ux * Math.cos(a) + wx * Math.sin(a);
    const ny = uy * Math.cos(a) + wy * Math.sin(a);
    const nz = uz * Math.cos(a) + wz * Math.sin(a);
    mb.vert(ax + nx * ra, ay + ny * ra, az + nz * ra, nx, ny, nz, i / sides, 0);
    mb.vert(bx + nx * rb, by + ny * rb, bz + nz * rb, nx, ny, nz, i / sides, 1);
  }
  for (let i = 0; i < sides; i += 1) {
    const a = base + i * 2;
    mb.tri(a, a + 2, a + 3);
    mb.tri(a, a + 3, a + 1);
  }
}

function rgbHex(h) {
  const n = Number.parseInt(h.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

/**
 * Fill `mb` with this frame's effects. `scene` = { game, cam, night, markers, heliPose, lamps }.
 * Alpha-blended puffs come first (far to near), additive light after.
 */
export function buildEffects(mb, scene) {
  const { game, cam, night } = scene;
  const t = game.t;
  const near = (x, z, r) => Math.abs(x - cam.x) < r && Math.abs(z - cam.z) < r;
  // Skid marks on the asphalt.
  const skids = game.ground ? game.ground.skids : [];
  setFx(mb, SH.SOLID, 1, false);
  for (let i = Math.max(0, skids.length - 2500); i < skids.length; i += 1) {
    const s = skids[i];
    if (!near(s.x0, s.y0, 900)) continue;
    const dx = s.x1 - s.x0;
    const dz = s.y1 - s.y0;
    const l = Math.hypot(dx, dz) || 1;
    const nx = (-dz / l) * s.w * 0.5;
    const nz = (dx / l) * s.w * 0.5;
    mb.color(0.07, 0.07, 0.075, Math.min(0.8, s.a * 1.25));
    mb.quad(s.x0 - nx, 0.14, s.y0 - nz, s.x1 - nx, 0.14, s.y1 - nz, s.x1 + nx, 0.14, s.y1 + nz, s.x0 + nx, 0.14, s.y0 + nz, 0, 0, 1, 1);
  }
  // Smoke-like particles, sorted far to near.
  const puffs = [];
  const glow = [];
  for (const p of game.fx.list) {
    if (!near(p.x, p.y, 1400)) continue;
    if (p.kind === P_SMOKE || p.kind === P_TYRE || p.kind === P_DEBRIS || p.kind === P_BLOOD || p.kind === P_SPLASH || (p.kind === P_RING && p.color[1] > 240)) {
      puffs.push({ p, d: (p.x - cam.x) ** 2 + (p.y - cam.z) ** 2 });
    } else glow.push(p);
  }
  puffs.sort((a, b) => b.d - a.d);
  for (const { p, d } of puffs) {
    const a = p.life / p.max;
    const age = 1 - a;
    if (p.kind === P_SMOKE || p.kind === P_TYRE) {
      const tyre = p.kind === P_TYRE;
      const c = p.color;
      const g = tyre ? 0.82 : 1;
      // Smoke thins out as it reaches the lens instead of fogging the whole frame.
      const lens = Math.min(1, Math.max(0, (Math.sqrt(d) - 22) / 50));
      if (lens <= 0.01) continue;
      mb.color((c[0] / 255) * g, (c[1] / 255) * g, (c[2] / 255) * g, (tyre ? 0.38 : 0.6) * Math.min(1, a * 1.6) * lens);
      setFx(mb, SH.PUFF, 1, false, (p.x * 7) % 255);
      sprite(mb, cam, p.x, (tyre ? 4 : 7) + age * (tyre ? 14 : 30), p.y, p.size * (tyre ? 2.2 : 1.6));
    } else if (p.kind === P_DEBRIS) {
      mb.color(0.12, 0.12, 0.13, Math.min(1, a * 2));
      setFx(mb, SH.SOLID, 1, false);
      sprite(mb, cam, p.x, 2 + Math.sin(age * Math.PI) * 16, p.y, p.size * 0.8);
    } else if (p.kind === P_BLOOD) {
      mb.color(0.5, 0.03, 0.06, a);
      setFx(mb, SH.SOFT, 1, false);
      sprite(mb, cam, p.x, 4 + a * 7, p.y, p.size * 1.2);
    } else if (p.kind === P_SPLASH) {
      mb.color(0.92, 0.97, 1, a);
      setFx(mb, SH.SOFT, 1.2, false);
      sprite(mb, cam, p.x, -1 + Math.sin(age * Math.PI) * 10, p.y, p.size * 1.6);
    } else {
      mb.color(1, 1, 1, a * 0.7);
      setFx(mb, SH.RING, 1.2, false);
      groundQuad(mb, p.x, -2.4, p.y, p.size * 0.5);
    }
  }
  // Additive: fire, sparks, flashes, tracers, shock rings.
  for (const p of glow) {
    const a = p.life / p.max;
    const age = 1 - a;
    if (p.kind === P_FIRE) {
      mb.color(1, p.color[1] / 255, 0.25, a);
      setFx(mb, SH.PUFF, 3.2, true, (p.x * 13) % 255);
      sprite(mb, cam, p.x, 5 + age * 20, p.y, p.size * (0.7 + a * 0.6) * 1.5);
    } else if (p.kind === P_SPARK) {
      mb.color(1, 0.8, 0.45, a);
      setFx(mb, SH.SOLID, 5, true);
      const h = 3 + Math.sin(age * Math.PI) * 6;
      streak(mb, cam, p.x, h, p.y, p.x - p.vx * 0.035, h, p.y - p.vy * 0.035, p.size * 0.4);
    } else if (p.kind === P_FLASH) {
      if (p.burst) {
        mb.color(1, 0.75, 0.4, a);
        setFx(mb, SH.SOFT, 6, true);
        sprite(mb, cam, p.x, 14, p.y, p.size * (0.7 + age) * 1.5);
      } else {
        // Muzzle flash: a hot core, a wide soft bloom and a forward star of flame.
        mb.color(1, 0.8, 0.45, a);
        setFx(mb, SH.SOFT, 6, true);
        sprite(mb, cam, p.x, 13.6, p.y, p.size * 0.95);
        mb.color(1, 0.62, 0.25, a * 0.6);
        setFx(mb, SH.SOFT, 1.8, true);
        sprite(mb, cam, p.x, 13.6, p.y, p.size * 1.7);
        const ex = p.x + Math.cos(p.rot) * p.size * 2;
        const ez = p.y + Math.sin(p.rot) * p.size * 2;
        setFx(mb, SH.SOLID, 7, true);
        mb.color(1, 0.9, 0.6, a);
        streak(mb, cam, p.x, 13.6, p.y, ex, 13.6, ez, 1.6);
      }
    } else if (p.kind === P_TRACER) {
      mb.color(1, 0.82, 0.45, a * 0.85);
      setFx(mb, SH.SOLID, 3.5, true);
      streak(mb, cam, p.x, 13.4, p.y, p.x2, 12, p.y2, 0.35);
    } else if (p.kind === P_RING) {
      mb.color(1, 0.8, 0.55, a * 0.8);
      setFx(mb, SH.RING, 3, true);
      groundQuad(mb, p.x, 1, p.y, p.size);
    }
  }
  // Mission beacons: a light column and a pulsing ring.
  for (const m of scene.markers) {
    const [r, g, b] = rgbHex(m.color);
    if (m.small) continue;
    const rad = Math.max(16, (m.r || 30) * 0.42);
    const pulse = 0.85 + Math.sin(t * 4) * 0.15;
    mb.color(r, g, b, 0.75);
    setFx(mb, SH.BEAM, 2.2, true);
    const H = m.kind === 'contact' ? 90 : 170;
    cone(mb, m.x, H, m.y, m.x, 0, m.y, rad * 0.8, rad, 16);
    mb.color(r, g, b, 0.9);
    setFx(mb, SH.RING, 3.5, true);
    groundQuad(mb, m.x, 0.6, m.y, (m.r || 30) * pulse);
    setFx(mb, SH.SOFT, 1.2, true);
    mb.color(r, g, b, 0.6);
    groundQuad(mb, m.x, 0.5, m.y, (m.r || 30) * 0.9);
  }
  for (const tape of scene.tapes) {
    mb.color(1, 0.5, 0.72, 0.8);
    setFx(mb, SH.SOFT, 3, true);
    sprite(mb, cam, tape.x, 9, tape.y, 13 + Math.sin(t * 3 + tape.id) * 2);
  }
  // Helicopter rotor blur and searchlight.
  const h = game.heli;
  if (h && scene.heliPose) {
    const f = scene.heliPose;
    const hx = f[9];
    const hy = f[10];
    const hz = f[11];
    mb.color(0.15, 0.16, 0.18, 0.22);
    setFx(mb, SH.DISC, 1, false);
    const ux = f[3];
    const uy = f[4];
    const uz = f[5];
    const cx = hx + ux * 12.3;
    const cy = hy + uy * 12.3;
    const cz = hz + uz * 12.3;
    mb.quad(cx - 45, cy, cz - 45, cx + 45, cy, cz - 45, cx + 45, cy, cz + 45, cx - 45, cy, cz + 45, 0, 0, 1, 1);
    const lx = hx + f[0] * 13 - ux * 8;
    const ly = hy + f[1] * 13 - uy * 8;
    const lz = hz + f[2] * 13 - uz * 8;
    // The beam stays readable at dusk, and blazes at night.
    const dusk = Math.max(night, game.light.neon ?? 0, 0.35);
    mb.color(1, 0.97, 0.86, 0.45 + dusk * 0.45);
    setFx(mb, SH.BEAM, 1.2 + dusk * 2, true);
    cone(mb, lx, ly, lz, h.lightX, 0, h.lightY, 1.5, 58, 18);
    mb.color(1, 0.98, 0.9, 0.35 + dusk * 0.55);
    setFx(mb, SH.SOFT, 0.5 + dusk * 2, true);
    groundQuad(mb, h.lightX, 0.7, h.lightY, 70);
    mb.color(1, 1, 0.95, 1);
    setFx(mb, SH.SOFT, 10, true);
    sprite(mb, cam, lx, ly, lz, 7);
  }
  // Vehicle lights: beams at night, flares on light bars and lamps.
  for (const v of game.vehicles) {
    if (v.wrecked || !near(v.x, v.y, 1300)) continue;
    const ca = Math.cos(v.angle);
    const sa = Math.sin(v.angle);
    const L = v.spec.length;
    const hw = v.spec.width / 2;
    const lightsOn = v.lightsOn || (night > 0.3 && !!v.driver);
    if (v.model === 'police' && v.siren) {
      const phase = Math.floor(t * 8 + v.id) % 2;
      const side = phase ? -1 : 1;
      const x = v.x - sa * side * 3.5;
      const z = v.y + ca * side * 3.5;
      mb.color(phase ? 1 : 0.2, phase ? 0.15 : 0.4, phase ? 0.2 : 1, 1);
      setFx(mb, SH.SOFT, 9, true);
      sprite(mb, cam, x, 16, z, 6.5);
      mb.color(phase ? 1 : 0.2, phase ? 0.1 : 0.35, phase ? 0.15 : 1, 0.55);
      setFx(mb, SH.SOFT, 1.6, true);
      sprite(mb, cam, x, 16, z, 15);
    }
    if (lightsOn && night > 0.25) {
      for (const s of [-1, 1]) {
        const fx = v.x + ca * (L / 2 + 0.6) - sa * s * (hw - 3.6);
        const fz = v.y + sa * (L / 2 + 0.6) + ca * s * (hw - 3.6);
        mb.color(1, 0.96, 0.85, 1);
        setFx(mb, SH.SOFT, 6, true);
        sprite(mb, cam, fx, 6.2, fz, 3.4);
        const bx = v.x - ca * (L / 2 + 0.6) - sa * s * (hw - 3.6);
        const bz = v.y - sa * (L / 2 + 0.6) + ca * s * (hw - 3.6);
        mb.color(1, 0.1, 0.1, 1);
        setFx(mb, SH.SOFT, v.braking ? 5 : 2.5, true);
        sprite(mb, cam, bx, 6.4, bz, v.braking ? 3.6 : 2.6);
      }
      mb.color(1, 0.92, 0.75, 0.16 * night);
      setFx(mb, SH.BEAM, 1, true);
      const fx = v.x + ca * (L / 2 + 1);
      const fz = v.y + sa * (L / 2 + 1);
      cone(mb, fx, 6, fz, fx + ca * 120, 1, fz + sa * 120, 3, 34, 10);
    } else if (v.braking && v.driver) {
      for (const s of [-1, 1]) {
        const bx = v.x - ca * (L / 2 + 0.6) - sa * s * (hw - 3.6);
        const bz = v.y - sa * (L / 2 + 0.6) + ca * s * (hw - 3.6);
        mb.color(1, 0.12, 0.1, 1);
        setFx(mb, SH.SOFT, 3.5, true);
        sprite(mb, cam, bx, 6.4, bz, 3);
      }
    }
  }
  if (night > 0.3) {
    for (const l of scene.lamps) {
      if (!near(l.x, l.z, 1400)) continue;
      mb.color(1, 0.8, 0.55, night);
      setFx(mb, SH.SOFT, 3.5, true);
      sprite(mb, cam, l.x, l.y + 1, l.z, 7);
    }
  }
}
