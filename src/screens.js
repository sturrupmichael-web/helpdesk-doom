// The screens between play: DOOM's intermission tally after the exit switch, and the
// "you died" overlay. Both draw on the HUD canvas (hud.js) over the last 3D frame.

import { device } from './input.js';
import { drawText } from './font.js';
import { PALETTE as P } from '../shared/data/palette.js';
import { play } from './audio.js';

const RED = '#d8484e';
const COUNT_TIME = 1.2; // seconds to count a row from 0 to 100%
const pct = (n, total) => (total > 0 ? Math.floor((n * 100) / total) : 100);
export const clock = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

// A line under the numbers, picked from how the shift went.
function verdict({ kills, items, secrets, time, par }) {
  if (kills === 100 && items === 100 && secrets === 100) return 'Inbox zero. Every ticket closed, every closet found.';
  if (kills === 100) return 'Zero open tickets. The queue fears you.';
  if (par && time <= par) return 'Under SLA. Someone get this tech a gift card.';
  if (secrets === 0) return 'Rumor has it there are servers nobody remembers.';
  if (kills < 50) return 'Most of the queue is still waiting on hold.';
  return 'Ticket closed. Resolution: user error.';
}

// The tally: kills, items and secrets count up one after another with a ticking sound,
// then the time against par. Space (or a click) skips the counting, then continues.
export class Tally {
  constructor(game, next = null) {
    this.next = next ? next.replace(/^E\dM\d:\s*/, '').toUpperCase() : null;
    const s = game.stats;
    const level = game.level;
    this.title = level.name.replace(/^E\dM\d:\s*/, '').toUpperCase();
    this.final = {
      kills: pct(s.kills, s.totalKills),
      items: pct(s.items, s.totalItems),
      secrets: pct(s.secrets, s.totalSecrets),
      time: Math.floor(game.time),
      par: level.par,
    };
    this.rows = [['KILLS', 'kills'], ['ITEMS', 'items'], ['SECRET', 'secrets']];
    this.shown = { kills: 0, items: 0, secrets: 0, time: 0 };
    this.stage = 0; // which row is counting (3 = time, 4 = done)
    this.pause = 0.6;
    this.tick = 0;
    this.t = 0;
    this.line = verdict(this.final);
  }

  get done() {
    return this.stage >= 4;
  }

  // Space/click: finish counting, or (when done) leave.
  press() {
    if (this.done) return true;
    Object.assign(this.shown, { kills: this.final.kills, items: this.final.items, secrets: this.final.secrets, time: this.final.time });
    this.stage = 4;
    play('tallyDone');
    return false;
  }

  update(dt) {
    this.t += dt;
    if (this.done) return;
    if (this.pause > 0) {
      this.pause -= dt;
      return;
    }
    const key = this.stage < 3 ? this.rows[this.stage][1] : 'time';
    const target = this.final[key];
    const rate = key === 'time' ? Math.max(target, 1) / COUNT_TIME : 100 / COUNT_TIME;
    this.shown[key] = Math.min(target, this.shown[key] + rate * dt);
    this.tick -= dt;
    if (this.tick <= 0) {
      this.tick = 0.06;
      play('tally');
    }
    if (this.shown[key] >= target) {
      this.shown[key] = target;
      this.stage++;
      this.pause = 0.45;
      play('tallyDone');
    }
  }

  draw(ctx, w, h) {
    ctx.fillStyle = 'rgba(26,28,44,0.88)';
    ctx.fillRect(0, 0, w, h);
    const cx = Math.floor(w / 2);
    drawText(ctx, this.title, cx, 14, P.w, 2, 'center', P.k);
    drawText(ctx, 'CLOCKED OUT', cx, 34, P.y, 1, 'center', P.k);
    const left = cx - 90;
    const right = cx + 90;
    this.rows.forEach(([label, key], i) => {
      const y = 56 + i * 22;
      drawText(ctx, label, left, y, RED, 2, 'left', P.k);
      if (this.stage >= i) drawText(ctx, `${Math.floor(this.shown[key])}%`, right, y, RED, 2, 'right', P.k);
    });
    const ty = 56 + 3 * 22 + 4;
    drawText(ctx, 'TIME', left, ty, RED, 2, 'left', P.k);
    if (this.stage >= 3) drawText(ctx, clock(this.shown.time), right, ty, RED, 2, 'right', P.k);
    if (this.final.par) {
      drawText(ctx, 'PAR', left, ty + 20, RED, 2, 'left', P.k);
      if (this.stage >= 3) drawText(ctx, clock(this.final.par), right, ty + 20, RED, 2, 'right', P.k);
    }
    if (this.done) {
      drawText(ctx, this.line.toUpperCase(), cx, ty + 46, P.g, 1, 'center', P.k);
      if (this.next) drawText(ctx, `NEXT: ${this.next}`, cx, h - 26, P.y, 1, 'center', P.k);
      if (Math.floor(this.t * 2) % 2) drawText(ctx, device.touch ? 'TAP TO CONTINUE' : 'PRESS SPACE TO CONTINUE', cx, h - 14, P.w, 1, 'center', P.k);
    }
  }
}

// After the tech goes down: the view stays red, then the way back in.
export function drawDeath(ctx, w, h, t, viewH) {
  if (t < 1) return;
  const cx = Math.floor(w / 2);
  const y = Math.floor(viewH / 2) - 20;
  ctx.fillStyle = 'rgba(26,28,44,0.75)';
  ctx.fillRect(0, y - 6, w, 54);
  drawText(ctx, 'YOU BURNED OUT', cx, y, RED, 2, 'center', P.k);
  drawText(ctx, 'THE TICKETS WILL STILL BE HERE TOMORROW.', cx, y + 22, P.g, 1, 'center', P.k);
  if (Math.floor(t * 2) % 2) drawText(ctx, device.touch ? 'TAP TO CLOCK BACK IN' : 'PRESS SPACE TO CLOCK BACK IN', cx, y + 36, P.w, 1, 'center', P.k);
}

// The end of the episode: DOOM's text screen, typed out a letter at a time over a dark
// background. Space finishes the typing, then goes back to the title.
export class Ending {
  constructor(title, lines) {
    this.title = title.toUpperCase();
    this.lines = lines.map((l) => l.toUpperCase());
    this.total = this.lines.reduce((n, l) => n + l.length, 0);
    this.shown = 0;
    this.t = 0;
  }
  get done() {
    return this.shown >= this.total;
  }
  press() {
    if (this.done) return true;
    this.shown = this.total;
    return false;
  }
  update(dt) {
    this.t += dt;
    const before = Math.floor(this.shown);
    this.shown = Math.min(this.total, this.shown + dt * 28);
    if (Math.floor(this.shown) > before && Math.floor(this.shown) % 3 === 0) play('tally');
  }
  draw(ctx, w, h) {
    ctx.fillStyle = '#1a1c2c';
    ctx.fillRect(0, 0, w, h);
    // A few ticket-shaped lights in the dark, like the 3D game's floor.
    ctx.fillStyle = '#29366f';
    for (let i = 0; i < 12; i++) ctx.fillRect(((i * 97) % (w - 8)) + 2, ((i * 53) % (h - 6)) + 2, 4, 3);
    const cx = Math.floor(w / 2);
    drawText(ctx, this.title, cx, 10, P.y, 1, 'center', P.k);
    let left = Math.floor(this.shown);
    const x = Math.max(4, cx - 132);
    this.lines.forEach((line, i) => {
      if (left <= 0) return;
      drawText(ctx, line.slice(0, left), x, 26 + i * 10, P.w, 1, 'left', P.k);
      left -= line.length;
    });
    if (this.done && Math.floor(this.t * 2) % 2) drawText(ctx, device.touch ? 'TAP' : 'PRESS SPACE', cx, h - 12, P.g, 1, 'center', P.k);
  }
}
