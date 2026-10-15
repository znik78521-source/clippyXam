// No generic IPC or access to the chat provider: commands are validated in main.
const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld(
  "clippyCompanion",
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
    getPointerState: () => ipcRenderer.invoke("companion:pointer-state"),
    setPointerPassthrough: (value) =>
      ipcRenderer.invoke("companion:set-pointer", value),
    publishHitMap: (map) => ipcRenderer.send("companion:hit-map", map),
    onPointerState: (callback) => {
      if (typeof callback !== "function")
        throw new TypeError("Callback required");
      const listener = (_event, state) => callback(state);
      ipcRenderer.on("companion:pointer-state", listener);
      return () =>
        ipcRenderer.removeListener("companion:pointer-state", listener);
    },
    ready: () => ipcRenderer.invoke("companion:ready"),
    getSnapshot: () => ipcRenderer.invoke("companion:get-snapshot"),
    action: (action) => ipcRenderer.invoke("companion:action", action),
    onSnapshot: (callback) => {
      if (typeof callback !== "function")
        throw new TypeError("Callback required");
      const listener = (_event, snapshot) => callback(snapshot);
      ipcRenderer.on("companion:snapshot", listener);
      return () => ipcRenderer.removeListener("companion:snapshot", listener);
    },
  }),
);
