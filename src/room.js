import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { artPrintTexture, bookSpineTexture, makeNoise } from './textures.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

function mesh(geo, mat, { cast = true, receive = true } = {}) {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = cast;
  m.receiveShadow = receive;
  return m;
}

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function cylinderBetween(a, b, r, seg = 16, mat) {
  const dir = b.clone().sub(a);
  const g = new THREE.CylinderGeometry(r, r, dir.length(), seg);
  const m = mesh(g, mat);
  m.position.copy(a).add(b).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(V(0, 1, 0), dir.normalize());
  return m;
}

const ROOM = { back: -0.8, left: -1.7, right: 1.9, front: 3.2, floor: -0.76, ceiling: 1.7 };

function skyMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { time: { value: 0 } },
    vertexShader: `
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
    `,
    fragmentShader: `
      varying vec2 vUv;
      uniform float time;
      float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      void main() {
        float y = vUv.y;
        vec3 top = vec3(0.05, 0.08, 0.22);
        vec3 mid = vec3(0.22, 0.2, 0.42);
        vec3 low = vec3(1.25, 0.55, 0.28);
        vec3 col = mix(low, mid, smoothstep(0.18, 0.5, y));
        col = mix(col, top, smoothstep(0.5, 1.0, y));
        vec2 g = vUv * vec2(90.0, 50.0);
        vec2 id = floor(g);
        float star = step(0.985, h(id)) * smoothstep(0.55, 0.9, y) * (0.6 + 0.4 * sin(time * 2.0 + h(id) * 30.0));
        col += vec3(star) * 0.9 * smoothstep(0.35, 0.0, length(fract(g) - 0.5));
        float x = vUv.x;
        float ridge = 0.2 + 0.035 * sin(x * 7.0 + 1.3) + 0.02 * sin(x * 17.0 + 0.4) + 0.012 * sin(x * 41.0);
        float trees = ridge + 0.025 * pow(abs(sin(x * 90.0)), 0.5) * smoothstep(0.3, 0.8, sin(x * 9.0 + 2.0) * 0.5 + 0.5);
        float edge = smoothstep(trees + 0.004, trees - 0.004, y);
        vec3 hill = vec3(0.03, 0.03, 0.06) + vec3(0.12, 0.06, 0.06) * smoothstep(trees - 0.1, trees, y);
        col = mix(col, hill, edge);
        vec2 lg = vUv * vec2(70.0, 40.0);
        vec2 li = floor(lg);
        float on = step(0.86, h(li)) * step(y, ridge - 0.03);
        float d = length(fract(lg) - 0.5 - (vec2(h(li + 3.0), h(li + 7.0)) - 0.5) * 0.6);
        col += vec3(1.8, 1.1, 0.55) * on * smoothstep(0.18, 0.0, d) * (0.6 + 0.4 * sin(time * 0.7 + h(li) * 40.0));
        vec2 mp = (vUv - vec2(0.72, 0.62)) * vec2(1.6, 1.0);
        float moon = smoothstep(0.045, 0.04, length(mp));
        col += vec3(1.8, 1.7, 1.5) * moon + vec3(0.25, 0.25, 0.35) * smoothstep(0.25, 0.0, length(mp));
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
}

export function buildRoom(mats) {
  const group = new THREE.Group();
  const anim = [];

  const deskW = 1.8;
  const deskD = 0.9;
  const deskT = 0.04;
  const desk = mesh(new RoundedBoxGeometry(deskW, deskT, deskD, 4, 0.008), mats.desk);
  desk.position.set(0, -0.004 - deskT / 2, 0);
  group.add(desk);
  const legGeo = new THREE.BoxGeometry(0.05, -ROOM.floor - deskT, 0.05);
  for (const [x, z] of [[-0.85, -0.4], [0.85, -0.4], [-0.85, 0.4], [0.85, 0.4]]) {
    const leg = mesh(legGeo, mats.walnut);
    leg.position.set(x, (ROOM.floor - deskT) / 2, z);
    group.add(leg);
  }
  const apron = mesh(new THREE.BoxGeometry(deskW - 0.1, 0.08, 0.02), mats.walnut);
  apron.position.set(0, -0.085, 0.4);
  group.add(apron);

  const mat = mesh(new RoundedBoxGeometry(1.42, 0.004, 0.74, 2, 0.0018), mats.leather, { cast: false });
  mat.position.set(-0.04, -0.002, 0.04);
  group.add(mat);

  const floorGeo = new THREE.PlaneGeometry(ROOM.right - ROOM.left, ROOM.front - ROOM.back);
  floorGeo.rotateX(-Math.PI / 2);
  const floor = mesh(floorGeo, mats.floor, { cast: false });
  floor.position.set((ROOM.left + ROOM.right) / 2, ROOM.floor, (ROOM.back + ROOM.front) / 2);
  group.add(floor);
  const ceilGeo = floorGeo.clone();
  ceilGeo.rotateX(Math.PI);
  const ceil = mesh(ceilGeo, mats.paint, { cast: false });
  ceil.position.set(floor.position.x, ROOM.ceiling, floor.position.z);
  group.add(ceil);

  const H = ROOM.ceiling - ROOM.floor;
  const win = { cx: 0.95, cy: 0.72, w: 0.86, h: 0.92 };
  const backShape = new THREE.Shape();
  backShape.moveTo(ROOM.left, ROOM.floor);
  backShape.lineTo(ROOM.right, ROOM.floor);
  backShape.lineTo(ROOM.right, ROOM.ceiling);
  backShape.lineTo(ROOM.left, ROOM.ceiling);
  backShape.closePath();
  const hole = new THREE.Path();
  hole.moveTo(win.cx - win.w / 2, win.cy - win.h / 2);
  hole.lineTo(win.cx - win.w / 2, win.cy + win.h / 2);
  hole.lineTo(win.cx + win.w / 2, win.cy + win.h / 2);
  hole.lineTo(win.cx + win.w / 2, win.cy - win.h / 2);
  hole.closePath();
  backShape.holes.push(hole);
  const backGeo = new THREE.ShapeGeometry(backShape);
  const uv = backGeo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / 1.2, uv.getY(i) / 1.2);
  const back = mesh(backGeo, mats.plaster, { cast: false });
  back.position.z = ROOM.back;
  group.add(back);

  const sideGeo = new THREE.PlaneGeometry(ROOM.front - ROOM.back, H);
  const left = mesh(sideGeo, mats.plaster, { cast: false });
  left.rotation.y = Math.PI / 2;
  left.position.set(ROOM.left, ROOM.floor + H / 2, (ROOM.back + ROOM.front) / 2);
  group.add(left);
  const right = mesh(sideGeo.clone(), mats.plaster, { cast: false });
  right.rotation.y = -Math.PI / 2;
  right.position.set(ROOM.right, ROOM.floor + H / 2, (ROOM.back + ROOM.front) / 2);
  group.add(right);
  const frontWall = mesh(new THREE.PlaneGeometry(ROOM.right - ROOM.left, H), mats.plaster, { cast: false });
  frontWall.rotation.y = Math.PI;
  frontWall.position.set((ROOM.left + ROOM.right) / 2, ROOM.floor + H / 2, ROOM.front);
  group.add(frontWall);

  const skirting = mesh(new THREE.BoxGeometry(ROOM.right - ROOM.left, 0.12, 0.015), mats.paint);
  skirting.position.set((ROOM.left + ROOM.right) / 2, ROOM.floor + 0.06, ROOM.back + 0.008);
  group.add(skirting);

  const reveal = 0.12;
  const frameT = 0.035;
  const addFrame = (w, h, x, y, z) => {
    const b = mesh(new THREE.BoxGeometry(w, h, reveal), mats.paint);
    b.position.set(x, y, z);
    group.add(b);
  };
  const wz = ROOM.back - reveal / 2;
  addFrame(win.w + frameT * 2, frameT, win.cx, win.cy + win.h / 2 + frameT / 2, wz);
  addFrame(win.w + frameT * 2, frameT, win.cx, win.cy - win.h / 2 - frameT / 2, wz);
  addFrame(frameT, win.h, win.cx - win.w / 2 - frameT / 2, win.cy, wz);
  addFrame(frameT, win.h, win.cx + win.w / 2 + frameT / 2, win.cy, wz);
  const mull = 0.022;
  const mz = ROOM.back - reveal * 0.6;
  const mv = mesh(new THREE.BoxGeometry(mull, win.h, 0.03), mats.paint);
  mv.position.set(win.cx, win.cy, mz);
  group.add(mv);
  const mh = mesh(new THREE.BoxGeometry(win.w, mull, 0.03), mats.paint);
  mh.position.set(win.cx, win.cy + 0.06, mz);
  group.add(mh);
  const sill = mesh(new RoundedBoxGeometry(win.w + 0.16, 0.025, 0.13, 2, 0.006), mats.paint);
  sill.position.set(win.cx, win.cy - win.h / 2 - 0.012, ROOM.back + 0.04);
  group.add(sill);
  const pane = mesh(new THREE.PlaneGeometry(win.w, win.h), mats.glassPane, { cast: false, receive: false });
  pane.position.set(win.cx, win.cy, mz - 0.005);
  group.add(pane);
  const sky = skyMaterial();
  const skyMesh = new THREE.Mesh(new THREE.PlaneGeometry(5, 3.2), sky);
  skyMesh.position.set(win.cx + 0.3, win.cy + 0.3, ROOM.back - 1.8);
  group.add(skyMesh);
  anim.push((t) => { sky.uniforms.time.value = t; });

  const curtainGeo = new THREE.PlaneGeometry(0.34, 1.28, 48, 1);
  const cp = curtainGeo.attributes.position;
  for (let i = 0; i < cp.count; i++) {
    const x = cp.getX(i);
    cp.setZ(i, Math.sin(x * 52) * 0.018 + Math.sin(x * 23 + 1) * 0.01);
  }
  curtainGeo.computeVertexNormals();
  for (const side of [-1, 1]) {
    const c = mesh(curtainGeo, mats.curtain);
    c.position.set(win.cx + side * (win.w / 2 + 0.16), win.cy + 0.06, ROOM.back + 0.06);
    group.add(c);
  }
  const rod = cylinderBetween(V(win.cx - 0.7, win.cy + 0.71, ROOM.back + 0.07), V(win.cx + 0.7, win.cy + 0.71, ROOM.back + 0.07), 0.008, 16, mats.brass);
  group.add(rod);

  const rand = rng(7);
  const shelfMat = mats.walnut;
  const spine = bookSpineTexture();
  const bookColors = ['#7a2f2a', '#28405e', '#c79a3a', '#2f4d3a', '#e6dcc6', '#5c3b2a', '#8c6c4a', '#3b2f45', '#a84d32', '#6a7b6b'];
  const bookMats = bookColors.map((c) => new THREE.MeshStandardMaterial({ color: c, map: spine, roughness: 0.75 }));
  const shelves = [
    { y: 0.6, x0: -1.25, x1: -0.3 },
    { y: 0.98, x0: -1.25, x1: -0.3 },
  ];
  for (const s of shelves) {
    const w = s.x1 - s.x0;
    const shelf = mesh(new RoundedBoxGeometry(w, 0.028, 0.2, 2, 0.006), shelfMat);
    shelf.position.set((s.x0 + s.x1) / 2, s.y, ROOM.back + 0.1);
    group.add(shelf);
    for (const bx of [s.x0 + 0.08, s.x1 - 0.08]) {
      const br = mesh(new THREE.BoxGeometry(0.012, 0.09, 0.16), mats.brass);
      br.position.set(bx, s.y - 0.055, ROOM.back + 0.085);
      group.add(br);
    }
  }
  const fillBooks = (s, from, to, lean = true) => {
    let x = from;
    while (x < to) {
      const th = 0.02 + rand() * 0.028;
      const h = 0.15 + rand() * 0.09;
      const d = 0.13 + rand() * 0.04;
      if (x + th > to) break;
      const b = mesh(new RoundedBoxGeometry(th, h, d, 1, 0.002), bookMats[Math.floor(rand() * bookMats.length)]);
      b.position.set(x + th / 2, s.y + 0.014 + h / 2, ROOM.back + 0.11 - (0.17 - d) / 2);
      group.add(b);
      x += th + 0.002;
    }
    if (lean) {
      const th = 0.03;
      const h = 0.21;
      const b = mesh(new RoundedBoxGeometry(th, h, 0.15, 1, 0.002), bookMats[3]);
      b.rotation.z = -0.32;
      b.position.set(x + 0.04, s.y + 0.014 + h / 2 - 0.012, ROOM.back + 0.11);
      group.add(b);
    }
  };
  fillBooks(shelves[0], -1.22, -0.72);
  fillBooks(shelves[1], -0.95, -0.62);
  for (let i = 0; i < 4; i++) {
    const th = 0.03 + rand() * 0.012;
    const b = mesh(new RoundedBoxGeometry(0.2 + rand() * 0.04, th, 0.15, 1, 0.002), bookMats[(i * 3) % bookMats.length]);
    b.position.set(-0.5, shelves[0].y + 0.014 + th / 2 + i * 0.036, ROOM.back + 0.1);
    b.rotation.y = (rand() - 0.5) * 0.2;
    group.add(b);
  }

  const potPts = [[0.0, 0], [0.045, 0], [0.05, 0.004], [0.058, 0.085], [0.064, 0.09], [0.064, 0.1], [0.056, 0.1]].map(([r, y]) => new THREE.Vector2(r, y));
  const makePlant = (x, y, z, scale = 1, leaves = 9, seed = 3) => {
    const g = new THREE.Group();
    g.add(mesh(new THREE.LatheGeometry(potPts, 48), mats.terracotta));
    const soil = mesh(new THREE.CircleGeometry(0.055, 32), mats.soil);
    soil.rotation.x = -Math.PI / 2;
    soil.position.y = 0.09;
    g.add(soil);
    const r2 = rng(seed);
    for (let i = 0; i < leaves; i++) {
      const hgt = 0.16 + r2() * 0.18;
      const width = 0.018 + r2() * 0.012;
      const lg = new THREE.PlaneGeometry(width, hgt, 2, 16);
      const lp = lg.attributes.position;
      for (let k = 0; k < lp.count; k++) {
        const ly = lp.getY(k) / hgt + 0.5;
        const taper = Math.sin(Math.PI * Math.min(1, ly * 1.05)) * (1 - ly * 0.6);
        lp.setX(k, lp.getX(k) * taper * 2);
        lp.setZ(k, Math.pow(ly, 2) * 0.03 + Math.abs(lp.getX(k)) * 0.6);
        lp.setY(k, ly * hgt);
      }
      lg.computeVertexNormals();
      const leaf = mesh(lg, mats.leaf);
      const a = (i / leaves) * Math.PI * 2 + r2() * 0.5;
      leaf.position.set(Math.cos(a) * 0.02, 0.085, Math.sin(a) * 0.02);
      leaf.rotation.set((r2() - 0.5) * 0.35, -a + Math.PI / 2, (r2() - 0.5) * 0.25);
      g.add(leaf);
    }
    g.position.set(x, y, z);
    g.scale.setScalar(scale);
    group.add(g);
    return g;
  };
  makePlant(0.74, 0, -0.3, 1.25, 11, 5);
  makePlant(-0.4, shelves[1].y + 0.014, ROOM.back + 0.1, 0.8, 8, 9);

  const candle = new THREE.Group();
  const jarPts = [[0, 0], [0.032, 0], [0.034, 0.004], [0.034, 0.075], [0.03, 0.078]].map(([r, y]) => new THREE.Vector2(r, y));
  candle.add(mesh(new THREE.LatheGeometry(jarPts, 32), mats.jar, { cast: false }));
  const wax = mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.045, 32), mats.candle);
  wax.position.y = 0.024;
  candle.add(wax);
  const flame = new THREE.Mesh(new THREE.SphereGeometry(0.006, 12, 8), mats.flame);
  flame.scale.set(0.7, 1.6, 0.7);
  flame.position.y = 0.058;
  candle.add(flame);
  candle.position.set(-1.12, shelves[1].y + 0.014, ROOM.back + 0.1);
  group.add(candle);
  const candleLight = new THREE.PointLight(0xff9a48, 0.06, 1.2, 2);
  candleLight.position.set(-1.12, shelves[1].y + 0.09, ROOM.back + 0.13);
  group.add(candleLight);
  const flick = makeNoise(99);
  anim.push((t) => {
    const f = 0.75 + flick(t * 7, 0) * 0.5;
    candleLight.intensity = 0.05 * f;
    flame.scale.set(0.7, 1.4 + f * 0.4, 0.7);
  });

  const art = new THREE.Group();
  const frameMat = new THREE.MeshStandardMaterial({ color: 0x1d1a17, roughness: 0.5 });
  const fw = 0.3;
  const fh = 0.4;
  const fr = mesh(new RoundedBoxGeometry(fw, fh, 0.02, 2, 0.004), frameMat);
  art.add(fr);
  const print = mesh(new THREE.PlaneGeometry(fw - 0.05, fh - 0.05), new THREE.MeshStandardMaterial({ map: artPrintTexture(), roughness: 0.8 }));
  print.position.z = 0.0105;
  art.add(print);
  art.position.set(0.18, 0.9, ROOM.back + 0.012);
  art.rotation.z = 0.012;
  group.add(art);

  const fairy = buildFairyLights(mats, V(-1.4, 1.24, ROOM.back + 0.02), V(1.6, 1.27, ROOM.back + 0.02));
  group.add(fairy.group);
  anim.push(fairy.update);

  const lamp = buildLamp(mats);
  group.add(lamp.group);

  const mug = buildMug(mats);
  mug.position.set(0.76, 0, 0.27);
  mug.rotation.y = -0.6;
  group.add(mug);

  const notebook = new THREE.Group();
  const cover = mesh(new RoundedBoxGeometry(0.15, 0.018, 0.21, 2, 0.004), new THREE.MeshPhysicalMaterial({ color: 0x5b2f22, roughness: 0.55, sheen: 0.4, sheenColor: new THREE.Color('#9a5a40') }));
  cover.position.y = 0.009;
  notebook.add(cover);
  const pages = mesh(new THREE.BoxGeometry(0.143, 0.014, 0.203), mats.paper);
  pages.position.set(0.004, 0.009, 0);
  notebook.add(pages);
  const band = mesh(new THREE.BoxGeometry(0.004, 0.0195, 0.212), new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.6 }));
  band.position.set(0.05, 0.009, 0);
  notebook.add(band);
  const pen = new THREE.Group();
  const barrel = mesh(new THREE.CylinderGeometry(0.0055, 0.0055, 0.13, 20), mats.blackMetal);
  barrel.rotation.z = Math.PI / 2;
  pen.add(barrel);
  const capRing = mesh(new THREE.CylinderGeometry(0.0058, 0.0058, 0.006, 20), mats.brass);
  capRing.rotation.z = Math.PI / 2;
  capRing.position.x = 0.03;
  pen.add(capRing);
  const tip = mesh(new THREE.ConeGeometry(0.0055, 0.016, 20), mats.brass);
  tip.rotation.z = -Math.PI / 2;
  tip.position.x = 0.073;
  pen.add(tip);
  pen.position.set(0.02, 0.024, 0.02);
  pen.rotation.y = 0.5;
  notebook.add(pen);
  notebook.position.set(-0.7, 0, 0.27);
  notebook.rotation.y = 0.35;
  group.add(notebook);

  const books = new THREE.Group();
  [[0.24, 0.04, 0.17, 2], [0.22, 0.032, 0.16, 6], [0.2, 0.036, 0.15, 0]].forEach(([w, h, d, c], i) => {
    const b = mesh(new RoundedBoxGeometry(w, h, d, 1, 0.003), bookMats[c]);
    b.position.y = h / 2 + [0, 0.04, 0.072][i];
    b.rotation.y = [0, 0.12, -0.08][i];
    books.add(b);
  });
  books.position.set(0.7, 0, -0.08);
  books.rotation.y = -0.25;
  group.add(books);

  return {
    group,
    lamp,
    window: win,
    room: ROOM,
    update(t) {
      for (const f of anim) f(t);
    },
  };
}

function buildFairyLights(mats, a, b) {
  const group = new THREE.Group();
  const pts = [];
  const n = 120;
  const swags = 3;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const p = a.clone().lerp(b, t);
    const local = (t * swags) % 1;
    p.y -= Math.sin(local * Math.PI) * 0.16;
    p.z += Math.sin(t * Math.PI * 7) * 0.008;
    pts.push(p);
  }
  const curve = new THREE.CatmullRomCurve3(pts);
  const wire = mesh(new THREE.TubeGeometry(curve, 300, 0.0012, 6, false), mats.wire, { cast: false });
  group.add(wire);
  const bulbs = [];
  const count = 36;
  const bulbGeo = new THREE.SphereGeometry(0.0065, 14, 10);
  for (let i = 0; i < count; i++) {
    const p = curve.getPointAt((i + 0.5) / count);
    const m = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffb15e, emissiveIntensity: 8 });
    const bulb = new THREE.Mesh(bulbGeo, m);
    bulb.position.copy(p).add(V(0, -0.009, 0.004));
    bulb.scale.set(1, 1.3, 1);
    group.add(bulb);
    bulbs.push({ m, phase: Math.random() * 20 });
  }
  const glow = new THREE.PointLight(0xffa85a, 0.35, 2.2, 1.6);
  glow.position.set((a.x + b.x) / 2, a.y - 0.15, a.z + 0.25);
  group.add(glow);
  const noise = makeNoise(5);
  return {
    group,
    update(t) {
      for (const b of bulbs) b.m.emissiveIntensity = 6 + noise(t * 0.6 + b.phase, b.phase) * 5;
    },
  };
}

function buildLamp(mats) {
  const group = new THREE.Group();
  const base = new THREE.Vector3(-0.84, 0, -0.33);
  const baseMesh = mesh(new THREE.CylinderGeometry(0.075, 0.085, 0.022, 48), mats.blackMetal);
  baseMesh.position.copy(base).add(V(0, 0.011, 0));
  group.add(baseMesh);
  const baseRing = mesh(new THREE.TorusGeometry(0.08, 0.003, 10, 64), mats.brass);
  baseRing.rotation.x = Math.PI / 2;
  baseRing.position.copy(base).add(V(0, 0.021, 0));
  group.add(baseRing);
  const j1 = base.clone().add(V(0, 0.05, 0));
  const j2 = V(-0.86, 0.64, -0.12);
  const head = V(-0.7, 0.98, 0.16);
  group.add(cylinderBetween(base.clone().add(V(0, 0.02, 0)), j1, 0.012, 20, mats.brass));
  for (const off of [-0.012, 0.012]) {
    group.add(cylinderBetween(j1.clone().add(V(0, 0, off)), j2.clone().add(V(0, 0, off)), 0.0055, 14, mats.blackMetal));
    group.add(cylinderBetween(j2.clone().add(V(0, 0, off)), head.clone().add(V(-0.03, 0.03, off)), 0.0055, 14, mats.blackMetal));
  }
  for (const j of [j1, j2]) {
    const knob = mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.04, 24), mats.brass);
    knob.rotation.x = Math.PI / 2;
    knob.position.copy(j);
    group.add(knob);
  }
  const spring = cylinderBetween(j1.clone().add(V(0.02, 0.02, 0)), j2.clone().add(V(0.02, -0.05, 0)), 0.0025, 8, mats.brass);
  group.add(spring);
  const target = V(0.1, 0.12, 0.1);
  const dir = target.clone().sub(head).normalize();
  const shadePts = [[0.026, 0], [0.03, 0.01], [0.05, 0.05], [0.085, 0.105], [0.09, 0.11]].map(([r, y]) => new THREE.Vector2(r, -y));
  const shadeGroup = new THREE.Group();
  shadeGroup.position.copy(head);
  shadeGroup.quaternion.setFromUnitVectors(V(0, -1, 0), dir);
  const shadeGeo = new THREE.LatheGeometry(shadePts, 64);
  shadeGroup.add(mesh(shadeGeo, mats.shade));
  shadeGroup.add(mesh(shadeGeo, mats.shadeInner, { cast: false }));
  const cap = mesh(new THREE.CylinderGeometry(0.026, 0.03, 0.03, 32), mats.brass);
  cap.position.y = 0.012;
  shadeGroup.add(cap);
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.026, 32, 20), mats.bulb);
  bulb.position.y = -0.045;
  shadeGroup.add(bulb);
  group.add(shadeGroup);

  const spot = new THREE.SpotLight(0xffc68a, 3.6, 4, 0.85, 0.85, 1.1);
  spot.position.copy(head).addScaledVector(dir, 0.04);
  spot.target.position.copy(target);
  spot.castShadow = true;
  spot.shadow.mapSize.set(2048, 2048);
  spot.shadow.camera.near = 0.1;
  spot.shadow.camera.far = 2.5;
  spot.shadow.bias = -0.00012;
  spot.shadow.normalBias = 0.002;
  spot.shadow.radius = 4;
  group.add(spot);
  group.add(spot.target);
  const glow = new THREE.PointLight(0xffbf80, 0.25, 0.8, 2);
  glow.position.copy(head).addScaledVector(dir, 0.08);
  group.add(glow);
  return { group, spot, head };
}

function buildMug(mats) {
  const g = new THREE.Group();
  const outer = [[0, 0], [0.036, 0], [0.04, 0.004], [0.041, 0.09], [0.039, 0.094], [0.036, 0.09], [0.035, 0.008], [0, 0.008]].map(([r, y]) => new THREE.Vector2(r, y));
  g.add(mesh(new THREE.LatheGeometry(outer, 48), mats.ceramic));
  const coffee = mesh(new THREE.CircleGeometry(0.0352, 40), mats.coffee, { cast: false });
  coffee.rotation.x = -Math.PI / 2;
  coffee.position.y = 0.074;
  g.add(coffee);
  const handle = mesh(new THREE.TorusGeometry(0.024, 0.0065, 12, 32, Math.PI * 1.15), mats.ceramic);
  handle.rotation.z = -Math.PI * 0.575;
  handle.position.set(0.04, 0.048, 0);
  g.add(handle);
  return g;
}

export function buildFan(mats, fan) {
  const group = new THREE.Group();
  const hub = V(fan.x, fan.y, fan.z);
  const base = mesh(new THREE.CylinderGeometry(0.045, 0.055, 0.016, 40), mats.blackMetal);
  base.position.set(fan.x - 0.04, 0.008, fan.z);
  group.add(base);
  const baseRing = mesh(new THREE.TorusGeometry(0.05, 0.0025, 8, 48), mats.brass);
  baseRing.rotation.x = Math.PI / 2;
  baseRing.position.set(fan.x - 0.04, 0.016, fan.z);
  group.add(baseRing);
  group.add(cylinderBetween(V(fan.x - 0.04, 0.016, fan.z), V(fan.x - 0.04, fan.y - 0.02, fan.z), 0.007, 16, mats.brass));
  const motor = mesh(new THREE.CapsuleGeometry(0.024, 0.04, 8, 24), mats.blackMetal);
  motor.rotation.z = Math.PI / 2;
  motor.position.set(fan.x - 0.045, fan.y, fan.z);
  group.add(motor);
  const nose = mesh(new THREE.SphereGeometry(0.012, 20, 12), mats.brass);
  nose.position.set(fan.x + 0.012, fan.y, fan.z);
  group.add(nose);
  const rotor = new THREE.Group();
  rotor.position.copy(hub);
  const bladeShape = new THREE.Shape();
  bladeShape.moveTo(0.008, -0.006);
  bladeShape.bezierCurveTo(0.03, -0.022, 0.062, -0.026, 0.064, -0.002);
  bladeShape.bezierCurveTo(0.064, 0.016, 0.03, 0.016, 0.008, 0.006);
  bladeShape.closePath();
  const bladeGeo = new THREE.ExtrudeGeometry(bladeShape, { depth: 0.0015, bevelEnabled: false, curveSegments: 16 });
  for (let i = 0; i < 4; i++) {
    const blade = mesh(bladeGeo, mats.brass);
    blade.rotation.set(0.35, 0, (i / 4) * Math.PI * 2);
    const holder = new THREE.Group();
    holder.add(blade);
    holder.rotation.y = Math.PI / 2;
    rotor.add(holder);
  }
  group.add(rotor);
  const cage = new THREE.Group();
  cage.position.copy(hub);
  cage.rotation.y = Math.PI / 2;
  const wireMat = mats.blackMetal;
  for (const [r, z] of [[0.074, 0], [0.055, 0.014], [0.034, 0.022], [0.074, -0.012], [0.05, -0.022]]) {
    const ring = mesh(new THREE.TorusGeometry(r, 0.0011, 6, 64), wireMat, { cast: false });
    ring.position.z = z;
    cage.add(ring);
  }
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    const pts = [V(0, 0, 0.026), V(Math.cos(a) * 0.034, Math.sin(a) * 0.034, 0.022), V(Math.cos(a) * 0.055, Math.sin(a) * 0.055, 0.014), V(Math.cos(a) * 0.074, Math.sin(a) * 0.074, 0), V(Math.cos(a) * 0.05, Math.sin(a) * 0.05, -0.022)];
    const c = new THREE.CatmullRomCurve3(pts);
    cage.add(mesh(new THREE.TubeGeometry(c, 20, 0.001, 5, false), wireMat, { cast: false }));
  }
  const badge = mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.002, 24), mats.brass);
  badge.rotation.x = Math.PI / 2;
  badge.position.z = 0.027;
  cage.add(badge);
  group.add(cage);
  let speed = 0;
  return {
    group,
    update(dt, on) {
      const targetSpeed = on ? 38 : 0;
      speed += (targetSpeed - speed) * Math.min(1, dt * (on ? 1.2 : 0.6));
      rotor.rotation.x += speed * dt;
      return speed / 38;
    },
  };
}
