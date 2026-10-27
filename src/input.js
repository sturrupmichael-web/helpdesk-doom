// Keyboard, mouse (pointer lock) and gamepad, read as "actions" so the rest of the game
// never deals with key codes. Movement and turning are polled every tick; one-off presses
// (Use, weapon keys, Pause...) are queued and drained with `presses()`.

const BINDS = {
  forward: ['KeyW', 'ArrowUp'],
  back: ['KeyS', 'ArrowDown'],
  left: ['KeyA'],
  right: ['KeyD'],
  turnLeft: ['ArrowLeft', 'KeyQ'],
  turnRight: ['ArrowRight'],
  run: ['ShiftLeft', 'ShiftRight'],
  fire: ['ControlLeft', 'ControlRight', 'KeyF'],
  strafe: ['AltLeft', 'AltRight'],
};

// One-off actions from keys.
const PRESS = {
  Space: 'use',
  KeyE: 'use',
  Escape: 'pause',
  KeyP: 'pause',
  Tab: 'map',
  KeyM: 'music',
  KeyN: 'mute',
  Enter: 'confirm',
  Backspace: 'back',
  Minus: 'zoomOut',
  Equal: 'zoomIn',
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'leftMenu',
  ArrowRight: 'rightMenu',
  BracketLeft: 'prevWeapon',
  BracketRight: 'nextWeapon',
  Digit1: 'weapon1',
  Digit2: 'weapon2',
  Digit3: 'weapon3',
  Digit4: 'weapon4',
  Digit5: 'weapon5',
  Digit6: 'weapon6',
  Digit7: 'weapon7',
};

// DOOM's cheat codes, typed during play: invulnerability, and every tool, full ammo,
// full armor and all three badges. (idclev, for warping to a level, is below.)
const CHEATS = ['iddqd', 'idkfa'];

// Gamepad (standard mapping): buttons that press actions.
const PAD_PRESS = { 0: 'use', 1: 'back', 2: 'map', 3: 'nextWeapon', 4: 'prevWeapon', 5: 'nextWeapon', 9: 'pause', 12: 'up', 13: 'down', 14: 'leftMenu', 15: 'rightMenu' };
const DEADZONE = 0.18;

export class Input {
  constructor(surface) {
    this.surface = surface;
    this.down = new Set();
    this.queue = [];
    this.mouseX = 0;
    this.mouseY = 0;
    this.mouseFire = false;
    this.locked = false;
    this.sensitivity = 1;
    this.invertY = false;
    this.alwaysRun = true; // Shift walks
    this.pad = { lx: 0, ly: 0, rx: 0, ry: 0, fire: false, run: false, prev: [] };
    this.padConnected = false;
    this.lastKey = null; // for "press any key"
    this.typed = '';

    addEventListener('keydown', (e) => {
      if (e.code === 'Tab' || e.code === 'Space' || e.code.startsWith('Arrow') || (e.code === 'Backspace' && e.target === document.body)) e.preventDefault();
      if (e.ctrlKey && e.code === 'KeyW') e.preventDefault(); // Ctrl+W is fire+forward, not "close tab"
      this.down.add(e.code);
      if (!e.repeat) {
        this.lastKey = e.code;
        const a = PRESS[e.code];
        if (a) this.queue.push(a);
        this.queue.push('anyKey');
        if (e.code.startsWith('Key') || e.code.startsWith('Digit')) {
          this.typed = (this.typed + e.code.replace(/^(Key|Digit)/, '').toLowerCase()).slice(-8);
          for (const c of CHEATS) {
            if (this.typed.endsWith(c)) {
              this.queue.push(`cheat:${c}`);
              this.typed = '';
            }
          }
          // idclev + episode and map digits: warp to a level (idclev12 is E1M2).
          const warp = this.typed.match(/idclev(\d)(\d)$/);
          if (warp) {
            this.queue.push(`cheat:idclev:${warp[1]}${warp[2]}`);
            this.typed = '';
          }
        }
      }
    });
    addEventListener('keyup', (e) => this.down.delete(e.code));
    addEventListener('blur', () => {
      this.down.clear();
      this.mouseFire = false;
    });
    surface.addEventListener('mousedown', (e) => {
      if (!this.locked) return;
      if (e.button === 0) this.mouseFire = true;
      if (e.button === 2) this.queue.push('use');
      if (e.button === 1) this.queue.push('nextWeapon');
    });
    addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouseFire = false;
    });
    surface.addEventListener('contextmenu', (e) => e.preventDefault());
    addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      // Some browsers report a huge jump right after locking; ignore those.
      if (Math.abs(e.movementX) > 400 || Math.abs(e.movementY) > 400) return;
      this.mouseX += e.movementX;
      this.mouseY += e.movementY;
    });
    surface.addEventListener('wheel', (e) => {
      if (!this.locked) return;
      e.preventDefault();
      this.queue.push(e.deltaY > 0 ? 'nextWeapon' : 'prevWeapon');
    }, { passive: false });
    document.addEventListener('pointerlockchange', () => {
      const was = this.locked;
      this.locked = document.pointerLockElement === surface;
      if (was && !this.locked) {
        this.mouseFire = false;
        this.queue.push('unlocked');
      }
    });
  }

  lock() {
    if (this.locked || !this.surface.requestPointerLock) return;
    try {
      const p = this.surface.requestPointerLock();
      if (p?.catch) p.catch(() => {});
    } catch {
      // No pointer lock here (some embedded pages): arrows and Q still turn.
    }
  }
  unlock() {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  held(action) {
    for (const code of BINDS[action]) if (this.down.has(code)) return true;
    return false;
  }

  // Drains the queue of one-off actions since the last call.
  presses() {
    const q = this.queue;
    this.queue = [];
    return q;
  }

  // Mouse movement since the last call, in pixels.
  takeMouse() {
    const m = { x: this.mouseX * this.sensitivity, y: this.mouseY * this.sensitivity * (this.invertY ? -1 : 1) };
    this.mouseX = this.mouseY = 0;
    return m;
  }

  // Everything the player needs for one tick: move (-1..1 forward, right), turn (-1..1),
  // look (-1..1 from a stick), run, fire.
  state() {
    let forward = (this.held('forward') ? 1 : 0) - (this.held('back') ? 1 : 0);
    let strafe = (this.held('right') ? 1 : 0) - (this.held('left') ? 1 : 0);
    let turn = (this.held('turnRight') ? 1 : 0) - (this.held('turnLeft') ? 1 : 0);
    if (this.held('strafe')) {
      strafe += turn;
      turn = 0;
    }
    forward -= this.pad.ly;
    strafe += this.pad.lx;
    const len = Math.hypot(forward, strafe);
    if (len > 1) {
      forward /= len;
      strafe /= len;
    }
    return {
      forward,
      strafe,
      turn,
      padTurn: this.pad.rx,
      padLook: this.pad.ry,
      run: this.held('run') !== this.alwaysRun || this.pad.run,
      fire: this.held('fire') || this.mouseFire || this.pad.fire,
    };
  }

  pollGamepad() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    let gp = null;
    for (const p of pads) if (p && p.connected) gp = gp ?? p;
    this.padConnected = !!gp;
    if (!gp) {
      this.pad.lx = this.pad.ly = this.pad.rx = this.pad.ry = 0;
      this.pad.fire = this.pad.run = false;
      return;
    }
    const dz = (v) => (Math.abs(v) < DEADZONE ? 0 : (v - Math.sign(v) * DEADZONE) / (1 - DEADZONE));
    this.pad.lx = dz(gp.axes[0] ?? 0);
    this.pad.ly = dz(gp.axes[1] ?? 0);
    this.pad.rx = dz(gp.axes[2] ?? 0);
    this.pad.ry = dz(gp.axes[3] ?? 0);
    this.pad.fire = !!gp.buttons[7]?.pressed || (gp.buttons[7]?.value ?? 0) > 0.3;
    this.pad.run = !!gp.buttons[10]?.pressed || !!gp.buttons[6]?.pressed;
    gp.buttons.forEach((b, i) => {
      const pressed = !!b?.pressed;
      if (pressed && !this.pad.prev[i]) {
        if (PAD_PRESS[i]) this.queue.push(PAD_PRESS[i]);
        this.queue.push('anyKey');
      }
      this.pad.prev[i] = pressed;
    });
  }
}
