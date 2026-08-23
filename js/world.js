// Thin orchestrator: loads WORLD data, builds terrain + collision world, then asks each
// builder module to add its part. Missing builder modules are skipped (so the game boots
// while pieces are still being written). Returns the handle main.js uses.
import * as THREE from '../vendor/three.module.min.js';
import { Terrain } from './terrain.js';
import { CollisionWorld } from './collide.js';
import { segT, rng } from './util.js';

async function tryImport(path) { try { return await import(path); } catch (e) { console.warn('[world] skipping ' + path + ': ' + e.message); return null; } }

export async function buildWorld({ scene, renderer, camera, quality }) {
  const testMode = /[?&]test=1/.test(location.search);
  // Outside ?test=1 the generated world is REQUIRED: silently falling back to the synthetic
  // course would make a broken deploy look like a successful one with Burlington missing.
  const dataMod = testMode ? null : await import('../data/world.js');
  const WORLD = dataMod ? dataMod.WORLD : makeTestWorld();
  const terrain = new Terrain(WORLD.terrain, { smooth: dataMod ? 2 : 0 });
  const collide = new CollisionWorld(terrain);
  const spots = [];      // { name, x, z, r, bonus }
  const locations = [];  // { name, pts | (x,z,r), priority }
  const updaters = [];
  const play = WORLD.play || derivePlay(WORLD);
  const ctx = { scene, renderer, camera, quality, WORLD, terrain, collide, spots, locations, updaters, play, rng: rng(1337), THREE };

  // default lighting if env.js is absent
  const env = await tryImport('./env.js');
  if (env && env.buildEnv) env.buildEnv(ctx); else defaultLighting(ctx);

  const ground = await tryImport('./ground.js'); if (ground && ground.buildGround) ground.buildGround(ctx); else if (!dataMod) testGround(ctx);
  const landmarks = await tryImport('./landmarks.js');
  ctx.landmarkIds = new Set(landmarks && landmarks.LANDMARK_IDS ? landmarks.LANDMARK_IDS : []);
  const city = await tryImport('./city.js'); if (city && city.buildCity) city.buildCity(ctx);
  if (landmarks && landmarks.buildLandmarks) landmarks.buildLandmarks(ctx);
  const props = await tryImport('./props.js'); if (props && props.buildProps) props.buildProps(ctx);
  const npcs = await tryImport('./npcs.js'); if (npcs && npcs.createNpcs) npcs.createNpcs(ctx);
  const traffic = await tryImport('./traffic.js'); if (traffic && traffic.createTraffic) traffic.createTraffic(ctx);
  if (!dataMod) testCourse(ctx);

  // spawn: middle of Church St just north of College St, facing north up the mall
  const cs = WORLD.churchStreet;
  const sx = cs ? cs.crossings.College[0] : 0, sz = cs ? cs.crossings.College[1] - 12 : 0;
  const spawn = { x: sx, y: collide.groundAt(sx, sz, 50, 100).y + 0.02, z: sz, yaw: cs ? yawAlong(cs.crossings.College, cs.crossings.Bank) : 0 };

  const info = {
    roads: (WORLD.roads || []).map(r => ({ kind: r.kind, pts: r.pts, name: r.name })),
    buildings: (WORLD.buildings || []).map(b => ({ pts: b.pts, cx: b.pts.reduce((a, p) => a + p[0], 0) / b.pts.length, cz: b.pts.reduce((a, p) => a + p[1], 0) / b.pts.length })),
    play,
  };
  const locator = makeLocator(WORLD, locations);
  let degradeLevel = 0;
  const stats = `${(WORLD.buildings || []).length} buildings · ${(WORLD.roads || []).length} streets · ${spots.length} spots`;

  return {
    collide, terrain, spawn, spots, info, stats, WORLD, play, _locations: locations, cityInfo: ctx.cityInfo, landmarkSigns: ctx.landmarkSigns,
    update(dt, skater) { for (const u of updaters) u(dt, skater); },
    locationName(x, z) { return locator(x, z); },
    confine(sk) {
      const m = 2; let hit = false;
      if (sk.pos.x < play.minX + m) { sk.pos.x = play.minX + m; hit = true; } if (sk.pos.x > play.maxX - m) { sk.pos.x = play.maxX - m; hit = true; }
      if (sk.pos.z < play.minZ + m) { sk.pos.z = play.minZ + m; hit = true; } if (sk.pos.z > play.maxZ - m) { sk.pos.z = play.maxZ - m; hit = true; }
      if (hit) { sk.vel.x *= 0.2; sk.vel.z *= 0.2; }
    },
    degrade(renderer) {
      if (degradeLevel >= 3) return;                    // nothing left to turn off
      degradeLevel++;
      if (degradeLevel === 1) { renderer.shadowMap.enabled = false; scene.traverse(o => { if (o.isLight) o.castShadow = false; }); }
      else if (degradeLevel === 2) renderer.setPixelRatio(Math.max(1, renderer.getPixelRatio() * 0.75));
      else if (degradeLevel === 3) { ctx.quality.npcs *= 0.5; ctx.quality.traffic *= 0.5; for (const u of updaters) if (u.degrade) u.degrade(); }
      console.info('[world] degraded to level', degradeLevel);
    },
  };
}

function yawAlong(a, b) { return Math.atan2(-(b[0] - a[0]), -(b[1] - a[1])); }

function derivePlay(W) {
  // playable rectangle: nearly the whole data bbox (Battery St and the waterfront slope
  // west, S. Union east, the church north, King/Maple south), inset so the edge skirt hides it.
  const b = W.bbox; const m = 45;
  return { minX: b.minX + m, maxX: b.maxX - m, minZ: b.minZ + m, maxZ: b.maxZ - m };
}

function defaultLighting(ctx) {
  const { scene } = ctx;
  scene.background = new THREE.Color(0x9fc2e6); scene.fog = new THREE.Fog(0x9fc2e6, 120, ctx.quality.mobile ? 380 : 600);
  const hemi = new THREE.HemisphereLight(0xbcd7ff, 0x6b5a45, 0.9); scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff1d6, 2.0); sun.position.set(-120, 90, 40); scene.add(sun);
  if (ctx.quality.shadows) { sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); const c = sun.shadow.camera; c.left = -60; c.right = 60; c.top = 60; c.bottom = -60; c.near = 10; c.far = 400; sun.shadow.bias = -0.0005; ctx.sun = sun; }
  ctx.updaters.push((dt, sk) => { if (ctx.sun) { ctx.sun.position.set(sk.pos.x - 120, sk.pos.y + 90, sk.pos.z + 40); ctx.sun.target.position.copy(sk.pos); ctx.sun.target.updateMatrixWorld(); } });
}

// Location label: parks/areas by name first, then "A & B" near intersections, then nearest named street.
function makeLocator(W, locations) {
  const roads = (W.roads || []).filter(r => r.name && r.pts.length > 1 && !['footway', 'steps', 'service', 'path', 'cycleway'].includes(r.kind));
  const areas = (W.areas || []).filter(a => a.name && a.pts && a.pts.length > 2);
  // intersections = endpoints/vertices shared by two differently named roads (within 1 m)
  const inter = [];
  for (let i = 0; i < roads.length; i++) for (let j = i + 1; j < roads.length; j++) {
    const a = roads[i], b = roads[j]; if (a.name === b.name) continue;
    for (const p of a.pts) for (const q of b.pts) if (Math.abs(p[0] - q[0]) < 1 && Math.abs(p[1] - q[1]) < 1) { if (!inter.some(k => Math.hypot(k.x - p[0], k.z - p[1]) < 8 && k.n.has(a.name) && k.n.has(b.name))) inter.push({ x: p[0], z: p[1], n: new Set([a.name, b.name]) }); }
  }
  if (W.churchStreet && W.churchStreet.crossings) for (const [n, p] of Object.entries(W.churchStreet.crossings)) inter.push({ x: p[0], z: p[1], n: new Set(['Church Street', n + ' Street']) });
  const short = (n) => n.replace(/\bStreet\b/, 'St').replace(/\bAvenue\b/, 'Ave').replace(/\bSouth\b/, 'S.').replace(/\bNorth\b/, 'N.').replace(/\bSaint\b/, 'St.');
  const pip = (px, pz, pts) => { let ins = false; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { const xi = pts[i][0], zi = pts[i][1], xj = pts[j][0], zj = pts[j][1]; if (((zi > pz) !== (zj > pz)) && (px < (xj - xi) * (pz - zi) / (zj - zi) + xi)) ins = !ins; } return ins; };
  return (x, z) => {
    for (const l of locations) { if (l.pts ? pip(x, z, l.pts) : Math.hypot(l.x - x, l.z - z) < l.r) return l.name; }
    for (const a of areas) if (pip(x, z, a.pts)) return a.name;
    let bi = null, bd = 14; for (const k of inter) { const d = Math.hypot(k.x - x, k.z - z); if (d < bd) { bd = d; bi = k; } }
    if (bi) { const n = [...bi.n].map(short); n.sort((a, b) => (a.startsWith('Church') ? -1 : b.startsWith('Church') ? 1 : 0)); return n.join(' & '); }
    let br = null; bd = 25;
    for (const r of roads) for (let i = 0; i < r.pts.length - 1; i++) { const a = r.pts[i], b = r.pts[i + 1]; const t = segT(a[0], a[1], b[0], b[1], x, z); const d = Math.hypot(a[0] + (b[0] - a[0]) * t - x, a[1] + (b[1] - a[1]) * t - z); if (d < bd) { bd = d; br = r; } }
    if (br) return br.kind === 'pedestrian' && /Church/.test(br.name) ? 'Church Street Marketplace' : short(br.name);
    return 'Downtown Burlington';
  };
}

// ---------- synthetic test world (used only when data/world.js is missing) ----------
function makeTestWorld() {
  const cols = 60, rows = 60, step = 5; const heights = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) { const x = -150 + c * step; heights.push(x < -60 ? (-60 - x) * 0.05 : 0); }
  return { origin: { lat: 0, lon: 0, elev_m: 0 }, bbox: { minX: -150, maxX: 145, minZ: -150, maxZ: 145 }, terrain: { x0: -150, z0: -150, step, cols, rows, heights }, roads: [{ id: 1, name: 'Church Street', kind: 'pedestrian', pts: [[0, -140], [0, 140]] }, { id: 2, name: 'College Street', kind: 'secondary', pts: [[-140, 0], [140, 0]] }], areas: [], buildings: [], pois: [], props: [], lines: [], churchStreet: { centerline: [[0, -140], [0, 140]], crossings: { Pearl: [0, -120], Cherry: [0, -80], Bank: [0, -40], College: [0, 0], Main: [0, 40] } } };
}
function testGround(ctx) {
  const { scene, terrain } = ctx; const t = ctx.WORLD.terrain;
  const geo = new THREE.PlaneGeometry((t.cols - 1) * t.step, (t.rows - 1) * t.step, t.cols - 1, t.rows - 1); geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position; for (let i = 0; i < pos.count; i++) pos.setY(i, terrain.heightAt(pos.getX(i) + (t.x0 + (t.cols - 1) * t.step / 2), pos.getZ(i) + (t.z0 + (t.rows - 1) * t.step / 2)));
  geo.computeVertexNormals(); const m = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: 0x8a8a86 })); m.position.set(t.x0 + (t.cols - 1) * t.step / 2, 0, t.z0 + (t.rows - 1) * t.step / 2); m.receiveShadow = true; scene.add(m);
  const grid = new THREE.GridHelper(300, 60, 0x666666, 0x555555); grid.position.y = 0.02; scene.add(grid);
}
function testCourse(ctx) {
  const { scene, collide, spots } = ctx; const mat = new THREE.MeshLambertMaterial({ color: 0xb0a090 });
  const addBox = (x, z, w, d, h, yaw, name, grind = true) => { const y = collide.terrain.heightAt(x, z); const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y + h / 2, z); m.rotation.y = yaw; m.castShadow = m.receiveShadow = true; scene.add(m); collide.addSurface({ x, z, w, d, yaw, top: y + h, bottom: y, kind: 'ledge', name, grindable: grind }); };
  addBox(4, -20, 0.5, 12, 0.5, 0, 'Test ledge'); addBox(-5, -35, 0.6, 10, 0.9, 0.4, 'Angled ledge'); addBox(8, 10, 2, 6, 0.45, 0, 'Bench');
  // rail
  const ry = 0.75; collide.addEdge({ ax: -6, ay: ry, az: -5, bx: -6, by: ry, bz: -20, kind: 'rail', name: 'Test rail' });
  const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 15, 8), new THREE.MeshLambertMaterial({ color: 0x444444 })); rail.rotation.x = Math.PI / 2; rail.position.set(-6, ry, -12.5); scene.add(rail);
  // stairs as ramp + visual steps
  const sx = 14, sz0 = -30, n = 5, rise = 0.17, run = 0.32;
  for (let i = 0; i < n; i++) { const s = new THREE.Mesh(new THREE.BoxGeometry(4, rise, run), mat); s.position.set(sx, rise * (i + 0.5), sz0 + run * (n - 1 - i) + run / 2); scene.add(s); }
  const top = new THREE.Mesh(new THREE.BoxGeometry(4, n * rise, 8), mat); top.position.set(sx, n * rise / 2, sz0 - 4); scene.add(top);
  collide.addSurface({ x: sx, z: sz0 - 4, w: 4, d: 8, yaw: 0, top: n * rise, bottom: 0, kind: 'platform', name: 'Stair top', grindable: true });
  collide.addRamp({ ax: sx, az: sz0 + run * n, bx: sx, bz: sz0, w: 4, yLow: 0, yHigh: n * rise, kind: 'stairs', name: 'Test stairs' });
  // wall
  collide.addWall({ ax: 20, az: -60, bx: 20, bz: 20, top: 10 }); const wall = new THREE.Mesh(new THREE.BoxGeometry(0.3, 10, 80), new THREE.MeshLambertMaterial({ color: 0x884444 })); wall.position.set(20.15, 5, -20); scene.add(wall);
  spots.push({ name: 'Test ledge', x: 4, z: -20, r: 8, bonus: 250 });
}
