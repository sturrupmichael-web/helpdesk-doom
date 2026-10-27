// The status bar face: the tech from the 3D game (brown hair, grey headset with a boom
// mic, blue polo), looking more frazzled the lower their sanity gets, like DOOM's marine.
// Drawn in pixels, 24 x 29.

import { PALETTE as P } from '../shared/data/palette.js';

export const FACE_W = 24;
export const FACE_H = 29;

// Picks the expression the way DOOM's status bar does: dying beats everything, then
// god mode, a grin for a new weapon, "ouch" for a big hit, looking towards whoever hurt
// you, a grimace while firing for a long time, and otherwise glancing around.
export class Face {
  constructor() {
    this.look = 0;
    this.lookT = 1;
    this.expr = null;
    this.exprT = 0;
    this.fireT = 0;
  }
  grin() {
    this.expr = 'grin';
    this.exprT = 1.6;
  }
  hurt(amount, side) {
    if (amount >= 20) {
      this.expr = 'ouch';
      this.exprT = 1.2;
    } else if (this.expr !== 'ouch' || this.exprT <= 0) {
      this.expr = 'hurt';
      this.exprT = 0.8;
      this.look = side;
    }
  }
  firing(dt) {
    this.fireT += dt;
  }
  update(dt, firing) {
    this.exprT -= dt;
    if (this.exprT <= 0) this.expr = null;
    if (!firing) this.fireT = Math.max(0, this.fireT - dt * 2);
    this.lookT -= dt;
    if (this.lookT <= 0 && this.expr !== 'hurt') {
      this.lookT = 0.6 + Math.random() * 1.2;
      this.look = Math.random() < 0.5 ? 0 : Math.random() < 0.5 ? -1 : 1;
    }
  }
  state(health, { dead = false, god = false } = {}) {
    const level = health >= 80 ? 0 : health >= 60 ? 1 : health >= 40 ? 2 : health >= 20 ? 3 : 4;
    if (dead) return { level: 4, expr: 'dead', look: 0 };
    if (god) return { level: 0, expr: 'god', look: 0 };
    if (this.expr === 'grin' || this.expr === 'ouch') return { level, expr: this.expr, look: 0 };
    if (this.expr === 'hurt') return { level, expr: 'hurt', look: this.look };
    if (this.fireT > 2) return { level, expr: 'rampage', look: 0 };
    return { level, expr: 'normal', look: this.look };
  }
}

// Draws the face with its top-left at (x, y).
export function drawFace(ctx, x, y, { level, expr, look }) {
  const px = (a, b, w, h, c) => {
    ctx.fillStyle = c;
    ctx.fillRect(x + a, y + b, w, h);
  };
  const dead = expr === 'dead';
  const skin = dead ? '#9fae8c' : level >= 3 ? '#e8b48c' : P.s;
  const shade = dead ? '#7a8a6c' : '#d9a47a';
  const hair = P.h;
  const lx = look; // pupils shift

  // Shoulders: blue polo with a white collar.
  px(2, 25, 20, 4, P.b);
  px(8, 24, 8, 2, P.w);
  px(10, 25, 4, 2, skin);
  // Head.
  px(5, 4, 14, 20, skin);
  px(4, 7, 16, 13, skin);
  px(6, 23, 12, 1, shade);
  px(4, 16, 1, 4, shade);
  px(19, 16, 1, 4, shade);
  // Ears with the headset cups over them.
  px(2, 10, 3, 7, P.k);
  px(19, 10, 3, 7, P.k);
  px(3, 11, 1, 5, P.G);
  px(20, 11, 1, 5, P.G);
  // Hair: neat, then messier as sanity drops.
  px(5, 2, 14, 4, hair);
  px(4, 4, 2, 5, hair);
  px(18, 4, 2, 5, hair);
  if (level >= 2) {
    px(7, 1, 2, 2, hair);
    px(14, 0, 2, 3, hair);
  }
  if (level >= 4) {
    px(3, 1, 2, 2, hair);
    px(18, 0, 2, 2, hair);
    px(11, 0, 1, 2, hair);
  }
  // Headset band over the top.
  px(4, 1, 16, 1, P.G);
  px(3, 2, 1, 8, P.G);
  px(20, 2, 1, 8, P.G);
  // Boom mic to the mouth (bent after a beating).
  if (level < 4 && !dead) {
    px(3, 17, 1, 3, P.G);
    px(4, 20, 4, 1, P.G);
    px(8, 19, 2, 2, P.k);
  } else {
    px(3, 17, 1, 6, P.G);
    px(2, 23, 2, 2, P.k);
  }

  // Eyes.
  const eyeY = 10;
  if (dead) {
    for (const ex of [7, 14]) {
      px(ex, eyeY, 1, 1, P.k);
      px(ex + 2, eyeY, 1, 1, P.k);
      px(ex + 1, eyeY + 1, 1, 1, P.k);
      px(ex, eyeY + 2, 1, 1, P.k);
      px(ex + 2, eyeY + 2, 1, 1, P.k);
    }
  } else if (expr === 'god') {
    // God mode: sunglasses, like Shadow IT Steve.
    px(5, eyeY - 1, 14, 4, P.k);
    px(6, eyeY, 4, 2, P.n);
    px(14, eyeY, 4, 2, P.n);
    px(7, eyeY, 1, 1, P.w);
    px(15, eyeY, 1, 1, P.w);
  } else {
    const tired = level >= 1;
    const wide = expr === 'ouch';
    for (const ex of [6, 14]) {
      px(ex, eyeY, 4, wide ? 4 : 3, P.w);
      const pupil = ex + 1 + Math.max(0, Math.min(2, 1 + lx));
      px(pupil - (lx === 0 ? 1 : 0), eyeY + (wide ? 1 : 1), lx === 0 ? 2 : 1, wide ? 2 : 1, P.k);
      if (tired) px(ex, eyeY + (wide ? 4 : 3), 4, 1, level >= 3 ? '#b07a8c' : shade); // bags under the eyes
      if (level >= 3) px(ex + (ex === 6 ? 0 : 3), eyeY, 1, 1, '#e8a0a0'); // bloodshot
    }
    // Brows: worried slant as things get worse, angry when firing.
    const angry = expr === 'rampage' || expr === 'grin';
    if (angry) {
      px(5, eyeY - 2, 2, 1, hair);
      px(7, eyeY - 1, 3, 1, hair);
      px(17, eyeY - 2, 2, 1, hair);
      px(14, eyeY - 1, 3, 1, hair);
    } else if (level >= 2 || expr === 'hurt' || expr === 'ouch') {
      px(6, eyeY - 1, 2, 1, hair);
      px(8, eyeY - 2, 2, 1, hair);
      px(14, eyeY - 2, 2, 1, hair);
      px(16, eyeY - 1, 2, 1, hair);
    } else {
      px(6, eyeY - 2, 4, 1, hair);
      px(14, eyeY - 2, 4, 1, hair);
    }
  }
  // Nose.
  px(11, 13, 2, 3, shade);
  // Mouth.
  const my = 18;
  if (dead) {
    px(9, my, 6, 2, P.k);
    px(11, my + 1, 2, 2, P.r); // tongue
  } else if (expr === 'grin' || expr === 'god') {
    px(8, my, 8, 3, P.k);
    px(9, my, 6, 1, P.w);
    px(9, my + 2, 6, 1, P.w);
  } else if (expr === 'ouch') {
    px(10, my - 1, 4, 5, P.k);
    px(11, my + 2, 2, 1, P.r);
  } else if (expr === 'rampage') {
    px(8, my, 8, 2, P.k);
    px(9, my, 6, 1, P.w); // gritted teeth
  } else if (level >= 2) {
    px(9, my + 1, 6, 1, P.k);
    px(8, my + 2, 1, 1, P.k);
    px(15, my + 2, 1, 1, P.k);
  } else if (level === 1) {
    px(9, my + 1, 6, 1, P.k);
  } else {
    px(9, my + 1, 6, 1, P.k);
    px(8, my, 1, 1, P.k);
    px(15, my, 1, 1, P.k);
  }
  // Sweat at half sanity, a coffee stain on the collar, a plaster at the end.
  if (level >= 2 && !dead) px(19, 6, 1, 2, P.B);
  if (level >= 3) {
    px(17, 14, 2, 2, '#c87a6a');
    px(9, 25, 3, 2, '#7a4e26');
  }
  if (level >= 4 && !dead) {
    px(14, 4, 5, 2, P.w);
    px(15, 4, 1, 2, P.g);
    px(6, 15, 2, 1, '#b13e53');
  }
}
