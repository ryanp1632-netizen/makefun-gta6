// Headless play-through of the whole story: an autopilot satisfies each stage the way a player
// would (walk into the contact, take a car, drive to targets, clear enemies, hold the vault,
// outrun the police by leaving the search zone, wreck the courier, win the race) and the script
// checks that all seven jobs complete, pay out and that the wanted level really fades. Then a
// side race is won (two laps, prize, stats) and another lost to the rivals, and the new progress
// (races, fares, escapes, distance, completion) is checked across a save and load.
import { createGame, stepGame, STEP } from '../game/src/core/game.js';
import { createVehicle } from '../game/src/vehicles/drivingPhysics.js';
import { enterVehicle } from '../game/src/player/playerController.js';
import { damagePerson } from '../game/src/combat/weapons.js';
import { nextMission, resolvePoint } from '../game/src/missions/missionRunner.js';
import { raceStart, startSideRace } from '../game/src/missions/sideActivities.js';
import { skipLine } from '../game/src/missions/dialogue.js';
import { respectLevel } from '../game/src/progression/economy.js';
import { completionPercent } from '../game/src/progression/completion.js';
import { applySave, snapshot } from '../game/src/save/saveGame.js';
import { clearWanted } from '../game/src/police/wantedSystem.js';

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

// Side race: Neon Mile Nights over two laps. Lined up at the start gate, the countdown runs and
// the race goes; driving gate to gate wins it, pays the prize and is counted in the stats.
function lineUp(id) {
  const p = raceStart(game, id);
  if (pl.vehicle) {
    pl.vehicle.driver = null;
    pl.vehicle = null;
  }
  const car = createVehicle('coupe', '#ff3d6e', p.x, p.y + 10, 0);
  game.vehicles.push(car);
  teleport(p.x - 20, p.y + 10);
  enterVehicle(game, car);
  if (pl.vehicle !== car) throw new Error('could not get into the race car');
  return startSideRace(game, id);
}
clearWanted(game);
game.heli = null;
game.vehicles = game.vehicles.filter((v) => v.model !== 'police');
const cash0 = game.economy.cash;
const won0 = game.stats.racesWon;
let race = lineUp('neon');
step(60 * 3 + 5);
if (!race.started) throw new Error('the side race did not start after its countdown');
const checkpoints = race.points.length - 1;
let places = new Set();
for (let i = 0; i < 60 * 60 && game.missions.race; i += 1) {
  if (i % 20 === 0) {
    const p = race.points[race.next];
    teleport(p.x, p.y);
  }
  step(1);
  if (game.missions.race) places.add(race.place);
}
if (game.missions.race) throw new Error('the side race never finished');
if (game.stats.racesWon !== won0 + 1 || !game.economy.races.includes('neon')) throw new Error('the side race win was not counted');
if (game.economy.cash <= cash0) throw new Error('the side race paid nothing');
console.log(`side race: Neon Mile Nights won over ${race.laps} laps / ${checkpoints} checkpoints in ${race.time.toFixed(1)} s sim, standings ${race.standings.map((r) => r.name).join(' > ')}, places seen ${[...places].join(',')}, prize $${game.economy.cash - cash0}`);
// Sitting still at the start, the rivals drive both laps and take it.
race = lineUp('strand');
for (let i = 0; i < 60 * 240 && game.missions.race; i += 1) step(1);
if (game.missions.race) throw new Error('the rivals never finished the Strand Sprint');
if (game.stats.racesWon !== won0 + 1) throw new Error('a lost race was counted as won');
if (!race.winner) throw new Error('the lost race named no winner');
console.log(`side race: Strand Sprint lost to ${race.winner} after ${race.time.toFixed(1)} s sim (races run ${game.stats.racesRun}, won ${game.stats.racesWon})`);
// The new progress survives a save: races won, fares, escapes, distance driven, completion.
const saved = JSON.parse(JSON.stringify(snapshot(game)));
const restored = createGame(1, { headless: true });
applySave(restored, saved);
for (const k of ['racesWon', 'racesRun', 'fares', 'copsEscaped', 'driven']) {
  if (restored.stats[k] !== game.stats[k]) throw new Error(`stats.${k} did not survive the save`);
}
if (restored.economy.races.join() !== game.economy.races.join()) throw new Error('won race routes did not survive the save');
if (completionPercent(restored) !== completionPercent(game)) throw new Error('completion changed across the save');
console.log(`save: races ${restored.economy.races.join(',')}, cops escaped ${restored.stats.copsEscaped}, driven ${(restored.stats.driven / 9000).toFixed(1)} km, completion ${completionPercent(restored)}%`);
