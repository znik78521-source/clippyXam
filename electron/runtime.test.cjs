const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const {
  APP_URL,
  rendererURL,
  bundleFile,
  contentSecurityPolicy,
  portableDataDirectory,
} = require("./runtime-policy.cjs");
const { isTrustedFrame } = require("./window-policy.cjs");
test("packaged app ignores injected dev URLs; dev still restricted", () => {
  assert.equal(rendererURL(true, "https://evil.test"), APP_URL);
  assert.throws(() => rendererURL(false, "https://evil.test"));
  assert.equal(
    rendererURL(false, "http://127.0.0.1:5174/"),
    "http://127.0.0.1:5174/",
  );
});
test("bundled assets resolve inside dist; encoded traversal and other origins rejected", () => {
  const root = path.resolve("dist");
  assert.equal(bundleFile(APP_URL, root), path.join(root, "index.html"));
  assert.equal(
    bundleFile(APP_URL + "?view=companion", root),
    path.join(root, "index.html"),
  );
  assert.equal(
    bundleFile(APP_URL + "agents/clippy/map.png", root),
    path.join(root, "agents/clippy/map.png"),
  );
  for (const url of [
    "file:///etc/passwd",
    "https://bundle/",
    "clippyxam://other/",
    "clippyxam://bundle/%2e%2e%2fsecret",
    "clippyxam://bundle/%5csecret",
    "clippyxam://bundle/%00",
    "clippyxam://user@bundle/",
  ])
    assert.throws(() => bundleFile(url, root));
});
test("opaque scheme origins cannot bypass IPC frame/origin validation", () => {
  const frame = { url: APP_URL },
    wc = { mainFrame: frame };
  const event = { sender: wc, senderFrame: frame };
  assert.equal(isTrustedFrame(event, wc, APP_URL), true);
  frame.url = APP_URL + "?view=companion";
  assert.equal(isTrustedFrame(event, wc, APP_URL), true);
  for (const url of [
    "file:///",
    "clippyxam://evil/",
    "clippyxam://bundle/other",
    "clippyxam://bundle/?evil",
    "clippyxam://bundle/#evil",
  ]) {
    frame.url = url;
    assert.equal(isTrustedFrame(event, wc, APP_URL), false);
  }
});
test("production CSP has no eval, inline scripts or localhost; portable data path is explicit", () => {
  const csp = contentSecurityPolicy(true, APP_URL);
  assert.match(csp, /script-src 'self';/);
  assert.doesNotMatch(csp, /unsafe-eval|localhost|127\.0\.0\.1|ws:/);
  assert.equal(
    portableDataDirectory(path.resolve("portable")),
    path.resolve("portable", "clippyXam-data"),
  );
  assert.throws(() => portableDataDirectory("relative"));
});
