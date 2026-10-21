import { useEffect, useRef, useState } from "react";
import { collectHitMap } from "./widget-hit-map";
import type { PointerState } from "./companion";
export function useWidgetPointer(enabled: boolean, complex: boolean) {
  const [state, setState] = useState<PointerState>({
    available: false,
    enabled: false,
    error: "",
  });
  const complexRef = useRef(complex);
  complexRef.current = complex;
  useEffect(() => {
    const bridge = window.clippyCompanion;
    if (!bridge?.setPointerPassthrough) return;
    let active = true,
      held = false,
      nativeEnabled = false;
    const update = (s: PointerState) => {
      if (active) {
        nativeEnabled = s.enabled;
        setState(s);
      }
    };
    const off = bridge.onPointerState(update);
    const publish = () => {
      if (!active || !enabled || !nativeEnabled) return;
      try {
        bridge.publishHitMap(collectHitMap(held, complexRef.current));
      } catch {
        void bridge
          .setPointerPassthrough(false)
          .then(update)
          .catch(() => {});
      }
    };
    const down = () => {
        held = true;
        publish();
      },
      up = () => {
        ((held = false), (nativeEnabled = false));
        publish();
      };
    window.addEventListener("pointerdown", down, true);
    window.addEventListener("pointerup", up, true);
    window.addEventListener("pointercancel", up, true);
    window.addEventListener("blur", up);
    void bridge
      .setPointerPassthrough(enabled)
      .then((s) => {
        update(s);
        publish();
      })
      .catch(() => {
        if (active)
          setState({
            available: false,
            enabled: false,
            error:
              "Не удалось включить пропуск кликов. Окно остаётся доступным.",
          });
      });
    const timer = enabled ? setInterval(publish, 100) : undefined;
    return () => {
      active = false;
      clearInterval(timer);
      off();
      window.removeEventListener("pointerdown", down, true);
      window.removeEventListener("pointerup", up, true);
      window.removeEventListener("pointercancel", up, true);
      window.removeEventListener("blur", up);
      void bridge.setPointerPassthrough(false).catch(() => {});
    };
  }, [enabled]);
  return state;
}
