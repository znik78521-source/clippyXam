// Only direction is sent to the renderer; screen/cursor coordinates never leave main.
function installWindowMotion(
  window,
  { now = Date.now, schedule = setTimeout, cancel = clearTimeout } = {},
) {
  let previous = window.getBounds(),
    last = 0,
    timer,
    serial = 0;
  const send = (direction) => {
    if (!window.isDestroyed() && !window.webContents.isDestroyed())
      window.webContents.send("window:motion", { direction, serial: ++serial });
  };
  const move = () => {
    if (window.isDestroyed()) return;
    const current = window.getBounds(),
      dx = current.x - previous.x,
      dy = current.y - previous.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 3 || now() - last < 70) return;
    previous = current;
    last = now();
    if (!window.isVisible() || window.isMaximized?.()) return;
    send(
      Math.abs(dx) >= Math.abs(dy)
        ? dx > 0
          ? "right"
          : "left"
        : dy > 0
          ? "down"
          : "up",
    );
    cancel(timer);
    timer = schedule(() => send("still"), 180);
  };
  const stop = () => {
    cancel(timer);
    window.removeListener("move", move);
  };
  window.on("move", move);
  window.once("closed", stop);
  return stop;
}
module.exports = { installWindowMotion };
