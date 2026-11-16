export type Side = "white" | "black";
export type Mode = "study" | "train" | "analyze";
export type TrainPhase = "you" | "them" | "miss" | "end";

export type BookNode = {
  id: string;
  san: string;
  uci: string;
  comment: string;
  children: BookNode[];
};

export type EngineLine = {
  multipv: number;
  depth: number;
  cp: number | null;
  mate: number | null;
  pv: string[];
};

export type EngineSnapshot = {
  status: "loading" | "ready" | "thinking" | "error";
  fen: string | null;
  depth: number;
  nodes: number;
  nps: number;
  lines: EngineLine[];
  error?: string;
};
