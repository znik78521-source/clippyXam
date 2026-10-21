const { test } = require("node:test");
const assert = require("node:assert/strict");
const { createStartup } = require("./startup.cjs");
test("startup read-only until explicit opt-in; stable portable path, not temporary exe", () => {
  let enabled = false;
  const calls = [];
  const app = {
    isPackaged: true,
    getLoginItemSettings: () => ({ openAtLogin: enabled }),
    setLoginItemSettings: (o) => {
      calls.push(o);
      enabled = o.openAtLogin;
    },
  };
  const controller = createStartup({
    app,
    platform: "win32",
    portableFile: "C:\\Apps\\clippy Xam.exe",
  });
  assert.equal(controller.state().enabled, false);
  assert.equal(calls.length, 0);
  assert.equal(controller.set(true).enabled, true);
  assert.deepEqual(calls[0], {
    path: "C:\\Apps\\clippy Xam.exe",
    args: ["--autostart"],
    name: "clippyXam",
    openAtLogin: true,
  });
  assert.equal(controller.set(false).enabled, false);
  assert.throws(() => controller.set("yes"));
});
test("dev, unpacked, relative and non-Windows launches cannot register startup", () => {
  for (const options of [
    { platform: "linux", portableFile: "C:\\app.exe" },
    { platform: "win32", portableFile: undefined },
    { platform: "win32", portableFile: "relative.exe" },
    { platform: "win32", portableFile: "C:\\app.exe --evil" },
    { platform: "win32", portableFile: "C:\\app.exe", dev: true },
  ]) {
    const c = createStartup({
      ...options,
      app: {
        isPackaged: !options.dev,
        getLoginItemSettings: () => {
          throw new Error("must not read");
        },
        setLoginItemSettings: () => {
          throw new Error("must not write");
        },
      },
    });
    assert.equal(c.state().available, false);
    assert.throws(() => c.set(true));
  }
});
test("OS refusal is reported instead of falsely enabling startup", () => {
  const c = createStartup({
    platform: "win32",
    portableFile: "C:\\app.exe",
    app: {
      isPackaged: true,
      getLoginItemSettings: () => ({ openAtLogin: false }),
      setLoginItemSettings: () => {},
    },
  });
  assert.throws(() => c.set(true), /не подтвердила/);
});
