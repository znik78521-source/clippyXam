import { useEffect, useState } from "react";
import type { PointerState, HitMap } from "./companion";

/** Geometry only, never text, cursor coordinates or API credentials. */
export function measureHitMap(interacting: boolean): HitMap {
  const width = window.innerWidth,
    height = window.innerHeight;
  const rects = [...document.querySelectorAll("[data-companion-hit]")]
    .flatMap((el) => {
      const style = getComputedStyle(el);
      if (
        style.visibility === "hidden" ||
        style.display === "none" ||
        Number(style.opacity) === 0
      )
        return [];
      const box = el.getBoundingClientRect();
      const x = Math.max(0, box.left),
        y = Math.max(0, box.top);
      const right = Math.min(width, box.right),
        bottom = Math.min(height, box.bottom);
      return right > x && bottom > y
        ? [{ x, y, width: right - x, height: bottom - y }]
        : [];
    })
    .slice(0, 8);
  return { width, height, interacting, rects };
}
export function useCompanionPointer() {
  const [state, setState] = useState<PointerState>({
    available: false,
    enabled: false,
    error: "",
  });
  useEffect(() => {
    const bridge = window.clippyCompanion;
    if (!bridge?.getPointerState) return;
    let active = true,
      received = false;
    const remove = bridge.onPointerState((next) => {
      received = true;
      if (active) setState(next);
    });
    void bridge
      .getPointerState()
      .then((next) => {
        if (active && !received) setState(next);
      })
      .catch(() => {});
    return () => {
      active = false;
      remove();
    };
  }, []);
  useEffect(() => {
    const bridge = window.clippyCompanion;
    if (!state.enabled || !bridge) return;
    let interacting = false;
    // Native select popups may extend beyond the window. Keep capture while
    // focused; the main-process 10s interaction limit still applies.
    const publish = () =>
      bridge.publishHitMap(
        measureHitMap(
          interacting || document.activeElement?.tagName === "SELECT",
        ),
      );
    const down = () => {
      interacting = true;
      publish();
    };
    const up = () => {
      interacting = false;
      publish();
    };
    const stop = () => {
      void bridge.setPointerPassthrough(false).catch(() => {});
    };
    document.addEventListener("focusin", publish, true);
    document.addEventListener("focusout", publish, true);
    document.addEventListener("pointerdown", down, true);
    window.addEventListener("pointerup", up, true);
    window.addEventListener("pointercancel", up, true);
    window.addEventListener("blur", up);
    window.addEventListener("pagehide", stop);
    // Bounded lease: a frozen/unloaded renderer cannot leave an ignored window behind.
    publish();
    const timer = window.setInterval(publish, 250);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("focusin", publish, true);
      document.removeEventListener("focusout", publish, true);
      document.removeEventListener("pointerdown", down, true);
      window.removeEventListener("pointerup", up, true);
      window.removeEventListener("pointercancel", up, true);
      window.removeEventListener("blur", up);
      window.removeEventListener("pagehide", stop);
    };
  }, [state.enabled]);
  async function toggle() {
    try {
      await window.clippyCompanion?.setPointerPassthrough(!state.enabled);
    } catch {
      setState((current) => ({
        ...current,
        error:
          "Не удалось переключить пропуск кликов. Верни основное окно через трей.",
      }));
    }
  }
  return { state, toggle };
}
