// The four screenshot scenes. Each one plays the real rules forward from a fresh world with
// the fixed seed, steered by a scripted autopilot that walks the same BFS routes a player
// would, so the frame is what a short game really looks like and the same seed always gives
// the same frame. The simulation freezes the moment the scene's condition holds.
import { STEP } from './config.js';
import { findWalkableGridPath } from './navigation.js';
import { resetWorld, stepWorld } from './world.js';
import { tileAtPoint, tileCenter } from './level.js';

const MAX_SECONDS = 120;

/** Steer the player along BFS routes: one target tile at a time, crouch on request. */
function makePilot() {
  let path = null;
  let pathIndex = 0;
  let targetKey = '';
  return {
    drive(state, tx, ty, crouch, autoCrouch = true) {
      const key = `${tx},${ty}`;
      if (key !== targetKey || !path) {
        targetKey = key;
        path = findWalkableGridPath(state.level, state.player.x, state.player.y, tx, ty);
        pathIndex = 0;
      }
      // Crouch automatically when a guard is close: quiet steps and slower detection are
      // how a careful player slips past a patrol. Fleeing scripts opt out for speed.
      let nearest = Infinity;
      for (const guard of state.guards) {
        nearest = Math.min(nearest, Math.hypot(guard.x - state.player.x, guard.y - state.player.y));
      }
      const input = { mx: 0, my: 0, crouch: crouch || (autoCrouch && nearest < 3.2 * 32), interact: false };
      // Arrived means standing close to the target tile's centre, not merely inside the tile:
      // a throw or a pickup from a tile's edge can clip a crate or miss the objective.
      const centre = tileCenter(tx, ty);
      let arrived = Math.hypot(state.player.x - centre.x, state.player.y - centre.y) < 8;
      if (path && pathIndex < path.length) {
        const waypoint = path[pathIndex];
        const dx = waypoint.x - state.player.x;
        const dy = waypoint.y - state.player.y;
        const dist = Math.hypot(dx, dy);
        if (dist < 6) {
          pathIndex += 1;
        } else {
          input.mx = dx / dist;
          input.my = dy / dist;
          arrived = false;
        }
      }
      if (path && pathIndex >= path.length) arrived = Math.hypot(state.player.x - centre.x, state.player.y - centre.y) < 8;
      return { input, arrived };
    },
  };
}

function guardNear(state, id, tx, ty, tiles) {
  const guard = state.guards[id];
  const spot = tileCenter(tx, ty);
  return Math.hypot(guard.x - spot.x, guard.y - spot.y) <= tiles * 32;
}

/** Cover: slip south of the middle shelf while the middle guard is on its north legs, then
 * crouch behind the tall shelf itself — it blocks sight from any guard north of it, unlike
 * a low crate, which only hides a player on its exact far side. Freeze once the guard is
 * close on the far side of the shelf, the player is hidden and settled. */
function coverScript() {
  let phase = 0;
  let settled = 0;
  return {
    next(state, pilot) {
      if (phase === 0) {
        const { input, arrived } = pilot.drive(state, 17, 15, false);
        if (arrived) phase = 1;
        return { input, done: false };
      }
      if (phase === 1) {
        // Wait at the crossing until the middle guard is on its north legs (row 7-8).
        const input = { mx: 0, my: 0, crouch: true, interact: false };
        const guardTile = tileAtPoint(state.guards[1].x, state.guards[1].y);
        if (guardTile.ty <= 8) phase = 2;
        return { input, done: false };
      }
      if (phase === 2) {
        const { input, arrived } = pilot.drive(state, 13, 14, false);
        if (arrived) phase = 3;
        return { input, done: false };
      }
      const { input } = pilot.drive(state, 13, 14, true);
      input.mx = 0;
      input.my = 0;
      input.crouch = true;
      settled += STEP;
      const hidden = state.player.crouch && state.guards.every((g) => g.exposure < 10);
      const done = settled > 1.5 && hidden && guardNear(state, 1, 13, 7, 8);
      return { input, done };
    },
  };
}

/** Distraction: slip east while the exit guard is at its far east end, wait at the puddle's
 * edge for the middle guard to reach the far west end of its row, then throw a pebble into
 * the big puddle. Freeze the moment a guard turns to investigate the splash. */
function distractionScript() {
  let phase = 0;
  let thrown = false;
  let throwTime = 0;
  return {
    next(state, pilot) {
      if (phase === 0) {
        const { input, arrived } = pilot.drive(state, 16, 16, false);
        if (arrived) phase = 1;
        return { input, done: false };
      }
      if (phase === 1) {
        // Wait until the exit guard is at its north-west waypoint before crossing its row:
        // it then walks east and south on the far side, leaving the crossing clear.
        const input = { mx: 0, my: 0, crouch: true, interact: false };
        const exitTile = tileAtPoint(state.guards[3].x, state.guards[3].y);
        if (exitTile.tx === 24 && exitTile.ty === 6) phase = 2;
        return { input, done: false };
      }
      if (phase === 2) {
        const { input, arrived } = pilot.drive(state, 19, 9, false);
        if (arrived) phase = 3;
        return { input, done: false };
      }
      const input = { mx: 0, my: 0, crouch: true, interact: false };
      const middleTile = tileAtPoint(state.guards[1].x, state.guards[1].y);
      const guardWest = middleTile.ty === 7 && middleTile.tx <= 11;
      if (phase === 3 && guardWest && !thrown) {
        const splash = tileCenter(15, 8);
        input.throwX = splash.x;
        input.throwY = splash.y;
        thrown = true;
        throwTime = state.time;
        phase = 4;
      }
      if (phase === 4) {
        // Nobody turned: the splash was too far away. Wait for the next west pass.
        if (state.time - throwTime > 2.5 && !state.guards.some((g) => g.state === 'investigate')) {
          thrown = false;
          phase = 3;
        }
      }
      const done = phase === 4 && state.guards.some((g) => g.state === 'investigate');
      return { input, done };
    },
  };
}

/** Near miss: cross the west guard's row only once it has left it, stand in the middle
 * guard's path until exposure is high, then break away behind the middle shelf. Freeze once
 * the guard is searching the last seen position. */
function nearMissScript() {
  let phase = 0;
  return {
    next(state, pilot) {
      if (phase === 0) {
        const { input, arrived } = pilot.drive(state, 2, 9, false);
        if (arrived) phase = 1;
        return { input, done: false };
      }
      if (phase === 1) {
        // The west guard patrols row 9: cross it only once it has turned north off the row.
        const input = { mx: 0, my: 0, crouch: true, interact: false };
        const westTile = tileAtPoint(state.guards[0].x, state.guards[0].y);
        if (westTile.ty !== 9) phase = 2;
        return { input, done: false };
      }
      if (phase === 2) {
        const { input, arrived } = pilot.drive(state, 14, 7, false);
        if (arrived) phase = 3;
        return { input, done: false };
      }
      if (phase === 3) {
        const { input } = pilot.drive(state, 14, 7, false);
        input.mx = 0;
        input.my = 0;
        let top = 0;
        for (const guard of state.guards) top = Math.max(top, guard.exposure);
        // Flee while the guard is still a few tiles out: the gap is what lets the shelf
        // cut the line of sight before the guard rounds its east side.
        if (top >= 60) phase = 4;
        return { input, done: false };
      }
      if (phase === 4) {
        // Break south past the shelf and hide behind it: the shelf cuts the line of sight,
        // so the guard loses the player and searches the last seen spot.
        const { input, arrived } = pilot.drive(state, 13, 14, false, false);
        if (arrived) phase = 5;
        return { input, done: false };
      }
      const input = { mx: 0, my: 0, crouch: true, interact: false };
      const done = state.guards.some((g) => g.state === 'search');
      return { input, done };
    },
  };
}

/** Escape: run the north corridor while the west guard is on its south leg, wait at the
 * corridor's east end until the archive guard is at its south-west waypoint, take the
 * evidence, then run south to the exit. Freeze near the exit with the exit guard patrolling. */
function escapeScript() {
  let phase = 0;
  let grabbed = false;
  return {
    next(state, pilot) {
      if (phase === 0) {
        // Wait south of the west guard's patrol: from (2,12) the guard is always either
        // facing away or more than 6 tiles off, whatever leg it is on.
        const { input, arrived } = pilot.drive(state, 2, 12, false);
        if (arrived) phase = 1;
        return { input, done: false };
      }
      if (phase === 1) {
        // The west guard is on its east leg (row 9, heading east, waypoint 1): the player
        // runs north up column 2 behind it, while it moves away. Waiting for the south
        // leg instead puts the player inside the guard's south-facing cone.
        const input = { mx: 0, my: 0, crouch: true, interact: false };
        if (state.guards[0].waypointIndex === 1) phase = 2;
        return { input, done: false };
      }
      if (phase === 2) {
        // Force the north corridor in two legs: BFS from (2,12) straight to (16,2) picks
        // the equally-short route through the big puddle, where the middle guard hears
        // wading steps. North up column 2 first, then east along row 2.
        const { input, arrived } = pilot.drive(state, 2, 2, false);
        if (arrived) phase = 3;
        return { input, done: false };
      }
      if (phase === 3) {
        const { input, arrived } = pilot.drive(state, 16, 2, false);
        if (arrived) phase = 4;
        return { input, done: false };
      }
      if (phase === 4) {
        // Wait at (16,2) — proven safe for long waits — for the full window: the archive
        // guard early on its west leg (waypoint 3, tile x>=22, so its east leg is still
        // ~6s away) AND the exit guard mid-way down its south leg. Then the whole
        // evidence-to-exit run is one uninterrupted sprint; no waiting in the open.
        const input = { mx: 0, my: 0, crouch: true, interact: false };
        const archiveGuard = state.guards[2];
        const archiveTile = tileAtPoint(archiveGuard.x, archiveGuard.y);
        const exitGuard = state.guards[3];
        const exitTile = tileAtPoint(exitGuard.x, exitGuard.y);
        if (archiveGuard.waypointIndex === 3 && archiveTile.tx >= 22 && exitGuard.waypointIndex === 2 && exitTile.tx === 27 && exitTile.ty >= 7 && exitTile.ty <= 10) phase = 5;
        return { input, done: false };
      }
      if (phase === 5) {
        const { input, arrived } = pilot.drive(state, 24, 3, false);
        if (arrived) {
          input.interact = true;
          grabbed = true;
          phase = 6;
        }
        return { input, done: false };
      }
      if (phase === 6) {
        const { input, arrived } = pilot.drive(state, 28, 3, false);
        if (arrived) phase = 7;
        return { input, done: false };
      }
      if (phase === 7) {
        // Slip south on column 28 behind the exit guard. (28,10) is the freeze tile —
        // east of the guard's south column and outside its cone from every leg.
        const { input, arrived } = pilot.drive(state, 28, 10, false);
        if (arrived) phase = 8;
        return { input, done: false };
      }
      const input = { mx: 0, my: 0, crouch: false, interact: false };
      const playerTile = tileAtPoint(state.player.x, state.player.y);
      const done = grabbed && state.player.hasEvidence && playerTile.tx === 28 && playerTile.ty === 10 && state.guards[3].state === 'patrol';
      return { input, done };
    },
  };
}

const SCRIPTS = {
  cover: coverScript,
  distraction: distractionScript,
  'near-miss': nearMissScript,
  escape: escapeScript,
};

/**
 * Set `state` to the named scene (cover, distraction, near-miss or escape; any other name is
 * cover) and return the screen to draw over it. The state is left frozen at the scene.
 */
export function stageDeterministicStealthScreenshot(name, state) {
  resetWorld(state);
  const script = (SCRIPTS[name] || SCRIPTS.cover)();
  const pilot = makePilot();
  for (let tick = 0; tick < MAX_SECONDS / STEP; tick += 1) {
    if (state.status !== 'playing') break;
    const { input, done } = script.next(state, pilot);
    stepWorld(state, input, STEP);
    if (typeof globalThis.__shotTrace === 'function') globalThis.__shotTrace(tick, state);
    if (done) break;
  }
  return { screen: 'play', best: 0 };
}
