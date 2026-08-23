// Skater physics + trick state machine + scoring. No rendering, no DOM. Reads `input`,
// queries the CollisionWorld, emits events for hud/audio/mesh.
import * as THREE from '../vendor/three.module.min.js';
import { CFG } from './config.js';
import { clamp, lerp, fwd, yawOf, angleDiff, wrapAngle, damp, dampAngle, storeGet, storeSet } from './util.js';

const V = () => new THREE.Vector3();
const _f = V(), _tmp = V(), _g = {};
const STEP = 1 / 120;

export class Skater {
  constructor(collide, spawn) {
    this.cw = collide;
    this.pos = V().set(spawn.x, spawn.y, spawn.z); this.vel = V(); this.yaw = spawn.yaw || 0;
    this.state = 'ride';                 // ride | air | grind | manual | bail
    this.onGround = true; this.groundKind = 'ground'; this.groundObj = null; this.normal = V().set(0, 1, 0);
    this.speed = 0; this.fwdSpeed = 0; this.crouch = 0; this.pushAnim = 0; this.pushTimer = 0;
    this.charge = 0; this.charging = false;
    this.yawVel = 0; this.spinAccum = 0; this.airTime = 0; this.airPeak = 0; this.lastGround = V().copy(this.pos);
    this.flip = null;                    // { kind, t, dur, dir }
    this.shoveOff = 0;                   // visual board yaw offset during shove-its
    this.grab = null;                    // { name, t }
    this.grind = null;                   // { edge, t, dir, speed, type, time, balance }
    this.manual = null;                  // { nose, time, balance }
    this.bail = null;                    // { t, vel, spin }
    this.grindCooldown = 0; this.lastEdge = null;
    this.balance = 0;
    this.combo = []; this.comboPending = 0; this.score = 0; this.best = +(storeGet('css-best', 0) || 0);
    this.bankedThisLanding = 0; this.session = { tricks: 0, bails: 0, bestCombo: 0, grindTime: 0, topSpeed: 0, dist: 0 };
    this.events = []; this.spots = []; this.spotsHit = new Set();
    this.stats = { clean: 0 };
    this._acc = 0; this.wallHitCooldown = 0; this.sketchy = 0;
    this.input = null; this.t = 0;
    this.lean = 0;                       // visual lean from steering
    this.hitboxR = CFG.skaterRadius;
  }

  emit(type, data) { this.events.push(Object.assign({ type, t: this.t }, data || {})); }

  respawn(x, y, z, yaw) {
    this.pos.set(x, y, z); this.vel.set(0, 0, 0); this.yaw = yaw ?? this.yaw; this.state = 'ride';
    this.flip = null; this.grind = null; this.manual = null; this.bail = null; this.grab = null; this.combo = []; this.comboPending = 0;
    this.yawVel = 0; this.spinAccum = 0; this.shoveOff = 0; this.charging = false; this.charge = 0; this.crouch = 0; this.balance = 0;
    this.lastEdge = null; this.grindCooldown = 0; this.wallHitCooldown = 0; this._landedAt = -1; this.groundKind = 'ground'; this.groundObj = null; this.normal.set(0, 1, 0);
    this.onGround = true; this._acc = 0; this.sketchy = 0; this.braking = false;
    const P = this._pend; P.flipA = P.flipB = P.shove = P.olliePressed = P.ollieReleased = false;
    this.events.length = 0;
  }

  // ---- main update (fixed substeps) ---------------------------------------
  update(dt, input) {
    this.input = input; this._acc += Math.min(dt, 0.1);
    // latch one-shot edges until a substep consumes them (frames can be shorter than a substep)
    const P = this._pend;
    P.flipA = P.flipA || input.flipA; P.flipB = P.flipB || input.flipB; P.shove = P.shove || input.shove;
    P.olliePressed = P.olliePressed || input.olliePressed; P.ollieReleased = P.ollieReleased || input.ollieReleased;
    let n = 0;
    while (this._acc >= STEP && n < 12) { this.step(STEP, input); this._acc -= STEP; n++; }
  }
  _pend = { flipA: false, flipB: false, shove: false, olliePressed: false, ollieReleased: false };
  _ev = { flipA: false, flipB: false, shove: false, olliePressed: false, ollieReleased: false };

  step(dt, inp) {
    this.t += dt;
    const P = this._pend; const ev = this._ev; ev.flipA = P.flipA; ev.flipB = P.flipB; ev.shove = P.shove; ev.olliePressed = P.olliePressed; ev.ollieReleased = P.ollieReleased;
    P.flipA = P.flipB = P.shove = P.olliePressed = P.ollieReleased = false;
    if (this.grindCooldown > 0) this.grindCooldown -= dt;
    if (this.wallHitCooldown > 0) this.wallHitCooldown -= dt;
    this.session.topSpeed = Math.max(this.session.topSpeed, this.vel.length());
    switch (this.state) {
      case 'ride': this.stepRide(dt, inp, ev, false); break;
      case 'manual': this.stepRide(dt, inp, ev, true); break;
      case 'air': this.stepAir(dt, inp, ev); break;
      case 'grind': this.stepGrind(dt, inp, ev); break;
      case 'bail': this.stepBail(dt, inp, ev); break;
    }
    this.speed = this.vel.length();
    fwd(this.yaw, _f); this.fwdSpeed = this.vel.dot(_f);
    this.lean = damp(this.lean, (this.state === 'air' ? 0.3 : 1) * inp.steer * clamp(this.speed / 6, 0.2, 1), 8, dt);
  }

  // ---- charging / ollie ----------------------------------------------------
  handleOllieCharge(dt, inp, ev) {
    if (ev.olliePressed) { this.charging = true; this.charge = 0; }
    if (this.charging) { this.charge = Math.min(CFG.ollieCharge, this.charge + dt); this.crouch = damp(this.crouch, 0.5 + 0.5 * this.charge / CFG.ollieCharge, 14, dt); }
    else this.crouch = damp(this.crouch, 0, 10, dt);
    if (ev.ollieReleased && this.charging) { this.charging = false; return lerp(CFG.ollieMin, CFG.ollieMax, clamp(this.charge / CFG.ollieCharge, 0, 1)); }
    // flip button without ollie = auto pop (mobile-friendly)
    if ((ev.flipA || ev.flipB || ev.shove) && !this.charging) return CFG.ollieMin + 0.5;
    return 0;
  }

  pop(vy, inp, ev) {
    this.state = 'air'; this.onGround = false; this.vel.y = vy; this.pos.y += 0.03; this.airTime = 0; this.airPeak = this.pos.y; this.spinAccum = 0; this.yawVel = 0; this.crouch = 0; this.charging = false;
    this.emit('pop', { vy });
    this.addTrickPending({ name: 'Ollie', pts: CFG.score.ollie, silent: true });
    if (ev) this.startFlips(ev, inp);
  }

  // ---- RIDE / MANUAL ------------------------------------------------------------
  stepRide(dt, inp, ev, manual) {
    const cw = this.cw, p = this.pos, v = this.vel;
    const onStairs = this.groundKind === 'stairs';
    const g = _g; g.kind = this.groundKind; g.ny = this.normal.y; g.nx = this.normal.x; g.nz = this.normal.z;
    // gravity along slope (previous support normal)
    const gx = CFG.gravity * g.ny * g.nx, gz = CFG.gravity * g.ny * g.nz;
    v.x += gx * dt; v.z += gz * dt; v.y = 0;
    // steering
    fwd(this.yaw, _f);
    const sp = v.length(); const along = v.dot(_f); const dirSign = along >= 0 ? 1 : -1;
    if (sp > 0.25) {
      const tr = lerp(CFG.turnRate, CFG.turnRateHighSpeed, clamp(sp / 12, 0, 1));
      this.yaw += -inp.steer * tr * dt * dirSign; // steer right (+1) → yaw decreases (clockwise)
      fwd(this.yaw, _f);
      // carve: pull velocity toward the board's axis
      const alongNew = v.dot(_f); _tmp.copy(_f).multiplyScalar(alongNew); // longitudinal
      const latX = v.x - _tmp.x, latZ = v.z - _tmp.z; const k = Math.min(1, CFG.grip * dt);
      v.x -= latX * k; v.z -= latZ * k;
    }
    // push / brake
    if (this.pushTimer > 0) this.pushTimer -= dt;
    this.pushAnim = Math.max(0, this.pushAnim - dt * 2.2);
    if (!manual && inp.throttle > 0.3 && !this.charging) {
      if (this.pushTimer <= 0 && along < CFG.maxPushSpeed) {
        const scale = clamp(1 - along / CFG.maxPushSpeed, 0.15, 1) * inp.throttle;
        v.addScaledVector(_f, CFG.pushImpulse * (0.5 + 0.7 * scale)); this.pushTimer = CFG.pushInterval; this.pushAnim = 1; this.emit('push');
      }
    } else if (inp.throttle < -0.3 && !manual) {
      const dec = CFG.brakeDecel * -inp.throttle * dt; const s2 = v.length(); if (s2 > 0) { const ns = Math.max(0, s2 - dec); v.multiplyScalar(ns / s2); } if (!this.braking) { this.braking = true; this.emit('brake'); }
    } else this.braking = false;
    // rolling friction (more on grass/brick)
    const fr = CFG.rollFriction * (g.kind === 'grass' ? 6 : g.kind === 'brick' ? 1.3 : 1);
    const s3 = v.length(); if (s3 > 0) v.multiplyScalar(Math.max(0, s3 - fr * dt) / s3);
    if (s3 > 18) v.multiplyScalar(18 / s3);
    // move
    p.x += v.x * dt; p.z += v.z * dt;
    this.session.dist += s3 * dt;
    // ground support at the new position
    cw.groundAt(p.x, p.z, p.y, onStairs ? 0.6 : 0.24, g);
    const drop = p.y - g.y;
    if (drop > 0.32) { // rolled off something
      if (manual) { const m = this.manual; this.addTrickPending({ name: m.nose ? 'Nose Manual' : 'Manual', pts: CFG.score.manualBase + CFG.score.manualPerSec * m.time }); this.manual = null; this.balance = 0; }
      this.state = 'air'; this.onGround = false; this.airTime = 0; this.airPeak = p.y; this.spinAccum = 0; this.yawVel = 0; this.flip = null;
      return;
    }
    p.y = g.y; this.onGround = true; this.groundKind = g.kind; this.groundObj = g.obj; this.normal.set(g.nx, g.ny, g.nz);
    this.lastGround.copy(p);
    // walls
    const hit = cw.resolveWalls(p, this.hitboxR, p.y, p.y + 1.6, undefined, onStairs ? 0.6 : 0.12);
    if (hit) {
      const vn = v.x * hit.nx + v.z * hit.nz;
      if (vn < 0) {
        if (-vn > CFG.wallBailSpeed && this.wallHitCooldown <= 0) { this.startBail('wall'); return; }
        v.x -= hit.nx * vn * 1.05; v.z -= hit.nz * vn * 1.05; this.wallHitCooldown = 0.3; if (-vn > 2) this.emit('bump', { speed: -vn });
      }
    }
    // manual balance
    if (manual) {
      const m = this.manual; m.time += dt;
      m.balance += (CFG.balanceDrift * (Math.sin(this.t * 3.1 + m.seed) * 0.6 + Math.sin(this.t * 7.7 + m.seed) * 0.4) + (m.nose ? -1 : 1) * 0.35 * (1 + m.time * 0.5)) * dt;
      m.balance += inp.steer * CFG.balanceCorrect * dt;
      this.balance = m.balance;
      if (Math.abs(m.balance) > CFG.balanceLimit) { this.startBail('manual'); return; }
      if (!inp.grab || v.length() < 1.2) { this.endManual(); manual = false; }
    } else {
      // post-landing: entering a manual?
      if (inp.grab && this._landedAt > this.t - 0.25 && v.length() > 2.5 && this.state === 'ride') { this.startManual(inp.throttle < -0.3); }
    }
    // bank combo once settled (not in manual, no pending action)
    if (!manual && this.combo.length && this._landedAt < this.t - 0.3 && !this.charging) this.bankCombo();
    // ollie
    const vy = this.handleOllieCharge(dt, inp, ev);
    if (vy > 0) { if (manual) { this.addTrickPending({ name: (this.manual.nose ? 'Nose Manual' : 'Manual'), pts: CFG.score.manualBase + CFG.score.manualPerSec * this.manual.time }); this.manual = null; this.balance = 0; } this.pop(vy, inp, ev); return; }
    this.onGround = true;
  }

  startManual(nose) { this.state = 'manual'; this.manual = { nose, time: 0, balance: 0, seed: Math.random() * 10 }; this.emit('manual', { nose }); }
  endManual() { const m = this.manual; this.addTrickPending({ name: m.nose ? 'Nose Manual' : 'Manual', pts: CFG.score.manualBase + CFG.score.manualPerSec * m.time }); this.manual = null; this.balance = 0; this.state = 'ride'; this._landedAt = this.t; }

  // ---- AIR ---------------------------------------------------------------------
  startFlips(ev, inp) {
    const f = this.flip;
    if (ev.flipA || ev.flipB) {
      const kind = ev.flipA ? 'kickflip' : 'heelflip';
      if (f && f.kind === 'shoveit' && f.t < 0.18) { f.kind = ev.flipA ? 'treflip' : 'varial'; f.dur = CFG.flipTime * 1.35; f.t = 0; f.flipDir = ev.flipA ? 1 : -1; }
      else if (!f) this.flip = { kind, t: 0, dur: CFG.flipTime, flipDir: kind === 'kickflip' ? 1 : -1, shoveDir: 0 };
      else if (f.t > f.dur * 0.8) { this.finishFlip(); this.flip = { kind, t: 0, dur: CFG.flipTime, flipDir: kind === 'kickflip' ? 1 : -1, shoveDir: 0, chain: true }; }
    }
    if (ev.shove) {
      const dir = inp.steer < -0.2 ? 1 : -1; const f = this.flip;
      if (f && (f.kind === 'kickflip' || f.kind === 'heelflip') && f.t < 0.18) { f.kind = f.kind === 'kickflip' ? 'treflip' : 'varial'; f.dur = CFG.flipTime * 1.35; f.t = 0; f.shoveDir = dir; }
      else if (!f) this.flip = { kind: 'shoveit', t: 0, dur: CFG.flipTime * 0.9, flipDir: 0, shoveDir: dir };
      else if (f.t > f.dur * 0.8) { this.finishFlip(); this.flip = { kind: 'shoveit', t: 0, dur: CFG.flipTime * 0.9, flipDir: 0, shoveDir: dir, chain: true }; }
    }
  }
  finishFlip() {
    const f = this.flip; if (!f) return;
    const names = { kickflip: ['Kickflip', CFG.score.kickflip], heelflip: ['Heelflip', CFG.score.heelflip], shoveit: [f.shoveDir > 0 ? 'FS Shove-it' : 'Pop Shove-it', f.shoveDir > 0 ? CFG.score.fsshoveit : CFG.score.shoveit], treflip: ['360 Flip', CFG.score.treflip], varial: ['Varial Heelflip', CFG.score.varial] };
    const [name, pts] = names[f.kind]; this.addTrickPending({ name: (f.chain ? 'Double ' : '') + name, pts: f.chain ? pts * 1.5 : pts });
    this.flip = null; this.shoveOff = 0;
  }

  stepAir(dt, inp, ev) {
    const cw = this.cw, p = this.pos, v = this.vel;
    this.airTime += dt; this.crouch = damp(this.crouch, 0.25, 6, dt);
    // spin
    const want = -inp.steer * CFG.spinRate; this.yawVel = damp(this.yawVel, want, 10, dt);
    this.yaw += this.yawVel * dt; this.spinAccum += this.yawVel * dt;
    // flips
    this.startFlips(ev, inp);
    if (this.flip) { this.flip.t += dt; if (this.flip.t >= this.flip.dur) this.finishFlip(); }
    // grab
    if (inp.grab && this.airTime > 0.15) { if (!this.grab) { this.grab = { name: inp.steer < -0.3 ? 'Melon' : inp.steer > 0.3 ? 'Indy' : 'Nosegrab', t: 0 }; } this.grab.t += dt; }
    else if (this.grab) { if (this.grab.t > 0.2) this.addTrickPending({ name: this.grab.name, pts: 70 + 60 * this.grab.t }); this.grab = null; }
    // integrate
    v.y -= CFG.gravity * dt; v.x *= (1 - CFG.airDrag * dt); v.z *= (1 - CFG.airDrag * dt);
    const oldY = p.y; p.x += v.x * dt; p.y += v.y * dt; p.z += v.z * dt;
    if (p.y > this.airPeak) this.airPeak = p.y;
    // walls
    const hit = cw.resolveWalls(p, this.hitboxR, p.y, p.y + 1.6);
    if (hit) { const vn = v.x * hit.nx + v.z * hit.nz; if (vn < 0) { if (-vn > CFG.wallBailSpeed) { this.startBail('wall'); return; } v.x -= hit.nx * vn * 1.2; v.z -= hit.nz * vn * 1.2; } }
    // ceiling
    const ceil = cw.ceilingAt(p.x, p.z, p.y); if (p.y + 1.7 > ceil && v.y > 0) { p.y = ceil - 1.7; v.y = 0; }
    // grind snap
    if (v.y < 0.25 && this.grindCooldown <= 0 && (v.x * v.x + v.z * v.z) > 1.0) {
      const e = cw.nearestEdge(p.x, p.y, p.z, CFG.grindSnapDist, CFG.grindSnapAbove, CFG.grindSnapBelow, this._e || (this._e = {}));
      if (e && e.edge !== this.lastEdge) { this.startGrind(e, inp); return; }
    }
    // landing
    if (v.y <= 0) {
      const g = cw.groundAt(p.x, p.z, oldY, 0.18, _g);
      if (p.y <= g.y) { p.y = g.y; this.land(g, inp); }
    }
    if (p.y < -60) { this.startBail('fall'); }
  }

  land(g, inp) {
    const v = this.vel; this.normal.set(g.nx, g.ny, g.nz); this.groundKind = g.kind; this.groundObj = g.obj;
    // finish pending spin
    const half = Math.round(Math.abs(this.spinAccum) / Math.PI);
    let bail = null;
    if (this.flip && this.flip.t < this.flip.dur * 0.82) bail = 'flip';
    const vy2 = yawOf(v.x, v.z); const sp = Math.hypot(v.x, v.z);
    let d = Math.abs(angleDiff(this.yaw, vy2)); d = Math.min(d, Math.PI - d); // board is symmetric
    if (sp > 2 && d > CFG.landTolerance) bail = bail || 'spin';
    if (bail) { this.startBail(bail); return; }
    if (this.flip) this.finishFlip();
    if (half >= 1) { const deg = half * 180; const pts = { 1: CFG.score.spin180, 2: CFG.score.spin360, 3: CFG.score.spin540, 4: CFG.score.spin720 }[Math.min(half, 4)] * (half > 4 ? half / 4 : 1);
      this.addTrickPending({ name: (this.spinAccum > 0 ? 'FS ' : 'BS ') + deg, pts }); }
    if (this.grab) { if (this.grab.t > 0.2) this.addTrickPending({ name: this.grab.name, pts: 70 + 60 * this.grab.t }); this.grab = null; }
    const height = this.airPeak - this.pos.y;
    if (this.airTime > 1.1 || height > 2.2) this.addTrickPending({ name: height > 2.2 ? 'Big Drop' : 'Big Air', pts: CFG.score.bigAir + Math.round(height * 40) });
    // snap yaw to travel axis softly
    const target = d < Math.PI / 4 ? vy2 : vy2 + Math.PI; this.yaw = wrapAngle(target + angleDiff(this.yaw, target) * 0.35);
    v.y = 0; this.yawVel = 0; this.spinAccum = 0; this.state = 'ride'; this._landedAt = this.t; this.sketchy = d > CFG.landTolerance * 0.6 ? 1 : 0;
    this.emit('land', { sketchy: this.sketchy, speed: sp, height });
    this.lastEdge = null;
    if (this.combo.length <= 1 && this.comboPending <= CFG.score.ollie) { this.combo = []; this.comboPending = 0; } // lone ollie = no combo
  }

  // ---- GRIND -------------------------------------------------------------------
  startGrind(e, inp) {
    const edge = e.edge, v = this.vel;
    if (this.flip && this.flip.t < this.flip.dur * 0.82) { this.startBail('flip'); return; }
    if (this.flip) this.finishFlip();
    if (this.grab) { if (this.grab.t > 0.2) this.addTrickPending({ name: this.grab.name, pts: 70 + 60 * this.grab.t }); this.grab = null; }
    const dx = (edge.bx - edge.ax) / edge.len, dz = (edge.bz - edge.az) / edge.len;
    let along = v.x * dx + v.z * dz; const dir = along >= 0 ? 1 : -1; let speed = Math.abs(along);
    const edgeYaw = yawOf(dx * dir, dz * dir);
    let d = Math.abs(angleDiff(this.yaw, edgeYaw)); d = Math.min(d, Math.PI - d);
    const perp = d > 0.95; const fsbs = angleDiff(this.yaw, edgeYaw) > 0 ? 'FS ' : 'BS ';
    const onRail = edge.kind === 'rail' || edge.kind === 'handrail';
    let type;
    if (perp) type = onRail ? 'Boardslide' : (inp.grab ? 'Lipslide' : 'Boardslide');
    else type = inp.grab ? (inp.throttle < -0.3 ? 'Nosegrind' : '5-0') : (inp.throttle > 0.5 ? 'Nosegrind' : inp.throttle < -0.5 ? '5-0' : '50-50');
    if (type === 'Boardslide' && !onRail) type = 'Boardslide';
    if (speed < 1.6) speed = 1.6;
    this.grind = { edge, t: e.t, dir, speed, type: (type === '50-50' ? '' : fsbs) + type, time: 0, balance: 0, seed: Math.random() * 10, targetYaw: perp ? edgeYaw + Math.PI / 2 * (angleDiff(this.yaw, edgeYaw) > 0 ? 1 : -1) : (d < Math.PI / 4 ? edgeYaw : edgeYaw + Math.PI), perp };
    this.pos.set(e.px, e.py, e.pz); v.set(dx * dir * speed, 0, dz * dir * speed); this.yawVel = 0; this.spinAccum = 0;
    this.state = 'grind'; this.lastEdge = edge; this.flip = null; this.shoveOff = 0; this.grab = null;
    this.emit('grindStart', { type: this.grind.type, name: edge.name, kind: edge.kind });
    // count the spin that got us here
  }
  stepGrind(dt, inp, ev) {
    const G = this.grind, e = G.edge, p = this.pos, v = this.vel;
    G.time += dt; this.session.grindTime += dt;
    G.speed = Math.max(0, G.speed - CFG.grindFriction * dt * (e.kind === 'rail' ? 0.6 : 1));
    // downhill component along a sloped edge
    const slope = (e.by - e.ay) / e.len; G.speed -= slope * G.dir * CFG.gravity * 0.4 * dt;
    if (G.speed < 0.6) { this.exitGrind(0.2, 'slow'); return; }
    G.t += G.dir * G.speed * dt / e.len;
    this.yaw = dampAngle(this.yaw, G.targetYaw, 12, dt);
    // balance (steer to correct; drift grows with time)
    G.balance += (CFG.balanceDrift * (Math.sin(this.t * 2.7 + G.seed) * 0.55 + Math.sin(this.t * 6.3 + G.seed * 2) * 0.45) * (0.6 + G.time * 0.35)) * dt;
    G.balance += inp.steer * CFG.balanceCorrect * dt * 0.9;
    this.balance = G.balance;
    if (Math.abs(G.balance) > CFG.balanceLimit) { this.startBail('grind'); return; }
    const dx = (e.bx - e.ax) / e.len, dz = (e.bz - e.az) / e.len;
    if (G.t < 0 || G.t > 1) { this.exitGrind(0.6, 'end'); return; }
    p.set(e.ax + (e.bx - e.ax) * G.t, e.ay + (e.by - e.ay) * G.t, e.az + (e.bz - e.az) * G.t);
    v.set(dx * G.dir * G.speed, 0, dz * G.dir * G.speed);
    this.crouch = damp(this.crouch, 0.35, 8, dt);
    // ollie out
    const vy = this.handleOllieCharge(dt, inp, ev);
    if (vy > 0) { this.exitGrind(vy, 'ollie', ev, inp); }
  }
  exitGrind(vy, why, ev, inp) {
    const G = this.grind; const pts = CFG.score.grindBase + CFG.score.grindPerSec * G.time * (G.edge.kind === 'rail' ? 1.3 : 1);
    this.addTrickPending({ name: G.type + (G.edge.name ? ' · ' + G.edge.name : ''), pts, spotName: G.edge.name });
    this.grind = null; this.balance = 0; this.grindCooldown = why === 'ollie' ? 0.05 : 0.25;
    this.state = 'air'; this.vel.y = vy; this.airTime = 0; this.airPeak = this.pos.y; this.spinAccum = 0; this.pos.y += 0.02;
    this.emit('grindEnd', { why });
    if (ev) this.startFlips(ev, inp);
  }

  // ---- BAIL ----------------------------------------------------------------------
  startBail(why) {
    if (this.state === 'bail') return;
    this.bail = { t: 0, why, spin: (Math.random() - 0.5) * 6 };
    this.state = 'bail'; this.flip = null; this.grind = null; this.manual = null; this.grab = null; this.balance = 0; this.charging = false; this.shoveOff = 0;
    const lost = this.comboValue(); this.combo = []; this.comboPending = 0; this.session.bails++;
    this.emit('bail', { why, lost });
    if (why === 'wall' || why === 'car' || why === 'npc') { this.vel.multiplyScalar(0.3); this.vel.y = 2.5; } else { this.vel.x *= 0.7; this.vel.z *= 0.7; }
    this.bail.grounded = 0;
  }
  stepBail(dt, inp, ev) {
    const b = this.bail, p = this.pos, v = this.vel, cw = this.cw;
    b.t += dt;
    v.y -= CFG.gravity * dt; const oldY = p.y; p.x += v.x * dt; p.y += v.y * dt; p.z += v.z * dt;
    const g = cw.groundAt(p.x, p.z, oldY, 0.3, _g);
    if (p.y <= g.y) { p.y = g.y; v.y = 0; b.grounded += dt; const s = Math.hypot(v.x, v.z); if (s > 0) { const ns = Math.max(0, s - 9 * dt); v.x *= ns / s; v.z *= ns / s; } }
    cw.resolveWalls(p, this.hitboxR, p.y, p.y + 1);
    if (b.t > CFG.bailTime && b.grounded > 0.3 || b.t > 6) { this.state = 'ride'; this.bail = null; v.set(0, 0, 0); this._landedAt = -1; this.emit('recover'); }
  }

  // ---- SCORING -------------------------------------------------------------------
  addTrickPending(tr) {
    tr.pts = Math.round(tr.pts); tr.x = this.pos.x; tr.z = this.pos.z; this.combo.push(tr); this.comboPending += tr.pts; this.session.tricks++;
    if (!tr.silent) this.emit('trick', { name: tr.name, pts: tr.pts, combo: this.combo.length, total: this.comboValue() });
  }
  comboValue() { const n = this.combo.filter(t => !t.silent).length; const sum = this.combo.reduce((a, t) => a + t.pts, 0); return Math.round(sum * Math.min(Math.max(n, 1), 8)); }
  bankCombo() {
    const real = this.combo.filter(t => !t.silent); if (!real.length) { this.combo = []; this.comboPending = 0; return; }
    let total = this.comboValue();
    // spot bonus: any trick done at a named spot, or landing inside a spot
    let here = this.spotAt(this.pos.x, this.pos.z);
    for (const t of this.combo) { const s2 = this.spotAt(t.x, t.z); if (s2 && (!here || s2.bonus > here.bonus)) here = s2; }
    let spot = null; if (here) { spot = here; total += here.bonus; if (!this.spotsHit.has(here.name)) { this.spotsHit.add(here.name); this.emit('spotFirst', { name: here.name, bonus: here.bonus }); } }
    this.score += total; this.session.bestCombo = Math.max(this.session.bestCombo, total);
    if (this.score > this.best) { this.best = this.score; storeSet('css-best', String(this.best)); }
    this.emit('bank', { total, n: real.length, spot: spot ? spot.name : null, tricks: real.map(t => t.name) });
    this.combo = []; this.comboPending = 0;
  }
  // The most *specific* spot containing (x,z) wins: a small spot nested inside a big one
  // (the fountain inside City Hall Park) must be reachable, so radius beats distance.
  spotAt(x, z) {
    let best = null;
    for (const s of this.spots) {
      const d = Math.hypot(s.x - x, s.z - z); if (d >= s.r) continue;
      if (!best || s.r < best.r || (s.r === best.r && d < Math.hypot(best.x - x, best.z - z))) best = s;
    }
    return best;
  }
}
