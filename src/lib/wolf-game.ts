import type { WolfGamePhase, WolfRole } from "@/lib/supabase/types";

export const WOLF_MAX_PLAYERS = 12;

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
  werewolf_seer:
    "Thuộc phe Ma Sói, thức dậy cùng bầy sói và được soi một lá bài của người chơi. Nếu là Ma Sói duy nhất, được xem thêm một lá giữa bàn.",
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

// src ở đây là FALLBACK khi bảng game_roles chưa có override (hoặc chưa apply migration) —
// dùng URL GCS bucket weplaytogether-uploads (đã upload qua scripts/upload-role-images.mjs)
// thay vì ảnh tĩnh trong public/, vì ảnh tĩnh gốc đã bị xoá khỏi source code (xem
// supabase/migrations/202609100001_game_roles.sql).
export const WOLF_ROLE_CARD_IMAGES: Partial<Record<WolfRole, { alt: string; src: string }>> = {
  werewolf: { alt: "Lá bài Ma Sói", src: "https://storage.googleapis.com/weplaytogether-uploads/roles/wolf/werewolf.webp" },
  werewolf_seer: { alt: "Lá bài Sói Tiên Tri", src: "https://storage.googleapis.com/weplaytogether-uploads/roles/wolf/werewolf_seer.webp" },
  villager: { alt: "Lá bài Dân Làng", src: "https://storage.googleapis.com/weplaytogether-uploads/roles/wolf/villager.webp" },
  seer: { alt: "Lá bài Tiên Tri", src: "https://storage.googleapis.com/weplaytogether-uploads/roles/wolf/seer.webp" },
  robber: { alt: "Lá bài Kẻ Trộm", src: "https://storage.googleapis.com/weplaytogether-uploads/roles/wolf/robber.webp" },
  troublemaker: { alt: "Lá bài Kẻ Gây Rối", src: "https://storage.googleapis.com/weplaytogether-uploads/roles/wolf/troublemaker.webp" },
  witch: { alt: "Lá bài Phù Thuỷ", src: "https://storage.googleapis.com/weplaytogether-uploads/roles/wolf/witch.webp" },
  drunk: { alt: "Lá bài Say Rượu", src: "https://storage.googleapis.com/weplaytogether-uploads/roles/wolf/drunk.webp" },
  insomniac: { alt: "Lá bài Mất Ngủ", src: "https://storage.googleapis.com/weplaytogether-uploads/roles/wolf/insomniac.webp" },
  doppelganger: { alt: "Lá bài Nhân Bản", src: "https://storage.googleapis.com/weplaytogether-uploads/roles/wolf/doppelganger.webp" },
  copycat: { alt: "Lá bài Copy Cat", src: "https://storage.googleapis.com/weplaytogether-uploads/roles/wolf/copycat.webp" },
};

export function getWolfRoleImagePath(role: WolfRole) {
  return WOLF_ROLE_CARD_IMAGES[role]?.src ?? null;
}
