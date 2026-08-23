// Headless physics playtest battery. Boots the real Burlington map once, then drives the
// skater along real routes and pokes the real spots, reporting bails/bumps/stalls.
//   node scripts/playtest.mjs [testName ...]     (no args = all)
// Screenshots land next to OUT (env, default scratchpad/pt).
import { createRequire } from 'module';
const require = createRequire('/Users/stephendavis/.npm/_npx/705bc6b22212b352/node_modules/playwright/package.json');
const { chromium, devices } = require('playwright');
const { WORLD } = await import('../data/world.js');

const OUT = process.env.OUT || '/private/tmp/claude-501/-Users-stephendavis/f0025184-3473-4051-93a3-42606d48d121/scratchpad/pt';
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
const tp = (x, z, yaw = 0, sp = 0) => ev(([x, z, y, s]) => window.__tp(x, z, y, s), x, z, yaw, sp);
const drive = (wps, secs, opts) => ev(([w, s, o]) => window.__drive(w, s, o), wps, secs, opts || {});
const sim = (secs, keys = []) => ev(([s, k]) => window.__sim(s, k), secs, keys);
const dbg = () => ev(() => window.__dbg());
const near = (x, z, r) => ev(([x, z, r]) => window.__near(x, z, r), x, z, r);
const shot = (n) => page.screenshot({ path: `${OUT}-${n}.png`, timeout: 120000 });
const say = (...a) => console.log(...a);

const CL = WORLD.churchStreet.centerline;
const between = (z0, z1) => CL.filter(p => p[1] >= z0 && p[1] <= z1).map(p => [p[0], p[1]]);

const tests = {};

tests.mall = async () => {
  // Pearl → Main down the centerline of the brick.
  const wps = between(-380, 140);
  await tp(CL[0][0], CL[0][1] + 4, Math.PI, 4);
  const r = await drive(wps, 75, { gain: 1.4 });
  say('MALL Pearl→Main:', JSON.stringify({ end: r.end, wp: r.reachedWp + '/' + wps.length, speed: r.speed, stuck: r.stuck, cam: r.cam }));
  for (const l of r.log) say('   ', JSON.stringify(l));
  await shot('mall');
  // ground continuity along the whole mall: sample every 2 m, look for steps
  const prof = await ev(() => {
    const cl = window.__world.WORLD.churchStreet.centerline; const out = []; let prev = null;
    for (let z = -372; z <= 128; z += 1) {
      let x = cl[0][0];
      for (let i = 0; i < cl.length - 1; i++) if (z >= cl[i][1] && z <= cl[i + 1][1]) { const t = (z - cl[i][1]) / (cl[i + 1][1] - cl[i][1]); x = cl[i][0] + (cl[i + 1][0] - cl[i][0]) * t; break; }
      const g = window.__world.collide.groundAt(x, z, 200, 300);
      if (prev !== null && Math.abs(g.y - prev) > 0.09) out.push({ z, x: +x.toFixed(1), dy: +(g.y - prev).toFixed(3), kind: g.kind });
      prev = g.y;
    }
    return out;
  });
  say('MALL height steps >9cm along the centreline:', prof.length ? JSON.stringify(prof) : 'none');
};

tests.college = async () => {
  // Bomb College St west from Church to Battery.
  await tp(-14, 1.2, Math.PI / 2, 6);
  const r = await drive([[-60, 2], [-140, 4], [-240, 7], [-360, 9], [-460, 11]], 45, { gain: 1.4 });
  say('COLLEGE bomb west:', JSON.stringify({ end: r.end, speed: r.speed, stuck: r.stuck, cam: r.cam }));
  for (const l of r.log) say('   ', JSON.stringify(l));
  await shot('college');
};

tests.main = async () => {
  await tp(14, 130, Math.PI / 2, 6);
  const r = await drive([[-60, 131], [-160, 133], [-280, 136], [-400, 140]], 40, { gain: 1.4 });
  say('MAIN bomb west:', JSON.stringify({ end: r.end, speed: r.speed, stuck: r.stuck, cam: r.cam }));
  for (const l of r.log) say('   ', JSON.stringify(l));
  await shot('main');
};

tests.cityhall = async () => {
  // Real approaches: roll off the City Hall landing down each flight and catch the rail.
  const runs = [
    ['N handrail', -12.58, 90.5, 0], ['N hubba', -9.55, 90.5, 0],
    ['S handrail', -11.90, 88.5, Math.PI], ['S hubba', -9.2, 88.5, Math.PI],
  ];
  for (const [name, x, z, yaw] of runs) {
    const r = await ev(([x, z, yaw]) => {
      window.__tp(x, z, yaw, 6);
      window.__sim(0.5, ['Space']);
      let seen = null;
      for (let i = 0; i < 150; i++) { window.__sim(1 / 60); const d = window.__dbg(); if (d.state === 'grind') { seen = 'grind'; break; } if (d.state === 'bail') { seen = 'bail:' + d.why; break; } }
      for (let i = 0; i < 200; i++) window.__sim(1 / 60);
      const d = window.__dbg();
      return { seen: seen || 'none', score: d.score, end: d.pos };
    }, x, z, yaw);
    say(`CITY HALL ${name}: ${r.seen} score=${r.score} end=${r.end}`);
  }
  // rolling the flights themselves
  await tp(-11.0, 89.5, 0, 5); await sim(3, ['ArrowUp']);
  say('CITY HALL off the landing, N flight:', JSON.stringify(await dbg()));
  await tp(-10.8, 89.5, Math.PI, 5); await sim(3, ['ArrowUp']);
  say('CITY HALL off the landing, S flight:', JSON.stringify(await dbg()));
  // and the ledge wall at the foot of a flight (0.9 m — needs a full-charge ollie)
  await tp(-11.06, 105.5, 0, 5);
  const w = await ev(() => { window.__sim(0.5, ['Space']); for (let i = 0; i < 120; i++) { window.__sim(1 / 60); const d = window.__dbg(); if (d.state === 'grind') return 'grind'; if (d.state === 'bail') return 'bail:' + d.why; } return window.__dbg().ground; });
  say('CITY HALL ollie the foot wall:', w);
  await tp(-9, 89, Math.PI, 0); await sim(0.2);
  await shot('cityhall');
};

tests.holes = async () => {
  // Sweep the areas a player actually skates on a 0.3 m grid and flag any cell whose ground
  // is far below all four neighbours: an invisible crack between two builders' surfaces.
  const boxes = [
    ['Church St mall', -26, -380, 6, 140],
    ['City Hall + plaza', -24, 60, -2, 112],
    ['City Hall Park', -96, 10, -40, 118],
    ['Church terrace', -30, -418, -6, -366],
    ['Fletcher Free', 156, -14, 188, 20],
  ];
  for (const [name, x0, z0, x1, z1] of boxes) {
    const holes = await ev(([x0, z0, x1, z1]) => {
      const cw = window.__world.collide, st = 0.3, out = [];
      const H = (x, z) => cw.groundAt(x, z, 200, 300, {}).y;
      for (let x = x0; x <= x1; x += st) for (let z = z0; z <= z1; z += st) {
        const c = H(x, z);
        const n = Math.min(H(x + st, z), H(x - st, z), H(x, z + st), H(x, z - st));
        if (n - c > 0.5) out.push({ x: +x.toFixed(1), z: +z.toFixed(1), y: +c.toFixed(2), drop: +(n - c).toFixed(2) });
      }
      // cluster nearby reports so one crack is one line
      const cl = [];
      for (const h of out) { const m = cl.find(k => Math.hypot(k.x - h.x, k.z - h.z) < 3); if (m) { m.n++; m.drop = Math.max(m.drop, h.drop); } else cl.push({ ...h, n: 1 }); }
      return cl;
    }, x0, z0, x1, z1);
    say(`HOLES ${name}: ${holes.length ? holes.length + ' crack(s)' : 'none'}`);
    for (const h of holes.slice(0, 12)) say('   ', JSON.stringify(h));
  }
};

tests.spots = async () => {
  const spots = await ev(() => window.__world.spots.map(s => ({ n: s.name, x: s.x, z: s.z, r: s.r, b: s.bonus })));
  say('SPOTS (' + spots.length + '):');
  for (const s of spots) say('   ', JSON.stringify(s));
};

tests.grinds = async () => {
  // Unit-test the grind snap on EVERY registered edge (not one per name): drop the skater in
  // just above the middle of the edge, descending, moving along it. If that misses, the edge
  // is unusable no matter how well the player ollies.
  const r = await ev(() => {
    const bad = [], counts = new Map();
    for (const e of window.__world.collide.all.edges) {
      const key = (e.name || '(unnamed)') + ' [' + e.kind + ']';
      const c = counts.get(key) || { n: 0, miss: 0 }; c.n++; counts.set(key, c);
      const dx = (e.bx - e.ax) / e.len, dz = (e.bz - e.az) / e.len;
      const mx = (e.ax + e.bx) / 2, mz = (e.az + e.bz) / 2, my = (e.ay + e.by) / 2;
      window.__air(mx - dx * 0.6, my + 0.3, mz - dz * 0.6, Math.atan2(-dx, -dz), dx * 5, -1.5, dz * 5);
      let ok = false;
      for (let i = 0; i < 30 && !ok; i++) { window.__sim(1 / 60); if (window.__dbg().state === 'grind') ok = true; }
      if (!ok) c.miss++;
    }
    for (const [k, c] of counts) if (c.miss) bad.push(`${k} ${c.miss}/${c.n} missed`);
    return { total: [...counts.values()].reduce((a, c) => a + c.n, 0), names: counts.size, bad };
  });
  say(`GRIND snap: ${r.total} edges, ${r.names} names, ${r.bad.length} name(s) with misses`);
  for (const b of r.bad) say('   ', b);
};

tests.edges = async () => {
  // world confine at every corner
  for (const [x, z] of [[-9999, 0], [9999, 0], [0, -9999], [0, 9999]]) {
    await tp(0, 0, 0, 0);
    await ev(([x, z]) => { window.__world && (window.__sim(0.02)); }, x, z);
  }
  const play = await ev(() => window.__world.play);
  say('PLAY bounds:', JSON.stringify(play));
  for (const [n, x, z, yaw] of [['W', play.minX + 20, 0, Math.PI / 2], ['E', play.maxX - 20, 0, -Math.PI / 2], ['N', 0, play.minZ + 20, 0], ['S', 0, play.maxZ - 20, Math.PI]]) {
    await tp(x, z, yaw, 8); await sim(8, ['ArrowUp']);
    const d = await dbg();
    say(`CONFINE ${n}: pos=${d.pos} state=${d.state}`);
  }
};

tests.tricks = async () => {
  await tp(-11, -60, Math.PI, 0);
  await sim(3, ['ArrowUp']);
  const before = await dbg();
  await sim(0.4, ['Space']); await sim(0.05, ['KeyJ']); await sim(2, []);
  say('KICKFLIP:', JSON.stringify(await dbg()), 'from', JSON.stringify(before.pos));
  await tp(-11, -60, Math.PI, 0); await sim(3, ['ArrowUp']);
  const h = await ev(() => { window.__sim(0.45, ['Space']); let peak = 0, y0 = window.__dbg().pos[1]; for (let i = 0; i < 90; i++) { window.__sim(1 / 60); peak = Math.max(peak, window.__dbg().pos[1] - y0); } return +peak.toFixed(2); });
  say('OLLIE full-charge height (m):', h);
  const h2 = await ev(() => { window.__tp(-11, -60, Math.PI, 6); window.__sim(0.08, ['Space']); let peak = 0, y0 = window.__dbg().pos[1]; for (let i = 0; i < 90; i++) { window.__sim(1 / 60); peak = Math.max(peak, window.__dbg().pos[1] - y0); } return +peak.toFixed(2); });
  say('OLLIE tap height (m):', h2);
  // manual
  await tp(-11, -60, Math.PI, 0); await sim(3, ['ArrowUp']);
  const man = await ev(() => { window.__sim(0.3, ['Space']); for (let i = 0; i < 30; i++) window.__sim(1 / 60); let sawManual = false; for (let i = 0; i < 240; i++) { window.__sim(1 / 60, ['ShiftLeft']); if (window.__dbg().state === 'manual') sawManual = true; } return { sawManual, end: window.__dbg() }; });
  say('MANUAL through a landing:', JSON.stringify(man));
};

tests.car = async () => {
  // ollie onto the nearest parked car deck from the road beside it
  const r = await ev(() => {
    const cars = window.__world.collide.all.surfaces.filter(s => s.name === 'Parked car');
    const out = { total: cars.length / 2, landed: 0, tried: 0, decks: [] };
    for (let i = 0; i < cars.length && out.tried < 8; i += 2) {
      const c = cars[i];                       // the low deck
      const g = window.__world.collide.groundAt(c.x + Math.cos(c.yaw) * 4, c.z - Math.sin(c.yaw) * 4, 200, 300);
      out.decks.push(+(c.top - g.y).toFixed(2));
      out.tried++;
      // drop straight down onto the deck from 3 m up, no horizontal speed
      window.__air(c.x, c.top + 2.5, c.z, c.yaw, 0.2, -1, 0);
      let ok = false;
      for (let k = 0; k < 90 && !ok; k++) { window.__sim(1 / 60); const d = window.__dbg(); if (d.state === 'ride' && d.ground === 'car') ok = true; if (d.state === 'bail') break; }
      if (ok) out.landed++;
    }
    return out;
  });
  say(`PARKED CARS: ${r.total} cars · landed on ${r.landed}/${r.tried} decks · deck heights above the road ${r.decks.join(', ')}`);
  const oll = await ev(() => {
    const cars = window.__world.collide.all.surfaces.filter(s => s.name === 'Parked car');
    for (let i = 0; i < cars.length; i += 2) {
      const c = cars[i];
      const rx = Math.cos(c.yaw), rz = -Math.sin(c.yaw);        // across the car
      for (const sgn of [-1, 1]) {                             // whichever side is the travel lane
        window.__tp(c.x + rx * sgn * 7, c.z + rz * sgn * 7, Math.atan2(rx * sgn, rz * sgn), 7);
        window.__sim(0.5, ['Space']);
        for (let k = 0; k < 90; k++) { window.__sim(1 / 60); const d = window.__dbg(); if (d.state === 'ride' && d.ground === 'car') return { ok: 1, at: d.pos }; if (d.state !== 'air') break; }
      }
    }
    return { ok: 0 };
  });
  say('OLLIE onto a parked car from the road:', oll.ok ? 'landed at ' + oll.at : 'never landed on one');
};

tests.hazards = async () => {
  // A bail must always recover to a rideable state, wherever it happens.
  const r = await ev(() => {
    const spots = [[-40, 130], [-11, -250], [0, 0], [-14, 90], [-70, 66]];
    const out = [];
    for (const [x, z] of spots) {
      window.__tp(x, z, Math.PI, 9);
      window.__sim(1 / 60);
      window.__world.collide;                     // no-op, keeps the closure honest
      // force a bail and let it play out
      let sawBail = false;
      for (let i = 0; i < 900; i++) { window.__sim(1 / 60, i === 0 ? ['ArrowUp'] : []); const d = window.__dbg(); if (d.state === 'bail') sawBail = true; if (sawBail && d.state === 'ride') break; }
      const d = window.__dbg();
      out.push({ at: [x, z], sawBail, end: d.state, y: d.pos[1] });
    }
    return out;
  });
  for (const o of r) say('HAZARD run', JSON.stringify(o));
};

tests.perf = async () => {
  const pts = [[-16, -360], [-13, -250], [-8, -120], [0, 0], [5, 120], [-100, 60], [-300, 8], [-14, 90]];
  let maxC = 0, maxT = 0;
  for (const [x, z] of pts) {
    await tp(x, z, Math.PI, 0); await sim(0.2);
    const d = await dbg(); maxC = Math.max(maxC, d.drawCalls); maxT = Math.max(maxT, d.tris);
    say(`PERF @${x},${z} loc="${d.loc}" calls=${d.drawCalls} tris=${d.tris}`);
  }
  say('PERF worst:', maxC, 'calls', maxT, 'tris', mobile ? '(mobile)' : '(desktop)');
};

const all = want.length ? want : Object.keys(tests);
for (const t of all) { if (!tests[t]) { say('no such test', t); continue; } say('\n===== ' + t.toUpperCase() + ' ====='); await tests[t](); }
say('\nERRORS:', errors.length ? errors.slice(0, 15).join('\n') : 'none');
await browser.close();
