import type { WordRange } from "../lib/speech-progress";
export default function SpeechText({
  text,
  range,
}: {
  text: string;
  range?: WordRange | null;
}) {
  const valid =
    range &&
    range.start >= 0 &&
    range.end > range.start &&
    range.end <= text.length;
  if (!valid) return <span>{text}</span>;
  return (
    <span>
      {text.slice(0, range.start)}
      <mark className="spoken-word">{text.slice(range.start, range.end)}</mark>
      {text.slice(range.end)}
    </span>
  );
}
