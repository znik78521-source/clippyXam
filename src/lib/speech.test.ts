import { test } from "node:test";
import assert from "node:assert/strict";
import { AudioCache, SpeechQueue, fetchVoiceAudio } from "./speech";
import type { VoiceOptions } from "./speech";
const options: VoiceOptions = {
  provider: "system",
  key: "",
  voice: "",
  rate: 1,
  character: "clippy",
};
const flush = () => new Promise((resolve) => setImmediate(resolve));
test("speech queue is sequential; finishing a sentence starts the next", async () => {
  const calls: string[] = [];
  const finish: (() => void)[] = [];
  const state: boolean[] = [];
  const q = new SpeechQueue(
    (text, _options, _signal, start) =>
      new Promise((resolve) => {
        calls.push(text);
        start();
        finish.push(resolve);
      }),
    (_busy, speaking) => state.push(speaking),
    assert.fail,
  );
  q.enqueue("один", options);
  q.enqueue("два", options);
  assert.deepEqual(calls, ["один"]);
  finish[0]();
  await flush();
  assert.deepEqual(calls, ["один", "два"]);
  finish[1]();
  await flush();
  assert.equal(state.at(-1), false);
  q.stop();
});
test("cancellation invalidates late starts and completions, including uncooperative drivers", async () => {
  const starts: (() => void)[] = [];
  const ends: (() => void)[] = [];
  const calls: string[] = [];
  const events: boolean[] = [];
  const q = new SpeechQueue(
    (text, _o, _s, start) =>
      new Promise((resolve) => {
        calls.push(text);
        starts.push(start);
        ends.push(resolve);
      }),
    (_b, s) => events.push(s),
    assert.fail,
  );
  q.enqueue("старое", options);
  q.enqueue("не читать", options);
  q.stop();
  q.enqueue("новое", options);
  const count = events.length;
  starts[0]();
  ends[0]();
  await flush();
  assert.equal(events.length, count);
  starts[1]();
  assert.equal(events.at(-1), true);
  ends[1]();
  await flush();
  assert.deepEqual(calls, ["старое", "новое"]);
  q.stop();
});
test("errors do not stall the queue and pending work is bounded", async () => {
  const errors: string[] = [];
  let resolve: () => void = () => {};
  const q = new SpeechQueue(
    () =>
      new Promise((r) => {
        resolve = r;
      }),
    () => {},
    (e) => errors.push(e),
  );
  for (let i = 0; i < 5; i++) q.enqueue(String(i), options);
  assert.equal(errors.length, 1);
  q.stop();
  resolve();
  await flush();
  const failing = new SpeechQueue(
    async () => {
      throw new Error("ошибка");
    },
    () => {},
    (e) => errors.push(e),
  );
  failing.enqueue("а", options);
  failing.enqueue("б", options);
  await flush();
  assert.deepEqual(errors.slice(-2), ["ошибка", "ошибка"]);
  failing.stop();
});
test("LRU cache is bounded by both items and bytes and can be cleared", () => {
  const cache = new AudioCache(2, 5);
  cache.put("a", new Blob(["12"]));
  cache.put("b", new Blob(["34"]));
  cache.get("a");
  cache.put("c", new Blob(["56"]));
  assert.equal(cache.get("b"), undefined);
  assert.equal(cache.size, 2);
  cache.put("d", new Blob(["12345"]));
  assert.equal(cache.size, 1);
  cache.clear();
  assert.equal(cache.size, 0);
});
test("cloud voice sends only the TTS key to its fixed endpoint and clips input", async (t) => {
  t.mock.method(globalThis, "fetch", async (url: string, init: RequestInit) => {
    assert.equal(url, "https://api.openai.com/v1/audio/speech");
    assert.equal(
      (init.headers as Record<string, string>).Authorization,
      "Bearer tts-key",
    );
    const data = JSON.parse(init.body as string);
    assert.equal(data.input.length, 2500);
    assert.equal(data.model, "tts-1");
    assert.equal(data.voice, "alloy");
    return new Response("audio", { headers: { "content-type": "audio/mpeg" } });
  });
  const blob = await fetchVoiceAudio(
    "x".repeat(3000),
    { ...options, provider: "openai", voice: "alloy", key: "tts-key" },
    new AbortController().signal,
  );
  assert.equal(blob.size, 5);
});
test("cloud voice rejects missing keys, wrong MIME, errors and oversized responses", async (t) => {
  const mock = t.mock.method(
    globalThis,
    "fetch",
    async () =>
      new Response("{}", { headers: { "content-type": "application/json" } }),
  );
  await assert.rejects(
    () => fetchVoiceAudio("hello", options, new AbortController().signal),
    /отдельный ключ/,
  );
  const configured = { ...options, key: "test" };
  await assert.rejects(
    () => fetchVoiceAudio("hello", configured, new AbortController().signal),
    /не аудио/,
  );
  mock.mock.mockImplementation(async () => new Response("", { status: 401 }));
  await assert.rejects(
    () => fetchVoiceAudio("hello", configured, new AbortController().signal),
    /ключ не принят/,
  );
  mock.mock.mockImplementation(
    async () =>
      new Response("x", {
        headers: {
          "content-type": "audio/mpeg",
          "content-length": String(6000000),
        },
      }),
  );
  await assert.rejects(
    () => fetchVoiceAudio("hello", configured, new AbortController().signal),
    /Слишком большой/,
  );
});

test("cloud driver enforces its session attempt limit even across cache clearing", async (t) => {
  let requests = 0;
  t.mock.method(globalThis, "fetch", async () => {
    requests++;
    return new Response("", { status: 401 });
  });
  const { createBrowserVoiceDriver } = await import("./speech");
  const cache = new AudioCache();
  const driver = createBrowserVoiceDriver(cache);
  for (let i = 0; i < 30; i++)
    await assert.rejects(
      () =>
        driver(
          "реплика",
          { ...options, provider: "openai", key: "test", voice: "alloy" },
          new AbortController().signal,
          () => {},
        ),
      /ключ не принят/,
    );
  cache.clear();
  await assert.rejects(
    () =>
      driver(
        "реплика",
        { ...options, provider: "openai", key: "test", voice: "alloy" },
        new AbortController().signal,
        () => {},
      ),
    /Лимит 30/,
  );
  assert.equal(requests, 30);
});
