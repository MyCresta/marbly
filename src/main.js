import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import RAPIER from 'rapier';
import { buildCourse } from './course.js';
import { Physics, STEP } from './physics.js';
import { MARBLE_TYPES, MARBLE_RADIUS } from './marbles.js';
import { createSceneMaterials, MarbleFactory } from './materials.js';
import { buildRoom, buildFan } from './room.js';
import { PostPipeline } from './post.js';
import { SoundBoard } from './audio.js';
import { textTexture } from './textures.js';
import { createUI } from './ui.js';

const MAX_MARBLES = 48;
const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));

const VIEWS = {
  overview: { pos: [0.14, 1.02, 2.05], target: [0.0, 0.25, 0.02] },
  helix: { pos: [-0.12, 0.78, 0.42], target: [-0.42, 0.56, -0.1] },
  funnel: { pos: [0.5, 0.66, 0.3], target: [0.3, 0.33, -0.1] },
  sorter: { pos: [0.06, 0.46, 0.86], target: [0.4, 0.02, 0.16] },
};

async function boot() {
  const ui = createUI();
  ui.progress(0.05, 'Starting physics');
  await RAPIER.init();
  await nextFrame();

  const canvas = document.getElementById('scene');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  const maxPR = Math.min(window.devicePixelRatio || 1, 1.75);
  let pixelRatio = maxPR;
  renderer.setPixelRatio(1);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#0e0b09');
  const camera = new THREE.PerspectiveCamera(34, window.innerWidth / window.innerHeight, 0.02, 12);
  const viewFor = (name) => {
    const v = VIEWS[name];
    const aspect = window.innerWidth / window.innerHeight;
    if (aspect >= 1.1) return v;
    const t = new THREE.Vector3().fromArray(v.target);
    const p = new THREE.Vector3().fromArray(v.pos).sub(t).multiplyScalar(aspect < 0.8 ? 1.3 : 1.12).add(t);
    return { pos: p.toArray(), target: v.target };
  };
  camera.position.fromArray(viewFor('overview').pos);

  ui.progress(0.15, 'Turning the wood');
  await nextFrame();
  const mats = createSceneMaterials();
  ui.progress(0.45, 'Building the course');
  await nextFrame();

  const course = buildCourse();
  const courseGroup = new THREE.Group();
  for (const p of course.pieces) {
    const m = new THREE.Mesh(p.geometry, mats[p.material]);
    m.castShadow = p.castShadow;
    m.receiveShadow = p.receiveShadow;
    m.name = p.name || '';
    courseGroup.add(m);
  }
  scene.add(courseGroup);

  ui.progress(0.6, 'Furnishing the room');
  await nextFrame();
  const room = buildRoom(mats);
  scene.add(room.group);
  const fan = buildFan(mats, course.fan);
  scene.add(fan.group);

  const hemi = new THREE.HemisphereLight(0xe6d2b6, 0x3a281c, 0.55);
  scene.add(hemi);
  const moon = new THREE.DirectionalLight(0xa9bcff, 1.1);
  moon.position.set(room.window.cx + 0.4, 1.5, -2.2);
  moon.target.position.set(0.1, 0, 0.1);
  moon.castShadow = true;
  moon.shadow.mapSize.set(1024, 1024);
  Object.assign(moon.shadow.camera, { left: -1, right: 1, top: 1, bottom: -1, near: 0.5, far: 5 });
  moon.shadow.bias = -0.0004;
  moon.shadow.normalBias = 0.003;
  moon.shadow.radius = 6;
  scene.add(moon, moon.target);
  const fill = new THREE.PointLight(0xffd2a8, 1.4, 6, 1.2);
  fill.position.set(0.5, 1.2, 1.6);
  scene.add(fill);
  const floorLamp = new THREE.PointLight(0xffb878, 2.2, 6, 1.4);
  floorLamp.position.set(1.5, 1.05, 0.9);
  scene.add(floorLamp);

  const plaques = buildPlaques(course, scene);
  const streaks = buildWindStreaks(course, scene);

  ui.progress(0.75, 'Catching the light');
  await nextFrame();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envRT = pmrem.fromScene(scene, 0.015, 0.02, 10, { size: 256, position: new THREE.Vector3(0.05, 0.42, 0.32) });
  scene.environment = envRT.texture;
  scene.environmentIntensity = 1.25;
  pmrem.dispose();

  const factory = new MarbleFactory();
  const physics = new Physics(RAPIER, course);
  const sound = new SoundBoard();

  ui.progress(0.88, 'Polishing marbles');
  await nextFrame();
  const pmrem2 = new THREE.PMREMGenerator(renderer);
  const studio = pmrem2.fromScene(new RoomEnvironment(), 0.045).texture;
  const thumbs = renderThumbnails(renderer, factory, studio);
  pmrem2.dispose();

  const post = new PostPipeline(renderer, scene, camera);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.075;
  controls.minDistance = 0.22;
  controls.maxDistance = 3;
  controls.maxPolarAngle = 1.5;
  controls.minAzimuthAngle = -1.25;
  controls.maxAzimuthAngle = 1.25;
  controls.rotateSpeed = 0.6;
  controls.zoomSpeed = 0.8;
  controls.panSpeed = 0.6;
  controls.screenSpacePanning = true;
  controls.target.fromArray(VIEWS.overview.target);
  controls.update();

  const resize = () => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    renderer.setPixelRatio(pixelRatio);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.fov = w / h < 0.9 ? 52 : 34;
    camera.updateProjectionMatrix();
    post.setSize(w, h, pixelRatio);
  };
  resize();
  window.addEventListener('resize', resize);

  const state = {
    selected: 5,
    auto: false,
    autoTimer: 0,
    queue: [],
    queueTimer: 0,
    marbles: [],
    view: 'overview',
    follow: null,
    tween: null,
    lastInteraction: performance.now(),
    windOn: true,
  };

  const spawn = (type) => {
    state.queue.push(type);
  };

  const releaseNext = () => {
    const s = course.spawn;
    for (const m of state.marbles) {
      const p = m.phys.body.translation();
      if (Math.hypot(p.x - s.x, p.y - s.y, p.z - s.z) < 0.035) return false;
    }
    const type = state.queue.shift();
    const live = state.marbles.filter((m) => !m.retiring);
    if (live.length >= MAX_MARBLES) retire(live[0]);
    const jitter = () => (Math.random() - 0.5) * 0.006;
    const phys = physics.addMarble(type, { x: s.x + jitter(), y: s.y, z: s.z + jitter() });
    const mesh = factory.create(type);
    mesh.scale.setScalar(0.001);
    scene.add(mesh);
    const marble = { phys, mesh, type, age: 0, retiring: false, retireT: 0, settled: 0, counted: null };
    state.marbles.push(marble);
    if (state.view === 'follow' && (!state.follow || state.follow.retiring || state.follow.settled > 0.5)) state.follow = marble;
    return true;
  };

  const retire = (m) => {
    if (m.retiring) return;
    m.retiring = true;
    m.retireT = 0;
  };

  const clearAll = () => {
    state.queue.length = 0;
    for (const m of state.marbles) retire(m);
  };

  const setView = (name) => {
    state.view = name;
    ui.setView(name);
    if (name === 'follow') {
      followDir.set(0.42, 0.42, 0.8).normalize();
      const moving = [...state.marbles].reverse().find((m) => !m.retiring && m.settled < 0.5);
      state.follow = moving || null;
      return;
    }
    state.follow = null;
    const v = viewFor(name);
    state.tween = {
      t: 0,
      fromPos: camera.position.clone(),
      fromTarget: controls.target.clone(),
      toPos: new THREE.Vector3().fromArray(v.pos),
      toTarget: new THREE.Vector3().fromArray(v.target),
    };
  };

  ui.init({
    types: MARBLE_TYPES,
    thumbs,
    selected: state.selected,
    onSelect: (i) => { state.selected = i; },
    onDrop: () => { sound.unlock(); spawn(MARBLE_TYPES[state.selected]); },
    onDropAll: () => { sound.unlock(); MARBLE_TYPES.forEach((t) => spawn(t)); },
    onAuto: (on) => { sound.unlock(); state.auto = on; state.autoTimer = 0.2; },
    onClear: clearAll,
    onView: setView,
    onWind: (on) => { state.windOn = on; physics.windEnabled = on; },
    onSound: (on) => { sound.unlock(); sound.setEnabled(on); },
    massOf: (t) => (4 / 3) * Math.PI * MARBLE_RADIUS ** 3 * t.density * 1000,
    bins: course.bins,
  });

  const markInteraction = () => {
    state.lastInteraction = performance.now();
    sound.unlock();
    if (state.tween) state.tween = null;
  };
  canvas.addEventListener('pointerdown', markInteraction);
  canvas.addEventListener('wheel', markInteraction, { passive: true });

  const roomMin = new THREE.Vector3(room.room.left + 0.15, -0.02, room.room.back + 0.12);
  const roomMax = new THREE.Vector3(room.room.right - 0.15, room.room.ceiling - 0.15, room.room.front - 0.2);
  const targetMin = new THREE.Vector3(-0.9, 0, -0.5);
  const targetMax = new THREE.Vector3(0.9, 0.8, 0.5);

  let last = performance.now();
  let acc = 0;
  let elapsed = 0;
  let focus = camera.position.distanceTo(controls.target);
  const perf = { sum: 0, n: 0, level: 0, cooldown: 3 };
  const tmpV = new THREE.Vector3();
  const tmpSize = new THREE.Vector2();
  const offset = new THREE.Vector3();
  const followDir = new THREE.Vector3(0.42, 0.42, 0.8).normalize();
  let dragging = false;
  canvas.addEventListener('pointerdown', () => { dragging = true; });
  window.addEventListener('pointerup', () => {
    if (dragging && state.view === 'follow') followDir.copy(camera.position).sub(controls.target).normalize();
    dragging = false;
  });
  const binCounts = { heavy: 0, medium: 0, light: 0 };

  window.__marbly = {
    warp(seconds) {
      const n = Math.round(seconds / STEP);
      for (let i = 0; i < n; i++) physics.step();
    },
  };

  ui.progress(1, 'Ready');
  await nextFrame();
  ui.ready();
  setTimeout(() => {
    if (state.marbles.length === 0 && state.queue.length === 0) {
      [5, 0, 3].forEach((i) => spawn(MARBLE_TYPES[i]));
    }
  }, 900);

  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    elapsed += dt;

    perf.sum += dt;
    perf.n++;
    perf.cooldown -= dt;
    if (perf.n >= 90) {
      const avg = perf.sum / perf.n;
      if (avg > 1 / 38 && perf.cooldown < 0) {
        if (pixelRatio > 1.01) {
          pixelRatio = Math.max(1, pixelRatio - 0.35);
          resize();
        } else if (post.dofEnabled) {
          post.dofEnabled = false;
        } else if (renderer.shadowMap.enabled && room.lamp.spot.shadow.mapSize.x > 1024) {
          room.lamp.spot.shadow.mapSize.set(1024, 1024);
          room.lamp.spot.shadow.map?.dispose();
          room.lamp.spot.shadow.map = null;
        }
        perf.cooldown = 3;
      }
      perf.sum = 0;
      perf.n = 0;
    }

    if (state.auto) {
      state.autoTimer -= dt;
      if (state.autoTimer <= 0 && state.queue.length < 2) {
        spawn(MARBLE_TYPES[Math.floor(Math.random() * MARBLE_TYPES.length)]);
        state.autoTimer = 1.7 + Math.random() * 1.1;
      }
    }
    state.queueTimer -= dt;
    if (state.queue.length && state.queueTimer <= 0) {
      if (releaseNext()) state.queueTimer = 0.85;
      else state.queueTimer = 0.1;
    }

    acc += dt;
    let steps = 0;
    while (acc >= STEP && steps < 12) {
      physics.step();
      acc -= STEP;
      steps++;
    }
    if (steps === 12) acc = 0;

    sound.frame();
    let rolling = 0;
    let rollSpeed = 0;
    let funnelAct = 0;
    binCounts.heavy = 0;
    binCounts.medium = 0;
    binCounts.light = 0;
    const F = course.funnel;
    for (let i = state.marbles.length - 1; i >= 0; i--) {
      const m = state.marbles[i];
      const body = m.phys.body;
      const p = body.translation();
      const q = body.rotation();
      m.mesh.position.set(p.x, p.y, p.z);
      m.mesh.quaternion.set(q.x, q.y, q.z, q.w);
      m.age += dt;
      let scale = Math.min(1, 0.25 + m.age * 4);
      if (m.retiring) {
        m.retireT += dt;
        scale = Math.max(0, 1 - m.retireT / 0.35);
        if (m.retireT >= 0.35) {
          scene.remove(m.mesh);
          physics.removeMarble(m.phys);
          state.marbles.splice(i, 1);
          if (state.follow === m) state.follow = null;
          continue;
        }
      }
      m.mesh.scale.setScalar(scale);
      const v = body.linvel();
      const speed = Math.hypot(v.x, v.y, v.z);
      m.settled = speed < 0.02 ? m.settled + dt : 0;
      if (p.y < room.room.floor + 0.05 && m.settled > 1.5) retire(m);
      if (p.y < room.room.floor - 0.5) retire(m);

      for (const b of course.bins) {
        if (p.x > b.x0 && p.x < b.x1 && p.z > b.z0 && p.z < b.z1 && p.y < 0.08) binCounts[b.id]++;
      }

      const w = body.angvel();
      const spin = Math.hypot(w.x, w.y, w.z) * MARBLE_RADIUS;
      const rf = Math.hypot(p.x - F.x, p.z - F.z);
      const inFunnel = rf < F.rim && p.y > F.top - F.depth - 0.01 && p.y < F.top + 0.03;
      if (speed > 0.05 && spin > speed * 0.6 && !inFunnel && p.y > 0.03) {
        rolling += Math.min(1, speed);
        rollSpeed = Math.max(rollSpeed, speed);
      }
      if (inFunnel) funnelAct += Math.min(2, speed);
      if (m.phys.impact > 0.12) {
        tmpV.set(p.x, p.y, p.z).project(camera);
        const dist = camera.position.distanceTo(m.mesh.position);
        const inBin = p.y < 0.035 && course.bins.some((b) => p.x > b.x0 && p.x < b.x1 && p.z > b.z0 && p.z < b.z1);
        const surface = inBin ? 'felt' : inFunnel ? 'copper' : 'wood';
        sound.impact(m.type.id, m.phys.impact / 2.2, tmpV.x * 0.8, dist, surface);
      }
      m.phys.impact = 0;
    }
    plaques.update(binCounts);

    const fanLevel = fan.update(dt, state.windOn);
    streaks.update(dt, fanLevel, renderer.getDrawingBufferSize(tmpSize).y * 0.004);
    room.update(elapsed);
    sound.ambient({
      rolling,
      rollPitch: Math.min(1.5, rollSpeed),
      funnel: funnelAct,
      fan: fanLevel,
      fanDistance: camera.position.distanceTo(fan.group.children[0].position),
    });

    if (state.tween) {
      const tw = state.tween;
      tw.t = Math.min(1, tw.t + dt / 1.4);
      const e = tw.t < 0.5 ? 4 * tw.t ** 3 : 1 - (-2 * tw.t + 2) ** 3 / 2;
      camera.position.lerpVectors(tw.fromPos, tw.toPos, e);
      controls.target.lerpVectors(tw.fromTarget, tw.toTarget, e);
      if (tw.t >= 1) state.tween = null;
    }
    if (state.view === 'follow') {
      if (!state.follow || state.follow.retiring || state.follow.settled > 1.2) {
        const candidate = [...state.marbles].reverse().find((m) => !m.retiring && m.settled < 0.3 && m.age > 0.2);
        if (candidate) state.follow = candidate;
      }
      if (state.follow) {
        const goal = state.follow.mesh.position;
        tmpV.copy(goal).sub(controls.target).multiplyScalar(1 - Math.exp(-dt * 5));
        controls.target.add(tmpV);
        camera.position.add(tmpV);
        if (!dragging) {
          const k = 1 - Math.exp(-dt * 1.2);
          offset.copy(camera.position).sub(controls.target);
          const len = offset.length();
          offset.normalize().lerp(followDir, k).normalize().multiplyScalar(len + (0.3 - len) * k);
          camera.position.copy(controls.target).add(offset);
        }
      }
    }
    controls.target.clamp(targetMin, targetMax);
    controls.update();
    camera.position.clamp(roomMin, roomMax);

    const fd = state.view === 'follow' && state.follow ? camera.position.distanceTo(state.follow.mesh.position) : camera.position.distanceTo(controls.target);
    focus += (fd - focus) * (1 - Math.exp(-dt * 6));
    post.render(elapsed, focus);
    ui.tick(dt);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  window.addEventListener('keydown', (e) => {
    if (e.target && ['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return;
    sound.unlock();
    if (e.code === 'Space' || e.key === 'Enter') {
      e.preventDefault();
      spawn(MARBLE_TYPES[state.selected]);
      ui.flashDrop();
    } else if (/^[1-9]$/.test(e.key)) {
      const i = Number(e.key) - 1;
      if (MARBLE_TYPES[i]) {
        state.selected = i;
        ui.select(i);
      }
    } else if (e.key === 'a' || e.key === 'A') {
      ui.toggleAuto();
    } else if (e.key === 'c' || e.key === 'C') {
      clearAll();
    } else if (e.key === 'f' || e.key === 'F') {
      setView(state.view === 'follow' ? 'overview' : 'follow');
    }
  });
}

function buildPlaques(course, scene) {
  const plates = course.bins.map((b) => {
    const tex = textTexture([], { w: 512, h: 160 });
    const mat = new THREE.MeshPhysicalMaterial({ map: tex.texture, metalness: 0.85, roughness: 0.32, color: 0xffffff });
    const w = (b.x1 - b.x0) * 0.78;
    const h = w * (160 / 512);
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    mesh.position.set(b.cx, 0.032, b.front + 0.0008);
    scene.add(mesh);
    const plate = { b, tex, count: -1 };
    drawPlate(plate, 0);
    return plate;
  });
  return {
    update(counts) {
      for (const p of plates) {
        const c = counts[p.b.id];
        if (c !== p.count) drawPlate(p, c);
      }
    },
  };
}

function drawPlate(plate, count) {
  const { ctx, canvas } = plate.tex;
  const w = canvas.width;
  const h = canvas.height;
  const g = ctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, '#c99a4c');
  g.addColorStop(0.5, '#e9c47a');
  g.addColorStop(1, '#b88a40');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = 'rgba(70,45,15,0.6)';
  ctx.lineWidth = 6;
  ctx.strokeRect(10, 10, w - 20, h - 20);
  ctx.fillStyle = '#3b2610';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.letterSpacing = '10px';
  ctx.font = '600 54px "Fraunces", Georgia, serif';
  ctx.fillText(plate.b.label.toUpperCase(), w / 2 - 40, h / 2 - 14);
  ctx.letterSpacing = '2px';
  ctx.font = '500 26px "Manrope", Arial, sans-serif';
  ctx.fillText(plate.b.range, w / 2 - 40, h / 2 + 38);
  ctx.font = '600 64px "Fraunces", Georgia, serif';
  ctx.letterSpacing = '0px';
  ctx.fillText(String(count), w - 70, h / 2 + 4);
  ctx.fillRect(w - 128, 30, 3, h - 60);
  plate.tex.texture.needsUpdate = true;
  plate.count = count;
}

function buildWindStreaks(course, scene) {
  const count = 64;
  const positions = new Float32Array(count * 3);
  const alphas = new Float32Array(count);
  const sizes = new Float32Array(count);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('alpha', new THREE.BufferAttribute(alphas, 1));
  geo.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { level: { value: 0 }, scale: { value: 1 } },
    vertexShader: `
      attribute float alpha;
      attribute float size;
      varying float vAlpha;
      uniform float scale;
      void main() {
        vAlpha = alpha;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = size * scale / -mv.z;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: `
      varying float vAlpha;
      uniform float level;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5, 0.0, d);
        gl_FragColor = vec4(vec3(1.0, 0.88, 0.7), a * a * vAlpha * level * 0.3);
      }
    `,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  scene.add(points);
  const box = course.wind.box;
  const fx = course.fan.x;
  const parts = [];
  const reset = (p, first) => {
    p.x = fx + 0.06 + (first ? Math.random() * (box.xMax - fx) : Math.random() * 0.03);
    p.y = course.fan.y + (Math.random() - 0.5) * 0.12;
    p.z = course.fan.z + (Math.random() - 0.5) * 0.14;
    p.speed = 0.35 + Math.random() * 0.4;
    p.seed = Math.random() * 100;
  };
  for (let i = 0; i < count; i++) {
    const p = {};
    reset(p, true);
    parts.push(p);
    sizes[i] = 1 + Math.random() * 1.6;
  }
  let t = 0;
  return {
    update(dt, level, pixelScale) {
      t += dt;
      mat.uniforms.level.value = level;
      mat.uniforms.scale.value = pixelScale;
      points.visible = level > 0.02;
      if (!points.visible) return;
      parts.forEach((p, i) => {
        p.x += p.speed * dt * level;
        p.y += Math.sin(t * 1.7 + p.seed) * dt * 0.012;
        p.z += Math.cos(t * 1.3 + p.seed) * dt * 0.012;
        const u = (p.x - fx - 0.06) / (box.xMax - fx - 0.06);
        if (u > 1) reset(p, false);
        alphas[i] = Math.sin(Math.min(1, Math.max(0, u)) * Math.PI);
        positions[i * 3] = p.x;
        positions[i * 3 + 1] = p.y;
        positions[i * 3 + 2] = p.z;
      });
      geo.attributes.position.needsUpdate = true;
      geo.attributes.alpha.needsUpdate = true;
    },
  };
}

function renderThumbnails(renderer, factory, env) {
  const size = 112;
  const scene = new THREE.Scene();
  scene.environment = env;
  scene.environmentIntensity = 1;
  const backdrop = new THREE.Mesh(
    new THREE.SphereGeometry(0.2, 32, 16),
    new THREE.MeshBasicMaterial({ color: '#1a130e', side: THREE.BackSide }),
  );
  scene.add(backdrop);
  const glow = new THREE.Mesh(new THREE.CircleGeometry(0.03, 32), new THREE.MeshBasicMaterial({ color: '#c08a52' }));
  glow.position.set(0.012, 0.02, -0.06);
  scene.add(glow);
  const key = new THREE.DirectionalLight(0xffd7a8, 2.2);
  key.position.set(-0.3, 0.5, 0.4);
  scene.add(key);
  const cam = new THREE.PerspectiveCamera(30, 1, 0.01, 1);
  cam.position.set(0, 0.012, 0.052);
  cam.lookAt(0, 0, 0);
  const out = [];
  const prevSize = renderer.getSize(new THREE.Vector2());
  const prevPR = renderer.getPixelRatio();
  renderer.setPixelRatio(1);
  renderer.setSize(size * 2, size * 2, false);
  const c2 = document.createElement('canvas');
  c2.width = size * 2;
  c2.height = size * 2;
  const ctx = c2.getContext('2d');
  for (const type of MARBLE_TYPES) {
    const mesh = factory.create(type, 0);
    mesh.rotation.set(0.6, 0.4, 0.2);
    scene.add(mesh);
    renderer.setRenderTarget(null);
    renderer.render(scene, cam);
    ctx.clearRect(0, 0, c2.width, c2.height);
    ctx.drawImage(renderer.domElement, 0, 0, c2.width, c2.height);
    out.push(c2.toDataURL('image/png'));
    scene.remove(mesh);
  }
  renderer.setPixelRatio(prevPR);
  renderer.setSize(prevSize.x, prevSize.y, false);
  return out;
}

boot().catch((err) => {
  console.error(err);
  const el = document.getElementById('loader-status');
  if (el) el.textContent = 'This browser could not start WebGL 2. Try a recent Chrome, Edge, Firefox or Safari.';
});
