import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
async function open(page: Page) {
  await page.goto("/");
  await expect(page.locator(".mascot-position .mascot-sprite")).toBeVisible();
}
async function connect(page: Page) {
  await page.getByRole("button", { name: "Настройки", exact: true }).click();
  await page.getByRole("radio", { name: "OpenRouter" }).check();
  await page.getByLabel("API-ключ OpenRouter").fill("test-only-no-real-secret");
  await page.getByRole("button", { name: "Применить" }).click();
}

test("original sprites, working demo chat and character selection", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await open(page);
  await expect(
    page.getByRole("heading", { name: "Знакомься. Это Clippy." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Привет, скрепка!" }).click();
  await expect(page.locator(".message-assistant").last()).toContainText(
    "разговариваешь со скрепкой",
  );
  await page.locator(".character-card").filter({ hasText: "Rover" }).click();
  await expect(
    page.getByRole("heading", { name: "Знакомься. Это Rover." }),
  ).toBeVisible();
  await expect(page.locator(".messages")).toContainText("Гав!");
  await expect(page.locator(".message-user")).toHaveCount(0);
  await page.locator(".character-card").filter({ hasText: "Merlin" }).click();
  await expect(
    page.locator('.mascot-position [aria-label="merlin"]'),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test("departure, peeking at new messages, forgiveness and soft mode", async ({
  page,
}) => {
  await open(page);
  await page.getByRole("button", { name: "Пусть остынет" }).click();
  await expect(page.locator(".stage")).toHaveClass(/phase-away/, {
    timeout: 4000,
  });
  await page
    .getByRole("textbox", { name: "Сообщение маскоту" })
    .fill("Ты где?");
  await page.getByRole("button", { name: "Отправить сообщение" }).click();
  await expect(page.locator(".stage")).toHaveClass(/phase-peeking/);
  await expect(page.locator(".message-assistant")).toHaveCount(2);
  await page
    .getByRole("textbox", { name: "Сообщение маскоту" })
    .fill("Извини, вернись");
  await page.getByRole("button", { name: "Отправить сообщение" }).click();
  await expect(page.locator(".message-assistant").last()).toContainText(
    "Ладно, проехали",
  );
  await expect(
    page.getByRole("button", { name: "Пусть остынет" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Показать фак" }).click();
  await expect(page.locator(".mascot-position .rude-hand")).toBeVisible();
  await page.getByRole("button", { name: "Мягко", exact: true }).click();
  await expect(page.locator(".mascot-position .rude-hand")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Показать фак" }),
  ).toBeDisabled();
});

test("automatically comes back after the cooldown", async ({ page }) => {
  await page.clock.install();
  await open(page);
  await page.getByRole("button", { name: "Пусть остынет" }).click();
  await page.clock.fastForward(2000);
  await expect(page.locator(".stage")).toHaveClass(/phase-away/);
  await page.clock.fastForward(16000);
  await expect(page.locator(".stage")).toHaveClass(/phase-idle/);
  await expect(page.locator(".speech-bubble")).toContainText("я вернулся");
});

test("OpenRouter success and error handling; no persistent secrets", async ({
  page,
}) => {
  await open(page);
  await connect(page);
  let requests = 0;
  await page.route(
    "https://openrouter.ai/api/v1/chat/completions",
    async (route) => {
      requests++;
      expect(route.request().headers().authorization).toBe(
        "Bearer test-only-no-real-secret",
      );
      const body = route.request().postDataJSON();
      expect(body.messages.at(-1).content).toBe("Тест");
      if (requests === 1)
        await route.fulfill({
          json: {
            choices: [
              {
                message: {
                  content:
                    '{"text":"Модель на связи","mood":"speaking","leaveSeconds":0}',
                },
              },
            ],
          },
        });
      else
        await route.fulfill({
          status: 401,
          json: { error: { message: "Unauthorized" } },
        });
    },
  );
  await page.getByRole("textbox", { name: "Сообщение маскоту" }).fill("Тест");
  await page.getByRole("button", { name: "Отправить сообщение" }).click();
  await expect(page.locator(".messages")).toContainText("Модель на связи");
  await page.getByRole("textbox", { name: "Сообщение маскоту" }).fill("Тест");
  await page.getByRole("button", { name: "Отправить сообщение" }).click();
  await expect(page.getByRole("alert")).toContainText("Ключ не принят");
  const storage = await page.evaluate(() => ({
    local: { ...localStorage },
    session: { ...sessionStorage },
  }));
  expect(JSON.stringify(storage)).not.toContain("test-only-no-real-secret");
  await page.reload();
  await expect(page.locator(".connection-status")).toContainText("Демо-режим");
  await page.getByRole("button", { name: "Настройки", exact: true }).click();
  await expect(page.getByLabel("API-ключ OpenRouter")).toHaveValue("");
});

test("character switch cancels stale in-flight replies", async ({ page }) => {
  await open(page);
  await connect(page);
  let release: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(
    "https://openrouter.ai/api/v1/chat/completions",
    async (route) => {
      await gate;
      await route
        .fulfill({
          json: {
            choices: [
              {
                message: {
                  content:
                    '{"text":"СТАРЫЙ ОТВЕТ","mood":"speaking","leaveSeconds":0}',
                },
              },
            ],
          },
        })
        .catch(() => {});
    },
  );
  await page
    .getByRole("textbox", { name: "Сообщение маскоту" })
    .fill("Подожди");
  const outgoing = page.waitForRequest(
    "https://openrouter.ai/api/v1/chat/completions",
  );
  await page.getByRole("button", { name: "Отправить сообщение" }).click();
  await outgoing;
  await page.locator(".character-card").filter({ hasText: "Rover" }).click();
  release!();
  await expect(page.locator(".messages")).toContainText("Гав!");
  await expect(page.locator(".messages")).not.toContainText("СТАРЫЙ ОТВЕТ");
  await expect(page.locator(".typing")).toHaveCount(0);
});

test("window controls, mini-mode and new chat confirmation", async ({
  page,
}) => {
  await open(page);
  await page.getByRole("button", { name: "Свернуть", exact: true }).click();
  await expect(page.locator(".main-window")).toHaveCount(0);
  await page.locator(".taskbar-app").click();
  await expect(page.locator(".main-window")).toBeVisible();
  await page.getByRole("button", { name: "Вид", exact: true }).click();
  await page.getByRole("button", { name: "Мини-режим", exact: true }).click();
  await expect(page.locator(".main-window")).toHaveClass(/mini-window/);
  await page.getByRole("button", { name: "Полное окно", exact: true }).click();
  await page.getByRole("button", { name: "Начать новый диалог" }).click();
  await expect(
    page.getByRole("dialog", { name: "Новый диалог" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Отмена", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "Развернуть", exact: true }).click();
  await expect(page.locator(".main-window")).toHaveClass(/maximized/);
});

test("mobile layout and keyboard dialog dismissal", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    390,
  );
  await page.getByRole("button", { name: "Диалог", exact: true }).click();
  await expect(
    page.getByRole("textbox", { name: "Сообщение маскоту" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Настройки", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "Вид", exact: true }).click();
  await page.getByRole("button", { name: "Мини-режим", exact: true }).click();
  await expect(page.locator(".stage")).toBeVisible();
});
