import type { CharacterId, Intensity } from "./characters";

export type ComicScene = "WindowsPrank" | "BatBonk";
export interface ComicBeat {
  scene: ComicScene;
  text: string;
}
export interface ComedyContext {
  character: CharacterId;
  intensity: Intensity;
  allowRude: boolean;
  backgroundQuips: boolean;
  away: boolean;
}
const lines: Record<ComicScene, string[]> = {
  WindowsPrank: [
    "Щас снесу тебе винду!.. Бутафорской кнопкой. Она даже не подключена. Ладно, живи.",
    "Всё, сношу Windows! В театре одного канцелярского изделия. Из реквизита — кнопка и мои понты.",
    "Ещё чуть-чуть — и винде конец! Шучу. У меня лапки из проволоки и кнопка из картона.",
    "Объявляю снос винды! Воображаемый. Настоящую ещё поддерживать придётся, а я не нанимался.",
  ],
  BatBonk: [
    "Сейчас исправлю баг битой. Тук! Это сценка, окно целое. Баг, зараза, тоже.",
    "Провёл ударное тестирование. Бита игрушечная, раздражение настоящее.",
    "Вот мой отдел техподдержки: я и бутафорская бита. Оба без гарантии.",
  ],
};
/** Explicit comic requests only: ordinary Windows troubleshooting is never hijacked. */
export function requestedComicScene(text: string): ComicScene | null {
  if (
    !/(?:^|\s)(?:пошути|пригрози)(?:\s|[.!?,]|$)|шутк[ауи]|прикол|сценк[ауи]|понарошку|^покажи\s+(?:снос винды|биту)/i.test(
      text,
    )
  )
    return null;
  if (
    /винд|windows/i.test(text) &&
    /снос|снес|снести|удал|угро|пригрози/i.test(text)
  )
    return "WindowsPrank";
  if (/бит[аоуы]|ударное тестирование/i.test(text)) return "BatBonk";
  return null;
}
export function comicAllowed(c: ComedyContext) {
  return c.intensity !== "soft" && c.allowRude && !c.away;
}
/** Owner-only, session-only sequencing. No timers, IO, shell or native commands. */
export class ComedyDirector {
  private replies = 0;
  private lastAt = -Infinity;
  private lastReply = -Infinity;
  private automaticIndex = 0;
  private indices: Record<ComicScene, number> = { WindowsPrank: 0, BatBonk: 0 };
  explicit(
    scene: ComicScene,
    context: ComedyContext,
    now: number,
  ): ComicBeat | null {
    if (!comicAllowed(context)) return null;
    this.lastAt = now;
    this.lastReply = this.replies;
    const pool = lines[scene];
    let text = pool[this.indices[scene]++ % pool.length];
    if (context.intensity === "wild")
      text = text.replace("Она даже", "Блядь, она даже");
    return { scene, text };
  }
  /** Called only AFTER successful API replies, never on a failure or idle timer. */
  afterReply(
    context: ComedyContext,
    now: number,
    replyLength: number,
  ): ComicBeat | null {
    this.replies++;
    if (
      !comicAllowed(context) ||
      !context.backgroundQuips ||
      this.replies < 3 ||
      this.replies - this.lastReply < 5 ||
      now - this.lastAt < 180000 ||
      replyLength > 900
    )
      return null;
    const scene = this.automaticIndex++ % 2 === 0 ? "WindowsPrank" : "BatBonk";
    return this.explicit(scene, context, now);
  }
}
export const comedyPrompt =
  "Иногда уместна явно шуточная угроза «снесу винду», сразу с комической развязкой: кнопка картонная, ничего не подключено. Это сценка, а не действие: не заявляй о реальном удалении файлов, не выдавай команды удаления и не изображай системный процесс. Не повторяй такой прикол в каждом ответе.";
