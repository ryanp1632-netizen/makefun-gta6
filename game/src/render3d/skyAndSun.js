// The sky of the 3D view from the game clock: where the sun (or moon) stands, the colours of the
// zenith, horizon and sun halo, the sun's light and the ambient bounce, fog density and the final
// colour grade. Golden hour leans everything orange and violet; night drops to a deep blue with
// stars while lamps, windows and neon take over.
import { clamp, lerp } from '../core/math.js';

// Keyed by sun elevation in degrees: zenith, horizon, halo, sun light, sky ambient, ground ambient.
const KEYS = [
  { e: -14, zen: [0.010, 0.016, 0.048], hor: [0.05, 0.06, 0.13], hor2: [0.035, 0.045, 0.1], glow: [0.04, 0.04, 0.09], sun: [0.14, 0.18, 0.32], amb: [0.035, 0.045, 0.1], gnd: [0.02, 0.02, 0.035] },
  { e: -6, zen: [0.03, 0.03, 0.11], hor: [0.36, 0.17, 0.28], hor2: [0.11, 0.08, 0.19], glow: [0.45, 0.14, 0.18], sun: [0.18, 0.12, 0.2], amb: [0.1, 0.09, 0.17], gnd: [0.05, 0.04, 0.06] },
  { e: 0, zen: [0.045, 0.055, 0.21], hor: [0.8, 0.27, 0.18], hor2: [0.36, 0.17, 0.38], glow: [1.1, 0.36, 0.12], sun: [1.6, 0.6, 0.3], amb: [0.16, 0.13, 0.26], gnd: [0.14, 0.08, 0.06] },
  { e: 6, zen: [0.03, 0.065, 0.3], hor: [0.86, 0.36, 0.15], hor2: [0.42, 0.24, 0.48], glow: [1.15, 0.46, 0.15], sun: [2.2, 1.18, 0.52], amb: [0.17, 0.15, 0.28], gnd: [0.19, 0.11, 0.07] },
  { e: 16, zen: [0.13, 0.24, 0.62], hor: [0.9, 0.7, 0.52], hor2: [0.6, 0.6, 0.72], glow: [0.95, 0.68, 0.4], sun: [2.5, 1.95, 1.35], amb: [0.22, 0.26, 0.38], gnd: [0.2, 0.16, 0.12] },
  { e: 40, zen: [0.13, 0.32, 0.8], hor: [0.62, 0.76, 0.92], hor2: [0.56, 0.7, 0.9], glow: [0.5, 0.48, 0.42], sun: [2.7, 2.55, 2.3], amb: [0.26, 0.32, 0.44], gnd: [0.2, 0.18, 0.15] },
];

function mixKey(a, b, t, k) {
  return [lerp(a[k][0], b[k][0], t), lerp(a[k][1], b[k][1], t), lerp(a[k][2], b[k][2], t)];
}

/** Sun elevation (degrees) at `hours`: up at 6:00, highest at noon-ish, down at 19:30. */
export function sunElevation(hours) {
  const dayT = (hours - 6) / 13.5;
  if (dayT >= 0 && dayT <= 1) return 75 * Math.sin(Math.PI * dayT) ** 1.3;
  const past = dayT > 1 ? (hours - 19.5) : (6 - hours);
  return -Math.min(30, (past < 0 ? past + 24 : past) * 9);
}

/** Everything the 3D view needs from the clock (and the 2D light state for neon / night). */
export function skyState(hours, light) {
  const e = sunElevation(hours);
  const dayT = clamp((hours - 6) / 13.5, 0, 1);
  const az = Math.PI * dayT;
  let hx = Math.cos(az);
  let hz = Math.sin(az) * 0.35;
  const hl = Math.hypot(hx, hz) || 1;
  hx /= hl;
  hz /= hl;
  const er = (Math.max(e, -2) * Math.PI) / 180;
  const sunDir = [hx * Math.cos(er), Math.sin(er), hz * Math.cos(er)];
  let i = 0;
  while (i < KEYS.length - 2 && KEYS[i + 1].e <= e) i += 1;
  const a = KEYS[i];
  const b = KEYS[i + 1];
  const t = clamp((e - a.e) / (b.e - a.e), 0, 1);
  const s = {
    hours, elevation: e, sunDir,
    zenith: mixKey(a, b, t, 'zen'), horizon: mixKey(a, b, t, 'hor'), horizon2: mixKey(a, b, t, 'hor2'), glow: mixKey(a, b, t, 'glow'),
    sunCol: mixKey(a, b, t, 'sun'), ambSky: mixKey(a, b, t, 'amb'), ambGround: mixKey(a, b, t, 'gnd'),
    night: light.night, neon: light.neon, warm: clamp(1 - Math.abs(e - 5) / 14, 0, 1) * (e > -4 ? 1 : 0),
  };
  // Below the horizon the light comes from a pale moon high in the east.
  if (e < 0) {
    const k = clamp(-e / 8, 0, 1);
    const moon = [0.45, 0.72, -0.53];
    s.lightDir = [lerp(sunDir[0], moon[0], k), lerp(Math.max(sunDir[1], 0.02), moon[1], k), lerp(sunDir[2], moon[2], k)];
    const l = Math.hypot(...s.lightDir);
    s.lightDir = s.lightDir.map((v) => v / l);
  } else s.lightDir = sunDir;
  s.shadows = e > -1;
  s.sunDisc = e > -3 ? [40, 40 * (0.45 + s.sunCol[1] / 6), 40 * (0.2 + s.sunCol[2] / 6)] : [0, 0, 0];
  s.sunSize = 0.032 + clamp(1 - e / 20, 0, 1) * 0.022;
  s.fogDen = lerp(1 / 5600, 1 / 4300, s.warm) * (s.night > 0.6 ? 1.1 : 1);
  s.fogStart = 120;
  s.exposure = lerp(0.92, 1.0, s.warm) + s.night * 0.12;
  s.bloom = 0.32 + s.night * 0.4;
  s.thresh = lerp(3.2, 1.3, s.night);
  s.gain = s.night > 0.5 ? [0.96, 1.0, 1.08] : [lerp(1.0, 1.06, s.warm), lerp(1.0, 0.99, s.warm), lerp(1.0, 0.92, s.warm)];
  s.lift = s.night > 0.5 ? [0.0, 0.008, 0.03] : [lerp(0.0, 0.012, s.warm), 0.0, lerp(0.006, 0.03, s.warm)];
  s.sat = lerp(1.1, 1.26, s.warm) + s.night * 0.1;
  s.vignette = 0.9;
  s.contrast = lerp(0.2, 0.42, s.warm) + s.night * 0.1;
  s.cloudK = 0.85;
  return s;
}

/** Set the shared sky/lighting uniforms on a program's uniform table. */
export function applySkyUniforms(gl, u, s, camPos, time) {
  if (u.u_camPos) gl.uniform3fv(u.u_camPos, camPos);
  if (u.u_sunDir) gl.uniform3fv(u.u_sunDir, s.lightDir);
  if (u.u_skySun) gl.uniform3fv(u.u_skySun, s.sunDir);
  if (u.u_sunCol) gl.uniform3fv(u.u_sunCol, s.elevation > -1 ? s.sunCol : s.sunCol.map((v) => v * 0.6));
  if (u.u_zenith) gl.uniform3fv(u.u_zenith, s.zenith);
  if (u.u_horizon) gl.uniform3fv(u.u_horizon, s.horizon);
  if (u.u_horizon2) gl.uniform3fv(u.u_horizon2, s.horizon2);
  if (u.u_glowCol) gl.uniform3fv(u.u_glowCol, s.glow);
  if (u.u_ambSky) gl.uniform3fv(u.u_ambSky, s.ambSky);
  if (u.u_ambGround) gl.uniform3fv(u.u_ambGround, s.ambGround);
  if (u.u_night) gl.uniform1f(u.u_night, s.night);
  if (u.u_neon) gl.uniform1f(u.u_neon, s.neon);
  if (u.u_time) gl.uniform1f(u.u_time, time);
  if (u.u_fogDen) gl.uniform1f(u.u_fogDen, s.fogDen);
  if (u.u_fogStart) gl.uniform1f(u.u_fogStart, s.fogStart);
}
