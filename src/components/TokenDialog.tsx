import { useState } from "react";
import Dialog from "./Dialog";
import { DEFAULT_MODEL } from "../lib/chat";
import type { RouterId } from "../lib/routers";
const onboarding: Record<RouterId, { name: string; url: string; link: string; placeholder: string; note: string }> = {
  openrouter: {
    name: "OpenRouter",
    url: "https://openrouter.ai/keys",
    link: "openrouter.ai/keys",
    placeholder: "sk-or-v1-…",
    note: `Используются только маршруты с нулевой ценой. Стандартный резерв — ${DEFAULT_MODEL}; платный fallback отключён.`,
  },
  groq: {
    name: "Groq Free tier",
    url: "https://console.groq.com/keys",
    link: "console.groq.com/keys",
    placeholder: "gsk_…",
    note: "Модели и их доступность в Free tier зависят от актуальных условий Groq. Оставь аккаунт на бесплатном тарифе: приложение не может проверить тариф или списания. Проверь доступность выбранной модели в консоли.",
  },
  teamorouter: {
    name: "TeamoRouter",
    url: "https://teamorouter.com/dashboard?tab=api-keys",
    link: "teamorouter.com/dashboard",
    placeholder: "API-ключ TeamoRouter",
    note: "TeamoRouter тарифицируется по использованию. Даже модель со словом Free в названии может иметь ненулевую цену. Проверь тариф и подтверждение платного использования в настройках.",
  },
};
export default function TokenDialog({
  router,
  onSave,
  onClose,
}: {
  router: RouterId;
  onSave: (key: string) => void;
  onClose: () => void;
}) {
  const [key, setKey] = useState("");
  const info = onboarding[router];
  return (
    <Dialog title={`Подключение к ${info.name}`} onClose={onClose}>
      <h2>Нужен API-ключ {info.name}</h2>
      <p>Создай или скопируй ключ в кабинете выбранного провайдера.</p>
      <ol>
        <li>
          Открой <a href={info.url} target="_blank" rel="noreferrer">{info.link}</a>.
        </li>
        <li>Создай ключ API и скопируй его.</li>
        <li>Вставь его ниже. Не присылай ключ другим людям.</li>
      </ol>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (key.trim()) onSave(key.trim());
        }}
      >
        <label className="field-label" htmlFor="onboarding-key">
          API-ключ {info.name}
        </label>
        <input
          id="onboarding-key"
          type="password"
          autoComplete="off"
          spellCheck={false}
          maxLength={512}
          placeholder={info.placeholder}
          value={key}
          onChange={(event) => setKey(event.target.value)}
          autoFocus
        />
        <p className="field-help">
          {info.note} У каждого провайдера собственные лимиты и политика хранения. В Windows ключ сохраняется отдельно и шифруется DPAPI; в браузере остаётся только в памяти. Доступ проверяется первым запросом.
        </p>
        <div className="dialog-buttons">
          <button className="nt-button primary" disabled={!key.trim()} type="submit">
            Подключить
          </button>
          <button className="nt-button" type="button" onClick={onClose}>
            Закрыть
          </button>
        </div>
      </form>
    </Dialog>
  );
}
