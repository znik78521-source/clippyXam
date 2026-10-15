import type { CharacterId, Mood } from "./characters";
export type Direction = "left" | "right" | "up" | "down" | "still";
export const originalActions: Record<CharacterId, string[]> = {
  clippy: [
    "Greeting",
    "Wave",
    "GetArtsy",
    "GetTechy",
    "GetWizardy",
    "IdleRopePile",
    "IdleAtom",
    "IdleSideToSide",
    "IdleHeadScratch",
    "CheckingSomething",
    "Explain",
    "Thinking",
    "GestureLeft",
    "GestureRight",
    "LookUp",
    "LookDown",
    "Hide",
    "Show",
  ],
  merlin: [
    "Greet",
    "Wave",
    "DoMagic1",
    "DoMagic2",
    "Read",
    "Write",
    "Idle1_1",
    "Idle2_1",
    "Idle3_1",
    "Congratulate",
    "Explain",
    "Thinking",
    "MoveLeft",
    "MoveRight",
    "MoveUp",
    "MoveDown",
    "Hide",
    "Show",
  ],
  rover: [
    "Greet",
    "Idle",
    "Books",
    "Sports",
    "Cooking",
    "Shopping",
    "Searching",
    "CharacterSucceeds",
    "Pleased",
    "Acknowledge",
    "Thinking",
    "Travel",
    "GestureLeft",
    "LookUpLeft",
    "LookUp",
    "ClickedOn",
    "Hide",
    "Show",
  ],
};
export const idleActions: Record<CharacterId, string[]> = {
  clippy: [
    "IdleRopePile",
    "IdleAtom",
    "GetArtsy",
    "GetTechy",
    "IdleSideToSide",
    "IdleHeadScratch",
  ],
  merlin: ["DoMagic1", "DoMagic2", "Read", "Write", "Idle1_1", "Idle3_1"],
  rover: [
    "Idle",
    "Books",
    "Sports",
    "Searching",
    "Pleased",
    "CharacterSucceeds",
  ],
};
export const moodActions: Record<CharacterId, Partial<Record<Mood, string>>> = {
  clippy: {
    thinking: "Thinking",
    speaking: "Explain",
    offended: "LookRight",
    away: "Hide",
    peeking: "GetAttention",
    rude: "GetAttention",
  },
  merlin: {
    thinking: "Thinking",
    speaking: "Explain",
    offended: "Sad",
    away: "Hide",
    peeking: "Show",
    rude: "Decline",
  },
  rover: {
    thinking: "Thinking",
    speaking: "Acknowledge",
    offended: "Embarrassed",
    away: "Hide",
    peeking: "Show",
    rude: "GetAttentionMinor",
  },
};
// Distinct original frame sequences, never CSS rotation of one flat image.
export const motionActions: Record<
  CharacterId,
  Record<Exclude<Direction, "still">, string[]>
> = {
  clippy: {
    left: ["GestureLeft", "LookLeft"],
    right: ["GestureRight", "LookRight"],
    up: ["LookUp", "GestureUp"],
    down: ["LookDown", "GestureDown"],
  },
  merlin: {
    left: ["MoveLeft", "LookLeft"],
    right: ["MoveRight", "LookRight"],
    up: ["MoveUp", "LookUp"],
    down: ["MoveDown", "LookDown"],
  },
  rover: {
    left: ["LookUpLeft", "GestureLeft"],
    right: ["Travel", "GetAttentionMinor"],
    up: ["LookUp", "Surprised"],
    down: ["ClickedOn", "Acknowledge"],
  },
};
export function nextIdle(id: CharacterId, last: string, random = Math.random) {
  const choices = idleActions[id].filter((x) => x !== last);
  return choices[
    Math.min(choices.length - 1, Math.floor(random() * choices.length))
  ];
}
