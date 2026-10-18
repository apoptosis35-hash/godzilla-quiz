// Sky, sun and moon, time of day, the sea, distant islands and seagulls.
import * as THREE from 'three';
import { G, WATER_BOX, naturalRaw } from './terrain.js';

// the far depth map: open sea, the mainland coast outside the near box and the islands (shallow rings and shore foam)
const FAR = { x0: -1600, z0: -700, x1: 1600, z1: 2500 };

const C = (h) => new THREE.Color(h);
// time-of-day presets (blended): sun direction, sky colours, light colours/intensities, fog, lamp glow
const TOD = {
  day: { sun: [0.35, 0.78, 0.52], top: C(0x2f6fc8), hor: C(0xbcdcf2), sunCol: C(0xfff4e6), sunI: 3.2, hemiS: C(0xcfe4ff), hemiG: C(0x7a7158), hemiI: 1.05, fog: C(0xbfd8ec), fogNear: 160, fogFar: 1500, glow: 0.04, exp: 0.95, stars: 0, sunDisk: 1 },
  evening: { sun: [-0.78, 0.17, 0.6], top: C(0x3c4e8c), hor: C(0xffa868), sunCol: C(0xffa060), sunI: 2.6, hemiS: C(0xffc9a0), hemiG: C(0x4d3a3a), hemiI: 0.7, fog: C(0xe6a585), fogNear: 120, fogFar: 1100, glow: 0.7, exp: 1.0, stars: 0.05, sunDisk: 1 },
  night: { sun: [0.3, 0.62, -0.5], top: C(0x061030), hor: C(0x22345c), sunCol: C(0xa8bcff), sunI: 0.75, hemiS: C(0x4a5e90), hemiG: C(0x1c1c26), hemiI: 0.8, fog: C(0x14223e), fogNear: 90, fogFar: 750, glow: 1.0, exp: 1.5, stars: 1, sunDisk: 0 },
};
export const TOD_NAMES = { day: '昼', evening: '夕方', night: '夜' };

const SKY_FN = `
  uniform vec3 uTop, uHor, uSunDir, uSunCol; uniform float uTime, uStars, uSunDisk, uReflPass;
  float h21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
  float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y); }
  float fbm(vec2 p){ float s = 0.0, a = 0.5; for (int k = 0; k < 5; k++) { s += a * vn(p); p *= 2.07; a *= 0.5; } return s; }
  vec3 skyColor(vec3 d, bool clouds){
    float h = max(d.y, -0.2);
    vec3 col = mix(uHor, uTop, smoothstep(-0.02, 0.55, h));
    float sd = max(0.0, dot(d, uSunDir));
    col += uSunCol * (pow(sd, 6.0) * 0.18 + pow(sd, 60.0) * 0.35) * (0.4 + 0.6 * uSunDisk);
    col += uSunCol * smoothstep(0.9993, 0.9997, sd) * 6.0 * uSunDisk * (1.0 - uReflPass);   // no hard-edged disk in the sea's mirror (the glitter draws it)
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
      uSunCol: { value: new THREE.Color() }, uTime: { value: 0 }, uStars: { value: 0 }, uSunDisk: { value: 1 }, uReflPass: { value: 0 },
    };
    this.hazeU = { uHaze: { value: new THREE.Color() }, uHazeDist: { value: 2600 } };
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
      fragmentShader: SKY_FN + '\nvarying vec3 vD; void main(){ gl_FragColor = vec4(skyColor(normalize(vD), true), 1.0 - uReflPass); }   // alpha 0 marks sky in the reflection',
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
    for (let r = 1; r < 6500; r *= 1.075) radii.push(r * 0.9);
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
    this.seaU = THREE.UniformsUtils.merge([{
      uDepth: { value: this.depthTex }, uFar: { value: null }, uFarBox: { value: new THREE.Vector4(FAR.x0, FAR.z0, FAR.x1 - FAR.x0, FAR.z1 - FAR.z0) }, uBox: { value: new THREE.Vector4(WATER_BOX.x0, WATER_BOX.z0, WATER_BOX.x1 - WATER_BOX.x0, WATER_BOX.z1 - WATER_BOX.z0) },
      uCam: { value: new THREE.Vector3() },
      uScene: { value: null }, uRes: { value: new THREE.Vector2(1, 1) }, uRefract: { value: 0 }, uLinear: { value: 0 },
      uRefl: { value: null }, uReflMat: { value: new THREE.Matrix4() }, uUseRefl: { value: 0 },
    }]);
    Object.assign(this.seaU, this.skyU, this.hazeU);
    this.seaU.uDepth.value = this.depthTex;
    const mat = new THREE.ShaderMaterial({
      uniforms: this.seaU, transparent: true, fog: false, depthWrite: true,
      vertexShader: `
        uniform float uTime; uniform vec3 uCam; uniform sampler2D uDepth; uniform vec4 uBox;
        varying vec3 vW; varying float vSwell; varying float vAmp;
        float swellAmp(vec2 p){
          float harbour = smoothstep(118.0, 95.0, p.y) * step(-82.0, p.x) * step(p.x, 64.0) * step(-150.0, p.y);
          return mix(0.5, 0.08, harbour); }
        void main(){
          vec3 p = position + vec3(uCam.x, 0.0, uCam.z);
          float a = swellAmp(p.xz);
          float w = sin(dot(p.xz, vec2(0.08, 0.11)) + uTime * 0.9) + 0.6 * sin(dot(p.xz, vec2(-0.13, 0.07)) + uTime * 1.3) + 0.35 * sin(dot(p.xz, vec2(0.21, -0.17)) + uTime * 1.9);
          p.y = w * a * 0.6; vAmp = a;
          vSwell = w;
          vW = p;
          vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mvPosition;
        }`,
      fragmentShader: SKY_FN + `
        uniform sampler2D uDepth; uniform vec4 uBox; uniform sampler2D uScene; uniform vec2 uRes; uniform float uRefract; uniform float uLinear;
        uniform sampler2D uFar; uniform vec4 uFarBox; uniform vec3 uHaze; uniform float uHazeDist;
        uniform sampler2D uRefl; uniform mat4 uReflMat; uniform float uUseRefl;
        varying float vAmp;
        varying vec3 vW; varying float vSwell;
        // ripple slope. Each wave fades out once it is smaller than about a pixel (foot = metres per pixel), which
        // stops the shimmering moire far away; the lost detail is returned as roughness (a broader, softer glitter).
        float band(float f, float foot){ return 1.0 - smoothstep(0.6, 2.2, f * foot); }
        vec2 nGrad(vec2 q){ float e = 0.35; return vec2(vn(q + vec2(e, 0.0)) - vn(q - vec2(e, 0.0)), vn(q + vec2(0.0, e)) - vn(q - vec2(0.0, e))); }
        vec2 grad(vec2 p, float t, float foot){
          vec2 g = vec2(0.0);
          g += vec2(0.08, 0.11) * cos(dot(p, vec2(0.08, 0.11)) + t * 0.9) * 0.06;
          g += vec2(-0.13, 0.07) * cos(dot(p, vec2(-0.13, 0.07)) + t * 1.3) * 0.05;
          g += vec2(0.031, -0.022) * cos(dot(p, vec2(0.031, -0.022)) + t * 0.45) * 0.5;   // long swell, keeps the far sea from going flat
          g += vec2(0.9, 0.4) * cos(dot(p, vec2(0.9, 0.4)) + t * 2.6) * 0.035 * band(0.99, foot);
          g += vec2(-0.5, 1.1) * cos(dot(p, vec2(-0.5, 1.1)) + t * 3.1) * 0.03 * band(1.21, foot);
          g += vec2(1.7, -1.3) * cos(dot(p, vec2(1.7, -1.3)) + t * 4.3) * 0.018 * band(2.14, foot);
          g += nGrad(p * 0.9 + vec2(t * 0.35, t * 0.22)) * 0.35 * band(3.0, foot);
          g += nGrad(p * 2.3 - vec2(t * 0.5, -t * 0.4)) * 0.16 * band(7.0, foot);
          // medium chop that survives a bit further out
          g += nGrad(p * 0.22 + vec2(t * 0.06, -t * 0.05)) * 0.22 * band(0.8, foot);
          return g;
        }
        void main(){
          vec2 uv = (vW.xz - uBox.xy) / uBox.zw;
          float inBox = step(0.0, uv.x) * step(uv.x, 1.0) * step(0.0, uv.y) * step(uv.y, 1.0);
          vec4 dt = texture2D(uDepth, uv);
          vec2 fuv = (vW.xz - uFarBox.xy) / uFarBox.zw;
          float inFar = step(0.0, fuv.x) * step(fuv.x, 1.0) * step(0.0, fuv.y) * step(fuv.y, 1.0);
          vec4 df = texture2D(uFar, fuv);
          float depth = mix(mix(40.0, df.r * 255.0 / 6.0, inFar), dt.r * 255.0 / 6.0, inBox);
          float foamMask = mix(df.g * inFar, dt.g, inBox);
          vec3 V = normalize(cameraPosition - vW);
          float dist = length(cameraPosition - vW);
          float foot = sqrt(length(dFdx(vW.xz)) * length(dFdy(vW.xz)));   // geometric mean: ripples survive longer at grazing angles
          float rough = smoothstep(0.04, 1.6, foot);
          // wind patches: slowly drifting areas of rougher and calmer water, as seen from a hill
          float wind = vn(vW.xz * 0.0045 + vec2(uTime * 0.004, uTime * 0.002)) * 0.65 + vn(vW.xz * 0.013 - uTime * 0.003) * 0.35;
          float gust = mix(0.55, 1.35, smoothstep(0.25, 0.75, wind));
          vec2 g = grad(vW.xz, uTime, foot) * gust;
          vec3 N = normalize(vec3(-g.x, 1.0, -g.y));
          vec3 R = reflect(-V, N); R.y = abs(R.y);
          // a rough (far) surface reflects a spread of directions, on average higher in the sky
          R.y = max(R.y, rough * mix(0.05, 0.11, gust - 0.55)); R = normalize(R);
          float fres = 0.02 + 0.98 * pow(1.0 - max(dot(N, V), 0.0), 5.0);
          fres = min(fres, mix(0.86, 0.74, rough));   // a rippled sea never mirrors perfectly: keep some of the water's own blue at grazing angles   // facets tilted toward the viewer: the far sea stays a little darker than the sky
          vec3 refl = skyColor(R, rough < 0.6);
          refl -= uSunCol * smoothstep(0.9993, 0.9997, max(0.0, dot(R, uSunDir))) * 6.0 * uSunDisk;   // the sun's mirror image comes from the glitter below (no hard-edged disk)
          refl = mix(refl, mix(uHor, uTop, 0.35), rough * 0.25);
          if (uUseRefl > 0.5) {
            // planar mirror of the far scene (islands, mountains, quays, boats), rippled by the surface normal
            vec4 rp = uReflMat * vec4(vW.x, 0.0, vW.z, 1.0);
            vec2 ruv = rp.xy / rp.w + vec2(g.x * 0.035, g.y * 0.11) * (1.0 - rough * 0.4) / (1.0 + dist * 0.003);
            vec4 rc = texture2D(uRefl, clamp(ruv, 0.001, 0.999));
            vec3 obj = uLinear > 0.5 ? rc.rgb : pow(max(rc.rgb, 0.0), vec3(1.0 / 2.2)) * 1.08;   // scene objects are linear, the sky is display-ready
            vec3 mir = mix(rc.rgb, obj * 0.82, rc.a);   // objects reflect a little darker than they look
            refl = mix(mir, refl, (1.0 - rc.a) * (0.35 + 0.4 * rough));
          }
          // light absorbed along the path through the water (Beer-Lambert): red goes first, then green -> clear shallows, blue depths
          float path = depth / max(0.22, V.y) + depth;
          vec3 T = exp(-vec3(0.20, 0.040, 0.030) * path);
          float lightK = (0.3 + 0.7 * max(0.0, uSunDir.y)) * (0.55 + 0.45 * dot(uSunCol, vec3(0.33)));
          vec3 scatter = mix(vec3(0.015, 0.09, 0.17), vec3(0.05, 0.35, 0.34), exp(-depth * 0.16)) * lightK * mix(vec3(1.0), uSunCol, 0.35);
          scatter += uSunCol * 0.025 * (vSwell * 0.5 + 0.5);
          // float target (PC post-processing): the scene and sky are linear there, so only the water's own
          // display-space colours are converted; reflections, haze and highlights stay as they are
          if (uLinear > 0.5) scatter = pow(scatter, vec3(2.2)) * 1.6;
          vec3 body;
          float alpha;
          if (uRefract > 0.5) {
            // what is behind the surface (seabed, rocks, quay walls), seen through the refracting water
            vec2 suv = gl_FragCoord.xy / uRes + N.xz * 0.035 * clamp(depth * 0.4, 0.0, 1.0) * (1.0 - smoothstep(30.0, 200.0, dist));
            vec3 behind = texture2D(uScene, suv).rgb;
            vec3 bed = vec3(0.5, 0.46, 0.36) * lightK;
            if (uLinear > 0.5) bed = pow(bed, vec3(2.2)) * 1.6;
            behind = mix(bed, behind, inBox);   // out by the islands: a sandy bed instead of the (hazed) island skirt   // out by the islands: a sandy bed instead of the (hazed) island skirt
            body = behind * T + scatter * (1.0 - T);
            alpha = 1.0;
          } else {
            body = scatter;
            alpha = clamp(1.0 - dot(T, vec3(0.25, 0.5, 0.25)), 0.18, 1.0);
          }
          vec3 col = mix(body, refl, fres);
          alpha = max(alpha, fres);
          // sun glitter: a sharp highlight close by, a wide shimmering path across the far sea
          float sd = max(dot(R, uSunDir), 0.0);
          float spec = pow(sd, mix(380.0, 22.0, rough)) * mix(3.5, 0.32, rough) * gust + pow(sd, 40.0) * 0.2;
          float spark = step(0.86, vn(vW.xz * 1.7 + uTime * 0.8)) * (1.0 - rough) * pow(sd, 120.0) * 2.0;
          col += uSunCol * (spec + spark) * (0.3 + 0.7 * uSunDisk);
          // shore foam and white water around rocks, tetrapods and the islands
          float fn = vn(vW.xz * 0.9 + vec2(uTime * 0.3, 0.0)) * vn(vW.xz * 2.3 - uTime * 0.2);
          fn = mix(fn, 0.3, rough);   // far away the speckle averages out
          float foam = smoothstep(0.55, 0.95, foamMask * 0.8 + fn * 0.55 + 0.15 * sin(uTime * 1.6 + vW.x * 0.3 + vW.z * 0.2)) * foamMask * 0.8;
          foam += smoothstep(0.55, 0.0, depth) * 0.5 * max(inBox, inFar) * smoothstep(0.3, 0.6, fn + 0.3);
          foam *= mix(0.3, 1.0, smoothstep(0.1, 0.3, vAmp));   // calm inside the harbour: little white water at the quays
          col = mix(col, vec3(0.92, 0.96, 0.98) * (0.4 + 0.6 * max(0.15, uSunDir.y)) * mix(1.0, 0.75, uLinear), clamp(foam, 0.0, 0.85));
          // atmospheric haze shared with the islands and mountains (scene fog would bleach the open sea white)
          float haze = clamp((1.0 - exp(-dist / uHazeDist)) * 1.05, 0.0, 0.93);
          col = mix(col, uHaze, haze);
          col = mix(col, uHor, smoothstep(3500.0, 6200.0, dist));   // melt into the sky at the horizon line
          gl_FragColor = vec4(col, max(alpha, max(foam, haze)));
        }`,
    });
    this.sea = new THREE.Mesh(geo, mat); this.sea.frustumCulled = false; this.sea.renderOrder = 1; this.sea.name = 'sea';
    // refraction: just before the sea is drawn, copy what has been rendered so far (the opaque scene) into a texture
    this.refract = !!this.q.refraction;
    this.seaU.uRefract.value = this.refract ? 1 : 0;
    const size = new THREE.Vector2();
    this.sea.onBeforeRender = (r, scene, camera) => {
      if (!this.refract || scene.overrideMaterial) return;
      const rt = r.getRenderTarget();
      if (rt) size.set(rt.width, rt.height); else r.getDrawingBufferSize(size);
      const type = rt ? rt.texture.type : THREE.UnsignedByteType;
      this.seaU.uLinear.value = type !== THREE.UnsignedByteType ? 1 : 0;
      if (!this.fbTex || this.fbTex.image.width !== size.x || this.fbTex.image.height !== size.y || this.fbTex.type !== type) {
        this.fbTex?.dispose();
        this.fbTex = new THREE.FramebufferTexture(size.x, size.y); this.fbTex.type = type;
        this.fbTex.minFilter = this.fbTex.magFilter = THREE.LinearFilter;
        this.seaU.uScene.value = this.fbTex; this.seaU.uRes.value.copy(size);
      }
      r.copyFramebufferToTexture(this.fbTex);
      if (this.reflRT) this.renderReflection(r, camera);
    };
    this.scene.add(this.sea);
  }
  // planar reflection for the sea: a mirrored camera renders only the objects on layer 1 (sky, islands, ranges, terrain,
  // quays, boats, lighthouses) into a half-resolution target, clipped at the water plane (oblique near plane)
  setupReflection(objects) {
    if (!this.q.refraction) return;
    const L = 1, add = (o) => o && o.traverse((c) => c.layers.enable(L));
    for (const o of [this.sky, this.hemi, this.sun, ...objects]) add(o);
    this.scene.traverse((o) => { if (o.name === 'island' || o.name === 'ranges') o.layers.enable(L); });
    this.reflRT = new THREE.WebGLRenderTarget(2, 2, { type: THREE.HalfFloatType });
    this.vcam = new THREE.PerspectiveCamera(); this.vcam.layers.set(L);
    this.seaU.uRefl.value = this.reflRT.texture; this.seaU.uUseRefl.value = 1;
  }
  renderReflection(r, camera) {
    const v = this.vcam, cp = new THREE.Vector3().setFromMatrixPosition(camera.matrixWorld);
    if (cp.y < 0.1) return;
    const size = r.getDrawingBufferSize(new THREE.Vector2()), w = Math.max(2, size.x >> 1), h = Math.max(2, size.y >> 1);
    if (this.reflRT.width !== w || this.reflRT.height !== h) this.reflRT.setSize(w, h);
    const rot = new THREE.Matrix4().extractRotation(camera.matrixWorld);
    const look = new THREE.Vector3(0, 0, -1).applyMatrix4(rot).add(cp);
    v.position.set(cp.x, -cp.y, cp.z); v.up.set(0, 1, 0).applyMatrix4(rot); v.up.y = -v.up.y;
    v.lookAt(look.x, -look.y, look.z); v.far = camera.far; v.updateMatrixWorld();
    v.projectionMatrix.copy(camera.projectionMatrix);
    this.seaU.uReflMat.value.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1).multiply(v.projectionMatrix).multiply(v.matrixWorldInverse);
    // oblique clip plane at y = 0 (nothing under the water gets mirrored)
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0).applyMatrix4(v.matrixWorldInverse);
    const c = new THREE.Vector4(plane.normal.x, plane.normal.y, plane.normal.z, plane.constant), e = v.projectionMatrix.elements;
    const q = new THREE.Vector4((Math.sign(c.x) + e[8]) / e[0], (Math.sign(c.y) + e[9]) / e[5], -1, (1 + e[10]) / e[14]);
    c.multiplyScalar(2 / c.dot(q)); e[2] = c.x; e[6] = c.y; e[10] = c.z + 1 - 0.003; e[14] = c.w;
    const rt = r.getRenderTarget(), shadow = r.shadowMap.autoUpdate, skyPos = this.sky.position.clone();
    r.shadowMap.autoUpdate = false; this.skyU.uReflPass.value = 1; this.sky.position.copy(v.position);
    r.setRenderTarget(this.reflRT); r.clear(); r.render(this.scene, v);
    r.setRenderTarget(rt); r.shadowMap.autoUpdate = shadow; this.skyU.uReflPass.value = 0; this.sky.position.copy(skyPos);
  }
  // swell height at a point (same formula as the shader) for boats
  swell(x, z) {
    const t = this.time, inH = x > -82 && x < 64 && z < 118 && z > G.z0;
    const a = inH ? (z < 95 ? 0.08 : 0.08 + (0.5 - 0.08) * Math.min(1, (z - 95) / 23)) : 0.5;
    const w = Math.sin(0.08 * x + 0.11 * z + t * 0.9) + 0.6 * Math.sin(-0.13 * x + 0.07 * z + t * 1.3) + 0.35 * Math.sin(0.21 * x - 0.17 * z + t * 1.9);
    return w * a * 0.6;
  }
  // islands across the bay and layered mountain ranges on the horizon. They use their own atmospheric haze
  // (instead of the scene fog, which would hide them) so they read as receding blue silhouettes.
  buildIslands() {
    const vn = (x, z) => { const s = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453; return s - Math.floor(s); };
    const noise = (x, z) => {
      const ix = Math.floor(x), iz = Math.floor(z), fx = x - ix, fz = z - iz, u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
      return (vn(ix, iz) * (1 - u) + vn(ix + 1, iz) * u) * (1 - v) + (vn(ix, iz + 1) * (1 - u) + vn(ix + 1, iz + 1) * u) * v;
    };
    const fbm = (x, z, o = 5) => { let a = 0.5, f = 1, t = 0; for (let k = 0; k < o; k++) { t += a * noise(x * f, z * f); a *= 0.5; f *= 2.1; } return t; };
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, fog: false, flatShading: false });
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, this.hazeU);
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWPi;')
        .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWPi = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
        uniform vec3 uHaze; uniform float uHazeDist; varying vec3 vWPi;
        float h21(vec2 p){ p = fract(p * vec2(233.34, 851.73)); p += dot(p, p + 23.45); return fract(p.x * p.y); }
        float n2(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y); }`)
        .replace('#include <color_fragment>', `#include <color_fragment>
          // tree crowns: bumpy light/dark speckle on the forested parts
          float canopy = n2(vWPi.xz * 0.35) * 0.6 + n2(vWPi.xz * 1.1) * 0.4;
          float forest = smoothstep(0.12, 0.25, diffuseColor.g - diffuseColor.r);
          diffuseColor.rgb *= mix(1.0, 0.7 + 0.55 * canopy, forest);`)
        .replace('#include <dithering_fragment>', `#include <dithering_fragment>
          float dd = length(vWPi - cameraPosition);
          float haze = 1.0 - exp(-dd / uHazeDist);
          gl_FragColor.rgb = mix(gl_FragColor.rgb, uHaze, clamp(haze * 1.05, 0.0, 0.93));`);
    };
    this.farMat = mat;
    const colOf = (h, slope, x, z, rock) => {
      const n = fbm(x * 0.02, z * 0.02, 3);
      if (h < 2.5 || slope > 1.1 || rock) return new THREE.Color().setRGB(0.25 + n * 0.1, 0.23 + n * 0.08, 0.2 + n * 0.06);   // rocky shore and cliffs
      const g = new THREE.Color().setRGB(0.1 + n * 0.08, 0.24 + n * 0.12, 0.09 + n * 0.04);
      if (n > 0.62) g.setRGB(0.2, 0.32, 0.13);                                                                                   // lighter broadleaf patches
      return g;
    };
    // --- islands: polar heightfields with noisy coastlines, ridges and a band of rock at the waterline
    const isl = [[-520, 620, 140, 85, 1], [-180, 760, 80, 48, 2], [260, 680, 190, 105, 3], [620, 520, 120, 62, 4], [880, 300, 240, 120, 5],
      [-900, 380, 260, 150, 6], [120, 980, 300, 90, 7], [-330, 470, 45, 28, 8], [420, 440, 38, 22, 9], [-40, 1150, 200, 70, 10]];
    const edgeOf = (t, R, seed) => R * (0.75 + 0.5 * fbm(Math.cos(t) * 2 + seed * 7, Math.sin(t) * 2 + seed, 4));
    for (const [cx, cz, R, Hh, seed] of isl) {
      const A = 72, RINGS = 18, pos = [], col = [], idx = [];
      for (let ri = 0; ri <= RINGS; ri++) for (let ai = 0; ai < A; ai++) {
        const t = ai / A * Math.PI * 2, rr = ri / RINGS;
        const edge = edgeOf(t, R, seed);
        const r = rr * edge * 1.06, x = cx + Math.cos(t) * r, z = cz + Math.sin(t) * r * 0.75;
        const ridge = 1 - Math.abs(fbm(x * 0.006 + seed, z * 0.006, 4) - 0.5) * 2;
        let h = Hh * Math.pow(Math.max(0, 1 - rr * rr), 0.8) * (0.55 + 0.6 * ridge) + fbm(x * 0.03, z * 0.03, 3) * 8 - 2;
        if (ri === RINGS) h = -6;
        if (ri === RINGS - 1) h = Math.min(h, 3 + fbm(x, z, 2) * 6);
        pos.push(x, h, z);
      }
      for (let ri = 0; ri < RINGS; ri++) for (let ai = 0; ai < A; ai++) {
        const a = ri * A + ai, b = ri * A + (ai + 1) % A, c = a + A, d = b + A; idx.push(a, c, b, b, c, d);
      }
      for (let k = 0; k < pos.length / 3; k++) {
        const x = pos[k * 3], h = pos[k * 3 + 1], z = pos[k * 3 + 2], ri = Math.floor(k / A);
        const hn = ri > 0 ? pos[(k - A) * 3 + 1] : h, slope = Math.abs(h - hn) / Math.max(1, R / RINGS);
        const c = colOf(h, slope, x, z, ri >= RINGS - 1); col.push(c.r, c.g, c.b);
      }
      // centre cap
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      geo.setIndex(idx); geo.computeVertexNormals();
      const m = new THREE.Mesh(geo, mat); m.name = 'island'; m.receiveShadow = false; this.scene.add(m);
    }
    this.buildFarDepth(isl, edgeOf);
    // --- mountain ranges on the horizon: three layers of ridged strips, further = taller and hazier
    const ranges = [[2000, -2.2, -0.4, 180, 11], [2800, -2.7, 0.1, 280, 12], [3600, -3.3, 0.5, 420, 13], [2600, 0.55, 1.15, 230, 14], [3400, 0.35, 1.45, 380, 15]];
    for (const [R, a0, a1, Hh, seed] of ranges) {
      const N = 220, ROWS = 6, pos = [], col = [], idx = [];
      for (let j = 0; j <= ROWS; j++) for (let i = 0; i <= N; i++) {
        const t = a0 + (a1 - a0) * i / N, depth = j / ROWS;           // depth 0 = front foot, 1 = back
        const x = Math.sin(t) * (R + depth * 400), z = Math.cos(t) * (R + depth * 400);
        const ridge = 1 - Math.abs(fbm(i * 0.035 + seed * 3, seed, 5) - 0.5) * 2;
        const env = Math.sin(Math.min(1, i / N) * Math.PI) ** 0.35;
        const prof = Math.sin(depth * Math.PI) ** 0.8;
        const h = (j === 0 || j === ROWS) ? -10 : Hh * env * prof * (0.35 + 0.75 * ridge * ridge) * (0.85 + 0.3 * fbm(i * 0.2, j + seed, 3));
        pos.push(x, h, z);
        const c = colOf(h, 0, x, z, false).lerp(new THREE.Color(0.18, 0.26, 0.2), 0.3); col.push(c.r, c.g, c.b);
      }
      for (let j = 0; j < ROWS; j++) for (let i = 0; i < N; i++) {
        const a = j * (N + 1) + i, b = a + 1, c = a + N + 1, d = c + 1; idx.push(a, b, c, b, d, c);
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      geo.setIndex(idx); geo.computeVertexNormals();
      const mm = new THREE.Mesh(geo, mat.clone()); mm.material.side = THREE.DoubleSide; mm.material.onBeforeCompile = mat.onBeforeCompile;
      mm.name = 'ranges'; mm.frustumCulled = false; this.scene.add(mm);
    }
  }
  // depth of the open sea around the islands and the mainland outside the near box (same encoding as Ground.waterTexture)
  buildFarDepth(isl, edgeOf) {
    const W = 320, H = 320, sx = (FAR.x1 - FAR.x0) / W, sz = (FAR.z1 - FAR.z0) / H;
    const hg = new Float32Array(W * H), data = new Uint8Array(W * H * 4);
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
      const x = FAR.x0 + (i + 0.5) * sx, z = FAR.z0 + (j + 0.5) * sz;
      let h = naturalRaw(x, z);
      for (const [cx, cz, R, , seed] of isl) {
        const dx = x - cx, dz = (z - cz) / 0.75, r = Math.hypot(dx, dz);
        if (r > R * 2.2) continue;
        const e = edgeOf(Math.atan2(dz, dx), R, seed) * 1.06 * 0.97;   // the shoreline sits just inside the outer ring
        h = Math.max(h, r < e ? 2 : -(0.6 + (r - e) * 0.16));        // a sandy, then rocky shelf around each island
      }
      hg[j * W + i] = h;
    }
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
      const h = hg[j * W + i];
      let land = 0;
      if (h < 0.2) for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        const a = i + di, b = j + dj;
        if (a >= 0 && b >= 0 && a < W && b < H && hg[b * W + a] > 0.2) land = 0.9;
      }
      const o = (j * W + i) * 4;
      data[o] = Math.min(255, Math.max(0, -h) * 6); data[o + 1] = land * 255; data[o + 3] = 255;
    }
    const t = new THREE.DataTexture(data, W, H); t.magFilter = t.minFilter = THREE.LinearFilter; t.needsUpdate = true;
    this.seaU.uFar.value = t;
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
    // haze colour for the far scenery: between the fog colour and the sky at the horizon
    this.hazeU.uHaze.value.copy(this.cur.fog).lerp(this.cur.hor, 0.5);
    this.hazeU.uHazeDist.value = this.cur.fogFar * 1.6;
  }
}
