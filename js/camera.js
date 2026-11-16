// Third-person follow camera: sits behind the direction of travel (falls back to board
// heading when slow), looks ahead, kicks FOV with speed, shakes on bails, stays above ground.
import * as THREE from '../vendor/three.module.min.js';
import { CFG } from './config.js';
import { clamp, damp, dampAngle, fwd, yawOf, angleDiff } from './util.js';

const _f = new THREE.Vector3(), _t = new THREE.Vector3();
export class FollowCamera {
  constructor(camera, collide) {
    this.cam = camera; this.cw = collide;
    this.yaw = 0; this.pos = new THREE.Vector3(); this.look = new THREE.Vector3(); this.shake = 0; this.mode = 0; // 0 follow, 1 close, 2 high
    this.fov = CFG.camFov; this.first = true; this.userYaw = 0;
  }
  reset(skater) { this.first = true; this.yaw = skater.yaw; }
  update(dt, sk) {
    const sp = Math.hypot(sk.vel.x, sk.vel.z);
    // desired yaw: direction of travel if moving, else board heading (board symmetric → pick the half-turn closest)
    let target = this.yaw;
    if (sp > 1.2) target = yawOf(sk.vel.x, sk.vel.z);
    else if (sk.state !== 'air' && sk.state !== 'grind') { const y = sk.yaw; const d = Math.abs(angleDiff(y, this.yaw)); target = d < Math.PI / 2 ? y : y + Math.PI; }
    if (sk.state === 'grind') target = yawOf(sk.vel.x, sk.vel.z);
    const rate = sk.state === 'air' ? 1.8 : sk.state === 'bail' ? 0.8 : clamp(2 + sp * 0.35, 2, 6);
    this.yaw = this.first ? target : dampAngle(this.yaw, target, rate, dt);
    // PORTRAIT (a phone held upright) frames tighter and higher: the skater reads ~100 px tall
    // at 390x844 with his feet above the thumbs, instead of a 50 px hat at the bottom.
    const portrait = this.cam.aspect < 1;
    const baseDist = portrait ? CFG.camDistPortrait : CFG.camDist;
    const dist = (this.mode === 1 ? 3.6 : this.mode === 2 ? 7.5 : baseDist) + clamp(sp - 6, 0, 14) * (portrait ? 0.14 : 0.22);
    const height = (this.mode === 2 ? 4.2 : portrait ? CFG.camHeightPortrait : CFG.camHeight) + (sk.state === 'air' ? 0.3 : 0);
    fwd(this.yaw, _f);
    let px = sk.pos.x - _f.x * dist, pz = sk.pos.z - _f.z * dist;
    // LINE OF SIGHT (2026-11-16 final): when a wall sits between the skater and the camera
    // point, the boom first RISES (up to 6 m) and only then pulls in, never closer than 3 m.
    // Pulling straight in used to put the lens a metre behind his jacket in alleys (the
    // skater 750+ px tall); from up high and close the camera looks down past the wall at him.
    const hitT = this.cw.raycastWalls(sk.pos.x, sk.pos.z, px, pz, sk.pos.y + 1.2);
    const MIN = Math.min(3.0, dist);
    let wantD = dist, block = 0;
    if (hitT < 1) { const free = dist * hitT - 0.4; wantD = Math.max(MIN, free); block = clamp((dist - free) / Math.max(0.5, dist - 1.0), 0, 1); }
    this.losDist = damp(this.losDist ?? dist, wantD, wantD < (this.losDist ?? dist) ? 10 : 3, dt);
    this.lift = damp(this.lift ?? 0, block, block > (this.lift ?? 0) ? 8 : 2, dt);
    if (this.first) { this.losDist = wantD; this.lift = block; }
    px = sk.pos.x - _f.x * this.losDist; pz = sk.pos.z - _f.z * this.losDist;
    // keep the camera above terrain/surfaces
    const gy = this.cw.groundAt(px, pz, sk.pos.y + 3, 3).y;
    const hh = height + (Math.max(height, 6.0) - height) * this.lift;
    let py = Math.max(sk.pos.y + hh + 0.3, gy + 1.0);
    // during big air, don't chase every bounce upward — follow y softly
    const k = this.first ? 1 : 1 - Math.exp(-(sk.state === 'air' ? 4 : 9) * dt);
    this.pos.x += (px - this.pos.x) * (this.first ? 1 : 1 - Math.exp(-8 * dt));
    this.pos.z += (pz - this.pos.z) * (this.first ? 1 : 1 - Math.exp(-8 * dt));
    this.pos.y += (py - this.pos.y) * k;
    // STANDING STILL (round 3): tilt up and look further down the street, so the first light
    // and the road to it sit in view below the HUD instead of the bricks under his feet
    const still = sp < 1.5 && sk.state === 'ride' ? 1 : 0;
    this.idle = this.first ? still : damp(this.idle ?? still, still, still ? 1.5 : 3, dt);
    // look target ahead of the skater
    const la = ((portrait ? CFG.camLookAheadPortrait : CFG.camLookAhead) + sp * 0.12 + this.idle * 2.5) * (1 - 0.55 * this.lift);   // lifted: look nearer, keep him mid-screen
    const lx = sk.pos.x + _f.x * la, ly = sk.pos.y + (portrait ? CFG.camLookYPortrait : 0.9) + this.idle * (1 - this.lift) * 0.5 + (sk.state === 'air' ? 0.4 : 0), lz = sk.pos.z + _f.z * la;
    this.look.x += (lx - this.look.x) * (this.first ? 1 : 1 - Math.exp(-10 * dt));
    this.look.y += (ly - this.look.y) * (this.first ? 1 : 1 - Math.exp(-6 * dt));
    this.look.z += (lz - this.look.z) * (this.first ? 1 : 1 - Math.exp(-10 * dt));
    // shake
    if (this.shake > 0) { this.shake = Math.max(0, this.shake - dt * 2.5); const s = this.shake * 0.25; this.cam.position.set(this.pos.x + (Math.random() - 0.5) * s, this.pos.y + (Math.random() - 0.5) * s, this.pos.z + (Math.random() - 0.5) * s); }
    else this.cam.position.copy(this.pos);
    this.cam.lookAt(this.look);
    // subtle roll with lean
    this.cam.rotateZ(-sk.lean * 0.04);
    const fov = CFG.camFov + clamp(sp - 5, 0, 18) * 1.2; this.fov = damp(this.fov, fov, 4, dt);
    if (Math.abs(this.cam.fov - this.fov) > 0.05) { this.cam.fov = this.fov; this.cam.updateProjectionMatrix(); }
    this.first = false;
  }
  kick(amount = 1) { this.shake = Math.max(this.shake, amount); }
}
