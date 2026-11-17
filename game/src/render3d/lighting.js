// Picks the dynamic lights for a 3D frame: street lamps and neon signs after dusk, headlights as
// spot lights, police light bars strobing red and blue onto the street (day and night), fires,
// muzzle flashes and explosions, mission beacons and the helicopter's searchlight. The 32 that
// matter most near the camera go to the shaders as position/radius, colour/cone and direction.
import { P_FIRE, P_FLASH } from '../render/particles.js';

export const MAX_LIGHTS = 32;

export function createLightSet() {
  return { pos: new Float32Array(MAX_LIGHTS * 4), col: new Float32Array(MAX_LIGHTS * 4), dir: new Float32Array(MAX_LIGHTS * 4), n: 0, list: [] };
}

function hex01(h) {
  const n = Number.parseInt(h.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

/**
 * Gather lights around `focus` ({x, z}) for this frame. `scene` = { game, sky, city3d, markers,
 * heliPose }.
 */
export function gatherLights(set, scene, focus) {
  const { game, sky, city3d } = scene;
  const out = set.list;
  out.length = 0;
  const neon = sky.neon;
  const t = game.t;
  const add = (x, y, z, r, cr, cg, cb, prio, spot = null) => {
    const d = Math.hypot(x - focus.x, z - focus.z);
    if (d > r + 1400) return;
    out.push({ x, y, z, r, cr, cg, cb, spot, score: prio / (1 + d / 350) });
  };
  if (neon > 0.02) {
    for (const l of city3d.lamps) {
      if (Math.abs(l.x - focus.x) > 1300 || Math.abs(l.z - focus.z) > 1300) continue;
      add(l.x, l.y, l.z, 170, 1.45 * neon, 0.95 * neon, 0.52 * neon, 60);
    }
    for (const s of city3d.signs) {
      if (Math.abs(s.x - focus.x) > 1400 || Math.abs(s.z - focus.z) > 1400) continue;
      const k = 2.3 * neon * s.k;
      add(s.x, s.y, s.z, s.r, (s.color[0] / 255) * k, (s.color[1] / 255) * k, (s.color[2] / 255) * k, 70);
    }
    for (const m of scene.markers) {
      if (m.small) continue;
      const c = hex01(m.color);
      add(m.x, 20, m.y, 150, c[0] * 2 * neon, c[1] * 2 * neon, c[2] * 2 * neon, 80);
    }
  }
  for (const v of game.vehicles) {
    if (v.wrecked) continue;
    if (Math.abs(v.x - focus.x) > 1500 || Math.abs(v.y - focus.z) > 1500) continue;
    const ca = Math.cos(v.angle);
    const sa = Math.sin(v.angle);
    if (v.model === 'police' && v.siren) {
      const red = Math.floor(t * 8 + v.id) % 2 === 1;
      const k = 4.5 + neon * 2;
      add(v.x, 24, v.y, 170, red ? k : 0.1 * k, red ? 0.08 * k : 0.3 * k, red ? 0.1 * k : k, 400);
    }
    const lightsOn = v.lightsOn || (sky.night > 0.3 && !!v.driver);
    if (lightsOn && sky.night > 0.25) {
      const L = v.spec.length / 2;
      const k = 4.2 * sky.night;
      add(v.x + ca * L, 7, v.y + sa * L, 300, k, k * 0.93, k * 0.8, v.driver === 'player' ? 600 : 120, [ca, -0.16, sa, 0.8, 0.94]);
    }
  }
  for (const p of game.fx.list) {
    if (p.kind !== P_FIRE && p.kind !== P_FLASH) continue;
    if (Math.abs(p.x - focus.x) > 1200 || Math.abs(p.y - focus.z) > 1200) continue;
    const a = p.life / p.max;
    if (p.kind === P_FLASH) {
      const big = p.burst;
      add(p.x, big ? 20 : 14, p.y, big ? 380 : 120, 6 * a, 4.4 * a, 2.4 * a, big ? 900 : 500);
    } else if (p.size > 7) add(p.x, 12, p.y, 130, 2.4 * a, 1.1 * a, 0.35 * a, 150);
  }
  // Extra lights the view asks for (a fill light riding with the camera for backlit shots).
  for (const l of scene.extra ?? []) add(l.x, l.y, l.z, l.r, l.cr, l.cg, l.cb, 5000);
  const h = game.heli;
  if (h && scene.heliPose) {
    const f = scene.heliPose;
    const lx = f[9] + f[0] * 13 - f[3] * 8;
    const ly = f[10] + f[1] * 13 - f[4] * 8;
    const lz = f[11] + f[2] * 13 - f[5] * 8;
    let dx = h.lightX - lx;
    let dy = -ly;
    let dz = h.lightY - lz;
    const len = Math.hypot(dx, dy, dz) || 1;
    dx /= len;
    dy /= len;
    dz /= len;
    const outer = Math.cos(Math.atan(66 / len));
    const inner = Math.cos(Math.atan(40 / len));
    const k = 1.1 + sky.night * 13;
    add(lx, ly, lz, len * 1.35, k, k * 0.97, k * 0.88, 2000, [dx, dy, dz, outer, inner]);
  }
  out.sort((a, b) => b.score - a.score);
  const n = Math.min(MAX_LIGHTS, out.length);
  for (let i = 0; i < n; i += 1) {
    const l = out[i];
    set.pos[i * 4] = l.x;
    set.pos[i * 4 + 1] = l.y;
    set.pos[i * 4 + 2] = l.z;
    set.pos[i * 4 + 3] = l.r;
    set.col[i * 4] = l.cr;
    set.col[i * 4 + 1] = l.cg;
    set.col[i * 4 + 2] = l.cb;
    if (l.spot) {
      const sl = Math.hypot(l.spot[0], l.spot[1], l.spot[2]) || 1;
      set.col[i * 4 + 3] = l.spot[3];
      set.dir[i * 4] = l.spot[0] / sl;
      set.dir[i * 4 + 1] = l.spot[1] / sl;
      set.dir[i * 4 + 2] = l.spot[2] / sl;
      set.dir[i * 4 + 3] = l.spot[4];
    } else {
      set.col[i * 4 + 3] = -2;
      set.dir[i * 4 + 3] = 1;
    }
  }
  set.n = n;
  return set;
}
