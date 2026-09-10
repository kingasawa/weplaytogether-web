export type ClassicWolfRole = "villager" | "werewolf" | "seer" | "witch" | "guard" | "hunter";
export type ClassicWolfTeam = "villagers" | "werewolves";

export const CLASSIC_WOLF_ROLE_LABELS: Record<ClassicWolfRole, string> = {
  villager: "Dân Làng",
  werewolf: "Ma Sói",
  seer: "Tiên Tri",
  witch: "Phù Thuỷ",
  guard: "Bảo Vệ",
  hunter: "Thợ Săn",
};

// src ở đây là FALLBACK khi bảng game_roles chưa có override — xem ghi chú ở
// WOLF_ROLE_CARD_IMAGES trong wolf-game.ts, cùng bucket GCS nhưng object riêng theo
// game_key="classic_wolf" (không dùng chung object với wolf dù nội dung ảnh gốc giống nhau).
export const CLASSIC_WOLF_ROLE_CARD_IMAGES: Record<ClassicWolfRole, { alt: string; src: string }> = {
  villager: { alt: "Lá bài Dân Làng", src: "https://storage.googleapis.com/weplaytogether-uploads/roles/classic_wolf/villager.webp" },
  werewolf: { alt: "Lá bài Ma Sói", src: "https://storage.googleapis.com/weplaytogether-uploads/roles/classic_wolf/werewolf.webp" },
  seer: { alt: "Lá bài Tiên Tri", src: "https://storage.googleapis.com/weplaytogether-uploads/roles/classic_wolf/seer.webp" },
  witch: { alt: "Lá bài Phù Thuỷ", src: "https://storage.googleapis.com/weplaytogether-uploads/roles/classic_wolf/witch.webp" },
  guard: { alt: "Lá bài Bảo Vệ", src: "https://storage.googleapis.com/weplaytogether-uploads/roles/classic_wolf/guard.webp" },
  hunter: { alt: "Lá bài Thợ Săn", src: "https://storage.googleapis.com/weplaytogether-uploads/roles/classic_wolf/hunter.webp" },
};

export function getClassicWolfRoleImagePath(role: ClassicWolfRole) {
  return CLASSIC_WOLF_ROLE_CARD_IMAGES[role].src;
}

export const CLASSIC_WOLF_ROLE_DESCRIPTIONS: Record<ClassicWolfRole, string> = {
  villager: "Không có hành động ban đêm. Dùng thảo luận và bỏ phiếu để tìm Ma Sói.",
  werewolf: "Mỗi đêm chọn một người chơi còn sống để cắn. Nếu có nhiều Sói, mục tiêu được chọn nhiều nhất sẽ bị cắn.",
  seer: "Mỗi đêm soi một người chơi còn sống để biết họ là Ma Sói hay không.",
  witch: "Có một bình cứu và một bình độc. Mỗi bình chỉ dùng một lần trong cả ván.",
  guard: "Mỗi đêm chọn một người chơi còn sống để bảo vệ khỏi Sói cắn.",
  hunter: "Mỗi đêm chọn một người còn sống. Nếu Thợ Săn bị Sói cắn chết trong đêm hoặc bị vote chết ngày hôm sau, người đã chọn sẽ chết theo.",
};
