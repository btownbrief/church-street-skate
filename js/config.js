// Shared tuning constants. Builders: read, don't redefine.
export const CFG = {
  // skater physics
  maxPushSpeed: 9.5,       // m/s from pushing on flat
  pushImpulse: 2.4,        // m/s per push
  pushInterval: 0.55,      // s between pushes while holding forward
  rollFriction: 0.18,      // m/s^2 deceleration
  airDrag: 0.02,
  brakeDecel: 7,
  gravity: 17,             // a bit heavier than earth for snappy feel
  turnRate: 2.6,           // rad/s at low speed
  turnRateHighSpeed: 1.5,
  grip: 7,                 // how fast velocity aligns to heading (carve)
  ollieMin: 3.3, ollieMax: 5.6, ollieCharge: 0.45,
  spinRate: 5.2,           // rad/s in air at full stick
  flipTime: 0.42,
  landTolerance: 0.68,     // rad (≈39°) between board yaw and velocity on landing
  grindSnapDist: 0.6, grindSnapAbove: 0.55, grindSnapBelow: 0.25,
  grindFriction: 0.35,
  balanceDrift: 0.9, balanceCorrect: 3.2, balanceLimit: 1,
  bailTime: 1.6,
  wallBailSpeed: 6.5,
  skaterRadius: 0.32,
  // camera
  camDist: 5.2, camHeight: 2.1, camLookAhead: 2.4, camFov: 62,
  // scoring
  score: { ollie: 10, kickflip: 100, heelflip: 100, shoveit: 80, fsshoveit: 90, treflip: 300, varial: 220, spin180: 60, spin360: 180, spin540: 420, spin720: 800, grindPerSec: 90, grindBase: 80, manualBase: 60, manualPerSec: 70, bigAir: 50 },
};
