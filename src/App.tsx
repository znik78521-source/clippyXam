import { useEffect, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUpRight,
  Bell,
  Cable,
  Check,
  ChevronRight,
  CircleHelp,
  Coffee,
  Eye,
  Flame,
  Hand,
  Info,
  Maximize2,
  MessageSquare,
  Minus,
  Monitor,
  MousePointer2,
  Paperclip,
  Pin,
  RotateCcw,
  Send,
  Settings as SettingsIcon,
  ShieldCheck,
  Sparkles,
  Volume2,
  VolumeX,
  X,
  Zap,
} from "lucide-react";
import Mascot from "./components/Mascot";
import SpeechText from "./components/SpeechText";
import { FloatingCompanion } from "./components/CompanionScene";
import type { CompanionAction, CompanionSnapshot } from "./lib/companion";
import Dialog from "./components/Dialog";
import Settings from "./components/Settings";
import type { SettingsData } from "./components/Settings";
import {
  ComputerIcon,
  FolderIcon,
  RudeHand,
  TrashIcon,
  WindowsMark,
} from "./components/Icons";
import { characters, moodLabels } from "./lib/characters";
import type {
  Character,
  Intensity,
  Message,
  Mood,
  Reply,
} from "./lib/characters";
import { demoReply, requestReply } from "./lib/chat";
import { useDesktopWindow } from "./lib/desktop";
import {
  chooseAside,
  isApology,
  shortAside,
  requestsGentle,
  nextIrritation,
} from "./lib/behavior";

import { useSpeech } from "./lib/useSpeech";
import {
  defaultPreferences,
  defaultVoiceMap,
  defaultCloudVoices,
  isQuietTime,
} from "./lib/preferences";

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
const intensityLabels: Record<Intensity, string> = {
  soft: "Мягко",
  normal: "С характером",
  wild: "Без тормозов",
};

export default function App() {
  const [character, setCharacter] = useState(characters[0]);
  const [messages, setMessages] = useState<Message[]>(() => [
    welcome(characters[0]),
  ]);
  const [text, setText] = useState("");
  const [phase, setPhase] = useState<Mood>("idle");
  const [bubble, setBubble] = useState(characters[0].quip);
  const [intensity, setIntensity] = useState<Intensity>("normal");
  const [sound, setSound] = useState(false);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [settings, setSettings] = useState<SettingsData>({
    mode: "demo",
    key: "",
    model: "google/gemini-2.5-flash",
    voice: "",
    rate: 1,
    ttsProvider: "system",
    ttsKey: "",
    systemVoices: { ...defaultVoiceMap },
    cloudVoices: { ...defaultCloudVoices },
    companion: { ...defaultPreferences },
  });
  const [modal, setModal] = useState<
    "settings" | "about" | "reset" | "assets" | null
  >(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const desktop = useDesktopWindow(setToast);
  const speech = useSpeech(setToast);
  const [irritation, setIrritation] = useState(0);
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
  const [mini, setMini] = useState(Boolean(window.clippyDesktop));
  const [menu, setMenu] = useState<"file" | "view" | "help" | "start" | null>(
    null,
  );
  const [clock, setClock] = useState(time());
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [mobileTab, setMobileTab] = useState<"room" | "chat">("room");
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const request = useRef<AbortController | null>(null);
  const requestId = useRef(0);
  const awayRef = useRef(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const windowRef = useRef<HTMLElement>(null);
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(
    null,
  );
  const speechSupported =
    typeof window !== "undefined" && "speechSynthesis" in window;

  useEffect(() => {
    if (desktop.native) {
      setMini(desktop.state.mini);
      setMaximized(desktop.state.maximized);
      setPosition({ x: 0, y: 0 });
    }
  }, [desktop.native, desktop.state.mini, desktop.state.maximized]);
  function changeMini(value: boolean) {
    if (desktop.native) desktop.setMini(value);
    else {
      setMini(value);
      setPosition({ x: 0, y: 0 });
    }
  }
  function minimizeWindow() {
    if (desktop.native) desktop.minimize();
    else setMinimized(true);
  }
  function maximizeWindow() {
    if (desktop.native) desktop.toggleMaximize();
    else {
      setMaximized(!maximized);
      setPosition({ x: 0, y: 0 });
    }
  }
  function closeWindow() {
    stopSpeech();
    if (desktop.native) desktop.close();
    else {
      setMinimized(true);
      setToast("Я в панели задач. Нажми clippyXam, чтобы вернуть окно.");
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
    timers.current.forEach(clearTimeout);
    timers.current = [];
  }
  function later(callback: () => void, delay: number) {
    timers.current.push(setTimeout(callback, delay));
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
  function newChat(next = character) {
    cancelRequest();
    stopSpeech();
    clearTimers();
    setAway(0);
    setSeconds(0);
    if (settings.companion.rememberSession && next.id !== character.id) {
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
    setText("");
    setError("");
    setPhase("idle");
    setBubble(next.quip);
    setModal(null);
  }
  async function send(provided?: string) {
    const content = (provided ?? text).trim();
    if (!content || pending || request.current || content.length > 2000) return;
    const gentle = requestsGentle(content);
    const effectiveIntensity = gentle ? "soft" : intensityRef.current;
    if (gentle) changeIntensity("soft");
    updateIrritation(nextIrritation(irritationRef.current, content));
    setText("");
    setError("");
    setPending(true);
    stopSpeech();
    clearTimers();
    const history = [
      ...messages,
      { id: messageId(), role: "user" as const, content, time: time() },
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
      } else if (settings.mode === "demo") {
        await new Promise<void>((resolve, reject) => {
          const delay = setTimeout(resolve, 850);
          controller.signal.addEventListener(
            "abort",
            () => {
              clearTimeout(delay);
              reject(new DOMException("Aborted", "AbortError"));
            },
            { once: true },
          );
        });
        reply = demoReply(
          content,
          character,
          effectiveIntensity,
          history.filter((message) => message.role === "user").length,
        );
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
              : "Моё терпение закончилось раньше твоего списка требований. Возьму паузу.",
          mood: "offended",
          leaveSeconds: 20,
        };
      }
      if (awayRef.current > Date.now() && !isApology(content) && !gentle) {
        reply = {
          ...reply,
          text:
            settings.mode === "demo"
              ? chooseAside(character.id, intensityRef.current).text
              : shortAside(reply.text),
          leaveSeconds: 0,
        };
      }
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
    } catch (cause) {
      if (id !== requestId.current) return;
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
      setBubble("Даже я иногда теряю связь. Давай попробуем ещё раз.");
    } finally {
      clearTimeout(timeout);
      if (id === requestId.current) {
        setPending(false);
        request.current = null;
        inputRef.current?.focus();
      }
    }
  }
  function preview(action: "hello" | "rude" | "leave" | "peek") {
    if (pending) return;
    if (action === "hello") {
      goHome();
      applyReply({ text: character.quip, mood: "speaking", leaveSeconds: 0 });
    }
    if (action === "rude") {
      if (intensity === "soft" || !settings.companion.allowRude) {
        setToast("В мягком режиме грубые жесты выключены.");
        return;
      }
      applyReply({
        text: "Вместо тысячи слов. Ничего личного.",
        mood: "rude",
        leaveSeconds: 0,
      });
    }
    if (action === "leave")
      applyReply({
        text: "Всё, я в отпуск. На пятнадцать секунд. Не звони.",
        mood: "offended",
        leaveSeconds: 15,
      });
    if (action === "peek") {
      clearTimers();
      setPhase("peeking");
      setBubble("Я не подслушиваю. Я осуждаю.");
      later(
        () => setPhase(awayRef.current > Date.now() ? "away" : "idle"),
        4500,
      );
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
        2800,
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
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, pending, error]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 5500);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("click", close);
    window.addEventListener("keydown", escape);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("keydown", escape);
    };
  }, [menu]);
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
  function menuItem(callback: () => void) {
    setMenu(null);
    callback();
  }
  function openCompanion() {
    if (desktop.native) desktop.setCompanion(true);
    else {
      setFloating(true);
      setMinimized(false);
    }
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
    phase,
    animationMood,
    bubble,
    highlight: spokenRange
      ? { start: spokenRange.start, end: spokenRange.end }
      : null,
    error,
    notice: toast,
    pending,
    sound,
    speechBusy: speech.busy,
    speaking: speech.speaking,
    quiet,
    away: Boolean(awayUntil),
    seconds,
  };
  async function companionAction(action: CompanionAction): Promise<boolean> {
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
      if (pending || request.current) return false;
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
  ]);
  const isAway = phase === "away";
  const userCount = messages.filter(
    (message) => message.role === "user",
  ).length;

  return (
    <div
      className={`desktop ${desktop.native ? "native-shell" : ""} ${desktop.native && !desktop.state.focused ? "window-inactive" : ""}`}
      onPointerDown={() => {
        if (menu) setMenu(null);
      }}
    >
      <div className="desktop-texture" />
      <div className="desktop-brand">
        <Paperclip size={30} strokeWidth={1.6} />
        <span>
          clippy<b>Xam</b>
          <small>старый знакомый. новый характер.</small>
        </span>
      </div>
      <div className="desktop-icons">
        <button
          onDoubleClick={() => setModal("about")}
          onClick={() => setModal("about")}
        >
          <ComputerIcon />
          <span>Мой компьютер</span>
        </button>
        <button
          onClick={() => {
            setFloating(false);
            setMinimized(false);
            setMini(false);
          }}
        >
          <img src="/favicon.svg" alt="" />
          <span>clippyXam</span>
        </button>
        <button onClick={() => setModal("assets")}>
          <FolderIcon />
          <span>Мои маскоты</span>
        </button>
        <button onClick={() => setModal("reset")}>
          <TrashIcon />
          <span>Корзина</span>
        </button>
      </div>
      <div className="desktop-stamp">
        EST. 1997 / REBOOTED 2026
        <br />
        <span>не все обновления делают нас лучше.</span>
      </div>

      {!minimized && !floating && (
        <main
          ref={windowRef}
          className={`xp-window main-window ${maximized ? "maximized" : ""} ${mini ? "mini-window" : ""}`}
          style={
            !desktop.native && !maximized
              ? { transform: `translate(${position.x}px, ${position.y}px)` }
              : undefined
          }
        >
          <div
            className="titlebar main-titlebar"
            onDoubleClick={() => {
              if (!desktop.native) maximizeWindow();
            }}
            onPointerDown={(event) => {
              if (
                desktop.native ||
                (event.target as HTMLElement).closest("button") ||
                maximized ||
                window.innerWidth < 760
              )
                return;
              drag.current = {
                x: event.clientX,
                y: event.clientY,
                ox: position.x,
                oy: position.y,
              };
              event.currentTarget.setPointerCapture(event.pointerId);
            }}
            onPointerMove={(event) => {
              if (!drag.current || !windowRef.current) return;
              const rect = windowRef.current.getBoundingClientRect();
              const baseX = rect.left - position.x,
                baseY = rect.top - position.y;
              setPosition({
                x: Math.max(
                  -baseX,
                  Math.min(
                    window.innerWidth - 120 - baseX,
                    drag.current.ox + event.clientX - drag.current.x,
                  ),
                ),
                y: Math.max(
                  -baseY,
                  Math.min(
                    window.innerHeight - 90 - baseY,
                    drag.current.oy + event.clientY - drag.current.y,
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
            <div className="title-name">
              <img src="/favicon.svg" alt="" />
              <span>
                clippyXam{" "}
                <span className="title-description">
                  — помощник с характером
                </span>
              </span>
            </div>
            <div className="window-controls">
              {desktop.native && (
                <button
                  className={`window-control pin-control ${desktop.state.alwaysOnTop ? "pinned" : ""}`}
                  aria-label="Поверх всех окон"
                  aria-pressed={desktop.state.alwaysOnTop}
                  onClick={() =>
                    desktop.setAlwaysOnTop(!desktop.state.alwaysOnTop)
                  }
                >
                  <Pin size={13} />
                </button>
              )}
              <button
                className="window-control"
                aria-label="Свернуть"
                onClick={minimizeWindow}
              >
                <Minus size={17} />
              </button>
              <button
                className="window-control"
                aria-label={maximized ? "Восстановить размер" : "Развернуть"}
                onClick={maximizeWindow}
              >
                <Maximize2 size={13} />
              </button>
              <button
                className="window-control close"
                aria-label={
                  desktop.native ? "Закрыть приложение" : "Скрыть окно"
                }
                onClick={closeWindow}
              >
                <X size={18} />
              </button>
            </div>
          </div>
          <div
            className="menubar"
            onPointerDown={(event) => event.stopPropagation()}
          >
            {(["file", "view", "help"] as const).map((item, index) => (
              <div className="menu-wrap" key={item}>
                <button
                  className={menu === item ? "menu-active" : ""}
                  aria-expanded={menu === item}
                  onClick={(event) => {
                    event.stopPropagation();
                    setMenu(menu === item ? null : item);
                  }}
                >
                  {["Файл", "Вид", "Справка"][index]}
                </button>
                {menu === item && (
                  <div className="dropdown">
                    {item === "file" && (
                      <>
                        <button
                          onClick={() => menuItem(() => setModal("reset"))}
                        >
                          <RotateCcw size={14} />
                          Новый диалог
                        </button>
                        <button
                          onClick={() => menuItem(() => setModal("settings"))}
                        >
                          <SettingsIcon size={14} />
                          Настройки
                        </button>
                        <hr />
                        <button onClick={() => menuItem(minimizeWindow)}>
                          <Minus size={14} />
                          Свернуть в панель
                        </button>
                      </>
                    )}
                    {item === "view" && (
                      <>
                        <button onClick={() => menuItem(openCompanion)}>
                          <Paperclip size={14} />
                          Маскот на рабочем столе
                        </button>
                        <button
                          onClick={() => menuItem(() => changeMini(!mini))}
                        >
                          <Monitor size={14} />
                          {mini ? "Полное окно" : "Мини-режим"}
                        </button>
                        {desktop.native && (
                          <>
                            <button
                              onClick={() =>
                                menuItem(() =>
                                  desktop.setAlwaysOnTop(
                                    !desktop.state.alwaysOnTop,
                                  ),
                                )
                              }
                            >
                              <Pin size={14} />
                              {desktop.state.alwaysOnTop
                                ? "Не закреплять поверх окон"
                                : "Поверх всех окон"}
                            </button>
                            <button
                              disabled={!desktop.state.trayAvailable}
                              onClick={() => menuItem(desktop.hideToTray)}
                            >
                              <Minus size={14} />
                              Скрыть в системный трей
                            </button>
                          </>
                        )}
                        <button onClick={() => menuItem(toggleSound)}>
                          <Volume2 size={14} />
                          {sound ? "Выключить озвучку" : "Включить озвучку"}
                        </button>
                      </>
                    )}
                    {item === "help" && (
                      <>
                        <button
                          onClick={() => menuItem(() => setModal("about"))}
                        >
                          <CircleHelp size={14} />О программе
                        </button>
                        <button
                          onClick={() => menuItem(() => setModal("assets"))}
                        >
                          <Paperclip size={14} />
                          Маскоты и авторство
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
            ))}
            <span className="menu-tag">неофициально. непредсказуемо.</span>
          </div>
          {!mini && (
            <div className="app-toolbar">
              <div className="toolbar-left">
                <div className="app-logo">
                  <Paperclip size={24} />
                </div>
                <div>
                  <h1>
                    Старый знакомый. <span>Новый характер.</span>
                  </h1>
                  <p>Он вернулся. И у него есть пара замечаний.</p>
                </div>
              </div>
              <button
                className="xp-button settings-button"
                onClick={() => setModal("settings")}
              >
                <SettingsIcon size={16} />
                Настройки
              </button>
            </div>
          )}
          <div className="app-body">
            {!mini && (
              <aside className="sidebar">
                <div className="section-eyebrow">
                  ТВОЯ КОМПАНИЯ <span>03 / 05</span>
                </div>
                <h2>Выбери своего</h2>
                <p className="sidebar-description">У каждого свои причуды.</p>
                <div className="character-list">
                  {characters.map((item) => (
                    <button
                      className={`character-card ${character.id === item.id ? "selected" : ""}`}
                      key={item.id}
                      onClick={() => {
                        if (character.id !== item.id) newChat(item);
                      }}
                      aria-pressed={character.id === item.id}
                    >
                      <div className={`character-avatar avatar-${item.id}`}>
                        <Mascot id={item.id} size={49} thumbnail />
                      </div>
                      <div className="character-card-copy">
                        <strong>{item.name}</strong>
                        <small>{item.subtitle}</small>
                      </div>
                      {character.id === item.id && (
                        <span className="selected-dot">
                          <Check size={9} strokeWidth={3} />
                        </span>
                      )}
                    </button>
                  ))}
                  {[
                    {
                      name: "Courtney",
                      subtitle: "Драма — её второе имя",
                      letter: "C",
                    },
                    {
                      name: "Earl",
                      subtitle: "Видел всё. Всем недоволен.",
                      letter: "E",
                    },
                  ].map((item) => (
                    <button
                      className="character-card unavailable"
                      key={item.name}
                      onClick={() => setModal("assets")}
                      aria-label={`${item.name}: спрайты пока недоступны`}
                    >
                      <div className="character-avatar placeholder-avatar">
                        <span>{item.letter}</span>
                        <span className="tiny-lock">?</span>
                      </div>
                      <div className="character-card-copy">
                        <strong>
                          {item.name}
                          <span className="soon">скоро</span>
                        </strong>
                        <small>{item.subtitle}</small>
                      </div>
                    </button>
                  ))}
                </div>
                <div className="sidebar-bottom">
                  <div className="little-note">
                    <Info size={16} />
                    <div>
                      <b>Помощник. Не прислуга.</b>
                      <p>
                        Может обидеться, уйти
                        <br />и вернуться как ни в чём
                        <br />
                        не бывало. Всё как у людей.
                      </p>
                    </div>
                  </div>
                  <button
                    className="text-link"
                    onClick={() => setModal("about")}
                  >
                    Что здесь происходит? <ArrowUpRight size={13} />
                  </button>
                </div>
              </aside>
            )}
            <section className="room">
              <div className="mobile-tabs">
                <button
                  className={mobileTab === "room" ? "active" : ""}
                  onClick={() => setMobileTab("room")}
                >
                  Маскот
                </button>
                <button
                  className={mobileTab === "chat" ? "active" : ""}
                  onClick={() => setMobileTab("chat")}
                >
                  Диалог {userCount > 0 && `(${userCount})`}
                </button>
              </div>
              <div
                className={`room-inner ${!mini && mobileTab === "chat" ? "mobile-hidden" : ""}`}
              >
                <div className="room-heading">
                  <div>
                    <div className="character-origin">
                      {character.year} <span>↗ НАШИ ДНИ</span>
                    </div>
                    <h2>Знакомься. Это {character.name}.</h2>
                    <p>{character.description}</p>
                  </div>
                  <button
                    className={`sound-button ${sound ? "on" : ""}`}
                    title={sound ? "Выключить озвучку" : "Включить озвучку"}
                    aria-label={
                      sound ? "Выключить озвучку" : "Включить озвучку"
                    }
                    onClick={toggleSound}
                  >
                    {sound ? <Volume2 size={19} /> : <VolumeX size={19} />}
                  </button>
                </div>
                {(quiet || speech.busy) && (
                  <div className="speech-status" role="status">
                    <span>
                      {quiet
                        ? "Тихие часы · только текст"
                        : speech.speaking
                          ? "Говорит…"
                          : "Готовит голос…"}
                    </span>
                    {speech.busy && (
                      <button onClick={stopSpeech}>Остановить озвучку</button>
                    )}
                  </div>
                )}
                <div className={`stage phase-${phase}`}>
                  <div className="stage-top">
                    <span className="stage-label">
                      <span className={`status-dot ${isAway ? "amber" : ""}`} />
                      {isAway ? "Отошёл от дел" : "На рабочем столе"}
                    </span>
                    <span className="stage-coordinate">
                      {mini ? "MINI MODE" : "ПЕРСОНАЛЬНЫЙ ХАОС™"}
                    </span>
                  </div>
                  {!isAway && (
                    <div
                      className={`speech-bubble ${phase === "thinking" ? "thinking-bubble" : ""}`}
                    >
                      <SpeechText text={bubble} range={spokenRange} />
                      {phase === "thinking" && (
                        <span className="thinking-dots">•••</span>
                      )}
                    </div>
                  )}
                  {isAway && (
                    <div className="away-message">
                      <Coffee size={29} strokeWidth={1.5} />
                      <h3>Ушёл остыть.</h3>
                      <p>
                        Не принимай близко к сердцу.
                        <br />
                        Он и на принтер обижался.
                      </p>
                      <button className="xp-button" onClick={() => goHome()}>
                        Позвать обратно <span>{seconds} с</span>
                      </button>
                    </div>
                  )}
                  <div
                    className={`mascot-position ${awayUntil && phase === "rude" ? "rude-peek" : ""}`}
                  >
                    <div className="mascot-shadow" />
                    <Mascot
                      id={character.id}
                      mood={animationMood}
                      thumbnail={
                        desktop.native && Boolean(desktop.state.companion)
                      }
                      size={
                        character.id === "clippy"
                          ? 220
                          : character.id === "rover"
                            ? 170
                            : 180
                      }
                    />
                    {phase === "rude" && <RudeHand character={character.id} />}
                  </div>
                  <div className="stage-bottom">
                    <span>
                      <MousePointer2 size={12} />
                      {isAway
                        ? "Напиши — может, выглянет"
                        : "Да, он смотрит прямо на тебя"}
                    </span>
                    <span>100%</span>
                  </div>
                </div>
                <div className="mood-bar">
                  <span className="mood-icon">
                    {isAway ? (
                      <Coffee size={15} />
                    ) : phase === "rude" ? (
                      <Hand size={15} />
                    ) : (
                      <Zap size={15} />
                    )}
                  </span>
                  <span>
                    Настроение: <b>{moodLabels[phase]}</b>
                  </span>
                  <div
                    className={`mood-meter mood-${phase} patience-meter`}
                    role="meter"
                    aria-label="Терпение маскота"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={100 - irritation}
                    title={`Терпение: ${100 - irritation}/100`}
                  >
                    {[0, 1, 2, 3, 4].map((i) => (
                      <i
                        key={i}
                        className={
                          i < Math.ceil((100 - irritation) / 20) ? "filled" : ""
                        }
                      />
                    ))}
                  </div>
                </div>
                {!mini && (
                  <>
                    <div className="action-heading">
                      <span>ПРОВЕРКА ХАРАКТЕРА</span>
                      <span>на свой страх и риск</span>
                    </div>
                    <div className="action-buttons">
                      <button
                        onClick={() => preview("hello")}
                        disabled={pending}
                      >
                        <Hand size={16} />
                        <span>Поздороваться</span>
                      </button>
                      <button
                        onClick={() => preview("rude")}
                        disabled={
                          pending ||
                          intensity === "soft" ||
                          !settings.companion.allowRude
                        }
                        title="Новый жест, не оригинальная анимация"
                      >
                        <span className="finger-icon">
                          <RudeHand character={character.id} />
                        </span>
                        <span>Показать фак</span>
                      </button>
                      <button
                        onClick={() => preview(isAway ? "peek" : "leave")}
                        disabled={pending}
                      >
                        {isAway ? <Eye size={16} /> : <Coffee size={16} />}
                        <span>{isAway ? "Выглянуть" : "Пусть остынет"}</span>
                      </button>
                    </div>
                    <div className="behavior-note">
                      <ShieldCheck size={13} />
                      Ретро-снаружи. Нейросеть внутри. Так себе сочетание.
                    </div>
                  </>
                )}
                {mini && (
                  <div className="compact-conversation">
                    <div className="compact-options">
                      <label>
                        Маскот
                        <select
                          aria-label="Маскот в мини-режиме"
                          value={character.id}
                          onChange={(event) => {
                            const next = characters.find(
                              (item) => item.id === event.target.value,
                            );
                            if (next && next.id !== character.id) newChat(next);
                          }}
                        >
                          {characters.map((item) => (
                            <option key={item.id} value={item.id}>
                              {item.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Дерзость
                        <select
                          aria-label="Дерзость в мини-режиме"
                          value={intensity}
                          onChange={(event) =>
                            changeIntensity(event.target.value as Intensity)
                          }
                        >
                          {(["soft", "normal", "wild"] as const).map(
                            (level) => (
                              <option key={level} value={level}>
                                {intensityLabels[level]}
                              </option>
                            ),
                          )}
                        </select>
                      </label>
                    </div>
                    <div
                      className="compact-reply"
                      role="log"
                      aria-live="polite"
                      aria-label="Последний ответ"
                    >
                      {pending
                        ? `${character.name} подбирает слова…`
                        : messages
                            .filter((message) => message.role === "assistant")
                            .at(-1)?.content}
                    </div>
                    {error && (
                      <div className="chat-error" role="alert">
                        <Info size={13} />
                        {error}
                      </div>
                    )}
                    <form
                      className="compact-form"
                      onSubmit={(event) => {
                        event.preventDefault();
                        void send();
                      }}
                    >
                      <input
                        aria-label="Сообщение маскоту"
                        maxLength={2000}
                        placeholder={
                          isAway
                            ? "Он ушёл. Но написать можно…"
                            : `Скажи что-нибудь ${character.name}…`
                        }
                        value={text}
                        onChange={(event) => setText(event.target.value)}
                      />
                      {pending && (
                        <button
                          type="button"
                          className="cancel-reply"
                          onClick={stopReply}
                          aria-label="Отменить ответ"
                        >
                          Стоп
                        </button>
                      )}
                      <button
                        className="send-button"
                        type="submit"
                        disabled={!text.trim() || pending}
                        aria-label="Отправить сообщение"
                      >
                        {pending ? (
                          <span className="sending-spinner" />
                        ) : (
                          <Send size={15} />
                        )}
                      </button>
                    </form>
                  </div>
                )}
                {mini && (
                  <div className="mini-actions">
                    <button
                      className="xp-button"
                      onClick={() => changeMini(false)}
                    >
                      <Maximize2 size={13} />
                      Полное окно
                    </button>
                    <button
                      className="xp-button"
                      onClick={() => preview(isAway ? "peek" : "leave")}
                    >
                      {isAway ? "Выглянуть" : "Пусть остынет"}
                    </button>
                  </div>
                )}
              </div>
            </section>
            {!mini && (
              <section
                className={`chat-panel ${mobileTab === "room" ? "mobile-hidden" : ""}`}
              >
                <div className="chat-heading">
                  <div>
                    <MessageSquare size={17} />
                    <h2>Личный разговор</h2>
                  </div>
                  <button
                    className="icon-button"
                    title="Начать заново"
                    aria-label="Начать новый диалог"
                    onClick={() => setModal("reset")}
                  >
                    <RotateCcw size={15} />
                  </button>
                </div>
                <div className="chat-presence">
                  <span className={`status-dot ${isAway ? "amber" : ""}`} />
                  <span>
                    {character.name}{" "}
                    {isAway ? "ушёл, но читает" : "в сети. К сожалению."}
                  </span>
                </div>
                <div
                  className="messages"
                  ref={scrollRef}
                  role="log"
                  aria-live="polite"
                  aria-label="История диалога"
                >
                  <div className="conversation-date">
                    <span />
                    сегодня, {messages[0]?.time}
                    <span />
                  </div>
                  {messages.map((message) => (
                    <div
                      className={`message message-${message.role}`}
                      key={message.id}
                    >
                      <div className="message-meta">
                        <span>
                          {message.role === "assistant" ? character.name : "Ты"}
                        </span>
                        <time>{message.time}</time>
                      </div>
                      <div className="message-bubble">{message.content}</div>
                      {message.role === "assistant" && (
                        <button
                          className="read-message"
                          title="Прочитать вслух"
                          aria-label="Прочитать сообщение вслух"
                          onClick={() => {
                            if (!sound) {
                              setToast(
                                "Сначала включи озвучку кнопкой динамика.",
                              );
                              return;
                            }
                            speak(message.content);
                          }}
                        >
                          <Volume2 size={12} />
                        </button>
                      )}
                    </div>
                  ))}
                  {messages.length === 1 && (
                    <div className="chat-empty">
                      <div className="chat-empty-icon">
                        <MessageSquare size={23} strokeWidth={1.2} />
                        <Sparkles size={11} />
                      </div>
                      <p>
                        Начни разговор.
                        <br />
                        <span>Или сразу пожалеешь.</span>
                      </p>
                    </div>
                  )}
                  {pending && (
                    <div className="typing">
                      <span />
                      <span />
                      <span />
                      <small>{character.name} сочиняет ответ</small>
                    </div>
                  )}
                  {error && (
                    <div className="chat-error" role="alert">
                      <Info size={15} />
                      <span>
                        {error}
                        <button
                          onClick={() => {
                            const last = [...messages]
                              .reverse()
                              .find((message) => message.role === "user");
                            if (last) {
                              setText(last.content);
                              setError("");
                              inputRef.current?.focus();
                            }
                          }}
                        >
                          Вернуть текст в поле
                        </button>
                      </span>
                    </div>
                  )}
                </div>
                <div className="chat-composer">
                  <div className="suggestions">
                    {["Привет, скрепка!", "Прожарь меня"].map(
                      (suggestion, index) => (
                        <button
                          disabled={pending}
                          key={suggestion}
                          onClick={() =>
                            send(
                              index === 0 && character.id !== "clippy"
                                ? `Привет, ${character.name}!`
                                : suggestion,
                            )
                          }
                        >
                          {index === 0 ? (
                            <Hand size={11} />
                          ) : (
                            <Flame size={11} />
                          )}{" "}
                          {index === 0 && character.id !== "clippy"
                            ? `Привет, ${character.name}!`
                            : suggestion}
                        </button>
                      ),
                    )}
                  </div>
                  <form
                    className="message-form"
                    onSubmit={(event) => {
                      event.preventDefault();
                      void send();
                    }}
                  >
                    <textarea
                      ref={inputRef}
                      aria-label="Сообщение маскоту"
                      rows={2}
                      maxLength={2000}
                      placeholder={
                        isAway
                          ? "Он ушёл. Но написать можно…"
                          : `Скажи что-нибудь ${character.name}…`
                      }
                      value={text}
                      onChange={(event) => setText(event.target.value)}
                      onKeyDown={(event) => {
                        if (
                          event.key === "Enter" &&
                          !event.shiftKey &&
                          !event.nativeEvent.isComposing
                        ) {
                          event.preventDefault();
                          void send();
                        }
                      }}
                    />
                    <div className="composer-bottom">
                      <span>
                        {text.length > 1800
                          ? `${text.length} / 2000`
                          : "Enter ↵ отправить"}
                      </span>
                      {pending && (
                        <button
                          type="button"
                          className="cancel-reply"
                          onClick={stopReply}
                          aria-label="Отменить ответ"
                        >
                          Стоп
                        </button>
                      )}
                      <button
                        className="send-button"
                        type="submit"
                        disabled={!text.trim() || pending}
                        aria-label="Отправить сообщение"
                      >
                        {pending ? (
                          <span className="sending-spinner" />
                        ) : (
                          <Send size={15} />
                        )}
                      </button>
                    </div>
                  </form>
                  <div className="intensity-label">
                    <span>
                      <Zap size={12} />
                      Уровень дерзости
                    </span>
                    <button
                      className="icon-button"
                      aria-label="Об уровнях дерзости"
                      onClick={() =>
                        setToast(
                          "Мягко — без мата и жестов. С характером — дружеские подколы. Без тормозов — жёсткая прожарка и мат по твоему согласию.",
                        )
                      }
                    >
                      <CircleHelp size={12} />
                    </button>
                  </div>
                  <div className="intensity-control">
                    {(["soft", "normal", "wild"] as const).map((level) => (
                      <button
                        key={level}
                        className={intensity === level ? "active" : ""}
                        aria-pressed={intensity === level}
                        onClick={() => changeIntensity(level)}
                      >
                        {intensityLabels[level]}
                      </button>
                    ))}
                  </div>
                </div>
              </section>
            )}
          </div>
          <footer className="statusbar">
            <button
              className="connection-status"
              onClick={() => setModal("settings")}
            >
              <span
                className={`status-dot ${settings.mode === "demo" ? "amber" : ""}`}
              />
              {settings.mode === "demo"
                ? "Демо-режим"
                : "OpenRouter · ключ задан"}
              <span className="status-divider">|</span>
              <span className="connect-label">
                {settings.mode === "demo"
                  ? "Подключить OpenRouter"
                  : settings.model}
              </span>
              <ChevronRight size={12} />
            </button>
            <span className="status-right">
              {pending ? "Ждём ответ…" : "Готов к сомнительным советам"}
              <span className="status-divider">|</span>v0.1.0{" "}
              <span className="resize-grip">◢</span>
            </span>
          </footer>
        </main>
      )}

      {floating && (
        <FloatingCompanion
          snapshot={companionSnapshot}
          onAction={companionAction}
        />
      )}
      {minimized && !floating && (
        <button className="restore-hint" onClick={() => setMinimized(false)}>
          <Paperclip size={27} />
          <span>
            Он никуда не делся.<small>Нажми, чтобы вернуть clippyXam</small>
          </span>
          <ArrowDown size={19} />
        </button>
      )}
      <div className="desktop-bottom-note">
        <span className="tiny-star">✦</span> немного ностальгии. немного хаоса.
      </div>
      <div className="taskbar">
        <button
          className={`start-button ${menu === "start" ? "pressed" : ""}`}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            setMenu(menu === "start" ? null : "start");
          }}
        >
          <WindowsMark />
          <span>пуск</span>
        </button>
        <div className="quick-launch">
          <button
            title="Показать рабочий стол"
            aria-label="Показать рабочий стол"
            onClick={() => {
              if (floating) {
                setFloating(false);
                setMinimized(false);
              } else setMinimized(!minimized);
            }}
          >
            <Monitor size={18} />
          </button>
          <span />
        </div>
        <button
          className={`taskbar-app ${minimized ? "" : "active"}`}
          onClick={() => {
            if (floating) {
              setFloating(false);
              setMinimized(false);
            } else setMinimized(!minimized);
          }}
        >
          <img src="/favicon.svg" alt="" />
          clippyXam
        </button>
        <div className="taskbar-space" />
        <div className="system-tray">
          <span>RU</span>
          <button
            aria-label={sound ? "Выключить озвучку" : "Включить озвучку"}
            onClick={toggleSound}
          >
            {sound ? <Volume2 size={16} /> : <VolumeX size={16} />}
          </button>
          <button
            aria-label="Подключение OpenRouter"
            onClick={() => setModal("settings")}
          >
            <Cable size={16} />
          </button>
          <time>{clock}</time>
        </div>
      </div>
      {menu === "start" && (
        <div
          className="start-menu"
          onPointerDown={(event) => event.stopPropagation()}
        >
          <div className="start-profile">
            <div>
              <Paperclip size={25} />
            </div>
            Хозяин этого хаоса
          </div>
          <button
            onClick={() =>
              menuItem(() => {
                setMinimized(false);
                setMini(false);
              })
            }
          >
            <img src="/favicon.svg" alt="" />
            <span>
              <b>clippyXam</b>
              <small>Помощник с характером</small>
            </span>
          </button>
          <button onClick={() => menuItem(() => setModal("settings"))}>
            <SettingsIcon size={25} />
            <span>
              <b>Настройки</b>
              <small>OpenRouter и озвучка</small>
            </span>
          </button>
          <button onClick={() => menuItem(() => setModal("about"))}>
            <CircleHelp size={25} />
            <span>
              <b>Справка</b>
              <small>Зачем ты его установил?</small>
            </span>
          </button>
          <div className="start-menu-footer">
            Все программы <ChevronRight size={15} />
          </div>
        </div>
      )}
      {toast && (
        <div className="toast" role="status">
          <Bell size={17} />
          <span>{toast}</span>
          <button aria-label="Скрыть уведомление" onClick={() => setToast("")}>
            <X size={13} />
          </button>
        </div>
      )}

      {modal === "settings" && (
        <Settings
          settings={settings}
          voices={voices}
          onClose={() => setModal(null)}
          onSave={(value) => {
            cancelRequest();
            stopSpeech();
            speech.clearCache();
            goHome(character.quip);
            if (!value.companion.rememberSession) threads.current = {};
            setSettings(value);
            setError("");
            setModal(null);
            setToast(
              value.mode === "demo"
                ? "Демо-чат включён. Настройки голоса и поведения применены."
                : "Настройки применены. Подключение проверится при отправке сообщения.",
            );
          }}
        />
      )}
      {modal === "reset" && (
        <Dialog title="Новый диалог" onClose={() => setModal(null)}>
          <div className="confirm-content">
            <div className="question-orb">?</div>
            <div>
              <h2>Начнём с чистого листа?</h2>
              <p>
                Текущий разговор исчезнет. {character.name} сделает вид, что
                ничего не было.
              </p>
            </div>
          </div>
          <div className="dialog-buttons">
            <button className="xp-button primary" onClick={() => newChat()}>
              Начать заново
            </button>
            <button className="xp-button" onClick={() => setModal(null)}>
              Отмена
            </button>
          </div>
        </Dialog>
      )}
      {modal === "about" && (
        <Dialog
          title="О программе clippyXam"
          onClose={() => setModal(null)}
          wide
        >
          <div className="about-brand">
            <img src="/favicon.svg" alt="" />
            <div>
              <h2>
                clippyXam <span>0.1.0</span>
              </h2>
              <p>Старый знакомый. Новый характер.</p>
            </div>
          </div>
          <p className="about-intro">
            Ностальгия по помощникам из прошлого, но с нейросетью и скверным
            характером. Неофициальный фан-проект, не связанный с Microsoft.
          </p>
          <div className="about-features">
            <div>
              <MessageSquare size={19} />
              <span>
                <b>Поговори с ним</b>Демо-реплики без ключа или настоящий диалог
                через OpenRouter.
              </span>
            </div>
            <div>
              <Coffee size={19} />
              <span>
                <b>Не жди идеального поведения</b>Он может обидеться, уйти на
                время и выглядывать в ответ на сообщения.
              </span>
            </div>
            <div>
              <Volume2 size={19} />
              <span>
                <b>Дай ему голос</b>Включи динамик. Для русского голоса может
                понадобиться языковой пакет ОС.
              </span>
            </div>
            <div>
              <Monitor size={19} />
              <span>
                <b>Маленькое окно — большое эго</b>«Вид → Мини-режим» оставит
                маскота и компактный чат. За синюю полосу окно можно
                перетаскивать.
              </span>
            </div>
          </div>
          <div className="info-box">
            <Info size={16} />
            <span>
              {desktop.native
                ? "Запущено desktop-окно Electron в режиме разработки. Кнопка-булавка закрепляет его поверх других окон. Крестик завершает приложение, а «Вид → Скрыть в системный трей» прячет его без выхода."
                : "Это браузерный предпросмотр. Настоящее XP-окно, закрепление поверх программ и системный трей доступны через npm run desktop:dev на компьютере. Установщик пока не собираем."}
            </span>
          </div>
          <div className="dialog-buttons">
            <button
              className="xp-button primary"
              onClick={() => setModal(null)}
            >
              Всё понятно
            </button>
          </div>
        </Dialog>
      )}
      {modal === "assets" && (
        <Dialog title="Маскоты и авторство" onClose={() => setModal(null)} wide>
          <h2>Оригиналы узнаются сразу.</h2>
          <p className="about-intro">
            Clippy, Rover и Merlin используют оригинальные спрайт-листы и кадры
            анимаций из пакета ClippyJS. Courtney и Earl появятся после
            добавления проверенных исходных ресурсов — подменять их случайными
            персонажами не будем.
          </p>
          <div className="asset-portraits">
            {characters.map((item) => (
              <div key={item.id}>
                <Mascot id={item.id} size={85} thumbnail />
                <b>{item.name}</b>
                <span>оригинальные спрайты</span>
              </div>
            ))}
          </div>
          <div className="info-box">
            <Info size={17} />
            <span>
              Средний палец — новая векторная накладка. Уход и выглядывание —
              новые переходы. Это не оригинальные анимации Microsoft. Системные
              и облачные AI-голоса тоже не оригинальные голоса персонажей.
            </span>
          </div>
          <p className="field-help licensing">
            Код ClippyJS: MIT, © Fireplace, Inc. / Pooya Parsa. Имена, образы и
            ресурсы агентов принадлежат Microsoft и другим правообладателям. Для
            публичного распространения ресурсов потребуется отдельно проверить
            права.
          </p>
          <a
            href="https://github.com/pi0/clippyjs"
            target="_blank"
            rel="noreferrer"
            className="text-link"
          >
            Исходный проект ClippyJS <ArrowUpRight size={13} />
          </a>
          <div className="dialog-buttons">
            <button
              className="xp-button primary"
              onClick={() => setModal(null)}
            >
              Закрыть
            </button>
          </div>
        </Dialog>
      )}
    </div>
  );
}
