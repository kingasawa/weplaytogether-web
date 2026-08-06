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
  doppelganger: "Nhân Bản",
  copycat: "Copy Cat",
};

export const WOLF_ROLE_DESCRIPTIONS: Record<WolfRole, string> = {
  werewolf: "Tìm đồng đội Ma Sói. Nếu chỉ có một Ma Sói, có thể xem một lá giữa bàn.",
  werewolf_seer: "Thuộc phe Ma Sói và được soi một lá bài của người chơi.",
  villager: "Không có hành động ban đêm. Dùng thảo luận để tìm Ma Sói.",
  seer: "Chọn tối đa hai lá giữa bàn để biết từng lá là Sói hay không phải Sói. Nếu lá đầu là Sói, phải dừng lượt ngay.",
  robber: "Đổi bài của mình với một người chơi khác và biết lá vừa lấy.",
  troublemaker: "Đổi bài của hai người chơi khác nhau mà không xem bài.",
  witch: "Mở một lá giữa bàn rồi đổi lá đó với mình hoặc một người chơi khác.",
  drunk: "Đổi bài của mình với một lá giữa bàn nhưng không được xem lá mới.",
  insomniac: "Sau các hành động ban đêm, được biết lá bài hiện tại của mình.",
  doppelganger: "Đi đầu tiên, chọn một người chơi để nhân bản, xem chức năng của họ rồi thực hiện chức năng đó ngay.",
  copycat: "Chọn một lá giữa bàn rồi thực hiện chức năng của role đó theo đúng lượt trong đêm.",
};

export const WOLF_PHASE_LABELS: Record<WolfGamePhase, string> = {
  card_reveal: "Xem bài",
  night: "Ban đêm",
  night_review: "Xem lại kết quả",
  discussion: "Thảo luận",
  voting: "Bỏ phiếu",
  result: "Kết quả",
};

export const WOLF_ROLE_CARD_IMAGES: Partial<Record<WolfRole, { alt: string; src: string }>> = {
  werewolf: { alt: "Lá bài Ma Sói", src: "/images/boards/cards/wolf/wolf.png" },
  villager: { alt: "Lá bài Dân Làng", src: "/images/boards/cards/wolf/human.png" },
  seer: { alt: "Lá bài Tiên Tri", src: "/images/boards/cards/wolf/seer.png" },
  robber: { alt: "Lá bài Kẻ Trộm", src: "/images/boards/cards/wolf/robber.png" },
  troublemaker: { alt: "Lá bài Kẻ Gây Rối", src: "/images/boards/cards/wolf/troublemaker.png" },
  witch: { alt: "Lá bài Phù Thuỷ", src: "/images/boards/cards/wolf/witch.png" },
  doppelganger: { alt: "Lá bài Nhân Bản", src: "/images/boards/cards/wolf/doppelganger.png" },
  copycat: { alt: "Lá bài Copy Cat", src: "/images/boards/cards/wolf/copycat.png" },
};

export function getWolfRoleImagePath(role: WolfRole) {
  return WOLF_ROLE_CARD_IMAGES[role]?.src ?? null;
}
