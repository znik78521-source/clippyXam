import { test, expect } from "@playwright/test";
test("saved preferences restore without chat/key leakage; startup changes only on explicit consent; preferences autosave", async ({
  page,
}) => {
  await page.addInitScript(() => {
    let enabled = false;
    const startup: boolean[] = [],
      saved: any[] = [];
    Object.assign(window, { __startup: startup, __saved: saved });
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
      loadSavedKey: async () => ({ key: "secret-test-key", warning: "" }),
      saveKey: async () => {},
      loadSettings: async () => ({
        settings: {
          character: "merlin",
          intensity: "soft",
          rate: 1.2,
          sound: false,
          model: "qwen/qwen3-4b:free",
          clickThrough: true,
          speechMotion: false,
        },
        warning: "",
      }),
      saveSettings: async (value) => {
        saved.push(value);
      },
      getStartup: async () => ({ available: true, enabled }),
      setStartup: async (value) => {
        startup.push(value);
        enabled = value;
        return { available: true, enabled };
      },
      openRouterRequest: async () => ({ status: 200, data: { data: [] } }),
      openRouterCancel: async () => {},
    };
  });
  await page.goto("/");
  await expect(
    page.getByRole("img", { name: "merlin", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "Настройки", exact: true }).click();
  await expect(page.getByLabel("Бесплатная модель")).toHaveValue(
    "qwen/qwen3-4b:free",
  );
  await expect(
    page.getByLabel("Пропускать клики через прозрачные участки виджета"),
  ).toBeChecked();
  const startup = page.getByLabel("Запускать при входе в Windows");
  await expect(startup).toBeEnabled();
  await expect(startup).not.toBeChecked();
  await startup.check();
  await expect
    .poll(() => page.evaluate(() => (window as any).__startup))
    .toEqual([true]);
  await page.getByLabel("Персонаж", { exact: true }).selectOption("rover");
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => (window as any).__saved.at(-1)?.character))
    .toBe("rover");
  await page.getByLabel("Персонаж", { exact: true }).selectOption("merlin");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const saved = await page.evaluate(() => (window as any).__saved);
  expect(saved.length).toBeGreaterThan(0);
  expect(JSON.stringify(saved)).not.toContain("secret-test-key");
  expect(saved.at(-1).character).toBe("merlin");
  expect(saved.at(-1)).not.toHaveProperty("ttsKey");
  expect(saved.at(-1)).not.toHaveProperty("messages");
  await page.getByRole("button", { name: "Настройки", exact: true }).click();
  await expect(startup).toBeChecked();
  await startup.uncheck();
  await page.getByRole("button", { name: "Готово", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(await page.evaluate(() => (window as any).__startup)).toEqual([
    true,
    false,
  ]);
});
test("widget publishes actual sprite alpha and retains controls; safety errors are visible", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 460 });
  await page.addInitScript(() => {
    let update: (value: any) => void = () => {};
    const enabled: boolean[] = [],
      maps: any[] = [];
    Object.assign(window, {
      __enabled: enabled,
      __maps: maps,
      __pointerError: () =>
        update({
          available: true,
          enabled: false,
          error: "Пропуск отключён: интерфейс не отвечает.",
        }),
    });
    window.clippyCompanion = {
      ready: async () => true,
      getSnapshot: async () => ({
        character: "clippy",
        phase: "idle",
        animationMood: "idle",
        bubble: "Привет",
        error: "",
        notice: "",
        pending: false,
        sound: false,
        speechBusy: false,
        speaking: false,
        quiet: false,
        away: false,
        seconds: 0,
        clickThrough: true,
      }),
      onSnapshot: () => () => {},
      action: async () => true,
      getPointerState: async () => ({
        available: true,
        enabled: false,
        error: "",
      }),
      onPointerState: (fn) => {
        update = fn;
        return () => {};
      },
      publishHitMap: (map) => {
        maps.push(map);
        if (maps.length > 10) maps.shift();
      },
      setPointerPassthrough: async (value) => {
        enabled.push(value);
        return { available: true, enabled: value, error: "" };
      },
      startDictation: async () => "",
      stopDictation: async () => {},
    };
  });
  await page.goto("/");
  await expect(
    page.getByRole("img", { name: "clippy", exact: true }),
  ).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() =>
        (window as any).__maps.some(
          (m: any) =>
            m.masks?.length > 0 && m.masks[0].bits.some((b: number) => b > 0),
        ),
      ),
    )
    .toBe(true);
  const map = await page.evaluate(() =>
    (window as any).__maps.filter((m: any) => m.masks.length > 0).at(-1),
  );
  expect(map.rects.length).toBeGreaterThanOrEqual(3);
  expect(map.masks[0].bits.some((b: number) => b === 0)).toBe(true);
  expect(
    await page.evaluate(() => (window as any).__enabled.includes(true)),
  ).toBe(true);
  await page.evaluate(() => (window as any).__pointerError());
  await expect(
    page.getByRole("status").filter({ hasText: "Пропуск отключён" }),
  ).toBeVisible();
  await expect(
    page.getByRole("textbox", { name: "Сообщение маскоту" }),
  ).toBeVisible();
});
test("window direction and each typed letter change original frames; reduced motion disables reactions", async ({
  page,
}) => {
  await page.addInitScript(() => {
    let move = (v: any) => {};
    Object.assign(window, {
      __move: (direction: string) => move({ direction, serial: Date.now() }),
    });
    window.clippyCompanion = {
      ready: async () => true,
      getSnapshot: async () => ({
        character: "clippy",
        phase: "idle",
        animationMood: "idle",
        bubble: "Тест",
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
      action: async () => true,
      onWindowMotion: (fn) => {
        move = fn;
        return () => {};
      },
      startDictation: async () => "",
      stopDictation: async () => {},
    };
  });
  await page.goto("/");
  const canvas = page.locator(".mascot-canvas");
  await expect(canvas).toBeVisible();
  await page.clock.install();
  const rest = await canvas.evaluate((c: HTMLCanvasElement) => c.toDataURL());
  const images = new Set<string>();
  for (const direction of ["left", "right", "up", "down"]) {
    await page.evaluate((d) => (window as any).__move(d), direction);
    await page.clock.runFor(850);
    images.add(await canvas.evaluate((c: HTMLCanvasElement) => c.toDataURL()));
    expect(await canvas.evaluate((c) => getComputedStyle(c).transform)).toBe(
      "none",
    );
  }
  expect(images.size).toBe(4);
  expect(images.has(rest)).toBe(false);
  await page.evaluate(() => (window as any).__move("still"));
  await page.clock.runFor(1000);
  const input = page.getByRole("textbox", { name: "Сообщение маскоту" });
  for (const letter of ["п", "р", "и"]) {
    await input.pressSequentially(letter);
    await page.clock.runFor(40);
    expect(
      await canvas.evaluate((c) => getComputedStyle(c).transform),
    ).not.toBe("none");
    await page.clock.runFor(250);
    expect(await canvas.evaluate((c) => getComputedStyle(c).transform)).toBe(
      "none",
    );
  }
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.evaluate(() => (window as any).__move("left"));
  await input.pressSequentially("в");
  await page.clock.runFor(100);
  await expect(page.locator(".mascot-sprite")).toHaveAttribute(
    "data-original-animation",
    "RestPose",
  );
  expect(await canvas.evaluate((c) => getComputedStyle(c).transform)).toBe(
    "none",
  );
});
test("autosave serializes edits; failure stays visible and close flush retries latest draft", async ({
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
    Object.assign(window, {
      __saved: [],
      __saving: 0,
      __hold: true,
      __overlap: false,
      __fail: false,
    });
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
      loadSavedKey: async () => ({ key: "test-key", warning: "" }),
      saveKey: async () => {},
      loadSettings: async () => ({ settings: {}, warning: "" }),
      saveSettings: async (value) => {
        const w = window as any;
        if (w.__saving++) w.__overlap = true;
        if (w.__hold) {
          w.__hold = false;
          await new Promise((resolve) => {
            w.__release = resolve;
          });
        }
        await new Promise((r) => setTimeout(r, 450));
        w.__saving--;
        if (w.__fail) throw Error("disk");
        w.__saved.push(value);
      },
      openRouterRequest: async () => ({ status: 200, data: { data: [] } }),
      openRouterCancel: async () => {},
    };
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Настройки", exact: true }).click();
  await page.getByLabel("Персонаж", { exact: true }).selectOption("merlin");
  await expect
    .poll(() => page.evaluate(() => (window as any).__saving))
    .toBe(1);
  await page.getByLabel("Персонаж", { exact: true }).selectOption("rover");
  await page.keyboard.press("Escape");
  await page.evaluate(() => (window as any).__release());
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(
    await page.evaluate(() => (window as any).__saved.at(-1).character),
  ).toBe("rover");
  expect(await page.evaluate(() => (window as any).__overlap)).toBe(false);
  await page.getByRole("button", { name: "Настройки", exact: true }).click();
  await page.evaluate(() => {
    (window as any).__fail = true;
  });
  await page.getByLabel("Персонаж", { exact: true }).selectOption("clippy");
  await expect(page.getByRole("alert")).toContainText("Не удалось сохранить");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.evaluate(() => {
    (window as any).__fail = false;
  });
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(
    await page.evaluate(() => (window as any).__saved.at(-1).character),
  ).toBe("clippy");
});
