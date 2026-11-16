import { useState } from "react";
import { countMoves, exportPgn, nodeAt } from "@/lib/chess/book";
import { downloadPgn, useLinebook } from "@/lib/chess/store";
import type { BookNode } from "@/lib/chess/types";

function Branch({
  node,
  path,
  ply,
  activePath,
}: {
  node: BookNode;
  path: string[];
  ply: number;
  activePath: string[];
}) {
  const selectNode = useLinebook((state) => state.selectNode);
  if (!node.children.length) return null;
  const moveNo = Math.floor(ply / 2) + 1;
  const white = ply % 2 === 0;
  return (
    <ul className={ply === 0 ? "flex flex-col" : "ms-3 flex flex-col border-l border-line"}>
      {node.children.map((child) => {
        const childPath = [...path, child.id];
        const current = activePath[activePath.length - 1] === child.id && activePath.length === childPath.length;
        const onPath = activePath[ply + 1] === child.id;
        return (
          <li key={child.id}>
            <button
              type="button"
              onClick={() => selectNode(childPath)}
              className={`flex min-h-11 w-full items-center gap-2 rounded-lg px-2 text-left ${
                current ? "bg-brass text-brass-ink" : onPath ? "bg-raised text-fg" : "text-fg hover:bg-raised"
              }`}
            >
              <span className="w-10 shrink-0 text-xs opacity-70 tabular-nums">
                {white ? `${moveNo}.` : `${moveNo}…`}
              </span>
              <span className="font-medium">{child.san}</span>
              {child.comment ? <span className="size-1.5 rounded-full bg-current opacity-70" /> : null}
            </button>
            <Branch node={child} path={childPath} ply={ply + 1} activePath={activePath} />
          </li>
        );
      })}
    </ul>
  );
}

export function BookPanel() {
  const state = useLinebook();
  const root = state.book[state.side];
  const exploring = state.mode === "study" && state.scratch.length > 0;
  const current = exploring ? null : nodeAt(root, state.nodePath);
  const parent =
    state.nodePath.length > 1 ? nodeAt(root, state.nodePath.slice(0, -1)) : null;
  const isMain = parent?.children[0]?.id === current?.id;
  const [importOpen, setImportOpen] = useState(false);
  const [pgnText, setPgnText] = useState("");
  const moves = countMoves(root);

  return (
    <section className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs tracking-wide text-muted uppercase">Repertoire</p>
          <h2 className="font-display text-2xl leading-tight text-fg">
            {state.side === "white" ? "White" : "Black"} book
          </h2>
          <p className="text-sm text-muted">{moves} stored moves</p>
        </div>
        <button
          type="button"
          onClick={state.toggleRecord}
          className={`min-h-11 rounded-full px-4 text-sm font-medium ${
            state.recording ? "bg-brass text-brass-ink" : "bg-raised text-fg"
          }`}
        >
          {state.recording ? "Recording" : "Record"}
        </button>
      </div>
      <p className="text-sm text-muted">
        {state.recording
          ? "Moves you play are written into this book, including the opponent’s replies."
          : "Moves already in the book are followed. New moves stay as a private exploration until you add them."}
      </p>
      {exploring ? (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={state.saveScratch}
            className="min-h-11 rounded-full bg-brass px-4 text-sm font-medium text-brass-ink"
          >
            Add line to book
          </button>
          <button type="button" onClick={state.deleteCurrent} className="min-h-11 px-3 text-sm text-muted">
            Discard
          </button>
        </div>
      ) : null}
      <div className="max-h-80 overflow-y-auto pr-1">
        {root.children.length ? (
          <Branch node={root} path={[root.id]} ply={0} activePath={exploring ? state.nodePath : state.nodePath} />
        ) : (
          <p className="text-sm text-muted">No moves yet. Turn on Record and play the first move of a line.</p>
        )}
      </div>
      <label className="flex flex-col gap-2 text-sm">
        <span className="text-muted">{exploring ? "Save the line before annotating it." : "Note on this position"}</span>
        <textarea
          value={exploring ? "" : (current?.comment ?? "")}
          disabled={exploring || !current}
          onChange={(event) => state.setNodeComment(event.target.value)}
          rows={3}
          placeholder="Why this move, what to remember…"
          className="min-h-24 w-full resize-y rounded-lg border border-line bg-bg px-3 py-2 text-fg outline-none focus-visible:ring-2 focus-visible:ring-brass disabled:opacity-50"
        />
      </label>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={!current || state.nodePath.length < 2 || isMain || exploring}
          onClick={state.promoteCurrent}
          className="min-h-11 rounded-full bg-raised px-4 text-sm disabled:opacity-40"
        >
          Make main line
        </button>
        <button
          type="button"
          disabled={state.nodePath.length < 2 && !exploring}
          onClick={state.deleteCurrent}
          className="min-h-11 rounded-full bg-raised px-4 text-sm text-miss disabled:opacity-40"
        >
          Delete
        </button>
      </div>
      <div className="flex flex-wrap gap-2 border-t border-line pt-3">
        <button
          type="button"
          onClick={() => downloadPgn(state.side, root)}
          className="min-h-11 rounded-full bg-raised px-4 text-sm"
        >
          Export PGN
        </button>
        <button
          type="button"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(exportPgn(root, state.side));
              useLinebook.setState({ notice: "PGN copied." });
            } catch {
              useLinebook.setState({ notice: "Could not copy. Use Export instead." });
            }
          }}
          className="min-h-11 rounded-full bg-raised px-4 text-sm"
        >
          Copy PGN
        </button>
        <button
          type="button"
          onClick={() => setImportOpen((open) => !open)}
          className="min-h-11 rounded-full bg-raised px-4 text-sm"
        >
          Import
        </button>
        {state.confirmReset ? (
          <>
            <button
              type="button"
              onClick={state.resetSide}
              className="min-h-11 rounded-full bg-miss px-4 text-sm text-fg"
            >
              Clear book
            </button>
            <button type="button" onClick={() => state.askReset(false)} className="min-h-11 px-3 text-sm text-muted">
              Cancel
            </button>
          </>
        ) : (
          <button type="button" onClick={() => state.askReset(true)} className="min-h-11 px-3 text-sm text-muted">
            Reset
          </button>
        )}
      </div>
      {importOpen ? (
        <form
          className="flex flex-col gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            state.mergePgn(pgnText);
            setPgnText("");
            setImportOpen(false);
          }}
        >
          <textarea
            value={pgnText}
            onChange={(event) => setPgnText(event.target.value)}
            rows={5}
            placeholder="Paste PGN. Variations in parentheses are kept."
            className="w-full rounded-lg border border-line bg-bg px-3 py-2 text-sm text-fg outline-none focus-visible:ring-2 focus-visible:ring-brass"
          />
          <div className="flex flex-wrap gap-2">
            <button type="submit" className="min-h-11 rounded-full bg-brass px-4 text-sm font-medium text-brass-ink">
              Merge into book
            </button>
            <label className="min-h-11 cursor-pointer rounded-full bg-raised px-4 py-3 text-sm">
              Choose file
              <input
                type="file"
                accept=".pgn,text/plain"
                className="sr-only"
                onChange={async (event) => {
                  const file = event.target.files?.[0];
                  if (!file) return;
                  const text = await file.text();
                  state.mergePgn(text);
                  event.target.value = "";
                  setImportOpen(false);
                }}
              />
            </label>
          </div>
        </form>
      ) : null}
    </section>
  );
}
