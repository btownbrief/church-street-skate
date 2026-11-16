// DOM HUD. Deliberately small (2026-11-16 "HUD diet"): score + the gold special bar, the run
// clock with the B-T-O-W-N dots and today's three goal chips, pause. Everything else is
// transient — the combo line while you're in a combo, one callout at a time, bank popups that
// scale with the bank, a location name that shows for 1.5 s when it changes (free skate).
import { clamp } from './util.js';
import { CFG } from './config.js';

const CALLOUT_T = 1.6;            // seconds each queued callout stays up

export class Hud {
  constructor(root, worldInfo) {
    this.root = root; this.info = worldInfo; // { roads, buildings, play } for the minimap
    root.innerHTML = `
      <div id="hud-top">
        <div id="hud-score"><div id="score-val">0</div><div id="best-val"></div>
          <div class="meter" id="m-special"><i></i></div>
        </div>
        <div id="hud-mid"><div id="timer"></div><div id="letters"></div><div id="goals"></div></div>
        <div id="hud-right"><button id="btn-map" class="pill" aria-label="Map">MAP</button><button id="btn-pause" class="pill" aria-label="Pause">II</button></div>
      </div>
      <div id="hud-loc"><span id="loc-name"></span></div>
      <div id="combo"><div id="combo-tricks"></div><div id="combo-total"></div></div>
      <div id="balance"><div id="balance-knob"></div></div>
      <div id="charge"><i></i><b></b></div>
      <div id="popups"></div>
      <div id="callout"></div>
      <canvas id="minimap" width="220" height="220"></canvas>
      <div id="speed"></div>`;
    const q = (s) => root.querySelector(s);
    this.el = { score: q('#score-val'), best: q('#best-val'), loc: q('#loc-name'), locBox: q('#hud-loc'), combo: q('#combo'), comboTricks: q('#combo-tricks'), comboTotal: q('#combo-total'), balance: q('#balance'), knob: q('#balance-knob'), popups: q('#popups'), callout: q('#callout'), map: q('#minimap'), speed: q('#speed'), btnMap: q('#btn-map'), btnPause: q('#btn-pause'),
      special: q('#m-special > i'), mSpecial: q('#m-special'), letters: q('#letters'), timer: q('#timer'), goals: q('#goals'),
      charge: q('#charge'), chargeFill: q('#charge > i'), chargeBonus: q('#charge > b') };
    this.shownScore = 0; this.mapOn = true; this.comboFlash = 0; this._lastLoc = ''; this._locT = 0;
    this._special = -1; this._lettersKey = ''; this._timerTxt = ''; this.showBest = true;
    this.queue = []; this._calloutT = 0;
    this._best = -1; this._mph = -1; this._comboHtml = ''; this._comboTotalTxt = '';
    this.mapCtx = this.el.map.getContext('2d');
    this.el.btnMap.addEventListener('click', () => this.toggleMap());
  }
  toggleMap(on) { this.mapOn = on === undefined ? !this.mapOn : on; this.el.map.style.display = this.mapOn ? '' : 'none'; return this.mapOn; }

  popup(text, cls = '', x = 50, y = 38) {
    const d = document.createElement('div'); d.className = 'pop ' + cls; d.textContent = text; d.style.left = x + '%'; d.style.top = y + '%';
    this.el.popups.appendChild(d); setTimeout(() => d.remove(), 2600);
    while (this.el.popups.children.length > 4) this.el.popups.firstChild.remove();
  }
  // One callout at a time, each up for 1.6 s; the rest wait their turn. `cls` tints it.
  callout(title, sub, cls = '') {
    if (this.queue.length >= 3) this.queue.shift();         // never fall seconds behind the action
    this.queue.push({ title, sub, cls });
    if (this._calloutT <= 0) this._nextCallout();
  }
  _nextCallout() {
    const c = this.queue.shift(); const el = this.el.callout;
    if (!c) { el.classList.remove('on'); this._calloutT = 0; document.body.classList.remove('co'); return; }
    document.body.classList.add('co');                     // the coach steps aside while a callout is up
    el.className = 'on ' + c.cls;
    el.innerHTML = `<div class="ct"></div>${c.sub ? '<div class="cs"></div>' : ''}`;
    el.querySelector('.ct').textContent = c.title; if (c.sub) el.querySelector('.cs').textContent = c.sub;
    this._calloutT = CALLOUT_T;
  }
  clearCallouts() { this.queue.length = 0; this._calloutT = 0; this.el.callout.className = ''; this.el.popups.innerHTML = ''; document.body.classList.remove('co'); }

  handle(ev, sk) {
    switch (ev.type) {
      case 'trick': this.comboFlash = 1; break;
      case 'bank': {
        // the payoff scales with the bank: small banks are small, big ones are BIG
        const cls = ev.total >= 5000 ? 'bank mega' : ev.total >= 2000 ? 'bank big' : ev.total >= 500 ? 'bank' : 'bank small';
        this.popup(`+${ev.total.toLocaleString()}${ev.mult > 1 ? '  ×' + ev.mult : ''}`, cls, 50, 35);
        if (ev.spot) this.callout(ev.spot, 'spot bonus');
        break;
      }
      case 'bail': this.popup(ev.lost > 0 ? `BAIL  −${ev.lost.toLocaleString()}` : 'BAIL', 'bail', 50, 34); break;
      case 'spotFirst': this.callout(`NEW SPOT: ${ev.name}`, `+${ev.bonus} · ${sk.spotsHit.size}/${sk.spots.length} Burlington spots`); break;
      case 'land': if (ev.sketchy) this.popup('sketchy', 'sk', 50, 44); break;
      case 'stomp': this.popup('STOMPED!', 'stomp', 50, 40); break;
      case 'gap': this.callout(ev.name.toUpperCase(), ev.first ? `NEW GAP · +${ev.pts}` : `+${ev.pts}`, 'gap'); break;
      case 'revert': this.popup('revert', 'sk', 50, 46); break;
      case 'maple': this.callout('THE MAPLE LEAF', 'signature trick', 'gold'); break;
      case 'letter':
        if (!ev.run) { this.callout(ev.ch, `B-T-O-W-N · ${ev.n}/${ev.total}`, 'letter'); break; }
        this.callout(`${ev.gold ? 'GOLD ' : ''}${ev.ch}   +${ev.secs}s`, `${ev.gold ? 'gold set ' + ev.set + ' · ' : 'B-T-O-W-N '}${ev.n}/${ev.total} · +${ev.pts.toLocaleString()}`, 'letter');
        break;
      case 'letters': this.callout(ev.set ? `GOLD BTOWN ×${ev.set + 1}` : 'BTOWN!', `${ev.set ? 'a full gold set' : 'all five letters'} · +${ev.pts.toLocaleString()}`, 'gold'); break;
    }
  }

  // TODAY'S LINE clock. main.js owns the timer; the HUD only renders what it is handed.
  setTimer(sec, lastCall = false) {
    if (sec == null) { if (this._timerTxt !== '') { this._timerTxt = ''; this.el.timer.textContent = ''; this.el.timer.classList.remove('on', 'low'); } return; }
    const s = Math.max(0, Math.ceil(sec));
    const txt = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    if (txt !== this._timerTxt) { this._timerTxt = txt; this.el.timer.textContent = txt; }
    this.el.timer.classList.add('on');
    this.el.timer.classList.toggle('low', lastCall);
  }
  bumpTimer(_secs) { const t = this.el.timer; t.classList.remove('plus'); void t.offsetWidth; t.classList.add('plus'); }
  // three chips under the clock; they turn green as the run clears them
  setGoals(goals, done) {
    if (!goals) { this.el.goals.innerHTML = ''; return; }
    this.el.goals.innerHTML = goals.map((g, i) => `<span class="chip${done && done[i] ? ' done' : ''}">${g.chip}</span>`).join('');
  }
  markGoal(i) { const c = this.el.goals.children[i]; if (c) { c.classList.add('done', 'pop'); } }

  update(dt, sk, loc) {
    // score counts up
    const target = sk.score; if (this.shownScore !== target) { this.shownScore += Math.ceil((target - this.shownScore) * Math.min(1, dt * 8)); if (Math.abs(target - this.shownScore) < 2) this.shownScore = target; this.el.score.textContent = this.shownScore.toLocaleString(); }
    const bestTxt = this.showBest && sk.best > 0 ? 'best ' + sk.best.toLocaleString() : '';
    if (this._best !== bestTxt) { this._best = bestTxt; this.el.best.textContent = bestTxt; }
    // combo — counted in place
    let nReal = 0, sum = 0;
    for (const t of sk.combo) { sum += t.pts; if (!t.silent) nReal++; }
    let liveName = null, livePts = 0;
    if (sk.state === 'grind' && sk.grind) { liveName = sk.grind.type + (sk.grind.edge.name ? ' · ' + sk.grind.edge.name : ''); livePts = 80 + 90 * sk.grind.time; }
    else if (sk.state === 'manual' && sk.manual) { liveName = sk.manual.nose ? 'Nose Manual' : 'Manual'; livePts = 60 + 70 * sk.manual.time; }
    else if (sk.state === 'air' && Math.abs(sk.spinAccum) > 1.9) {
      const deg = Math.floor(Math.abs(sk.spinAccum) / Math.PI * 180 / 10) * 10;
      liveName = (sk.spinAccum > 0 ? 'FS ' : 'BS ') + deg + '°'; livePts = 0;
    }
    if (nReal || liveName) {
      // FRESH tricks (first time this run) glow green and pay ×1.5; worn-out ones fade
      const parts = [];
      for (const t of sk.combo) if (!t.silent) parts.push(t);
      const shown = parts.slice(-5);
      let html = shown.map(t => `<span class="${t.fresh ? 'fresh' : t.stale ? 'stale' : ''}">${esc(t.name)}${t.fresh ? '<sup>FRESH</sup>' : ''}</span>`).join(' <span class="plus">+</span> ');
      if (liveName) html += (html ? ' <span class="plus">+</span> ' : '') + `<span class="live">${esc(liveName)}</span>`;
      this.el.combo.classList.add('on');
      if (this._comboHtml !== html) { this.el.comboTricks.innerHTML = html; this._comboHtml = html; }
      const total = sum + Math.round(livePts);
      const n = nReal + (liveName ? 1 : 0);
      const txt = `${total.toLocaleString()} × ${Math.min(n, 8)}`;
      if (this._comboTotalTxt !== txt) { this._comboTotalTxt = txt; this.el.comboTotal.textContent = txt; }
      this.comboFlash = Math.max(0, this.comboFlash - dt * 3); this.el.comboTotal.style.transform = `scale(${1 + this.comboFlash * 0.25 + Math.min(n, 8) * 0.03})`;
    } else if (this._comboHtml !== '') { this.el.combo.classList.remove('on'); this._comboHtml = ''; this._comboTotalTxt = ''; }
    // balance meter
    if (sk.state === 'grind' || sk.state === 'manual') { this.el.balance.classList.add('on'); this.el.knob.style.left = (50 + clamp(sk.balance, -1, 1) * 46) + '%'; this.el.knob.style.background = Math.abs(sk.balance) > 0.7 ? '#ff4d3d' : '#ffd84d'; }
    else this.el.balance.classList.remove('on');
    // location: a name shows for 1.5 s when it changes, then gets out of the way
    if (loc && loc !== this._lastLoc) { this._lastLoc = loc; this.el.loc.textContent = loc; this.el.locBox.classList.add('on'); this._locT = 1.5; }
    if (this._locT > 0) { this._locT -= dt; if (this._locT <= 0) this.el.locBox.classList.remove('on'); }
    if (this._calloutT > 0) { this._calloutT -= dt; if (this._calloutT <= 0) this._nextCallout(); }
    // special meter
    const sp2 = Math.round(sk.special * 100);
    if (this._special !== sp2) { this._special = sp2; this.el.special.style.width = sp2 + '%'; this.el.mSpecial.classList.toggle('full', sk.special >= 1); }
    // B-T-O-W-N dots
    if (this.letters) {
      const L = this.letters, set = L.run ? L.set || 0 : 0, miss = L.missed || new Set();
      const nx = L.run && L.next ? L.next.ch : '';
      const key = L.route + set + [...L.got].sort().join('') + '|' + [...miss].sort().join('') + nx;
      if (key !== this._lettersKey) {
        this._lettersKey = key;
        this.el.letters.classList.toggle('gold', set > 0);
        this.el.letters.innerHTML = L.all.map(c => `<b class="${L.got.has(c) ? 'got' : miss.has(c) ? 'miss' : c === nx ? 'next' : ''}">${c}</b>`).join('') + (set > 0 ? `<i>×${set + 1}</i>` : '');
      }
    }
    // OLLIE CHARGE bar: yellow = how loaded the pop is, green = the extra the current speed adds
    if (sk.charging) {
      this.el.charge.classList.add('on');
      const frac = clamp(sk.charge / CFG.ollieCharge, 0, 1);
      const bonus = frac * 0.30 * clamp(sk.speed / 28, 0, 1);
      const fillPct = frac / 1.30 * 100;
      this.el.chargeFill.style.width = fillPct.toFixed(1) + '%';
      this.el.chargeBonus.style.left = fillPct.toFixed(1) + '%';
      this.el.chargeBonus.style.width = (bonus / 1.30 * 100).toFixed(1) + '%';
    } else this.el.charge.classList.remove('on');
    const mph = Math.round(sk.speed * 2.237);
    if (this._mph !== mph) { this._mph = mph; this.el.speed.textContent = mph + ' mph'; }
    if (this.mapOn && this.el.map.offsetParent !== null) this.drawMap(sk);
  }

  _prerender() {
    const info = this.info; const play = info.play; const s = this.mapS = 1.25;
    const W = Math.ceil((play.maxX - play.minX) * s) + 40, H = Math.ceil((play.maxZ - play.minZ) * s) + 40;
    const c = this.mapStatic = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
    this.mapOX = -play.minX * s + 20; this.mapOZ = -play.minZ * s + 20;
    g.translate(this.mapOX, this.mapOZ); g.scale(s, s);
    g.fillStyle = 'rgba(160,150,140,0.55)';
    for (const b of info.buildings) { const p = b.pts; if (p.length < 3) continue; g.beginPath(); g.moveTo(p[0][0], p[0][1]); for (let i = 1; i < p.length; i++) g.lineTo(p[i][0], p[i][1]); g.closePath(); g.fill(); }
    g.lineCap = 'round';
    for (const r of info.roads) { if (r.pts.length < 2) continue; const minor = r.kind === 'footway' || r.kind === 'steps' || r.kind === 'path' || r.kind === 'cycleway'; g.strokeStyle = r.kind === 'pedestrian' ? 'rgba(214,120,80,0.9)' : minor ? 'rgba(200,200,200,0.35)' : 'rgba(230,230,230,0.6)'; g.lineWidth = r.kind === 'pedestrian' ? 7 : minor ? 1.2 : r.kind === 'service' ? 3 : 6; g.beginPath(); g.moveTo(r.pts[0][0], r.pts[0][1]); for (let i = 1; i < r.pts.length; i++) g.lineTo(r.pts[i][0], r.pts[i][1]); g.stroke(); }
  }

  drawMap(sk) {
    const c = this.el.map, g = this.mapCtx, W = c.width, H = c.height; const info = this.info; if (!info) return;
    if (!this.mapStatic) this._prerender();
    const s = this.mapS;
    g.clearRect(0, 0, W, H);
    g.fillStyle = 'rgba(18,22,30,0.72)'; g.beginPath(); g.arc(W / 2, H / 2, W / 2 - 2, 0, Math.PI * 2); g.fill();
    g.save(); g.beginPath(); g.arc(W / 2, H / 2, W / 2 - 4, 0, Math.PI * 2); g.clip();
    const sx = sk.pos.x * s + this.mapOX - W / 2, sz = sk.pos.z * s + this.mapOZ - H / 2;
    g.drawImage(this.mapStatic, sx, sz, W, H, 0, 0, W, H);
    for (const sp of sk.spots) { const px = sp.x * s + this.mapOX - sx, pz = sp.z * s + this.mapOZ - sz; if (px < -5 || pz < -5 || px > W + 5 || pz > H + 5) continue; g.fillStyle = sk.spotsHit.has(sp.name) ? 'rgba(120,230,140,0.9)' : 'rgba(255,216,77,0.9)'; g.beginPath(); g.arc(px, pz, 3, 0, Math.PI * 2); g.fill(); }
    g.restore();
    g.save(); g.translate(W / 2, H / 2); g.rotate(-sk.yaw); g.fillStyle = '#fff'; g.beginPath(); g.moveTo(0, -8); g.lineTo(6, 6); g.lineTo(0, 3); g.lineTo(-6, 6); g.closePath(); g.fill(); g.restore();
    g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 2; g.beginPath(); g.arc(W / 2, H / 2, W / 2 - 3, 0, Math.PI * 2); g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.7)'; g.font = 'bold 11px system-ui, sans-serif'; g.textAlign = 'center'; g.fillText('N', W / 2, 14);
  }
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
