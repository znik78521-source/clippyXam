import type { Intensity } from "./characters";
export const cinematicNames = [
  "bat",
  "burrow",
  "jail",
  "flame",
  "rage",
  "format",
  "bsod",
  "update",
] as const;
export type CinematicKind = (typeof cinematicNames)[number];
export const cinematicDuration: Record<CinematicKind, number> = {
  bat: 3300,
  burrow: 4100,
  jail: 4800,
  flame: 3400,
  rage: 3000,
  format: 4200,
  bsod: 3400,
  update: 4200,
};
export const cinematicLabel: Record<CinematicKind, string> = {
  bat: "Бита и трещины",
  burrow: "Закопаться",
  jail: "Мемный арест",
  flame: "Огнемёт",
  rage: "Злость и звёздочки",
  format: "Мнимое форматирование",
  bsod: "Шуточный синий экран",
  update: "Фальшивое обновление",
};
const lines: Record<CinematicKind, string> = {
  bat: "Сейчас поправлю тебе экран. Пластмассовой битой, не ссы.",
  burrow: "Аргументы закончились. Пойду закопаю остатки достоинства.",
  jail: "Так, это уже статья? Я тут чисто пиксели… Всё, испаряюсь.",
  flame: "Аргумент повышенной температуры. Экран, к сожалению, нарисованный.",
  rage: "Да заебал! Даже звёздочки закончились — остались эти: ***",
  format:
    "Ещё слово — снесу тебе винду! Понарошку, блин. У меня даже отвёртки нет.",
  bsod: "Упс, твоя винда… А, нет. Это я синий прямоугольник нарисовал.",
  update:
    "Начинаю удалять Windows… Шутка. Максимум могу удалить твоё терпение.",
};
// This is a comic rule, NOT a determination that any statement is illegal.
export function chooseCinematic(
  options: {
    text: string;
    reply: string;
    previousReply: string;
    intensity: Intensity;
    allowRude: boolean;
    irritation: number;
    quiet: boolean;
    canRandom: boolean;
  },
  random = Math.random,
): { kind: CinematicKind; text: string } | null {
  if (options.intensity === "soft" || !options.allowRude || options.quiet)
    return null;
  const { text, previousReply, reply } = options;
  const pick = (kind: CinematicKind) => ({ kind, text: lines[kind] });
  if (
    /незакон|противозакон|полици|наруш(ил|аешь).*закон|уголов|тебя посадят/i.test(
      text,
    ) &&
    /нахуй|заеб|мудил|сука|долбо|снесу.*винд|удал[юя].*windows/i.test(
      previousReply,
    )
  )
    return random() < 0.9 ? pick("jail") : null;
  if (
    /закопай|закапывай|закопаться/i.test(text) ||
    /аргумент.*(кончил|законч|нет)|нечего.*(ответить|сказать)/i.test(reply) ||
    options.irritation >= 85
  )
    return pick("burrow");
  if (/бит[аоуы]|разбей.*экран/i.test(text)) return pick("bat");
  if (/огнем[её]т/i.test(text)) return pick("flame");
  if (/попрыгай|прыгай|зв[её]здочк/i.test(text)) return pick("rage");
  if (/снеси.*винд|удали.*windows|форматир/i.test(text)) return pick("format");
  if (/синий экран|bsod/i.test(text)) return pick("bsod");
  if (/обнови.*винд|обновление windows/i.test(text)) return pick("update");
  if (!options.canRandom || random() >= 0.18) return null;
  const spontaneous: CinematicKind[] = [
    "bat",
    "flame",
    "rage",
    "format",
    "bsod",
    "update",
  ];
  return pick(spontaneous[Math.min(5, Math.floor(random() * 6))]);
}
