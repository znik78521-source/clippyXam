import { useEffect, useState } from "react";
import { sanitizeWindowMotion } from "./window-motion";
import type { WindowMotion } from "./window-motion";
export type { WindowMotion } from "./window-motion";
export function useWindowMotion() {
  const [motion, setMotion] = useState<WindowMotion>({
    direction: "still",
    serial: 0,
    velocityX: 0,
    velocityY: 0,
  });
  useEffect(() => {
    const bridge = window.clippyCompanion || window.clippyDesktop;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const off = bridge?.onWindowMotion?.((value) => {
      const clean = sanitizeWindowMotion(value);
      if (!clean) return;
      clearTimeout(timer);
      setMotion(clean);
      // Renderer fail-safe if a final native stop message is lost. Not an auto-retry.
      if (clean.direction !== "still" && clean.velocityX !== undefined)
        timer = setTimeout(
          () =>
            setMotion({
              ...clean,
              direction: "still",
              velocityX: 0,
              velocityY: 0,
            }),
          300,
        );
    });
    return () => {
      off?.();
      clearTimeout(timer);
    };
  }, []);
  return motion;
}
