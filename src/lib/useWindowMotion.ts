import { useEffect, useState } from "react";
import type { Direction } from "./original-animations";
export interface WindowMotion {
  direction: Direction;
  serial: number;
}
export function useWindowMotion() {
  const [motion, setMotion] = useState<WindowMotion>({
    direction: "still",
    serial: 0,
  });
  useEffect(() => {
    const bridge = window.clippyCompanion || window.clippyDesktop;
    return bridge?.onWindowMotion?.((value) => {
      if (["left", "right", "up", "down", "still"].includes(value.direction))
        setMotion(value);
    });
  }, []);
  return motion;
}
