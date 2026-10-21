import type { ClippyArt } from "./authored-clippy";
import type { ComicScene } from "./comedy";
export function isComicScene(name: string): name is ComicScene {
  return name === "WindowsPrank" || name === "BatBonk";
}
export const sceneDuration = (name: ComicScene) =>
  name === "WindowsPrank" ? 5.2 : 3.8;
/** New key drawings, not legacy sprite clips. All props/effects stay inside this canvas. */
export function drawComicScene(
  ctx: CanvasRenderingContext2D,
  art: ClippyArt,
  name: ComicScene,
  elapsed: number,
  width: number,
  height: number,
) {
  ctx.clearRect(0, 0, width, height);
  const windows = name === "WindowsPrank";
  const contact = windows ? 1.55 : 0.8;
  const image = windows
    ? elapsed < contact
      ? art.windowsArmed
      : art.windowsPunchline
    : elapsed < contact
      ? art.batWindup
      : art.batStrike;
  const h = Math.min(235, height - 12, width * 0.75);
  const w = (h * image.width) / image.height;
  const age = elapsed - contact;
  const bounce =
    age > 0 ? Math.sin(age * 24) * Math.exp(-age * 7) * (windows ? 2 : 6) : 0;
  const bend =
    elapsed < contact
      ? Math.sin((elapsed / contact) * Math.PI) * (windows ? 2 : 6)
      : bounce;
  // Local flexing; no whole-picture rotation. Preserve the source aspect ratio.
  for (let row = 0; row < image.height; row += 3) {
    const p = row / image.height,
      stripe = Math.min(3, image.height - row);
    ctx.drawImage(
      image,
      0,
      row,
      image.width,
      stripe,
      (width - w) / 2 + bend * (1 - p) ** 1.7,
      (height - h) / 2 + p * h,
      w,
      (stripe / image.height) * h + 0.3,
    );
  }
  if (!windows && age > 0 && age < 1.0) {
    // Brief cracks on the mascot's stage only; no desktop overlay or window damage.
    ctx.save();
    ctx.globalAlpha = Math.min(1, (1 - age) * 2);
    ctx.strokeStyle = "#666";
    ctx.lineWidth = 1;
    const x = width * 0.22,
      y = height * 0.6;
    for (let i = 0; i < 5; i++) {
      const a = i * 1.25;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + Math.cos(a) * 14, y + Math.sin(a) * 14);
      ctx.lineTo(x + Math.cos(a + 0.3) * 28, y + Math.sin(a + 0.3) * 28);
      ctx.stroke();
    }
    ctx.restore();
  }
  ctx.font = "10px Tahoma, sans-serif";
  ctx.textAlign = "center";
  ctx.fillStyle = "#444";
  ctx.fillText(
    windows
      ? age < 0
        ? "БУТАФОРСКАЯ КНОПКА"
        : "НИЧЕГО НЕ ПОДКЛЮЧЕНО"
      : "БУТАФОРСКАЯ БИТА",
    width / 2,
    height - 3,
  );
  return age < 0 ? "anticipation" : age < 0.25 ? "contact" : "punchline";
}
