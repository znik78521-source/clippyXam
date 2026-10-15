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
  await page.getByRole("button", { name: "Готово", exact: true }).click();
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
test("local Russian voice is selected and enabled without Windows speech voices", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const state = {
      mini: true,
      companion: false,
      alwaysOnTop: true,
      maximized: false,
      minimized: false,
      focused: true,
    };
    const spoken: string[] = [];
    Object.assign(window, { __localSpoken: spoken });
    window.clippyDesktop = {
      platform: "win32",
      getState: async () => state,
      onState: () => () => {},
      setCompanion: async () => state,
      publishCompanion: () => {},
      onCompanionAction: () => () => {},
      setMini: async () => state,
      setAlwaysOnTop: async () => state,
      minimize: async () => state,
      toggleMaximize: async () => state,
      hideToTray: async () => state,
      close: async () => {},
      startDictation: async () => "",
      stopDictation: async () => {},
      localVoiceState: async () => ({
        phase: "ready",
        progress: 100,
        error: "",
      }),
      onLocalVoiceState: () => () => {},
      synthesizeLocalVoice: async (text) => {
        spoken.push(text);
        return new Uint8Array([1, 2, 3]);
      },
      stopLocalVoice: async () => {},
    };
    Object.defineProperty(window, "Audio", {
      value: class {
        onplaying: any;
        onended: any;
        onerror: any;
        play() {
          this.onplaying?.();
          queueMicrotask(() => this.onended?.());
          return Promise.resolve();
        }
        pause() {}
        removeAttribute() {}
        load() {}
      },
      configurable: true,
    });
  });
  await page.route("https://openrouter.ai/api/v1/chat/completions", (route) =>
    route.fulfill({
      json: {
        choices: [{ message: { content: "Русская озвучка работает." } }],
      },
    }),
  );
  await page.goto("/");
  await page.getByLabel("API-ключ OpenRouter").fill("fake");
  await page.getByRole("button", { name: "Подключить", exact: true }).click();
  await page.getByRole("textbox", { name: "Сообщение маскоту" }).fill("Привет");
  await page.getByRole("textbox", { name: "Сообщение маскоту" }).press("Enter");
  await expect
    .poll(() => page.evaluate(() => (window as any).__localSpoken))
    .toEqual(["Русская озвучка работает."]);
  await page.getByRole("button", { name: "Настройки", exact: true }).click();
  await page.getByRole("tab", { name: "Голос", exact: true }).click();
  await expect(page.getByLabel("Провайдер голоса")).toHaveValue("local");
  await expect(
    page.getByRole("checkbox", { name: "Озвучивать ответы", exact: true }),
  ).toBeChecked();
});
test("native saved key loads before onboarding, without storing it in browser storage", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const state = {
      mini: true,
      companion: false,
      alwaysOnTop: true,
      maximized: false,
      minimized: false,
      focused: true,
    };
    window.clippyDesktop = {
      platform: "win32",
      getState: async () => state,
      onState: () => () => {},
      setCompanion: async () => state,
      publishCompanion: () => {},
      onCompanionAction: () => () => {},
      setMini: async () => state,
      setAlwaysOnTop: async () => state,
      minimize: async () => state,
      toggleMaximize: async () => state,
      hideToTray: async () => state,
      close: async () => {},
      startDictation: async () => "",
      stopDictation: async () => {},
      loadSavedKey: async () => ({
        key: "encrypted-native-test-key",
        warning: "",
      }),
      saveKey: async () => {},
    };
  });
  let header = "";
  await page.route("https://openrouter.ai/api/v1/chat/completions", (route) => {
    header = route.request().headers().authorization;
    return route.fulfill({
      json: { choices: [{ message: { content: "Ключ загружен." } }] },
    });
  });
  await page.goto("/");
  await expect(
    page.getByRole("img", { name: "clippy", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("textbox", { name: "Сообщение маскоту" }).fill("Привет");
  await page.getByRole("textbox", { name: "Сообщение маскоту" }).press("Enter");
  await expect(page.locator(".nt-balloon")).toContainText("Ключ загружен");
  expect(header).toBe("Bearer encrypted-native-test-key");
  expect(await page.evaluate(() => localStorage.length)).toBe(0);
});
test("desktop chat and catalogue use native bridge; DNS failure is explicit and not retried across models", async ({
  page,
}) => {
  await page.addInitScript(() => {
    let chatCalls = 0;
    const state = {
      mini: false,
      maximized: false,
      minimized: false,
      alwaysOnTop: false,
      focused: true,
    };
    const update = async () => state;
    Object.assign(window, { __chatCalls: () => chatCalls });
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
      openRouterRequest: async (input) =>
        input.kind === "models"
          ? { status: 200, data: { data: [] } }
          : (chatCalls++, { error: "DNS" }),
      openRouterCancel: async () => {},
    };
  });
  let direct = 0;
  await page.route("https://openrouter.ai/**", (route) => {
    direct++;
    return route.abort();
  });
  await page.goto("/");
  await page.getByLabel("API-ключ OpenRouter").fill("test");
  await page.getByRole("button", { name: "Подключить", exact: true }).click();
  const composer = page.getByRole("textbox", { name: "Сообщение маскоту" });
  await composer.fill("Ну привет");
  await composer.press("Enter");
  await expect(
    page.getByRole("button", { name: "Настройки", exact: true }),
  ).toHaveAttribute("data-diagnostic", "true");
  await expect(page.locator(".nt-balloon")).not.toContainText("[DNS]");
  await expect(composer).toHaveValue("Ну привет");
  expect(await page.evaluate(() => (window as any).__chatCalls())).toBe(1);
  expect(direct).toBe(0);
  await page.getByRole("button", { name: "Настройки", exact: true }).click();
  await page
    .getByText("Диагностика подключения и голоса", { exact: true })
    .click();
  await expect(page.locator(".connection-diagnostic pre")).toContainText(
    "[DNS]",
  );
});
