import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const out = path.join(root, 'vendor');
const threeRoot = path.join(root, 'node_modules/three');
const jsm = path.join(threeRoot, 'examples/jsm');

const addons = [
  'controls/OrbitControls.js',
  'postprocessing/EffectComposer.js',
  'postprocessing/RenderPass.js',
  'postprocessing/UnrealBloomPass.js',
  'postprocessing/OutputPass.js',
  'postprocessing/ShaderPass.js',
  'postprocessing/BokehPass.js',
  'geometries/RoundedBoxGeometry.js',
  'utils/BufferGeometryUtils.js',
  'environments/RoomEnvironment.js',
];

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(path.join(out, 'three/addons'), { recursive: true });
fs.mkdirSync(path.join(out, 'rapier'), { recursive: true });

for (const f of ['three.module.js', 'three.core.js']) {
  fs.copyFileSync(path.join(threeRoot, 'build', f), path.join(out, 'three', f));
}

const seen = new Set();
function copyAddon(rel) {
  if (seen.has(rel)) return;
  seen.add(rel);
  const src = path.join(jsm, rel);
  const dst = path.join(out, 'three/addons', rel);
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  const code = fs.readFileSync(src, 'utf8');
  fs.writeFileSync(dst, code);
  for (const m of code.matchAll(/from\s+['"](\.[^'"]+)['"]/g)) {
    copyAddon(path.posix.normalize(path.posix.join(path.posix.dirname(rel), m[1])));
  }
}
addons.forEach(copyAddon);

fs.copyFileSync(
  path.join(root, 'node_modules/@dimforge/rapier3d-compat/dist/rapier.mjs'),
  path.join(out, 'rapier/rapier.js'),
);
fs.copyFileSync(path.join(threeRoot, 'LICENSE'), path.join(out, 'three/LICENSE'));
fs.copyFileSync(
  path.join(root, 'node_modules/@dimforge/rapier3d-compat/LICENSE'),
  path.join(out, 'rapier/LICENSE'),
);
console.log('vendored', seen.size, 'addon files');
