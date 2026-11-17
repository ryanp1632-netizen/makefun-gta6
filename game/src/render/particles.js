// Particle effects: tyre smoke, engine smoke and fire, sparks, muzzle flashes, explosions,
// water splashes, debris and bullet tracers. They live in the simulation (seeded randomness, fixed
// steps) so screenshots replay exactly; drawing splits into a ground pass and an additive glow pass.

export const P_SMOKE = 0;
export const P_TYRE = 1;
export const P_FIRE = 2;
export const P_SPARK = 3;
export const P_FLASH = 4;
export const P_DEBRIS = 5;
export const P_SPLASH = 6;
export const P_TRACER = 7;
export const P_BLOOD = 8;
export const P_RING = 9;

const MAX = 1400;

export function createParticles() {
  return { list: [] };
}

/** Add one particle; returns it (or null when the pool is full). */
export function emit(fx, kind, x, y, vx, vy, life, size, color, extra = null) {
  if (fx.list.length >= MAX) fx.list.shift();
  const p = { kind, x, y, vx, vy, life, max: life, size, color, x2: 0, y2: 0, rot: 0 };
  if (extra) Object.assign(p, extra);
  fx.list.push(p);
  return p;
}

export function updateParticles(fx, dt) {
  const list = fx.list;
  let w = 0;
  for (let i = 0; i < list.length; i += 1) {
    const p = list[i];
    p.life -= dt;
    if (p.life <= 0) continue;
    const drag = p.kind === P_SPARK || p.kind === P_DEBRIS ? 2.2 : p.kind === P_TRACER ? 0 : 1.4;
    p.vx -= p.vx * drag * dt;
    p.vy -= p.vy * drag * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    if (p.kind === P_SMOKE || p.kind === P_TYRE) p.size += dt * (p.grow ?? 14);
    if (p.kind === P_RING) p.size += dt * 520;
    p.rot += dt * 3;
    list[w++] = p;
  }
  list.length = w;
}

export function emitTyreSmoke(fx, rng, x, y, vx, vy) {
  emit(fx, P_TYRE, x + rng.range(-3, 3), y + rng.range(-3, 3), vx * 0.15 + rng.range(-12, 12), vy * 0.15 + rng.range(-12, 12), rng.range(0.7, 1.4), rng.range(5, 9), [235, 235, 232], { grow: 22 });
}

export function emitEngineSmoke(fx, rng, x, y, heavy) {
  const c = heavy ? 40 : 120;
  emit(fx, P_SMOKE, x + rng.range(-4, 4), y + rng.range(-4, 4), rng.range(-14, 14) + 10, rng.range(-14, 14) - 18, rng.range(1, 2), rng.range(5, 8), [c, c, c + 4], { grow: 18 });
}

export function emitFire(fx, rng, x, y, scale = 1) {
  emit(fx, P_FIRE, x + rng.range(-5, 5) * scale, y + rng.range(-5, 5) * scale, rng.range(-15, 15), rng.range(-30, -5), rng.range(0.3, 0.6), rng.range(5, 10) * scale, [255, rng.range(120, 200), 40]);
}

export function emitSparks(fx, rng, x, y, nx, ny, count = 8, speed = 220) {
  for (let i = 0; i < count; i += 1) {
    const a = Math.atan2(ny, nx) + rng.range(-1.1, 1.1);
    const s = rng.range(0.4, 1) * speed;
    emit(fx, P_SPARK, x, y, Math.cos(a) * s, Math.sin(a) * s, rng.range(0.2, 0.5), rng.range(1, 2), [255, 220, 120]);
  }
}

export function emitMuzzle(fx, rng, x, y, angle, big = false) {
  emit(fx, P_FLASH, x, y, 0, 0, 0.06, big ? 14 : 9, [255, 230, 140], { rot: angle });
  emit(fx, P_SMOKE, x, y, Math.cos(angle) * 40, Math.sin(angle) * 40, 0.5, 3, [200, 200, 200], { grow: 12 });
}

export function emitTracer(fx, x, y, x2, y2) {
  emit(fx, P_TRACER, x, y, 0, 0, 0.07, 1.4, [255, 236, 170], { x2, y2 });
}

export function emitSplash(fx, rng, x, y, count = 14) {
  for (let i = 0; i < count; i += 1) {
    const a = rng.range(0, Math.PI * 2);
    const s = rng.range(30, 140);
    emit(fx, P_SPLASH, x, y, Math.cos(a) * s, Math.sin(a) * s, rng.range(0.4, 0.9), rng.range(2, 4), [230, 250, 255]);
  }
  emit(fx, P_RING, x, y, 0, 0, 0.5, 6, [230, 250, 255]);
}

export function emitBlood(fx, rng, x, y, nx, ny) {
  for (let i = 0; i < 5; i += 1) emit(fx, P_BLOOD, x, y, nx * rng.range(20, 80) + rng.range(-20, 20), ny * rng.range(20, 80) + rng.range(-20, 20), rng.range(0.3, 0.6), rng.range(1.5, 2.6), [150, 16, 24]);
}

export function emitExplosion(fx, rng, x, y, scale = 1) {
  emit(fx, P_RING, x, y, 0, 0, 0.35, 20 * scale, [255, 220, 160]);
  emit(fx, P_FLASH, x, y, 0, 0, 0.18, 90 * scale, [255, 210, 120], { rot: 0, burst: true });
  for (let i = 0; i < 26; i += 1) {
    const a = rng.range(0, Math.PI * 2);
    const s = rng.range(40, 220) * scale;
    emit(fx, P_FIRE, x, y, Math.cos(a) * s, Math.sin(a) * s, rng.range(0.4, 0.9), rng.range(10, 22) * scale, [255, rng.range(90, 190), 30]);
  }
  for (let i = 0; i < 18; i += 1) {
    const a = rng.range(0, Math.PI * 2);
    const s = rng.range(20, 120) * scale;
    emit(fx, P_SMOKE, x, y, Math.cos(a) * s, Math.sin(a) * s, rng.range(1.5, 3), rng.range(10, 20) * scale, [44, 40, 40], { grow: 26 });
  }
  for (let i = 0; i < 12; i += 1) {
    const a = rng.range(0, Math.PI * 2);
    const s = rng.range(120, 320) * scale;
    emit(fx, P_DEBRIS, x, y, Math.cos(a) * s, Math.sin(a) * s, rng.range(0.6, 1.2), rng.range(2, 4), [40, 40, 44]);
  }
  emitSparks(fx, rng, x, y, 1, 0, 20, 360);
}

/** Smoke, debris, splashes and blood: drawn with the scene, under the lighting. */
export function drawParticlesLow(ctx, fx) {
  for (const p of fx.list) {
    const a = p.life / p.max;
    if (p.kind === P_SMOKE || p.kind === P_TYRE) {
      ctx.fillStyle = `rgba(${p.color[0]},${p.color[1]},${p.color[2]},${(p.kind === P_TYRE ? 0.42 : 0.55) * a})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    } else if (p.kind === P_DEBRIS || p.kind === P_BLOOD) {
      ctx.fillStyle = `rgba(${p.color[0]},${p.color[1]},${p.color[2]},${Math.min(1, a * 2)})`;
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    } else if (p.kind === P_SPLASH) {
      ctx.fillStyle = `rgba(230,250,255,${a})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * (0.5 + a * 0.5), 0, Math.PI * 2);
      ctx.fill();
    } else if (p.kind === P_RING && p.color[1] > 240) {
      ctx.strokeStyle = `rgba(255,255,255,${a * 0.8})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * 0.25, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
}

/** Fire, sparks, flashes, tracers and shock rings: additive, above everything. */
export function drawParticlesGlow(ctx, fx) {
  ctx.globalCompositeOperation = 'lighter';
  for (const p of fx.list) {
    const a = p.life / p.max;
    if (p.kind === P_FIRE) {
      const r = p.size * (0.6 + a * 0.6);
      const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
      g.addColorStop(0, `rgba(255,${Math.round(p.color[1] + 40)},120,${0.9 * a})`);
      g.addColorStop(0.5, `rgba(255,${Math.round(p.color[1])},30,${0.55 * a})`);
      g.addColorStop(1, 'rgba(255,60,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fill();
    } else if (p.kind === P_SPARK) {
      ctx.strokeStyle = `rgba(255,${200 + Math.round(a * 55)},120,${a})`;
      ctx.lineWidth = p.size;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x - p.vx * 0.03, p.y - p.vy * 0.03);
      ctx.stroke();
    } else if (p.kind === P_FLASH) {
      const r = p.size * (p.burst ? 0.6 + (1 - a) * 0.8 : 1);
      const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
      g.addColorStop(0, `rgba(255,255,230,${a})`);
      g.addColorStop(0.4, `rgba(255,200,90,${0.7 * a})`);
      g.addColorStop(1, 'rgba(255,120,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fill();
      if (!p.burst) {
        ctx.fillStyle = `rgba(255,250,220,${a})`;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.beginPath();
        ctx.moveTo(0, -2.5);
        ctx.lineTo(p.size * 1.6, 0);
        ctx.lineTo(0, 2.5);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
    } else if (p.kind === P_TRACER) {
      ctx.strokeStyle = `rgba(255,236,170,${a * 0.9})`;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x2, p.y2);
      ctx.stroke();
    } else if (p.kind === P_RING && p.color[1] < 240) {
      ctx.strokeStyle = `rgba(255,220,160,${a * 0.6})`;
      ctx.lineWidth = 4 * a + 1;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  ctx.globalCompositeOperation = 'source-over';
}
