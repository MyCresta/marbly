import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { noiseSurface, makeNoise } from './textures.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

function mesh(geo, mat, { cast = true, receive = true } = {}) {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = cast;
  m.receiveShadow = receive;
  return m;
}

function canvasTexture(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

let shadowTex = null;
function contactShadowTexture() {
  if (shadowTex) return shadowTex;
  shadowTex = canvasTexture(128, 128, (ctx, w, h) => {
    const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    g.addColorStop(0, 'rgba(0,0,0,0.75)');
    g.addColorStop(0.45, 'rgba(0,0,0,0.35)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  });
  shadowTex.colorSpace = THREE.NoColorSpace;
  return shadowTex;
}

export function contactShadow(x, z, rx, rz = rx, opacity = 0.55, rot = 0) {
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(rx * 2, rz * 2),
    new THREE.MeshBasicMaterial({ map: contactShadowTexture(), transparent: true, opacity, depthWrite: false, color: 0x000000 }),
  );
  m.rotation.set(-Math.PI / 2, 0, rot);
  m.position.set(x, 0.0012, z);
  m.renderOrder = 1;
  return m;
}

export function buildClock(mats) {
  const group = new THREE.Group();
  const r = 0.105;
  const face = canvasTexture(512, 512, (ctx, w) => {
    ctx.fillStyle = '#f1e8d6';
    ctx.beginPath();
    ctx.arc(w / 2, w / 2, w / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#2b241d';
    for (let i = 0; i < 60; i++) {
      const a = (i / 60) * Math.PI * 2;
      const major = i % 5 === 0;
      ctx.lineWidth = major ? 7 : 2.5;
      const r0 = w * (major ? 0.38 : 0.42);
      const r1 = w * 0.46;
      ctx.beginPath();
      ctx.moveTo(w / 2 + Math.sin(a) * r0, w / 2 - Math.cos(a) * r0);
      ctx.lineTo(w / 2 + Math.sin(a) * r1, w / 2 - Math.cos(a) * r1);
      ctx.stroke();
    }
    ctx.fillStyle = '#2b241d';
    ctx.font = '500 52px "Fraunces", Georgia, serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    [[12, 0], [3, 0.25], [6, 0.5], [9, 0.75]].forEach(([n, f]) => {
      const a = f * Math.PI * 2;
      ctx.fillText(String(n), w / 2 + Math.sin(a) * w * 0.3, w / 2 - Math.cos(a) * w * 0.3 + 3);
    });
    ctx.font = '500 18px "Manrope", Arial, sans-serif';
    ctx.letterSpacing = '6px';
    ctx.fillText('MARBLY', w / 2, w * 0.66);
  });
  const faceMesh = mesh(new THREE.CircleGeometry(r, 64), new THREE.MeshStandardMaterial({ map: face, roughness: 0.7 }), { cast: false });
  faceMesh.position.z = 0.0128;
  group.add(faceMesh);
  const body = mesh(new THREE.CylinderGeometry(r + 0.012, r + 0.012, 0.024, 64), mats.blackMetal);
  body.rotation.x = Math.PI / 2;
  group.add(body);
  const bezel = mesh(new THREE.TorusGeometry(r + 0.006, 0.006, 16, 96), mats.brass);
  bezel.position.z = 0.0135;
  group.add(bezel);
  const glass = mesh(new THREE.CircleGeometry(r + 0.002, 64), mats.glassPane, { cast: false, receive: false });
  glass.position.z = 0.019;
  group.add(glass);
  const handMat = new THREE.MeshStandardMaterial({ color: 0x1d1813, roughness: 0.4, metalness: 0.4 });
  const hand = (len, width, z, mat = handMat) => {
    const g = new THREE.BoxGeometry(width, len, 0.0015);
    g.translate(0, len / 2 - 0.012, 0);
    const m = mesh(g, mat, { cast: false });
    m.position.z = z;
    group.add(m);
    return m;
  };
  const hourHand = hand(r * 0.55, 0.007, 0.0135);
  const minuteHand = hand(r * 0.8, 0.0045, 0.0145);
  const secondHand = hand(r * 0.88, 0.0016, 0.0155, new THREE.MeshStandardMaterial({ color: 0xa8402a, roughness: 0.4 }));
  const cap = mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.004, 20), mats.brass, { cast: false });
  cap.rotation.x = Math.PI / 2;
  cap.position.z = 0.016;
  group.add(cap);
  let lastSecond = -1;
  let tick = 0;
  return {
    group,
    update(dt, onTick) {
      const now = new Date();
      const s = now.getSeconds();
      const ms = now.getMilliseconds();
      if (s !== lastSecond) {
        lastSecond = s;
        tick = 0;
        if (onTick) onTick();
      }
      tick = Math.min(1, tick + dt * 9);
      const ease = 1 - Math.pow(1 - tick, 3) * Math.cos(tick * 7);
      const sec = s - 1 + Math.min(1.02, ease);
      const min = now.getMinutes() + (s + ms / 1000) / 60;
      const hr = (now.getHours() % 12) + min / 60;
      secondHand.rotation.z = -(sec / 60) * Math.PI * 2;
      minuteHand.rotation.z = -(min / 60) * Math.PI * 2;
      hourHand.rotation.z = -(hr / 12) * Math.PI * 2;
    },
  };
}

export function buildPinboard(mats) {
  const group = new THREE.Group();
  const w = 0.42;
  const h = 0.29;
  const cork = noiseSurface({ w: 512, h: 512, seed: 91, base: '#a87b4f', varColor: '#c89a68', scale: 128, octaves: 3, roughBase: 0.95, roughVar: 0.05, normalStrength: 2.5, fiber: 0.5 });
  for (const t of Object.values(cork)) t.repeat.set(1.4, 1);
  const board = mesh(new THREE.BoxGeometry(w, h, 0.012), new THREE.MeshStandardMaterial({ ...cork, color: 0xffffff }));
  group.add(board);
  const frameMat = mats.walnut;
  for (const [fw, fh, x, y] of [[w + 0.03, 0.016, 0, h / 2 + 0.008], [w + 0.03, 0.016, 0, -h / 2 - 0.008], [0.016, h, -w / 2 - 0.007, 0], [0.016, h, w / 2 + 0.007, 0]]) {
    const f = mesh(new RoundedBoxGeometry(fw, fh, 0.02, 1, 0.003), frameMat);
    f.position.set(x, y, 0.003);
    group.add(f);
  }
  const notes = [
    { x: -0.13, y: 0.05, w: 0.085, h: 0.085, rot: 0.08, color: '#f4d77a', lines: 4 },
    { x: -0.02, y: 0.07, w: 0.09, h: 0.075, rot: -0.05, color: '#f0eadf', lines: 5 },
    { x: 0.13, y: 0.03, w: 0.1, h: 0.12, rot: 0.04, photo: true },
    { x: -0.1, y: -0.08, w: 0.11, h: 0.07, rot: -0.03, color: '#b9d4c4', lines: 3 },
    { x: 0.03, y: -0.075, w: 0.075, h: 0.075, rot: 0.11, color: '#f3b8a4', lines: 3 },
  ];
  const pinMats = ['#c0392b', '#2e5e8c', '#d8a531', '#3d7a52'].map((c) => new THREE.MeshPhysicalMaterial({ color: c, roughness: 0.25, clearcoat: 1 }));
  notes.forEach((n, i) => {
    const tex = canvasTexture(256, Math.round((256 * n.h) / n.w), (ctx, cw, ch) => {
      if (n.photo) {
        ctx.fillStyle = '#f6f2ea';
        ctx.fillRect(0, 0, cw, ch);
        const g = ctx.createLinearGradient(0, 0, 0, ch * 0.75);
        g.addColorStop(0, '#f2b47a');
        g.addColorStop(0.55, '#d0705a');
        g.addColorStop(1, '#3c4a5e');
        ctx.fillStyle = g;
        ctx.fillRect(cw * 0.07, cw * 0.07, cw * 0.86, ch * 0.68);
        ctx.fillStyle = '#26313f';
        ctx.beginPath();
        ctx.moveTo(cw * 0.07, ch * 0.62);
        for (let x = 0; x <= 1; x += 0.1) ctx.lineTo(cw * (0.07 + 0.86 * x), ch * (0.55 + 0.06 * Math.sin(x * 9)));
        ctx.lineTo(cw * 0.93, ch * 0.75);
        ctx.lineTo(cw * 0.07, ch * 0.75);
        ctx.fill();
        ctx.fillStyle = '#fbe6b8';
        ctx.beginPath();
        ctx.arc(cw * 0.66, ch * 0.3, cw * 0.07, 0, Math.PI * 2);
        ctx.fill();
        return;
      }
      ctx.fillStyle = n.color;
      ctx.fillRect(0, 0, cw, ch);
      ctx.strokeStyle = 'rgba(40,40,60,0.75)';
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      const noise = makeNoise(31 + i);
      for (let l = 0; l < n.lines; l++) {
        const y = ch * (0.22 + (l * 0.62) / Math.max(1, n.lines - 1));
        const len = 0.45 + noise(l * 3.1, i) * 0.4;
        ctx.beginPath();
        for (let x = 0; x <= len; x += 0.02) {
          const px = cw * (0.12 + x);
          const py = y + Math.sin(x * 60 + l * 2) * 3 + (noise(x * 18, l + i * 7) - 0.5) * 7;
          if (x === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.stroke();
      }
    });
    const paper = mesh(new THREE.PlaneGeometry(n.w, n.h), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85, side: THREE.DoubleSide }), { cast: false });
    paper.position.set(n.x, n.y, 0.0075 + i * 0.0004);
    paper.rotation.z = n.rot;
    group.add(paper);
    const pin = mesh(new THREE.SphereGeometry(0.0045, 16, 12), pinMats[i % pinMats.length], { cast: true });
    pin.position.set(n.x + Math.sin(n.rot) * 0, n.y + n.h * 0.38, 0.012);
    group.add(pin);
  });
  return group;
}

export function buildSteam() {
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: { time: { value: 0 }, seed: { value: 0 } },
    vertexShader: `
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
    `,
    fragmentShader: `
      varying vec2 vUv;
      uniform float time;
      uniform float seed;
      float h(vec2 p) { return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }
      float n(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(h(i), h(i + vec2(1.0, 0.0)), f.x), mix(h(i + vec2(0.0, 1.0)), h(i + vec2(1.0, 1.0)), f.x), f.y);
      }
      void main() {
        vec2 uv = vUv;
        float t = time * 0.35 + seed;
        float sway = (n(vec2(uv.y * 2.0 - t, seed)) - 0.5) * 0.5 * uv.y;
        float x = uv.x - 0.5 - sway;
        float wisp = n(vec2(x * 6.0 + seed, uv.y * 3.0 - t * 1.6)) * n(vec2(x * 3.0 - seed, uv.y * 1.5 - t));
        float width = mix(0.12, 0.3, uv.y);
        float core = smoothstep(width, 0.0, abs(x));
        float fade = smoothstep(0.0, 0.15, uv.y) * smoothstep(1.0, 0.45, uv.y);
        float a = core * fade * smoothstep(0.15, 0.6, wisp) * 0.22;
        gl_FragColor = vec4(vec3(1.0, 0.97, 0.92), a);
      }
    `,
  });
  const group = new THREE.Group();
  const mats = [];
  for (let i = 0; i < 2; i++) {
    const m = mat.clone();
    m.uniforms.seed.value = i * 7.3;
    mats.push(m);
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(0.07, 0.16), m);
    plane.position.y = 0.08;
    plane.rotation.y = (i * Math.PI) / 2;
    plane.renderOrder = 2;
    group.add(plane);
  }
  return {
    group,
    update(t) {
      for (const m of mats) m.uniforms.time.value = t;
    },
  };
}

export function buildDustMotes(head, target, count = 70) {
  const dir = target.clone().sub(head);
  const len = dir.length();
  dir.normalize();
  const side = new THREE.Vector3().crossVectors(dir, V(0, 1, 0)).normalize();
  const up = new THREE.Vector3().crossVectors(side, dir).normalize();
  const positions = new Float32Array(count * 3);
  const phase = new Float32Array(count);
  const parts = [];
  for (let i = 0; i < count; i++) {
    const t = 0.15 + Math.random() * 0.75;
    const rad = Math.tan(0.55) * t * len * Math.sqrt(Math.random());
    const a = Math.random() * Math.PI * 2;
    parts.push({ t, rad, a, speed: 0.02 + Math.random() * 0.03, bob: Math.random() * 10 });
    phase[i] = Math.random() * 10;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('phase', new THREE.BufferAttribute(phase, 1));
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { time: { value: 0 }, scale: { value: 1 } },
    vertexShader: `
      attribute float phase;
      varying float vTw;
      uniform float time;
      uniform float scale;
      void main() {
        vTw = 0.4 + 0.6 * pow(0.5 + 0.5 * sin(time * 1.3 + phase * 5.0), 3.0);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = 1.6 * scale / -mv.z;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: `
      varying float vTw;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        gl_FragColor = vec4(vec3(1.0, 0.86, 0.62), smoothstep(0.5, 0.0, d) * vTw * 0.35);
      }
    `,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  const p = new THREE.Vector3();
  return {
    points,
    update(time, dt, pixelScale) {
      mat.uniforms.time.value = time;
      mat.uniforms.scale.value = pixelScale;
      parts.forEach((q, i) => {
        q.a += dt * q.speed * 0.6;
        q.t += Math.sin(time * 0.2 + q.bob) * dt * 0.004;
        p.copy(head).addScaledVector(dir, q.t * len)
          .addScaledVector(side, Math.cos(q.a) * q.rad)
          .addScaledVector(up, Math.sin(q.a) * q.rad + Math.sin(time * 0.3 + q.bob) * 0.01);
        positions[i * 3] = p.x;
        positions[i * 3 + 1] = p.y;
        positions[i * 3 + 2] = p.z;
      });
      geo.attributes.position.needsUpdate = true;
    },
  };
}

export function buildPencilCup(mats) {
  const group = new THREE.Group();
  const pts = [[0, 0], [0.032, 0], [0.034, 0.003], [0.034, 0.095], [0.031, 0.095], [0.031, 0.006], [0, 0.006]].map(([r, y]) => new THREE.Vector2(r, y));
  group.add(mesh(new THREE.LatheGeometry(pts, 40), mats.ceramicDark));
  const colors = [0xd9a441, 0x2f5f8a, 0x1b1b1b, 0xc4553b, 0xd9a441];
  colors.forEach((c, i) => {
    const a = (i / colors.length) * Math.PI * 2;
    const len = 0.15 + (i % 3) * 0.015;
    const pencil = new THREE.Group();
    const body = mesh(new THREE.CylinderGeometry(0.0038, 0.0038, len, 6), new THREE.MeshStandardMaterial({ color: c, roughness: 0.5 }));
    body.position.y = len / 2;
    pencil.add(body);
    const tip = mesh(new THREE.ConeGeometry(0.0038, 0.014, 6), new THREE.MeshStandardMaterial({ color: 0xe8cfa6, roughness: 0.8 }));
    tip.position.y = len + 0.007;
    pencil.add(tip);
    pencil.position.set(Math.cos(a) * 0.014, 0.008, Math.sin(a) * 0.014);
    pencil.rotation.set(Math.sin(a) * 0.16, 0, -Math.cos(a) * 0.16);
    group.add(pencil);
  });
  return group;
}

export function buildGlasses(mats) {
  const group = new THREE.Group();
  const rim = mats.blackMetal;
  const lensMat = mats.glassPane;
  for (const side of [-1, 1]) {
    const ring = mesh(new THREE.TorusGeometry(0.021, 0.0022, 10, 40), rim);
    ring.scale.set(1.15, 0.85, 1);
    ring.position.set(side * 0.03, 0, 0);
    group.add(ring);
    const lens = mesh(new THREE.CircleGeometry(0.021, 32), lensMat, { cast: false });
    lens.scale.set(1.15, 0.85, 1);
    lens.position.set(side * 0.03, 0, 0);
    group.add(lens);
    const temple = mesh(new THREE.BoxGeometry(0.003, 0.003, 0.11), rim);
    temple.position.set(side * 0.055, 0.004, -0.052);
    temple.rotation.y = side * 0.08;
    group.add(temple);
  }
  const bridge = mesh(new THREE.TorusGeometry(0.008, 0.0018, 8, 16, Math.PI), rim);
  bridge.position.y = 0.006;
  group.add(bridge);
  group.rotation.x = -Math.PI / 2 + 0.25;
  const holder = new THREE.Group();
  holder.add(group);
  group.position.y = 0.012;
  return holder;
}

export function buildCable(points, mats) {
  const curve = new THREE.CatmullRomCurve3(points);
  return mesh(new THREE.TubeGeometry(curve, 80, 0.0028, 8, false), mats.wire);
}
