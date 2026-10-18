// One shared material per material name, built from ../uminagi-assets/materials.json and the tiling PBR textures.
// The GLBs carry metre-based UVs but no images; textures are applied here by material name.
import * as THREE from 'three';

export const ASSETS = '../uminagi-assets/';
const FOLIAGE = new Set(['leaf', 'leaf_dark', 'leaf_light', 'pine', 'sakura', 'grass_blade', 'hydrangea', 'hydrangea_pink', 'net', 'net_green']);
const CLOTH = new Set(['cloth_red', 'cloth_blue', 'cloth_navy', 'cloth_white', 'cloth_yellow', 'cloth_green', 'cloth_pink', 'tarp_blue', 'denim']);
export const GLOW = ['lamp', 'lantern_red', 'lantern_white', 'vend_panel', 'beacon_red', 'beacon_white', 'window_lit'];

function avgColor(img) {
  const cv = document.createElement('canvas'); cv.width = cv.height = 8;
  const g = cv.getContext('2d'); g.drawImage(img, 0, 0, 8, 8);
  const d = g.getImageData(0, 0, 8, 8).data; let r = 0, gg = 0, b = 0;
  for (let i = 0; i < d.length; i += 4) { r += d[i]; gg += d[i + 1]; b += d[i + 2]; }
  const n = d.length / 4;
  return new THREE.Color().setRGB(r / n / 255, gg / n / 255, b / n / 255, THREE.SRGBColorSpace);
}

export class MaterialLib {
  constructor(renderer, quality) {
    this.renderer = renderer; this.q = quality;
    this.loader = new THREE.TextureLoader();
    this.tex = {}; this.mats = {}; this.glow = {};
    this.wind = { value: 0 };   // shared time uniform for foliage sway
    this.glowK = { value: 0.05 }; // night-time light level for merged geometry
  }
  async load() {
    const [defs, texMeta] = await Promise.all([
      fetch(ASSETS + 'materials.json').then((r) => r.json()),
      fetch(ASSETS + 'textures/textures.json').then((r) => r.json()),
    ]);
    this.defs = defs; this.texMeta = texMeta;
    const aniso = Math.min(this.q.aniso, this.renderer.capabilities.getMaxAnisotropy());
    const load = (file, srgb) => new Promise((res) => this.loader.load(ASSETS + 'textures/' + (this.q.tex1k ? '1k/' : '') + file, (t) => {
      t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = aniso;
      if (srgb) t.colorSpace = THREE.SRGBColorSpace;
      res(t);
    }, undefined, () => res(null)));
    await Promise.all(Object.entries(texMeta).map(async ([name, m]) => {
      const [map, nrm, rough] = await Promise.all([load(name + '.jpg', true), this.q.normalMaps ? load(m.normal, false) : null, m.rough ? load(m.rough, false) : null]);
      for (const t of [map, nrm, rough]) if (t) t.repeat.set(1 / m.size_m[0], 1 / m.size_m[1]);
      this.tex[name] = { map, nrm, rough, avg: map ? avgColor(map.image) : new THREE.Color(1, 1, 1) };
    }));
    for (const name of Object.keys(defs)) this.get(name);
    for (const name of ['dirt', 'grass', 'sand']) this.get(name);
    // extra materials used by generated geometry
    this.mats.curb = this.curb();
    this.mats.terrain = this.terrain();
    return this;
  }
  get(name) {
    if (this.mats[name]) return this.mats[name];
    let d = this.defs[name];
    if (!d && this.tex[name]) d = { color: [1, 1, 1], rough: 0.95, metal: 0, tex: name };  // plain textured ground materials (dirt, grass, sand, rock)
    if (!d) { const m = new THREE.MeshStandardMaterial({ color: 0xff00ff }); m.name = name; return (this.mats[name] = m); }
    const c = new THREE.Color().setRGB(d.color[0], d.color[1], d.color[2], THREE.LinearSRGBColorSpace);
    const m = new THREE.MeshStandardMaterial({ name, color: c, roughness: d.rough, metalness: d.metal });
    const t = d.tex && this.tex[d.tex];
    if (t) {
      m.map = t.map;
      if (t.nrm) { m.normalMap = t.nrm; m.normalScale.set(0.9, 0.9); }
      if (t.rough) { m.roughnessMap = t.rough; m.roughness = 1; }
    }
    if (d.emit) { m.emissive = new THREE.Color().setRGB(...d.emit, THREE.LinearSRGBColorSpace); m.emissiveIntensity = d.emit_strength; this.glow[name] = { m, base: d.emit_strength }; }
    if (name === 'glass') { m.metalness = 0.1; m.roughness = 0.05; m.envMapIntensity = 1.6; }
    if (name === 'concrete_wet') m.envMapIntensity = 1.3;
    if (FOLIAGE.has(name)) this.sway(m, name === 'grass_blade' ? 0.12 : 0.05);
    if (CLOTH.has(name) || name.startsWith('cloth') || name === 'paper') m.side = THREE.DoubleSide;
    if (name === 'grass_blade') m.side = THREE.DoubleSide;
    this.mats[name] = m;
    return m;
  }
  // vertex sway with height for leaves, grass and nets (works with and without instancing)
  sway(m, amp) {
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = this.wind;
      sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        vec4 wp0 = modelMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        #ifdef USE_INSTANCING
          wp0 = modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        #endif
        float hgt = max(0.0, position.y);
        float ph = wp0.x * 0.37 + wp0.z * 0.23;
        transformed.x += sin(uTime * 1.7 + ph) * ${amp.toFixed(3)} * hgt * (0.6 + 0.4 * sin(uTime * 0.6 + ph * 1.3));
        transformed.z += cos(uTime * 1.3 + ph * 1.7) * ${amp.toFixed(3)} * 0.6 * hgt;`);
    };
    m.customProgramCacheKey = () => 'sway' + amp;
  }
  curb() {
    const cv = document.createElement('canvas'); cv.width = 64; cv.height = 16;
    const g = cv.getContext('2d');
    g.fillStyle = '#e8b80c'; g.fillRect(0, 0, 64, 16); g.fillStyle = '#1a1a1a';
    for (let x = -16; x < 64; x += 32) { g.beginPath(); g.moveTo(x, 16); g.lineTo(x + 16, 0); g.lineTo(x + 32, 0); g.lineTo(x + 16, 16); g.fill(); }
    const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace;
    return new THREE.MeshStandardMaterial({ name: 'curb', map: t, roughness: 0.7 });
  }
  // natural ground: grass on gentle slopes, rock on steep ones, sand near the sea, dirt patches (world-space UVs)
  terrain() {
    const T = this.tex, m = new THREE.MeshStandardMaterial({ name: 'terrain', roughness: 1, map: T.grass.map, normalMap: T.grass.nrm || null });
    m.onBeforeCompile = (sh) => {
      sh.uniforms.tRock = { value: T.rock.map }; sh.uniforms.tSand = { value: T.sand.map }; sh.uniforms.tDirt = { value: T.dirt.map };
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWP; varying vec3 vWN;')
        .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWP = (modelMatrix * vec4(transformed, 1.0)).xyz; vWN = normalize(mat3(modelMatrix) * objectNormal);')
        .replace('#include <uv_vertex>', '#include <uv_vertex>\n#ifdef USE_MAP\nvMapUv = (modelMatrix * vec4(position, 1.0)).xz * 0.2;\n#endif\n#ifdef USE_NORMALMAP\nvNormalMapUv = (modelMatrix * vec4(position, 1.0)).xz * 0.2;\n#endif');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform sampler2D tRock, tSand, tDirt; varying vec3 vWP; varying vec3 vWN;')
        .replace('#include <map_fragment>', `
          vec3 grass = texture2D(map, vWP.xz * 0.2).rgb;
          vec3 dirt = texture2D(tDirt, vWP.xz * 0.25).rgb;
          vec3 sand = texture2D(tSand, vWP.xz * 0.25).rgb;
          vec3 an = abs(vWN);
          vec3 rock = texture2D(tRock, vWP.zy * 0.16).rgb * an.x + texture2D(tRock, vWP.xy * 0.16).rgb * an.z + texture2D(tRock, vWP.xz * 0.16).rgb * an.y;
          rock /= (an.x + an.y + an.z);
          float slope = 1.0 - vWN.y;
          float n = texture2D(tDirt, vWP.xz * 0.013).r;
          vec3 col = mix(grass, dirt, smoothstep(0.42, 0.62, n) * 0.6);
          float rn = texture2D(tDirt, vWP.xz * 0.031 + 0.37).r;
          col = mix(col, rock, smoothstep(0.2 + rn * 0.25, 0.38 + rn * 0.3, slope));
          col = mix(col, sand, smoothstep(1.4, 0.5, vWP.y) * (1.0 - smoothstep(0.35, 0.5, slope)));
          col = mix(col, col * vec3(0.55, 0.6, 0.55), smoothstep(0.0, -1.5, vWP.y));
          diffuseColor.rgb *= col;`);
    };
    return m;
  }
  // colour a material shows from far away (texture average x tint), used for merged far-LOD meshes
  flatColor(m) {
    const c = m.color.clone();
    const t = m.map && Object.values(this.tex).find((x) => x.map === m.map);
    if (t) c.multiply(t.avg);
    return c;
  }
  setGlow(k) { for (const { m, base } of Object.values(this.glow)) m.emissiveIntensity = base * k; this.glowK.value = k; }
}
