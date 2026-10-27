// One play of a level: the player, their weapons, pickups, projectiles, users (enemies,
// see enemies.js) and the rules that tie them together (damage, armor, hazards, secrets,
// the tally). main.js owns the menus around it; renderer.js and hud.js draw it.

import * as THREE from 'three';
import { Player, RADIUS, EYE } from './player.js';
import { LevelMeshes } from './geometry.js';
import { Particles } from './effects.js';
import { Arsenal } from './weapons.js';
import { ViewWeapon, buildWeaponModel } from './viewmodels.js';
import { Billboard, iconTexture, bake } from './sprites.js';
import { ITEMS } from '../data/items.js';
import { WEAPONS } from '../data/weapons.js';
import { play, setListener } from './audio.js';
import { Monster, Decor, buildFlow, soundFlood, FLOW_EVERY } from './enemies.js';
import { ENEMIES, DECOR, SKILLS } from '../data/enemies.js';

const PICKUP_REACH = 1.0;
const HAZARD_TICK = 0.9; // seconds between hazard hurts, like DOOM's nukage
const lightCurve = (l) => Math.pow(Math.max(0, Math.min(255, l)) / 255, 1.3);
const rand = ([a, b]) => a + Math.random() * (b - a);

export class Game {
  // `carry` is what you bring from the last level (see `carry()`): DOOM keeps your
  // health, armor, tools and ammo between levels, but not badges or power-ups.
  constructor({ level, renderer, hud, skill, carry = null }) {
    this.level = level;
    this.renderer = renderer;
    this.hud = hud;
    this.face = hud.face;
    this.skill = skill;
    this.skillDef = SKILLS[skill - 1] ?? SKILLS[2];
    this.scene = renderer.scene;
    this.meshes = new LevelMeshes(level);
    this.scene.add(this.meshes.group);
    this.particles = new Particles(this.scene);
    const start = level.things.find((t) => t.type === 'start') ?? { x: level.S * 1.5, z: level.S * 1.5, angle: 0 };
    this.player = new Player(level, start);
    this.arsenal = new Arsenal(this);
    if (carry) {
      this.player.health = carry.health;
      this.player.armor = carry.armor;
      this.player.armorClass = carry.armorClass;
      this.arsenal.owned = new Set(carry.owned);
      this.arsenal.ammo = { ...carry.ammo };
      this.arsenal.current = carry.current;
    }
    this.view = new ViewWeapon(renderer.viewScene);
    this.view.show(this.arsenal.current);
    this.actors = [];
    this.projectiles = [];
    this.pickups = [];
    this.power = { invulnerable: 0, berserk: false, map: false };
    this.flash = { damage: 0, bonus: 0 };
    this.lightBoost = 0;
    this.hazardT = 0;
    this.time = 0;
    this.exited = false;
    this.god = false;
    this.stats = { kills: 0, totalKills: 0, items: 0, totalItems: 0, secrets: 0, totalSecrets: level.secrets.length };
    this.weaponSprites = {};
    this.lightLevels = { none: 1 };

    this.flow = new Int16Array(level.cells.length).fill(-1);
    this.flowT = 0;
    this.heard = new Uint8Array(level.cells.length);
    this.noiseId = 0;
    this.lastNoise = null;

    for (const t of level.things) {
      if (t.item) this.addPickup(t.item, t.x, t.z, t);
      if (t.minSkill && this.skill < t.minSkill) continue;
      if (t.monster) {
        if (!ENEMIES[t.monster]) console.warn(`Map: unknown user "${t.monster}"`);
        else this.spawnMonster(t.monster, t.x, t.z, { facing: t.angle !== undefined ? Math.PI - (t.angle * Math.PI) / 180 : undefined, force: true });
      }
      if (t.decor) {
        if (!DECOR[t.decor]) console.warn(`Map: unknown decoration "${t.decor}"`);
        else this.actors.push(new Decor(this, t.decor, t.x, t.z));
      }
    }
    this.stats.totalItems = this.pickups.filter((p) => p.def.counts).length;
    this.stats.totalKills = this.actors.filter((a) => a.counts).length;
    buildFlow(level, this.player.x, this.player.z, this.flow);
  }

  // Adds a user (or a UPS battery) at (x, z), if there's room. Returns it or null.
  spawnMonster(type, x, z, { force = false, ...opts } = {}) {
    const r = ENEMIES[type].radius;
    if (!force) {
      const s = this.level.span(x, z, r);
      if (!s || s.ceil - s.floor < 1.5 || this.blocked(x, z, r, null)) return null;
    }
    const opt = { ...opts };
    if (opt.facing === undefined) delete opt.facing;
    const m = new Monster(this, type, x, z, opt);
    this.actors.push(m);
    return m;
  }

  carry() {
    const pl = this.player;
    const a = this.arsenal;
    return { health: Math.max(1, Math.ceil(pl.health)), armor: pl.armor, armorClass: pl.armorClass, owned: [...a.owned], ammo: { ...a.ammo }, current: a.pending ?? a.current };
  }

  // --- Pickups -----------------------------------------------------------------------------

  addPickup(id, x, z, thing = {}) {
    const def = ITEMS[id];
    if (!def) {
      console.warn(`Map: unknown item "${id}"`);
      return null;
    }
    if (thing.minSkill && this.skill < thing.minSkill) return null;
    let tex;
    let w = def.size;
    let h = def.size;
    if (def.weapon) {
      const s = this.weaponSprite(def.weapon);
      tex = s.texture;
      w = (s.width / s.height) * h;
    } else tex = iconTexture(def.icon, def.recolor);
    const bb = new Billboard(tex, w, h);
    this.scene.add(bb.mesh);
    const p = { id, def, x, z, bb, phase: Math.random() * 6, taken: false, dropped: !!thing.dropped };
    this.pickups.push(p);
    return p;
  }

  // Weapon pickups show the weapon model itself, baked side-on.
  weaponSprite(id) {
    if (!this.weaponSprites[id]) {
      const { root } = buildWeaponModel(id);
      const holder = new THREE.Group();
      root.rotation.set(0, Math.PI / 2, 0);
      root.position.set(0, 0.25, 0);
      holder.add(root);
      this.weaponSprites[id] = bake(this.renderer.gl, holder, { views: 1, pixels: 40, pad: 1.0 });
    }
    return this.weaponSprites[id];
  }

  touchPickups() {
    const pl = this.player;
    if (pl.dead) return;
    for (const p of this.pickups) {
      if (p.taken) continue;
      if (Math.abs(p.x - pl.x) > PICKUP_REACH || Math.abs(p.z - pl.z) > PICKUP_REACH) continue;
      const floor = this.level.floorAt(p.x, p.z);
      if (Math.abs(floor - pl.feet) > 1.2) continue;
      if (!this.give(p.def)) continue;
      p.taken = true;
      this.scene.remove(p.bb.mesh);
      if (p.def.counts && !p.dropped) this.stats.items++;
      this.hud.message(p.def.msg);
      this.flash.bonus = 0.3;
    }
  }

  // Applies an item; returns false if it was no use (so it stays on the floor).
  give(def) {
    const pl = this.player;
    let used = !!def.always;
    if (def.health) {
      const max = def.max ?? 100;
      if (pl.health < max) {
        pl.health = Math.min(max, pl.health + def.health);
        used = true;
      }
      if (def.power === 'berserk') pl.health = Math.max(pl.health, 100);
    }
    if (def.armor) {
      if (def.armorClass) {
        if (pl.armor < def.armor) {
          pl.armor = def.armor;
          pl.armorClass = def.armorClass;
          used = true;
        }
      } else if (pl.armor < (def.armorMax ?? 200)) {
        pl.armor = Math.min(def.armorMax ?? 200, pl.armor + def.armor);
        pl.armorClass ||= 1;
        used = true;
      }
    }
    if (def.ammo) {
      for (const [k, n] of Object.entries(def.ammo)) if (this.arsenal.giveAmmo(k, n * this.skillDef.ammo)) used = true;
    }
    if (def.weapon) {
      if (this.arsenal.giveWeapon(def.weapon)) {
        used = true;
        this.face.grin();
        play('weaponUp');
        return true;
      }
      return false;
    }
    if (def.key) {
      pl.keys.add(def.key);
      play('badge');
      return true;
    }
    if (def.power) {
      if (def.power === 'invulnerable') this.power.invulnerable = def.time;
      if (def.power === 'berserk') {
        this.power.berserk = true;
        this.arsenal.select('cable');
      }
      if (def.power === 'map') this.power.map = true;
      play('powerUp');
      return true;
    }
    if (used) play('item');
    return used;
  }

  // --- Shooting ----------------------------------------------------------------------------

  // DOOM-style vertical auto-aim: if a user is near the crosshair horizontally, aim the
  // shot up or down at them (unless you're clearly looking elsewhere).
  autoAim(maxAngle = 0.09) {
    const pl = this.player;
    const eye = pl.eye;
    let best = null;
    let bestScore = Infinity;
    for (const a of this.actors) {
      if (!a.shootable || a.dead) continue;
      const dx = a.x - pl.x;
      const dz = a.z - pl.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 64 || dist < 0.01) continue;
      const ang = Math.atan2(-dx, -dz);
      let diff = ang - pl.yaw;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      const tol = maxAngle + Math.atan(a.radius / dist);
      if (Math.abs(diff) > tol) continue;
      const cy = a.feet + a.height * 0.6;
      if (!this.level.sight(pl.x, eye, pl.z, a.x, cy, a.z)) continue;
      const score = dist * (1 + Math.abs(diff) * 4);
      if (score < bestScore) {
        bestScore = score;
        best = { pitch: Math.atan2(cy - eye, dist) };
      }
    }
    if (best && Math.abs(best.pitch - pl.pitch) < 0.4) return { yaw: pl.yaw, pitch: best.pitch };
    return { yaw: pl.yaw, pitch: pl.pitch };
  }

  // An instant shot from `source`'s eye. Returns what it hit.
  hitscan(yaw, pitch, range, damage, source, from = null) {
    const o = from ?? { x: source.x, y: source.eye ?? source.feet + source.height * 0.7, z: source.z };
    const cp = Math.cos(pitch);
    const d = { x: -Math.sin(yaw) * cp, y: Math.sin(pitch), z: -Math.cos(yaw) * cp };
    const wall = this.level.trace(o.x, o.y, o.z, d.x, d.y, d.z, range);
    const maxT = wall ? wall.t : range;
    const target = this.rayActor(o, d, maxT, source);
    if (target) {
      const { actor, t } = target;
      const hx = o.x + d.x * t;
      const hy = o.y + d.y * t;
      const hz = o.z + d.z * t;
      this.damageActor(actor, damage, source, { x: hx, y: hy, z: hz });
      return { actor, x: hx, z: hz };
    }
    if (wall) {
      this.particles.puff(wall.x, wall.y, wall.z, wall.nx, wall.nz);
      return { wall, x: wall.x, z: wall.z };
    }
    return null;
  }

  // The first actor a ray (origin o, unit direction d) meets within maxT.
  rayActor(o, d, maxT, source) {
    let best = null;
    const a2 = d.x * d.x + d.z * d.z;
    if (a2 < 1e-9) return null;
    const pl = this.player;
    for (const a of source === pl ? this.actors : [...this.actors, pl]) {
      if (a === source || a.dead || (a !== pl && !a.shootable)) continue;
      const ox = o.x - a.x;
      const oz = o.z - a.z;
      const b = 2 * (d.x * ox + d.z * oz);
      const c = ox * ox + oz * oz - a.radius * a.radius;
      const disc = b * b - 4 * a2 * c;
      if (disc < 0) continue;
      const sq = Math.sqrt(disc);
      let t = (-b - sq) / (2 * a2);
      if (t < 0) t = (-b + sq) / (2 * a2);
      if (t < 0 || t > maxT || (best && t >= best.t)) continue;
      const y = o.y + d.y * t;
      if (y < a.feet || y > a.feet + a.height) continue;
      best = { actor: a, t };
    }
    return best;
  }

  melee(range, damage) {
    const pl = this.player;
    const aim = this.autoAim(0.3);
    const o = { x: pl.x, y: pl.eye - 0.2, z: pl.z };
    // A melee swing reaches a little wide: try three angles.
    for (const off of [0, -0.25, 0.25]) {
      const cp = Math.cos(aim.pitch);
      const d = { x: -Math.sin(aim.yaw + off) * cp, y: Math.sin(aim.pitch), z: -Math.cos(aim.yaw + off) * cp };
      const wall = this.level.trace(o.x, o.y, o.z, d.x, d.y, d.z, range);
      const hit = this.rayActor(o, d, wall ? wall.t : range, pl);
      if (hit) {
        this.damageActor(hit.actor, damage, pl, { x: o.x + d.x * hit.t, y: o.y + d.y * hit.t, z: o.z + d.z * hit.t });
        // Turn to face what you hit, as DOOM's fist does.
        pl.yaw += off * 0.5;
        return { x: hit.actor.x, z: hit.actor.z };
      }
      if (off === 0 && wall) {
        this.particles.puff(wall.x, wall.y, wall.z, wall.nx, wall.nz);
      }
    }
    return null;
  }

  damageActor(actor, damage, source, at) {
    if (actor === this.player) {
      this.damagePlayer(damage, source);
      if (at) this.particles.burst(at.x, at.y, at.z, ['#b13e53', '#7a1c2c'], 4, 2);
      return;
    }
    if (at) this.particles.burst(at.x, at.y, at.z, actor.particle ?? ['#b13e53'], 6, 2.5);
    actor.hurt(Math.round(damage), source, this);
  }

  spawnProjectile(def, yaw, pitch, source) {
    const cp = Math.cos(pitch);
    const dir = { x: -Math.sin(yaw) * cp, y: Math.sin(pitch), z: -Math.cos(yaw) * cp };
    const y = source === this.player ? this.player.eye - 0.25 : source.feet + source.height * 0.65;
    const p = {
      def,
      source,
      x: source.x + dir.x * (source.radius + 0.2),
      y,
      z: source.z + dir.z * (source.radius + 0.2),
      vx: dir.x * def.speed,
      vy: dir.y * def.speed,
      vz: dir.z * def.speed,
      yaw,
      life: 8,
      bb: null,
      spin: 0,
    };
    p.bb = new Billboard(projectileTexture(def.sprite), def.radius * 2.4, def.radius * 2.4);
    p.bb.material.fog = false;
    this.scene.add(p.bb.mesh);
    this.projectiles.push(p);
    return p;
  }

  updateProjectiles(dt) {
    const keep = [];
    for (const p of this.projectiles) {
      p.life -= dt;
      const len = Math.hypot(p.vx, p.vy, p.vz) * dt;
      const d = { x: p.vx * dt / len, y: p.vy * dt / len, z: p.vz * dt / len };
      const o = { x: p.x, y: p.y, z: p.z };
      const wall = this.level.trace(o.x, o.y, o.z, d.x, d.y, d.z, len + p.def.radius);
      const hit = this.rayActor(o, d, wall ? wall.t : len, p.source);
      // Also catch actors the projectile is already inside of (point blank).
      if (hit || wall || p.life <= 0) {
        const t = hit ? hit.t : wall ? Math.max(0, wall.t - p.def.radius) : 0;
        p.x = o.x + d.x * t;
        p.y = o.y + d.y * t;
        p.z = o.z + d.z * t;
        this.explode(p, hit?.actor);
        this.scene.remove(p.bb.mesh);
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      keep.push(p);
    }
    this.projectiles = keep;
  }

  explode(p, actor) {
    const def = p.def;
    if (actor) this.damageActor(actor, rand(def.damage), p.source, { x: p.x, y: p.y, z: p.z });
    if (def.splash) {
      this.radiusDamage(p.x, p.y, p.z, def.splash.radius, def.splash.damage, p.source);
      this.particles.explosion(p.x, p.y, p.z, def.splash.radius * 0.5, def.colors);
      play(def.boom ?? 'explode', p.x, p.z);
      this.lightBoost = Math.max(this.lightBoost, 0.3);
    } else if (def.spray) {
      this.particles.explosion(p.x, p.y, p.z, 2.5, ['#73eff7', '#41a6f6', '#f4f4f4', '#38b764']);
      play('bfgBoom', p.x, p.z);
      this.lightBoost = Math.max(this.lightBoost, 0.6);
      this.spray(p.source, p.yaw, def.spray);
    } else {
      this.particles.burst(p.x, p.y, p.z, def.colors ?? ['#f4f4f4', '#94b0c2'], 5, 1.5);
      if (def.hitSound) play(def.hitSound, p.x, p.z);
    }
  }

  // The Fleet-Wide Reboot's follow-up: everyone in front of whoever fired it gets
  // rebooted, as DOOM's BFG sprays tracers from the player.
  spray(source, yaw, { rays, spread, damage, range }) {
    const hits = new Map();
    for (let i = 0; i < rays; i++) {
      const a = yaw - spread / 2 + (spread * i) / (rays - 1);
      const o = { x: source.x, y: (source.eye ?? source.feet + 1.2), z: source.z };
      let best = null;
      for (const act of this.actors) {
        if (act === source || act.dead || !act.shootable) continue;
        const dx = act.x - o.x;
        const dz = act.z - o.z;
        const dist = Math.hypot(dx, dz);
        if (dist > range) continue;
        let diff = Math.atan2(-dx, -dz) - a;
        diff = Math.atan2(Math.sin(diff), Math.cos(diff));
        if (Math.abs(diff) > Math.atan(act.radius / Math.max(dist, 0.1)) + 0.02) continue;
        if (!this.level.sight(o.x, o.y, o.z, act.x, act.feet + act.height * 0.6, act.z)) continue;
        if (!best || dist < best.dist) best = { act, dist };
      }
      if (best) hits.set(best.act, (hits.get(best.act) ?? 0) + rand(damage));
    }
    for (const [act, dmg] of hits) {
      this.particles.burst(act.x, act.feet + act.height * 0.6, act.z, ['#73eff7', '#38b764', '#f4f4f4'], 10, 3);
      act.hurt(Math.round(dmg), source, this);
    }
  }

  // Splash damage: full at the center, falling off to nothing at `radius`, blocked by walls.
  radiusDamage(x, y, z, radius, damage, source) {
    const victims = [...this.actors, this.player];
    for (const v of victims) {
      if (v.dead) continue;
      const dist = Math.max(0, Math.hypot(v.x - x, v.z - z) - (v.radius ?? RADIUS));
      if (dist >= radius) continue;
      const vy = v === this.player ? v.feet + 1 : v.feet + v.height / 2;
      if (!this.level.sight(x, y, z, v.x, vy, v.z) && !this.level.sight(x, y + 0.3, z, v.x, v.feet + 0.2, v.z)) continue;
      const dmg = damage * (1 - dist / radius);
      if (v === this.player) this.damagePlayer(dmg, source);
      else if (!v.splashImmune) v.hurt(Math.round(dmg), source, this);
    }
  }

  // --- The player getting hurt -----------------------------------------------------------

  damagePlayer(amount, source = null, { kind = 'hit' } = {}) {
    const pl = this.player;
    if (pl.dead || this.god || amount <= 0) return;
    if (this.power.invulnerable > 0 && kind !== 'telefrag') return;
    amount *= this.skillDef.damage; // the easy skills take less damage, as DOOM's does
    let dmg = amount;
    if (pl.armor > 0) {
      let saved = pl.armorClass === 2 ? dmg / 2 : dmg / 3;
      if (saved > pl.armor) saved = pl.armor;
      pl.armor = Math.round(pl.armor - saved);
      if (pl.armor <= 0) pl.armorClass = 0;
      dmg -= saved;
    }
    dmg = Math.max(1, Math.round(dmg));
    pl.health -= dmg;
    this.flash.damage = Math.min(1, this.flash.damage + dmg / 40 + 0.15);
    // Which way to look on the face: towards whoever did it.
    let side = 0;
    if (source && source !== pl && source.x !== undefined) {
      let a = Math.atan2(-(source.x - pl.x), -(source.z - pl.z)) - pl.yaw;
      a = Math.atan2(Math.sin(a), Math.cos(a));
      side = Math.abs(a) < 0.5 ? 0 : a > 0 ? -1 : 1;
    }
    this.face.hurt(dmg, side);
    if (pl.health <= 0) {
      pl.health = 0;
      pl.dead = true;
      play('death');
    } else play(kind === 'hazard' ? 'sizzle' : 'pain');
    if (source?.monster) source.lastHitPlayer = this.time;
  }

  // --- Each tick -----------------------------------------------------------------------------

  blocked(x, z, r, self = this.player) {
    for (const a of this.actors) {
      if (a === self || a.dead || !a.solid) continue;
      const rr = r + a.radius;
      if (Math.abs(a.x - x) < rr && Math.abs(a.z - z) < rr) {
        if ((a.x - x) ** 2 + (a.z - z) ** 2 < rr * rr) {
          // Already overlapping: allow moving apart.
          if (!self) return true;
          const now = (a.x - self.x) ** 2 + (a.z - self.z) ** 2;
          const next = (a.x - x) ** 2 + (a.z - z) ** 2;
          if (next < now || now >= rr * rr) return true;
        }
      }
    }
    return false;
  }

  update(dt, input, presses) {
    const pl = this.player;
    this.time += dt;
    for (const a of presses) {
      if (a.startsWith('weapon')) this.arsenal.selectSlot(Number(a.slice(6)));
      else if (a === 'nextWeapon') this.arsenal.cycle(1);
      else if (a === 'prevWeapon') this.arsenal.cycle(-1);
      else if (a === 'use' && !pl.dead) this.use();
    }
    const st = input.state();
    pl.update(dt, st, (x, z, r) => this.blocked(x, z, r));
    this.arsenal.update(dt, st.fire && !pl.dead);
    this.view.show(this.arsenal.current);

    const events = this.level.update(dt, (j) => this.occupied(j));
    for (const e of events) {
      const j = (e.door ?? e.lift).cells[0];
      const x = ((j % this.level.w) + 0.5) * this.level.S;
      const z = (((j / this.level.w) | 0) + 0.5) * this.level.S;
      play(e.type, x, z);
    }
    this.meshes.sync();

    this.flowT -= dt;
    if (this.flowT <= 0) {
      this.flowT = FLOW_EVERY;
      buildFlow(this.level, pl.x, pl.z, this.flow);
    }
    for (let i = 0; i < this.actors.length; i++) if (!this.actors[i].removed) this.actors[i].update?.(dt, this);
    this.updateProjectiles(dt);
    this.touchPickups();
    this.hazards(dt);
    this.secrets();

    if (this.power.invulnerable > 0) this.power.invulnerable = Math.max(0, this.power.invulnerable - dt);
    this.flash.damage = Math.max(0, this.flash.damage - dt * 1.5);
    this.flash.bonus = Math.max(0, this.flash.bonus - dt * 1.5);
    this.lightBoost = Math.max(0, this.lightBoost - dt * 4);
  }

  use() {
    const pl = this.player;
    const res = this.level.use(pl.x, pl.z, pl.feet, pl.yaw, pl.keys);
    if (!res) {
      play('oof');
      return;
    }
    if (res.locked) {
      this.hud.message(`You need the ${res.locked} badge to open this door.`);
      play('oof');
      this.hud.flashKey(res.locked);
    } else if (res.door) play('doorOpen', ...this.cellCenter(res.door.cells[0]));
    else if (res.lift) play('liftStart', ...this.cellCenter(res.lift.cells[0]));
    else if (res.exit) {
      this.meshes.switchExit();
      play('switch');
      this.exited = true;
    }
  }

  cellCenter(j) {
    return [((j % this.level.w) + 0.5) * this.level.S, (((j / this.level.w) | 0) + 0.5) * this.level.S];
  }

  occupied(j) {
    const S = this.level.S;
    const c = j % this.level.w;
    const r = (j / this.level.w) | 0;
    const inCell = (x, z, rad) => x + rad > c * S && x - rad < (c + 1) * S && z + rad > r * S && z - rad < (r + 1) * S;
    if (inCell(this.player.x, this.player.z, RADIUS)) return true;
    for (const a of this.actors) if (!a.dead && a.solid && inCell(a.x, a.z, a.radius)) return true;
    return false;
  }

  hazards(dt) {
    const pl = this.player;
    const cell = this.level.cellAtPoint(pl.x, pl.z);
    const hz = cell?.def?.hazard;
    const onFloor = pl.feet <= this.level.floorAt(pl.x, pl.z) + 0.05;
    pl.slow = hz?.slow && onFloor ? hz.slow : 1;
    // Badge Brenda, following you in.
    if (this.tailgate?.t > 0) {
      this.tailgate.t -= dt;
      pl.slow *= this.tailgate.slow;
    }
    if (!hz || !onFloor || pl.dead) {
      this.hazardT = Math.min(this.hazardT, 0.2);
      return;
    }
    this.hazardT -= dt;
    if (this.hazardT <= 0) {
      this.hazardT = HAZARD_TICK;
      if (hz.damage) {
        this.damagePlayer(hz.damage, null, { kind: 'hazard' });
        this.particles.burst(pl.x, pl.feet + 0.1, pl.z, cell.floorTex === 'COFFEE' ? ['#7a4e26', '#c08a50'] : ['#ffcd75', '#73eff7', '#f4f4f4'], 6, 1.5);
      }
    }
  }

  secrets() {
    const s = this.level.secretAt(this.player.x, this.player.z);
    if (s && !s.found) {
      s.found = true;
      this.stats.secrets++;
      this.hud.message('You found a forgotten server closet!');
      play('secret');
    }
  }

  // A weapon went off: users in connected rooms within `cells` cells hear it.
  noise(cells) {
    const pl = this.player;
    soundFlood(this.level, pl.x, pl.z, cells, this.heard);
    this.lastNoise = { id: ++this.noiseId, x: pl.x, z: pl.z, cells, time: this.time };
  }

  heardAt(x, z) {
    const L = this.level;
    const c = L.col(x);
    const r = L.col(z);
    return L.inside(c, r) && this.heard[L.idx(c, r)] === 1;
  }

  muzzleFlash(amount = 0.25) {
    this.lightBoost = Math.max(this.lightBoost, amount);
  }

  // How bright the floor at (x, z) is right now (0..~1.2), for sprites.
  lightAt(x, z) {
    const cell = this.level.cellAtPoint(x, z);
    if (!cell || cell.kind === 'wall') return 0.5;
    return lightCurve(cell.light) * (this.lightLevels[cell.effect ?? 'none'] ?? 1) + this.lightBoost;
  }

  // --- Each frame ----------------------------------------------------------------------------

  render(dt, lightLevels) {
    const pl = this.player;
    const cam = this.renderer.camera;
    this.lightLevels = lightLevels;
    this.meshes.setLighting(lightLevels, this.lightBoost);
    this.renderer.follow(pl);
    setListener(pl.x, pl.z, pl.yaw);
    const yaw = pl.yaw;
    for (const p of this.pickups) {
      if (p.taken) continue;
      p.phase += dt * 3;
      const y = this.level.floorAt(p.x, p.z) + (p.def.power || p.def.glow ? 0.12 + Math.sin(p.phase) * 0.08 : 0);
      p.bb.place(p.x, y, p.z, yaw, p.def.glow ? 1.1 : this.lightAt(p.x, p.z));
    }
    for (const p of this.projectiles) {
      p.bb.place(p.x, p.y - p.def.radius * 1.2, p.z, yaw, 1.3);
    }
    for (const a of this.actors) a.render?.(dt, this, cam);
    this.particles.update(dt, cam);
    // The weapon: bob with walking, light from the room you're in.
    const bob = Math.min(1, pl.speed / 12);
    const ph = pl.bobPhase;
    this.view.update(dt, {
      drop: this.arsenal.drop,
      bobX: Math.cos(ph) * 0.035 * bob,
      bobY: -Math.abs(Math.sin(ph)) * 0.03 * bob,
      light: Math.min(1, this.lightAt(pl.x, pl.z) + this.lightBoost),
      firing: this.arsenal.firing,
      windup: this.arsenal.windup > 0 ? 1 - this.arsenal.windup / (WEAPONS[this.arsenal.current].windup ?? 1) : 0,
    });
  }
}

// Pictures for projectiles in flight.
const projTextures = {};
function projectileTexture(name) {
  if (projTextures[name]) return projTextures[name];
  if (name === 'reboot' || name === 'orb') {
    const c = document.createElement('canvas');
    c.width = c.height = 16;
    const ctx = c.getContext('2d');
    const color = name === 'reboot' ? ['#73eff7', '#41a6f6', '#f4f4f4'] : ['#b13e53', '#ef7d57', '#ffcd75'];
    ctx.fillStyle = color[1];
    ctx.beginPath();
    ctx.arc(8, 8, 7.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = color[0];
    ctx.beginPath();
    ctx.arc(8, 8, 5.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = color[2];
    if (name === 'reboot') {
      ctx.fillRect(7, 3, 2, 6);
      ctx.strokeStyle = color[2];
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(8, 9, 3.5, -Math.PI * 0.3, Math.PI * 1.3);
      ctx.stroke();
    } else ctx.fillRect(6, 6, 4, 4);
    projTextures[name] = iconTextureFromCanvas(c);
  } else projTextures[name] = iconTexture(name);
  return projTextures[name];
}

function iconTextureFromCanvas(c) {
  const t = new THREE.CanvasTexture(c);
  t.magFilter = t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export { EYE };
