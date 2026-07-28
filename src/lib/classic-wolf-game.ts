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

export const CLASSIC_WOLF_ROLE_DESCRIPTIONS: Record<ClassicWolfRole, string> = {
  villager: "Không có hành động ban đêm. Dùng thảo luận và bỏ phiếu để tìm Ma Sói.",
  werewolf: "Mỗi đêm chọn một người chơi còn sống để cắn. Nếu có nhiều Sói, mục tiêu được chọn nhiều nhất sẽ bị cắn.",
  seer: "Mỗi đêm soi một người chơi còn sống để biết họ là Ma Sói hay không.",
  witch: "Có một bình cứu và một bình độc. Mỗi bình chỉ dùng một lần trong cả ván.",
  guard: "Mỗi đêm chọn một người chơi còn sống để bảo vệ khỏi Sói cắn.",
  hunter: "Nếu chết, được bắn một người chơi còn sống trước khi ván tiếp tục.",
};
