import { useEffect, useRef, useState } from "react";
import type { CharacterId, Mood } from "../lib/characters";

import { SpritePlayer } from "../lib/animation";
import type { SpriteData, SpriteFrame } from "../lib/animation";

type LoadedSprite = { data: SpriteData; map: string };
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
        return { data, map };
      })(),
    );
  return cache.get(id)!;
}
const animationNames: Record<CharacterId, Partial<Record<Mood, string>>> = {
  clippy: {
    idle: "IdleEyeBrowRaise",
    thinking: "Thinking",
    speaking: "Explain",
    offended: "LookRight",
    peeking: "LookLeft",
    rude: "GestureUp",
  },
  rover: {
    idle: "Idle",
    thinking: "Thinking",
    speaking: "Acknowledge",
    offended: "Embarrassed",
    peeking: "LookUpLeft",
    rude: "GetAttentionMinor",
  },
  merlin: {
    idle: "Blink",
    thinking: "Thinking",
    speaking: "Explain",
    offended: "Sad",
    peeking: "LookLeft",
    rude: "Decline",
  },
};
export default function Mascot({
  id,
  mood = "idle",
  size = 250,
  thumbnail = false,
}: {
  id: CharacterId;
  mood?: Mood;
  size?: number;
  thumbnail?: boolean;
}) {
  const [sprite, setSprite] = useState<LoadedSprite | null>(null);
  const [frame, setFrame] = useState<SpriteFrame>({
    duration: 100,
    images: [[0, 0]],
  });
  const moodRef = useRef(mood);
  moodRef.current = mood;
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
    function tick() {
      if (disposed) return;
      if (thumbnail || media.matches) {
        player.reset();
        setFrame(sprite!.data.animations.RestPose.frames[0]);
      } else {
        player.request(
          animationNames[id][moodRef.current] || "RestPose",
          performance.now(),
          moodRef.current === "idle" ? 6000 : 500,
        );
        setFrame(player.tick(performance.now()));
      }
      if (!thumbnail) timer = setTimeout(tick, 16);
    }
    tick();
    return () => {
      disposed = true;
      clearTimeout(timer);
      player.reset();
    };
  }, [sprite, id, thumbnail]);
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
      role="img"
      aria-label={id}
      style={{ width: width * scale, height: height * scale }}
    >
      <div
        style={{
          width,
          height,
          transform: `scale(${scale})`,
          transformOrigin: "top left",
          position: "relative",
        }}
      >
        {(frame.images || [])
          .slice(0, sprite.data.overlayCount || 1)
          .map(([x, y], i) => (
            <div
              key={i}
              style={{
                position: "absolute",
                inset: 0,
                width,
                height,
                backgroundImage: `url("${sprite.map}")`,
                backgroundPosition: `-${x}px -${y}px`,
                backgroundRepeat: "no-repeat",
              }}
            />
          ))}
      </div>
    </div>
  );
}
