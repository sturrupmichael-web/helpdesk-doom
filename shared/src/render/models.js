// What everything looks like: low-poly models built from primitives, colored per vertex
// from the original palette (data/palette.js) and drawn with one flat-shaded material.
//
// This is the one place that knows about shapes. Gameplay never sees it, and the rest of
// the renderer only asks for "the player model" or "the geometry of a cubicle row", so a
// glTF loader can take over any entry here later without touching anything else.
//
// Sizes are in scene units: 1 unit = 16 world px (about a metre: the tech is ~1.65 tall, big head and all).

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { PALETTE as P } from '../../data/palette.js';

export const UNIT = 16; // world px per scene unit
export const px = (v) => v / UNIT;

// One material for every vertex-colored model, so meshes batch well.
export const flatMaterial = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });

// People are toon-shaded: light falls off in two hard steps instead of a smooth ramp.
const toonSteps = new THREE.DataTexture(new Uint8Array([150, 255]), 2, 1, THREE.RedFormat);
toonSteps.minFilter = toonSteps.magFilter = THREE.NearestFilter;
toonSteps.needsUpdate = true;
export const toonMaterial = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toonSteps });

// Users flash white when hit. Each instance gets an `aFlash` value (0..1) that mixes its
// color toward white, set by the renderer from the simulation's `flash` timer.
export const flashToonMaterial = toonMaterial.clone();
flashToonMaterial.onBeforeCompile = (shader) => {
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nattribute float aFlash;\nvarying float vFlash;')
    .replace('#include <begin_vertex>', '#include <begin_vertex>\nvFlash = aFlash;');
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', '#include <common>\nvarying float vFlash;')
    .replace('#include <dithering_fragment>', '#include <dithering_fragment>\ngl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(1.0), vFlash);');
};
flashToonMaterial.customProgramCacheKey = () => 'flash';

// ...and outlined, like the original sprites: an "inverted hull", the same geometry drawn
// again in dark ink with its back faces only, pushed out along the normals. Works with
// instancing too (the instance matrix is applied after the push).
export const OUTLINE = 0.028; // outline thickness, scene units
export const outlineMaterial = new THREE.MeshBasicMaterial({ color: P.k, side: THREE.BackSide });
outlineMaterial.onBeforeCompile = (shader) => {
  shader.vertexShader = shader.vertexShader.replace(
    '#include <begin_vertex>',
    `#include <begin_vertex>
    transformed += normal * ${OUTLINE.toFixed(3)};`,
  );
};

// A mesh's outline: a child that shares its geometry.
export function outlined(mesh) {
  const ink = new THREE.Mesh(mesh.geometry, outlineMaterial);
  mesh.add(ink);
  return mesh;
}

const tmpColor = new THREE.Color();
const tmpMatrix = new THREE.Matrix4();
const tmpEuler = new THREE.Euler();
const tmpQuat = new THREE.Quaternion();
const tmpPos = new THREE.Vector3();
const tmpScale = new THREE.Vector3(1, 1, 1);

// Paints a geometry one color (writes its `color` attribute) and moves it into place.
// Every part ends up non-indexed (flat shading needs no shared vertices), so all merge.
function paint(geo, color, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  if (geo.index) {
    const flat = geo.toNonIndexed();
    geo.dispose();
    geo = flat;
  }
  tmpColor.set(color);
  const n = geo.attributes.position.count;
  const c = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    c[i * 3] = tmpColor.r;
    c[i * 3 + 1] = tmpColor.g;
    c[i * 3 + 2] = tmpColor.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(c, 3));
  geo.deleteAttribute('uv'); // no textures on models; keeps every part mergeable
  tmpQuat.setFromEuler(tmpEuler.set(rx, ry, rz));
  geo.applyMatrix4(tmpMatrix.compose(tmpPos.set(x, y, z), tmpQuat, tmpScale));
  return geo;
}

// Primitive helpers. Boxes and cylinders sit on their base: (x, y, z) is the bottom center.
export const box = (w, h, d, color, x = 0, y = 0, z = 0, ry = 0) =>
  paint(new THREE.BoxGeometry(w, h, d), color, x, y + h / 2, z, 0, ry);
export const cyl = (rTop, rBottom, h, color, x = 0, y = 0, z = 0, sides = 8) =>
  paint(new THREE.CylinderGeometry(rTop, rBottom, h, sides), color, x, y + h / 2, z);
// Centered shapes (for heads, foliage, cups).
export const ball = (r, color, x, y, z, detail = 0) => paint(new THREE.IcosahedronGeometry(r, detail), color, x, y, z);
const rotBox = (w, h, d, color, x, y, z, rx = 0, ry = 0, rz = 0) => paint(new THREE.BoxGeometry(w, h, d), color, x, y, z, rx, ry, rz);

export const merge = (parts) => {
  const g = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  return g;
};

// Far-away users can be built with fewer segments (lowDetail below): `seg(n, min)` is the
// segment count to use, n normally, about half of it (at least `min`) in low detail.
let low = false;
const seg = (n, min) => (low ? Math.max(min, Math.round(n * 0.55)) : n);
export function lowDetail(build) {
  low = true;
  try {
    return build();
  } finally {
    low = false;
  }
}

// Soft shapes for people: rounded and low-poly, so the cast reads as cartoon office
// workers rather than voxels. `sx, sy, sz` squash a shape before it's placed.
const shaped = (geo, color, x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) => {
  geo.scale(sx, sy, sz);
  return paint(geo, color, x, y, z, rx, ry, rz);
};
const sphere = (r, color, x, y, z, sx = 1, sy = 1, sz = 1, w = 7, h = 5) =>
  shaped(new THREE.SphereGeometry(r, seg(w, 4), seg(h, 3)), color, x, y, z, 0, 0, 0, sx, sy, sz);
// A capsule centered on (x, y, z), tilted by rz (sideways) and rx (forward).
const capsule = (r, len, color, x, y, z, rx = 0, rz = 0) =>
  shaped(new THREE.CapsuleGeometry(r, len, 1, seg(6, 4)), color, x, y, z, rx, 0, rz);
// A turned shape from a [radius, height] profile (bodies, skirts).
const lathe = (profile, color, segments = 10) =>
  paint(new THREE.LatheGeometry(profile.map(([r, h]) => new THREE.Vector2(r, h)), seg(segments, 5)), color);
// Hair: a cap over the head, tilted back so it covers more at the back than the front.
// `reach` is how far down it comes (radians from the crown).
const hairCap = (r, color, y, reach, tilt = -0.45, sx = 1.04) =>
  shaped(new THREE.SphereGeometry(r, seg(10, 5), seg(6, 3), 0, Math.PI * 2, 0, reach), color, 0, y, -0.01, tilt, 0, 0, sx, 1, 1);

// Everyone shares a body plan (feet at y = 0, facing +z): a big round head, a bean of
// a torso, short limbs. Heights in scene units.
const HEAD_Y = 1.26;
const HEAD_R = 0.33;
const TORSO = [[0, 0.42], [0.22, 0.43], [0.28, 0.52], [0.285, 0.7], [0.24, 0.88], [0.15, 0.97], [0, 0.99]];

function head(parts, skin, hair, hairStyle) {
  parts.push(
    sphere(0.1, skin, 0, 1.0, 0, 1, 1, 1, 6, 3), // neck
    sphere(HEAD_R, skin, 0, HEAD_Y, 0, 1, 0.95, 0.95, 10, 7),
    sphere(0.03, P.k, -0.11, HEAD_Y + 0.02, HEAD_R * 0.95, 0.8, 1.3, 0.5, 5, 3), // eyes (small: the outline fattens them)
    sphere(0.03, P.k, 0.11, HEAD_Y + 0.02, HEAD_R * 0.95, 0.8, 1.3, 0.5, 5, 3),
  );
  if (hairStyle === 'none') return; // the techs do their own (hair below)
  if (hairStyle === 'bob') parts.push(hairCap(HEAD_R + 0.03, hair, HEAD_Y + 0.02, 1.95, -0.5, 1.1));
  else parts.push(hairCap(HEAD_R + 0.025, hair, HEAD_Y + 0.02, 1.45, -0.45));
}

// --- The techs -----------------------------------------------------------------------
// Every playable tech from the original's sprites (sprites/defs/characters.js), on one
// body with moving limbs. TECH_LOOKS (keyed by data/player.js character id) says what each
// one wears and carries:
//   hair, skin, top, pants   colors
//   hairStyle  'short' (default), 'bald', 'balding', 'buzz' or 'fohawk'
//   beard      color of a short beard
//   collar     polo collar color; hood: a hood round the neck instead
//   shirt, tie a shirt showing at the neck, and a tie
//   build      'chubby' or 'skinny'; size: 'tall' or 'short'
//   headset, lanyard, glasses
//   chest      decals and pins on the front (CHEST below)
//   right, left  what's in each hand (HELD below); hip: something on the belt
const TECH_LOOKS = {
  // Tier 1 Tech: brown hair, grey headset with a boom mic, blue polo, yellow lanyard and
  // white badge, navy trousers.
  tier1: { hair: P.h, top: P.b, pants: P.n, collar: P.w, headset: true, lanyard: true },
  // Desktop Support: green polo, khakis, lanyard, carrying a red toolbag.
  desktop: { hair: P.k, skin: P.S, top: P.e, pants: P.d, collar: P.w, lanyard: true, right: 'toolbag' },
  // SysAdmin: black tee with a terminal prompt, beard, mug of very old coffee.
  sysadmin: { hair: P.h, beard: P.h, top: P.K, pants: P.n, chest: ['prompt'], right: 'mug' },
  // SecOps Analyst: gray hoodie, gold shield badge, tablet with a green lock screen.
  secops: { hair: P.r, top: P.G, pants: P.k, hood: P.G, chest: ['shield'], left: 'lockTablet' },
  // Network Engineer: light-blue shirt, a coil of yellow patch cable over the shoulder, and
  // a crimping tool.
  neteng: { hair: P.h, top: P.B, pants: P.k, collar: P.B, chest: ['coil'], right: 'crimper' },
  // Help Desk Manager: white shirt, purple tie, grey hair, reading glasses, clipboard.
  manager: { hair: P.G, top: P.w, pants: P.n, tie: P.p, glasses: true, right: 'clipboard' },
  // The Intern: orange hoodie, INTERN badge, carrying a tray of four coffees.
  intern: { hair: P.y, top: P.o, pants: P.n, hood: P.o, chest: ['badge'], right: 'tray' },
  // Cloud Architect: cyan tee with a cloud logo, laptop open on one arm.
  cloud: { hair: P.k, top: P.q, pants: P.k, chest: ['cloud'], left: 'laptop' },
  // Help Desk Supervisor: purple polo, headset, clipboard with the queue on it.
  supervisor: { hair: P.h, top: P.p, pants: P.k, collar: P.w, headset: true, right: 'queueClipboard' },
  // Systems Operations Manager: navy polo, yellow lanyard, a tablet with the fleet dashboard.
  sysops: { hair: P.K, top: P.A, pants: P.K, collar: P.A, lanyard: true, left: 'dashboard' },
  // IT Director: bald, short beard, navy blazer over a white shirt and red tie, leather
  // portfolio. No headset.
  director: { hair: P.h, hairStyle: 'bald', beard: P.h, top: P.a, pants: P.a, shirt: P.w, tie: P.r, right: 'portfolio' },
  // CRM Analyst: blonde, chubby, black polo, two spreadsheets open on one tiny laptop.
  crmAnalyst: { hair: P.y, top: P.K, pants: P.n, collar: P.w, build: 'chubby', right: 'spreadsheets' },
  // CRM Manager: tall, white polo, khakis, an orange disc golf driver ready to throw.
  crmManager: { hair: P.h, top: P.w, pants: P.d, collar: P.g, size: 'tall', right: 'disc' },
  // Cloud Engineer: navy hoodie with a cloud logo, black hair, a pager on the belt.
  cloudEng: { hair: P.K, skin: P.S, top: P.n, pants: P.k, hood: P.A, chest: ['cloud'], hip: 'pager' },
  // Systems Engineer: balding, skinny, light-blue shirt, khakis, a screwdriver in the pocket.
  syseng: { hair: P.h, hairStyle: 'balding', top: P.B, pants: P.d, collar: P.B, build: 'skinny', chest: ['pocket'] },
  // EUC Engineer: short, skinny, green polo, a stack of fresh laptops under one arm.
  euc: { hair: P.K, skin: P.u, top: P.e, pants: P.n, collar: P.w, build: 'skinny', size: 'short', left: 'laptops' },
  // Security Manager: red hoodie, short black hair, short beard, a gold padlock pin.
  secmgr: { hair: P.K, beard: P.K, top: P.r, pants: P.k, hood: P.k, chest: ['padlock'] },
  // Security Engineer: fo-hawk, Hawaiian shirt, a laptop full of green text.
  seceng: { hair: P.h, hairStyle: 'fohawk', top: P.o, pants: P.n, collar: P.o, chest: ['flowers'], left: 'terminal' },
  // Asset Management Analyst: buzzcut, khaki shirt, a label gun holstered at the hip.
  assets: { hair: P.h, hairStyle: 'buzz', top: P.d, pants: P.n, collar: P.w, hip: 'labelGun' },
};

// A point on the front of the torso at height y and angle a (0 = straight ahead), pushed
// out by `out`: where chest decals go.
function torsoPoint(y, a, out = 0.01, widen = 1) {
  let r = TORSO[0][0];
  for (let i = 1; i < TORSO.length; i++) {
    const [r0, y0] = TORSO[i - 1];
    const [r1, y1] = TORSO[i];
    if (y >= y0 && y <= y1) r = r0 + ((r1 - r0) * (y - y0)) / (y1 - y0);
  }
  r = r * widen + out;
  return [Math.sin(a) * r, y, Math.cos(a) * r];
}

// Decals and pins on the front of the torso. `w` widens them for a chubby build.
const CHEST = {
  // >_ on a black tee.
  prompt: (w) => {
    const [x, y, z] = torsoPoint(0.66, -0.2, 0.0, w);
    return [rotBox(0.07, 0.025, 0.02, P.e, x - 0.02, y + 0.02, z, 0, -0.2, -0.6), rotBox(0.07, 0.025, 0.02, P.e, x - 0.02, y - 0.02, z, 0, -0.2, 0.6), rotBox(0.08, 0.025, 0.02, P.e, x + 0.07, y - 0.04, z - 0.01, 0, -0.1)];
  },
  shield: (w) => {
    const [x, y, z] = torsoPoint(0.74, 0.3, 0, w);
    return [shaped(new THREE.CylinderGeometry(0.06, 0.035, 0.08, 6), P.y, x, y, z, Math.PI / 2, 0.3, 0, 1, 1, 0.35)];
  },
  badge: (w) => {
    const [x, y, z] = torsoPoint(0.68, 0.15, 0.005, w);
    return [rotBox(0.12, 0.08, 0.02, P.w, x, y, z, 0, 0.15)];
  },
  cloud: (w) => {
    const [x, y, z] = torsoPoint(0.68, 0, -0.01, w);
    return [sphere(0.05, P.w, x - 0.05, y, z, 1, 0.8, 0.4), sphere(0.06, P.w, x + 0.01, y + 0.025, z, 1, 0.8, 0.4), sphere(0.045, P.w, x + 0.06, y - 0.005, z, 1, 0.8, 0.4)];
  },
  padlock: (w) => {
    const [x, y, z] = torsoPoint(0.74, 0.35, 0, w);
    return [rotBox(0.07, 0.06, 0.03, P.y, x, y, z, 0, 0.35), paint(new THREE.TorusGeometry(0.025, 0.01, 4, 8, Math.PI), P.y, x, y + 0.03, z, 0, 0.35)];
  },
  // A pocket with a screwdriver in it.
  pocket: (w) => {
    const [x, y, z] = torsoPoint(0.72, -0.35, 0.005, w);
    return [rotBox(0.1, 0.1, 0.02, P.b, x, y, z, 0, -0.35), capsule(0.012, 0.05, P.r, x, y + 0.08, z + 0.01), capsule(0.008, 0.04, P.g, x, y + 0.13, z + 0.01)];
  },
  // Yellow and green flowers on a Hawaiian shirt.
  flowers: (w) =>
    [[0.6, -0.5], [0.78, -0.15], [0.55, 0.25], [0.74, 0.55], [0.5, 0], [0.66, 0.9], [0.62, -0.9]].flatMap(([y, a]) => {
      const [x, yy, z] = torsoPoint(y, a, 0, w);
      return [sphere(0.035, P.y, x, yy, z, 1, 1, 0.5, 6, 4), sphere(0.015, P.e, x + Math.cos(a) * 0.002, yy, z + 0.012, 1, 1, 1, 4, 3)];
    }),
  // A coil of patch cable over the left shoulder.
  coil: () => [paint(new THREE.TorusGeometry(0.15, 0.025, 4, 12), P.y, -0.18, 0.86, 0.02, 0, Math.PI / 2 - 0.3, 0.7), capsule(0.02, 0.06, P.y, -0.2, 0.68, 0.22)],
};

// Held things, in the arm's own space: the hand is at about (side * 0.07, -0.42, 0).
// `s` is the side (-1 left, 1 right).
const laptop = (screen, s, extra = []) => [
  rotBox(0.32, 0.03, 0.22, P.g, s * 0.1, -0.45, 0.12),
  rotBox(0.32, 0.22, 0.025, P.k, s * 0.1, -0.33, 0.01, -0.25),
  rotBox(0.28, 0.18, 0.03, screen, s * 0.1, -0.33, 0.013, -0.25),
  ...extra,
];
const tablet = (screen, s, extra = []) => [rotBox(0.22, 0.28, 0.03, P.k, s * 0.04, -0.4, 0.14, -0.7), rotBox(0.18, 0.23, 0.03, screen, s * 0.04, -0.395, 0.15, -0.7), ...extra];
const board = (s, lines) => [
  rotBox(0.22, 0.3, 0.025, P.d, s * 0.06, -0.38, 0.12, -0.35),
  rotBox(0.18, 0.24, 0.03, P.w, s * 0.06, -0.39, 0.125, -0.35),
  rotBox(0.08, 0.035, 0.035, P.G, s * 0.06, -0.24, 0.07, -0.35),
  ...lines.map((c, i) => rotBox(0.12, 0.025, 0.035, c, s * 0.06, -0.33 - i * 0.05, 0.11 + i * 0.018, -0.35)),
];
const HELD = {
  toolbag: (s) => [rotBox(0.24, 0.16, 0.13, P.r, s * 0.08, -0.6, 0.02), rotBox(0.06, 0.03, 0.135, P.w, s * 0.08, -0.6, 0.025), paint(new THREE.TorusGeometry(0.05, 0.014, 4, 8, Math.PI), P.k, s * 0.08, -0.52, 0.02)],
  mug: (s) => [cyl(0.065, 0.06, 0.13, P.w, s * 0.08, -0.5, 0.1), cyl(0.055, 0.055, 0.01, P.h, s * 0.08, -0.375, 0.1), paint(new THREE.TorusGeometry(0.035, 0.012, 4, 8), P.w, s * 0.15, -0.44, 0.1, 0, Math.PI / 2)],
  lockTablet: (s) => tablet(P.B, s, [rotBox(0.07, 0.07, 0.035, P.e, s * 0.04, -0.4, 0.155, -0.7)]),
  crimper: (s) => [capsule(0.018, 0.12, P.G, s * 0.06, -0.5, 0.06, 0.4, s * 0.25), capsule(0.018, 0.12, P.G, s * 0.1, -0.5, 0.06, 0.4, -s * 0.25), rotBox(0.04, 0.04, 0.04, P.y, s * 0.08, -0.6, 0.11)],
  clipboard: (s) => board(s, [P.r, P.r, P.e]),
  queueClipboard: (s) => board(s, [P.B, P.B, P.B]),
  tray: (s) => [
    rotBox(0.34, 0.03, 0.22, P.d, s * 0.04, -0.45, 0.14),
    ...[[-0.09, 0.08], [0.09, 0.08], [-0.09, 0.2], [0.09, 0.2]].flatMap(([x, z]) => [cyl(0.04, 0.035, 0.11, P.w, s * 0.04 + x, -0.435, z), cyl(0.042, 0.042, 0.02, P.h, s * 0.04 + x, -0.33, z)]),
  ],
  laptop: (s) => laptop(P.B, s),
  dashboard: (s) => tablet(P.n, s, [[-0.05, 0.03], [0.04, 0.03], [-0.05, -0.05], [0.04, -0.05]].map(([x, y], i) => rotBox(0.06, 0.05, 0.035, i === 2 ? P.r : P.e, s * 0.04 + x, -0.4 + y, 0.155 - y * 0.6, -0.7))),
  portfolio: (s) => [rotBox(0.24, 0.3, 0.04, P.h, s * 0.1, -0.5, 0.0, 0, 0, 0)],
  spreadsheets: (s) => laptop(P.w, s, [rotBox(0.02, 0.18, 0.035, P.k, s * 0.1, -0.33, 0.016, -0.25), rotBox(0.1, 0.03, 0.035, P.e, s * 0.04, -0.3, 0.02, -0.25), rotBox(0.1, 0.03, 0.035, P.e, s * 0.16, -0.36, 0.035, -0.25)]),
  disc: (s) => [shaped(new THREE.CylinderGeometry(0.14, 0.14, 0.035, 12), P.o, s * 0.12, -0.42, 0.1, 0.3, 0, Math.PI / 2 - 0.2), shaped(new THREE.CylinderGeometry(0.07, 0.07, 0.04, 10), P.w, s * 0.12, -0.42, 0.1, 0.3, 0, Math.PI / 2 - 0.2)],
  laptops: (s) => [P.g, P.G, P.g].map((c, i) => rotBox(0.07, 0.26, 0.34, c, s * 0.06, -0.32 + i * 0.075, 0.04)),
  terminal: (s) => laptop(P.k, s, [[0.05, -0.32], [0, -0.36], [0.08, -0.4]].map(([x, y]) => rotBox(0.1, 0.022, 0.035, P.e, s * 0.1 + x - 0.04, y + 0.03, 0.02 + (-0.33 - y) * 0.25, -0.25))),
};

// Things on the belt, in the body's space.
const HIP = {
  pager: () => [rotBox(0.1, 0.08, 0.05, P.k, 0.25, 0.47, 0.08, 0, 0.6), rotBox(0.06, 0.03, 0.02, P.e, 0.265, 0.48, 0.11, 0, 0.6)],
  labelGun: () => [rotBox(0.08, 0.16, 0.12, P.k, 0.27, 0.42, 0.02), rotBox(0.07, 0.1, 0.16, P.y, 0.28, 0.52, 0.05), rotBox(0.06, 0.05, 0.08, P.w, 0.29, 0.52, 0.15)],
};

// Hair for each style, on a head of radius HEAD_R at HEAD_Y.
function hair(parts, color, style) {
  if (style === 'bald') return; // the beard and a shine do the work
  if (style === 'balding') {
    // A horseshoe round the back and sides.
    parts.push(paint(new THREE.TorusGeometry(HEAD_R * 0.97, 0.075, 5, 12, Math.PI * 1.25), color, 0, HEAD_Y + 0.02, -0.03, Math.PI / 2, 0, Math.PI * 0.875));
    return;
  }
  if (style === 'buzz') {
    parts.push(hairCap(HEAD_R + 0.012, color, HEAD_Y + 0.02, 1.4, -0.45, 1.01));
    return;
  }
  if (style === 'fohawk') {
    // Shaved sides, one ridge front to back.
    parts.push(shaped(new THREE.SphereGeometry(0.1, 6, 5), color, 0, HEAD_Y + HEAD_R - 0.01, -0.04, 0, 0, 0, 0.7, 1.15, 3.2));
    return;
  }
  parts.push(hairCap(HEAD_R + 0.025, color, HEAD_Y + 0.02, 1.45, -0.45));
}

// Returns { root, legL, legR, armL, armR, body, material } so the renderer can animate
// the limbs. Each tech has a material of their own, so they can flash when hurt (its
// emissive color).
export function createTechModel(id = 'tier1') {
  const look = TECH_LOOKS[id] ?? TECH_LOOKS.tier1;
  const skin = look.skin ?? P.s;
  const wide = look.build === 'chubby' ? 1.22 : look.build === 'skinny' ? 0.86 : 1;
  const material = toonMaterial.clone();
  const root = new THREE.Group();
  const body = new THREE.Group(); // bobs while walking
  root.add(body);
  if (look.size) body.scale.setScalar(look.size === 'tall' ? 1.08 : 0.9);
  const mesh = (geo) => {
    const m = new THREE.Mesh(geo, material);
    m.castShadow = true;
    return outlined(m);
  };

  // Legs hang from the hip, so they can swing: trouser leg and a round shoe.
  const leg = (side) => {
    const g = new THREE.Group();
    g.position.set(side * 0.11 * Math.min(1.1, wide), 0.5, 0);
    const r = look.build === 'skinny' ? 0.08 : 0.095;
    g.add(mesh(merge([capsule(r, 0.24, look.pants, 0, -0.22, 0), sphere(0.12, P.k, 0, -0.44, 0.05, 1, 0.6, 1.35)])));
    body.add(g);
    return g;
  };
  // Arms hang from the shoulder: sleeve, forearm, hand, and whatever that hand holds.
  const arm = (side) => {
    const g = new THREE.Group();
    g.position.set(side * (0.3 * wide + (wide > 1 ? 0.02 : 0)), 0.88, 0);
    const held = look[side > 0 ? 'right' : 'left'];
    g.add(mesh(merge([
      capsule(0.08, 0.14, look.top, side * 0.02, -0.12, 0, 0, side * 0.15),
      capsule(0.06, 0.12, look.hood || look.shirt ? look.top : skin, side * 0.05, -0.3, 0, 0, side * 0.15),
      sphere(0.075, skin, side * 0.07, -0.42, 0.01),
      ...(held ? HELD[held](side) : []),
    ])));
    body.add(g);
    return g;
  };
  const legL = leg(-1);
  const legR = leg(1);
  const armL = arm(-1);
  const armR = arm(1);

  const torso = lathe(TORSO, look.top);
  if (wide !== 1) torso.scale(wide, 1, wide);
  const parts = [
    torso,
    paint(new THREE.CylinderGeometry(0.235 * wide, 0.235 * wide, 0.06, 12), P.k, 0, 0.45, 0), // belt
  ];
  if (look.collar) parts.push(paint(new THREE.TorusGeometry(0.13, 0.045, 5, 12), look.collar, 0, 0.96, 0, Math.PI / 2));
  if (look.hood) parts.push(shaped(new THREE.TorusGeometry(0.17, 0.07, 5, 12), look.hood, 0, 0.95, -0.05, Math.PI / 2 - 0.35, 0, 0, 1, 1, 1));
  // A shirt showing at the neck as a V, and a tie down the front.
  if (look.shirt) parts.push(shaped(new THREE.ConeGeometry(0.11, 0.24, 3), look.shirt, 0, 0.86, 0.22 * wide, 0, 0, Math.PI, 1, 1, 0.45));
  if (look.tie) {
    const [, , z] = torsoPoint(0.76, 0, 0.0, wide);
    parts.push(capsule(0.035, 0.22, look.tie, 0, 0.76, z - 0.02, -0.2), rotBox(0.07, 0.05, 0.05, look.tie, 0, 0.9, 0.2 * wide));
  }
  if (look.lanyard) {
    // Lanyard and badge on the chest.
    parts.push(
      capsule(0.016, 0.2, P.y, -0.07, 0.8, 0.255 * wide, -0.35, 0.25),
      capsule(0.016, 0.2, P.y, 0.07, 0.8, 0.255 * wide, -0.35, -0.25),
      rotBox(0.13, 0.16, 0.03, P.w, 0, 0.66, 0.285 * wide),
      rotBox(0.09, 0.035, 0.035, P.B, 0, 0.71, 0.29 * wide),
    );
  }
  for (const c of look.chest ?? []) parts.push(...CHEST[c](wide));
  if (look.hip) parts.push(...HIP[look.hip]());

  head(parts, skin, P.h, 'none');
  hair(parts, look.hair, look.hairStyle);
  if (look.beard) {
    // Round the jaw, below the eyes.
    parts.push(paint(new THREE.SphereGeometry(HEAD_R + 0.015, 10, 6, 0, Math.PI, Math.PI * 0.6, Math.PI * 0.28), look.beard, 0, HEAD_Y, 0));
  }
  if (look.glasses) {
    for (const x of [-0.11, 0.11]) parts.push(paint(new THREE.TorusGeometry(0.055, 0.012, 4, 10), P.g, x, HEAD_Y + 0.02, HEAD_R * 0.98));
    parts.push(rotBox(0.1, 0.015, 0.015, P.g, 0, HEAD_Y + 0.03, HEAD_R * 1.0));
  }
  if (look.headset) {
    // A band over the top, ear cups, boom mic to the mouth.
    parts.push(
      paint(new THREE.TorusGeometry(HEAD_R + 0.05, 0.025, 4, 14, Math.PI), P.G, 0, HEAD_Y, 0),
      paint(new THREE.CylinderGeometry(0.1, 0.1, 0.09, 10), P.k, -HEAD_R - 0.03, HEAD_Y - 0.02, 0, 0, 0, Math.PI / 2),
      paint(new THREE.CylinderGeometry(0.1, 0.1, 0.09, 10), P.k, HEAD_R + 0.03, HEAD_Y - 0.02, 0, 0, 0, Math.PI / 2),
      capsule(0.016, 0.26, P.G, -0.27, HEAD_Y - 0.1, 0.17, Math.PI / 2, 0.0),
      sphere(0.035, P.k, -0.16, HEAD_Y - 0.13, 0.31),
    );
  }
  body.add(mesh(merge(parts)));
  return { root, body, legL, legR, armL, armR, material };
}

// --- End-users ----------------------------------------------------------------------
// The horde is drawn instanced, so each user is one merged geometry (no moving limbs);
// the renderer makes them waddle and bob as a whole. Built facing +z, feet at y = 0.

// A generic office worker, like the original's shared end-user body: hair, skin, a top
// (with an optional inner shirt showing at the neck, or a tie), trousers or a skirt. With
// `raised`, the right arm is left off for the caller to add holding something up.
function person({ hair, skin = P.s, top, inner = null, tie = null, pants = P.n, skirt = null, hairStyle = 'short', raised = false }) {
  const parts = [
    sphere(0.115, P.k, -0.11, 0.06, 0.04, 1, 0.6, 1.35), // shoes
    sphere(0.115, P.k, 0.11, 0.06, 0.04, 1, 0.6, 1.35),
  ];
  if (skirt) {
    parts.push(capsule(0.06, 0.24, skin, -0.1, 0.26, 0), capsule(0.06, 0.24, skin, 0.1, 0.26, 0));
    parts.push(paint(new THREE.CylinderGeometry(0.25, 0.32, 0.26, 12), skirt, 0, 0.47, 0));
  } else {
    parts.push(capsule(0.09, 0.24, pants, -0.11, 0.28, 0), capsule(0.09, 0.24, pants, 0.11, 0.28, 0));
  }
  parts.push(lathe(TORSO, top));
  // The shirt underneath shows as a V at the neck, or a tie down the front.
  if (inner) parts.push(shaped(new THREE.ConeGeometry(0.11, 0.24, 3), inner, 0, 0.86, 0.22, 0, 0, Math.PI, 1, 1, 0.45));
  if (tie) parts.push(capsule(0.035, 0.24, tie, 0, 0.74, 0.27, -0.2));
  // Arms hang a little out from the body, hands at the hips.
  parts.push(capsule(0.07, 0.3, top, -0.33, 0.68, 0, 0, -0.2), sphere(0.075, skin, -0.38, 0.47, 0.01));
  if (!raised) parts.push(capsule(0.07, 0.3, top, 0.33, 0.68, 0, 0, 0.2), sphere(0.075, skin, 0.38, 0.47, 0.01));
  head(parts, skin, hair, hairStyle);
  return parts;
}

// The right arm held up and out, hand at about (0.5, 1.2): for waving something.
const raisedArm = (top, skin) => [capsule(0.07, 0.3, top, 0.4, 0.96, 0.04, 0, -0.6), sphere(0.075, skin, 0.5, 1.17, 0.06)];

function consultant(hair) {
  const parts = person({ hair, top: P.G, pants: P.G, inner: P.w, tie: P.a });
  parts.push(capsule(0.025, 0.32, P.y, -0.12, 0.8, 0.26, -0.15, 0.25)); // lanyard
  parts.push(rotBox(0.4, 0.3, 0.03, P.k, -0.48, 0.62, 0.2, 0, 0.5)); // slide deck
  parts.push(rotBox(0.34, 0.24, 0.035, P.w, -0.48, 0.62, 0.2, 0, 0.5));
  parts.push(rotBox(0.2, 0.035, 0.04, P.e, -0.47, 0.6, 0.22, 0, 0.5, 0.6)); // the arrow going up
  return merge(parts);
}

function dave(top) {
  const parts = person({ hair: P.h, top, pants: P.k });
  parts.push(rotBox(0.08, 0.1, 0.02, P.w, -0.1, 0.72, 0.27), rotBox(0.08, 0.1, 0.02, P.w, 0.1, 0.72, 0.27)); // two badges
  parts.push(rotBox(0.06, 0.03, 0.025, P.y, -0.1, 0.69, 0.28), rotBox(0.06, 0.03, 0.025, P.a, 0.1, 0.69, 0.28));
  return parts;
}

// One builder per user sprite id (data/enemies.js `sprite`). Each returns merged geometry.
export const USER_MODELS = {
  // Password Reset Pam: purple cardigan over a white blouse, grey skirt, brown bob, waving
  // a yellow sticky note (her password, probably).
  pam: () => {
    const parts = person({ hair: P.h, top: P.p, inner: P.w, skirt: P.G, hairStyle: 'bob', raised: true });
    parts.push(...raisedArm(P.p, P.s));
    parts.push(rotBox(0.24, 0.24, 0.03, P.y, 0.55, 1.33, 0.08, 0, 0, -0.15)); // sticky note
    return merge(parts);
  },
  // "Quick Question" Quinn: green cardigan, blond, a speech bubble with a question mark.
  quinn: () => {
    const parts = person({ hair: P.y, top: P.e, inner: P.w });
    const bx = 0.44;
    const by = 1.86;
    parts.push(sphere(0.3, P.w, bx, by, 0, 1, 0.8, 0.28, 12, 6)); // bubble
    parts.push(shaped(new THREE.ConeGeometry(0.08, 0.2, 5), P.w, bx - 0.16, by - 0.24, 0, 0, 0, 2.6)); // tail
    // The "?" in dark blocks on the bubble's front.
    parts.push(rotBox(0.16, 0.05, 0.03, P.k, bx, by + 0.12, 0.08));
    parts.push(rotBox(0.05, 0.09, 0.03, P.k, bx + 0.06, by + 0.06, 0.08));
    parts.push(rotBox(0.07, 0.05, 0.03, P.k, bx + 0.02, by, 0.08));
    parts.push(rotBox(0.05, 0.05, 0.03, P.k, bx, by - 0.12, 0.08));
    return merge(parts);
  },
  // Reply-All Randy: white shirt, red tie, black hair, holding up an envelope.
  randy: () => {
    const parts = person({ hair: P.k, skin: P.S, top: P.w, tie: P.r, raised: true });
    parts.push(...raisedArm(P.w, P.S));
    parts.push(rotBox(0.36, 0.25, 0.04, P.w, 0.56, 1.3, 0.08)); // envelope
    parts.push(rotBox(0.24, 0.03, 0.02, P.k, 0.49, 1.36, 0.11, 0, 0, -0.55)); // flap
    parts.push(rotBox(0.24, 0.03, 0.02, P.k, 0.63, 1.36, 0.11, 0, 0, 0.55));
    return merge(parts);
  },
  // Reply-All Reply: a pint-sized Randy (the original's 16 x 16 sprite).
  randy_small: () => {
    const g = merge(person({ hair: P.k, skin: P.s, top: P.w, tie: P.r }));
    g.scale(0.6, 0.6, 0.6);
    return g;
  },
  // Phish Clicker: red hoodie, a fishing rod held up with a little envelope on the hook.
  phish: () => {
    const parts = person({ hair: P.h, top: P.r, raised: true });
    parts.push(...raisedArm(P.r, P.s));
    parts.push(capsule(0.025, 0.9, P.h, 0.72, 1.55, 0.22, 0.5, -0.55)); // rod, up and forward
    parts.push(cyl(0.008, 0.008, 0.62, P.g, 0.96, 1.3, 0.6, 4)); // line
    parts.push(rotBox(0.26, 0.17, 0.04, P.w, 0.96, 1.22, 0.6)); // bait envelope
    parts.push(rotBox(0.18, 0.03, 0.02, P.k, 0.91, 1.26, 0.63, 0, 0, -0.5));
    parts.push(rotBox(0.18, 0.03, 0.02, P.k, 1.01, 1.26, 0.63, 0, 0, 0.5));
    return merge(parts);
  },
  // Malware: the Phish Clicker's little red bug, with white eyes and purple spots.
  malware: () => {
    const parts = [
      sphere(0.26, P.r, 0, 0.24, 0, 1, 0.75, 1.15, 9, 6), // body
      sphere(0.06, P.w, -0.1, 0.32, 0.25), // eyes
      sphere(0.06, P.w, 0.1, 0.32, 0.25),
      sphere(0.025, P.k, -0.1, 0.33, 0.3),
      sphere(0.025, P.k, 0.1, 0.33, 0.3),
      sphere(0.05, P.p, -0.12, 0.38, -0.08),
      sphere(0.05, P.p, 0.12, 0.38, -0.08),
      capsule(0.015, 0.2, P.k, -0.08, 0.5, 0.18, 0.5, 0.4), // antennae
      capsule(0.015, 0.2, P.k, 0.08, 0.5, 0.18, 0.5, -0.4),
    ];
    for (const z of [-0.14, 0, 0.14]) {
      parts.push(capsule(0.025, 0.14, P.k, -0.27, 0.08, z, 0, 1.0)); // legs
      parts.push(capsule(0.025, 0.14, P.k, 0.27, 0.08, z, 0, -1.0));
    }
    return merge(parts);
  },
  // Printer Jammer: grey shirt, an armful of crumpled printouts held in front.
  jammer: () => {
    const parts = person({ hair: P.h, top: P.G, pants: P.k });
    parts.push(box(0.64, 0.32, 0.3, P.w, 0, 0.5, 0.3)); // the pile
    for (let i = 0; i < 4; i++) parts.push(box(0.5, 0.012, 0.31, P.g, 0, 0.56 + i * 0.065, 0.3));
    parts.push(sphere(0.1, P.w, -0.22, 0.86, 0.32, 1, 0.8, 1, 5, 4)); // crumpled sheets on top
    parts.push(sphere(0.09, P.w, 0.05, 0.88, 0.26, 1, 0.8, 1, 5, 4));
    parts.push(rotBox(0.18, 0.02, 0.24, P.w, 0.3, 0.84, 0.34, 0.3, 0, -0.5)); // a sheet sticking out
    parts.push(sphere(0.075, P.s, -0.3, 0.68, 0.36), sphere(0.075, P.s, 0.3, 0.68, 0.36)); // hands round the pile
    return merge(parts);
  },
  // Shadow IT Steve: dark hoodie with the hood up, sunglasses, carrying his own router.
  steve: () => {
    const parts = person({ hair: P.n, top: P.n, pants: P.k, hairStyle: 'bob' }); // the bob is his hood
    parts.push(rotBox(0.36, 0.08, 0.06, P.k, 0, HEAD_Y + 0.03, HEAD_R * 0.92)); // sunglasses
    parts.push(box(0.3, 0.09, 0.2, P.k, 0.46, 0.42, 0.12)); // router in his hand
    parts.push(box(0.26, 0.012, 0.16, P.G, 0.46, 0.51, 0.12));
    parts.push(sphere(0.02, P.e, 0.38, 0.47, 0.22), sphere(0.02, P.B, 0.44, 0.47, 0.22));
    parts.push(cyl(0.012, 0.012, 0.26, P.k, 0.36, 0.51, 0.06, 4), cyl(0.012, 0.012, 0.26, P.k, 0.56, 0.51, 0.06, 4)); // antennas
    return merge(parts);
  },
  // The VIP: navy suit, white collar, red tie, phone pressed to the ear.
  vip: () => {
    const parts = person({ hair: P.G, skin: P.S, top: P.n, inner: P.w, tie: P.r, raised: true });
    parts.push(capsule(0.07, 0.26, P.n, 0.38, 0.98, 0.06, -0.3, -0.35)); // arm up to the ear
    parts.push(sphere(0.075, P.S, 0.38, 1.18, 0.1));
    parts.push(rotBox(0.07, 0.24, 0.12, P.k, 0.35, 1.25, 0.05)); // phone
    return merge(parts);
  },
  // Ticket-less Walk-Up: red hair, blue shirt, rushing in with a smoking laptop.
  walkup: () => {
    const parts = person({ hair: P.r, top: P.B });
    parts.push(box(0.5, 0.03, 0.34, P.g, 0, 0.58, 0.36)); // laptop base
    parts.push(rotBox(0.5, 0.34, 0.03, P.k, 0, 0.76, 0.2, -0.25)); // lid
    parts.push(rotBox(0.42, 0.26, 0.02, P.n, 0, 0.76, 0.215, -0.25)); // screen
    parts.push(rotBox(0.16, 0.03, 0.02, P.r, 0, 0.76, 0.23, -0.25, 0, 0.8)); // the error X
    parts.push(rotBox(0.16, 0.03, 0.02, P.r, 0, 0.76, 0.23, -0.25, 0, -0.8));
    parts.push(sphere(0.075, P.s, -0.26, 0.6, 0.4), sphere(0.075, P.s, 0.26, 0.6, 0.4));
    parts.push(sphere(0.08, P.g, 0.12, 1.02, 0.26, 1, 1, 1, 5, 4)); // smoke
    parts.push(sphere(0.1, P.g, 0.2, 1.2, 0.22, 1, 1, 1, 5, 4));
    parts.push(sphere(0.07, P.w, 0.14, 1.38, 0.2, 1, 1, 1, 5, 4));
    return merge(parts);
  },
  // Synergy Consultants (Merger Day): grey suits, navy ties, the new parent company's gold
  // lanyard, and a slide deck with an arrow going up. The second one has red hair.
  consultant: () => consultant(P.h),
  consultant_b: () => consultant(P.r),
  // Duplicate Dave: blue shirt, one old badge and one new one. Dave (2) wears the copy's
  // orange and has a "2" tag over his head.
  dave: () => merge(dave(P.b)),
  dave2: () => {
    const parts = dave(P.o);
    parts.push(rotBox(0.26, 0.32, 0.04, P.k, 0.42, 1.78, 0)); // the (2) tag
    parts.push(rotBox(0.2, 0.26, 0.05, P.w, 0.42, 1.78, 0));
    for (const [w, h, x, y] of [[0.12, 0.035, 0.42, 1.88], [0.035, 0.07, 0.465, 1.83], [0.12, 0.035, 0.42, 1.78], [0.035, 0.07, 0.375, 1.73], [0.12, 0.035, 0.42, 1.68]]) {
      parts.push(rotBox(w, h, 0.06, P.k, x, y, 0));
    }
    return merge(parts);
  },
  // Badge Brenda (Merger Day): navy new-hire top, holding up a badge that doesn't open anything.
  brenda: () => {
    const parts = person({ hair: P.y, top: P.A, pants: P.G, hairStyle: 'bob', raised: true });
    parts.push(...raisedArm(P.A, P.s));
    parts.push(rotBox(0.2, 0.26, 0.03, P.k, 0.56, 1.36, 0.08)); // badge
    parts.push(rotBox(0.15, 0.2, 0.035, P.w, 0.56, 1.36, 0.08));
    parts.push(sphere(0.035, P.r, 0.56, 1.36, 0.11)); // its reader light
    return merge(parts);
  },
  // Status Update Request (the Major Incident's minions): a yellow chat bubble with
  // "..." on it, hopping along at knee height.
  status_update: () => merge([
    sphere(0.32, P.y, 0, 0.42, 0, 1, 0.62, 0.42, 10, 6),
    shaped(new THREE.ConeGeometry(0.08, 0.2, 5), P.y, -0.14, 0.18, 0, 0, 0, 2.7), // tail
    ...[-0.13, 0, 0.13].map((x) => sphere(0.045, P.k, x, 0.43, 0.12, 1, 1, 0.6, 5, 3)),
  ]),
  // Unclaimed Moving Box (Merger Day): taped up, labeled, waiting to be smashed open.
  moving_box: () => merge([
    box(0.9, 0.62, 0.78, P.d, 0, 0, 0),
    box(0.92, 0.04, 0.8, P.h, 0, 0.6, 0), // lid seam
    box(0.16, 0.65, 0.8, P.y, 0, 0, 0), // tape
    box(0.3, 0.18, 0.01, P.w, -0.22, 0.3, 0.395), // label
    box(0.22, 0.025, 0.012, P.k, -0.22, 0.38, 0.4),
    box(0.16, 0.025, 0.012, P.k, -0.24, 0.33, 0.4),
  ]),
};

// --- Bosses ---------------------------------------------------------------------------
// Bosses are few, so each gets a real model with moving parts (src/render/bosses.js poses
// them), built at chibi scale and grown by BOSS_SCALE. Each has a material of its own so
// it can flash when hit (its emissive color), and its lights are unlit so they glow.

export const BOSS_SCALE = { executive: 2.1, incident: 1.35 };

const glow = (color) => new THREE.MeshBasicMaterial({ color });

// The Executive Who Needs It Fixed Before The Board Meeting: navy suit, red tie, grey
// hair, angry brows, a briefcase in the left hand. The right arm has three poses (phone
// held down, pointing at you, phone raised), and the mouth frowns or shouts.
// Returns { root, body, legL, legR, arms: [down, point, phone], mouths: [frown, shout], material }.
export function createExecutiveModel() {
  const material = toonMaterial.clone();
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const mesh = (geo) => {
    const m = new THREE.Mesh(geo, material);
    m.castShadow = true;
    return outlined(m);
  };
  const leg = (side) => {
    const g = new THREE.Group();
    g.position.set(side * 0.11, 0.5, 0);
    g.add(mesh(merge([capsule(0.1, 0.24, P.n, 0, -0.22, 0), sphere(0.12, P.K, 0, -0.44, 0.05, 1, 0.6, 1.35)])));
    body.add(g);
    return g;
  };
  const legL = leg(-1);
  const legR = leg(1);
  const shoulder = (geo) => {
    const g = new THREE.Group();
    g.position.set(0.3, 0.88, 0);
    g.add(mesh(geo));
    body.add(g);
    return g;
  };
  const phone = (x, y, z) => [rotBox(0.09, 0.2, 0.05, P.K, x, y, z), rotBox(0.06, 0.13, 0.02, P.B, x, y, z + 0.03)];
  const arms = [
    // Down by the side, phone in hand.
    shoulder(merge([capsule(0.08, 0.3, P.n, 0.04, -0.2, 0, 0, 0.15), sphere(0.075, P.s, 0.08, -0.42, 0.02), ...phone(0.09, -0.5, 0.06)])),
    // Pointing straight at you.
    shoulder(merge([capsule(0.08, 0.34, P.n, 0.02, 0, 0.24, Math.PI / 2), sphere(0.075, P.s, 0.02, 0, 0.5), capsule(0.025, 0.1, P.s, 0.02, 0.01, 0.6, Math.PI / 2)])),
    // Phone raised over the head, shouting into it.
    shoulder(merge([capsule(0.08, 0.32, P.n, 0.06, 0.24, 0, 0, -0.2), sphere(0.075, P.s, 0.1, 0.46, 0.02), ...phone(0.1, 0.6, 0.04)])),
  ];
  const parts = [
    lathe(TORSO, P.n), // suit jacket
    shaped(new THREE.ConeGeometry(0.12, 0.3, 3), P.w, 0, 0.84, 0.21, 0, 0, Math.PI, 1, 1, 0.45), // shirt
    capsule(0.04, 0.26, P.r, 0, 0.74, 0.27, -0.2), // tie
    rotBox(0.03, 0.26, 0.02, P.k, -0.08, 0.82, 0.26, -0.25, 0, 0.35), // lapels
    rotBox(0.03, 0.26, 0.02, P.k, 0.08, 0.82, 0.26, -0.25, 0, -0.35),
    // Left arm with the briefcase.
    capsule(0.08, 0.3, P.n, -0.34, 0.68, 0, 0, -0.15),
    sphere(0.075, P.s, -0.38, 0.47, 0.02),
    box(0.44, 0.32, 0.14, P.h, -0.4, 0.12, 0.02),
    box(0.06, 0.05, 0.15, P.y, -0.4, 0.3, 0.02), // clasp
    paint(new THREE.TorusGeometry(0.07, 0.02, 4, 8, Math.PI), P.k, -0.4, 0.44, 0.02),
  ];
  head(parts, P.s, P.G, 'short');
  parts.push(
    rotBox(0.11, 0.03, 0.03, P.k, -0.11, HEAD_Y + 0.1, HEAD_R * 0.93, 0, 0, -0.45), // angry brows
    rotBox(0.11, 0.03, 0.03, P.k, 0.11, HEAD_Y + 0.1, HEAD_R * 0.93, 0, 0, 0.45),
  );
  body.add(mesh(merge(parts)));
  const mouth = (geo) => {
    const m = new THREE.Mesh(geo, material);
    body.add(m);
    return m;
  };
  const mouths = [
    mouth(rotBox(0.12, 0.025, 0.03, P.k, 0, HEAD_Y - 0.13, HEAD_R * 0.9, 0, 0, 0)),
    mouth(merge([sphere(0.07, P.k, 0, HEAD_Y - 0.14, HEAD_R * 0.86, 1, 0.75, 0.5, 6, 4), sphere(0.045, P.r, 0, HEAD_Y - 0.16, HEAD_R * 0.9, 1, 0.6, 0.5, 5, 3)])),
  ];
  return { root, body, legL, legR, arms, mouths, material };
}

// Major Incident: a furious conference speakerphone on an AV cart, running the bridge
// call. The LCD's eyes glare red (yellow when it attacks), LEDs blink round the base, and
// a siren on top spins. Returns { root, body, eyes, leds, siren, beacon, material }.
export function createIncidentModel() {
  const material = toonMaterial.clone();
  const root = new THREE.Group();
  const body = new THREE.Group(); // rocks and jumps when it rings
  root.add(body);
  const mesh = (geo, mat = material) => {
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = true;
    return outlined(m);
  };
  // The cart: a grey shelf on four castors, pushed by nobody.
  root.add(mesh(merge([
    box(1.9, 0.12, 1.5, P.G, 0, 0.32, 0),
    box(1.8, 0.06, 1.4, P.g, 0, 0.44, 0),
    ...[[-0.8, -0.6], [0.8, -0.6], [-0.8, 0.6], [0.8, 0.6]].flatMap(([x, z]) => [
      cyl(0.04, 0.04, 0.22, P.K, x, 0.1, z, 5),
      sphere(0.1, P.k, x, 0.1, z, 1, 1, 0.7, 6, 4),
    ]),
  ])));
  // The speakerphone: a dark base, a grey grille dome with holes, the LCD on the front.
  const dome = [
    cyl(1.05, 1.15, 0.24, P.K, 0, 0.48, 0, 16),
    shaped(new THREE.SphereGeometry(0.95, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), P.g, 0, 0.7, 0, 0, 0, 0, 1, 0.48, 1),
    box(0.9, 0.36, 0.1, P.n, 0, 0.66, 0.86), // LCD
    box(0.98, 0.44, 0.06, P.k, 0, 0.62, 0.83),
  ];
  for (let ring = 0; ring < 3; ring++) {
    const r = 0.35 + ring * 0.22;
    const n = 6 + ring * 4;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + ring * 0.3;
      const y = 0.7 + 0.46 * Math.sqrt(Math.max(0, 1 - (r / 0.95) ** 2));
      if (Math.sin(a) > 0.55 && ring === 2) continue; // keep the LCD clear
      dome.push(sphere(0.035, P.k, Math.cos(a) * r, y, Math.sin(a) * r, 1, 0.5, 1, 4, 3));
    }
  }
  // The siren on its neck.
  dome.push(cyl(0.18, 0.24, 0.24, P.G, 0, 1.12, 0, 8));
  body.add(mesh(merge(dome)));
  // Lights (unlit, so they glow): the LCD's eyes and mouth, three LEDs, the siren dome.
  const eyes = new THREE.Mesh(merge([
    rotBox(0.22, 0.1, 0.04, P.w, -0.2, 0.74, 0.92, 0, 0, -0.3),
    rotBox(0.22, 0.1, 0.04, P.w, 0.2, 0.74, 0.92, 0, 0, 0.3),
    rotBox(0.4, 0.05, 0.04, P.w, 0, 0.57, 0.92),
  ]), glow(P.r));
  body.add(eyes);
  const leds = [-0.9, 0, 0.9].map((x, i) => {
    const led = new THREE.Mesh(box(0.16, 0.08, 0.08, P.w, x * 0.85, 0.52, (i === 1 ? 1.12 : 0.62)), glow(P.y));
    body.add(led);
    return led;
  });
  const siren = mesh(shaped(new THREE.SphereGeometry(0.3, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), P.w, 0, 1.36, 0), glow(P.r));
  body.add(siren);
  // A white flare inside the siren that sweeps round.
  const beacon = new THREE.Group();
  beacon.position.y = 1.5;
  beacon.add(new THREE.Mesh(box(0.08, 0.1, 0.5, P.w, 0, -0.05, 0.12), glow(P.w)));
  body.add(beacon);
  return { root, body, eyes, leds, siren, beacon, material };
}

// The map bosses (data/maps.js `boss`). Sizes per model id; the Rat's Nest shrinks to
// `ratsnest_small` when it splits, and the Hostile Takeover grows as it absorbs users.
Object.assign(BOSS_SCALE, { ratsnest: 1.7, ratsnest_small: 1.1, caller: 2.0, janitor: 1.9, takeover: 2.0, subsidiary: 1.4 });

// A mesh in a boss's own material, inked and casting a shadow.
function bossMesh(geo, material) {
  const m = new THREE.Mesh(geo, material);
  m.castShadow = true;
  return outlined(m);
}

// The people bosses share a build: a body with swinging legs, and one set of arms per
// pose (`poses`: merged parts for both arms, the first being the walk), of which the
// renderer shows one. `extra` adds to the body; `face` adds brows. The mouth frowns, or
// shouts while attacking. Returns { root, body, legL, legR, arms, mouths, material }.
function createBossPerson({ top, pants, shoes = P.K, skin = P.s, hair, hairStyle = 'short', inner = null, tie = null, extra = [], poses, brows = true }) {
  const material = toonMaterial.clone();
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const leg = (side) => {
    const g = new THREE.Group();
    g.position.set(side * 0.11, 0.5, 0);
    g.add(bossMesh(merge([capsule(0.1, 0.24, pants, 0, -0.22, 0), sphere(0.12, shoes, 0, -0.44, 0.05, 1, 0.6, 1.35)]), material));
    body.add(g);
    return g;
  };
  const legL = leg(-1);
  const legR = leg(1);
  const parts = [lathe(TORSO, top)];
  if (inner) parts.push(shaped(new THREE.ConeGeometry(0.12, 0.3, 3), inner, 0, 0.84, 0.21, 0, 0, Math.PI, 1, 1, 0.45));
  if (tie) parts.push(capsule(0.04, 0.26, tie, 0, 0.74, 0.27, -0.2));
  head(parts, skin, hair, hairStyle);
  if (brows)
    parts.push(
      rotBox(0.11, 0.03, 0.03, P.k, -0.11, HEAD_Y + 0.1, HEAD_R * 0.93, 0, 0, -0.45), // angry brows
      rotBox(0.11, 0.03, 0.03, P.k, 0.11, HEAD_Y + 0.1, HEAD_R * 0.93, 0, 0, 0.45),
    );
  parts.push(...extra);
  body.add(bossMesh(merge(parts), material));
  const arms = poses.map((p) => {
    const g = new THREE.Group();
    g.add(bossMesh(merge(p), material));
    body.add(g);
    return g;
  });
  const mouth = (geo) => {
    const m = new THREE.Mesh(geo, material);
    body.add(m);
    return m;
  };
  const mouths = [
    mouth(rotBox(0.12, 0.025, 0.03, P.k, 0, HEAD_Y - 0.13, HEAD_R * 0.9, 0, 0, 0)),
    mouth(merge([sphere(0.07, P.k, 0, HEAD_Y - 0.14, HEAD_R * 0.86, 1, 0.75, 0.5, 6, 4), sphere(0.045, P.r, 0, HEAD_Y - 0.16, HEAD_R * 0.9, 1, 0.6, 0.5, 5, 3)])),
  ];
  return { root, body, legL, legR, arms, mouths, material };
}

// Arms hanging by the sides (left, right), in the sleeve colour with hands.
const armDown = (side, top, skin) => [capsule(0.08, 0.3, top, side * 0.34, 0.68, 0, 0, side * -0.15), sphere(0.075, skin, side * 0.38, 0.47, 0.02)];
// An arm raised over the head (a fist shaken at you, or a memo about to come down).
const armUp = (side, top, skin) => [capsule(0.08, 0.32, top, side * 0.36, 1.12, 0.02, 0, side * 0.2), sphere(0.08, skin, side * 0.4, 1.38, 0.04)];
// An arm out to the side, palm up ("we're all one team now").
const armOut = (side, top, skin) => [capsule(0.08, 0.34, top, side * 0.52, 0.9, 0.06, 0, side * 1.2), sphere(0.08, skin, side * 0.74, 0.98, 0.1)];

// The Angry Caller: a huge customer in a purple jumper with a headset, its mic glowing.
// Poses: walking (one hand on the headset), screaming (fists up), on the phone (both
// hands pressing the headset to his ear).
export function createCallerModel() {
  const top = P.p;
  const headset = [
    paint(new THREE.TorusGeometry(HEAD_R + 0.04, 0.03, 4, 14, Math.PI), P.k, 0, HEAD_Y + 0.02, 0), // band, ear to ear
    sphere(0.1, P.G, HEAD_R + 0.03, HEAD_Y - 0.02, 0, 0.6, 1, 1, 6, 4), // ear cups
    sphere(0.1, P.G, -HEAD_R - 0.03, HEAD_Y - 0.02, 0, 0.6, 1, 1, 6, 4),
    capsule(0.02, 0.3, P.k, 0.24, HEAD_Y - 0.2, 0.2, 1.2, 0.7), // mic boom
  ];
  const m = createBossPerson({
    top, pants: P.n, hair: P.h, skin: P.S, inner: P.w,
    extra: [...headset, sphere(0.05, P.q, 0.1, HEAD_Y - 0.26, 0.32)],
    poses: [
      [...armDown(-1, top, P.S), capsule(0.08, 0.3, top, 0.4, 1.0, 0.02, 0, -0.5), sphere(0.08, P.S, 0.42, 1.2, 0.02)],
      [...armUp(-1, top, P.S), ...armUp(1, top, P.S)],
      [capsule(0.08, 0.3, top, -0.4, 1.0, 0.02, 0, 0.5), sphere(0.08, P.S, -0.42, 1.2, 0.02), capsule(0.08, 0.3, top, 0.4, 1.0, 0.02, 0, -0.5), sphere(0.08, P.S, 0.42, 1.2, 0.02)],
    ],
  });
  // The mic's light: cyan, red while it's shouting.
  m.mic = new THREE.Mesh(sphere(0.055, P.w, 0.1, HEAD_Y - 0.26, 0.33), new THREE.MeshBasicMaterial({ color: P.q }));
  m.body.add(m.mic);
  return m;
}

// The Night Janitor: grey overalls, a navy cap, riding a big orange-striped floor buffer
// by its handle; a mop in his other hand. Poses: walking, swinging the mop, leaning into
// the buffer for a charge. `buffer` is the machine (its pad spins).
export function createJanitorModel() {
  const top = P.G;
  const m = createBossPerson({
    top, pants: P.G, hair: P.n, hairStyle: 'short', skin: P.s,
    extra: [
      box(0.5, 0.06, 0.2, P.n, 0, HEAD_Y + 0.22, 0.24), // cap peak
      box(0.24, 0.3, 0.05, P.y, 0, 0.62, 0.27), // overall bib with a yellow name patch
      rotBox(0.04, 0.42, 0.04, P.n, -0.12, 0.82, 0.25, -0.15), // straps
      rotBox(0.04, 0.42, 0.04, P.n, 0.12, 0.82, 0.25, -0.15),
      // Keys on the belt: he has keys to every door in the building.
      paint(new THREE.TorusGeometry(0.06, 0.015, 4, 8), P.y, 0.26, 0.48, 0.12, 0, 0.6, 0),
    ],
    poses: [
      // Both hands on the handle, the mop tucked under one arm.
      [capsule(0.08, 0.3, top, -0.3, 0.7, 0.2, 1.1, 0.2), sphere(0.08, P.s, -0.22, 0.66, 0.42), capsule(0.08, 0.3, top, 0.3, 0.7, 0.2, 1.1, -0.2), sphere(0.08, P.s, 0.22, 0.66, 0.42),
        capsule(0.03, 1.3, P.h, -0.48, 0.7, 0, 0, 0.9), sphere(0.14, P.w, -1.0, 0.36, 0, 1.4, 0.6, 1, 6, 4)],
      // The mop swung out in front.
      [capsule(0.08, 0.3, top, -0.38, 0.86, 0.22, 1.2, 0.5), sphere(0.08, P.s, -0.42, 0.86, 0.45), capsule(0.08, 0.3, top, 0.3, 0.7, 0.2, 1.1, -0.2), sphere(0.08, P.s, 0.22, 0.66, 0.42),
        capsule(0.03, 1.3, P.h, -0.5, 0.6, 0.9, 1.0, 0), sphere(0.16, P.w, -0.5, 0.15, 1.45, 1.4, 0.6, 1, 6, 4)],
      // Leaning into the handle.
      [capsule(0.08, 0.34, top, -0.26, 0.66, 0.3, 1.4, 0.15), sphere(0.08, P.s, -0.2, 0.6, 0.55), capsule(0.08, 0.34, top, 0.26, 0.66, 0.3, 1.4, -0.15), sphere(0.08, P.s, 0.2, 0.6, 0.55)],
    ],
  });
  // The buffer in front of him: a round housing with an orange stripe and a long handle
  // up to his hands; the pad underneath spins.
  const buffer = new THREE.Group();
  buffer.position.set(0, 0, 0.95);
  buffer.add(bossMesh(merge([
    cyl(0.42, 0.46, 0.26, P.g, 0, 0.06, 0, 14),
    cyl(0.47, 0.47, 0.06, P.o, 0, 0.14, 0, 14),
    cyl(0.18, 0.2, 0.16, P.G, 0, 0.32, -0.05, 10),
    capsule(0.035, 0.6, P.k, 0, 0.6, -0.36, -0.75, 0),
    box(0.5, 0.05, 0.05, P.k, 0, 0.88, -0.6),
  ]), m.material));
  m.pad = bossMesh(merge([cyl(0.44, 0.44, 0.05, P.k, 0, 0.01, 0, 14), box(0.7, 0.012, 0.08, P.G, 0, 0.06, 0)]), m.material);
  buffer.add(m.pad);
  m.body.add(buffer);
  m.buffer = buffer;
  return m;
}

// The Hostile Takeover: the parent company's CEO in a deep-navy suit with a gold tie,
// slicked grey hair and a gold lapel pin. Poses: walking (a memo folder in hand),
// slamming a memo down (folder raised), calling the all-hands (arms wide).
// The Subsidiary is the same in grey, smaller.
function suit(top, tie, hairColor, pin) {
  const folder = (x, y, z) => [rotBox(0.3, 0.38, 0.04, P.k, x, y, z), rotBox(0.26, 0.34, 0.05, P.w, x, y, z + 0.01), rotBox(0.16, 0.03, 0.06, P.r, x - 0.02, y + 0.1, z + 0.02)];
  return createBossPerson({
    top, pants: top, hair: hairColor, skin: P.s, inner: P.w, tie,
    extra: [
      rotBox(0.03, 0.26, 0.02, P.k, -0.08, 0.82, 0.26, -0.25, 0, 0.35), // lapels
      rotBox(0.03, 0.26, 0.02, P.k, 0.08, 0.82, 0.26, -0.25, 0, -0.35),
      sphere(0.035, pin, -0.16, 0.86, 0.24),
    ],
    poses: [
      [...armDown(-1, top, P.s), capsule(0.08, 0.3, top, 0.36, 0.72, 0.1, 0.6, -0.15), sphere(0.075, P.s, 0.4, 0.6, 0.26), ...folder(0.4, 0.62, 0.32)],
      [...armDown(-1, top, P.s), ...armUp(1, top, P.s), ...folder(0.42, 1.55, 0.06)],
      [...armOut(-1, top, P.s), ...armOut(1, top, P.s)],
    ],
  });
}
export const createTakeoverModel = () => suit(P.a, P.y, P.g, P.y);
export const createSubsidiaryModel = () => suit(P.G, P.a, P.h, P.A);

// The Rat's Nest: a heap of tangled patch cable in every colour, with two eyes glaring out
// of it and cables trailing off, each ending in an RJ45 plug. `tendrils` wave about;
// `eyes` glow (yellow while it lashes). Returns { root, body, tendrils, eyes, material }.
export function createRatsnestModel() {
  const material = toonMaterial.clone();
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const colors = [P.B, P.y, P.e, P.o, P.r, P.g, P.B, P.e];
  const loops = [cyl(0.62, 0.7, 0.3, P.K, 0, 0, 0, 10)]; // the tray it crawled out of
  colors.forEach((c, i) => {
    const a = (i / colors.length) * Math.PI * 2;
    const r = 0.18 + (i % 3) * 0.08;
    loops.push(paint(new THREE.TorusGeometry(0.38 - (i % 2) * 0.06, 0.05, 5, 14), c, Math.cos(a) * r, 0.5 + (i % 4) * 0.1, Math.sin(a) * r, a, i * 0.7, 0.4 + i * 0.3));
  });
  loops.push(paint(new THREE.TorusKnotGeometry(0.3, 0.05, 40, 5, 2, 3), P.B, 0, 0.62, 0, 0.6, 0, 0.3));
  loops.push(paint(new THREE.TorusKnotGeometry(0.26, 0.045, 36, 5, 3, 2), P.y, 0.05, 0.7, 0.05, -0.4, 0.8, 0));
  loops.push(sphere(0.4, P.k, 0, 0.55, 0, 1.1, 0.9, 1, 8, 6)); // the dark middle
  body.add(bossMesh(merge(loops), material));
  // Eyes peering out of the tangle.
  const eyes = new THREE.Mesh(merge([sphere(0.09, P.w, -0.14, 0.72, 0.4, 1, 0.8, 0.5, 6, 4), sphere(0.09, P.w, 0.14, 0.72, 0.4, 1, 0.8, 0.5, 6, 4)]), new THREE.MeshBasicMaterial({ color: P.w }));
  const pupils = new THREE.Mesh(merge([sphere(0.04, P.k, -0.13, 0.71, 0.44, 1, 1, 0.5, 5, 3), sphere(0.04, P.k, 0.13, 0.71, 0.44, 1, 1, 0.5, 5, 3)]), material);
  body.add(eyes, pupils);
  // Cables trailing off round it, each a curve ending in a plug.
  const tendrils = [];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.3;
    const g = new THREE.Group();
    g.position.set(Math.cos(a) * 0.45, 0.3, Math.sin(a) * 0.45);
    g.rotation.y = -a;
    const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.35, 0.12, 0.1), new THREE.Vector3(0.7, -0.1, -0.1), new THREE.Vector3(1.0, -0.22, 0.05)]);
    g.add(bossMesh(merge([paint(new THREE.TubeGeometry(curve, 10, 0.04, 4), colors[i]), box(0.14, 0.08, 0.1, P.w, 1.04, -0.28, 0.05)]), material));
    body.add(g);
    tendrils.push(g);
  }
  return { root, body, tendrils, eyes, material };
}

// --- Boss attacks ----------------------------------------------------------------------
// What bosses throw, keyed by the hazard's sprite id (src/sim/hazards.js). Centered,
// pointing along +Z. The renderer outlines them in bright yellow so they stand out from
// the crowd, as the original did.

export const HAZARD_MODELS = {
  // A red desk-phone handset, ringing its way toward you.
  hazard_phone: () => merge([
    capsule(0.07, 0.42, P.r, 0, 0, 0, Math.PI / 2),
    cyl(0.15, 0.11, 0.14, P.r, 0, -0.08, -0.27, 8),
    cyl(0.15, 0.11, 0.14, P.r, 0, -0.08, 0.27, 8),
    cyl(0.1, 0.1, 0.02, P.k, 0, -0.1, -0.27, 8),
    cyl(0.1, 0.1, 0.02, P.k, 0, -0.1, 0.27, 8),
  ]),
  // A slide deck: a white slide with a red title and a blue bar chart, flying flat.
  hazard_slide: () => merge([
    slab(0.82, 0.62, P.k, 0),
    slab(0.74, 0.54, P.w, 2),
    slab(0.28, 0.08, P.r, 4, -0.18, -0.17),
    ...[[-0.2, 0.08], [-0.06, 0.14], [0.08, 0.2], [0.22, 0.26]].map(([x, h]) => slab(0.08, h, P.B, 4, x, 0.2 - h / 2)),
  ]),
};

// Boss attacks get a thick bright outline (with the same trick as the ink outlines).
export const hazardOutlineMaterial = new THREE.MeshBasicMaterial({ color: P.y, side: THREE.BackSide });
hazardOutlineMaterial.onBeforeCompile = (shader) => {
  shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n    transformed += normal * 0.07;');
};
hazardOutlineMaterial.customProgramCacheKey = () => 'hazard-outline';

// --- Projectiles and shields --------------------------------------------------------
// Keyed by the weapon's `sprite` id from data/weapons.js. Each is centered on its own
// origin and points along +Z (the way it flies); the renderer lifts it to hand height.
// Flat things are stacked slabs, each a hair taller than the one below, so the top
// layer shows like the original sprite's pixels.

const slab = (w, d, color, layer, x = 0, z = 0) => box(w, 0.05 + layer * 0.006, d, color, x, -0.025, z);

function ticket(paper) {
  return merge([
    slab(0.46, 0.64, P.k, 0),
    slab(0.38, 0.56, paper, 1),
    slab(0.22, 0.4, P.r, 2), // the CLOSED stamp
    slab(0.12, 0.3, paper, 3),
  ]);
}

export const PROJECTILE_MODELS = {
  // Ticket Auto-Close: a ticket stamped CLOSED.
  proj_ticket: () => ticket(P.w),
  proj_ticket_gold: () => ticket(P.y),
  // KB Article: a page with a blue header and grey lines.
  proj_kb: () => merge([
    slab(0.56, 0.7, P.k, 0),
    slab(0.48, 0.62, P.w, 1),
    slab(0.22, 0.1, P.B, 2, -0.1, 0.22),
    slab(0.32, 0.04, P.g, 2, 0, 0.06),
    slab(0.26, 0.04, P.g, 2, -0.03, -0.06),
    slab(0.32, 0.04, P.g, 2, 0, -0.18),
  ]),
  // Remote Desktop Session: somebody else's mouse cursor, tip first.
  proj_rdp: () => {
    const shape = new THREE.Shape();
    const pts = [[0, 0], [0, -0.62], [0.15, -0.48], [0.26, -0.72], [0.36, -0.67], [0.25, -0.44], [0.44, -0.44]];
    shape.moveTo(pts[0][0], pts[0][1]);
    for (const [x, y] of pts.slice(1)) shape.lineTo(x, y);
    const body = new THREE.ExtrudeGeometry(shape, { depth: 0.08, bevelEnabled: false });
    const edge = body.clone();
    edge.translate(-0.2, 0.36, 0);
    edge.scale(1.25, 1.25, 0.9);
    body.translate(-0.2, 0.36, 0);
    // Lay it flat with the tip toward +Z (the edge, black and a size up, sits just below).
    return merge([paint(edge, P.k, 0, -0.03, 0, Math.PI / 2), paint(body, P.B, 0, 0.01, 0, Math.PI / 2)]);
  },
  // Auto-Scaling: a little cloud.
  proj_cloud: () => merge([
    ball(0.17, P.w, -0.17, 0, 0),
    ball(0.22, P.w, 0.04, 0.05, 0),
    ball(0.15, P.w, 0.24, -0.01, 0),
    ball(0.12, P.q, 0.08, -0.09, 0.1),
  ]),
  // Reply-All Storm: an envelope.
  proj_email: () => merge([
    slab(0.62, 0.44, P.k, 0),
    slab(0.54, 0.36, P.w, 1),
    rotBox(0.3, 0.06, 0.03, P.k, -0.12, 0.012, 0.06, 0, -0.6, 0),
    rotBox(0.3, 0.06, 0.03, P.k, 0.12, 0.012, 0.06, 0, 0.6, 0),
  ]),
  // Asset Tag: a white barcode sticker.
  proj_tag: () => merge([
    slab(0.56, 0.42, P.k, 0),
    slab(0.48, 0.34, P.w, 1),
    ...[-0.16, -0.08, 0.02, 0.08, 0.16].map((x, i) => slab(i % 2 ? 0.03 : 0.05, 0.2, P.k, 2, x, 0)),
  ]),
  // Fairway Driver: an orange disc golf driver.
  proj_disc: () => merge([
    cyl(0.36, 0.36, 0.06, P.k, 0, -0.03, 0, 12),
    cyl(0.32, 0.32, 0.066, P.o, 0, -0.03, 0, 12),
    cyl(0.2, 0.2, 0.07, P.w, 0, -0.03, 0, 12),
    cyl(0.15, 0.15, 0.074, P.o, 0, -0.03, 0, 12),
    cyl(0.05, 0.05, 0.078, P.r, 0, -0.03, 0, 6),
  ]),
  // PowerShell Script and Scheduled Task Army bolts: little glowing pellets.
  proj_bolt: () => merge([ball(0.16, P.k, 0, 0, 0, 1), ball(0.13, P.B, 0, 0.02, 0.03, 1)]),
  proj_bolt_evo: () => merge([ball(0.16, P.k, 0, 0, 0, 1), ball(0.13, P.e, 0, 0.02, 0.03, 1)]),
  // Firewall: a block of bricks, standing, its face toward +Z.
  proj_firewall: () => {
    const W = 0.9;
    const parts = [box(W, 0.7, 0.2, P.k, 0, -0.35, 0)]; // the mortar
    for (let row = 0; row < 5; row++) {
      const y = -0.33 + row * 0.135;
      // Running bond: every other row starts with a half brick.
      const edges = row % 2 ? [-0.43, -0.32, -0.11, 0.1, 0.31, 0.43] : [-0.43, -0.22, -0.01, 0.2, 0.43];
      for (let i = 0; i < edges.length - 1; i++) {
        const x0 = edges[i] + 0.012;
        const x1 = edges[i + 1] - 0.012;
        parts.push(box(x1 - x0, 0.11, 0.26, P.r, (x0 + x1) / 2, y, 0));
      }
    }
    return merge(parts);
  },
};

// --- Tool props -----------------------------------------------------------------------
// What some tools put on the floor or send after users, keyed by the original sprite id
// (or a name of our own where the original drew it by hand). Built facing +z, feet at
// y = 0 unless noted.

// A Delegate helper: a pint-sized tech (the original's 16 x 16 sprite) in the team polo
// with a lanyard and badge. The Outsourced Team wears the contractor's orange.
function helper(top, hair, lanyard) {
  const parts = person({ hair, top, pants: P.n });
  parts.push(capsule(0.016, 0.2, lanyard, -0.07, 0.8, 0.255, -0.35, 0.25));
  parts.push(capsule(0.016, 0.2, lanyard, 0.07, 0.8, 0.255, -0.35, -0.25));
  parts.push(rotBox(0.13, 0.16, 0.03, P.w, 0, 0.66, 0.285));
  const g = merge(parts);
  g.scale(0.72, 0.72, 0.72);
  return g;
}

// A PowerShell Script: a terminal on a tripod, its prompt on the screen.
function terminal(screen) {
  const parts = [];
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + Math.PI / 6;
    parts.push(capsule(0.025, 0.42, P.k, Math.sin(a) * 0.14, 0.22, Math.cos(a) * 0.14, -Math.cos(a) * 0.35, Math.sin(a) * 0.35));
  }
  parts.push(cyl(0.05, 0.05, 0.2, P.G, 0, 0.4, 0, 6));
  parts.push(box(0.86, 0.5, 0.16, P.k, 0, 0.58, 0));
  parts.push(box(0.76, 0.4, 0.02, screen, 0, 0.63, 0.08));
  // ">_" in white.
  parts.push(rotBox(0.12, 0.035, 0.02, P.w, -0.26, 0.88, 0.095, 0, 0, -0.6));
  parts.push(rotBox(0.12, 0.035, 0.02, P.w, -0.26, 0.81, 0.095, 0, 0, 0.6));
  parts.push(rotBox(0.16, 0.035, 0.02, P.w, -0.06, 0.76, 0.095));
  return merge(parts);
}

export const TOOL_MODELS = {
  helper: () => helper(P.b, P.y, P.y),
  helper_evo: () => helper(P.o, P.k, P.k),
  turret: () => terminal(P.b),
  turret_evo: () => terminal(P.e),
  // Rubber Duck: yellow, orange beak, centered a little above the floor.
  duck: () => merge([
    sphere(0.26, P.y, 0, 0.2, -0.04, 1, 0.75, 1.25, 9, 6),
    sphere(0.16, P.y, 0, 0.44, 0.14, 1, 1, 1, 8, 6),
    shaped(new THREE.ConeGeometry(0.07, 0.16, 5), P.o, 0, 0.42, 0.33, Math.PI / 2, 0, 0, 1.3, 1, 0.6),
    sphere(0.03, P.k, -0.08, 0.5, 0.26),
    sphere(0.03, P.k, 0.08, 0.5, 0.26),
    sphere(0.1, P.y, 0, 0.3, -0.3, 1, 0.8, 1), // tail
  ]),
  // Zip Ties: a loop of cable tie lying on the floor (unit radius, the renderer scales it),
  // with its ratchet head and the loose tail.
  ziptie: () => {
    const loop = new THREE.TorusGeometry(1, 0.07, 4, 20);
    loop.rotateX(Math.PI / 2);
    loop.scale(1, 1, 0.55);
    const shine = new THREE.TorusGeometry(1, 0.035, 3, 10, Math.PI * 0.9);
    shine.rotateX(-Math.PI / 2);
    shine.scale(1, 1, 0.55);
    return merge([
      paint(loop, P.g, 0, 0.05, 0),
      paint(shine, P.w, 0, 0.1, 0, 0, Math.PI * 0.05),
      box(0.3, 0.14, 0.3, P.k, 1, 0, 0),
      box(0.2, 0.15, 0.2, P.w, 1, 0, 0),
      box(0.4, 0.06, 0.1, P.w, 1.3, 0, 0),
    ]);
  },
  // Screen Share: the slide everyone is squinting at, standing on end (centered).
  slide: () => merge([
    rotBox(1.1, 0.8, 0.05, P.k, 0, 0, 0),
    rotBox(1.0, 0.7, 0.06, P.w, 0, 0, 0),
    rotBox(0.84, 0.16, 0.07, P.B, 0, 0.2, 0),
    rotBox(0.58, 0.06, 0.07, P.g, -0.13, -0.02, 0),
    rotBox(0.42, 0.06, 0.07, P.g, -0.21, -0.16, 0),
  ]),
};

// What's wrong with a user, floating over their head (centered on its origin): stunned
// (two "awaiting approval" sparkles), confused (Password Expired's "?") and flagged (the
// Rubber Duck's and the SIEM's orange tag).
export const STATUS_MODELS = {
  stun: () => merge([
    paint(new THREE.OctahedronGeometry(0.1), P.y, -0.16, 0, 0),
    paint(new THREE.OctahedronGeometry(0.08), P.w, 0.16, 0.08, 0),
  ]),
  confuse: () => merge([
    rotBox(0.2, 0.06, 0.06, P.p, 0, 0.17, 0),
    rotBox(0.06, 0.12, 0.06, P.p, 0.08, 0.1, 0),
    rotBox(0.12, 0.06, 0.06, P.p, 0.04, 0.03, 0),
    rotBox(0.06, 0.08, 0.06, P.p, 0, -0.03, 0),
    rotBox(0.06, 0.06, 0.06, P.p, 0, -0.17, 0),
  ]),
  mark: () => merge([
    rotBox(0.04, 0.34, 0.04, P.k, -0.1, 0, 0),
    rotBox(0.2, 0.14, 0.04, P.o, 0.02, 0.09, 0),
  ]),
};

// --- Pickups ---------------------------------------------------------------------------
// Closed Tickets (one per tier in data/pickups.js) and floor items, keyed by the original
// sprite id. Centered on their origin; the renderer floats, bobs and spins them.

// A ticket stub with a white check on both faces, in its tier color.
function stub(color) {
  const check = (z) => [
    rotBox(0.07, 0.16, 0.02, P.w, -0.06, -0.02, z, 0, 0, 0.7),
    rotBox(0.07, 0.3, 0.02, P.w, 0.06, 0.02, z, 0, 0, -0.6),
  ];
  return merge([
    rotBox(0.5, 0.34, 0.07, P.k, 0, 0, 0),
    rotBox(0.44, 0.28, 0.09, color, 0, 0, 0),
    ...check(0.05),
    ...check(-0.05),
  ]);
}

export const PICKUP_MODELS = {
  ticket_blue: () => stub(P.B),
  ticket_green: () => stub(P.e),
  ticket_gold: () => stub(P.y),
  // Leftover Vendor-Lunch Pizza: a slice, tip first.
  pizza: () => merge([
    paint(new THREE.CylinderGeometry(0.42, 0.42, 0.08, 3), P.y, 0, 0, 0.06, 0, Math.PI, 0), // tip toward -z
    box(0.78, 0.13, 0.12, P.d, 0, -0.05, 0.27), // crust along the wide end
    cyl(0.06, 0.06, 0.1, P.r, -0.1, -0.03, 0.1, 6),
    cyl(0.06, 0.06, 0.1, P.r, 0.11, -0.03, 0.08, 6),
    cyl(0.05, 0.05, 0.1, P.r, 0.0, -0.03, -0.1, 6),
  ]),
  // Bulk Close: the big CLOSED stamp.
  bulk_close: () => merge([
    box(0.62, 0.1, 0.36, P.k, 0, -0.3, 0),
    box(0.58, 0.16, 0.32, P.r, 0, -0.2, 0),
    box(0.5, 0.04, 0.33, P.w, 0, -0.12, 0),
    cyl(0.06, 0.08, 0.26, P.h, 0, -0.04, 0, 6),
    ball(0.13, P.h, 0, 0.28, 0, 1),
  ]),
  // Change Approved: a taped-up box with a green check label.
  chest: () => merge([
    box(0.64, 0.46, 0.46, P.d, 0, -0.23, 0),
    box(0.66, 0.06, 0.48, P.h, 0, 0.17, 0), // lid seam
    box(0.12, 0.48, 0.48, P.y, 0, -0.24, 0), // tape
    box(0.2, 0.18, 0.02, P.w, -0.18, -0.12, 0.235), // label
    rotBox(0.04, 0.07, 0.02, P.e, -0.21, -0.13, 0.25, 0, 0, 0.7),
    rotBox(0.04, 0.12, 0.02, P.e, -0.16, -0.11, 0.25, 0, 0, -0.6),
  ]),
  // PTO Request: a calendar page with a beach on it.
  pto: () => merge([
    rotBox(0.5, 0.44, 0.06, P.k, 0, 0, 0),
    rotBox(0.44, 0.38, 0.08, P.w, 0, -0.02, 0),
    rotBox(0.44, 0.08, 0.09, P.r, 0, 0.17, 0),
    rotBox(0.44, 0.1, 0.09, P.B, 0, -0.14, 0),
    ball(0.07, P.y, -0.08, 0.02, 0.04, 0),
  ]),
  // Welcome Swag Bag: a navy tote with the new logo.
  swag_bag: () => merge([
    rotBox(0.5, 0.44, 0.2, P.a, 0, -0.06, 0),
    rotBox(0.2, 0.16, 0.22, P.y, 0.04, -0.04, 0),
    paint(new THREE.TorusGeometry(0.13, 0.025, 4, 10, Math.PI), P.k, 0, 0.16, 0),
  ]),
  // Fruit gummies: a purple bag with a window of gummies.
  gummies: () => merge([
    rotBox(0.46, 0.4, 0.14, P.p, 0, 0, 0),
    rotBox(0.46, 0.06, 0.15, P.w, 0, 0.18, 0),
    rotBox(0.3, 0.2, 0.16, P.w, 0, -0.02, 0),
    ball(0.05, P.r, -0.07, 0.0, 0.07, 0),
    ball(0.05, P.e, 0.04, -0.05, 0.07, 0),
    ball(0.05, P.o, 0.08, 0.04, 0.07, 0),
  ]),
};

// Stand-in for a projectile with no model yet: a small cube.
export const fallbackProjectile = () => box(0.24, 0.24, 0.24, P.w, 0, -0.12, 0);

// A soft round shadow on the floor, for the horde (and for the tech when shadows are off).
export function blobShadowGeometry(radius = 0.42) {
  const g = new THREE.CircleGeometry(radius, 14);
  g.rotateX(-Math.PI / 2);
  return g;
}

// --- Furniture ------------------------------------------------------------------------
// Each builder takes a prop from the simulation's layout (src/sim/floor.js, world px)
// and appends geometry in scene units to `out` (and anything that lights up to
// `out.glow`). A chunk's parts are merged into one mesh.

// --- Open Office ----------------------------------------------------------------------

// Small deterministic variety (which desks get a mug or papers) from integer coordinates.
const vary = (a, b) => (((Math.imul(a | 0, 73856093) ^ Math.imul(b | 0, 19349663)) >>> 0) % 1000) / 1000;

const PANEL_H = 1.35;
const SIDE_H = 1.2;

function cubicleRow(out, prop) {
  const { x, y, segments, yellow } = prop;
  const z0 = px(y);
  for (let i = 0; i < segments; i++) {
    const cx = px(x + i * 64 + 32); // cubicle center
    // Back partition: fabric panel with a light trim on top.
    out.push(box(px(64), PANEL_H, 0.18, yellow[i] ? '#c9a24e' : P.G, cx, 0, z0 + 0.12));
    out.push(box(px(64), 0.06, 0.22, P.g, cx, PANEL_H, z0 + 0.12));
    // Desk against the partition: top, front edge, modesty panel.
    const dz = z0 + px(6 + 13);
    out.push(box(px(58), 0.06, px(26), P.D, cx, 0.72, dz));
    out.push(box(px(58), 0.08, 0.06, P.E, cx, 0.66, dz + px(13) - 0.03));
    out.push(box(px(58) - 0.1, 0.62, 0.05, P.E, cx, 0.05, z0 + 0.35));
    // Monitor, stand and keyboard.
    out.push(box(0.12, 0.2, 0.12, P.k, cx, 0.78, dz - 0.25));
    out.push(box(0.72, 0.44, 0.06, P.k, cx, 0.96, dz - 0.28));
    out.push(box(0.64, 0.36, 0.02, P.B, cx, 1.0, dz - 0.245));
    out.push(box(0.56, 0.03, 0.18, P.g, cx, 0.78, dz + 0.22));
    // Something on the desk now and then.
    const v = vary(x + i, y);
    if (v < 0.35) out.push(cyl(0.06, 0.05, 0.13, P.w, cx + 0.9, 0.78, dz)); // mug
    else if (v < 0.65) out.push(box(0.32, 0.03, 0.42, P.w, cx - 0.95, 0.78, dz + 0.05, 0.3)); // papers
    if (vary(y, x + i) < 0.3) out.push(box(0.1, 0.1, 0.01, P.y, cx + 0.3, 1.0, dz - 0.21)); // sticky note on the screen
    // Chair in front (walkable in the original: only the partition and desk block).
    const chz = z0 + px(46);
    const ry = (v - 0.5) * 0.8;
    out.push(cyl(0.05, 0.05, 0.38, P.k, cx, 0.06, chz, 6));
    out.push(cyl(0.3, 0.3, 0.06, P.K, cx, 0.02, chz, 5));
    out.push(box(0.56, 0.1, 0.52, P.n, cx, 0.44, chz, ry));
    out.push(rotBox(0.54, 0.5, 0.08, P.n, cx - Math.sin(ry) * 0.26, 0.82, chz + Math.cos(ry) * 0.26, -0.12, ry, 0));
  }
  // Side panels between and at the ends of the cubicles, as deep as the solid part.
  for (let i = 0; i <= segments; i++) {
    const sx = px(x + i * 64);
    out.push(box(0.16, SIDE_H, px(38), P.G, sx, 0, z0 + px(19)));
    out.push(box(0.2, 0.06, px(38), P.g, sx, SIDE_H, z0 + px(19)));
  }
}

function waterCooler(out, { x, y }) {
  const cx = px(x + 6);
  const cz = px(y + 28) - 0.25;
  out.push(box(0.5, 0.95, 0.46, P.w, cx, 0, cz));
  out.push(box(0.5, 0.06, 0.46, P.g, cx, 0.95, cz));
  out.push(box(0.12, 0.08, 0.06, P.B, cx - 0.1, 0.62, cz + 0.25));
  out.push(box(0.12, 0.08, 0.06, P.r, cx + 0.1, 0.62, cz + 0.25));
  out.push(cyl(0.2, 0.22, 0.5, '#7fc4f0', cx, 1.01, cz, 8));
  out.push(cyl(0.08, 0.2, 0.1, '#7fc4f0', cx, 1.51, cz, 8));
}

function plant(out, { x, y }) {
  const cx = px(x + 8);
  const cz = px(y + 24) - 0.25;
  out.push(cyl(0.3, 0.22, 0.5, P.h, cx, 0, cz, 7));
  out.push(cyl(0.31, 0.31, 0.05, '#4a2e14', cx, 0.48, cz, 7));
  out.push(ball(0.45, P.e, cx, 0.95, cz));
  out.push(ball(0.32, '#2a8a4a', cx + 0.2, 1.3, cz - 0.1));
  out.push(ball(0.28, '#4fcf7a', cx - 0.18, 1.25, cz + 0.12));
}

// --- Server Room ----------------------------------------------------------------------
// Lights (rack LEDs, panels, the hot aisle) go into `out.glow`: unlit, so they shine even
// with the lights down.

const LED = [P.e, P.e, P.e, P.q, P.y];

// A row of 32 px racks on the raised floor, fronts toward the hot aisle, with rows of
// blinking-light units. `racks` picks one of three fills for each.
function rackRow(out, { x, y, racks }) {
  const z0 = px(y + 4);
  const d = px(52);
  const H = 2.3;
  racks.forEach((kind, i) => {
    const cx = px(x + i * 32 + 16);
    out.push(box(px(31), H, d, P.K, cx, 0, z0 + d / 2));
    out.push(box(px(31), 0.06, d, P.m, cx, H, z0 + d / 2)); // top
    out.push(box(px(27), H - 0.3, 0.04, P.c, cx, 0.15, z0 + d + 0.01)); // the door's mesh front
    for (let u = 0; u < 11; u++) {
      const uy = 0.3 + u * 0.17;
      const v = vary(x + i * 7 + kind, y + u * 13);
      if (v < 0.15) continue; // a blank panel
      out.push(box(px(26), 0.035, 0.03, P.k, cx, uy - 0.02, z0 + d + 0.04)); // the unit's seam
      for (let l = 0; l < 5; l++)
        if (vary(u * 31 + l, x + y + kind * 5 + i) < 0.6)
          out.glow.push(box(0.07, 0.07, 0.02, LED[(l + u + kind) % LED.length], cx - 0.6 + l * 0.13, uy + 0.03, z0 + d + 0.05));
      out.push(box(0.5, 0.025, 0.02, P.m, cx + 0.42, uy + 0.05, z0 + d + 0.05)); // drive bays
    }
  });
}

// The glowing strip in front of a rack row: the hot aisle, with a dashed centre line.
function hotAisle(out, { x, y, w, h }) {
  out.glow.push(box(px(w), 0.01, px(h), '#ff5a2e', px(x + w / 2), 0.004, px(y + h / 2)));
  out.glow.push(box(px(w) - 0.2, 0.011, px(h) - 0.2, P.o, px(x + w / 2), 0.004, px(y + h / 2)));
  for (let i = 0; i < w; i += 12) out.glow.push(box(px(6), 0.012, px(2), P.y, px(x + i + 3), 0.006, px(y + h / 2)));
}

// Computer-room air conditioner: a big white cabinet with vent slats and a control panel.
function crac(out, { x, y }) {
  const cx = px(x + 20);
  const z0 = px(y + 4);
  const d = px(44);
  out.push(box(px(40), 2.0, d, P.w, cx, 0, z0 + d / 2));
  out.push(box(px(40), 0.08, d, P.g, cx, 1.96, z0 + d / 2));
  for (let k = 0; k < 7; k++) out.push(box(px(34), 0.04, 0.03, P.g, cx, 0.95 + k * 0.13, z0 + d + 0.01));
  out.push(box(0.9, 0.5, 0.04, P.k, cx - 0.55, 0.3, z0 + d + 0.01));
  out.glow.push(box(0.32, 0.06, 0.02, P.q, cx - 0.65, 0.65, z0 + d + 0.035), box(0.55, 0.06, 0.02, P.e, cx - 0.55, 0.5, z0 + d + 0.035));
  out.push(box(0.75, 0.5, 0.04, P.g, cx + 0.62, 0.3, z0 + d + 0.01));
}

// --- Call Center ----------------------------------------------------------------------

// A row of headset pods: a low blue divider behind each desk and between neighbours, a
// small desk with the softphone queue on its monitor, a headset, and a chair in front.
function podRow(out, { x, y, n }) {
  const back = px(y + 3);
  for (let i = 0; i < n; i++) {
    const cx = px(x + i * 34 + 15);
    out.push(box(px(34), 1.1, 0.14, P.b, px(x + i * 34 - 2 + 17), 0, back));
    out.push(box(px(34), 0.05, 0.18, P.g, px(x + i * 34 - 2 + 17), 1.1, back));
    const dz = px(y + 6 + 11);
    out.push(box(px(30), 0.06, px(20), P.D, cx, 0.72, dz));
    out.push(box(px(30), 0.1, 0.05, P.E, cx, 0.64, dz + px(10)));
    out.push(box(px(30) - 0.1, 0.62, 0.05, P.E, cx, 0.05, back + 0.12));
    // Monitor with the queue on it.
    out.push(box(0.1, 0.18, 0.1, P.G, cx, 0.78, dz - 0.3));
    out.push(box(0.66, 0.42, 0.06, P.n, cx, 0.94, dz - 0.33));
    out.glow.push(box(0.36, 0.05, 0.02, P.B, cx - 0.08, 1.24, dz - 0.29), box(0.24, 0.05, 0.02, P.e, cx - 0.14, 1.14, dz - 0.29), box(0.42, 0.05, 0.02, P.B, cx - 0.05, 1.04, dz - 0.29));
    out.push(box(0.6, 0.03, 0.2, P.g, cx, 0.78, dz + 0.12)); // keyboard
    // Headset on the desk: a band and two cups.
    out.push(paint(new THREE.TorusGeometry(0.11, 0.025, 4, 10, Math.PI), P.k, cx + 0.62, 0.8, dz - 0.05));
    out.push(cyl(0.06, 0.06, 0.05, P.G, cx + 0.51, 0.78, dz - 0.05, 6), cyl(0.06, 0.06, 0.05, P.G, cx + 0.73, 0.78, dz - 0.05, 6));
    // Chair (walkable, as in the original: only the dividers and desks block).
    const chz = px(y + 42);
    out.push(cyl(0.05, 0.05, 0.36, P.k, cx, 0.06, chz, 6), cyl(0.26, 0.26, 0.06, P.K, cx, 0.02, chz, 5));
    out.push(box(0.5, 0.1, 0.46, P.n, cx, 0.42, chz));
    out.push(box(0.48, 0.42, 0.08, P.n, cx, 0.52, chz + 0.24));
  }
  for (let i = 0; i <= n; i++) out.push(box(0.12, 1.0, px(30), P.b, px(x + i * 34 - 2), 0, px(y + 15)));
}

// The queue wallboard on two posts, high enough to walk under: calls waiting in red.
function wallboard(out, { x, y }) {
  const z = px(y + 20);
  const cx = px(x + 32);
  for (const sx of [-1.6, 1.6]) out.push(cyl(0.06, 0.06, 2.0, P.k, cx + sx, 0, z, 6), cyl(0.24, 0.24, 0.05, P.k, cx + sx, 0, z, 8));
  out.push(box(px(64), 1.25, 0.12, P.G, cx, 1.9, z));
  out.push(box(px(64) - 0.1, 1.15, 0.03, P.k, cx, 1.95, z + 0.07));
  const f = z + 0.09;
  for (const dx of [-1.55, -1.3, -1.05, -0.8]) out.glow.push(box(0.17, 0.3, 0.02, P.q, cx + dx, 2.65, f)); // CALLS
  for (const dx of [-0.2, 0.12, 0.44]) out.glow.push(box(0.24, 0.42, 0.02, P.r, cx + dx, 2.58, f)); // 847
  out.glow.push(box(3.5, 0.12, 0.02, P.r, cx + 0.05, 2.3, f), box(0.38, 0.12, 0.02, P.e, cx - 1.5, 2.3, f + 0.003));
  for (const dx of [-1.55, -1.3, -1.05, -0.8]) out.glow.push(box(0.17, 0.12, 0.02, P.q, cx + dx, 2.05, f)); // AVAIL
  out.glow.push(box(0.24, 0.24, 0.02, P.e, cx - 0.2, 2.02, f)); // 0
}

// --- Parking Garage -------------------------------------------------------------------

const CARS = [[P.r, P.k], [P.b, P.n], [P.w, P.g], [P.e, P.h]];

// A car seen from above in the original: nose up the screen (toward -z).
function car(out, cx, cz, [paintC, trim]) {
  const W = px(28);
  const L = px(48);
  out.push(box(W, 0.5, L, paintC, cx, 0.22, cz));
  out.push(box(W - 0.06, 0.08, L - 0.1, trim, cx, 0.16, cz)); // sills
  out.push(box(W - 0.3, 0.46, L * 0.48, paintC, cx, 0.72, cz + 0.12)); // cabin
  out.push(box(W - 0.24, 0.3, 0.06, P.B, cx, 0.78, cz - L * 0.12 + 0.02)); // windscreen
  out.push(box(W - 0.24, 0.26, 0.06, P.B, cx, 0.8, cz + L * 0.36 + 0.04)); // rear window
  out.push(box(0.04, 0.24, L * 0.36, P.B, cx - (W - 0.3) / 2 - 0.01, 0.8, cz + 0.12), box(0.04, 0.24, L * 0.36, P.B, cx + (W - 0.3) / 2 + 0.01, 0.8, cz + 0.12));
  out.push(box(W - 0.36, 0.04, L * 0.44, trim, cx, 1.18, cz + 0.12)); // roof
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]])
    out.push(paint(new THREE.CylinderGeometry(0.22, 0.22, 0.16, 8), P.k, cx + sx * (W / 2 - 0.02), 0.22, cz + sz * L * 0.32, 0, 0, Math.PI / 2));
  out.glow.push(box(0.3, 0.1, 0.03, P.y, cx - W / 2 + 0.3, 0.55, cz - L / 2 - 0.01), box(0.3, 0.1, 0.03, P.y, cx + W / 2 - 0.3, 0.55, cz - L / 2 - 0.01));
  out.glow.push(box(0.3, 0.1, 0.03, P.r, cx - W / 2 + 0.3, 0.55, cz + L / 2 + 0.01), box(0.3, 0.1, 0.03, P.r, cx + W / 2 - 0.3, 0.55, cz + L / 2 + 0.01));
}

// Painted stalls (yellow lines) with a car parked in some of them (`cars`: colour or -1).
function stalls(out, { x, y, cars }) {
  const n = cars.length;
  for (let i = 0; i <= n; i++) out.push(box(px(2), 0.012, px(64), P.y, px(x + i * 44 + 1), 0, px(y + 32)));
  out.push(box(px(n * 44 + 2), 0.012, px(2), P.y, px(x + (n * 44 + 2) / 2), 0, px(y + 64)));
  cars.forEach((c, i) => {
    if (c >= 0) car(out, px(x + i * 44 + 23), px(y + 35), CARS[c]);
  });
}

// A square concrete pillar with hazard stripes round its base and a "P2" level sign.
function pillar(out, { x, y }) {
  const cx = px(x + 12);
  const cz = px(y + 4 + 18);
  const w = px(24);
  const d = px(36);
  out.push(box(w, 3.4, d, P.X, cx, 0, cz));
  for (let k = 0; k < 5; k++) out.push(box(w + 0.04, 0.12, d + 0.04, k & 1 ? P.k : P.y, cx, 0.05 + k * 0.12, cz));
  out.push(box(0.8, 0.62, 0.04, P.w, cx, 1.6, cz + d / 2 + 0.02));
  out.push(box(0.14, 0.42, 0.03, P.b, cx - 0.18, 1.7, cz + d / 2 + 0.045), box(0.24, 0.12, 0.03, P.b, cx + 0.06, 2.0, cz + d / 2 + 0.045));
  out.push(box(0.12, 0.12, 0.03, P.b, cx + 0.12, 1.86, cz + d / 2 + 0.045), box(0.24, 0.1, 0.03, P.b, cx + 0.06, 1.7, cz + d / 2 + 0.045));
}

// --- Merger Day -----------------------------------------------------------------------

// Hot desk: a long white bench with three laptops (nobody has an assigned seat any more).
function benchDesk(out, { x, y }) {
  const cx = px(x + 35);
  const cz = px(y + 14);
  out.push(box(px(70), 0.06, px(20), P.w, cx, 0.72, cz));
  out.push(box(px(70), 0.08, 0.05, P.g, cx, 0.66, cz + px(10)));
  for (const sx of [-1, 1]) out.push(box(0.08, 0.72, px(18), P.g, cx + sx * (px(35) - 0.15), 0, cz));
  for (let k = 0; k < 3; k++) {
    const lx = px(x + 12 + k * 20);
    out.push(box(0.6, 0.03, 0.4, P.g, lx, 0.78, cz + 0.05));
    out.push(rotBox(0.6, 0.4, 0.03, P.G, lx, 0.98, cz - 0.17, -0.25));
    out.glow.push(rotBox(0.5, 0.3, 0.01, P.B, lx, 0.98, cz - 0.15, -0.25));
  }
}

// A navy bean bag ("collaboration seating").
function beanBag(out, { x, y }) {
  out.push(paint(new THREE.SphereGeometry(0.5, 9, 6).scale(1.15, 0.6, 0.95), P.a, px(x + 11), 0.26, px(y + 10)));
  out.push(paint(new THREE.SphereGeometry(0.28, 7, 5).scale(1.1, 0.6, 0.9), P.A, px(x + 9), 0.5, px(y + 8)));
}

// Tiny 3x5 block letters for the banner, as in the original's sprite.
const FONT = {
  S: ['xxx', 'x..', 'xxx', '..x', 'xxx'],
  Y: ['x.x', 'x.x', '.x.', '.x.', '.x.'],
  N: ['xx.', 'x.x', 'x.x', 'x.x', 'x.x'],
  E: ['xxx', 'x..', 'xx.', 'x..', 'xxx'],
  R: ['xx.', 'x.x', 'xx.', 'x.x', 'x.x'],
  G: ['xxx', 'x..', 'x.x', 'x.x', 'xxx'],
  '!': ['.x.', '.x.', '.x.', '...', '.x.'],
};

// The parent company's "SYNERGY!" banner, hung between two poles.
function synergyBanner(out, { x, y }) {
  const cx = px(x + 26);
  const z = px(y + 14);
  for (const sx of [-1.7, 1.7]) out.push(cyl(0.05, 0.05, 2.5, P.g, cx + sx, 0, z, 6), cyl(0.2, 0.2, 0.05, P.g, cx + sx, 0, z, 8));
  out.push(box(3.3, 0.9, 0.06, P.a, cx, 1.5, z));
  out.push(box(3.3, 0.07, 0.07, P.y, cx, 2.33, z));
  out.push(box(0.26, 0.26, 0.02, P.y, cx - 1.38, 1.85, z + 0.04));
  const u = 0.07; // one letter pixel
  let lx = cx - 0.95;
  for (const ch of 'SYNERGY!') {
    FONT[ch].forEach((row, j) => [...row].forEach((v, i) => v === 'x' && out.push(box(u, u, 0.02, P.w, lx + i * u, 2.1 - j * u, z + 0.04))));
    lx += u * 4;
  }
}

// Cardboard moving boxes, taped and labelled: one, or a stack of three.
function movingBox(out, cx, y0, cz) {
  out.push(box(px(18), 0.62, px(15), P.d, cx, y0, cz));
  out.push(box(px(18) + 0.01, 0.04, px(15) + 0.01, P.y, cx, y0 + 0.6, cz));
  out.push(box(0.14, 0.63, px(15) + 0.02, P.h, cx, y0, cz));
  out.push(box(0.3, 0.2, 0.02, P.w, cx - 0.3, y0 + 0.2, cz + px(7.5) + 0.01));
}
function boxSingle(out, { x, y }) {
  movingBox(out, px(x + 9), 0, px(y + 9));
}
function boxStack(out, { x, y }) {
  movingBox(out, px(x + 9), 0, px(y + 26));
  movingBox(out, px(x + 25), 0, px(y + 26));
  movingBox(out, px(x + 17), 0.62, px(y + 24));
}

// Where the two companies' floors meet: a dark strip with yellow and white dashes.
function integrationLine(out, { x, y, w, h }) {
  out.push(box(px(w), 0.014, px(h), P.k, px(x + w / 2), 0, px(y + h / 2)));
  const along = w > h;
  for (let i = 0; i < (along ? w : h); i += 16) {
    const c = (i >> 4) & 1 ? P.w : P.y;
    if (along) out.push(box(px(12), 0.018, px(h - 2), c, px(x + i + 6), 0, px(y + h / 2)));
    else out.push(box(px(w - 2), 0.018, px(12), c, px(x + w / 2), 0, px(y + i + 6)));
  }
}

const PROPS = {
  cubicleRow, waterCooler, plant,
  rackRow, hotAisle, crac,
  podRow, wallboard,
  stalls, pillar,
  benchDesk, beanBag, synergyBanner, boxSingle, boxStack, integrationLine,
};

// Geometry for a list of props: the furniture merged into one, and its lights merged into
// another (`glow`, drawn unlit). Either is null when there's nothing.
export function propsGeometry(props) {
  const parts = [];
  parts.glow = [];
  for (const p of props) PROPS[p.type](parts, p);
  return { solid: parts.length ? merge(parts) : null, glow: parts.glow.length ? merge(parts.glow) : null };
}
