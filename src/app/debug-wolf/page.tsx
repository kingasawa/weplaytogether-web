import { WOLF_PHASE_LABELS } from "@/lib/wolf-game";
import WolfDebugNav from "../_debug/wolf-debug-nav";
import {
  buildDebugWolfState,
  DEBUG_WOLF_PHASES,
  LONE_WEREWOLF_SEER_CASE_KEY,
  NIGHT_WAITING_OTHER_CASE_KEY,
  normalizeDebugWolfPhase,
  REMINDER_COPYCAT_TROUBLEMAKER_CASE_KEY,
  REMINDER_DOPPELGANGER_WITCH_CASE_KEY,
  REVIEW_ROBBER_CASE_KEY,
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

  // Case đặc biệt (ghi đè phase mặc định bằng ?case=) không thuộc bộ DEBUG_WOLF_RESULT_CASES —
  // dùng để loại các entry phase gốc khỏi trạng thái active khi đang đứng ở 1 case đặc biệt, xem
  // logic isActive bên dưới.
  const specialNightPhaseCaseKeys = [LONE_WEREWOLF_SEER_CASE_KEY, NIGHT_WAITING_OTHER_CASE_KEY];
  const specialDiscussionCaseKeys = [REMINDER_COPYCAT_TROUBLEMAKER_CASE_KEY, REMINDER_DOPPELGANGER_WITCH_CASE_KEY];
  const specialNightReviewCaseKeys = [REVIEW_ROBBER_CASE_KEY];

  return (
    <>
      <WolfPlayScreen
        initialState={buildDebugWolfState(activePhase, resultCaseKey ?? activeCase.key)}
        isPreview
        // resultCaseKey (không phải activeCase.key) để phase night/night_review đổi case (?case=...)
        // vẫn đổi key remount — activeCase luôn fallback về case result mặc định cho các phase này
        // (resultCaseKey không khớp key nào trong DEBUG_WOLF_RESULT_CASES) nên nếu dùng activeCase.key
        // ở đây, 2 URL khác case nhưng cùng phase sẽ ra cùng 1 key, React không remount, dễ giữ state cũ
        // khi chuyển trang bằng Link (client-side navigation).
        key={`${activePhase}:${resultCaseKey ?? activeCase.key}`}
      />
      <WolfDebugNav
        title="Ma Sói Một Đêm"
        items={[
          ...DEBUG_WOLF_PHASES.map((wolfPhase) => ({
            href: `/debug-wolf?phase=${wolfPhase}`,
            label: WOLF_PHASE_LABELS[wolfPhase],
            isActive:
              wolfPhase === activePhase &&
              !isResultPhase &&
              !(wolfPhase === "night" && specialNightPhaseCaseKeys.includes(resultCaseKey ?? "")) &&
              !(wolfPhase === "discussion" && specialDiscussionCaseKeys.includes(resultCaseKey ?? "")) &&
              !(wolfPhase === "night_review" && specialNightReviewCaseKeys.includes(resultCaseKey ?? "")),
          })),
          {
            href: `/debug-wolf?phase=night_review&case=${REVIEW_ROBBER_CASE_KEY}`,
            label: "Xem lại kết quả · Kẻ Trộm",
            isActive: activePhase === "night_review" && resultCaseKey === REVIEW_ROBBER_CASE_KEY,
          },
          {
            href: `/debug-wolf?phase=night&case=${LONE_WEREWOLF_SEER_CASE_KEY}`,
            label: "Ban đêm · Sói Tiên Tri đơn",
            isActive: activePhase === "night" && resultCaseKey === LONE_WEREWOLF_SEER_CASE_KEY,
          },
          {
            href: `/debug-wolf?phase=night&case=${NIGHT_WAITING_OTHER_CASE_KEY}`,
            label: "Ban đêm · Đang chờ người khác",
            isActive: activePhase === "night" && resultCaseKey === NIGHT_WAITING_OTHER_CASE_KEY,
          },
          {
            href: `/debug-wolf?phase=discussion&case=${REMINDER_COPYCAT_TROUBLEMAKER_CASE_KEY}`,
            label: "Xem lại đêm · Copy Cat → Kẻ Gây Rối",
            isActive: activePhase === "discussion" && resultCaseKey === REMINDER_COPYCAT_TROUBLEMAKER_CASE_KEY,
          },
          {
            href: `/debug-wolf?phase=discussion&case=${REMINDER_DOPPELGANGER_WITCH_CASE_KEY}`,
            label: "Xem lại đêm · Nhân Bản → Phù Thuỷ",
            isActive: activePhase === "discussion" && resultCaseKey === REMINDER_DOPPELGANGER_WITCH_CASE_KEY,
          },
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
