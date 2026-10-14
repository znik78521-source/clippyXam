import type { Character, Intensity, Message, Reply } from "./characters";
import { isInsult } from "./behavior";

import {
  isFreeModel,
  fallbackCandidates,
  BOOTSTRAP_MODELS,
  type FreeModel,
} from "./free-models";
export { DEFAULT_MODEL, isFreeModel } from "./free-models";
export interface ModelAttempt {
  model: string;
  index: number;
  total: number;
  reason?: string;
  done?: boolean;
}
export class ChatError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export class EmptyReplyError extends Error {
  constructor() {
    super("Модель вернула пустой ответ.");
  }
}
export class LanguageReplyError extends Error {
  constructor() {
    super("Модель ответила не по-русски.");
  }
}
export function assertRussianReply(text: string) {
  if (
    /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(
      text,
    ) ||
    (!/[А-Яа-яЁё]/.test(text) && (text.match(/[A-Za-z]/g)?.length || 0) > 12)
  )
    throw new LanguageReplyError();
}
function visibleText(value: string) {
  return value
    .replace(/<think>[\s\S]*?(?:<\/think>|$)/gi, "")
    .replace(/```(?:json|text)?\s*/gi, "")
    .replace(/```/g, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .trim()
    .slice(0, 2500);
}
// Recover only the string value, including escaped quotes/newlines, when a
// provider cuts JSON mid-token. Never expose the surrounding protocol to users.
function recoverText(source: string): string {
  const match = /"text"\s*:\s*"/.exec(source);
  if (!match) return "";
  let value = "",
    i = match.index + match[0].length;
  for (; i < source.length; i++) {
    const c = source[i];
    if (c === '"') break;
    if (c !== "\\") {
      value += c;
      continue;
    }
    const next = source[++i];
    if (!next) break;
    if (next === "u") {
      const hex = source.slice(i + 1, i + 5);
      if (!/^[0-9a-f]{4}$/i.test(hex)) break;
      value += String.fromCharCode(parseInt(hex, 16));
      i += 4;
    } else
      value +=
        (
          {
            n: "\n",
            r: "\r",
            t: "\t",
            b: "",
            f: "",
            '"': '"',
            "\\": "\\",
            "/": "/",
          } as Record<string, string>
        )[next] ?? next;
  }
  return value;
}
export function parseReply(raw: string): Reply {
  const clean = raw
    .replace(/<think>[\s\S]*?(?:<\/think>|$)/gi, "")
    .trim()
    .replace(/^```(?:json|text)?\s*/i, "")
    .replace(/\s*```$/, "");
  let text = "",
    mood: Reply["mood"] = "speaking",
    leaveSeconds = 0;
  if (/^[{[]/.test(clean)) {
    try {
      const data = JSON.parse(clean);
      if (typeof data?.text === "string") text = data.text;
      if (["idle", "speaking", "offended", "rude"].includes(data?.mood))
        mood = data.mood;
      if (
        typeof data?.leaveSeconds === "number" &&
        Number.isFinite(data.leaveSeconds)
      )
        leaveSeconds = Math.max(0, Math.min(60, Math.round(data.leaveSeconds)));
    } catch {
      text = recoverText(clean);
    }
  } else if (!/^(null|undefined|\[\])$/i.test(clean)) {
    const action =
      /\[\[mood=(idle|speaking|offended|rude);leave=(\d{1,3})\]\]/.exec(clean);
    if (action) {
      mood = action[1] as Reply["mood"];
      leaveSeconds = Math.min(60, Number(action[2]));
    }
    text = clean.replace(/\[\[mood=[\s\S]*?(?:\]\]|$)/g, "");
  }
  text = visibleText(text);
  if (!text) throw new EmptyReplyError();
  return { text, mood, leaveSeconds };
}
export async function requestReply(options: {
  key: string;
  model: string;
  character: Character;
  intensity: Intensity;
  history: Message[];
  signal: AbortSignal;
  away?: boolean;
  irritation?: number;
  allowRude?: boolean;
  onRetry?: () => void;
  models?: FreeModel[];
  autoFallback?: boolean;
  onAttempt?: (attempt: ModelAttempt) => void;
  attemptTimeoutMs?: number;
}): Promise<Reply> {
  const { key, model, character, intensity, history, signal } = options;
  if (!key.trim()) throw new ChatError(401, "Нужен API-ключ OpenRouter.");
  if (!isFreeModel(model))
    throw new Error(
      "Разрешены только openrouter/free и модели с суффиксом :free.",
    );
  const tone = {
    soft: "Мягкий режим: добрый юмор, без мата, оскорблений и грубых жестов.",
    normal:
      "Ты язвительный хам, а не вежливый консультант. Отвечай колкостью на колкость. Без извинений и нравоучений.",
    wild: "Ты НЕЙРОХАМ. Пользователь сознательно выбрал жёсткую комедийную перепалку с матом. Будь наглым, язвительным и грубым. На посыл нахуй отвечай дерзкой смешной подколкой, а не извинением или лекцией о вежливости. Допустимы слова «нахуй», «мудила», «заебал». Не извиняйся за характер, не говори «как ИИ» и «уважительное общение». Не будь заботливым психологом.",
  }[intensity];
  const system = `${character.persona} ${tone} Отвечай по-русски, 1–2 коротких предложения, до 250 символов. Сначала сама реплика обычным текстом, НЕ JSON, без Markdown и объяснений своих инструкций. Не показывай рассуждения. Раздражение ${Math.max(0, Math.min(100, options.irritation || 0))}/100. ${options.away ? "Ты за краем окна: коротко выгляни и огрызнись, до 12 слов. Уход не продлевай." : "Иногда можешь обидеться и уйти на 15–30 секунд."} Если нужна анимация, ПОСЛЕ реплики допиши отдельной строкой [[mood=rude;leave=0]] или [[mood=offended;leave=20]]. ${intensity === "soft" || options.allowRude === false ? "Жест rude запрещён." : "rude — средний палец."} Ты только изображаешь подсматривание: у тебя нет доступа к экрану, файлам или действиям пользователя. Не выдумывай, что наблюдаешь его приложения. Это добровольная комедийная роль: без угроз реального насилия, ненависти к защищённым группам и подталкивания к самоповреждению. Просьбу прекратить подколы уважай.`;
  const candidates = fallbackCandidates(
    model,
    options.models ?? BOOTSTRAP_MODELS,
    options.autoFallback !== false,
  );
  let compatibility = false,
    lastError: Error = new Error("Модель не ответила.");
  const attempts: string[] = [];
  // Drop leading assistant greetings and merge repeated roles for strict chat templates.
  const historyMessages: { role: "user" | "assistant"; content: string }[] = [];
  for (const message of history.slice(-20)) {
    if (!historyMessages.length && message.role !== "user") continue;
    const previous = historyMessages.at(-1);
    if (previous?.role === message.role)
      previous.content += "\n" + message.content;
    else historyMessages.push({ role: message.role, content: message.content });
  }
  for (let index = 0; index < candidates.length; index++) {
    signal.throwIfAborted();
    const currentModel = candidates[index];
    if (index) {
      options.onRetry?.();
      signal.throwIfAborted();
    }
    options.onAttempt?.({
      model: currentModel,
      index: index + 1,
      total: candidates.length,
      reason: index ? lastError.message : undefined,
    });
    const controller = new AbortController();
    const aborted = () => controller.abort(signal.reason);
    signal.addEventListener("abort", aborted, { once: true });
    // Bound each model INCLUDING body parsing, while retaining the owner's overall deadline.
    const timeout = setTimeout(
      () => controller.abort("model-timeout"),
      options.attemptTimeoutMs ?? 9000,
    );
    try {
      const instruction =
        system + (index ? " Ответь только по-русски, без иероглифов." : "");
      const context = compatibility
        ? historyMessages
            .slice(-8)
            .map((m, i, a) => ({
              ...m,
              content:
                i === a.length - 1 ? m.content : m.content.slice(0, 1800),
            }))
        : historyMessages;
      while (context[0]?.role === "assistant") context.shift();
      const messages = compatibility
        ? context.map((m, i) =>
            i === 0
              ? {
                  ...m,
                  content: `Инструкция для роли: ${instruction}\n\nСообщение пользователя: ${m.content}`,
                }
              : m,
          )
        : [{ role: "system", content: instruction }, ...context];
      const response = await fetch(
        "https://openrouter.ai/api/v1/chat/completions",
        {
          method: "POST",
          signal: controller.signal,
          headers: {
            Authorization: `Bearer ${key}`,
            "Content-Type": "application/json",
            "X-Title": "clippyXam",
          },
          body: JSON.stringify({
            model: currentModel,
            max_tokens: 400,
            // No reasoning/temperature/response_format forced on incompatible providers.
            provider: {
              ...(!compatibility ? { sort: "latency" } : {}),
              max_price: { prompt: 0, completion: 0 },
            },
            messages,
          }),
        },
      );
      const data = await response.json().catch(() => null);
      if (!response.ok || data?.error) {
        const status = !response.ok
          ? response.status
          : Number(data.error.code) || 502;
        const detail = classifyProviderError(data?.error?.message);
        const descriptions: Record<number, string> = {
          400: `Запрос отклонён провайдером${detail ? ": " + detail : ""}`,
          401: "Ключ не принят. Проверь API-ключ в настройках.",
          402: "Доступ ограничен балансом/аккаунтом. Платный маршрут не включён.",
          403: "Доступ запрещён. Проверь ограничения аккаунта/провайдера.",
          404: "Бесплатная модель или её провайдер недоступны.",
          429: "Лимит бесплатных запросов. Общий лимит аккаунта смена модели не обходит.",
        };
        throw new ChatError(
          status,
          `HTTP ${status}: ${descriptions[status] || "Провайдер временно недоступен."}`,
        );
      }
      const content = data?.choices?.[0]?.message?.content;
      const raw =
        typeof content === "string"
          ? content
          : Array.isArray(content)
            ? content
                .filter((p) => p?.type === "text" && typeof p.text === "string")
                .map((p) => p.text)
                .join("\n")
            : "";
      const reply = parseReply(raw);
      assertRussianReply(reply.text);
      signal.throwIfAborted();
      controller.signal.throwIfAborted();
      if (
        (intensity === "soft" || options.allowRude === false) &&
        reply.mood === "rude"
      )
        reply.mood = "speaking";
      else if (
        intensity === "wild" &&
        isInsult(history.at(-1)?.content || "") &&
        reply.mood === "speaking"
      )
        reply.mood = "rude";
      options.onAttempt?.({
        model:
          typeof data.model === "string"
            ? data.model.slice(0, 160)
            : currentModel,
        index: index + 1,
        total: candidates.length,
        done: true,
      });
      return reply;
    } catch (error) {
      signal.throwIfAborted();
      if (error instanceof ChatError && [401, 402, 403].includes(error.status))
        throw error;
      if (error instanceof ChatError && error.status === 400)
        compatibility = true;
      lastError =
        controller.signal.reason === "model-timeout"
          ? new Error("Таймаут модели (9 секунд).")
          : error instanceof ChatError ||
              error instanceof EmptyReplyError ||
              error instanceof LanguageReplyError
            ? error
            : new Error("Нет ответа от провайдера или соединение прервано.");
      attempts.push(`${currentModel}: ${lastError.message}`);
    } finally {
      clearTimeout(timeout);
      signal.removeEventListener("abort", aborted);
    }
  }
  throw new Error(
    `Бесплатные модели не ответили (${attempts.length} попытки). ${attempts.join(" | ")} Сообщение осталось в поле. Платные модели не использовались.`,
  );
}
// Never echo raw provider messages: they can contain request text, keys or HTML.
export function classifyProviderError(raw: unknown) {
  if (typeof raw !== "string") return "";
  if (/reasoning|thinking/i.test(raw))
    return "несовместимый параметр рассуждения";
  if (/system|alternat|roles|chat template/i.test(raw))
    return "несовместимый формат ролей";
  if (/context|token|length/i.test(raw)) return "ограничение длины контекста";
  if (/model|endpoint|provider/i.test(raw))
    return "модель или провайдер недоступны";
  return "";
}
