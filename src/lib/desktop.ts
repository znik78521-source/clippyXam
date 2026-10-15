import type { SavedSettings } from "./saved-settings";
import type { NativeRequest, NativeResult } from "./openrouter-transport";
import { useCallback, useEffect, useState } from "react";
import type { DictationBridge } from "./useDictation";
import type { CompanionAction, CompanionSnapshot } from "./companion";

export interface DesktopState {
  mini: boolean;
  maximized: boolean;
  minimized: boolean;
  alwaysOnTop: boolean;
  focused: boolean;
  trayAvailable?: boolean;
  companion?: boolean;
}
export interface LocalVoiceState {
  phase: "idle" | "downloading" | "ready" | "error";
  progress: number;
  error: string;
}
export interface DesktopBridge extends DictationBridge {
  openRouterRequest?(input: NativeRequest): Promise<NativeResult>;
  openRouterCancel?(id: string): Promise<void>;
  loadSettings?(): Promise<{ settings: SavedSettings; warning: string }>;
  saveSettings?(value: SavedSettings): Promise<void>;
  getStartup?(): Promise<{ available: boolean; enabled: boolean }>;
  setStartup?(
    value: boolean,
  ): Promise<{ available: boolean; enabled: boolean }>;
  loadSavedKey?(): Promise<{ key: string; warning: string }>;
  saveKey?(key: string): Promise<void>;
  localVoiceState?(): Promise<LocalVoiceState>;
  prepareLocalVoice?(): Promise<LocalVoiceState>;
  synthesizeLocalVoice?(text: string, rate: number): Promise<Uint8Array | null>;
  stopLocalVoice?(): Promise<void>;
  onLocalVoiceState?(callback: (state: LocalVoiceState) => void): () => void;
  readonly platform: string;
  getState(): Promise<DesktopState>;
  setCompanion(value: boolean): Promise<DesktopState>;
  publishCompanion(snapshot: CompanionSnapshot): void;
  onCompanionAction(callback: (action: CompanionAction) => void): () => void;
  minimize(): Promise<DesktopState>;
  toggleMaximize(): Promise<DesktopState>;
  close(): Promise<void>;
  hideToTray(): Promise<DesktopState>;
  setMini(value: boolean): Promise<DesktopState>;
  setAlwaysOnTop(value: boolean): Promise<DesktopState>;
  onState(callback: (state: DesktopState) => void): () => void;
}
declare global {
  interface Window {
    clippyDesktop?: DesktopBridge;
  }
}

export function useDesktopWindow(reportError: (message: string) => void) {
  const [bridge] = useState(() => window.clippyDesktop);
  const [state, setState] = useState<DesktopState>({
    mini: Boolean(bridge),
    maximized: false,
    minimized: false,
    alwaysOnTop: Boolean(bridge),
    focused: true,
    trayAvailable: false,
  });
  const merge = useCallback(
    (next: DesktopState) => setState((current) => ({ ...current, ...next })),
    [],
  );
  useEffect(() => {
    if (!bridge) return;
    let active = true;
    let receivedEvent = false;
    const unsubscribe = bridge.onState((next) => {
      receivedEvent = true;
      if (active) merge(next);
    });
    bridge
      .getState()
      .then((next) => {
        if (active && !receivedEvent) merge(next);
      })
      .catch(() => {
        if (active)
          reportError("Нет связи с desktop-окном. Перезапусти приложение.");
      });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [bridge, merge, reportError]);
  const run = useCallback(
    async (operation: () => Promise<DesktopState | void>) => {
      try {
        const next = await operation();
        if (next) merge(next);
      } catch {
        reportError(
          "Не удалось выполнить команду окна. Попробуй ещё раз; трей может быть недоступен в этой ОС.",
        );
      }
    },
    [merge, reportError],
  );
  return {
    native: Boolean(bridge),
    state,
    minimize: () => bridge && void run(() => bridge.minimize()),
    toggleMaximize: () => bridge && void run(() => bridge.toggleMaximize()),
    close: () => bridge && void run(() => bridge.close()),
    hideToTray: () => bridge && void run(() => bridge.hideToTray()),
    setCompanion: (value: boolean) =>
      bridge && void run(() => bridge.setCompanion(value)),
    setMini: (value: boolean) =>
      bridge && void run(() => bridge.setMini(value)),
    setAlwaysOnTop: (value: boolean) =>
      bridge && void run(() => bridge.setAlwaysOnTop(value)),
  };
}
