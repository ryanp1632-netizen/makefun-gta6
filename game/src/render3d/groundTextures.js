// The ground of the 3D view: the same painted streets the classic view uses (asphalt, lane
// markings, crosswalks, sidewalks, lots, sand, piers) as GPU textures. One low-resolution texture
// covers the whole map for the distance; 512-unit chunks near the camera are repainted at 1.5
// pixels per unit and swapped in as the player moves. A sharp chunk is made in small steps on
// successive frames (terrain samples, three painted bands, upload) so driving never hitches. Open water is
// left transparent so the animated sea shows through, and a signed-distance texture of the coast
// drives the water shader.
import { buildTerrain, paintGroundArea } from '../render/groundChunks.js';
import { createTexture } from './glContext.js';

export const GCHUNK = 512;
const NEAR_SCALE = 1.5;
const BANDS = 3;
const GLOBAL_SCALE = 0.32;
const MAX_NEAR = 14;

export function createGroundTextures(gl, groundCache, city) {
  const W = city.width;
  const H = city.height;
  const global = document.createElement('canvas');
  global.width = Math.round(W * GLOBAL_SCALE);
  global.height = Math.round(H * GLOBAL_SCALE);
  paintGroundArea(global.getContext('2d'), groundCache, 0, 0, W, H, GLOBAL_SCALE, { alphaWater: true, skids: false, res: 10 });
  const globalTex = createTexture(gl, global);
  // Coast distance field for the water: 8 units per texel, value = clamp(sdf + 64, 0, 255).
  const S = 8;
  const sw = Math.ceil(W / S);
  const sh = Math.ceil(H / S);
  const data = new Uint8Array(sw * sh);
  for (let j = 0; j < sh; j += 1) {
    for (let i = 0; i < sw; i += 1) {
      const d = city.terrain.sdf((i + 0.5) * S, (j + 0.5) * S);
      data[j * sw + i] = Math.max(0, Math.min(255, Math.round(d + 64)));
    }
  }
  const sdfTex = createTexture(gl, { width: sw, height: sh, data }, { mips: false, format: 'r8' });
  return {
    gl, cache: groundCache, city, globalTex, sdfTex, near: new Map(), tick: 0, pending: null, paintMs: 0, stageMax: { terrain: 0, band: 0, upload: 0 },
    cols: Math.ceil(W / GCHUNK), rows: Math.ceil(H / GCHUNK),
  };
}

/** Advance the chunk being made by one step (or all steps); returns true when it finished. */
function stepPending(gt, all) {
  const p = gt.pending;
  const wx = p.cx * GCHUNK;
  const wy = p.cy * GCHUNK;
  do {
    const t0 = performance.now();
    if (p.stage === 0) p.terrain = buildTerrain(gt.city, wx, wy, GCHUNK, GCHUNK, 8, true);
    else if (p.stage <= BANDS) {
      if (!p.canvas) {
        p.canvas = document.createElement('canvas');
        p.canvas.width = GCHUNK * NEAR_SCALE;
        p.canvas.height = GCHUNK * NEAR_SCALE;
      }
      // Paint one horizontal band of the chunk per frame.
      const b0 = wy + ((p.stage - 1) * GCHUNK) / BANDS;
      const b1 = wy + (p.stage * GCHUNK) / BANDS;
      paintGroundArea(p.canvas.getContext('2d'), gt.cache, wx, wy, GCHUNK, GCHUNK, NEAR_SCALE, { alphaWater: true, skids: false, terrain: p.terrain, band: [b0, b1] });
    } else {
      gt.near.set(p.key, { tex: createTexture(gt.gl, p.canvas), used: gt.tick });
      gt.pending = null;
    }
    const ms = performance.now() - t0;
    gt.paintMs = Math.max(gt.paintMs * 0.95, ms);
    const kind = p.stage === 0 ? 'terrain' : p.stage <= BANDS ? 'band' : 'upload';
    gt.stageMax[kind] = Math.max(gt.stageMax[kind], ms);
    p.stage += 1;
  } while (all && gt.pending);
  return !gt.pending;
}

/**
 * Make sure the chunks around (x, z) within `radius` have sharp textures, working on at most
 * `budget` steps this frame (everything at once when budget is Infinity).
 */
export function updateNearGround(gt, x, z, radius, budget = 1) {
  gt.tick += 1;
  const want = [];
  const c0 = Math.max(0, Math.floor((x - radius) / GCHUNK));
  const c1 = Math.min(gt.cols - 1, Math.floor((x + radius) / GCHUNK));
  const r0 = Math.max(0, Math.floor((z - radius) / GCHUNK));
  const r1 = Math.min(gt.rows - 1, Math.floor((z + radius) / GCHUNK));
  for (let cy = r0; cy <= r1; cy += 1) {
    for (let cx = c0; cx <= c1; cx += 1) {
      const mx = Math.max(cx * GCHUNK, Math.min(x, (cx + 1) * GCHUNK));
      const mz = Math.max(cy * GCHUNK, Math.min(z, (cy + 1) * GCHUNK));
      const d = Math.hypot(mx - x, mz - z);
      if (d <= radius) want.push({ cx, cy, d });
    }
  }
  want.sort((a, b) => a.d - b.d);
  const all = budget === Infinity;
  for (const w of want.slice(0, MAX_NEAR)) {
    const key = w.cy * gt.cols + w.cx;
    const e = gt.near.get(key);
    if (e) {
      e.used = gt.tick;
      continue;
    }
    if (budget <= 0) break;
    if (!gt.pending) gt.pending = { key, cx: w.cx, cy: w.cy, stage: 0 };
    if (gt.pending.key !== key && !all) {
      // Keep working on the chunk already started.
      stepPending(gt, false);
      budget -= 1;
      break;
    }
    stepPending(gt, all);
    budget -= 1;
    if (!all) break;
  }
  if (gt.near.size > MAX_NEAR) {
    const list = [...gt.near.entries()].sort((a, b) => a[1].used - b[1].used);
    for (let i = 0; i < list.length - MAX_NEAR; i += 1) {
      gt.gl.deleteTexture(list[i][1].tex);
      gt.near.delete(list[i][0]);
    }
  }
}
