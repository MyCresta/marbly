import * as THREE from 'three';
import { buildPath } from '../track.js';
import { CourseBuilder, V, CHANNEL, BOTTOM_OFFSET, cylinderBetween } from './kit.js';

export const RACE = {
  lanes: 9,
  spacing: 0.05,
  x0: -0.665,
  gateX: -0.6,
  dropEnd: -0.36,
  startY: 0.27,
  dropY: 0.195,
  endX: 0.4,
  slope: 0.07,
  finishX: 0.33,
  humps: [{ x: -0.2, h: 0.008, w: 0.18 }],
};

export function laneHeight(x, L = RACE) {
  if (x <= L.gateX) return L.startY + (L.gateX - x) * 0.035;
  if (x <= L.dropEnd) {
    const t = (x - L.gateX) / (L.dropEnd - L.gateX);
    return L.startY - (L.startY - L.dropY) * (1 - Math.cos(Math.PI * t)) / 2;
  }
  let y = L.dropY - (x - L.dropEnd) * L.slope;
  for (const h of L.humps) {
    const u = (x - h.x) / h.w;
    if (Math.abs(u) < 0.5) y += h.h * (1 + Math.cos(2 * Math.PI * u)) / 2;
  }
  return y;
}

export function buildRace() {
  const L = RACE;
  const b = new CourseBuilder({
    id: 'race',
    name: 'Race',
    blurb: 'Nine lanes, one of each marble, a gate and a stopwatch',
  });
  const lanes = [];
  const zOf = (i) => (i - (L.lanes - 1) / 2) * L.spacing;
  for (let i = 0; i < L.lanes; i++) {
    const z = zOf(i);
    const raw = [];
    for (let x = L.x0; x <= L.endX + 1e-6; x += 0.006) raw.push(V(x, laneHeight(x) + CHANNEL.radius, z));
    const path = buildPath(raw, { fixedBank: 0, ds: 0.005 });
    b.channel(path, { startCap: true, material: i % 2 ? 'walnut' : 'maple', name: 'lane' });
    lanes.push({ z, path });
  }

  const beamXs = [L.x0 + 0.02, L.gateX + 0.1, L.dropEnd, -0.08, 0.2, L.endX - 0.02];
  const width = (L.lanes - 1) * L.spacing + 0.05;
  for (const bx of beamXs) {
    const top = laneHeight(bx) + CHANNEL.radius - BOTTOM_OFFSET;
    const beam = new THREE.BoxGeometry(0.022, 0.014, width);
    beam.translate(bx, top - 0.007, 0);
    b.supports.push(beam);
    for (const side of [-1, 1]) {
      const z = side * (width / 2 - 0.012);
      b.supports.push(cylinderBetween(V(bx, 0, z), V(bx, top - 0.012, z), 0.0065, 16));
      b.foot(bx, z);
    }
  }

  const gateTop = laneHeight(L.gateX) + CHANNEL.radius + 0.02;
  b.box(0.006, 0.03, width, L.gateX + 0.003, gateTop - 0.015, 0, { collide: true, gate: true, friction: 0.3, restitution: 0.1, tag: 'gate' });
  const gateGeo = new THREE.BoxGeometry(0.008, 0.026, width + 0.02);
  gateGeo.translate(L.gateX + 0.003, gateTop - 0.013, 0);
  const gatePieceIndex = b.pieces.length;
  b.addPiece(gateGeo, 'brass', { name: 'gate' });
  for (const side of [-1, 1]) {
    const z = side * (width / 2 + 0.016);
    b.supports.push(cylinderBetween(V(L.gateX, 0, z), V(L.gateX, gateTop + 0.06, z), 0.006, 16));
    b.foot(L.gateX, z);
  }

  const archH = laneHeight(L.finishX) + 0.11;
  for (const side of [-1, 1]) {
    const z = side * (width / 2 + 0.016);
    b.brass.push(cylinderBetween(V(L.finishX, 0, z), V(L.finishX, archH, z), 0.0045, 14));
    b.foot(L.finishX, z);
  }
  b.brass.push(cylinderBetween(V(L.finishX, archH, -width / 2 - 0.016), V(L.finishX, archH, width / 2 + 0.016), 0.0045, 14));
  const flagGeo = new THREE.BoxGeometry(0.004, 0.026, width * 0.5);
  flagGeo.translate(L.finishX, archH - 0.02, 0);
  b.addPiece(flagGeo, 'finishFlag', { name: 'finish-flag' });
  for (let i = 0; i < L.lanes; i++) {
    const line = new THREE.BoxGeometry(0.004, 0.0008, 0.03);
    line.translate(L.finishX, laneHeight(L.finishX) + CHANNEL.radius - CHANNEL.radius + 0.0004, zOf(i));
    b.addPiece(line, 'finishFlag', { name: 'finish-line', castShadow: false });
  }

  b.tray({
    x0: L.endX + 0.015, x1: 0.6, z0: -width / 2 - 0.01, z1: width / 2 + 0.01,
    tallSides: { left: 0.03, right: 0.09 },
    labels: [{ id: 'finish', label: 'Finished', range: 'race results above' }],
    plaqueSide: 'right',
  });

  return b.finish({
    spawn: V(L.x0 + 0.025, laneHeight(L.x0 + 0.025) + 0.022, 0),
    spawnFor: (i) => V(L.x0 + 0.025, laneHeight(L.x0 + 0.025) + 0.022, zOf(i % L.lanes)),
    finishTest: (p) => p.x > L.finishX,
    race: { finishX: L.finishX, gateX: L.gateX, gatePieceIndex, lanes: lanes.map((l) => l.z) },
    gate: true,
    dropGap: 0,
    paths: { main: lanes[0].path },
    stages: [{ id: 'drop', test: (p) => p.x > L.dropEnd }],
    views: [
      { id: 'overview', label: 'Overview', pos: [-0.05, 0.85, 1.55], target: [-0.08, 0.15, 0.0] },
      { id: 'start', label: 'Start', pos: [-0.92, 0.55, 0.32], target: [-0.45, 0.22, 0.0] },
      { id: 'finish', label: 'Finish', pos: [0.62, 0.32, 0.55], target: [0.3, 0.12, 0.0] },
    ],
  });
}

