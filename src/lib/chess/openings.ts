import { Chess } from "chess.js";
import rows from "@/data/openings.json";

export type OpeningHit = {
  eco: string;
  name: string;
  /** True when this exact position is the named one, not an ancestor. */
  exact: boolean;
};

type Entry = { eco: string; name: string };

const index = new Map<string, Entry>();
for (const row of rows as [string, string, string][]) {
  index.set(row[0], { eco: row[1], name: row[2] });
}

/** EPD with the en-passant square cleared unless a capture is actually legal. */
export function epd(fen: string): string {
  const [board, turn, castle, ep] = fen.split(" ");
  let epField = ep || "-";
  if (epField !== "-") {
    try {
      const chess = new Chess(fen);
      const legal = chess.moves({ verbose: true }).some((move) => move.flags.includes("e"));
      if (!legal) epField = "-";
    } catch {
      epField = "-";
    }
  }
  return `${board} ${turn} ${castle} ${epField}`;
}

export function identifyFen(fen: string): OpeningHit | null {
  let probe: Chess;
  try {
    probe = new Chess(fen);
  } catch {
    return null;
  }
  let steps = 0;
  while (true) {
    const hit = index.get(epd(probe.fen()));
    if (hit) return { eco: hit.eco, name: hit.name, exact: steps === 0 };
    if (probe.history().length === 0) return null;
    probe.undo();
    steps += 1;
  }
}

export function splitOpeningName(name: string): { family: string; variation: string } {
  const colon = name.indexOf(": ");
  if (colon === -1) return { family: name, variation: "" };
  return { family: name.slice(0, colon), variation: name.slice(colon + 2) };
}

export const OPENING_COUNT = index.size;
