import { useEffect, useRef, useState } from "react";
import type { Mood } from "../lib/characters";
import type { WindowMotion } from "../lib/window-motion";
import { WindowInertia } from "../lib/window-inertia";
import { drawAuthoredClippy, loadClippyArt } from "../lib/authored-clippy";
export default function AuthoredClippy(props: {
  motion: WindowMotion;
  typingPulse: number;
  mood: Mood;
  autonomous?: boolean;
  animation?: { name: string; serial: number } | null;
}) {
  const canvas = useRef<HTMLCanvasElement>(null),
    controls = useRef(props);
  controls.current = props;
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const element = canvas.current!,
      ctx = element.getContext("2d", { willReadFrequently: true })!;
    const model = new WindowInertia(),
      media = matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0,
      disposed = false,
      last = performance.now(),
      previousMotion: WindowMotion | undefined,
      typingAt = -1000,
      lastPulse = 0,
      lastPreview = -1;
    let preview: { name: string; at: number } | null = null,
      idleAt = last + 3500,
      idleUntil = 0,
      idleIndex = 0;
    function resize() {
      const box = element.getBoundingClientRect();
      element.width = Math.round(Math.max(1, Math.min(4096, box.width)));
      element.height = Math.round(Math.max(1, Math.min(300, box.height)));
      const h = Math.min(200, element.height - 20);
      model.setBounds(
        element.width / 2 - (h * 0.464) / 2 - 7,
        Math.max(8, (element.height - h) / 2 - 4),
      );
    }
    const observer = new ResizeObserver(resize);
    observer.observe(element);
    resize();
    const reset = () => {
      model.reset();
      preview = null;
      typingAt = -1000;
    };
    const visibility = () => {
      if (document.hidden) reset();
    };
    window.addEventListener("blur", reset);
    document.addEventListener("visibilitychange", visibility);
    loadClippyArt()
      .then((art) => {
        if (disposed) return;
        function tick(now: number) {
          if (disposed) return;
          const dt = (now - last) / 1000;
          last = now;
          const c = controls.current;
          model.setEnabled(!media.matches);
          if (c.motion !== previousMotion) {
            previousMotion = c.motion;
            preview = null;
            if (c.motion.reset) model.reset();
            else
              model.velocity(c.motion.velocityX ?? 0, c.motion.velocityY ?? 0);
          }
          if (c.typingPulse !== lastPulse) {
            lastPulse = c.typingPulse;
            typingAt = now;
            idleUntil = 0;
            idleAt = now + 5000;
          }
          if (c.animation && c.animation.serial !== lastPreview) {
            lastPreview = c.animation.serial;
            preview = { name: c.animation.name, at: now };
          }
          if (media.matches) {
            preview = null;
            idleUntil = 0;
          } else if (preview) {
            const elapsed = (now - preview.at) / 1000;
            if (preview.name === "Curious") {
              idleUntil = now + 50;
              idleIndex = 1;
              if (elapsed > 2) preview = null;
            } else {
              const duration =
                preview.name === "InertiaGentle"
                  ? 3.4
                  : preview.name === "InertiaLean"
                    ? 0.85
                    : preview.name === "InertiaImpact"
                      ? 0.075
                      : 0;
              if (duration) {
                const t = elapsed / duration;
                model.velocity(
                  t < 1 ? (250 / duration) * 6 * t * (1 - t) : 0,
                  0,
                );
                if (t >= 1) preview = null;
              } else preview = null;
            }
          }
          const state = model.advance(dt),
            moving =
              Math.abs(state.x) +
                Math.abs(state.y) +
                Math.abs(state.vx) +
                Math.abs(state.vy) +
                Math.abs(state.bend) >
                1 || !!state.impact;
          if (moving) {
            idleUntil = 0;
            idleAt = now + 5000;
          }
          if (
            !media.matches &&
            c.autonomous &&
            c.mood === "idle" &&
            !moving &&
            !preview &&
            now >= idleAt
          ) {
            idleIndex++;
            idleUntil = now + 2300;
            idleAt = now + 10000 + Math.random() * 2500;
          }
          const idle = !media.matches && now < idleUntil && !moving,
            elapsed = (now - typingAt) / 1000;
          const typing =
            !media.matches && elapsed < 0.2
              ? Math.sin(elapsed * 65) * Math.exp(-elapsed * 19) * 1.4
              : 0;
          const curious = idle && idleIndex % 2 === 1;
          const idleBend = idle && !curious ? Math.sin(now / 350) * 3 : 0;
          const breath =
            !media.matches && (idle || c.mood === "speaking")
              ? Math.sin(now / 160) * 0.7
              : 0;
          drawAuthoredClippy(ctx, art, state, element.width, element.height, {
            typing,
            idleBend,
            curious,
            breath,
          });
          element.dataset.inertiaActive = String(
            moving || Math.abs(typing) > 0.05,
          );
          element.dataset.motionState = state.impact
            ? "impact"
            : Math.abs(state.bend) > 4
              ? "lean"
              : moving
                ? "sway"
                : "rest";
          element.dataset.bend = state.bend.toFixed(2);
          element.dataset.offset = state.x.toFixed(2);
          element.dataset.impact = state.impact?.side || "";
          element.dataset.typingShake = typing.toFixed(2);
          element.dataset.authoredAction = curious
            ? "Curious"
            : idle
              ? "Stretch"
              : state.impact
                ? "Impact"
                : moving
                  ? "Inertia"
                  : "Neutral";
          element.dataset.frame = String(
            Number(element.dataset.frame || 0) + 1,
          );
          element.dataset.ready = "true";
          frame = requestAnimationFrame(tick);
        }
        frame = requestAnimationFrame(tick);
      })
      .catch(() => {
        if (!disposed) setFailed(true);
      });
    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("blur", reset);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, []);
  return (
    <div className="authored-clippy" role="img" aria-label="clippy">
      <canvas
        ref={canvas}
        className="mascot-canvas"
        data-artwork="authored"
        data-companion-alpha
      />
      {failed && (
        <span className="artwork-error" role="status">
          Не загрузилась новая отрисовка. Исходный режим доступен в настройках.
        </span>
      )}
    </div>
  );
}
