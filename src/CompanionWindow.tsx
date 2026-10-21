import { useWidgetPointer } from "./lib/useWidgetPointer";
import { useEffect, useState } from "react";

import { CompanionScene } from "./components/CompanionScene";
import { initialCompanionSnapshot } from "./lib/companion";
import type { CompanionAction } from "./lib/companion";

/** Passive view only: no API keys, chat engine, timers or speech synthesis here. */
export default function CompanionWindow() {
  const [loaded, setLoaded] = useState(false);
  const [snapshot, setSnapshot] = useState(initialCompanionSnapshot);
  const pointer = useWidgetPointer(
    Boolean(loaded && snapshot.clickThrough),
    Boolean(
      snapshot.away ||
      (snapshot.animation &&
        !(snapshot.character === "clippy" && snapshot.authoredClippy)) ||
      ["peeking", "offended", "rude"].includes(snapshot.phase),
    ),
  );
  useEffect(() => {
    const bridge = window.clippyCompanion;
    if (!bridge) return;
    let active = true,
      received = false;
    const remove = bridge.onSnapshot((next) => {
      received = true;
      if (active) {
        setSnapshot(next);
        setLoaded(true);
      }
    });
    bridge
      .getSnapshot()
      .then((next) => {
        if (active && !received && next) {
          setSnapshot(next);
          setLoaded(true);
        }
      })
      .catch(() => {
        if (active)
          setSnapshot((current) => ({
            ...current,
            error:
              "Не удалось подключиться. Верни основное окно через трей или панель задач.",
          }));
      });
    return () => {
      active = false;
      remove();
    };
  }, []);
  useEffect(() => {
    if (loaded) void window.clippyCompanion?.ready().catch(() => {});
  }, [loaded]);
  return (
    <CompanionScene
      snapshot={{ ...snapshot, notice: pointer.error || snapshot.notice }}
      widget
      native
      onAction={(action: CompanionAction) =>
        window.clippyCompanion?.action(action) || Promise.resolve(false)
      }
    />
  );
}
