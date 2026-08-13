import { renderDebugAvalonPhase, type DebugAvalonPhasePageProps } from "../_debug/avalon-debug-page";

export default async function DebugAvalonQuestRevealPage({ searchParams }: DebugAvalonPhasePageProps) {
  return renderDebugAvalonPhase("quest_reveal", searchParams);
}
