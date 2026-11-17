// Four original radio stations, composed live: each has its own tempo, key, chord progression,
// drum pattern and instruments, with seeded melodic variation bar to bar, scheduled a little
// ahead of the audio clock. Q / E switch stations in a car; the title screen plays WAVE 88.1.
import { bass, hat, kick, marimba, midiToFreq, pad, pluck, rhodes, rim, snare } from './synth.js';
import { hash2 } from '../core/random.js';

export const STATIONS = [
  { id: 'wave', name: 'WAVE 88.1  ·  Neon Drive', genre: 'Synthwave', color: '#ff4fd8', bpm: 98, root: 45, scale: [0, 2, 3, 5, 7, 8, 10], chords: [0, 5, 3, 6] },
  { id: 'calle', name: 'CALLE 96.4  ·  Fuego', genre: 'Dembow', color: '#ffb347', bpm: 94, root: 50, scale: [0, 2, 3, 5, 7, 8, 10], chords: [0, 5, 2, 6] },
  { id: 'lowtide', name: 'LOW TIDE 101.7  ·  Dub & Lo-fi', genre: 'Lo-fi dub', color: '#5ad8ff', bpm: 76, root: 48, scale: [0, 2, 4, 5, 7, 9, 11], chords: [0, 5, 1, 4] },
  { id: 'pulse', name: 'PULSE 104.3  ·  Club Keys', genre: 'Electro house', color: '#7dff6a', bpm: 124, root: 41, scale: [0, 2, 3, 5, 7, 8, 10], chords: [0, 0, 5, 6] },
];

/** The notes (midi) of the triad on scale degree `deg`, plus a seventh. */
function chord(st, deg, octave = 0) {
  const s = st.scale;
  const note = (d) => st.root + 12 + octave * 12 + s[d % 7] + Math.floor(d / 7) * 12;
  return [note(deg), note(deg + 2), note(deg + 4), note(deg + 6)];
}

function scaleNote(st, deg, octave) {
  const s = st.scale;
  return st.root + 12 * octave + s[((deg % 7) + 7) % 7] + Math.floor(deg / 7) * 12;
}

/** Schedule one sixteenth-note step of a station at audio time t. */
function scheduleStep(ac, out, st, step, t) {
  const bar = Math.floor(step / 16);
  const s = step % 16;
  const beat = 60 / st.bpm;
  const six = beat / 4;
  const deg = st.chords[bar % 4];
  const ch = chord(st, deg);
  const rootF = midiToFreq(scaleNote(st, deg, 1));
  const r = (k) => hash2(bar * 16 + s, k, st.bpm);
  if (st.id === 'wave') {
    if (s % 8 === 0) kick(ac, out, t, 0.8);
    if (s % 8 === 4) snare(ac, out, t, 0.45, 1400);
    if (s % 2 === 0) hat(ac, out, t, 0.08);
    if (s % 2 === 0) bass(ac, out, t, rootF * (s % 4 === 2 ? 2 : 1), six * 1.6, 0.22, 'sawtooth', 420);
    if (s === 0) pad(ac, out, t, ch.slice(0, 3).map(midiToFreq), beat * 4, 0.05, 1400);
    const arp = ch[[0, 1, 2, 3, 2, 1][s % 6]] + 12;
    pluck(ac, out, t, midiToFreq(arp), six * 0.9, 0.05, 'sawtooth', 3200);
    if ((s === 0 || s === 6 || s === 10) && bar % 2 === 1) pluck(ac, out, t, midiToFreq(scaleNote(st, deg + Math.floor(r(1) * 5), 4)), beat * 0.9, 0.06, 'square', 2600);
  } else if (st.id === 'calle') {
    // The dembow: boom on 1, the snare's 3-3-2 push around it.
    if (s === 0 || s === 8) kick(ac, out, t, 0.85);
    if (s === 3 || s === 6 || s === 11 || s === 14) snare(ac, out, t, 0.32, 2200);
    if (s % 2 === 0) hat(ac, out, t, 0.06);
    if (s === 0 || s === 3 || s === 8 || s === 11) bass(ac, out, t, rootF / 2, six * 2.5, 0.32, 'sine', 300);
    if ([0, 3, 6, 8, 10, 13].includes(s)) marimba(ac, out, t, midiToFreq(ch[Math.floor(r(2) * 3)] + 12), 0.16);
    if (s === 0 && bar % 2 === 0) pad(ac, out, t, ch.slice(0, 3).map((m) => midiToFreq(m)), beat * 8, 0.03, 900);
    if (bar % 4 === 3 && s % 4 === 2) pluck(ac, out, t, midiToFreq(scaleNote(st, deg + Math.floor(r(3) * 6), 4)), six * 1.5, 0.05, 'triangle', 2000);
  } else if (st.id === 'lowtide') {
    if (s === 0 || s === 10) kick(ac, out, t, 0.6);
    if (s === 8) rim(ac, out, t, 0.12);
    if (s === 8) snare(ac, out, t, 0.18, 1200);
    if (s % 4 === 2) hat(ac, out, t, 0.05, s === 14);
    if (s === 4 || s === 12) rhodes(ac, out, t, ch.map(midiToFreq), beat * 0.6, 0.045);
    if (s === 0) rhodes(ac, out, t, ch.slice(0, 3).map((m) => midiToFreq(m - 12)), beat * 2, 0.03);
    if ([0, 3, 6, 10].includes(s)) bass(ac, out, t, rootF / 2 * (s === 6 ? 1.5 : 1), six * 2.4, 0.3, 'triangle', 380);
    if (s % 8 === 6 && r(4) > 0.4) pluck(ac, out, t, midiToFreq(scaleNote(st, deg + Math.floor(r(5) * 7), 5)), beat * 0.8, 0.035, 'sine', 1800);
  } else {
    if (s % 4 === 0) kick(ac, out, t, 0.85);
    if (s % 8 === 4) snare(ac, out, t, 0.3, 2400);
    if (s % 4 === 2) hat(ac, out, t, 0.12, true);
    else hat(ac, out, t, 0.05);
    if (s % 4 === 2) bass(ac, out, t, rootF, six * 1.5, 0.3, 'square', 520);
    if ([0, 3, 6, 10, 12].includes(s) && bar % 4 !== 3) pluck(ac, out, t, midiToFreq(ch[s % 3] + 12), six * 1.4, 0.06, 'sawtooth', 2800);
    if (s === 0) pad(ac, out, t, ch.slice(0, 3).map(midiToFreq), beat * 4, 0.035, 2200);
  }
}

/** The radio: a station index (-1 = off) and a look-ahead scheduler into `out`. */
export function createRadio() {
  return { station: 0, step: 0, next: 0, out: null, timer: null };
}

export function startRadio(radio, ac, dest) {
  if (radio.timer) return;
  radio.out = ac.createGain();
  radio.out.gain.value = 0.9;
  radio.out.connect(dest);
  radio.next = ac.currentTime + 0.1;
  radio.timer = setInterval(() => {
    const st = STATIONS[radio.station];
    if (!st) return;
    while (radio.next < ac.currentTime + 0.15) {
      scheduleStep(ac, radio.out, st, radio.step, radio.next);
      radio.next += 60 / st.bpm / 4;
      radio.step += 1;
    }
  }, 25);
}

/** Switch to station index i (wrapping), restarting at the top of a bar. */
export function tuneRadio(radio, i, ac) {
  radio.station = ((i % STATIONS.length) + STATIONS.length) % STATIONS.length;
  radio.step = 0;
  if (ac) radio.next = ac.currentTime + 0.12;
}
