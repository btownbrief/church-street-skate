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
  // Tightened 8/24 (his call: "people should mostly land straight"): was 0.68 / 0.6 / 9,
  // which stuck almost anything. Sideways is a slam again; big airs earn a little slack.
  landTolerance: 0.55,     // rad (≈32°) between board yaw and velocity on landing
  landToleranceBigAir: 0.35, // extra tolerance fraction earned by long airs (up to ≈43° total)
  landAssistRate: 6,       // rad/s auto-align to the travel axis just before touchdown
  landAssistHeight: 1.4,   // m above the ground where the assist kicks in
  grindSnapDist: 0.6, grindSnapAbove: 0.55, grindSnapBelow: 0.25,
  grindFriction: 0.35,
  balanceDrift: 0.9, balanceCorrect: 3.2, balanceLimit: 1,
  bailTime: 1.6,
  wallBailSpeed: 6.5,
  skaterRadius: 0.32,
  // camera
  camDist: 5.2, camHeight: 2.1, camLookAhead: 2.4, camFov: 62,
  // scoring
  score: { ollie: 10, kickflip: 100, heelflip: 100, shoveit: 80, fsshoveit: 90, treflip: 300, varial: 220,
    hardflip: 260, varialkick: 220, inward: 260, laser: 340, backflip: 420,
    spin180: 80, spin360: 260, spin540: 600, spin720: 1100,
    grindPerSec: 90, grindBase: 80, manualBase: 60, manualPerSec: 70, bigAir: 50, revert: 60, maple: 1200 },
  runSeconds: 120,         // 2-MINUTE RUN mode
};
