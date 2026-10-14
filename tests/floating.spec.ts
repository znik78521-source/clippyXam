import { expect, test } from "@playwright/test";
import type { CompanionSnapshot, CompanionAction } from "../src/lib/companion";

test("browser surface keeps the conversation, submits one message, and restores by Escape", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Вид", exact: true }).click();
  await page
    .getByRole("button", { name: "Маскот на рабочем столе", exact: true })
    .click();
  await expect(page.locator(".main-window")).toHaveCount(0);
  await expect(
    page.getByRole("region", { name: "Маскот на рабочем столе" }),
  ).toBeVisible();
  await expect(page.locator(".companion-actor .mascot-sprite")).toBeVisible();
  await page
    .getByRole("textbox", { name: "Сообщение маскоту на рабочем столе" })
    .fill("Привет");
  await page
    .getByRole("button", { name: "Отправить маскоту на рабочем столе" })
    .click();
  await expect(page.locator(".companion-balloon")).toContainText(
    "разговариваешь со скрепкой",
  );
  await page.keyboard.press("Escape");
  await expect(page.locator(".main-window")).toBeVisible();
  await expect(page.locator(".message-user")).toHaveCount(1);
  await expect(page.locator(".messages")).toContainText(
    "разговариваешь со скрепкой",
  );
});
test("mobile surface fits and the taskbar is a recovery path", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto("/");
  await page.getByRole("button", { name: "Вид", exact: true }).click();
  await page
    .getByRole("button", { name: "Маскот на рабочем столе", exact: true })
    .click();
  const box = await page.locator(".floating-companion").boundingBox();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(320);
  await page.locator(".taskbar-app").click();
  await expect(page.locator(".main-window")).toBeVisible();
});
test("passive native surface only relays actions and never calls model or speech providers", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 460 });
  let requests = 0;
  await page.route(/https:\/\/(openrouter\.ai|api\.openai\.com)\//, (route) => {
    requests++;
    return route.abort();
  });
  await page.addInitScript(() => {
    const snapshot: CompanionSnapshot = {
      character: "merlin",
      phase: "speaking",
      animationMood: "speaking",
      bubble: "Привет, смертный.",
      error: "",
      notice: "",
      pending: false,
      sound: false,
      speechBusy: false,
      speaking: false,
      quiet: false,
      away: false,
      seconds: 0,
      highlight: { start: 0, end: 6 },
    };
    const actions: CompanionAction[] = [];
    Object.assign(window, { __surfaceActions: actions });
    window.clippyCompanion = {
      getPointerState: async () => ({
        available: false,
        enabled: false,
        error: "",
      }),
      setPointerPassthrough: async () => ({
        available: false,
        enabled: false,
        error: "",
      }),
      publishHitMap: () => {},
      onPointerState: () => () => {},
      ready: async () => true,
      getSnapshot: async () => snapshot,
      onSnapshot: () => () => {},
      action: async (action) => {
        actions.push(action);
        return true;
      },
    };
  });
  await page.goto("/?view=companion");
  await expect(page.locator(".companion-scene")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Пропуск кликов через пустые области" }),
  ).toBeDisabled();
  await expect(page.locator(".main-window")).toHaveCount(0);
  expect(
    await page
      .locator("html")
      .evaluate((el) => getComputedStyle(el).backgroundColor),
  ).toBe("rgba(0, 0, 0, 0)");
  await expect(page.locator(".spoken-word")).toHaveText("Привет");
  await page
    .getByRole("textbox", { name: "Сообщение маскоту на рабочем столе" })
    .fill("Тест");
  await page
    .getByRole("button", { name: "Отправить маскоту на рабочем столе" })
    .click();
  await page.getByRole("button", { name: "Вернуть XP-окно" }).click();
  expect(
    await page.evaluate(
      () =>
        (window as unknown as { __surfaceActions: CompanionAction[] })
          .__surfaceActions,
    ),
  ).toEqual([{ type: "send", text: "Тест" }, { type: "restore" }]);
  expect(requests).toBe(0);
});
test("system speech highlights real word events and clears stale events on cancellation", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const utterances: SpeechSynthesisUtterance[] = [];
    Object.assign(window, { __testUtterances: utterances });
    Object.defineProperty(window, "SpeechSynthesisUtterance", {
      value: class {
        text: string;
        constructor(text: string) {
          this.text = text;
        }
      },
      configurable: true,
    });
    Object.defineProperty(window, "speechSynthesis", {
      value: {
        getVoices: () => [
          { voiceURI: "ru-test", lang: "ru-RU", name: "Test Russian" },
        ],
        addEventListener() {},
        removeEventListener() {},
        cancel() {},
        speak: (utterance: SpeechSynthesisUtterance) => {
          utterances.push(utterance);
          queueMicrotask(() => utterance.onstart?.({} as SpeechSynthesisEvent));
        },
      },
      configurable: true,
    });
  });
  await page.goto("/");
  await page
    .locator(".room-heading")
    .getByRole("button", { name: "Включить озвучку", exact: true })
    .click();
  await page.getByRole("button", { name: "Привет, скрепка!" }).click();
  await expect(page.locator(".speech-status")).toContainText("Говорит");
  const word = await page.evaluate(() => {
    const root = window as unknown as {
      __testUtterances: SpeechSynthesisUtterance[];
      __oldBoundary: ((e: SpeechSynthesisEvent) => void) | null;
    };
    const u = root.__testUtterances.at(-1)!;
    root.__oldBoundary = u.onboundary;
    const length = u.text.indexOf(" ");
    u.onboundary?.({
      name: "word",
      charIndex: 0,
      charLength: length,
    } as SpeechSynthesisEvent);
    return u.text.slice(0, length);
  });
  await expect(page.locator(".speech-bubble .spoken-word")).toHaveText(word);
  await page.getByRole("button", { name: "Остановить озвучку" }).click();
  await expect(page.locator(".spoken-word")).toHaveCount(0);
  await page.evaluate(() => {
    (
      window as unknown as { __oldBoundary: (e: SpeechSynthesisEvent) => void }
    ).__oldBoundary({
      name: "word",
      charIndex: 0,
      charLength: 3,
    } as SpeechSynthesisEvent);
  });
  await expect(page.locator(".spoken-word")).toHaveCount(0);
});
