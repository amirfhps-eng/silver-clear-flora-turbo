import { useEffect, useState } from "react";
import { chessOf, useLinebook } from "@/lib/chess/store";
import { getEngine } from "@/lib/chess/engine";
import { formatEval, formatPv, whiteShare } from "@/lib/chess/notation";
import type { EngineSnapshot } from "@/lib/chess/types";

const IDLE: EngineSnapshot = {
  status: "loading",
  fen: null,
  depth: 0,
  nodes: 0,
  nps: 0,
  lines: [],
};

export function EnginePanel() {
  const state = useLinebook();
  const fen = chessOf(state).fen();
  const [snap, setSnap] = useState<EngineSnapshot>(IDLE);

  useEffect(() => {
    return getEngine().subscribe(setSnap);
  }, []);

  useEffect(() => {
    const engine = getEngine();
    if (!state.engineOn) {
      engine.halt();
      return;
    }
    engine.analyze(fen);
  }, [fen, state.engineOn]);

  const live = state.engineOn && snap.fen === fen ? snap : null;
  const best = live?.lines[0] ?? null;
  const share = whiteShare(best);

  return (
    <section className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs tracking-wide text-muted uppercase">Engine</p>
          <p className="font-display text-2xl leading-none text-fg tabular-nums">
            {state.engineOn ? formatEval(best) : "Off"}
          </p>
        </div>
        <button
          type="button"
          onClick={state.toggleEngine}
          className={`min-h-11 rounded-full px-4 text-sm font-medium ${
            state.engineOn ? "bg-brass text-brass-ink" : "bg-raised text-fg"
          }`}
        >
          {state.engineOn ? "On" : "Turn on"}
        </button>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-raised">
        <div className="h-full bg-fg transition-[width] duration-200" style={{ width: `${share * 100}%` }} />
      </div>
      <p className="text-xs text-muted">
        {snap.status === "error"
          ? snap.error
          : !state.engineOn
            ? "Stockfish is paused."
            : snap.status === "loading"
              ? "Waking Stockfish…"
              : live
                ? `Depth ${live.depth || "—"} · ${live.nodes ? `${Math.round(live.nodes / 1000)}k nodes` : "searching"}`
                : "Thinking…"}
      </p>
      <ol className="flex flex-col gap-2">
        {(live?.lines ?? []).map((line) => (
          <li key={line.multipv}>
            <button
              type="button"
              onClick={() => {
                const san = line.pv[0];
                if (san) state.attemptSan(san);
              }}
              className="flex w-full min-h-11 items-baseline gap-3 rounded-lg bg-raised px-3 py-2 text-left hover:bg-line"
            >
              <span className="w-12 shrink-0 font-medium text-brass tabular-nums">{formatEval(line)}</span>
              <span className="text-sm text-fg">{formatPv(fen, line.pv)}</span>
            </button>
          </li>
        ))}
      </ol>
      {state.engineOn && snap.status !== "error" ? (
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => getEngine().deeper()}
            className="min-h-11 text-sm text-brass"
          >
            Search deeper
          </button>
          <p className="text-xs text-muted">Stockfish 19 lite · GPL-3.0</p>
        </div>
      ) : null}
    </section>
  );
}
