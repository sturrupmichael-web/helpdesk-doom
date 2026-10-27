// Sound: every effect synthesized with the Web Audio API (no audio files), in the spirit
// of the 3D game's src/engine/audio.js but crunchier, for guns and doors. Sounds placed in
// the world get quieter with distance and pan left/right from where you're facing.
// Browsers only allow audio after a key press or click, so `init()` runs on the first one.

const MUTE_KEY = 'helpdesk-doom.muted';
const MUSIC_KEY = 'helpdesk-doom.music';

let ctx = null;
let master = null;
let sfxBus = null;
let musicBus = null;
let noiseBuf = null;
let crunch = null; // waveshaper curve for distortion
const store = {
  get(k) {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set(k, v) {
    try {
      localStorage.setItem(k, v);
    } catch {
      // Private window: settings just don't stick.
    }
  },
};
export const settings = { muted: store.get(MUTE_KEY) === '1', music: store.get(MUSIC_KEY) !== '0', sfxVolume: 0.8, musicVolume: 0.5 };
let listener = { x: 0, z: 0, yaw: 0 };

export function init() {
  if (ctx) {
    if (ctx.state === 'suspended') ctx.resume();
    return;
  }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = settings.muted ? 0 : 0.7;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -16;
  comp.ratio.value = 4;
  master.connect(comp).connect(ctx.destination);
  sfxBus = ctx.createGain();
  sfxBus.gain.value = settings.sfxVolume;
  sfxBus.connect(master);
  musicBus = ctx.createGain();
  musicBus.gain.value = settings.music ? settings.musicVolume : 0;
  musicBus.connect(master);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  crunch = new Float32Array(256);
  for (let i = 0; i < 256; i++) {
    const x = (i / 128) - 1;
    crunch[i] = Math.tanh(x * 4);
  }
}

export const audioContext = () => ctx;
export const musicOut = () => musicBus;

export function toggleMute() {
  settings.muted = !settings.muted;
  store.set(MUTE_KEY, settings.muted ? '1' : '0');
  if (master) master.gain.setTargetAtTime(settings.muted ? 0 : 0.7, ctx.currentTime, 0.02);
  return settings.muted;
}
export function toggleMusic() {
  settings.music = !settings.music;
  store.set(MUSIC_KEY, settings.music ? '1' : '0');
  if (musicBus) musicBus.gain.setTargetAtTime(settings.music ? settings.musicVolume : 0, ctx.currentTime, 0.05);
  return settings.music;
}

export function setListener(x, z, yaw) {
  listener = { x, z, yaw };
}

// --- Building blocks ---

function out(vol, pan) {
  const g = ctx.createGain();
  g.gain.value = vol;
  if (pan && ctx.createStereoPanner) {
    const p = ctx.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, pan));
    g.connect(p).connect(sfxBus);
  } else g.connect(sfxBus);
  return g;
}

function tone(dest, type, f0, f1, t, dur, vol, { attack = 0.003, distort = false } = {}) {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  let node = o.connect(g);
  if (distort) {
    const ws = ctx.createWaveShaper();
    ws.curve = crunch;
    node = node.connect(ws);
  }
  node.connect(dest);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function hiss(dest, type, f0, f1, t, dur, vol, { q = 1, attack = 0.002, distort = false } = {}) {
  const s = ctx.createBufferSource();
  s.buffer = noiseBuf;
  s.loop = true;
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.Q.value = q;
  f.frequency.setValueAtTime(f0, t);
  if (f1 !== f0) f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  let node = s.connect(f).connect(g);
  if (distort) {
    const ws = ctx.createWaveShaper();
    ws.curve = crunch;
    node = node.connect(ws);
  }
  node.connect(dest);
  s.start(t, Math.random() * 0.5);
  s.stop(t + dur + 0.02);
}

const R = () => 0.9 + Math.random() * 0.2; // pitch variation

// Each recipe plays one sound into `o` starting at time `t`.
const RECIPES = {
  pistol: (o, t) => {
    hiss(o, 'lowpass', 3500, 400, t, 0.22, 0.9, { distort: true });
    tone(o, 'square', 160 * R(), 50, t, 0.12, 0.5);
  },
  shotgun: (o, t) => {
    hiss(o, 'lowpass', 2500, 180, t, 0.5, 1.1, { distort: true });
    tone(o, 'sawtooth', 110, 35, t, 0.3, 0.7, { distort: true });
    // The pump: two clacks.
    hiss(o, 'bandpass', 2200, 1800, t + 0.45, 0.05, 0.5, { q: 6 });
    hiss(o, 'bandpass', 1600, 1400, t + 0.6, 0.06, 0.5, { q: 6 });
  },
  chaingun: (o, t) => {
    hiss(o, 'lowpass', 3000, 500, t, 0.12, 0.8, { distort: true });
    tone(o, 'square', 190 * R(), 70, t, 0.08, 0.4);
  },
  whip: (o, t) => hiss(o, 'bandpass', 600, 3500, t, 0.18, 0.7, { q: 2 }),
  punch: (o, t) => {
    tone(o, 'sine', 140, 50, t, 0.12, 0.9);
    hiss(o, 'lowpass', 900, 200, t, 0.08, 0.6);
  },
  launch: (o, t) => {
    hiss(o, 'bandpass', 400, 2400, t, 0.4, 0.8, { q: 1.5 });
    tone(o, 'triangle', 300, 900, t, 0.3, 0.3);
  },
  explode: (o, t) => {
    hiss(o, 'lowpass', 1800, 60, t, 1.1, 1.3, { distort: true, attack: 0.005 });
    tone(o, 'sine', 90, 30, t, 0.6, 1.0, { distort: true });
  },
  bfgCharge: (o, t) => {
    tone(o, 'sawtooth', 120, 900, t, 0.6, 0.4, { attack: 0.05 });
    tone(o, 'square', 60, 450, t, 0.6, 0.2, { attack: 0.05 });
  },
  bfgShot: (o, t) => {
    tone(o, 'sawtooth', 900, 60, t, 0.9, 0.6, { distort: true });
    hiss(o, 'lowpass', 4000, 100, t, 1.0, 0.8);
  },
  bfgBoom: (o, t) => {
    // The Windows shutdown chime, distorted and huge.
    [523, 392, 330, 262].forEach((f, i) => tone(o, 'triangle', f, f, t + i * 0.12, 0.5, 0.5, { distort: true }));
    hiss(o, 'lowpass', 1200, 50, t, 1.4, 1.2, { distort: true });
  },
  click: (o, t) => hiss(o, 'bandpass', 3000, 3000, t, 0.03, 0.5, { q: 8 }),
  noAmmo: (o, t) => {
    hiss(o, 'bandpass', 2000, 2000, t, 0.03, 0.5, { q: 8 });
    hiss(o, 'bandpass', 1500, 1500, t + 0.06, 0.03, 0.4, { q: 8 });
  },
  item: (o, t) => {
    tone(o, 'square', 880, 880, t, 0.06, 0.35);
    tone(o, 'square', 1320, 1320, t + 0.06, 0.08, 0.35);
  },
  weaponUp: (o, t) => {
    [440, 554, 659, 880].forEach((f, i) => tone(o, 'square', f, f, t + i * 0.05, 0.1, 0.3));
    hiss(o, 'bandpass', 1800, 1200, t + 0.25, 0.08, 0.5, { q: 4 });
  },
  powerUp: (o, t) => [523, 659, 784, 1047, 1319].forEach((f, i) => tone(o, 'triangle', f, f, t + i * 0.07, 0.25, 0.4)),
  badge: (o, t) => {
    tone(o, 'sine', 1200, 1200, t, 0.08, 0.5);
    tone(o, 'sine', 1800, 1800, t + 0.1, 0.15, 0.5);
  },
  doorOpen: (o, t) => {
    hiss(o, 'lowpass', 500, 900, t, 0.5, 0.6);
    tone(o, 'sawtooth', 60, 80, t, 0.45, 0.25);
  },
  doorClose: (o, t) => {
    hiss(o, 'lowpass', 900, 400, t, 0.45, 0.6);
    tone(o, 'square', 70, 40, t + 0.4, 0.12, 0.6);
  },
  liftStart: (o, t) => {
    tone(o, 'sawtooth', 50, 55, t, 0.9, 0.3);
    hiss(o, 'lowpass', 300, 300, t, 0.9, 0.4);
  },
  liftStop: (o, t) => tone(o, 'square', 80, 40, t, 0.15, 0.6),
  switch: (o, t) => {
    hiss(o, 'bandpass', 2500, 2500, t, 0.04, 0.7, { q: 5 });
    tone(o, 'square', 300, 200, t, 0.08, 0.3);
  },
  secret: (o, t) => [784, 988, 1175, 1568].forEach((f, i) => tone(o, 'sine', f, f, t + i * 0.09, 0.3, 0.35)),
  oof: (o, t) => {
    tone(o, 'sawtooth', 130, 90, t, 0.18, 0.5, { distort: true });
    hiss(o, 'bandpass', 700, 400, t, 0.15, 0.4, { q: 2 });
  },
  pain: (o, t) => {
    tone(o, 'sawtooth', 220 * R(), 110, t, 0.25, 0.6, { distort: true });
    hiss(o, 'bandpass', 900, 500, t, 0.2, 0.5, { q: 2 });
  },
  death: (o, t) => {
    tone(o, 'sawtooth', 260, 50, t, 1.0, 0.7, { distort: true });
    hiss(o, 'lowpass', 1200, 100, t, 0.8, 0.5);
  },
  sizzle: (o, t) => hiss(o, 'highpass', 3000, 5000, t, 0.25, 0.4),
  zap: (o, t) => {
    hiss(o, 'highpass', 2000, 6000, t, 0.12, 0.6, { distort: true });
    tone(o, 'square', 1400 * R(), 300, t, 0.1, 0.25);
  },
  tally: (o, t) => tone(o, 'square', 1500, 1500, t, 0.03, 0.2),
  tallyDone: (o, t) => {
    hiss(o, 'lowpass', 1500, 200, t, 0.3, 0.7, { distort: true });
    tone(o, 'square', 120, 60, t, 0.2, 0.4);
  },
  menu: (o, t) => tone(o, 'square', 600, 600, t, 0.04, 0.25),
  menuOk: (o, t) => {
    hiss(o, 'lowpass', 2000, 300, t, 0.2, 0.7, { distort: true });
    tone(o, 'square', 180, 60, t, 0.12, 0.4);
  },
  // Users (monster) sounds: voiced by `voice` (a pitch), see playVoice.
  thud: (o, t) => {
    tone(o, 'sine', 90, 40, t, 0.2, 0.9);
    hiss(o, 'lowpass', 600, 100, t, 0.15, 0.6);
  },
  spit: (o, t) => {
    hiss(o, 'bandpass', 1200, 2400, t, 0.15, 0.6, { q: 2 });
    tone(o, 'triangle', 500 * R(), 900, t, 0.1, 0.2);
  },
  splat: (o, t) => {
    hiss(o, 'lowpass', 1500, 200, t, 0.25, 0.7);
    tone(o, 'sine', 200, 60, t, 0.15, 0.4);
  },
  mailWhoosh: (o, t) => hiss(o, 'bandpass', 1800, 900, t, 0.25, 0.4, { q: 3 }),
};

// Plays a sound, at a world position (x, z) or right at your ears (no position).
export function play(name, x, z, vol = 1) {
  if (!ctx || settings.muted) return;
  const recipe = RECIPES[name];
  if (!recipe) return;
  let pan = 0;
  if (x !== undefined) {
    const dx = x - listener.x;
    const dz = z - listener.z;
    const d = Math.hypot(dx, dz);
    vol *= Math.max(0, 1 - d / 60) ** 1.5;
    if (vol < 0.02) return;
    // Right of the listener is (cos yaw, -sin yaw).
    if (d > 0.5) pan = ((dx * Math.cos(listener.yaw) - dz * Math.sin(listener.yaw)) / d) * 0.8;
  }
  recipe(out(vol, pan), ctx.currentTime + 0.005);
}

// A user's voice: a short squawk at a pitch, shaped like speech, so each kind of user
// sounds different (sight, pain, death and idle lines all use this).
export function voice(kind, pitch, x, z, vol = 1) {
  if (!ctx || settings.muted) return;
  const dx = x - listener.x;
  const dz = z - listener.z;
  const d = Math.hypot(dx, dz);
  vol *= Math.max(0, 1 - d / 60) ** 1.5;
  if (vol < 0.02) return;
  const pan = d > 0.5 ? ((dx * Math.cos(listener.yaw) - dz * Math.sin(listener.yaw)) / d) * 0.8 : 0;
  const o = out(vol, pan);
  const t = ctx.currentTime + 0.005;
  const p = pitch * R();
  if (kind === 'sight') {
    // "Hey!" / "Excuse me!": two rising syllables.
    tone(o, 'sawtooth', p, p * 1.3, t, 0.14, 0.35, { distort: true });
    tone(o, 'sawtooth', p * 1.2, p * 1.6, t + 0.16, 0.2, 0.35, { distort: true });
    hiss(o, 'bandpass', p * 4, p * 6, t, 0.32, 0.25, { q: 3 });
  } else if (kind === 'pain') {
    tone(o, 'sawtooth', p * 1.5, p * 0.8, t, 0.16, 0.45, { distort: true });
  } else if (kind === 'death') {
    tone(o, 'sawtooth', p * 1.3, p * 0.3, t, 0.7, 0.5, { distort: true });
    hiss(o, 'lowpass', 2000, 100, t, 0.6, 0.4);
  } else if (kind === 'idle') {
    tone(o, 'triangle', p, p * 0.9, t, 0.12, 0.2);
    tone(o, 'triangle', p * 1.1, p, t + 0.15, 0.12, 0.2);
  } else if (kind === 'attack') {
    tone(o, 'square', p * 0.8, p * 1.4, t, 0.12, 0.3, { distort: true });
  }
}
