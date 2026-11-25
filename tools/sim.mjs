import RAPIER from '@dimforge/rapier3d-compat';
import { COURSES } from '../src/courses/index.js';
import { Physics } from '../src/physics.js';
import { MARBLE_TYPES } from '../src/marbles.js';

await RAPIER.init();

const args = Object.fromEntries(process.argv.slice(2).map((a) => a.split('=')));
const entry = COURSES.find((c) => c.id === (args.course || 'vortex'));
const course = entry.build();
const f = (n, d = 2) => (n === null || n === undefined || !Number.isFinite(n) ? '  -  ' : n.toFixed(d));

function binOf(p) {
  for (const b of course.bins) if (p.x >= b.x0 && p.x < b.x1 && p.z >= b.z0 && p.z < b.z1 && p.y < 0.1) return b.id;
  return 'none';
}

function spawnPoint(typeIndex) {
  return course.spawnFor ? course.spawnFor(typeIndex) : course.spawn;
}

function runSingle(type, typeIndex, jitter = 0) {
  const phys = new Physics(RAPIER, course);
  if (course.gate) phys.setGate(true);
  const s = spawnPoint(typeIndex);
  const m = phys.addMarble(type, { x: s.x + jitter, y: s.y, z: s.z + jitter * 0.5 });
  const stages = {};
  let t = 0;
  let rest = 0;
  let maxSpeed = 0;
  let speedSum = 0;
  let speedN = 0;
  let finish = null;
  while (t < 40) {
    phys.step();
    t += phys.dt;
    const p = m.body.translation();
    const v = m.body.linvel();
    const sp = Math.hypot(v.x, v.y, v.z);
    maxSpeed = Math.max(maxSpeed, sp);
    if (p.y > 0.05) { speedSum += sp; speedN++; }
    for (const st of course.stages || []) if (stages[st.id] === undefined && st.test(p)) stages[st.id] = t;
    if (course.finishTest && finish === null && course.finishTest(p, typeIndex)) finish = t;
    rest = sp < 0.01 ? rest + phys.dt : 0;
    if ((rest > 0.8 && t > 1.5) || p.y < -0.6) break;
  }
  const p = m.body.translation();
  return { t, stages, maxSpeed, avgSpeed: speedSum / Math.max(1, speedN), final: { x: p.x, y: p.y, z: p.z }, bin: binOf(p), finish };
}

const types = args.type ? MARBLE_TYPES.filter((t) => t.id === args.type) : MARBLE_TYPES;
const reps = Number(args.reps || 1);
let ok = 0;
let total = 0;
for (const type of types) {
  const ti = MARBLE_TYPES.indexOf(type);
  for (let r = 0; r < reps; r++) {
    const rec = runSingle(type, ti, (r - (reps - 1) / 2) * 0.004);
    const want = course.expect ? course.expect(type) : null;
    const good = want === null ? rec.bin !== 'none' : rec.bin === want;
    if (good) ok++;
    total++;
    const st = Object.entries(rec.stages).map(([k, v]) => `${k}@${f(v)}`).join(' ');
    console.log(`${good ? 'ok ' : 'BAD'} ${type.id.padEnd(9)} avgV ${f(rec.avgSpeed)} maxV ${f(rec.maxSpeed)} ${st} ${rec.finish !== null ? 'finish ' + f(rec.finish, 3) : ''} bin ${rec.bin}${want ? ' want ' + want : ''} final ${f(rec.final.x, 3)},${f(rec.final.y, 3)},${f(rec.final.z, 3)} t ${f(rec.t, 1)}`);
  }
}
console.log(`singles: ${ok}/${total}`);

if (args.crowd) {
  const phys = new Physics(RAPIER, course);
  if (course.gate) phys.setGate(true);
  const n = Number(args.crowd);
  const gap = Number(args.gap || 0.85);
  const queue = [];
  for (let i = 0; i < n; i++) queue.push({ at: i * gap, ti: i % MARBLE_TYPES.length });
  let t = 0;
  while (t < n * gap + 25) {
    while (queue.length && queue[0].at <= t) {
      const q = queue.shift();
      const s = spawnPoint(q.ti);
      phys.addMarble(MARBLE_TYPES[q.ti], { x: s.x + (Math.random() - 0.5) * 0.006, y: s.y, z: s.z + (Math.random() - 0.5) * 0.006 });
    }
    phys.step();
    t += phys.dt;
  }
  let good = 0;
  const counts = {};
  for (const m of phys.marbles) {
    const p = m.body.translation();
    const bin = binOf(p);
    counts[bin] = (counts[bin] || 0) + 1;
    const want = course.expect ? course.expect(m.type) : null;
    if (want === null ? bin !== 'none' : bin === want) good++;
    else console.log('stray', m.type.id, f(p.x, 3), f(p.y, 3), f(p.z, 3), bin);
  }
  console.log(`crowd: ${good}/${phys.marbles.length}`, JSON.stringify(counts));
}
