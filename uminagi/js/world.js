// Sky, sun and moon, time of day, the sea, distant islands and seagulls.
import * as THREE from 'three';
import { G, WATER_BOX } from './terrain.js';

const C = (h) => new THREE.Color(h);
// time-of-day presets (blended): sun direction, sky colours, light colours/intensities, fog, lamp glow
const TOD = {
  day: { sun: [0.35, 0.78, 0.52], top: C(0x2f6fc8), hor: C(0xbcdcf2), sunCol: C(0xfff4e6), sunI: 3.2, hemiS: C(0xcfe4ff), hemiG: C(0x7a7158), hemiI: 1.05, fog: C(0xbfd8ec), fogNear: 160, fogFar: 1500, glow: 0.04, exp: 0.95, stars: 0, sunDisk: 1 },
  evening: { sun: [-0.78, 0.17, 0.6], top: C(0x3c4e8c), hor: C(0xffa868), sunCol: C(0xffa060), sunI: 2.6, hemiS: C(0xffc9a0), hemiG: C(0x4d3a3a), hemiI: 0.7, fog: C(0xe6a585), fogNear: 120, fogFar: 1100, glow: 0.7, exp: 1.0, stars: 0.05, sunDisk: 1 },
  night: { sun: [0.3, 0.62, -0.5], top: C(0x061030), hor: C(0x22345c), sunCol: C(0xa8bcff), sunI: 0.75, hemiS: C(0x4a5e90), hemiG: C(0x1c1c26), hemiI: 0.8, fog: C(0x14223e), fogNear: 90, fogFar: 750, glow: 1.0, exp: 1.5, stars: 1, sunDisk: 0 },
};
export const TOD_NAMES = { day: '昼', evening: '夕方', night: '夜' };

const SKY_FN = `
  uniform vec3 uTop, uHor, uSunDir, uSunCol; uniform float uTime, uStars, uSunDisk;
  float h21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
  float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y); }
  float fbm(vec2 p){ float s = 0.0, a = 0.5; for (int k = 0; k < 5; k++) { s += a * vn(p); p *= 2.07; a *= 0.5; } return s; }
  vec3 skyColor(vec3 d, bool clouds){
    float h = max(d.y, -0.2);
    vec3 col = mix(uHor, uTop, smoothstep(-0.02, 0.55, h));
    float sd = max(0.0, dot(d, uSunDir));
    col += uSunCol * (pow(sd, 6.0) * 0.18 + pow(sd, 60.0) * 0.35) * (0.4 + 0.6 * uSunDisk);
    col += uSunCol * smoothstep(0.9993, 0.9997, sd) * 6.0 * uSunDisk;
    if (clouds && d.y > 0.0) {
      vec2 uv = d.xz / (d.y + 0.08) * 1.4 + vec2(uTime * 0.004, uTime * 0.002);
      float c = fbm(uv * 1.1); c = smoothstep(0.5, 0.82, c) * smoothstep(0.0, 0.18, d.y);
      float lit = 0.75 + 0.35 * pow(sd, 3.0);
      vec3 cc = mix(uHor * 0.9 + 0.12, vec3(1.0), 0.55) * lit;
      cc = mix(cc, uHor * 0.35 + uTop * 0.2, uStars * 0.85);
      col = mix(col, cc, c * 0.9);
      // stars
      vec2 sp = d.xz / (d.y + 0.3) * 260.0;
      float st = step(0.9965, h21(floor(sp))) * smoothstep(0.05, 0.3, d.y) * (1.0 - c);
      col += vec3(st) * uStars * (0.6 + 0.4 * sin(uTime * 3.0 + h21(floor(sp)) * 40.0));
    }
    return col;
  }`;

export class World {
  constructor(scene, renderer, ground, quality) {
    this.scene = scene; this.renderer = renderer; this.ground = ground; this.q = quality;
    this.time = 0; this.todName = 'day'; this.cur = this.copy(TOD.day); this.target = TOD.day;
    this.skyU = {
      uTop: { value: new THREE.Color() }, uHor: { value: new THREE.Color() }, uSunDir: { value: new THREE.Vector3() },
      uSunCol: { value: new THREE.Color() }, uTime: { value: 0 }, uStars: { value: 0 }, uSunDisk: { value: 1 },
    };
    this.buildSky(); this.buildLights(); this.buildSea(); this.buildIslands();
    scene.fog = new THREE.Fog(0xbfd8ec, 160, 1500);
    this.pmrem = new THREE.PMREMGenerator(renderer);
    this.apply(true);
  }
  copy(t) { return { ...t, top: t.top.clone(), hor: t.hor.clone(), sunCol: t.sunCol.clone(), hemiS: t.hemiS.clone(), hemiG: t.hemiG.clone(), fog: t.fog.clone(), sun: [...t.sun] }; }
  setTimeOfDay(name, instant = false) {
    this.todName = name; this.target = TOD[name]; this.blend = instant ? 1 : 0;
    if (instant) { this.cur = this.copy(this.target); this.apply(true); }
  }
  buildSky() {
    const geo = new THREE.SphereGeometry(1800, 32, 16);
    const mat = new THREE.ShaderMaterial({
      uniforms: this.skyU, side: THREE.BackSide, depthWrite: false, fog: false,
      vertexShader: 'varying vec3 vD; void main(){ vD = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }',
      fragmentShader: SKY_FN + '\nvarying vec3 vD; void main(){ gl_FragColor = vec4(skyColor(normalize(vD), true), 1.0); }',
    });
    this.sky = new THREE.Mesh(geo, mat); this.sky.frustumCulled = false; this.sky.renderOrder = -10;
    this.scene.add(this.sky);
    // a copy of the sky (no stars twinkle needed) for the environment map
    this.envScene = new THREE.Scene();
    this.envScene.add(new THREE.Mesh(new THREE.SphereGeometry(100, 32, 16), mat));
  }
  buildLights() {
    this.hemi = new THREE.HemisphereLight(0xffffff, 0x777777, 1); this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xffffff, 3);
    if (this.q.shadows) {
      this.sun.castShadow = true; const S = this.q.shadowSize;
      this.sun.shadow.mapSize.set(S, S);
      const R = this.q.shadowRange;
      Object.assign(this.sun.shadow.camera, { left: -R, right: R, top: R, bottom: -R, near: 1, far: 400 });
      this.sun.shadow.bias = -0.0005; this.sun.shadow.normalBias = 0.05;
    }
    this.scene.add(this.sun, this.sun.target);
  }
  // ------------------------------------------------------------------ sea
  buildSea() {
    // polar grid centred on the camera: dense near, sparse far (vertex swell + per-pixel ripples)
    const ang = 128, radii = [0];
    for (let r = 1; r < 2600; r *= 1.075) radii.push(r * 0.9);
    const pos = [], idx = [];
    pos.push(0, 0, 0);
    for (let i = 1; i < radii.length; i++) for (let a = 0; a < ang; a++) { const t = a / ang * Math.PI * 2; pos.push(Math.cos(t) * radii[i], 0, Math.sin(t) * radii[i]); }
    for (let a = 0; a < ang; a++) idx.push(0, 1 + (a + 1) % ang, 1 + a);
    for (let i = 1; i < radii.length - 1; i++) for (let a = 0; a < ang; a++) {
      const p = 1 + (i - 1) * ang + a, q = 1 + (i - 1) * ang + (a + 1) % ang, r = p + ang, s = q + ang;
      idx.push(p, q, r, q, s, r);
    }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setIndex(idx);
    this.depthTex = this.ground.waterTexture();
    this.seaU = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
      uDepth: { value: this.depthTex }, uBox: { value: new THREE.Vector4(WATER_BOX.x0, WATER_BOX.z0, WATER_BOX.x1 - WATER_BOX.x0, WATER_BOX.z1 - WATER_BOX.z0) },
      uCam: { value: new THREE.Vector3() },
    }]);
    Object.assign(this.seaU, this.skyU);
    this.seaU.uDepth.value = this.depthTex;
    const mat = new THREE.ShaderMaterial({
      uniforms: this.seaU, transparent: true, fog: true, depthWrite: true,
      vertexShader: `
        uniform float uTime; uniform vec3 uCam; uniform sampler2D uDepth; uniform vec4 uBox;
        varying vec3 vW; varying float vSwell;
        #include <fog_pars_vertex>
        float swellAmp(vec2 p){
          float harbour = smoothstep(118.0, 95.0, p.y) * step(-82.0, p.x) * step(p.x, 64.0) * step(-150.0, p.y);
          return mix(0.32, 0.08, harbour); }
        void main(){
          vec3 p = position + vec3(uCam.x, 0.0, uCam.z);
          float a = swellAmp(p.xz);
          float w = sin(dot(p.xz, vec2(0.08, 0.11)) + uTime * 0.9) + 0.6 * sin(dot(p.xz, vec2(-0.13, 0.07)) + uTime * 1.3) + 0.35 * sin(dot(p.xz, vec2(0.21, -0.17)) + uTime * 1.9);
          p.y = w * a * 0.6;
          vSwell = w;
          vW = p;
          vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }`,
      fragmentShader: SKY_FN + `
        uniform sampler2D uDepth; uniform vec4 uBox;
        varying vec3 vW; varying float vSwell;
        #include <fog_pars_fragment>
        vec2 grad(vec2 p, float t){
          vec2 g = vec2(0.0);
          g += vec2(0.08, 0.11) * cos(dot(p, vec2(0.08, 0.11)) + t * 0.9) * 0.06;
          g += vec2(-0.13, 0.07) * cos(dot(p, vec2(-0.13, 0.07)) + t * 1.3) * 0.05;
          g += vec2(0.9, 0.4) * cos(dot(p, vec2(0.9, 0.4)) + t * 2.6) * 0.035;
          g += vec2(-0.5, 1.1) * cos(dot(p, vec2(-0.5, 1.1)) + t * 3.1) * 0.03;
          g += vec2(1.7, -1.3) * cos(dot(p, vec2(1.7, -1.3)) + t * 4.3) * 0.018;
          float e = 0.35;
          vec2 q = p * 0.9 + vec2(t * 0.35, t * 0.22);
          g += vec2(vn(q + vec2(e, 0.0)) - vn(q - vec2(e, 0.0)), vn(q + vec2(0.0, e)) - vn(q - vec2(0.0, e))) * 0.35;
          vec2 q2 = p * 2.3 - vec2(t * 0.5, -t * 0.4);
          g += vec2(vn(q2 + vec2(e, 0.0)) - vn(q2 - vec2(e, 0.0)), vn(q2 + vec2(0.0, e)) - vn(q2 - vec2(0.0, e))) * 0.16;
          return g;
        }
        void main(){
          vec2 uv = (vW.xz - uBox.xy) / uBox.zw;
          float inBox = step(0.0, uv.x) * step(uv.x, 1.0) * step(0.0, uv.y) * step(uv.y, 1.0);
          vec4 dt = texture2D(uDepth, uv);
          float depth = mix(12.0, dt.r * 255.0 / 18.0, inBox);
          float foamMask = dt.g * inBox;
          vec3 V = normalize(cameraPosition - vW);
          float dist = length(cameraPosition - vW);
          vec2 g = grad(vW.xz, uTime) * mix(1.0, 0.25, smoothstep(60.0, 600.0, dist));
          vec3 N = normalize(vec3(-g.x, 1.0, -g.y));
          vec3 R = reflect(-V, N); R.y = abs(R.y);
          float fres = 0.02 + 0.98 * pow(1.0 - max(dot(N, V), 0.0), 5.0);
          vec3 refl = skyColor(R, true);
          vec3 deep = mix(vec3(0.015, 0.11, 0.2), uTop * 0.25, 0.25), shallow = vec3(0.08, 0.52, 0.5);
          float sh = smoothstep(4.5, 0.3, depth);
          vec3 body = mix(deep, shallow, sh) * (0.35 + 0.65 * max(0.0, uSunDir.y)) * (0.6 + 0.4 * uSunCol);
          body += uSunCol * 0.03 * (vSwell * 0.5 + 0.5);
          vec3 col = mix(body, refl, fres);
          float spec = pow(max(dot(R, uSunDir), 0.0), 380.0) * 3.5 + pow(max(dot(R, uSunDir), 0.0), 40.0) * 0.2;
          col += uSunCol * spec * (0.3 + 0.7 * uSunDisk);
          // shore foam and white water around rocks and tetrapods
          float fn = vn(vW.xz * 0.9 + vec2(uTime * 0.3, 0.0)) * vn(vW.xz * 2.3 - uTime * 0.2);
          float foam = smoothstep(0.55, 0.95, foamMask * 0.8 + fn * 0.55 + 0.15 * sin(uTime * 1.6 + vW.x * 0.3 + vW.z * 0.2)) * foamMask * 0.8;
          foam += smoothstep(0.55, 0.0, depth) * 0.5 * inBox * smoothstep(0.3, 0.6, fn + 0.3);
          col = mix(col, vec3(0.92, 0.96, 0.98) * (0.4 + 0.6 * max(0.15, uSunDir.y)), clamp(foam, 0.0, 0.85));
          float alpha = mix(0.98, mix(0.55, 0.95, smoothstep(0.2, 3.0, depth)), inBox);
          alpha = max(alpha, fres);
          gl_FragColor = vec4(col, max(alpha, foam));
          #include <fog_fragment>
        }`,
    });
    this.sea = new THREE.Mesh(geo, mat); this.sea.frustumCulled = false; this.sea.renderOrder = 1; this.sea.name = 'sea';
    this.scene.add(this.sea);
  }
  // swell height at a point (same formula as the shader) for boats
  swell(x, z) {
    const t = this.time, inH = x > -82 && x < 64 && z < 118 && z > G.z0;
    const a = inH ? (z < 95 ? 0.08 : 0.08 + (0.32 - 0.08) * Math.min(1, (z - 95) / 23)) : 0.32;
    const w = Math.sin(0.08 * x + 0.11 * z + t * 0.9) + 0.6 * Math.sin(-0.13 * x + 0.07 * z + t * 1.3) + 0.35 * Math.sin(0.21 * x - 0.17 * z + t * 1.9);
    return w * a * 0.6;
  }
  buildIslands() {
    const rnd = (s) => { const x = Math.sin(s * 91.7) * 43758.5; return x - Math.floor(x); };
    const isl = [[-520, 620, 120, 60], [-180, 760, 70, 38], [260, 680, 160, 70], [620, 520, 110, 46], [880, 300, 200, 90], [-900, 380, 220, 110], [120, 980, 260, 60]];
    const mats = [new THREE.MeshStandardMaterial({ color: 0x3f6a3c, roughness: 1, flatShading: false }), new THREE.MeshStandardMaterial({ color: 0x8a8070, roughness: 1 })];
    isl.forEach(([x, z, r, h], k) => {
      const geo = new THREE.SphereGeometry(1, 40, 14, 0, Math.PI * 2, 0, Math.PI / 2);
      const p = geo.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const vx = p.getX(i), vy = p.getY(i), vz = p.getZ(i), a = Math.atan2(vz, vx);
        const n = 1 + 0.25 * Math.sin(a * 3 + k) + 0.15 * Math.sin(a * 7 + k * 2) + 0.1 * rnd(i + k * 100);
        p.setXYZ(i, vx * r * n, Math.pow(vy, 1.6) * h * (0.8 + 0.3 * Math.sin(a * 2 + k)) - 2, vz * r * n * 0.7);
      }
      geo.computeVertexNormals();
      const m = new THREE.Mesh(geo, mats[0]); m.position.set(x, 0, z); m.rotation.y = k * 1.3; this.scene.add(m);
      const rock = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.02, r * 1.08, 6, 40, 1, true), mats[1]);
      rock.scale.z = 0.7; rock.position.set(x, 0.5, z); rock.rotation.y = k * 1.3; this.scene.add(rock);
    });
  }
  // ------------------------------------------------------------------ per frame
  apply(env) {
    const c = this.cur, s = new THREE.Vector3(...c.sun).normalize();
    this.skyU.uTop.value.copy(c.top); this.skyU.uHor.value.copy(c.hor); this.skyU.uSunDir.value.copy(s);
    this.skyU.uSunCol.value.copy(c.sunCol); this.skyU.uStars.value = c.stars; this.skyU.uSunDisk.value = c.sunDisk;
    this.hemi.color.copy(c.hemiS); this.hemi.groundColor.copy(c.hemiG); this.hemi.intensity = c.hemiI;
    this.sun.color.copy(c.sunCol); this.sun.intensity = c.sunI; this.sunDir = s;
    this.scene.fog.color.copy(c.fog); this.scene.fog.near = c.fogNear; this.scene.fog.far = c.fogFar;
    this.renderer.toneMappingExposure = c.exp;
    if (env) {
      const rt = this.pmrem.fromScene(this.envScene, 0, 0.1, 200);
      if (this.envRT) this.envRT.dispose();
      this.envRT = rt; this.scene.environment = rt.texture;
      this.scene.environmentIntensity = 0.55 + 0.25 * (1 - c.stars);
    }
  }
  update(dt, focus, camPos, matlib) {
    this.time += dt; this.skyU.uTime.value = this.time;
    if (this.blend < 1) {
      this.blend = Math.min(1, this.blend + dt / 2.5);
      const k = Math.min(1, dt * 2.2 + (this.blend >= 1 ? 1 : 0)), a = this.cur, b = this.target;
      for (const key of ['top', 'hor', 'sunCol', 'hemiS', 'hemiG', 'fog']) a[key].lerp(b[key], k);
      for (const key of ['sunI', 'hemiI', 'fogNear', 'fogFar', 'glow', 'exp', 'stars', 'sunDisk']) a[key] += (b[key] - a[key]) * k;
      for (let i = 0; i < 3; i++) a.sun[i] += (b.sun[i] - a.sun[i]) * k;
      this.apply(this.blend >= 1 || Math.floor(this.blend * 5) !== Math.floor((this.blend - dt / 2.5) * 5));
    }
    matlib.setGlow(this.cur.glow);
    // keep the sun's shadow box around the player
    this.sun.position.copy(focus).addScaledVector(this.sunDir, 150);
    this.sun.target.position.copy(focus);
    if (this.sun.castShadow) {  // snap to texels to avoid shimmering
      const S = this.sun.shadow.camera, texel = (S.right - S.left) / this.sun.shadow.mapSize.x;
      this.sun.target.position.x = Math.round(focus.x / texel) * texel; this.sun.target.position.z = Math.round(focus.z / texel) * texel;
      this.sun.position.copy(this.sun.target.position).addScaledVector(this.sunDir, 150);
    }
    this.seaU.uCam.value.set(Math.round(camPos.x / 4) * 4, 0, Math.round(camPos.z / 4) * 4);
    this.sky.position.copy(camPos);
  }
}
