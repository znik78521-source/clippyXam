import { test } from "node:test";
import assert from "node:assert/strict";
import { chooseAside, isApology } from "./behavior";
test("asides stay brief, vary by character, and never show a rude gesture in soft mode", () => {
  assert.equal(chooseAside("clippy", "soft", () => 0).rude, false);
  assert.equal(chooseAside("clippy", "wild", () => 0).rude, true);
  assert.notEqual(
    chooseAside("clippy", "normal", () => 0).text,
    chooseAside("rover", "normal", () => 0).text,
  );
  assert.ok(chooseAside("merlin", "normal", () => 0.9).text.length < 90);
});
test("forgiveness recognises Russian phrases", () => {
  assert.equal(isApology("Извини, вернись пожалуйста"), true);
  assert.equal(isApology("Ты где?"), false);
});
