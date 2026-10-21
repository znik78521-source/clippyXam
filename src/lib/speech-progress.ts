export interface WordRange {
  start: number;
  end: number;
}
export interface SpeechProgress extends WordRange {
  text: string;
}
/** SpeechSynthesisEvent offsets are UTF-16, the same indexing JS strings use. */
export function wordRange(
  text: string,
  index: number,
  length?: number,
): WordRange | null {
  if (!Number.isInteger(index) || index < 0 || index >= text.length)
    return null;
  if (typeof length === "number" && Number.isInteger(length) && length > 0)
    return { start: index, end: Math.min(text.length, index + length) };
  const word = text.slice(index).match(/^[\p{L}\p{N}\p{M}’'\-]+/u)?.[0];
  return word ? { start: index, end: index + word.length } : null;
}
