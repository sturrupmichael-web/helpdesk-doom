// Touch controls for phones and tablets, shown over the game while playing once the screen
// has been touched. Drag anywhere on the left half to move (a stick appears under your
// thumb), drag on the right half to look, and hold FIRE (you can look while holding it).
// USE opens doors and presses switches, TOOL cycles tools, and MAP and II (pause) sit in the
// top corner. Menus, the tally and the ending are tapped directly on the game's canvas.
//
// It's HTML over the canvases, not drawn on the HUD, so the buttons stay sharp and big
// enough for a thumb at any screen size. Everything feeds the same Input as the keyboard.

import { device } from './input.js';

const STICK_RADIUS = 56; // CSS pixels of thumb travel for full speed
const STICK_DEADZONE = 0.12;
const LOOK_GAIN = 2.4; // touch pixels count for this many mouse pixels

const BUTTONS = [
  { id: 'fire', label: 'FIRE', hold: true, look: true },
  { id: 'use', label: 'USE', press: 'use' },
  { id: 'tool', label: 'TOOL', press: 'nextWeapon' },
  { id: 'map', label: 'MAP', press: 'map' },
  { id: 'pause', label: 'II', press: 'pause', aria: 'Pause' },
];

const CSS = `
#touch { position: fixed; inset: 0 0 16% 0; z-index: 2; display: none; touch-action: none; user-select: none; -webkit-user-select: none; -webkit-touch-callout: none; font: bold 14px ui-monospace, Menlo, monospace; }
body.touch-play #touch { display: block; }
#touch .stick { position: absolute; width: ${STICK_RADIUS * 2}px; height: ${STICK_RADIUS * 2}px; margin: -${STICK_RADIUS}px 0 0 -${STICK_RADIUS}px; border-radius: 50%; border: 2px solid rgba(244,244,244,0.35); background: rgba(26,28,44,0.25); pointer-events: none; display: none; }
#touch .stick.on { display: block; }
#touch .knob { position: absolute; left: 50%; top: 50%; width: 44px; height: 44px; margin: -22px 0 0 -22px; border-radius: 50%; background: rgba(244,244,244,0.45); }
#touch .hint { position: absolute; left: max(16px, env(safe-area-inset-left)); bottom: 12px; color: rgba(244,244,244,0.4); font-size: 11px; letter-spacing: 0.08em; pointer-events: none; }
#touch button { position: absolute; display: grid; place-items: center; padding: 0; color: #f4f4f4; background: rgba(26,28,44,0.45); border: 2px solid rgba(244,244,244,0.4); border-radius: 14px; font: inherit; letter-spacing: 0.06em; touch-action: none; -webkit-tap-highlight-color: transparent; }
#touch button.down { background: rgba(244,244,244,0.35); color: #1a1c2c; }
#touch [data-id=fire] { right: max(18px, env(safe-area-inset-right)); bottom: 14px; width: 92px; height: 92px; border-radius: 50%; border-color: rgba(216,72,78,0.8); background: rgba(177,62,83,0.4); font-size: 16px; }
#touch [data-id=use] { right: calc(max(18px, env(safe-area-inset-right)) + 104px); bottom: 14px; width: 64px; height: 64px; border-radius: 50%; }
#touch [data-id=tool] { right: max(28px, calc(env(safe-area-inset-right) + 10px)); bottom: 118px; width: 72px; height: 40px; }
#touch [data-id=map] { right: calc(max(16px, env(safe-area-inset-right)) + 60px); top: max(10px, env(safe-area-inset-top)); width: 52px; height: 40px; }
#touch [data-id=pause] { right: max(16px, env(safe-area-inset-right)); top: max(10px, env(safe-area-inset-top)); width: 44px; height: 40px; }
#rotate { position: fixed; inset: 0; z-index: 3; display: none; place-items: center; align-content: center; gap: 14px; padding: 24px; background: #1a1c2c; color: #f4f4f4; font: bold 16px ui-monospace, Menlo, monospace; text-align: center; letter-spacing: 0.06em; }
#rotate .phone { width: 34px; height: 58px; border: 3px solid #ffcd75; border-radius: 7px; animation: turn 2.4s ease-in-out infinite; }
@keyframes turn { 0%, 30% { transform: rotate(0deg); } 60%, 100% { transform: rotate(-90deg); } }
@media (orientation: portrait) { body.touch #rotate { display: grid; } }
`;

export class Touch {
  constructor(input) {
    this.input = input;
    this.stickId = null;
    this.stickOrigin = null;
    this.looks = new Map(); // pointerId -> last [x, y]
    this.playing = false;

    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.append(style);

    this.root = document.createElement('div');
    this.root.id = 'touch';
    this.stick = el('div', 'stick');
    this.knob = el('div', 'knob');
    this.stick.append(this.knob);
    const hint = el('div', 'hint');
    hint.textContent = 'DRAG LEFT: MOVE · DRAG RIGHT: LOOK';
    this.root.append(this.stick, hint);
    this.buttons = {};
    for (const b of BUTTONS) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.dataset.id = b.id;
      btn.textContent = b.label;
      btn.setAttribute('aria-label', b.aria ?? b.label);
      this.buttons[b.id] = btn;
      this.root.append(btn);
    }
    const rotate = el('div');
    rotate.id = 'rotate';
    rotate.innerHTML = '<div class="phone"></div><div>TURN YOUR PHONE SIDEWAYS</div>';
    document.body.append(this.root, rotate);

    // The first touch anywhere switches to touch controls (and a mouse click doesn't
    // switch back: a laptop with a touch screen keeps them until reload).
    addEventListener('pointerdown', (e) => e.pointerType === 'touch' && this.enable(), { capture: true });
    this.root.addEventListener('pointerdown', (e) => this.down(e));
    this.root.addEventListener('pointermove', (e) => this.move(e));
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) this.root.addEventListener(type, (e) => this.up(e));
    this.root.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  enable() {
    if (this.input.touch) return;
    this.input.touch = true;
    device.touch = true;
    document.body.classList.add('touch');
    this.onEnable?.();
  }

  // Called every frame: the controls show only while actually playing.
  update(playing) {
    playing = playing && this.input.touch;
    if (playing === this.playing) return;
    this.playing = playing;
    document.body.classList.toggle('touch-play', playing);
    if (!playing) this.reset();
  }

  get portrait() {
    return this.input.touch && innerHeight > innerWidth;
  }

  reset() {
    this.stickId = null;
    this.stick.classList.remove('on');
    this.looks.clear();
    this.input.touchMove.x = this.input.touchMove.y = 0;
    this.input.touchFire = false;
    for (const b of Object.values(this.buttons)) b.classList.remove('down');
  }

  down(e) {
    e.preventDefault();
    try {
      this.root.setPointerCapture(e.pointerId);
    } catch {
      // Not a live pointer (a synthetic event): moves still reach the controls.
    }
    const id = e.target.closest?.('button')?.dataset.id;
    const def = BUTTONS.find((b) => b.id === id);
    if (def) {
      this.buttons[id].classList.add('down');
      if (def.press) this.input.queue.push(def.press);
      if (def.hold) this.input.touchFire = true;
      if (def.look) this.looks.set(e.pointerId, { x: e.clientX, y: e.clientY, button: id });
      else this.looks.set(e.pointerId, { button: id });
      return;
    }
    if (e.clientX < innerWidth / 2 && this.stickId === null) {
      this.stickId = e.pointerId;
      this.stickOrigin = [e.clientX, e.clientY];
      this.stick.style.left = `${e.clientX}px`;
      this.stick.style.top = `${e.clientY}px`;
      this.stick.classList.add('on');
      this.knob.style.transform = '';
    } else {
      this.looks.set(e.pointerId, { x: e.clientX, y: e.clientY });
    }
  }

  move(e) {
    if (e.pointerId === this.stickId) {
      let dx = e.clientX - this.stickOrigin[0];
      let dy = e.clientY - this.stickOrigin[1];
      const len = Math.hypot(dx, dy);
      if (len > STICK_RADIUS) {
        dx *= STICK_RADIUS / len;
        dy *= STICK_RADIUS / len;
      }
      this.knob.style.transform = `translate(${dx}px, ${dy}px)`;
      const mag = Math.min(1, len / STICK_RADIUS);
      const k = mag < STICK_DEADZONE ? 0 : (mag - STICK_DEADZONE) / (1 - STICK_DEADZONE) / Math.max(mag, 1e-6);
      this.input.touchMove.x = (dx / STICK_RADIUS) * k;
      this.input.touchMove.y = (dy / STICK_RADIUS) * k;
      return;
    }
    const look = this.looks.get(e.pointerId);
    if (!look || look.x === undefined) return;
    this.input.mouseX += (e.clientX - look.x) * LOOK_GAIN;
    this.input.mouseY += (e.clientY - look.y) * LOOK_GAIN;
    look.x = e.clientX;
    look.y = e.clientY;
  }

  up(e) {
    if (e.pointerId === this.stickId) {
      this.stickId = null;
      this.stick.classList.remove('on');
      this.input.touchMove.x = this.input.touchMove.y = 0;
      return;
    }
    const look = this.looks.get(e.pointerId);
    if (!look) return;
    this.looks.delete(e.pointerId);
    if (look.button) {
      this.buttons[look.button].classList.remove('down');
      if (look.button === 'fire') this.input.touchFire = false;
    }
  }
}

function el(tag, cls) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  return n;
}
