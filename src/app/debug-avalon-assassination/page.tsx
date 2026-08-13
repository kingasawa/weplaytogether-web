import { renderDebugAvalonPhase, type DebugAvalonPhasePageProps } from "../_debug/avalon-debug-page";

export default async function DebugAvalonAssassinationPage({ searchParams }: DebugAvalonPhasePageProps) {
  return renderDebugAvalonPhase("assassination", searchParams);
}
