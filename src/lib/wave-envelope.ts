/** PCM16 RIFF envelope, no microphone/audio capture and no phoneme inference. */
export function waveEnvelope(
  buffer: ArrayBuffer,
  step = 0.05,
): number[] | null {
  const v = new DataView(buffer);
  if (v.byteLength < 44) return null;
  const tag = (offset: number) =>
    String.fromCharCode(...new Uint8Array(buffer, offset, 4));
  if (tag(0) !== "RIFF" || tag(8) !== "WAVE") return null;
  let channels = 0,
    rate = 0,
    bits = 0,
    format = 0,
    align = 0,
    start = 0,
    size = 0;
  for (let offset = 12; offset + 8 <= v.byteLength;) {
    const n = v.getUint32(offset + 4, true),
      data = offset + 8;
    if (data + n > v.byteLength) return null;
    if (tag(offset) === "fmt " && n >= 16) {
      format = v.getUint16(data, true);
      channels = v.getUint16(data + 2, true);
      rate = v.getUint32(data + 4, true);
      align = v.getUint16(data + 12, true);
      bits = v.getUint16(data + 14, true);
    }
    if (tag(offset) === "data") {
      start = data;
      size = n;
    }
    offset = data + n + (n % 2);
  }
  if (
    format !== 1 ||
    bits !== 16 ||
    channels < 1 ||
    channels > 2 ||
    rate < 8000 ||
    rate > 96000 ||
    align !== channels * 2 ||
    !size ||
    !Number.isFinite(step) ||
    step < 0.02 ||
    step > 1
  )
    return null;
  const samples = Math.min(Math.floor(size / align), rate * 120),
    windowSize = Math.max(1, Math.floor(rate * step)),
    rms: number[] = [];
  for (let i = 0; i < samples; i += windowSize) {
    let sum = 0,
      count = 0;
    for (let j = i; j < Math.min(samples, i + windowSize); j++)
      for (let c = 0; c < channels; c++) {
        const sample = v.getInt16(start + j * align + c * 2, true) / 32768;
        sum += sample * sample;
        count++;
      }
    rms.push(Math.sqrt(sum / count));
  }
  const peak = Math.max(0.1, ...rms);
  return rms.map((x) =>
    x < 0.004 ? 0 : Math.round(Math.min(1, x / peak) * 15) / 15,
  );
}
export function envelopeAt(
  envelope: number[] | null,
  time: number,
  step = 0.05,
) {
  return envelope && Number.isFinite(time) && time >= 0
    ? (envelope[Math.floor(time / step)] ?? 0)
    : null;
}
