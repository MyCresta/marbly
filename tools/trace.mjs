import RAPIER from '@dimforge/rapier3d-compat';
import { COURSES } from '../src/courses/index.js';
import { Physics, STEP } from '../src/physics.js';
import { MARBLE_TYPES } from '../src/marbles.js';
await RAPIER.init();
const args = Object.fromEntries(process.argv.slice(2).map((a) => a.split('=')));
const course = COURSES.find((c) => c.id === args.course).build();
const phys = new Physics(RAPIER, course);
if (course.gate) phys.setGate(true);
const ti = MARBLE_TYPES.findIndex((t) => t.id === (args.type || 'steel'));
const s = course.spawnFor ? course.spawnFor(ti) : course.spawn;
const j = Number(args.j || 0);
const m = phys.addMarble(MARBLE_TYPES[ti], { x: s.x + j, y: s.y, z: s.z + j * 0.5 });
let t = 0; let last = -1;
const every = Number(args.every || 0.05);
while (t < Number(args.t || 4)) {
  phys.step(); t += STEP;
  if (t - last >= every) {
    last = t;
    const p = m.body.translation(); const v = m.body.linvel(); const w = m.body.angvel();
    console.log(t.toFixed(3), `p ${p.x.toFixed(3)},${p.y.toFixed(3)},${p.z.toFixed(3)}`, `v ${Math.hypot(v.x, v.y, v.z).toFixed(2)}`, `wr ${(Math.hypot(w.x, w.y, w.z) * 0.0125).toFixed(2)}`);
  }
}
