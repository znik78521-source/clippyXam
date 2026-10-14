// Attaches only to a CI launch explicitly given a localhost debugging port.
import { chromium, expect } from "@playwright/test";
import fs from "node:fs/promises";
let browser;
for (let attempt = 0; attempt < 90; attempt++) {
  try {
    browser = await chromium.connectOverCDP("http://127.0.0.1:9333");
    break;
  } catch {
    await new Promise((r) => setTimeout(r, 1000));
  }
}
if (!browser) throw new Error("Portable executable never opened its renderer");
try {
  const context = browser.contexts()[0];
  let page = context.pages().find((p) => p.url().startsWith("clippyxam://"));
  if (!page) page = await context.waitForEvent("page", { timeout: 30000 });
  await expect(
    page.getByRole("dialog", { name: "Подключение к OpenRouter" }),
  ).toBeVisible({ timeout: 30000 });
  await fs.access("release/clippyXam-data");
  await page.screenshot({ path: "release/portable-onboarding.png" });
  await page.getByRole("button", { name: "Закрыть", exact: true }).click();
  console.log(
    "Actual single-file portable EXE launched, used adjacent profile, showed onboarding, and accepted exit.",
  );
} finally {
  await browser.close().catch(() => {});
}
