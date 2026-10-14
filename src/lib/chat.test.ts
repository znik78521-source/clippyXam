import { test } from "node:test";
import assert from "node:assert/strict";
import { demoReply, parseReply, requestReply } from "./chat";
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
test("demo departure, forgiveness, rude action and gentle mode", () => {
  assert.equal(demoReply("Уйди", characters[0], "normal").leaveSeconds, 15);
  assert.equal(
    demoReply("Извини, вернись", characters[0], "normal").leaveSeconds,
    0,
  );
  assert.equal(demoReply("Покажи фак", characters[0], "wild").mood, "rude");
  assert.notEqual(demoReply("Покажи фак", characters[0], "soft").mood, "rude");
  assert.notEqual(
    demoReply("Прожарь меня", characters[0], "wild").text,
    demoReply("Прожарь меня", characters[0], "soft").text,
  );
});
test("demo personas differ and generic replies vary", () => {
  assert.match(demoReply("Привет", characters[1], "normal").text, /Гав/);
  assert.match(demoReply("Привет", characters[2], "normal").text, /смертный/);
  assert.notEqual(
    demoReply("abc", characters[0], "normal", 1).text,
    demoReply("abc", characters[0], "normal", 2).text,
  );
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
    model: "test/model",
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
  assert.equal(payload.model, "test/model");
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
    model: "test/model",
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
        model: "test/model",
        character: characters[0],
        intensity: "normal",
        history: [],
        signal: controller.signal,
      }),
    { name: "AbortError" },
  );
});
