import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { channelProfile, sweepGeometry, channelCollider, tubeGeometry, tubeCollider } from '../track.js';

export const V = (x, y, z) => new THREE.Vector3(x, y, z);

export const CHANNEL = {
  radius: 0.0185,
  thickness: 0.0045,
  phi: THREE.MathUtils.degToRad(104),
};

export const LIP_HEIGHT = CHANNEL.radius * Math.cos(Math.PI - CHANNEL.phi) + CHANNEL.thickness;
export const BOTTOM_OFFSET = CHANNEL.radius + CHANNEL.thickness;

export function lathe(points, segments = 96, phiStart = 0, phiLength = Math.PI * 2) {
  return new THREE.LatheGeometry(points.map((p) => new THREE.Vector2(p[0], p[1])), segments, phiStart, phiLength);
}

export function trimeshFromGeometry(geo) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', geo.attributes.position.clone());
  if (geo.index) g.setIndex(geo.index.clone());
  const merged = mergeVertices(g, 1e-6);
  return {
    vertices: new Float32Array(merged.attributes.position.array),
    indices: new Uint32Array(merged.index.array),
  };
}

export function cylinderBetween(a, b, radius, radialSegments = 20) {
  const dir = b.clone().sub(a);
  const geo = new THREE.CylinderGeometry(radius, radius, dir.length(), radialSegments, 1, false);
  const q = new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), dir.clone().normalize());
  geo.applyMatrix4(new THREE.Matrix4().compose(a.clone().add(b).multiplyScalar(0.5), q, V(1, 1, 1)));
  return geo;
}

export function mergeAll(list) {
  const geos = list.map((g) => {
    const ng = g.index ? g.toNonIndexed() : g;
    if (!ng.attributes.uv) ng.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(ng.attributes.position.count * 2), 2));
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

export function nearestIndex(path, target, from = 0, to = path.points.length) {
  let best = from;
  let bd = Infinity;
  for (let i = from; i < to; i++) {
    const d = path.points[i].distanceToSquared(target);
    if (d < bd) { bd = d; best = i; }
  }
  return best;
}

function decimate(path, step) {
  const idx = [];
  for (let i = 0; i < path.points.length; i += step) idx.push(i);
  if (idx[idx.length - 1] !== path.points.length - 1) idx.push(path.points.length - 1);
  const pick = (arr) => idx.map((i) => arr[i]);
  return {
    points: pick(path.points),
    tangents: pick(path.tangents),
    sides: pick(path.sides),
    normals: pick(path.normals),
    bank: pick(path.bank),
    dist: pick(path.dist),
    length: path.length,
    source: idx,
  };
}

export class CourseBuilder {
  constructor(meta) {
    this.meta = meta;
    this.pieces = [];
    this.colliders = [];
    this.zones = [];
    this.bins = [];
    this.supports = [];
    this.brass = [];
    this.dark = [];
    this.profile = channelProfile({ radius: CHANNEL.radius, thickness: CHANNEL.thickness, phiMax: CHANNEL.phi, segments: 31 });
    this.profileCache = new Map();
  }

  profileFor(phi, phiNeg = phi) {
    const key = `${Math.round(phi * 1000)}:${Math.round(phiNeg * 1000)}`;
    if (!this.profileCache.has(key)) {
      this.profileCache.set(key, channelProfile({ radius: CHANNEL.radius, thickness: CHANNEL.thickness, phiMax: phi, phiNeg, segments: 31, clampFrom: phi === phiNeg ? null : CHANNEL.phi }));
    }
    return this.profileCache.get(key);
  }

  addPiece(geometry, material, opts = {}) {
    this.pieces.push({ geometry, material, castShadow: opts.castShadow ?? true, receiveShadow: opts.receiveShadow ?? true, name: opts.name || '' });
  }

  addTrimesh(data, friction, restitution, tag) {
    const rolling = tag === 'track' || tag === 'funnel' || tag === 'hopper';
    this.colliders.push({ kind: 'trimesh', ...data, friction, restitution: rolling ? 0 : restitution, combine: rolling ? 'min' : null, tag });
  }

  box(w, h, d, x, y, z, { list = null, material = null, collide = true, friction = 0.5, restitution = 0.25, rotX = 0, rotY = 0, rotZ = 0, gate = false, name, tag = 'box', combine = null } = {}) {
    const g = new THREE.BoxGeometry(w, h, d);
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(rotX, rotY, rotZ, 'YXZ'));
    g.applyQuaternion(q);
    g.translate(x, y, z);
    if (list) list.push(g);
    else if (material) this.addPiece(g, material, { name });
    if (collide) {
      this.colliders.push({ kind: 'cuboid', half: [w / 2, h / 2, d / 2], pos: [x, y, z], rot: rotX || rotY || rotZ ? [q.x, q.y, q.z, q.w] : null, friction, restitution, tag, gate, combine });
    }
    return g;
  }

  channel(path, { material = 'maple', startCap = false, endCap = false, profileAt = null, friction = 0.55, restitution = 0.12, name = 'channel', render = true, collide = true, door = null, renderStep = null } = {}) {
    if (render) {
      const r = decimate(path, renderStep || (path.points.length > 120 ? 2 : 1));
      const renderProfileAt = profileAt ? (i) => profileAt(r.source[i]) : null;
      this.addPiece(sweepGeometry(r, this.profile, { startCap, endCap, profileAt: renderProfileAt }), material, { name });
    }
    if (collide) {
      this.addTrimesh(channelCollider(path, this.profile, { startCap, endCap, profileAt }), friction, restitution, 'track');
      if (door) this.colliders[this.colliders.length - 1].door = door;
    }
  }

  tube(path, { material = 'copper', radius = CHANNEL.radius, thickness = 0.003, friction = 0.45, restitution = 0.1 } = {}) {
    this.addPiece(tubeGeometry(path, radius, thickness, 40), material, { name: 'tube' });
    this.addTrimesh(tubeCollider(path, radius, 40), friction, restitution, 'track');
  }

  foot(x, z) {
    const foot = new THREE.CylinderGeometry(0.016, 0.019, 0.008, 28);
    foot.translate(x, 0.004, z);
    this.supports.push(foot);
  }

  post(path, i, { radius = 0.0065 } = {}) {
    const top = path.points[i].clone().addScaledVector(path.normals[i], -(BOTTOM_OFFSET - 0.001));
    this.supports.push(cylinderBetween(V(top.x, 0, top.z), top, radius, 18));
    this.foot(top.x, top.z);
    const collar = new THREE.CylinderGeometry(radius * 1.6, radius * 1.6, 0.01, 24);
    collar.translate(top.x, top.y - 0.012, top.z);
    this.brass.push(collar);
    return top;
  }

  postsAlong(path, { from = 0, to = path.points.length - 1, every = 0.2, avoid = () => false, minHeight = 0.03 } = {}) {
    let next = path.dist[from] + every * 0.5;
    for (let i = from; i <= to; i++) {
      if (path.dist[i] < next) continue;
      const p = path.points[i];
      if (p.y > minHeight && !avoid(p)) {
        this.post(path, i);
        next = path.dist[i] + every;
      }
    }
  }

  hopper({ x, z, top, bottom, rTop = 0.04, rBottom = 0.0185, feedPath = null }) {
    const pts = [];
    for (let i = 0; i <= 16; i++) {
      const t = i / 16;
      pts.push([rBottom + (rTop - rBottom) * Math.pow(t, 1.6), bottom + (top - bottom) * t]);
    }
    const inner = lathe(pts.slice().reverse(), 64);
    inner.translate(x, 0, z);
    this.addPiece(inner, 'brass', { name: 'hopper' });
    const outer = lathe(pts.map(([r, y]) => [r + 0.002, y - 0.001]), 64);
    outer.translate(x, 0, z);
    this.addPiece(outer, 'brass', { name: 'hopper' });
    const rim = new THREE.TorusGeometry(rTop + 0.001, 0.0022, 12, 64);
    rim.rotateX(Math.PI / 2);
    rim.translate(x, top, z);
    this.addPiece(rim, 'brass', { name: 'hopper' });
    this.addTrimesh(trimeshFromGeometry(lathe(pts, 64).translate(x, 0, z)), 0.4, 0.2, 'hopper');
    if (feedPath) {
      for (const ang of [0.5, 0.5 + (2 * Math.PI) / 3, 0.5 + (4 * Math.PI) / 3]) {
        const r = rTop - 0.004;
        const target = V(x + Math.cos(ang) * r, top - 0.005, z + Math.sin(ang) * r);
        const i = nearestIndex(feedPath, target, 0, Math.min(40, feedPath.points.length));
        const side = Math.sign(feedPath.sides[i].dot(target.clone().sub(feedPath.points[i]))) || 1;
        const footPt = feedPath.points[i].clone().addScaledVector(feedPath.sides[i], side * (CHANNEL.radius + 0.002)).add(V(0, 0.006, 0));
        this.brass.push(cylinderBetween(footPt, target, 0.0018, 8));
      }
    }
    return V(x, top - 0.012, z);
  }

  pegZ(x, y, z, radius, length, { list = null, friction = 0.4, restitution = 0.5 } = {}) {
    const g = new THREE.CylinderGeometry(radius, radius, length, 14);
    g.rotateX(Math.PI / 2);
    g.translate(x, y, z);
    if (list) list.push(g);
    const q = new THREE.Quaternion().setFromAxisAngle(V(1, 0, 0), Math.PI / 2);
    this.colliders.push({ kind: 'cylinder', halfHeight: length / 2, radius, pos: [x, y, z], rot: [q.x, q.y, q.z, q.w], friction, restitution, tag: 'peg' });
    return g;
  }

  tray({ x0, x1, z0, z1, dividers = [], along = 'x', floor = 0.008, wall = 0.052, tallSides = {}, labels = [], plaqueSide = 'front' }) {
    const wallT = 0.008;
    const parts = [];
    const felt = [];
    const cx = (x0 + x1) / 2;
    const cz = (z0 + z1) / 2;
    const w = x1 - x0;
    const d = z1 - z0;
    const outerH = wall + 0.012;
    this.box(w + wallT * 2, floor, d + wallT * 2, cx, floor / 2, cz, { list: parts, collide: false });
    this.box(w, 0.002, d, cx, floor + 0.001, cz, { list: felt, friction: 0.9, restitution: 0.08 });
    const hL = tallSides.left ?? outerH;
    const hR = tallSides.right ?? outerH;
    const hB = tallSides.back ?? outerH;
    const hF = tallSides.front ?? outerH;
    this.box(wallT, hL, d + wallT * 2, x0 - wallT / 2, hL / 2, cz, { list: parts });
    this.box(wallT, hR, d + wallT * 2, x1 + wallT / 2, hR / 2, cz, { list: parts });
    this.box(w + wallT * 2, hB, wallT, cx, hB / 2, z0 - wallT / 2, { list: parts });
    this.box(w + wallT * 2, hF, wallT, cx, hF / 2, z1 + wallT / 2, { list: parts });
    const edges = [along === 'x' ? x0 : z0, ...dividers, along === 'x' ? x1 : z1];
    for (const e of dividers) {
      if (along === 'x') this.box(wallT * 0.75, wall, d, e, wall / 2, cz, { list: parts });
      else this.box(w, wall, wallT * 0.75, cx, wall / 2, e, { list: parts });
    }
    this.addPiece(mergeAll(parts), 'walnut', { name: 'tray' });
    this.addPiece(mergeAll(felt), 'felt', { name: 'felt', castShadow: false });
    const bins = labels.map((lab, i) => {
      const a = edges[i];
      const b = edges[i + 1];
      const bx0 = along === 'x' ? a : x0;
      const bx1 = along === 'x' ? b : x1;
      const bz0 = along === 'x' ? z0 : a;
      const bz1 = along === 'x' ? z1 : b;
      let plaque;
      if (plaqueSide === 'front') plaque = { x: (bx0 + bx1) / 2, y: 0.032, z: z1 + wallT + 0.0008, rotY: 0, w: (bx1 - bx0) * 0.78 };
      else plaque = { x: x1 + wallT + 0.0008, y: 0.032, z: (bz0 + bz1) / 2, rotY: Math.PI / 2, w: (bz1 - bz0) * 0.78 };
      return { ...lab, x0: bx0, x1: bx1, z0: bz0, z1: bz1, plaque };
    });
    this.bins.push(...bins);
    return bins;
  }

  finish(extra) {
    if (this.supports.length) this.addPiece(mergeAll(this.supports), 'walnutDowel', { name: 'supports' });
    if (this.brass.length) this.addPiece(mergeAll(this.brass), 'brass', { name: 'brass-fittings' });
    if (this.dark.length) this.addPiece(mergeAll(this.dark), 'blackMetal', { name: 'dark-fittings' });
    this.colliders.push({ kind: 'cuboid', half: [1.0, 0.02, 0.5], pos: [0, -0.02, 0], friction: 0.6, restitution: 0.3, tag: 'desk' });
    this.colliders.push({ kind: 'cuboid', half: [3, 0.05, 3], pos: [0, -0.81, 0], friction: 0.6, restitution: 0.3, tag: 'floor' });
    this.colliders.push({ kind: 'cuboid', half: [1.2, 1.2, 0.02], pos: [0, 0.6, -0.485], friction: 0.5, restitution: 0.3, tag: 'wall' });
    return {
      ...this.meta,
      pieces: this.pieces,
      colliders: this.colliders,
      zones: this.zones,
      bins: this.bins,
      ...extra,
    };
  }
}
