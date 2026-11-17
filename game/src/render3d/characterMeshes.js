// Low-poly people for the 3D view, rebuilt each frame. Proportions of a person rather than a
// stack of boxes: shoes, shins and thighs that bend at the knee, hips and belt, a tapered torso,
// shoulders, upper arms and forearms that bend at the elbow, hands, neck, a head with nose and
// eyes, and hair (short, long, bun or shaved), caps, bandanas and police hats. Walking and running
// swing the legs and arms in step with a little body bob; armed people raise their weapon in both
// hands toward the aim, a bare-fisted fighter keeps a guard up. Outfits come from each person's
// look record (shirt, trousers, skin, hair, patterns, badges), so crews wear their colours and
// officers their uniform. The dead lie in a pool of blood; hostiles carry a floating chevron.
import { MAT, frame, hexRgb } from './meshBuilder.js';

function c01(hex, k = 1) {
  const c = hexRgb(hex);
  return [(c[0] / 255) * k, (c[1] / 255) * k, (c[2] / 255) * k];
}

const SHOES = [[0.08, 0.08, 0.09], [0.92, 0.92, 0.9], [0.45, 0.28, 0.16], [0.85, 0.3, 0.3]];

/** A distant person: legs, body and head as three boxes (and the hostile chevron). */
function farPerson(mb, p, t, skin, shirt, pants) {
  mb.xform(frame(p.x, 0, p.y, p.angle));
  mb.color(...pants).mat(MAT.PLAIN);
  mb.box(-1.3, 0, -2.4, 1.3, 9.4, 2.4, '');
  mb.color(...shirt);
  mb.box(-1.7, 9.4, -3.0, 1.7, 15.6, 3.0, '');
  mb.color(...skin);
  mb.box(-1.5, 15.8, -1.4, 1.7, 19.2, 1.4, '');
  mb.xform(null);
  if (p.hostile && p.team !== 'player') chevron(mb, p, t);
}

function chevron(mb, p, t) {
  const police = p.team === 'police';
  mb.color(...(police ? [0.3, 0.55, 1] : [1, 0.2, 0.25])).color2(0.3, 0.1, 0.1).mat(MAT.EMIT, 130, 0);
  const y = 25.5 + Math.sin(t * 4 + p.id) * 0.8;
  const a = t * 2 + p.id;
  const cx = Math.cos(a) * 3.2;
  const cz = Math.sin(a) * 3.2;
  mb.triangle(p.x - cx, y + 3, p.y - cz, p.x + cx, y + 3, p.y + cz, p.x, y - 1.5, p.y);
  mb.triangle(p.x - cz, y + 3, p.y + cx, p.x + cz, y + 3, p.y - cx, p.x, y - 1.5, p.y);
}

/** A limb between two world points: a square prism, thick r0 at a and r1 at b. */
function limb(mb, a, b, r0, r1, color) {
  mb.color(...color).mat(MAT.PLAIN);
  mb.tube(a[0], a[1], a[2], b[0], b[1], b[2], r0, r1, 4, true);
}

/** A stable small integer per person for hair styles and shoes. */
function styleOf(p) {
  return ((p.id ?? 7) * 2654435761) >>> 0;
}

/** Append a person (pedestrian, officer, crew member or the player on foot); lod 1 is a far figure. */
export function appendPerson(mb, p, t, lod = 0) {
  const look = p.look;
  const skin = c01(look.skin);
  const shirt = c01(look.shirt);
  const pants = c01(look.pants);
  const yaw = p.angle;
  const ca = Math.cos(yaw);
  const sa = Math.sin(yaw);
  if (p.dead) {
    mb.xform(null);
    mb.color(0.32, 0.02, 0.04).mat(MAT.PLAIN);
    mb.disc(p.x - ca * 2, 0.25, p.y - sa * 2, 8 + Math.min(4, (p.deadT ?? 0) * 2), 10);
    mb.xform(frame(p.x, 0.3, p.y, yaw));
    mb.color(...pants).mat(MAT.PLAIN);
    mb.box(-9.5, 0, -2.9, 0, 2.4, -0.4, '');
    mb.box(-9.5, 0, 0.4, 0, 2.4, 2.9, '');
    mb.color(...shirt);
    mb.box(0, 0, -3.1, 7, 3.2, 3.1, '');
    mb.box(1.5, 0, -6.6, 4, 2, -3.1, '');
    mb.box(2.5, 0, 3.1, 5, 2, 6.2, '');
    mb.color(...skin);
    mb.box(7.2, 0, -1.6, 10.6, 3.2, 1.6, '');
    mb.xform(null);
    return;
  }
  if (lod > 0) {
    farPerson(mb, p, t, skin, shirt, pants);
    return;
  }
  const st = styleOf(p);
  // Local (forward f, height y, right r) to world.
  const W = (f, y, r) => [p.x + ca * f - sa * r, y, p.y + sa * f + ca * r];
  const speed = p.speed ?? 0;
  const k = Math.min(1, speed / 60);
  const run = Math.min(1, Math.max(0, (speed - 100) / 60));
  const ph = p.walkPhase ?? 0;
  const bob = Math.abs(Math.sin(ph)) * 0.55 * k;
  const lean = run * 1.2;
  const weapon = p.weapon && p.weapon !== 'none' ? p.weapon : null;
  const fists = weapon === 'fists';
  const armed = !!weapon && !fists;
  const shoe = p.team === 'police' || p.team === 'guard' ? SHOES[0] : p.team === 'player' ? SHOES[1] : SHOES[st % 4];
  // Legs: thigh and shin per side, bending at the knee through the stride.
  mb.xform(null);
  const hipY = 9.3 + bob;
  for (const s of [-1, 1]) {
    const phase = ph + (s > 0 ? 0 : Math.PI);
    const a = Math.sin(phase) * k * (0.62 + run * 0.25);
    const bend = k * (0.12 + (0.7 + run * 0.5) * Math.max(0, -Math.cos(phase + 0.4)));
    const hip = [0, hipY, s * 1.45];
    const knee = [hip[0] + Math.sin(a) * 4.7, hip[1] - Math.cos(a) * 4.7, hip[2]];
    const ankle = [knee[0] + Math.sin(a - bend) * 4.5, knee[1] - Math.cos(a - bend) * 4.5, hip[2]];
    limb(mb, W(...hip), W(...knee), 1.25, 1.05, pants);
    limb(mb, W(...knee), W(...ankle), 1.0, 0.8, pants);
    mb.xform(frame(...W(ankle[0], 0, ankle[2]), yaw, -(a - bend) * 0.4));
    mb.color(...shoe).mat(MAT.PLAIN);
    mb.box(-1.2, Math.max(0, ankle[1] - 1.1), -0.95, 2.4, Math.max(1.0, ankle[1] + 0.2), 0.95, '');
    mb.xform(null);
  }
  // Hips, torso, belt and neck (leaning into a run).
  mb.xform(frame(p.x, 0, p.y, yaw, -lean * 0.12));
  mb.color(...pants).mat(MAT.PLAIN);
  mb.box(-1.6, hipY - 1.2, -2.6, 1.6, hipY + 1.0, 2.6, '');
  mb.color(...shirt);
  mb.box(-1.5, hipY + 1.0, -2.45, 1.55, hipY + 3.6, 2.45);
  mb.box(-1.75, hipY + 3.6, -3.05, 1.8, hipY + 6.6, 3.05);
  mb.color(...(look.belt ? c01(look.belt) : [0.1, 0.09, 0.1]));
  mb.box(-1.65, hipY + 0.7, -2.65, 1.65, hipY + 1.3, 2.65, '');
  if (look.pattern) {
    // Island print: a few bright blooms on the front and back of the shirt.
    mb.color(...c01(look.pattern));
    for (const [y, r] of [[hipY + 2, -1.6], [hipY + 4.4, 1.3], [hipY + 5.6, -0.6], [hipY + 2.8, 1.7]]) {
      mb.box(1.56, y - 0.5, r - 0.55, 1.86, y + 0.5, r + 0.55, '');
      mb.box(-1.86, y - 0.2, -r - 0.55, -1.56, y + 0.8, -r + 0.55, '');
    }
  }
  if (look.badge) {
    mb.color(1, 0.82, 0.4).mat(MAT.METAL);
    mb.box(1.78, hipY + 4.8, -2.3, 1.95, hipY + 5.8, -1.3, '');
    mb.color(0.85, 0.85, 0.88);
    mb.box(1.78, hipY + 4.9, 1.2, 1.95, hipY + 5.4, 2.4, '');
  }
  const neckY = hipY + 6.6;
  mb.color(...skin).mat(MAT.PLAIN);
  mb.box(-0.75, neckY - 0.2, -0.85, 0.75, neckY + 0.8, 0.85);
  // Head: face, nose, eyes, ears, then hair or headwear.
  const h0 = neckY + 0.6;
  const h1 = h0 + 3.4;
  mb.box(-1.5, h0, -1.45, 1.7, h1, 1.45);
  mb.box(1.7, h0 + 1.1, -0.3, 2.15, h0 + 2.1, 0.3, '');
  mb.box(-0.3, h0 + 1.3, -1.6, 0.5, h0 + 2.2, 1.6, '');
  mb.color(0.05, 0.05, 0.06);
  for (const s of [-1, 1]) mb.box(1.69, h0 + 2.1, s * 0.75 - 0.3, 1.78, h0 + 2.55, s * 0.75 + 0.3, '');
  const hair = c01(look.hair ?? '#1b1b1b');
  if (look.hat) {
    mb.color(...c01(look.hat));
    mb.box(-1.7, h1 - 1.0, -1.7, 1.85, h1 + 0.9, 1.7);
    mb.box(1.2, h1 - 1.0, -1.6, 3.9, h1 - 0.5, 1.6);
    if (look.badge) {
      mb.color(1, 0.82, 0.4).mat(MAT.METAL);
      mb.box(1.84, h1 - 0.4, -0.45, 1.98, h1 + 0.5, 0.45, '');
      mb.mat(MAT.PLAIN);
    }
  } else if (look.bandana) {
    mb.color(...c01(look.bandana));
    mb.box(-1.75, h1 - 1.4, -1.65, 1.85, h1 + 0.35, 1.65);
    mb.box(-2.6, h1 - 1.6, -0.5, -1.7, h1 - 0.6, 0.5, '');
    mb.color(...hair);
    mb.box(-1.7, h0 + 0.8, -1.55, -1.1, h1 - 1.3, 1.55, '');
  } else if (!look.bald) {
    mb.color(...hair);
    const kind = p.team === 'player' ? 0 : st % 5;
    if (kind === 0) {
      // A short fade: a domed top, the sides and back cut close above the ears.
      mb.box(-1.62, h1 - 1.0, -1.52, 1.45, h1 + 0.35, 1.52);
      mb.box(-0.9, h1 + 0.35, -1.1, 1.1, h1 + 0.75, 1.1);
      mb.box(-1.58, h0 + 2.0, -1.5, -1.42, h1 - 1.0, 1.5, '');
      for (const s of [-1, 1]) mb.box(-1.5, h0 + 2.4, s * 1.46 - 0.04, 0.2, h1 - 0.9, s * 1.46 + 0.04, '');
    } else {
      mb.box(-1.7, h1 - 0.9, -1.6, 1.5, h1 + 0.45, 1.6);
      mb.box(-1.7, h0 + 1.2, -1.6, -1.2, h1, 1.6, '');
      for (const s of [-1, 1]) mb.box(-1.6, h0 + 2.2, s * 1.45 - (s > 0 ? 0.15 : 0), 0.5, h1, s * 1.45 + (s < 0 ? 0.15 : 0), '');
      if (kind === 1 || kind === 3) mb.box(-2.0, h0 - 1.6, -1.5, -1.25, h1 - 0.5, 1.5, '');
      else if (kind === 2) mb.box(-2.6, h1 - 0.8, -0.8, -1.4, h1 + 1.0, 0.8);
      else if (kind === 4) mb.box(-0.8, h1 + 0.2, -1.2, 1.4, h1 + 1.1, 1.2);
    }
  }
  // Arms: swinging with the stride, a fighter's guard, or both hands on the weapon.
  mb.xform(null);
  const sleeve = look.longSleeves || p.team === 'police' || p.team === 'guard';
  const fore = sleeve ? shirt : skin;
  const shY = hipY + 6.1;
  const lo = Math.sin(lean * 0.12) * shY;
  const L = (f, y, r) => W(f + lo, y, r);
  for (const s of [-1, 1]) {
    const sh = [0, shY, s * 3.5];
    let elbow;
    let hand;
    if (armed) {
      // Two-handed hold at chest height, the gun hand on the right.
      const gripF = 6.4;
      const handR = s > 0 ? 0.9 : -0.2;
      const handF = s > 0 ? gripF : gripF + 1.8;
      hand = [handF, shY - 1.4, handR];
      elbow = [2.6, shY - 2.6, s * 3.6];
    } else if (fists) {
      hand = [4.4, shY + 0.4, s * 1.6];
      elbow = [2.2, shY - 2.8, s * 3.4];
    } else {
      const phase = ph + (s > 0 ? Math.PI : 0);
      const a = Math.sin(phase) * k * (0.55 + run * 0.35);
      const e = 0.25 + k * 0.3 + run * 0.6;
      elbow = [Math.sin(a) * 3.6, shY - Math.cos(a) * 3.6, s * 3.75];
      hand = [elbow[0] + Math.sin(a + e) * 3.4, elbow[1] - Math.cos(a + e) * 3.4, s * 3.6];
    }
    limb(mb, L(...sh), L(...elbow), 0.95, 0.8, shirt);
    limb(mb, L(...elbow), L(...hand), 0.78, 0.65, fore);
    const hw = L(...hand);
    mb.color(...skin).mat(MAT.PLAIN);
    mb.box(hw[0] - 0.7, hw[1] - 0.7, hw[2] - 0.7, hw[0] + 0.7, hw[1] + 0.7, hw[2] + 0.7, '');
  }
  if (armed) {
    const long = weapon === 'smg' || weapon === 'shotgun' || weapon === 'rifle';
    const gy = shY - 1.2;
    mb.xform(frame(...L(0, 0, 0.6), yaw));
    mb.color(0.06, 0.06, 0.07).mat(MAT.METAL);
    const len = weapon === 'pistol' ? 4.2 : weapon === 'smg' ? 6.5 : 10.5;
    mb.box(5.6, gy - 0.55, -0.5, 5.6 + len, gy + 0.75, 0.5, '');
    mb.box(5.9, gy - 2.4, -0.45, 7.0, gy - 0.5, 0.45, '');
    if (weapon === 'smg' || weapon === 'rifle') mb.box(8.3, gy - 3.0, -0.4, 9.3, gy - 0.5, 0.4, '');
    if (long) {
      mb.color(...(weapon === 'shotgun' ? [0.45, 0.27, 0.14] : [0.1, 0.1, 0.11])).mat(MAT.PLAIN);
      mb.box(2.6, gy - 1.2, -0.55, 5.8, gy + 0.6, 0.55, '');
    }
    mb.xform(null);
  }
  mb.xform(null);
  if (p.hostile && p.team !== 'player') chevron(mb, p, t);
}
