const { test } = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const { readFileSync } = require("node:fs");
const vm = require("node:vm");
const { createCompanionController } = require("./companion-controller.cjs");
const {
  sanitizeCompanionSnapshot,
  sanitizeCompanionAction,
  fitCompanionBounds,
} = require("./companion-policy.cjs");
const { sanitizePreferences } = require("./window-policy.cjs");

function setup() {
  const jobs = [],
    events = [];
  function createSurface() {
    const window = new EventEmitter();
    let destroyed = false;
    Object.assign(window, {
      webContents: new EventEmitter(),
      isDestroyed: () => destroyed,
      getBounds: () => ({ x: 20, y: 30, width: 360, height: 460 }),
      show: () => events.push("surface-show"),
      focus: () => {},
      destroy: () => {
        destroyed = true;
        window.emit("closed");
      },
    });
    let resolve, reject;
    const ready = new Promise((a, b) => {
      resolve = a;
      reject = b;
    });
    const job = { window, ready, resolve, reject };
    jobs.push(job);
    return job;
  }
  const controller = createCompanionController({
    createSurface,
    hideOwner: () => events.push("owner-hide"),
    showOwner: () => events.push("owner-show"),
    changed: (value) => events.push(`active:${value}`),
    saveBounds: () => events.push("saved"),
    failed: () => events.push("failed"),
  });
  return { controller, jobs, events };
}
test("owner stays visible until surface is ready, then safe close returns it", async () => {
  const { controller, jobs, events } = setup();
  const promise = controller.enable();
  assert.equal(events.includes("owner-hide"), false);
  jobs[0].resolve();
  assert.equal(await promise, true);
  assert.equal(controller.isActive(), true);
  assert.equal(events.includes("owner-hide"), true);
  controller.close();
  assert.equal(controller.isActive(), false);
  assert.ok(events.includes("owner-show"));
  assert.equal(jobs[0].window.isDestroyed(), true);
});
test("repeated enable does not create duplicate windows, cancellation invalidates a late load", async () => {
  const { controller, jobs, events } = setup();
  const first = controller.enable();
  const second = controller.enable();
  assert.equal(jobs.length, 1);
  controller.close();
  jobs[0].resolve();
  assert.equal(await first, false);
  assert.equal(await second, false);
  assert.equal(events.includes("owner-hide"), false);
  const third = controller.enable();
  jobs[1].resolve();
  assert.equal(await third, true);
  controller.dispose();
});
test("load failure restores the owner and a renderer crash also recovers", async () => {
  const { controller, jobs, events } = setup();
  const first = controller.enable();
  jobs[0].reject(new Error("failed-load"));
  await assert.rejects(first, /failed-load/);
  assert.equal(controller.getWindow(), null);
  assert.ok(events.includes("owner-show"));
  const second = controller.enable();
  jobs[1].resolve();
  await second;
  jobs[1].window.webContents.emit("render-process-gone");
  assert.equal(controller.isActive(), false);
  assert.ok(events.includes("failed"));
});
test("Alt+F4 recovers; application disposal never resurrects the owner", async () => {
  const { controller, jobs, events } = setup();
  const first = controller.enable();
  jobs[0].resolve();
  await first;
  jobs[0].window.destroy();
  assert.ok(events.includes("owner-show"));
  const second = controller.enable();
  jobs[1].resolve();
  await second;
  const restores = events.filter((e) => e === "owner-show").length;
  controller.dispose();
  assert.equal(events.filter((e) => e === "owner-show").length, restores);
  await assert.rejects(() => controller.enable(), /disposed/);
});
test("companion payload strips credentials, settings, transcript and arbitrary properties", () => {
  const clean = sanitizeCompanionSnapshot({
    character: "merlin",
    phase: "speaking",
    animationMood: "speaking",
    bubble: "Привет",
    error: "",
    seconds: 999,
    highlight: { start: 0, end: 6, key: "secret" },
    key: "secret",
    settings: { key: "secret" },
    history: ["secret"],
  });
  assert.equal(JSON.stringify(clean).includes("secret"), false);
  assert.equal(clean.seconds, 60);
  assert.deepEqual(clean.highlight, { start: 0, end: 6 });
  assert.throws(() => sanitizeCompanionSnapshot({ character: "unknown" }));
  assert.equal(
    sanitizeCompanionSnapshot({ ...clean, highlight: { start: 0, end: 99999 } })
      .highlight,
    null,
  );
});
test("surface commands accept only bounded user input and a tiny allowlist", () => {
  assert.deepEqual(
    sanitizeCompanionAction({ type: "send", text: "  привет ", key: "secret" }),
    { type: "send", text: "привет" },
  );
  for (const action of [
    { type: "exec", text: "x" },
    { type: "send", text: " " },
    { type: "send", text: "a".repeat(2001) },
    { type: "set-key", key: "x" },
  ])
    assert.throws(() => sanitizeCompanionAction(action));
  assert.deepEqual(
    sanitizeCompanionAction({ type: "restore", arbitrary: true }),
    { type: "restore" },
  );
});
test("surface bounds are fixed, clamped and persisted without enabling ghost mode on startup", () => {
  const area = { x: -1280, y: 0, width: 1280, height: 720 };
  assert.deepEqual(
    fitCompanionBounds({ x: 9000, y: -1, width: 5000, height: 8000 }, area),
    { x: -360, y: 0, width: 360, height: 460 },
  );
  const prefs = sanitizePreferences({
    companion: true,
    companionBounds: { x: 1, y: 2, width: 360, height: 460, key: "secret" },
  });
  assert.equal(prefs.companion, undefined);
  assert.equal(JSON.stringify(prefs).includes("secret"), false);
});
test("passive preload exposes no owner IPC or credential access and does not leak events", async () => {
  let exposed,
    listener,
    removed = false;
  const calls = [];
  vm.runInNewContext(
    readFileSync(require.resolve("./companion-preload.cjs"), "utf8"),
    {
      require: (name) => {
        assert.equal(name, "electron");
        return {
          contextBridge: {
            exposeInMainWorld: (name, value) => {
              assert.equal(name, "clippyCompanion");
              exposed = value;
            },
          },
          ipcRenderer: {
            invoke: (...args) => {
              calls.push(args);
              return Promise.resolve(true);
            },
            on: (_channel, fn) => {
              listener = fn;
            },
            removeListener: (_channel, fn) => {
              removed = fn === listener;
            },
          },
        };
      },
    },
  );
  assert.equal(Object.isFrozen(exposed), true);
  assert.equal(exposed.publishCompanion, undefined);
  assert.equal(exposed.invoke, undefined);
  const snapshot = { character: "clippy" };
  let received;
  const unsubscribe = exposed.onSnapshot((value) => {
    received = value;
  });
  listener({ sender: "hidden-event" }, snapshot);
  assert.equal(received, snapshot);
  unsubscribe();
  assert.equal(removed, true);
  await exposed.action({ type: "return" });
  assert.equal(calls[0][0], "companion:action");
});

test("blank/error page cannot hide owner: readiness requires native paint AND rendered snapshot", async () => {
  const { waitForCompanionReady } = require("./companion-controller.cjs");
  for (const rendererFirst of [false, true]) {
    const window = new EventEmitter();
    window.webContents = new EventEmitter();
    window.loadURL = () => Promise.resolve();
    let ready = false;
    const promise = waitForCompanionReady(
      window,
      "http://127.0.0.1:5174/",
    ).then(() => {
      ready = true;
    });
    if (rendererFirst) window.webContents.emit("companion:renderer-ready");
    else window.emit("ready-to-show");
    await Promise.resolve();
    assert.equal(ready, false);
    if (rendererFirst) window.emit("ready-to-show");
    else window.webContents.emit("companion:renderer-ready");
    await promise;
    assert.equal(ready, true);
    assert.equal(
      window.webContents.listenerCount("companion:renderer-ready"),
      0,
    );
  }
});
test("missing UI handshake times out and readiness listeners are removed on early close", async () => {
  const { waitForCompanionReady } = require("./companion-controller.cjs");
  const window = new EventEmitter();
  window.webContents = new EventEmitter();
  window.loadURL = () => Promise.resolve();
  const promise = waitForCompanionReady(window, "http://127.0.0.1:5174/", 5);
  window.emit("ready-to-show");
  await assert.rejects(promise, /timeout/);
  assert.equal(window.listenerCount("closed"), 0);
  const next = waitForCompanionReady(window, "http://127.0.0.1:5174/");
  window.emit("closed");
  await assert.rejects(next, /closed before ready/);
  assert.equal(window.webContents.listenerCount("render-process-gone"), 0);
});

test("quick controls whitelist supported personas and never forward arbitrary configuration", () => {
  for (const character of ["clippy", "rover", "merlin"])
    assert.deepEqual(
      sanitizeCompanionAction({
        type: "select-character",
        character,
        key: "secret",
        history: ["secret"],
      }),
      { type: "select-character", character },
    );
  for (const character of ["courtney", "earl", "unknown", null, {}])
    assert.throws(() =>
      sanitizeCompanionAction({ type: "select-character", character }),
    );
  for (const type of ["stop-speech", "cancel-reply"])
    assert.deepEqual(sanitizeCompanionAction({ type, key: "secret" }), {
      type,
    });
  const snapshot = sanitizeCompanionSnapshot({
    character: "clippy",
    phase: "idle",
    animationMood: "idle",
    speechBusy: "yes",
    speaking: true,
  });
  assert.equal(snapshot.speechBusy, false);
  assert.equal(snapshot.speaking, true);
});
test("comic start time is sanitized so a reopened widget can skip expired scenes", () => {
  const base = { character: "clippy", phase: "idle", animationMood: "idle" };
  const animation = {
    name: "WindowsPrank",
    serial: 2,
    startedAt: 1792065600000,
    secret: "no",
  };
  assert.deepEqual(
    sanitizeCompanionSnapshot({ ...base, animation }).animation,
    { name: "WindowsPrank", serial: 2, startedAt: 1792065600000 },
  );
  for (const startedAt of [NaN, Infinity, -1, "secret", 1e20])
    assert.equal(
      sanitizeCompanionSnapshot({
        ...base,
        animation: { ...animation, startedAt },
      }).animation.startedAt,
      undefined,
    );
});
