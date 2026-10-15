import { test, expect } from "@playwright/test";
async function ready(page: any) {
  await page.goto("/artwork/prototype/index.html");
  await page.waitForFunction(() => (window as any).__inertiaDemo);
  await page.clock.install({ time: new Date("2026-10-15T12:00:00Z") });
  await page.clock.pauseAt(new Date("2026-10-15T12:00:01Z"));
}
test("review prototype gentle movement stays gentle; violent pull hits opposite edge and recovers", async ({
  page,
}) => {
  await ready(page);
  await page
    .getByRole("button", { name: "Плавно вправо", exact: true })
    .click();
  await page.clock.runFor(3500);
  await expect(page.locator("canvas")).toHaveAttribute("data-hits", "0");
  await page
    .getByRole("button", { name: "Резкий рывок → удар", exact: true })
    .click();
  await page.clock.runFor(70);
  await expect(page.locator("canvas")).toHaveAttribute("data-impact", "left");
  expect(
    Number(await page.locator("canvas").getAttribute("data-offset")),
  ).toBeLessThan(0);
  await page.clock.runFor(5000);
  await expect(page.locator("canvas")).toHaveAttribute("data-impact", "");
  expect(
    Math.abs(Number(await page.locator("canvas").getAttribute("data-offset"))),
  ).toBeLessThan(0.1);
});
test("prototype permits real pointer dragging and respects reduced motion", async ({
  page,
}) => {
  await ready(page);
  const handle = page.locator("#handle");
  const box = (await handle.boundingBox())!;
  await page.mouse.move(box.x + 100, box.y + 12);
  await page.mouse.down();
  await page.mouse.move(box.x + 240, box.y + 12);
  await page.clock.runFor(30);
  expect(
    Number(await page.locator("canvas").getAttribute("data-offset")),
  ).toBeLessThan(0);
  await page.mouse.up();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.clock.runFor(500);
  await expect(page.locator("canvas")).toHaveAttribute("data-offset", "0");
  await expect(page.locator("canvas")).toHaveAttribute("data-impact", "");
  await page
    .getByRole("button", { name: "Резкий рывок → удар", exact: true })
    .click();
  await page.clock.runFor(500);
  await expect(page.locator("canvas")).toHaveAttribute("data-hits", "0");
});
