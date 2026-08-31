import type { SupabaseClient } from "@supabase/supabase-js";
import { optimizeShopItemImage, SHOP_ITEM_IMAGE_SOURCE_MAX_BYTES } from "@/lib/shop-item-image";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { isMissingFrameColorColumnError, isMissingTableError } from "@/lib/supabase/errors";
import type { ShopItemRow, ShopItemType } from "@/lib/supabase/types";

// Data layer cho trang /admin. Mọi thao tác ghi (insert/update/delete shop_items, update Xu
// user) chạy bằng JWT của chính admin đang đăng nhập — được RLS is_shop_admin() ở Postgres
// cho phép (xem supabase/migrations/202608260001_shop_items.sql). Không dùng service role ở
// đây vì trang admin gate bằng whitelist email, không phải server session.

const ADMIN_SHOP_ITEMS_COLUMNS =
  "id, item_type, name, description, price_coins, image_url, frame_color, is_active, sort_order, created_at, updated_at";

// Bản không có frame_color — dùng khi cột đó chưa được apply thủ công lên remote (xem
// listAllShopItems). Khai báo literal riêng (không .replace() runtime) để Supabase client vẫn
// suy được kiểu dữ liệu trả về từ chuỗi cột (cần string literal, không phải computed string).
const ADMIN_SHOP_ITEMS_COLUMNS_NO_FRAME_COLOR =
  "id, item_type, name, description, price_coins, image_url, is_active, sort_order, created_at, updated_at";

export type AdminResult<T> = { data: T; error: null } | { data: null; error: string };

function client() {
  return createSupabaseBrowserClient() as unknown as SupabaseClient;
}

const NOT_READY_ERROR = "Dữ liệu chưa được khởi tạo trên Supabase. Hãy chạy migration trước.";

export type ShopItemInput = {
  itemType: ShopItemType;
  name: string;
  description: string | null;
  priceCoins: number;
  imageUrl: string;
  // Chỉ có ý nghĩa với itemType=profile_frame (tô màu lớp kính bên trong khung) — null = dùng
  // màu mặc định --primary-light.
  frameColor: string | null;
  isActive: boolean;
  sortOrder: number;
};

// Nén ảnh ngay ở trình duyệt (bất kể định dạng gốc) rồi upload lên Google Cloud Storage qua route
// /api/admin/shop-items/image (route đó tự kiểm tra lại quyền admin bằng access token, vì
// đây là request tới API route chứ không phải Supabase nên không tự có RLS bảo vệ).
export async function uploadShopItemImage(itemType: ShopItemType, file: File): Promise<AdminResult<string>> {
  if (file.size > SHOP_ITEM_IMAGE_SOURCE_MAX_BYTES) {
    return { data: null, error: "Ảnh gốc quá lớn (tối đa 20MB)." };
  }

  const optimized = await optimizeShopItemImage(file, itemType);

  const supabase = client();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    return { data: null, error: "Phiên đăng nhập đã hết hạn. Vui lòng tải lại trang." };
  }

  const formData = new FormData();
  formData.append("file", optimized);
  formData.append("itemType", itemType);

  let response: Response;

  try {
    response = await fetch("/api/admin/shop-items/image", {
      method: "POST",
      headers: { Authorization: `Bearer ${session.access_token}` },
      body: formData,
    });
  } catch {
    return { data: null, error: "Không thể kết nối máy chủ. Vui lòng thử lại." };
  }

  const body = (await response.json().catch(() => null)) as { imageUrl?: string; error?: string } | null;

  if (!response.ok || !body?.imageUrl) {
    return { data: null, error: body?.error ?? "Tải ảnh lên thất bại." };
  }

  return { data: body.imageUrl, error: null };
}

// shop_items.frame_color (202608310001_shop_items_frame_color.sql) có thể chưa được apply thủ
// công lên remote — fallback về select không có cột đó (frame_color luôn null ở client) để
// KHÔNG làm gãy toàn bộ trang /admin/items (kể cả vật phẩm avatar_frame không liên quan) trong
// lúc chờ migration, giống idiom isMissingAvatarKeyColumnError ở actions.ts.
export async function listAllShopItems(): Promise<AdminResult<ShopItemRow[]>> {
  const { data, error } = await client()
    .from("shop_items")
    .select(ADMIN_SHOP_ITEMS_COLUMNS)
    .order("item_type", { ascending: true })
    .order("sort_order", { ascending: true });

  if (!error) {
    return { data: (data ?? []) as ShopItemRow[], error: null };
  }

  if (isMissingFrameColorColumnError(error)) {
    const fallback = await client()
      .from("shop_items")
      .select(ADMIN_SHOP_ITEMS_COLUMNS_NO_FRAME_COLOR)
      .order("item_type", { ascending: true })
      .order("sort_order", { ascending: true });

    if (fallback.error) {
      return { data: null, error: fallback.error.message };
    }

    const rows = (fallback.data ?? []).map((row) => ({ ...row, frame_color: null }));
    return { data: rows, error: null };
  }

  return { data: null, error: isMissingTableError(error, "shop_items") ? NOT_READY_ERROR : error.message };
}

export async function createShopItem(input: ShopItemInput): Promise<AdminResult<ShopItemRow>> {
  const { data, error } = await client()
    .from("shop_items")
    .insert({
      item_type: input.itemType,
      name: input.name,
      description: input.description,
      price_coins: input.priceCoins,
      image_url: input.imageUrl,
      frame_color: input.frameColor,
      is_active: input.isActive,
      sort_order: input.sortOrder,
    })
    .select(ADMIN_SHOP_ITEMS_COLUMNS)
    .single();

  if (error) {
    return { data: null, error: error.message };
  }

  return { data: data as ShopItemRow, error: null };
}

export async function updateShopItem(
  itemId: string,
  input: ShopItemInput
): Promise<AdminResult<ShopItemRow>> {
  const { data, error } = await client()
    .from("shop_items")
    .update({
      item_type: input.itemType,
      name: input.name,
      description: input.description,
      price_coins: input.priceCoins,
      image_url: input.imageUrl,
      frame_color: input.frameColor,
      is_active: input.isActive,
      sort_order: input.sortOrder,
    })
    .eq("id", itemId)
    .select(ADMIN_SHOP_ITEMS_COLUMNS)
    .single();

  if (error) {
    return { data: null, error: error.message };
  }

  return { data: data as ShopItemRow, error: null };
}

export async function deleteShopItem(itemId: string): Promise<AdminResult<null>> {
  const { error } = await client().from("shop_items").delete().eq("id", itemId);

  if (error) {
    return { data: null, error: error.message };
  }

  return { data: null, error: null };
}

export type AdminUserRow = {
  id: string;
  email: string | null;
  display_name: string | null;
  avatar_key: string;
  avatar_object_key: string | null;
  total_points: number;
  total_coins: number;
  created_at: string;
};

const ADMIN_USERS_COLUMNS =
  "id, email, display_name, avatar_key, avatar_object_key, total_points, total_coins, created_at";

export async function listUsers(search: string): Promise<AdminResult<AdminUserRow[]>> {
  let query = client()
    .from("users")
    .select(ADMIN_USERS_COLUMNS)
    .order("created_at", { ascending: false })
    .limit(100);

  // Bỏ ký tự đặc biệt của cú pháp .or() (PostgREST) và LIKE wildcard trước khi build filter,
  // tránh search text chứa dấu phẩy/ngoặc làm hỏng cú pháp filter.
  const normalizedSearch = search.trim().replace(/[,()%_]/g, "");

  if (normalizedSearch) {
    query = query.or(`display_name.ilike.%${normalizedSearch}%,email.ilike.%${normalizedSearch}%`);
  }

  const { data, error } = await query;

  if (error) {
    return { data: null, error: isMissingTableError(error, "users") ? NOT_READY_ERROR : error.message };
  }

  return { data: (data ?? []) as AdminUserRow[], error: null };
}

export async function setUserCoins(userId: string, totalCoins: number): Promise<AdminResult<null>> {
  const { error } = await client()
    .from("users")
    .update({ total_coins: Math.max(0, Math.trunc(totalCoins)) })
    .eq("id", userId);

  if (error) {
    return { data: null, error: error.message };
  }

  return { data: null, error: null };
}
