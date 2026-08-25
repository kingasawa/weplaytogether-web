import WolfDebugNav from "../_debug/wolf-debug-nav";
import {
  buildDebugClassicWolfState,
  DEBUG_CLASSIC_WOLF_VIEWS,
  normalizeDebugClassicWolfView,
  type DebugClassicWolfView,
} from "../_debug/wolf-classic-debug-state";
import ClassicWolfPlayScreen from "../games/wolf-classic/rooms/[roomId]/play/wolf-classic-play-screen";

export const metadata = {
  robots: { index: false, follow: false },
  title: "Debug UI | Ma Sói Cổ Điển",
};

const DEBUG_VIEW_LABELS: Record<DebugClassicWolfView, string> = {
  card_reveal: "Xem vai",
  night: "Ban đêm",
  night_review: "Thông báo ban đêm",
  day_review: "Kết quả bỏ phiếu",
  discussion: "Thảo luận",
  voting: "Bỏ phiếu",
  result: "Kết quả",
};

type DebugClassicWolfPageProps = {
  searchParams: Promise<{ phase?: string }>;
};

export default async function DebugClassicWolfPage({ searchParams }: DebugClassicWolfPageProps) {
  const { phase } = await searchParams;
  const activeView = normalizeDebugClassicWolfView(phase);

  return (
    <>
      <ClassicWolfPlayScreen
        initialState={buildDebugClassicWolfState(activeView)}
        isPreview
        key={activeView}
      />
      <WolfDebugNav
        title="Ma Sói Cổ Điển"
        items={DEBUG_CLASSIC_WOLF_VIEWS.map((view) => ({
          href: `/debug-wolf-classic?phase=${view}`,
          label: DEBUG_VIEW_LABELS[view],
          isActive: view === activeView,
        }))}
        otherGame={{ href: "/debug-wolf", label: "→ Ma Sói Một Đêm" }}
      />
    </>
  );
}
