import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

function isDynamic(o, root) {
  for (let p = o; p && p !== root; p = p.parent) if (p.userData.dynamic) return true;
  return false;
}

function normalized(mesh, inverseRoot) {
  let g = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
  for (const key of Object.keys(g.attributes)) {
    if (!['position', 'normal', 'uv'].includes(key)) g.deleteAttribute(key);
  }
  if (!g.attributes.normal) g.computeVertexNormals();
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  g.morphAttributes = {};
  g.clearGroups();
  const m = new THREE.Matrix4().multiplyMatrices(inverseRoot, mesh.matrixWorld);
  g.applyMatrix4(m);
  return g;
}

export function mergeStatic(root, { disposeOriginals = false } = {}) {
  root.updateMatrixWorld(true);
  const inverseRoot = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const buckets = new Map();
  root.traverse((o) => {
    if (!o.isMesh || o.isInstancedMesh || o.isSkinnedMesh) return;
    if (Array.isArray(o.material) || o.material.transparent || o.renderOrder !== 0) return;
    if (o.material.isShaderMaterial || isDynamic(o, root)) return;
    const key = `${o.material.uuid}|${o.castShadow}|${o.receiveShadow}`;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(o);
  });
  let removed = 0;
  for (const list of buckets.values()) {
    if (list.length < 2) continue;
    const merged = mergeGeometries(list.map((m) => normalized(m, inverseRoot)), false);
    if (!merged) continue;
    merged.computeBoundingSphere();
    const mesh = new THREE.Mesh(merged, list[0].material);
    mesh.castShadow = list[0].castShadow;
    mesh.receiveShadow = list[0].receiveShadow;
    mesh.name = `merged:${list[0].name || list[0].material.type}`;
    root.add(mesh);
    for (const m of list) {
      m.parent.remove(m);
      if (disposeOriginals) m.geometry.dispose();
      removed++;
    }
  }
  return removed;
}
