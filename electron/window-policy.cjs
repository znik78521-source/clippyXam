// Pure policies shared by the native shell and its tests. No Electron required.
const MINI_SIZE = { width: 420, height: 650 };
const FULL_SIZE = { width: 1190, height: 740 };
const EXTERNAL_URLS = new Set([
  "https://openrouter.ai/keys",
  "https://github.com/pi0/clippyjs",
]);
function validBounds(value) {
  return (
    value &&
    typeof value === "object" &&
    ["x", "y", "width", "height"].every((key) => Number.isFinite(value[key])) &&
    Math.abs(value.x) <= 1_000_000 &&
    Math.abs(value.y) <= 1_000_000 &&
    value.width >= 1 &&
    value.width <= 100_000 &&
    value.height >= 1 &&
    value.height <= 100_000
  );
}
function fitBounds(bounds, area, mini) {
  const defaults = mini ? MINI_SIZE : FULL_SIZE;
  const input = validBounds(bounds)
    ? bounds
    : {
        ...defaults,
        x: area.x + area.width - defaults.width - 24,
        y: area.y + area.height - defaults.height - 24,
      };
  const width = Math.round(
    Math.min(area.width, Math.max(mini ? 360 : 900, input.width)),
  );
  const height = Math.round(
    Math.min(area.height, Math.max(mini ? 520 : 620, input.height)),
  );
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
function sanitizePreferences(value) {
  return {
    mini: typeof value?.mini === "boolean" ? value.mini : true,
    alwaysOnTop:
      typeof value?.alwaysOnTop === "boolean" ? value.alwaysOnTop : true,
    miniBounds: validBounds(value?.miniBounds)
      ? {
          x: Math.round(value.miniBounds.x),
          y: Math.round(value.miniBounds.y),
          width: Math.round(value.miniBounds.width),
          height: Math.round(value.miniBounds.height),
        }
      : null,
    companionBounds: validBounds(value?.companionBounds)
      ? {
          x: Math.round(value.companionBounds.x),
          y: Math.round(value.companionBounds.y),
          width: Math.round(value.companionBounds.width),
          height: Math.round(value.companionBounds.height),
        }
      : null,
    fullBounds: validBounds(value?.fullBounds)
      ? {
          x: Math.round(value.fullBounds.x),
          y: Math.round(value.fullBounds.y),
          width: Math.round(value.fullBounds.width),
          height: Math.round(value.fullBounds.height),
        }
      : null,
  };
}
function getDevURL(value) {
  if (!value)
    throw new Error(
      "Запускай desktop через npm run desktop:dev. Упаковка приложения пока не настроена.",
    );
  const url = new URL(value);
  if (
    url.protocol !== "http:" ||
    url.hostname !== "127.0.0.1" ||
    !url.port ||
    url.pathname !== "/" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    throw new Error("Desktop может загружать только локальный dev-сервер.");
  return url.href;
}
function isTrustedFrame(event, webContents, devURL) {
  try {
    return (
      event.sender === webContents &&
      event.senderFrame === webContents.mainFrame &&
      new URL(event.senderFrame.url).origin === new URL(devURL).origin &&
      new URL(event.senderFrame.url).pathname === "/"
    );
  } catch {
    return false;
  }
}
module.exports = {
  MINI_SIZE,
  FULL_SIZE,
  EXTERNAL_URLS,
  fitBounds,
  validBounds,
  sanitizePreferences,
  getDevURL,
  isTrustedFrame,
};
