import { test, expect } from "@playwright/test";
test("keyless native owner restores onboarding, caption/widget commands and dictation use bridge", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 460 });
  await page.addInitScript(() => {
    const calls: string[] = [];
    Object.assign(window, { __nativeCalls: calls });
    let state = {
      mini: true,
      companion: true,
      alwaysOnTop: true,
      maximized: false,
      minimized: false,
      focused: true,
    };
    const listeners = new Set<any>();
    const update = (name: string, patch = {}) => {
      calls.push(name);
      state = { ...state, ...patch };
      listeners.forEach((fn) => fn(state));
      return Promise.resolve(state);
    };
    window.clippyDesktop = {
      platform: "win32",
      getState: async () => state,
      onState: (fn) => {
        listeners.add(fn);
        return () => {
          listeners.delete(fn);
        };
      },
      setCompanion: (value) => update("widget:" + value, { companion: value }),
      publishCompanion: () => {},
      onCompanionAction: () => () => {},
      setMini: (mini) => update("mini", { mini }),
      setAlwaysOnTop: (value) => update("pin", { alwaysOnTop: value }),
      minimize: () => update("minimize"),
      toggleMaximize: () => update("maximize"),
      hideToTray: () => update("tray"),
      close: async () => {
        calls.push("close");
      },
      startDictation: async () => {
        calls.push("mic");
        return "Системный ввод";
      },
      stopDictation: async () => {},
    };
  });
  await page.goto("/");
  await page.getByLabel("API-ключ OpenRouter").fill("test");
  await page.getByRole("button", { name: "Подключить", exact: true }).click();
  await page
    .getByRole("button", { name: "Голосовой ввод", exact: true })
    .click();
  await expect(
    page.getByRole("textbox", { name: "Сообщение маскоту" }),
  ).toHaveValue("Системный ввод");
  await page.getByRole("button", { name: "Свернуть", exact: true }).click();
  await page.getByRole("button", { name: "Настройки", exact: true }).click();
  await page
    .getByRole("checkbox", { name: "Виджет на рабочем столе", exact: true })
    .check();
  await page.getByRole("button", { name: "Применить", exact: true }).click();
  expect(await page.evaluate(() => (window as any).__nativeCalls)).toEqual([
    "widget:false",
    "mic",
    "minimize",
    "widget:true",
  ]);
});
test("passive widget keeps grey caption controls and relays settings without a second engine", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const actions: unknown[] = [];
    Object.assign(window, { __actions: actions });
    window.clippyCompanion = {
      ready: async () => true,
      getSnapshot: async () => ({
        character: "merlin",
        phase: "idle",
        animationMood: "idle",
        bubble: "Готов.",
        error: "",
        notice: "",
        pending: false,
        sound: false,
        speechBusy: false,
        speaking: false,
        quiet: false,
        away: false,
        seconds: 0,
      }),
      onSnapshot: () => () => {},
      action: async (action) => {
        actions.push(action);
        return true;
      },
      getPointerState: async () => ({
        available: false,
        enabled: false,
        error: "",
      }),
      onPointerState: () => () => {},
      publishHitMap: () => {},
      setPointerPassthrough: async () => ({
        available: false,
        enabled: false,
        error: "",
      }),
      startDictation: async () => "",
      stopDictation: async () => {},
    };
  });
  await page.goto("/");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(
    await page
      .locator("html")
      .evaluate((el) => getComputedStyle(el).backgroundColor),
  ).toBe("rgba(0, 0, 0, 0)");
  await page.getByRole("button", { name: "Настройки", exact: true }).click();
  await page.getByRole("button", { name: "Свернуть", exact: true }).click();
  await page
    .getByRole("button", { name: "Вернуть обычное окно", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Закрыть приложение", exact: true })
    .click();
  expect(await page.evaluate(() => (window as any).__actions)).toEqual([
    { type: "settings-widget" },
    { type: "minimize" },
    { type: "restore" },
    { type: "close" },
  ]);
});
