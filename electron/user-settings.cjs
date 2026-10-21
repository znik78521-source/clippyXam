const fs = require("node:fs/promises");
const path = require("node:path");
// Explicit allowlist: never persist keys, messages, drafts, audio or provider errors.
function sanitizeSettings(input) {
  const out = {};
  if (!input || typeof input !== "object" || Array.isArray(input)) return out;
  for (const [key, values] of Object.entries({
    character: ["clippy", "rover", "merlin"],
    intensity: ["soft", "normal", "wild"],
    ttsProvider: ["local", "system"],
    router: ["openrouter", "groq", "teamorouter"],
  }))
    if (values.includes(input[key])) out[key] = input[key];
  for (const key of [
    "sound",
    "autoFallback",
    "clickThrough",
    "speechMotion",
    "authoredClippy",
    "teamorouterPaidAcknowledged",
    "groqFreeTierAcknowledged",
  ])
    if (typeof input[key] === "boolean") out[key] = input[key];
  const modelLists = {
    openrouter: /^(?:openrouter\/free|[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_./-]+:free)$/,
    groq: /^(?:openai\/gpt-oss-(?:20b|120b|safeguard-20b)|qwen\/qwen3\.8-27b)$/,
    teamorouter: /^(?:deepseek-v4-flash-free)$/,
  };
  const router = out.router || "openrouter";
  if (
    typeof input.model === "string" &&
    input.model.length <= 160 &&
    modelLists[router].test(input.model)
  )
    out.model = input.model;
  if (Number.isFinite(input.rate) && input.rate >= 0.7 && input.rate <= 1.8)
    out.rate = input.rate;
  const safeString = (v) =>
    typeof v === "string" && v.length <= 200 && !/[\x00-\x1f]/.test(v);
  if (safeString(input.voice)) out.voice = input.voice;
  if (input.systemVoices) {
    out.systemVoices = {};
    for (const id of ["clippy", "rover", "merlin"])
      if (safeString(input.systemVoices[id]))
        out.systemVoices[id] = input.systemVoices[id];
  }
  if (input.companion && typeof input.companion === "object") {
    const c = {};
    for (const key of [
      "backgroundQuips",
      "allowRude",
      "quietEnabled",
      "rememberSession",
    ])
      if (typeof input.companion[key] === "boolean")
        c[key] = input.companion[key];
    for (const key of ["quietStart", "quietEnd"])
      if (
        typeof input.companion[key] === "string" &&
        /^([01]\d|2[0-3]):[0-5]\d$/.test(input.companion[key])
      )
        c[key] = input.companion[key];
    out.companion = c;
  }
  return out;
}
function createSettingsStore(directory) {
  const file = path.join(directory, "preferences.json");
  let tail = Promise.resolve();
  return {
    async load() {
      await tail;
      try {
        if ((await fs.stat(file)).size > 32768) throw new Error();
        const raw = JSON.parse(await fs.readFile(file, "utf8"));
        const settings = sanitizeSettings(raw);
        if (raw.schemaVersion !== 2) {
          settings.model = "openrouter/free";
          if (settings.rate === undefined || settings.rate === 1)
            settings.rate = 1.25;
          settings.speechMotion = false;
        }
        return { settings, warning: "" };
      } catch (e) {
        return {
          settings: {},
          warning:
            e.code === "ENOENT"
              ? ""
              : "Сохранённые настройки повреждены; загружены стандартные.",
        };
      }
    },
    save(input) {
      const data = JSON.stringify({
        ...sanitizeSettings(input),
        schemaVersion: 2,
      });
      const operation = tail.then(async () => {
        await fs.mkdir(directory, { recursive: true });
        const temp = file + ".tmp";
        await fs.writeFile(temp, data, { mode: 0o600 });
        await fs.rename(temp, file);
      });
      tail = operation.catch(() => {});
      return operation;
    },
  };
}
module.exports = { sanitizeSettings, createSettingsStore };
