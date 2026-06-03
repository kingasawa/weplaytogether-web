export type PlayerId = string;

export type Position = {
  row: number;
  col: number;
};

export type PlayerColor = "red" | "blue" | "green" | "yellow";

export type Player = {
  id: PlayerId;
  name: string;
  color: PlayerColor;
  score: number;
};

export type GameStatus = "idle" | "playing" | "paused" | "finished";

export type GameState = {
  status: GameStatus;
  players: Player[];
  currentPlayerIndex: number;
  round: number;
  winner: PlayerId | null;
};

export type Piece = {
  id: string;
  ownerId: PlayerId;
  position: Position;
};

export type Cell = {
  position: Position;
  piece: Piece | null;
  isHighlighted: boolean;
};

export type Board = {
  rows: number;
  cols: number;
  cells: Cell[][];
};
