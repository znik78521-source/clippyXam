import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";
async function float(page: Page) {
  await page.getByRole("button", { name: "Вид", exact: true }).click();
  await page
    .getByRole("button", { name: "Маскот на рабочем столе", exact: true })
    .click();
}
async function say(page: Page, text: string) {
  await page
    .getByRole("textbox", { name: "Сообщение маскоту на рабочем столе" })
    .fill(text);
  await page
    .getByRole("button", { name: "Отправить маскоту на рабочем столе" })
    .click();
}
test("floating selector preserves opt-in threads and keeps unavailable characters disabled", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Настройки", exact: true }).click();
  await page.getByRole("tab", { name: "Поведение", exact: true }).click();
  await page
    .getByRole("checkbox", {
      name: "Помнить отдельный диалог каждого маскота в этой сессии",
    })
    .check();
  await page.getByRole("button", { name: "Применить", exact: true }).click();
  await float(page);
  await say(page, "Привет");
  await expect(page.locator(".companion-balloon")).toContainText(
    "разговариваешь со скрепкой",
  );
  const selector = page.getByRole("combobox", {
    name: "Персонаж на рабочем столе",
  });
  await expect(selector.locator("option[value=courtney]")).toHaveJSProperty(
    "disabled",
    true,
  );
  await expect(selector.locator("option[value=earl]")).toHaveJSProperty(
    "disabled",
    true,
  );
  await selector.selectOption("rover");
  await expect(page.locator(".companion-controls")).toContainText("Rover");
  await expect(selector).toBeEnabled();
  await selector.selectOption("merlin");
  await expect(page.locator(".companion-balloon")).toContainText(
    "Я вижу твоё будущее",
  );
  await expect(selector).toBeEnabled();
  await selector.selectOption("clippy");
  await expect(selector).toBeEnabled();
  await page.getByRole("button", { name: "Вернуть XP-окно" }).click();
  await expect(page.locator(".message-user")).toHaveCount(1);
  await expect(page.locator(".messages")).toContainText(
    "разговариваешь со скрепкой",
  );
});
for (const surface of [false, true])
  test(`cancel pending API response, then send again without a stale reply (${surface ? "floating" : "XP"})`, async ({
    page,
  }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Настройки", exact: true }).click();
    await page.getByRole("radio", { name: "OpenRouter" }).check();
    await page
      .getByLabel("API-ключ OpenRouter")
      .fill("test-only-no-real-secret");
    await page.getByRole("button", { name: "Применить", exact: true }).click();
    if (surface) await float(page);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let calls = 0;
    await page.route(
      "https://openrouter.ai/api/v1/chat/completions",
      async (route) => {
        const first = ++calls === 1;
        if (first) await gate;
        await route
          .fulfill({
            json: {
              choices: [
                {
                  message: {
                    content: JSON.stringify({
                      text: first ? "СТАРЫЙ ОТВЕТ" : "Свежий ответ",
                      mood: "speaking",
                      leaveSeconds: 0,
                    }),
                  },
                },
              ],
            },
          })
          .catch(() => {});
      },
    );
    const send = async (text: string) => {
      await page
        .getByRole("textbox", {
          name: surface
            ? "Сообщение маскоту на рабочем столе"
            : "Сообщение маскоту",
          exact: true,
        })
        .fill(text);
      await page
        .getByRole("button", {
          name: surface
            ? "Отправить маскоту на рабочем столе"
            : "Отправить сообщение",
          exact: true,
        })
        .click();
    };
    try {
      await send("Первый");
      await expect.poll(() => calls).toBe(1);
      await page
        .getByRole("button", {
          name: surface ? "Отменить ответ маскота" : "Отменить ответ",
          exact: true,
        })
        .click();
      await expect(
        page.locator(surface ? ".companion-balloon" : ".speech-bubble"),
      ).toContainText("Ответ остановлен");
      await send("Второй");
      await expect(
        page.locator(surface ? ".companion-balloon" : ".messages"),
      ).toContainText("Свежий ответ");
      release();
      if (surface)
        await page.getByRole("button", { name: "Вернуть XP-окно" }).click();
      await expect(page.locator(".message-user")).toHaveCount(2);
      await expect(page.locator(".messages")).not.toContainText("СТАРЫЙ ОТВЕТ");
      expect(calls).toBe(2);
    } finally {
      release();
    }
  });
test("stopping floating speech clears playback without muting future replies", async ({
  page,
}) => {
  await page.addInitScript(() => {
    let utterances = 0;
    Object.assign(window, { __speechCount: () => utterances });
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
        speak: (u: SpeechSynthesisUtterance) => {
          utterances++;
          queueMicrotask(() => u.onstart?.({} as SpeechSynthesisEvent));
        },
      },
      configurable: true,
    });
  });
  await page.goto("/");
  await float(page);
  const stop = page.getByRole("button", { name: "Остановить озвучку маскота" });
  await expect(stop).toBeDisabled();
  await page
    .getByRole("button", { name: "Включить озвучку маскота", exact: true })
    .click();
  await say(page, "Привет");
  await expect(stop).toBeEnabled();
  await stop.click();
  await expect(stop).toBeDisabled();
  await expect(
    page.getByRole("button", {
      name: "Выключить озвучку маскота",
      exact: true,
    }),
  ).toBeVisible();
  await say(page, "Как дела?");
  await expect(stop).toBeEnabled();
  expect(
    await page.evaluate(() =>
      (window as unknown as { __speechCount: () => number }).__speechCount(),
    ),
  ).toBe(2);
  await stop.click();
});
