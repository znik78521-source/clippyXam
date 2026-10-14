import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_MODEL, isFreeModel, parseReply, requestReply } from "./chat";
import { characters } from "./characters";

test("parses structured model actions and fenced JSON", () => {
  assert.deepEqual(
    parseReply(
      '```json\n{"text":"Я ушёл!","mood":"offended","leaveSeconds":15}\n```',
    ),
    { text: "Я ушёл!", mood: "offended", leaveSeconds: 15 },
  );
});
test("clamps untrusted departures and accepts only known moods", () => {
  assert.deepEqual(
    parseReply('{"text":"Ответ","mood":"malicious","leaveSeconds":5000}'),
    { text: "Ответ", mood: "speaking", leaveSeconds: 60 },
  );
  assert.equal(
    parseReply('{"text":"Ответ","leaveSeconds":-50}').leaveSeconds,
    0,
  );
  assert.equal(
    parseReply('{"text":"Ответ","leaveSeconds":"50"}').leaveSeconds,
    0,
  );
  assert.equal(
    parseReply('{"text":"Ответ","leaveSeconds":1e999}').leaveSeconds,
    0,
  );
});
test("handles plain text, malformed JSON, null, and empty replies", () => {
  assert.equal(parseReply("Просто текст.").text, "Просто текст.");
  assert.equal(parseReply("null").mood, "speaking");
  assert.equal(parseReply("{broken}").text, "{broken}");
  assert.ok(parseReply("").text.length > 0);
  assert.equal(parseReply("a".repeat(3000)).text.length, 2500);
});
test("API sends credentials only to OpenRouter, bounds history and soft gestures", async (t) => {
  let payload: Record<string, any> = {};
  t.mock.method(globalThis, "fetch", async (url: string, init: RequestInit) => {
    assert.equal(url, "https://openrouter.ai/api/v1/chat/completions");
    assert.equal(
      (init.headers as Record<string, string>).Authorization,
      "Bearer test-key",
    );
    payload = JSON.parse(init.body as string);
    return new Response(
      JSON.stringify({
        choices: [
          {
            message: {
              content: '{"text":"Ответ","mood":"rude","leaveSeconds":0}',
            },
          },
        ],
      }),
    );
  });
  const result = await requestReply({
    key: "test-key",
    model: "test/model:free",
    character: characters[0],
    intensity: "soft",
    history: Array.from({ length: 40 }, (_, i) => ({
      id: String(i),
      time: "12:00",
      role: "user",
      content: `${i}`,
    })),
    signal: new AbortController().signal,
  });
  assert.equal(payload.model, "test/model:free");
  assert.deepEqual(payload.provider, {
    sort: "latency",
    max_price: { prompt: 0, completion: 0 },
  });
  assert.equal(payload.max_tokens, 350);
  assert.equal(payload.messages.length, 21);
  assert.equal(payload.messages[0].role, "system");
  assert.equal(payload.messages[1].content, "20");
  assert.equal(result.mood, "speaking");
});
test("API rejects unauthorized and empty responses with useful errors", async (t) => {
  const mocked = t.mock.method(
    globalThis,
    "fetch",
    async () => new Response("", { status: 401 }),
  );
  const options = {
    key: "bad",
    model: "test/model:free",
    character: characters[0],
    intensity: "normal" as const,
    history: [],
    signal: new AbortController().signal,
  };
  await assert.rejects(() => requestReply(options), /Ключ не принят/);
  mocked.mock.mockImplementation(
    async () => new Response(JSON.stringify({ choices: [] })),
  );
  await assert.rejects(() => requestReply(options), /пустой ответ/);
});
test("API preserves abort signal for cancellation", async (t) => {
  const controller = new AbortController();
  controller.abort();
  t.mock.method(
    globalThis,
    "fetch",
    async (_url: string, init: RequestInit) => {
      assert.equal(init.signal, controller.signal);
      throw new DOMException("Aborted", "AbortError");
    },
  );
  await assert.rejects(
    () =>
      requestReply({
        key: "test",
        model: "test/model:free",
        character: characters[0],
        intensity: "normal",
        history: [],
        signal: controller.signal,
      }),
    { name: "AbortError" },
  );
});

test("only zero-cost routes are accepted and paid IDs fail before fetch", async (t) => {
  assert.equal(DEFAULT_MODEL, "openrouter/free");
  for (const id of [DEFAULT_MODEL, "vendor/mini:free"])
    assert.equal(isFreeModel(id), true);
  for (const id of [
    "openrouter/auto",
    "vendor/mini",
    "vendor/mini:free:nitro",
    "",
  ])
    assert.equal(isFreeModel(id), false);
  const fetchMock = t.mock.method(globalThis, "fetch", async () => {
    throw new Error("must not fetch");
  });
  await assert.rejects(
    () =>
      requestReply({
        key: "test",
        model: "paid/model",
        character: characters[0],
        intensity: "normal",
        history: [],
        signal: new AbortController().signal,
      }),
    /только/,
  );
  await assert.rejects(
    () =>
      requestReply({
        key: "",
        model: DEFAULT_MODEL,
        character: characters[0],
        intensity: "normal",
        history: [],
        signal: new AbortController().signal,
      }),
    /API-ключ/,
  );
  assert.equal(fetchMock.mock.callCount(), 0);
});
