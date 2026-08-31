import type { createSupabaseAdminClient } from "@/lib/supabase/server";

// Khung thông tin mặc định hiển thị cho MỌI người chơi chưa trang bị khung nào — kể cả user đã
// đăng nhập chưa mua/trang bị khung lẫn guest (không có hàng trong public.users nên không có gì
// để tra "equipped"). Không bán trong shop (is_active=false), không qua cơ chế sở hữu/trang bị
// bình thường, chỉ tra theo tên. Nếu đổi tên vật phẩm này trong shop_items thì phải sửa hằng số
// này theo.
const DEFAULT_PROFILE_FRAME_NAME = "Khung Bạch Kim";

async function getDefaultProfileFrameUrl(
  supabase: ReturnType<typeof createSupabaseAdminClient>
): Promise<string | null> {
  const { data } = await supabase
    .from("shop_items")
    .select("image_url")
    .eq("item_type", "profile_frame")
    .eq("name", DEFAULT_PROFILE_FRAME_NAME)
    .maybeSingle();

  return (data as { image_url: string } | null)?.image_url ?? null;
}

export type EquippedFrameUrls = {
  avatarFrameUrl: string | null;
  profileFrameUrl: string | null;
  // true = user tự trang bị khung info đã mua/sở hữu; false = equipped_profile_frame_id null
  // (đang hiện khung mặc định qua defaultProfileFrameUrl).
  hasEquippedProfileFrame: boolean;
};

export type LivePlayerProfile = {
  displayName: string | null;
  avatarKey: string | null;
  avatarObjectKey: string | null;
  avatarFrameUrl: string | null;
  profileFrameUrl: string | null;
  hasEquippedProfileFrame: boolean;
};

export type EquippedFrameUrlsLookup = {
  byUserId: Map<string, EquippedFrameUrls>;
  // Khung thông tin mặc định — caller phải tự áp dụng cho CẢ user không có map entry (chưa từng
  // trang bị khung) LẪN guest (không có user_id nên không nằm trong map này).
  defaultProfileFrameUrl: string | null;
};

export type LivePlayerProfilesLookup = {
  byUserId: Map<string, LivePlayerProfile>;
  defaultProfileFrameUrl: string | null;
};

// Tra map user_id -> URL ảnh khung avatar + khung thông tin đang trang bị
// (users.equipped_avatar_frame_id / equipped_profile_frame_id -> shop_items.image_url), dùng
// service role nên bỏ qua RLS. Dùng ở các action lobby/spectator của cả 3 game (wolf,
// wolf-classic, avalon) để hiển thị khung cho MỌI người chơi trong phòng thấy, không chỉ
// chính chủ. Trả về map rỗng nếu lỗi (bảng/cột chưa tồn tại, user_id null...) để không làm
// hỏng lobby khi shop chưa được khởi tạo.
export async function getEquippedFrameUrlsByUserId(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  userIds: Array<string | null | undefined>
): Promise<EquippedFrameUrlsLookup> {
  const defaultProfileFrameUrl = await getDefaultProfileFrameUrl(supabase);
  const distinctUserIds = [...new Set(userIds.filter((id): id is string => Boolean(id)))];

  if (distinctUserIds.length === 0) {
    return { byUserId: new Map(), defaultProfileFrameUrl };
  }

  const { data: usersData, error: usersError } = await supabase
    .from("users")
    .select("id, equipped_avatar_frame_id, equipped_profile_frame_id")
    .in("id", distinctUserIds);

  if (usersError || !usersData) {
    return { byUserId: new Map(), defaultProfileFrameUrl };
  }

  const typedUsers = usersData as {
    id: string;
    equipped_avatar_frame_id: string | null;
    equipped_profile_frame_id: string | null;
  }[];

  const frameIds = [
    ...new Set(
      typedUsers.flatMap((row) => [row.equipped_avatar_frame_id, row.equipped_profile_frame_id]).filter((id): id is string => Boolean(id))
    ),
  ];

  let imageUrlByItemId = new Map<string, string>();

  if (frameIds.length > 0) {
    const { data: itemsData } = await supabase.from("shop_items").select("id, image_url").in("id", frameIds);
    imageUrlByItemId = new Map((itemsData ?? []).map((item) => [item.id as string, item.image_url as string]));
  }

  const byUserId = new Map<string, EquippedFrameUrls>();

  for (const row of typedUsers) {
    byUserId.set(row.id, {
      avatarFrameUrl: (row.equipped_avatar_frame_id && imageUrlByItemId.get(row.equipped_avatar_frame_id)) || null,
      profileFrameUrl: (row.equipped_profile_frame_id && imageUrlByItemId.get(row.equipped_profile_frame_id)) || null,
      hasEquippedProfileFrame: Boolean(row.equipped_profile_frame_id),
    });
  }

  return { byUserId, defaultProfileFrameUrl };
}

// Tra map user_id -> hồ sơ "live" (tên, avatar, khung) đọc thẳng từ public.users, dùng service
// role nên bỏ qua RLS. Dùng ở lobby/spectator của cả 3 game (wolf, wolf-classic, avalon) để tên
// và avatar trong phòng luôn đúng theo tài khoản hiện tại — thay vì tin vào bản snapshot lưu ở
// room_players.name/avatar_key lúc join (bản snapshot chỉ còn ý nghĩa cho guest, những
// người không có hàng nào trong users để tham chiếu). Trả về map rỗng nếu lỗi (bảng/cột chưa
// tồn tại, user_id null...) để lobby tự fallback về cột snapshot, không bị vỡ.
export async function getLivePlayerProfilesByUserId(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  userIds: Array<string | null | undefined>
): Promise<LivePlayerProfilesLookup> {
  const defaultProfileFrameUrl = await getDefaultProfileFrameUrl(supabase);
  const distinctUserIds = [...new Set(userIds.filter((id): id is string => Boolean(id)))];

  if (distinctUserIds.length === 0) {
    return { byUserId: new Map(), defaultProfileFrameUrl };
  }

  const { data: usersData, error: usersError } = await supabase
    .from("users")
    .select("id, display_name, avatar_key, avatar_object_key, equipped_avatar_frame_id, equipped_profile_frame_id")
    .in("id", distinctUserIds);

  if (usersError || !usersData) {
    return { byUserId: new Map(), defaultProfileFrameUrl };
  }

  const typedUsers = usersData as {
    id: string;
    display_name: string | null;
    avatar_key: string | null;
    avatar_object_key: string | null;
    equipped_avatar_frame_id: string | null;
    equipped_profile_frame_id: string | null;
  }[];

  const frameIds = [
    ...new Set(
      typedUsers.flatMap((row) => [row.equipped_avatar_frame_id, row.equipped_profile_frame_id]).filter((id): id is string => Boolean(id))
    ),
  ];

  let imageUrlByItemId = new Map<string, string>();

  if (frameIds.length > 0) {
    const { data: itemsData } = await supabase.from("shop_items").select("id, image_url").in("id", frameIds);
    imageUrlByItemId = new Map((itemsData ?? []).map((item) => [item.id as string, item.image_url as string]));
  }

  const byUserId = new Map<string, LivePlayerProfile>();

  for (const row of typedUsers) {
    const displayName = row.display_name?.trim() || null;

    byUserId.set(row.id, {
      displayName,
      avatarKey: row.avatar_key,
      avatarObjectKey: row.avatar_object_key,
      avatarFrameUrl: (row.equipped_avatar_frame_id && imageUrlByItemId.get(row.equipped_avatar_frame_id)) || null,
      profileFrameUrl: (row.equipped_profile_frame_id && imageUrlByItemId.get(row.equipped_profile_frame_id)) || null,
      hasEquippedProfileFrame: Boolean(row.equipped_profile_frame_id),
    });
  }

  return { byUserId, defaultProfileFrameUrl };
}
