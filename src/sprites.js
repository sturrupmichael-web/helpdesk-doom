// Sprites: flat pictures that always face the camera, like DOOM's monsters and items.
//
// Two sources:
//   - the 3D game's 16x16 pixel icons (src/ui/icons.js), for pickups;
//   - the 3D game's low-poly models (src/render/models.js), "baked" when the game loads:
//     each model is rendered from 8 directions (and in a few poses) into a sprite sheet,
//     the way DOOM's artists photographed clay models. So users look exactly like they do
//     in the 3D game, just flat and pixelated.

import * as THREE from 'three';
import { ICONS } from '../shared/src/ui/icons.js';
import { outlineMaterial } from '../shared/src/render/models.js';

const K = '#1a1c2c';

// Extra icons for things the 3D game never needed. Same format as ICONS:
// [x, y, w, h, color] rectangles on a 16x16 grid.
const EXTRA_ICONS = {
  ticketbox: [[1, 5, 14, 10, K], [2, 6, 12, 8, '#a0703c'], [2, 9, 12, 1, '#5d3a1a'], [3, 2, 10, 5, K], [4, 3, 8, 3, '#41a6f6'], [5, 4, 1, 1, '#f4f4f4'], [7, 4, 4, 1, '#f4f4f4']],
  inbox: [[1, 6, 14, 9, K], [2, 7, 12, 7, '#566c86'], [2, 2, 12, 6, K], [3, 3, 10, 4, '#f4f4f4'], [3, 3, 1, 1, K], [4, 4, 1, 1, K], [5, 5, 6, 1, K], [11, 4, 1, 1, K], [12, 3, 1, 1, K], [6, 10, 4, 2, '#b13e53']],
  spindle: [[7, 1, 2, 4, K], [2, 4, 12, 11, K], [3, 5, 10, 9, '#94b0c2'], [3, 7, 10, 1, '#566c86'], [3, 10, 10, 1, '#566c86'], [7, 5, 2, 9, '#f4f4f4']],
  ups: [[1, 3, 14, 12, K], [2, 4, 12, 10, '#36363b'], [3, 5, 4, 3, '#38b764'], [9, 5, 4, 1, '#94b0c2'], [9, 7, 4, 1, '#94b0c2'], [3, 10, 10, 3, '#4b4b52'], [12, 11, 1, 1, '#ffcd75']],
  // An access badge on its lanyard (the 3D tech's): the colored stripe is the access level.
  badge: [[3, 1, 2, 5, K], [11, 1, 2, 5, K], [4, 1, 1, 4, '#38b764'], [11, 1, 1, 4, '#38b764'], [3, 5, 10, 10, K], [4, 6, 8, 8, '#f4f4f4'], [4, 6, 8, 2, '#38b764'], [5, 9, 3, 3, '#f4c8a0'], [9, 9, 2, 1, '#94b0c2'], [9, 11, 2, 1, '#94b0c2'], [4, 13, 8, 1, '#38b764']],
  // PTO Request: a calendar page with a beach on it (the 3D game's PTO model).
  pto: [[2, 1, 12, 14, K], [3, 2, 10, 12, '#f4f4f4'], [3, 2, 10, 3, '#b13e53'], [5, 1, 1, 2, '#94b0c2'], [10, 1, 1, 2, '#94b0c2'], [3, 9, 10, 5, '#41a6f6'], [3, 12, 10, 2, '#ffcd75'], [6, 6, 3, 3, '#ffcd75']],
  // Bulk Close: the big red CLOSED stamp.
  bulk: [[6, 1, 4, 4, K], [7, 2, 2, 2, '#5d3a1a'], [7, 5, 2, 3, K], [2, 8, 12, 5, K], [3, 9, 10, 3, '#b13e53'], [3, 12, 10, 1, '#f4f4f4'], [1, 13, 14, 2, K]],
  // What users throw: the Phish Clicker's baited hook, the Printer Jammer's crumpled printouts.
  hook: [[6, 0, 2, 7, '#94b0c2'], [3, 6, 10, 7, K], [4, 7, 8, 5, '#f4f4f4'], [4, 7, 1, 1, K], [5, 8, 2, 1, K], [9, 8, 2, 1, K], [11, 7, 1, 1, K], [6, 13, 2, 3, '#94b0c2'], [8, 14, 2, 1, '#94b0c2'], [9, 12, 1, 2, '#94b0c2']],
  paper: [[3, 3, 10, 10, K], [2, 5, 12, 6, K], [4, 4, 8, 8, '#f4f4f4'], [3, 6, 10, 4, '#f4f4f4'], [5, 6, 3, 1, '#94b0c2'], [8, 9, 3, 1, '#94b0c2'], [6, 4, 1, 3, '#94b0c2'], [10, 6, 1, 2, '#94b0c2']],
  // The Synergy Consultants' slide deck, and the Hostile Takeover's memo folder.
  deck: [[1, 3, 14, 10, K], [2, 4, 12, 8, '#f4f4f4'], [2, 4, 12, 2, '#29366f'], [4, 10, 2, 1, '#ffcd75'], [7, 8, 2, 3, '#ffcd75'], [10, 6, 2, 5, '#38b764'], [3, 7, 1, 1, '#b13e53']],
  memo: [[2, 1, 12, 14, K], [3, 2, 10, 12, '#f4f4f4'], [3, 2, 10, 2, '#b13e53'], [4, 6, 8, 1, '#94b0c2'], [4, 8, 8, 1, '#94b0c2'], [4, 10, 5, 1, '#94b0c2'], [10, 11, 2, 2, '#b13e53']],
  floorplan: [[1, 2, 14, 12, K], [2, 3, 12, 10, '#f4f4f4'], [2, 7, 7, 1, K], [8, 3, 1, 4, K], [10, 7, 1, 6, K], [4, 10, 4, 1, '#b13e53'], [12, 4, 1, 1, '#38b764'], [3, 4, 2, 2, '#41a6f6']],
};

const iconRects = (name) => EXTRA_ICONS[name] ?? ICONS[name] ?? ICONS.ticket;

// Draws a pixel icon on a 16x16 canvas, optionally swapping colors.
export function iconCanvas(name, recolor = null, scale = 1) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 16 * scale;
  const ctx = canvas.getContext('2d');
  for (const [x, y, w, h, c] of iconRects(name)) {
    ctx.fillStyle = recolor?.[c] ?? c;
    ctx.fillRect(x * scale, y * scale, w * scale, h * scale);
  }
  return canvas;
}

export function pixelTexture(canvas) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const iconCache = new Map();
export function iconTexture(name, recolor) {
  const key = name + JSON.stringify(recolor ?? null);
  if (!iconCache.has(key)) iconCache.set(key, pixelTexture(iconCanvas(name, recolor)));
  return iconCache.get(key);
}

// A camera-facing quad standing on its bottom edge. `width` and `height` are scene units.
// `setFrame(u0, v0, u1, v1)` picks a cell of a sprite sheet.
export class Billboard {
  constructor(texture, width, height, { flip = false } = {}) {
    const g = new THREE.PlaneGeometry(1, 1);
    g.translate(0, 0.5, 0);
    this.geometry = g;
    this.material = new THREE.MeshBasicMaterial({ map: texture, alphaTest: 0.5, side: THREE.DoubleSide });
    this.mesh = new THREE.Mesh(g, this.material);
    this.mesh.scale.set(width, height, 1);
    this.flip = flip;
  }
  setTexture(tex) {
    if (this.material.map !== tex) this.material.map = tex;
  }
  setFrame(u0, v0, u1, v1, mirror = false) {
    const uv = this.geometry.attributes.uv;
    const a = mirror ? u1 : u0;
    const b = mirror ? u0 : u1;
    // PlaneGeometry corners: (top-left, top-right, bottom-left, bottom-right).
    uv.setXY(0, a, v1);
    uv.setXY(1, b, v1);
    uv.setXY(2, a, v0);
    uv.setXY(3, b, v0);
    uv.needsUpdate = true;
  }
  // Turns to face the camera around the vertical axis and takes the light of the floor
  // it stands on.
  place(x, y, z, yaw, light) {
    this.mesh.position.set(x, y, z);
    this.mesh.rotation.y = yaw;
    this.material.color.setScalar(light);
  }
}

// --- Baking models into sprite sheets ---------------------------------------------------

let bakeRig = null;
function rig(renderer) {
  if (bakeRig) return bakeRig;
  const scene = new THREE.Scene();
  scene.add(new THREE.AmbientLight(0xffffff, 1.4));
  const sun = new THREE.DirectionalLight(0xffffff, 2.4);
  scene.add(sun);
  scene.add(sun.target);
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 50);
  bakeRig = { renderer, scene, sun, camera };
  return bakeRig;
}

// Renders `object` (feet at y = 0, facing +z) into a sprite sheet. `views` is how many
// directions to render around it (8, or 1 for things that look the same from every side);
// `poses` is a list of functions that pose the object before a render (and get the pose
// index). Returns { texture, cols, rows, width, height, frame(view, pose) -> uv rect }.
// `pixels` is the frame height in pixels; frames are square-ish around the model.
export function bake(renderer, object, { views = 8, poses = [() => {}], pixels = 64, outline = true, pad = 1.08 } = {}) {
  const { scene, sun, camera } = rig(renderer);
  if (outline) addOutlines(object);
  scene.add(object);
  // Frame size: the biggest extent over all poses.
  const box = new THREE.Box3();
  const tmp = new THREE.Box3();
  poses.forEach((pose, i) => {
    pose(object, i);
    object.updateMatrixWorld(true);
    tmp.setFromObject(object);
    box.union(tmp);
  });
  const height = Math.max(0.2, box.max.y) * pad;
  const halfW = Math.max(Math.abs(box.min.x), Math.abs(box.max.x), Math.abs(box.min.z), Math.abs(box.max.z)) * pad;
  const width = Math.max(halfW * 2, 0.2);
  const pw = Math.max(8, Math.round((pixels * width) / height));
  const ph = pixels;
  const cols = views;
  const rows = poses.length;
  const rt = new THREE.WebGLRenderTarget(pw, ph);
  rt.texture.colorSpace = THREE.SRGBColorSpace;
  const canvas = document.createElement('canvas');
  canvas.width = pw * cols;
  canvas.height = ph * rows;
  const ctx = canvas.getContext('2d');
  const buf = new Uint8Array(pw * ph * 4);
  const img = ctx.createImageData(pw, ph);
  camera.left = -width / 2;
  camera.right = width / 2;
  camera.top = height;
  camera.bottom = 0;
  camera.updateProjectionMatrix();
  const oldTarget = renderer.getRenderTarget();
  const oldClear = renderer.getClearAlpha();
  const oldColor = new THREE.Color();
  renderer.getClearColor(oldColor);
  renderer.setClearColor(0x000000, 0);
  for (let p = 0; p < rows; p++) {
    poses[p](object, p);
    for (let v = 0; v < cols; v++) {
      // View v looks at the model's front rotated by v * 45 degrees (0 = from the front).
      const a = (v / views) * Math.PI * 2;
      const dx = Math.sin(a);
      const dz = Math.cos(a);
      camera.position.set(dx * 20, 0, dz * 20);
      camera.lookAt(0, 0, 0);
      camera.position.y = 0;
      sun.position.set(dx * 10 + dz * 4, 12, dz * 10 - dx * 4);
      renderer.setRenderTarget(rt);
      renderer.clear();
      renderer.render(scene, camera);
      renderer.readRenderTargetPixels(rt, 0, 0, pw, ph, buf);
      // GL rows are bottom-up.
      for (let y = 0; y < ph; y++) img.data.set(buf.subarray((ph - 1 - y) * pw * 4, (ph - y) * pw * 4), y * pw * 4);
      // Hard alpha, so the sprite has crisp pixel edges.
      for (let i = 3; i < img.data.length; i += 4) img.data[i] = img.data[i] > 100 ? 255 : 0;
      ctx.putImageData(img, v * pw, p * ph);
    }
  }
  renderer.setRenderTarget(oldTarget);
  renderer.setClearColor(oldColor, oldClear);
  scene.remove(object);
  rt.dispose();
  const texture = pixelTexture(canvas);
  return {
    texture,
    canvas,
    cols,
    rows,
    width,
    height,
    frame(view, pose) {
      return [view / cols, 1 - (pose + 1) / rows, (view + 1) / cols, 1 - pose / rows];
    },
  };
}

function addOutlines(object) {
  const meshes = [];
  object.traverse((o) => {
    if (o.isMesh && o.material !== outlineMaterial && !o.userData.noOutline) meshes.push(o);
  });
  for (const m of meshes) {
    if (m.children.some((c) => c.material === outlineMaterial)) continue;
    m.add(new THREE.Mesh(m.geometry, outlineMaterial));
  }
}

// Which of 8 views of a sprite to show: from the angle between the way the thing faces
// and the direction to the camera (DOOM's "rotations").
export function viewIndex(facing, fromX, fromZ, x, z, views = 8) {
  if (views === 1) return 0;
  const toCam = Math.atan2(fromX - x, fromZ - z); // angle of the camera as seen from the thing
  let a = toCam - facing;
  a = ((a % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  return Math.round(a / ((Math.PI * 2) / views)) % views;
}
