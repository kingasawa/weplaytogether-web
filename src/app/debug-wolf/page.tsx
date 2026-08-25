import { WOLF_PHASE_LABELS } from "@/lib/wolf-game";
import WolfDebugNav from "../_debug/wolf-debug-nav";
import {
  buildDebugWolfState,
  DEBUG_WOLF_PHASES,
  normalizeDebugWolfPhase,
} from "../_debug/wolf-debug-state";
import { DEBUG_WOLF_RESULT_CASES, getDebugWolfResultCase } from "../_debug/wolf-result-cases";
import WolfPlayScreen from "../games/wolf/rooms/[roomId]/play/wolf-play-screen";

export const metadata = {
  robots: { index: false, follow: false },
  title: "Debug UI | Ma Sói Một Đêm",
};

type DebugWolfPageProps = {
  searchParams: Promise<{ phase?: string; case?: string }>;
};

export default async function DebugWolfPage({ searchParams }: DebugWolfPageProps) {
  const { case: resultCaseKey, phase } = await searchParams;
  const activePhase = normalizeDebugWolfPhase(phase);
  const activeCase = getDebugWolfResultCase(resultCaseKey);
  const isResultPhase = activePhase === "result";

  return (
    <>
      <WolfPlayScreen
        initialState={buildDebugWolfState(activePhase, activeCase.key)}
        isPreview
        key={`${activePhase}:${activeCase.key}`}
      />
      <WolfDebugNav
        title="Ma Sói Một Đêm"
        items={[
          ...DEBUG_WOLF_PHASES.map((wolfPhase) => ({
            href: `/debug-wolf?phase=${wolfPhase}`,
            label: WOLF_PHASE_LABELS[wolfPhase],
            isActive: wolfPhase === activePhase && !isResultPhase,
          })),
          ...DEBUG_WOLF_RESULT_CASES.map((resultCase) => ({
            href: `/debug-wolf?phase=result&case=${resultCase.key}`,
            label: `Kết quả · ${resultCase.label}`,
            isActive: isResultPhase && resultCase.key === activeCase.key,
          })),
        ]}
        otherGame={{ href: "/debug-wolf-classic", label: "→ Ma Sói Cổ Điển" }}
      />
    </>
  );
}
