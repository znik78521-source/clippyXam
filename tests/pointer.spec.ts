import { test, expect } from "@playwright/test";
import type { HitMap, PointerState } from "../src/lib/companion";
const buttonName = "Пропуск кликов через пустые области";
test("browser click-through is opt-in, passes empty gaps, preserves controls and resets on reopen", async ({
  page,
}) => {
  await page.goto("/");
  const open = async () => {
    await page.getByRole("button", { name: "Вид", exact: true }).click();
    await page
      .getByRole("button", { name: "Маскот на рабочем столе", exact: true })
      .click();
  };
  await open();
  const toggle = page.getByRole("button", { name: buttonName });
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  const gap = await page.locator(".companion-art").evaluate((el) => {
    const box = el.getBoundingClientRect();
    return { x: box.x + 5, y: box.y + 150 };
  });
  const hitsScene = () =>
    page.evaluate(
      (p) =>
        Boolean(
          document.elementFromPoint(p.x, p.y)?.closest(".floating-companion"),
        ),
      gap,
    );
  expect(await hitsScene()).toBe(true);
  await toggle.click();
  expect(await hitsScene()).toBe(false);
  const drag = await page.locator(".companion-drag").boundingBox();
  await page.mouse.move(drag!.x + 10, drag!.y + 10);
  await page.mouse.down();
  await page.mouse.move(drag!.x - 90, drag!.y - 90, { steps: 5 });
  await page.mouse.up();
  const moved = await page.locator(".companion-drag").boundingBox();
  expect(moved!.x).toBeLessThan(drag!.x);
  await page
    .getByRole("textbox", { name: "Сообщение маскоту на рабочем столе" })
    .fill("Привет");
  await page
    .getByRole("button", { name: "Отправить маскоту на рабочем столе" })
    .click();
  await expect(page.locator(".companion-balloon")).toContainText(
    "разговариваешь со скрепкой",
  );
  await page.getByRole("button", { name: "Вернуть XP-окно" }).click();
  await open();
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
});
test("native renderer reports geometry only when enabled and stops after fail-safe event", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 460 });
  await page.addInitScript(() => {
    let state: PointerState = { available: true, enabled: false, error: "" };
    const listeners = new Set<(state: PointerState) => void>();
    const maps: HitMap[] = [];
    const emit = (next: PointerState) => {
      state = next;
      listeners.forEach((fn) => fn(state));
    };
    Object.assign(window, { __hitMaps: maps, __pointerEmit: emit });
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
      }),
      onSnapshot: () => () => {},
      action: async () => true,
      getPointerState: async () => state,
      setPointerPassthrough: async (enabled) => {
        emit({ ...state, enabled });
        return state;
      },
      publishHitMap: (map) => maps.push(map),
      onPointerState: (fn) => {
        listeners.add(fn);
        return () => {
          listeners.delete(fn);
        };
      },
    };
  });
  await page.goto("/");
  const toggle = page.getByRole("button", { name: buttonName });
  await expect(toggle).toBeEnabled();
  expect(
    await page.evaluate(
      () => (window as unknown as { __hitMaps: HitMap[] }).__hitMaps.length,
    ),
  ).toBe(0);
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as unknown as { __hitMaps: HitMap[] }).__hitMaps.length,
      ),
    )
    .toBeGreaterThan(0);
  const map = await page.evaluate(
    () => (window as unknown as { __hitMaps: HitMap[] }).__hitMaps.at(-1)!,
  );
  expect(Object.keys(map).sort()).toEqual([
    "height",
    "interacting",
    "rects",
    "width",
  ]);
  expect(map.width).toBe(360);
  expect(map.height).toBe(460);
  expect(map.rects.length).toBeGreaterThanOrEqual(3);
  for (const rect of map.rects) {
    expect(rect.x).toBeGreaterThanOrEqual(0);
    expect(rect.y).toBeGreaterThanOrEqual(0);
    expect(rect.x + rect.width).toBeLessThanOrEqual(360);
    expect(rect.y + rect.height).toBeLessThanOrEqual(460);
  }
  await page
    .getByRole("combobox", { name: "Персонаж на рабочем столе" })
    .focus();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as unknown as { __hitMaps: HitMap[] }).__hitMaps.at(-1)
            ?.interacting,
      ),
    )
    .toBe(true);
  await page
    .getByRole("textbox", { name: "Сообщение маскоту на рабочем столе" })
    .focus();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as unknown as { __hitMaps: HitMap[] }).__hitMaps.at(-1)
            ?.interacting,
      ),
    )
    .toBe(false);
  await page.evaluate(() =>
    (
      window as unknown as { __pointerEmit: (state: PointerState) => void }
    ).__pointerEmit({
      available: true,
      enabled: false,
      error: "Пропуск кликов отключён: интерфейс не отвечает.",
    }),
  );
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByRole("alert")).toContainText("интерфейс не отвечает");
  // Advance beyond several lease intervals; no more geometry after disabling.
  await page.clock.install();
  const before = await page.evaluate(
    () => (window as unknown as { __hitMaps: HitMap[] }).__hitMaps.length,
  );
  await page.clock.runFor(2000);
  expect(
    await page.evaluate(
      () => (window as unknown as { __hitMaps: HitMap[] }).__hitMaps.length,
    ),
  ).toBe(before);
});
