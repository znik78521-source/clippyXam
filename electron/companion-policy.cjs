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
    typeof value === "string" ? value.slice(0, 2500) : "";
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
    phase: input.phase,
    animationMood: input.animationMood,
    bubble,
    highlight,
    notice: text(input.notice).slice(0, 600),
    error: text(input.error),
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
