import { test } from "node:test";
import assert from "node:assert/strict";
import { sanitizeWindowMotion } from "./window-motion";
test("motion packets reject malformed data and bound speeds, stripping coordinates", () => {
  assert.equal(sanitizeWindowMotion(null), null);
  assert.equal(
    sanitizeWindowMotion({
      direction: "left",
      serial: 1,
      velocityX: Infinity,
      velocityY: 0,
    }),
    null,
  );
  assert.equal(sanitizeWindowMotion({ direction: "left", serial: -1 }), null);
  assert.deepEqual(
    sanitizeWindowMotion({
      direction: "left",
      serial: 1,
      velocityX: -9000,
      velocityY: 3,
      x: 1234,
      y: -900,
    }),
    {
      direction: "left",
      serial: 1,
      velocityX: -4000,
      velocityY: 3,
      reset: false,
    },
  );
});
