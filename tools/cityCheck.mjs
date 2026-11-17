// Headless check of the city generator: builds a few seeds, prints counts and timings, and
// fails if the road graph is disconnected or a landmark sits in the water.
import { generateCity } from '../game/src/world/cityGenerator.js';
import { findPath } from '../game/src/world/roadGraph.js';

for (const seed of [1, 2, 3]) {
  const t0 = performance.now();
  const city = generateCity(seed);
  const ms = (performance.now() - t0).toFixed(0);
  let reachable = 0;
  for (const node of city.nodes) if (findPath(city, 0, node.id).length > 0) reachable += 1;
  const wet = Object.entries(city.pois).filter(([, p]) => city.terrain.sdf(p.x, p.y) > 0).map(([k]) => k);
  const coast = city.coastCells.cells.reduce((n, c) => n + c.length, 0);
  console.log(`seed ${seed}: ${ms} ms, roads ${city.roads.length}, nodes ${city.nodes.length} (${reachable} reachable), edges ${city.edges.length}, blocks ${city.blocks.length}, lots ${city.lots.length}, buildings ${city.buildings.length}, trees ${city.trees.length}, lamps ${city.lamps.length}, umbrellas ${city.umbrellas.length}, boats ${city.boats.length}, parked ${city.parked.length}, tapes ${city.collectibles.length}, coast ${coast}`);
  if (reachable !== city.nodes.length) throw new Error('road graph is disconnected');
  if (wet.length) throw new Error(`landmarks in water: ${wet.join(', ')}`);
}
