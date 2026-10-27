// The level: the map file (maps/*.json) turned into a grid of cells, plus the parts
// that move (doors and lifts) and the questions the rest of the game asks about space:
// how high is the floor here, can something this tall stand here, what does this ray hit.
//
// Like DOOM, the world is "2.5D": every open cell has one floor height and one ceiling
// height. A door is a cell whose ceiling rises; a lift is a cell whose floor moves.
// Scene units: x = column * cellSize, z = row * cellSize (north is -z), y is up.

export const STEP_HEIGHT = 0.75; // highest ledge you can walk up onto
export const DOOR_SPEED = 6; // units per second
export const DOOR_WAIT = 4; // seconds a door stays open
export const LIFT_SPEED = 4;
const USE_RANGE = 2.8;

export class Level {
  constructor(data) {
    this.data = data;
    this.name = data.name ?? 'Untitled';
    this.par = data.par ?? 0;
    this.S = data.cellSize ?? 2;
    const rows = data.map;
    this.h = rows.length;
    this.w = Math.max(...rows.map((r) => r.length));
    const n = this.w * this.h;
    this.cells = new Array(n);
    this.floor = new Float32Array(n);
    this.ceil = new Float32Array(n);
    this.doors = [];
    this.lifts = [];
    this.doorOf = new Int16Array(n).fill(-1);
    this.liftOf = new Int16Array(n).fill(-1);
    this.secretOf = new Int16Array(n).fill(-1);
    this.secrets = [];

    for (let r = 0; r < this.h; r++) {
      for (let c = 0; c < this.w; c++) {
        const ch = rows[r][c] ?? ' ';
        const def = data.tiles[ch];
        const i = this.idx(c, r);
        if (!def) {
          if (ch !== ' ') console.warn(`Map: no tile "${ch}" at column ${c}, row ${r}; treating it as a wall`);
          this.cells[i] = { ch, kind: 'wall', wallTex: 'DRYWALL' };
          continue;
        }
        const kind = def.wall ? 'wall' : def.door ? 'door' : def.lift ? 'lift' : 'open';
        this.cells[i] = { ch, kind, def, wallTex: def.wall, floor: def.floor, ceil: def.ceil, light: def.light, floorTex: def.floorTex, ceilTex: def.ceilTex, sideTex: def.sideTex, effect: def.effect };
      }
    }
    this.inherit();
    this.buildMovers();
    this.findSecrets();
    this.things = [];
    for (let r = 0; r < (data.things?.length ?? 0); r++) {
      const row = data.things[r];
      for (let c = 0; c < row.length; c++) {
        const ch = row[c];
        if (ch === '.' || ch === ' ') continue;
        const def = data.thingTypes?.[ch];
        if (!def) {
          console.warn(`Map: no thing type "${ch}" at column ${c}, row ${r}`);
          continue;
        }
        this.things.push({ ...def, ch, c, r, x: (c + 0.5) * this.S, z: (r + 0.5) * this.S });
      }
    }
  }

  idx(c, r) {
    return r * this.w + c;
  }
  inside(c, r) {
    return c >= 0 && r >= 0 && c < this.w && r < this.h;
  }
  cell(c, r) {
    return this.inside(c, r) ? this.cells[this.idx(c, r)] : null;
  }
  isWall(c, r) {
    const cell = this.cell(c, r);
    return !cell || cell.kind === 'wall';
  }
  col(x) {
    return Math.floor(x / this.S);
  }

  // Cells that leave out a height, light or texture (desks, doors, lifts) take it from the
  // nearest neighbouring room, so a desk in the bullpen gets the bullpen's ceiling.
  inherit() {
    const fields = ['ceil', 'floor', 'light', 'ceilTex', 'floorTex', 'effect'];
    for (let pass = 0; pass < 4; pass++) {
      for (let r = 0; r < this.h; r++) {
        for (let c = 0; c < this.w; c++) {
          const cell = this.cells[this.idx(c, r)];
          if (cell.kind === 'wall') continue;
          for (const f of fields) {
            if (cell[f] !== undefined && cell[f] !== null) continue;
            if (f === 'effect' && cell.def.light !== undefined) continue; // light and effect go together
            for (const [dc, dr] of DIRS) {
              const nb = this.cell(c + dc, r + dr);
              if (!nb || nb.kind === 'wall' || nb.kind === 'door') continue;
              if (nb[f] !== undefined && nb[f] !== null) {
                cell[f] = nb[f];
                break;
              }
            }
          }
        }
      }
    }
    for (let i = 0; i < this.cells.length; i++) {
      const cell = this.cells[i];
      if (cell.kind === 'wall') continue;
      cell.floor ??= 0;
      cell.ceil ??= 4;
      cell.light ??= 160;
      cell.floorTex ??= 'CARPET';
      cell.ceilTex ??= 'CEILING';
      cell.effect ??= null;
      this.floor[i] = cell.floor;
      this.ceil[i] = cell.ceil;
    }
  }

  // Groups neighbouring door cells (double doors) and lift cells into movers.
  buildMovers() {
    const seen = new Uint8Array(this.cells.length);
    for (let i = 0; i < this.cells.length; i++) {
      const cell = this.cells[i];
      if (seen[i] || (cell.kind !== 'door' && cell.kind !== 'lift')) continue;
      const group = this.flood(i, (j) => this.cells[j].kind === cell.kind && this.cells[j].ch === cell.ch, seen);
      if (cell.kind === 'door') {
        const def = cell.def;
        let top = Infinity;
        for (const j of group) {
          const c = j % this.w;
          const r = (j / this.w) | 0;
          for (const [dc, dr] of DIRS) {
            const nb = this.cell(c + dc, r + dr);
            if (nb && (nb.kind === 'open' || nb.kind === 'lift')) top = Math.min(top, nb.ceil);
          }
        }
        if (!isFinite(top)) top = cell.floor + 3;
        // Ordinary doors are 3 tall (a lintel above); secret doors fill the whole wall.
        const openH = def.secret ? top : Math.min(top, cell.floor + 3);
        const id = this.doors.length;
        const door = { id, cells: group, key: def.key ?? null, secret: !!def.secret, tex: def.door, floor: cell.floor, top: openH, pos: 0, state: 'closed', wait: 0, opened: false };
        this.doors.push(door);
        for (const j of group) {
          this.doorOf[j] = id;
          this.cells[j].ceil = openH; // the static ceiling above the door slot
          this.ceil[j] = this.floor[j]; // closed
        }
      } else {
        const def = cell.def;
        const low = cell.floor;
        const high = def.lift.high ?? low + 2;
        const id = this.lifts.length;
        const lift = { id, cells: group, low, high, pos: high, state: 'up', wait: 0, waitTime: def.lift.wait ?? 3 };
        this.lifts.push(lift);
        for (const j of group) {
          this.liftOf[j] = id;
          this.floor[j] = high;
        }
      }
    }
  }

  // Each connected patch of secret floor is one secret.
  findSecrets() {
    const seen = new Uint8Array(this.cells.length);
    for (let i = 0; i < this.cells.length; i++) {
      const cell = this.cells[i];
      if (seen[i] || !cell.def?.secret || cell.kind !== 'open') continue;
      const group = this.flood(i, (j) => this.cells[j].kind === 'open' && !!this.cells[j].def?.secret, seen);
      const id = this.secrets.length;
      this.secrets.push({ id, cells: group, found: false });
      for (const j of group) this.secretOf[j] = id;
    }
  }

  flood(start, match, seen) {
    const out = [];
    const stack = [start];
    seen[start] = 1;
    while (stack.length) {
      const j = stack.pop();
      out.push(j);
      const c = j % this.w;
      const r = (j / this.w) | 0;
      for (const [dc, dr] of DIRS) {
        if (!this.inside(c + dc, r + dr)) continue;
        const k = this.idx(c + dc, r + dr);
        if (!seen[k] && match(k)) {
          seen[k] = 1;
          stack.push(k);
        }
      }
    }
    return out;
  }

  // --- Space queries -------------------------------------------------------------------

  // Highest floor and lowest ceiling under a circle, or null if it overlaps a wall.
  span(x, z, radius) {
    const S = this.S;
    const c0 = Math.floor((x - radius) / S);
    const c1 = Math.floor((x + radius) / S);
    const r0 = Math.floor((z - radius) / S);
    const r1 = Math.floor((z + radius) / S);
    let floor = -Infinity;
    let ceil = Infinity;
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        if (this.isWall(c, r)) return null;
        const i = this.idx(c, r);
        if (this.floor[i] > floor) floor = this.floor[i];
        if (this.ceil[i] < ceil) ceil = this.ceil[i];
      }
    }
    return { floor, ceil };
  }

  // Can a body of this radius and height, now standing at `feet`, move to (x, z)?
  // `step` is how high a ledge it can climb.
  fits(x, z, radius, height, feet, step = STEP_HEIGHT) {
    const s = this.span(x, z, radius);
    if (!s) return false;
    if (s.floor > feet + step) return false;
    if (s.ceil - Math.max(s.floor, feet) < height) return false;
    return true;
  }

  floorAt(x, z) {
    const c = this.col(x);
    const r = this.col(z);
    return this.isWall(c, r) ? 0 : this.floor[this.idx(c, r)];
  }

  cellAtPoint(x, z) {
    return this.cell(this.col(x), this.col(z));
  }

  // Traces a ray from (x, y, z) along (dx, dy, dz) (dx, dz need not be normalised with
  // dy; the ray is p + t * d) up to maxT. Returns { t, x, y, z, nx, nz, cell, kind } for the
  // first wall, floor, ceiling or ledge it hits, or null.
  trace(x, y, z, dx, dy, dz, maxT) {
    const S = this.S;
    let c = Math.floor(x / S);
    let r = Math.floor(z / S);
    const stepC = dx > 0 ? 1 : -1;
    const stepR = dz > 0 ? 1 : -1;
    const tDeltaC = dx !== 0 ? Math.abs(S / dx) : Infinity;
    const tDeltaR = dz !== 0 ? Math.abs(S / dz) : Infinity;
    let tMaxC = dx !== 0 ? ((dx > 0 ? (c + 1) * S - x : x - c * S) / Math.abs(dx)) : Infinity;
    let tMaxR = dz !== 0 ? ((dz > 0 ? (r + 1) * S - z : z - r * S) / Math.abs(dz)) : Infinity;
    let tEnter = 0;
    let nx = 0;
    let nz = 0;
    for (let guard = 0; guard < 512; guard++) {
      if (this.isWall(c, r)) return this.hit(x, y, z, dx, dy, dz, tEnter, nx, nz, 0, c, r, 'wall');
      const i = this.idx(c, r);
      const fl = this.floor[i];
      const cl = this.ceil[i];
      const yIn = y + dy * tEnter;
      // Entering at a height outside this cell's opening: hit its step or upper wall.
      if (yIn < fl || yIn > cl) return this.hit(x, y, z, dx, dy, dz, tEnter, nx, nz, 0, c, r, yIn < fl ? 'step' : 'upper');
      const tExit = Math.min(tMaxC, tMaxR, maxT);
      const yOut = y + dy * tExit;
      if (yOut < fl) return this.hit(x, y, z, dx, dy, dz, (fl - y) / dy, 0, 0, 1, c, r, 'floor');
      if (yOut > cl) return this.hit(x, y, z, dx, dy, dz, (cl - y) / dy, 0, 0, -1, c, r, 'ceil');
      if (tExit >= maxT) return null;
      tEnter = tExit;
      if (tMaxC < tMaxR) {
        c += stepC;
        tMaxC += tDeltaC;
        nx = -stepC;
        nz = 0;
      } else {
        r += stepR;
        tMaxR += tDeltaR;
        nx = 0;
        nz = -stepR;
      }
    }
    return null;
  }

  hit(x, y, z, dx, dy, dz, t, nx, nz, ny, c, r, kind) {
    return { t, x: x + dx * t, y: y + dy * t, z: z + dz * t, nx, ny, nz, c, r, kind, cell: this.cell(c, r) };
  }

  // Is there a clear line between two points (eye to eye)?
  sight(x0, y0, z0, x1, y1, z1) {
    return !this.trace(x0, y0, z0, x1 - x0, y1 - y0, z1 - z0, 1);
  }

  // --- Doors, lifts, switches ------------------------------------------------------------

  // The player pressed Use at (x, z) facing `yaw`. Returns what happened, for messages and
  // sounds: { door, lift, exit, locked } or null. `keys` is a Set of badge colours.
  use(x, z, feet, yaw, keys) {
    const dx = -Math.sin(yaw);
    const dz = -Math.cos(yaw);
    // Standing on a lift works it too.
    const under = this.liftOf[this.idx(this.col(x), this.col(z))];
    for (let t = 0.2; t <= USE_RANGE; t += 0.2) {
      const c = this.col(x + dx * t);
      const r = this.col(z + dz * t);
      const i = this.idx(c, r);
      const cell = this.cells[i];
      if (!cell) return null;
      if (cell.kind === 'door') {
        const door = this.doors[this.doorOf[i]];
        if (door.key && !keys.has(door.key)) return { locked: door.key, door };
        return this.openDoor(door) ? { door } : null;
      }
      if (cell.kind === 'lift') {
        const lift = this.lifts[this.liftOf[i]];
        if (lift.pos > feet + STEP_HEIGHT || under === lift.id) return this.lower(lift) ? { lift } : null;
        continue;
      }
      if (cell.kind === 'wall') {
        if (cell.def?.exit) return { exit: true, c, r };
        break;
      }
      if (this.floor[i] > feet + STEP_HEIGHT || this.ceil[i] < feet + 1.2) break;
    }
    if (under >= 0) return this.lower(this.lifts[under]) ? { lift: this.lifts[under] } : null;
    return null;
  }

  openDoor(door) {
    if (door.state === 'open') {
      door.wait = DOOR_WAIT;
      return false;
    }
    if (door.state === 'opening') return false;
    door.state = 'opening';
    door.opened = true;
    return true;
  }

  lower(lift) {
    if (lift.state !== 'up') return false;
    lift.state = 'down';
    return true;
  }

  // Moves doors and lifts. `occupied(cellIndex)` says whether a body stands in a cell
  // (a closing door bounces back open; a lift waits).
  update(dt, occupied) {
    const events = [];
    for (const door of this.doors) {
      const h = door.top - door.floor;
      if (door.state === 'opening') {
        door.pos = Math.min(h, door.pos + DOOR_SPEED * dt);
        if (door.pos >= h) {
          door.state = door.secret ? 'stuck' : 'open';
          door.wait = DOOR_WAIT;
        }
      } else if (door.state === 'open') {
        door.wait -= dt;
        if (door.wait <= 0) {
          if (door.cells.some(occupied)) door.wait = 0.5;
          else {
            door.state = 'closing';
            events.push({ type: 'doorClose', door });
          }
        }
      } else if (door.state === 'closing') {
        if (door.cells.some(occupied) && door.pos < h) {
          door.state = 'opening';
          events.push({ type: 'doorOpen', door });
        } else {
          door.pos = Math.max(0, door.pos - DOOR_SPEED * dt);
          if (door.pos <= 0) door.state = 'closed';
        }
      }
      for (const j of door.cells) this.ceil[j] = door.floor + door.pos;
    }
    for (const lift of this.lifts) {
      if (lift.state === 'down') {
        lift.pos = Math.max(lift.low, lift.pos - LIFT_SPEED * dt);
        if (lift.pos <= lift.low) {
          lift.state = 'waiting';
          lift.wait = lift.waitTime;
          events.push({ type: 'liftStop', lift });
        }
      } else if (lift.state === 'waiting') {
        lift.wait -= dt;
        if (lift.wait <= 0) {
          lift.state = 'rising';
          events.push({ type: 'liftStart', lift });
        }
      } else if (lift.state === 'rising') {
        lift.pos = Math.min(lift.high, lift.pos + LIFT_SPEED * dt);
        if (lift.pos >= lift.high) {
          lift.state = 'up';
          events.push({ type: 'liftStop', lift });
        }
      }
      for (const j of lift.cells) this.floor[j] = lift.pos;
    }
    return events;
  }

  // The secret (if any) whose floor (x, z) is on.
  secretAt(x, z) {
    const c = this.col(x);
    const r = this.col(z);
    if (!this.inside(c, r)) return null;
    const s = this.secretOf[this.idx(c, r)];
    return s >= 0 ? this.secrets[s] : null;
  }
}

export const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

// Loads a map by name: the copy built into the page (index.html) if there is one,
// otherwise maps/<name>.json. Or pass a `url` to load any map file.
export async function loadLevelData(name = 'e1m1', url = null) {
  if (!url && globalThis.__DOOM_MAPS__?.[name]) return globalThis.__DOOM_MAPS__[name];
  const src = url ?? `maps/${name}.json`;
  const res = await fetch(src);
  if (!res.ok) throw new Error(`Couldn't load the map ${src} (${res.status})`);
  return res.json();
}
