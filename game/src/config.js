// Every tuning number and colour in one place for ARSIP PASANG: The Last Dry Record.
// The playfield is a fixed 1280x720 logical area; the renderer scales it to the window, so no
// rule below depends on the screen size. The arena grid is 30x18 tiles of 32 px (960x576),
// placed at (16, 64); the strip on the right is the status panel, the top strip is the HUD.
export const CANVAS = { width: 1280, height: 720 };
export const TILE = 32;
export const COLS = 30;
export const ROWS = 18;
export const ARENA_X = 16;
export const ARENA_Y = 64;
export const ARENA_W = COLS * TILE;
export const ARENA_H = ROWS * TILE;
export const PANEL_X = ARENA_X + ARENA_W + 16;
export const PANEL_W = CANVAS.width - PANEL_X - 16;

/** The simulation's fixed step, in seconds: 60 updates a second whatever the display's rate. */
export const STEP = 1 / 60;

/** Tile codes in the level grid. Water is walkable floor that carries sound. */
export const T = { FLOOR: 0, WALL: 1, SHELF: 2, COVER: 3, WATER: 4 };

export const PLAYER = {
  radius: 11,
  walkSpeed: 96, // 3 tiles per second standing
  crouchSpeed: 51, // 1.6 tiles per second crouched
  pebbles: 3,
  pebbleRangeTiles: 5,
  pebbleSpeed: 340,
  stepDistance: 26, // px travelled per footstep noise
  catchDistanceTiles: 0.55,
  interactTiles: 0.9,
};

export const GUARD = {
  radius: 12,
  patrolSpeed: 48, // 1.5 tiles per second
  investigateSpeed: 64,
  chaseSpeed: 76, // 2.4 tiles per second: clearly slower than a running player, so a chase can be outrun
  returnSpeed: 58,
  turnRate: 4.2, // radians per second
  viewTiles: 6,
  viewHalfAngle: (65 / 2) * (Math.PI / 180),
  waypointPauseMin: 0.6,
  waypointPauseMax: 1.2,
  suspiciousSeconds: 1.5,
  investigateLookSeconds: 1.6,
  searchSeconds: 6,
  lostSightToSearch: 2,
  exposureGrace: 0.5, // seconds of unseen before exposure starts falling
  exposureDecay: 30, // points per second once unseen
  exposureFillSeconds: 1.5, // open view at mid range fills the meter in this long
  suspiciousAt: 35, // exposure that makes a patrolling guard stop and look
  crouchDetectFactor: 0.6, // crouch slows exposure gain while moving in the open
};

export const NOISE = {
  stepDryStand: 2, // footstep radius in tiles
  stepDryCrouch: 0.6,
  stepWaterStand: 4,
  stepWaterCrouch: 1.5,
  pebbleDry: 4,
  pebbleWater: 6,
  wallDampTiles: 0.8, // radius lost per wall tile a sound crosses
};

export const PALETTE = {
  outside: '#081319',
  floor: '#24343B',
  floorAlt: '#27393F',
  wall: '#0E1E26',
  wallTop: '#31474F',
  shelf: '#40565D',
  shelfTop: '#5A737C',
  cover: '#6B7F6E',
  coverTop: '#8AA184',
  water: '#155B70',
  waterEdge: '#3A9CB0',
  player: '#8FFFE0',
  playerDark: '#2E8C76',
  guard: '#FFB45B',
  guardDark: '#B97A2E',
  cone: '#FFD166',
  danger: '#FF5D66',
  exit: '#72F5AF',
  exitDark: '#2E8C5C',
  evidence: '#FFE9A8',
  loot: '#C9A7FF',
  hudBg: '#0D1B22',
  hudLine: '#2A3F47',
  text: '#E8F2F0',
  muted: '#9DB8B2',
  panel: '#101F27',
};

export const BEST_KEY = 'arsip-pasang-best-seconds';
export const SHOT_SEED = 2718;
