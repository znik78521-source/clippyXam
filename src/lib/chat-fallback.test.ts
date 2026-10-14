import { test } from "node:test";
import assert from "node:assert/strict";
import { requestReply } from "./chat";
import { characters } from "./characters";
const opts = () => ({
  key: "secret-test-key",
  model: "chosen/model:free",
  character: characters[0],
  intensity: "normal" as const,
  history: [
    { id: "1", time: "", role: "assistant" as const, content: "Приветствие" },
    { id: "2", time: "", role: "user" as const, content: "Мой вопрос" },
  ],
  signal: new AbortController().signal,
});
const ok = () =>
  Response.json({ choices: [{ message: { content: "Ответ по-русски" } }] });
test("400 switches models, removes system role, keeps zero-price guard and does not leak error payload", async (t) => {
  const bodies: any[] = [],
    progress: string[] = [];
  t.mock.method(globalThis, "fetch", async (_, init) => {
    bodies.push(JSON.parse(init!.body as string));
    return bodies.length === 1
      ? Response.json(
          {
            error: { message: "system unsupported secret-test-key Мой вопрос" },
          },
          { status: 400 },
        )
      : ok();
  });
  const reply = await requestReply({
    ...opts(),
    onAttempt: (p) => progress.push(p.reason || ""),
  });
  assert.equal(reply.text, "Ответ по-русски");
  assert.equal(bodies.length, 2);
  assert.notEqual(bodies[0].model, bodies[1].model);
  assert.deepEqual(
    bodies[0].messages.map((m: any) => m.role),
    ["system", "user"],
  );
  assert.deepEqual(
    bodies[1].messages.map((m: any) => m.role),
    ["user"],
  );
  assert.match(bodies[1].messages[0].content, /Мой вопрос/);
  assert.equal(bodies[1].provider.sort, undefined);
  for (const body of bodies) {
    assert.deepEqual(body.provider.max_price, { prompt: 0, completion: 0 });
    assert.equal(body.reasoning, undefined);
    assert.equal(body.temperature, undefined);
  }
  assert.match(progress.join(" "), /HTTP 400.*формат ролей/);
  assert.doesNotMatch(progress.join(" "), /secret-test-key|Мой вопрос/);
});
for (const status of [404, 408, 429, 500, 503])
  test(`HTTP ${status} uses next free model`, async (t) => {
    let calls = 0;
    t.mock.method(globalThis, "fetch", async () =>
      ++calls === 1 ? Response.json({}, { status }) : ok(),
    );
    assert.equal((await requestReply(opts())).text, "Ответ по-русски");
    assert.equal(calls, 2);
  });
for (const status of [401, 402, 403])
  test(`HTTP ${status} stops without trying another model`, async (t) => {
    let calls = 0;
    t.mock.method(globalThis, "fetch", async () => {
      calls++;
      return Response.json({}, { status });
    });
    await assert.rejects(
      () => requestReply(opts()),
      new RegExp(`HTTP ${status}`),
    );
    assert.equal(calls, 1);
  });
test("disabled fallback makes only one request", async (t) => {
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => {
    calls++;
    return Response.json({}, { status: 400 });
  });
  await assert.rejects(
    () => requestReply({ ...opts(), autoFallback: false }),
    /HTTP 400/,
  );
  assert.equal(calls, 1);
});
test("per-model timeout includes response body; next model may succeed", async (t) => {
  let calls = 0;
  t.mock.method(globalThis, "fetch", async (_, init) => {
    if (++calls > 1) return ok();
    return {
      ok: true,
      json: () =>
        new Promise((_, reject) =>
          init!.signal!.addEventListener("abort", () =>
            reject(new DOMException("Aborted", "AbortError")),
          ),
        ),
    } as Response;
  });
  assert.equal(
    (await requestReply({ ...opts(), attemptTimeoutMs: 10 })).text,
    "Ответ по-русски",
  );
  assert.equal(calls, 2);
});
test("network failure falls back, cancellation aborts active fetch and never starts next model", async (t) => {
  let calls = 0;
  const controller = new AbortController();
  t.mock.method(globalThis, "fetch", async (_, init) => {
    if (++calls === 1) throw new TypeError("Failed to fetch");
    return new Promise<Response>((_, reject) => {
      init!.signal!.addEventListener("abort", () =>
        reject(new DOMException("Aborted", "AbortError")),
      );
      controller.abort();
    });
  });
  await assert.rejects(
    () => requestReply({ ...opts(), signal: controller.signal }),
    { name: "AbortError" },
  );
  assert.equal(calls, 2);
});
test("HTTP 200 error envelope is not mistaken for successful reply", async (t) => {
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () =>
    ++calls === 1
      ? Response.json({
          error: { code: 400, message: "reasoning unsupported" },
        })
      : ok(),
  );
  assert.equal((await requestReply(opts())).text, "Ответ по-русски");
  assert.equal(calls, 2);
});
