// The music: a looping chiptune-metal track, "Ticket Queue", synthesized live with the
// Web Audio API (no audio files) into audio.js's music bus. Distorted power-chord
// gallops, a square-wave lead and an 8-bit drum kit, sequenced in sixteenth notes.
//
// The score is plain data: each section is a list of bars, each bar a chord root (in
// semitones above low E) and the rhythm and lead to play over it. The scheduler looks a
// little ahead of the audio clock, so the music keeps time even when frames drop.

import { audioContext, musicOut, settings } from './audio.js';

const BPM = 152;
const STEP = 60 / BPM / 4; // one sixteenth note, seconds
const LOOKAHEAD = 0.25;
const E2 = 82.41;
const hz = (semi) => E2 * 2 ** (semi / 12);

// Rhythms for the rhythm guitar, one character per sixteenth: X accented chord,
// x palm-muted chug, - rest.
const R = {
  gallop: 'X-xxx-xxX-xxx-xx',
  drive: 'XxxxXxxxXxxxXxxx',
  stab: 'X--x--X---X-X---',
  hold: 'X---------------',
  push: 'X-x-X-x-XxXxXxXx',
};

// Drums per sixteenth: k kick, s snare, h hat, c crash (and combinations).
const D = {
  rock: ['kc', 'h', 'h', 'h', 'sh', 'h', 'kh', 'h', 'kh', 'h', 'h', 'kh', 'sh', 'h', 'h', 'h'],
  gallop: ['kh', '', 'k', 'k', 'sh', '', 'k', 'k', 'kh', '', 'k', 'k', 'sh', '', 'k', 'k'],
  half: ['kc', '', 'h', '', 'h', '', 'h', '', 'sh', '', 'h', '', 'h', '', 'k', ''],
  fill: ['k', 's', 'k', 's', 's', 's', 'k', 's', 's', 's', 's', 's', 'ks', 's', 'ks', 's'],
};

// Lead lines: semitones above E3 per sixteenth, '.' to hold, ' ' for silence.
const lead = (s) => s.split(',').map((n) => (n === '.' ? '.' : n === '' ? null : Number(n)));
const L = {
  a1: lead('0,.,3,.,5,.,7,.,10,.,7,.,5,.,3,.'),
  a2: lead('12,.,10,.,7,.,10,.,12,.,15,.,14,.,12,.'),
  a3: lead('7,.,.,.,5,.,3,.,5,.,.,.,7,.,.,.'),
  a4: lead('3,.,2,.,0,.,.,.,,,,,,,,'),
  b1: lead('19,17,15,14,15,14,12,10,12,10,7,5,7,.,.,.'),
  b2: lead('19,17,15,14,15,17,19,22,24,.,22,.,19,.,.,.'),
};

// Sections: [root, rhythm, drums, lead?] per bar.
const SECTIONS = {
  intro: [[0, 'hold', 'half'], [0, 'hold', 'half'], [3, 'stab', 'half'], [5, 'stab', 'fill']],
  verse: [[0, 'gallop', 'gallop'], [0, 'gallop', 'gallop'], [3, 'gallop', 'gallop'], [5, 'push', 'gallop'],
    [0, 'gallop', 'gallop'], [0, 'gallop', 'gallop'], [8, 'gallop', 'gallop'], [7, 'push', 'fill']],
  chorus: [[0, 'drive', 'rock', 'a1'], [3, 'drive', 'rock', 'a2'], [8, 'drive', 'rock', 'a3'], [7, 'drive', 'rock', 'a4'],
    [0, 'drive', 'rock', 'a1'], [3, 'drive', 'rock', 'a2'], [10, 'drive', 'rock', 'b1'], [7, 'push', 'fill', 'b2']],
  bridge: [[8, 'stab', 'half'], [10, 'stab', 'half'], [0, 'stab', 'half'], [-2, 'push', 'fill']],
};
const ORDER = ['intro', 'verse', 'chorus', 'verse', 'bridge', 'chorus'];
const LOOP_FROM = 1; // after the first time through, the intro is skipped

let timer = null;
let nextTime = 0;
let pos = { section: 0, bar: 0, step: 0 };
let shaper = null;

export function startMusic() {
  const ctx = audioContext();
  if (!ctx || timer) return;
  nextTime = ctx.currentTime + 0.1;
  pos = { section: 0, bar: 0, step: 0 };
  timer = setInterval(schedule, 50);
  schedule();
}

export function stopMusic() {
  clearInterval(timer);
  timer = null;
}

function schedule() {
  const ctx = audioContext();
  if (!ctx) return;
  if (!settings.music || settings.muted) {
    nextTime = ctx.currentTime + 0.1; // stay in time, but don't make sound
    return;
  }
  // After a long stall (a background tab), skip ahead rather than play a pile-up.
  if (nextTime < ctx.currentTime - 0.2) nextTime = ctx.currentTime + 0.05;
  while (nextTime < ctx.currentTime + LOOKAHEAD) {
    playStep(ctx, nextTime);
    nextTime += STEP;
    advance();
  }
}

function advance() {
  pos.step++;
  if (pos.step < 16) return;
  pos.step = 0;
  pos.bar++;
  if (pos.bar < SECTIONS[ORDER[pos.section]].length) return;
  pos.bar = 0;
  pos.section++;
  if (pos.section >= ORDER.length) pos.section = LOOP_FROM;
}

function playStep(ctx, t) {
  const out = musicOut();
  const [root, rhythm, drums, leadName] = SECTIONS[ORDER[pos.section]][pos.bar];
  const s = pos.step;
  const g = R[rhythm][s];
  if (g === 'X') chord(ctx, out, root, t, STEP * (rhythm === 'hold' ? 14 : 1.8), 0.26, false);
  else if (g === 'x') chord(ctx, out, root, t, STEP * 0.9, 0.2, true);
  const d = D[drums][s];
  if (d.includes('k')) kick(ctx, out, t);
  if (d.includes('s')) snare(ctx, out, t);
  if (d.includes('h')) hat(ctx, out, t, 0.05);
  if (d.includes('c')) hat(ctx, out, t, 0.6, 0.12);
  if (leadName) {
    const line = L[leadName];
    const n = line[s];
    if (typeof n === 'number') {
      let len = 1;
      while (s + len < 16 && line[s + len] === '.') len++;
      square(ctx, out, hz(n + 12), t, STEP * len * 0.95, 0.07);
    }
  }
}

function distortion(ctx) {
  if (shaper) return shaper;
  const curve = new Float32Array(1024);
  for (let i = 0; i < 1024; i++) {
    const x = (i / 512) - 1;
    curve[i] = Math.tanh(x * 9) * 0.8;
  }
  shaper = curve;
  return curve;
}

// A power chord (root, fifth, octave) through fuzz and a cabinet-ish low-pass. Palm-muted
// chugs are shorter and darker.
function chord(ctx, out, root, t, len, vol, muted) {
  const g = ctx.createGain();
  const ws = ctx.createWaveShaper();
  ws.curve = distortion(ctx);
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = muted ? 700 : 2400;
  lp.Q.value = 1.2;
  const pre = ctx.createGain();
  pre.gain.value = 0.5;
  pre.connect(ws).connect(lp).connect(g).connect(out);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + len);
  for (const [semi, detune] of [[0, -6], [7, 5], [12, 0]]) {
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = hz(root + semi);
    o.detune.value = detune;
    o.connect(pre);
    o.start(t);
    o.stop(t + len + 0.02);
  }
}

function square(ctx, out, f, t, len, vol) {
  const o = ctx.createOscillator();
  o.type = 'square';
  o.frequency.value = f;
  // A little vibrato on long notes.
  if (len > STEP * 2) {
    const lfo = ctx.createOscillator();
    const depth = ctx.createGain();
    lfo.frequency.value = 6;
    depth.gain.value = f * 0.012;
    lfo.connect(depth).connect(o.frequency);
    lfo.start(t + STEP);
    lfo.stop(t + len);
  }
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.setValueAtTime(vol, t + len * 0.8);
  g.gain.linearRampToValueAtTime(0, t + len);
  o.connect(g).connect(out);
  o.start(t);
  o.stop(t + len + 0.01);
}

let noise = null;
function noiseBuffer(ctx) {
  if (noise) return noise;
  noise = ctx.createBuffer(1, ctx.sampleRate * 0.7, ctx.sampleRate);
  const d = noise.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return noise;
}

function kick(ctx, out, t) {
  const o = ctx.createOscillator();
  o.frequency.setValueAtTime(140, t);
  o.frequency.exponentialRampToValueAtTime(40, t + 0.12);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.55, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
  o.connect(g).connect(out);
  o.start(t);
  o.stop(t + 0.17);
}

function burst(ctx, out, t, len, vol, type, freq) {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx);
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + len);
  src.connect(f).connect(g).connect(out);
  src.start(t);
  src.stop(t + len + 0.01);
}

function snare(ctx, out, t) {
  burst(ctx, out, t, 0.14, 0.35, 'bandpass', 1800);
  const o = ctx.createOscillator();
  o.type = 'triangle';
  o.frequency.setValueAtTime(240, t);
  o.frequency.exponentialRampToValueAtTime(140, t + 0.06);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.25, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
  o.connect(g).connect(out);
  o.start(t);
  o.stop(t + 0.09);
}

function hat(ctx, out, t, len, vol = 0.08) {
  burst(ctx, out, t, len, vol, 'highpass', 7000);
}
