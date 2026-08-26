import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { isMissingTableError } from "@/lib/supabase/errors";
import type { ShopItemRow, ShopItemType } from "@/lib/supabase/types";

// Data layer cho trang /admin. Mọi thao tác ghi (insert/update/delete shop_items, update Xu
// user) chạy bằng JWT của chính admin đang đăng nhập — được RLS is_shop_admin() ở Postgres
// cho phép (xem supabase/migrations/202608260001_shop_items.sql). Không dùng service role ở
// đây vì trang admin gate bằng whitelist email, không phải server session.

const ADMIN_SHOP_ITEMS_COLUMNS =
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
  isActive: boolean;
  sortOrder: number;
};

export async function listAllShopItems(): Promise<AdminResult<ShopItemRow[]>> {
  const { data, error } = await client()
    .from("shop_items")
    .select(ADMIN_SHOP_ITEMS_COLUMNS)
    .order("item_type", { ascending: true })
    .order("sort_order", { ascending: true });

  if (error) {
    return { data: null, error: isMissingTableError(error, "shop_items") ? NOT_READY_ERROR : error.message };
  }

  return { data: (data ?? []) as ShopItemRow[], error: null };
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
