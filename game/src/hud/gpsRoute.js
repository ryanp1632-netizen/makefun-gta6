// The GPS route: the shortest way along the road graph from the player to wherever the story (or
// the taxi fare) wants them next. The radar and the city map both draw it as a glowing line.
// The path is cached by its end nodes, so it is only searched again when either end moves on.
import { findPath, nearestNode } from '../world/roadGraph.js';
import { missionMarkers } from '../missions/missionRunner.js';

/** Where the GPS leads: the job objective, a race checkpoint, the taxi fare or the next contact. */
export function gpsTarget(game) {
  const a = game.activity;
  if (a && a.kind === 'taxi') return { x: a.x, y: a.y, color: '#ffd166' };
  const marks = missionMarkers(game).filter((m) => !m.small && m.kind !== 'checkpoint2');
  return marks.length ? marks[0] : null;
}

const cache = { city: null, key: '', ids: [] };

/** { pts: [{x, y}...], color, length } from the player to the GPS target, or null when close. */
export function gpsRoute(game) {
  const tgt = gpsTarget(game);
  if (!tgt) return null;
  const pl = game.player;
  const f = pl.vehicle ?? pl;
  if (Math.hypot(tgt.x - f.x, tgt.y - f.y) < 90) return null;
  const city = game.city;
  const a = nearestNode(city, f.x, f.y);
  const b = nearestNode(city, tgt.x, tgt.y);
  const key = `${a.id}>${b.id}`;
  if (cache.city !== city || cache.key !== key) {
    cache.city = city;
    cache.key = key;
    cache.ids = findPath(city, a.id, b.id);
  }
  const pts = [{ x: f.x, y: f.y }];
  for (const id of cache.ids) pts.push(city.nodes[id]);
  pts.push({ x: tgt.x, y: tgt.y });
  // Skip the first node when it lies behind the player (already passed the junction).
  if (pts.length > 3) {
    const n0 = pts[1];
    const n1 = pts[2];
    if ((n0.x - f.x) * (n1.x - n0.x) + (n0.y - f.y) * (n1.y - n0.y) < 0 && Math.hypot(n1.x - f.x, n1.y - f.y) < Math.hypot(n1.x - n0.x, n1.y - n0.y)) pts.splice(1, 1);
  }
  let length = 0;
  for (let i = 1; i < pts.length; i += 1) length += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  return { pts, color: tgt.color ?? '#ffd166', length };
}

/** Stroke the route in the current transform (world units), with a dark casing under it. */
export function strokeRoute(ctx, route, width) {
  if (!route) return;
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.beginPath();
  route.pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
  ctx.strokeStyle = 'rgba(10,6,24,0.8)';
  ctx.lineWidth = width * 1.8;
  ctx.stroke();
  ctx.strokeStyle = route.color;
  ctx.lineWidth = width;
  ctx.stroke();
  ctx.restore();
}
