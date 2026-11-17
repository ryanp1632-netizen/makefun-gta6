// The screenshot scenes behind ?shot=<scene>&seed=<n>. Each builds a fresh world from the seed,
// sets up a moment of the story, and plays the real simulation forward for a few seconds with a
// scripted autopilot (driving, drifting, aiming, shooting) before freezing on one frame, so every
// image is the game's own renderer and HUD drawing a moment that really happened in the sim.
import { createGame, stepGame, STEP } from '../core/game.js';
import { createApp, fillStreets, frameApp, newGame } from '../core/appFlow.js';
import { createRenderer, renderWorld } from '../render/renderer.js';
import { snapCamera } from '../render/camera.js';
import { drawHud, drawCrosshair } from '../hud/hud.js';
import { drawCityMap } from '../hud/cityMap.js';
import { drawTitle } from '../ui/titleScreen.js';
import { drawResults } from '../ui/resultsScreen.js';
import { createVehicle } from '../vehicles/drivingPhysics.js';
import { setMinimumWanted } from '../police/wantedSystem.js';
import { spawnHeli } from '../police/policeDispatch.js';
import { beginMission, missionById } from '../missions/missionRunner.js';
import { sayLines } from '../missions/dialogue.js';
import { placeOnLane } from '../ai/trafficAI.js';
import { STATIONS } from '../audio/radioStations.js';
import { WEAPONS } from '../combat/weapons.js';
import { worldToScreen } from '../render/camera.js';

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

/** Golden-hour getaway: drifting a coupe through Neon Mile with cruisers and the chopper behind. */
function coverScene(seed) {
  const game = createGame(seed, { hours: 18.5 });
  const g = game.city.grid;
  giveProgress(game, ['lowtide', 'coldcargo', 'undertow', 'bluelights'], 38420, 2350);
  game.economy.tapes = [0, 3, 5, 8, 11, 14, 17];
  const m = missionById('papermoon');
  beginMission(game, m, m.stages.findIndex((s) => s.type === 'escape'));
  game.notices.length = 0;
  // Rotate the set-up a quarter turn: drive east along the avenue, turning north at a tower block.
  const ay = g.ys[5];
  const turnX = g.xs[5];
  const startX = turnX - 760;
  game.noCrimeT = 999;
  const car = createVehicle('coupe', '#ff3d6e', startX, ay + 44, 0);
  car.vx = 400;
  car.driver = 'player';
  car.lightsOn = true;
  game.vehicles.push(car);
  game.player.vehicle = car;
  game.player.armor = 45;
  game.player.hp = 78;
  game.player.weapon = 'smg';
  setMinimumWanted(game, 4, car.x, car.y);
  const cruiser = (x, y, angle, speed) => {
    const c = createVehicle('police', '#f6f6f4', x, y, angle);
    c.vx = Math.cos(angle) * speed;
    c.vy = Math.sin(angle) * speed;
    c.ai = 'police';
    c.siren = true;
    c.driver = { team: 'police' };
    c.crew = 2;
    c.path = [];
    c.pathT = 0;
    game.vehicles.push(c);
    return c;
  };
  cruiser(startX - 80, ay + 16, 0, 420);
  cruiser(startX - 150, ay + 50, 0, 420);
  cruiser(startX - 230, ay + 22, 0, 410);
  // A fourth cruiser comes down the cross street to cut the corner.
  cruiser(turnX - 16, ay - 470, Math.PI / 2, 260);
  spawnHeli(game);
  game.heli.x = startX + 520;
  game.heli.y = ay - 60;
  game.heli.lightX = startX + 300;
  game.heli.lightY = ay + 40;
  game.trafficWant = 34;
  game.pedWant = 60;
  fillStreets(game, turnX - 200, ay);
  snapCamera(game.camera, car.x, car.y, 1.0);
  game.zoomBias = 1.5;
  // Autopilot: hold the lane flat out, then throw the car into a handbrake drift at the junction.
  const lane = ay + 44;
  const query = new URLSearchParams(window.location.search);
  const driftAt = Number(query.get('drift') ?? 150);
  const hold = Number(query.get('hold') ?? 34);
  let driftStart = -1;
  for (let step = 0; step < 420; step += 1) {
    run(game, 1, (gm) => {
      const c = gm.controls;
      c.moveY = -1;
      c.aimX = car.x + 100;
      c.aimY = car.y - 100;
      if (driftStart < 0) {
        c.moveX = Math.max(-1, Math.min(1, -(car.y - lane) * 0.05));
        c.handbrake = false;
        if (car.x > turnX - driftAt) driftStart = step;
      } else {
        c.moveX = -1;
        c.handbrake = step - driftStart < 20;
      }
    });
    if (driftStart >= 0 && step - driftStart >= hold) break;
  }
  game.district = 'neon';
  game.districtT = 1.2;
  game.missions.timer = 127;
  // Frame the car with the pack behind it rather than the road ahead.
  game.camera.x = car.x - 110;
  game.camera.y = car.y + 20;
  return {
    game,
    overlay(ctx, w, h) {
      drawHud(ctx, game, w, h, { name: STATIONS[0].name, color: STATIONS[0].color });
    },
  };
}

/** The title screen over a demo drive down Strand Boulevard at golden hour. */
function titleScene(seed) {
  const game = createGame(seed, { hours: 18.3 });
  const city = game.city;
  const e = city.edges.find((ed) => ed.road.kind === 'boulevard' && city.nodes[ed.a].y > 1500 && ed.len > 200) ?? city.edges[0];
  const v = createVehicle('coupe', '#ff4f6a', 0, 0, 0);
  placeOnLane(game, v, e, e.b, 0, 60);
  v.ai = 'traffic';
  v.driver = { team: 'civ' };
  v.temper = 0.8;
  game.vehicles.push(v);
  game.player.vehicle = v;
  game.zoomBias = 1.2;
  snapCamera(game.camera, v.x, v.y, 0.95);
  fillStreets(game, v.x, v.y);
  run(game, 240, (gm) => {
    gm.player.x = v.x;
    gm.player.y = v.y;
  });
  const save = 'Ch.5 Paper Moon  ·  $31,420  ·  Day 3, 18:40';
  return { game, overlay(ctx, w, h) { drawTitle(ctx, w, h, { sel: 0, save, t: 1.2 }); } };
}

/** Night on Neon Mile: the Undertow crew ambush outside Club Voltage, SMG in hand. */
function onFootScene(seed) {
  const game = createGame(seed, { hours: 21.6 });
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
  snapCamera(game.camera, pl.x, pl.y, 1.7);
  game.zoomBias = 1.42;
  fillStreets(game, pl.x, pl.y);
  let target = null;
  const pilot = (gm, i) => {
    const c = gm.controls;
    if (!target || target.dead) target = gm.peds.filter((p) => p.hostile && !p.dead && p.team === 'gang').sort((a, b) => Math.hypot(a.x - pl.x, a.y - pl.y) - Math.hypot(b.x - pl.x, b.y - pl.y))[0];
    c.moveX = Math.sin(i / 30) * 0.6;
    c.moveY = 0.3;
    if (target) {
      c.aimX = target.x;
      c.aimY = target.y;
    }
    c.fire = i > 40;
    c.firePressed = i === 41;
    pl.hp = Math.max(pl.hp, 55);
  };
  run(game, 120, pilot);
  // Stop on a frame where the player's SMG has just fired.
  for (let i = 0; i < 30; i += 1) {
    run(game, 1, (gm) => pilot(gm, 120 + i));
    if (pl.fireT > WEAPONS.smg.rate - 0.02 && game.fx.list.some((p) => p.kind === 4 && Math.hypot(p.x - pl.x, p.y - pl.y) < 30)) break;
  }
  game.dialogue.t = 1.4;
  game.districtT = 99;
  pl.hurtT = 0;
  return {
    game,
    overlay(ctx, w, h) {
      drawHud(ctx, game, w, h, null);
      const sp = worldToScreen(game.camera, game.controls.aimX, game.controls.aimY);
      drawCrosshair(ctx, sp.x, sp.y, WEAPONS.smg.spread * 60, false);
    },
  };
}

/** The city map midway through the story. */
function mapScene(seed) {
  const game = newGame(seed, null, { shake: 1 });
  giveProgress(game, ['lowtide', 'coldcargo', 'undertow', 'bluelights'], 41250, 2600);
  game.economy.tapes = [0, 2, 3, 7, 9, 12, 15];
  game.economy.properties.penthouse = true;
  game.notices.length = 0;
  run(game, 30);
  return { game, overlay(ctx, w, h) { drawCityMap(ctx, game, w, h); } };
}

/** JOB COMPLETE after Paper Moon (an alternative fourth image). */
function resultsScene(seed) {
  const game = newGame(seed, null, { shake: 1 });
  giveProgress(game, ['lowtide', 'coldcargo', 'undertow', 'bluelights'], 29250, 2300);
  game.missions.completed.push('papermoon');
  game.missions.results = { chapter: 5, title: 'Paper Moon', payout: 12000, respect: 1100, time: 412, accuracy: 64, kills: 3, crashes: 9, topSpeed: 560 };
  run(game, 20);
  return { game, overlay(ctx, w, h) { drawResults(ctx, w, h, game, 3); } };
}

const SCENES = { cover: coverScene, title: titleScene, onfoot: onFootScene, map: mapScene, results: resultsScene };

/**
 * Smoke test of the real app (?shot=flow): synthetic key presses walk through the title menu,
 * a new game, walking, stealing a car, driving and drifting, the pause menu and the city map;
 * the visited screens are printed in the corner and any error shows in the page's error box.
 */
function flowTest(canvas) {
  const app = createApp(canvas);
  const key = (code, type) => window.dispatchEvent(new KeyboardEvent(type, { code }));
  const tap = (code) => {
    key(code, 'keydown');
    key(code, 'keyup');
  };
  const seen = [];
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
    150: () => key('Space', 'keydown'),
    170: () => key('Space', 'keyup'),
    200: () => tap('KeyE'),
    230: () => tap('Escape'),
    240: () => tap('ArrowDown'),
    245: () => tap('Enter'),
    270: () => tap('Escape'),
    280: () => tap('Escape'),
    300: () => key('KeyW', 'keyup'),
  };
  for (let f = 0; f < 330; f += 1) {
    if (script[f]) script[f]();
    frameApp(app, 1 / 60);
    if (seen[seen.length - 1] !== app.screen) seen.push(app.screen);
  }
  const ctx = canvas.getContext('2d');
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = 'rgba(0,0,0,0.7)';
  ctx.fillRect(10, 300, 620, 60);
  ctx.fillStyle = '#7dff9a';
  ctx.font = '16px monospace';
  ctx.fillText(`flow: ${seen.join(' > ')}`, 20, 322);
  ctx.fillText(`in car: ${!!app.game.player.vehicle}  station: ${app.audio.radio.station}  t=${app.game.t.toFixed(1)}`, 20, 346);
}

/** Stage `name` with `seed`, draw it to the canvas, and report when the frame is ready. */
export function runShot(name, seed, canvas) {
  if (name === 'flow') return flowTest(canvas);
  const scene = (SCENES[name] ?? coverScene)(seed);
  const renderer = createRenderer(canvas);
  renderWorld(renderer, scene.game, 999);
  scene.overlay(renderer.ctx, canvas.width, canvas.height);
  return scene;
}
