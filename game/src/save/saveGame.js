// One save slot in localStorage: story progress, cash, respect, garage, properties, tapes,
// weapons and ammo, the clock and lifetime stats. Written at the safehouse and after every job;
// read by Continue on the title screen, which also shows the slot's summary.
import { MISSIONS } from '../missions/storyMissions.js';
import { formatCash, formatClock } from '../core/math.js';

const SAVE_KEY = 'halcyonKeys.save.v1';

/** Snapshot the parts of the game that persist. */
export function snapshot(game) {
  const pl = game.player;
  return {
    v: 1, completed: [...game.missions.completed], cash: Math.round(game.economy.cash), xp: game.economy.xp,
    garage: [...game.economy.garage], properties: { ...game.economy.properties }, tapes: [...game.economy.tapes],
    owned: { ...pl.owned }, reserve: Object.fromEntries(Object.entries(pl.ammo).map(([k, a]) => [k, a.mag + a.reserve])),
    armor: Math.round(pl.armor), clock: { hours: game.clock.hours, day: game.clock.day }, stats: { ...game.stats }, playtime: (game.playtime ?? 0) + game.t,
  };
}

export function writeSave(game) {
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(snapshot(game)));
    return true;
  } catch {
    return false;
  }
}

export function readSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    return s && s.v === 1 ? s : null;
  } catch {
    return null;
  }
}

/** Restore a snapshot into a fresh game (the player wakes at the safehouse). */
export function applySave(game, s) {
  game.missions.completed = [...s.completed];
  game.economy.cash = s.cash;
  game.economy.xp = s.xp;
  game.economy.garage = [...s.garage];
  game.economy.properties = { ...s.properties };
  game.economy.tapes = [...s.tapes];
  const pl = game.player;
  pl.owned = { ...pl.owned, ...s.owned };
  for (const [k, total] of Object.entries(s.reserve)) if (pl.ammo[k]) {
    pl.ammo[k].mag = 0;
    pl.ammo[k].reserve = total;
  }
  for (const k of Object.keys(pl.ammo)) if (pl.owned[k]) {
    const take = Math.min(pl.ammo[k].reserve, k === 'pistol' ? 12 : k === 'smg' ? 32 : k === 'shotgun' ? 6 : 30);
    pl.ammo[k].mag = take;
    pl.ammo[k].reserve -= take;
  }
  pl.armor = s.armor;
  game.clock.hours = s.clock.hours;
  game.clock.day = s.clock.day;
  game.stats = { ...game.stats, ...s.stats };
  game.playtime = s.playtime;
}

/** One line describing a save for the title screen. */
export function summarizeSave(s) {
  if (!s) return null;
  const next = MISSIONS.find((m) => !s.completed.includes(m.id));
  const chapter = next ? `Ch.${next.chapter} ${next.title}` : 'Story complete';
  return `${chapter}  ·  ${formatCash(s.cash)}  ·  Day ${s.clock.day}, ${formatClock(s.clock)}`;
}
