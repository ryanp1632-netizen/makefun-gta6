// Arcade driving: throttle and brakes along the heading, tyre grip bleeding off sideways speed
// (much less of it with the handbrake, so the tail steps out into a drift), speed-sensitive
// steering, collisions with buildings, water and other vehicles, damage, smoke, fire and the
// explosion that ends a wreck. Skid marks and tyre smoke come from the sideways slip.
import { approach, clamp, wrapAngle } from '../core/math.js';
import { VEHICLE_MODELS } from './vehicleModels.js';
import { isWater, pushOutOfBuildings } from '../world/collision.js';
import { emitEngineSmoke, emitExplosion, emitFire, emitSparks, emitSplash, emitTyreSmoke } from '../render/particles.js';

let nextVehicleId = 1;

/** A new vehicle of `model` at (x, y) facing `angle`. */
export function createVehicle(model, paint, x, y, angle) {
  const spec = VEHICLE_MODELS[model];
  return {
    id: nextVehicleId++, model, spec, paint, x, y, angle, vx: 0, vy: 0, steer: 0, hp: spec.hp,
    input: { throttle: 0, steer: 0, handbrake: false }, driver: null, ai: null, wrecked: false, fireT: 0,
    lightsOn: false, braking: false, siren: false, slip: 0, rpm: 0.2, gear: 1, skidPrev: null, stuckT: 0, wreckT: 0,
  };
}

export function resetVehicleIds() {
  nextVehicleId = 1;
}

/** Forward speed along the heading (negative when reversing). */
export function forwardSpeed(v) {
  return v.vx * Math.cos(v.angle) + v.vy * Math.sin(v.angle);
}

export function vehicleSpeed(v) {
  return Math.hypot(v.vx, v.vy);
}

/** The collision circles of a vehicle (front, middle, rear). */
export function vehicleCircles(v) {
  const s = v.spec;
  const ca = Math.cos(v.angle);
  const sa = Math.sin(v.angle);
  const r = s.width / 2 + 1;
  const d = s.length / 2 - r;
  if (v.model === 'bike') return [{ x: v.x + ca * 7, y: v.y + sa * 7, r: 6 }, { x: v.x - ca * 7, y: v.y - sa * 7, r: 6 }];
  return [{ x: v.x + ca * d, y: v.y + sa * d, r }, { x: v.x, y: v.y, r }, { x: v.x - ca * d, y: v.y - sa * d, r }];
}

/** Apply damage; an empty health bar sets the car on fire, which ends in an explosion. */
export function damageVehicle(game, v, amount, byPlayer = false) {
  if (v.wrecked) return;
  v.hp -= amount;
  if (byPlayer) v.lastHitByPlayer = true;
  if (v.hp <= 0 && v.fireT <= 0) {
    v.hp = 0;
    v.fireT = 4.5;
  }
  void game;
}

/** Blow a vehicle up: wreck it, hurt everything nearby, throw debris. */
export function explodeVehicle(game, v) {
  v.wrecked = true;
  v.hp = 0;
  v.fireT = 0;
  v.wreckT = 0;
  v.siren = false;
  emitExplosion(game.fx, game.rng, v.x, v.y, 1);
  game.events.push({ type: 'explosion', x: v.x, y: v.y, byPlayer: !!v.lastHitByPlayer });
  v.vx *= 0.3;
  v.vy *= 0.3;
}

/** Advance one vehicle by dt with its current input. */
export function stepVehicle(game, v, dt) {
  const s = v.spec;
  const inp = v.input;
  if (v.wrecked) {
    inp.throttle = 0;
    inp.steer = 0;
    v.wreckT += dt;
    if (v.wreckT < 6 && game.rng.chance(dt * 12)) emitEngineSmoke(game.fx, game.rng, v.x, v.y, true);
    if (v.wreckT < 3 && game.rng.chance(dt * 20)) emitFire(game.fx, game.rng, v.x, v.y, 1.2);
  }
  const ca = Math.cos(v.angle);
  const sa = Math.sin(v.angle);
  let fwd = v.vx * ca + v.vy * sa;
  let lat = -v.vx * sa + v.vy * ca;
  const throttle = v.wrecked ? 0 : clamp(inp.throttle, -1, 1);
  v.braking = false;
  if (throttle > 0) {
    if (fwd < -5) {
      fwd = Math.min(0, fwd + s.brake * dt);
      v.braking = true;
    } else fwd += s.accel * throttle * dt * (1 - clamp(fwd / s.maxSpeed, 0, 1) ** 2);
  } else if (throttle < 0) {
    if (fwd > 5) {
      fwd = Math.max(0, fwd + s.brake * throttle * dt);
      v.braking = true;
    } else if (fwd > -s.maxSpeed * 0.3) fwd += s.accel * 0.6 * throttle * dt;
  } else fwd = approach(fwd, 0, (30 + Math.abs(fwd) * 0.25) * dt);
  if (inp.handbrake) {
    fwd = approach(fwd, 0, 160 * dt);
    v.braking = true;
  }
  const grip = inp.handbrake ? s.grip * 0.16 : s.grip * (v.wrecked ? 1.6 : 1);
  lat -= lat * Math.min(1, grip * dt);
  v.slip = lat;
  v.vx = fwd * ca - lat * sa;
  v.vy = fwd * sa + lat * ca;
  // Steering: strongest at moderate speed, lighter near the top end, reversed in reverse.
  v.steer = approach(v.steer, clamp(inp.steer, -1, 1), dt * 5.5);
  const sp = Math.abs(fwd);
  const steerFactor = clamp(sp / 110, 0, 1) * (1 - clamp(sp / s.maxSpeed, 0, 1) * 0.42);
  const turn = v.steer * s.steer * steerFactor * Math.sign(fwd || 1) * (inp.handbrake ? 1.45 : 1);
  v.angle = wrapAngle(v.angle + turn * dt);
  const ox = v.x;
  const oy = v.y;
  v.x += v.vx * dt;
  v.y += v.vy * dt;
  // Gears and revs for the engine note.
  const ratio = clamp(sp / s.maxSpeed, 0, 1);
  v.gear = Math.min(5, 1 + Math.floor(ratio * 5));
  v.rpm = 0.22 + ((ratio * 5) % 1) * 0.7 * (v.gear < 5 ? 1 : 0.6) + (throttle > 0 ? 0.08 : 0);
  collideWorld(game, v, ox, oy);
  // Skids and smoke from sideways slip and hard braking.
  const skidding = !v.wrecked && (Math.abs(lat) > 80 || (v.braking && sp > 200) || (inp.handbrake && sp > 60));
  const rear = [-s.length * 0.36, s.width * 0.36];
  const wheels = [
    { x: v.x + Math.cos(v.angle) * rear[0] - Math.sin(v.angle) * rear[1], y: v.y + Math.sin(v.angle) * rear[0] + Math.cos(v.angle) * rear[1] },
    { x: v.x + Math.cos(v.angle) * rear[0] + Math.sin(v.angle) * rear[1], y: v.y + Math.sin(v.angle) * rear[0] - Math.cos(v.angle) * rear[1] },
  ];
  if (skidding) {
    if (v.skidPrev && game.paintSkid) {
      for (let i = 0; i < 2; i += 1) game.paintSkid(v.skidPrev[i].x, v.skidPrev[i].y, wheels[i].x, wheels[i].y, Math.min(0.6, 0.22 + Math.abs(lat) / 500), v.model === 'bike' ? 2.4 : 3.8);
    }
    v.skidPrev = wheels;
    if (Math.abs(lat) > 120 && game.rng.chance(dt * 30)) {
      emitTyreSmoke(game.fx, game.rng, wheels[0].x, wheels[0].y, v.vx, v.vy);
      emitTyreSmoke(game.fx, game.rng, wheels[1].x, wheels[1].y, v.vx, v.vy);
    }
  } else v.skidPrev = null;
  v.skidding = skidding;
  if (!v.wrecked) {
    const health = v.hp / s.hp;
    const fx = v.x + Math.cos(v.angle) * s.length * 0.35;
    const fy = v.y + Math.sin(v.angle) * s.length * 0.35;
    if (health < 0.5 && game.rng.chance(dt * (health < 0.25 ? 18 : 7))) emitEngineSmoke(game.fx, game.rng, fx, fy, health < 0.25);
    if (v.fireT > 0) {
      v.fireT -= dt;
      if (game.rng.chance(dt * 30)) emitFire(game.fx, game.rng, fx, fy, 0.9);
      if (v.fireT <= 0) explodeVehicle(game, v);
    }
  }
}

function collideWorld(game, v, ox, oy) {
  const city = game.city;
  if (isWater(city, v.x, v.y)) {
    v.x = ox;
    v.y = oy;
    const sp = Math.hypot(v.vx, v.vy);
    if (sp > 60) {
      emitSplash(game.fx, game.rng, v.x + v.vx * 0.05, v.y + v.vy * 0.05, 10);
      game.events.push({ type: 'splash', x: v.x, y: v.y });
    }
    v.vx *= -0.3;
    v.vy *= -0.3;
    return;
  }
  for (const c of vehicleCircles(v)) {
    const res = pushOutOfBuildings(city, c.x, c.y, c.r);
    if (!res.hit) continue;
    const dx = res.x - c.x;
    const dy = res.y - c.y;
    v.x += dx;
    v.y += dy;
    const impact = -(v.vx * res.nx + v.vy * res.ny);
    if (impact > 0) {
      v.vx += res.nx * impact * 1.3;
      v.vy += res.ny * impact * 1.3;
      v.vx *= 0.82;
      v.vy *= 0.82;
      // Glancing blows twist the car away from the wall.
      const side = (c.x - v.x) * res.ny - (c.y - v.y) * res.nx;
      v.angle = wrapAngle(v.angle + clamp(side * impact * 0.00006, -0.08, 0.08));
      if (impact > 90) {
        damageVehicle(game, v, (impact - 90) * 0.1, v.driver === 'player');
        emitSparks(game.fx, game.rng, c.x - res.nx * c.r, c.y - res.ny * c.r, res.nx, res.ny, Math.min(14, 3 + impact / 40));
        game.events.push({ type: 'crash', x: v.x, y: v.y, power: impact, vehicle: v });
      }
    }
  }
}

/** Resolve car-to-car contacts for all vehicles near the action. */
export function collideVehicles(game, list) {
  for (let i = 0; i < list.length; i += 1) {
    const a = list[i];
    for (let j = i + 1; j < list.length; j += 1) {
      const b = list[j];
      const reach = (a.spec.length + b.spec.length) * 0.5 + 2;
      const dx0 = b.x - a.x;
      const dy0 = b.y - a.y;
      if (dx0 * dx0 + dy0 * dy0 > reach * reach) continue;
      const ca = vehicleCircles(a);
      const cb = vehicleCircles(b);
      let best = null;
      for (const p of ca) {
        for (const q of cb) {
          const dx = q.x - p.x;
          const dy = q.y - p.y;
          const d = Math.hypot(dx, dy);
          const pen = p.r + q.r - d;
          if (pen > 0 && (!best || pen > best.pen)) best = { pen, nx: d > 0.01 ? dx / d : 1, ny: d > 0.01 ? dy / d : 0, x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 };
        }
      }
      if (!best) continue;
      const ma = a.spec.mass * (a.wrecked ? 1.5 : 1);
      const mb = b.spec.mass * (b.wrecked ? 1.5 : 1);
      const total = ma + mb;
      a.x -= best.nx * best.pen * (mb / total);
      a.y -= best.ny * best.pen * (mb / total);
      b.x += best.nx * best.pen * (ma / total);
      b.y += best.ny * best.pen * (ma / total);
      const rel = (b.vx - a.vx) * best.nx + (b.vy - a.vy) * best.ny;
      if (rel < 0) {
        const imp = (-(1 + 0.35) * rel) / (1 / ma + 1 / mb);
        a.vx -= (imp / ma) * best.nx;
        a.vy -= (imp / ma) * best.ny;
        b.vx += (imp / mb) * best.nx;
        b.vy += (imp / mb) * best.ny;
        const power = -rel;
        if (power > 70) {
          const byPlayer = a.driver === 'player' || b.driver === 'player';
          damageVehicle(game, a, (power - 70) * 0.09 * (mb / total) * 2, byPlayer);
          damageVehicle(game, b, (power - 70) * 0.09 * (ma / total) * 2, byPlayer);
          emitSparks(game.fx, game.rng, best.x, best.y, -best.nx, -best.ny, Math.min(16, 4 + power / 30));
          game.events.push({ type: 'crash', x: best.x, y: best.y, power, a, b });
        }
      }
    }
  }
}
