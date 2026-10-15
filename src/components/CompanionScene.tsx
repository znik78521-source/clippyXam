import { useEffect, useRef, useState } from "react";
import { Mic, Square, Settings, Minus, X, Maximize2 } from "lucide-react";
import Mascot from "./Mascot";
import Cinematic from "./Cinematic";
import PeekAnimation from "./PeekAnimation";
import SpeechText from "./SpeechText";
import { RudeHand } from "./Icons";
import { useDictation } from "../lib/useDictation";
import type { CompanionAction, CompanionSnapshot } from "../lib/companion";

export function CompanionScene({
  snapshot,
  onAction,
  widget = false,
  native = false,
  inactive = false,
}: {
  snapshot: CompanionSnapshot;
  onAction: (action: CompanionAction) => Promise<boolean>;
  widget?: boolean;
  native?: boolean;
  inactive?: boolean;
}) {
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const submittedRef = useRef<{ text: string; sequence: number } | null>(null);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const dictation = useDictation(
    (value) =>
      setText((current) =>
        ((current ? current + " " : "") + value).slice(0, 2000),
      ),
    setError,
  );
  const previousCharacter = useRef(snapshot.character);
  useEffect(() => {
    dictation.stop();
    if (previousCharacter.current !== snapshot.character) {
      setText("");
      submittedRef.current = null;
    }
    previousCharacter.current = snapshot.character;
    setError("");
  }, [snapshot.character]);
  useEffect(() => {
    const submitted = submittedRef.current,
      result = snapshot.sendResult;
    if (!result) return;
    if (!submitted) {
      if (!result.success && result.text)
        setText((current) => current || result.text!);
      return;
    }
    if (result.sequence <= submitted.sequence) return;
    if (result.success)
      setText((current) => (current === submitted.text ? "" : current));
    else setText((current) => current || result.text || submitted.text);
    submittedRef.current = null;
  }, [snapshot.sendResult?.sequence, snapshot.sendResult?.success]);
  async function act(action: CompanionAction) {
    try {
      return await onAction(action);
    } catch {
      if (alive.current)
        setError(
          "Команда недоступна. Верни окно через трей или повторный запуск.",
        );
      return false;
    }
  }
  const actionRef = useRef(act);
  actionRef.current = act;
  useEffect(() => {
    if (!widget) return;
    const escape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !e.defaultPrevented) {
        e.preventDefault();
        dictation.stop();
        void actionRef.current({ type: "restore" });
      }
    };
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, [widget]);
  return (
    <section
      className={`nt-companion ${widget ? "nt-widget" : ""} ${inactive ? "nt-inactive" : ""} ${native ? "nt-window-native" : ""}`}
      aria-label="Помощник clippyXam"
    >
      <header className="nt-caption" data-companion-hit>
        <span className="nt-drag">
          <img src="/favicon.svg" alt="" />
          clippyXam
        </span>
        <div className="nt-window-buttons">
          <button
            aria-label="Свернуть"
            title="Свернуть"
            onClick={() => {
              dictation.stop();
              void act({ type: "minimize" });
            }}
          >
            <Minus size={13} />
          </button>
          <button
            aria-label={widget ? "Вернуть обычное окно" : "Развернуть"}
            title={widget ? "Вернуть обычное окно" : "Развернуть"}
            onClick={() => {
              dictation.stop();
              void act({ type: widget ? "restore" : "maximize" });
            }}
          >
            <Maximize2 size={12} />
          </button>
          <button
            aria-label="Закрыть приложение"
            title="Закрыть"
            onClick={() => {
              dictation.stop();
              void act({ type: "close" });
            }}
          >
            <X size={13} />
          </button>
        </div>
      </header>
      <div
        className={`nt-stage phase-${snapshot.phase}`}
        data-away={snapshot.away}
        data-cinematic={snapshot.cinematic?.kind}
      >
        <div className="nt-balloon" data-companion-hit role="status">
          {snapshot.phase === "away" ? (
            <span>
              Ушёл остыть. Вернётся через {snapshot.seconds} с.{" "}
              <button
                className="nt-text-button"
                onClick={() => void act({ type: "return" })}
              >
                Позвать
              </button>
            </span>
          ) : (
            <SpeechText text={snapshot.bubble} range={snapshot.highlight} />
          )}
          {snapshot.speechBusy && (
            <button
              className="nt-stop-speech"
              title="Остановить озвучку"
              aria-label="Остановить озвучку"
              onClick={() => void act({ type: "stop-speech" })}
            >
              <Square size={10} />
            </button>
          )}
        </div>
        <div className="nt-actor" data-companion-hit>
          <PeekAnimation
            active={
              snapshot.phase === "peeking" ||
              (snapshot.phase === "rude" && snapshot.away)
            }
            rude={snapshot.phase === "rude"}
          >
            <Mascot
              id={snapshot.character}
              speechLevel={snapshot.speechLevel}
              mood={snapshot.animationMood}
              size={snapshot.character === "clippy" ? 205 : 176}
            />
            {snapshot.phase === "rude" && (
              <RudeHand character={snapshot.character} />
            )}
          </PeekAnimation>
        </div>
        {snapshot.cinematic && (
          <Cinematic
            key={snapshot.cinematic.id}
            kind={snapshot.cinematic.kind}
          />
        )}
      </div>
      <footer className="nt-composer" data-companion-hit>
        {(error || snapshot.error || snapshot.notice) && (
          <p
            className="nt-notice"
            role={error || snapshot.error ? "alert" : "status"}
          >
            {error || snapshot.error || snapshot.notice}
          </p>
        )}
        {dictation.listening && (
          <p className="nt-listening" role="status">
            Слушаю… Нажми микрофон ещё раз, чтобы отменить.
          </p>
        )}
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (
              !text.trim() ||
              snapshot.pending ||
              sending ||
              dictation.listening
            )
              return;
            setSending(true);
            setError("");
            const submitted = text;
            submittedRef.current = {
              text: submitted,
              sequence: snapshot.sendResult?.sequence || 0,
            };
            const ok = await act({ type: "send", text: submitted });
            if (alive.current) {
              if (!ok) submittedRef.current = null;
              setSending(false);
            }
          }}
        >
          <input
            aria-label="Сообщение маскоту"
            placeholder={
              snapshot.pending ? "Думает…" : "Сообщение… Enter — отправить"
            }
            maxLength={2000}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          {snapshot.pending && (
            <button
              type="button"
              title="Отменить ответ"
              aria-label="Отменить ответ"
              onClick={() => void act({ type: "cancel-reply" })}
            >
              <Square size={12} />
            </button>
          )}
          <button
            type="button"
            aria-label={
              dictation.listening
                ? "Остановить голосовой ввод"
                : "Голосовой ввод"
            }
            aria-pressed={dictation.listening}
            title={
              native
                ? "Голосовой ввод Windows (русский распознаватель)"
                : "Голосовой ввод: браузер может передавать аудио своему сервису"
            }
            onClick={() => {
              setError("");
              void dictation.start();
            }}
          >
            <Mic size={16} />
          </button>
          <button
            type="button"
            aria-label="Настройки"
            title="Настройки"
            onClick={() => {
              dictation.stop();
              void act({ type: widget ? "settings-widget" : "settings" });
            }}
          >
            <Settings size={15} />
          </button>
        </form>
      </footer>
    </section>
  );
}
