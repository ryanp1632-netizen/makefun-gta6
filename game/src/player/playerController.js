// The player: walking and sprinting with mouse aim, shooting and reloading, switching weapons,
// getting into any vehicle (pulling the driver out if there is one) and driving it, with
// drive-by shooting from the window.
import { clamp } from '../core/math.js';
import { isWater, pushOutOfBuildings } from '../world/collision.js';
import { fireShot, startReload, tryFire, WEAPON_ORDER, WEAPONS } from '../combat/weapons.js';
import { createPed } from '../ai/pedestrianAI.js';
import { LOOKS, randomLook } from '../render/characterArt.js';
import { vehicleSpeed } from '../vehicles/drivingPhysics.js';
import { reportCrime } from '../police/wantedSystem.js';

export function createPlayer(x, y) {
  return {
    x, y, vx: 0, vy: 0, angle: 0, speed: 0, walkPhase: 0, hp: 100, armor: 0, dead: false, vehicle: null, team: 'player',
    look: LOOKS.player, weapon: 'pistol', owned: { fists: true, pistol: true, smg: false, shotgun: false, rifle: false },
    ammo: { pistol: { mag: 12, reserve: 60 }, smg: { mag: 0, reserve: 0 }, shotgun: { mag: 0, reserve: 0 }, rifle: { mag: 0, reserve: 0 } },
    fireT: 0, reloadT: 0, hurtT: 0, invulnT: 0, stamina: 1, enterT: 0,
  };
}

/** The nearest vehicle the player could get into, or null. */
export function vehicleInReach(game) {
  const pl = game.player;
  let best = null;
  let bestD = Infinity;
  for (const v of game.vehicles) {
    if (v.wrecked || v.fireT > 0) continue;
    const d = Math.hypot(v.x - pl.x, v.y - pl.y) - v.spec.length / 2;
    if (d < 22 && d < bestD && vehicleSpeed(v) < 140) {
      best = v;
      bestD = d;
    }
  }
  return best;
}

/** Climb into `v`, dragging out whoever was driving. */
export function enterVehicle(game, v) {
  const pl = game.player;
  if (v.driver && v.driver !== 'player') {
    const side = { x: Math.sin(v.angle) * (v.spec.width / 2 + 10), y: -Math.cos(v.angle) * (v.spec.width / 2 + 10) };
    const team = v.driver.team === 'police' ? 'police' : 'civ';
    const ped = createPed(v.x + side.x, v.y + side.y, team, team === 'police' ? LOOKS.cop : v.driver.look ?? randomLook(game.rng));
    ped.state = 'flee';
    ped.fleeT = 7;
    ped.fleeX = pl.x;
    ped.fleeY = pl.y;
    game.peds.push(ped);
    game.events.push({ type: 'carjack', x: v.x, y: v.y });
    reportCrime(game, v.model === 'police' ? 'copCar' : 'carjack', v.x, v.y);
  }
  v.driver = 'player';
  v.ai = null;
  v.route = null;
  v.siren = false;
  v.crew = 0;
  v.vx *= 0.3;
  v.vy *= 0.3;
  pl.vehicle = v;
  pl.reloadT = 0;
  if (pl.weapon === 'shotgun' || pl.weapon === 'rifle' || pl.weapon === 'fists') pl.weapon = pl.owned.smg ? 'smg' : 'pistol';
  game.events.push({ type: 'enterVehicle', vehicle: v });
}

/** Step out of the current vehicle on whichever side is clear. */
export function exitVehicle(game) {
  const pl = game.player;
  const v = pl.vehicle;
  if (!v) return;
  const off = v.spec.width / 2 + 10;
  const sides = [{ x: Math.sin(v.angle) * off, y: -Math.cos(v.angle) * off }, { x: -Math.sin(v.angle) * off, y: Math.cos(v.angle) * off }];
  let placed = false;
  for (const s of sides) {
    const x = v.x + s.x;
    const y = v.y + s.y;
    if (isWater(game.city, x, y)) continue;
    const r = pushOutOfBuildings(game.city, x, y, 7);
    if (r.hit && r.depth > 6) continue;
    pl.x = r.x;
    pl.y = r.y;
    placed = true;
    break;
  }
  if (!placed) {
    pl.x = v.x;
    pl.y = v.y;
  }
  v.driver = null;
  v.input.throttle = 0;
  v.input.steer = 0;
  v.input.handbrake = true;
  pl.vehicle = null;
  pl.vx = 0;
  pl.vy = 0;
  game.events.push({ type: 'exitVehicle', vehicle: v });
}

function switchWeapon(pl, dir, slot) {
  if (slot) {
    // Number keys pick a weapon slot (1-4); the fists key passes the id itself.
    const id = typeof slot === 'string' ? slot : WEAPON_ORDER.find((k) => WEAPONS[k].slot === slot);
    if (id && pl.owned[id] && (!pl.vehicle || id === 'pistol' || id === 'smg')) pl.weapon = id;
    return;
  }
  let i = WEAPON_ORDER.indexOf(pl.weapon);
  for (let k = 0; k < WEAPON_ORDER.length; k += 1) {
    i = (i + dir + WEAPON_ORDER.length) % WEAPON_ORDER.length;
    const id = WEAPON_ORDER[i];
    if (pl.owned[id] && (!pl.vehicle || id === 'pistol' || id === 'smg')) {
      pl.weapon = id;
      return;
    }
  }
}

/** Advance the player one step from the current controls. */
export function updatePlayer(game, dt) {
  const pl = game.player;
  const c = game.controls;
  pl.invulnT = Math.max(0, pl.invulnT - dt);
  pl.hurtT = Math.max(0, pl.hurtT - dt);
  if (pl.dead) return;
  if (pl.hp <= 0) {
    game.events.push({ type: 'playerDown', cause: 'hurt' });
    return;
  }
  if (c.weaponNext || c.weaponSlot) {
    const before = pl.weapon;
    switchWeapon(pl, c.weaponNext || 1, c.weaponSlot);
    if (before !== pl.weapon) {
      pl.reloadT = 0;
      game.events.push({ type: 'weaponSwitch' });
    }
  }
  if (c.reload) startReload(game, pl);
  if (pl.vehicle) {
    const v = pl.vehicle;
    v.input.throttle = clamp(-c.moveY, -1, 1);
    v.input.steer = clamp(c.moveX, -1, 1);
    v.input.handbrake = c.handbrake;
    v.lightsOn = game.light.night > 0.25;
    pl.x = v.x;
    pl.y = v.y;
    pl.vx = v.vx;
    pl.vy = v.vy;
    pl.angle = Math.atan2(c.aimY - v.y, c.aimX - v.x);
    if (c.enter && vehicleSpeed(v) < 90) exitVehicle(game);
    else if (v.wrecked || v.fireT > 0) {
      if (v.wrecked) {
        exitVehicle(game);
        pl.hp -= 35;
      } else if (c.enter) exitVehicle(game);
    }
    if ((pl.weapon === 'pistol' || pl.weapon === 'smg') && tryFire(game, pl, dt, c.fire, c.firePressed)) fireShot(game, 'player', pl.weapon, v.x, v.y, pl.angle, 0.8, pl);
    return;
  }
  // On foot.
  let mx = c.moveX;
  let my = c.moveY;
  const len = Math.hypot(mx, my);
  if (len > 1) {
    mx /= len;
    my /= len;
  }
  const sprinting = c.sprint && len > 0.1 && pl.stamina > 0.05;
  pl.stamina = clamp(pl.stamina + (sprinting ? -dt * 0.18 : dt * 0.25), 0, 1);
  const top = sprinting ? 170 : 100;
  pl.vx += (mx * top - pl.vx) * Math.min(1, dt * 12);
  pl.vy += (my * top - pl.vy) * Math.min(1, dt * 12);
  const nx = pl.x + pl.vx * dt;
  const ny = pl.y + pl.vy * dt;
  if (!isWater(game.city, nx, ny)) {
    const r = pushOutOfBuildings(game.city, nx, ny, 7);
    pl.x = r.x;
    pl.y = r.y;
  } else {
    pl.vx = 0;
    pl.vy = 0;
  }
  for (const v of game.vehicles) {
    const dx = pl.x - v.x;
    const dy = pl.y - v.y;
    const reach = v.spec.length / 2 + 6;
    if (dx * dx + dy * dy > reach * reach) continue;
    const ca = Math.cos(v.angle);
    const sa = Math.sin(v.angle);
    const lx = dx * ca + dy * sa;
    const ly = -dx * sa + dy * ca;
    const ex = v.spec.length / 2 + 6 - Math.abs(lx);
    const ey = v.spec.width / 2 + 6 - Math.abs(ly);
    if (ex > 0 && ey > 0) {
      if (ex < ey) {
        pl.x += ca * ex * Math.sign(lx);
        pl.y += sa * ex * Math.sign(lx);
      } else {
        pl.x += -sa * ey * Math.sign(ly);
        pl.y += ca * ey * Math.sign(ly);
      }
    }
  }
  pl.speed = Math.hypot(pl.vx, pl.vy);
  pl.walkPhase += pl.speed * dt * 0.32;
  pl.angle = Math.atan2(c.aimY - pl.y, c.aimX - pl.x);
  if (c.enter) {
    const v = vehicleInReach(game);
    if (v) {
      enterVehicle(game, v);
      return;
    }
  }
  if (tryFire(game, pl, dt, c.fire, c.firePressed)) fireShot(game, 'player', pl.weapon, pl.x, pl.y, pl.angle, 1, pl);
}
