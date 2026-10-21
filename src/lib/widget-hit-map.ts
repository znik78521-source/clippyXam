import type { HitMap } from "./companion";
export function packAlpha(rgba: Uint8ClampedArray): number[] {
  const bits = new Array(Math.ceil(rgba.length / 4 / 8)).fill(0);
  for (let i = 0; i < rgba.length / 4; i++)
    if (rgba[i * 4 + 3] >= 16) bits[i >> 3] |= 1 << (i & 7);
  return bits;
}
export function collectHitMap(interacting: boolean, complex = false): HitMap {
  const width = window.innerWidth,
    height = window.innerHeight;
  const rects: HitMap["rects"] = [],
    masks: NonNullable<HitMap["masks"]> = [];
  complex =
    complex ||
    Boolean(document.querySelector('canvas[data-inertia-active="true"]'));
  if (!complex)
    for (const canvas of document.querySelectorAll<HTMLCanvasElement>(
      "canvas[data-companion-alpha]",
    )) {
      const r = canvas.getBoundingClientRect();
      if (
        r.width < 1 ||
        r.height < 1 ||
        r.left < 0 ||
        r.top < 0 ||
        r.right > width ||
        r.bottom > height ||
        canvas.width > 512 ||
        canvas.height > 512
      )
        continue;
      try {
        const data = canvas
          .getContext("2d")
          ?.getImageData(0, 0, canvas.width, canvas.height);
        if (data)
          masks.push({
            x: r.left,
            y: r.top,
            width: r.width,
            height: r.height,
            columns: canvas.width,
            rows: canvas.height,
            bits: packAlpha(data.data),
          });
      } catch {
        /* Keep a conservative rectangle if pixels cannot be sampled. */
      }
      if (masks.length === 2) break;
    }
  for (const element of document.querySelectorAll<HTMLElement>(
    "[data-companion-hit]",
  )) {
    if (masks.length && element.classList.contains("nt-actor")) continue;
    const r = element.getBoundingClientRect();
    const x = Math.max(0, r.left),
      y = Math.max(0, r.top),
      right = Math.min(width, r.right),
      bottom = Math.min(height, r.bottom);
    if (right > x && bottom > y)
      rects.push({ x, y, width: right - x, height: bottom - y });
    if (rects.length === 8) break;
  }
  return { width, height, interacting, rects, masks };
}
