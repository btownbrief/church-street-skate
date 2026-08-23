// Pedestrians, dogs, buskers, the Marketplace ambassador, and the outdoor café
// terraces on the Church Street mall. Builder D.
//
// Everything is instanced: one InstancedMesh per body part, per-instance colour, and
// per-instance matrices rewritten each frame. ~90 people cost 8 draw calls.
//
// Layout of the person instance buffer (order matters — degrade() trims the tail):
//   [0 .. nSeated)                 seated café diners      (posed once, never touched)
//   [nSeated .. nStatic)           busker / vendors / ambassador (animated in place)
//   [nStatic .. nStatic+nWalk)     roaming pedestrians     (halved on degrade)
import * as THREE from '../vendor/three.module.min.js';
import { clamp, lerp, rng, textTexture } from './util.js';

const BOX = new THREE.BoxGeometry(1, 1, 1);

// ---------------------------------------------------------------------------
// small geometry helper: concatenate several geometries into one (non-indexed)
// ---------------------------------------------------------------------------
function mergeGeos(list) {
  const parts = [];
  let total = 0;
  for (const [geo, x, y, z, rx, ry, rz, col] of list) {
    const g = geo.clone();
    if (rx) g.rotateX(rx); if (ry) g.rotateY(ry); if (rz) g.rotateZ(rz);
    g.translate(x || 0, y || 0, z || 0);
    const ng = g.index ? g.toNonIndexed() : g;
    parts.push([ng, col || null]);
    total += ng.attributes.position.count;
    if (ng !== g) g.dispose();
  }
  const pos = new Float32Array(total * 3), nrm = new Float32Array(total * 3), colA = new Float32Array(total * 3);
  let o = 0, anyCol = false;
  for (const [g, col] of parts) {
    const p = g.attributes.position.array, n = g.attributes.normal.array, c = g.attributes.position.count;
    pos.set(p, o * 3); nrm.set(n, o * 3);
    const cr = col ? ((col >> 16) & 255) / 255 : 1, cg = col ? ((col >> 8) & 255) / 255 : 1, cb = col ? (col & 255) / 255 : 1;
    if (col) anyCol = true;
    for (let i = 0; i < c; i++) { colA[(o + i) * 3] = cr; colA[(o + i) * 3 + 1] = cg; colA[(o + i) * 3 + 2] = cb; }
    o += c; g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  if (anyCol) out.setAttribute('color', new THREE.BufferAttribute(colA, 3));
  return out;
}

// ---------------------------------------------------------------------------
// polyline path helper (mall centreline + street sidewalks share this)
// ---------------------------------------------------------------------------
function makePath(pts) {
  const cum = new Float64Array(pts.length); let L = 0;
  for (let i = 1; i < pts.length; i++) { L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); cum[i] = L; }
  return { pts, cum, len: L };
}
// out = [x, z, ux, uz]; `off` is metres to the +normal side (normal = (uz, -ux))
function pathAt(p, s, off, out) {
  s = clamp(s, 0, p.len);
  let i = 1; const n = p.pts.length;
  while (i < n - 1 && p.cum[i] < s) i++;
  const a = p.pts[i - 1], b = p.pts[i];
  const seg = p.cum[i] - p.cum[i - 1];
  const t = seg > 1e-6 ? (s - p.cum[i - 1]) / seg : 0;
  const dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz) || 1;
  const ux = dx / L, uz = dz / L;
  out[0] = a[0] + dx * t + uz * off; out[1] = a[1] + dz * t - ux * off; out[2] = ux; out[3] = uz;
  return out;
}
function pathProject(p, x, z) {
  let bs = 0, bd = Infinity;
  for (let i = 1; i < p.pts.length; i++) {
    const a = p.pts[i - 1], b = p.pts[i];
    const dx = b[0] - a[0], dz = b[1] - a[1], l2 = dx * dx + dz * dz;
    const t = l2 < 1e-9 ? 0 : clamp(((x - a[0]) * dx + (z - a[1]) * dz) / l2, 0, 1);
    const px = a[0] + dx * t, pz = a[1] + dz * t;
    const d = (px - x) * (px - x) + (pz - z) * (pz - z);
    if (d < bd) { bd = d; bs = p.cum[i - 1] + Math.sqrt(l2) * t; }
  }
  return bs;
}
function pathOffsetOf(p, x, z) {
  const s = pathProject(p, x, z); const o = [0, 0, 0, 0]; pathAt(p, s, 0, o);
  return { s, off: (x - o[0]) * o[3] - (z - o[1]) * o[2] };
}

// ---------------------------------------------------------------------------
// people palette
// ---------------------------------------------------------------------------
const OUTFITS = [
  { top: 0x1e5631, bot: 0x2c3145, hat: 0xf0c419, hatP: 0.7 },  // UVM green hoodie + gold beanie
  { top: 0x9c3128, bot: 0x39404d, hat: 0x1d1d1d, hatP: 0.3 },  // red flannel
  { top: 0x22344f, bot: 0x6d6455, hat: 0x22344f, hatP: 0.4 },  // navy puffy vest + khakis
  { top: 0xd6a533, bot: 0x2b3440, hat: 0xd6a533, hatP: 0.5 },  // yellow raincoat
  { top: 0xe3ded1, bot: 0x5c6b8a, hat: 0xbb3b2f, hatP: 0.6 },  // tourist tee + ballcap
  { top: 0x59396f, bot: 0x3a3f4a, hat: 0x2a2a30, hatP: 0.3 },  // purple fleece
  { top: 0x7d7f83, bot: 0x27272b, hat: 0x27272b, hatP: 0.4 },  // grey wool coat
  { top: 0xcb5c33, bot: 0x353f4c, hat: 0x1f2a36, hatP: 0.5 },  // orange puffer
];
const SKINS = [0xe6b58e, 0xd39a6f, 0xb87b4e, 0x8d5a34, 0x6a4228, 0xf0c8a3];
const HAIRS = [0x2a1a10, 0x4a3220, 0x6b4a2a, 0x1a1a1a, 0x8a7355, 0xa8642a];

const LINES_NEAR = ['Hey!', 'Whoa!', 'Watch it!', 'Nice!', 'Sick!', 'Careful!', 'Yikes!'];
const LINES_BUMP = ['Excuse me', 'Hey now', 'Watch out'];
const NO_SKATING = 'No skating on the Marketplace!';

// café priority — the mall's best-known terraces, Leunig's first
const CAFE_PRIORITY = [
  "Leunig's Bistro", "Halvorson's", 'Sweetwaters', 'Church Street Tavern', "Ken's Pizza & Pub",
  "Ben & Jerry's", 'Red Square', 'Rí Rá Irish Pub', 'Honey Road', 'Gaku Ramen',
  'Asiana Noodle Shop', 'Cappadocia Bistro', "E.B. Strong's", 'Pascolo Ristorante', 'Kru Coffee',
];
const CAFE_KINDS = ['amenity:restaurant', 'amenity:cafe', 'amenity:bar', 'amenity:pub', 'amenity:ice_cream'];
const UMBRELLA_COLS = [0xe4dcc8, 0x1f5a3a, 0x2b5f8c, 0xc4472c, 0xe4dcc8, 0x1f5a3a];

export function createNpcs(ctx) {
  const { scene, WORLD, collide, terrain, quality, updaters } = ctx;
  const rnd = rng(90210);
  const R = (a, b) => a + (b - a) * rnd();

  const cs = WORLD.churchStreet;
  const mall = cs && cs.centerline && cs.centerline.length > 1 ? makePath(cs.centerline) : null;

  // ---- routes: the mall plus every car-street sidewalk near downtown ------
  const CAR_KINDS = ['primary', 'secondary', 'tertiary', 'residential', 'unclassified'];
  const routes = [];                       // { path, off, mall }
  if (mall) {
    // real cross-section: a 9 ft walkway hugging the shopfronts and a clear centre
    // lane either side of the granite meridian line — people use both, not the middle.
    routes.push({ path: mall, lanes: [[2.3, 4.0], [6.6, 8.0]], mall: true, w: 6 });
  }
  const play = ctx.play;
  for (const r of WORLD.roads || []) {
    if (!CAR_KINDS.includes(r.kind) || !r.pts || r.pts.length < 2) continue;
    const cx = r.pts.reduce((a, p) => a + p[0], 0) / r.pts.length;
    const cz = r.pts.reduce((a, p) => a + p[1], 0) / r.pts.length;
    if (cx < play.minX - 40 || cx > play.maxX + 40 || cz < play.minZ - 40 || cz > play.maxZ + 40) continue;
    const hw = roadHalfWidth(r);
    const p = makePath(r.pts);
    if (p.len < 25) continue;
    routes.push({ path: p, lanes: [[hw + 1.2, hw + 2.4]], mall: false, w: 1 });
    routes.push({ path: p, lanes: [[-hw - 2.4, -hw - 1.2]], mall: false, w: 1 });
  }
  const mallRoute = routes.length && routes[0].mall ? routes[0] : null;
  const streetRoutes = routes.filter(r => !r.mall);
  // the crowd belongs on the Marketplace; the side streets only get people when the
  // skater is actually on them.
  function pickRoute(sk) {
    const near = (r) => { pathAt(r.path, pathProject(r.path, sk.pos.x, sk.pos.z), 0, _o); return Math.hypot(_o[0] - sk.pos.x, _o[1] - sk.pos.z); };
    if (mallRoute) {
      const d = near(mallRoute);
      const p = d < 45 ? 0.74 : d < 120 ? 0.45 : 0.12;
      if (rnd() < p || !streetRoutes.length) return mallRoute;
    }
    // only put people on a side street that is actually near the skater, otherwise
    // they would spawn half a kilometre away and be recycled on the next frame
    for (let i = 0; i < 10; i++) {
      const r = streetRoutes[(rnd() * streetRoutes.length) | 0];
      if (near(r) < 130) return r;
    }
    return mallRoute || streetRoutes[0];
  }

  // Ground under a person. Query just above the terrain with a small step so we land on
  // sidewalk slabs and curbs but never on café tables, awnings or building ledges.
  const _g = {};
  function groundY(x, z) { return collide.groundAt(x, z, terrain.heightAt(x, z), 0.4, _g).y; }

  // Where the mall meets a car street: people turn the corner here instead of only
  // ever tracking up and down the bricks.
  const corners = [];
  if (mallRoute && cs && cs.crossings) {
    for (const [name, pt] of Object.entries(cs.crossings)) {
      const list = [], tmp = [0, 0, 0, 0];
      for (const r of streetRoutes) {
        pathAt(r.path, pathProject(r.path, pt[0], pt[1]), 0, tmp);
        if (Math.hypot(tmp[0] - pt[0], tmp[1] - pt[1]) < 14) list.push(r);
      }
      if (list.length) corners.push({ name, s: pathProject(mallRoute.path, pt[0], pt[1]), x: pt[0], z: pt[1], routes: list });
    }
  }
  function maybeTurnCorner(p) {
    if (!corners.length) return;
    for (const c of corners) {
      if (Math.hypot(p.x - c.x, p.z - c.z) > 9) continue;
      let r;
      if (p.route.mall) r = c.routes[(rnd() * c.routes.length) | 0];
      else if (mallRoute) r = mallRoute;
      else return;
      if (r === p.route) return;
      p.route = r; p.s = pathProject(r.path, p.x, p.z);
      const lane = r.lanes[(rnd() * r.lanes.length) | 0];
      p.off = (r.mall ? (rnd() < 0.5 ? -1 : 1) : 1) * (lane[0] + rnd() * (lane[1] - lane[0]));
      p.dir = rnd() < 0.5 ? -1 : 1;
      return;
    }
  }

  // ---- café terraces (we own these; the props builder was told to skip them) ----
  const cafes = buildCafes();

  // ---- instanced person parts -------------------------------------------
  const nWalk = Math.max(8, Math.round(55 * (quality.npcs || 1)));
  const nSeated = cafes.reduce((a, c) => a + c.diners.length, 0);
  const flavour = buildFlavourList();
  const nStatic = nSeated + flavour.length;
  const CAP = nStatic + nWalk;

  const lam = (opts) => new THREE.MeshLambertMaterial(Object.assign({ color: 0xffffff }, opts || {}));
  const mk = (geo, mat, n) => { const m = new THREE.InstancedMesh(geo, mat, n); m.frustumCulled = false; m.castShadow = !!quality.shadows; m.receiveShadow = false; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); scene.add(m); return m; };

  const P = {
    torso: mk(BOX, lam(), CAP),
    head: mk(BOX, lam(), CAP),
    hat: mk(BOX, lam(), CAP),
    legL: mk(BOX, lam(), CAP),
    legR: mk(BOX, lam(), CAP),
    armL: mk(BOX, lam(), CAP),
    armR: mk(BOX, lam(), CAP),
    acc: mk(BOX, lam(), CAP),
  };
  const PARTS = [P.torso, P.head, P.hat, P.legL, P.legR, P.armL, P.armR, P.acc];

  // dogs: one merged little body
  const dogGeo = mergeGeos([
    [new THREE.BoxGeometry(0.22, 0.24, 0.56), 0, 0.42, 0, 0, 0, 0, 0xffffff],
    [new THREE.BoxGeometry(0.19, 0.19, 0.22), 0, 0.52, -0.36, 0, 0, 0, 0xffffff],
    [new THREE.BoxGeometry(0.11, 0.09, 0.09), 0, 0.47, -0.5, 0, 0, 0, 0x2a2a2a],
    [new THREE.BoxGeometry(0.07, 0.32, 0.07), -0.07, 0.16, -0.19, 0, 0, 0, 0xdedede],
    [new THREE.BoxGeometry(0.07, 0.32, 0.07), 0.07, 0.16, -0.19, 0, 0, 0, 0xdedede],
    [new THREE.BoxGeometry(0.07, 0.32, 0.07), -0.07, 0.16, 0.19, 0, 0, 0, 0xdedede],
    [new THREE.BoxGeometry(0.07, 0.32, 0.07), 0.07, 0.16, 0.19, 0, 0, 0, 0xdedede],
    [new THREE.BoxGeometry(0.06, 0.06, 0.24), 0, 0.54, 0.36, -0.5, 0, 0, 0xffffff],
  ]);
  const nDogs = Math.max(2, Math.round(6 * (quality.npcs || 1)));
  const dogMesh = mk(dogGeo, lam({ vertexColors: true }), nDogs);

  // ---- café furniture instances -----------------------------------------
  const tableGeo = mergeGeos([
    [new THREE.CylinderGeometry(0.35, 0.35, 0.05, 12), 0, 0.725, 0],
    [new THREE.CylinderGeometry(0.035, 0.035, 0.7, 6), 0, 0.35, 0],
    [new THREE.CylinderGeometry(0.22, 0.22, 0.03, 10), 0, 0.015, 0],
  ]);
  const chairGeo = mergeGeos([
    [new THREE.BoxGeometry(0.4, 0.04, 0.4), 0, 0.44, 0],
    [new THREE.BoxGeometry(0.4, 0.42, 0.04), 0, 0.65, 0.18],
    [new THREE.BoxGeometry(0.035, 0.44, 0.035), -0.17, 0.22, -0.17],
    [new THREE.BoxGeometry(0.035, 0.44, 0.035), 0.17, 0.22, -0.17],
    [new THREE.BoxGeometry(0.035, 0.44, 0.035), -0.17, 0.22, 0.17],
    [new THREE.BoxGeometry(0.035, 0.44, 0.035), 0.17, 0.22, 0.17],
  ]);
  const umbGeo = mergeGeos([
    [new THREE.ConeGeometry(1.05, 0.42, 8), 0, 2.28, 0, 0, 0, 0, 0xffffff],
    [new THREE.CylinderGeometry(0.045, 0.045, 2.5, 6), 0, 1.25, 0, 0, 0, 0, 0x2e2e30],
    [new THREE.SphereGeometry(0.06, 6, 4), 0, 2.54, 0, 0, 0, 0, 0x2e2e30],
  ]);
  const nT = cafes.reduce((a, c) => a + c.tables.length, 0);
  const nC = cafes.reduce((a, c) => a + c.chairs.length, 0);
  const tableMesh = mk(tableGeo, lam({ color: 0x2b2b2e }), Math.max(1, nT));
  const chairMesh = mk(chairGeo, lam({ color: 0x232326 }), Math.max(1, nC));
  const umbMesh = mk(umbGeo, lam({ vertexColors: true }), Math.max(1, nT));
  tableMesh.castShadow = chairMesh.castShadow = umbMesh.castShadow = !!quality.shadows;
  tableMesh.receiveShadow = true;

  // ---- speech bubbles (pooled sprites) -----------------------------------
  const BUBBLES = 4;
  const bubbles = [];
  for (let i = 0; i < BUBBLES; i++) {
    const tex = textTexture(' ', { w: 512, h: 128 });
    const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: true, depthWrite: false }));
    spr.visible = false; spr.scale.set(2.6, 0.65, 1); spr.renderOrder = 5; scene.add(spr);
    bubbles.push({ spr, t: 0, owner: null, text: '' });
  }
  const bubbleCache = new Map();
  function say(person, text) {
    let b = bubbles.find(x => x.owner === person) || bubbles.find(x => x.t <= 0) || bubbles[0];
    if (b.text !== text) {
      let tex = bubbleCache.get(text);
      if (!tex) { tex = makeBubbleTex(text); bubbleCache.set(text, tex); }
      b.spr.material.map = tex; b.spr.material.needsUpdate = true; b.text = text;
      const wide = text.length > 14;
      b.spr.scale.set(wide ? 4.4 : 2.4, wide ? 0.62 : 0.6, 1);
    }
    b.owner = person; b.t = text === NO_SKATING ? 2.0 : 1.2; b.spr.visible = true;
  }

  // ---- people -------------------------------------------------------------
  const people = [];
  const _o = [0, 0, 0, 0];

  function newPerson(i) {
    const of = OUTFITS[(rnd() * OUTFITS.length) | 0];
    return {
      i, x: 0, y: 0, z: 0, yaw: 0, ph: rnd() * 6.283, sp: R(1.15, 1.5),
      route: null, s: 0, off: 0, dir: 1,
      stop: 0, kind: 'walk', fall: 0, fallT: 0, hop: 0, hopDir: 0, hopAmt: 0,
      say: 0, gY: 0, gT: rnd() * 0.3, dog: -1, acc: rnd() < 0.32 ? (rnd() < 0.5 ? 1 : 2) : 0,
      outfit: of, skin: SKINS[(rnd() * SKINS.length) | 0], hair: HAIRS[(rnd() * HAIRS.length) | 0],
      hasHat: rnd() < of.hatP, height: R(0.93, 1.06), pair: -1, lead: false, chat: 0,
    };
  }

  // seated diners --------------------------------------------------------
  for (const c of cafes) for (const d of c.diners) {
    const p = newPerson(people.length);
    p.kind = 'sit'; p.x = d.x; p.z = d.z; p.yaw = d.yaw; p.acc = rnd() < 0.5 ? 2 : 0;
    p.y = groundY(p.x, p.z); p.gY = p.y;
    people.push(p);
  }
  // flavour figures -------------------------------------------------------
  for (const f of flavour) {
    const p = newPerson(people.length);
    p.kind = f.kind; p.x = f.x; p.z = f.z; p.yaw = f.yaw;
    p.y = groundY(p.x, p.z); p.gY = p.y;
    if (f.kind === 'busk') { p.acc = 3; p.outfit = { top: 0x2e4a6b, bot: 0x3a3226, hat: 0x7a2f22, hatP: 1 }; p.hasHat = true; }
    if (f.kind === 'vend') { p.acc = 0; p.outfit = { top: 0x2f5d3f, bot: 0x2b2f38, hat: 0x2f5d3f, hatP: 1 }; p.hasHat = true; }
    if (f.kind === 'amb') {
      p.acc = 0; p.outfit = { top: 0xd8e63a, bot: 0x24272e, hat: 0xd8e63a, hatP: 1 }; p.hasHat = true; p.sp = 0.85;
      p.route = routes[0]; p.s = pathProject(mall, p.x, p.z); p.off = -3.4; p.dir = 1;
    }
    if (f.kind === 'sitb') p.kind = 'sit';
    people.push(p);
  }
  const staticCount = people.length;

  // roaming pedestrians ---------------------------------------------------
  for (let k = 0; k < nWalk; k++) {
    const p = newPerson(people.length);
    people.push(p);
  }
  // pair a few of them up (couples walking / stopping to talk)
  for (let k = staticCount + 1; k < people.length; k++) {
    if (rnd() < 0.22 && people[k - 1].pair === -1 && people[k - 1].i >= staticCount) {
      people[k].pair = k - 1; people[k - 1].pair = k; people[k - 1].lead = true;
    }
  }
  // dogs: give some walkers a leashed dog
  const dogs = [];
  for (let d = 0; d < nDogs; d++) {
    let owner = -1;
    for (let tries = 0; tries < 30; tries++) {
      const k = staticCount + ((rnd() * nWalk) | 0);
      if (k < people.length && people[k].dog === -1 && people[k].pair === -1) { owner = k; break; }
    }
    if (owner < 0) break;
    people[owner].dog = dogs.length;
    dogs.push({ owner, x: 0, y: 0, z: 0, yaw: 0, ph: rnd() * 6.283, side: rnd() < 0.5 ? -1 : 1, col: [0xd8cbb4, 0x6b4a33, 0x2b2b2b, 0xe8e4dc][(rnd() * 4) | 0] });
  }

  // colours are static per person
  const _col = new THREE.Color();
  for (const p of people) {
    const set = (m, c) => m.setColorAt(p.i, _col.setHex(c));
    set(P.torso, p.outfit.top); set(P.armL, p.outfit.top); set(P.armR, p.outfit.top);
    set(P.legL, p.outfit.bot); set(P.legR, p.outfit.bot);
    set(P.head, p.skin); set(P.hat, p.hasHat ? p.outfit.hat : p.hair);
    set(P.acc, p.acc === 1 ? 0x8a6a4a : p.acc === 2 ? 0xf2f0ea : p.acc === 3 ? 0x8a5a2a : 0x000000);
  }
  for (const m of PARTS) if (m.instanceColor) m.instanceColor.needsUpdate = true;
  for (let d = 0; d < dogs.length; d++) dogMesh.setColorAt(d, _col.setHex(dogs[d].col));
  if (dogMesh.instanceColor) dogMesh.instanceColor.needsUpdate = true;

  // place café furniture once
  {
    let ti = 0, ci = 0; const M = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(1, 1, 1), v = new THREE.Vector3();
    for (const c of cafes) {
      for (const t of c.tables) {
        q.setFromAxisAngle(YAXIS, t.yaw); v.set(t.x, t.y, t.z); M.compose(v, q, sc);
        tableMesh.setMatrixAt(ti, M); umbMesh.setMatrixAt(ti, M);
        umbMesh.setColorAt(ti, _col.setHex(c.umbCol));
        ti++;
      }
      for (const ch of c.chairs) { q.setFromAxisAngle(YAXIS, ch.yaw); v.set(ch.x, ch.y, ch.z); M.compose(v, q, sc); chairMesh.setMatrixAt(ci++, M); }
    }
    tableMesh.count = ti; umbMesh.count = ti; chairMesh.count = ci;
    tableMesh.instanceMatrix.needsUpdate = umbMesh.instanceMatrix.needsUpdate = chairMesh.instanceMatrix.needsUpdate = true;
    if (umbMesh.instanceColor) umbMesh.instanceColor.needsUpdate = true;
  }

  // ---- spawning / recycling ----------------------------------------------
  function spawn(p, sk, minD, maxD) {
    for (let tries = 0; tries < 12; tries++) {
      const r = pickRoute(sk);
      const s0 = pathProject(r.path, sk.pos.x, sk.pos.z);
      const d = R(minD, maxD);
      let s = s0 + (rnd() < 0.5 ? -1 : 1) * d;
      if (s < 2 || s > r.path.len - 2) s = clamp(s0 + (s < 2 ? d : -d), 2, Math.max(2, r.path.len - 2));
      const lane = r.lanes[(rnd() * r.lanes.length) | 0];
      const off = (rnd() < 0.5 ? -1 : 1) * R(lane[0], lane[1]);
      pathAt(r.path, s, off, _o);
      const dist = Math.hypot(_o[0] - sk.pos.x, _o[1] - sk.pos.z);
      if (dist < minD * 0.6 || dist > maxD * 1.6) { if (tries < 11) continue; }
      p.route = r; p.s = s; p.off = off; p.dir = rnd() < 0.5 ? -1 : 1;
      p.x = _o[0]; p.z = _o[1];
      p.yaw = Math.atan2(-_o[2] * p.dir, -_o[3] * p.dir);
      p.y = p.gY = groundY(p.x, p.z);
      p.stop = rnd() < 0.15 ? R(1, 4) : 0; p.fall = 0; p.fallT = 0; p.hop = 0; p.hopAmt = 0; p.chat = 0;
      if (p.dog >= 0 && dogs[p.dog]) { dogs[p.dog].x = p.x; dogs[p.dog].z = p.z; dogs[p.dog].y = p.y; }
      return;
    }
  }

  // ---- matrix writing -----------------------------------------------------
  const _m = new THREE.Matrix4();
  const pose = { c: 1, s: 0, px: 0, py: 0, pz: 0, fall: 0, fc: 1, fs: 0, scale: 1 };
  const FALL_PIVOT = 0.34;
  function setPose(x, y, z, yaw, fall, scale) {
    pose.px = x; pose.py = y; pose.pz = z; pose.c = Math.cos(yaw); pose.s = Math.sin(yaw);
    pose.fall = fall; pose.fc = Math.cos(fall); pose.fs = Math.sin(fall); pose.scale = scale;
  }
  // lx/ly/lz are body-local metres (y from the feet up); pitch/roll are the part's own
  function part(mesh, i, lx, ly, lz, pitch, sx, sy, sz, roll) {
    const k = pose.scale;
    lx *= k; ly *= k; lz *= k;
    const ay = ly - FALL_PIVOT * k;
    const ry = ay * pose.fc - lz * pose.fs + FALL_PIVOT * k;
    const rz = ay * pose.fs + lz * pose.fc;
    const wx = pose.px + lx * pose.c + rz * pose.s;
    const wz = pose.pz - lx * pose.s + rz * pose.c;
    const wy = pose.py + ry;
    const p2 = pitch + pose.fall;
    const cp = Math.cos(p2), sp = Math.sin(p2);
    const c = pose.c, s = pose.s;
    const e = _m.elements;
    if (roll) {
      const cr = Math.cos(roll), sr = Math.sin(roll);
      e[0] = (c * cr + s * sp * sr) * sx * k; e[1] = (cp * sr) * sx * k; e[2] = (-s * cr + c * sp * sr) * sx * k; e[3] = 0;
      e[4] = (-c * sr + s * sp * cr) * sy * k; e[5] = (cp * cr) * sy * k; e[6] = (s * sr + c * sp * cr) * sy * k; e[7] = 0;
    } else {
      e[0] = c * sx * k; e[1] = 0; e[2] = -s * sx * k; e[3] = 0;
      e[4] = s * sp * sy * k; e[5] = cp * sy * k; e[6] = c * sp * sy * k; e[7] = 0;
    }
    e[8] = s * cp * sz * k; e[9] = -sp * sz * k; e[10] = c * cp * sz * k; e[11] = 0;
    e[12] = wx; e[13] = wy; e[14] = wz; e[15] = 1;
    mesh.setMatrixAt(i, _m);
  }

  // body dimensions (metres, from the feet)
  const HIP = 0.86, SHOULDER = 1.42, TORSO_TOP = 1.48;
  function poseBody(p, walkPhase, swing, headBob, armBase) {
    const i = p.i;
    const legA = Math.sin(walkPhase) * swing, legB = -legA;
    const armA = -legA * 0.72, armB = -legB * 0.72;
    const lean = Math.min(swing, 0.5) * 0.18;
    part(P.legL, i, -0.11, HIP, 0, legA, 0.15, 0.86, 0.19);
    part(P.legR, i, 0.11, HIP, 0, legB, 0.15, 0.86, 0.19);
    part(P.torso, i, 0, HIP + 0.31 + headBob, 0, lean, 0.42, 0.62, 0.26);
    part(P.head, i, 0, TORSO_TOP + 0.13 + headBob, -0.01, lean * 0.5, 0.21, 0.24, 0.22);
    part(P.hat, i, 0, TORSO_TOP + 0.29 + headBob, -0.01, lean * 0.5, 0.23, 0.1, 0.235);
    part(P.armL, i, -0.255, SHOULDER + headBob, 0, armA + armBase, 0.11, 0.62, 0.11);
    part(P.armR, i, 0.255, SHOULDER + headBob, 0, armB + armBase, 0.11, 0.62, 0.11);
    // accessory
    if (p.acc === 1) part(P.acc, i, 0.3, HIP + 0.02 - Math.cos(armB) * 0.12, -Math.sin(armB) * 0.5, armB, 0.22, 0.3, 0.11);
    else if (p.acc === 2) part(P.acc, i, 0.27, SHOULDER - 0.34, -0.2, 0, 0.075, 0.11, 0.075);
    else if (p.acc === 3) part(P.acc, i, 0.02, HIP + 0.28, -0.2, 0.15, 0.33, 0.92, 0.09, 0.55);
    else part(P.acc, i, 0, -50, 0, 0, 0.001, 0.001, 0.001);
  }
  function poseSeated(p) {
    const i = p.i, hip = 0.50;                 // sitting on a 0.44 m bistro chair
    setPose(p.x, p.y, p.z, p.yaw, 0, p.height);
    part(P.legL, i, -0.11, hip, 0, 1.05, 0.15, 0.84, 0.19);
    part(P.legR, i, 0.11, hip, 0, 1.05, 0.15, 0.84, 0.19);
    part(P.torso, i, 0, hip + 0.31, -0.02, 0.08, 0.42, 0.62, 0.26);
    part(P.head, i, 0, hip + 0.75, -0.04, 0.08, 0.21, 0.24, 0.22);
    part(P.hat, i, 0, hip + 0.91, -0.04, 0.08, 0.23, 0.1, 0.235);
    part(P.armL, i, -0.255, hip + 0.56, 0, 0.85, 0.11, 0.56, 0.11);
    part(P.armR, i, 0.255, hip + 0.56, 0, 0.85, 0.11, 0.56, 0.11);
    if (p.acc === 2) part(P.acc, i, 0.2, hip + 0.36, -0.4, 0, 0.075, 0.11, 0.075);
    else part(P.acc, i, 0, -50, 0, 0, 0.001, 0.001, 0.001);
  }

  // diners never move — pose them once
  for (const p of people) if (p.kind === 'sit') poseSeated(p);

  // ---- per-frame update ---------------------------------------------------
  let seededSpawn = false;
  let t = 0;
  let ambCool = 0;
  const NEAR2 = 180 * 180;

  function update(dt, sk) {
    t += dt;
    const sx = sk.pos.x, sz = sk.pos.z, sy = sk.pos.y;
    const spd = Math.hypot(sk.vel.x, sk.vel.z);
    if (!seededSpawn) { for (let k = staticCount; k < people.length; k++) spawn(people[k], sk, 6, 120); seededSpawn = true; }

    const live = staticCount + activeWalkers;
    for (let k = 0; k < live; k++) {
      const p = people[k];
      const dx = p.x - sx, dz = p.z - sz;
      const d2 = dx * dx + dz * dz;
      if (p.kind === 'walk') {
        if (d2 > 160 * 160) { spawn(p, sk, 60, 120); continue; }
        if (d2 > NEAR2) continue;                       // asleep
        stepWalker(p, dt, sk, spd, sx, sz, sy, d2);
      } else if (p.kind === 'amb') {
        if (d2 < NEAR2) stepAmbassador(p, dt, sk, sx, sz, d2);
      }
      // knock-down timer applies to everyone
      if (p.fall) { p.fallT += dt; if (p.fallT > 1.5) { p.fall = 0; p.fallT = 0; } }
      if (p.kind === 'sit' || d2 > NEAR2) continue;   // diners are posed once at build
      drawPerson(p, dt);
    }

    // dogs trot along beside their owner
    for (let d = 0; d < dogs.length; d++) {
      const dg = dogs[d], ow = people[dg.owner];
      if (!ow) continue;
      const c = Math.cos(ow.yaw), s = Math.sin(ow.yaw);
      const lx = dg.side * 0.85, lz = 0.75;
      const tx = ow.x + lx * c + lz * s, tz = ow.z - lx * s + lz * c;
      const kx = 1 - Math.exp(-6 * dt);
      const ndx = (tx - dg.x) * kx, ndz = (tz - dg.z) * kx;
      dg.x += ndx; dg.z += ndz;
      const moving = Math.hypot(ndx, ndz) > 0.004;
      dg.yaw = moving ? Math.atan2(-ndx, -ndz) : ow.yaw;
      dg.ph += dt * 9;
      dg.y = ow.gY;
      const bob = Math.abs(Math.sin(dg.ph)) * 0.03 * (moving ? 1 : 0.2);
      const q = _q1.setFromAxisAngle(YAXIS, dg.yaw);
      _v1.set(dg.x, dg.y + bob, dg.z);
      _m.compose(_v1, q, _v2.set(1, 1, 1));
      dogMesh.setMatrixAt(d, _m);
    }
    dogMesh.instanceMatrix.needsUpdate = true;
    for (const m of PARTS) m.instanceMatrix.needsUpdate = true;

    // speech bubbles
    for (const b of bubbles) {
      if (b.t <= 0) continue;
      b.t -= dt;
      if (b.t <= 0) { b.spr.visible = false; b.owner = null; continue; }
      const o = b.owner;
      b.spr.position.set(o.x, o.y + 2.36 * o.height + (o.fall ? -1.0 : 0), o.z);
      b.spr.material.opacity = clamp(b.t * 3, 0, 1);
    }
    if (ambCool > 0) ambCool -= dt;
  }

  function stepWalker(p, dt, sk, spd, sx, sz, sy, d2) {
    // --- reaction: a fast skater on a near-miss line makes people jump aside
    if (spd > 3 && d2 < 64 && !p.fall) {
      const fx = p.x - (sx + sk.vel.x * 0.9), fz = p.z - (sz + sk.vel.z * 0.9);
      const closing = Math.hypot(fx, fz);
      if (closing < 1.6 && p.hop <= 0) {
        const rx = -sk.vel.z / (spd || 1), rz = sk.vel.x / (spd || 1);   // sidestep axis
        const sign = ((p.x - sx) * rx + (p.z - sz) * rz) >= 0 ? 1 : -1;
        p.hop = 0.42; p.hopDir = sign; p.hopAmt = 0;
        if (Math.random() < 0.55) say(p, LINES_NEAR[(Math.random() * LINES_NEAR.length) | 0]);
      }
    }
    // --- collision with the skater
    if (d2 < 1.6 && Math.abs(sy - p.y) < 1.5 && !p.fall) {
      const d = Math.sqrt(d2) || 0.001;
      if (d < 0.55) {
        if (spd > 3.5 && sk.state !== 'bail') {
          sk.startBail('npc');
          p.fall = Math.random() < 0.5 ? -1.4 : 1.4; p.fallT = 0; p.hop = 0;
          say(p, LINES_NEAR[(Math.random() * LINES_NEAR.length) | 0]);
        } else {
          const nx = (p.x - sx) / d, nz = (p.z - sz) / d, push = (0.62 - d);
          p.x += nx * push; p.z += nz * push;
          sk.pos.x -= nx * push * 0.5; sk.pos.z -= nz * push * 0.5;
          if (p.say <= 0) { say(p, LINES_BUMP[(Math.random() * LINES_BUMP.length) | 0]); p.say = 2.5; }
        }
      }
    }
    if (p.say > 0) p.say -= dt;
    if (p.fall) { p.hop = 0; return; }

    // --- sidestep hop
    if (p.hop > 0) { p.hop -= dt; p.hopAmt = lerp(p.hopAmt, p.hopDir * 1.0, 1 - Math.exp(-12 * dt)); }
    else p.hopAmt = lerp(p.hopAmt, 0, 1 - Math.exp(-2.5 * dt));

    // --- walking / stopping
    const lead = p.pair >= 0 && !p.lead ? people[p.pair] : null;
    if (lead && lead.kind === 'walk' && !lead.fall) {
      p.route = lead.route; p.s = lead.s; p.off = lead.off + (p.i > lead.i ? 0.85 : -0.85); p.dir = lead.dir;
      p.stop = lead.stop; p.chat = lead.chat;
    } else if (p.stop > 0) {
      p.stop -= dt;
    } else {
      p.s += p.dir * p.sp * dt;
      if (p.route && (p.s < 1 || p.s > p.route.path.len - 1)) { p.dir *= -1; p.s = clamp(p.s, 1, p.route.path.len - 1); }
      if (Math.random() < dt * 0.06) { p.stop = 2 + Math.random() * 4; p.chat = p.pair >= 0 ? 1 : 0; }
      if (Math.random() < dt * 0.03) { p.dir *= -1; }             // change your mind, turn round
      if (p.pair < 0 && Math.random() < dt * 0.5) maybeTurnCorner(p);
    }
    if (!p.route) return;
    pathAt(p.route.path, p.s, p.off + p.hopAmt, _o);
    p.x = _o[0]; p.z = _o[1];
    // face travel, or your companion while chatting
    let wantYaw;
    if (p.stop > 0 && p.chat && p.pair >= 0) { const o = people[p.pair]; wantYaw = Math.atan2(-(o.x - p.x), -(o.z - p.z)); }
    else wantYaw = Math.atan2(-_o[2] * p.dir, -_o[3] * p.dir);
    let dy = wantYaw - p.yaw; while (dy > Math.PI) dy -= 6.283185; while (dy < -Math.PI) dy += 6.283185;
    p.yaw += dy * (1 - Math.exp(-8 * dt));
    // ground sample (staggered)
    p.gT -= dt;
    if (p.gT <= 0) { p.gT = 0.25; p.gY = groundY(p.x, p.z); }
    p.y = lerp(p.y, p.gY, 1 - Math.exp(-10 * dt));
  }

  function stepAmbassador(p, dt, sk, sx, sz, d2) {
    if (p.fall) return;
    p.s += p.dir * p.sp * dt;
    if (p.s < 20 || p.s > p.route.path.len - 20) p.dir *= -1;
    pathAt(p.route.path, p.s, p.off, _o);
    p.x = _o[0]; p.z = _o[1];
    const wantYaw = Math.atan2(-_o[2] * p.dir, -_o[3] * p.dir);
    let dy = wantYaw - p.yaw; while (dy > Math.PI) dy -= 6.283185; while (dy < -Math.PI) dy += 6.283185;
    p.yaw += dy * (1 - Math.exp(-6 * dt));
    p.gT -= dt; if (p.gT <= 0) { p.gT = 0.25; p.gY = groundY(p.x, p.z); }
    p.y = lerp(p.y, p.gY, 1 - Math.exp(-10 * dt));
    if (d2 < 100 && ambCool <= 0) { say(p, NO_SKATING); ambCool = 9; }
  }

  function drawPerson(p, dt) {
    if (p.kind === 'sit' && !p.fall) { poseSeated(p); return; }
    const moving = p.kind === 'walk' || p.kind === 'amb';
    const walking = moving && p.stop <= 0 && !p.fall && !(p.pair >= 0 && !p.lead && people[p.pair] && people[p.pair].stop > 0);
    if (walking) p.ph += dt * p.sp * 4.4;
    else p.ph += dt * 0.9;
    const swing = walking ? 0.62 : 0.05;
    const bob = walking ? Math.abs(Math.sin(p.ph)) * 0.028 : Math.sin(p.ph * 0.6) * 0.012;
    let armBase = 0;
    if (p.acc === 3) { armBase = 0.9 + Math.sin(t * 7.5) * 0.35; }   // busker strumming
    else if (p.kind === 'vend') armBase = 0.35 + Math.sin(t * 1.4 + p.i) * 0.12;
    else if (p.acc === 2) armBase = 0.2;
    setPose(p.x, p.y, p.z, p.yaw, p.fall ? p.fall * Math.min(1, p.fallT / 0.22) : 0, p.height);
    poseBody(p, p.ph, p.fall ? 0.1 : swing, bob, armBase);
  }

  // ---- degrade -----------------------------------------------------------
  let activeWalkers = nWalk;
  function applyCount() {
    const n = staticCount + activeWalkers;
    for (const m of PARTS) m.count = n;
  }
  applyCount();
  // Playtest hooks, off unless you load the page with ?npcdebug (see scripts/shot-npc.mjs)
  if (typeof location !== 'undefined' && location.search.indexOf('npcdebug') >= 0) {
    window.__npcDbg = (sx, sz) => { let b = null, bd = 1e9; for (let k = staticCount; k < staticCount + activeWalkers; k++) { const p = people[k]; const d = Math.hypot(p.x - sx, p.z - sz); if (d < bd) { bd = d; b = p; } } return b ? { x: b.x, z: b.z, y: b.y, d: bd, kind: b.kind, n: people.length, walkers: activeWalkers } : null; };
    window.__npcAt = (k) => { const p = people[k]; return { x: p.x, z: p.z, kind: p.kind, stop: p.stop, mall: p.route ? !!p.route.mall : null, off: p.off }; };
    window.__npcStats = () => { let mallN = 0, moving = 0; for (let k = staticCount; k < staticCount + activeWalkers; k++) { const p = people[k]; if (p.route && p.route.mall) mallN++; if (p.stop <= 0) moving++; } return { mallN, moving, walkers: activeWalkers, staticCount, cafes: cafes.length, tables: nT, diners: nSeated }; };
  }
  update.degrade = () => {
    activeWalkers = Math.max(4, activeWalkers >> 1);
    dogMesh.count = Math.max(1, dogMesh.count >> 1);
    applyCount();
  };
  updaters.push(update);

  // =========================================================================
  // café terrace construction
  // =========================================================================
  function buildCafes() {
    if (!mall) return [];
    const byName = new Map();
    for (const poi of WORLD.pois || []) if (poi.name && CAFE_KINDS.includes(poi.kind)) byName.set(poi.name, poi);
    const bld = new Map();
    for (const b of WORLD.buildings || []) bld.set(b.id, b);
    const out = [];
    let ui = 0;
    for (const name of CAFE_PRIORITY) {
      if (out.length >= 14) break;
      const poi = byName.get(name);
      if (!poi) continue;
      const pr = pathOffsetOf(mall, poi.x, poi.z);
      if (Math.abs(pr.off) > 30) continue;
      const side = pr.off >= 0 ? 1 : -1;
      // storefront face = the building edge nearest the mall centreline
      let faceD = 9.4;
      const b = bld.get(poi.building);
      if (b && b.pts) {
        let m = Infinity;
        for (const q of b.pts) { const o = pathOffsetOf(mall, q[0], q[1]); if (Math.sign(o.off) === side && Math.abs(o.off) < m) m = Math.abs(o.off); }
        if (isFinite(m)) faceD = clamp(m, 7.6, 9.6);
      }
      // Burlington Code §27-20: a 9 ft pedestrian way against the shopfronts and a
      // 12 ft emergency lane down the middle. Cafés live in what's left.
      const outer = faceD - 2.9, inner = Math.max(2.4, outer - 3.0);
      if (outer - inner < 1.0) continue;
      const isLeunigs = name === "Leunig's Bistro";
      const nTables = isLeunigs ? 5 : 2 + ((rnd() * 3) | 0);
      const col = isLeunigs ? 0x8f2429 : UMBRELLA_COLS[ui++ % UMBRELLA_COLS.length];
      const c = { name, umbCol: col, tables: [], chairs: [], diners: [] };
      const span = (nTables - 1) * 2.5;
      for (let k = 0; k < nTables; k++) {
        const s = pr.s - span / 2 + k * 2.5 + R(-0.2, 0.2);
        const off = side * clamp(lerp(inner, outer, 0.35 + rnd() * 0.3), 2.4, 7.0);
        pathAt(mall, s, off, _o0);
        const x = _o0[0], z = _o0[1];
        const y = groundY(x, z);
        const yaw = Math.atan2(-_o0[2], -_o0[3]) + R(-0.3, 0.3);
        c.tables.push({ x, y, z, yaw });
        collide.addSurface({ x, z, w: 0.7, d: 0.7, yaw, top: y + 0.75, bottom: y, kind: 'table', name: name + ' terrace', grindable: false });
        collide.addBlocker({ x, z, r: 0.16, name: name + ' umbrella', top: y + 2.4 });
        const nCh = 2 + ((rnd() * 2) | 0);
        for (let q = 0; q < nCh; q++) {
          const a = yaw + (q / nCh) * 6.283 + R(-0.25, 0.25);
          const cx = x + Math.sin(a) * 0.72, cz = z + Math.cos(a) * 0.72;
          const cy = groundY(cx, cz);
          const cyaw = Math.atan2(-(x - cx), -(z - cz));
          c.chairs.push({ x: cx, y: cy, z: cz, yaw: cyaw });
          if (k < 2 && q < 1 && c.diners.length < 2) c.diners.push({ x: cx, z: cz, yaw: cyaw });
        }
      }
      out.push(c);
    }
    return out;
  }

  function buildFlavourList() {
    const list = [];
    if (!mall) return list;
    const at = (z, off, yaw) => { const s = pathProject(mall, 0, z); pathAt(mall, s, off, _o0); return { x: _o0[0], z: _o0[1], yaw: yaw ?? Math.atan2(-_o0[2], -_o0[3]) }; };
    // busker on the Bank St block (Bank crossing is z ≈ -123)
    const bk = at(-134, -3.6, 1.57); list.push({ kind: 'busk', x: bk.x, z: bk.z, yaw: bk.yaw });
    // vendors standing beside where the carts go (active zone, mid-mall)
    for (const [z, off] of [[-206, 4.4], [-64, -4.6], [36, 4.6]]) {
      const v = at(z, off, null); list.push({ kind: 'vend', x: v.x, z: v.z, yaw: off > 0 ? -1.57 : 1.57 });
    }
    // the Marketplace ambassador starts on the College block
    const a = at(-40, -3.4, null); list.push({ kind: 'amb', x: a.x, z: a.z, yaw: a.yaw });
    return list;
  }

  // must match roadWidth() in ground.js or people walk off the concrete
  function roadHalfWidth(r) { return roadWidth(r) / 2; }
}

// mirror of roadWidth() in js/ground.js (builder A) — keep the two in step
function feetOf(v) { const m = /^([\d.]+)\s*'$/.exec(String(v)); return m ? +m[1] * 0.3048 : null; }
function roadWidth(r) {
  if (r.width) { const f = feetOf(r.width); const v = f != null ? f : parseFloat(r.width); if (v > 1.5 && v < 40) return v; }
  const base = { primary: 11, secondary: 11, tertiary: 9, residential: 9, unclassified: 9, service: 5 }[r.kind] || 8;
  const lanes = parseInt(r.lanes, 10);
  if (lanes >= 1) return Math.max(base, lanes * 3.3 + (r.kind === 'service' ? 0 : 4.8));
  return base;
}

const YAXIS = new THREE.Vector3(0, 1, 0);
const _q1 = new THREE.Quaternion(), _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3();
const _o0 = [0, 0, 0, 0];

function makeBubbleTex(text) {
  const wide = text.length > 14;
  const w = wide ? 512 : 320, h = 96;
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d');
  const r = 18, pad = 8;
  g.fillStyle = 'rgba(255,255,255,0.94)';
  g.strokeStyle = 'rgba(30,30,34,0.75)'; g.lineWidth = 3;
  g.beginPath();
  g.moveTo(pad + r, pad); g.lineTo(w - pad - r, pad); g.quadraticCurveTo(w - pad, pad, w - pad, pad + r);
  g.lineTo(w - pad, h - pad - r - 12); g.quadraticCurveTo(w - pad, h - pad - 12, w - pad - r, h - pad - 12);
  g.lineTo(w / 2 + 14, h - pad - 12); g.lineTo(w / 2, h - pad + 2); g.lineTo(w / 2 - 14, h - pad - 12);
  g.lineTo(pad + r, h - pad - 12); g.quadraticCurveTo(pad, h - pad - 12, pad, h - pad - r - 12);
  g.lineTo(pad, pad + r); g.quadraticCurveTo(pad, pad, pad + r, pad);
  g.closePath(); g.fill(); g.stroke();
  let size = wide ? 34 : 44;
  g.fillStyle = '#16181d'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = `bold ${size}px Helvetica, Arial, sans-serif`;
  while (g.measureText(text).width > w - 40 && size > 12) { size -= 2; g.font = `bold ${size}px Helvetica, Arial, sans-serif`; }
  g.fillText(text, w / 2, (h - 14) / 2 + 2);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 2;
  return tex;
}
