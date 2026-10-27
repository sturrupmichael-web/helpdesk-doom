// Particles: bullet puffs on walls, paper bursts when users are hit (in each user's colors
// from data/enemies.js `particle`), sparks, explosions. One instanced mesh of tiny
// camera-facing squares, so hundreds cost one draw call.

import * as THREE from 'three';

const MAX = 600;
const tmpM = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpS = new THREE.Vector3();
const tmpP = new THREE.Vector3();
const tmpC = new THREE.Color();

export class Particles {
  constructor(scene) {
    const g = new THREE.PlaneGeometry(1, 1);
    const m = new THREE.MeshBasicMaterial({ color: 0xffffff });
    this.mesh = new THREE.InstancedMesh(g, m, MAX);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.setColorAt(0, tmpC.set(0xffffff));
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    scene.add(this.mesh);
    this.list = [];
  }

  add(x, y, z, vx, vy, vz, life, size, color, gravity = 9, glow = false) {
    if (this.list.length >= MAX) this.list.shift();
    this.list.push({ x, y, z, vx, vy, vz, life, max: life, size, color: new THREE.Color(color), gravity, glow });
  }

  // A puff of dust where a shot hits a wall.
  puff(x, y, z, nx = 0, nz = 0) {
    for (let i = 0; i < 4; i++) this.add(x + nx * 0.05, y, z + nz * 0.05, nx * 0.6 + rnd(0.6), 0.6 + Math.random() * 0.8, nz * 0.6 + rnd(0.6), 0.35 + Math.random() * 0.2, 0.06 + Math.random() * 0.05, i % 2 ? '#94b0c2' : '#f4f4f4', -1);
    this.add(x + nx * 0.05, y, z + nz * 0.05, 0, 0, 0, 0.08, 0.12, '#ffcd75', 0, true);
  }

  // A burst of paper and sparks in `colors`, e.g. a user getting hit.
  burst(x, y, z, colors, count = 8, speed = 3) {
    for (let i = 0; i < count; i++) {
      this.add(x, y, z, rnd(speed), Math.random() * speed, rnd(speed), 0.5 + Math.random() * 0.5, 0.07 + Math.random() * 0.06, colors[i % colors.length], 9);
    }
  }

  explosion(x, y, z, radius = 3, colors = ['#ffcd75', '#ef7d57', '#b13e53', '#f4f4f4']) {
    for (let i = 0; i < 36; i++) {
      const s = radius * 2.2;
      this.add(x, y, z, rnd(s), Math.random() * s * 0.8, rnd(s), 0.3 + Math.random() * 0.5, 0.15 + Math.random() * 0.25, colors[i % colors.length], 2, true);
    }
  }

  update(dt, camera) {
    const list = this.list;
    let n = 0;
    tmpQ.copy(camera.quaternion);
    for (let i = 0; i < list.length; i++) {
      const p = list[i];
      p.life -= dt;
      if (p.life <= 0) continue;
      p.vy -= p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      list[n++] = p;
    }
    list.length = n;
    for (let i = 0; i < n; i++) {
      const p = list[i];
      const s = p.size * (p.glow ? Math.min(1, (p.life / p.max) * 1.5) : 1);
      tmpM.compose(tmpP.set(p.x, p.y, p.z), tmpQ, tmpS.set(s, s, s));
      this.mesh.setMatrixAt(i, tmpM);
      this.mesh.setColorAt(i, p.color);
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}

const rnd = (s) => (Math.random() - 0.5) * 2 * s;
