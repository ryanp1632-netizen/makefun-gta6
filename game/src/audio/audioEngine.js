// The sound of the city, all synthesized: an AudioContext opened on the first key or click,
// music / effects / master buses, positional one-shots for the game's events (gunshots, crashes,
// explosions, splashes, pickups, stings), and continuous loops for the engine (pitch follows
// the revs), police sirens, the helicopter and footsteps. The radio plays through the music bus.
import { midiToFreq, noiseBuffer, noiseBurst, tone, kick } from './synth.js';
import { createRadio, startRadio, tuneRadio, STATIONS } from './radioStations.js';

export function createAudio() {
  return { ac: null, master: null, music: null, sfx: null, radio: createRadio(), loops: null, lastStep: 0, radioOn: false, musicLevel: 0.6, sfxLevel: 0.8 };
}

/** Open the audio context (must follow a user gesture). */
export function unlockAudio(audio, settings) {
  if (audio.ac) {
    if (audio.ac.state === 'suspended') audio.ac.resume();
    return;
  }
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return;
  const ac = new Ctx();
  audio.ac = ac;
  audio.master = ac.createGain();
  const comp = ac.createDynamicsCompressor();
  comp.threshold.value = -14;
  comp.ratio.value = 4;
  audio.master.connect(comp);
  comp.connect(ac.destination);
  audio.music = ac.createGain();
  audio.music.connect(audio.master);
  audio.sfx = ac.createGain();
  audio.sfx.connect(audio.master);
  setVolumes(audio, settings);
  startRadio(audio.radio, ac, audio.music);
  audio.loops = makeLoops(audio);
}

export function setVolumes(audio, settings) {
  if (!audio.ac) return;
  const t = audio.ac.currentTime;
  audio.master.gain.setTargetAtTime(settings.master, t, 0.05);
  audio.sfx.gain.setTargetAtTime(settings.sfx, t, 0.05);
  audio.musicLevel = settings.music;
}

function makeLoops(audio) {
  const ac = audio.ac;
  const engineGain = ac.createGain();
  engineGain.gain.value = 0;
  const filter = ac.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 600;
  filter.connect(engineGain);
  engineGain.connect(audio.sfx);
  const e1 = ac.createOscillator();
  e1.type = 'sawtooth';
  const e2 = ac.createOscillator();
  e2.type = 'square';
  e1.connect(filter);
  e2.connect(filter);
  e1.start();
  e2.start();
  const sirenGain = ac.createGain();
  sirenGain.gain.value = 0;
  sirenGain.connect(audio.sfx);
  const siren = ac.createOscillator();
  siren.type = 'triangle';
  siren.frequency.value = 800;
  siren.connect(sirenGain);
  siren.start();
  const rotorGain = ac.createGain();
  rotorGain.gain.value = 0;
  const rotorFilter = ac.createBiquadFilter();
  rotorFilter.type = 'lowpass';
  rotorFilter.frequency.value = 300;
  const rotorSrc = ac.createBufferSource();
  rotorSrc.buffer = noiseBuffer(ac);
  rotorSrc.loop = true;
  rotorSrc.connect(rotorFilter);
  rotorFilter.connect(rotorGain);
  rotorGain.connect(audio.sfx);
  rotorSrc.start();
  const surfGain = ac.createGain();
  surfGain.gain.value = 0.02;
  const surfFilter = ac.createBiquadFilter();
  surfFilter.type = 'lowpass';
  surfFilter.frequency.value = 500;
  const surfSrc = ac.createBufferSource();
  surfSrc.buffer = noiseBuffer(ac);
  surfSrc.loop = true;
  surfSrc.connect(surfFilter);
  surfFilter.connect(surfGain);
  surfGain.connect(audio.sfx);
  surfSrc.start();
  return { engineGain, filter, e1, e2, sirenGain, siren, rotorGain, surfGain };
}

function spatial(game, x, y, range = 900) {
  const cam = game.camera;
  const d = Math.hypot(x - cam.x, y - cam.y);
  return Math.max(0, 1 - d / range);
}

/** Turn this frame's game events into sounds. */
export function playEvents(audio, game, events) {
  const ac = audio.ac;
  if (!ac) return;
  const out = audio.sfx;
  const t = ac.currentTime;
  let shots = 0;
  for (const e of events) {
    const near = e.x !== undefined ? spatial(game, e.x, e.y) : 1;
    switch (e.type) {
      case 'gunshot': {
        if (near <= 0 || shots > 5) break;
        shots += 1;
        const big = e.weapon === 'shotgun' ? 1.5 : e.weapon === 'rifle' ? 1.2 : 1;
        noiseBurst(ac, out, t, 0.12 * big, 0.5 * near * (e.team === 'player' ? 1 : 0.7), 'bandpass', 1400 / big, 0.7, 300);
        tone(ac, out, t, 140, 0.08, 0.35 * near, 'sine', 40);
        break;
      }
      case 'explosion':
        noiseBurst(ac, out, t, 1.4, 0.9 * Math.max(0.2, near), 'lowpass', 1800, 0.5, 80);
        kick(ac, out, t, 0.9 * Math.max(0.2, near));
        break;
      case 'crash':
        if (near > 0) {
          noiseBurst(ac, out, t, 0.25, Math.min(0.6, e.power / 500) * near, 'bandpass', 900, 1.2);
          tone(ac, out, t, 220, 0.12, 0.12 * near, 'square', 90);
        }
        break;
      case 'thud':
        tone(ac, out, t, 90, 0.12, 0.3 * near, 'sine', 50);
        break;
      case 'splash':
        noiseBurst(ac, out, t, 0.5, 0.35 * near, 'lowpass', 2500, 0.8, 300);
        break;
      case 'honk':
        if (near > 0) {
          tone(ac, out, t, 392, 0.28, 0.07 * near, 'square');
          tone(ac, out, t, 494, 0.28, 0.06 * near, 'square');
        }
        break;
      case 'reload':
        noiseBurst(ac, out, t, 0.04, 0.25, 'highpass', 3000);
        noiseBurst(ac, out, t + 0.35, 0.05, 0.3, 'highpass', 2200);
        break;
      case 'dryfire':
        tone(ac, out, t, 1800, 0.03, 0.15, 'square');
        break;
      case 'pickup':
        [0, 4, 7, 12].forEach((n, i) => tone(ac, out, t + i * 0.07, midiToFreq(76 + n), 0.16, 0.18, 'triangle'));
        break;
      case 'purchase':
      case 'respray':
        noiseBurst(ac, out, t, 0.6, 0.18, 'highpass', 4000);
        tone(ac, out, t + 0.1, 880, 0.2, 0.15, 'sine', 1320);
        break;
      case 'levelUp':
        [0, 4, 7, 11, 14].forEach((n, i) => tone(ac, out, t + i * 0.09, midiToFreq(72 + n), 0.3, 0.16, 'square'));
        break;
      case 'wantedUp':
        tone(ac, out, t, 660, 0.15, 0.18, 'square', 880);
        tone(ac, out, t + 0.16, 660, 0.15, 0.18, 'square', 880);
        break;
      case 'evaded':
        [0, 5, 9].forEach((n, i) => tone(ac, out, t + i * 0.1, midiToFreq(67 + n), 0.25, 0.15, 'triangle'));
        break;
      case 'jobComplete':
        [0, 4, 7, 12, 16, 19, 24].forEach((n, i) => tone(ac, out, t + i * 0.08, midiToFreq(60 + n), 0.5, 0.14, 'sawtooth'));
        kick(ac, out, t, 0.6);
        break;
      case 'missionFailed':
        [7, 4, 0, -5].forEach((n, i) => tone(ac, out, t + i * 0.18, midiToFreq(60 + n), 0.3, 0.16, 'square'));
        break;
      case 'missionStart':
      case 'checkpoint':
        tone(ac, out, t, 988, 0.12, 0.16, 'square', 1320);
        break;
      case 'raceGo':
        tone(ac, out, t, 1320, 0.4, 0.2, 'square');
        break;
      case 'dialogue':
        tone(ac, out, t, 520, 0.05, 0.06, 'sine', 700);
        break;
      default:
        break;
    }
  }
}

/** Continuous sounds: engine, sirens, rotor, footsteps, surf, and radio level. */
export function updateLoops(audio, game, playing) {
  const ac = audio.ac;
  if (!ac || !audio.loops) return;
  const L = audio.loops;
  const t = ac.currentTime;
  const pl = game.player;
  const v = pl.vehicle;
  if (v && playing && !v.wrecked) {
    const sport = v.model === 'coupe' || v.model === 'muscle' || v.model === 'bike' ? 1.4 : 1;
    const f = (34 + v.rpm * 120) * sport;
    L.e1.frequency.setTargetAtTime(f, t, 0.05);
    L.e2.frequency.setTargetAtTime(f * 0.5, t, 0.05);
    L.filter.frequency.setTargetAtTime(300 + v.rpm * 1400 + (v.input.throttle > 0 ? 500 : 0), t, 0.08);
    L.engineGain.gain.setTargetAtTime(0.05 + v.rpm * 0.05, t, 0.1);
  } else L.engineGain.gain.setTargetAtTime(0, t, 0.15);
  let siren = 0;
  if (playing) for (const c of game.vehicles) if (c.siren && c.model === 'police' && !c.wrecked) siren = Math.max(siren, spatial(game, c.x, c.y, 1100));
  const wail = 0.5 + 0.5 * Math.sin(t * Math.PI * 1.25);
  L.siren.frequency.setTargetAtTime(650 + wail * 650, t, 0.05);
  L.sirenGain.gain.setTargetAtTime(siren * 0.05, t, 0.1);
  const rotor = playing && game.heli ? spatial(game, game.heli.x, game.heli.y, 1300) : 0;
  L.rotorGain.gain.setTargetAtTime(rotor * (0.18 + 0.12 * Math.sin(t * 90)), t, 0.01);
  L.surfGain.gain.setTargetAtTime(playing ? 0.025 + 0.015 * Math.sin(t * 0.6) : 0, t, 0.3);
  // Footsteps: a soft tick each stride.
  if (playing && !v && !pl.dead && pl.speed > 30) {
    const stepIndex = Math.floor(pl.walkPhase / Math.PI);
    if (stepIndex !== audio.lastStep) {
      audio.lastStep = stepIndex;
      noiseBurst(ac, audio.sfx, t, 0.04, pl.speed > 130 ? 0.08 : 0.05, 'bandpass', 900, 1.5);
    }
  }
  // Radio: loud in cars, off on foot; the title screen keeps it as music.
  const radioWanted = audio.radioOn ? audio.musicLevel : 0;
  if (audio.radio.out) audio.radio.out.gain.setTargetAtTime(radioWanted, t, 0.4);
}

/** Step the radio dial (+1/-1) and return the station now playing. */
export function switchStation(audio, dir) {
  tuneRadio(audio.radio, audio.radio.station + dir, audio.ac);
  if (audio.ac) tone(audio.ac, audio.sfx, audio.ac.currentTime, 1200, 0.05, 0.08, 'square', 600);
  return STATIONS[audio.radio.station];
}

export function currentStation(audio) {
  return STATIONS[audio.radio.station];
}

/** A short UI blip for menus. */
export function uiBlip(audio, kind = 'move') {
  if (!audio.ac) return;
  const t = audio.ac.currentTime;
  if (kind === 'move') tone(audio.ac, audio.sfx, t, 660, 0.05, 0.08, 'square');
  else if (kind === 'ok') tone(audio.ac, audio.sfx, t, 880, 0.1, 0.12, 'square', 1320);
  else tone(audio.ac, audio.sfx, t, 330, 0.12, 0.1, 'square', 200);
}
