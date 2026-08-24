// Named Burlington gaps: "you cleared THAT?" moments keyed to real geography.
//
// A gap is a takeoff zone → a landing zone. It fires when an air that STARTED inside one
// zone ends inside the other, with enough hang time to rule out rolling through. Pure
// state, no DOM and no three.js: main.js feeds it the skater's own 'land' events (which
// carry the takeoff point, because by drain time the skater has already moved on) and it
// pushes its results back through the skater's event queue like any other trick.
//
// Every coordinate below was sampled with __ground / __near against the real world data
// before it was written down; see docs/ARCHITECTURE.md for the axis convention.
import { storeGet, storeSet } from './util.js';

const KEY = 'css-gaps';

// r = radius in metres. minAir defaults to 0.35 s. Gaps fire in EITHER direction: a gap
// worth clearing one way is worth clearing coming back.
export const GAPS = [
  // ---- the Church Street mall: the cross-street crossings, north to south ----
  { name: 'Pearl St Leap', from: { x: -16, z: -366, r: 7 }, to: { x: -16, z: -382, r: 7 }, minAir: 0.5, pts: 350 },
  { name: 'Ski-Lift Send', from: { x: -20.6, z: -349, r: 6 }, to: { x: -20.6, z: -365, r: 6 }, minAir: 0.5, pts: 400 },
  { name: "Big Joe Bomb", from: { x: -8.8, z: -302, r: 6 }, to: { x: -8.8, z: -319, r: 6 }, minAir: 0.5, pts: 400 },
  { name: 'Cherry St Send', from: { x: -11.3, z: -237, r: 7 }, to: { x: -11.3, z: -254, r: 7 }, minAir: 0.5, pts: 350 },
  { name: 'Bank St Bomb', from: { x: -5.6, z: -114, r: 7 }, to: { x: -5.6, z: -131, r: 7 }, minAir: 0.5, pts: 350 },
  { name: 'The Bollard Hop', from: { x: 0, z: -9, r: 7 }, to: { x: 0, z: 9, r: 7 }, minAir: 0.5, pts: 300 },
  { name: "Leunig's Corner Transfer", from: { x: -16, z: -8, r: 6 }, to: { x: -16, z: -28, r: 7 }, minAir: 0.6, pts: 450 },
  // ---- City Hall ----
  { name: 'City Hall Steps', from: { x: -11, z: 88, r: 6 }, to: { x: -11, z: 106, r: 7 }, minAir: 0.6, pts: 500 },
  { name: 'Halfpipe Channel', from: { x: -80, z: 42, r: 6 }, to: { x: -80, z: 62, r: 6 }, minAir: 0.7, pts: 600 },
  { name: 'Fountain Gap', from: { x: -78, z: 66, r: 6 }, to: { x: -62, z: 66, r: 6 }, minAir: 0.6, pts: 500 },
  // ---- Main Street's hill ----
  { name: 'Main Street Bomb', from: { x: -30, z: 132, r: 6 }, to: { x: -50, z: 132.5, r: 8 }, minAir: 0.7, pts: 500 },
  // ---- Battery Park ----
  { name: 'Battery Vert Transfer', from: { x: -552, z: -424, r: 7 }, to: { x: -552, z: -396, r: 7 }, minAir: 0.8, pts: 700 },
  { name: 'Battery Halfpipe Channel', from: { x: -534, z: -446, r: 6 }, to: { x: -556, z: -446, r: 6 }, minAir: 0.8, pts: 700 },
  // ---- the mega sends (see the "mega" section of skatepark.js) ----
  { name: 'Battery Street Fly-By', from: { x: -470, z: -5, r: 9 }, to: { x: -508, z: -5, r: 12 }, minAir: 0.8, pts: 800 },
  // measured: takeoff x ≈ −559, touchdown x ≈ −594 after ~2.5 s and 35 m of flight
  { name: 'Lake Leap', from: { x: -558, z: -375, r: 10 }, to: { x: -595, z: -374, r: 17 }, minAir: 1.2, pts: 1000 },
];

const inZone = (z, x, zz) => (x - z.x) * (x - z.x) + (zz - z.z) * (zz - z.z) < z.r * z.r;

export class GapTracker {
  constructor() {
    let saved = [];
    try { saved = JSON.parse(storeGet(KEY, '[]')); } catch { saved = []; }
    this.found = new Set(Array.isArray(saved) ? saved : []);
    this.list = GAPS;
  }
  get total() { return GAPS.length; }

  // Fed every skater event by main.js. Returns the gap it matched (or null) and, when it
  // matches, pushes a 'gap' event + a combo entry back onto the skater so the gap scores
  // and is announced exactly like any other trick.
  handle(ev, sk) {
    if (ev.type !== 'land') return null;
    const g = this.match(ev.fromX, ev.fromZ, ev.x, ev.z, ev.airTime);
    if (!g) return null;
    const first = !this.found.has(g.name);
    if (first) { this.found.add(g.name); storeSet(KEY, JSON.stringify([...this.found])); }
    sk.session.gaps++;
    sk.emit('gap', { name: g.name, pts: g.pts, first });
    sk.addTrickPending({ name: g.name, pts: g.pts });
    return g;
  }

  match(fx, fz, tx, tz, airTime) {
    if (!(airTime >= 0)) return null;
    for (const g of GAPS) {
      if (airTime < (g.minAir ?? 0.35)) continue;
      if ((inZone(g.from, fx, fz) && inZone(g.to, tx, tz)) ||
          (inZone(g.to, fx, fz) && inZone(g.from, tx, tz))) return g;
    }
    return null;
  }
}
