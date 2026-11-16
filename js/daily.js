// TODAY'S LINE — the daily run. Pure logic + persistence, no DOM and no three.js.
//
// Five lines through town, one per day (local date), each with its own start, its own five
// B-T-O-W-N letters (the breadcrumbs: +500 and +5 s each) and three goals drawn from a pool
// by the date. Today's best, the all-time run best and a day streak are remembered.
//
// New localStorage keys only — `css-daily`, `css-streak`, `css-run-best`. The older keys
// (`css-best`, `css-gaps`, `css-challenges`, `css-letters-*`, `btown-player-*`) are untouched.
//
// Every start and letter below was checked with __ground / __near against the real world:
// on skateable ground, clear of walls and solid props (see UPGRADE-2026-11-16.md).
import { storeGet, storeSet, hashStr, rng } from './util.js';

const W = Math.PI / 2, S = Math.PI, N = 0;     // yaw: west, south, north (fwd = (−sin, −cos))

export const LINES = [
  { id: 'mall', name: 'Mall Bomb', blurb: 'Pearl to Main, all downhill brick',
    start: [-16.0, -352, S], letters: [[-14.0, -300], [-10.6, -215], [-5.6, -100], [-1.2, -20], [2.0, 62]], skip: ['car'] },
  { id: 'college', name: 'College Hill', blurb: 'Church St to the lake, 21 m of drop',
    start: [-14, 3.5, W], letters: [[-60, 3.5], [-130, 7], [-220, 11], [-330, 16], [-450, 14]], skip: [] },
  { id: 'cityhall', name: 'City Hall', blurb: 'the park, the fountain, the steps',
    start: [2, 16, S], letters: [[3, 50], [-6, 74], [-6, 100], [-3, 121], [-40, 121.5]], skip: ['car', 'mph45'] },
  { id: 'waterfront', name: 'The Waterfront', blurb: 'Battery St to the Bluff Bomber',
    start: [-490, -20, N], letters: [[-497, -80], [-505, -150], [-520, -300], [-537, -408], [-545, -444]], skip: ['car'] },
  { id: 'main', name: 'Main Street', blurb: 'the long hill to the mega kicker',
    start: [-4, 130, W], letters: [[-40, 132], [-90, 133], [-140, 134], [-190, 135], [-245, 137]], skip: [] },
];

// The goal pool, in three tiers: every day gets one of each, seeded by the date.
// `test` is checked by GoalTracker against skater events and per-frame state.
export const GOALS = [
  { id: 'stomp3', tier: 0, name: 'Stomp 3 landings', chip: '3 STOMPS', hint: 'land big airs clean' },
  { id: 'tre', tier: 0, name: 'Land a 360 Flip', chip: '360 FLIP', hint: 'double-tap TRICK in the air', key: 'J + L together in the air' },
  { id: 'clean30', tier: 0, name: '30 s without a bail', chip: '30s CLEAN', hint: 'stay on the board' },
  { id: 'gap', tier: 0, name: 'Clear a named gap', chip: 'A GAP', hint: 'the named gaps are in the pause menu' },
  { id: 'grind3', tier: 1, name: 'Grind for 3 s total', chip: 'GRIND 3s', hint: 'land on a rail or ledge' },
  { id: 'manual15', tier: 1, name: 'Manual 15 m', chip: 'MANUAL 15m', hint: 'hold TRICK through a landing', key: 'hold Shift through a landing' },
  { id: 'combo3k', tier: 1, name: 'Bank a 3,000 combo', chip: '3K COMBO', hint: 'chain tricks before you settle' },
  { id: 'mph45', tier: 1, name: 'Hit 45 mph', chip: '45 MPH', hint: 'tuck downhill: hold OLLIE', key: 'tuck downhill: hold Space' },
  { id: 'car', tier: 1, name: 'Hop a car', chip: 'CAR HOP', hint: 'ollie clean over a parked car' },
  { id: '540', tier: 2, name: 'Land a 540', chip: '540', hint: 'push the stick all the way over in a big air', key: 'hold A or D through a big air' },
  { id: 'backflip', tier: 2, name: 'Land a backflip', chip: 'BACKFLIP', hint: 'pull the stick down in the air', key: 'tap S in the air' },
  { id: 'btown', tier: 2, name: 'Collect all five letters', chip: 'B-T-O-W-N', hint: 'follow the light' },
];
export const GOAL_PTS = 1500, ALL_GOALS_PTS = 5000, LETTER_PTS = 500, LETTER_SECS = 5;

const pad = (n) => String(n).padStart(2, '0');
export const dateKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const dayNumber = (d) => Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000);

// `?day=N` pins the line (and goal seed) for testing; it never touches the real streak date.
function dayOverride() { const m = /[?&]day=(\d+)/.exec(location.search); return m ? +m[1] : null; }

export function today(now = new Date()) {
  const ov = dayOverride();
  const dn = ov != null ? ov : dayNumber(now);
  const idx = ((dn % LINES.length) + LINES.length) % LINES.length;
  const line = LINES[idx];
  const tomorrow = LINES[(idx + 1) % LINES.length];
  return { day: dn, idx, line, tomorrow, key: ov != null ? `test-${ov}` : dateKey(now), goals: goalsFor(dn, line) };
}

export function goalsFor(dn, line) {
  const r = rng(hashStr('css-goals-' + dn));
  const out = [];
  for (let tier = 0; tier < 3; tier++) {
    const pool = GOALS.filter(g => g.tier === tier && !line.skip.includes(g.id));
    out.push(pool[Math.floor(r() * pool.length) % pool.length]);
  }
  return out;
}

// ---- persistence ---------------------------------------------------------------------
const readJSON = (k, fb) => { try { const v = JSON.parse(storeGet(k, 'null')); return v ?? fb; } catch { return fb; } };

export function loadDaily(t) {
  const d = readJSON('css-daily', null);
  const fresh = !d || d.date !== t.key;
  return {
    best: fresh ? 0 : (+d.best || 0),
    goals: fresh ? [false, false, false] : (Array.isArray(d.goals) ? d.goals.slice(0, 3) : [false, false, false]),
    runs: fresh ? 0 : (+d.runs || 0),
    runBest: +(storeGet('css-run-best', 0) || 0),
    streak: streakNow(t),
  };
}

// The streak counts consecutive days with at least one finished run. Shown as of today:
// if the last run was before yesterday the streak has lapsed (0) until you skate again.
function streakNow(t) {
  const s = readJSON('css-streak', null);
  if (!s || typeof s.last !== 'string') return 0;
  const last = parseKey(s.last); if (last == null) return 0;
  const gap = dayNumber(new Date()) - last;
  return gap <= 1 ? (+s.n || 0) : 0;
}
function parseKey(k) { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(k); return m ? dayNumber(new Date(+m[1], +m[2] - 1, +m[3])) : null; }

// Record a finished run. Returns what the results card needs.
export function saveRun(t, score, goalsHit) {
  const prev = loadDaily(t);
  const best = Math.max(prev.best, score);
  const goals = prev.goals.map((g, i) => g || !!goalsHit[i]);
  try { storeSet('css-daily', JSON.stringify({ date: t.key, best, goals, runs: prev.runs + 1 })); } catch { /* storage off */ }
  const runBest = Math.max(prev.runBest, score);
  if (runBest !== prev.runBest) storeSet('css-run-best', String(runBest));
  // streak: by the real calendar date, never by a ?day= override
  const realKey = dateKey(new Date()), realDay = dayNumber(new Date());
  const s = readJSON('css-streak', null);
  let n = 1;
  if (s && typeof s.last === 'string') {
    const last = parseKey(s.last);
    if (last === realDay) n = +s.n || 1;
    else if (last === realDay - 1) n = (+s.n || 0) + 1;
  }
  storeSet('css-streak', JSON.stringify({ last: realKey, n }));
  return { best, prevBest: prev.best, prevRunBest: prev.runBest, newBestToday: score > prev.best && score > 0, runBest, newRunBest: score > prev.runBest && score > 0, goals, streak: n, runs: prev.runs + 1 };
}

// ---- goal tracking within one run ------------------------------------------------------
export class GoalTracker {
  constructor(goals) {
    this.goals = goals; this.done = goals.map(() => false); this.justDone = [];
    this.stomps = 0; this.grind = 0; this.manual = 0; this.clean = 0; this.letters = false;
    this._prev = null;
  }
  _hit(id) { const i = this.goals.findIndex(g => g.id === id); if (i >= 0 && !this.done[i]) { this.done[i] = true; this.justDone.push(this.goals[i]); } }
  get all() { return this.done.every(Boolean); }
  handle(ev) {
    switch (ev.type) {
      case 'stomp': if (++this.stomps >= 3) this._hit('stomp3'); break;
      case 'gap': this._hit('gap'); break;
      case 'letters': this._hit('btown'); break;
      case 'bail': this.clean = 0; break;
      case 'trick': if (/Car Hop/.test(ev.name)) this._hit('car'); break;
      case 'bank': {
        const t = ev.tricks || [];
        if (t.some(n => /360 Flip/.test(n))) this._hit('tre');
        if (t.some(n => /\b(540|720|900|1080)\b/.test(n))) this._hit('540');
        if (t.some(n => /Backflip/.test(n))) this._hit('backflip');
        if ((ev.raw ?? ev.total) >= 3000) this._hit('combo3k');
        break;
      }
    }
  }
  // per frame while the clock runs
  update(dt, sk) {
    const p = sk.pos;
    if (sk.state === 'grind') { this.grind += dt; if (this.grind >= 3) this._hit('grind3'); }
    if (sk.state === 'manual' && this._prev) { this.manual += Math.hypot(p.x - this._prev.x, p.z - this._prev.z); if (this.manual >= 15) this._hit('manual15'); }
    this._prev = { x: p.x, z: p.z };
    if (sk.speed >= 20.1) this._hit('mph45');
    if (sk.state !== 'bail') { this.clean += dt; if (this.clean >= 30) this._hit('clean30'); }
  }
}
