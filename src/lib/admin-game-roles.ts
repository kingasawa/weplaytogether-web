import type { SupabaseClient } from "@supabase/supabase-js";
import { optimizeGameRoleImage, GAME_ROLE_IMAGE_SOURCE_MAX_BYTES } from "@/lib/game-role-image";
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

// Dùng cho màn hình sửa ở route riêng (/admin/game-roles/[id]) — trang đó chỉ nhận id qua URL
// nên phải tự fetch lại đúng row này khi mount, giống hệt getShopItemById.
export async function getGameRoleById(id: string): Promise<AdminGameRoleResult<GameRoleRow>> {
  const { data, error } = await client()
    .from("game_roles")
    .select("id, game_key, role_key, display_name_vi, display_name_en, image_url")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    return { data: null, error: isMissingTableError(error, "game_roles") ? NOT_READY_ERROR : error.message };
  }

  if (!data) {
    return { data: null, error: "Không tìm thấy role." };
  }

  return { data: mapRow(data as GameRoleDbRow), error: null };
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

export type GameRoleGalleryImage = { key: string; url: string; updatedAt: string | null };

// Gallery ảnh của 1 game (roles/<gameKey>/ trên GCS) — hiện ở /admin/game-roles/[id] để chọn ảnh
// có sẵn hoặc upload thêm. Đi qua route API riêng (không phải Supabase) vì list/upload GCS object
// cần chạy phía server (Application Default Credentials), xem
// src/app/api/admin/game-roles/gallery/route.ts.
export async function listGameRoleGallery(gameKey: GameRoleKey): Promise<AdminGameRoleResult<GameRoleGalleryImage[]>> {
  const supabase = client();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    return { data: null, error: "Phiên đăng nhập đã hết hạn. Vui lòng tải lại trang." };
  }

  let response: Response;

  try {
    response = await fetch(`/api/admin/game-roles/gallery?gameKey=${encodeURIComponent(gameKey)}`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
  } catch {
    return { data: null, error: "Không thể kết nối máy chủ. Vui lòng thử lại." };
  }

  const body = (await response.json().catch(() => null)) as
    | { images?: GameRoleGalleryImage[]; error?: string }
    | null;

  if (!response.ok || !body?.images) {
    return { data: null, error: body?.error ?? "Không thể tải gallery ảnh." };
  }

  return { data: body.images, error: null };
}

export async function uploadGameRoleGalleryImage(
  gameKey: GameRoleKey,
  file: File
): Promise<AdminGameRoleResult<GameRoleGalleryImage>> {
  if (file.size > GAME_ROLE_IMAGE_SOURCE_MAX_BYTES) {
    return { data: null, error: "Ảnh gốc quá lớn (tối đa 20MB)." };
  }

  const optimized = await optimizeGameRoleImage(file);

  const supabase = client();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    return { data: null, error: "Phiên đăng nhập đã hết hạn. Vui lòng tải lại trang." };
  }

  const formData = new FormData();
  formData.append("file", optimized);
  formData.append("gameKey", gameKey);

  let response: Response;

  try {
    response = await fetch("/api/admin/game-roles/gallery", {
      method: "POST",
      headers: { Authorization: `Bearer ${session.access_token}` },
      body: formData,
    });
  } catch {
    return { data: null, error: "Không thể kết nối máy chủ. Vui lòng thử lại." };
  }

  const body = (await response.json().catch(() => null)) as
    | { key?: string; url?: string; error?: string }
    | null;

  if (!response.ok || !body?.url || !body?.key) {
    return { data: null, error: body?.error ?? "Tải ảnh lên thất bại." };
  }

  return { data: { key: body.key, url: body.url, updatedAt: new Date().toISOString() }, error: null };
}

export type GameRoleImageUsage = { gameKey: GameRoleKey; roleKey: string; displayNameVi: string };

export type DeleteGameRoleImageResult =
  | { ok: true }
  | { ok: false; error: string; usedBy?: GameRoleImageUsage[] };

// Xoá 1 ảnh khỏi gallery — TRƯỚC KHI xoá, kiểm tra xem ảnh (theo imageUrl) có đang được gán cho
// role nào không, ở BẤT KỲ game nào (không chỉ game đang sửa), vì ảnh có thể dùng chung giữa các
// game (ví dụ Dân Làng của wolf và classic_wolf ban đầu trỏ cùng 1 file gốc). Nếu đang dùng, trả
// về danh sách role/game đang dùng và KHÔNG xoá.
export async function deleteGameRoleGalleryImage(
  imageKey: string,
  imageUrl: string
): Promise<DeleteGameRoleImageResult> {
  const supabase = client();

  const { data: usageRows, error: usageError } = await supabase
    .from("game_roles")
    .select("game_key, role_key, display_name_vi")
    .eq("image_url", imageUrl);

  if (usageError) {
    return {
      ok: false,
      error: isMissingTableError(usageError, "game_roles") ? NOT_READY_ERROR : usageError.message,
    };
  }

  const usedBy = (usageRows ?? []) as Array<{ game_key: GameRoleKey; role_key: string; display_name_vi: string }>;

  if (usedBy.length > 0) {
    return {
      ok: false,
      error: "Ảnh này đang được dùng cho role khác, không thể xoá.",
      usedBy: usedBy.map((row) => ({
        gameKey: row.game_key,
        roleKey: row.role_key,
        displayNameVi: row.display_name_vi,
      })),
    };
  }

  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    return { ok: false, error: "Phiên đăng nhập đã hết hạn. Vui lòng tải lại trang." };
  }

  let response: Response;

  try {
    response = await fetch("/api/admin/game-roles/gallery", {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ key: imageKey }),
    });
  } catch {
    return { ok: false, error: "Không thể kết nối máy chủ. Vui lòng thử lại." };
  }

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    return { ok: false, error: body?.error ?? "Xoá ảnh thất bại." };
  }

  return { ok: true };
}
