// The users, as DOOM monsters. Each one is the 3D game's model (src/render/models.js),
// baked into an 8-direction sprite sheet when the level loads (sprites.js), driven by a
// small DOOM-style brain:
//
//   idle    standing around until it sees you (in front of it, or anywhere close by) or
//           hears a weapon go off in a room connected to its own;
//   chase   walks towards its target along a flow field (a breadth-first search out from
//           the player through open cells, doors and lifts), opening ordinary doors;
//   attack  winds up, then hits, throws or shoots;
//   pain    flinches when hurt (a chance per hit);
//   dead    falls over and stays on the floor as a corpse.
//
// A user hurt by a different kind of user turns on them (DOOM's infighting). Behaviors
// come from data/enemies.js: melee, missile, hitscan, charge, explode, summon, teleport,
// aura and onDeath.

import * as THREE from 'three';
import { ENEMIES, DECOR } from '../data/enemies.js';
import { ENEMIES as BASE } from '../shared/data/enemies.js';
import { USER_MODELS, createExecutiveModel, createTakeoverModel, createSubsidiaryModel, toonMaterial, box, cyl, ball, merge } from '../shared/src/render/models.js';
import { Billboard, bake, viewIndex } from './sprites.js';
import { STEP_HEIGHT, DIRS } from './level.js';
import { play, voice } from './audio.js';

const rand = ([a, b]) => a + Math.random() * (b - a);
const angleTo = (fx, fz, tx, tz) => Math.atan2(-(tx - fx), -(tz - fz)); // game yaw (forward = -z)
const SIGHT_RANGE = 70;
const CLOSE_RANGE = 5; // sees you from any side this close
const THINK = 0.2; // seconds between idle looks
const POSES = { walk1: 0, walk2: 1, attack: 2, pain: 3 };
const DEATH_FRAMES = 4;
const FLOW_EVERY = 0.3;
const MAX_DROP = 3; // the furthest users will drop off a ledge

// --- Sprites ----------------------------------------------------------------------------

const sheets = new Map(); // type -> { live, dead }

// The 3D game's bosses with moving parts: legs, and one set of arms per pose (walking,
// attacking, and a third pose used here for pain).
const BOSSES = { executive: createExecutiveModel, takeover: createTakeoverModel, subsidiary: createSubsidiaryModel };

function modelFor(def) {
  if (def.model.boss) {
    const m = BOSSES[def.model.boss]();
    return {
      root: m.root,
      pose(p) {
        const swing = p === POSES.walk1 ? 0.5 : p === POSES.walk2 ? -0.5 : 0;
        m.legL.rotation.x = swing;
        m.legR.rotation.x = -swing;
        const arm = p === POSES.attack ? 1 : p === POSES.pain ? 2 : 0;
        m.arms.forEach((a, i) => (a.visible = i === arm));
        m.mouths[0].visible = p < POSES.attack;
        m.mouths[1].visible = p >= POSES.attack;
        m.body.rotation.x = p === POSES.pain ? -0.15 : 0;
      },
      body: m.body,
    };
  }
  let geo;
  if (def.model.user) geo = USER_MODELS[def.model.user]();
  else geo = PROPS[def.model.prop]();
  const mesh = new THREE.Mesh(geo, toonMaterial);
  const body = new THREE.Group();
  body.add(mesh);
  const root = new THREE.Group();
  root.add(body);
  return {
    root,
    body,
    // Merged models have no limbs, so a walk is a waddle and an attack is a lunge.
    pose(p) {
      body.rotation.set(0, 0, 0);
      body.position.set(0, 0, 0);
      if (p === POSES.walk1) body.rotation.z = 0.09;
      if (p === POSES.walk2) {
        body.rotation.z = -0.09;
        body.position.y = 0.04;
      }
      if (p === POSES.attack) {
        body.rotation.x = 0.3;
        body.position.z = 0.1;
      }
      if (p === POSES.pain) body.rotation.x = -0.25;
    },
  };
}

// The barrel and decorations, built like the 3D game's props.
const PROPS = {
  ups: () => merge([
    box(0.7, 1.0, 0.6, '#36363b', 0, 0, 0),
    box(0.74, 0.06, 0.64, '#4b4b52', 0, 1.0, 0),
    box(0.2, 0.12, 0.02, '#38b764', -0.15, 0.78, 0.3),
    box(0.25, 0.04, 0.02, '#94b0c2', 0.15, 0.82, 0.3),
    box(0.25, 0.04, 0.02, '#94b0c2', 0.15, 0.74, 0.3),
    box(0.56, 0.3, 0.02, '#ffcd75', 0, 0.2, 0.3), // HIGH VOLTAGE sticker
    ball(0.28, '#4b4b52', 0, 0.98, 0, 1), // swollen
  ]),
  plant: () => merge([
    cyl(0.3, 0.22, 0.5, '#5d3a1a', 0, 0, 0, 7),
    cyl(0.31, 0.31, 0.05, '#4a2e14', 0, 0.48, 0, 7),
    ball(0.45, '#38b764', 0, 0.95, 0),
    ball(0.32, '#2a8a4a', 0.2, 1.3, -0.1),
    ball(0.28, '#4fcf7a', -0.18, 1.25, 0.12),
  ]),
  waterCooler: () => merge([
    box(0.5, 0.95, 0.46, '#f4f4f4', 0, 0, 0),
    box(0.5, 0.06, 0.46, '#94b0c2', 0, 0.95, 0),
    box(0.12, 0.08, 0.06, '#41a6f6', -0.1, 0.62, 0.25),
    box(0.12, 0.08, 0.06, '#b13e53', 0.1, 0.62, 0.25),
    cyl(0.2, 0.22, 0.5, '#7fc4f0', 0, 1.01, 0, 8),
    cyl(0.08, 0.2, 0.1, '#7fc4f0', 0, 1.51, 0, 8),
  ]),
};

// Bakes a type's sheets once: 8 views x 4 poses alive, and one view of it falling over.
export function sheetsFor(gl, type) {
  if (sheets.has(type)) return sheets.get(type);
  const def = ENEMIES[type] ?? DECOR[type];
  const still = !!def.barrel || !!def.crate || !!DECOR[type];
  const m = modelFor(def.model ? def : { model: { prop: def.prop } });
  const views = still ? 1 : 8;
  const pixels = def.boss ? 96 : 56;
  const poses = still ? [() => {}] : [0, 1, 2, 3].map((p) => () => m.pose(p));
  const live = bake(gl, m.root, { views, poses, pixels });
  let dead = null;
  if (!still) {
    // Falls over sideways (as seen from the front), with a little sink at the end.
    const fall = [0.45, 0.95, 1.4, Math.PI / 2].map((a, i) => () => {
      m.pose(POSES.pain);
      m.root.rotation.z = a;
      m.root.position.y = i === DEATH_FRAMES - 1 ? -0.05 : 0;
      // The fall pivots on a foot so the body stays above the floor.
      m.root.position.x = -Math.sin(a) * 0.15;
    });
    dead = bake(gl, m.root, { views: 1, poses: fall, pixels });
    m.root.rotation.z = 0;
    m.root.position.set(0, 0, 0);
  }
  const s = { live, dead };
  sheets.set(type, s);
  return s;
}

// --- Monsters -----------------------------------------------------------------------------

let nextId = 1;

export class Monster {
  constructor(game, type, x, z, { facing = Math.random() * Math.PI * 2, awake = false, summoned = false } = {}) {
    const def = ENEMIES[type];
    this.id = nextId++;
    this.type = type;
    this.def = def;
    this.name = def.name ?? BASE[def.from]?.name ?? type;
    this.particle = BASE[def.from]?.particle ?? ['#b13e53', '#f4f4f4'];
    if (def.barrel) this.particle = ['#4b4b52', '#ffcd75'];
    this.monster = !def.barrel && !def.crate;
    this.barrel = !!def.barrel || !!def.crate; // things, not people: no brain
    this.enraged = false;
    this.counts = def.counts !== false && !summoned;
    this.x = x;
    this.z = z;
    this.feet = game.level.span(x, z, def.radius)?.floor ?? game.level.floorAt(x, z);
    this.vy = 0;
    this.radius = def.radius;
    this.scale = def.scale ?? 1;
    this.hp = def.hp;
    this.solid = true;
    this.shootable = true;
    this.dead = false;
    this.splashImmune = !!def.splashImmune;
    this.facing = facing; // model angle: 0 faces +z
    this.state = awake ? 'chase' : 'idle';
    this.target = awake ? game.player : null;
    this.t = 0; // time left in the current state
    this.think = Math.random() * THINK;
    this.cool = 0.5 + Math.random(); // until the next ranged attack may start
    this.meleeCool = 0;
    this.chargeCool = def.charge ? def.charge.every * Math.random() : 0;
    this.summonCool = def.summon ? def.summon.every * 0.5 : 0;
    this.teleportCool = 0;
    this.walk = Math.random();
    this.moving = false;
    this.flash = 0;
    this.auraT = 0;
    this.stuck = 0;
    this.detour = null;
    this.deathT = 0;
    this.phase = 0;
    this.minions = [];
    this.heard = -1;
    this.skillFast = !!game.skillDef?.fast;
    const s = sheetsFor(game.renderer.gl, type);
    this.sheet = s.live;
    this.deadSheet = s.dead;
    this.height = Math.min(this.sheet.height * this.scale * 0.95, this.barrel ? 1.1 : 3.4);
    this.bb = new Billboard(this.sheet.texture, this.sheet.width * this.scale, this.sheet.height * this.scale);
    game.scene.add(this.bb.mesh);
  }

  get eye() {
    return this.feet + this.height * 0.8;
  }

  // --- Being hurt ---------------------------------------------------------------------------

  hurt(amount, source, game) {
    if (this.dead || amount <= 0) return;
    // Users don't hurt their own kind with what they throw (as in DOOM).
    if (source?.monster && source !== this && (source.type === this.type || (this.def.pair && source.def.pair === this.def.pair))) return;
    this.hp -= amount;
    this.flash = 0.12;
    if (source && source !== this) this.lastAttacker = source;
    if (this.hp <= 0) {
      this.die(game, source);
      return;
    }
    if (this.barrel) return;
    // Infighting: turn on whoever hurt you, unless it's your own kind.
    if (source && source !== this && !source.dead && (source === game.player || source.monster)) {
      if (this.target !== source && (source !== game.player || this.state === 'idle' || this.target?.dead)) {
        this.target = source;
      }
      if (this.state === 'idle') this.wake(game, source, false);
    }
    // Boss phases.
    const phases = this.def.phases;
    if (phases && this.phase < phases.length && this.hp / this.def.hp <= phases[this.phase].at) {
      const ph = phases[this.phase];
      game.hud.message(ph.banner);
      if (ph.spawn) {
        const m = game.spawnMonster(ph.spawn, this.x + Math.sin(this.facing + 1.6) * 2.5, this.z + Math.cos(this.facing + 1.6) * 2.5, { awake: true, summoned: true });
        if (m) {
          m.target = game.player;
          game.particles.burst(m.x, m.feet + 1.5, m.z, m.particle, 20, 4);
        }
      }
      this.phase++;
      this.cool = 0;
      play('powerUp', this.x, this.z);
    }
    if (this.def.teleport && this.teleportCool <= 0 && Math.random() < 0.6) this.teleport(game);
    else if (Math.random() < this.def.painChance && this.state !== 'charge') {
      this.state = 'pain';
      this.t = 0.22;
      voice('pain', this.def.voice, this.x, this.z, 0.7);
    }
  }

  die(game, killer) {
    this.dead = true;
    this.solid = false;
    this.shootable = false;
    this.state = 'dead';
    this.deathT = 0;
    if (this.counts) game.stats.kills++;
    const def = this.def;
    const cy = this.feet + this.height * 0.5;
    if (def.barrel) {
      // A swollen UPS goes off a moment after it's hit, credited to whoever did it.
      this.fuse = 0.15;
      this.killer = killer;
      return;
    }
    if (def.crate) {
      // A moving box: splinters, and whatever was inside falls out.
      game.particles.burst(this.x, this.feet + 0.4, this.z, ['#a0703c', '#5d3a1a', '#ffcd75'], 14, 3);
      play('thud', this.x, this.z);
      const loot = def.crate.loot;
      game.addPickup(loot[Math.floor(Math.random() * loot.length)], this.x, this.z, { dropped: true });
      this.removeSprite(game);
      return;
    }
    voice('death', def.voice, this.x, this.z);
    // Pairs: the others nearby take it personally.
    if (def.pair) {
      for (const m of game.actors) {
        if (m === this || m.dead || m.def?.pair !== def.pair || Math.hypot(m.x - this.x, m.z - this.z) > 20) continue;
        m.enraged = true;
        if (m.state === 'idle') m.wake(game, game.player);
        voice('sight', m.def.voice, m.x, m.z);
      }
    }
    game.particles.burst(this.x, cy, this.z, this.particle, def.boss ? 40 : 14, def.boss ? 6 : 3);
    if (def.explode) this.blowUp(game, this);
    if (def.onDeath) {
      for (let i = 0; i < def.onDeath.count; i++) {
        const a = (i / def.onDeath.count) * Math.PI * 2 + Math.random();
        const m = game.spawnMonster(def.onDeath.spawn, this.x + Math.sin(a) * 0.7, this.z + Math.cos(a) * 0.7, { awake: true, summoned: true });
        if (m && killer && !killer.dead) m.target = killer;
      }
    }
    if (def.drops) game.addPickup(def.drops, this.x, this.z, { dropped: true });
    for (const m of this.minions) if (!m.dead) m.target = m.target === this ? game.player : m.target;
    if (def.boss) {
      game.hud.message(`${this.name.toUpperCase()} HAS LEFT THE MEETING.`);
      game.particles.explosion(this.x, cy, this.z, 3, ['#29366f', '#b13e53', '#ffcd75', '#f4f4f4']);
      play('bfgBoom', this.x, this.z);
      game.lightBoost = Math.max(game.lightBoost, 0.6);
    }
  }

  blowUp(game, source) {
    const ex = this.def.explode;
    const y = this.feet + 0.6;
    game.particles.explosion(this.x, y, this.z, ex.radius * 0.5, ['#ffcd75', '#ef7d57', '#b13e53', '#333c57']);
    play('explode', this.x, this.z);
    game.lightBoost = Math.max(game.lightBoost, 0.35);
    game.radiusDamage(this.x, y, this.z, ex.radius, ex.damage, source);
  }

  wake(game, target = game.player, shout = true) {
    if (this.state !== 'idle' || this.barrel) return;
    this.state = 'chase';
    this.target = target;
    this.cool = Math.max(this.cool, 0.4 + Math.random() * 0.6);
    if (shout) voice('sight', this.def.voice, this.x, this.z);
  }

  // --- Each tick ----------------------------------------------------------------------------

  update(dt, game) {
    if (this.flash > 0) this.flash -= dt;
    if (this.dead) {
      this.deathT += dt;
      if (this.fuse !== undefined && this.fuse > 0) {
        this.fuse -= dt;
        if (this.fuse <= 0) {
          this.blowUp(game, this.killer ?? this);
          this.removeSprite(game);
        }
      }
      this.fall(dt, game);
      return;
    }
    if (this.barrel) return;
    this.cool -= dt * (this.enraged ? 1.6 : 1);
    this.meleeCool -= dt;
    this.chargeCool -= dt;
    this.summonCool -= dt;
    this.teleportCool -= dt;
    this.auraT -= dt;
    this.t -= dt;
    if (this.target && (this.target.dead || this.target.removed)) this.target = game.player.dead ? null : game.player;
    if (!this.target && this.state !== 'idle') this.state = 'idle';

    switch (this.state) {
      case 'idle':
        this.idle(dt, game);
        break;
      case 'chase':
        this.chase(dt, game);
        break;
      case 'attack':
        this.face(this.target);
        if (this.t <= 0) this.strike(game);
        break;
      case 'pain':
        if (this.t <= 0) this.state = 'chase';
        break;
      case 'charge':
        this.charging(dt, game);
        break;
    }
    if (this.def.aura) this.spreadAura(game);
    const tg = this.def.tailgate;
    if (tg && Math.hypot(game.player.x - this.x, game.player.z - this.z) < tg.radius) game.tailgate = { t: 0.2, slow: tg.slow };
    this.fall(dt, game);
  }

  idle(dt, game) {
    this.moving = false;
    this.think -= dt;
    if (this.think > 0) return;
    this.think = THINK;
    const pl = game.player;
    if (pl.dead) return;
    // Heard a weapon?
    const noise = game.lastNoise;
    if (noise && noise.id !== this.heard) {
      this.heard = noise.id;
      if (game.heardAt(this.x, this.z)) return this.wake(game, pl);
    }
    if (this.sees(game, pl, true)) this.wake(game, pl);
  }

  // Line of sight to `t` (in front only, unless close or `anyDir` is false).
  sees(game, t, frontOnly = false) {
    const dx = t.x - this.x;
    const dz = t.z - this.z;
    const d = Math.hypot(dx, dz);
    if (d > SIGHT_RANGE) return false;
    if (frontOnly && d > CLOSE_RANGE) {
      let a = Math.atan2(dx, dz) - this.facing;
      a = Math.atan2(Math.sin(a), Math.cos(a));
      if (Math.abs(a) > Math.PI / 2) return false;
    }
    const ty = t === game.player ? t.eye : t.feet + t.height * 0.7;
    return game.level.sight(this.x, this.eye, this.z, t.x, ty, t.z);
  }

  face(t) {
    if (t) this.facing = Math.atan2(t.x - this.x, t.z - this.z);
  }

  speed(game) {
    let s = this.def.speed;
    if (this.skillFast) s *= 1.35;
    if (this.auraT > 0) s *= this.auraMul;
    if (this.enraged) s *= 1.5;
    return s;
  }

  chase(dt, game) {
    const t = this.target;
    const def = this.def;
    const dx = t.x - this.x;
    const dz = t.z - this.z;
    const dist = Math.hypot(dx, dz);
    const reach = this.radius + (t.radius ?? 0.5);
    const visible = this.sees(game, t);

    // Walk-ups go off on contact.
    if (def.explode && dist < reach + 0.5 && Math.abs(t.feet - this.feet) < 1.5) {
      this.hp = 0;
      this.die(game, this);
      return;
    }
    // Close enough to hit?
    if (def.melee && dist < reach + def.melee.range && this.meleeCool <= 0 && Math.abs(t.feet - this.feet) < 1.5) {
      return this.begin('melee', def.melee.time);
    }
    if (visible) {
      if (def.charge && this.chargeCool <= 0 && dist < def.charge.range && dist > reach + 1.5) {
        this.state = 'charge';
        this.t = def.charge.time;
        this.face(t);
        this.chargeDir = { x: dx / dist, z: dz / dist };
        this.chargeHit = false;
        voice('attack', def.voice, this.x, this.z);
        return;
      }
      if (def.summon && this.summonCool <= 0 && this.minions.filter((m) => !m.dead).length < def.summon.max) {
        this.summonCool = def.summon.every;
        return this.begin('summon', 0.5);
      }
      // Ranged attacks: more likely the closer you are (as DOOM rolls each tic).
      if ((def.missile || def.hitscan) && this.cool <= 0) {
        const chance = Math.min(0.9, 6 / Math.max(dist, 4)) * (this.skillFast ? 1.5 : 1);
        if (Math.random() < chance) return this.begin(def.missile ? 'missile' : 'hitscan', (def.missile ?? def.hitscan).time);
        this.cool = 0.3;
      }
    }
    // Keep a distance (the Phish Clicker likes to cast from afar).
    if (def.keepDistance && visible && dist < def.keepDistance) {
      this.step(dt, game, -dx / dist, -dz / dist);
      return;
    }
    if (dist < reach + 0.05) {
      this.moving = false;
      this.face(t);
      return;
    }
    const dir = this.steer(game, t, visible, dist);
    this.step(dt, game, dir.x, dir.z);
  }

  begin(kind, time) {
    this.state = 'attack';
    this.attack = kind;
    this.t = time * (this.skillFast ? 0.7 : 1);
    this.moving = false;
    this.face(this.target);
    if (kind !== 'melee') voice('attack', this.def.voice, this.x, this.z, 0.6);
  }

  // Which way to walk: straight at a visible target on the same level; otherwise down the
  // flow field towards the player (or straight on, for other targets).
  steer(game, t, visible, dist) {
    if (this.detour && this.detour.t > 0) {
      this.detour.t -= 1 / 60;
      return this.detour;
    }
    const L = game.level;
    const direct = { x: (t.x - this.x) / dist, z: (t.z - this.z) / dist };
    if (visible && Math.abs(t.feet - this.feet) < STEP_HEIGHT && dist < 12) return direct;
    if (t !== game.player || !game.flow) return direct;
    const c = L.col(this.x);
    const r = L.col(this.z);
    const here = game.flow[L.idx(c, r)];
    let best = null;
    let bestD = here < 0 ? Infinity : here;
    for (const [dc, dr] of [...DIRS, [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      if (!L.inside(c + dc, r + dr)) continue;
      const d = game.flow[L.idx(c + dc, r + dr)];
      if (d < 0) continue;
      // Diagonals only when both sides are open, so they don't cut corners.
      if (dc && dr && (game.flow[L.idx(c + dc, r)] < 0 || game.flow[L.idx(c, r + dr)] < 0)) continue;
      const cost = d + (dc && dr ? 0.4 : 0);
      if (cost < bestD) {
        bestD = cost;
        best = [c + dc, r + dr];
      }
    }
    if (!best) return direct;
    const tx = (best[0] + 0.5) * L.S;
    const tz = (best[1] + 0.5) * L.S;
    const d = Math.hypot(tx - this.x, tz - this.z) || 1;
    return { x: (tx - this.x) / d, z: (tz - this.z) / d };
  }

  // Moves along (dx, dz) at walking speed, sliding along walls; opens doors in the way.
  step(dt, game, dx, dz, speed = this.speed(game)) {
    const L = game.level;
    const nx = this.x + dx * speed * dt;
    const nz = this.z + dz * speed * dt;
    const ok = (x, z) => this.canStand(game, x, z);
    let moved = true;
    if (ok(nx, nz)) {
      this.x = nx;
      this.z = nz;
    } else if (Math.abs(dx) > 0.2 && ok(nx, this.z)) this.x = nx;
    else if (Math.abs(dz) > 0.2 && ok(this.x, nz)) this.z = nz;
    else {
      moved = false;
      // A door in the way? Open it (users can't open badge doors or find secret ones).
      const door = L.doors[L.doorOf[L.idx(L.col(this.x + dx * (this.radius + 0.6)), L.col(this.z + dz * (this.radius + 0.6)))]];
      if (door && !door.key && !door.secret) {
        if (L.openDoor(door)) play('doorOpen', this.x, this.z, 0.7);
      } else {
        this.stuck += dt;
        if (this.stuck > 0.4) {
          // Wander off at an angle for a moment, as DOOM's monsters do.
          const a = Math.atan2(dx, dz) + (Math.random() < 0.5 ? 1 : -1) * (Math.PI / 2 + Math.random() * 0.6);
          this.detour = { x: Math.sin(a), z: Math.cos(a), t: 0.3 + Math.random() * 0.4 };
          this.stuck = 0;
        }
      }
    }
    if (moved) {
      this.stuck = 0;
      this.facing = Math.atan2(dx, dz);
      this.walk += dt * speed * 0.35;
    }
    this.moving = moved;
    return moved;
  }

  canStand(game, x, z) {
    const L = game.level;
    const s = L.span(x, z, this.radius);
    if (!s) return false;
    if (s.floor > this.feet + STEP_HEIGHT) return false;
    if (s.floor < this.feet - MAX_DROP) return false;
    if (s.ceil - Math.max(s.floor, this.feet) < Math.min(this.height, 1.8)) return false;
    // Users stay out of hazards (they know better than to walk through the coffee).
    const cell = L.cellAtPoint(x, z);
    if (cell?.def?.hazard && !L.cellAtPoint(this.x, this.z)?.def?.hazard) return false;
    if (game.blocked(x, z, this.radius, this)) return false;
    const pl = game.player;
    if (!pl.dead) {
      const rr = this.radius + pl.radius;
      const now = (pl.x - this.x) ** 2 + (pl.z - this.z) ** 2;
      const next = (pl.x - x) ** 2 + (pl.z - z) ** 2;
      if (next < rr * rr && next < now) return false;
    }
    return true;
  }

  charging(dt, game) {
    const c = this.def.charge;
    const t = this.target;
    const moved = this.step(dt, game, this.chargeDir.x, this.chargeDir.z, c.speed);
    this.facing = Math.atan2(this.chargeDir.x, this.chargeDir.z);
    if (t && !this.chargeHit && Math.hypot(t.x - this.x, t.z - this.z) < this.radius + (t.radius ?? 0.5) + 0.4) {
      this.chargeHit = true;
      this.hit(game, t, c.damage ?? this.def.melee?.damage ?? [5, 10]);
      play('punch', this.x, this.z);
      this.t = 0;
    }
    if (this.t <= 0 || !moved) {
      this.state = 'chase';
      this.chargeCool = c.every * (0.7 + Math.random() * 0.6);
    }
  }

  // The wind-up is over: land the blow.
  strike(game) {
    const def = this.def;
    const t = this.target;
    this.state = 'chase';
    if (!t) return;
    const yaw = angleTo(this.x, this.z, t.x, t.z);
    const dist = Math.hypot(t.x - this.x, t.z - this.z);
    const ty = t === game.player ? t.feet + 1.1 : t.feet + t.height * 0.6;
    if (this.attack === 'melee') {
      this.meleeCool = def.melee.cooldown;
      if (dist < this.radius + (t.radius ?? 0.5) + def.melee.range + 0.3 && this.sees(game, t)) {
        this.hit(game, t, def.melee.damage);
        play('punch', this.x, this.z);
      } else play('whip', this.x, this.z, 0.5);
    } else if (this.attack === 'missile') {
      const m = def.missile;
      const sy = this.feet + this.height * 0.65;
      const pitch = Math.atan2(ty - sy, dist);
      const n = m.count ?? 1;
      const proj = { ...m, speed: m.speed * (this.skillFast ? 1.4 : 1), hitSound: 'splat' };
      for (let i = 0; i < n; i++) {
        const off = n > 1 ? (i / (n - 1) - 0.5) * (m.spread ?? 0) * 2 : 0;
        game.spawnProjectile(proj, yaw + off, pitch, this);
      }
      if (m.sound) play(m.sound, this.x, this.z);
      this.cool = m.cooldown * (this.skillFast ? 0.6 : 1) * (this.phase ? 1 - this.phase * 0.25 : 1);
    } else if (this.attack === 'hitscan') {
      const h = def.hitscan;
      const pitch = Math.atan2(ty - this.eye, dist);
      for (let i = 0; i < h.pellets; i++) {
        game.hitscan(yaw + (Math.random() - 0.5) * h.spread * 2, pitch + (Math.random() - 0.5) * h.spread * 0.5, 64, rand(h.damage), this);
      }
      play('shotgun', this.x, this.z, 0.7);
      game.particles.burst(this.x - Math.sin(yaw) * 0.5, this.eye - 0.4, this.z - Math.cos(yaw) * 0.5, ['#ffcd75', '#f4f4f4'], 3, 1);
      this.cool = h.cooldown * (this.skillFast ? 0.6 : 1);
    } else if (this.attack === 'summon') {
      const s = def.summon;
      play('spit', this.x, this.z);
      for (let i = 0; i < s.count; i++) {
        const a = this.facing + (i - (s.count - 1) / 2) * 0.9;
        const x = this.x + Math.sin(a) * (this.radius + 0.8);
        const z = this.z + Math.cos(a) * (this.radius + 0.8);
        const m = game.spawnMonster(s.id, x, z, { awake: true, summoned: true, facing: a });
        if (m) {
          m.target = t;
          this.minions.push(m);
          game.particles.burst(x, m.feet + 0.5, z, m.particle, 8, 2);
        }
      }
    }
  }

  hit(game, t, damage) {
    if (t === game.player) game.damagePlayer(rand(damage), this);
    else game.damageActor(t, rand(damage), this, { x: t.x, y: t.feet + t.height * 0.6, z: t.z });
  }

  // Shadow IT Steve blinks somewhere else nearby when he's shot.
  teleport(game) {
    const tp = this.def.teleport;
    for (let tries = 0; tries < 10; tries++) {
      const a = Math.random() * Math.PI * 2;
      const d = tp.range * (0.5 + Math.random() * 0.5);
      const x = this.x + Math.sin(a) * d;
      const z = this.z + Math.cos(a) * d;
      const s = game.level.span(x, z, this.radius);
      if (!s || Math.abs(s.floor - this.feet) > STEP_HEIGHT || !this.canStand(game, x, z)) continue;
      if (!game.level.sight(this.x, this.feet + 1, this.z, x, s.floor + 1, z)) continue;
      game.particles.burst(this.x, this.feet + 1, this.z, ['#29366f', '#73eff7', '#f4f4f4'], 10, 2);
      this.x = x;
      this.z = z;
      this.feet = s.floor;
      game.particles.burst(x, this.feet + 1, z, ['#29366f', '#73eff7', '#f4f4f4'], 10, 2);
      play('zap', x, z);
      this.teleportCool = tp.every;
      this.state = 'chase';
      return;
    }
  }

  // The VIP hurries everyone along.
  spreadAura(game) {
    const a = this.def.aura;
    for (const m of game.actors) {
      if (m === this || !m.monster || m.dead) continue;
      if (Math.abs(m.x - this.x) < a.radius && Math.abs(m.z - this.z) < a.radius) {
        m.auraT = 0.25;
        m.auraMul = a.speed;
      }
    }
  }

  // Gravity and riding lifts.
  fall(dt, game) {
    const s = game.level.span(this.x, this.z, this.dead ? 0.1 : this.radius);
    const floor = s ? s.floor : this.feet;
    if (this.feet <= floor + 0.3) {
      this.feet = floor;
      this.vy = 0;
    } else {
      this.vy -= 30 * dt;
      this.feet = Math.max(floor, this.feet + this.vy * dt);
    }
  }

  removeSprite(game) {
    if (this.removed) return;
    this.removed = true;
    game.scene.remove(this.bb.mesh);
  }

  // --- Each frame ---------------------------------------------------------------------------

  render(dt, game, cam) {
    if (this.removed) return;
    const bb = this.bb;
    let light = game.lightAt(this.x, this.z);
    if (this.dead && this.deadSheet) {
      const f = Math.min(DEATH_FRAMES - 1, Math.floor(this.deathT / 0.12));
      if (bb.material.map !== this.deadSheet.texture) {
        bb.setTexture(this.deadSheet.texture);
        bb.mesh.scale.set(this.deadSheet.width * this.scale, this.deadSheet.height * this.scale, 1);
      }
      bb.setFrame(...this.deadSheet.frame(0, f));
    } else {
      let pose = POSES.walk1;
      if (this.state === 'attack') pose = this.t < 0.15 || this.attack === 'melee' ? POSES.attack : POSES.walk1;
      else if (this.state === 'pain') pose = POSES.pain;
      else if (this.state === 'charge') pose = POSES.attack;
      else if (this.moving) pose = Math.floor(this.walk * 2) % 2 ? POSES.walk2 : POSES.walk1;
      if (this.sheet.rows === 1) pose = 0;
      const view = viewIndex(this.facing, cam.position.x, cam.position.z, this.x, this.z, this.sheet.cols);
      bb.setFrame(...this.sheet.frame(view, pose));
      // Bright when firing, as DOOM's monsters light up their muzzle frame.
      if (this.state === 'attack' && this.t < 0.15 && this.attack !== 'melee') light = Math.max(light, 1.1);
    }
    bb.place(this.x, this.feet, this.z, game.player.yaw, Math.min(1.3, light));
    if (this.flash > 0) bb.material.color.setRGB(1.6, 0.6, 0.6);
  }
}

// --- Decorations: things in the way that don't do anything ----------------------------------

export class Decor {
  constructor(game, type, x, z) {
    const def = DECOR[type];
    this.type = type;
    this.x = x;
    this.z = z;
    this.radius = def.radius;
    this.solid = def.solid;
    this.shootable = false;
    this.dead = false;
    this.feet = game.level.floorAt(x, z);
    const s = sheetsFor(game.renderer.gl, type);
    this.sheet = s.live;
    this.height = this.sheet.height;
    this.bb = new Billboard(this.sheet.texture, this.sheet.width, this.sheet.height);
    game.scene.add(this.bb.mesh);
  }
  hurt() {}
  render(dt, game) {
    this.bb.place(this.x, this.feet, this.z, game.player.yaw, Math.min(1.2, game.lightAt(this.x, this.z)));
  }
}

// --- The flow field and the sound flood -------------------------------------------------------

// Can a user walk from cell a into the neighbouring cell b right now? (Closed ordinary
// doors count as open: users open them. Badge doors and secret doors don't.)
function passable(L, a, b) {
  const cb = L.cells[b];
  if (!cb || cb.kind === 'wall') return false;
  let ceil = L.ceil[b];
  if (cb.kind === 'door') {
    const door = L.doors[L.doorOf[b]];
    if (door.key || door.secret) {
      if (door.pos < 1.8) return false;
    } else ceil = door.top;
  }
  if (ceil - L.floor[b] < 1.8) return false;
  const rise = L.floor[b] - L.floor[a];
  return rise <= STEP_HEIGHT && rise >= -MAX_DROP;
}

// Distances (in cells) from every cell to the player's, for users walking towards them.
// -1 where there's no way through.
export function buildFlow(L, x, z, out) {
  out.fill(-1);
  const start = L.idx(L.col(x), L.col(z));
  if (!L.cells[start] || L.cells[start].kind === 'wall') return out;
  const queue = new Int32Array(L.cells.length);
  let head = 0;
  let tail = 0;
  queue[tail++] = start;
  out[start] = 0;
  while (head < tail) {
    const j = queue[head++];
    const c = j % L.w;
    const r = (j / L.w) | 0;
    for (const [dc, dr] of DIRS) {
      if (!L.inside(c + dc, r + dr)) continue;
      const k = L.idx(c + dc, r + dr);
      // The search runs backwards: a user in k must be able to step into j.
      if (out[k] >= 0 || !passable(L, k, j)) continue;
      out[k] = out[j] + 1;
      queue[tail++] = k;
    }
  }
  return out;
}

// Which cells hear a noise at (x, z): sound spreads through open space and open doors (any
// height), up to `range` cells, like DOOM's sound flood through sectors.
export function soundFlood(L, x, z, range, out) {
  out.fill(0);
  const start = L.idx(L.col(x), L.col(z));
  const dist = new Int16Array(L.cells.length).fill(-1);
  const queue = [start];
  dist[start] = 0;
  out[start] = 1;
  for (let h = 0; h < queue.length; h++) {
    const j = queue[h];
    if (dist[j] >= range) continue;
    const c = j % L.w;
    const r = (j / L.w) | 0;
    for (const [dc, dr] of DIRS) {
      if (!L.inside(c + dc, r + dr)) continue;
      const k = L.idx(c + dc, r + dr);
      if (dist[k] >= 0) continue;
      const cell = L.cells[k];
      if (cell.kind === 'wall' || L.ceil[k] - L.floor[k] < 0.3) continue;
      dist[k] = dist[j] + 1;
      out[k] = 1;
      queue.push(k);
    }
  }
  return out;
}

export { FLOW_EVERY };
