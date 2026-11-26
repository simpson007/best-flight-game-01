// Aurora Courier — deterministic screenshot scenes.
// One clear job: given ?shot=start|flight|river|landing&seed=N, put the
// plane, the world and the HUD into one fixed, beautiful moment, so the
// screenshots the entry ships are reproducible renders of this code.
import { CFG } from './config.js';

export function applyShot(flight, world, shot, seed) {
  // Every shot uses the same seeded world so the terrain never changes.
  if (shot === 'start') {
    // On the runway at golden hour, engine idling, strip ahead.
    flight.x = 0; flight.y = 4; flight.dist = world.takeoffAt(1) + 20;
    flight.speed = 0; flight.throttle = 0.35; flight.bank = 0; flight.pitch = 0;
    flight.fuel = 100; flight.score = 0; flight.ringsHit = 0; flight.leg = 1;
    world.buildLeg(1);
  } else if (shot === 'flight') {
    // Mid-flight, banking through a ring, valley and river below.
    flight.x = -14; flight.y = 52; flight.dist = 1180;
    flight.speed = 118; flight.throttle = 0.8; flight.bank = 0.55; flight.pitch = 0.1;
    flight.fuel = 72; flight.score = 340; flight.ringsHit = 3; flight.leg = 1;
    world.buildLeg(1);
    const ring = world.rings[2];
    ring.x = flight.x + 16; ring.y = flight.y + 6; ring.z = flight.dist + 130;
  } else if (shot === 'river') {
    // Low pass over the river at sunset, balloon drifting ahead.
    flight.x = world.riverX(640); flight.y = 16; flight.dist = 640;
    flight.speed = 132; flight.throttle = 0.85; flight.bank = -0.3; flight.pitch = -0.12;
    flight.fuel = 58; flight.score = 520; flight.ringsHit = 4; flight.leg = 1;
    world.buildLeg(1);
    world.balloons[0].x = flight.x + 20; world.balloons[0].y = 34;
    world.balloons[0].z = flight.dist + 150;
  } else if (shot === 'landing') {
    // Final approach: runway lights ahead, gear down, gentle descent.
    flight.x = 2; flight.y = 12; flight.dist = world.runwayAt(1) - 120;
    flight.speed = 66; flight.throttle = 0.3; flight.bank = 0.06; flight.pitch = -0.18;
    flight.fuel = 41; flight.score = 890; flight.ringsHit = 6; flight.leg = 1;
    world.buildLeg(1);
    for (const r of world.rings) r.passed = true;
  }
  return shot;
}

export const SHOT_NAMES = ['start', 'flight', 'river', 'landing'];
