import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { isMissingTableError } from "@/lib/supabase/errors";
import type { GameRoleKey, GameRoleRow } from "@/lib/game-roles";

// Lớp đọc/ghi cho /admin/game-roles. Ghi được chặn bằng RLS is_shop_admin() ở Postgres (xem
// supabase/migrations/202609100001_game_roles.sql) — trang admin chỉ gate UI bằng whitelist
// email, không phải lớp bảo mật thật sự, giống hệt pattern admin-shop.ts.
export type AdminGameRoleResult<T> = { data: T; error: null } | { data: null; error: string };

const NOT_READY_ERROR = "Dữ liệu role chưa được khởi tạo trên Supabase. Hãy chạy migration trước.";

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

export async function listAllGameRoles(): Promise<AdminGameRoleResult<GameRoleRow[]>> {
  const { data, error } = await client()
    .from("game_roles")
    .select("id, game_key, role_key, display_name_vi, display_name_en, image_url")
    .order("game_key", { ascending: true })
    .order("role_key", { ascending: true });

  if (error) {
    return { data: null, error: isMissingTableError(error, "game_roles") ? NOT_READY_ERROR : error.message };
  }

  return { data: ((data ?? []) as GameRoleDbRow[]).map(mapRow), error: null };
}

export type UpdateGameRoleInput = {
  displayNameVi: string;
  displayNameEn: string;
  imageUrl: string;
};

export async function updateGameRole(
  id: string,
  input: UpdateGameRoleInput
): Promise<AdminGameRoleResult<GameRoleRow>> {
  const { data, error } = await client()
    .from("game_roles")
    .update({
      display_name_vi: input.displayNameVi,
      display_name_en: input.displayNameEn,
      image_url: input.imageUrl,
    })
    .eq("id", id)
    .select("id, game_key, role_key, display_name_vi, display_name_en, image_url")
    .single();

  if (error) {
    return { data: null, error: error.message };
  }

  return { data: mapRow(data as GameRoleDbRow), error: null };
}
