const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  createOpenRouter,
  installOpenRouterIPC,
  codeFor,
} = require("./openrouter.cjs");
const chat = (patch = {}) => ({
  id: "chat-1",
  kind: "chat",
  key: "test-key",
  body: {
    model: "test/model:free",
    max_tokens: 400,
    messages: [{ role: "user", content: "Привет" }],
    provider: { sort: "latency", max_price: { prompt: 0, completion: 0 } },
  },
  ...patch,
});
test("native request uses only fixed HTTPS endpoint, no cookies, no redirects, and rebuilt zero-price body", async () => {
  const transport = createOpenRouter({
    fetchImpl: async (url, init) => {
      assert.equal(url, "https://openrouter.ai/api/v1/chat/completions");
      assert.equal(init.redirect, "error");
      assert.equal(init.credentials, "omit");
      assert.equal(init.headers.Authorization, "Bearer test-key");
      assert.equal(init.headers.Origin, undefined);
      const body = JSON.parse(init.body);
      assert.deepEqual(body.provider.max_price, { prompt: 0, completion: 0 });
      assert.equal(body.models, undefined);
      assert.equal(body.tools, undefined);
      return Response.json({ choices: [] }, { status: 200 });
    },
  });
  const input = chat({ url: "https://evil.example/" });
  input.body.models = ["paid/model"];
  input.body.tools = [{}];
  assert.deepEqual(await transport.request(input), {
    status: 200,
    data: { choices: [] },
  });
});
test("public model list has no API-key header even if caller supplies key", async () => {
  const transport = createOpenRouter({
    fetchImpl: async (url, init) => {
      assert.equal(url, "https://openrouter.ai/api/v1/models");
      assert.equal(init.headers, undefined);
      return Response.json({ data: [] });
    },
  });
  assert.equal(
    (
      await transport.request({
        id: "models-1",
        kind: "models",
        key: "ignored-secret",
      })
    ).status,
    200,
  );
});
test("invalid key, paid models, price overrides, malformed roles and unbounded payloads never reach network", async () => {
  let calls = 0;
  const t = createOpenRouter({
    fetchImpl: async () => {
      calls++;
      return Response.json({});
    },
  });
  for (const input of [
    chat({ key: "ключ" }),
    chat({ key: "key\nInjected: 1" }),
    chat({ kind: "arbitrary" }),
    chat({ id: "../file" }),
    chat({ body: { ...chat().body, model: "paid/model" } }),
    chat({
      body: { ...chat().body, messages: [{ role: "tool", content: "x" }] },
    }),
    chat({
      body: {
        ...chat().body,
        messages: [{ role: "user", content: "a".repeat(60001) }],
      },
    }),
    chat({
      body: {
        ...chat().body,
        provider: { max_price: { prompt: 1, completion: 0 } },
      },
    }),
  ])
    assert.ok((await t.request(input)).error);
  assert.equal(calls, 0);
});
test("HTTP errors are preserved, not collapsed to a generic network error", async () => {
  const t = createOpenRouter({
    fetchImpl: async () =>
      Response.json({ error: { code: 401 } }, { status: 401 }),
  });
  assert.deepEqual(await t.request(chat()), {
    status: 401,
    data: { error: { code: 401 } },
  });
});
for (const [raw, expected] of [
  ["net::ERR_NAME_NOT_RESOLVED", "DNS"],
  ["net::ERR_CERT_AUTHORITY_INVALID", "TLS"],
  ["net::ERR_PROXY_CONNECTION_FAILED", "PROXY"],
  ["net::ERR_INTERNET_DISCONNECTED", "OFFLINE"],
  ["net::ERR_CONNECTION_RESET", "CONNECTION"],
])
  test(`native error ${expected} is safe, without raw secrets`, async () => {
    const t = createOpenRouter({
      fetchImpl: async () => {
        throw new Error(raw + " secret-test-key private-message");
      },
    });
    assert.deepEqual(await t.request(chat()), { error: expected });
    assert.equal(codeFor(new Error(raw)), expected);
  });
test("timeout, explicit cancellation and shutdown abort native fetch; no pending slot leak", async () => {
  const t = createOpenRouter({
    timeoutMs: 10,
    fetchImpl: async (_, init) =>
      new Promise((_, reject) =>
        init.signal.addEventListener("abort", () =>
          reject(new Error("Aborted")),
        ),
      ),
  });
  assert.deepEqual(await t.request(chat()), { error: "TIMEOUT" });
  const pending = t.request(chat());
  t.cancel("chat-1");
  assert.deepEqual(await pending, { error: "ABORTED" });
  const next = t.request(chat());
  t.dispose();
  assert.deepEqual(await next, { error: "ABORTED" });
});
test("limits active operations, duplicate IDs, response size and permits retry after cancellation", async () => {
  const t = createOpenRouter({
    fetchImpl: async (_, init) =>
      new Promise((_, reject) =>
        init.signal.addEventListener("abort", () =>
          reject(new Error("Aborted")),
        ),
      ),
  });
  const a = t.request(chat()),
    b = t.request(chat({ id: "chat-2" }));
  assert.deepEqual(await t.request(chat()), { error: "BUSY" });
  assert.deepEqual(await t.request(chat({ id: "chat-3" })), { error: "BUSY" });
  t.dispose();
  await Promise.all([a, b]);
  const large = createOpenRouter({
    fetchImpl: async () => new Response("x".repeat(300000)),
  });
  assert.deepEqual(await large.request(chat()), {
    error: "RESPONSE_TOO_LARGE",
  });
});
test("only owner main frame on trusted URL can request or cancel; widget and remote frames cannot", () => {
  const handlers = {},
    frame = { url: "clippyxam://bundle/" },
    owner = { mainFrame: frame };
  let calls = 0;
  installOpenRouterIPC({
    ipcMain: { handle: (key, fn) => (handlers[key] = fn) },
    getOwner: () => owner,
    getURL: () => frame.url,
    transport: { request: () => calls++, cancel: () => calls++ },
  });
  for (const handler of Object.values(handlers)) {
    assert.throws(
      () => handler({ sender: {}, senderFrame: frame }, chat()),
      /Untrusted/,
    );
    assert.throws(
      () =>
        handler(
          { sender: owner, senderFrame: { url: "clippyxam://bundle/" } },
          chat(),
        ),
      /Untrusted/,
    );
    handler({ sender: owner, senderFrame: frame }, chat());
  }
  assert.equal(calls, 2);
});
