import { useState } from "react";
import type { Board } from "@/types";
import { createEmptyBoard } from "@/lib/utils";

export function useBoard(rows?: number, cols?: number) {
  const [board, setBoard] = useState<Board>(() => createEmptyBoard(rows, cols));

  function resetBoard() {
    setBoard(createEmptyBoard(rows, cols));
  }

  return { board, setBoard, resetBoard };
}
