const { test } = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const {
  sanitizeHitMap,
  hitsControls,
  createPointerController,
} = require("./pointer-controller.cjs");
const map = () => ({
  width: 360,
  height: 460,
  interacting: false,
  rects: [{ x: 100, y: 180, width: 120, height: 100 }],
});
function setup(platform = "win32") {
  let clock = 0,
    callback = null,
    point = { x: -990, y: 200 },
    dead = false;
  const calls = [],
    states = [];
  const window = new EventEmitter();
  window.webContents = new EventEmitter();
  window.isDestroyed = () => dead;
  window.getContentBounds = () => ({ x: -1000, y: 0, width: 360, height: 460 });
  window.setIgnoreMouseEvents = (value, options) =>
    calls.push({ value, options });
  const controller = createPointerController({
    window,
    platform,
    getCursor: () => point,
    now: () => clock,
    changed: (s) => states.push(s),
    schedule: (fn) => {
      callback = fn;
      return 42;
    },
    cancel: (id) => {
      assert.equal(id, 42);
      callback = null;
    },
  });
  return {
    controller,
    window,
    calls,
    states,
    point: (p) => {
      point = p;
    },
    advance: (ms) => {
      clock += ms;
      callback?.();
    },
    hasTimer: () => callback !== null,
    die: () => {
      dead = true;
      window.emit("closed");
    },
  };
}
test("default is off, no cursor polling; Linux fails closed and input is validated", () => {
  const ctx = setup();
  assert.equal(ctx.hasTimer(), false);
  assert.equal(ctx.controller.state().enabled, false);
  assert.deepEqual(ctx.calls, []);
  assert.throws(() => ctx.controller.setEnabled("true"), TypeError);
  const linux = setup("linux");
  assert.equal(linux.controller.state().available, false);
  assert.throws(() => linux.controller.setEnabled(true), /unavailable/);
  assert.equal(linux.hasTimer(), false);
});
test("coarse hit test handles negative monitor coordinates, viewport scale and recovery strips", () => {
  const bounds = { x: -1000, y: 0, width: 720, height: 920 };
  assert.equal(hitsControls({ x: -790, y: 400 }, bounds, map()), true);
  assert.equal(hitsControls({ x: -990, y: 400 }, bounds, map()), false);
  assert.equal(hitsControls({ x: -990, y: 50 }, bounds, map()), true);
  assert.equal(hitsControls({ x: -990, y: 850 }, bounds, map()), true);
  assert.equal(hitsControls({ x: 1000, y: 50 }, bounds, map()), false);
});
test("gaps pass through; returning to controls restores capture without renderer mouse events", () => {
  const ctx = setup();
  ctx.controller.setEnabled(true);
  ctx.advance(50);
  assert.deepEqual(ctx.calls, []);
  ctx.controller.update(map());
  assert.equal(ctx.calls.at(-1).value, true);
  ctx.point({ x: -990, y: 20 });
  ctx.advance(50);
  assert.equal(ctx.calls.at(-1).value, false);
  ctx.point({ x: -990, y: 200 });
  ctx.advance(50);
  assert.equal(ctx.calls.at(-1).value, true);
  ctx.controller.setEnabled(false);
  assert.equal(ctx.calls.at(-1).value, false);
  assert.equal(ctx.hasTimer(), false);
});
test("lost heartbeat disables the feature and does not re-enable on late messages", () => {
  const ctx = setup();
  ctx.controller.setEnabled(true);
  ctx.controller.update(map());
  ctx.advance(1251);
  assert.equal(ctx.controller.state().enabled, false);
  assert.match(ctx.controller.state().error, /не отвечает/);
  assert.equal(ctx.calls.at(-1).value, false);
  ctx.controller.update(map());
  assert.equal(ctx.controller.state().enabled, false);
  assert.equal(ctx.hasTimer(), false);
});
test("missing first map and malformed maps fail open to normal mouse capture", () => {
  const ctx = setup();
  ctx.controller.setEnabled(true);
  ctx.advance(1251);
  assert.equal(ctx.controller.state().enabled, false);
  ctx.controller.setEnabled(true);
  ctx.controller.update(map());
  ctx.controller.update({ ...map(), rects: [{ x: NaN }] });
  assert.equal(ctx.calls.at(-1).value, false);
  assert.equal(ctx.controller.state().enabled, false);
});
test("pointer drag protects capture; stuck drag disables instead of locking out controls", () => {
  const ctx = setup();
  ctx.controller.setEnabled(true);
  ctx.controller.update({ ...map(), interacting: true });
  assert.deepEqual(ctx.calls, []);
  for (let i = 0; i < 11; i++) {
    ctx.advance(1000);
    ctx.controller.update({ ...map(), interacting: true });
  }
  assert.equal(ctx.controller.state().enabled, false);
  assert.match(ctx.controller.state().error, /взаимодействия/);
});
test("move invalidates geometry, reload/hide/minimize/unresponsive disable, close cleans all timers", () => {
  for (const event of ["hide", "minimize", "unresponsive", "reload"]) {
    const ctx = setup();
    ctx.controller.setEnabled(true);
    ctx.controller.update(map());
    ctx.window.emit("move");
    assert.equal(ctx.calls.at(-1).value, false);
    ctx.controller.update(map());
    if (event === "reload") ctx.window.webContents.emit("did-start-loading");
    else ctx.window.emit(event);
    assert.equal(ctx.controller.state().enabled, false);
    assert.equal(ctx.hasTimer(), false);
    assert.equal(ctx.calls.at(-1).value, false);
    ctx.controller.dispose();
    assert.equal(ctx.window.listenerCount("move"), 0);
    assert.equal(ctx.window.webContents.listenerCount("did-start-loading"), 0);
  }
  const ctx = setup();
  ctx.controller.setEnabled(true);
  ctx.die();
  assert.equal(ctx.hasTimer(), false);
  assert.throws(() => ctx.controller.setEnabled(true), /disposed/);
});
test("payload is bounded geometry only; strips extra fields and rejects nonfinite/outside bounds", () => {
  const clean = sanitizeHitMap({
    ...map(),
    key: "secret",
    rects: [{ x: 1, y: 2, width: 3, height: 4, text: "secret" }],
  });
  assert.equal(JSON.stringify(clean).includes("secret"), false);
  for (const bad of [
    null,
    { ...map(), width: Infinity },
    { ...map(), height: 9000 },
    { ...map(), rects: Array(9).fill({}) },
    { ...map(), rects: [{ x: -1, y: 0, width: 1, height: 1 }] },
    { ...map(), rects: [{ x: 350, y: 0, width: 20, height: 1 }] },
  ])
    assert.throws(() => sanitizeHitMap(bad));
});
test("OS errors turn the feature off and stop polling", () => {
  const ctx = setup();
  ctx.window.setIgnoreMouseEvents = (value) => {
    if (value) throw new Error("unsupported");
  };
  ctx.controller.setEnabled(true);
  ctx.controller.update(map());
  assert.equal(ctx.controller.state().enabled, false);
  assert.equal(ctx.hasTimer(), false);
  assert.match(ctx.controller.state().error, /ошибки/);
});

test("pointer preload exposes fixed channels, strips native events and removes subscriptions", async () => {
  const vm = require("node:vm");
  const fs = require("node:fs");
  const ipc = new EventEmitter(),
    calls = [];
  let bridge;
  ipc.invoke = (...args) => {
    calls.push(args);
    return Promise.resolve({ available: true, enabled: false, error: "" });
  };
  ipc.send = (...args) => calls.push(args);
  vm.runInNewContext(
    fs.readFileSync(require.resolve("./companion-preload.cjs"), "utf8"),
    {
      require: (name) => {
        assert.equal(name, "electron");
        return {
          ipcRenderer: ipc,
          contextBridge: {
            exposeInMainWorld: (_name, value) => {
              bridge = value;
            },
          },
        };
      },
    },
  );
  assert.equal(Object.isFrozen(bridge), true);
  assert.equal(bridge.invoke, undefined);
  let received;
  const stop = bridge.onPointerState((value) => {
    received = value;
  });
  const state = { available: true, enabled: true, error: "" };
  ipc.emit("companion:pointer-state", { secretNativeEvent: true }, state);
  assert.equal(received, state);
  stop();
  assert.equal(ipc.listenerCount("companion:pointer-state"), 0);
  await bridge.getPointerState();
  await bridge.setPointerPassthrough(false);
  bridge.publishHitMap(map());
  assert.deepEqual(
    calls.map((c) => c[0]),
    ["companion:pointer-state", "companion:set-pointer", "companion:hit-map"],
  );
});
