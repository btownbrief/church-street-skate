// Heightmap sampler built from WORLD.terrain (row-major, rows increase in +z / south).
// Applies a light smoothing pass so LiDAR noise and curbs don't make the board jitter.
export class Terrain {
  constructor(t, { smooth = 1, flattenRoads = null } = {}) {
    this.x0 = t.x0; this.z0 = t.z0; this.step = t.step; this.cols = t.cols; this.rows = t.rows;
    let h = Float32Array.from(t.heights);
    for (let k = 0; k < smooth; k++) h = this._blur(h);
    this.h = h;
    this.minY = Infinity; this.maxY = -Infinity;
    for (let i = 0; i < h.length; i++) { if (h[i] < this.minY) this.minY = h[i]; if (h[i] > this.maxY) this.maxY = h[i]; }
  }
  _blur(h) {
    const { cols, rows } = this; const o = new Float32Array(h.length);
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      let s = 0, n = 0;
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
        const rr = r + dr, cc = c + dc; if (rr < 0 || cc < 0 || rr >= rows || cc >= cols) continue;
        const w = (dr === 0 && dc === 0) ? 2 : 1; s += h[rr * cols + cc] * w; n += w;
      }
      o[r * cols + c] = s / n;
    }
    return o;
  }
  // Allow builders to carve (e.g. flatten a plaza): set heights within a radius
  raw(c, r) { c = c < 0 ? 0 : c >= this.cols ? this.cols - 1 : c; r = r < 0 ? 0 : r >= this.rows ? this.rows - 1 : r; return this.h[r * this.cols + c]; }
  heightAt(x, z) {
    const fx = (x - this.x0) / this.step, fz = (z - this.z0) / this.step;
    let c = Math.floor(fx), r = Math.floor(fz); let u = fx - c, v = fz - r;
    if (c < 0) { c = 0; u = 0; } if (r < 0) { r = 0; v = 0; }
    if (c >= this.cols - 1) { c = this.cols - 2; u = 1; } if (r >= this.rows - 1) { r = this.rows - 2; v = 1; }
    const h00 = this.raw(c, r), h10 = this.raw(c + 1, r), h01 = this.raw(c, r + 1), h11 = this.raw(c + 1, r + 1);
    return (h00 * (1 - u) + h10 * u) * (1 - v) + (h01 * (1 - u) + h11 * u) * v;
  }
  normalAt(x, z, out) {
    out = out || [0, 1, 0]; const e = 0.6;
    const dx = (this.heightAt(x + e, z) - this.heightAt(x - e, z)) / (2 * e);
    const dz = (this.heightAt(x, z + e) - this.heightAt(x, z - e)) / (2 * e);
    const inv = 1 / Math.hypot(dx, 1, dz); out[0] = -dx * inv; out[1] = inv; out[2] = -dz * inv; return out;
  }
  // Flatten / set heights inside a polygon or circle; used by builders for plazas, building pads.
  flattenCircle(x, z, r, y, blend = 2) {
    const c0 = Math.floor((x - r - blend - this.x0) / this.step), c1 = Math.ceil((x + r + blend - this.x0) / this.step);
    const r0 = Math.floor((z - r - blend - this.z0) / this.step), r1 = Math.ceil((z + r + blend - this.z0) / this.step);
    for (let rr = Math.max(0, r0); rr <= Math.min(this.rows - 1, r1); rr++) for (let cc = Math.max(0, c0); cc <= Math.min(this.cols - 1, c1); cc++) {
      const px = this.x0 + cc * this.step, pz = this.z0 + rr * this.step; const d = Math.hypot(px - x, pz - z);
      if (d > r + blend) continue; const t = d <= r ? 1 : 1 - (d - r) / blend; const i = rr * this.cols + cc; this.h[i] = this.h[i] * (1 - t) + y * t;
    }
  }
}
