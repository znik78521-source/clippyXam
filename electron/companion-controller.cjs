/** Window lifecycle only. The original renderer remains the sole owner of chat/TTS. */
function createCompanionController({
  createSurface,
  hideOwner,
  showOwner,
  changed,
  saveBounds,
  failed,
}) {
  let surface = null,
    active = false,
    generation = 0,
    disposed = false,
    opening = null;
  function close(restore = true) {
    generation++;
    const old = surface;
    surface = null;
    active = false;
    opening = null;
    if (old && !old.isDestroyed()) {
      saveBounds(old.getBounds());
      old.destroy();
    }
    if (restore && !disposed) showOwner();
    if (!disposed) changed(false);
  }
  async function enable() {
    if (disposed) throw new Error("Companion controller is disposed");
    if (opening) return opening;
    if (active && surface && !surface.isDestroyed()) {
      surface.show();
      surface.focus();
      return true;
    }
    const token = ++generation;
    const job = createSurface();
    surface = job.window;
    const own = surface;
    own.on("closed", () => {
      if (surface !== own || disposed) return;
      surface = null;
      active = false;
      opening = null;
      generation++;
      showOwner();
      changed(false);
    });
    own.on("move", () => {
      if (surface === own && !disposed) saveBounds(own.getBounds());
    });
    own.webContents.on("render-process-gone", () => {
      if (surface !== own || disposed) return;
      close();
      failed("Прозрачное окно остановилось. Возвращено обычное XP-окно.");
    });
    const promise = (async () => {
      try {
        await job.ready;
        if (
          disposed ||
          token !== generation ||
          surface !== own ||
          own.isDestroyed()
        )
          return false;
        active = true;
        own.show();
        own.focus();
        hideOwner();
        changed(true);
        return true;
      } catch (error) {
        if (!disposed && token === generation) {
          close();
          throw error;
        }
        return false;
      } finally {
        if (token === generation) opening = null;
      }
    })();
    opening = promise;
    return promise;
  }
  return {
    enable,
    close,
    getWindow: () => surface,
    isActive: () => active,
    dispose() {
      disposed = true;
      close(false);
    },
  };
}
/** Native paint alone also fires for error/blank pages. Require the React view too. */
function waitForCompanionReady(surface, url, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    let painted = false,
      rendered = false,
      settled = false;
    const finish = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      surface.removeListener("ready-to-show", onPaint);
      surface.removeListener("closed", onClose);
      surface.webContents.removeListener("companion:renderer-ready", onRender);
      surface.webContents.removeListener("render-process-gone", onCrash);
      error ? reject(error) : resolve();
    };
    const check = () => {
      if (painted && rendered) finish();
    };
    const onPaint = () => {
      painted = true;
      check();
    };
    const onRender = () => {
      rendered = true;
      check();
    };
    const onClose = () => finish(new Error("Companion closed before ready"));
    const onCrash = () => finish(new Error("Companion renderer failed"));
    const timeout = setTimeout(
      () => finish(new Error("Companion load timeout")),
      timeoutMs,
    );
    surface.on("ready-to-show", onPaint);
    surface.on("closed", onClose);
    surface.webContents.on("companion:renderer-ready", onRender);
    surface.webContents.on("render-process-gone", onCrash);
    try {
      surface.loadURL(url).catch(finish);
    } catch (error) {
      finish(error);
    }
  });
}
module.exports = { createCompanionController, waitForCompanionReady };
