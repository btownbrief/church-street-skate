// Headless playtest: boots the game, presses keys, takes screenshots, reports console errors.
// usage: node scripts/shot.mjs [outPrefix] [mobile]
import { createRequire } from 'module';
const require = createRequire('/Users/stephendavis/.npm/_npx/705bc6b22212b352/node_modules/playwright/package.json');
const { chromium, devices } = require('playwright');
const out = process.argv[2] || '/private/tmp/claude-501/-Users-stephendavis/f0025184-3473-4051-93a3-42606d48d121/scratchpad/shot';
const mobile = process.argv[3] === 'mobile';
const url = process.env.URL || 'http://localhost:8765/index.html';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext(mobile ? { ...devices['iPhone 13'], hasTouch: true } : { viewport: { width: 1280, height: 720 } });
const page = await ctx.newPage();
const errors = [];
page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.type() + ': ' + m.text()); });
page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message + '\n' + (e.stack||'').split('\n').slice(0,4).join('\n')));
if (process.env.SKIP) { const skip = process.env.SKIP.split(','); await page.route(/\/js\/.*\.js$/, (route) => { const u = route.request().url(); if (skip.some(k => u.endsWith('/js/' + k + '.js'))) route.abort(); else route.continue(); }); }
await page.goto(url); 
await page.waitForFunction(() => !document.querySelector('#btn-play').disabled, null, { timeout: 120000 }).catch(e => errors.push('boot timeout'));
const loading = await page.textContent('#loading').catch(()=>'');
console.log('LOADING:', loading);
await page.screenshot({ path: out + '-0-title.png' });
await page.click('#btn-play');
await page.waitForTimeout(600);
await page.screenshot({ path: out + '-1-start.png' });
const script = process.env.SCRIPT || 'push:1500,shot,ollie:300,wait:800,shot,push:1500,flip,wait:900,shot,left:600,shot';
let i = 2;
for (const step of script.split(',')) {
  const [cmd, arg] = step.split(':'); const ms = +arg || 0;
  if (cmd === 'push') { await page.keyboard.down('ArrowUp'); await page.waitForTimeout(ms); await page.keyboard.up('ArrowUp'); }
  else if (cmd === 'left' || cmd === 'right') { await page.keyboard.down(cmd === 'left' ? 'ArrowLeft' : 'ArrowRight'); await page.waitForTimeout(ms); await page.keyboard.up(cmd === 'left' ? 'ArrowLeft' : 'ArrowRight'); }
  else if (cmd === 'ollie') { await page.keyboard.down('Space'); await page.waitForTimeout(ms || 250); await page.keyboard.up('Space'); }
  else if (cmd === 'flip') { await page.keyboard.press('KeyJ'); }
  else if (cmd === 'shove') { await page.keyboard.press('KeyL'); }
  else if (cmd === 'brake') { await page.keyboard.down('ArrowDown'); await page.waitForTimeout(ms); await page.keyboard.up('ArrowDown'); }
  else if (cmd === 'wait') { await page.waitForTimeout(ms); }
  else if (cmd === 'key') { await page.keyboard.press(arg); }
  else if (cmd === 'shot') { await page.screenshot({ path: `${out}-${i++}.png` }); }
  else if (cmd === 'tp') { const [x, z, yaw, sp] = arg.split('/').map(Number); await page.evaluate(([x, z, yaw, sp]) => window.__tp(x, z, yaw, sp), [x, z, yaw, sp]); }
  else if (cmd === 'top') { const [x, z, h] = arg.split('/').map(Number); await page.evaluate(([x, z, h]) => window.__topdown(x, z, h), [x, z, h]); await page.waitForTimeout(200); }
  else if (cmd === 'state') { const s = await page.evaluate(() => window.__dbg ? window.__dbg() : 'no dbg'); console.log('STATE:', JSON.stringify(s)); }
}
const st = await page.evaluate(() => window.__dbg ? window.__dbg() : null); console.log('FINAL:', JSON.stringify(st));
console.log('ERRORS:', errors.length ? errors.slice(0, 12).join('\n') : 'none');
await browser.close();
