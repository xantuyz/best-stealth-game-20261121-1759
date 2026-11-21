// Grid pathfinding for guards: breadth-first search over walkable tiles, so an investigating
// or chasing guard walks around shelves and cover crates instead of through them. Guards only
// ever move toward a position they actually saw or heard; the search never targets the player.
import { ARENA_X, ARENA_Y, COLS, ROWS, TILE } from './config.js';
import { isSolidTile, tileAtPoint, tileCenter } from './level.js';

/**
 * A walkable route from a canvas point to a tile, as canvas waypoints (tile centres).
 * Returns [] when the destination cannot be reached.
 */
export function findWalkableGridPath(level, fromX, fromY, toTx, toTy) {
  const start = tileAtPoint(fromX, fromY);
  if (isSolidTile(level, toTx, toTy)) return [];
  if (start.tx === toTx && start.ty === toTy) return [tileCenter(toTx, toTy)];
  const prev = new Int32Array(COLS * ROWS).fill(-1);
  const queue = [start.ty * COLS + start.tx];
  prev[start.ty * COLS + start.tx] = -2;
  const target = toTy * COLS + toTx;
  let head = 0;
  while (head < queue.length) {
    const current = queue[head];
    head += 1;
    if (current === target) break;
    const cx = current % COLS;
    const cy = Math.floor(current / COLS);
    const neighbours = [
      [cx + 1, cy],
      [cx - 1, cy],
      [cx, cy + 1],
      [cx, cy - 1],
    ];
    for (let i = 0; i < neighbours.length; i += 1) {
      const [nx, ny] = neighbours[i];
      if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) continue;
      const index = ny * COLS + nx;
      if (prev[index] !== -1 || isSolidTile(level, nx, ny)) continue;
      prev[index] = current;
      queue.push(index);
    }
  }
  if (prev[target] === -1) return [];
  const tiles = [];
  let cursor = target;
  while (cursor !== -2 && cursor >= 0) {
    tiles.push([cursor % COLS, Math.floor(cursor / COLS)]);
    cursor = prev[cursor];
  }
  tiles.reverse();
  // Drop the starting tile: the guard is already standing in it.
  if (tiles.length > 0 && tiles[0][0] === start.tx && tiles[0][1] === start.ty) tiles.shift();
  return tiles.map(([tx, ty]) => tileCenter(tx, ty));
}

/** Follow a waypoint list at `speed` px/s; returns true when the last waypoint is reached. */
export function followPath(entity, path, pathIndex, speed, dt) {
  if (!path || pathIndex >= path.length) return { arrived: true, index: pathIndex };
  const target = path[pathIndex];
  const dx = target.x - entity.x;
  const dy = target.y - entity.y;
  const dist = Math.hypot(dx, dy);
  const step = speed * dt;
  if (dist <= Math.max(step, 3)) {
    entity.x = target.x;
    entity.y = target.y;
    return { arrived: pathIndex + 1 >= path.length, index: pathIndex + 1 };
  }
  entity.x += (dx / dist) * step;
  entity.y += (dy / dist) * step;
  entity.angle = Math.atan2(dy, dx);
  return { arrived: false, index: pathIndex };
}

/** Move a circle against solid tiles, axis by axis, so it slides along walls instead of sticking. */
export function moveCircle(level, entity, dx, dy, radius) {
  const nextX = entity.x + dx;
  if (!circleHitsSolid(level, nextX, entity.y, radius)) entity.x = nextX;
  const nextY = entity.y + dy;
  if (!circleHitsSolid(level, entity.x, nextY, radius)) entity.y = nextY;
}

export function circleHitsSolid(level, x, y, radius) {
  // Check the tiles overlapped by the circle's bounding box.
  const minTx = Math.floor((x - radius - ARENA_X) / TILE);
  const maxTx = Math.floor((x + radius - ARENA_X) / TILE);
  const minTy = Math.floor((y - radius - ARENA_Y) / TILE);
  const maxTy = Math.floor((y + radius - ARENA_Y) / TILE);
  for (let ty = minTy; ty <= maxTy; ty += 1) {
    for (let tx = minTx; tx <= maxTx; tx += 1) {
      if (!isSolidTile(level, tx, ty)) continue;
      const boxX = ARENA_X + tx * TILE;
      const boxY = ARENA_Y + ty * TILE;
      const closestX = Math.max(boxX, Math.min(x, boxX + TILE));
      const closestY = Math.max(boxY, Math.min(y, boxY + TILE));
      const ddx = x - closestX;
      const ddy = y - closestY;
      if (ddx * ddx + ddy * ddy < radius * radius) return true;
    }
  }
  return false;
}
