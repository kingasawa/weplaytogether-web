import type { Board, Cell, Position } from "@/types";
import { BOARD_COLS, BOARD_ROWS } from "./constants";

export function createEmptyBoard(
  rows = BOARD_ROWS,
  cols = BOARD_COLS
): Board {
  const cells: Cell[][] = Array.from({ length: rows }, (_, row) =>
    Array.from({ length: cols }, (_, col) => ({
      position: { row, col },
      piece: null,
      isHighlighted: false,
    }))
  );
  return { rows, cols, cells };
}

export function isValidPosition(pos: Position, board: Board): boolean {
  return (
    pos.row >= 0 &&
    pos.row < board.rows &&
    pos.col >= 0 &&
    pos.col < board.cols
  );
}

export function clsx(...classes: (string | undefined | null | false)[]): string {
  return classes.filter(Boolean).join(" ");
}

export function rollDice(sides = 6): number {
  return Math.floor(Math.random() * sides) + 1;
}

export function shuffleArray<T>(array: T[]): T[] {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
