import { renderDebugAvalonPhase, type DebugAvalonPhasePageProps } from "../_debug/avalon-debug-page";

export default async function DebugAvalonTeamVotePage({ searchParams }: DebugAvalonPhasePageProps) {
  return renderDebugAvalonPhase("team_vote", searchParams);
}
