import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer as createTCPServer } from "node:net";
import { createServer } from "vite";
import {
  supportedNode,
  installFingerprint,
  npmInvocation,
  loopbackURL,
} from "./launch-policy.mjs";

test("launcher rejects old/prerelease Node versions with a stable minimum", () => {
  for (const v of ["18.20.0", "20.19.0", "22.11.9", "invalid", "22.12.0-rc.1"])
    assert.equal(supportedNode(v), false);
  for (const v of ["22.12.0", "22.22.3", "24.0.0"])
    assert.equal(supportedNode(v), true);
});
test("dependency stamp changes with lock, platform, architecture or Node major, not patch", () => {
  const stamp = installFingerprint("lock", "win32", "x64", "22.12.0");
  assert.equal(stamp, installFingerprint("lock", "win32", "x64", "22.22.3"));
  for (const args of [
    ["new", "win32", "x64", "22.12.0"],
    ["lock", "linux", "x64", "22.12.0"],
    ["lock", "win32", "arm64", "22.12.0"],
    ["lock", "win32", "x64", "24.0.0"],
  ])
    assert.notEqual(stamp, installFingerprint(...args));
});
test("Windows npm command is fixed and contains no shell-interpolated project path", () => {
  assert.deepEqual(
    npmInvocation("install", "win32", "C:\\Windows\\System32\\cmd.exe"),
    {
      command: "C:\\Windows\\System32\\cmd.exe",
      args: [
        "/d",
        "/s",
        "/c",
        "npm.cmd ci --include=dev --ignore-scripts=false",
      ],
    },
  );
  assert.throws(() => npmInvocation("desktop & erase", "win32"), TypeError);
  assert.deepEqual(npmInvocation("check", "linux"), {
    command: "npm",
    args: ["run", "verify"],
  });
});
test("dev URL uses the actual port, never a LAN bind or unvalidated address", () => {
  assert.equal(
    loopbackURL({ address: "0.0.0.0", port: 5175 }),
    "http://127.0.0.1:5175/",
  );
  for (const address of [
    null,
    "pipe",
    { port: 0 },
    { port: 65536 },
    { port: "5174" },
  ])
    assert.throws(() => loopbackURL(address));
});
test("Vite chooses another loopback port when occupied, allowing Electron second-instance recovery", async () => {
  const occupied = createTCPServer();
  await new Promise((resolve) => occupied.listen(0, "127.0.0.1", resolve));
  const port = occupied.address().port;
  const vite = await createServer({
    configFile: false,
    logLevel: "silent",
    server: { host: "127.0.0.1", port, strictPort: false },
  });
  try {
    await vite.listen();
    const address = vite.httpServer.address();
    assert.notEqual(address.port, port);
    assert.equal(address.address, "127.0.0.1");
    assert.match(loopbackURL(address), /^http:\/\/127\.0\.0\.1:\d+\/$/);
  } finally {
    await vite.close();
    await new Promise((resolve) => occupied.close(resolve));
  }
});
