// Aurora Courier — keyboard and mouse input.
// One clear job: turn raw device events into a small, named control state
// the flight model reads every frame.
export class Input {
  constructor(canvas) {
    this.keys = new Set();
    this.mouseX = 0.5; // 0..1 across the canvas
    this.mouseY = 0.5;
    this.mouseActive = false;
    this.pressed = new Set(); // keys pressed since last frame (edge-triggered)
    window.addEventListener('keydown', (e) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) e.preventDefault();
      if (!this.keys.has(e.key)) this.pressed.add(e.key);
      this.keys.add(e.key);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.key));
    canvas.addEventListener('mousemove', (e) => {
      const r = canvas.getBoundingClientRect();
      this.mouseX = (e.clientX - r.left) / r.width;
      this.mouseY = (e.clientY - r.top) / r.height;
      this.mouseActive = true;
    });
    canvas.addEventListener('mousedown', () => { this.mouseActive = true; });
    window.addEventListener('blur', () => this.keys.clear());
  }

  down(...names) { return names.some((n) => this.keys.has(n)); }
  hit(...names) { return names.some((n) => this.pressed.has(n)); }
  endFrame() { this.pressed.clear(); }

  // Steering intent from keys, -1..1 on each axis. Mouse steers too, gently.
  steer() {
    let roll = 0, pitch = 0;
    if (this.down('ArrowLeft', 'a', 'A')) roll -= 1;
    if (this.down('ArrowRight', 'd', 'D')) roll += 1;
    if (this.down('ArrowUp', 'w', 'W')) pitch += 1;
    if (this.down('ArrowDown', 's', 'S')) pitch -= 1;
    if (this.mouseActive && !this.keys.size) {
      roll += (this.mouseX - 0.5) * 1.6;
      pitch += (0.5 - this.mouseY) * 1.2;
    }
    return { roll: Math.max(-1, Math.min(1, roll)), pitch: Math.max(-1, Math.min(1, pitch)) };
  }

  throttleUp() { return this.down('Shift'); }
  throttleDown() { return this.down('Control', 'c', 'C'); }
  boost() { return this.down(' '); }
}
