// Headless playtest hooks (window.__*), used by scripts/shot.mjs. Kept out of main.js so the
// game loop stays readable. Nothing here runs unless a test calls it.
import { fwd, yawOf, angleDiff, clamp } from './util.js';

export function installDev(api) {
  const { world, skater, follow, camera, renderer, scene, input, step } = api;

  const render = () => renderer.render(scene, camera);
  // Space and the trick keys are edge-triggered inside Input's own listeners, so a test that
  // just stuffs them into input.keys would do nothing. Route them the same way a real key does.
  const EDGE = { KeyJ: 'flipA', KeyK: 'flipB', KeyL: 'shove', KeyR: 'reset', KeyC: 'cam', KeyM: 'map', KeyP: 'pause' };
  const press = (k) => { if (k === 'Space') input._ollieDown(); else if (EDGE[k]) input._edges[EDGE[k]] = true; else input.keys.add(k); };
  const release = (k) => { if (k === 'Space') input._ollieUp(); else if (!EDGE[k]) input.keys.delete(k); };
  const sim = (seconds, holdKeys = []) => {
    for (const k of holdKeys) press(k);
    const n = Math.max(1, Math.round(seconds * 60));
    for (let i = 0; i < n; i++) step(1 / 60, performance.now());
    for (const k of holdKeys) release(k);
    if (holdKeys.length) step(1 / 60, performance.now());   // let the release edge be consumed
  };

  window.__sim = sim;                     // NB: does not render — the rAF loop is still live
  window.__render = render;
  window.__press = press; window.__release = release;

  // teleport onto the ground at (x,z), facing yaw, already rolling at `speed`
  window.__tp = (x, z, yaw = 0, speed = 0) => {
    const g = world.collide.groundAt(x, z, 200, 300);
    skater.respawn(x, g.y + 0.02, z, yaw);
    const f = fwd(yaw); skater.vel.set(f.x * speed, 0, f.z * speed);
    skater.groundKind = g.kind; skater.normal.set(g.nx, g.ny, g.nz);
    follow.reset(skater); follow.update(1 / 60, skater);
    api.setLoc(world.locationName(x, z));
    return { y: +g.y.toFixed(2), kind: g.kind };
  };

  // drop the skater into the air at a chosen point/velocity — a precise unit test for the
  // grind snap that doesn't depend on getting an ollie's timing right.
  window.__air = (x, y, z, yaw, vx, vy, vz) => {
    skater.respawn(x, y, z, yaw);
    skater.state = 'air'; skater.onGround = false; skater.airTime = 0; skater.airPeak = y;
    skater.vel.set(vx, vy, vz); skater.lastEdge = null; skater.grindCooldown = 0;
    follow.reset(skater);
  };

  // autopilot: steer toward each waypoint in turn while pushing. Returns a trace:
  // bails/bumps with positions, plus min/max/avg speed and any place we got stuck.
  window.__drive = (waypoints, seconds = 40, opts = {}) => {
    const wp = waypoints.map(p => ({ x: p[0], z: p[1] })); let wi = 0;
    const log = []; const samples = [];
    let stuckT = 0, lastP = { x: skater.pos.x, z: skater.pos.z }, worstStuck = null;
    api.setTap((ev) => { if (ev.type === 'bail' || ev.type === 'bump' || ev.type === 'spotFirst' || ev.type === 'grindStart') log.push({ [ev.type]: ev.why || ev.name || ev.type, x: +skater.pos.x.toFixed(1), z: +skater.pos.z.toFixed(1), y: +skater.pos.y.toFixed(2), sp: +skater.speed.toFixed(1) }); });
    api.setAutopilot((inp) => {
      while (wi < wp.length - 1 && Math.hypot(wp[wi].x - skater.pos.x, wp[wi].z - skater.pos.z) < (opts.reach || 6)) wi++;
      const t = wp[wi]; const want = yawOf(t.x - skater.pos.x, t.z - skater.pos.z);
      const d = angleDiff(want, skater.yaw);
      inp.steer = clamp(-d * (opts.gain || 1.6), -1, 1);
      inp.throttle = opts.brake ? -1 : 1;
    });
    const n = Math.round(seconds * 60);
    for (let i = 0; i < n; i++) {
      step(1 / 60, performance.now());
      const moved = Math.hypot(skater.pos.x - lastP.x, skater.pos.z - lastP.z);
      lastP = { x: skater.pos.x, z: skater.pos.z };
      if (moved < 0.004 && skater.state !== 'bail') { stuckT += 1 / 60; if (stuckT > 1.2 && !worstStuck) worstStuck = { x: +skater.pos.x.toFixed(2), z: +skater.pos.z.toFixed(2), y: +skater.pos.y.toFixed(2), ground: skater.groundKind }; } else stuckT = 0;
      if (i % 30 === 0) samples.push([+skater.pos.x.toFixed(1), +skater.pos.z.toFixed(1), +skater.pos.y.toFixed(2), +skater.speed.toFixed(1), skater.state]);
    }
    api.setAutopilot(null); api.setTap(null);
    const sp = samples.map(s => s[3]);
    return { end: [+skater.pos.x.toFixed(1), +skater.pos.z.toFixed(1)], reachedWp: wi, log, stuck: worstStuck, speed: { min: Math.min(...sp), max: Math.max(...sp), avg: +(sp.reduce((a, b) => a + b, 0) / sp.length).toFixed(1) }, samples };
  };

  // everything the physics world holds near (x,z)
  window.__near = (x, z, r = 3) => {
    const A = world.collide.all, out = [];
    const near = (ax, az, bx, bz) => { const l2 = (bx - ax) ** 2 + (bz - az) ** 2; const t = l2 < 1e-9 ? 0 : clamp(((x - ax) * (bx - ax) + (z - az) * (bz - az)) / l2, 0, 1); return Math.hypot(ax + (bx - ax) * t - x, az + (bz - az) * t - z); };
    const f2 = (v) => +v.toFixed(2);
    for (const s of A.surfaces) if (Math.hypot(s.x - x, s.z - z) < r + Math.hypot(s.w, s.d) / 2) out.push({ t: 'surf', kind: s.kind, name: s.name, x: f2(s.x), z: f2(s.z), w: f2(s.w), d: f2(s.d), top: f2(s.top), bot: f2(s.bottom) });
    for (const w of A.walls) { const d = near(w.ax, w.az, w.bx, w.bz); if (d < r) out.push({ t: 'wall', name: w.name, d: f2(d), top: w.top > 1e8 ? 'inf' : f2(w.top), a: [f2(w.ax), f2(w.az)], b: [f2(w.bx), f2(w.bz)] }); }
    for (const rr of A.ramps) if (near(rr.ax, rr.az, rr.bx, rr.bz) < r + rr.w / 2) out.push({ t: 'ramp', kind: rr.kind, name: rr.name, a: [f2(rr.ax), f2(rr.az)], b: [f2(rr.bx), f2(rr.bz)], w: f2(rr.w), lo: f2(rr.yLow), hi: f2(rr.yHigh) });
    for (const b of A.blockers) if (Math.hypot(b.x - x, b.z - z) < r + b.r) out.push({ t: 'blk', name: b.name, x: f2(b.x), z: f2(b.z), r: b.r, top: b.top > 1e8 ? 'inf' : f2(b.top) });
    for (const e of A.edges) { const d = near(e.ax, e.az, e.bx, e.bz); if (d < r) out.push({ t: 'edge', kind: e.kind, name: e.name, d: f2(d), y: f2(e.ay) }); }
    return out;
  };

  // triangle + draw-call budget, grouped by mesh name (builders name their meshes 'city:…')
  window.__meshes = () => {
    const g = new Map(); let tot = 0;
    scene.traverse((o) => {
      if (!o.isMesh && !o.isInstancedMesh) return;
      const idx = o.geometry.index, pos = o.geometry.attributes.position;
      let tris = (idx ? idx.count : pos ? pos.count : 0) / 3;
      if (o.isInstancedMesh) tris *= o.count;
      const k = o.name || (o.material && o.material.name) || '(unnamed)';
      const e = g.get(k) || { tris: 0, n: 0 }; e.tris += tris; e.n++; g.set(k, e); tot += tris;
    });
    return { total: Math.round(tot), byName: [...g].map(([k, v]) => [k, Math.round(v.tris), v.n]).sort((a, b) => b[1] - a[1]).slice(0, 40) };
  };
  window.__topdown = (x, z, h = 80) => {
    api.setRunning(false);
    camera.position.set(x, skater.pos.y + h, z + 0.01); camera.up.set(0, 0, -1);
    camera.lookAt(x, skater.pos.y, z); camera.up.set(0, 1, 0); render();
  };
  // free camera: put the eye at (x,y,z) looking at (tx,ty,tz)
  window.__look = (x, y, z, tx, ty, tz) => {
    api.setRunning(false);
    camera.position.set(x, y, z); camera.up.set(0, 1, 0); camera.fov = 55; camera.updateProjectionMatrix();
    camera.lookAt(tx, ty, tz); render();
  };
  window.__ground = (x, z, yHint = 200) => { const g = world.collide.groundAt(x, z, yHint, 300); return { y: +g.y.toFixed(3), kind: g.kind, name: g.obj && g.obj.name, slope: +(1 - g.ny).toFixed(3) }; };
  window.__dbg = () => ({
    state: skater.state, pos: [+skater.pos.x.toFixed(2), +skater.pos.y.toFixed(2), +skater.pos.z.toFixed(2)],
    vel: [+skater.vel.x.toFixed(2), +skater.vel.y.toFixed(2), +skater.vel.z.toFixed(2)], yaw: +skater.yaw.toFixed(2),
    score: skater.score, combo: skater.combo.map(t => t.name), loc: api.getLoc(), ground: skater.groundKind,
    why: skater.bail ? skater.bail.why : null,
    drawCalls: renderer.info.render.calls, tris: renderer.info.render.triangles,
  });
}
