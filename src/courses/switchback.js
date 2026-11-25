import * as THREE from 'three';
import { buildPath } from '../track.js';
import { CourseBuilder, V, CHANNEL, mergeAll } from './kit.js';

const NOTE = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const MELODY = 'E E F G G F E D C C D E E D D E E F G G F E D C C D E D C C'.split(' ');

export function buildSwitchback() {
  const b = new CourseBuilder({
    id: 'switchback',
    name: 'Switchback',
    blurb: 'Four hairpin rows down into a brass xylophone',
  });
  const rows = [-0.32, -0.2, -0.08, 0.04];
  const xylZ = 0.16;
  const xR = 0.35;
  const xL = -0.47;
  const r = 0.06;
  const xStart = -0.56;
  const x0 = -0.42;
  const slope = Math.tan(THREE.MathUtils.degToRad(4.4));
  const xylSlope = THREE.MathUtils.degToRad(6);
  const pitch = 0.024;
  const barW = 0.019;
  const count = MELODY.length;
  const xylLen = count * pitch;
  const xylEndTop = 0.062;
  const barTop0 = xylEndTop + Math.tan(xylSlope) * xylLen;

  const plan = [];
  const pushLine = (ax, az, bx, bz) => {
    const n = Math.ceil(Math.hypot(bx - ax, bz - az) / 0.01);
    for (let i = 0; i <= n; i++) plan.push([ax + ((bx - ax) * i) / n, az + ((bz - az) * i) / n]);
  };
  const pushArc = (cx, cz, a0, a1) => {
    const n = Math.ceil((Math.abs(a1 - a0) * r) / 0.006);
    for (let i = 0; i <= n; i++) {
      const a = a0 + ((a1 - a0) * i) / n;
      plan.push([cx + Math.cos(a) * r, cz + Math.sin(a) * r]);
    }
  };
  pushLine(xStart, rows[0], xR, rows[0]);
  pushArc(xR, (rows[0] + rows[1]) / 2, -Math.PI / 2, Math.PI / 2);
  pushLine(xR, rows[1], xL, rows[1]);
  pushArc(xL, (rows[1] + rows[2]) / 2, -Math.PI / 2, -Math.PI * 1.5);
  pushLine(xL, rows[2], xR, rows[2]);
  pushArc(xR, (rows[2] + rows[3]) / 2, -Math.PI / 2, Math.PI / 2);
  pushLine(xR, rows[3], xL, rows[3]);
  pushArc(xL, (rows[3] + xylZ) / 2, -Math.PI / 2, -Math.PI * 1.5);
  pushLine(xL, xylZ, x0 + 0.004, xylZ);

  const cleaned = [];
  for (const p of plan) {
    const last = cleaned[cleaned.length - 1];
    if (!last || Math.hypot(p[0] - last[0], p[1] - last[1]) > 1e-6) cleaned.push(p);
  }
  let d = 0;
  const dists = cleaned.map((p, i) => {
    if (i > 0) d += Math.hypot(p[0] - cleaned[i - 1][0], p[1] - cleaned[i - 1][1]);
    return d;
  });
  const endAxisY = barTop0 + CHANNEL.radius + 0.0008;
  const yTop = endAxisY + slope * d;
  const raw = cleaned.map((p, i) => V(p[0], yTop - slope * dists[i], p[1]));
  const path = buildPath(raw, { designSpeed: 0.45, maxBank: 0.45, bankSmooth: 10, ds: 0.006 });
  b.channel(path, { startCap: true, name: 'switchback' });

  const spawn = b.hopper({ x: xStart + 0.035, z: rows[0], top: yTop + 0.075, bottom: yTop + 0.03, feedPath: path });
  b.post(path, 3);
  b.postsAlong(path, { from: 30, to: path.points.length - 4, every: 0.27 });

  const bars = [];
  const notes = MELODY.map((n) => 523.25 * Math.pow(2, NOTE[n] / 12));
  const topAt = (x) => barTop0 - Math.tan(xylSlope) * (x - x0);
  const barParts = [];
  for (let i = 0; i < count; i++) {
    const cx = x0 + (i + 0.5) * pitch;
    const semis = NOTE[MELODY[i]];
    const len = 0.1 * Math.pow(2, -semis / 24);
    const cy = topAt(cx) - 0.004;
    b.box(barW, 0.008, len, cx, cy, xylZ, { list: barParts, rotZ: -xylSlope, friction: 0.35, restitution: 0.35, tag: 'bar' });
    bars.push({ x0: x0 + i * pitch, x1: x0 + (i + 1) * pitch, freq: notes[i] });
  }
  b.addPiece(mergeAll(barParts), 'brass', { name: 'xylophone' });
  const midX = x0 + xylLen / 2;
  const railLen = xylLen + 0.02;
  const railParts = [];
  for (const side of [-1, 1]) {
    const rz = xylZ + side * (CHANNEL.radius - 0.001 + 0.004);
    b.box(railLen, 0.014, 0.008, midX, topAt(midX) + 0.007, rz, { list: railParts, rotZ: -xylSlope, friction: 0.4, restitution: 0.2 });
    const sz = xylZ + side * 0.036;
    b.box(railLen, 0.012, 0.014, midX, topAt(midX) - 0.016, sz, { list: railParts, rotZ: -xylSlope, collide: false });
  }
  b.addPiece(mergeAll(railParts), 'walnut', { name: 'xylophone-frame' });
  const felt = [];
  for (const side of [-1, 1]) b.box(railLen, 0.003, 0.012, midX, topAt(midX) - 0.0095, xylZ + side * 0.036, { list: felt, rotZ: -xylSlope, collide: false });
  b.addPiece(mergeAll(felt), 'felt', { name: 'xylophone-felt' });
  for (const fx of [x0 + 0.03, x0 + xylLen - 0.03]) {
    for (const side of [-1, 1]) {
      const sz = xylZ + side * 0.036;
      const top = topAt(fx) - 0.022;
      const post = new THREE.CylinderGeometry(0.005, 0.005, top, 14);
      post.translate(fx, top / 2, sz);
      b.supports.push(post);
      b.foot(fx, sz);
    }
  }

  b.tray({
    x0: x0 + xylLen + 0.012, x1: 0.6, z0: 0.03, z1: 0.31,
    tallSides: { left: 0.03 },
    labels: [{ id: 'finish', label: 'Finished', range: 'every marble ends here' }],
  });

  return b.finish({
    spawn,
    dropGap: 1.0,
    xylophone: { x0, pitch, count, z: xylZ, bars, topAt },
    paths: { main: path },
    stages: [
      { id: 'row2', test: (p) => Math.abs(p.z - rows[2]) < 0.02 && p.x > 0 },
      { id: 'xylo', test: (p) => p.x > x0 && Math.abs(p.z - xylZ) < 0.02 && p.y > 0.05 },
    ],
    views: [
      { id: 'overview', label: 'Overview', pos: [0.05, 0.92, 1.75], target: [-0.04, 0.18, -0.02] },
      { id: 'rows', label: 'Hairpins', pos: [0.62, 0.62, 0.5], target: [0.2, 0.3, -0.16] },
      { id: 'xylophone', label: 'Xylophone', pos: [-0.12, 0.3, 0.6], target: [-0.08, 0.08, 0.15] },
    ],
  });
}
