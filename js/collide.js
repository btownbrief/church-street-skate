// The physics world: a uniform grid of surfaces (flat-topped rotated boxes), grind
// edges (3D segments), walls (vertical 2D segments), ramps (sloped quads) and blockers
// (cylinders). World builders populate it; skate.js reads it. Positions in metres.
import { clamp, segT } from './util.js';

const CELL = 8;

class Grid {
  constructor() { this.m = new Map(); }
  key(cx, cz) { return cx * 100003 + cz; }
  insert(item, minX, minZ, maxX, maxZ) {
    const x0 = Math.floor(minX / CELL), x1 = Math.floor(maxX / CELL);
    const z0 = Math.floor(minZ / CELL), z1 = Math.floor(maxZ / CELL);
    for (let cx = x0; cx <= x1; cx++) for (let cz = z0; cz <= z1; cz++) {
      const k = this.key(cx, cz); let a = this.m.get(k); if (!a) { a = []; this.m.set(k, a); } a.push(item);
    }
  }
  query(minX, minZ, maxX, maxZ, out) {
    out.length = 0;
    const x0 = Math.floor(minX / CELL), x1 = Math.floor(maxX / CELL);
    const z0 = Math.floor(minZ / CELL), z1 = Math.floor(maxZ / CELL);
    for (let cx = x0; cx <= x1; cx++) for (let cz = z0; cz <= z1; cz++) {
      const a = this.m.get(this.key(cx, cz)); if (!a) continue;
      for (const it of a) if (it._q !== this._stamp) { it._q = this._stamp; out.push(it); }
    }
    this._stamp++;
    return out;
  }
  _stamp = 1;
}

export class CollisionWorld {
  constructor(terrain) {
    this.terrain = terrain; // { heightAt(x,z), normalAt(x,z,out) }
    this.surfaces = new Grid(); this.edges = new Grid(); this.walls = new Grid(); this.ramps = new Grid(); this.blockers = new Grid();
    this.all = { surfaces: [], edges: [], walls: [], ramps: [], blockers: [] };
    this._tmp = []; this._tmp2 = [];
  }

  // ---- registration -------------------------------------------------------
  addSurface(s) {
    const o = { type: 'surface', x: s.x, z: s.z, w: s.w, d: s.d, yaw: s.yaw || 0, top: s.top, bottom: s.bottom ?? (s.top - 1), kind: s.kind || 'ledge', name: s.name || null, grindable: !!s.grindable, mesh: s.mesh || null };
    o.c = Math.cos(o.yaw); o.s = Math.sin(o.yaw);
    const r = Math.hypot(o.w, o.d) / 2;
    this.surfaces.insert(o, o.x - r, o.z - r, o.x + r, o.z + r);
    this.all.surfaces.push(o);
    if (o.grindable) {
      // top edges in world space. local X axis = (c, -s)? Use rotation of local (lx, lz): wx = x + lx*c + lz*s ; wz = z - lx*s + lz*c  (yaw CCW from above, matching fwd())
      const hw = o.w / 2, hd = o.d / 2;
      const P = (lx, lz) => [o.x + lx * o.c + lz * o.s, o.z - lx * o.s + lz * o.c];
      const a = P(-hw, -hd), b = P(hw, -hd), c2 = P(hw, hd), d = P(-hw, hd);
      const eKind = s.edgeKind || 'ledge';
      const edges = o.w >= o.d ? [[a, b], [d, c2]] : [[a, d], [b, c2]]; // only long edges
      if (s.allEdges) edges.push(o.w >= o.d ? [a, d] : [a, b], o.w >= o.d ? [b, c2] : [d, c2]);
      for (const [p, q] of edges) this.addEdge({ ax: p[0], ay: o.top, az: p[1], bx: q[0], by: o.top, bz: q[1], kind: eKind, name: o.name, surface: o });
    }
    return o;
  }
  addEdge(e) {
    const o = { type: 'edge', ax: e.ax, ay: e.ay, az: e.az, bx: e.bx, by: e.by, bz: e.bz, kind: e.kind || 'rail', name: e.name || null, surface: e.surface || null };
    o.len = Math.hypot(o.bx - o.ax, o.bz - o.az); if (o.len < 0.3) return null;
    this.edges.insert(o, Math.min(o.ax, o.bx), Math.min(o.az, o.bz), Math.max(o.ax, o.bx), Math.max(o.az, o.bz));
    this.all.edges.push(o); return o;
  }
  addWall(w) {
    const o = { type: 'wall', ax: w.ax, az: w.az, bx: w.bx, bz: w.bz, top: w.top ?? 1e9, bottom: w.bottom ?? -1e9, name: w.name || null };
    const len = Math.hypot(o.bx - o.ax, o.bz - o.az); if (len < 0.05) return null;
    o.nx = (o.bz - o.az) / len; o.nz = -(o.bx - o.ax) / len; // unit normal
    this.walls.insert(o, Math.min(o.ax, o.bx), Math.min(o.az, o.bz), Math.max(o.ax, o.bx), Math.max(o.az, o.bz));
    this.all.walls.push(o); return o;
  }
  addPolygonWalls(pts, top, name) {
    for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; if (a[0] === b[0] && a[1] === b[1]) continue; this.addWall({ ax: a[0], az: a[1], bx: b[0], bz: b[1], top, name }); }
  }
  // Ramp: sloped quad from edge A (yLow) to edge B (yHigh); width w is perpendicular extent centred on the A→B line.
  addRamp(r) {
    const o = { type: 'ramp', ax: r.ax, az: r.az, bx: r.bx, bz: r.bz, w: r.w, yLow: r.yLow, yHigh: r.yHigh, kind: r.kind || 'stairs', name: r.name || null, steps: r.steps || 0 };
    o.len = Math.hypot(o.bx - o.ax, o.bz - o.az); if (o.len < 0.2) return null; o.ux = (o.bx - o.ax) / o.len; o.uz = (o.bz - o.az) / o.len;
    const hw = o.w / 2 + 0.5;
    this.ramps.insert(o, Math.min(o.ax, o.bx) - hw, Math.min(o.az, o.bz) - hw, Math.max(o.ax, o.bx) + hw, Math.max(o.az, o.bz) + hw);
    this.all.ramps.push(o); return o;
  }
  addBlocker(b) { const o = { type: 'blocker', x: b.x, z: b.z, r: b.r || 0.25, name: b.name || null, top: b.top ?? 1e9 }; this.blockers.insert(o, o.x - o.r, o.z - o.r, o.x + o.r, o.z + o.r); this.all.blockers.push(o); return o; }

  // ---- queries ------------------------------------------------------------
  // local coords of point in a surface's frame
  _local(s, px, pz, out) { const dx = px - s.x, dz = pz - s.z; out[0] = dx * s.c - dz * s.s; out[1] = dx * s.s + dz * s.c; return out; }
  _inSurface(s, px, pz, margin = 0) { const l = this._local(s, px, pz, this._l); return Math.abs(l[0]) <= s.w / 2 + margin && Math.abs(l[1]) <= s.d / 2 + margin; }
  _l = [0, 0];

  rampHeight(r, px, pz) {
    const dx = px - r.ax, dz = pz - r.az; const t = dx * r.ux + dz * r.uz; const side = -dx * r.uz + dz * r.ux;
    if (t < -0.01 || t > r.len + 0.01 || Math.abs(side) > r.w / 2) return null;
    return r.yLow + (r.yHigh - r.yLow) * clamp(t / r.len, 0, 1);
  }

  // Ground under (x,z). yHint = current skater y; we return the highest walkable support whose top
  // is <= yHint + stepUp (so you can roll onto curbs but not teleport onto a ledge from below).
  // Returns {y, nx, ny, nz, kind, obj, slope}.
  groundAt(x, z, yHint, stepUp = 0.22, out) {
    out = out || {};
    const t = this.terrain; let y = t.heightAt(x, z); let kind = 'ground'; let obj = null;
    const n = t.normalAt(x, z, this._n); let nx = n[0], ny = n[1], nz = n[2];
    const lim = yHint + stepUp;
    const surfs = this.surfaces.query(x - 0.5, z - 0.5, x + 0.5, z + 0.5, this._tmp);
    for (const s of surfs) { if (s.top > lim || s.top < y + 1e-3) continue; if (this._inSurface(s, x, z)) { y = s.top; kind = s.kind; obj = s; nx = 0; ny = 1; nz = 0; } }
    const ramps = this.ramps.query(x - 0.5, z - 0.5, x + 0.5, z + 0.5, this._tmp2);
    for (const r of ramps) { const ry = this.rampHeight(r, x, z); if (ry == null || ry > lim || ry < y + 1e-3) continue; y = ry; kind = r.kind; obj = r;
      // normal of the ramp plane
      const g = (r.yHigh - r.yLow) / r.len; const inv = 1 / Math.hypot(1, g); nx = -r.ux * g * inv; nz = -r.uz * g * inv; ny = inv; }
    out.y = y; out.nx = nx; out.ny = ny; out.nz = nz; out.kind = kind; out.obj = obj; return out;
  }
  _n = [0, 1, 0];

  // Highest support strictly below yFrom (used when airborne to find landing height without the stepUp rule)
  supportBelow(x, z, yFrom, out) { return this.groundAt(x, z, yFrom, 0, out); }

  // Nearest grind edge to (x,y,z) within maxD horizontally and within vertical band. Returns {edge, t, px,py,pz, d} or null
  nearestEdge(x, y, z, maxD = 0.6, yAbove = 0.5, yBelow = 0.25, out) {
    const es = this.edges.query(x - maxD, z - maxD, x + maxD, z + maxD, this._tmp);
    let best = null, bd = maxD;
    for (const e of es) {
      const t = segT(e.ax, e.az, e.bx, e.bz, x, z);
      const px = e.ax + (e.bx - e.ax) * t, pz = e.az + (e.bz - e.az) * t, py = e.ay + (e.by - e.ay) * t;
      const dy = y - py; if (dy > yAbove || dy < -yBelow) continue;
      const d = Math.hypot(px - x, pz - z); if (d < bd) { bd = d; best = e; out = out || {}; out.edge = e; out.t = t; out.px = px; out.py = py; out.pz = pz; out.d = d; }
    }
    return best ? out : null;
  }

  // Push a circle of radius r at (pos.x,pos.z) with height y out of walls and surface sides. Returns hit info (normal of strongest hit) or null.
  resolveWalls(pos, r, y, top, out, sideTol = 0.12) {
    let hit = null;
    const ws = this.walls.query(pos.x - r, pos.z - r, pos.x + r, pos.z + r, this._tmp);
    for (const w of ws) {
      if (y > w.top - 0.05) continue; // we're above the wall (e.g. on the roof/ledge)
      const t = segT(w.ax, w.az, w.bx, w.bz, pos.x, pos.z);
      const px = w.ax + (w.bx - w.ax) * t, pz = w.az + (w.bz - w.az) * t;
      let dx = pos.x - px, dz = pos.z - pz; const d = Math.hypot(dx, dz);
      if (d >= r) continue;
      if (d < 1e-4) { dx = w.nx; dz = w.nz; } else { dx /= d; dz /= d; }
      const push = r - d; pos.x += dx * push; pos.z += dz * push;
      if (!hit || push > hit.push) { hit = out || {}; hit.nx = dx; hit.nz = dz; hit.push = push; hit.obj = w; }
    }
    // surface sides (ledges, planters, benches): if we're below its top by a margin and overlapping, push out
    const ss = this.surfaces.query(pos.x - r, pos.z - r, pos.x + r, pos.z + r, this._tmp2);
    for (const s of ss) {
      if (y >= s.top - sideTol || y + 0.1 < s.bottom) continue;
      if (s.kind === 'sidewalk' || s.kind === 'curb' || s.kind === 'pad') continue; // rolled onto via stepUp instead
      const l = this._local(s, pos.x, pos.z, this._l);
      const hw = s.w / 2 + r, hd = s.d / 2 + r;
      if (Math.abs(l[0]) >= hw || Math.abs(l[1]) >= hd) continue;
      // push along least-penetration axis in local frame
      const px = hw - Math.abs(l[0]), pz = hd - Math.abs(l[1]);
      let lx = 0, lz = 0; if (px < pz) lx = Math.sign(l[0]) || 1; else lz = Math.sign(l[1]) || 1;
      const push = Math.min(px, pz);
      // local → world direction: wx = lx*c + lz*s ; wz = -lx*s + lz*c
      const wx = lx * s.c + lz * s.s, wz = -lx * s.s + lz * s.c;
      pos.x += wx * push; pos.z += wz * push;
      if (!hit || push > hit.push) { hit = out || {}; hit.nx = wx; hit.nz = wz; hit.push = push; hit.obj = s; }
    }
    const bs = this.blockers.query(pos.x - r, pos.z - r, pos.x + r, pos.z + r, this._tmp);
    for (const b of bs) {
      if (y > b.top) continue;
      let dx = pos.x - b.x, dz = pos.z - b.z; const d = Math.hypot(dx, dz); const rr = r + b.r; if (d >= rr) continue;
      if (d < 1e-4) { dx = 1; dz = 0; } else { dx /= d; dz /= d; }
      const push = rr - d; pos.x += dx * push; pos.z += dz * push;
      if (!hit || push > hit.push) { hit = out || {}; hit.nx = dx; hit.nz = dz; hit.push = push; hit.obj = b; }
    }
    return hit;
  }

  // 2D segment A→B vs walls whose top is above y: returns smallest t in (0,1) or 1 if clear.
  raycastWalls(ax, az, bx, bz, y) {
    const ws = this.walls.query(Math.min(ax, bx), Math.min(az, bz), Math.max(ax, bx), Math.max(az, bz), this._tmp);
    let best = 1; const dx = bx - ax, dz = bz - az;
    for (const w of ws) {
      if (w.top < y) continue;
      const ex = w.bx - w.ax, ez = w.bz - w.az; const den = dx * ez - dz * ex; if (Math.abs(den) < 1e-9) continue;
      const fx = w.ax - ax, fz = w.az - az; const t = (fx * ez - fz * ex) / den; const u = (fx * dz - fz * dx) / den;
      if (t > 0 && t < best && u >= 0 && u <= 1) best = t;
    }
    return best;
  }

  // Is the box column at (x,z) blocked above y (for ceiling / under-surface checks)? Cheap: top surfaces overhead.
  ceilingAt(x, z, y) {
    let c = Infinity;
    const ss = this.surfaces.query(x - 0.3, z - 0.3, x + 0.3, z + 0.3, this._tmp);
    for (const s of ss) if (s.bottom > y + 0.2 && s.bottom < c && this._inSurface(s, x, z)) c = s.bottom;
    return c;
  }
}
