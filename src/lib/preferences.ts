import type { CharacterId } from "./characters";
export interface CompanionPreferences {
  backgroundQuips: boolean;
  allowRude: boolean;
  quietEnabled: boolean;
  quietStart: string;
  quietEnd: string;
  rememberSession: boolean;
}
export const defaultPreferences: CompanionPreferences = {
  backgroundQuips: true,
  allowRude: true,
  quietEnabled: false,
  quietStart: "23:00",
  quietEnd: "08:00",
  rememberSession: false,
};
export const defaultVoiceMap: Record<CharacterId, string> = {
  clippy: "",
  rover: "",
  merlin: "",
};
export const defaultCloudVoices: Record<CharacterId, string> = {
  clippy: "alloy",
  rover: "nova",
  merlin: "onyx",
};
export function isQuietTime(prefs: CompanionPreferences, date = new Date()) {
  const minutes = (value: string) =>
    /^([01]\d|2[0-3]):[0-5]\d$/.test(value)
      ? Number(value.slice(0, 2)) * 60 + Number(value.slice(3))
      : -1;
  const start = minutes(prefs.quietStart),
    end = minutes(prefs.quietEnd),
    now = date.getHours() * 60 + date.getMinutes();
  if (!prefs.quietEnabled || start < 0 || end < 0 || start === end)
    return false;
  return start < end ? now >= start && now < end : now >= start || now < end;
}
