// People seen from above: swinging legs, shoulders turned to their heading, arms and a weapon
// when armed, hair, caps and police hats. Outfits come from the pedestrian's look.

export const SKINS = ['#f1c27d', '#e0ac69', '#c68642', '#8d5524', '#ffdbac', '#a0673c'];
export const HAIR = ['#1b1b1b', '#3b2416', '#7a4a22', '#c9a15a', '#e8e0d0', '#b23a48', '#2b2b6a'];
export const SHIRTS = ['#ff6b6b', '#4ecdc4', '#ffe66d', '#f7fff7', '#1a535c', '#ff9f1c', '#9b5de5', '#00bbf9', '#f15bb5', '#e9edc9', '#2ec4b6', '#ffbf69'];
export const PANTS = ['#2b2d42', '#3d405b', '#6b705c', '#264653', '#e9d8a6', '#14213d', '#7f5539'];

/** A random civilian look from the simulation's random stream. */
export function randomLook(rng) {
  return { skin: rng.pick(SKINS), hair: rng.pick(HAIR), shirt: rng.pick(SHIRTS), pants: rng.pick(PANTS), hat: rng.chance(0.15) ? rng.pick(['#f4f1de', '#e07a5f', '#3d405b']) : null, bald: rng.chance(0.1) };
}

export const LOOKS = {
  player: { skin: '#c68642', hair: '#1b1b1b', shirt: '#ff6b5a', pants: '#2b2d42', hat: null, pattern: '#ffe66d' },
  cop: { skin: '#e0ac69', hair: '#1b1b1b', shirt: '#2a4d8f', pants: '#14213d', hat: '#14213d', badge: true },
  gang: { skin: '#a0673c', hair: '#1b1b1b', shirt: '#14b8a6', pants: '#1f2937', hat: null, bandana: '#0f766e' },
  guard: { skin: '#8d5524', hair: '#1b1b1b', shirt: '#1d1f24', pants: '#1d1f24', hat: null },
  juno: { skin: '#f1c27d', hair: '#ff4fa3', shirt: '#1d1f24', pants: '#3d405b', hat: null },
};

/** Draw a person at (p.x, p.y) facing p.angle. */
export function drawPerson(ctx, p, light, t) {
  const look = p.look;
  const s = 1.38;
  ctx.save();
  ctx.translate(p.x, p.y);
  if (p.hostile && !p.dead) {
    // Hostiles carry a red ground ring so a firefight reads at a glance.
    ctx.strokeStyle = p.team === 'police' ? 'rgba(80,140,255,0.85)' : 'rgba(255,60,70,0.9)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, 13, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = ctx.strokeStyle;
    ctx.beginPath();
    ctx.moveTo(-5, -20);
    ctx.lineTo(5, -20);
    ctx.lineTo(0, -14);
    ctx.closePath();
    ctx.fill();
  }
  if (p.dead) {
    ctx.rotate(p.angle);
    ctx.fillStyle = 'rgba(110,10,16,0.55)';
    ctx.beginPath();
    ctx.ellipse(-2, 2, 9, 6, 0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = look.pants;
    ctx.fillRect(-12 * s, -3 * s, 8 * s, 6 * s);
    ctx.fillStyle = look.shirt;
    ctx.beginPath();
    ctx.ellipse(-1 * s, 0, 6 * s, 4.5 * s, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = look.skin;
    ctx.beginPath();
    ctx.arc(7 * s, 0, 3.4 * s, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    return;
  }
  ctx.fillStyle = `rgba(20,18,40,${0.3 + light.shadowAlpha * 0.3})`;
  ctx.beginPath();
  ctx.ellipse(light.shadowX * 5, light.shadowY * 5, 8 * s, 6 * s, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.rotate(p.angle);
  const swing = Math.sin(p.walkPhase ?? 0) * Math.min(1, (p.speed ?? 0) / 60) * 4.5;
  ctx.fillStyle = look.pants;
  ctx.beginPath();
  ctx.ellipse(swing * s, -2.6 * s, 3 * s, 2 * s, 0, 0, Math.PI * 2);
  ctx.ellipse(-swing * s, 2.6 * s, 3 * s, 2 * s, 0, 0, Math.PI * 2);
  ctx.fill();
  const armed = p.weapon && p.weapon !== 'none';
  ctx.fillStyle = look.skin;
  if (armed) {
    ctx.beginPath();
    ctx.ellipse(4.5 * s, -3.6 * s, 3.4 * s, 1.6 * s, 0.4, 0, Math.PI * 2);
    ctx.ellipse(4.5 * s, 3.2 * s, 3.4 * s, 1.6 * s, -0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#1b1c1f';
    const long = p.weapon === 'smg' || p.weapon === 'shotgun' || p.weapon === 'rifle';
    ctx.fillRect(6 * s, -1.3 * s, (long ? 11 : 7) * s, 2.6 * s);
    if (p.weapon === 'shotgun') {
      ctx.fillStyle = '#6b4226';
      ctx.fillRect(3 * s, -1.5 * s, 5 * s, 3 * s);
    }
  } else {
    ctx.beginPath();
    ctx.arc(-swing * 0.6 * s, -6.4 * s, 1.9 * s, 0, Math.PI * 2);
    ctx.arc(swing * 0.6 * s, 6.4 * s, 1.9 * s, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = look.shirt;
  ctx.beginPath();
  ctx.ellipse(0, 0, 4.4 * s, 7 * s, 0, 0, Math.PI * 2);
  ctx.fill();
  if (look.pattern) {
    ctx.fillStyle = look.pattern;
    for (const [dx, dy] of [[-1.5, -4], [1.5, 3], [-2, 2], [1, -1]]) {
      ctx.beginPath();
      ctx.arc(dx * s, dy * s, 0.9 * s, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  if (look.badge) {
    ctx.fillStyle = '#ffd166';
    ctx.fillRect(1 * s, -4 * s, 1.6 * s, 1.6 * s);
  }
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth = 0.6;
  ctx.stroke();
  ctx.fillStyle = look.skin;
  ctx.beginPath();
  ctx.arc(0.6 * s, 0, 3.6 * s, 0, Math.PI * 2);
  ctx.fill();
  if (look.hat) {
    ctx.fillStyle = look.hat;
    ctx.beginPath();
    ctx.arc(0.3 * s, 0, 3.9 * s, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(2.5 * s, -3 * s, 2.6 * s, 6 * s);
  } else if (look.bandana) {
    ctx.fillStyle = look.bandana;
    ctx.beginPath();
    ctx.arc(0.2 * s, 0, 3.7 * s, Math.PI * 0.5, Math.PI * 1.5);
    ctx.fill();
  } else if (!look.bald) {
    ctx.fillStyle = look.hair;
    ctx.beginPath();
    ctx.arc(-0.2 * s, 0, 3.7 * s, Math.PI * 0.55, Math.PI * 1.45);
    ctx.fill();
  }
  ctx.restore();
}
