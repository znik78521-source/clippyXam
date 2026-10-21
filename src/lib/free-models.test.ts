import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseFreeModels,
  fetchFreeModels,
  fallbackCandidates,
  BOOTSTRAP_MODELS,
  DEFAULT_MODEL,
} from "./free-models";
const model = (
  id: string,
  pricing: unknown = { prompt: "0", completion: "0" },
) => ({
  id,
  name: id,
  pricing,
  architecture: { input_modalities: ["text"], output_modalities: ["text"] },
});
test("catalog admits only zero-price text :free variants; malformed and paid rows excluded", () => {
  const rows = [
    model("x/small-4b:free"),
    model("x/large-70b:free"),
    model("x/paid"),
    model("x/price:free", { prompt: 0, completion: 1 }),
    model("x/fee:free", { prompt: 0, completion: 0, request: ".01" }),
    model("x/null:free", { prompt: null, completion: 0 }),
    model("x/missing:free", {}),
    {
      ...model("x/audio:free"),
      architecture: {
        input_modalities: ["text"],
        output_modalities: ["audio"],
      },
    },
    null,
    model("x/small-4b:free"),
  ];
  assert.deepEqual(
    parseFreeModels({ data: rows }).map((m) => [m.id, m.group]),
    [
      ["x/small-4b:free", "fast"],
      ["x/large-70b:free", "reserve"],
    ],
  );
  assert.throws(() => parseFreeModels({}), /каталог/);
  assert.deepEqual(parseFreeModels({ data: [] }), []);
});
test("catalog fetch is public without credentials and respects cancellation", async (t) => {
  const signal = new AbortController().signal;
  t.mock.method(globalThis, "fetch", async (url, init) => {
    assert.equal(url, "https://openrouter.ai/api/v1/models");
    assert.deepEqual(init, { signal });
    return Response.json({ data: [model("x/4b:free")] });
  });
  assert.equal((await fetchFreeModels(signal))[0].id, "x/4b:free");
});
test("standard router is first, respects manual choice, and excludes Liquid", () => {
  const models = [
    ...BOOTSTRAP_MODELS,
    ...BOOTSTRAP_MODELS,
    { id: "paid/model", name: "Paid", group: "fast" as const },
  ];
  assert.deepEqual(fallbackCandidates("chosen/model:free", models), [
    "chosen/model:free",
    DEFAULT_MODEL,
    BOOTSTRAP_MODELS[0].id,
    BOOTSTRAP_MODELS[1].id,
  ]);
  assert.equal(fallbackCandidates(DEFAULT_MODEL, models)[0], DEFAULT_MODEL);
  assert.deepEqual(fallbackCandidates(DEFAULT_MODEL, []), [DEFAULT_MODEL]);
  assert.deepEqual(fallbackCandidates("chosen/model:free", models, false), [
    "chosen/model:free",
  ]);
  assert.throws(() => fallbackCandidates("paid/model", models));
  assert.ok(
    fallbackCandidates("liquid/lfm-2.5-2.6b:free", [
      ...models,
      { id: "liquid/test:free", name: "Liquid", group: "fast" },
    ]).every((id) => !id.startsWith("liquid/")),
  );
});
