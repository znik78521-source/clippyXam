const path = require("node:path");
function createStartup({
  app,
  platform = process.platform,
  portableFile = process.env.PORTABLE_EXECUTABLE_FILE,
}) {
  const available =
    platform === "win32" &&
    app.isPackaged &&
    typeof portableFile === "string" &&
    path.win32.isAbsolute(portableFile) &&
    /\.exe$/i.test(portableFile) &&
    !/[\x00-\x1f"]/.test(portableFile);
  const options = {
    path: portableFile,
    args: ["--autostart"],
    name: "clippyXam",
  };
  const state = () => ({
    available,
    enabled: available
      ? app.getLoginItemSettings(options).openAtLogin === true
      : false,
  });
  return {
    state,
    set(value) {
      if (typeof value !== "boolean") throw new TypeError("Boolean required");
      if (!available)
        throw new Error(
          "Автозапуск доступен только из portable EXE на Windows.",
        );
      app.setLoginItemSettings({ ...options, openAtLogin: value });
      const result = state();
      if (result.enabled !== value)
        throw new Error("Windows не подтвердила изменение автозапуска.");
      return result;
    },
  };
}
module.exports = { createStartup };
