import { createContext, useContext } from "react";
import type { GameState } from "@/types";

export const initialGameState: GameState = {
  status: "idle",
  players: [],
  currentPlayerIndex: 0,
  round: 1,
  winner: null,
};

export const GameContext = createContext<GameState>(initialGameState);

export function useGameContext(): GameState {
  return useContext(GameContext);
}
