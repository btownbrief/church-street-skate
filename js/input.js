// Unified input: keyboard + touch. Produces one `input` object read by skate.js every frame.
//   steer: -1..1 (left positive? NO: left = -1, right = +1), throttle: -1..1 (forward push / brake)
//   ollie (held), olliePressed/ollieReleased (edge), flipA (kickflip), flipB (heelflip), shove, grab (hold = manual/grind lock)
// Touch: left half = virtual stick; right side = buttons (OLLIE big, FLIP, SHOVE). Stick up = push.
import { clamp, isTouch } from './util.js';

export class Input {
  constructor() {
    this.steer = 0; this.throttle = 0;
    this.ollie = false; this.olliePressed = false; this.ollieReleased = false;
    this.flipA = false; this.flipB = false; this.shove = false; this.grab = false;
    this.pause = false; this.reset = false; this.cam = false; this.map = false; this.any = false;
    this._edges = { flipA: false, flipB: false, shove: false, reset: false, cam: false, map: false, pause: false };
    this.keys = new Set();
    this.touchEnabled = isTouch();
    this.stick = { active: false, id: null, ox: 0, oy: 0, x: 0, y: 0 };
    this.buttons = new Map(); // name -> pressed
    this._bindKeys();
  }
  _bindKeys() {
    const down = (e) => {
      if (e.repeat) return;
      const k = e.code; this.keys.add(k); this.any = true;
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyJ', 'KeyK', 'KeyL', 'ShiftLeft', 'ShiftRight', 'KeyM', 'KeyR', 'KeyC', 'KeyP', 'Escape', 'KeyE'].includes(k)) e.preventDefault();
      if (k === 'Space') { this._ollieDown(); }
      if (k === 'KeyJ') this._edges.flipA = true;
      if (k === 'KeyK') this._edges.flipB = true;
      if (k === 'KeyL') this._edges.shove = true;
      if (k === 'KeyR') this._edges.reset = true;
      if (k === 'KeyC') this._edges.cam = true;
      if (k === 'KeyM') this._edges.map = true;
      if (k === 'KeyP' || k === 'Escape') this._edges.pause = true;
    };
    const up = (e) => { const k = e.code; this.keys.delete(k); if (k === 'Space') this._ollieUp(); };
    window.addEventListener('keydown', down); window.addEventListener('keyup', up);
    window.addEventListener('blur', () => this.resetAll());
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.resetAll(); });
  }
  _ollieDown() { if (!this.ollie) { this.ollie = true; this.olliePressed = true; } }
  _ollieUp() { if (this.ollie) { this.ollie = false; this.ollieReleased = true; } }

  // Touch UI: pass the DOM nodes created by main.js
  bindTouch({ stickZone, stickKnob, buttons }) {
    if (!this.touchEnabled) return;
    const zone = stickZone; const knob = stickKnob; const R = 46;
    const setKnob = () => { knob.style.transform = `translate(${this.stick.x * R}px, ${this.stick.y * R}px)`; };
    const start = (e) => {
      for (const t of e.changedTouches) {
        if (this.stick.active) continue;
        this.stick.active = true; this.stick.id = t.identifier; this.stick.ox = t.clientX; this.stick.oy = t.clientY; this.stick.x = 0; this.stick.y = 0;
        const r = zone.getBoundingClientRect();
        zone.classList.add('on'); knob.parentElement.style.left = (t.clientX - r.left) + 'px'; knob.parentElement.style.top = (t.clientY - r.top) + 'px'; setKnob();
      }
      e.preventDefault(); this.any = true;
    };
    const move = (e) => {
      for (const t of e.changedTouches) if (t.identifier === this.stick.id) {
        let dx = (t.clientX - this.stick.ox) / R, dy = (t.clientY - this.stick.oy) / R; const m = Math.hypot(dx, dy); if (m > 1) { dx /= m; dy /= m; }
        this.stick.x = dx; this.stick.y = dy; setKnob();
      }
      e.preventDefault();
    };
    const end = (e) => { for (const t of e.changedTouches) if (t.identifier === this.stick.id) { this.stick.active = false; this.stick.id = null; this.stick.x = 0; this.stick.y = 0; zone.classList.remove('on'); setKnob(); } e.preventDefault(); };
    zone.addEventListener('touchstart', start, { passive: false }); zone.addEventListener('touchmove', move, { passive: false });
    zone.addEventListener('touchend', end, { passive: false }); zone.addEventListener('touchcancel', end, { passive: false });

    for (const [name, el] of Object.entries(buttons)) {
      const ids = new Set(); this._btnIds.set(name, ids);
      const pressNow = () => { this.any = true; el.classList.add('down'); this.buttons.set(name, true); if (name === 'ollie') this._ollieDown(); else if (name in this._edges) this._edges[name] = true; };
      const releaseNow = () => { el.classList.remove('down'); this.buttons.set(name, false); if (name === 'ollie') this._ollieUp(); };
      el.addEventListener('touchstart', (e) => { e.preventDefault(); const was = ids.size; for (const t of e.changedTouches) ids.add(t.identifier); if (!was && ids.size) pressNow(); }, { passive: false });
      const tend = (e) => { e.preventDefault(); for (const t of e.changedTouches) ids.delete(t.identifier); if (!ids.size) releaseNow(); };
      el.addEventListener('touchend', tend, { passive: false }); el.addEventListener('touchcancel', tend, { passive: false });
      // mouse for desktop testing of the touch UI
      el.addEventListener('mousedown', (e) => { e.preventDefault(); pressNow(); });
      el.addEventListener('mouseup', releaseNow); el.addEventListener('mouseleave', () => { if (this.buttons.get(name) && !ids.size) releaseNow(); });
      this._releasers.push(() => { ids.clear(); if (this.buttons.get(name)) releaseNow(); });
    }
    window.addEventListener('touchend', (e) => { if (e.touches.length === 0 && !this.stick.active) { /* all fingers up: safety release */ for (const r of this._releasers) r(); } }, { passive: true });
  }
  _btnIds = new Map(); _releasers = [];

  // Drop every held input (blur, pause, respawn)
  resetAll() {
    this.keys.clear(); for (const r of this._releasers) r();
    this.ollie = false; this.olliePressed = false; this.ollieReleased = false;
    for (const key in this._edges) this._edges[key] = false;
    this.stick.active = false; this.stick.id = null; this.stick.x = 0; this.stick.y = 0;
    this.steer = 0; this.throttle = 0; this.grab = false;
  }

  // Called once per frame BEFORE physics; clears edges AFTER physics via endFrame()
  poll() {
    const k = this.keys;
    let steer = 0, thr = 0;
    if (k.has('ArrowLeft') || k.has('KeyA')) steer -= 1;
    if (k.has('ArrowRight') || k.has('KeyD')) steer += 1;
    if (k.has('ArrowUp') || k.has('KeyW')) thr += 1;
    if (k.has('ArrowDown') || k.has('KeyS')) thr -= 1;
    if (this.stick.active) { steer += this.stick.x; thr += -this.stick.y; }
    this.steer = clamp(steer, -1, 1); this.throttle = clamp(thr, -1, 1);
    this.grab = k.has('ShiftLeft') || k.has('ShiftRight') || k.has('KeyE') || !!this.buttons.get('grab');
    this.flipA = this._edges.flipA; this.flipB = this._edges.flipB; this.shove = this._edges.shove;
    this.reset = this._edges.reset; this.cam = this._edges.cam; this.map = this._edges.map; this.pause = this._edges.pause;
  }
  endFrame() { for (const key in this._edges) this._edges[key] = false; this.olliePressed = false; this.ollieReleased = false; this.any = false; }
}
