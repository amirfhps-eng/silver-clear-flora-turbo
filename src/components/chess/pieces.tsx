import bB from "../../../public/pieces/bB.svg?raw";
import bK from "../../../public/pieces/bK.svg?raw";
import bN from "../../../public/pieces/bN.svg?raw";
import bP from "../../../public/pieces/bP.svg?raw";
import bQ from "../../../public/pieces/bQ.svg?raw";
import bR from "../../../public/pieces/bR.svg?raw";
import wB from "../../../public/pieces/wB.svg?raw";
import wK from "../../../public/pieces/wK.svg?raw";
import wN from "../../../public/pieces/wN.svg?raw";
import wP from "../../../public/pieces/wP.svg?raw";
import wQ from "../../../public/pieces/wQ.svg?raw";
import wR from "../../../public/pieces/wR.svg?raw";

const PIECES: Record<string, string> = {
  wK, wQ, wR, wB, wN, wP, bK, bQ, bR, bB, bN, bP,
};

export function Piece({ code, className }: { code: string; className?: string }) {
  const raw = PIECES[code];
  if (!raw) return null;
  return (
    <span
      className={className ? `piece ${className}` : "piece"}
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: raw }}
    />
  );
}

const NAMES: Record<string, string> = {
  p: "pawn",
  n: "knight",
  b: "bishop",
  r: "rook",
  q: "queen",
  k: "king",
};

export function pieceName(color: "w" | "b", type: string): string {
  const side = color === "w" ? "white" : "black";
  return `${side} ${NAMES[type] ?? "piece"}`;
}
