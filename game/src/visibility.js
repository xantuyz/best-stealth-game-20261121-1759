// Vision and detection: one line-of-sight contract shared by the drawn cone, the exposure
// meter and the catch rule, so what the player sees a guard seeing is exactly what the guard
// sees. A tall shelf or wall blocks sight; a low cover crate blocks sight only for a crouched
// player hiding behind it.
import { COLS, GUARD, ROWS, T, TILE } from './config.js';
import { blocksSightTile, isSolidTile, tileAtPoint } from './level.js';

/** Smallest absolute difference between two angles, in radians. */
export function angleDifference(a, b) {
  let diff = a - b;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return Math.abs(diff);
}

/** Turn `angle` toward `target` by at most `rate * dt` radians. */
export function turnToward(angle, target, rate, dt) {
  let diff = target - angle;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  const step = Math.max(-rate * dt, Math.min(rate * dt, diff));
  return angle + step;
}

/**
 * True when nothing blocks the segment. `crouched` is the target's crouch: a low cover crate
 * on the segment hides a crouched player and no one else.
 */
export function hasLineOfSight(level, x0, y0, x1, y1, crouched) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const dist = Math.hypot(dx, dy);
  const steps = Math.max(1, Math.ceil(dist / 5));
  for (let i = 1; i < steps; i += 1) {
    const t = i / steps;
    const { tx, ty } = tileAtPoint(x0 + dx * t, y0 + dy * t);
    if (blocksSightTile(level, tx, ty)) return false;
    if (crouched && isLowCover(level, tx, ty)) return false;
  }
  return true;
}

function isLowCover(level, tx, ty) {
  if (tx < 0 || ty < 0 || tx >= COLS || ty >= ROWS) return false;
  return level.grid[ty * COLS + tx] === T.COVER;
}

/** Distance and angle from a guard to the player, plus whether the guard can see them. */
export function guardSeesPlayer(level, guard, player) {
  const dx = player.x - guard.x;
  const dy = player.y - guard.y;
  const dist = Math.hypot(dx, dy);
  if (dist > GUARD.viewTiles * TILE) return { sees: false, dist };
  const angleTo = Math.atan2(dy, dx);
  if (angleDifference(angleTo, guard.angle) > GUARD.viewHalfAngle) return { sees: false, dist };
  if (!hasLineOfSight(level, guard.x, guard.y, player.x, player.y, player.crouch)) {
    return { sees: false, dist };
  }
  return { sees: true, dist };
}

/**
 * The vision cone as a polygon, clipped by the same walls and shelves that block sight.
 * Rays march out until they hit a shelf or wall, so the drawn cone never crosses a shelf.
 */
export function computeOccludedVisionCone(level, guard) {
  const range = GUARD.viewTiles * TILE;
  const points = [{ x: guard.x, y: guard.y }];
  const rays = 26;
  for (let i = 0; i <= rays; i += 1) {
    const angle = guard.angle - GUARD.viewHalfAngle + (2 * GUARD.viewHalfAngle * i) / rays;
    let r = range;
    for (let d = 8; d <= range; d += 8) {
      const px = guard.x + Math.cos(angle) * d;
      const py = guard.y + Math.sin(angle) * d;
      const { tx, ty } = tileAtPoint(px, py);
      if (blocksSightTile(level, tx, ty)) {
        r = d - 4;
        break;
      }
    }
    points.push({ x: guard.x + Math.cos(angle) * r, y: guard.y + Math.sin(angle) * r });
  }
  return points;
}

/**
 * Update one guard's exposure to the player. Open view fills the meter in about 1.5 seconds
 * (faster up close, slower while the player crouches); half a second after sight is lost the
 * meter falls. Returns 'chase' when the meter fills, 'near-miss' when a high meter drains
 * away unseen, or null.
 */
export function updateGuardExposure(guard, seen, dist, player, dt) {
  if (seen) {
    guard.unseenTime = 0;
    const proximity = 1 + (1 - Math.min(1, dist / (GUARD.viewTiles * TILE))) * 0.9;
    const crouchFactor = player.crouch ? GUARD.crouchDetectFactor : 1;
    const rate = (100 / GUARD.exposureFillSeconds) * proximity * crouchFactor;
    guard.exposure = Math.min(100, guard.exposure + rate * dt);
    guard.peakExposure = Math.max(guard.peakExposure, guard.exposure);
    if (guard.exposure >= 100) return 'chase';
    return null;
  }
  guard.unseenTime += dt;
  if (guard.unseenTime < GUARD.exposureGrace) return null;
  const before = guard.exposure;
  guard.exposure = Math.max(0, guard.exposure - GUARD.exposureDecay * dt);
  if (before >= 60 && guard.exposure < 25 && guard.peakExposure >= 60) {
    guard.peakExposure = 0;
    return 'near-miss';
  }
  if (guard.exposure === 0) guard.peakExposure = 0;
  return null;
}
