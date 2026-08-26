import type { SupabaseClient } from "@supabase/supabase-js";
import { isMissingTableError } from "@/lib/supabase/errors";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import type { ShopItemRow, ShopItemType, UserShopItemRow } from "@/lib/supabase/types";

const SHOP_ITEMS_COLUMNS =
  "id, item_type, name, description, price_coins, image_url, is_active, sort_order, created_at, updated_at";

export type ShopItem = ShopItemRow;

export type ShopResult<T> = { data: T; error: null } | { data: null; error: string };

export const SHOP_ITEM_TYPE_LABELS: Record<ShopItemType, string> = {
  avatar_frame: "Khung Avatar",
  profile_frame: "Khung Thông Tin",
};

const SHOP_NOT_READY_MESSAGE =
  "Cửa hàng chưa sẵn sàng (dữ liệu shop chưa được khởi tạo). Vui lòng thử lại sau.";

function client() {
  return createSupabaseBrowserClient() as unknown as SupabaseClient;
}

// Danh sách vật phẩm đang mở bán, hiển thị trên trang shop. RLS chỉ trả về is_active = true
// cho user thường (admin thấy cả vật phẩm đã ẩn).
export async function listShopItems(itemType?: ShopItemType): Promise<ShopResult<ShopItem[]>> {
  let query = client()
    .from("shop_items")
    .select(SHOP_ITEMS_COLUMNS)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false });

  if (itemType) {
    query = query.eq("item_type", itemType);
  }

  const { data, error } = await query;

  if (error) {
    if (isMissingTableError(error, "shop_items")) {
      return { data: null, error: SHOP_NOT_READY_MESSAGE };
    }

    return { data: null, error: error.message };
  }

  return { data: (data ?? []) as ShopItem[], error: null };
}

// Các vật phẩm user hiện tại đã mua (chỉ đọc được hàng của chính mình qua RLS).
export async function listMyShopItemIds(): Promise<ShopResult<Set<string>>> {
  const { data, error } = await client().from("user_shop_items").select("item_id");

  if (error) {
    if (isMissingTableError(error, "user_shop_items")) {
      return { data: new Set(), error: null };
    }

    return { data: null, error: error.message };
  }

  return {
    data: new Set(((data ?? []) as Pick<UserShopItemRow, "item_id">[]).map((row) => row.item_id)),
    error: null,
  };
}

export type MyOwnedShopItem = {
  itemId: string;
  itemType: ShopItemType;
  name: string;
  imageUrl: string;
};

// Vật phẩm user hiện tại đã sở hữu, kèm chi tiết (tên/ảnh/loại) — dùng cho box "Khung" ở
// trang Hồ sơ. Join qua quan hệ FK user_shop_items.item_id -> shop_items.id nên trả về được
// cả vật phẩm admin đã ẩn khỏi shop (is_active=false) miễn user đã sở hữu từ trước.
export async function listMyOwnedShopItems(): Promise<ShopResult<MyOwnedShopItem[]>> {
  const { data, error } = await client()
    .from("user_shop_items")
    .select("item_id, shop_items(id, item_type, name, image_url)")
    .order("purchased_at", { ascending: true });

  if (error) {
    if (isMissingTableError(error, "user_shop_items")) {
      return { data: [], error: null };
    }

    return { data: null, error: error.message };
  }

  type OwnedRow = {
    item_id: string;
    shop_items: { id: string; item_type: ShopItemType; name: string; image_url: string } | null;
  };

  const items = ((data ?? []) as unknown as OwnedRow[])
    .filter((row) => row.shop_items)
    .map((row) => ({
      itemId: row.shop_items!.id,
      itemType: row.shop_items!.item_type,
      name: row.shop_items!.name,
      imageUrl: row.shop_items!.image_url,
    }));

  return { data: items, error: null };
}

export type MyShopProfile = {
  userId: string;
  totalCoins: number;
  equippedAvatarFrameId: string | null;
  equippedProfileFrameId: string | null;
};

// Hồ sơ rút gọn phục vụ trang shop: Xu hiện có + vật phẩm đang trang bị. Trả về null nếu
// chưa đăng nhập (RLS chỉ cho đọc hàng của chính mình nên không cần lọc thêm ở client).
export async function getMyShopProfile(): Promise<ShopResult<MyShopProfile | null>> {
  const supabase = client();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    return { data: null, error: null };
  }

  const { data, error } = await supabase
    .from("users")
    .select("id, total_coins, equipped_avatar_frame_id, equipped_profile_frame_id")
    .eq("id", session.user.id)
    .maybeSingle();

  if (error) {
    if (isMissingTableError(error, "users")) {
      return { data: null, error: SHOP_NOT_READY_MESSAGE };
    }

    return { data: null, error: error.message };
  }

  if (!data) {
    return { data: null, error: null };
  }

  return {
    data: {
      userId: data.id,
      totalCoins: data.total_coins ?? 0,
      equippedAvatarFrameId: data.equipped_avatar_frame_id ?? null,
      equippedProfileFrameId: data.equipped_profile_frame_id ?? null,
    },
    error: null,
  };
}

// Mua vật phẩm: gọi RPC purchase_shop_item(...) (security definer) để trừ Xu + ghi kho trong
// 1 transaction ở Postgres — không cho client tự trừ Xu / tự insert kho để chống gian lận.
export async function purchaseShopItem(itemId: string): Promise<ShopResult<{ remainingCoins: number }>> {
  const { data, error } = await client().rpc("purchase_shop_item", { p_item_id: itemId });

  if (error) {
    return { data: null, error: mapPurchaseError(error.message) };
  }

  const remainingCoins = typeof data?.remaining_coins === "number" ? data.remaining_coins : 0;

  return { data: { remainingCoins }, error: null };
}

function mapPurchaseError(message: string) {
  if (message.includes("insufficient_coins")) {
    return "Bạn không đủ Xu để mua vật phẩm này.";
  }

  if (message.includes("item_already_owned")) {
    return "Bạn đã sở hữu vật phẩm này rồi.";
  }

  if (message.includes("item_not_available")) {
    return "Vật phẩm này hiện không còn mở bán.";
  }

  if (message.includes("not_authenticated")) {
    return "Vui lòng đăng nhập để mua vật phẩm.";
  }

  return "Không thể mua vật phẩm. Vui lòng thử lại.";
}

// Trang bị (hoặc gỡ, truyền itemId = null) một khung. Trigger enforce_equipped_shop_items ở
// Postgres sẽ chặn nếu vật phẩm không đúng loại hoặc chưa sở hữu.
export async function equipShopItem(
  itemType: ShopItemType,
  itemId: string | null,
  userId: string
): Promise<ShopResult<null>> {
  const column = itemType === "avatar_frame" ? "equipped_avatar_frame_id" : "equipped_profile_frame_id";

  const { error } = await client()
    .from("users")
    .update({ [column]: itemId })
    .eq("id", userId);

  if (error) {
    return { data: null, error: "Không thể trang bị vật phẩm. Vui lòng thử lại." };
  }

  return { data: null, error: null };
}
