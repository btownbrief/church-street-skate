// Builder D playtest: teleports around downtown, screenshots pedestrians / cafés /
// traffic, and drives the skater into a pedestrian and into a car to test the bails.
// usage: node scripts/shot-npc.mjs [outPrefix] [mobile]
import { createRequire } from 'module';
const require = createRequire('/Users/stephendavis/.npm/_npx/705bc6b22212b352/node_modules/playwright/package.json');
const { chromium, devices } = require('playwright');
const out = process.argv[2] || '/private/tmp/claude-501/-Users-stephendavis/f0025184-3473-4051-93a3-42606d48d121/scratchpad/npc';
const mobile = process.argv[3] === 'mobile';
const url = process.env.URL || 'http://localhost:8765/index.html?npcdebug=1';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext(mobile ? { ...devices['iPhone 13'], hasTouch: true } : { viewport: { width: 1280, height: 720 } });
const page = await ctx.newPage();
const errors = [];
page.on('console', m => { const t = m.text(); if (/GPU stall|skipping \.\//.test(t)) return; if (m.type() === 'error' || m.type() === 'warning') errors.push(m.type() + ': ' + t); });
page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message + '\n' + (e.stack || '').split('\n').slice(0, 4).join('\n')));
await page.goto(url);
await page.waitForFunction(() => !document.querySelector('#btn-play').disabled, null, { timeout: 120000 }).catch(() => errors.push('boot timeout'));
await page.click('#btn-play');
await page.waitForTimeout(500);

// expose a probe into the npc/traffic state via the renderer scene
await page.evaluate(() => {
  window.__probe = () => {
    const r = window.__dbg();
    return r;
  };
});

const tp = (x, z, yaw, sp) => page.evaluate(([x, z, yaw, sp]) => window.__tp(x, z, yaw, sp), [x, z, yaw, sp]);
const shot = (n) => page.screenshot({ path: `${out}-${n}.png` });
const wait = (ms) => page.waitForTimeout(ms);

const S = 1.4;   // yaw pointing roughly down the mall (+z, south)
const NORTH = 0, SOUTH = Math.PI;

// 1. mall at Leunig's corner (Church & College) looking north up the mall
await tp(0, -6, NORTH, 0); await wait(1400); await shot('1-leunigs');
// 2. mall between Bank and College — busker block
await tp(-4, -128, NORTH, 0); await wait(1400); await shot('2-bank-busker');
// 3. mall top block, Cherry
await tp(-11, -250, SOUTH, 0); await wait(1400); await shot('3-cherry');
// 4. City Hall block, Main St crossing — cars
await tp(6, 122, NORTH, 0); await wait(1600); await shot('4-main-crossing');
// 5. St Paul St (bus route + parked cars)
await tp(-118, 40, NORTH, 0); await wait(1600); await shot('5-stpaul');
// 6. Cherry St looking east
await tp(-40, -244, -Math.PI / 2, 0); await wait(1600); await shot('6-cherry-st');
// 7. College St
await tp(-60, 2, Math.PI / 2, 0); await wait(1600); await shot('7-college');

// 7c/7d. parked-car curbs on the cross streets either side of the mall
await tp(34, -122, -Math.PI / 2, 0); await wait(1600); await shot('7c-bank-parked');
await tp(-52, 2, Math.PI / 2, 0); await wait(1600); await shot('7d-college-parked');
await tp(-11, -300, Math.PI, 0); await wait(1600); await shot('7e-topblock');
// 7f. stand still beside the busker's pitch and let the crowd walk past the camera
await tp(-2.5, -131, Math.PI / 2, 0); await wait(4000); await shot('7f-busker');
await wait(2500); await shot('7g-crowd');
// 7h. the ambassador patrols the College block
await tp(-2, -40, Math.PI, 0); await wait(3500); await shot('7h-ambassador');
console.log('MID:', JSON.stringify(await page.evaluate(() => window.__dbg())));

// 8. ride hard down the mall into the crowd → expect an npc bail
await tp(-6, -160, SOUTH, 0); await wait(400);
await page.keyboard.down('ArrowUp'); await wait(2600);
await shot('8-riding');
await wait(2400);
await page.keyboard.up('ArrowUp');
await shot('9-after-ride');
console.log('AFTER RIDE:', JSON.stringify(await page.evaluate(() => window.__dbg())));

// 9. aim straight at the nearest pedestrian and ride into them
let bailed = null;
for (let i = 0; i < 30 && !bailed; i++) {
  const st = await page.evaluate(() => window.__dbg());
  const t = await page.evaluate(([x, z]) => window.__npcDbg(x, z), [st.pos[0], st.pos[2]]);
  if (!t) { console.log('no npcDbg'); break; }
  if (i === 0) { console.log('NPC POOL:', JSON.stringify(t)); await tp(t.x + 2.2, t.z + 2.6, Math.atan2(-(t.x - (t.x + 2.2)), -(t.z - (t.z + 2.6))), 0); await wait(900); await shot('7b-closeup'); }
  // start 7 m short of them on the same line, moving at 9 m/s straight in
  const ang = Math.atan2(-(t.x - st.pos[0]), -(t.z - st.pos[2]));
  const sx = t.x + Math.sin(ang) * 3.4, sz = t.z + Math.cos(ang) * 3.4;
  await tp(sx, sz, ang, 11);
  for (let k = 0; k < 10; k++) {
    await wait(50);
    const s2 = await page.evaluate(() => window.__dbg());
    if (s2.state === 'bail') { bailed = s2; break; }
  }
}
console.log('NPC BAIL:', bailed ? JSON.stringify(bailed) : 'none seen');
if (bailed) { await shot('10-npc-bail'); await wait(500); await shot('10b-npc-bail'); }

// 10. step in front of a moving car — it must brake and honk, not plough on
let carStop = null;
for (let i = 0; i < 14 && !carStop; i++) {
  const st = await page.evaluate(() => window.__dbg());
  const c = await page.evaluate(([x, z]) => window.__carDbg(x, z), [st.pos[0], st.pos[2]]);
  if (!c) { console.log('no carDbg'); break; }
  if (i === 0) console.log('CAR POOL:', JSON.stringify({ n: c.n, parked: c.parked, nearest: +c.d.toFixed(1), bus: c.bus }));
  // stand 14 m in front of it, in its lane
  await tp(c.x + c.ux * 14, c.z + c.uz * 14, Math.atan2(c.ux, c.uz), 0);
  for (let k = 0; k < 26; k++) {
    await wait(120);
    const c2 = await page.evaluate(([x, z]) => window.__carDbg(x, z), [c.x + c.ux * 14, c.z + c.uz * 14]);
    const s2 = await page.evaluate(() => window.__dbg());
    if (c2 && c2.d < 12 && c2.v < 0.6) { carStop = { d: +c2.d.toFixed(1), v: +c2.v.toFixed(2), blocked: +c2.blocked.toFixed(1) }; break; }
    if (s2.state === 'bail') { carStop = { hitAndBailed: true }; break; }
  }
}
console.log('CAR YIELD:', carStop ? JSON.stringify(carStop) : 'no car came');
await shot('11-in-the-road');

// 11. get run over on purpose: stand on Main St and wait
await tp(-30, 131, 0, 0); await wait(6000); await shot('12-main-st');
console.log('ROAD:', JSON.stringify(await page.evaluate(() => window.__dbg())));

console.log('FINAL:', JSON.stringify(await page.evaluate(() => window.__dbg())));
console.log('ERRORS:', errors.length ? errors.slice(0, 12).join('\n') : 'none');
void S;
await browser.close();
