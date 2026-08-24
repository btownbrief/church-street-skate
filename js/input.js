// Unified input: keyboard + touch. Produces one `input` object read by skate.js every frame.
//   steer: -1..1 (left positive? NO: left = -1, right = +1), throttle: -1..1 (forward push / brake)
//   ollie (held), olliePressed/ollieReleased (edge), flipA (kickflip), flipB (heelflip), shove, grab (hold = manual/grind lock)
// Touch: left half = virtual stick; right side = buttons (OLLIE big, FLIP, SHOVE). Stick up = push.
// Flick pad (opt-in on touch, always on for a gamepad right stick): SKATE-style flick
// gestures produce the same ollie/flipA/flipB/shove edges the buttons do — skate.js
// cannot tell the difference, which is the whole point.
import { clamp, isTouch } from './util.js';
import { FlickPad } from './flickpad.js';

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
    this.ollieCancelled = false;             // charge dropped without a pop (flick pad only)
    this.flick = new FlickPad((i) => this._onFlick(i));
    this.pad = { active: false, id: null, ox: 0, oy: 0, x: 0, y: 0, multi: 0 };
    this._steerBias = 0;                     // one-frame nudge so a side-flick picks the shove direction
    this._gpGrab = false; this._gpPausePrev = false;
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
  // Pulled back on the pad, then lifted without flicking: drop the charge with NO pop.
  _ollieCancel() { if (this.ollie) { this.ollie = false; this.ollieCancelled = true; } }

  // Flick-pad intents → the same edges the buttons and keys produce.
  _onFlick(i) {
    this.any = true;
    if (i.kind === 'charge') { this._ollieDown(); return; }
    if (i.kind === 'cancel') { this._ollieCancel(); return; }
    if (i.kind === 'ollie') { if (!this.ollie) this._ollieDown(); this._ollieUp(); return; }
    const maple = this.pad.multi > 1;        // second finger on the pad = both flip buttons
    if (i.kind === 'flipA' || maple) this._edges.flipA = true;
    if (i.kind === 'flipB' || maple) this._edges.flipB = true;
    if (i.kind === 'shove' && !maple) {
      this._edges.shove = true;
      // skate.js reads the shove direction off inp.steer; 0.25 clears its 0.2 gate without
      // reaching the 0.3 that names a flip variant or visibly bending the line for a frame
      this._steerBias = i.side < 0 ? -0.25 : 0.25;
    }
    // a gesture that started from a held S releases the charged pop WITH the trick
    if (i.charged || this.ollie) this._ollieUp();
  }

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

  // Flick pad zone (touch). Origin = where the finger lands, same as the move stick; the
  // recognizer sees offsets normalized by R so its thresholds are device-independent.
  bindFlickPad({ zone, knob }) {
    if (!this.touchEnabled) return;
    const R = 56; const pad = this.pad;
    const setKnob = () => { knob.style.transform = `translate(${pad.x * R}px, ${pad.y * R}px)`; };
    let lastT = 0;
    const start = (e) => {
      for (const t of e.changedTouches) {
        pad.multi++;
        if (pad.active) continue;
        pad.active = true; pad.id = t.identifier; pad.ox = t.clientX; pad.oy = t.clientY; pad.x = 0; pad.y = 0;
        const r = zone.getBoundingClientRect();
        zone.classList.add('on'); knob.parentElement.style.left = (t.clientX - r.left) + 'px'; knob.parentElement.style.top = (t.clientY - r.top) + 'px';
        lastT = performance.now(); setKnob();
      }
      e.preventDefault(); this.any = true;
    };
    const move = (e) => {
      for (const t of e.changedTouches) if (t.identifier === pad.id) {
        let dx = (t.clientX - pad.ox) / R, dy = (t.clientY - pad.oy) / R; const m = Math.hypot(dx, dy); if (m > 1) { dx /= m; dy /= m; }
        pad.x = dx; pad.y = dy; setKnob();
        const now = performance.now(); this.flick.sample(dx, dy, Math.min(0.05, (now - lastT) / 1000)); lastT = now;
      }
      e.preventDefault();
    };
    const end = (e) => {
      for (const t of e.changedTouches) {
        if (pad.multi > 0) pad.multi--;
        if (t.identifier === pad.id) { pad.active = false; pad.id = null; pad.x = 0; pad.y = 0; zone.classList.remove('on'); setKnob(); this.flick.release(); }
      }
      e.preventDefault();
    };
    zone.addEventListener('touchstart', start, { passive: false }); zone.addEventListener('touchmove', move, { passive: false });
    zone.addEventListener('touchend', end, { passive: false }); zone.addEventListener('touchcancel', end, { passive: false });
  }

  // First connected gamepad: left stick steer/push, right stick = flick pad, A/Cross grab,
  // Start pause. Returns null quietly when the API or the pad is absent (headless runs).
  _gamepad() {
    try {
      const pads = navigator.getGamepads ? navigator.getGamepads() : [];
      for (const p of pads) if (p && p.connected && p.axes.length >= 2) return p;
    } catch { /* not available */ }
    return null;
  }

  // Drop every held input (blur, pause, respawn)
  resetAll() {
    this.keys.clear(); for (const r of this._releasers) r();
    this.ollie = false; this.olliePressed = false; this.ollieReleased = false;
    for (const key in this._edges) this._edges[key] = false;
    this.stick.active = false; this.stick.id = null; this.stick.x = 0; this.stick.y = 0;
    this.pad.active = false; this.pad.id = null; this.pad.x = 0; this.pad.y = 0; this.pad.multi = 0; this.flick.reset();
    this.steer = 0; this.throttle = 0; this.grab = false; this._steerBias = 0; this.ollieCancelled = false;
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
    const gp = this._gamepad();
    if (gp) {
      const dz = (v) => (Math.abs(v) < 0.15 ? 0 : v);
      steer += dz(gp.axes[0]); thr += -dz(gp.axes[1]);
      const rx = gp.axes[2] || 0, ry = gp.axes[3] || 0;
      if (Math.hypot(rx, ry) < 0.25) this.flick.recenter();   // stick home again: next flick may fire
      this.flick.sample(rx, ry, 1 / 60);
      this._gpGrab = !!(gp.buttons[0] && gp.buttons[0].pressed);
      const pauseNow = !!(gp.buttons[9] && gp.buttons[9].pressed);
      if (pauseNow && !this._gpPausePrev) this._edges.pause = true;
      this._gpPausePrev = pauseNow;
    } else this._gpGrab = false;
    this.steer = clamp(steer + this._steerBias, -1, 1); this.throttle = clamp(thr, -1, 1);
    this.grab = k.has('ShiftLeft') || k.has('ShiftRight') || k.has('KeyE') || !!this.buttons.get('grab') || this._gpGrab;
    this.flipA = this._edges.flipA; this.flipB = this._edges.flipB; this.shove = this._edges.shove;
    this.reset = this._edges.reset; this.cam = this._edges.cam; this.map = this._edges.map; this.pause = this._edges.pause;
  }
  endFrame() { for (const key in this._edges) this._edges[key] = false; this.olliePressed = false; this.ollieReleased = false; this.ollieCancelled = false; this._steerBias = 0; this.any = false; }
}
