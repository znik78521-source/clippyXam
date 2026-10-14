import { useEffect, useRef, useState } from "react";
export interface DictationBridge {
  startDictation(): Promise<string>;
  stopDictation(): Promise<void>;
}
interface Recognition {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult:
    | ((event: {
        results: ArrayLike<ArrayLike<{ transcript: string }>>;
      }) => void)
    | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  abort(): void;
}
declare global {
  interface Window {
    SpeechRecognition?: new () => Recognition;
    webkitSpeechRecognition?: new () => Recognition;
  }
}
export function useDictation(
  onText: (text: string) => void,
  onError: (text: string) => void,
) {
  const [listening, setListening] = useState(false);
  const generation = useRef(0);
  const recognition = useRef<Recognition | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const bridge: DictationBridge | undefined =
    window.clippyCompanion || window.clippyDesktop;
  function stop() {
    generation.current++;
    clearTimeout(timer.current);
    recognition.current?.abort();
    recognition.current = null;
    void bridge?.stopDictation?.().catch(() => {});
    setListening(false);
  }
  useEffect(() => {
    const hidden = () => {
      if (document.hidden) stop();
    };
    document.addEventListener("visibilitychange", hidden);
    return () => document.removeEventListener("visibilitychange", hidden);
  }, []);
  useEffect(
    () => () => {
      generation.current++;
      clearTimeout(timer.current);
      recognition.current?.abort();
      void bridge?.stopDictation?.().catch(() => {});
    },
    [],
  );
  async function start() {
    if (listening) {
      stop();
      return;
    }
    const id = ++generation.current;
    setListening(true);
    if (bridge) {
      try {
        const text = await bridge.startDictation();
        if (id === generation.current) {
          if (text) onText(text.slice(0, 2000));
          else
            onError(
              "Речь не распознана. Попробуй ещё раз или нажми поле ввода и Win+H.",
            );
        }
      } catch (cause) {
        if (id === generation.current)
          onError(
            (cause instanceof Error
              ? cause.message
                  .replace(
                    /^Error invoking remote method '[^']+': (Error: )?/,
                    "",
                  )
                  .slice(0, 250)
              : "Голосовой ввод недоступен.") +
              " Запасной способ в Windows: нажми поле ввода, затем Win+H. Текст можно ввести вручную.",
          );
      } finally {
        if (id === generation.current) setListening(false);
      }
      return;
    }
    const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Ctor) {
      setListening(false);
      onError(
        "Браузер не поддерживает распознавание речи. Введи текст вручную.",
      );
      return;
    }
    let service: Recognition;
    try {
      service = new Ctor();
    } catch {
      setListening(false);
      onError("Не удалось открыть распознаватель. Введи текст вручную.");
      return;
    }
    recognition.current = service;
    service.lang = "ru-RU";
    service.continuous = false;
    service.interimResults = false;
    service.onresult = (event) => {
      if (id === generation.current)
        onText(
          Array.from(event.results)
            .map((result) => result[0].transcript)
            .join(" ")
            .slice(0, 2000),
        );
    };
    service.onerror = (event) => {
      if (id === generation.current)
        onError(
          event.error === "not-allowed"
            ? "Разреши доступ к микрофону в браузере."
            : "Не удалось распознать речь. Попробуй ещё раз или введи текст.",
        );
    };
    service.onend = () => {
      if (id === generation.current) {
        clearTimeout(timer.current);
        setListening(false);
        recognition.current = null;
      }
    };
    try {
      service.start();
      timer.current = setTimeout(stop, 20000);
    } catch {
      setListening(false);
      onError("Не удалось включить микрофон.");
    }
  }
  return { listening, start, stop };
}
