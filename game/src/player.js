// The player: an archive diver moving on foot. WASD or arrows to move (diagonals normalised),
// Shift held to crouch and move quietly, mouse to aim, click to throw a pebble, E to pick up
// the evidence or use the exit, R to restart. No sprint, no combat, no inventory.
import { NOISE, PLAYER, TILE } from './config.js';
import { blocksSightTile, isWaterTile, tileAtPoint, tileCenter } from './level.js';
import { moveCircle } from './navigation.js';
import { propagateFootstepsAndDistractions } from './noise.js';

/** Footstep noise radius in tiles for the surface under the player right now. */
function stepRadiusTiles(state) {
  const { tx, ty } = tileAtPoint(state.player.x, state.player.y);
  const inWater = isWaterTile(state.level, tx, ty);
  state.player.inWater = inWater;
  if (inWater) return state.player.crouch ? NOISE.stepWaterCrouch : NOISE.stepWaterStand;
  return state.player.crouch ? NOISE.stepDryCrouch : NOISE.stepDryStand;
}

function nearestInteractable(state) {
  const player = state.player;
  const spots = [];
  if (!state.evidence.taken) spots.push({ kind: 'evidence', ...tileCenter(state.evidence.tx, state.evidence.ty) });
  for (const loot of state.loot) {
    if (!loot.taken) spots.push({ kind: 'loot', loot, ...tileCenter(loot.tx, loot.ty) });
  }
  if (state.exit.active) spots.push({ kind: 'exit', ...tileCenter(state.exit.tx, state.exit.ty) });
  let best = null;
  let bestDist = Infinity;
  for (const spot of spots) {
    const d = Math.hypot(spot.x - player.x, spot.y - player.y);
    if (d < bestDist) {
      bestDist = d;
      best = spot;
    }
  }
  if (best && bestDist <= PLAYER.interactTiles * TILE) return best;
  return null;
}

/**
 * Advance the player one fixed step from `input` ({mx, my, crouch, interact, throwX, throwY,
 * aimX, aimY}). Returns the noise events this step emitted, so the world can tell the guards.
 */
export function updatePlayerMovementAndCrouch(state, input, dt) {
  const player = state.player;
  const emitted = [];
  if (state.status !== 'playing') return emitted;

  player.crouch = Boolean(input.crouch);
  let mx = input.mx || 0;
  let my = input.my || 0;
  const len = Math.hypot(mx, my);
  if (len > 1) {
    mx /= len;
    my /= len;
  }
  player.moving = len > 0.05;
  if (typeof input.aimX === 'number' && typeof input.aimY === 'number') {
    player.angle = Math.atan2(input.aimY - player.y, input.aimX - player.x);
  } else if (player.moving) {
    player.angle = Math.atan2(my, mx);
  }

  const speed = player.crouch ? PLAYER.crouchSpeed : PLAYER.walkSpeed;
  const dx = mx * speed * dt;
  const dy = my * speed * dt;
  const beforeX = player.x;
  const beforeY = player.y;
  moveCircle(state.level, player, dx, dy, PLAYER.radius);
  const moved = Math.hypot(player.x - beforeX, player.y - beforeY);
  if (moved > 0) {
    player.stepAcc += moved;
    if (player.stepAcc >= PLAYER.stepDistance) {
      player.stepAcc = 0;
      const radius = stepRadiusTiles(state);
      const heard = propagateFootstepsAndDistractions(state, player.x, player.y, radius, player.inWater ? 'water' : 'step');
      for (const guard of heard) guard.lastHeard = { x: player.x, y: player.y };
      emitted.push({ x: player.x, y: player.y, radiusTiles: radius, kind: 'step' });
      state.events.push({ type: 'step', water: player.inWater, crouch: player.crouch });
    }
  }

  // Throw a pebble toward the aim point (at most 5 tiles away). It flies over low cover but
  // stops at a wall or tall shelf; where it lands it makes a loud, distracting noise.
  if (typeof input.throwX === 'number' && typeof input.throwY === 'number' && player.pebbles > 0) {
    const dx2 = input.throwX - player.x;
    const dy2 = input.throwY - player.y;
    const dist = Math.hypot(dx2, dy2);
    const range = PLAYER.pebbleRangeTiles * TILE;
    const clamped = Math.min(dist, range);
    let tx = player.x + (dist > 0 ? (dx2 / dist) * clamped : 0);
    let ty = player.y + (dist > 0 ? (dy2 / dist) * clamped : 0);
    // A pebble stops at the first wall or tall shelf on its flight path. It flies over low
    // cover crates: they are ankle-high, and the throw is meant to clear them.
    const steps = Math.max(1, Math.ceil(clamped / 6));
    for (let i = 1; i <= steps; i += 1) {
      const px = player.x + (dx2 / dist) * ((clamped * i) / steps);
      const py = player.y + (dy2 / dist) * ((clamped * i) / steps);
      const { tx: tileX, ty: tileY } = tileAtPoint(px, py);
      if (blocksSightTile(state.level, tileX, tileY)) {
        tx = player.x + (dx2 / dist) * Math.max(0, (clamped * i) / steps - 8);
        ty = player.y + (dy2 / dist) * Math.max(0, (clamped * i) / steps - 8);
        break;
      }
    }
    player.pebbles -= 1;
    state.stats.pebblesThrown += 1;
    state.pebbles.push({ x: player.x, y: player.y, tx, ty, speed: PLAYER.pebbleSpeed });
    state.events.push({ type: 'throw', x: tx, y: ty });
  }

  if (input.interact) {
    const spot = nearestInteractable(state);
    if (spot) {
      if (spot.kind === 'evidence') {
        state.evidence.taken = true;
        player.hasEvidence = true;
        state.exit.active = true;
        state.events.push({ type: 'pickup', kind: 'evidence' });
      } else if (spot.kind === 'loot') {
        spot.loot.taken = true;
        player.loot += 1;
        state.events.push({ type: 'pickup', kind: 'loot' });
      } else if (spot.kind === 'exit') {
        state.status = 'won';
        state.events.push({ type: 'escape' });
      }
    }
  }
  return emitted;
}

/** Advance thrown pebbles; on landing, make the impact noise guards can hear. */
export function updateThrownPebbles(state, dt) {
  const level = state.level;
  for (let i = state.pebbles.length - 1; i >= 0; i -= 1) {
    const pebble = state.pebbles[i];
    const dx = pebble.tx - pebble.x;
    const dy = pebble.ty - pebble.y;
    const dist = Math.hypot(dx, dy);
    const step = pebble.speed * dt;
    if (dist <= step) {
      const { tx, ty } = tileAtPoint(pebble.tx, pebble.ty);
      const inWater = isWaterTile(level, tx, ty);
      const radius = inWater ? NOISE.pebbleWater : NOISE.pebbleDry;
      const heard = propagateFootstepsAndDistractions(state, pebble.tx, pebble.ty, radius, inWater ? 'splash' : 'pebble');
      for (const guard of heard) guard.lastHeard = { x: pebble.tx, y: pebble.ty };
      state.events.push({ type: 'pebble', water: inWater, x: pebble.tx, y: pebble.ty });
      state.pebbles.splice(i, 1);
    } else {
      pebble.x += (dx / dist) * step;
      pebble.y += (dy / dist) * step;
    }
  }
}
