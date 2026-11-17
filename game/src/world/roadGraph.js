// The road network as a graph: intersections and dead ends are nodes, the stretches of road
// between them are edges with one or two lanes each way. Traffic follows lanes along edges,
// police and racers ask it for paths, pedestrians walk its sidewalks.

export const LANE_W = 30;
export const SIDEWALK = 22;
const NODE_CELL = 400;

/** Build nodes and edges from the city's axis-aligned road lines (city.roads). */
export function buildRoadGraph(city) {
  const nodes = [];
  const byKey = new Map();
  function nodeAt(x, y) {
    const key = `${x},${y}`;
    let node = byKey.get(key);
    if (!node) {
      node = { id: nodes.length, x, y, edges: [], hw: 0 };
      nodes.push(node);
      byKey.set(key, node);
    }
    return node;
  }
  const verticals = city.roads.filter((r) => r.vertical);
  const horizontals = city.roads.filter((r) => !r.vertical);
  const stops = city.roads.map(() => []);
  for (const v of verticals) {
    for (const h of horizontals) {
      if (v.x0 >= h.x0 && v.x0 <= h.x1 && h.y0 >= v.y0 && h.y0 <= v.y1) {
        const node = nodeAt(v.x0, h.y0);
        node.hw = Math.max(node.hw, v.hw, h.hw);
        stops[v.id].push(node);
        stops[h.id].push(node);
      }
    }
  }
  for (const road of city.roads) {
    const a = nodeAt(road.x0, road.y0);
    const b = nodeAt(road.x1, road.y1);
    a.hw = Math.max(a.hw, road.hw);
    b.hw = Math.max(b.hw, road.hw);
    stops[road.id].push(a, b);
  }
  const edges = [];
  for (const road of city.roads) {
    const list = [...new Set(stops[road.id])];
    list.sort((p, q) => (road.vertical ? p.y - q.y : p.x - q.x));
    for (let i = 0; i + 1 < list.length; i += 1) {
      const a = list[i];
      const b = list[i + 1];
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      if (len < 1) continue;
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2;
      const edge = {
        id: edges.length, a: a.id, b: b.id, len, lanes: road.lanes, hw: road.hw, road,
        dx: (b.x - a.x) / len, dy: (b.y - a.y) / len, mx, my,
        bridge: city.terrain.sdf(mx, my) > -20,
      };
      edges.push(edge);
      a.edges.push(edge.id);
      b.edges.push(edge.id);
    }
  }
  city.nodes = nodes;
  city.edges = edges;
  // Buckets for nearest-node queries.
  const cols = Math.ceil(city.width / NODE_CELL);
  const rows = Math.ceil(city.height / NODE_CELL);
  city.nodeGrid = { cols, rows, cells: Array.from({ length: cols * rows }, () => []) };
  for (const node of nodes) {
    const cx = Math.min(cols - 1, Math.max(0, Math.floor(node.x / NODE_CELL)));
    const cy = Math.min(rows - 1, Math.max(0, Math.floor(node.y / NODE_CELL)));
    city.nodeGrid.cells[cy * cols + cx].push(node);
  }
}

/** The node closest to (x, y). */
export function nearestNode(city, x, y) {
  const g = city.nodeGrid;
  const cx = Math.floor(x / NODE_CELL);
  const cy = Math.floor(y / NODE_CELL);
  let best = null;
  let bestD = Infinity;
  for (let radius = 0; radius < 6 && (best === null || radius < 2); radius += 1) {
    for (let j = cy - radius; j <= cy + radius; j += 1) {
      for (let i = cx - radius; i <= cx + radius; i += 1) {
        if (i < 0 || j < 0 || i >= g.cols || j >= g.rows) continue;
        if (Math.max(Math.abs(i - cx), Math.abs(j - cy)) !== radius) continue;
        for (const node of g.cells[j * g.cols + i]) {
          const d = (node.x - x) ** 2 + (node.y - y) ** 2;
          if (d < bestD) {
            bestD = d;
            best = node;
          }
        }
      }
    }
  }
  return best ?? city.nodes[0];
}

/** The node at the far end of `edge` from node id `from`. */
export function otherEnd(edge, from) {
  return edge.a === from ? edge.b : edge.a;
}

/** A point in lane `lane` (0 = kerbside... counted from the centre) of `edge`, travelling away from node `from`, `along` units in. */
export function lanePoint(city, edge, from, lane, along) {
  const start = city.nodes[from];
  const sign = edge.a === from ? 1 : -1;
  const dx = edge.dx * sign;
  const dy = edge.dy * sign;
  const offset = (lane + 0.5) * LANE_W;
  // Right-hand traffic: the right of (dx, dy) on a y-down screen is (-dy, dx).
  return { x: start.x + dx * along - dy * offset, y: start.y + dy * along + dx * offset, dx, dy };
}

/** A sidewalk point beside `edge`, `side` = 1 right / -1 left of the a->b direction. */
export function sidewalkPoint(city, edge, side, along) {
  const a = city.nodes[edge.a];
  const offset = (edge.hw + SIDEWALK * 0.5) * side;
  return { x: a.x + edge.dx * along - edge.dy * offset, y: a.y + edge.dy * along + edge.dx * offset };
}

/** Pick the edge to take on arriving at node `at` along `edge` (no U-turn unless it is a dead end). */
export function chooseNextEdge(city, rng, edge, at) {
  const node = city.nodes[at];
  const options = node.edges.filter((id) => id !== edge.id);
  if (options.length === 0) return edge;
  return city.edges[options[Math.floor(rng.next() * options.length)]];
}

/** A* over the graph: the node ids from `fromId` to `toId` (inclusive), or [] when unreachable. */
export function findPath(city, fromId, toId) {
  if (fromId === toId) return [fromId];
  const nodes = city.nodes;
  const goal = nodes[toId];
  const g = new Map([[fromId, 0]]);
  const came = new Map();
  const open = [fromId];
  const f = new Map([[fromId, Math.hypot(nodes[fromId].x - goal.x, nodes[fromId].y - goal.y)]]);
  const closed = new Set();
  let guard = 0;
  while (open.length > 0 && guard < 4000) {
    guard += 1;
    let bi = 0;
    for (let i = 1; i < open.length; i += 1) if (f.get(open[i]) < f.get(open[bi])) bi = i;
    const current = open.splice(bi, 1)[0];
    if (current === toId) {
      const path = [current];
      let c = current;
      while (came.has(c)) {
        c = came.get(c);
        path.push(c);
      }
      return path.reverse();
    }
    closed.add(current);
    for (const eid of nodes[current].edges) {
      const edge = city.edges[eid];
      const next = otherEnd(edge, current);
      if (closed.has(next)) continue;
      const cost = g.get(current) + edge.len;
      if (!g.has(next) || cost < g.get(next)) {
        g.set(next, cost);
        came.set(next, current);
        f.set(next, cost + Math.hypot(nodes[next].x - goal.x, nodes[next].y - goal.y));
        if (!open.includes(next)) open.push(next);
      }
    }
  }
  return [];
}

/** Project (x, y) onto edge: {along, side, lateral}. */
export function projectOnEdge(city, edge, x, y) {
  const a = city.nodes[edge.a];
  const rx = x - a.x;
  const ry = y - a.y;
  const along = rx * edge.dx + ry * edge.dy;
  const lateral = -rx * edge.dy + ry * edge.dx;
  return { along, lateral };
}
