// Things to do between jobs: twenty hidden Sunset Tapes, KeyCab fares when driving a taxi, two
// street races, Fresh Coat resprays that wash off the heat, the Reef & Trigger counter, the
// safehouse (save, sleep, garage) and the Azure Penthouse for sale. Also the "Press E" prompts.
import { addCash, addRespect, notify } from '../progression/economy.js';
import { clearWanted } from '../police/wantedSystem.js';
import { gridPoint, setupRace, updateRace } from './missionRunner.js';
import { RACE_ROUTES } from './storyMissions.js';
import { createVehicle, vehicleSpeed } from '../vehicles/drivingPhysics.js';
import { CAR_PAINT } from '../vehicles/vehicleModels.js';
import { sidewalkPoint } from '../world/roadGraph.js';
import { createPed } from '../ai/pedestrianAI.js';
import { randomLook } from '../render/characterArt.js';

export const TAPE_TITLES = [
  'Pastel Riot - The Lagoon Boys', 'Causeway Kiss - Mira Velour', 'Saltwater Static - DJ Barracuda', 'Night Swim - Coralline',
  'Heatwave Ledger - Velvet Ferry', 'Mangrove Radio - Los Faroles', 'Neon Tidepool - Synthia', 'Sunburn Saints - The Keys',
  'Low Tide High - Ocho Palmas', 'Pink Flamingo Blues - Rita Vane', 'Overpass Lullaby - Juniper Wave', 'Gulf Gold - Marea Alta',
  'Paper Moon - Halo Sisters', 'Deco Dreams - Nova Bay', 'Bayline Breakdown - Rustbelt Kings', 'Glass Towers - Mile High Club',
  'Riptide Romance - Sea Glass', 'Afterglow Avenue - Lumen', 'Hurricane Season - Tormenta', 'Last Light - Pearl Harbor Band',
];

const RACE_STARTS = [
  { id: 'strand', ref: ['b2', 'y:2592'], prize: 2400, respect: 220 },
  { id: 'docks', ref: ['x:1', 'y:last'], prize: 2000, respect: 200 },
];

/** Every permanent place of interest, for the minimap and city map. */
export function activityPoints(game) {
  const P = game.city.pois;
  const list = [
    { ...P.safehouse, icon: 'house', color: '#5ad8ff', label: 'Safehouse - save, sleep, garage' },
    { ...P.gunshop, icon: 'gun', color: '#ff6a4f', label: 'Reef & Trigger - weapons' },
    { ...P.respray1, icon: 'spray', color: '#7dff6a', label: 'Fresh Coat respray' },
    { ...P.respray2, icon: 'spray', color: '#7dff6a', label: 'Fresh Coat respray' },
    { ...P.respray3, icon: 'spray', color: '#7dff6a', label: 'Fresh Coat respray' },
    { ...P.penthouse, icon: 'star', color: '#3ee6ff', label: game.economy.properties.penthouse ? 'Azure Penthouse (yours)' : 'Azure Penthouse - for sale' },
    { ...P.hospital, icon: 'cross', color: '#ff5a6e', label: 'Mercy Shores Medical' },
    { ...P.police, icon: 'badge', color: '#5aa0ff', label: 'HKPD Precinct 3' },
  ];
  for (const r of RACE_STARTS) {
    const p = gridPoint(game.city, r.ref);
    list.push({ x: p.x, y: p.y, icon: 'flag', color: '#ff7eb6', label: `Street race: ${RACE_ROUTES[r.id].name}` });
  }
  return list;
}

function collectTapes(game) {
  const eco = game.economy;
  const pl = game.player;
  const px = pl.vehicle ? pl.vehicle.x : pl.x;
  const py = pl.vehicle ? pl.vehicle.y : pl.y;
  for (const tape of game.city.collectibles) {
    if (eco.tapes.includes(tape.id)) continue;
    if (Math.abs(tape.x - px) > 30 || Math.abs(tape.y - py) > 30) continue;
    eco.tapes.push(tape.id);
    notify(game, `SUNSET TAPE ${eco.tapes.length}/20  "${TAPE_TITLES[tape.id % TAPE_TITLES.length]}"`, '#ff7eb6', true);
    addCash(game, 500, 'tape');
    addRespect(game, 60);
    game.events.push({ type: 'pickup' });
    if (eco.tapes.length === game.city.collectibles.length) {
      addCash(game, 10000, 'complete mixtape');
      game.player.owned.rifle = true;
    }
  }
}

function newFare(game, taxi) {
  const city = game.city;
  for (let i = 0; i < 40; i += 1) {
    const e = city.edges[Math.floor(game.rng.next() * city.edges.length)];
    const d = Math.hypot(e.mx - taxi.x, e.my - taxi.y);
    if (d < 350 || d > 900 || e.bridge) continue;
    const p = sidewalkPoint(city, e, game.rng.sign(), e.len / 2);
    if (city.terrain.sdf(p.x, p.y) > -10) continue;
    const ped = createPed(p.x, p.y, 'civ', randomLook(game.rng), { state: 'idle', mission: true });
    game.peds.push(ped);
    game.activity = { kind: 'taxi', stage: 'pickup', x: p.x, y: p.y, ped, fares: game.activity?.fares ?? 0 };
    return;
  }
}

function updateTaxi(game, dt) {
  const a = game.activity;
  const v = game.player.vehicle;
  if (!v || v.model !== 'taxi') {
    notify(game, 'KeyCab shift over', '#ffd166');
    if (a.ped) a.ped.mission = false;
    game.activity = null;
    return;
  }
  if (a.stage === 'pickup') {
    if (a.ped.dead) {
      newFare(game, v);
      return;
    }
    if (Math.hypot(v.x - a.x, v.y - a.y) < 70 && vehicleSpeed(v) < 50) {
      a.ped.removed = true;
      const city = game.city;
      for (let i = 0; i < 60; i += 1) {
        const e = city.edges[Math.floor(game.rng.next() * city.edges.length)];
        const d = Math.hypot(e.mx - v.x, e.my - v.y);
        if (d < 800 || d > 2000 || e.bridge) continue;
        const p = sidewalkPoint(city, e, 1, e.len / 2);
        if (city.terrain.sdf(p.x, p.y) > -10) continue;
        a.stage = 'dropoff';
        a.x = p.x;
        a.y = p.y;
        a.dist = d;
        a.timer = d / 170 + 18;
        notify(game, 'Fare aboard - get them there fast', '#ffd166');
        return;
      }
    }
  } else {
    a.timer -= dt;
    if (a.timer <= 0) {
      notify(game, 'The fare jumped out without paying', '#ff7a7a');
      newFare(game, v);
    } else if (Math.hypot(v.x - a.x, v.y - a.y) < 70 && vehicleSpeed(v) < 60) {
      a.fares += 1;
      addCash(game, Math.round(60 + a.dist * 0.3 + a.timer * 8), `fare #${a.fares}`);
      addRespect(game, 25);
      newFare(game, v);
    }
  }
}

function respray(game, v) {
  const w = game.wanted;
  const cost = 150 + w.level * 250;
  if (w.level > 0 && w.seen) {
    notify(game, 'Not while they can see you!', '#ff7a7a');
    return;
  }
  if (game.economy.cash < cost) {
    notify(game, 'Fresh Coat: come back with cash', '#ff7a7a');
    return;
  }
  addCash(game, -cost, 'Fresh Coat respray');
  v.paint = CAR_PAINT[Math.floor(game.rng.next() * CAR_PAINT.length)];
  v.hp = v.spec.hp;
  v.fireT = 0;
  clearWanted(game);
  game.events.push({ type: 'respray' });
}

/** Spawn a car from the garage beside the safehouse. */
export function spawnGarageCar(game, model) {
  const home = game.city.pois.safehouse;
  const b = home.building;
  let dx = home.x - (b.x0 + b.x1) / 2;
  let dy = home.y - (b.y0 + b.y1) / 2;
  if (Math.abs(dx) > Math.abs(dy)) dy = 0;
  else dx = 0;
  const l = Math.hypot(dx, dy) || 1;
  const v = createVehicle(model, model === 'coupe' ? '#ff4f6a' : '#2f6fdf', home.x + (dx / l) * 44, home.y + (dy / l) * 44, Math.atan2(dx, -dy));
  v.ai = 'parked';
  game.vehicles.push(v);
  return v;
}

/** Proximity prompts, tapes, taxi fares and side races. */
export function updateActivities(game, dt) {
  const pl = game.player;
  const c = game.controls;
  game.prompt = null;
  if (pl.dead) return;
  collectTapes(game);
  if (game.activity && game.activity.kind === 'taxi') updateTaxi(game, dt);
  const s = game.missions;
  if (s.race && !s.race.story) {
    const r = updateRace(game, dt);
    if (r === 'won') {
      const start = RACE_STARTS.find((x) => x.id === s.race.routeId);
      notify(game, `YOU WON THE ${s.race.name.toUpperCase()}`, '#7dff9a', true);
      addCash(game, start.prize, 'race prize');
      addRespect(game, start.respect);
      for (const v of s.race.racers) v.drive = null;
      s.race = null;
    } else if (r === 'lost' || !pl.vehicle) {
      notify(game, 'Race lost', '#ff7a7a', true);
      for (const v of s.race.racers) v.drive = null;
      s.race = null;
    }
  }
  const P = game.city.pois;
  const px = pl.vehicle ? pl.vehicle.x : pl.x;
  const py = pl.vehicle ? pl.vehicle.y : pl.y;
  const near = (p, r) => Math.hypot(p.x - px, p.y - py) < r;
  if (!pl.vehicle) {
    if (near(P.gunshop, 36)) game.prompt = { text: 'E  Browse Reef & Trigger', act: () => (game.openMenu = 'shop') };
    else if (near(P.safehouse, 36)) game.prompt = { text: 'E  Safehouse: save, sleep, garage', act: () => (game.openMenu = 'safehouse') };
    else if (near(P.penthouse, 36)) {
      game.prompt = game.economy.properties.penthouse
        ? { text: 'E  Azure Penthouse: save, sleep', act: () => (game.openMenu = 'safehouse') }
        : { text: 'E  Buy the Azure Penthouse  $25,000', act: () => (game.openMenu = 'property') };
    }
  } else {
    const v = pl.vehicle;
    for (const key of ['respray1', 'respray2', 'respray3']) {
      if (near(P[key], 60)) game.prompt = { text: `E  Fresh Coat respray  $${150 + game.wanted.level * 250}`, act: () => respray(game, v) };
    }
    if (!s.active && !s.race) {
      for (const r of RACE_STARTS) {
        const p = gridPoint(game.city, r.ref);
        if (near(p, 70)) game.prompt = { text: `E  Start street race: ${RACE_ROUTES[r.id].name}`, act: () => setupRace(game, r.id, 3, false) };
      }
    }
    if (!game.prompt && v.model === 'taxi' && !s.active) {
      game.prompt = game.activity ? { text: 'E  End KeyCab shift', act: () => { game.activity = null; } } : { text: 'E  Start a KeyCab shift', act: () => newFare(game, v) };
    }
  }
  if (c.interact && game.prompt) {
    game.prompt.act();
    game.promptUsed = true;
  } else game.promptUsed = false;
}
