// Boot and the one loop: input is read every frame, the world advances in fixed 1/60 s steps
// (several in a slow frame, none in a fast one), and the renderer paints what is there. The
// game moves between four screens: title, play, paused and over.
//
// ?seed=N fixes the guard pauses. ?shot=cover|distraction|near-miss|escape (with &seed=N)
// stages that scene instead of running the loop, paints it twice and sets window.__shotReady
// for a screenshot.
import { BEST_KEY, SHOT_SEED, STEP } from './config.js';
import { createWorld, resetWorld, stepWorld } from './world.js';
import {
  ACTION_CONFIRM,
  ACTION_MUTE,
  ACTION_PAUSE,
  ACTION_RESTART,
  bindKeyboardAndMouseControls,
} from './input.js';
import { createRenderer } from './render.js';
import { drawObjectiveAndDetectionHUD } from './hud.js';
import { createProceduralStealthAudio } from './audio.js';
import { stageDeterministicStealthScreenshot } from './screenshots.js';

/** The longest frame the loop catches up on; a longer stall (a hidden tab) is dropped. */
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : SHOT_SEED;

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const state = createWorld(seed);
const renderer = createRenderer(canvas);
const audio = createProceduralStealthAudio();

// Debug handle for automated playtests: read state, never write it from outside the game.
window.__game = { state };

function readBest() {
  try {
    return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

function saveBest(value) {
  try {
    window.localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // Storage can be off (private windows): the best time then lasts this visit only.
  }
}

function runShot(name) {
  const scene = stageDeterministicStealthScreenshot(name, state);
  const ctx = canvas.getContext('2d');
  let painted = 0;
  function paint() {
    renderer.draw(state, null);
    drawObjectiveAndDetectionHUD(ctx, state, scene.screen, scene.best);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = bindKeyboardAndMouseControls(canvas);
  let screen = 'title';
  let best = readBest();
  let accumulator = 0;
  let last = performance.now();

  // Screen readers (and anyone watching the page's text) hear the screen changes.
  function announce(message) {
    status.textContent = message;
  }

  function drainEvents() {
    for (const event of state.events) {
      if (event.type === 'step') {
        if (event.water) audio.playWaterFootstep();
        else if (!event.crouch) audio.playDryFootstep();
      } else if (event.type === 'guard-step') {
        const pan = Math.max(-0.8, Math.min(0.8, (event.x - state.player.x) / 300));
        audio.playGuardFootstep(pan);
      } else if (event.type === 'pebble') {
        audio.playPebbleImpact(event.water);
      } else if (event.type === 'suspicion') {
        audio.playSuspicionCue();
      } else if (event.type === 'chase') {
        audio.playChaseSting();
        announce('Seorang penjaga mengejarmu!');
      } else if (event.type === 'near-miss') {
        audio.playNearMissCue();
        announce('Nyaris tertangkap.');
      } else if (event.type === 'pickup') {
        audio.playObjectivePickup();
        announce(event.kind === 'evidence' ? 'Bukti didapat. Kabur ke EXIT!' : 'Arsip tambahan didapat.');
      } else if (event.type === 'escape') {
        audio.playEscapeCue();
      } else if (event.type === 'caught') {
        announce('Tertangkap!');
      }
    }
    state.events.length = 0;
  }

  function startGame() {
    audio.unlock();
    audio.startAmbient();
    resetWorld(state);
    accumulator = 0;
    screen = 'play';
    announce('Bermain. Ambil BUKTI, lalu kabur ke EXIT tanpa terlihat.');
    input.readInput(); // flush any click that started the game, so it is not thrown as a pebble
  }

  function endGame() {
    screen = 'over';
    audio.stopAmbient();
    if (state.status === 'won') {
      const seconds = Math.round(state.stats.elapsed);
      if (best === 0 || seconds < best) {
        best = seconds;
        saveBest(best);
      }
      announce(`Lolos dalam ${seconds} detik.`);
    } else {
      announce('Tertangkap. Tekan R untuk mencoba lagi.');
    }
  }

  function handleActions() {
    const interact = input.takeInteract();
    const actions = input.takeActions();
    if (actions & ACTION_MUTE) {
      const nowMuted = audio.toggleMute();
      announce(nowMuted ? 'Suara mati.' : 'Suara hidup.');
    }
    if (actions & ACTION_RESTART && screen !== 'title') {
      startGame();
      return { interact: false };
    }
    if (actions & ACTION_CONFIRM && (screen === 'title' || screen === 'over')) {
      startGame();
      return { interact: false };
    }
    if (actions & ACTION_PAUSE && screen === 'play') {
      screen = 'paused';
      announce('Jeda.');
    } else if (actions & (ACTION_PAUSE | ACTION_CONFIRM) && screen === 'paused') {
      screen = 'play';
      announce('Bermain.');
    }
    return { interact };
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    const { interact } = handleActions();
    if (screen === 'play') {
      let pendingInteract = interact;
      while (accumulator >= STEP) {
        const stepInput = input.readInput();
        stepInput.interact = pendingInteract;
        pendingInteract = false;
        stepWorld(state, stepInput, STEP);
        accumulator -= STEP;
        if (state.status !== 'playing') {
          endGame();
          break;
        }
      }
      drainEvents();
    } else {
      accumulator = 0;
      drainEvents();
    }
    renderer.draw(state, input.mouse);
    drawObjectiveAndDetectionHUD(canvas.getContext('2d'), state, screen, best);
  }

  // Leaving the tab pauses a running game rather than letting guards close in unseen.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === 'play') {
      screen = 'paused';
      announce('Jeda.');
    }
  });

  announce('ARSIP PASANG. Tekan Enter atau klik untuk mulai.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
