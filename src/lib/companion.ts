import type { DictationBridge } from "./useDictation";
import type { CharacterId, Mood } from "./characters";
import type { WordRange } from "./speech-progress";
export interface CompanionSnapshot {
  character: CharacterId;
  speechLevel?: number | null;
  clickThrough?: boolean;
  cinematic?: { kind: import("./cinematics").CinematicKind; id: number } | null;
  sendResult?: { sequence: number; success: boolean; text?: string };
  phase: Mood;
  animationMood: Mood;
  bubble: string;
  error: string;
  notice: string;
  highlight?: WordRange | null;
  pending: boolean;
  sound: boolean;
  speechBusy: boolean;
  speaking: boolean;
  quiet: boolean;
  away: boolean;
  seconds: number;
}
export type CompanionAction =
  | { type: "send"; text: string }
  | { type: "select-character"; character: CharacterId }
  | {
      type:
        | "restore"
        | "toggle-sound"
        | "return"
        | "stop-speech"
        | "cancel-reply"
        | "settings-widget"
        | "settings"
        | "minimize"
        | "maximize"
        | "close";
    };
export interface PointerState {
  available: boolean;
  enabled: boolean;
  error: string;
}
export interface HitMap {
  width: number;
  height: number;
  interacting: boolean;
  masks?: {
    x: number;
    y: number;
    width: number;
    height: number;
    columns: number;
    rows: number;
    bits: number[];
  }[];
  rects: { x: number; y: number; width: number; height: number }[];
}
export interface CompanionBridge extends DictationBridge {
  getPointerState(): Promise<PointerState>;
  setPointerPassthrough(value: boolean): Promise<PointerState>;
  publishHitMap(map: HitMap): void;
  onPointerState(callback: (state: PointerState) => void): () => void;
  ready(): Promise<boolean>;
  getSnapshot(): Promise<CompanionSnapshot | null>;
  action(action: CompanionAction): Promise<boolean>;
  onSnapshot(callback: (snapshot: CompanionSnapshot) => void): () => void;
}
declare global {
  interface Window {
    clippyCompanion?: CompanionBridge;
  }
}
export const initialCompanionSnapshot: CompanionSnapshot = {
  character: "clippy",
  phase: "idle",
  animationMood: "idle",
  bubble: "Секунду. Я почти выбрался из окна.",
  error: "",
  notice: "",
  pending: false,
  sound: false,
  speechBusy: false,
  speaking: false,
  quiet: false,
  away: false,
  seconds: 0,
};
