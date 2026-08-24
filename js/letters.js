// B-T-O-W-N: five floating letters on one hand-authored route through downtown. The route
// rotates weekly (ISO week seed), and what you have collected is remembered per week, so
// every Monday there is a fresh reason to go somewhere you don't normally skate.
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

function letterTexture(ch) {
  const c = document.createElement('canvas'); c.width = 128; c.height = 128;
  const g = c.getContext('2d');
  g.clearRect(0, 0, 128, 128);
  g.font = 'bold 104px Helvetica, Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineWidth = 12; g.strokeStyle = '#1c2a1f'; g.strokeText(ch, 64, 66);
  g.fillStyle = '#ffd84d'; g.fillText(ch, 64, 66);
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

export function buildLetters(ctx) {
  const { scene, collide, updaters } = ctx;
  const routeIdx = routeIndexFor();
  const route = ROUTES[routeIdx];
  const KEY = weekKey();
  let saved = [];
  try { saved = JSON.parse(storeGet(KEY, '[]')); } catch { saved = []; }
  const got = new Set(Array.isArray(saved) ? saved : []);

  const group = new THREE.Group(); group.name = 'btown-letters'; scene.add(group);
  const geo = crossedQuad(0.8);
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

  const state = { route: route.name, routeIdx, got, items, total: LETTERS.length, all: LETTERS, key: KEY };
  ctx.letters = state;

  let t = 0;
  updaters.push((dt, sk) => {
    t += dt;
    for (const it of items) {
      const taken = got.has(it.ch);
      const d2 = (sk.pos.x - it.x) ** 2 + (sk.pos.z - it.z) ** 2;
      it.mesh.visible = !taken && d2 < SHOW * SHOW;
      if (!it.mesh.visible) continue;
      it.mesh.rotation.y = t * 1.1;
      it.mesh.position.y = it.y + Math.sin(t * 1.6 + it.x) * 0.12;
      // collect: proximity in 3D, in any state — you can grab one mid-air
      if (d2 < REACH * REACH && Math.abs(sk.pos.y - it.y) < 2.0) {
        got.add(it.ch); storeSet(KEY, JSON.stringify([...got])); it.mesh.visible = false;
        sk.emit('letter', { ch: it.ch, n: got.size, total: LETTERS.length });
        if (got.size >= LETTERS.length) { sk.award(2500); sk.emit('letters', { pts: 2500 }); }
      }
    }
  });
  return state;
}
