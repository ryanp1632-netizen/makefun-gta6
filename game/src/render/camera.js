// The chase camera: it follows the player, leans ahead of their motion, pulls back as speed
// rises, shakes on impacts, and defines the perspective that lifts building roofs off the map.
import { clamp, lerp } from '../core/math.js';

/** Height of the virtual camera above the street, in world units (sets the 2.5D lean). */
export const CAM_HEIGHT = 1500;

export function createCamera() {
  return { x: 3000, y: 2400, zoom: 1, targetZoom: 1, leadX: 0, leadY: 0, trauma: 0, shakeX: 0, shakeY: 0, w: 1280, h: 800, t: 0 };
}

/** Add camera shake (0..1 trauma, decays over time). */
export function addShake(cam, amount, scale = 1) {
  cam.trauma = clamp(cam.trauma + amount * scale, 0, 1);
}

/** Follow (x, y) moving at (vx, vy); `onFoot` keeps the camera tighter and biased toward the aim. */
export function updateCamera(cam, target, dt, shakeScale = 1) {
  cam.t += dt;
  const speed = Math.hypot(target.vx, target.vy);
  const baseZoom = target.onFoot ? 1.18 : 1.0;
  cam.targetZoom = clamp(baseZoom - speed / 1300, 0.6, 1.25) * (target.zoomBias ?? 1);
  cam.zoom = lerp(cam.zoom, cam.targetZoom, 1 - Math.exp(-dt * 1.6));
  const leadK = target.onFoot ? 0.25 : 0.55;
  const lx = clamp(target.vx * leadK, -260, 260) + (target.aimX ?? 0);
  const ly = clamp(target.vy * leadK, -200, 200) + (target.aimY ?? 0);
  cam.leadX = lerp(cam.leadX, lx, 1 - Math.exp(-dt * 2.2));
  cam.leadY = lerp(cam.leadY, ly, 1 - Math.exp(-dt * 2.2));
  cam.x = lerp(cam.x, target.x + cam.leadX, 1 - Math.exp(-dt * 7));
  cam.y = lerp(cam.y, target.y + cam.leadY, 1 - Math.exp(-dt * 7));
  cam.trauma = Math.max(0, cam.trauma - dt * 1.4);
  const s = cam.trauma * cam.trauma * 22 * shakeScale;
  cam.shakeX = Math.sin(cam.t * 61.7) * s + Math.sin(cam.t * 23.1) * s * 0.5;
  cam.shakeY = Math.cos(cam.t * 53.3) * s + Math.sin(cam.t * 31.9) * s * 0.5;
}

/** Snap the camera onto a target (after teleports and in screenshot staging). */
export function snapCamera(cam, x, y, zoom = null) {
  cam.x = x;
  cam.y = y;
  cam.leadX = 0;
  cam.leadY = 0;
  if (zoom !== null) {
    cam.zoom = zoom;
    cam.targetZoom = zoom;
  }
}

/** The world rectangle the screen shows (with a margin). */
export function viewRect(cam, margin = 0) {
  const hw = cam.w / 2 / cam.zoom + margin;
  const hh = cam.h / 2 / cam.zoom + margin;
  return { x0: cam.x - hw, y0: cam.y - hh, x1: cam.x + hw, y1: cam.y + hh };
}

/** Put the world transform on a context (centre of screen = camera, with shake). */
export function applyWorldTransform(ctx, cam) {
  ctx.setTransform(cam.zoom, 0, 0, cam.zoom, cam.w / 2 - (cam.x + cam.shakeX) * cam.zoom, cam.h / 2 - (cam.y + cam.shakeY) * cam.zoom);
}

/** Perspective scale of a point at height h: roofs grow away from the view centre. */
export function heightScale(h) {
  return CAM_HEIGHT / (CAM_HEIGHT - Math.min(h, CAM_HEIGHT * 0.8));
}

export function screenToWorld(cam, sx, sy) {
  return { x: (sx - cam.w / 2) / cam.zoom + cam.x + cam.shakeX, y: (sy - cam.h / 2) / cam.zoom + cam.y + cam.shakeY };
}

export function worldToScreen(cam, x, y) {
  return { x: (x - cam.x - cam.shakeX) * cam.zoom + cam.w / 2, y: (y - cam.y - cam.shakeY) * cam.zoom + cam.h / 2 };
}
