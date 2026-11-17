// Keyboard and mouse: held keys, one-shot presses (kept until a simulation step uses them),
// the mouse position in screen space, buttons and the wheel, mapped onto the game's controls.
import { screenToWorld } from '../render/camera.js';

export function createInput(canvas) {
  const held = new Set();
  const pressed = new Set();
  const mouse = { x: 640, y: 400, down: false, pressed: false, wheel: 0 };
  const swallow = new Set(['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab']);
  window.addEventListener('keydown', (e) => {
    if (swallow.has(e.code)) e.preventDefault();
    if (!held.has(e.code)) pressed.add(e.code);
    held.add(e.code);
  });
  window.addEventListener('keyup', (e) => held.delete(e.code));
  window.addEventListener('blur', () => {
    held.clear();
    mouse.down = false;
  });
  canvas.addEventListener('mousemove', (e) => {
    const r = canvas.getBoundingClientRect();
    mouse.x = ((e.clientX - r.left) / r.width) * canvas.width;
    mouse.y = ((e.clientY - r.top) / r.height) * canvas.height;
  });
  canvas.addEventListener('mousedown', (e) => {
    if (e.button === 0) {
      mouse.down = true;
      mouse.pressed = true;
    }
  });
  window.addEventListener('mouseup', (e) => {
    if (e.button === 0) mouse.down = false;
  });
  canvas.addEventListener('wheel', (e) => {
    mouse.wheel += Math.sign(e.deltaY);
    e.preventDefault();
  }, { passive: false });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  return {
    held, pressed, mouse,
    isDown: (code) => held.has(code),
    /** True once per key press (consumed). */
    take(code) {
      if (!pressed.has(code)) return false;
      pressed.delete(code);
      return true;
    },
    peek: (code) => pressed.has(code),
    /** Forget one-shot presses (after a simulation step has seen them). */
    flush() {
      pressed.clear();
      mouse.pressed = false;
      mouse.wheel = 0;
    },
  };
}

/** Fill the game's control state from the devices for this frame. */
export function readControls(input, game, out) {
  const k = input.isDown;
  out.moveX = (k('KeyD') || k('ArrowRight') ? 1 : 0) - (k('KeyA') || k('ArrowLeft') ? 1 : 0);
  out.moveY = (k('KeyS') || k('ArrowDown') ? 1 : 0) - (k('KeyW') || k('ArrowUp') ? 1 : 0);
  const aim = screenToWorld(game.camera, input.mouse.x, input.mouse.y);
  out.aimX = aim.x;
  out.aimY = aim.y;
  out.fire = input.mouse.down;
  out.firePressed = input.mouse.pressed;
  out.sprint = k('ShiftLeft') || k('ShiftRight');
  out.handbrake = k('Space');
  out.enter = input.peek('KeyF');
  out.interact = input.peek('KeyE');
  out.reload = input.peek('KeyR');
  out.weaponNext = input.mouse.wheel > 0 ? 1 : input.mouse.wheel < 0 ? -1 : 0;
  out.weaponSlot = input.peek('Digit1') ? 1 : input.peek('Digit2') ? 2 : input.peek('Digit3') ? 3 : input.peek('Digit4') ? 4 : 0;
  out.radio = input.peek('KeyQ') ? -1 : 0;
  return out;
}
