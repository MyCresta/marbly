import * as THREE from 'three';
import { linePoints, buildPath, troughProfile, sweepLoop, sweepOpenCollider } from '../track.js';
import { CourseBuilder, V, cylinderBetween, lathe, trimeshFromGeometry, mergeAll } from './kit.js';

export const OBST = {
  zP: -0.2,
  plinko: { x0: -0.62, x1: -0.3, top: 0.82, funnelY: 0.535, gapY: 0.5, gapX: -0.45, gap: 0.05, half: 0.0185 },
  wheel: { x: -0.09, y: 0.375, r: 0.062, hub: 0.012, paddles: 6 },
  rocker: { x: 0.24, y: 0.19, len: 0.18, limit: 0.27, ridge: 0.024 },
  board: { x: 0.12, w: 0.15, z0: -0.25, z1: 0.24, y0: 0.128, slope: Math.tan(THREE.MathUtils.degToRad(10)) },
  ramp: { x: 0.36, z0: -0.25, z1: -0.05, y0: 0.15, y1: 0.112, w: 0.11 },
  pad: { z: 0.04, y: 0.022, w: 0.11, d: 0.11, tilt: THREE.MathUtils.degToRad(8) },
};

export function buildObstacles() {
  const O = OBST;
  const zP = O.zP;
  const b = new CourseBuilder({
    id: 'gadgets',
    name: 'Gadgets',
    blurb: 'Plinko, a paddle wheel, a flip-flop see-saw, bumpers and a trampoline',
  });
  const mechanisms = [];
  const acrylic = [];
  const walnut = [];
  const brassParts = [];

  const P = O.plinko;
  const pcx = (P.x0 + P.x1) / 2;
  const pw = P.x1 - P.x0;
  const slab = P.half;
  const ph = P.top - P.gapY + 0.03;
  const pcy = P.gapY - 0.03 + ph / 2;
  b.box(pw + 0.012, ph, 0.006, pcx, pcy, zP - slab - 0.003, { list: walnut, friction: 0.3, restitution: 0.3 });
  b.box(pw + 0.012, ph, 0.004, pcx, pcy, zP + slab + 0.002, { list: acrylic, friction: 0.2, restitution: 0.3 });
  for (const sx of [P.x0 - 0.003, P.x1 + 0.003]) b.box(0.006, ph, slab * 2 + 0.012, sx, pcy, zP, { list: walnut, friction: 0.3, restitution: 0.3 });
  const pegs = [];
  const rows = [0.765, 0.725, 0.685, 0.645, 0.605, 0.565];
  rows.forEach((y, r) => {
    const xs = [];
    if (r % 2 === 0) for (let k = 0; k < 6; k++) xs.push(-0.58 + k * 0.05);
    else for (let k = 0; k < 5; k++) xs.push(-0.555 + k * 0.05);
    for (const x of xs) b.pegZ(x, y, zP, 0.0035, slab * 2 + 0.004, { list: pegs, restitution: 0.45 });
  });
  b.addPiece(mergeAll(pegs), 'brass', { name: 'pegs' });
  const funnelBoard = (xa, ya, xb, yb) => {
    const len = Math.hypot(xb - xa, yb - ya);
    const ang = Math.atan2(yb - ya, xb - xa);
    b.box(len, 0.006, slab * 2 + 0.004, (xa + xb) / 2, (ya + yb) / 2 - 0.003, zP, { list: walnut, rotZ: ang, friction: 0.3, restitution: 0.2 });
  };
  funnelBoard(P.x0, P.funnelY, P.gapX - P.gap / 2, P.gapY);
  funnelBoard(P.gapX + P.gap / 2, P.gapY, P.x1, P.funnelY);
  const spawn = b.hopper({ x: -0.46, z: zP, top: P.top + 0.07, bottom: P.top + 0.026, rTop: 0.035, rBottom: 0.0165 });
  for (const sx of [P.x0 - 0.003, P.x1 + 0.003]) {
    b.supports.push(cylinderBetween(V(sx, 0, zP - 0.03), V(sx, pcy - ph / 2, zP - 0.03), 0.006, 16));
    b.foot(sx, zP - 0.03);
  }
  for (const ang of [0.6, 0.6 + 2.09, 0.6 + 4.19]) {
    const top = V(-0.46 + Math.cos(ang) * 0.03, P.top + 0.065, zP + Math.sin(ang) * 0.03);
    const foot = V(-0.46 + Math.cos(ang) * 0.06, P.top - 0.005, zP + Math.sin(ang) * 0.02);
    b.brass.push(cylinderBetween(foot, top, 0.0018, 8));
  }

  const W = O.wheel;
  const chanA = buildPath(linePoints(V(P.gapX - 0.07, 0.474, zP), V(W.x - W.r - 0.035, 0.446, zP), 0.01), { fixedBank: 0 });
  b.channel(chanA, { startCap: true, name: 'channel-a' });
  b.post(chanA, Math.floor(chanA.points.length * 0.4));
  const chanB = buildPath(linePoints(V(W.x - 0.15, 0.304, zP), V(O.rocker.x - 0.03, 0.272, zP), 0.01), { fixedBank: 0 });
  b.channel(chanB, { startCap: true, name: 'channel-b' });
  b.post(chanB, 4);
  b.post(chanB, chanB.points.length - 3);

  const paddleW = W.r - W.hub;
  const wheelCols = [{ kind: 'cylinder', halfHeight: 0.016, radius: W.hub, pos: [0, 0, 0], rot: qx(Math.PI / 2) }];
  const wheelGeos = [];
  const hubGeo = new THREE.CylinderGeometry(W.hub, W.hub, 0.034, 24);
  hubGeo.rotateX(Math.PI / 2);
  for (let i = 0; i < W.paddles; i++) {
    const a = (i / W.paddles) * Math.PI * 2;
    const cx = Math.cos(a) * (W.hub + paddleW / 2);
    const cy = Math.sin(a) * (W.hub + paddleW / 2);
    const q = new THREE.Quaternion().setFromAxisAngle(V(0, 0, 1), a);
    wheelCols.push({ kind: 'cuboid', half: [paddleW / 2, 0.002, 0.015], pos: [cx, cy, 0], rot: [q.x, q.y, q.z, q.w], friction: 0.5, restitution: 0.15 });
    const g = new THREE.BoxGeometry(paddleW, 0.004, 0.03);
    g.applyQuaternion(q);
    g.translate(cx, cy, 0);
    wheelGeos.push(g);
  }
  mechanisms.push({
    id: 'wheel',
    pivot: [W.x, W.y, zP],
    axis: [0, 0, 1],
    damping: 0.25,
    density: 500,
    colliders: wheelCols,
    pieces: [{ geometry: mergeAll(wheelGeos), material: 'maple' }, { geometry: hubGeo, material: 'brass' }],
  });
  const plateR = W.r + 0.02;
  for (const [dz, list] of [[-0.021, walnut], [0.021, acrylic]]) {
    const g = new THREE.CylinderGeometry(plateR, plateR, 0.004, 48);
    g.rotateX(Math.PI / 2);
    g.translate(W.x, W.y, zP + dz);
    list.push(g);
    b.colliders.push({ kind: 'cylinder', halfHeight: 0.002, radius: plateR, pos: [W.x, W.y, zP + dz], rot: qx(Math.PI / 2), friction: 0.2, restitution: 0.2, tag: 'plate' });
  }
  const axle = new THREE.CylinderGeometry(0.004, 0.004, 0.06, 12);
  axle.rotateX(Math.PI / 2);
  axle.translate(W.x, W.y, zP);
  brassParts.push(axle);
  for (const sx of [-1, 1]) {
    b.supports.push(cylinderBetween(V(W.x + sx * 0.05, 0, zP - 0.03), V(W.x, W.y, zP - 0.03), 0.006, 14));
    b.foot(W.x + sx * 0.05, zP - 0.03);
  }

  const Rk = O.rocker;
  const half = Rk.len / 2;
  const fTop = 0.262;
  const fBottom = 0.236;
  const fPts = [];
  for (let i = 0; i <= 10; i++) {
    const t = i / 10;
    fPts.push([0.0165 + (0.034 - 0.0165) * Math.pow(t, 1.4), fBottom + (fTop - fBottom) * t]);
  }
  const fun = lathe(fPts.slice().reverse(), 48);
  fun.translate(Rk.x, 0, zP);
  b.addPiece(fun, 'brass', { name: 'flip-funnel' });
  b.addTrimesh(trimeshFromGeometry(lathe(fPts, 48).translate(Rk.x, 0, zP)), 0.4, 0.2, 'hopper');
  const plank = new THREE.BoxGeometry(Rk.len, 0.006, 0.03);
  plank.translate(0, 0.003, 0);
  const ridge = new THREE.BoxGeometry(0.004, Rk.ridge, 0.03);
  ridge.translate(0, 0.006 + Rk.ridge / 2, 0);
  mechanisms.push({
    id: 'rocker',
    pivot: [Rk.x, Rk.y, zP],
    axis: [0, 0, 1],
    limits: [-Rk.limit, Rk.limit],
    initialAngle: Rk.limit,
    damping: 1.2,
    density: 700,
    colliders: [
      { kind: 'cuboid', half: [half, 0.003, 0.015], pos: [0, 0.003, 0], friction: 0.45, restitution: 0.1 },
      { kind: 'cuboid', half: [0.002, Rk.ridge / 2, 0.015], pos: [0, 0.006 + Rk.ridge / 2, 0], friction: 0.3, restitution: 0.1, density: 2500 },
    ],
    pieces: [{ geometry: plank, material: 'walnut' }, { geometry: ridge, material: 'brass' }],
  });
  for (const [dz, list] of [[-0.021, walnut], [0.021, acrylic]]) {
    b.box(Rk.len + 0.03, 0.1, 0.004, Rk.x, Rk.y + 0.015, zP + dz, { list, friction: 0.2, restitution: 0.2 });
  }
  const pin = new THREE.CylinderGeometry(0.004, 0.004, 0.05, 12);
  pin.rotateX(Math.PI / 2);
  pin.translate(Rk.x, Rk.y, zP);
  brassParts.push(pin);
  b.supports.push(cylinderBetween(V(Rk.x, 0, zP - 0.03), V(Rk.x, Rk.y + 0.05, zP - 0.03), 0.006, 14));
  b.foot(Rk.x, zP - 0.03);

  const B = O.board;
  const boardPath = buildPath(linePoints(V(B.x, B.y0, B.z0), V(B.x, B.y0 - (B.z1 - B.z0) * B.slope, B.z1), 0.01), { fixedBank: 0 });
  const boardProf = troughProfile({ width: B.w, wall: 0.028 });
  b.addPiece(sweepLoop(boardPath, () => boardProf.loop), 'walnut', { name: 'bumper-board' });
  b.addTrimesh(sweepOpenCollider(boardPath, () => boardProf.inner), 0.5, 0, 'track');
  b.box(B.w + 0.01, 0.03, 0.006, B.x, B.y0 + 0.012, B.z0 - 0.003, { material: 'walnut', friction: 0.4, restitution: 0.3 });
  const bumpers = [[-0.03, -0.12], [0.032, -0.04], [-0.028, 0.04], [0.03, 0.11], [-0.01, 0.18]];
  const bumperGeos = [];
  const capGeos = [];
  for (const [dx, z] of bumpers) {
    const x = B.x + dx;
    const floorY = B.y0 - (z - B.z0) * B.slope;
    const g = new THREE.CylinderGeometry(0.011, 0.012, 0.022, 28);
    g.translate(x, floorY + 0.011, z);
    bumperGeos.push(g);
    const cap = new THREE.CylinderGeometry(0.0125, 0.0125, 0.004, 28);
    cap.translate(x, floorY + 0.023, z);
    capGeos.push(cap);
    b.colliders.push({ kind: 'cylinder', halfHeight: 0.014, radius: 0.012, pos: [x, floorY + 0.012, z], friction: 0.2, restitution: 0.6, tag: 'bumper' });
    b.zones.push({ type: 'bumper', x, y: floorY + 0.0125, z, r: 0.012, h: 0.02, kick: 0.75 });
  }
  b.addPiece(mergeAll(bumperGeos), 'bumper', { name: 'bumpers' });
  b.addPiece(mergeAll(capGeos), 'brass', { name: 'bumper-caps' });
  for (const z of [B.z0 + 0.06, B.z1 - 0.05]) {
    const floorY = B.y0 - (z - B.z0) * B.slope;
    for (const dx of [-B.w * 0.3, B.w * 0.3]) {
      b.supports.push(cylinderBetween(V(B.x + dx, 0, z), V(B.x + dx, floorY - 0.004, z), 0.006, 14));
      b.foot(B.x + dx, z);
    }
  }

  const Rp = O.ramp;
  const rampPath = buildPath(linePoints(V(Rp.x, Rp.y0, Rp.z0), V(Rp.x, Rp.y1, Rp.z1), 0.01), { fixedBank: 0 });
  const rampProf = troughProfile({ width: Rp.w, wall: 0.03 });
  b.addPiece(sweepLoop(rampPath, () => rampProf.loop), 'maple', { name: 'ramp' });
  b.addTrimesh(sweepOpenCollider(rampPath, () => rampProf.inner), 0.5, 0, 'track');
  b.box(Rp.w + 0.01, 0.03, 0.006, Rp.x, Rp.y0 + 0.012, Rp.z0 - 0.003, { material: 'maple', friction: 0.4, restitution: 0.3 });
  b.box(0.006, 0.09, 0.08, Rp.x + Rp.w / 2 + 0.006, Rp.y0 + 0.06, zP, { material: 'walnut', friction: 0.3, restitution: 0.2 });
  b.post(rampPath, 3);
  b.post(rampPath, rampPath.points.length - 3);

  const Pd = O.pad;
  b.box(Pd.w, 0.006, Pd.d, Rp.x, Pd.y, Pd.z, { material: 'pad', rotX: Pd.tilt, friction: 0.6, restitution: 1.0, combine: 'multiply', tag: 'pad' });
  const ring = new THREE.TorusGeometry(0.058, 0.004, 10, 4, Math.PI * 2);
  ring.rotateZ(Math.PI / 4);
  ring.scale(Pd.w / 0.082, Pd.d / 0.082, 1);
  ring.rotateX(-Math.PI / 2 + Pd.tilt);
  ring.translate(Rp.x, Pd.y + 0.003, Pd.z);
  brassParts.push(ring);
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const x = Rp.x + sx * (Pd.w / 2 - 0.006);
    const z = Pd.z + sz * (Pd.d / 2 - 0.006);
    const y = Pd.y + Math.sin(Pd.tilt) * sz * (Pd.d / 2 - 0.006);
    brassParts.push(cylinderBetween(V(x, 0, z), V(x, y - 0.003, z), 0.004, 10));
  }

  b.tray({
    x0: B.x - B.w / 2, x1: B.x + B.w / 2, z0: B.z1 + 0.012, z1: 0.43,
    tallSides: { back: 0.035 },
    labels: [{ id: 'bumpers', label: 'Bumpers', range: 'went left' }],
  });
  b.tray({
    x0: Rp.x - 0.06, x1: Rp.x + 0.06, z0: Pd.z + Pd.d / 2 + 0.008, z1: 0.43,
    tallSides: { back: 0.012, front: 0.1 },
    labels: [{ id: 'hop', label: 'Trampoline', range: 'bounced right' }],
    plaqueSide: 'right',
  });

  if (acrylic.length) b.addPiece(mergeAll(acrylic), 'acrylicPane', { name: 'acrylic', castShadow: false });
  if (walnut.length) b.addPiece(mergeAll(walnut), 'walnut', { name: 'frames' });
  if (brassParts.length) b.addPiece(mergeAll(brassParts), 'brass', { name: 'brass-parts' });

  return b.finish({
    spawn,
    dropGap: 1.2,
    mechanisms,
    paths: { main: chanA },
    stages: [
      { id: 'plinkoOut', test: (p) => p.y < P.gapY && p.x < -0.3 && p.y > 0.4 },
      { id: 'wheel', test: (p) => Math.hypot(p.x - W.x, p.y - W.y) < W.r && Math.abs(p.z - zP) < 0.03 },
      { id: 'rocker', test: (p) => Math.abs(p.x - Rk.x) < half && p.y < Rk.y + 0.04 && Math.abs(p.z - zP) < 0.03 },
      { id: 'left', test: (p) => Math.abs(p.x - B.x) < B.w / 2 && p.z > B.z0 + 0.05 },
      { id: 'right', test: (p) => Math.abs(p.x - Rp.x) < 0.05 && p.z > Rp.z0 + 0.05 },
    ],
    views: [
      { id: 'overview', label: 'Overview', pos: [0.02, 0.92, 1.62], target: [-0.06, 0.32, -0.05] },
      { id: 'plinko', label: 'Plinko', pos: [-0.38, 0.72, 0.32], target: [-0.44, 0.64, zP] },
      { id: 'wheel', label: 'Wheel', pos: [0.08, 0.42, 0.28], target: [0.05, 0.3, zP] },
      { id: 'bounce', label: 'Bumpers', pos: [0.5, 0.36, 0.62], target: [0.22, 0.06, 0.08] },
    ],
  });
}

function qx(a) {
  const q = new THREE.Quaternion().setFromAxisAngle(V(1, 0, 0), a);
  return [q.x, q.y, q.z, q.w];
}
