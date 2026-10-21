import { SpritePlayer } from "./animation";
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  originalActions,
  idleActions,
  moodActions,
  motionActions,
  nextIdle,
} from "./original-animations";
import { speechChunks } from "./speech-chunks";
test("all original animation mappings exist for all three shipped sprite packs", async () => {
  for (const id of ["clippy", "merlin", "rover"] as const) {
    const source = (await import(`clippyjs/agents/${id}`)).default;
    const data = (await source.agent()).default;
    for (const name of [
      ...originalActions[id],
      ...idleActions[id],
      ...Object.values(moodActions[id]),
      ...Object.values(motionActions[id]).flat(),
    ])
      assert.ok(
        data.animations[name!]?.frames.length,
        `${id}: missing ${name}`,
      );
    assert.notEqual(
      nextIdle(id, idleActions[id][0], () => 0),
      idleActions[id][0],
    );
    assert.ok(
      new Set(Object.values(motionActions[id]).map((a) => a.join(","))).size ===
        4,
    );
  }
});
test("speech chunks retain complete reply and start with a short first phrase", () => {
  const text =
    "Первая короткая фраза. " + "Продолжение ответа без обрезки. ".repeat(100);
  const chunks = speechChunks(text);
  assert.ok(chunks[0].length < 60);
  assert.equal(chunks.join(" ").replace(/\s+/g, " ").trim(), text.trim());
  assert.ok(chunks.every((c) => c.length <= 2500));
});

test("explicit idle actions bypass original 85–97 percent opening skip guards, not internal frames", async () => {
  const source = (await import("clippyjs/agents/clippy")).default;
  const data = (await source.agent()).default;
  for (const name of ["IdleAtom", "IdleHeadScratch"]) {
    const player = new SpritePlayer(data, () => 0.5, { forceOpening: true });
    player.request(name, 0, 60000);
    assert.deepEqual(player.tick(100), data.animations[name].frames[1]);
  }
});
