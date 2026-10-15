const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const {
  createSettingsStore,
  sanitizeSettings,
} = require("./user-settings.cjs");
async function fixture(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "clippy-settings-"));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  return {
    store: createSettingsStore(dir),
    file: path.join(dir, "preferences.json"),
  };
}
test("preferences exclude credentials, chats, drafts and unknown nested fields", async (t) => {
  const f = await fixture(t);
  assert.deepEqual(await f.store.load(), { settings: {}, warning: "" });
  await f.store.save({
    character: "rover",
    intensity: "soft",
    model: "test/model:free",
    clickThrough: true,
    speechMotion: false,
    key: "secret-api",
    ttsKey: "secret-tts",
    messages: ["secret-message"],
    widget: true,
    companion: {
      quietEnabled: true,
      quietStart: "22:30",
      quietEnd: "08:00",
      key: "nested-secret",
    },
    systemVoices: { clippy: "voice-id", key: "other-secret" },
  });
  const disk = await fs.readFile(f.file, "utf8");
  assert.doesNotMatch(disk, /secret|messages|"key"|ttsKey|widget/);
  assert.equal((await f.store.load()).settings.character, "rover");
  assert.equal((await f.store.load()).settings.companion.quietStart, "22:30");
});
test("corrupt and oversized preferences recover; serialized writes keep latest", async (t) => {
  const f = await fixture(t);
  await fs.writeFile(f.file, "broken");
  assert.ok((await f.store.load()).warning);
  await fs.writeFile(f.file, " ".repeat(32769));
  assert.ok((await f.store.load()).warning);
  await Promise.all([
    f.store.save({ intensity: "wild" }),
    f.store.save({ intensity: "soft" }),
  ]);
  assert.equal((await f.store.load()).settings.intensity, "soft");
  assert.equal(await fs.stat(f.file + ".tmp").catch(() => null), null);
});
test("invalid values and paid provider are not restored", () => {
  assert.deepEqual(
    sanitizeSettings({
      ttsProvider: "openai",
      model: "paid/model",
      character: "evil",
      rate: Infinity,
      clickThrough: "yes",
      voice: "bad\nvoice",
      companion: { quietStart: "24:00" },
    }),
    { companion: {} },
  );
  assert.equal(sanitizeSettings({ rate: 1.4, autoFallback: false }).rate, 1.4);
});
test("0.7 preferences migrate to standard free router and faster speech once; new manual choice persists", async (t) => {
  const f = await fixture(t);
  await fs.writeFile(
    f.file,
    JSON.stringify({
      model: "liquid/lfm-2.5-2.6b:free",
      rate: 1,
      character: "merlin",
    }),
  );
  const migrated = (await f.store.load()).settings;
  assert.equal(migrated.model, "openrouter/free");
  assert.equal(migrated.rate, 1.25);
  assert.equal(migrated.character, "merlin");
  await f.store.save({ ...migrated, model: "qwen/qwen3-4b:free", rate: 1.5 });
  assert.equal((await f.store.load()).settings.model, "qwen/qwen3-4b:free");
  assert.equal((await f.store.load()).settings.rate, 1.5);
});
