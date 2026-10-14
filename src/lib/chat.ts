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

export function demoReply(
  text: string,
  character: Character,
  intensity: Intensity,
  count = 0,
): Reply {
  const lower = text.toLowerCase();
  const reply = (
    text: string,
    mood: Reply["mood"] = "speaking",
    leaveSeconds = 0,
  ): Reply => ({ text, mood, leaveSeconds });
  if (/вернись|прости|извини/.test(lower))
    return reply(
      "Ладно, проехали. Но я это запомнил. В оперативной памяти, так что ненадолго.",
    );
  if (/уйди|уходи|отстань|бесишь|тупой|заткнись/.test(lower))
    return reply(
      intensity === "soft"
        ? "Ладно, возьму небольшую паузу. Скоро вернусь."
        : "Ну и пожалуйста. Пойду туда, где ценят скрепки. В канцтовары, например.",
      "offended",
      15,
    );
  if (/фак|жест|пальц/.test(lower))
    return intensity === "soft"
      ? reply("Сегодня обойдёмся без жестов. Считай, тебе повезло.")
      : reply(
          "Вот тебе мой развёрнутый ответ. Считай, техническая поддержка сработала.",
          "rude",
        );
  if (/умеешь|помощь|help/.test(lower))
    return reply(
      "Могу болтать, закатывать глаза и уходить в самый неподходящий момент. Пока я в демо-режиме — настоящие мозги подключаются в настройках OpenRouter.",
    );
  if (/привет|здравств|хай/.test(lower))
    return reply(
      character.id === "rover"
        ? "Гав! Ну наконец-то. Я уже три раза принёс палку сам себе. Рассказывай, как день?"
        : character.id === "merlin"
          ? "Приветствую, смертный. Для вызова меня достаточно кнопки. Пентаграмму с рабочего стола можешь убрать."
          : "Привет-привет. Дай угадаю: открыл компьютер поработать, а теперь разговариваешь со скрепкой?",
    );
  if (/обосри|прожарь|roast|подкол/.test(lower))
    return reply(
      intensity === "soft"
        ? "Ты так долго собираешься с мыслями, что у них уже свой чемодан."
        : intensity === "wild"
          ? "Твой список дел — это, блин, кладбище амбиций. Даже я, скрепка из девяностых, обновляюсь чаще, чем твои планы."
          : "У тебя столько открытых вкладок, будто продуктивность считается по их количеству. Спойлер: нет.",
    );
  if (/работ|дел|мотивац|дедлайн/.test(lower))
    return reply(
      "Закрой лишние вкладки. Поставь таймер на 15 минут. Сделай одну маленькую задачу. Да, это совет от скрепки. Да, он работает.",
    );
  const lines =
    character.id === "rover"
      ? [
          "Я бы помог, но у меня лапки. Ладно, шучу. Что именно ищем?",
          "Обдумал. Погулять всё равно полезнее, чем сидеть перед экраном.",
        ]
      : character.id === "merlin"
        ? [
            "Хм. Мой хрустальный шар показывает: надо перестать откладывать. Неприятная магия, согласен.",
            "Заклинание не сработало. Попробуй уточнить вопрос. И не забудь «пожалуйста», это часть ритуала.",
          ]
        : [
            "Я сделал вид, что внимательно слушаю. Прямо как ты на последнем созвоне. Продолжай.",
            "Звучит как задача для кого-то компетентного. Но здесь только ты и скрепка. Разберёмся?",
          ];
  return reply(lines[count % lines.length]);
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
        max_tokens: 750,
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
      402: "На балансе OpenRouter недостаточно средств.",
      403: "OpenRouter отклонил запрос. Проверь доступ к модели.",
      404: "Модель не найдена. Проверь её ID в настройках.",
      429: "Слишком много запросов. Подожди немного и повтори.",
    };
    throw new Error(
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
