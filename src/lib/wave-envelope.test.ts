import { test } from "node:test";
import assert from "node:assert/strict";
import { waveEnvelope, envelopeAt } from "./wave-envelope";
import { packAlpha } from "./widget-hit-map";
function wav() {
  const b = new ArrayBuffer(44 + 1600),
    v = new DataView(b);
  const tag = (o: number, s: string) =>
    [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  tag(0, "RIFF");
  v.setUint32(4, b.byteLength - 8, true);
  tag(8, "WAVE");
  tag(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, 8000, true);
  v.setUint32(28, 16000, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  tag(36, "data");
  v.setUint32(40, 1600, true);
  for (let i = 400; i < 800; i++) v.setInt16(44 + 2 * i, 16000, true);
  return b;
}
test("PCM speech envelope follows actual samples and playback time, not estimated words", () => {
  const e = waveEnvelope(wav());
  assert.deepEqual(e, [0, 1]);
  assert.equal(envelopeAt(e, 0), 0);
  assert.equal(envelopeAt(e, 0.05), 1);
  assert.equal(envelopeAt(e, 0.1), 0);
  assert.equal(envelopeAt(e, NaN), null);
});
test("invalid, unsupported and truncated audio safely disable motion only", () => {
  assert.equal(waveEnvelope(new ArrayBuffer(5)), null);
  const b = wav();
  new DataView(b).setUint16(20, 3, true);
  assert.equal(waveEnvelope(b), null);
  assert.equal(waveEnvelope(wav().slice(0, 100)), null);
  assert.equal(waveEnvelope(wav(), 0), null);
});
test("alpha hit mask packs transparent and opaque pixels with bounded threshold", () => {
  const rgba = new Uint8ClampedArray(40);
  rgba[3] = 255;
  rgba[7] = 15;
  rgba[35] = 16;
  assert.deepEqual(packAlpha(rgba), [1, 1]);
});
