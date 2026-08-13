import { renderDebugAvalonPhase, type DebugAvalonPhasePageProps } from "../_debug/avalon-debug-page";

export default async function DebugAvalonRoleRevealPage({ searchParams }: DebugAvalonPhasePageProps) {
  return renderDebugAvalonPhase("role_reveal", searchParams);
}
