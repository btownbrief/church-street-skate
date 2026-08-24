// Low-poly skater + board, posed every frame from the Skater state machine.
// Original art: boxes, cylinders and one tiny canvas texture for the deck graphic.
// Legs and arms are solved with a 2-bone analytic IK from foot/hand targets, so poses
// are authored as "where does the foot/hand go" instead of piles of joint angles.
// Zero allocations per frame: every temp vector/quaternion is preallocated.
import * as THREE from '../vendor/three.module.min.js';
import { clamp, damp, lerp, fwd } from './util.js';

const TAU = Math.PI * 2;
const BOX = new THREE.BoxGeometry(1, 1, 1);
const CYL = new THREE.CylinderGeometry(1, 1, 1, 10);
const UP = new THREE.Vector3(0, 1, 0);
const ZERO = new THREE.Vector3();

const lam = (c) => new THREE.MeshLambertMaterial({ color: c });
const C = {
  skin: 0xd8a077, hoodie: 0xd4553a, hood: 0xa93a25, pants: 0x2f3648,
  shoe: 0xf1eee3, sole: 0x1b1d24, cap: 0x1d2b45, bill: 0x141d31,
  grip: 0x15171c, side: 0x2c9a58, kick: 0xf0c33c, truck: 0xb9bec6, wheel: 0xf3ecd6,
};
const M = {}; for (const k in C) M[k] = lam(C[k]);
// One shared vertex-coloured material for every rigid cluster (board hardware, torso,
// head, feet). Merging those clusters takes the player from 33 draw calls to 17.
const MVC = new THREE.MeshLambertMaterial({ vertexColors: true });
const _tmpC = new THREE.Color(), _tmpM = new THREE.Matrix4(), _tmpE = new THREE.Euler(), _tmpQ = new THREE.Quaternion(), _tmpV = new THREE.Vector3(), _tmpS = new THREE.Vector3();
// specs: { g:'box'|'cyl', s:[x,y,z], p:[x,y,z], r:[x,y,z], c: hex }
function mergeParts(specs) {
  const pos = [], nor = [], col = [];
  for (const sp of specs) {
    const src = sp.g === 'cyl' ? CYL : BOX;
    const g = src.index ? src.toNonIndexed() : src.clone();
    const r = sp.r || [0, 0, 0];
    _tmpE.set(r[0], r[1], r[2]); _tmpQ.setFromEuler(_tmpE);
    _tmpV.set(sp.p[0], sp.p[1], sp.p[2]); _tmpS.set(sp.s[0], sp.s[1], sp.s[2]);
    g.applyMatrix4(_tmpM.compose(_tmpV, _tmpQ, _tmpS));
    const P = g.attributes.position.array, N = g.attributes.normal.array;
    _tmpC.setHex(sp.c);
    for (let i = 0; i < P.length; i++) { pos.push(P[i]); nor.push(N[i]); }
    for (let i = 0; i < P.length / 3; i++) { col.push(_tmpC.r, _tmpC.g, _tmpC.b); }
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return out;
}

// Bright underside graphic — the camera sees this every flip. Vermont green/yellow.
function deckTexture() {
  const c = document.createElement('canvas'); c.width = 64; c.height = 192;
  const g = c.getContext('2d');
  g.fillStyle = '#12693c'; g.fillRect(0, 0, 64, 192);
  g.strokeStyle = '#f0c33c'; g.lineWidth = 10; g.lineCap = 'butt';
  for (let i = -2; i < 7; i++) { g.beginPath(); g.moveTo(-30 + i * 34, 0); g.lineTo(-30 + i * 34 + 62, 192); g.stroke(); }
  g.fillStyle = '#0d3f26'; g.fillRect(0, 78, 64, 46);
  g.fillStyle = '#f6f3e7';                                  // little mountain range
  g.beginPath(); g.moveTo(4, 116); g.lineTo(20, 86); g.lineTo(33, 108); g.lineTo(44, 88); g.lineTo(60, 116); g.closePath(); g.fill();
  g.fillStyle = '#d4553a'; g.fillRect(0, 122, 64, 7);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  return new THREE.MeshLambertMaterial({ map: tex });
}

export class SkaterMesh {
  constructor(scene, shadows) {
    this.shadows = !!shadows;
    this.root = new THREE.Group(); scene.add(this.root);
    this.boardPivot = new THREE.Group(); this.root.add(this.boardPivot);   // detaches on a bail
    this.board = new THREE.Group(); this.boardPivot.add(this.board);        // flips / pitch live here
    this.rig = new THREE.Group(); this.root.add(this.rig);                  // whole body (tumbles on a bail)
    this.body = this.rig;                                                   // legacy alias

    this._buildBoard();
    this._buildBody();

    // preallocated scratch
    this.up = new THREE.Vector3(0, 1, 0);
    this._m = new THREE.Matrix4(); this._f = new THREE.Vector3(); this._r = new THREE.Vector3(); this._b = new THREE.Vector3();
    this._v = new THREE.Vector3(); this._v2 = new THREE.Vector3(); this._qi = new THREE.Quaternion();
    this._g = {};
    // loose board physics during a bail (world space)
    this.bb = new THREE.Vector3(); this.bbv = new THREE.Vector3(); this.bbSpin = 0; this.bbRoll = 0;
    this.snapFrom = new THREE.Vector3(); this.snapRot = new THREE.Vector3();
    // smoothed pose state
    this.footF = new THREE.Vector3(0, 0.18, -0.17); this.footB = new THREE.Vector3(0, 0.18, 0.19);
    this.handL = new THREE.Vector3(); this.handR = new THREE.Vector3();
    this.pelvis = new THREE.Vector3(-0.04, 0.9, 0.0);
    this.bPitch = 0; this.bY = 0; this.grabAmt = 0; this.fYaw = -0.95; this.bYaw = -1.42;
    this.spinePitch = 0; this.spineYaw = -1.15; this.spineRoll = 0; this.headYaw = 0.5; this.headPitch = 0;
    this.landT = 0; this.wobbleT = 0; this.snapT = 0; this.prev = 'ride'; this.idle = 0; this.brake = 0; this.bailLay = 0;
    this.pedal = 0; this.fakie = 0;

    this.shadowBlob = new THREE.Mesh(new THREE.CircleGeometry(0.46, 14), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.28, depthWrite: false }));
    this.shadowBlob.rotation.x = -Math.PI / 2; this.shadowBlob.renderOrder = -1; scene.add(this.shadowBlob);
    this._dbg = typeof location !== 'undefined' && location.search.indexOf('test') >= 0;
    if (this._dbg) window.__skaterMesh = this; // model inspection hook
  }

  // ---------------------------------------------------------------- build ----
  _box(parent, sx, sy, sz, m, px = 0, py = 0, pz = 0) {
    const o = new THREE.Mesh(BOX, m); o.scale.set(sx, sy, sz); o.position.set(px, py, pz);
    o.castShadow = this.shadows; parent.add(o); return o;
  }
  _merge(parent, specs) {
    const o = new THREE.Mesh(mergeParts(specs), MVC);
    o.castShadow = this.shadows; parent.add(o); return o;
  }
  _buildBoard() {
    const b = this.board;
    // whole board in one mesh: deck body, kicked nose/tail, trucks, wheels
    const parts = [
      { g: 'box', s: [0.235, 0.022, 0.60], p: [0, 0.105, 0], c: C.side },          // deck body / rails
      { g: 'box', s: [0.229, 0.005, 0.585], p: [0, 0.1175, 0], c: C.grip },        // griptape
      { g: 'box', s: [0.215, 0.022, 0.155], p: [0, 0.136, -0.371], r: [0.42, 0, 0], c: C.kick },
      { g: 'box', s: [0.215, 0.022, 0.155], p: [0, 0.136, 0.371], r: [-0.42, 0, 0], c: C.kick },
    ];
    for (const z of [-0.2, 0.2]) {
      parts.push({ g: 'box', s: [0.075, 0.062, 0.10], p: [0, 0.064, z], c: C.truck });
      parts.push({ g: 'box', s: [0.205, 0.022, 0.032], p: [0, 0.036, z], c: C.truck });
      for (const x of [-0.101, 0.101]) parts.push({ g: 'cyl', s: [0.032, 0.046, 0.032], p: [x, 0.033, z], r: [0, 0, Math.PI / 2], c: C.wheel });
    }
    this._merge(b, parts);
    // the underside graphic — the camera sees it on every flip — is its own thin plane
    const gfx = new THREE.Mesh(new THREE.PlaneGeometry(0.235, 0.60), deckTexture());
    gfx.rotation.x = Math.PI / 2; gfx.position.y = 0.0935; b.add(gfx);
  }
  _limb(parent, L1, L2, up1, up2, matU, matL) {
    const g = new THREE.Group(); parent.add(g);
    this._box(g, up1[0], L1, up1[1], matU, 0, -L1 / 2, 0);
    const mid = new THREE.Group(); mid.position.y = -L1; g.add(mid);
    this._box(mid, up2[0], L2, up2[1], matL, 0, -L2 / 2, 0);
    const end = new THREE.Group(); end.position.y = -L2; mid.add(end);
    g.mid = mid; g.end = end; g.L1 = L1; g.L2 = L2;
    return g;
  }
  _buildBody() {
    const rig = this.rig;
    // legs live in rig space so foot targets are simple board-space points
    this.legF = this._limb(rig, 0.42, 0.42, [0.15, 0.165], [0.12, 0.135], M.pants, M.pants);
    this.legB = this._limb(rig, 0.42, 0.42, [0.15, 0.165], [0.12, 0.135], M.pants, M.pants);
    for (const leg of [this.legF, this.legB]) this._merge(leg.end, [
      { g: 'box', s: [0.115, 0.075, 0.255], p: [0, -0.005, -0.02], c: C.shoe },   // toes at −z
      { g: 'box', s: [0.125, 0.028, 0.265], p: [0, -0.05, -0.02], c: C.sole },
    ]);
    const sp = this.spine = new THREE.Group(); rig.add(sp);
    this._merge(sp, [
      { g: 'box', s: [0.29, 0.17, 0.215], p: [0, 0.02, 0], c: C.pants },          // hips
      { g: 'box', s: [0.355, 0.44, 0.235], p: [0, 0.28, 0], c: C.hoodie },        // torso
      { g: 'box', s: [0.30, 0.15, 0.16], p: [0, 0.495, 0.075], c: C.hood },       // hood behind the neck
    ]);
    const hd = this.head = new THREE.Group(); hd.position.y = 0.50; sp.add(hd);
    this._merge(hd, [
      { g: 'box', s: [0.19, 0.205, 0.195], p: [0, 0.11, 0], c: C.skin },
      { g: 'box', s: [0.207, 0.098, 0.212], p: [0, 0.215, 0], c: C.cap },
      { g: 'box', s: [0.185, 0.03, 0.105], p: [0, 0.193, 0.148], r: [-0.14, 0, 0], c: C.bill }, // backwards cap
    ]);
    this.armL = this._limb(sp, 0.32, 0.30, [0.105, 0.105], [0.092, 0.092], M.hoodie, M.hoodie);
    this.armR = this._limb(sp, 0.32, 0.30, [0.105, 0.105], [0.092, 0.092], M.hoodie, M.hoodie);
    this.armL.position.set(-0.195, 0.44, 0); this.armR.position.set(0.195, 0.44, 0);
    for (const a of [this.armL, this.armR]) this._box(a.end, 0.088, 0.095, 0.088, M.skin, 0, -0.048, 0);
  }

  // -------------------------------------------------------------- 2-bone IK ----
  // Places limb so its end joint lands on (tx,ty,tz) in the limb's parent space.
  // planeYaw picks which way the knee/elbow points; endPitch/endYaw orient the foot/hand.
  _ik(limb, tx, ty, tz, planeYaw, endPitch, endYaw) {
    const v = this._v.set(tx - limb.position.x, ty - limb.position.y, tz - limb.position.z);
    v.applyAxisAngle(UP, -planeYaw);
    const L1 = limb.L1, L2 = limb.L2, maxD = (L1 + L2) * 0.995, minD = Math.abs(L1 - L2) + 0.12;
    let d = v.length();
    if (d < 1e-5) { v.set(0, -minD, 0); d = minD; }
    else if (d > maxD) { v.multiplyScalar(maxD / d); d = maxD; }
    else if (d < minD) { v.multiplyScalar(minD / d); d = minD; }
    const ux = v.x / d, uy = v.y / d, uz = v.z / d;
    const a = -Math.asin(clamp(uz, -1, 1));
    const c = Math.atan2(ux, -uy);
    const th = Math.acos(clamp((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d), -1, 1));
    const sh = Math.acos(clamp((L2 * L2 + d * d - L1 * L1) / (2 * L2 * d), -1, 1));
    limb.rotation.set(a + th, planeYaw, c, 'YZX');
    limb.mid.rotation.x = -(th + sh);
    limb.end.rotation.set(-(a - sh) + endPitch, endYaw - planeYaw, 0, 'YXZ');
  }

  // board space (x across, z along, y up from the deck) → rig space, honouring pitch + lift
  _onBoard(out, x, z, above) {
    const cs = Math.cos(this.bPitch), sn = Math.sin(this.bPitch);
    out.set(x, above * cs - z * sn + this.bY, above * sn + z * cs);
    return out;
  }

  _launchBoard(sk) {
    const s = (Math.random() - 0.5);
    this.bb.copy(sk.pos); this.bb.y += 0.1;
    this.bbv.set(sk.vel.x * 1.15 + s * 2.4, 3.0 + Math.random() * 1.2, sk.vel.z * 1.15 + (Math.random() - 0.5) * 2.4);
    this.bbSpin = (Math.random() - 0.5) * 13; this.bbRoll = (Math.random() - 0.5) * 9;
  }

  // ------------------------------------------------------------------ update ----
  update(dt, sk, t) {
    dt = clamp(dt, 0.0001, 0.05);
    if (this._dbg) this.sk = sk;
    const st = sk.state;
    if (st !== this.prev) {
      if (st === 'ride' && (this.prev === 'air' || this.prev === 'grind')) { this.landT = 0.26; this.wobbleT = sk.sketchy ? 0.45 : 0; }
      if (st === 'ride' && this.prev === 'bail') { this.snapT = 0.15; this.snapFrom.copy(this.boardPivot.position); this.snapRot.set(this.boardPivot.rotation.x, this.boardPivot.rotation.y, this.boardPivot.rotation.z); }
      if (st === 'bail') this._launchBoard(sk);
      this.prev = st;
    }
    this.landT = Math.max(0, this.landT - dt);
    this.wobbleT = Math.max(0, this.wobbleT - dt);
    this.snapT = Math.max(0, this.snapT - dt);

    const air = st === 'air', grind = st === 'grind', manual = st === 'manual', bail = st === 'bail', ride = st === 'ride';
    // bail tumble phase: 0 = upright, 1 = face down on the ground (eases back to 0 to get up)
    const bt = bail ? sk.bail.t : 0;
    const lay = bail ? clamp(bt / 0.5, 0, 1) * (1 - Math.pow(clamp((bt - 1.12) / 0.42, 0, 1), 2)) : 0;
    this.bailLay = lay;
    const sp = sk.speed, lean = clamp(sk.lean, -1, 1), bal = clamp(sk.balance, -1, 1);
    const crouch = clamp(sk.crouch, 0, 1);
    const land = this.landT / 0.26;                        // 1 → 0 just after touchdown
    const wob = this.wobbleT > 0 ? Math.sin(this.wobbleT * 46) * (this.wobbleT / 0.45) : 0;
    const push = ride ? clamp(sk.pushAnim, 0, 1) : 0;
    // braking pose only while actually scrubbing forward speed — holding S past the stop
    // is a fakie push, not a tail drag
    const braking = ride && sk.input && sk.input.throttle < -0.3 && sk.fwdSpeed > 0.6 ? 1 : 0;
    this.brake = damp(this.brake, braking, 10, dt);
    const brake = this.brake;
    // sustained-pedalling amount: the body opens up toward travel like a real push
    this.pedal = damp(this.pedal, ride && sk.input && sk.input.throttle > 0.3 && !sk.charging ? 1 : 0, 6, dt);
    const pedal = this.pedal;
    // rolling fakie: look over the other shoulder
    this.fakie = damp(this.fakie, (ride || manual) && sk.fwdSpeed < -0.5 ? 1 : 0, 6, dt);
    const fakie = this.fakie;
    this.idle = damp(this.idle, ride && sp < 0.5 && !push ? 1 : 0, 4, dt);
    const idle = this.idle;
    const breath = Math.sin(t * 1.7) * 0.5 + 0.5;

    // ---------------- root: yaw + ground normal + carve roll ----------------
    const wantUp = (ride || manual) ? sk.normal : UP;
    const up = this.up;
    up.x = damp(up.x, wantUp.x, 11, dt); up.y = damp(up.y, wantUp.y, 11, dt); up.z = damp(up.z, wantUp.z, 11, dt);
    if (up.lengthSq() < 1e-4) up.set(0, 1, 0); up.normalize();
    fwd(sk.yaw, this._f);
    this._r.crossVectors(this._f, up).normalize();
    this._f.crossVectors(up, this._r).normalize();
    this._b.copy(this._f).negate();
    this._m.makeBasis(this._r, up, this._b);
    this.root.position.copy(sk.pos);
    if (!bail) {
      this.root.quaternion.setFromRotationMatrix(this._m);
      this.root.rotateZ(-lean * 0.17 - wob * 0.05);
    }

    // ---------------- board transform ----------------
    const grabName = sk.grab ? sk.grab.name : null;
    this.grabAmt = damp(this.grabAmt, (air && grabName) ? 1 : 0, 16, dt);
    const grab = this.grabAmt;
    let pitch = 0, boardY = 0, flipAmt = 0, roll = 0, byaw = 0;
    if (air) {
      boardY = 0.085 + 0.34 * grab;
      pitch = -0.05 + clamp(-sk.vel.y * 0.018, -0.22, 0.18) - grab * 0.12;
    } else if (manual) {
      pitch = (sk.manual && sk.manual.nose ? -1 : 1) * 0.44 + bal * 0.09;
    } else if (grind && sk.grind) {
      const ty = sk.grind.type;
      pitch = ty.indexOf('5-0') >= 0 ? 0.32 : ty.indexOf('Nosegrind') >= 0 ? -0.32 : 0;
    }
    if (!air) boardY += 0.205 * Math.abs(Math.sin(pitch));
    if (sk.flip) {
      const f = sk.flip, e = clamp(f.t / f.dur, 0, 1);
      flipAmt = Math.sin(e * Math.PI);
      roll = -f.flipDir * TAU * e;
      const turns = f.kind === 'treflip' ? TAU : (f.kind === 'shoveit' || f.kind === 'varial') ? Math.PI : 0;
      byaw = f.shoveDir * turns * e;
    }
    this.bPitch = damp(this.bPitch, pitch, 17, dt);
    this.bY = damp(this.bY, boardY, 15, dt);
    this.board.rotation.set(this.bPitch, byaw, roll, 'YXZ');
    this.board.position.y = this.bY - 0.13 * flipAmt;      // board drops away under the feet mid-flip

    // ---------------- feet ----------------
    const ANK = 0.185;                                     // ankle height above the deck top
    let ffx = -0.025, ffz = -0.205, ffYaw = -0.92, ffUp = ANK;
    let bfx = 0.005, bfz = 0.245, bfYaw = -1.45, bfUp = ANK;
    if (air) { ffz = -0.21 - grab * 0.02; bfz = 0.26; }
    if (grind) { ffz = -0.19; bfz = 0.235; }
    if (sk.flip) { ffx -= 0.05 * flipAmt; ffz -= 0.06 * flipAmt; ffUp += 0.14 * flipAmt; bfUp += 0.12 * flipAmt; bfx += 0.03 * flipAmt; }
    // front foot turns toward the nose while pushing
    ffYaw = lerp(ffYaw, -0.34, Math.max(push, pedal * 0.8, brake * 0.5));
    this._onBoard(this._v2, ffx, ffz, ffUp);
    let fx = this._v2.x, fy = this._v2.y, fz = this._v2.z;
    this._onBoard(this._v2, bfx, bfz, bfUp);
    let bx = this._v2.x, by = this._v2.y, bz = this._v2.z;

    // push: back foot steps off, sweeps the ground, comes back
    if (push > 0) {
      const ph = 1 - push;                                  // 0 → 1 over ~0.45 s
      if (ph < 0.26) { const k = ph / 0.26; bx = lerp(bx, 0.25, k); by = lerp(by, 0.10 + 0.06 * (1 - k), k); bz = lerp(bz, -0.02, k); }
      else if (ph < 0.62) { const k = (ph - 0.26) / 0.36; bx = 0.26; by = 0.072; bz = lerp(-0.02, 0.42, k); }
      else { const k = (ph - 0.62) / 0.38; const arc = Math.sin(k * Math.PI); bx = lerp(0.26, this._v2.x, k); by = lerp(0.072, by, k) + arc * 0.16; bz = lerp(0.42, bz, k); }
      bfYaw = lerp(-1.42, -0.42, clamp(ph * 2.2, 0, 1) * clamp((1 - ph) * 3, 0, 1));
    }
    // brake: back foot drags off the tail
    if (brake > 0.02) {
      bx = lerp(bx, 0.14, brake); by = lerp(by, 0.075, brake); bz = lerp(bz, 0.46, brake);
      bfYaw = lerp(bfYaw, -0.3, brake);
    }
    // bail: legs splay out behind the tumbling body
    if (bail) {
      fx = lerp(fx, -0.24, lay); fy = lerp(fy, 0.14, lay); fz = lerp(fz, 0.34 + 0.1 * Math.sin(t * 9), lay);
      bx = lerp(bx, 0.26, lay); by = lerp(by, 0.13, lay); bz = lerp(bz, 0.40, lay);
    }
    const fRate = sk.flip ? 34 : 20;
    this.footF.x = damp(this.footF.x, fx, fRate, dt); this.footF.y = damp(this.footF.y, fy, fRate, dt); this.footF.z = damp(this.footF.z, fz, fRate, dt);
    this.footB.x = damp(this.footB.x, bx, 26, dt); this.footB.y = damp(this.footB.y, by, 26, dt); this.footB.z = damp(this.footB.z, bz, 26, dt);
    this.fYaw = damp(this.fYaw, ffYaw, 14, dt); this.bYaw = damp(this.bYaw, bfYaw, 14, dt);

    // ---------------- pelvis + spine ----------------
    let pelY = 0.825, pelX = -0.05, pelZ = 0.0;
    if (ride) { pelY = 0.825 - crouch * 0.23 - land * 0.17 - Math.sin(clamp(1 - push, 0, 1) * Math.PI) * 0.07 * (push > 0 ? 1 : 0) - brake * 0.07 - idle * 0.02 * breath; }
    if (air) { pelY = 0.72 - grab * 0.20 - flipAmt * 0.02; pelZ = -0.02; }
    if (grind) { pelY = 0.70; }
    if (manual) { pelY = 0.775 + this.bPitch * 0.06; pelZ = (sk.manual && sk.manual.nose ? 0.05 : -0.05); }
    if (bail) { pelY = 0.88; pelX = -0.02; }
    pelX += lean * 0.05 + wob * 0.03;
    if (grind) pelX -= bal * 0.05;
    this.pelvis.x = damp(this.pelvis.x, pelX, 12, dt);
    this.pelvis.y = damp(this.pelvis.y, pelY, bail ? 8 : 14, dt);
    this.pelvis.z = damp(this.pelvis.z, pelZ, 12, dt);
    const px = this.pelvis.x, py = this.pelvis.y, pz = this.pelvis.z;

    let sPitch = 0.10 + crouch * 0.42 + land * 0.25, sYaw = -1.15, sRoll = 0;
    if (air) { sPitch = 0.22 + grab * 0.30; sRoll = 0; }
    if (grind) { sPitch = 0.30; sRoll = bal * 0.34; sYaw = -1.05; }
    if (manual) { sPitch = 0.06; sRoll = -bal * 0.30; }
    if (ride) {
      // pedalling opens the hips and shoulders toward travel (a person turns to push);
      // each stroke adds a little extra rotation on top of the sustained stance
      sYaw = -1.15 + lean * 0.26 + pedal * 0.52 + push * 0.12 - fakie * 0.45;
      sRoll = lean * 0.13 + wob * 0.10;
      sPitch += push * 0.18 + brake * 0.12 + pedal * 0.06 + idle * (breath * 0.05 - 0.02);
    }
    if (grabName === 'Indy') { sRoll += 0.34 * grab; sYaw += 0.20 * grab; }
    else if (grabName === 'Melon') { sRoll -= 0.30 * grab; sYaw -= 0.16 * grab; }
    else if (grabName === 'Nosegrab') { sPitch += 0.34 * grab; sYaw -= 0.40 * grab; }
    if (bail) { sPitch = -0.35; sRoll = 0; sYaw = -1.3; }
    this.spinePitch = damp(this.spinePitch, sPitch, 12, dt);
    this.spineYaw = damp(this.spineYaw, sYaw, 10, dt);
    this.spineRoll = damp(this.spineRoll, sRoll, 12, dt);
    this.spine.position.set(px, py, pz);
    // rotation.x > 0 tips an upright torso backwards, so authored "lean forward" is negated
    this.spine.rotation.set(-this.spinePitch, this.spineYaw, this.spineRoll, 'YXZ');

    // head: looks over the front shoulder, glances around when idle
    let hYaw = 0.52 + lean * 0.16 - this.pedal * 0.34, hPitch = 0.05 + crouch * 0.14;
    hYaw = lerp(hYaw, -0.45, this.fakie);                 // fakie: watch where you're going
    if (air) { hYaw = 0.60; hPitch = 0.14 + grab * 0.2; }
    if (grind) { hYaw = 0.62; hPitch = 0.05; }
    if (idle > 0.05) { hYaw += idle * Math.sin(t * 0.6) * 0.55; hPitch += idle * Math.sin(t * 0.43 + 1) * 0.12; }
    if (bail) { hYaw = 0.2; hPitch = -0.35; }
    this.headYaw = damp(this.headYaw, hYaw, 8, dt); this.headPitch = damp(this.headPitch, hPitch, 8, dt);
    this.head.rotation.set(-this.headPitch, this.headYaw, 0, 'YXZ');

    // ---------------- legs (hips ride with the pelvis) ----------------
    this.legF.position.set(px - 0.026, py + 0.02, pz - 0.09);   // hips sit across the board
    this.legB.position.set(px + 0.026, py + 0.02, pz + 0.09);
    const kneeYaw = bail ? -1.0 : clamp(this.spineYaw, -1.4, -0.8);
    this._ik(this.legF, this.footF.x, this.footF.y, this.footF.z, kneeYaw + 0.14, -this.bPitch * (bail ? 0 : 1), this.fYaw);
    this._ik(this.legB, this.footB.x, this.footB.y, this.footB.z, kneeYaw - 0.14, -this.bPitch * (bail ? 0 : 1), this.bYaw);

    // ---------------- arms ----------------
    // Hand targets are authored in body axes: f = forward (the way the chest points),
    // u = up from the pelvis, r = the rider's right (+) / left (−).
    const sy = this.spineYaw, Fx = -Math.sin(sy), Fz = -Math.cos(sy), Rx = Math.cos(sy), Rz = -Math.sin(sy);
    const sw = Math.sin(t * 2.2) * 0.03;
    let lf = 0.13, lu = -0.02 + sw, lr = -0.33;            // left = front hand
    let rf = 0.09, ru = -0.05 - sw, rr = 0.33;
    if (air) {
      lf = 0.04; lu = 0.42; lr = -0.78;
      rf = 0.12; ru = 0.46; rr = 0.76;
    } else if (grind) {
      lf = 0.02; lu = 0.44 + bal * 0.22; lr = -0.82;
      rf = 0.06; ru = 0.46 - bal * 0.22; rr = 0.80;
    } else if (manual) {
      lf = 0.04; lu = 0.32 + bal * 0.28; lr = -0.74;
      rf = 0.06; ru = 0.34 - bal * 0.28; rr = 0.72;
    } else if (ride) {
      const pk = push > 0 ? Math.sin((1 - push) * Math.PI) : 0;
      lf += 0.26 * pk; lu += 0.20 * pk; lr += 0.05 * pk;   // front arm swings forward
      rf -= 0.22 * pk; ru += 0.06 * pk;
      lf += pedal * 0.10; lr -= pedal * 0.06; rf -= pedal * 0.08; // arms settle out for balance mid-push
      lf -= crouch * 0.34; lu += crouch * 0.10; rf -= crouch * 0.40; ru += crouch * 0.14;  // charging: arms back
      lu += wob * 0.22; ru -= wob * 0.22; lr -= wob * 0.10; rr += wob * 0.10;
      lu += idle * breath * 0.02;
    }
    if (bail) {
      lf = lerp(lf, 0.34, lay); lu = lerp(lu, 0.30, lay); lr = lerp(lr, -0.52, lay);
      rf = lerp(rf, 0.30, lay); ru = lerp(ru, 0.26, lay); rr = lerp(rr, 0.54, lay);
    }
    let lhx = px + Fx * lf + Rx * lr, lhy = py + lu, lhz = pz + Fz * lf + Rz * lr;
    let rhx = px + Fx * rf + Rx * rr, rhy = py + ru, rhz = pz + Fz * rf + Rz * rr;
    // grabs override one hand: reach straight to the deck edge (board space)
    if (grab > 0.01 && grabName) {
      const dy = this.bY + 0.11;
      if (grabName === 'Indy') { rhx = lerp(rhx, 0.15, grab); rhy = lerp(rhy, dy, grab); rhz = lerp(rhz, 0.03, grab); }
      else if (grabName === 'Melon') { lhx = lerp(lhx, -0.15, grab); lhy = lerp(lhy, dy, grab); lhz = lerp(lhz, -0.06, grab); }
      else { lhx = lerp(lhx, -0.02, grab); lhy = lerp(lhy, dy + 0.05, grab); lhz = lerp(lhz, -0.34, grab); }
    }
    const hRate = grab > 0.01 ? 24 : 16;
    this.handL.x = damp(this.handL.x, lhx, hRate, dt); this.handL.y = damp(this.handL.y, lhy, hRate, dt); this.handL.z = damp(this.handL.z, lhz, hRate, dt);
    this.handR.x = damp(this.handR.x, rhx, hRate, dt); this.handR.y = damp(this.handR.y, rhy, hRate, dt); this.handR.z = damp(this.handR.z, rhz, hRate, dt);
    // rig space → spine space
    this._qi.copy(this.spine.quaternion).invert();
    this._v2.copy(this.handL).sub(this.spine.position).applyQuaternion(this._qi);
    this._ik(this.armL, this._v2.x, this._v2.y, this._v2.z, Math.PI - 0.30, 0.2, 0);
    this._v2.copy(this.handR).sub(this.spine.position).applyQuaternion(this._qi);
    this._ik(this.armR, this._v2.x, this._v2.y, this._v2.z, Math.PI + 0.30, 0.2, 0);

    // ---------------- bail: tumble the rig, throw the board ----------------
    if (bail) {
      const spin = clamp(sk.bail.spin, -3, 3);
      this.rig.rotation.set(-1.42 * lay, spin * 0.22 * lay, 0.30 * Math.sign(spin || 1) * lay, 'YXZ');
      this.rig.position.set(0, 0.17 * lay, -0.06 * lay);
      // loose board (world space), bounces on whatever is under it
      this.bbv.y -= 17 * dt;
      this.bb.addScaledVector(this.bbv, dt);
      const gy = sk.cw.groundAt(this.bb.x, this.bb.z, this.bb.y + 0.6, 0.8, this._g).y;
      if (this.bb.y < gy + 0.04) {
        this.bb.y = gy + 0.04;
        if (this.bbv.y < 0) this.bbv.y = -this.bbv.y * 0.32;
        this.bbv.x *= 0.82; this.bbv.z *= 0.82; this.bbSpin *= 0.86; this.bbRoll *= 0.5;
        const s2 = Math.hypot(this.bbv.x, this.bbv.z);
        if (s2 > 0.001) { const ns = Math.max(0, s2 - 5 * dt); this.bbv.x *= ns / s2; this.bbv.z *= ns / s2; }
      }
      this._qi.copy(this.root.quaternion).invert();
      this._v.copy(this.bb).sub(this.root.position).applyQuaternion(this._qi);
      this.boardPivot.position.copy(this._v);
      this.boardPivot.rotation.y += this.bbSpin * dt;
      this.boardPivot.rotation.z = damp(this.boardPivot.rotation.z, this.bbRoll > 0 ? 0.4 : -0.4, 3, dt);
      this.boardPivot.rotation.x = damp(this.boardPivot.rotation.x, 0, 4, dt);
    } else {
      this.rig.rotation.set(0, 0, 0); this.rig.position.set(0, 0, 0);
      if (this.snapT > 0) {                                 // board slides back under the feet
        const k = 1 - this.snapT / 0.15;
        this.boardPivot.position.lerpVectors(this.snapFrom, ZERO, k);
        this.boardPivot.rotation.set(this.snapRot.x * (1 - k), this.snapRot.y * (1 - k), this.snapRot.z * (1 - k));
      } else if (this.boardPivot.position.lengthSq() > 0) {
        this.boardPivot.position.set(0, 0, 0); this.boardPivot.rotation.set(0, 0, 0);
      }
    }

    // ---------------- blob shadow ----------------
    const g = sk.cw.groundAt(sk.pos.x, sk.pos.z, sk.pos.y, 0.05, this._g);
    this.shadowBlob.position.set(sk.pos.x, g.y + 0.02, sk.pos.z);
    const h = sk.pos.y - g.y;
    this.shadowBlob.material.opacity = clamp(0.3 - h * 0.06, 0.05, 0.3);
    this.shadowBlob.scale.setScalar(clamp(1 + h * 0.07, 1, 1.7));
  }
}
