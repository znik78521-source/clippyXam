import { useEffect, useRef, useState } from "react";
import { AudioCache, createBrowserVoiceDriver, SpeechQueue } from "./speech";
import type { SpeechProgress } from "./speech-progress";
import type { VoiceOptions } from "./speech";
export function useSpeech(reportError: (message: string) => void) {
  const [progress, setProgress] = useState<SpeechProgress | null>(null);
  const [activity, setActivity] = useState({ busy: false, speaking: false });
  const queueRef = useRef<SpeechQueue | null>(null);
  const cacheRef = useRef<AudioCache | null>(null);
  useEffect(() => {
    let active = true;
    const cache = new AudioCache();
    const queue = new SpeechQueue(
      createBrowserVoiceDriver(cache),
      (busy, speaking) => {
        if (active) setActivity({ busy, speaking });
      },
      (message) => {
        if (active) reportError(message);
      },
      (value) => {
        if (active) setProgress(value);
      },
    );
    cacheRef.current = cache;
    queueRef.current = queue;
    return () => {
      active = false;
      queue.stop();
      cache.clear();
      queueRef.current = null;
      cacheRef.current = null;
    };
  }, [reportError]);
  return {
    ...activity,
    progress,
    enqueue: (text: string, options: VoiceOptions) =>
      queueRef.current?.enqueue(text, options),
    stop: () => queueRef.current?.stop(),
    clearCache: () => cacheRef.current?.clear(),
  };
}
