// Runs the real packaged Windows app (not a Vite/browser substitute), with fake APIs.
import { _electron as electron, expect } from "@playwright/test";
import path from "node:path";
import fs from "node:fs/promises";
import { spawnSync } from "node:child_process";
const deadline = setTimeout(() => {
  console.error(
    "Packaged smoke exceeded 180 seconds; terminating test processes.",
  );
  if (process.platform === "win32")
    spawnSync("taskkill", ["/F", "/IM", "clippyXam.exe", "/T"]);
  process.exit(1);
}, 180000);
deadline.unref();
const executablePath = path.resolve(
  process.env.SMOKE_EXE || "release/win-unpacked/clippyXam.exe",
);
const profile = path.resolve("release/smoke-profile");
await fs.mkdir(profile, { recursive: true });
console.log("Launching packaged app:", executablePath);
const app = await electron.launch({
  executablePath,
  env: {
    ...process.env,
    PORTABLE_EXECUTABLE_DIR: profile,
    CLIPPYXAM_DEV_URL: "https://invalid.example/",
  },
  timeout: 60000,
});
app.context().setDefaultTimeout(15000);
app
  .process()
  .stdout?.on("data", (chunk) =>
    console.log("[electron stdout]", String(chunk)),
  );
app
  .process()
  .stderr?.on("data", (chunk) =>
    console.log("[electron stderr]", String(chunk)),
  );
try {
  const page = await app.firstWindow({ timeout: 30000 });
  console.log("Owner window created:", page.url());
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
  expect(
    await page.evaluate(
      async () => (await window.clippyDesktop.loadSavedKey()).key,
    ),
  ).toBe("smoke-test-not-a-real-key");
  // Defaults need not create a preference file. An actual UI edit must autosave it.
  await page.getByRole("button", { name: "Настройки", exact: true }).click();
  await page
    .getByLabel("Пропускать клики через прозрачные участки виджета")
    .check();
  await expect
    .poll(() =>
      fs
        .stat(path.join(profile, "clippyXam-data", "preferences.json"))
        .then(() => true)
        .catch(() => false),
    )
    .toBe(true);
  await page.getByRole("button", { name: "Готово", exact: true }).click();
  // Real on-disk preference round trip; keys/chats must never enter this file.
  await page.evaluate(async () => {
    await window.clippyDesktop.saveSettings({
      character: "clippy",
      model: "openrouter/free",
      rate: 1.2,
      speechMotion: true,
      clickThrough: false,
      key: "must-not-persist",
      messages: ["private-test-message"],
    });
  });
  const preferences = JSON.parse(
    await fs.readFile(
      path.join(profile, "clippyXam-data", "preferences.json"),
      "utf8",
    ),
  );
  expect(preferences.rate).toBe(1.2);
  expect(JSON.stringify(preferences)).not.toContain("must-not-persist");
  expect(JSON.stringify(preferences)).not.toContain("private-test-message");
  expect(
    (await page.evaluate(() => window.clippyDesktop.getStartup())).available,
  ).toBe(false); // unpacked smoke is not the stable portable launcher
  const encrypted = await fs.readFile(
    path.join(profile, "clippyXam-data", "openrouter-key.bin"),
  );
  expect(encrypted.includes(Buffer.from("smoke-test-not-a-real-key"))).toBe(
    false,
  );
  await expect(
    page.getByRole("img", { name: "clippy", exact: true }),
  ).toBeVisible();
  // Exercise REAL BrowserWindow movement -> native velocity IPC -> generated renderer.
  await expect(page.locator('canvas[data-artwork="authored"]')).toHaveAttribute(
    "data-ready",
    "true",
  );
  await page.evaluate(() => {
    globalThis.__motionSamples = [];
    globalThis.__maxBend = 0;
    globalThis.__impactSides = [];
    window.clippyDesktop.onWindowMotion((value) => {
      globalThis.__motionSamples.push(value);
      if (globalThis.__motionSamples.length > 100)
        globalThis.__motionSamples.shift();
    });
    globalThis.__motionSampler = setInterval(() => {
      const c = document.querySelector('[data-artwork="authored"]');
      globalThis.__maxBend = Math.max(
        globalThis.__maxBend,
        Math.abs(Number(c?.dataset.bend || 0)),
      );
      if (c?.dataset.impact) globalThis.__impactSides.push(c.dataset.impact);
    }, 16);
  });
  await app.evaluate(async ({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows()[0];
    w.setPosition(100, 100);
  });
  // Exclude setup repositioning from the measured medium-drag phase.
  await page.waitForTimeout(2500);
  await expect(page.locator('[data-artwork="authored"]')).toHaveAttribute(
    "data-motion-state",
    "rest",
  );
  await page.evaluate(() => {
    globalThis.__maxBend = 0;
    globalThis.__impactSides = [];
    globalThis.__motionSamples = [];
  });
  await app.evaluate(async ({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows()[0];
    for (let i = 1; i <= 8; i++) {
      w.setPosition(100 + i * 12, 100);
      await new Promise((r) => setTimeout(r, 50));
    }
  });
  await expect
    .poll(() => page.evaluate(() => globalThis.__maxBend))
    .toBeGreaterThan(10);
  expect(await page.evaluate(() => globalThis.__impactSides)).toEqual([]);
  const samples = await page.evaluate(() => globalThis.__motionSamples);
  expect(samples.some((s) => s.velocityX > 100 && !s.reset)).toBe(true);
  expect(
    samples.every(
      (s) =>
        !("x" in s) &&
        !("y" in s) &&
        Math.abs(s.velocityX) <= 4000 &&
        Math.abs(s.velocityY) <= 4000,
    ),
  ).toBe(true);
  await expect(page.locator('[data-artwork="authored"]')).toHaveAttribute(
    "data-motion-state",
    "rest",
    { timeout: 10000 },
  );
  await page.evaluate(() => {
    globalThis.__impactSides = [];
  });
  await app.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows()[0];
    const [x, y] = w.getPosition();
    w.setPosition(x + 350, y);
  });
  await expect
    .poll(() => page.evaluate(() => globalThis.__impactSides.includes("left")))
    .toBe(true);
  await page.evaluate(() => clearInterval(globalThis.__motionSampler));
  console.log(
    "REAL native window movement: medium bend, bounded private velocity and left-wall impact passed",
  );
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
  // Real network checks BEFORE mocks: exercise the shipped bridge from the custom origin.
  const network = await page.evaluate(async () => {
    const bridge = window.clippyDesktop;
    const catalogue = await bridge.openRouterRequest({
      id: "live-models",
      kind: "models",
    });
    if (
      catalogue.error ||
      catalogue.status !== 200 ||
      !Array.isArray(catalogue.data?.data)
    )
      throw new Error(
        `Native public catalogue failed: ${catalogue.error || catalogue.status}`,
      );
    const invalidKey = await bridge.openRouterRequest({
      id: "live-auth",
      kind: "chat",
      key: "sk-or-v1-" + "0".repeat(64),
      body: {
        model: "openrouter/free",
        max_tokens: 400,
        provider: { max_price: { prompt: 0, completion: 0 } },
        messages: [
          {
            role: "user",
            content:
              "Connectivity probe with deliberately invalid credentials.",
          },
        ],
      },
    });
    // Never use real credentials in CI; 401 proves HTTP exchange, not a successful completion.
    if (invalidKey.error || invalidKey.status !== 401)
      throw new Error(
        `Native auth probe failed: ${invalidKey.error || invalidKey.status}`,
      );
    return {
      catalogue: catalogue.status,
      models: catalogue.data.data.length,
      invalidKey: invalidKey.status,
    };
  });
  console.log("REAL OpenRouter network from packaged IPC:", network);
  // Compare the old renderer path; this is diagnostic, not the release gate.
  const oldPath = await page.evaluate(async () => {
    try {
      const r = await fetch("https://openrouter.ai/api/v1/models", {
        signal: AbortSignal.timeout(8000),
      });
      return { status: r.status };
    } catch {
      return { error: "renderer fetch failed (network/CORS)" };
    }
  });
  console.log("Old renderer catalogue transport:", oldPath);
  await page.route("https://openrouter.ai/api/v1/chat/completions", () => {
    throw new Error("Chat must not use renderer fetch in desktop");
  });
  await app.evaluate(({ net }) => {
    const original = net.fetch.bind(net);
    globalThis.__nativeChats = [];
    net.fetch = async (url, init) => {
      if (url === "https://openrouter.ai/api/v1/chat/completions") {
        globalThis.__nativeChats.push(JSON.parse(init.body));
        return new Response(
          JSON.stringify({
            choices: [{ message: { content: "Проверка portable" } }],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      return original(url, init);
    };
  });
  await page.getByRole("textbox", { name: "Сообщение маскоту" }).fill("Smoke");
  await page.getByRole("textbox", { name: "Сообщение маскоту" }).press("Enter");
  await expect(page.locator(".nt-balloon")).toContainText("Проверка portable");
  await page.getByRole("button", { name: "Настройки", exact: true }).click();
  await page
    .getByLabel("Пропускать клики через прозрачные участки виджета")
    .check();
  await page.getByRole("button", { name: "Готово", exact: true }).click();

  const nativeChats = await app.evaluate(() => globalThis.__nativeChats);
  expect(nativeChats).toHaveLength(1);
  expect(
    nativeChats[0].model === "openrouter/free" ||
      nativeChats[0].model.endsWith(":free"),
  ).toBe(true);
  expect(nativeChats[0].provider.max_price).toEqual({
    prompt: 0,
    completion: 0,
  });
  await page.screenshot({ path: "release/packaged-owner.png" });
  console.log("Owner onboarding/assets/chat passed; opening widget");
  await page.getByRole("button", { name: "Настройки", exact: true }).click();
  await page
    .getByRole("checkbox", { name: "Виджет на рабочем столе", exact: true })
    .check();
  const windowPromise = app.waitForEvent("window", { timeout: 30000 });
  await page.getByRole("button", { name: "Готово", exact: true }).click();
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
  await expect
    .poll(() => widget.evaluate(() => window.clippyCompanion.getPointerState()))
    .toMatchObject({ available: true, enabled: true });
  await expect(widget.locator("canvas[data-companion-alpha]")).toBeVisible();
  await expect(
    widget.locator('canvas[data-artwork="authored"]'),
  ).toHaveAttribute("data-ready", "true");
  await widget.evaluate(() => {
    globalThis.__widgetMotion = [];
    window.clippyCompanion.onWindowMotion((v) =>
      globalThis.__widgetMotion.push(v),
    );
  });
  await app.evaluate(async ({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows().find((w) => w.isVisible());
    w.setPosition(100, 100);
    await new Promise((r) => setTimeout(r, 200));
    w.setPosition(200, 100);
  });
  await expect
    .poll(() =>
      widget.evaluate(() =>
        globalThis.__widgetMotion.some((v) => v.velocityX > 0 && !v.reset),
      ),
    )
    .toBe(true);
  await widget.screenshot({ path: "release/packaged-widget.png" });
  await widget.getByRole("button", { name: "Настройки", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "Свойства: clippyXam" }),
  ).toBeVisible();
  const nextWindow = app.waitForEvent("window", { timeout: 30000 });
  await page.getByRole("button", { name: "Готово", exact: true }).click();
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
  await page.reload();
  await expect(
    page.getByRole("img", { name: "clippy", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("dialog", { name: "Подключение к OpenRouter" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Настройки", exact: true }).click();
  await expect(
    page.getByLabel("Пропускать клики через прозрачные участки виджета"),
  ).toBeChecked();
  await page.getByRole("button", { name: "Готово", exact: true }).click();
  expect(errors).toEqual([]);
  console.log(
    "Packaged Windows smoke passed: production scheme/assets, onboarding, mocked chat, widget/settings/restore, portable profile.",
  );
} catch (error) {
  console.error("Packaged smoke failed:", error);
  for (const [i, page] of app.windows().entries()) {
    await page
      .screenshot({ path: `release/failed-${i}.png`, timeout: 5000 })
      .catch(() => {});
    console.error(
      "Window",
      i,
      page.url(),
      await page
        .locator("body")
        .innerText({ timeout: 5000 })
        .catch(() => "unreadable"),
    );
  }
  throw error;
} finally {
  const killTimer = setTimeout(() => app.process().kill(), 10000);
  try {
    await app.close();
  } finally {
    clearTimeout(killTimer);
  }
}
