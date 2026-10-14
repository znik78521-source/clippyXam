import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
async function settings(page: Page, tab: "Голос" | "Поведение") {
  await page.getByRole("button", { name: "Настройки", exact: true }).click();
  await page.getByRole("tab", { name: tab, exact: true }).click();
}
async function send(page: Page, text: string) {
  const count = await page.locator(".message-assistant").count();
  await page.getByRole("textbox", { name: "Сообщение маскоту" }).fill(text);
  await page.getByRole("button", { name: "Отправить сообщение" }).click();
  await expect(page.locator(".message-assistant")).toHaveCount(count + 1);
}
test("session memory is opt-in, restores distinct threads and can be erased", async ({
  page,
}) => {
  await page.goto("/");
  await settings(page, "Поведение");
  await page
    .getByRole("checkbox", {
      name: "Помнить отдельный диалог каждого маскота в этой сессии",
    })
    .check();
  await page.getByRole("button", { name: "Применить" }).click();
  await send(page, "Привет");
  await page.locator(".character-card").filter({ hasText: "Rover" }).click();
  await send(page, "Привет");
  await page.locator(".character-card").filter({ hasText: "Clippy" }).click();
  await expect(page.locator(".messages")).toContainText(
    "разговариваешь со скрепкой",
  );
  await settings(page, "Поведение");
  await page
    .getByRole("checkbox", {
      name: "Помнить отдельный диалог каждого маскота в этой сессии",
    })
    .uncheck();
  await page.getByRole("button", { name: "Применить" }).click();
  await page.locator(".character-card").filter({ hasText: "Rover" }).click();
  await expect(page.locator(".message-user")).toHaveCount(0);
  await page.reload();
  await expect(page.locator(".message-user")).toHaveCount(0);
});
test("local boundary, accumulated irritation and gesture controls are enforceable", async ({
  page,
}) => {
  await page.goto("/");
  await send(page, "Срочно ответь");
  await expect(page.getByRole("meter")).toHaveAttribute("aria-valuenow", "86");
  await send(page, "Срочно ответь");
  await expect(page.getByRole("meter")).toHaveAttribute("aria-valuenow", "72");
  await send(page, "Без подколов");
  await expect(
    page.getByRole("button", { name: "Мягко", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.getByRole("button", { name: "Показать фак" }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Без тормозов", exact: true }).click();
  await settings(page, "Поведение");
  await page
    .getByRole("checkbox", {
      name: "Разрешить грубый жест (кроме мягкого режима)",
    })
    .uncheck();
  await page.getByRole("button", { name: "Применить" }).click();
  await expect(
    page.getByRole("button", { name: "Показать фак" }),
  ).toBeDisabled();
  await send(page, "Покажи фак");
  await expect(page.locator(".mascot-position .rude-hand")).toHaveCount(0);
});
test("quiet hours suppress autonomous peeks while preserving text replies", async ({
  page,
}) => {
  await page.clock.install({ time: new Date("2026-10-14T23:30:00") });
  await page.goto("/");
  await settings(page, "Поведение");
  await page
    .getByRole("checkbox", { name: "Тихие часы: без голоса и фоновых реплик" })
    .check();
  await page.getByRole("button", { name: "Применить" }).click();
  await expect(page.locator(".speech-status")).toContainText("Тихие часы");
  await page.getByRole("button", { name: "Пусть остынет" }).click();
  await page.clock.fastForward(2000);
  await expect(page.locator(".stage")).toHaveClass(/phase-away/);
  await page.clock.fastForward(8000);
  await expect(page.locator(".stage")).toHaveClass(/phase-away/);
  await send(page, "Ты где?");
  await expect(page.locator(".stage")).toHaveClass(/phase-peeking/);
});
test("cloud voice needs its own key, remains opt-in, errors safely and never persists it", async ({
  page,
}) => {
  let requests = 0;
  await page.route("https://api.openai.com/v1/audio/speech", async (route) => {
    requests++;
    expect(route.request().headers().authorization).toBe("Bearer fake-tts-key");
    expect(route.request().postDataJSON().voice).toBe("alloy");
    await route.fulfill({ status: 401, json: { error: "invalid key" } });
  });
  await page.goto("/");
  await settings(page, "Голос");
  await page.getByLabel("Провайдер голоса").selectOption("openai");
  await page.getByRole("button", { name: "Применить" }).click();
  await expect(page.getByRole("alert")).toContainText("отдельный API-ключ");
  await page.getByLabel("Отдельный ключ OpenAI TTS").fill("fake-tts-key");
  await page.getByRole("button", { name: "Применить" }).click();
  await send(page, "Привет");
  expect(requests).toBe(0);
  await page
    .locator(".room-heading")
    .getByRole("button", { name: "Включить озвучку" })
    .click();
  await send(page, "Как дела?");
  await expect(page.locator(".toast")).toContainText("ключ не принят");
  expect(requests).toBe(1);
  expect(
    await page.evaluate(() =>
      JSON.stringify({ ...localStorage, ...sessionStorage }),
    ),
  ).not.toContain("fake-tts-key");
  await page.reload();
  await settings(page, "Голос");
  await expect(page.getByLabel("Провайдер голоса")).toHaveValue("system");
  await page.getByLabel("Провайдер голоса").selectOption("openai");
  await expect(page.getByLabel("Отдельный ключ OpenAI TTS")).toHaveValue("");
});
test("voice cancellation prevents delayed cloud data from playing for the next mascot", async ({
  page,
}) => {
  let release: () => void = () => {};
  const gate = new Promise<void>((r) => {
    release = r;
  });
  await page.addInitScript(() => {
    Object.assign(window, { __audioStarts: 0 });
    const Original = window.Audio;
    window.Audio = class extends Original {
      play() {
        (window as unknown as { __audioStarts: number }).__audioStarts++;
        return Promise.resolve();
      }
    };
  });
  await page.route("https://api.openai.com/v1/audio/speech", async (route) => {
    await gate;
    await route
      .fulfill({ contentType: "audio/mpeg", body: "mock-audio" })
      .catch(() => {});
  });
  await page.goto("/");
  await settings(page, "Голос");
  await page.getByLabel("Провайдер голоса").selectOption("openai");
  await page.getByLabel("Отдельный ключ OpenAI TTS").fill("fake-tts-key");
  await page.getByRole("button", { name: "Применить" }).click();
  await page
    .locator(".room-heading")
    .getByRole("button", { name: "Включить озвучку" })
    .click();
  const outgoing = page.waitForRequest(
    "https://api.openai.com/v1/audio/speech",
  );
  await send(page, "Привет");
  await outgoing;
  await expect(
    page.getByRole("button", { name: "Остановить озвучку" }),
  ).toBeVisible();
  await page.locator(".character-card").filter({ hasText: "Rover" }).click();
  release();
  await expect(page.locator(".speech-status")).toHaveCount(0);
  expect(
    await page.evaluate(
      () => (window as unknown as { __audioStarts: number }).__audioStarts,
    ),
  ).toBe(0);
});
