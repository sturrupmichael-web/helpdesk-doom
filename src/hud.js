// The status bar, messages, screen flashes and (in menus.js) the menus, drawn on a 2D
// canvas at DOOM's 200 lines with the pixel font and stretched over the 3D view.
//
// The bar is DOOM's, relabeled: AMMO, SANITY (health), ARMS (weapon slots), the face,
// ARMOR, the three access badges, and the ammo table.

import { drawText, drawTiny, textWidth } from './font.js';
import { PALETTE as P } from '../shared/data/palette.js';
import { Face, drawFace, FACE_W, FACE_H } from './face.js';
import { iconCanvas } from './sprites.js';
import { WEAPONS, AMMO } from '../data/weapons.js';

export const LINES = 200;
export const BAR_W = 320;
export const BAR_H = 32;
const MESSAGE_TIME = 4;
const RED = '#d8484e';
const BADGES = { blue: '#41a6f6', yellow: '#ffcd75', red: '#b13e53' };

export class Hud {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.messages = [];
    this.face = new Face();
    this.keyFlash = null;
    this.keyFlashT = 0;
    this.fps = 60;
    this.showFps = false;
    this.crosshair = true;
    this.badgeIcons = Object.fromEntries(Object.entries(BADGES).map(([k, c]) => [k, iconCanvas('badge', { '#38b764': c })]));
    this.resize();
    addEventListener('resize', () => this.resize());
  }

  resize() {
    const aspect = Math.max(1, innerWidth / Math.max(1, innerHeight));
    this.h = LINES;
    this.w = Math.max(BAR_W, Math.round(LINES * aspect));
    this.canvas.width = this.w;
    this.canvas.height = this.h;
    this.ctx.imageSmoothingEnabled = false;
    this.barBg = null;
  }

  message(text) {
    this.messages.push({ text: String(text).toUpperCase(), t: MESSAGE_TIME });
    if (this.messages.length > 3) this.messages.shift();
  }

  flashKey(color) {
    this.keyFlash = color;
    this.keyFlashT = 1.2;
  }

  // In-game frame: flashes over the view, messages, the bar. `overlay(ctx)`, if given,
  // replaces the view (the automap).
  draw(dt, game, overlay = null) {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.w, this.h);
    if (overlay) overlay(ctx);
    this.fps += (1 / Math.max(dt, 1e-3) - this.fps) * 0.05;
    const viewH = this.h - BAR_H;
    const pl = game.player;

    // Screen tints, DOOM's palette flashes: red for pain, gold for pickups, white-blue
    // while on PTO, red while Bulk Close (berserk) wears off.
    let tint = null;
    if (game.flash.damage > 0) tint = [216, 32, 32, Math.min(0.55, game.flash.damage * 0.6)];
    else if (game.flash.bonus > 0) tint = [255, 205, 117, game.flash.bonus * 0.5];
    if (game.power.invulnerable > 0 && (game.power.invulnerable > 3 || Math.floor(game.power.invulnerable * 4) % 2)) tint = [190, 220, 255, 0.28];
    if (pl.dead) tint = [120, 0, 0, 0.35];
    if (tint && !overlay) {
      ctx.fillStyle = `rgba(${tint[0]},${tint[1]},${tint[2]},${tint[3]})`;
      ctx.fillRect(0, 0, this.w, viewH);
    }

    if (this.crosshair && !pl.dead && !overlay) {
      const cx = Math.floor(this.w / 2);
      const cy = Math.floor(viewH / 2);
      ctx.fillStyle = 'rgba(244,244,244,0.55)';
      ctx.fillRect(cx - 3, cy, 2, 1);
      ctx.fillRect(cx + 2, cy, 2, 1);
      ctx.fillRect(cx, cy - 3, 1, 2);
      ctx.fillRect(cx, cy + 2, 1, 2);
    }

    this.messages = this.messages.filter((m) => (m.t -= dt) > 0);
    this.messages.forEach((m, i) => drawText(ctx, m.text, 2, 2 + i * 9, P.y, 1, 'left', P.k));
    if (this.showFps) drawText(ctx, `${Math.round(this.fps)} FPS`, this.w - 2, 2, P.g, 1, 'right', P.k);

    this.face.update(dt, game.arsenal.firing);
    this.drawBar(dt, game);
  }

  drawBar(dt, game) {
    const ctx = this.ctx;
    const pl = game.player;
    const ars = game.arsenal;
    const y = this.h - BAR_H;
    const x0 = Math.floor((this.w - BAR_W) / 2);
    if (!this.barBg) this.barBg = makeBarBackground(this.w);
    ctx.drawImage(this.barBg, 0, y);

    // Panels.
    const panel = (x, w, label) => {
      ctx.fillStyle = P.k;
      ctx.fillRect(x0 + x, y + 2, w, BAR_H - 4);
      ctx.fillStyle = '#2a2a30';
      ctx.fillRect(x0 + x + 1, y + 3, w - 2, BAR_H - 6);
      if (label) drawText(ctx, label, x0 + x + w / 2, y + BAR_H - 10, P.g, 1, 'center');
    };
    const big = (text, cx) => drawText(ctx, text, x0 + cx, y + 5, RED, 2, 'center', P.k);

    const w = ars.weapon;
    panel(2, 46, 'AMMO');
    if (w.ammo) big(String(ars.ammo[w.ammo]), 25);
    panel(50, 56, 'SANITY');
    big(`${Math.max(0, Math.ceil(pl.health))}%`, 78);

    // ARMS: slots 2-6 (1, the patch cable, is always there).
    panel(108, 36, null);
    drawText(ctx, 'ARMS', x0 + 126, y + BAR_H - 10, P.g, 1, 'center');
    for (let s = 2; s <= 6; s++) {
      const col = (s - 2) % 3;
      const row = s <= 4 ? 0 : 1;
      const owned = Object.entries(WEAPONS).some(([id, def]) => def.slot === s && ars.owned.has(id));
      const current = w.slot === s;
      drawText(ctx, String(s), x0 + 113 + col * 11, y + 4 + row * 9, current ? P.w : owned ? P.y : '#55555c');
    }

    // The face.
    const fx = x0 + 160 - FACE_W / 2;
    ctx.fillStyle = P.k;
    ctx.fillRect(fx - 2, y + 1, FACE_W + 4, BAR_H - 1);
    ctx.fillStyle = game.power.invulnerable > 0 ? '#566c86' : '#3a3a42';
    ctx.fillRect(fx - 1, y + 2, FACE_W + 2, BAR_H - 2);
    drawFace(ctx, fx, y + 3, this.face.state(pl.health, { dead: pl.dead, god: game.god || game.power.invulnerable > 0 }));

    panel(176, 56, 'ARMOR');
    big(`${Math.round(pl.armor)}%`, 204);

    // Badges.
    panel(234, 16, null);
    this.keyFlashT -= dt;
    ['blue', 'yellow', 'red'].forEach((k, i) => {
      const has = pl.keys.has(k);
      const flashing = this.keyFlash === k && this.keyFlashT > 0 && Math.floor(this.keyFlashT * 6) % 2;
      if (has || flashing) ctx.drawImage(this.badgeIcons[k], 2, 1, 12, 14, x0 + 236, y + 3 + i * 9, 12, 9 - 1);
    });

    // Ammo table.
    panel(252, 66, null);
    Object.entries(AMMO).forEach(([k, a], i) => {
      const yy = y + 5 + i * 6;
      const active = w.ammo === k;
      drawTiny(ctx, a.short, x0 + 256, yy, active ? P.y : P.g);
      drawTiny(ctx, `${ars.ammo[k]}/${ars.max[k]}`, x0 + 315, yy, active ? P.y : P.g, 'right');
    });
  }

  // Centered text block over everything (pause, death).
  banner(lines, { y = null, scale = 2, color = P.y } = {}) {
    const ctx = this.ctx;
    const total = lines.length * 9 * scale;
    let yy = y ?? Math.round((this.h - BAR_H - total) / 2);
    for (const line of lines) {
      drawText(ctx, line, this.w / 2, yy, color, scale, 'center', P.k);
      yy += 9 * scale;
    }
  }
}

// The bar's background, with DOOM-ish riveted panels across the full width.
function makeBarBackground(w) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = BAR_H;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#4b4b52';
  ctx.fillRect(0, 0, w, BAR_H);
  for (let i = 0; i < 400; i++) {
    ctx.fillStyle = Math.random() < 0.5 ? '#56565e' : '#404047';
    ctx.fillRect(Math.floor(Math.random() * w), Math.floor(Math.random() * BAR_H), 2, 1);
  }
  ctx.fillStyle = '#6a6a72';
  ctx.fillRect(0, 0, w, 1);
  ctx.fillStyle = P.k;
  ctx.fillRect(0, BAR_H - 1, w, 1);
  for (let x = 4; x < w; x += 40) {
    ctx.fillStyle = '#2a2a30';
    ctx.fillRect(x, 3, 2, 2);
    ctx.fillRect(x, BAR_H - 5, 2, 2);
  }
  return c;
}

export { textWidth };
