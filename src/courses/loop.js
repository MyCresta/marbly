import * as THREE from 'three';
import { linePoints, joinPoints, buildPath, slicePath } from '../track.js';
import { CourseBuilder, V, CHANNEL, nearestIndex } from './kit.js';

export const LOOP = {
  start: { x: -0.64, z: -0.36 },
  loopX: 0.24,
  loopZ: -0.02,
  radius: 0.045,
  bottom: 0.082,
  top: 0.7,
  angle: THREE.MathUtils.degToRad(45),
  ramp: 0.08,
  flat: 0.05,
  dip: 0.003,
  dipBack: 0.13,
  door: 0.034,
  exitLen: 0.13,
  exitSlope: 0.05,
};

const smooth = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

export function buildLoop(params = {}) {
  const L = { ...LOOP, ...params };
  const b = new CourseBuilder({
    id: 'loop',
    name: 'Loop',
    blurb: 'A 45 degree drop into a corkscrew loop, with a trapdoor for stragglers',
  });
  const R = L.radius;
  const yb = L.bottom;
  const yc = yb + R;
  const xc = L.loopX;
  const z0 = L.loopZ;
  const planX = xc - L.start.x;
  const planZ = z0 - L.start.z;
  const planLen = Math.hypot(planX, planZ);
  const u = V(planX / planLen, 0, planZ / planLen);
  const drift = (u.z / u.x) * Math.PI * 2 * R;
  const z1 = z0 + drift;

  const tanA = Math.tan(L.angle);
  const s0 = L.flat;
  const s2 = s0 + (L.top - yb) / tanA;
  const sQ = planLen - L.dipBack;
  if (s2 + L.ramp > sQ - 0.06) throw new Error('loop drop does not fit');
  const slopeAt = (s) => {
    const ramp = smooth((s - s0) / L.ramp) - smooth((s - s2) / L.ramp);
    return s < s2 ? 0.07 + (tanA - 0.07) * ramp : tanA * ramp;
  };
  const ss = [];
  const ys = [];
  const step = 0.004;
  let y = 0;
  for (let s = 0; s <= planLen + 1e-9; s += step) {
    ss.push(s);
    ys.push(y);
    y -= slopeAt(s + step / 2) * step;
  }
  const end = ys[ys.length - 1];
  const approach = ss.map((s, i) => {
    const h = yb + (L.top - yb) * (ys[i] - end) / (0 - end);
    const dip = L.dip * Math.sin(Math.PI * Math.min(1, Math.max(0, (s - sQ + 0.06) / 0.12)));
    return V(L.start.x + u.x * s, h - dip, L.start.z + u.z * s);
  });
  approach[approach.length - 1].set(xc, yb, z0);

  const loopPts = [];
  const n = 170;
  for (let i = 1; i <= n; i++) {
    const phi = (i / n) * Math.PI * 2;
    loopPts.push(V(xc + R * Math.sin(phi), yc - R * Math.cos(phi), z0 + (drift * phi) / (Math.PI * 2)));
  }
  const D2 = V(xc, yb, z1);
  const exitEnd = D2.clone().addScaledVector(u, L.exitLen).setY(yb - L.exitSlope * L.exitLen);
  const raw = joinPoints(approach, loopPts, linePoints(D2, exitEnd, 0.008));
  const path = buildPath(raw, { fixedBank: 0, fixedSide: V(0, 0, 1), ds: 0.0015 });

  const Q = V(L.start.x + u.x * sQ, 0, L.start.z + u.z * sQ);
  let iQ = 0;
  let best = Infinity;
  path.points.forEach((p, i) => {
    const d = Math.hypot(p.x - Q.x, p.z - Q.z);
    if (d < best && p.y < yb + 0.02) { best = d; iQ = i; }
  });
  const iG0 = path.dist.findIndex((d) => d >= path.dist[iQ] - L.door / 2);
  const iG1 = path.dist.findIndex((d) => d >= path.dist[iQ] + L.door / 2);
  const loopStart = nearestIndex(path, V(xc, yb, z0));
  const loopEnd = nearestIndex(path, D2, loopStart + 20);
  b.channel(path, { startCap: true, render: false, door: 'closed' });
  b.channel(slicePath(path, 0, iG0), { startCap: true, name: 'loop', door: 'open', renderStep: 3 });
  b.channel(slicePath(path, iG1, path.points.length - 1), { name: 'loop', door: 'open', renderStep: 3 });
  const doorPieceIndex = b.pieces.length;
  b.channel(slicePath(path, iG0, iG1), { name: 'trapdoor', material: 'brass', collide: false });
  const hinge = path.points[iQ].clone().addScaledVector(path.sides[iQ], -(CHANNEL.radius + CHANNEL.thickness)).addScaledVector(path.normals[iQ], -0.004);

  const spawn = b.hopper({ x: L.start.x + u.x * 0.03, z: L.start.z + u.z * 0.03, top: L.top + 0.06, bottom: L.top + 0.016, feedPath: path });
  b.post(path, 3);
  b.postsAlong(path, { from: 14, to: iG0 - 12, every: 0.17 });
  b.post(path, loopEnd);
  b.postsAlong(path, { from: loopEnd + 20, to: path.points.length - 3, every: 0.12 });

  const topIdx = nearestIndex(path, V(xc, yc + R, z0 + drift / 2), loopStart, loopEnd);
  const topP = path.points[topIdx].clone().addScaledVector(path.normals[topIdx], -(CHANNEL.radius + CHANNEL.thickness));
  const gantryH = topP.y + 0.06;
  const hang = new THREE.CylinderGeometry(0.0035, 0.0035, gantryH - topP.y, 10);
  hang.translate(topP.x, (gantryH + topP.y) / 2, topP.z);
  b.brass.push(hang);
  const gz0 = z0 - 0.07;
  const gz1 = z1 + 0.06;
  for (const gz of [gz0, gz1]) {
    const leg = new THREE.CylinderGeometry(0.0065, 0.0065, gantryH, 16);
    leg.translate(xc, gantryH / 2, gz);
    b.supports.push(leg);
    b.foot(xc, gz);
  }
  const beam = new THREE.CylinderGeometry(0.0065, 0.0065, gz1 - gz0, 16);
  beam.rotateX(Math.PI / 2);
  beam.translate(xc, gantryH, (gz0 + gz1) / 2);
  b.supports.push(beam);

  b.tray({
    x0: Q.x - 0.05, x1: xc + 0.075, z0: Q.z - 0.045, z1: z1 - 0.032,
    wall: 0.03,
    labels: [{ id: 'fell', label: 'Fell', range: 'ran out of speed' }],
  });
  const ex = exitEnd.x + 0.02;
  b.tray({
    x0: ex, x1: Math.max(ex + 0.2, 0.6), z0: exitEnd.z - 0.1, z1: exitEnd.z + 0.12,
    tallSides: { left: 0.03, right: 0.09 },
    labels: [{ id: 'looped', label: 'Looped', range: 'made it round' }],
    plaqueSide: 'right',
  });

  return b.finish({
    spawn,
    dropGap: 1.4,
    stepHz: 480,
    loop: { xc, yc, R, z0, z1 },
    trapdoor: { pieceIndex: doorPieceIndex, center: path.points[iQ].clone(), hinge, axis: path.tangents[iQ].clone() },
    paths: { main: path },
    stages: [
      { id: 'bottom', test: (p) => Math.abs(p.x - xc) < 0.01 && p.y < yb + 0.01 },
      { id: 'top', test: (p) => Math.abs(p.x - xc) < 0.02 && p.y > yc + R * 0.6 },
      { id: 'exit', test: (p) => p.x > xc + 0.06 && p.z > z1 - 0.03 && p.y > 0.04 },
    ],
    views: [
      { id: 'overview', label: 'Overview', pos: [0.0, 0.8, 1.6], target: [-0.06, 0.2, -0.04] },
      { id: 'loop', label: 'Loop', pos: [0.46, 0.24, 0.5], target: [xc, yc - 0.01, (z0 + z1) / 2] },
      { id: 'drop', label: 'Drop', pos: [-0.05, 0.62, 0.45], target: [-0.36, 0.34, -0.25] },
    ],
  });
}
