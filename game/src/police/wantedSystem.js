// Heat: crimes that someone witnesses raise the wanted level (1-5 stars). While any unit can
// see the player the search zone re-centres on them; once out of sight and outside the zone a
// countdown runs and the stars fade. Standing still beside an officer at low heat means cuffs.
import { hasLineOfSight } from '../world/collision.js';

const CRIMES = {
  gunfire: { min: 1, add: 0.12 },
  assault: { min: 1, add: 0.4 },
  murder: { min: 2, add: 0.8 },
  carjack: { min: 1, add: 0.3 },
  runOver: { min: 1, add: 0.5 },
  copAssault: { min: 2, add: 0.5 },
  copKill: { min: 3, add: 1 },
  explosion: { min: 2, add: 0.6 },
  copCar: { min: 2, add: 0.25 },
};

export function createWanted() {
  return { level: 0, heat: 0, zoneX: 0, zoneY: 0, zoneR: 0, seen: false, evadeT: 0, evadeNeed: 0, arrestT: 0, flashT: 0, lastLevel: 0 };
}

/** Radius of the search zone at a wanted level. */
export function zoneRadius(level) {
  return 260 + level * 90;
}

/** Raise the wanted level to at least `level` (missions and scripted heat). */
export function setMinimumWanted(game, level, x = game.player.x, y = game.player.y) {
  const w = game.wanted;
  if (level <= w.level) return;
  w.level = Math.min(5, level);
  w.heat = Math.max(w.heat, w.level);
  w.zoneX = x;
  w.zoneY = y;
  w.zoneR = zoneRadius(w.level);
  w.evadeT = 0;
  w.flashT = 1.5;
  game.events.push({ type: 'wantedUp', level: w.level });
}

function witnessed(game, x, y) {
  if (game.wanted.level > 0) return true;
  for (const p of game.peds) {
    if (p.dead || p.removed) continue;
    const d = Math.hypot(p.x - x, p.y - y);
    if (d < (p.team === 'police' ? 520 : 300) && hasLineOfSight(game.city, p.x, p.y, x, y)) return true;
  }
  for (const v of game.vehicles) if (v.model === 'police' && !v.wrecked && Math.hypot(v.x - x, v.y - y) < 520) return true;
  return false;
}

/** Report a crime by the player at (x, y); raises heat if anyone saw it. */
export function reportCrime(game, kind, x, y) {
  if (game.noCrimeT > 0) return;
  const c = CRIMES[kind];
  if (!c || !witnessed(game, x, y)) return;
  const w = game.wanted;
  w.heat = Math.min(5.99, Math.max(w.heat, c.min) + c.add);
  const level = Math.min(5, Math.max(c.min, Math.floor(w.heat)));
  if (level > w.level) setMinimumWanted(game, level, x, y);
  else {
    w.zoneX = x;
    w.zoneY = y;
    w.evadeT = 0;
  }
}

/** Clear all heat (respray, mission end, respawn). */
export function clearWanted(game) {
  const w = game.wanted;
  if (w.level > 0) game.events.push({ type: 'wantedClear', level: w.level });
  w.level = 0;
  w.heat = 0;
  w.evadeT = 0;
  w.arrestT = 0;
}

/** Track whether police can see the player, move the zone, run the escape countdown. */
export function updateWanted(game, dt) {
  const w = game.wanted;
  w.flashT = Math.max(0, w.flashT - dt);
  if (w.level === 0) {
    w.seen = false;
    return;
  }
  const pl = game.player;
  const px = pl.vehicle ? pl.vehicle.x : pl.x;
  const py = pl.vehicle ? pl.vehicle.y : pl.y;
  let seen = false;
  for (const p of game.peds) {
    if (p.team === 'police' && !p.dead && p.seesPlayer) {
      seen = true;
      break;
    }
  }
  if (!seen) {
    for (const v of game.vehicles) {
      if (v.ai !== 'police' || v.wrecked) continue;
      const d = Math.hypot(v.x - px, v.y - py);
      if (d < 460 && hasLineOfSight(game.city, v.x, v.y, px, py)) {
        seen = true;
        break;
      }
    }
  }
  if (!seen && game.heli && game.heli.lit) seen = true;
  w.seen = seen;
  w.zoneR = zoneRadius(w.level);
  w.evadeNeed = 5 + w.level * 1.8;
  if (seen) {
    w.zoneX += (px - w.zoneX) * Math.min(1, dt * 4);
    w.zoneY += (py - w.zoneY) * Math.min(1, dt * 4);
    w.evadeT = 0;
  } else if (Math.hypot(px - w.zoneX, py - w.zoneY) > w.zoneR) {
    w.evadeT += dt;
    if (w.evadeT >= w.evadeNeed) {
      clearWanted(game);
      game.events.push({ type: 'evaded' });
    }
  } else w.evadeT = Math.max(0, w.evadeT - dt * 0.5);
  // Arrest: an officer within arm's reach of a player on foot who is not running.
  if (!pl.vehicle && !pl.dead && w.level <= 2) {
    let close = false;
    for (const p of game.peds) if (p.team === 'police' && !p.dead && Math.hypot(p.x - pl.x, p.y - pl.y) < 24) close = true;
    if (close && Math.hypot(pl.vx, pl.vy) < 60) {
      w.arrestT += dt;
      if (w.arrestT > 1.6) game.events.push({ type: 'playerDown', cause: 'arrest' });
    } else w.arrestT = Math.max(0, w.arrestT - dt);
  } else w.arrestT = 0;
}
