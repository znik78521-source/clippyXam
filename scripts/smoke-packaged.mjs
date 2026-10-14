// Runs the real packaged Windows app (not a Vite/browser substitute), with fake APIs.
import { _electron as electron, expect } from "@playwright/test";
import path from "node:path";
import fs from "node:fs/promises";
const executablePath = path.resolve(
  process.env.SMOKE_EXE || "release/win-unpacked/clippyXam.exe",
);
const profile = path.resolve("release/smoke-profile");
await fs.mkdir(profile, { recursive: true });
const app = await electron.launch({
  executablePath,
  env: {
    ...process.env,
    PORTABLE_EXECUTABLE_DIR: profile,
    CLIPPYXAM_DEV_URL: "https://invalid.example/",
  },
  timeout: 60000,
});
try {
  const page = await app.firstWindow();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await expect(
    page.getByRole("dialog", { name: "Подключение к OpenRouter" }),
  ).toBeVisible({ timeout: 30000 });
  expect(await app.evaluate(({ app }) => app.isPackaged)).toBe(true);
  expect(page.url()).toBe("clippyxam://bundle/");
  expect(await app.evaluate(({ app }) => app.getPath("userData"))).toBe(
    path.join(profile, "clippyXam-data"),
  );
  await page
    .getByLabel("API-ключ OpenRouter")
    .fill("smoke-test-not-a-real-key");
  await page.getByRole("button", { name: "Подключить", exact: true }).click();
  await expect(
    page.getByRole("img", { name: "clippy", exact: true }),
  ).toBeVisible();
  const assets = await page.evaluate(async () => {
    const r = await fetch("/agents/clippy/agent.json");
    const img = new Image();
    img.src = "/agents/clippy/map.png";
    await img.decode();
    return { ok: r.ok, width: img.naturalWidth, json: typeof (await r.json()) };
  });
  expect(assets.ok).toBe(true);
  expect(assets.width).toBeGreaterThan(0);
  expect(assets.json).toBe("object");
  await page.route(
    "https://openrouter.ai/api/v1/chat/completions",
    async (route) => {
      expect(route.request().postDataJSON().model).toBe("openrouter/free");
      await route.fulfill({
        json: {
          choices: [
            {
              message: {
                content:
                  '{"text":"Проверка portable","mood":"speaking","leaveSeconds":0}',
              },
            },
          ],
        },
      });
    },
  );
  await page.getByRole("textbox", { name: "Сообщение маскоту" }).fill("Smoke");
  await page.getByRole("textbox", { name: "Сообщение маскоту" }).press("Enter");
  await expect(page.locator(".nt-balloon")).toContainText("Проверка portable");
  await page.screenshot({ path: "release/packaged-owner.png" });
  await page.getByRole("button", { name: "Настройки", exact: true }).click();
  await page
    .getByRole("checkbox", { name: "Виджет на рабочем столе", exact: true })
    .check();
  const windowPromise = app.waitForEvent("window");
  await page.getByRole("button", { name: "Применить", exact: true }).click();
  const widget = await windowPromise;
  await expect(
    widget.getByRole("textbox", { name: "Сообщение маскоту" }),
  ).toBeVisible();
  await expect(widget.locator(".nt-balloon")).toContainText(
    "Проверка portable",
  );
  await expect
    .poll(() =>
      app.evaluate(
        ({ BrowserWindow }) =>
          BrowserWindow.getAllWindows().filter((w) => w.isVisible()).length,
      ),
    )
    .toBe(1);
  await widget.screenshot({ path: "release/packaged-widget.png" });
  await widget.getByRole("button", { name: "Настройки", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "Свойства: clippyXam" }),
  ).toBeVisible();
  const nextWindow = app.waitForEvent("window");
  await page.getByRole("button", { name: "Отмена", exact: true }).click();
  const restoredWidget = await nextWindow;
  await expect(
    restoredWidget.getByRole("textbox", { name: "Сообщение маскоту" }),
  ).toBeVisible();
  await restoredWidget
    .getByRole("button", { name: "Вернуть обычное окно", exact: true })
    .click();
  await expect
    .poll(() =>
      app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length),
    )
    .toBe(1);
  expect(errors).toEqual([]);
  console.log(
    "Packaged Windows smoke passed: production scheme/assets, onboarding, mocked chat, widget/settings/restore, portable profile.",
  );
} finally {
  await app.close();
}
