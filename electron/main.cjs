const {
  app,
  BrowserWindow,
  ipcMain,
  Menu,
  Tray,
  nativeImage,
  shell,
  screen,
  dialog,
  protocol,
  net,
  session,
} = require("electron");
// Preserve the cause in CI/stderr before Electron opens its native error box.
process.on("uncaughtExceptionMonitor", (error) => console.error("Main process failure:", error));
const path = require("node:path");
const fs = require("node:fs");
const { pathToFileURL } = require("node:url");
const {
  rendererURL,
  bundleFile,
  contentSecurityPolicy,
  portableDataDirectory,
} = require("./runtime-policy.cjs");
protocol.registerSchemesAsPrivileged([
  {
    scheme: "clippyxam",
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
    },
  },
]);
const {
  EXTERNAL_URLS,
  fitBounds,
  sanitizePreferences,
  isTrustedFrame,
} = require("./window-policy.cjs");
const { createWindowController } = require("./window-controller.cjs");

const {
  sanitizeCompanionSnapshot,
  sanitizeCompanionAction,
  fitCompanionBounds,
} = require("./companion-policy.cjs");
const {
  createCompanionController,
  waitForCompanionReady,
} = require("./companion-controller.cjs");
const { createPointerController } = require("./pointer-controller.cjs");
const pointerControllers = new WeakMap();
const dictation = require("./dictation.cjs").createDictation();
app.setName("clippyXam");
if (process.platform === "win32") app.setAppUserModelId("ai.clippyxam");

let win, controller, tray, saveTimer, companion;
let companionSnapshot = null,
  companionBounds = null;
let quitting = false;
let devURL;
try {
  devURL = rendererURL(app.isPackaged, process.env.CLIPPYXAM_DEV_URL);
  if (app.isPackaged) {
    const data = portableDataDirectory(
      process.env.PORTABLE_EXECUTABLE_DIR || path.dirname(app.getPath("exe")),
    );
    fs.mkdirSync(data, { recursive: true });
    fs.accessSync(data, fs.constants.W_OK);
    app.setPath("userData", data);
    const sessionData = path.join(data, "session");
    fs.mkdirSync(sessionData, { recursive: true });
    app.setPath("sessionData", sessionData);
  }
} catch (error) {
  dialog.showErrorBox(
    "clippyXam — запуск",
    "Не удалось открыть приложение. Перенеси exe в папку с правом записи.\n" +
      error.message,
  );
  app.exit(1);
}
const iconPath = path.join(__dirname, "icon.png");
const settingsPath = () =>
  path.join(app.getPath("userData"), "window-state.json");
function loadPreferences() {
  try {
    return sanitizePreferences(
      JSON.parse(fs.readFileSync(settingsPath(), "utf8")),
    );
  } catch {
    return sanitizePreferences(null);
  }
}
function savePreferences() {
  if (!win || win.isDestroyed() || !controller) return;
  try {
    fs.mkdirSync(path.dirname(settingsPath()), { recursive: true });
    // Only whitelisted non-secret window geometry. Never receive chat/key data.
    const temporary = `${settingsPath()}.tmp`;
    fs.writeFileSync(
      temporary,
      JSON.stringify({ ...controller.snapshot(), companionBounds }),
      {
        mode: 0o600,
      },
    );
    fs.renameSync(temporary, settingsPath());
  } catch {
    console.warn("Не удалось сохранить расположение окна.");
  }
}
function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(savePreferences, 300);
}
function updateTray() {
  if (!tray || tray.isDestroyed() || !controller) return;
  const state = controller.state();
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: "Вернуть окно", click: restoreOwner },
      {
        label: "Маскот на рабочем столе",
        type: "checkbox",
        checked: Boolean(companion?.isActive()),
        click: (item) => {
          if (item.checked)
            enableCompanion().catch(() => {
              restoreOwner();
              dialog.showErrorBox(
                "clippyXam",
                "Не удалось открыть прозрачное окно. Обычное окно восстановлено.",
              );
            });
          else restoreOwner();
        },
      },
      {
        label: "Мини-режим",
        type: "checkbox",
        checked: state.mini,
        click: (item) => {
          restoreOwner();
          controller.setMini(item.checked);
        },
      },
      {
        label: "Поверх всех окон",
        type: "checkbox",
        checked: state.alwaysOnTop,
        click: (item) => controller.setAlwaysOnTop(item.checked),
      },
      { type: "separator" },
      {
        label: "Скрыть в трей",
        click: () => {
          companion?.close(false);
          win.hide();
        },
      },
      { label: "Выйти", click: () => app.quit() },
    ]),
  );
}
function publish(state) {
  if (!win || win.isDestroyed()) return;
  win.webContents.send("window:state", {
    ...state,
    companion: Boolean(companion?.isActive()),
    trayAvailable: Boolean(tray && !tray.isDestroyed()),
  });
  const floating = companion?.getWindow();
  if (floating && !floating.isDestroyed())
    floating.setAlwaysOnTop(state.alwaysOnTop);
  updateTray();
  scheduleSave();
}
function installIPC() {
  const handlers = {
    "window:get-state": () => ({
      ...controller.state(),
      companion: Boolean(companion?.isActive()),
      trayAvailable: Boolean(tray && !tray.isDestroyed()),
    }),
    "window:set-companion": async (value) => {
      if (typeof value !== "boolean")
        throw new TypeError("companion must be boolean");
      if (value) await enableCompanion();
      else restoreOwner();
      return { ...controller.state(), companion: companion.isActive() };
    },
    "window:minimize": () => controller.minimize(),
    "window:toggle-maximize": () => {
      restoreOwner();
      return controller.toggleMaximize();
    },
    "window:set-mini": (value) => {
      restoreOwner();
      return controller.setMini(value);
    },
    "window:set-always-on-top": (value) => controller.setAlwaysOnTop(value),
    "window:hide-to-tray": () => {
      if (!tray || tray.isDestroyed())
        throw new Error(
          "Системный трей недоступен. Используй сворачивание в панель задач.",
        );
      companion?.close(false);
      win.hide();
      return controller.state();
    },
    "window:close": () => {
      win.close();
    },
  };
  for (const [channel, handler] of Object.entries(handlers))
    ipcMain.handle(channel, (event, value) => {
      if (!win || !isTrustedFrame(event, win.webContents, devURL))
        throw new Error("Untrusted window command");
      return handler(value);
    });
}
function restoreOwner() {
  companion?.close(false);
  if (!quitting && win && !win.isDestroyed()) controller.show();
}
async function enableCompanion() {
  if (!companionSnapshot)
    throw new Error("Маскот ещё загружается. Попробуй снова.");
  return companion.enable();
}
function installCompanionIPC() {
  ipcMain.on("companion:publish", (event, input) => {
    if (!win || !isTrustedFrame(event, win.webContents, devURL)) return;
    try {
      companionSnapshot = sanitizeCompanionSnapshot(input);
    } catch {
      return;
    }
    const surface = companion?.getWindow();
    if (surface && !surface.isDestroyed())
      surface.webContents.send("companion:snapshot", companionSnapshot);
  });
  const trustedSurface = (event) => {
    const surface = companion?.getWindow();
    return (
      surface &&
      !surface.isDestroyed() &&
      isTrustedFrame(event, surface.webContents, devURL)
    );
  };
  ipcMain.handle("companion:pointer-state", (event) => {
    if (!trustedSurface(event)) throw new Error("Untrusted companion");
    return pointerControllers.get(companion.getWindow()).state();
  });
  ipcMain.handle("companion:set-pointer", (event, value) => {
    if (!trustedSurface(event)) throw new Error("Untrusted companion");
    return pointerControllers.get(companion.getWindow()).setEnabled(value);
  });
  ipcMain.on("companion:hit-map", (event, input) => {
    if (!trustedSurface(event)) return;
    pointerControllers.get(companion.getWindow()).update(input);
  });
  const trustedDictation = (event) =>
    trustedSurface(event) ||
    (win && isTrustedFrame(event, win.webContents, devURL));
  ipcMain.handle("dictation:start", (event) => {
    if (!trustedDictation(event))
      throw new Error("Untrusted microphone command");
    return dictation.start(event.sender);
  });
  ipcMain.handle("dictation:stop", (event) => {
    if (!trustedDictation(event))
      throw new Error("Untrusted microphone command");
    dictation.stop(event.sender);
  });
  ipcMain.handle("companion:ready", (event) => {
    if (!trustedSurface(event)) throw new Error("Untrusted companion");
    companion.getWindow().webContents.emit("companion:renderer-ready");
    return true;
  });
  ipcMain.handle("companion:get-snapshot", (event) => {
    if (!trustedSurface(event)) throw new Error("Untrusted companion");
    return companionSnapshot;
  });
  ipcMain.handle("companion:action", (event, input) => {
    if (!trustedSurface(event) || !win || win.isDestroyed())
      throw new Error("Untrusted companion");
    const action = sanitizeCompanionAction(input);
    if (action.type === "restore") {
      restoreOwner();
      return true;
    }
    if (action.type === "close") {
      app.quit();
      return true;
    }
    if (action.type === "minimize") {
      companion.getWindow().minimize();
      return true;
    }
    if (action.type === "maximize") {
      restoreOwner();
      controller.toggleMaximize();
      return true;
    }
    if (action.type === "settings" || action.type === "settings-widget") {
      restoreOwner();
      win.webContents.send("companion:owner-action", action);
      return true;
    }
    if (action.type === "send" && companionSnapshot?.pending) return false;
    // Owner renderer has a synchronous in-flight guard; it alone calls APIs/TTS.
    win.webContents.send("companion:owner-action", action);
    return true;
  });
}
function createCompanionSurface() {
  const area = companionBounds
    ? screen.getDisplayMatching(companionBounds).workArea
    : screen.getDisplayMatching(win.getBounds()).workArea;
  const surface = new BrowserWindow({
    ...fitCompanionBounds(companionBounds, area),
    title: "clippyXam — маскот",
    icon: iconPath,
    frame: false,
    transparent: true,
    backgroundColor: "#00000000",
    hasShadow: false,
    roundedCorners: false,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    show: false,
    skipTaskbar: false,
    alwaysOnTop: controller.state().alwaysOnTop,
    webPreferences: {
      preload: path.join(__dirname, "companion-preload.cjs"),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
      spellcheck: false,
      partition: "clippyxam-memory",
    },
  });
  surface.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  surface.webContents.on("will-navigate", (event) => event.preventDefault());
  surface.webContents.on("will-attach-webview", (event) =>
    event.preventDefault(),
  );
  const surfaceContents = surface.webContents;
  for (const event of ["hide", "minimize"])
    surface.on(event, () => dictation.stop(surfaceContents));
  pointerControllers.set(
    surface,
    createPointerController({
      window: surface,
      getCursor: () => screen.getCursorScreenPoint(),
      changed: (state) => {
        if (!surface.isDestroyed() && !surfaceContents.isDestroyed())
          surfaceContents.send("companion:pointer-state", state);
      },
    }),
  );
  const ready = waitForCompanionReady(surface, `${devURL}?view=companion`);
  return { window: surface, ready };
}
function openAllowedURL(url) {
  if (!EXTERNAL_URLS.has(url)) return;
  shell
    .openExternal(url)
    .catch(() =>
      console.warn("Не удалось открыть ссылку во внешнем браузере."),
    );
}
async function createWindow() {
  const prefs = loadPreferences();
  companionBounds = prefs.companionBounds;
  const candidate = prefs[prefs.mini ? "miniBounds" : "fullBounds"];
  const area = candidate
    ? screen.getDisplayMatching(candidate).workArea
    : screen.getPrimaryDisplay().workArea;
  const bounds = fitBounds(candidate, area, prefs.mini);
  win = new BrowserWindow({
    ...bounds,
    minWidth: Math.min(320, area.width),
    minHeight: Math.min(400, area.height),
    title: "clippyXam",
    icon: iconPath,
    frame: false,
    roundedCorners: false,
    transparent: false,
    backgroundColor: "#c0c0c0",
    show: false,
    resizable: true,
    maximizable: true,
    alwaysOnTop: prefs.alwaysOnTop,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
      spellcheck: false,
      backgroundThrottling: false, // Hidden owner still owns reply/return timers; overlay never duplicates them.
      partition: "clippyxam-memory", // in-memory session; no persistent API credentials
    },
  });
  Menu.setApplicationMenu(null);
  controller = createWindowController(win, screen, prefs, publish);
  companion = createCompanionController({
    createSurface: createCompanionSurface,
    hideOwner: () => {
      if (!quitting) win.hide();
    },
    showOwner: () => {
      if (!quitting && win && !win.isDestroyed()) controller.show();
    },
    changed: () => {
      if (win && !win.isDestroyed()) controller.emit();
    },
    saveBounds: (bounds) => {
      companionBounds = fitCompanionBounds(
        bounds,
        screen.getDisplayMatching(bounds).workArea,
      );
      scheduleSave();
    },
    failed: (message) => dialog.showErrorBox("clippyXam", message),
  });
  installIPC();
  installCompanionIPC();
  win.webContents.session.setPermissionRequestHandler(
    (_wc, _permission, callback) => callback(false),
  );
  win.webContents.session.setPermissionCheckHandler(() => false);
  win.webContents.setWindowOpenHandler(({ url }) => {
    openAllowedURL(url);
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (event, url) => {
    if (url !== devURL) {
      event.preventDefault();
      openAllowedURL(url);
    }
  });
  win.webContents.on("will-attach-webview", (event) => event.preventDefault());
  if (!app.isPackaged) {
    const origin = new URL(devURL).origin;
    win.webContents.session.webRequest.onHeadersReceived(
      (details, callback) => {
        if (new URL(details.url).origin !== origin)
          return callback({ responseHeaders: details.responseHeaders });
        callback({
          responseHeaders: {
            ...details.responseHeaders,
            "Content-Security-Policy": [contentSecurityPolicy(false, devURL)],
          },
        });
      },
    );
  }

  try {
    tray = new Tray(nativeImage.createFromPath(iconPath));
    tray.setToolTip("clippyXam — помощник с характером");
    tray.on("double-click", restoreOwner);
    tray.on("click", restoreOwner);
    updateTray();
  } catch {
    tray = null;
    console.warn(
      "Трей недоступен; окно остаётся доступным через панель задач.",
    );
  }
  for (const event of [
    "maximize",
    "unmaximize",
    "minimize",
    "restore",
    "focus",
    "blur",
  ])
    win.on(event, () => controller.emit());
  for (const event of ["resize", "move"]) win.on(event, scheduleSave);
  for (const event of ["hide", "minimize"])
    win.on(event, () => dictation.stop(win.webContents));
  win.on("close", savePreferences);
  win.on("closed", () => {
    quitting = true;
    dictation.stop();
    companion?.dispose();
    win = null;
    app.quit();
  });
  win.webContents.on("did-finish-load", () => controller.emit());
  win.webContents.on("render-process-gone", () => {
    dialog.showErrorBox(
      "clippyXam",
      "Интерфейс остановился. Закрой приложение и запусти его снова.",
    );
    app.quit();
  });
  win.once("ready-to-show", () => {
    win.show();
    controller.emit();
  });
  await win.loadURL(devURL);
}
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on("second-instance", () => {
    if (controller && win) restoreOwner();
  });
  app
    .whenReady()
    .then(async () => {
      if (app.isPackaged) {
        const root = path.join(__dirname, "..", "dist");
        session
          .fromPartition("clippyxam-memory")
          .protocol.handle("clippyxam", async (request) => {
            try {
              if (request.method !== "GET")
                return new Response("Method not allowed", { status: 405 });
              const file = bundleFile(request.url, root);
              const response = await net.fetch(pathToFileURL(file).href);
              const headers = new Headers(response.headers);
              headers.set(
                "Content-Security-Policy",
                contentSecurityPolicy(true, devURL),
              );
              return new Response(response.body, {
                status: response.status,
                headers,
              });
            } catch {
              return new Response("Not found", { status: 404 });
            }
          });
      }
      await createWindow();
      for (const event of ["display-removed", "display-metrics-changed"])
        screen.on(event, () => {
          if (win && !win.isDestroyed()) controller.repairBounds();
          const surface = companion?.getWindow();
          if (surface && !surface.isDestroyed())
            surface.setBounds(
              fitCompanionBounds(
                surface.getBounds(),
                screen.getDisplayMatching(surface.getBounds()).workArea,
              ),
            );
        });
    })
    .catch((error) => {
      dialog.showErrorBox(
        "clippyXam — ошибка запуска",
        "Не удалось загрузить окно. Перезапусти приложение.\n" + error.message,
      );
      app.quit();
      process.exitCode = 1;
    });
  app.on("before-quit", () => {
    quitting = true;
    dictation.stop();
    companion?.dispose();
    clearTimeout(saveTimer);
    savePreferences();
    if (tray && !tray.isDestroyed()) tray.destroy();
  });
  app.on("window-all-closed", () => app.quit());
}
