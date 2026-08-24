import { storeGet, storeSet } from './util.js';
// Eight Burlington-specific things to go and do. Free-skate only: no timer, no failure —
// they just tick off and stay ticked (localStorage). Driven by the same events the HUD reads.
const KEY = 'css-challenges';

// x of Battery Street where College Street crosses it, and the top of the College hill.
const BATTERY_X = -486, CHURCH_X = -40;

export class Challenges {
  constructor(skater) {
    this.sk = skater;
    this.list = [
      { id: 'handrail', name: 'Grind the City Hall handrail', hint: 'the split granite staircase, south end of the mall' },
      { id: 'tre', name: 'Land a 360 flip on the bricks', hint: 'J + L together, anywhere on the Marketplace' },
      { id: 'college', name: 'Bomb College St, Church to Battery, no bails', hint: '21 metres of downhill to the lake' },
      { id: 'manual', name: 'Manual 40 m down the granite line', hint: 'hold Shift through a landing and keep it' },
      { id: 'car', name: 'Ollie onto a parked car', hint: 'the curb lane on any cross street' },
      { id: 'bigjoe', name: "Grind Big Joe's slab", hint: 'the top block, in front of 16 Church' },
      { id: 'combo', name: 'Bank a 10,000-point combo', hint: 'link grinds, manuals and flips before you settle' },
      { id: 'spots', name: 'Find every Burlington spot', hint: 'the yellow dots on the map' },
      // ---- feature wave 2 ----
      { id: 'letters', name: 'Collect B-T-O-W-N', hint: 'five floating letters, a new route every week' },
      { id: 'gap5', name: 'Clear 5 named gaps', hint: 'the gap list is in the pause menu' },
      { id: 'wreck', name: 'Score a 1,000-point wreck', hint: 'speed, height and tumble all count — Hall of Meat' },
      { id: 'special', name: 'Land The Maple Leaf', hint: 'both flip buttons together, in the air, meter full' },
      { id: 'bluff', name: 'Survive the Bluff Bomber', hint: 'roll in off the Battery Park tower and land the Lake Leap' },
    ];
    let saved = [];
    try { saved = JSON.parse(storeGet(KEY, '[]')); } catch { saved = []; }
    this.done = new Set(Array.isArray(saved) ? saved : []);
    this.justDone = [];                 // drained by main.js each frame
    this._manual = 0;                   // metres of the current manual
    this._college = null;               // { minX } while a clean College run is live
    this._prev = { x: skater.pos.x, z: skater.pos.z };
    this._gaps = new Set();             // distinct named gaps cleared this session
  }

  get remaining() { return this.list.length - this.list.filter(c => this.done.has(c.id)).length; }

  complete(id) {
    if (this.done.has(id)) return;
    this.done.add(id);
    storeSet(KEY, JSON.stringify([...this.done]));
    const c = this.list.find(c => c.id === id);
    if (c) this.justDone.push(c);
  }

  handle(ev, sk) {
    switch (ev.type) {
      case 'grindStart':
        if (ev.name === 'City Hall handrail') this.complete('handrail');
        if (ev.name === "Big Joe's slab") this.complete('bigjoe');
        break;
      case 'land':
        if (sk.groundKind === 'car') this.complete('car');
        break;
      case 'bank':
        if (ev.total >= 10000) this.complete('combo');
        if (sk.groundKind === 'brick' && ev.tricks.some(t => /360 Flip/.test(t))) this.complete('tre');
        // "Landed" means banked, not merely started: the trick event fires the moment the
        // flip completes, which can still be followed by a bail.
        if (ev.tricks.some(t => /Maple Leaf/.test(t))) this.complete('special');
        break;
      case 'gap':
        this._gaps.add(ev.name);
        if (this._gaps.size >= 5) this.complete('gap5');
        if (ev.name === 'Lake Leap') this.complete('bluff');
        break;
      case 'wreck':
        if (ev.score >= 1000) this.complete('wreck');
        break;
      case 'letters':
        this.complete('letters');
        break;
      case 'bail':
        this._college = null; this._manual = 0;
        break;
    }
  }

  update(dt, sk) {
    const p = sk.pos, dx = p.x - this._prev.x, dz = p.z - this._prev.z;
    const moved = Math.hypot(dx, dz);
    this._prev.x = p.x; this._prev.z = p.z;

    // manual distance (any surface; the granite line runs the length of the brick)
    if (sk.state === 'manual' && sk.groundKind === 'brick') { this._manual += moved; if (this._manual >= 40) this.complete('manual'); }
    else if (sk.state !== 'air') this._manual = 0;

    // College St, Church → Battery, no bail. Armed at the top of the hill, in the corridor.
    const inCorridor = p.z > -22 && p.z < 42;
    if (inCorridor && p.x > CHURCH_X && p.x < 12 && sk.state !== 'bail') this._college = this._college || { armed: true };
    if (this._college) {
      if (!inCorridor || p.x > 20) this._college = null;
      else if (p.x <= BATTERY_X) this.complete('college');
    }

    if (sk.spots.length && sk.spotsHit.size >= sk.spots.length) this.complete('spots');
  }
}
