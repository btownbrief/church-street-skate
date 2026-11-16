// TODAY'S LINE — the daily run. Pure logic + persistence, no DOM and no three.js.
//
// Five lines through town, one per day (local date), each with its own start, its own five
// B-T-O-W-N letters (the breadcrumbs: +500 and +3 s each) and three goals drawn from a pool
// by the date. Today's best, the all-time run best and a day streak are remembered.
//
// New localStorage keys only — `css-daily`, `css-streak`, `css-run-best`. The older keys
// (`css-best`, `css-gaps`, `css-challenges`, `css-letters-*`, `btown-player-*`) are untouched.
//
// Every start and letter below was checked with __ground / __near against the real world:
// on skateable ground, clear of walls and solid props (see UPGRADE-2026-11-16.md).
import { storeGet, storeSet, hashStr, rng } from './util.js';

const W = Math.PI / 2, S = Math.PI, N = 0;     // yaw: west, south, north (fwd = (−sin, −cos))

// `lettersB` is the second layout of each line (over the kickers, the steps, the other side of
// the street): runs alternate A, B, A, B… so Again is never the same line twice in a row.
//
// `gold` (2026-11-16, round 3) is where the light goes once the day's five are taken: a
// hand-ordered run of skate features in the line's OWN neighbourhood — rails, kickers,
// funboxes, steps, ledges, named spots — all downhill, 30–110 m apart. At the bottom the
// chairlift (`top`) takes you back up and the run goes round again (a fade, the clock keeps
// running). City Hall is flat, so its run is a loop round the park and needs no lift. The
// five runs share no points with each other; letters.js only falls back to walking the
// street graph if you wander far off the run.
export const LINES = [
  { id: 'mall', name: 'Mall Bomb', blurb: 'Pearl to Main, all downhill brick',
    start: [-16.0, -352, S], letters: [[-14.0, -300], [-10.6, -215], [-5.6, -100], [-1.2, -20], [2.0, 62]],
    lettersB: [[-14.2, -309], [-9.0, -196], [-6.3, -80.5], [-1.8, -34], [2.6, 64]], skip: ['car', 'car2'],
    gold: { top: [-16, -385, S], pts: [[-20.6, -357], [-11.5, -320], [-14, -290], [-15.3, -259], [-13, -225], [-9.5, -195],
      [-7.8, -164], [-5.6, -134], [-1.5, -104], [-3, -65], [-2, -35]] } },
  { id: 'college', name: 'College Hill', blurb: 'Church St to the lake, 21 m of drop',
    start: [-14, 3.5, W], letters: [[-60, 3.5], [-130, 7], [-220, 11], [-330, 16], [-450, 14]],
    lettersB: [[-95, 1.5], [-175, 12], [-275, 9], [-390, 18], [-462, 10]], skip: [],
    gold: { top: [-50, 6, W], pts: [[-79.1, 11.4], [-130, 9], [-221, -1], [-285.4, 6.1], [-317, 9], [-360, 9], [-405, 9],
      [-462, 10], [-523, 2], [-524, 38]] } },
  { id: 'cityhall', name: 'City Hall', blurb: 'the park, the fountain, the steps',
    start: [2, 16, S], letters: [[3, 50], [-6, 74], [-6, 100], [-3, 121], [-40, 121.5]],
    lettersB: [[2.5, 64], [-8.9, 93], [4.7, 110.5], [-5.5, 124.7], [-53, 124]], skip: ['car', 'car2', 'mph45'],
    gold: { loop: true, pts: [[-57, 22], [-88, 30], [-82, 80], [-67, 112], [-38, 95], [-25, 122], [5, 116], [-8, 85], [3, 50], [0, 10]] } },
  // Starts at Battery Park and runs DOWN Battery St (it used to start at the bottom facing uphill)
  { id: 'waterfront', name: 'The Waterfront', blurb: 'Battery Park down Battery St',
    start: [-545, -472, S], letters: [[-537, -408], [-520, -300], [-509, -210], [-497, -120], [-492, -45]],
    lettersB: [[-537, -394], [-527, -344], [-510, -250], [-500, -170], [-494, -80]], skip: ['car', 'car2'],
    gold: { top: [-545, -472, S], pts: [[-545, -456], [-545, -425], [-537, -394], [-527, -350], [-525, -290], [-536, -229],
      [-515, -190], [-498, -150], [-548, -140], [-552, -46]] } },
  { id: 'main', name: 'Main Street', blurb: 'the long hill to the mega kicker',
    start: [-4, 130, W], letters: [[-40, 132], [-90, 133], [-140, 134], [-190, 135], [-245, 137]],
    lettersB: [[-65, 135], [-115, 131], [-165, 136], [-215, 133], [-270, 138]], skip: [],
    gold: { top: [-100, 136, W], pts: [[-132, 140], [-175, 129], [-211.8, 132.8], [-262, 141], [-368, 145.5], [-411, 145.5],
      [-448.5, 145.5], [-517.7, 144.5], [-545, 100]] } },
];

// The goal pool, in three tiers: every run shows one of each. The day's order is seeded by
// the date; a goal you clear is swapped out on your next run for the next one of that tier
// you haven't done today, so Again always has three open goals (2026-11-16 final).
// `test` lives in GoalTracker, against skater events and per-frame state.
export const GOALS = [
  { id: 'tre', tier: 0, name: 'Land a 360 Flip', chip: '360 FLIP', hint: 'double-tap TRICK in the air', key: 'J + L together in the air' },
  { id: 'clean30', tier: 0, name: '30 s without a bail', chip: '30s CLEAN', hint: 'stay on the board' },
  { id: 'gap', tier: 0, name: 'Clear a named gap', chip: 'A GAP', hint: 'the named gaps are in the pause menu' },
  { id: 'combo1k', tier: 0, name: 'Bank a 1,000 combo', chip: '1K COMBO', hint: 'two or three tricks, then roll away clean' },
  { id: 'grab', tier: 0, name: 'Land a grab', chip: 'GRAB', hint: 'hold TRICK in the air', key: 'hold Shift in the air' },
  { id: 'drop', tier: 0, name: 'Land a Big Drop', chip: 'BIG DROP', hint: 'ollie off something and land well below it' },
  { id: 'grind3', tier: 1, name: 'Grind for 3 s total', chip: 'GRIND 3s', hint: 'land on a rail or ledge' },
  { id: 'manual15', tier: 1, name: 'Manual 15 m', chip: 'MANUAL 15m', hint: 'hold TRICK through a landing', key: 'hold Shift through a landing' },
  { id: 'combo3k', tier: 1, name: 'Bank a 3,000 combo', chip: '3K COMBO', hint: 'chain tricks before you settle' },
  { id: 'mph45', tier: 1, name: 'Hit 45 mph', chip: '45 MPH', hint: 'tuck downhill: hold OLLIE', key: 'tuck downhill: hold Space' },
  { id: 'car', tier: 1, name: 'Hop a car', chip: 'CAR HOP', hint: 'ollie clean over a parked car' },
  { id: 'stomp3', tier: 1, name: 'Stomp 3 big airs', chip: '3 STOMPS', hint: 'land big airs clean, mid-combo' },
  { id: 'backflip', tier: 1, name: 'Land a backflip', chip: 'BACKFLIP', hint: 'pull the stick down in the air', key: 'tap S in the air' },
  { id: 'goldletter', tier: 1, name: 'Grab a gold letter', chip: 'GOLD LETTER', hint: 'after the five, the light turns gold' },
  { id: '540', tier: 2, name: 'Land a 540', chip: '540', hint: 'push the stick all the way over in a big air', key: 'hold A or D through a big air' },
  { id: 'combo5k', tier: 2, name: 'Bank a 5,000 combo', chip: '5K COMBO', hint: 'grind, manual, flip — don\'t settle' },
  { id: 'car2', tier: 2, name: 'Hop two cars at once', chip: '2-CAR HOP', hint: 'a full OLLIE over two parked cars' },
  { id: 'gaps2', tier: 2, name: 'Clear two named gaps', chip: '2 GAPS', hint: 'the named gaps are in the pause menu' },
  { id: 'nobail5', tier: 2, name: 'All five letters, no bail', chip: 'CLEAN BTOWN', hint: 'follow the light and stay on' },
  { id: 'goldset', tier: 2, name: 'Finish a gold B-T-O-W-N', chip: 'GOLD SET', hint: 'five gold letters after the first five' },
  { id: 'maple', tier: 2, name: 'Land The Maple Leaf', chip: 'MAPLE LEAF', hint: 'fill the gold bar, then double-tap TRICK in the air', key: 'fill the gold bar, then J + L in the air' },
];
export const GOAL_PTS = 1500, ALL_GOALS_PTS = 5000, LETTER_PTS = 500, LETTER_SECS = 3;

// MEDALS per line (2026-11-16 final): a next rung to climb on every line. New key `css-medals`.
// Round 3: stretched so gold takes days, not one run (gold fell on run 1 on three lines at
// 45k), plus a fourth rung. Stored values 1–3 keep their meaning.
export const MEDALS = [
  { id: 'bronze', name: 'Bronze', at: 15000 },
  { id: 'silver', name: 'Silver', at: 40000 },
  { id: 'gold', name: 'Gold', at: 80000 },
  { id: 'plat', name: 'Platinum', at: 130000 },
];
export const medalFor = (score) => { let m = 0; for (let i = 0; i < MEDALS.length; i++) if (score >= MEDALS[i].at) m = i + 1; return m; };

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
  const key = ov != null ? `test-${ov}` : dateKey(now);
  const d = loadDaily({ key });
  return { day: dn, idx, line, tomorrow, key, goals: goalsFor(dn, line, d.cleared, d.runs), runNo: d.runs, layout: d.runs % 2 };
}

// One goal per tier: the first in today's seeded order that you haven't cleared today. When a
// tier is used up, it cycles (so a long session still has three chips to chase).
export function goalsFor(dn, line, cleared = [], runs = 0) {
  const out = [];
  for (let tier = 0; tier < 3; tier++) {
    const r = rng(hashStr('css-goals-' + dn + '-' + tier));
    const pool = GOALS.filter(g => g.tier === tier && !line.skip.includes(g.id));
    for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)) % (i + 1); [pool[i], pool[j]] = [pool[j], pool[i]]; }
    out.push(pool.find(g => !cleared.includes(g.id)) || pool[runs % pool.length]);
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
    cleared: fresh || !Array.isArray(d.cleared) ? [] : d.cleared.filter(x => typeof x === 'string'),
    runs: fresh ? 0 : (+d.runs || 0),
    runBest: +(storeGet('css-run-best', 0) || 0),
    streak: streakNow(t),
  };
}
// best medal per line id (0 none, 1 bronze, 2 silver, 3 gold, 4 platinum)
export function loadMedals() { const m = readJSON('css-medals', {}); return m && typeof m === 'object' ? m : {}; }

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

// Record a finished run. `goalIds` are the ids of the goals this run cleared. Returns what
// the results card needs.
export function saveRun(t, score, goalIds = []) {
  const prev = loadDaily(t);
  const best = Math.max(prev.best, score);
  const cleared = [...new Set([...prev.cleared, ...goalIds])];
  const goals = t.goals.map(g => cleared.includes(g.id));
  try { storeSet('css-daily', JSON.stringify({ date: t.key, best, goals, cleared, runs: prev.runs + 1 })); } catch { /* storage off */ }
  const runBest = Math.max(prev.runBest, score);
  if (runBest !== prev.runBest) storeSet('css-run-best', String(runBest));
  // medal for this line
  const medals = loadMedals(), id = t.line.id, prevMedal = +medals[id] || 0, medal = medalFor(score);
  if (medal > prevMedal) { medals[id] = medal; try { storeSet('css-medals', JSON.stringify(medals)); } catch { /* storage off */ } }
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
  const nextGoals = goalsFor(t.day, t.line, cleared, prev.runs + 1);
  const newGoals = nextGoals.filter(g => !t.goals.some(h => h.id === g.id)).length;
  return { best, prevBest: prev.best, prevRunBest: prev.runBest, newBestToday: score > prev.best && score > 0, runBest, newRunBest: score > prev.runBest && score > 0,
    goals, cleared: cleared.length, streak: n, runs: prev.runs + 1, medal, prevMedal, bestMedal: Math.max(medal, prevMedal), newGoals };
}

// ---- goal tracking within one run ------------------------------------------------------
export class GoalTracker {
  constructor(goals) {
    this.goals = goals; this.done = goals.map(() => false); this.justDone = [];
    this.stomps = 0; this.grind = 0; this.manual = 0; this.clean = 0; this.bails = 0; this.gaps = new Set();
    this._prev = null;
  }
  _hit(id) { const i = this.goals.findIndex(g => g.id === id); if (i >= 0 && !this.done[i]) { this.done[i] = true; this.justDone.push(this.goals[i]); } }
  get all() { return this.done.every(Boolean); }
  get ids() { return this.goals.filter((g, i) => this.done[i]).map(g => g.id); }
  handle(ev) {
    switch (ev.type) {
      case 'stomp': if (++this.stomps >= 3) this._hit('stomp3'); break;
      case 'gap': this.gaps.add(ev.name); this._hit('gap'); if (this.gaps.size >= 2) this._hit('gaps2'); break;
      case 'letter': if (ev.gold) this._hit('goldletter'); break;
      case 'letters': if (ev.set > 0) this._hit('goldset'); else if (this.bails === 0) this._hit('nobail5'); break;
      case 'bail': this.clean = 0; this.bails++; break;
      case 'trick':
        if (/Car Hop/.test(ev.name)) { this._hit('car'); if (/^\d+-Car Hop/.test(ev.name)) this._hit('car2'); }
        if (/^(Melon|Indy|Nosegrab|Tailgrab|Method)$/.test(ev.name)) this._hit('grab');
        break;
      case 'bank': {
        const t = ev.tricks || [];
        if (t.some(n => /360 Flip/.test(n))) this._hit('tre');
        if (t.some(n => /\b(540|720|900|1080)\b/.test(n))) this._hit('540');
        if (t.some(n => /Backflip/.test(n))) this._hit('backflip');
        if (t.some(n => /Big Drop/.test(n))) this._hit('drop');
        if (t.some(n => /Maple Leaf/.test(n))) this._hit('maple');
        const raw = ev.raw ?? ev.total;
        if (raw >= 1000) this._hit('combo1k');
        if (raw >= 3000) this._hit('combo3k');
        if (raw >= 5000) this._hit('combo5k');
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
