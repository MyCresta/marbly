import { MARBLE_RADIUS } from './marbles.js';

export const STEP = 1 / 240;

export class Physics {
  constructor(RAPIER, course) {
    this.R = RAPIER;
    this.course = course;
    this.world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    this.dt = course.stepHz ? 1 / course.stepHz : STEP;
    this.world.timestep = this.dt;
    const ip = this.world.integrationParameters;
    ip.lengthUnit = 0.05;
    ip.numSolverIterations = 6;
    this.marbles = [];
    this.byCollider = new Map();
    this.events = new RAPIER.EventQueue(true);
    this.windEnabled = true;
    this.drag = 3;
    this.rollCap = 1.0;
    this.time = 0;
    this.gates = [];
    this.doors = [];
    this.doorsOpen = [];
    this.door = { open: 0, timer: 0, hold: 0 };
    this.mechanisms = (course.mechanisms || []).map((def) => this.addMechanism(def));
    for (const c of course.colliders) {
      const col = this.addStatic(c);
      if (c.gate) this.gates.push(col);
      if (c.door === 'closed') this.doors.push(col);
      if (c.door === 'open') {
        col.setEnabled(false);
        this.doorsOpen.push(col);
      }
    }
  }

  addStatic(c) {
    const R = this.R;
    let desc;
    if (c.kind === 'trimesh') {
      desc = R.ColliderDesc.trimesh(c.vertices, c.indices, R.TriMeshFlags.FIX_INTERNAL_EDGES_TWO_SIDED | R.TriMeshFlags.DELETE_DEGENERATE_TRIANGLES);
    } else if (c.kind === 'cuboid') {
      desc = R.ColliderDesc.cuboid(c.half[0], c.half[1], c.half[2]).setTranslation(c.pos[0], c.pos[1], c.pos[2]);
    } else if (c.kind === 'cylinder') {
      desc = R.ColliderDesc.cylinder(c.halfHeight, c.radius).setTranslation(c.pos[0], c.pos[1], c.pos[2]);
    } else if (c.kind === 'ball') {
      desc = R.ColliderDesc.ball(c.radius).setTranslation(c.pos[0], c.pos[1], c.pos[2]);
    }
    desc.setFriction(c.friction ?? 0.5).setRestitution(c.restitution ?? 0.3);
    const rules = { min: R.CoefficientCombineRule.Min, multiply: R.CoefficientCombineRule.Multiply, max: R.CoefficientCombineRule.Max };
    desc.setRestitutionCombineRule(rules[c.combine] ?? R.CoefficientCombineRule.Average);
    if (c.rot) desc.setRotation({ x: c.rot[0], y: c.rot[1], z: c.rot[2], w: c.rot[3] });
    return this.world.createCollider(desc);
  }

  addMechanism(def) {
    const R = this.R;
    const [px, py, pz] = def.pivot;
    const anchor = this.world.createRigidBody(R.RigidBodyDesc.fixed().setTranslation(px, py, pz));
    const bodyDesc = R.RigidBodyDesc.dynamic().setTranslation(px, py, pz).setAngularDamping(def.damping ?? 0.3).setLinearDamping(0.5).setCanSleep(true);
    if (def.initialAngle) {
      const a = def.initialAngle / 2;
      const [ax, ay, az] = def.axis;
      bodyDesc.setRotation({ x: ax * Math.sin(a), y: ay * Math.sin(a), z: az * Math.sin(a), w: Math.cos(a) });
    }
    const body = this.world.createRigidBody(bodyDesc);
    for (const c of def.colliders) {
      let desc;
      if (c.kind === 'cuboid') desc = R.ColliderDesc.cuboid(c.half[0], c.half[1], c.half[2]);
      else if (c.kind === 'cylinder') desc = R.ColliderDesc.cylinder(c.halfHeight, c.radius);
      else desc = R.ColliderDesc.ball(c.radius);
      desc.setTranslation(c.pos[0], c.pos[1], c.pos[2]);
      if (c.rot) desc.setRotation({ x: c.rot[0], y: c.rot[1], z: c.rot[2], w: c.rot[3] });
      desc.setDensity(c.density ?? def.density ?? 600).setFriction(c.friction ?? 0.5).setRestitution(c.restitution ?? 0.2);
      this.world.createCollider(desc, body);
    }
    const axis = { x: def.axis[0], y: def.axis[1], z: def.axis[2] };
    const joint = this.world.createImpulseJoint(R.JointData.revolute({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, axis), anchor, body, true);
    if (def.limits && joint.setLimits) joint.setLimits(def.limits[0], def.limits[1]);
    return { def, body, joint };
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
      contactT: -1,
      rollRes: type.rolling ?? 4.5,
      born: this.time,
      lastVel: { x: vel.x, y: vel.y, z: vel.z },
      impact: 0,
      rolling: 0,
      inWind: false,
    };
    this.marbles.push(marble);
    this.byCollider.set(collider.handle, marble);
    return marble;
  }

  removeMarble(m) {
    const i = this.marbles.indexOf(m);
    if (i >= 0) this.marbles.splice(i, 1);
    this.byCollider.delete(m.collider.handle);
    this.world.removeRigidBody(m.body);
  }

  applyForces() {
    const zones = this.course.zones || [];
    for (const m of this.marbles) {
      const body = m.body;
      if (m.holdTarget) {
        const p = body.translation();
        const t = m.holdTarget;
        let vx = (t.x - p.x) / 0.05;
        let vy = (t.y - p.y) / 0.05;
        let vz = (t.z - p.z) / 0.05;
        const sp = Math.hypot(vx, vy, vz);
        if (sp > 5) {
          vx *= 5 / sp;
          vy *= 5 / sp;
          vz *= 5 / sp;
        }
        body.resetForces(false);
        body.setLinvel({ x: vx, y: vy, z: vz }, true);
        const w = body.angvel();
        body.setAngvel({ x: w.x * 0.97, y: w.y * 0.97, z: w.z * 0.97 }, true);
        continue;
      }
      if (body.isSleeping()) continue;
      body.resetForces(false);
      body.resetTorques(false);
      const p = body.translation();
      const v = body.linvel();
      const speed = Math.hypot(v.x, v.y, v.z);
      const dk = this.drag * m.area * speed;
      let fx = -dk * v.x;
      let fy = -dk * v.y;
      let fz = -dk * v.z;
      if (this.time - m.contactT < this.dt * 2.5 && speed > 1e-4) {
        const scale = speed > this.rollCap ? (this.rollCap / speed) ** 2 : 1;
        const k = m.mass * (m.rollRes / 2.5) * scale;
        fx -= k * v.x;
        fy -= k * v.y;
        fz -= k * v.z;
      }
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
        } else if (z.type === 'bumper') {
          const dx = p.x - z.x;
          const dz = p.z - z.z;
          const d = Math.hypot(dx, dz);
          if (d < z.r + MARBLE_RADIUS + 0.003 && Math.abs(p.y - z.y) < z.h && this.time - (m.bumpT || -1) > 0.12 && d > 1e-5) {
            const nx = dx / d;
            const nz = dz / d;
            const vn = v.x * nx + v.z * nz;
            if (vn < 0.2) {
              const kick = Math.min(1.6, z.kick * Math.sqrt(0.02 / m.mass));
              const dv = kick - vn;
              body.applyImpulse({ x: m.mass * dv * nx, y: 0, z: m.mass * dv * nz }, true);
              m.bumpT = this.time;
              m.bumped = (m.bumped || 0) + 1;
            }
          }
        } else if (z.type === 'jam') {
          const r = Math.hypot(p.x - z.x, p.z - z.z);
          if (r < z.radius && p.y > z.yMin && p.y < z.yMax && speed < 0.06) {
            m.stuck = (m.stuck || 0) + this.dt;
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

  hold(m, target) {
    if (!m.holdTarget) {
      m.body.setGravityScale(0, true);
      m.body.wakeUp();
    }
    m.holdTarget = target;
  }

  release(m, maxSpeed = 4) {
    if (!m.holdTarget) return;
    m.holdTarget = null;
    m.body.setGravityScale(1, true);
    const v = m.body.linvel();
    const sp = Math.hypot(v.x, v.y, v.z);
    if (sp > maxSpeed) m.body.setLinvel({ x: (v.x * maxSpeed) / sp, y: (v.y * maxSpeed) / sp, z: (v.z * maxSpeed) / sp }, true);
  }

  setGate(open) {
    for (const g of this.gates) g.setEnabled(!open);
  }

  updateDoor() {
    const td = this.course.trapdoor;
    if (!td) return;
    const d = this.door;
    if (d.timer > 0) {
      d.timer -= this.dt;
      if (d.timer <= 0) {
        const blocked = this.marbles.some((m) => {
          const p = m.body.translation();
          return Math.hypot(p.x - td.center.x, p.y - td.center.y, p.z - td.center.z) < 0.03;
        });
        if (blocked) d.timer = 0.2;
        else {
          for (const c of this.doors) c.setEnabled(true);
          for (const c of this.doorsOpen) c.setEnabled(false);
        }
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
      d.hold = resting ? d.hold + this.dt : 0;
      if (d.hold > 0.8) {
        d.hold = 0;
        d.timer = 0.9;
        for (const c of this.doors) c.setEnabled(false);
        for (const c of this.doorsOpen) c.setEnabled(true);
      }
    }
    const target = d.timer > 0 ? 1 : 0;
    d.open += (target - d.open) * Math.min(1, this.dt * 9);
  }

  step() {
    this.updateDoor();
    this.applyForces();
    this.world.step(this.events);
    this.events.drainContactForceEvents((ev) => {
      const a = this.byCollider.get(ev.collider1());
      const b = this.byCollider.get(ev.collider2());
      if (a) a.contactT = this.time;
      if (b) b.contactT = this.time;
    });
    this.time += this.dt;
    const finish = this.course.finishTest;
    for (const m of this.marbles) {
      if (finish && m.finishTime === undefined && finish(m.body.translation())) m.finishTime = this.time;
      const v = m.body.linvel();
      const dv = Math.hypot(v.x - m.lastVel.x, v.y - m.lastVel.y, v.z - m.lastVel.z);
      const expected = 9.81 * this.dt * 1.6;
      if (dv > expected) m.impact = Math.max(m.impact, dv - expected);
      m.lastVel.x = v.x;
      m.lastVel.y = v.y;
      m.lastVel.z = v.z;
    }
  }
}
