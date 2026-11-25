import * as THREE from 'three';
import { MARBLE_RADIUS } from './marbles.js';
import { woodTextures, noiseSurface, swirlTexture, speckleTexture } from './textures.js';

const R = MARBLE_RADIUS;

export function createSceneMaterials() {
  const walnut = woodTextures({ w: 1024, h: 1024, seed: 4, dark: '#2a170d', light: '#6e4527', rings: 7, warp: 2.6, roughBase: 0.38, roughVar: 0.22 });
  const walnutDesk = woodTextures({ w: 2048, h: 1024, seed: 9, dark: '#3a2112', light: '#8a5a33', rings: 11, warp: 3.2, roughBase: 0.32, roughVar: 0.22, normalStrength: 1.6 });
  const maple = woodTextures({ w: 512, h: 1024, seed: 12, dark: '#b98c5a', light: '#e6c79b', rings: 5, warp: 1.6, pores: 0.08, roughBase: 0.42, roughVar: 0.15, normalStrength: 1.4 });
  const felt = noiseSurface({ w: 512, h: 512, seed: 31, base: '#245338', varColor: '#3a7350', scale: 96, roughBase: 0.97, roughVar: 0.04, normalStrength: 2.5, fiber: 0.35 });
  const leather = noiseSurface({ w: 1024, h: 1024, seed: 41, base: '#6b4026', varColor: '#8a5634', scale: 48, roughBase: 0.55, roughVar: 0.25, normalStrength: 1.2 });
  const plaster = noiseSurface({ w: 1024, h: 1024, seed: 51, base: '#6f7a66', varColor: '#7f8a73', scale: 16, octaves: 6, roughBase: 0.92, roughVar: 0.06, normalStrength: 1.6 });
  const floor = woodTextures({ w: 1024, h: 1024, seed: 61, dark: '#3b2615', light: '#7d5734', rings: 14, warp: 2, roughBase: 0.45, roughVar: 0.2 });

  for (const set of [walnut, maple, felt, leather, plaster, floor]) {
    for (const t of Object.values(set)) t.repeat.set(1, 1);
  }
  for (const t of Object.values(walnutDesk)) {
    t.center.set(0.5, 0.5);
    t.rotation = Math.PI / 2;
    t.repeat.set(1, 1);
  }
  for (const t of Object.values(maple)) t.repeat.set(4, 2.2);
  for (const t of Object.values(felt)) t.repeat.set(3, 3);
  for (const t of Object.values(leather)) t.repeat.set(2, 1.2);
  for (const t of Object.values(plaster)) t.repeat.set(3, 2);
  for (const t of Object.values(floor)) t.repeat.set(2, 6);

  const m = {
    maple: new THREE.MeshPhysicalMaterial({ ...maple, color: 0xffffff, clearcoat: 0.55, clearcoatRoughness: 0.28, normalScale: new THREE.Vector2(0.5, 0.5) }),
    walnut: new THREE.MeshPhysicalMaterial({ ...walnut, color: 0xffffff, clearcoat: 0.45, clearcoatRoughness: 0.3, normalScale: new THREE.Vector2(0.6, 0.6) }),
    walnutDowel: new THREE.MeshPhysicalMaterial({ ...walnut, color: 0xffffff, clearcoat: 0.35, clearcoatRoughness: 0.35 }),
    desk: new THREE.MeshPhysicalMaterial({ ...walnutDesk, color: 0xffffff, clearcoat: 0.65, clearcoatRoughness: 0.22, normalScale: new THREE.Vector2(0.45, 0.45) }),
    copper: new THREE.MeshPhysicalMaterial({ color: 0xd98a64, metalness: 1, roughness: 0.28, clearcoat: 0.25, clearcoatRoughness: 0.2, side: THREE.DoubleSide }),
    brass: new THREE.MeshPhysicalMaterial({ color: 0xd9ae62, metalness: 1, roughness: 0.24, side: THREE.DoubleSide }),
    blackMetal: new THREE.MeshPhysicalMaterial({ color: 0x1b1c1e, metalness: 0.6, roughness: 0.38, clearcoat: 0.6, clearcoatRoughness: 0.3 }),
    felt: new THREE.MeshStandardMaterial({ ...felt, color: 0xffffff, normalScale: new THREE.Vector2(0.35, 0.35) }),
    leather: new THREE.MeshPhysicalMaterial({ ...leather, color: 0xffffff, normalScale: new THREE.Vector2(0.25, 0.25), sheen: 0.3, sheenRoughness: 0.6, sheenColor: new THREE.Color('#8a5a3a') }),
    plaster: new THREE.MeshStandardMaterial({ ...plaster, color: 0xffffff }),
    floor: new THREE.MeshStandardMaterial({ ...floor, color: 0xffffff }),
    paint: new THREE.MeshStandardMaterial({ color: 0xe9e2d2, roughness: 0.55 }),
    ceramic: new THREE.MeshPhysicalMaterial({ color: 0xe8dcc6, roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.08 }),
    coffee: new THREE.MeshPhysicalMaterial({ color: 0x1c0d05, roughness: 0.08, clearcoat: 1 }),
    terracotta: new THREE.MeshStandardMaterial({ color: 0xb2603f, roughness: 0.85 }),
    soil: new THREE.MeshStandardMaterial({ color: 0x2a1c12, roughness: 1 }),
    leaf: new THREE.MeshPhysicalMaterial({ color: 0x3e6b3a, roughness: 0.45, sheen: 0.4, sheenColor: new THREE.Color('#9fc47a'), side: THREE.DoubleSide }),
    paper: new THREE.MeshStandardMaterial({ color: 0xefe6d2, roughness: 0.9 }),
    shade: new THREE.MeshPhysicalMaterial({ color: 0x23402f, metalness: 0.4, roughness: 0.32, clearcoat: 0.8, clearcoatRoughness: 0.2, side: THREE.FrontSide }),
    shadeInner: new THREE.MeshStandardMaterial({ color: 0xfff2dc, roughness: 0.6, emissive: 0xffc98a, emissiveIntensity: 0.5, side: THREE.BackSide }),
    bulb: new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffd7a0, emissiveIntensity: 14 }),
    fairy: new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffb562, emissiveIntensity: 9 }),
    wire: new THREE.MeshStandardMaterial({ color: 0x2a2520, roughness: 0.6 }),
    glassPane: new THREE.MeshPhysicalMaterial({ color: 0xffffff, metalness: 0, roughness: 0.02, transparent: true, opacity: 0.08, envMapIntensity: 1.2 }),
    curtain: new THREE.MeshPhysicalMaterial({ color: 0xe9dcc4, roughness: 0.9, sheen: 0.6, sheenColor: new THREE.Color('#fff1da'), transparent: true, opacity: 0.86, side: THREE.DoubleSide }),
    candle: new THREE.MeshStandardMaterial({ color: 0xf3e6cf, roughness: 0.6, emissive: 0xff9a40, emissiveIntensity: 0.15 }),
    flame: new THREE.MeshBasicMaterial({ color: 0xffc070 }),
    ceramicDark: new THREE.MeshPhysicalMaterial({ color: 0x2f4a46, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.1 }),
    finishFlag: new THREE.MeshStandardMaterial({ color: 0xf1e9dc, roughness: 0.5 }),
    jar: new THREE.MeshPhysicalMaterial({ color: 0xffd9a8, roughness: 0.1, transparent: true, opacity: 0.35 }),
  };
  m.flame.color.multiplyScalar(6);
  return m;
}

function vaneGeometry(count = 3, twist = 2.2) {
  const geos = [];
  const seg = 24;
  for (let k = 0; k < count; k++) {
    const pos = [];
    const idx = [];
    for (let i = 0; i <= seg; i++) {
      const t = i / seg;
      const z = (t - 0.5) * 2 * R * 0.78;
      const halfW = Math.sqrt(Math.max(0, (R * 0.8) ** 2 - z * z)) * 0.92;
      const ang = (k / count) * Math.PI + twist * (z / R);
      for (let j = 0; j <= 6; j++) {
        const s = (j / 6) * halfW;
        const bulge = Math.sin((j / 6) * Math.PI) * R * 0.08;
        pos.push(Math.cos(ang) * s - Math.sin(ang) * bulge, Math.sin(ang) * s + Math.cos(ang) * bulge, z);
      }
      for (let j = 0; j <= 6; j++) {
        const s = -(j / 6) * halfW;
        const bulge = Math.sin((j / 6) * Math.PI) * R * 0.08;
        pos.push(Math.cos(ang) * s + Math.sin(ang) * bulge, Math.sin(ang) * s - Math.cos(ang) * bulge, z);
      }
    }
    const row = 14;
    for (let i = 0; i < seg; i++) {
      for (let j = 0; j < 6; j++) {
        for (const off of [0, 7]) {
          const a = i * row + off + j;
          const b = a + row;
          idx.push(a, b, a + 1, a + 1, b, b + 1);
        }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    geos.push(g);
  }
  return geos;
}

function fakeGlass({ tint = '#ffffff', ior = 1.52, edge = 0.92, center = 0.42, body = 1.0 }) {
  const m = new THREE.MeshPhysicalMaterial({
    color: 0x000000, metalness: 0, roughness: 0.02, specularIntensity: 1, envMapIntensity: 1.5,
    clearcoat: 1, clearcoatRoughness: 0.02, transparent: true, depthWrite: true,
  });
  m.userData.uniforms = {
    glassTint: { value: new THREE.Color(tint) },
    glassIor: { value: ior },
    glassEdge: { value: edge },
    glassCenter: { value: center },
    glassBody: { value: body },
  };
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, m.userData.uniforms);
    shader.fragmentShader = shader.fragmentShader
      .replace('void main() {', `
        uniform vec3 glassTint;
        uniform float glassIor;
        uniform float glassEdge;
        uniform float glassCenter;
        uniform float glassBody;
        void main() {`)
      .replace('#include <opaque_fragment>', `
        vec3 gV = normalize(vViewPosition);
        vec3 gN = normalize(normal);
        float gFres = pow(1.0 - saturate(dot(gN, gV)), 2.5);
        float gAlpha = mix(glassCenter, glassEdge, gFres);
        vec3 gBody = vec3(0.0);
        #if defined( USE_ENVMAP ) && defined( ENVMAP_TYPE_PMREM )
          vec3 gR = inverseTransformDirection(refract(-gV, gN, 1.0 / glassIor), viewMatrix);
          gBody = textureLod(envMap, envMapRotation * gR, roughnessToMip(0.04)).rgb * envMapIntensity * glassTint * glassBody;
        #endif
        gl_FragColor = vec4(outgoingLight / gAlpha + gBody * (1.0 - gFres), gAlpha);
      `);
  };
  m.customProgramCacheKey = () => 'fake-glass';
  return m;
}

const CATSEYE_COLORS = ['#1e7bd8', '#ef7a1a', '#21a37a', '#d6283c', '#f2c230', '#7b3fd1'];
const AURORA_PALETTES = [
  ['#f6efe2', '#e2603f', '#f1b24a', '#2f6f8f', '#1f2d3d'],
  ['#e9f1f4', '#3a8fb7', '#0f3c57', '#f3d9a4', '#bb4d2c'],
  ['#f4ece1', '#5d8a4f', '#203824', '#d8b14a', '#8d3b2e'],
  ['#f7e8ee', '#b3446c', '#3d1f3a', '#e8a87c', '#f4f1de'],
];

export class MarbleFactory {
  constructor() {
    this.sphere = new THREE.SphereGeometry(R, 48, 32);
    this.core = new THREE.SphereGeometry(R * 0.86, 32, 20);
    this.vanes = vaneGeometry(3);
    this.auroraTextures = AURORA_PALETTES.map((colors, i) => swirlTexture({ w: 512, h: 256, seed: 10 + i, colors }));
    const oakTex = woodTextures({ w: 512, h: 256, seed: 71, dark: '#8a5f36', light: '#d2a873', rings: 6, warp: 1.8, roughBase: 0.5 });
    this.mats = {
      glassShell: (tint = '#ffffff') => new THREE.MeshPhysicalMaterial({
        color: tint, metalness: 0, roughness: 0.015, transmission: 1, thickness: R * 1.6, ior: 1.52,
        dispersion: 0.35, specularIntensity: 1, envMapIntensity: 1.6, attenuationColor: new THREE.Color('#e4f5f2'), attenuationDistance: 0.2,
      }),
      acrylic: new THREE.MeshPhysicalMaterial({
        color: '#ffe9f0', roughness: 0.03, transmission: 1, thickness: R * 2, ior: 1.49, dispersion: 0.15,
        attenuationColor: new THREE.Color('#ff9fbe'), attenuationDistance: 0.1, envMapIntensity: 1.5,
      }),
      oak: new THREE.MeshPhysicalMaterial({ ...oakTex, color: 0xffffff, clearcoat: 0.5, clearcoatRoughness: 0.3 }),
      rubber: new THREE.MeshPhysicalMaterial({ map: speckleTexture({}), roughness: 0.62, sheen: 0.5, sheenRoughness: 0.5, sheenColor: new THREE.Color('#ff9c8a'), clearcoat: 0.25, clearcoatRoughness: 0.6 }),
      steel: new THREE.MeshPhysicalMaterial({ color: '#f4f6f8', metalness: 1, roughness: 0.035, envMapIntensity: 1.25 }),
      brass: new THREE.MeshPhysicalMaterial({ color: '#e8c06d', metalness: 1, roughness: 0.09, envMapIntensity: 1.2 }),
      copper: new THREE.MeshPhysicalMaterial({ color: '#ec9a74', metalness: 1, roughness: 0.1, envMapIntensity: 1.2 }),
      tungsten: new THREE.MeshPhysicalMaterial({ color: '#7d828c', metalness: 1, roughness: 0.14, clearcoat: 0.6, clearcoatRoughness: 0.05, envMapIntensity: 1.1 }),
    };
    this.vaneMats = CATSEYE_COLORS.map((c) => new THREE.MeshPhysicalMaterial({ color: c, roughness: 0.25, clearcoat: 1, side: THREE.DoubleSide, emissive: c, emissiveIntensity: 0.06 }));
    this.coreMats = this.auroraTextures.map((map) => new THREE.MeshPhysicalMaterial({ map, roughness: 0.35, clearcoat: 0.4 }));
    this.shell = this.mats.glassShell();
    this.fake = {
      shell: fakeGlass({ tint: '#dff3f0', center: 0.38 }),
      acrylic: fakeGlass({ tint: '#ff9fc0', ior: 1.49, center: 0.8, edge: 0.95, body: 1.25 }),
    };
    this.real = { shell: this.shell, acrylic: this.mats.acrylic };
    this.glassMode = 'real';
    this.variant = 0;
  }

  create(type, variant = this.variant++) {
    const group = new THREE.Group();
    const add = (geo, mat, shadow = true) => {
      const mesh = new THREE.Mesh(geo, mat);
      mesh.castShadow = shadow;
      mesh.receiveShadow = true;
      group.add(mesh);
      return mesh;
    };
    switch (type.id) {
      case 'catseye': {
        add(this.sphere, this.glass('shell')).userData.glass = 'shell';
        const mat = this.vaneMats[variant % this.vaneMats.length];
        for (const v of this.vanes) add(v, mat, false);
        break;
      }
      case 'aurora': {
        add(this.sphere, this.glass('shell')).userData.glass = 'shell';
        const core = add(this.core, this.coreMats[variant % this.coreMats.length], false);
        core.rotation.set(variant * 1.3, variant * 0.7, 0);
        break;
      }
      case 'acrylic':
        add(this.sphere, this.glass('acrylic')).userData.glass = 'acrylic';
        break;
      default:
        add(this.sphere, this.mats[type.id]);
    }
    group.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
    return group;
  }

  glass(role) {
    return (this.glassMode === 'real' ? this.real : this.fake)[role];
  }

  setGlassMode(mode, groups) {
    this.glassMode = mode;
    for (const g of groups) {
      g.traverse((o) => {
        if (o.userData.glass) o.material = this.glass(o.userData.glass);
      });
    }
  }
}
