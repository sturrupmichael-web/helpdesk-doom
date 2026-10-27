// The automap (Tab): DOOM's line map of the parts of the office you've seen, drawn over
// the view with north up and you as the arrow in the middle. Walls are red, steps and
// ledges brown, doors in their badge's color, the exit switch green. The Fire Evacuation
// Map power-up shows the rest of the floor in grey, as DOOM's computer area map does.

import { PALETTE as P } from '../shared/data/palette.js';
import { drawText } from './font.js';

const RAYS = 120;
const RANGE = 40;
const DOOR_COLORS = { blue: '#41a6f6', yellow: '#ffcd75', red: '#b13e53' };

export class Automap {
  constructor(level) {
    this.level = level;
    this.seen = new Uint8Array(level.cells.length);
    this.scanT = 0;
    this.zoom = 3; // screen pixels per scene unit
  }

  // Marks what's in view: rays fanned all around at eye height (cheap, and close enough
  // to "what you've looked at" for an office).
  update(dt, player) {
    this.scanT -= dt;
    if (this.scanT > 0) return;
    this.scanT = 0.15;
    const L = this.level;
    for (let i = 0; i < RAYS; i++) {
      const a = (i / RAYS) * Math.PI * 2;
      const dx = Math.sin(a);
      const dz = Math.cos(a);
      const hit = L.trace(player.x, player.eye, player.z, dx, 0, dz, RANGE);
      const end = hit ? hit.t + 0.3 : RANGE;
      for (let t = 0; t <= end; t += L.S * 0.4) {
        const c = L.col(player.x + dx * t);
        const r = L.col(player.z + dz * t);
        if (L.inside(c, r)) this.seen[L.idx(c, r)] = 1;
      }
    }
  }

  zoomBy(f) {
    this.zoom = Math.max(1, Math.min(8, this.zoom * f));
  }

  draw(ctx, w, h, game) {
    const L = this.level;
    const pl = game.player;
    const full = game.power.map;
    const S = L.S;
    const z = this.zoom;
    const cx = w / 2;
    const cy = h / 2;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, w, h);
    const sx = (x) => Math.round(cx + (x - pl.x) * z);
    const sy = (y) => Math.round(cy + (y - pl.z) * z);
    // Only the cells on screen.
    const c0 = Math.max(0, L.col(pl.x - cx / z) - 1);
    const c1 = Math.min(L.w - 1, L.col(pl.x + cx / z) + 1);
    const r0 = Math.max(0, L.col(pl.z - cy / z) - 1);
    const r1 = Math.min(L.h - 1, L.col(pl.z + cy / z) + 1);
    const line = (x0, y0, x1, y1, color) => {
      ctx.fillStyle = color;
      if (x0 === x1) ctx.fillRect(x0, Math.min(y0, y1), 1, Math.abs(y1 - y0) + 1);
      else ctx.fillRect(Math.min(x0, x1), y0, Math.abs(x1 - x0) + 1, 1);
    };
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        const i = L.idx(c, r);
        const cell = L.cells[i];
        if (cell.kind === 'wall') continue;
        const known = this.seen[i];
        if (!known && !full) continue;
        // Each edge to the east and south (and west/north at walls) once.
        for (const [dc, dr] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) {
          const n = L.cell(c + dc, r + dr);
          const j = L.inside(c + dc, r + dr) ? L.idx(c + dc, r + dr) : -1;
          let color = null;
          if (!n || n.kind === 'wall') color = n?.def?.exit ? P.e : P.r;
          else if ((dc > 0 || dr > 0) && n.kind !== 'door' && cell.kind !== 'door') {
            if (Math.abs(L.floor[j] - L.floor[i]) > 0.3 || n.kind === 'lift' || cell.kind === 'lift') color = '#a0703c';
          }
          if (n?.kind === 'door' && cell.kind !== 'door') {
            const d = L.doors[L.doorOf[j]];
            color = d.secret && !d.opened ? P.r : d.key ? DOOR_COLORS[d.key] : P.y;
          }
          if (!color) continue;
          if (!known) color = '#55555c';
          const x = c * S;
          const y = r * S;
          if (dc === 1) line(sx(x + S), sy(y), sx(x + S), sy(y + S), color);
          if (dc === -1) line(sx(x), sy(y), sx(x), sy(y + S), color);
          if (dr === 1) line(sx(x), sy(y + S), sx(x + S), sy(y + S), color);
          if (dr === -1) line(sx(x), sy(y), sx(x + S), sy(y), color);
        }
      }
    }
    // You: an arrow pointing where you look.
    const fx = -Math.sin(pl.yaw);
    const fz = -Math.cos(pl.yaw);
    const px = cx;
    const py = cy;
    ctx.fillStyle = P.w;
    for (let t = -4; t <= 5; t++) ctx.fillRect(Math.round(px + fx * t), Math.round(py + fz * t), 1, 1);
    for (const side of [-1, 1]) {
      const a = Math.atan2(fz, fx) + Math.PI + side * 0.6;
      for (let t = 0; t <= 3; t++) ctx.fillRect(Math.round(px + fx * 5 + Math.cos(a) * t), Math.round(py + fz * 5 + Math.sin(a) * t), 1, 1);
    }
    drawText(ctx, L.name.toUpperCase(), 2, h - 10, P.y, 1, 'left', P.k);
    const s = game.stats;
    drawText(ctx, `K ${s.kills}/${s.totalKills}  I ${s.items}/${s.totalItems}  S ${s.secrets}/${s.totalSecrets}`, w - 2, h - 10, P.g, 1, 'right', P.k);
  }
}
