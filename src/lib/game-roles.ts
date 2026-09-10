import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { isMissingTableError } from "@/lib/supabase/errors";

// game_roles cho phép admin đổi tên hiển thị (theo ngôn ngữ) + ảnh lá bài của từng role qua
// /admin/game-roles thay vì sửa code (xem supabase/migrations/202609100001_game_roles.sql).
// File này là lớp đọc CÔNG KHAI (ai cũng đọc được qua RLS, kể cả guest) dùng trong game — lớp
// đọc/ghi cho admin nằm ở src/lib/admin-game-roles.ts.
export type GameRoleKey = "wolf" | "classic_wolf" | "avalon";

export type GameRoleRow = {
  id: string;
  gameKey: GameRoleKey;
  roleKey: string;
  displayNameVi: string;
  displayNameEn: string;
  imageUrl: string;
};

export type GameRoleResult<T> = { data: T; error: null } | { data: null; error: string };

function client() {
  return createSupabaseBrowserClient() as unknown as SupabaseClient;
}

type GameRoleDbRow = {
  id: string;
  game_key: GameRoleKey;
  role_key: string;
  display_name_vi: string;
  display_name_en: string;
  image_url: string;
};

function mapRow(row: GameRoleDbRow): GameRoleRow {
  return {
    id: row.id,
    gameKey: row.game_key,
    roleKey: row.role_key,
    displayNameVi: row.display_name_vi,
    displayNameEn: row.display_name_en,
    imageUrl: row.image_url,
  };
}

// Bảng game_roles có thể chưa được apply thủ công lên remote — trả về danh sách rỗng thay vì
// lỗi, để UI game vẫn chạy bình thường với tên/ảnh mặc định hardcode trong
// wolf-game.ts/classic-wolf-game.ts/avalon-game.ts (xem useGameRoleOverrides).
export async function listGameRoleOverrides(gameKey: GameRoleKey): Promise<GameRoleResult<GameRoleRow[]>> {
  const { data, error } = await client()
    .from("game_roles")
    .select("id, game_key, role_key, display_name_vi, display_name_en, image_url")
    .eq("game_key", gameKey);

  if (error) {
    if (isMissingTableError(error, "game_roles")) {
      return { data: [], error: null };
    }

    return { data: null, error: error.message };
  }

  return { data: ((data ?? []) as GameRoleDbRow[]).map(mapRow), error: null };
}
