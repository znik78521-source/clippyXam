const { fitBounds, sanitizePreferences } = require("./window-policy.cjs");

function createWindowController(win, screen, saved, notify = () => {}) {
  const prefs = sanitizePreferences(saved);
  function currentArea(bounds = win.getBounds()) {
    return screen.getDisplayMatching(bounds).workArea;
  }
  function capture() {
    if (!win.isMaximized() && !win.isMinimized())
      prefs[prefs.mini ? "miniBounds" : "fullBounds"] = win.getBounds();
  }
  function state() {
    return {
      mini: prefs.mini,
      alwaysOnTop: win.isAlwaysOnTop(),
      maximized: win.isMaximized(),
      minimized: win.isMinimized(),
      focused: win.isFocused(),
    };
  }
  function emit() {
    notify(state());
    return state();
  }
  function resizeForMode(bounds) {
    const area = currentArea(bounds || win.getBounds());
    win.setMinimumSize(Math.min(320, area.width), Math.min(400, area.height));
    win.setBounds(fitBounds(bounds, area, prefs.mini));
  }
  function setMini(value) {
    if (typeof value !== "boolean") throw new TypeError("mini must be boolean");
    if (prefs.mini === value) return emit();
    capture();
    if (win.isMaximized()) win.unmaximize();
    if (win.isMinimized()) win.restore();
    prefs.mini = value;
    resizeForMode(prefs[value ? "miniBounds" : "fullBounds"]);
    win.show();
    capture();
    return emit();
  }
  function setAlwaysOnTop(value) {
    if (typeof value !== "boolean")
      throw new TypeError("alwaysOnTop must be boolean");
    prefs.alwaysOnTop = value;
    win.setAlwaysOnTop(value);
    return emit();
  }
  function show() {
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
    return emit();
  }
  function repairBounds() {
    if (!win.isMaximized()) {
      resizeForMode(win.getBounds());
      capture();
    }
    return emit();
  }
  return {
    state,
    emit,
    capture,
    setMini,
    setAlwaysOnTop,
    show,
    repairBounds,
    minimize() {
      win.minimize();
      return emit();
    },
    toggleMaximize() {
      // A compact assistant stays compact; maximize first changes to the full room.

      if (win.isMaximized()) win.unmaximize();
      else win.maximize();
      return emit();
    },
    snapshot() {
      capture();
      return sanitizePreferences(prefs);
    },
  };
}
module.exports = { createWindowController };
