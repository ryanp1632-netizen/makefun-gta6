// Draws one frame of the city in layers: cached ground and surf, sun shadows, street-level life
// (people, cars, boats, smoke), the light buffer multiplied over it, then everything tall sorted
// far to near (buildings, palms, lamps, umbrellas, cranes), the helicopter, additive glows and
// a final colour grade with a vignette.
import { applyWorldTransform, viewRect, heightScale } from './camera.js';
import { drawGround, drawWaterFx } from './groundChunks.js';
import { drawBuilding, drawShadows, depthKey } from './buildingRenderer.js';
import { drawBoat, drawCrane, drawLamp, drawPlane, drawTowel, drawTree, drawUmbrella } from './propRenderer.js';
import { drawVehicle, drawVehicleShadow } from './vehicleArt.js';
import { drawPerson } from './characterArt.js';
import { drawParticlesGlow, drawParticlesLow } from './particles.js';
import { applyLighting, createLighting, drawGroundStrobes, drawLensGlows } from './lighting.js';
import { drawHelicopter, drawHeliShadow, drawSearchBeam } from './aircraftArt.js';
import { buildingsInRect } from '../world/collision.js';
import { missionMarkers } from '../missions/missionRunner.js';

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  return { canvas, ctx, lighting: createLighting(), list: [] };
}

const inRect = (o, v) => o.x > v.x0 && o.x < v.x1 && o.y > v.y0 && o.y < v.y1;

/** World markers: mission targets, taxi fares, the Sunset Tapes. */
function collectMarkers(game, view) {
  const out = missionMarkers(game).filter((m) => inRect(m, viewRectPad(view, 200)));
  const a = game.activity;
  if (a && a.kind === 'taxi') out.push({ x: a.x, y: a.y, r: 50, color: '#ffd166', rgb: '255,209,102', kind: 'target' });
  return out;
}

function viewRectPad(v, m) {
  return { x0: v.x0 - m, y0: v.y0 - m, x1: v.x1 + m, y1: v.y1 + m };
}

function drawMarkerRing(ctx, m, t) {
  if (m.small || m.kind === 'enemy') return;
  const pulse = 0.85 + Math.sin(t * 4) * 0.15;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const r = (m.r || 30) * pulse;
  const g = ctx.createRadialGradient(m.x, m.y, r * 0.2, m.x, m.y, r);
  g.addColorStop(0, `rgba(${m.rgb},0.05)`);
  g.addColorStop(0.8, `rgba(${m.rgb},0.35)`);
  g.addColorStop(1, `rgba(${m.rgb},0)`);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(m.x, m.y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = `rgba(${m.rgb},0.9)`;
  ctx.lineWidth = 3;
  ctx.setLineDash([10, 8]);
  ctx.lineDashOffset = -t * 20;
  ctx.beginPath();
  ctx.arc(m.x, m.y, r * 0.92, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
}

function drawMarkerBeacon(ctx, m, cam, t) {
  if (m.small || m.kind === 'checkpoint2') return;
  const top = heightScale(m.kind === 'contact' ? 70 : 110);
  const tx = cam.x + (m.x - cam.x) * top;
  const ty = cam.y + (m.y - cam.y) * top;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const w = m.kind === 'enemy' ? 4 : 10;
  const g = ctx.createLinearGradient(m.x, m.y, tx, ty);
  g.addColorStop(0, `rgba(${m.rgb},0.65)`);
  g.addColorStop(1, `rgba(${m.rgb},0)`);
  ctx.fillStyle = g;
  const dx = tx - m.x;
  const dy = ty - m.y;
  const l = Math.hypot(dx, dy) || 1;
  const nx = (-dy / l) * w;
  const ny = (dx / l) * w;
  ctx.beginPath();
  ctx.moveTo(m.x + nx, m.y + ny);
  ctx.lineTo(tx + nx * 0.6, ty + ny * 0.6);
  ctx.lineTo(tx - nx * 0.6, ty - ny * 0.6);
  ctx.lineTo(m.x - nx, m.y - ny);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  if (m.kind === 'contact') {
    const bob = Math.sin(t * 3) * 4;
    ctx.save();
    ctx.translate(tx, ty + bob);
    ctx.fillStyle = m.color;
    ctx.beginPath();
    ctx.arc(0, 0, 13, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#1a1030';
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ctx.fillStyle = '#1a1030';
    ctx.font = '900 15px "Arial Black", Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(m.letter, 0, 1);
    ctx.restore();
  }
}

function drawTape(ctx, tape, t) {
  const s = 1 + Math.sin(t * 3 + tape.id) * 0.12;
  ctx.save();
  ctx.translate(tape.x, tape.y);
  ctx.globalCompositeOperation = 'lighter';
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 26);
  g.addColorStop(0, 'rgba(255,126,182,0.6)');
  g.addColorStop(1, 'rgba(255,126,182,0)');
  ctx.fillStyle = g;
  ctx.fillRect(-26, -26, 52, 52);
  ctx.globalCompositeOperation = 'source-over';
  ctx.scale(s, s);
  ctx.rotate(Math.sin(t + tape.id) * 0.3);
  ctx.fillStyle = '#1d1f24';
  ctx.fillRect(-10, -6.5, 20, 13);
  ctx.fillStyle = '#ff7eb6';
  ctx.fillRect(-8, -5, 16, 5);
  ctx.fillStyle = '#ffd166';
  ctx.fillRect(-8, -1, 16, 1.5);
  ctx.fillStyle = '#f4f1de';
  ctx.beginPath();
  ctx.arc(-4, 2.5, 2, 0, Math.PI * 2);
  ctx.arc(4, 2.5, 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** The colour grade: warm sunset wash, cool night, vignette. */
function grade(ctx, cam, light) {
  const w = cam.w;
  const h = cam.h;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  if (light.warm > 0.05) {
    ctx.globalCompositeOperation = 'soft-light';
    const g = ctx.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, `rgba(255,140,30,${0.5 * light.warm})`);
    g.addColorStop(0.55, `rgba(255,150,70,${0.22 * light.warm})`);
    g.addColorStop(1, `rgba(60,40,140,${0.42 * light.warm})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'lighter';
    const sun = ctx.createRadialGradient(0, 0, 0, 0, 0, w * 0.75);
    sun.addColorStop(0, `rgba(255,150,60,${0.2 * light.warm})`);
    sun.addColorStop(1, 'rgba(255,170,80,0)');
    ctx.fillStyle = sun;
    ctx.fillRect(0, 0, w, h);
  }
  if (light.night > 0.3) {
    ctx.globalCompositeOperation = 'soft-light';
    ctx.fillStyle = `rgba(40,60,150,${0.28 * light.night})`;
    ctx.fillRect(0, 0, w, h);
  }
  ctx.globalCompositeOperation = 'source-over';
  const v = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.45, w / 2, h / 2, Math.max(w, h) * 0.75);
  v.addColorStop(0, 'rgba(0,0,0,0)');
  v.addColorStop(1, 'rgba(10,6,24,0.45)');
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, w, h);
}

/** Render the world from the game's camera (HUD and menus are drawn on top by the caller). */
export function renderWorld(r, game, chunkBudget = 2) {
  const ctx = r.ctx;
  const cam = game.camera;
  cam.w = r.canvas.width;
  cam.h = r.canvas.height;
  const light = game.light;
  const t = game.t;
  const city = game.city;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#137a9a';
  ctx.fillRect(0, 0, cam.w, cam.h);
  const view = viewRect(cam, 40);
  const tall = viewRect(cam, 420);
  applyWorldTransform(ctx, cam);
  drawGround(ctx, game.ground, view, chunkBudget);
  drawWaterFx(ctx, city, view, t, light);
  const buildings = buildingsInRect(city, tall.x0, tall.y0, tall.x1, tall.y1, []);
  const trees = city.trees.filter((o) => inRect(o, tall));
  const lamps = city.lamps.filter((o) => inRect(o, tall));
  const umbrellas = city.umbrellas.filter((o) => inRect(o, viewRectPad(view, 60)));
  const vehicles = game.vehicles.filter((v) => inRect(v, viewRectPad(view, 60)));
  const markers = collectMarkers(game, view);
  drawShadows(ctx, buildings, trees, light);
  for (const b of city.boats) if (inRect(b, viewRectPad(view, 260))) drawBoat(ctx, b, light, t);
  for (const p of city.planes) if (inRect(p, viewRectPad(view, 100))) drawPlane(ctx, p, light);
  for (const u of umbrellas) drawTowel(ctx, u);
  for (const tape of city.collectibles) if (!game.economy.tapes.includes(tape.id) && inRect(tape, view)) drawTape(ctx, tape, t);
  for (const m of markers) drawMarkerRing(ctx, m, t);
  for (const p of game.peds) if (p.dead && inRect(p, view)) drawPerson(ctx, p, light, t);
  for (const v of vehicles) drawVehicleShadow(ctx, v, light);
  for (const v of vehicles) drawVehicle(ctx, v, light, t);
  for (const p of game.peds) if (!p.dead && !p.removed && inRect(p, view)) drawPerson(ctx, p, light, t);
  const pl = game.player;
  if (!pl.vehicle && !(pl.dead && game.downCause === 'arrest')) drawPerson(ctx, { ...pl, dead: pl.dead, look: pl.look }, light, t);
  if (game.heli) drawHeliShadow(ctx, game.heli, light);
  drawGroundStrobes(ctx, { vehicles, t });
  drawParticlesLow(ctx, game.fx);
  const searchlight = game.heli ? { x: game.heli.lightX, y: game.heli.lightY, r: 85 } : null;
  applyLighting(ctx, r.lighting, cam, light, { lamps, buildings, vehicles, markers, particles: game.fx.list, searchlight, t }, view);
  applyWorldTransform(ctx, cam);
  if (game.heli) drawSearchBeam(ctx, game.heli, cam, 1 - light.night);
  // Tall things, far to near.
  const list = r.list;
  list.length = 0;
  for (const b of buildings) list.push({ o: b, k: depthKey(b, cam), type: 0 });
  for (const tr of trees) list.push({ o: tr, k: depthKey(tr, cam), type: 1 });
  for (const l of lamps) list.push({ o: l, k: depthKey(l, cam), type: 2 });
  for (const u of umbrellas) list.push({ o: u, k: depthKey(u, cam), type: 3 });
  for (const c of city.cranes) if (inRect(c, tall)) list.push({ o: c, k: depthKey(c, cam), type: 4 });
  list.sort((a, b) => b.k - a.k);
  for (const it of list) {
    if (it.type === 0) drawBuilding(ctx, it.o, cam, light, t);
    else if (it.type === 1) drawTree(ctx, it.o, cam, light, t);
    else if (it.type === 2) drawLamp(ctx, it.o, cam, light);
    else if (it.type === 3) drawUmbrella(ctx, it.o, cam, light);
    else drawCrane(ctx, it.o, cam, light);
  }
  for (const m of markers) drawMarkerBeacon(ctx, m, cam, t);
  if (game.heli) drawHelicopter(ctx, game.heli, cam, light, t);
  drawLensGlows(ctx, { vehicles, lamps, t }, light);
  drawParticlesGlow(ctx, game.fx);
  grade(ctx, cam, light);
}
