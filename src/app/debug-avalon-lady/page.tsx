import { renderDebugAvalonPhase, type DebugAvalonPhasePageProps } from "../_debug/avalon-debug-page";

export default async function DebugAvalonLadyPage({ searchParams }: DebugAvalonPhasePageProps) {
  return renderDebugAvalonPhase("lady", searchParams);
}
