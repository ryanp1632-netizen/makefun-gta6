// How much of Halcyon Keys is done, for the pause screen's headline and STATS tab: the seven
// story jobs weigh the most, then Sunset Tapes, street races won, respect, the garage, KeyCab
// fares and property. Each part is {label, have, total, weight}; the total is a whole percent.
import { MISSIONS, RACE_ROUTES } from '../missions/storyMissions.js';
import { LEVELS, respectLevel } from './economy.js';
import { VEHICLE_MODELS } from '../vehicles/vehicleModels.js';

/** Fares that count toward completion (more still pay, they just stop adding to the total). */
export const FARE_GOAL = 15;

/** The parts of completion, each with its share of the 100%. */
export function completionParts(game) {
  const eco = game.economy;
  const buyable = Object.values(VEHICLE_MODELS).filter((m) => m.level <= 90).length;
  const owned = eco.garage.filter((id) => VEHICLE_MODELS[id] && VEHICLE_MODELS[id].level <= 90).length;
  return [
    { label: 'Story jobs', have: game.missions.completed.length, total: MISSIONS.length, weight: 45 },
    { label: 'Sunset Tapes', have: eco.tapes.length, total: game.city.collectibles.length || 20, weight: 15 },
    { label: 'Street races won', have: (eco.races ?? []).length, total: Object.keys(RACE_ROUTES).length, weight: 12 },
    { label: 'Respect level', have: respectLevel(eco.xp).level, total: LEVELS.length, weight: 10 },
    { label: 'Garage', have: owned, total: buyable, weight: 7 },
    { label: 'KeyCab fares', have: Math.min(FARE_GOAL, game.stats.fares ?? 0), total: FARE_GOAL, weight: 6 },
    { label: 'Properties', have: Object.values(eco.properties).filter(Boolean).length, total: Object.keys(eco.properties).length, weight: 5 },
  ];
}

/** Whole-percent completion of the game. */
export function completionPercent(game) {
  let sum = 0;
  for (const p of completionParts(game)) sum += (Math.min(p.have, p.total) / Math.max(1, p.total)) * p.weight;
  return Math.floor(sum);
}
