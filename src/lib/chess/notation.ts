import type { EngineLine } from "./types";

export function formatEval(line: Pick<EngineLine, "cp" | "mate"> | null): string {
  if (!line) return "0.00";
  if (line.mate != null) {
    if (line.mate === 0) return "0.00";
    const sign = line.mate > 0 ? "+" : "−";
    return `${sign}M${Math.abs(line.mate)}`;
  }
  if (line.cp == null) return "0.00";
  const pawns = line.cp / 100;
  if (Math.abs(pawns) < 0.005) return "0.00";
  const sign = pawns > 0 ? "+" : "−";
  return `${sign}${Math.abs(pawns).toFixed(2)}`;
}

/** White's expected score, 0–1, from a white-relative eval. */
export function whiteShare(line: Pick<EngineLine, "cp" | "mate"> | null): number {
  if (!line) return 0.5;
  if (line.mate != null) return line.mate > 0 ? 1 : line.mate < 0 ? 0 : 0.5;
  if (line.cp == null) return 0.5;
  const cp = Math.max(-1000, Math.min(1000, line.cp));
  return 1 / (1 + Math.exp(-0.00368208 * cp));
}

export function formatPv(fen: string, sans: string[], limit = 10): string {
  const fields = fen.split(" ");
  let moveNo = Number(fields[5] ?? "1");
  if (!Number.isFinite(moveNo) || moveNo < 1) moveNo = 1;
  let blackToMove = fields[1] === "b";
  const parts: string[] = [];
  sans.slice(0, limit).forEach((san, index) => {
    if (!blackToMove) parts.push(`${moveNo}. ${san}`);
    else if (index === 0) parts.push(`${moveNo}... ${san}`);
    else parts.push(san);
    if (blackToMove) moveNo += 1;
    blackToMove = !blackToMove;
  });
  return parts.join(" ");
}
