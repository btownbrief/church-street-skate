// Mobile UI check: boots on an iPhone 13 profile (landscape by default, `portrait` for the
// other way up), drives the real touch stick and buttons, and reports whether every control
// is reachable and non-overlapping. Screenshots to OUT.
//   node scripts/shot-mobile.mjs [outPrefix] [portrait]
import { createRequire } from 'module';
const require = createRequire('/Users/stephendavis/.npm/_npx/705bc6b22212b352/node_modules/playwright/package.json');
const { chromium, devices } = require('playwright');

const out = process.argv[2] || '/private/tmp/claude-501/-Users-stephendavis/f0025184-3473-4051-93a3-42606d48d121/scratchpad/mob';
const portrait = process.argv.includes('portrait');
const profile = devices[portrait ? 'iPhone 13' : 'iPhone 13 landscape'];

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await browser.newContext({ ...profile, hasTouch: true });
const page = await ctx.newPage();
const errors = [];
page.on('console', (m) => { const t = m.text(); if ((m.type() === 'error' || m.type() === 'warning') && !/GL Driver/.test(t)) errors.push(m.type() + ': ' + t); });
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));

await page.goto(process.env.URL || 'http://localhost:8765/index.html');
await page.waitForFunction(() => !document.querySelector('#btn-play').disabled, null, { timeout: 180000 });
console.log('viewport', JSON.stringify(page.viewportSize()));
await page.screenshot({ path: out + '-0-title.png', timeout: 120000 });
await page.tap('#btn-play');
await page.waitForTimeout(700);

// --- layout audit -----------------------------------------------------------
const layout = await page.evaluate(() => {
  const R = (sel) => { const e = document.querySelector(sel); if (!e) return null; const r = e.getBoundingClientRect(); return { sel, x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), vis: getComputedStyle(e).display !== 'none' }; };
  const sels = ['#b-ollie', '#b-flip', '#b-shove', '#b-grab', '#stick-base', '#minimap', '#speed', '#hud-score', '#hud-loc', '#btn-map', '#btn-pause', '#hint'];
  return { vw: innerWidth, vh: innerHeight, boxes: sels.map(R).filter(Boolean), touch: document.body.classList.contains('touch'), hint: document.body.classList.contains('show-hint') };
});
console.log('touch class:', layout.touch, '· first-play hint:', layout.hint);
const { vw, vh } = layout;
const problems = [];
for (const b of layout.boxes) {
  if (!b.vis) continue;
  if (b.x < 0 || b.y < 0 || b.x + b.w > vw + 1 || b.y + b.h > vh + 1) problems.push(`${b.sel} off-screen (${b.x},${b.y} ${b.w}x${b.h} in ${vw}x${vh})`);
}
const btns = layout.boxes.filter((b) => b.vis && (b.sel.startsWith('#b-') || b.sel === '#btn-map' || b.sel === '#btn-pause'));
for (const b of btns) if (Math.min(b.w, b.h) < 40) problems.push(`${b.sel} smaller than a 40 px thumb target (${b.w}x${b.h})`);
const over = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const hudBoxes = layout.boxes.filter((b) => b.vis && ['#minimap', '#speed', '#hud-score', '#hud-loc', '#hint'].includes(b.sel));
for (const t of btns) for (const h of hudBoxes) if (over(t, h)) problems.push(`${t.sel} overlaps ${h.sel}`);
for (let i = 0; i < btns.length; i++) for (let j = i + 1; j < btns.length; j++) if (over(btns[i], btns[j])) problems.push(`${btns[i].sel} overlaps ${btns[j].sel}`);
const stick = layout.boxes.find((b) => b.sel === '#stick-base');
if (stick && stick.x + stick.w / 2 > vw / 2) problems.push('stick is not on the left half');
console.log('LAYOUT', problems.length ? problems.join('\n         ') : 'ok');
for (const b of layout.boxes) console.log('   ', b.sel.padEnd(12), `${b.x},${b.y} ${b.w}x${b.h}`, b.vis ? '' : '(hidden)');

// --- drive it with real touches --------------------------------------------
const box = async (sel) => (await page.locator(sel).boundingBox());
const stickBox = await box('#stick-base');
const cx = stickBox.x + stickBox.width / 2, cy = stickBox.y + stickBox.height / 2;

// push: hold the stick up for a while
await page.touchscreen.tap(cx, cy);                     // wakes the stick zone
const before = await page.evaluate(() => window.__dbg());
await page.evaluate(([x, y]) => {
  const zone = document.querySelector('#stick-zone');
  const t = (id, cx, cy) => new Touch({ identifier: id, target: zone, clientX: cx, clientY: cy });
  const fire = (type, cx, cy) => { const tt = [t(1, cx, cy)]; zone.dispatchEvent(new TouchEvent(type, { touches: type === 'touchend' ? [] : tt, changedTouches: tt, targetTouches: type === 'touchend' ? [] : tt, bubbles: true, cancelable: true })); };
  fire('touchstart', x, y); fire('touchmove', x, y - 60);
  window.__stickRelease = () => fire('touchend', x, y - 60);
}, [cx, cy]);
await page.waitForTimeout(1800);
const midStick = await page.evaluate(() => ({ steer: +window.__inputSteer, dbg: window.__dbg() }));
const rolling = await page.evaluate(() => window.__dbg());
console.log('STICK push → speed', Math.hypot(rolling.vel[0], rolling.vel[2]).toFixed(2), 'm/s (was', Math.hypot(before.vel[0], before.vel[2]).toFixed(2) + ')');
await page.screenshot({ path: out + '-1-riding.png', timeout: 120000 });

// ollie with the big button
const ob = await box('#b-ollie');
await page.touchscreen.tap(ob.x + ob.width / 2, ob.y + ob.height / 2);
await page.waitForTimeout(500);
const air = await page.evaluate(() => window.__dbg());
console.log('OLLIE button → state', air.state);
await page.waitForTimeout(900);
const hintGone = await page.evaluate(() => !document.body.classList.contains('show-hint'));
console.log('first-play hint cleared after the ollie:', hintGone);
await page.screenshot({ path: out + '-2-ollie.png', timeout: 120000 });

// flip + shove
for (const sel of ['#b-flip', '#b-shove', '#b-grab']) {
  const b = await box(sel);
  await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2);
  await page.waitForTimeout(180);
}
await page.evaluate(() => window.__stickRelease && window.__stickRelease());
await page.waitForTimeout(400);
await page.screenshot({ path: out + '-3-tricks.png', timeout: 120000 });

// pause screen
await page.tap('#btn-pause');
await page.waitForTimeout(300);
await page.screenshot({ path: out + '-4-pause.png', timeout: 120000 });
const pauseFits = await page.evaluate(() => { const c = document.querySelector('#screen-pause .card'); const r = c.getBoundingClientRect(); return { top: Math.round(r.top), bottom: Math.round(r.bottom), vh: innerHeight, scrolls: c.scrollHeight > c.clientHeight }; });
console.log('PAUSE card', JSON.stringify(pauseFits));

console.log('FINAL', JSON.stringify(await page.evaluate(() => window.__dbg())));
console.log('ERRORS:', errors.length ? errors.slice(0, 10).join('\n') : 'none');
await browser.close();
