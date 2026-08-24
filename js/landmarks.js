// js/landmarks.js — builder B2 (landmark architect)
// Hand-modelled Burlington landmarks on their real OSM footprints. city.js skips every
// footprint listed in LANDMARK_IDS. Everything is primitives + tiny canvas textures,
// merged per-material so the whole set costs ~25 draw calls.
import * as THREE from '../vendor/three.module.min.js';
import { pointInPoly, polyCentroid } from './util.js';

export const LANDMARK_IDS = [
  'w166149257', // First Unitarian Universalist Society (head of Church St)
  'w28160084',  // Burlington City Hall
  'w938638122', // Ethan Allen Engine Co. No. 4 / BCA Center
  'w261330850', // Masonic Temple (1 Church St)
  'w614527246', // Richardson "Abernethy's" Building (2 Church St)
  'w28160078',  // Howard Opera House
  'w28160090',  // Abraham Building / Leunig's Bistro
  'w945624897', // Sweetwaters
  'w961730766', // Howard Bank Building / Northfield Savings (114-116 Church)
  'w938638120', // former Merchants Bank / Rí Rá (123 Church)
  'w237060110', // Burlington Savings Bank / Citizens (College & St Paul)
  'w614518204', // CityPlace / Burlington Square block
  'w613964827', // Flynn Theater
  'w945944100', // Nectar's (188 Main)
  'w97340758',  // Fletcher Free Library
  'w959618482', // GMT Downtown Transit Center
  'w460372783', // GMT bus canopy
];

// ---------------------------------------------------------------- merge helper
class Merger {
  constructor() { this.buckets = new Map(); this.m = new THREE.Matrix4(); this.tris = 0; }
  // geo: BufferGeometry (consumed). x,y,z,ry: placement. Optional scale.
  add(geo, mat, x = 0, y = 0, z = 0, ry = 0, sx = 1, sy = 1, sz = 1) {
    let g = geo.index ? geo.toNonIndexed() : geo.clone();
    if (geo.index) geo.dispose();
    if (ry || x || y || z || sx !== 1 || sy !== 1 || sz !== 1) {
      this.m.makeRotationY(ry);
      if (sx !== 1 || sy !== 1 || sz !== 1) this.m.scale(new THREE.Vector3(sx, sy, sz));
      this.m.setPosition(x, y, z);
      g.applyMatrix4(this.m);
    }
    if (!g.attributes.normal) g.computeVertexNormals();
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    let b = this.buckets.get(mat); if (!b) { b = { pos: [], nor: [], uv: [], n: 0 }; this.buckets.set(mat, b); }
    b.pos.push(g.attributes.position.array); b.nor.push(g.attributes.normal.array); b.uv.push(g.attributes.uv.array);
    b.n += g.attributes.position.count;
    this.tris += g.attributes.position.count / 3;
    g.dispose();
    return this;
  }
  flush(ctx, label) {
    const out = [];
    // On phones, every flat-coloured landmark material collapses into ONE vertex-coloured
    // mesh (~24 draw calls saved). Textured materials — signs, clocks, panels — stay put.
    if (ctx.quality.mobile) {
      const flat = [...this.buckets].filter(([m]) => !m.map && !m.emissiveMap && !m.transparent && m.isMeshLambertMaterial);
      if (flat.length > 1) {
        const merged = { pos: [], nor: [], uv: [], col: [], n: 0 };
        for (const [m, b] of flat) {
          const r = m.color.r, g = m.color.g, bl = m.color.b;
          const c = new Float32Array(b.n * 3);
          for (let i = 0; i < b.n; i++) { c[i * 3] = r; c[i * 3 + 1] = g; c[i * 3 + 2] = bl; }
          merged.pos.push(...b.pos); merged.nor.push(...b.nor); merged.uv.push(...b.uv); merged.col.push(c); merged.n += b.n;
          this.buckets.delete(m);
        }
        this.buckets.set(Merger.flatMat || (Merger.flatMat = Object.assign(new THREE.MeshLambertMaterial({ vertexColors: true }), { name: 'flat' })), merged);
      }
    }
    for (const [mat, b] of this.buckets) {
      const cat = (arrs, stride) => { const a = new Float32Array(b.n * stride); let o = 0; for (const s of arrs) { a.set(s, o); o += s.length; } return a; };
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(cat(b.pos, 3), 3));
      g.setAttribute('normal', new THREE.BufferAttribute(cat(b.nor, 3), 3));
      g.setAttribute('uv', new THREE.BufferAttribute(cat(b.uv, 2), 2));
      if (b.col) g.setAttribute('color', new THREE.BufferAttribute(cat(b.col, 3), 3));
      g.computeBoundingSphere();
      const mesh = new THREE.Mesh(g, mat);
      mesh.name = 'landmarks:' + (mat.name || 'mat');
      if (b.col) mesh.material.vertexColors = true;
      if (ctx.quality.shadows) { mesh.castShadow = true; mesh.receiveShadow = true; }
      mesh.matrixAutoUpdate = false; mesh.updateMatrix();
      ctx.scene.add(mesh); out.push(mesh);
    }
    this.buckets.clear();
    return out;
  }
}

// ---------------------------------------------------------------- sign atlases
const ROWS = 8;
class SignBook {
  constructor() { this.atlases = []; }
  _at() { let a = this.atlases[this.atlases.length - 1]; if (!a || a.items.length >= ROWS) { a = { items: [], mat: new THREE.MeshLambertMaterial({ color: 0xffffff }) }; a.mat.name = 'sign' + this.atlases.length; this.atlases.push(a); } return a; }
  // returns {geo, mat} — a plane w x h facing +Z, textured with one atlas row.
  plane(w, h, text, opts) {
    const a = this._at(), row = a.items.length; a.items.push({ text, opts: opts || {} });
    const g = new THREE.PlaneGeometry(w, h); const uv = g.attributes.uv;
    const v0 = 1 - (row + 1) / ROWS, dv = 1 / ROWS;
    for (let i = 0; i < uv.count; i++) uv.setY(i, v0 + uv.getY(i) * dv);
    return { geo: g, mat: a.mat };
  }
  finish() {
    for (const a of this.atlases) {
      const c = document.createElement('canvas'); c.width = 256; c.height = 256;
      const g = c.getContext('2d'); g.fillStyle = '#101010'; g.fillRect(0, 0, 256, 256);
      a.items.forEach((it, i) => {
        const y = i * 32, o = it.opts;
        g.fillStyle = o.bg || '#efeae0'; g.fillRect(0, y, 256, 32);
        if (o.line) { g.strokeStyle = o.line; g.lineWidth = 2; g.strokeRect(3, y + 3, 250, 26); }
        let size = o.size || 21;
        const fam = o.font || 'Georgia, "Times New Roman", serif';
        g.fillStyle = o.fg || '#2a2a2a'; g.font = `${o.weight || 'bold'} ${size}px ${fam}`;
        while (g.measureText(it.text).width > 242 && size > 6) { size -= 1; g.font = `${o.weight || 'bold'} ${size}px ${fam}`; }
        g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText(it.text, 128, y + 17);
      });
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
      a.mat.map = t; a.mat.needsUpdate = true;
    }
  }
}

function clockTexture(dark) {
  const S = 128, c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d');
  g.fillStyle = dark ? '#20242a' : '#f4f1e8'; g.beginPath(); g.arc(S / 2, S / 2, S / 2 - 1, 0, Math.PI * 2); g.fill();
  g.strokeStyle = dark ? '#c8c2b2' : '#1a1a1a'; g.fillStyle = dark ? '#c8c2b2' : '#1a1a1a';
  g.lineWidth = 3; g.beginPath(); g.arc(S / 2, S / 2, S / 2 - 4, 0, Math.PI * 2); g.stroke();
  const R = S / 2 - 12;
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 - Math.PI / 2;
    g.lineWidth = i % 3 === 0 ? 4 : 2;
    g.beginPath(); g.moveTo(S / 2 + Math.cos(a) * R, S / 2 + Math.sin(a) * R);
    g.lineTo(S / 2 + Math.cos(a) * (R - (i % 3 === 0 ? 11 : 6)), S / 2 + Math.sin(a) * (R - (i % 3 === 0 ? 11 : 6))); g.stroke();
  }
  // hands at 10:10
  g.lineWidth = 5; g.lineCap = 'round';
  g.beginPath(); g.moveTo(S / 2, S / 2); g.lineTo(S / 2 - 26, S / 2 - 20); g.stroke();
  g.beginPath(); g.moveTo(S / 2, S / 2); g.lineTo(S / 2 + 30, S / 2 - 16); g.stroke();
  g.beginPath(); g.arc(S / 2, S / 2, 4, 0, Math.PI * 2); g.fill();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}

// ---------------------------------------------------------------- geometry helpers
const B = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const PL = (w, h) => new THREE.PlaneGeometry(w, h);
const CY = (rt, rb, h, s = 10) => new THREE.CylinderGeometry(rt, rb, h, s);
const CN = (r, h, s = 10) => new THREE.ConeGeometry(r, h, s);

// Gable roof: ridge along local +Z, base w×d at y=0, ridge at y=h.
function gableGeo(w, d, h) {
  const hw = w / 2, hd = d / 2, v = [];
  const tri = (a, b, c) => v.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
  const A = [-hw, 0, -hd], Bv = [hw, 0, -hd], C = [hw, 0, hd], D = [-hw, 0, hd], R0 = [0, h, -hd], R1 = [0, h, hd];
  tri(A, D, R1); tri(A, R1, R0); tri(Bv, R0, R1); tri(Bv, R1, C); tri(A, R0, Bv); tri(D, C, R1);
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3)); g.computeVertexNormals(); return g;
}
// Rectangular frustum: base w×d at y=0, top tw×td at y=h. tw=td=0 → pyramid.
function frustumGeo(w, d, h, tw = 0, td = 0) {
  const hw = w / 2, hd = d / 2, tx = tw / 2, tz = td / 2, v = [];
  const P = (a, b, c) => v.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
  const q = (a, b, c, d2) => { P(a, b, c); P(a, c, d2); };
  const bs = [[-hw, 0, -hd], [hw, 0, -hd], [hw, 0, hd], [-hw, 0, hd]];
  const ts = [[-tx, h, -tz], [tx, h, -tz], [tx, h, tz], [-tx, h, tz]];
  for (let i = 0; i < 4; i++) { const j = (i + 1) % 4; q(bs[i], ts[i], ts[j], bs[j]); }
  if (tw > 0.01 && td > 0.01) q(ts[0], ts[3], ts[2], ts[1]);
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3)); g.computeVertexNormals(); return g;
}

// polygon → flat cap at height y (XZ plane, normal +Y)
function capGeo(pts, y) {
  const s = new THREE.Shape();
  s.moveTo(pts[0][0], -pts[0][1]);
  for (let i = 1; i < pts.length; i++) s.lineTo(pts[i][0], -pts[i][1]);
  s.closePath();
  const g = new THREE.ShapeGeometry(s);
  g.rotateX(-Math.PI / 2); g.translate(0, y, 0);
  return g;
}
// reverse a geometry's facing (for downward-facing soffits built from capGeo)
function flipGeo(g0) {
  const g = g0.index ? g0.toNonIndexed() : g0;
  const p = g.attributes.position.array, n = g.attributes.normal ? g.attributes.normal.array : null;
  for (let i = 0; i < p.length; i += 9) for (let k = 0; k < 3; k++) {
    const t = p[i + 3 + k]; p[i + 3 + k] = p[i + 6 + k]; p[i + 6 + k] = t;
    if (n) { const u = n[i + 3 + k]; n[i + 3 + k] = n[i + 6 + k]; n[i + 6 + k] = u; }
  }
  if (n) for (let i = 0; i < n.length; i++) n[i] = -n[i];
  return g;
}
// polygon side walls y0..y1 with outward normals. skip(mx,mz) may omit an edge.
function wallsGeo(pts, y0, y1, skip) {
  const p = orderPoly(pts), v = [];
  const tri = (a, b, c) => v.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
  for (let i = 0; i < p.length; i++) {
    const a = p[i], b = p[(i + 1) % p.length];
    if (Math.abs(a[0] - b[0]) < 1e-6 && Math.abs(a[1] - b[1]) < 1e-6) continue;
    if (skip && skip((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)) continue;
    const al = [a[0], y0, a[1]], bl = [b[0], y0, b[1]], bh = [b[0], y1, b[1]], ah = [a[0], y1, a[1]];
    tri(al, bl, bh); tri(al, bh, ah);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3)); g.computeVertexNormals(); return g;
}
// re-wind so that for edge a→b the normal (dz,-dx) points OUT of the polygon
function orderPoly(pts) {
  let bi = 0, bl = -1;
  for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; const l = Math.hypot(b[0] - a[0], b[1] - a[1]); if (l > bl) { bl = l; bi = i; } }
  const a = pts[bi], b = pts[(bi + 1) % pts.length];
  const dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz) || 1;
  const nx = dz / L, nz = -dx / L, mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2;
  return pointInPoly(mx + nx * 0.08, mz + nz * 0.08, pts) ? pts.slice().reverse() : pts;
}

// Facade frame for the edge a→b of a polygon whose centroid is (cx,cz).
// Local +X = û (direction of increasing u), local +Z = n̂ (outward). yaw = atan2(nx,nz).
function edgeFrame(a, b, cx, cz) {
  let dx = b[0] - a[0], dz = b[1] - a[1]; const L = Math.hypot(dx, dz) || 1;
  let ux = dx / L, uz = dz / L, nx = -uz, nz = ux;
  const mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2;
  if ((mx - cx) * nx + (mz - cz) * nz < 0) { nx = -nx; nz = -nz; ux = -ux; uz = -uz; }
  return { mx, mz, ux, uz, nx, nz, L, yaw: Math.atan2(nx, nz) };
}
const fx = (f, u, o) => f.mx + f.ux * u + f.nx * o;
const fz = (f, u, o) => f.mz + f.uz * u + f.nz * o;

// clip a polygon to a half-plane (axis 0=x, 1=z); keepGreater keeps p[axis] >= val
function clipHalf(pts, axis, val, keepGreater) {
  const out = [], f = (p) => keepGreater ? p[axis] >= val : p[axis] <= val;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length], fa = f(a), fb = f(b);
    if (fa) out.push(a);
    if (fa !== fb) { const t = (val - a[axis]) / (b[axis] - a[axis]); out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]); }
  }
  return out;
}
// offset every vertex outward from the centroid by d metres (cornice bands)
function expandPoly(pts, d) {
  const ce = polyCentroid(pts);
  return pts.map(p => { const dx = p[0] - ce[0], dz = p[1] - ce[1], L = Math.hypot(dx, dz) || 1; return [p[0] + dx / L * d, p[1] + dz / L * d]; });
}
// a sloped cylinder from (ax,ay,az) to (bx,by,bz)
function tubeGeo(r, ax, ay, az, bx, by, bz, seg = 6) {
  const dx = bx - ax, dy = by - ay, dz = bz - az, h = Math.hypot(dx, dz);
  const g = new THREE.CylinderGeometry(r, r, Math.hypot(h, dy), seg);
  g.rotateZ(Math.atan2(dy, h) - Math.PI / 2); g.rotateY(Math.atan2(-dz, dx));
  return g;
}
function minTerrain(terrain, pts) {
  let y = Infinity;
  for (const p of pts) y = Math.min(y, terrain.heightAt(p[0], p[1]));
  const c = polyCentroid(pts); y = Math.min(y, terrain.heightAt(c[0], c[1]));
  return y;
}

// ---------------------------------------------------------------- materials
function makeMats() {
  const L = (name, color, extra) => { const m = new THREE.MeshLambertMaterial(Object.assign({ color }, extra || {})); m.name = name; return m; };
  return {
    brickRed: L('brickRed', 0x8f4c3b),
    brickChurch: L('brickChurch', 0x9c5744),
    brickOrange: L('brickOrange', 0xa9563a),
    brickBuff: L('brickBuff', 0xb09274),
    white: L('white', 0xf2efe4),
    marble: L('marble', 0xe9e6dc),
    granite: L('granite', 0xa8a39a),
    graniteDark: L('graniteDark', 0x8b8780),
    slate: L('slate', 0x4b5158),
    spire: L('spire', 0x2c4738),
    copper: L('copper', 0x5f9b85),
    glass: L('glass', 0x28333d),
    glassLit: L('glassLit', 0x6d8a9c),
    brown: L('brownstone', 0x7c4b3b),
    stone: L('greyStone', 0x8b8781),
    teal: L('teal', 0x2b5a52),
    bronze: L('bronze', 0x5f8c74),
    iron: L('iron', 0x1f2225),
    banner: L('banner', 0xe3b431),
    steelRed: L('steelRed', 0xb0432c),
    crane: L('crane', 0xdda423),
    concrete: L('concrete', 0xb6b2aa),
    panel: L('panel', 0xd6d4ce),
    limestone: L('limestone', 0xd3cab5),
    cream: L('cream', 0xe7dfc9),
    hoard: L('hoard', 0x2f5d7c),
    deck: L('deck', 0x9c8663),
    piling: L('piling', 0x5b4a39),
    hull: L('hull', 0xeeece2),
    hullNavy: L('hullNavy', 0x24405c),
    hullRed: L('hullRed', 0x8e3a2f),
    sail: L('sail', 0xf6f4ec),
    rock: L('rock', 0x6b6862),
    lamp: new THREE.MeshBasicMaterial({ color: 0xffe6a8 }),
  };
}

// ================================================================ entry point
const L = {};

export function buildLandmarks(ctx) {
  const mg = new Merger(), mats = makeMats(), book = new SignBook();
  mats.lamp.name = 'lamp';
  const clockMat = new THREE.MeshLambertMaterial({ color: 0xffffff }); clockMat.name = 'clock';
  clockMat.map = clockTexture(false); clockMat.needsUpdate = true;

  const byId = new Map();
  for (const b of ctx.WORLD.buildings || []) byId.set(b.id, b);

  const c = {
    ctx, mg, mats, book, clockMat,
    get: (id) => byId.get(id),
    spot: (name, x, z, r, bonus) => ctx.spots.push({ name, x, z, r, bonus }),
    loc: (name, x, z, r) => ctx.locations.push({ name, x, z, r }),
    sign: (w, h, text, opts, x, y, z, ry) => { const s = book.plane(w, h, text, opts); mg.add(s.geo, s.mat, x, y, z, ry); },
  };

  const order = ['church', 'cityHall', 'firehouse', 'masonic', 'richardson', 'operaHouse', 'leunigs',
    'sweetwaters', 'marbleBank', 'riRa', 'savingsBank', 'burlingtonSquare', 'flynn', 'nectars',
    'library', 'transit', 'waterfront'];
  for (const k of order) {
    try { if (L[k]) L[k](c); }
    catch (e) { console.warn('[landmarks] ' + k + ' failed: ' + e.message, e); }
  }

  book.finish();
  const meshes = mg.flush(ctx, 'landmarks');
  console.info(`[landmarks] ${meshes.length} draw calls, ${Math.round(mg.tris)} tris`);
}

// ================================================================ landmark builders
// shared bits -----------------------------------------------------------------
const surfYaw = (f) => Math.atan2(-f.uz, f.ux); // yaw for collide.addSurface aligned to a facade frame

function shell(c, pts, y0, y1, mat, name, top) {
  c.mg.add(wallsGeo(pts, y0, y1), mat);
  c.mg.add(capGeo(pts, y1), mat);
  if (name !== null) c.ctx.collide.addPolygonWalls(pts, top === undefined ? y1 : top, name);
}
// window: light surround box behind a dark glass box, optional round-arched head
function win(c, f, u, y, w, h, out, fm, gm, arched) {
  const yc = y + h / 2;
  c.mg.add(B(w + 0.36, h + 0.30, 0.12), fm, fx(f, u, out), yc, fz(f, u, out), f.yaw);
  c.mg.add(B(w, h, 0.14), gm, fx(f, u, out + 0.06), yc, fz(f, u, out + 0.06), f.yaw);
  if (arched) {
    const r = w / 2;
    c.mg.add(new THREE.CircleGeometry(r + 0.18, 8, 0, Math.PI), fm, fx(f, u, out + 0.061), y + h, fz(f, u, out + 0.061), f.yaw);
    c.mg.add(new THREE.CircleGeometry(r, 8, 0, Math.PI), gm, fx(f, u, out + 0.075), y + h, fz(f, u, out + 0.075), f.yaw);
  }
}
// box in facade-local coords: w along the facade, h up, d outward
function fb(c, mat, f, u, y, out, w, h, d) {
  c.mg.add(B(w, h, d), mat, fx(f, u, out), y, fz(f, u, out), f.yaw);
}
// visual stair flight from (ax,az,yLow) up to (bx,bz,yHigh)
function stairSet(c, mat, ax, az, bx, bz, w, yLow, yHigh, n) {
  const yaw = Math.atan2(bx - ax, bz - az), run = Math.hypot(bx - ax, bz - az) / n, bot = yLow - 0.5;
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n, top = yLow + (yHigh - yLow) * (i + 1) / n;
    c.mg.add(B(w, top - bot, run * 1.03), mat, ax + (bx - ax) * t, (top + bot) / 2, az + (bz - az) * t, yaw);
  }
}

// ---------------------------------------------------------------- 1. Unitarian Church
L.church = function (c) {
  const b = c.get('w166149257'); if (!b) return;
  const { mg, mats, ctx } = c, pts = b.pts, ce = polyCentroid(pts);
  const y0 = minTerrain(ctx.terrain, pts);
  // south facade frame (faces down Church Street)
  const f = edgeFrame(pts[2], pts[3], ce[0], ce[1]);
  const EAVE = y0 + 11, RIDGE = 5.6;

  // --- body: red brick + white trim
  shell(c, pts, y0 - 1, EAVE, mats.brickChurch, 'Unitarian Church');
  // gable roof, ridge along the long (N–S) axis
  const nmid = [(pts[0][0] + pts[1][0]) / 2, (pts[0][1] + pts[1][1]) / 2];
  const roofYaw = Math.atan2(nmid[0] - f.mx, nmid[1] - f.mz);
  mg.add(gableGeo(f.L + 0.5, 44.6, RIDGE), mats.slate, ce[0], EAVE, ce[1], roofYaw);
  // white cornice band + corner pilaster strips
  mg.add(wallsGeo(expandPoly(pts, 0.22), EAVE - 0.75, EAVE + 0.15), mats.white);
  for (const p of pts) mg.add(B(1.15, EAVE - y0, 1.15), mats.white, p[0] * 0.997 + ce[0] * 0.003, (y0 + EAVE) / 2, p[1] * 0.997 + ce[1] * 0.003, roofYaw);
  // two rows of tall white-framed round-top windows on both long sides
  for (const s of [-1, 1]) {
    const ea = s < 0 ? pts[3] : pts[1], eb = s < 0 ? pts[0] : pts[2];
    const g = edgeFrame(ea, eb, ce[0], ce[1]);
    for (let i = 0; i < 6; i++) {
      const u = -g.L / 2 + 5.0 + i * ((g.L - 10) / 5);
      win(c, g, u, y0 + 2.4, 1.7, 3.0, 0.12, mats.white, mats.glass, true);
      win(c, g, u, y0 + 7.0, 1.7, 2.4, 0.12, mats.white, mats.glass, true);
    }
    fb(c, mats.white, g, 0, y0 + 6.3, 0.16, g.L, 0.35, 0.28);
  }

  // --- the tower, on the south face, centred on the Church Street axis
  const T = 7.6, tOut = 0.2;
  const TX = fx(f, 0, tOut), TZ = fz(f, 0, tOut);
  const tw = [[TX - 3.8, TZ - 3.8], [TX + 3.8, TZ - 3.8], [TX + 3.8, TZ + 3.8], [TX - 3.8, TZ + 3.8]];
  mg.add(B(T, 28, T), mats.brickChurch, TX, y0 - 1 + 14, TZ, f.yaw);
  ctx.collide.addPolygonWalls(tw, y0 + 27, 'Unitarian Church');
  // entrance pavilion: white, pedimented, round-arched door
  fb(c, mats.white, f, 0, y0 + 2.4, 4.9, 5.6, 4.8, 1.9);
  mg.add(gableGeo(5.9, 2.1, 1.5), mats.white, fx(f, 0, 4.9), y0 + 4.8, fz(f, 0, 4.9), f.yaw + Math.PI / 2);
  win(c, f, 0, y0 + 0.1, 2.0, 2.6, 5.85, mats.white, mats.brown, true);
  // tall arched window above, then the clock
  win(c, f, 0, y0 + 6.6, 2.2, 3.6, 4.05, mats.white, mats.glass, true);
  for (const [uu, oo] of [[0, 4.05], [-3.85, 0.2], [3.85, 0.2]]) {
    const yaw = uu === 0 ? f.yaw : f.yaw + (uu < 0 ? -Math.PI / 2 : Math.PI / 2);
    const px = fx(f, uu, oo), pz = fz(f, uu, oo);
    const rim = CY(1.62, 1.62, 0.2, 16); rim.rotateX(Math.PI / 2);
    mg.add(rim, mats.white, px + Math.sin(yaw) * 0.06, y0 + 15.6, pz + Math.cos(yaw) * 0.06, yaw);
    mg.add(new THREE.CircleGeometry(1.5, 16), c.clockMat, px + Math.sin(yaw) * 0.17, y0 + 15.6, pz + Math.cos(yaw) * 0.17, yaw);
  }
  // white cornice, octagonal belfry, lantern, dark green spire
  mg.add(B(T + 1.1, 1.0, T + 1.1), mats.white, TX, y0 + 27.5, TZ, f.yaw);
  mg.add(CY(3.35, 3.55, 6.2, 8), mats.white, TX, y0 + 31.1, TZ);
  for (let i = 0; i < 8; i++) {
    const a = f.yaw + i * Math.PI / 4;
    mg.add(B(1.5, 3.4, 0.2), mats.glass, TX + Math.sin(a) * 3.3, y0 + 31.0, TZ + Math.cos(a) * 3.3, a);
    mg.add(new THREE.CircleGeometry(0.75, 6, 0, Math.PI), mats.glass, TX + Math.sin(a) * 3.32, y0 + 32.7, TZ + Math.cos(a) * 3.32, a);
    mg.add(B(0.42, 1.1, 0.42), mats.white, TX + Math.sin(a) * 3.9, y0 + 34.8, TZ + Math.cos(a) * 3.9, a); // balustrade urns
  }
  mg.add(CY(3.9, 3.9, 0.55, 8), mats.white, TX, y0 + 34.5, TZ);
  mg.add(CY(2.15, 2.35, 4.2, 8), mats.white, TX, y0 + 36.7, TZ);
  mg.add(CY(1.9, 2.4, 0.5, 8), mats.white, TX, y0 + 39.0, TZ);
  mg.add(CN(1.85, 12.0, 8), mats.spire, TX, y0 + 45.3, TZ);
  mg.add(CY(0.09, 0.09, 3.2, 6), mats.iron, TX, y0 + 52.6, TZ);
  mg.add(B(1.1, 0.5, 0.06), mats.iron, TX, y0 + 53.6, TZ, 0.6);

  // --- terrace, steps and the plaza obelisk
  const PY = ctx.terrain.heightAt(fx(f, 0, 11), fz(f, 0, 11));
  const TT = Math.max(y0, PY) + 0.9;
  const tcx = fx(f, 0, 3.9), tcz = fz(f, 0, 3.9);
  mg.add(B(26, 2.4, 8.2), mats.granite, tcx, TT - 1.2, tcz, f.yaw);
  ctx.collide.addSurface({ x: tcx, z: tcz, w: 26, d: 8.2, yaw: surfYaw(f), top: TT, bottom: PY - 2, kind: 'platform', name: 'Church terrace' });
  stairSet(c, mats.granite, fx(f, 0, 9.8), fz(f, 0, 9.8), fx(f, 0, 8.0), fz(f, 0, 8.0), 10.5, PY, TT, 4);
  ctx.collide.addRamp({ ax: fx(f, 0, 9.6), az: fz(f, 0, 9.6), bx: fx(f, 0, 7.9), bz: fz(f, 0, 7.9), w: 10.5, yLow: PY, yHigh: TT, kind: 'stairs', name: 'Church terrace steps' });
  for (const s of [-1, 1]) ctx.collide.addEdge({ ax: fx(f, s * 5.4, 8.0), ay: TT, az: fz(f, s * 5.4, 8.0), bx: fx(f, s * 12.9, 8.0), by: TT, bz: fz(f, s * 12.9, 8.0), kind: 'ledge', name: 'Church terrace' });
  // low stone obelisk monument on the plaza
  const ox = fx(f, 3.5, 13.5), oz = fz(f, 3.5, 13.5);
  mg.add(B(1.5, 0.9, 1.5), mats.graniteDark, ox, PY + 0.05, oz, f.yaw);
  mg.add(frustumGeo(1.0, 1.0, 2.7, 0.55, 0.55), mats.granite, ox, PY + 0.5, oz, f.yaw);
  mg.add(CN(0.42, 0.5, 4), mats.granite, ox, PY + 3.45, oz, f.yaw);
  ctx.collide.addBlocker({ x: ox, z: oz, r: 0.9, name: 'Monument' });

  c.spot('Church terrace steps', fx(f, 0, 11), fz(f, 0, 11), 14, 300);
  c.loc('Unitarian Church', fx(f, 0, 7), fz(f, 0, 7), 19);
};

// ---------------------------------------------------------------- 2. Burlington City Hall
L.cityHall = function (c) {
  const b = c.get('w28160084'); if (!b) return;
  const { mg, mats, ctx } = c, pts = b.pts, ce = polyCentroid(pts);
  const y0 = minTerrain(ctx.terrain, pts);
  const E = edgeFrame(pts[3], pts[2], ce[0], ce[1]);   // east face, u increases NORTH
  const W = edgeFrame(pts[0], pts[1], ce[0], ce[1]);   // west (park) face, u increases SOUTH
  const GR = y0 + 3.6, BR = y0 + 16.2, CO = y0 + 18.6;
  // the plaza in front sits above the footprint minimum, so the stairs are based on it
  const PY = ctx.terrain.heightAt(fx(E, 0, 7), fz(E, 0, 7));
  const WY = ctx.terrain.heightAt(fx(W, 0, 5), fz(W, 0, 5));

  // --- massing: rusticated granite base, red brick, marble entablature, slate roof
  shell(c, pts, y0 - 1, GR, mats.granite, 'Burlington City Hall', BR);
  shell(c, pts, GR, BR, mats.brickRed, null);
  mg.add(wallsGeo(expandPoly(pts, 0.35), BR, CO), mats.marble);
  mg.add(capGeo(expandPoly(pts, 0.35), CO), mats.marble);
  mg.add(frustumGeo(23.5, 54, 4.6, 15, 44), mats.slate, ce[0], CO, ce[1], Math.atan2(pts[2][0] - pts[3][0], pts[2][1] - pts[3][1]));
  // rustication grooves in the granite storey
  for (let i = 1; i <= 3; i++) mg.add(wallsGeo(expandPoly(pts, 0.05), y0 + i * 0.9 - 0.07, y0 + i * 0.9 + 0.07), mats.graniteDark);

  // --- east (Church Street) facade: 9 bays, giant marble Corinthian pilasters
  for (const f of [E, W]) {
    const east = f === E;
    for (let k = -4; k <= 4; k++) {
      const u = k * 5.75;
      // pilaster on the bay boundary
      fb(c, mats.marble, f, u + 2.875, (GR + BR) / 2, 0.30, 1.15, BR - GR, 0.55);
      if (k === -4) fb(c, mats.marble, f, u - 2.875, (GR + BR) / 2, 0.30, 1.15, BR - GR, 0.55);
      // Corinthian capital
      fb(c, mats.marble, f, u + 2.875, BR - 0.75, 0.40, 1.55, 1.1, 0.78);
      if (k === -4) fb(c, mats.marble, f, u - 2.875, BR - 0.75, 0.40, 1.55, 1.1, 0.78);
      if (k === 0 && east) continue;
      win(c, f, u, GR + 1.5, 1.9, 3.9, 0.10, mats.marble, mats.glass, false);
      win(c, f, u, GR + 6.9, 1.9, 3.9, 0.10, mats.marble, mats.glass, false);
    }
    // marble sill band + the entablature dentils
    fb(c, mats.marble, f, 0, GR + 0.25, 0.22, f.L, 0.5, 0.42);
    for (let i = 0; i < 34; i++) fb(c, mats.marble, f, -f.L / 2 + 0.9 + i * (f.L - 1.8) / 33, BR + 0.85, 0.52, 0.42, 0.5, 0.42);
  }
  // centrepiece: arched entrance bay, fanlight, CITY HALL, cartouche
  fb(c, mats.marble, E, 0, GR + 2.1, 0.22, 5.6, 5.4, 0.5);
  win(c, E, 0, GR + 0.1, 2.9, 2.7, 0.5, mats.marble, mats.brown, true);
  for (let i = -2; i <= 2; i++) { const hh = 1.35 * Math.sqrt(Math.max(0.05, 1 - (i * 0.52 / 1.5) ** 2)); fb(c, mats.marble, E, i * 0.52, GR + 2.85 + hh / 2, 0.62, 0.11, hh, 0.1); }
  c.sign(3.2, 0.62, 'CITY HALL', { bg: '#e9e6dc', fg: '#33302b', font: 'Georgia, serif', size: 24 }, fx(E, 0, 0.52), GR + 5.0, fz(E, 0, 0.52), E.yaw);
  mg.add(CY(0.95, 0.95, 0.22, 12), mats.marble, fx(E, 0, 0.5), GR + 6.4, fz(E, 0, 0.5), 0);
  for (const s of [-1, 1]) mg.add(B(1.5, 0.42, 0.3), mats.marble, fx(E, s * 1.5, 0.42), GR + 6.6, fz(E, s * 1.5, 0.42), E.yaw, 1, 1, 1);

  // --- white cupola with clock and dome
  mg.add(B(5.2, 3.2, 5.2), mats.white, ce[0], CO + 4.6 + 1.6, ce[1], E.yaw);
  mg.add(B(4.2, 3.8, 4.2), mats.white, ce[0], CO + 9.8, ce[1], E.yaw);
  for (let i = 0; i < 4; i++) {
    const a = E.yaw + i * Math.PI / 2;
    mg.add(B(2.9, 3.2, 0.18), mats.slate, ce[0] + Math.sin(a) * 2.15, CO + 9.7, ce[1] + Math.cos(a) * 2.15, a);
    if (i % 2 === 0) { const q = new THREE.CircleGeometry(1.25, 14); mg.add(q, c.clockMat, ce[0] + Math.sin(a) * 2.3, CO + 9.9, ce[1] + Math.cos(a) * 2.3, a); }
  }
  mg.add(B(5.0, 0.5, 5.0), mats.white, ce[0], CO + 12.0, ce[1], E.yaw);
  mg.add(new THREE.SphereGeometry(2.1, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), mats.white, ce[0], CO + 12.2, ce[1]);
  mg.add(CY(0.07, 0.07, 2.2, 6), mats.iron, ce[0], CO + 15.4, ce[1]);

  // --- THE SPLIT DOUBLE GRANITE STAIRCASE (east face)
  const LAND = GR;  // landing = second-floor door level
  const oIn = 0.25, oOut = 3.55, oMid = (oIn + oOut) / 2;
  // central landing
  const lx = fx(E, 0, oMid), lz = fz(E, 0, oMid);
  mg.add(B(6.6, LAND - PY + 1.5, oOut - oIn), mats.granite, lx, (LAND + PY - 1.5) / 2, lz, E.yaw);
  // The physics box is bigger than the drawn landing on purpose. Longer (7.5 vs 6.6) so it
  // overlaps the top of each stair ramp — flush there was a ~0.3 m crack that dropped the
  // skater 2.4 m to the plaza. And 0.9 m deeper, out past the cheek walls, so you can line
  // up on the hubba and ollie onto it instead of falling off the corner first.
  const cOut = oOut + 0.9, cMid = (oIn + cOut) / 2;
  ctx.collide.addSurface({ x: fx(E, 0, cMid), z: fz(E, 0, cMid), w: 7.5, d: cOut - oIn, yaw: surfYaw(E), top: LAND, bottom: PY - 0.5, kind: 'platform', name: 'City Hall landing' });
  // recessed ground-level door + brick apron between the flights
  win(c, E, 0, PY + 0.05, 2.2, 2.4, 0.30, mats.granite, mats.brown, true);
  mg.add(B(5.5, 0.1, 4.2), mats.brickRed, fx(E, 0, oOut + 2.6), PY + 0.02, fz(E, 0, oOut + 2.6), E.yaw);
  // two symmetric flights climbing inward to the landing
  for (const s of [-1, 1]) {
    const uLo = s * 11.6, uHi = s * 3.4;
    const ax = fx(E, uLo, oMid), az = fz(E, uLo, oMid), bx = fx(E, uHi, oMid), bz = fz(E, uHi, oMid);
    stairSet(c, mats.granite, ax, az, bx, bz, oOut - oIn, PY, LAND, 12);
    ctx.collide.addRamp({ ax, az, bx, bz, w: oOut - oIn + 0.2, yLow: PY, yHigh: LAND, kind: 'stairs', name: 'City Hall steps', steps: 12 });
    // outer cheek wall — a sloped granite hubba along the flight
    const cw = 0.55, oCk = oOut + cw / 2;
    for (let i = 0; i < 6; i++) {
      const t0 = i / 6, t1 = (i + 1) / 6, tm = (t0 + t1) / 2;
      const top = PY + 0.52 + (LAND - PY) * tm;
      mg.add(B(Math.abs(uHi - uLo) / 6 * 1.04, top - (PY - 1.2), cw), mats.granite,
        fx(E, uLo + (uHi - uLo) * tm, oCk), (top + PY - 1.2) / 2, fz(E, uLo + (uHi - uLo) * tm, oCk), E.yaw);
    }
    ctx.collide.addEdge({ ax: fx(E, uLo, oCk), ay: PY + 0.52, az: fz(E, uLo, oCk), bx: fx(E, uHi, oCk), by: LAND + 0.52, bz: fz(E, uHi, oCk), kind: 'ledge', name: 'City Hall hubba' });
    // black iron handrail along the inner edge of each flight
    const oR = oIn + 0.55, hR = 0.95;
    for (let i = 0; i <= 6; i++) {
      const t = i / 6, u = uLo + (uHi - uLo) * t, yy = PY + (LAND - PY) * t;
      mg.add(CY(0.045, 0.045, hR, 6), mats.iron, fx(E, u, oR), yy + hR / 2, fz(E, u, oR), 0);
    }
    mg.add(tubeGeo(0.055, fx(E, uLo, oR), PY + hR, fz(E, uLo, oR), fx(E, uHi, oR), LAND + hR, fz(E, uHi, oR)), mats.iron,
      (fx(E, uLo, oR) + fx(E, uHi, oR)) / 2, (PY + LAND) / 2 + hR, (fz(E, uLo, oR) + fz(E, uHi, oR)) / 2);
    mg.add(tubeGeo(0.03, fx(E, uLo, oR), PY + hR * 0.5, fz(E, uLo, oR), fx(E, uHi, oR), LAND + hR * 0.5, fz(E, uHi, oR), 4), mats.iron,
      (fx(E, uLo, oR) + fx(E, uHi, oR)) / 2, (PY + LAND) / 2 + hR * 0.5, (fz(E, uLo, oR) + fz(E, uHi, oR)) / 2);
    ctx.collide.addEdge({ ax: fx(E, uLo, oR), ay: PY + hR, az: fz(E, uLo, oR), bx: fx(E, uHi, oR), by: LAND + hR, bz: fz(E, uHi, oR), kind: 'handrail', name: 'City Hall handrail' });
    // low curved granite retaining wall flanking the composition
    const uW = s * 13.0;
    mg.add(B(0.7, 1.7, 5.6), mats.granite, fx(E, uW, oMid + 0.6), PY - 0.28, fz(E, uW, oMid + 0.6), E.yaw);
    ctx.collide.addSurface({ x: fx(E, uW, oMid + 0.6), z: fz(E, uW, oMid + 0.6), w: 0.7, d: 5.6, yaw: surfYaw(E), top: PY + 0.57, bottom: PY - 1.2, kind: 'ledge', name: 'City Hall wall', grindable: true });
  }

  // --- the bronzes: deer (north) and mother bear with cub (south)
  for (const s of [-1, 1]) {
    const u = s * 15.2, o = 2.4, px = fx(E, u, o), pz = fz(E, u, o);
    mg.add(B(2.0, 1.75, 1.7), mats.graniteDark, px, PY + 0.10, pz, E.yaw + s * 0.12);
    ctx.collide.addSurface({ x: px, z: pz, w: 2.0, d: 1.7, yaw: surfYaw(E) + s * 0.12, top: PY + 0.98, bottom: PY - 0.9, kind: 'ledge', name: s > 0 ? 'Deer block' : 'Bear block', grindable: true, allEdges: true });
    const by = PY + 0.98, yaw = E.yaw + s * 0.12;
    if (s > 0) { // deer (north), mid-stride, head up
      mg.add(B(1.5, 0.62, 0.5), mats.bronze, px, by + 1.05, pz, yaw);
      mg.add(B(0.28, 0.85, 0.3), mats.bronze, px + Math.cos(yaw) * 0.68, by + 1.6, pz - Math.sin(yaw) * 0.68, yaw + 0.3);
      mg.add(B(0.5, 0.32, 0.34), mats.bronze, px + Math.cos(yaw) * 0.85, by + 2.0, pz - Math.sin(yaw) * 0.85, yaw);
      for (const [a, bq] of [[0.55, 0.18], [0.55, -0.18], [-0.55, 0.18], [-0.55, -0.18]])
        mg.add(B(0.16, 0.78, 0.16), mats.bronze, px + Math.cos(yaw) * a + Math.sin(yaw) * bq, by + 0.38, pz - Math.sin(yaw) * a + Math.cos(yaw) * bq, yaw);
      for (const d of [-1, 1]) { mg.add(B(0.09, 0.72, 0.09), mats.bronze, px + Math.cos(yaw) * 0.9 + Math.sin(yaw) * d * 0.16, by + 2.42, pz - Math.sin(yaw) * 0.9 + Math.cos(yaw) * d * 0.16, yaw, 1, 1, 1); mg.add(B(0.07, 0.34, 0.07), mats.bronze, px + Math.cos(yaw) * 1.05 + Math.sin(yaw) * d * 0.3, by + 2.65, pz - Math.sin(yaw) * 1.05 + Math.cos(yaw) * d * 0.3, yaw + d * 0.4); }
    } else { // mother bear on all fours, cub on her back
      mg.add(B(1.7, 0.8, 0.72), mats.bronze, px, by + 0.86, pz, yaw);
      mg.add(B(0.62, 0.5, 0.52), mats.bronze, px + Math.cos(yaw) * 0.95, by + 1.0, pz - Math.sin(yaw) * 0.95, yaw + 0.35);
      for (const [a, bq] of [[0.62, 0.24], [0.62, -0.24], [-0.62, 0.24], [-0.62, -0.24]])
        mg.add(B(0.24, 0.5, 0.24), mats.bronze, px + Math.cos(yaw) * a + Math.sin(yaw) * bq, by + 0.28, pz - Math.sin(yaw) * a + Math.cos(yaw) * bq, yaw);
      mg.add(B(0.75, 0.42, 0.42), mats.bronze, px - Math.cos(yaw) * 0.15, by + 1.45, pz + Math.sin(yaw) * 0.15, yaw + 0.2);
      mg.add(B(0.34, 0.3, 0.3), mats.bronze, px + Math.cos(yaw) * 0.3, by + 1.6, pz - Math.sin(yaw) * 0.3, yaw + 0.2);
    }
  }

  // --- west (park) facade: plainer steps up to the door
  const wT = WY + 1.1;
  stairSet(c, mats.granite, fx(W, 0, 4.4), fz(W, 0, 4.4), fx(W, 0, 2.0), fz(W, 0, 2.0), 14.6, WY, wT, 5);
  mg.add(B(14.6, 3.2, 2.4), mats.granite, fx(W, 0, 0.9), wT - 1.6, fz(W, 0, 0.9), W.yaw);
  ctx.collide.addSurface({ x: fx(W, 0, 0.9), z: fz(W, 0, 0.9), w: 14.6, d: 2.4, yaw: surfYaw(W), top: wT, bottom: WY - 1, kind: 'platform', name: 'City Hall west steps' });
  ctx.collide.addRamp({ ax: fx(W, 0, 4.5), az: fz(W, 0, 4.5), bx: fx(W, 0, 2.0), bz: fz(W, 0, 2.0), w: 14.6, yLow: WY, yHigh: wT, kind: 'stairs', name: 'City Hall west steps' });
  win(c, W, 0, wT + 0.1, 2.6, 3.0, 0.32, mats.marble, mats.brown, true);

  c.spot('City Hall steps', fx(E, 0, 7.5), fz(E, 0, 7.5), 15, 500);
  c.spot('City Hall hubba', fx(E, 8.5, 5.2), fz(E, 8.5, 5.2), 7, 350);
  c.loc('Burlington City Hall', fx(E, 0, 4), fz(E, 0, 4), 13);
};


// ---------------------------------------------------------------- 3. BCA Center / Ethan Allen Firehouse
L.firehouse = function (c) {
  const b = c.get('w938638122'); if (!b) return;
  const { mg, mats, ctx } = c, pts = b.pts, ce = polyCentroid(pts);
  const y0 = minTerrain(ctx.terrain, pts);
  const F = edgeFrame(pts[3], pts[0], ce[0], ce[1]);  // east face onto Church St, u increases north
  const TOP = y0 + 14;

  const SILL = y0 + 5.35;
  // upper wall over the whole footprint; the ground storey leaves the Church St face open
  mg.add(wallsGeo(pts, SILL, TOP), mats.brickOrange);
  mg.add(capGeo(pts, TOP), mats.brickOrange);
  mg.add(wallsGeo(pts, y0 - 1, SILL, (mx, mz) => Math.hypot(mx - fx(F, 0, 0), mz - fz(F, 0, 0)) < 2), mats.brickOrange);
  ctx.collide.addPolygonWalls(pts, TOP, 'BCA Center');
  // the recessed apparatus bay behind the piers
  fb(c, mats.brickOrange, F, 0, y0 + 2.2, -2.7, F.L, 6.6, 0.5);
  fb(c, mats.graniteDark, F, 0, y0 - 0.4, -1.3, F.L, 0.9, 3.0);
  // corbelled brick cornice
  mg.add(wallsGeo(expandPoly(pts, 0.22), TOP - 1.1, TOP - 0.55), mats.brickOrange);
  mg.add(wallsGeo(expandPoly(pts, 0.42), TOP - 0.55, TOP + 0.5), mats.brickOrange);

  // --- ground floor: brownstone base course + four rough piers + two open apparatus bays
  fb(c, mats.brown, F, 0, y0 + 0.25, 0.44, F.L, 0.55, 0.9);
  ctx.collide.addSurface({ x: fx(F, 0, 0.44), z: fz(F, 0, 0.44), w: F.L, d: 0.9, yaw: surfYaw(F), top: y0 + 0.52, bottom: y0 - 0.4, kind: 'ledge', name: 'Firehouse piers', grindable: true });
  for (const u of [-4.75, -1.6, 1.6, 4.75]) {
    fb(c, mats.brown, F, u, y0 + 2.4, 0.30, 0.95, 3.8, 0.62);
    fb(c, mats.brown, F, u, y0 + 4.35, 0.36, 1.2, 0.35, 0.75);   // cap
  }
  // brick panel between the middle piers, with the glazed entrance door
  fb(c, mats.brickOrange, F, 0, y0 + 2.2, -0.1, 2.3, 6.6, 0.5);
  fb(c, mats.glass, F, 0, y0 + 1.7, 0.14, 2.0, 3.0, 0.16);
  fb(c, mats.brown, F, 0, y0 + 3.45, 0.2, 2.2, 0.5, 0.3);
  // the two bays stay open to a recess; glazing sits at the back of the reveal
  for (const u of [-3.18, 3.18]) {
    fb(c, mats.glass, F, u, y0 + 2.35, -2.45, 2.3, 3.9, 0.14);
    for (const d of [-0.7, 0, 0.7]) fb(c, mats.iron, F, u + d, y0 + 2.4, 0.16, 0.1, 4.0, 0.12);
    for (const yy of [0.6, 2.4, 4.2]) fb(c, mats.iron, F, u, y0 + yy, 0.16, 2.3, 0.1, 0.12);
  }
  // the orange antique fire engine parked in the left (south) bay
  const ex = fx(F, -3.18, -1.5), ez = fz(F, -3.18, -1.5);
  mg.add(B(3.4, 1.0, 1.4), mats.steelRed, ex, y0 + 1.15, ez, F.yaw + Math.PI / 2);
  mg.add(B(1.2, 0.9, 1.35), mats.steelRed, fx(F, -4.1, -1.5), y0 + 2.0, fz(F, -4.1, -1.5), F.yaw + Math.PI / 2);
  mg.add(B(3.6, 0.16, 0.16), mats.iron, ex, y0 + 1.95, ez, F.yaw + Math.PI / 2);
  for (const [du, dv] of [[-1.2, 0.58], [-1.2, -0.58], [1.1, 0.58], [1.1, -0.58]])
    mg.add(CY(0.34, 0.34, 0.22, 8), mats.iron, fx(F, -3.18 + du, -1.5 + dv), y0 + 0.4, fz(F, -3.18 + du, -1.5 + dv), F.yaw + Math.PI / 2, 1, 1, 1);

  // --- the carved belt course: · ETHAN · ALLEN · ENGINE · CO · NO · 4 ·
  fb(c, mats.brown, F, 0, y0 + 4.85, 0.34, F.L, 1.0, 0.7);
  c.sign(F.L - 0.5, 0.66, '· ETHAN · ALLEN · ENGINE · CO · NO · 4 ·',
    { bg: '#7c4b3b', fg: '#e2cdbe', size: 17, font: 'Georgia, serif' }, fx(F, 0, 0.71), y0 + 4.9, fz(F, 0, 0.71), F.yaw);

  // --- upper floors: one huge round-arched window flanked by two narrower ones
  const arches = [[0, 3.4, 4.9], [-3.55, 1.55, 4.4], [3.55, 1.55, 4.4]];
  for (const [u, w, h] of arches) {
    win(c, F, u, y0 + 5.9, w, h, 0.10, mats.brickOrange, mats.teal, true);
    // dark teal mullion grid inside
    for (let k = -1; k <= 1; k++) if (Math.abs(k) < w / 1.6) fb(c, mats.teal, F, u + k * w / 3, y0 + 5.9 + h / 2 + 0.4, 0.2, 0.1, h + w * 0.7, 0.08);
    for (let r = 1; r <= 3; r++) fb(c, mats.teal, F, u, y0 + 5.9 + r * h / 4, 0.2, w - 0.1, 0.09, 0.08);
    // brick voussoir ring
    mg.add(new THREE.RingGeometry(w / 2 + 0.18, w / 2 + 0.62, 10, 1, 0, Math.PI), mats.brickBuff, fx(F, u, 0.17), y0 + 5.9 + h, fz(F, u, 0.17), F.yaw);
  }
  // yellow vertical BCA banners
  for (const u of [-1.85, 1.85]) {
    fb(c, mats.banner, F, u, y0 + 8.7, 0.52, 0.85, 4.9, 0.06);
    fb(c, mats.iron, F, u, y0 + 11.2, 0.55, 1.0, 0.08, 0.08);
  }

  c.sign(3.6, 0.6, 'BCA Center', { bg: '#1d2a2e', fg: '#f0e3a8', size: 20 }, fx(F, F.L * 0.28, 0.52), y0 + 3.6, fz(F, F.L * 0.28, 0.52), F.yaw);

  // --- the hose-drying tower, set back behind the front wall
  const tx = fx(F, 0.4, -8.6), tz = fz(F, 0.4, -8.6), TW = 5.4;
  mg.add(B(TW, 25, TW), mats.brickOrange, tx, y0 + 11.5, tz, F.yaw);
  mg.add(B(TW + 0.6, 0.7, TW + 0.6), mats.brickOrange, tx, y0 + 24.3, tz, F.yaw);
  mg.add(B(TW + 0.3, 4.2, TW + 0.3), mats.slate, tx, y0 + 26.7, tz, F.yaw);
  for (let i = 0; i < 4; i++) {
    const a = F.yaw + i * Math.PI / 2;
    mg.add(B(1.7, 2.1, 0.16), mats.glass, tx + Math.sin(a) * (TW / 2 + 0.16), y0 + 26.3, tz + Math.cos(a) * (TW / 2 + 0.16), a);
    mg.add(new THREE.CircleGeometry(0.85, 8, 0, Math.PI), mats.glass, tx + Math.sin(a) * (TW / 2 + 0.17), y0 + 27.35, tz + Math.cos(a) * (TW / 2 + 0.17), a);
  }
  mg.add(B(0.9, 0.9, 0.9), mats.iron, tx, y0 + 26.6, tz, F.yaw); // the bell
  mg.add(frustumGeo(TW + 1.4, TW + 1.4, 6.2, 0, 0), mats.slate, tx, y0 + 28.9, tz, F.yaw);
  ctx.collide.addPolygonWalls([[tx - 2.7, tz - 2.7], [tx + 2.7, tz - 2.7], [tx + 2.7, tz + 2.7], [tx - 2.7, tz + 2.7]], y0 + 24, 'BCA Center');

  c.spot('Firehouse piers', fx(F, 0, 2.2), fz(F, 0, 2.2), 9, 300);
  c.loc('BCA Center · the Firehouse', fx(F, 0, 2.5), fz(F, 0, 2.5), 7);
};

// ---------------------------------------------------------------- 4. Masonic Temple
L.masonic = function (c) {
  const b = c.get('w261330850'); if (!b) return;
  const { mg, mats, ctx } = c, pts = b.pts, ce = polyCentroid(pts);
  const y0 = minTerrain(ctx.terrain, pts);
  const E = edgeFrame(pts[1], pts[2], ce[0], ce[1]);  // east face onto Church St (u north)
  const N = edgeFrame(pts[0], pts[1], ce[0], ce[1]);  // north face onto Pearl St (u west)
  const TOP = y0 + 26;

  shell(c, pts, y0 - 1, TOP, mats.stone, 'Masonic Temple');
  // heavy coursed masonry: floor bands
  for (let i = 1; i <= 4; i++) mg.add(wallsGeo(expandPoly(pts, 0.12), y0 + 4.6 + i * 4.4, y0 + 4.9 + i * 4.4), mats.graniteDark);
  mg.add(wallsGeo(expandPoly(pts, 0.45), TOP - 1.2, TOP + 0.4), mats.stone);

  for (const f of [E, N]) {
    const bays = Math.max(3, Math.round(f.L / 6.2)), bw = f.L / bays;
    for (let i = 0; i < bays; i++) {
      const u = -f.L / 2 + bw * (i + 0.5);
      // round-arched storefront at ground level
      win(c, f, u, y0 + 0.3, bw - 2.0, 3.0, 0.12, mats.stone, mats.glass, true);
      for (let r = 0; r < 4; r++) win(c, f, u, y0 + 6.6 + r * 4.4, 1.6, 2.6, 0.10, mats.stone, mats.glass, r === 3);
    }
    fb(c, mats.graniteDark, f, 0, y0 + 4.9, 0.28, f.L, 0.7, 0.5);
  }
  // Pearl Street stair windows climbing diagonally
  for (let i = 0; i < 8; i++) fb(c, mats.glass, N, -10.5 + i * 2.7, y0 + 6.0 + i * 2.05, 0.16, 1.3, 1.8, 0.2);

  // steep slate pyramid over the corner, intersected by gables
  const cx = pts[1][0] + (ce[0] - pts[1][0]) * 0.30, cz = pts[1][1] + (ce[1] - pts[1][1]) * 0.30;
  mg.add(frustumGeo(18.5, 18.5, 14, 1.2, 1.2), mats.slate, cx, TOP + 0.4, cz, E.yaw);
  mg.add(gableGeo(8.5, 11, 4.6), mats.slate, cx + Math.sin(E.yaw) * 5.6, TOP + 3.0, cz + Math.cos(E.yaw) * 5.6, E.yaw + Math.PI / 2);
  mg.add(gableGeo(8.5, 11, 4.6), mats.slate, cx + Math.sin(N.yaw) * 5.6, TOP + 3.0, cz + Math.cos(N.yaw) * 5.6, N.yaw + Math.PI / 2);
  // the rest of the roof
  mg.add(frustumGeo(30, 25, 3.0, 22, 17), mats.slate, ce[0], TOP + 0.4, ce[1], E.yaw);

  c.sign(4.0, 0.62, 'Chase', { bg: '#0f3c78', fg: '#f2f4f8', size: 22 }, fx(E, 0, 0.5), y0 + 4.2, fz(E, 0, 0.5), E.yaw);
  c.loc('Masonic Temple', fx(E, 4, 2.5), fz(E, 4, 2.5), 7.5);
};

// ---------------------------------------------------------------- 5. Richardson Building ("Abernethy's")
L.richardson = function (c) {
  const b = c.get('w614527246'); if (!b) return;
  const { mg, mats, ctx } = c, pts = b.pts, ce = polyCentroid(pts);
  const y0 = minTerrain(ctx.terrain, pts);
  const W = edgeFrame(pts[0], pts[1], ce[0], ce[1]);  // west face onto Church St (u south)
  const N = edgeFrame(pts[1], pts[2], ce[0], ce[1]);  // north face onto Pearl St (u west)
  const TOP = y0 + 17;

  shell(c, pts, y0 - 1, TOP, mats.brickRed, 'Richardson Building');
  mg.add(wallsGeo(expandPoly(pts, 0.35), TOP - 0.7, TOP + 0.35), mats.brickBuff);
  // steep roof with dormers
  mg.add(frustumGeo(28, 30, 6.2, 18, 20), mats.slate, ce[0], TOP + 0.35, ce[1], W.yaw);

  for (const f of [W, N]) {
    const bays = Math.max(3, Math.round(f.L / 4.6)), bw = f.L / bays;
    for (let i = 0; i < bays; i++) {
      const u = -f.L / 2 + bw * (i + 0.5);
      fb(c, mats.glass, f, u, y0 + 2.2, 0.12, bw - 1.0, 3.2, 0.24);         // storefront
      for (let r = 0; r < 3; r++) win(c, f, u, y0 + 5.6 + r * 3.7, 1.3, 2.3, 0.09, mats.brickBuff, mats.glass, false);
      if (i % 2 === 1) { // small iron balcony
        fb(c, mats.iron, f, u, y0 + 5.45, 0.55, 2.0, 0.12, 1.0);
        for (let k = -3; k <= 3; k++) fb(c, mats.iron, f, u + k * 0.3, y0 + 5.9, 0.98, 0.06, 0.9, 0.06);
        fb(c, mats.iron, f, u, y0 + 6.35, 0.98, 2.0, 0.09, 0.1);
      }
    }
    // dormers in the steep roof
    for (let i = 0; i < 3; i++) {
      const u = -f.L / 3 + i * f.L / 3;
      fb(c, mats.slate, f, u, TOP + 2.1, -1.0, 2.0, 3.0, 2.4);
      fb(c, mats.glass, f, u, TOP + 2.1, 0.15, 1.2, 1.7, 0.2);
      mg.add(gableGeo(2.6, 2.6, 1.2), mats.slate, fx(f, u, -0.7), TOP + 3.6, fz(f, u, -0.7), f.yaw + Math.PI / 2);
    }
  }
  // signature: round turret bays capped by green conical roofs with finials
  const turret = (px, pz, r, yLo, yHi, coneH) => {
    mg.add(CY(r, r, yHi - yLo, 12), mats.brickRed, px, (yLo + yHi) / 2, pz);
    mg.add(CY(r + 0.22, r + 0.22, 0.4, 12), mats.brickBuff, px, yHi - 0.2, pz);
    mg.add(CN(r + 0.35, coneH, 12), mats.copper, px, yHi + coneH / 2, pz);
    mg.add(CY(0.06, 0.06, 1.6, 5), mats.copper, px, yHi + coneH + 0.8, pz);
    mg.add(new THREE.SphereGeometry(0.22, 7, 5), mats.copper, px, yHi + coneH + 0.35, pz);
  };
  for (const u of [-8.5, 8.5]) turret(fx(W, u, 1.1), fz(W, u, 1.1), 1.85, y0 + 4.0, TOP, 4.6);
  const cnr = pts[1], inx = (ce[0] - cnr[0]), inz = (ce[1] - cnr[1]), iL = Math.hypot(inx, inz);
  turret(cnr[0] + inx / iL * 1.5, cnr[1] + inz / iL * 1.5, 2.35, y0 + 3.4, TOP + 1.8, 6.4);
  c.sign(3.0, 0.55, 'Kru Coffee', { bg: '#2b2320', fg: '#e6d9c4', size: 20 }, fx(W, -11.1, 0.30), y0 + 4.3, fz(W, -11.1, 0.30), W.yaw);
  // the upstairs bar keeps its own sign a storey above the shopfront band
  c.sign(3.4, 0.6, 'Top of the Block', { bg: '#1c2b33', fg: '#e4d6b4', size: 18 }, fx(W, 3.6, 0.30), y0 + 8.5, fz(W, 3.6, 0.30), W.yaw);

  c.loc("Richardson Building · Abernethy's", fx(W, 0, 2.5), fz(W, 0, 2.5), 7.5);
};

// ---------------------------------------------------------------- 6. Howard Opera House
L.operaHouse = function (c) {
  const b = c.get('w28160078'); if (!b) return;
  const { mg, mats, ctx } = c, pts = b.pts, ce = polyCentroid(pts);
  const y0 = minTerrain(ctx.terrain, pts);
  const E = edgeFrame(pts[1], pts[2], ce[0], ce[1]);  // Church St face, u increases north
  const N = edgeFrame(pts[0], pts[1], ce[0], ce[1]);  // Bank St face, u increases west
  const TOP = y0 + 20;

  shell(c, pts, y0 - 1, TOP, mats.brickRed, 'Howard Opera House');
  // stone trim bands
  fb(c, mats.marble, E, 0, y0 + 4.6, 0.26, E.L, 0.55, 0.46);
  fb(c, mats.marble, N, 0, y0 + 4.6, 0.26, N.L, 0.55, 0.46);
  fb(c, mats.marble, E, 0, y0 + 18.4, 0.26, E.L, 0.5, 0.46);
  // battlemented galvanised-iron cornice
  mg.add(wallsGeo(expandPoly(pts, 0.42), TOP - 1.0, TOP + 0.45), mats.stone);
  for (const f of [E, N]) {
    const n = Math.floor(f.L / 1.7);
    for (let i = 0; i < n; i++) fb(c, mats.stone, f, -f.L / 2 + 0.85 + i * (f.L - 1.7) / (n - 1), TOP + 0.9, 0.42, 0.85, 0.9, 0.55);
  }

  // five large round-arched bays on the Church Street face
  for (let k = -2; k <= 2; k++) {
    const u = k * 7.25;
    win(c, E, u, y0 + 6.2, 4.8, 5.6, 0.12, mats.brickBuff, mats.glass, true);
    for (let r = 1; r <= 2; r++) fb(c, mats.iron, E, u, y0 + 6.2 + r * 3.4, 0.22, 4.7, 0.11, 0.1);
    fb(c, mats.iron, E, u, y0 + 9.6, 0.22, 0.12, 8.6, 0.1);
    fb(c, mats.brickBuff, E, u + 3.62, y0 + 12.4, 0.24, 0.9, 13.2, 0.42);
    if (k === -2) fb(c, mats.brickBuff, E, u - 3.62, y0 + 12.4, 0.24, 0.9, 13.2, 0.42);
  }
  // Bank Street face: three arched bays
  for (let k = -1; k <= 1; k++) win(c, N, k * 9.5, y0 + 6.4, 4.4, 5.2, 0.12, mats.brickBuff, mats.glass, true);

  // ground-floor storefronts, signs at the real POI positions
  const tenants = [['Ecco', 13.28, '#1d2b3a', '#e8e2d4'], ['Pascolo', 6.48, '#3a2118', '#e9d9b8'],
  ['Frog Hollow · crafted in vermont', -0.32, '#1f4636', '#ecebe0'], ['Golden Hour', -7.02, '#5c3a12', '#f2dfae'],
  ['Phoenix Books', -13.82, '#2a2438', '#e6dff0']];
  for (const [name, u, bg, fg] of tenants) {
    fb(c, mats.glass, E, u, y0 + 2.0, 0.14, 5.6, 3.2, 0.24);
    fb(c, mats.iron, E, u, y0 + 0.25, 0.22, 5.7, 0.5, 0.16);
    c.sign(5.2, 0.68, name, { bg, fg, size: 20 }, fx(E, u, 0.32), y0 + 4.0, fz(E, u, 0.32), E.yaw);
  }
  for (let k = -1; k <= 1; k++) fb(c, mats.glass, N, k * 9.5, y0 + 2.0, 0.14, 6.0, 3.2, 0.24);

  c.loc('Howard Opera House', fx(E, 0, 2.5), fz(E, 0, 2.5), 8);
};

// ---------------------------------------------------------------- 7. Leunig's Bistro (Abraham Building)
L.leunigs = function (c) {
  const b = c.get('w28160090'); if (!b) return;
  const { mg, mats, ctx } = c, pts = b.pts, ce = polyCentroid(pts);
  const y0 = minTerrain(ctx.terrain, pts);
  const E = edgeFrame(pts[0], pts[1], ce[0], ce[1]);  // Church St face
  const S = edgeFrame(pts[1], pts[2], ce[0], ce[1]);  // College St face
  const TOP = y0 + 12.6;

  shell(c, pts, y0 - 1, TOP, mats.cream, "Leunig's Bistro", y0 + 16.4);
  // the Church Street wing is a storey taller
  const wing = [pts[0], pts[1], [fx(E, E.L / 2, -8.5), fz(E, E.L / 2, -8.5)], [fx(E, -E.L / 2, -8.5), fz(E, -E.L / 2, -8.5)]];
  mg.add(wallsGeo(wing, TOP, y0 + 16.4), mats.cream);
  mg.add(capGeo(wing, y0 + 16.4), mats.cream);
  // parapet caps + thin brown Art Deco line detailing
  mg.add(wallsGeo(expandPoly(pts, 0.14), TOP - 0.5, TOP + 0.5), mats.brown);
  fb(c, mats.brown, E, 0, y0 + 16.9, 0.16, E.L + 0.3, 0.55, 0.4);

  for (const f of [E, S]) {
    const h = f === E ? 16.4 : 12.6, rows = f === E ? 4 : 3;
    const bays = Math.max(2, Math.round(f.L / 4.4)), bw = f.L / bays;
    for (let r = 0; r < rows - 1; r++) fb(c, mats.brown, f, 0, y0 + 4.4 + r * 3.6, 0.14, f.L, 0.14, 0.24);
    for (let i = 0; i < bays; i++) {
      const u = -f.L / 2 + bw * (i + 0.5);
      // ground floor: dark glass with a cream awning band
      fb(c, mats.glass, f, u, y0 + 2.1, 0.10, bw - 0.9, 3.0, 0.2);
      for (let r = 1; r < rows; r++) {
        // square windows framed in pale glass block
        const yy = y0 + 4.4 + (r - 1) * 3.6 + 1.55;
        fb(c, mats.glassLit, f, u, yy, 0.16, bw - 1.4, 2.3, 0.16);
        for (let k = -1; k <= 1; k++) fb(c, mats.cream, f, u + k * (bw - 1.4) / 3, yy, 0.24, 0.09, 2.3, 0.06);
        for (let k = -1; k <= 1; k++) fb(c, mats.cream, f, u, yy + k * 0.72, 0.24, bw - 1.4, 0.09, 0.06);
        fb(c, mats.brown, f, u, yy, 0.13, bw - 1.15, 2.55, 0.12);
      }
    }
    fb(c, mats.cream, f, 0, y0 + 3.85, 0.42, f.L, 0.75, 0.85);  // awning band
  }
  c.sign(4.6, 0.8, "Leunig's", { bg: '#e7dfc9', fg: '#5a3a20', size: 26, font: 'Georgia, serif' }, fx(E, 0, 0.5), y0 + 16.9, fz(E, 0, 0.5), E.yaw);
  c.sign(4.6, 0.62, "Leunig's Bistro & Café", { bg: '#2c2016', fg: '#e9d9b8', size: 18 }, fx(E, -5.4, 0.5), y0 + 3.9, fz(E, -5.4, 0.5), E.yaw);
  c.sign(3.8, 0.62, 'Danforth Pewter', { bg: '#3b4148', fg: '#e8ebee', size: 18 }, fx(E, 5.4, 0.5), y0 + 3.9, fz(E, 5.4, 0.5), E.yaw);
  c.loc("Leunig's corner", fx(E, -5, 2.5), fz(E, -5, 2.5), 7.5);
};

// ---------------------------------------------------------------- 8. Sweetwaters
L.sweetwaters = function (c) {
  const b = c.get('w945624897'); if (!b) return;
  const { mg, mats, ctx } = c, pts = b.pts, ce = polyCentroid(pts);
  const y0 = minTerrain(ctx.terrain, pts);
  const W = edgeFrame(pts[3], pts[4], ce[0], ce[1]);  // Church St face
  const N = edgeFrame(pts[4], pts[5], ce[0], ce[1]);  // College St face
  const TOP = y0 + 11.5;

  shell(c, pts, y0 - 1, TOP, mats.brickRed, 'Sweetwaters');
  mg.add(wallsGeo(expandPoly(pts, 0.4), TOP - 1.1, TOP + 0.5), mats.marble);
  for (const f of [W, N]) {
    fb(c, mats.marble, f, 0, y0 + 4.5, 0.24, f.L, 0.6, 0.44);
    fb(c, mats.marble, f, 0, y0 + 8.6, 0.20, f.L, 0.35, 0.38);
    const bays = Math.max(3, Math.round(f.L / 4.2)), bw = f.L / bays;
    for (let i = 0; i < bays; i++) {
      const u = -f.L / 2 + bw * (i + 0.5);
      fb(c, mats.glass, f, u, y0 + 2.1, 0.12, bw - 0.8, 3.4, 0.24);
      win(c, f, u, y0 + 5.3, 1.5, 2.6, 0.10, mats.marble, mats.glass, true);
    }
  }
  // clock on the corner
  const cnx = pts[4][0], cnz = pts[4][1];
  const inx = ce[0] - cnx, inz = ce[1] - cnz, iL = Math.hypot(inx, inz);
  const cyaw = Math.atan2(-inx / iL, -inz / iL);
  const px = cnx + inx / iL * 0.9, pz = cnz + inz / iL * 0.9;
  const rim = CY(1.15, 1.15, 0.24, 14); rim.rotateX(Math.PI / 2);
  mg.add(B(3.0, TOP - y0 + 1, 3.0), mats.brickRed, cnx + inx / iL * 1.5, y0 + (TOP - y0) / 2, cnz + inz / iL * 1.5, cyaw);
  mg.add(rim, mats.marble, px + Math.sin(cyaw) * 0.5, y0 + 7.4, pz + Math.cos(cyaw) * 0.5, cyaw);
  mg.add(new THREE.CircleGeometry(1.02, 14), c.clockMat, px + Math.sin(cyaw) * 0.63, y0 + 7.4, pz + Math.cos(cyaw) * 0.63, cyaw);
  c.sign(4.6, 0.75, 'Sweetwaters', { bg: '#123c2c', fg: '#f0e6cc', size: 24, font: 'Georgia, serif' }, fx(W, 0, 0.34), y0 + 4.5, fz(W, 0, 0.34), W.yaw);
  c.loc('Sweetwaters corner', fx(W, 0, 2.5), fz(W, 0, 2.5), 7.5);
};

// ---------------------------------------------------------------- 9a. the white marble bank
L.marbleBank = function (c) {
  const b = c.get('w961730766'); if (!b) return;
  const { mg, mats, ctx } = c, pts = b.pts, ce = polyCentroid(pts);
  const y0 = minTerrain(ctx.terrain, pts);
  const W = edgeFrame(pts[0], pts[1], ce[0], ce[1]);  // Church St face
  const TOP = y0 + 15;

  shell(c, pts, y0 - 1, TOP, mats.marble, 'Northfield Savings Bank', y0 + 17);
  mg.add(wallsGeo(expandPoly(pts, 0.45), TOP, y0 + 17), mats.marble);
  mg.add(capGeo(expandPoly(pts, 0.45), y0 + 17), mats.marble);
  // rusticated marble base
  for (let i = 1; i <= 3; i++) mg.add(wallsGeo(expandPoly(pts, 0.05), y0 + i * 0.85, y0 + i * 0.85 + 0.09), mats.granite);
  // grand arched entry flanked by pilasters
  win(c, W, 0, y0 + 0.2, 3.4, 4.6, 0.18, mats.marble, mats.brown, true);
  for (const s of [-1, 1]) fb(c, mats.marble, W, s * 2.9, y0 + 5.6, 0.34, 1.0, 11.2, 0.6);
  fb(c, mats.marble, W, 0, y0 + 11.6, 0.28, W.L, 0.6, 0.5);
  for (const u of [-4.6, 4.6]) { win(c, W, u, y0 + 1.6, 1.5, 3.0, 0.12, mats.granite, mats.glass, false); win(c, W, u, y0 + 6.4, 1.5, 3.2, 0.12, mats.granite, mats.glass, false); }
  win(c, W, 0, y0 + 6.8, 2.6, 4.0, 0.12, mats.granite, mats.glass, true);
  c.sign(4.4, 0.6, 'Northfield Savings Bank', { bg: '#e9e6dc', fg: '#2d4a33', size: 17 }, fx(W, 0, 0.42), y0 + 5.5, fz(W, 0, 0.42), W.yaw);
  c.loc('Northfield Savings Bank', fx(W, 0, 2.5), fz(W, 0, 2.5), 7);
};

// ---------------------------------------------------------------- 9b. Rí Rá / former Merchants Bank
L.riRa = function (c) {
  const b = c.get('w938638120'); if (!b) return;
  const { mg, mats, ctx } = c, pts = b.pts, ce = polyCentroid(pts);
  const y0 = minTerrain(ctx.terrain, pts);
  const E = edgeFrame(pts[2], pts[3], ce[0], ce[1]);  // Church St face
  const BASE = y0 + 12, TOP = y0 + 27;

  shell(c, pts, y0 - 1, BASE, mats.marble, 'Rí Rá', TOP);
  shell(c, pts, BASE, TOP, mats.brickBuff, null);
  mg.add(wallsGeo(expandPoly(pts, 0.3), BASE - 0.7, BASE + 0.2), mats.marble);
  mg.add(wallsGeo(expandPoly(pts, 0.35), TOP - 0.6, TOP + 0.4), mats.brickBuff);
  // pale classical bank front
  for (const s of [-1, 1]) fb(c, mats.marble, E, s * 3.3, y0 + 7.4, 0.32, 1.1, 9.0, 0.6);
  fb(c, mats.glass, E, 0, y0 + 2.2, 0.10, 5.2, 3.6, 0.2);
  win(c, E, 0, y0 + 5.6, 2.8, 4.0, 0.16, mats.marble, mats.glass, true);
  for (let r = 0; r < 4; r++) for (const u of [-3.3, 0, 3.3]) win(c, E, u, BASE + 1.2 + r * 3.6, 1.3, 2.2, 0.09, mats.marble, mats.glass, false);
  c.sign(3.4, 0.7, 'Rí Rá', { bg: '#1d3a24', fg: '#e8d9a8', size: 26, font: 'Georgia, serif' }, fx(E, 0, 0.32), y0 + 4.5, fz(E, 0, 0.32), E.yaw);
  c.loc('Rí Rá', fx(E, 0, 2.5), fz(E, 0, 2.5), 7);
};

// ---------------------------------------------------------------- 10. Burlington Savings Bank (Citizens)
L.savingsBank = function (c) {
  const b = c.get('w237060110'); if (!b) return;
  const { mg, mats, ctx } = c, pts = b.pts, ce = polyCentroid(pts);
  const y0 = minTerrain(ctx.terrain, pts);
  const CH = edgeFrame(pts[4], pts[0], ce[0], ce[1]);  // the chamfered corner at College & St Paul
  const S = edgeFrame(pts[3], pts[4], ce[0], ce[1]);
  const W = edgeFrame(pts[0], pts[1], ce[0], ce[1]);
  const TOP = y0 + 17;

  shell(c, pts, y0 - 1, TOP, mats.brickRed, 'Burlington Savings Bank', y0 + 22);
  for (let i = 1; i <= 3; i++) mg.add(wallsGeo(expandPoly(pts, 0.06), y0 + i * 1.2, y0 + i * 1.2 + 0.12), mats.brown);
  mg.add(wallsGeo(expandPoly(pts, 0.12), y0 - 1, y0 + 4.0), mats.brown);
  mg.add(wallsGeo(expandPoly(pts, 0.38), TOP - 0.8, TOP + 0.3), mats.brown);
  mg.add(frustumGeo(20, 26, 4.4, 12, 18), mats.slate, ce[0], TOP + 0.3, ce[1], W.yaw);
  for (const f of [S, W]) {
    const bays = Math.max(2, Math.round(f.L / 4.6)), bw = f.L / bays;
    for (let i = 0; i < bays; i++) {
      const u = -f.L / 2 + bw * (i + 0.5);
      win(c, f, u, y0 + 0.8, bw - 1.6, 2.6, 0.14, mats.brown, mats.glass, true);
      for (let r = 0; r < 3; r++) win(c, f, u, y0 + 5.2 + r * 3.9, 1.5, 2.5, 0.10, mats.brown, mats.glass, false);
      // wall dormer breaking the cornice
      if (i % 2 === 0) {
        fb(c, mats.brickRed, f, u, TOP + 1.6, 0.1, 3.0, 3.6, 0.9);
        mg.add(gableGeo(3.4, 1.4, 1.9), mats.brown, fx(f, u, 0.1), TOP + 3.4, fz(f, u, 0.1), f.yaw + Math.PI / 2);
        fb(c, mats.glass, f, u, TOP + 1.9, 0.6, 1.4, 2.0, 0.15);
      }
    }
  }
  // recessed corner entrance: Ionic columns under a brownstone segmental arch
  for (const s of [-1, 1]) {
    mg.add(CY(0.34, 0.38, 5.2, 10), mats.marble, fx(CH, s * 1.15, 1.0), y0 + 2.6, fz(CH, s * 1.15, 1.0));
    mg.add(CY(0.5, 0.42, 0.42, 10), mats.marble, fx(CH, s * 1.15, 1.0), y0 + 5.35, fz(CH, s * 1.15, 1.0));
  }
  fb(c, mats.brown, CH, 0, y0 + 6.1, 0.9, 4.6, 1.3, 1.6);
  mg.add(new THREE.CircleGeometry(2.1, 10, 0, Math.PI), mats.brown, fx(CH, 0, 1.75), y0 + 6.6, fz(CH, 0, 1.75), CH.yaw);
  fb(c, mats.glass, CH, 0, y0 + 2.6, -0.4, 3.6, 5.0, 0.2);
  // corner tower with a conical roof
  const tx = fx(CH, 0, -1.9), tz = fz(CH, 0, -1.9);
  mg.add(CY(2.7, 2.7, 15, 12), mats.brickRed, tx, y0 + 7.4, tz);
  mg.add(CY(3.0, 3.0, 0.6, 12), mats.brown, tx, y0 + 15.1, tz);
  mg.add(CN(3.1, 7.2, 12), mats.slate, tx, y0 + 19.0, tz);
  mg.add(CY(0.07, 0.07, 2.0, 5), mats.iron, tx, y0 + 23.4, tz);
  for (let i = 0; i < 4; i++) mg.add(B(1.2, 1.9, 0.2), mats.glass, tx + Math.sin(CH.yaw + i * 1.57) * 2.65, y0 + 11.5, tz + Math.cos(CH.yaw + i * 1.57) * 2.65, CH.yaw + i * 1.57);
  c.sign(3.6, 0.6, 'Citizens Bank', { bg: '#0d5138', fg: '#f2f0e6', size: 20 }, fx(CH, 0, 1.9), y0 + 7.4, fz(CH, 0, 1.9), CH.yaw);
  c.loc('Burlington Savings Bank', fx(CH, 0, 5), fz(CH, 0, 5), 13);
};

// ---------------------------------------------------------------- 11. Burlington Square (tower + construction site)
L.burlingtonSquare = function (c) {
  const b = c.get('w614518204'); if (!b) return;
  const { mg, mats, ctx } = c, pts = b.pts, ce = polyCentroid(pts);
  const y0 = minTerrain(ctx.terrain, pts);

  // --- the SOUTH half is built: a two-storey masonry-toned podium. The north half is
  //     still an open construction site, so the podium is clipped at z = -181.
  const POD = y0 + 9, SITE_Z = -181;
  const pod = clipHalf(pts, 1, SITE_Z, true), pce = polyCentroid(pod);
  shell(c, pod, y0 - 1, POD, mats.concrete, 'Burlington Square');
  mg.add(wallsGeo(expandPoly(pod, 0.3), POD - 0.6, POD + 0.4), mats.stone);
  // ground-floor glazing around the podium
  for (let i = 0; i < pod.length; i++) {
    const a = pod[i], d = pod[(i + 1) % pod.length];
    const f = edgeFrame(a, d, pce[0], pce[1]); if (f.L < 6) continue;
    const n = Math.max(1, Math.floor(f.L / 6));
    for (let k = 0; k < n; k++) fb(c, mats.glass, f, -f.L / 2 + f.L / n * (k + 0.5), y0 + 2.6, 0.12, f.L / n - 1.2, 4.4, 0.2);
  }
  // chain-link fence along the open north edge of the site
  const site = clipHalf(pts, 1, SITE_Z, false);
  for (let i = 0; i < site.length; i++) {
    const a = site[i], d = site[(i + 1) % site.length], len = Math.hypot(d[0] - a[0], d[1] - a[1]);
    if (len < 4 || Math.abs(a[1] - SITE_Z) < 0.5 && Math.abs(d[1] - SITE_Z) < 0.5) continue;
    if (a[0] > -22 && d[0] > -22) continue;  // the Church St side is hoarded instead
    const n = Math.ceil(len / 3);
    for (let k = 0; k <= n; k++) {
      const t = k / n, px = a[0] + (d[0] - a[0]) * t, pz = a[1] + (d[1] - a[1]) * t, g = ctx.terrain.heightAt(px, pz);
      mg.add(B(0.12, 2.3, 0.12), mats.iron, px, g + 1.15, pz);
    }
    const g0 = ctx.terrain.heightAt(a[0], a[1]);
    const yaw = Math.atan2(d[0] - a[0], d[1] - a[1]);
    mg.add(B(0.05, 2.0, len), mats.stone, (a[0] + d[0]) / 2, g0 + 1.2, (a[1] + d[1]) / 2, yaw);
    ctx.collide.addWall({ ax: a[0], az: a[1], bx: d[0], bz: d[1], top: g0 + 2.3, name: 'Site fence' });
  }

  // --- SOUTH BUILDING: 11 storeys, Vermont's tallest, fronting Bank Street
  const TX = -84, TZ = -173, TW = 26, TD = 18, TOP = y0 + 43;
  mg.add(B(TW, TOP - POD, TD), mats.panel, TX, (POD + TOP) / 2, TZ);
  for (let fl = 0; fl < 10; fl++) {
    const yy = POD + 1.6 + fl * 3.4;
    for (const [ax, az, w, yaw] of [[0, -TD / 2 - 0.06, TW - 2.2, 0], [0, TD / 2 + 0.06, TW - 2.2, Math.PI], [-TW / 2 - 0.06, 0, TD - 2.2, -Math.PI / 2], [TW / 2 + 0.06, 0, TD - 2.2, Math.PI / 2]]) {
      mg.add(B(w, 2.3, 0.16), mats.glassLit, TX + ax, yy, TZ + az, yaw);
      for (let m = -1; m <= 1; m++) mg.add(B(0.18, 2.4, 0.2), mats.panel, TX + ax + (yaw % Math.PI === 0 ? m * w / 3 : 0), yy, TZ + az + (yaw % Math.PI === 0 ? 0 : m * w / 3), yaw);
      if (fl >= 6) { // apartment balconies on floors 8–11
        mg.add(B(w * 0.42, 0.16, 1.7), mats.panel, TX + ax * 1.06, yy - 1.3, TZ + az * 1.1, yaw);
        mg.add(B(w * 0.42, 1.0, 0.08), mats.glassLit, TX + ax * 1.12, yy - 0.8, TZ + az * 1.19, yaw);
      }
    }
  }
  mg.add(B(TW + 0.9, 0.7, TD + 0.9), mats.stone, TX, TOP + 0.2, TZ);
  mg.add(B(7, 3.2, 6), mats.concrete, TX + 5, TOP + 1.6, TZ);   // rooftop plant
  ctx.collide.addPolygonWalls([[TX - TW / 2, TZ - TD / 2], [TX + TW / 2, TZ - TD / 2], [TX + TW / 2, TZ + TD / 2], [TX - TW / 2, TZ + TD / 2]], TOP, 'Burlington Square');

  // --- NORTH HALF: an active construction site
  const SX = -46, SZ = -192, SG = ctx.terrain.heightAt(SX, SZ);
  // partial steel frame, 4 storeys of orange-red columns and beams
  for (let i = 0; i < 4; i++) for (let k = 0; k < 3; k++) {
    const px = SX - 12 + i * 8, pz = SZ - 6 + k * 6, g = ctx.terrain.heightAt(px, pz);
    mg.add(B(0.5, 14, 0.5), mats.steelRed, px, g + 7, pz);
    for (let fl = 1; fl <= 3; fl++) {
      const yy = g + fl * 4.4;
      if (i < 3) mg.add(B(8, 0.55, 0.35), mats.steelRed, px + 4, yy, pz);
      if (k < 2) mg.add(B(0.35, 0.55, 6), mats.steelRed, px, yy, pz + 3);
      if (fl === 3 && i < 3 && k < 2) mg.add(B(8, 0.14, 6), mats.stone, px + 4, yy + 0.35, pz + 3);
    }
    ctx.collide.addBlocker({ x: px, z: pz, r: 0.45, name: 'Steel column' });
  }
  // yellow tower crane
  const CX = SX + 16, CZ = SZ - 2, CG = ctx.terrain.heightAt(CX, CZ);
  mg.add(B(5, 1.2, 5), mats.concrete, CX, CG + 0.6, CZ);
  for (const [dx, dz] of [[-0.8, -0.8], [0.8, -0.8], [0.8, 0.8], [-0.8, 0.8]]) mg.add(B(0.28, 44, 0.28), mats.crane, CX + dx, CG + 23.2, CZ + dz);
  for (let i = 0; i < 14; i++) { const yy = CG + 2 + i * 3.1; mg.add(B(1.9, 0.16, 0.16), mats.crane, CX, yy, CZ - 0.8); mg.add(B(1.9, 0.16, 0.16), mats.crane, CX, yy, CZ + 0.8); mg.add(B(0.16, 0.16, 1.9), mats.crane, CX - 0.8, yy, CZ); mg.add(B(0.16, 0.16, 1.9), mats.crane, CX + 0.8, yy, CZ); }
  mg.add(B(3.2, 2.4, 3.0), mats.crane, CX, CG + 46.4, CZ);                 // cab / slewing unit
  mg.add(B(34, 1.3, 1.3), mats.crane, CX + 15, CG + 47.4, CZ);             // jib
  mg.add(B(11, 1.6, 1.6), mats.crane, CX - 7.5, CG + 47.4, CZ);            // counter-jib
  mg.add(B(3.0, 2.2, 2.6), mats.concrete, CX - 12.5, CG + 47.2, CZ);       // counterweight
  mg.add(CY(0.05, 0.05, 22, 4), mats.iron, CX + 24, CG + 35.6, CZ);        // hoist cable
  mg.add(B(0.9, 1.2, 0.9), mats.iron, CX + 24, CG + 24.0, CZ);             // hook block
  ctx.collide.addBlocker({ x: CX, z: CZ, r: 2.6, name: 'Tower crane' });

  // --- hoarding + covered walkway + jersey barriers along the Church Street edge
  const HZ0 = -170, HZ1 = -205, HX = -17.6;
  mg.add(B(0.25, 2.9, HZ0 - HZ1), mats.hoard, HX, SG + 1.45, (HZ0 + HZ1) / 2);
  mg.add(B(0.4, 0.22, HZ0 - HZ1), mats.stone, HX, SG + 2.95, (HZ0 + HZ1) / 2);
  ctx.collide.addWall({ ax: HX, az: HZ0, bx: HX, bz: HZ1, top: SG + 2.9, name: 'Hoarding' });
  for (let i = 0; i < 3; i++) {
    const zz = HZ1 + 6 + i * 11.5;
    const s = c.book.plane(9.5, 1.9, 'BURLINGTON SQUARE · COMING 2027', { bg: '#2f5d7c', fg: '#f4f1e6', size: 18 });
    const g2 = s.geo; g2.rotateY(Math.PI / 2);
    mg.add(g2, s.mat, HX + 0.15, SG + 1.6, zz);
  }
  // covered pedestrian walkway hugging the hoarding
  mg.add(B(3.2, 0.22, HZ0 - HZ1), mats.stone, HX + 1.75, SG + 3.5, (HZ0 + HZ1) / 2);
  for (let zz = HZ1 + 2; zz < HZ0; zz += 5) {
    mg.add(B(0.22, 3.5, 0.22), mats.iron, HX + 3.2, SG + 1.75, zz);
    ctx.collide.addBlocker({ x: HX + 3.2, z: zz, r: 0.16, top: SG + 3.5, name: 'Walkway post' });
  }
  // jersey barriers — grindable, at the edge of the active zone (the centre lane stays clear)
  const BX = HX + 4.3;
  for (let k = 0; k < 11; k++) {
    const zz = HZ1 + 4 + k * 3.3, g = ctx.terrain.heightAt(BX, zz);
    mg.add(frustumGeo(0.62, 3.1, 0.86, 0.24, 3.1), mats.concrete, BX, g, zz);
    ctx.collide.addSurface({ x: BX, z: zz, w: 0.5, d: 3.1, yaw: 0, top: g + 0.86, bottom: g, kind: 'ledge', name: 'Construction barriers', grindable: true });
  }
  c.spot('Construction barriers', BX, (HZ0 + HZ1) / 2, 18, 200);
  c.loc('Burlington Square', TX + 16, TZ - 2, 22);
  c.loc('Burlington Square site', SX, SZ, 20);
};

// ---------------------------------------------------------------- 12. The Flynn
L.flynn = function (c) {
  const b = c.get('w613964827'); if (!b) return;
  const { mg, mats, ctx } = c, pts = b.pts, ce = polyCentroid(pts);
  const y0 = minTerrain(ctx.terrain, pts);
  const F = edgeFrame(pts[0], pts[1], ce[0], ce[1]);  // the Main Street facade

  shell(c, pts, y0 - 1, y0 + 12, mats.brickBuff, 'The Flynn', y0 + 24);
  // fly tower behind
  mg.add(B(19, 12, 21), mats.brickBuff, fx(F, -2, -22), y0 + 18, fz(F, -2, -22), F.yaw);
  // --- Art Deco facade block
  fb(c, mats.brickBuff, F, 0, y0 + 8.5, 1.1, F.L + 0.6, 17, 2.4);
  fb(c, mats.marble, F, 0, y0 + 7.4, 2.35, F.L + 0.6, 0.55, 0.35);        // belt course
  for (let k = -2; k <= 2; k++) {                                          // fluted pilasters
    fb(c, mats.marble, F, k * 4.0, y0 + 8.8, 2.4, 1.0, 13.6, 0.4);
    for (const d of [-0.22, 0, 0.22]) fb(c, mats.brickBuff, F, k * 4.0 + d, y0 + 8.8, 2.56, 0.09, 13.2, 0.16);
    fb(c, mats.marble, F, k * 4.0, y0 + 15.9, 2.5, 1.3, 0.9, 0.55);        // stylised capital
  }
  for (const u of [-2.0, 2.0, -6.0, 6.0]) { fb(c, mats.glass, F, u, y0 + 10.6, 2.4, 2.3, 4.2, 0.3); fb(c, mats.marble, F, u, y0 + 8.3, 2.45, 2.7, 0.3, 0.3); }
  // stepped parapet with the FLYNN panel
  fb(c, mats.brickBuff, F, 0, y0 + 17.6, 1.1, F.L + 0.6, 1.6, 2.4);
  fb(c, mats.brickBuff, F, 0, y0 + 19.0, 1.1, 12.5, 1.6, 2.4);
  fb(c, mats.brickBuff, F, 0, y0 + 20.2, 1.1, 7.0, 1.4, 2.4);
  fb(c, mats.marble, F, 0, y0 + 18.5, 2.36, 8.4, 2.0, 0.2);
  c.sign(7.4, 1.4, 'FLYNN', { bg: '#e9e6dc', fg: '#3a3330', size: 30, font: 'Georgia, serif' }, fx(F, 0, 2.5), y0 + 18.5, fz(F, 0, 2.5), F.yaw);
  // --- the projecting sheet-metal marquee
  const MY = y0 + 5.6, MW = 13.5, MD = 3.4;
  fb(c, mats.iron, F, 0, MY, 2.3 + MD / 2, MW, 2.3, MD);
  fb(c, mats.stone, F, 0, MY + 1.3, 2.3 + MD / 2, MW + 0.5, 0.35, MD + 0.5);
  fb(c, mats.stone, F, 0, MY - 1.25, 2.3 + MD / 2, MW + 0.5, 0.35, MD + 0.5);
  // rear-lit attraction boards on the three faces
  fb(c, mats.glassLit, F, 0, MY, 2.32 + MD, MW - 1.2, 1.6, 0.1);
  for (const s of [-1, 1]) mg.add(B(0.1, 1.6, MD - 0.8), mats.glassLit, fx(F, s * (MW / 2 + 0.06), 2.3 + MD / 2), MY, fz(F, s * (MW / 2 + 0.06), 2.3 + MD / 2), F.yaw);
  // FLYNN in framed channel letters on top of the marquee
  fb(c, mats.iron, F, 0, MY + 2.5, 2.3 + MD / 2, 6.4, 1.9, 0.5);
  c.sign(5.8, 1.35, 'FLYNN', { bg: '#12161a', fg: '#ffd98a', size: 30, weight: 'bold', font: 'Helvetica, Arial, sans-serif' }, fx(F, 0, 2.58 + MD / 2), MY + 2.5, fz(F, 0, 2.58 + MD / 2), F.yaw);
  // a ring of chaser lights around the marquee edge
  for (let i = 0; i < 22; i++) {
    const u = -MW / 2 + 0.4 + i * (MW - 0.8) / 21;
    for (const yy of [MY + 1.52, MY - 1.47]) mg.add(new THREE.SphereGeometry(0.11, 5, 4), mats.lamp, fx(F, u, 2.34 + MD), yy, fz(F, u, 2.34 + MD));
  }
  for (let i = 0; i < 5; i++) for (const s of [-1, 1]) {
    const o = 2.5 + i * (MD - 0.4) / 4;
    for (const yy of [MY + 1.52, MY - 1.47]) mg.add(new THREE.SphereGeometry(0.11, 5, 4), mats.lamp, fx(F, s * (MW / 2 + 0.28), o), yy, fz(F, s * (MW / 2 + 0.28), o));
  }
  // ground floor: doors under the marquee
  for (const u of [-4.2, 0, 4.2]) fb(c, mats.glass, F, u, y0 + 1.9, 1.55, 3.0, 3.4, 0.2);
  c.loc('The Flynn', fx(F, 0, 8), fz(F, 0, 8), 15);
};

// ---------------------------------------------------------------- 13. Nectar's (closed)
L.nectars = function (c) {
  const b = c.get('w945944100'); if (!b) return;
  const { mg, mats, ctx } = c, pts = b.pts, ce = polyCentroid(pts);
  const y0 = minTerrain(ctx.terrain, pts);
  const S = edgeFrame(pts[2], pts[3], ce[0], ce[1]);  // Main Street facade
  const TOP = y0 + 14;

  shell(c, pts, y0 - 1, TOP, mats.brickRed, "Nectar's");
  mg.add(wallsGeo(expandPoly(pts, 0.28), TOP - 0.7, TOP + 0.35), mats.brickBuff);
  for (let r = 0; r < 3; r++) for (let k = -1; k <= 1; k++) win(c, S, k * 4.4, y0 + 5.6 + r * 2.9, 1.3, 1.9, 0.10, mats.brickBuff, mats.glass, false);
  // papered-over storefront windows
  for (const u of [-4.6, 4.6]) { fb(c, mats.cream, S, u, y0 + 2.2, 0.12, 4.0, 3.0, 0.16); fb(c, mats.iron, S, u, y0 + 2.2, 0.20, 4.2, 0.12, 0.12); }
  fb(c, mats.iron, S, 0, y0 + 1.7, 0.14, 2.4, 3.4, 0.2);
  // the dark, unlit marquee with a faded ghost of the old name
  fb(c, mats.iron, S, 0, y0 + 5.0, 1.3, 9.0, 1.9, 2.6);
  fb(c, mats.stone, S, 0, y0 + 6.05, 1.3, 9.4, 0.28, 3.0);
  c.sign(8.0, 1.5, "NECTAR'S", { bg: '#25211d', fg: '#3c352c', size: 28, weight: 'bold', font: 'Helvetica, Arial, sans-serif' }, fx(S, 0, 2.62), y0 + 5.0, fz(S, 0, 2.62), S.yaw);
  c.loc("Nectar's · closed", fx(S, 0, 4), fz(S, 0, 4), 11);
};

// ---------------------------------------------------------------- 15a. Fletcher Free Library
L.library = function (c) {
  const b = c.get('w97340758'); if (!b) return;
  const { mg, mats, ctx } = c, pts = b.pts;
  const y0 = minTerrain(ctx.terrain, pts);
  const TOP = y0 + 12;
  shell(c, pts, y0 - 1, TOP, mats.limestone, 'Fletcher Free Library', y0 + 16);
  mg.add(wallsGeo(expandPoly(pts, 0.35), TOP - 0.8, TOP + 0.4), mats.limestone);
  // taller central Carnegie block, kept well inside the footprint
  mg.add(B(40, 16, 17), mats.limestone, 180, y0 + 8, 23);
  mg.add(B(41, 1.0, 18), mats.limestone, 180, y0 + 16.2, 23);
  // the north (College Street) elevation: tall arched windows
  const NF = { mx: 178, mz: 12.0, ux: 1, uz: 0, nx: 0, nz: -1, L: 60, yaw: Math.PI };
  for (let i = -3; i <= 3; i++) if (Math.abs(i) > 1) win(c, NF, i * 8.0, y0 + 5.2, 2.0, 4.0, 0.2, mats.limestone, mats.glass, true);

  // --- columned portico + stone steps, projecting north toward College Street
  const PX = 171, WALL = 12.0, PG = ctx.terrain.heightAt(PX, WALL - 5);
  const ST = PG + 1.8;
  mg.add(B(13.5, 3.2, 4.0), mats.limestone, PX, ST - 1.5, WALL - 2.0);       // stylobate / landing mass
  ctx.collide.addSurface({ x: PX, z: WALL - 2.0, w: 13.5, d: 4.0, yaw: 0, top: ST, bottom: PG - 1, kind: 'platform', name: 'Fletcher Free landing' });
  for (let i = 0; i < 4; i++) {
    const px = PX - 4.8 + i * 3.2, cz = WALL - 2.6;
    mg.add(CY(0.72, 0.72, 0.4, 10), mats.limestone, px, ST + 0.2, cz);        // base
    mg.add(CY(0.5, 0.56, 6.0, 10), mats.limestone, px, ST + 3.4, cz);         // shaft
    mg.add(CY(0.74, 0.6, 0.5, 10), mats.limestone, px, ST + 6.65, cz);        // capital
  }
  mg.add(B(13.0, 1.7, 2.4), mats.limestone, PX, ST + 7.75, WALL - 2.6);       // entablature
  mg.add(gableGeo(13.0, 2.4, 2.0), mats.limestone, PX, ST + 8.6, WALL - 2.6, Math.PI / 2);
  mg.add(B(3.6, 4.4, 0.35), mats.brown, PX, ST + 2.2, WALL - 0.15);           // doors
  c.sign(6.4, 0.6, 'Fletcher Free Library', { bg: '#d3cab5', fg: '#3b3529', size: 19 }, PX, ST + 7.3, WALL - 3.85, Math.PI);

  // steps down to College Street (north = decreasing z)
  stairSet(c, mats.granite, PX, WALL - 7.6, PX, WALL - 4.2, 9.0, PG, ST, 6);
  ctx.collide.addRamp({ ax: PX, az: WALL - 7.7, bx: PX, bz: WALL - 4.1, w: 9.0, yLow: PG, yHigh: ST, kind: 'stairs', name: 'Fletcher Free steps', steps: 6 });
  for (const sd of [-1, 1]) {
    mg.add(B(0.7, 1.4, 5.0), mats.granite, PX + sd * 4.85, PG + 0.5, WALL - 5.9);
    ctx.collide.addEdge({ ax: PX + sd * 4.85, ay: PG + 0.6, az: WALL - 8.4, bx: PX + sd * 4.85, by: ST + 0.3, bz: WALL - 4.0, kind: 'ledge', name: 'Fletcher Free rail' });
  }
  c.spot('Fletcher Free steps', PX, WALL - 10, 12, 250);
  c.loc('Fletcher Free Library', PX + 6, WALL - 4, 16);
};

// ---------------------------------------------------------------- 15b. GMT Downtown Transit Center
L.transit = function (c) {
  const { mg, mats, ctx } = c;
  const b = c.get('w959618482'), roof = c.get('w460372783');
  if (b) {
    const pts = b.pts, ce = polyCentroid(pts), y0 = minTerrain(ctx.terrain, pts), TOP = y0 + 7.5;
    shell(c, pts, y0 - 1, TOP, mats.stone, 'GMT Transit Center');
    mg.add(wallsGeo(expandPoly(pts, 0.35), TOP, TOP + 0.6), mats.iron);
    for (let i = 0; i < pts.length; i++) {
      const f = edgeFrame(pts[i], pts[(i + 1) % pts.length], ce[0], ce[1]); if (f.L < 3) continue;
      fb(c, mats.glass, f, 0, y0 + 3.3, 0.14, f.L - 0.7, 5.4, 0.2);
      const n = Math.max(1, Math.round(f.L / 2.2));
      for (let k = 0; k <= n; k++) fb(c, mats.iron, f, -f.L / 2 + k * f.L / n, y0 + 3.3, 0.22, 0.16, 5.6, 0.14);
      fb(c, mats.iron, f, 0, y0 + 3.3, 0.22, f.L, 0.16, 0.14);
    }
    const E = edgeFrame(pts[2], pts[3], ce[0], ce[1]);
    c.sign(6.0, 0.62, 'GMT DOWNTOWN TRANSIT CENTER', { bg: '#12331f', fg: '#e6efe0', size: 14 }, fx(E, 0, 0.32), y0 + 6.6, fz(E, 0, 0.32), E.yaw);
  }
  if (roof) {
    // the long covered boarding canopy — a slab on steel columns, buses pass beneath
    const pts = roof.pts, ce = polyCentroid(pts), y0 = minTerrain(ctx.terrain, pts);
    mg.add(wallsGeo(pts, y0 + 4.3, y0 + 4.75), mats.iron);
    mg.add(capGeo(pts, y0 + 4.75), mats.stone);
    mg.add(flipGeo(capGeo(pts, y0 + 4.3)), mats.iron);
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], d = pts[(i + 1) % pts.length], len = Math.hypot(d[0] - a[0], d[1] - a[1]);
      if (len < 10) continue;
      const n = Math.max(1, Math.round(len / 9));
      for (let k = 0; k <= n; k++) {
        const t = (k + 0.5) / (n + 1), px = a[0] + (d[0] - a[0]) * t, pz = a[1] + (d[1] - a[1]) * t;
        const ix = px + (ce[0] - px) * 0.06, iz = pz + (ce[1] - pz) * 0.06;
        const g = ctx.terrain.heightAt(ix, iz);
        mg.add(CY(0.17, 0.2, y0 + 4.3 - g, 8), mats.iron, ix, (g + y0 + 4.3) / 2, iz);
        ctx.collide.addBlocker({ x: ix, z: iz, r: 0.22, name: 'Canopy post' });
      }
    }
  }
  c.loc('GMT Transit Center', -138, -282, 16);
};

// ---------------------------------------------------------------- 16. Burlington Harbour
// The lake end of every cross street. Nothing here is reachable — the level's west edge is
// x ≈ −645 and the shoreline sits ~80 m beyond it — but this is the view the whole downtown
// grid points at, and it was an empty plate of water.
//
// Built: the ECHO Leahy Center's massing at the foot of College; the community boathouse out
// on its pier with the marina docks and moored boats; the Burlington Breakwater lying offshore
// with a light at each end; the ferry-dock piers on their real OSM lines, with boats alongside.
// Sources: docs/BURLINGTON-REFERENCE.md §3.16 (ECHO, the breakwater, Union Station, the FRAME)
// and §1 "The view west". Massing and proportion only — no signage art or livery is copied.
const LAKE = -33.5;        // Lake Champlain surface — must match LAKE_Y in ground.js
const SHORE_X = -723;      // where the shingle apron crosses the waterline

// a low-poly hull: narrow at the keel, flared to the deck, tapered toward the bow (+Z)
function hullGeo(len, beam, h) {
  return frustumGeo(beam * 0.46, len * 0.78, h, beam, len);
}

L.waterfront = function (c) {
  const { mg, mats, ctx } = c;
  const T = ctx.terrain;
  const R = ctx.rng;
  const rr = (a, b) => a + R() * (b - a);
  // The whole harbour lands in the merged landmark meshes, which are never frustum-culled,
  // so its triangles are paid for on every frame wherever the player is. Thin it on phones.
  const mob = !!ctx.quality.mobile;

  // ---- riprap along the waterline ------------------------------------------------------
  // The shingle apron met the water as a clean geometric line. Burlington's shore is armoured
  // with broken stone; a scattered rock course gives the edge something to be made of.
  for (let z = -300; z < 210; z += (mob ? 10 : 5.5)) {
    const n = mob ? 1 : 1 + (R() < 0.5 ? 1 : 0);
    for (let k = 0; k < n; k++) {
      const s = rr(1.5, 3.4);
      mg.add(new THREE.IcosahedronGeometry(s, 0), mats.rock,
        SHORE_X + rr(-4.5, 5.5), LAKE + rr(-1.1, 0.5), z + rr(-2.4, 2.4), rr(0, 6.28),
        1, rr(0.45, 0.8), 1);
    }
  }

  // ---- ECHO Leahy Center, 1 College St: low, glassy, right on the water --------------
  {
    const X = -672, Z = 58, W = 25, D = 42;          // W across (x), D along the shore (z)
    const g0 = T.heightAt(X, Z);
    const pts = [[X - W / 2, Z - D / 2], [X + W / 2, Z - D / 2], [X + W / 2, Z + D / 2], [X - W / 2, Z + D / 2]];
    mg.add(wallsGeo(pts, g0 - 1.5, g0 + 7.4), mats.panel);
    mg.add(capGeo(pts, g0 + 7.4), mats.concrete);
    mg.add(wallsGeo(expandPoly(pts, 0.7), g0 + 7.0, g0 + 7.9), mats.stone);      // eaves band
    // second floor, set back and shortened, so the mass steps down toward the water
    const up = [[X - 9.5, Z - 18], [X + 7.5, Z - 18], [X + 7.5, Z + 8], [X - 9.5, Z + 8]];
    mg.add(wallsGeo(up, g0 + 7.9, g0 + 12.4), mats.panel);
    mg.add(capGeo(up, g0 + 12.4), mats.concrete);
    mg.add(wallsGeo(expandPoly(up, 0.6), g0 + 12.0, g0 + 12.9), mats.stone);
    // the lake elevation is a full-height glass wall between concrete fins
    for (let k = 0; k < 7; k++) {
      const z = Z - D / 2 + 3 + k * 6;
      mg.add(B(1.0, 7.8, 1.1), mats.concrete, X - W / 2, g0 + 3.9, z);
      mg.add(B(0.5, 6.4, 4.7), mats.glassLit, X - W / 2 - 0.25, g0 + 3.9, z + 3);
    }
    for (let k = 0; k < 4; k++) mg.add(B(0.5, 3.4, 5.4), mats.glassLit, X - 9.75, g0 + 10.2, Z - 15 + k * 6.4);
    // landward elevation: a banded glass wall under a deep entrance canopy
    for (let k = 0; k < 6; k++) mg.add(B(0.5, 5.2, 5.0), mats.glassLit, X + W / 2 + 0.25, g0 + 3.4, Z - D / 2 + 5 + k * 6.5);
    for (let k = 0; k < 3; k++) mg.add(B(0.5, 3.2, 6.0), mats.glassLit, X + 7.75, g0 + 10.1, Z - 14 + k * 8.0);
    mg.add(B(7.0, 0.45, 13), mats.concrete, X + W / 2 + 3.2, g0 + 5.4, Z);
    for (const z of [Z - 5.4, Z + 5.4]) mg.add(CY(0.19, 0.19, 5.4, 6), mats.concrete, X + W / 2 + 6.2, g0 + 2.7, z);
    c.sign(9.0, 0.9, 'ECHO LEAHY CENTER', { bg: '#1d4a55', fg: '#eaf3f2', size: 17, font: 'Helvetica, Arial, sans-serif' },
      X + W / 2 + 0.5, g0 + 6.4, Z, Math.PI / 2);
    ctx.collide.addPolygonWalls(pts, g0 + 7.4, 'ECHO Leahy Center');
    c.loc('ECHO Leahy Center', X, Z, 26);
  }

  // ---- the community boathouse, out on its pier at the foot of College ---------------
  const deckY = LAKE + 1.5;
  const pile = (x, z, top) => mg.add(CY(0.16, 0.2, top - (LAKE - 2.6), 6), mats.piling, x, (top + LAKE - 2.6) / 2, z);
  // a rectangular timber deck with a piling under every corner of a 6 m grid
  function deck(x0, z0, x1, z1, y) {
    const w = Math.abs(x1 - x0), d = Math.abs(z1 - z0);
    mg.add(B(w, 0.34, d), mats.deck, (x0 + x1) / 2, y - 0.17, (z0 + z1) / 2);
    for (let x = Math.min(x0, x1) + 1; x <= Math.max(x0, x1) - 0.5; x += 6)
      for (let z = Math.min(z0, z1) + 1; z <= Math.max(z0, z1) - 0.5; z += 6) pile(x, z, y - 0.1);
  }
  {
    const BX = -748, BZ = 24;
    deck(BX - 17, BZ - 11, BX + 17, BZ + 11, deckY);
    deck(SHORE_X + 8, BZ - 2.4, BX + 17, BZ + 2.4, deckY);      // the gangway in from the shingle
    // two storeys of white clapboard with a deep verandah, a dark green hipped roof, a cupola
    mg.add(B(20, 5.2, 13), mats.white, BX, deckY + 2.6, BZ);
    mg.add(B(21.8, 0.3, 14.8), mats.deck, BX, deckY + 5.35, BZ);          // upper verandah floor
    mg.add(B(16.5, 4.4, 10.5), mats.white, BX, deckY + 7.7, BZ);
    mg.add(frustumGeo(18.4, 12.4, 3.4, 4, 2.6), mats.spire, BX, deckY + 9.9, BZ);
    mg.add(B(2.8, 2.2, 2.8), mats.white, BX, deckY + 14.4, BZ);
    mg.add(frustumGeo(3.4, 3.4, 2.0), mats.spire, BX, deckY + 15.5, BZ);
    for (let k = 0; k < 5; k++) for (const s of [-1, 1]) {
      mg.add(B(1.7, 2.6, 0.3), mats.glassLit, BX - 6.4 + k * 3.2, deckY + 2.7, BZ + s * 6.6);
      mg.add(B(1.5, 2.1, 0.3), mats.glassLit, BX - 5.6 + k * 2.8, deckY + 7.9, BZ + s * 5.4);
    }
    // verandah posts + a rail line all the way round
    for (let k = 0; k <= 8; k++) {
      const x = BX - 10.4 + k * 2.6;
      for (const s of [-1, 1]) {
        mg.add(CY(0.1, 0.1, 5.2, 5), mats.white, x, deckY + 2.6, BZ + s * 7.2);
        mg.add(CY(0.09, 0.09, 4.4, 5), mats.white, x, deckY + 7.7, BZ + s * 7.2);
      }
    }
    for (const zz of [BZ - 7.2, BZ + 7.2]) {
      mg.add(B(21.6, 0.12, 0.12), mats.white, BX, deckY + 1.05, zz);
      mg.add(B(21.6, 0.14, 0.14), mats.white, BX, deckY + 6.6, zz);
      mg.add(B(21.6, 0.14, 0.14), mats.white, BX, deckY + 9.6, zz);
    }
    c.sign(7.0, 0.7, 'BURLINGTON COMMUNITY BOATHOUSE', { bg: '#f2efe4', fg: '#20364a', size: 13, font: 'Helvetica, Arial, sans-serif' },
      BX + 10.05, deckY + 4.4, BZ, Math.PI / 2);
    c.loc('Community Boathouse', BX, BZ, 30);

    // ---- the marina: a main walkway south with finger docks and boats alongside -------
    const MX = BX - 2;
    deck(MX - 1.8, BZ + 11, MX + 1.8, BZ + 116, deckY - 0.15);
    for (let k = 0; k < (mob ? 4 : 7); k++) {
      const z = BZ + 22 + k * (mob ? 24 : 14);
      deck(MX - 26, z - 1.4, MX - 1.8, z + 1.4, deckY - 0.15);
      for (const side of [-1, 1]) {
        if (R() < 0.22) continue;
        boat(c, MX - 6 - R() * 16, z + side * 4.6, Math.PI / 2, rr(7.5, 11.5), false);
      }
    }
    // a few boats moored off the north side of the boathouse too
    for (let k = 0; k < (mob ? 2 : 4); k++) boat(c, BX - 24 - k * 9, BZ - 16 - R() * 26, Math.PI / 2 + rr(-0.2, 0.2), rr(8, 12), false);
  }

  // ---- the mooring field: sails out in the harbour ------------------------------------
  for (let k = 0; k < (mob ? 7 : 16); k++) {
    const x = -770 - R() * 150, z = -320 + R() * 520;
    if (x > SHORE_X - 30) continue;
    boat(c, x, z, rr(0, 6.28), rr(8, 14), R() < 0.45);
  }

  // ---- the Burlington Breakwater: 2,517 ft of stone lying offshore --------------------
  // "a long low line of stone offshore… reads as a horizontal dash on the water" (§3.16)
  {
    const BX = -880, TOP = LAKE + 1.9;
    const runs = [[-392, -74], [-26, 244]];          // the harbour entrance is the gap between them
    for (const [z0, z1] of runs) {
      const n = Math.round((z1 - z0) / (mob ? 46 : 26));
      for (let k = 0; k < n; k++) {
        const z = z0 + (z1 - z0) * (k + 0.5) / n, d = (z1 - z0) / n + 0.4;
        mg.add(frustumGeo(13, d, TOP - (LAKE - 3.2), 7.4, d), mats.rock, BX + Math.sin(k * 1.7) * 0.7, LAKE - 3.2, z);
      }
    }
    // the two breakwater lights: a squat white tower with a dark lantern, one at each head
    for (const z of [-392, 244]) {
      mg.add(frustumGeo(3.4, 3.4, 5.0, 2.6, 2.6), mats.white, BX, TOP, z);
      mg.add(B(2.2, 1.6, 2.2), mats.iron, BX, TOP + 5.8, z);
      mg.add(frustumGeo(2.6, 2.6, 1.1), mats.steelRed, BX, TOP + 6.6, z);
      mg.add(new THREE.SphereGeometry(0.45, 6, 4), mats.lamp, BX, TOP + 5.9, z);
    }
  }

  // ---- the ferry dock and Perkins Pier, on their real OSM pier lines ------------------
  {
    let piers = 0;
    for (const l of ctx.WORLD.lines || []) {
      if (l.kind !== 'man_made:pier' || !l.pts || l.pts.length < 2) continue;
      const w = (l.tags && l.tags.name) ? 3.4 : 6.0;   // A/B Dock are finger docks; the rest are the quays
      for (let i = 0; i < l.pts.length - 1; i++) {
        const a = l.pts[i], b = l.pts[i + 1];
        const len = Math.hypot(b[0] - a[0], b[1] - a[1]); if (len < 1) continue;
        const yaw = Math.atan2(b[0] - a[0], b[1] - a[1]);
        mg.add(B(w, 0.4, len), mats.deck, (a[0] + b[0]) / 2, deckY - 0.2, (a[1] + b[1]) / 2, yaw);
        const n = Math.max(1, Math.round(len / 9));
        for (let k = 0; k <= n; k++) {
          const t = k / n, px = a[0] + (b[0] - a[0]) * t, pz = a[1] + (b[1] - a[1]) * t;
          for (const s of [-1, 1]) pile(px + Math.cos(yaw) * s * (w / 2 - 0.4), pz - Math.sin(yaw) * s * (w / 2 - 0.4), deckY - 0.3);
        }
      }
      piers++;
      // moor something to each of the named finger docks
      if (l.tags && l.tags.name) for (let k = 0; k < (mob ? 1 : 3); k++) {
        const t = 0.2 + k * 0.3, a = l.pts[0], b = l.pts[1];
        boat(c, a[0] + (b[0] - a[0]) * t - 5, a[1] + (b[1] - a[1]) * t, Math.PI / 2, rr(8, 11), false);
      }
    }
    // the Lake Champlain ferry, tied up at the King Street quay
    const FX = -640, FZ = 330;
    mg.add(hullGeo(46, 13, 3.4), mats.hull, FX, LAKE - 1.2, FZ, 0.06);
    mg.add(B(11, 3.0, 26), mats.hull, FX, LAKE + 3.7, FZ, 0.06);
    mg.add(B(7.5, 2.4, 9), mats.white, FX, LAKE + 6.4, FZ - 6, 0.06);
    mg.add(B(1.0, 4.5, 1.0), mats.iron, FX, LAKE + 9.4, FZ - 6, 0.06);
    c.loc('Ferry Dock', -600, 330, 60);
    console.info('[landmarks] waterfront: ' + piers + ' piers');
  }
};

// one low-poly boat. `sailing` raises a main and a jib; moored boats sit with bare poles.
function boat(c, x, z, yaw, len, sailing) {
  const { mg, mats, ctx } = c;
  const R = ctx.rng;
  const beam = len * 0.31, h = len * 0.26;
  const hullMat = [mats.hull, mats.hull, mats.hullNavy, mats.hullRed][Math.floor(R() * 4)] || mats.hull;
  const free = h * 0.52;                    // freeboard: how much hull stands out of the water
  mg.add(hullGeo(len, beam, h), hullMat, x, LAKE - (h - free), z, yaw);
  mg.add(B(beam * 0.66, h * 0.5, len * 0.3), mats.white, x, LAKE + free + h * 0.22, z, yaw);   // coachroof
  const mast = len * 1.15;
  mg.add(CY(0.06, 0.11, mast, 5), mats.panel,
    x + Math.sin(yaw) * len * 0.06, LAKE + free + mast / 2, z + Math.cos(yaw) * len * 0.06, yaw);
  if (sailing) {
    const s = new THREE.BufferGeometry();
    const hl = len * 0.42, hh = mast * 0.86;
    const a = [0, 0, hl * 0.55], b = [0, hh, -hl * 0.12], d = [0, 0, -hl * 0.75];
    // both faces, because the merged landmark materials are single-sided
    s.setAttribute('position', new THREE.Float32BufferAttribute([...a, ...b, ...d, ...a, ...d, ...b], 3));
    s.computeVertexNormals();
    mg.add(s, mats.sail, x, LAKE + free, z, yaw + 0.22);
  } else {
    mg.add(B(0.1, 0.1, len * 0.46), mats.panel, x, LAKE + free + 1.6, z, yaw);                 // boom
  }
}
