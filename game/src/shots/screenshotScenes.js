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
import { setMinimumWanted } from '../police/wantedSystem.js';
import { spawnHeli } from '../police/policeDispatch.js';
import { beginMission, missionById } from '../missions/missionRunner.js';
import { sayLines } from '../missions/dialogue.js';
import { placeOnLane } from '../ai/trafficAI.js';
import { STATIONS } from '../audio/radioStations.js';
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

/**
 * Golden-hour getaway: drifting west off Deco Row onto the Halcyon Causeway, three cruisers on
 * the bumper and the chopper's searchlight on the car, the sun setting into the Neon Mile skyline.
 */
function coverScene(seed) {
  const game = createGame(seed, { hours: num('hours', 18.86) });
  giveProgress(game, ['lowtide', 'coldcargo', 'undertow', 'bluelights'], 38420, 2350);
  game.economy.tapes = [0, 3, 5, 8, 11, 14, 17];
  const m = missionById('papermoon');
  beginMission(game, m, m.stages.findIndex((s) => s.type === 'escape'));
  game.notices.length = 0;
  const ay = 2592;
  const lane = ay - 44;
  const startX = num('sx', 5150);
  game.noCrimeT = 999;
  const car = createVehicle('coupe', '#ff2f6d', startX, lane, Math.PI);
  car.vx = -430;
  car.driver = 'player';
  car.lightsOn = true;
  game.vehicles.push(car);
  game.player.vehicle = car;
  game.player.armor = 45;
  game.player.hp = 78;
  game.player.weapon = 'smg';
  setMinimumWanted(game, 4, car.x, car.y);
  // The pursuit holds a staggered formation on the coupe's tail (scripted so the frame stays clean).
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
  const cruiser = (x, y, speed, back, side) => {
    const c = createVehicle('police', '#f6f6f4', x, y, Math.PI);
    c.vx = -speed;
    c.ai = 'pursuit';
    c.drive = follow(back, side);
    c.siren = true;
    c.lightsOn = true;
    c.driver = { team: 'police' };
    c.crew = 2;
    game.vehicles.push(c);
    return c;
  };
  for (const [b, s] of [[num('b1', 50), num('s1', -36)], [num('b2', 74), num('s2', 34)], [num('b3', 104), num('s3', -2)]]) {
    cruiser(startX + b, lane - s, 430, b, s);
  }
  spawnHeli(game);
  game.heli.x = startX - 150;
  game.heli.y = ay - 150;
  game.heli.angle = Math.PI * 0.85;
  game.heli.lightX = startX;
  game.heli.lightY = lane;
  game.trafficWant = 30;
  game.pedWant = 64;
  fillStreets(game, startX - 300, ay);
  // Autopilot: flat out west, then flick the tail out with the handbrake for a drift.
  const driftAt = num('drift', 4700);
  const hold = num('hold', 18);
  let driftStart = -1;
  for (let step = 0; step < 600; step += 1) {
    run(game, 1, (gm) => {
      const c = gm.controls;
      c.moveY = -1;
      c.aimX = car.x - 100;
      c.aimY = car.y;
      if (driftStart < 0) {
        c.moveX = Math.max(-1, Math.min(1, (car.y - lane) * 0.05 + Math.sin(car.angle) * 2));
        c.handbrake = false;
        if (car.x < driftAt) driftStart = step;
      } else {
        c.moveX = num('steer', 1);
        c.handbrake = step - driftStart < num('hb', 10);
      }
    });
    if (driftStart >= 0 && step - driftStart >= hold) break;
  }
  game.district = 'deco';
  game.districtT = 1.3;
  game.missions.timer = 127;
  // The chopper hangs ahead of the car, its searchlight pinned on the coupe.
  const hv = Math.atan2(car.vy, car.vx);
  const ahead = num('ha', 330);
  const right = num('hr', 70);
  game.heli.x = car.x + Math.cos(hv) * ahead - Math.sin(hv) * right;
  game.heli.y = car.y + Math.sin(hv) * ahead + Math.cos(hv) * right;
  game.heli.angle = hv + Math.PI - 0.5;
  game.heli.vx = 0;
  game.heli.vy = 0;
  game.heli.lightX = car.x + Math.cos(hv) * 6;
  game.heli.lightY = car.y + Math.sin(hv) * 6;
  // Keep civilian traffic from parking itself between the camera and the coupe.
  game.vehicles = game.vehicles.filter((v) => v.ai !== 'traffic' || Math.hypot(v.x - car.x, v.y - car.y) > 110);
  return {
    game,
    view: { mode: 'chase', distK: num('distK', 1.95), heightK: num('heightK', 2.6), fov: num('fov', 62), lookUp: num('lookUp', 8), yawOffset: num('yawOff', -0.1), heliAlt: num('halt', 175) },
    overlay(ctx, w, h, r3) {
      drawWorldLabels(ctx, r3);
      drawHud(ctx, game, w, h, { name: STATIONS[0].name, color: STATIONS[0].color });
    },
  };
}

/** The title screen over a slow cinematic orbit of the skyline at sunset. */
function titleScene(seed) {
  const game = createGame(seed, { hours: num('hours', 18.62) });
  const city = game.city;
  const e = city.edges.find((ed) => ed.road.kind === 'boulevard' && city.nodes[ed.a].y > 1500 && ed.len > 200) ?? city.edges[0];
  const v = createVehicle('coupe', '#ff4f6a', 0, 0, 0);
  placeOnLane(game, v, e, e.b, 0, 60);
  v.ai = 'traffic';
  v.driver = { team: 'civ' };
  game.vehicles.push(v);
  fillStreets(game, 5150, 2150);
  run(game, 120);
  const save = 'Ch.5 Paper Moon  ·  $31,420  ·  Day 3, 18:40';
  return {
    game,
    view: { mode: 'orbit', orbitT: 0, orbit: { ...titleOrbit(num('ta', 0), num('turn', -0.12)), h: num('th', 175), lookH: num('tlh', 100), r: num('tr', 820) }, sky: TITLE_SKY },
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
  const L = num('lat', 40);
  pl.x = club.x + out[0] * num('pout', 92) + lat[0] * L;
  pl.y = club.y + out[1] * num('pout', 92) + lat[1] * L;
  const crew = game.missions.groups.crew ?? [];
  const spots = [[16, -64], [30, -22], [12, 18], [36, 52], [20, 90], [44, -100]];
  crew.forEach((p, i) => {
    const [o, l] = spots[i % spots.length];
    p.x = club.x + out[0] * o + lat[0] * l;
    p.y = club.y + out[1] * o + lat[1] * l;
  });
  fillStreets(game, pl.x, pl.y);
  let target = null;
  // Shoot at whoever stands closest to straight ahead (toward the club).
  const ahead = Math.atan2(club.y - pl.y, club.x - pl.x);
  const off = (p) => Math.abs(Math.atan2(Math.sin(Math.atan2(p.y - pl.y, p.x - pl.x) - ahead), Math.cos(Math.atan2(p.y - pl.y, p.x - pl.x) - ahead)));
  const pilot = (gm, i) => {
    const c = gm.controls;
    if (!target || target.dead) target = gm.peds.filter((p) => p.hostile && !p.dead && p.team === 'gang').sort((a, b) => off(a) - off(b))[0];
    c.moveX = Math.sin(i / 30) * 0.5;
    c.moveY = 0.25;
    if (target) {
      c.aimX = target.x;
      c.aimY = target.y;
    }
    c.fire = i > 20;
    c.firePressed = i === 21;
    pl.hp = Math.max(pl.hp, 55);
  };
  run(game, num('steps', 60), pilot);
  // Stop on a frame where the player's SMG has just fired.
  for (let i = 0; i < 40; i += 1) {
    run(game, 1, (gm) => pilot(gm, 120 + i));
    if (pl.fireT > WEAPONS.smg.rate - 0.02 && game.fx.list.some((p) => p.kind === 4 && Math.hypot(p.x - pl.x, p.y - pl.y) < 30)) break;
  }
  game.dialogue.t = 1.4;
  game.districtT = 99;
  pl.hurtT = 0;
  const aim = { x: game.controls.aimX, y: game.controls.aimY };
  // Face the crew: the camera looks at the middle of whoever is still standing.
  const alive = crew.filter((p) => !p.dead);
  const look = alive.length ? { x: alive.reduce((s, p) => s + p.x, 0) / alive.length, y: alive.reduce((s, p) => s + p.y, 0) / alive.length } : aim;
  return {
    game,
    view: { mode: 'foot', aim: look, yawOffset: num('yawOff', 0.06), distK: num('distK', 1.1), heightK: num('heightK', 1.05), sideK: num('sideK', 1), fov: num('fov', 64) },
    overlay(ctx, w, h, r3) {
      drawWorldLabels(ctx, r3);
      drawHud(ctx, game, w, h, null);
      const sp = project3d(r3, aim.x, aim.y, 12);
      drawCrosshair(ctx, sp.x, sp.y, WEAPONS.smg.spread * 60, false);
    },
  };
}

/** The city map midway through the story, over the dimmed 3D city. */
function mapScene(seed) {
  const game = newGame(seed, null, { shake: 1 });
  giveProgress(game, ['lowtide', 'coldcargo', 'undertow', 'bluelights'], 41250, 2600);
  game.economy.tapes = [0, 2, 3, 7, 9, 12, 15];
  game.economy.properties.penthouse = true;
  game.notices.length = 0;
  run(game, 30);
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
