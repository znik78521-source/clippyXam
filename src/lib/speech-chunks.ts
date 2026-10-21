// Short first phrase lowers time to first speech; the next phrase is synthesized during playback.
export function speechChunks(text: string): string[] {
  const chunks: string[] = [];
  let rest = text.trim();
  while (rest) {
    let end = rest.length;
    if (rest.length > 180) {
      const sentence = /[.!?…](?:\s|$)/.exec(rest.slice(0, 220));
      end = sentence ? sentence.index + 1 : rest.lastIndexOf(" ", 180);
      if (!sentence && end < 30) end = 180;
    }
    chunks.push(rest.slice(0, end));
    rest = rest.slice(end).trim();
  }
  return chunks;
}
