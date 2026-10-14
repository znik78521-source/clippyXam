import type { CSSProperties } from "react";
import { cinematicLabel, type CinematicKind } from "../lib/cinematics";
export default function Cinematic({ kind }: { kind: CinematicKind }) {
  return (
    <div
      className={`cinematic cinematic-${kind}`}
      aria-label={cinematicLabel[kind]}
      role="img"
    >
      {(kind === "format" || kind === "bsod" || kind === "update") && (
        <div className={`fake-system fake-${kind}`}>
          <strong>
            {kind === "bsod"
              ? "ПИКСЕЛЬНАЯ ПАНИКА :("
              : kind === "format"
                ? "Форматирование C: (понарошку)"
                : "Установка обновления наглости"}
          </strong>
          <p>
            {kind === "bsod"
              ? "CLIPPY_HAS_NO_MORE_ARGUMENTS"
              : kind === "format"
                ? "Удалено файлов: 0. Полномочий: тоже 0."
                : "Не выключайте скрепку. Хотя очень хочется."}
          </p>
          {kind !== "bsod" && (
            <div className="fake-progress">
              <i />
            </div>
          )}
          <b>ШУТКА · WINDOWS НЕ ЗАТРОНУТА</b>
        </div>
      )}
      {kind === "bat" && (
        <>
          <svg className="meme-bat" viewBox="0 0 180 220">
            <path
              d="M22 206L39 212L162 31Q180 8 151 4Q139 1 127 20Z"
              fill="#b98648"
              stroke="#392511"
              strokeWidth="4"
            />
            <path
              d="M28 187L47 196M36 172L56 181"
              stroke="#eee"
              strokeWidth="8"
            />
          </svg>
          <svg
            className="meme-cracks"
            viewBox="0 0 360 350"
            preserveAspectRatio="none"
          >
            <path
              d="M180 185L112 128L135 84L87 0M112 128L35 145L0 113M180 185L259 116L282 27L320 0M259 116L342 136L360 120M180 185L227 247L217 305L267 350M227 247L338 277L360 322M180 185L113 221L95 306L50 350M113 221L10 264L0 243"
              fill="none"
              stroke="#fff"
              strokeWidth="4"
            />
            <path
              d="M180 185L158 140L210 165L222 201L170 224Z"
              fill="none"
              stroke="#252525"
              strokeWidth="3"
            />
          </svg>
          <b className="meme-pow">ХРЯСЬ!</b>
        </>
      )}
      {kind === "flame" && (
        <>
          <svg className="meme-nozzle" viewBox="0 0 120 80">
            <path
              d="M10 30H90V15H110V65H90V50H60L45 76H25L35 48H10Z"
              fill="#74786b"
              stroke="#222"
              strokeWidth="5"
            />
            <rect
              x="3"
              y="20"
              width="30"
              height="45"
              fill="#db4526"
              stroke="#222"
              strokeWidth="4"
            />
          </svg>
          <svg
            className="meme-fire"
            viewBox="0 0 360 350"
            preserveAspectRatio="none"
          >
            <path
              d="M178 276L0 208L76 176L0 55L110 96L100 0L194 48L277 0L275 108L360 62L309 175L360 225Z"
              fill="#ed3a0c"
            />
            <path
              d="M178 276L44 190L113 173L80 82L165 132L192 39L230 148L306 103L273 196L333 223Z"
              fill="#ff9421"
            />
            <path
              d="M178 276L129 187L185 204L212 126L260 220Z"
              fill="#ffe456"
            />
          </svg>
        </>
      )}
      {kind === "rage" && (
        <div className="meme-stars">
          {Array.from({ length: 9 }, (_, i) => (
            <b
              key={i}
              style={
                {
                  "--i": i,
                  "--x": `${((i % 3) - 1) * 60}px`,
                  "--y": `${-50 - Math.floor(i / 3) * 37}px`,
                } as CSSProperties
              }
            >
              *
            </b>
          ))}
        </div>
      )}
      {kind === "burrow" && (
        <>
          <div className="meme-hole" />
          <svg className="meme-shovel" viewBox="0 0 70 190">
            <path
              d="M25 8H48V40H25ZM36 40V135"
              fill="none"
              stroke="#78562e"
              strokeWidth="9"
            />
            <path
              d="M10 128H62V167L36 189L10 167Z"
              fill="#999"
              stroke="#444"
              strokeWidth="4"
            />
          </svg>
          <div className="meme-dirt">
            {Array.from({ length: 12 }, (_, i) => (
              <i
                key={i}
                style={
                  { "--i": i, "--x": `${(i - 6) * 19}px` } as CSSProperties
                }
              />
            ))}
          </div>
        </>
      )}
      {kind === "jail" && (
        <>
          <svg
            className="meme-bars"
            viewBox="0 0 360 350"
            preserveAspectRatio="none"
          >
            <defs>
              <pattern
                id="bars"
                width="45"
                height="350"
                patternUnits="userSpaceOnUse"
              >
                <rect
                  x="17"
                  width="10"
                  height="350"
                  fill="#777"
                  stroke="#ddd"
                  strokeWidth="2"
                />
              </pattern>
            </defs>
            <rect width="360" height="350" fill="url(#bars)" />
            <path d="M0 30H360M0 288H360" stroke="#444" strokeWidth="16" />
            <rect
              x="140"
              y="165"
              width="80"
              height="38"
              fill="#aaa"
              stroke="#333"
              strokeWidth="3"
            />
          </svg>
          <div className="meme-dust">
            {Array.from({ length: 48 }, (_, i) => (
              <i
                key={i}
                style={
                  {
                    left: `${25 + (i % 8) * 7}%`,
                    top: `${47 + Math.floor(i / 8) * 7}%`,
                    "--i": i,
                    "--dx": `${(((i * 17) % 13) - 6) * 12}px`,
                    "--dy": `${-45 - (i % 9) * 12}px`,
                  } as CSSProperties
                }
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
