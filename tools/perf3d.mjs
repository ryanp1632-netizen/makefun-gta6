// Headless benchmark of the 3D renderer's per-frame JavaScript (no browser, no GPU): a scripted
// police chase is simulated and, every frame, the moving geometry (cars, people, the helicopter),
// the effects and the light selection are rebuilt exactly as renderer3d does before drawing.
// Prints the average and worst milliseconds, the vertex counts, and fails if a frame produces
// broken geometry (NaN positions or out-of-range indices) or the average exceeds the budget.
import { createGame, stepGame, STEP } from '../game/src/core/game.js';
import { createVehicle } from '../game/src/vehicles/drivingPhysics.js';
import { setMinimumWanted } from '../game/src/police/wantedSystem.js';
import { MeshBuilder } from '../game/src/render3d/meshBuilder.js';
import { buildFrameGeometry } from '../game/src/render3d/renderer3d.js';
import { createCam3d, updateCam3d, cam3dMatrices } from '../game/src/render3d/chaseCamera.js';
import { frustumPlanes } from '../game/src/render3d/math3d.js';
import { createLightSet } from '../game/src/render3d/lighting.js';
import { skyState } from '../game/src/render3d/skyAndSun.js';

const BUDGET_MS = 6;
const game = createGame(1, { headless: true, hours: 21.5 });
const g = game.city.grid;
const car = createVehicle('coupe', '#ff2f6d', g.xs[3], g.ys[3], Math.PI / 2);
car.driver = 'player';
game.vehicles.push(car);
game.player.vehicle = car;
setMinimumWanted(game, 4);
// The sign atlas lives on a canvas in the browser; here its two built-in entries are enough.
const atlas = { entries: new Map([['HKPD', { u0: 0, u1: 0.25, v0: 0, v1: 0.03, aspect: 6 }], ['H', { u0: 0.25, u1: 0.3, v0: 0, v1: 0.03, aspect: 1 }]]) };
const city3d = {
  lamps: game.city.lamps.map((l) => ({ x: l.x + l.ax * 17, y: 59, z: l.y + l.ay * 17 })),
  signs: game.city.buildings.filter((b) => b.sign).map((b) => ({ x: (b.x0 + b.x1) / 2, y: 60, z: (b.y0 + b.y1) / 2, color: [255, 80, 200], r: 180, k: 1 })),
};
const state = { dynMB: new MeshBuilder(65536, 131072), fxMB: new MeshBuilder(16384, 32768), lights: createLightSet(), heliAlt: 240 };
const cam = createCam3d();
const lights = state.lights;
const times = [];
let maxVerts = 0;
let maxFx = 0;
function validate(mb, label) {
  for (let i = 0; i < mb.vcount * 9; i += 9) {
    if (!Number.isFinite(mb.f32[i]) || !Number.isFinite(mb.f32[i + 1]) || !Number.isFinite(mb.f32[i + 2])) throw new Error(`${label}: NaN vertex`);
  }
  for (let i = 0; i < mb.icount; i += 1) if (mb.indices[i] >= mb.vcount) throw new Error(`${label}: index out of range`);
}
for (let f = 0; f < 60 * 40; f += 1) {
  const c = game.controls;
  c.moveY = -1;
  c.moveX = Math.sin(f / 90) > 0.6 ? 1 : Math.sin(f / 90) < -0.6 ? -1 : 0;
  c.handbrake = f % 400 < 30;
  c.fire = f % 50 < 3;
  c.aimX = car.x + 100;
  c.aimY = car.y;
  stepGame(game, STEP);
  game.frameEvents.length = 0;
  if (game.player.dead) break;
  if (game.player.vehicle) updateCam3d(cam, game, { mode: 'chase' }, STEP);
  cam3dMatrices(cam, 1280, 800);
  const t0 = performance.now();
  const sky = skyState(game.clock.hours, game.light);
  const { dmb: dyn, fmb: fx } = buildFrameGeometry(state, game, cam, frustumPlanes(cam.viewProj), { night: sky.night, dt: STEP, t: game.t, atlas, city3d, sky });
  if (f > 60) times.push(performance.now() - t0);
  maxVerts = Math.max(maxVerts, dyn.vcount);
  maxFx = Math.max(maxFx, fx.vcount);
  if (f % 240 === 0) {
    validate(dyn, `frame ${f} dynamic`);
    validate(fx, `frame ${f} effects`);
  }
}
times.sort((a, b) => a - b);
const avg = times.reduce((a, b) => a + b, 0) / times.length;
const p99 = times[Math.floor(times.length * 0.99)];
console.log(`frames ${times.length}  3D js per frame: avg ${avg.toFixed(2)} ms  p99 ${p99.toFixed(2)} ms  max ${times[times.length - 1].toFixed(2)} ms`);
console.log(`dynamic verts max ${maxVerts}  effect verts max ${maxFx}  lights ${lights.n}  vehicles ${game.vehicles.length}  peds ${game.peds.length}  heli ${!!game.heli}`);
if (avg > BUDGET_MS) {
  console.error(`too slow: ${avg.toFixed(2)} ms > ${BUDGET_MS} ms budget`);
  process.exit(1);
}
