// ground.js — builder A
// Everything the board rolls on: the draped terrain, asphalt streets with granite curbs and
// concrete sidewalks, the Church Street brick mall, City Hall Park and its fountain plaza,
// parking lots, water, construction dirt, stone walls, fences and every flight of steps.
// Populates ctx.collide with sidewalk slabs, park seat walls, stone walls, fences and stairs.
//
// Sources for the real-world detail: docs/BURLINGTON-REFERENCE.md (D&K 2017 survey of the
// Marketplace paving, the 2020 Wagner Hodgson City Hall Park rebuild, Great Streets BTV).
import * as THREE from '../vendor/three.module.min.js';
import { clamp, pointInPoly, hashStr } from './util.js';

const CAR_KINDS = ['primary', 'secondary', 'tertiary', 'residential', 'unclassified', 'service'];
const WALK_KINDS = ['primary', 'secondary', 'tertiary', 'residential', 'unclassified'];
const GREEN_KINDS = ['leisure:park', 'landuse:grass', 'landuse:cemetery', 'natural:wood', 'leisure:garden',
  'landuse:recreation_ground', 'leisure:common', 'leisure:playground', 'landuse:village_green',
  'landuse:religious', 'amenity:school', 'amenity:college', 'landuse:education', 'landuse:residential'];
// landuse=residential is a *zoning* polygon: block-sized, and it contains the streets and the
// houses as well as the lawns. Draping it as a lawn plate spread green over every road inside it.
// The terrain's own land-cover raster already tints those cells green (paintCover), underneath
// the asphalt where it can never bleed, so the plate was pure downside — colour spill plus tens
// of thousands of triangles. Same for the campus/school polygons, which swallow their own drives.
const NO_DRAPE = ['landuse:residential', 'amenity:college', 'amenity:school', 'landuse:education'];

// land-cover codes baked into the terrain vertex colours
const CV = { URBAN: 0, GREEN: 1, WATER: 2, DIRT: 3, PAVED: 4 };

const LAKE_Y = -33.5;              // Lake Champlain surface, local metres (29.6 m ASL vs origin 63.44)

// Waterfront Park: the lawn between Lake Street and the harbour, College Street north.
// OSM has no polygon for it — the extract stops at the water's edge and the park is tagged
// only as the "Waterfront" neighbourhood — so the shape is authored here, traced along the
// west kerb of the mapped Lake Street centreline out to the shore.
const WATERFRONT_LAWN = [
  [-706, 34], [-596, 31], [-578, 16], [-582, 2], [-624, -104], [-647, -168],
  [-670, -228], [-678, -250], [-706, -254],
];
// the harbour promenade / Burlington Greenway through the park, north–south along the shore
const PROMENADE = [[-685, 30], [-683, -30], [-684, -110], [-687, -180], [-688, -248]];

// ---------------------------------------------------------------------------
// tiny geometry accumulator: one flat array set per material, merged at the end
// ---------------------------------------------------------------------------
class Tris {
  constructor(uv = false) { this.p = []; this.n = []; this.c = []; this.u = uv ? [] : null; }
  get tris() { return this.p.length / 9; }
  _push(a, b, c, col, ua, ub, uc) {
    // face normal
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    const p = this.p, n = this.n, cc = this.c;
    p.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
    n.push(nx, ny, nz, nx, ny, nz, nx, ny, nz);
    if (col.length === 9) cc.push(...col);
    else for (let i = 0; i < 3; i++) cc.push(col[0], col[1], col[2]);
    if (this.u) { this.u.push(ua[0], ua[1], ub[0], ub[1], uc[0], uc[1]); }
  }
  // Everything here is either a ground plate or a thin vertical face. Ground plates must
  // face up whichever way the caller wound them, so flip when the normal points down;
  // vertical faces (ny ≈ 0) keep their order and rely on a double-sided material.
  static _ny(a, b, c) { return (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]); }
  tri(a, b, c, col, ua, ub, uc) {
    if (Tris._ny(a, b, c) < 0) this._push(a, c, b, col, ua, uc, ub);
    else this._push(a, b, c, col, ua, ub, uc);
  }
  quad(a, b, c, d, col, ua, ub, uc, ud) {
    if (Tris._ny(a, b, c) < 0) { this._push(a, d, c, col, ua, ud, uc); this._push(a, c, b, col, ua, uc, ub); }
    else { this._push(a, b, c, col, ua, ub, uc); this._push(a, c, d, col, ua, uc, ud); }
  }
  geo() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    if (this.u) g.setAttribute('uv', new THREE.Float32BufferAttribute(this.u, 2));
    g.computeBoundingSphere();
    return g;
  }
}

const _c = new THREE.Color();
// hex → linear-space rgb triple (three's working colour space), with optional brightness jitter
function C(hex, j = 0) {
  _c.setHex(hex);
  const m = 1 + j;
  return [_c.r * m, _c.g * m, _c.b * m];
}

// ---------------------------------------------------------------------------
export function buildGround(ctx) {
  const { scene, WORLD, terrain, collide, quality, play } = ctx;
  const mobile = !!quality.mobile;
  const rnd = ctx.rng;

  // --- 1. carve the plaza into the heightmap BEFORE anything samples it -----
  const park = (WORLD.areas || []).find(a => a.name === 'City Hall Park') || null;
  let plaza = null;
  if (park) {
    let cx = 0, cz = 0; for (const p of park.pts) { cx += p[0]; cz += p[1]; }
    cx /= park.pts.length; cz /= park.pts.length;
    const y0 = Math.round(terrain.heightAt(cx, cz) * 100) / 100;
    terrain.flattenCircle(cx, cz, 11, y0, 7);
    plaza = { x: cx, z: cz, y: y0, r: 7 };
  }

  // --- 2. terrain lattice + land-cover raster -------------------------------
  const stride = mobile ? 2 : 1;
  const gs = terrain.step * stride;
  const nx = Math.floor((terrain.cols - 1) / stride);        // cells across
  const nz = Math.floor((terrain.rows - 1) / stride);
  const LX0 = terrain.x0, LZ0 = terrain.z0;
  const LX1 = LX0 + nx * gs, LZ1 = LZ0 + nz * gs;
  const H = (i, j) => terrain.raw(clamp(i, 0, nx) * stride, clamp(j, 0, nz) * stride);

  // Height of the *rendered* terrain surface at (x,z).
  //
  // This must be the TRIANGULATED height, not the bilinear one. buildTerrain splits every
  // 5 m cell along the (i+1,j)–(i,j+1) diagonal; a bilinear sample of the same four corners
  // differs from that plane by up to a quarter of the cell's twist, which on Burlington's
  // hills is 10–30 cm — far more than the 3–7 cm a road, kerb or lawn plate is lifted by.
  // That mismatch is what pushed raw terrain and lawn green up through the asphalt.
  function gridH(x, z) {
    const fx = clamp((x - LX0) / gs, 0, nx - 1e-6), fz = clamp((z - LZ0) / gs, 0, nz - 1e-6);
    const i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j;
    const h00 = H(i, j), h10 = H(i + 1, j), h01 = H(i, j + 1), h11 = H(i + 1, j + 1);
    // lower-left triangle (h00,h10,h01) vs upper-right triangle (h10,h11,h01)
    return (u + v <= 1)
      ? h00 + (h10 - h00) * u + (h01 - h00) * v
      : h11 + (h01 - h11) * (1 - u) + (h10 - h11) * (1 - v);
  }

  // On mobile the mesh is half resolution, so resample the heightmap itself onto that
  // lattice: bilinear interpolation of a bilinear surface is exact, which keeps
  // terrain.heightAt (what the physics rides on) identical to what you can see.
  if (stride > 1) {
    const out = new Float32Array(terrain.h.length);
    for (let r = 0; r < terrain.rows; r++) for (let c = 0; c < terrain.cols; c++) {
      out[r * terrain.cols + c] = latticeH(terrain.x0 + c * terrain.step, terrain.z0 + r * terrain.step);
    }
    terrain.h = out;
  }
  function latticeH(x, z) { return gridH(x, z); }

  const cover = new Uint8Array((nx + 1) * (nz + 1));
  paintCover(cover, WORLD, nx, nz, gs, LX0, LZ0);

  buildTerrain(scene, cover, nx, nz, gs, LX0, LZ0, H, rnd, mobile);
  buildSkirt(scene, nx, nz, gs, LX0, LZ0, H);

  // --- 3. shared material buckets ------------------------------------------
  const B = {
    asphalt: new Tris(), paint: new Tris(), concrete: new Tris(), stone: new Tris(),
    brick: new Tris(true), green: new Tris(), water: new Tris(), dirt: new Tris(), sheer: new Tris(),
  };

  const box = { minX: play.minX, maxX: play.maxX, minZ: play.minZ, maxZ: play.maxZ };
  const near = (x, z, m) => x > box.minX - m && x < box.maxX + m && z > box.minZ - m && z < box.maxZ + m;

  const streets = buildStreets(ctx, B, gridH, near, rnd);
  buildWaterfrontGround(ctx, B, gridH);
  buildAreas(ctx, B, gridH, near);
  buildPaths(ctx, B, gridH, near, park);
  const churchPts = buildMall(ctx, B, gridH, near);
  if (park && plaza) buildPark(ctx, B, gridH, park, plaza);
  buildSteps(ctx, B, gridH, near);
  buildBarriers(ctx, B, gridH, near);
  buildLake(scene);

  // --- 4. one mesh per material --------------------------------------------
  const add = (tris, mat, shadow, label) => {
    if (!tris.tris) return null;
    const m = new THREE.Mesh(tris.geo(), mat);
    m.name = 'ground:' + (label || 'part');
    m.receiveShadow = true; m.castShadow = !!shadow && !mobile;
    m.matrixAutoUpdate = false; m.updateMatrix();
    scene.add(m); return m;
  };
  const lam = (o) => new THREE.MeshLambertMaterial({ vertexColors: true, ...o });
  const off = (f) => ({ polygonOffset: true, polygonOffsetFactor: f, polygonOffsetUnits: f });

  // Depth-priority stack for the coplanar ground plates, nearest-wins first:
  //   paint −5 · stone −3 · concrete −2 · asphalt/brick −1.6 · lawn/dirt −0.8 · terrain +1
  // Ground cover must never out-depth the road it is drawn beside, and raw terrain must
  // never out-depth anything laid on it.
  add(B.asphalt, lam(off(-1.6)), false, 'asphalt');
  add(B.brick, lam({ map: brickTexture(), ...off(-1.6) }), false, 'brick');
  add(B.dirt, lam(off(-0.8)), false, 'dirt');
  // stone (curb faces, stair risers, wall + hedge sides, fence posts) and hedges are thin
  // plates seen from either side
  add(B.green, lam({ side: THREE.DoubleSide, ...off(-0.8) }), false, 'green');
  add(B.concrete, lam(off(-2)), false, 'concrete');
  add(B.stone, lam({ side: THREE.DoubleSide, ...off(-3) }), true, 'stone');
  add(B.paint, lam(off(-5)), false, 'paint');
  add(B.water, lam({ ...off(-2) }), false, 'water');
  if (B.sheer.tris) {
    const m = new THREE.Mesh(B.sheer.geo(), new THREE.MeshLambertMaterial({
      vertexColors: true, transparent: true, opacity: 0.3, side: THREE.DoubleSide, depthWrite: false,
    }));
    m.name = 'ground:sheer'; m.matrixAutoUpdate = false; m.updateMatrix(); scene.add(m);
  }

  ctx.churchStreetPts = churchPts;
  ctx.plaza = plaza;
  const per = Object.entries(B).map(([k, v]) => k + ':' + v.tris).join(' ');
  console.info('[ground] terrain tris', nx * nz * 2, '|', per,
    '| streets', streets, 'surfaces', collide.all.surfaces.length,
    'ramps', collide.all.ramps.length, 'walls', collide.all.walls.length,
    '| plaza y', plaza ? plaza.y : 'n/a');
}

// ---------------------------------------------------------------------------
// land cover raster
// ---------------------------------------------------------------------------
function paintCover(cover, WORLD, nx, nz, gs, LX0, LZ0) {
  const stamp = (pts, code) => {
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const p of pts) { if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0]; if (p[1] < z0) z0 = p[1]; if (p[1] > z1) z1 = p[1]; }
    const i0 = Math.max(0, Math.floor((x0 - LX0) / gs)), i1 = Math.min(nx, Math.ceil((x1 - LX0) / gs));
    const j0 = Math.max(0, Math.floor((z0 - LZ0) / gs)), j1 = Math.min(nz, Math.ceil((z1 - LZ0) / gs));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const x = LX0 + i * gs, z = LZ0 + j * gs;
      if (pointInPoly(x, z, pts)) cover[j * (nx + 1) + i] = code;
    }
  };
  // Commercial / retail / industrial land is yard, lot and hardstanding, not bare earth.
  // Stamped into the terrain's own vertex colour rather than draped, so it can never bleed
  // onto a road, and costs nothing: it just stops whole downtown blocks and the rail yard
  // behind Lake Street reading as an unpaved tan void between the buildings.
  for (const a of WORLD.areas || []) {
    if (['landuse:commercial', 'landuse:retail', 'landuse:industrial', 'landuse:brownfield'].includes(a.kind)) stamp(a.pts, CV.PAVED);
  }
  for (const a of WORLD.areas || []) {
    if (GREEN_KINDS.includes(a.kind)) stamp(a.pts, CV.GREEN);
  }
  stamp(WATERFRONT_LAWN, CV.GREEN);
  for (const a of WORLD.areas || []) {
    if (a.kind === 'amenity:parking') stamp(a.pts, CV.PAVED);
    else if (a.kind === 'landuse:construction') stamp(a.pts, CV.DIRT);
  }
  for (const a of WORLD.areas || []) if (a.kind === 'natural:water') stamp(a.pts, CV.WATER);

  // The terrain grid carries a ~25 m margin outside the data bbox that no land-use polygon
  // can reach, so the whole outer rim of the map — including the top of Battery Park's bluff,
  // which the player looks straight along — rendered as bare tan. Extend the land cover
  // outward from the first row/column that has one.
  const M = Math.max(2, Math.round(26 / gs));
  const at = (i, j) => cover[j * (nx + 1) + i];
  for (let j = 0; j <= nz; j++) for (let i = 0; i < M; i++) {
    cover[j * (nx + 1) + i] = at(M, j);
    cover[j * (nx + 1) + nx - i] = at(nx - M, j);
  }
  for (let i = 0; i <= nx; i++) for (let j = 0; j < M; j++) {
    cover[j * (nx + 1) + i] = at(i, M);
    cover[(nz - j) * (nx + 1) + i] = at(i, nz - M);
  }
}

// ---------------------------------------------------------------------------
// terrain: one indexed heightfield split into 3×3 chunks so the renderer can cull
// ---------------------------------------------------------------------------
function buildTerrain(scene, cover, nx, nz, gs, LX0, LZ0, H, rnd, mobile) {
  const COL = {
    [CV.URBAN]: C(0x8f8a80), [CV.GREEN]: C(0x6f8a4a), [CV.WATER]: C(0x51707f),
    [CV.DIRT]: C(0x7a6a55), [CV.PAVED]: C(0x6d6b67),
  };
  // pushed one unit *away* from the eye so a coplanar road/lawn/brick plate always wins the
  // depth test even where the two surfaces meet exactly
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
  const CH = 3;
  for (let cj = 0; cj < CH; cj++) for (let ci = 0; ci < CH; ci++) {
    const i0 = Math.floor(ci * nx / CH), i1 = Math.floor((ci + 1) * nx / CH);
    const j0 = Math.floor(cj * nz / CH), j1 = Math.floor((cj + 1) * nz / CH);
    const w = i1 - i0 + 1, d = j1 - j0 + 1;
    const pos = new Float32Array(w * d * 3), nor = new Float32Array(w * d * 3), col = new Float32Array(w * d * 3);
    for (let j = 0; j < d; j++) for (let i = 0; i < w; i++) {
      const gi = i0 + i, gj = j0 + j, k = (j * w + i) * 3;
      const h = H(gi, gj);
      pos[k] = LX0 + gi * gs; pos[k + 1] = h; pos[k + 2] = LZ0 + gj * gs;
      const dx = (H(gi + 1, gj) - H(gi - 1, gj)) / (2 * gs);
      const dz = (H(gi, gj + 1) - H(gi, gj - 1)) / (2 * gs);
      const inv = 1 / Math.hypot(dx, 1, dz);
      nor[k] = -dx * inv; nor[k + 1] = inv; nor[k + 2] = -dz * inv;
      const c = COL[cover[gj * (nx + 1) + gi]] || COL[CV.URBAN];
      const t = 0.93 + 0.14 * (((hashStr(gi + ':' + gj) >>> 8) & 255) / 255);
      col[k] = c[0] * t; col[k + 1] = c[1] * t; col[k + 2] = c[2] * t;
    }
    const idx = [];
    for (let j = 0; j < d - 1; j++) for (let i = 0; i < w - 1; i++) {
      const a = j * w + i, b = a + 1, c2 = a + w, e = c2 + 1;
      idx.push(a, c2, b, b, c2, e);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setIndex(idx); g.computeBoundingSphere();
    const m = new THREE.Mesh(g, mat);
    m.name = 'ground:terrain';
    m.receiveShadow = true; m.matrixAutoUpdate = false; m.updateMatrix();
    scene.add(m);
  }
}

// flat apron running out from the data edge so the world never visibly ends
function buildSkirt(scene, nx, nz, gs, LX0, LZ0, H) {
  const OUT = 1400, SHORE = 16;
  const t = new Tris();
  const c = C(0x7d786f), cw = C(0x51707f), shingle = C(0x6d6a63), bluff = C(0x5c6647);
  const ptH = (i, j) => { const h = H(i, j); return h < -25 ? -34.8 : h; };
  const colFor = (h) => (h <= -34 ? cw : c);
  // Where the apron falls to the lake it now does so over ~26 m and then runs flat, instead of
  // sliding 1,400 m at 0.2%: the old ramp turned Burlington Harbour into a tan mudflat running
  // out to the horizon. Beyond the shore band the flat apron sits just under the lake plane.
  const edge = (ai, aj, bi, bj, ox, oz) => {
    const ax = LX0 + ai * gs, az = LZ0 + aj * gs, bx = LX0 + bi * gs, bz = LZ0 + bj * gs;
    const ah = ptH(ai, aj), bh = ptH(bi, bj);
    const wet = ah <= -34 || bh <= -34;
    const L = Math.hypot(ox, oz) || 1, sx = ox / L * SHORE, sz = oz / L * SHORE;
    const A = [ax, H(ai, aj), az], Bp = [bx, H(bi, bj), bz];
    const As = [ax + sx, ah, az + sz], Bs = [bx + sx, bh, bz + sz];
    const Ao = [ax + ox, ah, az + oz], Bo = [bx + ox, bh, bz + oz];
    // A short drop is beach shingle; the long drop off Battery Park's bluff is a wooded
    // bank, and rendering that as sand made the north shore look like a desert cliff.
    const drop = Math.max(H(ai, aj) - ah, H(bi, bj) - bh);
    t.quad(A, As, Bs, Bp, wet ? (drop > 8 ? bluff : shingle) : c);
    t.quad(As, Ao, Bo, Bs, colFor(ah));
  };
  for (let i = 0; i < nx; i++) { edge(i + 1, 0, i, 0, 0, -OUT); edge(i, nz, i + 1, nz, 0, OUT); }
  for (let j = 0; j < nz; j++) { edge(0, j, 0, j + 1, -OUT, 0); edge(0 + nx, j + 1, nx, j, OUT, 0); }
  // corner fills
  const corner = (i, j, ox, oz) => {
    const x = LX0 + i * gs, z = LZ0 + j * gs, h = ptH(i, j);
    t.quad([x, H(i, j), z], [x + ox, h, z], [x + ox, h, z + oz], [x, h, z + oz], colFor(h));
  };
  corner(0, 0, -OUT, -OUT); corner(nx, 0, OUT, -OUT); corner(0, nz, -OUT, OUT); corner(nx, nz, OUT, OUT);
  const m = new THREE.Mesh(t.geo(), new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }));
  m.name = 'ground:skirt';
  m.matrixAutoUpdate = false; m.updateMatrix(); scene.add(m);
}

// ---------------------------------------------------------------------------
// streets: asphalt, paint, concrete sidewalks, granite curbs, crosswalks
// ---------------------------------------------------------------------------
function feet(s) { const m = /^([\d.]+)\s*'$/.exec(String(s)); return m ? +m[1] * 0.3048 : null; }
function roadWidth(r) {
  if (r.width) { const f = feet(r.width); const v = f != null ? f : parseFloat(r.width); if (v > 1.5 && v < 40) return v; }
  const base = { primary: 11, secondary: 11, tertiary: 9, residential: 9, unclassified: 9, service: 5 }[r.kind] || 8;
  const lanes = parseInt(r.lanes, 10);
  if (lanes >= 1) return Math.max(base, lanes * 3.3 + (r.kind === 'service' ? 0 : 4.8));
  return base;
}
function resample(pts, step) {
  const out = [[pts[0][0], pts[0][1]]];
  let carry = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    const dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz);
    if (L < 1e-6) continue;
    let s = step - carry;
    while (s < L) { out.push([a[0] + dx * s / L, a[1] + dz * s / L]); s += step; }
    carry = L - (s - step);
  }
  const last = pts[pts.length - 1];
  const p = out[out.length - 1];
  if (Math.hypot(p[0] - last[0], p[1] - last[1]) > 0.6) out.push([last[0], last[1]]); else { p[0] = last[0]; p[1] = last[1]; }
  return out;
}
// unit normals along a resampled path (perpendicular, left-hand side)
function normalsOf(path) {
  const n = [];
  for (let i = 0; i < path.length; i++) {
    const a = path[Math.max(0, i - 1)], b = path[Math.min(path.length - 1, i + 1)];
    let dx = b[0] - a[0], dz = b[1] - a[1]; const L = Math.hypot(dx, dz) || 1; dx /= L; dz /= L;
    n.push([dz, -dx]);
  }
  return n;
}

function buildStreets(ctx, B, gridH, near, rnd) {
  const { WORLD, collide, play } = ctx;
  const mobile = !!ctx.quality.mobile;
  const roads = (WORLD.roads || []).filter(r => CAR_KINDS.includes(r.kind) && r.pts && r.pts.length > 1);
  const drawn = roads.filter(r => r.pts.some(p => near(p[0], p[1], 190)));

  // intersection nodes (two differently-named car streets sharing a vertex)
  const named = drawn.filter(r => r.name);
  const nodes = [];
  for (let i = 0; i < named.length; i++) for (let j = i + 1; j < named.length; j++) {
    if (named[i].name === named[j].name) continue;
    for (const p of named[i].pts) for (const q of named[j].pts) {
      if (Math.abs(p[0] - q[0]) < 2 && Math.abs(p[1] - q[1]) < 2) {
        if (!nodes.some(k => Math.hypot(k[0] - p[0], k[1] - p[1]) < 9)) nodes.push([p[0], p[1]]);
      }
    }
  }
  const nearNode = (x, z, d) => { for (const k of nodes) { const dx = k[0] - x, dz = k[1] - z; if (dx * dx + dz * dz < d * d) return true; } return false; };

  // Church Street mall centreline — sidewalks stop short of the flush brick
  const mall = (WORLD.churchStreet && WORLD.churchStreet.centerline) || [];
  const nearMall = (x, z) => {
    for (let i = 0; i < mall.length - 1; i++) {
      const a = mall[i], b = mall[i + 1];
      const dx = b[0] - a[0], dz = b[1] - a[1]; const l2 = dx * dx + dz * dz || 1;
      let t = ((x - a[0]) * dx + (z - a[1]) * dz) / l2; t = clamp(t, 0, 1);
      const px = a[0] + dx * t - x, pz = a[1] + dz * t - z;
      if (px * px + pz * pz < 240) return true;   // ~15.5 m — the mall is flush, no kerb
    }
    return false;
  };

  // inside the brick field itself (≈ 11.5 m either side of the centreline)
  const nearMallCore = (x, z) => {
    for (let i = 0; i < mall.length - 1; i++) {
      const a = mall[i], b = mall[i + 1];
      const dx = b[0] - a[0], dz = b[1] - a[1]; const l2 = dx * dx + dz * dz || 1;
      let t = ((x - a[0]) * dx + (z - a[1]) * dz) / l2; t = clamp(t, 0, 1);
      const px = a[0] + dx * t - x, pz = a[1] + dz * t - z;
      if (px * px + pz * pz < 11.5 * 11.5) return true;
    }
    return false;
  };
  const ASPH = 0x46484c, ALLEY = 0x55575b;
  const CURB = C(0x8d8b84), WALK = C(0xc9c4b8), WHITE = C(0xd9d7cc), YELL = C(0xc9a63a);

  for (const r of drawn) {
    const w = roadWidth(r), hw = w / 2;
    const path = resample(r.pts, mobile ? 8 : 5);   // phones: 40% fewer road/kerb/walk quads
    const nrm = normalsOf(path);
    const jitter = ((hashStr(String(r.id)) & 31) / 31) * 0.014;
    const layer = { primary: 0.052, secondary: 0.048, unclassified: 0.046, tertiary: 0.042, residential: 0.038, service: 0.03 }[r.kind] + jitter;
    const base = C(r.kind === 'service' ? ALLEY : ASPH);
    const two = !r.oneway || r.oneway === 'no';
    const lanes = parseInt(r.lanes, 10) || 0;
    const walks = WALK_KINDS.includes(r.kind);
    const band = (r.kind === 'residential') ? 2.4 : 3.2;

    let prevWalk = [false, false];
    // Cherry, Bank and College cross the Marketplace ON the brick (granite bands, no asphalt);
    // only Pearl and Main are asphalt through the intersection.
    const brickCrossing = /^(Cherry|Bank|College) Street$/.test(r.name || '');
    for (let i = 0; i < path.length - 1; i++) {
      const a = path[i], b = path[i + 1], na = nrm[i], nb = nrm[i + 1];
      if (brickCrossing && nearMallCore((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)) continue;
      const ya = gridH(a[0], a[1]) + layer, yb = gridH(b[0], b[1]) + layer;
      const tone = 0.9 + 0.2 * (((hashStr(r.id + ':' + i) >>> 6) & 255) / 255);
      const col = [base[0] * tone, base[1] * tone, base[2] * tone];
      // Asphalt, draped across the width rather than spanned flat. One quad per segment is a
      // plane through four corners up to 12 m apart; the terrain between them is piecewise-planar
      // on a 5 m lattice and pushes straight through it on a crowned or side-sloping street.
      // Splitting the width into ~2.5 m strips, each corner sampled on the terrain, keeps the
      // asphalt on the ground for the cost of a few triangles.
      const strips = (w < 6) ? 1 : (mobile ? 2 : 3);   // an alley is already narrower than a terrain cell
      for (let k = 0; k < strips; k++) {
        const f0 = hw - (2 * hw) * k / strips, f1 = hw - (2 * hw) * (k + 1) / strips;
        const A = [a[0] + na[0] * f0, 0, a[1] + na[1] * f0]; A[1] = gridH(A[0], A[2]) + layer;
        const Bp = [b[0] + nb[0] * f0, 0, b[1] + nb[1] * f0]; Bp[1] = gridH(Bp[0], Bp[2]) + layer;
        const Cp = [b[0] + nb[0] * f1, 0, b[1] + nb[1] * f1]; Cp[1] = gridH(Cp[0], Cp[2]) + layer;
        const Dp = [a[0] + na[0] * f1, 0, a[1] + na[1] * f1]; Dp[1] = gridH(Dp[0], Dp[2]) + layer;
        B.asphalt.quad(A, Bp, Cp, Dp, col);
      }

      // ---- paint
      const mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2, my = (ya + yb) / 2 + 0.004;
      const mn = [(na[0] + nb[0]) / 2, (na[1] + nb[1]) / 2];
      const tx = (b[0] - a[0]) / 5, tz = (b[1] - a[1]) / 5;
      if (r.kind !== 'service' && (i % (mobile ? 4 : 2) === 0) && !nearNode(mx, mz, 9)) {
        if (two) dash(B.paint, mx, mz, my, tx, tz, mn, 0, 0.16, YELL);
        if (lanes >= 3) { const off = w / 4; dash(B.paint, mx, mz, my, tx, tz, mn, off, 0.13, WHITE); dash(B.paint, mx, mz, my, tx, tz, mn, -off, 0.13, WHITE); }
      }

      // ---- sidewalks + granite curb
      if (!walks) continue;
      for (let s = 0; s < 2; s++) {
        const sg = s ? -1 : 1;
        const cut = nearNode(mx, mz, 7) || nearMall(mx, mz);
        const inPlay = mx > play.minX && mx < play.maxX && mz > play.minZ && mz < play.maxZ;
        if (cut) {
          if (prevWalk[s]) curbRamp(B, collide, a, na, ya, sg, hw, layer, WALK, CURB);
          prevWalk[s] = false; continue;
        }
        prevWalk[s] = true;
        const o0 = hw, o1 = hw + 0.22, o2 = hw + 0.22 + band;
        const wa = ya + 0.13, wb = yb + 0.13;
        const P = (pt, nn, o, y) => [pt[0] + nn[0] * o * sg, y, pt[1] + nn[1] * o * sg];
        // curb face (vertical)
        B.stone.quad(P(a, na, o0, ya - 0.02), P(a, na, o0, wa), P(b, nb, o0, wb), P(b, nb, o0, yb - 0.02), C(0x77746d));
        // curb top strip — on a phone the walk just runs to the kerb face instead
        if (!mobile) B.stone.quad(P(a, na, o0, wa), P(a, na, o1, wa), P(b, nb, o1, wb), P(b, nb, o0, wb), CURB);
        // concrete band
        const oW = mobile ? o0 : o1;
        const tone2 = 0.94 + 0.12 * (((hashStr(r.id + ':w' + i + s) >>> 4) & 255) / 255);
        const wc = [WALK[0] * tone2, WALK[1] * tone2, WALK[2] * tone2];
        B.concrete.quad(P(a, na, oW, wa + 0.004), P(a, na, o2, wa + 0.004), P(b, nb, o2, wb + 0.004), P(b, nb, oW, wb + 0.004), wc);
        if (inPlay) {
          // A sloped ramp, not a flat box: on the hill streets a flat slab per 5 m segment
          // left a 25 cm step at every joint — taller than the skater's stepUp, so riding
          // uphill on a sidewalk stopped dead. The ramp matches the drawn quad exactly.
          const om = (o0 + o2) / 2;
          collide.addRamp({
            ax: a[0] + na[0] * om * sg, az: a[1] + na[1] * om * sg,
            bx: b[0] + nb[0] * om * sg, bz: b[1] + nb[1] * om * sg,
            w: o2 - o0, yLow: wa, yHigh: wb, kind: 'sidewalk',
          });
        }
      }
    }
  }

  // ---- crosswalks at every mapped highway=crossing that sits on a car street
  const zebra = C(0xdedbd0);
  for (const p of WORLD.props || []) {
    if (p.kind !== 'highway:crossing' || !near(p.x, p.z, 130)) continue;
    // Cherry, Bank and College cross the Marketplace on the brick; the crossings there are
    // read in granite banding and the tri-tone paving, never in painted zebra stripes.
    if (nearMallCore(p.x, p.z)) continue;
    let best = null, bd = 9;
    for (const r of drawn) {
      if (r.kind === 'service') continue;
      for (let i = 0; i < r.pts.length - 1; i++) {
        const a = r.pts[i], b = r.pts[i + 1];
        const dx = b[0] - a[0], dz = b[1] - a[1], l2 = dx * dx + dz * dz; if (l2 < 1e-6) continue;
        let t = ((p.x - a[0]) * dx + (p.z - a[1]) * dz) / l2; t = clamp(t, 0, 1);
        const px = a[0] + dx * t, pz = a[1] + dz * t;
        const d = Math.hypot(px - p.x, pz - p.z);
        if (d < bd) { bd = d; best = { r, dx: dx / Math.sqrt(l2), dz: dz / Math.sqrt(l2), px, pz }; }
      }
    }
    if (!best) continue;
    const w = roadWidth(best.r), hw = w / 2;
    const ux = best.dx, uz = best.dz;         // along the road
    const vx = uz, vz = -ux;                  // across the road
    const y = gridH(best.px, best.pz) + 0.06;
    const bars = Math.max(3, Math.floor(w / 1.0));
    for (let k = 0; k < bars; k++) {
      const o = -hw + 0.5 + k * (w - 1) / (bars - 1);
      if (Math.abs(o) > hw - 0.35) continue;
      const cxx = best.px + vx * o, czz = best.pz + vz * o;
      const hbw = 0.26, hbl = 1.25;
      B.paint.quad(
        [cxx + ux * hbl + vx * hbw, y, czz + uz * hbl + vz * hbw],
        [cxx - ux * hbl + vx * hbw, y, czz - uz * hbl + vz * hbw],
        [cxx - ux * hbl - vx * hbw, y, czz - uz * hbl - vz * hbw],
        [cxx + ux * hbl - vx * hbw, y, czz + uz * hbl - vz * hbw], zebra);
    }
  }
  return drawn.length;
}

function dash(paint, mx, mz, my, tx, tz, n, off, halfW, col) {
  const ax = mx + n[0] * off, az = mz + n[1] * off;
  const L = 1.5;
  const ux = tx, uz = tz;                       // 1/5 of a 5 m step ⇒ unit-ish
  const l = Math.hypot(ux, uz) || 1;
  const px = ux / l, pz = uz / l, qx = pz, qz = -px;
  paint.quad(
    [ax + px * L + qx * halfW, my, az + pz * L + qz * halfW],
    [ax - px * L + qx * halfW, my, az - pz * L + qz * halfW],
    [ax - px * L - qx * halfW, my, az - pz * L - qz * halfW],
    [ax + px * L - qx * halfW, my, az + pz * L - qz * halfW], col);
}

function curbRamp(B, collide, a, na, ya, sg, hw, layer, WALK, CURB) {
  const o0 = hw, o2 = hw + 1.9;
  const P = (o, y) => [a[0] + na[0] * o * sg, y, a[1] + na[1] * o * sg];
  const tx = -na[1] * sg, tz = na[0] * sg;      // along the kerb
  const wgap = 1.5;
  const A = P(o0, ya + 0.01), Bp = P(o2, ya + 0.14);
  const q = (p, s) => [p[0] + tx * s, p[1], p[2] + tz * s];
  B.concrete.quad(q(A, -wgap), q(Bp, -wgap), q(Bp, wgap), q(A, wgap), WALK);
  collide.addRamp({
    ax: A[0], az: A[2], bx: Bp[0], bz: Bp[2], w: wgap * 2,
    yLow: A[1], yHigh: Bp[1], kind: 'sidewalk', name: null,
  });
}

// ---------------------------------------------------------------------------
// draping arbitrary polygons over the heightfield
// ---------------------------------------------------------------------------
function drape(tris, pts, gridH, lift, colFn, maxEdge = 9, flatY = null) {
  const contour = pts.map(p => new THREE.Vector2(p[0], p[1]));
  let faces;
  try { faces = THREE.ShapeUtils.triangulateShape(contour, []); } catch (e) { return; }
  const Y = (x, z) => (flatY != null ? flatY : gridH(x, z) + lift);
  // A draped triangle only samples the terrain at its corners, so a long edge crossing a
  // ridge or a hollow leaves the plate floating over (or sunk under) the ground between them.
  // Split when the edge is long OR when its midpoint has drifted more than a plate thickness
  // from the true surface, so flat ground stays cheap and broken ground gets the triangles.
  const SAG = 0.05;
  const sags = (a, b) => Math.abs(Y((a[0] + b[0]) / 2, (a[1] + b[1]) / 2) - (Y(a[0], a[1]) + Y(b[0], b[1])) / 2) > SAG;
  const emit = (a, b, c, depth) => {
    const ab = Math.hypot(a[0] - b[0], a[1] - b[1]);
    const bc = Math.hypot(b[0] - c[0], b[1] - c[1]);
    const ca = Math.hypot(c[0] - a[0], c[1] - a[1]);
    const m = Math.max(ab, bc, ca);
    const bent = depth < 6 && flatY == null && m > 1.6 && (sags(a, b) || sags(b, c) || sags(c, a));
    if ((bent || m > maxEdge) && depth < 6 && flatY == null) {
      if (m === ab) { const p = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; emit(a, p, c, depth + 1); emit(p, b, c, depth + 1); }
      else if (m === bc) { const p = [(b[0] + c[0]) / 2, (b[1] + c[1]) / 2]; emit(a, b, p, depth + 1); emit(a, p, c, depth + 1); }
      else { const p = [(c[0] + a[0]) / 2, (c[1] + a[1]) / 2]; emit(a, b, p, depth + 1); emit(p, b, c, depth + 1); }
      return;
    }
    const A = [a[0], Y(a[0], a[1]), a[1]], Bp = [b[0], Y(b[0], b[1]), b[1]], Cp = [c[0], Y(c[0], c[1]), c[1]];
    tris.tri(A, Cp, Bp, colFn((a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3));
  };
  for (const f of faces) emit(pts[f[0]], pts[f[1]], pts[f[2]], 0);
}

// ---------------------------------------------------------------------------
// areas: parking lots, green overlays, water, construction dirt, plazas
// ---------------------------------------------------------------------------
function buildAreas(ctx, B, gridH, near) {
  const { WORLD, collide } = ctx;
  const LOT = C(0x3e4044), GRASS = C(0x6f8a4a), WATER = C(0x4f7286), DIRT = C(0x776a58), PAVED = C(0xb4afa3);
  const shade = (base, amt) => (x, z) => {
    const t = 1 + amt * ((((hashStr((x | 0) + ':' + (z | 0)) >>> 9) & 255) / 255) - 0.5);
    return [base[0] * t, base[1] * t, base[2] * t];
  };

  for (const a of WORLD.areas || []) {
    if (!a.pts || a.pts.length < 3) continue;
    const cx = a.pts.reduce((s, p) => s + p[0], 0) / a.pts.length;
    const cz = a.pts.reduce((s, p) => s + p[1], 0) / a.pts.length;
    if (!near(cx, cz, 320)) continue;

    if (a.kind === 'amenity:parking') {
      drape(B.asphalt, a.pts, gridH, 0.035, shade(LOT, 0.16), 10);
      stallLines(B.paint, a.pts, gridH);
    } else if (a.kind === 'natural:water') {
      const y = gridH(cx, cz);
      if (y < -25 || a.name === 'Lake Champlain') drape(B.water, a.pts, gridH, 0, () => WATER, 40, LAKE_Y);
      else drape(B.water, a.pts, gridH, 0.02, () => WATER, 10);
    } else if (a.kind === 'landuse:construction') {
      drape(B.dirt, a.pts, gridH, 0.03, shade(DIRT, 0.2), 12);
      if (a.name) fenceLine(ctx, B, gridH, [...a.pts, a.pts[0]], 1.9, 'Construction fence');
    } else if (GREEN_KINDS.includes(a.kind)) {
      if (NO_DRAPE.includes(a.kind)) continue;      // zoning polygons — terrain colour only
      drape(B.green, a.pts, gridH, 0.025, shade(GRASS, 0.16), 9);
    } else if (a.kind === 'highway:pedestrian' || a.kind === 'leisure:common') {
      drape(B.concrete, a.pts, gridH, 0.03, shade(PAVED, 0.12), 9);
    }
  }
}

// ---------------------------------------------------------------------------
// Waterfront Park: the lawn strip between Lake Street and the harbour, plus the
// paved Greenway promenade that runs the length of it.
// ---------------------------------------------------------------------------
function buildWaterfrontGround(ctx, B, gridH) {
  const { collide, locations, spots } = ctx;
  const LAWN = C(0x6d8b48), WALK = C(0xbdb7a9), BIKE = C(0x4b4d51);
  const shade = (base, amt) => (x, z) => {
    const t = 1 + amt * ((((hashStr((x | 0) + ':' + (z | 0)) >>> 9) & 255) / 255) - 0.5);
    return [base[0] * t, base[1] * t, base[2] * t];
  };
  drape(B.green, WATERFRONT_LAWN, gridH, 0.025, shade(LAWN, 0.14), 9);

  // the promenade: a 3.2 m asphalt bike path with a concrete walking apron on the lake side
  const path = resample(PROMENADE, 6);
  ribbon(B.concrete, path.map(p => [p[0] - 2.6, p[1]]), gridH, 3.0, 0.05, WALK);
  ribbon(B.asphalt, path, gridH, 3.2, 0.055, BIKE);

  locations.push({ name: 'Waterfront Park', pts: WATERFRONT_LAWN });
  spots.push({ name: 'Waterfront Park', x: -668, z: -110, r: 46, bonus: 300 });
}

// ---------------------------------------------------------------------------
// Mapped footways and cycleways that are NOT already covered by a street's own
// sidewalk band — park paths, the Burlington Greenway, plaza links, the shore
// promenade. Without these the whole waterfront reads as untouched ground.
// ---------------------------------------------------------------------------
function buildPaths(ctx, B, gridH, near, park) {
  const { WORLD } = ctx;
  const mobile = !!ctx.quality.mobile;
  const WALK = C(0xc0bbad), BIKE = C(0x4b4d51);
  // every car street already draws a concrete band either side; anything inside that band
  // would only z-fight with it
  const covered = [];
  for (const r of WORLD.roads || []) {
    if (!CAR_KINDS.includes(r.kind) || !r.pts || r.pts.length < 2) continue;
    const hw = roadWidth(r) / 2 + 4.4;
    for (let i = 1; i < r.pts.length; i++) covered.push([r.pts[i - 1][0], r.pts[i - 1][1], r.pts[i][0], r.pts[i][1], hw * hw]);
  }
  const onStreet = (x, z) => {
    for (const s of covered) {
      const dx = s[2] - s[0], dz = s[3] - s[1], l2 = dx * dx + dz * dz || 1;
      let t = ((x - s[0]) * dx + (z - s[1]) * dz) / l2; t = clamp(t, 0, 1);
      const px = s[0] + dx * t - x, pz = s[1] + dz * t - z;
      if (px * px + pz * pz < s[4]) return true;
    }
    return false;
  };
  const inPark = (x, z) => !!park && pointInPoly(x, z, park.pts);   // buildPark draws those itself

  let n = 0;
  for (const r of WORLD.roads || []) {
    const bike = r.kind === 'cycleway';
    if (!bike && r.kind !== 'footway' && r.kind !== 'path') continue;
    if (!r.pts || r.pts.length < 2 || !r.pts.some(p => near(p[0], p[1], 60))) continue;
    const pts = resample(r.pts, mobile ? 9 : 6);
    // walk the polyline and emit only the stretches that stand clear of a street
    let run = [];
    const flush = () => {
      if (run.length > 1) {
        ribbon(bike ? B.asphalt : B.concrete, run, gridH, bike ? 3.2 : 2.2, bike ? 0.05 : 0.045, bike ? BIKE : WALK);
        n++;
      }
      run = [];
    };
    for (const p of pts) {
      if (!near(p[0], p[1], 60) || onStreet(p[0], p[1]) || inPark(p[0], p[1])) flush();
      else run.push(p);
    }
    flush();
  }
  return n;
}

function stallLines(paint, pts, gridH) {
  // longest edge sets the aisle direction; stalls march along it in 11 m bays
  let bx = 1, bz = 0, bl = 0, cx = 0, cz = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    const dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz);
    if (l > bl) { bl = l; bx = dx / l; bz = dz / l; }
    cx += a[0]; cz += a[1];
  }
  cx /= pts.length; cz /= pts.length;
  const vx = bz, vz = -bx;
  const WHITE = C(0xcfccc0);
  for (let row = -4; row <= 4; row++) {
    for (let k = -18; k <= 18; k++) {
      const ox = bx * (k * 2.7) + vx * (row * 11), oz = bz * (k * 2.7) + vz * (row * 11);
      const sx = cx + ox, sz = cz + oz;
      const ex = sx + vx * 5, ez = sz + vz * 5;
      if (!pointInPoly(sx, sz, pts) || !pointInPoly(ex, ez, pts)) continue;
      const y0 = gridH(sx, sz) + 0.055, y1 = gridH(ex, ez) + 0.055;
      const hwv = 0.06;
      paint.quad([sx + bx * hwv, y0, sz + bz * hwv], [ex + bx * hwv, y1, ez + bz * hwv],
        [ex - bx * hwv, y1, ez - bz * hwv], [sx - bx * hwv, y0, sz - bz * hwv], WHITE);
    }
  }
}

// ---------------------------------------------------------------------------
// The Church Street Marketplace: brick, the granite meridian, cross-street bands
// ---------------------------------------------------------------------------
function buildMall(ctx, B, gridH, near) {
  const { WORLD, collide, terrain, spots } = ctx;
  const cs = WORLD.churchStreet;
  if (!cs || !cs.centerline || cs.centerline.length < 2) return null;
  const line = resample(cs.centerline, 2);
  const nrm = normalsOf(line);
  const cross = Object.entries(cs.crossings || {});
  const crossDist = (x, z) => { let m = 1e9; for (const [, p] of cross) m = Math.min(m, Math.hypot(p[0] - x, p[1] - z)); return m; };

  // The mall is flush building face to building face (~54–60 ft mid-block, ~80 ft at Bank),
  // so cast a ray each way from the centreline and stop at the real storefronts.
  const fronts = (WORLD.buildings || []).filter(b => b.onChurch && b.pts && b.pts.length > 2);
  const half = [[], []];
  for (let i = 0; i < line.length; i++) {
    const p = line[i], n = nrm[i];
    for (let s = 0; s < 2; s++) {
      const sg = s ? -1 : 1, dx = n[0] * sg, dz = n[1] * sg;
      let best = 14.6;
      for (const b of fronts) {
        const t = rayHit(p[0], p[1], dx, dz, b.pts);
        if (t != null && t < best) best = t;
      }
      // run the pavers a little way *under* the facade so no terrain shows at the joint
      half[s].push(clamp(best + 0.9, 7.2, 15.5));
    }
  }
  for (let s = 0; s < 2; s++) half[s] = smooth(smooth(half[s]));
  const hwOf = (i, f) => (f >= 0 ? f * half[0][i] : f * half[1][i]);
  const widthAt = (i) => half[0][i] + half[1][i];

  // The brick colour lives in the texture; vertex colour is a *tint multiplier* so the
  // three D&K tones (rust / slate blue-grey / buff) read across the zones without
  // double-darkening the map.
  const RUST = [1, 1, 1], SLATE = [0.74, 0.81, 0.92], BUFF = [1.22, 1.12, 0.90];
  // fractions of half-width; finer than the D&K zones so the pavers hug the 5 m terrain lattice
  const lanes = [-1, -0.87, -0.74, -0.6, -0.47, -0.34, -0.21, -0.1, 0, 0.1, 0.21, 0.34, 0.47, 0.6, 0.74, 0.87, 1];
  // The mall is not one uniform brick field (BURLINGTON-REFERENCE §4.1, D&K 2017 sheets):
  // a dual-tone running bond along the shopfronts, and down the centre a tri-tone *linear*
  // pattern — bands running the length of Church Street. A random speckle everywhere read as
  // noise; keyed to the lane index the centre now reads as stripes you can follow downhill.
  const BAND = [RUST, SLATE, BUFF, RUST, SLATE, RUST, BUFF, SLATE];
  const tint = (f, k, x, z) => {
    const n = (((hashStr(((x * 2) | 0) + ':' + ((z * 2) | 0)) >>> 11) & 255) / 255);
    const base = Math.abs(f) < 0.5 ? BAND[k % BAND.length] : (n > 0.84 ? BUFF : RUST);
    const t = 0.94 + 0.13 * n;
    return [base[0] * t, base[1] * t, base[2] * t];
  };

  for (let i = 0; i < line.length - 1; i++) {
    const a = line[i], b = line[i + 1], na = nrm[i], nb = nrm[i + 1];
    for (let k = 0; k < lanes.length - 1; k++) {
      const f0 = lanes[k], f1 = lanes[k + 1];
      const oa0 = hwOf(i, f0), oa1 = hwOf(i, f1), ob0 = hwOf(i + 1, f0), ob1 = hwOf(i + 1, f1);
      const A = [a[0] + na[0] * oa0, 0, a[1] + na[1] * oa0]; A[1] = gridH(A[0], A[2]) + 0.04;
      const A2 = [a[0] + na[0] * oa1, 0, a[1] + na[1] * oa1]; A2[1] = gridH(A2[0], A2[2]) + 0.04;
      const Bp = [b[0] + nb[0] * ob0, 0, b[1] + nb[1] * ob0]; Bp[1] = gridH(Bp[0], Bp[2]) + 0.04;
      const B2 = [b[0] + nb[0] * ob1, 0, b[1] + nb[1] * ob1]; B2[1] = gridH(B2[0], B2[2]) + 0.04;
      const col = tint((f0 + f1) / 2, k, a[0], a[1]);
      const uv = (p) => [p[0] / 3.2, p[2] / 3.2];
      B.brick.quad(A, Bp, B2, A2, col, uv(A), uv(Bp), uv(B2), uv(A2));
    }
  }

  // the granite meridian line — a continuous inlay down the exact centreline
  // 0.30 m of grey granite, not a painted white stripe: at 0.38 m and near-white it read
  // like a road marking down the middle of the bricks.
  const GRAN = C(0x8d8a80);
  for (let i = 0; i < line.length - 1; i++) {
    const a = line[i], b = line[i + 1], na = nrm[i], nb = nrm[i + 1];
    if (crossDist(a[0], a[1]) < 7) continue;
    const ya = gridH(a[0], a[1]) + 0.032, yb = gridH(b[0], b[1]) + 0.032, h = 0.15;
    B.stone.quad([a[0] + na[0] * h, ya, a[1] + na[1] * h], [b[0] + nb[0] * h, yb, b[1] + nb[1] * h],
      [b[0] - nb[0] * h, yb, b[1] - nb[1] * h], [a[0] - na[0] * h, ya, a[1] - na[1] * h], GRAN);
  }

  // granite banding + tri-tone diamonds where the car streets cross at grade
  for (const [name, p] of cross) {
    const idx = nearestIdx(line, p);
    const n = nrm[idx];
    const hp = half[0][idx], hn = half[1][idx];
    const tx = -n[1], tz = n[0];
    for (const s of [-1, 1]) {
      const o = s * 6.6;
      const cxx = p[0] + tx * o, czz = p[1] + tz * o;
      const y = gridH(cxx, czz) + 0.03, hb = 0.75;
      B.stone.quad(
        [cxx + tx * hb + n[0] * hp, y, czz + tz * hb + n[1] * hp],
        [cxx - tx * hb + n[0] * hp, y, czz - tz * hb + n[1] * hp],
        [cxx - tx * hb - n[0] * hn, y, czz - tz * hb - n[1] * hn],
        [cxx + tx * hb - n[0] * hn, y, czz + tz * hb - n[1] * hn], GRAN);
    }
    if (name === 'Cherry' || name === 'College') diamond(B, gridH, p, n, [tx, tz], Math.min(hp, hn, 8.4));
  }

  // the two circular world-map pavers in front of City Hall are drawn by props.js
  // (textured hemispheres, one per globe) — don't duplicate them here.

  // physics: the mall reads as 'brick', sloped to match the ground, minus the car crossings
  let acc = 0, segStart = 0;
  for (let i = 1; i < line.length; i++) {
    acc += Math.hypot(line[i][0] - line[i - 1][0], line[i][1] - line[i - 1][1]);
    if (acc < 18 && i < line.length - 1) continue;
    const a = line[segStart], b = line[i];
    const mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2;
    if (crossDist(mx, mz) > 9) {
      collide.addRamp({
        ax: a[0], az: a[1], bx: b[0], bz: b[1], w: Math.max(6, widthAt(segStart) - 1.4),
        yLow: gridH(a[0], a[1]) + 0.05, yHigh: gridH(b[0], b[1]) + 0.05,
        kind: 'brick', name: 'Church Street Marketplace',
      });
    }
    segStart = i; acc = 0;
  }
  return line;
}

// first positive hit of the ray (px,pz)+t·(dx,dz) against a closed polygon, or null
function rayHit(px, pz, dx, dz, pts) {
  let best = null;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    const ex = b[0] - a[0], ez = b[1] - a[1];
    const den = dx * ez - dz * ex;
    if (Math.abs(den) < 1e-9) continue;
    const t = ((a[0] - px) * ez - (a[1] - pz) * ex) / den;
    const u = ((a[0] - px) * dz - (a[1] - pz) * dx) / den;
    if (t > 0.5 && u >= 0 && u <= 1 && (best == null || t < best)) best = t;
  }
  return best;
}
function smooth(arr) {
  const o = arr.slice();
  for (let i = 0; i < arr.length; i++) {
    let s = 0, n = 0;
    for (let k = -2; k <= 2; k++) { const j = i + k; if (j < 0 || j >= arr.length) continue; s += arr[j]; n++; }
    o[i] = s / n;
  }
  return o;
}

function nearestIdx(line, p) {
  let bi = 0, bd = Infinity;
  for (let i = 0; i < line.length; i++) { const d = Math.hypot(line[i][0] - p[0], line[i][1] - p[1]); if (d < bd) { bd = d; bi = i; } }
  return bi;
}

// nested tri-tone diamond mitred into the intersection paving
function diamond(B, gridH, p, n, t, R) {
  // tint multipliers over the brick map — slate, buff, rust, pale granite
  const tones = [[0.68, 0.76, 0.90], [1.26, 1.14, 0.90], [1, 0.97, 0.95], [1.34, 1.31, 1.24]];
  const rings = [R, R * 0.72, R * 0.46, R * 0.22, 0];
  const P = (u, v) => {
    const x = p[0] + n[0] * u + t[0] * v, z = p[1] + n[1] * u + t[1] * v;
    return [x, gridH(x, z) + 0.028, z];
  };
  for (let k = 0; k < rings.length - 1; k++) {
    const ro = rings[k], ri = rings[k + 1], col = tones[k % tones.length];
    const O = [[ro, 0], [0, ro], [-ro, 0], [0, -ro]];
    const I = [[ri, 0], [0, ri], [-ri, 0], [0, -ri]];
    for (let s = 0; s < 4; s++) {
      const a = O[s], b = O[(s + 1) % 4], c = I[(s + 1) % 4], d = I[s];
      if (ri === 0) B.brick.tri(P(a[0], a[1]), P(b[0], b[1]), P(0, 0), col, [0, 0], [1, 0], [0.5, 1]);
      else B.brick.quad(P(a[0], a[1]), P(b[0], b[1]), P(c[0], c[1]), P(d[0], d[1]), col, [0, 0], [1, 0], [1, 1], [0, 1]);
    }
  }
}

// one of the two circular world-map paver inlays outside City Hall: pale "sea" stone,
// darker "land" masses, a granite rim
// ---------------------------------------------------------------------------
// City Hall Park — the 2020 Wagner Hodgson rebuild
// ---------------------------------------------------------------------------
function buildPark(ctx, B, gridH, park, plaza) {
  const { WORLD, collide, spots, locations } = ctx;
  const pts = park.pts;
  const LAWN = C(0x74914c), PATH = C(0xc4bfae), PAVER = C(0xb7b0a2), COBB = C(0x9a958a), WET = C(0x6f6d67), SEAT = C(0xaba79c);

  drape(B.green, pts, gridH, 0.02, () => LAWN, 8);

  // radiating paths (the OSM footways in the park plus the missing spokes)
  const inside = (x, z) => pointInPoly(x, z, pts);
  let spokes = 0;
  for (const r of WORLD.roads || []) {
    if (!['footway', 'path'].includes(r.kind) || !r.pts || r.pts.length < 2) continue;
    if (!r.pts.some(p => inside(p[0], p[1]))) continue;
    ribbon(B.concrete, resample(r.pts, 5), gridH, 3.0, 0.032, PATH);
    spokes++;
  }
  for (let k = 0; k < 8; k++) {
    const a = k / 8 * Math.PI * 2 + 0.32;
    const dx = Math.cos(a), dz = Math.sin(a);
    let L = plaza.r + 1;
    while (L < 90 && inside(plaza.x + dx * (L + 3), plaza.z + dz * (L + 3))) L += 3;
    if (L < plaza.r + 8) continue;
    ribbon(B.concrete, [[plaza.x + dx * (plaza.r - 1), plaza.z + dz * (plaza.r - 1)], [plaza.x + dx * L, plaza.z + dz * L]], gridH, 2.8, 0.03, PATH);
  }

  // central plaza: light granite pavers, a cobble rim, the flush splash fountain
  disc(B.stone, plaza.x, plaza.z, plaza.r, plaza.y + 0.035, PAVER, 26);
  ring(B.stone, plaza.x, plaza.z, plaza.r, plaza.r + 1.5, plaza.y + 0.033, COBB, 26);
  const fx = plaza.x - 1.6, fz = plaza.z + 1.4;
  disc(B.water, fx, fz, 2.5, plaza.y + 0.045, WET, 18);
  for (let k = 0; k < 9; k++) {
    const a = k / 9 * Math.PI * 2, rr = k % 3 === 0 ? 0.3 : 1.8;
    const jx = fx + Math.cos(a) * rr, jz = fz + Math.sin(a) * rr;
    const h = 0.55 + (k % 4) * 0.32;
    const w = 0.09;
    B.sheer.quad([jx - w, plaza.y + 0.05, jz], [jx + w, plaza.y + 0.05, jz], [jx + w * 0.4, plaza.y + h, jz], [jx - w * 0.4, plaza.y + h, jz], C(0xdfeef7));
    B.sheer.quad([jx, plaza.y + 0.05, jz - w], [jx, plaza.y + 0.05, jz + w], [jx, plaza.y + h, jz + w * 0.4], [jx, plaza.y + h, jz - w * 0.4], C(0xdfeef7));
  }

  // the low granite sitting wall around the ellipse — ~60% of the rim, grindable
  const R = plaza.r + 1.9, WALL_H = 0.45, WALL_W = 0.5;
  const a0 = 0.6, a1 = a0 + Math.PI * 2 * 0.6, NSEG = 11;
  for (let k = 0; k < NSEG; k++) {
    const b0 = a0 + (a1 - a0) * k / NSEG, b1 = a0 + (a1 - a0) * (k + 1) / NSEG;
    const mx = plaza.x + Math.cos((b0 + b1) / 2) * R, mz = plaza.z + Math.sin((b0 + b1) / 2) * R;
    const chord = 2 * R * Math.sin((b1 - b0) / 2) + 0.08;
    const yaw = -((b0 + b1) / 2);
    seatWall(B, collide, mx, mz, WALL_W, chord, yaw, plaza.y + 0.03, WALL_H, SEAT, 'City Hall Park fountain wall');
  }

  // granite seat wall along the southern edge + a terrace at the north-east corner
  const south = edgeMid(pts, 2);
  if (south) seatWall(B, collide, south.x, south.z - 4.5, 0.55, 26, south.yaw, gridH(south.x, south.z - 4.5), 0.45, SEAT, 'City Hall Park seat wall');
  // terraced seating stepping down from the north-east corner
  const north = edgeMid(pts, 0);
  if (north) {
    for (let k = 0; k < 3; k++) {
      const tx = pts[0][0] - 13, tz = pts[0][1] + 7.5 + k * 1.7;
      seatWall(B, collide, tx, tz, 1.7, 13, north.yaw, gridH(tx, tz) - 0.1, 0.34 + k * 0.3, SEAT, 'City Hall Park terrace');
    }
  }

  locations.push({ name: 'City Hall Park', pts });
  let cx = 0, cz = 0; for (const p of pts) { cx += p[0]; cz += p[1]; } cx /= pts.length; cz /= pts.length;
  spots.push({ name: 'City Hall Park', x: cx, z: cz, r: 30, bonus: 300 });
  spots.push({ name: 'Pomerleau Fountain', x: plaza.x, z: plaza.z, r: 11, bonus: 260 });
}

function edgeMid(pts, i) {
  const a = pts[i], b = pts[(i + 1) % pts.length];
  if (!a || !b) return null;
  // yaw whose local +Z runs *along* the edge (seatWall's `d` axis)
  return { x: (a[0] + b[0]) / 2, z: (a[1] + b[1]) / 2, yaw: Math.atan2(-(b[0] - a[0]), -(b[1] - a[1])) };
}

// a flat-topped stone box, drawn and registered as a grindable ledge
function seatWall(B, collide, x, z, w, d, yaw, yBase, h, col, name) {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  const P = (lx, lz, y) => [x + lx * c + lz * s, y, z - lx * s + lz * c];
  const hw = w / 2, hd = d / 2, top = yBase + h;
  const dark = [col[0] * 0.8, col[1] * 0.8, col[2] * 0.8];
  B.stone.quad(P(-hw, -hd, top), P(-hw, hd, top), P(hw, hd, top), P(hw, -hd, top), col);
  B.stone.quad(P(-hw, -hd, yBase), P(-hw, -hd, top), P(hw, -hd, top), P(hw, -hd, yBase), dark);
  B.stone.quad(P(hw, hd, yBase), P(hw, hd, top), P(-hw, hd, top), P(-hw, hd, yBase), dark);
  B.stone.quad(P(-hw, hd, yBase), P(-hw, hd, top), P(-hw, -hd, top), P(-hw, -hd, yBase), dark);
  B.stone.quad(P(hw, -hd, yBase), P(hw, -hd, top), P(hw, hd, top), P(hw, hd, yBase), dark);
  collide.addSurface({ x, z, w, d, yaw, top, bottom: yBase, kind: 'ledge', name, grindable: true });
}

function disc(tris, cx, cz, r, y, col, n) {
  for (let i = 0; i < n; i++) {
    const a0 = i / n * Math.PI * 2, a1 = (i + 1) / n * Math.PI * 2;
    tris.tri([cx, y, cz], [cx + Math.cos(a1) * r, y, cz + Math.sin(a1) * r], [cx + Math.cos(a0) * r, y, cz + Math.sin(a0) * r], col);
  }
}
function ring(tris, cx, cz, r0, r1, y, col, n) {
  for (let i = 0; i < n; i++) {
    const a0 = i / n * Math.PI * 2, a1 = (i + 1) / n * Math.PI * 2;
    tris.quad(
      [cx + Math.cos(a0) * r1, y, cz + Math.sin(a0) * r1], [cx + Math.cos(a1) * r1, y, cz + Math.sin(a1) * r1],
      [cx + Math.cos(a1) * r0, y, cz + Math.sin(a1) * r0], [cx + Math.cos(a0) * r0, y, cz + Math.sin(a0) * r0], col);
  }
}
function ribbon(tris, path, gridH, w, lift, col) {
  const n = normalsOf(path), hw = w / 2;
  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i], b = path[i + 1], na = n[i], nb = n[i + 1];
    const ya = gridH(a[0], a[1]) + lift, yb = gridH(b[0], b[1]) + lift;
    tris.quad([a[0] + na[0] * hw, ya, a[1] + na[1] * hw], [b[0] + nb[0] * hw, yb, b[1] + nb[1] * hw],
      [b[0] - nb[0] * hw, yb, b[1] - nb[1] * hw], [a[0] - na[0] * hw, ya, a[1] - na[1] * hw], col);
  }
}

// ---------------------------------------------------------------------------
// steps: visual treads + one physics ramp each
// ---------------------------------------------------------------------------
function buildSteps(ctx, B, gridH, near) {
  const { WORLD, collide, terrain } = ctx;
  const seen = new Set();
  const flights = [];
  const take = (pts, tags) => {
    if (!pts || pts.length < 2) return;
    const k = pts[0][0].toFixed(1) + ',' + pts[0][1].toFixed(1) + '|' + pts[pts.length - 1][0].toFixed(1);
    if (seen.has(k)) return; seen.add(k);
    flights.push({ pts, tags: tags || {} });
  };
  for (const l of WORLD.lines || []) if (l.kind === 'steps') take(l.pts, l.tags);
  for (const r of WORLD.roads || []) if (r.kind === 'steps') take(r.pts, r);

  const STONE = C(0xa4a096), RISER = C(0x8b8780);
  for (const f of flights) {
    const a = f.pts[0], b = f.pts[f.pts.length - 1];
    if (!near(a[0], a[1], 130)) continue;
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (len < 1) continue;
    const ha = terrain.heightAt(a[0], a[1]), hb = terrain.heightAt(b[0], b[1]);
    let lo = a, hi = b, ylo = ha, yhi = hb;
    const inc = f.tags.incline;
    if (inc === 'down') { lo = b; hi = a; ylo = hb; yhi = ha; }
    else if (inc !== 'up' && hb < ha) { lo = b; hi = a; ylo = hb; yhi = ha; }
    let n = parseInt(f.tags.step_count, 10);
    let rise;
    if (n >= 1) { rise = n * 0.165; }
    else { rise = clamp(Math.abs(yhi - ylo), 0.33, 2.3); n = Math.max(2, Math.round(rise / 0.165)); rise = n * 0.165; }
    const run = 0.32;
    const flight = Math.min(len, n * run + 0.2);
    // centre the flight on the mapped way
    const ux = (hi[0] - lo[0]) / len, uz = (hi[1] - lo[1]) / len;
    const midT = len / 2;
    const s0 = clamp(midT - flight / 2, 0, len - flight);
    const px = lo[0] + ux * s0, pz = lo[1] + uz * s0;
    const w = (f.tags.width ? parseFloat(f.tags.width) : 0) || 2.5;
    const base = gridH(px, pz);
    const vx = uz, vz = -ux, hw = w / 2;
    for (let i = 0; i < n; i++) {
      const t0 = i * (flight / n), t1 = (i + 1) * (flight / n);
      const y1 = base + (i + 1) * rise / n, y0 = base + i * rise / n;
      const A = [px + ux * t0 + vx * hw, y1, pz + uz * t0 + vz * hw];
      const Bp = [px + ux * t1 + vx * hw, y1, pz + uz * t1 + vz * hw];
      const Cp = [px + ux * t1 - vx * hw, y1, pz + uz * t1 - vz * hw];
      const D = [px + ux * t0 - vx * hw, y1, pz + uz * t0 - vz * hw];
      B.stone.quad(A, Bp, Cp, D, STONE);
      B.stone.quad([A[0], y0 - 0.02, A[2]], [A[0], y1, A[2]], [D[0], y1, D[2]], [D[0], y0 - 0.02, D[2]], RISER);
    }
    const name = stepName(ctx, px, pz);
    collide.addRamp({
      ax: px, az: pz, bx: px + ux * flight, bz: pz + uz * flight, w,
      yLow: base, yHigh: base + rise, kind: 'stairs', name, steps: n,
    });
  }
}

function stepName(ctx, x, z) {
  const { WORLD } = ctx;
  let best = null, bd = 55;
  for (const b of WORLD.buildings || []) {
    if (!b.name) continue;
    let cx = 0, cz = 0; for (const p of b.pts) { cx += p[0]; cz += p[1]; }
    cx /= b.pts.length; cz /= b.pts.length;
    const d = Math.hypot(cx - x, cz - z);
    if (d < bd) { bd = d; best = b.name; }
  }
  if (best) return best + ' steps';
  bd = 40;
  for (const r of WORLD.roads || []) {
    if (!r.name || r.kind === 'steps') continue;
    for (const p of r.pts) { const d = Math.hypot(p[0] - x, p[1] - z); if (d < bd) { bd = d; best = r.name; } }
  }
  return best ? best + ' steps' : 'Steps';
}

// ---------------------------------------------------------------------------
// barrier lines: stone walls (grindable), hedges, fences
// ---------------------------------------------------------------------------
function buildBarriers(ctx, B, gridH, near) {
  const { WORLD, collide } = ctx;
  const STONE = C(0x9d968a), HEDGE = C(0x53763a);
  for (const l of WORLD.lines || []) {
    if (!l.pts || l.pts.length < 2) continue;
    if (!l.pts.some(p => near(p[0], p[1], 150))) continue;
    if (l.kind === 'barrier:wall' || l.kind === 'barrier:retaining_wall') {
      const path = resample(l.pts, 4);
      for (let i = 0; i < path.length - 1; i++) {
        const a = path[i], b = path[i + 1];
        const mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2;
        const d = Math.hypot(b[0] - a[0], b[1] - a[1]) + 0.06;
        const yaw = Math.atan2(-(b[0] - a[0]), -(b[1] - a[1]));
        seatWall(B, collide, mx, mz, 0.4, d, yaw, gridH(mx, mz) - 0.05, 0.65, STONE, 'Stone wall');
      }
    } else if (l.kind === 'barrier:hedge') {
      const path = resample(l.pts, 4);
      for (let i = 0; i < path.length - 1; i++) {
        const a = path[i], b = path[i + 1];
        const mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2;
        const d = Math.hypot(b[0] - a[0], b[1] - a[1]) + 0.06;
        const yaw = Math.atan2(-(b[0] - a[0]), -(b[1] - a[1]));
        greenBox(B, mx, mz, 0.9, d, yaw, gridH(mx, mz), 1.0, HEDGE);
        collide.addWall({ ax: a[0], az: a[1], bx: b[0], bz: b[1], top: gridH(mx, mz) + 1.0, name: 'Hedge' });
      }
    } else if (l.kind === 'barrier:fence') {
      fenceLine(ctx, B, gridH, l.pts, 1.8, 'Fence');
    }
  }
}

function greenBox(B, x, z, w, d, yaw, yBase, h, col) {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  const P = (lx, lz, y) => [x + lx * c + lz * s, y, z - lx * s + lz * c];
  const hw = w / 2, hd = d / 2, top = yBase + h;
  const dark = [col[0] * 0.78, col[1] * 0.78, col[2] * 0.78];
  B.green.quad(P(-hw, -hd, top), P(-hw, hd, top), P(hw, hd, top), P(hw, -hd, top), col);
  B.green.quad(P(-hw, -hd, yBase), P(-hw, -hd, top), P(hw, -hd, top), P(hw, -hd, yBase), dark);
  B.green.quad(P(hw, hd, yBase), P(hw, hd, top), P(-hw, hd, top), P(-hw, hd, yBase), dark);
  B.green.quad(P(-hw, hd, yBase), P(-hw, hd, top), P(-hw, -hd, top), P(-hw, -hd, yBase), dark);
  B.green.quad(P(hw, -hd, yBase), P(hw, -hd, top), P(hw, hd, top), P(hw, hd, yBase), dark);
}

// chain-link: dark posts plus one translucent mesh panel; a wall to the physics
function fenceLine(ctx, B, gridH, pts, h, name) {
  const { collide } = ctx;
  const POST = C(0x4c4f52), MESH = C(0xb9c3c6);
  const path = resample(pts, 3);
  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i], b = path[i + 1];
    const ya = gridH(a[0], a[1]), yb = gridH(b[0], b[1]);
    B.sheer.quad([a[0], ya, a[1]], [b[0], yb, b[1]], [b[0], yb + h, b[1]], [a[0], ya + h, a[1]], MESH);
    collide.addWall({ ax: a[0], az: a[1], bx: b[0], bz: b[1], top: Math.max(ya, yb) + h, name });
    const s = 0.05;
    B.stone.quad([a[0] - s, ya, a[1] - s], [a[0] + s, ya, a[1] - s], [a[0] + s, ya + h + 0.06, a[1] - s], [a[0] - s, ya + h + 0.06, a[1] - s], POST);
    B.stone.quad([a[0] + s, ya, a[1] + s], [a[0] - s, ya, a[1] + s], [a[0] - s, ya + h + 0.06, a[1] + s], [a[0] + s, ya + h + 0.06, a[1] + s], POST);
  }
}

// ---------------------------------------------------------------------------
// Lake Champlain: the real water plane west of the data box
// ---------------------------------------------------------------------------
function buildLake(scene) {
  const g = new THREE.PlaneGeometry(9000, 9000, 1, 1);
  g.rotateX(-Math.PI / 2);
  const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color: 0x5d7f9a, emissive: 0x14202b }));
  m.name = 'ground:lake';
  m.position.set(-4200, LAKE_Y, -140);
  m.receiveShadow = false; m.matrixAutoUpdate = false; m.updateMatrix();
  scene.add(m);
}

// ---------------------------------------------------------------------------
// brick paver texture: running bond, three tones, 256 px = 3.2 m
// ---------------------------------------------------------------------------
function brickTexture() {
  const S = 256, c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d');
  const M = 3.2;                       // metres the tile covers
  const BW = 0.205 / M * S, BH = 0.098 / M * S;
  g.fillStyle = '#5d4436'; g.fillRect(0, 0, S, S);
  // Warm red-orange to salmon, "visibly varied paver to paver" — but only just. The odd
  // grey and buff pavers used to run at 21% and read as a speckled, dirty field; the
  // three D&K tones belong to the zone tinting above, not to individual bricks.
  const tones = ['#b06a44', '#a05c3c', '#9c5539', '#b8794f', '#9c8b83', '#bfa585'];
  const w = ['#b06a44', '#a05c3c', '#9c5539', '#b8794f', '#ab6440', '#a96e4b'];
  let seed = 9;
  const rr = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  const rows = Math.round(S / BH), cols = Math.ceil(S / BW) + 1;
  const bh = S / rows;
  for (let r = 0; r < rows; r++) {
    const off = (r % 2) * BW * 0.5;
    for (let i = -1; i < cols; i++) {
      const x = i * BW + off, y = r * bh;
      const p = rr();
      const col = p > 0.945 ? tones[5] : p > 0.895 ? tones[4] : w[(rr() * w.length) | 0];
      g.fillStyle = col;
      g.fillRect(x + 0.6, y + 0.6, BW - 1.2, bh - 1.2);
      if (rr() > 0.86) { g.fillStyle = 'rgba(0,0,0,0.10)'; g.fillRect(x + 0.6, y + 0.6, BW - 1.2, bh - 1.2); }
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
