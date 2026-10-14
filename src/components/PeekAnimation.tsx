import type { ReactNode } from "react";
export default function PeekAnimation({
  children,
  active,
  rude,
}: {
  children: ReactNode;
  active: boolean;
  rude: boolean;
}) {
  return (
    <div
      className={`peek-actor ${active ? "peek-active" : ""} ${rude ? "peek-rude" : ""}`}
      data-animation={active ? "peek-from-edge" : undefined}
    >
      {children}
    </div>
  );
}
