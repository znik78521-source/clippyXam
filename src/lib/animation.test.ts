import { test } from "node:test";
import assert from "node:assert/strict";
import { nextFrame, SpritePlayer } from "./animation";
import type { SpriteData } from "./animation";
import { readFileSync } from "node:fs";

const rest = { duration: 10, images: [[0, 0]] };
test("weighted branches use cumulative probability with sequential remainder", () => {
  const animation = {
    frames: [
      {
        duration: 10,
        branching: {
          branches: [
            { weight: 20, frameIndex: 2 },
            { weight: 30, frameIndex: 3 },
          ],
        },
      },
      rest,
      rest,
      rest,
    ],
  };
  assert.equal(
    nextFrame(animation, 0, false, () => 0.1),
    2,
  );
  assert.equal(
    nextFrame(animation, 0, false, () => 0.3),
    3,
  );
  assert.equal(
    nextFrame(animation, 0, false, () => 0.9),
    1,
  );
  animation.frames[0] = {
    ...animation.frames[0],
    exitBranch: 3,
  } as (typeof animation.frames)[0];
  assert.equal(
    nextFrame(animation, 0, true, () => 0),
    3,
  );
});
test("sentinel holds the visible pose until exit, never drawing an empty frame", () => {
  const animation = {
    useExitBranching: true,
    frames: [{ ...rest, exitBranch: 1 }, { duration: 0 }],
  };
  assert.equal(nextFrame(animation, 0, false), "hold");
  assert.equal(nextFrame(animation, 0, true), null);
});
test("invalid branches are ignored, zero durations cannot create synchronous loops", () => {
  const animation = {
    frames: [
      {
        duration: 0,
        exitBranch: -2,
        branching: { branches: [{ weight: 100, frameIndex: 999 }] },
      },
      rest,
    ],
  };
  assert.equal(nextFrame(animation, 0, false), 1);
  assert.equal(nextFrame(animation, 0, true), 1);
  assert.equal(nextFrame(animation, 1, false), null);
});
test("interruption follows reverse exit chain and last requested action wins", () => {
  const a = { duration: 10, images: [[1, 0]], exitBranch: 3 };
  const b = { duration: 10, images: [[2, 0]], exitBranch: 0 };
  const c = { duration: 10, images: [[3, 0]], exitBranch: 1 };
  const data: SpriteData = {
    framesize: [1, 1],
    animations: {
      RestPose: { frames: [rest] },
      Talk: { useExitBranching: true, frames: [a, b, c, { duration: 0 }] },
      Other: { frames: [{ ...rest, images: [[9, 0]] }] },
    },
  };
  const p = new SpritePlayer(data);
  p.request("Talk", 0);
  p.tick(10);
  assert.deepEqual(p.tick(20).images, [[3, 0]]);
  p.request("Other", 21);
  assert.deepEqual(p.tick(30).images, [[2, 0]]);
  assert.deepEqual(p.tick(40).images, [[1, 0]]);
  assert.deepEqual(p.tick(50).images, [[9, 0]]);
});
test("malformed exit cycles have a bounded escape", () => {
  const data: SpriteData = {
    framesize: [1, 1],
    animations: {
      RestPose: { frames: [rest] },
      Loop: {
        frames: [
          {
            duration: 10,
            images: [[2, 0]],
            exitBranch: 0,
            branching: { branches: [{ weight: 100, frameIndex: 0 }] },
          },
        ],
      },
    },
  };
  const p = new SpritePlayer(data);
  p.request("Loop", 0);
  p.request("RestPose", 20);
  assert.deepEqual(p.tick(2021).images, [[0, 0]]);
});
test("all three real sprite packs run and interrupt without hanging or invalid coordinates", async () => {
  for (const id of ["clippy", "rover", "merlin"]) {
    const source = (await import(`clippyjs/agents/${id}`)).default;
    const data = (await source.agent()).default as SpriteData;
    const p = new SpritePlayer(data, () => 0.1);
    for (const name of Object.keys(data.animations)) {
      p.request(name, 0);
      for (let now = 0; now < 5000; now += 50) {
        const f = p.tick(now);
        for (const xy of f.images || []) assert.ok(xy.every(Number.isFinite));
      }
      p.request("RestPose", 5000);
      assert.deepEqual(p.tick(7100).images, [[0, 0]]);
      p.reset();
    }
    // Source-level provenance is fixed in package-lock.json, not a guessed asset URL.
    assert.ok(
      readFileSync("package-lock.json", "utf8").includes(
        "node_modules/clippyjs",
      ),
    );
  }
});
