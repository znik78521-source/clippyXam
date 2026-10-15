import { useEffect, useState } from "react";
import { Cable, Eye, EyeOff, Info, ShieldCheck, Volume2 } from "lucide-react";
import Dialog from "./Dialog";
import {
  cinematicNames,
  cinematicLabel,
  type CinematicKind,
} from "../lib/cinematics";
import { characters } from "../lib/characters";
import type { useFreeModels } from "../lib/useFreeModels";
import { DEFAULT_MODEL, isFreeModel } from "../lib/chat";
import type { CharacterId, Intensity } from "../lib/characters";
import type { CompanionPreferences } from "../lib/preferences";
export interface SettingsData {
  character: CharacterId;
  intensity: Intensity;
  sound: boolean;
  widget: boolean;
  clickThrough: boolean;
  speechMotion: boolean;
  key: string;
  model: string;
  autoFallback: boolean;
  voice: string;
  rate: number;
  ttsProvider: "system" | "openai" | "local";
  ttsKey: string;
  systemVoices: Record<CharacterId, string>;
  cloudVoices: Record<CharacterId, string>;
  companion: CompanionPreferences;
}
export default function Settings({
  settings,
  voices,
  onSave,
  onClose,
  modelCatalog,
  localVoiceState,
  onPreview,
}: {
  settings: SettingsData;
  modelCatalog: ReturnType<typeof useFreeModels>;
  voices: SpeechSynthesisVoice[];
  localVoiceState?: import("../lib/desktop").LocalVoiceState | null;
  onPreview?: (kind: CinematicKind) => void;
  onSave: (data: SettingsData) => void | Promise<void>;
  onClose: () => void;
}) {
  const [preview, setPreview] = useState<CinematicKind>("bat");
  const [draft, setDraft] = useState(settings);
  const [tab, setTab] = useState<"connection" | "voice" | "behavior">(
    "connection",
  );
  const [showKey, setShowKey] = useState(false);
  const [validation, setValidation] = useState("");
  const [startup, setStartup] = useState({ available: false, enabled: false });
  const [startWithWindows, setStartWithWindows] = useState(false);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    let active = true;
    void window.clippyDesktop
      ?.getStartup?.()
      .then((value) => {
        if (active) {
          setStartup(value);
          setStartWithWindows(value.enabled);
        }
      })
      .catch(() => {
        if (active)
          setValidation("Не удалось прочитать настройку автозапуска.");
      });
    return () => {
      active = false;
    };
  }, []);
  return (
    <Dialog title="Свойства: clippyXam" onClose={onClose} wide>
      <div className="dialog-heading">
        <div className="dialog-icon">
          <Cable size={28} />
        </div>
        <div>
          <h2>
            {tab === "connection"
              ? "Добавим ему мозги."
              : tab === "voice"
                ? "Дадим ему голос."
                : "Настроим характер."}
          </h2>
          <p>
            {tab === "connection"
              ? "Один ключ. Много непрошеных советов."
              : tab === "voice"
                ? "Разные тембры. Всё тот же характер."
                : "Ты решаешь, где заканчиваются шутки."}
          </p>
        </div>
      </div>
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          if (!isFreeModel(draft.model.trim())) {
            setTab("connection");
            setValidation(
              "Укажи openrouter/free или ID бесплатной модели с суффиксом :free.",
            );
            return;
          }
          if (draft.ttsProvider === "openai" && !draft.ttsKey.trim()) {
            setTab("voice");
            setValidation("Для OpenAI TTS нужен отдельный API-ключ.");
            return;
          }
          setSaving(true);
          try {
            if (startWithWindows !== startup.enabled) {
              const result =
                await window.clippyDesktop?.setStartup?.(startWithWindows);
              if (!result) throw new Error("Автозапуск недоступен.");
              setStartup(result);
            }
            await onSave({
              ...draft,
              key: draft.key.trim(),
              ttsKey: draft.ttsKey.trim(),
              model: draft.model.trim(),
            });
          } catch {
            setValidation(
              "Не удалось применить настройки. Проверь права записи. Изменённый автозапуск мог сохраниться отдельно.",
            );
          } finally {
            setSaving(false);
          }
        }}
      >
        <div
          className="settings-tabs"
          role="tablist"
          aria-label="Раздел настроек"
        >
          {(
            [
              ["connection", "Подключение"],
              ["voice", "Голос"],
              ["behavior", "Поведение"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              id={`settings-tab-${id}`}
              aria-controls={`settings-panel-${id}`}
              aria-selected={tab === id}
              tabIndex={tab === id ? 0 : -1}
              onKeyDown={(event) => {
                const ids = ["connection", "voice", "behavior"] as const;
                const current = ids.indexOf(id);
                const next =
                  event.key === "ArrowRight"
                    ? (current + 1) % 3
                    : event.key === "ArrowLeft"
                      ? (current + 2) % 3
                      : event.key === "Home"
                        ? 0
                        : event.key === "End"
                          ? 2
                          : -1;
                if (next >= 0) {
                  event.preventDefault();
                  setTab(ids[next]);
                  document.getElementById(`settings-tab-${ids[next]}`)?.focus();
                }
              }}
              onClick={() => setTab(id)}
            >
              {label}
            </button>
          ))}
        </div>
        <fieldset
          id="settings-panel-connection"
          role="tabpanel"
          aria-labelledby="settings-tab-connection"
          hidden={tab !== "connection"}
        >
          <legend>Подключение</legend>
          <label className="field-label" htmlFor="character">
            Персонаж
          </label>
          <select
            id="character"
            value={draft.character}
            onChange={(event) =>
              setDraft({
                ...draft,
                character: event.target.value as CharacterId,
              })
            }
          >
            {characters.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
            <option disabled>Courtney — нет ресурсов</option>
            <option disabled>Earl — нет ресурсов</option>
          </select>
          <label className="behavior-option">
            <input
              type="checkbox"
              checked={draft.widget}
              onChange={(event) =>
                setDraft({ ...draft, widget: event.target.checked })
              }
            />
            Виджет на рабочем столе
          </label>
          <p className="field-help">
            Без фона окна, со стилизованными кнопками закрытия и сворачивания. В
            браузере — только предпросмотр внутри страницы.
          </p>
          <label className="behavior-option">
            <input
              type="checkbox"
              checked={draft.clickThrough}
              disabled={!window.clippyDesktop}
              onChange={(event) =>
                setDraft({ ...draft, clickThrough: event.target.checked })
              }
            />
            Пропускать клики через прозрачные участки виджета
          </label>
          <p className="field-help">
            Только Windows-виджет. Рамка, ввод и кнопки остаются доступны; при
            сбое пропуск отключается. Вернуть окно можно через трей. Во время
            сценок и выглядывания область персонажа защищена целиком.
          </p>
          <label className="behavior-option">
            <input
              type="checkbox"
              checked={startWithWindows}
              disabled={!startup.available || saving}
              onChange={(event) => setStartWithWindows(event.target.checked)}
            />
            Запускать при входе в Windows
          </label>
          <p className="field-help">
            По умолчанию выключено. Только portable EXE, без прав
            администратора. После перемещения файла выключи и снова включи
            автозапуск из новой папки. Удаляя приложение, сначала выключи его
            здесь.
          </p>
          <label className="field-label" htmlFor="api-key">
            API-ключ OpenRouter
          </label>
          <div className="password-field">
            <input
              id="api-key"
              type={showKey ? "text" : "password"}
              autoComplete="off"
              spellCheck={false}
              placeholder="sk-or-v1-…"
              value={draft.key}
              onChange={(event) =>
                setDraft({ ...draft, key: event.target.value })
              }
            />
            <button
              type="button"
              aria-label={showKey ? "Скрыть ключ" : "Показать ключ"}
              onClick={() => setShowKey(!showKey)}
            >
              {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
          <div className="field-help">
            Получить ключ можно на{" "}
            <a
              href="https://openrouter.ai/keys"
              target="_blank"
              rel="noreferrer"
            >
              openrouter.ai ↗
            </a>
          </div>
          <button type="button" onClick={() => setDraft({ ...draft, key: "" })}>
            Удалить сохранённый ключ при применении
          </button>
          <p className="field-help">
            В Windows ключ сохраняется зашифрованным, привязан к твоей учётной
            записи. После переноса portable на другой компьютер может
            понадобиться повторный ввод. Новый ключ каждый раз создавать не
            нужно.
          </p>
          <label className="field-label" htmlFor="model">
            Бесплатная модель
          </label>
          <select
            id="model"
            value={draft.model}
            onChange={(event) =>
              setDraft({ ...draft, model: event.target.value })
            }
          >
            <option value={DEFAULT_MODEL}>
              Автовыбор: компактные → резерв → free router
            </option>
            {!modelCatalog.models.some((m) => m.id === draft.model) &&
              draft.model !== DEFAULT_MODEL && (
                <option value={draft.model}>
                  {draft.model} — нет в текущем каталоге
                </option>
              )}
            <optgroup label="Компактные — приоритет скорости">
              {modelCatalog.models
                .filter((m) => m.group === "fast")
                .map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
            </optgroup>
            <optgroup label="Другие бесплатные — резерв">
              {modelCatalog.models
                .filter((m) => m.group === "reserve")
                .map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
            </optgroup>
          </select>
          <button
            type="button"
            disabled={modelCatalog.loading}
            onClick={() => void modelCatalog.refresh()}
          >
            {modelCatalog.loading
              ? "Обновляю список…"
              : "Обновить список моделей"}
          </button>
          <p className="field-help" role="status">
            {modelCatalog.error ||
              (modelCatalog.live
                ? `Бесплатных текстовых моделей в каталоге: ${modelCatalog.models.length}.`
                : "Встроенный список до обновления каталога.")}{" "}
            Компактность — ориентир, не замер скорости. Доступность и очереди
            меняются.
          </p>
          <label className="behavior-option">
            <input
              type="checkbox"
              checked={draft.autoFallback}
              onChange={(event) =>
                setDraft({ ...draft, autoFallback: event.target.checked })
              }
            />
            Если не отвечает — пробовать другую бесплатную модель
          </label>
          <p className="field-help">
            До четырёх разных моделей, до 9 секунд на каждую. При HTTP 400
            следующая получает упрощённый совместимый запрос. Ключ/аккаунт
            (401/402/403) не перебираются. Каждый запрос расходует бесплатный
            лимит; платного fallback нет. Текст может попасть к нескольким
            провайдерам с разными правилами хранения.
          </p>
        </fieldset>
        <fieldset
          id="settings-panel-voice"
          role="tabpanel"
          aria-labelledby="settings-tab-voice"
          hidden={tab !== "voice"}
        >
          <legend>
            <Volume2 size={13} /> Озвучка
          </legend>
          <label className="behavior-option">
            <input
              type="checkbox"
              checked={draft.sound}
              onChange={(event) =>
                setDraft({ ...draft, sound: event.target.checked })
              }
            />
            Озвучивать ответы
          </label>
          <p className="field-help">
            Голосовой ввод: кнопка микрофона в главном окне. В Windows нужен
            совместимый ru-RU распознаватель System.Speech; обычного языкового
            пакета может быть недостаточно. В браузере распознавание может
            использовать сервис его поставщика. Текст сначала попадает в поле, а
            не отправляется сразу.
          </p>
          <label className="field-label" htmlFor="tts-provider">
            Провайдер голоса
          </label>
          <select
            id="tts-provider"
            value={draft.ttsProvider}
            onChange={(event) =>
              setDraft({
                ...draft,
                ttsProvider: event.target.value as SettingsData["ttsProvider"],
              })
            }
          >
            {window.clippyDesktop?.synthesizeLocalVoice && (
              <option value="local">
                Piper Denis — русский, локально и бесплатно
              </option>
            )}
            <option value="system">Системный голос — без API-ключа</option>
            <option value="openai">OpenAI TTS — платный API</option>
          </select>
          {draft.ttsProvider === "openai" && (
            <>
              <label className="field-label" htmlFor="tts-key">
                Отдельный ключ OpenAI TTS
              </label>
              <input
                id="tts-key"
                type="password"
                autoComplete="off"
                spellCheck={false}
                value={draft.ttsKey}
                onChange={(event) =>
                  setDraft({ ...draft, ttsKey: event.target.value })
                }
                placeholder="sk-…"
              />
              <div className="info-box voice-cost">
                После включения динамика текст реплик отправляется OpenAI. Новая
                реплика — платный запрос; повторные есть в кэше только до
                закрытия окна/смены настроек. Ключ OpenRouter сюда не подходит.
                AI-голоса, не оригинальные голоса маскотов. Модель: tts-1. Лимит
                — 30 новых запросов на эту сессию (ошибки тоже считаются); смена
                настроек лимит не сбрасывает.
              </div>
            </>
          )}
          {draft.ttsProvider === "local" && (
            <p className="field-help">
              Русский голос скачивается автоматически один раз (63 МБ) с Hugging
              Face. Далее работает без сети и без голосов Windows. Текст никуда
              не отправляется. Один голос Denis для всех персонажей.
              <br />
              {localVoiceState?.phase === "ready"
                ? "Голос готов."
                : localVoiceState?.phase === "downloading"
                  ? `Загрузка: ${localVoiceState.progress}%`
                  : localVoiceState?.error || "Подготовка голоса…"}
              {localVoiceState?.phase === "error" && (
                <button
                  type="button"
                  onClick={() =>
                    void window.clippyDesktop
                      ?.prepareLocalVoice?.()
                      .catch(() => {})
                  }
                >
                  Повторить загрузку
                </button>
              )}
            </p>
          )}
          {draft.ttsProvider !== "local" &&
            characters.map((character) => (
              <div key={character.id}>
                <label
                  className="field-label"
                  htmlFor={`voice-${character.id}`}
                >
                  {character.name}
                </label>
                <select
                  id={`voice-${character.id}`}
                  value={
                    (draft.ttsProvider === "system"
                      ? draft.systemVoices
                      : draft.cloudVoices)[character.id]
                  }
                  onChange={(event) => {
                    const field =
                      draft.ttsProvider === "system"
                        ? "systemVoices"
                        : "cloudVoices";
                    setDraft({
                      ...draft,
                      [field]: {
                        ...draft[field],
                        [character.id]: event.target.value,
                      },
                    });
                  }}
                >
                  {draft.ttsProvider === "system" ? (
                    <>
                      <option value="">
                        Русский голос / общий по умолчанию
                      </option>
                      {voices.map((voice) => (
                        <option key={voice.voiceURI} value={voice.voiceURI}>
                          {voice.name} · {voice.lang}
                        </option>
                      ))}
                    </>
                  ) : (
                    ["alloy", "echo", "fable", "onyx", "nova", "shimmer"].map(
                      (voice) => <option key={voice}>{voice}</option>,
                    )
                  )}
                </select>
              </div>
            ))}
          <div hidden={draft.ttsProvider !== "system"}>
            <label className="field-label" htmlFor="voice">
              Общий голос по умолчанию
            </label>
            <select
              id="voice"
              value={draft.voice}
              onChange={(event) =>
                setDraft({ ...draft, voice: event.target.value })
              }
            >
              <option value="">Русский голос автоматически</option>
              {voices.map((voice) => (
                <option key={voice.voiceURI} value={voice.voiceURI}>
                  {voice.name} · {voice.lang}
                </option>
              ))}
            </select>
          </div>
          <label className="setting-check">
            <input
              type="checkbox"
              checked={draft.speechMotion}
              onChange={(event) =>
                setDraft({ ...draft, speechMotion: event.target.checked })
              }
            />
            Двигаться в такт озвучке
          </label>
          <p className="field-help">
            Для Piper — по громкости воспроизводимого WAV, не по буквам и не во
            время загрузки. Это ритм речи, не точные фонемы рта. Reduced motion
            отключает движение.
          </p>
          <label className="rate-label" htmlFor="rate">
            Скорость <span>{draft.rate.toFixed(1)}×</span>
          </label>
          <input
            id="rate"
            type="range"
            min="0.7"
            max="1.4"
            step="0.1"
            value={draft.rate}
            onChange={(event) =>
              setDraft({ ...draft, rate: Number(event.target.value) })
            }
          />
          <p className="field-help">
            Голоса зависят от браузера и ОС. Некоторые используют облачный
            синтез.
          </p>
        </fieldset>
        <fieldset
          id="settings-panel-behavior"
          role="tabpanel"
          aria-labelledby="settings-tab-behavior"
          hidden={tab !== "behavior"}
        >
          <legend>Характер и границы</legend>
          <label className="field-label" htmlFor="cinematic-preview">
            Просмотр мемной сценки
          </label>
          <select
            id="cinematic-preview"
            value={preview}
            onChange={(event) =>
              setPreview(event.target.value as CinematicKind)
            }
          >
            {cinematicNames.map((kind) => (
              <option key={kind} value={kind}>
                {cinematicLabel[kind]}
              </option>
            ))}
          </select>
          <button type="button" onClick={() => onPreview?.(preview)}>
            Показать сценку
          </button>
          <p className="field-help">
            Только анимации в окне. Файлы и Windows не затрагиваются.
          </p>
          <label className="field-label" htmlFor="intensity">
            Характер
          </label>
          <select
            id="intensity"
            value={draft.intensity}
            onChange={(event) =>
              setDraft({ ...draft, intensity: event.target.value as Intensity })
            }
          >
            <option value="soft">Мягко</option>
            <option value="normal">С характером</option>
            <option value="wild">Без тормозов</option>
          </select>
          <label className="setting-check">
            <input
              type="checkbox"
              checked={draft.companion.backgroundQuips}
              onChange={(event) =>
                setDraft({
                  ...draft,
                  companion: {
                    ...draft.companion,
                    backgroundQuips: event.target.checked,
                  },
                })
              }
            />
            Самостоятельно выглядывать и комментировать
          </label>
          <label className="setting-check">
            <input
              type="checkbox"
              checked={draft.companion.allowRude}
              onChange={(event) =>
                setDraft({
                  ...draft,
                  companion: {
                    ...draft.companion,
                    allowRude: event.target.checked,
                  },
                })
              }
            />
            Разрешить грубый жест (кроме мягкого режима)
          </label>
          <label className="setting-check">
            <input
              type="checkbox"
              checked={draft.companion.quietEnabled}
              onChange={(event) =>
                setDraft({
                  ...draft,
                  companion: {
                    ...draft.companion,
                    quietEnabled: event.target.checked,
                  },
                })
              }
            />
            Тихие часы: без голоса и фоновых реплик
          </label>
          <div className="quiet-hours">
            <label>
              С{" "}
              <input
                aria-label="Начало тихих часов"
                type="time"
                value={draft.companion.quietStart}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    companion: {
                      ...draft.companion,
                      quietStart: event.target.value,
                    },
                  })
                }
              />
            </label>
            <label>
              До{" "}
              <input
                aria-label="Конец тихих часов"
                type="time"
                value={draft.companion.quietEnd}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    companion: {
                      ...draft.companion,
                      quietEnd: event.target.value,
                    },
                  })
                }
              />
            </label>
          </div>
          <p className="field-help">
            Местное время компьютера. Одинаковые начало и конец — без тихого
            интервала. На сообщения продолжит отвечать текстом.
          </p>
          <label className="setting-check">
            <input
              type="checkbox"
              checked={draft.companion.rememberSession}
              onChange={(event) =>
                setDraft({
                  ...draft,
                  companion: {
                    ...draft.companion,
                    rememberSession: event.target.checked,
                  },
                })
              }
            />
            Помнить отдельный диалог каждого маскота в этой сессии
          </label>
          <p className="field-help">
            Только оперативная память, до закрытия/перезагрузки. При отключении
            сохранённые диалоги других маскотов удаляются. «Новый диалог»
            очищает текущий. Для прекращения подколов напиши «без подколов» или
            выбери «Мягко».
          </p>
        </fieldset>
        <div className="privacy-note">
          <ShieldCheck size={19} />
          <span>
            Ключ OpenRouter в Windows сохраняется зашифрованным и отправляется
            только OpenRouter. Ключ OpenAI TTS — только в памяти и отправляется
            OpenAI (если выбран). Настройки персонажа, модели, голоса и
            поведения сохраняются отдельно без ключей и переписки. Виджет
            открывается вручную; платный TTS после перезапуска не включается.
            История и кэш аудио не сохраняются после перезагрузки.
          </span>
        </div>
        {validation && (
          <p className="error-text" role="alert">
            <Info size={14} />
            {validation}
          </p>
        )}
        <div className="dialog-buttons">
          <button className="nt-button primary" type="submit" disabled={saving}>
            Применить
          </button>
          <button
            className="nt-button"
            type="button"
            onClick={onClose}
            disabled={saving}
          >
            Отмена
          </button>
        </div>
      </form>
    </Dialog>
  );
}
