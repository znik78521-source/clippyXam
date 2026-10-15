// Actual Piper inference on Windows, without an OpenRouter/OpenAI key or microphone.
import { createRequire } from "node:module";
import path from "node:path";
import fs from "node:fs/promises";
import { EventEmitter } from "node:events";
import { spawn } from "node:child_process";
let starts = 0;
const require = createRequire(import.meta.url);
const { createLocalVoice } = require("../electron/local-voice.cjs");
const voice = createLocalVoice({
  baseDir: path.resolve("release/voice-test-model"),
  engineDir: path.resolve("voice-engine/runtime"),
  timeoutMs: 180000,
  spawn: (...args) => {
    starts++;
    return spawn(...args);
  },
});
try {
  await voice.warm(1);
  const coldAt = performance.now();
  const wav = await voice.synthesize(
    new EventEmitter(),
    "Проверка русского голоса. Скрепка снова разговаривает.",
    1,
  );
  if (wav?.toString("ascii", 0, 4) !== "RIFF" || wav.length < 10000)
    throw new Error("No Russian WAV generated");
  let energy = 0;
  for (let i = 44; i + 1 < wav.length; i += 2)
    energy += Math.abs(wav.readInt16LE(i));
  if (energy < 100000) throw new Error("Silent output");
  const coldMs = Math.round(performance.now() - coldAt),
    warmAt = performance.now();
  const second = await voice.synthesize(
    new EventEmitter(),
    "Проверка русского голоса. Скрепка снова разговаривает.",
    1,
  );
  if (second?.toString("ascii", 0, 4) !== "RIFF" || second.length < 10000)
    throw new Error("Warm Piper did not produce second WAV");
  const warmMs = Math.round(performance.now() - warmAt);
  if (starts !== 1)
    throw new Error("Engine reloaded between equal-rate requests");
  const faster = await voice.synthesize(
    new EventEmitter(),
    "Проверка русского голоса. Скрепка снова разговаривает.",
    1.25,
  );
  if (faster?.toString("ascii", 0, 4) !== "RIFF" || faster.length < 1000)
    throw new Error("Rate change failed");
  if (faster.length >= wav.length)
    throw new Error("Higher speech rate did not shorten audio");
  const cancelledOwner = new EventEmitter();
  const cancelled = voice.synthesize(
    cancelledOwner,
    "Проверка отмены. ".repeat(60),
    1.25,
  );
  setTimeout(() => voice.stop(cancelledOwner), 10);
  if ((await cancelled) !== null)
    throw new Error("Cancellation did not return null");
  const recovered = await voice.synthesize(
    new EventEmitter(),
    "Голос работает после отмены.",
    1.25,
  );
  if (!recovered || recovered.length < 1000)
    throw new Error("No recovery after cancellation");
  console.log(
    JSON.stringify({
      coldMs,
      warmMs,
      normalAudioSeconds: (wav.length - 44) / 44100,
      fasterAudioSeconds: (faster.length - 44) / 44100,
      starts,
      cancellationRecovery: true,
    }),
  );
  console.log(
    "Warm engine reuse and rate change passed:",
    second.length,
    faster.length,
  );
  await fs.mkdir("release", { recursive: true });
  await fs.writeFile("release/russian-voice-test.wav", wav);
  console.log(
    `Real Piper Russian synthesis passed: ${wav.length} WAV bytes, energy ${energy}.`,
  );
} finally {
  voice.dispose();
}
