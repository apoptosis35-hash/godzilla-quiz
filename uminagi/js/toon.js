// Picture-book look for the characters only (ぽっけ, the villagers, the merchant, the captain...): cel shading in
// three flat steps, livelier colours and a thick black outline. The town keeps its ordinary shading.
//   toonify(object) -- once per character, after it is cloned
import * as THREE from 'three';

let ramp = null, outlineMat = null;
const gradient = () => {
  if (ramp) return ramp;
  ramp = new THREE.DataTexture(new Uint8Array([110, 110, 110, 255, 190, 190, 190, 255, 255, 255, 255, 255]), 3, 1, THREE.RGBAFormat);
  ramp.minFilter = ramp.magFilter = THREE.NearestFilter; ramp.generateMipmaps = false; ramp.needsUpdate = true;
  return ramp;
};
// inverted hull: the back faces pushed out along the normal (in view space, so the line keeps its width whatever
// the part's own scale) and a little further back, so the shell only shows round the silhouette and never over
// the eyes, mouths and markings lying on the surface
const outline = () => {
  if (outlineMat) return outlineMat;
  outlineMat = new THREE.MeshBasicMaterial({ color: 0x1a1210, side: THREE.BackSide });
  outlineMat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <project_vertex>', `#include <project_vertex>
      mvPosition.xyz += normalize(normalMatrix * normal) * 0.011;
      mvPosition.z -= 0.03;
      gl_Position = projectionMatrix * mvPosition;`);
  };
  return outlineMat;
};
// livelier colours: more saturation, a touch lighter (once per shared geometry)
function brighten(geo) {
  const col = geo.attributes.color; if (!col || geo.userData.toon) return;
  geo.userData.toon = true;
  const c = new THREE.Color(), hsl = {};
  for (let i = 0; i < col.count; i++) {
    c.setRGB(col.getX(i), col.getY(i), col.getZ(i)); c.getHSL(hsl);
    if (hsl.l > 0.06) c.setHSL(hsl.h, Math.min(1, hsl.s * 1.35 + 0.05), Math.min(0.92, hsl.l * 1.12));
    col.setXYZ(i, c.r, c.g, c.b);
  }
  col.needsUpdate = true;
}
export function toonify(root) {
  const meshes = []; root.traverse((m) => { if (m.isMesh && !m.userData.outline) meshes.push(m); });
  for (const m of meshes) {
    const old = m.material; if (!old || old.userData?.toon) continue;
    if (m.geometry.attributes.color) brighten(m.geometry);
    const t = new THREE.MeshToonMaterial({ color: old.color || 0xffffff, map: old.map || null, vertexColors: !!m.geometry.attributes.color, gradientMap: gradient(), transparent: old.transparent, opacity: old.opacity });
    t.userData.toon = true; m.material = t;
    if (m.geometry.attributes.normal && !old.transparent) {
      const o = new THREE.Mesh(m.geometry, outline()); o.userData.outline = true; o.castShadow = false; o.receiveShadow = false; o.renderOrder = -1;
      m.add(o);
    }
  }
  return root;
}
