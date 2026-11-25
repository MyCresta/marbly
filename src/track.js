import * as THREE from 'three';

const UP = new THREE.Vector3(0, 1, 0);

export function helixPoints({ center, radius, y0, y1, a0, turns, dir = 1, step = 0.01 }) {
  const length = Math.abs(turns) * Math.PI * 2 * radius;
  const n = Math.max(8, Math.ceil(length / step));
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const a = a0 + dir * t * turns * Math.PI * 2;
    pts.push(new THREE.Vector3(
      center.x + Math.cos(a) * radius,
      y0 + (y1 - y0) * t,
      center.z + Math.sin(a) * radius,
    ));
  }
  return pts;
}

export function helixTangent(a, dir, radius, turns, dy) {
  const horiz = new THREE.Vector3(-Math.sin(a) * dir, 0, Math.cos(a) * dir);
  const length = Math.abs(turns) * Math.PI * 2 * radius;
  return horiz.multiplyScalar(length).add(new THREE.Vector3(0, dy, 0)).normalize();
}

export function hermitePoints(p0, t0, p1, t1, { tension = 1, step = 0.01 } = {}) {
  const d = p0.distanceTo(p1) * tension;
  const m0 = t0.clone().normalize().multiplyScalar(d);
  const m1 = t1.clone().normalize().multiplyScalar(d);
  const n = Math.max(6, Math.ceil(p0.distanceTo(p1) * 1.3 / step));
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const t2 = t * t;
    const t3 = t2 * t;
    const h00 = 2 * t3 - 3 * t2 + 1;
    const h10 = t3 - 2 * t2 + t;
    const h01 = -2 * t3 + 3 * t2;
    const h11 = t3 - t2;
    pts.push(new THREE.Vector3()
      .addScaledVector(p0, h00)
      .addScaledVector(m0, h10)
      .addScaledVector(p1, h01)
      .addScaledVector(m1, h11));
  }
  return pts;
}

export function linePoints(p0, p1, step = 0.01) {
  const n = Math.max(2, Math.ceil(p0.distanceTo(p1) / step));
  const pts = [];
  for (let i = 0; i <= n; i++) pts.push(p0.clone().lerp(p1, i / n));
  return pts;
}

export function joinPoints(...lists) {
  const out = [];
  for (const list of lists) {
    for (const p of list) {
      if (out.length && out[out.length - 1].distanceToSquared(p) < 1e-8) continue;
      out.push(p.clone());
    }
  }
  return out;
}

export function buildPath(rawPoints, { ds = 0.006, designSpeed = 0.9, maxBank = 0.6, bankScale = 1, bankSmooth = 9, fixedBank = null, fixedSide = null } = {}) {
  const curve = new THREE.CatmullRomCurve3(rawPoints, false, 'centripetal');
  const length = curve.getLength();
  const n = Math.max(4, Math.ceil(length / ds));
  const points = curve.getSpacedPoints(n);
  const count = points.length;
  const tangents = [];
  for (let i = 0; i < count; i++) {
    const a = points[Math.max(0, i - 1)];
    const b = points[Math.min(count - 1, i + 1)];
    tangents.push(b.clone().sub(a).normalize());
  }
  const sides = [];
  const normals = [];
  const rawBank = [];
  for (let i = 0; i < count; i++) {
    const t = tangents[i];
    const s = fixedSide ? fixedSide.clone().addScaledVector(t, -fixedSide.dot(t)).normalize() : new THREE.Vector3().crossVectors(t, UP).normalize();
    sides.push(s);
    normals.push(new THREE.Vector3().crossVectors(s, t).normalize());
    const ta = tangents[Math.max(0, i - 1)];
    const tb = tangents[Math.min(count - 1, i + 1)];
    const span = points[Math.max(0, i - 1)].distanceTo(points[Math.min(count - 1, i + 1)]) || ds;
    const kappa = tb.clone().sub(ta).dot(s) / span;
    rawBank.push(THREE.MathUtils.clamp(Math.atan((designSpeed * designSpeed * kappa) / 9.81) * bankScale, -maxBank, maxBank));
  }
  const bank = rawBank.map((_, i) => {
    if (fixedBank !== null) return typeof fixedBank === 'function' ? fixedBank(i / (count - 1)) : fixedBank;
    let sum = 0;
    let w = 0;
    for (let k = -bankSmooth; k <= bankSmooth; k++) {
      const j = THREE.MathUtils.clamp(i + k, 0, count - 1);
      const weight = 1 - Math.abs(k) / (bankSmooth + 1);
      sum += rawBank[j] * weight;
      w += weight;
    }
    return sum / w;
  });
  for (let i = 0; i < count; i++) {
    const b = bank[i];
    const s = sides[i].clone();
    const nrm = normals[i].clone();
    normals[i] = nrm.clone().multiplyScalar(Math.cos(b)).addScaledVector(s, Math.sin(b));
    sides[i] = s.multiplyScalar(Math.cos(b)).addScaledVector(nrm, -Math.sin(b));
  }
  const dist = [0];
  for (let i = 1; i < count; i++) dist.push(dist[i - 1] + points[i].distanceTo(points[i - 1]));
  return { points, tangents, sides, normals, bank, dist, length: dist[count - 1] };
}

export function channelProfile({ radius, thickness, phiMax, phiNeg = phiMax, segments = 28, capSegments = 6, clampFrom = null }) {
  const prof = [];
  const inner = [];
  for (let k = 0; k <= segments; k++) {
    let phi;
    if (clampFrom) {
      phi = -clampFrom + (2 * clampFrom * k) / segments;
      if (phi > phiMax) phi = phiMax + (phi - phiMax) * 0.04;
      if (phi < -phiNeg) phi = -phiNeg + (phi + phiNeg) * 0.04;
    }
    else phi = -phiNeg + ((phiMax + phiNeg) * k) / segments;
    inner.push(phi);
  }
  for (const phi of inner) {
    prof.push({ x: radius * Math.sin(phi), y: -radius * Math.cos(phi), nx: -Math.sin(phi), ny: Math.cos(phi), part: 'inner' });
  }
  const cap = (phi, sign) => {
    const e = new THREE.Vector2(Math.sin(phi), -Math.cos(phi));
    const t = new THREE.Vector2(Math.cos(phi), Math.sin(phi)).multiplyScalar(sign);
    const c = e.clone().multiplyScalar(radius + thickness / 2);
    const h = thickness / 2;
    for (let k = 1; k < capSegments; k++) {
      const psi = (Math.PI * k) / capSegments;
      const startDir = sign > 0 ? e.clone().negate() : e.clone();
      const dir = startDir.multiplyScalar(Math.cos(psi)).addScaledVector(t, Math.sin(psi));
      prof.push({ x: c.x + dir.x * h, y: c.y + dir.y * h, nx: dir.x, ny: dir.y, part: 'cap' });
    }
  };
  cap(phiMax, 1);
  for (let k = segments; k >= 0; k--) {
    const phi = inner[k];
    prof.push({ x: (radius + thickness) * Math.sin(phi), y: -(radius + thickness) * Math.cos(phi), nx: Math.sin(phi), ny: -Math.cos(phi), part: 'outer' });
  }
  cap(-phiNeg, -1);
  let acc = 0;
  prof.forEach((p, i) => {
    if (i > 0) acc += Math.hypot(p.x - prof[i - 1].x, p.y - prof[i - 1].y);
    p.u = acc;
  });
  return { prof, segments, radius, thickness, phiMax };
}

function frameAt(path, i, x, y, out) {
  return out.copy(path.points[i]).addScaledVector(path.sides[i], x).addScaledVector(path.normals[i], y);
}

export function sweepGeometry(path, profile, { startCap = false, endCap = false, uvScale = 1, profileAt = null } = {}) {
  const P = profileAt || (() => profile);
  const prof = profile.prof;
  const m = prof.length;
  const count = path.points.length;
  const positions = [];
  const normals = [];
  const uvs = [];
  const indices = [];
  const v = new THREE.Vector3();
  const nn = new THREE.Vector3();
  for (let i = 0; i < count; i++) {
    const pr = P(i).prof;
    for (let j = 0; j <= m; j++) {
      const p = pr[j % m];
      frameAt(path, i, p.x, p.y, v);
      positions.push(v.x, v.y, v.z);
      nn.copy(path.sides[i]).multiplyScalar(p.nx).addScaledVector(path.normals[i], p.ny).normalize();
      normals.push(nn.x, nn.y, nn.z);
      const u = j === m ? prof[m - 1].u + Math.hypot(prof[0].x - prof[m - 1].x, prof[0].y - prof[m - 1].y) : p.u;
      uvs.push(u * uvScale, path.dist[i] * uvScale);
    }
  }
  const row = m + 1;
  for (let i = 0; i < count - 1; i++) {
    for (let j = 0; j < m; j++) {
      const a = i * row + j;
      const b = (i + 1) * row + j;
      indices.push(a, a + 1, b, b, a + 1, b + 1);
    }
  }
  const addCap = (i, dirSign) => {
    const base = positions.length / 3;
    const seg = profile.segments;
    const t = path.tangents[i].clone().multiplyScalar(dirSign);
    const innerIdx = [];
    const outerIdx = [];
    const capCount = (m - 2 * (seg + 1)) / 2;
    for (let k = 0; k <= seg; k++) {
      const pr = P(i).prof;
      const pin = pr[k];
      const pout = pr[seg + capCount + (seg - k) + 1];
      frameAt(path, i, pin.x, pin.y, v);
      positions.push(v.x, v.y, v.z);
      normals.push(t.x, t.y, t.z);
      uvs.push(pin.x * uvScale, pin.y * uvScale);
      innerIdx.push(base + 2 * k);
      frameAt(path, i, pout.x, pout.y, v);
      positions.push(v.x, v.y, v.z);
      normals.push(t.x, t.y, t.z);
      uvs.push(pout.x * uvScale, pout.y * uvScale);
      outerIdx.push(base + 2 * k + 1);
    }
    for (let k = 0; k < seg; k++) {
      indices.push(innerIdx[k], outerIdx[k], innerIdx[k + 1], innerIdx[k + 1], outerIdx[k], outerIdx[k + 1]);
    }
  };
  addCap(0, -1);
  addCap(count - 1, 1);
  if (startCap) addWall(path, 0, profile, -1, positions, normals, uvs, indices, uvScale);
  if (endCap) addWall(path, count - 1, profile, 1, positions, normals, uvs, indices, uvScale);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  fixWinding(geo);
  geo.computeBoundingSphere();
  return geo;
}

function addWall(path, i, profile, dirSign, positions, normals, uvs, indices, uvScale) {
  const seg = profile.segments;
  const t = path.tangents[i].clone().multiplyScalar(dirSign);
  const offset = t.clone().multiplyScalar(profile.thickness * 0.5);
  const v = new THREE.Vector3();
  for (const side of [1, -1]) {
    const base = positions.length / 3;
    const shift = offset.clone().multiplyScalar(side);
    const nrm = t.clone().multiplyScalar(side === 1 ? 1 : -1);
    frameAt(path, i, 0, profile.radius * 0.25, v).add(shift);
    positions.push(v.x, v.y, v.z);
    normals.push(nrm.x, nrm.y, nrm.z);
    uvs.push(0, 0);
    for (let k = 0; k <= seg; k++) {
      const p = profile.prof[k];
      frameAt(path, i, p.x, p.y, v).add(shift);
      positions.push(v.x, v.y, v.z);
      normals.push(nrm.x, nrm.y, nrm.z);
      uvs.push(p.x * uvScale, p.y * uvScale);
    }
    for (let k = 0; k < seg; k++) indices.push(base, base + 1 + k, base + 2 + k);
  }
}

export function fixWinding(geo) {
  const pos = geo.attributes.position;
  const nor = geo.attributes.normal;
  const idx = geo.index.array;
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const n = new THREE.Vector3();
  const fn = new THREE.Vector3();
  for (let f = 0; f < idx.length; f += 3) {
    a.fromBufferAttribute(pos, idx[f]);
    b.fromBufferAttribute(pos, idx[f + 1]);
    c.fromBufferAttribute(pos, idx[f + 2]);
    fn.subVectors(b, a).cross(c.clone().sub(a));
    n.fromBufferAttribute(nor, idx[f]).add(c.fromBufferAttribute(nor, idx[f + 1])).add(b.fromBufferAttribute(nor, idx[f + 2]));
    if (fn.dot(n) < 0) {
      const tmp = idx[f + 1];
      idx[f + 1] = idx[f + 2];
      idx[f + 2] = tmp;
    }
  }
}

export function channelCollider(path, profile, { startCap = false, endCap = false, extend = 0, profileAt = null } = {}) {
  const P = profileAt || (() => profile);
  const seg = profile.segments;
  const verts = [];
  const indices = [];
  const v = new THREE.Vector3();
  const count = path.points.length;
  for (let i = 0; i < count; i++) {
    const pr = P(i).prof;
    for (let k = 0; k <= seg; k++) {
      const p = pr[k];
      frameAt(path, i, p.x, p.y, v);
      if (extend && i === 0) v.addScaledVector(path.tangents[0], -extend);
      if (extend && i === count - 1) v.addScaledVector(path.tangents[count - 1], extend);
      verts.push(v.x, v.y, v.z);
    }
  }
  const row = seg + 1;
  for (let i = 0; i < count - 1; i++) {
    for (let k = 0; k < seg; k++) {
      const a = i * row + k;
      const b = (i + 1) * row + k;
      indices.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  const caps = [];
  const wall = (i) => {
    const base = verts.length / 3;
    frameAt(path, i, 0, profile.radius * 0.25, v);
    verts.push(v.x, v.y, v.z);
    for (let k = 0; k <= seg; k++) {
      const p = profile.prof[k];
      frameAt(path, i, p.x, p.y, v);
      verts.push(v.x, v.y, v.z);
    }
    for (let k = 0; k < seg; k++) caps.push(base, base + 1 + k, base + 2 + k);
  };
  if (startCap) wall(0);
  if (endCap) wall(count - 1);
  return { vertices: new Float32Array(verts), indices: new Uint32Array(indices.concat(caps)) };
}

export function marbleCenterAt(path, i, profile, marbleRadius) {
  return path.points[i].clone().addScaledVector(path.normals[i], -(profile.radius - marbleRadius));
}

export function slicePath(path, i0, i1) {
  const pick = (arr) => arr.slice(i0, i1 + 1);
  const dist = pick(path.dist).map((d) => d - path.dist[i0]);
  return {
    points: pick(path.points),
    tangents: pick(path.tangents),
    sides: pick(path.sides),
    normals: pick(path.normals),
    bank: pick(path.bank),
    dist,
    length: dist[dist.length - 1],
  };
}

export function tubeGeometry(path, radius, thickness, segments = 32) {
  const positions = [];
  const normals = [];
  const uvs = [];
  const indices = [];
  const count = path.points.length;
  const v = new THREE.Vector3();
  const n = new THREE.Vector3();
  const ring = (r, sign) => {
    const base = positions.length / 3;
    for (let i = 0; i < count; i++) {
      for (let j = 0; j <= segments; j++) {
        const a = (j / segments) * Math.PI * 2;
        n.copy(path.sides[i]).multiplyScalar(Math.cos(a)).addScaledVector(path.normals[i], Math.sin(a));
        v.copy(path.points[i]).addScaledVector(n, r);
        positions.push(v.x, v.y, v.z);
        normals.push(n.x * sign, n.y * sign, n.z * sign);
        uvs.push(j / segments, path.dist[i]);
      }
    }
    for (let i = 0; i < count - 1; i++) {
      for (let j = 0; j < segments; j++) {
        const a = base + i * (segments + 1) + j;
        const b = a + segments + 1;
        indices.push(a, a + 1, b, b, a + 1, b + 1);
      }
    }
    return base;
  };
  const outerBase = ring(radius + thickness, 1);
  const innerBase = ring(radius, -1);
  for (const i of [0, count - 1]) {
    const t = path.tangents[i].clone().multiplyScalar(i === 0 ? -1 : 1);
    const base = positions.length / 3;
    for (let j = 0; j <= segments; j++) {
      for (const idxBase of [outerBase, innerBase]) {
        const k = idxBase + i * (segments + 1) + j;
        positions.push(positions[k * 3], positions[k * 3 + 1], positions[k * 3 + 2]);
        normals.push(t.x, t.y, t.z);
        uvs.push(j / segments, 0);
      }
    }
    for (let j = 0; j < segments; j++) {
      const a = base + j * 2;
      indices.push(a, a + 1, a + 2, a + 2, a + 1, a + 3);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  fixWinding(geo);
  geo.computeBoundingSphere();
  return geo;
}

export function tubeCollider(path, radius, segments = 32) {
  const verts = [];
  const indices = [];
  const count = path.points.length;
  const v = new THREE.Vector3();
  const n = new THREE.Vector3();
  for (let i = 0; i < count; i++) {
    for (let j = 0; j < segments; j++) {
      const a = (j / segments) * Math.PI * 2;
      n.copy(path.sides[i]).multiplyScalar(Math.cos(a)).addScaledVector(path.normals[i], Math.sin(a));
      v.copy(path.points[i]).addScaledVector(n, radius);
      verts.push(v.x, v.y, v.z);
    }
  }
  for (let i = 0; i < count - 1; i++) {
    for (let j = 0; j < segments; j++) {
      const a = i * segments + j;
      const a1 = i * segments + ((j + 1) % segments);
      const b = a + segments;
      const b1 = a1 + segments;
      indices.push(a, b, a1, a1, b, b1);
    }
  }
  return { vertices: new Float32Array(verts), indices: new Uint32Array(indices) };
}
