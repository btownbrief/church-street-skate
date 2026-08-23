// Cars, pickups, wagons and one GMT bus on Burlington's car streets. Builder D.
//
// A directed graph is built from WORLD.roads (way endpoints merged into nodes, `oneway`
// respected). Cars drive on the right, slow for intersections, stop for the skater and
// for each other, and honk. Parked cars line the curb lane and ARE registered with the
// collision world so you can ollie onto a roof.
//
// Draw calls: 4 instanced meshes cover every moving and parked car (body / cabin /
// wheels / lights), plus 2 for the bus.
//
// NOTE on one-ways: the brief assumed Bank / Cherry / College / St Paul are one-way.
// They are not — this OSM extract tags only Center St, S Union St and Buell St as
// `oneway=yes` downtown, which matches the Great Streets BTV sheets. We follow the data.
import * as THREE from '../vendor/three.module.min.js';
import { clamp, rng } from './util.js';

// mirror of roadWidth() in js/ground.js (builder A) — keep the two in step
function feetOf(v) { const m = /^([\d.]+)\s*'$/.exec(String(v)); return m ? +m[1] * 0.3048 : null; }
function roadWidth(r) {
  if (r.width) { const f = feetOf(r.width); const v = f != null ? f : parseFloat(r.width); if (v > 1.5 && v < 40) return v; }
  const base = { primary: 11, secondary: 11, tertiary: 9, residential: 9, unclassified: 9, service: 5 }[r.kind] || 8;
  const lanes = parseInt(r.lanes, 10);
  if (lanes >= 1) return Math.max(base, lanes * 3.3 + (r.kind === 'service' ? 0 : 4.8));
  return base;
}

const CAR_KINDS = ['primary', 'secondary', 'tertiary', 'residential', 'unclassified'];
const SPEED = { primary: 11, secondary: 11, tertiary: 9, residential: 7, unclassified: 8 };
const laneOff = (hw) => clamp(hw * 0.4, 1.4, 1.95);   // travel lane, right of centreline
const BUS_STREETS = ['Cherry Street', 'Saint Paul Street', 'Pearl Street', 'Main Street'];

// local -z is the nose of every vehicle
const TYPES = [
  { n: 'wagon', bw: 1.82, bh: 0.70, bl: 4.70, by: 0.62, cw: 1.66, ch: 0.66, cl: 2.70, cy: 1.28, cz: 0.25, wb: 1.52, w: 5 },
  { n: 'wagon2', bw: 1.80, bh: 0.68, bl: 4.55, by: 0.60, cw: 1.64, ch: 0.62, cl: 2.55, cy: 1.24, cz: 0.20, wb: 1.48, w: 4 },
  { n: 'sedan', bw: 1.76, bh: 0.64, bl: 4.40, by: 0.60, cw: 1.58, ch: 0.56, cl: 2.05, cy: 1.18, cz: 0.30, wb: 1.42, w: 3 },
  { n: 'pickup', bw: 1.92, bh: 0.72, bl: 5.25, by: 0.72, cw: 1.80, ch: 0.82, cl: 1.85, cy: 1.48, cz: -1.05, wb: 1.72, w: 3 },
  { n: 'suv', bw: 1.92, bh: 0.88, bl: 4.75, by: 0.72, cw: 1.80, ch: 0.70, cl: 2.90, cy: 1.50, cz: 0.10, w: 2, wb: 1.55 },
];
const PAINT = [0x2e3d52, 0x6d7377, 0x9aa1a6, 0x1d1f22, 0xb8bec2, 0x2f5c46, 0x7a2f2a, 0xe6e8ea, 0x38424e, 0x4a5b3c, 0x8a7a5c, 0xc9ccd0];

export function createTraffic(ctx) {
  const { scene, WORLD, collide, terrain, quality, updaters, play } = ctx;
  const rnd = rng(4242);
  const R = (a, b) => a + (b - a) * rnd();

  // ---- graph -------------------------------------------------------------
  const nodes = [];                        // { x, z, edges: [] }
  const nodeGrid = new Map();
  const NK = (cx, cz) => cx * 100003 + cz;
  function nodeAt(x, z) {
    const cx = Math.round(x / 0.6), cz = Math.round(z / 0.6);
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
      const a = nodeGrid.get(NK(cx + dx, cz + dz));
      if (a !== undefined && Math.hypot(nodes[a].x - x, nodes[a].z - z) <= 0.6) return a;
    }
    const i = nodes.length; nodes.push({ x, z, edges: [] }); nodeGrid.set(NK(cx, cz), i); return i;
  }

  const edges = [];
  const MARGIN = 90;
  for (const r of WORLD.roads || []) {
    if (!CAR_KINDS.includes(r.kind) || !r.pts || r.pts.length < 2) continue;
    // keep it near the playable box so cars never drive off the terrain
    let inside = false;
    for (const p of r.pts) if (p[0] > play.minX - MARGIN && p[0] < play.maxX + MARGIN && p[1] > play.minZ - MARGIN && p[1] < play.maxZ + MARGIN) { inside = true; break; }
    if (!inside) continue;
    const pts = r.pts;
    const cum = new Float64Array(pts.length); let L = 0;
    for (let i = 1; i < pts.length; i++) { L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); cum[i] = L; }
    if (L < 8) continue;
    const ow = r.oneway;
    const fwdOK = ow !== '-1', backOK = ow !== 'yes' && ow !== '1' && ow !== 'true';
    if (!fwdOK && !backOK) continue;
    const e = {
      i: edges.length, pts, cum, len: L, kind: r.kind, name: r.name || '',
      a: nodeAt(pts[0][0], pts[0][1]), b: nodeAt(pts[pts.length - 1][0], pts[pts.length - 1][1]),
      fwdOK, backOK, hw: roadHalfWidth(r), speed: SPEED[r.kind] || 8,
      bus: BUS_STREETS.includes(r.name || ''),
    };
    if (e.a === e.b) continue;
    edges.push(e);
    nodes[e.a].edges.push(e.i); nodes[e.b].edges.push(e.i);
  }
  if (!edges.length) return;

  // ---- geometry ----------------------------------------------------------
  const BOX = new THREE.BoxGeometry(1, 1, 1);
  const WHEEL = new THREE.CylinderGeometry(0.33, 0.33, 0.22, 10); WHEEL.rotateZ(Math.PI / 2);
  const lam = () => new THREE.MeshLambertMaterial({ color: 0xffffff });

  const nMove = Math.max(6, Math.round(22 * (quality.traffic || 1)));
  const nPark = Math.max(10, Math.round(86 * (quality.traffic || 1)));
  const CAP = nMove + nPark;                 // parked occupy [0, nPark), movers [nPark, CAP)

  const _hide = new THREE.Matrix4().makeScale(0, 0, 0).setPosition(0, -500, 0);
  const mk = (geo, mat, n, label) => {
    const m = new THREE.InstancedMesh(geo, mat, n); m.name = 'traffic:' + (label || 'part');
    m.frustumCulled = false; m.castShadow = !!quality.shadows; m.receiveShadow = false;
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    for (let i = 0; i < n; i++) m.setMatrixAt(i, _hide);   // unused slots must not sit at the origin
    scene.add(m); return m;
  };
  const bodyM = mk(BOX, lam(), CAP);
  const cabinM = mk(BOX, lam(), CAP);
  const wheelM = mk(WHEEL, new THREE.MeshLambertMaterial({ color: 0x16171a }), CAP * 4);
  const lightM = mk(BOX, new THREE.MeshBasicMaterial({ color: 0xffffff }), CAP * 4);
  lightM.castShadow = false;

  // ---- matrix helper: yaw about Y then pitch about local X ---------------
  const _m = new THREE.Matrix4();
  const V = { c: 1, s: 0, cp: 1, sp: 0, x: 0, y: 0, z: 0 };
  function setVehicle(x, y, z, yaw, pitch) {
    V.x = x; V.y = y; V.z = z; V.c = Math.cos(yaw); V.s = Math.sin(yaw); V.cp = Math.cos(pitch); V.sp = Math.sin(pitch);
  }
  function part(mesh, i, lx, ly, lz, sx, sy, sz) {
    const { c, s, cp, sp } = V;
    const ry = ly * cp - lz * sp, rz = ly * sp + lz * cp;
    const e = _m.elements;
    e[0] = c * sx; e[1] = 0; e[2] = -s * sx; e[3] = 0;
    e[4] = s * sp * sy; e[5] = cp * sy; e[6] = c * sp * sy; e[7] = 0;
    e[8] = s * cp * sz; e[9] = -sp * sz; e[10] = c * cp * sz; e[11] = 0;
    e[12] = V.x + lx * c + rz * s; e[13] = V.y + ry; e[14] = V.z - lx * s + rz * c; e[15] = 1;
    mesh.setMatrixAt(i, _m);
  }
  const _col = new THREE.Color();
  function drawVehicle(i, v) {
    const T = v.T;
    setVehicle(v.x, v.y, v.z, v.yaw, v.pitch);
    part(bodyM, i, 0, T.by, 0, T.bw, T.bh, T.bl);
    part(cabinM, i, 0, T.cy, T.cz, T.cw, T.ch, T.cl);
    const wx = T.bw / 2 - 0.06, wy = 0.33, wz = T.wb;
    part(wheelM, i * 4 + 0, -wx, wy, -wz, 1, 1, 1);
    part(wheelM, i * 4 + 1, wx, wy, -wz, 1, 1, 1);
    part(wheelM, i * 4 + 2, -wx, wy, wz, 1, 1, 1);
    part(wheelM, i * 4 + 3, wx, wy, wz, 1, 1, 1);
    const lx = T.bw / 2 - 0.3, ly = T.by + 0.06, lz = T.bl / 2;
    part(lightM, i * 4 + 0, -lx, ly, -lz, 0.28, 0.13, 0.06);
    part(lightM, i * 4 + 1, lx, ly, -lz, 0.28, 0.13, 0.06);
    part(lightM, i * 4 + 2, -lx, ly, lz, 0.26, 0.12, 0.06);
    part(lightM, i * 4 + 3, lx, ly, lz, 0.26, 0.12, 0.06);
  }
  function paint(i, hex, braking) {
    bodyM.setColorAt(i, _col.setHex(hex)); cabinM.setColorAt(i, _col.setHex(hex));
    lightM.setColorAt(i * 4 + 0, _col.setHex(0xfff2cf)); lightM.setColorAt(i * 4 + 1, _col.setHex(0xfff2cf));
    const rear = braking ? 0xff3a1a : 0x8e1c10;
    lightM.setColorAt(i * 4 + 2, _col.setHex(rear)); lightM.setColorAt(i * 4 + 3, _col.setHex(rear));
  }

  function pickType() { let t = rnd() * 17; for (const T of TYPES) { t -= T.w; if (t <= 0) return T; } return TYPES[0]; }

  // ---- edge sampling -----------------------------------------------------
  const _e = [0, 0, 0, 0];
  function edgeAt(e, s, off, out) {
    s = clamp(s, 0, e.len);
    let i = 1; const n = e.pts.length;
    while (i < n - 1 && e.cum[i] < s) i++;
    const a = e.pts[i - 1], b = e.pts[i];
    const seg = e.cum[i] - e.cum[i - 1];
    const t = seg > 1e-6 ? (s - e.cum[i - 1]) / seg : 0;
    const dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz) || 1;
    const ux = dx / L, uz = dz / L;
    // "right of travel" for a heading (ux,uz) is (-uz, ux)
    out[0] = a[0] + dx * t - uz * off; out[1] = a[1] + dz * t + ux * off; out[2] = ux; out[3] = uz;
    return out;
  }

  // ---- parked cars -------------------------------------------------------
  const nodeDeg = nodes.map(n => n.edges.length);
  const mall = WORLD.churchStreet && WORLD.churchStreet.centerline;
  function distToMall(x, z) {
    if (!mall) return 0;
    let best = 1e9;
    for (let i = 1; i < mall.length; i++) {
      const a = mall[i - 1], b = mall[i];
      const dx = b[0] - a[0], dz = b[1] - a[1], l2 = dx * dx + dz * dz;
      const t = l2 < 1e-9 ? 0 : clamp(((x - a[0]) * dx + (z - a[1]) * dz) / l2, 0, 1);
      const px = a[0] + dx * t - x, pz = a[1] + dz * t - z;
      const d = px * px + pz * pz;
      if (d < best) best = d;
    }
    return Math.sqrt(best);
  }
  const nearMall = (x, z) => distToMall(x, z) < 14;   // no parking on the bricks
  {
    const slots = [];
    for (const e of edges) {
      const cxm = (e.pts[0][0] + e.pts[e.pts.length - 1][0]) / 2, czm = (e.pts[0][1] + e.pts[e.pts.length - 1][1]) / 2;
      if (cxm < play.minX - 30 || cxm > play.maxX + 30 || czm < play.minZ - 30 || czm > play.maxZ + 30) continue;
      const step = 6.6;
      for (let s = 8; s < e.len - 8; s += step) {
        for (const sign of [1, -1]) {
          if (rnd() < 0.34) continue;
          const off = sign * (e.hw - 1.0);
          edgeAt(e, s, off, _e);
          const x = _e[0], z = _e[1];
          if (nearMall(x, z)) continue;
          if (x < play.minX || x > play.maxX || z < play.minZ || z > play.maxZ) continue;
          const yaw = Math.atan2(-_e[2] * sign, -_e[3] * sign);
          slots.push({ x, z, yaw });
        }
      }
    }
    // weight toward the Church St core so the blocks the player actually skates
    // look parked-up, instead of 70 cars smeared over five kilometres of street
    for (const sl of slots) sl.k = (0.35 + rnd()) * (1 + distToMall(sl.x, sl.z) / 110);
    slots.sort((a, b) => a.k - b.k);
    const take = Math.min(nPark, slots.length);
    for (let i = 0; i < take; i++) {
      const sl = slots[i], T = pickType();
      const y = terrain.heightAt(sl.x, sl.z) + 0.02;
      const hA = terrain.heightAt(sl.x - Math.sin(sl.yaw) * 2, sl.z - Math.cos(sl.yaw) * 2);
      const hB = terrain.heightAt(sl.x + Math.sin(sl.yaw) * 2, sl.z + Math.cos(sl.yaw) * 2);
      drawVehicle(i, { x: sl.x, y, z: sl.z, yaw: sl.yaw + R(-0.03, 0.03), pitch: Math.atan2(hA - hB, 4), T });
      paint(i, PAINT[(rnd() * PAINT.length) | 0], false);
      // Two decks, so a parked car is actually skateable: the hood/trunk sheet metal (a
      // reachable ollie) and the cabin roof above it. Landing on either counts as the car.
      const deck = y + T.by + T.bh / 2, roof = y + T.cy + T.ch / 2;
      const cs = Math.sin(sl.yaw), cc = Math.cos(sl.yaw);   // local (0, cz) → world, same as part()
      collide.addSurface({ x: sl.x, z: sl.z, w: T.bw, d: T.bl, yaw: sl.yaw, top: deck, bottom: y, kind: 'car', name: 'Parked car', grindable: false });
      collide.addSurface({ x: sl.x + T.cz * cs, z: sl.z + T.cz * cc, w: T.cw, d: T.cl, yaw: sl.yaw, top: roof, bottom: deck, kind: 'car', name: 'Parked car', grindable: false });
    }
    for (let i = take; i < nPark; i++) { part(bodyM, i, 0, -400, 0, 0.001, 0.001, 0.001); part(cabinM, i, 0, -400, 0, 0.001, 0.001, 0.001); for (let k = 0; k < 4; k++) { part(wheelM, i * 4 + k, 0, -400, 0, 0.001, 0.001, 0.001); part(lightM, i * 4 + k, 0, -400, 0, 0.001, 0.001, 0.001); } }
  }

  // ---- moving cars -------------------------------------------------------
  const cars = [];
  for (let i = 0; i < nMove; i++) {
    cars.push({
      idx: nPark + i, T: pickType(), col: PAINT[(rnd() * PAINT.length) | 0],
      e: null, dir: 1, s: 0, v: 0, want: 8, x: 0, y: 0, z: 0, yaw: 0, pitch: 0,
      blocked: 0, honked: false, brakeLit: false,
    });
  }

  function placeCar(c, sk, minD, maxD) {
    for (let tries = 0; tries < 40; tries++) {
      const e = edges[(rnd() * edges.length) | 0];
      if (!e.fwdOK && !e.backOK) continue;
      const dir = e.fwdOK && e.backOK ? (rnd() < 0.5 ? 1 : -1) : (e.fwdOK ? 1 : -1);
      const s = R(2, Math.max(3, e.len - 2));
      edgeAt(e, s, laneOff(e.hw) * dir, _e);
      const d = Math.hypot(_e[0] - sk.pos.x, _e[1] - sk.pos.z);
      if (d < minD || d > maxD) continue;
      let clash = false;
      for (const o of cars) if (o !== c && o.e === e && Math.abs(o.s - s) < 10) { clash = true; break; }
      if (clash) continue;
      c.e = e; c.dir = dir; c.s = s; c.v = e.speed * 0.7; c.blocked = 0; c.honked = false;
      updateCarPose(c);
      return true;
    }
    return false;
  }

  function updateCarPose(c) {
    const e = c.e;
    edgeAt(e, c.s, laneOff(c.e.hw) * c.dir, _e);
    c.x = _e[0]; c.z = _e[1];
    const ux = _e[2] * c.dir, uz = _e[3] * c.dir;
    c.yaw = Math.atan2(-ux, -uz);
    c.y = terrain.heightAt(c.x, c.z) + 0.02;
    const hA = terrain.heightAt(c.x + ux * 2.2, c.z + uz * 2.2);
    const hB = terrain.heightAt(c.x - ux * 2.2, c.z - uz * 2.2);
    c.pitch = clamp(Math.atan2(hA - hB, 4.4), -0.25, 0.25);
    c.ux = ux; c.uz = uz;
  }

  function nextEdge(c) {
    const e = c.e;
    const endNode = c.dir > 0 ? e.b : e.a;
    const nd = nodes[endNode];
    const cand = [];
    let wsum = 0;
    for (const ei of nd.edges) {
      const ne = edges[ei];
      const dir = ne.a === endNode ? 1 : -1;
      if (dir > 0 ? !ne.fwdOK : !ne.backOK) continue;
      if (ne === e && nd.edges.length > 1) continue;      // no U-turn unless dead end
      // heading of the new edge at its start
      edgeAt(ne, dir > 0 ? 0.5 : ne.len - 0.5, 0, _e);
      const nx = _e[2] * dir, nz = _e[3] * dir;
      const dot = nx * c.ux + nz * c.uz;
      const w = 0.12 + Math.max(0, dot) * 3;
      cand.push({ ne, dir, w }); wsum += w;
    }
    if (!cand.length) { c.dir *= -1; c.s = clamp(c.s, 0, c.e.len); return; }
    let t = rnd() * wsum, pick = cand[cand.length - 1];
    for (const q of cand) { t -= q.w; if (t <= 0) { pick = q; break; } }
    c.e = pick.ne; c.dir = pick.dir; c.s = pick.dir > 0 ? 0 : pick.ne.len;
  }

  // is anything inside the 10 m x 2.5 m box straight ahead?
  function blockedAhead(c, sk) {
    const ux = c.ux, uz = c.uz;
    const nose = c.T.bl / 2;
    // skater
    let dx = sk.pos.x - c.x, dz = sk.pos.z - c.z;
    let f = dx * ux + dz * uz, side = -dx * uz + dz * ux;
    if (f > nose - 0.6 && f < nose + 10 && Math.abs(side) < 1.6 && Math.abs(sk.pos.y - c.y) < 3) return true;
    for (const o of cars) {
      if (o === c || !o.e) continue;
      dx = o.x - c.x; dz = o.z - c.z;
      if (dx * dx + dz * dz > 260) continue;
      f = dx * ux + dz * uz; side = -dx * uz + dz * ux;
      if (f > 0.5 && f < nose + 9 && Math.abs(side) < 1.9) return true;
    }
    if (bus.on && bus.e) {
      dx = bus.x - c.x; dz = bus.z - c.z;
      f = dx * ux + dz * uz; side = -dx * uz + dz * ux;
      if (f > 0.5 && f < nose + 11 && Math.abs(side) < 2.2) return true;
    }
    return false;
  }

  function distToNode(c) {
    return c.dir > 0 ? (c.e.len - c.s) : c.s;
  }

  // ---- the GMT bus -------------------------------------------------------
  const busEdges = edges.filter(e => e.bus);
  const bus = { on: busEdges.length > 0, e: null, dir: 1, s: 0, v: 0, x: 0, y: 0, z: 0, yaw: 0, pitch: 0, ux: 0, uz: -1, blocked: 0, honked: false, len: 10.6 };
  let busGroup = null;
  if (bus.on) {
    const BW = 2.52, BH = 2.06, BL = 10.6;
    const bits = [
      [new THREE.BoxGeometry(BW, BH, BL), 0, 1.62, 0, 0xf1f3f5],
      [new THREE.BoxGeometry(BW + 0.03, 0.78, BL - 1.5), 0, 2.12, 0.1, 0x1d2a44],   // window band
      [new THREE.BoxGeometry(BW + 0.04, 0.34, BL - 0.4), 0, 1.06, 0, 0x2f7d4f],     // green stripe
      [new THREE.BoxGeometry(BW + 0.04, 0.16, BL - 0.4), 0, 0.82, 0, 0x1d5fa8],     // blue stripe
      [new THREE.BoxGeometry(BW - 0.1, 0.5, 0.5), 0, 2.86, 0, 0xdfe3e6],            // roof pod
      [new THREE.BoxGeometry(0.3, 0.18, 0.08), -0.95, 0.86, -BL / 2, 0xfff2cf],
      [new THREE.BoxGeometry(0.3, 0.18, 0.08), 0.95, 0.86, -BL / 2, 0xfff2cf],
      [new THREE.BoxGeometry(0.3, 0.18, 0.08), -0.95, 0.86, BL / 2, 0x9e1f12],
      [new THREE.BoxGeometry(0.3, 0.18, 0.08), 0.95, 0.86, BL / 2, 0x9e1f12],
    ];
    for (const z of [-3.7, 3.0, 4.1]) {
      bits.push([WHEEL, -(BW / 2 - 0.06), 0.4, z, 0x141518]);
      bits.push([WHEEL, (BW / 2 - 0.06), 0.4, z, 0x141518]);
    }
    const g = mergeGeos(bits);
    busGroup = new THREE.Group();
    const body = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color: 0xffffff, vertexColors: true }));
    body.castShadow = !!quality.shadows; busGroup.add(body);
    const signTex = makeGmtSign();
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 0.46), new THREE.MeshBasicMaterial({ map: signTex, transparent: true }));
    sign.position.set(0, 2.42, -BL / 2 - 0.02); sign.rotation.y = Math.PI; busGroup.add(sign);
    busGroup.visible = false;
    scene.add(busGroup);
    bus.len = BL;
  }
  function placeBus(sk, minD, maxD) {
    for (let tries = 0; tries < 30; tries++) {
      const e = busEdges[(rnd() * busEdges.length) | 0];
      const dir = e.fwdOK && e.backOK ? (rnd() < 0.5 ? 1 : -1) : (e.fwdOK ? 1 : -1);
      const s = R(2, Math.max(3, e.len - 2));
      edgeAt(e, s, laneOff(e.hw) * dir, _e);
      const d = Math.hypot(_e[0] - sk.pos.x, _e[1] - sk.pos.z);
      if (d < minD || d > maxD) continue;
      bus.e = e; bus.dir = dir; bus.s = s; bus.v = 5; bus.blocked = 0;
      return true;
    }
    return false;
  }

  // ---- update ------------------------------------------------------------
  let seeded = false;
  let active = nMove;
  function applyCount() {
    const n = nPark + active;
    bodyM.count = n; cabinM.count = n; wheelM.count = n * 4; lightM.count = n * 4;
  }
  applyCount();
  bodyM.instanceMatrix.needsUpdate = cabinM.instanceMatrix.needsUpdate = wheelM.instanceMatrix.needsUpdate = lightM.instanceMatrix.needsUpdate = true;
  if (bodyM.instanceColor) bodyM.instanceColor.needsUpdate = true;
  if (cabinM.instanceColor) cabinM.instanceColor.needsUpdate = true;
  if (lightM.instanceColor) lightM.instanceColor.needsUpdate = true;

  function update(dt, sk) {
    if (!seeded) {
      for (const c of cars) { if (!placeCar(c, sk, 25, 170)) placeCar(c, sk, 0, 400); paint(c.idx, c.col, false); }
      if (bus.on && !placeBus(sk, 40, 220)) placeBus(sk, 0, 600);
      seeded = true;
    }
    dt = Math.min(dt, 0.05);
    let colDirty = false;

    for (let i = 0; i < active; i++) {
      const c = cars[i];
      if (!c.e) { placeCar(c, sk, 55, 165); continue; }
      const far = Math.hypot(c.x - sk.pos.x, c.z - sk.pos.z);
      if (far > 200) { if (placeCar(c, sk, 55, 165)) { paint(c.idx, c.col, false); colDirty = true; } drawVehicle(c.idx, c); continue; }

      // target speed
      let want = c.e.speed;
      const dn = distToNode(c);
      const endNode = c.dir > 0 ? c.e.b : c.e.a;
      if (nodeDeg[endNode] >= 3 && dn < 12) want = 4;
      // steep downhill: ease off
      const grade = -Math.sin(c.pitch);
      if (grade > 0.03) want *= 0.85;

      const stop = blockedAhead(c, sk);
      if (stop) {
        want = 0; c.blocked += dt;
        if (c.blocked > 1 && !c.honked) { c.honked = true; if (sk.emit) sk.emit('honk', { x: c.x, z: c.z }); }
      } else { c.blocked = 0; c.honked = false; }

      const accel = want > c.v ? 3.4 : (stop ? 9 : 5);
      c.v += clamp(want - c.v, -accel * dt, accel * dt);
      if (c.v < 0) c.v = 0;
      const lit = c.v < want - 0.4 || stop;
      if (lit !== c.brakeLit) { c.brakeLit = lit; paint(c.idx, c.col, lit); colDirty = true; }

      c.s += c.dir * c.v * dt;
      if (c.dir > 0 ? c.s >= c.e.len : c.s <= 0) nextEdge(c);
      updateCarPose(c);

      // hit the skater?
      if (c.v > 2 && sk.state !== 'bail') {
        const dx = sk.pos.x - c.x, dz = sk.pos.z - c.z;
        if (dx * dx + dz * dz < 36) {
          const f = dx * c.ux + dz * c.uz, side = -dx * c.uz + dz * c.ux;
          if (Math.abs(f) < c.T.bl / 2 + 0.5 && Math.abs(side) < c.T.bw / 2 + 0.5 && sk.pos.y - c.y < 1.6 && sk.pos.y - c.y > -1.2) {
            sk.startBail('car');
            sk.vel.x += c.ux * c.v * 0.55; sk.vel.z += c.uz * c.v * 0.55; sk.vel.y = Math.max(sk.vel.y, 3.2);
            if (sk.emit) sk.emit('honk', { x: c.x, z: c.z });
            c.v *= 0.25;
          }
        }
      }
      drawVehicle(c.idx, c);
    }

    // ---- bus ----
    if (bus.on && bus.e) {
      const far = Math.hypot(bus.x - sk.pos.x, bus.z - sk.pos.z);
      if (far > 260) placeBus(sk, 70, 200);
      let want = bus.e.speed * 0.8;
      const dn = bus.dir > 0 ? bus.e.len - bus.s : bus.s;
      const endNode = bus.dir > 0 ? bus.e.b : bus.e.a;
      if (nodeDeg[endNode] >= 3 && dn < 16) want = 3.5;
      // stop for the skater
      const dx = sk.pos.x - bus.x, dz = sk.pos.z - bus.z;
      const f = dx * bus.ux + dz * bus.uz, side = -dx * bus.uz + dz * bus.ux;
      const stop = f > bus.len / 2 - 1 && f < bus.len / 2 + 12 && Math.abs(side) < 2 && Math.abs(sk.pos.y - bus.y) < 3.5;
      if (stop) { want = 0; bus.blocked += dt; if (bus.blocked > 1 && !bus.honked) { bus.honked = true; if (sk.emit) sk.emit('honk', { x: bus.x, z: bus.z }); } }
      else { bus.blocked = 0; bus.honked = false; }
      bus.v += clamp(want - bus.v, -7 * dt, 2.4 * dt);
      if (bus.v < 0) bus.v = 0;
      bus.s += bus.dir * bus.v * dt;
      if (bus.dir > 0 ? bus.s >= bus.e.len : bus.s <= 0) {
        // stay on bus streets: pick another bus edge at that node, else turn round
        const en = bus.dir > 0 ? bus.e.b : bus.e.a;
        const opts = nodes[en].edges.map(i => edges[i]).filter(e => e.bus && e !== bus.e && (e.a === en ? e.fwdOK : e.backOK));
        if (opts.length) { const ne = opts[(rnd() * opts.length) | 0]; bus.dir = ne.a === en ? 1 : -1; bus.e = ne; bus.s = bus.dir > 0 ? 0 : ne.len; }
        else { bus.dir *= -1; bus.s = clamp(bus.s, 0, bus.e.len); }
      }
      edgeAt(bus.e, bus.s, 1.95 * bus.dir, _e);
      bus.x = _e[0]; bus.z = _e[1]; bus.ux = _e[2] * bus.dir; bus.uz = _e[3] * bus.dir;
      bus.yaw = Math.atan2(-bus.ux, -bus.uz);
      bus.y = terrain.heightAt(bus.x, bus.z) + 0.02;
      const hA = terrain.heightAt(bus.x + bus.ux * 3, bus.z + bus.uz * 3), hB = terrain.heightAt(bus.x - bus.ux * 3, bus.z - bus.uz * 3);
      bus.pitch = clamp(Math.atan2(hA - hB, 6), -0.2, 0.2);
      busGroup.visible = far < 320;
      busGroup.position.set(bus.x, bus.y, bus.z);
      busGroup.rotation.set(0, 0, 0);
      busGroup.rotateY(bus.yaw); busGroup.rotateX(bus.pitch);
      if (bus.v > 2 && sk.state !== 'bail' && Math.abs(f) < bus.len / 2 + 0.6 && Math.abs(side) < 1.9 && Math.abs(sk.pos.y - bus.y) < 2) {
        sk.startBail('car'); sk.vel.x += bus.ux * bus.v * 0.6; sk.vel.z += bus.uz * bus.v * 0.6; sk.vel.y = Math.max(sk.vel.y, 3.4); bus.v *= 0.2;
      }
    }

    bodyM.instanceMatrix.needsUpdate = true; cabinM.instanceMatrix.needsUpdate = true;
    wheelM.instanceMatrix.needsUpdate = true; lightM.instanceMatrix.needsUpdate = true;
    if (colDirty) {
      if (bodyM.instanceColor) bodyM.instanceColor.needsUpdate = true;
      if (cabinM.instanceColor) cabinM.instanceColor.needsUpdate = true;
      if (lightM.instanceColor) lightM.instanceColor.needsUpdate = true;
    }
  }

  // Playtest hook, off unless you load the page with ?npcdebug (see scripts/shot-npc.mjs)
  if (typeof location !== 'undefined' && location.search.indexOf('npcdebug') >= 0) {
    window.__carDbg = (sx, sz) => { let b = null, bd = 1e9; for (let i = 0; i < active; i++) { const c = cars[i]; if (!c.e) continue; const d = Math.hypot(c.x - sx, c.z - sz); if (d < bd) { bd = d; b = c; } } return b ? { x: b.x, z: b.z, y: b.y, ux: b.ux, uz: b.uz, v: b.v, d: bd, blocked: b.blocked, n: cars.length, parked: nPark, bus: bus.on ? { x: bus.x, z: bus.z, v: bus.v } : null } : null; };
  }
  update.degrade = () => { active = Math.max(3, active >> 1); applyCount(); };
  updaters.push(update);

  function roadHalfWidth(r) { return roadWidth(r) / 2; }
}

// merge a list of [geometry, x, y, z, colour] (or [geometry, x, y, z, rx, ry, rz, colour])
function mergeGeos(list) {
  const parts = []; let total = 0;
  for (const item of list) {
    let geo, x, y, z, rx = 0, ry = 0, rz = 0, col = null;
    if (item.length <= 5) { [geo, x, y, z, col] = item; } else { [geo, x, y, z, rx, ry, rz, col] = item; }
    const g = geo.clone();
    if (rx) g.rotateX(rx); if (ry) g.rotateY(ry); if (rz) g.rotateZ(rz);
    g.translate(x || 0, y || 0, z || 0);
    const ng = g.index ? g.toNonIndexed() : g;
    parts.push([ng, col]); total += ng.attributes.position.count;
    if (ng !== g) g.dispose();
  }
  const pos = new Float32Array(total * 3), nrm = new Float32Array(total * 3), colA = new Float32Array(total * 3);
  let o = 0;
  for (const [g, col] of parts) {
    pos.set(g.attributes.position.array, o * 3); nrm.set(g.attributes.normal.array, o * 3);
    const c = g.attributes.position.count;
    const cr = col == null ? 1 : ((col >> 16) & 255) / 255, cg = col == null ? 1 : ((col >> 8) & 255) / 255, cb = col == null ? 1 : (col & 255) / 255;
    for (let i = 0; i < c; i++) { colA[(o + i) * 3] = cr; colA[(o + i) * 3 + 1] = cg; colA[(o + i) * 3 + 2] = cb; }
    o += c; g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  out.setAttribute('color', new THREE.BufferAttribute(colA, 3));
  return out;
}

function makeGmtSign() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#0d1118'; g.fillRect(0, 0, 256, 64);
  g.fillStyle = '#f6c02a'; g.font = 'bold 40px Helvetica, Arial, sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('GMT  1  DOWNTOWN', 128, 34);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
