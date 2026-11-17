// The HKPD helicopter: drawn at altitude with the same perspective as the rooftops, its shadow
// thrown onto the street below, a spinning rotor disc and the searchlight beam.
import { heightScale } from './camera.js';
import { rgb } from '../core/math.js';

function proj(cam, x, y, h) {
  const f = heightScale(h);
  return { x: cam.x + (x - cam.x) * f, y: cam.y + (y - cam.y) * f, f };
}

export function drawHeliShadow(ctx, h, light) {
  ctx.save();
  ctx.translate(h.x + light.shadowX * 40, h.y + light.shadowY * 40);
  ctx.rotate(h.angle);
  ctx.fillStyle = 'rgba(20,18,40,0.22)';
  ctx.beginPath();
  ctx.ellipse(0, 0, 22, 10, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillRect(-46, -2, 30, 4);
  ctx.beginPath();
  ctx.arc(0, 0, 34, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(20,18,40,0.08)';
  ctx.fill();
  ctx.restore();
}

/** Searchlight pool on the ground (additive, also readable by day) and the beam up to the heli. */
export function drawSearchBeam(ctx, h, cam, day = 0) {
  const p = proj(cam, h.x, h.y, h.alt);
  ctx.globalCompositeOperation = 'lighter';
  const g = ctx.createRadialGradient(h.lightX, h.lightY, 0, h.lightX, h.lightY, 80);
  g.addColorStop(0, `rgba(255,255,230,${0.55 - day * 0.3})`);
  g.addColorStop(0.75, `rgba(255,255,230,${0.3 - day * 0.15})`);
  g.addColorStop(1, 'rgba(255,255,230,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(h.lightX, h.lightY, 80, 0, Math.PI * 2);
  ctx.fill();
  const dx = h.lightX - p.x;
  const dy = h.lightY - p.y;
  const l = Math.hypot(dx, dy) || 1;
  const nx = -dy / l;
  const ny = dx / l;
  const beam = ctx.createLinearGradient(p.x, p.y, h.lightX, h.lightY);
  beam.addColorStop(0, 'rgba(255,255,230,0.3)');
  beam.addColorStop(1, 'rgba(255,255,230,0.05)');
  ctx.fillStyle = beam;
  ctx.beginPath();
  ctx.moveTo(p.x + nx * 3, p.y + ny * 3);
  ctx.lineTo(h.lightX + nx * 60, h.lightY + ny * 60);
  ctx.lineTo(h.lightX - nx * 60, h.lightY - ny * 60);
  ctx.lineTo(p.x - nx * 3, p.y - ny * 3);
  ctx.closePath();
  ctx.fill();
  ctx.globalCompositeOperation = 'source-over';
}

export function drawHelicopter(ctx, h, cam, light, t) {
  const p = proj(cam, h.x, h.y, h.alt);
  const amb = light.ambient;
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.scale(p.f * 1.15, p.f * 1.15);
  ctx.rotate(h.angle);
  ctx.fillStyle = rgb([24, 34, 60], 1, 1, amb);
  ctx.fillRect(-50, -2.5, 34, 5);
  ctx.fillRect(-52, -9, 6, 18);
  const g = ctx.createLinearGradient(0, -11, 0, 11);
  g.addColorStop(0, rgb([30, 50, 96], 1, 1, amb));
  g.addColorStop(0.5, rgb([60, 96, 170], 1, 1, amb));
  g.addColorStop(1, rgb([24, 36, 70], 1, 1, amb));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(0, 0, 22, 11, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = rgb([240, 240, 236], 1, 1, amb);
  ctx.fillRect(-14, -11, 18, 3);
  ctx.fillRect(-14, 8, 18, 3);
  ctx.fillStyle = 'rgba(140,200,255,0.8)';
  ctx.beginPath();
  ctx.ellipse(12, 0, 8, 7, 0, -Math.PI / 2, Math.PI / 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(200,220,240,0.12)';
  ctx.beginPath();
  ctx.arc(0, 0, 36, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(20,20,24,0.75)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  for (let i = 0; i < 4; i += 1) {
    const a = h.rotor + (i * Math.PI) / 2;
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.cos(a) * 36, Math.sin(a) * 36);
  }
  ctx.stroke();
  ctx.fillStyle = Math.sin(t * 9) > 0 ? '#ff3344' : '#3355ff';
  ctx.beginPath();
  ctx.arc(-6, 0, 2.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}
