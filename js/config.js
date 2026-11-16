// Shared tuning constants. Builders: read, don't redefine.
export const CFG = {
  // skater physics
  maxPushSpeed: 16,       // m/s from pushing on flat
  pushImpulse: 4.2,        // m/s per push
  pushInterval: 0.42,      // s between pushes while holding forward
  rollFriction: 0.18,      // m/s^2 deceleration
  airDrag: 0.02,
  brakeDecel: 7,
  reverseAccel: 4.4,       // m/s^2 creeping off fakie (hold brake past a stop)
  maxReverseSpeed: 9,      // the S-creep cap only — W pushes switch at the full flow ceiling
  gravity: 17,             // a bit heavier than earth for snappy feel
  turnRate: 2.6,           // rad/s at low speed
  turnRateHighSpeed: 1.5,
  grip: 7,                 // how fast velocity aligns to heading (carve)
  // ollie pop speeds → peak height = v²/(2·gravity). 5.2 ≈ 0.8 m tap, 11.5 ≈ 3.9 m full —
  // deliberately super-human (Stephen wants big air): a full charge clears a parked car in
  // one hop and puts second-storey sign bands in reach.
  ollieMin: 5.2, ollieMax: 11.5, ollieCharge: 0.45,
  spinRate: 6.0,           // rad/s in air at full stick
  spinResponse: 14,        // how fast yawVel chases the stick in air (was 10 — spins start sooner)
  flipTime: 0.42,
  // 2026-11-16: the ASSIST makes people land straight; the game no longer slams them when it
  // doesn't. Up to landTolerance is clean, up to landSlam is a sketchy (kept) landing, past
  // that — truly sideways — is a slam. Was 0.55 clean / everything else a slam.
  landTolerance: 0.80,     // rad (≈46°) between board yaw and velocity on landing
  landSlam: 1.15,          // rad (≈66°) — beyond this the landing is a slam
  landToleranceBigAir: 0.35, // extra tolerance fraction earned by long airs (up to ≈43° total)
  landAssistRate: 10,       // rad/s auto-align to the travel axis just before touchdown
  landAssistHeight: 2.0,   // m above the ground where the assist kicks in
  grindSnapDist: 0.6, grindSnapAbove: 0.55, grindSnapBelow: 0.25,
  grindFriction: 0.35,
  balanceDrift: 0.9, balanceCorrect: 3.2, balanceLimit: 1,
  bailTime: 0.9,
  wallBailSpeed: 9,
  skaterRadius: 0.32,
  // camera
  camDist: 5.2, camHeight: 2.1, camLookAhead: 2.4, camFov: 62,
  // portrait: a little further back, higher, and pitched down so the skater's feet sit at
  // ~60% of the screen (above the thumbs) and the street ahead fills the view
  camDistPortrait: 5.0, camHeightPortrait: 2.8, camLookAheadPortrait: 3.2, camLookYPortrait: -0.6,
  // scoring
  score: { ollie: 10, kickflip: 100, heelflip: 100, shoveit: 80, fsshoveit: 90, treflip: 300, varial: 220,
    hardflip: 260, varialkick: 220, inward: 260, laser: 340, backflip: 420,
    spin180: 80, spin360: 260, spin540: 600, spin720: 1100,
    grindPerSec: 90, grindBase: 80, manualBase: 60, manualPerSec: 70, bigAir: 50, revert: 60, maple: 1200 },
  runSeconds: 90,          // TODAY'S LINE: 90 s, +5 s per letter (was a 120 s run)
  lastCall: 30,            // final seconds of a run: every bank counts double (was 20)
};
