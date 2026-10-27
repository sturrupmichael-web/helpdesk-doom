// The 3D view, drawn at a low resolution and stretched up with nearest-neighbour
// scaling for chunky 1993 pixels. The bottom of the screen belongs to the status bar
// (hud.js), so the 3D view is drawn in the part above it, like DOOM's.
//
// Two passes: the world, then the weapon in your hands (its own scene and camera, so it
// never clips into walls).

import * as THREE from 'three';

export const DETAIL = { low: 200, medium: 240, high: 320 }; // lines of resolution
export const BAR_FRACTION = 32 / 200; // status bar height, as in DOOM

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.gl = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
    this.gl.setPixelRatio(1);
    this.gl.autoClear = false;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x000000);
    this.fog = new THREE.Fog(0x000000, 5, 40);
    this.scene.fog = this.fog;
    this.camera = new THREE.PerspectiveCamera(68, 1, 0.05, 160);
    this.camera.rotation.order = 'YXZ';
    this.viewScene = new THREE.Scene();
    this.viewCamera = new THREE.PerspectiveCamera(60, 1, 0.01, 10);
    this.lines = DETAIL.medium;
    this.showBar = true;
    this.width = 320;
    this.height = 200;
    this.resize();
    addEventListener('resize', () => this.resize());
  }

  setDetail(lines) {
    this.lines = lines;
    this.resize();
  }

  resize() {
    const aspect = Math.max(1, innerWidth / Math.max(1, innerHeight));
    this.height = this.lines;
    this.width = Math.round(this.lines * aspect);
    this.gl.setSize(this.width, this.height, false);
    this.barHeight = this.showBar ? Math.round(this.height * BAR_FRACTION) : 0;
    const viewH = this.height - this.barHeight;
    this.camera.aspect = this.width / viewH;
    this.camera.updateProjectionMatrix();
    this.viewCamera.aspect = this.width / viewH;
    this.viewCamera.updateProjectionMatrix();
  }

  setBar(on) {
    if (this.showBar === on) return;
    this.showBar = on;
    this.resize();
  }

  // Puts the camera at the player's eye.
  follow(player) {
    this.camera.position.set(player.x, player.eye, player.z);
    this.camera.rotation.set(player.pitch, player.yaw, 0);
  }

  render() {
    const gl = this.gl;
    const viewH = this.height - this.barHeight;
    gl.setScissorTest(true);
    gl.setViewport(0, this.barHeight, this.width, viewH);
    gl.setScissor(0, this.barHeight, this.width, viewH);
    gl.clear();
    gl.render(this.scene, this.camera);
    gl.clearDepth();
    gl.render(this.viewScene, this.viewCamera);
    gl.setScissorTest(false);
  }
}

// Light effects for flickering rooms, as brightness factors. Called every frame.
export class LightEffects {
  constructor() {
    this.t = 0;
    this.flicker = 1;
    this.flickerT = 0;
  }
  update(dt) {
    this.t += dt;
    // Flicker: a dying fluorescent tube, mostly on with random drop-outs.
    this.flickerT -= dt;
    if (this.flickerT <= 0) {
      const off = Math.random() < 0.35;
      this.flicker = off ? 0.45 + Math.random() * 0.2 : 1;
      this.flickerT = off ? 0.04 + Math.random() * 0.1 : 0.2 + Math.random() * 1.6;
    }
    return {
      none: 1,
      flicker: this.flicker,
      strobe: this.t % 1.1 < 0.12 ? 0.45 : 1,
      glow: 0.82 + 0.18 * Math.sin(this.t * 2.2),
      exit: 1,
    };
  }
}
