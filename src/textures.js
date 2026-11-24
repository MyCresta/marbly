import * as THREE from 'three';

function hash(x, y, seed) {
  let h = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h & 0xffffff) / 0xffffff;
}

function mod(a, n) {
  return ((a % n) + n) % n;
}

export function makeNoise(seed = 1) {
  return function noise(x, y, px = 1 << 20, py = 1 << 20) {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const xf = x - xi;
    const yf = y - yi;
    const u = xf * xf * (3 - 2 * xf);
    const v = yf * yf * (3 - 2 * yf);
    const x0 = mod(xi, px);
    const x1 = mod(xi + 1, px);
    const y0 = mod(yi, py);
    const y1 = mod(yi + 1, py);
    const a = hash(x0, y0, seed);
    const b = hash(x1, y0, seed);
    const c = hash(x0, y1, seed);
    const d = hash(x1, y1, seed);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
}

export function makeFbm(seed = 1) {
  const n = makeNoise(seed);
  return function fbm(x, y, px, py, octaves = 4) {
    let sum = 0;
    let amp = 0.5;
    let norm = 0;
    let f = 1;
    for (let o = 0; o < octaves; o++) {
      sum += n(x * f, y * f, px * f, py * f) * amp;
      norm += amp;
      amp *= 0.5;
      f *= 2;
    }
    return sum / norm;
  };
}

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function toTexture(c, { srgb = true, repeat = [1, 1], anisotropy = 8 } = {}) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat[0], repeat[1]);
  t.anisotropy = anisotropy;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.needsUpdate = true;
  return t;
}

function heightToNormal(height, w, h, strength) {
  const c = canvas(w, h);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const l = height[y * w + ((x - 1 + w) % w)];
      const r = height[y * w + ((x + 1) % w)];
      const u = height[((y - 1 + h) % h) * w + x];
      const d = height[((y + 1) % h) * w + x];
      let nx = (l - r) * strength;
      let ny = (d - u) * strength;
      let nz = 1;
      const len = Math.hypot(nx, ny, nz);
      nx /= len; ny /= len; nz /= len;
      const i = (y * w + x) * 4;
      img.data[i] = (nx * 0.5 + 0.5) * 255;
      img.data[i + 1] = (ny * 0.5 + 0.5) * 255;
      img.data[i + 2] = (nz * 0.5 + 0.5) * 255;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

function grayCanvas(values, w, h) {
  const c = canvas(w, h);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(w, h);
  for (let i = 0; i < w * h; i++) {
    const g = Math.max(0, Math.min(255, values[i] * 255));
    img.data[i * 4] = g;
    img.data[i * 4 + 1] = g;
    img.data[i * 4 + 2] = g;
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

const lerp = (a, b, t) => a + (b - a) * t;
const hexRgb = (hex) => {
  const c = new THREE.Color(hex);
  return [c.r * 255, c.g * 255, c.b * 255];
};

export function woodTextures({ w = 1024, h = 1024, seed = 3, dark = '#3a2416', light = '#7a5233', rings = 9, warp = 2.2, pores = 0.18, figure = 1, roughBase = 0.5, roughVar = 0.2, normalStrength = 2.2 } = {}) {
  const fbm = makeFbm(seed);
  const noise = makeNoise(seed + 7);
  const cd = hexRgb(dark);
  const cl = hexRgb(light);
  const color = canvas(w, h);
  const ctx = color.getContext('2d');
  const img = ctx.createImageData(w, h);
  const height = new Float32Array(w * h);
  const rough = new Float32Array(w * h);
  const gx = 4;
  const gy = 3;
  for (let y = 0; y < h; y++) {
    const v = y / h;
    for (let x = 0; x < w; x++) {
      const u = x / w;
      const warpN = fbm(u * gx, v * gy, gx, gy, 4) - 0.5;
      const fine = fbm(u * 2, v * 48, 2, 48, 3) - 0.5;
      const g = (u * rings + warpN * warp * figure + fine * 0.35) % 1;
      const ring = Math.pow(Math.abs(Math.sin(g * Math.PI)), 0.6);
      const streak = noise(u * 2, v * 320, 2, 320);
      const pore = Math.pow(noise(u * 700, v * 18, 700, 18), 6) * pores * 4;
      const band = fbm(u * 1, v * 6, 1, 6, 2);
      let t = ring * 0.65 + streak * 0.2 + band * 0.25;
      t = Math.min(1, Math.max(0, t - pore));
      const i = (y * w + x) * 4;
      img.data[i] = lerp(cd[0], cl[0], t);
      img.data[i + 1] = lerp(cd[1], cl[1], t);
      img.data[i + 2] = lerp(cd[2], cl[2], t);
      img.data[i + 3] = 255;
      height[y * w + x] = t * 0.3 - pore * 1.5;
      rough[y * w + x] = roughBase + (1 - t) * roughVar + pore * 0.4;
    }
  }
  ctx.putImageData(img, 0, 0);
  return {
    map: toTexture(color),
    roughnessMap: toTexture(grayCanvas(rough, w, h), { srgb: false }),
    normalMap: toTexture(heightToNormal(height, w, h, normalStrength), { srgb: false }),
  };
}

export function noiseSurface({ w = 512, h = 512, seed = 11, base = '#2f5a3e', varColor = '#3c6c4c', scale = 64, octaves = 5, roughBase = 0.9, roughVar = 0.08, normalStrength = 3, fiber = 0 } = {}) {
  const fbm = makeFbm(seed);
  const noise = makeNoise(seed + 3);
  const cb = hexRgb(base);
  const cv = hexRgb(varColor);
  const color = canvas(w, h);
  const ctx = color.getContext('2d');
  const img = ctx.createImageData(w, h);
  const height = new Float32Array(w * h);
  const rough = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const u = x / w;
      const v = y / h;
      let t = fbm(u * scale, v * scale, scale, scale, octaves);
      const low = fbm(u * 4, v * 4, 4, 4, 3);
      if (fiber) t = t * (1 - fiber) + noise(u * scale * 4, v * scale * 4, scale * 4, scale * 4) * fiber;
      const m = Math.min(1, Math.max(0, t * 0.7 + low * 0.5 - 0.1));
      const i = (y * w + x) * 4;
      img.data[i] = lerp(cb[0], cv[0], m);
      img.data[i + 1] = lerp(cb[1], cv[1], m);
      img.data[i + 2] = lerp(cb[2], cv[2], m);
      img.data[i + 3] = 255;
      height[y * w + x] = t;
      rough[y * w + x] = roughBase + (t - 0.5) * roughVar;
    }
  }
  ctx.putImageData(img, 0, 0);
  return {
    map: toTexture(color),
    roughnessMap: toTexture(grayCanvas(rough, w, h), { srgb: false }),
    normalMap: toTexture(heightToNormal(height, w, h, normalStrength), { srgb: false }),
  };
}

export function swirlTexture({ w = 1024, h = 512, seed = 5, colors = ['#f6efe2', '#e2603f', '#f1b24a', '#2f6f8f', '#1f2d3d'] } = {}) {
  const fbm = makeFbm(seed);
  const cols = colors.map(hexRgb);
  const c = canvas(w, h);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const u = x / w;
      const v = y / h;
      const wx = fbm(u * 3, v * 2, 3, 2, 4);
      const wy = fbm(u * 3 + 5.2, v * 2 + 1.3, 3, 2, 4);
      const s = (u * 3 + v * 1.5 + wx * 2.2 + wy * 1.4) % 1;
      const f = s * cols.length;
      const k = Math.floor(f);
      const t = f - k;
      const a = cols[k % cols.length];
      const b = cols[(k + 1) % cols.length];
      const e = t < 0.78 ? 0 : (t - 0.78) / 0.22;
      const sm = e * e * (3 - 2 * e);
      const i = (y * w + x) * 4;
      img.data[i] = lerp(a[0], b[0], sm);
      img.data[i + 1] = lerp(a[1], b[1], sm);
      img.data[i + 2] = lerp(a[2], b[2], sm);
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const t = toTexture(c);
  t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

export function speckleTexture({ w = 512, h = 256, base = '#c8423c', fleck = '#e86a56', seed = 21, density = 0.03 } = {}) {
  const noise = makeNoise(seed);
  const fbm = makeFbm(seed + 1);
  const cb = hexRgb(base);
  const cf = hexRgb(fleck);
  const c = canvas(w, h);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const u = x / w;
      const v = y / h;
      const n = noise(u * 220, v * 110, 220, 110);
      const fl = n > 1 - density ? 1 : 0;
      const tone = fbm(u * 6, v * 3, 6, 3, 3) * 0.25;
      const i = (y * w + x) * 4;
      img.data[i] = lerp(cb[0], cf[0], fl) * (0.88 + tone);
      img.data[i + 1] = lerp(cb[1], cf[1], fl) * (0.88 + tone);
      img.data[i + 2] = lerp(cb[2], cf[2], fl) * (0.88 + tone);
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return toTexture(c);
}

export function textTexture(lines, { w = 512, h = 160, bg = null, color = '#2b1a0e', font = 'Fraunces, Georgia, serif' } = {}) {
  const c = canvas(w, h);
  const ctx = c.getContext('2d');
  if (bg) {
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);
  }
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = color;
  for (const line of lines) {
    ctx.font = line.font || `${line.weight || 600} ${line.size}px ${font}`;
    if (line.spacing) ctx.letterSpacing = `${line.spacing}px`;
    else ctx.letterSpacing = '0px';
    ctx.globalAlpha = line.alpha ?? 1;
    ctx.fillText(line.text, w / 2, line.y);
  }
  ctx.globalAlpha = 1;
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return { texture: t, canvas: c, ctx };
}

export function artPrintTexture({ w = 768, h = 1024 } = {}) {
  const c = canvas(w, h);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#efe6d4';
  ctx.fillRect(0, 0, w, h);
  const shapes = [
    { x: 0.36, y: 0.36, r: 0.24, c: '#d06b3f' },
    { x: 0.62, y: 0.52, r: 0.2, c: '#2f5d62' },
    { x: 0.44, y: 0.7, r: 0.15, c: '#e3b04b' },
  ];
  ctx.globalCompositeOperation = 'multiply';
  for (const s of shapes) {
    ctx.fillStyle = s.c;
    ctx.beginPath();
    ctx.arc(s.x * w, s.y * h, s.r * w, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalCompositeOperation = 'source-over';
  ctx.strokeStyle = '#2a2420';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(w * 0.18, h * 0.86);
  ctx.lineTo(w * 0.82, h * 0.86);
  ctx.stroke();
  const fbm = makeFbm(77);
  const img = ctx.getImageData(0, 0, w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const n = (fbm(x / 6, y / 6, 1e6, 1e6, 2) - 0.5) * 22;
      const i = (y * w + x) * 4;
      img.data[i] += n;
      img.data[i + 1] += n;
      img.data[i + 2] += n;
    }
  }
  ctx.putImageData(img, 0, 0);
  return toTexture(c);
}

export function bookSpineTexture() {
  const w = 64;
  const h = 256;
  const c = canvas(w, h);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.fillRect(0, h * 0.1, w, 6);
  ctx.fillRect(0, h * 0.86, w, 6);
  ctx.fillStyle = 'rgba(255,236,190,0.75)';
  ctx.fillRect(w * 0.25, h * 0.3, w * 0.5, h * 0.36);
  return toTexture(c);
}
