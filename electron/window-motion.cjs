// Relative DIP velocity only. Never publish screen/cursor coordinates or window bounds.
function installWindowMotion(
  window,
  {
    now = () => performance.now(),
    schedule = setTimeout,
    cancel = clearTimeout,
  } = {},
) {
  let previous = window.getBounds(),
    last = now(),
    timer,
    serial = 0,
    moving = false;
  const clamp = (n) => Math.max(-4000, Math.min(4000, Math.round(n)));
  const send = (vx, vy, reset = false) => {
    if (!window.isDestroyed() && !window.webContents.isDestroyed())
      window.webContents.send("window:motion", {
        direction:
          Math.abs(vx) + Math.abs(vy) < 1
            ? "still"
            : Math.abs(vx) >= Math.abs(vy)
              ? vx > 0
                ? "right"
                : "left"
              : vy > 0
                ? "down"
                : "up",
        serial: ++serial,
        velocityX: clamp(vx),
        velocityY: clamp(vy),
        reset,
      });
  };
  const reset = () => {
    cancel(timer);
    timer = undefined;
    moving = false;
    if (window.isDestroyed()) return;
    previous = window.getBounds();
    last = now();
    send(0, 0, true);
  };
  const move = () => {
    if (window.isDestroyed()) return;
    const current = window.getBounds(),
      time = now(),
      dt = time - last;
    if (
      !window.isVisible() ||
      window.isMaximized?.() ||
      current.width !== previous.width ||
      current.height !== previous.height
    ) {
      reset();
      return;
    }
    // Coalesce native WM_MOVE bursts but retain their entire displacement.
    if (dt < 16) return;
    const dx = current.x - previous.x,
      dy = current.y - previous.y;
    if (!dx && !dy) return;
    previous = current;
    last = time;
    // Long idle intervals aren't the duration of the new drag. A resumed drag has
    // no timestamped starting position, so cap its first sample conservatively.
    const seconds = Math.max(0.016, Math.min(dt / 1000, moving ? 0.16 : 0.05));
    if (Math.abs(dx) > 900 || Math.abs(dy) > 900) {
      reset();
      return;
    } // monitor/layout jump
    moving = true;
    send(dx / seconds, dy / seconds);
    cancel(timer);
    timer = schedule(() => {
      moving = false;
      last = now();
      send(0, 0);
    }, 120);
  };
  const stop = () => {
    cancel(timer);
    window.removeListener("move", move);
    for (const event of [
      "hide",
      "minimize",
      "maximize",
      "unmaximize",
      "resize",
      "show",
      "restore",
    ])
      window.removeListener(event, reset);
  };
  window.on("move", move);
  for (const event of [
    "hide",
    "minimize",
    "maximize",
    "unmaximize",
    "resize",
    "show",
    "restore",
  ])
    window.on(event, reset);
  window.once("closed", stop);
  return stop;
}
module.exports = { installWindowMotion };
