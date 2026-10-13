// Small synthesized sound effects (no audio files): wooden "tok" for moves,
// a sharper knock for captures, and short chimes for right / wrong answers.
import { settings } from './store.js';

let ctx = null;

function audio() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function knock(t, { freq = 180, decay = 0.09, gain = 0.5, noise = 0.35, cutoff = 2200 } = {}) {
  const a = audio();
  // Body: a quickly falling sine.
  const osc = a.createOscillator();
  const og = a.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(freq * 1.6, t);
  osc.frequency.exponentialRampToValueAtTime(freq, t + 0.03);
  og.gain.setValueAtTime(gain, t);
  og.gain.exponentialRampToValueAtTime(0.0001, t + decay);
  osc.connect(og).connect(a.destination);
  osc.start(t);
  osc.stop(t + decay + 0.02);
  // Click: a burst of filtered noise.
  const len = Math.floor(a.sampleRate * 0.04);
  const buf = a.createBuffer(1, len, a.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 3;
  const src = a.createBufferSource();
  src.buffer = buf;
  const filter = a.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = cutoff;
  const ng = a.createGain();
  ng.gain.value = noise;
  src.connect(filter).connect(ng).connect(a.destination);
  src.start(t);
}

function tone(t, freq, dur, { type = 'triangle', gain = 0.18 } = {}) {
  const a = audio();
  const osc = a.createOscillator();
  const g = a.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g).connect(a.destination);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

const SOUNDS = {
  move: (t) => knock(t),
  capture: (t) => { knock(t, { freq: 140, gain: 0.45, noise: 0.45, cutoff: 3200 }); knock(t + 0.045, { freq: 220, gain: 0.2, noise: 0.2 }); },
  castle: (t) => { knock(t); knock(t + 0.09, { freq: 200, gain: 0.4 }); },
  check: (t) => { knock(t, { gain: 0.45 }); tone(t + 0.02, 880, 0.18, { type: 'sine', gain: 0.08 }); },
  correct: (t) => { tone(t, 659.25, 0.16); tone(t + 0.09, 987.77, 0.28); },
  wrong: (t) => { tone(t, 220, 0.22, { type: 'sawtooth', gain: 0.06 }); tone(t + 0.12, 174.6, 0.3, { type: 'sawtooth', gain: 0.06 }); },
  partial: (t) => { tone(t, 587.33, 0.16); tone(t + 0.1, 587.33, 0.22, { gain: 0.12 }); },
  complete: (t) => { [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(t + i * 0.08, f, 0.35, { gain: 0.14 })); },
};

export function play(name) {
  if (!settings.sound || !SOUNDS[name]) return;
  try {
    SOUNDS[name](audio().currentTime + 0.005);
  } catch {
    // Audio unavailable: stay silent.
  }
}

/** The right sound for a chess.js verbose move. */
export function playMove(m, givesCheck) {
  if (givesCheck) play('check');
  else if (m.flags.includes('k') || m.flags.includes('q')) play('castle');
  else if (m.captured) play('capture');
  else play('move');
}
