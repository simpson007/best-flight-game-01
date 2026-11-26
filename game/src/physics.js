// Aurora Courier — the flight model.
// One clear job: hold the aircraft's state and advance it one step from the
// pilot's input, the world and the clock. No drawing here.
import { CFG } from './config.js';
import { clamp } from './random.js';

export class Flight {
  constructor() {
    this.reset();
  }

  reset() {
    this.x = 0; this.y = 4; this.dist = 0;
    this.speed = 0; this.throttle = 0.55;
    this.bank = 0; this.pitch = 0; this.heading = 0;
    this.fuel = 100; this.damage = 0; this.score = 0;
    this.ringsHit = 0; this.leg = 1; this.landed = false;
    this.crashed = false; this.time = 0; this.boosting = false;
  }

  // dt in seconds. Returns events: [{type:'ring'|'crash'|'land'|'leg'|'fuel', ...}]
  step(dt, steer, input, world) {
    const F = CFG.flight;
    const events = [];
    this.time += dt;
    if (this.crashed) return events;

    // Throttle and speed: climb bleeds speed, descent gains it.
    if (input.throttleUp()) this.throttle = clamp(this.throttle + F.throttleUp * dt, 0, 1);
    if (input.throttleDown()) this.throttle = clamp(this.throttle - F.throttleDown * dt, 0, 1);
    this.boosting = input.boost() && this.fuel > 0;
    const target = F.minSpeed + (F.maxSpeed - F.minSpeed) * this.throttle + (this.boosting ? 26 : 0);
    const climbBleed = Math.max(0, this.pitch) * 22;
    this.speed += clamp(target - climbBleed - this.speed, -34 * dt, 26 * dt);
    this.speed = clamp(this.speed, 0, F.maxSpeed + 30);

    // Bank and pitch follow the stick, with a little lag for weight.
    this.bank += clamp(steer.roll * F.bankRate - this.bank, -3.2 * dt, 3.2 * dt);
    this.pitch += clamp(steer.pitch * 0.9 - this.pitch, -2.2 * dt, 2.2 * dt);
    this.bank = clamp(this.bank, -1, 1);
    this.pitch = clamp(this.pitch, -1, 1);

    // Turning: bank steers the heading, heading steers the lateral position.
    this.heading += this.bank * F.turnRate * (this.speed / F.cruiseSpeed) * dt;
    this.x += Math.sin(this.heading) * this.speed * dt * 0.9;
    this.x = clamp(this.x, -F.lateralLimit, F.lateralLimit);
    this.y += this.pitch * F.climbRate * dt - Math.max(0, 0.45 - this.throttle) * 6 * dt;
    this.y = clamp(this.y, F.minAltitude, F.maxAltitude);
    this.dist += this.speed * dt * 0.55;

    // Fuel: throttle burns it, rings and landings refill it.
    const drain = (0.35 + this.throttle) * F.fuelDrain + (this.boosting ? F.boostDrain : 0);
    this.fuel -= drain * dt;
    if (this.fuel <= 0) {
      this.fuel = 0;
      this.throttle = 0;
      events.push({ type: 'fuel' });
    }

    // Rings: fly through the hoop.
    for (const ring of world.rings) {
      if (ring.passed) continue;
      if (Math.abs(ring.z - this.dist) < 14) {
        const dx = ring.x - this.x, dy = ring.y - this.y;
        if (dx * dx + dy * dy < ring.radius * ring.radius) {
          ring.passed = true; ring.flash = 1;
          this.ringsHit++;
          this.score += F.ringScore;
          this.fuel = clamp(this.fuel + F.ringFuel, 0, 100);
          events.push({ type: 'ring', ring });
        }
      }
    }

    // Balloons: a soft hit costs damage and bounces the plane.
    for (const b of world.balloons) {
      if (Math.abs(b.z - this.dist) < 10) {
        const dx = b.x - this.x, dy = b.y - this.y;
        if (dx * dx + dy * dy < (b.r + 4) * (b.r + 4)) {
          this.damage += F.damageBalloon;
          this.bank = -this.bank;
          events.push({ type: 'graze', damage: this.damage });
          b.z = -9999; // popped, out of the way
        }
      }
    }

    // Terrain: the ground is unforgiving.
    const ground = world.groundHeight(this.x, this.dist);
    if (this.y <= ground + 1.5 && !world.isRunway(this.x, this.dist)) {
      this.damage = 100;
      this.crashed = true;
      events.push({ type: 'crash', reason: 'terrain' });
    } else if (this.damage >= 100) {
      this.crashed = true;
      events.push({ type: 'crash', reason: 'damage' });
    }

    // Runway: slow, low and aligned over the strip is a landing.
    const runwayZ = world.runwayAt(world.leg);
    if (!this.landed && this.dist >= runwayZ && this.dist <= runwayZ + 320) {
      if (world.isRunway(this.x, this.dist) && this.y <= ground + 4 && this.speed < 95) {
        this.landed = true;
        this.score += F.legBonus;
        this.fuel = clamp(this.fuel + F.legFuel, 0, 100);
        events.push({ type: 'land' });
      }
    }

    // Leg complete: landed and rolled to the end of the strip.
    if (this.landed && this.dist >= runwayZ + 300) {
      events.push({ type: 'leg' });
    }
    return events;
  }

  speedKts() { return Math.round(this.speed * 1.6); }
  altitudeFt() { return Math.round(this.y * 32); }
  headingDeg() { return Math.round(((this.heading * 57.2958) % 360 + 360) % 360); }
}
