// Boot, screens, main loop, quality tiers.
import * as THREE from '../vendor/three.module.min.js';
import { CFG } from './config.js';
import { Input } from './input.js';
import { Skater } from './skate.js';
import { SkaterMesh } from './skater-mesh.js';
import { FollowCamera } from './camera.js';
import { Hud } from './hud.js';
import { Audio } from './audio.js';
import { buildWorld } from './world.js';
import { Challenges } from './challenges.js';
import { GapTracker } from './gaps.js';
import { isMobile, isTouch, storeGet, storeSet } from './util.js';
import { installDev } from './devhooks.js';
import { lbEnabled, getName, playerId, submitScore, renamePlayer, fetchTop, monthLabel } from './leaderboard.js';

const $ = (s) => document.querySelector(s);
const mobile = isMobile(); const touch = isTouch();
if (touch) document.body.classList.add('touch');

const canvas = $('#c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: !mobile, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, mobile ? 1.5 : 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;
const quality = { tier: mobile ? 1 : 2, shadows: !mobile, npcs: mobile ? 0.5 : 1, traffic: mobile ? 0.7 : 1, mobile };
renderer.shadowMap.enabled = quality.shadows; renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(CFG.camFov, innerWidth / innerHeight, 0.2, mobile ? 520 : 900);
scene.add(camera);

const input = new Input();
const audio = new Audio();
let world, skater, mesh, follow, hud, chal, gaps, running = false, paused = false, last = performance.now(), fpsAcc = 0, fpsN = 0, lowFpsT = 0;
let locTimer = 0, curLoc = '';
// 2-MINUTE RUN. main.js owns the whole thing: skate.js only ever sees a normal input
// object, and never learns there is a clock.
let mode = 'free', runLeft = 0, runOver = false, frozen = false;
let autopilot = null, evTap = null;   // headless-playtest hooks (js/devhooks.js)

const how = touch
  ? `<b>Left side</b>: drag to steer, push up to skate · <b>OLLIE</b> hold &amp; release for height · <b>FLIP</b>/<b>SHOVE</b> in the air (both = 360 flip) · steer in the air to spin · land on ledges &amp; rails to grind, steer to balance · <b>GRAB</b> in the air, hold it through the landing to manual · prefer flicking? Pause → <b>Tricks: flick pad</b> — pull back &amp; flick up to ollie, ↖ kickflip, ↗ heelflip, ←/→ shove-it, two fingers = signature`
  : `<kbd>W/↑</kbd> push · <kbd>S/↓</kbd> brake · <kbd>A/D</kbd> steer (and spin in the air) · <kbd>Space</kbd> hold &amp; release to ollie · <kbd>J</kbd> kickflip · <kbd>K</kbd> heelflip · <kbd>L</kbd> shove-it (<kbd>J</kbd>+<kbd>L</kbd> = 360 flip) · <kbd>Shift</kbd> grab in the air, hold it through the landing to manual (with <kbd>S</kbd> = nose manual) · land on a ledge or rail to grind, steer to balance · <kbd>C</kbd> camera · <kbd>M</kbd> map · <kbd>R</kbd> respawn · <kbd>P</kbd> pause`;
$('#how').innerHTML = how;

async function boot() {
  $('#btn-play').disabled = true;
  try {
    world = await buildWorld({ scene, renderer, camera, quality });
  } catch (e) { console.error(e); $('#loading').textContent = 'Something broke while building the city: ' + e.message; throw e; }
  window.__world = world;
  const sp = world.spawn;
  skater = new Skater(world.collide, sp); skater.spots = world.spots;
  chal = new Challenges(skater);
  gaps = new GapTracker();
  mesh = new SkaterMesh(scene, quality.shadows);
  follow = new FollowCamera(camera, world.collide); follow.reset(skater);
  hud = new Hud($('#hud'), world.info);
  hud.letters = world.letters || null;
  hud.el.btnPause.addEventListener('click', () => setPaused(true));
  input.bindTouch({ stickZone: $('#stick-zone'), stickKnob: $('#stick-knob'), buttons: { ollie: $('#b-ollie'), flipA: $('#b-flip'), shove: $('#b-shove'), grab: $('#b-grab') } });
  input.bindFlickPad({ zone: $('#flick-zone'), knob: $('#flick-knob') });
  $('#loading').textContent = `Downtown loaded — ${world.stats}`;
  $('#btn-play').disabled = false;
  renderer.render(scene, camera);
  installDev({ world, skater, follow, camera, renderer, scene, input, gaps, step: stepGame,
    setAutopilot: (f) => { autopilot = f; }, setTap: (f) => { evTap = f; },
    setRunning: (v) => { running = v; }, setLoc: (v) => { curLoc = v; }, getLoc: () => curLoc });
}

function start(m = 'free') {
  audio.ensure(); $('#screen-title').classList.remove('on'); $('#screen-results').classList.remove('on');
  mode = m; runOver = false; frozen = false; runLeft = CFG.runSeconds;
  document.body.classList.toggle('run', m === 'run');
  if (m === 'run') {
    const sp = world.spawn;
    skater.resetScore(); skater.respawn(sp.x, sp.y, sp.z, sp.yaw); follow.reset(skater); locTimer = 0;
    hud.shownScore = 0; hud.el.score.textContent = '0';
  }
  hud.setTimer(m === 'run' ? runLeft : null);
  running = true; paused = false; last = performance.now();
  // first-play touch hint: shown until the player's first ollie, then never again
  if (touch && !storeGet('css-ollied')) document.body.classList.add('show-hint');
  requestAnimationFrame(frame);
}

// The buzzer: bank whatever was still in the air, stop taking input, show the card.
function endRun() {
  runOver = true; frozen = true; runLeft = 0; hud.setTimer(0);
  if (skater.combo.length) skater.bankCombo();
  input.resetAll();
  const s = skater.session;
  $('#res-score').textContent = skater.score.toLocaleString();
  $('#res-stats').innerHTML = `best combo <b>${s.bestCombo.toLocaleString()}</b> · ${s.tricks} tricks · ${s.gaps} gaps<br>${s.bails} bails${s.bestWreck ? ` · worst wreck <b>${s.bestWreck.toLocaleString()}</b>` : ''} · top speed ${Math.round(s.topSpeed * 2.237)} mph`;
  $('#screen-results').classList.add('on');
  audio.handle({ type: 'spotFirst' });
  updateLeaderboard(skater.score);
}
function setPaused(p) {
  paused = p; $('#screen-pause').classList.toggle('on', p); if (p) input.resetAll();
  if (p) {
    const s = skater.session;
    $('#stats').innerHTML = `Score <b>${skater.score.toLocaleString()}</b> · best combo <b>${s.bestCombo.toLocaleString()}</b><br>${s.tricks} tricks · ${s.bails} bails · ${(s.dist / 1609).toFixed(2)} mi skated · top speed ${Math.round(s.topSpeed * 2.237)} mph<br>Worst wreck <b>${s.bestWreck.toLocaleString()}</b> · gaps cleared ${s.gaps}<br>Spots found: ${skater.spotsHit.size}/${skater.spots.length}`;
    $('#spots-list').innerHTML = skater.spots.map(sp => `<div class="${skater.spotsHit.has(sp.name) ? 'hit' : ''}">${sp.name}</div>`).join('');
    $('#gaps-count').textContent = `${gaps.found.size}/${gaps.total}`;
    $('#gaps-list').innerHTML = gaps.list.map(g => `<div class="${gaps.found.has(g.name) ? 'hit' : ''}">${g.name}</div>`).join('');
    $('#chal-list').innerHTML = chal.list.map(c => { const done = chal.done.has(c.id); return `<div class="${done ? 'hit' : ''}"><b>${done ? '✔' : '○'} ${c.name}</b><i>${c.hint}</i></div>`; }).join('');
    $('#btn-mute').textContent = 'Sound: ' + (audio.muted ? 'off' : 'on');
  } else { last = performance.now(); }
}
$('#btn-play').addEventListener('click', () => start('free'));
$('#btn-run').addEventListener('click', () => start('run'));
$('#btn-again').addEventListener('click', () => start('run'));
$('#btn-free').addEventListener('click', () => start('free'));
$('#btn-resume').addEventListener('click', () => setPaused(false));
$('#btn-respawn').addEventListener('click', () => { const sp = world.spawn; skater.respawn(sp.x, sp.y, sp.z, sp.yaw); follow.reset(skater); locTimer = 0; setPaused(false); });
$('#btn-mute').addEventListener('click', () => { $('#btn-mute').textContent = 'Sound: ' + (audio.toggleMute() ? 'off' : 'on'); });
// FLICK PAD toggle (touch only — the button is display:none on desktop). Persisted so a
// player who prefers it gets it back next session. Keyboard and gamepad are untouched.
let flickMode = touch && storeGet('css-flick') === '1';
const applyFlick = () => {
  document.body.classList.toggle('flick', flickMode);
  $('#btn-flick').textContent = 'Tricks: ' + (flickMode ? 'flick pad' : 'buttons');
  $('#hint').innerHTML = flickMode
    ? '<b>Push</b> — flick the left stick up · <b>Ollie</b> — pull back on the pad, flick up'
    : '<b>Push</b> — flick the stick up · <b>OLLIE</b> — hold, then let go';
};
applyFlick();
$('#btn-flick').addEventListener('click', () => { flickMode = !flickMode; storeSet('css-flick', flickMode ? '1' : '0'); applyFlick(); });
window.addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });
renderer.setSize(innerWidth, innerHeight);
document.addEventListener('visibilitychange', () => { if (document.hidden && running && !paused) setPaused(true); });

function stepGame(dt, now) {
  input.poll();
  if (autopilot) autopilot(input, skater, dt);
  // after the buzzer the skater coasts to a stop: everything held is dropped every frame
  if (frozen) input.resetAll();
  if (input.pause) { setPaused(true); input.endFrame(); return false; }
  if (input.reset) { const g = skater.lastGround; skater.respawn(g.x, g.y + 0.05, g.z); follow.reset(skater); input.resetAll(); locTimer = 0; }
  if (input.cam) follow.mode = (follow.mode + 1) % 3;
  if (input.map) hud.toggleMap();
  skater.update(dt, input);
  world.confine(skater);
  world.update(dt, skater);
  // NB: gaps.handle() pushes a 'gap' event and a combo entry back onto skater.events while
  // we are iterating it. That is deliberate and safe — a for..of re-checks length each step,
  // so the appended events get handled in this same pass before the queue is cleared.
  for (const ev of skater.events) {
    if (ev.type === 'land') gaps.handle(ev, skater);
    // CAR HOP: clearing vehicles pays, and clearing several pays much more. Landing on a
    // car doesn't count (groundKind 'car') — over means over.
    if (ev.type === 'land' && ev.airTime > 0.25 && skater.groundKind !== 'car') {
      const n = world.carsCleared(ev.fromX, ev.fromZ, ev.x, ev.z);
      if (n > 0) skater.addTrickPending({ name: n === 1 ? 'Car Hop' : n + '-Car Hop', pts: 120 * n + 80 * n * (n - 1) });
    }
    hud.handle(ev, skater); audio.handle(ev); chal.handle(ev, skater); if (evTap) evTap(ev, skater);
    if (ev.type === 'bail') follow.kick(ev.why === 'wall' || ev.why === 'car' ? 1.2 : 0.7);
    if (ev.type === 'land' && ev.speed > 8) follow.kick(0.25);
    if (ev.type === 'maple') { mesh.leafBurst(skater.pos); follow.kick(0.4); }
    if (ev.type === 'stomp') { mesh.stompBurst(skater.pos); follow.kick(0.5); }
    if (ev.type === 'gap') follow.kick(0.3);
    if (ev.type === 'pop' && document.body.classList.contains('show-hint')) {
      document.body.classList.add('hint-out');
      storeSet('css-ollied', '1');
      setTimeout(() => document.body.classList.remove('show-hint', 'hint-out'), 700);
    }
  }
  skater.events.length = 0;
  chal.update(dt, skater);
  for (const c of chal.justDone) { hud.callout('CHALLENGE: ' + c.name, chal.remaining ? `${chal.remaining} to go` : 'that is all of them'); audio.handle({ type: 'spotFirst' }); }
  chal.justDone.length = 0;
  mesh.update(dt, skater, now / 1000);
  follow.update(dt, skater);
  locTimer -= dt; if (locTimer <= 0) { locTimer = 0.4; curLoc = world.locationName(skater.pos.x, skater.pos.z); }
  if (mode === 'run' && !runOver) { runLeft -= dt; hud.setTimer(runLeft); if (runLeft <= 0) endRun(); }
  hud.update(dt, skater, curLoc);
  audio.update(dt, skater);
  input.endFrame();
  return true;
}

function frame(now) {
  if (!running) return;
  requestAnimationFrame(frame);
  let dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (paused) return;
  if (!stepGame(dt, now)) return;
  renderer.render(scene, camera);
  // adaptive quality
  fpsAcc += dt; fpsN++;
  if (fpsAcc > 2) { const fps = fpsN / fpsAcc; fpsAcc = 0; fpsN = 0;
    if (fps < 40) { lowFpsT++; if (lowFpsT >= 2) { lowFpsT = 0; world.degrade(renderer); } } else lowFpsT = 0; }
}

// ---- monthly arcade leaderboard ------------------------------------------------------
// Same shared Supabase project, table and RPCs as the rest of the Btown games; js/
// leaderboard.js is the fleet's canonical client, byte-identical apart from the game slug.
// Every call is fail-soft: the board can be missing, cold or offline and the game does not
// care. UI shape mirrors flappy-champ's run-mode panel.
const lbBox = $('#lb'), lbList = $('#lbList'), lbStatus = $('#lbStatus');
const lbForm = $('#lbForm'), lbNameInput = $('#lbNameInput');
const lbThisBtn = $('#lbThisBtn'), lbLastBtn = $('#lbLastBtn'), lbRenameBtn = $('#lbRenameBtn');
let lbMonthOffset = 0;

if (lbEnabled()) {
  lbBox.classList.remove('hidden');
  lbThisBtn.textContent = `🏆 ${monthLabel(0).toUpperCase()}`;
  lbLastBtn.textContent = monthLabel(-1).toUpperCase();
}

async function updateLeaderboard(s) {
  if (!lbEnabled()) return;
  if (!getName()) {
    lbForm.classList.remove('hidden'); lbRenameBtn.classList.add('hidden');
    lbStatus.textContent = 'Pick a name to join the monthly leaderboard!';
    lbList.innerHTML = ''; lbForm.dataset.pendingScore = String(s);
    return;
  }
  try { await submitScore(s); } catch { /* offline — still try to show the board */ }
  renderBoard();
}

async function renderBoard() {
  lbForm.classList.add('hidden'); lbRenameBtn.classList.remove('hidden');
  lbStatus.textContent = 'Loading…';
  try {
    const rows = await fetchTop(lbMonthOffset);
    const me = playerId();
    lbList.innerHTML = '';
    rows.slice(0, 10).forEach((r, i) => {
      const li = document.createElement('li');
      if (r.player_id === me) li.className = 'me';
      li.innerHTML = '<span class="rank"></span><span class="nm"></span><span class="sc"></span>';
      li.querySelector('.rank').textContent = ['🥇', '🥈', '🥉'][i] || String(i + 1);
      li.querySelector('.nm').textContent = r.name;
      li.querySelector('.sc').textContent = r.score.toLocaleString();
      lbList.appendChild(li);
    });
    const myRank = rows.findIndex((r) => r.player_id === me);
    const when = lbMonthOffset === 0 ? 'this month' : `in ${monthLabel(-1)}`;
    lbStatus.textContent = rows.length === 0 ? `No scores yet ${when} — be the first!`
      : myRank >= 0 ? `You're #${myRank + 1} of ${rows.length} ${when}` : '';
  } catch { lbStatus.textContent = 'Leaderboard unavailable (offline?)'; }
}

$('#lbSaveBtn').addEventListener('click', async () => {
  const name = lbNameInput.value.trim();
  if (!name) { lbNameInput.focus(); return; }
  const pending = Number(lbForm.dataset.pendingScore || 0);
  lbForm.dataset.pendingScore = '';
  try { await renamePlayer(name); if (pending > 0) await submitScore(pending); } catch { /* offline */ }
  renderBoard();
});
// The game binds W/A/S/D, Space and the trick keys globally — without this, typing a name
// would ollie and kickflip its way through the alphabet.
lbNameInput.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') $('#lbSaveBtn').click(); });
lbRenameBtn.addEventListener('click', () => {
  lbNameInput.value = getName();
  lbForm.classList.remove('hidden'); lbRenameBtn.classList.add('hidden'); lbNameInput.focus();
});
lbThisBtn.addEventListener('click', () => { lbMonthOffset = 0; lbThisBtn.classList.add('sel'); lbLastBtn.classList.remove('sel'); renderBoard(); });
lbLastBtn.addEventListener('click', () => { lbMonthOffset = -1; lbLastBtn.classList.add('sel'); lbThisBtn.classList.remove('sel'); renderBoard(); });

boot().catch(() => {});
