import { Chess, type Move } from "chess.js";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  countMoves,
  deleteNode,
  emptyNode,
  exportPgn,
  graftSans,
  importPgn,
  isInitialBoard,
  isPlayerTurn,
  mergeTrees,
  newId,
  nodeAt,
  pathOk,
  promoteChild,
  replay,
  sansAlong,
  scrub,
  seedBook,
  setComment,
  uciOf,
  yourTurnPaths,
} from "./book";
import type { BookNode, Mode, Side, TrainPhase } from "./types";

export type Anchors = { white: string[]; black: string[] };

type Book = { white: BookNode; black: BookNode };

export type LineState = {
  book: Book;
  side: Side;
  mode: Mode;
  anchors: Anchors;
  nodePath: string[];
  scratch: string[];
  setupFen: string | null;
  recording: boolean;
  orientation: Side;
  engineOn: boolean;
  trainPath: string[];
  trainPhase: TrainPhase;
  trainNote: string;
  trainCorrect: number;
  trainTries: number;
  showHint: boolean;
  trainTick: number;
  expected: string[];
  notice: string | null;
  confirmReset: boolean;
};

type LineActions = {
  setMode: (mode: Mode) => void;
  setSide: (side: Side) => void;
  toggleRecord: () => void;
  toggleEngine: () => void;
  flip: () => void;
  dismissNotice: () => void;
  attemptMove: (from: string, to: string, promotion?: string) => boolean;
  attemptSan: (san: string) => boolean;
  undo: () => void;
  jumpTo: (ply: number) => void;
  saveScratch: () => void;
  setNodeComment: (comment: string) => void;
  deleteCurrent: () => void;
  promoteCurrent: () => void;
  selectNode: (path: string[]) => void;
  resetSide: () => void;
  askReset: (open: boolean) => void;
  mergePgn: (pgn: string) => void;
  loadFen: (fen: string) => void;
  clearAnalyze: () => void;
  saveAnalyzeLine: () => void;
  startTrain: (random: boolean) => void;
  playBookReply: () => void;
  retryTrain: () => void;
  revealTrainMove: () => void;
  toggleHint: () => void;
};

export type LineStore = LineState & LineActions;

const seeded = seedBook();

function initialAnchors(book: Book): Anchors {
  return { white: [book.white.id], black: [book.black.id] };
}

const initial: LineState = {
  book: seeded,
  side: "white",
  mode: "study",
  anchors: initialAnchors(seeded),
  nodePath: [seeded.white.id],
  scratch: [],
  setupFen: null,
  recording: false,
  orientation: "white",
  engineOn: true,
  trainPath: [seeded.white.id],
  trainPhase: "you",
  trainNote: "Your move.",
  trainCorrect: 0,
  trainTries: 0,
  showHint: false,
  trainTick: 0,
  expected: [],
  notice: null,
  confirmReset: false,
};

export function chessOf(state: LineState): Chess {
  if (state.mode === "analyze") {
    const chess = new Chess();
    if (state.setupFen) {
      try {
        chess.load(state.setupFen);
      } catch {
        return new Chess();
      }
    }
    for (const san of state.scratch) {
      if (!chess.move(san)) break;
    }
    return chess;
  }
  if (state.mode === "train") return replay(state.book[state.side], state.trainPath);
  const chess = replay(state.book[state.side], state.nodePath);
  for (const san of state.scratch) {
    if (!chess.move(san)) break;
  }
  return chess;
}

export function lineSans(state: LineState): string[] {
  if (state.mode === "analyze") return chessOf(state).history();
  if (state.mode === "train") return sansAlong(state.book[state.side], state.trainPath);
  return [...sansAlong(state.book[state.side], state.nodePath), ...state.scratch];
}

function isNode(value: unknown): value is BookNode {
  if (!value || typeof value !== "object") return false;
  const node = value as BookNode;
  return typeof node.id === "string" && Array.isArray(node.children);
}

export const useLinebook = create<LineStore>()(
  persist(
    (set, get) => {
      const settleTrain = () => {
        const state = get();
        const node = nodeAt(state.book[state.side], state.trainPath);
        if (!node) return;
        const ply = replay(state.book[state.side], state.trainPath).history().length;
        if (node.children.length === 0) {
          const empty = state.trainPath.length <= 1;
          set({
            trainPhase: "end",
            trainNote: empty
              ? "Nothing to train yet. Add moves in Study first."
              : "End of the line. Nothing more is written here.",
            expected: [],
          });
          return;
        }
        if (isPlayerTurn(state.side, ply)) {
          set({ trainPhase: "you", expected: node.children.map((child) => child.san) });
          return;
        }
        set({
          trainPhase: "them",
          trainTick: state.trainTick + 1,
          trainNote: "Their move…",
          expected: [],
        });
      };

      const commit = (move: Move): boolean => {
        const state = get();
        const san = move.san;
        const uci = uciOf(move);

        if (state.mode === "analyze") {
          set({ scratch: [...state.scratch, san], notice: null });
          return true;
        }

        if (state.mode === "train") {
          if (state.trainPhase !== "you") return false;
          const node = nodeAt(state.book[state.side], state.trainPath);
          if (!node) return false;
          const child = node.children.find((item) => item.san === san || item.uci === uci);
          if (!child) {
            set({
              trainPhase: "miss",
              trainTries: state.trainTries + 1,
              trainNote: `${san} is not in the book.`,
              expected: node.children.map((item) => item.san),
              showHint: true,
            });
            return false;
          }
          set({
            trainPath: [...state.trainPath, child.id],
            trainTries: state.trainTries + 1,
            trainCorrect: state.trainCorrect + 1,
            trainNote: `${san} is in the book.`,
            showHint: false,
            expected: [],
          });
          settleTrain();
          return true;
        }

        const root = state.book[state.side];
        if (state.scratch.length === 0) {
          const node = nodeAt(root, state.nodePath);
          const existing = node?.children.find((child) => child.san === san);
          if (existing) {
            const nodePath = [...state.nodePath, existing.id];
            set({
              nodePath,
              anchors: { ...state.anchors, [state.side]: nodePath },
              notice: null,
            });
            return true;
          }
        }

        if (state.recording) {
          const grafted = graftSans(root, state.nodePath, [...state.scratch, san]);
          const book = { ...state.book, [state.side]: grafted.root };
          set({
            book,
            nodePath: grafted.path,
            anchors: { ...state.anchors, [state.side]: grafted.path },
            scratch: [],
            notice: null,
          });
          return true;
        }

        set({
          scratch: [...state.scratch, san],
          notice: "Exploring. Add the line if you want it in the repertoire.",
        });
        return true;
      };

      return {
        ...initial,

        setMode: (mode) => {
          const state = get();
          if (mode === state.mode) return;
          if (mode === "train") {
            set({ mode: "train", orientation: state.side, scratch: [], showHint: false, notice: null });
            get().startTrain(false);
            return;
          }
          if (mode === "analyze") {
            const sans = chessOf(state).history();
            set({
              mode: "analyze",
              setupFen: null,
              scratch: sans,
              notice: null,
              confirmReset: false,
            });
            return;
          }
          set({ mode: "study", notice: null, confirmReset: false });
        },

        setSide: (side) => {
          const state = get();
          if (side === state.side) return;
          const anchors = {
            ...state.anchors,
            [state.side]: state.scratch.length ? state.anchors[state.side] : state.nodePath,
          };
          const root = state.book[side];
          const nodePath = pathOk(root, anchors[side]) ? anchors[side] : [root.id];
          set({
            side,
            anchors: { ...anchors, [side]: nodePath },
            nodePath,
            scratch: [],
            orientation: side,
            notice: null,
            confirmReset: false,
          });
          if (state.mode === "train") get().startTrain(false);
        },

        toggleRecord: () => set({ recording: !get().recording }),
        toggleEngine: () => set({ engineOn: !get().engineOn }),
        flip: () => set({ orientation: get().orientation === "white" ? "black" : "white" }),
        dismissNotice: () => set({ notice: null }),

        attemptMove: (from, to, promotion) => {
          const chess = chessOf(get());
          const move = chess.move({ from, to, promotion });
          if (!move) return false;
          return commit(move);
        },

        attemptSan: (san) => {
          const chess = chessOf(get());
          const move = chess.move(san);
          if (!move) return false;
          return commit(move);
        },

        undo: () => {
          const state = get();
          if (state.mode === "analyze") {
            if (state.scratch.length) set({ scratch: state.scratch.slice(0, -1), notice: null });
            return;
          }
          if (state.mode === "train") {
            if (state.trainPath.length <= 1) return;
            set({
              trainPath: state.trainPath.slice(0, -1),
              showHint: false,
              trainNote: "Back one move.",
            });
            settleTrain();
            return;
          }
          if (state.scratch.length) {
            set({ scratch: state.scratch.slice(0, -1), notice: null });
            return;
          }
          if (state.nodePath.length > 1) {
            const nodePath = state.nodePath.slice(0, -1);
            set({ nodePath, anchors: { ...state.anchors, [state.side]: nodePath }, notice: null });
          }
        },

        jumpTo: (ply) => {
          const state = get();
          const target = Math.max(0, ply);
          if (state.mode === "analyze") {
            set({ scratch: state.scratch.slice(0, target), notice: null });
            return;
          }
          if (state.mode === "train") {
            set({
              trainPath: state.trainPath.slice(0, target + 1),
              showHint: false,
              trainNote: "Stepped back in the line.",
            });
            settleTrain();
            return;
          }
          const bookPlies = state.nodePath.length - 1;
          if (target <= bookPlies) {
            const nodePath = state.nodePath.slice(0, target + 1);
            set({ nodePath, scratch: [], anchors: { ...state.anchors, [state.side]: nodePath }, notice: null });
            return;
          }
          set({ scratch: state.scratch.slice(0, target - bookPlies), notice: null });
        },

        saveScratch: () => {
          const state = get();
          if (state.mode !== "study" || !state.scratch.length) return;
          const grafted = graftSans(state.book[state.side], state.nodePath, state.scratch);
          set({
            book: { ...state.book, [state.side]: grafted.root },
            nodePath: grafted.path,
            anchors: { ...state.anchors, [state.side]: grafted.path },
            scratch: [],
            notice: "Line added to the repertoire.",
          });
        },

        setNodeComment: (comment) => {
          const state = get();
          if (state.mode !== "study" || state.scratch.length) return;
          const id = state.nodePath[state.nodePath.length - 1];
          if (!id) return;
          const root = setComment(state.book[state.side], id, comment);
          set({ book: { ...state.book, [state.side]: root } });
        },

        deleteCurrent: () => {
          const state = get();
          if (state.mode !== "study") return;
          if (state.scratch.length) {
            set({ scratch: [], notice: "Exploration discarded." });
            return;
          }
          if (state.nodePath.length <= 1) return;
          const id = state.nodePath[state.nodePath.length - 1];
          if (!id) return;
          const root = deleteNode(state.book[state.side], id);
          const nodePath = state.nodePath.slice(0, -1);
          set({
            book: { ...state.book, [state.side]: root },
            nodePath,
            anchors: { ...state.anchors, [state.side]: nodePath },
            notice: "Move deleted.",
          });
        },

        promoteCurrent: () => {
          const state = get();
          if (state.mode !== "study" || state.scratch.length || state.nodePath.length <= 1) return;
          const id = state.nodePath[state.nodePath.length - 1];
          if (!id) return;
          const root = promoteChild(state.book[state.side], id);
          set({ book: { ...state.book, [state.side]: root }, notice: "Marked as the main move." });
        },

        selectNode: (path) => {
          const state = get();
          if (!pathOk(state.book[state.side], path)) return;
          set({
            mode: state.mode === "analyze" ? "study" : state.mode,
            nodePath: path,
            scratch: [],
            anchors: { ...state.anchors, [state.side]: path },
            notice: null,
          });
          if (state.mode === "train") {
            set({ trainPath: path, showHint: false, trainNote: "Drilling from this position." });
            settleTrain();
          }
        },

        askReset: (open) => set({ confirmReset: open }),

        resetSide: () => {
          const state = get();
          let n = 0;
          const fresh = emptyNode(`reset${Date.now().toString(36)}${n++}`);
          const intro =
            state.side === "white"
              ? "White repertoire. Record the moves you want to remember."
              : "Black repertoire. Record the replies you are willing to face.";
          const root = { ...fresh, comment: intro };
          const book = { ...state.book, [state.side]: root };
          set({
            book,
            nodePath: [root.id],
            anchors: { ...state.anchors, [state.side]: [root.id] },
            scratch: [],
            confirmReset: false,
            notice: `${state.side === "white" ? "White" : "Black"} repertoire cleared.`,
          });
        },

        mergePgn: (pgn) => {
          const state = get();
          const imported = importPgn(pgn);
          if (!imported.root.children.length) {
            set({ notice: imported.warnings[0] ?? "Nothing was imported." });
            return;
          }
          const root = scrub(mergeTrees(state.book[state.side], imported.root));
          const moves = countMoves(root);
          set({
            book: { ...state.book, [state.side]: root },
            notice: imported.warnings[0]
              ? `Merged with a warning. ${imported.warnings[0]}`
              : `Merged into the ${state.side} repertoire · ${moves} moves stored.`,
          });
        },

        loadFen: (fen) => {
          const trimmed = fen.trim();
          try {
            const chess = new Chess(trimmed);
            const loaded = chess.fen();
            set({
              mode: "analyze",
              setupFen: loaded,
              scratch: [],
              notice: isInitialBoard(loaded)
                ? "Back to the starting position."
                : "Position loaded. The opening name still resolves; a line can be saved only from the start position.",
            });
          } catch {
            set({ notice: "That FEN could not be read." });
          }
        },

        clearAnalyze: () => set({ setupFen: null, scratch: [], notice: null }),

        saveAnalyzeLine: () => {
          const state = get();
          if (state.mode !== "analyze") return;
          if (state.setupFen && !isInitialBoard(state.setupFen)) {
            set({ notice: "Start from the initial position to attach a line to the repertoire." });
            return;
          }
          const sans = state.scratch;
          if (!sans.length) {
            set({ notice: "Play a few moves first." });
            return;
          }
          const root = state.book[state.side];
          const grafted = graftSans(root, [root.id], sans);
          set({
            book: { ...state.book, [state.side]: grafted.root },
            anchors: { ...state.anchors, [state.side]: grafted.path },
            nodePath: grafted.path,
            notice: `Saved into the ${state.side} repertoire.`,
          });
        },

        startTrain: (random) => {
          const state = get();
          const root = state.book[state.side];
          const spots = yourTurnPaths(root, state.side);
          let trainPath = [root.id];
          if (random && spots.length) {
            trainPath = spots[Math.floor(Math.random() * spots.length)] ?? trainPath;
          }
          set({
            mode: "train",
            orientation: state.side,
            trainPath,
            trainCorrect: random ? state.trainCorrect : 0,
            trainTries: random ? state.trainTries : 0,
            showHint: false,
            expected: [],
            scratch: [],
            trainNote: random ? "Random position from your book." : "Your move.",
            trainTick: state.trainTick + 1,
            notice: null,
            engineOn: false,
          });
          settleTrain();
        },

        playBookReply: () => {
          const state = get();
          if (state.mode !== "train" || state.trainPhase !== "them") return;
          const node = nodeAt(state.book[state.side], state.trainPath);
          if (!node || node.children.length === 0) {
            set({ trainPhase: "end", trainNote: "End of the line." });
            return;
          }
          const child = node.children[Math.floor(Math.random() * node.children.length)];
          if (!child) return;
          set({
            trainPath: [...state.trainPath, child.id],
            trainNote: `They played ${child.san}.`,
          });
          settleTrain();
        },

        retryTrain: () => {
          const state = get();
          if (state.trainPhase !== "miss") return;
          set({ trainPhase: "you", trainNote: "Try again.", showHint: state.showHint });
        },

        revealTrainMove: () => {
          const state = get();
          const node = nodeAt(state.book[state.side], state.trainPath);
          const child = node?.children[0];
          if (!child) return;
          set({
            trainPath: [...state.trainPath, child.id],
            trainNote: `The book move is ${child.san}.`,
            showHint: false,
            trainPhase: "you",
          });
          settleTrain();
        },

        toggleHint: () => set({ showHint: !get().showHint }),
      };
    },
    {
      name: "linebook-v1",
      version: 1,
      skipHydration: true,
      partialize: (state) => ({
        book: state.book,
        side: state.side,
        mode: state.mode,
        anchors: state.anchors,
        nodePath: state.nodePath,
        recording: state.recording,
        orientation: state.orientation,
        engineOn: state.engineOn,
      }),
      merge: (persisted, current) => sanitize(persisted, current),
    },
  ),
);

function sanitize(persisted: unknown, current: LineStore): LineStore {
  if (!persisted || typeof persisted !== "object") return current;
  const saved = persisted as Partial<LineState>;
  if (!saved.book || !isNode(saved.book.white) || !isNode(saved.book.black)) return current;
  const book = {
    white: scrub(saved.book.white),
    black: scrub(saved.book.black),
  };
  const side: Side = saved.side === "black" ? "black" : "white";
  const mode: Mode = saved.mode === "analyze" ? "analyze" : "study";
  const nodePath = pathOk(book[side], saved.nodePath) ? saved.nodePath : [book[side].id];
  const anchors: Anchors = {
    white: pathOk(book.white, saved.anchors?.white) ? saved.anchors.white : [book.white.id],
    black: pathOk(book.black, saved.anchors?.black) ? saved.anchors.black : [book.black.id],
  };
  return {
    ...current,
    book,
    side,
    mode,
    anchors,
    nodePath,
    scratch: [],
    setupFen: null,
    recording: Boolean(saved.recording),
    orientation: saved.orientation === "black" ? "black" : "white",
    engineOn: saved.engineOn !== false,
    trainPath: [book[side].id],
    confirmReset: false,
    notice: null,
  };
}

export function downloadPgn(side: Side, root: BookNode) {
  const text = exportPgn(root, side);
  const blob = new Blob([text], { type: "application/x-chess-pgn" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `linebook-${side}.pgn`;
  link.click();
  URL.revokeObjectURL(url);
}

export { exportPgn };
