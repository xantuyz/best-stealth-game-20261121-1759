// Sound: footsteps and pebble impacts travel as expanding rings, and a guard only walks
// toward a sound it actually heard. Walls muffle sound: each wall tile the sound crosses
// shrinks the radius that reaches the guard, so a splash behind a shelf is easy to miss.
import { COLS, NOISE, T, TILE } from './config.js';
import { tileAtPoint } from './level.js';

/** Count the wall/shelf tiles a straight segment crosses (used to muffle sound). */
export function countWallsCrossed(level, x0, y0, x1, y1) {
  const dist = Math.hypot(x1 - x0, y1 - y0);
  const steps = Math.max(1, Math.ceil(dist / 8));
  let walls = 0;
  let lastKey = -1;
  for (let i = 1; i < steps; i += 1) {
    const t = i / steps;
    const { tx, ty } = tileAtPoint(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t);
    const code = level.grid[ty * COLS + tx];
    const key = ty * COLS + tx;
    if ((code === T.WALL || code === T.SHELF) && key !== lastKey) {
      walls += 1;
      lastKey = key;
    }
  }
  return walls;
}

/** True when a guard at its position hears a noise of `radiusTiles` at (x, y). */
export function guardHearsNoise(level, guard, x, y, radiusTiles) {
  const distTiles = Math.hypot(guard.x - x, guard.y - y) / TILE;
  const muffled = radiusTiles - countWallsCrossed(level, guard.x, guard.y, x, y) * NOISE.wallDampTiles;
  return distTiles <= Math.max(0.5, muffled);
}

/**
 * Emit a noise: every guard that hears it turns to investigate the spot, and a ring is drawn
 * so the player can see how far the sound travelled. Returns the guards that heard it.
 */
export function propagateFootstepsAndDistractions(state, x, y, radiusTiles, kind) {
  const radiusPx = radiusTiles * TILE;
  state.rings.push({ x, y, radius: 6, maxRadius: radiusPx, ttl: 0.9, kind });
  const heard = [];
  for (const guard of state.guards) {
    if (guardHearsNoise(state.level, guard, x, y, radiusTiles)) heard.push(guard);
  }
  return heard;
}
