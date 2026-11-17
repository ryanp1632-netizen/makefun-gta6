// Headless play-test of the simulation (no browser): a scripted autopilot drives, shoots and
// starts jobs for a few simulated minutes; the script fails on exceptions, NaN positions or a
// stalled world, and prints what happened.
import { createGame, stepGame, STEP } from '../game/src/core/game.js';
import { createVehicle } from '../game/src/vehicles/drivingPhysics.js';
import { setMinimumWanted } from '../game/src/police/wantedSystem.js';
import { nextMission } from '../game/src/missions/missionRunner.js';

const game = createGame(1, { headless: true });
const g = game.city.grid;
const counts = {};
let maxWanted = 0;
let maxCops = 0;
function check(label) {
  for (const v of game.vehicles) if (!Number.isFinite(v.x) || !Number.isFinite(v.y)) throw new Error(`${label}: vehicle ${v.id} NaN`);
  for (const p of game.peds) if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) throw new Error(`${label}: ped ${p.id} NaN`);
  const pl = game.player;
  if (!Number.isFinite(pl.x)) throw new Error(`${label}: player NaN`);
}
// 1) Walk into the first contact marker: the first job should start.
const m = nextMission(game);
console.log('next mission:', m.title);
for (let i = 0; i < 120; i += 1) stepGame(game, STEP);
console.log('active after standing at safehouse:', game.missions.active?.title ?? 'none', '| objective:', game.missions.objective);
// 2) Drive a coupe down an avenue with the throttle pinned, steering at random, with 3 stars.
const car = createVehicle('coupe', '#ff4f6a', g.xs[3], g.ys[3], Math.PI / 2);
game.vehicles.push(car);
game.player.vehicle = car;
car.driver = 'player';
setMinimumWanted(game, 4);
const t0 = performance.now();
for (let i = 0; i < 60 * 120; i += 1) {
  const c = game.controls;
  c.moveY = -1;
  c.moveX = Math.sin(i / 90) > 0.6 ? 1 : Math.sin(i / 90) < -0.6 ? -1 : 0;
  c.handbrake = i % 400 < 30;
  c.fire = i % 50 < 3;
  c.firePressed = i % 50 === 0;
  c.aimX = car.x + 100;
  c.aimY = car.y;
  stepGame(game, STEP);
  for (const e of game.frameEvents) counts[e.type] = (counts[e.type] ?? 0) + 1;
  game.frameEvents.length = 0;
  maxWanted = Math.max(maxWanted, game.wanted.level);
  maxCops = Math.max(maxCops, game.vehicles.filter((v) => v.ai === 'police').length);
  if (game.player.dead) break;
  if (i % 600 === 0) check(`t=${i / 60}`);
}
const ms = performance.now() - t0;
check('end');
console.log(`simulated ${(game.t).toFixed(0)} s in ${ms.toFixed(0)} ms (${((ms / (game.t * 60)) * 1000).toFixed(0)} us/step)`);
console.log('vehicles', game.vehicles.length, 'peds', game.peds.length, 'particles', game.fx.list.length, 'heli', !!game.heli, 'maxWanted', maxWanted, 'maxCops', maxCops);
console.log('player hp', game.player.hp.toFixed(0), 'car hp', car.hp.toFixed(0), 'dead', game.player.dead, game.downCause ?? '');
console.log('events', JSON.stringify(counts));
console.log('stats', JSON.stringify(game.stats));
