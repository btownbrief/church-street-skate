// env.js — builder A
// Late-afternoon Burlington: warm haze, a low sun coming in over the lake from the
// west-south-west, the gradient sky, the Adirondacks across the water to the west and the
// Green Mountains behind you to the east, drifting maple leaves and a few gulls.
//
// The backdrop (sky + ranges + the painted lake band) is drawn depth-test-off before
// everything else and follows the skater, so it can never be clipped by the camera's far
// plane and is never eaten by fog — you can always see the lake from Church Street.
import * as THREE from '../vendor/three.module.min.js';
import { clamp } from './util.js';

const HAZE = 0xd8c6ad;           // horizon haze / fog colour
const SUN_AZ = 247.5 * Math.PI / 180;   // west-south-west
const SUN_EL = 28 * Math.PI / 180;

// direction *towards* the sun
const SUN_DIR = new THREE.Vector3(
  Math.sin(SUN_AZ) * Math.cos(SUN_EL),
  Math.sin(SUN_EL),
  -Math.cos(SUN_AZ) * Math.cos(SUN_EL),
).normalize();

export function buildEnv(ctx) {
  const { scene, quality, updaters } = ctx;
  const mobile = !!quality.mobile;

  scene.background = new THREE.Color(HAZE);
  scene.fog = new THREE.Fog(HAZE, mobile ? 90 : 130, mobile ? 480 : 700);

  const hemi = new THREE.HemisphereLight(0xd6e4ff, 0x8a6f55, 1.15);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(0xffe2b8, 2.2);
  sun.position.copy(SUN_DIR).multiplyScalar(140);
  scene.add(sun); scene.add(sun.target);
  if (quality.shadows) {
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const c = sun.shadow.camera;
    c.left = -55; c.right = 55; c.top = 55; c.bottom = -55; c.near = 20; c.far = 340;
    c.updateProjectionMatrix();
    sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.03;
  }
  ctx.sun = sun;

  // ---- backdrop -----------------------------------------------------------
  const back = new THREE.Group();
  back.matrixAutoUpdate = false;
  scene.add(back);
  back.add(skyDome(mobile));
  back.add(ranges());

  const leaves = makeLeaves(mobile ? 90 : 150);
  scene.add(leaves.points);
  const gulls = makeGulls();
  scene.add(gulls.mesh);

  let t = 0;
  updaters.push((dt, sk) => {
    t += dt;
    const p = sk.pos;
    back.position.set(p.x, p.y + 1.7, p.z);
    back.updateMatrix();
    sun.position.set(p.x + SUN_DIR.x * 140, p.y + SUN_DIR.y * 140, p.z + SUN_DIR.z * 140);
    sun.target.position.copy(p);
    sun.target.updateMatrixWorld();
    leaves.update(dt, t, p);
    gulls.update(dt, t, p);
  });
}

// ---------------------------------------------------------------------------
// gradient sky: warm at the horizon, deeper blue overhead, golden toward the sun.
// Below the horizon it paints lake blue-grey to the west and warm haze elsewhere,
// so the world edge always reads as water or distance rather than nothing.
// ---------------------------------------------------------------------------
function skyDome(mobile) {
  const R = 360;
  const g = new THREE.SphereGeometry(R, mobile ? 20 : 30, mobile ? 14 : 18);
  const pos = g.attributes.position;
  const col = new Float32Array(pos.count * 3);
  const zen = new THREE.Color(0x3f74b4), mid = new THREE.Color(0x8fb2d8), hor = new THREE.Color(HAZE);
  const gold = new THREE.Color(0xffcf86), lake = new THREE.Color(0x62809b), deep = new THREE.Color(0x4d6478);
  const c = new THREE.Color();
  const sd = SUN_DIR;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const l = Math.hypot(x, y, z) || 1;
    const uy = y / l, ux = x / l, uz = z / l;
    if (uy >= 0) {
      const h = Math.pow(clamp(uy, 0, 1), 0.62);
      c.copy(hor).lerp(mid, clamp(h * 2.1, 0, 1));
      if (h > 0.45) c.lerp(zen, clamp((h - 0.45) / 0.55, 0, 1));
      // sun glow
      const d = ux * sd.x + uy * sd.y + uz * sd.z;
      const glow = Math.pow(clamp(d, 0, 1), 7) * 0.95 + Math.pow(clamp(d, 0, 1), 2) * 0.22;
      c.lerp(gold, clamp(glow, 0, 0.92));
    } else {
      // below the horizon: the lake to the west, plain haze everywhere else
      const west = clamp((-ux - 0.14) * 2.4, 0, 1);
      const dpt = clamp(-uy * 3.2, 0, 1);
      c.copy(hor).lerp(lake, west);
      c.lerp(deep, dpt * (0.18 + 0.62 * west));
    }
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({
    vertexColors: true, side: THREE.BackSide, fog: false, depthTest: false, depthWrite: false,
  }));
  m.renderOrder = -100; m.frustumCulled = false;
  m.matrixAutoUpdate = false; m.updateMatrix();
  return m;
}

// ---------------------------------------------------------------------------
// mountain silhouettes. Adirondacks WEST across the lake (Whiteface is the tall one),
// Green Mountains — Camel's Hump and Mansfield — smaller and hazier to the east.
// ---------------------------------------------------------------------------
function ranges() {
  const P = [], CL = [];
  const c = new THREE.Color();
  const push = (x0, y0, z0, x1, y1, z1, x2, y2, z2, ca, cb, cc) => {
    P.push(x0, y0, z0, x1, y1, z1, x2, y2, z2);
    CL.push(ca.r, ca.g, ca.b, cb.r, cb.g, cb.b, cc.r, cc.g, cc.b);
  };
  // one ridge: azimuths a0→a1 (radians, 0 = north, +east), radius R, profile fn
  const ridge = (a0, a1, R, n, prof, top, base, seed) => {
    const cTop = new THREE.Color(top), cBase = new THREE.Color(base);
    const dir = (a) => [Math.sin(a) * R, -Math.cos(a) * R];
    let prev = null;
    for (let i = 0; i <= n; i++) {
      const t = i / n, a = a0 + (a1 - a0) * t;
      const [x, z] = dir(a);
      const h = prof(t, i, seed);
      const cur = { x, z, h };
      if (prev) {
        const yb = -70;
        const cA = c.copy(cBase).lerp(cTop, clamp(prev.h / 40, 0, 1)).clone();
        const cB = c.copy(cBase).lerp(cTop, clamp(cur.h / 40, 0, 1)).clone();
        push(prev.x, prev.h, prev.z, cur.x, cur.h, cur.z, cur.x, yb, cur.z, cA, cB, cBase);
        push(prev.x, prev.h, prev.z, cur.x, yb, cur.z, prev.x, yb, prev.z, cA, cBase, cBase);
      }
      prev = cur;
    }
  };
  const noise = (t, s) => Math.sin(t * 31.7 + s) * 0.52 + Math.sin(t * 73.3 + s * 2.3) * 0.3
    + Math.sin(t * 13.1 + s * 5.1) * 0.62 + Math.sin(t * 137 + s * 3.7) * 0.14;
  // jagged Adirondack skyline, WSW → NNW, with a Whiteface-sized peak toward the WNW
  const adk = (t, i, s) => {
    const base = 30 + 24 * noise(t, s);
    const white = 52 * Math.exp(-Math.pow((t - 0.62) / 0.05, 2));
    const second = 30 * Math.exp(-Math.pow((t - 0.31) / 0.062, 2));
    return 0.58 * Math.max(11, base + white + second);
  };
  const foot = (t, i, s) => 0.5 * Math.max(6, 16 + 11 * noise(t * 1.9, s));
  const grn = (t, i, s) => {
    const base = 20 + 15 * noise(t * 1.3, s);
    const mansfield = 34 * Math.exp(-Math.pow((t - 0.55) / 0.055, 2));
    const hump = 27 * Math.exp(-Math.pow((t - 0.3) / 0.042, 2));
    return 0.4 * Math.max(8, base + mansfield + hump);
  };
  const D = Math.PI / 180;
  ridge(196 * D, 350 * D, 344, 96, adk, 0x5b6696, 0x8f97b5, 3.1);      // far range
  ridge(200 * D, 348 * D, 328, 76, foot, 0x4e5a88, 0x7d86a8, 7.4);     // foothills / lakeshore ridge
  ridge(20 * D, 148 * D, 350, 64, grn, 0x63709b, 0x99a0b6, 11.9);      // Green Mountains, east

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(CL, 3));
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({
    vertexColors: true, side: THREE.DoubleSide, fog: false, depthTest: false, depthWrite: false,
  }));
  m.renderOrder = -98; m.frustumCulled = false;
  m.matrixAutoUpdate = false; m.updateMatrix();
  return m;
}

// ---------------------------------------------------------------------------
// drifting maple leaves — one Points cloud that recycles around the skater
// ---------------------------------------------------------------------------
function makeLeaves(n) {
  const pos = new Float32Array(n * 3), col = new Float32Array(n * 3), ph = new Float32Array(n);
  const cs = [0xd9662a, 0xc23a22, 0xe0913a, 0xb8512a, 0xe8b84f];
  const c = new THREE.Color();
  for (let i = 0; i < n; i++) {
    pos[i * 3] = (Math.random() - 0.5) * 44;
    pos[i * 3 + 1] = Math.random() * 8;
    pos[i * 3 + 2] = (Math.random() - 0.5) * 44;
    c.setHex(cs[(Math.random() * cs.length) | 0]);
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    ph[i] = Math.random() * 100;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
  const points = new THREE.Points(g, new THREE.PointsMaterial({
    size: 0.2, sizeAttenuation: true, vertexColors: true, map: leafTexture(),
    transparent: true, alphaTest: 0.35, depthWrite: false,
  }));
  points.frustumCulled = false;
  const attr = g.attributes.position;
  return {
    points,
    update(dt, t, p) {
      const a = attr.array;
      for (let i = 0; i < n; i++) {
        const k = i * 3;
        a[k] += (0.9 + Math.sin(t * 1.3 + ph[i]) * 0.7) * dt;
        a[k + 2] += (0.45 + Math.cos(t * 1.1 + ph[i] * 1.7) * 0.6) * dt;
        a[k + 1] -= (0.55 + (i % 5) * 0.06) * dt;
        // recycle into a box around the skater
        const dx = a[k] - p.x, dy = a[k + 1] - p.y, dz = a[k + 2] - p.z;
        if (dx > 22 || dx < -22) a[k] = p.x - Math.sign(dx) * 22;
        if (dz > 22 || dz < -22) a[k + 2] = p.z - Math.sign(dz) * 22;
        if (dy < -1.2) { a[k + 1] = p.y + 7 + (i % 4); a[k] = p.x + (Math.random() - 0.5) * 40; a[k + 2] = p.z + (Math.random() - 0.5) * 40; }
        else if (dy > 11) a[k + 1] = p.y + 10;
      }
      attr.needsUpdate = true;
    },
  };
}

function leafTexture() {
  const S = 32, cv = document.createElement('canvas'); cv.width = cv.height = S;
  const g = cv.getContext('2d');
  g.fillStyle = '#ffffff';
  g.beginPath();
  g.moveTo(16, 2); g.lineTo(24, 9); g.lineTo(30, 8); g.lineTo(25, 17);
  g.lineTo(30, 22); g.lineTo(19, 22); g.lineTo(17, 30); g.lineTo(15, 30);
  g.lineTo(13, 22); g.lineTo(2, 22); g.lineTo(7, 17); g.lineTo(2, 8);
  g.lineTo(8, 9); g.closePath(); g.fill();
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ---------------------------------------------------------------------------
// four gulls gliding in slow circles, one mesh, positions rewritten in place
// ---------------------------------------------------------------------------
function makeGulls() {
  const N = 4;
  const pos = new Float32Array(N * 6 * 3);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
  const mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({
    color: 0xf3f1ea, side: THREE.DoubleSide, fog: false,
  }));
  mesh.frustumCulled = false;
  const attr = g.attributes.position;
  const cfg = [];
  for (let i = 0; i < N; i++) cfg.push({ r: 34 + i * 13, h: 26 + i * 7, sp: 0.16 + i * 0.035, ph: i * 1.9, sc: 1.1 + (i % 2) * 0.4 });
  return {
    mesh,
    update(dt, t, p) {
      const a = attr.array;
      const set = (k, o, x, y, z) => { a[k + o] = x; a[k + o + 1] = y; a[k + o + 2] = z; };
      for (let i = 0; i < N; i++) {
        const q = cfg[i], ang = t * q.sp + q.ph;
        const cx = p.x + Math.cos(ang) * q.r, cz = p.z + Math.sin(ang) * q.r;
        const cy = p.y + q.h + Math.sin(t * 0.5 + q.ph) * 2.4;
        const fx = -Math.sin(ang), fz = Math.cos(ang);         // heading
        const wx = Math.cos(ang), wz = Math.sin(ang);          // wing axis
        const flap = Math.sin(t * 3.1 + q.ph) * 0.55;
        const s = q.sc;
        const k = i * 18;
        // body point, left tip, right tip → two triangles sharing the nose
        set(k, 0, cx + fx * 0.9 * s, cy, cz + fz * 0.9 * s);
        set(k, 3, cx - wx * 1.5 * s, cy + flap * s, cz - wz * 1.5 * s);
        set(k, 6, cx - fx * 0.5 * s, cy, cz - fz * 0.5 * s);
        set(k, 9, cx + fx * 0.9 * s, cy, cz + fz * 0.9 * s);
        set(k, 12, cx - fx * 0.5 * s, cy, cz - fz * 0.5 * s);
        set(k, 15, cx + wx * 1.5 * s, cy + flap * s, cz + wz * 1.5 * s);
      }
      attr.needsUpdate = true;
    },
  };
}
