import type { CharacterId } from "../lib/characters";
export function WindowsMark() {
  return (
    <svg viewBox="0 0 40 36" className="windows-mark" aria-hidden="true">
      <path d="M4 5l14-3-2 14-14 2z" fill="#f64b24" />
      <path d="M21 2l15 3-2 14-15-3z" fill="#86c935" />
      <path d="M2 21l14-2-2 14-14 2z" fill="#47a5f5" />
      <path d="M19 19l15 3-2 13-15-2z" fill="#ffce36" />
    </svg>
  );
}
export function ComputerIcon() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true">
      <defs>
        <linearGradient id="screen" x2="1" y2="1">
          <stop stopColor="#76d5f8" />
          <stop offset="1" stopColor="#075cb1" />
        </linearGradient>
      </defs>
      <path d="M6 4h31l5 5v25H8L4 29V6z" fill="#ebeadc" stroke="#777b85" />
      <path
        d="M10 8h25v20H10z"
        fill="url(#screen)"
        stroke="#526574"
        strokeWidth="2"
      />
      <path d="M35 8l4 3v21h-4" fill="#a7a998" />
      <path d="M21 34v5h12l8 5H7l8-5h8" fill="#dfdfcf" stroke="#777b85" />
      <path d="M13 12h18M13 15h12" stroke="#c6f6ff" opacity=".7" />
      <path d="M9 43h29" stroke="#8b8e8b" />
    </svg>
  );
}
export function FolderIcon() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true">
      <path d="M4 12h16l5 5h18v24H4z" fill="#d59218" stroke="#9e711b" />
      <path d="M5 10h15l5 6h16v22H5z" fill="#ffe5a1" stroke="#b99548" />
      <path d="M5 21h40l-6 21H1z" fill="#ffd36d" stroke="#c69431" />
      <path d="M8 23h33" stroke="#fff1c2" strokeWidth="2" />
    </svg>
  );
}
export function TrashIcon() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true">
      <path
        d="M9 12l4 30q11 5 23-1l4-29"
        fill="#d0e0e7"
        fillOpacity=".85"
        stroke="#657e8d"
      />
      <ellipse cx="24" cy="12" rx="15" ry="5" fill="#eaf5f6" stroke="#8096a1" />
      <ellipse cx="24" cy="12" rx="10" ry="2.5" fill="#849ba6" />
      <path d="M17 18l2 22m12-22l-2 22" stroke="white" strokeWidth="2" />
      <path
        d="M23 24l4-4 4 7h-3l-3-4m5 9l-1 5h-8l2-3h5m-9-2l-4-2 3-7 1 3-1 4"
        fill="none"
        stroke="#27824e"
        strokeWidth="2"
      />
    </svg>
  );
}
export function RudeHand({
  character = "clippy",
}: {
  character?: CharacterId;
}) {
  const fur = character === "rover";
  const wizard = character === "merlin";
  return (
    <svg
      className="rude-hand"
      data-character={character}
      viewBox="0 0 80 105"
      role="img"
      aria-label={`Средний палец — новый жест ${character}`}
    >
      <path
        d="M27 89L17 72 9 61q-5-11 5-13 5 0 11 8V15q0-11 9-11t9 11v29q9-10 16 1 10-6 14 7v23L62 91v10H27z"
        fill={fur ? "#efb440" : wizard ? "#ead3b9" : "#e5e9e8"}
        stroke={fur ? "#795323" : "#373843"}
        strokeWidth="3.5"
        strokeLinejoin="round"
      />
      <path
        d="M43 44v22m15-18v19M25 56l9 11m-6 23h32"
        fill="none"
        stroke={fur ? "#b77b29" : wizard ? "#b3947f" : "#8a9a9f"}
        strokeWidth="2.5"
      />
      <path
        d="M28 101h32v-9H28z"
        fill={fur ? "#a8622d" : wizard ? "#30327d" : "#7b96a2"}
        stroke={fur ? "#795323" : "#373843"}
        strokeWidth="3"
      />
      {fur && (
        <>
          <ellipse
            cx="44"
            cy="75"
            rx="11"
            ry="9"
            fill="#9b652c"
            opacity=".65"
          />
          <path
            d="m30 89 5-5 5 5 5-5 5 5 5-5"
            stroke="#70451f"
            fill="none"
            strokeWidth="2"
          />
        </>
      )}
      {wizard && (
        <path
          d="m43 91 2 3 4 .4-3 2.5.8 4-3.8-2-3.5 2 .7-4-3-2.5 4-.4z"
          fill="#f4d457"
        />
      )}
    </svg>
  );
}
