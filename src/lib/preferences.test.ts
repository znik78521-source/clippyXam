import { test } from "node:test";
import assert from "node:assert/strict";
import { defaultPreferences, isQuietTime } from "./preferences";
import { requestsGentle, nextIrritation } from "./behavior";
const at = (h: number, m = 0) => new Date(2026, 9, 14, h, m);
test("quiet hours handle midnight, boundaries and disabled/equal/malformed intervals", () => {
  const prefs = { ...defaultPreferences, quietEnabled: true };
  assert.equal(isQuietTime(prefs, at(23)), true);
  assert.equal(isQuietTime(prefs, at(7, 59)), true);
  assert.equal(isQuietTime(prefs, at(8)), false);
  assert.equal(isQuietTime(defaultPreferences, at(23)), false);
  assert.equal(
    isQuietTime({ ...prefs, quietStart: "09:00", quietEnd: "17:00" }, at(12)),
    true,
  );
  assert.equal(isQuietTime({ ...prefs, quietStart: "08:00" }, at(12)), false);
  assert.equal(isQuietTime({ ...prefs, quietStart: "25:00" }, at(23)), false);
});
test("temper accumulates without exceeding bounds and responds to apologies", () => {
  assert.equal(nextIrritation(0, "Срочно сделай"), 14);
  assert.equal(nextIrritation(95, "Ты идиот"), 100);
  assert.equal(nextIrritation(70, "Извини"), 30);
  assert.equal(nextIrritation(10, "Спасибо"), 0);
  assert.equal(nextIrritation(70, "Без подколов"), 30);
  assert.equal(nextIrritation(70, "обычное сообщение"), 67);
});
test("local boundaries do not depend on an LLM interpretation", () => {
  for (const text of [
    "без мата",
    "Не издевайся",
    "Хватит подколов",
    "Stop roasting me",
  ])
    assert.equal(requestsGentle(text), true);
  assert.equal(requestsGentle("Прожарь меня"), false);
});
