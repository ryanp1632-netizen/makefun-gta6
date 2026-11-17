// Plays the story missions: contact markers start the next job, then each stage runs until its
// goal is met (reach a point, steal a vehicle, clear a group, hold a zone, wreck a target, win a
// race, lose the cops) or a failure condition hits (timer, destroyed cargo, escaped target, the
// player going down). Finishing pays out, grants respect and opens the JOB COMPLETE screen.
import { MISSIONS, RACE_ROUTES } from './storyMissions.js';
import { clearDialogue, sayLines } from './dialogue.js';
import { addCash, addRespect, notify } from '../progression/economy.js';
import { createVehicle, forwardSpeed, vehicleSpeed } from '../vehicles/drivingPhysics.js';
import { createPed } from '../ai/pedestrianAI.js';
import { armPed } from '../ai/combatAI.js';
import { LOOKS } from '../render/characterArt.js';
import { clearWanted, setMinimumWanted } from '../police/wantedSystem.js';
import { findPath, nearestNode } from '../world/roadGraph.js';
import { isWater, pushOutOfBuildings } from '../world/collision.js';
import { placeOnLane, followLane } from '../ai/trafficAI.js';
import { clamp, wrapAngle } from '../core/math.js';

export function createMissionState() {
  return { completed: [], active: null, stage: 0, init: false, timer: null, objective: '', progress: '', groups: {}, vehicles: {}, failed: null, results: null, lawless: false, startT: 0, hold: 0, race: null, statsAtStart: null };
}

export function missionById(id) {
  return MISSIONS.find((m) => m.id === id);
}

/** The next story job, or null when the story is finished. */
export function nextMission(game) {
  return MISSIONS.find((m) => !game.missions.completed.includes(m.id)) ?? null;
}

/** A named place (landmark key, or {x, y}) as a world point. */
export function resolvePoint(game, at) {
  if (typeof at === 'object') return at;
  const p = game.city.pois[at];
  return { x: p.x, y: p.y };
}

/** A road grid reference like ['b2', 'y:2592'] as a world point. */
export function gridPoint(city, ref) {
  const g = city.grid;
  const col = (c) => (c[0] === 'b' ? g.bxs[Number(c.slice(1))] : c === 'x:last' ? g.xs[g.xs.length - 1] : g.xs[Number(c.slice(2))]);
  const row = (r) => (r === 'y:last' ? g.ys[g.ys.length - 1] : Number(r.slice(2)) > 50 ? Number(r.slice(2)) : g.ys[Number(r.slice(2))]);
  return { x: col(ref[0]), y: row(ref[1]) };
}

/** Start job `m` (at a given stage index, used to resume set pieces). */
export function beginMission(game, m, stage = 0) {
  const s = game.missions;
  s.active = m;
  s.stage = stage;
  s.init = false;
  s.timer = null;
  s.groups = {};
  s.vehicles = {};
  s.failed = null;
  s.results = null;
  s.lawless = false;
  s.startT = game.t;
  s.statsAtStart = { ...game.stats };
  if (m.night && game.clock.hours > 6 && game.clock.hours < 20.8) {
    game.clock.hours = 21;
    notify(game, 'Later that night...', '#b26bff', true);
  }
  notify(game, `CHAPTER ${m.chapter}: ${m.title.toUpperCase()}`, '#ffd166', true);
  game.events.push({ type: 'missionStart', mission: m });
}

function cleanup(game) {
  const s = game.missions;
  for (const group of Object.values(s.groups)) for (const p of group) p.mission = false;
  for (const v of Object.values(s.vehicles)) if (v !== game.player.vehicle) v.drive = null;
  s.lawless = false;
  s.race = null;
  s.timer = null;
  s.active = null;
}

/** End the current job as a failure with a reason. */
export function failMission(game, reason) {
  const s = game.missions;
  if (!s.active) return;
  s.failed = { title: s.active.title, reason, t: 0 };
  clearDialogue(game);
  game.events.push({ type: 'missionFailed', reason });
  cleanup(game);
}

function completeMission(game) {
  const s = game.missions;
  const m = s.active;
  const st = s.statsAtStart;
  s.completed.push(m.id);
  const time = game.t - s.startT;
  const shots = game.stats.shots - st.shots;
  const hits = game.stats.hits - st.hits;
  s.results = {
    chapter: m.chapter, title: m.title, payout: m.payout, respect: m.respect, time,
    accuracy: shots > 0 ? Math.round((hits / shots) * 100) : null, kills: game.stats.kills - st.kills,
    crashes: game.stats.crashes - st.crashes, topSpeed: game.stats.topSpeed,
  };
  addCash(game, m.payout, 'job payout');
  addRespect(game, m.respect, m.title);
  game.events.push({ type: 'jobComplete', mission: m });
  cleanup(game);
}

function spawnOffRoad(game, at, offset) {
  const p = resolvePoint(game, at);
  const poi = typeof at === 'string' ? game.city.pois[at] : null;
  let dx = 0;
  let dy = 1;
  if (poi && poi.building) {
    const b = poi.building;
    dx = p.x - (b.x0 + b.x1) / 2;
    dy = p.y - (b.y0 + b.y1) / 2;
    const l = Math.hypot(dx, dy) || 1;
    dx /= l;
    dy /= l;
    if (Math.abs(dx) > Math.abs(dy)) dy = 0;
    else dx = 0;
  }
  return { x: p.x + dx * offset, y: p.y + dy * offset, angle: Math.atan2(dx, -dy) };
}

function spawnGroup(game, st) {
  const c = resolvePoint(game, st.at);
  const group = [];
  const rng = game.rng;
  for (let i = 0; i < st.count; i += 1) {
    let x = c.x;
    let y = c.y;
    for (let k = 0; k < 12; k += 1) {
      const a = (i / st.count) * Math.PI * 2 + rng.range(-0.4, 0.4);
      const d = rng.range(50, st.spread ?? 140);
      x = c.x + Math.cos(a) * d;
      y = c.y + Math.sin(a) * d;
      if (!isWater(game.city, x, y)) break;
    }
    const r = pushOutOfBuildings(game.city, x, y, 8);
    const team = st.team ?? 'gang';
    const boss = st.boss && i === 0;
    const look = boss ? { skin: '#e0ac69', hair: '#d9d9d9', shirt: '#f4f1de', pants: '#1d1f24', hat: null, pattern: '#e05050' } : team === 'guard' ? LOOKS.guard : LOOKS.gang;
    const ped = createPed(r.x, r.y, team, look, { mission: true, hp: boss ? 260 : 75, boss: boss ? st.boss : null });
    armPed(ped, rng.pick(st.weapons), boss ? 0.75 : 0.5);
    ped.angle = Math.atan2(c.y - r.y, c.x - r.x);
    group.push(ped);
    game.peds.push(ped);
  }
  return group;
}

function courierDrive(game, v) {
  if (!v.route) return;
  const lane = followLane(game, v, 300);
  const sp = forwardSpeed(v);
  v.input.throttle = clamp((lane.target - sp) / 40, -1, 1);
  v.input.handbrake = false;
}

function spawnChaseTarget(game, st) {
  const pl = game.player;
  const city = game.city;
  let best = null;
  for (const e of city.edges) {
    const d = Math.hypot(e.mx - pl.x, e.my - pl.y);
    if (Math.abs(d - st.distance) < 120 && (!best || Math.abs(d - st.distance) < best.d)) best = { e, d: Math.abs(d - st.distance) };
  }
  const e = (best ?? { e: city.edges[0] }).e;
  const v = createVehicle(st.model, st.paint, 0, 0, 0);
  placeOnLane(game, v, e, e.a, 0, e.len / 2);
  v.ai = 'mission';
  v.driver = { team: 'gang', look: LOOKS.gang };
  v.drive = courierDrive;
  v.hp = v.spec.hp * 1.4;
  game.vehicles.push(v);
  return v;
}

function racerDrive(game, v) {
  const race = game.missions.race;
  if (!race || !race.started) {
    v.input.throttle = 0;
    v.input.handbrake = true;
    return;
  }
  const city = game.city;
  const path = race.nodePath;
  if (v.pathIndex >= path.length) {
    v.input.throttle = -1;
    return;
  }
  let n = city.nodes[path[v.pathIndex]];
  if (Math.hypot(n.x - v.x, n.y - v.y) < n.hw + 30) {
    v.pathIndex += 1;
    if (v.pathIndex >= path.length) return;
    n = city.nodes[path[v.pathIndex]];
  }
  const desired = Math.atan2(n.y - v.y, n.x - v.x);
  const diff = wrapAngle(desired - v.angle);
  v.input.steer = clamp(diff * 2.6, -1, 1);
  const sp = forwardSpeed(v);
  const after = path[v.pathIndex + 1] !== undefined ? city.nodes[path[v.pathIndex + 1]] : null;
  let want = v.spec.maxSpeed * (v.temper ?? 0.9);
  if (after) {
    const turn = Math.abs(wrapAngle(Math.atan2(after.y - n.y, after.x - n.x) - Math.atan2(n.y - v.y, n.x - v.x)));
    const d = Math.hypot(n.x - v.x, n.y - v.y);
    if (turn > 0.8 && d < 60 + sp * 0.55) want = 150;
  }
  if (Math.abs(diff) > 0.9) want = Math.min(want, 140);
  v.input.throttle = sp < want ? 1 : -0.8;
  v.input.handbrake = Math.abs(diff) > 1.1 && sp > 200;
}

/** Set up a street race along a named route (story or side activity). */
export function setupRace(game, routeId, rivals, story) {
  const city = game.city;
  const route = RACE_ROUTES[routeId];
  const points = route.points.map((r) => gridPoint(city, r));
  const nodes = points.map((p) => nearestNode(city, p.x, p.y).id);
  const nodePath = [nodes[0]];
  const cpIndex = [0];
  for (let i = 1; i < nodes.length; i += 1) {
    const seg = findPath(city, nodes[i - 1], nodes[i]);
    nodePath.push(...seg.slice(1));
    cpIndex.push(nodePath.length - 1);
  }
  const race = { routeId, name: route.name, points, nodePath, cpIndex, next: 1, racers: [], started: false, countdown: 3, story, finished: [], startX: points[0].x, startY: points[0].y };
  const start = city.nodes[nodes[0]];
  const second = city.nodes[nodePath[1]];
  const dx = second.x - start.x;
  const dy = second.y - start.y;
  const l = Math.hypot(dx, dy) || 1;
  const paints = ['#14b8a6', '#0f766e', '#1d1f24', '#e05050'];
  for (let i = 0; i < rivals; i += 1) {
    const row = 1 + Math.floor(i / 2);
    const side = i % 2 ? 1 : -1;
    const x = start.x + (dx / l) * (40 - row * 60) - (dy / l) * 16 * side;
    const y = start.y + (dy / l) * (40 - row * 60) + (dx / l) * 16 * side;
    const v = createVehicle(i === 0 ? 'muscle' : 'coupe', paints[i % paints.length], x, y, Math.atan2(dy, dx));
    v.ai = 'mission';
    v.driver = { team: 'gang', look: LOOKS.gang };
    v.drive = racerDrive;
    v.pathIndex = 1;
    v.temper = 0.8 + i * 0.03;
    v.racer = true;
    game.vehicles.push(v);
    race.racers.push(v);
  }
  game.missions.race = race;
  return race;
}

/** Advance a race: countdown, the player's checkpoints, rivals' progress. Returns 'won', 'lost' or null. */
export function updateRace(game, dt) {
  const race = game.missions.race;
  const pl = game.player;
  const pv = pl.vehicle;
  if (!race.started) {
    const d = pv ? Math.hypot(pv.x - race.startX, pv.y - race.startY) : Infinity;
    if (d < 110) {
      race.countdown -= dt;
      if (pv) {
        pv.vx *= 0.9;
        pv.vy *= 0.9;
      }
      if (race.countdown <= 0) {
        race.started = true;
        race.startT = game.t;
        game.events.push({ type: 'raceGo' });
      }
    }
    return null;
  }
  const cp = race.points[race.next];
  const px = pv ? pv.x : pl.x;
  const py = pv ? pv.y : pl.y;
  if (Math.hypot(px - cp.x, py - cp.y) < 85) {
    race.next += 1;
    game.events.push({ type: 'checkpoint' });
    if (race.next >= race.points.length) return 'won';
  }
  for (const r of race.racers) {
    if (r.wrecked) continue;
    if (r.pathIndex >= race.nodePath.length) return 'lost';
  }
  // Player's place: rivals past more checkpoints are ahead.
  const myIndex = race.cpIndex[race.next - 1];
  let place = 1;
  for (const r of race.racers) if (!r.wrecked && r.pathIndex - 1 > myIndex) place += 1;
  race.place = place;
  return null;
}

function stageDone(game) {
  const s = game.missions;
  s.stage += 1;
  s.init = false;
  s.timer = null;
  s.progress = '';
  if (s.stage >= s.active.stages.length) completeMission(game);
}

/** Run the active mission (or watch for the player walking into the next contact). */
export function updateMissions(game, dt) {
  const s = game.missions;
  if (s.failed) s.failed.t += dt;
  const pl = game.player;
  if (!s.active) {
    const m = nextMission(game);
    if (!m || pl.dead || s.results || (s.failed && s.failed.t < 3)) return;
    const p = resolvePoint(game, m.start);
    const px = pl.vehicle ? pl.vehicle.x : pl.x;
    const py = pl.vehicle ? pl.vehicle.y : pl.y;
    if (Math.hypot(px - p.x, py - p.y) < 34 && game.wanted.level === 0 && !s.race && (!pl.vehicle || vehicleSpeed(pl.vehicle) < 60)) beginMission(game, m);
    return;
  }
  if (pl.dead) {
    failMission(game, game.downCause === 'arrest' ? 'You were taken in' : 'You were taken out');
    return;
  }
  const m = s.active;
  const st = m.stages[s.stage];
  const first = !s.init;
  s.init = true;
  if (st.timer && first) s.timer = st.timer;
  if (s.timer !== null) {
    s.timer -= dt;
    if (s.timer <= 0) {
      failMission(game, 'Out of time');
      return;
    }
  }
  const px = pl.vehicle ? pl.vehicle.x : pl.x;
  const py = pl.vehicle ? pl.vehicle.y : pl.y;
  switch (st.type) {
    case 'talk':
      if (first) {
        sayLines(game, st.lines);
        s.objective = s.objective || m.blurb;
      }
      if (!game.dialogue.current && game.dialogue.queue.length === 0 && !first) stageDone(game);
      break;
    case 'enter': {
      s.objective = st.text;
      const want = st.vehicle ? s.vehicles[st.vehicle] : null;
      if (want && want.wrecked) failMission(game, 'The vehicle was destroyed');
      else if (pl.vehicle && (!want || pl.vehicle === want)) stageDone(game);
      break;
    }
    case 'goto': {
      s.objective = st.text;
      const p = resolvePoint(game, st.at);
      if (st.keep && s.vehicles[st.keep] && (s.vehicles[st.keep].wrecked || s.vehicles[st.keep].fireT > 0)) {
        failMission(game, 'The cargo was destroyed');
        break;
      }
      const vehOk = !st.needVehicle || (st.needVehicle === true ? !!pl.vehicle : pl.vehicle === s.vehicles[st.needVehicle]);
      if (Math.hypot(px - p.x, py - p.y) < st.r) {
        if (vehOk) stageDone(game);
        else s.progress = st.needVehicle === true ? 'You need a vehicle' : 'Bring the van!';
      }
      break;
    }
    case 'spawnVehicle': {
      const p = spawnOffRoad(game, st.at, st.offset);
      const v = createVehicle(st.model, st.paint, p.x, p.y, p.angle);
      v.ai = 'parked';
      s.vehicles[st.key] = v;
      game.vehicles.push(v);
      stageDone(game);
      break;
    }
    case 'spawnGang':
      s.groups[st.key] = spawnGroup(game, st);
      stageDone(game);
      break;
    case 'kill': {
      const group = s.groups[st.group];
      const left = group.filter((p) => !p.dead).length;
      s.objective = st.text;
      s.progress = `${group.length - left} / ${group.length} down`;
      if (left === 0) stageDone(game);
      break;
    }
    case 'hold': {
      s.objective = st.text;
      const p = resolvePoint(game, st.at);
      if (first) s.hold = 0;
      if (Math.hypot(px - p.x, py - p.y) < st.r) s.hold += dt;
      s.progress = `Vault ${Math.min(100, Math.round((s.hold / st.duration) * 100))}%`;
      if (s.hold >= st.duration) stageDone(game);
      break;
    }
    case 'wanted':
      setMinimumWanted(game, st.level);
      stageDone(game);
      break;
    case 'lawless':
      s.lawless = st.on;
      stageDone(game);
      break;
    case 'escape':
      s.objective = st.text;
      s.progress = game.wanted.level > 0 ? (game.wanted.seen ? 'They can see you' : `Out of sight ${Math.round((game.wanted.evadeT / Math.max(1, game.wanted.evadeNeed)) * 100)}%`) : '';
      if (game.wanted.level === 0) stageDone(game);
      break;
    case 'spawnChase':
      s.vehicles[st.key] = spawnChaseTarget(game, st);
      stageDone(game);
      break;
    case 'chase': {
      const v = s.vehicles[st.key];
      s.objective = st.text;
      s.progress = `Target ${Math.max(0, Math.round((v.hp / (v.spec.hp * 1.4)) * 100))}%`;
      if (v.wrecked || v.fireT > 0) stageDone(game);
      else if (Math.hypot(px - v.x, py - v.y) > st.escape) failMission(game, 'The courier got away');
      break;
    }
    case 'race': {
      if (first) setupRace(game, st.route, st.rivals, true);
      const race = s.race;
      s.objective = race.started ? `${st.text} - checkpoint ${race.next} / ${race.points.length - 1}` : 'Drive to the start line';
      s.progress = race.started ? `Position ${race.place ?? 1} / ${race.racers.length + 1}` : race.countdown < 3 ? `Starting in ${Math.ceil(race.countdown)}` : '';
      const result = updateRace(game, dt);
      if (result === 'won') stageDone(game);
      else if (result === 'lost') failMission(game, "Grieve's racer crossed the line first");
      break;
    }
    default:
      stageDone(game);
  }
}

/** Stage types the player acts on (the rest are scripting: talk, spawns, heat switches). */
const PLAYER_STAGES = new Set(['enter', 'goto', 'kill', 'hold', 'escape', 'chase', 'race']);

/**
 * Where the active job stands for the HUD: { stage, total, next } where stage is 1-based over
 * the player-facing stages and next is the objective after this one (or the payout).
 */
export function stageProgress(game) {
  const s = game.missions;
  const m = s.active;
  if (!m) return null;
  const facing = [];
  m.stages.forEach((st, i) => {
    if (PLAYER_STAGES.has(st.type)) facing.push(i);
  });
  let pos = facing.findIndex((i) => i >= s.stage);
  if (pos < 0) pos = facing.length - 1;
  const after = facing[pos + 1];
  return { stage: pos + 1, total: facing.length, next: after !== undefined ? m.stages[after].text : `Collect $${m.payout.toLocaleString('en-US')} from ${m.giver[0].toUpperCase()}${m.giver.slice(1)}` };
}

/** Markers for the renderer and the minimap: contacts, targets, checkpoints. */
export function missionMarkers(game) {
  const s = game.missions;
  const out = [];
  if (!s.active) {
    const m = nextMission(game);
    if (m) {
      const p = resolvePoint(game, m.start);
      out.push({ x: p.x, y: p.y, r: 30, color: '#ffd166', rgb: '255,209,102', kind: 'contact', label: `${m.title}`, letter: m.giver[0].toUpperCase() });
    }
    return out;
  }
  const st = s.active.stages[s.stage];
  if (!st) return out;
  if ((st.type === 'goto' || st.type === 'hold') && st.at) {
    const p = resolvePoint(game, st.at);
    out.push({ x: p.x, y: p.y, r: st.r, color: '#ffd166', rgb: '255,209,102', kind: 'target', label: st.text });
  }
  if (st.type === 'enter' && st.vehicle && s.vehicles[st.vehicle]) out.push({ x: s.vehicles[st.vehicle].x, y: s.vehicles[st.vehicle].y, r: 30, color: '#5ad8ff', rgb: '90,216,255', kind: 'vehicle', label: 'Target vehicle' });
  if (st.type === 'chase' && s.vehicles[st.key]) out.push({ x: s.vehicles[st.key].x, y: s.vehicles[st.key].y, r: 26, color: '#ff4d4d', rgb: '255,77,77', kind: 'enemy', label: 'Courier', follow: true });
  if (st.type === 'kill' && s.groups[st.group]) for (const p of s.groups[st.group]) if (!p.dead) out.push({ x: p.x, y: p.y, r: 0, color: '#ff4d4d', rgb: '255,77,77', kind: 'enemy', small: true });
  if (st.type === 'race' && s.race) {
    const race = s.race;
    const p = race.started ? race.points[race.next] : { x: race.startX, y: race.startY };
    if (p) out.push({ x: p.x, y: p.y, r: 70, color: '#ff7eb6', rgb: '255,126,182', kind: 'checkpoint', label: race.started ? 'Checkpoint' : 'Start line' });
    const after = race.points[race.next + 1];
    if (race.started && after) out.push({ x: after.x, y: after.y, r: 50, color: '#ff7eb6', rgb: '255,126,182', kind: 'checkpoint2' });
  }
  return out;
}

/** Give up the current job (from the pause menu). */
export function abandonMission(game) {
  if (game.missions.active) failMission(game, 'Job abandoned');
  clearWanted(game);
}
