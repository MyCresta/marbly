import * as THREE from 'three';
import { buildPath, troughProfile, sweepLoop, sweepOpenCollider } from '../track.js';
import { CourseBuilder, V, cylinderBetween, nearestIndex, mergeAll } from './kit.js';

export const RACE = {
  lanes: 9,
  spacing: 0.044,
  xStart: -0.665,
  zA: -0.235,
  xR: 0.42,
  r1: 0.17,
  xL: -0.44,
  r2: 0.115,
  xEnd: 0.37,
  top: 0.6,
  gateD: 0.06,
  laneLen: 0.13,
  finishX: 0.3,
  wall: 0.03,
};

const smooth = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

export function buildRace() {
  const L = RACE;
  const b = new CourseBuilder({
    id: 'race',
    name: 'Race',
    blurb: 'Nine lanes merge into one shared track, first to the arch wins',
  });
  const zB = L.zA + L.r1 * 2;
  const zC = zB + L.r2 * 2;
  const plan = [];
  const line = (ax, az, bx, bz) => {
    const n = Math.ceil(Math.hypot(bx - ax, bz - az) / 0.01);
    for (let i = 0; i <= n; i++) plan.push([ax + ((bx - ax) * i) / n, az + ((bz - az) * i) / n]);
  };
  const arc = (cx, cz, r, a0, a1) => {
    const n = Math.ceil((Math.abs(a1 - a0) * r) / 0.008);
    for (let i = 0; i <= n; i++) {
      const a = a0 + ((a1 - a0) * i) / n;
      plan.push([cx + Math.cos(a) * r, cz + Math.sin(a) * r]);
    }
  };
  line(L.xStart, L.zA, L.xR, L.zA);
  arc(L.xR, L.zA + L.r1, L.r1, -Math.PI / 2, Math.PI / 2);
  line(L.xR, zB, L.xL, zB);
  arc(L.xL, zB + L.r2, L.r2, -Math.PI / 2, -Math.PI * 1.5);
  line(L.xL, zC, L.xEnd, zC);
  const pts = [];
  for (const p of plan) {
    const last = pts[pts.length - 1];
    if (!last || Math.hypot(p[0] - last[0], p[1] - last[1]) > 1e-6) pts.push(p);
  }
  const dists = [0];
  for (let i = 1; i < pts.length; i++) dists.push(dists[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const total = dists[dists.length - 1];
  const slopeAt = (d) => {
    const steep = smooth((d - L.laneLen) / 0.12) * (1 - smooth((d - 0.55) / 0.15));
    return 0.07 + steep * (0.27 - 0.07) + smooth((d - 0.55) / 0.15) * (0.112 - 0.07);
  };
  const heights = [L.top];
  for (let i = 1; i < pts.length; i++) {
    const dm = (dists[i] + dists[i - 1]) / 2;
    heights.push(heights[i - 1] - slopeAt(dm) * (dists[i] - dists[i - 1]));
  }
  const raw = pts.map((p, i) => V(p[0], heights[i], p[1]));
  const path = buildPath(raw, { designSpeed: 1.0, maxBank: 0.16, bankSmooth: 40, ds: 0.006 });

  const h1 = total - (L.xEnd - L.xL) - Math.PI * L.r2;
  const h0 = (L.xR - L.xStart);
  const widthAt = (d) => {
    const w0 = L.lanes * L.spacing + 0.014;
    if (d < 0.25) return w0;
    if (d < h0) return w0 + (0.3 - w0) * smooth((d - 0.25) / (h0 - 0.25));
    const afterH1 = h0 + Math.PI * L.r1;
    if (d < afterH1) return 0.3;
    if (d < h1) return 0.3 + (0.18 - 0.3) * smooth((d - afterH1) / (h1 - afterH1));
    if (d < h1 + Math.PI * L.r2) return 0.18;
    return 0.18 + (0.13 - 0.18) * smooth((d - h1 - Math.PI * L.r2) / 0.3);
  };
  const profiles = path.dist.map((d) => troughProfile({ width: widthAt(d), wall: L.wall }));
  b.addPiece(sweepLoop(path, (i) => profiles[i].loop), 'maple', { name: 'race-track' });
  b.addTrimesh(sweepOpenCollider(path, (i) => profiles[i].inner), 0.55, 0, 'track');

  const startT = path.tangents[0];
  const slope0 = Math.atan2(-startT.y, Math.hypot(startT.x, startT.z));
  const w0 = widthAt(0);
  const backX = path.points[0].x - 0.004;
  b.box(0.008, L.wall + 0.004, w0 + 0.01, backX, path.points[0].y + L.wall / 2, L.zA, { material: 'walnut', rotZ: -slope0 });

  const floorAt = (d) => {
    const i = path.dist.findIndex((x) => x >= d);
    return path.points[Math.max(0, i)];
  };
  const laneZ = (i) => L.zA + (i - (L.lanes - 1) / 2) * L.spacing;
  const dividers = [];
  const divMid = floorAt(L.laneLen / 2);
  for (let i = 0; i < L.lanes - 1; i++) {
    const z = (laneZ(i) + laneZ(i + 1)) / 2;
    b.box(L.laneLen, 0.02, 0.003, divMid.x, divMid.y + 0.01, z, { list: dividers, rotZ: -slope0, friction: 0.3, restitution: 0.3 });
  }
  b.addPiece(mergeAll(dividers), 'brass', { name: 'lane-dividers' });

  const gateP = floorAt(L.gateD);
  const gateTop = gateP.y + 0.03;
  b.box(0.006, 0.03, w0, gateP.x, gateP.y + 0.015, L.zA, { collide: true, gate: true, friction: 0.3, restitution: 0.1, tag: 'gate' });
  const gateGeo = new THREE.BoxGeometry(0.008, 0.026, w0 + 0.03);
  gateGeo.translate(gateP.x, gateTop - 0.013, L.zA);
  const gatePieceIndex = b.pieces.length;
  b.addPiece(gateGeo, 'brass', { name: 'gate' });
  for (const side of [-1, 1]) {
    const z = L.zA + side * (w0 / 2 + 0.02);
    b.supports.push(cylinderBetween(V(gateP.x, 0, z), V(gateP.x, gateTop + 0.06, z), 0.006, 16));
    b.foot(gateP.x, z);
  }

  for (let i = 8; i < path.points.length - 4; i += 34) {
    const d = path.dist[i];
    const w = widthAt(d);
    const offsets = w > 0.25 ? [-w * 0.32, w * 0.32] : [0];
    for (const o of offsets) {
      const top = path.points[i].clone().addScaledVector(path.sides[i], o).addScaledVector(path.normals[i], -0.005);
      b.supports.push(cylinderBetween(V(top.x, 0, top.z), top, 0.0065, 16));
      b.foot(top.x, top.z);
    }
  }

  const fIdx = nearestIndex(path, V(L.finishX, 0, zC), Math.floor(path.points.length * 0.7));
  const fP = path.points[fIdx];
  const fw = widthAt(path.dist[fIdx]);
  const archH = fP.y + 0.12;
  for (const side of [-1, 1]) {
    const z = zC + side * (fw / 2 + 0.014);
    b.brass.push(cylinderBetween(V(L.finishX, 0, z), V(L.finishX, archH, z), 0.0045, 14));
    b.foot(L.finishX, z);
  }
  b.brass.push(cylinderBetween(V(L.finishX, archH, zC - fw / 2 - 0.014), V(L.finishX, archH, zC + fw / 2 + 0.014), 0.0045, 14));
  const flag = new THREE.BoxGeometry(0.004, 0.026, fw * 0.6);
  flag.translate(L.finishX, archH - 0.02, zC);
  b.addPiece(flag, 'finishFlag', { name: 'finish-flag' });
  const lineGeo = new THREE.BoxGeometry(0.006, 0.0008, fw - 0.02);
  lineGeo.translate(L.finishX, fP.y + 0.0005, zC);
  b.addPiece(lineGeo, 'finishFlag', { name: 'finish-line', castShadow: false });

  const endP = path.points[path.points.length - 1];
  b.tray({
    x0: endP.x + 0.012, x1: 0.6, z0: zC - 0.13, z1: Math.min(0.44, zC + 0.11),
    tallSides: { left: 0.03, right: 0.09 },
    labels: [{ id: 'finish', label: 'Finished', range: 'race results on the left' }],
    plaqueSide: 'right',
  });

  const spawnFor = (i) => {
    const p = floorAt(0.025);
    return V(p.x, p.y + 0.02, laneZ(i % L.lanes));
  };
  return b.finish({
    spawn: spawnFor(4),
    spawnFor,
    finishTest: (p) => p.x > L.finishX && p.z > zC - 0.12 && p.y < fP.y + 0.08,
    race: { finishX: L.finishX, gatePieceIndex, lanes: L.lanes },
    gate: true,
    dropGap: 0,
    paths: { main: path },
    stages: [
      { id: 'merge', test: (p) => p.x > L.xStart + 0.2 && p.z < 0 },
      { id: 'hairpin1', test: (p) => p.x > L.xR && p.z > L.zA + L.r1 },
      { id: 'hairpin2', test: (p) => p.x < L.xL && p.z > zB + L.r2 },
    ],
    views: [
      { id: 'overview', label: 'Overview', pos: [-0.06, 1.05, 1.82], target: [-0.12, 0.25, -0.02] },
      { id: 'start', label: 'Start', pos: [-0.72, 0.98, 0.42], target: [-0.5, 0.56, -0.235] },
      { id: 'finish', label: 'Finish', pos: [0.58, 0.34, 0.75], target: [0.25, 0.12, 0.3] },
    ],
  });
}
