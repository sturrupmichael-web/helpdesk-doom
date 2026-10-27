// Every wall, floor and ceiling texture, painted in code on small canvases (no image
// files) from the game's palette (data/palette.js). Wall textures are 64 x 128 pixels
// (2 x 4 scene units, anchored at the floor); floors and ceilings ("flats") are 64 x 64
// (one 2 x 2 map cell). Names are what the map file's legend uses.

import * as THREE from 'three';
import { PALETTE as P } from '../shared/data/palette.js';
import { drawText } from './font.js';

// Small seeded random generator, so the textures look the same on every load.
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Darkens (f < 1) or lightens (f > 1) a hex color.
export function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  const ch = (v) => Math.max(0, Math.min(255, Math.round(v * f)));
  return `rgb(${ch(n >> 16)},${ch((n >> 8) & 255)},${ch(n & 255)})`;
}

// Fills a rectangle with per-pixel noise around a base color.
function noise(ctx, rnd, x, y, w, h, base, amount = 0.08) {
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      ctx.fillStyle = shade(base, 1 + (rnd() - 0.5) * 2 * amount);
      ctx.fillRect(x + i, y + j, 1, 1);
    }
  }
}

const rect = (ctx, x, y, w, h, color) => {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
};

const BEIGE = '#c2b48c';
const CONCRETE = P.X;

// A drywall panel with a baseboard: the base of most office walls.
function drywall(ctx, rnd, base = BEIGE) {
  noise(ctx, rnd, 0, 0, 64, 128, base, 0.05);
  rect(ctx, 0, 0, 1, 128, shade(base, 0.82)); // panel seam
  rect(ctx, 32, 0, 1, 128, shade(base, 0.88));
  rect(ctx, 0, 120, 64, 8, P.E); // baseboard
  rect(ctx, 0, 120, 64, 1, shade(P.E, 1.4));
}

const WALLS = {
  DRYWALL: (ctx, rnd) => drywall(ctx, rnd),
  // Exterior: concrete sill below, night-time windows above with the city outside.
  WINDOW: (ctx, rnd) => {
    noise(ctx, rnd, 0, 0, 64, 128, CONCRETE, 0.08);
    rect(ctx, 2, 6, 60, 82, P.k);
    rect(ctx, 4, 8, 56, 78, '#141a33');
    for (let i = 0; i < 26; i++) {
      // Skyline: dark towers with lit windows.
      const bx = 4 + Math.floor(rnd() * 52);
      const bh = 10 + Math.floor(rnd() * 40);
      rect(ctx, bx, 86 - bh, 4 + Math.floor(rnd() * 6), bh, '#232a45');
    }
    for (let i = 0; i < 40; i++) rect(ctx, 5 + Math.floor(rnd() * 54), 40 + Math.floor(rnd() * 44), 1, 1, rnd() < 0.7 ? P.y : P.q);
    rect(ctx, 31, 6, 2, 82, P.G); // mullion
    rect(ctx, 2, 46, 60, 2, P.G);
    rect(ctx, 0, 88, 64, 3, P.g); // sill
    rect(ctx, 0, 120, 64, 8, P.x);
  },
  // Server rack fronts: black cabinets full of drives with blinking LEDs.
  RACK: (ctx, rnd) => {
    rect(ctx, 0, 0, 64, 128, P.k);
    for (const x0 of [2, 33]) {
      rect(ctx, x0, 2, 29, 124, '#24262e');
      for (let y = 6; y < 120; y += 7) {
        rect(ctx, x0 + 2, y, 25, 5, rnd() < 0.2 ? '#2a2f45' : P.c);
        rect(ctx, x0 + 3, y + 1, 2, 1, rnd() < 0.8 ? P.e : P.r);
        if (rnd() < 0.6) rect(ctx, x0 + 6, y + 1, 1, 1, rnd() < 0.5 ? P.q : P.y);
        rect(ctx, x0 + 10, y + 3, 15, 1, P.m);
      }
    }
  },
  PILLAR: (ctx, rnd) => {
    noise(ctx, rnd, 0, 0, 64, 128, P.g, 0.06);
    rect(ctx, 0, 0, 2, 128, shade(P.g, 0.75));
    rect(ctx, 62, 0, 2, 128, shade(P.g, 0.75));
    rect(ctx, 0, 120, 64, 8, P.G);
  },
  // Cubicle partition: blue-grey fabric under an aluminium cap.
  CUBICLE: (ctx, rnd) => {
    noise(ctx, rnd, 0, 0, 64, 128, P.G, 0.12);
    for (let y = 0; y < 128; y += 4) for (let x = (y / 4) % 2 ? 2 : 0; x < 64; x += 4) rect(ctx, x, y, 1, 1, shade(P.G, 0.85));
    rect(ctx, 0, 0, 64, 4, P.g);
    rect(ctx, 0, 0, 2, 128, P.g);
    rect(ctx, 0, 124, 64, 4, P.k);
  },
  DESK: (ctx, rnd) => {
    noise(ctx, rnd, 0, 0, 64, 128, P.D, 0.06);
    rect(ctx, 0, 0, 64, 4, P.d);
    rect(ctx, 4, 8, 24, 16, P.E);
    rect(ctx, 14, 14, 4, 2, P.g);
    rect(ctx, 36, 8, 24, 16, P.E);
    rect(ctx, 46, 14, 4, 2, P.g);
  },
  MARBLE: (ctx, rnd) => {
    noise(ctx, rnd, 0, 0, 64, 128, '#d9d3c4', 0.04);
    for (let i = 0; i < 6; i++) {
      let x = rnd() * 64;
      ctx.fillStyle = '#b8b0a0';
      for (let y = 0; y < 128; y++) {
        x += (rnd() - 0.5) * 2;
        ctx.fillRect(((x % 64) + 64) % 64, y, 1, 1);
      }
    }
    rect(ctx, 0, 0, 64, 2, P.y);
    rect(ctx, 0, 118, 64, 10, P.h);
  },
  // Plain door: grey steel with a narrow window and a handle.
  DOOR: (ctx, rnd) => door(ctx, rnd, null),
  DOORBLU: (ctx, rnd) => door(ctx, rnd, P.B),
  DOORYEL: (ctx, rnd) => door(ctx, rnd, P.y),
  DOORRED: (ctx, rnd) => door(ctx, rnd, P.r),
  // The side of a door opening.
  DOORTRAK: (ctx, rnd) => {
    noise(ctx, rnd, 0, 0, 64, 128, P.G, 0.05);
    for (let y = 0; y < 128; y += 8) rect(ctx, 0, y, 64, 1, shade(P.G, 0.7));
  },
  // Wall with a whiteboard covered in someone's architecture diagram.
  WHITEBOARD: (ctx, rnd) => {
    drywall(ctx, rnd);
    rect(ctx, 4, 50, 56, 38, P.g);
    rect(ctx, 5, 51, 54, 36, P.w);
    const pen = [P.b, P.r, P.e, P.k];
    for (let i = 0; i < 5; i++) {
      const x = 8 + Math.floor(rnd() * 40);
      const y = 54 + Math.floor(rnd() * 24);
      ctx.strokeStyle = pen[i % 4];
      ctx.strokeRect(x + 0.5, y + 0.5, 6 + Math.floor(rnd() * 6), 4);
    }
    drawText(ctx, 'DNS', 10, 74, P.r);
    drawText(ctx, '???', 36, 62, P.b);
    rect(ctx, 6, 88, 52, 2, P.G); // marker tray
  },
  // Motivational poster.
  POSTER: (ctx, rnd) => {
    drywall(ctx, rnd);
    rect(ctx, 10, 44, 44, 52, P.k);
    rect(ctx, 12, 46, 40, 36, P.n);
    // The power symbol, the original's "Turn It Off and On Again" icon.
    ctx.fillStyle = P.B;
    for (let a = 0.5; a < Math.PI * 2 - 0.5; a += 0.05) ctx.fillRect(32 + Math.round(Math.sin(a) * 11), 64 - Math.round(Math.cos(a) * 11), 2, 2);
    rect(ctx, 31, 50, 2, 12, P.B);
    drawText(ctx, 'REBOOT', 32, 86, P.w, 1, 'center');
  },
  // Exit switch: the clock-out terminal.
  EXITSW: (ctx, rnd) => exitSwitch(ctx, rnd, false),
  EXITSW_ON: (ctx, rnd) => exitSwitch(ctx, rnd, true),
  // Steel elevator doors.
  ELEVATOR: (ctx, rnd) => {
    noise(ctx, rnd, 0, 0, 64, 128, P.g, 0.04);
    rect(ctx, 31, 0, 2, 128, P.G);
    rect(ctx, 0, 0, 64, 6, P.G);
    rect(ctx, 26, 10, 12, 6, P.k);
    drawText(ctx, '1', 30, 10, P.r);
  },
  // Raised floor side: grey panels with vents (also the server room's step).
  RAISED: (ctx, rnd) => {
    noise(ctx, rnd, 0, 0, 64, 128, P.G, 0.06);
    for (let y = 0; y < 128; y += 32) {
      rect(ctx, 0, y, 64, 1, P.k);
      for (let x = 6; x < 60; x += 4) rect(ctx, x, y + 12, 2, 8, P.R);
    }
  },
  // Lift sides: hazard stripes.
  LIFT: (ctx) => {
    for (let y = 0; y < 128; y++) for (let x = 0; x < 64; x++) {
      ctx.fillStyle = Math.floor((x + y) / 8) % 2 ? P.k : P.y;
      ctx.fillRect(x, y, 1, 1);
    }
  },
  // Carpet edge (steps down into the Town Hall pit).
  STEP: (ctx, rnd) => {
    noise(ctx, rnd, 0, 0, 64, 128, P.m, 0.1);
    for (let y = 0; y < 128; y += 16) rect(ctx, 0, y, 64, 2, P.y);
  },
  // Dusty concrete for the forgotten closets.
  CONCRETE: (ctx, rnd) => {
    noise(ctx, rnd, 0, 0, 64, 128, P.x, 0.12);
    for (let i = 0; i < 12; i++) rect(ctx, Math.floor(rnd() * 62), Math.floor(rnd() * 126), 2, 1, shade(P.x, 0.7));
  },
  // Restroom tiles.
  TILEWALL: (ctx, rnd) => {
    noise(ctx, rnd, 0, 0, 64, 128, '#dfe7ea', 0.03);
    for (let y = 0; y < 128; y += 8) rect(ctx, 0, y, 64, 1, P.g);
    for (let x = 0; x < 64; x += 8) rect(ctx, x, 0, 1, 128, P.g);
    rect(ctx, 0, 64, 64, 4, P.B);
  },
};

function door(ctx, rnd, stripe) {
  noise(ctx, rnd, 0, 0, 64, 128, '#7d8796', 0.05);
  rect(ctx, 0, 0, 64, 2, P.G);
  rect(ctx, 0, 0, 2, 128, P.G);
  rect(ctx, 62, 0, 2, 128, P.G);
  rect(ctx, 26, 18, 12, 30, P.k); // window
  rect(ctx, 27, 19, 10, 28, '#2a3a55');
  rect(ctx, 48, 66, 8, 3, P.g); // handle
  rect(ctx, 0, 118, 64, 10, P.G); // kick plate
  if (stripe) {
    rect(ctx, 0, 54, 64, 6, stripe);
    rect(ctx, 6, 62, 10, 14, P.k); // badge reader
    rect(ctx, 8, 64, 6, 4, stripe);
  }
}

function exitSwitch(ctx, rnd, on) {
  drywall(ctx, rnd);
  rect(ctx, 10, 46, 44, 50, P.k);
  rect(ctx, 12, 48, 40, 46, P.G);
  rect(ctx, 14, 50, 36, 14, on ? P.e : P.r);
  drawText(ctx, on ? 'BYE' : 'EXIT', 32, 54, P.w, 1, 'center');
  rect(ctx, 24, 70, 16, 18, P.k); // lever slot
  rect(ctx, 28, on ? 80 : 68, 8, 8, on ? P.e : P.y);
}

// --- Flats (floors and ceilings) ---

const FLATS = {
  // The original's office carpet: charcoal with mid-grey and navy speckle.
  CARPET: (ctx, rnd) => {
    noise(ctx, rnd, 0, 0, 64, 64, P.c, 0.1);
    for (let i = 0; i < 140; i++) rect(ctx, Math.floor(rnd() * 64), Math.floor(rnd() * 64), 1, 1, rnd() < 0.6 ? P.m : P.n);
  },
  CARPET2: (ctx, rnd) => {
    noise(ctx, rnd, 0, 0, 64, 64, '#3a4458', 0.1);
    for (let y = 0; y < 64; y += 16) for (let x = 0; x < 64; x += 16) rect(ctx, x + 7, y + 7, 2, 2, P.n);
  },
  TILE: (ctx, rnd) => {
    for (let y = 0; y < 64; y += 16) for (let x = 0; x < 64; x += 16) noise(ctx, rnd, x, y, 16, 16, (x + y) % 32 ? '#9aa3a8' : '#8c959b', 0.04);
    for (let i = 0; i < 64; i += 16) {
      rect(ctx, i, 0, 1, 64, '#6b7378');
      rect(ctx, 0, i, 64, 1, '#6b7378');
    }
  },
  // Acoustic ceiling tiles in a metal grid.
  CEILING: (ctx, rnd) => {
    noise(ctx, rnd, 0, 0, 64, 64, '#c9c7bd', 0.05);
    for (let i = 0; i < 90; i++) rect(ctx, Math.floor(rnd() * 64), Math.floor(rnd() * 64), 1, 1, '#9e9b90');
    rect(ctx, 0, 0, 64, 2, '#8e8c84');
    rect(ctx, 0, 0, 2, 64, '#8e8c84');
    rect(ctx, 31, 0, 1, 64, '#a8a69c');
  },
  // A fluorescent light panel in the ceiling grid.
  LIGHTPANEL: (ctx, rnd) => {
    FLATS.CEILING(ctx, rnd);
    rect(ctx, 6, 8, 52, 48, P.g);
    rect(ctx, 8, 10, 48, 44, '#fffbe6');
    for (let x = 14; x < 56; x += 10) rect(ctx, x, 10, 1, 44, '#e8e2c4');
  },
  MARBLE: (ctx, rnd) => {
    for (let y = 0; y < 64; y += 32) for (let x = 0; x < 64; x += 32) noise(ctx, rnd, x, y, 32, 32, (x + y) % 64 ? '#d9d3c4' : '#c9c0ac', 0.04);
    rect(ctx, 0, 0, 64, 1, '#a89f8c');
    rect(ctx, 0, 0, 1, 64, '#a89f8c');
  },
  KITCHEN: (ctx, rnd) => {
    for (let y = 0; y < 64; y += 8) for (let x = 0; x < 64; x += 8) noise(ctx, rnd, x, y, 8, 8, (x + y) % 16 ? P.w : P.k, 0.04);
  },
  // Spilled coffee: a hazard (it burns, and it's sticky).
  COFFEE: (ctx, rnd) => {
    noise(ctx, rnd, 0, 0, 64, 64, '#3d2410', 0.15);
    for (let i = 0; i < 18; i++) rect(ctx, Math.floor(rnd() * 60), Math.floor(rnd() * 62), 3 + Math.floor(rnd() * 4), 1, '#7a4e26');
    for (let i = 0; i < 8; i++) rect(ctx, Math.floor(rnd() * 62), Math.floor(rnd() * 62), 2, 2, '#c08a50');
  },
  // Raised floor: grey 2x2 tiles with perforated vents.
  RAISEDFLR: (ctx, rnd) => {
    noise(ctx, rnd, 0, 0, 64, 64, '#7b8492', 0.05);
    for (let i = 0; i < 64; i += 32) {
      rect(ctx, i, 0, 1, 64, P.k);
      rect(ctx, 0, i, 64, 1, P.k);
    }
    for (let y = 36; y < 60; y += 3) for (let x = 36; x < 60; x += 3) rect(ctx, x, y, 1, 1, P.R);
  },
  // Exposed cabling: a hazard (live wires).
  CABLES: (ctx, rnd) => {
    noise(ctx, rnd, 0, 0, 64, 64, P.R, 0.1);
    const colors = [P.y, P.B, P.e, P.o, P.q];
    for (let i = 0; i < 9; i++) {
      ctx.fillStyle = colors[i % colors.length];
      let y = rnd() * 64;
      let dy = (rnd() - 0.5) * 1.2;
      for (let x = 0; x < 64; x++) {
        y += dy;
        if (rnd() < 0.1) dy = (rnd() - 0.5) * 1.2;
        ctx.fillRect(x, ((Math.round(y) % 64) + 64) % 64, 1, 2);
      }
    }
    for (let i = 0; i < 4; i++) rect(ctx, Math.floor(rnd() * 62), Math.floor(rnd() * 62), 2, 2, P.w);
  },
  WOOD: (ctx, rnd) => {
    for (let y = 0; y < 64; y += 8) {
      const off = Math.floor(rnd() * 64);
      noise(ctx, rnd, 0, y, 64, 8, rnd() < 0.5 ? P.d : '#8f6232', 0.06);
      rect(ctx, 0, y, 64, 1, P.h);
      rect(ctx, off % 64, y, 1, 8, P.h);
    }
  },
  METAL: (ctx, rnd) => {
    noise(ctx, rnd, 0, 0, 64, 64, '#8a93a0', 0.04);
    for (let y = 2; y < 64; y += 8) for (let x = (y % 16 ? 2 : 6); x < 64; x += 8) rect(ctx, x, y, 3, 1, '#b8c0cc');
  },
  RESTROOM: (ctx, rnd) => {
    noise(ctx, rnd, 0, 0, 64, 64, '#e6eef0', 0.03);
    for (let i = 0; i < 64; i += 8) {
      rect(ctx, i, 0, 1, 64, '#b0bcc0');
      rect(ctx, 0, i, 64, 1, '#b0bcc0');
    }
  },
  DUST: (ctx, rnd) => {
    noise(ctx, rnd, 0, 0, 64, 64, P.x, 0.14);
    for (let i = 0; i < 30; i++) rect(ctx, Math.floor(rnd() * 64), Math.floor(rnd() * 64), 1, 1, P.X);
  },
  CUBETOP: (ctx, rnd) => noise(ctx, rnd, 0, 0, 64, 64, P.g, 0.05),
  // Desk tops: wood with a keyboard and some paper on them.
  DESKTOP: (ctx, rnd) => {
    noise(ctx, rnd, 0, 0, 64, 64, P.d, 0.06);
    rect(ctx, 12, 34, 30, 10, P.k);
    for (let x = 14; x < 40; x += 3) rect(ctx, x, 36, 2, 2, P.g);
    rect(ctx, 46, 10, 12, 16, P.w);
    rect(ctx, 6, 8, 10, 10, P.y);
  },
  LIFTTOP: (ctx, rnd) => {
    FLATS.METAL(ctx, rnd);
    for (let i = 0; i < 64; i++) {
      const c = Math.floor(i / 4) % 2 ? P.k : P.y;
      rect(ctx, i, 0, 1, 3, c);
      rect(ctx, i, 61, 1, 3, c);
      rect(ctx, 0, i, 3, 1, c);
      rect(ctx, 61, i, 3, 1, c);
    }
  },
};

// Some wall textures double as flats (e.g. the top of a door), and vice versa.
FLATS.DOOR = FLATS.DOORTOP = (ctx, rnd) => noise(ctx, rnd, 0, 0, 64, 64, '#7d8796', 0.05);

const cache = new Map();

// Returns the THREE texture for `name` (a WALLS or FLATS entry), creating it on first use.
// Unknown names fall back to a magenta checkerboard so a typo in the map is easy to spot.
export function texture(name) {
  if (cache.has(name)) return cache.get(name);
  const wall = WALLS[name];
  const flat = FLATS[name];
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = wall ? 128 : 64;
  const ctx = canvas.getContext('2d');
  const rnd = rng([...name].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7));
  if (wall) wall(ctx, rnd);
  else if (flat) flat(ctx, rnd);
  else {
    console.warn(`Unknown texture "${name}"`);
    for (let y = 0; y < 64; y += 8) for (let x = 0; x < 64; x += 8) rect(ctx, x, y, 8, 8, (x + y) % 16 ? '#ff00ff' : '#000');
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.userData.units = wall ? [2, 4] : [2, 2]; // scene units one repeat covers (w, h)
  cache.set(name, tex);
  return tex;
}

export const isWallTexture = (name) => name in WALLS;
