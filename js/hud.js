// DOM HUD: score, combo ticker, trick popups, spot callouts, balance meter, location label, minimap.
import { clamp } from './util.js';

export class Hud {
  constructor(root, worldInfo) {
    this.root = root; this.info = worldInfo; // { roads, buildings, play, churchStreet } for minimap + location names
    root.innerHTML = `
      <div id="hud-top">
        <div id="hud-score"><div class="lbl">SCORE</div><div id="score-val">0</div><div id="best-val">best 0</div></div>
        <div id="hud-loc"><span id="loc-name">Church Street</span></div>
        <div id="hud-right"><button id="btn-map" class="pill" aria-label="Map">MAP</button><button id="btn-pause" class="pill" aria-label="Pause">II</button></div>
      </div>
      <div id="combo"><div id="combo-tricks"></div><div id="combo-total"></div></div>
      <div id="balance"><div id="balance-knob"></div></div>
      <div id="popups"></div>
      <div id="callout"></div>
      <canvas id="minimap" width="220" height="220"></canvas>
      <div id="speed"></div>`;
    this.el = { score: root.querySelector('#score-val'), best: root.querySelector('#best-val'), loc: root.querySelector('#loc-name'), combo: root.querySelector('#combo'), comboTricks: root.querySelector('#combo-tricks'), comboTotal: root.querySelector('#combo-total'), balance: root.querySelector('#balance'), knob: root.querySelector('#balance-knob'), popups: root.querySelector('#popups'), callout: root.querySelector('#callout'), map: root.querySelector('#minimap'), speed: root.querySelector('#speed'), btnMap: root.querySelector('#btn-map'), btnPause: root.querySelector('#btn-pause') };
    this.shownScore = 0; this.mapOn = true; this.comboFlash = 0; this._lastLoc = ''; this._locT = 0; this._calloutT = 0;
    this.mapCtx = this.el.map.getContext('2d');
    this.el.btnMap.addEventListener('click', () => this.toggleMap());
    this.mapScale = 1; // px per metre (set per frame)
  }
  toggleMap() { this.mapOn = !this.mapOn; this.el.map.style.display = this.mapOn ? 'block' : 'none'; }

  popup(text, cls = '', x = 50, y = 38) {
    const d = document.createElement('div'); d.className = 'pop ' + cls; d.textContent = text; d.style.left = x + '%'; d.style.top = y + '%';
    this.el.popups.appendChild(d); setTimeout(() => d.remove(), 1400);
    while (this.el.popups.children.length > 6) this.el.popups.firstChild.remove();
  }
  callout(title, sub) { this.el.callout.innerHTML = `<div class="ct">${title}</div>${sub ? `<div class="cs">${sub}</div>` : ''}`; this.el.callout.classList.add('on'); this._calloutT = 2.6; }

  handle(ev, sk) {
    switch (ev.type) {
      case 'trick': this.comboFlash = 1; break;
      case 'bank': this.popup(`+${ev.total.toLocaleString()}`, 'bank', 50, 30); if (ev.spot) this.callout(ev.spot, `spot bonus`); break;
      case 'bail': if (ev.lost > 0) this.popup(`BAIL  −${ev.lost.toLocaleString()}`, 'bail', 50, 34); else this.popup('BAIL', 'bail', 50, 34); break;
      case 'spotFirst': this.callout(`NEW SPOT: ${ev.name}`, `+${ev.bonus} · ${sk.spotsHit.size}/${sk.spots.length} Burlington spots`); break;
      case 'grindStart': break;
      case 'land': if (ev.sketchy) this.popup('sketchy', 'sk', 50, 44); break;
    }
  }

  update(dt, sk, loc) {
    // score counts up
    const target = sk.score; if (this.shownScore !== target) { this.shownScore += Math.ceil((target - this.shownScore) * Math.min(1, dt * 8)); if (Math.abs(target - this.shownScore) < 2) this.shownScore = target; this.el.score.textContent = this.shownScore.toLocaleString(); }
    this.el.best.textContent = 'best ' + sk.best.toLocaleString();
    // combo
    const real = sk.combo.filter(t => !t.silent);
    // live (in-progress) trick: grind or manual accumulating points
    let live = null;
    if (sk.state === 'grind' && sk.grind) live = { name: sk.grind.type + (sk.grind.edge.name ? ' · ' + sk.grind.edge.name : ''), pts: 80 + 90 * sk.grind.time };
    else if (sk.state === 'manual' && sk.manual) live = { name: sk.manual.nose ? 'Nose Manual' : 'Manual', pts: 60 + 70 * sk.manual.time };
    if (real.length || live) {
      this.el.combo.classList.add('on');
      const list = real.slice(-5).map(t => t.name); if (live) list.push(`<span class="live">${live.name}</span>`);
      const names = list.join(' <span class="plus">+</span> ');
      if (this._comboHtml !== names) { this.el.comboTricks.innerHTML = names; this._comboHtml = names; }
      const sum = real.reduce((a, t) => a + t.pts, 0) + (sk.combo.length - real.length) * 10 + (live ? Math.round(live.pts) : 0);
      const n = real.length + (live ? 1 : 0);
      this.el.comboTotal.textContent = `${sum.toLocaleString()} × ${Math.min(n, 8)}`;
      this.comboFlash = Math.max(0, this.comboFlash - dt * 3); this.el.comboTotal.style.transform = `scale(${1 + this.comboFlash * 0.25})`;
    } else { this.el.combo.classList.remove('on'); this._comboHtml = ''; }
    // balance meter
    if (sk.state === 'grind' || sk.state === 'manual') { this.el.balance.classList.add('on'); this.el.knob.style.left = (50 + clamp(sk.balance, -1, 1) * 46) + '%'; this.el.knob.style.background = Math.abs(sk.balance) > 0.7 ? '#ff4d3d' : '#ffd84d'; }
    else this.el.balance.classList.remove('on');
    // location
    if (loc && loc !== this._lastLoc) { this._lastLoc = loc; this.el.loc.textContent = loc; this.el.loc.parentElement.classList.add('flash'); setTimeout(() => this.el.loc.parentElement.classList.remove('flash'), 600); }
    if (this._calloutT > 0) { this._calloutT -= dt; if (this._calloutT <= 0) this.el.callout.classList.remove('on'); }
    this.el.speed.textContent = `${Math.round(sk.speed * 2.237)} mph`;
    if (this.mapOn) this.drawMap(sk);
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
    // spots
    for (const sp of sk.spots) { const px = sp.x * s + this.mapOX - sx, pz = sp.z * s + this.mapOZ - sz; if (px < -5 || pz < -5 || px > W + 5 || pz > H + 5) continue; g.fillStyle = sk.spotsHit.has(sp.name) ? 'rgba(120,230,140,0.9)' : 'rgba(255,216,77,0.9)'; g.beginPath(); g.arc(px, pz, 3, 0, Math.PI * 2); g.fill(); }
    g.restore();
    // skater arrow
    g.save(); g.translate(W / 2, H / 2); g.rotate(-sk.yaw); g.fillStyle = '#fff'; g.beginPath(); g.moveTo(0, -8); g.lineTo(6, 6); g.lineTo(0, 3); g.lineTo(-6, 6); g.closePath(); g.fill(); g.restore();
    g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 2; g.beginPath(); g.arc(W / 2, H / 2, W / 2 - 3, 0, Math.PI * 2); g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.7)'; g.font = 'bold 11px system-ui, sans-serif'; g.textAlign = 'center'; g.fillText('N', W / 2, 14);
  }
}
