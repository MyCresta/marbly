import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  helixPoints, helixTangent, hermitePoints, linePoints, joinPoints,
  buildPath, channelProfile, sweepGeometry, channelCollider, fixWinding,
  slicePath, tubeGeometry, tubeCollider,
} from './track.js';
import { MARBLE_RADIUS } from './marbles.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

export const LAYOUT = {
  channelRadius: 0.0185,
  channelThickness: 0.0045,
  channelPhi: THREE.MathUtils.degToRad(104),
  helix: { cx: -0.42, cz: -0.09, r: 0.115, top: 0.67, bottom: 0.515, turns: 2.25 },
  leadStart: V(-0.665, 0.698, 0),
  funnel: { x: 0.3, z: -0.12, top: 0.37, rim: 0.13, hole: 0.0185, depth: 0.09, lip: 0.015, neck: 0.03 },
  hopper: { x: -0.63, top: 0.752, bottom: 0.707, rTop: 0.04, rBottom: 0.0185 },
  chute: { drop: 0.02, bend: 0.06, slope: THREE.MathUtils.degToRad(17), kick: THREE.MathUtils.degToRad(22), launchZ: 0.075, launchY: 0.2 },
  bins: { floor: 0.008, wall: 0.052, z0: 0.11, z1: 0.4, edges: [-0.045, 0.038, 0.115, 0.29] },
  fan: { x: 0.08, y: 0.115, z: 0.2 },
  wind: { strength: 300, yMin: 0.062, yMax: 0.26, xMin: 0.16, xMax: 0.62, zPad: 0.008, zLen: 0.22 },
};

function trimeshFromGeometry(geo) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', geo.attributes.position.clone());
  if (geo.index) g.setIndex(geo.index.clone());
  const merged = mergeVertices(g, 1e-6);
  return {
    vertices: new Float32Array(merged.attributes.position.array),
    indices: new Uint32Array(merged.index.array),
  };
}

function lathe(points, segments = 96) {
  const geo = new THREE.LatheGeometry(points.map((p) => new THREE.Vector2(p[0], p[1])), segments);
  return geo;
}

function cylinderBetween(a, b, radius, radialSegments = 20) {
  const dir = b.clone().sub(a);
  const len = dir.length();
  const geo = new THREE.CylinderGeometry(radius, radius, len, radialSegments, 1, false);
  const q = new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), dir.clone().normalize());
  const m = new THREE.Matrix4().compose(a.clone().add(b).multiplyScalar(0.5), q, V(1, 1, 1));
  geo.applyMatrix4(m);
  return geo;
}

function translated(geo, x, y, z) {
  geo.translate(x, y, z);
  return geo;
}

export function buildCourse() {
  const L = LAYOUT;
  const pieces = [];
  const colliders = [];
  const profile = channelProfile({ radius: L.channelRadius, thickness: L.channelThickness, phiMax: L.channelPhi, segments: 31 });
  const bottomOffset = L.channelRadius + L.channelThickness;
  const addPiece = (geometry, material, opts = {}) => {
    pieces.push({ geometry, material, castShadow: opts.castShadow ?? true, receiveShadow: opts.receiveShadow ?? true, name: opts.name });
  };
  const addTrimesh = (data, friction, restitution, tag) => {
    colliders.push({ kind: 'trimesh', ...data, friction, restitution, tag });
  };

  const H = L.helix;
  const helixCenter = V(H.cx, 0, H.cz);
  const a0 = -Math.PI / 2;
  const helixStart = V(H.cx + Math.cos(a0) * H.r, H.top, H.cz + Math.sin(a0) * H.r);
  const leadStart = V(L.leadStart.x, L.leadStart.y, helixStart.z);
  const lead = linePoints(leadStart, helixStart, 0.01);
  const helix = helixPoints({ center: helixCenter, radius: H.r, y0: H.top, y1: H.bottom, a0, turns: H.turns, dir: 1 });
  const aEnd = a0 + H.turns * Math.PI * 2;
  const helixEnd = helix[helix.length - 1];
  const helixEndT = helixTangent(aEnd, 1, H.r, H.turns, H.bottom - H.top);

  const F = L.funnel;
  const k = F.depth / (1 / F.hole - 1 / F.rim);
  const bowlY = (r) => F.top - k * (1 / r - 1 / F.rim);
  const entryR = 0.106;
  const entryClear = bowlY(entryR) + 2 * MARBLE_RADIUS + 0.007;
  const entryEnd = V(F.x, entryClear + bottomOffset, F.z + entryR);
  const entryStart = V(F.x - 0.13, entryEnd.y + 0.019, F.z + entryR);

  const p2 = V(-0.17, 0.49, 0.075);
  const p3 = V(0.02, 0.467, 0.075);
  const connector = joinPoints(
    hermitePoints(helixEnd, helixEndT, p2, V(1, -0.09, 0.2), { tension: 1.1 }),
    hermitePoints(p2, V(1, -0.09, 0.2), p3, V(1, -0.1, -0.22), { tension: 1 }),
    hermitePoints(p3, V(1, -0.1, -0.22), entryStart, V(1, -0.15, 0), { tension: 1 }),
    linePoints(entryStart, entryEnd, 0.01),
  );
  const mainRaw = joinPoints(lead, helix, connector);
  const main = buildPath(mainRaw, { designSpeed: 0.95, maxBank: 0.62, bankSmooth: 14 });
  addPiece(sweepGeometry(main, profile, { startCap: true, uvScale: 1 }), 'maple', { name: 'main-track' });
  addTrimesh(channelCollider(main, profile, { startCap: true }), 0.55, 0.12, 'track');

  const rimCross = Math.sqrt(F.rim * F.rim - entryR * entryR);
  let rimClearance = Infinity;
  main.points.forEach((p, i) => {
    const r = Math.hypot(p.x - F.x, p.z - F.z);
    if (r < F.rim + 0.01 && r > entryR - 0.002) {
      const bottom = p.y - bottomOffset;
      const lipTop = r > F.rim - 0.004 ? F.top + F.lip : bowlY(Math.max(r, F.hole)) + 2 * MARBLE_RADIUS;
      rimClearance = Math.min(rimClearance, bottom - lipTop);
    }
  });

  const C = L.chute;
  const holeY = bowlY(F.hole);
  const neckBottom = holeY - 0.004;
  F.neck = 0.004;
  const fwd = V(0, -Math.sin(C.slope), Math.cos(C.slope));
  const e0 = V(F.x, neckBottom + 0.002, F.z);
  const e1 = V(F.x, neckBottom - C.drop, F.z);
  const e2 = e1.clone().add(V(0, -C.bend * (1 - Math.sin(C.slope)) * 0.95, C.bend * Math.cos(C.slope)));
  const c1 = V(F.x, C.launchY - 0.006, C.launchZ - 0.06);
  const c2 = V(F.x, C.launchY, C.launchZ);
  const chuteRaw = joinPoints(
    linePoints(e0, e1, 0.008),
    hermitePoints(e1, V(0, -1, 0), e2, fwd, { tension: 0.75, step: 0.006 }),
    linePoints(e2, c1, 0.01),
    hermitePoints(c1, fwd, c2, V(0, Math.tan(C.kick), 1), { tension: 0.9 }),
  );
  const chute = buildPath(chuteRaw, { fixedBank: 0, fixedSide: V(-1, 0, 0), ds: 0.005 });
  let tubeEnd = chute.points.findIndex((q, i) => i > 3 && q.z > e2.z + 0.012);
  const tubePath = slicePath(chute, 0, tubeEnd);
  const openPath = slicePath(chute, tubeEnd - 2, chute.points.length - 1);
  addPiece(tubeGeometry(tubePath, L.channelRadius, 0.003, 40), 'copper', { name: 'elbow' });
  addTrimesh(tubeCollider(tubePath, L.channelRadius, 40), 0.45, 0.1, 'track');
  addPiece(sweepGeometry(openPath, profile, {}), 'maple', { name: 'chute' });
  addTrimesh(channelCollider(openPath, profile, {}), 0.55, 0.1, 'track');

  const bowlPts = [];
  bowlPts.push([F.hole, neckBottom]);
  for (let i = 0; i <= 70; i++) {
    const t = i / 70;
    const r = F.hole + (F.rim - F.hole) * (1 - Math.pow(1 - t, 2.2));
    bowlPts.push([r, bowlY(r)]);
  }
  bowlPts.push([F.rim, F.top + F.lip * 0.5]);
  bowlPts.push([F.rim, F.top + F.lip]);
  const bowlInner = lathe(bowlPts.map(([r, y]) => [r, y]).reverse(), 128);
  bowlInner.translate(F.x, 0, F.z);
  addPiece(bowlInner, 'copper', { name: 'funnel' });
  const th = 0.003;
  const outerPts = [];
  outerPts.push([F.rim + th, F.top + F.lip]);
  outerPts.push([F.rim + th, F.top - 0.004]);
  for (let i = 70; i >= 0; i--) {
    const t = i / 70;
    const r = F.hole + (F.rim - F.hole) * (1 - Math.pow(1 - t, 2.2));
    outerPts.push([r + th, bowlY(r) - th]);
  }
  outerPts.push([F.hole + th, neckBottom]);
  const bowlOuter = lathe(outerPts, 128);
  bowlOuter.translate(F.x, 0, F.z);
  addPiece(bowlOuter, 'copper', { name: 'funnel-outer' });
  const lipTopRing = lathe([[F.rim + th, F.top + F.lip], [F.rim + th * 0.5, F.top + F.lip + th * 0.5], [F.rim, F.top + F.lip]], 128);
  lipTopRing.translate(F.x, 0, F.z);
  addPiece(lipTopRing, 'copper', { name: 'funnel-lip' });
  const neckRing = lathe([[F.hole, neckBottom], [F.hole + th * 0.5, neckBottom - th * 0.5], [F.hole + th, neckBottom]], 64);
  neckRing.translate(F.x, 0, F.z);
  addPiece(neckRing, 'copper', { name: 'funnel-neck' });
  const bowlCol = trimeshFromGeometry(lathe(bowlPts, 128).translate(F.x, 0, F.z));
  addTrimesh(bowlCol, 0.45, 0.2, 'funnel');

  const P = L.hopper;
  const hopperPts = [];
  for (let i = 0; i <= 16; i++) {
    const t = i / 16;
    const r = P.rBottom + (P.rTop - P.rBottom) * Math.pow(t, 1.6);
    hopperPts.push([r, P.bottom + (P.top - P.bottom) * t]);
  }
  const hopperX = P.x;
  const hopperZ = helixStart.z;
  const hopperGeo = lathe(hopperPts.slice().reverse(), 64);
  hopperGeo.translate(hopperX, 0, hopperZ);
  addPiece(hopperGeo, 'brass', { name: 'hopper' });
  const hopperOut = lathe(hopperPts.map(([r, y]) => [r + 0.002, y - 0.001]), 64);
  hopperOut.translate(hopperX, 0, hopperZ);
  addPiece(hopperOut, 'brass', { name: 'hopper-out' });
  const hopperRim = new THREE.TorusGeometry(P.rTop + 0.001, 0.0022, 12, 64);
  hopperRim.rotateX(Math.PI / 2);
  hopperRim.translate(hopperX, P.top, hopperZ);
  addPiece(hopperRim, 'brass', { name: 'hopper-rim' });
  addTrimesh(trimeshFromGeometry(lathe(hopperPts, 64).translate(hopperX, 0, hopperZ)), 0.4, 0.2, 'hopper');

  const dowel = 0.0065;
  const supports = [];
  const postUnder = (path, i, extra = 0) => {
    const p = path.points[i];
    const n = path.normals[i];
    const top = p.clone().addScaledVector(n, -(bottomOffset - 0.001));
    const base = V(top.x, 0, top.z);
    supports.push(cylinderBetween(base, top.clone().add(V(0, extra, 0)), dowel, 18));
    const foot = new THREE.CylinderGeometry(0.016, 0.019, 0.008, 28);
    foot.translate(top.x, 0.004, top.z);
    supports.push(foot);
    const collar = new THREE.CylinderGeometry(dowel * 1.6, dowel * 1.6, 0.01, 24);
    collar.translate(top.x, top.y - 0.012, top.z);
    supportsBrass.push(collar);
  };
  const supportsBrass = [];

  postUnder(main, 2);
  postUnder(openPath, Math.floor(openPath.points.length * 0.35));
  postUnder(openPath, Math.floor(openPath.points.length * 0.85));

  const helixStartIdx = main.points.findIndex((p) => p.distanceTo(helixStart) < 0.004);
  const pole = new THREE.CylinderGeometry(0.019, 0.019, H.top + 0.05, 32);
  pole.translate(H.cx, (H.top + 0.05) / 2, H.cz);
  supports.push(pole);
  const poleCap = new THREE.SphereGeometry(0.021, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2);
  poleCap.translate(H.cx, H.top + 0.05, H.cz);
  supportsBrass.push(poleCap);
  const poleFoot = new THREE.CylinderGeometry(0.045, 0.052, 0.012, 40);
  poleFoot.translate(H.cx, 0.006, H.cz);
  supports.push(poleFoot);
  const helixSamples = Math.round(H.turns * 3);
  for (let s = 0; s <= helixSamples; s++) {
    const a = a0 + (s / helixSamples) * H.turns * Math.PI * 2;
    const y = H.top + (H.bottom - H.top) * (s / helixSamples);
    const target = V(H.cx + Math.cos(a) * H.r, y, H.cz + Math.sin(a) * H.r);
    let best = helixStartIdx;
    let bd = Infinity;
    for (let i = Math.max(0, helixStartIdx - 5); i < main.points.length; i++) {
      const d = main.points[i].distanceToSquared(target);
      if (d < bd) { bd = d; best = i; }
    }
    const under = main.points[best].clone().addScaledVector(main.normals[best], -(bottomOffset - 0.0015));
    const inner = V(H.cx, under.y, H.cz);
    const dir = under.clone().sub(inner).setY(0).normalize();
    supports.push(cylinderBetween(inner.clone().addScaledVector(dir, 0.012), under, 0.0042, 14));
  }

  const lenMain = main.points.length;
  const connStart = main.points.findIndex((p, i) => i > helixStartIdx && p.distanceTo(helixEnd) < 0.004);
  const postIdx = [];
  for (let s = connStart + 18; s < lenMain - 1; s += 34) postIdx.push(s);
  postIdx.forEach((i) => {
    const p = main.points[i];
    const rf = Math.hypot(p.x - F.x, p.z - F.z);
    if (rf < F.rim + 0.03) return;
    postUnder(main, i);
  });

  const legAngles = [Math.PI / 2 + 1.15, Math.PI / 2 - 1.15, -Math.PI / 2];
  legAngles.forEach((ang) => {
    const r = F.rim + 0.008;
    const x = F.x + Math.cos(ang) * r;
    const z = F.z + Math.sin(ang) * r;
    supports.push(cylinderBetween(V(x, 0, z), V(x, F.top + 0.004, z), dowel, 18));
    const foot = new THREE.CylinderGeometry(0.016, 0.019, 0.008, 28);
    foot.translate(x, 0.004, z);
    supports.push(foot);
    const clamp = new THREE.CylinderGeometry(dowel * 1.7, dowel * 1.7, 0.016, 24);
    clamp.translate(x, F.top - 0.004, z);
    supportsBrass.push(clamp);
  });
  const ring = new THREE.TorusGeometry(F.rim + 0.008, 0.0035, 12, 128);
  ring.rotateX(Math.PI / 2);
  ring.translate(F.x, F.top - 0.004, F.z);
  supportsBrass.push(ring);

  const hopperLegs = [0, (2 * Math.PI) / 3, (4 * Math.PI) / 3];
  hopperLegs.forEach((ang) => {
    const r = P.rTop - 0.004;
    const x = hopperX + Math.cos(ang + 0.5) * r;
    const z = hopperZ + Math.sin(ang + 0.5) * r;
    const target = V(x, P.top - 0.005, z);
    let best = 0;
    let bd = Infinity;
    for (let i = 0; i < 40; i++) {
      const d = main.points[i].distanceToSquared(target);
      if (d < bd) { bd = d; best = i; }
    }
    const foot = main.points[best].clone().addScaledVector(main.sides[best], Math.sign(z - hopperZ || 1) * (L.channelRadius + 0.002)).add(V(0, 0.006, 0));
    supportsBrass.push(cylinderBetween(foot, target, 0.0018, 8));
  });

  addPiece(mergeAll(supports), 'walnutDowel', { name: 'supports' });
  addPiece(mergeAll(supportsBrass), 'brass', { name: 'brass-fittings' });

  const B = L.bins;
  const binX = B.edges.map((e) => F.x + e);
  const wallT = 0.008;
  const trayParts = [];
  const feltParts = [];
  const binCenterZ = (B.z0 + B.z1) / 2;
  const binLenZ = B.z1 - B.z0;
  const box = (w, h, d, x, y, z, list, collide = true, friction = 0.5, restitution = 0.25) => {
    list.push(translated(new THREE.BoxGeometry(w, h, d, 1, 1, 1), x, y, z));
    if (collide) colliders.push({ kind: 'cuboid', half: [w / 2, h / 2, d / 2], pos: [x, y, z], friction, restitution, tag: 'bin' });
  };
  const trayW = binX[3] - binX[0] + wallT;
  const trayCX = (binX[0] + binX[3]) / 2;
  box(trayW + wallT, B.floor, binLenZ + wallT * 2, trayCX, B.floor / 2, binCenterZ, trayParts, false);
  box(trayW - wallT, 0.002, binLenZ, trayCX, B.floor + 0.001, binCenterZ, feltParts, true, 0.9, 0.08);
  binX.forEach((x, i) => {
    const h = i === binX.length - 1 ? 0.13 : i === 0 ? B.wall + 0.012 : B.wall;
    box(wallT, h, binLenZ + wallT * 2, x, h / 2, binCenterZ, trayParts, true, 0.5, 0.25);
  });
  box(trayW + wallT, B.wall + 0.012, wallT, trayCX, (B.wall + 0.012) / 2, B.z0 - wallT / 2, trayParts, true);
  box(trayW + wallT, B.wall + 0.012, wallT, trayCX, (B.wall + 0.012) / 2, B.z1 + wallT / 2, trayParts, true);
  addPiece(mergeAll(trayParts), 'walnut', { name: 'tray' });
  addPiece(mergeAll(feltParts), 'felt', { name: 'felt', castShadow: false });

  const bins = [
    { id: 'heavy', label: 'Heavy', range: 'over 5 g/cm³', x0: binX[0], x1: binX[1] },
    { id: 'medium', label: 'Medium', range: '1.6 to 5 g/cm³', x0: binX[1], x1: binX[2] },
    { id: 'light', label: 'Light', range: 'under 1.6 g/cm³', x0: binX[2], x1: binX[3] },
  ].map((b) => ({ ...b, z0: B.z0, z1: B.z1, cx: (b.x0 + b.x1) / 2, front: B.z1 + wallT }));

  colliders.push({ kind: 'cuboid', half: [1.0, 0.02, 0.5], pos: [0, -0.02, 0], friction: 0.6, restitution: 0.3, tag: 'desk' });

  const W = L.wind;
  const wind = {
    origin: V(L.fan.x, L.fan.y, L.fan.z),
    dir: V(1, 0, 0),
    strength: W.strength,
    box: { xMin: W.xMin, xMax: Math.min(W.xMax, binX[3] - 0.02), yMin: W.yMin, yMax: W.yMax, zMin: C.launchZ + W.zPad, zMax: C.launchZ + W.zLen },
  };

  const spawn = V(hopperX, P.top - 0.012, hopperZ);

  return {
    pieces,
    colliders,
    spawn,
    wind,
    bins,
    paths: { main, chute, openPath },
    funnel: { ...F, k, bowlY },
    fan: { ...L.fan },
    chuteZone: { x: F.x, z0: e2.z, z1: C.launchZ - 0.004, yMin: C.launchY - 0.05, yMax: e2.y + 0.03 },
    diagnostics: { rimClearance, rimCross },
    focus: V(-0.05, 0.3, -0.02),
  };
}

function mergeAll(list) {
  const geos = list.map((g) => {
    const ng = g.index ? g.toNonIndexed() : g;
    if (!ng.attributes.uv) {
      ng.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array((ng.attributes.position.count) * 2), 2));
    }
    for (const key of Object.keys(ng.attributes)) {
      if (!['position', 'normal', 'uv'].includes(key)) ng.deleteAttribute(key);
    }
    return ng;
  });
  let total = 0;
  geos.forEach((g) => { total += g.attributes.position.count; });
  const pos = new Float32Array(total * 3);
  const nor = new Float32Array(total * 3);
  const uv = new Float32Array(total * 2);
  let o = 0;
  geos.forEach((g) => {
    pos.set(g.attributes.position.array, o * 3);
    nor.set(g.attributes.normal.array, o * 3);
    uv.set(g.attributes.uv.array, o * 2);
    o += g.attributes.position.count;
  });
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.computeBoundingSphere();
  return out;
}

export { fixWinding };
