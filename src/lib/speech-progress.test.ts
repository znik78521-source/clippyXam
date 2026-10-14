import { test } from "node:test";
import assert from "node:assert/strict";
import { wordRange } from "./speech-progress";
import { SpeechQueue } from "./speech";
import type { SpeechProgress } from "./speech-progress";

test("word boundaries use UTF-16 and support Russian text with missing charLength", () => {
  assert.deepEqual(wordRange("Привет, мир!", 8, 0), { start: 8, end: 11 });
  assert.deepEqual(wordRange("👋 Привет", 3), { start: 3, end: 9 });
  assert.deepEqual(wordRange("слово", 0, 999), { start: 0, end: 5 });
  for (const index of [-1, NaN, Infinity, 99, 0.5])
    assert.equal(wordRange("текст", index), null);
  assert.equal(wordRange("  ", 0), null);
});
test("progress clears on stop and stale voice callbacks cannot highlight a new sentence", async () => {
  let boundary: (index: number, length?: number) => void = () => {};
  const progress: (SpeechProgress | null)[] = [];
  const queue = new SpeechQueue(
    async (_text, _options, signal, _started, callback) => {
      boundary = callback!;
      await new Promise<void>((resolve) =>
        signal.addEventListener("abort", () => resolve(), { once: true }),
      );
    },
    () => {},
    assert.fail,
    (value) => progress.push(value),
  );
  queue.enqueue("Привет мир", {
    provider: "system",
    key: "",
    voice: "",
    rate: 1,
    character: "clippy",
  });
  boundary(7);
  assert.deepEqual(progress.at(-1), { text: "Привет мир", start: 7, end: 10 });
  queue.stop();
  const count = progress.length;
  boundary(0, 6);
  assert.equal(progress.length, count);
  assert.equal(progress.at(-1), null);
});
