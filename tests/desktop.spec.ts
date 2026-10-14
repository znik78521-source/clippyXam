import { expect, test } from "@playwright/test";
import type { CompanionAction, CompanionSnapshot } from "../src/lib/companion";
import type { DesktopState } from "../src/lib/desktop";

// Renderer integration with a mocked bridge, NOT a test of an actual OS window.
test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 420, height: 650 });
  await page.addInitScript(() => {
    const calls: string[] = [];
    const snapshots: CompanionSnapshot[] = [];
    const actionListeners = new Set<(action: CompanionAction) => void>();
    const listeners = new Set<(state: DesktopState) => void>();
    let state: DesktopState = {
      mini: true,
      maximized: false,
      minimized: false,
      focused: true,
      alwaysOnTop: true,
      trayAvailable: true,
    };
    const update = async (name: string, patch: Partial<DesktopState> = {}) => {
      calls.push(name);
      state = { ...state, ...patch };
      listeners.forEach((fn) => fn(state));
      return state;
    };
    Object.assign(window, {
      __nativeCalls: calls,
      __snapshots: snapshots,
      __sendSurfaceAction: (action: CompanionAction) =>
        actionListeners.forEach((fn) => fn(action)),
    });
    window.clippyDesktop = {
      platform: "win32",
      getState: async () => state,
      setCompanion: (companion) =>
        update(`companion:${companion}`, { companion }),
      publishCompanion: (snapshot) => {
        snapshots.push(snapshot);
      },
      onCompanionAction: (fn) => {
        actionListeners.add(fn);
        return () => {
          actionListeners.delete(fn);
        };
      },
      minimize: () => update("minimize", { minimized: true }),
      toggleMaximize: () =>
        update("maximize", { maximized: !state.maximized, mini: false }),
      close: async () => {
        calls.push("close");
      },
      hideToTray: () => update("tray"),
      setMini: (mini) => update(`mini:${mini}`, { mini }),
      setAlwaysOnTop: (alwaysOnTop) =>
        update(`pin:${alwaysOnTop}`, { alwaysOnTop }),
      onState: (fn) => {
        listeners.add(fn);
        return () => {
          listeners.delete(fn);
        };
      },
    };
  });
  await page.goto("/");
  await expect(
    page.locator(".native-shell .mascot-position .mascot-sprite"),
  ).toBeVisible();
});

test("compact desktop has XP chrome, fits its viewport, and hides the simulated desktop", async ({
  page,
}) => {
  await expect(page.locator(".taskbar")).toBeHidden();
  await expect(page.locator(".desktop-icons")).toBeHidden();
  await expect(
    page.getByRole("textbox", { name: "Сообщение маскоту" }),
  ).toBeVisible();
  const frame = await page.locator(".main-window").boundingBox();
  expect(frame?.height).toBe(650);
  expect(frame?.width).toBe(420);
  const form = await page.locator(".compact-form").boundingBox();
  expect(form!.y + form!.height).toBeLessThan(620);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    420,
  );
  await page.getByRole("textbox", { name: "Сообщение маскоту" }).fill("Привет");
  await page.getByRole("button", { name: "Отправить сообщение" }).click();
  await expect(
    page.getByRole("log", { name: "Последний ответ" }),
  ).toContainText("разговариваешь со скрепкой");
  await page.getByLabel("Маскот в мини-режиме").selectOption("rover");
  await expect(page.locator(".compact-reply")).toContainText("Гав!");
});
test("caption controls dispatch native commands, not simulated window actions", async ({
  page,
}) => {
  await page
    .getByRole("button", { name: "Поверх всех окон", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Поверх всех окон", exact: true }),
  ).toHaveAttribute("aria-pressed", "false");
  await page.getByRole("button", { name: "Свернуть", exact: true }).click();
  await expect(page.locator(".main-window")).toBeVisible();
  await page.getByRole("button", { name: "Развернуть", exact: true }).click();
  await expect(page.locator(".main-window")).toHaveClass(/maximized/);
  await page.getByRole("button", { name: "Закрыть приложение" }).click();
  const calls = await page.evaluate(
    () => (window as unknown as { __nativeCalls: string[] }).__nativeCalls,
  );
  expect(calls).toEqual(["pin:false", "minimize", "maximize", "close"]);
});
test("compact/full changes preserve conversation and tray delegates to the bridge", async ({
  page,
}) => {
  await page.getByRole("textbox", { name: "Сообщение маскоту" }).fill("Привет");
  await page.getByRole("button", { name: "Отправить сообщение" }).click();
  await expect(page.locator(".compact-reply")).toContainText(
    "разговариваешь со скрепкой",
  );
  await page.getByRole("button", { name: "Полное окно", exact: true }).click();
  await page.setViewportSize({ width: 1190, height: 740 });
  await expect(page.locator(".messages")).toContainText(
    "разговариваешь со скрепкой",
  );
  await page.getByRole("button", { name: "Вид", exact: true }).click();
  await page.getByRole("button", { name: "Скрыть в системный трей" }).click();
  const calls = await page.evaluate(
    () => (window as unknown as { __nativeCalls: string[] }).__nativeCalls,
  );
  expect(calls).toContain("mini:false");
  expect(calls).toContain("tray");
});

test("native owner handles relayed input exactly once and publishes display-only state", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Вид", exact: true }).click();
  await page
    .getByRole("button", { name: "Маскот на рабочем столе", exact: true })
    .click();
  await page.evaluate(() => {
    const send = (
      window as unknown as {
        __sendSurfaceAction: (action: CompanionAction) => void;
      }
    ).__sendSurfaceAction;
    send({ type: "send", text: "Привет" });
    send({ type: "send", text: "Привет" });
  });
  await expect(page.locator(".compact-reply")).toContainText(
    "разговариваешь со скрепкой",
  );
  const data = await page.evaluate(() => {
    const root = window as unknown as {
      __nativeCalls: string[];
      __snapshots: CompanionSnapshot[];
    };
    return { calls: root.__nativeCalls, snapshot: root.__snapshots.at(-1) };
  });
  expect(data.calls).toContain("companion:true");
  expect(data.snapshot?.bubble).toContain("разговариваешь со скрепкой");
  expect(data.snapshot).not.toHaveProperty("settings");
  expect(data.snapshot).not.toHaveProperty("messages");
  expect(data.snapshot).not.toHaveProperty("key");
  await page.getByRole("button", { name: "Полное окно", exact: true }).click();
  await expect(page.locator(".message-user")).toHaveCount(1);
});

test("owner accepts surface cancel and persona commands; same-persona selection does not reset chat", async ({
  page,
}) => {
  await page.clock.install();
  await page.evaluate(() => {
    (
      window as unknown as {
        __sendSurfaceAction: (action: CompanionAction) => void;
      }
    ).__sendSurfaceAction({ type: "send", text: "Привет" });
  });
  await expect(
    page.getByRole("button", { name: "Отменить ответ", exact: true }),
  ).toBeVisible();
  await page.evaluate(() => {
    (
      window as unknown as {
        __sendSurfaceAction: (action: CompanionAction) => void;
      }
    ).__sendSurfaceAction({ type: "cancel-reply" });
  });
  await page.clock.runFor(1000);
  await expect(
    page.getByRole("button", { name: "Отменить ответ", exact: true }),
  ).toHaveCount(0);
  await expect(page.locator(".compact-reply")).toContainText(
    "Похоже, ты собираешься",
  );
  await page.evaluate(() => {
    (
      window as unknown as {
        __sendSurfaceAction: (action: CompanionAction) => void;
      }
    ).__sendSurfaceAction({ type: "select-character", character: "clippy" });
  });
  await page.getByRole("button", { name: "Полное окно", exact: true }).click();
  await expect(page.locator(".message-user")).toHaveCount(1);
  await page.evaluate(() => {
    (
      window as unknown as {
        __sendSurfaceAction: (action: CompanionAction) => void;
      }
    ).__sendSurfaceAction({ type: "select-character", character: "rover" });
  });
  await expect(page.locator(".messages")).toContainText("Гав!");
  await expect(page.locator(".message-user")).toHaveCount(0);
});
