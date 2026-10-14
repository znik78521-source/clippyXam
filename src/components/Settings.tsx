import { useState } from "react";
import { Cable, Eye, EyeOff, Info, ShieldCheck, Volume2 } from "lucide-react";
import Dialog from "./Dialog";
import { characters } from "../lib/characters";
import type { CharacterId } from "../lib/characters";
import type { CompanionPreferences } from "../lib/preferences";
export interface SettingsData {
  mode: "demo" | "live";
  key: string;
  model: string;
  voice: string;
  rate: number;
  ttsProvider: "system" | "openai";
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
}: {
  settings: SettingsData;
  voices: SpeechSynthesisVoice[];
  onSave: (data: SettingsData) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(settings);
  const [tab, setTab] = useState<"connection" | "voice" | "behavior">(
    "connection",
  );
  const [showKey, setShowKey] = useState(false);
  const [validation, setValidation] = useState("");
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
        onSubmit={(event) => {
          event.preventDefault();
          if (
            draft.mode === "live" &&
            (!draft.key.trim() || !draft.model.trim())
          ) {
            setTab("connection");
            setValidation("Укажи API-ключ и ID модели.");
            return;
          }
          if (draft.ttsProvider === "openai" && !draft.ttsKey.trim()) {
            setTab("voice");
            setValidation("Для OpenAI TTS нужен отдельный API-ключ.");
            return;
          }
          onSave({
            ...draft,
            key: draft.key.trim(),
            ttsKey: draft.ttsKey.trim(),
            model: draft.model.trim(),
          });
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
          <div className="mode-options">
            <label className={draft.mode === "demo" ? "chosen" : ""}>
              <input
                type="radio"
                name="mode"
                checked={draft.mode === "demo"}
                onChange={() => setDraft({ ...draft, mode: "demo" })}
              />
              <span>
                <b>Демо-режим</b>
                <small>Локальные реплики, без API</small>
              </span>
            </label>
            <label className={draft.mode === "live" ? "chosen" : ""}>
              <input
                type="radio"
                name="mode"
                checked={draft.mode === "live"}
                onChange={() => setDraft({ ...draft, mode: "live" })}
              />
              <span>
                <b>OpenRouter</b>
                <small>Настоящий AI-диалог</small>
              </span>
            </label>
          </div>
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
          <label className="field-label" htmlFor="model">
            ID модели
          </label>
          <input
            id="model"
            value={draft.model}
            onChange={(event) =>
              setDraft({ ...draft, model: event.target.value })
            }
            placeholder="google/gemini-2.5-flash"
            spellCheck={false}
          />
          <p className="field-help">
            Укажи доступную тебе текстовую модель из каталога OpenRouter.
            Запросы могут быть платными.
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
          {characters.map((character) => (
            <div key={character.id}>
              <label className="field-label" htmlFor={`voice-${character.id}`}>
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
                    <option value="">Русский голос / общий по умолчанию</option>
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
            Ключи — только в памяти: ключ чата отправляется OpenRouter, ключ
            голоса — OpenAI (если выбран). История и кэш аудио не сохраняются
            после перезагрузки.
          </span>
        </div>
        {validation && (
          <p className="error-text" role="alert">
            <Info size={14} />
            {validation}
          </p>
        )}
        <div className="dialog-buttons">
          <button className="xp-button primary" type="submit">
            Применить
          </button>
          <button className="xp-button" type="button" onClick={onClose}>
            Отмена
          </button>
        </div>
      </form>
    </Dialog>
  );
}
