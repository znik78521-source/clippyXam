import type { SettingsData } from "../components/Settings";
export type SavedSettings = Partial<
  Pick<
    SettingsData,
    | "character"
    | "router"
    | "teamorouterPaidAcknowledged"
    | "groqFreeTierAcknowledged"
    | "intensity"
    | "sound"
    | "model"
    | "autoFallback"
    | "voice"
    | "rate"
    | "ttsProvider"
    | "clickThrough"
    | "speechMotion"
    | "authoredClippy"
  >
> & {
  systemVoices?: Partial<SettingsData["systemVoices"]>;
  companion?: Partial<SettingsData["companion"]>;
};
export function publicSettings(s: SettingsData): SavedSettings {
  return {
    character: s.character,
    router: s.router,
    teamorouterPaidAcknowledged: s.teamorouterPaidAcknowledged,
    groqFreeTierAcknowledged: s.groqFreeTierAcknowledged,
    intensity: s.intensity,
    sound: s.sound,
    model: s.model,
    autoFallback: s.autoFallback,
    voice: s.voice,
    rate: s.rate,
    ttsProvider: s.ttsProvider === "openai" ? "local" : s.ttsProvider,
    clickThrough: s.clickThrough,
    speechMotion: s.speechMotion,
    authoredClippy: s.authoredClippy,
    systemVoices: { ...s.systemVoices },
    companion: { ...s.companion },
  };
}
