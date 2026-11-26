// Aurora Courier — the world: terrain, river, road, runway, rings, balloons.
// One clear job: given a seed, build the valley the pilot flies through and
// answer "what is the ground here" and "what is ahead" for the other files.
import { CFG } from './config.js';
import { makeNoise, mulberry32, clamp } from './random.js';

export class World {
  constructor(seed) {
    this.seed = seed;
    this.noise = makeNoise(seed);
    this.rand = mulberry32(seed * 7919 + 13);
    this.rings = [];
    this.balloons = [];
    this.clouds = [];
    this.leg = 1;
    this.buildLeg(1);
    this.buildClouds();
  }

  // Rolling valley floor: gentle swells plus a river valley carved along a
  // winding line, so the terrain reads as recognisable countryside.
  groundHeight(x, z) {
    const n = this.noise;
    let h = 5 + 11 * n(z * 0.004) + 6 * n(z * 0.011 + 40) + 4 * n(x * 0.02 + z * 0.002);
    h += 7 * Math.max(0, n(x * 0.008 - z * 0.0015)); // hills on the flanks
    const riverX = this.riverX(z);
    const dRiver = Math.abs(x - riverX);
    if (dRiver < 16) h = Math.min(h, 2.2 + dRiver * 0.12); // river valley
    const roadX = this.roadX(z);
    if (Math.abs(x - roadX) < 3.5) h = Math.min(h, 4.5); // road shelf
    // Airfield: flat ground along both runway corridors so take-off and
    // landing are fair, never a hill in the way.
    const start = this.runwayAt(this.leg);
    if (Math.abs(x) < 14 && z >= start - 420 && z <= start + 320) h = Math.min(h, 2.0);
    const take = this.takeoffAt(this.leg);
    if (Math.abs(x) < 14 && z >= take - 60 && z <= take + 340) h = Math.min(h, 2.0);
    return h;
  }

  riverX(z) {
    let x = 34 * Math.sin(z * 0.0035 + 1.2) + 12 * Math.sin(z * 0.0011 + 4.0);
    // Keep the river clear of every airfield: it bends east of the runway.
    const leg = Math.floor(z / CFG.leg.length) + 1;
    const rz = (leg - 1) * CFG.leg.length + CFG.leg.runwayAt;
    const d = z - rz;
    if (d > -600 && d < 500) {
      const t = Math.max(0, 1 - Math.abs(d + 50) / 550);
      const ease = t * t * (3 - 2 * t);
      x = x * (1 - ease) + 48 * ease;
    }
    return x;
  }
  roadX(z) {
    let x = -30 * Math.sin(z * 0.0021 + 0.6) - 8;
    // The road bends west of the airfield, clear of the runway.
    const leg = Math.floor(z / CFG.leg.length) + 1;
    const rz = (leg - 1) * CFG.leg.length + CFG.leg.runwayAt;
    const d = z - rz;
    if (d > -600 && d < 500) {
      const t = Math.max(0, 1 - Math.abs(d + 50) / 550);
      const ease = t * t * (3 - 2 * t);
      x = x * (1 - ease) - 45 * ease;
    }
    return x;
  }

  runwayAt(leg) { return (leg - 1) * CFG.leg.length + CFG.leg.runwayAt; }
  takeoffAt(leg) { return (leg - 1) * CFG.leg.length; }

  isRunway(x, z) {
    const start = this.runwayAt(this.leg);
    const take = this.takeoffAt(this.leg);
    return (z >= start && z <= start + 320 && Math.abs(x) < 8)
      || (z >= take && z <= take + 320 && Math.abs(x) < 8);
  }

  buildLeg(leg) {
    this.leg = leg;
    const base = (leg - 1) * CFG.leg.length;
    const rand = mulberry32(this.seed * 131 + leg * 977);
    this.rings = [];
    for (let i = 0; i < CFG.leg.rings; i++) {
      const z = base + 350 + i * ((CFG.leg.runwayAt - 420) / CFG.leg.rings);
      const rx = (rand() * 2 - 1) * 42;
      // Hoops sit above the local ground, never inside a hill.
      const ry = this.groundHeight(rx, z) + 14 + rand() * 36;
      this.rings.push({
        x: rx, y: ry,
        z, radius: CFG.flight.ringRadius,
        passed: false, flash: 0,
      });
    }
    this.balloons = [];
    const count = 4 + leg * 2;
    for (let i = 0; i < count; i++) {
      this.balloons.push({
        x: (rand() * 2 - 1) * 55,
        y: 22 + rand() * 55,
        z: base + 300 + rand() * (CFG.leg.runwayAt - 300),
        r: 6 + rand() * 3,
        hue: Math.floor(rand() * 360),
        bob: rand() * Math.PI * 2,
      });
    }
  }

  buildClouds() {
    const rand = mulberry32(this.seed * 31 + 7);
    for (let i = 0; i < 26; i++) {
      this.clouds.push({
        x: (rand() * 2 - 1) * 260,
        y: 95 + rand() * 70,
        z: rand() * 4200,
        s: 26 + rand() * 42,
        a: 0.35 + rand() * 0.4,
      });
    }
  }

  nextRing(dist) {
    for (const r of this.rings) if (!r.passed && r.z > dist - 20) return r;
    return null;
  }

  ringsLeft() { return this.rings.filter((r) => !r.passed).length; }
}
