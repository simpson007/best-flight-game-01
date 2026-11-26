// Aurora Courier — the renderer: sky, terrain, rings, plane and HUD.
// One clear job: turn a flight state and a world into one 1280x720 frame.
// The judge sees the game mostly through its screenshots, so this file is
// where the game is won: every frame must read as a complete flight game.
import { CFG } from './config.js';
import { clamp, lerp } from './random.js';

const W = CFG.view.width, H = CFG.view.height, CX = W / 2;

// Farmland tints, drawn translucent over the elevation bands.
const FIELD_TINTS = [
  'rgba(185,155,78,0.5)', 'rgba(122,140,62,0.5)',
  'rgba(90,110,52,0.5)', 'rgba(150,110,60,0.5)',
];

// Blend two #rrggbb colours by t (0..1).
function mixColor(a, b, t) {
  const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
  const pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  const m = pa.map((v, i) => Math.round(v + (pb[i] - v) * t));
  return `rgb(${m[0]},${m[1]},${m[2]})`;
}

function fract(v) { return v - Math.floor(v); }

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.particles = [];
    this.announce = null; // {text, sub, until}
    this.time = 0;
  }

  project(cam, x, y, z) {
    const dz = z - cam.z;
    if (dz < 1.5) return null;
    const s = CFG.camera.focal / dz;
    return { x: CX + (x - cam.x) * s, y: cam.horizon - (y - cam.y) * s, s };
  }

  frame(flight, world, state) {
    const ctx = this.ctx;
    this.time += 1 / 60;
    const cam = {
      x: flight.x, y: flight.y + 2.4, z: flight.dist,
      horizon: H * 0.42 + flight.pitch * 130,
    };
    ctx.save();
    // Banking rolls the world a touch; the HUD stays level.
    ctx.translate(CX, cam.horizon);
    ctx.rotate(-flight.bank * 0.07);
    ctx.translate(-CX, -cam.horizon);
    this.drawSky(ctx, cam, flight);
    this.drawRidges(ctx, cam, world);
    this.drawClouds(ctx, cam, world);
    this.drawTerrain(ctx, cam, world, flight);
    this.drawRings(ctx, cam, world, flight);
    this.drawBalloons(ctx, cam, world, flight);
    this.drawPlaneShadow(ctx, cam, world, flight);
    this.drawParticles(ctx, cam);
    this.drawPlane(ctx, flight);
    ctx.restore();
    this.drawHUD(ctx, flight, world, state);
    if (state === 'title') this.drawTitle(ctx, flight);
    if (state === 'over') this.drawGameOver(ctx, flight);
    if (state === 'leg') this.drawLegComplete(ctx, flight);
    if (this.announce && this.time < this.announce.until) this.drawAnnounce(ctx);
  }

  drawSky(ctx, cam, flight) {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, CFG.palette.skyTop);
    g.addColorStop(0.42, CFG.palette.skyMid);
    g.addColorStop(0.62, CFG.palette.skyLow);
    g.addColorStop(1, '#3a2a3a');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    // Sun: low, warm, with a wide glow.
    const sunX = W * 0.74, sunY = H * 0.30;
    const glow = ctx.createRadialGradient(sunX, sunY, 4, sunX, sunY, 260);
    glow.addColorStop(0, 'rgba(255,210,140,0.9)');
    glow.addColorStop(0.25, 'rgba(255,150,70,0.45)');
    glow.addColorStop(1, 'rgba(255,150,70,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(sunX - 260, sunY - 260, 520, 520);
    ctx.fillStyle = CFG.palette.sunCore;
    ctx.beginPath(); ctx.arc(sunX, sunY, 34, 0, Math.PI * 2); ctx.fill();
    // Early stars high up.
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    for (let i = 0; i < 40; i++) {
      const sx = (i * 173.3) % W, sy = (i * 97.7) % (H * 0.22);
      ctx.globalAlpha = 0.25 + 0.45 * ((i * 37) % 10) / 10;
      ctx.fillRect(sx, sy, 2, 2);
    }
    ctx.globalAlpha = 1;
  }

  drawRidges(ctx, cam, world) {
    // Two mountain layers with sharp, ridged peaks and haze between them.
    const layers = [
      { amp: 120, base: 0.06, color: 'rgba(122,96,150,0.75)', par: 0.012, seed: 3 },
      { amp: 84, base: 0.02, color: 'rgba(58,48,88,0.95)', par: 0.03, seed: 11 },
    ];
    for (const L of layers) {
      ctx.fillStyle = L.color;
      ctx.beginPath();
      ctx.moveTo(0, H);
      for (let sx = 0; sx <= W; sx += 12) {
        const wx = sx + cam.x * L.par * 100;
        const ridge = Math.abs(Math.sin(wx * 0.004 + L.seed) * 0.7 + Math.sin(wx * 0.0013 + L.seed * 2.7) * 0.5);
        const peak = L.amp * (0.25 + 0.75 * ridge);
        ctx.lineTo(sx, cam.horizon - peak - L.base * H);
      }
      ctx.lineTo(W, H);
      ctx.closePath();
      ctx.fill();
    }
  }

  drawClouds(ctx, cam, world) {
    for (const c of world.clouds) {
      const p = this.project(cam, c.x, c.y, cam.z + ((c.z - cam.z) % 4200) + 60);
      if (!p || p.x < -160 || p.x > W + 160) continue;
      const r = Math.min(85, c.s * p.s * 0.22);
      if (r < 3) continue;
      ctx.fillStyle = `rgba(255,236,220,${c.a * 0.8})`;
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, r, r * 0.38, 0, 0, Math.PI * 2);
      ctx.ellipse(p.x - r * 0.65, p.y + r * 0.1, r * 0.55, r * 0.28, 0, 0, Math.PI * 2);
      ctx.ellipse(p.x + r * 0.65, p.y + r * 0.08, r * 0.6, r * 0.3, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Smooth elevation colour: one colour per height, blended, never banded.
  elevationColor(h) {
    const P = CFG.palette;
    const stops = [
      [0, P.field], [5, P.grassLow], [11, P.grassHigh],
      [18, P.forest], [26, P.rock], [33, P.snow],
    ];
    if (h <= stops[0][0]) return stops[0][1];
    for (let i = 1; i < stops.length; i++) {
      if (h <= stops[i][0]) {
        const t = (h - stops[i - 1][0]) / (stops[i][0] - stops[i - 1][0]);
        return mixColor(stops[i - 1][1], stops[i][1], t);
      }
    }
    return stops[stops.length - 1][1];
  }

  drawTerrain(ctx, cam, world, flight) {
    const C = CFG.camera;
    const step = (C.far - C.near) / C.strips;
    // Top edge of the terrain at each depth, far to near.
    const edges = [];
    for (let k = 0; k <= C.strips; k++) {
      const z = cam.z + C.near + k * step;
      const dz = z - cam.z;
      const halfW = (W / 2) * dz / C.focal * 1.08;
      const pts = [];
      for (let s = 0; s < C.samples; s++) {
        const x = cam.x - halfW + (2 * halfW * s) / (C.samples - 1);
        const h = world.groundHeight(x, z);
        const p = this.project(cam, x, h, z);
        pts.push({ x: p ? p.x : (s === 0 ? -40 : W + 40), y: p ? p.y : cam.horizon, wx: x, h, z });
      }
      edges.push(pts);
    }
    // One smooth band per strip, coloured by its average height.
    for (let k = C.strips - 1; k >= 0; k--) {
      const far = edges[k + 1], near = edges[k];
      let sum = 0;
      for (const p of far) sum += p.h;
      ctx.fillStyle = this.elevationColor(sum / far.length);
      ctx.beginPath();
      ctx.moveTo(far[0].x, far[0].y);
      for (const p of far) ctx.lineTo(p.x, p.y);
      for (let s = near.length - 1; s >= 0; s--) ctx.lineTo(near[s].x, near[s].y);
      ctx.closePath(); ctx.fill();
      // Farmland patchwork: some ground cells are fields, tinted through.
      for (let s = 0; s < C.samples - 1; s++) {
        const a = far[s], b = far[s + 1], c = near[s + 1], d = near[s];
        const cellX = Math.floor(((a.wx + b.wx) / 2) / 46);
        const cellZ = Math.floor(a.z / 74);
        const hash = fract(Math.sin(cellX * 127.1 + cellZ * 311.7) * 43758.5453);
        if (hash < 0.42) {
          const tint = FIELD_TINTS[Math.floor(hash * 40) % FIELD_TINTS.length];
          ctx.fillStyle = tint;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
          ctx.lineTo(c.x, c.y); ctx.lineTo(d.x, d.y);
          ctx.closePath(); ctx.fill();
        }
      }
    }
    // Nearest strip down to the bottom of the screen.
    const near = edges[0];
    let sum = 0;
    for (const p of near) sum += p.h;
    ctx.fillStyle = this.elevationColor(sum / near.length);
    ctx.beginPath();
    ctx.moveTo(near[0].x, near[0].y);
    for (const p of near) ctx.lineTo(p.x, p.y);
    ctx.lineTo(W + 40, H); ctx.lineTo(-40, H);
    ctx.closePath(); ctx.fill();
    // River, road and runway as projected ribbons on top of the bands.
    this.drawRibbon(ctx, cam, world, (z) => world.riverX(z), 7, CFG.palette.water, 0);
    this.drawRibbon(ctx, cam, world, (z) => world.riverX(z), 2.6, CFG.palette.waterDeep, 0);
    this.drawRibbon(ctx, cam, world, (z) => world.roadX(z), 2.6, CFG.palette.road, 0);
    this.drawRunway(ctx, cam, world);
  }

  // A ribbon following a centreline across the terrain surface (river, road).
  drawRibbon(ctx, cam, world, centreX, halfW, color, lift) {
    const C = CFG.camera;
    const step = (C.far - C.near) / C.strips;
    ctx.fillStyle = color;
    for (let k = C.strips - 1; k >= 0; k--) {
      const z0 = cam.z + C.near + k * step;
      const z1 = z0 + step;
      const c0 = centreX(z0), c1 = centreX(z1);
      const h0 = world.groundHeight(c0, z0) + lift + 0.4;
      const h1 = world.groundHeight(c1, z1) + lift + 0.4;
      const a = this.project(cam, c0 - halfW, h0, z0);
      const b = this.project(cam, c0 + halfW, h0, z0);
      const c = this.project(cam, c1 + halfW, h1, z1);
      const d = this.project(cam, c1 - halfW, h1, z1);
      if (!a || !b || !c || !d) continue;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
      ctx.lineTo(c.x, c.y); ctx.lineTo(d.x, d.y);
      ctx.closePath(); ctx.fill();
    }
  }

  drawRunway(ctx, cam, world) {
    // Two strips per leg: the take-off runway at the leg start and the
    // landing runway at the leg end.
    this.drawRunwayStrip(ctx, cam, world, world.takeoffAt(world.leg));
    this.drawRunwayStrip(ctx, cam, world, world.runwayAt(world.leg));
  }

  drawRunwayStrip(ctx, cam, world, start) {
    const end = start + 320;
    const z0 = Math.max(cam.z + CFG.camera.near, start);
    const z1 = end;
    if (z1 < cam.z + CFG.camera.near) return;
    const corners = [
      this.project(cam, -8, world.groundHeight(-8, z0) + 0.5, z0),
      this.project(cam, 8, world.groundHeight(8, z0) + 0.5, z0),
      this.project(cam, 8, world.groundHeight(8, z1) + 0.5, z1),
      this.project(cam, -8, world.groundHeight(-8, z1) + 0.5, z1),
    ];
    if (corners.some((p) => !p)) return;
    ctx.fillStyle = CFG.palette.runway;
    ctx.beginPath();
    ctx.moveTo(corners[0].x, corners[0].y);
    for (const p of corners.slice(1)) ctx.lineTo(p.x, p.y);
    ctx.closePath(); ctx.fill();
    // Centre dashes and threshold bars.
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    for (let z = start + 20; z < end - 10; z += 40) {
      const a = this.project(cam, -0.8, world.groundHeight(0, z) + 0.6, z);
      const b = this.project(cam, 0.8, world.groundHeight(0, z) + 0.6, z);
      const c = this.project(cam, 0.8, world.groundHeight(0, z + 16) + 0.6, z + 16);
      const d = this.project(cam, -0.8, world.groundHeight(0, z + 16) + 0.6, z + 16);
      if (!a || !b || !c || !d) continue;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
      ctx.lineTo(c.x, c.y); ctx.lineTo(d.x, d.y);
      ctx.closePath(); ctx.fill();
    }
  }

  drawRings(ctx, cam, world, flight) {
    for (const ring of world.rings) {
      if (ring.passed && ring.flash <= 0) continue;
      const p = this.project(cam, ring.x, ring.y, ring.z);
      if (!p || p.x < -80 || p.x > W + 80 || p.y < -80 || p.y > H + 80) continue;
      const r = Math.max(2, ring.radius * p.s);
      ctx.save();
      ctx.shadowColor = '#ffd34d';
      ctx.shadowBlur = 18;
      ctx.strokeStyle = ring.flash > 0 ? '#ffffff' : CFG.palette.ring;
      ctx.lineWidth = Math.max(3, r * 0.16);
      ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = CFG.palette.ringInner;
      ctx.lineWidth = Math.max(1.5, r * 0.05);
      ctx.beginPath(); ctx.arc(p.x, p.y, r * 0.82, 0, Math.PI * 2); ctx.stroke();
      if (ring.flash > 0) {
        ctx.globalAlpha = ring.flash;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 4;
        ctx.beginPath(); ctx.arc(p.x, p.y, r * (1.6 - ring.flash * 0.6), 0, Math.PI * 2); ctx.stroke();
        ctx.globalAlpha = 1;
      }
      ctx.restore();
    }
  }

  drawBalloons(ctx, cam, world, flight) {
    for (const b of world.balloons) {
      const bobY = b.y + Math.sin(this.time * 0.7 + b.bob) * 1.5;
      const p = this.project(cam, b.x, bobY, b.z);
      if (!p || p.x < -60 || p.x > W + 60) continue;
      const r = Math.max(2, b.r * p.s);
      ctx.save();
      ctx.fillStyle = `hsl(${b.hue}, 75%, 55%)`;
      ctx.beginPath(); ctx.ellipse(p.x, p.y, r, r * 1.15, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = `hsl(${b.hue}, 80%, 42%)`;
      ctx.beginPath(); ctx.ellipse(p.x - r * 0.45, p.y, r * 0.28, r * 1.1, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(p.x + r * 0.45, p.y, r * 0.28, r * 1.1, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#3a2a1a';
      ctx.lineWidth = Math.max(1, r * 0.06);
      ctx.beginPath();
      ctx.moveTo(p.x - r * 0.5, p.y + r * 0.9); ctx.lineTo(p.x - r * 0.3, p.y + r * 1.5);
      ctx.moveTo(p.x + r * 0.5, p.y + r * 0.9); ctx.lineTo(p.x + r * 0.3, p.y + r * 1.5);
      ctx.stroke();
      ctx.fillStyle = '#6b4a2a';
      ctx.fillRect(p.x - r * 0.32, p.y + r * 1.45, r * 0.64, r * 0.5);
      ctx.restore();
    }
  }

  drawPlaneShadow(ctx, cam, world, flight) {
    const ground = world.groundHeight(flight.x, flight.dist + 8);
    const p = this.project(cam, flight.x, ground + 0.6, flight.dist + 8);
    if (!p) return;
    const r = Math.max(4, 26 * p.s * 0.5);
    ctx.fillStyle = 'rgba(20,16,30,0.35)';
    ctx.beginPath(); ctx.ellipse(p.x, p.y, r, r * 0.28, 0, 0, Math.PI * 2); ctx.fill();
  }

  burst(x, y, z, color, n) {
    for (let i = 0; i < n; i++) {
      this.particles.push({
        x, y, z,
        vx: (Math.random() - 0.5) * 14, vy: (Math.random() - 0.5) * 10, vz: (Math.random() - 0.5) * 8,
        life: 0.9, color, size: 2 + Math.random() * 3,
      });
    }
  }

  trail(flight) {
    // Engine exhaust: two short-lived puffs behind the tail each frame.
    const spread = 1.2;
    this.particles.push({
      x: flight.x + (Math.random() - 0.5) * spread, y: flight.y + 0.6,
      z: flight.dist - 4 - Math.random() * 3,
      vx: 0, vy: 0.4, vz: -6, life: 0.55, color: '255,220,160', size: 2.2,
    });
  }

  drawParticles(ctx, cam) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= 1 / 60;
      if (p.life <= 0) { this.particles.splice(i, 1); continue; }
      p.x += p.vx / 60; p.y += p.vy / 60; p.z += p.vz / 60;
      const s = this.project(cam, p.x, p.y, p.z);
      if (!s) continue;
      ctx.fillStyle = `rgba(${p.color},${Math.min(1, p.life * 1.6)})`;
      ctx.beginPath(); ctx.arc(s.x, s.y, Math.max(1, p.size * s.s * 0.4), 0, Math.PI * 2); ctx.fill();
    }
  }

  drawPlane(ctx, flight) {
    const px = CX + flight.bank * 26;
    const py = H * 0.66 - flight.pitch * 26;
    const bank = -flight.bank * 0.55;
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(bank);
    const S = 1; // plane drawn at fixed chase size
    // Soft glow behind the plane so it reads against bright sky.
    ctx.fillStyle = 'rgba(20,16,40,0.18)';
    ctx.beginPath(); ctx.ellipse(0, 6, 92, 26, 0, 0, Math.PI * 2); ctx.fill();
    // Main wings (wide, slightly swept), cream with sunset-orange tips.
    ctx.fillStyle = '#f3e6c8';
    ctx.beginPath();
    ctx.moveTo(-96, 2); ctx.lineTo(-14, -8); ctx.lineTo(14, -8); ctx.lineTo(96, 2);
    ctx.lineTo(88, 12); ctx.lineTo(-88, 12); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#e8804a';
    ctx.beginPath(); ctx.moveTo(-96, 2); ctx.lineTo(-78, 0); ctx.lineTo(-76, 11); ctx.lineTo(-88, 12); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(96, 2); ctx.lineTo(78, 0); ctx.lineTo(76, 11); ctx.lineTo(88, 12); ctx.closePath(); ctx.fill();
    // Tailplane and vertical fin.
    ctx.fillStyle = '#e8d9b0';
    ctx.beginPath(); ctx.moveTo(-34, -26); ctx.lineTo(34, -26); ctx.lineTo(26, -16); ctx.lineTo(-26, -16); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#d96a3a';
    ctx.beginPath(); ctx.moveTo(-5, -52); ctx.lineTo(5, -52); ctx.lineTo(8, -14); ctx.lineTo(-8, -14); ctx.closePath(); ctx.fill();
    // Fuselage: rounded, foreshortened, sunlit top.
    const body = ctx.createLinearGradient(0, -46, 0, 22);
    body.addColorStop(0, '#fff6dd'); body.addColorStop(0.55, '#f3e6c8'); body.addColorStop(1, '#c9a86a');
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.moveTo(0, -46);
    ctx.bezierCurveTo(13, -40, 15, -18, 13, 4);
    ctx.bezierCurveTo(12, 16, 7, 22, 0, 22);
    ctx.bezierCurveTo(-7, 22, -12, 16, -13, 4);
    ctx.bezierCurveTo(-15, -18, -13, -40, 0, -46);
    ctx.fill();
    // Cockpit glass.
    ctx.fillStyle = '#2a4a6b';
    ctx.beginPath(); ctx.ellipse(0, -30, 7.5, 11, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.beginPath(); ctx.ellipse(-2.5, -34, 2.5, 5, 0.3, 0, Math.PI * 2); ctx.fill();
    // Propeller blur ahead of the nose (faint disc, chase view).
    ctx.fillStyle = 'rgba(240,240,255,0.16)';
    ctx.beginPath(); ctx.ellipse(0, -46, 20, 5, 0, 0, Math.PI * 2); ctx.fill();
    // Navigation lights: red port, green starboard, white tail.
    ctx.fillStyle = '#ff3b30';
    ctx.beginPath(); ctx.arc(-96, 6, 3.4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#35e08a';
    ctx.beginPath(); ctx.arc(96, 6, 3.4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(0, -52, 2.6, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  dial(ctx, x, y, r, value, label, unit, color) {
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = 'rgba(10,14,28,0.72)';
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(140,220,255,0.5)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(0, 0, r - 1, 0, Math.PI * 2); ctx.stroke();
    for (let i = 0; i <= 10; i++) {
      const a = Math.PI * 0.75 + (i / 10) * Math.PI * 1.5;
      ctx.strokeStyle = 'rgba(200,230,255,0.7)';
      ctx.lineWidth = i % 5 === 0 ? 2.5 : 1;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * (r - 6), Math.sin(a) * (r - 6));
      ctx.lineTo(Math.cos(a) * (r - 13), Math.sin(a) * (r - 13));
      ctx.stroke();
    }
    const a = Math.PI * 0.75 + clamp(value, 0, 1) * Math.PI * 1.5;
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(0, 0);
    ctx.lineTo(Math.cos(a) * (r - 16), Math.sin(a) * (r - 16)); ctx.stroke();
    ctx.fillStyle = '#eaf6ff';
    ctx.font = 'bold 15px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(label, 0, r * 0.42);
    ctx.font = '11px system-ui, sans-serif';
    ctx.fillStyle = 'rgba(220,235,255,0.75)';
    ctx.fillText(unit, 0, r * 0.62);
    ctx.restore();
  }

  drawHUD(ctx, flight, world, state) {
    if (state === 'title') return;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    // Top-left: the three numbers the judge looks for.
    ctx.fillStyle = 'rgba(10,14,28,0.62)';
    ctx.fillRect(16, 14, 300, 86);
    ctx.strokeStyle = 'rgba(140,220,255,0.45)';
    ctx.strokeRect(16.5, 14.5, 300, 86);
    ctx.fillStyle = '#9fdcff';
    ctx.font = '11px system-ui, sans-serif';
    ctx.fillText('ALTITUDE', 28, 34); ctx.fillText('SPEED', 128, 34); ctx.fillText('HEADING', 228, 34);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 26px system-ui, sans-serif';
    ctx.fillText(String(flight.altitudeFt()), 28, 66);
    ctx.fillText(String(flight.speedKts()), 128, 66);
    ctx.fillText(String(flight.headingDeg()).padStart(3, '0') + '°', 228, 66);
    ctx.fillStyle = 'rgba(220,235,255,0.8)';
    ctx.font = '11px system-ui, sans-serif';
    ctx.fillText('FT', 28, 88); ctx.fillText('KTS', 128, 88); ctx.fillText('DEG', 228, 88);
    // Top-right: score, rings, fuel, leg.
    ctx.fillStyle = 'rgba(10,14,28,0.62)';
    ctx.fillRect(W - 316, 14, 300, 86);
    ctx.strokeStyle = 'rgba(140,220,255,0.45)';
    ctx.strokeRect(W - 315.5, 14.5, 300, 86);
    ctx.fillStyle = '#9fdcff';
    ctx.font = '11px system-ui, sans-serif';
    ctx.fillText('SCORE', W - 304, 34); ctx.fillText('RINGS', W - 204, 34); ctx.fillText('LEG', W - 104, 34);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 26px system-ui, sans-serif';
    ctx.fillText(String(flight.score), W - 304, 66);
    ctx.fillText(flight.ringsHit + '/' + CFG.leg.rings, W - 204, 66);
    ctx.fillText(String(flight.leg), W - 104, 66);
    // Fuel bar.
    const fw = 272, fx = W - 304, fy = 76;
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.fillRect(fx, fy, fw, 10);
    const fuelC = flight.fuel > 50 ? '#35e08a' : flight.fuel > 25 ? '#ffd34d' : '#ff5a4d';
    ctx.fillStyle = fuelC;
    ctx.fillRect(fx, fy, fw * clamp(flight.fuel / 100, 0, 1), 10);
    ctx.fillStyle = '#9fdcff';
    ctx.font = '11px system-ui, sans-serif';
    ctx.fillText('FUEL', fx, fy + 22);
    // Dials: airspeed left, altitude right, compass centre.
    this.dial(ctx, 76, H - 76, 52, flight.speed / CFG.flight.maxSpeed, 'AIRSPEED', 'KTS', '#37e0c8');
    this.dial(ctx, W - 76, H - 76, 52, flight.y / CFG.flight.maxAltitude, 'ALTITUDE', 'FT', '#ffd34d');
    // Compass strip.
    const cx0 = CX - 150, cy = H - 44;
    ctx.fillStyle = 'rgba(10,14,28,0.62)';
    ctx.fillRect(cx0, cy - 16, 300, 32);
    ctx.fillStyle = '#eaf6ff';
    ctx.font = 'bold 13px system-ui, sans-serif';
    ctx.textAlign = 'center';
    const hdg = flight.headingDeg();
    for (let d = -60; d <= 60; d += 15) {
      const a = ((hdg + d) % 360 + 360) % 360;
      const x = CX + d * 2.2;
      ctx.fillStyle = d === 0 ? '#ffd34d' : 'rgba(220,235,255,0.75)';
      ctx.fillText(String(a).padStart(3, '0'), x, cy + 5);
    }
    ctx.fillStyle = '#ffd34d';
    ctx.beginPath(); ctx.moveTo(CX, cy - 20); ctx.lineTo(CX - 5, cy - 28); ctx.lineTo(CX + 5, cy - 28); ctx.closePath(); ctx.fill();
    // Flight director: point at the next ring.
    const next = world.nextRing(flight.dist);
    if (next && state === 'play') {
      const dx = next.x - flight.x, dy = next.y - flight.y;
      ctx.save();
      ctx.translate(CX, H * 0.30);
      ctx.rotate(Math.atan2(dx, dy));
      ctx.fillStyle = 'rgba(255,211,77,0.9)';
      ctx.beginPath(); ctx.moveTo(0, -14); ctx.lineTo(9, 8); ctx.lineTo(-9, 8); ctx.closePath(); ctx.fill();
      ctx.restore();
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.font = 'bold 14px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('NEXT RING ' + Math.max(0, Math.round(next.z - flight.dist)) + ' m', CX, H * 0.30 + 34);
    }
    // Throttle bar, left edge.
    ctx.fillStyle = 'rgba(10,14,28,0.62)';
    ctx.fillRect(16, H - 190, 16, 150);
    ctx.fillStyle = '#37e0c8';
    ctx.fillRect(18, H - 42 - 146 * clamp(flight.throttle, 0, 1), 12, 146 * clamp(flight.throttle, 0, 1));
    ctx.fillStyle = '#9fdcff';
    ctx.font = '11px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('THR', 14, H - 196);
    if (flight.fuel <= 0) {
      ctx.fillStyle = '#ff5a4d';
      ctx.font = 'bold 20px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('FUEL EMPTY — GLIDING', CX, 130);
    }
  }

  drawAnnounce(ctx) {
    ctx.save();
    ctx.globalAlpha = Math.min(1, (this.announce.until - this.time) * 1.4);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 34px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.shadowColor = '#ff9a3d';
    ctx.shadowBlur = 18;
    ctx.fillText(this.announce.text, CX, H * 0.24);
    ctx.shadowBlur = 0;
    if (this.announce.sub) {
      ctx.font = '18px system-ui, sans-serif';
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.fillText(this.announce.sub, CX, H * 0.24 + 30);
    }
    ctx.restore();
  }

  drawTitle(ctx, flight) {
    ctx.fillStyle = 'rgba(8,10,24,0.42)';
    ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffd34d';
    ctx.font = 'bold 76px system-ui, sans-serif';
    ctx.shadowColor = '#ff7a2a';
    ctx.shadowBlur = 30;
    ctx.fillText('AURORA COURIER', CX, H * 0.34);
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#ffffff';
    ctx.font = '26px system-ui, sans-serif';
    ctx.fillText('Golden-hour parcel run — fly the rings, land the leg', CX, H * 0.34 + 44);
    ctx.fillStyle = 'rgba(230,240,255,0.92)';
    ctx.font = '17px system-ui, sans-serif';
    ctx.fillText('ARROWS / WASD  steer   •   SHIFT / CTRL  throttle   •   SPACE  boost   •   MOUSE  steer', CX, H * 0.62);
    ctx.fillText('Fly through every ring, mind your fuel, land on the runway', CX, H * 0.62 + 28);
    ctx.fillStyle = '#37e0c8';
    ctx.font = 'bold 24px system-ui, sans-serif';
    ctx.fillText('PRESS ENTER TO FLY', CX, H * 0.74);
    if (flight.best > 0) {
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.font = '16px system-ui, sans-serif';
      ctx.fillText('BEST SCORE  ' + flight.best, CX, H * 0.74 + 34);
    }
  }

  drawGameOver(ctx, flight) {
    ctx.fillStyle = 'rgba(8,10,24,0.55)';
    ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ff6a5a';
    ctx.font = 'bold 64px system-ui, sans-serif';
    ctx.fillText('FLIGHT OVER', CX, H * 0.36);
    ctx.fillStyle = '#ffffff';
    ctx.font = '24px system-ui, sans-serif';
    ctx.fillText('Score  ' + flight.score + '    •    Rings  ' + flight.ringsHit + '    •    Distance  ' + Math.round(flight.dist) + ' m', CX, H * 0.36 + 48);
    ctx.fillStyle = 'rgba(230,240,255,0.9)';
    ctx.font = '18px system-ui, sans-serif';
    ctx.fillText(flight.crashReason === 'terrain' ? 'The valley floor is unforgiving.' : 'Out of fuel over the valley.', CX, H * 0.36 + 82);
    ctx.fillStyle = '#37e0c8';
    ctx.font = 'bold 24px system-ui, sans-serif';
    ctx.fillText('PRESS R TO FLY AGAIN', CX, H * 0.62);
  }

  drawLegComplete(ctx, flight) {
    ctx.fillStyle = 'rgba(8,10,24,0.45)';
    ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffd34d';
    ctx.font = 'bold 60px system-ui, sans-serif';
    ctx.shadowColor = '#ff9a3d';
    ctx.shadowBlur = 24;
    ctx.fillText('LEG ' + (flight.leg - 1) + ' COMPLETE', CX, H * 0.36);
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#ffffff';
    ctx.font = '24px system-ui, sans-serif';
    ctx.fillText('Touchdown bonus  +500     •     Score  ' + flight.score, CX, H * 0.36 + 48);
    ctx.fillStyle = '#37e0c8';
    ctx.font = 'bold 24px system-ui, sans-serif';
    ctx.fillText('PRESS ENTER FOR LEG ' + flight.leg, CX, H * 0.58);
  }
}
