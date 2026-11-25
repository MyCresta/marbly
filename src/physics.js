import { MARBLE_RADIUS } from './marbles.js';

export const STEP = 1 / 240;

export class Physics {
  constructor(RAPIER, course) {
    this.R = RAPIER;
    this.course = course;
    this.world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    this.world.timestep = STEP;
    const ip = this.world.integrationParameters;
    ip.lengthUnit = 0.05;
    ip.numSolverIterations = 6;
    this.marbles = [];
    this.windEnabled = true;
    this.drag = 3;
    this.rollCap = 1.0;
    this.time = 0;
    this.gates = [];
    this.doors = [];
    this.door = { open: 0, timer: 0, hold: 0 };
    for (const c of course.colliders) {
      const col = this.addStatic(c);
      if (c.gate) this.gates.push(col);
      if (c.door) this.doors.push(col);
    }
  }

  addStatic(c) {
    const R = this.R;
    let desc;
    if (c.kind === 'trimesh') {
      desc = R.ColliderDesc.trimesh(c.vertices, c.indices, R.TriMeshFlags.FIX_INTERNAL_EDGES_TWO_SIDED | R.TriMeshFlags.DELETE_DEGENERATE_TRIANGLES);
    } else if (c.kind === 'cuboid') {
      desc = R.ColliderDesc.cuboid(c.half[0], c.half[1], c.half[2]).setTranslation(c.pos[0], c.pos[1], c.pos[2]);
    } else if (c.kind === 'ball') {
      desc = R.ColliderDesc.ball(c.radius).setTranslation(c.pos[0], c.pos[1], c.pos[2]);
    }
    desc.setFriction(c.friction ?? 0.5).setRestitution(c.restitution ?? 0.3);
    desc.setRestitutionCombineRule(R.CoefficientCombineRule.Average);
    if (c.rot) desc.setRotation({ x: c.rot[0], y: c.rot[1], z: c.rot[2], w: c.rot[3] });
    return this.world.createCollider(desc);
  }

  addMarble(type, pos, vel = { x: 0, y: 0, z: 0 }) {
    const R = this.R;
    const bodyDesc = R.RigidBodyDesc.dynamic()
      .setTranslation(pos.x, pos.y, pos.z)
      .setLinvel(vel.x, vel.y, vel.z)
      .setCcdEnabled(true)
      .setLinearDamping(0.02)
      .setAngularDamping(0.15);
    const body = this.world.createRigidBody(bodyDesc);
    const colDesc = R.ColliderDesc.ball(MARBLE_RADIUS)
      .setDensity(type.density)
      .setFriction(type.friction)
      .setRestitution(type.restitution)
      .setRestitutionCombineRule(R.CoefficientCombineRule.Average)
      .setActiveEvents(R.ActiveEvents.CONTACT_FORCE_EVENTS)
      .setContactForceEventThreshold(0);
    const collider = this.world.createCollider(colDesc, body);
    const marble = {
      type,
      body,
      collider,
      mass: body.mass(),
      area: Math.PI * MARBLE_RADIUS * MARBLE_RADIUS,
      inertia: 0.4 * body.mass() * MARBLE_RADIUS * MARBLE_RADIUS,
      rollRes: type.rolling ?? 4.5,
      born: this.time,
      lastVel: { x: vel.x, y: vel.y, z: vel.z },
      impact: 0,
      rolling: 0,
      inWind: false,
    };
    this.marbles.push(marble);
    return marble;
  }

  removeMarble(m) {
    const i = this.marbles.indexOf(m);
    if (i >= 0) this.marbles.splice(i, 1);
    this.world.removeRigidBody(m.body);
  }

  applyForces() {
    const zones = this.course.zones || [];
    for (const m of this.marbles) {
      const body = m.body;
      if (body.isSleeping()) continue;
      body.resetForces(false);
      body.resetTorques(false);
      const p = body.translation();
      const v = body.linvel();
      const speed = Math.hypot(v.x, v.y, v.z);
      const w = body.angvel();
      const spin = Math.hypot(w.x, w.y, w.z);
      if (spin > 1e-4) {
        const surface = spin * MARBLE_RADIUS;
        const scale = surface > this.rollCap ? this.rollCap / surface : 1;
        const k = -m.inertia * m.rollRes * scale;
        body.addTorque({ x: k * w.x, y: k * w.y, z: k * w.z }, true);
      }
      const dk = this.drag * m.area * speed;
      let fx = -dk * v.x;
      let fy = -dk * v.y;
      let fz = -dk * v.z;
      m.inWind = false;
      for (const z of zones) {
        if (z.type === 'wind') {
          if (!this.windEnabled) continue;
          const b = z.box;
          if (p.x < b.xMin || p.x > b.xMax || p.y < b.yMin || p.y > b.yMax || p.z < b.zMin || p.z > b.zMax) continue;
          const edge = Math.min(1, (p.z - b.zMin) / 0.02, (b.zMax - p.z) / 0.03, (p.y - b.yMin) / 0.02);
          const dist = Math.max(0, p.x - z.origin.x);
          const falloff = 1 / (1 + (dist / 0.45) ** 2);
          const f = z.strength * m.area * falloff * Math.max(0, edge);
          fx += f * z.dir.x;
          fy += f * z.dir.y;
          fz += f * z.dir.z;
          m.inWind = true;
        } else if (z.type === 'lateral') {
          if (Math.abs(p.x - z.x) < z.halfWidth && p.z > z.z0 && p.z < z.z1 && p.y > z.yMin && p.y < z.yMax) fx -= z.k * m.mass * v.x;
        } else if (z.type === 'jam') {
          const r = Math.hypot(p.x - z.x, p.z - z.z);
          if (r < z.radius && p.y > z.yMin && p.y < z.yMax && speed < 0.06) {
            m.stuck = (m.stuck || 0) + STEP;
            if (m.stuck > 0.2) {
              const a = Math.random() * Math.PI * 2;
              const inward = r > 1e-4 ? 0.12 / r : 0;
              body.applyImpulse({
                x: m.mass * (Math.cos(a) * 0.12 + (z.x - p.x) * inward),
                y: -m.mass * 0.15,
                z: m.mass * (Math.sin(a) * 0.12 + (z.z - p.z) * inward),
              }, true);
              m.stuck = 0;
            }
          } else {
            m.stuck = 0;
          }
        }
      }
      body.addForce({ x: fx, y: fy, z: fz }, true);
    }
  }

  setGate(open) {
    for (const g of this.gates) g.setEnabled(!open);
  }

  updateDoor() {
    const td = this.course.trapdoor;
    if (!td) return;
    const d = this.door;
    if (d.timer > 0) {
      d.timer -= STEP;
      if (d.timer <= 0) {
        const blocked = this.marbles.some((m) => {
          const p = m.body.translation();
          return Math.hypot(p.x - td.center.x, p.y - td.center.y, p.z - td.center.z) < 0.03;
        });
        if (blocked) d.timer = 0.2;
        else for (const c of this.doors) c.setEnabled(true);
      }
    } else {
      let resting = false;
      for (const m of this.marbles) {
        const p = m.body.translation();
        if (Math.hypot(p.x - td.center.x, p.y - td.center.y, p.z - td.center.z) < 0.024) {
          const v = m.body.linvel();
          if (Math.hypot(v.x, v.y, v.z) < 0.08) resting = true;
        }
      }
      d.hold = resting ? d.hold + STEP : 0;
      if (d.hold > 0.8) {
        d.hold = 0;
        d.timer = 0.9;
        for (const c of this.doors) c.setEnabled(false);
      }
    }
    const target = d.timer > 0 ? 1 : 0;
    d.open += (target - d.open) * Math.min(1, STEP * 9);
  }

  step() {
    this.updateDoor();
    this.applyForces();
    this.world.step();
    this.time += STEP;
    const finish = this.course.finishTest;
    for (const m of this.marbles) {
      if (finish && m.finishTime === undefined && finish(m.body.translation())) m.finishTime = this.time;
      const v = m.body.linvel();
      const dv = Math.hypot(v.x - m.lastVel.x, v.y - m.lastVel.y, v.z - m.lastVel.z);
      const expected = 9.81 * STEP * 1.6;
      if (dv > expected) m.impact = Math.max(m.impact, dv - expected);
      m.lastVel.x = v.x;
      m.lastVel.y = v.y;
      m.lastVel.z = v.z;
    }
  }
}
