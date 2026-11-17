// HALCYON KEYS: boot. Sizes the canvas to the window, then either runs the game (title screen,
// play and menus via appFlow at a fixed 60 Hz simulation step) or, with ?shot=<scene>&seed=<n>,
// stages a deterministic screenshot scene, paints it and sets window.__shotReady.
import { createApp, frameApp } from './core/appFlow.js';
import { runShot } from './shots/screenshotScenes.js';

const canvas = document.getElementById('game');
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) && seedParam > 0 ? seedParam : 1;

function fit() {
  canvas.width = Math.max(960, window.innerWidth);
  canvas.height = Math.max(600, window.innerHeight);
}

fit();
document.getElementById('boot').style.display = 'none';

if (shot) {
  runShot(shot, seed, canvas);
  window.__shotReady = true;
} else {
  window.addEventListener('resize', fit);
  const app = createApp(canvas);
  const status = document.getElementById('status');
  status.textContent = 'Halcyon Keys. Use the arrow keys and Enter on the title menu.';
  let last = performance.now();
  const frame = (now) => {
    requestAnimationFrame(frame);
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    frameApp(app, dt);
  };
  requestAnimationFrame(frame);
}
