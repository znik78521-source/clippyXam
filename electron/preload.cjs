// Sandboxed preload: expose capabilities, never raw IPC, filesystem or Node.
const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld(
  "clippyDesktop",
  Object.freeze({
    platform: process.platform,
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
