// Firearms and damage. Shots are hitscan rays (pellets for the shotgun) that stop at walls and
// hit the nearest person or vehicle in their path; every shot leaves a tracer, a muzzle flash and
// a gunshot event that scatters pedestrians and draws police attention.
import { rayCircle, wrapAngle } from '../core/math.js';
import { raycastBuildings } from '../world/collision.js';
import { emitBlood, emitMuzzle, emitSparks, emitTracer } from '../render/particles.js';
import { damageVehicle } from '../vehicles/drivingPhysics.js';

export const WEAPONS = {
  fists: { id: 'fists', name: 'Fists', dmg: 22, rate: 0.42, mag: 0, reload: 0, spread: 0, range: 26, pellets: 1, auto: false, price: 0, ammoPrice: 0, ammoPack: 0, level: 1, slot: 0, melee: true },
  pistol: { id: 'pistol', name: 'Kestrel 9', dmg: 24, rate: 0.24, mag: 12, reload: 1.1, spread: 0.035, range: 560, pellets: 1, auto: false, price: 0, ammoPrice: 120, ammoPack: 36, level: 1, slot: 1 },
  smg: { id: 'smg', name: 'Wasp SMG', dmg: 13, rate: 0.075, mag: 32, reload: 1.6, spread: 0.085, range: 470, pellets: 1, auto: true, price: 3500, ammoPrice: 240, ammoPack: 96, level: 2, slot: 2 },
  shotgun: { id: 'shotgun', name: 'Breaker 12', dmg: 15, rate: 0.72, mag: 6, reload: 2.0, spread: 0.24, range: 300, pellets: 7, auto: false, price: 5200, ammoPrice: 200, ammoPack: 18, level: 3, slot: 3 },
  rifle: { id: 'rifle', name: 'Marlin AR', dmg: 30, rate: 0.11, mag: 30, reload: 1.8, spread: 0.03, range: 740, pellets: 1, auto: true, price: 9500, ammoPrice: 320, ammoPack: 90, level: 4, slot: 4 },
};

export const WEAPON_ORDER = ['fists', 'pistol', 'smg', 'shotgun', 'rifle'];

/**
 * A punch: the nearest person within reach and roughly in front takes the hit and is shoved
 * back. Quiet (no gunshot event), but a witnessed assault still raises the heat.
 */
function punch(game, team, x, y, angle, shooter) {
  const w = WEAPONS.fists;
  let best = null;
  let bestD = w.range;
  for (const ped of game.peds) {
    if (ped.dead || ped === shooter) continue;
    const dx = ped.x - x;
    const dy = ped.y - y;
    const d = Math.hypot(dx, dy);
    if (d > bestD || Math.abs(wrapAngle(Math.atan2(dy, dx) - angle)) > 0.9) continue;
    best = ped;
    bestD = d;
  }
  if (team === 'player') game.stats.shots += 1;
  game.events.push({ type: 'punch', x, y, hit: !!best });
  if (!best) return;
  const nx = Math.cos(angle);
  const ny = Math.sin(angle);
  best.x += nx * 6;
  best.y += ny * 6;
  if (team === 'player') game.stats.hits += 1;
  damagePerson(game, best, w.dmg, team, nx, ny);
  if (!best.dead && best.team === 'civ') {
    best.state = 'flee';
    best.fleeT = 6;
    best.fleeX = x;
    best.fleeY = y;
  }
}

/** Hurt a person; returns true when that was the fatal hit. */
export function damagePerson(game, target, amount, source, nx = 0, ny = 0) {
  if (target.dead) return false;
  if (target === game.player) {
    if (game.player.invulnT > 0) return false;
    const absorbed = Math.min(game.player.armor, amount * 0.65);
    game.player.armor -= absorbed;
    game.player.hp -= amount - absorbed;
    game.player.hurtT = 0.35;
    emitBlood(game.fx, game.rng, target.x, target.y, nx, ny);
    if (game.player.hp <= 0) {
      game.player.hp = 0;
      game.events.push({ type: 'playerDown', cause: 'shot' });
    }
    return false;
  }
  target.hp -= amount;
  target.hurtT = 0.3;
  emitBlood(game.fx, game.rng, target.x, target.y, nx, ny);
  if (target.hp <= 0) {
    target.dead = true;
    target.deadT = 0;
    target.speed = 0;
    game.events.push({ type: 'death', ped: target, byPlayer: source === 'player', x: target.x, y: target.y });
    return true;
  }
  if (source === 'player') game.events.push({ type: 'assault', ped: target, x: target.x, y: target.y });
  return false;
}

/**
 * Fire one trigger pull of `weaponId` from (x, y) toward `angle` for `team` ('player', 'police',
 * 'gang', 'guard'). `accuracy` (0..1) scales the spread for AI shooters.
 */
export function fireShot(game, team, weaponId, x, y, angle, accuracy = 1, shooter = null) {
  const w = WEAPONS[weaponId];
  if (w.melee) {
    punch(game, team, x, y, angle, shooter);
    return;
  }
  const rng = game.rng;
  const mx = x + Math.cos(angle) * 12;
  const my = y + Math.sin(angle) * 12;
  emitMuzzle(game.fx, rng, mx, my, angle, weaponId === 'shotgun');
  game.events.push({ type: 'gunshot', x, y, team, weapon: weaponId });
  if (team === 'player') game.stats.shots += w.pellets;
  for (let p = 0; p < w.pellets; p += 1) {
    const a = wrapAngle(angle + rng.range(-1, 1) * w.spread * (2 - accuracy));
    const dx = Math.cos(a);
    const dy = Math.sin(a);
    let best = raycastBuildings(game.city, mx, my, dx, dy, w.range);
    const wallT = best;
    let hit = null;
    for (const ped of game.peds) {
      if (ped.dead || ped === shooter) continue;
      if (team !== 'player' && (ped.team === team || (team === 'police' && ped.team === 'civ'))) continue;
      if (team === 'gang' && ped.team === 'guard') continue;
      const t = rayCircle(mx, my, dx, dy, ped.x, ped.y, 8);
      if (t < best) {
        best = t;
        hit = ped;
      }
    }
    if (team !== 'player' && !game.player.dead) {
      const pv = game.player.vehicle;
      const px = pv ? pv.x : game.player.x;
      const py = pv ? pv.y : game.player.y;
      const t = rayCircle(mx, my, dx, dy, px, py, pv ? 16 : 8);
      if (t < best) {
        best = t;
        hit = pv ?? game.player;
      }
    }
    for (const v of game.vehicles) {
      if (v === game.player.vehicle && team === 'player') continue;
      if (shooter && shooter.vehicle === v) continue;
      const t = rayCircle(mx, my, dx, dy, v.x, v.y, v.spec.width * 0.6);
      if (t < best) {
        best = t;
        hit = v;
      }
    }
    const ex = mx + dx * best;
    const ey = my + dy * best;
    emitTracer(game.fx, mx, my, ex, ey);
    if (hit && hit.spec) {
      damageVehicle(game, hit, w.dmg * 0.45, team === 'player');
      emitSparks(game.fx, rng, ex, ey, -dx, -dy, 3, 140);
      if (team === 'player') {
        game.stats.hits += 1;
        if (hit.model === 'police') game.events.push({ type: 'copCarShot', x: ex, y: ey });
      }
    } else if (hit) {
      const fatal = damagePerson(game, hit, w.dmg * (team === 'player' ? 1 : 0.55), team, dx, dy);
      if (team === 'player') game.stats.hits += 1;
      if (fatal && hit.vehicle) hit.vehicle = null;
    } else if (best >= wallT - 0.5 && wallT < w.range) emitSparks(game.fx, rng, ex, ey, -dx, -dy, 2, 90);
  }
}

/** Whether `holder` (player or ped with .ammo) can shoot right now; handles auto-reload. */
export function tryFire(game, holder, dt, triggerHeld, triggerPressed) {
  const w = WEAPONS[holder.weapon];
  if (!w) return false;
  if (w.melee) {
    if (holder.fireT > 0) holder.fireT -= dt;
    if (!triggerPressed || holder.fireT > 0) return false;
    holder.fireT = w.rate;
    return true;
  }
  const slot = holder.ammo[holder.weapon];
  if (holder.reloadT > 0) {
    holder.reloadT -= dt;
    if (holder.reloadT <= 0) {
      const need = w.mag - slot.mag;
      const take = Math.min(need, slot.reserve);
      slot.mag += take;
      slot.reserve -= take;
      game.events.push({ type: 'reloaded', holder });
    }
    return false;
  }
  if (holder.fireT > 0) holder.fireT -= dt;
  const wants = w.auto ? triggerHeld : triggerPressed;
  if (!wants || holder.fireT > 0) return false;
  if (slot.mag <= 0) {
    if (slot.reserve > 0) startReload(game, holder);
    else if (triggerPressed) game.events.push({ type: 'dryfire', holder });
    return false;
  }
  slot.mag -= 1;
  holder.fireT = w.rate;
  if (slot.mag === 0 && slot.reserve > 0) holder.autoReload = true;
  return true;
}

export function startReload(game, holder) {
  const w = WEAPONS[holder.weapon];
  const slot = holder.ammo[holder.weapon];
  if (w.melee || !slot) return;
  if (holder.reloadT > 0 || slot.mag >= w.mag || slot.reserve <= 0) return;
  holder.reloadT = w.reload;
  game.events.push({ type: 'reload', holder });
}
