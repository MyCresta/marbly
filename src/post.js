import * as THREE from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

const quadVert = `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

const brightShader = {
  uniforms: { tColor: { value: null }, texel: { value: new THREE.Vector2() }, threshold: { value: 1.2 } },
  vertexShader: quadVert,
  fragmentShader: `
    varying vec2 vUv;
    uniform sampler2D tColor;
    uniform vec2 texel;
    uniform float threshold;
    void main() {
      vec3 c = texture2D(tColor, vUv + texel * vec2(-1.0, -1.0)).rgb;
      c += texture2D(tColor, vUv + texel * vec2(1.0, -1.0)).rgb;
      c += texture2D(tColor, vUv + texel * vec2(-1.0, 1.0)).rgb;
      c += texture2D(tColor, vUv + texel * vec2(1.0, 1.0)).rgb;
      c *= 0.25;
      float peak = max(max(c.r, c.g), c.b);
      float soft = clamp(peak - threshold + 0.5, 0.0, 1.0);
      soft = soft * soft * 0.5;
      float contrib = max(soft, peak - threshold) / max(peak, 1e-4);
      c *= contrib;
      c = c / (1.0 + max(max(c.r, c.g), c.b) * 0.1);
      gl_FragColor = vec4(c, 1.0);
    }
  `,
};

const blurShader = {
  uniforms: { tColor: { value: null }, dir: { value: new THREE.Vector2() } },
  vertexShader: quadVert,
  fragmentShader: `
    varying vec2 vUv;
    uniform sampler2D tColor;
    uniform vec2 dir;
    void main() {
      vec3 c = texture2D(tColor, vUv).rgb * 0.2270;
      c += texture2D(tColor, vUv + dir * 1.3846).rgb * 0.3162;
      c += texture2D(tColor, vUv - dir * 1.3846).rgb * 0.3162;
      c += texture2D(tColor, vUv + dir * 3.2308).rgb * 0.0703;
      c += texture2D(tColor, vUv - dir * 3.2308).rgb * 0.0703;
      gl_FragColor = vec4(c, 1.0);
    }
  `,
};

const copyShader = {
  uniforms: { tColor: { value: null } },
  vertexShader: quadVert,
  fragmentShader: `
    varying vec2 vUv;
    uniform sampler2D tColor;
    void main() { gl_FragColor = vec4(texture2D(tColor, vUv).rgb, 1.0); }
  `,
};

const finalShader = {
  defines: { USE_FXAA: 0, USE_BLOOM: 1 },
  uniforms: {
    tColor: { value: null },
    tBloomA: { value: null },
    tBloomB: { value: null },
    bloomStrength: { value: 0.32 },
    resolution: { value: new THREE.Vector2(1, 1) },
    vignette: { value: 0.32 },
    time: { value: 0 },
  },
  vertexShader: quadVert,
  fragmentShader: `
    varying vec2 vUv;
    uniform sampler2D tColor;
    uniform sampler2D tBloomA;
    uniform sampler2D tBloomB;
    uniform float bloomStrength;
    uniform vec2 resolution;
    uniform float vignette;
    uniform float time;
    float rand(vec2 co) { return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453); }
    float luma(vec3 c) { return sqrt(dot(c / (1.0 + c), vec3(0.299, 0.587, 0.114))); }
    vec3 fxaa(vec2 uv) {
      vec2 px = 1.0 / resolution;
      vec3 cM = texture2D(tColor, uv).rgb;
      float lM = luma(cM);
      float lNW = luma(texture2D(tColor, uv + vec2(-1.0, -1.0) * px).rgb);
      float lNE = luma(texture2D(tColor, uv + vec2(1.0, -1.0) * px).rgb);
      float lSW = luma(texture2D(tColor, uv + vec2(-1.0, 1.0) * px).rgb);
      float lSE = luma(texture2D(tColor, uv + vec2(1.0, 1.0) * px).rgb);
      float lMin = min(lM, min(min(lNW, lNE), min(lSW, lSE)));
      float lMax = max(lM, max(max(lNW, lNE), max(lSW, lSE)));
      if (lMax - lMin < max(0.03, lMax * 0.125)) return cM;
      vec2 dir = vec2(-((lNW + lNE) - (lSW + lSE)), (lNW + lSW) - (lNE + lSE));
      float reduce = max((lNW + lNE + lSW + lSE) * 0.03125, 0.0078125);
      float rcp = 1.0 / (min(abs(dir.x), abs(dir.y)) + reduce);
      dir = clamp(dir * rcp, -8.0, 8.0) * px;
      vec3 a = 0.5 * (texture2D(tColor, uv + dir * (1.0 / 3.0 - 0.5)).rgb + texture2D(tColor, uv + dir * (2.0 / 3.0 - 0.5)).rgb);
      vec3 b = a * 0.5 + 0.25 * (texture2D(tColor, uv - dir * 0.5).rgb + texture2D(tColor, uv + dir * 0.5).rgb);
      float lB = luma(b);
      return (lB < lMin || lB > lMax) ? a : b;
    }
    void main() {
      #if USE_FXAA == 1
        vec3 col = fxaa(vUv);
      #else
        vec3 col = texture2D(tColor, vUv).rgb;
      #endif
      #if USE_BLOOM == 1
        col += (texture2D(tBloomA, vUv).rgb * 0.55 + texture2D(tBloomB, vUv).rgb * 0.75) * bloomStrength;
      #endif
      vec2 q = vUv - 0.5;
      col *= clamp(1.0 - dot(q, q) * vignette * 2.2, 0.0, 1.0);
      float g = rand(vUv * resolution + fract(time) * 31.7) - 0.5;
      col += g * 0.012 * (col + 0.02);
      gl_FragColor = vec4(col, 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }
  `,
};

export class PostPipeline {
  constructor(renderer, scene, camera) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    this.settings = { msaa: 4, bloom: true, fxaa: false };
    this.size = { w: 1, h: 1 };
    this.makeSceneTarget();
    const small = { type: THREE.HalfFloatType, depthBuffer: false };
    this.bA = new THREE.WebGLRenderTarget(1, 1, small);
    this.bA2 = new THREE.WebGLRenderTarget(1, 1, small);
    this.bB = new THREE.WebGLRenderTarget(1, 1, small);
    this.bB2 = new THREE.WebGLRenderTarget(1, 1, small);
    const mk = (sh) => new THREE.ShaderMaterial({ ...sh, defines: { ...(sh.defines || {}) }, uniforms: THREE.UniformsUtils.clone(sh.uniforms), depthTest: false, depthWrite: false });
    this.brightMat = mk(brightShader);
    this.blurMat = mk(blurShader);
    this.copyMat = mk(copyShader);
    this.finalMat = mk(finalShader);
    this.finalMat.toneMapped = true;
    this.quad = new FullScreenQuad(this.finalMat);
  }

  makeSceneTarget() {
    if (this.sceneRT) this.sceneRT.dispose();
    this.sceneRT = new THREE.WebGLRenderTarget(this.size.w, this.size.h, { type: THREE.HalfFloatType, samples: this.settings.msaa });
  }

  configure(s) {
    const msaaChanged = s.msaa !== undefined && s.msaa !== this.settings.msaa;
    Object.assign(this.settings, s);
    if (msaaChanged) this.makeSceneTarget();
    const d = this.finalMat.defines;
    const fx = this.settings.fxaa ? 1 : 0;
    const bl = this.settings.bloom ? 1 : 0;
    if (d.USE_FXAA !== fx || d.USE_BLOOM !== bl) {
      d.USE_FXAA = fx;
      d.USE_BLOOM = bl;
      this.finalMat.needsUpdate = true;
    }
    this.applySizes();
  }

  setSize(w, h, pixelRatio) {
    this.size = { w: Math.max(1, Math.floor(w * pixelRatio)), h: Math.max(1, Math.floor(h * pixelRatio)) };
    this.applySizes();
  }

  applySizes() {
    const { w, h } = this.size;
    this.sceneRT.setSize(w, h);
    const qw = Math.max(1, Math.floor(w / 4));
    const qh = Math.max(1, Math.floor(h / 4));
    this.bA.setSize(qw, qh);
    this.bA2.setSize(qw, qh);
    this.bB.setSize(Math.max(1, Math.floor(qw / 2)), Math.max(1, Math.floor(qh / 2)));
    this.bB2.setSize(Math.max(1, Math.floor(qw / 2)), Math.max(1, Math.floor(qh / 2)));
    this.finalMat.uniforms.resolution.value.set(w, h);
  }

  pass(material, target) {
    this.quad.material = material;
    this.renderer.setRenderTarget(target);
    this.quad.render(this.renderer);
  }

  blur(src, tmp) {
    const u = this.blurMat.uniforms;
    u.tColor.value = src.texture;
    u.dir.value.set(1 / src.width, 0);
    this.pass(this.blurMat, tmp);
    u.tColor.value = tmp.texture;
    u.dir.value.set(0, 1 / src.height);
    this.pass(this.blurMat, src);
  }

  render(time) {
    const r = this.renderer;
    r.setRenderTarget(this.sceneRT);
    r.render(this.scene, this.camera);
    if (this.settings.bloom) {
      const bu = this.brightMat.uniforms;
      bu.tColor.value = this.sceneRT.texture;
      bu.texel.value.set(1 / this.size.w, 1 / this.size.h);
      this.pass(this.brightMat, this.bA);
      this.blur(this.bA, this.bA2);
      this.copyMat.uniforms.tColor.value = this.bA.texture;
      this.pass(this.copyMat, this.bB);
      this.blur(this.bB, this.bB2);
    }
    const u = this.finalMat.uniforms;
    u.tColor.value = this.sceneRT.texture;
    u.tBloomA.value = this.bA.texture;
    u.tBloomB.value = this.bB.texture;
    u.time.value = time;
    this.pass(this.finalMat, null);
  }
}
