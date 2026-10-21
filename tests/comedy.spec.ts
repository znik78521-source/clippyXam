import { test, expect, type Page } from "@playwright/test";
async function ready(page: Page) {
  await page.setViewportSize({ width: 480, height: 560 });
  await page.route("https://openrouter.ai/api/v1/models", (r) => r.abort());
  await page.goto("/");
  await page.getByLabel("API-ключ OpenRouter").fill("test");
  await page.getByRole("button", { name: "Подключить", exact: true }).click();
  await expect(page.locator('[data-artwork="authored"]')).toHaveAttribute(
    "data-ready",
    "true",
  );
}
async function send(page: Page, text: string) {
  const input = page.getByRole("textbox", { name: "Сообщение маскоту" });
  await input.fill(text);
  await input.press("Enter");
}
test("explicit Windows gag needs no model, changes new pose pixels, then stops; bat is a different scene", async ({
  page,
}) => {
  let requests = 0;
  await page.route("https://openrouter.ai/api/v1/chat/completions", (r) => {
    requests++;
    return r.abort();
  });
  await ready(page);
  await page.clock.install({ time: new Date("2026-10-15T12:00:00Z") });
  await page.clock.pauseAt(new Date("2026-10-15T12:00:01Z"));
  await send(page, "пошути про снос винды");
  await page.clock.runFor(100);
  const canvas = page.locator('[data-artwork="authored"]');
  await expect(page.locator(".nt-balloon")).toContainText("снесу тебе винду");
  await expect(canvas).toHaveAttribute("data-authored-action", "WindowsPrank");
  await expect(canvas).toHaveAttribute("data-scene-phase", "anticipation");
  const first = await canvas.evaluate((c: HTMLCanvasElement) => c.toDataURL());
  await page.clock.runFor(2000);
  await expect(canvas).toHaveAttribute("data-scene-phase", "punchline");
  expect(
    await canvas.evaluate((c: HTMLCanvasElement) => c.toDataURL()),
  ).not.toBe(first);
  await page.clock.runFor(4000);
  await expect(canvas).not.toHaveAttribute(
    "data-authored-action",
    "WindowsPrank",
  );
  await send(page, "пошути про снос винды");
  await expect(page.locator(".nt-balloon")).toContainText("Всё, сношу Windows");
  await send(page, "покажи сценку с битой");
  await page.clock.runFor(100);
  await expect(canvas).toHaveAttribute("data-authored-action", "BatBonk");
  const bat = await canvas.evaluate((c: HTMLCanvasElement) => c.toDataURL());
  await page.clock.runFor(1000);
  expect(
    await canvas.evaluate((c: HTMLCanvasElement) => c.toDataURL()),
  ).not.toBe(bat);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.clock.runFor(50);
  await expect(canvas).toHaveAttribute("data-scene-phase", "");
  expect(requests).toBe(0);
});
test("third successful reply gets a Windows joke without losing answer, failures do not count; soft request cancels it", async ({
  page,
}) => {
  let replies = 0,
    fail = false;
  await page.route("https://openrouter.ai/api/v1/chat/completions", (r) =>
    fail
      ? r.fulfill({
          status: 403,
          contentType: "application/json",
          body: JSON.stringify({ error: { message: "test forbidden" } }),
        })
      : r.fulfill({
          contentType: "application/json",
          body: JSON.stringify({
            choices: [
              {
                message: {
                  content: `Полезный ответ ${++replies}. Конец ответа сохранён.`,
                },
              },
            ],
          }),
        }),
  );
  await ready(page);
  for (let i = 1; i <= 2; i++) {
    await send(page, "Расскажи что-нибудь");
    await expect(page.locator(".nt-balloon")).toContainText(
      `Полезный ответ ${i}`,
    );
    await expect(page.locator(".nt-balloon")).not.toContainText("винду");
  }
  fail = true;
  await send(page, "Тест отказа");
  await expect(
    page.getByRole("textbox", { name: "Сообщение маскоту" }),
  ).toHaveValue("Тест отказа");
  await expect(
    page.getByRole("button", { name: "Отменить ответ" }),
  ).toHaveCount(0);
  await expect(page.locator(".nt-balloon")).not.toContainText("винду");
  fail = false;
  await send(page, "Следующий вопрос");
  await expect(page.locator(".nt-balloon")).toContainText("снесу тебе винду");
  await expect(page.locator(".nt-balloon")).toContainText(
    "Полезный ответ 3. Конец ответа сохранён.",
  );
  await expect(page.locator('[data-artwork="authored"]')).toHaveAttribute(
    "data-authored-action",
    "WindowsPrank",
  );
  await send(page, "не шути про снос винды");
  await expect(page.locator(".nt-balloon")).toContainText("мягкий режим");
  await expect(page.locator('[data-artwork="authored"]')).not.toHaveAttribute(
    "data-authored-action",
    "WindowsPrank",
  );
  await send(page, "пошути про снос винды");
  await expect(page.locator(".nt-balloon")).toContainText("выключены");
  expect(replies).toBe(3);
});
test("scene preview is discoverable in settings and speaks a matching joke", async ({
  page,
}) => {
  await ready(page);
  await page.getByRole("button", { name: "Настройки", exact: true }).click();
  await page.getByRole("tab", { name: "Поведение", exact: true }).click();
  await page
    .getByLabel("Новая анимация", { exact: true })
    .selectOption("WindowsPrank");
  await page
    .getByRole("button", { name: "Показать анимацию", exact: true })
    .click();
  await expect(page.locator(".nt-balloon")).toContainText(
    "Бутафорской кнопкой",
  );
  await expect(page.locator('[data-artwork="authored"]')).toHaveAttribute(
    "data-authored-action",
    "WindowsPrank",
  );
});
test("widget does not replay expired scenes, renders fresh scene and uses conservative hit map", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 460 });
  await page.addInitScript(() => {
    const maps: any[] = [];
    const snapshot: any = {
      character: "clippy",
      authoredClippy: true,
      clickThrough: true,
      autonomous: false,
      phase: "idle",
      animationMood: "idle",
      bubble: "Сценка",
      error: "",
      notice: "",
      pending: false,
      sound: false,
      speechBusy: false,
      speaking: false,
      quiet: false,
      away: false,
      seconds: 0,
      animation: {
        name: "WindowsPrank",
        serial: 1,
        startedAt: Date.now() - 10000,
      },
    };
    Object.assign(window, { __maps: maps });
    window.clippyCompanion = {
      ready: async () => true,
      getSnapshot: async () => snapshot,
      onSnapshot: (fn) => {
        Object.assign(window, {
          __scene: (name: string) =>
            fn({
              ...snapshot,
              animation: { name, serial: 2, startedAt: Date.now() },
            }),
        });
        return () => {};
      },
      action: async () => true,
      getPointerState: async () => ({
        available: true,
        enabled: true,
        error: "",
      }),
      onPointerState: () => () => {},
      publishHitMap: (m) => {
        maps.push(m);
        if (maps.length > 20) maps.shift();
      },
      setPointerPassthrough: async (enabled) => ({
        available: true,
        enabled,
        error: "",
      }),
      startDictation: async () => "",
      stopDictation: async () => {},
    };
  });
  await page.goto("/");
  const canvas = page.locator('[data-artwork="authored"]');
  await expect(canvas).toHaveAttribute("data-ready", "true");
  await expect(canvas).not.toHaveAttribute(
    "data-authored-action",
    "WindowsPrank",
  );
  await page.evaluate(() => (window as any).__scene("BatBonk"));
  await expect(canvas).toHaveAttribute("data-authored-action", "BatBonk");
  await expect
    .poll(() =>
      page.evaluate(() => (window as any).__maps.at(-1)?.masks.length),
    )
    .toBe(0);
  await expect(canvas).not.toHaveAttribute("data-authored-action", "BatBonk", {
    timeout: 7000,
  });
  await expect
    .poll(() =>
      page.evaluate(() => (window as any).__maps.at(-1)?.masks.length),
    )
    .toBeGreaterThan(0);
});

test("persisted soft mode blocks a comic request immediately after native startup", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const state = {
      mini: false,
      maximized: false,
      minimized: false,
      alwaysOnTop: false,
      focused: true,
    };
    const update = async () => state;
    window.clippyDesktop = {
      platform: "win32",
      getState: update,
      onState: () => () => {},
      setCompanion: update,
      publishCompanion: () => {},
      onCompanionAction: () => () => {},
      minimize: update,
      toggleMaximize: update,
      close: async () => {},
      hideToTray: update,
      setMini: update,
      setAlwaysOnTop: update,
      loadSavedKey: async () => ({ key: "test", warning: "" }),
      saveKey: async () => {},
      loadSettings: async () => ({
        settings: { intensity: "soft", sound: false },
        warning: "",
      }),
      saveSettings: async () => {},
      openRouterRequest: async () => ({ status: 200, data: { data: [] } }),
      openRouterCancel: async () => {},
    };
  });
  await page.goto("/");
  const canvas = page.locator('[data-artwork="authored"]');
  await expect(canvas).toHaveAttribute("data-ready", "true");
  await send(page, "пошути про снос винды");
  await expect(page.locator(".nt-balloon")).toContainText(
    "выключены в мягком режиме",
  );
  await expect(canvas).not.toHaveAttribute(
    "data-authored-action",
    "WindowsPrank",
  );
});
