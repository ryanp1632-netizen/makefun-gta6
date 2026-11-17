// The screenshot scenes behind ?shot=<scene>&seed=<n>. Each builds a fresh world from the seed,
// sets up a moment of the story, and plays the real simulation forward for a few seconds with a
// scripted autopilot (driving, drifting, aiming, shooting) before freezing on one frame, so every
// image is the game's own 3D renderer and HUD drawing a moment that really happened in the sim.
// ?shot=look is a free 3D camera for tuning, ?shot=check3d reports the renderer's statistics,
// ?shot=flow plays the real app through its screens in both cameras.
import { createGame, stepGame, STEP } from '../core/game.js';
import { createApp, fillStreets, frameApp, newGame } from '../core/appFlow.js';
import { createRenderer, renderWorld } from '../render/renderer.js';
import { drawHud, drawCrosshair } from '../hud/hud.js';
import { drawCityMap } from '../hud/cityMap.js';
import { drawTitle } from '../ui/titleScreen.js';
import { drawResults } from '../ui/resultsScreen.js';
import { createVehicle } from '../vehicles/drivingPhysics.js';
import { emitTyreSmoke } from '../render/particles.js';
import { setMinimumWanted } from '../police/wantedSystem.js';
import { spawnHeli } from '../police/policeDispatch.js';
import { beginMission, missionById } from '../missions/missionRunner.js';
import { sayLines } from '../missions/dialogue.js';
import { placeOnLane } from '../ai/trafficAI.js';
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
 * far ahead and the chopper's searchlight on the road, the sun sinking over the far end of the
 * boulevard. Juno is on the radio.
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
  const startY = num('sy', 2330);
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
  run(game, 2);
  game.dialogue.t = 3;
  // The chopper hangs ahead of the car, its searchlight on the road just in front of the coupe.
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
  const ahead = num('ha', 520);
  const right = num('hr', -50);
  game.heli.x = car.x + Math.cos(hv) * ahead - Math.sin(hv) * right;
  game.heli.y = car.y + Math.sin(hv) * ahead + Math.cos(hv) * right;
  game.heli.angle = hv + Math.PI - 0.4;
  game.heli.vx = 0;
  game.heli.vy = 0;
  game.heli.lit = true;
  game.heli.lightX = car.x + Math.cos(hv) * num('la', 40);
  game.heli.lightY = car.y + Math.sin(hv) * num('la', 40);
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
      mode: 'chase', distK: num('distK', 1), heightK: num('heightK', 1), fov: num('fov', 64), lookUp: num('lookUp', 5), yawOffset: num('yawOff', 0), heliAlt: num('halt', 110),
      sky: { sunDir: skyDir(num('sunH', -4), num('sunE', 6)), lightDir: skyDir(num('sunH', -4), num('sunE', 6)), fogK: num('fogK', 0.55), exposureK: num('expK', 1.05), bloomK: num('bloomK', 0.8) },
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


/** Night on Neon Mile: the Undertow crew ambush outside Club Voltage, SMG in hand. */
function onFootScene(seed) {
  const game = createGame(seed, { hours: num('hours', 21.7) });
  giveProgress(game, ['lowtide', 'coldcargo'], 9850, 900);
  const club = game.city.pois.club;
  const pl = game.player;
  pl.x = club.x;
  pl.y = club.y;
  pl.weapon = 'smg';
  pl.armor = 64;
  pl.hp = 71;
  const m = missionById('undertow');
  beginMission(game, m, m.stages.findIndex((s) => s.type === 'lawless'));
  game.notices.length = 0;
  run(game, 3);
  const kill = m.stages.findIndex((s) => s.type === 'kill');
  game.missions.stage = kill;
  game.missions.init = false;
  game.dialogue.queue.length = 0;
  game.dialogue.current = null;
  sayLines(game, [['silas', 'Calloway. You should have stayed in your cell. Boys - wash him out.']]);
  // Stage the stand-off: Dez out in the street, the crew spread along the club's sidewalk.
  const b = club.building;
  const out = club.y < b.y0 ? [0, -1] : club.y > b.y1 ? [0, 1] : club.x < b.x0 ? [-1, 0] : [1, 0];
  const lat = [-out[1], out[0]];
  const L = num('lat', 84);
  pl.x = club.x + out[0] * num('pout', 46) + lat[0] * L;
  pl.y = club.y + out[1] * num('pout', 46) + lat[1] * L;
  const crew = game.missions.groups.crew ?? [];
  // The crew fans out along the club's sidewalk behind a line of parked cars.
  const spots = [[num('c0o', 6), num('c0l', 14)], [num('c1o', 22), num('c1l', -22)], [num('c2o', 6), num('c2l', -52)], [num('c3o', 44), num('c3l', -74)], [12, -110], [30, -140]];
  crew.forEach((p, i) => {
    const [o, l] = spots[i % spots.length];
    p.x = club.x + out[0] * o + lat[0] * l;
    p.y = club.y + out[1] * o + lat[1] * l;
    p.angle = Math.atan2(pl.y - p.y, pl.x - p.x);
  });
  const along = Math.atan2(lat[1], lat[0]);
  for (const [l, o, model, paint] of [[num('car0', -8), 30, 'sedan', '#2f6fdf'], [num('car1', 36), 26, 'muscle', '#8a4fd8'], [num('car2', -62), 52, 'van', '#e9d8b8']]) {
    const v = createVehicle(model, paint, club.x + out[0] * o + lat[0] * l, club.y + out[1] * o + lat[1] * l, along + num('carA', 0.25));
    v.ai = 'parked';
    game.vehicles.push(v);
  }
  fillStreets(game, pl.x, pl.y);
  // Keep bystanders and traffic out of the line of fire.
  game.vehicles = game.vehicles.filter((v) => v.ai !== 'traffic' || Math.hypot(v.x - pl.x, v.y - pl.y) > 260);
  for (const p of game.peds) if (!p.hostile && Math.hypot(p.x - pl.x, p.y - pl.y) < 200) p.removed = true;
  game.peds = game.peds.filter((p) => !p.removed);
  let target = null;
  // Shoot at whoever stands closest to the middle of the crew (straight down the street).
  const cx0 = crew.reduce((s, p) => s + p.x, 0) / Math.max(1, crew.length);
  const cy0 = crew.reduce((s, p) => s + p.y, 0) / Math.max(1, crew.length);
  const ahead = Math.atan2(cy0 - pl.y, cx0 - pl.x) + num('aimBias', 0);
  const off = (p) => Math.abs(Math.atan2(Math.sin(Math.atan2(p.y - pl.y, p.x - pl.x) - ahead), Math.cos(Math.atan2(p.y - pl.y, p.x - pl.x) - ahead)));
  const burst = [num('burst0', 70), num('burst1', 82)];
  const pilot = (gm, i) => {
    const c = gm.controls;
    if (!target || target.dead) target = gm.peds.filter((p) => p.hostile && !p.dead && p.team === 'gang').sort((a, b) => off(a) - off(b))[0];
    c.moveX = 0;
    c.moveY = 0;
    if (target) {
      c.aimX = target.x;
      c.aimY = target.y;
    }
    c.fire = i >= burst[0] && i < burst[1];
    c.firePressed = i === burst[0];
    pl.hp = Math.max(pl.hp, 62);
    pl.armor = Math.max(pl.armor, 48);
  };
  run(game, burst[0], pilot);
  // Stop on a frame where Dez's SMG and at least two of the crew have just fired.
  const flashesNear = (list, r) => game.fx.list.filter((p) => p.kind === 4 && list.some((q) => Math.hypot(p.x - q.x, p.y - q.y) < r)).length;
  let best = -1;
  let i = burst[0];
  for (; i < burst[0] + 160; i += 1) {
    run(game, 1, (gm) => pilot(gm, i));
    const mine = flashesNear([pl], 30);
    const theirs = flashesNear(crew.filter((p) => !p.dead), 30);
    const score = (mine > 0 ? 2 : 0) + theirs;
    if (score > best) best = score;
    if (mine > 0 && theirs >= num('need', 2)) break;
  }
  game.dialogue.t = 3;
  game.districtT = 99;
  pl.hurtT = 0;
  const aim = { x: game.controls.aimX, y: game.controls.aimY };
  // Face the crew: the camera looks at the middle of whoever is still standing.
  const alive = crew.filter((p) => !p.dead);
  const look = alive.length ? { x: alive.reduce((s, p) => s + p.x, 0) / alive.length, y: alive.reduce((s, p) => s + p.y, 0) / alive.length } : aim;
  return {
    game,
    view: { mode: 'foot', aim: look, yawOffset: num('yawOff', 0.04), distK: num('distK', 0.74), heightK: num('heightK', 0.92), sideK: num('sideK', 1.05), fov: num('fov', 62), lookUp: num('lookUp', 0) },
    overlay(ctx, w, h, r3) {
      drawWorldLabels(ctx, r3);
      drawHud(ctx, game, w, h, null);
      const sp = project3d(r3, aim.x, aim.y, 13);
      drawCrosshair(ctx, sp.x, sp.y, WEAPONS.smg.spread * 60, false, true);
    },
  };
}

/** The city map midway through the story, over the dimmed 3D city. */
function mapScene(seed) {
  const game = newGame(seed, null, { shake: 1 });
  giveProgress(game, ['lowtide', 'coldcargo', 'undertow', 'bluelights'], 41250, 2600);
  game.economy.tapes = [0, 2, 3, 7, 9, 12, 15];
  game.economy.properties.penthouse = true;
  // Paper Moon is under way: Dez is out on Coral Strand and the GPS leads to Halcyon Trust.
  const m = missionById('papermoon');
  beginMission(game, m, m.stages.findIndex((s) => s.type === 'goto'));
  game.player.x = game.city.grid.bxs[2] + 40;
  game.player.y = num('py', 1700);
  game.player.angle = Math.PI / 2;
  run(game, 30);
  game.notices.length = 0;
  return {
    game,
    view: { mode: 'orbit', orbitT: 0, orbit: titleOrbit(0.2) },
    overlay(ctx, w, h) {
      drawCityMap(ctx, game, w, h, true);
    },
  };
}

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

const SCENES = { cover: coverScene, title: titleScene, onfoot: onFootScene, map: mapScene, results: resultsScene, classic: classicScene, look: lookScene, check3d: check3dScene };

/**
 * Smoke test of the real app (?shot=flow): synthetic key presses walk through the title menu,
 * a new game, walking, stealing a car, driving and drifting, a police chase, the classic camera
 * (V) and back, the pause menu and the city map; the visited screens and cameras are printed in
 * the corner and any error shows in the page's error box.
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
    230: () => tap('Escape'),
    240: () => tap('ArrowDown'),
    245: () => tap('Enter'),
    270: () => tap('Escape'),
    280: () => tap('Escape'),
    290: () => key('KeyW', 'keyup'),
    300: () => tap('KeyF'),
    330: () => tap('KeyV'),
    345: () => tap('KeyV'),
  };
  const cpu = [];
  let paintMax = 0;
  for (let f = 0; f < 360; f += 1) {
    if (script[f]) script[f]();
    frameApp(app, 1 / 60);
    if (seen[seen.length - 1] !== app.screen) seen.push(app.screen);
    views.add(`${app.view}${app.game.player.vehicle ? '-car' : '-foot'}`);
    if (app.r3 && app.view === '3d' && f > 2) {
      cpu.push(app.r3.stats.jsMs);
      paintMax = Math.max(paintMax, app.r3.stats.paintMs);
    }
  }
  const s3 = app.r3 ? app.r3.stats : {};
  const avg = cpu.length ? cpu.reduce((a, b) => a + b, 0) / cpu.length : 0;
  const ctx = canvas.getContext('2d');
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = 'rgba(0,0,0,0.7)';
  ctx.fillRect(10, 300, 900, 132);
  ctx.fillStyle = '#7dff9a';
  ctx.font = '16px monospace';
  ctx.fillText(`flow: ${seen.join(' > ')}`, 20, 322);
  ctx.fillText(`views: ${[...views].join(', ')}  wanted: ${app.game.wanted.level}`, 20, 346);
  ctx.fillText(`in car: ${!!app.game.player.vehicle}  station: ${app.audio.radio.station}  t=${app.game.t.toFixed(1)}  3d: ${app.r3 ? 'on' : 'off'}`, 20, 370);
  ctx.fillText(`3d js/frame avg ${avg.toFixed(2)} ms  max ${Math.max(0, ...cpu).toFixed(1)} ms  ground step max ${paintMax.toFixed(1)} ms  world build ${(s3.buildMs ?? 0).toFixed(0)} ms`, 20, 394);
  ctx.fillText(`static ${s3.staticTris} tris  frame ${s3.tris} tris  ${s3.draws} draws  dyn ${s3.dynVerts} verts  fx ${s3.fxVerts} verts  lights ${s3.lights}`, 20, 418);
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
