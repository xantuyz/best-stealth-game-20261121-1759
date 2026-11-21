// Keyboard and mouse: WASD/arrows to move, Shift to crouch, E to interact, R to restart,
// Escape to pause, M to mute, Enter/Space/click to confirm. The mouse aims pebble throws and
// the click itself throws. Actions are edge-triggered and drained once per frame.
export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_RESTART = 4;
export const ACTION_MUTE = 8;
export const ACTION_INTERACT = 16;

const KEY_ACTIONS = {
  Enter: ACTION_CONFIRM,
  ' ': ACTION_CONFIRM,
  Escape: ACTION_PAUSE,
  r: ACTION_RESTART,
  R: ACTION_RESTART,
  m: ACTION_MUTE,
  M: ACTION_MUTE,
  e: ACTION_INTERACT,
  E: ACTION_INTERACT,
};

export function bindKeyboardAndMouseControls(canvas) {
  const keys = new Set();
  const mouse = { x: 0, y: 0, inside: false };
  let actions = 0;
  let pendingThrow = null;
  let clickConfirm = false;

  function canvasPoint(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((clientX - rect.left) / rect.width) * canvas.width,
      y: ((clientY - rect.top) / rect.height) * canvas.height,
    };
  }

  window.addEventListener('keydown', (event) => {
    if (event.repeat) return;
    keys.add(event.key);
    const action = KEY_ACTIONS[event.key];
    if (action) {
      actions |= action;
      event.preventDefault();
    }
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) event.preventDefault();
  });
  window.addEventListener('keyup', (event) => keys.delete(event.key));
  window.addEventListener('blur', () => keys.clear());
  canvas.addEventListener('mousemove', (event) => {
    const point = canvasPoint(event.clientX, event.clientY);
    mouse.x = point.x;
    mouse.y = point.y;
    mouse.inside = true;
  });
  canvas.addEventListener('mouseleave', () => {
    mouse.inside = false;
  });
  canvas.addEventListener('mousedown', (event) => {
    const point = canvasPoint(event.clientX, event.clientY);
    mouse.x = point.x;
    mouse.y = point.y;
    mouse.inside = true;
    pendingThrow = { x: point.x, y: point.y };
    clickConfirm = true;
  });

  function moveVector() {
    let mx = 0;
    let my = 0;
    if (keys.has('a') || keys.has('A') || keys.has('ArrowLeft')) mx -= 1;
    if (keys.has('d') || keys.has('D') || keys.has('ArrowRight')) mx += 1;
    if (keys.has('w') || keys.has('W') || keys.has('ArrowUp')) my -= 1;
    if (keys.has('s') || keys.has('S') || keys.has('ArrowDown')) my += 1;
    return { mx, my };
  }

  return {
    /** The movement + aim input for this frame's world step. */
    readInput() {
      const { mx, my } = moveVector();
      const input = {
        mx,
        my,
        crouch: keys.has('Shift'),
        interact: false,
        aimX: mouse.inside ? mouse.x : undefined,
        aimY: mouse.inside ? mouse.y : undefined,
      };
      if (pendingThrow) {
        input.throwX = pendingThrow.x;
        input.throwY = pendingThrow.y;
        pendingThrow = null;
      }
      return input;
    },
    /** One-shot actions since the last drain (confirm, pause, restart, mute, interact). */
    takeActions() {
      const taken = actions;
      actions = 0;
      if (clickConfirm) {
        clickConfirm = false;
        return taken | ACTION_CONFIRM;
      }
      return taken;
    },
    /** True when the player pressed E since the last drain. */
    takeInteract() {
      if (actions & ACTION_INTERACT) {
        actions &= ~ACTION_INTERACT;
        return true;
      }
      return false;
    },
    mouse,
  };
}
