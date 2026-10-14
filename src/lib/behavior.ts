import type { CharacterId, Intensity } from "./characters";

const asides: Record<CharacterId, string[]> = {
  clippy: [
    "Я ушёл. Не значит, что перестал осуждать.",
    "Ну что, без скрепки жизнь наладилась?",
    "Я всё слышу. Просто не помогаю.",
  ],
  rover: [
    "Гав. Это не возвращение. Это проверка.",
    "Я за дверью. И палка тоже.",
    "Скучаешь? А надо было гулять вовремя.",
  ],
  merlin: [
    "Я не вернулся. Это астральная проекция.",
    "Тишина — тоже заклинание. Попробуй.",
    "Великий Мерлин всё ещё остывает.",
  ],
};
export function chooseAside(
  id: CharacterId,
  intensity: Intensity,
  random = Math.random,
) {
  const text =
    asides[id][
      Math.min(asides[id].length - 1, Math.floor(random() * asides[id].length))
    ];
  return {
    text,
    rude:
      intensity !== "soft" && random() < (intensity === "wild" ? 0.35 : 0.12),
  };
}
export function isApology(text: string) {
  return /вернись|прости|извини/i.test(text);
}
export function shortAside(text: string) {
  const sentence = text.trim().split(/(?<=[.!?…])\s/)[0];
  if (sentence.length <= 150) return sentence;
  const cut = sentence.slice(0, 147);
  const boundary = cut.lastIndexOf(" ");
  return `${cut.slice(0, boundary > 90 ? boundary : cut.length)}…`;
}

export function requestsGentle(text: string) {
  return /без (подколов|мата|оскорблений)|не (подкалывай|оскорбляй|издевайся)|хватит (подколов|оскорблений)|прекрати (подколы|оскорблять)|stop roasting/i.test(
    text,
  );
}
export function nextIrritation(current: number, text: string) {
  if (isApology(text) || requestsGentle(text)) return Math.max(0, current - 40);
  if (/спасибо|молодец|хороший/i.test(text)) return Math.max(0, current - 20);
  const delta = /тупой|идиот|бесишь|заткнись|отстань/i.test(text)
    ? 28
    : /срочно|быстрее|немедленно/i.test(text)
      ? 14
      : -3;
  return Math.max(0, Math.min(100, current + delta));
}
