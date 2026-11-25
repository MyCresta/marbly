import * as THREE from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const quadVert = `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

const blurShader = {
  uniforms: { tColor: { value: null }, dir: { value: new THREE.Vector2() } },
  vertexShader: quadVert,
  fragmentShader: `
    varying vec2 vUv;
    uniform sampler2D tColor;
    uniform vec2 dir;
    void main() {
      vec4 c = texture2D(tColor, vUv) * 0.2270;
      c += texture2D(tColor, vUv + dir * 1.3846) * 0.3162;
      c += texture2D(tColor, vUv - dir * 1.3846) * 0.3162;
      c += texture2D(tColor, vUv + dir * 3.2308) * 0.0703;
      c += texture2D(tColor, vUv - dir * 3.2308) * 0.0703;
      gl_FragColor = c;
    }
  `,
};

const cocChunk = `
  uniform sampler2D tDepth;
  uniform float near;
  uniform float far;
  uniform float focus;
  uniform float strength;
  uniform vec2 resolution;
  float blurAmount(vec2 uv) {
    float z = -perspectiveDepthToViewZ(texture2D(tDepth, uv).x, near, far);
    float coc = abs(1.0 - focus / z) * strength * (resolution.y / 1080.0);
    return smoothstep(0.6, 4.0, coc);
  }
`;

const prepShader = {
  uniforms: {
    tColor: { value: null },
    tDepth: { value: null },
    near: { value: 0.05 },
    far: { value: 20 },
    focus: { value: 1.2 },
    strength: { value: 22 },
    resolution: { value: new THREE.Vector2(1, 1) },
  },
  vertexShader: quadVert,
  fragmentShader: `
    #include <packing>
    varying vec2 vUv;
    uniform sampler2D tColor;
    ${cocChunk}
    void main() {
      vec3 c = texture2D(tColor, vUv).rgb;
      c = c / (1.0 + max(max(c.r, c.g), c.b) * 0.15);
      float w = blurAmount(vUv);
      gl_FragColor = vec4(c * w, w);
    }
  `,
};

const compositeShader = {
  defines: { USE_DOF: 1, USE_FXAA: 0 },
  uniforms: {
    tColor: { value: null },
    tBlur: { value: null },
    tDepth: { value: null },
    near: { value: 0.05 },
    far: { value: 20 },
    focus: { value: 1.2 },
    strength: { value: 22 },
    resolution: { value: new THREE.Vector2(1, 1) },
    vignette: { value: 0.32 },
    time: { value: 0 },
  },
  vertexShader: quadVert,
  fragmentShader: `
    #include <packing>
    varying vec2 vUv;
    uniform sampler2D tColor;
    uniform sampler2D tBlur;
    uniform float vignette;
    ${cocChunk}
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
      #if USE_DOF == 1
        float k = blurAmount(vUv);
        vec4 b = texture2D(tBlur, vUv);
        if (b.a > 0.002) col = mix(col, b.rgb / b.a, k * smoothstep(0.0, 0.25, b.a));
      #endif
      vec2 q = vUv - 0.5;
      col *= clamp(1.0 - dot(q, q) * vignette * 2.2, 0.0, 1.0);
      float g = rand(vUv * resolution + fract(time) * 31.7) - 0.5;
      col += g * 0.012 * (col + 0.02);
      gl_FragColor = vec4(col, 1.0);
    }
  `,
};

export class PostPipeline {
  constructor(renderer, scene, camera) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    this.settings = { msaa: 4, dof: true, bloom: true, bloomScale: 0.5, fxaa: false };
    this.size = { w: 1, h: 1 };
    this.makeSceneTarget();
    const half = { type: THREE.HalfFloatType, depthBuffer: false };
    this.compRT = new THREE.WebGLRenderTarget(1, 1, half);
    this.blurA = new THREE.WebGLRenderTarget(1, 1, half);
    this.blurB = new THREE.WebGLRenderTarget(1, 1, half);
    this.prepMat = new THREE.ShaderMaterial({ ...prepShader, uniforms: THREE.UniformsUtils.clone(prepShader.uniforms), depthTest: false, depthWrite: false });
    this.blurMat = new THREE.ShaderMaterial({ ...blurShader, uniforms: THREE.UniformsUtils.clone(blurShader.uniforms), depthTest: false, depthWrite: false });
    this.compMat = new THREE.ShaderMaterial({ ...compositeShader, defines: { ...compositeShader.defines }, uniforms: THREE.UniformsUtils.clone(compositeShader.uniforms), depthTest: false, depthWrite: false });
    this.quad = new FullScreenQuad(this.prepMat);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.26, 0.45, 1.35);
    this.output = new OutputPass();
    this.output.renderToScreen = true;
  }

  makeSceneTarget() {
    if (this.sceneRT) {
      this.sceneRT.depthTexture.dispose();
      this.sceneRT.dispose();
    }
    const depth = new THREE.DepthTexture(1, 1);
    depth.type = THREE.FloatType;
    this.sceneRT = new THREE.WebGLRenderTarget(this.size.w, this.size.h, { type: THREE.HalfFloatType, samples: this.settings.msaa, depthTexture: depth });
  }

  configure(s) {
    const msaaChanged = s.msaa !== undefined && s.msaa !== this.settings.msaa;
    Object.assign(this.settings, s);
    if (msaaChanged) this.makeSceneTarget();
    const dof = this.settings.dof ? 1 : 0;
    const fxaa = this.settings.fxaa ? 1 : 0;
    if (this.compMat.defines.USE_DOF !== dof || this.compMat.defines.USE_FXAA !== fxaa) {
      this.compMat.defines.USE_DOF = dof;
      this.compMat.defines.USE_FXAA = fxaa;
      this.compMat.needsUpdate = true;
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
    this.compRT.setSize(w, h);
    const bw = Math.max(1, Math.floor(w / 2));
    const bh = Math.max(1, Math.floor(h / 2));
    this.blurA.setSize(bw, bh);
    this.blurB.setSize(bw, bh);
    const bs = this.settings.bloomScale;
    this.bloom.setSize(Math.max(2, Math.floor(w * bs * 2)), Math.max(2, Math.floor(h * bs * 2)));
    this.output.setSize(w, h);
    this.compMat.uniforms.resolution.value.set(w, h);
  }

  pass(material, target) {
    this.quad.material = material;
    this.renderer.setRenderTarget(target);
    this.quad.render(this.renderer);
  }

  render(time, focusDistance) {
    const r = this.renderer;
    r.setRenderTarget(this.sceneRT);
    r.render(this.scene, this.camera);
    const setCoc = (uu) => {
      uu.tDepth.value = this.sceneRT.depthTexture;
      uu.near.value = this.camera.near;
      uu.far.value = this.camera.far;
      uu.focus.value = focusDistance;
      uu.resolution.value.set(this.size.w, this.size.h);
    };
    if (this.settings.dof) {
      const pu = this.prepMat.uniforms;
      pu.tColor.value = this.sceneRT.texture;
      setCoc(pu);
      this.pass(this.prepMat, this.blurA);
      const bu = this.blurMat.uniforms;
      bu.tColor.value = this.blurA.texture;
      bu.dir.value.set(1.6 / this.blurA.width, 0);
      this.pass(this.blurMat, this.blurB);
      bu.tColor.value = this.blurB.texture;
      bu.dir.value.set(0, 1.6 / this.blurA.height);
      this.pass(this.blurMat, this.blurA);
    }
    const u = this.compMat.uniforms;
    u.tColor.value = this.sceneRT.texture;
    u.tBlur.value = this.blurA.texture;
    setCoc(u);
    u.time.value = time;
    this.pass(this.compMat, this.compRT);
    if (this.settings.bloom) this.bloom.render(r, null, this.compRT, 0, false);
    this.output.render(r, null, this.compRT);
  }
}
