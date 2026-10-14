import { useEffect, useRef, useState } from "react";
import {
  BOOTSTRAP_MODELS,
  fetchFreeModels,
  type FreeModel,
} from "./free-models";
export function useFreeModels() {
  const [models, setModels] = useState<FreeModel[]>(BOOTSTRAP_MODELS),
    [loading, setLoading] = useState(false),
    [error, setError] = useState(""),
    [live, setLive] = useState(false);
  const active = useRef(true),
    request = useRef<AbortController | null>(null);
  async function refresh() {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setLoading(true);
    setError("");
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
      const result = await fetchFreeModels(controller.signal);
      if (active.current && request.current === controller) {
        setModels(result);
        setLive(true);
      }
    } catch {
      if (active.current && request.current === controller)
        setError(
          "Не удалось обновить каталог. Используется последний список; доступность моделей может измениться.",
        );
    } finally {
      clearTimeout(timer);
      if (active.current && request.current === controller) setLoading(false);
    }
  }
  useEffect(() => {
    active.current = true;
    void refresh();
    return () => {
      active.current = false;
      request.current?.abort();
    };
  }, []);
  return { models, loading, error, live, refresh };
}
