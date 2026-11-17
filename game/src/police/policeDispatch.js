// HKPD response: cruisers dispatched in proportion to the wanted level hunt the player along the
// road graph and ram once they have line of sight, officers bail out to fight a player on foot,
// roadblocks go up ahead of a fleeing car at three stars and a helicopter with a searchlight
// joins at four. When the heat is gone, everyone goes back to patrol.
import { clamp, wrapAngle } from '../core/math.js';
import { findPath, nearestNode } from '../world/roadGraph.js';
import { hasLineOfSight } from '../world/collision.js';
import { createVehicle, forwardSpeed, vehicleSpeed } from '../vehicles/drivingPhysics.js';
import { createPed } from '../ai/pedestrianAI.js';
import { armPed } from '../ai/combatAI.js';
import { LOOKS } from '../render/characterArt.js';
import { placeOnLane } from '../ai/trafficAI.js';

const CARS_FOR_LEVEL = [0, 1, 2, 3, 4, 5];

function playerPos(game) {
  const pl = game.player;
  return pl.vehicle ? { x: pl.vehicle.x, y: pl.vehicle.y, vx: pl.vehicle.vx, vy: pl.vehicle.vy } : { x: pl.x, y: pl.y, vx: pl.vx, vy: pl.vy };
}

/** Spawn a police cruiser on a road `minD`-`maxD` from the player, already in pursuit. */
export function spawnPoliceCar(game, minD = 650, maxD = 1150) {
  const city = game.city;
  const p = playerPos(game);
  for (let i = 0; i < 40; i += 1) {
    const e = city.edges[Math.floor(game.rng.next() * city.edges.length)];
    const d = Math.hypot(e.mx - p.x, e.my - p.y);
    if (d < minD || d > maxD) continue;
    const towardA = Math.hypot(city.nodes[e.a].x - p.x, city.nodes[e.a].y - p.y) < Math.hypot(city.nodes[e.b].x - p.x, city.nodes[e.b].y - p.y);
    const from = towardA ? e.b : e.a;
    const v = createVehicle('police', '#f6f6f4', 0, 0, 0);
    placeOnLane(game, v, e, from, 0, e.len * 0.5);
    v.ai = 'police';
    v.siren = true;
    v.lightsOn = true;
    v.driver = { team: 'police' };
    v.crew = 2;
    v.path = [];
    v.pathT = 0;
    v.vx = Math.cos(v.angle) * 200;
    v.vy = Math.sin(v.angle) * 200;
    game.vehicles.push(v);
    return v;
  }
  return null;
}

/** Officers climb out beside their car and engage on foot. */
function deployOfficers(game, v) {
  const ca = Math.cos(v.angle);
  const sa = Math.sin(v.angle);
  for (let i = 0; i < v.crew; i += 1) {
    const side = i === 0 ? 1 : -1;
    const ped = createPed(v.x - sa * 20 * side + ca * 4, v.y + ca * 20 * side + sa * 4, 'police', LOOKS.cop, { hp: 80, homeCar: v });
    armPed(ped, game.wanted.level >= 4 ? 'smg' : game.wanted.level >= 3 && i === 1 ? 'shotgun' : 'pistol', 0.55 + game.wanted.level * 0.05);
    game.peds.push(ped);
  }
  v.deployed = true;
  v.crew = 0;
}

/** Steer a pursuing cruiser: direct ram in sight, road-graph path otherwise. */
export function drivePolice(game, v, dt) {
  const p = playerPos(game);
  const city = game.city;
  const d = Math.hypot(p.x - v.x, p.y - v.y);
  const sp = forwardSpeed(v);
  const onFoot = !game.player.vehicle;
  v.input.handbrake = false;
  if (v.deployed || (onFoot && d < 150 && v.crew > 0)) {
    if (!v.deployed && Math.abs(sp) < 60) deployOfficers(game, v);
    v.input.throttle = sp > 5 ? -1 : 0;
    v.input.steer = 0;
    return;
  }
  let tx;
  let ty;
  const los = d < 480 && hasLineOfSight(city, v.x, v.y, p.x, p.y);
  if (los) {
    const lead = clamp(d / 400, 0, 0.6);
    tx = p.x + p.vx * lead;
    ty = p.y + p.vy * lead;
  } else {
    v.pathT -= dt;
    if (v.pathT <= 0 || !v.path || v.path.length === 0) {
      v.pathT = 0.7;
      const a = nearestNode(city, v.x, v.y);
      const b = nearestNode(city, p.x, p.y);
      v.path = findPath(city, a.id, b.id);
    }
    while (v.path.length > 1) {
      const n = city.nodes[v.path[0]];
      if (Math.hypot(n.x - v.x, n.y - v.y) < n.hw + 30) v.path.shift();
      else break;
    }
    const n = v.path.length ? city.nodes[v.path[0]] : { x: p.x, y: p.y };
    tx = n.x;
    ty = n.y;
  }
  const desired = Math.atan2(ty - v.y, tx - v.x);
  const diff = wrapAngle(desired - v.angle);
  v.input.steer = clamp(diff * 2.8, -1, 1);
  const sharp = Math.abs(diff);
  const want = sharp > 1.4 ? 120 : sharp > 0.7 ? 220 : v.spec.maxSpeed;
  v.input.throttle = sp < want ? 1 : -0.6;
  v.input.handbrake = sharp > 1.2 && sp > 220;
  // Unstick: back up and swing round when pinned against something.
  if (v.reverseT > 0) {
    v.reverseT -= dt;
    v.input.throttle = -1;
    v.input.steer = -v.input.steer;
    v.input.handbrake = false;
  } else if (Math.abs(sp) < 25 && v.input.throttle > 0) {
    v.stuckT += dt;
    if (v.stuckT > 1.1) {
      v.stuckT = 0;
      v.reverseT = 0.9;
    }
  } else v.stuckT = 0;
}

/** Two cruisers parked across the road ahead of a fleeing player, officers beside them. */
function placeRoadblock(game) {
  const city = game.city;
  const pv = game.player.vehicle;
  if (!pv || vehicleSpeed(pv) < 120) return false;
  const hx = pv.vx / vehicleSpeed(pv);
  const hy = pv.vy / vehicleSpeed(pv);
  let best = null;
  for (const e of city.edges) {
    const dx = e.mx - pv.x;
    const dy = e.my - pv.y;
    const ahead = dx * hx + dy * hy;
    const side = Math.abs(-dx * hy + dy * hx);
    if (ahead < 520 || ahead > 900 || side > 140 || e.len < 160) continue;
    if (!best || side < best.side) best = { e, side };
  }
  if (!best) return false;
  const e = best.e;
  for (let k = 0; k < 2; k += 1) {
    // Parked nose to tail across the carriageway, one each side of the centre line.
    const side = k ? 1 : -1;
    const v = createVehicle('police', '#f6f6f4', e.mx - e.dy * side * e.hw * 0.45, e.my + e.dx * side * e.hw * 0.45, Math.atan2(e.dx, -e.dy) + side * 0.25);
    v.ai = 'roadblock';
    v.siren = true;
    v.lightsOn = true;
    v.driver = null;
    game.vehicles.push(v);
    const ped = createPed(v.x + e.dx * 26 * (k ? 1 : -1), v.y + e.dy * 26 * (k ? 1 : -1), 'police', LOOKS.cop, { hp: 80 });
    armPed(ped, k ? 'shotgun' : 'pistol', 0.6);
    game.peds.push(ped);
  }
  game.events.push({ type: 'roadblock' });
  return true;
}

function updateHeli(game, dt) {
  const h = game.heli;
  const p = playerPos(game);
  h.rotor += dt * 40;
  const leaving = game.wanted.level < 4;
  let tx = p.x + p.vx * 0.6 + Math.cos(game.t * 0.4) * 140;
  let ty = p.y + p.vy * 0.6 + Math.sin(game.t * 0.4) * 110 - 60;
  if (leaving) {
    tx = h.x + (h.x - p.x) * 2;
    ty = h.y - 600;
  }
  const dx = tx - h.x;
  const dy = ty - h.y;
  h.vx += (dx * 0.8 - h.vx) * Math.min(1, dt * 0.9);
  h.vy += (dy * 0.8 - h.vy) * Math.min(1, dt * 0.9);
  const sp = Math.hypot(h.vx, h.vy);
  if (sp > 520) {
    h.vx *= 520 / sp;
    h.vy *= 520 / sp;
  }
  h.x += h.vx * dt;
  h.y += h.vy * dt;
  h.angle = wrapAngle(h.angle + clamp(wrapAngle(Math.atan2(p.y - h.y, p.x - h.x) - h.angle), -dt * 1.5, dt * 1.5));
  // The searchlight lags behind the player and sweeps a little.
  const sx = p.x + Math.sin(game.t * 1.7) * 40;
  const sy = p.y + Math.cos(game.t * 1.3) * 30;
  h.lightX += (sx - h.lightX) * Math.min(1, dt * 1.8);
  h.lightY += (sy - h.lightY) * Math.min(1, dt * 1.8);
  h.lit = !leaving && Math.hypot(h.lightX - p.x, h.lightY - p.y) < 75 && Math.hypot(h.x - p.x, h.y - p.y) < 700;
  if (leaving && Math.hypot(h.x - p.x, h.y - p.y) > 1600) game.heli = null;
}

/** Bring a helicopter in from the edge of the map view. */
export function spawnHeli(game) {
  const p = playerPos(game);
  const a = game.rng.range(0, Math.PI * 2);
  game.heli = { x: p.x + Math.cos(a) * 900, y: p.y + Math.sin(a) * 900, vx: 0, vy: 0, angle: a + Math.PI, rotor: 0, lightX: p.x + 200, lightY: p.y, lit: false, alt: 150 };
}

const CALL_SIGNS = ['TARPON', 'HERON', 'MARLIN', 'KESTREL', 'OSPREY', 'BARRACUDA', 'GROUPER', 'IBIS'];

/** A cruiser's radio call sign, stable for its lifetime (e.g. HERON-17). */
export function callSign(v) {
  return `${CALL_SIGNS[v.id % CALL_SIGNS.length]}-${((v.id * 7) % 40) + 10}`;
}

/**
 * The units after the player right now, nearest first: { sign, kind: 'car' | 'air' | 'foot',
 * d (world units), state }. States: RAMMING (on the bumper), PURSUIT (in sight), ROADBLOCK,
 * SPOTLIGHT / SWEEPING (the helicopter), ON FOOT (officers out of their car), SEARCHING.
 */
export function describeResponse(game) {
  const p = playerPos(game);
  const out = [];
  if (game.wanted.level === 0) return out;
  const h = game.heli;
  if (h) out.push({ sign: 'SKYHOOK-1', kind: 'air', d: Math.hypot(h.x - p.x, h.y - p.y), state: h.lit ? 'SPOTLIGHT' : 'SWEEPING' });
  for (const v of game.vehicles) {
    if (v.model !== 'police' || v.wrecked) continue;
    if (v.ai !== 'police' && v.ai !== 'roadblock' && v.ai !== 'pursuit') continue;
    const d = Math.hypot(v.x - p.x, v.y - p.y);
    if (d > 1600) continue;
    let state = 'SEARCHING';
    if (v.ai === 'roadblock') state = 'ROADBLOCK';
    else if (v.deployed) state = 'ON FOOT';
    else if (d < 80) state = 'RAMMING';
    else if (d < 480 && hasLineOfSight(game.city, v.x, v.y, p.x, p.y)) state = 'PURSUIT';
    out.push({ sign: callSign(v), kind: 'car', d, state });
  }
  let foot = 0;
  let footD = Infinity;
  for (const ped of game.peds) {
    if (ped.team !== 'police' || ped.dead || !ped.hostile) continue;
    foot += 1;
    footD = Math.min(footD, Math.hypot(ped.x - p.x, ped.y - p.y));
  }
  if (foot) out.push({ sign: `FOOT x${foot}`, kind: 'foot', d: footD, state: footD < 200 ? 'ENGAGING' : 'ON FOOT' });
  out.sort((a, b) => a.d - b.d);
  return out;
}

/** Dispatch and stand down units to match the wanted level. */
export function updatePolice(game, dt) {
  const level = game.wanted.level;
  const pd = game.policeState ?? (game.policeState = { spawnT: 0, roadblockT: 6 });
  let cars = 0;
  for (const v of game.vehicles) if (v.ai === 'police' && !v.wrecked) cars += 1;
  if (level > 0) {
    pd.spawnT -= dt;
    if (cars < CARS_FOR_LEVEL[level] && pd.spawnT <= 0) {
      spawnPoliceCar(game);
      pd.spawnT = 2.2;
    }
    if (level >= 3) {
      pd.roadblockT -= dt;
      if (pd.roadblockT <= 0) pd.roadblockT = placeRoadblock(game) ? 14 : 2;
    }
    if (level >= 4 && !game.heli) spawnHeli(game);
  } else {
    for (const v of game.vehicles) {
      if (v.ai === 'police' || v.ai === 'roadblock') {
        v.ai = v.driver ? 'patrolEnd' : 'parked';
        v.siren = false;
      }
    }
    for (const p of game.peds) if (p.team === 'police' && p.hostile) {
      p.hostile = false;
      p.state = 'walk';
      p.walk = null;
    }
  }
  if (game.heli) updateHeli(game, dt);
  // Units that lost the player for good leave the scene.
  for (const v of game.vehicles) {
    if (v.ai === 'patrolEnd') {
      v.input.throttle = 0.5;
      v.input.steer = 0;
      v.input.handbrake = false;
    }
  }
  const p = playerPos(game);
  for (let i = game.vehicles.length - 1; i >= 0; i -= 1) {
    const v = game.vehicles[i];
    if ((v.ai === 'patrolEnd' || v.ai === 'police' || v.ai === 'roadblock' || v.ai === 'parked') && v.model === 'police' && Math.hypot(v.x - p.x, v.y - p.y) > 2200) game.vehicles.splice(i, 1);
  }
}
