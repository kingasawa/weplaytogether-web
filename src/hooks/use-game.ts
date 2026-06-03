import { useState } from "react";
import type { GameState } from "@/types";
import { initialGameState } from "@/store";

export function useGame() {
  const [game, setGame] = useState<GameState>(initialGameState);

  function startGame() {
    setGame((prev) => ({ ...prev, status: "playing" }));
  }

  function pauseGame() {
    setGame((prev) => ({ ...prev, status: "paused" }));
  }

  function resetGame() {
    setGame(initialGameState);
  }

  function nextTurn() {
    setGame((prev) => ({
      ...prev,
      currentPlayerIndex: (prev.currentPlayerIndex + 1) % prev.players.length,
    }));
  }

  return { game, startGame, pauseGame, resetGame, nextTurn };
}
