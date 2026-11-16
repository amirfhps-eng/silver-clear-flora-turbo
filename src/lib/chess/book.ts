import { Chess, DEFAULT_POSITION, type Move } from "chess.js";
import type { BookNode, Side } from "./types";

export function uciOf(move: Pick<Move, "from" | "to" | "promotion">): string {
  return `${move.from}${move.to}${move.promotion ?? ""}`;
}

export function emptyNode(id: string): BookNode {
  return { id, san: "", uci: "", comment: "", children: [] };
}

export function newId(): string {
  return `n${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-4)}`;
}

export function nodeAt(root: BookNode, path: string[]): BookNode | null {
  if (!path.length || path[0] !== root.id) return null;
  let node = root;
  for (const id of path.slice(1)) {
    const child = node.children.find((item) => item.id === id);
    if (!child) return null;
    node = child;
  }
  return node;
}

export function pathOk(root: BookNode, path: string[] | undefined): path is string[] {
  return !!path && nodeAt(root, path) !== null;
}

export function replay(root: BookNode, path: string[]): Chess {
  const chess = new Chess();
  let node = root;
  for (const id of path.slice(1)) {
    const child = node.children.find((item) => item.id === id);
    if (!child) break;
    const played = chess.move(child.san);
    if (!played) break;
    node = child;
  }
  return chess;
}

export function isPlayerTurn(side: Side, ply: number): boolean {
  return side === "white" ? ply % 2 === 0 : ply % 2 === 1;
}

export function countMoves(node: BookNode): number {
  let total = 0;
  const walk = (current: BookNode) => {
    total += current.children.length;
    current.children.forEach(walk);
  };
  walk(node);
  return total;
}

export function yourTurnPaths(root: BookNode, side: Side): string[][] {
  const spots: string[][] = [];
  const walk = (node: BookNode, path: string[], ply: number) => {
    if (isPlayerTurn(side, ply) && node.children.length > 0) spots.push(path);
    node.children.forEach((child) => walk(child, [...path, child.id], ply + 1));
  };
  walk(root, [root.id], 0);
  return spots;
}

function mapAt(node: BookNode, id: string, fn: (node: BookNode) => BookNode): BookNode {
  if (node.id === id) return fn(node);
  let changed = false;
  const children = node.children.map((child) => {
    const next = mapAt(child, id, fn);
    if (next !== child) changed = true;
    return next;
  });
  return changed ? { ...node, children } : node;
}

export function appendMove(
  root: BookNode,
  path: string[],
  move: { san: string; uci: string },
  id: () => string = newId,
): { root: BookNode; path: string[] } {
  const parentId = path[path.length - 1];
  if (!parentId) return { root, path };
  let childId = "";
  const next = mapAt(root, parentId, (node) => {
    const existing = node.children.find((child) => child.san === move.san);
    if (existing) {
      childId = existing.id;
      return node;
    }
    const child: BookNode = {
      id: id(),
      san: move.san,
      uci: move.uci,
      comment: "",
      children: [],
    };
    childId = child.id;
    return { ...node, children: [...node.children, child] };
  });
  if (!childId) return { root, path };
  return { root: next, path: [...path, childId] };
}

export function graftSans(
  root: BookNode,
  path: string[],
  sans: string[],
  id: () => string = newId,
): { root: BookNode; path: string[] } {
  let chess = replay(root, path);
  let nextRoot = root;
  let nextPath = path;
  for (const san of sans) {
    const move = chess.move(san);
    if (!move) break;
    const grafted = appendMove(nextRoot, nextPath, { san: move.san, uci: uciOf(move) }, id);
    nextRoot = grafted.root;
    nextPath = grafted.path;
    chess = replay(nextRoot, nextPath);
  }
  return { root: nextRoot, path: nextPath };
}

export function setComment(root: BookNode, id: string, comment: string): BookNode {
  return mapAt(root, id, (node) => (node.comment === comment ? node : { ...node, comment }));
}

export function deleteNode(root: BookNode, id: string): BookNode {
  if (root.id === id) return root;
  let changed = false;
  const children = root.children
    .filter((child) => {
      if (child.id === id) {
        changed = true;
        return false;
      }
      return true;
    })
    .map((child) => {
      const next = deleteNode(child, id);
      if (next !== child) changed = true;
      return next;
    });
  return changed ? { ...root, children } : root;
}

export function promoteChild(root: BookNode, id: string): BookNode {
  const index = root.children.findIndex((child) => child.id === id);
  if (index === 0) return root;
  if (index > 0) {
    const children = [...root.children];
    const [child] = children.splice(index, 1);
    if (!child) return root;
    children.unshift(child);
    return { ...root, children };
  }
  let changed = false;
  const children = root.children.map((child) => {
    const next = promoteChild(child, id);
    if (next !== child) changed = true;
    return next;
  });
  return changed ? { ...root, children } : root;
}

/** Drop illegal stored moves so a bad import or old save cannot desync the board. */
export function scrub(root: BookNode): BookNode {
  const chess = new Chess();
  const walk = (node: BookNode): BookNode => {
    const children: BookNode[] = [];
    for (const child of node.children) {
      const snapshot = chess.fen();
      const move = chess.move(child.san);
      if (!move) continue;
      children.push({
        ...child,
        san: move.san,
        uci: uciOf(move),
        children: walk(child).children,
      });
      chess.load(snapshot);
    }
    return { ...node, children };
  };
  return walk(root);
}

export function mergeTrees(dest: BookNode, src: BookNode): BookNode {
  let children = dest.children;
  let changed = false;
  for (const incoming of src.children) {
    const index = children.findIndex((child) => child.san === incoming.san);
    if (index === -1) {
      children = [...children, incoming];
      changed = true;
      continue;
    }
    const current = children[index];
    if (!current) continue;
    const merged = mergeTrees(
      current.comment || !incoming.comment ? current : { ...current, comment: incoming.comment },
      incoming,
    );
    if (merged !== current) {
      children = children.map((child, childIndex) => (childIndex === index ? merged : child));
      changed = true;
    }
  }
  return changed ? { ...dest, children } : dest;
}

function tokenize(movetext: string): string[] {
  const tokens: string[] = [];
  const source = movetext.replace(/\uFEFF/g, "").replace(/;[^\n]*/g, "");
  let index = 0;
  while (index < source.length) {
    const char = source[index];
    if (char === " " || char === "\n" || char === "\t" || char === "\r") {
      index += 1;
      continue;
    }
    if (char === "{") {
      const end = source.indexOf("}", index);
      const stop = end === -1 ? source.length : end + 1;
      tokens.push(source.slice(index, stop));
      index = stop;
      continue;
    }
    if (char === "(" || char === ")") {
      tokens.push(char);
      index += 1;
      continue;
    }
    let end = index;
    while (end < source.length && !" \n\t\r(){}".includes(source[end] ?? "")) end += 1;
    tokens.push(source.slice(index, end));
    index = end;
  }
  return tokens;
}

function parseMovetext(movetext: string, id: () => string): BookNode {
  const tokens = tokenize(movetext);
  const root = emptyNode(id());
  const parents = new Map<BookNode, BookNode>();
  const chess = new Chess();

  const walk = (node: BookNode) => {
    while (tokens.length) {
      const token = tokens[0];
      if (token === ")") return;
      tokens.shift();
      if (!token) continue;
      if (token === "(") {
        const snapshot = chess.fen();
        const parent = parents.get(node);
        if (parent && chess.history().length > 0) {
          chess.undo();
          walk(parent);
        }
        if (tokens[0] === ")") tokens.shift();
        chess.load(snapshot);
        continue;
      }
      if (token.startsWith("{")) {
        const text = token.slice(1, -1).trim();
        if (text) node.comment = node.comment ? `${node.comment} ${text}` : text;
        continue;
      }
      if (
        /^\d+\.+$/.test(token) ||
        token === "*" ||
        token === "1-0" ||
        token === "0-1" ||
        token === "1/2-1/2" ||
        /^\$\d+$/.test(token)
      ) {
        continue;
      }
      const san = token.replace(/[!?]+$/g, "");
      const move = chess.move(san);
      if (!move) return;
      let child = node.children.find((item) => item.san === move.san);
      if (!child) {
        child = { id: id(), san: move.san, uci: uciOf(move), comment: "", children: [] };
        node.children.push(child);
      }
      parents.set(child, node);
      node = child;
    }
  };

  walk(root);
  return root;
}

function splitGames(pgn: string): string[] {
  const text = pgn.replace(/\uFEFF/g, "").replace(/\r/g, "").trim();
  if (!text) return [];
  const games: string[] = [];
  let current = "";
  let seenMove = false;
  for (const line of text.split("\n")) {
    const header = /^\s*\[/.test(line);
    if (header && seenMove) {
      games.push(current.trim());
      current = line;
      seenMove = false;
      continue;
    }
    current += (current ? "\n" : "") + line;
    if (!header && line.trim()) seenMove = true;
  }
  if (current.trim()) games.push(current.trim());
  return games;
}

function headerFen(game: string): { movetext: string; fen: string | null } {
  const fenMatch = game.match(/\[\s*FEN\s+"([^"]+)"\s*\]/i);
  const movetext = game.replace(/\[[^\]]*\]/g, " ").trim();
  return { movetext, fen: fenMatch?.[1] ?? null };
}

export function isInitialBoard(fen: string): boolean {
  return fen.split(" ")[0] === DEFAULT_POSITION.split(" ")[0];
}

export function importPgn(pgn: string, id: () => string = newId): { root: BookNode; warnings: string[] } {
  const root = emptyNode(id());
  const warnings: string[] = [];
  const games = splitGames(pgn);
  if (!games.length) return { root, warnings: ["That PGN was empty."] };
  let merged = root;
  let accepted = 0;
  for (const game of games) {
    const { movetext, fen } = headerFen(game);
    if (fen && !isInitialBoard(fen)) {
      warnings.push("Skipped a game that does not start from the initial position.");
      continue;
    }
    if (!/[NBRQKabcdefghO]/.test(movetext)) {
      warnings.push("Skipped a game with no moves.");
      continue;
    }
    const parsed = parseMovetext(movetext, id);
    if (!parsed.children.length) {
      warnings.push("Could not read a game in that PGN.");
      continue;
    }
    merged = mergeTrees(merged, parsed);
    accepted += 1;
  }
  if (!accepted) warnings.unshift("Nothing was imported.");
  return { root: scrub(merged), warnings };
}

function movePrefix(fen: string, color: "w" | "b"): string {
  let moveNo = Number(fen.split(" ")[5] ?? "1");
  if (!Number.isFinite(moveNo) || moveNo < 1) moveNo = 1;
  if (color === "b") moveNo -= 1;
  return color === "w" ? `${moveNo}. ` : `${moveNo}... `;
}

function writeBranch(node: BookNode, chess: Chess): string {
  const main = node.children[0];
  if (!main) return "";
  const before = chess.fen();
  const move = chess.move(main.san);
  if (!move) {
    chess.load(before);
    return "";
  }
  let text = `${movePrefix(chess.fen(), move.color)}${main.san}`;
  if (main.comment.trim()) text += ` {${main.comment.trim()}}`;
  const after = chess.fen();

  const variations: string[] = [];
  for (const alt of node.children.slice(1)) {
    chess.load(before);
    const altMove = chess.move(alt.san);
    if (!altMove) continue;
    let altText = `${movePrefix(chess.fen(), altMove.color)}${alt.san}`;
    if (alt.comment.trim()) altText += ` {${alt.comment.trim()}}`;
    const altRest = writeBranch(alt, chess);
    if (altRest) altText += ` ${altRest}`;
    variations.push(`(${altText})`);
  }

  chess.load(after);
  const rest = writeBranch(main, chess);
  chess.load(before);
  return [text, ...variations, rest].filter(Boolean).join(" ");
}

export function exportPgn(root: BookNode, side: Side): string {
  const chess = new Chess();
  const body = writeBranch(root, chess).trim();
  const white = side === "white" ? "Me" : "Opponent";
  const black = side === "black" ? "Me" : "Opponent";
  return [
    `[Event "Linebook repertoire"]`,
    `[Site "Linebook"]`,
    `[White "${white}"]`,
    `[Black "${black}"]`,
    `[Result "*"]`,
    ``,
    `${body || "*"} *`,
    ``,
  ].join("\n");
}

type SeedLine = { sans: string[]; notes: Record<number, string> };

const WHITE_LINES: SeedLine[] = [
  {
    sans: ["e4", "e5", "Nf3", "Nc6", "Bc4", "Bc5", "c3", "Nf6", "d3", "d6"],
    notes: {
      0: "King's pawn. Everything in this book starts here.",
      4: "Italian Game. Develop the bishop before opening the center.",
      6: "c3 prepares d4 and gives the bishop a retreat.",
      8: "Quiet Italian. This is the tabiya to remember.",
    },
  },
  {
    sans: ["e4", "e5", "Nf3", "Nc6", "Bc4", "Nf6", "d3"],
    notes: {
      5: "Two Knights. Black attacks e4 instead of copying with Bc5.",
      6: "d3 keeps the center closed and steps off the pin.",
    },
  },
  {
    sans: ["e4", "c5", "Nf3", "d6", "d4", "cxd4", "Nxd4", "Nf6", "Nc3", "a6"],
    notes: {
      1: "Sicilian. Be ready for this reply as well as e5.",
      9: "Najdorf tabiya. Choose a setup (Be2, Be3, or Bg5) from here.",
    },
  },
];

const BLACK_LINES: SeedLine[] = [
  {
    sans: ["e4", "c6", "d4", "d5", "Nc3", "dxe4", "Nxe4", "Bf5", "Ng3", "Bg6"],
    notes: {
      1: "Caro-Kann. Solid, and less theory than a main-line Sicilian.",
      7: "Classical. Develop the bishop before Ng3 kicks it.",
      9: "Bg6 is the main retreat. The book continues from here.",
    },
  },
  {
    sans: ["d4", "d5", "c4", "c6", "Nf3", "Nf6", "Nc3"],
    notes: {
      0: "Against the queen's pawn, answer with the Slav.",
      3: "c6 supports d5. This is the move order to memorize.",
    },
  },
];

function buildSide(lines: SeedLine[], intro: string, id: () => string): BookNode {
  let root = emptyNode(id());
  root = { ...root, comment: intro };
  for (const line of lines) {
    const grafted = graftSans(root, [root.id], line.sans, id);
    root = grafted.root;
    for (const [ply, note] of Object.entries(line.notes)) {
      const nodeId = grafted.path[Number(ply) + 1];
      if (nodeId && note) root = setComment(root, nodeId, note);
    }
  }
  return root;
}

export function seedBook(): { white: BookNode; black: BookNode } {
  let n = 0;
  const id = () => `seed${++n}`;
  return {
    white: buildSide(
      WHITE_LINES,
      "White repertoire. Record your move orders, including the replies you want to face.",
      id,
    ),
    black: buildSide(
      BLACK_LINES,
      "Black repertoire. The first moves are the ones you are willing to answer.",
      id,
    ),
  };
}

export function sansAlong(root: BookNode, path: string[]): string[] {
  const sans: string[] = [];
  let node = root;
  for (const id of path.slice(1)) {
    const child = node.children.find((item) => item.id === id);
    if (!child) break;
    sans.push(child.san);
    node = child;
  }
  return sans;
}
