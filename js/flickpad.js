// SKATE-style flick recognizer. Pure gesture logic, no DOM: input.js feeds it normalized
// offsets (touch drag relative to its origin, or the gamepad right stick) and it emits
// trick intents. The design is the 8-sector rim classifier from the Skate community's
// re-creations: a gesture is the ordered list of rim sectors the finger/stick visits, and
// each trick is just a short sector sequence. Positions inside the rim are ignored, so a
// flick from S to N reads as ['S','N'] no matter how sloppy the path through the middle is.
//
// Sequences (screen coords, y down — S is the bottom of the pad):
//   S→N ollie (holding S charges the pop, exactly like holding Space)
//   S→NW / NW  kickflip family   S→NE / NE  heelflip family
//   S→W / W    shove-it (BS)     S→E / E    shove-it (FS)
// A second finger on the pad turns the flick into both-flip-buttons-at-once, which is how
// the Maple Leaf signature trick is triggered (skate.js requires special >= 1; with the
// meter down it degrades to a kickflip there, not here).

const EDGE = 0.8;        // rim threshold: |offset| >= EDGE registers a sector
const DEAD = 0.25;       // inside this radius the stick counts as centered
const DEAD_T = 0.15;     // s centered before an unfinished combo is abandoned
const SECTORS = ['E', 'SE', 'S', 'SW', 'W', 'NW', 'N', 'NE']; // atan2 order, y down

// Longest first so ['S','N'] wins over a bare ['N'] mid-gesture.
const PATTERNS = [
  [['S', 'N'], { kind: 'ollie' }],
  [['S', 'NW'], { kind: 'flipA' }],
  [['S', 'NE'], { kind: 'flipB' }],
  [['S', 'W'], { kind: 'shove', side: -1 }],
  [['S', 'E'], { kind: 'shove', side: 1 }],
  [['N'], { kind: 'ollie' }],
  [['NW'], { kind: 'flipA' }],
  [['NE'], { kind: 'flipB' }],
  [['W'], { kind: 'shove', side: -1 }],
  [['E'], { kind: 'shove', side: 1 }],
];

export class FlickPad {
  // emit(intent): { kind: 'charge' | 'cancel' | 'ollie' | 'flipA' | 'flipB' | 'shove',
  //                 side?, charged? }  — charged = the gesture began with a held S (the
  //                 caller decides whether an ollie release or an auto-pop is wanted).
  constructor(emit) { this.emit = emit; this.reset(); }
  reset() { this.combo = []; this.charging = false; this.locked = false; this.deadT = 0; }

  sector(x, y) {
    let a = Math.atan2(y, x) / (Math.PI / 4);       // -4..4 in sector units
    return SECTORS[(Math.round(a) + 8) % 8];
  }

  // One sample per frame while the finger is down / the stick is engaged.
  sample(x, y, dt) {
    if (this.locked) return;                        // fired already: wait for release/center
    const m = Math.hypot(x, y);
    if (m < DEAD) {
      // centered: an unfinished combo times out (this is what lets the gamepad stick chain
      // gestures without an explicit "release" — return to center, flick again)
      this.deadT += dt;
      if (this.deadT > DEAD_T && (this.combo.length || this.charging)) this._abandon();
      return;
    }
    this.deadT = 0;
    if (m < EDGE) return;                           // travelling through the middle: ignore
    const s = this.sector(x, y);
    if (this.combo[this.combo.length - 1] !== s) this.combo.push(s);
    // holding the bottom of the pad = crouch/charge, same contract as holding Space
    if (s === 'S' && !this.charging && this.combo.length === 1) { this.charging = true; this.emit({ kind: 'charge' }); }
    for (const [seq, out] of PATTERNS) {
      if (seq.length !== this.combo.length) continue;
      if (seq.every((v, i) => v === this.combo[i])) {
        this.locked = true;
        this.emit(Object.assign({ charged: this.charging }, out));
        this.charging = false;
        return;
      }
    }
    if (this.combo.length > 3) this._abandon();     // wandering, not a trick
  }

  // Finger lifted (touch) — the gamepad path never calls this, it centers instead.
  release() {
    if (!this.locked && this.charging) this.emit({ kind: 'cancel' }); // pulled back, thought better of it
    this.reset();
  }
  _abandon() {
    if (this.charging) this.emit({ kind: 'cancel' });
    this.combo = []; this.charging = false; this.deadT = 0;
  }
  // After a fired gesture the gamepad stick must come home before the next one.
  recenter() { if (this.locked) this.reset(); }
}
