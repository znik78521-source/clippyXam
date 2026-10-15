const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  { EventEmitter } = require("node:events");
const { installWindowMotion } = require("./window-motion.cjs");
test("window movement publishes only direction, throttles, settles and cleans up", () => {
  const window = new EventEmitter(),
    events = [];
  let bounds = { x: 0, y: 0 },
    clock = 100,
    timer;
  Object.assign(window, {
    getBounds: () => bounds,
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
    cancel: () => {},
  });
  bounds = { x: 20, y: 1 };
  window.emit("move");
  assert.deepEqual(events[0], { direction: "right", serial: 1 });
  bounds = { x: 21, y: 1 };
  window.emit("move");
  assert.equal(events.length, 1);
  clock += 100;
  bounds = { x: 21, y: -30 };
  window.emit("move");
  assert.equal(events.at(-1).direction, "up");
  timer();
  assert.equal(events.at(-1).direction, "still");
  assert.ok(events.every((e) => !("x" in e) && !("y" in e)));
  window.emit("closed");
  assert.equal(window.listenerCount("move"), 0);
});
