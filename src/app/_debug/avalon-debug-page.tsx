import type { AvalonPhase } from "@/lib/avalon-game";
import AvalonPlayScreen from "../games/avalon/rooms/[roomId]/play/avalon-play-screen";
import { buildDebugAvalonState } from "./avalon-debug-state";

export type DebugAvalonPhasePageProps = {
  searchParams: Promise<{
    votes?: string;
    role?: string;
    playerId?: string;
    view?: string;
  }>;
};

export async function renderDebugAvalonPhase(phase: AvalonPhase, searchParams: DebugAvalonPhasePageProps["searchParams"]) {
  const { playerId, role, view, votes } = await searchParams;

  return <AvalonPlayScreen initialState={buildDebugAvalonState({ phase, playerId, role, view, votes })} />;
}
