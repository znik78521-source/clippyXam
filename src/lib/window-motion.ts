import type { Direction } from "./original-animations";
export interface WindowMotion {
  direction: Direction;
  serial: number;
  velocityX?: number;
  velocityY?: number;
  reset?: boolean;
}
export function sanitizeWindowMotion(value: unknown): WindowMotion | null {
  if (!value || typeof value !== "object") return null;
  const v = value as WindowMotion;
  if (
    !["left", "right", "up", "down", "still"].includes(v.direction) ||
    !Number.isSafeInteger(v.serial) ||
    v.serial < 0
  )
    return null;
  const result: WindowMotion = {
    direction: v.direction,
    serial: v.serial,
    reset: v.reset === true,
  };
  if (v.velocityX !== undefined || v.velocityY !== undefined) {
    if (!Number.isFinite(v.velocityX) || !Number.isFinite(v.velocityY))
      return null;
    result.velocityX = Math.max(-4000, Math.min(4000, v.velocityX!));
    result.velocityY = Math.max(-4000, Math.min(4000, v.velocityY!));
  }
  return result;
}
