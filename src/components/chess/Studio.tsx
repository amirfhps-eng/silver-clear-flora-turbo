import { useEffect, useMemo, useState } from "react";
import { identifyFen, splitOpeningName } from "@/lib/chess/openings";
import { chessOf, lineSans, useLinebook } from "@/lib/chess/store";
import { Board } from "./Board";
import { BookPanel } from "./BookPanel";
import { EnginePanel } from "./EnginePanel";

function Hydrate() {
  useEffect(() => {
    void useLinebook.persist.rehydrate();
  }, []);
  return null;
}

function TrainDriver() {
  const mode = useLinebook((state) => state.mode);
  const phase = useLinebook((state) => state.trainPhase);
  const tick = useLinebook((state) => state.trainTick);
  useEffect(() => {
    if (mode !== "train" || phase !== "them") return;
    const id = window.setTimeout(() => useLinebook.getState().playBookReply(), 520);
    return () => window.clearTimeout(id);
  }, [mode, phase, tick]);
  return null;
}

function OpeningBlock({ fen }: { fen: string }) {
  const hit = useMemo(() => identifyFen(fen), [fen]);
  if (!hit) {
    return (
      <div>
        <p className="text-xs tracking-widest text-brass uppercase">Opening</p>
        <h2 className="font-display text-3xl leading-tight text-fg">Starting position</h2>
        <p className="mt-1 text-sm text-muted">Names appear as soon as the position is in the book.</p>
      </div>
    );
  }
  const { family, variation } = splitOpeningName(hit.name);
  return (
    <div>
      <p className="text-xs tracking-widest text-brass uppercase">
        {hit.eco}
        {hit.exact ? "" : " · last named line"}
      </p>
      <h2 className="font-display text-3xl leading-tight text-balance text-fg">{family}</h2>
      {variation ? <p className="mt-1 text-sm text-muted">{variation}</p> : null}
      {!hit.exact ? <p className="mt-1 text-sm text-muted">Past the named position.</p> : null}
    </div>
  );
}

export function Studio() {
  const state = useLinebook();
  const chess = chessOf(state);
  const fen = chess.fen();
  const sans = lineSans(state);
  const [panel, setPanel] = useState<"engine" | "book">("book");
  const [fenDraft, setFenDraft] = useState("");

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target;
      if (target instanceof HTMLElement && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        useLinebook.getState().undo();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const turn = chess.turn();
  const status = chess.isCheckmate()
    ? "Checkmate"
    : chess.isStalemate()
      ? "Stalemate"
      : chess.isDraw()
        ? "Draw"
        : `${turn === "w" ? "White" : "Black"} to move${chess.isCheck() ? " · check" : ""}`;

  return (
    <div className="flex min-h-dvh flex-col bg-bg text-fg lg:h-dvh lg:overflow-hidden">
      <Hydrate />
      <TrainDriver />
      <header className="flex shrink-0 flex-col gap-3 border-b border-line px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-baseline gap-3">
          <p className="font-display text-2xl leading-none tracking-tight text-fg">Linebook</p>
          <p className="text-sm text-muted">Repertoire</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-full bg-surface p-1">
            {(
              [
                ["study", "Study"],
                ["train", "Train"],
                ["analyze", "Analyze"],
              ] as const
            ).map(([mode, label]) => (
              <button
                key={mode}
                type="button"
                onClick={() => state.setMode(mode)}
                className={`min-h-11 rounded-full px-4 text-sm font-medium ${
                  state.mode === mode ? "bg-brass text-brass-ink" : "text-muted"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="flex rounded-full bg-surface p-1">
            {(["white", "black"] as const).map((side) => (
              <button
                key={side}
                type="button"
                onClick={() => state.setSide(side)}
                className={`min-h-11 rounded-full px-4 text-sm font-medium capitalize ${
                  state.side === side ? "bg-raised text-fg" : "text-muted"
                }`}
              >
                {side}
              </button>
            ))}
          </div>
        </div>
      </header>
      {state.notice ? (
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-line bg-raised px-4 py-2">
          <p className="text-sm text-fg">{state.notice}</p>
          <button type="button" onClick={state.dismissNotice} className="min-h-11 px-2 text-sm text-muted">
            Dismiss
          </button>
        </div>
      ) : null}
      <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(0,42rem)_minmax(22rem,1fr)]">
        <section className="flex flex-col gap-4 px-4 py-4 lg:overflow-y-auto">
          <OpeningBlock fen={fen} />
          <p className="text-sm text-muted">{status}</p>
          <div className="mx-auto w-full max-w-xl">
            <Board />
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1">
            <button
              type="button"
              onClick={() => state.jumpTo(0)}
              className={`min-h-11 shrink-0 rounded-full px-3 text-sm ${
                sans.length === 0 ? "bg-brass text-brass-ink" : "bg-surface text-muted"
              }`}
            >
              Start
            </button>
            {sans.map((san, index) => (
              <button
                key={`${san}-${index}`}
                type="button"
                onClick={() => state.jumpTo(index + 1)}
                className={`min-h-11 shrink-0 rounded-full px-3 text-sm tabular-nums ${
                  index === sans.length - 1 ? "bg-brass text-brass-ink" : "bg-surface text-fg"
                }`}
              >
                {index % 2 === 0 ? `${index / 2 + 1}. ` : ""}
                {san}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={state.undo} className="min-h-11 rounded-full bg-surface px-4 text-sm">
              Undo
            </button>
            <button type="button" onClick={state.flip} className="min-h-11 rounded-full bg-surface px-4 text-sm">
              Flip board
            </button>
            {state.mode === "study" && state.scratch.length > 0 ? (
              <button
                type="button"
                onClick={state.saveScratch}
                className="min-h-11 rounded-full bg-brass px-4 text-sm font-medium text-brass-ink"
              >
                Add to book
              </button>
            ) : null}
            {state.mode === "study" ? (
              <p className="self-center text-sm text-muted">
                {state.scratch.length ? "Exploring, not saved" : "In the book"}
              </p>
            ) : null}
          </div>
          {state.mode === "train" ? (
            <div className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-4">
              <p className="font-display text-2xl leading-tight text-fg">{state.trainNote}</p>
              <p className="text-sm text-muted">
                {state.trainCorrect} correct · {state.trainTries} tries
                {state.trainPhase === "miss" && state.expected.length
                  ? ` · book: ${state.expected.join(", ")}`
                  : ""}
              </p>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={state.toggleHint} className="min-h-11 rounded-full bg-raised px-4 text-sm">
                  {state.showHint ? "Hide hint" : "Hint"}
                </button>
                {state.trainPhase === "miss" ? (
                  <>
                    <button
                      type="button"
                      onClick={state.retryTrain}
                      className="min-h-11 rounded-full bg-brass px-4 text-sm font-medium text-brass-ink"
                    >
                      Try again
                    </button>
                    <button type="button" onClick={state.revealTrainMove} className="min-h-11 rounded-full bg-raised px-4 text-sm">
                      Play the book move
                    </button>
                  </>
                ) : null}
                <button type="button" onClick={() => state.startTrain(false)} className="min-h-11 rounded-full bg-raised px-4 text-sm">
                  Restart
                </button>
                <button type="button" onClick={() => state.startTrain(true)} className="min-h-11 rounded-full bg-raised px-4 text-sm">
                  Random spot
                </button>
              </div>
            </div>
          ) : null}
          {state.mode === "analyze" ? (
            <form
              className="flex flex-col gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                if (fenDraft.trim()) state.loadFen(fenDraft);
              }}
            >
              <label className="text-xs tracking-wide text-muted uppercase" htmlFor="fen">
                FEN
              </label>
              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  id="fen"
                  value={fenDraft}
                  onChange={(event) => setFenDraft(event.target.value)}
                  placeholder={fen}
                  className="min-h-11 w-full rounded-lg border border-line bg-surface px-3 text-sm text-fg outline-none focus-visible:ring-2 focus-visible:ring-brass"
                />
                <button type="submit" className="min-h-11 rounded-full bg-brass px-4 text-sm font-medium text-brass-ink">
                  Load
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={state.clearAnalyze} className="min-h-11 rounded-full bg-surface px-4 text-sm">
                  Initial position
                </button>
                <button
                  type="button"
                  onClick={state.saveAnalyzeLine}
                  className="min-h-11 rounded-full bg-surface px-4 text-sm"
                >
                  Save line to {state.side}
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(fen);
                      useLinebook.setState({ notice: "FEN copied." });
                    } catch {
                      useLinebook.setState({ notice: "Could not copy the FEN." });
                    }
                  }}
                  className="min-h-11 rounded-full bg-surface px-4 text-sm"
                >
                  Copy FEN
                </button>
              </div>
            </form>
          ) : null}
        </section>
        <aside className="flex min-h-0 flex-col gap-4 border-t border-line px-4 py-4 lg:overflow-y-auto lg:border-t-0 lg:border-l">
          <div className="flex gap-2 lg:hidden">
            <button
              type="button"
              onClick={() => setPanel("book")}
              className={`min-h-11 flex-1 rounded-full text-sm font-medium ${
                panel === "book" ? "bg-brass text-brass-ink" : "bg-surface text-muted"
              }`}
            >
              Book
            </button>
            <button
              type="button"
              onClick={() => setPanel("engine")}
              className={`min-h-11 flex-1 rounded-full text-sm font-medium ${
                panel === "engine" ? "bg-brass text-brass-ink" : "bg-surface text-muted"
              }`}
            >
              Engine
            </button>
          </div>
          <div className={panel === "engine" ? "lg:block" : "hidden lg:block"}>
            <EnginePanel />
          </div>
          <div className={panel === "book" ? "lg:block" : "hidden lg:block"}>
            <BookPanel />
          </div>
          <p className="text-xs text-muted">
            Openings from the Lichess book. Analysis runs in your browser with Stockfish and is never uploaded.
          </p>
        </aside>
      </div>
    </div>
  );
}
