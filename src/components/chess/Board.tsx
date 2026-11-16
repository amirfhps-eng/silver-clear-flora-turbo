import { useEffect, useRef, useState } from "react";
import type { Square } from "chess.js";
import { chessOf, useLinebook } from "@/lib/chess/store";
import { nodeAt } from "@/lib/chess/book";
import { Piece, pieceName } from "./pieces";

const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"] as const;
const RANKS = ["1", "2", "3", "4", "5", "6", "7", "8"] as const;

type Promo = "q" | "r" | "b" | "n";

export function Board() {
  const state = useLinebook();
  const {
    orientation,
    mode,
    trainPhase,
    showHint,
    trainPath,
    side,
    book,
    attemptMove,
  } = state;
  const chess = chessOf(state);
  const fen = chess.fen();
  const turn = chess.turn();
  const history = chess.history({ verbose: true });
  const last = history[history.length - 1];
  const interactive = mode !== "train" || trainPhase === "you";
  const over = chess.isGameOver();

  const [selected, setSelected] = useState<Square | null>(null);
  const [pending, setPending] = useState<{ from: Square; to: Square } | null>(null);
  const [ghost, setGhost] = useState<{ code: string; x: number; y: number } | null>(null);
  const drag = useRef<{ from: Square; x: number; y: number; moved: boolean } | null>(null);
  const suppressClick = useRef(false);

  useEffect(() => {
    setSelected(null);
    setPending(null);
  }, [fen]);

  const files = orientation === "white" ? FILES : [...FILES].reverse();
  const ranks = orientation === "white" ? [...RANKS].reverse() : [...RANKS];

  const hintTargets = new Set<string>();
  if (mode === "train" && showHint && trainPhase === "you") {
    const node = nodeAt(book[side], trainPath);
    for (const child of node?.children ?? []) hintTargets.add(child.uci.slice(2, 4));
  }

  function tryMove(from: Square, to: Square) {
    if (!interactive || over) return;
    const choices = chess.moves({ square: from, verbose: true }).filter((move) => move.to === to);
    if (!choices.length) {
      const piece = chess.get(to);
      if (piece && piece.color === turn) setSelected(to);
      else setSelected(null);
      return;
    }
    if (choices.some((move) => move.promotion)) {
      setPending({ from, to });
      setSelected(from);
      return;
    }
    attemptMove(from, to);
    setSelected(null);
  }

  function onPointerDown(event: React.PointerEvent<HTMLButtonElement>, square: Square) {
    if (!interactive || over || event.button !== 0) return;
    const piece = chess.get(square);
    if (!piece || piece.color !== turn) return;
    drag.current = { from: square, x: event.clientX, y: event.clientY, moved: false };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function onPointerMove(event: React.PointerEvent<HTMLButtonElement>) {
    const current = drag.current;
    if (!current) return;
    if (Math.hypot(event.clientX - current.x, event.clientY - current.y) > 8) {
      current.moved = true;
      const piece = chess.get(current.from);
      if (!piece) return;
      setGhost({
        code: `${piece.color}${piece.type.toUpperCase()}`,
        x: event.clientX,
        y: event.clientY,
      });
    }
  }

  function onPointerUp(event: React.PointerEvent<HTMLButtonElement>) {
    const current = drag.current;
    drag.current = null;
    setGhost(null);
    if (!current?.moved) return;
    suppressClick.current = true;
    const target = document.elementFromPoint(event.clientX, event.clientY);
    const square = target?.closest("[data-sq]")?.getAttribute("data-sq");
    if (square && /^[a-h][1-8]$/.test(square)) tryMove(current.from, square as Square);
  }

  function onClick(square: Square) {
    if (suppressClick.current) {
      suppressClick.current = false;
      return;
    }
    if (!interactive || over) return;
    if (!selected) {
      const piece = chess.get(square);
      if (piece && piece.color === turn) setSelected(square);
      return;
    }
    if (selected === square) {
      setSelected(null);
      return;
    }
    tryMove(selected, square);
  }

  const kingSquare = (() => {
    if (!chess.isCheck()) return null;
    const board = chess.board();
    for (let rank = 0; rank < 8; rank += 1) {
      for (let file = 0; file < 8; file += 1) {
        const piece = board[rank]?.[file];
        if (piece?.type === "k" && piece.color === turn) {
          return `${FILES[file]}${8 - rank}` as Square;
        }
      }
    }
    return null;
  })();

  const selectedMoves = selected ? chess.moves({ square: selected, verbose: true }) : [];

  return (
    <div className="relative w-full">
      <div className="grid aspect-square w-full grid-cols-8 grid-rows-8 overflow-hidden rounded-xl shadow-sm">
        {ranks.map((rank) =>
          files.map((file) => {
            const square = `${file}${rank}` as Square;
            const piece = chess.get(square);
            const dark = (FILES.indexOf(file) + Number(rank)) % 2 === 1;
            const isLast = last && (last.from === square || last.to === square);
            const isSelected = selected === square;
            const legal = selectedMoves.find((move) => move.to === square);
            const hint = hintTargets.has(square);
            const label = piece
              ? `${pieceName(piece.color, piece.type)} on ${square}`
              : `empty ${square}`;
            const showRank = file === files[0];
            const showFile = rank === ranks[ranks.length - 1];
            return (
              <button
                key={square}
                type="button"
                data-sq={square}
                aria-label={label}
                aria-pressed={isSelected}
                onClick={() => onClick(square)}
                onPointerDown={(event) => onPointerDown(event, square)}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onContextMenu={(event) => event.preventDefault()}
                className={`relative touch-none ${dark ? "bg-sq-dark" : "bg-sq-light"} ${
                  isSelected ? "ring-2 ring-brass ring-inset" : ""
                }`}
              >
                {isLast ? <span className="pointer-events-none absolute inset-0 bg-brass/35" /> : null}
                {kingSquare === square ? (
                  <span className="pointer-events-none absolute inset-0 bg-miss/45" />
                ) : null}
                {showRank ? (
                  <span
                    className={`pointer-events-none absolute top-0.5 left-1 text-xs leading-none ${
                      dark ? "text-sq-light" : "text-sq-light-ink"
                    }`}
                  >
                    {rank}
                  </span>
                ) : null}
                {showFile ? (
                  <span
                    className={`pointer-events-none absolute right-1 bottom-0.5 text-xs leading-none ${
                      dark ? "text-sq-light" : "text-sq-light-ink"
                    }`}
                  >
                    {file}
                  </span>
                ) : null}
                {piece ? (
                  <span
                    className={`pointer-events-none absolute inset-1 ${
                      ghost && selected === square ? "opacity-30" : ""
                    }`}
                  >
                    <Piece code={`${piece.color}${piece.type.toUpperCase()}`} className="h-full w-full" />
                  </span>
                ) : null}
                {legal && !piece ? (
                  <span
                    className={`pointer-events-none absolute top-1/2 left-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full ${
                      hint ? "bg-brass" : "bg-brass-ink/30"
                    }`}
                  />
                ) : null}
                {legal && piece ? (
                  <span className="pointer-events-none absolute inset-1 rounded-full ring-4 ring-brass-ink/30" />
                ) : null}
                {hint && !legal ? (
                  <span className="pointer-events-none absolute top-1/2 left-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-brass" />
                ) : null}
              </button>
            );
          }),
        )}
      </div>
      {pending ? (
        <div className="absolute inset-0 flex items-center justify-center bg-bg/50">
          <div className="flex gap-2 rounded-xl border border-line bg-surface p-3">
            {(["q", "r", "b", "n"] as Promo[]).map((promo) => (
              <button
                key={promo}
                type="button"
                aria-label={`Promote to ${promo === "q" ? "queen" : promo === "r" ? "rook" : promo === "b" ? "bishop" : "knight"}`}
                className="flex size-14 items-center justify-center rounded-lg bg-sq-light"
                onClick={() => {
                  attemptMove(pending.from, pending.to, promo);
                  setPending(null);
                  setSelected(null);
                }}
              >
                <Piece code={`${turn}${promo.toUpperCase()}`} className="size-10" />
              </button>
            ))}
            <button
              type="button"
              className="px-3 text-sm text-muted"
              onClick={() => setPending(null)}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}
      {ghost ? (
        <div
          className="pointer-events-none fixed z-50 size-16 -translate-x-1/2 -translate-y-1/2"
          style={{ left: ghost.x, top: ghost.y }}
        >
          <Piece code={ghost.code} className="h-full w-full" />
        </div>
      ) : null}
    </div>
  );
}
