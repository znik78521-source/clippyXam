// Optional coarse hit testing. Cursor coordinates stay in main, never in chat/IPC.
function sanitizeHitMap(value) {
  if (
    !value ||
    !Array.isArray(value.rects) ||
    value.rects.length > 8 ||
    !Number.isFinite(value.width) ||
    !Number.isFinite(value.height) ||
    value.width < 1 ||
    value.height < 1 ||
    value.width > 8192 ||
    value.height > 8192 ||
    typeof value.interacting !== "boolean"
  )
    throw new TypeError("Invalid hit map");
  const rects = value.rects.map((r) => {
    if (
      !r ||
      !["x", "y", "width", "height"].every((k) => Number.isFinite(r[k])) ||
      r.x < 0 ||
      r.y < 0 ||
      r.width <= 0 ||
      r.height <= 0 ||
      r.x + r.width > value.width + 1 ||
      r.y + r.height > value.height + 1
    )
      throw new TypeError("Invalid hit rectangle");
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  });
  const masks = value.masks === undefined ? [] : value.masks;
  if (!Array.isArray(masks) || masks.length > 2)
    throw new TypeError("Invalid alpha masks");
  const cleanMasks = masks.map((m) => {
    if (
      !m ||
      !["x", "y", "width", "height"].every((k) => Number.isFinite(m[k])) ||
      m.x < 0 ||
      m.y < 0 ||
      m.width <= 0 ||
      m.height <= 0 ||
      m.x + m.width > value.width + 1 ||
      m.y + m.height > value.height + 1 ||
      !Number.isInteger(m.columns) ||
      !Number.isInteger(m.rows) ||
      m.columns < 1 ||
      m.rows < 1 ||
      m.columns > 512 ||
      m.rows > 512 ||
      !Array.isArray(m.bits) ||
      m.bits.length !== Math.ceil((m.columns * m.rows) / 8) ||
      m.bits.some((b) => !Number.isInteger(b) || b < 0 || b > 255)
    )
      throw new TypeError("Invalid alpha mask");
    return {
      x: m.x,
      y: m.y,
      width: m.width,
      height: m.height,
      columns: m.columns,
      rows: m.rows,
      bits: [...m.bits],
    };
  });
  return {
    width: value.width,
    height: value.height,
    interacting: value.interacting,
    rects,
    ...(value.masks !== undefined ? { masks: cleanMasks } : {}),
  };
}
function hitsControls(point, bounds, map) {
  const x = ((point.x - bounds.x) * map.width) / bounds.width;
  const y = ((point.y - bounds.y) * map.height) / bounds.height;
  // Permanent recovery strips, even with an empty/misreported DOM map.
  if (
    x >= 0 &&
    x <= map.width &&
    ((y >= 0 && y <= 64) || (y >= map.height - 110 && y <= map.height))
  )
    return true;
  return (
    (map.masks || []).some((m) => {
      if (x < m.x || y < m.y || x >= m.x + m.width || y >= m.y + m.height)
        return false;
      const column = Math.floor(((x - m.x) * m.columns) / m.width),
        row = Math.floor(((y - m.y) * m.rows) / m.height),
        i = row * m.columns + column;
      return Boolean(m.bits[i >> 3] & (1 << (i & 7)));
    }) ||
    map.rects.some(
      (r) =>
        x >= r.x - 6 &&
        x <= r.x + r.width + 6 &&
        y >= r.y - 6 &&
        y <= r.y + r.height + 6,
    )
  );
}
function createPointerController({
  window,
  getCursor,
  platform = process.platform,
  changed = () => {},
  now = () => performance.now(),
  schedule = (fn) => setInterval(fn, 50),
  cancel = clearInterval,
}) {
  // BrowserWindow.webContents is a native getter: accessing it after closed
  // can throw "Object has been destroyed". Keep the emitter for cleanup.
  const contents = window.webContents;
  const available = platform === "win32" || platform === "darwin";
  let enabled = false,
    disposed = false,
    ignored = false,
    map = null,
    received = 0,
    started = 0,
    heldSince = null,
    timer = null,
    error = "";
  const state = () => ({ available, enabled, error });
  function apply(value, force = false) {
    if ((!force && ignored === value) || window.isDestroyed()) return;
    // forward is supported on Windows/macOS. Polling is still authoritative.
    window.setIgnoreMouseEvents(value, { forward: true });
    ignored = value;
  }
  function disable(message = "") {
    enabled = false;
    error = message;
    map = null;
    heldSince = null;
    if (timer !== null) {
      cancel(timer);
      timer = null;
    }
    try {
      apply(false, true);
    } catch {
      error = "Не удалось вернуть клики. Верни основное окно через трей.";
    }
    if (!disposed) changed(state());
    return state();
  }
  function tick() {
    if (disposed || !enabled) return;
    if (window.isDestroyed()) {
      dispose();
      return;
    }
    const time = now();
    if (time - (map ? received : started) > 1250) {
      disable("Пропуск кликов отключён: интерфейс не отвечает.");
      return;
    }
    if (heldSince !== null && time - heldSince > 10000) {
      disable("Пропуск кликов отключён после долгого взаимодействия с окном.");
      return;
    }
    try {
      apply(
        Boolean(
          map &&
          !map.interacting &&
          !hitsControls(getCursor(), window.getContentBounds(), map),
        ),
      );
    } catch {
      disable("Пропуск кликов отключён из-за ошибки окна.");
    }
  }
  function setEnabled(value) {
    if (typeof value !== "boolean") throw new TypeError("Boolean required");
    if (disposed) throw new Error("Pointer controller disposed");
    if (!value) return disable();
    if (!available)
      throw new Error("Click-through unavailable on this platform");
    if (enabled) return state();
    enabled = true;
    error = "";
    map = null;
    started = now();
    timer = schedule(tick);
    changed(state());
    return state();
  }
  function update(input) {
    if (disposed || !enabled) return;
    try {
      const next = sanitizeHitMap(input);
      received = now();
      heldSince = next.interacting ? (heldSince ?? received) : null;
      map = next;
      tick();
    } catch {
      disable("Пропуск кликов отключён: неверные области интерфейса.");
    }
  }
  function invalidate() {
    map = null;
    started = now();
    try {
      apply(false);
    } catch {
      disable("Ошибка окна. Верни основное окно через трей.");
    }
  }
  function dispose() {
    if (disposed) return;
    disposed = true;
    disable();
    for (const [event, fn] of events) window.removeListener(event, fn);
    contents.removeListener("did-start-loading", reset);
  }
  const reset = () => disable();
  const events = [
    ["closed", dispose],
    ["move", invalidate],
    ["resize", invalidate],
    ["unresponsive", reset],
    ["hide", reset],
    ["minimize", reset],
  ];
  for (const [event, fn] of events) window.on(event, fn);
  contents.on("did-start-loading", reset);
  return { state, setEnabled, update, dispose };
}
module.exports = { sanitizeHitMap, hitsControls, createPointerController };
