// HALCYON KEYS, a gta6-01 entry (Node 22, standard library only). The game is game/: plain
// static files a desktop browser loads offline (game/index.html and its ES modules under
// game/src/, no library, no build, no network). It is an original open-world crime game set in a
// sun-soaked island city: a seeded city of causeways, beaches and neon, a day/night cycle,
// traffic, pedestrians, five-star police with roadblocks and a helicopter, gunplay, seven story
// jobs, side activities, synthesized radio and save games.
//
// It is drawn in 3D by its own WebGL2 renderer (game/src/render3d/, written from scratch). This
// version is the polish pass: a low chase camera riding just above the roof (lagging, widening
// with speed, swinging out in drifts, dissolving anything that comes within a few metres of the
// lens) and a closer over-the-shoulder camera; low-poly cars with real wheel arches, spoked wheels
// that spin and steer, see-through glass with drivers at the wheel, glowing lamps, the coupe's
// wing, the HKPD livery and light bar and the KeyCab roof sign; people with knees, elbows, hair
// and outfits; streets dressed with traffic signals, bus shelters, benches, roadside billboards
// and beach kiosks of invented brands. The Canvas 2D HUD now carries a story panel with stage
// progress and the next step, an HKPD response list (call signs, distance, RAMMING / ROADBLOCK /
// SPOTLIGHT...), a weapon slot bar (fists to rifle), health, armour and respect bars, a big
// speed readout with vehicle condition, the radio station and track, a GPS route on the radar
// and city map, and the dialogue box with the speaker's portrait. The classic top-down view
// stays one key away (V); sound is WebAudio synthesized at runtime.
//
// This program hands it in: it copies game/ and screenshots/ from beside this file to /output and
// writes /output/dossier.json, the summary the judge reads, with the vendored make.fun library.
//
// Play it locally with `node serve.ts`, then open http://localhost:8080.
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// Sanity check before handing anything in: the game's page, entry module and 3D renderer must
// exist, and screenshots/ must hold 3 or 4 JPEG/PNG images (nothing else), the cover sorting first.
function refuse(reason: string): never {
  process.stderr.write(`main.ts: refusing to hand in: ${reason}\n`);
  process.exit(1);
}
for (const required of ['game/index.html', 'game/src/main.js', 'game/src/render3d/renderer3d.js', 'game/src/render3d/shaders.js', 'game/src/hud/hud.js', 'game/src/world/streetFurniture.js']) {
  if (!existsSync(join(here, required)) || !statSync(join(here, required)).isFile()) refuse(`${required} is missing`);
}
const shotsDir = join(here, 'screenshots');
const shots = existsSync(shotsDir) ? readdirSync(shotsDir).sort() : [];
const images = shots.filter((name) => /\.(jpe?g|png)$/i.test(name));
if (images.length !== shots.length) refuse(`screenshots/ holds non-image files: ${shots.filter((n) => !images.includes(n)).join(', ')}`);
if (images.length < 3 || images.length > 4) refuse(`screenshots/ must hold 3 or 4 images, found ${images.length}`);
if (!images[0].startsWith('1-')) refuse(`the cover (${images[0]}) should sort first and start with "1-"`);

mkdirSync(out, { recursive: true });
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });

// The scorer's own caps (reference/gate.json): only text_max_bytes shapes the bytes; the others refuse an entry the
// scorer would refuse (more than 4 screenshots or one over 256 KiB; more than 993 files in game/ or 48 MiB of game
// files, in all, or a path under game/ over 1000 bytes: game/ counts beside /output's own 1000-entry cap, its
// screenshots/ and dossier.json).
writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
    game_path_max_bytes: 1000,
  }),
);
