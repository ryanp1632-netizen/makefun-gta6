// HALCYON KEYS in 3D: draws the same simulation state the classic view draws, with the sim's
// ground plane (x, y) as the 3D plane (x, z). Per frame: pick the camera pose, rebuild the moving
// geometry (cars, people, the helicopter, pickups) and effects, choose the lights, render the sun's
// shadow map, then sky, ground, city chunks (frustum-culled), moving things, sea and effects into
// an HDR multisampled target, and finish with bloom and tone mapping. Static city geometry,
// ground textures and the sign atlas are built once per city seed and reused across games.
import { LIT_VS, LIT_FS, GROUND_VS, GROUND_FS, WATER_VS, WATER_FS, SKY_VS, SKY_FS, FX_VS, FX_FS, DEPTH_VS, DEPTH_FS, POST_VS, BRIGHT_FS, DOWN_FS, UP_FS, COMPOSITE_FS } from './shaders.js';
import { skyState, applySkyUniforms } from './skyAndSun.js';
import { createCam3d, updateCam3d, cam3dMatrices, worldToScreen3d, screenToPlane } from './chaseCamera.js';
import { buildCityMeshes } from './cityMeshes.js';
import { createLightSet, gatherLights } from './lighting.js';
import { buildEffects } from './effects3d.js';
import { appendVehicle, appendHeli, pruneVehicleMotion } from './vehicleMeshes.js';
import { appendPerson } from './characterMeshes.js';
import { WATER_Y, roofHeight } from './heights.js';
import { createGL, createProgram, createStaticMesh, createDynamicMesh, uploadDynamic, drawMesh, createTexture, createShadowTarget } from './glContext.js';
import { MeshBuilder, MAT, frame } from './meshBuilder.js';
import { createTextAtlas, atlasEntry } from './textAtlas.js';
import { createPost, resizePost, beginScene, finishScene } from './postFx.js';
import { frustumPlanes, boxInFrustum, lookAt, ortho, multiply, mat4 } from './math3d.js';
import { createGroundTextures, updateNearGround, GCHUNK } from './groundTextures.js';
import { createGroundCache } from '../render/groundChunks.js';
import { buildingsInRect } from '../world/collision.js';
import { missionMarkers } from '../missions/missionRunner.js';

const SHADOW_SIZE = 2048;
const SHADOW_HALF = 720;

/** A 3D renderer on `canvas`, or null when WebGL2 is unavailable (the classic view takes over). */
export function createRenderer3d(canvas, opts = {}) {
  const gl = createGL(canvas, !!opts.preserve);
  if (!gl) return null;
  const P = {
    lit: createProgram(gl, LIT_VS, LIT_FS),
    ground: createProgram(gl, GROUND_VS, GROUND_FS),
    water: createProgram(gl, WATER_VS, WATER_FS),
    sky: createProgram(gl, SKY_VS, SKY_FS),
    fx: createProgram(gl, FX_VS, FX_FS),
    depth: createProgram(gl, DEPTH_VS, DEPTH_FS),
    bright: createProgram(gl, POST_VS, BRIGHT_FS),
    down: createProgram(gl, POST_VS, DOWN_FS),
    up: createProgram(gl, POST_VS, UP_FS),
    composite: createProgram(gl, POST_VS, COMPOSITE_FS),
  };
  const r = {
    gl, canvas, P, post: createPost(gl, P), cam: createCam3d(), lights: createLightSet(), lost: false,
    dyn: createDynamicMesh(gl), fxMesh: createDynamicMesh(gl), dynMB: new MeshBuilder(65536, 131072), fxMB: new MeshBuilder(16384, 32768),
    shadow: createShadowTarget(gl, SHADOW_SIZE), shadowMat: mat4(), world: null, heliAlt: 240, scale: 1, frameMs: 16, last: 0,
    stats: { draws: 0, tris: 0, chunks: 0, lights: 0 }, labels: [], renderer: gl.getParameter(gl.RENDERER),
  };
  // A lost GPU context ends the 3D view; the game carries on in the classic camera.
  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    r.lost = true;
  });
  return r;
}

function buildWorld(r, game) {
  const t0 = performance.now();
  const gl = r.gl;
  const city = game.city;
  const atlas = createTextAtlas();
  atlasEntry(atlas, 'H');
  atlasEntry(atlas, 'HKPD');
  // The ground first: painting it finds where each road crosses water, which the bridges need.
  const gt = createGroundTextures(gl, game.ground ?? createGroundCache(city), city);
  const city3d = buildCityMeshes(gl, city, atlas);
  const atlasTex = createTexture(gl, atlas.canvas);
  atlas.dirty = false;
  // One quad per ground chunk; chunk i owns indices [i*6, i*6+6).
  const mb = new MeshBuilder(1024, 2048);
  const tiles = [];
  for (let cy = 0; cy < gt.rows; cy += 1) {
    for (let cx = 0; cx < gt.cols; cx += 1) {
      const x0 = cx * GCHUNK;
      const z0 = cy * GCHUNK;
      const x1 = Math.min(city.width, x0 + GCHUNK);
      const z1 = Math.min(city.height, z0 + GCHUNK);
      tiles.push({ cx, cy, x0, z0, x1, z1, key: cy * gt.cols + cx, first: mb.icount });
      mb.quad(x0, 0, z0, x1, 0, z0, x1, 0, z1, x0, 0, z1);
    }
  }
  const groundMesh = createStaticMesh(gl, mb);
  const wb = new MeshBuilder(8, 12);
  const E = 60000;
  wb.quad(-E, WATER_Y, -E, E, WATER_Y, -E, E, WATER_Y, E, -E, WATER_Y, E);
  const waterMesh = createStaticMesh(gl, wb);
  r.world = { seed: city.seed, city3d, atlas, atlasTex, gt, groundMesh, tiles, waterMesh, buildMs: performance.now() - t0 };
  return r.world;
}

function setCommon(r, prog, sky, viewProj, time, withLights = true) {
  const gl = r.gl;
  const u = prog.u;
  gl.useProgram(prog.prog);
  gl.uniformMatrix4fv(u.u_viewProj, false, viewProj);
  applySkyUniforms(gl, u, sky, r.cam.pos, time);
  if (withLights && u.u_lPos) {
    gl.uniform4fv(u.u_lPos, r.lights.pos);
    gl.uniform4fv(u.u_lCol, r.lights.col);
    gl.uniform4fv(u.u_lDir, r.lights.dir);
    gl.uniform1i(u.u_nL, r.lights.n);
  }
  if (u.u_shadow) {
    gl.activeTexture(gl.TEXTURE5);
    gl.bindTexture(gl.TEXTURE_2D, r.shadow.tex);
    gl.uniform1i(u.u_shadow, 5);
    gl.uniformMatrix4fv(u.u_shadowMat, false, r.shadowMat);
    gl.uniform1f(u.u_shadowOn, sky.shadows ? 1 : 0);
    gl.uniform1f(u.u_shadowTexel, 1 / SHADOW_SIZE);
  }
}

function collectMarkers(game) {
  const out = missionMarkers(game).slice();
  const a = game.activity;
  if (a && a.kind === 'taxi') out.push({ x: a.x, y: a.y, r: 50, color: '#ffd166', kind: 'target' });
  return out;
}

/** Whether a sphere at (x, y, z) of radius rad touches the view frustum. */
function sphereVisible(planes, x, y, z, rad) {
  for (const p of planes) if (p[0] * x + p[1] * y + p[2] * z + p[3] < -rad) return false;
  return true;
}

/**
 * Rebuild this frame's moving geometry (cars, people, the helicopter, Sunset Tapes), effects and
 * light selection. Things outside the frustum are skipped; far cars drop their wheels and far
 * people become simple figures. `state` carries dynMB, fxMB, lights and heliAlt between frames.
 */
export function buildFrameGeometry(state, game, cam, planes, o) {
  const { night, dt, t, atlas, city3d, sky } = o;
  const dmb = state.dynMB.reset();
  const near = (x, z) => Math.hypot(x - cam.x, z - cam.z);
  for (const v of game.vehicles) {
    const d = near(v.x, v.y);
    if (d > 2600 || !sphereVisible(planes, v.x, 8, v.y, 34)) continue;
    appendVehicle(dmb, v, t, night, atlas, dt, d > 650 ? 1 : 0);
  }
  pruneVehicleMotion(game.vehicles);
  for (const p of game.peds) {
    if (p.removed) continue;
    const d = near(p.x, p.y);
    if (d > 1400 || !sphereVisible(planes, p.x, 10, p.y, 16)) continue;
    appendPerson(dmb, p, t, d > 420 ? 1 : 0);
  }
  const pl = game.player;
  if (!pl.vehicle && !(pl.dead && game.downCause === 'arrest')) appendPerson(dmb, { ...pl, team: 'player', hostile: false }, t, 0);
  let heliPose = null;
  if (game.heli) {
    const h = game.heli;
    const list = buildingsInRect(game.city, h.x - 140, h.y - 140, h.x + 140, h.y + 140, []);
    let want = o.heliAlt ?? 235;
    for (const b of list) want = Math.max(want, roofHeight(b) + 70);
    state.heliAlt = o.snap ? want : state.heliAlt + (want - state.heliAlt) * Math.min(1, dt * 1.5);
    heliPose = appendHeli(dmb, h, state.heliAlt + Math.sin(t * 1.3) * 3, t, atlas);
  }
  const tapes = game.city.collectibles.filter((c) => !game.economy.tapes.includes(c.id) && near(c.x, c.y) < 1200 && sphereVisible(planes, c.x, 8, c.y, 12));
  for (const tape of tapes) {
    dmb.xform(frame(tape.x, 8 + Math.sin(t * 3 + tape.id) * 1.5, tape.y, t * 1.6 + tape.id));
    dmb.color(0.12, 0.12, 0.14).mat(MAT.PLAIN);
    dmb.box(-5, -3.2, -1, 5, 3.2, 1, '');
    dmb.color(1, 0.5, 0.72).color2(1, 0.5, 0.72).mat(MAT.EMIT, 120, 0);
    dmb.box(-4, 0.4, -1.1, 4, 2.6, 1.1, '');
    dmb.xform(null);
  }
  const markers = collectMarkers(game);
  const fmb = state.fxMB.reset();
  buildEffects(fmb, { game, cam, night, markers, heliPose, lamps: city3d.lamps, tapes });
  gatherLights(state.lights, { game, sky, city3d, markers, heliPose }, { x: cam.tx, z: cam.tz });
  return { dmb, fmb, heliPose, markers, tapes };
}

/** Choose the camera mode for the game state (unless the caller forces one). */
function viewFor(game, view) {
  if (view.mode) return view;
  const pl = game.player;
  return { ...view, mode: pl.vehicle && !pl.dead ? 'chase' : 'foot' };
}

/**
 * Render `game` to the 3D canvas at w x h (CSS pixels of the overlay canvas). view = { mode?,
 * dt, aim, orbit, snap, groundBudget, ...camera overrides }.
 */
export function render3d(r, game, w, h, viewIn = {}) {
  const gl = r.gl;
  const now = performance.now();
  if (r.last) r.frameMs = r.frameMs * 0.92 + Math.min(100, now - r.last) * 0.08;
  r.last = now;
  if (!viewIn.fixedScale) {
    if (r.frameMs > 24 && r.scale > 0.6) r.scale = Math.max(0.6, r.scale - 0.05);
    else if (r.frameMs < 15 && r.scale < 1) r.scale = Math.min(1, r.scale + 0.02);
  }
  const scale = viewIn.fixedScale ?? r.scale;
  const W = Math.max(320, Math.round(w * scale));
  const H = Math.max(200, Math.round(h * scale));
  if (r.canvas.width !== w || r.canvas.height !== h) {
    r.canvas.width = w;
    r.canvas.height = h;
  }
  const world = r.world && r.world.seed === game.city.seed ? r.world : buildWorld(r, game);
  const view = viewFor(game, viewIn);
  const dt = view.dt ?? 1 / 60;
  const t = game.t;
  const sky = skyState(game.clock.hours, game.light);
  if (view.sky) {
    // Per-shot grading: multiply exposure / fog / bloom, or replace other fields.
    for (const [k, v] of Object.entries(view.sky)) {
      if (k === 'exposureK') sky.exposure *= v;
      else if (k === 'fogK') sky.fogDen *= v;
      else if (k === 'bloomK') sky.bloom *= v;
      else sky[k] = v;
    }
  }
  const night = sky.night;
  updateCam3d(r.cam, game, view, dt);
  cam3dMatrices(r.cam, w, h);
  const cam = r.cam;
  const city3d = world.city3d;
  // Sharp ground textures under and ahead of the camera.
  const fx = cam.fwd[0];
  const fz = cam.fwd[2];
  const fl = Math.hypot(fx, fz) || 1;
  const gx = cam.x + (fx / fl) * 380;
  const gz = cam.z + (fz / fl) * 380;
  updateNearGround(world.gt, gx, gz, 820, view.groundBudget ?? 1);
  if (world.atlas.dirty) {
    gl.deleteTexture(world.atlasTex);
    world.atlasTex = createTexture(gl, world.atlas.canvas);
    world.atlas.dirty = false;
  }
  // Moving geometry, effects and lights (jsMs times this pure JavaScript work).
  const tj = performance.now();
  const frameGeo = buildFrameGeometry(r, game, cam, frustumPlanes(cam.viewProj), { night, dt, t, atlas: world.atlas, city3d, sky, heliAlt: view.heliAlt, snap: view.snap });
  const { dmb, fmb, heliPose, markers } = frameGeo;
  const jsMs = performance.now() - tj;
  uploadDynamic(gl, r.dyn, dmb);
  uploadDynamic(gl, r.fxMesh, fmb);
  const cpuMs = performance.now() - now;
  // Labels the 2D overlay draws over the 3D view (contact letters).
  r.labels = [];
  for (const m of markers) {
    if (m.kind !== 'contact') continue;
    const s = worldToScreen3d(cam, m.x, 104 + Math.sin(t * 3) * 4, m.y);
    if (!s.behind) r.labels.push({ x: s.x, y: s.y, letter: m.letter, color: m.color, depth: s.depth });
  }
  let draws = 0;
  let tris = 0;
  // Shadow map from the sun around the area in view.
  const ld = sky.lightDir;
  const scx = cam.tx + (fx / fl) * 260;
  const scz = cam.tz + (fz / fl) * 260;
  const texel = (SHADOW_HALF * 2) / SHADOW_SIZE;
  const ccx = Math.round(scx / texel) * texel;
  const ccz = Math.round(scz / texel) * texel;
  const lv = mat4();
  const lp = mat4();
  lookAt(lv, ccx + ld[0] * 3000, ld[1] * 3000, ccz + ld[2] * 3000, ccx, 0, ccz, 0, 1, 0);
  ortho(lp, -SHADOW_HALF, SHADOW_HALF, -SHADOW_HALF, SHADOW_HALF, 100, 6500);
  multiply(r.shadowMat, lp, lv);
  gl.enable(gl.DEPTH_TEST);
  gl.depthFunc(gl.LEQUAL);
  gl.disable(gl.CULL_FACE);
  if (sky.shadows) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, r.shadow.fbo);
    gl.viewport(0, 0, SHADOW_SIZE, SHADOW_SIZE);
    gl.depthMask(true);
    gl.clear(gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.POLYGON_OFFSET_FILL);
    gl.polygonOffset(2.5, 6);
    gl.useProgram(r.P.depth.prog);
    gl.uniformMatrix4fv(r.P.depth.u.u_viewProj, false, r.shadowMat);
    const sp = frustumPlanes(r.shadowMat);
    for (const c of city3d.chunks) {
      if (!boxInFrustum(sp, c.x0, c.y0, c.z0, c.x1, c.y1, c.z1)) continue;
      drawMesh(gl, c.mesh);
      draws += 1;
    }
    drawMesh(gl, r.dyn);
    gl.disable(gl.POLYGON_OFFSET_FILL);
  }
  // Main pass.
  resizePost(r.post, W, H);
  const msaa = beginScene(r.post);
  gl.depthMask(true);
  gl.clearColor(0, 0, 0, 1);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  // Sky.
  gl.disable(gl.DEPTH_TEST);
  gl.depthMask(false);
  setCommon(r, r.P.sky, sky, cam.viewProj, t, false);
  const su = r.P.sky.u;
  gl.uniformMatrix4fv(su.u_invViewProj, false, cam.inv);
  gl.uniform3fv(su.u_sunDisc, sky.sunDisc);
  gl.uniform1f(su.u_sunSize, sky.sunSize);
  gl.uniform1f(su.u_cloudK, sky.cloudK);
  gl.bindVertexArray(null);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  draws += 1;
  gl.enable(gl.DEPTH_TEST);
  gl.depthMask(true);
  const planes = frustumPlanes(cam.viewProj);
  // Ground: sharp chunks near the camera, the whole-map texture elsewhere.
  setCommon(r, r.P.ground, sky, cam.viewProj, t);
  const gu = r.P.ground.u;
  gl.uniform1f(gu.u_wet, night * 0.9);
  if (msaa) gl.enable(gl.SAMPLE_ALPHA_TO_COVERAGE);
  gl.activeTexture(gl.TEXTURE0);
  gl.uniform1i(gu.u_tex, 0);
  gl.bindVertexArray(world.groundMesh.vao);
  let boundGlobal = false;
  for (const tile of world.tiles) {
    if (!boxInFrustum(planes, tile.x0, -1, tile.z0, tile.x1, 1, tile.z1)) continue;
    const near = world.gt.near.get(tile.key);
    if (near) {
      gl.bindTexture(gl.TEXTURE_2D, near.tex);
      gl.uniform4f(gu.u_rect, tile.cx * GCHUNK, tile.cy * GCHUNK, 1 / GCHUNK, 1 / GCHUNK);
      boundGlobal = false;
    } else if (!boundGlobal) {
      gl.bindTexture(gl.TEXTURE_2D, world.gt.globalTex);
      gl.uniform4f(gu.u_rect, 0, 0, 1 / game.city.width, 1 / game.city.height);
      boundGlobal = true;
    }
    gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_INT, tile.first * 4);
    draws += 1;
  }
  if (msaa) gl.disable(gl.SAMPLE_ALPHA_TO_COVERAGE);
  // City chunks and moving things.
  setCommon(r, r.P.lit, sky, cam.viewProj, t);
  const lu = r.P.lit.u;
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, world.atlasTex);
  gl.uniform1i(lu.u_atlas, 0);
  let chunks = 0;
  for (const c of city3d.chunks) {
    if (!boxInFrustum(planes, c.x0, c.y0, c.z0, c.x1, c.y1, c.z1)) continue;
    drawMesh(gl, c.mesh);
    draws += 1;
    chunks += 1;
    tris += c.mesh.count / 3;
  }
  drawMesh(gl, r.dyn);
  draws += 1;
  tris += r.dyn.count / 3;
  // Sea (after the land so hidden water is rejected early).
  setCommon(r, r.P.water, sky, cam.viewProj, t);
  const wu = r.P.water.u;
  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, world.gt.sdfTex);
  gl.uniform1i(wu.u_sdf, 1);
  gl.uniform4f(wu.u_sdfRect, 0, 0, 1 / game.city.width, 1 / game.city.height);
  drawMesh(gl, world.waterMesh);
  draws += 1;
  // Effects.
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  gl.depthMask(false);
  setCommon(r, r.P.fx, sky, cam.viewProj, t, false);
  drawMesh(gl, r.fxMesh);
  draws += 1;
  tris += r.fxMesh.count / 3;
  gl.disable(gl.BLEND);
  gl.depthMask(true);
  finishScene(r.post, sky, w, h);
  r.stats = {
    draws: draws + 12, tris: Math.round(tris), chunks, lights: r.lights.n, scale, w: W, h: H, msaa, hdr: r.post.hdr,
    cpuMs, jsMs, buildMs: world.buildMs, paintMs: world.gt.paintMs ?? 0, dynVerts: dmb.vcount, fxVerts: fmb.vcount, staticTris: city3d.stats.tris,
  };
  return r.stats;
}

/** Aim point under the mouse (simulation coordinates) for the current 3D camera. */
export function aimAt3d(r, game, sx, sy) {
  const pl = game.player;
  // Aim assist: snap to a hostile whose torso is within reach of the cursor.
  let best = null;
  let bestD = 34;
  for (const p of game.peds) {
    if (p.dead || !p.hostile) continue;
    const s = worldToScreen3d(r.cam, p.x, 12, p.y);
    if (s.behind) continue;
    const d = Math.hypot(s.x - sx, s.y - sy);
    if (d < bestD) {
      bestD = d;
      best = p;
    }
  }
  if (best) return { x: best.x, y: best.y, locked: true };
  const p = screenToPlane(r.cam, sx, sy, pl.vehicle ? 6 : 11);
  return { x: p.x, y: p.y, locked: false };
}

/** Floating contact letters over mission givers, drawn by the 2D overlay so they stay crisp. */
export function drawWorldLabels(ctx, r) {
  if (!r) return;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  for (const l of r.labels) {
    const s = Math.max(0.55, Math.min(1.3, 260 / Math.max(60, l.depth)));
    ctx.fillStyle = l.color;
    ctx.beginPath();
    ctx.arc(l.x, l.y, 15 * s, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#1a1030';
    ctx.lineWidth = 3 * s;
    ctx.stroke();
    ctx.fillStyle = '#1a1030';
    ctx.font = `900 ${Math.round(17 * s)}px "Arial Black", Arial, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(l.letter, l.x, l.y + 1);
  }
  ctx.restore();
}

/** Where a simulation point at height h lands on screen. */
export function project3d(r, x, y, h = 0) {
  return worldToScreen3d(r.cam, x, h, y);
}

/** The camera's forward heading (simulation angle), for camera-relative walking. */
export function cameraYaw(r) {
  return Math.atan2(r.cam.fwd[2], r.cam.fwd[0]);
}
