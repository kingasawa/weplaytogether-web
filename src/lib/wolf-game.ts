import type { WolfGamePhase, WolfRole } from "@/lib/supabase/types";

export const WOLF_ROLE_LABELS: Record<WolfRole, string> = {
  werewolf: "Ma Sói",
  villager: "Dân Làng",
  seer: "Tiên Tri",
  robber: "Kẻ Trộm",
  troublemaker: "Kẻ Gây Rối",
  drunk: "Say Rượu",
  insomniac: "Mất Ngủ",
};

export const WOLF_ROLE_DESCRIPTIONS: Record<WolfRole, string> = {
  werewolf: "Tìm đồng đội Ma Sói. Nếu chỉ có một Ma Sói, có thể xem một lá giữa bàn.",
  villager: "Không có hành động ban đêm. Dùng thảo luận để tìm Ma Sói.",
  seer: "Xem bài của một người chơi hoặc hai lá giữa bàn.",
  robber: "Đổi bài của mình với một người chơi khác và biết lá vừa lấy.",
  troublemaker: "Đổi bài của hai người chơi khác nhau mà không xem bài.",
  drunk: "Đổi bài của mình với một lá giữa bàn nhưng không được xem lá mới.",
  insomniac: "Sau các hành động ban đêm, được biết lá bài hiện tại của mình.",
};

export const WOLF_PHASE_LABELS: Record<WolfGamePhase, string> = {
  card_reveal: "Xem bài",
  night: "Ban đêm",
  night_review: "Xem lại kết quả",
  discussion: "Thảo luận",
  voting: "Bỏ phiếu",
  result: "Kết quả",
};

export function getWolfRoleImagePath(role: WolfRole) {
  return `/images/ui/play-wolf/${role}.png`;
}
