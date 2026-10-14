import { useEffect, useRef, useState } from "react";
import {
  MousePointer2,
  ArrowUpLeft,
  Coffee,
  GripHorizontal,
  Send,
  Square,
  Volume2,
  VolumeX,
} from "lucide-react";
import Mascot from "./Mascot";
import SpeechText from "./SpeechText";
import { RudeHand } from "./Icons";
import type { CharacterId } from "../lib/characters";
import { characters } from "../lib/characters";
import type {
  PointerState,
  CompanionAction,
  CompanionSnapshot,
} from "../lib/companion";

export function CompanionScene({
  snapshot,
  onAction,
  preview = false,
  pointer,
  onTogglePointer,
}: {
  snapshot: CompanionSnapshot;
  onAction: (action: CompanionAction) => Promise<boolean>;
  preview?: boolean;
  pointer?: PointerState;
  onTogglePointer?: () => void;
}) {
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const [changing, setChanging] = useState<CharacterId | null>(null);
  useEffect(() => {
    if (!changing) return;
    if (snapshot.character === changing) {
      setChanging(null);
      return;
    }
    const timer = window.setTimeout(() => {
      setChanging(null);
      setError(
        "Смена персонажа не подтверждена. Верни XP-окно и проверь связь.",
      );
    }, 4000);
    return () => window.clearTimeout(timer);
  }, [changing, snapshot.character]);
  const character = characters.find((item) => item.id === snapshot.character)!;
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  async function act(action: CompanionAction) {
    try {
      const accepted = await onAction(action);
      if (active.current)
        setError(accepted ? "" : "Предыдущая реплика ещё обрабатывается.");
      return accepted;
    } catch {
      if (active.current)
        setError(
          "Нет связи с XP-окном. Верни его через панель задач или трей.",
        );
      return false;
    }
  }
  const actionRef = useRef(act);
  actionRef.current = act;
  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !event.defaultPrevented) {
        event.preventDefault();
        void actionRef.current({ type: "restore" });
      }
    };
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, []);
  return (
    <section className="companion-scene" aria-label="Маскот на рабочем столе">
      <header className="companion-controls" data-companion-hit>
        <span className="companion-drag">
          <GripHorizontal size={15} />
          <b>{character.name}</b>
          <small>{preview ? "предпросмотр" : "на рабочем столе"}</small>
        </span>
        {pointer && (
          <button
            aria-label="Пропуск кликов через пустые области"
            aria-pressed={pointer.enabled}
            disabled={!pointer.available}
            title={
              pointer.available
                ? "Экспериментально: пропуск кликов только через пустые области"
                : "Доступно в Windows/macOS"
            }
            onClick={onTogglePointer}
          >
            <MousePointer2 size={15} />
          </button>
        )}
        <button
          onClick={() => void act({ type: "toggle-sound" })}
          aria-label={
            snapshot.sound
              ? "Выключить озвучку маскота"
              : "Включить озвучку маскота"
          }
          title={snapshot.quiet ? "Тихие часы" : "Озвучка"}
        >
          {snapshot.sound && !snapshot.quiet ? (
            <Volume2 size={16} />
          ) : (
            <VolumeX size={16} />
          )}
        </button>
        <button
          className="return-xp"
          onClick={() => void act({ type: "restore" })}
          aria-label="Вернуть XP-окно"
          title="Вернуть XP-окно · Esc"
        >
          <ArrowUpLeft size={14} /> XP
        </button>
      </header>
      <div
        className={`companion-art phase-${snapshot.phase}`}
        data-away={snapshot.away}
      >
        {snapshot.phase !== "away" && (
          <div className="companion-balloon" data-companion-hit role="status">
            <SpeechText text={snapshot.bubble} range={snapshot.highlight} />
          </div>
        )}
        {snapshot.phase === "away" && (
          <div className="companion-away" data-companion-hit>
            <Coffee size={25} />
            <b>Демонстративно ушёл.</b>
            <span>Вернётся через {snapshot.seconds} с</span>
            <button
              className="xp-button"
              onClick={() => void act({ type: "return" })}
            >
              Позвать обратно
            </button>
          </div>
        )}
        <div className="companion-actor" data-companion-hit>
          <Mascot
            id={character.id}
            mood={snapshot.animationMood}
            size={character.id === "clippy" ? 224 : 182}
          />
          {snapshot.phase === "rude" && <RudeHand character={character.id} />}
        </div>
      </div>
      <div className="companion-chat" data-companion-hit>
        <div className="companion-quickbar">
          <label>
            Маскот
            <select
              aria-label="Персонаж на рабочем столе"
              value={changing || snapshot.character}
              disabled={Boolean(changing)}
              onChange={async (event) => {
                const next = event.target.value as CharacterId;
                if (next === snapshot.character) return;
                setChanging(next);
                if (
                  !(await act({ type: "select-character", character: next })) &&
                  active.current
                )
                  setChanging(null);
              }}
            >
              {characters.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
              <option disabled value="courtney">
                Courtney — нет ресурсов
              </option>
              <option disabled value="earl">
                Earl — нет ресурсов
              </option>
            </select>
          </label>
          <button
            type="button"
            className="companion-stop-voice"
            disabled={!snapshot.speechBusy}
            onClick={() => void act({ type: "stop-speech" })}
            aria-label="Остановить озвучку маскота"
            title="Остановить текущую озвучку и очередь, не выключая звук"
          >
            <Square size={11} />
            {snapshot.speechBusy
              ? snapshot.speaking
                ? "Стоп голос"
                : "Стоп TTS"
              : "Голос"}
          </button>
        </div>
        {(error || pointer?.error || snapshot.error || snapshot.notice) && (
          <p
            className="companion-notice"
            role={
              error || pointer?.error || snapshot.error ? "alert" : "status"
            }
          >
            {error || pointer?.error || snapshot.error || snapshot.notice}
          </p>
        )}
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            if (!text.trim() || sending || snapshot.pending || changing) return;
            setSending(true);
            setError("");
            const submitted = text;
            const accepted = await act({ type: "send", text: submitted });
            if (active.current) {
              if (accepted)
                setText((current) => (current === submitted ? "" : current));
              setSending(false);
            }
          }}
        >
          <input
            aria-label="Сообщение маскоту на рабочем столе"
            placeholder={
              snapshot.away
                ? "Можешь написать. Он выглянет…"
                : `Скажи что-нибудь ${character.name}…`
            }
            value={text}
            maxLength={2000}
            onChange={(event) => setText(event.target.value)}
          />
          {snapshot.pending && (
            <button
              type="button"
              className="cancel-reply"
              onClick={() => void act({ type: "cancel-reply" })}
              aria-label="Отменить ответ маскота"
            >
              Стоп
            </button>
          )}
          <button
            className="send-button"
            aria-label="Отправить маскоту на рабочем столе"
            disabled={
              !text.trim() || snapshot.pending || sending || Boolean(changing)
            }
          >
            {snapshot.pending || sending ? (
              <span className="sending-spinner" />
            ) : (
              <Send size={14} />
            )}
          </button>
        </form>
        <div className="companion-hint">
          <span>
            {snapshot.quiet
              ? "Тихие часы · только текст"
              : snapshot.pending
                ? "Подбирает слова…"
                : pointer?.enabled
                  ? "Пустые области пропускают клики"
                  : "Enter — отправить"}
          </span>
          <span>Esc — к XP-окну</span>
        </div>
      </div>
    </section>
  );
}

export function FloatingCompanion({
  snapshot,
  onAction,
}: {
  snapshot: CompanionSnapshot;
  onAction: (action: CompanionAction) => Promise<boolean>;
}) {
  const [passthrough, setPassthrough] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef<{
    x: number;
    y: number;
    left: number;
    top: number;
  } | null>(null);
  const [position, setPosition] = useState<{
    left: number;
    top: number;
  } | null>(null);
  useEffect(() => {
    const clamp = () =>
      setPosition((current) => {
        if (!current || !ref.current) return current;
        const box = ref.current.getBoundingClientRect();
        return {
          left: Math.max(
            0,
            Math.min(current.left, window.innerWidth - box.width),
          ),
          top: Math.max(
            0,
            Math.min(current.top, window.innerHeight - box.height - 35),
          ),
        };
      });
    window.addEventListener("resize", clamp);
    return () => window.removeEventListener("resize", clamp);
  }, []);
  return (
    <div
      ref={ref}
      className={`floating-companion ${passthrough ? "pointer-passthrough" : ""}`}
      style={
        position
          ? {
              left: position.left,
              top: position.top,
              right: "auto",
              bottom: "auto",
            }
          : undefined
      }
      onPointerDown={(event) => {
        if (
          !(event.target as HTMLElement).closest(".companion-drag") ||
          event.button !== 0 ||
          !ref.current
        )
          return;
        const rect = ref.current.getBoundingClientRect();
        drag.current = {
          x: event.clientX,
          y: event.clientY,
          left: rect.left,
          top: rect.top,
        };
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={(event) => {
        if (!drag.current || !ref.current) return;
        const rect = ref.current.getBoundingClientRect();
        setPosition({
          left: Math.max(
            0,
            Math.min(
              window.innerWidth - rect.width,
              drag.current.left + event.clientX - drag.current.x,
            ),
          ),
          top: Math.max(
            0,
            Math.min(
              window.innerHeight - rect.height - 35,
              drag.current.top + event.clientY - drag.current.y,
            ),
          ),
        });
      }}
      onPointerUp={() => {
        drag.current = null;
      }}
      onLostPointerCapture={() => {
        drag.current = null;
      }}
    >
      <CompanionScene
        snapshot={snapshot}
        onAction={onAction}
        preview
        pointer={{ available: true, enabled: passthrough, error: "" }}
        onTogglePointer={() => setPassthrough(!passthrough)}
      />
    </div>
  );
}
