import type { WolfGamePhase, WolfRole } from "@/lib/supabase/types";

export const WOLF_ROLE_LABELS: Record<WolfRole, string> = {
  werewolf: "Ma Sói",
  werewolf_seer: "Sói Tiên Tri",
  villager: "Dân Làng",
  seer: "Tiên Tri",
  robber: "Kẻ Trộm",
  troublemaker: "Kẻ Gây Rối",
  witch: "Phù Thuỷ",
  drunk: "Say Rượu",
  insomniac: "Mất Ngủ",
  copycat: "Copy Cat",
};

export const WOLF_ROLE_DESCRIPTIONS: Record<WolfRole, string> = {
  werewolf: "Tìm đồng đội Ma Sói. Nếu chỉ có một Ma Sói, có thể xem một lá giữa bàn.",
  werewolf_seer: "Thuộc phe Ma Sói và được soi một lá bài của người chơi.",
  villager: "Không có hành động ban đêm. Dùng thảo luận để tìm Ma Sói.",
  seer: "Xem bài của một người chơi hoặc hai lá giữa bàn.",
  robber: "Đổi bài của mình với một người chơi khác và biết lá vừa lấy.",
  troublemaker: "Đổi bài của hai người chơi khác nhau mà không xem bài.",
  witch: "Mở một lá giữa bàn và gán chức năng đó cho mình hoặc một người chơi khác.",
  drunk: "Đổi bài của mình với một lá giữa bàn nhưng không được xem lá mới.",
  insomniac: "Sau các hành động ban đêm, được biết lá bài hiện tại của mình.",
  copycat: "Chọn một lá giữa bàn rồi thực hiện ngay chức năng của role đó.",
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
