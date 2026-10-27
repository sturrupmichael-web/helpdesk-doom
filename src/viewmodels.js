// The weapons in your hands, as low-poly models built from the same primitives and palette
// as the 3D game's (src/render/models.js), drawn in the view scene on top of the world at
// low resolution so they pixelate like everything else. Also baked into the pickup sprites.

import * as THREE from 'three';
import { box, cyl, ball, merge, flatMaterial } from '../shared/src/render/models.js';
import { PALETTE as P } from '../shared/data/palette.js';
import { pixelTexture } from './sprites.js';

// A cylinder lying along -z (a barrel), centered on (x, y, z).
function barrel(r, len, color, x, y, z, sides = 8, r2 = r) {
  const g = cyl(r, r2, len, color, 0, 0, 0, sides);
  g.translate(0, -len / 2, 0);
  g.rotateX(-Math.PI / 2);
  g.translate(x, y, z);
  return g;
}
const torus = (r, t, color, x, y, z, rx = 0, ry = 0) => {
  const g = new THREE.TorusGeometry(r, t, 5, 14).toNonIndexed();
  g.rotateX(rx);
  g.rotateY(ry);
  g.translate(x, y, z);
  const c = new THREE.Color(color);
  const n = g.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) arr.set([c.r, c.g, c.b], i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  g.deleteAttribute('uv');
  return g;
};

// The tech's right hand and blue polo sleeve, coming in from the bottom right.
const hand = (x = 0, y = -0.06, z = 0.08) => [
  barrel(0.055, 0.34, P.b, x + 0.05, y - 0.08, z + 0.2, 8, 0.065),
  ball(0.055, P.s, x, y, z, 1),
];

const mesh = (parts) => new THREE.Mesh(merge(parts), flatMaterial);

// Each builder returns { root, muzzle (local point), parts it animates }.
const BUILD = {
  cable() {
    const root = new THREE.Group();
    root.add(mesh([...hand(0, -0.04, 0.02), torus(0.07, 0.014, P.y, 0.0, 0.0, 0.02, 0, Math.PI / 2), torus(0.055, 0.014, P.y, 0.0, 0.0, 0.03, 0, Math.PI / 2 + 0.3)]));
    // The plug end, whipped forward on each swing.
    const plug = new THREE.Group();
    plug.add(mesh([barrel(0.012, 0.22, P.y, 0, 0, -0.11), box(0.035, 0.03, 0.06, '#d8e4ea', 0, -0.015, -0.24), box(0.02, 0.008, 0.02, P.y, 0, 0.012, -0.25)]));
    plug.position.set(-0.02, 0.0, -0.02);
    root.add(plug);
    return { root, plug, muzzle: new THREE.Vector3(0, 0, -0.3) };
  },
  autoClose() {
    const root = new THREE.Group();
    root.add(mesh([
      box(0.07, 0.07, 0.3, P.g, 0, 0, -0.14), // label-printer body
      box(0.07, 0.025, 0.3, P.G, 0, 0.07, -0.14),
      box(0.05, 0.04, 0.06, P.k, 0, 0.015, -0.31), // nozzle
      box(0.05, 0.004, 0.09, P.w, 0, 0.097, -0.2), // a ticket sticking out of the top
      box(0.035, 0.025, 0.005, P.B, 0.0, 0.04, 0.012), // screen on the back
      box(0.05, 0.12, 0.06, P.k, 0, -0.12, 0.0), // grip
      ...hand(0, -0.09, 0.03),
    ]));
    return { root, muzzle: new THREE.Vector3(0, 0.035, -0.38) };
  },
  replyAll() {
    const root = new THREE.Group();
    root.add(mesh([
      barrel(0.035, 0.5, P.B, -0.04, 0.05, -0.2, 6),
      barrel(0.035, 0.5, P.B, 0.04, 0.05, -0.2, 6),
      box(0.16, 0.08, 0.2, P.n, 0, -0.01, 0.0), // receiver
      box(0.1, 0.06, 0.004, P.w, 0, 0.0, -0.1), // envelope decal
      box(0.08, 0.004, 0.06, P.r, 0, 0.07, 0.02),
      box(0.05, 0.12, 0.06, P.k, 0, -0.13, 0.06),
      ...hand(0, -0.1, 0.08),
    ]));
    const pump = new THREE.Group();
    pump.add(mesh([box(0.12, 0.05, 0.14, P.k, 0, -0.02, -0.25), ball(0.05, P.s, -0.02, -0.04, -0.26, 1), barrel(0.05, 0.3, P.b, -0.1, -0.1, -0.05, 8, 0.06)]));
    root.add(pump);
    return { root, pump, muzzle: new THREE.Vector3(0, 0.05, -0.48) };
  },
  powershell() {
    const root = new THREE.Group();
    root.add(mesh([
      box(0.12, 0.1, 0.24, P.b, 0, -0.06, 0.04), // the blue console window
      box(0.12, 0.025, 0.24, P.g, 0, 0.04, 0.04),
      box(0.004, 0.04, 0.1, P.w, -0.061, -0.03, 0.04), // ">_" on the side
      box(0.05, 0.12, 0.06, P.k, 0, -0.16, 0.08),
      ...hand(0, -0.12, 0.1),
    ]));
    const barrels = new THREE.Group();
    const parts = [barrel(0.02, 0.06, P.k, 0, 0, -0.03, 6)];
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      parts.push(barrel(0.017, 0.34, P.G, Math.cos(a) * 0.04, Math.sin(a) * 0.04, -0.17, 6));
    }
    parts.push(torus(0.05, 0.01, P.k, 0, 0, -0.3, 0, 0));
    barrels.add(mesh(parts));
    barrels.position.set(0, -0.01, -0.08);
    root.add(barrels);
    return { root, barrels, muzzle: new THREE.Vector3(0, -0.01, -0.45) };
  },
  reimage() {
    const root = new THREE.Group();
    root.add(mesh([
      barrel(0.075, 0.6, P.G, 0, 0.02, -0.18, 10),
      barrel(0.08, 0.06, P.o, 0, 0.02, -0.44, 10), // orange warning bands
      barrel(0.08, 0.04, P.o, 0, 0.02, -0.02, 10),
      box(0.1, 0.008, 0.1, P.k, 0, 0.1, -0.15), // the disc slot
      box(0.05, 0.12, 0.06, P.k, 0, -0.16, 0.04),
      ...hand(0, -0.12, 0.06),
    ]));
    // A disc sitting in the slot, ready to go.
    const disc = new THREE.Group();
    disc.add(mesh([cyl(0.05, 0.05, 0.006, P.g, 0, 0, 0, 12), cyl(0.012, 0.012, 0.008, P.B, 0, 0, 0, 8)]));
    disc.position.set(0, 0.1, -0.15);
    root.add(disc);
    return { root, disc, muzzle: new THREE.Vector3(0, 0.02, -0.5) };
  },
  reboot() {
    const root = new THREE.Group();
    root.add(mesh([
      box(0.18, 0.13, 0.4, P.k, 0, -0.1, -0.12),
      box(0.14, 0.025, 0.34, P.G, 0, 0.03, -0.12),
      barrel(0.05, 0.12, P.G, 0, -0.03, -0.36, 10),
      box(0.05, 0.12, 0.06, P.k, 0, -0.2, 0.06),
      ...hand(0, -0.14, 0.08),
    ]));
    // The big glowing power symbol on the front: drawn unlit so it glows.
    const glow = new THREE.Group();
    const ring = new THREE.Mesh(torus(0.065, 0.014, P.q, 0, -0.03, -0.43, 0, 0), new THREE.MeshBasicMaterial({ vertexColors: true }));
    const bar = new THREE.Mesh(box(0.018, 0.07, 0.02, P.q, 0, -0.04, -0.43), new THREE.MeshBasicMaterial({ vertexColors: true }));
    glow.add(ring, bar);
    root.add(glow);
    return { root, glow, muzzle: new THREE.Vector3(0, -0.03, -0.48) };
  },
};

export const buildWeaponModel = (id) => BUILD[id]();

// A star-shaped muzzle flash picture.
function flashTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const ctx = c.getContext('2d');
  const rays = 7;
  for (const [r, color] of [[15, P.o], [11, P.y], [6, P.w]]) {
    ctx.fillStyle = color;
    ctx.beginPath();
    for (let i = 0; i < rays * 2; i++) {
      const a = (i / (rays * 2)) * Math.PI * 2;
      const rr = i % 2 ? r * 0.45 : r;
      ctx.lineTo(16 + Math.cos(a) * rr, 16 + Math.sin(a) * rr);
    }
    ctx.fill();
  }
  return pixelTexture(c);
}

const BASE = new THREE.Vector3(0.05, -0.2, -0.36);

// The weapon in your hands: which model is up, raising/lowering when switching, recoil,
// bob, the muzzle flash, and the lights of the view scene following the room's light.
export class ViewWeapon {
  constructor(scene) {
    this.scene = scene;
    this.ambient = new THREE.AmbientLight(0xffffff, 1.2);
    this.sun = new THREE.DirectionalLight(0xffffff, 2.2);
    this.sun.position.set(-0.4, 1, 0.6);
    scene.add(this.ambient, this.sun);
    this.models = {};
    this.current = null;
    this.holder = new THREE.Group();
    this.holder.scale.setScalar(0.8);
    scene.add(this.holder);
    this.flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: flashTexture(), depthTest: false, transparent: true }));
    this.flash.visible = false;
    this.flashT = 0;
    this.kick = 0;
    this.swing = 0;
    this.spin = 0;
    this.drop = 1; // 0 = up, 1 = fully lowered
  }

  show(id) {
    if (this.current?.id === id) return;
    if (this.current) this.holder.remove(this.current.root);
    this.current = this.models[id] ??= { id, ...buildWeaponModel(id) };
    this.holder.add(this.current.root);
    this.current.root.add(this.flash);
    this.flash.position.copy(this.current.muzzle);
  }

  // Shot fired: recoil and flash (`flash` false for melee).
  fired(flash = true, size = 0.18) {
    this.kick = 1;
    if (flash) {
      this.flashT = 0.06;
      this.flash.visible = true;
      this.flash.scale.setScalar(size * (0.85 + Math.random() * 0.3));
      this.flash.material.rotation = Math.random() * Math.PI * 2;
    }
    if (this.current?.plug) this.swing = 1;
  }

  // `drop` (0..1) is how far it's lowered; `bob` {x, y} from walking; `light` 0..1.
  update(dt, { drop, bobX, bobY, light, firing, windup }) {
    this.drop = drop;
    this.kick = Math.max(0, this.kick - dt * 6);
    this.swing = Math.max(0, this.swing - dt * 2.6);
    this.flashT -= dt;
    if (this.flashT <= 0) this.flash.visible = false;
    const m = this.current;
    if (!m) return;
    const k = this.kick * this.kick;
    m.root.position.set(BASE.x + bobX, BASE.y + bobY - drop * 0.45 - k * 0.02, BASE.z + k * 0.06);
    m.root.rotation.set(k * 0.12, 0.07, 0);
    if (m.barrels) {
      this.spin += dt * (firing ? 30 : 3) * (firing ? 1 : Math.max(0, this.spin > 0 ? 1 : 0));
      m.barrels.rotation.z = this.spin;
    }
    if (m.pump) m.pump.position.z = Math.sin(Math.min(1, Math.max(0, 1 - this.kick) * Math.PI)) * 0.08 * (this.kick > 0 ? 1 : 0);
    if (m.plug) {
      // Whip: the plug flicks forward and across.
      const s = Math.sin(this.swing * Math.PI);
      m.plug.position.set(-0.02 - s * 0.08, s * 0.04, -0.02 - s * 0.1);
      m.plug.rotation.set(0, s * 1.2, s * 0.6);
    }
    if (m.disc) m.disc.visible = this.kick < 0.5;
    if (m.glow) m.glow.scale.setScalar(1 + (windup ?? 0) * 0.6 + Math.sin(performance.now() / 120) * 0.05);
    this.ambient.intensity = 0.4 + light * 1.2;
    this.sun.intensity = 0.6 + light * 2.0;
  }
}
