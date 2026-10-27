// The player: the tech, now seen from behind their own eyes. Movement is DOOM-like:
// quick acceleration with a little slide, walking up steps (the view eases up after
// them), dropping off ledges, riding lifts, and sliding along walls.

import { STEP_HEIGHT } from './level.js';

export const RADIUS = 0.5;
export const HEIGHT = 1.75;
export const EYE = 1.5;
const WALK = 7;
const RUN = 12;
const ACCEL = 10; // how quickly velocity reaches the wished speed (1/s)
const GRAVITY = 30;
const TURN_SPEED = 3; // keyboard turning, radians per second
const PAD_TURN = 3.4;
const MOUSE_TURN = 0.0024; // radians per pixel
const MAX_PITCH = 1.0;

export class Player {
  constructor(level, start) {
    this.level = level;
    this.x = start.x;
    this.z = start.z;
    this.feet = level.span(this.x, this.z, RADIUS)?.floor ?? 0;
    this.vy = 0;
    this.vx = 0;
    this.vz = 0;
    this.yaw = -((start.angle ?? 0) * Math.PI) / 180;
    this.pitch = 0;
    this.eyeOffset = 0; // dips after stepping up, then eases back
    this.bobPhase = 0;
    this.bob = 0;
    this.speed = 0;
    this.onGround = true;
    this.health = 100;
    this.armor = 0;
    this.armorClass = 0; // 1: absorbs 1/3, 2: absorbs 1/2 (green / blue armor in DOOM)
    this.keys = new Set();
    this.dead = false;
    this.slow = 1; // hazard slow-down (coffee is sticky)
    this.radius = RADIUS;
    this.height = HEIGHT;
  }

  get eye() {
    return this.feet + EYE + this.eyeOffset + this.bob;
  }

  // Applies mouse look outside the fixed tick, so turning feels immediate.
  look(mouse) {
    this.yaw -= mouse.x * MOUSE_TURN;
    this.pitch = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, this.pitch - mouse.y * MOUSE_TURN));
  }

  // One fixed tick. `blocked(x, z, r)` says whether a monster or object is in the way.
  update(dt, input, blocked) {
    const L = this.level;
    if (this.dead) {
      // Sink to the floor.
      this.eyeOffset = Math.max(-EYE + 0.25, this.eyeOffset - dt * 3);
      this.vx *= 0.9;
      this.vz *= 0.9;
    } else {
      this.yaw -= (input.turn * TURN_SPEED * (input.run ? 1.3 : 1) + input.padTurn * PAD_TURN) * dt;
      this.pitch = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, this.pitch - input.padLook * PAD_TURN * 0.6 * dt));
      const speed = (input.run ? RUN : WALK) * this.slow;
      const sin = Math.sin(this.yaw);
      const cos = Math.cos(this.yaw);
      // Forward is -z when yaw is 0; right is +x.
      const wx = (-sin * input.forward + cos * input.strafe) * speed;
      const wz = (-cos * input.forward - sin * input.strafe) * speed;
      const k = this.onGround ? 1 - Math.exp(-ACCEL * dt) : 1 - Math.exp(-ACCEL * 0.25 * dt);
      this.vx += (wx - this.vx) * k;
      this.vz += (wz - this.vz) * k;
    }

    // Move with wall sliding: try the full step, then each axis on its own.
    const nx = this.x + this.vx * dt;
    const nz = this.z + this.vz * dt;
    const ok = (x, z) => L.fits(x, z, RADIUS, HEIGHT, this.feet, this.onGround ? STEP_HEIGHT : 0.25) && !blocked(x, z, RADIUS);
    if (ok(nx, nz)) {
      this.x = nx;
      this.z = nz;
    } else {
      if (ok(nx, this.z)) this.x = nx;
      else this.vx = 0;
      if (ok(this.x, nz)) this.z = nz;
      else this.vz = 0;
    }

    // Floors: step up (smoothed), fall down, ride lifts.
    const span = L.span(this.x, this.z, RADIUS);
    const floor = span ? span.floor : this.feet;
    let landed = 0;
    if (this.feet < floor) {
      if (this.onGround) this.eyeOffset -= floor - this.feet;
      this.feet = floor;
      this.vy = 0;
    } else if (this.feet > floor + 0.001) {
      if (this.onGround && this.feet - floor < 0.3 && this.vy <= 0) {
        // Small step down or a lowering lift: stick to the floor.
        this.feet = floor;
      } else {
        this.onGround = false;
        this.vy -= GRAVITY * dt;
        this.feet += this.vy * dt;
        if (this.feet <= floor) {
          landed = -this.vy;
          if (landed > 8) this.eyeOffset -= Math.min(0.5, landed * 0.03); // "oof"
          this.feet = floor;
          this.vy = 0;
          this.onGround = true;
        }
      }
    } else this.onGround = true;
    this.eyeOffset += (0 - this.eyeOffset) * (1 - Math.exp(-10 * dt));

    // Head bob from speed, like DOOM's.
    this.speed = Math.hypot(this.vx, this.vz);
    if (this.onGround && !this.dead) this.bobPhase += dt * Math.min(this.speed, RUN) * 1.1;
    const bobAmp = Math.min(1, this.speed / RUN) * 0.07;
    this.bob = Math.sin(this.bobPhase * 2) * bobAmp * (this.dead ? 0 : 1);
    return { landed };
  }

  // The direction the player looks, as a unit vector.
  aim() {
    const cp = Math.cos(this.pitch);
    return { x: -Math.sin(this.yaw) * cp, y: Math.sin(this.pitch), z: -Math.cos(this.yaw) * cp };
  }
}
