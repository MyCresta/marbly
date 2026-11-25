import * as THREE from 'three';
import { helixPoints, helixTangent, hermitePoints, linePoints, joinPoints, buildPath, slicePath } from '../track.js';
import { CourseBuilder, V, CHANNEL, BOTTOM_OFFSET, lathe, trimeshFromGeometry, cylinderBetween, nearestIndex } from './kit.js';

export const VORTEX = {
  helix: { cx: -0.42, cz: -0.09, r: 0.115, top: 0.67, bottom: 0.515, turns: 2.25 },
  funnel: { x: 0.3, z: -0.12, top: 0.425, rim: 0.13, hole: 0.0185, depth: 0.1, cone: 0.12, lip: 0.016 },
  entry: { r: 0.118, run: 0.1, slope: 0.06, taper: 0.1, phiEnd: THREE.MathUtils.degToRad(30) },
  hopper: { x: -0.63, top: 0.752, bottom: 0.707 },
  chute: { drop: 0.02, bend: 0.06, slope: THREE.MathUtils.degToRad(17), kick: THREE.MathUtils.degToRad(22), launchZ: 0.075, launchY: 0.222 },
  bins: { z0: 0.11, z1: 0.4, edges: [-0.05, 0.058, 0.14, 0.29] },
  fan: { x: 0.08, y: 0.13, z: 0.2 },
  wind: { strength: 380, yMin: 0.062, yMax: 0.28, xMin: 0.16, zPad: 0.008, zLen: 0.22 },
};

export function buildVortex() {
  const L = VORTEX;
  const b = new CourseBuilder({
    id: 'vortex',
    name: 'Vortex',
    blurb: 'Helix, copper funnel and a fan that sorts by density',
  });

  const H = L.helix;
  const a0 = -Math.PI / 2;
  const helixStart = V(H.cx + Math.cos(a0) * H.r, H.top, H.cz + Math.sin(a0) * H.r);
  const leadStart = V(-0.665, H.top + 0.028, helixStart.z);
  const helix = helixPoints({ center: V(H.cx, 0, H.cz), radius: H.r, y0: H.top, y1: H.bottom, a0, turns: H.turns, dir: 1 });
  const helixEnd = helix[helix.length - 1];
  const helixEndT = helixTangent(a0 + H.turns * Math.PI * 2, 1, H.r, H.turns, H.bottom - H.top);

  const F = L.funnel;
  const k = (F.depth - F.cone * (F.rim - F.hole)) / (1 / F.hole - 1 / F.rim);
  const bowlY = (r) => F.top - k * (1 / r - 1 / F.rim) - F.cone * (F.rim - r);
  const E = L.entry;
  const entryEnd = V(F.x, bowlY(E.r) + CHANNEL.radius + 0.0015, F.z + E.r);
  const entryStart = V(F.x - E.run, entryEnd.y + E.run * E.slope, entryEnd.z);

  const p2 = V(-0.17, 0.497, 0.075);
  const p3 = V(0.02, 0.475, 0.07);
  const mainRaw = joinPoints(
    linePoints(leadStart, helixStart, 0.01),
    helix,
    hermitePoints(helixEnd, helixEndT, p2, V(1, -0.09, 0.2), { tension: 1.1 }),
    hermitePoints(p2, V(1, -0.09, 0.2), p3, V(1, -0.09, -0.22), { tension: 1 }),
    hermitePoints(p3, V(1, -0.09, -0.22), entryStart, V(1, -E.slope, 0), { tension: 1 }),
    linePoints(entryStart, entryEnd, 0.008),
  );
  const main = buildPath(mainRaw, { designSpeed: 0.6, maxBank: 0.5, bankSmooth: 14 });
  const n = main.points.length;
  const taperFrom = main.length - E.taper;
  const profileAt = (i) => {
    const d = main.dist[i];
    if (d <= taperFrom) return b.profile;
    const t = Math.min(1, (d - taperFrom) / E.taper);
    const e = t * t * (3 - 2 * t);
    return b.profileFor(CHANNEL.phi + (E.phiEnd - CHANNEL.phi) * e);
  };
  b.channel(main, { startCap: true, profileAt, name: 'main-track' });

  const C = L.chute;
  const holeY = bowlY(F.hole);
  const neckBottom = holeY - 0.004;
  const fwd = V(0, -Math.sin(C.slope), Math.cos(C.slope));
  const e0 = V(F.x, neckBottom + 0.002, F.z);
  const e1 = V(F.x, neckBottom - C.drop, F.z);
  const e2 = e1.clone().add(V(0, -C.bend * (1 - Math.sin(C.slope)) * 0.95, C.bend * Math.cos(C.slope)));
  const c1 = V(F.x, C.launchY - 0.006, C.launchZ - 0.06);
  const c2 = V(F.x, C.launchY, C.launchZ);
  const chute = buildPath(joinPoints(
    linePoints(e0, e1, 0.008),
    hermitePoints(e1, V(0, -1, 0), e2, fwd, { tension: 0.75, step: 0.006 }),
    linePoints(e2, c1, 0.01),
    hermitePoints(c1, fwd, c2, V(0, Math.tan(C.kick), 1), { tension: 0.9 }),
  ), { fixedBank: 0, fixedSide: V(-1, 0, 0), ds: 0.005 });
  const tubeEnd = chute.points.findIndex((q, i) => i > 3 && q.z > e2.z + 0.012);
  const tubePath = slicePath(chute, 0, tubeEnd);
  const openPath = slicePath(chute, tubeEnd - 2, chute.points.length - 1);
  b.tube(tubePath);
  b.channel(openPath, { restitution: 0.1, name: 'chute' });

  const ring = (rr) => {
    const pts = [[F.hole, neckBottom]];
    for (let i = 0; i <= rr; i++) {
      const t = i / rr;
      const r = F.hole + (F.rim - F.hole) * (1 - Math.pow(1 - t, 2.2));
      pts.push([r, bowlY(r)]);
    }
    return pts;
  };
  const bowlPts = ring(80);
  const bowlInner = lathe(bowlPts.slice().reverse(), 128);
  bowlInner.translate(F.x, 0, F.z);
  b.addPiece(bowlInner, 'copper', { name: 'funnel' });
  const th = 0.003;
  const outerPts = [[F.rim + th, F.top - 0.004]];
  for (let i = bowlPts.length - 1; i >= 1; i--) outerPts.push([bowlPts[i][0] + th, bowlPts[i][1] - th]);
  outerPts.push([F.hole + th, neckBottom]);
  const bowlOuter = lathe(outerPts, 128);
  bowlOuter.translate(F.x, 0, F.z);
  b.addPiece(bowlOuter, 'copper', { name: 'funnel' });
  b.addTrimesh(trimeshFromGeometry(lathe(bowlPts, 128).translate(F.x, 0, F.z)), 0.45, 0.2, 'funnel');

  const toPhi = (theta) => Math.PI / 2 - theta;
  const notchFrom = THREE.MathUtils.degToRad(84);
  const crossing = Math.atan2(E.r, -Math.sqrt((F.rim + 0.012) ** 2 - E.r * E.r));
  const notchTo = crossing + THREE.MathUtils.degToRad(4);
  const lipStart = toPhi(notchFrom) ;
  const lipLength = Math.PI * 2 - (notchTo - notchFrom);
  const lipPts = [[F.rim, F.top], [F.rim, F.top + F.lip]];
  const lipInner = lathe(lipPts, 112, lipStart, lipLength);
  lipInner.translate(F.x, 0, F.z);
  b.addPiece(lipInner, 'copper', { name: 'funnel-lip' });
  const lipOuter = lathe([[F.rim + th, F.top + F.lip], [F.rim + th * 0.5, F.top + F.lip + th * 0.5], [F.rim, F.top + F.lip]], 112, lipStart, lipLength);
  lipOuter.translate(F.x, 0, F.z);
  b.addPiece(lipOuter, 'copper', { name: 'funnel-lip' });
  const lipWall = lathe([[F.rim + th, F.top - 0.004], [F.rim + th, F.top + F.lip]], 112, lipStart, lipLength);
  lipWall.translate(F.x, 0, F.z);
  b.addPiece(lipWall, 'copper', { name: 'funnel-lip' });
  b.addTrimesh(trimeshFromGeometry(lathe(lipPts, 112, lipStart, lipLength).translate(F.x, 0, F.z)), 0.4, 0.2, 'funnel');
  const neckRing = lathe([[F.hole, neckBottom], [F.hole + th * 0.5, neckBottom - th * 0.5], [F.hole + th, neckBottom]], 64);
  neckRing.translate(F.x, 0, F.z);
  b.addPiece(neckRing, 'copper', { name: 'funnel' });

  const spawn = b.hopper({ ...L.hopper, z: helixStart.z, feedPath: main });

  b.post(main, 2);
  b.post(openPath, Math.floor(openPath.points.length * 0.35));
  b.post(openPath, Math.floor(openPath.points.length * 0.85));
  const pole = new THREE.CylinderGeometry(0.019, 0.019, H.top + 0.05, 32);
  pole.translate(H.cx, (H.top + 0.05) / 2, H.cz);
  b.supports.push(pole);
  const cap = new THREE.SphereGeometry(0.021, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2);
  cap.translate(H.cx, H.top + 0.05, H.cz);
  b.brass.push(cap);
  const poleFoot = new THREE.CylinderGeometry(0.045, 0.052, 0.012, 40);
  poleFoot.translate(H.cx, 0.006, H.cz);
  b.supports.push(poleFoot);
  const helixStartIdx = nearestIndex(main, helixStart);
  const arms = Math.round(H.turns * 3);
  for (let s = 0; s <= arms; s++) {
    const a = a0 + (s / arms) * H.turns * Math.PI * 2;
    const y = H.top + (H.bottom - H.top) * (s / arms);
    const i = nearestIndex(main, V(H.cx + Math.cos(a) * H.r, y, H.cz + Math.sin(a) * H.r), Math.max(0, helixStartIdx - 5));
    const under = main.points[i].clone().addScaledVector(main.normals[i], -(BOTTOM_OFFSET - 0.0015));
    const inner = V(H.cx, under.y, H.cz);
    const dir = under.clone().sub(inner).setY(0).normalize();
    b.supports.push(cylinderBetween(inner.clone().addScaledVector(dir, 0.012), under, 0.0042, 14));
  }
  const connStart = nearestIndex(main, helixEnd, helixStartIdx + 10);
  b.postsAlong(main, { from: connStart + 10, to: n - 1, every: 0.2, avoid: (p) => Math.hypot(p.x - F.x, p.z - F.z) < F.rim + 0.035 });
  const entryPostIdx = nearestIndex(main, V(F.x - F.rim - 0.03, entryEnd.y, entryEnd.z));
  b.post(main, entryPostIdx);

  [Math.PI / 2 + 1.15, Math.PI / 2 - 1.15, -Math.PI / 2].forEach((ang) => {
    const r = F.rim + 0.008;
    const x = F.x + Math.cos(ang) * r;
    const z = F.z + Math.sin(ang) * r;
    b.supports.push(cylinderBetween(V(x, 0, z), V(x, F.top + 0.004, z), 0.0065, 18));
    b.foot(x, z);
    const clamp = new THREE.CylinderGeometry(0.011, 0.011, 0.016, 24);
    clamp.translate(x, F.top - 0.004, z);
    b.brass.push(clamp);
  });
  const band = new THREE.TorusGeometry(F.rim + 0.008, 0.0035, 12, 128);
  band.rotateX(Math.PI / 2);
  band.translate(F.x, F.top - 0.028, F.z);
  b.brass.push(band);

  const B = L.bins;
  const x = B.edges.map((e) => F.x + e);
  b.tray({
    x0: x[0], x1: x[3], z0: B.z0, z1: B.z1, dividers: [x[1], x[2]], along: 'x',
    tallSides: { right: 0.13 },
    labels: [
      { id: 'heavy', label: 'Heavy', range: 'over 5 g/cm³' },
      { id: 'medium', label: 'Medium', range: '1.6 to 5 g/cm³' },
      { id: 'light', label: 'Light', range: 'under 1.6 g/cm³' },
    ],
  });

  const W = L.wind;
  b.zones.push({
    type: 'wind',
    origin: V(L.fan.x, L.fan.y, L.fan.z),
    dir: V(1, 0, 0),
    strength: W.strength,
    box: { xMin: W.xMin, xMax: x[3] - 0.02, yMin: W.yMin, yMax: W.yMax, zMin: C.launchZ + W.zPad, zMax: C.launchZ + W.zLen },
  });
  b.zones.push({ type: 'lateral', x: F.x, halfWidth: 0.03, z0: e2.z, z1: C.launchZ - 0.004, yMin: C.launchY - 0.05, yMax: e2.y + 0.03, k: 7 });
  b.zones.push({ type: 'jam', x: F.x, z: F.z, radius: 0.04, yMin: holeY - 0.03, yMax: holeY + 0.05 });

  return b.finish({
    spawn,
    fan: { ...L.fan },
    funnel: { ...F, bowlY },
    paths: { main, openPath },
    stages: [
      { id: 'funnel', test: (p) => Math.hypot(p.x - F.x, p.z - F.z) < F.rim && p.y < F.top + 0.02 && p.y > holeY - 0.01 },
      { id: 'out', test: (p) => Math.hypot(p.x - F.x, p.z - F.z) < 0.03 && p.y < holeY - 0.03 },
      { id: 'launch', test: (p) => Math.abs(p.x - F.x) < 0.04 && p.z > C.launchZ && p.y > 0.06 },
    ],
    views: [
      { id: 'overview', label: 'Overview', pos: [0.14, 1.02, 2.05], target: [0.0, 0.27, 0.0] },
      { id: 'helix', label: 'Helix', pos: [-0.12, 0.8, 0.44], target: [-0.42, 0.57, -0.1] },
      { id: 'funnel', label: 'Funnel', pos: [0.48, 0.72, 0.3], target: [0.3, 0.39, -0.1] },
      { id: 'sorter', label: 'Sorter', pos: [0.06, 0.46, 0.86], target: [0.4, 0.04, 0.16] },
    ],
  });
}
