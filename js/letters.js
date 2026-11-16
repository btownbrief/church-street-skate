// B-T-O-W-N: five floating letters on one hand-authored route through downtown. The route
// rotates weekly (ISO week seed), and what you have collected is remembered per week, so
// every Monday there is a fresh reason to go somewhere you don't normally skate.
//
// TODAY'S LINE (2026-11-16): during a run the same five letters are re-laid along the day's
// line and reset every run. They are the breadcrumbs — a tall soft light column stands on the
// next one so you can see where to go from 150 m away — and each is worth +500 and +3 s
// (main.js owns the clock). Free skate gets the weekly route back exactly as before.
//
// Renders as one small group of crossed-quad meshes — each letter is two quads at right
// angles so it never vanishes edge-on, 8 triangles apiece, one draw call each, and only
// the ones within 90 m are visible so the draw-call budget barely notices.
import * as THREE from '../vendor/three.module.min.js';
import { storeGet, storeSet } from './util.js';

export const LETTERS = ['B', 'T', 'O', 'W', 'N'];
const REACH = 1.2;          // metres — collect radius, in any state
const SHOW = 90;            // metres — draw distance
const HOVER = 1.4;          // metres above the ground under the letter
const RUN_REACH = 3.5;      // a run is timed: be generous about what counts as "got it"
const PASS = 15;            // metres past a letter (along the line) before the light moves on
// GOLD LETTERS: once the day's five are done the light never goes out. Round 3: the gold
// letters are dealt from the line's own hand-made run of skate features (daily.js `gold`),
// nearest one ahead first, in order, and the chairlift takes you back to the top at the
// bottom. Walking the OpenStreetMap street graph is now only the fallback for a player who
// wandered far off the run. Each set gives back less time: that, and the clock, is the ramp.
export const goldPts = () => 750;                          // flat: the light is the way, tricks are the score
export const goldSecs = (set) => (set <= 1 ? 2 : 1);      // set 1: +2 s a letter, then +1 s
export const SET_PTS = 2500, GOLD_SET_PTS = 1500;
const goldGap = (set) => 55 + Math.min(4, set) * 8;        // fallback walk: each set spaces them further apart
const ROAD_KINDS = new Set(['pedestrian', 'primary', 'secondary', 'tertiary', 'residential', 'unclassified', 'living_street']);

// Four routes. Every coordinate below was checked with __ground / __near: each sits on
// skateable ground (brick, sidewalk, asphalt or park path) and clear of building walls.
export const ROUTES = [
  { name: 'The mall run', pts: [[-16.5, -368], [-13.5, -280], [-11, -190], [-6.5, -100], [-1.5, -20]] },
  { name: 'College hill', pts: [[-30, 3], [-120, 5], [-220, 7], [-330, 8], [-430, -4]] },
  { name: 'City Hall to Main', pts: [[-70, 64], [-80, 40], [-46, 90], [-24, 112], [-36, 132]] },
  { name: 'The waterfront', pts: [[-462, -5], [-520, -300], [-537, -408], [-552, -410], [-545, -444]] },
];

// ISO-8601 week number: weeks start Monday, week 1 contains the first Thursday.
export function isoWeek(d = new Date()) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7));
  const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return { year: t.getUTCFullYear(), week: Math.ceil(((t - y0) / 86400000 + 1) / 7) };
}
export function routeIndexFor(d = new Date()) { const w = isoWeek(d); return ((w.year * 53 + w.week) % ROUTES.length + ROUTES.length) % ROUTES.length; }
export function weekKey(d = new Date()) { const w = isoWeek(d); return `css-letters-${w.year}-W${w.week}`; }

function letterTexture(ch, gold = false) {
  const c = document.createElement('canvas'); c.width = 128; c.height = 128;
  const g = c.getContext('2d');
  g.clearRect(0, 0, 128, 128);
  g.font = 'bold 104px Helvetica, Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineWidth = 12; g.strokeStyle = gold ? '#4a2300' : '#1c2a1f'; g.strokeText(ch, 64, 66);
  if (gold) { const gr = g.createLinearGradient(0, 18, 0, 112); gr.addColorStop(0, '#fff3b0'); gr.addColorStop(0.5, '#ffb627'); gr.addColorStop(1, '#e8770e'); g.fillStyle = gr; }
  else g.fillStyle = '#ffd84d';
  g.fillText(ch, 64, 66);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  return tex;
}

// Two quads at right angles, 0.8 m tall, sharing one texture.
function crossedQuad(size) {
  const h = size / 2;
  const pos = [], uv = [];
  const face = (ax, az, bx, bz) => {
    pos.push(ax, -h, az, bx, -h, bz, bx, h, bz, ax, -h, az, bx, h, bz, ax, h, az);
    uv.push(0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1);
  };
  face(-h, 0, h, 0); face(0, -h, 0, h);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return g;
}

// ---- the road graph: OSM street centrelines, merged where they meet ---------------------
function buildGraph(WORLD, play, terrain) {
  const nodes = [], key = new Map(), m = 40;   // never within 40 m of the map edge
  const inside = (x, z) => x > play.minX + m && x < play.maxX - m && z > play.minZ + m && z < play.maxZ - m;
  const nodeAt = (x, z) => {
    const kx = Math.round(x), kz = Math.round(z);
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) { const n = key.get((kx + dx) + ',' + (kz + dz)); if (n != null && Math.hypot(nodes[n].x - x, nodes[n].z - z) < 1.2) return n; }
    const n = nodes.length; nodes.push({ x, z, y: terrain ? terrain.heightAt(x, z) : 0, adj: [] }); key.set(kx + ',' + kz, n); return n;
  };
  for (const r of WORLD.roads || []) {
    if (!ROAD_KINDS.has(r.kind) || !r.pts || r.pts.length < 2) continue;
    let prev = null;
    for (const p of r.pts) {
      if (!inside(p[0], p[1])) { prev = null; continue; }
      const n = nodeAt(p[0], p[1]);
      if (prev != null && prev !== n && !nodes[prev].adj.includes(n)) { nodes[prev].adj.push(n); nodes[n].adj.push(prev); }
      prev = n;
    }
  }
  return nodes;
}

export function buildLetters(ctx) {
  const { scene, collide, updaters } = ctx;
  const routeIdx = routeIndexFor();
  const route = ROUTES[routeIdx];
  const KEY = weekKey();
  let saved = [];
  try { saved = JSON.parse(storeGet(KEY, '[]')); } catch { saved = []; }
  const got = new Set(Array.isArray(saved) ? saved : []);
  const graph = buildGraph(ctx.WORLD || {}, ctx.play || { minX: -1e4, maxX: 1e4, minZ: -1e4, maxZ: 1e4 }, collide.terrain);

  const group = new THREE.Group(); group.name = 'btown-letters'; scene.add(group);
  const geo = crossedQuad(0.8), geoGold = crossedQuad(1.05);
  const items = [];
  for (let i = 0; i < LETTERS.length; i++) {
    const ch = LETTERS[i], p = route.pts[i];
    const y = collide.groundAt(p[0], p[1], 500, 1000).y + HOVER;
    const mat = new THREE.MeshBasicMaterial({ map: letterTexture(ch), transparent: true, side: THREE.DoubleSide, depthWrite: false });
    const m = new THREE.Mesh(geo, mat);
    m.name = 'btown-letter'; m.position.set(p[0], y, p[1]); m.matrixAutoUpdate = true;
    m.visible = false;
    group.add(m);
    items.push({ ch, x: p[0], y, z: p[1], mesh: m });
  }
  for (const it of items) if (got.has(it.ch)) it.mesh.visible = false;
  // the gold letter: one mesh, its texture swapped to the letter it stands for
  const goldTex = LETTERS.map(ch => letterTexture(ch, true));
  const gold = new THREE.Mesh(geoGold, new THREE.MeshBasicMaterial({ map: goldTex[0], transparent: true, side: THREE.DoubleSide, depthWrite: false }));
  gold.name = 'btown-gold'; gold.visible = false; group.add(gold);

  // THE BEACON (round 3: "make the light loud"): one draw call, as before. A camera-facing
  // beam 1.5 m wide — a bright core inside a soft glow, fading out toward the sky — plus a
  // glowing ring on the ground under the letter, sharing one small canvas texture (beam in
  // the top half, ring in the bottom). The ring is round, so turning the whole mesh to face
  // the camera never shows on it.
  const beamTex = (() => {
    const c = document.createElement('canvas'); c.width = 64; c.height = 256; const g = c.getContext('2d');
    for (let y = 0; y < 128; y++) {             // beam: v 0.5..1 (canvas rows 0..127, top = sky end)
      const fadeUp = 0.25 + 0.75 * (y / 128);    // strong at the street, soft up in the sky
      for (let x = 0; x < 64; x++) {
        const u = Math.abs(x - 31.5) / 32, core = Math.exp(-u * u * 60), glow = Math.exp(-u * u * 5) * 0.55;
        const a = Math.min(1, (core + glow)) * fadeUp, w = Math.round(200 + 55 * core);
        g.fillStyle = `rgba(255,${w},${Math.round(120 + 135 * core)},${a.toFixed(3)})`; g.fillRect(x, y, 1, 1);
      }
    }
    const img = g.createImageData(64, 128);  // ring: v 0..0.5 (rows 128..255)
    for (let y = 0; y < 128; y++) for (let x = 0; x < 64; x++) {
      const dx = (x - 31.5) / 32, dy = (y - 63.5) / 64, r = Math.hypot(dx, dy);
      const a = Math.max(0, 1 - Math.abs(r - 0.78) / 0.14) * 0.95 + Math.max(0, 0.35 - r) * 0.5;
      const k = (y * 64 + x) * 4; img.data[k] = 255; img.data[k + 1] = 236; img.data[k + 2] = 150; img.data[k + 3] = Math.round(Math.min(1, a) * 255);
    }
    g.putImageData(img, 0, 128);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  })();
  const beamGeo = (() => {
    const W = 0.75, H = 40, R = 2.3, y0 = 0.06;
    const pos = [-W, 0, 0, W, 0, 0, W, H, 0, -W, 0, 0, W, H, 0, -W, H, 0,
      -R, y0, -R, R, y0, -R, R, y0, R, -R, y0, -R, R, y0, R, -R, y0, R];
    const uv = [0, 0.5, 1, 0.5, 1, 1, 0, 0.5, 1, 1, 0, 1, 0, 0, 1, 0, 1, 0.5, 0, 0, 1, 0.5, 0, 0.5];
    const gg = new THREE.BufferGeometry();
    gg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); gg.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    return gg;
  })();
  const beam = new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({ map: beamTex, color: 0xffe27a, transparent: true, opacity: 0.62, depthWrite: false, fog: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2 }));
  beam.name = 'btown-beacon'; beam.visible = false; beam.renderOrder = 2; beam.frustumCulled = false; group.add(beam);
  const cam = ctx.camera;

  const week = { route: route.name, routeIdx, pts: route.pts };
  const missed = new Set();
  const state = { route: route.name, routeIdx, got, missed, items, total: LETTERS.length, all: LETTERS, key: KEY, run: false, next: null,
    set: 0, gold: null, last: null, lastDir: null, cleanFive: false, goldRun: null, goldIdx: -1, laps: 0,
    // lay the letters along a run's line and start fresh (nothing is persisted in a run)
    setRun(pts, name, start, goldRun) {
      state.run = true; state.route = name || 'run'; got.clear(); missed.clear(); state.set = 0; state.gold = null;
      state.goldRun = goldRun && goldRun.pts && goldRun.pts.length >= 3 ? goldRun : null; state.goldIdx = -1; state.laps = 0;
      items.forEach((it, i) => place(it, pts[i]));
      state.last = start ? { x: start[0], z: start[1] } : { x: pts[0][0], z: pts[0][1] };
      state.lastDir = null; gold.visible = false;
    },
    // back to this week's route and what you had collected on it
    setWeek() {
      state.run = false; state.route = week.route; got.clear(); missed.clear(); state.set = 0; state.gold = null; gold.visible = false;
      let s2 = []; try { s2 = JSON.parse(storeGet(KEY, '[]')); } catch { s2 = []; }
      for (const c of (Array.isArray(s2) ? s2 : [])) got.add(c);
      items.forEach((it, i) => place(it, week.pts[i]));
      beam.visible = false; state.next = null;
    },
    // where "the line" is right now: from the last letter you took to the one the light is on
    segment() { const n = state.next; return n && state.last ? { ax: state.last.x, az: state.last.z, bx: n.x, bz: n.z } : null; },
    // BACK TO LINE: re-lay the gold letter ahead of a respawn point if it is far away
    afterRespawn(x, z, dx, dz) { if (state.gold && Math.hypot(state.gold.x - x, state.gold.z - z) > 95) layFrom(x, z, dx, dz, 150); },
    // the chairlift has put the skater at the top: the run starts again from its first point
    afterLift() { const R = state.goldRun; if (!R) return; state.laps++; state.last = { x: R.top[0], z: R.top[1] }; state.lastDir = { x: -Math.sin(R.top[2]), z: -Math.cos(R.top[2]) }; layIdx(0); },
  };
  function place(it, p) { it.x = p[0]; it.z = p[1]; it.y = collide.groundAt(p[0], p[1], 500, 1000).y + HOVER; it.mesh.position.set(it.x, it.y, it.z); }
  ctx.letters = state;

  // ---- laying a gold letter ---------------------------------------------------------------
  const _ws = [];
  function clearAt(x, z) {
    const ws = collide.walls.query(x - 2, z - 2, x + 2, z + 2, _ws);
    for (const w of ws) { const ex = w.bx - w.ax, ez = w.bz - w.az, l2 = ex * ex + ez * ez; const t = l2 < 1e-9 ? 0 : Math.max(0, Math.min(1, ((x - w.ax) * ex + (z - w.az) * ez) / l2)); if (Math.hypot(w.ax + ex * t - x, w.az + ez * t - z) < 1.6) return false; }
    const bs = collide.blockers.query(x - 2, z - 2, x + 2, z + 2, _ws);
    for (const b of bs) if (!b.soft && Math.hypot(b.x - x, b.z - z) < b.r + 1.2) return false;
    const g = collide.groundAt(x, z, 500, 1000);
    return g.kind !== 'water';
  }
  // Walk the street graph forward from (x,z) along (dx,dz) for about `target` metres. At a
  // junction it mostly goes straight, sometimes turns; after a turn the letter sits ~25 m
  // round the corner so you can see it from the junction. Returns a point and its heading.
  function walk(x, z, dx, dz, target) {
    const dl = Math.hypot(dx, dz) || 1; dx /= dl; dz /= dl;
    let best = null;
    for (let a = 0; a < graph.length; a++) for (const b of graph[a].adj) {
      if (b < a) continue;
      const A = graph[a], B = graph[b], ex = B.x - A.x, ez = B.z - A.z, l2 = ex * ex + ez * ez;
      const t = l2 < 1e-9 ? 0 : Math.max(0, Math.min(1, ((x - A.x) * ex + (z - A.z) * ez) / l2));
      const px = A.x + ex * t, pz = A.z + ez * t, d = Math.hypot(px - x, pz - z);
      // prefer a street that runs the way you are going
      const al = Math.abs(ex * dx + ez * dz) / (Math.sqrt(l2) || 1);
      const sc = d - al * 6;
      if (!best || sc < best.sc) best = { a, b, px, pz, sc };
    }
    if (!best) return null;
    let from = best.a, to = best.b;
    if ((graph[to].x - graph[from].x) * dx + (graph[to].z - graph[from].z) * dz < 0) { from = best.b; to = best.a; }
    let cx = best.px, cz = best.pz, acc = 0, guard = 0;
    while (guard++ < 60) {
      const N = graph[to], sx = N.x - cx, sz = N.z - cz, seg = Math.hypot(sx, sz);
      if (acc + seg >= target) { const k = (target - acc) / (seg || 1); return { x: cx + sx * k, z: cz + sz * k, dx: sx / (seg || 1), dz: sz / (seg || 1) }; }
      acc += seg; cx = N.x; cz = N.z;
      const P = graph[from], hx = (N.x - P.x), hz = (N.z - P.z), hl = Math.hypot(hx, hz) || 1;
      let opts = N.adj.filter(n => n !== from);
      if (!opts.length) { if (acc >= 25) return { x: cx, z: cz, dx: hx / hl, dz: hz / hl }; opts = [from]; }
      let pick = -1, ps = -1e9, pc = 1;
      for (const o of opts) {
        const O = graph[o], ox = O.x - N.x, oz = O.z - N.z, ol = Math.hypot(ox, oz) || 1, c = (ox * hx + oz * hz) / (ol * hl);
        if (c < -0.3 && opts.length > 1) continue;
        // downhill is fun, a long climb is not: lean toward streets that drop, away from climbs
        const slope = (O.y - N.y) / ol;
        const sc = c + Math.random() * 0.9 - Math.max(-0.5, Math.min(0.8, slope * 14));
        if (sc > ps) { ps = sc; pick = o; pc = c; }
      }
      if (pick < 0) pick = opts[0];
      if (pc < 0.82) target = Math.min(target, acc + 25);   // turned a corner: show it soon after
      from = to; to = pick;
    }
    return null;
  }
  function setGold(p) {
    const y = collide.groundAt(p.x, p.z, 500, 1000).y + HOVER;
    const n = got.size;                 // letter index within the gold set
    state.gold = { ch: LETTERS[n % 5], x: p.x, y, z: p.z, dx: p.dx, dz: p.dz, t: 0 };
    gold.material.map = goldTex[n % 5]; gold.position.set(p.x, y, p.z);
  }
  // FALLBACK: walk the street graph forward (only when the skater is far off the line's run)
  function layWalk(x, z, dx, dz) {
    let p = null;
    for (let tries = 0; tries < 6 && !p; tries++) {
      const q = walk(x, z, dx, dz, goldGap(state.set) + Math.random() * 25 - tries * 6);
      // never on top of you or behind you
      const ok = (o) => o && Math.hypot(o.x - x, o.z - z) > 22 && ((o.x - x) * dx + (o.z - z) * dz > 0 || tries > 3);
      if (q && !ok(q)) continue;
      if (q && clearAt(q.x, q.z)) p = q;
      else if (q) {   // nudge along the street a few metres either way
        for (const s of [4, -4, 8, -8]) { const nx = q.x + q.dx * s, nz = q.z + q.dz * s; if (clearAt(nx, nz)) { p = { x: nx, z: nz, dx: q.dx, dz: q.dz }; break; } }
      }
    }
    if (!p) { const l = Math.hypot(dx, dz) || 1; p = { x: x + dx / l * 40, z: z + dz / l * 40, dx: dx / l, dz: dz / l }; }
    state.goldIdx = -1; setGold(p);
  }
  // THE RUN: point i of the line's gold run. Its heading points on to the next one, so
  // "ridden past it" is measured along the way the run goes.
  function layIdx(i) {
    const P = state.goldRun.pts, a = P[i], b = P[(i + 1) % P.length], c = i > 0 ? P[i - 1] : null;
    let dx = b[0] - a[0], dz = b[1] - a[1];
    if (i === P.length - 1 && !state.goldRun.loop && c) { dx = a[0] - c[0]; dz = a[1] - c[1]; }
    const l = Math.hypot(dx, dz) || 1;
    state.goldIdx = i; setGold({ x: a[0], z: a[1], dx: dx / l, dz: dz / l });
  }
  // nearest run point AHEAD of (x,z) going (dx,dz), 25..maxD metres away; -1 if none
  function aheadIdx(x, z, dx, dz, maxD) {
    const R = state.goldRun; if (!R) return -1;
    const dl = Math.hypot(dx, dz) || 1; dx /= dl; dz /= dl;
    let best = -1, bd = 1e9;
    R.pts.forEach((p, i) => { const ox = p[0] - x, oz = p[1] - z, d = Math.hypot(ox, oz); if (d < 15 || d > maxD) return; if ((ox * dx + oz * dz) / d < 0.35) return; if (d < bd) { bd = d; best = i; } });
    return best;
  }
  // lay the next gold letter from wherever the skater is: the run if any of it is ahead,
  // otherwise (for a downhill run) the chairlift, otherwise the street walk
  function layFrom(x, z, dx, dz, maxD, allowLift = false) {
    const i = aheadIdx(x, z, dx, dz, maxD);
    if (i >= 0) { layIdx(i); return; }
    if (allowLift && state.goldRun && !state.goldRun.loop) { lift(); return; }
    if (state.goldRun && state.goldRun.loop) {   // a loop: nearest point you are not on top of
      let best = -1, bd = 1e9; state.goldRun.pts.forEach((p, k) => { const d = Math.hypot(p[0] - x, p[1] - z); if (d >= 25 && d < bd) { bd = d; best = k; } });
      if (best >= 0 && bd < 200) { layIdx(best); return; }
    }
    layWalk(x, z, dx, dz);
  }
  // advance along the run after the current point was taken (or ridden past)
  function advance() {
    const R = state.goldRun;
    if (!R || state.goldIdx < 0) { const L = state.last, d = state.lastDir || { x: 0, z: -1 }; layFrom(L.x, L.z, d.x, d.z, 150); return; }
    const n = state.goldIdx + 1;
    if (n < R.pts.length) layIdx(n); else if (R.loop) layIdx(0); else lift();
  }
  // bottom of the run: main.js fades, puts the skater back at the top, and calls afterLift()
  function lift() {
    const R = state.goldRun; state.gold = null; gold.visible = false; state.goldIdx = -1;
    pendingLift = { x: R.top[0], z: R.top[1], yaw: R.top[2] };
  }
  let pendingLift = null;
  function nextSet() {
    state.set++; got.clear(); missed.clear();
    const L = state.last, d = state.lastDir || { x: 0, z: -1 };
    if (state.set === 1) layFrom(L.x, L.z, d.x, d.z, 140, true);   // straight after the day's five
    else advance();
  }

  let t = 0;
  updaters.push((dt, sk) => {
    t += dt;
    // ---- the day's five (and free skate's weekly route) ----
    for (const it of items) {
      const taken = got.has(it.ch) || (state.run && (state.set > 0 || missed.has(it.ch)));
      const d2 = (sk.pos.x - it.x) ** 2 + (sk.pos.z - it.z) ** 2;
      it.mesh.visible = !taken && d2 < SHOW * SHOW;
      if (!it.mesh.visible) continue;
      it.mesh.rotation.y = t * 1.1;
      it.mesh.position.y = it.y + Math.sin(t * 1.6 + it.x) * 0.12;
      // collect: proximity in 3D, in any state — you can grab one mid-air
      const reach = state.run ? RUN_REACH : REACH;
      if (d2 < reach * reach && Math.abs(sk.pos.y - it.y) < 2.2) {
        got.add(it.ch); it.mesh.visible = false;
        if (!state.run) storeSet(KEY, JSON.stringify([...got]));
        if (state.run) { if (state.last) state.lastDir = { x: it.x - state.last.x, z: it.z - state.last.z }; state.last = { x: it.x, z: it.z }; }
        sk.emit('letter', { ch: it.ch, n: got.size, total: LETTERS.length, run: state.run, set: 0, pts: 500, secs: 3 });
        if (got.size >= LETTERS.length) { sk.award(SET_PTS); sk.emit('letters', { pts: SET_PTS, run: state.run, set: 0 }); }
      }
    }
    if (!state.run) return;
    if (state.set === 0) {
      // the light is on the next letter not yet taken or passed
      const i = items.findIndex(it => !got.has(it.ch) && !missed.has(it.ch));
      const nx = i >= 0 ? items[i] : null;
      // missed it? More than PASS metres beyond it along the line, the light moves on
      if (nx) {
        const after = items[i + 1], before = i > 0 ? items[i - 1] : state.last;
        let ux = after ? after.x - nx.x : nx.x - before.x, uz = after ? after.z - nx.z : nx.z - before.z; const ul = Math.hypot(ux, uz) || 1; ux /= ul; uz /= ul;
        const along = (sk.pos.x - nx.x) * ux + (sk.pos.z - nx.z) * uz;
        if (along > PASS && Math.hypot(sk.pos.x - nx.x, sk.pos.z - nx.z) < 60) {
          missed.add(nx.ch); state.lastDir = { x: ux, z: uz }; state.last = { x: nx.x, z: nx.z };
          sk.emit('letterMissed', { ch: nx.ch });
        }
      }
      const nx2 = items.find(it => !got.has(it.ch) && !missed.has(it.ch)) || null;
      if (!nx2) { if (!state.lastDir) { const a = items[3], b = items[4]; state.lastDir = { x: b.x - a.x, z: b.z - a.z }; } nextSet(); }
      else state.next = nx2;
    }
    if (pendingLift) { const L = pendingLift; pendingLift = null; sk.emit('lift', L); }
    if (state.set > 0 && state.gold) {
      const G = state.gold; G.t += dt;
      const d2 = (sk.pos.x - G.x) ** 2 + (sk.pos.z - G.z) ** 2;
      gold.visible = d2 < SHOW * SHOW * 1.4;
      gold.rotation.y = t * 1.4; gold.position.y = G.y + Math.sin(t * 2.2) * 0.15;
      const s = 1 + 0.08 * Math.sin(t * 5); gold.scale.set(s, s, s);
      if (d2 < RUN_REACH * RUN_REACH && Math.abs(sk.pos.y - G.y) < 2.4) {
        got.add(G.ch); state.lastDir = { x: G.dx, z: G.dz }; state.last = { x: G.x, z: G.z };
        sk.emit('letter', { ch: G.ch, n: got.size, total: LETTERS.length, run: true, set: state.set, pts: goldPts(state.set), secs: goldSecs(state.set), gold: true });
        if (got.size >= LETTERS.length) { sk.award(GOLD_SET_PTS); sk.emit('letters', { pts: GOLD_SET_PTS, run: true, set: state.set }); nextSet(); }
        else advance();
      } else {
        // ridden past it (15 m beyond, along the run): the light moves on to the next point —
        // a gold letter is never "missed", the same letter is simply laid again further on
        const along = (sk.pos.x - G.x) * G.dx + (sk.pos.z - G.z) * G.dz;
        const far = d2 > 130 * 130, past = along > PASS && d2 < 60 * 60, stale = G.t > 22 && sk.speed > 3;
        if (G.t > 1.5 && (far || past || stale)) {
          const v = Math.hypot(sk.vel.x, sk.vel.z) > 1 ? { x: sk.vel.x, z: sk.vel.z } : { x: G.dx, z: G.dz };
          if (past && state.goldIdx >= 0) advance();
          else { state.last = { x: sk.pos.x, z: sk.pos.z }; state.lastDir = v; layFrom(sk.pos.x, sk.pos.z, v.x, v.z, 150); }
        }
      }
      state.next = state.gold;
    } else if (state.set > 0) state.next = null;
    // beacon on the next letter of the line (route order)
    const nx = state.next;
    beam.visible = !!nx;
    if (nx) {
      beam.position.set(nx.x, nx.y - HOVER, nx.z);
      if (cam) beam.rotation.y = Math.atan2(cam.position.x - nx.x, cam.position.z - nx.z);
      beam.material.opacity = 0.58 + 0.1 * Math.sin(t * 3); beam.material.color.setHex(state.set > 0 ? 0xffa21f : 0xffe27a);
    }
  });
  return state;
}
