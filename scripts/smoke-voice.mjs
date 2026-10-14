// Actual Piper inference on Windows, without an OpenRouter/OpenAI key or microphone.
import { createRequire } from "node:module";
import path from "node:path";
import fs from "node:fs/promises";
import { EventEmitter } from "node:events";
const require = createRequire(import.meta.url);
const { createLocalVoice } = require("../electron/local-voice.cjs");
const voice = createLocalVoice({
  baseDir: path.resolve("release/voice-test-model"),
  engineDir: path.resolve("voice-engine/runtime"),
  timeoutMs: 180000,
});
try {
  await voice.prepare();
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
  await fs.mkdir("release", { recursive: true });
  await fs.writeFile("release/russian-voice-test.wav", wav);
  console.log(
    `Real Piper Russian synthesis passed: ${wav.length} WAV bytes, energy ${energy}.`,
  );
} finally {
  voice.dispose();
}
