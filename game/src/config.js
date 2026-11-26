// Aurora Courier — shared tuning constants.
// One clear job: every number that shapes how the game feels lives here.
export const CFG = {
  view: { width: 1280, height: 720 },
  camera: { focal: 620, near: 6, far: 520, strips: 30, samples: 18 },
  flight: {
    minSpeed: 42, maxSpeed: 168, cruiseSpeed: 96,
    climbRate: 26, sinkRate: 30, bankRate: 2.4, turnRate: 0.55,
    throttleUp: 0.45, throttleDown: 0.6,
    minAltitude: 3, maxAltitude: 130,
    lateralLimit: 70,
    fuelDrain: 1.15, boostDrain: 3.2, ringFuel: 14, legFuel: 40,
    ringRadius: 9, ringScore: 100, legBonus: 500,
    damageTerrain: 100, damageBalloon: 34, damageGraze: 12,
  },
  leg: { rings: 6, length: 2600, runwayAt: 2400 },
  palette: {
    skyTop: '#1b2a52', skyMid: '#7a4a8a', skyLow: '#e8804a', sunCore: '#ffe9b0',
    sunGlow: '#ff9a3d', cloud: 'rgba(255,236,220,0.85)',
    grassLow: '#4d8a3f', grassHigh: '#7fae4e', field: '#b99b4e', forest: '#2f6b34',
    rock: '#8a7f72', snow: '#e8ecf2', water: '#3f7fb8', waterDeep: '#2a5a8a',
    road: '#3a3a40', runway: '#2e2e33', ring: '#ffd34d', ringInner: '#37e0c8',
  },
};
