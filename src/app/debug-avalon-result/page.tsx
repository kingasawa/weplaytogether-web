import { renderDebugAvalonPhase, type DebugAvalonPhasePageProps } from "../_debug/avalon-debug-page";

export default async function DebugAvalonResultPage({ searchParams }: DebugAvalonPhasePageProps) {
  return renderDebugAvalonPhase("result", searchParams);
}
