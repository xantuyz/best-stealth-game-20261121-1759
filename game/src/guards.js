// The guard state machine: patrol -> suspicious -> investigate -> chase -> search -> return.
// A guard only ever moves toward a position it actually saw or heard, and it forgets the
// player the moment sight is lost for two seconds: chase follows the last seen position, never
// the player's live position. One explicit transition table, no hidden tracking.
import { GUARD, PLAYER, TILE } from './config.js';
import { findWalkableGridPath, followPath } from './navigation.js';
import { guardSeesPlayer, hasLineOfSight, turnToward, updateGuardExposure } from './visibility.js';
import { tileAtPoint } from './level.js';

function setGuardState(guard, next, state) {
  guard.state = next;
  guard.stateTime = 0;
  guard.path = [];
  guard.pathIndex = 0;
  guard.repathIn = 0;
  if (next === 'search') guard.searchBase = guard.angle;
  if (next === 'investigate' && guard.lastHeard) {
    const tile = tileAtPoint(guard.lastHeard.x, guard.lastHeard.y);
    guard.path = findWalkableGridPath(state.level, guard.x, guard.y, tile.tx, tile.ty);
    guard.pathIndex = 0;
  }
  if (next === 'return') {
    // Head for the nearest patrol waypoint, then resume the route from there.
    let best = 0;
    let bestDist = Infinity;
    for (let i = 0; i < guard.waypoints.length; i += 1) {
      const d = Math.hypot(guard.waypoints[i].x - guard.x, guard.waypoints[i].y - guard.y);
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    }
    guard.waypointIndex = best;
    const tile = tileAtPoint(guard.waypoints[best].x, guard.waypoints[best].y);
    guard.path = findWalkableGridPath(state.level, guard.x, guard.y, tile.tx, tile.ty);
    guard.pathIndex = 0;
  }
}

function moveGuardToward(guard, target, speed, dt, state) {
  const dx = target.x - guard.x;
  const dy = target.y - guard.y;
  const dist = Math.hypot(dx, dy);
  const step = speed * dt;
  if (dist <= Math.max(step, 2)) {
    guard.x = target.x;
    guard.y = target.y;
    return true;
  }
  guard.x += (dx / dist) * step;
  guard.y += (dy / dist) * step;
  guard.angle = turnToward(guard.angle, Math.atan2(dy, dx), GUARD.turnRate, dt);
  guard.stepAcc += step;
  if (guard.stepAcc >= 30) {
    guard.stepAcc = 0;
    state.rings.push({ x: guard.x, y: guard.y, radius: 4, maxRadius: 14, ttl: 0.4, kind: 'guard' });
    const playerDist = Math.hypot(state.player.x - guard.x, state.player.y - guard.y);
    if (playerDist < 8 * TILE) state.events.push({ type: 'guard-step', x: guard.x, y: guard.y });
  }
  return false;
}

/**
 * Advance one guard one fixed step. Returns nothing; the shared `state` carries the run
 * (events, rings, win/lose) so the renderer and the audio layer can read it.
 */
export function updateGuardPatrolChaseAndSearch(state, guard, dt) {
  const player = state.player;
  const level = state.level;
  guard.stateTime += dt;

  // --- Shared senses: sight, exposure, and the catch rule. ---
  const { sees, dist } = guardSeesPlayer(level, guard, player);
  const exposureEvent = updateGuardExposure(guard, sees, dist, player, dt);
  if (exposureEvent === 'chase' && guard.state !== 'chase') {
    guard.lastSeen = { x: player.x, y: player.y };
    guard.lostTime = 0;
    if (!guard.chaseCounted) {
      guard.chaseCounted = true;
      state.stats.chases += 1;
    }
    setGuardState(guard, 'chase', state);
    state.events.push({ type: 'chase', guard: guard.id });
  }
  if (exposureEvent === 'near-miss') {
    state.stats.nearMisses += 1;
    state.nearMissFlash = 1.2;
    state.events.push({ type: 'near-miss', guard: guard.id });
  }
  if (sees) {
    guard.lastSeen = { x: player.x, y: player.y };
    guard.lostTime = 0;
  }
  // Caught: a guard within 0.55 tiles with a clear line of sight ends the run.
  if (dist < PLAYER.catchDistanceTiles * TILE && hasLineOfSight(level, guard.x, guard.y, player.x, player.y, player.crouch)) {
    if (state.status === 'playing') {
      state.status = 'lost';
      state.caughtBy = guard.id;
      state.events.push({ type: 'caught', guard: guard.id });
    }
    return;
  }
  // A guard that heard a sound while idle turns to investigate it.
  if (guard.lastHeard && (guard.state === 'patrol' || guard.state === 'return')) {
    const heard = guard.lastHeard;
    setGuardState(guard, 'investigate', state);
    guard.lastHeard = null;
    guard.lastHeardAt = heard;
    state.stats.noisesHeard += 1;
    state.events.push({ type: 'suspicion', guard: guard.id });
  }

  switch (guard.state) {
    case 'patrol': {
      if (sees && guard.exposure >= GUARD.suspiciousAt) {
        guard.resumeState = 'patrol';
        setGuardState(guard, 'suspicious', state);
        state.events.push({ type: 'suspicion', guard: guard.id });
        break;
      }
      if (guard.pause > 0) {
        guard.pause -= dt;
        const next = guard.waypoints[guard.waypointIndex];
        guard.angle = turnToward(guard.angle, Math.atan2(next.y - guard.y, next.x - guard.x), GUARD.turnRate * 0.5, dt);
        break;
      }
      const target = guard.waypoints[guard.waypointIndex];
      if (moveGuardToward(guard, target, GUARD.patrolSpeed, dt, state)) {
        guard.waypointIndex = (guard.waypointIndex + 1) % guard.waypoints.length;
        const [min, max] = state.level.pauseRange;
        guard.pause = min + state.rng() * (max - min);
      }
      break;
    }
    case 'suspicious': {
      // Stop, turn toward what was glimpsed, then decide: a real sound means investigate.
      // While the guard can still see the player it keeps staring; the timer only counts
      // down once sight is lost.
      const focus = guard.lastSeen ?? guard.lastHeardAt ?? { x: guard.x + Math.cos(guard.angle) * 32, y: guard.y + Math.sin(guard.angle) * 32 };
      guard.angle = turnToward(guard.angle, Math.atan2(focus.y - guard.y, focus.x - guard.x), GUARD.turnRate, dt);
      if (sees) guard.stateTime = 0;
      if (guard.stateTime >= GUARD.suspiciousSeconds) {
        if (guard.lastHeardAt) {
          guard.lastHeard = guard.lastHeardAt;
          guard.lastHeardAt = null;
          setGuardState(guard, 'investigate', state);
        } else if (guard.resumeState === 'investigate' && guard.lastHeard) {
          setGuardState(guard, 'investigate', state);
        } else {
          setGuardState(guard, 'patrol', state);
        }
      }
      break;
    }
    case 'investigate': {
      if (sees && guard.exposure >= GUARD.suspiciousAt) {
        guard.resumeState = 'investigate';
        setGuardState(guard, 'suspicious', state);
        break;
      }
      if (guard.pathIndex < guard.path.length) {
        const result = followPath(guard, guard.path, guard.pathIndex, GUARD.investigateSpeed, dt);
        guard.pathIndex = result.index;
        guard.stepAcc += GUARD.investigateSpeed * dt;
        guard.arrivedAt = null;
      } else {
        // Arrived: look around the spot for a while before giving up.
        if (guard.arrivedAt === null || guard.arrivedAt === undefined) guard.arrivedAt = guard.stateTime;
        guard.angle += Math.sin(guard.stateTime * 2.2) * 1.4 * dt;
        if (guard.stateTime - guard.arrivedAt >= GUARD.investigateLookSeconds) {
          guard.arrivedAt = null;
          setGuardState(guard, 'return', state);
        }
      }
      break;
    }
    case 'chase': {
      if (!sees) {
        guard.lostTime += dt;
        if (guard.lostTime >= GUARD.lostSightToSearch || (guard.lastSeen && Math.hypot(guard.lastSeen.x - guard.x, guard.lastSeen.y - guard.y) < 8)) {
          setGuardState(guard, 'search', state);
          state.events.push({ type: 'search', guard: guard.id });
          break;
        }
      }
      guard.repathIn -= dt;
      if (guard.repathIn <= 0 && guard.lastSeen) {
        guard.repathIn = 0.35;
        const tile = tileAtPoint(guard.lastSeen.x, guard.lastSeen.y);
        guard.path = findWalkableGridPath(level, guard.x, guard.y, tile.tx, tile.ty);
        guard.pathIndex = 0;
      }
      if (guard.pathIndex < guard.path.length) {
        const result = followPath(guard, guard.path, guard.pathIndex, GUARD.chaseSpeed, dt);
        guard.pathIndex = result.index;
        guard.stepAcc += GUARD.chaseSpeed * dt;
      } else if (guard.lastSeen) {
        moveGuardToward(guard, guard.lastSeen, GUARD.chaseSpeed, dt, state);
      }
      break;
    }
    case 'search': {
      // Sweep a bounded arc around the direction the guard faced when it started searching:
      // it looks for the player near the last seen spot, it does not spin in circles.
      if (guard.searchBase === undefined) guard.searchBase = guard.angle;
      guard.angle = guard.searchBase + Math.sin(guard.stateTime * 0.9) * 1.05;
      if (guard.stateTime >= GUARD.searchSeconds) {
        guard.chaseCounted = false;
        setGuardState(guard, 'return', state);
      }
      break;
    }
    case 'return': {
      if (sees && guard.exposure >= GUARD.suspiciousAt) {
        guard.resumeState = 'return';
        setGuardState(guard, 'suspicious', state);
        break;
      }
      if (guard.pathIndex < guard.path.length) {
        const result = followPath(guard, guard.path, guard.pathIndex, GUARD.returnSpeed, dt);
        guard.pathIndex = result.index;
        guard.stepAcc += GUARD.returnSpeed * dt;
      } else {
        setGuardState(guard, 'patrol', state);
      }
      break;
    }
    default:
      setGuardState(guard, 'patrol', state);
      break;
  }
}
