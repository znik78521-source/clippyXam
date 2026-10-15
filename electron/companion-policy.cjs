const { validBounds } = require("./window-policy.cjs");
const MOODS = new Set([
  "idle",
  "thinking",
  "speaking",
  "offended",
  "away",
  "peeking",
  "rude",
]);
const CHARACTERS = new Set(["clippy", "rover", "merlin"]);
function sanitizeCompanionSnapshot(input) {
  if (
    !input ||
    typeof input !== "object" ||
    Array.isArray(input) ||
    !CHARACTERS.has(input.character) ||
    !MOODS.has(input.phase) ||
    !MOODS.has(input.animationMood)
  )
    throw new TypeError("Invalid companion snapshot");
  const text = (value) =>
    typeof value === "string" ? value.slice(0, 12000) : "";
  const bubble = text(input.bubble);
  const start = input.highlight?.start,
    end = input.highlight?.end;
  const highlight =
    Number.isInteger(start) &&
    Number.isInteger(end) &&
    start >= 0 &&
    end > start &&
    end <= bubble.length
      ? { start, end }
      : null;
  // Deliberately NOT spread input: no settings, API keys, voice cache or history.
  return {
    character: input.character,
    clickThrough: input.clickThrough === true,
    authoredClippy: input.authoredClippy === true,
    speechLevel: Number.isFinite(input.speechLevel)
      ? Math.round(Math.max(0, Math.min(1, input.speechLevel)) * 15) / 15
      : null,
    autonomous: input.autonomous === true,
    animation:
      typeof input.animation?.name === "string" &&
      /^[A-Za-z0-9_]{1,48}$/.test(input.animation.name) &&
      Number.isSafeInteger(input.animation.serial)
        ? {
            name: input.animation.name,
            serial: input.animation.serial,
            ...(Number.isSafeInteger(input.animation.startedAt) &&
            input.animation.startedAt >= 0 &&
            input.animation.startedAt < 1e13
              ? { startedAt: input.animation.startedAt }
              : {}),
          }
        : null,
    sendResult: {
      sequence:
        Number.isSafeInteger(input.sendResult?.sequence) &&
        input.sendResult.sequence >= 0
          ? input.sendResult.sequence
          : 0,
      success: input.sendResult?.success === true,
      text:
        input.sendResult?.success === false &&
        typeof input.sendResult?.text === "string"
          ? input.sendResult.text.slice(0, 2000)
          : "",
    },
    phase: input.phase,
    animationMood: input.animationMood,
    bubble,
    highlight,
    notice: text(input.notice).slice(0, 600),
    error: text(input.error),
    hasDiagnostic: input.hasDiagnostic === true,
    pending: input.pending === true,
    sound: input.sound === true,
    speechBusy: input.speechBusy === true,
    speaking: input.speaking === true,
    quiet: input.quiet === true,
    away: input.away === true,
    seconds: Number.isFinite(input.seconds)
      ? Math.max(0, Math.min(60, Math.ceil(input.seconds)))
      : 0,
  };
}
function sanitizeCompanionAction(input) {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new TypeError("Invalid companion action");
  if (
    [
      "restore",
      "toggle-sound",
      "return",
      "stop-speech",
      "cancel-reply",
      "settings-widget",
      "settings",
      "minimize",
      "maximize",
      "close",
    ].includes(input.type)
  )
    return { type: input.type };
  if (
    input.type === "send" &&
    typeof input.text === "string" &&
    input.text.trim().length > 0 &&
    input.text.length <= 2000
  )
    return { type: "send", text: input.text.trim() };
  if (input.type === "select-character" && CHARACTERS.has(input.character))
    return { type: input.type, character: input.character };
  throw new TypeError("Unsupported companion action");
}
function fitCompanionBounds(saved, area) {
  const width = Math.min(360, area.width),
    height = Math.min(460, area.height);
  const input = validBounds(saved)
    ? saved
    : {
        x: area.x + area.width - width - 24,
        y: area.y + area.height - height - 24,
      };
  return {
    x: Math.round(
      Math.max(area.x, Math.min(input.x, area.x + area.width - width)),
    ),
    y: Math.round(
      Math.max(area.y, Math.min(input.y, area.y + area.height - height)),
    ),
    width,
    height,
  };
}
module.exports = {
  sanitizeCompanionSnapshot,
  sanitizeCompanionAction,
  fitCompanionBounds,
};
