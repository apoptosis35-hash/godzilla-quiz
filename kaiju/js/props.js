// Giant everyday props (rubber duck, donut, mug, cactus, alarm clock) standing just outside the arena.
// The meshes are modelled in Blender: tools/blender/make_props.py -> models/*.glb.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// scale: model units (cm of the real object) -> world units
export const PROPS = {
  duck: { scale: 1.9 },
  donut: { scale: 1.3, upright: true }, // stood on its edge like a rooftop sign
  mug: { scale: 1.9, steam: true },
  cactus: { scale: 1.25 },
  clock: { scale: 1.6 },
};

const loader = new GLTFLoader();
const cache = new Map();
function load(name) {
  if (!cache.has(name)) cache.set(name, loader.loadAsync(`models/${name}.glb`).then((g) => g.scene).catch((e) => { cache.delete(name); throw e; }));
  return cache.get(name);
}

// Spots sit in the free belt between the inner ring of buildings (r 44-47) and the outer blocks (r >= 62),
// midway between two inner-ring buildings so they show through the gaps.
export function propSpots(names, ringN, water) {
  const spots = [];
  const slots = [1, Math.round(ringN * 0.36), Math.round(ringN * 0.68)];
  names.forEach((name, i) => {
    if (name === 'duck' && water) { spots.push({ name, x: 86, z: -14, r: 0, rotY: -2.2, floating: true }); return; }
    let k = slots[i % slots.length], a, x, z, n = 0;
    do { a = ((k + 0.5) / ringN) * Math.PI * 2 + 0.1; x = Math.cos(a) * 55; z = Math.sin(a) * 55; k++; } while (water && x > 30 && ++n < ringN);
    spots.push({ name, x, z, r: 11, rotY: -a - Math.PI / 2 + (Math.random() - 0.5) * 0.8 });
  });
  return spots;
}

export class PropSet {
  constructor(root, spots, q, fx) {
    this.root = root; this.q = q; this.fx = fx;
    this.items = [];
    this.t = 0;
    for (const s of spots) load(s.name).then((scene) => this.place(s, scene)).catch((e) => console.warn('prop', s.name, e));
  }

  place(s, scene) {
    const def = PROPS[s.name];
    const obj = scene.clone(true);
    obj.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = this.q.level >= 3; o.receiveShadow = this.q.shadows;
    });
    const g = new THREE.Group();
    g.position.set(s.x, 0, s.z);
    g.rotation.y = s.rotY;
    obj.scale.setScalar(def.scale);
    if (def.upright) { // roll the donut onto its edge, resting on the ground
      obj.rotation.x = Math.PI / 2;
      obj.position.set(0, (5.0 + 2.6) * def.scale, -2.6 * def.scale);
    }
    g.add(obj);
    this.root.add(g);
    const it = { ...s, g, obj, def, phase: Math.random() * 10, hands: {} };
    obj.traverse((o) => { if (o.name === 'hand_min' || o.name === 'hand_hour') it.hands[o.name] = o; });
    if (s.floating) g.scale.setScalar(1.35);
    this.items.push(it);
  }

  update(dt) {
    this.t += dt;
    const t = this.t;
    for (const it of this.items) {
      if (it.floating) { // bob and rock on the harbour swell
        it.g.position.y = -0.6 + Math.sin(t * 0.9 + it.phase) * 0.5;
        it.g.rotation.z = Math.sin(t * 0.7 + it.phase) * 0.05;
        it.g.rotation.x = Math.sin(t * 0.55 + it.phase * 2) * 0.04;
      }
      if (it.hands.hand_min) { // a fast-running clock: one game second = one minute
        const min = (t + it.phase * 60) / 60;
        it.hands.hand_min.rotation.set(0, 0, -min * Math.PI * 2);
        it.hands.hand_hour.rotation.set(0, 0, -min / 12 * Math.PI * 2);
      }
      if (it.def.steam && Math.random() < dt * 3 * this.q.fxMul) {
        const p = new THREE.Vector3(it.x, 10.5 * it.def.scale, it.z);
        this.fx.burst(p, { n: 2, color: 0xf4f0ea, speed: 1.2, up: 1, dir: new THREE.Vector3(0, 1, 0), dirSp: 3, size: 3, grow: 4, life: 2.6, drag: 0.97, smoke: true, spread: 4, alpha: 0.22 });
      }
    }
  }
}
