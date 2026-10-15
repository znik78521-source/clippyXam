import {
  moodActions,
  motionActions,
  nextIdle,
} from "../lib/original-animations";
import type { WindowMotion } from "../lib/useWindowMotion";
import { useEffect, useRef, useState } from "react";
import type { CharacterId, Mood } from "../lib/characters";

import { SpritePlayer } from "../lib/animation";
import type { SpriteData, SpriteFrame } from "../lib/animation";

type LoadedSprite = { data: SpriteData; map: string; image: HTMLImageElement };
const cache = new Map<CharacterId, Promise<LoadedSprite>>();
function load(id: CharacterId) {
  if (!cache.has(id))
    cache.set(
      id,
      (async () => {
        const map = `/agents/${id}/map.png`;
        const response = await fetch(`/agents/${id}/agent.json`);
        if (!response.ok) throw new Error(`Could not load ${id}`);
        const data = (await response.json()) as SpriteData;
        const image = new Image();
        image.src = map;
        await image.decode();
        return { data, map, image };
      })(),
    );
  return cache.get(id)!;
}
export default function Mascot({
  id,
  mood = "idle",
  size = 250,
  thumbnail = false,
  autonomous = false,
  animation = null,
  typingPulse = 0,
  motion = { direction: "still", serial: 0 },
}: {
  id: CharacterId;
  mood?: Mood;
  size?: number;
  thumbnail?: boolean;
  autonomous?: boolean;
  animation?: { name: string; serial: number } | null;
  typingPulse?: number;
  motion?: WindowMotion;
}) {
  const [sprite, setSprite] = useState<LoadedSprite | null>(null);
  const [frame, setFrame] = useState<SpriteFrame>({
    duration: 100,
    images: [[0, 0]],
  });
  const controls = useRef({ mood, autonomous, animation, typingPulse, motion });
  controls.current = { mood, autonomous, animation, typingPulse, motion };
  const [shake, setShake] = useState(0);
  const [action, setAction] = useState("RestPose");
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let disposed = false;
    setSprite(null);
    setFailed(false);
    load(id)
      .then((result) => {
        if (!disposed) setSprite(result);
      })
      .catch(() => {
        cache.delete(id);
        if (!disposed) setFailed(true);
      });
    return () => {
      disposed = true;
    };
  }, [id]);
  useEffect(() => {
    if (!sprite) return;
    const player = new SpritePlayer(sprite.data);
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    let timer: ReturnType<typeof setTimeout>;
    let disposed = false;
    let idleAt = performance.now() + 3500,
      idleUntil = 0,
      idleName = "",
      lastIdle = "",
      previewSerial = -1,
      previewUntil = 0,
      previewName = "",
      lastPulse = 0,
      shakeUntil = 0,
      motionAt = 0,
      lastDirection = "still",
      lastMood: Mood = "idle",
      releaseAt = 0,
      heldFrame = 0;
    let movementFrames: SpriteFrame[] = [];
    function tick() {
      if (disposed) return;
      const now = performance.now(),
        c = controls.current;
      if (thumbnail || media.matches) {
        player.reset();
        setFrame(sprite!.data.animations.RestPose.frames[0]);
        setAction("RestPose");
        setShake(0);
      } else {
        if (c.typingPulse !== lastPulse) {
          lastPulse = c.typingPulse;
          shakeUntil = now + 170;
          idleUntil = 0;
          idleAt = now + 7000;
        }
        setShake(
          now < shakeUntil
            ? Math.floor((shakeUntil - now) / 35) % 2
              ? 1.5
              : -1.5
            : 0,
        );
        if (c.animation && c.animation.serial !== previewSerial) {
          previewSerial = c.animation.serial;
          previewName = c.animation.name;
          previewUntil = now + 7000;
        }
        if (c.motion.direction !== lastDirection) {
          if (c.motion.direction === "still") releaseAt = now;
          else {
            motionAt = now;
            movementFrames =
              sprite!.data.animations[
                motionActions[id][c.motion.direction][0]
              ]?.frames.filter((f) => f.images?.length) || [];
          }
          lastDirection = c.motion.direction;
        }
        if (c.mood !== lastMood) {
          idleUntil = 0;
          lastMood = c.mood;
          idleAt = now + 5000;
        }
        let name = "RestPose";
        if (c.motion.direction !== "still") {
          const sequence = motionActions[id][c.motion.direction];
          name = sequence[0];
          idleUntil = 0;
          idleAt = now + 6000;
        } else if (now < shakeUntil)
          name =
            id === "rover"
              ? "ClickedOn"
              : id === "merlin"
                ? "Hearing_1"
                : "Hearing_1";
        else if (now < previewUntil) name = previewName;
        else if (c.mood !== "idle")
          name = moodActions[id][c.mood] || "RestPose";
        else if (c.autonomous) {
          if (now >= idleAt) {
            idleName = nextIdle(id, lastIdle);
            lastIdle = idleName;
            idleUntil = now + 6500;
            idleAt = idleUntil + 6500 + Math.random() * 3500;
          }
          if (now < idleUntil) name = idleName;
        }
        player.request(name, now, 60000);
        setAction(name);
        if (c.motion.direction !== "still" && movementFrames.length) {
          heldFrame = Math.min(
            Math.max(1, Math.floor(movementFrames.length * 0.6)),
            Math.floor((now - motionAt) / 55),
          );
          setFrame(
            movementFrames[Math.min(heldFrame, movementFrames.length - 1)],
          );
        } else if (movementFrames.length && now - releaseAt < 350) {
          const index = Math.floor(heldFrame * (1 - (now - releaseAt) / 350));
          setAction("Settle");
          setFrame(
            movementFrames[
              Math.max(0, Math.min(index, movementFrames.length - 1))
            ],
          );
        } else setFrame(player.tick(now));
      }
      if (!thumbnail) timer = setTimeout(tick, 32);
    }
    tick();
    return () => {
      disposed = true;
      clearTimeout(timer);
      player.reset();
    };
  }, [sprite, id, thumbnail]);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !sprite) return;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    for (const [x, y] of (frame.images || []).slice(
      0,
      sprite.data.overlayCount || 1,
    ))
      context.drawImage(
        sprite.image,
        x,
        y,
        canvas.width,
        canvas.height,
        0,
        0,
        canvas.width,
        canvas.height,
      );
    canvas.dataset.frame = String(Number(canvas.dataset.frame || 0) + 1);
  }, [sprite, frame]);
  if (!sprite)
    return (
      <div
        className="sprite-placeholder"
        style={{ width: size, height: size * 0.8 }}
        aria-label={
          failed ? "Не удалось загрузить маскота" : "Загрузка маскота"
        }
      >
        {failed ? "⚠" : <span className="pixel-loader" />}
      </div>
    );
  const [width, height] = sprite.data.framesize;
  const scale = size / Math.max(width, height);
  return (
    <div
      className={`mascot-sprite ${thumbnail ? "thumbnail" : ""}`}
      data-original-animation={action}
      data-typing-pulse={typingPulse}
      role="img"
      aria-label={id}
      style={{ width: width * scale, height: height * scale }}
    >
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        data-companion-alpha
        className="mascot-canvas"
        data-typing-shake={shake}
        style={{
          width: width * scale,
          height: height * scale,
          transform: shake ? `translateX(${shake}px)` : undefined,
        }}
      />
    </div>
  );
}
