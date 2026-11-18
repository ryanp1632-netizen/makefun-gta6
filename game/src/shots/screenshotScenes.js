// The screenshot scenes behind ?shot=<scene>&seed=<n>. Each builds a fresh world from the seed,
// sets up a moment of the story, and plays the real simulation forward for a few seconds with a
// scripted autopilot (driving, drifting, aiming, shooting) before freezing on one frame, so every
// image is the game's own 3D renderer and HUD drawing a moment that really happened in the sim.
//   cover   the golden-hour getaway up Strand Boulevard (Ch.5) with the HKPD and the chopper;
//   onfoot  the Mercado shakedown at golden hour (Ch.3), over the shoulder in a gunfight;
//   race    Neon Mile Nights at dusk, a side race against three named rivals;
//   map     the pause screen's MAP tab mid-story (stats, story, settings: ?tab=1..3).
// ?shot=look is a free 3D camera for tuning, ?shot=check3d reports the renderer's statistics,
// ?shot=flow plays the real app through its screens in both cameras.
import { createGame, stepGame, STEP } from '../core/game.js';
import { createApp, fillStreets, frameApp, newGame } from '../core/appFlow.js';
import { createRenderer, renderWorld } from '../render/renderer.js';
import { drawHud, drawCrosshair } from '../hud/hud.js';
import { drawPauseScreen, PAUSE_TABS } from '../ui/pauseScreen.js';
import { completionPercent } from '../progression/completion.js';
import { drawTitle } from '../ui/titleScreen.js';
import { drawResults } from '../ui/resultsScreen.js';
import { createVehicle } from '../vehicles/drivingPhysics.js';
import { emitTyreSmoke, P_BLOOD, P_FLASH, P_TRACER } from '../render/particles.js';
import { clearWanted, setMinimumWanted } from '../police/wantedSystem.js';
import { spawnHeli } from '../police/policeDispatch.js';
import { abandonMission, beginMission, missionById } from '../missions/missionRunner.js';
import { raceStart, startSideRace } from '../missions/sideActivities.js';
import { sayLines } from '../missions/dialogue.js';
import { placeOnLane } from '../ai/trafficAI.js';
import { alarmPeds, createPed } from '../ai/pedestrianAI.js';
import { randomLook } from '../render/characterArt.js';
import { STATIONS, nowPlaying } from '../audio/radioStations.js';
import { WEAPONS } from '../combat/weapons.js';
import { createRenderer3d, render3d, project3d, drawWorldLabels } from '../render3d/renderer3d.js';
import { titleOrbit, TITLE_SKY } from '../render3d/chaseCamera.js';
import { updateNearGround } from '../render3d/groundTextures.js';

function run(game, steps, pilot) {
  for (let i = 0; i < steps; i += 1) {
    if (pilot) pilot(game, i);
    stepGame(game, STEP);
    game.frameEvents.length = 0;
    game.controls.enter = false;
    game.controls.interact = false;
    game.controls.firePressed = false;
  }
}

function giveProgress(game, completed, cash, xp) {
  game.missions.completed = completed;
  game.economy.cash = cash;
  game.economy.xp = xp;
  game.player.owned.smg = true;
  game.player.ammo.smg = { mag: 32, reserve: 160 };
}

const query = () => new URLSearchParams(window.location.search);
const num = (k, d) => (query().has(k) ? Number(query().get(k)) : d);

/** A direction toward the sky from a compass heading (degrees, 0 = north, 90 = east) and elevation. */
function skyDir(headingDeg, elevDeg) {
  const h = (headingDeg * Math.PI) / 180;
  const e = (elevDeg * Math.PI) / 180;
  return [Math.sin(h) * Math.cos(e), Math.sin(e), -Math.cos(h) * Math.cos(e)];
}

/**
 * Golden-hour getaway up Strand Boulevard: the Vespera GT drifting north between Deco Row's
 * hotels and the beach, cruisers ramming at its flank and pulling alongside, a roadblock waiting
 * far ahead, the chopper's searchlight slanting onto the road ahead, beachgoers scattering from
 * the sirens and the sun sinking over the far end of the boulevard. Juno is on the radio.
 */
function coverScene(seed) {
  const game = createGame(seed, { hours: num('hours', 18.86) });
  giveProgress(game, ['lowtide', 'coldcargo', 'undertow', 'bluelights'], 38420, 2350);
  game.economy.tapes = [0, 3, 5, 8, 11, 14, 17];
  const m = missionById('papermoon');
  beginMission(game, m, m.stages.findIndex((s) => s.type === 'escape'));
  game.notices.length = 0;
  const bx = game.city.grid.bxs[2];
  const lane = bx + num('lane', 16);
  const startY = num('sy', 2500);
  const heading = -Math.PI / 2;
  game.noCrimeT = 999;
  const car = createVehicle('coupe', query().get('paint') ?? '#ff2f6d', lane, startY, heading);
  car.vy = -430;
  car.driver = 'player';
  car.lightsOn = true;
  game.vehicles.push(car);
  game.player.vehicle = car;
  game.player.armor = 45;
  game.player.hp = 78;
  game.player.weapon = 'smg';
  setMinimumWanted(game, 4, car.x, car.y);
  // The pursuit holds a formation on the coupe (scripted so the frame stays clean).
  const follow = (back, side) => (gm, v) => {
    const hv = Math.atan2(car.vy, car.vx);
    const ch = Math.cos(hv);
    const sh = Math.sin(hv);
    const tx = car.x - ch * back - sh * side;
    const ty = car.y - sh * back + ch * side;
    const dx = tx - v.x;
    const dy = ty - v.y;
    const desired = Math.hypot(dx, dy) > 12 ? Math.atan2(dy, dx) : hv;
    let diff = desired - v.angle;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    v.input.steer = Math.max(-1, Math.min(1, diff * 2.4));
    const along = dx * Math.cos(v.angle) + dy * Math.sin(v.angle);
    const sp = v.vx * Math.cos(v.angle) + v.vy * Math.sin(v.angle);
    const carSp = Math.hypot(car.vx, car.vy);
    v.input.throttle = along > 8 ? 1 : sp > carSp + 20 ? -0.6 : 0.2;
    v.input.handbrake = false;
  };
  const cruiser = (back, side) => {
    const c = createVehicle('police', '#f6f6f4', lane + side, startY + back, heading);
    c.vy = -430;
    c.ai = 'pursuit';
    c.drive = follow(back, side);
    c.siren = true;
    c.lightsOn = true;
    c.driver = { team: 'police' };
    c.crew = 2;
    game.vehicles.push(c);
    return c;
  };
  // One on the right flank ramming, one pulling alongside ahead on the left, one further up.
  const units = [[num('b1', -16), num('s1', 36)], [num('b2', -64), num('s2', -30)], [num('b3', -180), num('s3', 26)]];
  for (const [b, s] of units) cruiser(b, s);
  // A roadblock across the boulevard far ahead.
  const rbY = startY - num('rb', 1050);
  for (const side of [-1, 1]) {
    const v = createVehicle('police', '#f6f6f4', bx + side * 26, rbY, side * 0.3);
    v.ai = 'roadblock';
    v.siren = true;
    v.lightsOn = true;
    game.vehicles.push(v);
  }
  spawnHeli(game);
  game.trafficWant = 34;
  game.pedWant = 80;
  fillStreets(game, lane, startY - 500);
  // Autopilot: flat out north holding the lane, then hold a power slide (body yawed off the line
  // of travel) so the physics itself lays down tyre smoke and skid marks.
  const driftAt = startY - num('drift', 520);
  const slideSteps = num('slide', 18);
  const yawOff = num('bodyYaw', 0.5);
  const speed = num('speed', 430);
  let driftStart = -1;
  for (let step = 0; step < 900; step += 1) {
    const sliding = driftStart >= 0;
    if (sliding) {
      car.angle = heading + yawOff;
      car.vx = (lane - car.x) * 2;
      car.vy = -speed;
    }
    run(game, 1, (gm) => {
      const c = gm.controls;
      c.moveY = -1;
      c.aimX = car.x;
      c.aimY = car.y - 100;
      c.handbrake = false;
      if (!sliding) {
        let da = car.angle - heading;
        while (da > Math.PI) da -= Math.PI * 2;
        while (da < -Math.PI) da += Math.PI * 2;
        c.moveX = Math.max(-1, Math.min(1, (lane - car.x) * 0.05 - da * 2.2));
      } else c.moveX = num('steer', -0.7);
    });
    if (!sliding && car.y < driftAt) driftStart = step;
    if (sliding && step - driftStart >= slideSteps) break;
  }
  game.district = 'strand';
  game.districtT = 99;
  game.missions.timer = 127;
  game.dialogue.queue.length = 0;
  game.dialogue.current = null;
  sayLines(game, [['juno', "Alarms are back! You've got the whole department coming - lose them!"]]);
  // Beachgoers on both sidewalks ahead scatter from the sirens; a few duck and cover.
  alarmPeds(game, car.x, car.y, 900);
  for (let i = 0; i < num('crowd', 24); i += 1) {
    const east = i % 3 !== 0;
    const side = east ? 1 : -1;
    const x = bx + side * (num('crowdX', 72) + game.rng.range(-4, 8));
    const y = car.y - num('crowdFrom', 40) - i * num('crowdGap', 20) - game.rng.range(0, 12);
    const ped = createPed(x, y, 'civ', randomLook(game.rng), { pace: 40 });
    ped.state = i % 5 === 4 ? 'cower' : 'flee';
    ped.fleeT = 6;
    ped.fleeX = x - side * 60;
    ped.fleeY = y + 40;
    game.peds.push(ped);
  }
  run(game, 2);
  game.dialogue.t = 3;
  const hv = Math.atan2(car.vy, car.vx);
  // Freeze on the slide: body yawed off the line of travel, still running straight up the lane.
  car.angle = heading + yawOff;
  car.vx = 0;
  car.vy = -speed;
  car.slip = -speed * Math.sin(yawOff);
  // The slide's smoke billows off both rear tyres along the last few car lengths.
  for (let i = 0; i < 7; i += 1) {
    const back = 18 + i * 9;
    for (const side of [-1, 1]) {
      const wx = car.x - Math.cos(car.angle) * back - Math.sin(car.angle) * side * 8;
      const wy = car.y - Math.sin(car.angle) * back + Math.cos(car.angle) * side * 8;
      emitTyreSmoke(game.fx, game.rng, wx, wy, car.vx * 0.2, car.vy * 0.2);
    }
  }
  // The chopper hangs over the hotel roofs ahead-left, its beam slanting across the facades
  // onto the boulevard just ahead of the coupe.
  const ahead = num('ha', 370);
  const right = num('hr', -120);
  game.heli.x = car.x + Math.cos(hv) * ahead - Math.sin(hv) * right;
  game.heli.y = car.y + Math.sin(hv) * ahead + Math.cos(hv) * right;
  game.heli.angle = hv + Math.PI - 0.4;
  game.heli.vx = 0;
  game.heli.vy = 0;
  game.heli.lit = true;
  game.heli.lightX = car.x + Math.cos(hv) * num('la', 70) - Math.sin(hv) * num('lr', -30);
  game.heli.lightY = car.y + Math.sin(hv) * num('la', 70) + Math.cos(hv) * num('lr', -30);
  // Pinned by the searchlight and the cruisers: in sight, the zone follows the car.
  game.wanted.seen = true;
  game.wanted.evadeT = 0;
  game.missions.progress = 'They can see you - break line of sight';
  // Keep civilian traffic from parking itself between the camera and the coupe.
  game.vehicles = game.vehicles.filter((v) => v.ai !== 'traffic' || Math.hypot(v.x - car.x, v.y - car.y) > 120);
  const station = STATIONS[0];
  return {
    game,
    view: {
      mode: 'chase', distK: num('distK', 1), heightK: num('heightK', 1), fov: num('fov', 64), lookUp: num('lookUp', 5), yawOffset: num('yawOff', 0), heliAlt: num('halt', 92),
      sky: { sunDir: skyDir(num('sunH', -4), num('sunE', 6)), lightDir: skyDir(num('sunH', -4), num('sunE', 6)), fogK: num('fogK', 0.55), exposureK: num('expK', 1.0), bloomK: num('bloomK', 0.66) },
      fill: { r: num('fillR', 75), k: num('fillK', 2.2), up: num('fillUp', 2), back: -num('fillF', 34) },
    },
    overlay(ctx, w, h, r3) {
      drawWorldLabels(ctx, r3);
      drawHud(ctx, game, w, h, { name: station.name, color: station.color, track: nowPlaying(station, 0) });
    },
  };
}

/**
 * The title screen: the Vespera GT pulled over on the Halcyon Causeway above the bay, a low
 * camera beside the rail looking west, the sun going down behind the Neon Mile skyline.
 */
function titleScene(seed) {
  const game = createGame(seed, { hours: num('hours', 18.62) });
  const cx = num('cx', 4410);
  const cy = 2592 - num('cyo', -46);
  fillStreets(game, cx - 300, cy);
  run(game, 120);
  // Clear the lane around the hero car and park it.
  game.vehicles = game.vehicles.filter((v) => Math.hypot(v.x - cx, v.y - cy) > 140);
  const v = createVehicle('coupe', '#ff2f6d', cx, cy, num('carYaw', 0.55));
  v.ai = 'parked';
  v.lightsOn = true;
  v.driver = null;
  game.vehicles.push(v);
  for (const p of game.peds) if (Math.hypot(p.x - cx, p.y - cy) < 40) p.removed = true;
  game.peds = game.peds.filter((p) => !p.removed);
  run(game, 2);
  const save = 'Ch.5 Paper Moon  ·  $31,420  ·  Day 3, 18:40';
  const orbit = { x: cx, y: cy, r: num('tr', 100), h: num('th', 24), a0: num('ta', -0.08), speed: 0, look: 900, lookH: num('tlh', 32), turn: num('turn', 0), fov: num('fov', 52) };
  // Dez leans by the driver's door, facing the camera.
  const pl = game.player;
  const ex = cx + Math.cos(orbit.a0) * orbit.r;
  const ey = cy + Math.sin(orbit.a0) * orbit.r;
  pl.x = cx + num('dzx', 16);
  pl.y = cy + num('dzy', -21);
  pl.angle = Math.atan2(ey - pl.y, ex - pl.x) + num('dza', 0.5);
  pl.speed = 0;
  pl.weapon = 'none';
  return {
    game,
    view: { mode: 'orbit', orbitT: 0, orbit, sky: { ...TITLE_SKY, fogK: num('fogK', 0.6) }, fill: { r: num('fillR', 90), k: num('fillK', 1.6), up: 6, back: -num('fillF', 50) } },
    overlay(ctx, w, h) {
      drawTitle(ctx, w, h, { sel: 0, save, t: 1.2 });
    },
  };
}


/** A parked car at (x, y) facing `angle`. */
function parkCar(game, model, paint, x, y, angle) {
  const v = createVehicle(model, paint, x, y, angle);
  v.ai = 'parked';
  game.vehicles.push(v);
  return v;
}

/**
 * Golden hour in the Old Mercado (Ch.3, Undertow): the crew shaking down Mags' stalls has opened
 * up, and Dez answers with the Wasp SMG from the street beside the market. The crew hold cover
 * behind parked cars and the fruit stalls, shoppers scatter, and the stray gunfire has brought
 * the first HKPD unit in.
 */
function onFootScene(seed) {
  const game = createGame(seed, { hours: num('hours', 18.7) });
  giveProgress(game, ['lowtide', 'coldcargo'], 9850, 900);
  game.economy.tapes = [1, 4, 9];
  const pl = game.player;
  const px = num('px', 1728);
  const py = num('py', 2470);
  pl.x = px;
  pl.y = py;
  pl.angle = -Math.PI / 2;
  pl.weapon = 'smg';
  pl.armor = 64;
  pl.hp = 74;
  const m = missionById('undertow');
  beginMission(game, m, m.stages.findIndex((s) => s.type === 'spawnGang'));
  game.notices.length = 0;
  run(game, 3);
  game.missions.stage = m.stages.findIndex((s) => s.type === 'kill');
  game.missions.init = false;
  game.dialogue.queue.length = 0;
  game.dialogue.current = null;
  sayLines(game, [['mags', 'Them - teal shirts, by the fruit stalls! Clear them out before they empty the tills!']]);
  const crew = game.missions.groups.shakedown ?? [];
  // The crew at cover up the street: behind parked cars, by the stalls, in a shop doorway.
  const spots = [[num('g0x', 1712), num('g0y', 2378)], [num('g1x', 1684), num('g1y', 2394)], [num('g2x', 1776), num('g2y', 2402)], [num('g3x', 1754), num('g3y', 2330)]];
  crew.forEach((p, i) => {
    const [x, y] = spots[i % spots.length];
    p.x = x;
    p.y = y;
    p.angle = Math.atan2(py - y, px - x);
  });
  parkCar(game, 'sedan', '#2fbf9f', num('c0x', 1708), num('c0y', 2412), -Math.PI / 2 + 0.06);
  parkCar(game, 'pickup', '#f5b82e', num('c1x', 1750), num('c1y', 2360), Math.PI / 2 - 0.04);
  parkCar(game, 'muscle', '#c9384f', num('c2x', 1706), num('c2y', 2290), -Math.PI / 2);
  parkCar(game, 'van', '#e9d8b8', num('c3x', 1752), num('c3y', 2214), Math.PI / 2);
  game.pedWant = 60;
  fillStreets(game, px, py - 200);
  // Shoppers along the market edge and the shopfronts across the street.
  for (let i = 0; i < num('shoppers', 10); i += 1) {
    const east = i % 2 === 1;
    const x = east ? 1768 + game.rng.range(-4, 6) : 1684 + game.rng.range(-6, 4);
    const y = 2290 + i * 22 + game.rng.range(-8, 8);
    const ped = createPed(x, y, 'civ', randomLook(game.rng), { state: 'idle', pace: 40 });
    game.peds.push(ped);
  }
  // Keep traffic out of the gunfight and bystanders off Dez's shoulder.
  game.vehicles = game.vehicles.filter((v) => v.ai !== 'traffic' || Math.abs(v.x - px) > 120 || v.y < py - 700 || v.y > py + 200);
  for (const p of game.peds) if (!p.hostile && Math.hypot(p.x - px, p.y - py) < 50) p.removed = true;
  game.peds = game.peds.filter((p) => !p.removed);
  let target = null;
  const centre = { x: num('aimx', 1716), y: num('aimy', 2400) };
  const off = (p) => Math.hypot(p.x - centre.x, p.y - centre.y);
  const burst = [num('burst0', 60), num('burst1', 200)];
  const pilot = (gm, i) => {
    const c = gm.controls;
    if (!target || target.dead) target = gm.peds.filter((p) => p.hostile && !p.dead && p.team === 'gang').sort((a, b) => off(a) - off(b))[0];
    c.moveX = 0;
    c.moveY = 0;
    if (target) {
      c.aimX = target.x;
      c.aimY = target.y;
    }
    c.fire = i >= burst[0] && i < burst[1] && i % 24 < 14;
    c.firePressed = c.fire && i % 24 === 0;
    pl.hp = Math.max(pl.hp, 66);
    pl.armor = Math.max(pl.armor, 50);
    pl.x = px;
    pl.y = py;
  };
  run(game, burst[0], pilot);
  // Stop on a frame where Dez's SMG is firing, a tracer is in the air, the crew are shooting back
  // and someone in teal has just been hit (or is on the ground).
  const near = (list, kind, r) => game.fx.list.filter((p) => p.kind === kind && list.some((q) => Math.hypot(p.x - q.x, p.y - q.y) < r)).length;
  let i = burst[0];
  const want = num('need', 1);
  for (; i < burst[1]; i += 1) {
    run(game, 1, (gm) => pilot(gm, i));
    const mine = near([pl], P_FLASH, 30);
    const tracers = game.fx.list.filter((p) => p.kind === P_TRACER).length;
    const theirs = near(crew.filter((p) => !p.dead), P_FLASH, 30);
    const hit = crew.some((p) => !p.dead && p.hurtT > 0.15) && near(crew, P_BLOOD, 24) > 0;
    if (mine > 0 && tracers > 0 && hit && theirs >= want) break;
  }
  game.dialogue.t = 3;
  game.districtT = 99;
  pl.hurtT = 0;
  alarmPeds(game, px, py - 120, 500);
  const aim = { x: game.controls.aimX, y: game.controls.aimY };
  const alive = crew.filter((p) => !p.dead);
  const look = alive.length ? { x: alive.reduce((s, p) => s + p.x, 0) / alive.length + num('lookDx', 0), y: alive.reduce((s, p) => s + p.y, 0) / alive.length } : aim;
  return {
    game,
    view: {
      mode: 'foot', aim: look, yawOffset: num('yawOff', -0.2), distK: num('distK', 0.66), heightK: num('heightK', 0.86), sideK: num('sideK', 1.1), fov: num('fov', 60), lookUp: num('lookUp', 2),
      sky: { exposureK: num('expK', 1.06), fogK: num('fogK', 0.7), bloomK: num('bloomK', 0.9) },
      fill: { r: num('fillR', 80), k: num('fillK', 1.4), up: 4, back: -num('fillF', 30) },
    },
    overlay(ctx, w, h, r3) {
      drawWorldLabels(ctx, r3);
      drawHud(ctx, game, w, h, null);
      const sp = project3d(r3, aim.x, aim.y, 13);
      drawCrosshair(ctx, sp.x, sp.y, WEAPONS.smg.spread * 60, false, true);
    },
  };
}

/**
 * Neon Mile Nights at dusk: lap two of the side race, the Vespera GT leading the pack west down
 * the Halcyon Causeway between the towers toward the last checkpoint and the finish gate, rivals
 * door to door, the street rain-slick under the neon.
 */
function raceScene(seed) {
  const game = createGame(seed, { hours: num('hours', 19.72) });
  giveProgress(game, ['lowtide', 'coldcargo', 'undertow', 'bluelights', 'papermoon'], 52300, 3900);
  game.economy.races = ['strand'];
  game.stats.racesWon = 1;
  game.stats.racesRun = 2;
  game.noCrimeT = 999;
  const heading = Math.PI;
  const speed = num('speed', 470);
  const px = num('cx', 2760);
  const lane = 2592 - num('lane', 24);
  const pre = num('pre', 0.9) * speed;
  const car = createVehicle('coupe', query().get('paint') ?? '#ff2f6d', px + pre, lane, heading);
  car.vx = -speed;
  car.driver = 'player';
  car.lightsOn = true;
  game.vehicles.push(car);
  game.player.vehicle = car;
  game.player.weapon = 'pistol';
  const race = startSideRace(game, 'neon');
  race.started = true;
  race.countdown = 0;
  race.startT = game.t - num('rt', 73.4);
  race.next = 12;
  race.pIdx = race.cpIndex[12];
  // [metres ahead (+) or behind (-) of the coupe, offset across the road (+ = south)].
  const form = [[num('a0', -6), num('s0', 36)], [num('a1', -20), num('s1', -27)], [num('a2', -140), num('s2', 6)]];
  const hold = (a, s) => (gm, v) => {
    const tx = car.x + Math.cos(heading) * a;
    const ty = lane + s;
    const desired = Math.atan2(ty - v.y, tx - v.x + Math.cos(heading) * 60);
    let diff = desired - v.angle;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    v.input.steer = Math.max(-1, Math.min(1, diff * 2.2));
    const along = (tx - v.x) * Math.cos(heading);
    v.input.throttle = along > 4 ? 1 : along < -4 ? -0.4 : 0.5;
    v.input.handbrake = false;
  };
  race.racers.forEach((v, i) => {
    const [a, s] = form[i];
    v.x = car.x + Math.cos(heading) * a;
    v.y = lane + s;
    v.angle = heading;
    v.vx = -speed;
    v.vy = 0;
    v.drive = hold(a, s);
  });
  game.trafficWant = 30;
  game.pedWant = 70;
  fillStreets(game, px - 300, lane);
  const clearRoad = () => {
    game.vehicles = game.vehicles.filter((v) => v.ai !== 'traffic' || Math.abs(v.y - 2592) > 70 || (v.x < px - num('clear', 520) && v.y > 2592) || v.x > px + pre + 200);
  };
  clearRoad();
  run(game, Math.round(num('pre', 0.9) * 60), (gm) => {
    const c = gm.controls;
    c.moveY = -1;
    let da = car.angle - heading;
    while (da > Math.PI) da -= Math.PI * 2;
    while (da < -Math.PI) da += Math.PI * 2;
    c.moveX = Math.max(-1, Math.min(1, (lane - car.y) * -0.04 - da * 2));
    c.handbrake = false;
    car.vx = -speed;
  });
  // Freeze the pack in formation at the chosen spot, everyone between checkpoints 12 and 13.
  car.x = px;
  car.y = lane;
  car.angle = heading;
  car.vx = -speed;
  car.vy = 0;
  race.racers.forEach((v, i) => {
    const [a, s] = form[i];
    v.x = car.x + Math.cos(heading) * a;
    v.y = lane + s;
    v.angle = heading + num(`yaw${i}`, 0);
    v.vx = -speed;
    v.vy = 0;
    v.pathIndex = race.cpIndex[13];
  });
  game.fx.list.length = 0;
  race.next = 13;
  race.pIdx = race.cpIndex[13];
  clearRoad();
  run(game, 1);
  game.district = 'neon';
  game.districtT = 99;
  game.notices.length = 0;
  const station = STATIONS[3];
  return {
    game,
    view: {
      mode: 'chase', distK: num('distK', 1), heightK: num('heightK', 1.05), fov: num('fov', 64), lookUp: num('lookUp', 7), yawOffset: num('yawOff', 0),
      sky: { exposureK: num('expK', 1.08), fogK: num('fogK', 0.8), bloomK: num('bloomK', 1) },
      fill: { r: num('fillR', 70), k: num('fillK', 1.2), up: 3, back: -num('fillF', 30), color: [1, 0.55, 0.9] },
    },
    overlay(ctx, w, h, r3) {
      drawWorldLabels(ctx, r3);
      drawHud(ctx, game, w, h, { name: station.name, color: station.color, track: nowPlaying(station, 2) });
    },
  };
}

/**
 * The pause screen midway through the story (Paper Moon under way, the GPS leading to Halcyon
 * Trust) over the dimmed city: the MAP tab, or ?tab=1..3 for STATS, STORY and SETTINGS.
 */
function pauseScene(seed, tabIndex = 0) {
  const game = newGame(seed, null, { shake: 1 });
  giveProgress(game, ['lowtide', 'coldcargo', 'undertow', 'bluelights'], 41250, 2600);
  game.economy.tapes = [0, 2, 3, 7, 9, 12, 15, 18];
  game.economy.properties.penthouse = true;
  game.economy.garage = ['sedan', 'van', 'coupe'];
  game.economy.races = ['strand', 'neon'];
  game.economy.earned = 68400;
  Object.assign(game.stats, { racesRun: 5, racesWon: 3, fares: 11, copsEscaped: 9, driven: 9 * 48600, distance: 9 * 61900, kills: 23, shots: 412, hits: 171, crashes: 64, topSpeed: 590, maxWanted: 4, jobsFailed: 2 });
  game.playtime = 2 * 3600 + 14 * 60;
  game.clock.day = 3;
  const m = missionById('papermoon');
  beginMission(game, m, m.stages.findIndex((s) => s.type === 'goto'));
  game.player.x = game.city.grid.bxs[2] + 40;
  game.player.y = num('py', 1700);
  game.player.angle = Math.PI / 2;
  run(game, 30);
  game.notices.length = 0;
  const tab = num('tab', tabIndex);
  return {
    game,
    view: { mode: 'orbit', orbitT: 0, orbit: titleOrbit(0.2) },
    overlay(ctx, w, h) {
      drawPauseScreen(ctx, game, w, h, { tab: Math.max(0, Math.min(PAUSE_TABS.length - 1, tab)), setSel: 0, settings: { master: 0.8, music: 0.6, sfx: 0.8, shake: 1, view: '3d' } });
    },
  };
}

const mapScene = (seed) => pauseScene(seed, 0);
const statsScene = (seed) => pauseScene(seed, 1);

/** JOB COMPLETE after Paper Moon (an alternative fourth image). */
function resultsScene(seed) {
  const game = newGame(seed, null, { shake: 1 });
  giveProgress(game, ['lowtide', 'coldcargo', 'undertow', 'bluelights'], 29250, 2300);
  game.missions.completed.push('papermoon');
  game.missions.results = { chapter: 5, title: 'Paper Moon', payout: 12000, respect: 1100, time: 412, accuracy: 64, kills: 3, crashes: 9, topSpeed: 560 };
  run(game, 20);
  return { game, view: { mode: 'orbit', orbitT: 0, orbit: titleOrbit(0.3) }, overlay(ctx, w, h) { drawResults(ctx, w, h, game, 3); } };
}

/** The same cover moment drawn by the classic top-down camera (V in game). */
function classicScene(seed) {
  const s = coverScene(seed);
  return { ...s, classic: true, overlay(ctx, w, h) { drawHud(ctx, s.game, w, h, { name: STATIONS[0].name, color: STATIONS[0].color }); } };
}

/**
 * A free camera for tuning the 3D view: ?shot=look&x=&y=&yaw=&h=&dist=&hours=&lookH= places a
 * fixed camera (no HUD) and prints the renderer's statistics in the corner.
 */
function lookScene(seed) {
  const game = createGame(seed, { hours: num('hours', 18.7) });
  const poi = game.city.pois[query().get('poi')];
  const x = num('x', poi ? poi.x : 4600);
  const y = num('y', poi ? poi.y : 2592);
  fillStreets(game, x, y);
  run(game, 30);
  const yaw = (num('yaw', 180) * Math.PI) / 180;
  const dist = num('dist', 120);
  const view = { mode: 'orbit', orbitT: 0, orbit: { x, y, r: dist, a0: yaw + Math.PI, speed: 0, h: num('h', 60), look: 200, lookH: num('lookH', 30), fov: num('fov', 60) } };
  return { game, view, overlay: (ctx, w, h, r3) => (query().has('clean') ? null : drawStats(ctx, w, h, r3)) };
}

function drawStats(ctx, w, h, r3) {
  if (!r3) return;
  const s = r3.stats;
  ctx.fillStyle = 'rgba(0,0,0,0.65)';
  ctx.fillRect(10, h - 40, 820, 30);
  ctx.fillStyle = '#7dff9a';
  ctx.font = '15px monospace';
  ctx.fillText(`3D OK: ${s.draws} draws  ${s.tris} tris  ${s.chunks} chunks  ${s.lights} lights  ${s.w}x${s.h}  msaa=${s.msaa} hdr=${s.hdr}  ${r3.renderer}`.slice(0, 118), 18, h - 20);
  ctx.fillText(`viewport ${window.innerWidth}x${window.innerHeight} dpr ${window.devicePixelRatio}  canvas ${w}x${h}  css ${ctx.canvas.clientWidth}x${ctx.canvas.clientHeight}`, 18, h - 46);
}

/**
 * Renderer check: the cover moment with the statistics overlay instead of the HUD, plus a sweep
 * of the camera across the city that times every step of the near-ground painting.
 */
function check3dScene(seed) {
  const s = coverScene(seed);
  return {
    ...s,
    overlay(ctx, w, h, r3) {
      drawStats(ctx, w, h, r3);
      const gt = r3.world.gt;
      gt.stageMax = { terrain: 0, band: 0, upload: 0 };
      for (let i = 0; i < 240; i += 1) updateNearGround(gt, 900 + i * 20, 1200 + i * 12, 820, 1);
      const m = gt.stageMax;
      ctx.fillStyle = 'rgba(0,0,0,0.65)';
      ctx.fillRect(10, h - 96, 820, 30);
      ctx.fillStyle = '#7dff9a';
      ctx.font = '15px monospace';
      ctx.fillText(`ground steps (max ms): terrain ${m.terrain.toFixed(1)}  band ${m.band.toFixed(1)}  upload ${m.upload.toFixed(1)}  world build ${r3.stats.buildMs.toFixed(0)} ms  js/frame ${r3.stats.jsMs.toFixed(2)} ms`, 18, h - 76);
    },
  };
}

const SCENES = { cover: coverScene, title: titleScene, onfoot: onFootScene, race: raceScene, map: mapScene, stats: statsScene, results: resultsScene, classic: classicScene, look: lookScene, check3d: check3dScene };

/**
 * Smoke test of the real app (?shot=flow): synthetic key presses walk through the title menu,
 * a new game, walking, stealing a car, driving and drifting, a police chase, the classic camera
 * (V) and back, a street race (started with E at its start gate, its countdown cut short, then
 * driven gate to gate to the finish and the prize), every tab of the pause screen, the map on M,
 * getting out and both cameras on foot. What it saw is printed in the corner and the console
 * ("flow ok" or "flow FAILED: ..."); any error shows in the page's error box.
 */
function flowTest(canvas, canvas3d) {
  const app = createApp(canvas, canvas3d);
  const key = (code, type) => window.dispatchEvent(new KeyboardEvent(type, { code }));
  const tap = (code) => {
    key(code, 'keydown');
    key(code, 'keyup');
  };
  const seen = [];
  const views = new Set();
  const tabs = new Set();
  const race = { started: false, gates: 0, wonBefore: 0, cashBefore: 0, won: false, prize: 0 };
  const car = () => app.game.player.vehicle;
  const park = (x, y) => {
    const v = car();
    if (!v) return;
    v.x = x;
    v.y = y;
    v.vx = 0;
    v.vy = 0;
  };
  const script = {
    5: () => tap('Enter'),
    20: () => key('KeyW', 'keydown'),
    80: () => {
      key('KeyW', 'keyup');
      const pl = app.game.player;
      const v = createVehicle('muscle', '#2fbf9f', pl.x + 26, pl.y, 0);
      app.game.vehicles.push(v);
    },
    85: () => tap('KeyF'),
    90: () => key('KeyW', 'keydown'),
    120: () => setMinimumWanted(app.game, 3),
    150: () => key('Space', 'keydown'),
    170: () => key('Space', 'keyup'),
    190: () => tap('KeyV'),
    200: () => tap('KeyE'),
    215: () => tap('KeyV'),
    // Street race: lose the heat, roll up to the Neon Mile Nights start gate and press E.
    230: () => {
      key('KeyW', 'keyup');
      if (app.game.missions.active) abandonMission(app.game);
      clearWanted(app.game);
      app.game.heli = null;
      app.game.vehicles = app.game.vehicles.filter((v) => v.ai !== 'police' && v.ai !== 'roadblock');
      const p = raceStart(app.game, 'neon');
      park(p.x, p.y + 20);
      race.wonBefore = app.game.stats.racesWon;
      race.cashBefore = app.game.economy.cash;
    },
    236: () => tap('KeyE'),
    242: () => {
      const r = app.game.missions.race;
      if (r) {
        race.started = true;
        r.countdown = 0.05;
      }
    },
    // Pause: MAP, then E through STATS, STORY and SETTINGS (adjust a slider), Q back, resume.
    320: () => tap('Escape'),
    326: () => tap('KeyE'),
    332: () => tap('KeyE'),
    338: () => tap('KeyE'),
    342: () => tap('ArrowRight'),
    346: () => tap('KeyQ'),
    352: () => tap('Escape'),
    358: () => tap('KeyM'),
    364: () => tap('KeyM'),
    372: () => tap('KeyF'),
    395: () => tap('KeyV'),
    410: () => tap('KeyV'),
  };
  const cpu = [];
  let paintMax = 0;
  for (let f = 0; f < 425; f += 1) {
    if (script[f]) script[f]();
    // During the race, drive gate to gate (two frames at each so the checkpoint registers).
    const r = app.game.missions.race;
    if (f > 244 && f < 320 && r && r.started && f % 2 === 0) {
      const p = r.points[r.next];
      if (p) {
        park(p.x, p.y);
        race.gates += 1;
      }
    }
    frameApp(app, 1 / 60);
    if (race.started && !app.game.missions.race && !race.won && app.game.stats.racesWon > race.wonBefore) {
      race.won = true;
      race.prize = app.game.economy.cash - race.cashBefore;
    }
    if (seen[seen.length - 1] !== app.screen) seen.push(app.screen);
    if (app.screen === 'pause') tabs.add(PAUSE_TABS[app.tab]);
    views.add(`${app.view}${app.game.player.vehicle ? '-car' : '-foot'}`);
    if (app.r3 && app.view === '3d' && f > 2) {
      cpu.push(app.r3.stats.jsMs);
      paintMax = Math.max(paintMax, app.r3.stats.paintMs);
    }
  }
  const s3 = app.r3 ? app.r3.stats : {};
  const avg = cpu.length ? cpu.reduce((a, b) => a + b, 0) / cpu.length : 0;
  const problems = [];
  if (!race.won) problems.push('the street race was not won');
  for (const t of PAUSE_TABS) if (!tabs.has(t)) problems.push(`pause tab ${t} never shown`);
  for (const v of ['3d-car', 'classic-car', '3d-foot', 'classic-foot']) if (!views.has(v)) problems.push(`view ${v} never used`);
  if (app.screen !== 'play') problems.push(`ended on ${app.screen}`);
  const ctx = canvas.getContext('2d');
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = 'rgba(0,0,0,0.75)';
  ctx.fillRect(10, 280, 1000, 204);
  ctx.fillStyle = problems.length ? '#ff7a7a' : '#7dff9a';
  ctx.font = '16px monospace';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(`flow: ${seen.join(' > ')}`, 20, 302);
  ctx.fillText(`views: ${[...views].join(', ')}  wanted: ${app.game.wanted.level}`, 20, 326);
  ctx.fillText(`race: ${race.won ? `won Neon Mile Nights through ${race.gates} gate visits, +$${race.prize}` : 'NOT WON'}  races won ${app.game.stats.racesWon}  routes ${app.game.economy.races.join(',')}`, 20, 350);
  ctx.fillText(`pause tabs: ${[...tabs].join(' / ')}  completion ${completionPercent(app.game)}%`, 20, 374);
  ctx.fillText(`in car: ${!!app.game.player.vehicle}  station: ${app.audio.radio.station}  t=${app.game.t.toFixed(1)}  3d: ${app.r3 ? 'on' : 'off'}`, 20, 398);
  ctx.fillText(`3d js/frame avg ${avg.toFixed(2)} ms  max ${Math.max(0, ...cpu).toFixed(1)} ms  ground step max ${paintMax.toFixed(1)} ms  world build ${(s3.buildMs ?? 0).toFixed(0)} ms`, 20, 422);
  ctx.fillText(`static ${s3.staticTris} tris  frame ${s3.tris} tris  ${s3.draws} draws  dyn ${s3.dynVerts} verts  fx ${s3.fxVerts} verts  lights ${s3.lights}`, 20, 446);
  ctx.fillText(problems.length ? `FAILED: ${problems.join('; ')}` : 'flow ok', 20, 470);
  if (problems.length) console.error(`flow FAILED: ${problems.join('; ')}`);
  else console.log('flow ok');
}

/** A loud on-screen failure (the screenshot must never silently fall back). */
function failLoud(ctx, w, h, message) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#b00020';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#ffffff';
  ctx.font = '900 40px Arial, sans-serif';
  ctx.fillText('3D RENDERER FAILED', 40, 90);
  ctx.font = '18px monospace';
  String(message).split('\n').slice(0, 20).forEach((ln, i) => ctx.fillText(ln.slice(0, 120), 40, 140 + i * 24));
  console.error(`3D RENDERER FAILED: ${message}`);
}

/** Stage `name` with `seed`, draw it to the canvases, and report when the frame is ready. */
export function runShot(name, seed, canvas, canvas3d) {
  if (name === 'flow') return flowTest(canvas, canvas3d);
  const scene = (SCENES[name] ?? coverScene)(seed);
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  if (scene.classic) {
    const renderer = createRenderer(canvas);
    renderWorld(renderer, scene.game, 999);
    scene.overlay(ctx, w, h, null);
    return scene;
  }
  let r3 = null;
  try {
    r3 = canvas3d ? createRenderer3d(canvas3d, { preserve: true }) : null;
    if (!r3) throw new Error('WebGL2 context could not be created');
    window.__stats3d = render3d(r3, scene.game, w, h, { snap: true, groundBudget: Infinity, fixedScale: 1, ...(scene.view ?? {}) });
  } catch (e) {
    failLoud(ctx, w, h, e && e.stack ? e.stack : e);
    throw e;
  }
  ctx.clearRect(0, 0, w, h);
  scene.overlay(ctx, w, h, r3);
  return scene;
}
