import { test, expect } from "@playwright/test";
test("saved preferences restore without chat/key leakage; startup changes only on Apply", async ({
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
  await page.getByRole("button", { name: "Отмена", exact: true }).click();
  expect(await page.evaluate(() => (window as any).__startup)).toEqual([]);
  await page.getByRole("button", { name: "Настройки", exact: true }).click();
  await startup.check();
  await page.getByRole("button", { name: "Применить", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(await page.evaluate(() => (window as any).__startup)).toEqual([true]);
  const saved = await page.evaluate(() => (window as any).__saved);
  expect(saved.length).toBeGreaterThan(0);
  expect(JSON.stringify(saved)).not.toContain("secret-test-key");
  expect(saved.at(-1).character).toBe("merlin");
  expect(saved.at(-1)).not.toHaveProperty("ttsKey");
  expect(saved.at(-1)).not.toHaveProperty("messages");
  await page.getByRole("button", { name: "Настройки", exact: true }).click();
  await expect(startup).toBeChecked();
  await startup.uncheck();
  await page.getByRole("button", { name: "Применить", exact: true }).click();
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
test("speech envelope moves original sprite only during playback and respects reduced motion", async ({
  page,
}) => {
  await page.addInitScript(() => {
    let update: (value: any) => void = () => {};
    const snapshot: any = {
      character: "clippy",
      phase: "speaking",
      animationMood: "speaking",
      bubble: "Говорю",
      error: "",
      notice: "",
      pending: false,
      sound: true,
      speechBusy: true,
      speaking: true,
      quiet: false,
      away: false,
      seconds: 0,
      speechLevel: 0,
    };
    Object.assign(window, {
      __level: (level: number) => update({ ...snapshot, speechLevel: level }),
    });
    window.clippyCompanion = {
      ready: async () => true,
      getSnapshot: async () => snapshot,
      onSnapshot: (fn) => {
        update = fn;
        return () => {};
      },
      action: async () => true,
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
  const canvas = page.locator(".mascot-canvas");
  await expect(canvas).toBeVisible();
  await page.evaluate(() => (window as any).__level(1));
  await expect(canvas).toHaveAttribute("data-speech-level", "1");
  await expect
    .poll(() => canvas.evaluate((c) => getComputedStyle(c).transform))
    .not.toBe("none");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect
    .poll(() => canvas.evaluate((c) => getComputedStyle(c).transform))
    .toBe("none");
  await page.evaluate(() => (window as any).__level(0));
  await expect(canvas).toHaveAttribute("data-speech-level", "0");
});
