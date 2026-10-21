/** Relative motion inside an accelerating window; no screen/cursor tracking.
 * Input is window velocity in logical pixels/second, NOT direction or distance.
 * Rendering/character artwork is intentionally independent of the physics.
 */
export type ImpactSide = "left" | "right" | "top" | "bottom";
export interface InertiaState {
  x: number;
  y: number;
  vx: number;
  vy: number;
  bend: number;
  bendVelocity: number;
  impact: null | {
    side: ImpactSide;
    strength: number;
    age: number;
    serial: number;
  };
}
const clamp = (n: number, min: number, max: number) =>
  Math.max(min, Math.min(max, n));
export class WindowInertia {
  readonly state: InertiaState = {
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    bend: 0,
    bendVelocity: 0,
    impact: null,
  };
  private windowVX = 0;
  private windowVY = 0;
  private hold = 0;
  private cooldown = 0;
  private serial = 0;
  private enabled = true;
  constructor(private bounds = { x: 110, y: 64 }) {}
  setBounds(x: number, y: number) {
    this.bounds = { x: Math.max(12, x), y: Math.max(8, y) };
    this.reset();
  }
  /** Every sample describes the CURRENT velocity. Repeating it adds no force. */
  velocity(x: number, y: number) {
    if (!this.enabled || !Number.isFinite(x) || !Number.isFinite(y)) return;
    x = clamp(x, -4000, 4000);
    y = clamp(y, -4000, 4000);
    const dx = x - this.windowVX,
      dy = y - this.windowVY;
    this.windowVX = x;
    this.windowVY = y;
    // In the window reference frame acceleration produces the OPPOSITE impulse.
    // Also apply braking: a right-moving window stopping pushes the mascot right.
    this.state.vx = clamp(this.state.vx - 0.82 * dx, -3000, 3000);
    this.state.vy = clamp(this.state.vy - 0.66 * dy, -2500, 2500);
    this.state.bendVelocity = clamp(
      // Keep translational momentum unchanged: lower-speed drags bend the body
      // more visibly without gaining the energy of a violent wall collision.
      this.state.bendVelocity - 1.1 * dx,
      -600,
      600,
    );
    // During the short comic contact hold, accumulate new momentum without
    // cancelling the visible impact pose. It is released on the next substep.
  }
  setEnabled(enabled: boolean) {
    if (this.enabled === enabled) return;
    this.enabled = enabled;
    this.reset();
  }
  reset() {
    Object.assign(this.state, {
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      bend: 0,
      bendVelocity: 0,
      impact: null,
    });
    this.windowVX = this.windowVY = this.hold = this.cooldown = 0;
  }
  advance(seconds: number) {
    if (!this.enabled || !Number.isFinite(seconds) || seconds <= 0)
      return this.state;
    // Hidden windows / resumed tabs must not turn missing time into a violent jump.
    if (seconds > 0.25) {
      this.reset();
      return this.state;
    }
    const steps = Math.ceil(seconds / (1 / 240)),
      dt = seconds / steps,
      s = this.state;
    for (let i = 0; i < steps; i++) {
      this.cooldown = Math.max(0, this.cooldown - dt);
      if (s.impact) {
        s.impact.age += dt;
        if (s.impact.age > 0.46) s.impact = null;
      }
      if (this.hold > 0) {
        this.hold = Math.max(0, this.hold - dt);
        continue;
      }
      s.vx += (-72 * s.x - 9 * s.vx) * dt;
      s.vy += (-96 * s.y - 11 * s.vy) * dt;
      s.bendVelocity += (-95 * s.bend - 10 * s.bendVelocity) * dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.bend += s.bendVelocity * dt;
      s.bend = clamp(s.bend, -40, 40);
      const extentX = Math.max(12, this.bounds.x - Math.abs(s.bend) * 0.55);
      if (s.x < -extentX) this.collide("left", -extentX, Math.max(0, -s.vx));
      else if (s.x > extentX) this.collide("right", extentX, Math.max(0, s.vx));
      if (s.y < -this.bounds.y)
        this.collide("top", -this.bounds.y, Math.max(0, -s.vy));
      else if (s.y > this.bounds.y)
        this.collide("bottom", this.bounds.y, Math.max(0, s.vy));
      if (
        Math.abs(s.x) +
          Math.abs(s.y) +
          Math.abs(s.vx) +
          Math.abs(s.vy) +
          Math.abs(s.bend) +
          Math.abs(s.bendVelocity) <
        0.025
      ) {
        s.x = s.y = s.vx = s.vy = s.bend = s.bendVelocity = 0;
      }
    }
    return s;
  }
  private collide(side: ImpactSide, contact: number, speed: number) {
    const s = this.state,
      horizontal = side === "left" || side === "right";
    if (horizontal) {
      s.x = contact;
      s.vx *= -0.27;
      s.bendVelocity *= -0.3;
    } else {
      s.y = contact;
      s.vy *= -0.24;
    }
    // A touch isn't a comic crash; don't retrigger impact every frame at the wall.
    if (speed < 240 || (this.cooldown > 0 && s.impact?.side === side)) return;
    s.impact = {
      side,
      strength: clamp(speed / 1400, 0.18, 1),
      age: 0,
      serial: ++this.serial,
    };
    this.hold = 0.055 + Math.min(0.045, speed / 30000);
    this.cooldown = 0.22;
  }
}
