// builder E — skate furniture. Everything the real Marketplace does NOT have but a skate
// game wants everywhere: kicker ramps, quarter pipes, funboxes, flat rails and manual pads
// down every block of the mall, a halfpipe in City Hall Park, a full plaza up in Battery
// Park, and grindable handrails bolted onto every real staircase OSM says has one.
//
// Physics contract (see skate.js): a 'ramp' kind launches with the slope, a 'quarter' kind
// additionally kills most horizontal speed at the lip so you go UP and come back in.
// Coping and rails are 'rail'/'handrail' edges; pads are 'pad' surfaces (roll-on-able).
import * as THREE from '../vendor/three.module.min.js';

const THETA_MAX = 70 * Math.PI / 180;          // top-of-transition angle (slope ≈ 2.75)
const RISE = 1 - Math.cos(THETA_MAX);          // face height = RISE * radius

export function buildSkatepark(ctx) {
  const { scene, collide, WORLD, spots, quality } = ctx;
  const mobile = !!quality.mobile;

  // ---- palette -------------------------------------------------------------
  const CONC = 0x9b9f9c, CONC2 = 0x8a8e8c, SKIRT = 0x6f7472;
  const PLY = 0xa87f4e, PLY2 = 0x8a6238, FRAME = 0x5d452a;
  const STEEL = 0xb9bec6, POST = 0x2e3134, ACCENT = 0x2c9a58;

  // ---- one merged vertex-coloured mesh for everything ----------------------
  const pos = [], col = [];
  const _c = new THREE.Color();
  function tri(a, b, c, hex) {
    _c.set(hex);
    pos.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
    for (let i = 0; i < 3; i++) col.push(_c.r, _c.g, _c.b);
  }
  function quad(a, b, c, d, hex) { tri(a, b, c, hex); tri(a, c, d, hex); }
  // axis-aligned-in-frame box helper: F = frame, centre (lr, lf) at base y0, size w×h×d
  function fbox(F, lr, lf, y0, w, h, d, hex) {
    const p = (dr, df, y) => { const q = F.P(lr + dr, lf + df); return [q[0], y, q[1]]; };
    const hw = w / 2, hd = d / 2, t = y0 + h;
    quad(p(-hw, -hd, t), p(-hw, hd, t), p(hw, hd, t), p(hw, -hd, t), hex);
    quad(p(-hw, -hd, y0), p(-hw, -hd, t), p(hw, -hd, t), p(hw, -hd, y0), hex);
    quad(p(hw, hd, y0), p(hw, hd, t), p(-hw, hd, t), p(-hw, hd, y0), hex);
    quad(p(-hw, hd, y0), p(-hw, hd, t), p(-hw, -hd, t), p(-hw, -hd, y0), hex);
    quad(p(hw, -hd, y0), p(hw, -hd, t), p(hw, hd, t), p(hw, hd, y0), hex);
  }
  // rail tube along frame f-axis at lateral lr, from f0..f1, heights y0..y1, radius r
  function tube(F, lr, f0, y0, f1, y1, r, hex, nSeg) {
    const n = nSeg || (mobile ? 5 : 7);
    const len = Math.hypot(f1 - f0, y1 - y0);
    const ux = (f1 - f0) / len, uy = (y1 - y0) / len;      // along, in (f, y) plane
    const ring = (f, y) => {
      const out = [];
      for (let i = 0; i < n; i++) {
        const a = i / n * Math.PI * 2;
        const c = Math.cos(a) * r, s = Math.sin(a) * r;
        // ring basis: lateral (r-axis) and the in-plane normal (−uy, ux)
        const q = F.P(lr + c, f + s * -uy);
        out.push([q[0], y + s * ux, q[1]]);
      }
      return out;
    };
    const A = ring(f0, y0), B = ring(f1, y1);
    for (let i = 0; i < n; i++) quad(A[i], A[(i + 1) % n], B[(i + 1) % n], B[i], hex);
  }

  function frame(x, z, yaw) {
    const ux = -Math.sin(yaw), uz = -Math.cos(yaw);        // facing, matches fwd()
    const rx = -uz, rz = ux;                               // rider's right of facing
    return { x, z, ux, uz, rx, rz, yaw, P: (lr, lf) => [x + rx * lr + ux * lf, z + rz * lr + uz * lf] };
  }
  const gY = (x, z) => collide.groundAt(x, z, 500, 1000).y;

  // ===========================================================================
  // pieces
  // ===========================================================================

  // wedge launch ramp: approach riding along +facing, low edge first
  function kicker(x, z, yaw, w, h, len, name) {
    const F = frame(x, z, yaw);
    const y0 = Math.min(gY(...F.P(0, -len / 2)), gY(...F.P(0, len / 2))) + 0.01;
    const hw = w / 2, f0 = -len / 2, f1 = len / 2, top = y0 + h;
    const p = (lr, lf, y) => { const q = F.P(lr, lf); return [q[0], y, q[1]]; };
    const fb = f1 + h / 1.15;                              // steep back bank reaches ground here
    quad(p(-hw, f0, y0 + 0.02), p(-hw, f1, top), p(hw, f1, top), p(hw, f0, y0 + 0.02), PLY);    // face
    quad(p(-hw, fb, y0 + 0.02), p(-hw, f1, top), p(hw, f1, top), p(hw, fb, y0 + 0.02), PLY2);   // back bank
    tri(p(-hw, f0, y0 - 0.3), p(-hw, fb, y0 - 0.3), p(-hw, f1, top), FRAME);                    // sides
    tri(p(hw, f0, y0 - 0.3), p(hw, f1, top), p(hw, fb, y0 - 0.3), FRAME);
    quad(p(-hw, f1, top), p(-hw, f1 + 0.06, top - 0.04), p(hw, f1 + 0.06, top - 0.04), p(hw, f1, top), ACCENT); // lip trim
    const a = F.P(0, f0), b = F.P(0, f1);
    collide.addRamp({ ax: a[0], az: a[1], bx: b[0], bz: b[1], w, yLow: y0, yHigh: top, kind: 'ramp', name: name || 'Kicker' });
    // The back is a steep bank, NOT a wall: oncoming riders pop UP off it instead of
    // bailing face-first. Its high edge stops short of the lip so both directions lose
    // support at the top and the ride-off launch fires.
    const bkA = F.P(0, fb), bkB = F.P(0, f1 + 0.35);
    collide.addRamp({ ax: bkA[0], az: bkA[1], bx: bkB[0], bz: bkB[1], w, yLow: y0, yHigh: top - 0.35 * 1.15, kind: 'ramp', name: name || 'Kicker' });
  }

  // quarter pipe facing +yaw: skater rides at it, up the transition, off the lip.
  // (x,z) = centre of the base of the transition. Piecewise ramps under a curved face.
  function quarter(x, z, yaw, w, H, name, opts = {}) {
    const F = frame(x, z, yaw);
    const R = H / RISE, fT = R * Math.sin(THETA_MAX), deck = opts.deck ?? 1.8;
    const y0 = opts.baseY ?? (Math.min(gY(...F.P(-w / 2, 0)), gY(...F.P(w / 2, 0)), gY(x, z)) + 0.01);
    const hw = w / 2, top = y0 + H;
    const prof = (th) => [R * Math.sin(th), y0 + R * (1 - Math.cos(th))];  // [f, y]
    const p = (lr, lf, y) => { const q = F.P(lr, lf); return [q[0], y, q[1]]; };
    // curved face (visual) + side profile panels
    const M = mobile ? 5 : 8;
    let prev = prof(0);
    for (let i = 1; i <= M; i++) {
      const cur = prof(i / M * THETA_MAX);
      quad(p(-hw, prev[0], prev[1]), p(-hw, cur[0], cur[1]), p(hw, cur[0], cur[1]), p(hw, prev[0], prev[1]), i % 2 ? CONC : CONC2);
      for (const s of [-1, 1]) tri(p(s * hw, 0, y0 - 0.3), p(s * hw, prev[0], prev[1]), p(s * hw, cur[0], cur[1]), SKIRT);
      prev = cur;
    }
    for (const s of [-1, 1]) tri(p(s * hw, 0, y0 - 0.3), p(s * hw, fT, top), p(s * hw, fT + deck, top), SKIRT);
    // deck, then a rideable BANK down the back (roll in from behind, drop in over the coping)
    quad(p(-hw, fT, top), p(-hw, fT + deck, top), p(hw, fT + deck, top), p(hw, fT, top), PLY2);
    const gB = gY(...F.P(0, fT + deck + H / 1.25));
    const fB = fT + deck + Math.max(0.6, (top - gB) / 1.25);
    quad(p(-hw, fB, gB + 0.02), p(-hw, fT + deck, top), p(hw, fT + deck, top), p(hw, fB, gB + 0.02), CONC2);
    for (const s of [-1, 1]) {
      quad(p(s * hw, fT, y0 - 0.3), p(s * hw, fT, top), p(s * hw, fT + deck, top), p(s * hw, fT + deck, y0 - 0.3), SKIRT);
      tri(p(s * hw, fT + deck, gB - 0.3), p(s * hw, fT + deck, top), p(s * hw, fB, gB + 0.02), SKIRT);
    }
    const bkA = F.P(0, fB), bkB = F.P(0, fT + deck);
    collide.addRamp({ ax: bkA[0], az: bkA[1], bx: bkB[0], bz: bkB[1], w, yLow: gB, yHigh: top, kind: 'ramp', name });
    // coping: steel pipe across the lip
    {
      const A = F.P(-hw, fT), B = F.P(hw, fT);
      const n2 = mobile ? 5 : 7;
      for (let i = 0; i < n2; i++) {
        const a0 = i / n2 * Math.PI * 2, a1 = (i + 1) / n2 * Math.PI * 2;
        const q = (t, a) => [A[0] + (B[0] - A[0]) * t + F.ux * Math.cos(a) * 0.055, top + 0.03 + Math.sin(a) * 0.055, A[1] + (B[1] - A[1]) * t + F.uz * Math.cos(a) * 0.055];
        quad(q(0, a0), q(0, a1), q(1, a1), q(1, a0), STEEL);
      }
    }
    // physics: piecewise ramps up the arc, top strip is the 'quarter'. The top strip
    // overshoots the lip by half a metre (rising past coping height): the deck is level
    // with the lip, so without the overshoot a rider would roll straight onto the deck
    // and the ride-off launch would never fire. With it, crossing the coping ends on a
    // support 1+ m above the deck → instant drop → the launch conversion pops them up.
    const N = 4;
    for (let i = 0; i < N; i++) {
      const [f0, h0] = prof(i / N * THETA_MAX), [f1, h1] = prof((i + 1) / N * THETA_MAX);
      const ov = i === N - 1 ? 0.5 : 0;
      const slope = (h1 - h0) / (f1 - f0);
      const a = F.P(0, f0), b = F.P(0, f1 + ov);
      collide.addRamp({ ax: a[0], az: a[1], bx: b[0], bz: b[1], w, yLow: h0, yHigh: h1 + ov * slope, kind: i === N - 1 ? 'quarter' : 'ramp', name });
    }
    const ca = F.P(-hw, fT), cb = F.P(hw, fT);
    collide.addEdge({ ax: ca[0], ay: top + 0.05, az: ca[1], bx: cb[0], by: top + 0.05, bz: cb[1], kind: 'rail', name: (name || 'Quarter') + ' coping' });
    const dc = F.P(0, fT + deck / 2);
    collide.addSurface({ x: dc[0], z: dc[1], w, d: deck, yaw, top, bottom: y0, kind: 'platform', name: (name || 'Quarter') + ' deck', grindable: false });
    for (const s of [-1, 1]) {
      const w0 = F.P(s * hw, fT), w1 = F.P(s * hw, fT + deck);
      collide.addWall({ ax: w0[0], az: w0[1], bx: w1[0], bz: w1[1], top, name });
    }
    return { y0, top, fT, F };
  }

  // platform with launch wedges on both ends and grindable long edges
  function funbox(x, z, yaw, w, topLen, h, name) {
    const F = frame(x, z, yaw);
    const y0 = Math.min(gY(x, z), gY(...F.P(0, -topLen / 2)), gY(...F.P(0, topLen / 2))) + 0.01;
    const rampLen = h / 0.4, hw = w / 2, hd = topLen / 2, top = y0 + h;
    fbox(F, 0, 0, y0 - 0.2, w, h + 0.2, topLen, CONC);
    const p = (lr, lf, y) => { const q = F.P(lr, lf); return [q[0], y, q[1]]; };
    for (const s of [-1, 1]) {
      const f0 = s * (hd + rampLen), f1 = s * hd;
      quad(p(-hw, f0, y0 + 0.02), p(-hw, f1, top), p(hw, f1, top), p(hw, f0, y0 + 0.02), PLY);
      tri(p(-hw, f0, y0), p(-hw, f1, y0), p(-hw, f1, top), FRAME);
      tri(p(hw, f0, y0), p(hw, f1, top), p(hw, f1, y0), FRAME);
      const a = F.P(0, f0), b = F.P(0, f1);
      collide.addRamp({ ax: a[0], az: a[1], bx: b[0], bz: b[1], w, yLow: y0, yHigh: top, kind: 'ramp', name });
    }
    collide.addSurface({ x, z, w, d: topLen, yaw, top, bottom: y0, kind: 'platform', name: name || 'Funbox', grindable: true, edgeKind: 'ledge' });
  }

  // round flat rail on posts, grindable, along +facing
  function rail(x, z, yaw, len, h, name) {
    const F = frame(x, z, yaw);
    const a = F.P(0, -len / 2), b = F.P(0, len / 2);
    const ya = gY(a[0], a[1]), yb = gY(b[0], b[1]);
    tube(F, 0, -len / 2, ya + h, len / 2, yb + h, 0.045, STEEL);
    for (const t of [-0.42, 0, 0.42]) {
      const q = F.P(0, t * len), y = ya + (yb - ya) * (t + 0.5);
      fbox(F, 0, t * len, y, 0.07, h - 0.02, 0.07, POST);
      collide.addBlocker({ x: q[0], z: q[1], r: 0.05, top: y + h, name: name || 'Rail' });
    }
    collide.addEdge({ ax: a[0], ay: ya + h + 0.02, az: a[1], bx: b[0], by: yb + h + 0.02, bz: b[1], kind: 'rail', name: name || 'Rail' });
  }

  // low pad you can roll straight onto — manuals and lip tricks
  function manualPad(x, z, yaw, w, len, name) {
    const F = frame(x, z, yaw);
    const y0 = gY(x, z);
    fbox(F, 0, 0, y0 - 0.05, w, 0.23, len, CONC);
    fbox(F, 0, 0, y0 + 0.175, w + 0.04, 0.012, len + 0.04, ACCENT);
    collide.addSurface({ x, z, w, d: len, yaw, top: y0 + 0.18, bottom: y0, kind: 'pad', name: name || 'Manual pad', grindable: true, edgeKind: 'ledge' });
  }

  // two quarters face to face + flat + entry aprons at both open ends
  function halfpipe(x, z, yaw, L, H, flat, name) {
    const F = frame(x, z, yaw);            // yaw = pipe axis direction
    // level the floor to the highest ground under the footprint
    const R = H / RISE, fT = R * Math.sin(THETA_MAX), deck = 2.0;
    const halfW = flat / 2 + fT + deck;
    let y0 = -Infinity;
    for (const lr of [-halfW, 0, halfW]) for (const lf of [-L / 2, 0, L / 2]) y0 = Math.max(y0, gY(...F.P(lr, lf)));
    y0 += 0.03;
    // floor slab
    fbox(F, 0, 0, y0 - 0.55, flat + 0.2, 0.55, L, CONC2);
    collide.addSurface({ x, z, w: flat + 2 * fT, d: L, yaw, top: y0, bottom: y0 - 1, kind: 'ramp', name: (name || 'Halfpipe') + ' flat' });
    // The two transitions. A quarter's face rises AHEAD of its base lip along its facing,
    // and its facing = the direction a skater travels to ride it. The left wall (−r) is
    // ridden travelling −r, so it faces −r (yaw+π/2) and rises away from the centre.
    quarter(...F.P(-flat / 2, 0), F.yaw + Math.PI / 2, L, H, name, { baseY: y0, deck });
    quarter(...F.P(flat / 2, 0), F.yaw - Math.PI / 2, L, H, name, { baseY: y0, deck });
    // entry aprons at the two open ends
    for (const s of [-1, 1]) {
      const fa = s * (L / 2 + 1.7), fb = s * (L / 2);
      const ga = gY(...F.P(0, fa));
      const a = F.P(0, fa), b = F.P(0, fb);
      collide.addRamp({ ax: a[0], az: a[1], bx: b[0], bz: b[1], w: flat, yLow: ga, yHigh: y0, kind: 'ramp', name });
      const p = (lr, lf, y) => { const q = F.P(lr, lf); return [q[0], y, q[1]]; };
      quad(p(-flat / 2, fa, ga + 0.01), p(-flat / 2, fb, y0), p(flat / 2, fb, y0), p(flat / 2, fa, ga + 0.01), PLY);
    }
    return y0;
  }

  // ===========================================================================
  // placement: the mall spine
  // ===========================================================================
  const CS = WORLD.churchStreet;
  if (CS && CS.centerline && CS.centerline.length > 1) {
    const CL = CS.centerline;
    const cum = [0];
    for (let i = 1; i < CL.length; i++) cum.push(cum[i - 1] + Math.hypot(CL[i][0] - CL[i - 1][0], CL[i][1] - CL[i - 1][1]));
    const LEN = cum[cum.length - 1];
    function at(s) {
      s = Math.max(0, Math.min(LEN, s));
      let i = 1; while (i < cum.length - 1 && cum[i] < s) i++;
      const a = CL[i - 1], b = CL[i], seg = cum[i] - cum[i - 1] || 1;
      const t = (s - cum[i - 1]) / seg;
      const dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1;
      return { x: a[0] + dx * t, z: a[1] + dz * t, tx: dx / l, tz: dz / l };
    }
    const posAt = (s, off) => { const p = at(s); return { x: p.x + off * p.tz, z: p.z - off * p.tx, tx: p.tx, tz: p.tz }; };
    function sOf(x, z) {
      let bd = 1e9, bs = 0;
      for (let i = 1; i < CL.length; i++) {
        const a = CL[i - 1], b = CL[i], dx = b[0] - a[0], dz = b[1] - a[1], l2 = dx * dx + dz * dz || 1;
        let t = ((x - a[0]) * dx + (z - a[1]) * dz) / l2; t = Math.max(0, Math.min(1, t));
        const d = Math.hypot(a[0] + dx * t - x, a[1] + dz * t - z);
        if (d < bd) { bd = d; bs = cum[i - 1] + t * Math.hypot(dx, dz); }
      }
      return bs;
    }
    const yawFwd = (tx, tz) => Math.atan2(-tx, -tz);       // fwd(yaw) = (tx, tz)
    const crossS = {};
    for (const k in (CS.crossings || {})) crossS[k] = sOf(CS.crossings[k][0], CS.crossings[k][1]);
    const BLOCKS = [['Pearl', 'Cherry'], ['Cherry', 'Bank'], ['Bank', 'College'], ['College', 'Main']]
      .filter(([a, b]) => crossS[a] !== undefined && crossS[b] !== undefined)
      .map(([a, b], i) => ({ i, a: crossS[a] + 9, b: crossS[b] - 9 }));

    for (const bl of BLOCKS) {
      const span = bl.b - bl.a;
      const S = (t) => bl.a + span * t;
      const put = (s, off, fwdAlong, fn) => {              // fwdAlong: +1 faces up-s, −1 down-s
        const p = posAt(s, off);
        const yaw = yawFwd(p.tx * fwdAlong, p.tz * fwdAlong);
        fn(p.x, p.z, yaw);
      };
      // quarter pipes capping both ends of the block, facing into it
      put(S(0) + 5.6, 0, -1, (x, z, yaw) => quarter(x, z, yaw, 3.6, 1.8, 'Mall quarter'));
      put(S(1) - 5.6, 0, 1, (x, z, yaw) => quarter(x, z, yaw, 3.6, 1.8, 'Mall quarter'));
      // kickers mid-block, one each way
      put(S(0.30), 0, 1, (x, z, yaw) => kicker(x, z, yaw, 2.3, 1.0, 2.7, 'Mall kicker'));
      put(S(0.70), 0, -1, (x, z, yaw) => kicker(x, z, yaw, 2.3, 1.0, 2.7, 'Mall kicker'));
      // funbox dead centre
      put(S(0.5), 0, 1, (x, z, yaw) => funbox(x, z, yaw, 2.6, 6, 0.6, 'Mall funbox'));
      // flat rails beside the line, alternating sides
      const rs = bl.i % 2 ? 1 : -1;
      put(S(0.20), rs * 1.45, 1, (x, z, yaw) => rail(x, z, yaw, 6.5, 0.55, 'Mall rail'));
      put(S(0.80), -rs * 1.45, 1, (x, z, yaw) => rail(x, z, yaw, 6.5, 0.55, 'Mall rail'));
      // manual pads near the block mouths
      put(S(0.11), 0, 1, (x, z, yaw) => manualPad(x, z, yaw, 2.2, 4.5, 'Manual pad'));
      put(S(0.89), 0, 1, (x, z, yaw) => manualPad(x, z, yaw, 2.2, 4.5, 'Manual pad'));
    }
    if (BLOCKS.length > 1) {
      const c = posAt((BLOCKS[1].a + BLOCKS[1].b) / 2, 0);
      spots.push({ name: 'Marketplace ramp jam', x: c.x, z: c.z, r: 14, bonus: 200 });
    }
  }

  // ===========================================================================
  // City Hall Park: a halfpipe on the lawn + a rail line
  // ===========================================================================
  {
    // on the open lawn, west of the fountain, clear of the buildings inside the park bbox
    // and east of the path-light line at x ≈ −89
    const hx = -80, hz = 52;
    halfpipe(hx, hz, Math.PI / 2, 14, 2.2, 3.4, 'City Hall Park halfpipe');
    rail(-80, 78, 0, 8, 0.55, 'Park rail');
    kicker(-76, 92, Math.PI, 2.3, 0.9, 2.7, 'Park kicker');
    spots.push({ name: 'City Hall Park halfpipe', x: hx, z: hz, r: 12, bonus: 250 });
  }

  // ===========================================================================
  // Battery Park: the big plaza over the lake
  // ===========================================================================
  {
    // the flat upper lawn: west of Battery St (x ≲ −527), east of the bluff (x ≳ −562),
    // north of Monroe St (z ≳ −465)
    quarter(-552, -424, 0, 5, 2.4, 'Battery vert');              // faces north (ride −z at it)
    quarter(-552, -396, Math.PI, 5, 2.4, 'Battery vert');        // faces south — a launch-line pair
    funbox(-537, -408, 0, 2.8, 7, 0.6, 'Battery funbox');
    halfpipe(-545, -446, 0, 18, 3.0, 4.2, 'Battery halfpipe');
    rail(-560, -420, 0, 8, 0.6, 'Battery rail');
    rail(-533, -425, 0, 8, 0.6, 'Battery rail');
    kicker(-560, -440, 0, 2.4, 1.0, 2.9, 'Battery kicker');
    kicker(-537, -394, Math.PI, 2.4, 1.0, 2.9, 'Battery kicker');
    spots.push({ name: 'Battery Park skate plaza', x: -546, z: -420, r: 32, bonus: 300 });
  }

  // ===========================================================================
  // MEGA SENDS — two structures that are too big for a plaza
  // ===========================================================================
  // (a) THE BLUFF BOMBER. Roll-in tower on the flat top of the Battery Park bluff, feeding
  //     a steep kicker aimed WEST straight off the edge, with a mega-ramp landing
  //     transition down the hillside to catch the fall and turn it back into roll speed.
  //
  //     Placement note: the brief's z −400…−430 is FLAT in the real USGS terrain (it falls
  //     1.3 m over 50 m). The actual bluff is ~40 m south — at z −375 the ground drops from
  //     +1.0 at x −560 to −12 at x −610. The whole structure moved there. z −375 is also
  //     the one line through here that clears the curved stone overlook wall (which arcs
  //     x −538…−557 between z −330 and −368) and the buildings at x ≈ −500…−508.
  {
    const Z = -375, YAW = Math.PI / 2;            // facing west: fwd(π/2) = (−1, 0)
    const F = frame(-540, Z, YAW);                // lf increases WEST, so x = −540 − lf
    const P = (lr, lf, y) => { const q = F.P(lr, lf); return [q[0], y, q[1]]; };
    const HW = 3.5, H = 8;                        // deck half-width, tower height
    const gDeck = gY(-540, Z), top = gDeck + H;
    // --- back entry ramp: pushed up from the plaza. 8 m of rise needs ~16.5 m/s at the
    //     bottom whatever the run length — just past the cold push ceiling and comfortably
    //     inside the flow-boosted one. Earning the tower is the point.
    //     Its foot stops at x −521: Park Street (primary, with live traffic) crosses this
    //     axis at x ≈ −514, and a ramp base sitting in the roadway meant cars picked riders
    //     off halfway up it.
    {
      const y0 = gY(-521, Z);
      quad(P(-HW, -19, y0 + 0.02), P(-HW, -3, top), P(HW, -3, top), P(HW, -19, y0 + 0.02), PLY);
      tri(P(-HW, -19, y0 - 0.3), P(-HW, -3, top), P(-HW, -3, y0 - 0.3), FRAME);
      tri(P(HW, -19, y0 - 0.3), P(HW, -3, y0 - 0.3), P(HW, -3, top), FRAME);
      collide.addRamp({ ax: -521, az: Z, bx: -537, bz: Z, w: 2 * HW, yLow: y0, yHigh: top, kind: 'ramp', name: 'Bluff Bomber ramp' });
    }
    // --- the deck itself
    fbox(F, 0, 0, top - 0.5, 2 * HW, 0.5, 6, CONC);
    for (const s of [-1, 1]) quad(P(s * HW, -3, gDeck - 0.3), P(s * HW, -3, top - 0.5), P(s * HW, 3, top - 0.5), P(s * HW, 3, gDeck - 0.3), SKIRT);
    collide.addSurface({ x: -540, z: Z, w: 2 * HW, d: 6, yaw: YAW, top, bottom: gDeck, kind: 'platform', name: 'Bluff Bomber deck', grindable: false });
    // --- roll-in face: 8 m of drop in 11 m. Its high edge must land EXACTLY on the deck's
    //     west edge (x −543) and then overshoot a little further east, UNDER the deck. An
    //     earlier version stopped 0.5 m short and that crack threw the rider into the air
    //     off the deck, over the whole transition, to land at 5 m/s at the bottom — the
    //     roll-in did nothing. Ramp and surface footprints have to touch or overlap, never
    //     merely come close (same rule as the City Hall landing).
    {
      const y1 = gY(-554, Z), over = 0.4;
      const slope = (top - y1) / 11;              // −554 (ground) → −543 (deck edge)
      quad(P(-HW, 3, top), P(-HW, 14, y1 + 0.02), P(HW, 14, y1 + 0.02), P(HW, 3, top), PLY);
      for (const s of [-1, 1]) tri(P(s * HW, 3, top), P(s * HW, 14, y1 + 0.02), P(s * HW, 3, y1 - 0.3), FRAME);
      collide.addRamp({ ax: -554, az: Z, bx: -543 + over, bz: Z, w: 2 * HW, yLow: y1, yHigh: top + slope * over, kind: 'ramp', name: 'Bluff Bomber roll-in' });
    }
    // --- the launch kicker, right on the lip
    // --- the launch lip. Steep (49°) on purpose: the ride-off launch conserves energy, so
    //     the vertical you get is speed × sin(ramp angle), NOT speed × slope. At the ~20 m/s
    //     the roll-in delivers, a gentler 0.55 face only lifted ~3 m; 49° clears 6 m+.
    kicker(-558, Z, YAW, 6, 2.6, 2.3, 'Bluff Bomber lip');
    // --- NO landing ramp. An earlier version had a big mega-ramp landing transition down
    //     the hillside, and it was both unnecessary and wrong: the natural bluff already
    //     falls at ~22° here, which the land() plane projection turns into 21–27 m/s of
    //     roll speed on its own. Worse, a structure that tall stands metres above the
    //     terrain the rider is actually travelling on, and groundAt rejects any support
    //     above yHint + stepUp — so riders passed straight through it.
    spots.push({ name: 'The Bluff Bomber', x: -556, z: Z, r: 26, bonus: 400 });
  }

  // (b) THE COLLEGE ST SUPER KICKER, aimed west at the Battery Street intersection.
  //     Placement note: the OSM College Street centreline through here actually runs at
  //     z ≈ 20…28 and traffic.js puts cars 1.4–1.95 m either side of it, so a 6 m kicker
  //     in the roadway proper would be straddling both lanes. The line players really bomb
  //     (and the one scripts/playtest.mjs drives) is the open corridor at z ≈ 10, which
  //     carries no road polyline at all — ~25 m off the nearest car path. Battery St
  //     crosses at x ≈ −485…−503.
  //     z ≈ 10 specifically: the neighbouring lane at z ≈ −5 has a building corner at
  //     x ≈ −476 (wall from z −10.6 to −0.7), and a kicker there fired every single rider
  //     straight into it 4 m after takeoff. z = 10 is clear from x −440 to −504.
  //     The face is ~42°, near the range-optimal 45°, because clearing the whole
  //     intersection needs distance rather than height.
  {
    kicker(-470, 10, Math.PI / 2, 6, 1.9, 2.1, 'College St super kicker');
    spots.push({ name: 'College St super kicker', x: -470, z: 10, r: 14, bonus: 300 });
  }

  // (c) TWO MORE STREET MEGAS. Same rules as (b): traffic.js runs cars only 1.4–1.95 m
  //     either side of the OSM centreline and parks them ~1 m inside the kerb, so the
  //     rideable corridor is the strip between the car lane and the parked line — every
  //     coordinate here was checked headless against walls, blockers and both car paths.
  {
    // Main St hill, aimed west down the drop toward the waterfront. The roadway proper
    // (z 130-134 here) carries cars and a bus stop/tree line at its south kerb; the wide
    // north-side corridor at z 141 is clear from x -235 to -315 (surveyed headless).
    kicker(-272, 141, Math.PI / 2, 6, 1.9, 2.1, 'Main St mega kicker');
    spots.push({ name: 'Main St mega kicker', x: -272, z: 141, r: 14, bonus: 300 });
    // Battery St, aimed west OFF the street over the waterfront slope — a natural
    // mini-bluff: the ground west of the roadway falls away hard and the landing
    // projection turns the drop back into roll speed.
    kicker(-505.5, -150, Math.PI / 2, 5, 2.1, 2.2, 'Battery St launch');
    spots.push({ name: 'Battery St launch', x: -505.5, z: -150, r: 14, bonus: 300 });
  }

  // ===========================================================================
  // handrails on every real staircase that has one
  // ===========================================================================
  {
    const seen = new Set(); const flights = [];
    const take = (pts, tags) => {
      if (!pts || pts.length < 2) return;
      const k = pts[0][0].toFixed(1) + ',' + pts[0][1].toFixed(1) + '|' + pts[pts.length - 1][0].toFixed(1);
      if (seen.has(k)) return; seen.add(k);
      flights.push({ pts, tags: tags || {} });
    };
    for (const l of WORLD.lines || []) if (l.kind === 'steps') take(l.pts, l.tags);
    for (const r of WORLD.roads || []) if (r.kind === 'steps') take(r.pts, r);
    for (const f of flights) {
      if (String(f.tags.handrail).toLowerCase() !== 'yes') continue;
      const a = f.pts[0], b = f.pts[f.pts.length - 1];
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (len < 1) continue;
      // only where ground.js actually built the flight (it culls far-away steps)
      const ramp = collide.all.ramps.find(r => r.kind === 'stairs' &&
        Math.min(Math.hypot(r.ax - a[0], r.az - a[1]), Math.hypot(r.ax - b[0], r.az - b[1]),
          Math.hypot(r.bx - a[0], r.bz - a[1]), Math.hypot(r.bx - b[0], r.bz - b[1])) < 3);
      if (!ramp) continue;
      const hw = ramp.w / 2 - 0.12, hr = 0.85;
      const ux = ramp.ux, uz = ramp.uz, vx = uz, vz = -ux;
      for (const s of ramp.w > 3.2 ? [-1, 1] : [1]) {
        const A = [ramp.ax + vx * s * hw - ux * 0.25, ramp.az + vz * s * hw - uz * 0.25];
        const B = [ramp.bx + vx * s * hw + ux * 0.25, ramp.bz + vz * s * hw + uz * 0.25];
        const yA = ramp.yLow + hr, yB = ramp.yHigh + hr;
        // pipe + two posts
        const F2 = frame(A[0], A[1], Math.atan2(-(B[0] - A[0]), -(B[1] - A[1])));
        const l2 = Math.hypot(B[0] - A[0], B[1] - A[1]);
        tube(F2, 0, 0, yA, l2, yB, 0.04, STEEL);
        fbox(F2, 0, 0.1, ramp.yLow, 0.06, hr, 0.06, POST);
        fbox(F2, 0, l2 - 0.1, ramp.yHigh, 0.06, hr, 0.06, POST);
        collide.addEdge({ ax: A[0], ay: yA, az: A[1], bx: B[0], by: yB, bz: B[1], kind: 'handrail', name: (ramp.name || 'Steps') + ' rail' });
      }
    }
  }

  // ---- commit the mesh -----------------------------------------------------
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }));
  mesh.name = 'skatepark';
  mesh.castShadow = !!quality.shadows; mesh.receiveShadow = true;
  mesh.matrixAutoUpdate = false; mesh.updateMatrix();
  scene.add(mesh);
}
