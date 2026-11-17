// Cash, respect and what respect unlocks: weapons at Reef & Trigger, cars at the safehouse
// garage, and the Azure Penthouse. Every payout and purchase goes through here and leaves a
// notice on screen.
import { WEAPONS } from '../combat/weapons.js';
import { VEHICLE_MODELS } from '../vehicles/vehicleModels.js';

/** Respect needed to reach each level (index = level - 1). */
export const LEVELS = [0, 400, 1000, 1900, 3200, 5000, 7500, 11000];

export const PROPERTIES = {
  safehouse: { name: "Pearl's Bait & Tackle loft", price: 0, income: 0 },
  penthouse: { name: 'The Azure Penthouse', price: 25000, income: 600 },
};

export function createEconomy() {
  return { cash: 2500, xp: 0, garage: ['sedan'], properties: { safehouse: true, penthouse: false }, tapes: [], earned: 0 };
}

/** {level, into, need, ratio} for a respect total. */
export function respectLevel(xp) {
  let level = 1;
  while (level < LEVELS.length && xp >= LEVELS[level]) level += 1;
  const base = LEVELS[level - 1];
  const next = LEVELS[level] ?? base + 5000;
  return { level, into: xp - base, need: next - base, ratio: Math.min(1, (xp - base) / (next - base)) };
}

export function notify(game, text, color = '#ffffff', big = false) {
  game.notices.push({ text, color, t: 0, big });
  if (game.notices.length > 5) game.notices.shift();
}

export function addCash(game, amount, reason = '') {
  game.economy.cash += amount;
  if (amount > 0) game.economy.earned += amount;
  notify(game, `${amount >= 0 ? '+' : '-'}$${Math.abs(amount).toLocaleString('en-US')}${reason ? `  ${reason}` : ''}`, amount >= 0 ? '#7dff9a' : '#ff7a7a');
}

export function addRespect(game, amount, reason = '') {
  const before = respectLevel(game.economy.xp).level;
  game.economy.xp += amount;
  const after = respectLevel(game.economy.xp).level;
  notify(game, `+${amount} RESPECT${reason ? `  ${reason}` : ''}`, '#ffd166');
  if (after > before) {
    notify(game, `RESPECT LEVEL ${after}  ${unlocksAt(after).join(' / ') || 'the Keys know your name'}`, '#ff7eb6', true);
    game.events.push({ type: 'levelUp', level: after });
  }
}

/** What becomes available at a respect level. */
export function unlocksAt(level) {
  const out = [];
  for (const w of Object.values(WEAPONS)) if (w.level === level && w.price > 0) out.push(w.name);
  for (const m of Object.values(VEHICLE_MODELS)) if (m.level === level) out.push(m.name);
  return out;
}

/** The shop's stock for the current level: weapons, ammo, armour. */
export function shopItems(game) {
  const level = respectLevel(game.economy.xp).level;
  const items = [];
  for (const w of Object.values(WEAPONS)) {
    const owned = game.player.owned[w.id];
    if (!owned && w.price > 0) items.push({ kind: 'weapon', id: w.id, label: w.name, price: w.price, locked: level < w.level, need: w.level });
    if (owned) items.push({ kind: 'ammo', id: w.id, label: `${w.name} ammo x${w.ammoPack}`, price: w.ammoPrice, locked: false });
  }
  items.push({ kind: 'armor', id: 'armor', label: 'Kevlar vest (100 armour)', price: 900, locked: level < 2, need: 2 });
  items.push({ kind: 'health', id: 'health', label: 'Field medkit (full health)', price: 300, locked: false });
  return items;
}

/** The garage list: models you own or can buy at your level. */
export function garageItems(game) {
  const level = respectLevel(game.economy.xp).level;
  const items = [];
  for (const [id, m] of Object.entries(VEHICLE_MODELS)) {
    if (m.level > 90) continue;
    const owned = game.economy.garage.includes(id);
    items.push({ kind: 'car', id, label: m.name, price: owned ? 0 : m.price, owned, locked: !owned && level < m.level, need: m.level });
  }
  return items;
}

/** Try to buy an item; returns a message. */
export function buyItem(game, item) {
  const eco = game.economy;
  const pl = game.player;
  if (item.locked) return `Needs respect level ${item.need}`;
  if (item.price > eco.cash) return 'Not enough cash';
  if (item.kind === 'weapon') {
    pl.owned[item.id] = true;
    pl.ammo[item.id].mag = WEAPONS[item.id].mag;
    pl.ammo[item.id].reserve = WEAPONS[item.id].ammoPack;
    pl.weapon = item.id;
  } else if (item.kind === 'ammo') pl.ammo[item.id].reserve += WEAPONS[item.id].ammoPack;
  else if (item.kind === 'armor') pl.armor = 100;
  else if (item.kind === 'health') pl.hp = 100;
  else if (item.kind === 'car' && !item.owned) eco.garage.push(item.id);
  else if (item.kind === 'property') eco.properties[item.id] = true;
  if (item.price > 0) addCash(game, -item.price, item.label);
  game.events.push({ type: 'purchase' });
  return 'Purchased';
}
