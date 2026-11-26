// Aurora Courier — the game loop and its states.
// One clear job: own the frame, the state machine (title / play / leg /
// over), the score, the announcements and the screenshot mode.
import { CFG } from './config.js';
import { Input } from './input.js';
import { World } from './world.js';
import { Flight } from './physics.js';
import { Renderer } from './render.js';
import { applyShot } from './shots.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const params = new URLSearchParams(location.search);
const shotName = params.get('shot');
const seed = Number(params.get('seed') || 7);

const input = new Input(canvas);
const world = new World(seed);
const flight = new Flight();
const renderer = new Renderer(canvas);
flight.best = Number(localStorage.getItem('aurora-courier-best') || 0);
// Title screen: the plane waits on the take-off runway.
flight.dist = world.takeoffAt(1) + 20;

let state = 'title'; // title | play | leg | over
let legTimer = 0;
let audio = null;

function beep(freq, dur, type = 'sine', gain = 0.06) {
  try {
    audio = audio || new (window.AudioContext || window.webkitAudioContext)();
    const o = audio.createOscillator(), g = audio.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(gain, audio.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + dur);
    o.connect(g).connect(audio.destination);
    o.start(); o.stop(audio.currentTime + dur);
  } catch { /* sound is garnish; silence never breaks the game */ }
}

function announce(text, sub, secs = 2.2) {
  renderer.announce = { text, sub: sub || '', until: renderer.time + secs };
}

function startLeg(leg) {
  world.buildLeg(leg);
  flight.leg = leg;
  flight.x = 0; flight.y = 4; flight.dist = world.takeoffAt(leg) + 20;
  flight.speed = 0; flight.throttle = 0.55;
  flight.bank = 0; flight.pitch = 0; flight.heading = 0;
  flight.fuel = 100; flight.landed = false; flight.crashed = false;
  flight.ringsHit = 0;
  state = 'play';
}

function startGame() {
  flight.reset();
  flight.best = Number(localStorage.getItem('aurora-courier-best') || 0);
  startLeg(1);
  announce('LEG 1 — FLY THE RINGS', 'Six rings, then land on runway 09');
}

function endGame(reason) {
  state = 'over';
  flight.crashReason = reason;
  if (flight.score > flight.best) {
    flight.best = flight.score;
    localStorage.setItem('aurora-courier-best', String(flight.best));
  }
}

function handleEvents(events) {
  for (const e of events) {
    if (e.type === 'ring') {
      renderer.burst(e.ring.x, e.ring.y, e.ring.z, '255,211,77', 26);
      announce('RING  +100', 'Fuel topped up');
      beep(880, 0.18, 'sine', 0.08);
      setTimeout(() => beep(1318, 0.22, 'sine', 0.06), 90);
    } else if (e.type === 'graze') {
      announce('BALLOON HIT', 'Damage ' + Math.round(flight.damage) + '%');
      beep(180, 0.3, 'sawtooth', 0.07);
    } else if (e.type === 'fuel') {
      announce('FUEL EMPTY', 'Glide her down gently');
    } else if (e.type === 'crash') {
      endGame(e.reason);
      beep(90, 0.7, 'sawtooth', 0.1);
    } else if (e.type === 'land') {
      announce('TOUCHDOWN', 'Smooth landing — bonus +500');
      beep(523, 0.15, 'sine', 0.07);
      setTimeout(() => beep(784, 0.2, 'sine', 0.07), 120);
    } else if (e.type === 'leg') {
      flight.leg += 1;
      state = 'leg';
      legTimer = 0;
    }
  }
}

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;

  if (state === 'title') {
    if (input.hit('Enter')) startGame();
    // Idle drift: the plane waits on the runway, clouds slide by.
    world.clouds.forEach((c) => { c.z = (c.z + dt * 6) % 4200; });
  } else if (state === 'play') {
    if (flight.speed > 4) renderer.trail(flight);
    const steer = input.steer();
    const events = flight.step(dt, steer, input, world);
    handleEvents(events);
    if (flight.crashed) endGame('terrain');
  } else if (state === 'leg') {
    legTimer += dt;
    if (input.hit('Enter') || legTimer > 6) startLeg(flight.leg);
  } else if (state === 'over') {
    if (input.hit('r', 'R', 'Enter')) startGame();
  }

  for (const r of world.rings) if (r.flash > 0) r.flash = Math.max(0, r.flash - dt * 1.4);
  renderer.frame(flight, world, state);
  input.endFrame();
  requestAnimationFrame(frame);
}

// Screenshot mode: one fixed, beautiful moment, frozen in time.
if (shotName) {
  applyShot(flight, world, shotName, seed);
  state = 'play';
  renderer.frame(flight, world, 'play');
  // Keep rendering the frozen frame so headless capture always sees it.
  setInterval(() => renderer.frame(flight, world, 'play'), 100);
} else {
  requestAnimationFrame(frame);
}
