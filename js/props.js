// builder C — street furniture / set dressing.
//
// Everything the Church Street Marketplace actually has standing on its brick: honey-locust
// trees in cobble pits, black-iron benches, glacial boulders, 30 lamp posts with banners and
// flags, pennant bunting, bollards at every cross-street mouth, maroon directional pylons,
// reclaimed-wood planter runs, vendor carts, sandwich boards, trash pairs, bike hoops, the
// Big Joe Burrell bronze, the Leapfroggers, the globe pavers and the granite meridian line.
// Plus the rest of downtown: street trees, Great Streets teardrop lights, traffic signals,
// bus stops, hydrants, meters, and City Hall Park's teal bistro sets.
//
// Layout rule (Burlington Code §27-20, see docs/BURLINGTON-REFERENCE.md §4.1b):
//   |offset| 0.0 – 1.8 m  emergency egress lane   — CLEAR (also the skate line)
//   |offset| 1.8 – 6.7 m  active zone             — everything lives here
//   |offset| 6.7 – 9.5 m  pedestrian way          — CLEAR (building faces sit at ±9…10 m)
//
// One vertex-coloured material carries almost everything, so a whole prop type (or a whole
// pile of unrelated one-offs) costs a single draw call.
import * as THREE from '../vendor/three.module.min.js';

export function buildProps(ctx) {
  const { scene, collide, WORLD, spots, rng, quality } = ctx;
  const mobile = !!quality.mobile;
  const R = rng;
  const rr = (a, b) => a + R() * (b - a);
  const ri = (a, b) => Math.floor(a + R() * (b - a + 1));
  const pick = (arr) => arr[Math.floor(R() * arr.length)];
  const chance = (p) => R() < p;

  // ===========================================================================
  // 1. tiny geometry kit
  // ===========================================================================
  const _c = new THREE.Color();
  function colorize(geo, hex) {
    _c.set(hex);
    const n = geo.attributes.position.count, a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { a[i * 3] = _c.r; a[i * 3 + 1] = _c.g; a[i * 3 + 2] = _c.b; }
    geo.setAttribute('color', new THREE.BufferAttribute(a, 3));
    return geo;
  }
  function merge(list) {
    const gs = [];
    let total = 0;
    for (let g of list) { if (!g) continue; if (g.index) g = g.toNonIndexed(); gs.push(g); total += g.attributes.position.count; }
    if (!total) return null;
    const pos = new Float32Array(total * 3), nor = new Float32Array(total * 3), col = new Float32Array(total * 3);
    let o = 0;
    for (const g of gs) {
      const n = g.attributes.position.count;
      pos.set(g.attributes.position.array, o * 3);
      if (g.attributes.normal) nor.set(g.attributes.normal.array, o * 3);
      if (g.attributes.color) col.set(g.attributes.color.array, o * 3); else col.fill(1, o * 3, (o + n) * 3);
      o += n;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return geo;
  }
  // rotate (X then Z then Y) and translate
  const xf = (g, x = 0, y = 0, z = 0, ry = 0, rx = 0, rz = 0) => {
    if (rx) g.rotateX(rx); if (rz) g.rotateZ(rz); if (ry) g.rotateY(ry);
    g.translate(x, y, z); return g;
  };
  // Every round primitive goes through SEG, so one flag coarsens the whole street kit on a
  // phone (the art is faceted anyway, so it mostly reads as "more low-poly").
  const SEG = mobile ? (n) => Math.max(3, Math.round(n * 0.6)) : (n) => n;
  const box = (w, h, d, hex, x, y, z, ry, rx, rz) => colorize(xf(new THREE.BoxGeometry(w, h, d), x, y, z, ry, rx, rz), hex);
  const cyl = (rt, rb, h, seg, hex, x, y, z, ry, rx, rz) => colorize(xf(new THREE.CylinderGeometry(rt, rb, h, SEG(seg), 1), x, y, z, ry, rx, rz), hex);
  const tube = (rt, rb, h, seg, hex, x, y, z, ry, rx, rz) => colorize(xf(new THREE.CylinderGeometry(rt, rb, h, SEG(seg), 1, true), x, y, z, ry, rx, rz), hex);
  const sph = (r, seg, hex, x, y, z, sx, sy, sz) => { const s2 = SEG(seg); const g = new THREE.SphereGeometry(r, s2, Math.max(3, s2 >> 1)); if (sx !== undefined) g.scale(sx, sy, sz); return colorize(xf(g, x, y, z), hex); };
  const ico = (r, det, hex) => colorize(new THREE.IcosahedronGeometry(r, mobile ? Math.min(det, 0) : det), hex);
  const quad = (w, h, hex, x, y, z, ry, rx, rz) => colorize(xf(new THREE.PlaneGeometry(w, h), x, y, z, ry, rx, rz), hex);
  const disc = (r, seg, hex, x, y, z) => colorize(xf(new THREE.CircleGeometry(r, SEG(seg)), x, y, z, 0, -Math.PI / 2), hex);
  const torus = (r, t, seg, arc, hex, x, y, z, ry, rx) => colorize(xf(new THREE.TorusGeometry(r, t, mobile ? 3 : 4, SEG(seg), arc), x, y, z, ry, rx), hex);
  // world offsets in an object's local frame (rotation.y = yaw): +X along, +Z across
  const oxx = (x, yaw, d) => x + Math.cos(yaw) * d;
  const oxz = (z, yaw, d) => z - Math.sin(yaw) * d;
  const ozx = (x, yaw, d) => x + Math.sin(yaw) * d;
  const ozz = (z, yaw, d) => z + Math.cos(yaw) * d;

  // materials — one per "look", shared by everything
  const MATP = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  const MATB = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
  const MATE = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide });
  const MATG = new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: 0.32, side: THREE.DoubleSide, depthWrite: false });
  const MATD = new THREE.MeshLambertMaterial({ vertexColors: true, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });

  const solids = [], fabric = [], emis = [], glass = [], decals = [];
  const lights = [], glows = [];

  const groups = new Map();
  const D = new THREE.Object3D();
  function inst(key, geoFn, mat, shadow) {
    const g = { geo: geoFn(), mat: mat || MATP, m: [], c: [], shadow: shadow !== false };
    groups.set(key, g); return g;
  }
  function put(key, x, y, z, ry = 0, sx = 1, sy = 1, sz = 1, color) {
    const g = groups.get(key);
    D.position.set(x, y, z); D.rotation.set(0, ry, 0); D.scale.set(sx, sy, sz); D.updateMatrix();
    g.m.push(D.matrix.clone());
    if (color !== undefined) g.c.push(new THREE.Color(color));
  }
  const groundY = (x, z) => collide.groundAt(x, z, 100, 200).y;
  const blocker = (x, z, r, top, name) => collide.addBlocker({ x, z, r, top, name });

  // ===========================================================================
  // 2. the mall spine
  // ===========================================================================
  const CS = WORLD.churchStreet;
  const CL = (CS && CS.centerline && CS.centerline.length > 1) ? CS.centerline : [[0, -250], [0, 128]];
  const cum = [0];
  for (let i = 1; i < CL.length; i++) cum.push(cum[i - 1] + Math.hypot(CL[i][0] - CL[i - 1][0], CL[i][1] - CL[i - 1][1]));
  const MALL_LEN = cum[cum.length - 1];
  function at(s) {
    s = Math.max(0, Math.min(MALL_LEN, s));
    let i = 1; while (i < cum.length - 1 && cum[i] < s) i++;
    const a = CL[i - 1], b = CL[i], seg = cum[i] - cum[i - 1] || 1;
    const t = (s - cum[i - 1]) / seg;
    const dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz) || 1;
    return { x: a[0] + dx * t, z: a[1] + dz * t, tx: dx / L, tz: dz / L };
  }
  // signed lateral offset: + = east, − = west   (unit normal = (tz, −tx))
  function pos(s, off) { const p = at(s); return { x: p.x + off * p.tz, z: p.z - off * p.tx, tx: p.tx, tz: p.tz }; }
  const yawAlong = (tx, tz) => Math.atan2(-tz, tx);   // local +X runs down the street
  function sOf(x, z) {
    let bd = 1e9, bs = 0;
    for (let i = 1; i < CL.length; i++) {
      const a = CL[i - 1], b = CL[i], dx = b[0] - a[0], dz = b[1] - a[1], l2 = dx * dx + dz * dz || 1;
      let t = ((x - a[0]) * dx + (z - a[1]) * dz) / l2; t = Math.max(0, Math.min(1, t));
      const px = a[0] + dx * t, pz = a[1] + dz * t, d = Math.hypot(px - x, pz - z);
      if (d < bd) { bd = d; bs = cum[i - 1] + t * Math.hypot(dx, dz); }
    }
    return bs;
  }
  const CROSS = CS ? CS.crossings : {};
  const crossS = {};
  for (const k in CROSS) crossS[k] = sOf(CROSS[k][0], CROSS[k][1]);
  const BLOCKS = [['Pearl', 'Cherry'], ['Cherry', 'Bank'], ['Bank', 'College'], ['College', 'Main']]
    .filter(([a, b]) => crossS[a] !== undefined && crossS[b] !== undefined)
    .map(([a, b], i) => ({ i, a: crossS[a] + 9, b: crossS[b] - 9 }));

  class Lane {
    constructor() { this.r = []; }
    free(s, h) { for (const e of this.r) if (s - h < e[1] && s + h > e[0]) return false; return true; }
    take(s, h) { this.r.push([s - h, s + h]); }
    // nearest free slot to sIdeal within ±range; returns s or null
    slot(sIdeal, h, range = 7) {
      if (this.free(sIdeal, h)) { this.take(sIdeal, h); return sIdeal; }
      for (let d = 0.7; d <= range; d += 0.7) {
        for (const s of [sIdeal - d, sIdeal + d]) {
          if (s < 1 || s > MALL_LEN - 1) continue;
          if (this.free(s, h)) { this.take(s, h); return s; }
        }
      }
      return null;
    }
  }
  const inner = { '-1': new Lane(), '1': new Lane() };   // |off| 3.2–4.8: trees, benches, lamps, boulders
  const outer = { '-1': new Lane(), '1': new Lane() };   // |off| 5.2–6.6: planters, boards, carts
  for (const k in crossS) for (const L of [inner, outer]) { L['-1'].take(crossS[k], 9.5); L['1'].take(crossS[k], 9.5); }

  // ===========================================================================
  // 3. prototypes
  // ===========================================================================
  const IRON = 0x191a1c, IRON2 = 0x2a2c2e, WOOD = 0xa9773f, GRANITE = 0xa9a8a2, BRONZE = 0x8a5a2c;

  inst('trunk', () => cyl(0.075, 0.15, 1, 7, 0x5b4a3a, 0, 0.5, 0));   // unit height, scaled in Y
  inst('canopy', () => ico(1, 0, 0xffffff));
  const GREENS = [0x4e7a35, 0x638f3d, 0x7ea44a, 0x56833a];
  const AUTUMN = [0x9b4a35, 0xb5732c];

  inst('bench', () => {
    const p = [];
    for (const sx of [-0.82, 0.82]) {
      p.push(box(0.06, 0.44, 0.46, IRON, sx, 0.22, 0));
      p.push(box(0.1, 0.05, 0.62, IRON, sx, 0.03, 0));
      p.push(box(0.05, 0.05, 0.5, IRON, sx, 0.63, -0.02));
      p.push(box(0.05, 0.5, 0.06, IRON, sx, 0.68, 0.21));
      p.push(box(0.05, 0.09, 0.09, IRON, sx, 0.55, 0.19));
    }
    for (let i = 0; i < 4; i++) p.push(box(1.72, 0.035, 0.095, WOOD, 0, 0.44, -0.17 + i * 0.115));
    for (let i = 0; i < 4; i++) p.push(box(1.72, 0.095, 0.035, WOOD, 0, 0.53 + i * 0.11, 0.215));
    p.push(box(0.1, 0.06, 0.012, 0xc9a227, 0.3, 0.78, 0.2));   // donor plaque
    return merge(p);
  });

  inst('boulder', () => ico(1, 0, 0xffffff));

  const LAMP_H = 4.5;
  inst('lamp', () => {
    const p = [box(0.5, 0.13, 0.5, IRON2, 0, 0.065, 0), box(0.4, 0.27, 0.4, IRON2, 0, 0.265, 0),
      cyl(0.055, 0.085, 4.12, 8, IRON, 0, 2.46, 0)];
    for (let i = 0; i < 4; i++) {                      // gooseneck arc reaching out +X
      const a = (i + 0.5) / 4 * (Math.PI / 2);
      p.push(cyl(0.045, 0.045, 0.3, 6, IRON, Math.sin(a) * 0.52, LAMP_H + 0.06 + (1 - Math.cos(a)) * 0.42, 0, 0, 0, -a));
    }
    p.push(cyl(0.06, 0.3, 0.24, 8, IRON, 0.72, LAMP_H + 0.33, 0));   // hooded bell downlight
    p.push(box(0.34, 0.035, 0.035, IRON, 0.17, 3.0, 0));             // banner bracket
    p.push(box(0.05, 0.05, 0.05, IRON, 0.32, 3.0, 0));
    return merge(p);
  });

  inst('banner', () => colorize(new THREE.PlaneGeometry(0.6, 1.6), 0xffffff), MATB, false);
  function stripes(w, h, cols, canton) {
    const p = [], sh = h / cols.length;
    for (let i = 0; i < cols.length; i++) p.push(quad(w, sh, cols[i], 0, h / 2 - sh * (i + 0.5), 0));
    if (canton) p.push(quad(w * 0.42, h * 0.54, 0x1c3f7a, -w * 0.29, h * 0.23, 0.005));
    return merge(p);
  }
  inst('flagUS', () => stripes(1.1, 0.62, [0xb32026, 0xf2f2f2, 0xb32026, 0xf2f2f2, 0xb32026, 0xf2f2f2, 0xb32026], true), MATB, false);
  inst('flagPride', () => stripes(1.1, 0.62, [0xe0322a, 0xef7d20, 0xf4d03f, 0x3f9b46, 0x2a55a8, 0x74349a]), MATB, false);

  inst('bollard', () => merge([cyl(0.075, 0.085, 0.86, 8, IRON, 0, 0.43, 0), cyl(0.09, 0.09, 0.05, 8, IRON2, 0, 0.88, 0),
    cyl(0.088, 0.088, 0.07, 8, 0xd8d8d0, 0, 0.72, 0)]), MATP, false);

  const PLANKS = [0xe6e2d8, 0x8fa38c, 0x5f8f8c, 0xb3a086, 0xd8d2c4, 0x789a90];
  inst('planter', () => {                                   // unit length in X, scaled
    const p = [];
    for (const zz of [0.34, -0.34]) for (let i = 0; i < 4; i++) p.push(box(1.0, 0.2, 0.05, PLANKS[(i + (zz > 0 ? 0 : 3)) % PLANKS.length], 0, 0.11 + i * 0.215, zz));
    p.push(box(0.06, 0.86, 0.7, 0xa89a82, 0.5, 0.44, 0)); p.push(box(0.06, 0.86, 0.7, 0xa89a82, -0.5, 0.44, 0));
    p.push(box(0.98, 0.05, 0.62, 0x4a3a2c, 0, 0.88, 0));
    for (const sx of [-0.42, 0.42]) for (const sz of [-0.28, 0.28]) p.push(cyl(0.055, 0.055, 0.07, 6, IRON, sx, 0.035, sz, 0, Math.PI / 2));
    return merge(p);
  });
  inst('tuft', () => {
    const p = [];
    for (let i = 0; i < 6; i++) { const a = i * 1.05, t = 0.2 + (i % 3) * 0.07; p.push(cyl(0.0, 0.045, t * 2, 4, 0xffffff, Math.cos(a) * 0.11, t, Math.sin(a) * 0.11, 0, 0, (i % 2 ? 1 : -1) * 0.28)); }
    return merge(p);
  }, MATP, false);

  inst('aframe', () => {
    const p = [];
    for (const s of [-1, 1]) {
      p.push(box(0.9, 1.15, 0.035, 0x24272a, 0, 0.6, s * 0.14, 0, s * 0.12));
      p.push(box(0.72, 0.05, 0.008, 0xdfe6cf, 0, 0.86, s * 0.178, 0, s * 0.12));
      p.push(box(0.5, 0.04, 0.008, 0xf0c7d4, -0.06, 0.68, s * 0.19, 0, s * 0.12));
      p.push(box(0.6, 0.04, 0.008, 0xc9e2ef, 0.03, 0.5, s * 0.2, 0, s * 0.12));
    }
    return merge(p);
  }, MATP, false);

  inst('hoop', () => merge([torus(0.36, 0.032, 9, Math.PI, 0xffffff, 0, 0.44, 0),
    cyl(0.032, 0.032, 0.46, 5, 0xffffff, -0.36, 0.22, 0), cyl(0.032, 0.032, 0.46, 5, 0xffffff, 0.36, 0.22, 0)]), MATP, false);

  inst('slight', () => merge([cyl(0.07, 0.11, 5, 8, IRON, 0, 2.5, 0), box(1.25, 0.075, 0.075, IRON, 0.62, 4.94, 0),
    sph(0.3, 7, IRON2, 1.2, 4.85, 0, 0.72, 0.42, 1.0)]));

  // signals and bistro sets are merged into the static mesh instead of instanced — same
  // triangle cost at render time, two fewer draw calls.
  function addSignal(x, y, z, yaw) {
    const p = [cyl(0.09, 0.13, 5.4, 8, IRON2, x, y + 2.7, z), box(4.4, 0.1, 0.1, IRON2, oxx(x, yaw, 2.2), y + 5.25, oxz(z, yaw, 2.2), yaw)];
    for (const ax of [2.0, 3.6]) {
      p.push(box(0.3, 0.86, 0.26, IRON, oxx(x, yaw, ax), y + 4.75, oxz(z, yaw, ax), yaw));
      p.push(box(0.34, 0.06, 0.3, IRON, oxx(x, yaw, ax), y + 5.16, oxz(z, yaw, ax), yaw));
    }
    solids.push(merge(p));
  }
  function addBistro(x, y, z, yaw) {
    const TEAL = 0x2f8e88;
    const L = (a, b) => [ozx(oxx(x, yaw, a), yaw, b), ozz(oxz(z, yaw, a), yaw, b)];
    const p = [cyl(0.34, 0.34, 0.04, 10, TEAL, x, y + 0.72, z), cyl(0.03, 0.03, 0.7, 6, TEAL, x, y + 0.36, z), cyl(0.2, 0.2, 0.03, 8, TEAL, x, y + 0.02, z)];
    for (const a of [0.4, 3.6]) {
      const q = L(Math.cos(a) * 0.72, Math.sin(a) * 0.72);
      p.push(box(0.4, 0.03, 0.4, TEAL, q[0], y + 0.44, q[1], yaw - a));
      p.push(box(0.4, 0.42, 0.03, TEAL, q[0], y + 0.64, q[1], yaw - a));
      for (const s of [-1, 1]) for (const t of [-1, 1]) {
        const r2 = L(Math.cos(a) * 0.72 + s * 0.16, Math.sin(a) * 0.72 + t * 0.16);
        p.push(cyl(0.014, 0.014, 0.44, 4, TEAL, r2[0], y + 0.22, r2[1]));
      }
    }
    solids.push(merge(p));
  }

  // ===========================================================================
  // 4. helpers
  // ===========================================================================
  function addTree(x, z, y, opts = {}) {
    const h = opts.h !== undefined ? opts.h : rr(5.0, 7.0);
    const w = opts.w !== undefined ? opts.w : rr(7.0, 9.0);
    const nb = opts.blobs !== undefined ? opts.blobs : (mobile ? ri(2, 3) : ri(3, 5));
    put('trunk', x, y, z, rr(0, 6.28), rr(0.85, 1.15), h, rr(0.85, 1.15));
    const autumn = opts.autumn || chance(0.08);
    for (let i = 0; i < nb; i++) {
      const a = (i / nb) * 6.28 + rr(-0.5, 0.5), rad = i === 0 ? 0 : rr(0.14, 0.3) * w;
      const bw = w * rr(0.3, 0.44), bh = bw * rr(0.55, 0.8);
      put('canopy', x + Math.cos(a) * rad, y + h * rr(0.94, 1.12) + bh * 0.2, z + Math.sin(a) * rad,
        rr(0, 6.28), bw, bh, bw * rr(0.85, 1.15), autumn ? pick(AUTUMN) : pick(GREENS));
    }
    blocker(x, z, 0.24, y + h * 0.75, 'Tree');
    return h;
  }
  // flat cobble-sett tree pit: a ring of dark setts laid flush in the brick
  function addTreePit(x, z, y) {
    const g = new THREE.RingGeometry(0.5, 0.95, 16, 2);
    g.rotateX(-Math.PI / 2);
    const nv = g.attributes.position.count, arr = new Float32Array(nv * 3);
    for (let i = 0; i < nv; i++) { const t = 0.055 + ((i * 7) % 5) * 0.016; arr[i * 3] = t * 1.06; arr[i * 3 + 1] = t; arr[i * 3 + 2] = t * 0.92; }
    g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    decals.push(xf(g, x, y + 0.02, z));
  }
  function addTreeGuard(x, z, y) {
    const p = [];
    for (let i = 0; i < 6; i++) { const a = i / 6 * 6.28; p.push(cyl(0.018, 0.018, 1.15, 4, IRON, x + Math.cos(a) * 0.34, y + 0.58, z + Math.sin(a) * 0.34)); }
    for (const hy of [0.2, 1.1]) p.push(torus(0.34, 0.018, 9, Math.PI * 2, IRON, x, y + hy, z, 0, -Math.PI / 2));
    solids.push(merge(p));
  }
  function addStringLights(x, y, z, w, h, n) {
    for (let i = 0; i < n; i++) lights.push({ x: x + rr(-w, w), y: y + rr(-h * 0.4, h * 0.5), z: z + rr(-w, w) });
  }

  // ===========================================================================
  // 5. THE MALL
  // ===========================================================================
  let nTrees = 0, nBench = 0, nBould = 0, nLamp = 0, nBanner = 0, nFlag = 0, nBollard = 0, nGpost = 0,
    nPylon = 0, nPlanter = 0, nBowl = 0, nCart = 0, nBoard = 0, nTrash = 0, nRack = 0, nTent = 0, nBunt = 0;

  // ---- 5a. lamp posts: exactly 30, alternating sides ------------------------
  const LAMPS_PER = [8, 7, 7, 8];
  let lampToggle = 0;
  const lampSpots = [];
  BLOCKS.forEach((bl, bi) => {
    const n = LAMPS_PER[bi] || 7, span = bl.b - bl.a;
    for (let i = 0; i < n; i++) {
      const s = bl.a + span * ((i + 0.5) / n);
      const side = (lampToggle++ % 2) ? 1 : -1;
      lampSpots.push({ s, side });
      inner[side].take(s, 1.5);
    }
  });
  for (const L of lampSpots) {
    const p = pos(L.s, L.side * 4.6), y = groundY(p.x, p.z);
    const along = yawAlong(p.tx, p.tz);
    const inward = along + (L.side > 0 ? Math.PI : 0);     // gooseneck reaches toward the centre
    put('lamp', p.x, y, p.z, inward);
    collide.addSurface({ x: p.x, z: p.z, w: 0.5, d: 0.5, yaw: inward, top: y + 0.4, bottom: y, kind: 'ledge', name: 'Lamp base', grindable: true });
    blocker(p.x, p.z, 0.1, y + 4.4, 'Lamp post');
    nLamp++;
    const hx = oxx(p.x, inward, 0.72), hz = oxz(p.z, inward, 0.72);
    emis.push(disc(0.15, 8, 0xffe6b4, hx, y + LAMP_H + 0.22, hz));
    glows.push({ x: hx, y: y + LAMP_H + 0.2, z: hz, c: 0xffcf8a });
    const roll = R();
    if (roll < 0.6) {
      put('banner', oxx(p.x, inward, 0.3), y + 2.15, oxz(p.z, inward, 0.3), along, 1, 1, 1,
        pick([0x7b3f9d, 0xe4761f, 0xcf2b32, 0xc0338c, 0x3f8f45, 0xe8b823]));
      nBanner++;
    } else {
      solids.push(box(0.8, 0.035, 0.035, IRON, oxx(p.x, inward, 0.42), y + 3.22, oxz(p.z, inward, 0.42), inward, 0, 0.32));
      put(roll < 0.85 ? 'flagPride' : 'flagUS', oxx(p.x, inward, 0.85), y + 3.02, oxz(p.z, inward, 0.85), along);
      nFlag++;
    }
  }

  // ---- 5b. trees, ~6 m rhythm, alternating sides, 2–3 gaps per block ---------
  BLOCKS.forEach((bl) => {
    const dense = bl.i === 1 || bl.i === 2;
    const step = dense ? 5.8 : 6.6;
    const nSlots = Math.max(1, Math.floor((bl.b - bl.a) / step));
    const gaps = new Set();
    for (let k = 0; k < ri(2, 3); k++) gaps.add(ri(0, nSlots - 1));
    for (let i = 0, s = bl.a + 3; s < bl.b - 3; s += step, i++) {
      if (gaps.has(i)) continue;
      const side = (i % 2) ? 1 : -1;
      const ss = inner[side].slot(s + rr(-0.5, 0.5), 2.2, 3.5);
      if (ss === null) continue;
      const p = pos(ss, side * rr(3.8, 4.4)), y = groundY(p.x, p.z);
      addTreePit(p.x, p.z, y);
      const h = addTree(p.x, p.z, y, { h: rr(5.2, 6.9), w: rr(7, 9) });
      if (chance(0.3)) addTreeGuard(p.x, p.z, y);
      if (!mobile || chance(0.5)) addStringLights(p.x, y + h + 0.6, p.z, 2.1, 1.4, mobile ? 5 : 9);
      nTrees++;
    }
  });

  // ---- 5c. benches, boulders, pylons, trash, bowls, racks -------------------
  const insS = sOf(8.4, -102.6);      // Insomnia Cookies, 84 Church (east)
  const bjS = sOf(-0.1, -311);        // Halvorson's, 16 Church (east)
  const leapS = sOf(5, -60);
  const benjS = sOf(2.4, -260.7);     // Ben & Jerry's

  function boulderCluster(s, side, tag) {
    const n = ri(2, 3);
    const base = pos(s, side * rr(3.6, 4.4));
    for (let i = 0; i < n; i++) {
      const a = i / n * 6.28 + rr(0, 1), d = i === 0 ? 0 : rr(0.75, 1.35);
      const x = base.x + Math.cos(a) * d, z = base.z + Math.sin(a) * d, y = groundY(x, z);
      const h = rr(0.6, 1.15), w = h * rr(1.1, 1.7), dd = h * rr(1.0, 1.6);
      put('boulder', x, y + h * 0.42, z, rr(0, 6.28), w, h * 0.92, dd, pick([0x9a8f7e, 0x86796a, 0xa89985, 0x8f8474]));
      collide.addSurface({ x, z, w: w * 1.3, d: dd * 1.3, yaw: 0, top: y + h * 0.95, bottom: y, kind: 'ledge', name: tag || 'Boulder', grindable: true });
      nBould++;
    }
    return base;
  }

  function addBikeRack(x, z, y, yaw, n) {
    const red = chance(0.3);
    for (let i = 0; i < n; i++) {
      const hx = oxx(x, yaw, (i - (n - 1) / 2) * 0.85), hz = oxz(z, yaw, (i - (n - 1) / 2) * 0.85);
      const ry = yaw + Math.PI / 2;
      put('hoop', hx, y, hz, ry, 1, 1, 1, red ? 0xa8302c : IRON);
      collide.addEdge({ ax: oxx(hx, ry, -0.3), ay: y + 0.79, az: oxz(hz, ry, -0.3), bx: oxx(hx, ry, 0.3), by: y + 0.79, bz: oxz(hz, ry, 0.3), kind: 'rail', name: 'Bike rack' });
      blocker(hx, hz, 0.16, y + 0.78, 'Bike rack');
    }
    nRack++;
    if (chance(0.55)) addParkedBike(ozx(x, yaw, 0.5), ozz(z, yaw, 0.5), y, yaw);
  }
  function addParkedBike(x, z, y, yaw) {
    const c = pick([0x2a5c8a, 0x8a2a2a, 0x2f6f45, 0xd9d2c4]), p = [];
    for (const d of [-0.5, 0.5]) p.push(torus(0.33, 0.026, 10, Math.PI * 2, 0x22242a, oxx(x, yaw, d), y + 0.33, oxz(z, yaw, d), yaw + Math.PI / 2));
    p.push(box(0.9, 0.05, 0.05, c, x, y + 0.6, z, yaw));
    p.push(box(0.05, 0.42, 0.05, c, oxx(x, yaw, -0.18), y + 0.55, oxz(z, yaw, -0.18), yaw, 0, 0.3));
    p.push(box(0.05, 0.5, 0.05, c, oxx(x, yaw, 0.44), y + 0.6, oxz(z, yaw, 0.44), yaw, 0, -0.2));
    p.push(box(0.1, 0.05, 0.42, 0x1b1b1d, oxx(x, yaw, 0.5), y + 0.88, oxz(z, yaw, 0.5), yaw));
    p.push(box(0.24, 0.06, 0.1, 0x1b1b1d, oxx(x, yaw, -0.12), y + 0.78, oxz(z, yaw, -0.12), yaw));
    solids.push(merge(p));
    blocker(x, z, 0.3, y + 0.7, 'Bike');
  }

  BLOCKS.forEach((bl) => {
    const span = bl.b - bl.a, dense = bl.i === 1 || bl.i === 2;
    // benches, 4–6 per block, often in back-to-back pairs
    const nb = ri(5, 6);
    for (let i = 0; i < nb; i++) {
      const side = (i % 2) ? 1 : -1;
      const s = inner[side].slot(bl.a + span * ((i + rr(0.15, 0.85)) / nb), 1.6, 9);
      if (s === null) continue;
      const pairs = chance(0.4) ? 2 : 1;
      const flip = chance(0.5);
      for (let k = 0; k < pairs; k++) {
        const p = pos(s, side * (3.4 + k * 0.62 + rr(0, 0.5))), y = groundY(p.x, p.z);
        const yaw = yawAlong(p.tx, p.tz) + ((k === 1) !== flip ? Math.PI : 0);
        put('bench', p.x, y, p.z, yaw);
        collide.addSurface({ x: p.x, z: p.z, w: 1.8, d: 0.5, yaw, top: y + 0.45, bottom: y, kind: 'bench', name: 'Church St bench', grindable: true });
        nBench++;
      }
    }
    // boulders, ~2 clusters per block
    for (let i = 0; i < 2; i++) {
      const side = (i % 2) ? -1 : 1;
      const s = inner[side].slot(bl.a + span * ((i + rr(0.2, 0.8)) / 2), 2.0, 12);
      if (s === null) continue;
      boulderCluster(s, side);
    }
    // Marketplace directional pylons, ~2 per block
    for (let i = 0; i < 2; i++) {
      const side = (i % 2) ? 1 : -1;
      const s = inner[side].slot(bl.a + span * ((i + rr(0.25, 0.75)) / 2), 0.9, 12);
      if (s === null) continue;
      const p = pos(s, side * 4.1), y = groundY(p.x, p.z), yaw = yawAlong(p.tx, p.tz);
      solids.push(merge([
        cyl(0.13, 0.2, 1.55, 4, 0x6b2b30, p.x, y + 0.775, p.z, yaw + 0.785),
        cyl(0.0, 0.16, 0.2, 4, 0x6b2b30, p.x, y + 1.63, p.z, yaw + 0.785),
        box(0.03, 0.5, 0.34, 0xe8e2d4, ozx(p.x, yaw, -0.16), y + 1.15, ozz(p.z, yaw, -0.16), yaw),
        box(0.03, 0.5, 0.34, 0xe8e2d4, ozx(p.x, yaw, 0.16), y + 1.15, ozz(p.z, yaw, 0.16), yaw),
      ]));
      blocker(p.x, p.z, 0.22, y + 1.7, 'Marketplace pylon');
      nPylon++;
    }
    // trash + recycling pairs, ~3 per block
    for (let i = 0; i < 3; i++) {
      const side = (i % 2) ? 1 : -1;
      const s = inner[side].slot(bl.a + span * ((i + rr(0.2, 0.8)) / 3), 1.05, 12);
      if (s === null) continue;
      const p = pos(s, side * 4.3), y = groundY(p.x, p.z), yaw = yawAlong(p.tx, p.tz);
      for (let k = 0; k < 2; k++) {
        const bx = oxx(p.x, yaw, k ? 0.4 : -0.4), bz = oxz(p.z, yaw, k ? 0.4 : -0.4);
        solids.push(merge([cyl(0.27, 0.24, 0.94, 10, k ? 0x1d3a2b : IRON, bx, y + 0.47, bz), cyl(0.3, 0.3, 0.06, 10, IRON2, bx, y + 0.97, bz)]));
        blocker(bx, bz, 0.3, y + 0.95, 'Trash');
      }
      nTrash++;
    }
    // rusted-steel bowl planters, ~3 per block
    for (let i = 0; i < 3; i++) {
      const side = (i % 2) ? -1 : 1;
      const s = inner[side].slot(bl.a + span * ((i + rr(0.15, 0.85)) / 3), 0.85, 12);
      if (s === null) continue;
      const p = pos(s, side * rr(3.6, 4.6)), y = groundY(p.x, p.z);
      solids.push(merge([cyl(0.46, 0.3, 0.58, 10, 0x53392c, p.x, y + 0.29, p.z), cyl(0.44, 0.44, 0.05, 10, 0x3b3025, p.x, y + 0.58, p.z)]));
      put('tuft', p.x, y + 0.58, p.z, rr(0, 6.28), rr(0.8, 1.2), rr(0.7, 1.1), rr(0.8, 1.2), pick([0x6f9a45, 0x7fae55, 0xa8b34a, 0x8f5f9e, 0xc9a13a]));
      blocker(p.x, p.z, 0.48, y + 0.6, 'Bowl planter');
      nBowl++;
    }
    // bike racks on the mall
    for (let i = 0; i < (dense ? 2 : 1); i++) {
      const side = (i % 2) ? 1 : -1;
      const s = inner[side].slot(bl.a + span * rr(0.15, 0.85), 1.3, 12);
      if (s === null) continue;
      const p = pos(s, side * 4.2), y = groundY(p.x, p.z);
      addBikeRack(p.x, p.z, y, yawAlong(p.tx, p.tz), 2);
    }
  });

  // the boulder cluster in front of Insomnia Cookies
  {
    inner['1'].take(insS, 2.6);
    const b = boulderCluster(insS, 1, 'Insomnia boulders');
    spots.push({ name: 'Insomnia boulders', x: b.x, z: b.z, r: 5, bonus: 150 });
  }

  // ---- 5d. outer lane: planter runs, sandwich boards, carts, tents ----------
  function addPlanterRun(s, side, count, len) {
    for (let i = 0; i < count; i++) {
      const ss = s + (i - (count - 1) / 2) * (len + 0.16);
      const p = pos(ss, side * rr(5.6, 6.2)), y = groundY(p.x, p.z), yaw = yawAlong(p.tx, p.tz);
      put('planter', p.x, y, p.z, yaw, len, 1, 1);
      collide.addSurface({ x: p.x, z: p.z, w: len, d: 0.75, yaw, top: y + 0.9, bottom: y, kind: 'planter', name: 'Planter', grindable: true });
      const nt = Math.max(1, Math.round(len / 0.9));
      for (let k = 0; k < nt; k++) {
        const t = ((k + 0.5) / nt - 0.5) * len;
        put('tuft', oxx(p.x, yaw, t), y + 0.9, oxz(p.z, yaw, t), rr(0, 6.28), rr(0.7, 1.1), rr(0.7, 1.2), rr(0.7, 1.1),
          pick([0x6f9a45, 0x7fae55, 0x8fb556, 0xa8b34a, 0x6f9a45, 0x7fae55, 0xc9a13a, 0x8f5f9e, 0xcf5f6a]));
      }
      nPlanter++;
    }
    outer[side].take(s, count * (len + 0.16) / 2 + 0.5);
  }
  addPlanterRun(benjS, 1, 3, 1.5);          // Ben & Jerry's has three

  function addVendorCart(x, z, y, yaw, strung) {
    const striped = chance(0.5);
    const accent = striped ? 0x2f7a46 : pick([0xc23b34, 0x2f6ea8, 0xe0932a]);
    const p = [
      box(1.65, 0.85, 0.9, 0xe9e3d6, x, y + 0.5, z, yaw),
      box(1.85, 0.07, 1.05, WOOD, x, y + 1.17, z, yaw),
      box(0.66, 0.46, 0.03, 0x24272a, ozx(x, yaw, 0.5), y + 0.62, ozz(z, yaw, 0.5), yaw),
    ];
    for (const sx of [-0.78, 0.78]) for (const sz of [-0.42, 0.42]) {
      p.push(cyl(0.028, 0.028, 1.05, 5, 0xd8d2c4, ozx(oxx(x, yaw, sx), yaw, sz), y + 1.72, ozz(oxz(z, yaw, sx), yaw, sz)));
    }
    for (let i = 0; i < 6; i++) {
      const t = (-0.5 + (i + 0.5) / 6) * 1.95;
      p.push(box(0.34, 0.05, 1.25, i % 2 ? accent : 0xf2efe6, oxx(x, yaw, t), y + 2.3 - Math.abs(t) * 0.22, oxz(z, yaw, t), yaw, 0, t > 0 ? -0.22 : 0.22));
    }
    for (const sx of [-0.6, 0.6]) p.push(cyl(0.17, 0.17, 0.07, 8, 0x1b1b1d, oxx(x, yaw, sx), y + 0.17, oxz(z, yaw, sx), yaw, Math.PI / 2));
    solids.push(merge(p));
    collide.addSurface({ x, z, w: 1.9, d: 1.1, yaw, top: y + 1.2, bottom: y, kind: 'ledge', name: 'Vendor cart', grindable: false });
    const bx = oxx(x, yaw, 1.5), bz = oxz(z, yaw, 1.5), by = groundY(bx, bz);
    put('aframe', bx, by, bz, yaw + rr(-0.5, 0.5));
    blocker(bx, bz, 0.3, by + 1.15, 'Sandwich board');
    nBoard++;
    if (strung) for (let i = 0; i < 14; i++) { const t = rr(-0.95, 0.95); lights.push({ x: oxx(x, yaw, t), y: y + rr(2.05, 2.35), z: oxz(z, yaw, t) }); }
    nCart++;
  }

  BLOCKS.forEach((bl) => {
    const span = bl.b - bl.a;
    for (let i = 0; i < 3; i++) {                          // planter runs (~25% of storefronts)
      const side = (i % 2) ? 1 : -1;
      const cnt = ri(1, 3), len = rr(1.3, 2.3);
      const half = cnt * (len + 0.2) / 2 + 0.5;
      const s = outer[side].slot(bl.a + span * ((i + rr(0.15, 0.85)) / 3), half, 10);
      if (s === null) continue;
      addPlanterRun(s, side, cnt, len);
    }
    const nab = Math.max(3, Math.round(span / 11));        // sandwich boards at the 2.7 m line
    for (let i = 0; i < nab; i++) {
      const side = (i % 2) ? 1 : -1;
      const s = outer[side].slot(bl.a + span * ((i + rr(0.2, 0.8)) / nab), 0.65, 8);
      if (s === null) continue;
      const p = pos(s, side * rr(6.2, 6.6)), y = groundY(p.x, p.z);
      put('aframe', p.x, y, p.z, yawAlong(p.tx, p.tz) + rr(-0.4, 0.4));
      blocker(p.x, p.z, 0.3, y + 1.15, 'Sandwich board');
      nBoard++;
    }
    const nc = (bl.i === 1 || bl.i === 2) ? 4 : 2;         // vendor carts, denser mid-mall
    for (let i = 0; i < nc; i++) {
      const side = (i % 2) ? -1 : 1;
      const s = outer[side].slot(bl.a + span * ((i + rr(0.2, 0.8)) / nc), 1.6, 12);
      if (s === null) continue;
      const p = pos(s, side * rr(5.2, 5.9)), y = groundY(p.x, p.z);
      addVendorCart(p.x, p.z, y, yawAlong(p.tx, p.tz), nCart === 2);
    }
  });

  // retail tents (10'×10', white, open-sided) — one in block 1, one in block 3
  for (const bi of [0, 2]) {
    const bl = BLOCKS[bi]; if (!bl) continue;
    const side = bi === 0 ? -1 : 1;
    const s = outer[side].slot(bl.a + (bl.b - bl.a) * (bi === 0 ? 0.34 : 0.62), 2.2, 15);
    if (s === null) continue;
    const p = pos(s, side * 5.3), y = groundY(p.x, p.z), yaw = yawAlong(p.tx, p.tz);
    const g = [];
    for (const sx of [-1.4, 1.4]) for (const sz of [-1.4, 1.4]) {
      const wx = ozx(oxx(p.x, yaw, sx), yaw, sz), wz = ozz(oxz(p.z, yaw, sx), yaw, sz);
      g.push(cyl(0.035, 0.035, 2.4, 5, 0xcfcac0, wx, y + 1.2, wz));
      blocker(wx, wz, 0.09, y + 2.4, 'Tent');
    }
    solids.push(merge(g));
    fabric.push(merge([cyl(0.0, 2.1, 0.62, 4, 0xf4f2ee, p.x, y + 2.71, p.z, yaw + 0.785),
      tube(2.1, 2.1, 0.06, 4, 0xe8e5df, p.x, y + 2.4, p.z, yaw + 0.785)]));
    nTent++;
  }

  // ---- 5e. bollards + squat granite posts at each cross-street mouth --------
  for (const k in crossS) {
    const s = crossS[k];
    for (const d of [-6.5, 6.5]) {
      const line = s + d;
      if (line < 1 || line > MALL_LEN - 1) continue;
      for (let o = -8.4; o <= 8.41; o += 1.5) {
        if (Math.abs(o) < 2.2) continue;                   // removable ones are pulled at 7 a.m.
        const p = pos(line, o), y = groundY(p.x, p.z);
        put('bollard', p.x, y, p.z, 0);
        blocker(p.x, p.z, 0.11, y + 0.9, 'Bollard');
        nBollard++;
      }
      for (const o of [-5.6, -2.9, 2.9, 5.6]) {            // fixed 3.5 ft granite posts
        if (chance(0.25)) continue;
        const p = pos(line + (d < 0 ? -1.6 : 1.6), o + rr(-0.3, 0.3)), y = groundY(p.x, p.z);
        const yaw = yawAlong(p.tx, p.tz);
        solids.push(merge([box(0.3, 0.98, 0.3, GRANITE, p.x, y + 0.49, p.z, yaw), box(0.24, 0.08, 0.24, 0xb8b7b0, p.x, y + 1.01, p.z, yaw)]));
        blocker(p.x, p.z, 0.21, y + 1.05, 'Granite post');
        nGpost++;
      }
    }
  }

  // ---- 5f. pennant bunting across the street --------------------------------
  const PENNANT = [0xd7443c, 0xe89a2c, 0xf0d24a, 0x4f9c4a, 0x2f77b8, 0x8a4fa8, 0xe06fa0, 0xf4f0e6];
  function buntingRun(s) {
    const H = 5.1, SAG = 0.95, N = 30;
    const a = pos(s, -7.4), b = pos(s + rr(-2, 2), 7.4);
    const ya = groundY(a.x, a.z) + H, yb = groundY(b.x, b.z) + H;
    const P = (t) => ({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, y: ya + (yb - ya) * t - Math.sin(Math.PI * t) * SAG });
    const g = [];
    const dirx = (b.x - a.x) / N * 0.9, dirz = (b.z - a.z) / N * 0.9;
    for (let i = 0; i < N; i++) {
      const q = P((i + 0.5) / N);
      const tri = new THREE.BufferGeometry();
      tri.setAttribute('position', new THREE.BufferAttribute(new Float32Array([
        q.x - dirx / 2, q.y, q.z - dirz / 2,
        q.x + dirx / 2, q.y, q.z + dirz / 2,
        q.x, q.y - 0.38, q.z]), 3));
      tri.computeVertexNormals();
      g.push(colorize(tri, PENNANT[i % PENNANT.length]));
    }
    for (let i = 0; i < 10; i++) {
      const q0 = P(i / 10), q1 = P((i + 1) / 10);
      const len = Math.hypot(q1.x - q0.x, q1.y - q0.y, q1.z - q0.z) || 1;
      g.push(box(len, 0.02, 0.02, 0x2b2b2b, (q0.x + q1.x) / 2, (q0.y + q1.y) / 2, (q0.z + q1.z) / 2,
        Math.atan2(-(q1.z - q0.z), q1.x - q0.x), 0, Math.asin((q1.y - q0.y) / len)));
    }
    fabric.push(merge(g)); nBunt++;
  }
  BLOCKS.forEach((bl) => {
    const span = bl.b - bl.a;
    buntingRun(bl.a + span * 0.32);
    if (bl.i === 1 || bl.i === 2) buntingRun(bl.a + span * 0.72);
  });

  // (the granite meridian line itself is drawn by ground.js — don't double it up)

  // ---- 5g. subsurface-vault hatch plates + engraved memorial pavers ---------
  for (const [n, side] of [[2, 1], [71, -1], [131, -1], [148, 1]]) {
    const p = pos(sOf(0, -311 + (n - 16) * 3.065), side * rr(5.6, 6.4)), y = groundY(p.x, p.z);
    const yaw = yawAlong(p.tx, p.tz);
    decals.push(box(0.78, 0.03, 0.64, 0x6d6a63, p.x, y + 0.012, p.z, yaw));
    decals.push(box(0.66, 0.035, 0.53, 0x5d5a54, p.x, y + 0.017, p.z, yaw));
  }
  for (let i = 0; i < 26; i++) {
    const off = rr(-6.2, 6.2);
    if (Math.abs(off) < 2.2) continue;
    const p = pos(rr(6, MALL_LEN - 6), off), y = groundY(p.x, p.z);
    decals.push(box(0.15, 0.02, 0.15, pick([0x9c9a92, 0x87857e, 0xa8a49a]), p.x, y + 0.011, p.z, yawAlong(p.tx, p.tz)));
  }

  // ---- 5i. the ski-lift chair bench + the fish drinking fountain ------------
  {
    const s = (crossS.Pearl !== undefined ? crossS.Pearl : 0) + 15;
    const p = pos(s, -4.2), y = groundY(p.x, p.z), yaw = yawAlong(p.tx, p.tz);
    const CHAIR = 0xb8322c, g = [];
    g.push(cyl(0.1, 0.15, 2.3, 6, IRON, p.x, y + 1.15, p.z));
    g.push(box(2.7, 0.09, 0.09, IRON, p.x, y + 2.25, p.z, yaw));
    for (const sx of [-0.65, 0.65]) {
      const bx = oxx(p.x, yaw, sx), bz = oxz(p.z, yaw, sx);
      g.push(box(0.06, 1.5, 0.06, IRON, ozx(bx, yaw, -0.25), y + 1.45, ozz(bz, yaw, -0.25), yaw));
      g.push(box(1.15, 0.07, 0.5, CHAIR, bx, y + 0.52, bz, yaw));
      g.push(box(1.15, 0.62, 0.07, CHAIR, ozx(bx, yaw, -0.22), y + 0.85, ozz(bz, yaw, -0.22), yaw));
      g.push(box(1.2, 0.05, 0.05, IRON, bx, y + 0.28, bz, yaw));
    }
    solids.push(merge(g));
    collide.addSurface({ x: p.x, z: p.z, w: 2.5, d: 0.5, yaw, top: y + 0.55, bottom: y, kind: 'bench', name: 'Ski-lift bench', grindable: true });
    blocker(p.x, p.z, 0.2, y + 2.3, 'Ski-lift bench');
    spots.push({ name: 'Ski-lift bench', x: p.x, z: p.z, r: 5, bonus: 150 });
    inner['-1'].take(s, 2.2);
  }
  {
    const dw = (WORLD.props || []).filter(q => q.kind === 'amenity:drinking_water' && q.z < -250);
    const s = dw.length ? sOf(dw[0].x, dw[0].z) : (crossS.Pearl || 0) + 26;
    const p = pos(s, 4.0), y = groundY(p.x, p.z), yaw = yawAlong(p.tx, p.tz);
    const FISH = 0x3d7d7a;
    solids.push(merge([
      box(0.34, 0.86, 0.34, 0x6a6a66, p.x, y + 0.43, p.z, yaw),
      cyl(0.3, 0.26, 0.12, 10, 0x8c8c86, p.x, y + 0.92, p.z),
      sph(0.5, 8, FISH, p.x, y + 1.2, p.z, 0.55, 0.34, 0.24),
      cyl(0.0, 0.26, 0.32, 5, FISH, oxx(p.x, yaw, -0.52), y + 1.24, oxz(p.z, yaw, -0.52), yaw, 0, Math.PI / 2),
      box(0.16, 0.13, 0.02, 0xf0f0e8, oxx(p.x, yaw, 0.22), y + 1.3, oxz(p.z, yaw, 0.22), yaw),
    ]));
    blocker(p.x, p.z, 0.35, y + 1.4, 'Fish fountain');
    inner['1'].take(s, 1.6);
  }

  // ---- 5j. "Big Joe" Burrell, east side of the top block, 16 Church ---------
  {
    inner['1'].take(bjS, 2.2);
    const p = pos(bjS, 5.4), y = groundY(p.x, p.z);
    const yaw = yawAlong(p.tx, p.tz) - Math.PI / 2;    // local +X = west, so his arm points into the street
    const L = (lx, ly, lz) => [p.x + lx * Math.cos(yaw) + lz * Math.sin(yaw), y + ly, p.z - lx * Math.sin(yaw) + lz * Math.cos(yaw)];
    const g = [];
    const B = (w, h, d, hex, lx, ly, lz, rz) => { const q = L(lx, ly, lz); g.push(box(w, h, d, hex, q[0], q[1], q[2], yaw, 0, rz)); };
    g.push(box(1.6, 0.25, 1.6, 0xb4b2ab, p.x, y + 0.125, p.z, yaw));
    g.push(box(1.5, 0.02, 1.5, 0xa6a49d, p.x, y + 0.255, p.z, yaw));
    B(0.24, 0.014, 0.16, 0x9b7736, -0.4, 0.27, 0.32);            // bronze plaques, flush
    B(0.24, 0.014, 0.16, 0x9b7736, 0.36, 0.27, 0.34);
    collide.addSurface({ x: p.x, z: p.z, w: 1.6, d: 1.6, yaw, top: y + 0.25, bottom: y, kind: 'ledge', name: "Big Joe's slab", grindable: true, allEdges: true });
    // a large man in a suit: dark trouser legs, broad jacket, hat-less head on a neck
    B(0.22, 0.8, 0.26, 0x54371a, -0.2, 0.65, 0);                 // legs
    B(0.22, 0.8, 0.26, 0x54371a, 0.2, 0.65, 0);
    B(0.28, 0.1, 0.34, 0x4a2f16, -0.2, 0.3, 0.06);               // shoes
    B(0.28, 0.1, 0.34, 0x4a2f16, 0.2, 0.3, 0.06);
    B(0.76, 0.44, 0.46, 0x8a5a2c, 0, 1.24, 0);                    // jacket skirt
    B(0.8, 0.52, 0.46, BRONZE, 0, 1.7, 0);                        // chest
    B(0.16, 0.5, 0.06, 0x6b4520, 0, 1.72, 0.24);                  // lapel gap
    B(0.86, 0.16, 0.48, 0x93602f, 0, 1.98, 0);                    // shoulders
    B(0.18, 0.1, 0.2, 0x8a5a2c, 0, 2.1, 0);                       // neck
    B(0.3, 0.34, 0.3, 0x9a6533, 0, 2.32, 0.02);                   // head
    B(0.32, 0.06, 0.32, 0x7a5228, 0, 2.51, 0.02);
    B(0.17, 0.5, 0.17, BRONZE, -0.4, 1.72, 0.12, 0.3);            // left arm, up to the mouthpiece
    B(0.15, 0.46, 0.15, BRONZE, -0.34, 2.1, 0.22, -0.55);
    g.push(cyl(0.05, 0.065, 0.5, 6, 0xb98a2e, ...L(-0.12, 1.98, 0.26), yaw, 0, 0.35));   // sax neck
    g.push(cyl(0.07, 0.095, 0.5, 6, 0xc79a35, ...L(-0.24, 1.56, 0.34), yaw, 0, 0.12));   // body
    g.push(cyl(0.23, 0.09, 0.34, 8, 0xcfa03c, ...L(-0.34, 1.26, 0.48), yaw, Math.PI / 2 - 0.4, 0)); // bell
    B(0.72, 0.16, 0.16, BRONZE, 0.68, 1.84, 0);                   // right arm, straight out over the street
    B(0.22, 0.09, 0.09, 0x9a6533, 1.12, 1.84, 0);                 // pointing finger
    solids.push(merge(g));
    blocker(p.x, p.z, 0.4, y + 2.3, 'Big Joe Burrell');
    spots.push({ name: "Big Joe's slab", x: p.x, z: p.z, r: 6, bonus: 250 });
  }

  // ---- 5k. "The Leapfroggers" ----------------------------------------------
  {
    inner['1'].take(leapS, 1.6);
    const p = pos(leapS, 6.0), y = groundY(p.x, p.z), yaw = yawAlong(p.tx, p.tz);
    const V = 0x3f7a60, V2 = 0x6aa886, HL = 0x8a6a3a;
    const A = (w, h, d, hex, lx, ly, lz, rz, rx) => box(w, h, d, hex, ozx(oxx(p.x, yaw, lx), yaw, lz), y + ly, ozz(oxz(p.z, yaw, lx), yaw, lz), yaw, rx, rz);
    solids.push(merge([
      disc(0.8, 16, 0x6a655c, p.x, y + 0.02, p.z),
      // crouched child: head down, hands on knees, back flat
      A(0.44, 0.22, 0.72, V, 0, 0.66, 0),                    // flat back
      A(0.2, 0.22, 0.2, V, 0, 0.5, -0.48),                   // head, tucked down
      A(0.11, 0.42, 0.12, V, -0.17, 0.4, -0.24),             // arms to the knees
      A(0.11, 0.42, 0.12, V, 0.17, 0.4, -0.24),
      A(0.14, 0.5, 0.18, V, -0.15, 0.27, 0.26),              // legs
      A(0.14, 0.5, 0.18, V, 0.15, 0.27, 0.26),
      // vaulting child, clearly above with daylight between them
      A(0.34, 0.2, 0.48, V2, 0, 1.13, -0.06),
      A(0.19, 0.2, 0.19, HL, 0, 1.2, -0.44),                 // head up, mouth open
      A(0.1, 0.44, 0.1, V2, -0.25, 0.94, -0.06, 0.2),        // arms braced on the crouched back
      A(0.1, 0.44, 0.1, V2, 0.25, 0.94, -0.06, -0.2),
      A(0.12, 0.12, 0.58, V2, -0.21, 1.23, 0.42, 0, -0.55),  // legs kicked wide and trailing
      A(0.12, 0.12, 0.58, V2, 0.21, 1.23, 0.42, 0, -0.55),
    ]));
    blocker(p.x, p.z, 0.5, y + 1.4, 'The Leapfroggers');
  }

  // ---- 5l. the two globe pavers in front of City Hall ----------------------
  {
    const tex = globeTexture();
    const MATGL = new THREE.MeshLambertMaterial({ map: tex, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
    const parts = []; let cx0 = 0, cz0 = 0;
    [86, 97].forEach((zz, i) => {
      const p = pos(sOf(0, zz), -2.9), y = groundY(p.x, p.z);
      const g = new THREE.CircleGeometry(2.25, 28);
      const uv = g.attributes.uv;
      for (let k = 0; k < uv.count; k++) uv.setX(k, uv.getX(k) * 0.5 + (i ? 0.5 : 0));
      g.rotateX(-Math.PI / 2); g.translate(p.x, y + 0.01, p.z);
      parts.push(g);
      cx0 += p.x / 2; cz0 += p.z / 2;
    });
    const m = new THREE.Mesh(mergeUV(parts), MATGL); m.name = 'props:globes'; m.receiveShadow = true; scene.add(m);
    spots.push({ name: 'Globe pavers', x: cx0, z: cz0, r: 7, bonus: 200 });
  }
  function mergeUV(list) {
    let total = 0; const gs = [];
    for (let g of list) { if (g.index) g = g.toNonIndexed(); gs.push(g); total += g.attributes.position.count; }
    const p = new Float32Array(total * 3), n = new Float32Array(total * 3), uv = new Float32Array(total * 2);
    let o = 0;
    for (const g of gs) {
      const c = g.attributes.position.count;
      p.set(g.attributes.position.array, o * 3); n.set(g.attributes.normal.array, o * 3); uv.set(g.attributes.uv.array, o * 2);
      o += c;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(p, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(n, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    return geo;
  }
  function globeTexture() {
    const c = document.createElement('canvas'); c.width = 512; c.height = 256;
    const g = c.getContext('2d');
    g.fillStyle = '#c9c2b2'; g.fillRect(0, 0, 512, 256);
    const blob = (cx, cy, r, pts, seed) => {
      let a = seed;
      const nx = () => { a = (a * 1103515245 + 12345) & 0x7fffffff; return a / 0x7fffffff; };
      g.beginPath();
      for (let i = 0; i <= pts; i++) {
        const t = i / pts * Math.PI * 2, rad = r * (0.6 + nx() * 0.62);
        const x = cx + Math.cos(t) * rad, y = cy + Math.sin(t) * rad * 0.85;
        if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
      }
      g.closePath(); g.fill();
    };
    for (let half = 0; half < 2; half++) {
      const ox = half * 256;
      g.save(); g.beginPath(); g.arc(ox + 128, 128, 123, 0, 6.3); g.clip();
      g.fillStyle = '#d6cfbe'; g.fillRect(ox, 0, 256, 256);
      g.strokeStyle = 'rgba(120,118,108,0.4)'; g.lineWidth = 1.5;
      for (let i = 1; i < 5; i++) { g.beginPath(); g.moveTo(ox, i * 51); g.lineTo(ox + 256, i * 51); g.stroke(); }
      for (let i = 1; i < 5; i++) { g.beginPath(); g.ellipse(ox + 128, 128, Math.abs(128 - i * 51) * 1.55 + 6, 123, 0, 0, 6.3); g.stroke(); }
      g.fillStyle = '#5f6b57';
      if (half === 0) { blob(ox + 112, 74, 46, 9, 7); blob(ox + 128, 168, 30, 8, 31); blob(ox + 120, 122, 15, 6, 55); blob(ox + 60, 44, 20, 7, 91); }
      else { blob(ox + 118, 66, 40, 9, 13); blob(ox + 130, 150, 34, 8, 47); blob(ox + 186, 96, 38, 9, 71); blob(ox + 206, 190, 20, 7, 103); blob(ox + 72, 200, 14, 6, 131); }
      g.restore();
      g.strokeStyle = '#8f8878'; g.lineWidth = 4; g.beginPath(); g.arc(ox + 128, 128, 123, 0, 6.3); g.stroke();
    }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
    return t;
  }

  // ===========================================================================
  // 6. THE REST OF DOWNTOWN
  // ===========================================================================
  const play = ctx.play;
  const inPlay = (x, z, m = 6) => x > play.minX + m && x < play.maxX - m && z > play.minZ + m && z < play.maxZ - m;

  const bldg = (WORLD.buildings || []).map(b => {
    let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
    for (const q of b.pts) { if (q[0] < x0) x0 = q[0]; if (q[0] > x1) x1 = q[0]; if (q[1] < z0) z0 = q[1]; if (q[1] > z1) z1 = q[1]; }
    return { pts: b.pts, x0, x1, z0, z1 };
  });
  function inBuilding(x, z, pad = 0.6) {
    for (const b of bldg) {
      if (x < b.x0 - pad || x > b.x1 + pad || z < b.z0 - pad || z > b.z1 + pad) continue;
      const p = b.pts; let ins = false;
      for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
        const xi = p[i][0], zi = p[i][1], xj = p[j][0], zj = p[j][1];
        if (((zi > z) !== (zj > z)) && (x < (xj - xi) * (z - zi) / (zj - zi) + xi)) ins = !ins;
      }
      if (ins) return true;
    }
    return false;
  }

  const WKIND = { primary: 12, secondary: 11, tertiary: 10, unclassified: 9, residential: 8, service: 6 };
  const roadW = (r) => r.width || WKIND[r.kind] || 8;
  const carRoads = (WORLD.roads || []).filter(r => !['footway', 'steps', 'path', 'cycleway', 'pedestrian'].includes(r.kind) && r.pts.length > 1);
  const segs = [];
  for (const r of carRoads) for (let i = 1; i < r.pts.length; i++) segs.push([r.pts[i - 1][0], r.pts[i - 1][1], r.pts[i][0], r.pts[i][1], roadW(r) / 2]);
  function nearestSeg(x, z) {
    let bd = 1e9, bt = [1, 0], bw = 5;
    for (const s of segs) {
      const dx = s[2] - s[0], dz = s[3] - s[1], l2 = dx * dx + dz * dz || 1;
      let t = ((x - s[0]) * dx + (z - s[1]) * dz) / l2; t = t < 0 ? 0 : t > 1 ? 1 : t;
      const d = Math.hypot(s[0] + dx * t - x, s[1] + dz * t - z);
      if (d < bd) { bd = d; const L = Math.hypot(dx, dz) || 1; bt = [dx / L, dz / L]; bw = s[4]; }
    }
    return { d: bd, tx: bt[0], tz: bt[1], hw: bw };
  }
  function onRoad(x, z, extra = 0) {
    for (const s of segs) {
      const dx = s[2] - s[0], dz = s[3] - s[1], l2 = dx * dx + dz * dz || 1;
      let t = ((x - s[0]) * dx + (z - s[1]) * dz) / l2; t = t < 0 ? 0 : t > 1 ? 1 : t;
      if (Math.hypot(s[0] + dx * t - x, s[1] + dz * t - z) < s[4] + extra) return true;
    }
    return false;
  }
  const mallNear = (x, z, d = 12) => { const s = sOf(x, z); const p = pos(s, 0); return Math.hypot(p.x - x, p.z - z) < d && s > 1 && s < MALL_LEN - 1; };
  const placed = [];
  const farEnough = (x, z, d) => { for (const q of placed) { if (Math.abs(q[0] - x) > d) continue; if (Math.hypot(q[0] - x, q[1] - z) < d) return false; } return true; };
  const claim = (x, z) => placed.push([x, z]);

  function walkStreet(names, spacing, fn) {
    for (const r of carRoads) {
      if (!names.includes(r.name)) continue;
      const hw = roadW(r) / 2;
      let acc = spacing * 0.5;
      for (let i = 1; i < r.pts.length; i++) {
        const a = r.pts[i - 1], b = r.pts[i];
        const dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz);
        if (L < 0.01) continue;
        const ux = dx / L, uz = dz / L;
        let d = acc;
        for (; d < L; d += spacing) fn(a[0] + ux * d, a[1] + uz * d, uz, -ux, hw, r);
        acc = Math.max(0.5, d - L);
      }
    }
  }

  // ---- 6a. street trees -----------------------------------------------------
  let nStreetTrees = 0;
  // (background trees — fewer canopy blobs each; they are the whole triangle budget otherwise)
  const TREE_STREETS = [
    [['Main Street'], mobile ? 26 : 16, 3.2, [4.2, 5.8], [5.0, 6.8]],
    [['College Street', 'Pearl Street', 'Saint Paul Street', 'Cherry Street', 'Bank Street'], mobile ? 56 : 32, 2.8, [3.8, 5.4], [4.4, 6.2]],
  ];
  for (const [names, sp, out, hr, wr] of TREE_STREETS) {
    walkStreet(names, sp, (cx, cz, nx, nz, hw) => {
      for (const side of [-1, 1]) {
        const x = cx + nx * side * (hw + out), z = cz + nz * side * (hw + out);
        if (!inPlay(x, z, 8) || inBuilding(x, z, 1.2) || onRoad(x, z, 1.2) || mallNear(x, z) || !farEnough(x, z, 9)) continue;
        addTree(x, z, groundY(x, z), { h: rr(hr[0], hr[1]), w: rr(wr[0], wr[1]), blobs: mobile ? 2 : 3 });
        claim(x, z); nStreetTrees++;
      }
    });
  }

  // ---- 6b. Great Streets teardrop street lights -----------------------------
  let nSL = 0, slToggle = 0;
  walkStreet(['Main Street', 'College Street', 'Pearl Street', 'Cherry Street', 'Bank Street', 'Saint Paul Street', 'South Winooski Avenue'], 38,
    (cx, cz, nx, nz, hw, r) => {
      const side = (slToggle++ % 2) ? 1 : -1;
      const x = cx + nx * side * (hw + 1.3), z = cz + nz * side * (hw + 1.3);
      if (!inPlay(x, z, 8) || inBuilding(x, z, 0.8) || onRoad(x, z, 0.3) || mallNear(x, z) || !farEnough(x, z, 5)) return;
      const y = groundY(x, z);
      const yaw = Math.atan2(nz * side, -nx * side);        // arm reaches out over the road
      put('slight', x, y, z, yaw);
      blocker(x, z, 0.12, y + 4.9, 'Street light');
      const hx = oxx(x, yaw, 1.2), hz = oxz(z, yaw, 1.2);
      emis.push(disc(0.13, 7, 0xffe9c0, hx, y + 4.68, hz));
      glows.push({ x: hx, y: y + 4.7, z: hz, c: 0xffd79a });
      if (r.name === 'Main Street' && chance(0.5)) {
        put('banner', oxx(x, yaw, 0.28), y + 2.35, oxz(z, yaw, 0.28), yaw + Math.PI / 2, 1, 1, 1, pick([0x7b3f9d, 0xe4761f, 0x3f8f45, 0x2f6ea8]));
        nBanner++;
      }
      claim(x, z); nSL++;
    });

  // ---- 6c. traffic signals ---------------------------------------------------
  let nSig = 0;
  for (const q of (WORLD.props || []).filter(p => p.kind === 'highway:traffic_signals')) {
    if (!inPlay(q.x, q.z, 6)) continue;
    const ns = nearestSeg(q.x, q.z);
    const nx = ns.tz, nz = -ns.tx, side = (nSig % 2) ? 1 : -1;
    const x = q.x + nx * side * (ns.hw + 1.7) + ns.tx * 5, z = q.z + nz * side * (ns.hw + 1.7) + ns.tz * 5;
    if (!inPlay(x, z, 4) || inBuilding(x, z, 0.5)) continue;
    const y = groundY(x, z);
    const yaw = Math.atan2(nz * side, -nx * side);
    addSignal(x, y, z, yaw);
    blocker(x, z, 0.14, y + 5.2, 'Traffic signal');
    const lit = pick([0xff2f22, 0xffc21f, 0x2fe04a]);
    const dy = lit === 0xff2f22 ? 0.3 : lit === 0xffc21f ? 0 : -0.3;
    for (const ax of [2.0, 3.6]) {
      const hx = ozx(oxx(x, yaw, ax), yaw, 0.15), hz = ozz(oxz(z, yaw, ax), yaw, 0.15);
      emis.push(quad(0.19, 0.19, lit, hx, y + 4.75 + dy, hz, yaw + Math.PI / 2));
      glows.push({ x: hx, y: y + 4.75 + dy, z: hz, c: lit });
    }
    nSig++;
  }

  // ---- 6d. bus stops ---------------------------------------------------------
  let nShelter = 0, nSign = 0;
  const stops = (WORLD.props || []).filter(p => p.kind === 'highway:bus_stop' && inPlay(p.x, p.z, 5));
  stops.sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z));
  stops.forEach((q, i) => {
    const ns = nearestSeg(q.x, q.z);
    const nx = ns.tz, nz = -ns.tx;
    let x = q.x, z = q.z;
    if (onRoad(q.x, q.z, -0.5)) {
      const side = inBuilding(q.x + nx * (ns.hw + 2.4), q.z + nz * (ns.hw + 2.4), 1) ? -1 : 1;
      x = q.x + nx * side * (ns.hw + 2.4); z = q.z + nz * side * (ns.hw + 2.4);
    }
    if (!inPlay(x, z, 4) || inBuilding(x, z, 0.5)) return;
    const y = groundY(x, z), yaw = Math.atan2(-ns.tz, ns.tx);
    if (i < 4) {                                  // the four closest, incl. Church & College, get a roof
      const F = 0x2a5da8, g = [box(3.3, 0.12, 1.75, F, x, y + 2.48, z, yaw)];
      for (const sx of [-1.5, 1.5]) for (const sz of [-0.75, 0.75]) {
        const px = ozx(oxx(x, yaw, sx), yaw, sz), pz = ozz(oxz(z, yaw, sx), yaw, sz);
        g.push(cyl(0.06, 0.06, 2.45, 6, F, px, y + 1.22, pz));
        blocker(px, pz, 0.1, y + 2.5, 'Bus shelter');
      }
      g.push(box(3.0, 0.4, 0.1, F, ozx(x, yaw, -0.68), y + 0.55, ozz(z, yaw, -0.68), yaw));
      solids.push(merge(g));
      glass.push(quad(3.0, 1.9, 0xcfe4ee, ozx(x, yaw, -0.78), y + 1.4, ozz(z, yaw, -0.78), yaw));
      collide.addSurface({ x: ozx(x, yaw, -0.68), z: ozz(z, yaw, -0.68), w: 3.0, d: 0.45, yaw, top: y + 0.72, bottom: y, kind: 'bench', name: 'Bus stop bench', grindable: true });
      nShelter++;
    } else {
      solids.push(merge([cyl(0.04, 0.04, 2.4, 6, IRON, x, y + 1.2, z),
        box(0.34, 0.46, 0.03, 0x2a5da8, x, y + 2.35, z, yaw + Math.PI / 2),
        box(0.24, 0.1, 0.04, 0xf0f0ee, x, y + 2.45, z, yaw + Math.PI / 2)]));
      blocker(x, z, 0.1, y + 2.4, 'Bus stop');
      nSign++;
    }
  });

  // ---- 6e. OSM benches, memorials, flagpoles, hydrants, meters, vending -----
  let nOsmBench = 0, nMon = 0, nHyd = 0, nMeter = 0, nVend = 0;
  for (const q of (WORLD.props || []).filter(p => p.kind === 'amenity:bench' && inPlay(p.x, p.z, 3))) {
    if (inBuilding(q.x, q.z, 0.3) || onRoad(q.x, q.z, 0.2)) continue;
    const y = groundY(q.x, q.z), yaw = rr(0, 6.28);
    put('bench', q.x, y, q.z, yaw);
    collide.addSurface({ x: q.x, z: q.z, w: 1.8, d: 0.5, yaw, top: y + 0.45, bottom: y, kind: 'bench', name: 'Bench', grindable: true });
    nOsmBench++;
  }
  for (const q of (WORLD.props || []).filter(p => (p.kind === 'historic:memorial' || p.kind === 'tourism:artwork') && inPlay(p.x, p.z, 3))) {
    if (Math.hypot(q.x + 8.4, q.z + 305.4) < 16) continue;      // that's Big Joe; already built
    if (inBuilding(q.x, q.z, 0.3) || onRoad(q.x, q.z, 0.2)) continue;
    const y = groundY(q.x, q.z), yaw = rr(0, 6.28);
    solids.push(merge([box(0.95, 0.16, 0.75, 0x9d9c95, q.x, y + 0.08, q.z, yaw), box(0.7, 0.78, 0.5, GRANITE, q.x, y + 0.55, q.z, yaw),
      box(0.42, 0.3, 0.02, 0x8d7433, ozx(q.x, yaw, 0.26), y + 0.66, ozz(q.z, yaw, 0.26), yaw)]));
    collide.addSurface({ x: q.x, z: q.z, w: 0.7, d: 0.5, yaw, top: y + 0.94, bottom: y, kind: 'ledge', name: (q.tags && q.tags.name) || 'Memorial', grindable: true });
    nMon++;
  }
  for (const q of (WORLD.props || []).filter(p => p.kind === 'man_made:flagpole' && inPlay(p.x, p.z, 3))) {
    const y = groundY(q.x, q.z);
    const H = Math.hypot(q.x, q.z - 88) < 25 ? 9.5 : 7;         // the tall one is City Hall's
    solids.push(merge([cyl(0.06, 0.11, H, 8, 0xd9d9d2, q.x, y + H / 2, q.z), cyl(0.34, 0.34, 0.25, 8, 0x8e8d87, q.x, y + 0.12, q.z),
      sph(0.11, 6, 0xe0c355, q.x, y + H + 0.08, q.z)]));
    blocker(q.x, q.z, 0.34, y + 0.3, 'Flagpole');
    put('flagUS', q.x + 0.62, y + H - 0.8, q.z, rr(0, 6.28));
    nFlag++;
  }
  const hydrants = (WORLD.props || []).filter(p => p.kind === 'emergency:fire_hydrant' && inPlay(p.x, p.z, 3)).map(p => [p.x, p.z]);
  for (let i = 0; i < 4; i++) { const p = pos(MALL_LEN * (0.14 + i * 0.24), (i % 2 ? 1 : -1) * 6.4); hydrants.push([p.x, p.z]); }
  for (const [x, z] of hydrants) {
    if (inBuilding(x, z, 0.3)) continue;
    const y = groundY(x, z), Y = 0xe4c020;
    solids.push(merge([cyl(0.13, 0.16, 0.6, 8, Y, x, y + 0.3, z), cyl(0.19, 0.19, 0.06, 8, Y, x, y + 0.62, z),
      sph(0.15, 7, Y, x, y + 0.72, z, 1, 0.8, 1), cyl(0.06, 0.06, 0.44, 6, Y, x, y + 0.38, z, 0, 0, Math.PI / 2)]));
    blocker(x, z, 0.22, y + 0.8, 'Hydrant');
    nHyd++;
  }
  walkStreet(['Cherry Street', 'College Street', 'Main Street'], 34, (cx, cz, nx, nz, hw) => {
    const side = chance(0.5) ? 1 : -1;
    const x = cx + nx * side * (hw + 0.9), z = cz + nz * side * (hw + 0.9);
    if (!inPlay(x, z, 6) || inBuilding(x, z, 0.5) || onRoad(x, z, 0.1) || mallNear(x, z) || !farEnough(x, z, 4)) return;
    const y = groundY(x, z), yaw = Math.atan2(-nz, nx);
    solids.push(merge([cyl(0.05, 0.05, 1.05, 6, 0x55575a, x, y + 0.52, z), box(0.24, 0.42, 0.18, 0x63666a, x, y + 1.25, z, yaw),
      box(0.16, 0.14, 0.02, 0x1c2024, ozx(x, yaw, 0.1), y + 1.32, ozz(z, yaw, 0.1), yaw)]));
    blocker(x, z, 0.14, y + 1.4, 'Pay station');
    claim(x, z); nMeter++;
  });
  for (const q of (WORLD.props || []).filter(p => (p.kind === 'amenity:vending_machine' || p.kind === 'amenity:atm') && inPlay(p.x, p.z, 3))) {
    if (inBuilding(q.x, q.z, 0.2)) continue;
    const y = groundY(q.x, q.z), yaw = rr(0, 6.28);
    solids.push(merge([box(0.72, 1.5, 0.5, pick([0x2b4d7a, 0x7a2b2b, 0x33383d]), q.x, y + 0.75, q.z, yaw),
      box(0.56, 1.0, 0.02, 0x1d2126, ozx(q.x, yaw, 0.26), y + 0.9, ozz(q.z, yaw, 0.26), yaw)]));
    collide.addSurface({ x: q.x, z: q.z, w: 0.72, d: 0.5, yaw, top: y + 1.5, bottom: y, kind: 'ledge', name: 'Vending machine' });
    nVend++;
  }
  for (const q of (WORLD.props || []).filter(p => p.kind === 'amenity:bicycle_parking' && inPlay(p.x, p.z, 3))) {
    if (inBuilding(q.x, q.z, 0.4) || onRoad(q.x, q.z, 0.4)) continue;
    addBikeRack(q.x, q.z, groundY(q.x, q.z), rr(0, 6.28), ri(1, 2));
  }

  // ---- 6f. City Hall Park: bistro sets, ash benches, café string lights ------
  let nBistro = 0, nPBench = 0;
  const park = (WORLD.areas || []).find(a => a.kind === 'leisure:park' && a.name === 'City Hall Park');
  if (park) {
    let px0 = 1e9, px1 = -1e9, pz0 = 1e9, pz1 = -1e9;
    for (const q of park.pts) { px0 = Math.min(px0, q[0]); px1 = Math.max(px1, q[0]); pz0 = Math.min(pz0, q[1]); pz1 = Math.max(pz1, q[1]); }
    const cxp = (px0 + px1) / 2, czp = (pz0 + pz1) / 2;
    for (let i = 0; i < 8; i++) {
      // movable chairs cluster on the hardscape around the fountain: prefer a paved surface
      let x = 0, z = 0, y = 0, best = -1;
      for (let t = 0; t < 10; t++) {
        const a = i / 8 * 6.28 + 0.3 + t * 0.11, rad = 8 + (t % 4) * 3.2;
        const cx2 = cxp + Math.cos(a) * rad, cz2 = czp + Math.sin(a) * rad * 1.5;
        if (cx2 < px0 + 5 || cx2 > px1 - 5 || cz2 < pz0 + 5 || cz2 > pz1 - 5 || inBuilding(cx2, cz2, 1)) continue;
        const g = collide.groundAt(cx2, cz2, 100, 200);
        const score = g.kind === 'ground' ? 0 : 1;
        if (score > best) { best = score; x = cx2; z = cz2; y = g.y; }
        if (score === 1) break;
      }
      if (best < 0) continue;
      addBistro(x, y, z, rr(0, 6.28));
      collide.addSurface({ x, z, w: 0.7, d: 0.7, yaw: 0, top: y + 0.74, bottom: y, kind: 'table', name: 'Park table' });
      nBistro++;
    }
    for (let i = 0; i < 10; i++) {
      const x = px0 + 8 + (px1 - px0 - 16) * ((i % 2) ? 0.2 : 0.8);
      const z = pz0 + 9 + (pz1 - pz0 - 18) * (i / 10);
      if (inBuilding(x, z, 1)) continue;
      const y = groundY(x, z), yaw = (i % 2) ? Math.PI / 2 : -Math.PI / 2;
      solids.push(merge([
        box(2.4, 0.09, 0.52, 0x9a6f43, x, y + 0.44, z, yaw),
        box(2.4, 0.5, 0.08, 0x9a6f43, ozx(x, yaw, -0.24), y + 0.72, ozz(z, yaw, -0.24), yaw),
        box(0.1, 0.44, 0.5, IRON, oxx(x, yaw, 1.05), y + 0.22, oxz(z, yaw, 1.05), yaw),
        box(0.1, 0.44, 0.5, IRON, oxx(x, yaw, -1.05), y + 0.22, oxz(z, yaw, -1.05), yaw),
      ]));
      collide.addSurface({ x, z, w: 2.4, d: 0.52, yaw, top: y + 0.48, bottom: y, kind: 'bench', name: 'Park bench', grindable: true });
      nPBench++;
    }
    // café string lights over the park hardscape: slim poles, a sagging wire, warm bulbs
    const runs = mobile ? 2 : 3;
    const gp = [];
    for (let r0 = 0; r0 < runs; r0++) {
      const z = czp - 13 + r0 * 13, xA = cxp - 19, xB = cxp + 19;
      const gA = groundY(xA, z), gB = groundY(xB, z);
      const yA = gA + 3.9, yB = gB + 3.9;
      gp.push(cyl(0.05, 0.07, 3.9, 6, IRON, xA, gA + 1.95, z), cyl(0.05, 0.07, 3.9, 6, IRON, xB, gB + 1.95, z));
      blocker(xA, z, 0.09, gA + 3.9, 'Light pole'); blocker(xB, z, 0.09, gB + 3.9, 'Light pole');
      const P = (t) => ({ x: xA + (xB - xA) * t, y: yA + (yB - yA) * t - Math.sin(Math.PI * t) * 1.0 });
      for (let i = 0; i < 12; i++) {
        const q0 = P(i / 12), q1 = P((i + 1) / 12);
        const len = Math.hypot(q1.x - q0.x, q1.y - q0.y) || 1;
        gp.push(box(len, 0.02, 0.02, 0x2b2b2b, (q0.x + q1.x) / 2, (q0.y + q1.y) / 2, z, 0, 0, Math.atan2(q1.y - q0.y, q1.x - q0.x)));
      }
      const n = mobile ? 14 : 24;
      for (let i = 0; i < n; i++) { const q = P((i + 0.5) / n); lights.push({ x: q.x, y: q.y - 0.16, z }); }
    }
    solids.push(merge(gp));
  }
  // the Marketplace maintenance golf cart, parked in front of City Hall
  {
    const p = pos(sOf(0, 92), -6.0), y = groundY(p.x, p.z), yaw = yawAlong(p.tx, p.tz);
    const W0 = 0xf0efe9, L2 = (a, b) => [ozx(oxx(p.x, yaw, a), yaw, b), ozz(oxz(p.z, yaw, a), yaw, b)];
    const g = [
      box(2.3, 0.55, 1.25, W0, p.x, y + 0.55, p.z, yaw),
      box(1.0, 0.5, 1.15, 0xdcdad2, oxx(p.x, yaw, -0.4), y + 1.05, oxz(p.z, yaw, -0.4), yaw),
      box(0.9, 0.45, 1.15, 0x3f5a49, oxx(p.x, yaw, 0.05), y + 1.05, oxz(p.z, yaw, 0.05), yaw),
      box(2.0, 0.07, 1.3, W0, p.x, y + 1.85, p.z, yaw),
    ];
    for (const [a, b] of [[0.9, 0.55], [0.9, -0.55], [-1.0, 0.55], [-1.0, -0.55]]) { const q = L2(a, b); g.push(cyl(0.035, 0.035, 0.85, 5, 0x9a9a94, q[0], y + 1.42, q[1])); }
    for (const [a, b] of [[-0.75, -0.62], [-0.75, 0.62], [0.75, -0.62], [0.75, 0.62]]) { const q = L2(a, b); g.push(cyl(0.22, 0.22, 0.14, 8, 0x26262a, q[0], y + 0.22, q[1], yaw, Math.PI / 2)); }
    solids.push(merge(g));
    collide.addSurface({ x: p.x, z: p.z, w: 2.3, d: 1.25, yaw, top: y + 0.85, bottom: y, kind: 'car', name: 'Marketplace cart' });
    blocker(p.x, p.z, 0.85, y + 1.9, 'Marketplace cart');
  }

  // ===========================================================================
  // 7. flush
  // ===========================================================================
  const shadows = !!quality.shadows;
  let calls = 0, tris = 0;
  for (const [key, g] of groups) {
    if (!g.m.length) continue;
    const im = new THREE.InstancedMesh(g.geo, g.mat, g.m.length);
    for (let i = 0; i < g.m.length; i++) im.setMatrixAt(i, g.m[i]);
    if (g.c.length === g.m.length) { for (let i = 0; i < g.c.length; i++) im.setColorAt(i, g.c[i]); im.instanceColor.needsUpdate = true; }
    im.instanceMatrix.needsUpdate = true;
    im.castShadow = shadows && g.shadow;
    im.receiveShadow = false;
    im.computeBoundingSphere();
    im.name = 'props:' + key;
    scene.add(im); calls++;
    tris += (g.geo.attributes.position.count / 3) * g.m.length;
  }
  function flushMerged(list, mat, name, cast) {
    const geo = merge(list); if (!geo) return;
    const m = new THREE.Mesh(geo, mat);
    m.name = name; m.castShadow = !!cast && shadows; m.receiveShadow = false; m.frustumCulled = false;
    scene.add(m); calls++; tris += geo.attributes.position.count / 3;
  }
  flushMerged(solids, MATP, 'props:solids', true);
  flushMerged(fabric, MATB, 'props:fabric', false);
  flushMerged(emis, MATE, 'props:emissive', false);
  flushMerged(glass, MATG, 'props:glass', false);
  flushMerged(decals, MATD, 'props:decals', false);

  // ---- two Points clouds ----------------------------------------------------
  const SPR = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 32;
    const g = c.getContext('2d');
    const grd = g.createRadialGradient(16, 16, 0, 16, 16, 16);
    grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.35, 'rgba(255,236,200,0.7)'); grd.addColorStop(1, 'rgba(255,220,160,0)');
    g.fillStyle = grd; g.fillRect(0, 0, 32, 32);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  })();
  function cloud(pts, size, defColor) {
    if (!pts.length) return;
    const p = new Float32Array(pts.length * 3), cA = new Float32Array(pts.length * 3), col = new THREE.Color();
    for (let i = 0; i < pts.length; i++) {
      p[i * 3] = pts[i].x; p[i * 3 + 1] = pts[i].y; p[i * 3 + 2] = pts[i].z;
      col.set(pts[i].c !== undefined ? pts[i].c : defColor);
      cA[i * 3] = col.r; cA[i * 3 + 1] = col.g; cA[i * 3 + 2] = col.b;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(p, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(cA, 3));
    const mat = new THREE.PointsMaterial({ size, sizeAttenuation: true, map: SPR, transparent: true, vertexColors: true, blending: THREE.AdditiveBlending, depthWrite: false });
    const o = new THREE.Points(geo, mat); o.frustumCulled = false; o.name = 'props:points'; scene.add(o); calls++;
  }
  cloud(lights, 0.32, 0xffd9a0);
  cloud(glows, 0.95, 0xffcf8a);

  console.info(`[props] ${nTrees} mall trees + ${nStreetTrees} street trees · ${nBench + nOsmBench} benches · ${nBould} boulders · ` +
    `${nLamp} lamps (${nBanner} banners, ${nFlag} flags) · ${nBunt} bunting runs · ${nBollard} bollards + ${nGpost} granite posts · ` +
    `${nPylon} pylons · ${nPlanter} planters + ${nBowl} bowls · ${nCart} carts · ${nBoard} boards · ${nTent} tents · ${nTrash} trash · ` +
    `${nRack} racks · ${nSL} street lights · ${nSig} signals · ${nShelter}+${nSign} bus stops · ${nMon} monuments · ${nHyd} hydrants · ` +
    `${nMeter} meters · ${nVend} vending · ${nBistro} bistro sets · ${nPBench} park benches · ${lights.length + glows.length} light points · ` +
    `${calls} draw groups · ~${Math.round(tris / 1000)}k tris`);
}
