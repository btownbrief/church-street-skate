// Procedural WebAudio SFX — no samples. Rolling noise pitched by speed, pops, lands, grind buzz, bails.
export class Audio {
  constructor() { this.ctx = null; this.on = true; this.roll = null; this.grind = null; this.vol = 0.6; this.muted = localStorage.getItem('css-mute') === '1'; }
  ensure() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return true; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return false;
    const ctx = this.ctx = new AC();
    this.master = ctx.createGain(); this.master.gain.value = this.muted ? 0 : this.vol; this.master.connect(ctx.destination);
    // noise buffer
    const len = ctx.sampleRate * 2; const buf = ctx.createBuffer(1, len, ctx.sampleRate); const d = buf.getChannelData(0); for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1; this.noise = buf;
    // rolling loop
    const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 400; const g = ctx.createGain(); g.gain.value = 0;
    src.connect(lp); lp.connect(g); g.connect(this.master); src.start(); this.roll = { src, lp, g };
    // grind loop: sawtooth + noise through bandpass
    const osc = ctx.createOscillator(); osc.type = 'sawtooth'; osc.frequency.value = 110; const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1800; bp.Q.value = 2;
    const n2 = ctx.createBufferSource(); n2.buffer = buf; n2.loop = true; const gg = ctx.createGain(); gg.gain.value = 0;
    osc.connect(bp); n2.connect(bp); bp.connect(gg); gg.connect(this.master); osc.start(); n2.start(); this.grind = { osc, bp, g: gg };
    return true;
  }
  toggleMute() { this.muted = !this.muted; localStorage.setItem('css-mute', this.muted ? '1' : '0'); if (this.master) this.master.gain.value = this.muted ? 0 : this.vol; return this.muted; }
  _blip(freq, dur, type = 'square', gain = 0.25, slide = 0) {
    if (!this.ctx) return; const c = this.ctx, t = c.currentTime; const o = c.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t); if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t + dur);
    const g = c.createGain(); g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur); o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur + 0.02);
  }
  _thud(gain = 0.5, dur = 0.12, freq = 700) {
    if (!this.ctx) return; const c = this.ctx, t = c.currentTime; const s = c.createBufferSource(); s.buffer = this.noise; const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = freq;
    const g = c.createGain(); g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur); s.connect(f); f.connect(g); g.connect(this.master); s.start(t); s.stop(t + dur + 0.02);
  }
  handle(ev) {
    if (!this.ctx) return;
    switch (ev.type) {
      case 'pop': this._thud(0.5, 0.08, 1800); this._blip(180, 0.08, 'triangle', 0.15, -80); break;
      case 'land': this._thud(0.35 + Math.min(0.4, (ev.speed || 0) * 0.03), 0.14, 900); break;
      case 'push': this._thud(0.12, 0.18, 500); break;
      case 'bail': this._thud(0.8, 0.35, 500); this._blip(120, 0.3, 'sawtooth', 0.12, -80); break;
      case 'bank': this._blip(660, 0.08, 'square', 0.08); setTimeout(() => this._blip(880, 0.1, 'square', 0.08), 70); if (ev.n >= 3) setTimeout(() => this._blip(1320, 0.16, 'square', 0.08), 140); break;
      case 'trick': this._blip(520 + Math.min(ev.combo, 8) * 60, 0.05, 'square', 0.05); break;
      case 'spotFirst': [0, 90, 180, 270].forEach((d, i) => setTimeout(() => this._blip(523 * Math.pow(2, i / 12 * 4), 0.12, 'triangle', 0.12), d)); break;
      case 'grindStart': this._thud(0.4, 0.06, 2500); break;
      case 'bump': this._thud(0.3, 0.1, 600); break;
      case 'honk': this._blip(440, 0.35, 'sawtooth', 0.12); this._blip(554, 0.35, 'sawtooth', 0.1); break;
    }
  }
  _bell(n = 1) {
    if (!this.ctx) return; const c = this.ctx;
    for (let i = 0; i < n; i++) setTimeout(() => {
      const t = c.currentTime; const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.07, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 3.2); g.connect(this.master);
      for (const [f, a] of [[196, 1], [392, 0.5], [587, 0.3], [784, 0.18], [1175, 0.08]]) { const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = f * (1 + (Math.random() - 0.5) * 0.004); const gg = c.createGain(); gg.gain.value = a; o.connect(gg); gg.connect(g); o.start(t); o.stop(t + 3.3); }
    }, i * 1400);
  }
  _gull() {
    if (!this.ctx) return; const c = this.ctx, t = c.currentTime; const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(1200, t); o.frequency.linearRampToValueAtTime(1700, t + 0.12); o.frequency.linearRampToValueAtTime(900, t + 0.35);
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1500; f.Q.value = 3; const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.05, t + 0.05); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.4); o.connect(f); f.connect(g); g.connect(this.master); o.start(t); o.stop(t + 0.45);
  }
  update(dt, sk) {
    if (!this.ctx) return;
    this._ambT = (this._ambT || 0) + dt;
    if (this._ambT > (this._nextBell || 75)) { this._ambT = 0; this._nextBell = 140 + Math.random() * 60; this._bell(1 + Math.floor(Math.random() * 3)); }
    this._gullT = (this._gullT || 12) - dt; if (this._gullT <= 0) { this._gullT = 9 + Math.random() * 18; if (Math.random() < 0.8) this._gull(); }
    const sp = Math.hypot(sk.vel.x, sk.vel.z);
    const rolling = (sk.state === 'ride' || sk.state === 'manual') && sp > 0.3;
    const want = rolling ? Math.min(0.35, 0.05 + sp * 0.03) : 0;
    const g = this.roll.g.gain; g.value += (want - g.value) * Math.min(1, dt * 10);
    this.roll.lp.frequency.value = 250 + sp * 60 + (sk.groundKind === 'brick' ? 200 : 0);
    const gw = sk.state === 'grind' ? 0.12 : 0; const gg = this.grind.g.gain; gg.value += (gw - gg.value) * Math.min(1, dt * 14);
    if (sk.state === 'grind') { this.grind.osc.frequency.value = 90 + sp * 12; this.grind.bp.frequency.value = sk.grind && sk.grind.edge.kind === 'rail' ? 2600 : 1400; }
  }
}
