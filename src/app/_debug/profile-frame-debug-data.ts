import { createSupabaseAdminClient } from "@/lib/supabase/server";
import type { ShopItemRow } from "@/lib/supabase/types";

export type DebugProfileFrameItem = Pick<
  ShopItemRow,
  "id" | "name" | "image_url" | "frame_color" | "price_coins" | "is_active" | "sort_order"
>;

export type DebugProfileFrameResult =
  | { items: DebugProfileFrameItem[]; error: null }
  | { items: null; error: string };

// Đọc thẳng mọi vật phẩm item_type=profile_frame bằng service role (bỏ qua RLS) để trang debug
// thấy được cả những khung admin đã ẩn (is_active=false) khỏi shop thật — mục đích của trang
// debug là xem TẤT CẢ khung đang có trong DB hiển thị ra sao, không phải mô phỏng trải nghiệm
// mua hàng của user thường.
export async function listAllProfileFrameShopItems(): Promise<DebugProfileFrameResult> {
  const supabase = createSupabaseAdminClient();

  const { data, error } = await supabase
    .from("shop_items")
    .select("id, name, image_url, frame_color, price_coins, is_active, sort_order")
    .eq("item_type", "profile_frame")
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false });

  if (error) {
    return { items: null, error: error.message };
  }

  return { items: (data ?? []) as DebugProfileFrameItem[], error: null };
}
