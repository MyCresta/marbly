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
    this.funnelDrag = 0.42;
    this.time = 0;
    for (const c of course.colliders) this.addStatic(c);
  }

  addStatic(c) {
    const R = this.R;
    let desc;
    if (c.kind === 'trimesh') {
      desc = R.ColliderDesc.trimesh(c.vertices, c.indices, R.TriMeshFlags.FIX_INTERNAL_EDGES_TWO_SIDED);
    } else if (c.kind === 'cuboid') {
      desc = R.ColliderDesc.cuboid(c.half[0], c.half[1], c.half[2]).setTranslation(c.pos[0], c.pos[1], c.pos[2]);
      if (c.rot) desc.setRotation({ x: c.rot[0], y: c.rot[1], z: c.rot[2], w: c.rot[3] });
    } else if (c.kind === 'ball') {
      desc = R.ColliderDesc.ball(c.radius).setTranslation(c.pos[0], c.pos[1], c.pos[2]);
    }
    desc.setFriction(c.friction ?? 0.5).setRestitution(c.restitution ?? 0.3);
    desc.setRestitutionCombineRule(R.CoefficientCombineRule.Average);
    return this.world.createCollider(desc);
  }

  addMarble(type, pos, vel = { x: 0, y: 0, z: 0 }) {
    const R = this.R;
    const bodyDesc = R.RigidBodyDesc.dynamic()
      .setTranslation(pos.x, pos.y, pos.z)
      .setLinvel(vel.x, vel.y, vel.z)
      .setCcdEnabled(true)
      .setLinearDamping(0.06)
      .setAngularDamping(0.35);
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
    const W = this.course.wind;
    const b = W.box;
    for (const m of this.marbles) {
      const body = m.body;
      if (body.isSleeping()) continue;
      body.resetForces(false);
      const p = body.translation();
      const v = body.linvel();
      const speed = Math.hypot(v.x, v.y, v.z);
      const dk = this.drag * m.area * speed;
      let fx = -dk * v.x;
      let fy = -dk * v.y;
      let fz = -dk * v.z;
      const F = this.course.funnel;
      const rf = Math.hypot(p.x - F.x, p.z - F.z);
      if (rf < F.rim && p.y < F.top + F.lip && p.y > F.top - F.depth - 0.01) {
        const c = this.funnelDrag * m.mass;
        fx -= c * v.x;
        fy -= c * v.y;
        fz -= c * v.z;
        if (rf < 0.034 && speed < 0.12 && p.y < F.top - F.depth + 0.03) {
          m.stuck = (m.stuck || 0) + STEP;
          if (m.stuck > 0.25) {
            const a = Math.random() * Math.PI * 2;
            const k = m.mass * 0.6;
            body.applyImpulse({ x: Math.cos(a) * k * 0.02 + (F.x - p.x) * k * 0.6, y: -k * 0.01, z: Math.sin(a) * k * 0.02 + (F.z - p.z) * k * 0.6 }, true);
            m.stuck = 0;
          }
        } else {
          m.stuck = 0;
        }
      }
      const CZ = this.course.chuteZone;
      if (Math.abs(p.x - CZ.x) < 0.03 && p.z > CZ.z0 && p.z < CZ.z1 && p.y > CZ.yMin && p.y < CZ.yMax) {
        fx -= 7 * m.mass * v.x;
      }
      m.inWind = false;
      if (this.windEnabled && p.x > b.xMin && p.x < b.xMax && p.y > b.yMin && p.y < b.yMax && p.z > b.zMin && p.z < b.zMax) {
        const edge = Math.min(1, (p.z - b.zMin) / 0.02, (b.zMax - p.z) / 0.03, (p.y - b.yMin) / 0.02);
        const dist = Math.max(0, p.x - W.origin.x);
        const falloff = 1 / (1 + (dist / 0.45) ** 2);
        const f = W.strength * m.area * falloff * Math.max(0, edge);
        fx += f * W.dir.x;
        fy += f * W.dir.y;
        fz += f * W.dir.z;
        m.inWind = true;
      }
      body.addForce({ x: fx, y: fy, z: fz }, true);
    }
  }

  step() {
    this.applyForces();
    this.world.step();
    this.time += STEP;
    for (const m of this.marbles) {
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
