import { Chess } from "chess.js";
import { previewPathPrefix } from "@/lib/preview-path-prefix";
import type { EngineLine, EngineSnapshot } from "./types";

const EMPTY: EngineSnapshot = {
  status: "loading",
  fen: null,
  depth: 0,
  nodes: 0,
  nps: 0,
  lines: [],
};

function engineScriptUrl(): string {
  const file = "/engine/stockfish-19-lite-single.js";
  if (typeof window === "undefined") return file;
  const prefix = previewPathPrefix(window.location.hostname, window.location.pathname) ?? "";
  return `${prefix}${file}`;
}

export function uciMovesToSans(fen: string, uciMoves: string[]): string[] {
  let chess: Chess;
  try {
    chess = new Chess(fen);
  } catch {
    return [];
  }
  const sans: string[] = [];
  for (const uci of uciMoves) {
    if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(uci)) break;
    const move = chess.move({
      from: uci.slice(0, 2),
      to: uci.slice(2, 4),
      promotion: uci[4],
    });
    if (!move) break;
    sans.push(move.san);
  }
  return sans;
}

type Listener = (snapshot: EngineSnapshot) => void;

class StockfishClient {
  private worker: Worker | null = null;
  private listeners = new Set<Listener>();
  private snap: EngineSnapshot = EMPTY;
  private ready = false;
  private searching = false;
  private pendingFen: string | null = null;
  private activeFen: string | null = null;
  private depth = 16;
  private halted = false;
  private frame = 0;
  private dirty = false;

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.snap);
    return () => this.listeners.delete(listener);
  }

  private emit(partial: Partial<EngineSnapshot>) {
    this.snap = { ...this.snap, ...partial };
    if (this.dirty) return;
    this.dirty = true;
    this.frame = window.requestAnimationFrame(() => {
      this.dirty = false;
      for (const listener of this.listeners) listener(this.snap);
    });
  }

  private ensure() {
    if (this.worker || typeof window === "undefined") return;
    try {
      const worker = new Worker(engineScriptUrl());
      this.worker = worker;
      worker.onmessage = (event: MessageEvent<unknown>) => {
        if (typeof event.data !== "string" || !event.data) return;
        this.onLine(event.data);
      };
      worker.onerror = (event) => {
        event.preventDefault();
        this.ready = false;
        this.searching = false;
        this.emit({
          status: "error",
          error: "Stockfish could not start in this browser.",
        });
      };
      worker.postMessage("uci");
    } catch {
      this.emit({ status: "error", error: "Stockfish could not start in this browser." });
    }
  }

  private onLine(line: string) {
    if (line === "uciok") {
      this.worker?.postMessage("setoption name MultiPV value 3");
      this.worker?.postMessage("setoption name Hash value 16");
      this.worker?.postMessage("isready");
      return;
    }
    if (line === "readyok") {
      this.ready = true;
      this.emit({ status: this.searching ? "thinking" : "ready" });
      if (this.pendingFen && !this.halted) this.kick();
      return;
    }
    if (line.startsWith("info ") && line.includes(" pv ") && !line.includes("lowerbound") && !line.includes("upperbound")) {
      this.parseInfo(line);
      return;
    }
    if (line.startsWith("bestmove")) {
      this.searching = false;
      if (!this.halted && this.pendingFen && this.pendingFen !== this.activeFen) {
        this.kick();
        return;
      }
      this.emit({ status: "ready" });
    }
  }

  private parseInfo(line: string) {
    const fen = this.activeFen;
    if (!fen) return;
    const depth = Number(/depth (\d+)/.exec(line)?.[1] ?? 0);
    const multipv = Number(/multipv (\d+)/.exec(line)?.[1] ?? 1);
    const nodes = Number(/nodes (\d+)/.exec(line)?.[1] ?? 0);
    const nps = Number(/nps (\d+)/.exec(line)?.[1] ?? 0);
    const mateMatch = /score mate (-?\d+)/.exec(line);
    const cpMatch = /score cp (-?\d+)/.exec(line);
    const pv = line.split(" pv ")[1]?.trim().split(/\s+/) ?? [];
    const turn = fen.split(" ")[1] === "b" ? -1 : 1;
    const entry: EngineLine = {
      multipv,
      depth,
      cp: cpMatch ? Number(cpMatch[1]) * turn : null,
      mate: mateMatch ? Number(mateMatch[1]) * turn : null,
      pv: uciMovesToSans(fen, pv),
    };
    const lines = this.snap.lines.filter((item) => item.multipv !== multipv);
    lines.push(entry);
    lines.sort((a, b) => a.multipv - b.multipv);
    this.emit({ status: "thinking", fen, depth, nodes, nps, lines });
  }

  analyze(fen: string, depth = 16) {
    this.halted = false;
    this.ensure();
    const same =
      this.depth === depth &&
      (this.pendingFen === fen || (this.activeFen === fen && (this.searching || this.snap.lines.length > 0)));
    if (same && this.snap.fen === fen && this.snap.status !== "error") return;
    this.depth = depth;
    this.pendingFen = fen;
    if (!this.ready) return;
    if (this.searching) {
      this.worker?.postMessage("stop");
      return;
    }
    this.kick();
  }

  deeper() {
    if (!this.activeFen) return;
    this.analyze(this.activeFen, 24);
  }

  halt() {
    this.halted = true;
    this.pendingFen = null;
    this.activeFen = null;
    if (this.searching) this.worker?.postMessage("stop");
    this.emit({ status: this.ready ? "ready" : this.snap.status, lines: [], depth: 0, fen: null });
  }

  private kick() {
    const fen = this.pendingFen;
    if (!fen || !this.worker || !this.ready) return;
    this.pendingFen = null;
    this.activeFen = fen;
    this.searching = true;
    this.emit({ status: "thinking", fen, depth: 0, nodes: 0, nps: 0, lines: [] });
    this.worker.postMessage(`position fen ${fen}`);
    this.worker.postMessage(`go depth ${this.depth}`);
  }
}

let client: StockfishClient | null = null;

export function getEngine(): StockfishClient {
  client ??= new StockfishClient();
  return client;
}
