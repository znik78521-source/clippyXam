export interface NativeRequest {
  id: string;
  kind: "models" | "chat";
  key?: string;
  body?: unknown;
}
export interface NativeResult {
  status?: number;
  data?: unknown;
  error?: string;
}
export class TransportError extends Error {
  constructor(public code: string) {
    const descriptions: Record<string, string> = {
      DNS: "Не удалось найти openrouter.ai через DNS. Проверь DNS и доступность сервиса в своей сети.",
      TLS: "Не прошла проверка HTTPS-сертификата OpenRouter. Проверь дату Windows, прокси и HTTPS-фильтрацию антивируса; защиту не отключай.",
      PROXY:
        "Прокси не пропускает соединение с OpenRouter. Проверь настройки прокси/VPN.",
      OFFLINE: "Нет подключения к интернету.",
      CONNECTION:
        "Соединение с OpenRouter сброшено или отклонено. Проверь сеть, прокси/VPN и разрешение приложения в брандмауэре.",
      NETWORK:
        "Сетевой сбой при подключении к OpenRouter. Проверь доступ к openrouter.ai в этой сети.",
      BROWSER:
        "Браузер не смог обратиться к OpenRouter (сеть/CORS). В portable используется отдельный сетевой транспорт.",
      INVALID_KEY:
        "В ключе есть пробелы, переносы или нелатинские символы. Вставь только сам API-ключ OpenRouter.",
      INVALID_REQUEST:
        "Приложение отклонило некорректный формат запроса. Обнови portable и сообщи этот код ошибки.",
      TIMEOUT: "Соединение с OpenRouter не ответило вовремя.",
      RESPONSE_TOO_LARGE: "OpenRouter вернул слишком большой ответ.",
      BUSY: "Предыдущий сетевой запрос ещё завершается. Попробуй снова.",
      ABORTED: "Запрос отменён.",
    };
    super(
      `[${Object.hasOwn(descriptions, code) ? code : "NETWORK"}] ${Object.hasOwn(descriptions, code) ? descriptions[code] : descriptions.NETWORK}`,
    );
  }
}
export async function openRouterFetch(
  kind: "models" | "chat",
  init: RequestInit,
): Promise<Pick<Response, "ok" | "status" | "json">> {
  const signal = init.signal;
  signal?.throwIfAborted();
  const bridge =
    typeof window !== "undefined" ? window.clippyDesktop : undefined;
  if (!bridge?.openRouterRequest || !bridge.openRouterCancel) {
    try {
      return await fetch(
        `https://openrouter.ai/api/v1/${kind === "chat" ? "chat/completions" : "models"}`,
        init,
      );
    } catch (error) {
      signal?.throwIfAborted();
      if (error instanceof TypeError) throw new TransportError("BROWSER");
      throw error;
    }
  }
  const id = crypto.randomUUID();
  let aborted!: () => void;
  const cancellation = new Promise<never>((_, reject) => {
    aborted = () => {
      void bridge.openRouterCancel!(id).catch(() => {});
      reject(signal?.reason ?? new DOMException("Aborted", "AbortError"));
    };
    signal?.addEventListener("abort", aborted, { once: true });
  });
  try {
    const headers = new Headers(init.headers);
    const request: NativeRequest = {
      id,
      kind,
      ...(kind === "chat"
        ? {
            key: headers.get("Authorization")?.replace(/^Bearer /, ""),
            body: JSON.parse(String(init.body)),
          }
        : {}),
    };
    let result: NativeResult,
      busyRetries = 0;
    while (true) {
      result = await Promise.race([
        bridge.openRouterRequest(request),
        cancellation,
      ]);
      signal?.throwIfAborted();
      if (result.error !== "BUSY" || busyRetries >= 6) break;
      // A catalogue refresh or a just-cancelled native request may briefly own
      // both transport slots. Queue instead of dropping the user's chat message.
      await Promise.race([
        new Promise<void>((resolve) =>
          setTimeout(resolve, Math.min(1000, 120 * 2 ** busyRetries)),
        ),
        cancellation,
      ]);
      busyRetries++;
    }
    signal?.throwIfAborted();
    if (result.error) throw new TransportError(result.error);
    if (!result.status) throw new TransportError("NETWORK");
    return {
      ok: result.status >= 200 && result.status < 300,
      status: result.status,
      json: async () => result.data,
    };
  } catch (error) {
    signal?.throwIfAborted();
    if (error instanceof TransportError) throw error;
    throw new TransportError("NETWORK");
  } finally {
    signal?.removeEventListener("abort", aborted);
  }
}
