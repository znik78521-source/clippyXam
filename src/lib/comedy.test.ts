import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ComedyDirector,
  requestedComicScene,
  type ComedyContext,
} from "./comedy";
import { requestsGentle } from "./behavior";
const context: ComedyContext = {
  character: "clippy",
  intensity: "wild",
  allowRude: true,
  backgroundQuips: true,
  away: false,
};
test("comic requests are explicit, not ordinary Windows maintenance", () => {
  assert.equal(requestedComicScene("пошути про снос винды"), "WindowsPrank");
  assert.equal(requestedComicScene("покажи сценку с битой"), "BatBonk");
  for (const text of [
    "как удалить Windows безопасно?",
    "покажи как переустановить винду",
    "покажи как удалить Windows",
    "как сносить старую винду",
    "как пошутить про Windows?",
  ])
    assert.equal(requestedComicScene(text), null, text);
  assert.equal(requestsGentle("не шути про снос винды"), true);
  assert.equal(requestsGentle("без угроз"), true);
});
test("first automatic Windows gag appears on third eligible reply, with time and turn cooldown", () => {
  const d = new ComedyDirector();
  assert.equal(d.afterReply(context, 0, 30), null);
  assert.equal(d.afterReply(context, 1000, 30), null);
  assert.equal(d.afterReply(context, 2000, 30)?.scene, "WindowsPrank");
  for (let i = 0; i < 4; i++)
    assert.equal(d.afterReply(context, 300000, 30), null);
  assert.equal(d.afterReply(context, 300000, 30)?.scene, "BatBonk");
  for (let i = 0; i < 8; i++)
    assert.equal(d.afterReply(context, 300001, 30), null);
});
test("explicit jokes rotate and never claim real deletion", () => {
  const d = new ComedyDirector();
  const texts = Array.from(
    { length: 4 },
    (_, i) => d.explicit("WindowsPrank", context, i)!.text,
  );
  assert.equal(new Set(texts).size, 4);
  for (const text of texts)
    assert.match(text, /бутафор|театре|шучу|воображаемый/i);
  assert.equal(d.explicit("WindowsPrank", context, 10)!.text, texts[0]);
});
test("soft mode, rude opt-out and absence block explicit and automatic threats", () => {
  for (const patch of [
    { intensity: "soft" as const },
    { allowRude: false },
    { away: true },
  ]) {
    const d = new ComedyDirector(),
      c = { ...context, ...patch };
    assert.equal(d.explicit("WindowsPrank", c, 0), null);
    for (let i = 0; i < 10; i++)
      assert.equal(d.afterReply(c, i * 300000, 20), null);
  }
});
test("background opt-out and long answers suppress automatic inserts, not requested scenes", () => {
  const d = new ComedyDirector();
  for (let i = 0; i < 10; i++)
    assert.equal(
      d.afterReply({ ...context, backgroundQuips: false }, i * 300000, 20),
      null,
    );
  for (let i = 0; i < 10; i++)
    assert.equal(d.afterReply(context, i * 300000, 1000), null);
  assert.equal(
    d.explicit("WindowsPrank", { ...context, backgroundQuips: false }, 4000000)
      ?.scene,
    "WindowsPrank",
  );
});
test("all declared authored drawings exist and match the provenance manifest", async () => {
  const { readFile } = await import("node:fs/promises");
  const { createHash } = await import("node:crypto");
  const root = new URL("../../public/authored/clippy/", import.meta.url);
  const manifest = JSON.parse(
    await readFile(new URL("manifest.json", root), "utf8"),
  );
  for (const name of [
    "neutral",
    "curious",
    "impact-left",
    "impact-right",
    "windows-armed",
    "windows-punchline",
    "bat-windup",
    "bat-strike",
  ]) {
    const bytes = await readFile(new URL(`${name}.png`, root));
    assert.equal(bytes.subarray(1, 4).toString(), "PNG");
    assert.equal(
      createHash("sha256").update(bytes).digest("hex"),
      manifest.files[`${name}.png`],
    );
  }
});
