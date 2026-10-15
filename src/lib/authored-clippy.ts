import type { InertiaState } from "./window-inertia";
export const authoredActions = [
  "InertiaGentle",
  "InertiaLean",
  "InertiaImpact",
  "Curious",
];
export const authoredLabels: Record<string, string> = {
  InertiaGentle: "Плавное движение",
  InertiaLean: "Средняя скорость — наклон",
  InertiaImpact: "Сильный рывок — удар",
  Curious: "Любопытство",
};
export type ClippyArt = Record<
  "neutral" | "left" | "right" | "curious",
  HTMLImageElement
>;
let cache: Promise<ClippyArt> | undefined;
export function loadClippyArt() {
  return (cache ??= (async () => {
    const entries = await Promise.all(
      Object.entries({
        neutral: "neutral",
        left: "impact-left",
        right: "impact-right",
        curious: "curious",
      }).map(async ([key, name]) => {
        const image = new Image();
        image.src = `/authored/clippy/${name}.png`;
        await image.decode();
        return [key, image];
      }),
    );
    return Object.fromEntries(entries) as ClippyArt;
  })().catch((error) => {
    cache = undefined;
    throw error;
  }));
}
export function drawAuthoredClippy(
  ctx: CanvasRenderingContext2D,
  art: ClippyArt,
  s: InertiaState,
  width: number,
  height: number,
  options: {
    typing: number;
    idleBend: number;
    curious: boolean;
    breath: number;
  },
) {
  ctx.clearRect(0, 0, width, height);
  const h = Math.min(200, height - 20),
    w = h * 0.464,
    hit = s.impact,
    age = hit?.age ?? 10;
  const horizontal = hit && (hit.side === "left" || hit.side === "right");
  const cx = width / 2 + s.x,
    cy = height / 2 + s.y;
  const strength = hit ? hit.strength * Math.exp(-age * 12) : 0;
  if (horizontal && age < 0.125) {
    const pose = hit!.side === "left" ? art.left : art.right;
    const iw = w * (1.2 + hit!.strength * 0.12),
      ih = Math.min(h * 0.9, (iw * pose.height) / pose.width);
    const wall = hit!.side === "left" ? 5 : width - 5;
    const t = Math.max(0, Math.min(1, (age - 0.075) / 0.05)),
      recovery = t * t * (3 - 2 * t);
    const center =
      (hit!.side === "left" ? wall + iw / 2 : wall - iw / 2) * (1 - recovery) +
      cx * recovery;
    // Individually generated left/right poses, not reflection of the same drawing.
    ctx.drawImage(pose, center - iw / 2, cy - ih / 2, iw, ih);
  } else {
    const source = options.curious ? art.curious : art.neutral;
    const dh = h * (1 - (horizontal ? 0.05 : 0.18) * strength) + options.breath,
      dw = w * (1 + (horizontal ? 0.1 : 0.2) * strength);
    const bend = s.bend + options.typing + options.idleBend;
    for (let row = 0; row < source.height; row += 3) {
      const p = row / source.height,
        shift = bend * (1 - p) ** 1.7,
        stripe = Math.min(3, source.height - row);
      ctx.drawImage(
        source,
        0,
        row,
        source.width,
        stripe,
        cx - dw / 2 + shift,
        cy - dh / 2 + p * dh,
        dw,
        (stripe / source.height) * dh + 0.35,
      );
    }
  }
  if (hit && age < 0.2) {
    const opacity = (1 - age / 0.2) * 0.7;
    ctx.strokeStyle = `rgba(90,83,60,${opacity})`;
    ctx.lineWidth = 1.2;
    const edge =
        hit.side === "left" ? 5 : hit.side === "right" ? width - 5 : cx,
      y =
        hit.side === "top"
          ? 5
          : hit.side === "bottom"
            ? height - 5
            : cy - h * 0.3;
    const sign = hit.side === "right" ? -1 : 1;
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.moveTo(edge + sign * (4 + i * 5), y - 4 - i * 6);
      ctx.lineTo(edge + sign * (9 + i * 7), y - 11 - i * 7);
      ctx.stroke();
    }
  }
}
