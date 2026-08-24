// Targeted headless checks for the feature-wave-2 mechanics. Complements the physics
// battery in scripts/playtest.mjs (which stays the regression net for the world itself).
//   node scripts/feature-checks.mjs [name ...]      (no args = all)
// Prints one PASS/FAIL line per check and exits non-zero if any failed.
import { createRequire } from 'module';
const require = createRequire('/Users/stephendavis/.npm/_npx/705bc6b22212b352/node_modules/playwright/package.json');
const { chromium, devices } = require('playwright');

const OUT = process.env.OUT || '/private/tmp/claude-501/-Users-stephendavis/1e5b0b69-d052-4824-90bd-6edd210d7c3b/scratchpad/shots/fc';
const mobile = process.argv.includes('mobile');
const want = process.argv.slice(2).filter(a => a !== 'mobile');

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext(mobile ? { ...devices['iPhone 13 landscape'], hasTouch: true } : { viewport: { width: 1280, height: 720 } });
const page = await ctx.newPage();
const errors = [];
page.on('console', m => { const t = m.text(); if ((m.type() === 'error' || m.type() === 'warning') && !/GL Driver Message/.test(t)) errors.push(m.type() + ': ' + t); });
page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
await page.goto(process.env.URL || 'http://localhost:8765/index.html');
await page.waitForFunction(() => !document.querySelector('#btn-play').disabled, null, { timeout: 180000 });
await page.click('#btn-play');
await page.waitForTimeout(500);

const ev = (fn, ...a) => page.evaluate(fn, a);
const shot = (n) => page.screenshot({ path: `${OUT}-${n}.png`, timeout: 120000 });

let pass = 0, fail = 0;
const results = [];
function report(name, ok, detail) {
  results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}  —  ${detail}`);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  —  ${detail}`);
  ok ? pass++ : fail++;
}

// A tap that installs an event recorder for the duration of one closure.
const RECORDER = `
  window.__rec = [];
  window.__recOn = () => { window.__rec = []; window.__tapOn = true; };
`;

const checks = {};

// ---------------------------------------------------------------- 1. FLOW ----
checks.flow = async () => {
  const r = await ev(() => {
    // cold: no flow, push flat out on the mall and read the top speed reached
    window.__tp(-11, -60, Math.PI, 0);
    window.__world && (window.__dbg());
    let cold = 0;
    for (let i = 0; i < 60 * 14; i++) { window.__sim(1 / 60, ['ArrowUp']); const d = window.__dbg(); cold = Math.max(cold, Math.hypot(d.vel[0], d.vel[2])); }
    const coldFlow = window.__flow();
    // hot: same stretch with the flow meter filled
    window.__tp(-11, -60, Math.PI, 0);
    window.__setFlow(1);
    let hot = 0;
    for (let i = 0; i < 60 * 14; i++) { window.__sim(1 / 60, ['ArrowUp']); const d = window.__dbg(); hot = Math.max(hot, Math.hypot(d.vel[0], d.vel[2])); }
    // and the ceiling itself, which the speeds above can't isolate because the mall runs
    // downhill and gravity along the slope carries both runs past the push cap
    window.__setFlow(0); const ceilCold = window.__maxPush();
    window.__setFlow(1); const ceilHot = window.__maxPush();
    return { cold: +cold.toFixed(1), hot: +hot.toFixed(1), coldFlow: +coldFlow.toFixed(2), ceilCold: +ceilCold.toFixed(1), ceilHot: +ceilHot.toFixed(1) };
  });
  report('flow raises the push ceiling', r.hot > r.cold + 1.5 && r.ceilCold === 16 && r.ceilHot === 24,
    `push ceiling ${r.ceilCold} → ${r.ceilHot} m/s; same downhill mall run tops out at ${r.cold} m/s cold vs ${r.hot} m/s in full flow`);

  const g = await ev(() => {
    window.__tp(-11, -60, Math.PI, 0); window.__setFlow(0);
    const f0 = window.__flow();
    // land a few tricks: each non-silent trick is +0.04, each bank +0.10·(mult/8)
    for (let k = 0; k < 4; k++) { window.__sim(2, ['ArrowUp']); window.__sim(0.4, ['Space']); window.__sim(0.05, ['KeyJ']); window.__sim(2.2); }
    return { f0: +f0.toFixed(3), f1: +window.__flow().toFixed(3) };
  });
  report('flow builds on landed tricks', g.f1 > g.f0, `flow ${g.f0} → ${g.f1} after four kickflips`);
};

// ------------------------------------------------- 2. SPEED-SCALED OLLIE ----
checks.ollie = async () => {
  const r = await ev(() => {
    const peak = (speed, charge) => {
      window.__tp(-11, -60, Math.PI, speed);
      window.__sim(0.02);
      const y0 = window.__dbg().pos[1];
      window.__sim(charge, ['Space']);
      let p = 0;
      for (let i = 0; i < 140; i++) { window.__sim(1 / 60); p = Math.max(p, window.__dbg().pos[1] - y0); }
      return +p.toFixed(2);
    };
    return { still: peak(0, 0.5), fast: peak(24, 0.5), tapStill: peak(0, 0.05), tapFast: peak(24, 0.05) };
  });
  report('speed scales ollie height', r.fast > r.still * 1.15,
    `full charge: ${r.still} m standing vs ${r.fast} m at 24 m/s; tap: ${r.tapStill} m vs ${r.tapFast} m`);
};

// ------------------------------------------------------------- 3. REVERT ----
checks.revert = async () => {
  const r = await ev(() => {
    // drop into a City Hall Park halfpipe transition with real air behind it
    window.__air(-80, 6.5, 52, Math.PI / 2, 0.6, -1, 0);
    let sawRevert = false, comboAfter = null, kind = null;
    window.__recOn();
    for (let i = 0; i < 60 * 5; i++) {
      window.__sim(1 / 60);
      for (const e of window.__rec) if (e.type === 'revert') { sawRevert = true; kind = e.kind; }
      window.__rec.length = 0;
      if (sawRevert && comboAfter === null) comboAfter = window.__dbg().combo.slice();
    }
    return { sawRevert, kind, comboAfter, ground: window.__dbg().ground };
  });
  report('revert scores on a transition landing', r.sawRevert,
    r.sawRevert ? `landed on '${r.kind}', combo now [${r.comboAfter.join(', ')}]` : 'no revert event');

  const c = await ev(() => {
    // the 0.9 s grace must keep the combo alive long enough to reach a manual
    window.__air(-80, 6.5, 52, Math.PI / 2, 3.0, -1, 0);
    let revertAt = -1, manual = false, banked = -1;
    window.__recOn();
    window.__press('ShiftLeft');
    for (let i = 0; i < 60 * 4; i++) {
      window.__sim(1 / 60);
      for (const e of window.__rec) {
        if (e.type === 'revert') revertAt = i;
        if (e.type === 'manual') manual = true;
        if (e.type === 'bank' && banked < 0) banked = i;
      }
      window.__rec.length = 0;
    }
    window.__release('ShiftLeft');
    return { revertAt, manual, banked, gapFrames: banked - revertAt };
  });
  report('revert extends the combo settle window', c.revertAt >= 0 && (c.manual || c.gapFrames > 18),
    `revert at frame ${c.revertAt}, ${c.manual ? 'chained into a manual' : `bank held off ${c.gapFrames} frames (>18 = 0.3 s)`}`);
};

// ------------------------------------------------- 4. COPING STALL vs GRIND ----
checks.stall = async () => {
  const r = await ev(() => {
    const cop = window.__world.collide.all.edges.filter(e => /Mall quarter coping/.test(e.name || ''))[0];
    const mx = (cop.ax + cop.bx) / 2, mz = (cop.az + cop.bz) / 2, my = (cop.ay + cop.by) / 2;
    const dx = (cop.bx - cop.ax) / cop.len, dz = (cop.bz - cop.az) / cop.len;
    const run = (alongSpeed) => {
      window.__air(mx - dx * 0.4, my + 0.3, mz - dz * 0.4, Math.atan2(-dx, -dz), dx * alongSpeed, -1.2, dz * alongSpeed);
      for (let i = 0; i < 60; i++) { window.__sim(1 / 60); const g = window.__grind(); if (g) return g; }
      return null;
    };
    // 1.6 m/s is as slow as the snap allows: stepAir gates on horizontal speed² > 1.0
    return { slow: run(1.6), fast: run(6) };
  });
  const slowOk = r.slow && r.slow.stall && /Stall|Rock/.test(r.slow.type);
  const fastOk = r.fast && !r.fast.stall;
  report('slow hop onto coping is a lip trick', slowOk,
    r.slow ? `type '${r.slow.type}' stall=${r.slow.stall} speed=${r.slow.speed}` : 'never latched the coping');
  report('fast approach still grinds normally', fastOk,
    r.fast ? `type '${r.fast.type}' stall=${r.fast.stall} speed=${r.fast.speed}` : 'never latched the coping');
};

// --------------------------------------------------------------- 5. GAPS ----
checks.gaps = async () => {
  const r = await ev(() => {
    const hits = [], missed = [];
    // Pick the entry speed that makes a full-charge ollie cover exactly the zone gap:
    // airtime T = 2·vy/g with vy = 11.5·(1 + 0.30·v/28), so 1.353v + 0.01448v² = D.
    const speedFor = (D) => Math.min(26, (-1.353 + Math.sqrt(1.353 * 1.353 + 4 * 0.01448 * D)) / (2 * 0.01448));
    const tryGap = (g) => {
      const dx = g.to.x - g.from.x, dz = g.to.z - g.from.z, L = Math.hypot(dx, dz);
      const ux = dx / L, uz = dz / L;
      const yaw = Math.atan2(-ux, -uz);
      const v = speedFor(L);
      // start far enough back that 0.25 s of rolling plus the 0.45 s charge puts the pop
      // right on the takeoff zone's centre
      const back = 0.7 * v;
      window.__tp(g.from.x - ux * back, g.from.z - uz * back, yaw, v);
      window.__setFlow(1);
      window.__recOn();
      let got = null;
      window.__sim(0.25);            // let stepRide write lastGround at the real takeoff
      window.__sim(0.45, ['Space']);
      for (let i = 0; i < 60 * 5 && !got; i++) {
        window.__sim(1 / 60);
        for (const e of window.__rec) if (e.type === 'gap') got = e.name;
        window.__rec.length = 0;
      }
      return got;
    };
    for (const g of window.__gaps().list) {
      if (g.name === 'Lake Leap') continue;               // has its own full-run check
      const got = tryGap(g);
      if (got) hits.push(got); else missed.push(g.name);
    }
    return { hits: [...new Set(hits)], missed };
  });
  report('named gaps fire', r.hits.length >= 4, `${r.hits.length}/14 gaps cleared on a scripted approach: ${r.hits.join(', ')}${r.missed.length ? ' — not cleared by this approach: ' + r.missed.join(', ') : ''}`);
};

// -------------------------------------------------------- 6. BLUFF BOMBER ----
checks.bluff = async () => {
  const r = await ev(() => {
    window.__tp(-524, -375, Math.PI / 2, 22);
    window.__setFlow(1);
    window.__recOn();
    let peak = -99, tY = null, tX = null, prev = 'ride', gap = null, bail = null, lands = [];
    for (let i = 0; i < 60 * 16; i++) {
      window.__sim(1 / 60, ['ArrowUp']);
      const d = window.__dbg();
      if (prev !== 'air' && d.state === 'air') { tY = d.pos[1]; tX = d.pos[0]; peak = d.pos[1]; }
      if (d.state === 'air') peak = Math.max(peak, d.pos[1]);
      if (d.state === 'bail' && !bail) bail = d.why;
      prev = d.state;
      for (const e of window.__rec) {
        if (e.type === 'gap') gap = e.name;
        if (e.type === 'land' && e.airTime > 0.6) lands.push({ from: [+e.fromX.toFixed(1), +e.fromZ.toFixed(1)], to: [+e.x.toFixed(1), +e.z.toFixed(1)], air: +e.airTime.toFixed(2) });
      }
      window.__rec.length = 0;
      if (d.pos[0] < -604 && d.state === 'ride') break;
    }
    const d = window.__dbg();
    return { above: tY == null ? null : +(peak - tY).toFixed(2), takeoff: tX && +tX.toFixed(1), state: d.state, speed: +Math.hypot(d.vel[0], d.vel[2]).toFixed(1), gap, bail, lands };
  });
  report('Bluff Bomber full run', r.above > 6 && r.state === 'ride' && r.speed > 12,
    `peak ${r.above} m above takeoff (x=${r.takeoff}), ends '${r.state}' at ${r.speed} m/s${r.bail ? ` (bailed: ${r.bail})` : ''}`);
  report('Lake Leap gap fires', r.gap === 'Lake Leap', r.gap ? `gap '${r.gap}'` : 'no gap event; long airs were ' + JSON.stringify(r.lands));
};

// -------------------------------------------------------------- 7. WRECK ----
checks.wreck = async () => {
  const r = await ev(() => {
    // a genuine slam: dropped in high and fast, no flip, into the deck of the mall
    window.__air(-11, 26, -60, Math.PI, 16, 0, 0);
    window.__recOn();
    let w = null;
    for (let i = 0; i < 60 * 12 && !w; i++) {
      window.__sim(1 / 60);
      for (const e of window.__rec) if (e.type === 'wreck') w = e;
      window.__rec.length = 0;
    }
    return { w, best: window.__dbg().bestWreck };
  });
  report('wreck scores on recovery', !!r.w && r.w.score > 0,
    r.w ? `'${r.w.name}' worth ${r.w.score} (session best ${r.best})` : 'no wreck event');
};

// ------------------------------------------------- 8. SPECIAL + MAPLE LEAF ----
checks.maple = async () => {
  const r = await ev(() => {
    // The Maple Leaf needs 0.76 s of air (dur × 0.82), and a standing full-charge ollie
    // already hangs for 1.35 s — so this wants a clear patch of brick, not speed. Sending
    // it at 20+ m/s only guarantees landing on mall furniture or in front of a car.
    window.__tp(-11, -60, Math.PI, 0);
    window.__setSpecial(1);
    const before = window.__special();
    window.__sim(0.5, ['Space']);
    window.__sim(1 / 60, ['KeyJ', 'KeyK']);
    window.__recOn();
    let trick = null, banked = null, drained = null;
    for (let i = 0; i < 60 * 6; i++) {
      window.__sim(1 / 60);
      for (const e of window.__rec) {
        // read the meter the instant the trick completes: the bank that follows immediately
        // re-earns most of it, so sampling at the end would hide the drain entirely
        if (e.type === 'trick' && /Maple Leaf/.test(e.name)) { trick = e; drained = window.__special(); }
        if (e.type === 'bank') banked = e.tricks;
      }
      window.__rec.length = 0;
    }
    return { before: +before.toFixed(2), trick, banked, drained: drained == null ? null : +drained.toFixed(2), after: +window.__special().toFixed(2), state: window.__dbg().state };
  });
  const landed = !!r.trick && !!r.banked && r.banked.some(t => /Maple Leaf/.test(t));
  report('special meter fills', r.before >= 1, `special ${r.before}`);
  report('The Maple Leaf lands and banks', landed && r.trick.pts >= 1200,
    r.trick ? `scored ${r.trick.pts} (base 1200 × special 1.5), banked [${(r.banked || []).join(", ")}], meter drained to ${r.drained} then re-earned to ${r.after} by the bank` : 'never triggered');
};

// ------------------------------------------------------------ 9. RUN MODE ----
checks.run = async () => {
  // restart the page into run mode so the real title-screen button path is exercised
  await page.goto(process.env.URL || 'http://localhost:8765/index.html');
  await page.waitForFunction(() => !document.querySelector('#btn-play').disabled, null, { timeout: 180000 });
  await page.click('#btn-run');
  await page.waitForTimeout(300);
  const started = await ev(() => ({ timer: document.querySelector('#timer').textContent, run: document.body.classList.contains('run'), score: window.__dbg().score }));
  const r = await ev(() => {
    // burn the whole clock in one go, landing a few tricks on the way
    for (let k = 0; k < 12; k++) { window.__sim(2, ['ArrowUp']); window.__sim(0.4, ['Space']); window.__sim(0.05, ['KeyJ']); window.__sim(2.2); }
    window.__sim(80);
    return {
      shown: document.querySelector('#screen-results').classList.contains('on'),
      score: document.querySelector('#res-score').textContent,
      stats: document.querySelector('#res-stats').textContent,
      timer: document.querySelector('#timer').textContent,
      lbVisible: !document.querySelector('#lb').classList.contains('hidden'),
    };
  });
  report('2-minute run reaches the buzzer', started.run && started.timer === '2:00' && r.shown,
    `clock started at ${started.timer}, results overlay shown, final ${r.score} · ${r.stats.replace(/\s+/g, ' ')}`);
  report('run mode offers the leaderboard', r.lbVisible, `leaderboard panel visible=${r.lbVisible}`);
  await shot('results');
  // back to free skate for anything after this
  await page.click('#btn-free');
  await page.waitForTimeout(200);
};

// ------------------------------------------------------------ 10. LETTERS ----
checks.letters = async () => {
  const r = await ev(() => {
    // earlier checks teleport all over downtown and pick letters up in passing, so start
    // this one from a clean week
    window.__lettersReset();
    const st = window.__letters();
    window.__recOn();
    const got = [];
    let all = false;
    for (const it of st.items) {
      window.__tp(it.x, it.z, 0, 0);
      for (let i = 0; i < 20; i++) window.__sim(1 / 60);
      for (const e of window.__rec) { if (e.type === 'letter') got.push(e.ch); if (e.type === 'letters') all = true; }
      window.__rec.length = 0;
    }
    return { route: st.route, got, all, score: window.__dbg().score, tray: document.querySelector('#letters').textContent };
  });
  report("all five B-T-O-W-N letters collectable", r.got.length === 5 && r.all,
    `route '${r.route}', collected ${r.got.join('')}, full-set bonus fired=${r.all}, HUD tray '${r.tray}'`);
};

// ===== wave 3: feel + switch riding + cars + street megas =====================

checks.switchride = async () => {
  // fakie steering matches forward steering (camera-relative), and W pushes switch
  const r = await ev(() => {
    const heading = () => { const d = window.__dbg(); return Math.atan2(-d.vel[0], -d.vel[2]); };
    const wrap = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
    window.__tp(-440, 10, -Math.PI / 2, 8);        // College z=10 corridor, clear both ways
    const f0 = heading();
    window.__sim(0.45, ['ArrowRight']);
    const fwdTurn = wrap(heading() - f0);
    window.__tp(-440, 10, Math.PI / 2, 0);         // facing west; fakie creep rolls east
    window.__sim(1.6, ['ArrowDown']);
    const h0 = heading();
    window.__sim(0.45, ['ArrowDown', 'ArrowRight']);
    const fakieTurn = wrap(heading() - h0);
    window.__tp(-440, 10, Math.PI / 2, 0);
    window.__sim(1.6, ['ArrowDown']);
    window.__sim(3.5, ['ArrowUp']);                // W while rolling switch
    const d = window.__dbg(); const fv = [-Math.sin(d.yaw), -Math.cos(d.yaw)];
    const switchSp = d.vel[0] * fv[0] + d.vel[2] * fv[1];
    return { fwdTurn: +fwdTurn.toFixed(2), fakieTurn: +fakieTurn.toFixed(2), switchSp: +switchSp.toFixed(1) };
  });
  report('fakie steering matches forward', Math.sign(r.fwdTurn) === Math.sign(r.fakieTurn) && Math.abs(r.fakieTurn) > 0.15, JSON.stringify(r));
  report('W pushes switch at full speed', r.switchSp < -11, `fwdSpeed ${r.switchSp} (negative = switch)`);
};

checks.tuck = async () => {
  // charging = a tuck: more downhill gravity, less rolling friction, and the HUD charge
  // bar shows the pop with its speed-bonus segment
  const r = await ev(() => {
    window.__tp(-282, 141, Math.PI / 2, 10);       // Main St north corridor, downhill west
    window.__sim(2.2);
    const coast = Math.hypot(window.__dbg().vel[0], window.__dbg().vel[2]);
    window.__tp(-282, 141, Math.PI / 2, 10);
    window.__press('Space'); window.__sim(2.2);
    const tucked = Math.hypot(window.__dbg().vel[0], window.__dbg().vel[2]);
    const el = document.querySelector('#charge');
    const bar = { on: el.classList.contains('on'), fill: el.querySelector('i').style.width, bonus: el.querySelector('b').style.width };
    window.__release('Space'); window.__sim(0.4);
    return { coast: +coast.toFixed(1), tucked: +tucked.toFixed(1), bar };
  });
  report('tuck gains downhill speed', r.tucked > r.coast + 1.5, `coast ${r.coast} vs tucked ${r.tucked} m/s`);
  report('charge bar shows with speed bonus', r.bar.on && parseFloat(r.bar.fill) > 50 && parseFloat(r.bar.bonus) > 3, JSON.stringify(r.bar));
};

checks.bigairland = async () => {
  // landing assist + widened big-air tolerance: come in crooked off a long air, land riding
  const r = await ev(() => {
    window.__air(-2, window.__world.collide.groundAt(-2, -70, 200, 300).y + 5.5, -70, 0, 0.3, 2, -13);
    window.__sim(0.35, ['ArrowRight']);            // put real rotation on it
    for (let i = 0; i < 240; i++) { window.__sim(1 / 60); const d = window.__dbg(); if (d.state === 'ride') return { state: 'ride', sp: +Math.hypot(d.vel[0], d.vel[2]).toFixed(1) }; if (d.state === 'bail') return { state: 'bail:' + d.why }; }
    return { state: 'none' };
  });
  report('crooked big air lands (assist + tolerance)', r.state === 'ride', JSON.stringify(r));
};

checks.cars = async () => {
  const r = await ev(() => {
    // roof rails registered
    const nEdges = window.__world.collide.all.edges.filter(e => e.name === 'Car roof').length;
    // ride up and over: try a handful of cars (some park against walls — that bail is real)
    const cars = window.__world.collide.all.surfaces.filter(s => s.name === 'Parked car');
    let ride = null;
    for (let ci = 0; ci < Math.min(10, cars.length) && !ride; ci++) {
      const c = cars[ci * 7 % cars.length];
      const ax = Math.sin(c.yaw), az = Math.cos(c.yaw);
      for (const sgn of [1, -1]) {
        window.__tp(c.x + sgn * ax * 6.5, c.z + sgn * az * 6.5, Math.atan2(sgn * ax, sgn * az), 8);
        let rodeCar = false, bail = null;
        for (let i = 0; i < 180; i++) {
          window.__sim(1 / 60); const d = window.__dbg();
          if (d.state === 'ride' && d.ground === 'car') rodeCar = true;
          if (d.state === 'bail') { bail = d.why; break; }
          if (rodeCar && d.ground !== 'car' && d.state === 'ride' && i > 40) break;
        }
        if (rodeCar && !bail) { ride = true; break; }
      }
    }
    // roof-edge grind snap
    const edge = window.__world.collide.all.edges.find(e => e.name === 'Car roof');
    const ux = (edge.bx - edge.ax) / edge.len, uz = (edge.bz - edge.az) / edge.len;
    const mx = (edge.ax + edge.bx) / 2, mz = (edge.az + edge.bz) / 2;
    window.__air(mx - ux * 1.2, edge.ay + 0.35, mz - uz * 1.2, Math.atan2(-ux, -uz), ux * 4, -1.2, uz * 4);
    let grind = false;
    for (let i = 0; i < 40; i++) { window.__sim(1 / 60); if (window.__dbg().state === 'grind') { grind = true; break; } }
    return { nEdges, ride: !!ride, grind };
  });
  report('parked cars ride up and over', r.ride, JSON.stringify(r));
  report('car roof rails grind', r.nEdges > 100 && r.grind, `${r.nEdges} roof edges, snapped=${r.grind}`);
};

checks.streetmegas = async () => {
  const r = await ev(() => {
    const out = {};
    for (const name of ['Main St mega kicker', 'Battery St launch']) {
      const rr = window.__world.collide.all.ramps.find(r => r.name === name && r.yHigh - r.yLow > 1.5);
      if (!rr) { out[name] = { err: 'missing' }; continue; }
      const dx = rr.ux, dz = rr.uz;
      window.__tp(rr.ax - dx * 22, rr.az - dz * 22, Math.atan2(-dx, -dz), 0);
      let peak = 0, y0 = null, end = null;
      for (let i = 0; i < 600; i++) {
        window.__sim(1 / 60, i < 140 ? ['ArrowUp'] : []);
        const d = window.__dbg();
        if (d.state === 'air') { if (y0 === null) y0 = d.pos[1]; peak = Math.max(peak, d.pos[1] - y0); }
        if (y0 !== null && (d.state === 'ride' || d.state === 'bail')) { end = d.state + (d.why ? ':' + d.why : ''); break; }
      }
      out[name] = { peak: +peak.toFixed(1), end };
    }
    return out;
  });
  report('Main St mega kicker launches + lands', r['Main St mega kicker'].end === 'ride' && r['Main St mega kicker'].peak > 1.5, JSON.stringify(r['Main St mega kicker']));
  report('Battery St launch launches + lands', r['Battery St launch'].end === 'ride' && r['Battery St launch'].peak > 1.5, JSON.stringify(r['Battery St launch']));
};

checks.spins = async () => {
  const r = await ev(() => {
    // spinning kickflip on a clear corridor: live readout + merged landing name
    window.__tp(-440, 10, -Math.PI / 2, 10);
    window.__sim(0.45, ['Space']);
    window.__sim(0.05, ['KeyJ']);
    let live = null;
    for (let i = 0; i < 150; i++) {
      window.__sim(1 / 60, ['ArrowLeft']);
      const d = window.__dbg();
      if (d.state === 'air') { const t = document.querySelector('#combo-tricks'); if (t && /\u00b0/.test(t.textContent)) live = t.textContent; }
      if (d.state !== 'air' && i > 10) break;
    }
    const combo = window.__dbg().combo.join('|');
    return { live, combo, state: window.__dbg().state };
  });
  report('live spin readout in the combo ticker', /\u00b0/.test(r.live || ''), JSON.stringify(r.live));
  report('spin + flip merge into one name', /(FS|BS) \d+ (Kickflip|Heelflip|Hardflip|Varial|Laser|Inward|360)/.test(r.combo), r.combo);
};

checks.tricknames = async () => {
  const r = await ev(() => {
    const out = {};
    window.__tp(-440, 10, -Math.PI / 2, 8); window.__sim(0.4, ['Space']);
    window.__sim(0.06, ['ArrowLeft', 'KeyJ']); window.__sim(1.2);
    out.hardflip = window.__dbg().combo.join('|');
    window.__tp(-440, 10, -Math.PI / 2, 8); window.__sim(0.45, ['Space']);
    window.__sim(0.6, ['ShiftLeft', 'ArrowDown']); window.__sim(1.0);
    out.tailgrab = window.__dbg().combo.join('|');
    const e = window.__world.collide.all.edges.find(e => e.name === 'Mall rail');
    const ux = (e.bx - e.ax) / e.len, uz = (e.bz - e.az) / e.len;
    const mx = (e.ax + e.bx) / 2, mz = (e.az + e.bz) / 2;
    window.__air(mx - ux * 1.5, e.ay + 0.3, mz - uz * 1.5, Math.atan2(-ux, -uz), ux * 5, -1.5, uz * 5);
    window.__press('ArrowRight');
    out.smith = null;
    for (let i = 0; i < 40; i++) { window.__sim(1 / 60); if (window.__dbg().state === 'grind') { window.__release('ArrowRight'); window.__sim(0.1); out.smith = document.querySelector('#combo-tricks').textContent; break; } }
    window.__release('ArrowRight');
    return out;
  });
  report('Hardflip fires on steer + flip', /Hardflip/.test(r.hardflip), r.hardflip);
  report('Tailgrab fires on grab + back', /Tailgrab/.test(r.tailgrab), r.tailgrab);
  report('Smith/Feeble grind fires on steer entry', /(Smith|Feeble)/.test(r.smith || ''), JSON.stringify(r.smith));
};

checks.flickpad = async () => {
  const r = await ev(() => {
    const out = {};
    const peak = (frames) => { let p = -1e9, y0 = null; for (let i = 0; i < frames; i++) { window.__sim(1 / 60); const d = window.__dbg(); if (y0 === null) y0 = d.pos[1]; p = Math.max(p, d.pos[1] - y0); } return p; };
    // quick flick straight up = minimum ollie
    window.__tp(-440, 10, -Math.PI / 2, 6);
    window.__flickSeq([[0, -1]]);
    out.quick = +peak(70).toFixed(2);
    // pull back, hold half a second, flick up = charged ollie — must fly well higher
    window.__tp(-440, 10, -Math.PI / 2, 6);
    window.__flickSeq([[0, 1]], false); window.__sim(0.5);
    window.__flickSeq([[0, -1]]);
    out.charged = +peak(100).toFixed(2);
    // S→NW = kickflip, S→NE = heelflip, side flicks = shove-it with the flick picking FS/BS.
    // Read the trick EVENTS, not skater.combo — a barely-charged flick lands fast enough
    // that the combo has already banked (and cleared) by the time the sim settles.
    const trick = (pts) => {
      window.__tp(-440, 10, -Math.PI / 2, 8); window.__recOn();
      window.__flickSeq(pts); window.__sim(1.4);
      const names = window.__rec.filter(e => e.type === 'trick').map(e => e.name).join('|');
      window.__recOff(); return names;
    };
    out.kick = trick([[0, 1], [-0.7, -0.7]]);
    out.heel = trick([[0, 1], [0.7, -0.7]]);
    out.shoveW = trick([[0, 1], [-1, 0]]);
    out.shoveE = trick([[0, 1], [1, 0]]);
    // pull back and just let go: the charge must die quietly — no pop, no phantom ollie
    window.__tp(-440, 10, -Math.PI / 2, 6);
    window.__recOn();
    window.__flickSeq([[0, 1]]); window.__sim(0.8);
    out.cancel = { state: window.__dbg().state, pops: window.__rec.filter(e => e.type === 'pop').length };
    window.__recOff();
    return out;
  });
  report('flick up pops, pull-back charges higher', r.quick > 0.3 && r.charged > r.quick + 1, `quick ${r.quick} m, charged ${r.charged} m`);
  report('flick corners map to kick/heel', /Kickflip/.test(r.kick) && /Heelflip/.test(r.heel), `${r.kick} / ${r.heel}`);
  report('side flicks shove with direction', /FS Shove-it/.test(r.shoveW) && /Pop Shove-it/.test(r.shoveE), `${r.shoveW} / ${r.shoveE}`);
  report('abandoned charge cancels without a pop', r.cancel.state === 'ride' && r.cancel.pops === 0, JSON.stringify(r.cancel));
};

checks.funpass = async () => {
  const r = await ev(() => {
    const out = {};
    // 1. backflip: fresh press of back in the air scores; held through takeoff doesn't.
    // (−476 westward: the College drop-in now occupies the corridor's east end at −440.)
    window.__tp(-476, 10, Math.PI / 2, 8);
    window.__recOn();
    window.__sim(0.45, ['Space']); window.__sim(0.15); window.__sim(0.7, ['ArrowDown']); window.__sim(1.2);
    out.backflip = window.__rec.filter(e => e.type === 'trick').map(e => e.name).join('|');
    out.backflipState = window.__dbg().state;
    window.__recOff();
    // 2. stomp: a big clean drop pays a speed boost + the event
    window.__air(-440, -8, 10, -Math.PI / 2, -9, 0, 0);
    window.__recOn();
    let spBefore = 9;
    window.__sim(1.6);
    const st = window.__rec.find(e => e.type === 'stomp');
    out.stomp = st ? { got: true, speed: +st.speed.toFixed(1) } : { got: false };
    out.stompFaster = window.__dbg().state === 'ride' && Math.hypot(window.__dbg().vel[0], window.__dbg().vel[2]) > spBefore;
    window.__recOff();
    // 3. trick tape rows appear and carry the trick name
    window.__tp(-476, 10, Math.PI / 2, 8);
    window.__sim(0.4, ['Space']); window.__sim(0.06, ['KeyJ']); window.__sim(1.2);
    const tape = document.querySelector('#tape');
    out.tape = tape ? tape.textContent : '(no #tape)';
    // 4. new furniture exists: long mall rails, street rails, roll-ins, marketplace booter
    const E = window.__world.collide.all.edges, R = window.__world.collide.all.ramps;
    const mallRail = E.find(e => e.name === 'Mall rail');
    out.mallRailLen = mallRail ? +mallRail.len.toFixed(1) : 0;
    out.streetRails = ['College St rail', 'Main St rail'].map(n => (E.find(e => e.name === n) || {}).len || 0);
    out.rollIns = ['Main St drop-in roll-in', 'Main St drop-in entry'].map(n => !!R.find(r => r.name === n));
    out.booter = !!R.find(r => r.name === 'Marketplace booter');
    return out;
  });
  report('backflip scores on back-key press', /Backflip/.test(r.backflip) && r.backflipState === 'ride', `${r.backflip} → ${r.backflipState}`);
  report('stomp fires + boosts on big clean landings', r.stomp.got && r.stompFaster, JSON.stringify(r.stomp));
  report('trick tape shows landed tricks', /Kickflip/.test(r.tape), JSON.stringify(r.tape.slice(0, 80)));
  report('long rails placed (mall 14 m + streets 18 m)', r.mallRailLen >= 13 && r.streetRails.every(l => l >= 17), `mall ${r.mallRailLen}, street ${r.streetRails}`);
  report('roll-ins + Marketplace booter built', r.rollIns.every(Boolean) && r.booter, JSON.stringify({ rollIns: r.rollIns, booter: r.booter }));

  const c = await ev(() => {
    // 5. car hop + car bounce, tried over several parked cars — any given car may have
    // unrelated scenery in the approach, so a bail only counts against us if it happens
    // ON the car (within 3.5 m of its centre)
    const carsAll = window.__world.collide.all.surfaces.filter(s => s.name === 'Parked car');
    let hop = '', carBail = null, bounced = false;
    for (let ci = 0; ci < Math.min(8, carsAll.length) && (!hop || !bounced); ci++) {
      const car = carsAll[ci * 5 % carsAll.length];
      const yaw = car.yaw + Math.PI / 2;                   // across the car, over its width
      const ux = -Math.sin(yaw), uz = -Math.cos(yaw);
      if (!hop) {
        window.__recOn();
        window.__air(car.x - ux * 6, car.top + 3, car.z - uz * 6, yaw, ux * 14, 2.5, uz * 14);
        window.__sim(2.2);
        hop = window.__rec.filter(e => e.type === 'trick' && /Car Hop/.test(e.name)).map(e => e.name).join('|');
        window.__recOff();
      }
      if (!bounced) {
        window.__tp(car.x - ux * 12, car.z - uz * 12, yaw, 9);
        let onCarBail = false, reached = false;
        for (let i = 0; i < 150; i++) {
          window.__sim(1 / 60);
          const d = window.__dbg();
          const dc = Math.hypot(d.pos[0] - car.x, d.pos[2] - car.z);
          if (dc < 3.5) reached = true;
          if (d.state === 'bail') { if (dc < 3.5) { onCarBail = true; carBail = { ci, why: d.why }; } break; }
        }
        if (reached && !onCarBail) bounced = true;
      }
    }
    return { hop, bounced, carBail };
  });
  report('car hop bonus fires on a clean clear', /Car Hop/.test(c.hop), JSON.stringify(c.hop));
  report('riding into a car bounces, never bails', c.bounced && !c.carBail, JSON.stringify({ bounced: c.bounced, carBail: c.carBail }));
};

checks.rollins = async () => {
  const r = await ev(() => {
    const out = {};
    // ride each line from the entry foot: climb, drop, send — stop at the FIRST clean
    // landing after real air (past it the corridor simply runs out, as any street does)
    const line = (x, z, yaw) => {
      window.__tp(x, z, yaw, 2);
      let air = false, end = null, topSpeed = 0;
      for (let i = 0; i < 60 * 9; i++) {
        window.__sim(1 / 60, ['ArrowUp']);
        const d = window.__dbg();
        topSpeed = Math.max(topSpeed, Math.hypot(d.vel[0], d.vel[2]));
        if (d.state === 'air' && topSpeed > 10) air = true;
        if (air && d.state === 'ride') { end = 'ride'; break; }
        if (d.state === 'bail') { end = 'bail:' + d.why; break; }
      }
      return { air, end: end || window.__dbg().state, topSpeed: +topSpeed.toFixed(1) };
    };
    // start at the entry ramp foot, facing the tower
    out.main = line(-220, 141, Math.PI / 2);
    return out;
  });
  report('Main St drop-in line rides out', r.main.air && r.main.end === 'ride' && r.main.topSpeed > 14, JSON.stringify(r.main));
};

const all = want.length ? want : Object.keys(checks);
for (const t of all) {
  if (!checks[t]) { console.log('no such check', t); continue; }
  console.log('\n===== ' + t.toUpperCase() + ' =====');
  try { await checks[t](); } catch (e) { report(t, false, 'threw: ' + e.message); }
}

console.log('\n---------------- SUMMARY ----------------');
for (const l of results) console.log(l);
console.log(`\n${pass} passed, ${fail} failed`);
console.log('ERRORS:', errors.length ? errors.slice(0, 10).join('\n') : 'none');
await browser.close();
process.exit(fail ? 1 : 0);
