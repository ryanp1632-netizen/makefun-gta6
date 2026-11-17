// Headless play-through of the whole story: an autopilot satisfies each stage the way a player
// would (walk into the contact, take a car, drive to targets, clear enemies, hold the vault,
// outrun the police by leaving the search zone, wreck the courier, win the race) and the script
// checks that all seven jobs complete, pay out and that the wanted level really fades.
import { createGame, stepGame, STEP } from '../game/src/core/game.js';
import { createVehicle } from '../game/src/vehicles/drivingPhysics.js';
import { enterVehicle } from '../game/src/player/playerController.js';
import { damagePerson } from '../game/src/combat/weapons.js';
import { nextMission, resolvePoint } from '../game/src/missions/missionRunner.js';
import { skipLine } from '../game/src/missions/dialogue.js';
import { respectLevel } from '../game/src/progression/economy.js';

const game = createGame(1, { headless: true });
const pl = game.player;
const log = [];
let escapes = 0;

function teleport(x, y) {
  if (pl.vehicle) {
    pl.vehicle.x = x;
    pl.vehicle.y = y;
    pl.vehicle.vx = 0;
    pl.vehicle.vy = 0;
  }
  pl.x = x;
  pl.y = y;
}

function step(n = 1) {
  for (let i = 0; i < n; i += 1) {
    stepGame(game, STEP);
    game.frameEvents.length = 0;
    pl.hp = 100;
  }
}

for (let chapter = 0; chapter < 7; chapter += 1) {
  const m = nextMission(game);
  const start = resolvePoint(game, m.start);
  if (pl.vehicle) pl.vehicle = null;
  // Contacts will not talk to a wanted man: shake the heat first.
  for (let i = 0; i < 60 * 90 && game.wanted.level > 0; i += 1) {
    if (i % 60 === 0) {
      const far = game.city.pois.respray3;
      teleport(far.x, far.y);
    }
    step(1);
  }
  if (game.wanted.level > 0) throw new Error('could not lose the heat between jobs');
  teleport(start.x, start.y);
  step(5);
  if (game.missions.active !== m) throw new Error(`${m.title} did not start at its contact`);
  const t0 = game.t;
  let guard = 0;
  while (game.missions.active && guard < 60 * 400) {
    guard += 1;
    const s = game.missions;
    const st = m.stages[s.stage];
    skipLine(game);
    if (st.type === 'enter' && !pl.vehicle) {
      const want = st.vehicle ? s.vehicles[st.vehicle] : null;
      const v = want ?? createVehicle('coupe', '#ff3d6e', pl.x + 30, pl.y, 0);
      if (!want) game.vehicles.push(v);
      teleport(v.x - 20, v.y);
      enterVehicle(game, v);
    } else if ((st.type === 'goto' || st.type === 'hold') && s.init) {
      const p = resolvePoint(game, st.at);
      teleport(p.x, p.y);
    } else if (st.type === 'kill' && s.init) {
      for (const p of s.groups[st.group]) if (!p.dead) damagePerson(game, p, 999, 'player');
    } else if (st.type === 'escape' && s.init && game.wanted.level > 0) {
      // Drive far away from the search zone, out of sight, and wait for the heat to fade.
      const far = game.city.pois.respray3;
      teleport(far.x, far.y);
      escapes += 1;
    } else if (st.type === 'chase' && s.init) {
      const v = s.vehicles[st.key];
      teleport(v.x - 120, v.y);
      v.hp = 0;
      v.fireT = Math.min(v.fireT || 0.5, 0.5);
    } else if (st.type === 'race' && s.race) {
      const race = s.race;
      if (!race.started) teleport(race.startX, race.startY);
      else {
        const p = race.points[race.next];
        teleport(p.x, p.y);
      }
    }
    step(1);
  }
  if (game.missions.active) throw new Error(`${m.title} stuck at stage ${game.missions.stage} (${m.stages[game.missions.stage].type}): ${game.missions.objective}`);
  if (!game.missions.results) throw new Error(`${m.title} failed: ${game.missions.failed?.reason}`);
  log.push(`${m.chapter}. ${m.title.padEnd(14)} complete in ${(game.t - t0).toFixed(1)} s sim, cash $${game.economy.cash}, wanted ${game.wanted.level}`);
  game.missions.results = null;
  step(200);
}
console.log(log.join('\n'));
console.log(`story complete: ${game.missions.completed.length}/7, respect level ${respectLevel(game.economy.xp).level}, escapes ${escapes}, next mission: ${nextMission(game)?.title ?? 'none'}`);
