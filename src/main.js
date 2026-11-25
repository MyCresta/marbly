import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import RAPIER from 'rapier';
import { COURSES } from './courses/index.js';
import { Physics, STEP } from './physics.js';
import { MARBLE_TYPES, MARBLE_RADIUS } from './marbles.js';
import { createSceneMaterials, MarbleFactory } from './materials.js';
import { buildRoom, buildFan } from './room.js';
import { PostPipeline } from './post.js';
import { SoundBoard } from './audio.js';
import { textTexture } from './textures.js';
import { createUI } from './ui.js';
import { mergeStatic } from './optimize.js';

const MAX_MARBLES = 48;
const QUALITY = {
  high: { label: 'High', scale: 1.5, msaa: 4, fxaa: false, dof: true, bloom: true, bloomScale: 0.5, glass: 'real', spot: 2048, moon: true, shadowEvery: 1, simple: false },
  medium: { label: 'Medium', scale: 1.0, msaa: 0, fxaa: true, dof: true, bloom: true, bloomScale: 0.35, glass: 'fake', spot: 1024, moon: false, shadowEvery: 1, simple: false },
  low: { label: 'Low', scale: 0.8, msaa: 0, fxaa: true, dof: false, bloom: true, bloomScale: 0.25, glass: 'fake', spot: 1024, moon: false, shadowEvery: 2, simple: true },
  minimal: { label: 'Minimal', scale: 0.6, msaa: 0, fxaa: true, dof: false, bloom: false, bloomScale: 0.25, glass: 'fake', spot: 512, moon: false, shadowEvery: 3, simple: true },
};
const LEVELS = ['high', 'medium', 'low', 'minimal'];
const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));

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
  let pixelRatio = 1;
  renderer.setPixelRatio(1);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#0e0b09');
  const camera = new THREE.PerspectiveCamera(34, window.innerWidth / window.innerHeight, 0.02, 12);

  ui.progress(0.15, 'Turning the wood');
  await nextFrame();
  const mats = createSceneMaterials();

  ui.progress(0.5, 'Furnishing the room');
  await nextFrame();
  const room = buildRoom(mats);
  scene.add(room.group);

  const hemi = new THREE.HemisphereLight(0xe6d2b6, 0x3a281c, 0.5);
  scene.add(hemi);
  const moon = new THREE.DirectionalLight(0xa9bcff, 1.0);
  moon.position.set(room.window.cx + 0.3, 1.6, -2.0);
  moon.target.position.set(0.1, 0, 0.1);
  moon.castShadow = true;
  moon.shadow.mapSize.set(1024, 1024);
  Object.assign(moon.shadow.camera, { left: -1, right: 1, top: 1, bottom: -1, near: 0.5, far: 5 });
  moon.shadow.bias = -0.0004;
  moon.shadow.normalBias = 0.003;
  moon.shadow.radius = 6;
  scene.add(moon, moon.target);
  const fill = new THREE.PointLight(0xffc896, 3.0, 7, 1.3);
  fill.position.set(1.0, 1.15, 1.3);
  scene.add(fill);
  const wash = new THREE.PointLight(0xffb070, 0.9, 1.8, 1.4);
  wash.position.set(-0.35, 0.95, -0.12);
  scene.add(wash);

  const factory = new MarbleFactory();
  const sound = new SoundBoard();
  const pmrem = new THREE.PMREMGenerator(renderer);

  ui.progress(0.7, 'Polishing marbles');
  await nextFrame();
  const studio = pmrem.fromScene(new RoomEnvironment(), 0.045).texture;
  const thumbs = renderThumbnails(renderer, factory, studio);

  const post = new PostPipeline(renderer, scene, camera);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.075;
  controls.minDistance = 0.18;
  controls.maxDistance = 3;
  controls.maxPolarAngle = 1.5;
  controls.minAzimuthAngle = -1.25;
  controls.maxAzimuthAngle = 1.25;
  controls.rotateSpeed = 0.6;
  controls.zoomSpeed = 0.8;
  controls.panSpeed = 0.6;
  controls.screenSpacePanning = true;

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
    windOn: true,
    race: null,
  };

  let course = null;
  let physics = null;
  let courseGroup = null;
  let plaques = null;
  let streaks = null;
  let fan = null;
  let envRT = null;
  let doorMesh = null;
  let gateMesh = null;
  let gateLift = 0;

  const viewFor = (name) => {
    const v = course.views.find((x) => x.id === name) || course.views[0];
    const aspect = window.innerWidth / window.innerHeight;
    if (aspect >= 1.1) return v;
    const t = new THREE.Vector3().fromArray(v.target);
    const p = new THREE.Vector3().fromArray(v.pos).sub(t).multiplyScalar(aspect < 0.8 ? 1.3 : 1.12).add(t);
    return { pos: p.toArray(), target: v.target };
  };

  const removeMarbleNow = (m) => {
    scene.remove(m.mesh);
    physics.removeMarble(m.phys);
  };

  const disposeTree = (obj) => {
    obj.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
    });
  };

  const loadCourse = (id, { instant = false } = {}) => {
    const entry = COURSES.find((c) => c.id === id) || COURSES[0];
    if (physics) {
      for (const m of state.marbles) removeMarbleNow(m);
      state.marbles.length = 0;
      physics.world.free();
    }
    state.queue.length = 0;
    state.follow = null;
    state.race = null;
    if (courseGroup) {
      scene.remove(courseGroup);
      disposeTree(courseGroup);
    }
    if (fan) {
      scene.remove(fan.group);
      disposeTree(fan.group);
      fan = null;
    }
    if (plaques) plaques.dispose();
    if (streaks) streaks.dispose();

    course = entry.build();
    course.meta = entry;
    courseGroup = new THREE.Group();
    doorMesh = null;
    gateMesh = null;
    course.pieces.forEach((p, i) => {
      const m = new THREE.Mesh(p.geometry, mats[p.material]);
      m.castShadow = p.castShadow;
      m.receiveShadow = p.receiveShadow;
      m.name = p.name;
      if (course.trapdoor && i === course.trapdoor.pieceIndex) {
        p.geometry.translate(-course.trapdoor.hinge.x, -course.trapdoor.hinge.y, -course.trapdoor.hinge.z);
        m.position.copy(course.trapdoor.hinge);
        doorMesh = m;
      }
      if (course.race && i === course.race.gatePieceIndex) gateMesh = m;
      if (m === doorMesh || m === gateMesh) m.userData.dynamic = true;
      courseGroup.add(m);
    });
    mergeStatic(courseGroup, { disposeOriginals: true });
    scene.add(courseGroup);
    if (course.fan) {
      fan = buildFan(mats, course.fan);
      scene.add(fan.group);
    }
    physics = new Physics(RAPIER, course);
    physics.windEnabled = state.windOn;
    plaques = buildPlaques(course, scene);
    const wind = course.zones.find((z) => z.type === 'wind');
    streaks = wind ? buildWindStreaks(course, wind, scene) : null;
    if (course.race) {
      state.race = { phase: 'idle', openAt: 0, start: 0, doneAt: 0, entries: [] };
      ui.raceResults('Ready', []);
    }

    if (envRT) envRT.dispose();
    envRT = pmrem.fromScene(scene, 0.015, 0.02, 10, { size: 256, position: new THREE.Vector3(0.05, 0.42, 0.32) });
    scene.environment = envRT.texture;
    scene.environmentIntensity = 1.25;

    simplifyMaterials(scene, quality.current.simple);
    ui.setCourse(course);
    try { localStorage.setItem('marbly.course', course.id); } catch { }
    if (location.hash.slice(1) !== course.id) history.replaceState(null, '', `#${course.id}`);
    state.view = 'overview';
    const v = viewFor('overview');
    if (instant) {
      camera.position.fromArray(v.pos);
      controls.target.fromArray(v.target);
      controls.update();
      state.tween = null;
    } else {
      setView('overview');
    }
  };

  const spawnAt = (type, pos) => {
    const live = state.marbles.filter((m) => !m.retiring);
    if (live.length >= MAX_MARBLES) retire(live[0]);
    const phys = physics.addMarble(type, pos);
    const mesh = factory.create(type);
    mesh.scale.setScalar(0.001);
    mesh.position.set(pos.x, pos.y, pos.z);
    scene.add(mesh);
    const marble = { phys, mesh, type, age: 0, retiring: false, retireT: 0, settled: 0, bar: -1, finished: false };
    state.marbles.push(marble);
    if (state.view === 'follow' && (!state.follow || state.follow.retiring || state.follow.settled > 0.5)) state.follow = marble;
    return marble;
  };

  const raceLane = (type) => {
    const ti = MARBLE_TYPES.indexOf(type);
    for (const m of state.marbles) {
      if (!m.retiring && m.type === type) retire(m);
    }
    const s = course.spawnFor(ti);
    const marble = spawnAt(type, { x: s.x, y: s.y, z: s.z });
    const r = state.race;
    if (r.phase !== 'idle' && r.phase !== 'ready') {
      r.phase = 'idle';
      r.entries = [];
    }
    if (r.phase === 'idle') physics.setGate(false);
    r.phase = 'ready';
    r.openAt = physics.time + 1.3;
    r.entries = r.entries.filter((e) => e.marble.type !== type);
    r.entries.push({ marble, type, time: null });
    updateRace();
  };

  const spawn = (type) => {
    if (course.race) raceLane(type);
    else state.queue.push(type);
  };

  const releaseNext = () => {
    const s = course.spawn;
    for (const m of state.marbles) {
      const p = m.phys.body.translation();
      if (Math.hypot(p.x - s.x, p.y - s.y, p.z - s.z) < 0.07) return false;
    }
    const type = state.queue.shift();
    const j = () => (Math.random() - 0.5) * 0.006;
    spawnAt(type, { x: s.x + j(), y: s.y, z: s.z + j() });
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
    if (state.race) {
      state.race.phase = 'idle';
      state.race.entries = [];
      ui.raceResults('Ready', []);
    }
  };

  const dropAll = () => {
    if (course.race) {
      for (const m of state.marbles) retire(m);
      state.race.phase = 'idle';
      state.race.entries = [];
      MARBLE_TYPES.forEach((t) => raceLane(t));
    } else {
      MARBLE_TYPES.forEach((t) => state.queue.push(t));
    }
  };

  const updateRace = () => {
    const r = state.race;
    if (!r) return;
    const rows = r.entries
      .map((e) => ({ thumb: thumbs[MARBLE_TYPES.indexOf(e.type)], name: e.type.name, time: e.time, dnf: e.dnf }))
      .sort((a, b) => (a.time ?? 1e9) - (b.time ?? 1e9));
    const status = r.phase === 'ready' ? 'On your marks' : r.phase === 'running' ? 'Racing' : r.phase === 'done' ? 'Finished' : 'Ready';
    ui.raceResults(status, rows);
  };

  const tickRace = (dt) => {
    const r = state.race;
    if (!r) return;
    if (r.phase === 'ready' && physics.time >= r.openAt) {
      physics.setGate(true);
      r.phase = 'running';
      r.start = physics.time;
      updateRace();
    }
    if (r.phase === 'running') {
      let changed = false;
      for (const e of r.entries) {
        if (e.time !== null || e.dnf) continue;
        if (e.marble.phys.finishTime !== undefined) {
          e.time = e.marble.phys.finishTime - r.start;
          changed = true;
        } else if (e.marble.retiring || (e.marble.settled > 1.5 && physics.time - r.start > 2)) {
          e.dnf = true;
          changed = true;
        }
      }
      if (r.entries.every((e) => e.time !== null || e.dnf)) {
        r.phase = 'done';
        r.doneAt = physics.time;
        changed = true;
      }
      if (changed) updateRace();
    }
    if (r.phase === 'done' && physics.time - r.doneAt > 1.5) {
      physics.setGate(false);
      r.phase = 'idle';
    }
    const open = r.phase === 'running' || r.phase === 'done' ? 1 : 0;
    gateLift += (open - gateLift) * Math.min(1, dt * 6);
    if (gateMesh) gateMesh.position.y = gateLift * 0.045;
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

  const offset = new THREE.Vector3();
  const followDir = new THREE.Vector3(0.42, 0.42, 0.8).normalize();
  let dragging = false;

  const quality = {
    mode: 'auto',
    level: 'medium',
    current: QUALITY.medium,
    ceiling: 0,
    windowStart: 0,
    frames: 0,
    settle: 1.5,
    good: 0,
    lastUp: -1e9,
    fps: 0,
    apply(level) {
      const q = QUALITY[level];
      this.level = level;
      this.current = q;
      pixelRatio = Math.min(window.devicePixelRatio || 1, q.scale);
      post.configure({ msaa: q.msaa, fxaa: q.fxaa, dof: q.dof, bloom: q.bloom, bloomScale: q.bloomScale });
      simplifyMaterials(scene, q.simple);
      resize();
      renderer.transmissionResolutionScale = 0.5;
      factory.setGlassMode(q.glass, state.marbles.map((m) => m.mesh));
      const spot = room.lamp.spot;
      if (spot.shadow.mapSize.x !== q.spot) {
        spot.shadow.mapSize.set(q.spot, q.spot);
        if (spot.shadow.map) {
          spot.shadow.map.dispose();
          spot.shadow.map = null;
        }
      }
      moon.castShadow = q.moon;
      renderer.shadowMap.autoUpdate = q.shadowEvery === 1;
      renderer.shadowMap.needsUpdate = true;
      this.settle = 1.5;
      this.frames = 0;
      this.windowStart = 0;
      this.good = 0;
      ui.setQuality(this.mode, q.label, this.fps);
    },
    setMode(mode) {
      this.mode = mode;
      try { localStorage.setItem('marbly.quality', mode); } catch { }
      if (mode === 'auto') {
        this.ceiling = 0;
        this.apply(this.level);
      } else {
        this.apply(mode);
      }
    },
    tick(now, dt) {
      if (dt > 0.2) {
        this.windowStart = 0;
        return;
      }
      if (this.settle > 0) {
        this.settle -= dt;
        return;
      }
      if (!this.windowStart) {
        this.windowStart = now;
        this.frames = 0;
        return;
      }
      this.frames++;
      const span = (now - this.windowStart) / 1000;
      if (span < 1) return;
      this.fps = this.frames / span;
      this.windowStart = now;
      this.frames = 0;
      ui.setQuality(this.mode, this.current.label, this.fps);
      if (this.mode !== 'auto') return;
      const i = LEVELS.indexOf(this.level);
      if (this.fps < 40 && i < LEVELS.length - 1) {
        if (now - this.lastUp < 8000) this.ceiling = i + 1;
        this.apply(LEVELS[i + 1]);
      } else if (this.fps > 57) {
        this.good++;
        if (this.good >= 4 && i > this.ceiling) {
          this.lastUp = now;
          this.apply(LEVELS[i - 1]);
        }
      } else {
        this.good = 0;
      }
    },
  };

  ui.init({
    types: MARBLE_TYPES,
    thumbs,
    courses: COURSES,
    selected: state.selected,
    onSelect: (i) => { state.selected = i; },
    onDrop: () => { sound.unlock(); spawn(MARBLE_TYPES[state.selected]); },
    onDropAll: () => { sound.unlock(); dropAll(); },
    onAuto: (on) => { sound.unlock(); state.auto = on; state.autoTimer = 0.2; },
    onClear: clearAll,
    onView: setView,
    onCourse: (id) => { sound.unlock(); loadCourse(id); },
    onWind: (on) => { state.windOn = on; physics.windEnabled = on; },
    onSound: (on) => { sound.unlock(); sound.setEnabled(on); },
    onQuality: () => {
      const order = ['auto', ...LEVELS];
      quality.setMode(order[(order.indexOf(quality.mode) + 1) % order.length]);
    },
    massOf: (t) => (4 / 3) * Math.PI * MARBLE_RADIUS ** 3 * t.density * 1000,
  });

  let savedQuality = 'auto';
  try { savedQuality = localStorage.getItem('marbly.quality') || 'auto'; } catch { }
  const coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
  quality.level = coarse ? 'low' : 'medium';
  quality.mode = savedQuality === 'auto' || QUALITY[savedQuality] ? savedQuality : 'auto';
  quality.apply(quality.mode === 'auto' ? quality.level : quality.mode);

  ui.progress(0.85, 'Building the course');
  await nextFrame();
  let startId = location.hash.slice(1);
  if (!COURSES.some((c) => c.id === startId)) {
    try { startId = localStorage.getItem('marbly.course') || 'vortex'; } catch { startId = 'vortex'; }
  }
  loadCourse(startId, { instant: true });
  window.addEventListener('hashchange', () => {
    const id = location.hash.slice(1);
    if (id !== course.id && COURSES.some((c) => c.id === id)) loadCourse(id);
  });

  const markInteraction = () => {
    sound.unlock();
    if (state.tween) state.tween = null;
  };
  canvas.addEventListener('pointerdown', () => { dragging = true; markInteraction(); });
  canvas.addEventListener('wheel', markInteraction, { passive: true });
  window.addEventListener('pointerup', () => {
    if (dragging && state.view === 'follow') followDir.copy(camera.position).sub(controls.target).normalize();
    dragging = false;
  });

  const roomMin = new THREE.Vector3(room.room.left + 0.15, -0.02, room.room.back + 0.08);
  const roomMax = new THREE.Vector3(room.room.right - 0.15, room.room.ceiling - 0.15, room.room.front - 0.2);
  const targetMin = new THREE.Vector3(-0.9, 0, -0.42);
  const targetMax = new THREE.Vector3(0.9, 0.8, 0.5);

  let last = performance.now();
  let acc = 0;
  let elapsed = 0;
  let focus = camera.position.distanceTo(controls.target);
  let frameCount = 0;
  const tmpV = new THREE.Vector3();
  const tmpSize = new THREE.Vector2();
  const counts = {};

  window.__marbly = {
    warp(seconds) {
      const n = Math.round(seconds / STEP);
      for (let i = 0; i < n; i++) physics.step();
    },
    load: (id) => loadCourse(id, { instant: true }),
    bench(frames = 20) {
      const gl = renderer.getContext();
      renderer.info.autoReset = false;
      renderer.info.reset();
      post.render(elapsed, focus);
      gl.finish();
      const calls = renderer.info.render.calls;
      const tris = renderer.info.render.triangles;
      renderer.info.autoReset = true;
      const t0 = performance.now();
      for (let i = 0; i < frames; i++) post.render(elapsed + i * 0.016, focus);
      gl.finish();
      const render = (performance.now() - t0) / frames;
      const p0 = performance.now();
      for (let i = 0; i < 240; i++) physics.step();
      const phys = (performance.now() - p0) / 240;
      return { render: +render.toFixed(1), calls, tris, physStepMs: +phys.toFixed(3), marbles: state.marbles.length, size: renderer.getDrawingBufferSize(new THREE.Vector2()).toArray() };
    },
    quality,
  };

  ui.progress(1, 'Ready');
  await nextFrame();
  ui.ready();
  setTimeout(() => {
    if (state.marbles.length === 0 && state.queue.length === 0 && !course.race) [5, 0, 3].forEach((i) => spawn(MARBLE_TYPES[i]));
  }, 900);

  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    elapsed += dt;

    quality.tick(now, dt);
    frameCount++;
    if (!renderer.shadowMap.autoUpdate && frameCount % quality.current.shadowEvery === 0) renderer.shadowMap.needsUpdate = true;

    if (state.auto) {
      state.autoTimer -= dt;
      if (course.race) {
        if (state.autoTimer <= 0 && (state.race.phase === 'idle' || state.race.phase === 'done')) {
          dropAll();
          state.autoTimer = 3;
        }
      } else if (state.autoTimer <= 0 && state.queue.length < 2) {
        spawn(MARBLE_TYPES[Math.floor(Math.random() * MARBLE_TYPES.length)]);
        state.autoTimer = (course.dropGap || 1) * (1.5 + Math.random());
      }
    }
    state.queueTimer -= dt;
    if (state.queue.length && state.queueTimer <= 0) {
      if (releaseNext()) state.queueTimer = course.dropGap || 1;
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
    tickRace(dt);

    if (doorMesh) doorMesh.quaternion.setFromAxisAngle(course.trapdoor.axis, physics.door.open * 1.15);

    sound.frame();
    let rolling = 0;
    let rollSpeed = 0;
    let funnelAct = 0;
    for (const b of course.bins) counts[b.id] = 0;
    const F = course.funnel;
    const X = course.xylophone;
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
          removeMarbleNow(m);
          state.marbles.splice(i, 1);
          if (state.follow === m) state.follow = null;
          continue;
        }
      }
      m.mesh.scale.setScalar(scale);
      const v = body.linvel();
      const speed = Math.hypot(v.x, v.y, v.z);
      m.settled = speed < 0.02 ? m.settled + dt : 0;
      let inBin = null;
      for (const b of course.bins) {
        if (p.x > b.x0 && p.x < b.x1 && p.z > b.z0 && p.z < b.z1 && p.y < 0.1) {
          counts[b.id]++;
          inBin = b;
        }
      }
      if (p.y < room.room.floor + 0.05 && m.settled > 1.5) retire(m);
      if (p.y < room.room.floor - 0.5) retire(m);
      if (!inBin && !m.retiring && m.settled > 4 && !(course.race && state.race.phase === 'ready')) retire(m);

      const w = body.angvel();
      const spin = Math.hypot(w.x, w.y, w.z) * MARBLE_RADIUS;
      const inFunnel = F && Math.hypot(p.x - F.x, p.z - F.z) < F.rim && p.y > F.top - F.depth - 0.01 && p.y < F.top + 0.03;
      if (speed > 0.05 && spin > speed * 0.6 && !inFunnel && p.y > 0.03) {
        rolling += Math.min(1, speed);
        rollSpeed = Math.max(rollSpeed, speed);
      }
      if (inFunnel) funnelAct += Math.min(2, speed);
      if (X && Math.abs(p.z - X.z) < 0.02 && p.x > X.x0 && p.x < X.x0 + X.count * X.pitch && p.y - X.topAt(p.x) < 0.022) {
        const bar = Math.floor((p.x - X.x0) / X.pitch);
        if (bar !== m.bar && bar >= 0 && bar < X.count) {
          m.bar = bar;
          tmpV.set(p.x, p.y, p.z).project(camera);
          sound.note(X.bars[bar].freq, Math.min(1, speed * 1.6 + 0.2), tmpV.x * 0.8, camera.position.distanceTo(m.mesh.position));
        }
      }
      if (m.phys.impact > 0.12) {
        tmpV.set(p.x, p.y, p.z).project(camera);
        const dist = camera.position.distanceTo(m.mesh.position);
        const surface = inBin && p.y < 0.035 ? 'felt' : inFunnel ? 'copper' : 'wood';
        sound.impact(m.type.id, m.phys.impact / 2.2, tmpV.x * 0.8, dist, surface);
      }
      m.phys.impact = 0;
    }
    plaques.update(counts);

    const fanLevel = fan ? fan.update(dt, state.windOn) : 0;
    if (streaks) streaks.update(dt, fanLevel, renderer.getDrawingBufferSize(tmpSize).y * 0.004);
    room.update(elapsed, dt, renderer.getDrawingBufferSize(tmpSize).y * 0.004);
    room.clock.update(dt, () => sound.tick(camera.position.distanceTo(room.clock.group.position)));
    sound.ambient({
      rolling,
      rollPitch: Math.min(1.5, rollSpeed),
      funnel: funnelAct,
      fan: fanLevel,
      fanDistance: fan ? camera.position.distanceTo(fan.group.children[0].position) : 3,
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
    } else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      const i = COURSES.findIndex((c) => c.id === course.id);
      const n = (i + (e.key === 'ArrowRight' ? 1 : COURSES.length - 1)) % COURSES.length;
      loadCourse(COURSES[n].id);
    }
  });
}

function simplifyMaterials(scene, simple) {
  scene.traverse((o) => {
    const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
    for (const m of mats) {
      if (!m.isMeshPhysicalMaterial || m.userData.glass) continue;
      if (m.userData.full === undefined) m.userData.full = { clearcoat: m.clearcoat, sheen: m.sheen };
      const want = simple ? { clearcoat: 0, sheen: 0 } : m.userData.full;
      if (m.clearcoat !== want.clearcoat || m.sheen !== want.sheen) {
        m.clearcoat = want.clearcoat;
        m.sheen = want.sheen;
      }
    }
  });
}

function buildPlaques(course, scene) {
  const group = new THREE.Group();
  scene.add(group);
  const plates = course.bins.map((b) => {
    const tex = textTexture([], { w: 512, h: 160 });
    const mat = new THREE.MeshPhysicalMaterial({ map: tex.texture, metalness: 0.85, roughness: 0.32, color: 0xffffff });
    const w = b.plaque.w;
    const h = Math.min(0.034, w * (160 / 512));
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    mesh.position.set(b.plaque.x, b.plaque.y, b.plaque.z);
    mesh.rotation.y = b.plaque.rotY;
    group.add(mesh);
    const plate = { b, tex, mat, count: -1, aspect: w / h };
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
    dispose() {
      scene.remove(group);
      for (const p of plates) {
        p.tex.texture.dispose();
        p.mat.dispose();
      }
      group.traverse((o) => o.geometry && o.geometry.dispose());
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
  ctx.font = '600 50px "Fraunces", Georgia, serif';
  ctx.fillText(plate.b.label.toUpperCase(), w / 2 - 40, h / 2 - 14);
  ctx.letterSpacing = '2px';
  ctx.font = '500 25px "Manrope", Arial, sans-serif';
  ctx.fillText(plate.b.range, w / 2 - 40, h / 2 + 38);
  ctx.font = '600 64px "Fraunces", Georgia, serif';
  ctx.letterSpacing = '0px';
  ctx.fillText(String(count), w - 70, h / 2 + 4);
  ctx.fillRect(w - 128, 30, 3, h - 60);
  plate.tex.texture.needsUpdate = true;
  plate.count = count;
}

function buildWindStreaks(course, wind, scene) {
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
  const box = wind.box;
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
    dispose() {
      scene.remove(points);
      geo.dispose();
      mat.dispose();
    },
  };
}

function renderThumbnails(renderer, factory, env) {
  const size = 112;
  const scene = new THREE.Scene();
  scene.environment = env;
  scene.environmentIntensity = 1;
  scene.add(new THREE.Mesh(new THREE.SphereGeometry(0.2, 32, 16), new THREE.MeshBasicMaterial({ color: '#1a130e', side: THREE.BackSide })));
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
