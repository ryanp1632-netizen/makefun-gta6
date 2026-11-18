// The game state and its fixed-step update: player, vehicles, pedestrians, police, missions and
// effects advance in a set order every 1/60 s, then the step's events (shots, crashes, deaths)
// are turned into consequences: crimes, panic, damage, camera shake, rewards.
import { generateCity } from '../world/cityGenerator.js';
import { createRandom } from './random.js';
import { createMissionState, updateMissions } from '../missions/missionRunner.js';
import { updateActivities } from '../missions/sideActivities.js';
import { createDialogue, updateDialogue } from '../missions/dialogue.js';
import { createWanted, reportCrime, updateWanted } from '../police/wantedSystem.js';
import { drivePolice, updatePolice } from '../police/policeDispatch.js';
import { driveTraffic, populateTraffic } from '../ai/trafficAI.js';
import { alarmPeds, populatePeds, resetPedIds, updateCivilian } from '../ai/pedestrianAI.js';
import { updateCombatant } from '../ai/combatAI.js';
import { damagePerson } from '../combat/weapons.js';
import { createPlayer, updatePlayer } from '../player/playerController.js';
import { collideVehicles, createVehicle, damageVehicle, resetVehicleIds, stepVehicle, vehicleSpeed } from '../vehicles/drivingPhysics.js';
import { createEconomy, notify } from '../progression/economy.js';
import { districtIdAt } from '../world/districts.js';
import { advanceClock, createClock, lightingAt } from '../world/dayNight.js';
import { createCamera, snapCamera, updateCamera, addShake } from '../render/camera.js';
import { createParticles, updateParticles } from '../render/particles.js';
import { createGroundCache, paintSkid } from '../render/groundChunks.js';

export const STEP = 1 / 60;
export const CITY_SEED = 1;

export function emptyControls() {
  return { moveX: 0, moveY: 0, aimX: 0, aimY: 0, fire: false, firePressed: false, sprint: false, enter: false, interact: false, handbrake: false, reload: false, weaponNext: 0, weaponSlot: 0, radio: 0 };
}

/**
 * Lifetime statistics (saved with the game, shown on the pause screen's STATS tab): shooting,
 * driving (distance in world units on foot and behind the wheel), races, taxi fares and escapes.
 */
export function createStats() {
  return { shots: 0, hits: 0, kills: 0, crashes: 0, topSpeed: 0, distance: 0, driven: 0, racesRun: 0, racesWon: 0, fares: 0, copsEscaped: 0, maxWanted: 0, jobsFailed: 0 };
}

/** A fresh game in the city of `seed`, the player outside the safehouse at golden hour. */
export function createGame(seed = CITY_SEED, opts = {}) {
  resetVehicleIds();
  resetPedIds();
  const city = generateCity(seed);
  const home = city.pois.safehouse;
  const game = {
    seed, rng: createRandom(seed * 31 + 7), city, ground: opts.headless ? null : createGroundCache(city),
    t: 0, clock: createClock(opts.hours ?? 18.25), light: null, player: createPlayer(home.x, home.y),
    vehicles: [], peds: [], fx: createParticles(), events: [], frameEvents: [], wanted: createWanted(), heli: null,
    camera: createCamera(), controls: emptyControls(), economy: createEconomy(), dialogue: createDialogue(),
    missions: createMissionState(), activity: null, notices: [], district: null, districtT: 99, noCrimeT: 0,
    settings: opts.settings ?? { shake: 1 }, stats: createStats(), populateT: 0,
  };
  game.light = lightingAt(game.clock.hours);
  if (game.ground) game.paintSkid = (x0, y0, x1, y1, alpha, width) => paintSkid(game.ground, x0, y0, x1, y1, alpha, width);
  for (const p of city.parked) {
    const v = createVehicle(p.model, p.model === 'taxi' ? '#f5c22e' : p.color, p.x, p.y, p.angle);
    v.ai = 'parked';
    game.vehicles.push(v);
  }
  snapCamera(game.camera, home.x, home.y, 1.1);
  return game;
}

/** Where the action is: the player, or the car they drive. */
export function focusOf(game) {
  const pl = game.player;
  return pl.vehicle ? pl.vehicle : pl;
}

function vehicleHitsPeople(game, list) {
  const pl = game.player;
  for (const v of list) {
    const sp = vehicleSpeed(v);
    if (sp < 70 || v.wrecked) continue;
    const ca = Math.cos(v.angle);
    const sa = Math.sin(v.angle);
    const targets = game.peds.filter((p) => !p.dead && Math.abs(p.x - v.x) < 40 && Math.abs(p.y - v.y) < 40);
    if (!pl.vehicle && !pl.dead && Math.abs(pl.x - v.x) < 40 && Math.abs(pl.y - v.y) < 40) targets.push(pl);
    for (const p of targets) {
      const dx = p.x - v.x;
      const dy = p.y - v.y;
      const lx = dx * ca + dy * sa;
      const ly = -dx * sa + dy * ca;
      if (Math.abs(lx) > v.spec.length / 2 + 5 || Math.abs(ly) > v.spec.width / 2 + 5) continue;
      if ((p.hitT ?? 0) > game.t) continue;
      p.hitT = game.t + 0.6;
      const nx = Math.sign(ly || 1) * -sa;
      const ny = Math.sign(ly || 1) * ca;
      p.x += nx * 14 + (v.vx / sp) * 10;
      p.y += ny * 14 + (v.vy / sp) * 10;
      const byPlayer = v.driver === 'player';
      damagePerson(game, p, sp * (p === pl ? 0.12 : 0.3), byPlayer ? 'player' : 'traffic', v.vx / sp, v.vy / sp);
      v.vx *= 0.9;
      v.vy *= 0.9;
      game.events.push({ type: 'thud', x: p.x, y: p.y });
      if (byPlayer && p.team !== 'gang') reportCrime(game, p.team === 'police' ? 'copAssault' : 'runOver', p.x, p.y);
      if (!p.dead && p.team === 'civ') {
        p.state = 'flee';
        p.fleeT = 6;
        p.fleeX = v.x;
        p.fleeY = v.y;
      }
    }
  }
}

function handleEvent(game, e) {
  const pl = game.player;
  switch (e.type) {
    case 'gunshot':
      alarmPeds(game, e.x, e.y, e.team === 'player' ? 460 : 300);
      if (e.team === 'player' && !game.missions.lawless) reportCrime(game, 'gunfire', e.x, e.y);
      break;
    case 'death':
      alarmPeds(game, e.x, e.y, 300);
      if (e.byPlayer) {
        game.stats.kills += 1;
        if (e.ped.team === 'police') reportCrime(game, 'copKill', e.x, e.y);
        else if (e.ped.team === 'civ') reportCrime(game, 'murder', e.x, e.y);
      }
      break;
    case 'assault':
      if (e.ped.team === 'police') reportCrime(game, 'copAssault', e.x, e.y);
      else if (e.ped.team === 'civ') reportCrime(game, 'assault', e.x, e.y);
      break;
    case 'copCarShot':
      reportCrime(game, 'copCar', e.x, e.y);
      break;
    case 'explosion': {
      addShake(game.camera, 0.9, game.settings.shake);
      alarmPeds(game, e.x, e.y, 600);
      for (const p of game.peds) {
        const d = Math.hypot(p.x - e.x, p.y - e.y);
        if (d < 110) damagePerson(game, p, 140 * (1 - d / 130), e.byPlayer ? 'player' : 'fire', (p.x - e.x) / (d || 1), (p.y - e.y) / (d || 1));
      }
      if (!pl.vehicle) {
        const d = Math.hypot(pl.x - e.x, pl.y - e.y);
        if (d < 110) damagePerson(game, pl, 70 * (1 - d / 130), 'fire');
      }
      for (const v of game.vehicles) {
        const d = Math.hypot(v.x - e.x, v.y - e.y);
        if (d < 120 && d > 1 && !v.wrecked) {
          damageVehicle(game, v, 70 * (1 - d / 140), e.byPlayer);
          v.vx += ((v.x - e.x) / d) * 160;
          v.vy += ((v.y - e.y) / d) * 160;
        }
      }
      if (e.byPlayer) reportCrime(game, 'explosion', e.x, e.y);
      break;
    }
    case 'crash':
      if (e.vehicle === pl.vehicle || e.a === pl.vehicle || e.b === pl.vehicle) {
        addShake(game.camera, Math.min(0.7, e.power / 700), game.settings.shake);
        game.stats.crashes += 1;
        const other = e.a === pl.vehicle ? e.b : e.a;
        if (other && other.model === 'police' && (other.ai === 'police' || other.ai === 'roadblock' || other.ai === 'patrol')) reportCrime(game, 'copCar', e.x, e.y);
      }
      break;
    case 'evaded':
      game.stats.copsEscaped += 1;
      notify(game, "YOU SHOOK THEM  the heat is off", '#7dff9a', true);
      break;
    case 'wantedUp':
      game.stats.maxWanted = Math.max(game.stats.maxWanted, e.level);
      break;
    case 'missionFailed':
      game.stats.jobsFailed += 1;
      break;
    case 'playerDown':
      if (!pl.dead) {
        pl.dead = true;
        game.downCause = e.cause;
        game.downT = 0;
      }
      break;
    default:
      break;
  }
}

/** Advance the whole simulation by one fixed step. */
export function stepGame(game, dt) {
  game.t += dt;
  advanceClock(game.clock, dt);
  game.light = lightingAt(game.clock.hours);
  game.noCrimeT = Math.max(0, game.noCrimeT - dt);
  if (game.player.dead) game.downT = (game.downT ?? 0) + dt;
  updatePlayer(game, dt);
  const focus = focusOf(game);
  const near = [];
  for (const v of game.vehicles) {
    const far = Math.abs(v.x - focus.x) + Math.abs(v.y - focus.y) > 2600;
    if (far && v.driver !== 'player') continue;
    if (v.driver !== 'player') {
      if (v.ai === 'traffic') driveTraffic(game, v, dt);
      else if (v.ai === 'police') drivePolice(game, v, dt);
      else if (v.drive) v.drive(game, v, dt);
      else if (!v.driver || v.ai === 'parked' || v.ai === 'roadblock') {
        v.input.throttle = 0;
        v.input.steer = 0;
        v.input.handbrake = true;
      }
      v.lightsOn = (!!v.driver || v.ai === 'roadblock') && game.light.night > 0.25;
    }
    stepVehicle(game, v, dt);
    if (Math.abs(v.x - focus.x) + Math.abs(v.y - focus.y) < 1500) near.push(v);
  }
  collideVehicles(game, near);
  vehicleHitsPeople(game, near);
  for (const p of game.peds) {
    if (p.dead) {
      p.deadT += dt;
      continue;
    }
    if (p.hurtT > 0) p.hurtT = Math.max(0, p.hurtT - dt);
    if (p.hostile && p.weapon) updateCombatant(game, p, dt);
    else if (p.drive) p.drive(game, p, dt);
    else updateCivilian(game, p, dt);
  }
  updateWanted(game, dt);
  updatePolice(game, dt);
  updateMissions(game, dt);
  updateActivities(game, dt);
  updateDialogue(game, dt);
  game.populateT -= dt;
  if (game.populateT <= 0) {
    game.populateT = 0.25;
    const cam = game.camera;
    const radius = game.viewRadius ?? Math.hypot(cam.w, cam.h) / 2 / cam.zoom;
    populateTraffic(game, focus.x, focus.y, radius, game.trafficWant ?? 22);
    populatePeds(game, focus.x, focus.y, radius, game.pedWant ?? 38);
  }
  updateParticles(game.fx, dt);
  let guard = 0;
  while (game.events.length && guard < 400) {
    const e = game.events.shift();
    handleEvent(game, e);
    game.frameEvents.push(e);
    guard += 1;
  }
  if (game.frameEvents.length > 600) game.frameEvents.splice(0, game.frameEvents.length - 600);
  // District arrival banner.
  const id = districtIdAt(focus.x, focus.y);
  if (id !== game.district && id !== 'bay') {
    game.district = id;
    game.districtT = 0;
  } else game.districtT += dt;
  const sp = vehicleSpeed(focus.spec ? focus : { vx: game.player.vx, vy: game.player.vy });
  game.stats.topSpeed = Math.max(game.stats.topSpeed, focus.spec ? sp : 0);
  game.stats.distance += sp * dt;
  if (focus.spec && !game.demo) game.stats.driven += sp * dt;
  for (const n of game.notices) n.t += dt;
  while (game.notices.length && game.notices[0].t > 5) game.notices.shift();
  const c = game.controls;
  const pl = game.player;
  const aimX = pl.vehicle ? 0 : Math.max(-140, Math.min(140, (c.aimX - pl.x) * 0.22));
  const aimY = pl.vehicle ? 0 : Math.max(-100, Math.min(100, (c.aimY - pl.y) * 0.22));
  updateCamera(game.camera, { x: focus.x, y: focus.y, vx: focus.vx ?? 0, vy: focus.vy ?? 0, onFoot: !pl.vehicle, aimX, aimY, zoomBias: game.zoomBias ?? 1 }, dt, game.settings.shake);
}
