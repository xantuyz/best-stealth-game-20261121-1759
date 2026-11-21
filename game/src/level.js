// The flooded city archive: one fixed level, its grid, objectives and patrol routes.
// Every tile query in the game (movement, line of sight, sound, pathfinding) goes through
// this module, so the walls a guard cannot see through are the same walls the player cannot
// walk through and the same walls a sound cannot cross unmuffled.
import { ARENA_X, ARENA_Y, COLS, GUARD, ROWS, T, TILE } from './config.js';
import { createRandom } from './random.js';

/** Pixel centre of a tile, in canvas coordinates. */
export function tileCenter(tx, ty) {
  return { x: ARENA_X + tx * TILE + TILE / 2, y: ARENA_Y + ty * TILE + TILE / 2 };
}

/** Tile coordinates of a canvas point, clamped to the grid. */
export function tileAtPoint(x, y) {
  return {
    tx: Math.max(0, Math.min(COLS - 1, Math.floor((x - ARENA_X) / TILE))),
    ty: Math.max(0, Math.min(ROWS - 1, Math.floor((y - ARENA_Y) / TILE))),
  };
}

export function tileCode(level, tx, ty) {
  if (tx < 0 || ty < 0 || tx >= COLS || ty >= ROWS) return T.WALL;
  return level.grid[ty * COLS + tx];
}

/** A tile blocks movement when it is a wall, a tall shelf or a low cover crate. */
export function isSolidTile(level, tx, ty) {
  const code = tileCode(level, tx, ty);
  return code === T.WALL || code === T.SHELF || code === T.COVER;
}

/** A tile blocks a guard's sight when it is a wall or a tall shelf. Low cover only hides a
 * crouched player, which the visibility module checks separately. */
export function blocksSightTile(level, tx, ty) {
  const code = tileCode(level, tx, ty);
  return code === T.WALL || code === T.SHELF;
}

export function isWaterTile(level, tx, ty) {
  return tileCode(level, tx, ty) === T.WATER;
}

function fillRect(grid, x0, y0, x1, y1, code) {
  for (let ty = y0; ty <= y1; ty += 1) {
    for (let tx = x0; tx <= x1; tx += 1) grid[ty * COLS + tx] = code;
  }
}

/**
 * Build the flooded archive: perimeter walls, three shelf blocks, low cover crates, two
 * puddles, the evidence document, two optional loot caches and the east exit. Patrol routes
 * are tile waypoints with different phases so the gaps between guards can be learned.
 */
export function createFloodedArchiveLevel() {
  const grid = new Uint8Array(COLS * ROWS);
  // Perimeter walls, with the exit door drawn on the east wall (the exit tile stays floor).
  fillRect(grid, 0, 0, COLS - 1, 0, T.WALL);
  fillRect(grid, 0, ROWS - 1, COLS - 1, ROWS - 1, T.WALL);
  fillRect(grid, 0, 0, 0, ROWS - 1, T.WALL);
  fillRect(grid, COLS - 1, 0, COLS - 1, ROWS - 1, T.WALL);
  // Tall shelves: they block movement and sight.
  fillRect(grid, 5, 4, 8, 7, T.SHELF); // west, upper
  fillRect(grid, 5, 10, 8, 13, T.SHELF); // west, lower
  fillRect(grid, 12, 3, 15, 6, T.SHELF); // middle, upper
  fillRect(grid, 12, 10, 15, 13, T.SHELF); // middle, lower
  fillRect(grid, 20, 7, 22, 10, T.SHELF); // east
  // Low cover crates (2x1): they block movement and hide only a crouched player.
  fillRect(grid, 10, 8, 11, 8, T.COVER);
  fillRect(grid, 17, 8, 18, 8, T.COVER);
  fillRect(grid, 25, 12, 26, 12, T.COVER);
  // Puddles, skipping the cover crates that sit inside them.
  fillRect(grid, 9, 7, 18, 9, T.WATER);
  fillRect(grid, 23, 11, 26, 12, T.WATER);
  grid[8 * COLS + 10] = T.COVER;
  grid[8 * COLS + 11] = T.COVER;
  grid[8 * COLS + 17] = T.COVER;
  grid[8 * COLS + 18] = T.COVER;
  grid[12 * COLS + 25] = T.COVER;
  grid[12 * COLS + 26] = T.COVER;

  const patrols = [
    { name: 'Barat', waypoints: [[3, 9], [10, 9], [10, 2], [3, 2]], phase: 0 },
    { name: 'Tengah', waypoints: [[10, 7], [18, 7], [18, 14], [10, 14]], phase: 1 },
    { name: 'Arsip', waypoints: [[18, 2], [26, 2], [26, 5], [18, 5]], phase: 2 },
    { name: 'Exit', waypoints: [[24, 6], [27, 6], [27, 15], [24, 15]], phase: 3 },
  ];
  return {
    grid,
    spawn: { tx: 2, ty: 15 },
    evidence: { tx: 24, ty: 3 },
    exit: { tx: 28, ty: 14 },
    loot: [{ tx: 3, ty: 3 }, { tx: 25, ty: 8 }],
    patrols,
    pauseRange: [GUARD.waypointPauseMin, GUARD.waypointPauseMax],
  };
}

/** Fresh game state for one attempt: level, player, guards, objectives and run stats. */
export function createGameState(seed) {
  const rng = createRandom(seed);
  const level = createFloodedArchiveLevel();
  const spawn = tileCenter(level.spawn.tx, level.spawn.ty);
  const guards = level.patrols.map((patrol, index) => {
    // Phase offset: each guard starts at a different waypoint so the patrols are out of sync.
    const startIndex = patrol.phase % patrol.waypoints.length;
    const start = tileCenter(patrol.waypoints[startIndex][0], patrol.waypoints[startIndex][1]);
    const next = tileCenter(
      patrol.waypoints[(startIndex + 1) % patrol.waypoints.length][0],
      patrol.waypoints[(startIndex + 1) % patrol.waypoints.length][1],
    );
    return {
      id: index,
      name: patrol.name,
      x: start.x,
      y: start.y,
      angle: Math.atan2(next.y - start.y, next.x - start.x),
      waypoints: patrol.waypoints.map(([tx, ty]) => tileCenter(tx, ty)),
      waypointIndex: (startIndex + 1) % patrol.waypoints.length,
      pause: 0,
      state: 'patrol',
      stateTime: 0,
      exposure: 0,
      peakExposure: 0,
      unseenTime: 0,
      lastSeen: null,
      lastHeard: null,
      path: [],
      pathIndex: 0,
      repathIn: 0,
      lostTime: 0,
      scanAngle: 0,
      stepAcc: 0,
      resumeState: 'patrol',
    };
  });
  return {
    seed,
    rng,
    time: 0,
    status: 'playing', // playing | won | lost
    level,
    player: {
      x: spawn.x,
      y: spawn.y,
      angle: -Math.PI / 2,
      crouch: false,
      moving: false,
      pebbles: 3,
      hasEvidence: false,
      loot: 0,
      stepAcc: 0,
      inWater: false,
    },
    guards,
    evidence: { tx: level.evidence.tx, ty: level.evidence.ty, taken: false },
    loot: level.loot.map((spot) => ({ ...spot, taken: false })),
    exit: { tx: level.exit.tx, ty: level.exit.ty, active: false },
    pebbles: [], // thrown pebbles in flight: {x, y, tx, ty, speed}
    rings: [], // expanding sound rings: {x, y, radius, maxRadius, ttl, kind}
    events: [], // drained each frame by main.js for audio and announcements
    stats: { chases: 0, nearMisses: 0, noisesHeard: 0, pebblesThrown: 0, elapsed: 0 },
    nearMissFlash: 0,
    caughtBy: -1,
  };
}
