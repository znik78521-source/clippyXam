import { TransportError } from "./lib/openrouter-transport";
import { useEffect, useRef, useState } from "react";
import { CompanionScene } from "./components/CompanionScene";
import TokenDialog from "./components/TokenDialog";
import type { CompanionAction, CompanionSnapshot } from "./lib/companion";
import Settings from "./components/Settings";
import type { SettingsData } from "./components/Settings";
import { characters } from "./lib/characters";
import type {
  Character,
  Intensity,
  Message,
  Mood,
  Reply,
} from "./lib/characters";
import { DEFAULT_MODEL, ChatError, requestReply } from "./lib/chat";
import { useDesktopWindow } from "./lib/desktop";
import {
  chooseAside,
  isApology,
  shortAside,
  requestsGentle,
  nextIrritation,
} from "./lib/behavior";

import {
  chooseCinematic,
  cinematicDuration,
  type CinematicKind,
} from "./lib/cinematics";
import { useFreeModels } from "./lib/useFreeModels";
import { useSpeech } from "./lib/useSpeech";
import {
  defaultPreferences,
  defaultVoiceMap,
  defaultCloudVoices,
  isQuietTime,
} from "./lib/preferences";

const localVoiceAvailable = Boolean(window.clippyDesktop?.synthesizeLocalVoice);
const time = () =>
  new Date().toLocaleTimeString("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
  });
const messageId = () =>
  Array.from(crypto.getRandomValues(new Uint32Array(4)), (value) =>
    value.toString(16),
  ).join("-");
const welcome = (character: Character): Message => ({
  id: messageId(),
  role: "assistant",
  content: character.intro,
  time: time(),
});
export default function App() {
  const modelCatalog = useFreeModels();
  const [character, setCharacter] = useState(characters[0]);
  const [messages, setMessages] = useState<Message[]>(() => [
    welcome(characters[0]),
  ]);

  const [phase, setPhase] = useState<Mood>("idle");
  const [bubble, setBubble] = useState(characters[0].quip);
  const [intensity, setIntensity] = useState<Intensity>("wild");
  const [sound, setSound] = useState(localVoiceAvailable);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [settings, setSettings] = useState<SettingsData>({
    character: "clippy",
    intensity: "wild",
    sound: localVoiceAvailable,
    widget: false,
    key: "",
    model: DEFAULT_MODEL,
    autoFallback: true,
    voice: "",
    rate: 1,
    ttsProvider: localVoiceAvailable ? "local" : "system",
    ttsKey: "",
    systemVoices: { ...defaultVoiceMap },
    cloudVoices: { ...defaultCloudVoices },
    companion: { ...defaultPreferences },
  });
  const [keyLoaded, setKeyLoaded] = useState(
    !window.clippyDesktop?.loadSavedKey,
  );
  useEffect(() => {
    let active = true;
    const bridge = window.clippyDesktop;
    if (!bridge?.loadSavedKey) return;
    void bridge
      .loadSavedKey()
      .then((result) => {
        if (!active) return;
        if (result.key)
          setSettings((current) => ({ ...current, key: result.key }));
        if (result.warning) setToast(result.warning);
      })
      .catch(() => {
        if (active) setToast("Не удалось загрузить сохранённый ключ.");
      })
      .finally(() => {
        if (active) setKeyLoaded(true);
      });
    return () => {
      active = false;
    };
  }, []);
  function persistKey(key: string) {
    void window.clippyDesktop
      ?.saveKey?.(key)
      .catch((error) =>
        setToast(
          error instanceof Error ? error.message : "Ключ не удалось сохранить.",
        ),
      );
  }
  const [cinematic, setCinematic] = useState<{
    kind: CinematicKind;
    id: number;
  } | null>(null);
  const cinematicCounter = useRef(0),
    lastCinematic = useRef(0);
  const [sendResult, setSendResult] = useState<{
    sequence: number;
    success: boolean;
    text?: string;
  }>({ sequence: 0, success: false });
  const [modal, setModal] = useState<"settings" | null>(null);
  const resumeWidget = useRef(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const desktop = useDesktopWindow(setToast);
  // A tray command must not hide mandatory key onboarding behind a keyless widget.
  useEffect(() => {
    if (desktop.state.companion && !settings.key.trim())
      desktop.setCompanion(false);
  }, [desktop.state.companion, settings.key]);
  const speech = useSpeech(setToast);
  const [voiceState, setVoiceState] = useState<
    import("./lib/desktop").LocalVoiceState | null
  >(null);
  useEffect(() => {
    const bridge = window.clippyDesktop;
    if (!bridge?.localVoiceState) return;
    let active = true;
    const update = (value: import("./lib/desktop").LocalVoiceState) => {
      if (active) setVoiceState(value);
    };
    const off = bridge.onLocalVoiceState?.(update);
    void bridge
      .localVoiceState()
      .then(update)
      .catch(() => {});
    return () => {
      active = false;
      off?.();
    };
  }, []);
  const [, setIrritation] = useState(0);
  const irritationRef = useRef(0);
  const threads = useRef<
    Partial<
      Record<Character["id"], { messages: Message[]; irritation: number }>
    >
  >({});
  const quiet = isQuietTime(settings.companion);
  const [awayUntil, setAwayUntil] = useState(0);
  const [seconds, setSeconds] = useState(0);
  const [minimized, setMinimized] = useState(false);
  const [floating, setFloating] = useState(false);
  const [maximized, setMaximized] = useState(false);
  const [, setClock] = useState(time());
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const request = useRef<AbortController | null>(null);
  const requestId = useRef(0);
  const awayRef = useRef(0);
  const speechSupported =
    typeof window !== "undefined" && "speechSynthesis" in window;

  function minimizeWindow() {
    if (desktop.native) desktop.minimize();
    else setMinimized(true);
  }
  function maximizeWindow() {
    if (desktop.native) desktop.toggleMaximize();
    else {
      setMaximized(!maximized);
    }
  }
  function closeWindow() {
    stopSpeech();
    if (desktop.native) desktop.close();
    else {
      setMinimized(true);
      setToast("Окно скрыто. Нажми «Вернуть окно».");
    }
  }

  const intensityRef = useRef(intensity);
  function changeIntensity(value: Intensity) {
    intensityRef.current = value;
    setIntensity(value);
    if (value === "soft" && phase === "rude") {
      clearTimers();
      setPhase(awayRef.current > Date.now() ? "away" : "idle");
    }
  }
  function clearTimers() {
    setCinematic(null);
    timers.current.forEach(clearTimeout);
    timers.current = [];
  }
  function later(callback: () => void, delay: number) {
    timers.current.push(setTimeout(callback, delay));
  }
  function playCinematic(kind: CinematicKind) {
    clearTimers();
    lastCinematic.current = Date.now();
    setCinematic({ kind, id: ++cinematicCounter.current });
    const vanish = kind === "jail" || kind === "burrow";
    if (vanish) {
      setPhase("offended");
      setAway(Date.now() + cinematicDuration[kind] + 9000);
    }
    later(() => {
      setCinematic(null);
      setPhase(awayRef.current > Date.now() ? "away" : "idle");
    }, cinematicDuration[kind]);
  }
  function setAway(value: number) {
    awayRef.current = value;
    setAwayUntil(value);
  }
  function stopSpeech() {
    speech.stop();
  }
  function updateIrritation(value: number) {
    irritationRef.current = Math.max(0, Math.min(100, value));
    setIrritation(irritationRef.current);
  }
  function cancelRequest() {
    requestId.current++;
    request.current?.abort();
    request.current = null;
    setPending(false);
  }
  function stopReply() {
    if (!request.current) return;
    cancelRequest();
    clearTimers();
    setError("");
    setPhase(awayRef.current > Date.now() ? "away" : "idle");
    setBubble("Ответ остановлен. Можешь написать другое сообщение.");
    setToast("Запрос отменён. Сообщение осталось в истории.");
  }
  function goHome(
    message = "Ладно, я вернулся. Скучал? Можешь не признаваться.",
  ) {
    clearTimers();
    if (awayRef.current) updateIrritation(irritationRef.current - 25);
    setAway(0);
    setSeconds(0);
    setPhase("idle");
    setBubble(message);
  }
  function speak(content: string) {
    if (!sound || isQuietTime(settings.companion)) return;
    const voice =
      settings.ttsProvider === "system"
        ? settings.systemVoices[character.id] || settings.voice
        : settings.cloudVoices[character.id];
    speech.enqueue(content, {
      provider: settings.ttsProvider,
      key: settings.ttsKey,
      voice,
      rate: settings.rate,
      character: character.id,
    });
  }
  function applyReply(incoming: Reply, forgiven = false) {
    const reply =
      (intensityRef.current === "soft" || !settings.companion.allowRude) &&
      incoming.mood === "rude"
        ? { ...incoming, mood: "speaking" as const }
        : incoming;
    clearTimers();
    setBubble(reply.text);
    speak(reply.text);
    if (forgiven) setAway(0);
    if (reply.leaveSeconds > 0 && !forgiven) {
      setPhase("offended");
      setAway(Date.now() + reply.leaveSeconds * 1000);
      setSeconds(reply.leaveSeconds);
      later(() => setPhase("away"), 1800);
    } else if (awayRef.current > Date.now()) {
      setPhase(reply.mood === "rude" ? "rude" : "peeking");
      later(() => setPhase("away"), 4500);
    } else {
      setPhase(reply.mood === "idle" ? "speaking" : reply.mood);
      later(
        () => setPhase("idle"),
        Math.min(9000, Math.max(3500, reply.text.length * 40)),
      );
    }
  }
  function newChat(
    next = character,
    remember = settings.companion.rememberSession,
  ) {
    cancelRequest();
    stopSpeech();
    clearTimers();
    setAway(0);
    setSeconds(0);
    if (remember && next.id !== character.id) {
      threads.current[character.id] = {
        messages: [...messages],
        irritation: irritationRef.current,
      };
      const remembered = threads.current[next.id];
      setMessages(remembered?.messages || [welcome(next)]);
      updateIrritation(remembered?.irritation || 0);
    } else {
      delete threads.current[next.id];
      setMessages([welcome(next)]);
      updateIrritation(0);
    }
    setCharacter(next);

    setError("");
    setPhase("idle");
    setBubble(next.quip);
    setModal(null);
  }
  async function send(provided?: string) {
    if (!settings.key.trim()) {
      setModal(null);
      setMinimized(false);
      return;
    }
    const content = (provided ?? "").trim();
    if (!content || pending || request.current || content.length > 2000) return;
    const gentle = requestsGentle(content);
    const effectiveIntensity = gentle ? "soft" : intensityRef.current;
    if (gentle) changeIntensity("soft");
    updateIrritation(nextIrritation(irritationRef.current, content));

    setError("");
    setPending(true);
    stopSpeech();
    clearTimers();
    const userMessageId = messageId();
    const history = [
      ...messages,
      { id: userMessageId, role: "user" as const, content, time: time() },
    ].slice(-100);
    setMessages(history);
    setPhase(awayRef.current > Date.now() ? "peeking" : "thinking");
    setBubble(
      awayRef.current > Date.now()
        ? "Я ушёл, но я всё слышу…"
        : "Секунду. Подбираю слова. Приличные закончились.",
    );
    const id = ++requestId.current;
    const controller = new AbortController();
    request.current = controller;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      let reply: Reply;
      if (gentle) {
        reply = {
          text: "Понял. Без подколов, мата и жестов. Переключился в мягкий режим.",
          mood: "speaking",
          leaveSeconds: 0,
        };
      } else {
        timeout = setTimeout(() => controller.abort("timeout"), 45000);
        reply = await requestReply({
          ...settings,
          character,
          intensity: effectiveIntensity,
          irritation: irritationRef.current,
          allowRude: settings.companion.allowRude,
          history,
          signal: controller.signal,
          away: awayRef.current > Date.now(),
          models: modelCatalog.models,
          onAttempt: (attempt) => {
            if (id !== requestId.current) return;
            if (attempt.done) setToast(`Ответила: ${attempt.model}`);
            else
              setBubble(
                `${attempt.reason ? attempt.reason + "\n" : ""}Пробую ${attempt.model} (${attempt.index}/${attempt.total})…`,
              );
          },
        });
      }
      if (id !== requestId.current) return;
      if (
        irritationRef.current >= 85 &&
        !awayRef.current &&
        !gentle &&
        !isApology(content)
      ) {
        reply = {
          text:
            effectiveIntensity === "soft"
              ? "Мне нужна небольшая пауза. Скоро вернусь."
              : "Заебал. Пойду за край окна — отдохну от твоего таланта раздражать.",
          mood: "offended",
          leaveSeconds: 20,
        };
      }
      if (awayRef.current > Date.now() && !isApology(content) && !gentle) {
        reply = {
          ...reply,
          text: shortAside(reply.text),
          leaveSeconds: 0,
        };
      }
      const scene = chooseCinematic({
        text: content,
        reply: reply.text,
        previousReply:
          [...messages]
            .reverse()
            .find((message) => message.role === "assistant")?.content || "",
        intensity: effectiveIntensity,
        allowRude: settings.companion.allowRude,
        irritation: irritationRef.current,
        quiet,
        canRandom:
          irritationRef.current >= 28 &&
          Date.now() - lastCinematic.current > 15000 &&
          !awayRef.current,
      });
      if (scene)
        reply = { text: scene.text, mood: "speaking", leaveSeconds: 0 };
      setMessages((current) =>
        [
          ...current,
          {
            id: messageId(),
            role: "assistant" as const,
            content: reply.text,
            time: time(),
          },
        ].slice(-100),
      );
      applyReply(reply, isApology(content) || gentle);
      if (scene) playCinematic(scene.kind);
      setSendResult({ sequence: id, success: true });
    } catch (cause) {
      if (id !== requestId.current) return;
      setSendResult({ sequence: id, success: false, text: content });
      setMessages((current) =>
        current.filter((message) => message.id !== userMessageId),
      );
      if (cause instanceof ChatError && cause.status === 401) {
        persistKey("");
        setSettings((current) => ({ ...current, key: "" }));
        setFloating(false);
        if (desktop.native) desktop.setCompanion(false);
      }
      setError(
        controller.signal.aborted
          ? "Ответ задержался. Попробуй ещё раз."
          : cause instanceof TypeError
            ? "Не удалось связаться с OpenRouter. Проверь интернет и доступность сервиса."
            : cause instanceof Error
              ? cause.message
              : "Не удалось получить ответ.",
      );
      setPhase(awayRef.current > Date.now() ? "away" : "idle");
      setBubble(
        cause instanceof TransportError
          ? "Не удалось связаться с OpenRouter. Причина указана ниже; смена модели тут не поможет."
          : "Даже я иногда теряю связь. Давай попробуем ещё раз.",
      );
    } finally {
      clearTimeout(timeout);
      if (id === requestId.current) {
        setPending(false);
        request.current = null;
      }
    }
  }
  useEffect(() => {
    const timer = setInterval(() => setClock(time()), 1000);
    return () => {
      clearInterval(timer);
      timers.current.forEach(clearTimeout);
      request.current?.abort();
      if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    };
  }, []);
  useEffect(() => {
    if (!speechSupported) return;
    const load = () => setVoices(window.speechSynthesis.getVoices());
    load();
    window.speechSynthesis.addEventListener("voiceschanged", load);
    return () =>
      window.speechSynthesis.removeEventListener("voiceschanged", load);
  }, [speechSupported]);
  useEffect(() => {
    if (!awayUntil) return;
    const tick = () => {
      const left = Math.max(0, Math.ceil((awayUntil - Date.now()) / 1000));
      setSeconds(left);
      if (left === 0) goHome();
    };
    tick();
    const timer = setInterval(tick, 500);
    return () => clearInterval(timer);
    // The departure timer owns its lifecycle; other state must not restart it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [awayUntil]);
  // While cooling down he may peek out on his own, but never interrupt a request.
  useEffect(() => {
    if (
      !awayUntil ||
      phase !== "away" ||
      pending ||
      quiet ||
      !settings.companion.backgroundQuips
    )
      return;
    const delay = 5500 + Math.random() * 2500;
    if (awayUntil - Date.now() < delay + 3000) return;
    const timer = setTimeout(() => {
      // A suspended OS window may deliver this timeout after the cooldown ended.
      if (awayRef.current <= Date.now()) return;
      const aside = chooseAside(character.id, intensityRef.current);
      clearTimers();
      setBubble(aside.text);
      setPhase(aside.rude && settings.companion.allowRude ? "rude" : "peeking");
      speak(aside.text);
      later(
        () => setPhase(awayRef.current > Date.now() ? "away" : "idle"),
        4000,
      );
    }, delay);
    return () => clearTimeout(timer);
  }, [
    awayUntil,
    phase,
    pending,
    character.id,
    intensity,
    sound,
    settings.voice,
    settings.rate,
    settings.companion,
    quiet,
  ]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 5500);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    if (quiet) speech.stop();
  }, [quiet]);
  useEffect(() => {
    const timer = setInterval(
      () => updateIrritation(irritationRef.current - 2),
      30000,
    );
    return () => clearInterval(timer);
  }, []);
  function toggleSound() {
    if (!speechSupported && settings.ttsProvider === "system") {
      setToast(
        "Этот браузер не поддерживает системную озвучку. Попробуй Chrome или Edge.",
      );
      return;
    }
    setSound(!sound);
    if (sound) stopSpeech();
    else
      setToast(
        quiet
          ? "Озвучка включена, но сейчас тихие часы. Реплики останутся без звука."
          : settings.ttsProvider === "openai"
            ? "AI-озвучка включена. Следующий ответ вызовет платный запрос OpenAI TTS."
            : "Озвучка включена. Следующий ответ прозвучит системным голосом.",
      );
  }
  const animationMood =
    speech.speaking && (phase === "idle" || phase === "speaking")
      ? "speaking"
      : sound && !speech.speaking && phase === "speaking"
        ? "idle"
        : phase;
  const spokenRange = speech.progress?.text === bubble ? speech.progress : null;
  const companionSnapshot: CompanionSnapshot = {
    character: character.id,
    sendResult,
    cinematic,
    phase,
    animationMood,
    bubble,
    highlight: spokenRange
      ? { start: spokenRange.start, end: spokenRange.end }
      : null,
    error,
    notice:
      toast ||
      (settings.ttsProvider === "local" && voiceState?.phase === "downloading"
        ? `Скачивается русский голос: ${voiceState.progress}% (63 МБ, один раз)`
        : settings.ttsProvider === "local" && voiceState?.phase === "error"
          ? voiceState.error
          : ""),
    pending,
    sound,
    speechBusy: speech.busy,
    speaking: speech.speaking,
    quiet,
    away: Boolean(awayUntil),
    seconds,
  };
  async function companionAction(action: CompanionAction): Promise<boolean> {
    if (action.type === "settings" || action.type === "settings-widget") {
      resumeWidget.current = action.type === "settings-widget";
      setFloating(false);
      setModal("settings");
      return true;
    }
    if (action.type === "minimize") {
      minimizeWindow();
      return true;
    }
    if (action.type === "maximize") {
      maximizeWindow();
      return true;
    }
    if (action.type === "close") {
      closeWindow();
      return true;
    }
    if (action.type === "restore") {
      setFloating(false);
      setMinimized(false);
      return true;
    }
    if (action.type === "stop-speech") {
      stopSpeech();
      return true;
    }
    if (action.type === "cancel-reply") {
      stopReply();
      return true;
    }
    if (action.type === "select-character") {
      const next = characters.find((item) => item.id === action.character);
      if (!next) return false;
      if (next.id !== character.id) newChat(next);
      return true;
    }
    if (action.type === "toggle-sound") {
      toggleSound();
      return true;
    }
    if (action.type === "return") {
      goHome();
      return true;
    }
    if (action.type === "send") {
      if (pending || request.current || !settings.key.trim()) return false;
      void send(action.text);
      return true;
    }
    return false;
  }
  const companionActionRef = useRef(companionAction);
  companionActionRef.current = companionAction;
  useEffect(() => {
    if (!desktop.native || !window.clippyDesktop?.onCompanionAction) return;
    return window.clippyDesktop.onCompanionAction((action) => {
      void companionActionRef.current(action);
    });
  }, [desktop.native]);
  useEffect(() => {
    if (desktop.native)
      window.clippyDesktop?.publishCompanion?.(companionSnapshot);
  }, [
    desktop.native,
    character.id,
    phase,
    animationMood,
    bubble,
    error,
    toast,
    pending,
    sound,
    quiet,
    awayUntil,
    seconds,
    speech.progress,
    speech.busy,
    speech.speaking,
    voiceState,
    settings.ttsProvider,
    sendResult,
    cinematic,
  ]);

  function saveSettings(value: SettingsData) {
    cancelRequest();
    stopSpeech();
    clearTimers();
    speech.clearCache();
    const next = characters.find((item) => item.id === value.character)!;
    if (next.id !== character.id)
      newChat(next, value.companion.rememberSession);
    if (!value.companion.rememberSession) threads.current = {};
    setSettings(value);
    persistKey(value.key);
    changeIntensity(value.intensity);
    setSound(value.sound);
    setPhase(awayRef.current > Date.now() ? "away" : "idle");
    setModal(null);
    setError("");
    if (desktop.native)
      desktop.setCompanion(Boolean(value.widget && value.key.trim()));
    else setFloating(Boolean(value.widget && value.key.trim()));
  }
  return (
    <main
      className={`nt-desktop ${desktop.native ? "nt-native" : ""} ${floating ? "nt-widget-preview" : ""}`}
    >
      {minimized && !desktop.native ? (
        <button
          className="nt-button nt-restore"
          onClick={() => setMinimized(false)}
        >
          Вернуть окно
        </button>
      ) : (
        <div
          className={`nt-shell ${maximized ? "nt-maximized" : ""} ${floating ? "nt-widget" : ""}`}
        >
          <CompanionScene
            snapshot={companionSnapshot}
            onAction={companionAction}
            widget={floating}
            native={desktop.native}
            inactive={desktop.native && !desktop.state.focused}
          />
        </div>
      )}
      {keyLoaded && !minimized && !settings.key.trim() ? (
        <TokenDialog
          onSave={(key) => {
            setSettings((current) => ({ ...current, key }));
            persistKey(key);
            setError("");
          }}
          onClose={closeWindow}
        />
      ) : (
        modal === "settings" && (
          <Settings
            settings={{
              ...settings,
              character: character.id,
              intensity,
              sound,
              widget:
                resumeWidget.current ||
                (desktop.native ? Boolean(desktop.state.companion) : floating),
            }}
            voices={voices}
            localVoiceState={voiceState}
            modelCatalog={modelCatalog}
            onPreview={(kind) => {
              setModal(null);
              setBubble(
                "Мемная сценка. Только пиксели — никаких действий с системой.",
              );
              playCinematic(kind);
            }}
            onSave={saveSettings}
            onClose={() => {
              setModal(null);
              if (resumeWidget.current) {
                if (desktop.native) desktop.setCompanion(true);
                else setFloating(true);
              }
            }}
          />
        )
      )}
    </main>
  );
}
