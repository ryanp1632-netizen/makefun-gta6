// Pedestrians: civilians stroll the sidewalks from corner to corner, scatter or cower when shots
// ring out or cars plough onto the pavement, and are spawned and cleared in a ring around the
// player. Armed people (police, the Undertow crew, guards) are steered by combatAI instead.
import { clamp } from '../core/math.js';
import { chooseNextEdge, nearestNode, projectOnEdge, sidewalkPoint } from '../world/roadGraph.js';
import { isWater, pushOutOfBuildings } from '../world/collision.js';
import { randomLook } from '../render/characterArt.js';

let nextPedId = 1;

export function resetPedIds() {
  nextPedId = 1;
}

/** A person at (x, y) on `team` ('civ', 'police', 'gang', 'guard', 'ally'). */
export function createPed(x, y, team, look, extra = {}) {
  return {
    id: nextPedId++, x, y, angle: 0, speed: 0, walkPhase: 0, team, look, hp: team === 'civ' ? 40 : 70, dead: false, deadT: 0,
    state: 'walk', walk: null, fleeT: 0, fleeX: 0, fleeY: 0, weapon: null, ammo: {}, fireT: 0, reloadT: 0, hurtT: 0, hostile: false, ...extra,
  };
}

/** Put a civilian on the sidewalk of an edge, walking one way along it. */
export function assignSidewalk(game, ped, edge, side, dir) {
  ped.walk = { edge, side, dir };
  ped.state = 'walk';
}

function moveToward(game, ped, tx, ty, speed, dt) {
  const dx = tx - ped.x;
  const dy = ty - ped.y;
  const d = Math.hypot(dx, dy);
  if (d < 0.5) {
    ped.speed = 0;
    return;
  }
  const step = Math.min(d, speed * dt);
  movePed(game, ped, (dx / d) * step, (dy / d) * step, dt);
  ped.angle = Math.atan2(dy, dx);
}

/** Move a person by (mx, my), sliding along walls and refusing to walk into the sea. */
export function movePed(game, ped, mx, my, dt) {
  const nx = ped.x + mx;
  const ny = ped.y + my;
  if (isWater(game.city, nx, ny)) {
    ped.speed = 0;
    return false;
  }
  const res = pushOutOfBuildings(game.city, nx, ny, 6);
  ped.x = res.x;
  ped.y = res.y;
  const moved = Math.hypot(mx, my);
  ped.speed = dt > 0 ? moved / dt : 0;
  ped.walkPhase += moved * 0.32;
  return !res.hit;
}

/** Scatter civilians around (x, y): most run, some drop and cover. */
export function alarmPeds(game, x, y, radius) {
  for (const ped of game.peds) {
    if (ped.dead || ped.team !== 'civ' || ped.removed) continue;
    const d = Math.hypot(ped.x - x, ped.y - y);
    if (d > radius) continue;
    if (ped.state !== 'flee' && ped.state !== 'cower') {
      ped.state = game.rng.chance(0.2) ? 'cower' : 'flee';
      if (ped.state === 'flee' && game.rng.chance(0.3)) game.events.push({ type: 'scream', x: ped.x, y: ped.y });
    }
    ped.fleeT = game.rng.range(4, 8);
    ped.fleeX = x;
    ped.fleeY = y;
  }
  for (const v of game.vehicles) if (v.ai === 'traffic' && Math.hypot(v.x - x, v.y - y) < radius) v.panic = 6;
}

function resumeWalking(game, ped) {
  const node = nearestNode(game.city, ped.x, ped.y);
  const eid = node.edges[Math.floor(game.rng.next() * node.edges.length)];
  const edge = game.city.edges[eid];
  assignSidewalk(game, ped, edge, game.rng.sign(), edge.a === node.id ? 1 : -1);
}

/** Advance a civilian one step. */
export function updateCivilian(game, ped, dt) {
  if (ped.state === 'flee') {
    ped.fleeT -= dt;
    const dx = ped.x - ped.fleeX;
    const dy = ped.y - ped.fleeY;
    const d = Math.hypot(dx, dy) || 1;
    const wob = Math.sin(game.t * 2 + ped.id) * 0.5;
    const ax = dx / d;
    const ay = dy / d;
    const mx = ax * Math.cos(wob) - ay * Math.sin(wob);
    const my = ax * Math.sin(wob) + ay * Math.cos(wob);
    if (!movePed(game, ped, mx * 125 * dt, my * 125 * dt, dt)) {
      ped.fleeX = ped.x - my * 50;
      ped.fleeY = ped.y + mx * 50;
    }
    ped.angle = Math.atan2(my, mx);
    if (ped.fleeT <= 0) resumeWalking(game, ped);
    return;
  }
  if (ped.state === 'cower') {
    ped.speed = 0;
    ped.fleeT -= dt;
    if (ped.fleeT <= 0) resumeWalking(game, ped);
    return;
  }
  if (ped.state === 'idle') {
    ped.speed = 0;
    return;
  }
  if (!ped.walk) {
    resumeWalking(game, ped);
    return;
  }
  const w = ped.walk;
  const city = game.city;
  const pr = projectOnEdge(city, w.edge, ped.x, ped.y);
  const end = w.dir > 0 ? w.edge.len - 2 : 2;
  if ((w.dir > 0 && pr.along >= end) || (w.dir < 0 && pr.along <= end)) {
    const at = w.dir > 0 ? w.edge.b : w.edge.a;
    const next = chooseNextEdge(city, game.rng, w.edge, at);
    w.dir = next.a === at ? 1 : -1;
    w.edge = next;
    if (game.rng.chance(0.3)) w.side = -w.side;
    return;
  }
  const target = sidewalkPoint(city, w.edge, w.side, clamp(pr.along + w.dir * 24, 0, w.edge.len));
  moveToward(game, ped, target.x, target.y, ped.pace ?? 38, dt);
}

/** Keep about `want` civilians alive around the focus; clear the far and the long dead. */
export function populatePeds(game, fx, fy, viewRadius, want, minD = viewRadius * 0.55) {
  const rng = game.rng;
  let count = 0;
  for (let i = game.peds.length - 1; i >= 0; i -= 1) {
    const p = game.peds[i];
    const d = Math.hypot(p.x - fx, p.y - fy);
    if (p.removed || (p.team === 'civ' && d > viewRadius + 700) || (p.dead && p.deadT > 25 && d > viewRadius) || (!p.mission && p.team !== 'civ' && d > viewRadius + 1600)) {
      game.peds.splice(i, 1);
      continue;
    }
    if (p.team === 'civ' && !p.dead) count += 1;
  }
  const city = game.city;
  const tryLimit = minD < viewRadius * 0.5 ? 600 : 8;
  for (let tries = 0; count < want && tries < tryLimit; tries += 1) {
    const e = city.edges[Math.floor(rng.next() * city.edges.length)];
    if (e.bridge) continue;
    const side = rng.sign();
    const along = rng.range(e.hw + 20, Math.max(e.hw + 21, e.len - e.hw - 20));
    const p = sidewalkPoint(city, e, side, along);
    const d = Math.hypot(p.x - fx, p.y - fy);
    if (d < minD || d > viewRadius + 500 || city.terrain.sdf(p.x, p.y) > -10) continue;
    const ped = createPed(p.x, p.y, 'civ', randomLook(rng), { pace: rng.range(30, 46) });
    assignSidewalk(game, ped, e, side, rng.sign());
    game.peds.push(ped);
    count += 1;
  }
}
