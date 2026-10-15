// Sandboxed preload: expose capabilities, never raw IPC, filesystem or Node.
const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld(
  "clippyDesktop",
  Object.freeze({
    onWindowMotion: (callback) => {
      if (typeof callback !== "function")
        throw new TypeError("Callback required");
      const listener = (_event, value) => callback(value);
      ipcRenderer.on("window:motion", listener);
      return () => ipcRenderer.removeListener("window:motion", listener);
    },
    startDictation: () => ipcRenderer.invoke("dictation:start"),
    stopDictation: () => ipcRenderer.invoke("dictation:stop"),
    platform: process.platform,
    openRouterRequest: (input) =>
      ipcRenderer.invoke("openrouter:request", input),
    openRouterCancel: (id) => ipcRenderer.invoke("openrouter:cancel", id),
    loadSettings: () => ipcRenderer.invoke("preferences:load"),
    saveSettings: (value) => ipcRenderer.invoke("preferences:save", value),
    getStartup: () => ipcRenderer.invoke("startup:get"),
    setStartup: (value) => ipcRenderer.invoke("startup:set", value),
    loadSavedKey: () => ipcRenderer.invoke("key:load"),
    saveKey: (key) => ipcRenderer.invoke("key:save", key),
    localVoiceState: () => ipcRenderer.invoke("voice:state"),
    prepareLocalVoice: () => ipcRenderer.invoke("voice:prepare"),
    synthesizeLocalVoice: (text, rate) =>
      ipcRenderer.invoke("voice:synthesize", text, rate),
    stopLocalVoice: () => ipcRenderer.invoke("voice:stop"),
    onLocalVoiceState: (callback) => {
      if (typeof callback !== "function")
        throw new TypeError("Callback required");
      const listener = (_event, state) => callback(state);
      ipcRenderer.on("voice:state-changed", listener);
      return () => ipcRenderer.removeListener("voice:state-changed", listener);
    },
    getState: () => ipcRenderer.invoke("window:get-state"),
    setCompanion: (value) => ipcRenderer.invoke("window:set-companion", value),
    publishCompanion: (snapshot) =>
      ipcRenderer.send("companion:publish", snapshot),
    onCompanionAction: (callback) => {
      if (typeof callback !== "function")
        throw new TypeError("Callback required");
      const listener = (_event, action) => callback(action);
      ipcRenderer.on("companion:owner-action", listener);
      return () =>
        ipcRenderer.removeListener("companion:owner-action", listener);
    },
    minimize: () => ipcRenderer.invoke("window:minimize"),
    toggleMaximize: () => ipcRenderer.invoke("window:toggle-maximize"),
    close: () => ipcRenderer.invoke("window:close"),
    hideToTray: () => ipcRenderer.invoke("window:hide-to-tray"),
    setMini: (value) => ipcRenderer.invoke("window:set-mini", value),
    setAlwaysOnTop: (value) =>
      ipcRenderer.invoke("window:set-always-on-top", value),
    onState: (callback) => {
      if (typeof callback !== "function")
        throw new TypeError("A callback is required");
      const listener = (_event, state) => callback(state);
      ipcRenderer.on("window:state", listener);
      return () => ipcRenderer.removeListener("window:state", listener);
    },
  }),
);
