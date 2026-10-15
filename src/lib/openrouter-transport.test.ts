import { test } from "node:test";
import assert from "node:assert/strict";
import { openRouterFetch, TransportError } from "./openrouter-transport";
import { requestReply } from "./chat";
import { characters } from "./characters";
// Node mock.property is not available on every supported Node version.
function withBridge(t: any, bridge: unknown) {
  const prior = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { clippyDesktop: bridge },
  });
  t.after(() => {
    if (prior) Object.defineProperty(globalThis, "window", prior);
    else delete (globalThis as any).window;
  });
}
test("desktop uses IPC, never renderer fetch, and preserves HTTP status", async (t) => {
  t.mock.method(globalThis, "fetch", async () => {
    throw new Error("must not use renderer fetch");
  });
  withBridge(t, {
    openRouterRequest: async (input: any) => {
      assert.equal(input.kind, "chat");
      assert.equal(input.key, "test-key");
      assert.deepEqual(input.body, { model: "test/model:free" });
      return { status: 401, data: { error: { code: 401 } } };
    },
    openRouterCancel: async () => {},
  });
  const r = await openRouterFetch("chat", {
    headers: { Authorization: "Bearer test-key" },
    body: JSON.stringify({ model: "test/model:free" }),
  });
  assert.equal(r.status, 401);
  assert.equal(r.ok, false);
});
test("native catalogue request carries no key or body", async (t) => {
  withBridge(t, {
    openRouterRequest: async (input: any) => {
      assert.equal(input.key, undefined);
      assert.equal(input.body, undefined);
      return { status: 200, data: { data: [] } };
    },
    openRouterCancel: async () => {},
  });
  assert.deepEqual(await (await openRouterFetch("models", {})).json(), {
    data: [],
  });
});
test("abort cancels exact native operation, settles immediately, ignores late reply", async (t) => {
  const controller = new AbortController();
  let sent = "",
    cancelled = "";
  let resolve!: (r: any) => void;
  withBridge(t, {
    openRouterRequest: (input: any) => {
      sent = input.id;
      return new Promise((r) => (resolve = r));
    },
    openRouterCancel: async (id: string) => {
      cancelled = id;
    },
  });
  const promise = openRouterFetch("models", { signal: controller.signal });
  controller.abort();
  await assert.rejects(() => promise, { name: "AbortError" });
  assert.equal(cancelled, sent);
  resolve({ status: 200, data: { data: [] } });
});
test("native DNS failure stops model loop after one request and exposes useful safe diagnostic", async (t) => {
  let calls = 0;
  withBridge(t, {
    openRouterRequest: async () => {
      calls++;
      return { error: "DNS" };
    },
    openRouterCancel: async () => {},
  });
  await assert.rejects(
    () =>
      requestReply({
        key: "test",
        model: "test/model:free",
        character: characters[0],
        intensity: "normal",
        history: [],
        signal: new AbortController().signal,
      }),
    /\[DNS\]/,
  );
  assert.equal(calls, 1);
  assert.doesNotMatch(
    new TransportError("raw secret-test-key").message,
    /secret-test-key/,
  );
});
