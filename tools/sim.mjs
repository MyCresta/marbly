import RAPIER from '@dimforge/rapier3d-compat';
import { buildCourse, LAYOUT } from '../src/course.js';
import { Physics, STEP } from '../src/physics.js';
import { MARBLE_TYPES, densityClass } from '../src/marbles.js';

await RAPIER.init();

const args = Object.fromEntries(process.argv.slice(2).map((a) => a.split('=')));
if (args.wind) LAYOUT.wind.strength = Number(args.wind);
const course = buildCourse();
console.log('rim clearance', course.diagnostics.rimClearance.toFixed(4));

function binOf(x) {
  for (const b of course.bins) if (x >= b.x0 && x < b.x1) return b.id;
  return 'none';
}

function runSingle(type, jitter = 0) {
  const phys = new Physics(RAPIER, course);
  if (args.drag) phys.drag = Number(args.drag);
  const s = course.spawn;
  const m = phys.addMarble(type, { x: s.x + jitter, y: s.y, z: s.z + jitter * 0.5 });
  const F = course.funnel;
  const rec = { funnelT: null, neckT: null, launchT: null, launchV: null, landX: null, landT: null, maxSpeed: 0, helixSpeed: 0, connSpeed: 0, minY: Infinity };
  let t = 0;
  let restTime = 0;
  while (t < 25) {
    phys.step();
    t += STEP;
    const p = m.body.translation();
    const v = m.body.linvel();
    const sp = Math.hypot(v.x, v.y, v.z);
    rec.maxSpeed = Math.max(rec.maxSpeed, sp);
    const rf = Math.hypot(p.x - F.x, p.z - F.z);
    if (rec.funnelT === null && rf < F.rim && p.y < F.top + 0.03 && p.y > F.top - 0.1) rec.funnelT = t;
    if (rec.funnelT === null && p.y < 0.5 && p.y > 0.45) rec.helixSpeed = Math.max(rec.helixSpeed, sp);
    if (rec.funnelT === null && p.x > -0.1 && p.x < 0.1 && p.y > 0.3) rec.connSpeed = sp;
    if (rec.funnelT !== null && rec.neckT === null && p.y < F.bowlY(F.hole) - F.neck) rec.neckT = t;
    if (rec.neckT !== null && rec.launchT === null && p.z > LAYOUT.chute.launchZ) { rec.launchT = t; rec.launchV = { ...v }; rec.launchY = p.y; }
    if (rec.launchT !== null && rec.landX === null && p.y < 0.064) { rec.landX = p.x; rec.landZ = p.z; rec.landT = t - rec.launchT; }
    if (sp < 0.01) restTime += STEP; else restTime = 0;
    if (restTime > 0.6 || p.y < -0.5) break;
  }
  const p = m.body.translation();
  rec.final = { x: p.x, y: p.y, z: p.z };
  rec.bin = binOf(p.x);
  rec.t = t;
  return rec;
}

const f = (n, d = 3) => (n === null || n === undefined ? '  -  ' : n.toFixed(d));
const types = args.type ? MARBLE_TYPES.filter((t) => t.id === args.type) : MARBLE_TYPES;
const reps = Number(args.reps || 1);
for (const type of types) {
  for (let r = 0; r < reps; r++) {
    const rec = runSingle(type, (r - (reps - 1) / 2) * 0.004);
    const dx = rec.landX === null ? null : rec.landX - course.funnel.x;
    const ok = rec.bin === densityClass(type.density) ? 'ok ' : 'BAD';
    console.log(
      `${ok} ${type.id.padEnd(9)} helixV ${f(rec.helixSpeed, 2)} connV ${f(rec.connSpeed, 2)} funnel@${f(rec.funnelT, 2)} neck@${f(rec.neckT, 2)} launchV ${rec.launchV ? f(rec.launchV.z, 2) + '/' + f(rec.launchV.y, 2) + '/' + f(rec.launchV.x, 2) : '-'} flight ${f(rec.landT, 3)} dx ${f(dx)} landZ ${f(rec.landZ)} final ${f(rec.final.x)},${f(rec.final.y)},${f(rec.final.z)} bin ${rec.bin} t ${f(rec.t, 1)}`,
    );
  }
}

if (args.crowd) {
  const phys = new Physics(RAPIER, course);
  const s = course.spawn;
  const queue = [];
  const n = Number(args.crowd);
  for (let i = 0; i < n; i++) queue.push({ at: i * Number(args.gap || 0.6), type: MARBLE_TYPES[i % MARBLE_TYPES.length] });
  let t = 0;
  while (t < n * Number(args.gap || 0.6) + 20) {
    while (queue.length && queue[0].at <= t) {
      const q = queue.shift();
      phys.addMarble(q.type, { x: s.x + (Math.random() - 0.5) * 0.01, y: s.y, z: s.z + (Math.random() - 0.5) * 0.01 });
    }
    phys.step();
    t += STEP;
  }
  let good = 0;
  for (const m of phys.marbles) {
    const p = m.body.translation();
    const b = binOf(p.x);
    const inTray = p.z > LAYOUT.bins.z0 && p.z < LAYOUT.bins.z1 && p.y < 0.08;
    if (inTray && b === densityClass(m.type.density)) good++;
    else console.log('stray', m.type.id, f(p.x), f(p.y), f(p.z), b);
  }
  console.log(`crowd: ${good}/${phys.marbles.length} sorted correctly`);
}
