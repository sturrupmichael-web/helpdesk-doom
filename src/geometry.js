// Turns the level grid into Three.js meshes. Static faces (floors, ceilings, walls,
// steps) are merged into one mesh per texture and light effect, so the whole level is a
// few dozen draw calls. Doors and lifts are small meshes of their own that slide.
//
// Lighting is DOOM's: no lights at all, just a brightness per cell baked into the
// vertex colors (plus a little "fake contrast" on walls by direction), black fog for
// the dark distance, and per-effect material tints for flickering rooms.

import * as THREE from 'three';
import { texture } from './textures.js';

const LIGHT_EVERY = 3; // a light panel on every 3rd ceiling tile in rooms with `lights`

class Bucket {
  constructor(tex, effect) {
    this.tex = tex;
    this.effect = effect;
    this.pos = [];
    this.uv = [];
    this.col = [];
  }
  // A quad from four corners given counter-clockwise as seen from the front.
  // `light` is one brightness, or four (one per corner) for shading into corners.
  quad(p, uv, light) {
    for (const k of [0, 1, 2, 0, 2, 3]) {
      const l = typeof light === 'number' ? light : light[k];
      this.pos.push(p[k][0], p[k][1], p[k][2]);
      this.uv.push(uv[k][0], uv[k][1]);
      this.col.push(l, l, l);
    }
  }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.computeBoundingSphere();
    return g;
  }
}

// Brightness 0..255 to a vertex color factor. DOOM's light curve is steep at the
// bottom: dark rooms are really dark.
const lightLevel = (l) => Math.pow(Math.max(0, Math.min(255, l)) / 255, 1.3);

export class LevelMeshes {
  constructor(level) {
    this.level = level;
    this.group = new THREE.Group();
    this.materials = new Map(); // `${tex}|${effect}` -> material
    this.effectMaterials = { none: [], flicker: [], strobe: [], glow: [] };
    this.doorMeshes = [];
    this.liftMeshes = [];
    const buckets = new Map();
    const bucket = (tex, effect) => {
      const key = `${tex}|${effect ?? 'none'}`;
      let b = buckets.get(key);
      if (!b) buckets.set(key, (b = new Bucket(tex, effect ?? 'none')));
      return b;
    };
    this.bucket = bucket;
    const S = level.S;

    for (let r = 0; r < level.h; r++) {
      for (let c = 0; c < level.w; c++) {
        const cell = level.cell(c, r);
        if (cell.kind === 'wall') continue;
        const L = lightLevel(cell.light);
        const fx = cell.effect;
        const fl = cell.floor; // lifts: their lowest position (the moving box covers the rest)
        const cl = cell.ceil;
        const x0 = c * S;
        const z0 = r * S;
        const x1 = x0 + S;
        const z1 = z0 + S;

        // Floor (a lift's floor is the top of its box) and ceiling.
        // Corners next to walls (or tall furniture) are darker: cheap ambient occlusion
        // for DOOM's gloomy corners.
        const shadeAt = (cc, rr) => {
          let n = 0;
          for (const [a, b] of [[cc - 1, rr - 1], [cc, rr - 1], [cc - 1, rr], [cc, rr]]) {
            const o = level.cell(a, b);
            if (!o || o.kind === 'wall' || o.floor > fl + 1) n++;
          }
          return L * (1 - 0.16 * n);
        };
        if (cell.kind !== 'lift') {
          const ao = [shadeAt(c, r + 1), shadeAt(c + 1, r + 1), shadeAt(c + 1, r), shadeAt(c, r)];
          bucket(cell.floorTex, fx).quad([[x0, fl, z1], [x1, fl, z1], [x1, fl, z0], [x0, fl, z0]], flatUV(x0, z0, x1, z1, true), ao);
        }
        let ceilTex = cell.kind === 'door' ? 'DOORTOP' : cell.ceilTex;
        if (cell.def?.lights && c % LIGHT_EVERY === 1 && r % LIGHT_EVERY === 1) ceilTex = 'LIGHTPANEL';
        bucket(ceilTex, fx).quad([[x0, cl, z0], [x1, cl, z0], [x1, cl, z1], [x0, cl, z1]], flatUV(x0, z0, x1, z1, false), ceilTex === 'LIGHTPANEL' ? Math.min(1.2, L * 1.25) : L * 0.9);

        // The four sides.
        for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nb = level.cell(c + dc, r + dr);
          const nx = -dc;
          const nz = -dr;
          const ex = (c + 0.5 + dc * 0.5) * S;
          const ez = (r + 0.5 + dr * 0.5) * S;
          const Lw = L * (nx !== 0 ? 0.86 : 1); // fake contrast
          if (!nb || nb.kind === 'wall') {
            let tex = nb?.wallTex ?? 'WINDOW';
            if (cell.kind === 'door') tex = 'DOORTRAK';
            else if (tex === 'DRYWALL' && cell.def?.walls) tex = cell.def.walls;
            const b = bucket(tex, tex === 'EXITSW' ? 'exit' : fx);
            wallQuad(b, ex, ez, nx, nz, S, fl, cl, false, Lw);
            continue;
          }
          if (nb.kind === 'lift' && cell.kind !== 'lift') continue; // the lift box draws its own sides
          const nf = nb.floor;
          const nc = nb.ceil;
          if (nf > fl) {
            const tex = nb.sideTex ?? cell.sideTex ?? 'STEP';
            wallQuad(bucket(tex, fx), ex, ez, nx, nz, S, fl, Math.min(nf, cl), false, Lw);
          }
          if (nc < cl) {
            const tex = cell.def?.walls ?? 'DRYWALL';
            wallQuad(bucket(tex, fx), ex, ez, nx, nz, S, Math.max(nc, fl), cl, true, Lw);
          }
        }
      }
    }

    for (const b of buckets.values()) {
      const mesh = new THREE.Mesh(b.geometry(), this.material(b.tex, b.effect));
      mesh.matrixAutoUpdate = false;
      this.group.add(mesh);
    }

    // Doors: a box filling the door cell that rises into the ceiling.
    for (const door of level.doors) {
      for (const j of door.cells) {
        const c = j % level.w;
        const r = (j / level.w) | 0;
        const cell = level.cells[j];
        const b = new Bucket(door.tex, cell.effect ?? 'none');
        boxFaces(b, c * S, r * S, S, door.floor, door.top, lightLevel(cell.light), 'DOORTOP');
        const mesh = new THREE.Mesh(b.geometry(), this.material(door.tex, b.effect));
        // The bottom face uses the door's own texture too (it's only seen while it rises).
        this.group.add(mesh);
        this.doorMeshes.push({ mesh, door });
      }
    }
    // Lifts: a box whose top is the lift floor.
    for (const lift of level.lifts) {
      for (const j of lift.cells) {
        const c = j % level.w;
        const r = (j / level.w) | 0;
        const cell = level.cells[j];
        const L = lightLevel(cell.light);
        const sides = new Bucket(cell.sideTex ?? 'LIFT', 'none');
        const top = new Bucket(cell.floorTex, 'none');
        const depth = lift.high - lift.low;
        boxFaces(sides, c * S, r * S, S, lift.high - depth, lift.high, L, null);
        const x0 = c * S;
        const z0 = r * S;
        top.quad([[x0, lift.high, z0 + S], [x0 + S, lift.high, z0 + S], [x0 + S, lift.high, z0], [x0, lift.high, z0]], flatUV(x0, z0, x0 + S, z0 + S, true), L);
        const mesh = new THREE.Group();
        mesh.add(new THREE.Mesh(sides.geometry(), this.material(sides.tex, 'none')));
        mesh.add(new THREE.Mesh(top.geometry(), this.material(top.tex, 'none')));
        this.group.add(mesh);
        this.liftMeshes.push({ mesh, lift });
      }
    }
  }

  material(tex, effect) {
    const key = `${tex}|${effect}`;
    let m = this.materials.get(key);
    if (!m) {
      m = new THREE.MeshBasicMaterial({ map: texture(tex), vertexColors: true });
      m.userData.effect = effect;
      this.materials.set(key, m);
      (this.effectMaterials[effect] ??= []).push(m);
    }
    return m;
  }

  // Moves doors and lifts to where the level says they are.
  sync() {
    for (const { mesh, door } of this.doorMeshes) mesh.position.y = door.pos;
    for (const { mesh, lift } of this.liftMeshes) mesh.position.y = lift.pos - lift.high;
  }

  // Flips every exit switch to its "on" picture.
  switchExit() {
    for (const m of this.effectMaterials.exit ?? []) m.map = texture('EXITSW_ON');
  }

  // Sets the brightness of each light effect: `levels` maps effect name -> factor, and
  // `boost` (muzzle flash) brightens everything.
  setLighting(levels, boost = 0) {
    for (const [effect, mats] of Object.entries(this.effectMaterials)) {
      const f = (levels[effect] ?? 1) + boost;
      for (const m of mats) m.color.setScalar(f);
    }
  }
}

function flatUV(x0, z0, x1, z1, floor) {
  const u0 = x0 / 2;
  const u1 = x1 / 2;
  const v0 = -z0 / 2;
  const v1 = -z1 / 2;
  return floor ? [[u0, v1], [u1, v1], [u1, v0], [u0, v0]] : [[u0, v0], [u1, v0], [u1, v1], [u0, v1]];
}

// A wall face on the edge at (ex, ez) whose normal is (nx, nz), from y0 to y1. Textures
// repeat every 2 units across and 4 up, anchored at the bottom (or at the top for
// `fromTop`, so the strip above a door lines up with the ceiling).
function wallQuad(b, ex, ez, nx, nz, S, y0, y1, fromTop, light) {
  if (y1 <= y0) return;
  const rx = nz; // "right" as seen from the front
  const rz = -nx;
  const h = S / 2;
  const ax = ex - rx * h;
  const az = ez - rz * h;
  const bx = ex + rx * h;
  const bz = ez + rz * h;
  const along = (x, z) => (nx !== 0 ? -nx * z : nz * x) / 2; // u in texture repeats, left to right
  const ua = along(ax, az);
  const ub = along(bx, bz);
  const vb = fromTop ? 1 - (y1 - y0) / 4 : 0;
  const vt = fromTop ? 1 : (y1 - y0) / 4;
  const v0 = fromTop ? vb : y0 / 4 - Math.floor(y0 / 4);
  const v1 = fromTop ? vt : v0 + (y1 - y0) / 4;
  // Walls darken a little towards the floor.
  const low = light * (y1 - y0 > 1.2 ? 0.78 : 0.9);
  b.quad([[ax, y0, az], [bx, y0, bz], [bx, y1, bz], [ax, y1, az]], [[ua, v0], [ub, v0], [ub, v1], [ua, v1]], [low, low, light, light]);
}

// The four outward sides of a cell-sized box from y0 to y1, plus its bottom (with
// `bottomTex` ignored: it shares the side texture) for doors seen from below.
function boxFaces(b, x0, z0, S, y0, y1, light, bottomTex) {
  const cx = x0 + S / 2;
  const cz = z0 + S / 2;
  for (const [nx, nz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    wallQuad(b, cx + (nx * S) / 2, cz + (nz * S) / 2, nx, nz, S, y0, y1, false, light * (nx !== 0 ? 0.86 : 1));
  }
  if (bottomTex) {
    const x1 = x0 + S;
    const z1 = z0 + S;
    b.quad([[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]], [[0, 0], [1, 0], [1, 0.5], [0, 0.5]], light * 0.8);
  }
}
