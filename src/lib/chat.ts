import type { Character, Intensity, Message, Reply } from "./characters";

export function parseReply(raw: string): Reply {
  const clean = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  try {
    const data: unknown = JSON.parse(clean);
    if (
      !data ||
      typeof data !== "object" ||
      !("text" in data) ||
      typeof data.text !== "string" ||
      !data.text.trim()
    )
      throw new Error("Invalid reply");
    const reply = data as Record<string, unknown>;
    return {
      text: (reply.text as string).trim().slice(0, 2500),
      mood: ["idle", "speaking", "offended", "rude"].includes(
        String(reply.mood),
      )
        ? (reply.mood as Reply["mood"])
        : "speaking",
      leaveSeconds:
        typeof reply.leaveSeconds === "number" &&
        Number.isFinite(reply.leaveSeconds)
          ? Math.max(0, Math.min(60, Math.round(reply.leaveSeconds)))
          : 0,
    };
  } catch {
    return {
      text:
        raw.trim().slice(0, 2500) ||
        "Даже у меня закончились слова. Попробуй ещё раз.",
      mood: "speaking",
      leaveSeconds: 0,
    };
  }
}

export const DEFAULT_MODEL = "openrouter/free";
export function isFreeModel(model: string): boolean {
  return (
    model === DEFAULT_MODEL ||
    /^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_./-]+:free$/.test(model)
  );
}
export class ChatError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
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
}): Promise<Reply> {
  const { key, model, character, intensity, history, signal } = options;
  if (!key.trim()) throw new ChatError(401, "Нужен API-ключ OpenRouter.");
  if (!isFreeModel(model))
    throw new Error(
      "Разрешены только openrouter/free и модели с суффиксом :free.",
    );
  const tone = {
    soft: "Добрый юмор, без мата и грубых жестов.",
    normal:
      "Колкости и дружеская прожарка. Не переходи к настоящей жестокости.",
    wild: "Пользователь выбрал жёсткую дружескую прожарку. Разрешены мат и грубый жест. Будь смешным, а не просто злым.",
  }[intensity];
  const response = await fetch(
    "https://openrouter.ai/api/v1/chat/completions",
    {
      method: "POST",
      signal,
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        "X-Title": "clippyXam",
      },
      body: JSON.stringify({
        model,
        temperature: 0.9,
        max_tokens: 350,
        provider: { sort: "latency", max_price: { prompt: 0, completion: 0 } },
        messages: [
          {
            role: "system",
            content: `${character.persona} Раздражение сейчас ${Math.max(0, Math.min(100, options.irritation || 0))} из 100: учитывай это в тоне, но оставайся полезным. ${options.allowRude === false ? "Грубые жесты отключены пользователем. Никогда не выбирай mood rude." : ""} ${options.away ? "Сейчас ты обиделся и ушёл за кадр. Только ненадолго выгляни: одна короткая реплика, до 12 слов. Не продлевай уход: leaveSeconds 0. Если пользователь извиняется или зовёт обратно, можешь вернуться и ответить нормально." : ""} Отвечай по-русски, коротко (1–4 предложения). ${tone} Это добровольная комедийная ролевая игра. Не используй ненависть к защищённым группам, угрозы реального насилия или подталкивание к самоповреждению. Если пользователь просит прекратить подколы, уважай это. Можно обидеться и уйти на 10–30 секунд, но не каждый раз. Ответ только JSON: {"text":"реплика","mood":"speaking","leaveSeconds":0}. mood одно из speaking, idle, offended, rude. rude — показать средний палец; в мягком режиме запрещён. leaveSeconds от 0 до 60, больше 0 означает временный уход за кадр. Никакого Markdown вокруг JSON.`,
          },
          ...history.slice(-20).map(({ role, content }) => ({ role, content })),
        ],
      }),
    },
  );
  if (!response.ok) {
    const errors: Record<number, string> = {
      401: "Ключ не принят. Проверь API-ключ в настройках.",
      402: "OpenRouter ограничил бесплатный доступ. Платный маршрут не включён.",
      403: "OpenRouter отклонил запрос. Проверь доступ к модели.",
      404: "Модель не найдена. Проверь её ID в настройках.",
      429: "Лимит бесплатных запросов. Подожди и повтори; платные модели не используются.",
    };
    throw new ChatError(
      response.status,
      errors[response.status] ||
        `OpenRouter недоступен (HTTP ${response.status}). Попробуй позже.`,
    );
  }
  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim())
    throw new Error("Модель вернула пустой ответ. Попробуй другую модель.");
  const reply = parseReply(content);
  if (
    (intensity === "soft" || options.allowRude === false) &&
    reply.mood === "rude"
  )
    reply.mood = "speaking";
  return reply;
}
