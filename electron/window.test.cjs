const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const {
  fitBounds,
  sanitizePreferences,
  getDevURL,
  isTrustedFrame,
  EXTERNAL_URLS,
} = require("./window-policy.cjs");
const { createWindowController } = require("./window-controller.cjs");

const area = { x: 0, y: 0, width: 1920, height: 1040 };
function setup(saved = {}) {
  let bounds = { x: 1200, y: 300, width: 420, height: 650 };
  let minimized = false,
    maximized = false,
    pinned = true,
    visible = true,
    focused = true;
  const win = {
    getBounds: () => ({ ...bounds }),
    setBounds: (value) => {
      bounds = value;
    },
    setMinimumSize() {},
    isMaximized: () => maximized,
    isMinimized: () => minimized,
    isAlwaysOnTop: () => pinned,
    isFocused: () => focused,
    maximize: () => {
      maximized = true;
    },
    unmaximize: () => {
      maximized = false;
    },
    minimize: () => {
      minimized = true;
      visible = false;
    },
    restore: () => {
      minimized = false;
    },
    show: () => {
      visible = true;
    },
    focus: () => {
      focused = true;
    },
    setAlwaysOnTop: (value) => {
      pinned = value;
    },
  };
  const events = [];
  const controller = createWindowController(
    win,
    { getDisplayMatching: () => ({ workArea: area }) },
    saved,
    (state) => events.push(state),
  );
  return { win, controller, events, isVisible: () => visible };
}

test("default compact NT bounds and corrupted/off-screen restoration are safe", () => {
  const fallback = fitBounds(null, area, true);
  assert.equal(fallback.width, 360);
  assert.equal(fallback.height, 460);
  assert.deepEqual(
    fitBounds({ x: 8000, y: -2000, width: 420, height: 650 }, area, true),
    { x: 1500, y: 0, width: 420, height: 650 },
  );
  assert.deepEqual(
    fitBounds({ x: NaN, y: 0, width: 420, height: 650 }, area, true),
    fallback,
  );
});
test("bounds support negative monitor coordinates and small work areas", () => {
  const second = { x: -1280, y: 0, width: 1280, height: 720 };
  const b = fitBounds(
    { x: -5000, y: 900, width: 420, height: 650 },
    second,
    true,
  );
  assert.equal(b.x, -1280);
  assert.equal(b.y, 70);
  assert.deepEqual(
    fitBounds(null, { x: 0, y: 0, width: 700, height: 480 }, false),
    { x: 196, y: 0, width: 480, height: 480 },
  );
});
test("window preferences whitelist geometry, never credentials/history", () => {
  const result = sanitizePreferences({
    mini: "false",
    alwaysOnTop: false,
    key: "secret",
    messages: ["secret"],
    miniBounds: { x: 1, y: 2, width: 400, height: 600, key: "secret" },
  });
  assert.equal(result.mini, true);
  assert.equal(result.alwaysOnTop, false);
  assert.ok(!JSON.stringify(result).includes("secret"));
  assert.deepEqual(sanitizePreferences(null).fullBounds, null);
  assert.equal(
    sanitizePreferences({
      miniBounds: { x: 1e300, y: 0, width: 420, height: 650 },
    }).miniBounds,
    null,
  );
});
test("native controller remembers independent sizes across mode changes", () => {
  const { win, controller } = setup();
  const compact = win.getBounds();
  controller.setMini(false);
  assert.equal(win.getBounds().width, 480);
  win.setBounds({ x: 20, y: 30, width: 1250, height: 780 });
  controller.setMini(true);
  assert.deepEqual(win.getBounds(), compact);
  controller.setMini(false);
  assert.deepEqual(win.getBounds(), { x: 20, y: 30, width: 1250, height: 780 });
});
test("native minimize/restore, maximize, pin and validation", () => {
  const { controller, isVisible } = setup();
  controller.minimize();
  assert.equal(controller.state().minimized, true);
  controller.show();
  assert.equal(isVisible(), true);
  assert.equal(controller.state().minimized, false);
  controller.toggleMaximize();
  assert.equal(controller.state().mini, true);
  assert.equal(controller.state().maximized, true);
  controller.toggleMaximize();
  assert.equal(controller.state().maximized, false);
  controller.setAlwaysOnTop(false);
  assert.equal(controller.state().alwaysOnTop, false);
  assert.throws(() => controller.setMini("false"), TypeError);
  assert.throws(() => controller.setAlwaysOnTop(1), TypeError);
});
test("maximized geometry never overwrites restored geometry", () => {
  const { win, controller } = setup({ mini: false });
  const before = controller.snapshot().fullBounds;
  controller.toggleMaximize();
  win.setBounds({ x: 0, y: 0, width: 1920, height: 1040 });
  assert.deepEqual(controller.snapshot().fullBounds, before);
});
test("dev URL is restricted to exact local origin and IPC to its main frame", () => {
  const url = "http://127.0.0.1:5174/";
  assert.equal(getDevURL(url), url);
  for (const bad of [
    undefined,
    "https://example.org/",
    "file:///tmp/a",
    "http://127.0.0.1:5174/evil",
    "http://user@127.0.0.1:5174/",
    "http://127.0.0.1:5174/?evil",
  ])
    assert.throws(() => getDevURL(bad));
  const frame = { url };
  const wc = { mainFrame: frame };
  assert.equal(
    isTrustedFrame({ sender: wc, senderFrame: frame }, wc, url),
    true,
  );
  assert.equal(
    isTrustedFrame({ sender: wc, senderFrame: { url } }, wc, url),
    false,
  );
  assert.equal(
    isTrustedFrame({ sender: {}, senderFrame: frame }, wc, url),
    false,
  );
  frame.url = "https://example.org/";
  assert.equal(
    isTrustedFrame({ sender: wc, senderFrame: frame }, wc, url),
    false,
  );
  assert.equal(EXTERNAL_URLS.has("file:///etc/passwd"), false);
  assert.equal(EXTERNAL_URLS.has("https://openrouter.ai/keys"), true);
});
test("preload only exposes frozen capabilities and cleans event listeners", async () => {
  let exposed,
    listener,
    removed = false;
  const calls = [];
  const ipc = {
    invoke: (...args) => {
      calls.push(args);
      return Promise.resolve();
    },
    on: (_channel, cb) => {
      listener = cb;
    },
    removeListener: (_channel, cb) => {
      removed = cb === listener;
    },
  };
  vm.runInNewContext(
    fs.readFileSync(require.resolve("./preload.cjs"), "utf8"),
    {
      require: (name) => {
        assert.equal(name, "electron");
        return {
          contextBridge: {
            exposeInMainWorld: (key, api) => {
              assert.equal(key, "clippyDesktop");
              exposed = api;
            },
          },
          ipcRenderer: ipc,
        };
      },
      process: { platform: "win32" },
    },
  );
  assert.equal(Object.isFrozen(exposed), true);
  assert.equal(exposed.send, undefined);
  assert.equal(exposed.invoke, undefined);
  assert.equal(exposed.readFile, undefined);
  await exposed.setMini(true);
  assert.deepEqual(calls[0], ["window:set-mini", true]);
  let received;
  const unsubscribe = exposed.onState((state) => {
    received = state;
  });
  const state = { mini: true };
  listener({ sender: "DO NOT EXPOSE" }, state);
  assert.equal(received, state);
  unsubscribe();
  assert.equal(removed, true);
});
