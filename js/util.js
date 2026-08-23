// Shared helpers. No three.js imports here except for the canvas-texture helper.
import * as THREE from '../vendor/three.module.min.js';

export const TAU = Math.PI * 2;
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const damp = (a, b, lambda, dt) => lerp(a, b, 1 - Math.exp(-lambda * dt));
export const wrapAngle = (a) => { a = (a + Math.PI) % TAU; if (a < 0) a += TAU; return a - Math.PI; };
export const angleDiff = (a, b) => wrapAngle(a - b);
export const dampAngle = (a, b, lambda, dt) => a + angleDiff(b, a) * (1 - Math.exp(-lambda * dt));

// yaw=0 faces north (−z); yaw increases turning left (CCW from above).
export function fwd(yaw, out) {
  out = out || new THREE.Vector3();
  return out.set(-Math.sin(yaw), 0, -Math.cos(yaw));
}
export function yawOf(dx, dz) { return Math.atan2(-dx, -dz); }

// Deterministic RNG (mulberry32) so the city looks the same every load.
export function rng(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

export function dist2(ax, az, bx, bz) { const dx = ax - bx, dz = az - bz; return dx * dx + dz * dz; }

// Nearest point on segment AB to P (2D), returns t in [0,1]
export function segT(ax, az, bx, bz, px, pz) {
  const dx = bx - ax, dz = bz - az; const l2 = dx * dx + dz * dz; if (l2 < 1e-9) return 0;
  return clamp(((px - ax) * dx + (pz - az) * dz) / l2, 0, 1);
}
export function pointInPoly(px, pz, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i][0], zi = pts[i][1], xj = pts[j][0], zj = pts[j][1];
    if (((zi > pz) !== (zj > pz)) && (px < (xj - xi) * (pz - zi) / (zj - zi) + xi)) inside = !inside;
  }
  return inside;
}
export function polyArea(pts) { let a = 0; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) a += (pts[j][0] + pts[i][0]) * (pts[j][1] - pts[i][1]); return a / 2; }
export function polyCentroid(pts) { let x = 0, z = 0; for (const p of pts) { x += p[0]; z += p[1]; } return [x / pts.length, z / pts.length]; }

// Canvas text → texture (for signs, trick popups in 3D, banners).
export function textTexture(text, { w = 512, h = 128, font = 'bold 64px Helvetica, Arial, sans-serif', fg = '#fff', bg = 'transparent', pad = 8, align = 'center' } = {}) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d');
  if (bg !== 'transparent') { g.fillStyle = bg; g.fillRect(0, 0, w, h); }
  g.fillStyle = fg; g.font = font; g.textAlign = align; g.textBaseline = 'middle';
  let size = parseInt(font.match(/(\d+)px/)[1], 10);
  while (g.measureText(text).width > w - pad * 2 && size > 10) { size -= 2; g.font = font.replace(/\d+px/, size + 'px'); }
  g.fillText(text, align === 'center' ? w / 2 : pad, h / 2);
  const tex = new THREE.CanvasTexture(c); tex.anisotropy = 4; tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export const isTouch = () => ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
export const isMobile = () => isTouch() && Math.min(window.innerWidth, window.innerHeight) < 900;

// localStorage throws outright in some private-browsing modes; a game must never die for
// want of a high score. Every read and write in the game goes through these.
export function storeGet(key, fallback = null) {
  try { const v = localStorage.getItem(key); return v === null ? fallback : v; } catch { return fallback; }
}
export function storeSet(key, value) {
  try { localStorage.setItem(key, value); return true; } catch { return false; }
}
