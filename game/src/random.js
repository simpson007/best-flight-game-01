// Aurora Courier — deterministic seeded random numbers.
// One clear job: every random choice in the game comes from a seed, so a
// screenshot taken with ?seed=N always shows the same world.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Smooth 1-D value noise from a seed: stable hills, no jumps.
export function makeNoise(seed) {
  const rand = mulberry32(seed);
  const knots = [];
  for (let i = 0; i < 64; i++) knots.push(rand() * 2 - 1);
  return function noise(x) {
    const xi = Math.floor(x);
    const xf = x - xi;
    const a = knots[((xi % 64) + 64) % 64];
    const b = knots[(((xi + 1) % 64) + 64) % 64];
    const u = xf * xf * (3 - 2 * xf);
    return a + (b - a) * u;
  };
}

export function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
export function lerp(a, b, t) { return a + (b - a) * t; }
