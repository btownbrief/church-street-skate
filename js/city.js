// builder B1 — generic buildings + Church Street storefronts.
//
// Everything here is procedural, original art. No logos, wordmarks or brand art:
// business names are drawn as plain text in generic type on a shared canvas atlas.
//
// Draw-call strategy: every triangle in this file lands in one of ~15 merged
// BufferGeometries — one per facade material (textured), plus four vertex-coloured
// buckets (trim / glass / awning / canopy glass) and one sign-atlas bucket.
//
// Coordinates: x = east, z = south, y = up (see docs/ARCHITECTURE.md).
// Storefront sign bands live at ground + 3.4 .. 4.2 m; canopy shelves at ground + 3.3 m
// reaching 2.7 m out (the Marketplace "9-ft line"), posts there are collidable blockers.

import * as THREE from '../vendor/three.module.min.js';
import { hashStr, rng, polyArea, pointInPoly, segT } from './util.js';

// ---------------------------------------------------------------------------
// constants
// ---------------------------------------------------------------------------
const STOREY = 3.4;          // metres per floor = texture v period
const TILE_W = 12;           // metres of wall per texture tile (4 bays of 3 m)
const BULK_H = 0.6;          // storefront bulkhead height
const GLASS_TOP = 3.34;      // top of shopfront glazing
const SIGN_Y0 = 3.4, SIGN_Y1 = 4.2;   // the sign band
const CANOPY_Y = 3.30;       // top of the steel-and-glass canopy shelf
const CANOPY_OUT = 2.70;     // the "9-ft line"
const CORE_R = 250;          // metres from the mall: detailed treatment inside this

const AWNING_COLS = [0x1f4030, 0x5d1f26, 0x191919, 0x1b2a4a, 0xd9cfb8]; // green, burgundy, black, navy, cream
const BAND_COLS = [0x1b1b1b, 0x24322a, 0x3a2320, 0x2a2f3a, 0x4a3a25];
const BAND_FG = ['#efe9dc', '#e8dcc0', '#f0e2c2', '#e6e9ef', '#f2e8d2'];

// Storefront facts worth honouring (docs/BURLINGTON-REFERENCE.md §2). Keyed by POI name.
const SPECIAL = {
  "Ben & Jerry's":              { style: 'brickBuff', band: 0x121212, fg: '#f4f4f2', frame: 0x141414, awning: 0xf0efe8, forceAwning: true, turquoise: true },
  'Free People':                { style: 'paintWhite', band: 0x121212, fg: '#f4e2ae', frame: 0x141414, warm: true },
  'Frog Hollow':                { band: 0x1e4d33, fg: '#efe7cf', frame: 0x1e4d33, tag: 'crafted in vermont' },
  "Halvorson's":                { band: 0x111111, fg: '#d9b45a', frame: 0x111111, blade: 0xf2f2ee, forceBlade: true, canopy: true },
  'Saratoga Olive Oil Company': { band: 0x131313, fg: '#f4f4f4', awning: 0x131313, forceAwning: true },
  'Lake Champlain Chocolates':  { band: 0x3a2320, fg: '#f0dcae', awning: 0x5d1f26, forceAwning: true },
  'Honey Road':                 { band: 0x25201a, fg: '#e8b64c' },
  'Red Square':                 { band: 0x5a1a18, fg: '#e8ded0', frame: 0x5a1a18 },
  'Outdoor Gear Exchange':      { band: 0x1f3a2c, fg: '#e9e4d6' },
  'Maven':                      { band: 0x1a1a22, fg: '#e6e6ea' },
  'Phoenix Books':              { band: 0x2a2138, fg: '#efe4c8' },
  'Crow Bookshop':              { band: 0x1d1d1d, fg: '#e6dcc4' },
  'Sweetwaters':                { band: 0x21301f, fg: '#efe6cf' },
  "Leunig's Bistro":            { band: 0x4a3a25, fg: '#f0e7d2' },
};

// Names that must never appear on a sign (closed / never here — reference §2 dead landmarks).
const DEAD = /nectar|manhattan pizza|skinny pancake|danform|apple mountain|dear lucy|nostalgia|black cap/i;

// Papered-over storefronts: the nearest bay to each point wins.
const VACANCIES = [
  { x: 8.4, z: -107.0 },                  // 80 Church — Nostalgia Toys, closed Jul 2026
  { x: 4.6, z: -222.0 },                  // 42 Church — Black Cap Coffee, closed Dec 2025
  { x: 12.1, z: -29.1 },                  // 112 Church — Lippa's, closing Aug 2026
];

const GHOST_WORDS = ['HARDWARE', 'DRY GOODS', 'COAL & ICE'];

// ---------------------------------------------------------------------------
// geometry buckets
// ---------------------------------------------------------------------------
function faceNormal(a, b, c) {
  const nx = (b[1] - a[1]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[1] - a[1]);
  const ny = (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]);
  const nz = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const l = Math.hypot(nx, ny, nz) || 1;
  return [nx / l, ny / l, nz / l];
}

class TexBuf {
  constructor() { this.p = []; this.n = []; this.u = []; }
  get empty() { return this.p.length === 0; }
  quad(a, b, c, d, ua, ub, uc, ud) {
    const n = faceNormal(a, b, c);
    this._v(a, n, ua); this._v(b, n, ub); this._v(c, n, uc);
    this._v(a, n, ua); this._v(c, n, uc); this._v(d, n, ud);
  }
  _v(p, n, uv) { this.p.push(p[0], p[1], p[2]); this.n.push(n[0], n[1], n[2]); this.u.push(uv[0], uv[1]); }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.p), 3));
    g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(this.n), 3));
    g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(this.u), 2));
    g.computeBoundingSphere(); return g;
  }
}

const _col = new THREE.Color();
class ColBuf {
  constructor() { this.p = []; this.n = []; this.c = []; }
  get empty() { return this.p.length === 0; }
  quad(a, b, c, d, col) {
    const n = faceNormal(a, b, c); const k = _col.setHex(col, THREE.SRGBColorSpace);
    this._v(a, n, k); this._v(b, n, k); this._v(c, n, k);
    this._v(a, n, k); this._v(c, n, k); this._v(d, n, k);
  }
  quad2(a, b, c, d, col) { this.quad(a, b, c, d, col); this.quad(d, c, b, a, col); }
  tri(a, b, c, col) {
    const n = faceNormal(a, b, c); const k = _col.setHex(col, THREE.SRGBColorSpace);
    this._v(a, n, k); this._v(b, n, k); this._v(c, n, k);
  }
  _v(p, n, k) { this.p.push(p[0], p[1], p[2]); this.n.push(n[0], n[1], n[2]); this.c.push(k.r, k.g, k.b); }
  box(x, y, z, w, h, d, yaw, col) {
    const c = Math.cos(yaw), s = Math.sin(yaw), hw = w / 2, hd = d / 2, hh = h / 2;
    const P = (lx, ly, lz) => [x + lx * c + lz * s, y + ly, z - lx * s + lz * c];
    const a = P(-hw, -hh, -hd), b = P(hw, -hh, -hd), cc = P(hw, -hh, hd), dd = P(-hw, -hh, hd);
    const e = P(-hw, hh, -hd), f = P(hw, hh, -hd), g = P(hw, hh, hd), i = P(-hw, hh, hd);
    this.quad(e, f, g, i, col); this.quad(dd, cc, b, a, col);
    this.quad(a, b, f, e, col); this.quad(cc, dd, i, g, col);
    this.quad(b, cc, g, f, col); this.quad(dd, a, e, i, col);
  }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.p), 3));
    g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(this.n), 3));
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(this.c), 3));
    g.computeBoundingSphere(); return g;
  }
}

// ---------------------------------------------------------------------------
// facade textures (one small tile per style, generated once at boot)
// ---------------------------------------------------------------------------
const TW = 256, TH = 128;   // pixels per tile = TILE_W x STOREY metres

function mix(a, b, t) {
  const ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255;
  const br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255;
  return (Math.round(ar + (br - ar) * t) << 16) | (Math.round(ag + (bg - ag) * t) << 8) | Math.round(ab + (bb - ab) * t);
}
const hex = (c) => '#' + (c >>> 0).toString(16).padStart(6, '0');

const STYLE_DEF = {
  brickRed:    { kind: 'brick',  base: 0x9d4630, mortar: 0xb99a86, frame: 0xe8e2d6 },
  brickSalmon: { kind: 'brick',  base: 0xbd7a5c, mortar: 0xd9c0ac, frame: 0xf0ece2 },
  brickDark:   { kind: 'brick',  base: 0x6d3327, mortar: 0x8d6d5e, frame: 0xd6cfc0 },
  brickBuff:   { kind: 'brick',  base: 0xbda877, mortar: 0xd6c8a8, frame: 0x2a2a28 },
  paintWhite:  { kind: 'paint',  base: 0xe6e2d6, mortar: 0xd8d2c4, frame: 0x232322 },
  paintGrey:   { kind: 'paint',  base: 0x8c9289, mortar: 0x82887f, frame: 0xe6e3d8 },
  stone:       { kind: 'stone',  base: 0xc5c3ba, mortar: 0xb0aea4, frame: 0x8f8c82 },
  panel:       { kind: 'panel',  base: 0x8a9096, mortar: 0x6b7076, frame: 0x3a3f45 },
  clapboard:   { kind: 'clap',   base: 0xd4d1c2, mortar: 0xc1beae, frame: 0xf2f0e8 },
  garage:      { kind: 'garage', base: 0xa6a49c, mortar: 0x8c8a82, frame: 0x6c6a64 },
};

function facadeTexture(name, def) {
  const c = document.createElement('canvas'); c.width = TW; c.height = TH;
  const g = c.getContext('2d');
  const em = document.createElement('canvas'); em.width = TW; em.height = TH;
  const eg = em.getContext('2d'); eg.fillStyle = '#000'; eg.fillRect(0, 0, TW, TH);
  const r = rng(hashStr(name) || 7);

  g.fillStyle = hex(def.base); g.fillRect(0, 0, TW, TH);

  if (def.kind === 'brick') {
    for (let y = 0; y < TH; y += 3) {
      const off = ((y / 3) | 0) % 2 ? 4 : 0;
      for (let x = -8; x < TW; x += 8) {
        g.fillStyle = hex(mix(def.base, r() < 0.5 ? 0x000000 : 0xffffff, r() * 0.16));
        g.fillRect(x + off, y, 7, 2);
      }
      g.globalAlpha = 0.5; g.fillStyle = hex(def.mortar); g.fillRect(0, y + 2, TW, 1); g.globalAlpha = 1;
    }
  } else if (def.kind === 'paint') {
    for (let i = 0; i < 240; i++) {
      g.fillStyle = hex(mix(def.base, r() < 0.5 ? 0x000000 : 0xffffff, r() * 0.09));
      g.fillRect(r() * TW, r() * TH, 6 + r() * 22, 2 + r() * 5);
    }
    g.globalAlpha = 0.3; g.fillStyle = hex(def.mortar);
    for (let y = 0; y < TH; y += 3) g.fillRect(0, y + 2, TW, 1);
    g.globalAlpha = 1;
  } else if (def.kind === 'stone') {
    for (let y = 0; y < TH; y += 11) {
      const off = ((y / 11) | 0) % 2 ? 16 : 0;
      for (let x = -32; x < TW; x += 32) {
        g.fillStyle = hex(mix(def.base, r() < 0.5 ? 0x000000 : 0xffffff, r() * 0.13));
        g.fillRect(x + off + 1, y + 1, 30, 9);
      }
    }
  } else if (def.kind === 'clap') {
    for (let y = 0; y < TH; y += 5) {
      g.fillStyle = hex(mix(def.base, 0xffffff, r() * 0.07)); g.fillRect(0, y, TW, 4);
      g.fillStyle = hex(mix(def.base, 0x000000, 0.06 + r() * 0.05)); g.fillRect(0, y + 4, TW, 1);
    }
  } else if (def.kind === 'garage') {
    g.fillStyle = '#1e201d'; g.fillRect(0, 28, TW, 66);                 // the open deck slot
    g.fillStyle = hex(mix(def.base, 0x000000, 0.16));
    for (let x = 0; x < TW; x += 42) g.fillRect(x, 26, 10, 70);          // piers
    g.fillStyle = hex(mix(def.base, 0xffffff, 0.10)); g.fillRect(0, 90, TW, 8);
    g.fillStyle = hex(mix(def.base, 0x000000, 0.10)); g.fillRect(0, 24, TW, 4);
  } else if (def.kind === 'panel') {
    g.fillStyle = hex(mix(def.base, 0x000000, 0.20)); g.fillRect(0, 0, TW, 7);
  }

  // ---- windows -----------------------------------------------------------
  const wins = [];
  if (def.kind === 'panel') {
    wins.push({ x: 5, y: 16, w: TW - 10, h: 92, warm: false, ribbon: true });
  } else if (def.kind !== 'garage') {
    const per = 4;
    const ww = def.kind === 'clap' ? 20 : 26;
    const wh = def.kind === 'clap' ? 52 : 70;
    for (let i = 0; i < per; i++) {
      const cx = (i + 0.5) * (TW / per);
      wins.push({ x: Math.round(cx - ww / 2), y: 24, w: ww, h: wh, warm: r() < 0.14 });
    }
  }
  for (const w of wins) {
    g.fillStyle = hex(def.frame); g.fillRect(w.x - 3, w.y - 3, w.w + 6, w.h + 6);
    g.fillStyle = w.warm ? '#e2ab63' : '#2c434f'; g.fillRect(w.x, w.y, w.w, w.h);
    g.save(); g.beginPath(); g.rect(w.x, w.y, w.w, w.h); g.clip();
    g.fillStyle = w.warm ? 'rgba(255,235,190,0.40)' : 'rgba(150,180,200,0.32)';
    g.beginPath(); g.moveTo(w.x, w.y + w.h * 0.78); g.lineTo(w.x + w.w, w.y - w.h * 0.12);
    g.lineTo(w.x + w.w, w.y + w.h * 0.18); g.lineTo(w.x, w.y + w.h); g.closePath(); g.fill();
    g.restore();
    g.fillStyle = hex(def.frame);
    if (w.ribbon) { for (let x = w.x + 16; x < w.x + w.w - 2; x += 16) g.fillRect(x, w.y, 2, w.h); }
    else { g.fillRect(w.x + (w.w >> 1) - 1, w.y, 2, w.h); g.fillRect(w.x, w.y + Math.round(w.h * 0.45), w.w, 2); }
    g.fillStyle = hex(mix(def.frame, 0xffffff, 0.35)); g.fillRect(w.x - 5, w.y + w.h + 3, w.w + 10, 3);
    if (w.warm) { eg.fillStyle = '#ffd79a'; eg.fillRect(w.x, w.y, w.w, w.h); }
  }
  g.fillStyle = 'rgba(0,0,0,0.20)'; g.fillRect(0, 0, TW, 3);   // storey shadow line

  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  const etex = new THREE.CanvasTexture(em);
  etex.wrapS = etex.wrapT = THREE.RepeatWrapping; etex.colorSpace = THREE.SRGBColorSpace;
  return { tex, etex, hasEmissive: wins.some(w => w.warm) };
}

// ---------------------------------------------------------------------------
// sign atlas — up to 128 plates on one 2048x1024 canvas, one draw call
// ---------------------------------------------------------------------------
const A_W = 2048, A_H = 1024, CELL_W = 256, CELL_H = 48, A_COLS = 8, A_ROWS = 21;
const CELL_AR = CELL_W / CELL_H;   // sign plates keep the cell aspect so text is never stretched

class SignAtlas {
  constructor() {
    this.c = document.createElement('canvas'); this.c.width = A_W; this.c.height = A_H;
    this.g = this.c.getContext('2d'); this.g.clearRect(0, 0, A_W, A_H);
    this.n = 0; this.map = new Map();
  }
  slot(key, draw) {
    if (this.map.has(key)) return this.map.get(key);
    if (this.n >= A_COLS * A_ROWS) return null;
    const i = this.n++, col = i % A_COLS, row = (i / A_COLS) | 0;
    const x = col * CELL_W, y = row * CELL_H;
    const g = this.g;
    g.save(); g.beginPath(); g.rect(x, y, CELL_W, CELL_H); g.clip(); g.translate(x, y);
    draw(g, CELL_W, CELL_H); g.restore();
    // leave a 1px inset so mipmaps don't bleed between cells
    const uv = [(x + 1) / A_W, 1 - (y + CELL_H - 1) / A_H, (x + CELL_W - 1) / A_W, 1 - (y + 1) / A_H];
    this.map.set(key, uv); return uv;
  }
  texture() {
    const t = new THREE.CanvasTexture(this.c);
    t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
    t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter;
    return t;
  }
}

const FONTS = [
  'bold 30px Georgia, "Times New Roman", serif',
  'bold 29px "Helvetica Neue", Helvetica, Arial, sans-serif',
  '600 30px "Trebuchet MS", Verdana, sans-serif',
  'bold 29px "Palatino Linotype", Palatino, Georgia, serif',
];

function fitText(g, text, font, maxW, min = 11) {
  let size = parseInt(font.match(/(\d+)px/)[1], 10);
  g.font = font;
  while (g.measureText(text).width > maxW && size > min) { size -= 1; g.font = font.replace(/\d+px/, size + 'px'); }
}

function plate(g, w, h, text, bg, fg, font, rule) {
  g.fillStyle = bg; g.fillRect(0, 0, w, h);
  g.fillStyle = 'rgba(255,255,255,0.07)'; g.fillRect(0, 0, w, 2);
  g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(0, h - 2, w, 2);
  if (rule) { g.fillStyle = fg; g.globalAlpha = 0.5; g.fillRect(12, h - 8, w - 24, 2); g.globalAlpha = 1; }
  g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
  fitText(g, text, font, w - 24);
  g.fillText(text, w / 2, h / 2);
}

// ---------------------------------------------------------------------------
// polygon helpers
// ---------------------------------------------------------------------------
function centroidOf(pts) { let x = 0, z = 0; for (const p of pts) { x += p[0]; z += p[1]; } return [x / pts.length, z / pts.length]; }

function capPolygon(buf, pts, y, col) {
  const contour = pts.map(p => new THREE.Vector2(p[0], p[1]));
  let faces;
  try { faces = THREE.ShapeUtils.triangulateShape(contour, []); } catch (e) { return; }
  for (const f of faces) {
    const a = contour[f[0]], b = contour[f[1]], c = contour[f[2]];
    const A = [a.x, y, a.y], B = [b.x, y, b.y], C = [c.x, y, c.y];
    // keep faces pointing up
    const cr = (B[0] - A[0]) * (C[2] - A[2]) - (B[2] - A[2]) * (C[0] - A[0]);
    if (cr > 0) buf.tri(A, C, B, col); else buf.tri(A, B, C, col);
  }
}

function buildGable(buf, pts, top, hash) {
  // longest edge sets the ridge direction; box the footprint in that frame
  let bi = 0, bl = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]); if (l > bl) { bl = l; bi = i; }
  }
  const a = pts[bi], b = pts[(bi + 1) % pts.length];
  const ux = (b[0] - a[0]) / bl, uz = (b[1] - a[1]) / bl;
  const vx = -uz, vz = ux;
  let u0 = 1e9, u1 = -1e9, v0 = 1e9, v1 = -1e9;
  const [cx, cz] = centroidOf(pts);
  for (const p of pts) {
    const du = (p[0] - cx) * ux + (p[1] - cz) * uz, dv = (p[0] - cx) * vx + (p[1] - cz) * vz;
    if (du < u0) u0 = du; if (du > u1) u1 = du; if (dv < v0) v0 = dv; if (dv > v1) v1 = dv;
  }
  const P = (du, dv, y) => [cx + ux * du + vx * dv, y, cz + uz * du + vz * dv];
  const rise = Math.min(3.2, (v1 - v0) * 0.42);
  const yr = top + rise, col = (hash & 1) ? 0x4b4f52 : 0x574a44;
  const A = P(u0, v0, top), B = P(u1, v0, top), C = P(u1, v1, top), D = P(u0, v1, top);
  const R0 = P(u0, (v0 + v1) / 2, yr), R1 = P(u1, (v0 + v1) / 2, yr);
  buf.quad(A, B, R1, R0, col);          // slope 1
  buf.quad(C, D, R0, R1, col);          // slope 2
  buf.tri(A, R0, D, mix(col, 0x000000, 0.15));
  buf.tri(B, C, R1, mix(col, 0x000000, 0.15));
}

function pickStyle(b, hash, gable) {
  const t = b.type || 'yes';
  const nm = b.name || '';
  if (t === 'garage' || t === 'parking' || t === 'carport' || /garage|parking/i.test(nm)) return 'garage';
  if (gable) return (hash % 5) === 0 ? 'brickRed' : 'clapboard';
  if (/bank|savings|trust|marble|courthouse|federal/i.test(nm)) return 'stone';
  if (t === 'detached' || t === 'house' || t === 'residential' || t === 'terrace') return (hash % 4) === 0 ? 'brickRed' : 'clapboard';
  if ((b.h || 8) >= 28 && !b.onChurch) return (hash % 3) === 0 ? 'stone' : 'panel';
  const w = hash % 100;
  if (w < 32) return 'brickRed';
  if (w < 48) return 'brickSalmon';
  if (w < 62) return 'brickDark';
  if (w < 74) return 'brickBuff';
  if (w < 82) return 'paintWhite';
  if (w < 90) return 'paintGrey';
  if (w < 96) return 'stone';
  return 'panel';
}

// ---------------------------------------------------------------------------
// edge-local emitters. An "edge" is { ax,az,bx,bz, nx,nz, dx,dz, L } where n is the
// outward normal and (dx,dz) the unit direction a -> b. `t` runs 0..L along it.
// ---------------------------------------------------------------------------
const EP = (e, t, out, y) => [e.ax + e.dx * t + e.nx * out, y, e.az + e.dz * t + e.nz * out];

// A band along the facade: outer face + top + bottom + two ends.
function strip(buf, e, t0, t1, y0, y1, proj, col, ends = true) {
  if (t1 - t0 < 0.02) return;
  const A0 = EP(e, t0, 0, y0), B0 = EP(e, t1, 0, y0);
  const Ao0 = EP(e, t0, proj, y0), Bo0 = EP(e, t1, proj, y0);
  const Ao1 = EP(e, t0, proj, y1), Bo1 = EP(e, t1, proj, y1);
  const A1 = EP(e, t0, 0, y1), B1 = EP(e, t1, 0, y1);
  buf.quad(Ao0, Bo0, Bo1, Ao1, col);                             // outer face
  buf.quad(A1, Ao1, Bo1, B1, mix(col, 0xffffff, 0.12));          // top
  buf.quad(A0, B0, Bo0, Ao0, mix(col, 0x000000, 0.35));          // underside
  if (ends) {
    buf.quad(A0, Ao0, Ao1, A1, mix(col, 0x000000, 0.12));        // end at t0 (normal -dir)
    buf.quad(B0, B1, Bo1, Bo0, mix(col, 0x000000, 0.12));        // end at t1 (normal +dir)
  }
}

// A flat panel parallel to the facade (glass, paper, mural panel, sign backing).
function panel(buf, e, t0, t1, y0, y1, out, col) {
  if (t1 - t0 < 0.02) return;
  buf.quad(EP(e, t0, out, y0), EP(e, t1, out, y0), EP(e, t1, out, y1), EP(e, t0, out, y1), col);
}

// A textured plate (sign) centred at t, height y, w x h metres, `out` from the facade.
function signPlane(buf, e, t, y, w, h, out, uv) {
  const t0 = t - w / 2, t1 = t + w / 2, y0 = y - h / 2, y1 = y + h / 2;
  buf.quad(
    EP(e, t0, out, y0), EP(e, t1, out, y0), EP(e, t1, out, y1), EP(e, t0, out, y1),
    [uv[0], uv[1]], [uv[2], uv[1]], [uv[2], uv[3]], [uv[0], uv[3]]
  );
}

// ---------------------------------------------------------------------------
export function buildCity(ctx) {
  const { scene, WORLD, terrain, collide, quality } = ctx;
  const mobile = !!quality.mobile;
  const landmarkIds = ctx.landmarkIds || new Set();
  const buildings = WORLD.buildings || [];

  // ---- materials + buckets ------------------------------------------------
  const styles = Object.keys(STYLE_DEF);
  const facBuf = {}, facMat = {};
  for (const s of styles) {
    facBuf[s] = new TexBuf();
    const { tex, etex, hasEmissive } = facadeTexture(s, STYLE_DEF[s]);
    const m = new THREE.MeshLambertMaterial({ map: tex });
    if (hasEmissive) { m.emissiveMap = etex; m.emissive = new THREE.Color(0xffffff); m.emissiveIntensity = 0.38; }
    facMat[s] = m;
  }
  const trim = new ColBuf();     // parapets, cornices, roofs, bulkheads, sign bands, posts, mural
  const glass = new ColBuf();    // shopfront glazing (unlit, so interiors read as lit)
  const awn = new ColBuf();      // awnings + valances
  const cano = new ColBuf();     // canopy glass
  const signB = new TexBuf();    // name plates
  const atlas = new SignAtlas();
  const placedSigns = [];
  const unplaced = [];

  // ---- POIs by building ---------------------------------------------------
  const SKIP_KIND = /^(historic:|man_made:|leisure:park|amenity:parking$|amenity:place_of_worship|amenity:townhall|tourism:artwork|amenity:bench|amenity:waste|amenity:bicycle)/;
  const poisByBldg = new Map();
  for (const p of (WORLD.pois || [])) {
    if (!p.building || !p.name) continue;
    if (SKIP_KIND.test(p.kind || '')) continue;
    let a = poisByBldg.get(p.building); if (!a) { a = []; poisByBldg.set(p.building, a); }
    a.push(p);
  }

  // ---- street reference ---------------------------------------------------
  const churchLine = (WORLD.churchStreet && WORLD.churchStreet.centerline) || [];
  const streetSegs = [];
  const pushLine = (pts) => {
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      if (Math.min(a[0], b[0]) > 420 || Math.max(a[0], b[0]) < -420) continue;
      if (Math.min(a[1], b[1]) > 340 || Math.max(a[1], b[1]) < -520) continue;
      streetSegs.push([a[0], a[1], b[0], b[1]]);
    }
  };
  pushLine(churchLine);
  const CAR = new Set(['primary', 'secondary', 'tertiary', 'residential', 'unclassified', 'pedestrian', 'living_street']);
  for (const r of (WORLD.roads || [])) if (CAR.has(r.kind)) pushLine(r.pts);
  const distStreet = (x, z) => {
    let best = 1e9;
    for (let i = 0; i < streetSegs.length; i++) {
      const s = streetSegs[i];
      if (x < Math.min(s[0], s[2]) - 60 || x > Math.max(s[0], s[2]) + 60) continue;
      if (z < Math.min(s[1], s[3]) - 60 || z > Math.max(s[1], s[3]) + 60) continue;
      const t = segT(s[0], s[1], s[2], s[3], x, z);
      const d = Math.hypot(s[0] + (s[2] - s[0]) * t - x, s[1] + (s[3] - s[1]) * t - z);
      if (d < best) best = d;
    }
    return best;
  };
  const distChurch = (x, z) => {
    let best = 1e9;
    for (let i = 0; i < churchLine.length - 1; i++) {
      const a = churchLine[i], b = churchLine[i + 1];
      const t = segT(a[0], a[1], b[0], b[1], x, z);
      const d = Math.hypot(a[0] + (b[0] - a[0]) * t - x, a[1] + (b[1] - a[1]) * t - z);
      if (d < best) best = d;
    }
    return best;
  };

  // =========================================================================
  // pass 1 — every footprint that isn't hand-modelled by landmarks.js
  // =========================================================================
  const shopBldgs = [];
  let nBuilt = 0;

  for (const b of buildings) {
    if (landmarkIds.has(b.id)) continue;
    let pts = b.pts;
    if (!pts || pts.length < 3) continue;
    if (polyArea(pts) < 0) pts = pts.slice().reverse();       // normalise to CCW-from-above
    const area = Math.abs(polyArea(pts));
    if (area < 4) continue;
    const [cx, cz] = centroidOf(pts);

    // base = MIN terrain under the footprint, so no corner floats on a slope
    let baseY = terrain.heightAt(cx, cz);
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], q = pts[(i + 1) % pts.length];
      const y1 = terrain.heightAt(a[0], a[1]); if (y1 < baseY) baseY = y1;
      const y2 = terrain.heightAt((a[0] + q[0]) / 2, (a[1] + q[1]) / 2); if (y2 < baseY) baseY = y2;
    }
    baseY -= 0.35;

    const h = Math.max(3, b.h || 8);
    const top = baseY + h;
    const dCore = distChurch(cx, cz);
    const core = dCore < CORE_R;
    const hh = hashStr(b.id);

    const gable = area < 250 && /^(house|residential|detached|terrace|semidetached_house|bungalow)$/.test(b.type || '');
    const pois = poisByBldg.get(b.id) || [];
    let style = pickStyle(b, hh, gable);
    for (const p of pois) { const s = SPECIAL[p.name]; if (s && s.style) style = s.style; }
    const buf = facBuf[style];

    // ---- walls -----------------------------------------------------------
    const wallTop = gable ? top : (core ? top - 0.55 : top);
    let run = (hh % 97) / 97 * TILE_W;   // stagger the tile so neighbours don't line up
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], q = pts[(i + 1) % pts.length];
      const dx = q[0] - a[0], dz = q[1] - a[1];
      const L = Math.hypot(dx, dz); if (L < 0.05) continue;
      const u0 = run / TILE_W, u1 = (run + L) / TILE_W; run += L;
      const v1 = (wallTop - baseY) / STOREY;
      buf.quad(
        [a[0], baseY, a[1]], [q[0], baseY, q[1]], [q[0], wallTop, q[1]], [a[0], wallTop, a[1]],
        [u0, 0], [u1, 0], [u1, v1], [u0, v1]
      );
    }

    // ---- roof ------------------------------------------------------------
    if (gable) {
      buildGable(trim, pts, top, hh);
    } else {
      capPolygon(trim, pts, top - 0.22, mix(0x4a4a46, 0xffffff, ((hh >>> 5) & 7) / 42));
      // Roof edge detail costs 4 tris per wall segment across 1,100 buildings. On a phone
      // only the buildings you actually skate past get it; the rest just get the roof cap.
      const roofDetail = !mobile || dCore < 140;
      if (roofDetail) for (let i = 0; i < pts.length; i++) {
        const a = pts[i], q = pts[(i + 1) % pts.length];
        const dx = q[0] - a[0], dz = q[1] - a[1]; const L = Math.hypot(dx, dz); if (L < 0.05) continue;
        const nx = -dz / L, nz = dx / L, p = 0.34;
        const A = [a[0], top, a[1]], B = [q[0], top, q[1]];
        const Ai = [a[0] - nx * p, top, a[1] - nz * p], Bi = [q[0] - nx * p, top, q[1] - nz * p];
        trim.quad(Ai, A, B, Bi, 0xb2ada1);                                                 // coping, faces up
        trim.quad([Ai[0], top - 0.34, Ai[2]], [Bi[0], top - 0.34, Bi[2]], Bi, Ai, 0x968f85); // inner face
        if (core) {
          const y0 = top - 0.55, y1 = top - 0.30, pr = 0.22;
          const e = { ax: a[0], az: a[1], bx: q[0], bz: q[1], nx, nz, dx: dx / L, dz: dz / L, L };
          strip(trim, e, 0, L, y0, y1, pr, 0xa39a8d, false);
        }
      }
      if (core && area > 220 && !mobile) {
        const rr = rng(hh || 3);
        const spread = Math.sqrt(area) * 0.55;
        for (let k = 0, tries = 0; k < 1 + ((hh >> 3) % 3) && tries < 8; tries++) {
          const px = cx + (rr() - 0.5) * spread * 2, pz = cz + (rr() - 0.5) * spread * 2;
          if (!pointInPoly(px, pz, pts)) continue;
          const w = 1.2 + rr() * 1.6, d = 1.0 + rr() * 1.4, bh = 0.7 + rr() * 0.8;
          trim.box(px, top - 0.22 + bh / 2, pz, w, bh, d, rr() * 3, 0x8d918d);
          k++;
        }
      }
    }

    collide.addPolygonWalls(pts, top, b.name || null);
    if (b.holes) for (const hp of b.holes) collide.addPolygonWalls(hp, top, b.name || null);
    nBuilt++;

    const nearVac = VACANCIES.some(v => Math.hypot(v.x - cx, v.z - cz) < 45);
    if (b.onChurch || nearVac || (pois.length && dCore < 130)) {
      shopBldgs.push({ b, pts, baseY, top, h, cx, cz, pois, hh, dCore });
    }
  }

  // =========================================================================
  // pass 2 — storefronts
  // =========================================================================
  const usedVac = new Set();
  const ghostCandidates = [];
  shopBldgs.sort((a, b) => a.dCore - b.dCore);   // dress the mall before the side streets

  for (const S of shopBldgs) {
    const { pts } = S;
    const edges = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], q = pts[(i + 1) % pts.length];
      const dx = q[0] - a[0], dz = q[1] - a[1]; const L = Math.hypot(dx, dz);
      if (L < 2.5) continue;
      const e = { ax: a[0], az: a[1], bx: q[0], bz: q[1], nx: -dz / L, nz: dx / L, dx: dx / L, dz: dz / L, L };
      e.mx = (a[0] + q[0]) / 2; e.mz = (a[1] + q[1]) / 2;
      e.dm = distStreet(e.mx, e.mz);
      const dp = distStreet(e.mx + e.nx * 2.5, e.mz + e.nz * 2.5);
      e.front = dp < e.dm - 0.4 && e.dm < 20;
      e.pois = [];
      edges.push(e);
      if (!e.front && L > 9 && distChurch(e.mx, e.mz) < 190 && e.dm < 60) ghostCandidates.push({ e, S });
    }
    const fronts = edges.filter(e => e.front);
    if (!fronts.length) continue;
    fronts.sort((p, q) => p.dm - q.dm);

    for (const p of S.pois) {
      let best = null, bd = 1e9, bt = 0;
      for (const e of fronts) {
        const t = segT(e.ax, e.az, e.bx, e.bz, p.x, p.z);
        const d = Math.hypot(e.ax + (e.bx - e.ax) * t - p.x, e.az + (e.bz - e.az) * t - p.z);
        if (d < bd) { bd = d; best = e; bt = t; }
      }
      if (best && bd < 45) best.pois.push({ p, t: bt * best.L });
    }

    for (const e of fronts) {
      const onMall = distChurch(e.mx, e.mz) < 17;
      const vacHere = VACANCIES.some(v => !usedVac.has(v) && Math.hypot(v.x - e.mx, v.z - e.mz) < 26);
      if (!e.pois.length && !onMall && !vacHere) continue;
      layoutStorefront(e, S, onMall);
    }
  }

  // ---- ghost signs on 2-3 blank side walls --------------------------------
  ghostCandidates.sort((a, c) => (hashStr(a.S.b.id) % 9973) - (hashStr(c.S.b.id) % 9973));
  let ghosts = 0;
  for (const gc of ghostCandidates) {
    if (ghosts >= GHOST_WORDS.length) break;
    const { e, S } = gc;
    if (S.h < 9 || e.L < 10) continue;
    const word = GHOST_WORDS[ghosts];
    const uv = atlas.slot('ghost:' + word, (g, w, h) => {
      g.fillStyle = '#7a4c3c'; g.fillRect(0, 0, w, h);
      g.globalAlpha = 0.34; g.fillStyle = '#e8ddc8';
      g.textAlign = 'center'; g.textBaseline = 'middle';
      fitText(g, word, 'bold 34px Georgia, serif', w - 24);
      g.fillText(word, w / 2, h / 2);
      g.globalAlpha = 0.22; g.fillStyle = '#3a2a22';
      const r = rng(hashStr(word));
      for (let i = 0; i < 110; i++) g.fillRect(r() * w, r() * h, 6 + r() * 26, 2 + r() * 5);
      g.globalAlpha = 1;
    });
    if (!uv) break;
    const sw = Math.min(e.L * 0.7, 12), sh = sw / CELL_AR;
    signPlane(signB, e, e.L / 2, S.baseY + Math.min(S.h - 1.6, 6.6), sw, sh, 0.06, uv);
    ghosts++;
  }

  // ---- the four-seasons mural on Outdoor Gear Exchange's Cherry St wall ----
  const muralOk = buildMural();

  // =========================================================================
  // build the meshes
  // =========================================================================
  const meshes = [];
  const addMesh = (geo, mat, cast, label) => {
    const m = new THREE.Mesh(geo, mat);
    m.name = 'city:' + (label || 'part');
    m.castShadow = !!(cast && quality.shadows); m.receiveShadow = !!quality.shadows;
    m.matrixAutoUpdate = false; m.updateMatrix();
    scene.add(m); meshes.push(m); return m;
  };
  for (const s of styles) if (!facBuf[s].empty) addMesh(facBuf[s].geometry(), facMat[s], true, 'facade:' + s);
  if (!trim.empty) addMesh(trim.geometry(), new THREE.MeshLambertMaterial({ vertexColors: true }), true, 'trim');
  if (!glass.empty) addMesh(glass.geometry(), new THREE.MeshBasicMaterial({ vertexColors: true }), false, 'glass');
  if (!awn.empty) addMesh(awn.geometry(), new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }), true, 'awning');
  if (!cano.empty) {
    const m = addMesh(cano.geometry(), new THREE.MeshLambertMaterial({
      vertexColors: true, transparent: true, opacity: 0.32, side: THREE.DoubleSide, depthWrite: false,
    }), false, 'canopy');
    m.renderOrder = 2;
  }
  if (!signB.empty) addMesh(signB.geometry(), new THREE.MeshBasicMaterial({ map: atlas.texture(), transparent: true, alphaTest: 0.02 }), false, 'signs');

  console.info(`[city] ${nBuilt} buildings · ${placedSigns.length} signs · ${atlas.n} atlas cells · ${meshes.length} draw calls · ${unplaced.length} unplaced`);
  ctx.cityInfo = { buildings: nBuilt, signs: placedSigns, unplaced, ghosts, mural: !!muralOk, vacancies: usedVac.size, draws: meshes.length, signBandY: [SIGN_Y0, SIGN_Y1], canopyY: CANOPY_Y, canopyOut: CANOPY_OUT };

  // =========================================================================
  // ---- the storefront band ------------------------------------------------
  // =========================================================================
  function layoutStorefront(e, S, onMall) {
    const L = e.L;
    const groundAt = (t) => terrain.heightAt(e.ax + e.dx * t + e.nx * 1.0, e.az + e.dz * t + e.nz * 1.0);

    const poiList = e.pois.slice().sort((a, c) => a.t - c.t);
    // bays are a storefront rhythm (~6.5 m), not one bay per tenant: a 35 m frontage
    // with a single POI still gets five shopfronts rather than one enormous window.
    const maxBays = Math.max(1, Math.floor(L / 2.6));
    const n = Math.min(maxBays, Math.max(1, Math.round(L / 6.5), Math.min(poiList.length, maxBays)));
    const bw = L / n;
    const bays = new Array(n).fill(null);
    for (const rec of poiList) {
      const want = Math.min(n - 1, Math.max(0, Math.floor(rec.t / bw)));
      let slot = -1;
      for (let d = 0; d < n && slot < 0; d++) {
        if (want + d < n && !bays[want + d]) slot = want + d;
        else if (want - d >= 0 && !bays[want - d]) slot = want - d;
      }
      if (slot >= 0) bays[slot] = rec.p; else unplaced.push(rec.p.name);
    }
    const rr = rng((hashStr(S.b.id) ^ Math.round(e.mx * 7 + e.mz * 13)) >>> 0);

    // vacancies claim the single nearest bay on this edge
    const vacBay = new Map();
    for (const v of VACANCIES) {
      if (usedVac.has(v)) continue;
      let bi = -1, bd = 8;
      for (let i = 0; i < n; i++) {
        const tc = (i + 0.5) * bw;
        const d = Math.hypot(e.ax + e.dx * tc - v.x, e.az + e.dz * tc - v.z);
        if (d < bd) { bd = d; bi = i; }
      }
      if (bi >= 0 && !vacBay.has(bi)) { vacBay.set(bi, v); usedVac.add(v); }
    }

    // canopies: patchy, ~45 % of mall edges (reference §4.5b)
    let hasCanopy = onMall && L > 5 && rr() < 0.45;
    if (poiList.some(p => (SPECIAL[p.p.name] || {}).canopy)) hasCanopy = true;

    for (let i = 0; i < n; i++) {
      const t0 = i * bw, t1 = (i + 1) * bw, tc = (t0 + t1) / 2;
      const gy = groundAt(tc);
      const poi = bays[i];
      const name = poi ? poi.name : null;
      const sp = (name && SPECIAL[name]) || {};
      const bx = e.ax + e.dx * tc, bz = e.az + e.dz * tc;

      const vac = vacBay.get(i) || null;
      const deadName = name && DEAD.test(name);
      const vacant = !!vac || !!deadName;

      const seed = hashStr((name || S.b.id) + ':' + i);
      const frameCol = sp.frame != null ? sp.frame : ((seed & 1) ? 0x3b3630 : 0x26262b);
      const bandCol = vacant ? 0x6a6158 : (sp.band != null ? sp.band : BAND_COLS[seed % BAND_COLS.length]);

      // piers between bays
      const pw = 0.3;
      const piers = i === 0 ? [t0 + pw / 2, t1] : [t1];
      for (const tp of piers) {
        const c0 = Math.max(0, tp - pw / 2), c1 = Math.min(L, tp + pw / 2);
        strip(trim, e, c0, c1, gy - 0.1, gy + SIGN_Y0, 0.18, 0x413c35, false);
      }

      const iw0 = t0 + 0.22, iw1 = t1 - 0.22;    // inner width of the bay
      // bulkhead
      strip(trim, e, iw0, iw1, gy - 0.1, gy + BULK_H, 0.16, vacant ? 0x5c5449 : 0x39332c);

      // glazing
      const gy0 = gy + BULK_H + 0.02, gy1 = gy + GLASS_TOP;
      if (vacant) {
        panel(glass, e, iw0, iw1, gy0, gy1, 0.09, 0xc6b68d);                       // kraft paper
        for (let s = 0; s < 3; s++) {
          const tt = iw0 + (iw1 - iw0) * (0.2 + s * 0.3);
          panel(trim, e, tt - 0.03, tt + 0.03, gy0, gy1, 0.11, 0xa89873);          // tape strips
        }
      } else {
        const warm = sp.warm || (seed % 4) === 0;
        const H = gy1 - gy0, tr = gy0 + H * 0.74;   // transom bar
        panel(glass, e, iw0, iw1, gy0, gy0 + H * 0.30, 0.09, 0x122229);
        panel(glass, e, iw0, iw1, gy0 + H * 0.30, gy0 + H * 0.54, 0.09, 0x2c4b57);
        panel(glass, e, iw0, iw1, gy0 + H * 0.54, tr, 0.09, 0x17303a);
        panel(glass, e, iw0, iw1, tr + 0.07, gy1, 0.09, warm ? 0xc08a4a : 0x213840);
        strip(trim, e, iw0, iw1, tr, tr + 0.07, 0.115, frameCol, false);
        // door in the bay
        const dw = Math.min(1.1, bw * 0.34), dt = tc - bw * 0.24;
        panel(glass, e, dt - dw / 2, dt + dw / 2, gy + 0.02, gy + 2.3, 0.105, 0x0f1c22);
        strip(trim, e, dt - dw / 2 - 0.07, dt + dw / 2 + 0.07, gy + 2.28, gy + 2.44, 0.13, frameCol, false);
        // mullions
        for (let t = iw0 + 1.5; t < iw1 - 0.4; t += 1.5) {
          if (Math.abs(t - dt) < dw * 0.7) continue;
          panel(trim, e, t - 0.035, t + 0.035, gy0, gy1, 0.115, frameCol);
        }
        // glazing frame: head + jambs
        strip(trim, e, iw0 - 0.06, iw1 + 0.06, gy1, gy1 + 0.12, 0.14, frameCol, false);
      }

      // sign band
      strip(trim, e, t0 + 0.10, t1 - 0.10, gy + SIGN_Y0, gy + SIGN_Y1, 0.14, bandCol);

      // Ben & Jerry's turquoise band under the sign band
      if (sp.turquoise) {
        strip(trim, e, t0 + 0.10, t1 - 0.10, gy + 2.84, gy + SIGN_Y0, 0.15, 0x2fa8a0, false);
        const uv = atlas.slot('tag:peace', (g, w, h) => plate(g, w, h, 'PEACE, LOVE & ICE CREAM', '#2fa8a0', '#ffffff', FONTS[1]));
        if (uv) { const w2 = Math.min(bw * 0.92, 3.0); signPlane(signB, e, tc, gy + 3.12, w2, w2 / CELL_AR, 0.27, uv); }
      }

      // ---- the sign ------------------------------------------------------
      if (vacant) {
        const uv = atlas.slot('vac:lease', (g, w, h) => {
          g.fillStyle = '#efeae0'; g.fillRect(0, 0, w, h);
          g.strokeStyle = '#8c5a3c'; g.lineWidth = 3; g.strokeRect(5, 5, w - 10, h - 10);
          g.fillStyle = '#8c3a28'; g.textAlign = 'center'; g.textBaseline = 'middle';
          fitText(g, 'FOR LEASE', 'bold 30px "Helvetica Neue", Arial, sans-serif', w - 40);
          g.fillText('FOR LEASE', w / 2, h / 2);
        });
        if (uv) signPlane(signB, e, tc, gy + 2.05, 1.7, 1.7 / CELL_AR, 0.12, uv);
        continue;
      }

      if (name && !deadName) {
        const font = FONTS[seed % FONTS.length];
        const fg = sp.fg || BAND_FG[seed % BAND_FG.length];
        const uv = atlas.slot('n:' + name, (g, w, h) => plate(g, w, h, name, hex(bandCol), fg, font, (seed % 7) === 0));
        if (uv) {
          const sw = Math.min(bw * 0.9, 3.7), sh = sw / CELL_AR;
          signPlane(signB, e, tc, gy + (SIGN_Y0 + SIGN_Y1) / 2, sw, sh, 0.28, uv);
          placedSigns.push({ name, x: +bx.toFixed(1), z: +bz.toFixed(1), mall: onMall });
        }
        // small green shop tag (Frog Hollow "crafted in vermont")
        if (sp.tag) {
          const uv2 = atlas.slot('tag:' + sp.tag, (g, w, h) => plate(g, w, h, sp.tag, hex(bandCol), fg, 'italic 28px Georgia, serif'));
          if (uv2) { const w3 = Math.min(bw * 0.7, 2.4); signPlane(signB, e, tc, gy + 2.86, w3, w3 / CELL_AR, 0.12, uv2); }
        }
      }

      // ---- awning / blade sign -------------------------------------------
      const wantAwning = sp.forceAwning || (!hasCanopy && rr() < 0.7);
      if (wantAwning && !vacant) {
        const col = sp.awning != null ? sp.awning : AWNING_COLS[(seed >> 3) % AWNING_COLS.length];
        awning(e, t0 + 0.35, t1 - 0.35, gy, col, sp.turquoise ? 2.78 : 3.32);
      }
      if (name && (sp.forceBlade || rr() < 0.5)) {
        bladeSign(e, tc + bw * 0.3 < t1 ? tc + bw * 0.28 : tc, gy, sp.blade != null ? sp.blade : (seed & 2 ? 0x1c1c1e : 0x25302a));
      }
    }

    if (hasCanopy) canopyRun(e, groundAt);
  }

  function awning(e, t0, t1, gy, col, topOff = 3.32) {
    if (t1 - t0 < 0.6) return;
    const yTop = gy + topOff, yLow = gy + topOff - 0.72, proj = 1.15;   // under the sign band, not over it
    const A = EP(e, t0, 0.05, yTop), B = EP(e, t1, 0.05, yTop);
    const Ao = EP(e, t0, proj, yLow), Bo = EP(e, t1, proj, yLow);
    awn.quad(A, Ao, Bo, B, col);                                             // sloped canvas
    // valance
    const Av = EP(e, t0, proj, yLow - 0.28), Bv = EP(e, t1, proj, yLow - 0.28);
    awn.quad(Ao, Av, Bv, Bo, mix(col, 0x000000, 0.12));
    // side gussets
    awn.tri(A, Ao, Av, mix(col, 0x000000, 0.2));
    awn.tri(B, Bv, Bo, mix(col, 0x000000, 0.2));
  }

  function bladeSign(e, t, gy, col) {
    const y = gy + 3.02, out0 = 0.16, out1 = 1.32;
    // iron bracket
    panel(trim, e, t - 0.03, t + 0.03, gy + 3.42, gy + 3.5, out0, 0x141414);
    trim.quad2(EP(e, t - 0.03, out0, gy + 3.5), EP(e, t - 0.03, out1, gy + 3.5),
      EP(e, t - 0.03, out1, gy + 3.42), EP(e, t - 0.03, out0, gy + 3.42), 0x141414);
    trim.quad2(EP(e, t - 0.02, out0, gy + 3.42), EP(e, t - 0.02, out1 - 0.5, gy + 3.44),
      EP(e, t - 0.02, out1 - 0.55, gy + 3.0), EP(e, t - 0.02, out0, gy + 3.0), 0x141414);
    // hanger
    trim.quad2(EP(e, t - 0.02, out1 - 0.62, y + 0.2), EP(e, t - 0.02, out1 - 0.58, y + 0.2),
      EP(e, t - 0.02, out1 - 0.58, y + 0.42), EP(e, t - 0.02, out1 - 0.62, y + 0.42), 0x141414);
    // the plate itself, double sided
    const a = EP(e, t - 0.02, out1 - 0.92, y - 0.2), b = EP(e, t - 0.02, out1 - 0.32, y - 0.2);
    const c = EP(e, t - 0.02, out1 - 0.32, y + 0.2), d = EP(e, t - 0.02, out1 - 0.92, y + 0.2);
    trim.quad2(a, b, c, d, col);
  }

  function canopyRun(e, groundAt) {
    const L = e.L;
    const y = groundAt(L / 2) + CANOPY_Y;
    // glass shelf: top + bottom, slightly thick at the front
    const A = EP(e, 0.2, 0.10, y), B = EP(e, L - 0.2, 0.10, y);
    const Ao = EP(e, 0.2, CANOPY_OUT, y - 0.12), Bo = EP(e, L - 0.2, CANOPY_OUT, y - 0.12);
    cano.quad(A, Ao, Bo, B, 0xcfdde4);
    cano.quad(B, Bo, Ao, A, 0xb6c6cf);
    // black steel fascia at the outer edge
    const Af = EP(e, 0.2, CANOPY_OUT, y - 0.12), Bf = EP(e, L - 0.2, CANOPY_OUT, y - 0.12);
    const Af2 = EP(e, 0.2, CANOPY_OUT, y - 0.28), Bf2 = EP(e, L - 0.2, CANOPY_OUT, y - 0.28);
    trim.quad(Af2, Bf2, Bf, Af, 0x141414);
    // posts on the 9-ft line, ~4.5 m apart — collidable
    const nPost = Math.max(2, Math.round(L / 4.5));
    for (let i = 0; i <= nPost; i++) {
      const t = 0.4 + (L - 0.8) * (i / nPost);
      const px = e.ax + e.dx * t + e.nx * (CANOPY_OUT - 0.06);
      const pz = e.az + e.dz * t + e.nz * (CANOPY_OUT - 0.06);
      const g0 = terrain.heightAt(px, pz);
      const ph = Math.max(0.5, y - 0.2 - g0);
      trim.box(px, g0 + ph / 2, pz, 0.13, ph, 0.13, Math.atan2(-e.dx, -e.dz), 0x18181a);
      collide.addBlocker({ x: px, z: pz, r: 0.08, name: 'Canopy post' });
    }
  }

  // ---- Outdoor Gear Exchange's four-seasons mural (original design) --------
  function buildMural() {
    const b = buildings.find(x => x.id === 'w105822104');
    if (!b || landmarkIds.has(b.id)) return false;
    let pts = b.pts; if (polyArea(pts) < 0) pts = pts.slice().reverse();
    // the Cherry Street wall = longest edge whose outward normal points north (-z)
    let best = null, bl = 0;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], q = pts[(i + 1) % pts.length];
      const dx = q[0] - a[0], dz = q[1] - a[1]; const L = Math.hypot(dx, dz); if (L < 20) continue;
      const nz = dx / L; if (nz > -0.6) continue;                 // normal must face north
      if (L > bl) { bl = L; best = { ax: a[0], az: a[1], bx: q[0], bz: q[1], nx: -dz / L, nz, dx: dx / L, dz: dz / L, L }; }
    }
    if (!best) return false;
    const e = best, L = e.L;
    let baseY = 1e9;
    for (const p of pts) baseY = Math.min(baseY, terrain.heightAt(p[0], p[1]));
    const y0 = terrain.heightAt((e.ax + e.bx) / 2, (e.az + e.bz) / 2) + 0.8;
    const y1 = baseY + Math.max(5.4, (b.h || 8) - 1.2);
    const seasons = [
      { sky: 0xa9d488, hill: 0x63a24a, peak: 0x88c46c, orb: 0xf6ecb4 },  // spring
      { sky: 0x63aad6, hill: 0x38927a, peak: 0x64b899, orb: 0xf6f2d8 },  // summer
      { sky: 0xdd9a52, hill: 0xb2582c, peak: 0xd67733, orb: 0xf2d8a6 },  // fall
      { sky: 0xdde8f0, hill: 0xa2b6c4, peak: 0xf4f8fb, orb: 0xffffff },  // winter
    ];
    const pw = L / 4;
    for (let s = 0; s < 4; s++) {
      const t0 = s * pw, t1 = (s + 1) * pw, S = seasons[s];
      panel(glass, e, t0, t1, y0, y1, 0.06, S.sky);
      const hy = y0 + (y1 - y0) * 0.28;
      panel(glass, e, t0, t1, y0, hy, 0.07, S.hill);
      // three peaks
      for (let k = 0; k < 3; k++) {
        const c = t0 + pw * (0.22 + k * 0.28), w = pw * 0.3, ph = (y1 - y0) * (0.28 + (k % 2) * 0.16);
        glass.tri(EP(e, c - w, 0.075, hy), EP(e, c + w, 0.075, hy), EP(e, c, 0.075, hy + ph), S.peak);
      }
      // sun / moon
      const ox = t0 + pw * 0.76, oy = y1 - (y1 - y0) * 0.2, rr2 = Math.min(pw * 0.09, 1.1);
      for (let k = 0; k < 8; k++) {
        const a0 = (k / 8) * Math.PI * 2, a1 = ((k + 1) / 8) * Math.PI * 2;
        glass.tri(EP(e, ox, 0.08, oy),
          EP(e, ox + Math.cos(a0) * rr2, 0.08, oy + Math.sin(a0) * rr2),
          EP(e, ox + Math.cos(a1) * rr2, 0.08, oy + Math.sin(a1) * rr2), S.orb);
      }
      // seam
      if (s < 3) panel(glass, e, t1 - 0.06, t1 + 0.06, y0, y1, 0.085, 0xf0ece2);
    }
    return true;
  }
}
