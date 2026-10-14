import { useState } from "react";
import Dialog from "./Dialog";
import { DEFAULT_MODEL } from "../lib/chat";
export default function TokenDialog({
  onSave,
  onClose,
}: {
  onSave: (key: string) => void;
  onClose: () => void;
}) {
  const [key, setKey] = useState("");
  return (
    <Dialog title="Подключение к OpenRouter" onClose={onClose}>
      <h2>Нужен API-ключ</h2>
      <p>Для диалога подключи свой аккаунт OpenRouter.</p>
      <ol>
        <li>
          Зарегистрируйся или войди на{" "}
          <a href="https://openrouter.ai/keys" target="_blank" rel="noreferrer">
            openrouter.ai/keys
          </a>
          .
        </li>
        <li>
          Нажми <b>Create Key</b>, задай название и создай ключ.
        </li>
        <li>Скопируй его и вставь ниже. Не присылай ключ другим людям.</li>
      </ol>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (key.trim()) onSave(key.trim());
        }}
      >
        <label className="field-label" htmlFor="onboarding-key">
          API-ключ OpenRouter
        </label>
        <input
          id="onboarding-key"
          type="password"
          autoComplete="off"
          spellCheck={false}
          maxLength={512}
          value={key}
          onChange={(event) => setKey(event.target.value)}
          autoFocus
        />
        <p className="field-help">
          По умолчанию — автовыбор бесплатных моделей, резерв {DEFAULT_MODEL}. У
          сервиса есть лимиты и очереди; платные модели не подставляются. При
          отказе запрос может перейти к другому бесплатному провайдеру. Правила
          хранения данных у них различаются. В Windows ключ сохраняется
          зашифрованным для твоей учётной записи. В браузере — только в памяти.
          Проверяется первым запросом.
        </p>
        <div className="dialog-buttons">
          <button
            className="nt-button primary"
            disabled={!key.trim()}
            type="submit"
          >
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
