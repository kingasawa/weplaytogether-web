import { renderDebugAvalonPhase, type DebugAvalonPhasePageProps } from "../_debug/avalon-debug-page";

export default async function DebugAvalonTeamProposalPage({ searchParams }: DebugAvalonPhasePageProps) {
  return renderDebugAvalonPhase("team_proposal", searchParams);
}
