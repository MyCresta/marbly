import * as THREE from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const TAPS = 44;

const dofShader = {
  uniforms: {
    tColor: { value: null },
    tDepth: { value: null },
    near: { value: 0.05 },
    far: { value: 20 },
    focus: { value: 1.2 },
    strength: { value: 22 },
    maxCoc: { value: 12 },
    resolution: { value: new THREE.Vector2(1, 1) },
    vignette: { value: 0.32 },
    time: { value: 0 },
    enabled: { value: 1 },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
  `,
  fragmentShader: `
    #include <packing>
    varying vec2 vUv;
    uniform sampler2D tColor;
    uniform sampler2D tDepth;
    uniform float near;
    uniform float far;
    uniform float focus;
    uniform float strength;
    uniform float maxCoc;
    uniform vec2 resolution;
    uniform float vignette;
    uniform float time;
    uniform float enabled;

    float linearDepth(vec2 uv) {
      float d = texture2D(tDepth, uv).x;
      return -perspectiveDepthToViewZ(d, near, far);
    }
    float coc(float z) {
      float c = abs(1.0 - focus / z) * strength * (resolution.y / 1080.0);
      return min(c, maxCoc * (resolution.y / 1080.0));
    }
    float rand(vec2 co) { return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453); }

    void main() {
      vec4 base = texture2D(tColor, vUv);
      vec3 col = base.rgb;
      if (enabled > 0.5) {
        float zc = linearDepth(vUv);
        float cc = coc(zc);
        vec3 acc = col;
        float wsum = 1.0;
        float golden = 2.39996323;
        float maxR = maxCoc * (resolution.y / 1080.0);
        float spin = rand(vUv * resolution) * 6.2831;
        for (int i = 1; i < ${TAPS}; i++) {
          float fi = float(i);
          float r = sqrt(fi / float(${TAPS})) * maxR;
          float a = fi * golden + spin;
          vec2 off = vec2(cos(a), sin(a)) * r / resolution;
          vec2 suv = vUv + off;
          float zs = linearDepth(suv);
          float cs = coc(zs);
          if (zs > zc) cs = min(cs, cc * 1.6);
          float w = smoothstep(r - 1.0, r + 0.5, cs);
          acc += texture2D(tColor, suv).rgb * w;
          wsum += w;
        }
        col = acc / wsum;
      }
      vec2 q = vUv - 0.5;
      float v = 1.0 - dot(q, q) * vignette * 2.2;
      col *= clamp(v, 0.0, 1.0);
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
    this.samples = 4;
    const depth = new THREE.DepthTexture(1, 1);
    depth.type = THREE.FloatType;
    this.sceneRT = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: this.samples, depthTexture: depth });
    this.dofRT = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: false });
    this.dofMat = new THREE.ShaderMaterial({ ...dofShader, uniforms: THREE.UniformsUtils.clone(dofShader.uniforms), depthTest: false, depthWrite: false });
    this.quad = new FullScreenQuad(this.dofMat);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.3, 0.5, 1.0);
    this.output = new OutputPass();
    this.output.renderToScreen = true;
    this.dofEnabled = true;
  }

  setSize(w, h, pixelRatio) {
    const pw = Math.floor(w * pixelRatio);
    const ph = Math.floor(h * pixelRatio);
    this.sceneRT.setSize(pw, ph);
    this.dofRT.setSize(pw, ph);
    this.bloom.setSize(pw, ph);
    this.output.setSize(pw, ph);
    this.dofMat.uniforms.resolution.value.set(pw, ph);
  }

  render(time, focusDistance) {
    const r = this.renderer;
    const u = this.dofMat.uniforms;
    u.tColor.value = this.sceneRT.texture;
    u.tDepth.value = this.sceneRT.depthTexture;
    u.near.value = this.camera.near;
    u.far.value = this.camera.far;
    u.focus.value = focusDistance;
    u.time.value = time;
    u.enabled.value = this.dofEnabled ? 1 : 0;
    r.setRenderTarget(this.sceneRT);
    r.render(this.scene, this.camera);
    r.setRenderTarget(this.dofRT);
    this.quad.render(r);
    this.bloom.render(r, null, this.dofRT, 0, false);
    this.output.render(r, null, this.dofRT);
  }
}
