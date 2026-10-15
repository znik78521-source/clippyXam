import { test } from "node:test";
import assert from "node:assert/strict";
import { WindowInertia } from "./window-inertia";
function advance(p: WindowInertia, seconds: number, hz = 120) {
  for (let i = 0; i < Math.round(seconds * hz); i++) p.advance(1 / hz);
}
test("accelerating window right throws mascot left; left throws it right", () => {
  for (const direction of [-1, 1]) {
    const p = new WindowInertia();
    p.velocity(direction * 450, 0);
    advance(p, 0.08);
    assert.ok(p.state.x * direction < 0);
    assert.ok(p.state.bend * direction < 0);
  }
});
test("constant velocity adds no force, even with many input events", () => {
  const a = new WindowInertia(),
    b = new WindowInertia();
  a.velocity(300, 0);
  b.velocity(300, 0);
  for (let i = 0; i < 120; i++) {
    a.velocity(300, 0);
    a.advance(1 / 120);
    b.advance(1 / 120);
  }
  assert.deepEqual(a.state, b.state);
  advance(a, 4);
  assert.equal(a.state.x, 0);
});
test("braking sends character forward rather than snapping it upright", () => {
  const p = new WindowInertia();
  p.velocity(600, 0);
  advance(p, 2);
  p.velocity(0, 0);
  advance(p, 0.08);
  assert.ok(p.state.x > 0);
  assert.ok(p.state.bend > 0);
});
test("gentle motion has only small sway and cannot trigger a crash", () => {
  const p = new WindowInertia();
  let max = 0,
    bend = 0;
  for (let i = 0; i < 360; i++) {
    const t = i / 120;
    p.velocity(t < 1 ? 70 * t : t < 2 ? 70 : 70 * (3 - t), 0);
    p.advance(1 / 120);
    max = Math.max(max, Math.abs(p.state.x));
    bend = Math.max(bend, Math.abs(p.state.bend));
    assert.equal(p.state.impact, null);
  }
  assert.ok(max < 5);
  assert.ok(bend < 2, `gentle motion must stay gentle: ${bend}`);
});
test("violent jerk makes contact with opposite wall, holds and rebounds", () => {
  const p = new WindowInertia();
  p.velocity(3600, 0);
  for (let i = 0; i < 60 && !p.state.impact; i++) p.advance(1 / 240);
  assert.equal(p.state.impact?.side, "left");
  assert.ok(p.state.impact!.strength > 0.5);
  const contact = p.state.x,
    serial = p.state.impact!.serial;
  p.advance(0.02);
  assert.equal(p.state.x, contact);
  advance(p, 0.2);
  assert.ok(p.state.x > contact);
  assert.equal(p.state.impact?.serial, serial);
  advance(p, 4);
  assert.equal(p.state.impact, null);
  assert.ok(Math.abs(p.state.x) < 0.05);
});
test("vertical impulses also have opposite-direction contact", () => {
  const p = new WindowInertia();
  p.velocity(0, 3600);
  advance(p, 0.1);
  assert.equal(p.state.impact?.side, "top");
});
test("integration stays stable and comparable at 30, 60 and 144 FPS", () => {
  const states = [30, 60, 144].map((hz) => {
    const p = new WindowInertia();
    p.velocity(600, 0);
    advance(p, 0.5, hz);
    return p.state.x;
  });
  assert.ok(Math.max(...states) - Math.min(...states) < 0.5);
});
test("invalid input, suspension and reduced motion cannot leave a stuck impact", () => {
  const p = new WindowInertia();
  p.velocity(NaN, Infinity);
  assert.equal(p.state.vx, 0);
  p.velocity(3600, 0);
  advance(p, 0.1);
  p.setEnabled(false);
  p.velocity(2000, 2000);
  advance(p, 1);
  assert.equal(p.state.x, 0);
  assert.equal(p.state.impact, null);
  p.setEnabled(true);
  p.velocity(400, 0);
  p.advance(1);
  assert.equal(p.state.x, 0);
  assert.equal(p.state.vx, 0);
});
test("moderately fast movement gives a visible bend without a wall crash", () => {
  const p = new WindowInertia();
  let bend = 0,
    travel = 0;
  for (let i = 0; i < 120; i++) {
    const t = i / 120;
    const v =
      t < 0.18
        ? (450 * t) / 0.18
        : t < 0.7
          ? 450
          : 450 * Math.max(0, 1 - (t - 0.7) / 0.18);
    p.velocity(v, 0);
    p.advance(1 / 120);
    bend = Math.max(bend, Math.abs(p.state.bend));
    travel = Math.max(travel, Math.abs(p.state.x));
    assert.equal(p.state.impact, null);
  }
  assert.ok(bend >= 10, `bend ${bend} must be visible`);
  assert.ok(bend <= 40);
  assert.ok(travel < 80);
});

test("slightly faster than gentle movement visibly bends in both directions without crashing", () => {
  for (const direction of [-1, 1]) {
    for (const hz of [20, 60, 120]) {
      const p = new WindowInertia();
      let peak = 0;
      for (let i = 0; i < hz; i++) {
        const t = i / hz;
        p.velocity(direction * 220 * Math.min(1, t / 0.2), 0);
        p.advance(1 / hz);
        peak = Math.max(peak, -direction * p.state.bend);
        assert.equal(p.state.impact, null);
        assert.ok(Math.abs(p.state.x) < 35);
      }
      assert.ok(peak >= 10, `visible low-medium bend at ${hz}Hz: ${peak}`);
      assert.ok(peak < 25);
      // No persistent pointing pose: constant velocity does not add force.
      advance(p, 4);
      assert.ok(Math.abs(p.state.bend) < 0.1);
      p.velocity(0, 0);
      advance(p, 0.1);
      assert.ok(
        direction * p.state.bend > 10,
        "braking must carry the body forward",
      );
      assert.equal(p.state.impact, null);
    }
  }
});
