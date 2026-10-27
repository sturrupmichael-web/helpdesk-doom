// The menus: title, difficulty, options, controls and pause, DOOM-style: big pixel text,
// a blinking coffee mug as the cursor, arrows or the mouse to choose, Enter/Space/click to
// pick, Esc/Backspace to go back. Options are remembered in localStorage.
//
// Menus are data: each is a title and a list of items. An item either opens another menu
// (`to`), sends an action to main.js (`action`), or is a setting changed with Left/Right
// or a click (`value` + `change`).

import { drawText, textWidth } from './font.js';
import { iconCanvas } from './sprites.js';
import { PALETTE as P } from '../shared/data/palette.js';
import { SKILLS } from '../data/enemies.js';
import { settings as sound, play } from './audio.js';

const RED = '#d8484e';
const OPTIONS_KEY = 'helpdesk-doom.options';

export const options = { sensitivity: 1, invertY: false, alwaysRun: true, detail: 'medium', fps: false };
try {
  Object.assign(options, JSON.parse(localStorage.getItem(OPTIONS_KEY) ?? '{}'));
} catch {
  // No storage (private window): defaults it is.
}
function saveOptions() {
  try {
    localStorage.setItem(OPTIONS_KEY, JSON.stringify(options));
  } catch {
    // Settings just won't stick.
  }
}

const onOff = (v) => (v ? 'ON' : 'OFF');
const DETAILS = ['low', 'medium', 'high'];

// `hooks` are main.js's: toggleSound, toggleMusic, applyOptions.
function menus(hooks) {
  const optionItems = [
    { label: 'SOUND', value: () => onOff(!sound.muted), change: () => hooks.toggleSound() },
    { label: 'MUSIC', value: () => onOff(sound.music), change: () => hooks.toggleMusic() },
    {
      label: 'MOUSE SPEED',
      value: () => options.sensitivity.toFixed(2).replace(/0$/, ''),
      change: (d) => (options.sensitivity = Math.max(0.25, Math.min(3, Math.round((options.sensitivity + d * 0.25) * 4) / 4))),
    },
    { label: 'INVERT MOUSE', value: () => onOff(options.invertY), change: () => (options.invertY = !options.invertY) },
    { label: 'ALWAYS RUN', value: () => onOff(options.alwaysRun), change: () => (options.alwaysRun = !options.alwaysRun) },
    {
      label: 'DETAIL',
      value: () => options.detail.toUpperCase(),
      change: (d) => (options.detail = DETAILS[(DETAILS.indexOf(options.detail) + d + 3) % 3]),
    },
    { label: 'FPS COUNTER', value: () => onOff(options.fps), change: () => (options.fps = !options.fps) },
    { label: 'BACK', back: true },
  ];
  return {
    title: {
      items: [
        { label: 'NEW SHIFT', to: 'skill' },
        { label: 'OPTIONS', to: 'options' },
        { label: 'CONTROLS', to: 'controls' },
        ...(location.pathname.includes('/doom') ? [{ label: 'BACK TO THE 3D GAME', action: 'leave' }] : []),
      ],
    },
    skill: {
      title: 'CHOOSE YOUR SHIFT',
      cursor: 2,
      items: SKILLS.map((s, i) => ({ label: s.name.toUpperCase(), action: `start:${i + 1}`, hint: s.hint })),
    },
    options: { title: 'OPTIONS', items: optionItems, small: true },
    controls: {
      title: 'CONTROLS',
      text: [
        'MOUSE  LOOK AND TURN       CLICK  FIRE',
        'WASD  MOVE        SHIFT  WALK (OR RUN)',
        'SPACE / E / RIGHT CLICK  USE: DOORS, LIFTS',
        '1-6 / WHEEL / [ ]  SWITCH TOOLS',
        'TAB  MAP   - =  ZOOM   M  MUSIC   N  SOUND',
        'ESC  PAUSE                ARROWS  TURN',
        'GAMEPAD: STICKS, RT FIRE, A USE, START PAUSE',
      ],
      items: [{ label: 'BACK', back: true }],
    },
    pause: {
      title: 'PAUSED',
      items: [
        { label: 'RESUME', action: 'resume' },
        { label: 'OPTIONS', to: 'options' },
        { label: 'CONTROLS', to: 'controls' },
        { label: 'RESTART SHIFT', action: 'restart' },
        { label: 'QUIT TO TITLE', action: 'quit' },
      ],
    },
  };
}

export class Menus {
  constructor(hooks) {
    this.hooks = hooks;
    this.defs = menus(hooks);
    this.stack = [];
    this.cursors = {};
    this.rects = [];
    this.t = 0;
    this.mug = iconCanvas('mug');
  }

  get open() {
    return this.stack.length > 0;
  }
  get current() {
    return this.stack[this.stack.length - 1];
  }

  show(id) {
    this.stack = [id];
    this.cursors[id] = this.defs[id].cursor ?? 0;
  }
  push(id) {
    this.stack.push(id);
    this.cursors[id] = this.defs[id].cursor ?? 0;
    play('menu');
  }
  close() {
    this.stack = [];
  }
  back() {
    if (this.stack.length > 1) {
      this.stack.pop();
      play('menu');
      return null;
    }
    // Esc on the pause menu resumes; on the title it does nothing.
    return this.current === 'pause' ? 'resume' : null;
  }

  // Keyboard and gamepad. Returns an action for main.js, or null.
  handle(presses) {
    if (!this.open) return null;
    const id = this.current;
    const def = this.defs[id];
    const n = def.items.length;
    for (const a of presses) {
      if (a === 'up' || a === 'down') {
        this.cursors[id] = (this.cursors[id] + (a === 'up' ? -1 : 1) + n) % n;
        play('menu');
      } else if (a === 'leftMenu' || a === 'rightMenu') {
        const item = def.items[this.cursors[id]];
        if (item.change) this.changed(item, a === 'leftMenu' ? -1 : 1);
      } else if (a === 'use' || a === 'confirm') {
        return this.pick(def.items[this.cursors[id]]);
      } else if (a === 'back' || a === 'pause') {
        return this.back();
      }
    }
    return null;
  }

  changed(item, d) {
    item.change(d);
    saveOptions();
    this.hooks.applyOptions();
    play('menu');
  }

  pick(item) {
    if (item.back) return this.back();
    if (item.to) {
      this.push(item.to);
      return null;
    }
    if (item.change) {
      this.changed(item, 1);
      return null;
    }
    play('menuOk');
    return item.action ?? null;
  }

  // Mouse, in HUD canvas pixels.
  hover(x, y) {
    const hit = this.rects.find((r) => y >= r.y0 && y < r.y1 && x >= r.x0 && x < r.x1);
    if (hit && this.cursors[this.current] !== hit.i) this.cursors[this.current] = hit.i;
  }
  click(x, y) {
    if (!this.open) return null;
    const hit = this.rects.find((r) => y >= r.y0 && y < r.y1 && x >= r.x0 && x < r.x1);
    if (!hit) return null;
    this.cursors[this.current] = hit.i;
    const item = this.defs[this.current].items[hit.i];
    // Clicking a setting's left half turns it down, the right half up.
    if (item.change) {
      this.changed(item, x < (hit.x0 + hit.x1) / 2 && item.label === 'MOUSE SPEED' ? -1 : 1);
      return null;
    }
    return this.pick(item);
  }

  // Once the screen is touched, the controls page lists the touch controls.
  useTouchControls() {
    this.defs.controls.text = [
      'LEFT HALF: DRAG TO MOVE (A STICK APPEARS)',
      'RIGHT HALF: DRAG TO LOOK AND TURN',
      'FIRE: HOLD TO FIRE, DRAG IT TO AIM',
      'USE: DOORS, LIFTS AND THE EXIT SWITCH',
      'TOOL: NEXT TOOL     MAP: THE AUTOMAP',
      'II: PAUSE    PLAY IT HELD SIDEWAYS',
    ];
  }

  draw(ctx, w, h, dt) {
    if (!this.open) return;
    this.t += dt;
    const id = this.current;
    const def = this.defs[id];
    const cx = Math.floor(w / 2);
    this.rects = [];
    let y;
    if (id === 'title') {
      drawLogo(ctx, cx, 18, this.t);
      y = 112;
    } else {
      ctx.fillStyle = 'rgba(26,28,44,0.72)';
      ctx.fillRect(0, 0, w, h);
      drawText(ctx, def.title, cx, 14, P.y, 2, 'center', P.k);
      y = def.text ? 40 : 46;
    }
    if (def.text) {
      def.text.forEach((line, i) => drawText(ctx, line, cx, y + i * 12, P.w, 1, 'center', P.k));
      y += def.text.length * 12 + 12;
    }
    // Big text, unless an item wouldn't fit across the screen.
    const fits = def.items.every((it) => textWidth(it.label, 2) <= w - 48);
    const scale = def.small || !fits ? 1 : 2;
    const step = scale === 1 ? 13 : 19;
    def.items.forEach((item, i) => {
      const sel = this.cursors[id] === i;
      let label = item.label;
      if (item.value) label = `${label}: ${item.value()}`;
      const color = sel ? P.w : RED;
      const half = Math.floor((label.length * 6 * scale) / 2);
      drawText(ctx, label, cx, y, color, scale, 'center', P.k);
      this.rects.push({ i, x0: cx - half - 20, x1: cx + half + 20, y0: y - 3, y1: y + step - 3 });
      // The cursor: a coffee mug, blinking like DOOM's skull.
      if (sel && Math.floor(this.t * 3) % 2 === 0) {
        const s = scale === 2 ? 1 : 0.75;
        ctx.drawImage(this.mug, cx - half - 18 * s - 4, y - 2 * s, 16 * s, 16 * s);
      }
      y += step;
    });
    const sel = def.items[this.cursors[id]];
    if (sel?.hint) drawText(ctx, sel.hint.toUpperCase(), cx, y + 4, P.g, 1, 'center', P.k);
    if (id === 'title') drawText(ctx, 'NO TICKETS WERE HARMED IN THE MAKING OF THIS GAME.', cx, h - 10, P.G, 1, 'center', P.k);
  }
}

// HELPDESK SURVIVORS over a big, two-tone DOOM MODE (red, with a yellow top edge, the
// way DOOM's logo catches the light), breathing slightly.
function drawLogo(ctx, cx, y, t) {
  drawText(ctx, 'HELPDESK SURVIVORS', cx, y, P.w, 2, 'center', P.k);
  const scale = 5;
  const top = y + 24 + Math.round(Math.sin(t * 2) * 1.5);
  drawText(ctx, 'DOOM MODE', cx + 3, top + 3, P.k, scale, 'center');
  drawText(ctx, 'DOOM MODE', cx, top, P.r, scale, 'center');
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, top, cx * 2, 2 * scale);
  ctx.clip();
  drawText(ctx, 'DOOM MODE', cx, top, P.y, scale, 'center');
  ctx.restore();
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, top + 2 * scale, cx * 2, scale);
  ctx.clip();
  drawText(ctx, 'DOOM MODE', cx, top, P.o, scale, 'center');
  ctx.restore();
}
