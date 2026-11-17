// Civilian traffic: cars hold the right-hand lane of their road, pick a new road at every
// junction, slow for turns, brake for anything in front of them (honking if they are stuck too
// long), and are spawned out of sight around the player and cleared away behind them.
import { clamp, wrapAngle } from '../core/math.js';
import { chooseNextEdge, lanePoint, otherEnd, projectOnEdge } from '../world/roadGraph.js';
import { createVehicle, forwardSpeed } from '../vehicles/drivingPhysics.js';
import { CAR_PAINT, TRAFFIC_MIX } from '../vehicles/vehicleModels.js';

const CRUISE = { highway: 300, causeway: 280, avenue: 240, boulevard: 210, street: 185, lane: 140 };

/** Put a vehicle on `edge` heading away from node `from`, in `lane`, `along` units in. */
export function placeOnLane(game, v, edge, from, lane, along) {
  const p = lanePoint(game.city, edge, from, lane, along);
  v.x = p.x;
  v.y = p.y;
  v.angle = Math.atan2(p.dy, p.dx);
  v.route = { edge, from, lane, next: null };
}

function alongOf(city, edge, from, x, y) {
  const pr = projectOnEdge(city, edge, x, y);
  return edge.a === from ? pr.along : edge.len - pr.along;
}

/**
 * Steer toward a lane target `lookahead` ahead, crossing onto the next road at junctions.
 * Returns the remaining distance to the junction and whether the coming move is a turn.
 */
export function followLane(game, v, speedTarget) {
  const city = game.city;
  const r = v.route;
  const sp = Math.max(0, forwardSpeed(v));
  const along = alongOf(city, r.edge, r.from, v.x, v.y);
  const at = otherEnd(r.edge, r.from);
  const node = city.nodes[at];
  const remaining = r.edge.len - along;
  const look = 26 + sp * 0.32;
  if (!r.next && remaining < look + node.hw + 40) r.next = r.forced ?? chooseNextEdge(city, game.rng, r.edge, at);
  let target;
  if (r.next && along + look > r.edge.len - node.hw * 0.4) {
    const lane = Math.min(r.lane, r.next.lanes - 1);
    const a2 = alongOf(city, r.next, at, v.x, v.y);
    target = lanePoint(city, r.next, at, lane, Math.max(a2, 0) + look * 0.8);
    if (a2 > node.hw * 0.5) {
      r.from = at;
      r.edge = r.next;
      r.lane = lane;
      r.next = null;
      r.forced = null;
    }
  } else target = lanePoint(city, r.edge, r.from, r.lane, Math.min(along + look, r.edge.len));
  const desired = Math.atan2(target.y - v.y, target.x - v.x);
  const diff = wrapAngle(desired - v.angle);
  v.input.steer = clamp(diff * 2.4, -1, 1);
  let turning = false;
  if (r.next) {
    const s1 = r.edge.a === r.from ? 1 : -1;
    const s2 = r.next.a === at ? 1 : -1;
    turning = r.edge.dx * s1 * r.next.dx * s2 + r.edge.dy * s1 * r.next.dy * s2 < 0.5;
  }
  let target2 = speedTarget;
  if (turning && remaining < 160) target2 = Math.min(target2, 95);
  if (Math.abs(diff) > 0.6) target2 = Math.min(target2, 80);
  return { remaining, target: target2 };
}

/** Distance to the nearest obstacle in this car's path, or Infinity. */
export function obstacleAhead(game, v, range) {
  const ca = Math.cos(v.angle);
  const sa = Math.sin(v.angle);
  let best = Infinity;
  const check = (x, y, halfW, halfL) => {
    const rx = x - v.x;
    const ry = y - v.y;
    const ahead = rx * ca + ry * sa;
    if (ahead <= 0 || ahead > range + halfL) return;
    const side = -rx * sa + ry * ca;
    if (Math.abs(side) < 12 + halfW) best = Math.min(best, ahead - halfL - v.spec.length / 2);
  };
  for (const o of game.vehicles) if (o !== v && Math.abs(o.x - v.x) < range + 60 && Math.abs(o.y - v.y) < range + 60) check(o.x, o.y, o.spec.width / 2, o.spec.length / 2);
  for (const p of game.peds) if (!p.dead && Math.abs(p.x - v.x) < range && Math.abs(p.y - v.y) < range) check(p.x, p.y, 2, 4);
  const pl = game.player;
  if (!pl.vehicle && !pl.dead) check(pl.x, pl.y, 3, 4);
  return best;
}

/** Decide throttle and steering for a civilian car this step. */
export function driveTraffic(game, v, dt) {
  if (!v.route) return;
  const kind = v.route.edge.road.kind;
  const cruise = (CRUISE[kind] ?? 180) * (v.temper ?? 1) * (v.panic > 0 ? 1.35 : 1);
  const lane = followLane(game, v, cruise);
  let target = lane.target;
  const sp = forwardSpeed(v);
  if ((v.ignoreT ?? 0) > 0) v.ignoreT -= dt;
  else {
    const gap = obstacleAhead(game, v, 30 + Math.max(0, sp) * 0.7);
    if (gap < Infinity) target = Math.min(target, Math.max(0, (gap - 10) * 2.2));
  }
  if (v.panic > 0) v.panic -= dt;
  if (sp < 8 && target < 10) {
    v.stuckT += dt;
    if (v.stuckT > 4) {
      v.stuckT = 0;
      v.ignoreT = 1.4;
      game.events.push({ type: 'honk', x: v.x, y: v.y });
    }
  } else v.stuckT = 0;
  v.input.throttle = clamp((target - sp) / 50, -1, 1);
  v.input.handbrake = false;
}

/** Keep about `want` civilian cars alive in a ring around the focus point. */
export function populateTraffic(game, focusX, focusY, viewRadius, want, minD = viewRadius + 40) {
  const city = game.city;
  const rng = game.rng;
  let count = 0;
  for (let i = game.vehicles.length - 1; i >= 0; i -= 1) {
    const v = game.vehicles[i];
    if (v.ai !== 'traffic' || v.driver === 'player') continue;
    const d = Math.hypot(v.x - focusX, v.y - focusY);
    if (d > viewRadius + 900 || (v.wrecked && d > viewRadius + 200)) {
      game.vehicles.splice(i, 1);
      if (v.driver && v.driver.team) v.driver.removed = true;
    } else count += 1;
  }
  const tryLimit = minD < viewRadius ? 400 : 6;
  for (let tries = 0; count < want && tries < tryLimit; tries += 1) {
    const e = city.edges[Math.floor(rng.next() * city.edges.length)];
    const d = Math.hypot(e.mx - focusX, e.my - focusY);
    if (d < minD || d > viewRadius + 700) continue;
    const from = rng.chance(0.5) ? e.a : e.b;
    const lane = rng.int(0, e.lanes - 1);
    const along = rng.range(e.hw + 30, Math.max(e.hw + 31, e.len - e.hw - 30));
    const p = lanePoint(city, e, from, lane, along);
    if (game.vehicles.some((o) => Math.abs(o.x - p.x) < 70 && Math.abs(o.y - p.y) < 70)) continue;
    const model = rng.pick(TRAFFIC_MIX);
    const paint = model === 'taxi' ? '#f5c22e' : rng.pick(CAR_PAINT);
    const v = createVehicle(model, paint, p.x, p.y, 0);
    placeOnLane(game, v, e, from, lane, along);
    const speed = (CRUISE[e.road.kind] ?? 180) * 0.7;
    v.vx = Math.cos(v.angle) * speed;
    v.vy = Math.sin(v.angle) * speed;
    v.ai = 'traffic';
    v.driver = { team: 'civ', look: null };
    v.temper = rng.range(0.85, 1.12);
    game.vehicles.push(v);
    count += 1;
  }
}
