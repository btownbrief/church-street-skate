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
import { today as getToday, loadDaily, saveRun, GoalTracker, GOAL_PTS, ALL_GOALS_PTS, LETTER_PTS, LETTER_SECS } from './daily.js';
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

// ---- title ------------------------------------------------------------------------------
function paintTitle() {
  day = getToday();
  const d = loadDaily(day);
  $('#run-label').textContent = "Today's Line";
  $('#run-line').textContent = day.line.name;
  const bits = [];
  if (d.best > 0) bits.push(`today's best ${d.best.toLocaleString()}`);
  if (d.streak > 1) bits.push(`${d.streak}-day streak`);
  if (!bits.length) bits.push(day.line.blurb);
  $('#title-meta').textContent = bits.join(' · ');
}

async function boot() {
  try {
    world = await buildWorld({ scene, renderer, camera, quality });
  } catch (e) { console.error(e); $('#run-label').textContent = 'Something broke while building the city'; $('#run-line').textContent = e.message; throw e; }
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
    if (world.letters) world.letters.setRun(L.letters, L.name);
    goals = new GoalTracker(day.goals);
    hud.setGoals(day.goals, goals.done); hud.showBest = false;
    hud.shownScore = 0; hud.el.score.textContent = '0';
    hud.callout(L.name.toUpperCase(), 'follow the light · push to start the clock', 'line');
  } else {
    goals = null; hud.setGoals(null); hud.showBest = true; skater.scoreLocked = false;
    if (world.letters && world.letters.run) world.letters.setWeek();
  }
  hud.setTimer(m === 'run' ? runLeft : null);
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
  const res = saveRun(day, score, goals ? goals.done : []);
  $('#res-eyebrow').textContent = `Today's Line · ${day.line.name}`;
  // a "new best" only means something once there was a best to beat
  const badge = res.newRunBest && res.prevRunBest > 0 ? 'NEW ALL-TIME BEST' : res.newBestToday && res.prevBest > 0 ? 'NEW BEST TODAY' : '';
  $('#res-badge').textContent = badge; $('#res-badge').classList.toggle('on', !!badge);
  $('#res-goals').innerHTML = day.goals.map((g, i) => `<div class="${goals && goals.done[i] ? 'hit' : res.goals[i] ? 'today' : ''}"><b>${goals && goals.done[i] ? '✔' : res.goals[i] ? '✔' : '○'}</b> ${g.name}${goals && goals.done[i] ? '' : `<i>${hintOf(g)}</i>`}</div>`).join('');
  $('#res-stats').innerHTML = `today's best <b>${res.best.toLocaleString()}</b> · all-time <b>${res.runBest.toLocaleString()}</b>${res.streak > 1 ? ` · <b>${res.streak}</b>-day streak` : ''}<br>best combo ${s.bestCombo.toLocaleString()} · ${s.tricks} tricks · ${s.bails} bails · top ${Math.round(s.topSpeed * 2.237)} mph`;
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
$('#btn-run').addEventListener('click', () => start('run'));
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

function stepGame(dt, now) {
  input.poll();
  if (autopilot) autopilot(input, skater, dt);
  // after the buzzer the skater coasts to a stop: everything held is dropped every frame
  if (frozen) input.resetAll();
  if (input.pause) { setPaused(true); input.endFrame(); return false; }
  if (input.reset) { const g = skater.lastGround; skater.respawn(g.x, g.y + 0.05, g.z); follow.reset(skater); input.resetAll(); locTimer = 0; }
  if (input.cam) follow.mode = (follow.mode + 1) % 3;
  if (input.map && mode === 'free') hud.toggleMap();
  // the clock starts when the player does something — nothing happens until they act
  if (mode === 'run' && !clockOn && !runOver && (input.throttle !== 0 || input.steer !== 0 || input.ollie || input.flipA || input.flipB || input.shove || input.dbl || input.grab)) clockOn = true;
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
    if (ev.type === 'bail') { follow.kick(ev.why === 'wall' || ev.why === 'car' ? 1.2 : 0.7); buzz([30, 40, 30]); }
    if (ev.type === 'land') { if (ev.speed > 8) follow.kick(0.25); buzz(10); }
    if (ev.type === 'maple') { mesh.leafBurst(skater.pos); follow.kick(0.4); }
    if (ev.type === 'stomp') { mesh.stompBurst(skater.pos); follow.kick(0.5); buzz(25); hitPause = Math.max(hitPause, 0.12); }
    if (ev.type === 'gap') { follow.kick(0.3); if (ev.first) hitPause = Math.max(hitPause, 0.12); }
    if (ev.type === 'letter' && ev.run && mode === 'run' && !runOver) { skater.award(LETTER_PTS); runLeft += LETTER_SECS; clockOn = true; hud.bumpTimer(); buzz(15); }
  }
  skater.events.length = 0;
  // free skate has no run to reset trick staleness, so it wears off once a minute
  if (mode === 'free') { freshT += dt; if (freshT > 60) { freshT = 0; skater.used.clear(); } }
  chal.update(dt, skater);
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
