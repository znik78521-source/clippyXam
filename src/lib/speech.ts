import type { CharacterId } from "./characters";
import { wordRange } from "./speech-progress";
import type { SpeechProgress } from "./speech-progress";
export interface VoiceOptions {
  provider: "system" | "openai" | "local";
  key: string;
  voice: string;
  rate: number;
  character: CharacterId;
}
export type VoiceDriver = (
  text: string,
  options: VoiceOptions,
  signal: AbortSignal,
  started: () => void,
  boundary?: (index: number, length?: number) => void,
) => Promise<void>;
export class SpeechQueue {
  private queue: { text: string; options: VoiceOptions }[] = [];
  private controller: AbortController | null = null;
  private generation = 0;
  constructor(
    private driver: VoiceDriver,
    private activity: (busy: boolean, speaking: boolean) => void,
    private error: (message: string) => void,
    private progress: (value: SpeechProgress | null) => void = () => {},
  ) {}
  enqueue(text: string, options: VoiceOptions) {
    if (!text.trim()) return;
    if (this.queue.length >= 3) {
      this.error("В очереди уже три реплики. Подожди или останови озвучку.");
      return;
    }
    this.queue.push({
      text: text.trim().slice(0, 2500),
      options: { ...options },
    });
    if (!this.controller) void this.next();
  }
  stop() {
    this.generation++;
    this.queue = [];
    this.controller?.abort();
    this.controller = null;
    this.activity(false, false);
    this.progress(null);
  }
  private async next() {
    const job = this.queue.shift();
    if (!job) {
      this.activity(false, false);
      return;
    }
    const generation = this.generation;
    const controller = new AbortController();
    this.controller = controller;
    this.activity(true, false);
    this.progress(null);
    // Bound both network wait and OS voices that never report completion.
    const watchdog = setTimeout(() => controller.abort("timeout"), 120000);
    let onAbort = () => {};
    try {
      const aborted = new Promise<void>((resolve) => {
        onAbort = () => resolve();
        controller.signal.addEventListener("abort", onAbort, { once: true });
      });
      await Promise.race([
        aborted,
        this.driver(
          job.text,
          job.options,
          controller.signal,
          () => {
            if (generation === this.generation && !controller.signal.aborted)
              this.activity(true, true);
          },
          (index, length) => {
            if (generation !== this.generation || controller.signal.aborted)
              return;
            const range = wordRange(job.text, index, length);
            if (range) this.progress({ text: job.text, ...range });
          },
        ),
      ]);
      if (controller.signal.reason === "timeout")
        this.error("Озвучка превысила время ожидания.");
    } catch (error) {
      if (generation === this.generation && !controller.signal.aborted)
        this.error(
          error instanceof Error
            ? error.message
            : "Не удалось озвучить реплику.",
        );
      else if (
        generation === this.generation &&
        controller.signal.reason === "timeout"
      )
        this.error("Озвучка превысила время ожидания.");
    } finally {
      clearTimeout(watchdog);
      controller.signal.removeEventListener("abort", onAbort);
      if (generation === this.generation) {
        this.controller = null;
        this.progress(null);
        void this.next();
      }
    }
  }
}
export class AudioCache {
  private items = new Map<string, Blob>();
  private bytes = 0;
  constructor(
    private maxItems = 20,
    private maxBytes = 20 * 1024 * 1024,
  ) {}
  get(key: string) {
    const item = this.items.get(key);
    if (item) {
      this.items.delete(key);
      this.items.set(key, item);
    }
    return item;
  }
  put(key: string, blob: Blob) {
    if (blob.size > this.maxBytes) return;
    const old = this.items.get(key);
    if (old) {
      this.bytes -= old.size;
      this.items.delete(key);
    }
    this.items.set(key, blob);
    this.bytes += blob.size;
    while (this.items.size > this.maxItems || this.bytes > this.maxBytes) {
      const oldest = this.items.keys().next().value!;
      this.bytes -= this.items.get(oldest)!.size;
      this.items.delete(oldest);
    }
  }
  clear() {
    this.items.clear();
    this.bytes = 0;
  }
  get size() {
    return this.items.size;
  }
}
export async function fetchVoiceAudio(
  text: string,
  options: VoiceOptions,
  signal: AbortSignal,
): Promise<Blob> {
  if (!options.key.trim())
    throw new Error("Для OpenAI TTS нужен отдельный ключ в настройках голоса.");
  const response = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    signal,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${options.key}`,
    },
    body: JSON.stringify({
      model: "tts-1",
      voice: options.voice,
      input: text.slice(0, 2500),
      speed: options.rate,
      response_format: "mp3",
    }),
  });
  if (!response.ok) {
    const errors: Record<number, string> = {
      401: "OpenAI TTS: ключ не принят.",
      429: "OpenAI TTS: лимит запросов или средств.",
      403: "OpenAI TTS: доступ ограничен.",
    };
    throw new Error(
      errors[response.status] ||
        `Ошибка озвучки OpenAI (HTTP ${response.status}).`,
    );
  }
  if (!response.headers.get("content-type")?.startsWith("audio/"))
    throw new Error("Провайдер вернул не аудио.");
  if (Number(response.headers.get("content-length")) > 5 * 1024 * 1024)
    throw new Error("Слишком большой аудиоответ.");
  const blob = await response.blob();
  if (!blob.size || blob.size > 5 * 1024 * 1024)
    throw new Error("Некорректный размер аудиоответа.");
  return blob;
}
export function createBrowserVoiceDriver(cache: AudioCache): VoiceDriver {
  let cloudRequests = 0;
  return async (text, options, signal, started, boundary) => {
    if (signal.aborted) return;
    if (options.provider === "system") {
      if (!("speechSynthesis" in window))
        throw new Error("Системная озвучка недоступна в этом браузере.");
      const voices = window.speechSynthesis.getVoices();
      const voice =
        voices.find((v) => v.voiceURI === options.voice) ||
        voices.find((v) => v.lang.toLowerCase().startsWith("ru"));
      if (!voice)
        throw new Error(
          "Русский голос не найден. Установи его в ОС или выбери доступный голос.",
        );
      await new Promise<void>((resolve, reject) => {
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.voice = voice;
        utterance.lang = voice.lang;
        utterance.rate = options.rate;
        utterance.pitch =
          options.character === "rover"
            ? 1.2
            : options.character === "merlin"
              ? 0.8
              : 1;
        let settled = false;
        const finish = (error?: Error) => {
          if (settled) return;
          settled = true;
          signal.removeEventListener("abort", abort);
          utterance.onstart =
            utterance.onend =
            utterance.onerror =
            utterance.onboundary =
              null;
          error ? reject(error) : resolve();
        };
        const abort = () => {
          window.speechSynthesis.cancel();
          finish();
        };
        signal.addEventListener("abort", abort, { once: true });
        utterance.onstart = started;
        utterance.onboundary = (event) => {
          if (!signal.aborted && (!event.name || event.name === "word"))
            boundary?.(event.charIndex, event.charLength);
        };
        utterance.onend = () => finish();
        utterance.onerror = (event) =>
          finish(
            ["canceled", "interrupted"].includes(event.error)
              ? undefined
              : new Error(
                  "Ошибка системного голоса. Проверь языковой пакет и настройки.",
                ),
          );
        try {
          window.speechSynthesis.speak(utterance);
        } catch {
          finish(new Error("Системный голос не удалось запустить."));
        }
      });
      return;
    }
    if (options.provider === "local") {
      const bridge = window.clippyDesktop;
      if (!bridge?.synthesizeLocalVoice)
        throw new Error(
          "Локальный русский голос доступен в portable-приложении.",
        );
      const abort = () => {
        void bridge.stopLocalVoice?.().catch(() => {});
      };
      signal.addEventListener("abort", abort, { once: true });
      try {
        const bytes = await bridge.synthesizeLocalVoice(text, options.rate);
        if (signal.aborted || !bytes) return;
        await playAudio(
          new Blob([new Uint8Array(bytes)], { type: "audio/wav" }),
          signal,
          started,
        );
      } finally {
        signal.removeEventListener("abort", abort);
      }
      return;
    }
    const key = JSON.stringify([options.voice, options.rate, text]); // Never include API keys.
    let blob = cache.get(key);
    if (!blob) {
      if (cloudRequests >= 30)
        throw new Error(
          "Лимит 30 новых TTS-запросов на эту сессию исчерпан. Переключись на системный голос.",
        );
      cloudRequests++;
      const request = new AbortController();
      const abort = () => request.abort();
      signal.addEventListener("abort", abort, { once: true });
      const timeout = setTimeout(() => request.abort("timeout"), 45000);
      try {
        blob = await fetchVoiceAudio(text, options, request.signal);
        if (!signal.aborted) cache.put(key, blob);
      } catch (error) {
        if (request.signal.reason === "timeout")
          throw new Error("OpenAI TTS не ответил за 45 секунд.");
        if (error instanceof TypeError)
          throw new Error(
            "Нет связи с OpenAI TTS. Проверь доступность сервиса.",
          );
        throw error;
      } finally {
        clearTimeout(timeout);
        signal.removeEventListener("abort", abort);
      }
    }
    await playAudio(blob, signal, started);
  };
}
async function playAudio(blob: Blob, signal: AbortSignal, started: () => void) {
  if (signal.aborted) return;
  const url = URL.createObjectURL(blob);
  const audio = new Audio(url);
  try {
    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const finish = (error?: Error) => {
        if (settled) return;
        settled = true;
        signal.removeEventListener("abort", abort);
        audio.onplaying = audio.onended = audio.onerror = null;
        error ? reject(error) : resolve();
      };
      const abort = () => {
        audio.pause();
        finish();
      };
      signal.addEventListener("abort", abort, { once: true });
      audio.onplaying = started;
      audio.onended = () => finish();
      audio.onerror = () =>
        finish(new Error("Не удалось воспроизвести аудио."));
      audio
        .play()
        .catch(() =>
          finish(
            new Error(
              "Браузер заблокировал воспроизведение. Нажми кнопку озвучки ещё раз.",
            ),
          ),
        );
    });
  } finally {
    audio.pause();
    audio.removeAttribute("src");
    audio.load();
    URL.revokeObjectURL(url);
  }
}
