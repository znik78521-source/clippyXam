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
  const pool =
    intensity === "wild"
      ? [
          ...asides[id],
          "Отвернись, мудила. Я тут вообще-то прячусь.",
          "Чего уставился? Делай вид, что работаешь.",
          "Я не вернулся. Проверяю, не заебал ли ты кого-нибудь ещё.",
        ]
      : asides[id];
  const text =
    pool[Math.min(pool.length - 1, Math.floor(random() * pool.length))];
  return {
    text,
    rude:
      intensity !== "soft" && random() < (intensity === "wild" ? 0.35 : 0.12),
  };
}
export function isApology(text: string) {
  return /вернись|прости|извини/i.test(text);
}
export function requestsGentle(text: string) {
  return /не (шути|угрожай)|без (шуток|угроз)|хватит (шутить|шуток|угроз)|без (подколов|мата|оскорблений)|не (подкалывай|оскорбляй|издевайся)|хватит (подколов|оскорблений)|прекрати (подколы|оскорблять)|stop roasting/i.test(
    text,
  );
}
export function nextIrritation(current: number, text: string) {
  if (isApology(text) || requestsGentle(text)) return Math.max(0, current - 40);
  if (/спасибо|молодец|хороший/i.test(text)) return Math.max(0, current - 20);
  const delta = isInsult(text)
    ? 28
    : /срочно|быстрее|немедленно/i.test(text)
      ? 14
      : -3;
  return Math.max(0, Math.min(100, current + delta));
}

export function isInsult(text: string) {
  return /тупой|идиот|бесишь|заткнись|отстань|нахуй|на хуй|заеб|муд[аи]|пош[её]л|сука|долбо[её]б/i.test(
    text,
  );
}
