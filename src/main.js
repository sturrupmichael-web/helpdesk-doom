// Helpdesk Survivors: Doom Mode. Boots the game and runs its screens: the title (with the
// level slowly turning behind it), play, pause, the automap, the tally after each level,
// burning out, and the episode's ending. Everything runs on the fixed-timestep loop shared with the 3D game
// (src/engine/loop.js).

import { startLoop, STEP } from '../shared/src/engine/loop.js';
import { Level, loadLevelData } from './level.js';
import { Renderer, LightEffects, DETAIL } from './renderer.js';
import { Input } from './input.js';
import { Touch } from './touch.js';
import { Hud, BAR_H } from './hud.js';
import { Game } from './game.js';
import { Tally, Ending, drawDeath } from './screens.js';
import { EPISODE } from '../data/episode.js';
import { Menus, options } from './menus.js';
import { Automap } from './automap.js';
import { startMusic } from './music.js';
import * as audio from './audio.js';

const view = document.getElementById('view');
const hudCanvas = document.getElementById('hud');
const renderer = new Renderer(view);
const input = new Input(hudCanvas);
const touch = new Touch(input);
const hud = new Hud(hudCanvas);
const lights = new LightEffects();

// The episode's maps, or just the one in ?map=file.json when trying out a map.
const custom = new URLSearchParams(location.search).get('map');
const maps = custom ? [await loadLevelData('custom', custom)] : await Promise.all(EPISODE.maps.map((m) => loadLevelData(m)));
let mapIndex = 0;
let carryIn = null; // what you walked into this level with (restarts start from it)
let level;
let game;
let automap;
let mode = 'title'; // title | play | paused | tally | ending
let tally = null;
let ending = null;
let exitT = 0;
let deadT = 0;
let clicked = false;
let mapOpen = false;
let skill = 3;

const menus = new Menus({
  toggleSound: () => audio.toggleMute(),
  toggleMusic: () => audio.toggleMusic(),
  applyOptions,
});
touch.onEnable = () => menus.useTouchControls();

function applyOptions() {
  input.sensitivity = options.sensitivity;
  input.invertY = options.invertY;
  input.alwaysRun = options.alwaysRun;
  hud.showFps = options.fps;
  if (renderer.lines !== DETAIL[options.detail]) renderer.setDetail(DETAIL[options.detail] ?? DETAIL.medium);
}
applyOptions();

// Builds a level from scratch: a new shift, the next level, a restart, or the title's
// backdrop.
function newGame(s, index = 0, carry = null) {
  for (const scene of [renderer.scene, renderer.viewScene]) {
    scene.traverse((o) => o.geometry?.dispose());
    scene.clear();
  }
  hud.messages = [];
  level = new Level(maps[index]);
  game = new Game({ level, renderer, hud, skill: s, carry });
  automap = new Automap(level);
  tally = null;
  exitT = 0;
  deadT = 0;
  mapOpen = false;
}

// The title: the bullpen, slowly turning, behind the menu.
function toTitle() {
  newGame(3);
  if (!custom) {
    game.player.x = 21;
    game.player.z = 50;
    game.player.feet = level.floorAt(21, 50);
  }
  mode = 'title';
  renderer.setBar(false);
  menus.show('title');
  input.unlock();
}

function startShift(s) {
  skill = s;
  if (input.touch) fullscreen();
  playLevel(0, null);
}

function playLevel(index, carry) {
  mapIndex = index;
  carryIn = carry;
  newGame(skill, index, carry);
  mode = 'play';
  renderer.setBar(true);
  menus.close();
  hud.message(`${level.name}`);
  input.lock();
}

// On a phone, play in fullscreen, held sideways, where the browser allows it (not
// iPhone Safari). It needs a tap, so it's asked for when a shift starts.
function fullscreen() {
  const el = document.documentElement;
  if (document.fullscreenElement || !el.requestFullscreen) return;
  el.requestFullscreen({ navigationUI: 'hide' })
    .then(() => screen.orientation?.lock?.('landscape'))
    .catch(() => {});
}

function pause() {
  if (mode !== 'play') return;
  mode = 'paused';
  menus.show('pause');
  input.unlock();
}

function resume() {
  mode = 'play';
  menus.close();
  input.lock();
}

function act(action) {
  if (!action) return;
  if (action.startsWith('start:')) startShift(Number(action.slice(6)));
  else if (action === 'resume') resume();
  else if (action === 'restart') playLevel(mapIndex, carryIn);
  else if (action === 'quit') toTitle();
  else if (action === 'leave') location.href = '../';
}

// Mouse on the menus (HUD canvas pixels; the canvas is stretched over the window).
const toHud = (e) => {
  const r = hudCanvas.getBoundingClientRect();
  return [((e.clientX - r.left) / r.width) * hud.w, ((e.clientY - r.top) / r.height) * hud.h];
};
hudCanvas.addEventListener('mousemove', (e) => {
  if (menus.open) menus.hover(...toHud(e));
});
hudCanvas.addEventListener('click', (e) => {
  audio.init();
  startMusic();
  if (menus.open) return act(menus.click(...toHud(e)));
  if (input.locked || mode !== 'play' || game.player.dead) clicked = true;
  input.lock();
});
addEventListener('keydown', () => {
  audio.init();
  startMusic();
});

function cheats(presses) {
  for (const a of presses) {
    if (a === 'cheat:iddqd') {
      game.god = !game.god;
      hud.message(game.god ? 'Degreelessness mode on' : 'Degreelessness mode off');
    }
    if (a === 'cheat:idkfa') {
      for (const id of ['replyAll', 'powershell', 'reimage', 'reboot']) game.arsenal.owned.add(id);
      for (const k of Object.keys(game.arsenal.ammo)) game.arsenal.ammo[k] = game.arsenal.max[k];
      for (const k of ['blue', 'yellow', 'red']) game.player.keys.add(k);
      game.player.armor = 200;
      game.player.armorClass = 2;
      hud.message('Very happy ammo added (and every badge)');
    }
    if (a.startsWith('cheat:idclev:')) {
      const n = Number(a.slice(-1)) - 1;
      if (a.slice(-2, -1) === '1' && maps[n]) playLevel(n, game.carry());
      else hud.message('No such level');
    }
  }
}

function update(dt) {
  input.pollGamepad();
  const presses = input.presses();
  const click = clicked;
  clicked = false;
  for (const a of presses) {
    if (a === 'mute') hud.message(audio.toggleMute() ? 'Sound off' : 'Sound on');
    if (a === 'music') hud.message(audio.toggleMusic() ? 'Music on' : 'Music off');
  }

  if (mode === 'title' || mode === 'paused') {
    act(menus.handle(presses));
    return;
  }
  if (mode === 'tally') {
    tally.update(dt);
    if ((presses.includes('use') || presses.includes('confirm') || click) && tally.press()) {
      if (maps[mapIndex + 1]) playLevel(mapIndex + 1, game.carry());
      else {
        mode = 'ending';
        ending = new Ending(`Episode 1: ${EPISODE.name}`, EPISODE.ending);
      }
    }
    return;
  }
  if (mode === 'ending') {
    ending.update(dt);
    if ((presses.includes('use') || presses.includes('confirm') || click) && ending.press()) toTitle();
    return;
  }

  // Playing. Turning a phone upright pauses (the game can't be played that way).
  if (touch.portrait && !game.player.dead) return pause();
  if (presses.includes('pause') || (presses.includes('unlocked') && !input.touch && !game.player.dead)) return pause();
  cheats(presses);
  for (const a of presses) {
    if (a === 'map') mapOpen = !mapOpen;
    if (a === 'zoomIn' && mapOpen) automap.zoomBy(1.25);
    if (a === 'zoomOut' && mapOpen) automap.zoomBy(0.8);
  }
  if (game.player.dead) {
    deadT += dt;
    if (deadT > 1 && (presses.includes('use') || click)) return playLevel(mapIndex, carryIn);
  }
  game.update(dt, input, game.player.dead ? presses.filter((a) => a !== 'use') : presses);
  automap.update(dt, game.player);
  // The exit switch: a moment to hear it click, then the tally.
  if (game.exited) {
    exitT += dt;
    if (exitT > 0.8) {
      mode = 'tally';
      tally = new Tally(game, maps[mapIndex + 1]?.name);
      input.unlock();
    }
  }
}

function render(dt) {
  const ctx = hud.ctx;
  touch.update(mode === 'play' && input.locked && !game.player.dead && !game.exited);
  if (mode === 'title') {
    // Slowly look around the office.
    game.player.yaw += dt * 0.12;
    game.player.pitch = 0.05;
    game.render(dt, lights.update(dt));
    renderer.render();
    ctx.clearRect(0, 0, hud.w, hud.h);
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(0, 0, hud.w, hud.h);
    menus.draw(ctx, hud.w, hud.h, dt);
    return;
  }
  if (mode === 'tally' || mode === 'ending') {
    input.takeMouse();
    renderer.render();
    ctx.clearRect(0, 0, hud.w, hud.h);
    (mode === 'tally' ? tally : ending).draw(ctx, hud.w, hud.h);
    return;
  }
  if (mode === 'play' && !game.player.dead) game.player.look(input.takeMouse());
  else input.takeMouse();
  game.render(mode === 'play' ? dt : 0, lights.update(mode === 'play' ? dt : 0));
  renderer.render();
  hud.draw(mode === 'play' ? dt : 0, game, mapOpen ? (c) => automap.draw(c, hud.w, hud.h - BAR_H, game) : null);
  if (mode === 'paused') menus.draw(ctx, hud.w, hud.h - BAR_H, dt);
  else if (game.player.dead) drawDeath(ctx, hud.w, hud.h, deadT, hud.h - BAR_H);
  else if (!input.locked) hud.banner([input.touch ? 'TAP TO PLAY' : 'CLICK TO PLAY'], { scale: 2, color: '#f4f4f4' });
}

toTitle();
document.getElementById('boot')?.remove();

// For tests and the console: `doom.tick(n)` runs n fixed steps and draws one frame
// (headless browsers don't always run animation frames on their own).
window.doom = {
  get level() {
    return level;
  },
  get game() {
    return game;
  },
  get mode() {
    return mode;
  },
  get tally() {
    return tally;
  },
  get mapIndex() {
    return mapIndex;
  },
  maps,
  playLevel,
  menus,
  renderer,
  input,
  touch,
  hud,
  start: startShift,
  pause,
  toggleMap: () => (mapOpen = !mapOpen),
  tick(n = 1) {
    for (let i = 0; i < n; i++) update(STEP);
    render(STEP);
  },
};
startLoop(update, render);
