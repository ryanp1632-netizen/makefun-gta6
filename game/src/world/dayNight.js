// The clock and the light it implies: sun direction and shadow length, the ambient tint the
// scene is multiplied by, how warm the grade is, and how far into the night the neon has come on.
import { clamp, lerp } from '../core/math.js';

/** Game minutes per real second (a full day lasts 40 minutes). */
export const MINUTES_PER_SECOND = 0.6;

export function createClock(hours = 18.2, day = 1) {
  return { hours, day };
}

export function advanceClock(clock, dt) {
  clock.hours += (dt * MINUTES_PER_SECOND) / 60;
  if (clock.hours >= 24) {
    clock.hours -= 24;
    clock.day += 1;
  }
}

export { formatClock } from '../core/math.js';

// Ambient multiplier, warmth (golden grade) and night (lights on) through the day.
const KEYS = [
  [0, [0.26, 0.31, 0.56], 0, 1],
  [4.8, [0.28, 0.32, 0.56], 0, 1],
  [6, [0.78, 0.62, 0.66], 0.6, 0.45],
  [7.2, [1, 0.95, 0.9], 0.2, 0],
  [12, [1, 1, 1], 0, 0],
  [16.5, [1, 0.98, 0.94], 0.15, 0],
  [18, [1, 0.9, 0.76], 0.85, 0.05],
  [19, [0.98, 0.8, 0.7], 1, 0.3],
  [19.8, [0.66, 0.56, 0.7], 0.6, 0.7],
  [20.6, [0.34, 0.36, 0.62], 0.15, 1],
  [24, [0.26, 0.31, 0.56], 0, 1],
];

/** Everything the renderer needs to light the scene at `hours`. */
export function lightingAt(hours) {
  let i = 0;
  while (i < KEYS.length - 2 && KEYS[i + 1][0] <= hours) i += 1;
  const a = KEYS[i];
  const b = KEYS[i + 1];
  const t = clamp((hours - a[0]) / (b[0] - a[0]), 0, 1);
  const ambient = [lerp(a[1][0], b[1][0], t), lerp(a[1][1], b[1][1], t), lerp(a[1][2], b[1][2], t)];
  const warm = lerp(a[2], b[2], t);
  const night = lerp(a[3], b[3], t);
  // Sun from the east at dawn, south at noon, west at dusk; the moon stands in at night.
  const dayT = clamp((hours - 6) / 13.5, 0, 1);
  const azimuth = Math.PI * dayT;
  const elevation = Math.sin(dayT * Math.PI);
  const sunX = Math.cos(azimuth);
  const sunY = 0.35 + Math.sin(azimuth) * 0.25;
  const sl = Math.hypot(sunX, sunY);
  const shadowLen = night > 0.8 ? 0.5 : clamp(0.55 / Math.max(0.18, elevation), 0.6, 2.1);
  return {
    hours, ambient, warm, night,
    toSunX: sunX / sl, toSunY: sunY / sl,
    shadowX: (-sunX / sl) * shadowLen, shadowY: (-sunY / sl) * shadowLen,
    shadowAlpha: night > 0.8 ? 0.16 : lerp(0.34, 0.22, warm * 0.5) * (1 - night * 0.6),
    neon: clamp((night - 0.1) / 0.6, 0, 1),
  };
}
