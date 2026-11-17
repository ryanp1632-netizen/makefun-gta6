// HALCYON KEYS: boot. Sizes the canvases to the window (the WebGL 3D view underneath, the 2D HUD
// and menus on top), then either runs the game (title screen, play and menus via appFlow at a
// fixed 60 Hz simulation step) or, with ?shot=<scene>&seed=<n>, stages a deterministic screenshot
// scene, paints it and sets window.__shotReady.
import { createApp, frameApp } from './core/appFlow.js';
import { runShot } from './shots/screenshotScenes.js';

const canvas = document.getElementById('game');
const canvas3d = document.getElementById('world3d');
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) && seedParam > 0 ? seedParam : 1;

function fit() {
  if (shot) {
    // Screenshots are drawn at the size of the image the capture produces (default 1280x800),
    // whatever viewport the headless browser reports, so nothing comes out stretched.
    canvas.width = Number.parseInt(params.get('w') ?? '', 10) || 1280;
    canvas.height = Number.parseInt(params.get('h') ?? '', 10) || 800;
    return;
  }
  canvas.width = Math.max(960, window.innerWidth);
  canvas.height = Math.max(600, window.innerHeight);
}

fit();
document.getElementById('boot').style.display = 'none';

if (shot) {
  runShot(shot, seed, canvas, canvas3d);
  window.__shotReady = true;
} else {
  window.addEventListener('resize', fit);
  const app = createApp(canvas, canvas3d);
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
