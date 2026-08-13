import { renderDebugAvalonPhase, type DebugAvalonPhasePageProps } from "../_debug/avalon-debug-page";

export default async function DebugAvalonQuestPage({ searchParams }: DebugAvalonPhasePageProps) {
  return renderDebugAvalonPhase("quest", searchParams);
}
