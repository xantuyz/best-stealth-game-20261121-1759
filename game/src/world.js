// The world step: one fixed 1/60 s tick of the whole simulation. Player first, then pebbles,
// then each guard; rings fade; the clock only runs while the run is live. Nothing here touches
// the DOM, so the same step drives the live game and the deterministic screenshot scenes.
import { STEP } from './config.js';
import { createGameState } from './level.js';
import { updatePlayerMovementAndCrouch, updateThrownPebbles } from './player.js';
import { updateGuardPatrolChaseAndSearch } from './guards.js';

export function createWorld(seed) {
  return createGameState(seed);
}

export function resetWorld(state) {
  const fresh = createGameState(state.seed);
  for (const key of Object.keys(fresh)) state[key] = fresh[key];
}

/** Advance the simulation one fixed step from `input` (see player.js for its shape). */
export function stepWorld(state, input, dt = STEP) {
  if (state.status !== 'playing') return;
  state.time += dt;
  state.stats.elapsed += dt;
  updatePlayerMovementAndCrouch(state, input, dt);
  updateThrownPebbles(state, dt);
  for (const guard of state.guards) {
    updateGuardPatrolChaseAndSearch(state, guard, dt);
    if (state.status !== 'playing') break;
  }
  for (let i = state.rings.length - 1; i >= 0; i -= 1) {
    const ring = state.rings[i];
    ring.ttl -= dt;
    ring.radius += (ring.maxRadius - ring.radius) * dt * 3 + 30 * dt;
    if (ring.ttl <= 0) state.rings.splice(i, 1);
  }
  if (state.nearMissFlash > 0) state.nearMissFlash -= dt;
}

/** The highest exposure of any guard, for the HUD meter. */
export function maxExposure(state) {
  let top = 0;
  for (const guard of state.guards) top = Math.max(top, guard.exposure);
  return top;
}

/** How many guards are chasing right now: the global alarm level (0-3 shown). */
export function alarmLevel(state) {
  let chasing = 0;
  for (const guard of state.guards) if (guard.state === 'chase') chasing += 1;
  return Math.min(3, chasing);
}

/** One-word status for the HUD: hidden, seen, or being searched for. */
export function statusLabel(state) {
  for (const guard of state.guards) {
    if (guard.state === 'chase') return 'TERLIHAT';
  }
  for (const guard of state.guards) {
    if (guard.state === 'search' || guard.state === 'investigate' || guard.state === 'suspicious') return 'DICARI';
  }
  return 'TERSEMBUNYI';
}
