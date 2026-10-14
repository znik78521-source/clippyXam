import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";
test.beforeEach(async ({ page }) => {
  await page.route("https://openrouter.ai/api/v1/models", (route) =>
    route.abort(),
  );
});
const endpoint = "https://openrouter.ai/api/v1/chat/completions";
async function connect(page: Page) {
  await page.goto("/");
  await page.getByLabel("API-ключ OpenRouter").fill("test-only-key");
  await page.getByRole("button", { name: "Подключить", exact: true }).click();
}
async function send(page: Page, text: string) {
  await page.getByRole("textbox", { name: "Сообщение маскоту" }).fill(text);
  await page.getByRole("textbox", { name: "Сообщение маскоту" }).press("Enter");
}
async function settings(page: Page) {
  await page.getByRole("button", { name: "Настройки", exact: true }).click();
}
const response = (
  text = "Ответ модели",
  mood = "speaking",
  leaveSeconds = 0,
) => ({
  choices: [
    { message: { content: JSON.stringify({ text, mood, leaveSeconds }) } },
  ],
});
test("first run requires token; grey minimal window; no simulated desktop or demo controls", async ({
  page,
}) => {
  let requests = 0;
  await page.route(endpoint, (route) => {
    requests++;
    return route.abort();
  });
  await page.goto("/");
  await expect(
    page.getByRole("dialog", { name: "Подключение к OpenRouter" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "openrouter.ai/keys" }),
  ).toHaveAttribute("href", "https://openrouter.ai/keys");
  await expect(
    page.getByRole("button", { name: "Подключить", exact: true }),
  ).toBeDisabled();
  await page.getByLabel("API-ключ OpenRouter").fill("test");
  await page.getByRole("button", { name: "Подключить", exact: true }).click();
  await expect(
    page.getByRole("img", { name: "clippy", exact: true }),
  ).toBeVisible();
  expect(
    await page
      .locator(".nt-caption")
      .evaluate((el) => getComputedStyle(el).backgroundColor),
  ).toBe("rgb(176, 176, 176)");
  await expect(page.locator(".nt-companion button")).toHaveCount(5);
  await expect(
    page.locator(".desktop-icons,.taskbar,.messages,.character-card"),
  ).toHaveCount(0);
  expect(requests).toBe(0);
  await page.reload();
  await expect(page.getByRole("dialog")).toBeVisible();
  expect(await page.evaluate(() => Object.keys(localStorage))).toEqual([]);
});
test("Enter submits exactly once to free route with zero-price limits and no leaked settings", async ({
  page,
}) => {
  let calls = 0;
  await page.route(endpoint, async (route) => {
    calls++;
    const body = route.request().postDataJSON();
    expect(body.model).toBe("liquid/lfm-2.5-2.6b:free");
    expect(body.provider).toEqual({
      sort: "latency",
      max_price: { prompt: 0, completion: 0 },
    });
    expect(route.request().headers().authorization).toBe(
      "Bearer test-only-key",
    );
    expect(body.messages.at(-1).content).toBe("Привет");
    expect(JSON.stringify(body)).not.toContain("test-only-key");
    await route.fulfill({ json: response() });
  });
  await connect(page);
  await send(page, "Привет");
  await expect(page.locator(".nt-balloon")).toContainText("Ответ модели");
  expect(calls).toBe(1);
});
test("token removal and 401 force onboarding; dropdown contains only free routes", async ({
  page,
}) => {
  await page.route(endpoint, (route) =>
    route.fulfill({ status: 401, json: {} }),
  );
  await connect(page);
  await settings(page);
  const options = await page
    .locator("#model option")
    .evaluateAll((nodes) => nodes.map((n) => (n as HTMLOptionElement).value));
  expect(options.length).toBeGreaterThan(2);
  expect(
    options.every((id) => id === "openrouter/free" || id.endsWith(":free")),
  ).toBe(true);
  await page.getByLabel("Бесплатная модель").selectOption("openrouter/free");
  await page.getByRole("button", { name: "Применить", exact: true }).click();
  await send(page, "Тест");
  await expect(
    page.getByRole("dialog", { name: "Подключение к OpenRouter" }),
  ).toBeVisible();
  await page.getByLabel("API-ключ OpenRouter").fill("new-test");
  await page.getByRole("button", { name: "Подключить", exact: true }).click();
  await settings(page);
  await page.getByLabel("API-ключ OpenRouter").fill("");
  await page.getByRole("button", { name: "Применить", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "Подключение к OpenRouter" }),
  ).toBeVisible();
});
test("widget lives in settings, keeps caption controls and returns after settings cancel", async ({
  page,
}) => {
  await connect(page);
  await settings(page);
  await page
    .getByRole("checkbox", { name: "Виджет на рабочем столе", exact: true })
    .check();
  await page.getByRole("button", { name: "Применить", exact: true }).click();
  await expect(page.locator(".nt-companion")).toHaveClass(/nt-widget/);
  await settings(page);
  await expect(
    page.getByRole("checkbox", {
      name: "Виджет на рабочем столе",
      exact: true,
    }),
  ).toBeChecked();
  await page.getByRole("button", { name: "Отмена", exact: true }).click();
  await expect(page.locator(".nt-companion")).toHaveClass(/nt-widget/);
  await page.getByRole("button", { name: "Свернуть", exact: true }).click();
  await page.getByRole("button", { name: "Вернуть окно", exact: true }).click();
  await page
    .getByRole("button", { name: "Вернуть обычное окно", exact: true })
    .click();
  await expect(page.locator(".nt-companion")).not.toHaveClass(/nt-widget/);
});
test("cancel and new request ignore late old response", async ({ page }) => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve));
  let calls = 0;
  await page.route(endpoint, async (route) => {
    const first = ++calls === 1;
    if (first) await gate;
    await route
      .fulfill({ json: response(first ? "СТАРОЕ" : "НОВОЕ") })
      .catch(() => {});
  });
  await connect(page);
  try {
    await send(page, "Первый");
    await expect.poll(() => calls).toBe(1);
    await page
      .getByRole("button", { name: "Отменить ответ", exact: true })
      .click();
    await send(page, "Второй");
    await expect(page.locator(".nt-balloon")).toContainText("НОВОЕ");
    release();
    await expect(page.locator(".nt-balloon")).not.toContainText("СТАРОЕ");
    expect(calls).toBe(2);
  } finally {
    release();
  }
});
test("browser microphone is explicit, inserts draft only, and cancellation ignores late events", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const instances: unknown[] = [];
    Object.assign(window, { __recognizers: instances });
    Object.defineProperty(window, "SpeechRecognition", {
      value: class {
        onresult: any;
        onend: any;
        onerror: any;
        start() {
          instances.push(this);
        }
        abort() {
          this.onend?.();
        }
      },
      configurable: true,
    });
  });
  let calls = 0;
  await page.route(endpoint, (route) => {
    calls++;
    return route.fulfill({ json: response() });
  });
  await connect(page);
  await page
    .getByRole("button", { name: "Голосовой ввод", exact: true })
    .click();
  await page.evaluate(() => {
    const r = (window as any).__recognizers[0];
    r.onresult({ results: [[{ transcript: "Распознанный текст" }]] });
    r.onend();
  });
  await expect(
    page.getByRole("textbox", { name: "Сообщение маскоту" }),
  ).toHaveValue("Распознанный текст");
  expect(calls).toBe(0);
  await page
    .getByRole("button", { name: "Голосовой ввод", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Остановить голосовой ввод", exact: true })
    .click();
  await page.evaluate(() =>
    (window as any).__recognizers[1].onresult({
      results: [[{ transcript: "ПОЗДНО" }]],
    }),
  );
  await expect(
    page.getByRole("textbox", { name: "Сообщение маскоту" }),
  ).not.toHaveValue(/ПОЗДНО/);
  await page.getByRole("textbox", { name: "Сообщение маскоту" }).press("Enter");
  await expect(page.locator(".nt-balloon")).toContainText("Ответ модели");
  expect(calls).toBe(1);
});
test("unavailable microphone reports error, text remains usable", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "SpeechRecognition", { value: undefined });
    Object.defineProperty(window, "webkitSpeechRecognition", {
      value: undefined,
    });
  });
  await connect(page);
  await page
    .getByRole("button", { name: "Голосовой ввод", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("не поддерживает");
  await page
    .getByRole("textbox", { name: "Сообщение маскоту" })
    .fill("Можно печатать");
});
test("away timer and gentle boundary remain functional without demo", async ({
  page,
}) => {
  let calls = 0;
  await page.route(endpoint, (route) => {
    calls++;
    return route.fulfill({ json: response("Ушёл", "offended", 3) });
  });
  await connect(page);
  await page.clock.install();
  await send(page, "Перерыв");
  await expect(page.locator(".nt-balloon")).toContainText("Ушёл");
  await page.clock.runFor(4000);
  await expect(page.locator(".nt-balloon")).toContainText("вернулся");
  await send(page, "Без подколов");
  await expect(page.locator(".nt-balloon")).toContainText("мягкий режим");
  expect(calls).toBe(1);
});
test("session memory and different personas still use separate model contexts", async ({
  page,
}) => {
  const contexts: string[] = [];
  await page.route(endpoint, (route) => {
    contexts.push(JSON.stringify(route.request().postDataJSON()));
    return route.fulfill({ json: response() });
  });
  await connect(page);
  await settings(page);
  await page.getByRole("tab", { name: "Поведение", exact: true }).click();
  await page
    .getByRole("checkbox", {
      name: "Помнить отдельный диалог каждого маскота в этой сессии",
    })
    .check();
  await page.getByRole("button", { name: "Применить", exact: true }).click();
  await send(page, "Первая скрепка");
  await expect(page.locator(".nt-balloon")).toContainText("Ответ модели");
  await settings(page);
  await page.getByLabel("Персонаж", { exact: true }).selectOption("rover");
  await page.getByRole("button", { name: "Применить", exact: true }).click();
  await send(page, "Первый пёс");
  await expect(page.locator(".nt-balloon")).toContainText("Ответ модели");
  await settings(page);
  await page.getByLabel("Персонаж", { exact: true }).selectOption("clippy");
  await page.getByRole("button", { name: "Применить", exact: true }).click();
  await send(page, "Вторая скрепка");
  await expect.poll(() => contexts.length).toBe(3);
  expect(contexts[2]).toContain("Первая скрепка");
  expect(contexts[2]).not.toContain("Первый пёс");
});
test("small viewport keeps token flow and minimal input accessible", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 480 });
  await connect(page);
  await expect(
    page.getByRole("textbox", { name: "Сообщение маскоту" }),
  ).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    320,
  );
  await settings(page);
  await expect(
    page.getByRole("button", { name: "Применить", exact: true }),
  ).toBeVisible();
});
test("429 is explicit, retries at most four different free routes", async ({
  page,
}) => {
  let calls = 0;
  const models: string[] = [];
  await page.route(endpoint, (route) => {
    calls++;
    const body = route.request().postDataJSON();
    models.push(body.model);
    expect(body.provider.max_price).toEqual({ prompt: 0, completion: 0 });
    return route.fulfill({ status: 429, json: {} });
  });
  await connect(page);
  await send(page, "Вопрос");
  await expect(page.getByRole("alert")).toContainText(
    "Лимит бесплатных запросов",
  );
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(calls).toBe(4);
  expect(new Set(models).size).toBe(4);
  expect(
    models.every((id) => id === "openrouter/free" || id.endsWith(":free")),
  ).toBe(true);
});
test("system voice can be enabled and stopped without enabling paid TTS", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.assign(window, {
      SpeechSynthesisUtterance: class {
        constructor(public text: string) {}
      },
    });
    const spoken: string[] = [];
    Object.assign(window, { __spoken: spoken, __cancelled: 0 });
    Object.defineProperty(window, "speechSynthesis", {
      value: {
        getVoices: () => [
          {
            name: "Test Russian",
            voiceURI: "test-ru",
            lang: "ru-RU",
            localService: true,
            default: true,
          },
        ],
        addEventListener: () => {},
        removeEventListener: () => {},
        speak: (u: any) => {
          spoken.push(u.text);
          u.onstart?.();
        },
        cancel: () => {
          (window as any).__cancelled++;
        },
        resume: () => {},
      },
    });
  });
  await page.route(endpoint, (route) =>
    route.fulfill({ json: response("Проверка голоса") }),
  );
  await connect(page);
  await settings(page);
  await page.getByRole("tab", { name: "Голос", exact: true }).click();
  await page
    .getByRole("checkbox", { name: "Озвучивать ответы", exact: true })
    .check();
  await page.getByRole("button", { name: "Применить", exact: true }).click();
  await send(page, "Привет");
  await expect
    .poll(() => page.evaluate(() => (window as any).__spoken))
    .toEqual(["Проверка голоса"]);
  const before = await page.evaluate(() => (window as any).__cancelled);
  await page
    .getByRole("button", { name: "Остановить озвучку", exact: true })
    .click();
  expect(
    await page.evaluate(() => (window as any).__cancelled),
  ).toBeGreaterThan(before);
  await expect(
    page.getByRole("button", { name: "Остановить озвучку", exact: true }),
  ).toHaveCount(0);
});
test("entire composer fits smallest supported size", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 400 });
  await connect(page);
  const box = await page.locator(".nt-composer").boundingBox();
  expect(box).not.toBeNull();
  expect(box!.y + box!.height).toBeLessThanOrEqual(400);
  expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBe(
    400,
  );
});
test("empty completion recovers once, truncated JSON is shown as dialogue only", async ({
  page,
}) => {
  let calls = 0;
  await page.route(endpoint, (route) => {
    calls++;
    return route.fulfill({
      json: {
        choices: [
          {
            message: {
              content:
                calls === 1
                  ? ""
                  : '{"text":"Ты спросил, о чём мы говорили, так',
            },
          },
        ],
      },
    });
  });
  await connect(page);
  await send(page, "Привет");
  await expect(page.locator(".nt-balloon")).toContainText("Ты спросил");
  await expect(page.locator(".nt-balloon")).not.toContainText('{"text"');
  expect(calls).toBe(2);
});
test("peeking uses its own authored timeline and gesture behind the edge", async ({
  page,
}) => {
  let calls = 0;
  await page.route(endpoint, (route) =>
    route.fulfill({
      json: response(
        ++calls === 1 ? "Ушёл" : "Отвернись, мудила.",
        calls === 1 ? "offended" : "rude",
        calls === 1 ? 25 : 0,
      ),
    }),
  );
  await connect(page);
  await page.clock.install();
  await send(page, "Уйди");
  await expect(page.locator(".nt-balloon")).toContainText("Ушёл");
  await page.clock.runFor(2000);
  await send(page, "Ты где?");
  await expect(page.locator('[data-animation="peek-from-edge"]')).toBeVisible();
  expect(
    await page
      .locator(".peek-active")
      .evaluate((el) => getComputedStyle(el).animationName),
  ).toBe("peek-from-edge");
  await expect(page.locator(".peek-active .rude-hand")).toHaveCount(1);
  await expect(page.locator(".nt-balloon")).toContainText("Отвернись");
});
test("failed send keeps original text; successful retry clears it and does not duplicate history", async ({
  page,
}) => {
  let calls = 0;
  let messages: any[] = [];
  await page.route(endpoint, (route) => {
    calls++;
    messages = route.request().postDataJSON().messages;
    return calls <= 4
      ? route.fulfill({ status: 503, json: {} })
      : route.fulfill({ json: response("Получилось") });
  });
  await connect(page);
  await send(page, "Не потеряй это сообщение");
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(
    page.getByRole("textbox", { name: "Сообщение маскоту" }),
  ).toHaveValue("Не потеряй это сообщение");
  await page.getByRole("textbox", { name: "Сообщение маскоту" }).press("Enter");
  await expect(page.locator(".nt-balloon")).toContainText("Получилось");
  await expect(
    page.getByRole("textbox", { name: "Сообщение маскоту" }),
  ).toHaveValue("");
  expect(
    messages.filter(
      (m) => m.role === "user" && m.content === "Не потеряй это сообщение",
    ),
  ).toHaveLength(1);
});
test("failure cannot overwrite a new draft typed while waiting", async ({
  page,
}) => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve));
  await page.route(endpoint, async (route) => {
    await gate;
    await route.fulfill({ status: 503, json: {} });
  });
  await connect(page);
  try {
    await send(page, "Первый");
    await expect(
      page.getByRole("button", { name: "Отменить ответ" }),
    ).toBeVisible();
    await page
      .getByRole("textbox", { name: "Сообщение маскоту" })
      .fill("Новый черновик");
    release();
    await expect(page.getByRole("alert")).toBeVisible();
    await expect(
      page.getByRole("textbox", { name: "Сообщение маскоту" }),
    ).toHaveValue("Новый черновик");
  } finally {
    release();
  }
});
test("all eight visual gags can be previewed without network or OS commands", async ({
  page,
}) => {
  await connect(page);
  for (const kind of [
    "bat",
    "burrow",
    "jail",
    "flame",
    "rage",
    "format",
    "bsod",
    "update",
  ]) {
    await settings(page);
    await page.getByRole("tab", { name: "Поведение", exact: true }).click();
    await page.getByLabel("Просмотр мемной сценки").selectOption(kind);
    await page
      .getByRole("button", { name: "Показать сценку", exact: true })
      .click();
    await expect(
      page.locator(`.nt-stage[data-cinematic="${kind}"]`),
    ).toBeVisible();
    await expect(page.locator(`.cinematic-${kind}`)).toBeVisible();
  }
  await expect(page.locator(".fake-system")).toContainText(
    "WINDOWS НЕ ЗАТРОНУТА",
  );
});
test("live model dropdown excludes paid models and selected HTTP400 falls back without losing draft", async ({
  page,
}) => {
  await page.route("https://openrouter.ai/api/v1/models", (route) => {
    expect(route.request().headers().authorization).toBeUndefined();
    return route.fulfill({
      json: {
        data: [
          {
            id: "test/fast-4b:free",
            name: "Компактная тестовая",
            pricing: { prompt: "0", completion: "0" },
            architecture: {
              input_modalities: ["text"],
              output_modalities: ["text"],
            },
          },
          {
            id: "test/reserve-70b:free",
            name: "Резервная тестовая",
            pricing: { prompt: "0", completion: "0" },
            architecture: {
              input_modalities: ["text"],
              output_modalities: ["text"],
            },
          },
          {
            id: "paid/model:free",
            name: "Платная",
            pricing: { prompt: "1", completion: "1" },
            architecture: {
              input_modalities: ["text"],
              output_modalities: ["text"],
            },
          },
        ],
      },
    });
  });
  const bodies: any[] = [];
  await page.route(endpoint, (route) => {
    bodies.push(route.request().postDataJSON());
    return bodies.length === 1
      ? route.fulfill({
          status: 400,
          json: { error: { message: "unsupported reasoning" } },
        })
      : route.fulfill({ json: response("Сработал резерв") });
  });
  await connect(page);
  await settings(page);
  await expect(
    page.locator('#model option[value="test/reserve-70b:free"]'),
  ).toHaveCount(1);
  await expect(
    page.locator('#model option[value="paid/model:free"]'),
  ).toHaveCount(0);
  await page
    .getByLabel("Бесплатная модель")
    .selectOption("test/reserve-70b:free");
  await page.getByRole("button", { name: "Применить", exact: true }).click();
  await send(page, "Вопрос для резерва");
  await expect(page.locator(".nt-balloon")).toContainText("Сработал резерв");
  expect(bodies.map((b) => b.model)).toEqual([
    "test/reserve-70b:free",
    "test/fast-4b:free",
  ]);
  expect(bodies[1].messages.every((m: any) => m.role !== "system")).toBe(true);
  expect(bodies[1].provider.max_price).toEqual({ prompt: 0, completion: 0 });
  await expect(
    page.getByRole("textbox", { name: "Сообщение маскоту" }),
  ).toHaveValue("");
});
test("fallback can be disabled; catalog failure retains bootstrap choices", async ({
  page,
}) => {
  let calls = 0;
  await page.route(endpoint, (route) => {
    calls++;
    return route.fulfill({ status: 503, json: {} });
  });
  await connect(page);
  await settings(page);
  await expect(
    page.getByText("Не удалось обновить каталог.", { exact: false }),
  ).toBeVisible();
  await page
    .getByLabel("Бесплатная модель")
    .selectOption("liquid/lfm-2.5-2.6b:free");
  await page
    .getByLabel("Если не отвечает — пробовать другую бесплатную модель")
    .uncheck();
  await page.getByRole("button", { name: "Применить", exact: true }).click();
  await send(page, "Сохрани черновик");
  await expect(page.getByRole("alert")).toBeVisible();
  expect(calls).toBe(1);
  await expect(
    page.getByRole("textbox", { name: "Сообщение маскоту" }),
  ).toHaveValue("Сохрани черновик");
});
