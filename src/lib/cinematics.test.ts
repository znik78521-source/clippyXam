import { test } from "node:test";
import assert from "node:assert/strict";
import {
  chooseCinematic,
  cinematicNames,
  cinematicDuration,
} from "./cinematics";
const base = {
  text: "Привет",
  reply: "Ответ",
  previousReply: "",
  intensity: "wild" as const,
  allowRude: true,
  irritation: 0,
  quiet: false,
  canRandom: false,
};
test("all requested gags are distinct finite visual-only events", () => {
  const cases = {
    bat: "Разбей экран битой",
    burrow: "Закопайся",
    flame: "Достань огнемёт",
    rage: "Прыгай со звёздочками",
    format: "Снеси винду",
    bsod: "Синий экран",
    update: "Обнови винду",
  };
  for (const [kind, text] of Object.entries(cases))
    assert.equal(chooseCinematic({ ...base, text })?.kind, kind);
  for (const kind of cinematicNames)
    assert.ok(cinematicDuration[kind] > 0 && cinematicDuration[kind] <= 5000);
  assert.equal(chooseCinematic({ ...base, irritation: 85 })?.kind, "burrow");
});
test("jail uses only prior assistant evidence and 90-percent threshold, not a legal verdict", () => {
  assert.equal(
    chooseCinematic(
      { ...base, text: "Это незаконно", previousReply: "Отвернись, мудила" },
      () => 0.899,
    )?.kind,
    "jail",
  );
  assert.equal(
    chooseCinematic(
      { ...base, text: "Это незаконно", previousReply: "Отвернись, мудила" },
      () => 0.9,
    ),
    null,
  );
  assert.equal(
    chooseCinematic(
      {
        ...base,
        text: "Ты сказал нахуй, это незаконно",
        previousReply: "Добрый день",
      },
      () => 0,
    ),
    null,
  );
});
test("soft mode, quiet hours, gesture opt-out and cooldown suppress spontaneous gags", () => {
  assert.equal(
    chooseCinematic({ ...base, text: "огнемёт", intensity: "soft" }, () => 0),
    null,
  );
  assert.equal(
    chooseCinematic({ ...base, text: "битой", allowRude: false }, () => 0),
    null,
  );
  assert.equal(
    chooseCinematic({ ...base, text: "битой", quiet: true }, () => 0),
    null,
  );
  assert.equal(
    chooseCinematic(base, () => 0),
    null,
  );
  assert.equal(
    chooseCinematic({ ...base, canRandom: true }, () => 0)?.kind,
    "bat",
  );
});
