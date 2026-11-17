// Armed opponents on foot (police officers, Undertow crew, estate guards): close in until they
// can see the player, shoot in bursts with distance-based accuracy, back off when crowded and
// duck behind the nearest building corner to reload or when hurt, then peek out again.
import { clamp, wrapAngle } from '../core/math.js';
import { buildingsInRect, hasLineOfSight } from '../world/collision.js';
import { fireShot, tryFire, WEAPONS } from '../combat/weapons.js';
import { movePed } from './pedestrianAI.js';

const scratch = [];

/** Arm a person with a weapon and plenty of reserve ammunition. */
export function armPed(ped, weapon, accuracy = 0.6) {
  ped.weapon = weapon;
  ped.ammo = { [weapon]: { mag: WEAPONS[weapon].mag, reserve: 999 } };
  ped.accuracy = accuracy;
  ped.combat = { mode: 'advance', t: 0, coverX: 0, coverY: 0, burst: 0 };
  ped.hostile = true;
}

function findCover(game, ped, tx, ty) {
  const list = buildingsInRect(game.city, ped.x - 170, ped.y - 170, ped.x + 170, ped.y + 170, scratch);
  let best = null;
  let bestD = Infinity;
  for (const b of list) {
    if (!b.solid || b.h < 14) continue;
    for (const [cx, cy] of [[b.x0 - 11, b.y0 - 11], [b.x1 + 11, b.y0 - 11], [b.x1 + 11, b.y1 + 11], [b.x0 - 11, b.y1 + 11]]) {
      const d = Math.hypot(cx - ped.x, cy - ped.y);
      if (d > 170 || d >= bestD) continue;
      if (hasLineOfSight(game.city, tx, ty, cx, cy)) continue;
      best = { x: cx, y: cy };
      bestD = d;
    }
  }
  return best;
}

function walkTo(game, ped, tx, ty, speed, dt) {
  const dx = tx - ped.x;
  const dy = ty - ped.y;
  const d = Math.hypot(dx, dy);
  if (d < 2) {
    ped.speed = 0;
    return true;
  }
  const s = Math.min(d, speed * dt);
  if (!movePed(game, ped, (dx / d) * s, (dy / d) * s, dt)) {
    // Blocked: slide around the obstacle.
    const side = ped.id % 2 ? 1 : -1;
    movePed(game, ped, (-dy / d) * s * side, (dx / d) * s * side, dt);
  }
  return false;
}

/** Advance one hostile, armed person. */
export function updateCombatant(game, ped, dt) {
  const pl = game.player;
  const target = pl.vehicle ?? pl;
  const tx = target.x;
  const ty = target.y;
  const c = ped.combat;
  const w = WEAPONS[ped.weapon];
  const d = Math.hypot(tx - ped.x, ty - ped.y);
  const los = d < w.range && hasLineOfSight(game.city, ped.x, ped.y, tx, ty);
  ped.seesPlayer = los;
  c.t -= dt;
  const aim = Math.atan2(ty - ped.y, tx - ped.x);
  if (pl.dead) {
    ped.speed = 0;
    return;
  }
  // Officers at one star only try to make an arrest.
  if (ped.team === 'police' && game.wanted.level <= 1) {
    ped.angle = aim;
    if (d > 18) walkTo(game, ped, tx, ty, 120, dt);
    else ped.speed = 0;
    return;
  }
  if (c.mode === 'cover') {
    ped.angle = aim;
    const there = walkTo(game, ped, c.coverX, c.coverY, 150, dt);
    if (ped.reloadT > 0) tryFire(game, ped, dt, false, false);
    if ((there && c.t <= 0 && ped.reloadT <= 0) || c.t < -4) {
      c.mode = 'advance';
      c.t = 0.6;
    }
    return;
  }
  if (los) {
    ped.angle = wrapAngle(ped.angle + clamp(wrapAngle(aim - ped.angle), -dt * 8, dt * 8));
    if (d < 70) walkTo(game, ped, ped.x - (tx - ped.x), ped.y - (ty - ped.y), 80, dt);
    else if (d > w.range * 0.7) walkTo(game, ped, tx, ty, 95, dt);
    else {
      // Strafe a little while shooting.
      const side = Math.sin(game.t * 0.9 + ped.id) > 0 ? 1 : -1;
      movePed(game, ped, Math.cos(aim + Math.PI / 2) * side * 30 * dt, Math.sin(aim + Math.PI / 2) * side * 30 * dt, dt);
    }
    if (c.burst <= 0 && c.t <= 0) {
      c.burst = w.auto ? game.rng.int(3, 7) : game.rng.int(1, 3);
      c.t = game.rng.range(0.5, 1.4);
    }
    const facing = Math.abs(wrapAngle(aim - ped.angle)) < 0.25;
    if (c.burst > 0 && facing && tryFire(game, ped, dt, true, true)) {
      c.burst -= 1;
      const moving = Math.hypot(pl.vehicle ? pl.vehicle.vx : pl.vx, pl.vehicle ? pl.vehicle.vy : pl.vy) > 60;
      const acc = clamp((ped.accuracy ?? 0.6) - d / 1400 - (moving ? 0.2 : 0), 0.1, 1);
      fireShot(game, ped.team, ped.weapon, ped.x, ped.y, ped.angle, acc, ped);
    } else if (ped.reloadT > 0 || ped.fireT > 0) tryFire(game, ped, dt, false, false);
    const needCover = ped.reloadT > 0 || (ped.hp < 35 && game.rng.chance(dt * 0.6)) || (ped.ammo[ped.weapon].mag === 0);
    if (needCover && c.t <= 0) {
      const cover = findCover(game, ped, tx, ty);
      if (cover) {
        c.mode = 'cover';
        c.coverX = cover.x;
        c.coverY = cover.y;
        c.t = game.rng.range(1.2, 2.4);
      }
    }
  } else {
    ped.angle = aim;
    walkTo(game, ped, tx, ty, ped.team === 'police' ? 130 : 110, dt);
    if (ped.reloadT > 0 || ped.fireT > 0) tryFire(game, ped, dt, false, false);
  }
}
