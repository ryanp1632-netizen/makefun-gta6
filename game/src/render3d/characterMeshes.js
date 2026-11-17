// Low-poly people for the 3D view, built from boxes each frame: legs and arms swing with the walk
// cycle, armed people raise their weapon toward their aim, the dead lie in a pool of blood, and
// hostiles carry a floating chevron (red for crews, blue for police) so a firefight reads at a
// glance. Outfits come from the same look records the classic view draws.
import { MAT, frame, hexRgb } from './meshBuilder.js';

function c01(hex, k = 1) {
  const c = hexRgb(hex);
  return [(c[0] / 255) * k, (c[1] / 255) * k, (c[2] / 255) * k];
}

/** One limb box hanging from a pivot, swung forward by `swing` radians. */
function limb(mb, px, py, pz, yaw, swing, sx, len, sz, ox, oz, color) {
  mb.xform(frame(px, py, pz, yaw, swing));
  mb.color(...color).mat(MAT.PLAIN);
  mb.box(ox - sx / 2, -len, oz - sz / 2, ox + sx / 2, 0, oz + sz / 2, '');
}

/** A distant person: legs, body and head as three boxes (and the hostile chevron). */
function farPerson(mb, p, t, skin, shirt, pants) {
  mb.xform(frame(p.x, 0, p.y, p.angle));
  mb.color(...pants).mat(MAT.PLAIN);
  mb.box(-1.4, 0, -2.8, 1.4, 9.2, 2.8, '');
  mb.color(...shirt);
  mb.box(-1.9, 9.2, -3.3, 1.9, 14.8, 3.3, '');
  mb.color(...skin);
  mb.box(-1.7, 14.8, -1.65, 1.9, 18.8, 1.65, '');
  mb.xform(null);
  if (p.hostile && p.team !== 'player') chevron(mb, p, t);
}

function chevron(mb, p, t) {
  const police = p.team === 'police';
  mb.color(...(police ? [0.3, 0.55, 1] : [1, 0.2, 0.25])).color2(0.3, 0.1, 0.1).mat(MAT.EMIT, 130, 0);
  const y = 25 + Math.sin(t * 4 + p.id) * 0.8;
  const a = t * 2 + p.id;
  const cx = Math.cos(a) * 3.4;
  const cz = Math.sin(a) * 3.4;
  mb.triangle(p.x - cx, y + 3, p.y - cz, p.x + cx, y + 3, p.y + cz, p.x, y - 1.5, p.y);
  mb.triangle(p.x - cz, y + 3, p.y + cx, p.x + cz, y + 3, p.y - cx, p.x, y - 1.5, p.y);
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
  // Local offsets: forward (ca, sa), right (-sa, ca).
  const at = (f, r) => [p.x + ca * f - sa * r, p.y + sa * f + ca * r];
  if (p.dead) {
    mb.xform(null);
    mb.color(0.32, 0.02, 0.04).mat(MAT.PLAIN);
    mb.disc(p.x - ca * 2, 0.25, p.y - sa * 2, 8 + Math.min(4, (p.deadT ?? 0) * 2), 10);
    mb.xform(frame(p.x, 0.3, p.y, yaw));
    mb.color(...pants).mat(MAT.PLAIN);
    mb.box(-9, 0, -3, 0, 2.6, -0.5, '');
    mb.box(-9, 0, 0.5, 0, 2.6, 3.4, '');
    mb.color(...shirt);
    mb.box(0, 0, -3.4, 7, 3.4, 3.4, '');
    mb.color(...skin);
    mb.box(7.2, 0, -1.7, 10.8, 3.4, 1.7, '');
    mb.xform(null);
    return;
  }
  if (lod > 0) {
    farPerson(mb, p, t, skin, shirt, pants);
    return;
  }
  const speed = p.speed ?? 0;
  const k = Math.min(1, speed / 60);
  const swing = Math.sin(p.walkPhase ?? 0) * k * 0.7;
  const armed = p.weapon && p.weapon !== 'none';
  const hipY = 8.2;
  // Legs.
  for (const s of [-1, 1]) {
    const [lx, lz] = at(0, s * 1.6);
    limb(mb, lx, hipY, lz, yaw, swing * s, 2.6, hipY, 2.6, 0, 0, pants);
    mb.color(0.12, 0.11, 0.12);
    mb.box(-1.3, -hipY, -1.4, 2.6, -hipY + 1.2, 1.4, '');
  }
  // Torso and hips.
  mb.xform(frame(p.x, 0, p.y, yaw));
  mb.color(...pants).mat(MAT.PLAIN);
  mb.box(-1.8, hipY - 1, -3, 1.8, hipY + 1.2, 3, '');
  mb.color(...shirt);
  mb.box(-1.9, hipY + 1.2, -3.3, 1.9, 14.6, 3.3, '');
  if (look.pattern) {
    mb.color(...c01(look.pattern));
    mb.box(1.92, 10.5, -2.4, 2.0, 11.5, -1.2, '');
    mb.box(1.92, 12.5, 0.6, 2.0, 13.5, 1.8, '');
    mb.box(-2.0, 11.4, -0.4, -1.92, 12.4, 0.8, '');
  }
  if (look.badge) {
    mb.color(1, 0.82, 0.4).mat(MAT.METAL);
    mb.box(1.92, 12.6, -2.2, 2.05, 13.6, -1.2, '');
  }
  // Head, hair, hat.
  mb.color(...skin).mat(MAT.PLAIN);
  mb.box(-0.6, 14.6, -0.8, 0.6, 15.4, 0.8, '');
  mb.box(-1.7, 15.3, -1.65, 1.9, 19, 1.65, '');
  if (look.hat) {
    mb.color(...c01(look.hat));
    mb.box(-1.9, 18.4, -1.9, 2.0, 19.9, 1.9, '');
    mb.box(1.4, 18.4, -1.8, 4.2, 18.9, 1.8, '');
  } else if (look.bandana) {
    mb.color(...c01(look.bandana));
    mb.box(-1.85, 17.6, -1.8, 2.0, 19.3, 1.8, '');
  } else if (!look.bald) {
    mb.color(...c01(look.hair));
    mb.box(-1.95, 17.8, -1.8, 1.4, 19.5, 1.8, '');
    mb.box(-1.95, 15.6, -1.8, -1.2, 18.2, 1.8, '');
  }
  // Arms: swinging, or raised to the weapon.
  for (const s of [-1, 1]) {
    const [sx, sz] = at(0, s * 4.1);
    if (armed) {
      const raise = 1.35 + (s < 0 ? 0.05 : 0);
      const inward = s * -0.28;
      limb(mb, sx, 14.2, sz, yaw + inward, raise, 1.8, 6.6, 1.8, 0, 0, shirt);
      mb.color(...skin);
      mb.box(-1, -7.6, -1, 1, -6.4, 1, '');
    } else {
      limb(mb, sx, 14.2, sz, yaw, -swing * s * 0.9, 1.7, 6.4, 1.7, 0, 0, shirt);
      mb.color(...skin);
      mb.box(-0.9, -7.4, -0.9, 0.9, -6.2, 0.9, '');
    }
  }
  if (armed) {
    const long = p.weapon === 'smg' || p.weapon === 'shotgun' || p.weapon === 'rifle';
    mb.xform(frame(p.x, 0, p.y, yaw));
    mb.color(0.08, 0.08, 0.09).mat(MAT.METAL);
    mb.box(5.6, 13.2, -0.6, 5.6 + (long ? 10 : 5.5), 14.6, 0.6, '');
    if (long) mb.box(6.5, 11, -0.5, 8, 13.2, 0.5, '');
    if (p.weapon === 'shotgun') {
      mb.color(0.42, 0.26, 0.15).mat(MAT.PLAIN);
      mb.box(3.5, 12.6, -0.7, 6.5, 14.4, 0.7, '');
    }
  }
  mb.xform(null);
  if (p.hostile && p.team !== 'player') chevron(mb, p, t);
}
