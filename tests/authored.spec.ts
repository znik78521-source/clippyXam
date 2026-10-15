import { test, expect } from "@playwright/test";
test("new Clippy uses own artwork, medium native velocity bends without crashing, hard acceleration hits wall", async ({
  page,
}) => {
  await page.setViewportSize({ width: 480, height: 560 });
  await page.addInitScript(() => {
    let motion = (v: any) => {};
    let serial = 0;
    Object.assign(window, {
      __move: (vx: number, vy = 0, reset = false) =>
        motion({
          direction:
            vx < 0
              ? "left"
              : vx > 0
                ? "right"
                : vy < 0
                  ? "up"
                  : vy > 0
                    ? "down"
                    : "still",
          serial: ++serial,
          velocityX: vx,
          velocityY: vy,
          reset,
        }),
    });
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
      onWindowMotion: (fn) => {
        motion = fn;
        return () => {};
      },
      loadSavedKey: async () => ({ key: "test", warning: "" }),
      saveKey: async () => {},
      openRouterRequest: async () => ({ status: 200, data: { data: [] } }),
      openRouterCancel: async () => {},
    };
  });
  await page.goto("/");
  const canvas = page.locator('canvas[data-artwork="authored"]');
  await expect(canvas).toHaveAttribute("data-ready", "true");
  await page.clock.install();
  const rest = await canvas.evaluate((c: HTMLCanvasElement) => c.toDataURL());
  await page.evaluate(() => (window as any).__move(450));
  await page.clock.runFor(110);
  expect(Number(await canvas.getAttribute("data-bend"))).toBeLessThan(-8);
  await expect(canvas).toHaveAttribute("data-motion-state", "lean");
  await expect(canvas).toHaveAttribute("data-impact", "");
  expect(
    await canvas.evaluate((c: HTMLCanvasElement) => c.toDataURL()),
  ).not.toBe(rest);
  expect(await canvas.evaluate((c) => getComputedStyle(c).transform)).toBe(
    "none",
  );
  await page.evaluate(() => (window as any).__move(0, 0, true));
  await page.clock.runFor(20);
  await page.evaluate(() => (window as any).__move(3600));
  await page.clock.runFor(120);
  await expect(canvas).toHaveAttribute("data-impact", "left");
  await page.clock.runFor(4500);
  expect(
    Math.abs(Number(await canvas.getAttribute("data-offset"))),
  ).toBeLessThan(0.1);
  const input = page.getByRole("textbox", { name: "Сообщение маскоту" });
  await input.pressSequentially("я");
  await page.clock.runFor(40);
  expect(
    Math.abs(Number(await canvas.getAttribute("data-typing-shake"))),
  ).toBeGreaterThan(0);
  await page.clock.runFor(240);
  await expect(canvas).toHaveAttribute("data-typing-shake", "0.00");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.evaluate(() => (window as any).__move(3600));
  await page.clock.runFor(100);
  await expect(canvas).toHaveAttribute("data-bend", "0.00");
  await expect(canvas).toHaveAttribute("data-impact", "");
});
test("passive widget renders authored mode and preserves alpha mask after settling", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 460 });
  await page.addInitScript(() => {
    const maps: any[] = [];
    Object.assign(window, { __maps: maps });
    window.clippyCompanion = {
      ready: async () => true,
      getSnapshot: async () => ({
        character: "clippy",
        authoredClippy: true,
        clickThrough: true,
        autonomous: false,
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
      getPointerState: async () => ({
        available: true,
        enabled: true,
        error: "",
      }),
      onPointerState: () => () => {},
      publishHitMap: (m) => {
        maps.push(m);
        if (maps.length > 10) maps.shift();
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
  await expect(page.locator('[data-artwork="authored"]')).toHaveAttribute(
    "data-ready",
    "true",
  );
  await expect
    .poll(() =>
      page.evaluate(() =>
        (window as any).__maps.some(
          (m: any) =>
            m.masks.length && m.masks[0].bits.some((b: number) => b > 0),
        ),
      ),
    )
    .toBe(true);
  await expect(
    page.getByRole("textbox", { name: "Сообщение маскоту" }),
  ).toBeVisible();
});
test("settings preview uses new actions by default and can explicitly restore legacy mode", async ({
  page,
}) => {
  await page.route("https://openrouter.ai/api/v1/models", (r) => r.abort());
  await page.goto("/");
  await page.getByLabel("API-ключ OpenRouter").fill("test");
  await page.getByRole("button", { name: "Подключить", exact: true }).click();
  await page.getByRole("button", { name: "Настройки", exact: true }).click();
  await page.getByRole("tab", { name: "Поведение", exact: true }).click();
  await expect(page.getByLabel("Новая Скрепка: инерция и удары")).toBeChecked();
  await page
    .getByLabel("Новая анимация", { exact: true })
    .selectOption("InertiaLean");
  await page
    .getByRole("button", { name: "Показать анимацию", exact: true })
    .click();
  await expect(page.locator('[data-artwork="authored"]')).toHaveAttribute(
    "data-motion-state",
    "lean",
  );
  await page.getByRole("button", { name: "Настройки", exact: true }).click();
  await page.getByRole("tab", { name: "Поведение", exact: true }).click();
  await page.getByLabel("Новая Скрепка: инерция и удары").uncheck();
  await page.keyboard.press("Escape");
  await expect(page.locator('[data-artwork="authored"]')).toHaveCount(0);
  await expect(page.locator(".mascot-sprite")).toBeVisible();
});
test("new idle actions actually change pixels without fetching original Clippy frames", async ({
  page,
}) => {
  let legacy = 0;
  page.on("request", (r) => {
    if (r.url().includes("/agents/clippy/")) legacy++;
  });
  await page.route("https://openrouter.ai/api/v1/models", (r) => r.abort());
  await page.goto("/");
  await page.getByLabel("API-ключ OpenRouter").fill("test");
  await page.getByRole("button", { name: "Подключить", exact: true }).click();
  const canvas = page.locator('[data-artwork="authored"]');
  await expect(canvas).toHaveAttribute("data-ready", "true");
  await page.clock.install();
  const images = new Set<string>(),
    actions = new Set<string>();
  for (let i = 0; i < 40; i++) {
    await page.clock.runFor(400);
    images.add(await canvas.evaluate((c: HTMLCanvasElement) => c.toDataURL()));
    actions.add((await canvas.getAttribute("data-authored-action"))!);
  }
  expect(images.size).toBeGreaterThan(3);
  expect(actions.has("Curious")).toBe(true);
  expect(actions.has("Stretch")).toBe(true);
  expect(legacy).toBe(0);
});
