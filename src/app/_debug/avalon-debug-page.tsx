import type { AvalonPhase } from "@/lib/avalon-game";
import AvalonPlayScreen from "../games/avalon/rooms/[roomId]/play/avalon-play-screen";
import { buildDebugAvalonState } from "./avalon-debug-state";

export type DebugAvalonPhasePageProps = {
  searchParams: Promise<{
    role?: string;
  }>;
};

export async function renderDebugAvalonPhase(phase: AvalonPhase, searchParams: DebugAvalonPhasePageProps["searchParams"]) {
  const { role } = await searchParams;

  return <AvalonPlayScreen initialState={buildDebugAvalonState({ phase, role })} />;
}
