// Synth voices built from WebAudio oscillators, filters and a shared noise buffer: drums, basses,
// pads, plucks, marimba and electric piano. The radio stations and sound effects play these.

let noise = null;

export const midiToFreq = (m) => 440 * 2 ** ((m - 69) / 12);

export function noiseBuffer(ac) {
  if (noise && noise.sampleRate === ac.sampleRate) return noise;
  noise = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
  const d = noise.getChannelData(0);
  let seed = 12345;
  for (let i = 0; i < d.length; i += 1) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    d[i] = (seed / 0x7fffffff) * 2 - 1;
  }
  return noise;
}

/** A gain node shaped by an attack/decay envelope, connected to dest. */
export function envelope(ac, dest, t, attack, decay, peak, release = 0.05, hold = 0) {
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + attack);
  g.gain.setValueAtTime(Math.max(0.0002, peak), t + attack + hold);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + hold + decay + release);
  g.connect(dest);
  return g;
}

function osc(ac, type, freq, t, stop, dest, detune = 0) {
  const o = ac.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  o.detune.value = detune;
  o.connect(dest);
  o.start(t);
  o.stop(stop);
  return o;
}

function noiseSource(ac, t, dur, dest) {
  const s = ac.createBufferSource();
  s.buffer = noiseBuffer(ac);
  s.connect(dest);
  s.start(t, Math.random() * 1.5, dur + 0.05);
  return s;
}

export function kick(ac, dest, t, vol = 0.9) {
  const g = envelope(ac, dest, t, 0.003, 0.32, vol);
  const o = osc(ac, 'sine', 150, t, t + 0.4, g);
  o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
}

export function snare(ac, dest, t, vol = 0.5, tone = 1800) {
  const g = envelope(ac, dest, t, 0.002, 0.18, vol);
  const f = ac.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = tone;
  f.Q.value = 0.8;
  f.connect(g);
  noiseSource(ac, t, 0.25, f);
  const g2 = envelope(ac, dest, t, 0.002, 0.08, vol * 0.5);
  osc(ac, 'triangle', 190, t, t + 0.12, g2);
}

export function hat(ac, dest, t, vol = 0.2, open = false) {
  const g = envelope(ac, dest, t, 0.001, open ? 0.22 : 0.045, vol);
  const f = ac.createBiquadFilter();
  f.type = 'highpass';
  f.frequency.value = 7000;
  f.connect(g);
  noiseSource(ac, t, open ? 0.3 : 0.08, f);
}

export function rim(ac, dest, t, vol = 0.3) {
  const g = envelope(ac, dest, t, 0.001, 0.05, vol);
  osc(ac, 'square', 1700, t, t + 0.07, g);
}

export function bass(ac, dest, t, freq, dur, vol = 0.4, type = 'sawtooth', cutoff = 600) {
  const g = envelope(ac, dest, t, 0.008, dur * 0.8, vol, 0.04);
  const f = ac.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.setValueAtTime(cutoff * 2.2, t);
  f.frequency.exponentialRampToValueAtTime(cutoff, t + dur * 0.6);
  f.Q.value = 4;
  f.connect(g);
  osc(ac, type, freq, t, t + dur + 0.1, f);
  osc(ac, 'sine', freq / 2, t, t + dur + 0.1, g);
}

export function pad(ac, dest, t, freqs, dur, vol = 0.12, cutoff = 1800) {
  const g = envelope(ac, dest, t, Math.min(0.4, dur * 0.3), dur * 0.6, vol, 0.3, dur * 0.2);
  const f = ac.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = cutoff;
  f.connect(g);
  for (const fr of freqs) {
    osc(ac, 'sawtooth', fr, t, t + dur + 0.6, f, -9);
    osc(ac, 'sawtooth', fr, t, t + dur + 0.6, f, 9);
  }
}

export function pluck(ac, dest, t, freq, dur, vol = 0.18, type = 'square', cutoff = 2400) {
  const g = envelope(ac, dest, t, 0.003, dur, vol);
  const f = ac.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.setValueAtTime(cutoff, t);
  f.frequency.exponentialRampToValueAtTime(300, t + dur);
  f.connect(g);
  osc(ac, type, freq, t, t + dur + 0.1, f);
}

export function marimba(ac, dest, t, freq, vol = 0.22) {
  const g = envelope(ac, dest, t, 0.002, 0.35, vol);
  osc(ac, 'sine', freq, t, t + 0.45, g);
  const g2 = envelope(ac, dest, t, 0.001, 0.06, vol * 0.5);
  osc(ac, 'sine', freq * 4, t, t + 0.1, g2);
}

export function rhodes(ac, dest, t, freqs, dur, vol = 0.1) {
  for (const fr of freqs) {
    const g = envelope(ac, dest, t, 0.01, dur, vol);
    osc(ac, 'sine', fr, t, t + dur + 0.1, g);
    const g2 = envelope(ac, dest, t, 0.005, dur * 0.3, vol * 0.35);
    osc(ac, 'triangle', fr * 2, t, t + dur * 0.4, g2);
  }
}

/** A filtered noise burst (gunshots, crashes, splashes, spray). */
export function noiseBurst(ac, dest, t, dur, vol, type, freq, q = 1, sweepTo = null) {
  const g = envelope(ac, dest, t, 0.002, dur, vol);
  const f = ac.createBiquadFilter();
  f.type = type;
  f.frequency.setValueAtTime(freq, t);
  if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
  f.Q.value = q;
  f.connect(g);
  noiseSource(ac, t, dur + 0.1, f);
}

/** A pitched blip (UI, pickups). */
export function tone(ac, dest, t, freq, dur, vol, type = 'sine', slideTo = null) {
  const g = envelope(ac, dest, t, 0.004, dur, vol);
  const o = osc(ac, type, freq, t, t + dur + 0.08, g);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
}
