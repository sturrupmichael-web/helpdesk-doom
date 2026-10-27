// The arsenal: which weapons you own, your ammo, switching (lower one, raise the next),
// and firing. What a shot does to the world (rays, projectiles, damage) is asked of the
// game (game.js), so this file is only the rules of the guns.

import { WEAPONS, AMMO, START_WEAPONS, SLOT_ORDER } from '../data/weapons.js';
import { play } from './audio.js';

const SWITCH_SPEED = 5; // lower/raise per second (0..1)
const rand = ([a, b]) => a + Math.random() * (b - a);

export class Arsenal {
  constructor(game) {
    this.game = game;
    this.owned = new Set(START_WEAPONS);
    this.ammo = Object.fromEntries(Object.entries(AMMO).map(([k, a]) => [k, a.start]));
    this.max = Object.fromEntries(Object.entries(AMMO).map(([k, a]) => [k, a.max]));
    this.current = 'autoClose';
    this.pending = null;
    this.drop = 1; // starts lowered and raises on spawn
    this.cooldown = 0;
    this.sinceShot = 10;
    this.windup = 0;
    this.meleeTimer = -1;
    this.firing = false;
  }

  get weapon() {
    return WEAPONS[this.current];
  }

  hasAmmo(id) {
    const w = WEAPONS[id];
    return !w.ammo || this.ammo[w.ammo] >= w.use;
  }

  // Number key / wheel: switch to a weapon you own (pressing a slot twice does nothing).
  select(id) {
    if (!this.owned.has(id) || id === this.current || id === this.pending) return false;
    this.pending = id;
    return true;
  }
  selectSlot(slot) {
    const id = SLOT_ORDER.find((w) => WEAPONS[w].slot === slot);
    if (id) this.select(id);
  }
  cycle(dir) {
    const owned = SLOT_ORDER.filter((w) => this.owned.has(w) && this.hasAmmo(w));
    if (owned.length < 2) return;
    const from = owned.indexOf(this.pending ?? this.current);
    this.select(owned[(from + dir + owned.length) % owned.length]);
  }

  // Out of ammo: switch to the best weapon that still has some, DOOM's order of preference.
  autoSwitch() {
    for (const id of ['reimage', 'powershell', 'replyAll', 'autoClose', 'reboot', 'cable']) {
      if (id === 'reimage' || id === 'reboot') continue; // never auto-switch to splash weapons
      if (this.owned.has(id) && this.hasAmmo(id) && id !== this.current) return this.select(id);
    }
    return this.select('cable');
  }

  // Gives a weapon (from a pickup); returns whether it was any use.
  giveWeapon(id) {
    const w = WEAPONS[id];
    const isNew = !this.owned.has(id);
    let gotAmmo = false;
    if (w.ammo && w.pickupAmmo) gotAmmo = this.giveAmmo(w.ammo, w.pickupAmmo);
    if (isNew) {
      this.owned.add(id);
      this.select(id);
    }
    return isNew || gotAmmo;
  }

  giveAmmo(kind, n) {
    if (this.ammo[kind] >= this.max[kind]) return false;
    const before = this.ammo[kind];
    this.ammo[kind] = Math.min(this.max[kind], before + n);
    // DOOM: picking up ammo for a better weapon when you were using fists/pistol switches.
    if (before === 0 && (this.current === 'cable' || this.current === 'autoClose')) {
      const better = SLOT_ORDER.slice().reverse().find((id) => this.owned.has(id) && WEAPONS[id].ammo === kind && id !== 'reimage' && id !== 'reboot');
      if (better && WEAPONS[better].slot > WEAPONS[this.current].slot) this.select(better);
    }
    return true;
  }

  update(dt, fireHeld) {
    const g = this.game;
    this.cooldown -= dt;
    this.sinceShot += dt;
    this.firing = false;
    if (g.player.dead) {
      this.drop = Math.min(1, this.drop + dt * SWITCH_SPEED);
      return;
    }
    // Switching: lower the current weapon, swap, raise the new one.
    if (this.pending) {
      this.drop = Math.min(1, this.drop + dt * SWITCH_SPEED);
      this.windup = 0;
      if (this.drop >= 1) {
        this.current = this.pending;
        this.pending = null;
      }
      return;
    }
    if (this.drop > 0) {
      this.drop = Math.max(0, this.drop - dt * SWITCH_SPEED);
      return;
    }
    // A melee swing lands a moment after it starts.
    if (this.meleeTimer >= 0) {
      this.meleeTimer -= dt;
      if (this.meleeTimer < 0) this.meleeHit();
    }
    // The Fleet-Wide Reboot charges up before it fires.
    if (this.windup > 0) {
      this.windup -= dt;
      this.firing = true;
      if (this.windup <= 0) this.release();
      return;
    }
    if (!fireHeld || this.cooldown > 0) return;
    const w = this.weapon;
    if (!this.hasAmmo(this.current)) {
      play('noAmmo');
      this.cooldown = 0.4;
      this.autoSwitch();
      return;
    }
    this.firing = true;
    if (w.windup) {
      this.windup = w.windup;
      this.cooldown = w.cooldown;
      play(w.sound);
      return;
    }
    this.shoot();
  }

  shoot() {
    const w = this.weapon;
    const g = this.game;
    if (w.ammo) this.ammo[w.ammo] -= w.use;
    this.cooldown = w.cooldown;
    const accurate = w.firstShotAccurate && this.sinceShot > w.cooldown * 1.6;
    this.sinceShot = 0;
    g.face.firing(0.25);
    if (w.kind === 'melee') {
      play(w.sound);
      g.view.fired(false);
      this.meleeTimer = w.hitDelay;
      return;
    }
    play(w.sound);
    g.noise(w.noise);
    g.muzzleFlash();
    if (w.kind === 'hitscan') {
      g.view.fired(true, w.pellets > 1 ? 0.26 : 0.18);
      const aim = g.autoAim();
      for (let i = 0; i < w.pellets; i++) {
        const spread = accurate ? 0 : w.spread;
        g.hitscan(aim.yaw + (Math.random() - 0.5) * 2 * spread, aim.pitch + (w.pellets > 1 ? (Math.random() - 0.5) * spread * 0.5 : 0), 64, rand(w.damage), g.player);
      }
    } else if (w.kind === 'projectile') {
      g.view.fired(true, 0.22);
      const aim = g.autoAim();
      g.spawnProjectile(w.projectile, aim.yaw, aim.pitch, g.player);
    }
  }

  release() {
    const w = this.weapon;
    const g = this.game;
    if (!this.hasAmmo(this.current)) return;
    this.ammo[w.ammo] -= w.use;
    this.sinceShot = 0;
    play('bfgShot');
    g.noise(w.noise);
    g.muzzleFlash(0.6);
    g.view.fired(true, 0.45);
    const aim = g.autoAim();
    g.spawnProjectile(w.projectile, aim.yaw, aim.pitch, g.player);
  }

  meleeHit() {
    const w = WEAPONS.cable;
    const g = this.game;
    const dmg = rand(w.damage) * (g.power.berserk ? 10 : 1);
    const hit = g.melee(w.range, dmg);
    if (hit) play('punch', hit.x, hit.z);
  }
}
