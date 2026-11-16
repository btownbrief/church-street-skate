// Boot, screens, main loop, quality tiers — and TODAY'S LINE, the daily timed run.
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
import { updateHole } from './seethrough.js';
import { today as getToday, loadDaily, saveRun, loadMedals, GoalTracker, LINES, MEDALS, GOAL_PTS, ALL_GOALS_PTS } from './daily.js';
import { lbEnabled, getName, playerId, submitScore, renamePlayer, fetchTop, monthLabel } from './leaderboard.js';

const $ = (s) => document.querySelector(s);
const mobile = isMobile(); const touch = isTouch();
if (touch) document.body.classList.add('touch');
const buzz = (p) => { try { if (navigator.vibrate) navigator.vibrate(p); } catch { /* iOS: no haptics, no fuss */ } };
const hintOf = (g) => (touch ? g.hint : g.key || g.hint);
const ticker = (on) => { try { const t = window.BtownTicker; if (t) on ? t.show() : t.hide(); } catch { /* optional */ } };

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
let locTimer = 0, curLoc = '', freshT = 0, hitPause = 0, looping = false;
// TODAY'S LINE. main.js owns the whole thing: skate.js only ever sees a normal input object
// and a bank multiplier, and never learns there is a clock.
let mode = 'free', runLeft = 0, runOver = false, frozen = false, clockOn = false, lastCall = false;
let day = getToday(), goals = null, coach = null;
let autopilot = null, evTap = null;   // headless-playtest hooks (js/devhooks.js)
let slowT = 0, offT = 0, backOn = false;   // BACK TO LINE: how long you've been stopped / off the line

// ---- title ------------------------------------------------------------------------------
function paintTitle() {
  day = getToday();
  const d = loadDaily(day);
  $('#run-label').textContent = "Today's Line";
  $('#run-line').textContent = day.line.name;
  const bits = [];
  if (d.best > 0) bits.push(`today's best ${d.best.toLocaleString()}`);
  if (d.streak > 0) bits.push(`${d.streak}-day streak`);
  if (!bits.length) bits.push(day.line.blurb);
  $('#title-meta').textContent = bits.join(' · ');
  // five lines, one dot each, coloured by your best medal on it; today's is ringed
  const med = loadMedals();
  $('#title-lines').innerHTML = LINES.map((L, i) => `<span class="ld m${+med[L.id] || 0}${i === day.idx ? ' today' : ''}" title="${L.name}"><i></i>${L.name.replace(/^The /, '')}</span>`).join('');
}

async function boot() {
  try {
    world = await buildWorld({ scene, renderer, camera, quality });
  } catch (e) { console.error(e); if (window.__bootFail) window.__bootFail(); throw e; }
  window.__world = world;
  const sp = world.spawn;
  skater = new Skater(world.collide, sp); skater.spots = world.spots;
  chal = new Challenges(skater);
  gaps = new GapTracker();
  mesh = new SkaterMesh(scene, quality.shadows);
  follow = new FollowCamera(camera, world.collide); follow.reset(skater);
  hud = new Hud($('#hud'), world.info);
  hud.letters = world.letters || null;
  hud.toggleMap(!touch && storeGet('css-map') !== '0');
  hud.el.btnPause.addEventListener('click', () => setPaused(true));
  input.bindTouch({ stickZone: $('#stick-zone'), stickKnob: $('#stick-knob'), buttons: { ollie: $('#b-ollie'), trick: $('#b-trick') } });
  window.__booted = true;
  paintTitle();
  $('#btn-play').disabled = false; $('#btn-run').disabled = false;
  renderer.render(scene, camera);
  installDev({ world, skater, follow, camera, renderer, scene, input, gaps, step: stepGame,
    setAutopilot: (f) => { autopilot = f; }, setTap: (f) => { evTap = f; },
    setRunning: (v) => { running = v; }, setLoc: (v) => { curLoc = v; }, getLoc: () => curLoc });
  // window.__T — the polish-bar test hooks: start a mode, fast-forward, read state.
  window.__T = {
    start: (m = 'run') => start(m),
    step: (ms = 16) => { const n = Math.max(1, Math.round(ms / 1000 * 60)); for (let i = 0; i < n; i++) if (running && !paused) stepGame(1 / 60, performance.now()); updateHole(camera, renderer, skater.pos, !window.__noHole); renderer.render(scene, camera); },
    state: () => ({ mode, running, paused, runOver, runLeft: +runLeft.toFixed(2), clockOn, lastCall, line: day.line.name, goals: goals ? goals.goals.map((g, i) => g.id + (goals.done[i] ? ':done' : '')) : null,
      score: skater.score, state: skater.state, speed: +skater.speed.toFixed(2), coach: coach ? coach.step : null,
      pos: [+skater.pos.x.toFixed(2), +skater.pos.y.toFixed(2), +skater.pos.z.toFixed(2)], bails: skater.session.bails, tricks: skater.session.tricks }),
    // where the skater is on screen (CSS px): feet, head, height — for readability checks
    skaterBox: () => {
      const f = new THREE.Vector3(skater.pos.x, skater.pos.y, skater.pos.z).project(camera), h = new THREE.Vector3(skater.pos.x, skater.pos.y + 1.75, skater.pos.z).project(camera);
      const X = (v) => (v.x * 0.5 + 0.5) * innerWidth, Y = (v) => (1 - (v.y * 0.5 + 0.5)) * innerHeight;
      return { feet: [Math.round(X(f)), Math.round(Y(f))], head: [Math.round(X(h)), Math.round(Y(h))], h: Math.round(Y(f) - Y(h)) };
    },
    // where the next letter's light is on screen, and how close any card / popup / pill gets to it
    light: () => {
      const n = world.letters && world.letters.next; if (!n) return null;
      const v = new THREE.Vector3(n.x, n.y, n.z).project(camera);
      const x = (v.x * 0.5 + 0.5) * innerWidth, y = (1 - (v.y * 0.5 + 0.5)) * innerHeight;
      if (v.z > 1 || x < 0 || x > innerWidth || y < 0 || y > innerHeight) return { on: false, why: v.z > 1 ? 'behind' : 'offscreen', chevron: $('#chev').classList.contains('on') };
      let minDom = 1e9; const hits = [];
      for (const el of document.querySelectorAll('#callout.on, #popups > *, #coach.on, .backpill.on, #combo.on')) {
        const r = el.getBoundingClientRect(); if (!r.width || getComputedStyle(el).opacity === '0') continue;
        const dx = Math.max(r.left - x, 0, x - r.right), dy = Math.max(r.top - y, 0, y - r.bottom), d = Math.hypot(dx, dy);
        if (d < minDom) minDom = d; if (d < 60) hits.push(el.id || el.className);
      }
      return { on: true, x: Math.round(x), y: Math.round(y), minDom: Math.round(minDom), hits };
    },
    endRun: () => { if (mode === 'run' && !runOver) endRun(); },
    setLeft: (s) => { runLeft = s; clockOn = true; },
  };
}

// ---- modes ------------------------------------------------------------------------------
function start(m = 'free') {
  audio.ensure(); $('#screen-title').classList.remove('on'); $('#screen-results').classList.remove('on');
  document.body.classList.add('playing');
  mode = m; runOver = false; frozen = false; runLeft = CFG.runSeconds; clockOn = false; lastCall = false; skater.bankMult = 1;
  document.body.classList.toggle('run', m === 'run'); document.body.classList.remove('lastcall');
  hud.clearCallouts();
  if (m === 'run') {
    day = getToday();
    const L = day.line, gy = world.collide.groundAt(L.start[0], L.start[1], 200, 300).y;
    skater.resetScore(); skater.respawn(L.start[0], gy + 0.02, L.start[1], L.start[2]); follow.reset(skater); locTimer = 0;
    // two letter layouts per line, alternating run by run (A on odd runs, B on even)
    if (world.letters) world.letters.setRun(day.layout && L.lettersB ? L.lettersB : L.letters, L.name, L.start, L.gold);
    goals = new GoalTracker(day.goals);
    hud.setGoals(day.goals, goals.done); hud.showBest = false;
    hud.shownScore = 0; hud.el.score.textContent = '0';
    hud.callout(L.name.toUpperCase(), 'follow the light · push to start the clock', 'line', 2.4);
  } else {
    goals = null; hud.setGoals(null); hud.showBest = true; skater.scoreLocked = false;
    if (world.letters && world.letters.run) world.letters.setWeek();
  }
  hud.setTimer(m === 'run' ? runLeft : null);
  slowT = 0; offT = 0; showBack(false);
  running = true; paused = false; last = performance.now();
  ticker(false);
  // first-play coach: one prompt at a time, until the player has done each thing once
  coach = storeGet('css-ollied') ? null : { step: 0, t: 0 };
  paintCoach();
  // one frame loop only: "Again" from the results card starts a run while the loop is live
  if (!looping) { looping = true; requestAnimationFrame(frame); }
}

// The buzzer: bank whatever was still in the air, stop taking input, show the card.
function endRun() {
  runOver = true; frozen = true; runLeft = 0; hud.setTimer(0, true);
  if (skater.combo.length && skater.state !== 'bail') skater.bankCombo();
  skater.scoreLocked = true;                         // the coast to a stop scores nothing
  input.resetAll(); hud.clearCallouts();
  const s = skater.session, score = skater.score;
  const res = saveRun(day, score, goals ? goals.ids : []);
  showBack(false);
  $('#res-eyebrow').textContent = `Today's Line · ${day.line.name}`;
  // a "new best" only means something once there was a best to beat
  const badge = res.newRunBest && res.prevRunBest > 0 ? 'NEW ALL-TIME BEST' : res.newBestToday && res.prevBest > 0 ? 'NEW BEST TODAY' : '';
  $('#res-badge').textContent = badge; $('#res-badge').classList.toggle('on', !!badge);
  // the ladder: the medal you got, and how far the next one is
  const M = res.medal, nextM = MEDALS[M];
  $('#res-medal').className = 'medal m' + M;
  $('#res-medal').innerHTML = (M ? `<b>${MEDALS[M - 1].name.toUpperCase()}</b>${M > res.prevMedal ? ' · new on ' + day.line.name : ''}` : '<b>NO MEDAL YET</b>')
    + (nextM ? `<span>${nextM.name.toLowerCase()} in ${(nextM.at - score).toLocaleString()}</span>` : '<span>top of the ladder</span>');
  $('#res-goals').innerHTML = day.goals.map((g, i) => `<div class="${goals && goals.done[i] ? 'hit' : ''}"><b>${goals && goals.done[i] ? '✔' : '○'}</b> ${g.name}${goals && goals.done[i] ? '' : `<i>${hintOf(g)}</i>`}</div>`).join('')
    + (res.newGoals ? `<div class="next">${res.newGoals === 1 ? 'a new goal' : res.newGoals + ' new goals'} next run</div>` : '');
  $('#res-stats').innerHTML = `today's best <b>${res.best.toLocaleString()}</b> · all-time <b>${res.runBest.toLocaleString()}</b> · <b>${res.streak}</b>-day streak<br>best combo ${s.bestCombo.toLocaleString()} · ${s.tricks} tricks · ${s.bails} bails · top ${Math.round(s.topSpeed * 2.237)} mph`;
  $('#res-tomorrow').textContent = `Tomorrow: ${day.tomorrow.name}`;
  $('#screen-results').classList.add('on');
  countUp($('#res-score'), score);
  audio.handle({ type: 'spotFirst' });
  ticker(true);
  updateLeaderboard(score);
}
// results score counts up over 0.8 s with a tick
function countUp(el, to) {
  const t0 = performance.now(); let lastTick = 0;
  const f = (now) => {
    const k = Math.min(1, (now - t0) / 800), e = 1 - Math.pow(1 - k, 3);
    el.textContent = Math.round(to * e).toLocaleString();
    if (now - lastTick > 70 && k < 1) { lastTick = now; audio.tick(k); }
    if (k < 1) requestAnimationFrame(f);
  };
  requestAnimationFrame(f);
}

function setPaused(p) {
  paused = p; $('#screen-pause').classList.toggle('on', p); if (p) input.resetAll();
  if (p) {
    const s = skater.session;
    $('#pause-goals').innerHTML = mode === 'run' && goals
      ? `<div class="secttl">${day.line.name} · today's goals</div>` + day.goals.map((g, i) => `<div class="${goals.done[i] ? 'hit' : ''}"><b>${goals.done[i] ? '✔' : '○'} ${g.name}</b><i>${hintOf(g)}</i></div>`).join('')
      : '';
    $('#stats').innerHTML = `Score <b>${skater.score.toLocaleString()}</b> · best combo <b>${s.bestCombo.toLocaleString()}</b> · ${s.tricks} tricks · ${s.bails} bails`;
    $('#coll-sum').textContent = `Collection · spots ${skater.spotsHit.size}/${skater.spots.length} · gaps ${gaps.found.size}/${gaps.total} · challenges ${chal.done.size}/${chal.list.length}`;
    $('#spots-list').innerHTML = skater.spots.map(sp => `<div class="${skater.spotsHit.has(sp.name) ? 'hit' : ''}">${sp.name}</div>`).join('');
    $('#gaps-count').textContent = `${gaps.found.size}/${gaps.total}`;
    $('#gaps-list').innerHTML = gaps.list.map(g => `<div class="${gaps.found.has(g.name) ? 'hit' : ''}">${g.name}</div>`).join('');
    $('#chal-list').innerHTML = chal.list.map(c => { const done = chal.done.has(c.id); return `<div class="${done ? 'hit' : ''}"><b>${done ? '✔' : '○'} ${c.name}</b><i>${c.hint}</i></div>`; }).join('');
    $('#btn-mute').textContent = 'Sound: ' + (audio.muted ? 'off' : 'on');
    $('#btn-respawn').textContent = mode === 'run' ? 'Restart line' : 'Back to Church St';
    $('#btn-map-toggle').textContent = 'Map: ' + (hud.mapOn ? 'on' : 'off');
    ticker(true);
  } else { last = performance.now(); ticker(false); }
}
$('#btn-play').addEventListener('click', () => start('free'));
$('#btn-run').addEventListener('click', () => { if (world && window.__booted) start('run'); });
$('#btn-again').addEventListener('click', () => start('run'));
$('#btn-free').addEventListener('click', () => start('free'));
$('#btn-resume').addEventListener('click', () => setPaused(false));
$('#btn-respawn').addEventListener('click', () => {
  if (mode === 'run') { setPaused(false); start('run'); return; }
  const sp = world.spawn; skater.respawn(sp.x, sp.y, sp.z, sp.yaw); follow.reset(skater); locTimer = 0; setPaused(false);
});
$('#btn-mute').addEventListener('click', () => { $('#btn-mute').textContent = 'Sound: ' + (audio.toggleMute() ? 'off' : 'on'); });
$('#btn-map-toggle').addEventListener('click', () => { const on = hud.toggleMap(); storeSet('css-map', on ? '1' : '0'); $('#btn-map-toggle').textContent = 'Map: ' + (on ? 'on' : 'off'); });
window.addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });
renderer.setSize(innerWidth, innerHeight);
document.addEventListener('visibilitychange', () => { if (document.hidden && running && !paused && !runOver) setPaused(true); });

// ---- the edge chevron: one arrow at the side of the screen when the next letter is off
// screen or behind you (the light only helps if you can see it)
const _cv = new THREE.Vector3(); let chevOn = false;
function paintChevron() {
  const el = $('#chev'), L = world.letters, nx = L && L.next;
  let show = false;
  if (mode === 'run' && !runOver && nx) {
    _cv.set(nx.x, nx.y, nx.z).applyMatrix4(camera.matrixWorldInverse);
    const behind = _cv.z > -0.5;
    let onScreen = false;
    if (!behind) { _cv.set(nx.x, nx.y, nx.z).project(camera); onScreen = Math.abs(_cv.x) < 0.94 && _cv.y > -1 && _cv.y < 1.1; }
    if (!onScreen) {
      _cv.set(nx.x, nx.y, nx.z).applyMatrix4(camera.matrixWorldInverse);
      const right = _cv.x >= 0;
      el.style.left = (right ? innerWidth - 24 : 24) + 'px'; el.style.top = Math.round(innerHeight * 0.44) + 'px';
      el.style.transform = `rotate(${right ? 0 : 180}deg)`; el.classList.toggle('gold', !!L.set);
      show = true;
    }
  }
  if (show !== chevOn) { chevOn = show; el.classList.toggle('on', show); }
}

// ---- first-play coach ---------------------------------------------------------------------
// Three prompts, one at a time, each with its control pulsing; each clears when you do it.
const COACH = touch
  ? [{ txt: 'Drag up on the left to <b>push</b>', el: '#stick-zone' }, { txt: 'Tap <b>TRICK</b> for a kickflip', el: '#b-trick' }, { txt: 'Hold <b>OLLIE</b>, then let go', el: '#b-ollie' }]
  : [{ txt: '<b>W</b> to push · <b>A/D</b> to steer' }, { txt: '<b>J</b> for a kickflip' }, { txt: 'Hold <b>Space</b>, then let go' }];
function paintCoach() {
  const box = $('#coach');
  document.querySelectorAll('.pulse').forEach(e => e.classList.remove('pulse'));
  if (!coach || coach.step >= COACH.length) { box.classList.remove('on'); return; }
  const c = COACH[coach.step];
  box.innerHTML = c.txt; box.classList.add('on');
  if (c.el) $(c.el).classList.add('pulse');
}
function coachEvent(ev) {
  if (!coach) return;
  const s = coach.step;
  if (s === 1 && ev.type === 'trick' && /flip/i.test(ev.name)) advanceCoach();
  if (s === 2 && ev.type === 'pop' && ev.vy > CFG.ollieMin + 2.5) advanceCoach();
}
function advanceCoach() {
  coach.step++;
  if (coach.step >= COACH.length) { storeSet('css-ollied', '1'); coach = null; }
  paintCoach();
}

// ---- BACK TO LINE ----------------------------------------------------------------------------
function segDist(x, z, s) {
  const ex = s.bx - s.ax, ez = s.bz - s.az, l2 = ex * ex + ez * ez;
  const t = l2 < 1e-9 ? 0 : Math.max(0, Math.min(1, ((x - s.ax) * ex + (z - s.az) * ez) / l2));
  return Math.hypot(s.ax + ex * t - x, s.az + ez * t - z);
}
function showBack(on) { backOn = on; $('#btn-back').classList.toggle('on', on); }
// One tap: back on the last letter you took (or the start), facing the light. The clock keeps
// running and the combo is dropped — it is a way back, not a free reset.
function backToLine() {
  const L = world.letters; if (!L || mode !== 'run' || runOver) return;
  const from = L.last || { x: day.line.start[0], z: day.line.start[1] }, nx = L.next;
  const yaw = nx ? Math.atan2(-(nx.x - from.x), -(nx.z - from.z)) : day.line.start[2];
  const gy = world.collide.groundAt(from.x, from.z, 200, 300).y;
  skater.respawn(from.x, gy + 0.05, from.z, yaw); follow.reset(skater);
  if (L.afterRespawn) L.afterRespawn(from.x, from.z, -Math.sin(yaw), -Math.cos(yaw));
  slowT = 0; offT = 0; showBack(false); input.resetAll();
}
$('#btn-back').addEventListener('click', backToLine);

// THE CHAIRLIFT: the bottom of a line's gold run. A quick cut through black puts you back at
// the top, already rolling, and the run goes round again. Whatever combo you had is banked.
function chairlift(ev) {
  if (skater.combo.length && skater.state !== 'bail') skater.bankCombo();
  const gy = world.collide.groundAt(ev.x, ev.z, 200, 300).y;
  skater.respawn(ev.x, gy + 0.05, ev.z, ev.yaw);
  skater.vel.set(-Math.sin(ev.yaw) * 7, 0, -Math.cos(ev.yaw) * 7);
  follow.reset(skater);
  if (world.letters.afterLift) world.letters.afterLift();
  slowT = 0; offT = 0; showBack(false);
  const f = $('#fade'); f.classList.remove('go'); void f.offsetWidth; f.classList.add('go');
  hud.callout('CHAIRLIFT', 'back to the top · the run goes round again', 'line');
  audio.handle({ type: 'spotFirst' });
}

function stepGame(dt, now) {
  input.poll();
  if (autopilot) autopilot(input, skater, dt);
  // after the buzzer the skater coasts to a stop: everything held is dropped every frame
  if (frozen) input.resetAll();
  if (input.pause) { setPaused(true); input.endFrame(); return false; }
  if (input.reset) { if (mode === 'run' && !runOver) backToLine(); else { const g = skater.lastGround; skater.respawn(g.x, g.y + 0.05, g.z); follow.reset(skater); } input.resetAll(); locTimer = 0; }
  if (input.cam) follow.mode = (follow.mode + 1) % 3;
  if (input.map && mode === 'free') hud.toggleMap();
  // the clock starts when the player does something — nothing happens until they act
  if (mode === 'run' && !clockOn && !runOver && (input.throttle !== 0 || input.steer !== 0 || input.ollie || input.flipA || input.flipB || input.shove || input.dbl || input.grab)) clockOn = true;
  // one bank can't be the whole run: capped near a third of the next medal up
  if (mode === 'run') { const nm = MEDALS.find(m => m.at > skater.score); skater.bankCap = Math.round((nm ? nm.at : MEDALS[MEDALS.length - 1].at * 1.5) / 3); } else skater.bankCap = 0;
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
    if (goals && !runOver) goals.handle(ev);
    coachEvent(ev);
    if (ev.type === 'stumble') { follow.kick(0.35); buzz(15); }
    if (ev.type === 'bail') { follow.kick(ev.why === 'wall' || ev.why === 'car' ? 1.2 : 0.7); buzz([30, 40, 30]); }
    if (ev.type === 'land') { if (ev.speed > 8) follow.kick(0.25); buzz(10); }
    if (ev.type === 'maple') { mesh.leafBurst(skater.pos); follow.kick(0.4); }
    if (ev.type === 'stomp') { mesh.stompBurst(skater.pos); follow.kick(0.5); buzz(25); hitPause = Math.max(hitPause, 0.12); }
    if (ev.type === 'gap') { follow.kick(0.3); if (ev.first) hitPause = Math.max(hitPause, 0.12); }
    if (ev.type === 'letter' && ev.run && mode === 'run' && !runOver) { skater.award(ev.pts); runLeft += ev.secs; clockOn = true; hud.bumpTimer(ev.secs); buzz(15); offT = 0; }
    if (ev.type === 'lift' && mode === 'run' && !runOver) chairlift(ev);
  }
  skater.events.length = 0;
  // free skate has no run to reset trick staleness, so it wears off once a minute
  if (mode === 'free') { freshT += dt; if (freshT > 60) { freshT = 0; skater.used.clear(); skater.rampUses.clear(); } }
  chal.update(dt, skater);
  // free-skate challenges still tick during a run, but they keep quiet: one voice at a time
  if (mode === 'run') chal.justDone.length = 0;
  for (const c of chal.justDone) { hud.callout('CHALLENGE: ' + c.name, chal.remaining ? `${chal.remaining} to go` : 'that is all of them'); audio.handle({ type: 'spotFirst' }); }
  chal.justDone.length = 0;
  // today's goals: +1,500 each, +5,000 for all three
  if (goals && mode === 'run' && !runOver) {
    if (clockOn) goals.update(dt, skater);
    for (const g of goals.justDone) {
      const i = goals.goals.indexOf(g); skater.award(GOAL_PTS); hud.markGoal(i);
      hud.callout('GOAL: ' + g.name, `+${GOAL_PTS.toLocaleString()}`, 'goal'); audio.handle({ type: 'goal' }); buzz(20);
      if (goals.all) { skater.award(ALL_GOALS_PTS); hud.callout('LINE CLEARED', `all three goals · +${ALL_GOALS_PTS.toLocaleString()}`, 'gold'); audio.handle({ type: 'spotFirst' }); }
    }
    goals.justDone.length = 0;
  }
  // BACK TO LINE: stopped for 2 s, or 45 m off the line for 4 s → a pill offers the way back
  if (mode === 'run' && !runOver && clockOn) {
    slowT = skater.speed < 1.5 && skater.state !== 'bail' && skater.state !== 'air' ? slowT + dt : 0;
    const seg = world.letters && world.letters.segment && world.letters.segment();
    offT = seg && segDist(skater.pos.x, skater.pos.z, seg) > 45 ? offT + dt : 0;
    const want = slowT > 2 || offT > 4;
    if (want !== backOn) showBack(want);
  }
  if (coach && coach.step === 0 && skater.speed > 5) advanceCoach();
  mesh.update(dt, skater, now / 1000);
  follow.update(dt, skater);
  locTimer -= dt; if (locTimer <= 0) { locTimer = 0.4; curLoc = world.locationName(skater.pos.x, skater.pos.z); }
  if (mode === 'run' && !runOver) {
    if (clockOn) runLeft -= dt;
    // LAST CALL: the final 20 seconds must not feel like the first — every bank counts double
    if (!lastCall && clockOn && runLeft <= CFG.lastCall) {
      lastCall = true; skater.bankMult = 2; document.body.classList.add('lastcall');
      hud.callout('LAST CALL ×2', 'every combo counts double', 'last'); audio.handle({ type: 'lastcall' }); buzz([20, 30, 20]);
    }
    hud.setTimer(runLeft, lastCall);
    if (runLeft <= 0) endRun();
  }
  hud.update(dt, skater, mode === 'run' ? '' : curLoc);
  paintChevron();
  audio.update(dt, skater);
  input.endFrame();
  return true;
}

function frame(now) {
  if (!running) { looping = false; return; }
  requestAnimationFrame(frame);
  let dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (paused) return;
  // HIT-PAUSE: a stomp or a new gap freezes the world to 20% speed for 120 ms
  const realDt = dt;
  if (hitPause > 0) { hitPause -= dt; dt *= 0.2; }
  if (!stepGame(dt, now)) return;
  updateHole(camera, renderer, skater.pos, !window.__noHole);
  renderer.render(scene, camera);
  // adaptive quality
  fpsAcc += realDt; fpsN++;
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
