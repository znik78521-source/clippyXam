const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  { EventEmitter } = require("node:events");
const { installWindowMotion } = require("./window-motion.cjs");
function fixture() {
  const window = new EventEmitter(),
    events = [];
  let bounds = { x: 0, y: 0, width: 360, height: 460 },
    clock = 0,
    timer;
  Object.assign(window, {
    getBounds: () => ({ ...bounds }),
    isDestroyed: () => false,
    isVisible: () => true,
    isMaximized: () => false,
    webContents: {
      isDestroyed: () => false,
      send: (channel, data) => {
        assert.equal(channel, "window:motion");
        events.push(data);
      },
    },
  });
  installWindowMotion(window, {
    now: () => clock,
    schedule: (fn) => {
      timer = fn;
      return 1;
    },
    cancel: () => {
      timer = undefined;
    },
  });
  return {
    window,
    events,
    move: (x, y, ms) => {
      clock += ms;
      bounds = { ...bounds, x, y };
      window.emit("move");
    },
    settle: () => timer?.(),
    resize: () => {
      bounds.width++;
      window.emit("resize");
    },
  };
}
test("native movement publishes bounded velocity, settles to zero and never exports coordinates", () => {
  const f = fixture();
  f.move(20, 1, 40);
  assert.deepEqual(f.events[0], {
    direction: "right",
    serial: 1,
    velocityX: 500,
    velocityY: 25,
    reset: false,
  });
  f.move(40, 2, 40);
  assert.equal(f.events[1].velocityX, 500);
  f.settle();
  assert.equal(f.events.at(-1).velocityX, 0);
  assert.equal(f.events.at(-1).direction, "still");
  assert.ok(
    f.events.every((e) => !("x" in e) && !("y" in e) && !("bounds" in e)),
  );
  f.window.emit("closed");
  assert.equal(f.window.listenerCount("move"), 0);
  assert.equal(f.window.listenerCount("resize"), 0);
});
test("coalescing retains displacement; speed is capped and layout jumps are reset, not slammed", () => {
  const f = fixture();
  f.move(20, 0, 5);
  assert.equal(f.events.length, 0);
  f.move(50, 0, 15);
  assert.equal(f.events[0].velocityX, 2500);
  f.move(850, 0, 20);
  assert.equal(f.events.at(-1).velocityX, 4000);
  f.move(2850, 0, 20);
  assert.equal(f.events.at(-1).reset, true);
});
test("resize, hide and maximize reset motion without a false braking impact", () => {
  const f = fixture();
  f.move(200, 0, 50);
  f.resize();
  assert.equal(f.events.at(-1).reset, true);
  assert.equal(f.events.at(-1).velocityX, 0);
  for (const event of ["hide", "maximize", "show", "restore"]) {
    f.window.emit(event);
    assert.equal(f.events.at(-1).reset, true);
  }
});
