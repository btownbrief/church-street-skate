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
import { isMobile, isTouch } from './util.js';

const $ = (s) => document.querySelector(s);
const mobile = isMobile(); const touch = isTouch();
if (touch) document.body.classList.add('touch');

const canvas = $('#c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: !mobile, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, mobile ? 1.5 : 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;
const quality = { tier: mobile ? 1 : 2, shadows: !mobile, npcs: mobile ? 0.6 : 1, traffic: mobile ? 0.7 : 1, mobile };
renderer.shadowMap.enabled = quality.shadows; renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(CFG.camFov, innerWidth / innerHeight, 0.2, mobile ? 520 : 900);
scene.add(camera);

const input = new Input();
const audio = new Audio();
let world, skater, mesh, follow, hud, running = false, paused = false, last = performance.now(), fpsAcc = 0, fpsN = 0, lowFpsT = 0;
let locTimer = 0, curLoc = '';

const how = touch
  ? `<b>Left side</b>: drag to steer, push up to skate · <b>OLLIE</b> hold &amp; release for height · <b>FLIP</b>/<b>SHOVE</b> in the air (both = 360 flip) · steer in the air to spin · land on ledges &amp; rails to grind, steer to balance · <b>GRAB</b> in the air, hold it through the landing to manual`
  : `<kbd>W/↑</kbd> push · <kbd>S/↓</kbd> brake · <kbd>A/D</kbd> steer (and spin in the air) · <kbd>Space</kbd> hold &amp; release to ollie · <kbd>J</kbd> kickflip · <kbd>K</kbd> heelflip · <kbd>L</kbd> shove-it (<kbd>J</kbd>+<kbd>L</kbd> = 360 flip) · <kbd>Shift</kbd> grab in the air, hold it through the landing to manual (with <kbd>S</kbd> = nose manual) · land on a ledge or rail to grind, steer to balance · <kbd>C</kbd> camera · <kbd>M</kbd> map · <kbd>R</kbd> respawn · <kbd>P</kbd> pause`;
$('#how').innerHTML = how;

async function boot() {
  $('#btn-play').disabled = true;
  try {
    world = await buildWorld({ scene, renderer, camera, quality });
  } catch (e) { console.error(e); $('#loading').textContent = 'Something broke while building the city: ' + e.message; throw e; }
  const sp = world.spawn;
  skater = new Skater(world.collide, sp); skater.spots = world.spots;
  mesh = new SkaterMesh(scene, quality.shadows);
  follow = new FollowCamera(camera, world.collide); follow.reset(skater);
  hud = new Hud($('#hud'), world.info);
  hud.el.btnPause.addEventListener('click', () => setPaused(true));
  input.bindTouch({ stickZone: $('#stick-zone'), stickKnob: $('#stick-knob'), buttons: { ollie: $('#b-ollie'), flipA: $('#b-flip'), shove: $('#b-shove'), grab: $('#b-grab') } });
  $('#loading').textContent = `Downtown loaded — ${world.stats}`;
  $('#btn-play').disabled = false;
  renderer.render(scene, camera);
}

function start() {
  audio.ensure(); $('#screen-title').classList.remove('on'); running = true; paused = false; last = performance.now(); requestAnimationFrame(frame);
}
function setPaused(p) {
  paused = p; $('#screen-pause').classList.toggle('on', p); if (p) input.resetAll();
  if (p) {
    const s = skater.session;
    $('#stats').innerHTML = `Score <b>${skater.score.toLocaleString()}</b> · best combo <b>${s.bestCombo.toLocaleString()}</b><br>${s.tricks} tricks · ${s.bails} bails · ${(s.dist / 1609).toFixed(2)} mi skated · top speed ${Math.round(s.topSpeed * 2.237)} mph<br>Spots found: ${skater.spotsHit.size}/${skater.spots.length}`;
    $('#spots-list').innerHTML = skater.spots.map(sp => `<div class="${skater.spotsHit.has(sp.name) ? 'hit' : ''}">${sp.name}</div>`).join('');
    $('#btn-mute').textContent = 'Sound: ' + (audio.muted ? 'off' : 'on');
  } else { last = performance.now(); }
}
$('#btn-play').addEventListener('click', start);
$('#btn-resume').addEventListener('click', () => setPaused(false));
$('#btn-respawn').addEventListener('click', () => { const sp = world.spawn; skater.respawn(sp.x, sp.y, sp.z, sp.yaw); follow.reset(skater); setPaused(false); });
$('#btn-mute').addEventListener('click', () => { $('#btn-mute').textContent = 'Sound: ' + (audio.toggleMute() ? 'off' : 'on'); });
window.addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });
renderer.setSize(innerWidth, innerHeight);
document.addEventListener('visibilitychange', () => { if (document.hidden && running && !paused) setPaused(true); });

function frame(now) {
  if (!running) return;
  requestAnimationFrame(frame);
  let dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (paused) return;
  input.poll();
  if (input.pause) { setPaused(true); input.endFrame(); return; }
  if (input.reset) { const g = skater.lastGround; skater.respawn(g.x, g.y + 0.05, g.z); input.resetAll(); }
  if (input.cam) follow.mode = (follow.mode + 1) % 3;
  if (input.map) hud.toggleMap();
  // physics
  skater.update(dt, input);
  // keep inside the playable area
  world.confine(skater);
  // world sim (npcs, traffic, env)
  world.update(dt, skater);
  // events
  for (const ev of skater.events) {
    hud.handle(ev, skater); audio.handle(ev);
    if (ev.type === 'bail') follow.kick(ev.why === 'wall' || ev.why === 'car' ? 1.2 : 0.7);
    if (ev.type === 'land' && ev.speed > 8) follow.kick(0.25);
  }
  skater.events.length = 0;
  mesh.update(dt, skater, now / 1000);
  follow.update(dt, skater);
  locTimer -= dt; if (locTimer <= 0) { locTimer = 0.4; curLoc = world.locationName(skater.pos.x, skater.pos.z); }
  hud.update(dt, skater, curLoc);
  audio.update(dt, skater);
  renderer.render(scene, camera);
  input.endFrame();
  // adaptive quality
  fpsAcc += dt; fpsN++;
  if (fpsAcc > 2) { const fps = fpsN / fpsAcc; fpsAcc = 0; fpsN = 0;
    if (fps < 40) { lowFpsT++; if (lowFpsT >= 2) { lowFpsT = 0; world.degrade(renderer); } } else lowFpsT = 0; }
}

window.__tp = (x, z, yaw, speed = 0) => { const y = world.collide.groundAt(x, z, 100, 200).y + 0.05; skater.respawn(x, y, z, yaw); if (speed) { const f = Math.sin(yaw), g = Math.cos(yaw); skater.vel.set(-f * speed, 0, -g * speed); } follow.reset(skater); };
window.__topdown = (x, z, h = 80) => { running = false; camera.position.set(x, skater.pos.y + h, z + 0.01); camera.up.set(0, 0, -1); camera.lookAt(x, skater.pos.y, z); camera.up.set(0, 1, 0); renderer.render(scene, camera); };
window.__dbg = () => skater ? { state: skater.state, pos: [+skater.pos.x.toFixed(2), +skater.pos.y.toFixed(2), +skater.pos.z.toFixed(2)], vel: [+skater.vel.x.toFixed(2), +skater.vel.y.toFixed(2), +skater.vel.z.toFixed(2)], yaw: +skater.yaw.toFixed(2), score: skater.score, combo: skater.combo.map(t => t.name), loc: curLoc, ground: skater.groundKind, drawCalls: renderer.info.render.calls, tris: renderer.info.render.triangles } : null;
boot().catch(() => {});
