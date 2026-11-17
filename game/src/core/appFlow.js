// The screens and what moves between them: title (over a demo drive through the city), play,
// pause, settings, controls, the city map, shop / safehouse / garage / property menus, the JOB
// COMPLETE results and the hospital / precinct respawn. Each frame it reads input for the active
// screen, steps the simulation when it should run, plays the sounds and draws the overlays.
import { createGame, stepGame, STEP, CITY_SEED } from './game.js';
import { createInput, readControls } from './input.js';
import { createRenderer, renderWorld } from '../render/renderer.js';
import { snapCamera, worldToScreen } from '../render/camera.js';
import { drawCrosshair, drawHud } from '../hud/hud.js';
import { drawCityMap } from '../hud/cityMap.js';
import { drawTitle, TITLE_ITEMS } from '../ui/titleScreen.js';
import { PAUSE_ITEMS, drawControls, drawListMenu, drawPause, drawSettings, shopRows } from '../ui/menus.js';
import { drawDown, drawFailed, drawResults } from '../ui/resultsScreen.js';
import { createAudio, currentStation, playEvents, setVolumes, switchStation, uiBlip, unlockAudio, updateLoops } from '../audio/audioEngine.js';
import { applySave, readSave, summarizeSave, writeSave } from '../save/saveGame.js';
import { loadSettings, SETTING_ROWS, storeSettings } from '../save/settings.js';
import { skipLine } from '../missions/dialogue.js';
import { abandonMission } from '../missions/missionRunner.js';
import { spawnGarageCar } from '../missions/sideActivities.js';
import { buyItem, garageItems, notify, shopItems, PROPERTIES } from '../progression/economy.js';
import { clearWanted } from '../police/wantedSystem.js';
import { createVehicle } from '../vehicles/drivingPhysics.js';
import { placeOnLane, populateTraffic } from '../ai/trafficAI.js';
import { populatePeds } from '../ai/pedestrianAI.js';
import { WEAPONS } from '../combat/weapons.js';
import { formatCash } from './math.js';

/** Fill the streets around a point right away (new game, title, screenshots). */
export function fillStreets(game, x, y) {
  populateTraffic(game, x, y, 900, 26, 0);
  populatePeds(game, x, y, 900, 46, 0);
}

function demoGame(seed) {
  const game = createGame(seed, { hours: 18.35 });
  const city = game.city;
  const e =city.edges.find((ed) => ed.road.kind === 'boulevard' && ed.len > 200 && city.nodes[ed.a].y > 900) ?? city.edges[0];
  const v = createVehicle('coupe', '#ff4f6a', 0, 0, 0);
  placeOnLane(game, v, e, e.b, 0, 40);
  v.ai = 'traffic';
  v.driver = { team: 'civ' };
  v.temper = 0.75;
  game.vehicles.push(v);
  game.player.vehicle = v;
  game.demo = true;
  game.zoomBias = 1.25;
  snapCamera(game.camera, v.x, v.y, 0.95);
  fillStreets(game, v.x, v.y);
  return game;
}

/** A new playable game (optionally restored from a save) at the safehouse. */
export function newGame(seed, save, settings) {
  const game = createGame(seed, { settings });
  if (save) applySave(game, save);
  const home = game.city.pois.safehouse;
  const b = home.building;
  const alongX = Math.abs(home.y - (b.y0 + b.y1) / 2) > Math.abs(home.x - (b.x0 + b.x1) / 2);
  const along = alongX ? { x: 70, y: 0 } : { x: 0, y: 70 };
  game.player.x = home.x + along.x;
  game.player.y = home.y + along.y;
  snapCamera(game.camera, game.player.x, game.player.y, 1.15);
  fillStreets(game, game.player.x, game.player.y);
  if (!save) notify(game, 'Walk into the yellow P marker to see Pearl', '#ffd166', true);
  return game;
}

export function createApp(canvas) {
  const settings = loadSettings();
  const save = readSave();
  const app = {
    canvas, renderer: createRenderer(canvas), input: createInput(canvas), audio: createAudio(), settings,
    screen: 'title', sel: save ? 0 : 1, prev: 'title', game: demoGame(CITY_SEED), save, acc: 0, t: 0, screenT: 0,
    menu: null, stationT: 0, bill: 0,
  };
  const unlock = () => {
    unlockAudio(app.audio, app.settings);
    setVolumes(app.audio, app.settings);
  };
  window.addEventListener('keydown', unlock);
  window.addEventListener('mousedown', unlock);
  return app;
}

function go(app, screen) {
  app.prev = app.screen;
  app.screen = screen;
  app.sel = 0;
  app.screenT = 0;
}

function navigate(app, count) {
  const inp = app.input;
  if (inp.take('ArrowDown') || inp.take('KeyS')) {
    app.sel = (app.sel + 1) % count;
    uiBlip(app.audio);
  }
  if (inp.take('ArrowUp') || inp.take('KeyW')) {
    app.sel = (app.sel + count - 1) % count;
    uiBlip(app.audio);
  }
  return inp.take('Enter') || inp.take('Space') || inp.take('NumpadEnter');
}

function back(app) {
  return app.input.take('Escape') || app.input.take('Backspace');
}

function respawn(app) {
  const game = app.game;
  const pl = game.player;
  const arrest = game.downCause === 'arrest';
  const poi = arrest ? game.city.pois.police : game.city.pois.hospital;
  game.economy.cash = Math.max(0, game.economy.cash - app.bill);
  if (arrest) {
    for (const k of Object.keys(pl.owned)) if (k !== 'pistol') pl.owned[k] = false;
    pl.weapon = 'pistol';
    pl.ammo.pistol = { mag: 12, reserve: 24 };
    pl.armor = 0;
  }
  pl.dead = false;
  pl.hp = 100;
  pl.vehicle = null;
  pl.x = poi.x;
  pl.y = poi.y;
  pl.vx = 0;
  pl.vy = 0;
  pl.invulnT = 3;
  game.downCause = null;
  clearWanted(game);
  game.heli = null;
  for (const p of game.peds) if (p.hostile && !p.mission) p.removed = true;
  game.vehicles = game.vehicles.filter((v) => v.ai !== 'police' && v.ai !== 'roadblock');
  snapCamera(game.camera, pl.x, pl.y, 1.15);
  fillStreets(game, pl.x, pl.y);
  game.clock.hours = (game.clock.hours + 6) % 24;
}

function openMenu(app, kind) {
  app.menu = { kind, sel: 0, msg: '' };
  if (kind === 'safehouse' && !app.game.missions.active) {
    writeSave(app.game);
    app.save = readSave();
    app.menu.msg = 'Autosaved at the safehouse';
  }
  go(app, 'menu');
}

function menuItems(app) {
  const game = app.game;
  const m = app.menu;
  if (m.kind === 'shop') return shopItems(game);
  if (m.kind === 'garage') return garageItems(game);
  if (m.kind === 'property') return [{ kind: 'property', id: 'penthouse', label: PROPERTIES.penthouse.name, price: PROPERTIES.penthouse.price, locked: false }];
  return [
    { kind: 'save', label: 'Save game' },
    { kind: 'sleep', label: 'Sleep until golden hour (18:00)', hours: 18 },
    { kind: 'sleep', label: 'Sleep until morning (08:00)', hours: 8 },
    { kind: 'garage', label: 'Garage: pick a car' },
  ];
}

function handleMenu(app) {
  const game = app.game;
  const m = app.menu;
  const items = menuItems(app);
  const confirm = navigate(app, items.length);
  if (back(app)) {
    go(app, 'play');
    return;
  }
  if (!confirm) return;
  const it = items[app.sel];
  uiBlip(app.audio, 'ok');
  if (m.kind === 'safehouse') {
    if (it.kind === 'save') {
      writeSave(game);
      app.save = readSave();
      m.msg = 'Game saved';
    } else if (it.kind === 'sleep') {
      if (game.clock.hours >= it.hours) game.clock.day += 1;
      game.clock.hours = it.hours;
      game.player.hp = 100;
      if (game.economy.properties.penthouse) game.economy.cash += PROPERTIES.penthouse.income;
      writeSave(game);
      app.save = readSave();
      go(app, 'play');
      notify(game, 'Rested and saved', '#7dff9a');
    } else openMenu(app, 'garage');
  } else if (m.kind === 'garage') {
    if (it.owned) {
      spawnGarageCar(game, it.id);
      go(app, 'play');
    } else m.msg = buyItem(game, it);
  } else m.msg = buyItem(game, it);
}

function menuTitle(kind) {
  return { shop: 'REEF & TRIGGER', safehouse: 'SAFEHOUSE', garage: 'GARAGE', property: 'FOR SALE' }[kind];
}

/** Advance the simulation by the frame's time in fixed steps. */
function runSim(app, dt) {
  const game = app.game;
  app.acc += Math.min(dt, 0.25);
  let steps = 0;
  while (app.acc >= STEP && steps < 8) {
    stepGame(game, STEP);
    app.input.flush();
    app.acc -= STEP;
    steps += 1;
  }
  if (steps === 8) app.acc = 0;
  playEvents(app.audio, game, game.frameEvents);
  game.frameEvents.length = 0;
}

function updatePlay(app, dt) {
  const game = app.game;
  const inp = app.input;
  const pl = game.player;
  if (inp.take('Escape') || inp.take('KeyP')) {
    go(app, 'pause');
    return;
  }
  if (inp.take('KeyM')) {
    go(app, 'map');
    return;
  }
  if (inp.take('Enter')) skipLine(game);
  if (pl.vehicle && !pl.dead) {
    if (inp.take('KeyQ')) {
      switchStation(app.audio, -1);
      app.stationT = 0;
    }
    if (!game.prompt && inp.peek('KeyE')) {
      inp.take('KeyE');
      switchStation(app.audio, 1);
      app.stationT = 0;
    }
  }
  const wasIn = !!pl.vehicle;
  readControls(inp, game, game.controls);
  runSim(app, dt);
  if (!wasIn && pl.vehicle) app.stationT = 0;
  app.stationT += dt;
  if (game.openMenu) {
    openMenu(app, game.openMenu);
    game.openMenu = null;
  }
  if (pl.dead && game.downT > 1.4) {
    app.bill = game.downCause === 'arrest' ? Math.min(1500, Math.round(game.economy.cash * 0.12) + 200) : Math.min(1200, Math.round(game.economy.cash * 0.1) + 150);
    go(app, 'down');
  }
  if (game.missions.results) {
    writeSave(game);
    app.save = readSave();
    go(app, 'results');
  }
}

/** One animation frame: input, simulation, audio and drawing for the current screen. */
export function frameApp(app, dt) {
  const { canvas } = app;
  const w = canvas.width;
  const h = canvas.height;
  const ctx = app.renderer.ctx;
  const inp = app.input;
  app.t += dt;
  app.screenT += dt;
  let game = app.game;
  switch (app.screen) {
    case 'title': {
      if (app.sub === 'controls' || app.sub === 'settings') {
        if (back(app) || (app.sub === 'controls' && inp.take('Enter'))) app.sub = null;
        else if (app.sub === 'settings') adjustSettings(app);
      } else if (navigate(app, TITLE_ITEMS.length)) {
        const item = TITLE_ITEMS[app.sel];
        uiBlip(app.audio, 'ok');
        if (item === 'Continue' && app.save) {
          app.game = newGame(CITY_SEED, app.save, app.settings);
          go(app, 'play');
        } else if (item === 'New Game') {
          app.game = newGame(CITY_SEED, null, app.settings);
          go(app, 'play');
        } else if (item === 'Controls') app.sub = 'controls';
        else if (item === 'Settings') {
          app.sub = 'settings';
          app.setSel = 0;
        }
      }
      game.controls.moveX = 0;
      game.controls.moveY = 0;
      runSim(app, dt);
      game = app.game;
      break;
    }
    case 'play':
      updatePlay(app, dt);
      break;
    case 'pause': {
      if (back(app) || inp.take('KeyP')) go(app, 'play');
      else if (navigate(app, PAUSE_ITEMS.length)) {
        const item = PAUSE_ITEMS[app.sel];
        uiBlip(app.audio, 'ok');
        if (item === 'Resume') go(app, 'play');
        else if (item === 'City Map') go(app, 'map');
        else if (item === 'Settings') {
          go(app, 'settings');
          app.setSel = 0;
        } else if (item === 'Controls') go(app, 'controls');
        else if (item === 'Abandon Job' && game.missions.active) {
          abandonMission(game);
          go(app, 'play');
        } else if (item === 'Quit to Title') {
          app.game = demoGame(CITY_SEED);
          app.save = readSave();
          go(app, 'title');
          app.sel = app.save ? 0 : 1;
        }
      }
      break;
    }
    case 'settings':
      if (back(app)) go(app, 'pause');
      else adjustSettings(app);
      break;
    case 'controls':
      if (back(app) || inp.take('Enter')) go(app, 'pause');
      break;
    case 'map':
      if (back(app) || inp.take('KeyM')) go(app, app.prev === 'pause' ? 'pause' : 'play');
      break;
    case 'menu':
      handleMenu(app);
      break;
    case 'results':
      if (app.screenT > 1 && (inp.take('Enter') || inp.take('Space'))) {
        game.missions.results = null;
        go(app, 'play');
      }
      break;
    case 'down':
      runSim(app, dt * 0.25);
      if (app.screenT > 1.5 && (inp.take('Enter') || inp.take('Space'))) {
        respawn(app);
        go(app, 'play');
      }
      break;
    default:
      break;
  }
  game = app.game;
  if (game.demo) {
    const v = game.player.vehicle;
    game.player.x = v.x;
    game.player.y = v.y;
  }
  // Audio: the radio is the title music and plays in cars.
  app.audio.radioOn = app.screen === 'title' || (!!game.player.vehicle && !game.player.dead && app.screen !== 'down');
  updateLoops(app.audio, game, app.screen === 'play');
  // Draw.
  renderWorld(app.renderer, game, app.screen === 'play' || app.screen === 'title' ? 2 : 1);
  const station = currentStation(app.audio);
  if (app.screen === 'title') {
    drawTitle(ctx, w, h, { sel: app.sel, save: summarizeSave(app.save), t: app.t });
    if (app.sub === 'controls') drawControls(ctx, w, h);
    if (app.sub === 'settings') drawSettings(ctx, w, h, app.setSel ?? 0, app.settings);
    inp.flush();
    return;
  }
  if (app.screen === 'map') {
    drawCityMap(ctx, game, w, h);
    inp.flush();
    return;
  }
  const showStation = game.player.vehicle && app.stationT < 4 ? { name: station.name, color: station.color } : game.player.vehicle ? { name: station.name, color: station.color } : null;
  drawHud(ctx, game, w, h, showStation);
  if (game.missions.failed) drawFailed(ctx, w, h, game.missions.failed);
  if (app.screen === 'play' && !game.player.vehicle && !game.player.dead) {
    const pl = game.player;
    const sp = worldToScreen(game.camera, game.controls.aimX, game.controls.aimY);
    drawCrosshair(ctx, sp.x, sp.y, (WEAPONS[pl.weapon].spread * 60) + pl.speed / 30, pl.reloadT > 0);
  }
  if (app.screen === 'pause') drawPause(ctx, w, h, app.sel, game);
  else if (app.screen === 'settings') drawSettings(ctx, w, h, app.setSel ?? 0, app.settings);
  else if (app.screen === 'controls') drawControls(ctx, w, h);
  else if (app.screen === 'results') drawResults(ctx, w, h, game, app.screenT);
  else if (app.screen === 'down') drawDown(ctx, w, h, game.downCause, app.bill, app.screenT);
  else if (app.screen === 'menu') {
    const items = menuItems(app);
    const rows = app.menu.kind === 'safehouse' ? items.map((it) => ({ label: it.label })) : shopRows(items, game.economy.cash);
    drawListMenu(ctx, w, h, menuTitle(app.menu.kind), rows, app.sel, app.menu.msg || 'Enter to choose  ·  Esc to leave', app.menu.kind === 'shop' ? '#ff6a4f' : '#5ad8ff', `Cash ${formatCash(game.economy.cash)}`);
  }
  if (app.screen !== 'play') inp.flush();
}

function adjustSettings(app) {
  const inp = app.input;
  const count = SETTING_ROWS.length;
  app.setSel = app.setSel ?? 0;
  if (inp.take('ArrowDown') || inp.take('KeyS')) app.setSel = (app.setSel + 1) % count;
  if (inp.take('ArrowUp') || inp.take('KeyW')) app.setSel = (app.setSel + count - 1) % count;
  const row = SETTING_ROWS[app.setSel];
  let d = 0;
  if (inp.take('ArrowRight') || inp.take('KeyD')) d = 1;
  if (inp.take('ArrowLeft') || inp.take('KeyA')) d = -1;
  if (d) {
    app.settings[row.key] = Math.round(Math.min(1, Math.max(0, app.settings[row.key] + d * row.step)) * 100) / 100;
    storeSettings(app.settings);
    setVolumes(app.audio, app.settings);
    app.game.settings = app.settings;
    uiBlip(app.audio);
  }
}
