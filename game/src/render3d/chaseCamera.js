// The 3D cameras. Driving: a chase camera behind and above the car that lags the steering,
// swings out to show the car's flank in a drift, pulls back and widens its field of view with
// speed. On foot: an over-the-shoulder camera that turns toward wherever the mouse aims. Title:
// a slow cinematic orbit. All of them keep out of buildings, take the simulation's impact shake,
// and project the mouse onto the street for aiming.
import { clamp, lerp, wrapAngle } from '../core/math.js';
import { mat4, perspective, lookAt, multiply, invert, project } from './math3d.js';
import { buildingsInRect } from '../world/collision.js';
import { roofHeight } from './heights.js';

export function createCam3d() {
  return {
    mode: 'chase', x: 0, y: 60, z: 0, tx: 0, ty: 0, tz: 0, yaw: 0, fov: 60, dist: 80, height: 32, swing: 0,
    w: 1280, h: 800, near: 2, far: 9500, view: mat4(), proj: mat4(), viewProj: mat4(), inv: mat4(),
    right: [1, 0, 0], up: [0, 1, 0], fwd: [0, 0, -1], snapped: false, orbitT: 0,
  };
}

const fwdOf = (a) => [Math.cos(a), Math.sin(a)];

/** Roof height of each vehicle model (the chase camera rides just above it). */
const ROOF_Y = { coupe: 11.8, sedan: 13.6, taxi: 13.6, police: 13.6, muscle: 12.8, van: 21, pickup: 16, bike: 14 };

/**
 * Within this distance of the eye the lit shader dithers geometry away (palms, poles, passing
 * cars), so nothing ever slices through the near plane in front of the camera.
 */
export const NEAR_FADE = 18;

/** Pull the eye in so no building stands between the subject and the camera. */
function keepClear(city, sx, sz, ex, ey, ez) {
  const dx = ex - sx;
  const dz = ez - sz;
  const d = Math.hypot(dx, dz);
  if (d < 1) return [ex, ey, ez];
  const list = buildingsInRect(city, Math.min(sx, ex) - 6, Math.min(sz, ez) - 6, Math.max(sx, ex) + 6, Math.max(sz, ez) + 6, []);
  const blocked = (x, z, y) => {
    for (const b of list) {
      if (b.x0 - 5 < x && x < b.x1 + 5 && b.y0 - 5 < z && z < b.y1 + 5 && roofHeight(b) > y - 4) return true;
    }
    return false;
  };
  let free = 0;
  const steps = Math.ceil(d / 3);
  for (let i = 1; i <= steps; i += 1) {
    const k = i / steps;
    if (blocked(sx + dx * k, sz + dz * k, 12 + (ey - 12) * k)) break;
    free = k;
  }
  if (free >= 1) return [ex, ey, ez];
  const k = Math.max(free, 10 / d);
  return [sx + dx * k, ey + (1 - k) * 8, sz + dz * k];
}

/**
 * Advance the camera toward its mode's ideal pose. view = { mode: 'chase' | 'foot' | 'orbit',
 * aim: {x, y} (foot), orbit: {x, y, r, h, speed, look}, snap, yawOffset, distK, heightK, fov }.
 */
export function updateCam3d(cam, game, view, dt) {
  const snap = view.snap || !cam.snapped;
  const k = (rate) => (snap ? 1 : 1 - Math.exp(-dt * rate));
  const pl = game.player;
  const shake = game.camera;
  const sx = (shake.shakeX ?? 0) * 0.3;
  const sy = (shake.shakeY ?? 0) * 0.3;
  cam.mode = view.mode;
  let eye;
  let target;
  if (view.mode === 'orbit') {
    const o = view.orbit;
    cam.orbitT = view.orbitT ?? cam.orbitT + dt;
    const a = o.sway ? o.a0 + Math.sin(cam.orbitT * o.speed) * o.sway : o.a0 + cam.orbitT * o.speed;
    eye = [o.x + Math.cos(a) * o.r, o.h, o.y + Math.sin(a) * o.r];
    const la = a + Math.PI + (o.turn ?? 0);
    target = [eye[0] + Math.cos(la) * o.look, o.lookH ?? 40, eye[2] + Math.sin(la) * o.look];
    cam.fov = o.fov ?? 55;
  } else if (view.mode === 'chase') {
    const v = pl.vehicle;
    const sp = Math.hypot(v.vx, v.vy);
    const fwdSp = v.vx * Math.cos(v.angle) + v.vy * Math.sin(v.angle);
    let yawT = v.angle;
    let slide = 0;
    if (sp > 60 && fwdSp > -20) {
      slide = wrapAngle(Math.atan2(v.vy, v.vx) - v.angle);
      yawT = v.angle + slide * 0.62;
    }
    cam.swing = lerp(cam.swing, clamp(slide, -0.7, 0.7) * 0.42, k(2.5));
    yawT += cam.swing + (view.yawOffset ?? 0);
    cam.yaw += wrapAngle(yawT - cam.yaw) * k(3.4);
    const speedK = clamp(sp / 600, 0, 1);
    // Low and close: the eye rides just above the roof, the car sits in the lower middle of the
    // frame and fills about a quarter of its width, pulling back a little as the speed builds.
    const roof = ROOF_Y[v.model] ?? 13;
    cam.dist = lerp(cam.dist, (58 + speedK * 26) * (view.distK ?? 1), k(2));
    cam.height = lerp(cam.height, (roof + 6.5 + speedK * 3) * (view.heightK ?? 1), k(2));
    cam.fov = lerp(cam.fov, view.fov ?? 60 + speedK * 16, k(2));
    const [fx, fz] = fwdOf(cam.yaw);
    const ahead = 22 + speedK * 26;
    target = [v.x + fx * ahead, roof * 0.55 + (view.lookUp ?? 0), v.y + fz * ahead];
    eye = [v.x - fx * cam.dist, cam.height, v.y - fz * cam.dist];
    if (view.sideOffset) {
      eye[0] += -fz * view.sideOffset;
      eye[2] += fx * view.sideOffset;
    }
    eye = keepClear(game.city, v.x, v.y, eye[0], eye[1], eye[2]);
  } else {
    const aim = view.aim ?? { x: pl.x + Math.cos(pl.angle) * 100, y: pl.y + Math.sin(pl.angle) * 100 };
    const aimA = Math.atan2(aim.y - pl.y, aim.x - pl.x);
    const diff = wrapAngle(aimA - cam.yaw);
    if (snap) cam.yaw = (view.yaw ?? aimA) + (view.yawOffset ?? 0);
    else if (Math.abs(diff) > 0.32) cam.yaw += (diff - Math.sign(diff) * 0.32) * Math.min(1, dt * 2.6);
    cam.fov = lerp(cam.fov, view.fov ?? 62, k(3));
    const [fx, fz] = fwdOf(cam.yaw);
    const rx = -fz;
    const rz = fx;
    // Over the right shoulder, close enough that Dez stands big in the left-middle of the frame.
    const dist = 44 * (view.distK ?? 1);
    const side = 13 * (view.sideK ?? 1);
    const hgt = 24 * (view.heightK ?? 1);
    const wantEye = [pl.x - fx * dist + rx * side, hgt, pl.y - fz * dist + rz * side];
    const wantT = [pl.x + fx * 70 + rx * 7, 14 + (view.lookUp ?? 0), pl.y + fz * 70 + rz * 7];
    const e = keepClear(game.city, pl.x + rx * 4, pl.y + rz * 4, wantEye[0], wantEye[1], wantEye[2]);
    const kk = k(9);
    eye = [lerp(cam.x, e[0], kk), lerp(cam.y, e[1], kk), lerp(cam.z, e[2], kk)];
    target = [lerp(cam.tx, wantT[0], kk), lerp(cam.ty, wantT[1], kk), lerp(cam.tz, wantT[2], kk)];
  }
  if (view.mode === 'chase') {
    // The chase camera is already smoothed through yaw and distance; ease position lightly.
    const kk = k(14);
    eye = [lerp(cam.x, eye[0], kk), lerp(cam.y, eye[1], kk), lerp(cam.z, eye[2], kk)];
    target = [lerp(cam.tx, target[0], kk), lerp(cam.ty, target[1], kk), lerp(cam.tz, target[2], kk)];
  }
  cam.x = eye[0];
  cam.y = eye[1];
  cam.z = eye[2];
  cam.tx = target[0];
  cam.ty = target[1];
  cam.tz = target[2];
  cam.ex = cam.x + sx;
  cam.ey = cam.y + sy * 0.5;
  cam.ez = cam.z + sy;
  cam.snapped = true;
}

/** The title screen's grade: a touch brighter with a lighter haze. */
export const TITLE_SKY = { exposureK: 1.12, fogK: 0.72 };

/**
 * The title camera: out over the ocean, looking west across the surf, Coral Strand and Deco Row
 * to the skyline and the setting sun, drifting slowly back and forth.
 */
export function titleOrbit(a0 = 0, turn = -0.12) {
  return { x: 5420, y: 2150, r: 820, h: 175, a0: a0, speed: 0.05, sway: 0.22, look: 900, lookH: 100, turn, fov: 56 };
}

/** Recompute view/projection for a w x h viewport. */
export function cam3dMatrices(cam, w, h) {
  cam.w = w;
  cam.h = h;
  const ex = cam.ex ?? cam.x;
  const ey = cam.ey ?? cam.y;
  const ez = cam.ez ?? cam.z;
  lookAt(cam.view, ex, ey, ez, cam.tx, cam.ty, cam.tz);
  perspective(cam.proj, (cam.fov * Math.PI) / 180, w / h, cam.near, cam.far);
  multiply(cam.viewProj, cam.proj, cam.view);
  invert(cam.inv, cam.viewProj);
  const v = cam.view;
  cam.right = [v[0], v[4], v[8]];
  cam.up = [v[1], v[5], v[9]];
  cam.fwd = [-v[2], -v[6], -v[10]];
  cam.pos = [ex, ey, ez];
}

/** The world ray under screen pixel (sx, sy). */
export function screenRay(cam, sx, sy) {
  const nx = (sx / cam.w) * 2 - 1;
  const ny = 1 - (sy / cam.h) * 2;
  const a = project(cam.inv, nx, ny, -1);
  const b = project(cam.inv, nx, ny, 1);
  const p0 = [a[0] / a[3], a[1] / a[3], a[2] / a[3]];
  const p1 = [b[0] / b[3], b[1] / b[3], b[2] / b[3]];
  const d = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]];
  const l = Math.hypot(d[0], d[1], d[2]) || 1;
  return { o: p0, d: [d[0] / l, d[1] / l, d[2] / l] };
}

/**
 * Where the mouse points on the plane y = planeY, as simulation (x, y). Rays at or above the
 * horizon land far out along their heading instead.
 */
export function screenToPlane(cam, sx, sy, planeY = 0, far = 700) {
  const r = screenRay(cam, sx, sy);
  if (r.d[1] < -0.02) {
    const t = (planeY - r.o[1]) / r.d[1];
    if (t > 0) {
      const x = r.o[0] + r.d[0] * t;
      const z = r.o[2] + r.d[2] * t;
      const hx = x - cam.x;
      const hz = z - cam.z;
      const hd = Math.hypot(hx, hz);
      if (hd < far * 1.6) return { x, y: z };
    }
  }
  const hl = Math.hypot(r.d[0], r.d[2]) || 1;
  return { x: cam.x + (r.d[0] / hl) * far, y: cam.z + (r.d[2] / hl) * far };
}

/** Screen position of a world point (x, y up, z = sim y); `behind` when it is behind the eye. */
export function worldToScreen3d(cam, x, y, z) {
  const c = project(cam.viewProj, x, y, z);
  if (c[3] <= 0.01) return { x: -9999, y: -9999, behind: true };
  return { x: ((c[0] / c[3]) * 0.5 + 0.5) * cam.w, y: (1 - ((c[1] / c[3]) * 0.5 + 0.5)) * cam.h, behind: false, depth: c[3] };
}
